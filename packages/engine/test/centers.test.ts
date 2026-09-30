import { describe, expect, it } from 'vitest';
import { apply, validate, type Command } from '../src/commands';
import type { GameEvent } from '../src/rules';
import type { GameState, PlayerId, Resources } from '../src/state';
import { normalizeFixture, parseFixture, renderFixture, withTreasury } from './fixtures/ascii';
import { expectCenterInvariants } from './fixtures/invariants';

const gold = (amount: number): Resources => ({ gold: amount, food: 0, materials: 0 });

function paint(state: GameState, tile: number, owner: PlayerId | null) {
  const command: Command = { type: 'debugPaint', tile, owner };
  const result = apply(state, command);
  expectCenterInvariants(result.state);
  return result;
}

function eventsOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T) {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

describe('split (GDD 4.2)', () => {
  it('keeps the treasury with the center; a 2+ tile piece gets an empty local center', () => {
    const f = parseFixture('A*  A   A   A   A');
    const state = withTreasury(f.state, f.tile(0, 0), gold(12));
    const { state: next, events } = paint(state, f.tile(2, 0), null);

    expect(renderFixture(next)).toBe('A*  A   .   A+  A');
    expect(next.centers[f.tile(0, 0)]?.treasury).toEqual(gold(12));
    expect(next.centers[f.tile(3, 0)]).toEqual({ kind: 'local', treasury: gold(0) });
    expect(eventsOf(events, 'centerFounded')).toEqual([
      { type: 'centerFounded', tile: f.tile(3, 0), owner: 0 },
    ]);
  });

  it('leaves a single-tile piece without a treasury', () => {
    const f = parseFixture('A*  A   A');
    const { state } = paint(f.state, f.tile(1, 0), null);
    expect(renderFixture(state)).toBe('A*  .   A');
  });

  it('founds a center in every piece of 2+ tiles', () => {
    const f = parseFixture(`
      A   A   .   A   A
        .   A*  A   .   .
      A   A   .   A   A
    `);
    // Painting the capital's east neighbor to B cuts off the top-right and bottom-right
    // pairs; the west side stays with the capital.
    const { state } = paint(f.state, f.tile(2, 1), 1);
    expect(renderFixture(state)).toBe(
      normalizeFixture(`
        A   A   .   A+  A
          .   A*  B   .   .
        A   A   .   A+  A
      `),
    );
  });

  it('places the new center on the innermost tile of the piece', () => {
    const f = parseFixture(`
      A*  A   .   .   .
        .   A   A   A   .
      .   .   A   A   A
        .   .   A   A   .
      .   .   .   .   .
    `);
    // Cutting (1,1) leaves the capital with (1,0); in the blob only (3,2) is surrounded.
    const { state } = paint(f.state, f.tile(1, 1), null);
    expect(state.centers[f.tile(3, 2)]?.kind).toBe('local');
  });

  it('happens when a ford loses a bank tile: the river alone keeps the banks apart', () => {
    const f = parseFixture(`
      A*  A  |A   A
              =
        A   A  |A   A
    `);
    // The ford (2,0)-(1,1) is the only link between the banks.
    const { state } = paint(f.state, f.tile(2, 0), null);
    expect(renderFixture(state)).toBe(
      normalizeFixture(`
        A*  A  |.   A+
                =
          A   A  |A   A
      `),
    );
  });
});

describe('merge (GDD 4.2)', () => {
  it('sums the treasuries into the capital; the local center goes', () => {
    const f = parseFixture('A*  A   .   A+  A');
    let state = withTreasury(f.state, f.tile(0, 0), gold(10));
    state = withTreasury(state, f.tile(3, 0), { gold: 5, food: 2, materials: 1 });
    const { state: next, events } = paint(state, f.tile(2, 0), 0);

    expect(renderFixture(next)).toBe('A*  A   A   A   A');
    expect(next.centers[f.tile(0, 0)]?.treasury).toEqual({ gold: 15, food: 2, materials: 1 });
    expect(eventsOf(events, 'treasuriesMerged')).toEqual([
      {
        type: 'treasuriesMerged',
        owner: 0,
        center: f.tile(0, 0),
        absorbed: [f.tile(3, 0)],
        treasury: { gold: 15, food: 2, materials: 1 },
      },
    ]);
  });

  it('keeps the capital even when its region is the smaller one', () => {
    const f = parseFixture('A*  .   A+  A   A   A');
    const { state } = paint(f.state, f.tile(1, 0), 0);
    expect(renderFixture(state)).toBe('A*  A   A   A   A   A');
  });

  it('keeps the center of the larger region when neither is the capital', () => {
    const f = parseFixture(`
      A*  .   A   .   .   .
        .   A+  A   .   A   A+
    `);
    // West: 3 tiles, 3 gold. East: 2 tiles, 9 gold. Size wins over gold.
    let state = withTreasury(f.state, f.tile(1, 1), gold(3));
    state = withTreasury(state, f.tile(5, 1), gold(9));
    const { state: next } = paint(state, f.tile(3, 1), 0);
    expect(renderFixture(next)).toBe(
      normalizeFixture(`
        A*  .   A   .   .   .
          .   A+  A   A   A   A
      `),
    );
    expect(next.centers[f.tile(1, 1)]?.treasury).toEqual(gold(12));
  });

  it('breaks a size tie by gold, then by the lowest tile index', () => {
    const f = parseFixture('A+  A   .   A   A+');
    const richer = withTreasury(
      withTreasury(f.state, f.tile(0, 0), gold(2)),
      f.tile(4, 0),
      gold(7),
    );
    expect(renderFixture(paint(richer, f.tile(2, 0), 0).state)).toBe('A   A   A   A   A+');
    expect(renderFixture(paint(f.state, f.tile(2, 0), 0).state)).toBe('A+  A   A   A   A');
  });

  it('merges three regions at once into one treasury', () => {
    const f = parseFixture(`
      .   .   .   A*  A
        A+  A   .   .   .
      .   .   .   A   A+
    `);
    let state = withTreasury(f.state, f.tile(0, 1), gold(4));
    state = withTreasury(state, f.tile(3, 0), gold(10));
    state = withTreasury(state, f.tile(4, 2), gold(6));
    // (2,1) touches (1,1), (3,0) and (3,2): one tile joins all three regions.
    const { state: next, events } = paint(state, f.tile(2, 1), 0);
    expect(Object.keys(next.centers)).toEqual([String(f.tile(3, 0))]);
    expect(next.centers[f.tile(3, 0)]?.treasury).toEqual(gold(20));
    expect(eventsOf(events, 'treasuriesMerged')[0]?.absorbed).toHaveLength(2);
  });

  it('merges only across fords, not across rivers', () => {
    const f = parseFixture(`
      A*  A  |.   A+  A
              \\
        A   A  |.   .   .
    `);
    const acrossRiver = paint(f.state, f.tile(2, 0), 0).state;
    // (2,0) joins the east region (open side to (3,0)) but not the west (river).
    expect(renderFixture(acrossRiver)).toBe(
      normalizeFixture(`
        A*  A  |A   A+  A
                \\
          A   A  |.   .   .
      `),
    );
    const f2 = parseFixture('A*  A  =.   A+  A');
    expect(renderFixture(paint(f2.state, f2.tile(2, 0), 0).state)).toBe('A*  A  =A   A   A');
  });
});

describe('centers: capture, isolation, growth', () => {
  it('destroys a captured local center with its treasury; the rest gets new centers', () => {
    const f = parseFixture(`
      A*  .   A   A+  A   .
        .   .   .   A   .   B*
    `);
    const state = withTreasury(f.state, f.tile(3, 0), gold(8));
    const { state: next, events } = paint(state, f.tile(3, 0), 1);
    // (2,0) is left alone; (4,0) and (3,1) still form a pair and get an empty center.
    expect(renderFixture(next)).toBe(
      normalizeFixture(`
        A*  .   A   B   A+  .
          .   .   .   A   .   B*
      `),
    );
    expect(eventsOf(events, 'centerRemoved')).toEqual([
      {
        type: 'centerRemoved',
        tile: f.tile(3, 0),
        owner: 0,
        kind: 'local',
        reason: 'captured',
        lost: gold(8),
      },
    ]);
    expect(next.centers[f.tile(4, 0)]).toEqual({ kind: 'local', treasury: gold(0) });
  });

  it('removes a local center whose region shrinks to one tile, with its treasury', () => {
    const f = parseFixture('A*  .   A+  A');
    const state = withTreasury(f.state, f.tile(2, 0), gold(5));
    const { state: next, events } = paint(state, f.tile(3, 0), null);
    expect(renderFixture(next)).toBe('A*  .   A   .');
    expect(eventsOf(events, 'centerRemoved')[0]).toMatchObject({
      reason: 'isolated',
      lost: gold(5),
    });
  });

  it('keeps the capital and its treasury on a single tile', () => {
    const f = parseFixture('A*  A');
    const state = withTreasury(f.state, f.tile(0, 0), gold(5));
    const { state: next } = paint(state, f.tile(1, 0), null);
    expect(next.centers[f.tile(0, 0)]).toEqual({ kind: 'capital', treasury: gold(5) });
  });

  it('founds a center when a lone tile grows to two', () => {
    const f = parseFixture('A*  .   A   .');
    const { state, events } = paint(f.state, f.tile(3, 0), 0);
    expect(renderFixture(state)).toBe('A*  .   A+  A');
    expect(eventsOf(events, 'centerFounded')).toHaveLength(1);
  });
});

describe('debugPaint validation', () => {
  const f = parseFixture(`
    A*  A   ^   ~   B*
  `);
  const check = (tile: number, owner: PlayerId | null) =>
    validate(f.state, { type: 'debugPaint', tile, owner });

  it('rejects capitals, water, mountains, unknown tiles and players, and no-ops', () => {
    expect(check(f.tile(0, 0), 1)).toEqual({ ok: false, error: 'capitalLocked' });
    expect(check(f.tile(2, 0), 0)).toEqual({ ok: false, error: 'notOwnable' });
    expect(check(f.tile(3, 0), 1)).toEqual({ ok: false, error: 'notOwnable' });
    expect(check(99, 0)).toEqual({ ok: false, error: 'unknownTile' });
    expect(check(f.tile(1, 0), 5)).toEqual({ ok: false, error: 'unknownPlayer' });
    expect(check(f.tile(1, 0), 0)).toEqual({ ok: false, error: 'noChange' });
    expect(check(f.tile(1, 0), 1)).toEqual({ ok: true });
    expect(check(f.tile(1, 0), null)).toEqual({ ok: true });
  });

  it('refuses to apply an invalid command and leaves the state untouched', () => {
    const before = JSON.stringify(f.state);
    expect(() => apply(f.state, { type: 'debugPaint', tile: f.tile(0, 0), owner: 1 })).toThrow(
      /capitalLocked/,
    );
    expect(JSON.stringify(f.state)).toBe(before);
  });
});
