import { useEffect, useMemo, useState } from 'react';
import { PhaseBadge } from '@/components/overlay/PhaseBadge';
import type {
  GamePhase,
  GameSettings,
  GameState,
  RuntimeCase,
  RuntimeGameEvent,
  RuntimeSuspect,
} from '../../shared/game';

type RuntimePayload = {
  gameState: GameState;
  settings: GameSettings;
  activeCase: RuntimeCase | null;
  suspects: RuntimeSuspect[];
  lastEvent: RuntimeGameEvent | null;
};

type AccusationResultPayload = {
  correct: boolean | null;
  accusedSuspectId: string | null;
  accusedSuspectName: string | null;
  actorUserName: string | null;
};

type TimeoutRevealPayload = {
  culpritSuspectId: string | null;
  culpritSuspectName: string | null;
  solutionSummary: string | null;
};

type DisplayCard = {
  mode: 'profile' | 'board';
  shellHeight: number;
  eyebrow: string;
  title: string;
  description: string;
  portraitUrl: string | null;
  portraitName: string;
  accentClass: string;
  surfaceClass: string;
  statLine: string | null;
  suspectNames?: string[];
  evidenceNames?: string[];
  hintLine?: string;
};

type RenderState = {
  card: DisplayCard;
  phase: GamePhase;
  signature: string;
};

const OVERLAY_SHELL_WIDTH = 384;
const PROFILE_SHELL_HEIGHT = 308;
const BOARD_SHELL_HEIGHT = 430;
const OVERLAY_BOTTOM_MARGIN = 48;
const OVERLAY_ENTER_OFFSET = 160;
const OVERLAY_EXIT_MS = 320;
const OVERLAY_ENTER_MS = 420;

function getStringValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getBooleanValue(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  return typeof value === 'boolean' ? value : null;
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'TC';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function getPhaseTitle(phase: GamePhase): string {
  switch (phase) {
    case 'scene_intro':
      return 'Scene Intro';
    case 'suspect_intro':
      return 'Suspect Intro';
    case 'suspect_speaking':
      return 'Suspect Focus';
    case 'investigation_open':
      return 'Investigation Live';
    case 'accusation_result':
      return 'Verdict';
    case 'timeout_reveal':
      return 'Case Timeout';
    case 'post_case':
      return 'Case Closed';
    default:
      return 'Standby';
  }
}

function parseAccusationResult(lastEvent: RuntimeGameEvent | null): AccusationResultPayload | null {
  if (!lastEvent || lastEvent.eventType !== 'accusation_result') {
    return null;
  }

  return {
    correct: getBooleanValue(lastEvent.payload, 'correct'),
    accusedSuspectId: getStringValue(lastEvent.payload, 'accusedSuspectId'),
    accusedSuspectName: getStringValue(lastEvent.payload, 'accusedSuspectName'),
    actorUserName: getStringValue(lastEvent.payload, 'actorUserName'),
  };
}

function parseTimeoutReveal(lastEvent: RuntimeGameEvent | null): TimeoutRevealPayload | null {
  if (!lastEvent || lastEvent.eventType !== 'timeout_reveal') {
    return null;
  }

  return {
    culpritSuspectId: getStringValue(lastEvent.payload, 'culpritSuspectId'),
    culpritSuspectName: getStringValue(lastEvent.payload, 'culpritSuspectName'),
    solutionSummary: getStringValue(lastEvent.payload, 'solutionSummary'),
  };
}

function findSuspect(
  suspects: RuntimeSuspect[],
  suspectId: string | null,
  suspectName: string | null,
): RuntimeSuspect | null {
  if (suspectId) {
    const byId = suspects.find((suspect) => suspect.id === suspectId);
    if (byId) {
      return byId;
    }
  }

  if (suspectName) {
    const byName = suspects.find((suspect) => suspect.name === suspectName);
    if (byName) {
      return byName;
    }
  }

  return null;
}

function Portrait({
  name,
  imageUrl,
  accentClass,
}: {
  name: string;
  imageUrl: string | null;
  accentClass: string;
}) {
  return (
    <div
      className={`relative h-28 w-28 shrink-0 overflow-hidden rounded-[22px] border ${accentClass} bg-[#111615]`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0C2D24] to-[#111615] text-3xl font-semibold tracking-[0.12em] text-[#F6F8F7]">
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

export default function OverlayPage() {
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntime() {
      try {
        const response = await fetch('/api/runtime');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load runtime.');
        }

        if (!cancelled) {
          setRuntime(payload);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load runtime.');
        }
      }
    }

    void loadRuntime();

    const intervalId = window.setInterval(() => {
      void loadRuntime();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const phase = runtime?.gameState.phase ?? 'idle';
  const currentIndex = runtime?.gameState.currentSuspectIndex ?? null;
  const currentSuspect =
    currentIndex === null
      ? null
      : runtime?.suspects.find((suspect) => suspect.sortOrder === currentIndex) ?? null;
  const accusationResult = useMemo(() => parseAccusationResult(runtime?.lastEvent ?? null), [runtime?.lastEvent]);
  const timeoutReveal = useMemo(() => parseTimeoutReveal(runtime?.lastEvent ?? null), [runtime?.lastEvent]);

  const accusedSuspect = useMemo(
    () =>
      findSuspect(
        runtime?.suspects ?? [],
        accusationResult?.accusedSuspectId ?? null,
        accusationResult?.accusedSuspectName ?? null,
      ),
    [accusationResult?.accusedSuspectId, accusationResult?.accusedSuspectName, runtime?.suspects],
  );

  const culpritSuspect = useMemo(
    () =>
      findSuspect(
        runtime?.suspects ?? [],
        timeoutReveal?.culpritSuspectId ?? null,
        timeoutReveal?.culpritSuspectName ?? null,
      ),
    [runtime?.suspects, timeoutReveal?.culpritSuspectId, timeoutReveal?.culpritSuspectName],
  );
  const shouldHideOverlay = Boolean(
    !error &&
      (!runtime ||
        !runtime.gameState.enabled ||
        runtime.gameState.paused ||
        !runtime.activeCase),
  );

  const displayCard = useMemo<DisplayCard>(() => {
    const activeCase = runtime?.activeCase ?? null;
    const suspectCount = runtime?.suspects.length ?? 0;
    const evidenceCount = activeCase?.evidenceItems?.length ?? activeCase?.evidenceCount ?? 0;

    if (!runtime?.gameState.enabled || !activeCase) {
      return {
        mode: 'profile',
        shellHeight: PROFILE_SHELL_HEIGHT,
        eyebrow: 'System Standby',
        title: 'Awaiting next case',
        description: 'Enable the game to push the next investigation live to chat and overlay.',
        portraitUrl: null,
        portraitName: 'The Case',
        accentClass: 'border-[#303234]',
        surfaceClass: 'border-[#303234] bg-gradient-to-b from-[#111615] via-[#0C2D24] to-[#040806]',
        statLine: null,
      };
    }

    if (phase === 'scene_intro') {
      return {
        mode: 'profile',
        shellHeight: PROFILE_SHELL_HEIGHT,
        eyebrow: 'Victim Profile',
        title: activeCase.victimName,
        description: activeCase.victimDescription,
        portraitUrl: activeCase.victimAvatarUrl,
        portraitName: activeCase.victimName,
        accentClass: 'border-[#1BAA7D]/45',
        surfaceClass: 'border-[#053F33] bg-gradient-to-b from-[#0C2D24] via-[#111615] to-[#040806]',
        statLine: 'Victim profile',
      };
    }

    if (phase === 'suspect_intro' || phase === 'suspect_speaking') {
      const suspect = currentSuspect;

      return {
        mode: 'profile',
        shellHeight: PROFILE_SHELL_HEIGHT,
        eyebrow: phase === 'suspect_speaking' ? 'Now Speaking' : 'Suspect Introduction',
        title: suspect?.name ?? 'Suspect incoming',
        description: suspect?.description ?? 'The next suspect profile is loading.',
        portraitUrl: suspect?.avatarUrl ?? null,
        portraitName: suspect?.name ?? 'Suspect',
        accentClass: 'border-[#1BAA7D]/45',
        surfaceClass: 'border-[#053F33] bg-gradient-to-b from-[#0C2D24] via-[#111615] to-[#040806]',
        statLine:
          currentIndex !== null ? `Suspect ${currentIndex + 1} of ${Math.max(suspectCount, currentIndex + 1)}` : null,
      };
    }

    if (phase === 'investigation_open') {
      return {
        mode: 'board',
        shellHeight: BOARD_SHELL_HEIGHT,
        eyebrow: 'Investigation Open',
        title: activeCase.victimName,
        description: activeCase.victimDescription,
        portraitUrl: activeCase.victimAvatarUrl,
        portraitName: activeCase.victimName,
        accentClass: 'border-[#2ED9B0]/50',
        surfaceClass: 'border-[#1BAA7D]/45 bg-gradient-to-b from-[#0C2D24] via-[#111615] to-[#040806]',
        statLine: `${suspectCount} suspects • ${evidenceCount} evidence`,
        suspectNames: (runtime?.suspects ?? []).map((suspect) => suspect.name),
        evidenceNames: (activeCase.evidenceItems ?? []).map((item) => item.name),
        hintLine: '!ask <suspect>  !examine <item>  !accuse <suspect>',
      };
    }

    if (phase === 'accusation_result') {
      const resultSuspect = accusedSuspect ?? currentSuspect;
      const correct = accusationResult?.correct === true;

      return {
        mode: 'profile',
        shellHeight: PROFILE_SHELL_HEIGHT,
        eyebrow: correct ? 'Verdict: Guilty' : 'Verdict: Innocent',
        title: resultSuspect?.name ?? accusationResult?.accusedSuspectName ?? 'Verdict incoming',
        description:
          resultSuspect?.description ??
          (correct ? 'The culprit has been identified.' : 'This suspect has been cleared.'),
        portraitUrl: resultSuspect?.avatarUrl ?? null,
        portraitName: resultSuspect?.name ?? accusationResult?.accusedSuspectName ?? 'Suspect',
        accentClass: correct ? 'border-[#2ED9B0]/55' : 'border-[#6D7572]',
        surfaceClass: correct
          ? 'border-[#1BAA7D]/45 bg-gradient-to-b from-[#0C2D24] via-[#111615] to-[#040806]'
          : 'border-[#303234] bg-gradient-to-b from-[#111615] via-[#0C2D24] to-[#040806]',
        statLine: accusationResult?.actorUserName
          ? `${correct ? 'Correct call' : 'Wrong call'} • ${accusationResult.actorUserName}`
          : correct
            ? 'Case solved'
            : 'Investigation continues',
      };
    }

    if (phase === 'timeout_reveal') {
      const suspect = culpritSuspect ?? currentSuspect;

      return {
        mode: 'profile',
        shellHeight: PROFILE_SHELL_HEIGHT,
        eyebrow: 'Verdict: Got Away',
        title: suspect?.name ?? timeoutReveal?.culpritSuspectName ?? 'Unknown culprit',
        description:
          suspect?.description ?? 'Time expired before chat could land the right accusation.',
        portraitUrl: suspect?.avatarUrl ?? null,
        portraitName: suspect?.name ?? timeoutReveal?.culpritSuspectName ?? 'Culprit',
        accentClass: 'border-[#303234]',
        surfaceClass: 'border-[#303234] bg-gradient-to-b from-[#111615] via-[#0C2D24] to-[#040806]',
        statLine: 'Case expired',
      };
    }

    return {
      mode: 'profile',
      shellHeight: PROFILE_SHELL_HEIGHT,
      eyebrow: 'Case Closed',
      title: activeCase.victimName,
      description: activeCase.victimDescription,
      portraitUrl: activeCase.victimAvatarUrl,
      portraitName: activeCase.victimName,
      accentClass: 'border-[#053F33]',
      surfaceClass: 'border-[#053F33] bg-gradient-to-b from-[#0C2D24] via-[#111615] to-[#040806]',
      statLine: 'Post-case state',
    };
  }, [
    accusationResult?.accusedSuspectName,
    accusationResult?.actorUserName,
    accusationResult?.correct,
    accusedSuspect,
    currentIndex,
    currentSuspect,
    culpritSuspect,
    phase,
    runtime?.activeCase,
    runtime?.gameState.enabled,
    runtime?.suspects,
    timeoutReveal?.culpritSuspectName,
    timeoutReveal?.solutionSummary,
  ]);
  const displaySignature = useMemo(
    () =>
      [
        phase,
        displayCard.mode,
        displayCard.shellHeight,
        displayCard.eyebrow,
        displayCard.title,
        displayCard.description,
        displayCard.statLine ?? '',
        (displayCard.suspectNames ?? []).join('|'),
        (displayCard.evidenceNames ?? []).join('|'),
      ].join('::'),
    [
      displayCard.description,
      displayCard.evidenceNames,
      displayCard.eyebrow,
      displayCard.mode,
      displayCard.shellHeight,
      displayCard.statLine,
      displayCard.suspectNames,
      displayCard.title,
      phase,
    ],
  );
  const renderSignature = renderState?.signature ?? null;

  useEffect(() => {
    let timeoutId: number | null = null;

    if (shouldHideOverlay) {
      if (renderSignature) {
        setIsVisible(false);
        timeoutId = window.setTimeout(() => {
          setRenderState(null);
        }, OVERLAY_EXIT_MS);
      }

      return () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    if (!renderSignature) {
      setRenderState({
        card: displayCard,
        phase,
        signature: displaySignature,
      });

      return;
    }

    if (renderSignature !== displaySignature) {
      setIsVisible(false);
      timeoutId = window.setTimeout(() => {
        setRenderState({
          card: displayCard,
          phase,
          signature: displaySignature,
        });
      }, OVERLAY_EXIT_MS);

      return () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    if (!isVisible) {
      timeoutId = window.setTimeout(() => {
        setIsVisible(true);
      }, 16);
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [displayCard, displaySignature, isVisible, phase, renderSignature, shouldHideOverlay]);

  if (!renderState && shouldHideOverlay) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  if (!renderState) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  const activePhase = renderState.phase;
  const activeCard = renderState.card;

  return (
    <div className="h-screen w-screen bg-transparent">
      <div
        className="pointer-events-none fixed bottom-0 left-1/2"
        style={{
          transform: 'translateX(-50%)',
          width: `${OVERLAY_SHELL_WIDTH}px`,
          height: `${activeCard.shellHeight}px`,
          bottom: `${OVERLAY_BOTTOM_MARGIN}px`,
        }}
      >
        <div
          className="h-full w-full rounded-[30px] border border-[#0C2D24] bg-[#040806] p-5 transition-[height,opacity,transform]"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translate3d(0, 0, 0)' : `translate3d(0, ${OVERLAY_ENTER_OFFSET}px, 0)`,
            transitionDuration: `${OVERLAY_ENTER_MS}ms`,
            transitionTimingFunction: isVisible ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.7, 0, 0.84, 0)',
          }}
        >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.32em] text-[#6D7572]">The Case</p>
                <p className="mt-2 text-sm font-medium text-[#F6F8F7]">{getPhaseTitle(activePhase)}</p>
              </div>
              <PhaseBadge phase={activePhase} />
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-[#303234] bg-[#111615]/90 p-4 text-sm text-[#F6F8F7]">
                {error}
              </div>
            ) : (
              <>
                <div
                  className={`mt-4 rounded-[26px] border px-5 py-5 ${activeCard.surfaceClass}`}
                  style={{
                    minHeight: `${activeCard.mode === 'board' ? 332 : 208}px`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.28em] text-[#A9B3AF]">{activeCard.eyebrow}</p>
                      {activeCard.statLine ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#6D7572]">{activeCard.statLine}</p>
                      ) : null}
                    </div>
                    <div className="h-16 w-16 rounded-full bg-[#1BAA7D]/10 blur-2xl" />
                  </div>

                  {activeCard.mode === 'board' ? (
                    <>
                      <div className="relative mt-4 flex items-start gap-4">
                        <Portrait
                          name={activeCard.portraitName}
                          imageUrl={activeCard.portraitUrl}
                          accentClass={activeCard.accentClass}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-[1.35rem] font-semibold leading-7 text-[#F6F8F7]">{activeCard.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[#E8EEEB]">{activeCard.description}</p>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-[20px] border border-[#053F33] bg-[#040806]/70 p-4">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-[#A9B3AF]">Suspects</p>
                          <div className="mt-3 space-y-2">
                            {(activeCard.suspectNames ?? []).map((name) => (
                              <p key={name} className="text-sm leading-5 text-[#F6F8F7]">
                                {name}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-[#053F33] bg-[#040806]/70 p-4">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-[#A9B3AF]">Evidence</p>
                          <div className="mt-3 space-y-2">
                            {(activeCard.evidenceNames ?? []).map((name) => (
                              <p key={name} className="text-sm leading-5 text-[#F6F8F7]">
                                {name}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>

                      {activeCard.hintLine ? (
                        <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#6D7572]">
                          {activeCard.hintLine}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="relative mt-4 flex items-start gap-4">
                      <Portrait
                        name={activeCard.portraitName}
                        imageUrl={activeCard.portraitUrl}
                        accentClass={activeCard.accentClass}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-[1.35rem] font-semibold leading-7 text-[#F6F8F7]">{activeCard.title}</p>
                        <p className="mt-2 text-sm leading-6 text-[#E8EEEB]">{activeCard.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
