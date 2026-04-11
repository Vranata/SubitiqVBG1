-- Culturo BG schema for Supabase
-- Lower-case table names are used for PostgreSQL conventions.
-- The user preferences list from the plan is normalized into a bridge table (user_likings) to keep 3NF.

-- ============================================================================
-- Helper functions
-- ============================================================================

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

create or replace function public.normalize_event_dedupe_text(input_text text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(input_text, '')), '[[:punct:]]+', ' ', 'g'),
      '\\s+',
      ' ',
      'g'
    )
  );
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

create or replace function public.search_events(
  p_search_text text default null,
  p_region_id smallint default null,
  p_category_id smallint default null,
  p_event_date date default null,
  p_is_free boolean default null
)
returns table (
  id_event bigint,
  name_event text,
  name_artist text,
  place_event text,
  description text,
  picture text,
  start_date date,
  start_hour time,
  end_date date,
  end_hour time,
  id_region smallint,
  id_event_category smallint,
  id_user bigint,
  region text,
  category text,
  is_free boolean,
  price_info text,
  ticket_url text
)
language sql
stable
as $$
  select
    e.id_event,
    e.name_event,
    e.name_artist,
    e.place_event,
    e.description,
    e.picture,
    e.start_date,
    e.start_hour,
    e.end_date,
    e.end_hour,
    e.id_region,
    e.id_event_category,
    e.id_user,
    r.region,
    ec.name_event_category as category,
    e.is_free,
    e.price_info,
    e.ticket_url
  from public.events e
  join public.regions r on r.id_region = e.id_region
  join public.event_category ec on ec.id_event_category = e.id_event_category
  where
    (
      p_search_text is null
      or btrim(p_search_text) = ''
      or e.name_event ilike '%' || p_search_text || '%'
      or e.name_artist ilike '%' || p_search_text || '%'
      or e.place_event ilike '%' || p_search_text || '%'
      or e.description ilike '%' || p_search_text || '%'
    )
    and (p_region_id is null or e.id_region = p_region_id)
    and (p_category_id is null or e.id_event_category = p_category_id)
    and (p_event_date is null or p_event_date between e.start_date and e.end_date)
    and (p_is_free is null or e.is_free = p_is_free)
  order by e.start_date asc, e.start_hour asc, e.id_event asc;
$$;

drop function if exists public.get_event_by_id(bigint);

create or replace function public.get_event_by_id(p_event_id bigint)
returns table (
  id_event bigint,
  name_event text,
  name_artist text,
  place_event text,
  description text,
  picture text,
  start_date date,
  start_hour time,
  end_date date,
  end_hour time,
  id_region smallint,
  id_event_category smallint,
  id_user bigint,
  region text,
  category text,
  is_free boolean,
  price_info text,
  ticket_url text
)
language sql
stable
as $$
  select
    e.id_event,
    e.name_event,
    e.name_artist,
    e.place_event,
    e.description,
    e.picture,
    e.start_date,
    e.start_hour,
    e.end_date,
    e.end_hour,
    e.id_region,
    e.id_event_category,
    e.id_user,
    r.region,
    ec.name_event_category as category,
    e.is_free,
    e.price_info,
    e.ticket_url
  from public.events e
  join public.regions r on r.id_region = e.id_region
  join public.event_category ec on ec.id_event_category = e.id_event_category
  where e.id_event = p_event_id
  limit 1;
$$;

-- ============================================================================
-- Lookup tables
-- ============================================================================

create table if not exists public.regions (
  id_region smallint primary key,
  region text not null unique
);

create table if not exists public.event_category (
  id_event_category smallint primary key,
  name_event_category text not null unique,
  description_event_category text not null,
  constraint event_category_id_range check (id_event_category between 10 and 99),
  constraint event_category_description_words check (public.word_count(description_event_category) <= 15)
);

create table if not exists public.user_category (
  id_category smallint primary key,
  name_category text not null unique,
  note_category_user text not null
);

-- ============================================================================
-- Main tables
-- ============================================================================

