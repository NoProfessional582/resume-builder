CREATE TABLE interview_plan (
 application_id INTEGER PRIMARY KEY REFERENCES application(id) ON DELETE CASCADE,
 input_snapshot TEXT NOT NULL,
 data TEXT,
 data_snapshot TEXT,
 run_id INTEGER REFERENCES agent_runs(id),
 error TEXT,
 updated_at INTEGER NOT NULL
);
CREATE TABLE preparation_source_update (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 preparation_id INTEGER NOT NULL REFERENCES preparation(id) ON DELETE CASCADE,
 story_version_id INTEGER REFERENCES story_version(id) ON DELETE SET NULL,
 before_snapshot TEXT NOT NULL,
 after_snapshot TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
