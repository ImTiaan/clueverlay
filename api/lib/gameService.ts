import {
  DEFAULT_GAME_SETTINGS,
  GAME_CHANNEL_ID,
  type AdminAction,
  type EvidenceItem,
  type GamePhase,
  type GameSettings,
  type GameState,
  type LeaderboardEntry,
  type PlayerCommandName,
  type RuntimeCase,
  type RuntimeGameEvent,
  type RuntimeSuspect,
  calculateAccuracy,
  isGameplayPhaseOpen,
} from '../../shared/game.js';
import type { ParsedPlayerCommand } from './commandParser.js';
import { findFuzzyMatch } from './text.js';
import { supabaseAdmin } from './supabaseAdmin.js';
import { sendChatMessage } from './twitchApi.js';

type ChatActor = {
  userId: string;
  userName: string;
  isBroadcaster: boolean;
  isModerator: boolean;
};

type CommandResult = {
  handled: boolean;
  message: string | null;
};

type CaseBundle = {
  activeCase: RuntimeCase | null;
  suspects: RuntimeSuspect[];
};

type RuntimeContext = {
  gameState: GameState;
  settings: GameSettings;
  bundle: CaseBundle;
};

type SuspectStatements = {
  statementV1: string | null;
  statementV2: string | null;
};

const RESULT_HOLD_SECONDS = 3;

