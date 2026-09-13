export interface StoredSession {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
}

const key = (code: string) => `gambit.session.${code}`;
const PENDING = 'gambit.pendingNickname';

/** Session storage wins (same tab reload); local storage is the fallback offered as "rejoin as". */
export const loadSession = (code: string): { active: StoredSession | null; remembered: StoredSession | null } => {
  let active: StoredSession | null = null;
  let remembered: StoredSession | null = null;
  try {
    const s = sessionStorage.getItem(key(code));
    if (s) active = JSON.parse(s) as StoredSession;
  } catch {
    /* ignore */
  }
  try {
    const l = localStorage.getItem(key(code));
    if (l) remembered = JSON.parse(l) as StoredSession;
  } catch {
    /* ignore */
  }
  return { active, remembered };
};

export const saveSession = (s: StoredSession): void => {
  const v = JSON.stringify(s);
  try {
    sessionStorage.setItem(key(s.roomCode), v);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(key(s.roomCode), v);
  } catch {
    /* ignore */
  }
};

export const activateSession = (s: StoredSession): void => {
  try {
    sessionStorage.setItem(key(s.roomCode), JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

export const clearSession = (code: string): void => {
  try {
    sessionStorage.removeItem(key(code));
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
};

export const setPendingNickname = (nick: string): void => {
  try {
    sessionStorage.setItem(PENDING, nick);
  } catch {
    /* ignore */
  }
};

export const peekPendingNickname = (): string | null => {
  try {
    return sessionStorage.getItem(PENDING);
  } catch {
    return null;
  }
};

export const takePendingNickname = (): string | null => {
  try {
    const v = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return v;
  } catch {
    return null;
  }
};
