import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import {
  CATEGORY_LABELS,
  IMPORTANCE,
  IMPORTANCE_LABELS,
  KEYWORD_CATEGORIES,
  ROLE_TYPE_LABELS,
  ROLE_TYPES,
  type Application,
  type Importance,
  type JobAnalysis,
  type KeyExperience,
  type Keyword,
  type KeywordCategory,
} from '../applicationTypes';
import { ListEditor, ListTextInput } from '../components/ListEditor';
import { AutoTextarea, Badge, Button, Card, ErrorText, Field, inputClass, LinkButton, PageHeader, StatusBadge } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { describeEvent, formatTime } from '../lib/format';
import { ApplicationForm } from './ApplicationsPage';
import { TailorTab } from './TailorTab';

type Tab = 'analysis' | 'posting' | 'resume';

export function ApplicationPage() {
  const id = Number(useParams().id);
  const [tab, setTab] = useState<Tab>('analysis');
  const app = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.getApplication(id),
    refetchInterval: (q) => (q.state.data?.analysis?.status === 'analyzing' ? 3000 : false),
  });

  if (app.error) return <ErrorText>{app.error.message}</ErrorText>;
  if (!app.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const a = app.data;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/applications" className="text-indigo-700 hover:underline">← Applications</Link>
      </div>
      <PageHeader
        title={a.roleTitle}
        description={
          <>
            {a.company} · added {formatTime(a.createdAt)}
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="ml-3 text-indigo-700 hover:underline">
                Open posting ↗
              </a>
            )}
          </>
        }
      />
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {(
          [
            ['analysis', 'Analysis'],
            ['posting', 'Posting'],
            ['resume', 'Résumé'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'analysis' && <AnalysisTab app={a} />}
      {tab === 'posting' && <PostingTab app={a} />}
      {tab === 'resume' && <TailorTab app={a} />}
    </>
  );
}

// ------------------------------------------------------------------ Analysis

function AnalysisTab({ app }: { app: Application }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const setApp = (a: Application) => {
    queryClient.setQueryData(['application', a.id], a);
    queryClient.invalidateQueries({ queryKey: ['applications'] });
  };
  const analyze = useMutation({ mutationFn: () => api.analyzeApplication(app.id), onSuccess: setApp });
  const reset = useMutation({ mutationFn: () => api.resetAnalysis(app.id), onSuccess: setApp });
  const analysis = app.analysis;

  const reanalyze = () => {
    if (analysis?.userEdited && !window.confirm('Re-analyzing replaces your edits to this analysis. Continue?')) return;
    setEditing(false);
    analyze.mutate();
  };

  if (!analysis || analysis.status === 'analyzing') return <AnalyzingCard runId={analysis?.runId ?? null} appId={app.id} />;

  if (analysis.status === 'failed' || !analysis.data) {
    return (
      <Card title="Analysis failed">
        <ErrorText>{analysis.error ?? 'Unknown error'}</ErrorText>
        <div className="mt-3">
          <Button variant="primary" onClick={() => analyze.mutate()} disabled={analyze.isPending}>Try again</Button>
        </div>
        {analyze.error && <div className="mt-3"><ErrorText>{analyze.error.message}</ErrorText></div>}
      </Card>
    );
  }

  if (editing) return <AnalysisEditor app={app} data={analysis.data} onDone={() => setEditing(false)} />;

  const d = analysis.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Analyzed {formatTime(analysis.updatedAt)}</span>
        {analysis.userEdited && <Badge tone="indigo">Edited by you</Badge>}
        <span className="flex-1" />
        {analysis.userEdited && (
          <LinkButton onClick={() => window.confirm('Discard your edits and go back to the original analysis?') && reset.mutate()}>
            Reset to AI version
          </LinkButton>
        )}
        <LinkButton onClick={reanalyze} disabled={analyze.isPending}>Re-analyze</LinkButton>
        <Button variant="primary" onClick={() => setEditing(true)}>Edit analysis</Button>
      </div>
      {(analyze.error ?? reset.error) && <ErrorText>{(analyze.error ?? reset.error)!.message}</ErrorText>}

      <Card title="The role">
        <p className="text-sm leading-relaxed">{d.roleSummary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Level:</span>
          <span>{d.seniority}</span>
          <span className="ml-3 text-slate-500">Emphasis:</span>
          {d.roleTypes.map((t) => <Badge key={t}>{ROLE_TYPE_LABELS[t]}</Badge>)}
        </div>
      </Card>

      <Card title={`Keywords · ${d.keywords.length}`}>
        <p className="mb-4 text-xs text-slate-500">
          Hover a keyword to see where the posting mentions it. Your résumé will use these only where your stories support them.
        </p>
        <div className="space-y-4">
          {IMPORTANCE.map((imp) => {
            const group = d.keywords.filter((k) => k.importance === imp);
            if (!group.length) return null;
            return (
              <div key={imp}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {IMPORTANCE_LABELS[imp]} · {group.length}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {[...group]
                    .sort((x, y) => KEYWORD_CATEGORIES.indexOf(x.category) - KEYWORD_CATEGORIES.indexOf(y.category))
                    .map((k, i) => <KeywordChip key={i} keyword={k} />)}
                </div>
              </div>
            );
          })}
        </div>
        <CategoryLegend />
      </Card>

      <Card title={`Key experiences · ${d.keyExperiences.length}`}>
        <ul className="space-y-3">
          {d.keyExperiences.map((e, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-start gap-2">
                <ImportanceBadge importance={e.importance} />
                <span>{e.statement}</span>
              </div>
              {e.keywords.length > 0 && (
                <div className="mt-1 ml-[5.5rem] text-xs text-slate-500">{e.keywords.join(' · ')}</div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Responsibilities">
          <ul className="list-disc space-y-1 pl-5 text-sm">{d.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </Card>
        <Card title="Practical notes">
          {d.notes.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          ) : (
            <p className="text-sm text-slate-400 italic">None stated in the posting.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function AnalyzingCard({ runId, appId }: { runId: number | null; appId: number }) {
  const queryClient = useQueryClient();
  const { run, events } = useRunStream(runId);
  useEffect(() => {
    if (run && ['succeeded', 'failed', 'cancelled'].includes(run.status)) {
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
    }
  }, [run?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card>
      <div className="flex items-center gap-3 text-sm">
        {run ? <StatusBadge status={run.status} /> : <span className="text-slate-500">Starting…</span>}
        <span className="text-slate-600">Analyzing the posting. Usually 20–60 seconds.</span>
      </div>
      {events.length > 0 && <p className="mt-2 text-xs text-slate-400">{describeEvent(events.at(-1)!.event)}</p>}
    </Card>
  );
}

const CATEGORY_DOTS: Record<KeywordCategory, string> = {
  hard_skill: 'bg-indigo-500',
  tool: 'bg-sky-500',
  domain: 'bg-emerald-500',
  certification: 'bg-amber-500',
  soft_skill: 'bg-pink-500',
  methodology: 'bg-violet-500',
};

function KeywordChip({ keyword: k }: { keyword: Keyword }) {
  const tip = [
    `${CATEGORY_LABELS[k.category]} · ${IMPORTANCE_LABELS[k.importance]}`,
    k.synonyms.length ? `Also: ${k.synonyms.join(', ')}` : '',
    k.evidence ? `“${k.evidence}”` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span title={tip} className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-800">
      <span className={`size-1.5 rounded-full ${CATEGORY_DOTS[k.category]}`} aria-hidden />
      {k.term}
    </span>
  );
}

function CategoryLegend() {
  return (
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
      {KEYWORD_CATEGORIES.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${CATEGORY_DOTS[c]}`} aria-hidden />
          {CATEGORY_LABELS[c]}
        </span>
      ))}
    </div>
  );
}

function ImportanceBadge({ importance }: { importance: Importance }) {
  const tone = importance === 'required' ? 'indigo' : importance === 'preferred' ? 'slate' : 'slate';
  return (
    <span className="w-20 shrink-0">
      <Badge tone={tone}>{IMPORTANCE_LABELS[importance]}</Badge>
    </span>
  );
}

function AnalysisEditor({ app, data, onDone }: { app: Application; data: JobAnalysis; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<JobAnalysis>(() => structuredClone(data));
  const set = (patch: Partial<JobAnalysis>) => setD({ ...d, ...patch });
  const save = useMutation({
    mutationFn: () => api.saveAnalysis(app.id, d),
    onSuccess: (a) => {
      queryClient.setQueryData(['application', a.id], a);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      onDone();
    },
  });

  return (
    <div className="space-y-6">
      <Card title="The role">
        <div className="space-y-4">
          <Field label="Summary">
            <AutoTextarea minRows={3} value={d.roleSummary} onChange={(e) => set({ roleSummary: e.target.value })} />
          </Field>
          <Field label="Level">
            <input className={inputClass} value={d.seniority} onChange={(e) => set({ seniority: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Emphasis</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {ROLE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={d.roleTypes.includes(t)}
                    onChange={(e) =>
                      set({ roleTypes: e.target.checked ? [...d.roleTypes, t] : d.roleTypes.filter((x) => x !== t) })
                    }
                  />
                  {ROLE_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card title={`Keywords · ${d.keywords.length}`}>
        <ListEditor
          items={d.keywords}
          onChange={(keywords) => set({ keywords })}
          reorder={false}
          blank={(): Keyword => ({ term: '', category: 'hard_skill', importance: 'preferred', synonyms: [], evidence: '' })}
          addLabel="Add keyword"
          renderItem={(k, update) => (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9.5rem]">
              <input className={inputClass} placeholder="Keyword" value={k.term} onChange={(e) => update({ term: e.target.value })} aria-label="Keyword" />
              <select className={inputClass} value={k.category} onChange={(e) => update({ category: e.target.value as KeywordCategory })} aria-label="Category">
                {KEYWORD_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <select className={inputClass} value={k.importance} onChange={(e) => update({ importance: e.target.value as Importance })} aria-label="Importance">
                {IMPORTANCE.map((i) => <option key={i} value={i}>{IMPORTANCE_LABELS[i]}</option>)}
              </select>
              <div className="sm:col-span-3">
                <ListTextInput
                  separator="comma"
                  value={k.synonyms}
                  onChange={(synonyms) => update({ synonyms })}
                  placeholder="Other ways it's written, comma-separated (optional)"
                  aria-label="Synonyms"
                  className="text-xs"
                />
              </div>
              {k.evidence && <p className="text-xs text-slate-500 italic sm:col-span-3">“{k.evidence}”</p>}
            </div>
          )}
        />
      </Card>

      <Card title={`Key experiences · ${d.keyExperiences.length}`}>
        <ListEditor
          items={d.keyExperiences}
          onChange={(keyExperiences) => set({ keyExperiences })}
          blank={(): KeyExperience => ({ statement: '', importance: 'preferred', keywords: [] })}
          addLabel="Add key experience"
          renderItem={(e, update) => (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <AutoTextarea minRows={2} value={e.statement} onChange={(ev) => update({ statement: ev.target.value })} aria-label="Experience" />
              <select className={`${inputClass} self-start`} value={e.importance} onChange={(ev) => update({ importance: ev.target.value as Importance })} aria-label="Importance">
                {IMPORTANCE.map((i) => <option key={i} value={i}>{IMPORTANCE_LABELS[i]}</option>)}
              </select>
              <div className="sm:col-span-2">
                <ListTextInput
                  separator="comma"
                  value={e.keywords}
                  onChange={(keywords) => update({ keywords })}
                  placeholder="Related keywords, comma-separated"
                  aria-label="Related keywords"
                  className="text-xs"
                />
              </div>
            </div>
          )}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Responsibilities">
          <ListTextInput separator="line" minRows={6} value={d.responsibilities} onChange={(responsibilities) => set({ responsibilities })} placeholder="One per line" aria-label="Responsibilities" />
        </Card>
        <Card title="Practical notes">
          <ListTextInput separator="line" minRows={6} value={d.notes} onChange={(notes) => set({ notes })} placeholder="One per line" aria-label="Practical notes" />
        </Card>
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-slate-50/95 py-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save analysis'}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {save.error && <span className="text-sm text-red-700">{save.error.message}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Posting

function PostingTab({ app }: { app: Application }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [changed, setChanged] = useState(false);
  const update = useMutation({
    mutationFn: (input: Parameters<typeof api.updateApplication>[1]) => api.updateApplication(app.id, input),
    onSuccess: (a) => {
      queryClient.setQueryData(['application', a.id], a);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setEditing(false);
      setChanged(true);
    },
  });
  const analyze = useMutation({
    mutationFn: () => api.analyzeApplication(app.id),
    onSuccess: (a) => {
      queryClient.setQueryData(['application', a.id], a);
      setChanged(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteApplication(app.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      navigate('/applications');
    },
  });

  if (editing) {
    return (
      <Card title="Edit posting">
        <ApplicationForm
          initial={app}
          submitLabel="Save"
          pending={update.isPending}
          error={update.error}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
        />
      </Card>
    );
  }

  const section = (title: string, text: string | null) =>
    text ? (
      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </section>
    ) : null;

  return (
    <div className="space-y-4">
      {changed && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The posting changed. Re-analyze to update the keywords{app.analysis?.userEdited ? ' (this replaces your edits)' : ''}.
          <Button onClick={() => analyze.mutate()} disabled={analyze.isPending}>Re-analyze</Button>
        </div>
      )}
      <Card
        title="Posting"
        actions={
          <div className="flex gap-1">
            <LinkButton onClick={() => setEditing(true)}>Edit</LinkButton>
            <LinkButton danger onClick={() => window.confirm('Delete this application and its analysis?') && remove.mutate()}>
              Delete application
            </LinkButton>
          </div>
        }
      >
        <div className="space-y-5">
          {app.url && (
            <section>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Posting link</h3>
              <a href={app.url} target="_blank" rel="noopener noreferrer" className="text-sm break-all text-indigo-700 hover:underline">
                {app.url}
              </a>
            </section>
          )}
          {section('Job description', app.jobDescription)}
          {section('Required experience', app.requiredExperience)}
          {section('Preferred experience', app.preferredExperience)}
          {section('Your notes', app.notes)}
        </div>
      </Card>
      {(analyze.error ?? remove.error) && <ErrorText>{(analyze.error ?? remove.error)!.message}</ErrorText>}
    </div>
  );
}
