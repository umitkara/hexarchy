import { axialRound, type Axial } from './axial';

/**
 * Pure pixel <-> hex math for pointy-top hexes. `size` is the hex circumradius
 * (center-to-corner distance). A tile is √3·size wide and 2·size tall.
 *
 * Only +, -, *, / are used (no trigonometry), so results are bit-identical across
 * JS engines — the map generator relies on these positions.
 */

/** √3 as a literal (Math.sqrt is fine in practice, but the literal is unambiguous). */
export const SQRT3 = 1.7320508075688772;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Unit corner offsets. Corner c sits at angle 60·c − 30 degrees (screen y down):
 * 0 upper-right, 1 lower-right, 2 bottom, 3 lower-left, 4 upper-left, 5 top.
 * Side d (towards neighbor direction d) runs from corner d to corner d+1.
 */
const UNIT_CORNERS: readonly Point[] = [
  { x: SQRT3 / 2, y: -0.5 },
  { x: SQRT3 / 2, y: 0.5 },
  { x: 0, y: 1 },
  { x: -SQRT3 / 2, y: 0.5 },
  { x: -SQRT3 / 2, y: -0.5 },
  { x: 0, y: -1 },
];

/** Hex center in pixels. */
export function axialToPixel(hex: Axial, size: number): Point {
  return { x: size * SQRT3 * (hex.q + hex.r / 2), y: size * 1.5 * hex.r };
}

/** Fractional axial coordinates of a pixel position (not rounded). */
export function pixelToFractionalAxial(point: Point, size: number): { q: number; r: number } {
  return {
    q: ((SQRT3 / 3) * point.x - point.y / 3) / size,
    r: ((2 / 3) * point.y) / size,
  };
}

/** The hex containing a pixel position. */
export function pixelToAxial(point: Point, size: number): Axial {
  const { q, r } = pixelToFractionalAxial(point, size);
  return axialRound(q, r);
}

/** Offset of corner `corner` (0..5) from the hex center. */
export function cornerOffset(corner: number, size: number): Point {
  const unit = UNIT_CORNERS[((corner % 6) + 6) % 6] ?? { x: 0, y: 0 };
  return { x: unit.x * size, y: unit.y * size };
}

/** Absolute position of a hex corner. */
export function cornerPosition(hex: Axial, corner: number, size: number): Point {
  const center = axialToPixel(hex, size);
  const offset = cornerOffset(corner, size);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

/** Hexagon outline as a flat [x0, y0, x1, y1, ...] array, e.g. for polygon drawing. */
export function hexPolygon(center: Point, size: number): number[] {
  const points: number[] = [];
  for (const unit of UNIT_CORNERS) points.push(center.x + unit.x * size, center.y + unit.y * size);
  return points;
}

export interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Pixel bounding box of a set of hexes (including their full outlines). */
export function hexBounds(coords: readonly Axial[], size: number): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hex of coords) {
    const { x, y } = axialToPixel(hex, size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const halfWidth = (SQRT3 / 2) * size;
  return { minX: minX - halfWidth, minY: minY - size, maxX: maxX + halfWidth, maxY: maxY + size };
}
