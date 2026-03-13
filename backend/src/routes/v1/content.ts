import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as contentService from '../../services/content.service';
import type { Platform } from '../../types';

/**
 * Content Routes
 *
 * GET  /api/v1/content  - List recent content across all creators
 */

const router = Router();

/**
 * GET /api/v1/content
 * List recent content across all creators
 *
 * Query params:
 * - platform: youtube | github (optional)
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as Platform | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const result = await contentService.listContent(platform, { page, limit });

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
    logger.error({ error }, 'Error listing content');
    return res.status(500).json({
      success: false,
      error: 'Failed to list content',
    });
  }
});

export default router;
