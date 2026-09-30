import { MAP_GEN, MAP_SIZES, type MapSize } from '../balance';
import { edgeKey, edgeTiles, type EdgeKey } from '../hex/edge';
import { DIRECTIONS } from '../hex/axial';
import { hexagonGrid, NO_TILE, type HexGrid } from '../hex/grid';
import { axialToPixel } from '../hex/layout';
import { vertexGraph, type VertexGraph } from '../hex/vertex';
import { deriveSeed, normalizeSeed, Rng } from '../rng';
import { isLand, isWater, type EdgeFeature, type GameMap, type Terrain } from '../state/map';
import { createNoise2D, fractalNoise } from './noise';

export interface GenerateMapOptions {
  readonly seed: number;
  readonly size?: MapSize;
}

/**
 * Generates a map from a seed (GDD 3.3). Deterministic: same seed and size, same map.
 *
 * Pipeline:
 * 1. Elevation = fractal noise − radial falloff.
 * 2. Continent: tiles are added from highest to lowest until one connected landmass
 *    reaches the target size; everything else is water. Water connected to the map
 *    border is sea, enclosed water is lake. (Land outside the main continent would be
 *    unreachable without ships, so it sinks.)
 * 3. Relief: elevation blended with ruggedness noise; the highest land becomes
 *    mountains, the next band hills.
 * 4. Rivers: start at mountain feet and flow corner to corner, always to the lowest
 *    neighboring corner, until they reach water or another river. A river stuck in a pit
 *    ends in a new lake. Rare river edges become fords.
 * 5. Forests on the wettest lowland (moisture noise); ore veins on some hills.
 *
 * Each step draws from its own RNG stream (see `deriveSeed`), so tuning one step does
 * not reshuffle the others.
 */
export function generateMap(options: GenerateMapOptions): GameMap {
  const seed = normalizeSeed(options.seed);
  const preset = MAP_SIZES[options.size ?? 'medium'];
  const grid = hexagonGrid(preset.radius);

  const elevation = computeElevation(grid, seed, preset.radius);
  const terrain = shapeContinent(grid, elevation, preset.landTiles);
  assignRelief(grid, terrain, elevation, seed);
  const edges = carveRivers(grid, terrain, elevation, seed, preset.rivers);
  assignForests(grid, terrain, seed);
  const veins = placeVeins(terrain, seed);

  return {
    seed,
    shape: { kind: 'hexagon', radius: preset.radius },
    tiles: terrain.map((t, i) => ({ terrain: t, vein: veins[i] === 1 })),
    edges,
  };
}

function at(values: Float64Array, index: number): number {
  return values[index] ?? 0;
}

function computeElevation(grid: HexGrid, seed: number, radius: number): Float64Array {
  const noise = createNoise2D(Rng.fromSeed(deriveSeed(seed, 'elevation')));
  const { falloff } = MAP_GEN.elevation;
  // Distance of the grid's flat sides from the center, in unit hex sizes.
  const edgeDistance = 1.5 * radius;
  const elevation = new Float64Array(grid.tileCount);
  grid.coords.forEach((hex, i) => {
    const { x, y } = axialToPixel(hex, 1);
    const n = fractalNoise(noise, x, y, MAP_GEN.elevation);
    const d2 = (x * x + y * y) / (edgeDistance * edgeDistance);
    elevation[i] = (n + 1) / 2 - falloff * d2;
  });
  return elevation;
}

/** Tile indices sorted by a score, highest first; ties broken by index. */
function rankDescending(indices: readonly number[], score: (i: number) => number): number[] {
  return [...indices].sort((a, b) => score(b) - score(a) || a - b);
}

