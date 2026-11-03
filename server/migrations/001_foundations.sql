CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

CREATE TABLE agent_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input         TEXT,          -- JSON
  prompt        TEXT,
  output        TEXT,          -- JSON, validated result
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  model         TEXT,
  codex_version TEXT,
  thread_id     TEXT,
  usage         TEXT,          -- JSON token usage from turn.completed
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER,
  duration_ms   INTEGER
);

CREATE INDEX agent_runs_created ON agent_runs (created_at DESC);
