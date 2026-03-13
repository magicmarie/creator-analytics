import axios from 'axios';
import { randomUUID } from 'crypto';
import { db } from '../db/pool';
import { calculateEngagementRate } from '../utils/metrics';
import { retryWithBackoff } from '../utils/retry';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import type { IngestionResult } from '../types';

/**
 * GitHub REST API Integration
 *
 * Fetches user profile and repository statistics
 * Calculates engagement based on stars, forks, and issues
 */

const BASE_URL = 'https://api.github.com';

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  html_url: string;
  followers: number;
  following: number;
  public_repos: number;
}

interface GitHubRepo {
  name: string;
  html_url: string;
  description: string | null;
  created_at: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
}

/**
 * Fetch GitHub user data
 * Protected by circuit breaker
 */
const fetchUserBreaker = createCircuitBreaker(
  async (username: string) => {
    const token = process.env.GITHUB_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    return await retryWithBackoff(
      () =>
        axios.get(`${BASE_URL}/users/${username}`, {
          headers,
          timeout: 10000,
        }),
      { maxRetries: 3, initialDelay: 1000 }
    );
  },
  { name: 'github-user', errorThresholdPercentage: 50, resetTimeout: 60000 }
);

/**
 * Fetch user's recent repositories
 */
async function fetchRecentRepos(username: string, maxResults = 10): Promise<GitHubRepo[]> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await axios.get(`${BASE_URL}/users/${username}/repos`, {
      headers,
      params: {
        sort: 'updated',
        direction: 'desc',
        per_page: maxResults,
      },
      timeout: 10000,
    });

    return response.data || [];
  } catch (err) {
    logger.warn({ username, error: err }, 'Failed to fetch GitHub repos');
    return [];
  }
}

/**
 * Main GitHub ingestion function
 */
export async function ingestGitHub(): Promise<IngestionResult> {
  const start = Date.now();
  const result: IngestionResult = {
    platform: 'github',
    creators_upserted: 0,
    snapshots_written: 0,
    content_upserted: 0,
    errors: [],
    duration_ms: 0,
  };

  try {
    // Fetch tracked GitHub users from database
    const { rows: trackedCreators } = await db.query<{
      platform_id: string;
      handle: string;
    }>(
      `SELECT platform_id, handle
       FROM tracked_creators
       WHERE platform = 'github' AND enabled = true`
    );

    if (trackedCreators.length === 0) {
      logger.info('No tracked GitHub creators found');
      result.duration_ms = Date.now() - start;
      return result;
    }

    logger.info({ count: trackedCreators.length }, 'Fetching GitHub users');

    // Process each user
    for (const tracked of trackedCreators) {
      const username = tracked.platform_id;
      const creatorId = `gh-${username}`;

      try {
        // Fetch user data
        const userResponse = await fetchUserBreaker.fire(username);
        const user: GitHubUser = userResponse.data;

        // Upsert creator
        await db.query(
          `INSERT INTO creators (id, platform, handle, name, description, avatar_url, profile_url, updated_at)
           VALUES ($1, 'github', $2, $3, $4, $5, $6, now())
           ON CONFLICT (platform, handle)
           DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = now()`,
          [
            creatorId,
            user.login,
            user.name || user.login,
            user.bio?.slice(0, 500) || null,
            user.avatar_url,
            user.html_url,
          ]
        );
        result.creators_upserted++;

        // Fetch recent repos to calculate engagement
        const recentRepos = await fetchRecentRepos(username, 10);

        // For GitHub, engagement = (stars + forks) / watchers
        const engagementRate = calculateEngagementRate(
          recentRepos.map((repo) => ({
            views: repo.watchers_count || 1, // Use watchers as "views"
            likes: repo.stargazers_count || 0, // Stars as "likes"
            comments: repo.forks_count || 0, // Forks as "comments"
          }))
        );

        // Insert snapshot
        await db.query(
          `INSERT INTO creator_snapshots
           (id, creator_id, captured_at, followers, following, post_count, engagement_rate)
           VALUES ($1, $2, now(), $3, $4, $5, $6)
           ON CONFLICT (creator_id, captured_at) DO NOTHING`,
          [randomUUID(), creatorId, user.followers, user.following, user.public_repos, engagementRate]
        );
        result.snapshots_written++;

        logger.debug(
          { creatorId, username, followers: user.followers },
          'GitHub creator processed'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${username}: ${msg}`);
        logger.error({ creatorId, username, error: msg }, 'Failed to process GitHub creator');
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fatal: ${msg}`);
    logger.error({ error: msg }, 'GitHub ingestion failed');
  }

  result.duration_ms = Date.now() - start;
  logger.info(
    {
      platform: 'github',
      creators: result.creators_upserted,
      snapshots: result.snapshots_written,
      errors: result.errors.length,
      duration: result.duration_ms,
    },
    'GitHub ingestion complete'
  );

  return result;
}
