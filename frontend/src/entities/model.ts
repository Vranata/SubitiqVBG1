import type { Session } from '@supabase/supabase-js';
import { redirect } from 'atomic-router';
import { createEffect, createEvent, createStore, sample } from 'effector';
import { routes } from '../shared/routing';
import { getSession, getUser, resetPassword, signIn, signOut, signUp, updatePassword, type AuthCredentials, type ResetPasswordPayload, type UpdatePasswordPayload } from '../shared/api/auth';
import { supabase } from '../services/supabaseClient';

const goHome = createEvent<void>();
const authSessionReceived = createEvent<Session | null>();

export type UserRole = 'User' | 'Special_user' | 'Administrator';

export type AppUser = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  roleId: number;
  roleName: UserRole;
  roleNote: string;
  picture: string | null;
  regionId: number | null;
  phone: string | null;
  biography: string | null;
  onboardingCompleted: boolean;
};

type UserRow = {
  id_user: number;
  auth_user_id: string;
  email: string;
  name_user: string;
  id_category: number;
  picture: string | null;
  id_region: number | null;
  phone_user: string | null;
  biogr_user: string | null;
  profile_onboarding_completed: boolean;
  user_category: Array<{
    id_category: number;
    name_category: UserRole;
    note_category_user: string;
  }> | null;
};

const isMissingOnboardingColumnError = (error: { code?: string | null; message?: string | null }) =>
  error.code === '42703' || error.code === 'PGRST204' || Boolean(error.message?.includes('profile_onboarding_completed'));

const roleFallbacks: Record<UserRole, { note: string }> = {
  User: {
    note: 'Обикновен потребител, който разглежда събития и управлява профил.',
  },
  Special_user: {
    note: 'Потребител, който може да създава и управлява свои събития.',
  },
  Administrator: {
    note: 'Пълен административен достъп до съдържание и настройки.',
  },
};

const adminBootstrapEmail = 'culturobg@gmail.com';

const isBootstrapAdminEmail = (email: string | null | undefined) => email?.toLowerCase() === adminBootstrapEmail;

const isRecoveryRoute = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('mode') === 'recovery';
};

const buildFallbackUser = (session: Session): AppUser => ({
  id: session.user.id,
  authUserId: session.user.id,
  email: session.user.email ?? '',
  name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.email ?? 'Потребител',
  roleId: isBootstrapAdminEmail(session.user.email) ? 3 : 1,
  roleName: isBootstrapAdminEmail(session.user.email) ? 'Administrator' : 'User',
  roleNote: isBootstrapAdminEmail(session.user.email) ? roleFallbacks.Administrator.note : roleFallbacks.User.note,
  picture: null,
  regionId: null,
  phone: null,
  biography: null,
  onboardingCompleted: false,
});

const mapUserRow = (row: UserRow): AppUser => {
  const userCategory = row.user_category?.[0] ?? null;
  const bootstrapAdmin = isBootstrapAdminEmail(row.email);

  return {
    id: String(row.id_user),
    authUserId: row.auth_user_id,
    email: row.email,
    name: row.name_user,
    roleId: bootstrapAdmin ? 3 : (userCategory?.id_category ?? row.id_category),
    roleName: bootstrapAdmin ? 'Administrator' : (userCategory?.name_category ?? 'User'),
    roleNote: bootstrapAdmin ? roleFallbacks.Administrator.note : (userCategory?.note_category_user ?? roleFallbacks.User.note),
    picture: row.picture,
    regionId: row.id_region,
    phone: row.phone_user,
    biography: row.biogr_user,
    onboardingCompleted: row.profile_onboarding_completed,
  };
};

