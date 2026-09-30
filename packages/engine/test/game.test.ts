import { describe, expect, it } from 'vitest';
import { MAP_GEN, START } from '../src/balance';
import { apply, validate, type Command } from '../src/commands';
import { generateMap, startTerritory } from '../src/map';
import { Rng } from '../src/rng';
import { getRegions, type GameEvent } from '../src/rules';
import {
  capitalOf,
  centerTiles,
  createGame,
  isOwnable,
  isWater,
  mapGrid,
  type GameState,
  type Resources,
} from '../src/state';
import { expectCenterInvariants } from './fixtures/invariants';

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 104729 + 3);
const games = SEEDS.map((seed) => createGame({ seed }));

describe('createGame (GDD 4.7)', () => {
  it('is deterministic and plain JSON', () => {
    expect(createGame({ seed: 77 })).toEqual(createGame({ seed: 77 }));
    const game = games[0];
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
    expect(createGame({ seed: 78 })).not.toEqual(createGame({ seed: 77 }));
  });

  it('starts round 1 with player 0 (human) and 3 AI players', () => {
    for (const game of games) {
      expect(game.round).toBe(1);
      expect(game.currentPlayer).toBe(0);
      expect(game.players.map((p) => p.controller)).toEqual(['human', 'ai', 'ai', 'ai']);
    }
  });

  it('gives each player a capital with the starting treasury and a 7-tile region', () => {
    for (const game of games) {
      expectCenterInvariants(game);
      const { regions } = getRegions(game);
      expect(regions).toHaveLength(START.players);
      for (const player of game.players) {
        const capital = capitalOf(game, player.id);
        expect(capital).toBeDefined();
        if (capital === undefined) continue;
        expect(game.map.tiles[capital]?.terrain).toBe('plains');
        expect(game.centers[capital]?.treasury).toEqual(START.treasury);
        const region = regions.find((r) => r.owner === player.id);
        expect(region?.tiles).toHaveLength(START.territoryTiles);
        expect(region?.tiles).toContain(capital);
      }
      expect(centerTiles(game)).toHaveLength(START.players);
      expect(game.owners.filter((o) => o !== null)).toHaveLength(
        START.players * START.territoryTiles,
      );
    }
  });

  it('only owns ownable land', () => {
    for (const game of games) {
      game.owners.forEach((owner, tile) => {
        if (owner !== null) expect(isOwnable(game.map.tiles[tile]?.terrain ?? 'sea')).toBe(true);
      });
    }
  });
});

describe('fair start (GDD 3.3)', () => {
  const { fairRadius, minSpacing, territoryRadius } = MAP_GEN.starts;

  function startAreas(game: GameState) {
    const grid = mapGrid(game.map);
    return game.players.map((p) => {
      const capital = capitalOf(game, p.id) ?? -1;
      const territory = startTerritory(game.map, capital, START.territoryTiles);
      const disk = grid.coords.flatMap((_, t) =>
        grid.distance(capital, t) <= fairRadius ? [t] : [],
      );
      const count = (tiles: number[], test: (t: number) => boolean) => tiles.filter(test).length;
      const terrain = (t: number) => game.map.tiles[t]?.terrain;
      return {
        capital,
        territory,
        forest: count(disk, (t) => terrain(t) === 'forest'),
        hill: count(disk, (t) => terrain(t) === 'hill'),
        veins: count(disk, (t) => game.map.tiles[t]?.vein === true),
        water: count(disk, (t) => isWater(terrain(t) ?? 'sea')),
        territoryForest: count(territory, (t) => terrain(t) === 'forest'),
      };
    });
  }

  it('places capitals far apart', () => {
    for (const game of games) {
      const grid = mapGrid(game.map);
      const capitals = startAreas(game).map((a) => a.capital);
      for (const a of capitals) {
        for (const b of capitals)
          if (a < b) expect(grid.distance(a, b)).toBeGreaterThanOrEqual(minSpacing);
      }
    }
  });

  it('owns exactly the compact starting territory', () => {
    for (const game of games) {
      const grid = mapGrid(game.map);
      for (const area of startAreas(game)) {
        expect(area.territory).toHaveLength(START.territoryTiles);
        for (const t of area.territory) {
          expect(game.owners[t]).toBe(game.owners[area.capital]);
          expect(grid.distance(area.capital, t)).toBeLessThanOrEqual(territoryRadius);
        }
      }
    }
  });

  it('equalizes forests, hills and veins around every capital', () => {
    for (const game of games) {
      const areas = startAreas(game);
      for (const key of ['forest', 'hill', 'veins', 'territoryForest'] as const) {
        expect(new Set(areas.map((a) => a[key])).size, `${key} on seed ${game.map.seed}`).toBe(1);
      }
    }
  });

  it('keeps the water around the capitals similar', () => {
    for (const game of games) {
      const water = startAreas(game).map((a) => a.water);
      expect(Math.max(...water) - Math.min(...water)).toBeLessThanOrEqual(10);
    }
  });

  it('only changes plains, forests and hills of the generated map', () => {
    for (const game of games) {
      const generated = generateMap({ seed: game.map.seed });
      expect(game.map.edges).toEqual(generated.edges);
      game.map.tiles.forEach((tile, i) => {
        const before = generated.tiles[i]?.terrain ?? 'sea';
        if (tile.terrain !== before) {
          expect(isOwnable(before) && isOwnable(tile.terrain)).toBe(true);
        }
        if (tile.vein) expect(tile.terrain).toBe('hill');
      });
    }
  });
});

