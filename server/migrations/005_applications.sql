-- A job the user is applying to.
CREATE TABLE application (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  company              TEXT NOT NULL,
  role_title           TEXT NOT NULL,
  job_description      TEXT NOT NULL,
  required_experience  TEXT,
  preferred_experience TEXT,
  notes                TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

-- The agent's analysis of the posting (one per application), plus the user's edits.
CREATE TABLE job_analysis (
  application_id INTEGER PRIMARY KEY REFERENCES application (id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('analyzing', 'ready', 'failed')),
  run_id         INTEGER REFERENCES agent_runs (id),
  error          TEXT,
  data           TEXT,               -- JSON: current analysis (the user's edited version once edited)
  ai_data        TEXT,               -- JSON: the analysis exactly as the agent returned it
  user_edited    INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);
