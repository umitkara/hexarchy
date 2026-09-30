import { describe, expect, it } from 'vitest';
import { chooseCommand, playAiTurn, startAiTurn } from '../src/ai';
import { turnStartForecast } from '../src/rules';
import { parseFixture } from './fixtures/ascii';
import { expectInvariants } from './fixtures/invariants';

describe('AI choices (GDD 12)', () => {
  it('takes an open capital', () => {
    // A's Sv2 can take B's capital (center protection 1) or a plain tile of B.
    const { state, tile } = parseFixture(
      `
      A*  A   A2  B*  B   B   B
      `,
      { treasury: { gold: 0, food: 5, materials: 0 } },
    );
    const choice = chooseCommand(state, startAiTurn(state));
    expect(choice.command).toEqual({ type: 'moveUnit', from: tile(2, 0), to: tile(3, 0) });
    expect(choice.intent).toBe('eliminate');
  });

  it('chooses the attack that splits the enemy region', () => {
    // A's Sv2 reaches three tiles of B: (3,0) cuts the three tiles east of it off B's
    // capital, (4,0) two of them, (2,1) nothing.
    const { state, tile } = parseFixture(
      `
      B*  B   B   B   B   B   B
        .   .   B   A2  .   .   .
      .   .   .   A*  .   .   .
      `,
      { treasury: { gold: 0, food: 5, materials: 0 } },
    );
    const choice = chooseCommand(state, startAiTurn(state));
    expect(choice.command).toEqual({ type: 'moveUnit', from: tile(3, 1), to: tile(3, 0) });
    expect(choice.intent).toBe('attack');
  });

  it('does not buy more soldiers than its farms can feed', () => {
    // Plenty of gold and neutral land, but food for one more soldier only.
    const { state } = parseFixture(
      `
      .   .   .   .   .   .   .
        .   A#  A*  Ak  A   .   .
      .   .   .   .   .   .   .
        .   .   .   .   .   .   B*
      `,
      { treasury: { gold: 60, food: 1, materials: 0 } },
    );
    const { state: after, choices } = playAiTurn(state);
    expectInvariants(after);
    const bought = choices.filter((c) => c.command.type === 'buyUnit');
    expect(bought.length).toBeGreaterThan(0);
    const forecast = turnStartForecast(after, 0);
    expect(forecast.map((r) => r.food)).toEqual(forecast.map(() => 'fed'));
  });

  it('advances the age once the capital region can pay for it', () => {
    const { state } = parseFixture(
      `
      A*  A#  A#  Ak  A   A   .   .   .
        A   A   A   A   A   A   .   .   B*
      A   A   A   A   .   .   .   .   .
      `,
      { treasury: { gold: 90, food: 60, materials: 40 }, round: 8 },
    );
    const { state: after, choices } = playAiTurn(state);
    expect(choices[0]?.command).toEqual({ type: 'advanceAge' });
    expect(after.players[0]?.advancing).toBe('feudal');
  });
});
