import {
  axialToPixel,
  cornerPosition,
  DIRECTIONS,
  edgeKey,
  edgeTiles,
  hexPolygon,
  isWater,
  mapGrid,
  NO_TILE,
  rotateDirection,
  type EdgeFeature,
  type EdgeKey,
  type GameMap,
  type HexGrid,
  type Point,
  type Terrain,
} from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { PALETTE, TERRAIN_COLORS } from './palette';

/**
 * Static map drawing. Each function fills a Graphics once per generated map; Pixi keeps
 * the tessellated geometry on the GPU, so panning/zooming never redraws it and it stays
 * crisp at every zoom level (unlike a cached texture).
 */

/** Hex circumradius in world units. */
export const TILE_SIZE = 32;

type UnitPoint = readonly [number, number];

/** Fills a polygon given in tile-relative units (1 = TILE_SIZE). */
function glyph(g: Graphics, center: Point, points: readonly UnitPoint[], color: number): void {
  g.poly(points.flatMap(([x, y]) => [center.x + x * TILE_SIZE, center.y + y * TILE_SIZE])).fill(
    color,
  );
}

/** Open-sea tiles' distance to the nearest land (1 = coastal water). Lakes are 0. */
function seaDepths(map: GameMap, grid: HexGrid): Int32Array {
  const depth = new Int32Array(grid.tileCount);
  const queue: number[] = [];
  map.tiles.forEach((tile, i) => {
    if (!isWater(tile.terrain)) queue.push(i);
  });
  // Breadth-first: the array iterator also visits entries pushed during the loop.
  for (const i of queue) {
    for (const n of grid.neighbors(i)) {
      if (map.tiles[n]?.terrain === 'sea' && depth[n] === 0) {
        depth[n] = (depth[i] ?? 0) + 1;
        queue.push(n);
      }
    }
  }
  return depth;
}

