import {
  axialToPixel,
  edgeTiles,
  mapGrid,
  STRUCTURES,
  structureEdges,
  type EdgeStructure,
  type GameState,
  type Point,
} from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { edgeSegment, TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';

/**
 * Edge structures (GDD 3.2, 5.3) on the tile sides, flat vector like the rest: a fence is
 * a wooden rail with posts in the owner's color, a wall a thick stone band with the owner's
 * stripe, a gate a wall with an owner-colored door in the middle, a bridge planks across the
 * river with owner-colored rails. Damage (a ram's hits) shows as dark cracks.
 */

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Draws one structure on the side a–b; `across` points from one tile center to the other. */
export function drawStructure(
  g: Graphics,
  a: Point,
  b: Point,
  across: Point,
  structure: Pick<EdgeStructure, 'kind' | 'owner' | 'damage'>,
  alpha = 1,
): void {
  const color = playerColor(structure.owner);
  const t = TILE_SIZE;
  const outline = PALETTE.iconOutline;
  // Pull the ends in a little so structures do not overlap at the corners.
  const [p, q] = [lerp(a, b, 0.08), lerp(a, b, 0.92)];
  const line = (from: Point, to: Point, width: number, stroke: number) => {
    g.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width, color: stroke, cap: 'round', alpha });
  };

  switch (structure.kind) {
    case 'fence': {
      line(p, q, t * 0.13, outline);
      line(p, q, t * 0.07, PALETTE.wood);
      for (const s of [0.1, 0.5, 0.9]) {
        const c = lerp(p, q, s);
        g.circle(c.x, c.y, t * 0.085)
          .fill({ color, alpha })
          .stroke({ width: 1.5, color: outline, alpha });
      }
      break;
    }
    case 'wall':
    case 'gate': {
      // Masonry: a thick grey band with joints, and merlons in the owner's color.
      line(p, q, t * 0.34, outline);
      line(p, q, t * 0.26, PALETTE.wallStone);
      const len = Math.hypot(across.x, across.y) || 1;
      const n = { x: (across.x / len) * t * 0.11, y: (across.y / len) * t * 0.11 };
      for (const s of [0.2, 0.4, 0.6, 0.8]) {
        const c = lerp(p, q, s);
        g.moveTo(c.x - n.x, c.y - n.y).lineTo(c.x + n.x, c.y + n.y);
      }
      g.stroke({ width: 1.5, color: outline, alpha: alpha * 0.55 });
      const merlons = structure.kind === 'gate' ? [0.1, 0.9] : [0.1, 0.5, 0.9];
      const m = t * 0.085;
      for (const s of merlons) {
        const c = lerp(p, q, s);
        g.rect(c.x - m, c.y - m, 2 * m, 2 * m)
          .fill({ color, alpha })
          .stroke({ width: 1.5, color: outline, alpha });
      }
      if (structure.kind === 'gate') {
        // A wide door in the owner's color with a light bar across.
        const [d0, d1] = [lerp(p, q, 0.28), lerp(p, q, 0.72)];
        line(d0, d1, t * 0.4, outline);
        line(d0, d1, t * 0.3, color);
        line(lerp(p, q, 0.34), lerp(p, q, 0.66), t * 0.06, PALETTE.iconStone);
      }
      break;
    }
    case 'bridge': {
      // Planks across the river, from bank to bank.
      const len = Math.hypot(across.x, across.y) || 1;
      const u = { x: across.x / len, y: across.y / len };
      const v = { x: -u.y, y: u.x };
      const mid = lerp(a, b, 0.5);
      const half = t * 0.3;
      const width = t * 0.2;
      const corner = (du: number, dv: number) => [
        mid.x + u.x * du + v.x * dv,
        mid.y + u.y * du + v.y * dv,
      ];
      g.poly([
        ...corner(-half, -width),
        ...corner(half, -width),
        ...corner(half, width),
        ...corner(-half, width),
      ])
        .fill({ color: PALETTE.wood, alpha })
        .stroke({ width: 1.5, color: outline, alpha, join: 'round' });
      for (const s of [-0.5, 0, 0.5]) {
        const [x0, y0] = corner(half * s, -width);
        const [x1, y1] = corner(half * s, width);
        g.moveTo(x0 ?? 0, y0 ?? 0).lineTo(x1 ?? 0, y1 ?? 0);
      }
      g.stroke({ width: 1, color: outline, alpha: alpha * 0.6 });
      for (const side of [-1, 1]) {
        const [x0, y0] = corner(-half, side * width);
        const [x1, y1] = corner(half, side * width);
        g.moveTo(x0 ?? 0, y0 ?? 0).lineTo(x1 ?? 0, y1 ?? 0);
      }
      g.stroke({ width: t * 0.07, color, cap: 'round', alpha });
      break;
    }
  }

  // Cracks: one zigzag per hit taken.
  for (let i = 0; i < structure.damage; i++) {
    const c = lerp(p, q, 0.35 + 0.3 * i);
    const len = Math.hypot(across.x, across.y) || 1;
    const n = { x: (across.x / len) * t * 0.14, y: (across.y / len) * t * 0.14 };
    const along = { x: (q.x - p.x) * 0.05, y: (q.y - p.y) * 0.05 };
    g.moveTo(c.x - n.x, c.y - n.y)
      .lineTo(c.x + along.x - n.x * 0.3, c.y + along.y - n.y * 0.3)
      .lineTo(c.x - along.x + n.x * 0.3, c.y - along.y + n.y * 0.3)
      .lineTo(c.x + n.x, c.y + n.y)
      .stroke({ width: t * 0.06, color: PALETTE.crack, cap: 'round', join: 'round', alpha });
  }
}

/** Every edge structure of the game. */
export function drawStructures(g: Graphics, game: GameState): void {
  const grid = mapGrid(game.map);
  g.clear();
  for (const key of structureEdges(game)) {
    const structure = game.edgeStructures[key];
    const segment = edgeSegment(grid, key);
    if (!structure || !segment) continue;
    const [ta, tb] = edgeTiles(key);
    const ca = axialToPixel(grid.coord(ta), TILE_SIZE);
    const cb = axialToPixel(grid.coord(tb), TILE_SIZE);
    drawStructure(g, segment[0], segment[1], { x: cb.x - ca.x, y: cb.y - ca.y }, structure);
  }
}

/** Hits left before a structure falls. */
export function hitsLeft(structure: Pick<EdgeStructure, 'kind' | 'damage'>): number {
  return STRUCTURES[structure.kind].hits - structure.damage;
}
