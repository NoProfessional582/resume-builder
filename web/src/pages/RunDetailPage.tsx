import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { Button, Card, CodeBlock, ErrorText, PageHeader, StatusBadge } from '../components/ui';
import { describeEvent, formatDuration, formatTime, formatTokens } from '../lib/format';
import { isFinal } from '../types';

export function RunDetailPage() {
  const id = Number(useParams().id);
  const run = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.getRun(id),
    refetchInterval: (query) => (query.state.data && !isFinal(query.state.data.status) ? 1000 : false),
  });
  const cancel = useMutation({ mutationFn: () => api.cancelRun(id), onSuccess: () => run.refetch() });

  if (run.error) return <ErrorText>{run.error.message}</ErrorText>;
  if (!run.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const r = run.data;
  const firstEventAt = r.events[0]?.at ?? r.startedAt ?? 0;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/runs" className="text-indigo-700 hover:underline">← Agent Runs</Link>
      </div>
      <PageHeader
        title={`Run #${r.id}: ${r.task}`}
        description={<StatusBadge status={r.status} />}
        actions={
          !isFinal(r.status) && (
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Cancel run
            </Button>
          )
        }
      />
      <div className="space-y-6">
        <Card title="Details">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm @min-[40rem]:grid-cols-[9rem_1fr_9rem_1fr]">
            <dt className="text-slate-500">Started</dt>
            <dd>{formatTime(r.startedAt)}</dd>
            <dt className="text-slate-500">Duration</dt>
            <dd>{formatDuration(r.durationMs)}</dd>
            <dt className="text-slate-500">Model</dt>
            <dd>{r.model ?? '—'}</dd>
            <dt className="text-slate-500">Codex version</dt>
            <dd>{r.codexVersion ?? '—'}</dd>
            <dt className="text-slate-500">Attempts</dt>
            <dd>{r.attempts}</dd>
            <dt className="text-slate-500">Tokens</dt>
            <dd>{formatTokens(r.usage)}</dd>
            <dt className="text-slate-500">Session id</dt>
            <dd className="font-mono text-xs break-all @min-[40rem]:col-span-3">{r.threadId ?? '—'}</dd>
          </dl>
        </Card>

        {r.error && (
          <Card title="Error">
            <ErrorText>{r.error}</ErrorText>
          </Card>
        )}

        {r.output != null && (
          <Card title="Output">
            <CodeBlock>{JSON.stringify(r.output, null, 2)}</CodeBlock>
          </Card>
        )}

        <Card title="Progress">
          {r.events.length === 0 ? (
            <p className="text-sm text-slate-500">No events recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {r.events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-slate-400">
                    +{formatDuration(e.at - firstEventAt)}
                  </span>
                  {r.attempts > 1 && <span className="text-xs text-slate-400">try {e.attempt}</span>}
                  <span className="text-slate-700">{describeEvent(e.event)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Prompt">
          <CodeBlock>{r.prompt ?? ''}</CodeBlock>
        </Card>

        {r.input != null && Object.keys(r.input as object).length > 0 && (
          <Card title="Input">
            <CodeBlock>{JSON.stringify(r.input, null, 2)}</CodeBlock>
          </Card>
        )}
      </div>
    </>
  );
}
