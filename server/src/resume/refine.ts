import { getRun, isFinal, runner } from '../agent/runner.ts';
import { refineStoryTask, type RefineStoryInput, type RefineStoryOutput } from '../agent/tasks/refineStory.ts';
import { db, transaction } from '../db.ts';
import { DEFAULT_DATE_FORMAT, formatDateRange } from './dates.ts';
import { NotFoundError, updateStoryLessons, updateStoryText } from './positions.ts';

export class ConflictError extends Error {
  statusCode = 409;
}

type SessionStatus = 'open' | 'accepted' | 'discarded';

interface SessionRow {
  id: number;
  story_id: number;
  status: SessionStatus;
  original_text: string;
  qualification_context: string | null;
  original_lessons: string | null;
  current_run_id: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: number;
  session_id: number;
  role: 'agent' | 'user';
  content: string;
  draft: string | null;
  lessons: string | null;
  questions: string | null;
  coverage: string | null;
  done: number | null;
  run_id: number | null;
  created_at: number;
}

export interface RefineMessage {
  id: number;
  role: 'agent' | 'user';
  content: string;
  draft: string | null;
  lessons: string | null;
  questions: string[];
  coverage: RefineStoryOutput['coverage'] | null;
  done: boolean;
  createdAt: number;
}

export interface RefineSessionView {
  id: number;
  storyId: number;
  status: SessionStatus;
  originalText: string;
  /** The latest draft (the agent's, or the user's own edit). */
  currentDraft: string;
  /** The latest lessons learned (kept apart from the story; never printed). */
  currentLessons: string | null;
  messages: RefineMessage[];
  /** Agent turn in progress, if any. */
  runId: number | null;
  error: string | null;
  createdAt: number;
}

function getSessionRow(id: number): SessionRow {
  const row = db.prepare('SELECT * FROM refine_session WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) throw new NotFoundError('Refinement not found');
  return row;
}

const messagesOf = (sessionId: number) =>
  db.prepare('SELECT * FROM refine_message WHERE session_id = ? ORDER BY id').all(sessionId) as unknown as MessageRow[];

function toMessage(m: MessageRow): RefineMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    draft: m.draft,
    lessons: m.lessons,
    questions: m.questions ? JSON.parse(m.questions) : [],
    coverage: m.coverage ? JSON.parse(m.coverage) : null,
    done: !!m.done,
    createdAt: m.created_at,
  };
}

function currentDraft(session: SessionRow, messages: MessageRow[]): string {
  return [...messages].reverse().find((m) => m.draft)?.draft ?? session.original_text;
}

/** Agent turns always record lessons ('' = none); user messages only when they edited them. */
function currentLessons(session: SessionRow, messages: MessageRow[]): string | null {
  const latest = [...messages].reverse().find((m) => m.lessons !== null);
  return latest ? latest.lessons || null : session.original_lessons;
}

