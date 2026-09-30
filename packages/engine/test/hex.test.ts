import { describe, expect, it } from 'vitest';
import {
  axial,
  axialDistance,
  axialNeighbor,
  axialRing,
  axialRound,
  axialToPixel,
  cornerPosition,
  DIRECTIONS,
  directionVector,
  edgeKey,
  edgeTiles,
  gridEdges,
  hexagonCoords,
  hexagonGrid,
  HexGrid,
  hexBounds,
  NO_TILE,
  oppositeDirection,
  pixelToAxial,
  rotateDirection,
  SQRT3,
  vertexGraph,
  type Point,
} from '../src/hex';
import { Rng } from '../src/rng';

const SIZE = 10;

function close(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

describe('axial coordinates', () => {
  it('has six unit directions, clockwise from east, with opposites summing to zero', () => {
    expect(DIRECTIONS.map(directionVector)).toEqual([
      axial(1, 0),
      axial(0, 1),
      axial(-1, 1),
      axial(-1, 0),
      axial(0, -1),
      axial(1, -1),
    ]);
    for (const d of DIRECTIONS) {
      const v = directionVector(d);
      const o = directionVector(oppositeDirection(d));
      expect(axial(v.q + o.q, v.r + o.r)).toEqual(axial(0, 0));
      expect(axialDistance(axial(0, 0), v)).toBe(1);
    }
  });

  it('rotates directions both ways', () => {
    expect(rotateDirection(5, 1)).toBe(0);
    expect(rotateDirection(0, -1)).toBe(5);
    expect(rotateDirection(2, 3)).toBe(oppositeDirection(2));
  });

  it('measures distance as a metric', () => {
    const a = axial(2, -3);
    const b = axial(-1, 4);
    const c = axial(0, 0);
    expect(axialDistance(a, a)).toBe(0);
    expect(axialDistance(a, b)).toBe(axialDistance(b, a));
    expect(axialDistance(a, b)).toBe(7);
    expect(axialDistance(a, b)).toBeLessThanOrEqual(axialDistance(a, c) + axialDistance(c, b));
  });

  it('builds rings of 6 * radius hexes at exactly that distance', () => {
    const center = axial(3, -2);
    expect(axialRing(center, 0)).toEqual([center]);
    for (const radius of [1, 2, 5]) {
      const ring = axialRing(center, radius);
      expect(ring).toHaveLength(6 * radius);
      expect(new Set(ring.map((h) => `${h.q},${h.r}`)).size).toBe(6 * radius);
      for (const hex of ring) expect(axialDistance(hex, center)).toBe(radius);
    }
  });

  it('lists hexagon coordinates row by row', () => {
    for (const radius of [0, 1, 4, 16]) {
      expect(hexagonCoords(radius)).toHaveLength(3 * radius * radius + 3 * radius + 1);
    }
    const coords = hexagonCoords(2);
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      if (!prev || !cur) throw new Error('unreachable');
      expect(prev.r < cur.r || (prev.r === cur.r && prev.q < cur.q)).toBe(true);
    }
  });

  it('rounds fractional coordinates to the nearest hex, without -0', () => {
    expect(axialRound(0.1, -0.1)).toEqual(axial(0, 0));
    expect(Object.is(axialRound(-0.2, 0.1).q, -0)).toBe(false);
    expect(axialRound(1.6, -0.4)).toEqual(axial(2, -1));
  });
});

describe('pixel layout (pointy-top)', () => {
  it('places neighbor centers sqrt(3) * size apart', () => {
    const origin = axialToPixel(axial(0, 0), SIZE);
    for (const d of DIRECTIONS) {
      const p = axialToPixel(directionVector(d), SIZE);
      expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeCloseTo(SQRT3 * SIZE, 9);
    }
    // East is to the right, south-east is below.
    expect(axialToPixel(axial(1, 0), SIZE).y).toBe(0);
    expect(axialToPixel(axial(0, 1), SIZE).y).toBeGreaterThan(0);
  });

  it('round-trips hex centers through pixels', () => {
    for (const hex of hexagonCoords(6)) {
      expect(pixelToAxial(axialToPixel(hex, SIZE), SIZE)).toEqual(hex);
    }
  });

  it('maps points inside a hex (within its inner radius) to that hex', () => {
    const rng = Rng.fromSeed(1);
    const inner = (SQRT3 / 2) * SIZE * 0.999;
    for (const hex of hexagonCoords(4)) {
      const c = axialToPixel(hex, SIZE);
      for (let i = 0; i < 5; i++) {
        const angle = rng.float() * 2 * Math.PI;
        const r = rng.float() * inner;
        const p = { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r };
        expect(pixelToAxial(p, SIZE)).toEqual(hex);
      }
    }
  });

  it('shares side corners with the neighbor: side d of A is side d+3 of B', () => {
    const a = axial(1, -2);
    for (const d of DIRECTIONS) {
      const b = axialNeighbor(a, d);
      const o = oppositeDirection(d);
      const aStart = cornerPosition(a, d, SIZE);
      const aEnd = cornerPosition(a, rotateDirection(d, 1), SIZE);
      expect(close(aStart, cornerPosition(b, rotateDirection(o, 1), SIZE))).toBe(true);
      expect(close(aEnd, cornerPosition(b, o, SIZE))).toBe(true);
    }
  });

  it('bounds a set of hexes including their outlines', () => {
    const b = hexBounds([axial(0, 0)], SIZE);
    expect(b.maxX - b.minX).toBeCloseTo(SQRT3 * SIZE, 9);
    expect(b.maxY - b.minY).toBeCloseTo(2 * SIZE, 9);
  });
});

