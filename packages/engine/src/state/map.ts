import type { EdgeKey } from '../hex/edge';
import { hexagonGrid, rectangleGrid, type HexGrid } from '../hex/grid';

/**
 * Map part of the game state. Plain, serializable JSON: no classes, no Maps.
 * Derived structures (grid, neighbor tables, vertex graph) are rebuilt from `shape`.
 */

/** Tile terrain (GDD 3.1). Sea is water connected to the map border; lakes are inland. */
export type Terrain = 'sea' | 'lake' | 'plains' | 'forest' | 'hill' | 'mountain';

export const TERRAINS: readonly Terrain[] = ['sea', 'lake', 'plains', 'forest', 'hill', 'mountain'];

export function isWater(terrain: Terrain): boolean {
  return terrain === 'sea' || terrain === 'lake';
}

export function isLand(terrain: Terrain): boolean {
  return !isWater(terrain);
}

export interface Tile {
  readonly terrain: Terrain;
  /** Ore vein (hills only): allows a gold mine (GDD 4.3). */
  readonly vein: boolean;
}

/**
 * Natural edge features created by map generation (GDD 3.2). Built edge structures
 * (bridge, fence, wall, gate) live in `GameState.edgeStructures`.
 * - `river`: blocks movement and splits treasuries.
 * - `ford`: a shallow river crossing; passable and connects treasuries.
 */
export type EdgeKind = 'river' | 'ford';

export interface EdgeFeature {
  readonly kind: EdgeKind;
}

/**
 * Grid shape. Generated maps are hexagons; rectangles (odd-r offset rows) serve the ASCII
 * rule-test fixtures.
 */
export type MapShape =
  | { readonly kind: 'hexagon'; readonly radius: number }
  | { readonly kind: 'rectangle'; readonly width: number; readonly height: number };

export interface GameMap {
  /** Seed the map was generated from. */
  readonly seed: number;
  readonly shape: MapShape;
  /** Indexed by tile index (see HexGrid). */
  readonly tiles: readonly Tile[];
  /** Edge features by edge key; edges without a feature are absent. */
  readonly edges: Readonly<Partial<Record<EdgeKey, EdgeFeature>>>;
}

/** The (memoized) grid of a map. */
export function mapGrid(map: Pick<GameMap, 'shape'>): HexGrid {
  const { shape } = map;
  return shape.kind === 'hexagon'
    ? hexagonGrid(shape.radius)
    : rectangleGrid(shape.width, shape.height);
}

export function sameShape(a: MapShape, b: MapShape): boolean {
  if (a.kind === 'hexagon') return b.kind === 'hexagon' && a.radius === b.radius;
  return b.kind === 'rectangle' && a.width === b.width && a.height === b.height;
}

/** Tiles that can be owned: land that is not an impassable mountain (GDD 3.1). */
export function isOwnable(terrain: Terrain): boolean {
  return terrain === 'plains' || terrain === 'forest' || terrain === 'hill';
}
