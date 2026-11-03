import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { Button, Card, ErrorText, inputClass, PageHeader, StatusBadge } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { displayRange } from '../lib/dates';
import { describeEvent } from '../lib/format';
import {
  ROLE_FIELDS,
  ROLE_LABELS,
  ROLES,
  SECTION_LABELS,
  type ImportView,
  type PositionContent,
  type ResolvedBlock,
  type ResumeContent,
  type Role,
} from '../resumeTypes';

type Tab = 'content' | 'layout' | 'preview';

export function ImportPage() {
  const id = Number(useParams().id);
  const importQuery = useQuery({
    queryKey: ['import', id],
    queryFn: () => api.getImport(id),
    refetchInterval: (q) => (q.state.data?.status === 'analyzing' ? 2000 : false),
  });
  const [tab, setTab] = useState<Tab>('content');

  if (importQuery.error) return <ErrorText>{importQuery.error.message}</ErrorText>;
  const view = importQuery.data;
  if (!view) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/template" className="text-indigo-700 hover:underline">← Template</Link>
      </div>
      <PageHeader title={`Import: ${view.filename}`} description={statusText(view)} />

      {view.status === 'analyzing' && <AnalyzingCard view={view} />}
      {view.status === 'failed' && (
        <Card title="Analysis failed">
          <ErrorText>{view.error}</ErrorText>
          <p className="mt-3 text-sm">
            {view.runId && <Link to={`/runs/${view.runId}`} className="text-indigo-700 hover:underline">See the run log</Link>}
            {' · '}
            <Link to="/template" className="text-indigo-700 hover:underline">Upload again</Link>
          </p>
        </Card>
      )}

      {view.resolved && view.content && (
        <>
          {view.status === 'ready' && <SaveBar view={view} />}
          <div className="mb-4 flex gap-1 border-b border-slate-200">
            {(['content', 'layout', 'preview'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                  tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
                {t === 'layout' && mismatches(view) > 0 && (
                  <span className="ml-2 rounded-full bg-red-100 px-1.5 text-xs text-red-700">{mismatches(view)}</span>
                )}
              </button>
            ))}
          </div>
          {view.notes.length > 0 && (
            <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-medium">Notes from the analysis: </span>
              {view.notes.join(' ')}
            </div>
          )}
          {tab === 'content' && <ContentTab view={view} />}
          {tab === 'layout' && <LayoutTab view={view} />}
          {tab === 'preview' && <PreviewTab id={view.id} />}
        </>
      )}
    </>
  );
}

const mismatches = (view: ImportView) => view.resolved?.filter((b) => b.status === 'mismatch').length ?? 0;

function statusText(view: ImportView): string {
  switch (view.status) {
    case 'analyzing':
      return 'Codex is reading the resume…';
    case 'ready':
      return 'Check the content and layout, preview the rebuilt file, then save it as your template.';
    case 'saved':
      return 'Saved as a template.';
    case 'failed':
      return 'The analysis did not finish.';
  }
}

function AnalyzingCard({ view }: { view: ImportView }) {
  const { run, events } = useRunStream(view.runId);
  return (
    <Card>
      <div className="flex items-center gap-3 text-sm">
        {run ? <StatusBadge status={run.status} /> : <span className="text-slate-500">Starting…</span>}
        <span className="text-slate-600">Usually 15–60 seconds.</span>
      </div>
      {events.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {events.map((e, i) => <li key={i}>• {describeEvent(e.event)}</li>)}
        </ul>
      )}
    </Card>
  );
}

