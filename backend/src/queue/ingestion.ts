import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { ingestYouTube } from '../ingestion/youtube';
import { ingestGitHub } from '../ingestion/github';
import type { IngestionResult, Platform } from '../types';

/**
 * BullMQ Job Queue for Platform Ingestion
 *
 * Features:
 * - Background job processing
 * - Automatic retries with exponential backoff
 * - Job result storage
 * - Concurrent processing
 */

/**
 * Redis connection options for BullMQ
 */
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // BullMQ recommendation
};

/**
 * Ingestion queue configuration
 */
export const ingestionQueue = new Queue('platform-ingestion', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5s delay
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Or 24 hours, whichever comes first
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
      age: 7 * 24 * 3600, // Or 7 days
    },
  },
});

/**
 * Platform ingestors map
 * Add new platforms here
 */
const platformIngestors: Record<Platform, () => Promise<IngestionResult>> = {
  youtube: ingestYouTube,
  github: ingestGitHub,
};

/**
 * Background worker for processing ingestion jobs
 * Runs in a separate process (worker.ts)
 */
/**
 * Background worker for processing ingestion jobs
 */
export const ingestionWorker = new Worker(
  'platform-ingestion',
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Processing ingestion job');

    if (job.name === 'ingest-all') {
      // Ingest all platforms in parallel
      const results = await Promise.allSettled(
        Object.values(platformIngestors).map((fn) => fn())
      );

      const output: IngestionResult[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          output.push(r.value);
        } else {
          logger.error({ error: r.reason }, 'Platform ingestion failed');
        }
      }

      logger.info({ count: output.length }, 'All platform ingestion completed');
      return output;
    }

    if (job.name === 'ingest-platform') {
      // Ingest specific platform
      const { platform } = job.data as { platform: Platform };
      const ingestor = platformIngestors[platform];

      if (!ingestor) {
        throw new Error(`Unknown platform: ${platform}`);
      }

      const result = await ingestor();
      logger.info({ platform, result }, 'Platform ingestion completed');
      return result;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection: redisConnection,
    concurrency: 2, // Process 2 jobs simultaneously
  }
);

/**
 * Worker event handlers
 */
ingestionWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'Job completed');
});

ingestionWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, name: job?.name, error: err.message },
    'Job failed'
  );
});

ingestionWorker.on('error', (err) => {
  logger.error({ error: err.message }, 'Worker error');
});

/**
 * Queue all platforms for ingestion
 */
export async function queueAllPlatforms(): Promise<Job> {
  const job = await ingestionQueue.add('ingest-all', {});
  logger.info({ jobId: job.id }, 'Queued all platforms for ingestion');
  return job;
}

/**
 * Queue specific platform for ingestion
 */
export async function queuePlatformIngestion(platform: Platform): Promise<Job> {
  const job = await ingestionQueue.add('ingest-platform', { platform });
  logger.info({ jobId: job.id, platform }, 'Queued platform for ingestion');
  return job;
}

/**
 * Close queue and worker gracefully
 */
export async function closeQueue(): Promise<void> {
  await ingestionQueue.close();
  await ingestionWorker.close();
  logger.info('Ingestion queue and worker closed');
}
