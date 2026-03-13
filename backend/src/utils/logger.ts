import pino from 'pino';
import type { Request, Response, NextFunction } from 'express';

/**
 * Structured logging with Pino: extremely fast and efficient JSON logger
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

/**
 * Express middleware for automatic request logging
 * Logs method, URL, status code, and response time
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    }, 'HTTP request');
  });

  next();
}

/**
 * Child logger for specific contexts
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
