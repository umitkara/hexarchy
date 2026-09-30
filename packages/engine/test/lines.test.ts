import { describe, expect, it } from 'vitest';
import { COUNTER_BONUS, UNITS } from '../src/balance';
import type { Command } from '../src/commands';
import {
  checkPlacement,
  protectorsOf,
  targetOptions,
  unitStrength,
  type Protector,
} from '../src/rules';
import { UNIT_LINES, type Unit, type UnitLine } from '../src/state';
import { parseFixture, withStructure, withUnit } from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

const summary = (protectors: readonly Protector[]) =>
  protectors.map((p) => [p.kind, p.tile, p.strength]);

const unit = (line: UnitLine, level = 1): Unit => ({
  line,
  level,
  exhausted: false,
  hungry: false,
  suppressed: false,
});

const volley = (from: number, target: number): Command => ({
  type: 'archerVolley',
  from,
  target,
});

const buy = (center: number, tile: number, line: UnitLine): Command => ({
  type: 'buyUnit',
  line,
  center,
  tile,
});

describe('unit lines and their buildings (GDD 6.1, 4.2)', () => {
  const rich = { gold: 100, food: 100, materials: 0 };

  it('costs 10 gold at Sv1 for every soldier line', () => {
    for (const line of UNIT_LINES) {
      if (line !== 'worker') expect(UNITS[line].cost, line).toBe(10);
    }
  });

  it('needs the line building in the paying region, and the age', () => {
    const bare = parseFixture('A*  A   A   A', { treasury: rich, age: 'feudal' });
    const f = parseFixture('A*r As  Ax  A', { treasury: rich, age: 'feudal' });
    const [center, tile] = [f.tile(0, 0), f.tile(3, 0)];
    for (const line of ['archer', 'cavalry', 'siege'] as const) {
      expect(refusal(bare.state, buy(center, tile, line))).toBe('needsBuilding');
      const { state } = run(f.state, buy(center, tile, line));
      expect(state.units[tile]).toEqual(unit(line));
    }
    const dark = parseFixture('A*r As  Ax  A', { treasury: rich });
    expect(refusal(dark.state, buy(center, tile, 'cavalry'))).toBe('ageLocked');
    expect(refusal(dark.state, buy(center, tile, 'siege'))).toBe('ageLocked');
    run(dark.state, buy(center, tile, 'archer'));
  });

  it('caps archers at Sv3 and keeps rams from merging', () => {
    const f = parseFixture('A*  Aa2 Aa  Aa2 Am  Am', { age: 'imperial' });
    const merged = run(f.state, move(f.tile(2, 0), f.tile(1, 0))).state;
    expect(merged.units[f.tile(1, 0)]).toMatchObject({ line: 'archer', level: 3 });
    expect(refusal(f.state, move(f.tile(3, 0), f.tile(1, 0)))).toBe('lineMaxLevel');
    expect(refusal(f.state, move(f.tile(4, 0), f.tile(5, 0)))).toBe('cannotMerge');
  });
});

describe('archer protection (GDD 7.1)', () => {
  it('reaches two tiles, across any edge', () => {
    const f = parseFixture('B*  B   B   Ba  .');
    const target = f.tile(1, 0);
    expect(summary(protectorsOf(f.state, target))).toEqual([
      ['center', f.tile(0, 0), 1],
      ['unit', f.tile(3, 0), 1],
    ]);
    // Fences and rivers stop melee protection but not arrows.
    const fenced = withStructure(f.state, target, f.tile(2, 0), { kind: 'fence', owner: 1 });
    expect(summary(protectorsOf(fenced, target))).toContainEqual(['unit', f.tile(3, 0), 1]);
    const river = parseFixture('B*  B  |B   Ba');
    expect(summary(protectorsOf(river.state, river.tile(1, 0)))).toContainEqual([
      'unit',
      river.tile(3, 0),
      1,
    ]);
    // Three tiles away: out of reach.
    expect(summary(protectorsOf(f.state, f.tile(0, 0)))).not.toContainEqual([
      'unit',
      f.tile(3, 0),
      1,
    ]);
  });

  it('is unlike infantry, which stops at the edge', () => {
    const f = parseFixture('B*  B   B2  .');
    const fenced = withStructure(f.state, f.tile(1, 0), f.tile(2, 0), {
      kind: 'wall',
      owner: 1,
    });
    expect(summary(protectorsOf(fenced, f.tile(1, 0)))).toEqual([['center', f.tile(0, 0), 1]]);
  });
});

