ALTER TABLE application ADD COLUMN stage TEXT CHECK(stage IN ('interested','applied','screened','interviewing','offer','closed'));
ALTER TABLE application ADD COLUMN offer_outcome TEXT;
ALTER TABLE application ADD COLUMN closure_reason TEXT;
CREATE TABLE application_stage_history (
 id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 stage TEXT NOT NULL, offer_outcome TEXT, closure_reason TEXT, note TEXT,
 effective_date TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE TABLE application_activity (
 id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('note','inbound','outbound','follow_up')),
 text TEXT NOT NULL, effective_date TEXT NOT NULL, recorded_at INTEGER NOT NULL,
 voided INTEGER NOT NULL DEFAULT 0, replaces_id INTEGER REFERENCES application_activity(id) ON DELETE SET NULL
);
CREATE TABLE contact (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, organization TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', profile_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE application_contact (
 application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 contact_id INTEGER NOT NULL REFERENCES contact(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(application_id, contact_id)
);
CREATE TABLE workspace_preferences (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
CREATE INDEX application_history_dates ON application_stage_history(application_id, effective_date);
CREATE INDEX application_activity_dates ON application_activity(application_id, voided, effective_date);
CREATE INDEX application_contacts_person ON application_contact(contact_id);
