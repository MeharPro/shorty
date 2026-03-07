import type { CreatorDraft, ReelHistoryEntry, SavedExport, TranscriptSegment, VideoTranscriptionResponse } from '../types';

const DRAFT_KEY = 'shorty:draft:v1';
const HISTORY_KEY = 'shorty:history:v1';
const LEGACY_DRAFT_KEY = 'yt-shortmaker:draft:v1';
const LEGACY_HISTORY_KEY = 'yt-shortmaker:history:v1';

function reelHistoryKey(userId: string): string {
  return `yt-shortmaker:reels:${userId}:v1`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadDraft(): CreatorDraft | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY) ?? window.localStorage.getItem(LEGACY_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CreatorDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: CreatorDraft): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadExportHistory(): SavedExport[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(HISTORY_KEY) ?? window.localStorage.getItem(LEGACY_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SavedExport[]) : [];
  } catch {
    return [];
  }
}

export function saveExportHistory(history: SavedExport[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
}

export function loadReelHistory(userId: string): ReelHistoryEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(reelHistoryKey(userId));
    return raw ? (JSON.parse(raw) as ReelHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveReelHistory(userId: string, history: ReelHistoryEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(reelHistoryKey(userId), JSON.stringify(history.slice(0, 10)));
}

const UPLOAD_HISTORY_KEY = 'shorty:uploads:v1';

export interface UploadHistoryItem {
  id: string;
  publicId: string;
  secureUrl: string;
  label: string;
  duration?: number;
  thumbnailUrl?: string;
  uploadedAt: string;
}

export function loadUploadHistory(): UploadHistoryItem[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(UPLOAD_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as UploadHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveUploadHistory(history: UploadHistoryItem[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
}

const TRANSCRIPT_KEY_PREFIX = 'shorty:transcript:';

export interface StoredTranscriptData {
  transcript: string;
  segments?: TranscriptSegment[];
  provider?: string;
  model?: string;
  transcriptUrl?: string;
  generatedAt?: string;
}

export function loadTranscriptData(publicId: string): StoredTranscriptData | null {
  if (!canUseStorage() || !publicId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TRANSCRIPT_KEY_PREFIX + publicId);
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
    const fallback = window.localStorage.getItem(TRANSCRIPT_KEY_PREFIX + publicId) || '';
    return fallback.trim() ? { transcript: fallback } : null;
  }
}

export function loadTranscript(publicId: string): string {
  return loadTranscriptData(publicId)?.transcript || '';
}

export function saveTranscriptData(publicId: string, data: StoredTranscriptData | VideoTranscriptionResponse): void {
  if (!canUseStorage() || !publicId) {
    return;
  }

  if (!data.transcript.trim()) {
    window.localStorage.removeItem(TRANSCRIPT_KEY_PREFIX + publicId);
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

  window.localStorage.setItem(TRANSCRIPT_KEY_PREFIX + publicId, JSON.stringify(payload));
}

export function saveTranscript(publicId: string, text: string): void {
  if (!canUseStorage() || !publicId) {
    return;
  }

  if (text.trim()) {
    const existing = loadTranscriptData(publicId);
    window.localStorage.setItem(
      TRANSCRIPT_KEY_PREFIX + publicId,
      JSON.stringify({
        ...(existing ?? {}),
        transcript: text,
      })
    );
  } else {
    window.localStorage.removeItem(TRANSCRIPT_KEY_PREFIX + publicId);
  }
}
