/**
 * Minimal key/value contract the room needs. Implemented by Durable Object storage in
 * production and by an in-memory map in tests and the local dev server.
 */
export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string[]): Promise<void>;
  list<T>(prefix: string, opts?: { start?: string; limit?: number }): Promise<Map<string, T>>;
  deleteAll(): Promise<void>;
}

export class MemoryRoomStorage implements RoomStorage {
  readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.map.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put(entries: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, structuredClone(v));
  }
  async delete(keys: string[]): Promise<void> {
    for (const k of keys) this.map.delete(k);
  }
  async list<T>(prefix: string, opts: { start?: string; limit?: number } = {}): Promise<Map<string, T>> {
    const keys = [...this.map.keys()].filter((k) => k.startsWith(prefix) && (!opts.start || k >= opts.start)).sort();
    const out = new Map<string, T>();
    for (const k of keys.slice(0, opts.limit ?? keys.length)) out.set(k, structuredClone(this.map.get(k)) as T);
    return out;
  }
  async deleteAll(): Promise<void> {
    this.map.clear();
  }
}

/** Storage keys used by RoomCore. */
export const KEYS = {
  state: 'state',
  meta: 'meta',
  event: (seq: number) => `ev:${String(seq).padStart(8, '0')}`,
  session: (token: string) => `sess:${token}`,
} as const;
