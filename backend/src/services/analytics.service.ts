import { db } from '../db/pool';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import type { Platform } from '../types';

/**
 * Analytics Service
 *
 * Provides aggregated analytics and insights:
 * - Top creators leaderboards
 * - Growth tracking
 * - Platform comparisons
 * - Engagement trends
 */

interface TopCreator {
  id: string;
  platform: Platform;
  handle: string;
  name: string;
  avatar_url: string | null;
  followers: number;
  engagement_rate: number;
  post_count: number;
  rank: number;
}

interface GrowthCreator {
  id: string;
  platform: Platform;
  handle: string;
  name: string;
  avatar_url: string | null;
  followers_start: number;
  followers_end: number;
  growth_absolute: number;
  growth_percent: number;
  rank: number;
}

interface PlatformStats {
  platform: Platform;
  total_creators: number;
  total_content: number;
  avg_followers: number;
  avg_engagement_rate: number;
  total_views: bigint | null;
}

interface EngagementTrend {
  date: string;
  avg_engagement_rate: number;
  total_content: number;
}

interface DateRangeParams {
  period?: '7d' | '30d' | '90d' | '1y' | 'all';
  start_date?: string;
  end_date?: string;
}

/**
 * Parse date range into start/end dates
 */
function parseDateRange(params: DateRangeParams): { start: Date | null; end: Date | null } {
  const now = new Date();

  if (params.start_date && params.end_date) {
    return {
      start: new Date(params.start_date),
      end: new Date(params.end_date),
    };
  }

  const period = params.period || '30d';
  const end = now;
  let start: Date | null = null;

  switch (period) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      start = null;
      break;
  }

  return { start, end };
}

/**
 * Get top creators leaderboard
 * Sort by: followers | engagement | growth
 */
export async function getTopCreators(
  sortBy: 'followers' | 'engagement' = 'followers',
  limit: number = 20,
  platform?: Platform
): Promise<TopCreator[]> {
  const cacheKey = `analytics:top:${sortBy}:${platform || 'all'}:${limit}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  const orderBy = sortBy === 'followers' ? 's.followers' : 's.engagement_rate';

  let query = `
    SELECT
      c.id,
      c.platform,
      c.handle,
      c.name,
      c.avatar_url,
      s.followers,
      s.engagement_rate,
      s.post_count,
      ROW_NUMBER() OVER (ORDER BY ${orderBy} DESC) as rank
    FROM creators c
    JOIN LATERAL (
      SELECT * FROM creator_snapshots
      WHERE creator_id = c.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) s ON true
  `;

  const params: any[] = [];
  if (platform) {
    query += ` WHERE c.platform = $1`;
    params.push(platform);
  }

  query += ` ORDER BY ${orderBy} DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  const creators = result.rows as TopCreator[];

  // Cache for 10 minutes
  await cache.set(cacheKey, JSON.stringify(creators), 600);

  return creators;
}

/**
 * Get fastest growing creators
 * Compares first and last snapshot in date range
 */
export async function getGrowthCreators(
  dateRange: DateRangeParams = { period: '30d' },
  limit: number = 20,
  platform?: Platform
): Promise<GrowthCreator[]> {
  const { start, end } = parseDateRange(dateRange);

  const cacheKey = `analytics:growth:${dateRange.period || 'custom'}:${platform || 'all'}:${limit}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  let query = `
    WITH first_snapshots AS (
      SELECT DISTINCT ON (creator_id)
        creator_id,
        followers as followers_start,
        captured_at
      FROM creator_snapshots
      WHERE captured_at >= $1
      ORDER BY creator_id, captured_at ASC
    ),
    last_snapshots AS (
      SELECT DISTINCT ON (creator_id)
        creator_id,
        followers as followers_end,
        captured_at
      FROM creator_snapshots
      WHERE captured_at <= $2
      ORDER BY creator_id, captured_at DESC
    )
    SELECT
      c.id,
      c.platform,
      c.handle,
      c.name,
      c.avatar_url,
      f.followers_start,
      l.followers_end,
      (l.followers_end - f.followers_start) as growth_absolute,
      CASE
        WHEN f.followers_start > 0 THEN
          ROUND(((l.followers_end::numeric - f.followers_start::numeric) / f.followers_start::numeric * 100)::numeric, 2)
        ELSE 0
      END as growth_percent,
      ROW_NUMBER() OVER (ORDER BY (l.followers_end - f.followers_start) DESC) as rank
    FROM creators c
    JOIN first_snapshots f ON c.id = f.creator_id
    JOIN last_snapshots l ON c.id = l.creator_id
    WHERE l.followers_end > f.followers_start
  `;

  const params: any[] = [start || new Date('2000-01-01'), end || new Date()];

  if (platform) {
    query += ` AND c.platform = $3`;
    params.push(platform);
  }

  query += ` ORDER BY growth_absolute DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  const creators = result.rows as GrowthCreator[];

  // Cache for 10 minutes
  await cache.set(cacheKey, JSON.stringify(creators), 600);

  return creators;
}

/**
 * Get platform comparison stats
 */
export async function getPlatformStats(): Promise<PlatformStats[]> {
  const cacheKey = 'analytics:platforms';
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  const query = `
    SELECT
      c.platform,
      COUNT(DISTINCT c.id) as total_creators,
      COUNT(DISTINCT ct.id) as total_content,
      COALESCE(ROUND(AVG(s.followers)), 0) as avg_followers,
      COALESCE(ROUND(AVG(s.engagement_rate)::numeric, 4), 0) as avg_engagement_rate,
      SUM(s.total_views) as total_views
    FROM creators c
    LEFT JOIN LATERAL (
      SELECT * FROM creator_snapshots
      WHERE creator_id = c.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN content ct ON c.id = ct.creator_id
    GROUP BY c.platform
    ORDER BY total_creators DESC
  `;

  const result = await db.query(query);
  const stats = result.rows as PlatformStats[];

  // Cache for 15 minutes
  await cache.set(cacheKey, JSON.stringify(stats), 900);

  return stats;
}

/**
 * Get engagement trends over time
 * Aggregates engagement by day
 */
export async function getEngagementTrends(
  dateRange: DateRangeParams = { period: '30d' },
  platform?: Platform
): Promise<EngagementTrend[]> {
  const { start, end } = parseDateRange(dateRange);

  const cacheKey = `analytics:trends:${dateRange.period || 'custom'}:${platform || 'all'}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  let query = `
    SELECT
      DATE(captured_at) as date,
      ROUND(AVG(engagement_rate)::numeric, 4) as avg_engagement_rate,
      COUNT(*) as total_content
    FROM creator_snapshots cs
    JOIN creators c ON cs.creator_id = c.id
    WHERE captured_at >= $1 AND captured_at <= $2
  `;

  const params: any[] = [start || new Date('2000-01-01'), end || new Date()];

  if (platform) {
    query += ` AND c.platform = $3`;
    params.push(platform);
  }

  query += ` GROUP BY DATE(captured_at) ORDER BY date ASC`;

  const result = await db.query(query, params);
  const trends = result.rows as EngagementTrend[];

  // Cache for 10 minutes
  await cache.set(cacheKey, JSON.stringify(trends), 600);

  return trends;
}
