import type { Session, User } from '@supabase/supabase-js';
import { redirect } from 'atomic-router';
import { createEffect, createEvent, createStore, sample } from 'effector';
import { routes } from '../shared/routing';
import { getSession, signIn, signOut, signUp, type AuthCredentials } from '../shared/api/auth';
import { supabase } from '../services/supabaseClient';

const goHome = createEvent<void>();

redirect({
  clock: goHome,
  route: routes.home,
  replace: true,
});

const sessionToUser = (session: Session | null): User | null => session?.user ?? null;

export const checkSession = createEvent<void>();
export const authStateChanged = createEvent<Session | null>();
export const signInFx = createEffect(async ({ email, password }: AuthCredentials) => signIn(email, password));
export const signUpFx = createEffect(async ({ email, password }: AuthCredentials) => signUp(email, password));
export const signOutFx = createEffect(async () => signOut());
export const startAuthSyncFx = createEffect(() => {
  supabase.auth.onAuthStateChange((_, session) => {
    authStateChanged(session);
  });
});

const checkSessionFx = createEffect(async () => getSession());

export const $user = createStore<User | null>(null)
  .on(checkSessionFx.doneData, (_, session) => sessionToUser(session))
  .on(signInFx.doneData, (_, session) => sessionToUser(session))
  .on(signUpFx.doneData, (_, session) => sessionToUser(session))
  .on(authStateChanged, (_, session) => sessionToUser(session))
  .on(signOutFx.done, () => null);

export const $isAuthenticated = $user.map((user) => Boolean(user));

sample({
  clock: checkSession,
  target: checkSessionFx,
});

sample({
  clock: routes.login.opened,
  source: $isAuthenticated,
  filter: (isAuthenticated: boolean) => isAuthenticated,
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: checkSessionFx.doneData,
  filter: (session: Session | null): session is Session => Boolean(session),
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: signInFx.doneData,
  filter: (session: Session | null): session is Session => Boolean(session),
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: signUpFx.doneData,
  filter: (session: Session | null): session is Session => Boolean(session),
  fn: () => undefined,
  target: goHome,
});

sample({
  clock: signOutFx.done,
  fn: () => undefined,
  target: goHome,
});