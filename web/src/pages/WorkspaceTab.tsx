import { useEffect, useState } from 'react';
import { EventsPanel } from './AgendaPage';
import { AttentionPanel } from './AttentionPage';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, inputClass } from '../components/ui';
import {
  LABELS,
  STAGES,
  REASONS,
  today,
  workspaceRequest as request,
  type Workspace,
  type Contact,
} from '../workspace';

export function StageForm({
  id,
  onDone,
  currentStage,
  onPendingChange,
}: {
  id: number;
  onDone?: () => void;
  currentStage?: string | null;
  onPendingChange?: (pending: boolean) => void;
}) {
  const qc = useQueryClient();
  const [stage, setStage] = useState(currentStage ?? 'interested');
  const [date, setDate] = useState(today());
  const [outcome, setOutcome] = useState('pending');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () =>
      request('POST', `/applications/${id}/stage`, {
        stage,
        effectiveDate: date,
        offerOutcome: outcome,
        closureReason: reason || null,
        note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['workspace', id] });
      onDone?.();
    },
  });
  useEffect(() => {
    onPendingChange?.(save.isPending);
  }, [save.isPending, onPendingChange]);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="New Stage">
        <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Effective Date">
        <input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {stage === 'offer' && (
        <Field label="Offer Outcome">
          <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {['pending', 'accepted', 'declined'].map((v) => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </Field>
      )}
      {stage === 'closed' && (
        <Field label="Closure Reason">
          <select required className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose reason</option>
            {REASONS.map((v) => (
              <option value={v} key={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Optional Context">
        <textarea className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {save.error && <ErrorText>{save.error.message}</ErrorText>}
      <Button variant="primary" disabled={save.isPending} type="submit">
        Save stage
      </Button>
    </form>
  );
}
const blankContact = {
  name: '',
  organization: '',
  title: '',
  email: '',
  phone: '',
  profileUrl: '',
  notes: '',
};
export function WorkspaceTab({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => request<Workspace>('GET', `/applications/${id}/workspace`),
  });
  const people = useQuery({
    queryKey: ['contacts'],
    queryFn: () => request<Contact[]>('GET', '/contacts'),
  });
  const [person, setPerson] = useState(blankContact);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [editId, setEditId] = useState<number>();
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState('');
  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', id] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
  if (q.error) return <ErrorText>{q.error.message}</ErrorText>;
  if (!q.data) return <p>Loading workspace…</p>;
  const w = q.data;
  return (
    <div className="space-y-5">
      {action.error && <ErrorText>{action.error.message}</ErrorText>}
      <AttentionPanel applicationId={id} />
      <Card title={`Stage: ${LABELS[w.stage ?? 'unset']}`}>
        <p className="mb-3 text-sm">
          Last meaningful activity: {w.lastActivityDate ?? 'Unknown'} {w.offerOutcome && ` · Offer ${w.offerOutcome}`}{' '}
          {w.closureReason && ` · ${w.closureReason.replaceAll('_', ' ')}`}
        </p>
        <StageForm key={w.stage} id={id} currentStage={w.stage} />
      </Card>
      <EventsPanel applicationId={id} />
      <Card title="Application Contacts" actions={<Button onClick={() => {
        setPerson(blankContact); setEditId(undefined); setSelected(''); setRole(''); setShowPersonForm(true);
      }}>Add Person</Button>}>
        <div className="space-y-3">
          {w.contacts.map((c) => (
            <div key={c.id} className="border-b pb-3 text-sm">
              <b>{c.name}</b> · {c.role} · {c.organization} · {c.title}
              <p>
                {c.email} {c.phone}{' '}
                {c.profileUrl && (
                  <a className="text-indigo-700 underline" href={c.profileUrl} target="_blank" rel="noreferrer">
                    Profile
                  </a>
                )}
              </p>
              <p className="whitespace-pre-wrap">{c.notes}</p>
              <Button
                onClick={() => {
                  setPerson({
                    name: c.name,
                    organization: c.organization,
                    title: c.title,
                    email: c.email,
                    phone: c.phone,
                    profileUrl: c.profileUrl,
                    notes: c.notes,
                  });
                  setEditId(c.id);
                  setRole(c.role ?? '');
                  setShowPersonForm(true);
                }}
              >
                Edit person
              </Button>{' '}
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate(() => request('DELETE', `/applications/${id}/contacts/${c.id}`))}
              >
                Unlink
              </Button>{' '}
              <Button
                disabled={action.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${c.name} everywhere? This removes the person and all application links. Unlink instead to keep them elsewhere.`,
                    )
                  )
                    action.mutate(() => request('DELETE', `/contacts/${c.id}`, { confirm: true }));
                }}
              >
                Delete person everywhere
              </Button>
            </div>
          ))}
          {!w.contacts.length && <p>No contacts linked yet.</p>}
          {people.error && <ErrorText>{people.error.message}</ErrorText>}
        </div>
      </Card>
      {showPersonForm && (
      <Card title={editId ? 'Edit Shared Person' : 'Add Person'}>
        {!editId && <>          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(async () => {
                await request('PUT', `/applications/${id}/contacts/${selected}`, { role });
                setShowPersonForm(false); setSelected(''); setRole('');
              });
            }}
          >
            <Field label="Existing Person">
              <select required className={inputClass} value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Choose a person</option>
                {people.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.organization}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role on This Application">
              <input
                className={inputClass}
                value={role}
                placeholder="Recruiter, interviewer, referral…"
                onChange={(e) => setRole(e.target.value)}
              />
            </Field>
            <Button disabled={action.isPending || !selected}>Link / update role</Button>
          </form>
<p className="my-4 text-sm font-medium">Or Create a New Person</p></>}
        {editId && (
          <p className="mb-3 text-sm text-slate-600">
            Person details apply to every linked application. The role applies only to this application.
          </p>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(async () => {
              const c = await request<{ id: number }>(
                editId ? 'PUT' : 'POST',
                editId ? `/contacts/${editId}` : '/contacts',
                person,
              );
              await request('PUT', `/applications/${id}/contacts/${c.id}`, { role });
              setPerson(blankContact);
              setEditId(undefined);
              setShowPersonForm(false);
            });
          }}
        >
          {Object.keys(blankContact).map((key) => (
            <Field key={key} label={key === 'profileUrl' ? 'Profile Link' : key.charAt(0).toUpperCase() + key.slice(1)}>
              <input
                required={key === 'name'}
                type={key === 'email' ? 'email' : key === 'profileUrl' ? 'url' : 'text'}
                className={inputClass}
                value={person[key as keyof typeof person]}
                onChange={(e) => setPerson({ ...person, [key]: e.target.value })}
              />
            </Field>
          ))}
          {editId && <Field label="Role on This Application">
            <input className={inputClass} value={role} onChange={e => setRole(e.target.value)}/>
          </Field>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" type="submit" disabled={action.isPending}>Save person</Button>
            <Button
              variant="secondary"
              type="button"
              disabled={action.isPending}
              onClick={() => {
                setEditId(undefined);
                setPerson(blankContact);
                setShowPersonForm(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      )}
      <Card title="Timeline">
        <div className="space-y-3">
          {[
            ...w.history.map((h) => ({
              id: `h${h.id}`,
              date: h.effective_date,
              recorded: h.recorded_at,
              node: (
                <>
                  <b>{LABELS[h.stage]}</b> {h.offer_outcome} {h.closure_reason?.replaceAll('_', ' ')} {h.note}
                </>
              ),
            })),
            ...w.activities.map((a) => ({
              id: `a${a.id}`,
              date: a.effective_date,
              recorded: a.recorded_at,
              node: (
                <div className={a.voided ? 'text-slate-400' : ''}>
                  <b>{a.kind.replaceAll('_', ' ')}</b>: {a.text}{' '}
                  {a.voided && '(removed / corrected)'}
                </div>
              ),
            })),
          ]
            .sort((a, b) => b.date.localeCompare(a.date) || b.recorded - a.recorded || b.id.localeCompare(a.id))
            .map((v) => (
              <div key={v.id} className="border-b pb-3 text-sm">
                <div>
                  {v.date} · recorded {new Date(v.recorded).toLocaleString()}
                </div>
                {v.node}
              </div>
            ))}
          {!w.history.length && !w.activities.length && <p>No activity recorded.</p>}
        </div>
      </Card>
    </div>
  );
}
