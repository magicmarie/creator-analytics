import { db } from '../db/pool';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import type { Platform } from '../types';

/**
 * Content Service
 *
 * Handles content-related queries across all platforms
 */

interface Content {
  id: string;
  creator_id: string;
  platform: Platform;
  platform_content_id: string;
  title: string;
  url: string;
  published_at: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnail_url: string | null;
  ingested_at: Date;
  creator?: {
    handle: string;
    name: string;
    avatar_url: string | null;
  };
}

interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * List recent content across all creators
 * Optionally filter by platform
 */
export async function listContent(
  platform?: Platform,
  pagination: PaginationParams = { page: 1, limit: 20 }
): Promise<{ data: Content[]; total: number; page: number; limit: number; pages: number }> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const cacheKey = `content:list:${platform || 'all'}:${page}:${limit}`;
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
        'handle', cr.handle,
        'name', cr.name,
        'avatar_url', cr.avatar_url
      ) as creator
    FROM content c
    JOIN creators cr ON c.creator_id = cr.id
  `;

  const params: any[] = [];
  if (platform) {
    query += ` WHERE c.platform = $1`;
    params.push(platform);
  }

  query += ` ORDER BY c.published_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM content';
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
    data: dataResult.rows as Content[],
    total,
    page,
    limit,
    pages,
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, JSON.stringify(result), 300);

  return result;
}
