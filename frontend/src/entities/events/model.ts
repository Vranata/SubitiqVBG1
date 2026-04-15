import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import dayjs from 'dayjs';
import 'dayjs/locale/bg';
import { publicSupabase, supabase } from '../../services/supabaseClient';

dayjs.locale('bg');

export type EventItem = {
  id: string;
  title: string;
  artist: string;
  place: string;
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
  ownerId: string;
};

export type EventEditorValues = {
  name: string;
  artist: string;
  place: string;
  description: string;
  regionId: string;
  categoryId: string;
  startDate: string;
  endDate: string;
  startHour: string;
  endHour: string;
};

export type EventMutationValues = EventEditorValues & {
  id?: string;
  userId: string;
};

export type EventLikeMutation = {
  userId: string;
  eventId: string;
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
  limit: number;
  offset: number;
};

export const PAGE_SIZE = 48;

type SupabaseEventRow = {
  out_id_event: number;
  out_name_event: string;
  out_name_artist: string;
  out_place_event: string;
  out_description: string;
  out_picture: string | null;
  out_start_date: string;
  out_start_hour: string;
  out_end_date: string;
  out_end_hour: string;
  out_id_region: number;
  out_id_event_category: number;
  out_id_user: number;
  out_region: string;
  out_category: string;
  out_is_free: boolean;
  out_price_info: string | null;
  out_ticket_url: string | null;
};

type RegionRow = {
  id_region: number;
  region: string;
};

type CategoryRow = {
  id_event_category: number;
  name_event_category: string;
};

type EventLikeRow = {
  id_user: number;
  id_event: number;
};

const fallbackImage = '/images/defaults/branded-default.png';

const sortEvents = (events: EventItem[]) => [...events].sort((leftEvent, rightEvent) => {
  const dateCompare = (leftEvent.startDate || '').localeCompare(rightEvent.startDate || '');

  if (dateCompare !== 0) {
    return dateCompare;
  }

  const hourCompare = (leftEvent.startHour || '').localeCompare(rightEvent.startHour || '');

  if (hourCompare !== 0) {
    return hourCompare;
  }

  return Number(leftEvent.id) - Number(rightEvent.id);
});

const formatDate = (value: string) => {
  const d = dayjs(value);
  if (!d.isValid()) return value;
  return d.format('D MMMM YYYY г.');
};

const getCategoryDefaultImage = (categoryId: number): string => {
  const music = [10, 11, 12, 13, 14, 33, 34];
  const stage = [16, 17, 18, 30, 37];
  const cinema = [40];
  const sports = [20];
  const festivals = [15, 35, 50];

  if (music.includes(categoryId)) return '/images/defaults/concert-default.png';
  if (stage.includes(categoryId)) return '/images/defaults/theater-default.png';
  if (cinema.includes(categoryId)) return '/images/defaults/cinema-default.png';
  if (sports.includes(categoryId)) return '/images/defaults/sports-default.png';
  if (festivals.includes(categoryId)) return '/images/defaults/festival-default.png';

  return fallbackImage;
};

const mapEventRow = (row: SupabaseEventRow): EventItem => {
  // Treat the old unsplash fallback or any obviously generic placeholder as "no image"
  const isOldFallback = row.out_picture && row.out_picture.includes('photo-1514525253161-7a46d19cd819');
  const hasValidPicture = row.out_picture && !isOldFallback && row.out_picture.trim() !== '';

  return {
    id: String(row.out_id_event),
    title: row.out_name_event,
    artist: row.out_name_artist,
    place: row.out_place_event,
    description: row.out_description,
    regionId: row.out_id_region,
    region: row.out_region,
    startDate: row.out_start_date,
    date: formatDate(row.out_start_date),
    image: hasValidPicture ? row.out_picture! : getCategoryDefaultImage(row.out_id_event_category),
    categoryId: row.out_id_event_category,
    category: row.out_category,
    startHour: row.out_start_hour,
    endDate: row.out_end_date,
    endHour: row.out_end_hour,
    ownerId: String(row.out_id_user),
  };
};

const buildEventPayload = (values: EventMutationValues) => ({
  name_event: values.name.trim(),
  name_artist: values.artist.trim(),
  place_event: values.place.trim(),
  description: values.description.trim(),
  id_region: Number(values.regionId),
  id_event_category: Number(values.categoryId),
  id_user: Number(values.userId),
  start_date: values.startDate,
  start_hour: values.startHour,
  end_date: values.endDate,
  end_hour: values.endHour,
  picture: null,
  is_free: false,
  price_info: null,
  ticket_url: null,
});

const normalizeFilters = (filters: EventFilters) => ({
  p_search_text: filters.searchText.trim().length > 0 ? filters.searchText.trim() : null,
  p_region_id: filters.regionId ? Number(filters.regionId) : null,
  p_category_id: filters.categoryId ? Number(filters.categoryId) : null,
  p_event_date: filters.date,
  p_limit: filters.limit,
  p_offset: filters.offset,
});

