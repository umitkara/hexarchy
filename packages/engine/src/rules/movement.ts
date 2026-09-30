import type { GameState, PlayerId } from '../state/game';
import { mapGrid } from '../state/map';
import { openRiver, structureAt, type EdgeState } from './edgeState';

/**
 * Movement graph (GDD 3.2, 6.4): units move freely within their owner's tiles that are
 * connected in this graph, and step beyond it. A river cuts it unless bridged; a ford
 * connects. Fences and walls cut it for everyone, their builder included; a gate is open
 * to its owner only. Derived data: computed from ownership and edges, never stored.
 */

/** True if a unit of `player` can step between two adjacent tiles (ignoring ownership). */
export function movementLinked(state: EdgeState, a: number, b: number, player: PlayerId): boolean {
  if (openRiver(state, a, b)) return false;
  const structure = structureAt(state, a, b);
  switch (structure?.kind) {
    case undefined:
    case 'bridge':
      return true;
    case 'fence':
    case 'wall':
      return false;
    case 'gate':
      return structure.owner === player;
  }
}

/**
 * The tiles a unit on `tile` moves among freely: the tile's owner's tiles connected to it
 * in the movement graph, `tile` included, ascending. Empty for a neutral tile.
 */
export function movementArea(
  state: Pick<GameState, 'map' | 'owners' | 'edgeStructures'>,
  tile: number,
): number[] {
  const owner = state.owners[tile] ?? null;
  if (owner === null) return [];
  const grid = mapGrid(state.map);
  const seen = new Set([tile]);
  const area = [tile];
  // Breadth-first: the array iterator also visits entries pushed during the loop.
  for (const t of area) {
    for (const n of grid.neighbors(t)) {
      if (seen.has(n) || state.owners[n] !== owner || !movementLinked(state, t, n, owner)) continue;
      seen.add(n);
      area.push(n);
    }
  }
  return area.sort((a, b) => a - b);
}

/**
 * Tiles next to `area` that are not `player`'s, ascending. `linked`: reachable in one step
 * through `player`'s movement graph; `blocked`: adjacent only across cutting edges.
 */
export function tilesAround(
  state: Pick<GameState, 'map' | 'owners' | 'edgeStructures'>,
  area: readonly number[],
  player: PlayerId,
): { readonly linked: number[]; readonly blocked: number[] } {
  const grid = mapGrid(state.map);
  const inArea = new Set(area);
  const linked = new Set<number>();
  const adjacent = new Set<number>();
  for (const t of area) {
    for (const n of grid.neighbors(t)) {
      if (inArea.has(n) || state.owners[n] === player) continue;
      adjacent.add(n);
      if (movementLinked(state, t, n, player)) linked.add(n);
    }
  }
  const ascending = (a: number, b: number) => a - b;
  return {
    linked: [...linked].sort(ascending),
    blocked: [...adjacent].filter((t) => !linked.has(t)).sort(ascending),
  };
}
