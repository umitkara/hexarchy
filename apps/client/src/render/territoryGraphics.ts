import {
  axialToPixel,
  cornerPosition,
  DIRECTIONS,
  getRegions,
  hexPolygon,
  mapGrid,
  NO_REGION,
  NO_TILE,
  rotateDirection,
  SQRT3,
  type Direction,
  type GameState,
  type HexGrid,
  type Point,
  type RegionMap,
} from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor, TERRITORY_FILL_ALPHA } from './palette';

/** Region border stroke width (world units). */
const BORDER_WIDTH = 3.5;
/** Distance of the border line's center from the tile side it follows. */
const BORDER_INSET = BORDER_WIDTH / 2 + 1;

/** True if side `side` of `tile` is on the edge of its region (or of the map). */
function isRegionEdge(grid: HexGrid, regions: RegionMap, tile: number, side: Direction): boolean {
  const n = grid.neighbor(tile, side);
  return n === NO_TILE || regions.regionOf[n] !== regions.regionOf[tile];
}

/**
 * Traces region outlines, inset into the region by `inset`, so neighboring regions show
 * two parallel lines in their own colors, and a river between two regions of the same
 * player is flanked by both of their borders.
 *
 * Each outline segment runs along one tile side. At each end it meets the next outline
 * segment: if the tile's adjacent side is also an edge, the outline turns around the
 * tile's own corner (end pulled toward the tile center); otherwise the region continues
 * into the neighbor, and the end slides along the shared side. Both points sit on the
 * angle bisector at the same distance, so consecutive segments join seamlessly.
 */
function traceOutline(
  g: Graphics,
  grid: HexGrid,
  regions: RegionMap,
  tiles: readonly number[],
  inset: number,
): void {
  const reach = (2 * inset) / SQRT3;
  const toward = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    return { x: from.x + (dx / length) * reach, y: from.y + (dy / length) * reach };
  };
  for (const tile of tiles) {
    const hex = grid.coord(tile);
    const center = axialToPixel(hex, TILE_SIZE);
    const corner = (c: number) => cornerPosition(hex, c, TILE_SIZE);
    for (const side of DIRECTIONS) {
      if (!isRegionEdge(grid, regions, tile, side)) continue;
      const before = rotateDirection(side, -1);
      const after = rotateDirection(side, 1);
      const a = corner(side);
      const b = corner(after);
      // At corner `side` the other tile side is `before` (from corner side-1 to side).
      const start = isRegionEdge(grid, regions, tile, before)
        ? toward(a, center)
        : toward(a, corner(before));
      // At corner `side+1` the other tile side is `after` (from corner side+1 to side+2).
      const end = isRegionEdge(grid, regions, tile, after)
        ? toward(b, center)
        : toward(b, corner(rotateDirection(side, 2)));
      g.moveTo(start.x, start.y).lineTo(end.x, end.y);
    }
  }
}

/** Ownership fill and region borders, colored by owner. */
export function drawTerritory(fill: Graphics, borders: Graphics, game: GameState): void {
  const grid = mapGrid(game.map);
  const regions = getRegions(game);
  fill.clear();
  borders.clear();
  for (const region of regions.regions) {
    const color = playerColor(region.owner);
    for (const tile of region.tiles) {
      const center = axialToPixel(grid.coord(tile), TILE_SIZE);
      fill.poly(hexPolygon(center, TILE_SIZE)).fill({ color, alpha: TERRITORY_FILL_ALPHA });
    }
    traceOutline(borders, grid, regions, region.tiles, BORDER_INSET);
    borders.stroke({ width: BORDER_WIDTH, color, cap: 'round', join: 'round' });
  }
}

type UnitPoint = readonly [number, number];

function shape(g: Graphics, c: Point, points: readonly UnitPoint[], scale: number): Graphics {
  return g.poly(points.flatMap(([x, y]) => [c.x + x * scale, c.y + y * scale]));
}