async function sendNarrationMessage(message: string | null): Promise<void> {
  if (!message) {
    return;
  }

  try {
    await sendChatMessage(message);
  } catch (error) {
    console.error('Unable to send automatic narration message.', error);
  }
}

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function shiftTimestamp(timestamp: string | null, milliseconds: number): string | null {
  if (!timestamp) {
    return null;
  }

  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function mapGameStateRow(row: Record<string, unknown>): GameState {
  return {
    channelId: String(row.channel_id),
    enabled: Boolean(row.enabled),
    paused: Boolean(row.paused),
    activeCaseId: (row.active_case_id as string | null) ?? null,
    phase: row.phase as GamePhase,
    currentSuspectIndex: (row.current_suspect_index as number | null) ?? null,
    phaseStartedAt: (row.phase_started_at as string | null) ?? null,
    phaseEndsAt: (row.phase_ends_at as string | null) ?? null,
    pausedAt: (row.paused_at as string | null) ?? null,
    lastEventId: (row.last_event_id as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

function mapSettingsRow(row: Record<string, unknown>): GameSettings {
  return {
    channelId: String(row.channel_id),
    joinWindowSeconds: Number(row.join_window_seconds ?? DEFAULT_GAME_SETTINGS.joinWindowSeconds),
    sceneIntroSeconds: Number(row.scene_intro_seconds),
    suspectIntroGapSeconds: Number(row.suspect_intro_gap_seconds),
    suspectStatementIntervalSeconds: Number(row.suspect_statement_interval_seconds),
    postCaseCountdownSeconds: Number(row.post_case_countdown_seconds),
    caseTimeoutMinutes: Number(row.case_timeout_minutes),
    cooldownExamineSeconds: Number(row.cooldown_examine_seconds),
    cooldownAskSeconds: Number(row.cooldown_ask_seconds),
    cooldownAccuseSeconds: Number(row.cooldown_accuse_seconds),
  };
}

function mapRuntimeCaseRow(row: Record<string, unknown>): RuntimeCase {
  return {
    id: String(row.id),
    sceneNarrative: String(row.scene_narrative),
    victimName: String(row.victim_name),
    victimDescription: String(row.victim_description),
    victimAvatarUrl: (row.victim_avatar_url as string | null) ?? null,
    solutionSummary: (row.solution_summary as string | undefined) ?? undefined,
    evidenceItems: ((row.evidence_items as EvidenceItem[] | null) ?? undefined),
    guiltySuspectId: (row.guilty_suspect_id as string | null) ?? undefined,
    suspectCount: Number(row.suspect_count),
    evidenceCount: Number(row.evidence_count),
    status: row.status as RuntimeCase['status'],
  };
}

function mapRuntimeSuspectRow(row: Record<string, unknown>): RuntimeSuspect {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    name: String(row.name),
    description: String(row.description),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    sortOrder: Number(row.sort_order),
  };
}

function mapLeaderboardEntryRow(row: Record<string, unknown>): LeaderboardEntry {
  const correct = Number(row.correct_accusations ?? 0);
  const wrong = Number(row.wrong_accusations ?? 0);

  return {
    twitchUserId: String(row.twitch_user_id),
    displayName: String(row.display_name),
    points: Number(row.points),
    rank: row.rank as LeaderboardEntry['rank'],
    permanentTitle: (row.permanent_title as string | null) ?? null,
    casesSolved: Number(row.cases_solved),
    correctAccusations: correct,
    wrongAccusations: wrong,
    evidenceExaminedTotal: Number(row.evidence_examined_total),
    accusationAccuracy: Number(row.accusation_accuracy ?? calculateAccuracy(correct, wrong)),
  };
}

async function getCurrentSeason(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('players')
    .select('season')
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.season ?? 1);
}

async function getGameStateRow(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('game_state')
    .select('*')
    .eq('channel_id', GAME_CHANNEL_ID)
    .single();

  if (error || !data) {
    throw new Error('Unable to load game state.');
  }

  return data;
}

async function getGameSettingsRow(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('game_settings')
    .select('*')
    .eq('channel_id', GAME_CHANNEL_ID)
    .single();

  if (error || !data) {
    return {
      channel_id: DEFAULT_GAME_SETTINGS.channelId,
      join_window_seconds: DEFAULT_GAME_SETTINGS.joinWindowSeconds,
      scene_intro_seconds: DEFAULT_GAME_SETTINGS.sceneIntroSeconds,
      suspect_intro_gap_seconds: DEFAULT_GAME_SETTINGS.suspectIntroGapSeconds,
      suspect_statement_interval_seconds: DEFAULT_GAME_SETTINGS.suspectStatementIntervalSeconds,
      post_case_countdown_seconds: DEFAULT_GAME_SETTINGS.postCaseCountdownSeconds,
      case_timeout_minutes: DEFAULT_GAME_SETTINGS.caseTimeoutMinutes,
      cooldown_examine_seconds: DEFAULT_GAME_SETTINGS.cooldownExamineSeconds,
      cooldown_ask_seconds: DEFAULT_GAME_SETTINGS.cooldownAskSeconds,
      cooldown_accuse_seconds: DEFAULT_GAME_SETTINGS.cooldownAccuseSeconds,
    };
  }

  return data;
}

async function updateGameState(patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from('game_state').update(patch).eq('channel_id', GAME_CHANNEL_ID);
}

async function createGameEvent(
  caseId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('game_events')
    .insert({
      case_id: caseId,
      event_type: eventType,
      payload,
    })
    .select('id')
    .single();

  if (error || !data) {
    return null;
  }

  return String(data.id);
}

async function getGameEventById(eventId: string | null): Promise<Record<string, unknown> | null> {
  if (!eventId) {
    return null;
  }

  const { data, error } = await supabaseAdmin.from('game_events').select('*').eq('id', eventId).maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getCaseStartedAt(caseId: string): Promise<Date | null> {
  const { data, error } = await supabaseAdmin
    .from('game_events')
    .select('created_at')
    .eq('case_id', caseId)
    .eq('event_type', 'case_started')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.created_at) {
    return null;
  }

  return new Date(String(data.created_at));
}

async function getActiveCaseBundle(activeCaseId: string | null): Promise<CaseBundle> {
  if (!activeCaseId) {
    return {
      activeCase: null,
      suspects: [],
    };
  }

  const { data: caseRow, error: caseError } = await supabaseAdmin
    .from('cases')
    .select('*')
    .eq('id', activeCaseId)
    .single();

  if (caseError || !caseRow) {
    return {
      activeCase: null,
      suspects: [],
    };
  }

  const { data: suspectRows } = await supabaseAdmin
    .from('suspects')
    .select('*')
    .eq('case_id', activeCaseId)
    .order('sort_order', { ascending: true });

  return {
    activeCase: mapRuntimeCaseRow(caseRow),
    suspects: (suspectRows ?? []).map(mapRuntimeSuspectRow),
  };
}

async function getSuspectStatements(suspectId: string): Promise<SuspectStatements> {
  const { data } = await supabaseAdmin
    .from('suspects')
    .select('statement_v1, statement_v2')
    .eq('id', suspectId)
    .maybeSingle();

  return {
    statementV1: typeof data?.statement_v1 === 'string' ? data.statement_v1 : null,
    statementV2: typeof data?.statement_v2 === 'string' ? data.statement_v2 : null,
  };
}

function getCurrentFeaturedSuspect(bundle: CaseBundle, suspectIndex: number | null): RuntimeSuspect | null {
  if (suspectIndex === null) {
    return null;
  }

  return bundle.suspects.find((suspect) => suspect.sortOrder === suspectIndex) ?? null;
}

function buildCaseStartNarration(activeCase: RuntimeCase | null): string {
  return 'Case started. Type !join to enter.';
}

function buildJoinConfirmationNarration(actor: ChatActor): string {
  return `@${actor.userName} joined to investigate. Follow the case and investigate to solve the case.`;
}

function buildCaseIntroNarration(activeCase: RuntimeCase | null): string | null {
  if (!activeCase) {
    return null;
  }

  return `Case file: ${activeCase.victimName}. ${activeCase.sceneNarrative}`.trim();
}

function buildEvidenceIntroNarrations(activeCase: RuntimeCase | null): string[] {
  if (!activeCase?.evidenceItems || activeCase.evidenceItems.length === 0) {
    return [];
  }

  const intro = 'Evidence recovered at the scene:';
  const entries = activeCase.evidenceItems.map((item) => `${item.name}: ${item.detail}`.trim());
  return [intro, ...entries];
}

function buildSuspectIntroNarration(suspect: RuntimeSuspect | null, position: number, total: number): string | null {
  if (!suspect) {
    return null;
  }

  return `Suspect ${position} of ${total}: ${suspect.name}. ${suspect.description}`;
}

function buildSuspectStatementNarration(
  label: 'Statement' | 'Follow-up',
  suspectName: string,
  statement: string | null,
): string | null {
  if (!statement) {
    return null;
  }

  return `${label} - ${suspectName}: ${statement}`;
}

function buildInvestigationOpenNarration(activeCase: RuntimeCase | null): string {
  if (!activeCase) {
    return 'Investigation open. Joined players can examine evidence, ask for repeats, and accuse.';
  }

  return `Investigation open on ${activeCase.victimName}. Joined players can use !examine, !ask <suspect>, or !accuse <suspect>. Type !join if you have not entered yet.`;
}

function buildPlayerHelpMessage(): string {
  return 'How to play: when a case starts, type !join to enter. Then use !examine <item>, !ask <suspect>, and !accuse <suspect> once investigation opens. Each player gets 2 accusations per case.';
}

async function ensurePlayer(actor: ChatActor): Promise<void> {
  await supabaseAdmin.from('players').upsert(
    {
      twitch_user_id: actor.userId,
      display_name: actor.userName,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'twitch_user_id',
      ignoreDuplicates: false,
    },
  );
}

async function getCaseProgress(playerId: string, caseId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('case_progress')
    .select('*')
    .eq('player_id', playerId)
    .eq('case_id', caseId)
    .maybeSingle();

  if (!error && data) {
    return data;
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('case_progress')
    .insert({
      player_id: playerId,
      case_id: caseId,
    })
    .select('*')
    .single();

  if (createError || !created) {
    throw new Error('Unable to initialise case progress.');
  }

  return created;
}

async function getCooldownViolation(
  playerId: string,
  commandName: PlayerCommandName,
  cooldownSeconds: number,
): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('player_command_cooldowns')
    .select('*')
    .eq('player_id', playerId)
    .eq('command_name', commandName)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const lastUsedAt = new Date(String(data.last_used_at)).getTime();
  const elapsedSeconds = Math.floor((Date.now() - lastUsedAt) / 1000);
  const remaining = cooldownSeconds - elapsedSeconds;

  return remaining > 0 ? remaining : null;
}

async function recordCooldown(playerId: string, commandName: PlayerCommandName): Promise<void> {
  await supabaseAdmin.from('player_command_cooldowns').upsert(
    {
      player_id: playerId,
      command_name: commandName,
      last_used_at: new Date().toISOString(),
    },
    {
      onConflict: 'player_id,command_name',
    },
  );
}

async function updatePlayerStats(
  playerId: string,
  updater: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const { data: current, error } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('twitch_user_id', playerId)
    .single();

  if (error || !current) {
    throw new Error('Unable to load player.');
  }

  await supabaseAdmin.from('players').update(updater(current)).eq('twitch_user_id', playerId);
}

function getCooldownForCommand(settings: GameSettings, commandName: PlayerCommandName): number {
  switch (commandName) {
    case 'examine':
      return settings.cooldownExamineSeconds;
    case 'ask':
      return settings.cooldownAskSeconds;
    case 'accuse':
      return settings.cooldownAccuseSeconds;
    default:
      return 0;
  }
}

async function getRuntimeContext(): Promise<RuntimeContext> {
  const gameState = mapGameStateRow(await getGameStateRow());
  const settings = mapSettingsRow(await getGameSettingsRow());
  const bundle = await getActiveCaseBundle(gameState.activeCaseId);

  return {
    gameState,
    settings,
    bundle,
  };
}

async function advanceRuntimeStep(targetNow: Date): Promise<boolean> {
  const { gameState, settings, bundle } = await getRuntimeContext();

  if (!gameState.enabled || gameState.paused) {
    return false;
  }

  if (!bundle.activeCase) {
    if (gameState.phase !== 'idle') {
      await updateGameState({
        enabled: false,
        paused: false,
        active_case_id: null,
        phase: 'idle',
        current_suspect_index: null,
        phase_started_at: null,
        phase_ends_at: null,
        paused_at: null,
        last_event_id: null,
        updated_at: targetNow.toISOString(),
      });

      return true;
    }

    return false;
  }

  if (gameState.phase !== 'timeout_reveal' && gameState.phase !== 'post_case') {
    const caseStartedAt = await getCaseStartedAt(bundle.activeCase.id);
    const timeoutAt = caseStartedAt
      ? caseStartedAt.getTime() + settings.caseTimeoutMinutes * 60 * 1000
      : null;

    if (timeoutAt && targetNow.getTime() >= timeoutAt) {
      const culprit =
        bundle.suspects.find((suspect) => suspect.id === bundle.activeCase?.guiltySuspectId) ?? null;
      const transitionAt = new Date(timeoutAt);
      const eventId = await createGameEvent(bundle.activeCase.id, 'timeout_reveal', {
        culpritSuspectId: culprit?.id ?? null,
        culpritSuspectName: culprit?.name ?? null,
        solutionSummary: bundle.activeCase.solutionSummary ?? null,
      });

      await supabaseAdmin
        .from('cases')
        .update({
          status: 'expired',
          updated_at: targetNow.toISOString(),
        })
        .eq('id', bundle.activeCase.id);

      await updateGameState({
        phase: 'timeout_reveal',
        current_suspect_index: culprit?.sortOrder ?? null,
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: addSeconds(transitionAt, RESULT_HOLD_SECONDS),
        last_event_id: eventId,
        updated_at: targetNow.toISOString(),
      });

      await sendNarrationMessage(
        `Time is up. ${culprit?.name ?? 'The culprit'} got away. ${bundle.activeCase.solutionSummary ?? ''}`.trim(),
      );

      return true;
    }
  }

  const phaseEndsAt = gameState.phaseEndsAt ? new Date(gameState.phaseEndsAt) : null;

  if (phaseEndsAt && targetNow.getTime() < phaseEndsAt.getTime()) {
    return false;
  }

  const transitionAt = phaseEndsAt ?? targetNow;

  switch (gameState.phase) {
    case 'join_open': {
      await updateGameState({
        phase: 'scene_intro',
        current_suspect_index: null,
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: addSeconds(transitionAt, settings.sceneIntroSeconds),
        updated_at: targetNow.toISOString(),
      });

      await sendNarrationMessage(buildCaseIntroNarration(bundle.activeCase));
      for (const message of buildEvidenceIntroNarrations(bundle.activeCase)) {
        await sendNarrationMessage(message);
      }
      return true;
    }

    case 'scene_intro': {
      const nextSuspect = getCurrentFeaturedSuspect(bundle, 0);
      await updateGameState({
        phase: 'suspect_intro',
        current_suspect_index: 0,
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: addSeconds(transitionAt, settings.suspectIntroGapSeconds),
        updated_at: targetNow.toISOString(),
      });
      await sendNarrationMessage(buildSuspectIntroNarration(nextSuspect, 1, bundle.suspects.length));
      return true;
    }

    case 'suspect_intro': {
      const currentIndex = gameState.currentSuspectIndex ?? 0;
      const currentSuspect = getCurrentFeaturedSuspect(bundle, currentIndex);
      const statements = currentSuspect ? await getSuspectStatements(currentSuspect.id) : null;

      await updateGameState({
        phase: 'suspect_speaking',
        current_suspect_index: currentIndex,
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: addSeconds(transitionAt, settings.suspectStatementIntervalSeconds),
        updated_at: targetNow.toISOString(),
      });
      await sendNarrationMessage(
        buildSuspectStatementNarration(
          'Statement',
          currentSuspect?.name ?? 'Suspect',
          statements?.statementV1 ?? statements?.statementV2 ?? null,
        ),
      );
      return true;
    }

    case 'suspect_speaking': {
      const currentIndex = gameState.currentSuspectIndex ?? 0;
      const nextIndex = currentIndex + 1;

      if (nextIndex < bundle.suspects.length) {
        const nextSuspect = getCurrentFeaturedSuspect(bundle, nextIndex);
        await updateGameState({
          phase: 'suspect_intro',
          current_suspect_index: nextIndex,
          phase_started_at: transitionAt.toISOString(),
          phase_ends_at: addSeconds(transitionAt, settings.suspectIntroGapSeconds),
          updated_at: targetNow.toISOString(),
        });
        await sendNarrationMessage(
          buildSuspectIntroNarration(nextSuspect, nextIndex + 1, bundle.suspects.length),
        );
        return true;
      }

      await updateGameState({
        phase: 'investigation_open',
        current_suspect_index: currentIndex,
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: null,
        updated_at: targetNow.toISOString(),
      });
      await sendNarrationMessage(buildInvestigationOpenNarration(bundle.activeCase));
      return true;
    }

    case 'accusation_result': {
      const event = await getGameEventById(gameState.lastEventId);
      const payload = (event?.payload as Record<string, unknown> | undefined) ?? {};

      if (payload.correct === true) {
        await updateGameState({
          phase: 'post_case',
          phase_started_at: transitionAt.toISOString(),
          phase_ends_at: addSeconds(transitionAt, settings.postCaseCountdownSeconds),
          updated_at: targetNow.toISOString(),
        });
        return true;
      }

      await updateGameState({
        phase: 'investigation_open',
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: null,
        updated_at: targetNow.toISOString(),
      });
      return true;
    }

    case 'timeout_reveal': {
      await updateGameState({
        phase: 'post_case',
        phase_started_at: transitionAt.toISOString(),
        phase_ends_at: addSeconds(transitionAt, settings.postCaseCountdownSeconds),
        updated_at: targetNow.toISOString(),
      });
      return true;
    }

    case 'post_case': {
      await activateNextReadyCase(true);
      return true;
    }

    case 'idle':
    case 'investigation_open':
    default:
      return false;
  }
}

export async function advanceRuntimeToNow(maxSteps = 25): Promise<void> {
  const now = new Date();

  for (let step = 0; step < maxSteps; step += 1) {
    const advanced = await advanceRuntimeStep(now);

    if (!advanced) {
      return;
    }
  }
}

export async function activateNextReadyCase(announceToChat = false): Promise<{ caseId: string | null; message: string }> {
  const settings = mapSettingsRow(await getGameSettingsRow());
  const { data: nextCase } = await supabaseAdmin
    .from('cases')
    .select('id, scene_narrative, victim_name, victim_description, victim_avatar_url, solution_summary, evidence_items, guilty_suspect_id, suspect_count, evidence_count, status')
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextCase) {
    await updateGameState({
      enabled: false,
      paused: false,
      active_case_id: null,
      phase: 'idle',
      current_suspect_index: null,
      phase_started_at: null,
      phase_ends_at: null,
      paused_at: null,
      last_event_id: null,
      updated_at: new Date().toISOString(),
    });

    return {
      caseId: null,
      message: 'No ready cases available.',
    };
  }

  const now = new Date();
  const eventId = await createGameEvent(String(nextCase.id), 'case_started', {});

  await supabaseAdmin
    .from('cases')
    .update({
      status: 'active',
      updated_at: now.toISOString(),
    })
    .eq('id', nextCase.id);

  await updateGameState({
    enabled: true,
    paused: false,
    active_case_id: nextCase.id,
    phase: 'join_open',
    current_suspect_index: null,
    phase_started_at: now.toISOString(),
    phase_ends_at: addSeconds(now, settings.joinWindowSeconds),
    paused_at: null,
    last_event_id: eventId,
    updated_at: now.toISOString(),
  });

  if (announceToChat) {
    await sendNarrationMessage(
      `${buildCaseStartNarration(mapRuntimeCaseRow(nextCase))} Joining closes in ${settings.joinWindowSeconds}s.`,
    );
  }

  return {
    caseId: String(nextCase.id),
    message: 'Case started. Type !join to enter.',
  };
}

export async function getPublicLeaderboard(): Promise<{ season: number; entries: LeaderboardEntry[] }> {
  const season = await getCurrentSeason();
  const { data, error } = await supabaseAdmin
    .from('public_leaderboard')
    .select('*')
    .eq('season', season)
    .order('points', { ascending: false })
    .order('cases_solved', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error('Unable to load leaderboard.');
  }

  return {
    season,
    entries: (data ?? []).map(mapLeaderboardEntryRow),
  };
}

export async function getPublicRuntime(): Promise<{
  gameState: GameState;
  settings: GameSettings;
  activeCase: RuntimeCase | null;
  suspects: RuntimeSuspect[];
  lastEvent: RuntimeGameEvent | null;
}> {
  await advanceRuntimeToNow();
  const gameStateRow = await getGameStateRow();
  const settingsRow = await getGameSettingsRow();
  const gameState = mapGameStateRow(gameStateRow);
  const settings = mapSettingsRow(settingsRow);
  const bundle = await getActiveCaseBundle(gameState.activeCaseId);
  const lastEventRow = await getGameEventById(gameState.lastEventId);

  return {
    gameState,
    settings,
    activeCase: bundle.activeCase,
    suspects: bundle.suspects,
    lastEvent: lastEventRow
      ? {
          id: String(lastEventRow.id),
          eventType: String(lastEventRow.event_type),
          payload: (lastEventRow.payload as Record<string, unknown> | null) ?? {},
          createdAt: String(lastEventRow.created_at),
        }
      : null,
  };
}

export async function applyAdminAction(action: AdminAction | 'status'): Promise<CommandResult> {
  await advanceRuntimeToNow();
  const stateRow = await getGameStateRow();
  const gameState = mapGameStateRow(stateRow);

  if (action === 'status') {
    return {
      handled: true,
      message: `Game ${gameState.enabled ? 'enabled' : 'disabled'} • ${gameState.paused ? 'paused' : 'live'} • phase: ${gameState.phase}`,
    };
  }

  if (action === 'start') {
    return activateNextReadyCase(true).then(({ message }) => ({ handled: true, message }));
  }

  if (action === 'stop') {
    if (gameState.activeCaseId) {
      await supabaseAdmin
        .from('cases')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameState.activeCaseId);
    }

    await updateGameState({
      enabled: false,
      paused: false,
      active_case_id: null,
      phase: 'idle',
      current_suspect_index: null,
      phase_started_at: null,
      phase_ends_at: null,
      paused_at: null,
      last_event_id: null,
      updated_at: new Date().toISOString(),
    });

    return {
      handled: true,
      message: 'Game stopped. Overlay hidden.',
    };
  }

  if (action === 'pause') {
    await updateGameState({
      paused: true,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return {
      handled: true,
      message: 'Game paused. Narration and timers are frozen.',
    };
  }

  if (action === 'resume') {
    const resumedAt = new Date();
    const pausedAt = gameState.pausedAt ? new Date(gameState.pausedAt) : null;
    const pausedForMs = pausedAt ? resumedAt.getTime() - pausedAt.getTime() : 0;

    await updateGameState({
      enabled: true,
      paused: false,
      paused_at: null,
      phase_started_at: shiftTimestamp(gameState.phaseStartedAt, pausedForMs),
      phase_ends_at: shiftTimestamp(gameState.phaseEndsAt, pausedForMs),
      updated_at: resumedAt.toISOString(),
    });

    return {
      handled: true,
      message: 'Game resumed.',
    };
  }

  if (action === 'skip') {
    if (gameState.activeCaseId) {
      await supabaseAdmin
        .from('cases')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameState.activeCaseId);
    }

    return activateNextReadyCase(true).then(({ message }) => ({
      handled: true,
      message: gameState.activeCaseId ? `Case skipped. ${message}` : message,
    }));
  }

  await advanceRuntimeToNow();

  return {
    handled: true,
    message: 'Runtime reloaded.',
  };
}

export async function processChatCommand(
  actor: ChatActor,
  parsedCommand: ParsedPlayerCommand | null,
): Promise<CommandResult> {
  if (!parsedCommand) {
    return {
      handled: false,
      message: null,
    };
  }

  if (parsedCommand.kind === 'admin') {
    if (!actor.isBroadcaster && !actor.isModerator) {
      return {
        handled: true,
        message: 'Only the broadcaster or moderators can control the case.',
      };
    }

    return applyAdminAction(parsedCommand.command);
  }

  if (parsedCommand.kind === 'info') {
    return {
      handled: true,
      message: buildPlayerHelpMessage(),
    };
  }

  const runtime = await getPublicRuntime();

  if (parsedCommand.command === 'join') {
    if (!runtime.gameState.enabled || !runtime.activeCase) {
      return {
        handled: true,
        message: 'No active case to join right now. Use !case to see how the game works.',
      };
    }

    await ensurePlayer(actor);
    const caseProgress = await getCaseProgress(actor.userId, runtime.activeCase.id);

    if (caseProgress.joined_at) {
      return {
        handled: true,
        message:
          runtime.gameState.phase === 'investigation_open'
            ? 'You are already in this case. Use !examine, !ask <suspect>, or !accuse <suspect>.'
            : 'You are already in this case. Wait for investigation to open.',
      };
    }

    await supabaseAdmin
      .from('case_progress')
      .update({
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', actor.userId)
      .eq('case_id', runtime.activeCase.id);

    return {
      handled: true,
      message:
        runtime.gameState.phase === 'investigation_open'
          ? `${buildJoinConfirmationNarration(actor)} Use !examine <item>, !ask <suspect>, or !accuse <suspect>.`
          : buildJoinConfirmationNarration(actor),
    };
  }

  if (!runtime.gameState.enabled || !runtime.activeCase) {
    return {
      handled: true,
      message: 'No active investigation right now.',
    };
  }

  if (runtime.gameState.paused) {
    return {
      handled: true,
      message: 'The case is paused.',
    };
  }

  if (!isGameplayPhaseOpen(runtime.gameState.phase)) {
    return {
      handled: true,
      message: 'All suspects must speak first. Investigating...',
    };
  }

  await ensurePlayer(actor);
  const caseProgress = await getCaseProgress(actor.userId, runtime.activeCase.id);

  if (!caseProgress.joined_at) {
    return {
      handled: true,
      message: 'Type !join to enter this case before using investigation commands.',
    };
  }

  const cooldownSeconds = getCooldownForCommand(runtime.settings, parsedCommand.command);
  const remainingCooldown = await getCooldownViolation(
    actor.userId,
    parsedCommand.command,
    cooldownSeconds,
  );

  if (remainingCooldown) {
    return {
      handled: true,
      message: `Too fast. Try again in ${remainingCooldown}s.`,
    };
  }

  await recordCooldown(actor.userId, parsedCommand.command);

  if (parsedCommand.command === 'examine') {
    const evidenceMatch = findFuzzyMatch(parsedCommand.query, runtime.activeCase.evidenceItems ?? [], (item) => item.name);

    if (!evidenceMatch) {
      return {
        handled: true,
        message: 'Item not found in this scene.',
      };
    }

    const examinedItems = ((caseProgress.examined_items as string[] | null) ?? []).slice();
    const alreadyExamined = examinedItems.includes(evidenceMatch.name);

    if (!alreadyExamined) {
      examinedItems.push(evidenceMatch.name);

      await supabaseAdmin
        .from('case_progress')
        .update({
          examined_items: examinedItems,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', actor.userId)
        .eq('case_id', runtime.activeCase.id);

      await updatePlayerStats(actor.userId, (current) => ({
        points: Number(current.points ?? 0) + 1,
        evidence_examined_total: Number(current.evidence_examined_total ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }));
    }

    return {
      handled: true,
      message: evidenceMatch.detail,
    };
  }

  const suspectMatch = findFuzzyMatch(parsedCommand.query, runtime.suspects, (suspect) => suspect.name);

  if (!suspectMatch) {
    return {
      handled: true,
      message: `${parsedCommand.query} not found. Check spelling.`,
    };
  }

  if (parsedCommand.command === 'ask') {
    const { data: suspectRow } = await supabaseAdmin
      .from('suspects')
      .select('statement_v1, statement_v2')
      .eq('id', suspectMatch.id)
      .single();

    const statementsRequested = Number(caseProgress.statements_requested ?? 0) + 1;

    await supabaseAdmin
      .from('case_progress')
      .update({
        statements_requested: statementsRequested,
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', actor.userId)
      .eq('case_id', runtime.activeCase.id);

    const statement = suspectRow?.statement_v2 ?? suspectRow?.statement_v1 ?? '';

    return {
      handled: true,
      message: buildSuspectStatementNarration('Follow-up', suspectMatch.name, statement),
    };
  }

  const guessCount = Number(caseProgress.guess_count ?? 0);

  if (guessCount >= 2) {
    return {
      handled: true,
      message: 'No more accusations left for this case.',
    };
  }

  const accusations = ((caseProgress.accusations as Array<Record<string, unknown>> | null) ?? []).slice();
  const isCorrect = suspectMatch.id === runtime.activeCase.guiltySuspectId;

  accusations.push({
    suspect_name: suspectMatch.name,
    timestamp: new Date().toISOString(),
    result: isCorrect ? 'correct' : 'wrong',
  });

  await supabaseAdmin
    .from('case_progress')
    .update({
      accusations,
      guess_count: guessCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', actor.userId)
    .eq('case_id', runtime.activeCase.id);

  if (isCorrect) {
    const reward = guessCount > 0 ? 30 : 50;
    const now = new Date();

    await updatePlayerStats(actor.userId, (current) => ({
      points: Number(current.points ?? 0) + reward,
      cases_solved: Number(current.cases_solved ?? 0) + 1,
      correct_accusations: Number(current.correct_accusations ?? 0) + 1,
      last_case_accused: runtime.activeCase?.id ?? null,
      updated_at: new Date().toISOString(),
    }));

    await supabaseAdmin
      .from('cases')
      .update({
        status: 'solved',
        updated_at: now.toISOString(),
      })
      .eq('id', runtime.activeCase.id);

    const eventId = await createGameEvent(runtime.activeCase.id, 'accusation_result', {
      correct: true,
      accusedSuspectId: suspectMatch.id,
      accusedSuspectName: suspectMatch.name,
      actorUserId: actor.userId,
      actorUserName: actor.userName,
    });

    await updateGameState({
      phase: 'accusation_result',
      current_suspect_index: suspectMatch.sortOrder,
      phase_started_at: now.toISOString(),
      phase_ends_at: addSeconds(now, RESULT_HOLD_SECONDS),
      last_event_id: eventId,
      updated_at: now.toISOString(),
    });

    return {
      handled: true,
      message: `GUILTY. ${suspectMatch.name} did it. ${runtime.activeCase.solutionSummary ?? ''}`.trim(),
    };
  }

  await updatePlayerStats(actor.userId, (current) => ({
    points: Number(current.points ?? 0) - 10,
    wrong_accusations: Number(current.wrong_accusations ?? 0) + 1,
    last_case_accused: runtime.activeCase?.id ?? null,
    updated_at: new Date().toISOString(),
  }));

  const now = new Date();
  const eventId = await createGameEvent(runtime.activeCase.id, 'accusation_result', {
    correct: false,
    accusedSuspectId: suspectMatch.id,
    accusedSuspectName: suspectMatch.name,
    actorUserId: actor.userId,
    actorUserName: actor.userName,
  });

  await updateGameState({
    phase: 'accusation_result',
    current_suspect_index: suspectMatch.sortOrder,
    phase_started_at: now.toISOString(),
    phase_ends_at: addSeconds(now, RESULT_HOLD_SECONDS),
    last_event_id: eventId,
    updated_at: now.toISOString(),
  });

  return {
    handled: true,
    message: `INNOCENT. ${suspectMatch.name} is not your culprit.`,
  };
}

export async function runSchedulerTick(): Promise<void> {
  await advanceRuntimeToNow();
}
