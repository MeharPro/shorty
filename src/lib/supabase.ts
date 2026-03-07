import { createClient } from '@supabase/supabase-js';
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