/** Records the result of a finished agent turn (once). */
function settle(session: SessionRow): SessionRow {
  if (session.current_run_id == null) return session;
  const run = getRun(session.current_run_id);
  if (!run || !isFinal(run.status)) return session;

  transaction(() => {
    if (run.status === 'succeeded') {
      const out = run.output as RefineStoryOutput;
      const exists = db.prepare('SELECT 1 FROM refine_message WHERE run_id = ?').get(run.id);
      if (!exists) {
        db.prepare(
          `INSERT INTO refine_message (session_id, role, content, draft, lessons, questions, coverage, done, run_id, created_at)
           VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          session.id,
          out.note,
          out.draft,
          out.lessons?.trim() ?? '',
          JSON.stringify(out.done ? [] : out.questions.slice(0, 3)),
          JSON.stringify(out.coverage),
          out.done ? 1 : 0,
          run.id,
          Date.now(),
        );
      }
      db.prepare('UPDATE refine_session SET current_run_id = NULL, error = NULL, updated_at = ? WHERE id = ?').run(
        Date.now(),
        session.id,
      );
    } else {
      db.prepare('UPDATE refine_session SET current_run_id = NULL, error = ?, updated_at = ? WHERE id = ?').run(
        run.error ?? `The agent turn ${run.status}.`,
        Date.now(),
        session.id,
      );
    }
  });
  return getSessionRow(session.id);
}

export function getSession(id: number): RefineSessionView {
  const session = settle(getSessionRow(id));
  const messages = messagesOf(id);
  return {
    id: session.id,
    storyId: session.story_id,
    status: session.status,
    originalText: session.original_text,
    currentDraft: currentDraft(session, messages),
    currentLessons: currentLessons(session, messages),
    messages: messages.map(toMessage),
    runId: session.current_run_id,
    error: session.error,
    createdAt: session.created_at,
  };
}

/** Builds the agent input from the story, its position and the conversation so far. */
function buildInput(session: SessionRow): RefineStoryInput {
  const story = db.prepare('SELECT * FROM story WHERE id = ?').get(session.story_id) as
    | { id: number; position_id: number }
    | undefined;
  if (!story) throw new NotFoundError('Story not found');
  const p = db.prepare('SELECT * FROM position WHERE id = ?').get(story.position_id) as {
    title: string;
    organization: string;
    location: string | null;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  const others = db
    .prepare('SELECT current_text FROM story WHERE position_id = ? AND id != ? ORDER BY sort_order, id')
    .all(story.position_id, story.id) as { current_text: string }[];
  const messages = messagesOf(session.id);
  const lastWithEdits = [...messages].reverse().find((m) => m.draft || m.lessons !== null);

  return {
    qualificationContext: session.qualification_context ?? undefined,
    position: {
      title: p.title,
      organization: p.organization,
      location: p.location,
      dates: formatDateRange(p.start_date, p.end_date, DEFAULT_DATE_FORMAT),
      description: p.description,
    },
    otherStories: others.map((o) => o.current_text),
    originalText: session.original_text,
    currentDraft: currentDraft(session, messages),
    currentLessons: currentLessons(session, messages),
    editedByUser: lastWithEdits?.role === 'user',
    transcript: messages.map((m) => ({
      role: m.role,
      text:
        m.role === 'agent'
          ? [m.content, ...(m.questions ? (JSON.parse(m.questions) as string[]).map((q) => `- ${q}`) : [])].join('\n')
          : m.content,
    })),
  };
}

function startTurn(session: SessionRow): void {
  const runId = runner.enqueue(refineStoryTask, buildInput(session));
  db.prepare('UPDATE refine_session SET current_run_id = ?, error = NULL, updated_at = ? WHERE id = ?').run(
    runId,
    Date.now(),
    session.id,
  );
  void runner.waitFor(runId).then(() => settle(getSessionRow(session.id)));
}

/** Opens a refinement for a story, or returns the one already open. */
export function startOrResume(storyId: number, context?: string): RefineSessionView {
  const story = db.prepare('SELECT current_text, lessons FROM story WHERE id = ?').get(storyId) as
    | { current_text: string; lessons: string | null }
    | undefined;
  if (!story) throw new NotFoundError('Story not found');

  const open = db
    .prepare(`SELECT id FROM refine_session WHERE story_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`)
    .get(storyId) as { id: number } | undefined;
  if (open) {
    if (context && getSessionRow(open.id).qualification_context !== context)
      throw new ConflictError('Finish the existing story conversation in Work history first.');
    return getSession(open.id);
  }

  const now = Date.now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO refine_session (story_id, status, original_text, original_lessons, created_at, updated_at)
       VALUES (?, 'open', ?, ?, ?, ?)`,
    )
    .run(storyId, story.current_text, story.lessons, now, now);
  const id = Number(lastInsertRowid);
  if (context) db.prepare('UPDATE refine_session SET qualification_context = ? WHERE id = ?').run(context, id);
  startTurn(getSessionRow(id));
  return getSession(id);
}

function requireIdle(id: number): SessionRow {
  const session = settle(getSessionRow(id));
  if (session.status !== 'open') throw new ConflictError('This refinement is already finished.');
  if (session.current_run_id != null) throw new ConflictError('Wait for the agent to finish its turn.');
  return session;
}

/** Sends the user's answer (plus their edited draft/lessons, if changed) and starts the next turn. */
export function sendMessage(id: number, content: string, draft: string | null, lessons: string | null): RefineSessionView {
  const session = requireIdle(id);
  const messages = messagesOf(id);
  const editedDraft = draft != null && draft.trim() && draft !== currentDraft(session, messages) ? draft : null;
  const editedLessons =
    lessons != null && lessons.trim() !== (currentLessons(session, messages) ?? '') ? lessons.trim() : null;
  db.prepare(
    `INSERT INTO refine_message (session_id, role, content, draft, lessons, created_at) VALUES (?, 'user', ?, ?, ?, ?)`,
  ).run(id, content, editedDraft, editedLessons, Date.now());
  startTurn(session);
  return getSession(id);
}

/** Runs the agent turn again after a failure. */
export function retryTurn(id: number): RefineSessionView {
  const session = requireIdle(id);
  if (!session.error) throw new ConflictError('There is nothing to retry.');
  startTurn(session);
  return getSession(id);
}

/** Saves the draft as the story's new text (recorded as an AI refinement) and closes the session. */
export function acceptDraft(id: number, draft: string, lessons: string | null): RefineSessionView {
  const session = requireIdle(id);
  transaction(() => {
    updateStoryText(session.story_id, draft, 'agent');
    updateStoryLessons(session.story_id, lessons);
    db.prepare(`UPDATE story SET status = 'refined' WHERE id = ?`).run(session.story_id);
    db.prepare(`UPDATE refine_session SET status = 'accepted', updated_at = ? WHERE id = ?`).run(Date.now(), id);
  });
  return getSession(id);
}

export function discardSession(id: number): RefineSessionView {
  const session = settle(getSessionRow(id));
  if (session.status !== 'open') throw new ConflictError('This refinement is already finished.');
  if (session.current_run_id != null) runner.cancel(session.current_run_id);
  db.prepare(`UPDATE refine_session SET status = 'discarded', current_run_id = NULL, updated_at = ? WHERE id = ?`).run(
    Date.now(),
    id,
  );
  return getSession(id);
}