describe('archer volley (GDD 7.3)', () => {
  const f = parseFixture(`
    Aa  A2  B2  B*
      A*  A   B   B
  `);
  const [archer, soldier, target] = [f.tile(0, 0), f.tile(1, 0), f.tile(2, 0)];

  it('weakens an enemy unit by one until the turn ends, opening an attack', () => {
    expect(refusal(f.state, move(soldier, target))).toBe('protected');
    const { state, events } = run(f.state, volley(archer, target));
    expect(state.units[target]).toMatchObject({ level: 2, suppressed: true });
    expect(unitStrength(state.units[target] ?? unit('infantry'))).toBe(1);
    expect(state.units[archer]?.exhausted).toBe(true);
    expect(eventsOf(events, 'volley')).toEqual([
      {
        type: 'volley',
        player: 0,
        from: archer,
        target,
        owner: 1,
        unit: { ...unit('infantry', 2), suppressed: true },
      },
    ]);
    // B2 now defends at 1: A2 wins.
    const attack = run(state, move(soldier, target));
    expect(attack.state.owners[target]).toBe(0);
    expect(eventsOf(attack.events, 'unitKilled')).toHaveLength(1);
  });

  it('wears off when the turn ends', () => {
    const { state } = run(f.state, volley(archer, target), endTurn);
    expect(state.units[target]?.suppressed).toBe(false);
  });

  it('does not stack and needs an enemy unit with strength within range', () => {
    const second = f.tile(1, 1);
    const twoArchers = withUnit(f.state, second, unit('archer'));
    const { state } = run(twoArchers, volley(archer, target));
    expect(refusal(state, volley(second, target))).toBe('alreadySuppressed');
    expect(refusal(state, volley(archer, f.tile(2, 1)))).toBe('exhausted');
    expect(refusal(f.state, volley(archer, f.tile(3, 0)))).toBe('outOfRange');
    expect(refusal(f.state, volley(archer, soldier))).toBe('notEnemy');
    expect(refusal(f.state, volley(archer, f.tile(0, 1)))).toBe('noUnit');
    const worker = withUnit(f.state, target, unit('worker', 0));
    expect(refusal(worker, volley(archer, target))).toBe('noEffect');
    expect(refusal(f.state, volley(soldier, target))).toBe('cannotVolley');
  });
});

describe('cavalry (GDD 6.4)', () => {
  const f = parseFixture(`
    Ac  .   .   .   B*
      A*  ~   ~   ~   B
  `);
  const cavalry = f.tile(0, 0);

  it('reaches two steps outside; the tile passed stays as it was', () => {
    const check = checkPlacement(f.state, { kind: 'unit', from: cavalry }, f.tile(2, 0));
    expect(check).toMatchObject({ ok: true, placement: { action: 'capture', via: f.tile(1, 0) } });
    const { state } = run(f.state, move(cavalry, f.tile(2, 0)));
    expect(state.owners[f.tile(2, 0)]).toBe(0);
    expect(state.owners[f.tile(1, 0)]).toBeNull();
    expect(refusal(f.state, move(cavalry, f.tile(3, 0)))).toBe('unreachable');
    const tiles = targetOptions(f.state, { kind: 'unit', from: cavalry }).map((o) => o.tile);
    expect(tiles).toContain(f.tile(2, 0));
  });

  it('is unlike infantry, which takes one step', () => {
    const infantry = withUnit(f.state, cavalry, unit('infantry'));
    expect(refusal(infantry, move(cavalry, f.tile(2, 0)))).toBe('unreachable');
  });

  it('cannot pass a unit, a protected tile or a cutting edge', () => {
    const occupied = parseFixture(`
      Ac  B1  .   .   B*
        A*  ~   ~   ~   B
    `);
    expect(refusal(occupied.state, move(cavalry, occupied.tile(2, 0)))).toBe('unreachable');

    const guarded = parseFixture(`
      Ac  B   .   .   .
        A*  B+2 ~   ~   ~
    `);
    expect(refusal(guarded.state, move(cavalry, guarded.tile(2, 0)))).toBe('unreachable');

    const fenced = withStructure(f.state, f.tile(1, 0), f.tile(2, 0), {
      kind: 'fence',
      owner: 1,
    });
    expect(refusal(fenced, move(cavalry, f.tile(2, 0)))).toBe('unreachable');
  });
});

describe('counter bonuses (GDD 7.2)', () => {
  // Each defender stands alone: the capital is two tiles away.
  const attack = (attacker: string, defender: string) => {
    const cell = (token: string) => token.padEnd(4);
    const row = ['A*', `A${attacker}`, `B${defender}`, 'B', 'B*'].map(cell).join('');
    const f = parseFixture(row, { age: 'imperial' });
    return checkPlacement(f.state, { kind: 'unit', from: f.tile(1, 0) }, f.tile(2, 0));
  };

  it('gives infantry +1 against cavalry and cavalry +1 against archers and siege', () => {
    expect(COUNTER_BONUS).toEqual({ infantry: { cavalry: 1 }, cavalry: { archer: 1, siege: 1 } });
    expect(attack('1', '1')).toMatchObject({ ok: false, error: 'protected' });
    expect(attack('1', 'c')).toMatchObject({ ok: true });
    expect(attack('c', 'c')).toMatchObject({ ok: false, error: 'protected' });
    expect(attack('c', 'a')).toMatchObject({ ok: true });
    expect(attack('c', 'm')).toMatchObject({ ok: true });
    expect(attack('a', 'a')).toMatchObject({ ok: false, error: 'protected' });
  });

  it('counts for the attacker only', () => {
    // A defending infantry gets nothing against cavalry: Sv2 cavalry beats Sv1 infantry.
    expect(attack('c2', '1')).toMatchObject({ ok: true });
    expect(attack('c', '1')).toMatchObject({ ok: false, error: 'protected' });
  });

  it('gives siege no strength against units but full strength elsewhere', () => {
    expect(attack('m', 'w')).toMatchObject({ ok: false, error: 'protected' });
    expect(attack('m', '')).toMatchObject({ ok: true });
    const neutral = parseFixture('A*  Am  .', { age: 'feudal' });
    run(neutral.state, move(neutral.tile(1, 0), neutral.tile(2, 0)));
  });
});
