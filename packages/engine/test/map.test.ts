import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '../src/balance';
import { edgeTiles, vertexGraph, type EdgeKey } from '../src/hex';
import { generateMap } from '../src/map';
import { isLand, isWater, mapGrid, TERRAINS, type GameMap, type Terrain } from '../src/state';

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);
const maps = SEEDS.map((seed) => generateMap({ seed }));

function terrainAt(map: GameMap, tile: number): Terrain {
  const t = map.tiles[tile];
  if (!t) throw new Error(`No tile ${tile}`);
  return t.terrain;
}

function edgeEntries(map: GameMap) {
  return Object.entries(map.edges) as [EdgeKey, { kind: string }][];
}

describe('generateMap', () => {
  it('is deterministic: same seed, same map', () => {
    expect(generateMap({ seed: 1234 })).toEqual(generateMap({ seed: 1234 }));
    // Interleaving other generations must not matter (no hidden global state).
    const first = JSON.stringify(generateMap({ seed: 99 }));
    generateMap({ seed: 5 });
    expect(JSON.stringify(generateMap({ seed: 99 }))).toBe(first);
  });

  it('produces different maps for different seeds', () => {
    const terrains = new Set(maps.map((m) => m.tiles.map((t) => t.terrain).join()));
    expect(terrains.size).toBe(maps.length);
  });

  it('is plain JSON that survives a round trip', () => {
    const map = maps[0];
    expect(JSON.parse(JSON.stringify(map))).toEqual(map);
  });

  it('records the normalized seed and the medium hexagon shape', () => {
    const map = generateMap({ seed: -1 });
    expect(map.seed).toBe(2 ** 32 - 1);
    expect(map.shape).toEqual({ kind: 'hexagon', radius: MAP_SIZES.medium.radius });
    expect(map.tiles).toHaveLength(mapGrid(map).tileCount);
  });

  it('makes a continent of about the target land size, with every terrain', () => {
    const target = MAP_SIZES.medium.landTiles;
    for (const map of maps) {
      const land = map.tiles.filter((t) => isLand(t.terrain)).length;
      expect(land).toBeGreaterThanOrEqual(target * 0.95);
      expect(land).toBeLessThanOrEqual(target * 1.05);
      const present = new Set(map.tiles.map((t) => t.terrain));
      for (const terrain of TERRAINS) {
        if (terrain !== 'lake') expect(present).toContain(terrain);
      }
    }
    expect(maps.some((m) => m.tiles.some((t) => t.terrain === 'lake'))).toBe(true);
  });

  it('keeps all land in one connected landmass', () => {
    for (const map of maps) {
      const grid = mapGrid(map);
      const land = map.tiles.flatMap((t, i) => (isLand(t.terrain) ? [i] : []));
      const seen = new Set([land[0]]);
      const queue = [land[0] ?? 0];
      for (const i of queue) {
        for (const n of grid.neighbors(i)) {
          if (!seen.has(n) && isLand(terrainAt(map, n))) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(land.length);
    }
  });

  it('surrounds the map with sea; sea touches the border, lakes are enclosed', () => {
    for (const map of maps) {
      const grid = mapGrid(map);
      // Sea = water reachable from the border through water.
      const border = map.tiles.flatMap((_, i) => (grid.isBorder(i) ? [i] : []));
      for (const i of border) expect(terrainAt(map, i)).toBe('sea');
      const reachable = new Set(border);
      const queue = [...border];
      for (const i of queue) {
        for (const n of grid.neighbors(i)) {
          if (!reachable.has(n) && isWater(terrainAt(map, n))) {
            reachable.add(n);
            queue.push(n);
          }
        }
      }
      map.tiles.forEach((t, i) => {
        if (t.terrain === 'sea') expect(reachable.has(i)).toBe(true);
        if (t.terrain === 'lake') expect(reachable.has(i)).toBe(false);
      });
    }
  });

  it('places ore veins on hills only', () => {
    for (const map of maps) {
      for (const t of map.tiles) if (t.vein) expect(t.terrain).toBe('hill');
    }
    expect(maps.every((m) => m.tiles.some((t) => t.vein))).toBe(true);
  });

  it('runs rivers only between two land tiles', () => {
    for (const map of maps) {
      const grid = mapGrid(map);
      for (const [key] of edgeEntries(map)) {
        const [a, b] = edgeTiles(key);
        expect(grid.areAdjacent(a, b)).toBe(true);
        expect(isLand(terrainAt(map, a))).toBe(true);
        expect(isLand(terrainAt(map, b))).toBe(true);
      }
    }
  });

  it('forms river networks that each drain into water', () => {
    let networks = 0;
    for (const map of maps) {
      const grid = mapGrid(map);
      const graph = vertexGraph(grid);
      // Union the corner-to-corner river segments into networks.
      const parent = new Map<number, number>();
      const find = (v: number): number => {
        let root = v;
        while (parent.get(root) !== undefined && parent.get(root) !== root) {
          root = parent.get(root) ?? root;
        }
        return root;
      };
      for (const [key] of edgeEntries(map)) {
        const [a, b] = graph.edgeVertices(key);
        if (!parent.has(a)) parent.set(a, a);
        if (!parent.has(b)) parent.set(b, b);
        parent.set(find(a), find(b));
      }
      const roots = new Map<number, boolean>();
      for (const v of parent.keys()) {
        const drains = graph.vertex(v).tiles.some((t) => isWater(terrainAt(map, t)));
        const root = find(v);
        roots.set(root, (roots.get(root) ?? false) || drains);
      }
      for (const drains of roots.values()) expect(drains).toBe(true);
      networks += roots.size;
    }
    // Several rivers per map on average.
    expect(networks / maps.length).toBeGreaterThanOrEqual(3);
  });

  it('makes fords rare', () => {
    let rivers = 0;
    let fords = 0;
    for (const map of maps) {
      for (const [, feature] of edgeEntries(map)) {
        if (feature.kind === 'ford') fords++;
        else rivers++;
      }
    }
    expect(fords).toBeGreaterThan(0);
    expect(fords / (rivers + fords)).toBeLessThan(0.2);
  });
});
