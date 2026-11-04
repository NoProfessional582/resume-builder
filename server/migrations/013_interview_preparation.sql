CREATE TABLE preparation (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 story_id INTEGER REFERENCES story(id) ON DELETE SET NULL,
 source_id INTEGER NOT NULL,
 source_snapshot TEXT NOT NULL,
 analysis_snapshot TEXT,
 question TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','accepted','discarded')),
 answer TEXT NOT NULL,
 practice_notes TEXT NOT NULL DEFAULT '',
 run_id INTEGER REFERENCES agent_runs(id),
 error TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX preparation_application ON preparation(application_id);
CREATE TABLE preparation_message (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 preparation_id INTEGER NOT NULL REFERENCES preparation(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','agent')),
 content TEXT NOT NULL,
 answer TEXT,
 run_id INTEGER UNIQUE REFERENCES agent_runs(id),
 created_at INTEGER NOT NULL
);