export function drawTerrain(base: Graphics, glyphs: Graphics, map: GameMap): void {
  const grid = mapGrid(map);
  const depths = seaDepths(map, grid);
  base.clear();
  glyphs.clear();

  map.tiles.forEach((tile, i) => {
    const center = axialToPixel(grid.coord(i), TILE_SIZE);
    const outline = hexPolygon(center, TILE_SIZE);
    let color = TERRAIN_COLORS[tile.terrain];
    if (tile.terrain === 'sea') {
      const depth = Math.min(depths[i] ?? 3, PALETTE.seaDepths.length) - 1;
      color = PALETTE.seaDepths[Math.max(0, depth)] ?? color;
    }
    base.poly(outline).fill(color);
    if (!isWater(tile.terrain)) {
      base.poly(outline).stroke({ width: 1, color: PALETTE.gridLine, alpha: 0.22 });
    }
    drawTerrainGlyph(glyphs, tile.terrain, center);
    if (tile.vein) drawVein(glyphs, center);
  });

  // Coastline: a light line on every land side that faces water.
  map.tiles.forEach((tile, i) => {
    if (isWater(tile.terrain)) return;
    const hex = grid.coord(i);
    for (const side of DIRECTIONS) {
      const n = grid.neighbor(i, side);
      const neighbor = n === NO_TILE ? undefined : map.tiles[n];
      if (neighbor && !isWater(neighbor.terrain)) continue;
      const a = cornerPosition(hex, side, TILE_SIZE);
      const b = cornerPosition(hex, rotateDirection(side, 1), TILE_SIZE);
      base.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
  });
  base.stroke({ width: 2.5, color: PALETTE.coast, alpha: 0.85, cap: 'round', join: 'round' });
}

function drawTerrainGlyph(g: Graphics, terrain: Terrain, c: Point): void {
  switch (terrain) {
    case 'forest':
      for (const [x, y] of [
        [-0.3, 0.12],
        [0.3, 0.12],
        [0, -0.2],
      ] as const) {
        glyph(
          g,
          c,
          [
            [x, y - 0.34],
            [x + 0.19, y + 0.14],
            [x - 0.19, y + 0.14],
          ],
          PALETTE.tree,
        );
        glyph(
          g,
          c,
          [
            [x, y - 0.34],
            [x + 0.19, y + 0.14],
            [x, y + 0.14],
          ],
          PALETTE.treeShade,
        );
      }
      break;
    case 'hill':
      glyph(g, c, bump(-0.22, 0.12, 0.25), PALETTE.hillShade);
      glyph(g, c, bump(0.2, 0.04, 0.29), PALETTE.hillShade);
      break;
    case 'mountain':
      glyph(
        g,
        c,
        [
          [0, -0.55],
          [0.52, 0.4],
          [-0.52, 0.4],
        ],
        PALETTE.mountainLight,
      );
      glyph(
        g,
        c,
        [
          [0, -0.55],
          [0.52, 0.4],
          [0.05, 0.4],
        ],
        PALETTE.mountainDark,
      );
      glyph(
        g,
        c,
        [
          [0, -0.55],
          [0.17, -0.24],
          [0.05, -0.28],
          [-0.05, -0.2],
          [-0.17, -0.24],
        ],
        PALETTE.snow,
      );
      break;
    case 'sea':
    case 'lake':
    case 'plains':
      break;
  }
}

/** Half-disc (flat side down) centered at (x, y) with radius r, in tile units. */
function bump(x: number, y: number, r: number): UnitPoint[] {
  const points: UnitPoint[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI + (Math.PI * i) / steps;
    points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
  }
  return points;
}

function drawVein(g: Graphics, c: Point): void {
  const x = c.x;
  const y = c.y + 0.48 * TILE_SIZE;
  const w = 0.19 * TILE_SIZE;
  const h = 0.24 * TILE_SIZE;
  g.poly([x, y - h, x + w, y, x, y + h, x - w, y])
    .fill(PALETTE.vein)
    .stroke({ width: 1.5, color: PALETTE.veinOutline, join: 'round' });
}

/** The tile side of an edge as a segment between its two corners. */
export function edgeSegment(grid: HexGrid, key: EdgeKey): readonly [Point, Point] | undefined {
  const [a, b] = edgeTiles(key);
  const side = grid.directionTo(a, b);
  if (side === undefined) return undefined;
  const hex = grid.coord(a);
  return [
    cornerPosition(hex, side, TILE_SIZE),
    cornerPosition(hex, rotateDirection(side, 1), TILE_SIZE),
  ];
}

export function drawEdges(g: Graphics, map: GameMap): void {
  const grid = mapGrid(map);
  g.clear();
  const features = Object.entries(map.edges) as [EdgeKey, EdgeFeature | undefined][];
  const segments = features.flatMap(([key, feature]) => {
    const segment = feature && edgeSegment(grid, key);
    return segment ? [{ kind: feature.kind, segment }] : [];
  });

  const stroke = (kind: 'river' | 'ford' | 'all', width: number, color: number) => {
    for (const s of segments) {
      if (kind !== 'all' && s.kind !== kind) continue;
      const [a, b] = s.segment;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ width, color, cap: 'round', join: 'round' });
  };

  // Dark banks under everything, then the water; fords are lighter with stepping stones.
  stroke('all', TILE_SIZE * 0.3, PALETTE.riverBank);
  stroke('ford', TILE_SIZE * 0.4, PALETTE.riverBank);
  stroke('river', TILE_SIZE * 0.2, PALETTE.river);
  stroke('ford', TILE_SIZE * 0.3, PALETTE.ford);
  for (const s of segments) {
    if (s.kind !== 'ford') continue;
    const [a, b] = s.segment;
    for (const t of [0.25, 0.5, 0.75]) {
      g.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, TILE_SIZE * 0.075)
        .fill(PALETTE.fordStone)
        .stroke({ width: 1, color: PALETTE.riverBank });
    }
  }
}

/**
 * Hover outline of a tile; with `edgeFrom` (an edge action in hand) and a neighbor of it
 * hovered, the shared side instead: that is the edge the action would use.
 */
export function drawHover(
  g: Graphics,
  map: GameMap,
  tile: number | null,
  edgeFrom: number | null = null,
): void {
  g.clear();
  if (tile === null) return;
  const grid = mapGrid(map);
  if (!grid.has(tile)) return;
  if (edgeFrom !== null && grid.areAdjacent(edgeFrom, tile)) {
    const segment = edgeSegment(grid, edgeKey(edgeFrom, tile));
    if (segment) {
      const [a, b] = segment;
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: TILE_SIZE * 0.2, color: PALETTE.hover, alpha: 0.9, cap: 'round' });
      return;
    }
  }
  const center = axialToPixel(grid.coord(tile), TILE_SIZE);
  g.poly(hexPolygon(center, TILE_SIZE * 0.94)).stroke({
    width: 3,
    color: PALETTE.hover,
    alpha: 0.9,
    join: 'round',
  });
}
