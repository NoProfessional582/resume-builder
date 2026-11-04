import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, inputClass } from './ui';
import { workspaceRequest as request, LABELS } from '../workspace';

export interface FollowUpSettings {
  timezone: string;
  applied: number;
  screened: number;
  interviewing: number;
  offer: number;
}
export function FollowUpSettingsCard() {
  const query = useQuery({ queryKey: ['attention-settings'], queryFn: () => request<FollowUpSettings>('GET', '/attention/settings') });
  return <Card title="Follow-up Rules">
    {query.isPending && <p className="text-sm text-slate-500">Loading follow-up rules…</p>}
    {query.error && <ErrorText>{query.error.message}</ErrorText>}
    {query.data && <ThresholdForm settings={query.data}/>}
  </Card>;
}

function ThresholdForm({ settings }: { settings: FollowUpSettings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const dirty = (Object.keys(settings) as (keyof FollowUpSettings)[]).some(key => draft[key] !== settings[key]);
  const save = useMutation({
    mutationFn: () => request<FollowUpSettings>('PUT', '/attention/settings', draft),
    onSuccess: next => { qc.setQueryData(['attention-settings'], next); },
  });
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (dirty && !save.isPending) save.mutate(); }}>
      <p className="text-sm text-slate-600">Calendar days since the last recorded stage change or communication. These are your preferences, not employer response deadlines.</p>
      <Field label="Follow-up Time Zone" hint="IANA name, for example America/Los_Angeles. Daily rules change at midnight here.">
        <input className={inputClass} required value={draft.timezone} onChange={e => setDraft({...draft, timezone:e.target.value})}/>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['applied','screened','interviewing','offer'] as const).map(stage => (
          <Field key={stage} label={`${LABELS[stage]}${stage === 'offer' ? ' (Pending)' : ''} — Days`}>
            <input className={inputClass} type="number" min={1} max={365} required value={draft[stage]}
              onChange={e => setDraft({...draft, [stage]:Number(e.target.value)})}/>
          </Field>
        ))}
      </div>
      {save.error && <ErrorText>{save.error.message}</ErrorText>}
      <Button variant="primary" disabled={!dirty || save.isPending} type="submit">Save Follow-up Rules</Button>
      {save.isSuccess && !dirty && <p role="status" className="text-sm text-green-700">Follow-up rules saved.</p>}
    </form>
  );
}
