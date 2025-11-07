import { Router } from 'express';

import {
  deleteOldRequestLogs,
  getRecentRequestLogs,
  getRequestMetrics,
  getUserInsight,
  getUsersLeaderboard,
} from '../controllers/adminController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/metrics', asyncHandler(getRequestMetrics));
router.get('/logs', asyncHandler(getRecentRequestLogs));
router.delete('/logs', asyncHandler(deleteOldRequestLogs));
router.get('/users', asyncHandler(getUsersLeaderboard));
router.get('/users/:userId', asyncHandler(getUserInsight));

export default router;
