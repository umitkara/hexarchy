import { describe, expect, it } from 'vitest';
import { AI, START } from '../src/balance';
import { aiStep, type AiTurn } from '../src/ai';
import { apply, validate, type Command } from '../src/commands';
import { createGame, isGameOver, type GameState } from '../src/state';
import { expectCapitalInvariants, expectInvariants } from './fixtures/invariants';

export interface AiMatch {
  readonly state: GameState;
  readonly commands: readonly Command[];
}

/**
 * An AI-only match (the AI plays every player) until it is over or `rounds` have been
 * played. With `check`, every command must be valid, the invariants must hold after every
 * turn, and every turn must end within the AI's command limit.
 */
export function playAiMatch(seed: number, rounds: number, check = true, players?: number): AiMatch {
  let state = createGame({ seed, ...(players !== undefined && { players }) });
  let turn: AiTurn | undefined;
  let turnCommands = 0;
  const commands: Command[] = [];
  while (!isGameOver(state) && state.round <= rounds) {
    const step = aiStep(state, turn);
    if (!step) break;
    const { command } = step.choice;
    if (check) expect(validate(state, command), JSON.stringify(command)).toEqual({ ok: true });
    const result = apply(state, command);
    if (check && (command.type === 'endTurn' || isGameOver(result.state))) {
      expectInvariants(result.state);
      expectCapitalInvariants(result.state);
    }
    commands.push(command);
    state = result.state;
    turn = step.turn;
    turnCommands = command.type === 'endTurn' ? 0 : turnCommands + 1;
    if (check) expect(turnCommands).toBeLessThanOrEqual(AI.maxCommandsPerTurn);
  }
  return { state, commands };
}

/** Owned tiles per player. */
export function territories(state: GameState): number[] {
  return state.players.map((p) => state.owners.filter((o) => o === p.id).length);
}

/** Rounds of each smoke match: past the opening, well into the fighting. */
const SMOKE_ROUNDS = 16;

/**
 * AI smoke test for seeds `first`..`last` (split over several files so they run in
 * parallel): valid commands, invariants, bounded turns and progress — the match is over,
 * or the players hold far more land than at the start.
 */
export function smokeTest(first: number, last: number): void {
  const seeds = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  describe(`AI smoke test, seeds ${first}-${last}`, () => {
    it.each(seeds)('seed %i', (seed) => {
      const { state } = playAiMatch(seed, SMOKE_ROUNDS);
      const start = START.territoryTiles * state.players.length;
      const owned = territories(state).reduce((a, b) => a + b, 0);
      expect(isGameOver(state) || owned >= 3 * start, `owned ${owned}`).toBe(true);
    });
  });
}
