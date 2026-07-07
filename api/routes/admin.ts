import { Router, type Request, type Response } from 'express';
import { DEFAULT_GAME_SETTINGS, GAME_CHANNEL_ID } from '../../shared/game.js';
import { applyAdminAction } from '../lib/gameService.js';
import { getServerEnv } from '../lib/env.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

function isAuthorized(password: string | undefined): boolean {
  return password === getServerEnv().adminPassword;
}

router.post('/control', async (req: Request, res: Response): Promise<void> => {
  const { password, action } = req.body as {
    password?: string;
    action?: string;
  };

  if (!isAuthorized(password)) {
    res.status(401).json({
      success: false,
      error: 'Invalid admin password.',
    });
    return;
  }

  if (!action) {
    res.status(400).json({
      success: false,
      error: 'Missing admin action.',
    });
    return;
  }

  try {
    const result = await applyAdminAction(action as Parameters<typeof applyAdminAction>[0]);
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (_error) {
    res.status(500).json({
      success: false,
      error: 'Unable to update game state.',
    });
  }
});

router.post('/settings', async (req: Request, res: Response): Promise<void> => {
  const { password, settings } = req.body as {
    password?: string;
    settings?: Partial<typeof DEFAULT_GAME_SETTINGS>;
  };

  if (!isAuthorized(password)) {
    res.status(401).json({
      success: false,
      error: 'Invalid admin password.',
    });
    return;
  }

  const payload = {
    scene_intro_seconds: settings?.sceneIntroSeconds ?? DEFAULT_GAME_SETTINGS.sceneIntroSeconds,
    suspect_intro_gap_seconds:
      settings?.suspectIntroGapSeconds ?? DEFAULT_GAME_SETTINGS.suspectIntroGapSeconds,
    suspect_statement_interval_seconds:
      settings?.suspectStatementIntervalSeconds ??
      DEFAULT_GAME_SETTINGS.suspectStatementIntervalSeconds,
    post_case_countdown_seconds:
      settings?.postCaseCountdownSeconds ?? DEFAULT_GAME_SETTINGS.postCaseCountdownSeconds,
    case_timeout_minutes: settings?.caseTimeoutMinutes ?? DEFAULT_GAME_SETTINGS.caseTimeoutMinutes,
    cooldown_examine_seconds:
      settings?.cooldownExamineSeconds ?? DEFAULT_GAME_SETTINGS.cooldownExamineSeconds,
    cooldown_ask_seconds: settings?.cooldownAskSeconds ?? DEFAULT_GAME_SETTINGS.cooldownAskSeconds,
    cooldown_accuse_seconds:
      settings?.cooldownAccuseSeconds ?? DEFAULT_GAME_SETTINGS.cooldownAccuseSeconds,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('game_settings')
    .update(payload)
    .eq('channel_id', GAME_CHANNEL_ID)
    .select('*')
    .single();

  if (error) {
    res.status(500).json({
      success: false,
      error: 'Unable to update settings.',
    });
    return;
  }

  res.status(200).json({
    success: true,
    settings: data,
  });
});

export default router;
