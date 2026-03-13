import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './pool';
import { logger } from '../utils/logger';

/**
 * Seed Tracked Creators
 *
 * Populates the tracked_creators table with initial creators
 * Run with: npm run seed:tracked
 */

const YOUTUBE_CREATORS = [
  { handle: 'manutd', id: 'UCDbXo03RR4-euLEnaG8SC1A' },
  { handle: 'manutdwomen', id: 'UC6yW44UGJJBvYTlfC7CRg2Q' },
  { handle: 'TheFootballTerrace', id: 'UCrWJB0CwdArVgpMYq7_chAw' },
  { handle: 'sportsillustratedfc', id: 'UClFcAxOeio0I9IXScGtuAbA' },
  { handle: 'JeremyEthier', id: 'UCERm5yFZ1SptUEU4wZ2vJvw' },
];

const GITHUB_CREATORS = ['magicmarie', 'hadijahkyampeire', 'trekab', 'd-rita', 'nakatuddesuzan'];

async function seedTrackedCreators(): Promise<void> {
  logger.info('Seeding tracked_creators table...\n');

  let youtubeCount = 0;
  let githubCount = 0;

  // Seed YouTube creators
  for (const creator of YOUTUBE_CREATORS) {
    const { rowCount } = await db.query(
      `INSERT INTO tracked_creators (id, platform, platform_id, handle, enabled)
       VALUES ($1, 'youtube', $2, $3, true)
       ON CONFLICT (platform, platform_id) DO NOTHING`,
      [randomUUID(), creator.id, creator.handle]
    );

    if (rowCount && rowCount > 0) {
      logger.info(`Added YouTube: ${creator.handle}`);
      youtubeCount++;
    }
  }

  // Seed GitHub creators
  for (const username of GITHUB_CREATORS) {
    const { rowCount } = await db.query(
      `INSERT INTO tracked_creators (id, platform, platform_id, handle, enabled)
       VALUES ($1, 'github', $2, $3, true)
       ON CONFLICT (platform, platform_id) DO NOTHING`,
      [randomUUID(), username, username]
    );

    if (rowCount && rowCount > 0) {
      logger.info(`Added GitHub: ${username}`);
      githubCount++;
    }
  }

  logger.info(`\n Seeded ${youtubeCount} YouTube and ${githubCount} GitHub creators`);
}

/**
 * CLI entry point
 */
if (require.main === module) {
  seedTrackedCreators()
    .then(() => {
      logger.info('Seed complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ error: err }, 'Seed failed');
      process.exit(1);
    })
    .finally(async () => {
      await db.end();
    });
}
