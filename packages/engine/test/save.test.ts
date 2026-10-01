import { describe, expect, it } from 'vitest';
import { aiStep, type AiTurn } from '../src/ai';
import { apply } from '../src/commands';
import { createGame, isGameOver, winnerOf, type GameState } from '../src/state';
import { playAiMatch } from './aiMatch';
import { expectCapitalInvariants, expectInvariants } from './fixtures/invariants';

/** Plays `steps` AI commands (fewer if the game ends). */
function playSteps(state: GameState, steps: number): GameState {
  let turn: AiTurn | undefined;
  for (let i = 0; i < steps && !isGameOver(state); i++) {
    const step = aiStep(state, turn);
    if (!step) break;
    state = apply(state, step.choice.command).state;
    turn = step.turn;
  }
  return state;
}

describe('save and continue (PLAN M8)', () => {
  it('the state survives a JSON round trip and plays on identically', () => {
    const middle = playSteps(createGame({ seed: 21 }), 200);
    const copy = JSON.parse(JSON.stringify(middle)) as GameState;
    expect(copy).toEqual(middle);
    // Fresh AI turn counters on both sides: the client reloads without them.
    const a = playSteps(middle, 150);
    const b = playSteps(copy, 150);
    expect(b).toEqual(a);
  });
});

describe('fewer opponents (new game menu)', () => {
  it.each([2, 3])('%i players get fair, separate starts', (players) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = createGame({ seed, players });
      expect(game.players).toHaveLength(players);
      expect(game.stats).toHaveLength(players);
      expectInvariants(game);
      expectCapitalInvariants(game);
      const capitals = Object.values(game.centers).filter((c) => c?.kind === 'capital');
      expect(capitals).toHaveLength(players);
    }
  });

  it('a 2-player AI match ends with a winner', () => {
    const { state } = playAiMatch(3, 80, false, 2);
    expect(winnerOf(state)).not.toBeNull();
  });
});
