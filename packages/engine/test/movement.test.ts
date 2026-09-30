import { describe, expect, it } from 'vitest';
import { movementArea, targetOptions } from '../src/rules';
import { normalizeFixture, parseFixture, renderFixture, withTreasury } from './fixtures/ascii';
import { eventsOf, move, refusal, run } from './helpers';

describe('movement (GDD 6.4)', () => {
  it('moves freely within the own territory, through other units, without tiring', () => {
    const f = parseFixture('A*  A   A2  A   A   A1');
    const { state } = run(
      f.state,
      move(f.tile(5, 0), f.tile(1, 0)),
      move(f.tile(1, 0), f.tile(4, 0)),
    );
    expect(renderFixture(state)).toBe('A*  A   A2  A   A1  A');
    expect(state.units[f.tile(4, 0)]?.exhausted).toBe(false);
  });

  it('takes one step outside: a neutral tile is captured and the unit is done', () => {
    const f = parseFixture('A*  A1  A   .   .');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(4, 0)))).toBe('unreachable');
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(3, 0)));
    expect(renderFixture(state)).toBe('A*  A   A   A1  .');
    expect(state.units[f.tile(3, 0)]?.exhausted).toBe(true);
    expect(eventsOf(events, 'tileOwnerChanged')).toEqual([
      { type: 'tileOwnerChanged', tile: f.tile(3, 0), from: null, to: 0 },
    ]);
    expect(refusal(state, move(f.tile(3, 0), f.tile(2, 0)))).toBe('exhausted');
  });

  it('is cut by a river: no step across it, not even into own land', () => {
    const f = parseFixture('A*  A1 |.   .');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('edgeBlocked');
    const own = parseFixture('A*  A1 |A   A+');
    expect(movementArea(own.state, own.tile(1, 0))).toEqual([own.tile(0, 0), own.tile(1, 0)]);
    expect(refusal(own.state, move(own.tile(1, 0), own.tile(2, 0)))).toBe('edgeBlocked');
  });

  it('is joined by a ford', () => {
    const f = parseFixture('A*  A1 =.   .');
    expect(run(f.state, move(f.tile(1, 0), f.tile(2, 0))).state.owners[f.tile(2, 0)]).toBe(0);
    const own = parseFixture('A*  A1 =A   A');
    const { state } = run(own.state, move(own.tile(1, 0), own.tile(3, 0)));
    expect(renderFixture(state)).toBe('A*  A  =A   A1');
  });

  it('follows rivers between rows too', () => {
    const f = parseFixture(`
      .   A1  .
          \\
        .   .   .
    `);
    // (1,0) touches (0,1) across the river and (1,1) directly.
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(0, 1)))).toBe('edgeBlocked');
    expect(run(f.state, move(f.tile(1, 0), f.tile(1, 1))).state.owners[f.tile(1, 1)]).toBe(0);
  });

  it('refuses units of others, missing units and water', () => {
    const f = parseFixture('~   A*  A1  B1  B*', { currentPlayer: 0 });
    expect(refusal(f.state, move(f.tile(3, 0), f.tile(2, 0)))).toBe('notYourUnit');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('noUnit');
    expect(refusal(f.state, move(f.tile(2, 0), f.tile(2, 0)))).toBe('noChange');
    const water = parseFixture('~   A1  A*');
    expect(refusal(water.state, move(water.tile(1, 0), water.tile(0, 0)))).toBe('notOwnable');
  });

  it('lets workers walk at home but never capture', () => {
    const f = parseFixture('A*  Aw  A   .');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(3, 0)))).toBe('cannotCapture');
    const { state } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(state.units[f.tile(2, 0)]).toEqual({
      line: 'worker',
      level: 0,
      exhausted: false,
      hungry: false,
    });
  });

  it('lists the targets: area, outside steps, and river-blocked neighbors', () => {
    const f = parseFixture('.   A*  A1 |.');
    const options = targetOptions(f.state, { kind: 'unit', from: f.tile(2, 0) });
    expect(
      options.map((o) => [o.tile, o.check.ok ? o.check.placement.action : o.check.error]),
    ).toEqual([
      [f.tile(0, 0), 'capture'],
      [f.tile(1, 0), 'move'],
      [f.tile(3, 0), 'edgeBlocked'],
    ]);
  });
});

describe('capturing changes regions (GDD 4.2)', () => {
  it('joins two own regions and their treasuries', () => {
    const f = parseFixture('A*  A1  .   A+  A');
    const state = withTreasury(f.state, f.tile(3, 0), { gold: 7, food: 0, materials: 0 });
    const { state: next, events } = run(state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(renderFixture(next)).toBe('A*  A   A1  A   A');
    expect(next.centers[f.tile(0, 0)]?.treasury.gold).toBe(7);
    expect(eventsOf(events, 'treasuriesMerged')).toHaveLength(1);
  });

  it('splits the enemy: the cut-off pair keeps the center, the lone tile has none', () => {
    const f = parseFixture(`
      A*  A2  .   .
        B   B   B   B+
    `);
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(1, 1)));
    expect(renderFixture(state)).toBe(
      normalizeFixture(`
        A*  A   .   .
          B   A2  B   B+
      `),
    );
    expect(eventsOf(events, 'tileOwnerChanged')[0]).toEqual({
      type: 'tileOwnerChanged',
      tile: f.tile(1, 1),
      from: 1,
      to: 0,
    });
  });

  it('founds a local center when an attack cuts an enemy region in two big pieces', () => {
    const f = parseFixture(`
      A*  A   A2  .   .
        B   B   B   B   B+
    `);
    // An even row reaches down to (col - 1) and (col): (2,0) attacks (2,1).
    const { state, events } = run(f.state, move(f.tile(2, 0), f.tile(2, 1)));
    expect(renderFixture(state)).toBe(
      normalizeFixture(`
        A*  A   A   .   .
          B+  B   A2  B   B+
      `),
    );
    expect(eventsOf(events, 'centerFounded')).toEqual([
      { type: 'centerFounded', tile: f.tile(0, 1), owner: 1 },
    ]);
  });
});
