-- Create friend_requests table
create table if not exists friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users(id) not null,
  receiver_id uuid references auth.users(id) not null,
  sender_email text not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  created_at timestamp with time zone default now(),
  unique(sender_id, receiver_id)
);

-- Enable RLS
alter table friend_requests enable row level security;

-- Policies for friend_requests
-- Drop existing policies if they exist to avoid errors on re-run
drop policy if exists "Users can view requests sent by them or to them" on friend_requests;
create policy "Users can view requests sent by them or to them"
  on friend_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can create requests" on friend_requests;
create policy "Users can create requests"
  on friend_requests for insert
  with check (auth.uid() = sender_id);

drop policy if exists "Users can update requests received by them" on friend_requests;
create policy "Users can update requests received by them"
  on friend_requests for update
  using (auth.uid() = receiver_id);

-- Function to get user ID by email (security definer to access auth.users)
create or replace function get_user_id_by_email(email_input text)
returns uuid
language plpgsql
security definer
as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where email = email_input;
  return target_id;
end;
$$;

-- Grant execute to authenticated users
grant execute on function get_user_id_by_email to authenticated;

-- Ensure friendships has RLS
alter table friendships enable row level security;

-- Policy for friendships (view own)
drop policy if exists "Users can view their own friendships" on friendships;
create policy "Users can view their own friendships"
  on friendships for select
  using (auth.uid() = user_id);

-- Function to accept friend request
create or replace function accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  req record;
begin
  -- Get request
  select * into req from friend_requests where id = request_id;
  
  if req is null then
    raise exception 'Request not found';
  end if;

  if req.receiver_id != auth.uid() then
    raise exception 'Not authorized';
  end if;

  -- Update request status
  update friend_requests set status = 'accepted' where id = request_id;

  -- Insert friendships (bidirectional)
  -- Check if already exists to avoid duplicates
  if not exists (select 1 from friendships where user_id = req.sender_id and friend_id = req.receiver_id) then
    insert into friendships (user_id, friend_id) values (req.sender_id, req.receiver_id);
  end if;
  
  if not exists (select 1 from friendships where user_id = req.receiver_id and friend_id = req.sender_id) then
    insert into friendships (user_id, friend_id) values (req.receiver_id, req.sender_id);
  end if;
end;
$$;

grant execute on function accept_friend_request to authenticated;
