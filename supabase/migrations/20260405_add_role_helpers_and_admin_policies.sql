-- Add role helper functions and align RLS with the project schema.

create or replace function public.word_count(input_text text)
returns integer
language sql
immutable
as $$
  select case
    when input_text is null or btrim(input_text) = '' then 0
    else cardinality(regexp_split_to_array(btrim(input_text), '\s+'))
  end;
$$;

create or replace function public.current_user_role_id()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.id_category
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1
    ),
    0
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role_id() = 3;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role_id smallint;
  next_region_id smallint;
  next_name text;
begin
  next_role_id := case when lower(new.email) = 'culturobg@gmail.com' then 3 else 1 end;
  next_region_id := coalesce(nullif(new.raw_user_meta_data->>'id_region', '')::smallint, 0);
  next_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.users (
    auth_user_id,
    email,
    name_user,
    id_category,
    password_hash,
    count_events,
    picture,
    id_region,
    phone_user,
    biogr_user
  ) values (
    new.id,
    new.email,
    next_name,
    next_role_id,
    'supabase_auth_managed_placeholder',
    0,
    null,
    next_region_id,
    null,
    null
  )
  on conflict (auth_user_id) do update set
    email = excluded.email,
    name_user = excluded.name_user,
    id_category = excluded.id_category,
    id_region = excluded.id_region;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

alter table public.regions enable row level security;
alter table public.event_category enable row level security;
alter table public.user_category enable row level security;
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.user_likings enable row level security;

-- Lookup tables.

drop policy if exists "Regions are publicly readable" on public.regions;
create policy "Regions are publicly readable"
on public.regions
for select
using (true);

drop policy if exists "Event categories are publicly readable" on public.event_category;
create policy "Event categories are publicly readable"
on public.event_category
for select
using (true);

drop policy if exists "User categories are publicly readable" on public.user_category;
create policy "User categories are publicly readable"
on public.user_category
for select
using (true);

drop policy if exists "User categories are manageable by admins" on public.user_category;
create policy "User categories are manageable by admins"
on public.user_category
for insert
with check (public.current_user_is_admin());

drop policy if exists "User categories are updatable by admins" on public.user_category;
create policy "User categories are updatable by admins"
on public.user_category
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "User categories are deletable by admins" on public.user_category;
create policy "User categories are deletable by admins"
on public.user_category
for delete
using (public.current_user_is_admin());

-- Profiles.

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users
for select
using (auth.uid() = auth_user_id or public.current_user_is_admin());

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
on public.users
for insert
with check (auth.uid() = auth_user_id or public.current_user_is_admin());

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
using (auth.uid() = auth_user_id or public.current_user_is_admin())
with check (auth.uid() = auth_user_id or public.current_user_is_admin());

drop policy if exists "Users can delete own profile" on public.users;
create policy "Users can delete own profile"
on public.users
for delete
using (auth.uid() = auth_user_id or public.current_user_is_admin());

-- Events.

drop policy if exists "Events are publicly readable" on public.events;
create policy "Events are publicly readable"
on public.events
for select
using (true);

drop policy if exists "Event owners can insert if allowed" on public.events;
create policy "Event owners can insert if allowed"
on public.events
for insert
with check (
  public.current_user_is_admin()
  or
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
      and u.id_category in (2, 3)
  )
);

drop policy if exists "Event owners can update if allowed" on public.events;
create policy "Event owners can update if allowed"
on public.events
for update
using (
  public.current_user_is_admin()
  or
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
      and u.id_category in (2, 3)
  )
)
with check (
  public.current_user_is_admin()
  or
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
      and u.id_category in (2, 3)
  )
);

drop policy if exists "Event owners can delete if allowed" on public.events;
create policy "Event owners can delete if allowed"
on public.events
for delete
using (
  public.current_user_is_admin()
  or
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
      and u.id_category in (2, 3)
  )
);

-- Preference rows.

drop policy if exists "Preference rows are readable by owners" on public.user_likings;
create policy "Preference rows are readable by owners"
on public.user_likings
for select
using (
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "Preference rows are insertable by owners" on public.user_likings;
create policy "Preference rows are insertable by owners"
on public.user_likings
for insert
with check (
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "Preference rows are updatable by owners" on public.user_likings;
create policy "Preference rows are updatable by owners"
on public.user_likings
for update
using (
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "Preference rows are deletable by owners" on public.user_likings;
create policy "Preference rows are deletable by owners"
on public.user_likings
for delete
using (
  exists (
    select 1
    from public.users u
    where u.id_user = id_user
      and u.auth_user_id = auth.uid()
  )
);

grant execute on function public.current_user_role_id() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