const loadEventRows = async (filters: EventFilters): Promise<EventItem[]> => {
  const { data, error } = await publicSupabase.rpc('search_events_v2', normalizeFilters(filters));

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

  const { data, error } = await publicSupabase.rpc('get_event_by_id', {
    p_event_id: numericId,
  });

  if (error) {
    throw error;
  }

  const [row] = (data ?? []) as SupabaseEventRow[];

  return row ? mapEventRow(row) : null;
};

const loadLikedEventIds = async (userId: string): Promise<string[]> => {
  const numericUserId = Number(userId);

  if (Number.isNaN(numericUserId)) {
    return [];
  }

  const { data, error } = await supabase
    .from('event_likes')
    .select('id_user, id_event')
    .eq('id_user', numericUserId)
    .order('id_event', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as EventLikeRow[]).map((row) => String(row.id_event));
};

const toggleEventLike = async ({ userId, eventId }: EventLikeMutation): Promise<{ eventId: string; liked: boolean }> => {
  const numericUserId = Number(userId);
  const numericEventId = Number(eventId);

  if (Number.isNaN(numericUserId) || Number.isNaN(numericEventId)) {
    throw new Error('Invalid like payload.');
  }

  const { data: existingLike, error: fetchError } = await supabase
    .from('event_likes')
    .select('id_event')
    .eq('id_user', numericUserId)
    .eq('id_event', numericEventId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existingLike) {
    const { error: deleteError } = await supabase
      .from('event_likes')
      .delete()
      .eq('id_user', numericUserId)
      .eq('id_event', numericEventId);

    if (deleteError) {
      throw deleteError;
    }

    return { eventId, liked: false };
  }

  const { error: insertError } = await supabase
    .from('event_likes')
    .insert({
      id_user: numericUserId,
      id_event: numericEventId,
    });

  if (insertError) {
    throw insertError;
  }

  return { eventId, liked: true };
};

export const fetchEventsFx = createEffect(loadEventRows);
export const fetchCategoryCountsFx = createEffect(async (filters: Omit<EventFilters, 'categoryId' | 'limit' | 'offset'>) => {
  const { data, error } = await publicSupabase.rpc('get_category_counts', {
    p_search_text: filters.searchText.trim().length > 0 ? filters.searchText.trim() : null,
    p_region_id: filters.regionId ? Number(filters.regionId) : null,
    p_event_date: filters.date,
  });

  if (error) throw error;

  return (data || []) as { out_category_id: number; out_event_count: number }[];
});

