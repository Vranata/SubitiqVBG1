alter table if exists public.events
  add column if not exists source_name text,
  add column if not exists source_event_key text,
  add column if not exists source_url text;

create unique index if not exists uq_events_source_identity on public.events (source_name, source_event_key)
where source_name is not null and source_event_key is not null;