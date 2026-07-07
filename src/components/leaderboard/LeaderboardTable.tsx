import type { LeaderboardEntry } from '../../../shared/game';

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
};

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-stone-800 bg-stone-950/80 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <table className="min-w-full divide-y divide-stone-800 text-left text-sm">
        <thead className="bg-stone-900/90 text-xs uppercase tracking-[0.2em] text-stone-400">
          <tr>
            <th className="px-4 py-4">Rank</th>
            <th className="px-4 py-4">Detective</th>
            <th className="px-4 py-4">Points</th>
            <th className="px-4 py-4">Solved</th>
            <th className="px-4 py-4">Wrong</th>
            <th className="px-4 py-4">Accuracy</th>
            <th className="px-4 py-4">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-900 text-stone-200">
          {entries.map((entry, index) => (
            <tr key={entry.twitchUserId} className="transition hover:bg-stone-900/70">
              <td className="px-4 py-4 font-medium text-amber-300">{index + 1}</td>
              <td className="px-4 py-4">
                <div className="font-medium">{entry.displayName}</div>
                <div className="mt-1 text-xs text-stone-400">
                  {entry.rank}
                  {entry.permanentTitle ? ` • ${entry.permanentTitle}` : ''}
                </div>
              </td>
              <td className="px-4 py-4">{entry.points}</td>
              <td className="px-4 py-4">{entry.casesSolved}</td>
              <td className="px-4 py-4">{entry.wrongAccusations}</td>
              <td className="px-4 py-4">{entry.accusationAccuracy}%</td>
              <td className="px-4 py-4">{entry.evidenceExaminedTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
