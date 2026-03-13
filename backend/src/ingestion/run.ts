import 'dotenv/config';
import cron from 'node-cron';
import { ingestYouTube } from './youtube';
import { ingestGitHub } from './github';
import { logger } from '../utils/logger';
import type { IngestionResult } from '../types';

/**
 * Ingestion Runner & Scheduler
 *
 * Runs platform ingestion manually or on a schedule
 * - Manual: npm run ingest
 * - Scheduled: Automatically runs every 12 hours when server starts
 */

/**
 * Platform ingestors
 * Add new platforms here
 */
const platformIngestors = [ingestYouTube, ingestGitHub];

/**
 * Run ingestion for all platforms
 */
export async function runIngestion(): Promise<IngestionResult[]> {
  logger.info('[INGESTION] Starting ingestion run...');

  const results = await Promise.allSettled(platformIngestors.map((fn) => fn()));

  const output: IngestionResult[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const res = r.value;
      output.push(res);

      logger.info(
        {
          platform: res.platform,
          creators: res.creators_upserted,
          snapshots: res.snapshots_written,
          content: res.content_upserted,
          errors: res.errors.length,
          duration: res.duration_ms,
        },
        `[${res.platform.toUpperCase()}] Ingestion complete`
      );

      if (res.errors.length > 0) {
        res.errors.forEach((e) => logger.warn(`[${res.platform}] ${e}`));
      }
    } else {
      logger.error({ error: r.reason }, '[INGESTION] Platform ingestion failed entirely');
    }
  }

  logger.info('[INGESTION] All platforms completed');
  return output;
}

/**
 * Start automated scheduler
 * Runs every 12 hours (at midnight and noon)
 */
export function startScheduler(): void {
  // Cron format: minute hour day month weekday
  // '0 */12 * * *' = Every 12 hours at minute 0
  const schedule = process.env.INGESTION_SCHEDULE || '0 */12 * * *';

  logger.info({ schedule }, '[SCHEDULER] Starting automated ingestion');

  cron.schedule(schedule, () => {
    logger.info('[SCHEDULER] Triggered scheduled ingestion');
    runIngestion().catch((err) => {
      logger.error({ error: err }, '[SCHEDULER] Scheduled ingestion error');
    });
  });

  logger.info('[SCHEDULER] Scheduler active (runs every 12 hours)');
}

/**
 * CLI entry point
 * Run manually with: npm run ingest
 */
if (require.main === module) {
  runIngestion()
    .then((results) => {
      const totalCreators = results.reduce((sum, r) => sum + r.creators_upserted, 0);
      const totalSnapshots = results.reduce((sum, r) => sum + r.snapshots_written, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      logger.info(
        {
          platforms: results.length,
          creators: totalCreators,
          snapshots: totalSnapshots,
          errors: totalErrors,
        },
        '[INGESTION] Summary'
      );

      process.exit(totalErrors > 0 ? 1 : 0);
    })
    .catch((err) => {
      logger.error({ error: err }, '[INGESTION] Fatal error');
      process.exit(1);
    });
}
