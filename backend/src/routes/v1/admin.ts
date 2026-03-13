import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as adminService from '../../services/admin.service';
import type { Platform } from '../../types';

/**
 * Admin Routes
 *
 * GET    /api/v1/admin/tracked-creators       - List tracked creators
 * POST   /api/v1/admin/tracked-creators       - Add creator to track
 * DELETE /api/v1/admin/tracked-creators/:id   - Stop tracking creator
 * POST   /api/v1/admin/ingest/trigger         - Trigger manual ingestion
 * GET    /api/v1/admin/ingest/status          - Get ingestion status
 */

const router = Router();

/**
 * GET /api/v1/admin/tracked-creators
 * List all tracked creators
 *
 * Query params:
 * - platform: youtube | github (optional)
 */
router.get('/tracked-creators', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as Platform | undefined;

    const data = await adminService.listTrackedCreators(platform);

    return res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing tracked creators');
    return res.status(500).json({
      success: false,
      error: 'Failed to list tracked creators',
    });
  }
});

/**
 * POST /api/v1/admin/tracked-creators
 * Add a new creator to track
 *
 * Body:
 * {
 *   "platform": "youtube" | "github",
 *   "platform_id": "channel_id or username",
 *   "handle": "display handle"
 * }
 */
router.post('/tracked-creators', async (req: Request, res: Response) => {
  try {
    const { platform, platform_id, handle } = req.body;

    // Validation
    if (!platform || !platform_id || !handle) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, platform_id, handle',
      });
    }

    if (!['youtube', 'github'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform. Must be youtube or github',
      });
    }

    const creator = await adminService.addTrackedCreator(platform, platform_id, handle);

    return res.status(201).json({
      success: true,
      data: creator,
      message: 'Creator added to tracking list',
    });
  } catch (error) {
    logger.error({ error }, 'Error adding tracked creator');
    return res.status(500).json({
      success: false,
      error: 'Failed to add tracked creator',
    });
  }
});

/**
 * DELETE /api/v1/admin/tracked-creators/:id
 * Stop tracking a creator (soft delete)
 */
router.delete('/tracked-creators/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const removed = await adminService.removeTrackedCreator(id);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Tracked creator not found',
      });
    }

    return res.json({
      success: true,
      message: 'Creator removed from tracking list',
    });
  } catch (error) {
    logger.error({ error }, 'Error removing tracked creator');
    return res.status(500).json({
      success: false,
      error: 'Failed to remove tracked creator',
    });
  }
});

/**
 * GET /api/v1/admin/ingest/status
 * Get ingestion status and statistics
 */
router.get('/ingest/status', async (_req: Request, res: Response) => {
  try {
    const status = await adminService.getIngestionStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting ingestion status');
    return res.status(500).json({
      success: false,
      error: 'Failed to get ingestion status',
    });
  }
});

/**
 * POST /api/v1/admin/ingest/trigger
 * Trigger manual ingestion (queues job via BullMQ)
 */
router.post('/ingest/trigger', async (_req: Request, res: Response) => {
  try {
    const result = await adminService.triggerIngestion();

    return res.json({
      success: true,
      data: result,
      message: 'Ingestion job queued successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Error triggering ingestion');
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger ingestion',
    });
  }
});

export default router;
