import { MAP_GEN, START } from '../balance';
import type { HexGrid } from '../hex/grid';
import { Rng } from '../rng';
import { treasuryLinked } from '../rules/treasuryGraph';
import { isOwnable, isWater, mapGrid, type GameMap, type Terrain, type Tile } from '../state/map';

/**
 * Fair start placement (GDD 3.3).
 *
 * 1. Candidates: plains tiles of the largest land area (ownable tiles linked by land) whose
 *    starting territory (the capital plus the nearest tiles linked to it in the treasury
 *    graph) is complete and compact, with enough land around.
 * 2. Placement: random restarts of a spread-out search (farthest-point sampling); the best
 *    set maximizes the minimum capital distance minus the spread of water and land counts
 *    within the fair radius.
 * 3. Equalization: within the fair radius of each capital, plains are converted to or
 *    from forests and hills (and ore veins moved between hills) until every start has the
 *    same counts — separately for the starting territory and the ring around it, so the
 *    starting income matches too. Water and mountains are never changed.
 */

export interface StartPlacement {
  /** The map after equalization. */
  readonly map: GameMap;
  /** Capital tiles, one per player. */
  readonly starts: readonly number[];
}

/**
 * The starting territory of a capital: the capital, then the nearest ownable tiles
 * reached through the treasury graph (breadth-first, neighbors in direction order), so
 * the territory is one connected region. Shorter than requested if the area is cut off.
 */
export function startTerritory(map: GameMap, capital: number, size: number): number[] {
  const grid = mapGrid(map);
  const territory = [capital];
  const seen = new Set(territory);
  for (const tile of territory) {
    for (const n of grid.neighbors(tile)) {
      if (territory.length >= size) return territory;
      if (seen.has(n) || !ownable(map, n) || !treasuryLinked({ map, edgeStructures: {} }, tile, n))
        continue;
      seen.add(n);
      territory.push(n);
    }
  }
  return territory;
}

function ownable(map: GameMap, tile: number): boolean {
  const t = map.tiles[tile];
  return t !== undefined && isOwnable(t.terrain);
}

/**
 * The largest set of ownable tiles linked by land (rivers can be bridged, mountains and
 * water cannot be crossed): starts elsewhere could never be reached by the others.
 */
function largestLandArea(map: GameMap, grid: HexGrid): Set<number> {
  const seen = new Uint8Array(grid.tileCount);
  let largest: number[] = [];
  for (let start = 0; start < grid.tileCount; start++) {
    if (seen[start] || !ownable(map, start)) continue;
    seen[start] = 1;
    const area = [start];
    for (const tile of area) {
      for (const n of grid.neighbors(tile)) {
        if (seen[n] || !ownable(map, n)) continue;
        seen[n] = 1;
        area.push(n);
      }
    }
    if (area.length > largest.length) largest = area;
  }
  return new Set(largest);
}

function within(grid: HexGrid, center: number, radius: number): number[] {
  const tiles: number[] = [];
  for (let i = 0; i < grid.tileCount; i++) if (grid.distance(center, i) <= radius) tiles.push(i);
  return tiles;
}

interface Area {
  readonly capital: number;
  /** Starting territory without the capital. */
  readonly territory: readonly number[];
  /** The rest of the fair radius. */
  readonly ring: readonly number[];
  /** Water and ownable land tiles within the fair radius. */
  readonly water: number;
  readonly land: number;
}

