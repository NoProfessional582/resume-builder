-- An upload can be resumed safely after navigation or a lost response.
ALTER TABLE tailored_resume ADD COLUMN source_import_id INTEGER REFERENCES resume_import(id);
CREATE UNIQUE INDEX tailored_resume_source_import ON tailored_resume(application_id, source_import_id);
