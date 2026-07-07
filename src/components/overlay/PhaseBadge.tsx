import type { GamePhase } from '../../../shared/game';

type PhaseBadgeProps = {
  phase: GamePhase;
};

export function PhaseBadge({ phase }: PhaseBadgeProps) {
  const toneClass =
    phase === 'accusation_result'
      ? 'border-[#2ED9B0]/35 bg-[#1BAA7D]/18 text-[#F6F8F7]'
      : phase === 'timeout_reveal'
        ? 'border-[#303234] bg-[#111615]/90 text-[#E8EEEB]'
        : phase === 'investigation_open'
          ? 'border-[#1BAA7D]/35 bg-[#1BAA7D]/16 text-[#F6F8F7]'
          : 'border-[#053F33] bg-[#0C2D24]/88 text-[#E8EEEB]';

  return (
    <div className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em] ${toneClass}`}>
      {phase.replace(/_/g, ' ')}
    </div>
  );
}
