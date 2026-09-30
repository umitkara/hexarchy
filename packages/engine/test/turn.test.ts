import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/balance';
import { apply } from '../src/commands';
import type { GameEvent } from '../src/rules';
import type { GameState } from '../src/state';
import { parseFixture, withTreasury } from './fixtures/ascii';

function endTurns(state: GameState, count: number) {
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    const result = apply(state, { type: 'endTurn' });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const incomes = (events: readonly GameEvent[]) =>
  events.flatMap((e) => (e.type === 'income' ? [[e.player, e.center, e.income.gold]] : []));

describe('turn cycle', () => {
  const f = parseFixture(
    `
      A*  A   .   .   B*  B
        .   .   .   .   C*  C
    `,
    { players: 3 },
  );

  it('passes the turn in player order and counts rounds', () => {
    let state = f.state;
    const seen: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      state = apply(state, { type: 'endTurn' }).state;
      seen.push([state.round, state.currentPlayer]);
    }
    expect(seen).toEqual([
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
      [3, 0],
      [3, 1],
    ]);
  });

  it('reports the turn change as events', () => {
    const { events } = apply(f.state, { type: 'endTurn' });
    expect(events).toEqual([
      { type: 'turnEnded', player: 0 },
      { type: 'turnStarted', player: 1, round: 1 },
    ]);
  });

  it('pays no income in round 1: everyone plays it on the starting treasury', () => {
    expect(ECONOMY.firstIncomeRound).toBe(2);
    const { state, events } = endTurns(f.state, 2);
    expect(incomes(events)).toEqual([]);
    expect(state.centers[f.tile(4, 0)]?.treasury.gold).toBe(0);
  });
});

describe('income (GDD 3.1, 4.2)', () => {
  it('pays +1 gold per owned land tile except forest, at the start of the turn', () => {
    // Player A: plains ×2, hill, vein hill, forest ×2 → 4 gold.
    const f = parseFixture(`
      A*  hA  fA  .   B*
        A   vA  fA  .   B
    `);
    const state = withTreasury(f.state, f.tile(0, 0), { gold: 20, food: 10, materials: 10 });
    // Round 1: A → B; round 2 starts with A's turn.
    const { state: next, events } = endTurns(state, 2);
    expect(next.round).toBe(2);
    expect(next.currentPlayer).toBe(0);
    expect(incomes(events)).toEqual([[0, f.tile(0, 0), 4]]);
    expect(next.centers[f.tile(0, 0)]?.treasury).toEqual({ gold: 24, food: 10, materials: 10 });
    // B collects on its own turn start.
    const after = endTurns(next, 1);
    expect(incomes(after.events)).toEqual([[1, f.tile(4, 0), 2]]);
  });

  it('pays each region into its own treasury; a lone tile has none and earns nothing', () => {
    const f = parseFixture(
      `
        A*  A   .   A+  A   A   .   A
      `,
      { round: 2, players: 2, currentPlayer: 1 },
    );
    const { events, state } = endTurns(f.state, 1);
    expect(incomes(events)).toEqual([
      [0, f.tile(0, 0), 2],
      [0, f.tile(3, 0), 3],
    ]);
    expect(state.centers[f.tile(3, 0)]?.treasury.gold).toBe(3);
  });

  it('keeps a river-split country on two separate incomes', () => {
    const f = parseFixture(
      `
        A*  A  |A   A
                \\
          A   A  |A+  A
      `,
      { round: 2, players: 2, currentPlayer: 1 },
    );
    const { events } = endTurns(f.state, 1);
    expect(incomes(events)).toEqual([
      [0, f.tile(0, 0), 4],
      [0, f.tile(2, 1), 4],
    ]);
  });

  it('joins the incomes across a ford', () => {
    const f = parseFixture(
      `
        A*  A  =A   A
                \\
          A   A  |A   A
      `,
      { round: 2, players: 2, currentPlayer: 1 },
    );
    const { events } = endTurns(f.state, 1);
    expect(incomes(events)).toEqual([[0, f.tile(0, 0), 8]]);
  });
});
