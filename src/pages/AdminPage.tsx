import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ControlButton } from '@/components/admin/ControlButton';
import { DEFAULT_GAME_SETTINGS, type AdminAction } from '../../shared/game';

const adminActions: AdminAction[] = ['start', 'stop', 'pause', 'resume', 'skip', 'reload'];

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState(DEFAULT_GAME_SETTINGS);
  const [busy, setBusy] = useState(false);

  const groupedSettings = useMemo(
    () => [
      ['sceneIntroSeconds', 'Scene intro (seconds)'],
      ['suspectIntroGapSeconds', 'Suspect intro gap (seconds)'],
      ['suspectStatementIntervalSeconds', 'Statement interval (seconds)'],
      ['postCaseCountdownSeconds', 'Post-case countdown (seconds)'],
      ['caseTimeoutMinutes', 'Case timeout (minutes)'],
      ['cooldownExamineSeconds', 'Examine cooldown (seconds)'],
      ['cooldownAskSeconds', 'Ask cooldown (seconds)'],
      ['cooldownAccuseSeconds', 'Accuse cooldown (seconds)'],
    ] as const,
    [],
  );

  async function runAction(action: AdminAction) {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, action }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to apply admin action.');
      }

      setMessage(payload.message ?? `Action "${action}" applied.`);
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : 'Unable to apply admin action.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, settings }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save settings.');
      }

      setMessage('Live settings updated.');
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : 'Unable to save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      eyebrow="Admin Controls"
      title="Quiet operational control for live case management."
      description="This page mirrors the broadcaster and moderator command surface, while also letting you update live timings stored in Supabase."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
          <label className="block text-xs uppercase tracking-[0.25em] text-stone-500">
            Admin password
          </label>
          <input
            className="mt-3 w-full rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-stone-100 outline-none transition focus:border-amber-400/50"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            {adminActions.map((action) => (
              <ControlButton
                key={action}
                tone={action === 'stop' ? 'danger' : 'default'}
                disabled={busy}
                onClick={() => void runAction(action)}
              >
                {action}
              </ControlButton>
            ))}
          </div>

          {message ? (
            <div className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4 text-sm text-cyan-100">
              {message}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.25em] text-stone-500">Live Tunables</p>
            <h2 className="mt-3 font-serif text-2xl text-stone-100">Game settings</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groupedSettings.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-2 block text-sm text-stone-300">{label}</span>
                <input
                  className="w-full rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-stone-100 outline-none transition focus:border-amber-400/50"
                  type="number"
                  value={settings[key]}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <ControlButton className="mt-6 w-full justify-center" disabled={busy} onClick={() => void saveSettings()}>
            Save live settings
          </ControlButton>
        </section>
      </div>
    </AppShell>
  );
}
