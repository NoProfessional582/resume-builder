import { PdfViewer } from '../components/PdfViewer';
import { ApplicationResumeUpload } from '../components/ApplicationResumeUpload';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { IMPORTANCE_LABELS, type Application } from '../applicationTypes';
import { ListTextInput } from '../components/ListEditor';
import { AutoTextarea, Badge, Button, Card, ErrorText, Field, inputClass, LinkButton, StatusBadge } from '../components/ui';
import { useRunStream } from '../hooks/useRunStream';
import { displayRange } from '../lib/dates';
import { describeEvent, formatTime } from '../lib/format';
import {
  DEFAULT_SETTINGS,
  MAX_SKILL_CHARS,
  MAX_SKILLS,
  type CheckWarning,
  type TailoredBullet,
  type TailoredContent,
  type TailoredView,
  type TailorSettings,
} from '../tailoringTypes';
import { ReviewCard } from './ReviewCard';

/** inputClass without w-full, for controls that sit inline next to a button. */
const inlineInput = inputClass.replace('w-full ', '');

/** The Résumé tab of an application: tailor, review, edit and generate the .docx. */
export function TailorTab({ app }: { app: Application }) {
  const queryClient = useQueryClient();
  const versions = useQuery({ queryKey: ['tailored-list', app.id], queryFn: () => api.listTailored(app.id) });
  const [selected, setSelected] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const list = versions.data ?? [];
  const currentId = selected ?? list[0]?.id ?? null;

  if (app.analysis?.status !== 'ready') {
    return (
      <Card>
        <p className="text-sm text-slate-600">Tailoring uses the job analysis. Wait for it to finish (Analysis tab).</p>
      </Card>
    );
  }
  if (versions.error) return <ErrorText>{versions.error.message}</ErrorText>;
  if (!versions.data) return <p className="text-sm text-slate-500">Loading…</p>;

  const onStarted = (v: TailoredView) => {
    queryClient.invalidateQueries({ queryKey: ['tailored-list', app.id] });
    queryClient.setQueryData(['tailored', v.id], v);
    setSelected(v.id);
    setShowSettings(false);
  };

  return (
    <div className="space-y-5">
      <ApplicationResumeUpload applicationId={app.id} onSaved={onStarted} />
      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-slate-500">Version</span>
            <select className={`${inputClass} min-w-0 py-1`} value={currentId ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
              {list.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                  {v.label ? ` · ${v.label}` : ''} · {formatTime(v.createdAt)}
                  {v.status === 'tailoring'
                    ? ' · tailoring…'
                    : v.status === 'failed'
                      ? ' · failed'
                      : v.pages
                        ? ` · ${v.pages} page${v.pages === 1 ? '' : 's'}`
                        : ''}
                </option>
              ))}
            </select>
          </label>
          {!showSettings && <Button onClick={() => setShowSettings(true)}>New version</Button>}
        </div>
      )}

      {(showSettings || list.length === 0) && (
        <SettingsCard
          appId={app.id}
          initial={list.length ? undefined : DEFAULT_SETTINGS}
          versionId={currentId}
          onStarted={onStarted}
          onCancel={list.length ? () => setShowSettings(false) : undefined}
        />
      )}

      {currentId != null && !showSettings && (
        <VersionView key={currentId} id={currentId} appId={app.id} onDeleted={() => setSelected(null)} onNewVersion={onStarted} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Settings

function SettingsCard({
  appId,
  initial,
  versionId,
  onStarted,
  onCancel,
}: {
  appId: number;
  initial?: TailorSettings;
  versionId: number | null;
  onStarted: (v: TailoredView) => void;
  onCancel?: () => void;
}) {
  // Start from the last version's settings when there is one.
  const roles = useQuery({ queryKey: ['positions'], queryFn: api.listPositions });
  const last = useQuery({
    queryKey: ['tailored', versionId],
    queryFn: () => api.getTailored(versionId!),
    enabled: versionId != null && !initial,
  });
  const [s, setS] = useState<TailorSettings | null>(initial ?? null);
  useEffect(() => {
    if (!s && last.data && roles.data) {
      const included = last.data.content?.positions.map((p) => p.positionId);
      setS({ ...last.data.settings, excludedPositionIds: included
        ? roles.data.filter((p) => !included.includes(p.id)).map((p) => p.id)
        : last.data.settings.excludedPositionIds ?? [] });
    }
  }, [last.data, roles.data, s]);
  const start = useMutation({ mutationFn: (settings: TailorSettings) => api.startTailoring(appId, settings), onSuccess: onStarted });

  const settings = s ?? DEFAULT_SETTINGS;
  const set = (patch: Partial<TailorSettings>) => setS({ ...settings, ...patch });

  return (
    <Card title="Tailor your résumé to this job">
      <p className="mb-4 text-sm text-slate-600">
        The agent picks your best-fit stories, writes bullets in your style guide's résumé voice using the keywords your stories
        support, and lists any gaps. Usually 1–2 minutes.
      </p>
      <form
        className="grid gap-4 @min-[40rem]:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate(settings);
        }}
      >
        <fieldset className="space-y-3 @min-[40rem]:col-span-3">
          <legend className="mb-2 text-sm font-semibold">Roles to include</legend>
          <p className="text-xs text-slate-500">Uncheck roles that don’t apply to this job. Your full work history stays available for other résumés.</p>
          {roles.isPending && <p className="text-sm text-slate-500">Loading work history…</p>}
          {roles.error && <ErrorText>{roles.error.message}</ErrorText>}
          {roles.data?.length === 0 && <p className="text-sm text-slate-500">Add roles in Work history first.</p>}
          {roles.data?.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={!(settings.excludedPositionIds ?? []).includes(p.id)} onChange={(e) => {
                const excluded = settings.excludedPositionIds ?? [];
                set({ excludedPositionIds: e.target.checked ? excluded.filter((id) => id !== p.id) : [...excluded, p.id] });
              }} />
              <span>{p.title} · {p.organization}<span className="block text-xs text-slate-500">{displayRange(p.start, p.end)}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label="Target length">
          <select className={inputClass} value={settings.targetPages} onChange={(e) => set({ targetPages: Number(e.target.value) })}>
            <option value={1}>1 page</option>
            <option value={2}>2 pages</option>
            <option value={3}>3 pages</option>
          </select>
        </Field>
        <Field label="Fewest bullets per position">
          <input type="number" min={0} max={8} className={inputClass} value={settings.minBullets} onChange={(e) => set({ minBullets: Number(e.target.value) })} />
        </Field>
        <Field label="Most bullets per position">
          <input type="number" min={1} max={10} className={inputClass} value={settings.maxBullets} onChange={(e) => set({ maxBullets: Number(e.target.value) })} />
        </Field>
        <label className="flex items-center gap-2 text-sm @min-[40rem]:col-span-3">
          <input type="checkbox" checked={settings.includeDescriptions} onChange={(e) => set({ includeDescriptions: e.target.checked })} />
          Write a role overview under each position
        </label>
        <label className="flex items-start gap-2 text-sm @min-[40rem]:col-span-3">
          <input type="checkbox" className="mt-1" checked={settings.autoFit} onChange={(e) => set({ autoFit: e.target.checked })} />
          <span>
            Fit to the target length automatically
            <span className="block text-xs text-slate-500">
              Builds the Word file, measures it, and trims until it fits (up to 3 rounds; adds about a minute per round).
            </span>
          </span>
        </label>
        <div className="@min-[40rem]:col-span-3">
          <Field label="Instructions for this résumé" hint='Optional, e.g. "Emphasize customer adoption and AI enablement."'>
            <AutoTextarea minRows={2} value={settings.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          </Field>
        </div>
        <div className="flex items-center gap-2 @min-[40rem]:col-span-3">
          <Button variant="primary" type="submit" disabled={start.isPending || !roles.data || (versionId != null && !initial && !s)}>
            {start.isPending ? 'Starting…' : 'Tailor résumé'}
          </Button>
          {onCancel && <Button type="button" onClick={onCancel}>Cancel</Button>}
        </div>
        {start.error && <div className="@min-[40rem]:col-span-3"><ErrorText>{start.error.message}</ErrorText></div>}
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------- Version

function VersionView({
  id,
  appId,
  onDeleted,
  onNewVersion,
}: {
  id: number;
  appId: number;
  onDeleted: () => void;
  onNewVersion: (v: TailoredView) => void;
}) {
  const queryClient = useQueryClient();
  const version = useQuery({
    queryKey: ['tailored', id],
    queryFn: () => api.getTailored(id),
    refetchInterval: (q) => (q.state.data?.status === 'tailoring' ? 4000 : false),
  });
  const v = version.data;
  const stream = useRunStream(v?.runId ?? null);
  useEffect(() => {
    if (stream.run && ['succeeded', 'failed', 'cancelled'].includes(stream.run.status)) {
      queryClient.invalidateQueries({ queryKey: ['tailored', id] });
    }
  }, [stream.run?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // A job can span several agent runs plus Word builds; refresh the version list when it ends.
  const status = v?.status;
  useEffect(() => {
    if (status && status !== 'tailoring') queryClient.invalidateQueries({ queryKey: ['tailored-list', appId] });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useMutation({
    mutationFn: () => api.retryTailored(id),
    onSuccess: (r) => queryClient.setQueryData(['tailored', id], r),
  });

  if (version.error) return <ErrorText>{version.error.message}</ErrorText>;
  if (!v) return <p className="text-sm text-slate-500">Loading…</p>;

  if (v.status === 'tailoring') {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm">
          <StatusBadge status="running" />
          <span className="text-slate-700">{v.progress ?? `Working on version ${v.version}…`}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {v.label ?? `Version ${v.version}`} · writing takes about a minute; each fitting round adds about a minute.
        </p>
        {stream.run && stream.run.status === 'running' && stream.events.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">Agent: {describeEvent(stream.events.at(-1)!.event)}</p>
        )}
      </Card>
    );
  }
  if (v.status === 'failed' || !v.content) {
    return (
      <Card title={`Version ${v.version} failed`}>
        <ErrorText>{v.error ?? 'Unknown error'}</ErrorText>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => retry.mutate()} disabled={retry.isPending}>Try again</Button>
          <DeleteVersion id={id} appId={appId} onDeleted={onDeleted} />
        </div>
        {retry.error && <div className="mt-3"><ErrorText>{retry.error.message}</ErrorText></div>}
      </Card>
    );
  }
  // Remount (dropping local edits) only when the saved content is replaced, e.g. by a reset.
  return <Editor key={`${v.id}-${v.userEdited}`} view={v} appId={appId} onDeleted={onDeleted} onNewVersion={onNewVersion} />;
}

function DeleteVersion({ id, appId, onDeleted }: { id: number; appId: number; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteTailored(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tailored-list', appId] });
      onDeleted();
    },
  });
  return (
    <LinkButton danger onClick={() => window.confirm('Delete this version and its .docx?') && remove.mutate()} disabled={remove.isPending}>
      Delete version
    </LinkButton>
  );
}

// -------------------------------------------------------------------- Editor

function Editor({
  view,
  appId,
  onDeleted,
  onNewVersion,
}: {
  view: TailoredView;
  appId: number;
  onDeleted: () => void;
  onNewVersion: (v: TailoredView) => void;
}) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<TailoredContent>(() => structuredClone(view.content!));
  const [removedPositions, setRemovedPositions] = useState<TailoredContent['positions']>([]);
  const [showPdf, setShowPdf] = useState(false);
  const [fitPages, setFitPages] = useState(view.settings.targetPages);
  const [request, setRequest] = useState('');
  const fit = useMutation({ mutationFn: () => api.fitTailored(view.id, fitPages), onSuccess: onNewVersion });
  const revise = useMutation({ mutationFn: () => api.reviseTailored(view.id, request), onSuccess: onNewVersion });
  const dirty = JSON.stringify(content) !== JSON.stringify(view.content);
  const update = (v: TailoredView) => {
    queryClient.setQueryData(['tailored', v.id], v);
    queryClient.invalidateQueries({ queryKey: ['tailored-list', appId] });
  };
  const save = useMutation({ mutationFn: () => api.saveTailored(view.id, content), onSuccess: update });
  const reset = useMutation({ mutationFn: () => api.resetTailored(view.id), onSuccess: update });
  const generate = useMutation({
    mutationFn: () => api.generateTailored(view.id),
    onSuccess: (v) => {
      update(v);
      setShowPdf(true);
    },
  });

  const set = (patch: Partial<TailoredContent>) => setContent({ ...content, ...patch });
  const setPosition = (i: number, patch: Partial<TailoredContent['positions'][number]>) =>
    set({ positions: content.positions.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const warnings = dirty ? [] : (view.checks?.warnings ?? []);
  const warningsFor = (positionId: number, bullet: number | null) =>
    warnings.filter((w) => w.positionId === positionId && w.bullet === bullet);
  const error = save.error ?? reset.error ?? generate.error ?? fit.error ?? revise.error;
  const fileKey = view.generated?.at ?? 0;
  const overTarget = view.generated?.pages != null && view.generated.pages > view.settings.targetPages;

  return (
    <div className="space-y-5">
      <ReviewCard versionId={view.id} dirty={dirty} />
      <div className="grid items-start gap-6 @min-[64rem]:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          {view.generated && showPdf && (
            <Card title="Preview" actions={<LinkButton onClick={() => setShowPdf(false)}>Hide</LinkButton>}>
              <PdfViewer title="Résumé preview" src={`/api/tailored/${view.id}/files/pdf?t=${fileKey}`} />
            </Card>
          )}

          <Card title="Summary">
            <AutoTextarea
              minRows={4}
              value={content.summary.join('\n\n')}
              onChange={(e) => set({ summary: e.target.value.split(/\n\s*\n/) })}
            />
            <BlockWarnings warnings={warnings.filter((w) => w.positionId === null)} />
          </Card>

          <Card title="Skills">
            {content.skills.map((g, gi) => (
              <div key={gi} className="mb-3 last:mb-0">
                {(content.skills.length > 1 || g.category) && (
                  <input
                    className={`${inputClass} mb-2`}
                    value={g.category ?? ''}
                    placeholder="Category"
                    onChange={(e) =>
                      set({ skills: content.skills.map((x, j) => (j === gi ? { ...x, category: e.target.value || null } : x)) })
                    }
                  />
                )}
                <ListTextInput
                  separator="line"
                  minRows={4}
                  value={g.items}
                  onChange={(items) => set({ skills: content.skills.map((x, j) => (j === gi ? { ...x, items } : x)) })}
                  aria-label="Skills, one per line"
                />
              </div>
            ))}
            <SkillLimits skills={content.skills} />
          </Card>

          <Card title="Roles on this résumé">
            <p className="text-sm text-slate-600">Remove roles that don’t apply to this job. Your full work history and other résumés stay unchanged. Save your changes, then rebuild the Word file.</p>
            {content.positions.length === 0 && <p className="mt-3 text-sm text-slate-500">No roles included.</p>}
            {removedPositions.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm" aria-live="polite">
                {removedPositions.map((p) => (
                  <li key={p.positionId} className="flex flex-wrap items-center justify-between gap-2">
                    <span>Removed: {p.title} · {p.organization}</span>
                    <LinkButton onClick={() => {
                      const order = view.content!.positions.map((position) => position.positionId);
                      set({ positions: [...content.positions, p].sort((a, b) => order.indexOf(a.positionId) - order.indexOf(b.positionId)) });
                      setRemovedPositions(removedPositions.filter((position) => position.positionId !== p.positionId));
                    }}>Undo removal</LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {content.positions.map((p, pi) => (
            <Card key={p.positionId} title={`${p.title} · ${p.organization}`} actions={
              <LinkButton danger aria-label={`Remove ${p.title} at ${p.organization} from résumé`} onClick={() => {
                setRemovedPositions([...removedPositions, p]);
                set({ positions: content.positions.filter((position) => position.positionId !== p.positionId) });
              }}>Remove from résumé</LinkButton>
            }>
              <p className="-mt-2 mb-3 text-xs text-slate-500">{[p.location, displayRange(p.start, p.end)].filter(Boolean).join(' · ')}</p>
              {(p.description !== null || view.settings.includeDescriptions) && (
                <Field label="Role overview">
                  <AutoTextarea minRows={2} value={p.description ?? ''} onChange={(e) => setPosition(pi, { description: e.target.value || null })} />
                </Field>
              )}
              <BlockWarnings warnings={warningsFor(p.positionId, null)} />
              <div className="mt-4 space-y-3">
                {p.bullets.map((b, bi) => (
                  <BulletEditor
                    key={bi}
                    bullet={b}
                    stories={view.stories}
                    warnings={warningsFor(p.positionId, bi)}
                    first={bi === 0}
                    last={bi === p.bullets.length - 1}
                    onChange={(nb) => setPosition(pi, { bullets: p.bullets.map((x, j) => (j === bi ? nb : x)) })}
                    onMove={(d) => {
                      const bullets = [...p.bullets];
                      [bullets[bi], bullets[bi + d]] = [bullets[bi + d], bullets[bi]];
                      setPosition(pi, { bullets });
                    }}
                    onRemove={() => setPosition(pi, { bullets: p.bullets.filter((_, j) => j !== bi) })}
                  />
                ))}
                <AddBullet
                  positionId={p.positionId}
                  stories={view.stories}
                  used={new Set(p.bullets.flatMap((b) => b.sourceStoryIds))}
                  onAdd={(b) => setPosition(pi, { bullets: [...p.bullets, b] })}
                />
              </div>
            </Card>
          ))}

          {(content.education.length > 0 || content.certifications.length > 0 || content.entries.length > 0) && (
            <Card title="Education, certifications and other sections">
              <p className="mb-3 text-xs text-slate-500">Printed as in your profile. Remove anything that doesn't belong on this résumé.</p>
              <RemovableList
                items={content.education.map((e) => [e.degree, e.school, e.details].filter(Boolean).join(', '))}
                onRemove={(i) => set({ education: content.education.filter((_, j) => j !== i) })}
              />
              <RemovableList
                items={content.certifications.map((c) => [c.name, c.date].filter(Boolean).join(', '))}
                onRemove={(i) => set({ certifications: content.certifications.filter((_, j) => j !== i) })}
              />
              {content.entries.map((e, ei) => (
                <RemovableList
                  key={ei}
                  items={e.items.map((t) => `${e.heading}: ${t}`)}
                  onRemove={(i) =>
                    set({
                      entries: content.entries
                        .map((x, j) => (j === ei ? { ...x, items: x.items.filter((_, k) => k !== i) } : x))
                        .filter((x) => x.items.length),
                    })
                  }
                />
              ))}
            </Card>
          )}

          {dirty && (
            <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-slate-200 bg-slate-50/95 py-3">
              <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button onClick={() => setContent(structuredClone(view.content!))}>Discard</Button>
              <span className="text-xs text-slate-500">Checks update after saving.</span>
            </div>
          )}
        </div>

        <aside className="order-first space-y-5 lg:order-none">
          <Card title="Word file">
            <div className="space-y-3 text-sm">
              {view.generated ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {view.generated.pages ?? '?'} page{view.generated.pages === 1 ? '' : 's'}
                    </span>
                    {view.generated.pages != null && view.generated.pages > view.settings.targetPages && (
                      <Badge tone="amber">over {view.settings.targetPages}-page target</Badge>
                    )}
                    {view.generated.stale && <Badge tone="amber">out of date</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">Built {formatTime(view.generated.at)}</div>
                  <div className="flex gap-3">
                    <a className="text-indigo-700 hover:underline" href={`/api/tailored/${view.id}/files/docx?t=${fileKey}`}>Download .docx</a>
                    {view.generated.pages != null && (
                      <button className="text-indigo-700 hover:underline" onClick={() => setShowPdf(!showPdf)}>
                        {showPdf ? 'Hide' : 'Show'} preview
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-600">Not built yet.</p>
              )}
              <Button variant="primary" onClick={() => generate.mutate()} disabled={dirty || generate.isPending}>
                {generate.isPending ? 'Building… (about 10 s)' : view.generated ? 'Rebuild .docx' : 'Generate .docx'}
              </Button>
              {dirty && <p className="text-xs text-slate-500">Save your changes first.</p>}
              {view.fitNote && (
                <p className={`text-xs ${view.fitNote.startsWith('Fitted') ? 'text-emerald-700' : 'text-amber-800'}`}>{view.fitNote}</p>
              )}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => fit.mutate()} disabled={dirty || fit.isPending} variant={overTarget ? 'primary' : 'secondary'}>
                    {fit.isPending ? 'Starting…' : 'Fit to'}
                  </Button>
                  <select
                    className={`${inlineInput} py-1`}
                    value={fitPages}
                    onChange={(e) => setFitPages(Number(e.target.value))}
                    aria-label="Pages to fit"
                  >
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                    <option value={3}>3 pages</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-slate-500">Makes a new version, trimmed until it fits.</p>
              </div>
            </div>
          </Card>

          <Card title="Ask for changes">
            <AutoTextarea
              minRows={2}
              value={request}
              placeholder='e.g. "Lead with AI enablement" or "Make the Recruiter role one bullet"'
              onChange={(e) => setRequest(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button onClick={() => revise.mutate()} disabled={dirty || request.trim().length < 3 || revise.isPending}>
                {revise.isPending ? 'Starting…' : 'Revise'}
              </Button>
              <span className="text-xs text-slate-500">Makes a new version{view.settings.autoFit ? ', fitted to length' : ''}.</span>
            </div>
          </Card>

          <CoverageCard view={view} dirty={dirty} />

          {content.gaps.length > 0 && (
            <Card title={`Gaps · ${content.gaps.length}`}>
              <ul className="space-y-2 text-xs">
                {content.gaps.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-800">{g.item}</span>{' '}
                    <span className="text-slate-400">({IMPORTANCE_LABELS[g.importance].toLowerCase()})</span>
                    <div className="text-slate-600">{g.note}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {content.notes && (
            <Card title="Agent's notes">
              <p className="text-xs leading-relaxed text-slate-600">{content.notes}</p>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {view.userEdited && (
              <LinkButton onClick={() => window.confirm('Discard your edits to this version?') && reset.mutate()}>
                Reset to AI version
              </LinkButton>
            )}
            <DeleteVersion id={view.id} appId={appId} onDeleted={onDeleted} />
          </div>
          {error && <ErrorText>{error.message}</ErrorText>}
        </aside>
      </div>
    </div>
  );
}

function CoverageCard({ view, dirty }: { view: TailoredView; dirty: boolean }) {
  const checks = view.checks;
  if (!checks) return null;
  const groups = (['required', 'preferred'] as const).map((imp) => ({
    imp,
    items: checks.coverage.filter((c) => c.importance === imp),
  }));
  const warningCount = checks.warnings.length;
  return (
    <Card title="Checks">
      <div className="space-y-4 text-xs">
        <div className={warningCount ? 'text-amber-800' : 'text-emerald-700'}>
          {warningCount
            ? `${warningCount} item${warningCount === 1 ? '' : 's'} to review (marked in the editor)`
            : '✓ No problems found: numbers match your stories, sources check out, no avoid-list phrases.'}
          {dirty && <span className="block text-slate-500">Based on the last saved version.</span>}
        </div>
        {groups.map(({ imp, items }) =>
          items.length ? (
            <div key={imp}>
              <div className="mb-1 font-semibold text-slate-600">
                {IMPORTANCE_LABELS[imp]} keywords · {items.filter((c) => c.covered).length}/{items.length} used
              </div>
              <div className="flex flex-wrap gap-1">
                {items.map((c) => (
                  <span
                    key={c.term}
                    title={c.covered ? 'On the résumé' : 'Not on the résumé'}
                    className={`rounded-full px-2 py-0.5 ${c.covered ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-400 ring-1 ring-slate-200'}`}
                  >
                    {c.covered ? '✓ ' : ''}
                    {c.term}
                  </span>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </Card>
  );
}

/** Live count against the skills table's 9 cells and 26-character width. */
function SkillLimits({ skills }: { skills: TailoredContent['skills'] }) {
  const all = skills.flatMap((g) => g.items).map((s) => s.trim()).filter(Boolean);
  const long = all.filter((s) => s.length > MAX_SKILL_CHARS);
  const over = all.length > MAX_SKILLS;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      <p className={over ? 'text-amber-800' : 'text-slate-400'}>
        {all.length}/{MAX_SKILLS} skills, up to {MAX_SKILL_CHARS} characters each. One per line.
        {over && ` Only the first ${MAX_SKILLS} are printed.`}
      </p>
      {long.map((s) => (
        <p key={s} className="text-amber-800">
          ⚠ "{s}" is {s.length} characters and will wrap in its cell.
        </p>
      ))}
    </div>
  );
}

function BlockWarnings({ warnings }: { warnings: CheckWarning[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {warnings.map((w, i) => <li key={i} className="text-xs text-amber-800">⚠ {w.message}</li>)}
    </ul>
  );
}

function BulletEditor({
  bullet,
  stories,
  warnings,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  bullet: TailoredBullet;
  stories: TailoredView['stories'];
  warnings: CheckWarning[];
  first: boolean;
  last: boolean;
  onChange: (b: TailoredBullet) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`flex gap-2 rounded-md border p-3 ${warnings.length ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
      <div className="min-w-0 flex-1">
        <AutoTextarea minRows={2} value={bullet.text} onChange={(e) => onChange({ ...bullet, text: e.target.value })} aria-label="Bullet" />
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {bullet.sourceStoryIds.map((sid) => (
            <span
              key={sid}
              title={stories[sid]?.text ?? 'This story no longer exists'}
              className="cursor-help rounded bg-slate-200 px-1.5 py-0.5 text-slate-700"
            >
              from story {sid}
            </span>
          ))}
          {bullet.keywords.map((k) => (
            <span key={k} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{k}</span>
          ))}
        </div>
        <BlockWarnings warnings={warnings} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <LinkButton onClick={() => onMove(-1)} disabled={first} aria-label="Move up">↑</LinkButton>
        <LinkButton onClick={() => onMove(1)} disabled={last} aria-label="Move down">↓</LinkButton>
        <LinkButton danger onClick={onRemove} aria-label="Remove bullet">✕</LinkButton>
      </div>
    </div>
  );
}

function AddBullet({
  positionId,
  stories,
  used,
  onAdd,
}: {
  positionId: number;
  stories: TailoredView['stories'];
  used: Set<number>;
  onAdd: (b: TailoredBullet) => void;
}) {
  const available = Object.entries(stories).filter(([id, s]) => s.positionId === positionId && !used.has(Number(id)));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LinkButton onClick={() => onAdd({ text: '', sourceStoryIds: [], keywords: [] })}>+ Add bullet</LinkButton>
      {available.length > 0 && (
        <select
          className="max-w-xs rounded border-0 bg-transparent py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) onAdd({ text: stories[id].text, sourceStoryIds: [id], keywords: [] });
          }}
          aria-label="Add a bullet from an unused story"
        >
          <option value="">+ Add from an unused story…</option>
          {available.map(([id, s]) => (
            <option key={id} value={id}>{s.text.slice(0, 80)}…</option>
          ))}
        </select>
      )}
    </div>
  );
}

function RemovableList({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <ul className="mb-3 space-y-1 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="min-w-0 flex-1">{t}</span>
          <LinkButton danger onClick={() => onRemove(i)} aria-label="Remove">✕</LinkButton>
        </li>
      ))}
    </ul>
  );
}
