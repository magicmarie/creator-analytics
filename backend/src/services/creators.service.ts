import { db } from '../db/pool';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import type { Platform } from '../types';

/**
 * Creators Service
 *
 * Handles all creator-related database queries with:
 * - Redis caching for performance
 * - Pagination support
 * - Platform filtering
 * - Date range queries
 */

interface Creator {
  id: string;
  platform: Platform;
  handle: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  profile_url: string;
  created_at: Date;
  updated_at: Date;
  latest_snapshot?: {
    followers: number;
    following: number | null;
    post_count: number;
    engagement_rate: number;
    total_views: bigint | null;
    captured_at: Date;
  };
}

interface CreatorSnapshot {
  id: string;
  creator_id: string;
  captured_at: Date;
  followers: number;
  following: number | null;
  post_count: number;
  engagement_rate: number;
  total_views: bigint | null;
}

interface PaginationParams {
  page: number;
  limit: number;
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

  // If explicit dates provided, use those
  if (params.start_date && params.end_date) {
    return {
      start: new Date(params.start_date),
      end: new Date(params.end_date),
    };
  }

  // Otherwise use period
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
      start = null; // No start date = all time
      break;
  }

  return { start, end };
}

/**
 * List all creators with optional platform filter and pagination
 */
export async function listCreators(
  platform?: Platform,
  pagination: PaginationParams = { page: 1, limit: 20 }
): Promise<{ data: Creator[]; total: number; page: number; limit: number; pages: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const cacheKey = `creators:list:${platform || 'all'}:${page}:${limit}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  // Build query
  let query = `
    SELECT
      c.*,
      json_build_object(
        'followers', s.followers,
        'following', s.following,
        'post_count', s.post_count,
        'engagement_rate', s.engagement_rate,
        'total_views', s.total_views,
        'captured_at', s.captured_at
      ) as latest_snapshot
    FROM creators c
    LEFT JOIN LATERAL (
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

  query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM creators';
  const countParams: any[] = [];
  if (platform) {
    countQuery += ' WHERE platform = $1';
    countParams.push(platform);
  }

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, countParams),
  ]);

  const total = parseInt(countResult.rows[0]?.total || '0', 10);
  const pages = Math.ceil(total / limit);

  const result = {
    data: dataResult.rows as Creator[],
    total,
    page,
    limit,
    pages,
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, JSON.stringify(result), 300);

  return result;
}

/**
 * Get a single creator by ID with latest snapshot
 */
export async function getCreatorById(id: string): Promise<Creator | null> {
  const cacheKey = `creator:${id}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  const query = `
    SELECT
      c.*,
      json_build_object(
        'followers', s.followers,
        'following', s.following,
        'post_count', s.post_count,
        'engagement_rate', s.engagement_rate,
        'total_views', s.total_views,
        'captured_at', s.captured_at
      ) as latest_snapshot
    FROM creators c
    LEFT JOIN LATERAL (
      SELECT * FROM creator_snapshots
      WHERE creator_id = c.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) s ON true
    WHERE c.id = $1
  `;

  const result = await db.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const creator = result.rows[0] as Creator;

  // Cache for 5 minutes
  await cache.set(cacheKey, JSON.stringify(creator), 300);

  return creator;
}

/**
 * Get creator snapshots with date range filtering
 */
export async function getCreatorSnapshots(
  creatorId: string,
  dateRange: DateRangeParams = {}
): Promise<CreatorSnapshot[]> {
  const { start, end } = parseDateRange(dateRange);

  const cacheKey = `creator:${creatorId}:snapshots:${dateRange.period || 'custom'}:${start?.toISOString() || 'null'}:${end?.toISOString() || 'null'}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  let query = `
    SELECT *
    FROM creator_snapshots
    WHERE creator_id = $1
  `;

  const params: any[] = [creatorId];

  if (start) {
    query += ` AND captured_at >= $${params.length + 1}`;
    params.push(start);
  }

  if (end) {
    query += ` AND captured_at <= $${params.length + 1}`;
    params.push(end);
  }

  query += ` ORDER BY captured_at ASC`;

  const result = await db.query(query, params);
  const snapshots = result.rows as CreatorSnapshot[];

  // Cache for 10 minutes
  await cache.set(cacheKey, JSON.stringify(snapshots), 600);

  return snapshots;
}

/**
 * Get content for a specific creator
 */
export async function getCreatorContent(
  creatorId: string,
  pagination: PaginationParams = { page: 1, limit: 20 }
): Promise<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const cacheKey = `creator:${creatorId}:content:${page}:${limit}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  const query = `
    SELECT *
    FROM content
    WHERE creator_id = $1
    ORDER BY published_at DESC
    LIMIT $2 OFFSET $3
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM content
    WHERE creator_id = $1
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, [creatorId, limit, offset]),
    db.query(countQuery, [creatorId]),
  ]);

  const total = parseInt(countResult.rows[0]?.total || '0', 10);
  const pages = Math.ceil(total / limit);

  const result = {
    data: dataResult.rows as Creator[],
    total,
    page,
    limit,
    pages,
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, JSON.stringify(result), 300);

  return result;
}
