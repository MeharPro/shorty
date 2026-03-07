import type { CreatorDraft, SavedExport } from '../types';

const DRAFT_KEY = 'shorty:draft:v1';
const HISTORY_KEY = 'shorty:history:v1';
const LEGACY_DRAFT_KEY = 'yt-shortmaker:draft:v1';
const LEGACY_HISTORY_KEY = 'yt-shortmaker:history:v1';

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
