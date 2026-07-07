export const GAME_CHANNEL_ID = 'default';

export const PLAYER_RANKS = [
  'Rookie',
  'Detective',
  'Senior Detective',
  'Chief Detective',
] as const;

export const GAME_PHASES = [
  'idle',
  'scene_intro',
  'suspect_intro',
  'suspect_speaking',
  'investigation_open',
  'accusation_result',
  'timeout_reveal',
  'post_case',
] as const;

export const CASE_STATUSES = [
  'draft',
  'ready',
  'active',
  'solved',
  'expired',
  'culled',
] as const;

export type PlayerRank = (typeof PLAYER_RANKS)[number];
export type GamePhase = (typeof GAME_PHASES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type PlayerCommandName = 'examine' | 'ask' | 'accuse';

export type EvidenceItem = {
  name: string;
  detail: string;
};

export type GameSettings = {
  channelId: string;
  sceneIntroSeconds: number;
  suspectIntroGapSeconds: number;
  suspectStatementIntervalSeconds: number;
  postCaseCountdownSeconds: number;
  caseTimeoutMinutes: number;
  cooldownExamineSeconds: number;
  cooldownAskSeconds: number;
  cooldownAccuseSeconds: number;
};

export type GameState = {
  channelId: string;
  enabled: boolean;
  paused: boolean;
  activeCaseId: string | null;
  phase: GamePhase;
  currentSuspectIndex: number | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  pausedAt: string | null;
  lastEventId: string | null;
  updatedAt: string | null;
};

export type LeaderboardEntry = {
  twitchUserId: string;
  displayName: string;
  points: number;
  rank: PlayerRank;
  permanentTitle: string | null;
  casesSolved: number;
  correctAccusations: number;
  wrongAccusations: number;
  evidenceExaminedTotal: number;
  accusationAccuracy: number;
};

export type RuntimeCase = {
  id: string;
  sceneNarrative: string;
  victimName: string;
  victimDescription: string;
  victimAvatarUrl: string | null;
  solutionSummary?: string;
  evidenceItems?: EvidenceItem[];
  guiltySuspectId?: string | null;
  suspectCount: number;
  evidenceCount: number;
  status: Exclude<CaseStatus, 'culled' | 'draft'>;
};

export type RuntimeSuspect = {
  id: string;
  caseId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  sortOrder: number;
};

export type RuntimeGameEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AdminAction = 'start' | 'stop' | 'pause' | 'resume' | 'skip' | 'reload';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  channelId: GAME_CHANNEL_ID,
  sceneIntroSeconds: 30,
  suspectIntroGapSeconds: 5,
  suspectStatementIntervalSeconds: 75,
  postCaseCountdownSeconds: 20,
  caseTimeoutMinutes: 45,
  cooldownExamineSeconds: 3,
  cooldownAskSeconds: 10,
  cooldownAccuseSeconds: 20,
};

export const DEFAULT_GAME_STATE: GameState = {
  channelId: GAME_CHANNEL_ID,
  enabled: false,
  paused: false,
  activeCaseId: null,
  phase: 'idle',
  currentSuspectIndex: null,
  phaseStartedAt: null,
  phaseEndsAt: null,
  pausedAt: null,
  lastEventId: null,
  updatedAt: null,
};

export function calculateAccuracy(correctAccusations: number, wrongAccusations: number): number {
  const total = correctAccusations + wrongAccusations;

  if (total === 0) {
    return 0;
  }

  return Math.round((correctAccusations / total) * 100);
}

export function isGameplayPhaseOpen(phase: GamePhase): boolean {
  return phase === 'investigation_open';
}