export const fetchAllEventsFx = createEffect(async (): Promise<EventItem[]> => {
  const { data, error } = await publicSupabase
    .from('events')
    .select('*, regions(region), event_category(name_event_category)')
    .gte('end_date', dayjs().format('YYYY-MM-DD'))
    .order('start_date', { ascending: true })
    .order('start_hour', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: String(row.id_event),
    title: row.name_event,
    artist: row.name_artist,
    place: row.place_event,
    description: row.description,
    regionId: row.id_region,
    region: row.regions?.region || '',
    startDate: row.start_date,
    date: formatDate(row.start_date),
    image: (row.picture && row.picture.trim() !== '' && !row.picture.includes('photo-1514525253161-7a46d19cd819'))
      ? row.picture
      : getCategoryDefaultImage(row.id_event_category),
    categoryId: row.id_event_category,
    category: row.event_category?.name_event_category || '',
    startHour: row.start_hour,
    endDate: row.end_date,
    endHour: row.end_hour,
    ownerId: String(row.id_user),
  }));
});
export const fetchEventByIdFx = createEffect(loadEventRowById);
export const fetchLikedEventIdsFx = createEffect(loadLikedEventIds);
export const toggleEventLikeFx = createEffect(toggleEventLike);
export const addEventFx = createEffect(async (values: EventMutationValues): Promise<EventItem> => {
  const { data, error } = await supabase
    .from('events')
    .insert(buildEventPayload(values))
    .select('id_event')
    .single();

  if (error) {
    throw error;
  }

  const createdEvent = await loadEventRowById(String(data.id_event));

  if (!createdEvent) {
    throw new Error('Failed to load the created event.');
  }

  return createdEvent;
});
export const updateEventFx = createEffect(async (values: EventMutationValues): Promise<EventItem> => {
  if (!values.id) {
    throw new Error('Missing event id.');
  }

  const numericId = Number(values.id);

  if (Number.isNaN(numericId)) {
    throw new Error('Invalid event id.');
  }

  const { error } = await supabase
    .from('events')
    .update(buildEventPayload(values))
    .eq('id_event', numericId);

  if (error) {
    throw error;
  }

  const updatedEvent = await loadEventRowById(values.id);

  if (!updatedEvent) {
    throw new Error('Failed to load the updated event.');
  }

  return updatedEvent;
});
export const deleteEventFx = createEffect(async (eventId: string): Promise<string> => {
  const numericId = Number(eventId);

  if (Number.isNaN(numericId)) {
    throw new Error('Invalid event id.');
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id_event', numericId);

  if (error) {
    throw error;
  }

  return eventId;
});
export const fetchRegionsFx = createEffect(async (): Promise<FilterOption[]> => {
  const { data, error } = await publicSupabase
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
  const { data, error } = await publicSupabase
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

export const homePageOpened = createEvent<void>();
export const eventsPageOpened = createEvent<void>();
export const eventDetailsOpened = createEvent<string>();
export const searchChanged = createEvent<string>();
export const regionChanged = createEvent<string | null>();
export const categoryChanged = createEvent<string | null>();
export const dateChanged = createEvent<string | null>();
export const eventsLoadMore = createEvent<void>();
export const clearLikedEventIds = createEvent<void>();

export const $events = createStore<EventItem[]>([])
  .on(fetchEventsFx.done, (state, { params, result }) => {
    // If offset is 0, it's a fresh search/filter, replace the list
    if (params.offset === 0) return sortEvents(result);
    // Otherwise append
    return sortEvents([...state, ...result]);
  })
  .on(addEventFx.doneData, (events, nextEvent) => sortEvents([...events, nextEvent]))
  .on(updateEventFx.doneData, (events, nextEvent) => sortEvents(events.map((event) => (event.id === nextEvent.id ? nextEvent : event))))
  .on(deleteEventFx.doneData, (events, deletedEventId) => events.filter((event) => event.id !== deletedEventId));

export const $featuredEvents = $events.map((events) => {
  const today = dayjs().startOf('day');
  return [...events]
    .filter((e) => !dayjs(e.endDate).isBefore(today, 'day'))
    .slice(0, 3);
});
export const $currentEvent = createStore<EventItem | null>(null)
  .on(fetchEventByIdFx.doneData, (_, nextEvent) => nextEvent)
  .on(updateEventFx.doneData, (currentEvent, nextEvent) => (currentEvent?.id === nextEvent.id ? nextEvent : currentEvent))
  .on(deleteEventFx.doneData, (currentEvent, deletedEventId) => (currentEvent?.id === deletedEventId ? null : currentEvent));
export const $likedEventIds = createStore<string[]>([])
  .on(fetchLikedEventIdsFx.doneData, (_, nextLikedEventIds) => nextLikedEventIds)
  .on(toggleEventLikeFx.doneData, (likedEventIds, { eventId, liked }) => (
    liked
      ? Array.from(new Set([...likedEventIds, eventId]))
      : likedEventIds.filter((likedEventId) => likedEventId !== eventId)
  ))
  .reset(clearLikedEventIds);

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
export const $offset = createStore<number>(0)
  .on(eventsLoadMore, (state) => state + PAGE_SIZE)
  .reset([searchChanged, regionChanged, categoryChanged, dateChanged]);

export const $hasMoreEvents = createStore<boolean>(true)
  .on(fetchEventsFx.doneData, (_, result) => result.length === PAGE_SIZE)
  .reset([searchChanged, regionChanged, categoryChanged, dateChanged]);

export const $categoryCounts = createStore<Record<number, number>>({})
  .on(fetchCategoryCountsFx.doneData, (_, counts) => {
    return counts.reduce((acc, { out_category_id, out_event_count }) => {
      acc[out_category_id] = Number(out_event_count);
      return acc;
    }, {} as Record<number, number>);
  });

export const $regionOptions = createStore<FilterOption[]>([]).on(fetchRegionsFx.doneData, (_, nextOptions) => nextOptions);
export const $categoryOptions = createStore<FilterOption[]>([]).on(fetchCategoriesFx.doneData, (_, nextOptions) => nextOptions);
export const $enrichedCategoryOptions = combine(
  $categoryOptions,
  $categoryCounts,
  (options, counts) => {
    return options.map(opt => {
      const categoryId = Number(opt.value);
      const eventCount = counts[categoryId] || 0;
      return {
        ...opt,
        disabled: eventCount === 0,
        label: `${opt.label}${eventCount > 0 ? ` (${eventCount})` : ''}`,
      };
    });
  }
);

sample({
  clock: [eventsPageOpened, homePageOpened],
  target: [fetchRegionsFx, fetchCategoriesFx],
});

sample({
  clock: [eventsPageOpened, homePageOpened, searchChanged, regionChanged, categoryChanged, dateChanged, eventsLoadMore],
  source: {
    searchText: $searchText,
    regionId: $selectedRegionId,
    categoryId: $selectedCategoryId,
    date: $selectedDate,
    offset: $offset,
  },
  fn: (filters): EventFilters => ({ ...filters, limit: PAGE_SIZE }),
  target: fetchEventsFx,
});

// Specifically fetch category counts only when the filters that affect them change (ignoring the category filter itself)
sample({
  clock: [eventsPageOpened, homePageOpened, searchChanged, regionChanged, dateChanged],
  source: {
    searchText: $searchText,
    regionId: $selectedRegionId,
    date: $selectedDate,
  },
  target: fetchCategoryCountsFx,
});

sample({
  clock: eventDetailsOpened,
  target: fetchEventByIdFx,
});
