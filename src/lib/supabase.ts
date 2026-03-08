import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { BrainrotHistoryEntry, ReelHistoryEntry, SavedExport } from '../types';

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

type EmailAuthResult =
  | { ok: true; session: Session | null }
  | { ok: false; message: string };

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<EmailAuthResult> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const trimmedDisplayName = displayName?.trim();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: trimmedDisplayName
      ? {
          data: {
            display_name: trimmedDisplayName,
            name: trimmedDisplayName,
          },
        }
      : undefined,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    session: data.session,
  };
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<EmailAuthResult> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    session: data.session,
  };
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

export async function persistReelHistoryEntry(
  userId: string,
  entry: ReelHistoryEntry
): Promise<{ persisted: boolean; reason?: string }> {
  if (!supabase) {
    return {
      persisted: false,
      reason: 'Supabase browser env vars are not configured.',
    };
  }

  const { error } = await supabase.from('reel_generations').upsert({
    id: entry.id,
    user_id: userId,
    source_label: entry.sourceLabel,
    recommended_clip_id: entry.recommendedClipId,
    payload: entry.result,
    created_at: entry.createdAt,
  });

  if (error) {
    return {
      persisted: false,
      reason: error.message,
    };
  }

  return { persisted: true };
}

export async function fetchReelHistory(
  userId: string
): Promise<{ ok: true; entries: ReelHistoryEntry[] } | { ok: false; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { data, error } = await supabase
    .from('reel_generations')
    .select('id, created_at, source_label, recommended_clip_id, payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    entries: (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      sourceLabel: row.source_label,
      recommendedClipId: row.recommended_clip_id,
      result: row.payload as ReelHistoryEntry['result'],
    })),
  };
}

export async function persistBrainrotHistoryEntry(
  userId: string,
  entry: BrainrotHistoryEntry
): Promise<{ persisted: boolean; reason?: string }> {
  if (!supabase) {
    return {
      persisted: false,
      reason: 'Supabase browser env vars are not configured.',
    };
  }

  const primaryRender = entry.renders[0] ?? null;
  const { error } = await supabase.from('brainrot_generations').upsert({
    id: entry.id,
    user_id: userId,
    prompt: entry.prompt,
    script_guidance: entry.scriptGuidance,
    template_id: entry.templateId,
    brainrot_type: entry.brainrotType,
    selected_voice_id: entry.selectedVoiceId,
    selected_gameplay_preset_id: entry.selectedGameplayPresetId,
    selected_caption_preset_id: entry.selectedCaptionPresetId,
    gameplay_start_offset: entry.gameplayStartOffset,
    target_duration_seconds: entry.targetDurationSeconds,
    render_count: entry.renders.length,
    primary_render_title: primaryRender?.script.title ?? null,
    primary_delivery_url: primaryRender?.deliveryUrl ?? null,
    payload: entry,
    run_signature: entry.runSignature,
    created_at: entry.createdAt,
  });

  if (error) {
    return {
      persisted: false,
      reason: error.message,
    };
  }

  return { persisted: true };
}

export async function fetchBrainrotHistory(
  userId: string
): Promise<{ ok: true; entries: BrainrotHistoryEntry[] } | { ok: false; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase browser env vars are not configured.',
    };
  }

  const { data, error } = await supabase
    .from('brainrot_generations')
    .select('id, payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    entries: (data ?? [])
      .map((row) => row.payload as BrainrotHistoryEntry | null)
      .filter((entry): entry is BrainrotHistoryEntry => Boolean(entry?.id)),
  };
}
