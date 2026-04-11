import { combine, createEvent, createStore, sample } from 'effector';
import { $user } from '../model';
import type { DetectedLocationRegion } from '../../shared/browserLocation';

const detectedLocationStorageKey = 'culturobg.detected-location-region';
const locationPermissionStorageKey = 'culturobg.location-permission-state';

export type LocationPermissionState = 'unknown' | 'accepted' | 'declined';

const readStoredPermissionState = (): LocationPermissionState => {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  const storedState = window.localStorage.getItem(locationPermissionStorageKey);

  return storedState === 'accepted' || storedState === 'declined' ? storedState : 'unknown';
};

const readStoredLocationRegion = (): DetectedLocationRegion | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(detectedLocationStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as DetectedLocationRegion;
  } catch {
    return null;
  }
};

export const locationPermissionChanged = createEvent<LocationPermissionState>();
export const locationRegionDetected = createEvent<DetectedLocationRegion | null>();
export const locationRegionCleared = createEvent<void>();
export const locationPromptRequested = createEvent<void>();
export const locationPromptClosed = createEvent<void>();

export const $locationPermissionState = createStore<LocationPermissionState>(readStoredPermissionState())
  .on(locationPermissionChanged, (_, nextState) => nextState);

export const $detectedLocationRegion = createStore<DetectedLocationRegion | null>(readStoredLocationRegion())
  .on(locationRegionDetected, (_, nextRegion) => nextRegion)
  .reset(locationRegionCleared);

export const $isLocationPromptOpen = createStore(false)
  .on(locationPromptRequested, () => true)
  .on(locationPromptClosed, () => false)
  .on(locationPermissionChanged, (_, nextState) => nextState === 'unknown');

export const $effectiveRegionId = combine($detectedLocationRegion, $user, (detectedRegion, user) => {
  if (detectedRegion) {
    return detectedRegion.regionId;
  }

  return user?.regionId ?? null;
});

export const $effectiveRegionName = combine($detectedLocationRegion, $user, (detectedRegion, user) => {
  if (detectedRegion) {
    return detectedRegion.regionName;
  }

  return null;
});

const persistPermissionStateFx = createEvent<LocationPermissionState>();
const persistLocationRegionFx = createEvent<DetectedLocationRegion | null>();

sample({
  clock: locationPermissionChanged,
  target: persistPermissionStateFx,
});

sample({
  clock: locationRegionDetected,
  target: persistLocationRegionFx,
});

persistPermissionStateFx.watch((nextState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(locationPermissionStorageKey, nextState);
});

persistLocationRegionFx.watch((nextRegion) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!nextRegion) {
    window.localStorage.removeItem(detectedLocationStorageKey);
    return;
  }

  window.localStorage.setItem(detectedLocationStorageKey, JSON.stringify(nextRegion));
});