export function placeStarts(map: GameMap, count: number, seed: number): StartPlacement {
  const cfg = MAP_GEN.starts;
  const grid = mapGrid(map);
  const rng = Rng.fromSeed(seed);

  const mainland = largestLandArea(map, grid);
  const areas = new Map<number, Area>();
  for (let tile = 0; tile < grid.tileCount; tile++) {
    if (map.tiles[tile]?.terrain !== 'plains' || !mainland.has(tile)) continue;
    const territory = startTerritory(map, tile, START.territoryTiles);
    if (territory.length < START.territoryTiles) continue;
    if (territory.some((t) => grid.distance(tile, t) > cfg.territoryRadius)) continue;
    const disk = within(grid, tile, cfg.fairRadius);
    const land = disk.filter((t) => ownable(map, t)).length;
    if (land < cfg.minLand) continue;
    const inTerritory = new Set(territory);
    areas.set(tile, {
      capital: tile,
      territory: territory.slice(1),
      ring: disk.filter((t) => !inTerritory.has(t)),
      water: disk.filter((t) => isWater(map.tiles[t]?.terrain ?? 'sea')).length,
      land,
    });
  }
  const candidates = [...areas.keys()];
  if (candidates.length < count) {
    throw new Error(`Map ${map.seed}: only ${candidates.length} start candidates for ${count}`);
  }

  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

  let best: { starts: number[]; score: number } | undefined;
  for (let attempt = 0; attempt < cfg.attempts; attempt++) {
    const starts = [rng.pick(candidates)];
    while (starts.length < count) {
      const gap = (t: number) => Math.min(...starts.map((s) => grid.distance(s, t)));
      const far = Math.max(...candidates.map(gap));
      // Any candidate nearly as far as the farthest: keeps restarts varied.
      starts.push(rng.pick(candidates.filter((t) => gap(t) >= far - 1)));
    }
    let minGap = Infinity;
    for (const a of starts) {
      for (const b of starts) if (a < b) minGap = Math.min(minGap, grid.distance(a, b));
    }
    if (minGap < cfg.minSpacing) continue;
    const c = starts.map((s) => areas.get(s) ?? { water: 0, land: 0 });
    const score =
      minGap -
      cfg.waterWeight * spread(c.map((x) => x.water)) -
      cfg.landWeight * spread(c.map((x) => x.land));
    if (!best || score > best.score) best = { starts, score };
  }
  if (!best) throw new Error(`Map ${map.seed}: no start placement with enough spacing`);

  // Player order follows tile order, so it does not depend on the search path.
  const starts = best.starts.sort((a, b) => a - b);
  const tiles = map.tiles.map((t) => ({ ...t }));
  const chosen = starts.map((s) => areas.get(s)).filter((a) => a !== undefined);
  equalize(
    grid,
    tiles,
    rng,
    chosen.map((a) => a.territory),
    { forest: cfg.minTerritoryForests },
  );
  equalize(
    grid,
    tiles,
    rng,
    chosen.map((a) => a.ring),
  );
  equalizeVeins(
    tiles,
    rng,
    chosen.map((a) => [...a.territory, ...a.ring]),
  );
  return { map: { ...map, tiles }, starts };
}

type MutableTile = { -readonly [K in keyof Tile]: Tile[K] };

/**
 * Brings the forest and hill counts of every zone to the (rounded) mean, via plains; at
 * least to `minimum` of a kind.
 */
function equalize(
  grid: HexGrid,
  tiles: MutableTile[],
  rng: Rng,
  zones: readonly (readonly number[])[],
  minimum: Partial<Record<'hill' | 'forest', number>> = {},
) {
  for (const kind of ['hill', 'forest'] as const) {
    const count = (zone: readonly number[]) =>
      zone.filter((t) => tiles[t]?.terrain === kind).length;
    const target = Math.max(
      minimum[kind] ?? 0,
      Math.round(zones.reduce((sum, z) => sum + count(z), 0) / zones.length),
    );
    // Hills cluster next to hills and mountains, forests next to forests.
    const likes = (t: number) =>
      grid.neighbors(t).filter((n) => {
        const terrain = tiles[n]?.terrain;
        return terrain === kind || (kind === 'hill' && terrain === 'mountain');
      }).length;
    for (const zone of zones) {
      let diff = target - count(zone);
      // Hills may also replace forests when plains run out; the forest pass comes after.
      const sources: readonly Terrain[] =
        diff < 0 ? [kind] : kind === 'hill' ? ['plains', 'forest'] : ['plains'];
      const to: Terrain = diff > 0 ? kind : 'plains';
      // Grow next to the most alike neighbors, shrink where there are fewest.
      const order = sources.flatMap((from) =>
        rng
          .shuffle(zone.filter((t) => tiles[t]?.terrain === from))
          .sort((a, b) => (diff > 0 ? likes(b) - likes(a) : likes(a) - likes(b))),
      );
      for (const t of order) {
        if (diff === 0) break;
        const tile = tiles[t];
        if (!tile) continue;
        tile.terrain = to;
        tile.vein = false;
        diff += diff > 0 ? -1 : 1;
      }
    }
  }
}

/** Brings the ore vein count of every zone to the (rounded) mean by moving veins on hills. */
function equalizeVeins(tiles: MutableTile[], rng: Rng, zones: readonly (readonly number[])[]) {
  const count = (zone: readonly number[]) => zone.filter((t) => tiles[t]?.vein).length;
  const target = Math.round(zones.reduce((sum, z) => sum + count(z), 0) / zones.length);
  for (const zone of zones) {
    let diff = target - count(zone);
    const order = rng.shuffle(
      zone.filter((t) => tiles[t]?.terrain === 'hill' && tiles[t].vein === diff < 0),
    );
    for (const t of order) {
      if (diff === 0) break;
      const tile = tiles[t];
      if (!tile) continue;
      tile.vein = diff > 0;
      diff += diff > 0 ? -1 : 1;
    }
  }
}
