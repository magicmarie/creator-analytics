import { db } from '../db/pool';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { randomBytes } from 'crypto';

/**
 * Campaigns Service
 *
 * Manages brand partnership campaigns and ROI tracking
 * Ties creator performance data to business/brand context
 */

type CampaignStatus = 'draft' | 'active' | 'completed';

interface Campaign {
  id: string;
  name: string;
  brand: string;
  budget: number;
  start_date: Date;
  end_date: Date | null;
  status: CampaignStatus;
  created_at: Date;
}

interface CampaignCreator {
  campaign_id: string;
  creator_id: string;
  spend: number | null;
  conversions: number | null;
  notes: string | null;
}

interface CampaignPerformance {
  campaign: Campaign;
  total_spend: number;
  budget_remaining: number;
  creators: Array<{
    id: string;
    handle: string;
    name: string;
    platform: string;
    avatar_url: string | null;
    spend: number;
    conversions: number;
    // Performance metrics from creator data
    followers: number;
    engagement_rate: number;
    content_count: number;
    total_views: number;
    // ROI calculations
    cost_per_follower: number;
    cost_per_conversion: number | null;
  }>;
}

/**
 * List all campaigns
 */
export async function listCampaigns(
  status?: CampaignStatus
): Promise<Campaign[]> {
  let query = 'SELECT * FROM campaigns';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = $1';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const result = await db.query(query, params);
  return result.rows as Campaign[];
}

/**
 * Get campaign by ID
 */
export async function getCampaignById(id: string): Promise<Campaign | null> {
  const query = 'SELECT * FROM campaigns WHERE id = $1';
  const result = await db.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Campaign;
}

/**
 * Create a new campaign
 */
export async function createCampaign(data: {
  name: string;
  brand: string;
  budget: number;
  start_date: string;
  end_date?: string;
  status?: CampaignStatus;
}): Promise<Campaign> {
  const id = randomBytes(16).toString('hex');

  const query = `
    INSERT INTO campaigns (id, name, brand, budget, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await db.query(query, [
    id,
    data.name,
    data.brand,
    data.budget,
    data.start_date,
    data.end_date || null,
    data.status || 'draft',
  ]);

  logger.info({ campaignId: id, name: data.name, brand: data.brand }, 'Campaign created');

  return result.rows[0] as Campaign;
}

/**
 * Add creator to campaign
 */
export async function addCreatorToCampaign(
  campaignId: string,
  creatorId: string,
  data: {
    spend?: number;
    conversions?: number;
    notes?: string;
  }
): Promise<CampaignCreator> {
  const query = `
    INSERT INTO campaign_creators (campaign_id, creator_id, spend, conversions, notes)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (campaign_id, creator_id) DO UPDATE
    SET spend = EXCLUDED.spend,
        conversions = EXCLUDED.conversions,
        notes = EXCLUDED.notes
    RETURNING *
  `;

  const result = await db.query(query, [
    campaignId,
    creatorId,
    data.spend || null,
    data.conversions || null,
    data.notes || null,
  ]);

  logger.info(
    { campaignId, creatorId, spend: data.spend },
    'Creator added to campaign'
  );

  // Invalidate campaign performance cache
  await cache.del(`campaign:${campaignId}:performance`);

  return result.rows[0] as CampaignCreator;
}

/**
 * Get campaign performance with creator ROI
 * Combines manual campaign data with automated creator metrics
 */
export async function getCampaignPerformance(
  campaignId: string
): Promise<CampaignPerformance | null> {
  const cacheKey = `campaign:${campaignId}:performance`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  // Get campaign
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    return null;
  }

  // Get all creators in this campaign with their performance metrics
  const query = `
    SELECT
      c.id,
      c.handle,
      c.name,
      c.platform,
      c.avatar_url,
      cc.spend,
      cc.conversions,
      cc.notes,
      -- Latest snapshot metrics
      s.followers,
      s.engagement_rate,
      s.post_count,
      s.total_views,
      -- Content count for this creator
      (SELECT COUNT(*) FROM content WHERE creator_id = c.id) as content_count
    FROM campaign_creators cc
    JOIN creators c ON cc.creator_id = c.id
    LEFT JOIN LATERAL (
      SELECT * FROM creator_snapshots
      WHERE creator_id = c.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) s ON true
    WHERE cc.campaign_id = $1
    ORDER BY cc.spend DESC NULLS LAST
  `;

  const result = await db.query(query, [campaignId]);

  // Calculate totals and ROI
  let totalSpend = 0;

  const creators = result.rows.map((row: any) => {
    const spend = parseFloat(row.spend || 0);
    const conversions = parseInt(row.conversions || 0, 10);
    const followers = parseInt(row.followers || 0, 10);
    const totalViews = parseInt(row.total_views || 0, 10);

    totalSpend += spend;

    return {
      id: row.id,
      handle: row.handle,
      name: row.name,
      platform: row.platform,
      avatar_url: row.avatar_url,
      spend,
      conversions,
      followers,
      engagement_rate: parseFloat(row.engagement_rate || 0),
      content_count: parseInt(row.content_count || 0, 10),
      total_views: totalViews,
      cost_per_follower: followers > 0 ? spend / followers : 0,
      cost_per_conversion: conversions > 0 ? spend / conversions : null,
    };
  });

  const performance: CampaignPerformance = {
    campaign,
    total_spend: totalSpend,
    budget_remaining: campaign.budget - totalSpend,
    creators,
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, JSON.stringify(performance), 300);

  return performance;
}

/**
 * Update campaign status
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<Campaign | null> {
  const query = `
    UPDATE campaigns
    SET status = $1
    WHERE id = $2
    RETURNING *
  `;

  const result = await db.query(query, [status, campaignId]);

  if (result.rows.length === 0) {
    return null;
  }

  logger.info({ campaignId, status }, 'Campaign status updated');

  return result.rows[0] as Campaign;
}
