-- A résumé tailored to one application. Each tailoring run is a new row (a version).
CREATE TABLE tailored_resume (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id     INTEGER NOT NULL REFERENCES application (id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('tailoring', 'ready', 'failed')),
  run_id             INTEGER REFERENCES agent_runs (id),
  error              TEXT,
  settings           TEXT NOT NULL,     -- JSON: TailorSettings
  content            TEXT,              -- JSON: TailoredContent (the user's edited version once edited)
  ai_content         TEXT,              -- JSON: as the agent produced it
  user_edited        INTEGER NOT NULL DEFAULT 0,
  content_updated_at INTEGER,
  docx_path          TEXT,              -- relative to the data dir
  pdf_path           TEXT,
  page_count         INTEGER,
  generated_at       INTEGER,
  created_at         INTEGER NOT NULL
);
CREATE INDEX tailored_resume_application ON tailored_resume (application_id, id);
