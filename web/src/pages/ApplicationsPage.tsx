import { ApplicationWorkspaceList } from './ApplicationWorkspaceList';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import type { ApplicationInput } from '../applicationTypes';
import { AutoTextarea, Button, Card, ErrorText, Field, inputClass, PageHeader } from '../components/ui';

export function ApplicationsPage() { return <ApplicationWorkspaceList/>; }

export function NewApplicationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [link, setLink] = useState('');
  const [filled, setFilled] = useState<{ fields: ApplicationInput; problem: string | null; key: number } | null>(null);
  const create = useMutation({
    mutationFn: api.createApplication,
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      navigate(`/applications/${a.id}`);
    },
  });
  const parse = useMutation({
    mutationFn: () => api.parsePostingUrl(link),
    onSuccess: (r) => setFilled({ fields: r.fields, problem: r.problem, key: Date.now() }),
  });

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/applications" className="text-indigo-700 hover:underline">← Applications</Link>
      </div>
      <PageHeader title="New application" description="Start from the posting's link, or paste it. Analysis starts as soon as you save." />
      <div className="space-y-6">
        <Card title="Start from a link">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) parse.mutate();
            }}
          >
            <input
              className={`${inputClass} min-w-0 flex-1`}
              type="url"
              placeholder="https://… (the job posting's address)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label="Job posting link"
            />
            <Button variant="primary" type="submit" disabled={!link.trim() || parse.isPending}>
              {parse.isPending ? 'Reading the posting… (about 30 s)' : 'Fill from link'}
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            The app downloads the page and Codex fills in the form below. Check it before saving; nothing is saved until you do.
          </p>
          {parse.error && (
            <div className="mt-3">
              <ErrorText>{parse.error.message}</ErrorText>
            </div>
          )}
          {filled && (
            <p className="mt-3 text-sm text-emerald-700">
              ✓ Filled in from the posting. Review the fields below.
              {filled.problem && <span className="block text-amber-800">Note: {filled.problem}</span>}
            </p>
          )}
        </Card>
        <Card>
          <ApplicationForm
            key={filled?.key ?? 0}
            initial={filled?.fields}
            submitLabel="Save and analyze"
            pending={create.isPending}
            error={create.error}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => navigate('/applications')}
          />
        </Card>
      </div>
    </>
  );
}

const emptyInput: ApplicationInput = {
  url: null,
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
  const [form, setForm] = useState<ApplicationInput>({ ...emptyInput, ...initial });
  const set = (patch: Partial<ApplicationInput>) => setForm({ ...form, ...patch });

  return (
    <form
      className="grid gap-4 @min-[40rem]:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="@min-[40rem]:col-span-2">
        <Field label="Posting link" hint="Optional. Saved with the application so you can get back to the original posting.">
          <input
            className={inputClass}
            type="url"
            placeholder="https://…"
            value={form.url ?? ''}
            onChange={(e) => set({ url: e.target.value || null })}
          />
        </Field>
      </div>
      <Field label="Company">
        <input className={inputClass} value={form.company} onChange={(e) => set({ company: e.target.value })} required />
      </Field>
      <Field label="Role title">
        <input className={inputClass} value={form.roleTitle} onChange={(e) => set({ roleTitle: e.target.value })} required />
      </Field>
      <div className="@min-[40rem]:col-span-2">
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
      <div className="@min-[40rem]:col-span-2">
        <Field label="Notes" hint="Optional and private: referral, salary, location, anything you want to remember. Not treated as part of the posting.">
          <AutoTextarea minRows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-2 @min-[40rem]:col-span-2">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <div className="@min-[40rem]:col-span-2"><ErrorText>{error.message}</ErrorText></div>}
    </form>
  );
}
