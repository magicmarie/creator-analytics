import axios from 'axios';
import { randomUUID } from 'crypto';
import { db } from '../db/pool';
import { calculateEngagementRate } from '../utils/metrics';
import { retryWithBackoff } from '../utils/retry';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import type { IngestionResult } from '../types';

/**
 * YouTube Data API v3 Integration
 *
 * Fetches channel statistics and recent videos
 * Calculates engagement metrics from raw API data
 */

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      high?: { url: string };
    };
  };
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
    };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

/**
 * Fetch channel data from YouTube API
 * Protected by circuit breaker to prevent cascading failures
 */
const fetchChannelsBreaker = createCircuitBreaker(
  async (channelIds: string[]) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY not configured');
    }

    return await retryWithBackoff(
      () =>
        axios.get(`${BASE_URL}/channels`, {
          params: {
            key: apiKey,
            id: channelIds.join(','),
            part: 'snippet,statistics',
            maxResults: 50,
          },
          timeout: 10000,
        }),
      { maxRetries: 3, initialDelay: 1000 }
    );
  },
  { name: 'youtube-channels', errorThresholdPercentage: 50, resetTimeout: 60000 }
);

/**
 * Fetch recent videos for a channel
 */
async function fetchRecentVideos(channelId: string, maxResults = 10): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    // Get video IDs
    const searchRes = await axios.get(`${BASE_URL}/search`, {
      params: {
        key: apiKey,
        channelId,
        part: 'id',
        order: 'date',
        maxResults,
        type: 'video',
      },
      timeout: 10000,
    });

    const videoIds = searchRes.data.items?.map((item: any) => item.id.videoId) || [];
    if (videoIds.length === 0) return [];

    // Get video statistics
    const videosRes = await axios.get(`${BASE_URL}/videos`, {
      params: {
        key: apiKey,
        id: videoIds.join(','),
        part: 'snippet,statistics',
      },
      timeout: 10000,
    });

    return videosRes.data.items || [];
  } catch (err) {
    logger.warn({ channelId, error: err }, 'Failed to fetch recent videos');
    return [];
  }
}

/**
 * Main YouTube ingestion function
 * Fetches all tracked YouTube creators and updates database
 */
export async function ingestYouTube(): Promise<IngestionResult> {
  const start = Date.now();
  const result: IngestionResult = {
    platform: 'youtube',
    creators_upserted: 0,
    snapshots_written: 0,
    content_upserted: 0,
    errors: [],
    duration_ms: 0,
  };

  try {
    // Fetch tracked YouTube creators from database
    const { rows: trackedCreators } = await db.query<{
      platform_id: string;
      handle: string;
    }>(
      `SELECT platform_id, handle
       FROM tracked_creators
       WHERE platform = 'youtube' AND enabled = true`
    );

    if (trackedCreators.length === 0) {
      logger.info('No tracked YouTube creators found');
      result.duration_ms = Date.now() - start;
      return result;
    }

    const channelIds = trackedCreators.map((c) => c.platform_id);
    logger.info({ count: channelIds.length }, 'Fetching YouTube channels');

    // Fetch channel data with circuit breaker protection
    const response = await fetchChannelsBreaker.fire(channelIds);
    const channels: YouTubeChannel[] = response.data.items || [];

    logger.info({ fetched: channels.length }, 'YouTube channels fetched');

    // Process each channel
    for (const channel of channels) {
      const creatorId = `yt-${channel.id}`;
      const handle =
        trackedCreators.find((c) => c.platform_id === channel.id)?.handle || channel.id;

      try {
        // Upsert creator
        await db.query(
          `INSERT INTO creators (id, platform, handle, name, description, avatar_url, profile_url, updated_at)
           VALUES ($1, 'youtube', $2, $3, $4, $5, $6, now())
           ON CONFLICT (platform, handle)
           DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = now()`,
          [
            creatorId,
            handle,
            channel.snippet.title,
            channel.snippet.description?.slice(0, 500) || null,
            channel.snippet.thumbnails?.high?.url || null,
            `https://youtube.com/channel/${channel.id}`,
          ]
        );
        result.creators_upserted++;

        // Fetch recent videos to calculate engagement
        const recentVideos = await fetchRecentVideos(channel.id, 10);

        const engagementRate = calculateEngagementRate(
          recentVideos.map((v) => ({
            views: parseInt(v.statistics.viewCount) || 0,
            likes: parseInt(v.statistics.likeCount) || 0,
            comments: parseInt(v.statistics.commentCount) || 0,
          }))
        );

        // Insert snapshot
        await db.query(
          `INSERT INTO creator_snapshots
           (id, creator_id, captured_at, followers, post_count, engagement_rate, total_views)
           VALUES ($1, $2, now(), $3, $4, $5, $6)
           ON CONFLICT (creator_id, captured_at) DO NOTHING`,
          [
            randomUUID(),
            creatorId,
            parseInt(channel.statistics.subscriberCount) || 0,
            parseInt(channel.statistics.videoCount) || 0,
            engagementRate,
            parseInt(channel.statistics.viewCount) || 0,
          ]
        );
        result.snapshots_written++;

        logger.debug(
          { creatorId, handle, subscribers: channel.statistics.subscriberCount },
          'YouTube creator processed'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${handle}: ${msg}`);
        logger.error({ creatorId, handle, error: msg }, 'Failed to process YouTube creator');
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fatal: ${msg}`);
    logger.error({ error: msg }, 'YouTube ingestion failed');
  }

  result.duration_ms = Date.now() - start;
  logger.info(
    {
      platform: 'youtube',
      creators: result.creators_upserted,
      snapshots: result.snapshots_written,
      errors: result.errors.length,
      duration: result.duration_ms,
    },
    'YouTube ingestion complete'
  );

  return result;
}
