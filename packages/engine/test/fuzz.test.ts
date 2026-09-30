import { describe, expect, it } from 'vitest';
import { apply, legalCommands, validate, type Command } from '../src/commands';
import { Rng } from '../src/rng';
import type { GameEvent } from '../src/rules';
import { capitalOf, createGame, mapGrid, unitTiles, type GameState } from '../src/state';
import { expectInvariants } from './fixtures/invariants';

/**
 * Random play: at every step a random legal command of the current player (ending the
 * turn now and then). Reproducible from the seed.
 */
function randomPlay(game: GameState, seed: number, steps: number) {
  const rng = Rng.fromSeed(seed);
  const commands: Command[] = [];
  const events: GameEvent[] = [];
  let state = game;
  for (let i = 0; i < steps; i++) {
    const legal = legalCommands(state);
    const command: Command = rng.chance(0.15)
      ? { type: 'endTurn' }
      : rng.pick(legal.length > 1 ? legal.slice(0, -1) : legal);
    const result = apply(state, command);
    commands.push(command);
    events.push(...result.events);
    state = result.state;
  }
  return { state, commands, events };
}

function replay(game: GameState, commands: readonly Command[]): GameState {
  return commands.reduce((state, command) => apply(state, command).state, game);
}

describe('determinism (PLAN 2.2)', () => {
  it('same seed + same commands = same game', () => {
    const { state, commands, events } = randomPlay(createGame({ seed: 21 }), 1, 250);
    expect(replay(createGame({ seed: 21 }), commands)).toEqual(state);
    expect(randomPlay(createGame({ seed: 21 }), 1, 250).events).toEqual(events);
    expect(unitTiles(state).length).toBeGreaterThan(4);
  });

  it('continues identically from a JSON round trip', () => {
    const game = createGame({ seed: 22 });
    const { state, commands } = randomPlay(game, 2, 200);
    const halfway = replay(game, commands.slice(0, 100));
    const restored = JSON.parse(JSON.stringify(halfway)) as GameState;
    expect(replay(restored, commands.slice(100))).toEqual(state);
  });

  it('never mutates the previous state', () => {
    const game = createGame({ seed: 23 });
    const snapshot = JSON.stringify(game);
    randomPlay(game, 3, 120);
    expect(JSON.stringify(game)).toBe(snapshot);
  });
});

describe('invariant fuzz', () => {
  it('keeps every invariant through random legal play', () => {
    let captures = 0;
    let merges = 0;
    for (const seed of [31, 32, 33]) {
      const rng = Rng.fromSeed(seed);
      let state = createGame({ seed });
      for (let i = 0; i < 220; i++) {
        const legal = legalCommands(state);
        for (const command of legal) expect(validate(state, command)).toEqual({ ok: true });
        const command = rng.chance(0.12) ? legal.at(-1) : rng.pick(legal);
        if (!command) throw new Error('No legal command');
        const { state: next, events } = apply(state, command);
        expectInvariants(next);
        for (const e of events) {
          if (e.type === 'tileOwnerChanged' && e.from === null) captures++;
          if (e.type === 'unitsMerged') merges++;
        }
        state = next;
      }
      // Capitals are locked until M6.
      for (const p of state.players) expect(capitalOf(state, p.id)).toBeDefined();
    }
    expect(captures).toBeGreaterThan(20);
    expect(merges).toBeGreaterThan(0);
  });

  it('lists exactly the valid moves: nothing more, nothing less', () => {
    const rng = Rng.fromSeed(41);
    const { state } = randomPlay(createGame({ seed: 41 }), 4, 60);
    const legal = new Set(legalCommands(state).map((c) => JSON.stringify(c)));
    const tiles = mapGrid(state.map).tileCount;
    let valid = 0;
    for (const from of unitTiles(state)) {
      for (let i = 0; i < 150; i++) {
        const command: Command = { type: 'moveUnit', from, to: rng.int(0, tiles - 1) };
        const ok = validate(state, command).ok;
        expect(legal.has(JSON.stringify(command)), JSON.stringify(command)).toBe(ok);
        if (ok) valid++;
      }
    }
    expect(valid).toBeGreaterThan(0);
  });
});
