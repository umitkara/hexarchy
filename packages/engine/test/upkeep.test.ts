import { describe, expect, it } from 'vitest';
import { UNITS, UPKEEP } from '../src/balance';
import { getRegions, regionUpkeep } from '../src/rules';
import { parseFixture, renderFixture, withTreasury } from './fixtures/ascii';
import { endTurn, eventsOf, move, run } from './helpers';

const gold = (amount: number) => ({ gold: amount, food: 0, materials: 0 });

describe('unit upkeep (GDD 4.4)', () => {
  it('costs 1 / 3 / 9 / 27 by level, 1 per worker, paid in gold for now', () => {
    expect(UNITS.infantry.upkeep.slice(1)).toEqual([1, 3, 9, 27]);
    expect(UNITS.worker.upkeep).toEqual([1]);
    expect(UPKEEP.resource).toBe('gold');
    const f = parseFixture('A*  A2  A1  Aw  A4', { age: 'imperial' });
    const region = getRegions(f.state).regions[0];
    expect(region && regionUpkeep(f.state, region)).toBe(3 + 1 + 1 + 27);
  });

  // B ends round 1; A's round-2 turn starts with income, then upkeep.
  const f = parseFixture('A*  A2  A1  A   .   B*', { players: 2, currentPlayer: 1 });
  const aStart = (treasury: number) => withTreasury(f.state, f.tile(0, 0), gold(treasury));

  it('is paid at turn start after income (4 plains = +4, upkeep 3 + 1)', () => {
    const { state, events } = run(aStart(5), endTurn);
    expect(state.round).toBe(2);
    expect(state.centers[f.tile(0, 0)]?.treasury.gold).toBe(5 + 4 - 4);
    expect(eventsOf(events, 'upkeepPaid')).toEqual([
      { type: 'upkeepPaid', player: 0, center: f.tile(0, 0), resource: 'gold', amount: 4 },
    ]);
    expect(Object.keys(state.units)).toHaveLength(2);
  });

  it('is not charged in round 1 (no income either)', () => {
    const early = parseFixture('A*  A2  A1  .   B*', { players: 2 });
    const { state, events } = run(early.state, endTurn);
    expect(eventsOf(events, 'upkeepPaid')).toEqual([]);
    expect(Object.keys(state.units)).toHaveLength(2);
  });

  it('bankrupts a region that cannot pay: treasury to 0, all its units die (Slay)', () => {
    const { state, events } = run(withTreasury(f.state, f.tile(0, 0), gold(-1)), endTurn);
    expect(renderFixture(state)).toBe('A*  A   A   A   .   B*');
    expect(state.centers[f.tile(0, 0)]?.treasury.gold).toBe(0);
    expect(eventsOf(events, 'bankrupt')).toEqual([
      { type: 'bankrupt', player: 0, center: f.tile(0, 0), resource: 'gold', owed: 4, lost: 3 },
    ]);
    expect(eventsOf(events, 'unitKilled').map((e) => [e.tile, e.reason])).toEqual([
      [f.tile(1, 0), 'bankrupt'],
      [f.tile(2, 0), 'bankrupt'],
    ]);
  });

  it('pays exactly to zero without dying', () => {
    const { state } = run(aStart(0), endTurn);
    expect(state.centers[f.tile(0, 0)]?.treasury.gold).toBe(0);
    expect(Object.keys(state.units)).toHaveLength(2);
  });

  it('kills units in a region without a treasury; other regions pay for themselves', () => {
    const g = parseFixture('A*  A1  .   A1  .   A+  A1  B*', {
      players: 2,
      currentPlayer: 1,
      treasury: gold(10),
    });
    const { state, events } = run(g.state, endTurn);
    expect(renderFixture(state)).toBe('A*  A1  .   A   .   A+  A1  B*');
    expect(eventsOf(events, 'unitKilled')).toEqual([
      {
        type: 'unitKilled',
        tile: g.tile(3, 0),
        owner: 0,
        unit: { line: 'infantry', level: 1, exhausted: false },
        reason: 'noTreasury',
      },
    ]);
    expect(eventsOf(events, 'upkeepPaid').map((e) => [e.center, e.amount])).toEqual([
      [g.tile(0, 0), 1],
      [g.tile(5, 0), 1],
    ]);
  });

  it('only charges the player whose turn starts', () => {
    const { events } = run(aStart(0), endTurn);
    expect(eventsOf(events, 'upkeepPaid').every((e) => e.player === 0)).toBe(true);
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