create table if not exists public.users (
  id_user bigint generated by default as identity primary key,
  auth_user_id uuid not null unique default auth.uid(),
  email text not null unique,
  name_user varchar(45) not null,
  id_category smallint not null references public.user_category(id_category) on update cascade on delete restrict,
  password_hash text not null,
  count_events integer not null default 0,
  picture text,
  id_region smallint not null references public.regions(id_region) on update cascade on delete restrict,
  phone_user text unique,
  biogr_user text,
  profile_onboarding_completed boolean not null default false,
  constraint users_email_format check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  constraint users_password_hash_present check (char_length(password_hash) >= 20),
  constraint users_count_events_nonnegative check (count_events >= 0),
  constraint users_count_events_category_rule check (id_category in (2, 3) or count_events = 0),
  constraint users_phone_format check (phone_user is null or phone_user ~ '^\+?[0-9\s()-]{8,20}$'),
  constraint users_biography_words check (biogr_user is null or public.word_count(biogr_user) <= 100)
);

create table if not exists public.events (
  id_event bigint generated by default as identity primary key,
  name_event text not null,
  name_artist text not null,
  place_event text not null default '',
  source_name text,
  source_event_key text,
  source_url text,
  id_event_category smallint not null references public.event_category(id_event_category) on update cascade on delete restrict,
  id_user bigint not null references public.users(id_user) on update cascade on delete cascade,
  id_region smallint not null references public.regions(id_region) on update cascade on delete restrict,
  start_date date not null,
  start_hour time not null,
  end_date date not null,
  end_hour time not null,
  picture text,
  description text not null,
  is_free boolean not null default false,
  price_info text,
  ticket_url text,
  constraint events_start_not_past check ((start_date + start_hour) >= now()),
  constraint events_start_before_end check ((start_date + start_hour) <= (end_date + end_hour)),
  constraint events_duration_within_year check ((end_date + end_hour) <= (start_date + start_hour + interval '1 year')),
  constraint events_description_words check (public.word_count(description) <= 500)
);

alter table if exists public.events
  add column if not exists place_event text not null default '';

-- 3NF bridge table for the user's interests/preferences.
create table if not exists public.user_likings (
  id_user bigint not null references public.users(id_user) on delete cascade,
  id_event_category smallint not null references public.event_category(id_event_category) on delete cascade,
  primary key (id_user, id_event_category)
);

create table if not exists public.event_likes (
  id_user bigint not null references public.users(id_user) on delete cascade,
  id_event bigint not null references public.events(id_event) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (id_user, id_event)
);

