import { edgeKey, edgeTiles, rectangleGrid, type EdgeKey } from '../../src/hex';
import { createRngState } from '../../src/rng';
import type { Center, GameState, Player, PlayerId, Resources } from '../../src/state/game';
import {
  mapGrid,
  type EdgeFeature,
  type GameMap,
  type Terrain,
  type Tile,
} from '../../src/state/map';

/**
 * ASCII map fixtures for rule tests (PLAN.md 2.4).
 *
 * A fixture is a rectangle of pointy-top hexes in "odd-r" offset rows: every odd row is
 * shifted half a tile right, exactly as it is drawn. Each tile takes a 4-character cell:
 * a token of up to 3 characters, then one separator character.
 *
 *     A*  A   A  |B   B+
 *                 \
 *       A   fA  A  |B   B
 *     .   .   h  =.   ~
 *
 * Token = [terrain][owner][center], each part optional (but not all three):
 *   terrain  `.` plains (default)  `f` forest  `h` hill  `v` hill with ore vein
 *            `^` mountain  `~` sea  `o` lake
 *   owner    `A` `B` `C` `D` = players 0-3 (none = neutral)
 *   center   `*` capital, `+` local center (needs an owner)
 * Plains may omit the terrain character when owned (`A`); a neutral plains tile is `.`.
 *
 * Edges: the separator after a token marks the east edge of that tile: `|` river,
 * `=` ford, space none. The edges between two tile rows (NE/NW/SE/SW sides) are marked
 * in an optional line between them, halfway between the two tiles' cells: `/`, `\` or
 * `|` river, `=` ford. A line with only spaces and edge markers is such an edge line.
 *
 * Common indentation is ignored, so fixtures can be indented template literals.
 */

const TERRAIN_CHARS: Readonly<Record<string, Tile>> = {
  '.': { terrain: 'plains', vein: false },
  f: { terrain: 'forest', vein: false },
  h: { terrain: 'hill', vein: false },
  v: { terrain: 'hill', vein: true },
  '^': { terrain: 'mountain', vein: false },
  '~': { terrain: 'sea', vein: false },
  o: { terrain: 'lake', vein: false },
};

const TERRAIN_TO_CHAR: Readonly<Record<Terrain, string>> = {
  plains: '.',
  forest: 'f',
  hill: 'h',
  mountain: '^',
  sea: '~',
  lake: 'o',
};

const OWNER_CHARS = 'ABCD';
const TOKEN = /^([.fhv^~o])?([A-D])?([*+])?$/;
const EDGE_LINE = /^[\s/\\|=]*$/;
const CELL = 4;

export interface FixtureOptions {
  /** Player count (default: the highest owner letter used, at least 2). */
  readonly players?: number;
  readonly currentPlayer?: PlayerId;
  readonly round?: number;
  /** Treasury of every center (default: empty); override per tile with `withTreasury`. */
  readonly treasury?: Resources;
}

export interface Fixture {
  readonly state: GameState;
  /** Tile index at offset (col, row). */
  readonly tile: (col: number, row: number) => number;
}

function cellStart(col: number, row: number): number {
  return CELL * col + 2 * (row & 1);
}

function edgeKind(char: string): EdgeFeature['kind'] | undefined {
  if (char === '=') return 'ford';
  if (char === '|' || char === '/' || char === '\\') return 'river';
  return undefined;
}

export function parseFixture(text: string, options: FixtureOptions = {}): Fixture {
  const raw = text.split('\n').map((line) => line.replace(/\s+$/, ''));
  while (raw.length > 0 && raw[0] === '') raw.shift();
  while (raw.length > 0 && raw.at(-1) === '') raw.pop();
  const indent = Math.min(
    ...raw.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length),
  );
  const lines = raw.map((l) => l.slice(indent));

  // Split into tile rows and the edge lines between them.
  const rows: string[] = [];
  const between: (string | undefined)[] = [];
  for (const line of lines) {
    if (rows.length > 0 && EDGE_LINE.test(line) && between[rows.length - 1] === undefined) {
      between[rows.length - 1] = line;
    } else {
      rows.push(line);
    }
  }

  const height = rows.length;
  const tokensByRow = rows.map((line, row) => {
    const tokens: { token: string; separator: string }[] = [];
    for (let x = cellStart(0, row); x < line.length; x += CELL) {
      tokens.push({ token: line.slice(x, x + 3).trim(), separator: line[x + 3] ?? ' ' });
    }
    return tokens;
  });
  const width = tokensByRow[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error('Empty fixture');
  tokensByRow.forEach((tokens, row) => {
    if (tokens.length !== width) {
      throw new Error(`Fixture row ${row} has ${tokens.length} tiles, expected ${width}`);
    }
  });

  const grid = rectangleGrid(width, height);
  const index = (col: number, row: number) => row * width + col;
  const tiles: Tile[] = [];
  const owners: (PlayerId | null)[] = [];
  const centers: Record<number, Center> = {};
  const edges: Partial<Record<EdgeKey, EdgeFeature>> = {};
  let highestOwner = -1;

  tokensByRow.forEach((tokens, row) => {
    tokens.forEach(({ token, separator }, col) => {
      const match = token === '' ? null : TOKEN.exec(token);
      if (!match) throw new Error(`Bad fixture token "${token}" at (${col}, ${row})`);
      const [, terrainChar = '.', ownerChar, centerChar] = match;
      tiles.push({ ...(TERRAIN_CHARS[terrainChar] ?? { terrain: 'plains', vein: false }) });
      const owner = ownerChar === undefined ? null : OWNER_CHARS.indexOf(ownerChar);
      owners.push(owner);
      if (owner !== null) highestOwner = Math.max(highestOwner, owner);
      if (centerChar !== undefined) {
        if (owner === null) throw new Error(`Center without owner at (${col}, ${row})`);
        centers[index(col, row)] = {
          kind: centerChar === '*' ? 'capital' : 'local',
          treasury: { ...(options.treasury ?? { gold: 0, food: 0, materials: 0 }) },
        };
      }
      const kind = edgeKind(separator);
      if (kind && col + 1 < width) edges[edgeKey(index(col, row), index(col + 1, row))] = { kind };
    });
  });

  between.forEach((line, row) => {
    if (line === undefined) return;
    if (row + 1 >= height) throw new Error('Fixture edge line after the last row');
    for (let p = 0; p < line.length; p++) {
      const kind = edgeKind(line[p] ?? ' ');
      if (!kind) continue;
      const pair = diagonalAt(p, row, width);
      if (!pair)
        throw new Error(`Edge marker "${line[p]}" at column ${p} below row ${row} hits no edge`);
      edges[edgeKey(index(pair[0], row), index(pair[1], row + 1))] = { kind };
    }
  });

  const playerCount = options.players ?? Math.max(2, highestOwner + 1);
  const players: Player[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    controller: id === 0 ? 'human' : 'ai',
  }));
  const map: GameMap = { seed: 0, shape: { kind: 'rectangle', width, height }, tiles, edges };
  if (mapGrid(map).tileCount !== grid.tileCount) throw new Error('Fixture grid mismatch');

  return {
    state: {
      map,
      round: options.round ?? 1,
      currentPlayer: options.currentPlayer ?? 0,
      players,
      owners,
      centers,
      rng: createRngState(0),
    },
    tile: (col, row) => {
      if (col < 0 || row < 0 || col >= width || row >= height) {
        throw new RangeError(`No fixture tile at (${col}, ${row})`);
      }
      return index(col, row);
    },
  };
}

