import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { supabase } from '../../services/supabaseClient';

export type EventItem = {
  id: string;
  title: string;
  artist: string;
  description: string;
  regionId: number;
  region: string;
  startDate: string;
  date: string;
  image: string;
  categoryId: number;
  category: string;
  startHour: string;
  endDate: string;
  endHour: string;
};

export type FilterOption = {
  label: string;
  value: string;
};

type EventFilters = {
  searchText: string;
  regionId: string | null;
  categoryId: string | null;
  date: string | null;
};

type SupabaseEventRow = {
  id_event: number;
  name_event: string;
  name_artist: string;
  description: string;
  picture: string | null;
  start_date: string;
  start_hour: string;
  end_date: string;
  end_hour: string;
  id_region: number;
  id_event_category: number;
  region: string;
  category: string;
};

type RegionRow = {
  id_region: number;
  region: string;
};

type CategoryRow = {
  id_event_category: number;
  name_event_category: string;
};

const fallbackImage = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';

const formatDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('bg-BG');
};

const mapEventRow = (row: SupabaseEventRow): EventItem => ({
  id: String(row.id_event),
  title: row.name_event,
  artist: row.name_artist,
  description: row.description,
  regionId: row.id_region,
  region: row.region,
  startDate: row.start_date,
  date: formatDate(row.start_date),
  image: row.picture ?? fallbackImage,
  categoryId: row.id_event_category,
  category: row.category,
  startHour: row.start_hour,
  endDate: row.end_date,
  endHour: row.end_hour,
});

const normalizeFilters = (filters: EventFilters) => ({
  p_search_text: filters.searchText.trim().length > 0 ? filters.searchText.trim() : null,
  p_region_id: filters.regionId ? Number(filters.regionId) : null,
  p_category_id: filters.categoryId ? Number(filters.categoryId) : null,
  p_event_date: filters.date,
});

const loadEventRows = async (filters: EventFilters): Promise<EventItem[]> => {
  const { data, error } = await supabase.rpc('search_events', normalizeFilters(filters));

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: SupabaseEventRow) => mapEventRow(row));
};

const loadEventRowById = async (eventId: string): Promise<EventItem | null> => {
  const numericId = Number(eventId);

  if (Number.isNaN(numericId)) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_event_by_id', {
    p_event_id: numericId,
  });

  if (error) {
    throw error;
  }

  const [row] = (data ?? []) as SupabaseEventRow[];

  return row ? mapEventRow(row) : null;
};

export const fetchEventsFx = createEffect(loadEventRows);
export const fetchEventByIdFx = createEffect(loadEventRowById);
export const fetchRegionsFx = createEffect(async (): Promise<FilterOption[]> => {
  const { data, error } = await supabase
    .from('regions')
    .select('id_region, region')
    .order('id_region', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RegionRow[]).map((row) => ({
    label: row.region,
    value: String(row.id_region),
  }));
});
export const fetchCategoriesFx = createEffect(async (): Promise<FilterOption[]> => {
  const { data, error } = await supabase
    .from('event_category')
    .select('id_event_category, name_event_category')
    .order('id_event_category', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as CategoryRow[]).map((row) => ({
    label: row.name_event_category,
    value: String(row.id_event_category),
  }));
});

export const eventsPageOpened = createEvent<void>();
export const eventDetailsOpened = createEvent<string>();
export const searchChanged = createEvent<string>();
export const regionChanged = createEvent<string | null>();
export const categoryChanged = createEvent<string | null>();
export const dateChanged = createEvent<string | null>();

export const $events = createStore<EventItem[]>([]).on(fetchEventsFx.doneData, (_, nextEvents) => nextEvents);
export const $currentEvent = createStore<EventItem | null>(null).on(fetchEventByIdFx.doneData, (_, nextEvent) => nextEvent);

export const $isLoading = combine({
  events: fetchEventsFx.pending,
  regions: fetchRegionsFx.pending,
  categories: fetchCategoriesFx.pending,
}).map(({ events, regions, categories }) => events || regions || categories);

export const $isDetailLoading = fetchEventByIdFx.pending;

export const $searchText = createStore<string>('').on(searchChanged, (_, next) => next);
export const $selectedRegionId = createStore<string | null>(null).on(regionChanged, (_, next) => next);
export const $selectedCategoryId = createStore<string | null>(null).on(categoryChanged, (_, next) => next);
export const $selectedDate = createStore<string | null>(null).on(dateChanged, (_, next) => next);

export const $regionOptions = createStore<FilterOption[]>([]).on(fetchRegionsFx.doneData, (_, nextOptions) => nextOptions);
export const $categoryOptions = createStore<FilterOption[]>([]).on(fetchCategoriesFx.doneData, (_, nextOptions) => nextOptions);

sample({
  clock: eventsPageOpened,
  target: fetchRegionsFx,
});

sample({
  clock: eventsPageOpened,
  target: fetchCategoriesFx,
});

sample({
  clock: [eventsPageOpened, searchChanged, regionChanged, categoryChanged, dateChanged],
  source: {
    searchText: $searchText,
    regionId: $selectedRegionId,
    categoryId: $selectedCategoryId,
    date: $selectedDate,
  },
  fn: (filters): EventFilters => filters,
  target: fetchEventsFx,
});

sample({
  clock: eventDetailsOpened,
  target: fetchEventByIdFx,
});
