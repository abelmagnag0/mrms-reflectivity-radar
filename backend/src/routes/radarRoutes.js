import { Router } from 'express';

import { getGrid, getGridBinary, getLatest, getTile } from '../controllers/radarController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/latest', asyncHandler(getLatest));
router.get('/tile.png', asyncHandler(getTile));
router.get('/grid.json', asyncHandler(getGrid));
router.get('/grid.bin', asyncHandler(getGridBinary));

export default router;
