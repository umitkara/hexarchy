import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/balance';
import type { Command } from '../src/commands';
import { levelCap } from '../src/rules';
import type { UnitLine } from '../src/state';
import { parseFixture, renderFixture, withTreasury } from './fixtures/ascii';
import { eventsOf, move, refusal, run } from './helpers';

const gold = (amount: number) => ({ gold: amount, food: 0, materials: 0 });

const buy = (center: number, tile: number, line: UnitLine = 'infantry'): Command => ({
  type: 'buyUnit',
  line,
  center,
  tile,
});

describe('buying units (GDD 4.2, 4.4)', () => {
  const f = parseFixture('A*k A   A   .   .   B*', { treasury: gold(20) });

  it('pays from the region treasury and places a fresh level 1 unit that can still move', () => {
    const { state, events } = run(f.state, buy(f.tile(0, 0), f.tile(1, 0)));
    expect(state.centers[f.tile(0, 0)]?.treasury.gold).toBe(20 - UNITS.infantry.cost);
    expect(state.units[f.tile(1, 0)]).toEqual({
      line: 'infantry',
      level: 1,
      exhausted: false,
      hungry: false,
    });
    expect(eventsOf(events, 'unitBought')).toEqual([
      {
        type: 'unitBought',
        player: 0,
        center: f.tile(0, 0),
        tile: f.tile(1, 0),
        line: 'infantry',
        cost: UNITS.infantry.cost,
      },
    ]);
    const moved = run(state, move(f.tile(1, 0), f.tile(3, 0))).state;
    expect(renderFixture(moved)).toBe('A*k A   A   A1  .   B*');
  });

  it('can drop a unit one step outside the region: capture, and the unit is done', () => {
    const { state } = run(f.state, buy(f.tile(0, 0), f.tile(3, 0)));
    expect(renderFixture(state)).toBe('A*k A   A   A1  .   B*');
    expect(state.units[f.tile(3, 0)]?.exhausted).toBe(true);
    expect(refusal(f.state, buy(f.tile(0, 0), f.tile(4, 0)))).toBe('unreachable');
  });

  it('may place on the center tile itself', () => {
    const { state } = run(f.state, buy(f.tile(0, 0), f.tile(0, 0)));
    expect(state.units[f.tile(0, 0)]?.level).toBe(1);
  });

  it('needs enough gold, an own treasury and a reachable tile', () => {
    const poor = withTreasury(f.state, f.tile(0, 0), gold(UNITS.infantry.cost - 1));
    expect(refusal(poor, buy(f.tile(0, 0), f.tile(1, 0)))).toBe('notEnoughGold');
    expect(refusal(f.state, buy(f.tile(5, 0), f.tile(4, 0)))).toBe('notYourRegion');
    expect(refusal(f.state, buy(f.tile(1, 0), f.tile(2, 0)))).toBe('noTreasury');
    const river = parseFixture('A*k A  |.', { treasury: gold(20) });
    expect(refusal(river.state, buy(river.tile(0, 0), river.tile(2, 0)))).toBe('edgeBlocked');
  });

  it('places only within the paying region', () => {
    const two = parseFixture('A*k A   .   A+k A', { treasury: gold(20) });
    expect(refusal(two.state, buy(two.tile(0, 0), two.tile(4, 0)))).toBe('unreachable');
    expect(run(two.state, buy(two.tile(3, 0), two.tile(4, 0))).state.units[4]?.level).toBe(1);
  });

  it('buys workers, who cannot capture', () => {
    const { state } = run(f.state, buy(f.tile(0, 0), f.tile(2, 0), 'worker'));
    expect(state.units[f.tile(2, 0)]).toEqual({
      line: 'worker',
      level: 0,
      exhausted: false,
      hungry: false,
    });
    expect(state.centers[f.tile(0, 0)]?.treasury.gold).toBe(20 - UNITS.worker.cost);
    expect(refusal(f.state, buy(f.tile(0, 0), f.tile(3, 0), 'worker'))).toBe('cannotCapture');
  });
});

describe('merging (GDD 6.2)', () => {
  it('adds levels (Slay sum); the merged unit is done for the turn', () => {
    const f = parseFixture('A*  A1  A1  .');
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(state.units[f.tile(2, 0)]).toEqual({
      line: 'infantry',
      level: 2,
      exhausted: true,
      hungry: false,
    });
    expect(state.units[f.tile(1, 0)]).toBeUndefined();
    expect(eventsOf(events, 'unitsMerged')).toHaveLength(1);
    expect(refusal(state, move(f.tile(2, 0), f.tile(3, 0)))).toBe('exhausted');
  });

  it('merges a bought unit into a standing one', () => {
    const f = parseFixture('A*k A1  .', { treasury: gold(20) });
    const { state } = run(f.state, buy(f.tile(0, 0), f.tile(1, 0)));
    expect(state.units[f.tile(1, 0)]).toEqual({
      line: 'infantry',
      level: 2,
      exhausted: true,
      hungry: false,
    });
  });

  it('is capped by age: Dark Sv2, Feudal Sv3, Imperial Sv4 (GDD 9.1)', () => {
    const dark = parseFixture('A*  A2  A1');
    expect(levelCap(dark.state, 0)).toBe(2);
    expect(refusal(dark.state, move(dark.tile(2, 0), dark.tile(1, 0)))).toBe('levelCap');

    const feudal = parseFixture('A*  A2  A1  A2', { age: 'feudal' });
    expect(
      run(feudal.state, move(feudal.tile(2, 0), feudal.tile(1, 0))).state.units[1]?.level,
    ).toBe(3);
    expect(refusal(feudal.state, move(feudal.tile(3, 0), feudal.tile(1, 0)))).toBe('levelCap');

    const imperial = parseFixture('A*  A2  A2  A3', { age: 'imperial' });
    expect(
      run(imperial.state, move(imperial.tile(2, 0), imperial.tile(1, 0))).state.units[1]?.level,
    ).toBe(4);
    // 3 + 2 = 5: above the Slay maximum of 4.
    expect(refusal(imperial.state, move(imperial.tile(3, 0), imperial.tile(2, 0)))).toBe(
      'levelCap',
    );
  });

  it('follows the debug age switch', () => {
    const f = parseFixture('A*  A2  A1');
    const { state, events } = run(f.state, { type: 'debugSetAge', player: 0, age: 'feudal' });
    expect(eventsOf(events, 'ageChanged')).toEqual([
      { type: 'ageChanged', player: 0, age: 'feudal' },
    ]);
    expect(run(state, move(f.tile(2, 0), f.tile(1, 0))).state.units[1]?.level).toBe(3);
    expect(refusal(state, { type: 'debugSetAge', player: 0, age: 'feudal' })).toBe('noChange');
    expect(refusal(state, { type: 'debugSetAge', player: 9, age: 'dark' })).toBe('unknownPlayer');
  });

  it('keeps lines apart: workers never merge', () => {
    const f = parseFixture('A*  Aw  Aw  A1');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('cannotMerge');
    expect(refusal(f.state, move(f.tile(3, 0), f.tile(2, 0)))).toBe('cannotMerge');
  });
});
