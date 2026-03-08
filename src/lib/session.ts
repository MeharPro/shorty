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

export function createShortySession(
  username: string,
  preferredName?: string,
  userId?: string
): ShortySession {
  const trimmedUsername = username.trim();
  const fallbackName = trimmedUsername || 'Creator';

  return {
    name: preferredName?.trim() || fallbackName,
    username: trimmedUsername,
    userKey: normalizeUsername(trimmedUsername),
    userId: userId?.trim() || undefined,
  };
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
