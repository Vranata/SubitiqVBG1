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