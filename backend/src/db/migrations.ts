import 'dotenv/config';
import { Pool } from 'pg';
import { getPlatformCheckConstraint } from '../types/platforms';
import { logger } from '../utils/logger';

/**
 * Database Migration System
 *
 * Features:
 * - Version-controlled schema changes
 * - Idempotent migrations (safe to run multiple times)
 * - Transactional migrations (all-or-nothing)
 * - Migration tracking table
 * - Single source of truth for platform validation
 *
 * To add a new migration:
 * 1. Add an entry to the migrations array
 * 2. Increment the version number
 * 3. Run: npm run migrate
 */

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const platformCheck = getPlatformCheckConstraint();

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_creators_table',
    sql: `
      CREATE TABLE IF NOT EXISTS creators (
        id            TEXT PRIMARY KEY,
        platform      TEXT NOT NULL ${platformCheck},
        handle        TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        avatar_url    TEXT,
        profile_url   TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (platform, handle)
      );

      CREATE INDEX IF NOT EXISTS idx_creators_platform
        ON creators (platform);
    `,
  },
  {
    version: 2,
    name: 'create_creator_snapshots_table',
    sql: `
      CREATE TABLE IF NOT EXISTS creator_snapshots (
        id               TEXT PRIMARY KEY,
        creator_id       TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        followers        INTEGER NOT NULL DEFAULT 0,
        following        INTEGER,
        post_count       INTEGER NOT NULL DEFAULT 0,
        engagement_rate  NUMERIC(6,4) NOT NULL DEFAULT 0,
        total_views      BIGINT,
        UNIQUE (creator_id, captured_at)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_creator_time
        ON creator_snapshots (creator_id, captured_at DESC);

      COMMENT ON TABLE creator_snapshots IS 'Append-only time-series snapshots for historical analytics';
      COMMENT ON COLUMN creator_snapshots.engagement_rate IS 'Calculated as (likes + comments) / views';
    `,
  },
  {
    version: 3,
    name: 'create_content_table',
    sql: `
      CREATE TABLE IF NOT EXISTS content (
        id                   TEXT PRIMARY KEY,
        creator_id           TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        platform             TEXT NOT NULL ${platformCheck},
        platform_content_id  TEXT NOT NULL,
        title                TEXT NOT NULL,
        url                  TEXT NOT NULL,
        published_at         TIMESTAMPTZ NOT NULL,
        views                INTEGER,
        likes                INTEGER,
        comments             INTEGER,
        thumbnail_url        TEXT,
        ingested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (platform, platform_content_id)
      );

      CREATE INDEX IF NOT EXISTS idx_content_creator
        ON content (creator_id, published_at DESC);

      CREATE INDEX IF NOT EXISTS idx_content_platform
        ON content (platform, published_at DESC);
    `,
  },
  {
    version: 4,
    name: 'create_campaigns_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaigns (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        brand       TEXT NOT NULL,
        budget      NUMERIC(12,2),
        start_date  DATE NOT NULL,
        end_date    DATE,
        status      TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('active','completed','draft')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_status
        ON campaigns (status, start_date DESC);
    `,
  },
  {
    version: 5,
    name: 'create_campaign_creators_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_creators (
        campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        creator_id   TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        spend        NUMERIC(10,2),
        conversions  INTEGER,
        notes        TEXT,
        PRIMARY KEY (campaign_id, creator_id)
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_creators_creator
        ON campaign_creators (creator_id);
    `,
  },
  {
    version: 6,
    name: 'create_tracked_creators_table',
    sql: `
      CREATE TABLE IF NOT EXISTS tracked_creators (
        id              TEXT PRIMARY KEY,
        platform        TEXT NOT NULL ${platformCheck},
        platform_id     TEXT NOT NULL,
        handle          TEXT NOT NULL,
        enabled         BOOLEAN NOT NULL DEFAULT true,
        added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (platform, platform_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tracked_creators_enabled
        ON tracked_creators (platform, enabled);

      COMMENT ON TABLE tracked_creators IS 'Database-driven creator management - add creators without code changes';
    `,
  },
];

/**
 * Ensure the schema_migrations table exists
 */
async function ensureMigrationTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Get all previously applied migration versions
 */
async function getAppliedVersions(): Promise<Set<number>> {
  const { rows } = await db.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return new Set(rows.map(r => r.version));
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  logger.info('Starting database migrations...');

  try {
    await ensureMigrationTable();
    const appliedVersions = await getAppliedVersions();

    let ranCount = 0;
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        logger.debug(`✓ Migration ${migration.version} (${migration.name}) already applied`);
        continue;
      }

      logger.info(`→ Applying migration ${migration.version}: ${migration.name}`);

      try {
        await db.query('BEGIN');

        // Run the migration SQL
        await db.query(migration.sql);

        // Record the migration
        await db.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );

        await db.query('COMMIT');

        logger.info(`✓ Migration ${migration.version} applied successfully`);
        ranCount++;
      } catch (err) {
        await db.query('ROLLBACK');
        logger.error({ error: err, migration: migration.name }, 'Migration failed');
        throw new Error(`Migration ${migration.version} failed: ${err}`);
      }
    }

    if (ranCount === 0) {
      logger.info('✓ All migrations up to date');
    } else {
      logger.info(`✓ Applied ${ranCount} migration(s) successfully`);
    }
  } catch (err) {
    logger.error({ error: err }, 'Migration process failed');
    throw err;
  } finally {
    await db.end();
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ error: err }, 'Migration process failed');
      process.exit(1);
    });
}
