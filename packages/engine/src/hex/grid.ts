import {
  axial,
  axialDistance,
  axialNeighbor,
  DIRECTIONS,
  hexagonCoords,
  type Axial,
  type Direction,
} from './axial';

/** Sentinel for "no tile" (off-map neighbor, lookup miss). */
export const NO_TILE = -1;

/**
 * Tile index space of a map. Tiles are identified by their index into a flat array
 * (`state.tiles[index]`); neighbors are precomputed.
 *
 * A grid is derived data: it is rebuilt from the map shape, never stored in game state.
 */
export class HexGrid {
  readonly coords: readonly Axial[];
  readonly tileCount: number;
  /** `neighborTable[index * 6 + direction]` = neighbor tile index, or NO_TILE if off-map. */
  readonly neighborTable: Int32Array;
  readonly #neighborLists: readonly (readonly number[])[];
  readonly #minQ: number;
  readonly #minR: number;
  readonly #spanQ: number;
  readonly #spanR: number;
  readonly #lookup: Int32Array;

  constructor(coords: readonly Axial[]) {
    if (coords.length === 0) throw new RangeError('A grid needs at least one tile');
    this.coords = coords.map((c) => axial(c.q, c.r));
    this.tileCount = coords.length;

    let minQ = Infinity;
    let minR = Infinity;
    let maxQ = -Infinity;
    let maxR = -Infinity;
    for (const c of coords) {
      minQ = Math.min(minQ, c.q);
      minR = Math.min(minR, c.r);
      maxQ = Math.max(maxQ, c.q);
      maxR = Math.max(maxR, c.r);
    }
    this.#minQ = minQ;
    this.#minR = minR;
    this.#spanQ = maxQ - minQ + 1;
    this.#spanR = maxR - minR + 1;
    this.#lookup = new Int32Array(this.#spanQ * this.#spanR).fill(NO_TILE);
    coords.forEach((c, index) => {
      const slot = this.#slot(c.q, c.r);
      if (this.#lookup[slot] !== NO_TILE) {
        throw new RangeError(`Duplicate grid coordinate (${c.q}, ${c.r})`);
      }
      this.#lookup[slot] = index;
    });

    this.neighborTable = new Int32Array(this.tileCount * 6);
    const lists: number[][] = [];
    this.coords.forEach((c, index) => {
      const list: number[] = [];
      for (const d of DIRECTIONS) {
        const n = axialNeighbor(c, d);
        const neighbor = this.indexOf(n.q, n.r);
        this.neighborTable[index * 6 + d] = neighbor;
        if (neighbor !== NO_TILE) list.push(neighbor);
      }
      lists.push(list);
    });
    this.#neighborLists = lists;
  }

  #slot(q: number, r: number): number {
    return (q - this.#minQ) * this.#spanR + (r - this.#minR);
  }

  /** Tile index at (q, r), or NO_TILE if the coordinate is off the map. */
  indexOf(q: number, r: number): number {
    const dq = q - this.#minQ;
    const dr = r - this.#minR;
    if (dq < 0 || dr < 0 || dq >= this.#spanQ || dr >= this.#spanR) return NO_TILE;
    return this.#lookup[this.#slot(q, r)] ?? NO_TILE;
  }

  has(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.tileCount;
  }

  coord(index: number): Axial {
    const c = this.coords[index];
    if (!c) throw new RangeError(`Tile index out of range: ${index}`);
    return c;
  }

  /** Neighbor of a tile in a direction, or NO_TILE if off-map. */
  neighbor(index: number, direction: Direction): number {
    return this.neighborTable[index * 6 + direction] ?? NO_TILE;
  }

  /** On-map neighbors of a tile, in direction order. */
  neighbors(index: number): readonly number[] {
    const list = this.#neighborLists[index];
    if (!list) throw new RangeError(`Tile index out of range: ${index}`);
    return list;
  }

  /** Direction from tile `a` to adjacent tile `b`, or undefined if they are not adjacent. */
  directionTo(a: number, b: number): Direction | undefined {
    for (const d of DIRECTIONS) if (this.neighbor(a, d) === b) return d;
    return undefined;
  }

  areAdjacent(a: number, b: number): boolean {
    return a !== b && this.directionTo(a, b) !== undefined;
  }

  distance(a: number, b: number): number {
    return axialDistance(this.coord(a), this.coord(b));
  }

  /** True if the tile is missing at least one neighbor (it lies on the map border). */
  isBorder(index: number): boolean {
    return this.neighbors(index).length < 6;
  }
}

const hexagonGridCache = new Map<number, HexGrid>();

/** Hexagon-shaped grid of the given radius (memoized; grids are immutable). */
export function hexagonGrid(radius: number): HexGrid {
  let grid = hexagonGridCache.get(radius);
  if (!grid) {
    grid = new HexGrid(hexagonCoords(radius));
    hexagonGridCache.set(radius, grid);
  }
  return grid;
}
