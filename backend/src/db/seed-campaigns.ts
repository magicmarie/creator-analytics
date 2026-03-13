import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

/**
 * Seed sample campaigns and campaign-creator relationships
 *
 * This creates demo campaigns to showcase ROI tracking functionality.
 * Run with: npm run seed:campaigns
 */

const db = new Pool({ connectionString: process.env.DATABASE_URL });

interface Campaign {
  id: string;
  name: string;
  brand: string;
  budget: number;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'draft';
}

const campaigns: Campaign[] = [
  {
    id: randomUUID(),
    name: 'Summer Product Launch 2026',
    brand: 'TechGear Pro',
    budget: 50000,
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    status: 'active',
  },
  {
    id: randomUUID(),
    name: 'Developer Tools Awareness',
    brand: 'CodeCraft',
    budget: 30000,
    start_date: '2026-01-15',
    end_date: '2026-03-31',
    status: 'active',
  },
  {
    id: randomUUID(),
    name: 'Holiday Campaign 2025',
    brand: 'GiftBox Inc',
    budget: 75000,
    start_date: '2025-11-01',
    end_date: '2025-12-31',
    status: 'completed',
  },
];

/**
 * Seed campaigns with creator relationships
 * Can be called from CLI or from ingestion job
 */
export async function seedCampaigns(providedDb?: Pool): Promise<void> {
  const dbClient = providedDb || db;
  const shouldCloseConnection = !providedDb;

  logger.info('[SEED] Starting campaign seeding...');

  try {
    // Get all existing creators to link to campaigns
    const { rows: creators } = await dbClient.query<{ id: string; platform: string; handle: string }>(
      'SELECT id, platform, handle FROM creators ORDER BY platform, handle'
    );

    if (creators.length === 0) {
      logger.warn('[SEED] No creators found - skipping campaign seed');
      return;
    }

    logger.info(`[SEED] Found ${creators.length} creators to link with campaigns`);

    // Check if campaigns already exist
    const { rows: existingCampaigns } = await dbClient.query(
      'SELECT COUNT(*) as count FROM campaigns'
    );

    if (Number(existingCampaigns[0].count) > 0) {
      logger.info('[SEED] Campaigns already seeded, skipping');
      return;
    }

    // Insert campaigns
    for (const campaign of campaigns) {
      await dbClient.query(
        `INSERT INTO campaigns (id, name, brand, budget, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [campaign.id, campaign.name, campaign.brand, campaign.budget, campaign.start_date, campaign.end_date, campaign.status]
      );
      logger.info(`[SEED] ✓ Inserted campaign: ${campaign.name}`);

      // Link 3-5 random creators to each campaign
      const numCreators = Math.floor(Math.random() * 3) + 3; // 3-5 creators
      const selectedCreators = creators
        .sort(() => Math.random() - 0.5) // Shuffle
        .slice(0, numCreators);

      for (const creator of selectedCreators) {
        const spend = Math.floor(Math.random() * 8000) + 2000; // $2,000 - $10,000
        const conversions = Math.floor(Math.random() * 150) + 50; // 50-200 conversions

        await dbClient.query(
          `INSERT INTO campaign_creators (campaign_id, creator_id, spend, conversions)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (campaign_id, creator_id) DO NOTHING`,
          [campaign.id, creator.id, spend, conversions]
        );
      }

      logger.info(`[SEED]   → Linked ${selectedCreators.length} creators`);
    }

    logger.info(`[SEED] ✓ Successfully seeded ${campaigns.length} campaigns`);
  } catch (err) {
    logger.error({ error: err }, '[SEED] Campaign seeding failed');
    throw err;
  } finally {
    if (shouldCloseConnection) {
      await dbClient.end();
    }
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  seedCampaigns()
    .then(() => {
      logger.info('Campaign seeding completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ error: err }, 'Campaign seeding failed');
      process.exit(1);
    });
}