create table if not exists public.user_upgrade_requests (
  id_request bigint generated by default as identity primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  specialty_category_id smallint not null references public.event_category(id_event_category) on update cascade on delete restrict,
  is_company boolean not null default false,
  company_identifier text,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint user_upgrade_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

-- Helpful indexes for foreign keys and common lookups.
create index if not exists idx_users_category on public.users (id_category);
create index if not exists idx_users_region on public.users (id_region);
create index if not exists idx_events_category on public.events (id_event_category);
create index if not exists idx_events_user on public.events (id_user);
create index if not exists idx_events_region on public.events (id_region);
create unique index if not exists uq_events_source_identity on public.events (source_name, source_event_key)
where source_name is not null and source_event_key is not null;
create unique index if not exists uq_events_programata_canonical_key on public.events (
  public.normalize_event_dedupe_text(name_event),
  public.normalize_event_dedupe_text(name_artist),
  public.normalize_event_dedupe_text(place_event),
  id_event_category,
  id_user,
  start_date,
  start_hour,
  end_date,
  end_hour
);
create index if not exists idx_user_likings_event_category on public.user_likings (id_event_category);
create index if not exists idx_user_upgrade_requests_auth_user on public.user_upgrade_requests (auth_user_id);

-- ============================================================================
-- Seed data
-- ============================================================================

insert into public.regions (id_region, region) values
  (0, 'Непосочен регион'),
  (1, 'Благоевград'),
  (2, 'Бургас'),
  (3, 'Варна'),
  (4, 'Велико Търново'),
  (5, 'Видин'),
  (6, 'Враца'),
  (7, 'Габрово'),
  (8, 'Добрич'),
  (9, 'Кърджали'),
  (10, 'Кюстендил'),
  (11, 'Ловеч'),
  (12, 'Монтана'),
  (13, 'Пазарджик'),
  (14, 'Перник'),
  (15, 'Плевен'),
  (16, 'Пловдив'),
  (17, 'Разград'),
  (18, 'Русе'),
  (19, 'Силистра'),
  (20, 'Сливен'),
  (21, 'Смолян'),
  (22, 'Софийска област'),
  (23, 'София – град'),
  (24, 'Стара Загора'),
  (25, 'Търговище'),
  (26, 'Хасково'),
  (27, 'Шумен'),
  (28, 'Ямбол')
on conflict (id_region) do nothing;

insert into public.event_category (id_event_category, name_event_category, description_event_category) values
  (10, 'Концерти', 'Музикални събития на живо с български и гостуващи изпълнители.'),
  (11, 'Класическа музика', 'Оперни, балетни и симфонични концерти и класически рецитали.'),
  (12, 'Клубна музика', 'DJs, партита, електронна музика и клубни изпълнения на живо.'),
  (13, 'Рок и Метъл', 'Концерти и фестивали за любителите на тежката музика.'),
  (14, 'Поп и Джаз', 'Популярна музика, джаз сесии и естрадни изпълнения.'),
  (15, 'Народна музика', 'Фолклорни концерти, традиционни изпълнения и автентични вечери.'),
  (16, 'Опера и Балет', 'Оперни спектакли, балетни постановки и класически сценични вечери.'),
  (17, 'Комедия и Stand-up', 'Хумористични шоута, стендъп вечери и сатирични спектакли.'),
  (18, 'Танц и Шоу', 'Танцови спектакли, сценични шоу програми и визуални представления.'),
  (19, 'Работилници и Занаятчийство', 'Творчески работилници, курсове и практически занимания.'),
  (20, 'Спорт', 'Спортни прояви, състезания и активности за любители и професионалисти.'),
  (21, 'Семейни събития', 'Събития за семейства, родители и деца с общи преживявания.'),
  (22, 'Градски събития', 'Събития, свързани с градския живот, общности и квартални инициативи.'),
  (23, 'Здраве и Уелнес', 'Йога, медитация, здравословен живот и уелнес преживявания.'),
  (24, 'Храна и Напитки', 'Кулинарни събития, дегустации, винени вечери и гурме срещи.'),
  (25, 'Пътувания и Приключения', 'Екскурзии, преходи, outdoor активности и приключенски преживявания.'),
  (26, 'Технологии и Бизнес', 'Технологични, предприемачески и бизнес ориентирани събития.'),
  (27, 'Общество и Каузи', 'Благотворителни, социални и граждански инициативи и кампании.'),
  (28, 'Мода и Дизайн', 'Модни ревюта, дизайн, визуална култура и стилови събития.'),
  (29, 'Обучения и Кариера', 'Кариерни форуми, обучения, уъркшопи и професионално развитие.'),
  (30, 'Театър', 'Сценични представления, премиери и фестивали на драматичното изкуство.'),
  (31, 'Детски спектакли', 'Театър, куклени постановки и шоу програми за деца.'),
  (32, 'Българска музика', 'Събития с български изпълнители, авторска музика и локална сцена.'),
  (33, 'Електронна музика', 'DJ сетове, електронни партита и събития за клубна сцена.'),
  (34, 'Хип-хоп и R&B', 'Рап, хип-хоп, R&B концерти и свързани музикални събития.'),
  (35, 'Фолклор и Традиции', 'Традиционни празници, фолклорни концерти и народни обичаи.'),
  (36, 'Изложби и Галерии', 'Галерийни откривания, арт експозиции и визуални проекти.'),
  (37, 'Мюзикъли и Шоу', 'Мюзикъли, varieté и големи сценични шоу програми.'),
  (40, 'Кино', 'Прожекции, премиери и специални кино събития за всички възрасти.'),
  (50, 'Фестивали', 'Градски и регионални празници с култура, музика и храна.'),
  (60, 'Изложби', 'Живопис, скулптура, фотография и съвременно визуално изкуство.'),
  (70, 'Литература', 'Представяне на книги, поетични вечери и литературни четения.'),
  (80, 'Семинари и Лекции', 'Образователни събития, дискусии и професионални обучения.'),
  (90, 'Други', 'Специфични събития, които не попадат в останалите категории.')
on conflict (id_event_category) do update set
  name_event_category = excluded.name_event_category,
  description_event_category = excluded.description_event_category;

-- Official roles only, as defined in the project plan.
insert into public.user_category (id_category, name_category, note_category_user) values
  (1, 'User', 'Обикновен потребител, който разглежда събития и управлява профил.'),
  (2, 'Special_user', 'Потребител, който може да създава и управлява свои събития.'),
  (3, 'Administrator', 'Пълен административен достъп до съдържание и настройки.')
on conflict (id_category) do nothing;

insert into public.users (
  id_user,
  auth_user_id,
  email,
  name_user,
  id_category,
  password_hash,
  count_events,
  picture,
  id_region,
  phone_user,
  biogr_user,
  profile_onboarding_completed
) values
  (
    1,
    '11111111-1111-1111-1111-111111111111',
    'anna.petrova@culturo.bg',
    'Анна Петрова',
    1,
    '$2b$12$annaPetrovaCulturoBGHash000000000000000000000000',
    0,
    'profiles/1.jpg',
    23,
    '+359888111111',
    'Любител на събитията и градската култура. Харесва концерти, кино и кратки уикенд пътувания.',
    true
  ),
  (
    2,
    '22222222-2222-2222-2222-222222222222',
    'ivan.ivanov@culturo.bg',
    'Иван Иванов',
    2,
    '$2b$12$ivanIvanovCulturoBGHash000000000000000000000000',
    4,
    'profiles/2.jpg',
    3,
    '+359888222222',
    'Организира спортни активности и следи новите градски инициативи и събития за общността.',
    true
  ),
  (
    3,
    '33333333-3333-3333-3333-333333333333',
    'marin.stoyanov@culturo.bg',
    'Марин Стоянов',
    2,
    '$2b$12$marinStoyanovCulturoBGHash000000000000000000000',
    2,
    'profiles/3.jpg',
    16,
    '+359888333333',
    'Обича театър, изложби и фестивали. Често споделя препоръки за културни събития в Пловдив.',
    true
  ),
  (
    4,
    '44444444-4444-4444-4444-444444444444',
    'eli.georgieva@culturo.bg',
    'Ели Георгиева',
    3,
    '$2b$12$eliGeorgievaCulturoBGHash0000000000000000000000',
    9,
    'profiles/4.jpg',
    2,
    '+359888444444',
    'Администрира публикации и следи качеството на съдържанието и описанията в платформата.',
    true
  ),
  (
    5,
    '55555555-5555-5555-5555-555555555555',
    'petar.dimitrov@culturo.bg',
    'Петър Димитров',
    1,
    '$2b$12$petarDimitrovCulturoBGHash00000000000000000000',
    0,
    'profiles/5.jpg',
    4,
    '+359888555555',
    'Следи фестивали и кино прожекции, както и големи градски инициативи през уикенда.',
    true
  )
on conflict (id_user) do nothing;

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
  biogr_user,
  profile_onboarding_completed
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
  null,
  true
)
on conflict (auth_user_id) do update set
  email = excluded.email,
  name_user = excluded.name_user,
  id_category = excluded.id_category,
  id_region = excluded.id_region;