describe('HexGrid', () => {
  const grid = hexagonGrid(3);

  it('indexes tiles and looks them up by coordinate', () => {
    expect(grid.tileCount).toBe(37);
    grid.coords.forEach((c, i) => {
      expect(grid.indexOf(c.q, c.r)).toBe(i);
    });
    expect(grid.indexOf(4, 0)).toBe(NO_TILE);
    expect(grid.indexOf(2, 2)).toBe(NO_TILE);
    expect(grid.indexOf(-100, 100)).toBe(NO_TILE);
  });

  it('precomputes symmetric neighbors', () => {
    for (let a = 0; a < grid.tileCount; a++) {
      for (const d of DIRECTIONS) {
        const b = grid.neighbor(a, d);
        if (b === NO_TILE) continue;
        expect(grid.neighbor(b, oppositeDirection(d))).toBe(a);
        expect(grid.directionTo(a, b)).toBe(d);
        expect(grid.distance(a, b)).toBe(1);
      }
    }
  });

  it('gives interior tiles six neighbors and border tiles fewer', () => {
    const center = grid.indexOf(0, 0);
    expect(grid.neighbors(center)).toHaveLength(6);
    expect(grid.isBorder(center)).toBe(false);
    expect(grid.neighbors(grid.indexOf(3, 0))).toHaveLength(3); // corner
    expect(grid.neighbors(grid.indexOf(3, -1))).toHaveLength(4); // side
    expect(grid.coords.filter((_, i) => grid.isBorder(i))).toHaveLength(18);
  });

  it('supports arbitrary shapes (e.g. small test fixtures)', () => {
    const line = new HexGrid([axial(0, 0), axial(1, 0), axial(2, 0)]);
    expect(line.neighbors(1)).toEqual([2, 0]);
    expect(line.areAdjacent(0, 2)).toBe(false);
    expect(() => new HexGrid([axial(0, 0), axial(0, 0)])).toThrow(RangeError);
  });

  it('memoizes hexagon grids', () => {
    expect(hexagonGrid(3)).toBe(grid);
  });
});

describe('edges', () => {
  it('keys an edge by its ordered tile pair', () => {
    expect(edgeKey(7, 3)).toBe('3_7');
    expect(edgeKey(3, 7)).toBe(edgeKey(7, 3));
    expect(edgeTiles(edgeKey(12, 5))).toEqual([5, 12]);
    expect(() => edgeKey(4, 4)).toThrow(RangeError);
  });

  it('lists every adjacent pair once: 9R^2 + 3R edges in a hexagon', () => {
    for (const radius of [1, 2, 5]) {
      const grid = hexagonGrid(radius);
      const edges = gridEdges(grid);
      expect(edges).toHaveLength(9 * radius * radius + 3 * radius);
      expect(new Set(edges).size).toBe(edges.length);
      for (const key of edges) {
        const [a, b] = edgeTiles(key);
        expect(grid.areAdjacent(a, b)).toBe(true);
      }
    }
  });
});

describe('vertices', () => {
  it('has 6(R+1)^2 corners in a hexagon grid', () => {
    for (const radius of [0, 1, 3]) {
      expect(vertexGraph(hexagonGrid(radius)).vertexCount).toBe(6 * (radius + 1) ** 2);
    }
  });

  it('shares each corner between the tiles touching it, at the same position', () => {
    const grid = hexagonGrid(3);
    const graph = vertexGraph(grid);
    for (let tile = 0; tile < grid.tileCount; tile++) {
      for (const corner of DIRECTIONS) {
        const v = graph.vertexAt(tile, corner);
        expect(graph.vertex(v).tiles).toContain(tile);
        const expected = cornerPosition(grid.coord(tile), corner, SIZE);
        expect(close(graph.position(v, SIZE), expected)).toBe(true);
      }
    }
    for (const v of graph.vertices) {
      expect(v.tiles.length).toBeGreaterThanOrEqual(1);
      expect(v.tiles.length).toBeLessThanOrEqual(3);
    }
    const center = grid.indexOf(0, 0);
    expect(graph.vertex(graph.vertexAt(center, 0)).tiles).toHaveLength(3);
  });

  it('links adjacent corners along tile sides, naming the edge between', () => {
    const grid = hexagonGrid(3);
    const graph = vertexGraph(grid);
    graph.vertices.forEach((v, index) => {
      expect(v.links.length).toBeGreaterThanOrEqual(2);
      expect(v.links.length).toBeLessThanOrEqual(3);
      for (const link of v.links) {
        const other = graph.vertex(link.vertex);
        expect(other.links.some((l) => l.vertex === index && l.edge === link.edge)).toBe(true);
        const shared = v.tiles.filter((t) => other.tiles.includes(t));
        if (link.edge === null) {
          expect(shared).toHaveLength(1);
        } else {
          expect([...shared].sort((a, b) => a - b)).toEqual(edgeTiles(link.edge));
          expect(graph.edgeVertices(link.edge)).toContain(index);
        }
      }
    });
  });

  it('gives interior corners three links', () => {
    const graph = vertexGraph(hexagonGrid(3));
    const interior = graph.vertices.filter((v) => v.tiles.length === 3);
    expect(interior.length).toBeGreaterThan(0);
    for (const v of interior) expect(v.links).toHaveLength(3);
  });
});
