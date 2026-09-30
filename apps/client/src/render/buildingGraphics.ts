import {
  axialToPixel,
  buildingTiles,
  mapGrid,
  type BuildingKind,
  type GameState,
  type Point,
} from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { buildingEmblem, SHAPE_COLORS, type ShapeColor } from './buildingShapes';
import { TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';
import { tileLayout } from './tileLayout';

/** Draws one building emblem centered at `c`; `size` is the tile size it is drawn for. */
export function drawBuildingEmblem(
  g: Graphics,
  c: Point,
  size: number,
  kind: BuildingKind,
  color: number,
  alpha = 1,
): void {
  const paint = (role: ShapeColor) => (role === 'player' ? color : SHAPE_COLORS[role]);
  const xy = ([x, y]: readonly [number, number]): [number, number] => [
    c.x + x * size,
    c.y + y * size,
  ];
  for (const shape of buildingEmblem(kind)) {
    if (shape.kind === 'poly') {
      g.poly(shape.points.flatMap(xy)).fill({ color: paint(shape.fill), alpha });
      if (shape.stroke > 0) {
        g.stroke({ width: shape.stroke * size, color: PALETTE.iconOutline, join: 'round', alpha });
      }
    } else if (shape.kind === 'circle') {
      g.circle(...xy(shape.at), shape.r * size);
      if (shape.fill) g.fill({ color: paint(shape.fill), alpha });
      if (shape.stroke > 0) {
        g.stroke({
          width: shape.stroke * size,
          color: paint(shape.strokeColor ?? 'outline'),
          alpha,
        });
      }
    } else {
      const [first, ...rest] = shape.points;
      if (!first) continue;
      g.moveTo(...xy(first));
      for (const p of rest) g.lineTo(...xy(p));
      g.stroke({
        width: shape.width * size,
        color: paint(shape.color),
        cap: 'round',
        join: 'round',
        alpha,
      });
    }
  }
}

/** A small status mark on an icon's upper right: an idle building or a hungry unit. */
export function drawStatusMark(g: Graphics, c: Point, size: number, kind: 'idle' | 'hungry'): void {
  const r = 0.12 * size;
  const x = c.x + 0.25 * size;
  const y = c.y - 0.25 * size;
  g.circle(x, y, r)
    .fill(kind === 'idle' ? PALETTE.idleMark : PALETTE.hungryMark)
    .stroke({ width: Math.max(1, 0.025 * size), color: PALETTE.iconOutline });
  if (kind === 'idle') {
    // Pause: two bars.
    for (const dx of [-0.32, 0.32]) {
      g.moveTo(x + dx * r, y - 0.45 * r).lineTo(x + dx * r, y + 0.45 * r);
    }
  } else {
    // Minus: one strength less.
    g.moveTo(x - 0.5 * r, y).lineTo(x + 0.5 * r, y);
  }
  g.stroke({ width: Math.max(1.2, 0.04 * size), color: 0xffffff, cap: 'round' });
}

/** All buildings; idle ones (unpaid upkeep) are faded and marked with a pause sign. */
export function drawBuildings(g: Graphics, game: GameState): void {
  const grid = mapGrid(game.map);
  g.clear();
  for (const tile of buildingTiles(game)) {
    const building = game.buildings[tile];
    const owner = game.owners[tile];
    if (!building || owner === undefined || owner === null) continue;
    const slot = tileLayout(game, tile, axialToPixel(grid.coord(tile), TILE_SIZE)).building;
    if (!slot) continue;
    const size = TILE_SIZE * slot.scale;
    const alpha = building.idle ? 0.55 : 1;
    drawBuildingEmblem(g, slot.point, size, building.kind, playerColor(owner), alpha);
    if (building.idle) drawStatusMark(g, slot.point, size, 'idle');
  }
}
