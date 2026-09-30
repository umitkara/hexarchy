import { describe, expect, it } from 'vitest';
import { HUNGER, UNITS, UPKEEP } from '../src/balance';
import { getRegions, regionUpkeep, unitStrength } from '../src/rules';
import type { Resources } from '../src/state';
import { parseFixture, renderFixture, withTreasury, withUnit } from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

const res = (gold: number, food: number, materials = 0): Resources => ({ gold, food, materials });

describe('unit upkeep in food (GDD 4.4)', () => {
  it('costs 1 / 3 / 9 / 27 food by level, 1 per worker', () => {
    expect(UNITS.infantry.upkeep.slice(1)).toEqual([1, 3, 9, 27]);
    expect(UNITS.worker.upkeep).toEqual([1]);
    expect(UPKEEP.resource).toBe('food');
    const f = parseFixture('A*  A2  A1  Aw  A4', { age: 'imperial' });
    const region = getRegions(f.state).regions[0];
    expect(region && regionUpkeep(f.state, region)).toBe(3 + 1 + 1 + 27);
  });

  // B ends round 1; A's round-2 turn starts with income, then upkeep.
  const f = parseFixture('A*  A2  A1  A   .   B*', { players: 2, currentPlayer: 1 });
  const aStart = (treasury: Resources) => withTreasury(f.state, f.tile(0, 0), treasury);

  it('is paid in food at turn start; the gold income stays untouched', () => {
    const { state, events } = run(aStart(res(5, 10)), endTurn);
    expect(state.round).toBe(2);
    expect(state.centers[f.tile(0, 0)]?.treasury).toEqual(res(5 + 4, 10 - 4));
    expect(eventsOf(events, 'upkeepPaid')).toEqual([
      { type: 'upkeepPaid', player: 0, center: f.tile(0, 0), resource: 'food', amount: 4 },
    ]);
    expect(Object.keys(state.units)).toHaveLength(2);
  });

  it('is not charged in round 1 (no income either)', () => {
    const early = parseFixture('A*  A2  A1  .   B*', { players: 2 });
    const { state, events } = run(early.state, endTurn);
    expect(eventsOf(events, 'upkeepPaid')).toEqual([]);
    expect(Object.keys(state.units)).toHaveLength(2);
  });

  it('pays exactly to zero without starving', () => {
    const { state } = run(aStart(res(0, 4)), endTurn);
    expect(state.centers[f.tile(0, 0)]?.treasury.food).toBe(0);
    expect(Object.values(state.units).every((u) => u && !u.hungry)).toBe(true);
  });

  it('only charges the player whose turn starts', () => {
    const { events } = run(aStart(res(0, 9)), endTurn);
    expect(eventsOf(events, 'upkeepPaid').every((e) => e.player === 0)).toBe(true);
  });
});

