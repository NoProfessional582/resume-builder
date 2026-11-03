-- Lessons learned are kept apart from the story text: used for interview prep, never printed.
ALTER TABLE story ADD COLUMN lessons TEXT;
ALTER TABLE refine_session ADD COLUMN original_lessons TEXT;
ALTER TABLE refine_message ADD COLUMN lessons TEXT; -- agent: lessons after this turn; user: their edit
