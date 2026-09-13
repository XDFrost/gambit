/**
 * Where the game server lives.
 * Empty (default) = same origin as the page: local dev via the Vite proxy, or the Worker
 * serving the SPA itself. Set VITE_API_ORIGIN (e.g. https://gambit.yourname.workers.dev) when the
 * frontend is hosted elsewhere, such as Vercel.
 */
export const API_ORIGIN: string = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ?? '';

export const apiUrl = (path: string): string => `${API_ORIGIN}${path}`;

export const wsUrl = (roomCode: string): string => {
  if (API_ORIGIN) {
    const u = new URL(API_ORIGIN);
    const proto = u.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${u.host}/ws/${roomCode}`;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/${roomCode}`;
};