function shapeContinent(grid: HexGrid, elevation: Float64Array, landTiles: number): Terrain[] {
  const parent = new Int32Array(grid.tileCount).fill(-1);
  const size = new Int32Array(grid.tileCount);
  const find = (i: number): number => {
    let root = i;
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
    // Path compression.
    let node = i;
    while (node !== root) {
      const next = parent[node] ?? root;
      parent[node] = root;
      node = next;
    }
    return root;
  };

  let largestSize = 0;
  let largestMember = -1;
  const all = Array.from({ length: grid.tileCount }, (_, i) => i);
  for (const tile of rankDescending(all, (i) => at(elevation, i))) {
    if (grid.isBorder(tile)) continue; // The outermost ring is always sea.
    parent[tile] = tile;
    size[tile] = 1;
    for (const n of grid.neighbors(tile)) {
      if (parent[n] === -1) continue;
      const a = find(tile);
      const b = find(n);
      if (a === b) continue;
      const [big, small] = (size[a] ?? 0) >= (size[b] ?? 0) ? [a, b] : [b, a];
      parent[small] = big;
      size[big] = (size[big] ?? 0) + (size[small] ?? 0);
    }
    const root = find(tile);
    if ((size[root] ?? 0) > largestSize) {
      largestSize = size[root] ?? 0;
      largestMember = tile;
    }
    if (largestSize >= landTiles) break;
  }

  const continent = find(largestMember);
  const terrain: Terrain[] = all.map((i) =>
    parent[i] !== -1 && find(i) === continent ? 'plains' : 'lake',
  );

  // Water reachable from the border is sea; the rest stays lake.
  const queue = all.filter((i) => grid.isBorder(i));
  for (const i of queue) terrain[i] = 'sea';
  // Breadth-first: the array iterator also visits entries pushed during the loop.
  for (const i of queue) {
    for (const n of grid.neighbors(i)) {
      if (terrain[n] === 'lake') {
        terrain[n] = 'sea';
        queue.push(n);
      }
    }
  }
  return terrain;
}

function assignRelief(
  grid: HexGrid,
  terrain: Terrain[],
  elevation: Float64Array,
  seed: number,
): void {
  const noise = createNoise2D(Rng.fromSeed(deriveSeed(seed, 'relief')));
  const { elevationWeight } = MAP_GEN.relief;
  const land = terrain.flatMap((t, i) => (isLand(t) ? [i] : []));
  const relief = new Float64Array(grid.tileCount);
  for (const i of land) {
    const { x, y } = axialToPixel(grid.coord(i), 1);
    const rugged = (fractalNoise(noise, x, y, MAP_GEN.relief) + 1) / 2;
    relief[i] = elevationWeight * at(elevation, i) + (1 - elevationWeight) * rugged;
  }
  const ranked = rankDescending(land, (i) => at(relief, i));
  const mountains = Math.round(land.length * MAP_GEN.terrain.mountainShare);
  const hills = Math.round(land.length * MAP_GEN.terrain.hillShare);
  ranked.forEach((tile, rank) => {
    if (rank < mountains) terrain[tile] = 'mountain';
    else if (rank < mountains + hills) terrain[tile] = 'hill';
  });
}

type EdgeMap = Partial<Record<EdgeKey, EdgeFeature>>;

function carveRivers(
  grid: HexGrid,
  terrain: Terrain[],
  elevation: Float64Array,
  seed: number,
  riverCount: number,
): EdgeMap {
  const { minLength, sourceSpacing, fordRate } = MAP_GEN.rivers;
  const graph = vertexGraph(grid);
  const rng = Rng.fromSeed(deriveSeed(seed, 'rivers'));
  const edges: EdgeMap = {};

  const vertexElevation = graph.vertices.map((v) => {
    let sum = 0;
    for (const t of v.tiles) sum += at(elevation, t);
    return sum / v.tiles.length;
  });
  const heightOf = (v: number) => vertexElevation[v] ?? 0;
  const terrainOf = (t: number): Terrain => terrain[t] ?? 'sea';
  // Map-border corners have fewer than 3 tiles; the missing ones are off-map sea.
  const touchesWater = (v: number) => {
    const tiles = graph.vertex(v).tiles;
    return tiles.length < 3 || tiles.some((t) => isWater(terrainOf(t)));
  };
  const onRiver = new Uint8Array(graph.vertexCount);

  // Sources: corners at a mountain's foot (touching a mountain and passable land).
  const candidates = graph.vertices.flatMap((v, i) => {
    const kinds = v.tiles.map(terrainOf);
    const atFoot =
      kinds.includes('mountain') && kinds.some((k) => k !== 'mountain') && !touchesWater(i);
    return atFoot ? [i] : [];
  });
  rng.shuffle(candidates);

  const sourceTiles: number[] = [];
  for (const source of candidates) {
    if (sourceTiles.length >= riverCount) break;
    const anchor = graph.vertex(source).anchorTile;
    if (onRiver[source] === 1) continue;
    if (sourceTiles.some((t) => grid.distance(t, anchor) < sourceSpacing)) continue;

    const path = traceRiver(graph, source, heightOf, touchesWater, onRiver);
    if (!path || path.edges.length < minLength) continue;
    if (path.lakeTile !== undefined) {
      if (!canBecomeLake(grid, terrain, edges, path.lakeTile)) continue;
      // A pit right next to the sea opens into it as a small bay instead.
      const bay = grid.neighbors(path.lakeTile).some((n) => terrain[n] === 'sea');
      terrain[path.lakeTile] = bay ? 'sea' : 'lake';
    }

    sourceTiles.push(anchor);
    for (const v of path.vertices) onRiver[v] = 1;
    for (const key of path.edges) edges[key] = { kind: 'river' };
    for (const index of pickFords(rng, path.edges.length, fordRate)) {
      const key = path.edges[index];
      if (key) edges[key] = { kind: 'ford' };
    }
  }
  return edges;
}

