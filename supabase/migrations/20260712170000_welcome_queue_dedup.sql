-- Welcome flow: one welcome per person, ever.
--
-- Bug: enqueue-welcome deduped only against rows still in 'pending'. Two sign-up
-- calls landing in the same second (page reload / double submit) both saw an empty
-- pending set and both inserted, so the processor sent the welcome twice. 31 people
-- received 2-4 identical welcome messages.
--
-- The application-level check cannot win that race. A unique index can.

-- 1) Collapse the historical duplicates, keeping the earliest row per person.
DELETE FROM welcome_queue w
USING welcome_queue keep
WHERE w.profile_id IS NOT NULL
  AND keep.profile_id = w.profile_id
  AND (keep.created_at, keep.id) < (w.created_at, w.id);

DELETE FROM welcome_queue w
USING welcome_queue keep
WHERE w.questionnaire_id IS NOT NULL
  AND keep.questionnaire_id = w.questionnaire_id
  AND (keep.created_at, keep.id) < (w.created_at, w.id);

-- 2) Make a second enqueue for the same person impossible at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS welcome_queue_profile_uniq
  ON welcome_queue (profile_id) WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS welcome_queue_questionnaire_uniq
  ON welcome_queue (questionnaire_id) WHERE questionnaire_id IS NOT NULL;
