import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api';
import type { ApplicationSummary } from '../applicationTypes';
import { Button, buttonClassName, Card, ErrorText, Field, inputClass, PageHeader } from '../components/ui';
import {
  defaults,
  filterApplications,
  LABELS,
  STAGES,
  today,
  workspaceRequest as request,
  type Preferences,
} from '../workspace';
import { StageForm } from './WorkspaceTab';

export function ApplicationWorkspaceList() {
  const queryClient = useQueryClient();
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropDetails, setDropDetails] = useState<{ application: ApplicationSummary; stage: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dropHandled = useRef(false);
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      request('POST', `/applications/${id}/stage`, { stage, effectiveDate: today() }),
    onSuccess: (_data, { id, stage }) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', id] });
      setAnnouncement(`Application moved to ${LABELS[stage]}.`);
    },
    onError: () =>
      setAnnouncement('Stage was not changed. Try dragging again or open the application to change its stage.'),
  });
  const list = useQuery({
    queryKey: ['applications'],
    queryFn: api.listApplications,
    refetchInterval: (q) => (q.state.data?.some((a) => a.analysisStatus === 'analyzing') ? 3000 : false),
  });
  const prefs = useQuery({
    queryKey: ['workspace-preferences'],
    queryFn: () => request<Preferences | null>('GET', '/workspace-preferences'),
  });
  const [local, setLocal] = useState<Preferences | null>(null);
  // Ignore saved searches now that search is no longer an application filter.
  const p: Preferences = { ...(local ?? prefs.data ?? defaults), search: '' };
  const save = useMutation({
    scope: { id: 'workspace-preferences' },
    mutationFn: (v: Preferences) => request('PUT', '/workspace-preferences', v),
  });
  const set = (v: Partial<Preferences>) => {
    const next = { ...p, ...v };
    setLocal(next);
    save.mutate(next);
  };
  const all = list.data ?? [];
  const rows = filterApplications(all, p);
  const card = (a: ApplicationSummary) => (
    <article
      key={a.id}
      draggable={p.view === 'board' && !move.isPending}
      aria-label={`${a.roleTitle} at ${a.company}`}
      onDragStart={(event) => {
        if (
          p.view !== 'board' ||
          move.isPending ||
          (event.target as HTMLElement).closest('button,input,textarea,select')
        ) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(a.id));
        dropHandled.current = false;
        setDraggedId(a.id);
        move.reset();
        setAnnouncement(`Dragging ${a.roleTitle}. Drop into a stage column.`);
      }}
      onDragEnd={() => {
        setDraggedId(null);
        setDropTarget(null);
        if (!dropHandled.current) setAnnouncement('Move cancelled. Stage was not changed.');
      }}
      className={`space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${p.view === 'board' && !move.isPending ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedId === a.id ? 'opacity-50' : ''}`}
    >
      <Link draggable={false} className="font-semibold text-indigo-700 hover:underline" to={`/applications/${a.id}`}>
        {a.roleTitle}
      </Link>
      <p className="text-sm">{a.company}</p>
      <p className="text-xs text-slate-500">
        {a.analysisStatus === 'analyzing'
          ? 'Analyzing…'
          : a.analysisStatus === 'failed'
            ? 'Analysis failed'
            : a.analysisStatus === 'ready'
              ? `${a.keywordCount} keywords · ${a.requiredCount} required`
              : ''}
      </p>
      <p className="text-xs text-slate-500">
        <span className="block">{LABELS[a.stage ?? 'unset']}</span>
        Last activity: <span className="whitespace-nowrap">{a.lastActivityDate ?? 'Unknown'}</span>
      </p>
      {a.offerOutcome && <p className="text-xs">Offer: {a.offerOutcome}</p>}
      {a.closureReason && <p className="text-xs">{a.closureReason.replaceAll('_', ' ')}</p>}
    </article>
  );
  return (
    <>
      <PageHeader
        title="Applications"
        description="Track your search, people, and progress."
        actions={
          <>
            <div role="group" aria-label="Application view" className="mr-6 flex items-center gap-2">
              <Button
                type="button"
                aria-pressed={p.view === 'list'}
                variant={p.view === 'list' ? 'primary' : 'secondary'}
                onClick={() => set({ view: 'list' })}
              >
                List
              </Button>
              <Button
                type="button"
                aria-pressed={p.view === 'board'}
                variant={p.view === 'board' ? 'primary' : 'secondary'}
                onClick={() => set({ view: 'board' })}
              >
                Board
              </Button>
            </div>
            <Link className={buttonClassName('primary')} to="/applications/new">
              New application
            </Link>
          </>
        }
      />
      {list.error && <ErrorText>{list.error.message}</ErrorText>}
      {prefs.error && <ErrorText>{prefs.error.message}</ErrorText>}
      {save.error && <ErrorText>Could not remember view settings: {save.error.message}</ErrorText>}
      {move.error && (
        <ErrorText>
          {move.error.message} Stage was not changed. Try dragging again or open the application to change its stage.
        </ErrorText>
      )}
      <p role="status" aria-live="polite" className="mb-3 min-h-5 text-sm text-slate-600">
        {move.isPending ? 'Saving stage…' : announcement}
      </p>
      {dropDetails && (
        <DropStageDialog
          application={dropDetails.application}
          stage={dropDetails.stage}
          onClose={() => {
            setAnnouncement('Move cancelled. Stage was not changed.');
            setDropDetails(null);
          }}
          onSaved={() => {
            setAnnouncement('Application stage saved.');
            setDropDetails(null);
          }}
        />
      )}
      <Card>
        <div className="grid gap-3 @min-[48rem]:grid-cols-2 @min-[80rem]:grid-cols-3">
          <Field label="Companies (select any)">
            <select
              multiple
              className={inputClass}
              value={p.companies}
              onChange={(e) =>
                set({
                  companies: Array.from(e.target.selectedOptions, (o) => o.value),
                })
              }
            >
              {[...new Set(all.map((a) => a.company))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div>
            <label htmlFor="application-sort" className="mb-1 block text-sm font-medium text-slate-800">
              Sort by
            </label>
            <div className="flex items-center gap-2">
              <select
                id="application-sort"
                className={`${inputClass} flex-1`}
                value={p.sort}
                onChange={(e) => set({ sort: e.target.value as Preferences['sort'] })}
              >
                {[
                  ['activity', 'Last meaningful activity'],
                  ['added', 'Date added'],
                  ['title', 'Role title'],
                  ['company', 'Company'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <div role="group" aria-label="Sort direction" className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  aria-label="Sort ascending"
                  title="Sort ascending"
                  aria-pressed={p.ascending}
                  variant={p.ascending ? 'primary' : 'secondary'}
                  className="h-9 w-9 justify-center px-0"
                  onClick={() => set({ ascending: true })}
                >
                  <span aria-hidden="true" className="text-lg">
                    ↑
                  </span>
                </Button>
                <Button
                  type="button"
                  aria-label="Sort descending"
                  title="Sort descending"
                  aria-pressed={!p.ascending}
                  variant={!p.ascending ? 'primary' : 'secondary'}
                  className="h-9 w-9 justify-center px-0"
                  onClick={() => set({ ascending: false })}
                >
                  <span aria-hidden="true" className="text-lg">
                    ↓
                  </span>
                </Button>
              </div>
            </div>
          </div>
          {p.view === 'board' && (
            <Field label="Group within columns">
              <select
                className={inputClass}
                value={String(p.group)}
                onChange={(e) => set({ group: e.target.value === 'true' })}
              >
                <option value="false">None</option>
                <option value="true">Company</option>
              </select>
            </Field>
          )}
        </div>
        <fieldset className="my-3">
          <legend className="text-sm font-medium">Stages / visible columns</legend>
          <div className="flex flex-wrap gap-3">
            {[...STAGES, ...(all.some((a) => !a.stage) ? ['unset'] : [])].map((s) => (
              <label className="text-sm" key={s}>
                <input
                  type="checkbox"
                  checked={p.visible.includes(s)}
                  onChange={(e) =>
                    set({
                      visible: e.target.checked ? [...p.visible, s] : p.visible.filter((v) => v !== s),
                    })
                  }
                />{' '}
                {LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button onClick={() => set({ ...defaults, view: p.view })}>Reset filters / show all stages</Button>
        <p className="mt-2 text-sm">{rows.length} matching applications</p>
      </Card>
      {!list.data && !list.error && <p>Loading applications…</p>}
      {list.data && !all.length && <p className="my-4">No applications yet. Add your first application above.</p>}
      {p.view === 'list' ? (
        <div className="mt-4 space-y-3">
          {rows.map(card)}
          {!!all.length && !rows.length && <p>No matches for the current filters.</p>}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-500">
            Drag cards between stage columns, or open an application to change its stage. Offer and closure moves ask
            for details before saving.
          </p>
          <div
            tabIndex={0}
            aria-label="Application board, scroll horizontally for more stages"
            className="mt-4 flex gap-4 overflow-x-auto pb-4"
          >
            {[...STAGES, ...(all.some((a) => !a.stage) ? ['unset'] : [])]
              .filter((s) => p.visible.includes(s))
              .map((s) => {
                const items = rows.filter((a) => (a.stage ?? 'unset') === s);
                const groups = p.group
                  ? [...new Set(items.map((a) => a.company))].sort((a, b) => a.localeCompare(b))
                  : [''];
                return (
                  <section
                    className={`min-w-64 flex-1 basis-0 rounded-lg p-3 transition-colors ${dropTarget === s ? 'bg-indigo-100 ring-2 ring-inset ring-indigo-500' : 'bg-slate-100'}`}
                    key={s}
                    aria-label={`${LABELS[s]} stage column`}
                    onDragOver={(event) => {
                      const source = all.find((a) => a.id === draggedId);
                      if (!source || s === 'unset' || source.stage === s || move.isPending) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDropTarget(s);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = all.find((a) => a.id === draggedId);
                      setDraggedId(null);
                      setDropTarget(null);
                      if (!source || s === 'unset' || source.stage === s || move.isPending) return;
                      dropHandled.current = true;
                      if (s === 'offer' || s === 'closed') {
                        setDropDetails({ application: source, stage: s });
                        setAnnouncement('Complete the stage details to save this move.');
                      } else move.mutate({ id: source.id, stage: s });
                    }}
                  >
                    <h2 className="mb-3 font-semibold">
                      {LABELS[s]} · {items.length}
                    </h2>
                    <div className="-mx-3 max-h-[70vh] overflow-y-auto [scrollbar-width:thin]">
                      <div className="space-y-3 px-3 pb-1">
                        {groups.map((g) => (
                          <div className="space-y-3" key={g}>
                            {p.group && (
                              <h3 className="text-sm font-medium">
                                {g} · {items.filter((a) => a.company === g).length}
                              </h3>
                            )}
                            {items.filter((a) => !p.group || a.company === g).map(card)}
                          </div>
                        ))}
                        {!items.length && (
                          <p className="text-sm text-slate-500">
                            {all.some((a) => (a.stage ?? 'unset') === s)
                              ? 'No matches for current filters.'
                              : 'No applications in this stage.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
          </div>
        </>
      )}
    </>
  );
}

function DropStageDialog({
  application,
  stage,
  onClose,
  onSaved,
}: {
  application: ApplicationSummary;
  stage: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="drop-stage-title"
      className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
    >
      <h2 id="drop-stage-title" className="mb-2 text-lg font-semibold">
        Move to {LABELS[stage]}
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        {application.roleTitle} · {application.company}. The card stays in its current stage until you save.
      </p>
      <StageForm id={application.id} currentStage={stage} onDone={onSaved} onPendingChange={setPending} />
      <Button className="mt-3" disabled={pending} onClick={onClose}>
        Cancel move
      </Button>
    </dialog>
  );
}