interface RiverPath {
  readonly vertices: readonly number[];
  readonly edges: readonly EdgeKey[];
  /** Set when the river ends in a pit: this tile becomes the lake it drains into. */
  readonly lakeTile?: number;
}

function traceRiver(
  graph: VertexGraph,
  source: number,
  heightOf: (v: number) => number,
  touchesWater: (v: number) => boolean,
  onRiver: Uint8Array,
): RiverPath | undefined {
  const vertices = [source];
  const edges: EdgeKey[] = [];
  let current = source;
  for (;;) {
    // Mouth (sea/lake) or confluence with an earlier river.
    if (current !== source && (touchesWater(current) || onRiver[current] === 1)) {
      return { vertices, edges };
    }
    let next: { vertex: number; edge: EdgeKey } | undefined;
    for (const link of graph.vertex(current).links) {
      if (link.edge === null || vertices.includes(link.vertex)) continue;
      if (!next || heightOf(link.vertex) < heightOf(next.vertex)) {
        next = { vertex: link.vertex, edge: link.edge };
      }
    }
    if (!next || heightOf(next.vertex) >= heightOf(current)) {
      // Pit: the river pools into a lake on the corner's tile that is not beside the last
      // river edge (so no river edge ends up bordering the lake).
      const last = edges.at(-1);
      if (last === undefined) return undefined;
      const [a, b] = edgeTiles(last);
      const lakeTile = graph.vertex(current).tiles.find((t) => t !== a && t !== b);
      return lakeTile === undefined ? undefined : { vertices, edges, lakeTile };
    }
    vertices.push(next.vertex);
    edges.push(next.edge);
    current = next.vertex;
  }
}

/**
 * A pit lake must be lowland or hill, must not touch an existing river edge, and must not
 * split the continent: its land neighbors have to form one contiguous arc around it.
 */
function canBecomeLake(grid: HexGrid, terrain: Terrain[], edges: EdgeMap, tile: number): boolean {
  if (terrain[tile] !== 'plains' && terrain[tile] !== 'hill') return false;
  if (grid.neighbors(tile).some((n) => edges[edgeKey(n, tile)] !== undefined)) return false;
  const landAround = DIRECTIONS.map((d) => {
    const n = grid.neighbor(tile, d);
    return n !== NO_TILE && isLand(terrain[n] ?? 'sea');
  });
  // Count land runs around the ring (cyclic): a land cell whose predecessor is not land.
  const runs = landAround.filter((land, d) => land && !landAround[(d + 5) % 6]).length;
  return runs <= 1;
}

/** Ford positions along a river of `length` edges: never at the ends, never adjacent. */
function pickFords(rng: Rng, length: number, rate: number): number[] {
  const count = Math.floor(length * rate + rng.float());
  const slots = rng.shuffle(Array.from({ length: Math.max(0, length - 2) }, (_, i) => i + 1));
  const fords: number[] = [];
  for (const slot of slots) {
    if (fords.length >= count) break;
    if (fords.every((f) => Math.abs(f - slot) > 1)) fords.push(slot);
  }
  return fords;
}

function assignForests(grid: HexGrid, terrain: Terrain[], seed: number): void {
  const noise = createNoise2D(Rng.fromSeed(deriveSeed(seed, 'moisture')));
  const lowland = terrain.flatMap((t, i) => (t === 'plains' ? [i] : []));
  const moisture = new Float64Array(grid.tileCount);
  for (const i of lowland) {
    const { x, y } = axialToPixel(grid.coord(i), 1);
    moisture[i] = fractalNoise(noise, x, y, MAP_GEN.moisture);
  }
  const forests = Math.round(lowland.length * MAP_GEN.terrain.forestShare);
  rankDescending(lowland, (i) => at(moisture, i))
    .slice(0, forests)
    .forEach((i) => (terrain[i] = 'forest'));
}

function placeVeins(terrain: readonly Terrain[], seed: number): Uint8Array {
  const rng = Rng.fromSeed(deriveSeed(seed, 'veins'));
  const veins = new Uint8Array(terrain.length);
  terrain.forEach((t, i) => {
    if (t === 'hill' && rng.chance(MAP_GEN.terrain.veinChance)) veins[i] = 1;
  });
  return veins;
}
