import type { TileId } from '@gambit/protocol';
import type { WordTile } from '../state';

export const ROWS = 5;
export const COLS = 5;

export const rowOf = (position: number): number => Math.floor(position / COLS);
export const colOf = (position: number): number => position % COLS;

export const tileAtPosition = (tiles: readonly WordTile[], position: number): WordTile | undefined =>
  tiles.find((t) => t.position === position);

export const tileById = (tiles: readonly WordTile[], id: TileId): WordTile => {
  const t = tiles[id];
  if (!t || t.id !== id) {
    const found = tiles.find((x) => x.id === id);
    if (!found) throw new Error(`No tile ${id}`);
    return found;
  }
  return t;
};

/** Ids of the orthogonal neighbours of a tile (by board position). */
export const neighbors4 = (tiles: readonly WordTile[], id: TileId): TileId[] => {
  const t = tileById(tiles, id);
  const r = rowOf(t.position);
  const c = colOf(t.position);
  const out: TileId[] = [];
  const push = (rr: number, cc: number) => {
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return;
    const n = tileAtPosition(tiles, rr * COLS + cc);
    if (n) out.push(n.id);
  };
  push(r - 1, c);
  push(r + 1, c);
  push(r, c - 1);
  push(r, c + 1);
  return out;
};

export const rowTiles = (tiles: readonly WordTile[], row: number): TileId[] =>
  tiles.filter((t) => rowOf(t.position) === row).map((t) => t.id);

/** 2x2 block anchored at the given tile (top-left). Returns [] if the anchor is on the last row/col. */
export const block2x2 = (tiles: readonly WordTile[], anchorId: TileId): TileId[] => {
  const a = tileById(tiles, anchorId);
  const r = rowOf(a.position);
  const c = colOf(a.position);
  if (r >= ROWS - 1 || c >= COLS - 1) return [];
  const ids: TileId[] = [];
  for (const [dr, dc] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const) {
    const t = tileAtPosition(tiles, (r + dr) * COLS + (c + dc));
    if (t) ids.push(t.id);
  }
  return ids;
};

export const unrevealedTiles = (tiles: readonly WordTile[]): WordTile[] => tiles.filter((t) => !t.revealed);
