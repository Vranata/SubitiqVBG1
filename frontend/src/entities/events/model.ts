import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { supabase } from '../../services/supabaseClient';

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
};

type SupabaseEventRow = {
  id_event: number;
  name_event: string;
  name_artist: string;
  place_event: string;
  description: string;
  picture: string | null;
  start_date: string;
  start_hour: string;
  end_date: string;
  end_hour: string;
  id_region: number;
  id_event_category: number;
  id_user: number;
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

type EventLikeRow = {
  id_user: number;
  id_event: number;
};

const fallbackImage = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';

const sortEvents = (events: EventItem[]) => [...events].sort((leftEvent, rightEvent) => {
  const dateCompare = leftEvent.startDate.localeCompare(rightEvent.startDate);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  const hourCompare = leftEvent.startHour.localeCompare(rightEvent.startHour);

  if (hourCompare !== 0) {
    return hourCompare;
  }

  return Number(leftEvent.id) - Number(rightEvent.id);
});

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
  place: row.place_event,
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
  ownerId: String(row.id_user),
});

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
export const fetchAllEventsFx = createEffect(async (): Promise<EventItem[]> => loadEventRows({
  searchText: '',
  regionId: null,
  categoryId: null,
  date: null,
}));
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
export const clearLikedEventIds = createEvent<void>();

export const $events = createStore<EventItem[]>([])
  .on(fetchEventsFx.doneData, (_, nextEvents) => sortEvents(nextEvents))
  .on(addEventFx.doneData, (events, nextEvent) => sortEvents([...events, nextEvent]))
  .on(updateEventFx.doneData, (events, nextEvent) => sortEvents(events.map((event) => (event.id === nextEvent.id ? nextEvent : event))))
  .on(deleteEventFx.doneData, (events, deletedEventId) => events.filter((event) => event.id !== deletedEventId));
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
