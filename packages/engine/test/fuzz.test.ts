import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/balance';
import { apply, legalCommands, validate, type Command } from '../src/commands';
import { Rng } from '../src/rng';
import { turnStartForecast, type GameEvent } from '../src/rules';
import {
  BUILDING_KINDS,
  capitalOf,
  centerTiles,
  createGame,
  mapGrid,
  unitTiles,
  type GameState,
} from '../src/state';
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
    const counts = { captures: 0, merges: 0, builds: 0, starvations: 0, forest: 0 };
    for (const seed of [31, 32, 33]) {
      const rng = Rng.fromSeed(seed);
      let state = createGame({ seed });
      for (let i = 0; i < 300; i++) {
        const legal = legalCommands(state);
        for (const command of legal) expect(validate(state, command)).toEqual({ ok: true });
        const command = rng.chance(0.12) ? legal.at(-1) : rng.pick(legal);
        if (!command) throw new Error('No legal command');
        const { state: next, events } = apply(state, command);
        expectInvariants(next);
        for (const e of events) {
          if (e.type === 'tileOwnerChanged' && e.from === null) counts.captures++;
          if (e.type === 'unitsMerged') counts.merges++;
          if (e.type === 'buildingBuilt') counts.builds++;
          if (e.type === 'starvation') counts.starvations++;
          if (e.type === 'forestSpread') counts.forest++;
        }
        state = next;
      }
      // Capitals are locked until M6.
      for (const p of state.players) expect(capitalOf(state, p.id)).toBeDefined();
    }
    expect(counts.captures).toBeGreaterThan(10);
    expect(counts.merges).toBeGreaterThan(0);
    expect(counts.builds).toBeGreaterThan(10);
    expect(counts.starvations).toBeGreaterThan(0);
  });

  it('forecasts every turn start exactly (treasury panel = real turn start)', () => {
    let checked = 0;
    for (const seed of [51, 52]) {
      const rng = Rng.fromSeed(seed);
      let state = createGame({ seed });
      for (let i = 0; i < 300; i++) {
        const legal = legalCommands(state);
        const command = rng.chance(0.15) ? legal.at(-1) : rng.pick(legal);
        if (!command) throw new Error('No legal command');
        const next = (state.currentPlayer + 1) % state.players.length;
        const round = next === 0 ? state.round + 1 : state.round;
        const forecast =
          command.type === 'endTurn' && round >= ECONOMY.firstIncomeRound
            ? turnStartForecast(state, next)
            : null;
        const after = apply(state, command).state;
        if (forecast) {
          for (const region of forecast) {
            if (region.center === undefined) continue;
            expect(after.centers[region.center]?.treasury).toEqual(region.after);
            checked++;
          }
          for (const tile of centerTiles(after)) {
            if (after.owners[tile] !== next) continue;
            expect(forecast.some((r) => r.center === tile)).toBe(true);
          }
        }
        state = after;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('lists exactly the valid moves: nothing more, nothing less', () => {
    const rng = Rng.fromSeed(41);
    const game = createGame({ seed: 41 });
    let valid = 0;
    let builds = 0;
    // At the start (materials for a building or two) and after some random play.
    for (const state of [game, randomPlay(game, 4, 60).state]) {
      const legal = new Set(legalCommands(state).map((c) => JSON.stringify(c)));
      const tiles = mapGrid(state.map).tileCount;
      const check = (command: Command) => {
        const ok = validate(state, command).ok;
        expect(legal.has(JSON.stringify(command)), JSON.stringify(command)).toBe(ok);
        return ok ? 1 : 0;
      };
      for (const from of unitTiles(state)) {
        for (let i = 0; i < 150; i++) {
          valid += check({ type: 'moveUnit', from, to: rng.int(0, tiles - 1) });
        }
      }
      for (const center of centerTiles(state)) {
        // Random tiles, plus every tile near the center (where most builds are valid).
        const near = mapGrid(state.map).neighbors(center);
        const candidates = [
          ...Array.from({ length: 30 }, () => rng.int(0, tiles - 1)),
          center,
          ...near,
          ...near.flatMap((n) => mapGrid(state.map).neighbors(n)),
        ];
        for (const building of BUILDING_KINDS) {
          for (const tile of candidates) builds += check({ type: 'build', building, center, tile });
        }
      }
    }
    expect(valid).toBeGreaterThan(0);
    expect(builds).toBeGreaterThan(0);
  });
});
