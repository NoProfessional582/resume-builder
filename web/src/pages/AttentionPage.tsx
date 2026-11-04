import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, inputClass, PageHeader } from '../components/ui';
import { workspaceRequest as request, LABELS } from '../workspace';
import { StageForm } from './WorkspaceTab';
import type { FollowUpSettings } from '../components/FollowUpSettingsCard';

interface AttentionItem {
  applicationId: number;
  company: string;
  roleTitle: string;
  stage: string;
  key: string;
  kind: 'explicit' | 'inactivity' | 'missing_date';
  explanation: string;
  dueDate: string | null;
  suppression: 'snoozed' | 'dismissed' | null;
  snoozeUntil: string | null;
}
interface AttentionResult { settings: FollowUpSettings; today: string; items: AttentionItem[] }

function AttentionCard({ item, today }: { item: AttentionItem; today: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'follow_up' | 'snooze' | 'close' | null>(null);
  const [date, setDate] = useState(today);
  const [text, setText] = useState('');
  const tomorrow = new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const [until, setUntil] = useState(tomorrow);
  const action = useMutation({
    mutationFn: async (body: unknown) => request('POST', `/applications/${item.applicationId}/attention`, body),
    onSuccess: () => setMode(null),
  });
  const followUp = useMutation({
    mutationFn: () => request('POST', `/applications/${item.applicationId}/activity`, {kind:'follow_up', effectiveDate:date, text}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['workspace',item.applicationId]});
      qc.invalidateQueries({queryKey:['applications']});
      setMode(null);
      setText('');
    },
  });
  return (
    <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <Link className="font-medium text-indigo-700 underline" to={`/applications/${item.applicationId}`}>{item.roleTitle} · {item.company}</Link>
        <p className="text-xs text-slate-500">{LABELS[item.stage]}{item.dueDate ? ` · Due ${item.dueDate}` : ''}</p>
      </div>
      <p className="text-sm">{item.explanation}</p>
      {item.suppression && <p className="text-sm text-slate-500">{item.suppression === 'snoozed' ? `Snoozed until ${item.snoozeUntil}` : 'Dismissed for this reason and activity cycle'}</p>}
      <div className="flex flex-wrap gap-2">
        <Link className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700" to={`/applications/${item.applicationId}`}>Open application</Link>
        <Button onClick={() => setMode('follow_up')}>Record follow-up</Button>
        {item.suppression ? <Button disabled={action.isPending} onClick={() => action.mutate({action:'restore'})}>Restore application alerts</Button> : <>
          <Button onClick={() => setMode('snooze')}>Snooze</Button>
          <Button disabled={action.isPending} onClick={() => action.mutate({action:'dismiss',key:item.key})}>Dismiss</Button>
        </>}
        <Button onClick={() => setMode('close')}>Close application</Button>
      </div>
      {action.error && <ErrorText>{action.error.message}</ErrorText>}
      {mode === 'follow_up' && <form className="space-y-3 border-t border-slate-100 pt-3" onSubmit={e => {e.preventDefault(); followUp.mutate();}}>
        <Field label="Actual follow-up date"><input required className={inputClass} type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
        <Field label="What happened?"><textarea required className={inputClass} value={text} onChange={e => setText(e.target.value)}/></Field>
        <p className="text-xs text-slate-500">Records an activity in the application timeline. An explicit due action stays due until you complete, reschedule, or dismiss it in the workspace.</p>
        {followUp.error && <ErrorText>{followUp.error.message}</ErrorText>}
        <Button variant="primary" type="submit" disabled={followUp.isPending}>Save follow-up</Button>
      </form>}
      {mode === 'snooze' && <form className="space-y-3 border-t border-slate-100 pt-3" onSubmit={e => {e.preventDefault();action.mutate({action:'snooze',key:item.key,until});}}>
        <Field label="Resume alerts on" hint="Snoozes all alerts for this application. New dated communication or a stage change starts a new activity cycle.">
          <input required type="date" className={inputClass} min={tomorrow} value={until} onChange={e => setUntil(e.target.value)}/>
        </Field>
        <Button variant="primary" disabled={action.isPending} type="submit">Save snooze</Button>
      </form>}
      {mode === 'close' && <StageForm id={item.applicationId} currentStage="closed" onDone={() => setMode(null)}/>}
      {mode && <Button disabled={action.isPending || followUp.isPending} onClick={() => setMode(null)}>Cancel</Button>}
    </article>
  );
}

export function AttentionPanel({ applicationId }: { applicationId?: number }) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const query = useQuery({queryKey:['attention'], queryFn:() => request<AttentionResult>('GET','/attention'), refetchInterval:60000, refetchOnWindowFocus:true});
  const items = (query.data?.items ?? []).filter(i => !applicationId || i.applicationId === applicationId);
  const active = items.filter(i => !i.suppression);
  const suppressed = items.filter(i => i.suppression);
  return <div className="space-y-5">
    <Card title={`Needs attention${query.data ? ` (${active.length})` : ''}`}>
      <div className="space-y-4">
        {query.isPending && <p>Checking applications…</p>}
        {query.error && <ErrorText>{query.error.message}</ErrorText>}
        {query.data && <p className="text-xs text-slate-500">As of {query.data.today} · {query.data.settings.timezone}. Suggestions appear here while the app is running.</p>}
        {query.data && !active.length && <p className="text-sm text-slate-600">No applications need attention under your current rules.</p>}
        {active.map(item => <AttentionCard key={item.key} item={item} today={query.data!.today}/>)}
        {suppressed.length > 0 && <label className="flex gap-2 text-sm"><input type="checkbox" checked={showSuppressed} onChange={e => setShowSuppressed(e.target.checked)}/>Show snoozed and dismissed ({suppressed.length})</label>}
        {showSuppressed && suppressed.map(item => <AttentionCard key={item.key} item={item} today={query.data!.today}/>)}
      </div>
    </Card>
  </div>;
}

export function AttentionPage() {
  return <><PageHeader title="Needs attention" description="Follow-up suggestions based on your dates and recorded activity."/><AttentionPanel/></>;
}
