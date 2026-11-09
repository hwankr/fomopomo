-- Archiving retires a finished subject (a passed certification, a past
-- semester course) from new selections without deleting it, so its history
-- keeps the subject instead of becoming unclassified. archived_at is null while
-- the subject is in use and holds the archive time otherwise. Clients archive
-- and restore with a direct owner UPDATE of this column alone, like a rename,
-- under the existing "Owners can rename study subjects" policy (owner-only
-- USING and WITH CHECK). No RPC, policy, trigger or function is added.
--
-- Archiving is not deletion. It never changes the subject id or name, nor the
-- subject_id of tasks, weekly_plans, monthly_plans, pinned_tasks,
-- long_term_tasks (roots and subject groups) or study_sessions, and it leaves
-- record durations, dates and batch IDs alone. record_study_session_batch,
-- classify_study_sessions and delete_study_subject are not modified: they
-- resolve subjects by id and owner only, so timers and offline drafts holding
-- an archived subject still record into it, history can still be classified
-- into it, and it can still be deleted under the existing unassign rules.
-- The unique index on (user_id, lower(btrim(name))) still covers archived
-- subjects, so adding a same-name subject must restore the archived one
-- instead of creating a duplicate, which keeps its history together.
--
-- study_subjects is already in supabase_realtime with REPLICA IDENTITY FULL,
-- so the new column is published without further changes. There is no
-- IF NOT EXISTS: applying this migration twice must fail instead of skipping.
alter table public.study_subjects
  add column archived_at timestamptz;

comment on column public.study_subjects.archived_at is
  'Null while the subject is in use; otherwise when its owner archived it. Archiving only hides the subject from new selections and never changes references or recorded study time.';

-- Table-level SELECT and DELETE for authenticated already cover the new
-- column. INSERT stays limited to (id, user_id, name), so every new subject
-- starts in use; anon keeps no privilege at all.
grant update (archived_at) on table public.study_subjects to authenticated;

-- Refresh the PostgREST column cache as soon as the migration commits.
notify pgrst, 'reload schema';
