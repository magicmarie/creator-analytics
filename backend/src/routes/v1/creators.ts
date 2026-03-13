import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as creatorsService from '../../services/creators.service';
import type { Platform } from '../../types';

/**
 * Creators Routes
 *
 * GET  /api/v1/creators                    - List all creators
 * GET  /api/v1/creators/:id                - Get creator by ID
 * GET  /api/v1/creators/:id/snapshots      - Get creator snapshots (historical data)
 * GET  /api/v1/creators/:id/content        - Get creator's content
 */

const router = Router();

/**
 * GET /api/v1/creators
 * List all creators with optional platform filter and pagination
 *
 * Query params:
 * - platform: youtube | github
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as Platform | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const result = await creatorsService.listCreators(platform, { page, limit });

    return res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error listing creators');
    return res.status(500).json({
      success: false,
      error: 'Failed to list creators',
    });
  }
});

/**
 * GET /api/v1/creators/:id
 * Get a single creator with latest snapshot
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const creator = await creatorsService.getCreatorById(id);

    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
      });
    }

    return res.json({
      success: true,
      data: creator,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting creator');
    return res.status(500).json({
      success: false,
      error: 'Failed to get creator',
    });
  }
});

/**
 * GET /api/v1/creators/:id/snapshots
 * Get historical snapshots for a creator
 *
 * Query params:
 * - period: 7d | 30d | 90d | 1y | all (default: 30d)
 * - start_date: YYYY-MM-DD (overrides period)
 * - end_date: YYYY-MM-DD (overrides period)
 */
router.get('/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { period, start_date, end_date } = req.query;

    const snapshots = await creatorsService.getCreatorSnapshots(id, {
      period: period as any,
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
    });

    return res.json({
      success: true,
      data: snapshots,
      count: snapshots.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting creator snapshots');
    return res.status(500).json({
      success: false,
      error: 'Failed to get creator snapshots',
    });
  }
});

/**
 * GET /api/v1/creators/:id/content
 * Get content for a specific creator
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 */
router.get('/:id/content', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const result = await creatorsService.getCreatorContent(id, { page, limit });

    return res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting creator content');
    return res.status(500).json({
      success: false,
      error: 'Failed to get creator content',
    });
  }
});

export default router;
