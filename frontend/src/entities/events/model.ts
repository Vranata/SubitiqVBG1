import { createStore, createEvent, sample } from 'effector';
import { DUMMY_EVENTS } from '../../services/constants';
import type { EventItem } from '../../services/constants';

// 1. Events (Actions)
export const searchChanged = createEvent<string>();
export const cityChanged = createEvent<string | null>();
export const categoryChanged = createEvent<string | null>();

// 2. Base Stores
export const $events = createStore<EventItem[]>(DUMMY_EVENTS);
export const $searchText = createStore<string>('').on(searchChanged, (_, next) => next);
export const $selectedCity = createStore<string | null>(null).on(cityChanged, (_, next) => next);
export const $selectedCategory = createStore<string | null>(null).on(categoryChanged, (_, next) => next);

// 3. Derived Store for filtering
export const $filteredEvents = createStore<EventItem[]>(DUMMY_EVENTS);

// 4. Filtering Logic (Reacting to changes)
sample({
  clock: [searchChanged, cityChanged, categoryChanged, $events],
  source: { 
    events: $events, 
    search: $searchText, 
    city: $selectedCity, 
    category: $selectedCategory 
  },
  fn: ({ events, search, city, category }) => {
    return events.filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) || 
                           event.description.toLowerCase().includes(search.toLowerCase());
      const matchesCity = !city || event.city === city;
      const matchesCategory = !category || event.category === category;
      
      return matchesSearch && matchesCity && matchesCategory;
    });
  },
  target: $filteredEvents,
});

// 5. Helpers for UI (Unique lists for Select options)
export const $uniqueCities = $events.map(events => 
  Array.from(new Set(events.map(e => e.city)))
);

export const $uniqueCategories = $events.map(events => 
  Array.from(new Set(events.map(e => e.category)))
);