const loadUserProfileBySession = async (session: Session | null): Promise<AppUser | null> => {
  if (!session) {
    return null;
  }

  const authUser = await getUser();
  const authEmail = authUser?.email ?? session.user.email ?? '';

  const baseSelect = 'id_user, auth_user_id, email, name_user, id_category, picture, id_region, phone_user, biogr_user, user_category:id_category ( id_category, name_category, note_category_user )';
  const extendedSelect = 'id_user, auth_user_id, email, name_user, id_category, picture, id_region, phone_user, biogr_user, profile_onboarding_completed, user_category:id_category ( id_category, name_category, note_category_user )';

  const { data, error } = await supabase
    .from('users')
    .select(extendedSelect)
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error) {
    if (isMissingOnboardingColumnError(error)) {
      const fallbackResult = await supabase
        .from('users')
        .select(baseSelect)
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      if (!fallbackResult.data) {
        return buildFallbackUser(session);
      }

      return mapUserRow({
        ...(fallbackResult.data as Omit<UserRow, 'profile_onboarding_completed'>),
        profile_onboarding_completed: false,
      });
    }

    throw error;
  }

  if (!data) {
    return buildFallbackUser(session);
  }

  if (authEmail && data.email !== authEmail) {
    const syncEmailResult = await supabase
      .from('users')
      .update({ email: authEmail })
      .eq('auth_user_id', session.user.id);

    if (syncEmailResult.error && !isMissingOnboardingColumnError(syncEmailResult.error)) {
      throw syncEmailResult.error;
    }

    return mapUserRow({
      ...data,
      email: authEmail,
    } as UserRow);
  }

  return mapUserRow(data as UserRow);
};

const loadUserProfileFx = createEffect(async (session: Session | null): Promise<AppUser | null> => {
  return loadUserProfileBySession(session);
});

redirect({
  clock: goHome,
  route: routes.home,
  replace: true,
});

export const checkSession = createEvent<void>();
export const refreshUserProfile = createEvent<void>();
export const authStateChanged = createEvent<Session | null>();
export const signInFx = createEffect(async ({ email, password }: AuthCredentials) => signIn(email, password));
export const signUpFx = createEffect(async ({ email, password }: AuthCredentials) => signUp(email, password));
export const resetPasswordFx = createEffect(async (payload: ResetPasswordPayload) => resetPassword(payload));
export const updatePasswordFx = createEffect(async ({ password }: UpdatePasswordPayload) => updatePassword({ password }));
export const signOutFx = createEffect(async () => signOut());
export const startAuthSyncFx = createEffect(() => {
  supabase.auth.onAuthStateChange((_, session) => {
    authStateChanged(session);
  });
});

const checkSessionFx = createEffect(async () => getSession());
export const refreshUserProfileFx = createEffect(async (): Promise<AppUser | null> => loadUserProfileBySession(await getSession()));

export const $user = createStore<AppUser | null>(null)
  .on(loadUserProfileFx.doneData, (_, user) => user)
  .on(refreshUserProfileFx.doneData, (_, user) => user);

export const $isAuthenticated = $user.map((user) => Boolean(user));
export const $userRole = $user.map((user) => user?.roleName ?? null);
export const $isAdmin = $userRole.map((role) => role === 'Administrator');
export const $isSpecialUser = $userRole.map((role) => role === 'Special_user');
export const $isRegularUser = $userRole.map((role) => role === 'User');

sample({
  clock: checkSession,
  target: checkSessionFx,
});

sample({
  clock: refreshUserProfile,
  target: refreshUserProfileFx,
});

sample({
  clock: [checkSessionFx.doneData, signInFx.doneData, signUpFx.doneData, authStateChanged],
  target: authSessionReceived,
});

sample({
  clock: signOutFx.done,
  fn: () => null,
  target: authSessionReceived,
});

sample({
  clock: authSessionReceived,
  target: loadUserProfileFx,
});

sample({
  clock: loadUserProfileFx.doneData,
  filter: (user: AppUser | null): user is AppUser => Boolean(user) && !isRecoveryRoute(),
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: signOutFx.done,
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: routes.login.opened,
  source: $isAuthenticated,
  filter: (isAuthenticated: boolean) => isAuthenticated && !isRecoveryRoute(),
  fn: () => undefined,
  target: goHome,
});