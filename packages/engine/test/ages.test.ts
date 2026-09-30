import { describe, expect, it } from 'vitest';
import { AGE_ADVANCE } from '../src/balance';
import { applyToHistory, legalCommands, startHistory, undo, type Command } from '../src/commands';
import { ageUnlocks, checkAdvanceAge } from '../src/rules';
import type { Resources } from '../src/state';
import { parseFixture, withTreasury } from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

const advance: Command = { type: 'advanceAge' };
const price = AGE_ADVANCE.cost.feudal;
const extra = (gold: number, food: number, materials: number): Resources => ({
  gold: price.gold + gold,
  food: price.food + food,
  materials: price.materials + materials,
});

describe('advancing an age (GDD 9.1)', () => {
  // A has a barracks and two militia; the second row is room for new buildings.
  const f = parseFixture(
    `
    A*  A1  A1  Ak  B*
      A   A   A   A   B
    `,
    { treasury: extra(20, 10, 15) },
  );
  const capital = f.tile(0, 0);

  it('pays the price from the capital treasury and arrives at the next turn start', () => {
    const started = run(f.state, advance);
    expect(started.state.centers[capital]?.treasury).toEqual({ gold: 20, food: 10, materials: 15 });
    expect(started.state.players[0]).toMatchObject({ age: 'dark', advancing: 'feudal' });
    expect(eventsOf(started.events, 'ageAdvanceStarted')).toEqual([
      { type: 'ageAdvanceStarted', player: 0, center: capital, age: 'feudal', cost: price },
    ]);

    // B's turn: still in transition.
    const other = run(started.state, endTurn);
    expect(other.state.players[0]).toMatchObject({ age: 'dark', advancing: 'feudal' });
    expect(eventsOf(other.events, 'ageReached')).toEqual([]);

    // A's next turn start: the age arrives before the income.
    const arrived = run(other.state, endTurn);
    expect(arrived.state.players[0]).toMatchObject({ age: 'feudal', advancing: null });
    const types = arrived.events.map((e) => e.type);
    expect(types.indexOf('ageReached')).toBeGreaterThan(types.indexOf('turnStarted'));
    expect(types.indexOf('ageReached')).toBeLessThan(types.indexOf('income'));
    expect(arrived.state.stats[0]?.ageRounds).toEqual({ dark: 1, feudal: 2 });
  });

  it('keeps the content and the level cap locked during the transition', () => {
    const started = run(f.state, advance).state;
    const stable: Command = {
      type: 'build',
      building: 'stable',
      center: capital,
      tile: f.tile(0, 1),
    };
    expect(refusal(started, stable)).toBe('ageLocked');
    const merged = run(started, move(f.tile(1, 0), f.tile(2, 0))).state;
    const again = run(merged, endTurn, endTurn).state;
    // Sv2 + Sv1 = Sv3 is over the Dark Age cap, fine in the Feudal Age.
    const sv1 = run(again, {
      type: 'buyUnit',
      line: 'infantry',
      center: capital,
      tile: f.tile(1, 1),
    }).state;
    expect(sv1.players[0]?.age).toBe('feudal');
    const sv3 = run(sv1, move(f.tile(1, 1), f.tile(2, 0))).state;
    expect(sv3.units[f.tile(2, 0)]?.level).toBe(3);
    run(sv3, stable);

    const dark = run(merged, {
      type: 'buyUnit',
      line: 'infantry',
      center: capital,
      tile: f.tile(1, 1),
    }).state;
    expect(refusal(dark, move(f.tile(1, 1), f.tile(2, 0)))).toBe('levelCap');
  });

  it('needs the whole price in the capital region', () => {
    const at = (treasury: Resources) => withTreasury(f.state, capital, treasury);
    expect(refusal(at(extra(-1, 5, 5)), advance)).toBe('notEnoughGold');
    expect(refusal(at(extra(5, -1, 5)), advance)).toBe('notEnoughFood');
    expect(refusal(at(extra(5, 5, -1)), advance)).toBe('notEnoughMaterials');
    expect(checkAdvanceAge(at(extra(0, 0, 0)), 0).ok).toBe(true);
  });

  it('does not take a local treasury, however rich', () => {
    const g = parseFixture('A*  A  |A+  A   B*', { treasury: extra(0, 0, 0) });
    const poor = withTreasury(g.state, g.tile(0, 0), { gold: 0, food: 0, materials: 0 });
    expect(refusal(poor, advance)).toBe('notEnoughGold');
  });

  it('happens once, up to the last age of v0.1', () => {
    const started = run(f.state, advance).state;
    expect(refusal(started, advance)).toBe('alreadyAdvancing');
    const feudal = parseFixture('A*  A   B*', { treasury: extra(500, 500, 500), age: 'feudal' });
    expect(AGE_ADVANCE.lastAge).toBe('feudal');
    expect(refusal(feudal.state, advance)).toBe('lastAge');
  });

  it('is listed as legal only when it is allowed', () => {
    const has = (commands: Command[]) => commands.some((c) => c.type === 'advanceAge');
    expect(has(legalCommands(f.state))).toBe(true);
    expect(legalCommands(f.state).at(-1)).toEqual(endTurn);
    expect(has(legalCommands(run(f.state, advance).state))).toBe(false);
    expect(has(legalCommands(withTreasury(f.state, capital, extra(-1, 0, 0))))).toBe(false);
  });

  it('can be undone within the turn', () => {
    const history = applyToHistory(startHistory(f.state), advance).history;
    expect(undo(history).present).toBe(f.state);
  });

  it('is cancelled by setting the age directly (debug)', () => {
    const started = run(f.state, advance).state;
    const set = run(started, { type: 'debugSetAge', player: 0, age: 'dark' }).state;
    expect(set.players[0]).toMatchObject({ age: 'dark', advancing: null });
  });
});

describe('age unlocks (GDD 9.1)', () => {
  it('lists what the Feudal Age brings', () => {
    expect(ageUnlocks('feudal')).toEqual({
      lines: ['cavalry', 'siege'],
      buildings: ['quarry', 'stable', 'workshop', 'tower'],
      structures: ['wall', 'gate', 'bridge'],
      levelCap: 3,
    });
    expect(ageUnlocks('dark').levelCap).toBe(2);
  });
});
