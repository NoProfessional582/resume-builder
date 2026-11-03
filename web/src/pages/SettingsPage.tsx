import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Button, Card, ErrorText, Field, inputClass, PageHeader, StatusBadge } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { describeEvent, formatDuration, formatTime } from '../lib/format';
import type { Settings } from '../types';

const EXPECTED_PROFILE = 'resume-builder-v1';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="How the app runs the Codex CLI for AI tasks." />
      <div className="space-y-6">
        <CodexStatusCard />
        <AgentSettingsCard />
        <BackupsCard />
      </div>
    </>
  );
}

function CodexStatusCard() {
  const status = useQuery({ queryKey: ['codex-status'], queryFn: api.codexStatus });
  const [testRunId, setTestRunId] = useState<number | null>(null);
  const test = useMutation({ mutationFn: api.testCodex, onSuccess: (r) => setTestRunId(r.runId) });
  const s = status.data;

  return (
    <Card
      title="Codex CLI"
      actions={
        <Button onClick={() => status.refetch()} disabled={status.isFetching}>
          {status.isFetching ? 'Checking…' : 'Refresh'}
        </Button>
      }
    >
      {status.isPending && <p className="text-sm text-slate-500">Checking Codex…</p>}
      {status.error && <ErrorText>{status.error.message}</ErrorText>}
      {s && (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Found at</dt>
          <dd className="font-mono text-xs break-all">{s.path ?? '—'}</dd>
          <dt className="text-slate-500">Version</dt>
          <dd>{s.version ?? '—'}</dd>
          <dt className="text-slate-500">Sign-in</dt>
          <dd>
            {s.loggedIn ? (
              <span className="text-emerald-700">{s.loginMessage}</span>
            ) : (
              <span className="text-red-700">
                Not signed in. Run <code className="rounded bg-slate-100 px-1">codex login</code> in a terminal.
              </span>
            )}
          </dd>
        </dl>
      )}
      {s?.error && <div className="mt-3"><ErrorText>{s.error}</ErrorText></div>}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => test.mutate()} disabled={test.isPending || !s?.path}>
            Test Codex
          </Button>
          <span className="text-xs text-slate-500">Runs a tiny task end to end (usually 5–15 seconds).</span>
        </div>
        {test.error && <div className="mt-3"><ErrorText>{test.error.message}</ErrorText></div>}
        {testRunId != null && <TestRunProgress runId={testRunId} />}
      </div>
    </Card>
  );
}

function TestRunProgress({ runId }: { runId: number }) {
  const { run, events } = useRunStream(runId);
  const [now, setNow] = useState(Date.now());
  const active = !run || run.status === 'queued' || run.status === 'running';

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);

  const output = run?.output as { message?: string; agentProfile?: string } | null;
  const elapsed = run?.durationMs ?? (run?.startedAt ? now - run.startedAt : null);

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex items-center gap-3">
        {run ? <StatusBadge status={run.status} /> : <span className="text-slate-500">Connecting…</span>}
        <span className="text-slate-500">{formatDuration(elapsed)}</span>
        <Link to={`/runs/${runId}`} className="ml-auto text-xs text-indigo-700 hover:underline">
          Run #{runId} details
        </Link>
      </div>
      {events.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {events.map((e, i) => (
            <li key={i}>• {describeEvent(e.event)}</li>
          ))}
        </ul>
      )}
      {run?.status === 'succeeded' && output && (
        <div className="mt-3 space-y-1">
          <p className="text-slate-800">“{output.message}”</p>
          {output.agentProfile === EXPECTED_PROFILE ? (
            <p className="text-xs text-emerald-700">✓ Codex loaded the app's agent instructions (AGENTS.md).</p>
          ) : (
            <p className="text-xs text-amber-700">
              Codex answered but didn't report the app's agent instructions (got “{output.agentProfile}”).
            </p>
          )}
        </div>
      )}
      {run?.error && <div className="mt-3"><ErrorText>{run.error}</ErrorText></div>}
    </div>
  );
}

