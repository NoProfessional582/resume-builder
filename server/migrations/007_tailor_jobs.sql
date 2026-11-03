-- Versions made by revising or fitting another version, and progress for multi-step jobs.
ALTER TABLE tailored_resume ADD COLUMN parent_id INTEGER REFERENCES tailored_resume (id) ON DELETE SET NULL;
ALTER TABLE tailored_resume ADD COLUMN label TEXT;            -- e.g. "Fitted to 1 page"
ALTER TABLE tailored_resume ADD COLUMN job_kind TEXT NOT NULL DEFAULT 'tailor'; -- tailor | revise | fit
ALTER TABLE tailored_resume ADD COLUMN job_instruction TEXT;  -- revise: the user's request
ALTER TABLE tailored_resume ADD COLUMN progress TEXT;         -- what the job is doing now
ALTER TABLE tailored_resume ADD COLUMN fit_note TEXT;         -- result of fitting to the page target
