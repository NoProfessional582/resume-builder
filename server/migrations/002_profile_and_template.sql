-- An uploaded resume being analyzed and reviewed before it becomes the template.
CREATE TABLE resume_import (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL,
  file_path  TEXT NOT NULL,                 -- relative to the data dir
  blocks     TEXT NOT NULL,                 -- JSON: parsed body blocks
  run_id     INTEGER REFERENCES agent_runs (id),
  analysis   TEXT,                          -- JSON: AI analysis
  overrides  TEXT NOT NULL DEFAULT '{}',    -- JSON: user fixes keyed by block index
  status     TEXT NOT NULL CHECK (status IN ('analyzing', 'ready', 'failed', 'saved')),
  error      TEXT,
  created_at INTEGER NOT NULL
);

-- The output template: the original .docx plus a layout map of which paragraph is which.
CREATE TABLE resume_template (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id  INTEGER REFERENCES resume_import (id),
  filename   TEXT NOT NULL,
  file_path  TEXT NOT NULL,                 -- relative to the data dir
  layout     TEXT NOT NULL,                 -- JSON: TemplateLayout
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE position (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  organization TEXT NOT NULL,
  title        TEXT NOT NULL,
  location     TEXT,
  description  TEXT,
  start_date   TEXT,                        -- 'YYYY-MM' or 'YYYY'
  end_date     TEXT,                        -- NULL = present
  sort_order   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE story (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id  INTEGER NOT NULL REFERENCES position (id) ON DELETE CASCADE,
  current_text TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'refined')),
  sort_order   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX story_position ON story (position_id, sort_order);

CREATE TABLE story_version (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id   INTEGER NOT NULL REFERENCES story (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('user', 'import', 'agent')),
  created_at INTEGER NOT NULL
);
CREATE INDEX story_version_story ON story_version (story_id, created_at);

-- Non-experience resume sections (summary, skills, education, certifications, entries).
CREATE TABLE section (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('summary', 'skills', 'education', 'certifications', 'entries')),
  heading    TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE section_item (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES section (id) ON DELETE CASCADE,
  data       TEXT NOT NULL,                 -- JSON, shape depends on section kind
  sort_order INTEGER NOT NULL
);
CREATE INDEX section_item_section ON section_item (section_id, sort_order);
