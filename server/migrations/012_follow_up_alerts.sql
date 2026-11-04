CREATE TABLE attention_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 timezone TEXT NOT NULL,
 applied INTEGER NOT NULL CHECK(applied BETWEEN 1 AND 365),
 screened INTEGER NOT NULL CHECK(screened BETWEEN 1 AND 365),
 interviewing INTEGER NOT NULL CHECK(interviewing BETWEEN 1 AND 365),
 offer INTEGER NOT NULL CHECK(offer BETWEEN 1 AND 365)
);
CREATE TABLE attention_snooze (
 application_id INTEGER PRIMARY KEY REFERENCES application(id) ON DELETE CASCADE,
 cycle TEXT NOT NULL,
 until_date TEXT NOT NULL
);
CREATE TABLE attention_dismissal (
 application_id INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
 reason_key TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 PRIMARY KEY(application_id,reason_key)
);
