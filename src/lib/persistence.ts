import type {
  CreatorDraft,
  ReelHistoryEntry,
  SavedExport,
  TranscriptSegment,
  VideoTranscriptionResponse,
} from '../types';

const GUEST_WORKSPACE_KEY = 'guest';
const DRAFT_KEY_PREFIX = 'shorty:draft';
const HISTORY_KEY_PREFIX = 'shorty:history';
const REEL_HISTORY_KEY_PREFIX = 'shorty:reels';
const UPLOAD_HISTORY_KEY_PREFIX = 'shorty:uploads';
const TRANSCRIPT_KEY_PREFIX = 'shorty:transcript';
const LEGACY_SHORTY_DRAFT_KEY = 'shorty:draft:v1';
const LEGACY_SHORTY_HISTORY_KEY = 'shorty:history:v1';
const LEGACY_UPLOAD_HISTORY_KEY = 'shorty:uploads:v1';
const LEGACY_DRAFT_KEY = 'yt-shortmaker:draft:v1';
const LEGACY_HISTORY_KEY = 'yt-shortmaker:history:v1';

function workspaceKey(userKey?: string): string {
  const trimmed = userKey?.trim().toLowerCase();
  return trimmed || GUEST_WORKSPACE_KEY;
}

function draftKey(userKey?: string): string {
  return `${DRAFT_KEY_PREFIX}:${workspaceKey(userKey)}:v1`;
}

function exportHistoryKey(userKey?: string): string {
  return `${HISTORY_KEY_PREFIX}:${workspaceKey(userKey)}:v1`;
}

function reelHistoryKey(userKey?: string): string {
  return `${REEL_HISTORY_KEY_PREFIX}:${workspaceKey(userKey)}:v1`;
}

function uploadHistoryKey(userKey?: string): string {
  return `${UPLOAD_HISTORY_KEY_PREFIX}:${workspaceKey(userKey)}:v1`;
}

