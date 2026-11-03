-- A back-and-forth with the agent to strengthen one story.
CREATE TABLE refine_session (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id       INTEGER NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'discarded')),
  original_text  TEXT NOT NULL,                      -- the story text when the session started
  current_run_id INTEGER REFERENCES agent_runs (id), -- the agent turn in progress, if any
  error          TEXT,                               -- why the last turn failed
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX refine_session_story ON refine_session (story_id, status);

CREATE TABLE refine_message (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES refine_session (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('agent', 'user')),
  content    TEXT NOT NULL,   -- agent: note to the user; user: their answer
  draft      TEXT,            -- agent: the draft after this turn; user: the draft if they edited it
  questions  TEXT,            -- agent: JSON array of questions
  coverage   TEXT,            -- agent: JSON coverage check
  done       INTEGER,         -- agent: 1 when nothing important is left to ask
  run_id     INTEGER REFERENCES agent_runs (id),
  created_at INTEGER NOT NULL
);
CREATE INDEX refine_message_session ON refine_message (session_id, id);
