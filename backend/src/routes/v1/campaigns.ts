import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as campaignsService from '../../services/campaigns.service';

/**
 * Campaign Routes
 *
 * Manages brand partnership campaigns and ROI tracking
 *
 * GET    /api/v1/campaigns              - List all campaigns
 * POST   /api/v1/campaigns              - Create new campaign
 * GET    /api/v1/campaigns/:id          - Get campaign details
 * PATCH  /api/v1/campaigns/:id/status   - Update campaign status
 * POST   /api/v1/campaigns/:id/creators - Add creator to campaign
 * GET    /api/v1/campaigns/:id/performance - Get campaign ROI/performance
 */

const router = Router();

/**
 * GET /api/v1/campaigns
 * List all campaigns
 *
 * Query params:
 * - status: draft | active | completed (optional)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'draft' | 'active' | 'completed' | undefined;

    const campaigns = await campaignsService.listCampaigns(status);

    return res.json({
      success: true,
      data: campaigns,
      count: campaigns.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing campaigns');
    return res.status(500).json({
      success: false,
      error: 'Failed to list campaigns',
    });
  }
});

/**
 * POST /api/v1/campaigns
 * Create a new campaign
 *
 * Body:
 * {
 *   "name": "Summer Energy Drink Launch",
 *   "brand": "Red Bull",
 *   "budget": 50000,
 *   "start_date": "2026-06-01",
 *   "end_date": "2026-06-30",  // optional
 *   "status": "draft"          // optional, defaults to "draft"
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, brand, budget, start_date, end_date, status } = req.body;

    // Validation
    if (!name || !brand || !budget || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, brand, budget, start_date',
      });
    }

    if (typeof budget !== 'number' || budget <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Budget must be a positive number',
      });
    }

    if (status && !['draft', 'active', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be draft, active, or completed',
      });
    }

    const campaign = await campaignsService.createCampaign({
      name,
      brand,
      budget,
      start_date,
      end_date,
      status,
    });

    return res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campaign created successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Error creating campaign');
    return res.status(500).json({
      success: false,
      error: 'Failed to create campaign',
    });
  }
});

/**
 * GET /api/v1/campaigns/:id
 * Get a single campaign by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const campaign = await campaignsService.getCampaignById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    return res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting campaign');
    return res.status(500).json({
      success: false,
      error: 'Failed to get campaign',
    });
  }
});

/**
 * PATCH /api/v1/campaigns/:id/status
 * Update campaign status
 *
 * Body:
 * {
 *   "status": "active" | "completed" | "draft"
 * }
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!status || !['draft', 'active', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be draft, active, or completed',
      });
    }

    const campaign = await campaignsService.updateCampaignStatus(id, status);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    return res.json({
      success: true,
      data: campaign,
      message: 'Campaign status updated',
    });
  } catch (error) {
    logger.error({ error }, 'Error updating campaign status');
    return res.status(500).json({
      success: false,
      error: 'Failed to update campaign status',
    });
  }
});

/**
 * POST /api/v1/campaigns/:id/creators
 * Add a creator to a campaign
 *
 * Body:
 * {
 *   "creator_id": "abc123",
 *   "spend": 25000,         // optional
 *   "conversions": 15000,   // optional
 *   "notes": "Great engagement, would hire again"  // optional
 * }
 */
router.post('/:id/creators', async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id as string;
    const { creator_id, spend, conversions, notes } = req.body;

    if (!creator_id) {
      return res.status(400).json({
        success: false,
        error: 'creator_id is required',
      });
    }

    // Verify campaign exists
    const campaign = await campaignsService.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const result = await campaignsService.addCreatorToCampaign(
      campaignId,
      creator_id,
      { spend, conversions, notes }
    );

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Creator added to campaign',
    });
  } catch (error: any) {
    logger.error({ error }, 'Error adding creator to campaign');

    // Handle foreign key constraint errors (creator doesn't exist)
    if (error.code === '23503') {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to add creator to campaign',
    });
  }
});

/**
 * GET /api/v1/campaigns/:id/performance
 * Get campaign performance and ROI
 *
 * Combines:
 * - Manual campaign data (spend, conversions)
 * - Automated creator metrics (followers, engagement, views)
 * - Calculated ROI (cost per follower, cost per conversion)
 */
router.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const performance = await campaignsService.getCampaignPerformance(id);

    if (!performance) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    return res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting campaign performance');
    return res.status(500).json({
      success: false,
      error: 'Failed to get campaign performance',
    });
  }
});

export default router;
