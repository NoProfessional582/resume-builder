import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useRunStream } from '../hooks/useRunStream';
import { describeEvent } from '../lib/format';
import {
  COVERAGE_KEYS,
  type Coverage,
  type CoverageLevel,
  type Position,
  type RefineMessage,
  type RefineSession,
  type Story,
} from '../profileTypes';
import { AutoTextarea, Button, ErrorText, LinkButton } from './ui';

const COVERAGE_LABELS: Record<(typeof COVERAGE_KEYS)[number], string> = {
  context: 'Context',
  action: 'Action',
  metrics: 'Metrics',
  impact: 'Impact',
  results: 'Results',
  lessons: 'Lessons learned',
};

/**
 * Side panel for refining one story with the agent: it cleans up the draft, asks about
 * metrics, impact, results and lessons learned, and folds the answers back in.
 */
export function RefinePanel({ story, position, onClose, gap, focus }: { story: Story; position: Position; onClose: () => void; gap?: { versionId: number; gapIndex: number; reviewedAt: number }; focus?: string }) {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<number | null>(gap ? null : story.openSessionId);

  // Open a new session, or resume the one already open for this story.
  const start = useMutation({
    mutationFn: () => api.startRefine(story.id, gap ?? (focus?.trim() ? { focus: focus.trim() } : undefined)),
    onSuccess: (s) => {
      queryClient.setQueryData(['refine', s.id], s);
      setSessionId(s.id);
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
  useEffect(() => {
    if (sessionId == null && start.isIdle) start.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const session = useQuery({
    queryKey: ['refine', sessionId],
    queryFn: () => api.getRefine(sessionId!),
    enabled: sessionId != null,
    // A fallback; the live stream below refreshes as soon as a turn finishes.
    refetchInterval: (q) => (q.state.data?.runId ? 4000 : false),
  });

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Refine story">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Refine story</h2>
            <p className="truncate text-sm text-slate-500">
              {position.title} · {position.organization}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </header>
        {start.error && <div className="p-6"><ErrorText>{start.error.message}</ErrorText></div>}
        {session.error && <div className="p-6"><ErrorText>{session.error.message}</ErrorText></div>}
        {session.data ? (
          <SessionBody session={session.data} onClose={onClose} />
        ) : (
          !start.error && <p className="p-6 text-sm text-slate-500">Starting…</p>
        )}
      </div>
    </div>
  );
}

function SessionBody({ session, onClose }: { session: RefineSession; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(session.currentDraft);
  const [lessons, setLessons] = useState(session.currentLessons ?? '');
  const [answer, setAnswer] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // When the agent delivers a new draft, show it.
  useEffect(() => {
    setDraft(session.currentDraft);
  }, [session.currentDraft]);
  useEffect(() => {
    setLessons(session.currentLessons ?? '');
  }, [session.currentLessons]);
  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and React
  // would treat a returned value as the effect's cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages.length, session.runId]);

  const update = (s: RefineSession) => queryClient.setQueryData(['refine', s.id], s);
  const refreshStories = () => queryClient.invalidateQueries({ queryKey: ['positions'] });

  // Live progress for the turn in progress; refresh the session when it ends.
  const stream = useRunStream(session.runId);
  useEffect(() => {
    if (stream.run && ['succeeded', 'failed', 'cancelled'].includes(stream.run.status)) {
      queryClient.invalidateQueries({ queryKey: ['refine', session.id] });
    }
  }, [stream.run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => api.sendRefine(session.id, answer, draft, lessons),
    onSuccess: (s) => {
      update(s);
      setAnswer('');
    },
  });
  const retry = useMutation({ mutationFn: () => api.retryRefine(session.id), onSuccess: update });
  const accept = useMutation({
    mutationFn: () => api.acceptRefine(session.id, draft, lessons),
    onSuccess: () => {
      refreshStories();
      queryClient.invalidateQueries({ queryKey: ['versions'] });
      onClose();
    },
  });
  const discard = useMutation({
    mutationFn: () => api.discardRefine(session.id),
    onSuccess: () => {
      refreshStories();
      onClose();
    },
  });

  const busy = session.runId != null;
  const lastAgent = [...session.messages].reverse().find((m) => m.role === 'agent');
  const draftEdited = draft !== session.currentDraft || lessons !== (session.currentLessons ?? '');
  const error = send.error ?? retry.error ?? accept.error ?? discard.error;
  const canSend = !busy && answer.trim() && !send.isPending;

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {session.focus && <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3 text-sm whitespace-pre-wrap text-indigo-900">{session.focus}</div>}
        {lastAgent?.coverage && <CoverageChips coverage={lastAgent.coverage} />}

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Draft {draftEdited && <span className="ml-1 font-normal normal-case text-indigo-700">(your edits)</span>}
            </h3>
            <div className="flex gap-1">
              {draftEdited && (
                <LinkButton
                  onClick={() => {
                    setDraft(session.currentDraft);
                    setLessons(session.currentLessons ?? '');
                  }}
                >
                  Undo my edits
                </LinkButton>
              )}
              <LinkButton onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? 'Hide' : 'Show'} original</LinkButton>
            </div>
          </div>
          <AutoTextarea minRows={4} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
          {showOriginal && (
            <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-600">
              <div className="mb-1 text-xs font-semibold text-slate-500">Original</div>
              {session.originalText}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Lessons learned <span className="font-normal normal-case text-slate-400">· for interviews, never printed</span>
          </h3>
          <AutoTextarea
            minRows={2}
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            disabled={busy}
            placeholder="None yet. The agent will ask, or write your own."
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Conversation</h3>
          {session.messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          {busy && (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
                Working on the draft… (usually 10–30 seconds)
              </div>
              {stream.events.length > 0 && (
                <div className="mt-1 text-xs text-slate-400">{describeEvent(stream.events.at(-1)!.event)}</div>
              )}
            </div>
          )}
          {session.error && !busy && (
            <div className="space-y-2">
              <ErrorText>{session.error}</ErrorText>
              <Button onClick={() => retry.mutate()} disabled={retry.isPending}>Try again</Button>
            </div>
          )}
          <div ref={bottom} />
        </section>
      </div>

      <footer className="space-y-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
        {lastAgent?.done && !busy && (
          <p className="text-xs text-emerald-700">
            Nothing important left to ask. Accept the draft, or add more detail below.
          </p>
        )}
        <AutoTextarea
          minRows={2}
          value={answer}
          disabled={busy}
          placeholder={
            lastAgent?.questions.length
              ? 'Answer any of the questions. Estimates are fine; say "skip" for ones you can\'t answer.'
              : 'Add more detail or ask for a change…'
          }
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend && send.mutate()}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => send.mutate()} disabled={!canSend}>
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
          <span className="text-xs text-slate-400">Ctrl+Enter</span>
          <span className="flex-1" />
          <LinkButton danger onClick={() => window.confirm('Discard this refinement? The story stays as it was.') && discard.mutate()}>
            Discard
          </LinkButton>
          <Button variant="primary" onClick={() => accept.mutate()} disabled={busy || !draft.trim() || accept.isPending}>
            {accept.isPending ? 'Saving…' : 'Accept draft'}
          </Button>
        </div>
        {error && <ErrorText>{error.message}</ErrorText>}
        <p className="text-xs text-slate-400">
          Accepting saves the draft as a new version; the current text stays in History. Closing keeps this conversation for later.
        </p>
      </footer>
    </>
  );
}

const LEVEL_STYLES: Record<CoverageLevel, { cls: string; mark: string; label: string }> = {
  present: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', mark: '✓', label: 'covered' },
  partial: { cls: 'bg-amber-50 text-amber-800 ring-amber-200', mark: '~', label: 'partly covered' },
  missing: { cls: 'bg-slate-50 text-slate-500 ring-slate-200', mark: '–', label: 'missing' },
};

function CoverageChips({ coverage }: { coverage: Coverage }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="What the draft covers">
      {COVERAGE_KEYS.map((k) => {
        const s = LEVEL_STYLES[coverage[k]];
        return (
          <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${s.cls}`} title={`${COVERAGE_LABELS[k]}: ${s.label}`}>
            {s.mark} {COVERAGE_LABELS[k]}
          </span>
        );
      })}
    </div>
  );
}

function MessageBubble({ message: m }: { message: RefineMessage }) {
  if (m.role === 'user') {
    return (
      <div className="ml-10 rounded-lg bg-indigo-600 px-4 py-3 text-sm whitespace-pre-wrap text-white">
        {m.content}
        {m.draft && <div className="mt-1 text-xs text-indigo-200">Also edited the draft.</div>}
      </div>
    );
  }
  return (
    <div className="mr-10 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
      <p className="text-slate-700">{m.content}</p>
      {m.questions.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-900">
          {m.questions.map((q, i) => <li key={i}>{q}</li>)}
        </ol>
      )}
    </div>
  );
}
