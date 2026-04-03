-- Seed the bootstrap admin profile that matches the Supabase Auth user.
-- This keeps current_user_is_admin() and event CRUD RLS aligned with the frontend fallback account.

select setval(pg_get_serial_sequence('public.users', 'id_user'), coalesce((select max(id_user) from public.users), 0) + 1, false);

select setval(pg_get_serial_sequence('public.events', 'id_event'), coalesce((select max(id_event) from public.events), 0) + 1, false);

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
  '08dd95b4-2c25-47ef-a872-d50347a4f099',
  'culturobg@gmail.com',
  'CULTURO BG',
  3,
  'supabase_auth_managed_placeholder',
  0,
  null,
  23,
  null,
  null
)
on conflict (auth_user_id) do update set
  email = excluded.email,
  name_user = excluded.name_user,
  id_category = excluded.id_category,
  id_region = excluded.id_region;