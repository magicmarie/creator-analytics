import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { logger, requestLogger } from './utils/logger';
import { db, testConnection } from './db/pool';

/**
 * CreatorScope API Server
 *
 * Production-ready Express server with:
 * - CORS protection
 * - Rate limiting
 * - Structured logging
 * - Graceful shutdown
 * - Health checks
 */

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip, url: req.url }, 'Rate limit exceeded');
    res.status(429).json({
      error: 'Too many requests, please try again later',
      retryAfter: '15 minutes'
    });
  },
});

app.use(limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Health check endpoint
 * Returns server status and database connectivity
 */
app.get('/health', async (_req, res) => {
  try {
    const dbConnected = await testConnection();

    if (!dbConnected) {
      return res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      });
    }

    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (err) {
    logger.error({ error: err }, 'Health check failed');
    return res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'error',
    });
  }
});

/**
 * API version info
 */
app.get('/', (_req, res) => {
  return res.json({
    name: 'CreatorScope API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/v1',
    },
  });
});

// Routes will be added here

/**
 * 404 handler
 */
app.use((_req, res) => {
  return res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

/**
 * Global error handler
 */
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  return res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// ─── Server Startup ───────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    },
    'Server started'
  );
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

/**
 * Gracefully shut down the server
 * - Stop accepting new requests
 * - Finish processing existing requests
 * - Close database connections
 * - Close Redis connections
 * - Exit cleanly
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully...');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await db.end();
      logger.info('Database connections closed');

      const { cache } = await import('./utils/cache');
      await cache.disconnect();
      logger.info('Redis connection closed');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ error: err }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.fatal({ error: err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

export default app;
