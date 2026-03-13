import { db } from '../db/pool';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { queueAllPlatforms } from '../queue/ingestion';
import type { Platform } from '../types';
import { randomBytes } from 'crypto';

/**
 * Admin Service
 *
 * Handles administrative operations:
 * - Managing tracked creators
 * - Triggering manual ingestion
 * - System status checks
 */

interface TrackedCreator {
  id: string;
  platform: Platform;
  platform_id: string;
  handle: string;
  enabled: boolean;
  added_at: Date;
}

interface IngestionStatus {
  last_run: Date | null;
  next_scheduled: string;
  tracked_creators_count: number;
  total_creators_count: number;
}

/**
 * List all tracked creators
 */
export async function listTrackedCreators(platform?: Platform): Promise<TrackedCreator[]> {
  let query = 'SELECT * FROM tracked_creators';
  const params: any[] = [];

  if (platform) {
    query += ' WHERE platform = $1';
    params.push(platform);
  }

  query += ' ORDER BY added_at DESC';

  const result = await db.query(query, params);
  return result.rows as TrackedCreator[];
}

/**
 * Add a new creator to track
 */
export async function addTrackedCreator(
  platform: Platform,
  platform_id: string,
  handle: string
): Promise<TrackedCreator> {
  const id = randomBytes(16).toString('hex');

  const query = `
    INSERT INTO tracked_creators (id, platform, platform_id, handle, enabled)
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT (platform, platform_id) DO UPDATE
    SET handle = EXCLUDED.handle, enabled = true
    RETURNING *
  `;

  const result = await db.query(query, [id, platform, platform_id, handle]);

  logger.info({ platform, handle, platform_id }, 'Added tracked creator');

  // Invalidate cache
  await cache.del('admin:tracked-creators');

  return result.rows[0] as TrackedCreator;
}

/**
 * Remove a tracked creator (soft delete by disabling)
 */
export async function removeTrackedCreator(id: string): Promise<boolean> {
  const query = 'UPDATE tracked_creators SET enabled = false WHERE id = $1 RETURNING *';
  const result = await db.query(query, [id]);

  if (result.rows.length === 0) {
    return false;
  }

  logger.info({ id, handle: result.rows[0]?.handle }, 'Disabled tracked creator');

  // Invalidate cache
  await cache.del('admin:tracked-creators');

  return true;
}

/**
 * Get ingestion status and statistics
 */
export async function getIngestionStatus(): Promise<IngestionStatus> {
  // Get last ingestion run from creator snapshots
  const lastRunQuery = `
    SELECT MAX(captured_at) as last_run
    FROM creator_snapshots
  `;

  const trackedCountQuery = `
    SELECT COUNT(*) as count
    FROM tracked_creators
    WHERE enabled = true
  `;

  const totalCountQuery = `
    SELECT COUNT(*) as count
    FROM creators
  `;

  const [lastRunResult, trackedResult, totalResult] = await Promise.all([
    db.query(lastRunQuery),
    db.query(trackedCountQuery),
    db.query(totalCountQuery),
  ]);

  return {
    last_run: lastRunResult.rows[0]?.last_run || null,
    next_scheduled: 'Every 12 hours (cron: 0 */12 * * *)',
    tracked_creators_count: parseInt(trackedResult.rows[0]?.count || '0', 10),
    total_creators_count: parseInt(totalResult.rows[0]?.count || '0', 10),
  };
}

/**
 * Trigger manual ingestion (via queue)
 */
export async function triggerIngestion(): Promise<{ jobId: string; status: string }> {
  logger.info('Manual ingestion triggered via admin API');

  const job = await queueAllPlatforms();

  return {
    jobId: job.id!,
    status: 'queued',
  };
}