function BackupsCard() {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: ['backups'], queryFn: api.listBackups });
  const create = useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });
  const list = backups.data ?? [];
  return (
    <Card
      title="Backups"
      actions={
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? 'Backing up…' : 'Back up now'}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Each backup is one .zip with your database, template and style guide, plus restore steps inside. One is made
        automatically when the app starts if the last is over a day old; the newest 20 are kept in{' '}
        <code className="rounded bg-slate-100 px-1 text-xs">data/backups</code>.
      </p>
      {backups.error && <ErrorText>{backups.error.message}</ErrorText>}
      {create.error && <ErrorText>{create.error.message}</ErrorText>}
      {list.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No backups yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {list.slice(0, 8).map((b) => (
            <li key={b.name} className="flex items-center justify-between py-1.5">
              <span>{formatTime(b.createdAt)}</span>
              <span className="text-xs text-slate-500">{(b.size / 1024).toFixed(0)} KB</span>
              <a className="text-xs text-indigo-700 hover:underline" href={`/api/backups/${b.name}`}>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AgentSettingsCard() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  const save = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(['settings'], next);
      queryClient.invalidateQueries({ queryKey: ['codex-status'] });
      setDraft(next);
      setSaved(true);
    },
  });

  if (settings.error) return <Card title="Agent settings"><ErrorText>{settings.error.message}</ErrorText></Card>;
  if (!draft) return <Card title="Agent settings"><p className="text-sm text-slate-500">Loading…</p></Card>;

  const update = (patch: Partial<Settings>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.data);

  return (
    <Card title="Agent settings">
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(draft);
        }}
      >
        <ModelField value={draft.model} onChange={(model) => update({ model })} />
        <Field label="Reasoning effort" hint="Higher is slower but more careful.">
          <select
            className={inputClass}
            value={draft.reasoningEffort}
            onChange={(e) => update({ reasoningEffort: e.target.value as Settings['reasoningEffort'] })}
          >
            <option value="">Codex default</option>
            <option value="minimal">Minimal</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="xhigh">Extra high</option>
          </select>
        </Field>
        <Field label="Timeout (seconds)" hint="A run is stopped if it takes longer than this (15–1800).">
          <input
            className={inputClass}
            type="number"
            min={15}
            max={1800}
            value={draft.timeoutSeconds}
            onChange={(e) => update({ timeoutSeconds: Number(e.target.value) })}
          />
        </Field>
        <Field label="Codex path" hint="Leave blank to find it automatically (global npm install, then PATH).">
          <input className={inputClass} value={draft.codexPath} placeholder="Auto-detect" onChange={(e) => update({ codexPath: e.target.value })} />
        </Field>
        <label className="flex items-start gap-3 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.useUserConfig}
            onChange={(e) => update({ useUserConfig: e.target.checked })}
          />
          <span>
            <span className="text-sm font-medium text-slate-800">Use my Codex config file</span>
            <span className="block text-xs text-slate-500">
              Loads ~/.codex/config.toml (MCP servers, profiles, default model). Off by default so runs stay fast and predictable.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button variant="primary" type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved && !dirty && <span className="text-sm text-emerald-700">Saved</span>}
        </div>
        {save.error && <div className="sm:col-span-2"><ErrorText>{save.error.message}</ErrorText></div>}
      </form>
    </Card>
  );
}

/** The models Codex offers, as a dropdown. Falls back to a text box if Codex can't list them. */
function ModelField({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const models = useQuery({ queryKey: ['codex-models'], queryFn: api.codexModels, staleTime: 10 * 60 * 1000, retry: false });

  if (models.error) {
    return (
      <Field label="Model" hint={`Couldn't load the model list (${models.error.message}). Type a model name, or leave blank for Codex's default.`}>
        <input className={inputClass} value={value} placeholder="Codex default" onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }

  const list = models.data ?? [];
  const selected = list.find((m) => m.slug === value);
  // Keep a saved model that Codex no longer lists, so opening Settings doesn't silently change it.
  const unlisted = value && models.data && !selected;
  return (
    <Field label="Model" hint={selected?.description || "Codex default uses the model from Codex's own settings."}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={models.isPending}>
        <option value="">{models.isPending ? 'Loading models…' : 'Codex default'}</option>
        {list.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.displayName}
          </option>
        ))}
        {unlisted && <option value={value}>{value} (not in Codex's list)</option>}
      </select>
    </Field>
  );
}
