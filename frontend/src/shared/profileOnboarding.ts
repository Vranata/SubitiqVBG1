const buildOnboardingStorageKey = (authUserId: string) => `culturobg.profile-onboarding-completed:${authUserId}`;

export const hasLocalOnboardingCompletion = (authUserId: string): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(buildOnboardingStorageKey(authUserId)) === 'true';
};

export const setLocalOnboardingCompletion = (authUserId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(buildOnboardingStorageKey(authUserId), 'true');
};