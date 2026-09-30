import { describe, expect, it } from 'vitest';
import { edgeKey } from '../src/hex';
import { mapGrid } from '../src/state';
import { normalizeFixture, parseFixture, renderFixture } from './fixtures/ascii';

describe('ASCII fixtures', () => {
  const doc = parseFixture(`
    A*  A   A  |B   B+
                \\
      A   fA  A  |B   B
    .   .   h  =.   ~
  `);
  const { state, tile } = doc;

  it('reads terrain, owners and centers row by row', () => {
    expect(state.map.shape).toEqual({ kind: 'rectangle', width: 5, height: 3 });
    expect(state.players).toHaveLength(2);
    expect(state.owners.slice(0, 5)).toEqual([0, 0, 0, 1, 1]);
    expect(state.owners.slice(10)).toEqual([null, null, null, null, null]);
    expect(state.map.tiles[tile(1, 1)]?.terrain).toBe('forest');
    expect(state.map.tiles[tile(2, 2)]?.terrain).toBe('hill');
    expect(state.map.tiles[tile(4, 2)]?.terrain).toBe('sea');
    expect(state.centers[tile(0, 0)]?.kind).toBe('capital');
    expect(state.centers[tile(4, 0)]?.kind).toBe('local');
    expect(Object.keys(state.centers)).toHaveLength(2);
  });

  it('lays rows out odd-r: odd rows sit half a tile to the right', () => {
    const grid = mapGrid(state.map);
    // (0,1) touches (0,0) and (1,0) above it, (0,2) and (1,2) below it.
    for (const [col, row] of [
      [0, 0],
      [1, 0],
      [0, 2],
      [1, 2],
    ] as const) {
      expect(grid.areAdjacent(tile(0, 1), tile(col, row))).toBe(true);
    }
    expect(grid.areAdjacent(tile(1, 1), tile(0, 0))).toBe(false);
  });

  it('reads edges from separators and from the lines between rows', () => {
    expect(state.map.edges).toEqual({
      [edgeKey(tile(2, 0), tile(3, 0))]: { kind: 'river' },
      [edgeKey(tile(3, 0), tile(2, 1))]: { kind: 'river' },
      [edgeKey(tile(2, 1), tile(3, 1))]: { kind: 'river' },
      [edgeKey(tile(2, 2), tile(3, 2))]: { kind: 'ford' },
    });
  });

  it('renders back to the same text', () => {
    expect(renderFixture(state)).toBe(
      ['A*  A   A  |B   B+', '            \\', '  A   fA  A  |B   B', '.   .   h  =.   ~'].join(
        '\n',
      ),
    );
    const text = renderFixture(state);
    expect(renderFixture(parseFixture(text).state)).toBe(text);
    expect(normalizeFixture(`\n      .   A*\n        B+  .\n`)).toBe('.   A*\n  B+  .');
  });

  it('accepts any river mark between rows and fords there too', () => {
    const f = parseFixture(`
      A   A
        /   =
        A   A
    `);
    expect(f.state.map.edges).toEqual({
      [edgeKey(f.tile(0, 0), f.tile(0, 1))]: { kind: 'river' },
      [edgeKey(f.tile(1, 0), f.tile(1, 1))]: { kind: 'ford' },
    });
  });

  it('rejects malformed fixtures', () => {
    expect(() => parseFixture('A   B\n  A')).toThrow(/row 1 has 1 tiles/);
    expect(() => parseFixture('A   Bx')).toThrow(/Bad fixture token/);
    expect(() => parseFixture('.*')).toThrow(/Center without owner/);
    expect(() => parseFixture('A   A\n /\n  A   A')).toThrow(/hits no edge/);
  });
});