function transcriptStorageKey(userKey: string | undefined, publicId: string): string {
  return `${TRANSCRIPT_KEY_PREFIX}:${workspaceKey(userKey)}:${publicId}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function guestFallback<T>(userKey: string | undefined, resolver: () => T): T | null {
  return workspaceKey(userKey) === GUEST_WORKSPACE_KEY ? resolver() : null;
}

export function loadDraft(userKey?: string): CreatorDraft | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(draftKey(userKey)) ??
      guestFallback(userKey, () =>
        window.localStorage.getItem(LEGACY_SHORTY_DRAFT_KEY) ??
        window.localStorage.getItem(LEGACY_DRAFT_KEY)
      );
    return raw ? (JSON.parse(raw) as CreatorDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: CreatorDraft, userKey?: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(draftKey(userKey), JSON.stringify(draft));
}

export function loadExportHistory(userKey?: string): SavedExport[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(exportHistoryKey(userKey)) ??
      guestFallback(userKey, () =>
        window.localStorage.getItem(LEGACY_SHORTY_HISTORY_KEY) ??
        window.localStorage.getItem(LEGACY_HISTORY_KEY)
      );
    return raw ? (JSON.parse(raw) as SavedExport[]) : [];
  } catch {
    return [];
  }
}

export function saveExportHistory(history: SavedExport[], userKey?: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(exportHistoryKey(userKey), JSON.stringify(history.slice(0, 6)));
}

export function loadReelHistory(userKey?: string): ReelHistoryEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(reelHistoryKey(userKey));
    return raw ? (JSON.parse(raw) as ReelHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveReelHistory(userKey: string | undefined, history: ReelHistoryEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(reelHistoryKey(userKey), JSON.stringify(history.slice(0, 10)));
}

export interface UploadHistoryItem {
  id: string;
  publicId: string;
  secureUrl: string;
  label: string;
  duration?: number;
  thumbnailUrl?: string;
  uploadedAt: string;
}

export function loadUploadHistory(userKey?: string): UploadHistoryItem[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(uploadHistoryKey(userKey)) ??
      guestFallback(userKey, () => window.localStorage.getItem(LEGACY_UPLOAD_HISTORY_KEY));
    return raw ? (JSON.parse(raw) as UploadHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveUploadHistory(history: UploadHistoryItem[], userKey?: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(uploadHistoryKey(userKey), JSON.stringify(history.slice(0, 10)));
}

export interface StoredTranscriptData {
  transcript: string;
  segments?: TranscriptSegment[];
  provider?: string;
  model?: string;
  transcriptUrl?: string;
  generatedAt?: string;
}

function resolveTranscriptArgs(
  userKeyOrPublicId: string,
  maybePublicId?: string
): { userKey: string | undefined; publicId: string } {
  if (typeof maybePublicId === 'string') {
    return {
      userKey: userKeyOrPublicId,
      publicId: maybePublicId,
    };
  }

  return {
    userKey: undefined,
    publicId: userKeyOrPublicId,
  };
}

export function loadTranscriptData(
  userKeyOrPublicId: string,
  maybePublicId?: string
): StoredTranscriptData | null {
  const { userKey, publicId } = resolveTranscriptArgs(userKeyOrPublicId, maybePublicId);

  if (!canUseStorage() || !publicId) {
    return null;
  }

  const scopedKey = transcriptStorageKey(userKey, publicId);
  const fallbackKey = `${TRANSCRIPT_KEY_PREFIX}:${publicId}`;

  try {
    const raw =
      window.localStorage.getItem(scopedKey) ??
      guestFallback(userKey, () => window.localStorage.getItem(fallbackKey));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredTranscriptData | string;
    if (typeof parsed === 'string') {
      return parsed.trim() ? { transcript: parsed } : null;
    }

    if (!parsed || typeof parsed.transcript !== 'string') {
      return null;
    }

    return parsed;
  } catch {
    const fallback =
      window.localStorage.getItem(scopedKey) ||
      guestFallback(userKey, () => window.localStorage.getItem(fallbackKey)) ||
      '';
    return fallback.trim() ? { transcript: fallback } : null;
  }
}

export function loadTranscript(userKeyOrPublicId: string, maybePublicId?: string): string {
  return loadTranscriptData(userKeyOrPublicId, maybePublicId)?.transcript || '';
}

export function saveTranscriptData(
  userKeyOrPublicId: string,
  publicIdOrData: string | StoredTranscriptData | VideoTranscriptionResponse,
  maybeData?: StoredTranscriptData | VideoTranscriptionResponse
): void {
  const { userKey, publicId } =
    typeof publicIdOrData === 'string'
      ? resolveTranscriptArgs(userKeyOrPublicId, publicIdOrData)
      : resolveTranscriptArgs(userKeyOrPublicId);
  const data =
    typeof publicIdOrData === 'string'
      ? maybeData
      : (publicIdOrData as StoredTranscriptData | VideoTranscriptionResponse);

  if (!canUseStorage() || !publicId || !data) {
    return;
  }

  if (!data.transcript.trim()) {
    window.localStorage.removeItem(transcriptStorageKey(userKey, publicId));
    return;
  }

  const payload: StoredTranscriptData = {
    transcript: data.transcript,
    segments: data.segments,
    provider: data.provider,
    model: data.model,
    transcriptUrl: data.transcriptUrl,
    generatedAt: data.generatedAt,
  };

  window.localStorage.setItem(
    transcriptStorageKey(userKey, publicId),
    JSON.stringify(payload)
  );
}

export function saveTranscript(
  userKeyOrPublicId: string,
  publicIdOrText: string,
  maybeText?: string
): void {
  const { userKey, publicId } =
    typeof maybeText === 'string'
      ? resolveTranscriptArgs(userKeyOrPublicId, publicIdOrText)
      : resolveTranscriptArgs(userKeyOrPublicId);
  const text = typeof maybeText === 'string' ? maybeText : publicIdOrText;

  if (!canUseStorage() || !publicId) {
    return;
  }

  if (text.trim()) {
    const existing = loadTranscriptData(userKey ?? '', publicId);
    window.localStorage.setItem(
      transcriptStorageKey(userKey, publicId),
      JSON.stringify({
        ...(existing ?? {}),
        transcript: text,
      })
    );
  } else {
    window.localStorage.removeItem(transcriptStorageKey(userKey, publicId));
  }
}
