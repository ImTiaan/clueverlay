import { Router, type Request, type Response } from 'express';
import { getPublicLeaderboard, getPublicRuntime } from '../lib/gameService.js';

const router = Router();

router.get('/leaderboard', async (_req: Request, res: Response): Promise<void> => {
  try {
    const payload = await getPublicLeaderboard();
    res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: 'Unable to load leaderboard.',
    });
  }
});

router.get('/runtime', async (_req: Request, res: Response): Promise<void> => {
  try {
    const payload = await getPublicRuntime();
    res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: 'Unable to load runtime.',
    });
  }
});

export default router;
