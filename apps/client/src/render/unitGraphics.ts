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
import { drawStatusMark } from './buildingGraphics';
import { PALETTE, playerColor } from './palette';
import { tileLayout } from './tileLayout';

/**
 * Unit tokens (GDD 14: flat vector), one silhouette per line in the owner's color with one
 * chevron per level (rank stripes, countable at a glance): infantry a heater shield, archers
 * a diamond, cavalry a swallowtail banner. A ram is a roofed body on wheels with its beam; a
 * worker a round token with a hammer. Exhausted units of the player on turn are faded.
 */

type UnitPoint = readonly [number, number];

/** Body outlines in tile units (1 = tile size); the UI's SVG icons use the same points. */
export const UNIT_BODIES: Readonly<
  Record<'infantry' | 'archer' | 'cavalry', readonly UnitPoint[]>
> = {
  infantry: [
    [-0.3, -0.36],
    [0.3, -0.36],
    [0.3, 0.02],
    [0.24, 0.17],
    [0.12, 0.29],
    [0, 0.36],
    [-0.12, 0.29],
    [-0.24, 0.17],
    [-0.3, 0.02],
  ],
  archer: [
    [0, -0.42],
    [0.36, 0],
    [0, 0.42],
    [-0.36, 0],
  ],
  cavalry: [
    [-0.3, -0.36],
    [0.3, -0.36],
    [0.3, 0.38],
    [0, 0.18],
    [-0.3, 0.38],
  ],
};

/** Chevron half-width and the center of the chevron stack, per body. */
export const CHEVRONS: Readonly<
  Record<keyof typeof UNIT_BODIES, { readonly half: number; readonly mid: number }>
> = {
  infantry: { half: 0.17, mid: -0.12 },
  archer: { half: 0.13, mid: -0.02 },
  cavalry: { half: 0.17, mid: -0.12 },
};

/** Chevron rows (y of each apex) for a level, top to bottom. */
export function chevronRows(line: keyof typeof UNIT_BODIES, level: number): number[] {
  const count = Math.max(1, Math.min(4, level));
  const step = line === 'archer' ? 0.11 : 0.12;
  const top = CHEVRONS[line].mid - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => top + i * step);
}

/** The ram: roofed body, beam and wheels (tile units). */
export const RAM = {
  body: [
    [-0.36, 0.14],
    [-0.22, -0.2],
    [0.16, -0.2],
    [0.3, 0.14],
  ] as readonly UnitPoint[],
  beam: [
    [0.04, -0.04],
    [0.44, -0.04],
    [0.44, 0.06],
    [0.04, 0.06],
  ] as readonly UnitPoint[],
  wheels: [
    [-0.18, 0.2],
    [0.14, 0.2],
  ] as readonly UnitPoint[],
  wheelRadius: 0.1,
};

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

  switch (unit.line) {
    case 'worker':
      g.circle(c.x, c.y, 0.26 * s)
        .fill({ color, alpha })
        .stroke(outline);
      // Hammer: a handle and a head, tilted.
      g.moveTo(...at([-0.1, 0.14]))
        .lineTo(...at([0.08, -0.04]))
        .stroke({ width: s * 0.07, color: PALETTE.iconStone, cap: 'round', alpha });
      g.poly(
        [at([-0.02, -0.16]), at([0.08, -0.26]), at([0.2, -0.14]), at([0.1, -0.04])].flat(),
      ).fill({ color: PALETTE.iconStone, alpha });
      return;
    case 'siege':
      g.poly(RAM.beam.flatMap(at)).fill({ color: PALETTE.wood, alpha }).stroke(outline);
      g.poly(RAM.body.flatMap(at)).fill({ color, alpha }).stroke(outline);
      for (const wheel of RAM.wheels) {
        g.circle(...at(wheel), RAM.wheelRadius * s)
          .fill({ color: PALETTE.iconStone, alpha })
          .stroke(outline);
      }
      return;
    case 'infantry':
    case 'archer':
    case 'cavalry': {
      const line = unit.line;
      g.poly(UNIT_BODIES[line].flatMap(at)).fill({ color, alpha }).stroke(outline);
      const { half } = CHEVRONS[line];
      for (const y of chevronRows(line, unit.level)) {
        g.moveTo(...at([-half, y + 0.07]))
          .lineTo(...at([0, y - 0.03]))
          .lineTo(...at([half, y + 0.07]));
      }
      g.stroke({ width: s * 0.075, color: PALETTE.iconStone, cap: 'round', join: 'round', alpha });
    }
  }
}

const NONE: ReadonlySet<number> = new Set();

/**
 * All units; `lifted` (a unit being dragged) is drawn as a faint placeholder, `hidden` ones
 * (being animated, see effects.ts) not at all. Hungry units carry a minus mark (GDD 4.5:
 * one strength less), units under a volley an arrow (GDD 7.3).
 */
export function drawUnits(
  g: Graphics,
  game: GameState,
  lifted: number | null,
  hidden: ReadonlySet<number> = NONE,
): void {
  const grid = mapGrid(game.map);
  g.clear();
  for (const tile of unitTiles(game)) {
    const unit = game.units[tile];
    const owner = game.owners[tile];
    if (!unit || owner === undefined || owner === null || hidden.has(tile)) continue;
    const slot = tileLayout(game, tile, axialToPixel(grid.coord(tile), TILE_SIZE)).unit;
    if (!slot) continue;
    const size = TILE_SIZE * slot.scale;
    const faded = tile === lifted ? 0.25 : unit.exhausted && owner === game.currentPlayer ? 0.5 : 1;
    drawUnitToken(g, slot.point, size, unit, playerColor(owner), faded);
    if (tile === lifted) continue;
    if (unit.hungry) drawStatusMark(g, slot.point, size, 'hungry');
    if (unit.suppressed) drawStatusMark(g, slot.point, size, 'suppressed');
  }
}