describe('starvation and rebellion (GDD 4.5)', () => {
  const f = parseFixture('A*  A2  A1  A   .   B*', { players: 2, currentPlayer: 1 });
  const aStart = (treasury: Resources) => withTreasury(f.state, f.tile(0, 0), treasury);
  const hungryUnits = (state: typeof f.state) =>
    Object.entries(state.units).flatMap(([tile, u]) => (u?.hungry ? [Number(tile)] : []));

  it('first shortfall: the food drops to 0 and every unit goes hungry, nobody dies', () => {
    const { state, events } = run(aStart(res(7, 3)), endTurn);
    expect(state.centers[f.tile(0, 0)]?.treasury).toEqual(res(7 + 4, 0));
    expect(renderFixture(state)).toBe('A*  A2  A1  A   .   B*');
    expect(hungryUnits(state)).toEqual([f.tile(1, 0), f.tile(2, 0)]);
    expect(eventsOf(events, 'starvation')).toEqual([
      {
        type: 'starvation',
        player: 0,
        center: f.tile(0, 0),
        owed: 4,
        lost: 3,
        tiles: [f.tile(1, 0), f.tile(2, 0)],
      },
    ]);
    expect(eventsOf(events, 'unitKilled')).toEqual([]);
    expect(eventsOf(events, 'upkeepPaid')).toEqual([]);
  });

  it('hungry units fight and protect at −1 strength', () => {
    expect(HUNGER.strengthPenalty).toBe(1);
    const unit = {
      line: 'infantry',
      level: 2,
      exhausted: false,
      hungry: true,
      suppressed: false,
    } as const;
    expect(unitStrength(unit)).toBe(1);
    expect(unitStrength({ ...unit, level: 1 })).toBe(0);

    // A2 beats the B1 next to (2,0); hungry, it no longer does.
    const g = parseFixture('A*  A2  B   B1  B*');
    expect(run(g.state, move(g.tile(1, 0), g.tile(2, 0))).state.owners[g.tile(2, 0)]).toBe(0);
    const weak = withUnit(g.state, g.tile(1, 0), unit);
    expect(refusal(weak, move(g.tile(1, 0), g.tile(2, 0)))).toBe('protected');
    // A hungry militia protects nothing: level 1 takes its neighbor (2,0).
    const h = parseFixture('A*  A1  B   B1  B*');
    const starving = withUnit(h.state, h.tile(3, 0), { ...unit, level: 1 });
    expect(refusal(h.state, move(h.tile(1, 0), h.tile(2, 0)))).toBe('protected');
    expect(run(starving, move(h.tile(1, 0), h.tile(2, 0))).state.owners[2]).toBe(0);
  });

  it('second shortfall in a row: the highest upkeep rebels until the rest can be fed', () => {
    const first = run(aStart(res(0, 3)), endTurn).state;
    // Round 2: A plays nothing; B passes; round 3 starts with A short again (4 owed, 1 food).
    const again = withTreasury(first, f.tile(0, 0), res(0, 1));
    const { state, events } = run(again, endTurn, endTurn);
    expect(renderFixture(state)).toBe('A*  A   A1  A   .   B*');
    expect(hungryUnits(state)).toEqual([]);
    expect(state.centers[f.tile(0, 0)]?.treasury.food).toBe(0);
    expect(eventsOf(events, 'rebellion')).toEqual([
      { type: 'rebellion', player: 0, center: f.tile(0, 0), owed: 4, tiles: [f.tile(1, 0)] },
    ]);
    expect(eventsOf(events, 'unitKilled').map((e) => [e.tile, e.reason])).toEqual([
      [f.tile(1, 0), 'rebellion'],
    ]);
    expect(eventsOf(events, 'upkeepPaid').map((e) => e.amount)).toEqual([1]);
  });

  it('feeding the region again ends the hunger', () => {
    const first = run(aStart(res(0, 3)), endTurn).state;
    const fed = withTreasury(first, f.tile(0, 0), res(0, 20));
    const { state, events } = run(fed, endTurn, endTurn);
    expect(hungryUnits(state)).toEqual([]);
    expect(state.centers[f.tile(0, 0)]?.treasury.food).toBe(20 - 4);
    expect(eventsOf(events, 'rebellion')).toEqual([]);
  });

  it('a lone tile has no treasury: its unit starves, then rebels; other regions pay', () => {
    const g = parseFixture('A*  A1  .   A1  .   A+  A1  B*', {
      players: 2,
      currentPlayer: 1,
      round: 2,
      treasury: res(0, 10),
    });
    const first = run(g.state, endTurn);
    expect(hungryUnits(first.state)).toEqual([g.tile(3, 0)]);
    expect(eventsOf(first.events, 'starvation')).toEqual([
      { type: 'starvation', player: 0, center: null, owed: 1, lost: 0, tiles: [g.tile(3, 0)] },
    ]);
    expect(eventsOf(first.events, 'upkeepPaid').map((e) => [e.center, e.amount])).toEqual([
      [g.tile(0, 0), 1],
      [g.tile(5, 0), 1],
    ]);
    const second = run(first.state, endTurn, endTurn);
    expect(renderFixture(second.state)).toBe('A*  A1  .   A   .   A+  A1  B*');
    expect(eventsOf(second.events, 'unitKilled').map((e) => [e.tile, e.reason])).toEqual([
      [g.tile(3, 0), 'rebellion'],
    ]);
  });

  it('a merged unit is hungry if either part was', () => {
    const g = parseFixture('A*  A1  A1');
    const state = withUnit(g.state, g.tile(1, 0), {
      line: 'infantry',
      level: 1,
      exhausted: false,
      hungry: true,
      suppressed: false,
    });
    const merged = run(state, move(g.tile(1, 0), g.tile(2, 0))).state;
    expect(merged.units[g.tile(2, 0)]).toMatchObject({ level: 2, hungry: true, suppressed: false });
  });
});

describe('rest', () => {
  it('ending the turn rests the exhausted units', () => {
    const f = parseFixture('A*  A1  .   B*');
    const { state } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(state.units[f.tile(2, 0)]?.exhausted).toBe(true);
    const after = run(state, endTurn, endTurn).state;
    expect(after.currentPlayer).toBe(0);
    expect(after.units[f.tile(2, 0)]?.exhausted).toBe(false);
  });
});
