import { axialNeighbor, DIRECTIONS, rotateDirection, type Axial, type Direction } from './axial';
import { edgeKey, edgeTiles, type EdgeKey } from './edge';
import { NO_TILE, type HexGrid } from './grid';
import { cornerPosition, type Point } from './layout';

/**
 * Hex corners ("vertices") and the sides connecting them. Used by map generation:
 * rivers flow from corner to corner, so a river is naturally a sequence of edges.
 *
 * Corner c of a tile touches the tile itself and its neighbors in directions c-1 and c
 * (see layout.ts for the corner numbering). A vertex is identified by that set of three
 * hexes, so the same corner seen from different tiles maps to the same vertex.
 */

export interface VertexLink {
  /** The adjacent vertex. */
  readonly vertex: number;
  /** The tile side between the two vertices, or null if one side of it is off-map. */
  readonly edge: EdgeKey | null;
}

export interface Vertex {
  /** On-map tiles touching this corner (1 to 3; fewer than 3 on the map border). */
  readonly tiles: readonly number[];
  /** A tile and its corner index at this vertex, for positioning. */
  readonly anchorTile: number;
  readonly anchorCorner: Direction;
  /** Adjacent vertices (2 or 3), each joined by one tile side. */
  readonly links: readonly VertexLink[];
}

interface MutableVertex {
  tiles: number[];
  anchorTile: number;
  anchorCorner: Direction;
  links: VertexLink[];
}

function hexKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

export class VertexGraph {
  readonly vertices: readonly Vertex[];
  readonly #grid: HexGrid;
  /** `#tileCorners[tile * 6 + corner]` = vertex index. */
  readonly #tileCorners: Int32Array;

  constructor(grid: HexGrid) {
    this.#grid = grid;
    this.#tileCorners = new Int32Array(grid.tileCount * 6);
    const vertices: MutableVertex[] = [];
    const byKey = new Map<string, number>();

    for (let tile = 0; tile < grid.tileCount; tile++) {
      const hex = grid.coord(tile);
      for (const corner of DIRECTIONS) {
        const key = [
          hex,
          axialNeighbor(hex, rotateDirection(corner, -1)),
          axialNeighbor(hex, corner),
        ]
          .map(hexKey)
          .sort()
          .join('|');
        let vertex = byKey.get(key);
        if (vertex === undefined) {
          vertex = vertices.length;
          byKey.set(key, vertex);
          vertices.push({ tiles: [], anchorTile: tile, anchorCorner: corner, links: [] });
        }
        vertices[vertex]?.tiles.push(tile);
        this.#tileCorners[tile * 6 + corner] = vertex;
      }
    }

    for (let tile = 0; tile < grid.tileCount; tile++) {
      for (const side of DIRECTIONS) {
        const from = this.vertexAt(tile, side);
        const to = this.vertexAt(tile, rotateDirection(side, 1));
        const neighbor = grid.neighbor(tile, side);
        const edge = neighbor === NO_TILE ? null : edgeKey(tile, neighbor);
        for (const [a, b] of [
          [from, to],
          [to, from],
        ] as const) {
          const links = vertices[a]?.links;
          if (links && !links.some((link) => link.vertex === b)) links.push({ vertex: b, edge });
        }
      }
    }

    this.vertices = vertices;
  }

  get vertexCount(): number {
    return this.vertices.length;
  }

  vertex(index: number): Vertex {
    const v = this.vertices[index];
    if (!v) throw new RangeError(`Vertex index out of range: ${index}`);
    return v;
  }

  /** Vertex at corner `corner` of tile `tile`. */
  vertexAt(tile: number, corner: Direction): number {
    const v = this.#tileCorners[tile * 6 + corner];
    if (v === undefined || !this.#grid.has(tile)) {
      throw new RangeError(`Tile index out of range: ${tile}`);
    }
    return v;
  }

  /** The two vertices at the ends of an edge. */
  edgeVertices(key: EdgeKey): readonly [number, number] {
    const [a, b] = edgeTiles(key);
    const side = this.#grid.directionTo(a, b);
    if (side === undefined) throw new RangeError(`Not an edge of this grid: ${key}`);
    return [this.vertexAt(a, side), this.vertexAt(a, rotateDirection(side, 1))];
  }

  /** Pixel position of a vertex (see layout.ts). */
  position(index: number, size: number): Point {
    const v = this.vertex(index);
    return cornerPosition(this.#grid.coord(v.anchorTile), v.anchorCorner, size);
  }
}

const vertexGraphCache = new WeakMap<HexGrid, VertexGraph>();

/** Vertex graph of a grid (memoized per grid). */
export function vertexGraph(grid: HexGrid): VertexGraph {
  let graph = vertexGraphCache.get(grid);
  if (!graph) {
    graph = new VertexGraph(grid);
    vertexGraphCache.set(grid, graph);
  }
  return graph;
}
