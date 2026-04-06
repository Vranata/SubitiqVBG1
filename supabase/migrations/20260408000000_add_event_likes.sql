-- Track per-user event likes for registered users.

create table if not exists public.event_likes (
  id_user bigint not null references public.users(id_user) on delete cascade,
  id_event bigint not null references public.events(id_event) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (id_user, id_event)
);

create index if not exists idx_event_likes_user on public.event_likes (id_user);
create index if not exists idx_event_likes_event on public.event_likes (id_event);

alter table public.event_likes enable row level security;

drop policy if exists "Event likes are readable by owners" on public.event_likes;
create policy "Event likes are readable by owners"
on public.event_likes
for select
using (
  auth.uid() = (
    select u.auth_user_id
    from public.users u
    where u.id_user = id_user
    limit 1
  )
  or public.current_user_is_admin()
);

drop policy if exists "Event likes are insertable by owners" on public.event_likes;
create policy "Event likes are insertable by owners"
on public.event_likes
for insert
with check (
  auth.uid() = (
    select u.auth_user_id
    from public.users u
    where u.id_user = id_user
    limit 1
  )
  or public.current_user_is_admin()
);

drop policy if exists "Event likes are deletable by owners" on public.event_likes;
create policy "Event likes are deletable by owners"
on public.event_likes
for delete
using (
  auth.uid() = (
    select u.auth_user_id
    from public.users u
    where u.id_user = id_user
    limit 1
  )
  or public.current_user_is_admin()
);

grant select, insert, delete on public.event_likes to authenticated;