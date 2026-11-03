import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import type { ApplicationInput } from '../applicationTypes';
import { AutoTextarea, Badge, Button, Card, ErrorText, Field, inputClass, PageHeader } from '../components/ui';
import { formatTime } from '../lib/format';

export function ApplicationsPage() {
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['applications'],
    queryFn: api.listApplications,
    refetchInterval: (q) => (q.state.data?.some((a) => a.analysisStatus === 'analyzing') ? 3000 : false),
  });

  return (
    <>
      <PageHeader
        title="Applications"
        description="One per job you apply to. Each posting is analyzed for the keywords and experience to tailor your résumé to."
        actions={
          <Button variant="primary" onClick={() => navigate('/applications/new')}>
            New application
          </Button>
        }
      />
      {list.error && <ErrorText>{list.error.message}</ErrorText>}
      {list.data && list.data.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            No applications yet. <Link to="/applications/new" className="text-indigo-700 hover:underline">Add your first one</Link>.
          </p>
        </Card>
      )}
      <div className="space-y-3">
        {list.data?.map((a) => (
          <Link
            key={a.id}
            to={`/applications/${a.id}`}
            className="block rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-indigo-300"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{a.roleTitle}</div>
                <div className="text-sm text-slate-600">{a.company}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {a.analysisStatus === 'analyzing' && <Badge tone="indigo">Analyzing…</Badge>}
                {a.analysisStatus === 'failed' && <Badge tone="amber">Analysis failed</Badge>}
                {a.analysisStatus === 'ready' && (
                  <span>
                    {a.keywordCount} keywords · {a.requiredCount} required
                  </span>
                )}
                <span>· {formatTime(a.createdAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export function NewApplicationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: api.createApplication,
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      navigate(`/applications/${a.id}`);
    },
  });
  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/applications" className="text-indigo-700 hover:underline">← Applications</Link>
      </div>
      <PageHeader title="New application" description="Paste the posting. Analysis starts as soon as you save (usually 20–60 seconds)." />
      <Card>
        <ApplicationForm
          submitLabel="Save and analyze"
          pending={create.isPending}
          error={create.error}
          onSubmit={(input) => create.mutate(input)}
          onCancel={() => navigate('/applications')}
        />
      </Card>
    </>
  );
}

const emptyInput: ApplicationInput = {
  company: '',
  roleTitle: '',
  jobDescription: '',
  requiredExperience: null,
  preferredExperience: null,
  notes: null,
};

export function ApplicationForm({
  initial = emptyInput,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: ApplicationInput;
  submitLabel: string;
  pending: boolean;
  error: Error | null;
  onSubmit: (input: ApplicationInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ApplicationInput>(initial);
  const set = (patch: Partial<ApplicationInput>) => setForm({ ...form, ...patch });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <Field label="Company">
        <input className={inputClass} value={form.company} onChange={(e) => set({ company: e.target.value })} required autoFocus />
      </Field>
      <Field label="Role title">
        <input className={inputClass} value={form.roleTitle} onChange={(e) => set({ roleTitle: e.target.value })} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Job description" hint="Paste the whole posting. If it lists qualifications, you can leave them in here or use the boxes below.">
          <AutoTextarea minRows={10} value={form.jobDescription} onChange={(e) => set({ jobDescription: e.target.value })} required />
        </Field>
      </div>
      <Field label="Required experience" hint="Optional: the posting's required or minimum qualifications.">
        <AutoTextarea minRows={4} value={form.requiredExperience ?? ''} onChange={(e) => set({ requiredExperience: e.target.value })} />
      </Field>
      <Field label="Preferred experience" hint="Optional: preferred or bonus qualifications.">
        <AutoTextarea minRows={4} value={form.preferredExperience ?? ''} onChange={(e) => set({ preferredExperience: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes" hint="Optional and private: referral, salary, location, anything you want to remember. Not treated as part of the posting.">
          <AutoTextarea minRows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <div className="sm:col-span-2"><ErrorText>{error.message}</ErrorText></div>}
    </form>
  );
}
