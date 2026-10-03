begin;
set local search_path = extensions, public, pg_catalog;
select no_plan();
create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.segments(seconds integer, ended timestamptz default now() - interval '1 hour')
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('index', 0, 'duration', seconds, 'ended_at', ended));
$$;
create function tests.record(n integer, seconds integer, start_at bigint default 0, clock_id uuid default '61000000-0000-4000-8000-000000000001', mode_name text default 'stopwatch')
returns jsonb language sql set search_path = '' as $$
  select public.record_study_session_batch(
    ('62000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    mode_name, null, null, tests.segments(seconds), null, clock_id, start_at);
$$;
grant execute on all functions in schema tests to authenticated, anon;
insert into auth.users(id,email,created_at,confirmed_at,raw_app_meta_data,raw_user_meta_data)
values ('60000000-0000-4000-8000-000000000001','clock-a@example.invalid',now(),now(),'{}','{}'),
       ('60000000-0000-4000-8000-000000000002','clock-b@example.invalid',now(),now(),'{}','{}');
insert into public.profiles(id,email,role,nickname)
values ('60000000-0000-4000-8000-000000000001','clock-a@example.invalid','user','Clock A'),
       ('60000000-0000-4000-8000-000000000002','clock-b@example.invalid','user','Clock B');

select ok(not has_table_privilege('authenticated','private.study_session_progress','SELECT'), 'clients cannot inspect other session progress');
select ok(not has_table_privilege('authenticated','private.study_session_progress','INSERT'), 'clients cannot forge progress tombstones');
select ok(not has_table_privilege('authenticated','private.study_session_progress','UPDATE'), 'clients cannot reset consumed ranges');
select ok(not has_table_privilege('authenticated','private.study_session_progress','DELETE'), 'clients cannot delete progress tombstones');
select ok(not has_function_privilege('anon','public.record_study_session_batch(uuid,text,text,uuid,jsonb,uuid,uuid,bigint)','EXECUTE'), 'recording requires authenticated role');

set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select is((tests.record(1,60)->>'total_seconds')::int,60,'source first 60 seconds recorded');
select is((tests.record(2,60)->>'total_seconds')::int,0,'another device cannot record the same 60 seconds under a different batch');
select is((tests.record(3,65)->>'total_seconds')::int,5,'stale source preserves five additional seconds, below incoming minimum');
select is((tests.record(3,65)->>'total_seconds')::int,5,'retry returns the original accepted total');
select is(tests.record(3,65)->>'status','already_processed','retry remains batch idempotent after range trimming');
select is((select sum(duration)::bigint from public.study_sessions),65::bigint,'aggregate remains exactly 65');
select is((tests.record(4,30,65)->>'total_seconds')::int,30,'partial save resumes at the original clock offset');
select is((tests.record(5,100)->>'total_seconds')::int,5,'full stale device snapshot overlaps multiple saved ranges');
select is((select sum(duration)::bigint from public.study_sessions),100::bigint,'partial saves and full copies count each second once');
select is((tests.record(6,30,120)->>'total_seconds')::int,30,'offline later range may arrive before earlier range');
select is((tests.record(7,150)->>'total_seconds')::int,20,'out of order recovery fills a hole without losing new time');
select is((select sum(duration)::bigint from public.study_sessions),150::bigint,'range union handles out of order delivery');
select throws_ok($$ select tests.record(7,151) $$,'23505',null,'same batch with changed requested content still conflicts');
select throws_ok($$ select tests.record(8,30,0,'61000000-0000-4000-8000-000000000001','pomo') $$,'22023',null,'clock cannot change recording mode');
select throws_ok($$ select tests.record(8,30,-1) $$,'22023',null,'negative logical progress rejected');
select throws_ok($$ select tests.record(8,30,null) $$,'22023',null,'identity without progress rejected');
select throws_ok($$ select tests.record(8,30,0,null) $$,'22023',null,'progress without identity rejected');
select throws_ok($$ select tests.record(8,9) $$,'22023',null,'incoming duration minimum remains ten seconds');

-- Focus handoffs share one progress axis even though the published remaining
-- phase gets shorter after a task is recorded.
select is((tests.record(10,1200,0,'61000000-0000-4000-8000-000000000002','pomo')->>'total_seconds')::int,1200,'focus task A records twenty minutes');
select is((tests.record(11,300,1200,'61000000-0000-4000-8000-000000000002','pomo')->>'total_seconds')::int,300,'focus B uses the imported offset');
select is((tests.record(12,1500,0,'61000000-0000-4000-8000-000000000002','pomo')->>'total_seconds')::int,0,'original full focus completion cannot re-record A or B');

-- Trimming must preserve the original time of each retained study-day slice.
select is((tests.record(20,45,0,'61000000-0000-4000-8000-000000000003')->>'total_seconds')::int,45,'first piece claimed');
select is((public.record_study_session_batch('62000000-0000-4000-8000-000000000021','stopwatch',null,null,
  jsonb_build_array(
    jsonb_build_object('index',0,'duration',60,'ended_at',now()-interval '3 hours'),
    jsonb_build_object('index',1,'duration',60,'ended_at',now()-interval '1 hour')
  ),null,'61000000-0000-4000-8000-000000000003',0)->>'total_seconds')::int,75,'retains fifteen seconds from first slice and all sixty from second');
select is((select duration::int from public.study_sessions where session_batch_id='62000000-0000-4000-8000-000000000021' and segment_index=0),15,'first retained slice has exact remaining duration');
select is((select created_at from public.study_sessions where session_batch_id='62000000-0000-4000-8000-000000000021' and segment_index=0),now()-interval '3 hours','first slice keeps its day-boundary end');
select is((select created_at from public.study_sessions where session_batch_id='62000000-0000-4000-8000-000000000021' and segment_index=1),now()-interval '1 hour','later slice keeps its own ending');

-- Reset/history deletion does not permit an old device to resurrect old time.
delete from public.study_sessions where session_batch_id='62000000-0000-4000-8000-000000000001';
select is((tests.record(22,60)->>'total_seconds')::int,0,'deleted recorded time stays consumed');
-- Same UUID under another owner is isolated, not a global collision.
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
select is((tests.record(1,60)->>'total_seconds')::int,60,'another user owns a separate progress namespace');
select is((select sum(duration)::bigint from public.study_sessions),60::bigint,'RLS exposes only the second user records');
-- Legacy drafts retain old signature and behavior.
select is((public.record_study_session_batch('62000000-0000-4000-8000-000000000030','pomo',null,null,tests.segments(60))->>'total_seconds')::int,60,'old five-argument outbox accepted');
select is(public.record_study_session_batch('62000000-0000-4000-8000-000000000030','pomo',null,null,tests.segments(60))->>'status','already_processed','old draft retry stays idempotent');
update public.profiles set study_session_id='61000000-0000-4000-8000-000000000001',
  study_session_offset=60, timer_type='stopwatch', timer_mode='focus',
  study_start_time=null, total_stopwatch_time=60, timer_duration=0
where id='60000000-0000-4000-8000-000000000002';
update public.profiles set status='paused' where id='60000000-0000-4000-8000-000000000002';
select is((select study_session_offset from public.profiles where id=auth.uid()),60::bigint,'normal paused presence preserves the shared identity');
update public.profiles set status='online',total_stopwatch_time=0 where id=auth.uid();
select is((select study_session_id from public.profiles where id=auth.uid()),null::uuid,'legacy reset invalidates the old clock identity');
select is((select study_session_offset from public.profiles where id=auth.uid()),0::bigint,'legacy reset clears the offset');
update public.profiles set study_session_id='61000000-0000-4000-8000-000000000001',
  total_stopwatch_time=60 where id=auth.uid();
update public.profiles set timer_type='timer',timer_duration=1500 where id=auth.uid();
select is((select study_session_id from public.profiles where id=auth.uid()),null::uuid,'legacy mode change cannot reuse a stopwatch identity for focus');
reset role;
select * from finish();
rollback;
