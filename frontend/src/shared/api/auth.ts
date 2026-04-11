import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../services/supabaseClient';

export type AuthCredentials = {
  email: string;
  password: string;
};

export type ResetPasswordPayload = {
  email: string;
  redirectTo: string;
};

export type UpdatePasswordPayload = {
  password: string;
};

export type UpdateAccountPayload = {
  email?: string;
  password?: string;
  data?: Record<string, string | null>;
};

export const signUp = async (email: string, password: string): Promise<Session | null> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session ?? null;
};

export const signIn = async (email: string, password: string): Promise<Session | null> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.session ?? null;
};

export const resetPassword = async ({ email, redirectTo }: ResetPasswordPayload): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw error;
  }
};

export const updatePassword = async ({ password }: UpdatePasswordPayload): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw error;
  }
};

export const verifyPassword = async ({ email, password }: AuthCredentials): Promise<void> => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }
};

export const updateAccount = async ({ email, password, data }: UpdateAccountPayload): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
    ...(data ? { data } : {}),
  });

  if (error) {
    throw error;
  }
};

export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
};

export const getSession = async (): Promise<Session | null> => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session ?? null;
};

export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
};