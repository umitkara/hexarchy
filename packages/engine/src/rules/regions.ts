import { isDraft } from 'immer';
import { axialToPixel } from '../hex/layout';
import type { GameState, PlayerId } from '../state/game';
import { mapGrid } from '../state/map';
import type { EdgeState } from './edgeState';
import { treasuryLinked } from './treasuryGraph';

/**
 * Regions (GDD 4.2): connected components of one player's tiles in the treasury graph.
 * Derived data: always computed from ownership and edges (rivers, bridges), never stored.
 */

export interface Region {
  /** Index into `RegionMap.regions`; only stable for one ownership snapshot. */
  readonly id: number;
  readonly owner: PlayerId;
  /** Tile indices, ascending. */
  readonly tiles: readonly number[];
}

export interface RegionMap {
  /** Ordered by their smallest tile index. */
  readonly regions: readonly Region[];
  /** Region id of every tile, or NO_REGION for neutral tiles. */
  readonly regionOf: Int32Array;
}

export const NO_REGION = -1;

export function computeRegions(edges: EdgeState, owners: readonly (PlayerId | null)[]): RegionMap {
  const grid = mapGrid(edges.map);
  const regionOf = new Int32Array(grid.tileCount).fill(NO_REGION);
  const regions: Region[] = [];
  for (let start = 0; start < grid.tileCount; start++) {
    const owner = owners[start] ?? null;
    if (owner === null || regionOf[start] !== NO_REGION) continue;
    const id = regions.length;
    regionOf[start] = id;
    const tiles = [start];
    // Breadth-first: the array iterator also visits entries pushed during the loop.
    for (const tile of tiles) {
      for (const n of grid.neighbors(tile)) {
        if (regionOf[n] !== NO_REGION || owners[n] !== owner) continue;
        if (!treasuryLinked(edges, tile, n)) continue;
        regionOf[n] = id;
        tiles.push(n);
      }
    }
    regions.push({ id, owner, tiles: tiles.sort((a, b) => a - b) });
  }
  return { regions, regionOf };
}

const regionCache = new WeakMap<
  readonly (PlayerId | null)[],
  {
    readonly edges: GameState['map']['edges'];
    readonly structures: GameState['edgeStructures'];
    readonly regions: RegionMap;
  }
>();

/**
 * Regions of a state, memoized per ownership and edge snapshot. Immutable states share the
 * `owners` array until ownership changes, so repeated lookups (UI, AI) are free.
 */
export function getRegions(state: Pick<GameState, 'map' | 'owners' | 'edgeStructures'>): RegionMap {
  if (isDraft(state.owners) || isDraft(state.edgeStructures)) {
    return computeRegions(state, state.owners);
  }
  const cached = regionCache.get(state.owners);
  if (cached?.edges === state.map.edges && cached.structures === state.edgeStructures) {
    return cached.regions;
  }
  const regions = computeRegions(state, state.owners);
  regionCache.set(state.owners, {
    edges: state.map.edges,
    structures: state.edgeStructures,
    regions,
  });
  return regions;
}

export function regionAt(regionMap: RegionMap, tile: number): Region | undefined {
  const id = regionMap.regionOf[tile];
  return id === undefined || id === NO_REGION ? undefined : regionMap.regions[id];
}

/** The center tile of a region, if it has one. */
export function regionCenter(
  state: Pick<GameState, 'centers'>,
  region: Region,
): number | undefined {
  return region.tiles.find((tile) => state.centers[tile] !== undefined);
}

/**
 * The most sheltered tile of a region, where an automatic local center is founded: the
 * one farthest (in steps through the region) from the region's edge. Ties go to the tile
 * nearest the region's middle, then to the lowest index. Deterministic, no RNG.
 */
export function innermostTile(edges: EdgeState, regionMap: RegionMap, region: Region): number {
  const grid = mapGrid(edges.map);
  const inRegion = (tile: number) => regionMap.regionOf[tile] === region.id;
  const linked = (a: number, b: number) => inRegion(b) && treasuryLinked(edges, a, b);

  // Edge tiles have a side that does not lead into the region: off-map, another owner,
  // neutral, water or a cut edge. Depth = steps from the nearest edge tile.
  const depth = new Map<number, number>();
  const queue: number[] = [];
  for (const tile of region.tiles) {
    const neighbors = grid.neighbors(tile);
    if (neighbors.length < 6 || neighbors.some((n) => !linked(tile, n))) {
      depth.set(tile, 0);
      queue.push(tile);
    }
  }
  for (const tile of queue) {
    const d = depth.get(tile) ?? 0;
    for (const n of grid.neighbors(tile)) {
      if (!depth.has(n) && linked(tile, n)) {
        depth.set(n, d + 1);
        queue.push(n);
      }
    }
  }

  let mx = 0;
  let my = 0;
  for (const tile of region.tiles) {
    const p = axialToPixel(grid.coord(tile), 1);
    mx += p.x;
    my += p.y;
  }
  mx /= region.tiles.length;
  my /= region.tiles.length;
  const spread = (tile: number) => {
    const p = axialToPixel(grid.coord(tile), 1);
    return (p.x - mx) ** 2 + (p.y - my) ** 2;
  };

  let best = region.tiles[0] ?? 0;
  for (const tile of region.tiles) {
    const dt = depth.get(tile) ?? 0;
    const db = depth.get(best) ?? 0;
    // Tiles are ascending, so on a full tie the earlier (lower index) one stays.
    if (dt > db || (dt === db && spread(tile) < spread(best) - 1e-9)) best = tile;
  }
  return best;
}