function SaveBar({ view }: { view: ImportView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileEmpty = view.profile.positions === 0 && view.profile.sections === 0;
  const [replace, setReplace] = useState(profileEmpty);
  const save = useMutation({
    mutationFn: () => api.saveImport(view.id, replace),
    onSuccess: () => {
      queryClient.invalidateQueries();
      navigate('/template');
    },
  });
  const blocked = mismatches(view);

  return (
    <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <span>
          <span className="font-medium">Import this resume's content into my profile</span>
          <span className="block text-xs text-slate-600">
            {profileEmpty
              ? `Adds ${view.content!.positions.length} positions and ${view.content!.positions.reduce((n, p) => n + p.bullets.length, 0)} stories (each bullet becomes a story), plus the other sections.`
              : `Replaces your current profile (${view.profile.positions} positions, ${view.profile.stories} stories, ${view.profile.sections} sections). Leave unchecked to only update the template's formatting.`}
          </span>
        </span>
      </label>
      {replace && !profileEmpty && (
        <p className="mt-2 text-xs font-medium text-red-700">Your current stories, including refined versions, will be deleted.</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || blocked > 0}>
          {save.isPending ? 'Saving…' : 'Save as my template'}
        </Button>
        {blocked > 0 && <span className="text-sm text-red-700">Fix {blocked} paragraph(s) in the Layout tab first.</span>}
      </div>
      {save.error && <div className="mt-3"><ErrorText>{save.error.message}</ErrorText></div>}
    </div>
  );
}

// ---------------------------------------------------------------- Content tab

function ContentTab({ view }: { view: ImportView }) {
  const c = view.content as ResumeContent;
  const groups = groupByOrg(c.positions);
  return (
    <div className="space-y-6">
      {view.issues.length > 0 && (
        <Card title="Needs attention">
          <ul className="space-y-1 text-sm text-red-800">
            {view.issues.map((issue, i) => (
              <li key={i}>
                {issue.block !== null && <span className="mr-2 font-mono text-xs">#{issue.block}</span>}
                {issue.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {c.summary.length > 0 && (
        <Card title="Summary">
          {c.summary.map((p, i) => <p key={i} className="text-sm leading-relaxed">{p}</p>)}
        </Card>
      )}

      {c.skills.length > 0 && (
        <Card title="Skills">
          {c.skills.map((g, i) => (
            <div key={i} className="mb-2 last:mb-0">
              {g.category && <div className="mb-1 text-xs font-semibold text-slate-500">{g.category}</div>}
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card title={`Work history · ${c.positions.length} positions`}>
        <div className="space-y-6">
          {groups.map((g, i) => (
            <div key={i}>
              <h3 className="text-sm font-semibold tracking-wide text-slate-800 uppercase">{g.organization || '(no employer)'}</h3>
              <div className="mt-2 space-y-4 border-l-2 border-slate-100 pl-4">
                {g.positions.map((p, j) => (
                  <div key={j}>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium">{p.title}</span>
                      <span className="text-xs text-slate-500">
                        {[p.location, displayRange(p.start, p.end)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {p.description && <p className="mt-1 text-sm text-slate-700">{p.description}</p>}
                    {p.bullets.length > 0 && (
                      <>
                        <div className="mt-2 text-xs font-medium text-slate-500">
                          {p.bullets.length} stor{p.bullets.length === 1 ? 'y' : 'ies'}
                        </div>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {p.bullets.map((b, k) => <li key={k}>{b}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {c.education.length > 0 && (
        <Card title="Education">
          <ul className="space-y-1 text-sm">
            {c.education.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.degree}</span>
                {e.school && <>, {e.school}</>}
                {e.details && <span className="text-slate-500"> ({e.details})</span>}
                {e.dates && <span className="text-slate-500"> · {e.dates}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {c.certifications.length > 0 && (
        <Card title="Certifications">
          <ul className="space-y-1 text-sm">
            {c.certifications.map((cert, i) => (
              <li key={i}>
                <span className="font-medium">{cert.name}</span>
                {cert.issuer && <>, {cert.issuer}</>}
                {cert.date && <span className="text-slate-500"> · {cert.date}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {c.entries.map((e, i) => (
        <Card key={i} title={e.heading || 'Other'}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{e.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        </Card>
      ))}
    </div>
  );
}

function groupByOrg(positions: PositionContent[]) {
  const groups: { organization: string; positions: PositionContent[] }[] = [];
  for (const p of positions) {
    const last = groups.at(-1);
    if (last && last.organization === p.organization) last.positions.push(p);
    else groups.push({ organization: p.organization, positions: [p] });
  }
  return groups;
}

// ----------------------------------------------------------------- Layout tab

function LayoutTab({ view }: { view: ImportView }) {
  const [showSpacers, setShowSpacers] = useState(false);
  const sections = new Map(view.layout!.sections.map((s) => [s.key, s]));
  const prototypeBlocks = new Set(
    view.layout!.sections.flatMap((s) => Object.values(s.prototypes).map((p) => p!.block)),
  );
  const rows = view.resolved!.filter((b) => showSpacers || b.role !== 'spacer');

  return (
    <Card
      title="How each paragraph is used"
      actions={
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showSpacers} onChange={(e) => setShowSpacers(e.target.checked)} />
          Show spacing paragraphs
        </label>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Each paragraph's role decides where its content goes. The pattern shows which parts are data, e.g.{' '}
        <code className="rounded bg-slate-100 px-1 text-xs">{'{title} | {location} | {dates}'}</code>. Paragraphs marked{' '}
        <span className="rounded bg-indigo-100 px-1 text-xs text-indigo-800">sample</span> are copied to build new resumes.
      </p>
      <div className="-mx-5 divide-y divide-slate-100 border-t border-slate-100">
        {rows.map((b) => (
          <LayoutRow
            key={b.index}
            importId={view.id}
            editable={view.status === 'ready'}
            block={b}
            text={view.blocks[b.index].text}
            sectionLabel={b.section ? sectionLabel(sections.get(b.section)) : ''}
            isPrototype={prototypeBlocks.has(b.index)}
          />
        ))}
      </div>
    </Card>
  );
}

function sectionLabel(s: { kind: keyof typeof SECTION_LABELS; heading: string | null } | undefined) {
  if (!s) return '';
  return s.heading ? titleCase(s.heading) : SECTION_LABELS[s.kind];
}

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

function LayoutRow({
  importId,
  editable,
  block,
  text,
  sectionLabel,
  isPrototype,
}: {
  importId: number;
  editable: boolean;
  block: ResolvedBlock;
  text: string;
  sectionLabel: string;
  isPrototype: boolean;
}) {
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState(block.pattern ?? '');
  useEffect(() => {
    setPattern(block.pattern ?? '');
  }, [block.pattern]);

  const update = useMutation({
    mutationFn: (change: { role?: Role; pattern?: string | null }) => api.updateBlock(importId, block.index, change),
    onSuccess: (view) => queryClient.setQueryData(['import', importId], view),
  });

  const meta = (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
      <span className="font-mono">#{block.index}</span>
      {sectionLabel && <span>· {sectionLabel}</span>}
      {isPrototype && <span className="rounded bg-indigo-100 px-1 text-indigo-800">sample</span>}
    </div>
  );

  if (block.role === 'spacer') {
    return (
      <div className="flex items-center gap-3 px-5 py-1.5">
        {meta}
        <span className="text-xs text-slate-400 italic">spacing</span>
      </div>
    );
  }

  const role = block.role as Role;
  const fields = ROLE_FIELDS[role];
  const savePattern = () => {
    if (pattern !== (block.pattern ?? '')) update.mutate({ pattern: pattern || null });
  };

  return (
    <div
      className={`grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)] ${
        block.status === 'mismatch' ? 'bg-red-50' : ''
      }`}
    >
      <div className="min-w-0">
        {meta}
        <div className="mt-0.5 line-clamp-3 text-sm text-slate-800" title={text}>{text}</div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <select
          className={`${inputClass} py-1 text-sm`}
          value={role}
          disabled={!editable || update.isPending}
          onChange={(e) => update.mutate({ role: e.target.value as Role })}
          aria-label={`Role of paragraph ${block.index}`}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        {fields && fields.join() !== 'text' && (
          <>
            <input
              className={`${inputClass} py-1 font-mono text-xs`}
              value={pattern}
              disabled={!editable || update.isPending}
              placeholder={fields.map((f) => `{${f}}`).join(' | ')}
              onChange={(e) => setPattern(e.target.value)}
              onBlur={savePattern}
              onKeyDown={(e) => e.key === 'Enter' && savePattern()}
              aria-label={`Pattern of paragraph ${block.index}`}
            />
            {block.status === 'ok' && Object.keys(block.values).length > 0 && (
              <div className="text-xs break-words text-slate-500">
                {Object.entries(block.values).map(([k, v]) => (
                  <span key={k} className="mr-3"><span className="text-slate-400">{k}:</span> {v}</span>
                ))}
              </div>
            )}
          </>
        )}
        {block.status === 'mismatch' && <div className="text-xs text-red-700">{block.message}</div>}
        {update.error && <div className="text-xs text-red-700">{update.error.message}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Preview tab

function PreviewTab({ id }: { id: number }) {
  const [key, setKey] = useState<number | null>(null);
  const preview = useMutation({ mutationFn: () => api.previewImport(id), onSuccess: () => setKey(Date.now()) });
  const r = preview.data;

  return (
    <Card
      title="Rebuild check"
      actions={
        <Button variant="primary" onClick={() => preview.mutate()} disabled={preview.isPending}>
          {preview.isPending ? 'Building… (10–30 s)' : key ? 'Rebuild' : 'Build preview'}
        </Button>
      }
    >
      <p className="text-sm text-slate-600">
        Rebuilds your resume from the imported content using the template, then converts the original and the rebuilt
        file to PDF with Word. They should look the same.
      </p>
      {preview.error && <div className="mt-3"><ErrorText>{preview.error.message}</ErrorText></div>}
      {r && key && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span>
              Pages: original <b>{r.originalPages}</b>, rebuilt <b>{r.renderedPages}</b>
            </span>
            <span className={r.diff.removed.length || r.diff.added.length ? 'text-amber-700' : 'text-emerald-700'}>
              {r.diff.removed.length || r.diff.added.length
                ? `${r.diff.removed.length + r.diff.added.length} line(s) differ`
                : `All ${r.diff.same} lines of text match`}
            </span>
            <a className="text-indigo-700 hover:underline" href={`/api/imports/${id}/files/rendered.docx?t=${key}`}>
              Download rebuilt .docx
            </a>
          </div>
          {(r.diff.removed.length > 0 || r.diff.added.length > 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
              {r.diff.removed.map((l, i) => <div key={`r${i}`} className="text-red-800">− {l}</div>)}
              {r.diff.added.map((l, i) => <div key={`a${i}`} className="text-emerald-800">+ {l}</div>)}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {(['original', 'rendered'] as const).map((name) => (
              <div key={name}>
                <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {name === 'original' ? 'Original' : 'Rebuilt from template'}
                </div>
                <iframe
                  title={name}
                  className="h-[75vh] w-full rounded-md border border-slate-200"
                  src={`/api/imports/${id}/files/${name}.pdf?t=${key}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