/**
 * The (upper col, lower col) pair whose shared side is marked at column `p` of the edge
 * line below `row`. Cell centers sit at start + 1; an edge marker sits halfway between
 * the centers of its two tiles.
 */
function diagonalAt(p: number, row: number, width: number): readonly [number, number] | undefined {
  for (const upperCenter of [p - 1, p + 1]) {
    const upper = (upperCenter - 1 - 2 * (row & 1)) / CELL;
    const lowerCenter = 2 * p - upperCenter;
    const lower = (lowerCenter - 1 - 2 * ((row + 1) & 1)) / CELL;
    if (!Number.isInteger(upper) || !Number.isInteger(lower)) continue;
    if (upper < 0 || lower < 0 || upper >= width || lower >= width) continue;
    return [upper, lower];
  }
  return undefined;
}

/** Renders a rectangle-map state in the fixture format (ownership, centers and edges). */
export function renderFixture(state: GameState): string {
  const { shape } = state.map;
  if (shape.kind !== 'rectangle') throw new Error('Only rectangle maps render as fixtures');
  const { width, height } = shape;
  const edge = (a: number, b: number) => state.map.edges[edgeKey(a, b)]?.kind;
  const lines: string[] = [];

  for (let row = 0; row < height; row++) {
    let line = ' '.repeat(cellStart(0, row));
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const tile = state.map.tiles[i];
      const owner = state.owners[i] ?? null;
      const center = state.centers[i];
      let terrain = tile ? (tile.vein ? 'v' : TERRAIN_TO_CHAR[tile.terrain]) : '.';
      if (terrain === '.' && owner !== null) terrain = '';
      const token =
        terrain +
        (owner === null ? '' : (OWNER_CHARS[owner] ?? '?')) +
        (center ? (center.kind === 'capital' ? '*' : '+') : '');
      const kind = col + 1 < width ? edge(i, i + 1) : undefined;
      line += token.padEnd(3) + (kind === 'river' ? '|' : kind === 'ford' ? '=' : ' ');
    }
    lines.push(line.trimEnd());

    if (row + 1 < height) {
      const marks: (string | undefined)[] = [];
      for (const key of Object.keys(state.map.edges) as EdgeKey[]) {
        const [a, b] = edgeTiles(key);
        if (Math.floor(a / width) !== row || Math.floor(b / width) !== row + 1) continue;
        const upperCenter = cellStart(a % width, row) + 1;
        const lowerCenter = cellStart(b % width, row + 1) + 1;
        const p = (upperCenter + lowerCenter) / 2;
        const kind = state.map.edges[key]?.kind;
        marks[p] = kind === 'ford' ? '=' : lowerCenter > upperCenter ? '/' : '\\';
      }
      if (marks.length > 0) lines.push(Array.from(marks, (m) => m ?? ' ').join(''));
    }
  }
  return lines.join('\n');
}

/** Normalizes an indented fixture literal for comparison with `renderFixture`. */
export function normalizeFixture(text: string): string {
  return renderFixture(parseFixture(text).state);
}

/** A copy of the state with a center's treasury replaced. */
export function withTreasury(state: GameState, tile: number, treasury: Resources): GameState {
  const center = state.centers[tile];
  if (!center) throw new Error(`No center on tile ${tile}`);
  return { ...state, centers: { ...state.centers, [tile]: { ...center, treasury } } };
}