/** A reproducible stream of mixed commands: mostly paints, some turn ends. */
function randomCommands(game: GameState, seed: number, count: number): Command[] {
  const rng = Rng.fromSeed(seed);
  const land = game.map.tiles.flatMap((t, i) => (isOwnable(t.terrain) ? [i] : []));
  return Array.from({ length: count }, (): Command => {
    if (rng.chance(0.15)) return { type: 'endTurn' };
    const owner = rng.int(-1, game.players.length - 1);
    return { type: 'debugPaint', tile: rng.pick(land), owner: owner < 0 ? null : owner };
  });
}

function play(game: GameState, commands: readonly Command[]) {
  const events: GameEvent[] = [];
  let state = game;
  for (const command of commands) {
    if (!validate(state, command).ok) continue;
    const result = apply(state, command);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const total = (state: GameState): Resources =>
  Object.values(state.centers).reduce<Resources>(
    (sum, c) => ({
      gold: sum.gold + (c?.treasury.gold ?? 0),
      food: sum.food + (c?.treasury.food ?? 0),
      materials: sum.materials + (c?.treasury.materials ?? 0),
    }),
    { gold: 0, food: 0, materials: 0 },
  );

describe('determinism and invariants', () => {
  it('same seed + same commands = same game', () => {
    const commands = randomCommands(createGame({ seed: 5 }), 1, 300);
    const a = play(createGame({ seed: 5 }), commands);
    const b = play(createGame({ seed: 5 }), commands);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });

  it('continues identically from a JSON round trip', () => {
    const game = createGame({ seed: 6 });
    const commands = randomCommands(game, 2, 200);
    const direct = play(game, commands).state;
    const halfway = play(game, commands.slice(0, 100)).state;
    const restored = JSON.parse(JSON.stringify(halfway)) as GameState;
    expect(play(restored, commands.slice(100)).state).toEqual(direct);
  });

  it('never mutates the previous state', () => {
    const game = createGame({ seed: 8 });
    const snapshot = JSON.stringify(game);
    play(game, randomCommands(game, 3, 100));
    expect(JSON.stringify(game)).toBe(snapshot);
  });

  it('keeps the center invariants and accounts for every coin', () => {
    for (const seed of [11, 12, 13]) {
      const game = createGame({ seed });
      let state = game;
      for (const command of randomCommands(game, seed, 250)) {
        if (!validate(state, command).ok) continue;
        const before = total(state);
        const { state: next, events } = apply(state, command);
        expectCenterInvariants(next);
        // Treasuries change only by income (+) and destroyed centers (−).
        let expected = before.gold;
        for (const e of events) {
          if (e.type === 'income') expected += e.gold;
          if (e.type === 'centerRemoved') expected -= e.lost.gold;
        }
        expect(total(next).gold).toBe(expected);
        state = next;
      }
      // Capitals are locked in M2, so every player still has one.
      for (const p of state.players) expect(capitalOf(state, p.id)).toBeDefined();
    }
  });
});
