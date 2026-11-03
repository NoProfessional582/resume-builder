import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { RefinePanel } from '../components/RefinePanel';
import { AutoTextarea, Badge, Button, Card, ErrorText, Field, inputClass, LinkButton, PageHeader } from '../components/ui';
import { displayRange } from '../lib/dates';
import { formatTime } from '../lib/format';
import type { Position, PositionInput, Story } from '../profileTypes';

export function WorkHistoryPage() {
  const positions = useQuery({ queryKey: ['positions'], queryFn: api.listPositions });
  const [adding, setAdding] = useState(false);

  if (positions.error) return <ErrorText>{positions.error.message}</ErrorText>;
  if (!positions.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const list = positions.data;
  const organizations = [...new Set(list.map((p) => p.organization))];
  const storyCount = list.reduce((n, p) => n + p.stories.length, 0);

  return (
    <>
      <PageHeader
        title="Work History"
        description={`${list.length} positions, ${storyCount} stories. Positions are sorted by date, newest first.`}
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add position
            </Button>
          )
        }
      />
      <div className="space-y-6">
        {adding && (
          <Card title="New position">
            <PositionForm organizations={organizations} onDone={() => setAdding(false)} />
          </Card>
        )}
        {list.length === 0 && !adding && (
          <Card>
            <p className="text-sm text-slate-600">
              No positions yet. Add one, or <Link to="/template" className="text-indigo-700 hover:underline">import your resume</Link>.
            </p>
          </Card>
        )}
        {groupByOrg(list).map((group, i) => (
          <section key={i}>
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">{group.organization}</h2>
            <div className="space-y-4">
              {group.positions.map((p) => (
                <PositionCard key={p.id} position={p} positions={list} organizations={organizations} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function groupByOrg(positions: Position[]) {
  const groups: { organization: string; positions: Position[] }[] = [];
  for (const p of positions) {
    const last = groups.at(-1);
    if (last && last.organization === p.organization) last.positions.push(p);
    else groups.push({ organization: p.organization, positions: [p] });
  }
  return groups;
}

// ------------------------------------------------------------------ Position

function PositionCard({ position, positions, organizations }: { position: Position; positions: Position[]; organizations: string[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addingStory, setAddingStory] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deletePosition(position.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] }),
  });

  if (editing) {
    return (
      <Card title="Edit position">
        <PositionForm position={position} organizations={organizations} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  const confirmDelete = () => {
    const stories = position.stories.length;
    const message = `Delete "${position.title}"${stories ? ` and its ${stories} stor${stories === 1 ? 'y' : 'ies'}` : ''}? This can't be undone.`;
    if (window.confirm(message)) remove.mutate();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{position.title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {[position.organization, position.location, displayRange(position.start, position.end)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-1">
          <LinkButton onClick={() => setEditing(true)}>Edit</LinkButton>
          <LinkButton danger onClick={confirmDelete} disabled={remove.isPending}>Delete</LinkButton>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">
        {position.description ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{position.description}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">No description.</p>
        )}
        {remove.error && <ErrorText>{remove.error.message}</ErrorText>}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Stories ({position.stories.length})</h4>
            {!addingStory && <LinkButton onClick={() => setAddingStory(true)}>+ Add story</LinkButton>}
          </div>
          <div className="space-y-3">
            {position.stories.map((s, i) => (
              <StoryCard key={s.id} story={s} index={i} position={position} positions={positions} />
            ))}
            {position.stories.length === 0 && !addingStory && (
              <p className="text-sm text-slate-400 italic">No stories yet.</p>
            )}
            {addingStory && <NewStory positionId={position.id} onDone={() => setAddingStory(false)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyPosition: PositionInput = { organization: '', title: '', location: null, description: null, start: null, end: null };

/** Month inputs need YYYY-MM; a year-only date is shown as January of that year. */
const toMonthInput = (v: string | null) => (v ? (v.length === 4 ? `${v}-01` : v) : '');

function PositionForm({ position, organizations, onDone }: { position?: Position; organizations: string[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PositionInput>(position ? { ...position } : emptyPosition);
  const [current, setCurrent] = useState(position ? position.end === null : false);
  const save = useMutation({
    mutationFn: (input: PositionInput) => (position ? api.updatePosition(position.id, input) : api.createPosition(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      onDone();
    },
  });
  const set = (patch: Partial<PositionInput>) => setForm({ ...form, ...patch });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ ...form, end: current ? null : form.end });
      }}
    >
      <Field label="Job title">
        <input className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} required autoFocus />
      </Field>
      <Field label="Organization">
        <input
          className={inputClass}
          value={form.organization}
          onChange={(e) => set({ organization: e.target.value })}
          list="organizations"
          required
        />
        <datalist id="organizations">
          {organizations.map((o) => <option key={o} value={o} />)}
        </datalist>
      </Field>
      <Field label="Location" hint="Optional, e.g. Seattle, WA">
        <input className={inputClass} value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:max-w-md">
        <Field label="Start">
          <input
            type="month"
            className={inputClass}
            value={toMonthInput(form.start)}
            onChange={(e) => set({ start: e.target.value || null })}
          />
        </Field>
        <Field label="End">
          <input
            type="month"
            className={inputClass}
            value={current ? '' : toMonthInput(form.end)}
            disabled={current}
            onChange={(e) => set({ end: e.target.value || null })}
          />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
          I currently work here
        </label>
      </div>
      <div className="sm:col-span-2">
        <Field label="Description" hint="A short narrative of the role. It prints under the position line.">
          <AutoTextarea value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button variant="primary" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : position ? 'Save' : 'Add position'}
        </Button>
        <Button type="button" onClick={onDone}>Cancel</Button>
      </div>
      {save.error && <div className="sm:col-span-2"><ErrorText>{save.error.message}</ErrorText></div>}
    </form>
  );
}

// --------------------------------------------------------------------- Story

function NewStory({ positionId, onDone }: { positionId: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const create = useMutation({
    mutationFn: () => api.createStory(positionId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      onDone();
    },
  });
  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
      <AutoTextarea
        autoFocus
        minRows={4}
        value={text}
        placeholder="What happened, what you did, and what changed because of it. Include numbers where you have them."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && create.mutate()}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" onClick={() => create.mutate()} disabled={!text.trim() || create.isPending}>
          Add story
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        <span className="text-xs text-slate-400">Ctrl+Enter to save</span>
      </div>
      {create.error && <div className="mt-2"><ErrorText>{create.error.message}</ErrorText></div>}
    </div>
  );
}

function StoryCard({ story, index, position, positions }: { story: Story; index: number; position: Position; positions: Position[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(story.text);
  const [lessonsDraft, setLessonsDraft] = useState(story.lessons ?? '');
  const [showHistory, setShowHistory] = useState(false);
  const [refining, setRefining] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['positions'] });

  const save = useMutation({
    mutationFn: () => api.updateStory(story.id, { text: draft, lessons: lessonsDraft }),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['versions', story.id] });
      setEditing(false);
    },
  });
  const remove = useMutation({ mutationFn: () => api.deleteStory(story.id), onSuccess: refresh });
  const move = useMutation({
    mutationFn: (direction: -1 | 1) => {
      const ids = position.stories.map((s) => s.id);
      [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
      return api.reorderStories(position.id, ids);
    },
    onSuccess: refresh,
  });
  const moveTo = useMutation({ mutationFn: (positionId: number) => api.updateStory(story.id, { positionId }), onSuccess: refresh });
  const error = save.error ?? remove.error ?? move.error ?? moveTo.error;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
      {editing ? (
        <>
          <AutoTextarea
            autoFocus
            minRows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) save.mutate();
              if (e.key === 'Escape') {
                setDraft(story.text);
                setEditing(false);
              }
            }}
          />
          <label className="mt-2 block text-xs font-medium text-slate-500">
            Lessons learned <span className="font-normal text-slate-400">· for interviews, never printed</span>
            <AutoTextarea
              minRows={2}
              className="mt-1"
              value={lessonsDraft}
              placeholder="Optional"
              onChange={(e) => setLessonsDraft(e.target.value)}
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={() => save.mutate()} disabled={!draft.trim() || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              onClick={() => {
                setDraft(story.text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-slate-400">Ctrl+Enter to save · Esc to cancel. Your previous text is kept in History.</span>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">{story.text}</p>
          {story.lessons && (
            <p className="mt-2 border-l-2 border-amber-300 pl-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
              <span className="font-semibold text-slate-500">Lessons learned (not printed): </span>
              {story.lessons}
            </p>
          )}
        </>
      )}

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          {story.status === 'refined' ? (
            <Badge tone="green">Refined</Badge>
          ) : story.versionCount > 1 ? (
            <Badge tone="indigo">Edited</Badge>
          ) : (
            <Badge>Original</Badge>
          )}
          <LinkButton onClick={() => setShowHistory(!showHistory)}>
            History ({story.versionCount})
          </LinkButton>
          <span className="flex-1" />
          <LinkButton
            onClick={() => setRefining(true)}
            className="text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
            title="Chat with the agent to tighten this story and add metrics, impact, results and lessons learned"
          >
            {story.openSessionId ? '● Continue refining' : 'Refine with AI'}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setDraft(story.text);
              setLessonsDraft(story.lessons ?? '');
              setEditing(true);
            }}
          >
            Edit
          </LinkButton>
          <LinkButton onClick={() => move.mutate(-1)} disabled={index === 0 || move.isPending} aria-label="Move up">↑</LinkButton>
          <LinkButton
            onClick={() => move.mutate(1)}
            disabled={index === position.stories.length - 1 || move.isPending}
            aria-label="Move down"
          >
            ↓
          </LinkButton>
          {positions.length > 1 && (
            <select
              className="max-w-24 rounded border-0 bg-transparent py-0.5 text-xs text-slate-600 hover:bg-slate-100"
              value=""
              onChange={(e) => e.target.value && moveTo.mutate(Number(e.target.value))}
              aria-label="Move to another position"
            >
              <option value="">Move to…</option>
              {positions
                .filter((p) => p.id !== position.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.title} ({p.organization})</option>
                ))}
            </select>
          )}
          <LinkButton danger onClick={() => window.confirm('Delete this story and its history?') && remove.mutate()}>
            Delete
          </LinkButton>
        </div>
      )}
      {showHistory && !editing && <VersionHistory story={story} />}
      {error && <div className="mt-2"><ErrorText>{error.message}</ErrorText></div>}
      {refining && <RefinePanel story={story} position={position} onClose={() => setRefining(false)} />}
    </div>
  );
}

