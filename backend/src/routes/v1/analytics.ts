import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import * as analyticsService from '../../services/analytics.service';
import type { Platform } from '../../types';

/**
 * Analytics Routes
 *
 * GET  /api/v1/analytics/top-creators       - Leaderboard by followers/engagement
 * GET  /api/v1/analytics/growth             - Fastest growing creators
 * GET  /api/v1/analytics/platform-stats     - Platform comparison
 * GET  /api/v1/analytics/engagement-trends  - Engagement over time
 */

const router = Router();

/**
 * GET /api/v1/analytics/top-creators
 * Get top creators leaderboard
 *
 * Query params:
 * - sort: followers | engagement (default: followers)
 * - limit: number (default: 20, max: 100)
 * - platform: youtube | github (optional)
 */
router.get('/top-creators', async (req: Request, res: Response) => {
  try {
    const sortBy = (req.query.sort as 'followers' | 'engagement') || 'followers';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const platform = req.query.platform as Platform | undefined;

    const data = await analyticsService.getTopCreators(sortBy, limit, platform);

    return res.json({
      success: true,
      data,
      count: data.length,
      sort: sortBy,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting top creators');
    return res.status(500).json({
      success: false,
      error: 'Failed to get top creators',
    });
  }
});

/**
 * GET /api/v1/analytics/growth
 * Get fastest growing creators
 *
 * Query params:
 * - period: 7d | 30d | 90d | 1y | all (default: 30d)
 * - start_date: YYYY-MM-DD (overrides period)
 * - end_date: YYYY-MM-DD (overrides period)
 * - limit: number (default: 20, max: 100)
 * - platform: youtube | github (optional)
 */
router.get('/growth', async (req: Request, res: Response) => {
  try {
    const { period, start_date, end_date } = req.query;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const platform = req.query.platform as Platform | undefined;

    const data = await analyticsService.getGrowthCreators(
      {
        period: period as any,
        start_date: start_date as string,
        end_date: end_date as string,
      },
      limit,
      platform
    );

    return res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting growth creators');
    return res.status(500).json({
      success: false,
      error: 'Failed to get growth creators',
    });
  }
});

/**
 * GET /api/v1/analytics/platform-stats
 * Get comparison stats across platforms
 */
router.get('/platform-stats', async (_req: Request, res: Response) => {
  try {
    const data = await analyticsService.getPlatformStats();

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting platform stats');
    return res.status(500).json({
      success: false,
      error: 'Failed to get platform stats',
    });
  }
});

/**
 * GET /api/v1/analytics/engagement-trends
 * Get engagement trends over time
 *
 * Query params:
 * - period: 7d | 30d | 90d | 1y | all (default: 30d)
 * - start_date: YYYY-MM-DD (overrides period)
 * - end_date: YYYY-MM-DD (overrides period)
 * - platform: youtube | github (optional)
 */
router.get('/engagement-trends', async (req: Request, res: Response) => {
  try {
    const { period, start_date, end_date } = req.query;
    const platform = req.query.platform as Platform | undefined;

    const data = await analyticsService.getEngagementTrends(
      {
        period: period as any,
        start_date: start_date as string,
        end_date: end_date as string,
      },
      platform
    );

    return res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting engagement trends');
    return res.status(500).json({
      success: false,
      error: 'Failed to get engagement trends',
    });
  }
});

export default router;
