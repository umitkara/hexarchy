import {
  axialToPixel,
  mapGrid,
  unitTiles,
  type GameState,
  type Point,
  type Unit,
} from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';

/**
 * Unit tokens (GDD 14: flat vector). Infantry is a heater shield in the owner's color with
 * one chevron per level (rank stripes, countable at a glance); a worker is a round token
 * with a hammer. Exhausted units of the player on turn are faded.
 */

type UnitPoint = readonly [number, number];

const SHIELD: readonly UnitPoint[] = [
  [-0.3, -0.36],
  [0.3, -0.36],
  [0.3, 0.02],
  [0.24, 0.17],
  [0.12, 0.29],
  [0, 0.36],
  [-0.12, 0.29],
  [-0.24, 0.17],
  [-0.3, 0.02],
];

/** Where a unit sits on its tile: shifted aside when it shares the tile with a center. */
export function unitAnchor(center: Point, withCenter: boolean): { point: Point; scale: number } {
  return withCenter
    ? { point: { x: center.x + 0.22 * TILE_SIZE, y: center.y + 0.2 * TILE_SIZE }, scale: 0.72 }
    : { point: center, scale: 1 };
}

/** Draws one unit token centered at `c`; `size` is the tile size it is drawn for. */
export function drawUnitToken(
  g: Graphics,
  c: Point,
  size: number,
  unit: Unit,
  color: number,
  alpha = 1,
): void {
  const s = size;
  const outline = {
    width: Math.max(1.5, s * 0.06),
    color: PALETTE.iconOutline,
    join: 'round' as const,
    alpha,
  };
  const at = ([x, y]: UnitPoint): [number, number] => [c.x + x * s, c.y + y * s];

  if (unit.line === 'worker') {
    g.circle(c.x, c.y, 0.26 * s)
      .fill({ color, alpha })
      .stroke(outline);
    // Hammer: a handle and a head, tilted.
    g.moveTo(...at([-0.1, 0.14]))
      .lineTo(...at([0.08, -0.04]))
      .stroke({ width: s * 0.07, color: PALETTE.iconStone, cap: 'round', alpha });
    g.poly([at([-0.02, -0.16]), at([0.08, -0.26]), at([0.2, -0.14]), at([0.1, -0.04])].flat()).fill(
      { color: PALETTE.iconStone, alpha },
    );
    return;
  }

  g.poly(SHIELD.flatMap(at)).fill({ color, alpha }).stroke(outline);
  // Chevrons, top to bottom, centered in the shield.
  const count = Math.max(1, Math.min(4, unit.level));
  const step = 0.12;
  const top = -0.12 - ((count - 1) * step) / 2;
  for (let i = 0; i < count; i++) {
    const y = top + i * step;
    g.moveTo(...at([-0.17, y + 0.07]))
      .lineTo(...at([0, y - 0.03]))
      .lineTo(...at([0.17, y + 0.07]));
  }
  g.stroke({ width: s * 0.075, color: PALETTE.iconStone, cap: 'round', join: 'round', alpha });
}

/** All units; `hidden` (a unit being dragged) is drawn as a faint placeholder. */
export function drawUnits(g: Graphics, game: GameState, hidden: number | null): void {
  const grid = mapGrid(game.map);
  g.clear();
  for (const tile of unitTiles(game)) {
    const unit = game.units[tile];
    const owner = game.owners[tile];
    if (!unit || owner === undefined || owner === null) continue;
    const center = axialToPixel(grid.coord(tile), TILE_SIZE);
    const { point, scale } = unitAnchor(center, game.centers[tile] !== undefined);
    const faded = tile === hidden ? 0.25 : unit.exhausted && owner === game.currentPlayer ? 0.5 : 1;
    drawUnitToken(g, point, TILE_SIZE * scale, unit, playerColor(owner), faded);
  }
}