const SOURCE_LABELS = { user: 'You', import: 'Imported', agent: 'AI refinement' } as const;

function VersionHistory({ story }: { story: Story }) {
  const queryClient = useQueryClient();
  const versions = useQuery({ queryKey: ['versions', story.id, story.versionCount], queryFn: () => api.storyVersions(story.id) });
  const restore = useMutation({
    mutationFn: (versionId: number) => api.restoreVersion(story.id, versionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] }),
  });

  if (versions.error) return <ErrorText>{versions.error.message}</ErrorText>;
  if (!versions.data) return <p className="mt-2 text-xs text-slate-500">Loading history…</p>;

  return (
    <ol className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      {versions.data.map((v, i) => (
        <li key={v.id} className="rounded bg-white p-2 text-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{formatTime(v.createdAt)}</span>
            <span>· {SOURCE_LABELS[v.source]}</span>
            {i === 0 ? (
              <Badge tone="green">Current</Badge>
            ) : (
              v.text !== story.text && (
                <LinkButton onClick={() => restore.mutate(v.id)} disabled={restore.isPending}>
                  Restore this version
                </LinkButton>
              )
            )}
          </div>
          <p className="leading-relaxed whitespace-pre-wrap text-slate-700">{v.text}</p>
        </li>
      ))}
      {restore.error && <ErrorText>{restore.error.message}</ErrorText>}
    </ol>
  );
}