/** Capital: a keep with three merlons and a banner in the player color. */
const CAPITAL_WALLS: readonly UnitPoint[] = [
  [-0.36, 0.3],
  [-0.36, -0.12],
  [-0.24, -0.12],
  [-0.24, -0.02],
  [-0.06, -0.02],
  [-0.06, -0.12],
  [0.06, -0.12],
  [0.06, -0.02],
  [0.24, -0.02],
  [0.24, -0.12],
  [0.36, -0.12],
  [0.36, 0.3],
];
const CAPITAL_GATE: readonly UnitPoint[] = [
  [-0.09, 0.3],
  [-0.09, 0.14],
  [0, 0.07],
  [0.09, 0.14],
  [0.09, 0.3],
];
const CAPITAL_BANNER: readonly UnitPoint[] = [
  [0.02, -0.5],
  [0.3, -0.42],
  [0.02, -0.34],
];
/** Local center: a house with a roof in the player color. */
const LOCAL_WALLS: readonly UnitPoint[] = [
  [-0.22, 0.26],
  [-0.22, -0.02],
  [0.22, -0.02],
  [0.22, 0.26],
];
const LOCAL_ROOF: readonly UnitPoint[] = [
  [-0.32, 0.0],
  [0, -0.3],
  [0.32, 0.0],
];

/** Offset and scale of a center icon that shares its tile with a unit (see unitAnchor). */
const SHARED_ICON = { dx: -0.2, dy: -0.14, scale: 0.72 } as const;

/** Capital and local center icons. */
export function drawCenters(g: Graphics, game: GameState): void {
  const grid = mapGrid(game.map);
  const outline = { width: 2, color: PALETTE.iconOutline, join: 'round' as const };
  g.clear();
  for (const [key, center] of Object.entries(game.centers)) {
    const tile = Number(key);
    const owner = game.owners[tile];
    if (!center || owner === undefined || owner === null) continue;
    const color = playerColor(owner);
    let c = axialToPixel(grid.coord(tile), TILE_SIZE);
    let s = TILE_SIZE;
    if (game.units[tile]) {
      c = { x: c.x + SHARED_ICON.dx * TILE_SIZE, y: c.y + SHARED_ICON.dy * TILE_SIZE };
      s = TILE_SIZE * SHARED_ICON.scale;
    }
    if (center.kind === 'capital') {
      g.moveTo(c.x + 0.02 * s, c.y - 0.12 * s)
        .lineTo(c.x + 0.02 * s, c.y - 0.52 * s)
        .stroke({ width: 2.5, color: PALETTE.iconOutline, cap: 'round' });
      shape(g, c, CAPITAL_BANNER, s).fill(color).stroke(outline);
      shape(g, c, CAPITAL_WALLS, s).fill(PALETTE.iconStone).stroke(outline);
      shape(g, c, CAPITAL_GATE, s).fill(color).stroke(outline);
    } else {
      shape(g, c, LOCAL_WALLS, s).fill(PALETTE.iconStone).stroke(outline);
      shape(g, c, LOCAL_ROOF, s).fill(color).stroke(outline);
    }
  }
}

/** White outline of the selected tile's region (or just the tile if neutral). */
export function drawSelection(g: Graphics, game: GameState, tile: number | null): void {
  g.clear();
  if (tile === null) return;
  const grid = mapGrid(game.map);
  if (!grid.has(tile)) return;
  const regions = getRegions(game);
  const id = regions.regionOf[tile] ?? NO_REGION;
  if (id === NO_REGION) {
    const center = axialToPixel(grid.coord(tile), TILE_SIZE);
    g.poly(hexPolygon(center, TILE_SIZE * 0.86)).stroke({
      width: 3,
      color: PALETTE.selection,
      join: 'round',
    });
    return;
  }
  traceOutline(g, grid, regions, regions.regions[id]?.tiles ?? [], BORDER_INSET + BORDER_WIDTH);
  g.stroke({ width: 3, color: PALETTE.selection, cap: 'round', join: 'round' });
}
