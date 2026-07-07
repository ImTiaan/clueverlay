import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import type { LeaderboardEntry } from '../../shared/game';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const response = await fetch('/api/leaderboard');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load leaderboard.');
        }

        setEntries(payload.entries ?? []);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load leaderboard.');
      } finally {
        setLoading(false);
      }
    }

    void loadLeaderboard();
  }, []);

  return (
    <AppShell
      eyebrow="Current Season"
      title="The leaderboard keeps the detectives honest."
      description="This public page shows the active season standings for THE CASE, including points, solves, evidence work, and accusation accuracy."
    >
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          {loading ? (
            <div className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6 text-stone-400">
              Loading leaderboard...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-100">
              {error}
            </div>
          ) : (
            <LeaderboardTable entries={entries} />
          )}
        </div>
        <aside className="space-y-4">
          <div className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">What Matters</p>
            <h2 className="mt-3 font-serif text-2xl text-stone-100">Not just points.</h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              The board tracks solves, mistakes, and investigative effort so the stream rewards
              deduction rather than spam.
            </p>
          </div>
          <div className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Season Rules</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-stone-300">
              <li>Only the current season is shown here.</li>
              <li>Permanent titles survive resets.</li>
              <li>Each case allows two guesses per player.</li>
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
