import { Router } from 'express';
import creatorsRouter from './creators';
import contentRouter from './content';
import analyticsRouter from './analytics';
import adminRouter from './admin';
import campaignsRouter from './campaigns';

/**
 * v1 API Router
 * Mounts all v1 endpoints under /api/v1
 */

const router = Router();

// Mount sub-routers
router.use('/creators', creatorsRouter);
router.use('/content', contentRouter);
router.use('/analytics', analyticsRouter);
router.use('/admin', adminRouter);
router.use('/campaigns', campaignsRouter);

export default router;
