import type { EdgeKey } from '../hex/edge';
import { hexagonGrid, type HexGrid } from '../hex/grid';

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
 * (bridge, fence, wall, gate) join in M5.
 * - `river`: blocks movement and splits treasuries.
 * - `ford`: a shallow river crossing; passable and connects treasuries.
 */
export type EdgeKind = 'river' | 'ford';

export interface EdgeFeature {
  readonly kind: EdgeKind;
}

export interface MapShape {
  readonly kind: 'hexagon';
  readonly radius: number;
}

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
  return hexagonGrid(map.shape.radius);
}
