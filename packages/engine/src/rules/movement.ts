import { edgeKey } from '../hex/edge';
import type { GameState, PlayerId } from '../state/game';
import { mapGrid, type EdgeFeature, type GameMap } from '../state/map';

/**
 * Movement graph (GDD 3.2, 6.4): units move freely within their owner's tiles that are
 * connected in this graph, and one step beyond. A river edge cuts it; a ford connects.
 * Bridges (connect) and fences/walls/gates (cut; gates open for their owner) join in M5.
 * Derived data: computed from ownership and edges, never stored.
 */
export function edgeAllowsMovement(feature: EdgeFeature | undefined): boolean {
  return feature?.kind !== 'river';
}

/** True if a unit can step between two adjacent tiles (ignoring ownership). */
export function movementLinked(map: GameMap, a: number, b: number): boolean {
  return edgeAllowsMovement(map.edges[edgeKey(a, b)]);
}

/**
 * The tiles a unit on `tile` moves among freely: the tile's owner's tiles connected to it
 * in the movement graph, `tile` included, ascending. Empty for a neutral tile.
 */
export function movementArea(state: Pick<GameState, 'map' | 'owners'>, tile: number): number[] {
  const owner = state.owners[tile] ?? null;
  if (owner === null) return [];
  const grid = mapGrid(state.map);
  const seen = new Set([tile]);
  const area = [tile];
  // Breadth-first: the array iterator also visits entries pushed during the loop.
  for (const t of area) {
    for (const n of grid.neighbors(t)) {
      if (seen.has(n) || state.owners[n] !== owner || !movementLinked(state.map, t, n)) continue;
      seen.add(n);
      area.push(n);
    }
  }
  return area.sort((a, b) => a - b);
}

/**
 * Tiles next to `area` that are not `player`'s, ascending. `linked`: reachable in one step
 * through the movement graph; `blocked`: adjacent only across cutting edges (rivers).
 */
export function tilesAround(
  state: Pick<GameState, 'map' | 'owners'>,
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
      if (movementLinked(state.map, t, n)) linked.add(n);
    }
  }
  const ascending = (a: number, b: number) => a - b;
  return {
    linked: [...linked].sort(ascending),
    blocked: [...adjacent].filter((t) => !linked.has(t)).sort(ascending),
  };
}