-- Autocreate public profiles when new Supabase Auth users are created.


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

select setval(pg_get_serial_sequence('public.events', 'id_event'), coalesce((select max(id_event) from public.events), 0) + 1, false);

insert into public.user_likings (id_user, id_event_category) values
  (1, 10),
  (1, 50),
  (2, 20),
  (3, 30),
  (4, 40)
on conflict do nothing;

insert into public.events (
  id_event,
  name_event,
  name_artist,
  place_event,
  id_event_category,
  id_user,
  id_region,
  start_date,
  start_hour,
  end_date,
  end_hour,
  picture,
  description,
  is_free,
  price_info,
  ticket_url
) values
  (
    1,
    'Лятна рок вечер',
    'The Horizon Band',
    'Летен театър',
    10,
    2,
    23,
    current_date + 14,
    time '19:30',
    current_date + 14,
    time '22:30',
    'events/1_2.jpg',
    'Рок концерт под открито небе с авторски парчета, гост-музиканти и любими класики за феновете на живата сцена.',
    false,
    'От 25 лв.',
    null
  ),
  (
    2,
    'Маратон Варна 2026',
    'Организационен екип',
    'Морска градина',
    20,
    3,
    3,
    current_date + 21,
    time '08:00',
    current_date + 21,
    time '13:00',
    'events/2_3.jpg',
    'Градско спортно събитие за аматьори и професионалисти с различни дистанции, медали и морска атмосфера.',
    true,
    null,
    null
  ),
  (
    3,
    'Театрална премиера „Сцената диша“',
    'Драматичен театър Пловдив',
    'Основна сцена',
    30,
    4,
    16,
    current_date + 30,
    time '19:00',
    current_date + 30,
    time '21:20',
    'events/3_4.jpg',
    'Премиерен спектакъл с модерна драматургия, силна актьорска игра и специално сценично оформление за публиката.',
    false,
    'От 20 лв.',
    'https://example.com/tickets/3'
  ),
  (
    4,
    'Кино под звездите Бургас',
    'Open Air Cinema',
    'Лятно кино',
    40,
    5,
    2,
    current_date + 37,
    time '20:30',
    current_date + 37,
    time '23:00',
    'events/4_5.jpg',
    'Лятна прожекция на открито с удобни места, тематична атмосфера и подбрана програма от съвременно кино.',
    true,
    null,
    null
  ),
  (
    5,
    'Фестивал на занаятите',
    'Craft & Folk BG',
    'Централен площад',
    50,
    2,
    4,
    current_date + 45,
    time '10:00',
    current_date + 47,
    time '20:00',
    'events/5_2.jpg',
    'Тридневен градски фестивал с работилници, местни производители, сцена за музика и кулинарни щандове.',
    true,
    null,
    null
  )
