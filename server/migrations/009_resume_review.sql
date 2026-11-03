-- A recruiter / hiring-manager review of one tailored résumé version against its job posting.
-- One per version; scoring again replaces it.
CREATE TABLE resume_review (
  tailored_id         INTEGER PRIMARY KEY REFERENCES tailored_resume (id) ON DELETE CASCADE,
  status              TEXT NOT NULL CHECK (status IN ('reviewing', 'ready', 'failed')),
  run_id              INTEGER REFERENCES agent_runs (id),
  progress            TEXT,
  error               TEXT,
  data                TEXT,               -- JSON: ResumeReview
  posting_source      TEXT,               -- 'live' (downloaded from the link) | 'saved' (the application's copy)
  posting_note        TEXT,               -- why the saved copy was used, if it was
  content_updated_at  INTEGER,            -- the version's content_updated_at when it was reviewed
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
