import Redis from 'ioredis';
import { logger } from './logger';

/**
 * Redis Cache Client
 *
 * Provides caching layer for expensive operations (database queries, API calls)
 * Features:
 * - Automatic TTL management
 * - Graceful degradation (cache failure doesn't crash app)
 * - Connection retry with backoff
 * - JSON serialization
 */

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true, // Connect on first command
});

// Event handlers
redis.on('error', (err) => {
  logger.error({ error: err.message }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting');
});

/**
 * Cache interface with graceful error handling
 */
export const cache = {
  /**
   * Get value from cache
   *
   * @param key Cache key
   * @returns Cached value or null if not found/error
   */
  async get(key: string): Promise<string | null> {
    try {
      const value = await redis.get(key);
      if (value) {
        logger.debug({ key }, 'Cache hit');
      } else {
        logger.debug({ key }, 'Cache miss');
      }
      return value;
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache get failed - degrading gracefully');
      return null;
    }
  },

  /**
   * Get and parse JSON value from cache
   *
   * @param key Cache key
   * @returns Parsed object or null
   */
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache getJSON failed');
      return null;
    }
  },

  /**
   * Set value in cache with TTL
   *
   * @param key Cache key
   * @param value Value to cache (string)
   * @param ttl Time to live in seconds (default: 300 = 5 minutes)
   */
  async set(key: string, value: string, ttl = 300): Promise<void> {
    try {
      await redis.setex(key, ttl, value);
      logger.debug({ key, ttl }, 'Cache set');
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache set failed - degrading gracefully');
    }
  },

  /**
   * Set JSON object in cache with TTL
   *
   * @param key Cache key
   * @param value Object to cache
   * @param ttl Time to live in seconds
   */
  async setJSON<T>(key: string, value: T, ttl = 300): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttl, serialized);
      logger.debug({ key, ttl }, 'Cache setJSON');
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache setJSON failed');
    }
  },

  /**
   * Delete key from cache
   *
   * @param key Cache key
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
      logger.debug({ key }, 'Cache deleted');
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache delete failed');
    }
  },

  /**
   * Delete multiple keys matching a pattern
   *
   * @param pattern Key pattern (e.g., "user:*")
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug({ pattern, count: keys.length }, 'Cache pattern deleted');
      }
    } catch (err) {
      logger.warn({ pattern, error: err }, 'Cache pattern delete failed');
    }
  },

  /**
   * Check if key exists
   *
   * @param key Cache key
   * @returns true if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache exists check failed');
      return false;
    }
  },

  /**
   * Get time to live for a key
   *
   * @param key Cache key
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      return await redis.ttl(key);
    } catch (err) {
      logger.warn({ key, error: err }, 'Cache TTL check failed');
      return -2;
    }
  },

  /**
   * Flush entire cache (use with caution!)
   */
  async flush(): Promise<void> {
    try {
      await redis.flushdb();
      logger.warn('Cache flushed');
    } catch (err) {
      logger.error({ error: err }, 'Cache flush failed');
    }
  },

  /**
   * Close Redis connection gracefully
   */
  async disconnect(): Promise<void> {
    try {
      await redis.quit();
      logger.info('Redis disconnected');
    } catch (err) {
      logger.error({ error: err }, 'Redis disconnect failed');
    }
  },

  /**
   * Get Redis client instance (for advanced operations)
   */
  getClient(): Redis {
    return redis;
  },
};

export default redis;
