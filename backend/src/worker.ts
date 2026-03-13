import 'dotenv/config';
import { closeQueue } from './queue/ingestion';
import { logger } from './utils/logger';

/**
 * Background Worker Process
 *
 * Processes ingestion jobs from the BullMQ queue
 * Runs separately from the API server for scalability
 *
 * THREE WAYS TO RUN INGESTION:
 *
 * 1. Manual (Direct execution):
 *    npm run ingest
 *    - Runs ingestion/run.ts directly
 *    - Executes immediately, blocks until done
 *    - Good for: Testing, one-off runs, debugging
 *
 * 2. Background Worker (Queue-based) - THIS FILE:
 *    npm run dev:worker
 *    - Worker listens for jobs in the queue
 *    - Jobs processed asynchronously in background
 *    - Good for: Production, automatic retries, handling spikes
 *
 * 3. Scheduled (Automated via cron):
 *    Runs automatically when API server starts
 *    - startScheduler() in index.ts runs every 12 hours
 *    - Calls runIngestion() directly (not through queue)
 *    - Good for: Keeping data fresh without manual intervention
 *
 * Start with: npm run dev:worker
 */

logger.info('Background worker started');

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down gracefully...');

  try {
    await closeQueue();
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ error: err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.fatal({ error: err }, 'Uncaught exception in worker');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection in worker');
  process.exit(1);
});

logger.info('Worker ready to process jobs');
