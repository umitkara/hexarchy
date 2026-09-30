/**
 * Axial hex coordinates (q, r), pointy-top orientation.
 *
 * Why pointy-top: tiles form horizontal rows, which read naturally on both landscape
 * desktop and portrait mobile screens, keep the map shape symmetric left/right, and make
 * row-based ASCII fixtures (rules tests) straightforward to write.
 *
 * Screen convention: x grows right, y grows down. The cube coordinate s = -q - r.
 */
export interface Axial {
  readonly q: number;
  readonly r: number;
}

/**
 * Neighbor direction index, clockwise on screen starting east:
 * 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE.
 * Direction d is also the tile side between corners d and d+1 (see layout.ts).
 */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5];

const DIRECTION_VECTORS: Readonly<Record<Direction, Axial>> = {
  0: { q: 1, r: 0 },
  1: { q: 0, r: 1 },
  2: { q: -1, r: 1 },
  3: { q: -1, r: 0 },
  4: { q: 0, r: -1 },
  5: { q: 1, r: -1 },
};

export function directionVector(direction: Direction): Axial {
  return DIRECTION_VECTORS[direction];
}

export function oppositeDirection(direction: Direction): Direction {
  return ((direction + 3) % 6) as Direction;
}

/** Direction rotated by `steps` sixths of a turn clockwise (negative = counter-clockwise). */
export function rotateDirection(direction: Direction, steps: number): Direction {
  return ((((direction + steps) % 6) + 6) % 6) as Direction;
}

export function axial(q: number, r: number): Axial {
  // `+ 0` normalizes -0 so that coordinates compare and serialize cleanly.
  return { q: q + 0, r: r + 0 };
}

export function axialAdd(a: Axial, b: Axial): Axial {
  return axial(a.q + b.q, a.r + b.r);
}

export function axialEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

export function axialNeighbor(hex: Axial, direction: Direction): Axial {
  return axialAdd(hex, DIRECTION_VECTORS[direction]);
}

/** Number of steps between two hexes. */
export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Rounds fractional axial coordinates to the hex that contains them (cube rounding). */
export function axialRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return axial(rq, rr);
}

/** Hexes at exactly `radius` steps from `center`, clockwise starting from the west-most. */
export function axialRing(center: Axial, radius: number): Axial[] {
  if (radius === 0) return [axial(center.q, center.r)];
  const ring: Axial[] = [];
  // Start `radius` steps west (direction 3), then walk each of the six sides.
  let hex = axial(center.q - radius, center.r);
  const walk: Direction[] = [5, 0, 1, 2, 3, 4];
  for (const direction of walk) {
    for (let i = 0; i < radius; i++) {
      ring.push(hex);
      hex = axialNeighbor(hex, direction);
    }
  }
  return ring;
}

/**
 * All hexes within `radius` of the origin (a hexagon-shaped map), in row-major order:
 * rows top to bottom (r ascending), each row left to right (q ascending).
 * Count: 3·radius² + 3·radius + 1.
 */
export function hexagonCoords(radius: number): Axial[] {
  const coords: Axial[] = [];
  for (let r = -radius; r <= radius; r++) {
    const qMin = Math.max(-radius, -r - radius);
    const qMax = Math.min(radius, -r + radius);
    for (let q = qMin; q <= qMax; q++) coords.push(axial(q, r));
  }
  return coords;
}
