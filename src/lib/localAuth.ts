import {
  createShortySession,
  normalizeUsername,
  type ShortySession,
} from './session';

const USERS_KEY = 'shorty:auth:users:v1';

interface StoredLocalUser {
  username: string;
  userKey: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadUsers(): StoredLocalUser[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredLocalUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredLocalUser[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function fallbackHash(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return `fallback-${Math.abs(hash)}`;
}

async function hashPassword(password: string): Promise<string> {
  if (
    typeof window === 'undefined' ||
    typeof window.crypto === 'undefined' ||
    typeof window.crypto.subtle === 'undefined'
  ) {
    return fallbackHash(password);
  }

  const buffer = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password)
  );

  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    return 'Username must be between 3 and 24 characters.';
  }

  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(trimmed)) {
    return 'Use letters, numbers, dots, dashes, or underscores for the username.';
  }

  return null;
}

function validatePassword(password: string): string | null {
  if (password.trim().length < 6) {
    return 'Password must be at least 6 characters.';
  }

  return null;
}

export async function signUpWithUsername(
  username: string,
  password: string,
  preferredName?: string
): Promise<{ ok: true; session: ShortySession } | { ok: false; message: string }> {
  const usernameError = validateUsername(username);
  if (usernameError) {
    return { ok: false, message: usernameError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, message: passwordError };
  }

  const userKey = normalizeUsername(username);
  const existingUsers = loadUsers();
  if (existingUsers.some((user) => user.userKey === userKey)) {
    return { ok: false, message: 'That username is already taken.' };
  }

  const nextUser: StoredLocalUser = {
    username: username.trim(),
    userKey,
    name: preferredName?.trim() || username.trim(),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  saveUsers([...existingUsers, nextUser]);

  return {
    ok: true,
    session: createShortySession(nextUser.username, nextUser.name),
  };
}

export async function signInWithUsername(
  username: string,
  password: string
): Promise<{ ok: true; session: ShortySession } | { ok: false; message: string }> {
  const trimmedUsername = username.trim();
  if (!trimmedUsername || !password.trim()) {
    return { ok: false, message: 'Username and password are required.' };
  }

  const userKey = normalizeUsername(trimmedUsername);
  const existingUser = loadUsers().find((user) => user.userKey === userKey);

  if (!existingUser) {
    return { ok: false, message: 'Username not found.' };
  }

  const passwordHash = await hashPassword(password);
  if (existingUser.passwordHash !== passwordHash) {
    return { ok: false, message: 'Incorrect password.' };
  }

  return {
    ok: true,
    session: createShortySession(existingUser.username, existingUser.name),
  };
}
