CREATE TABLE application_event (
 id INTEGER PRIMARY KEY,
 application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('screening','interview','assessment','deadline','follow_up','response')),
 date_only INTEGER NOT NULL CHECK(date_only IN (0,1)),
 start TEXT NOT NULL,
 end TEXT,
 timezone TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL CHECK(state IN ('scheduled','completed','cancelled')),
 updated_at INTEGER NOT NULL
);
CREATE INDEX application_event_application ON application_event(application_id);
CREATE TABLE event_participant (
 event_id INTEGER NOT NULL REFERENCES application_event(id) ON DELETE CASCADE,
 contact_id INTEGER NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,contact_id)
);
CREATE TABLE event_history (
 id INTEGER PRIMARY KEY,
 event_id INTEGER NOT NULL REFERENCES application_event(id) ON DELETE CASCADE,
 recorded_at INTEGER NOT NULL,
 summary TEXT NOT NULL
);
