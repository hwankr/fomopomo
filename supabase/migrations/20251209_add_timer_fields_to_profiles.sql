alter table profiles
add column if not exists timer_type text default 'stopwatch', -- 'timer' or 'stopwatch'
add column if not exists timer_mode text default 'focus', -- 'focus', 'shortBreak', 'longBreak'
add column if not exists timer_duration integer default 0; -- total duration in seconds (e.g. 1500)
