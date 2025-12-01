-- Allow users to update their own friendship records (e.g. for nicknames)
create policy "Users can update their own friendships"
on friendships for update
to public
using ( auth.uid() = user_id )
with check ( auth.uid() = user_id );
