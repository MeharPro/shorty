import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { SavedExport } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseBrowserConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseBrowserConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return session;
}

export function onSessionChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return { ok: true };
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return { ok: true };
}

export async function signOutCurrentUser(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return { ok: true };
}

export async function persistManifestSnapshot(
  entry: SavedExport
): Promise<{ persisted: boolean; reason?: string }> {
  if (!supabase) {
    return {
      persisted: false,
      reason: 'Supabase browser env vars are not configured.',
    };
  }

  const { error } = await supabase.from('render_jobs').insert({
    id: entry.id,
    headline: entry.headline,
    story_preset: entry.storyPresetId,
    platforms: entry.platforms,
    delivery_urls: entry.deliveryUrls,
    source_public_id: entry.sourcePublicId,
    payload: JSON.parse(entry.payload),
  });

  if (error) {
    return {
      persisted: false,
      reason: error.message,
    };
  }

  return { persisted: true };
}