on conflict (id_event) do nothing;

update public.events
set place_event = case id_event
  when 1 then 'Летен театър'
  when 2 then 'Морска градина'
  when 3 then 'Основна сцена'
  when 4 then 'Лятно кино'
  when 5 then 'Централен площад'
  else coalesce(place_event, '')
end
where coalesce(place_event, '') = '';

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.regions enable row level security;
alter table public.event_category enable row level security;
alter table public.user_category enable row level security;
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.user_likings enable row level security;
alter table public.event_likes enable row level security;
alter table public.user_upgrade_requests enable row level security;

-- Public lookup tables

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

-- Profile data: only the owner can read/write their own row.

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

-- Events: public read, write only for the owner if the user is Special_user or Administrator.

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

-- Preferences bridge table: only the profile owner can manage their own preference rows.

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

drop policy if exists "Upgrade requests are readable by owners and admins" on public.user_upgrade_requests;
create policy "Upgrade requests are readable by owners and admins"
on public.user_upgrade_requests
for select
using (
  auth.uid() = auth_user_id
  or public.current_user_is_admin()
);

drop policy if exists "Upgrade requests are insertable by owners" on public.user_upgrade_requests;
create policy "Upgrade requests are insertable by owners"
on public.user_upgrade_requests
for insert
with check (
  auth.uid() = auth_user_id
);

drop policy if exists "Upgrade requests are updatable by admins" on public.user_upgrade_requests;
create policy "Upgrade requests are updatable by admins"
on public.user_upgrade_requests
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

-- ============================================================================
-- Grants for Supabase API access
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select on public.regions to anon, authenticated;
grant select on public.event_category to anon, authenticated;
grant select on public.user_category to anon, authenticated;
grant insert, update, delete on public.user_category to authenticated;
grant insert, update, delete on public.event_category to authenticated;

grant select on public.users to authenticated;
grant insert, update, delete on public.users to authenticated;

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

grant select, insert, delete on public.event_likes to authenticated;

grant select, insert, update, delete on public.user_likings to authenticated;

grant select, insert, update on public.user_upgrade_requests to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.search_events(text, smallint, smallint, date) to anon, authenticated;
grant execute on function public.get_event_by_id(bigint) to anon, authenticated;
