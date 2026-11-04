CREATE TABLE preparation_source_recommendation (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 preparation_id INTEGER NOT NULL REFERENCES preparation(id) ON DELETE CASCADE,
 source_snapshot TEXT NOT NULL,
 evidence_snapshot TEXT NOT NULL,
 run_id INTEGER REFERENCES agent_runs(id),
 data TEXT,
 error TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX source_recommendation_preparation ON preparation_source_recommendation(preparation_id,id);
