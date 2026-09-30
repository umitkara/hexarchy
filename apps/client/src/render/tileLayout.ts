import type { GameState, Point } from '@hexarchy/engine';
import { TILE_SIZE } from './mapGraphics';

/**
 * Where the icons of one tile sit (world space) when a center, a building and a unit share
 * it. Alone, an icon is centered at full size; together, the center (or else the building)
 * moves to the upper left, the unit to the lower right, and a building next to a center to
 * the lower left.
 */

export interface Slot {
  readonly point: Point;
  /** Scale relative to a full tile-sized icon. */
  readonly scale: number;
}

export interface TileLayout {
  readonly center: Slot | null;
  readonly building: Slot | null;
  readonly unit: Slot | null;
}

const at = (c: Point, dx: number, dy: number, scale: number): Slot => ({
  point: { x: c.x + dx * TILE_SIZE, y: c.y + dy * TILE_SIZE },
  scale,
});

export function tileLayout(
  game: Pick<GameState, 'centers' | 'buildings' | 'units'>,
  tile: number,
  c: Point,
): TileLayout {
  const hasCenter = game.centers[tile] !== undefined;
  const hasBuilding = game.buildings[tile] !== undefined;
  const hasUnit = game.units[tile] !== undefined;
  const upperLeft = at(c, -0.2, -0.14, 0.72);
  const full = at(c, 0, 0, 1);
  let building: Slot | null = null;
  if (hasBuilding) building = hasCenter ? at(c, -0.24, 0.26, 0.55) : hasUnit ? upperLeft : full;
  return {
    center: hasCenter ? (hasBuilding || hasUnit ? upperLeft : full) : null,
    building,
    unit: hasUnit ? (hasCenter || hasBuilding ? at(c, 0.22, 0.2, 0.72) : full) : null,
  };
}
