-- Underthink schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

-- 1. Profiles: one row per auth user, holds the display name shown next to messages.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when someone signs up, using the part before @ as a default name.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Channels
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.channels (name) values
  ('general'),
  ('movies')
on conflict (name) do nothing;

-- 3. Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_id_created_at_idx
  on public.messages (channel_id, created_at);

-- 4. Row Level Security
-- This app is for a small trusted group of friends: any logged-in user can
-- read everything and post messages/profiles as themselves.

alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

create policy "profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "channels are viewable by authenticated users"
  on public.channels for select
  to authenticated
  using (true);

create policy "users can create channels"
  on public.channels for insert
  to authenticated
  with check (true);

create policy "users can rename channels"
  on public.channels for update
  to authenticated
  using (true)
  with check (true);

create policy "messages are viewable by authenticated users"
  on public.messages for select
  to authenticated
  using (true);

create policy "users can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can delete their own messages"
  on public.messages for delete
  to authenticated
  using (user_id = auth.uid());

-- 5. Realtime: broadcast inserts/deletes on messages so the UI updates live.
-- Full replica identity is needed so DELETE events carry channel_id, not just
-- the primary key, since our realtime subscription filters on channel_id.
alter table public.messages replica identity full;
alter publication supabase_realtime add table public.messages;

-- 6. Base table grants. RLS policies above only restrict *which rows* a role
-- can touch; the role still needs the underlying privilege on the table itself.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.channels to authenticated;
grant select, insert, delete on public.messages to authenticated;
