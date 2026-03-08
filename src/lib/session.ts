import type { User } from '@supabase/supabase-js';

export interface ShortySession {
  name: string;
  username: string;
  userKey: string;
  userId?: string;
}

const SESSION_KEY = 'shorty.session';

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return undefined;
}

function usernameFromEmail(email?: string | null): string | undefined {
  const trimmedEmail = email?.trim().toLowerCase();
  if (!trimmedEmail) {
    return undefined;
  }

  const [localPart] = trimmedEmail.split('@');
  return localPart || trimmedEmail;
}

export function createShortySession(
  username: string,
  preferredName?: string,
  userId?: string,
  userKeyOverride?: string
): ShortySession {
  const trimmedUsername = username.trim();
  const fallbackName = trimmedUsername || 'Creator';
  const userKeySource = userKeyOverride?.trim() || trimmedUsername;

  return {
    name: preferredName?.trim() || fallbackName,
    username: trimmedUsername,
    userKey: normalizeUsername(userKeySource),
    userId: userId?.trim() || undefined,
  };
}

export function createShortySessionFromAuthUser(
  user: Pick<User, 'id' | 'email' | 'user_metadata'>
): ShortySession {
  const metadata =
    user.user_metadata && typeof user.user_metadata === 'object'
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const email = user.email?.trim().toLowerCase();
  const username =
    firstNonEmptyString(metadata.username, usernameFromEmail(email), user.id.slice(0, 8)) ||
    'creator';
  const displayName =
    firstNonEmptyString(
      metadata.display_name,
      metadata.name,
      metadata.full_name,
      usernameFromEmail(email),
      username
    ) || 'Creator';

  return createShortySession(username, displayName, user.id, email || user.id);
}

export function loadSession(): ShortySession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ShortySession & { email?: string };

    if (typeof parsed.username === 'string' && typeof parsed.userKey === 'string') {
      return parsed;
    }

    if (typeof parsed.username === 'string') {
      return createShortySession(parsed.username, parsed.name, parsed.userId);
    }

    if (typeof parsed.email === 'string') {
      return createShortySession(parsed.email, parsed.name, parsed.userId);
    }

    window.localStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: ShortySession): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}
