import { Pool, PoolClient, QueryResultRow, QueryResult } from 'pg';
import { logger } from '../utils/logger';

/**
 * PostgreSQL Connection Pool
 *
 * Features:
 * - Connection pooling for performance
 * - Transaction support with automatic rollback
 * - Error handling and logging
 * - Graceful shutdown
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 5000, // Fail fast if connection takes > 5s
});

// Log unexpected pool errors
pool.on('error', (err) => {
  logger.error({ error: err.message }, 'Unexpected database pool error');
});

// Log when pool is created
pool.on('connect', () => {
  logger.debug('New database client connected to pool');
});

// Log when client is removed from pool
pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

/**
 * Database interface with type-safe methods
 */
export const db = {
  /**
   * Execute a query with optional parameters
   */
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },

  /**
   * Get a client from the pool for manual transaction control
   * Remember to call client.release() when done!
   */
  getClient: (): Promise<PoolClient> => {
    return pool.connect();
  },

  /**
   * Execute multiple queries in a transaction
   * Automatically commits on success, rolls back on error
   */
  transaction: async <T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ error: err }, 'Transaction rolled back');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Gracefully close all connections
   * Call this on server shutdown
   */
  end: async (): Promise<void> => {
    await pool.end();
    logger.info('Database connection pool closed');
  },
};

/**
 * Test database connection
 * Useful for health checks and startup validation
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await db.query('SELECT NOW() as time');
    logger.info({ db_time: result.rows[0]?.time }, 'Database connection successful');
    return true;
  } catch (err) {
    logger.error({ error: err }, 'Database connection failed');
    return false;
  }
}
