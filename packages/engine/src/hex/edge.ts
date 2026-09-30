import type { HexGrid } from './grid';

/**
 * Key of a hex edge (the side shared by two adjacent tiles): the ordered pair of tile
 * indices, smaller first. A string so it can key plain JSON objects in game state,
 * e.g. `"12_13"`.
 */
export type EdgeKey = `${number}_${number}`;

export function edgeKey(a: number, b: number): EdgeKey {
  if (a === b) throw new RangeError(`An edge needs two different tiles (got ${a} twice)`);
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** The two tiles of an edge, smaller index first. */
export function edgeTiles(key: EdgeKey): readonly [number, number] {
  const separator = key.indexOf('_');
  return [Number(key.slice(0, separator)), Number(key.slice(separator + 1))];
}

/** Every edge between two on-map tiles, each once, in a deterministic order. */
export function gridEdges(grid: HexGrid): EdgeKey[] {
  const keys: EdgeKey[] = [];
  for (let a = 0; a < grid.tileCount; a++) {
    for (const b of grid.neighbors(a)) if (a < b) keys.push(edgeKey(a, b));
  }
  return keys;
}
