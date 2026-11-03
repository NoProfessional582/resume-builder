import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import { Card, ErrorText, PageHeader, StatusBadge } from '../components/ui';
import { formatDuration, formatTime, formatTokens } from '../lib/format';
import { isFinal } from '../types';

export function RunsPage() {
  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    // Keep refreshing while anything is still in progress.
    refetchInterval: (query) => (query.state.data?.some((r) => !isFinal(r.status)) ? 1500 : false),
  });

  return (
    <>
      <PageHeader title="Agent Runs" description="Every Codex task the app has run, newest first." />
      {runs.error && <ErrorText>{runs.error.message}</ErrorText>}
      <Card>
        {runs.isPending ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !runs.data?.length ? (
          <p className="text-sm text-slate-500">
            No runs yet. Try <Link to="/settings" className="text-indigo-700 hover:underline">Test Codex</Link> on the Settings page.
          </p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Tokens</th>
                  <th className="px-5 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.data.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2">
                      <Link to={`/runs/${run.id}`} className="font-medium text-indigo-700 hover:underline">
                        {run.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{run.task}</td>
                    <td className="px-3 py-2"><StatusBadge status={run.status} /></td>
                    <td className="px-3 py-2 text-slate-600">{formatTime(run.startedAt ?? run.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDuration(run.durationMs)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatTokens(run.usage)}</td>
                    <td className="max-w-xs truncate px-5 py-2 text-red-700" title={run.error ?? ''}>{run.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
