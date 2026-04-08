-- Migration: Add and expand event categories and free event listing
-- Date: April 8, 2026

-- 1. Expand event categories
INSERT INTO public.event_category (id_event_category, name_event_category, description_event_category) VALUES
  (11, 'Класическа музика', 'Оперни, балетни и симфонични концерти и класически рецитали.'),
  (12, 'Клубна музика', 'DJs, партита, електронна музика и клубни изпълнения на живо.'),
  (13, 'Рок и Метъл', 'Концерти и фестивали за любителите на тежката музика.'),
  (14, 'Поп и Джаз', 'Популярна музика, джаз сесии и естрадни изпълнения.'),
  (31, 'Детски спектакли', 'Театър, куклени постановки и шоу програми за деца.'),
  (60, 'Изложби', 'Живопис, скулптура, фотография и съвременно визуално изкуство.'),
  (70, 'Литература', 'Представяне на книги, поетични вечери и литературни четения.'),
  (80, 'Семинари и Лекции', 'Образователни събития, дискусии и професионални обучения.'),
  (90, 'Други', 'Специфични събития, които не попадат в останалите категории.')
ON CONFLICT (id_event_category) DO UPDATE SET
  name_event_category = EXCLUDED.name_event_category,
  description_event_category = EXCLUDED.description_event_category;

-- 2. Add is_free column to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add price_info and ticket_url for better listing (optional but recommended based on research)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS price_info TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_url TEXT;

-- 4. Update search_events function to include is_free field and filter
DROP FUNCTION IF EXISTS public.search_events(text, smallint, smallint, date);

CREATE OR REPLACE FUNCTION public.search_events(
  p_search_text text DEFAULT NULL,
  p_region_id smallint DEFAULT NULL,
  p_category_id smallint DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_is_free boolean DEFAULT NULL
)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
AS $$
  SELECT
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
    ec.name_event_category AS category,
    e.is_free,
    e.price_info,
    e.ticket_url
  FROM public.events e
  JOIN public.regions r ON r.id_region = e.id_region
  JOIN public.event_category ec ON ec.id_event_category = e.id_event_category
  WHERE
    (
      p_search_text IS NULL
      OR btrim(p_search_text) = ''
      OR e.name_event ILIKE '%' || p_search_text || '%'
      OR e.name_artist ILIKE '%' || p_search_text || '%'
      OR e.place_event ILIKE '%' || p_search_text || '%'
      OR e.description ILIKE '%' || p_search_text || '%'
    )
    AND (p_region_id IS NULL OR e.id_region = p_region_id)
    AND (p_category_id IS NULL OR e.id_event_category = p_category_id)
    AND (p_event_date IS NULL OR p_event_date BETWEEN e.start_date AND e.end_date)
    AND (p_is_free IS NULL OR e.is_free = p_is_free)
  ORDER BY e.start_date ASC, e.start_hour ASC, e.id_event ASC;
$$;

-- 5. Update get_event_by_id function
DROP FUNCTION IF EXISTS public.get_event_by_id(bigint);

CREATE OR REPLACE FUNCTION public.get_event_by_id(p_event_id bigint)
RETURNS TABLE (
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
LANGUAGE sql
STABLE
AS $$
  SELECT
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
    ec.name_event_category AS category,
    e.is_free,
    e.price_info,
    e.ticket_url
  FROM public.events e
  JOIN public.regions r ON r.id_region = e.id_region
  JOIN public.event_category ec ON ec.id_event_category = e.id_event_category
  WHERE e.id_event = p_event_id
  LIMIT 1;
$$;
