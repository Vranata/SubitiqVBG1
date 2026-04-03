-- Add place_event to events and keep RPCs in sync with the frontend CRUD flow.

alter table if exists public.events
  add column if not exists place_event text not null default '';

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

drop function if exists public.search_events(text, smallint, smallint, date);

create or replace function public.search_events(
  p_search_text text default null,
  p_region_id smallint default null,
  p_category_id smallint default null,
  p_event_date date default null
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
  category text
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
    ec.name_event_category as category
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
  category text
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
    ec.name_event_category as category
  from public.events e
  join public.regions r on r.id_region = e.id_region
  join public.event_category ec on ec.id_event_category = e.id_event_category
  where e.id_event = p_event_id
  limit 1;
$$;
