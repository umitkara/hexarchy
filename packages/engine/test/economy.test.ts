import { describe, expect, it } from 'vitest';
import { BUILDING_UPKEEP_ORDER, BUILDINGS, FOREST_SPREAD } from '../src/balance';
import { apply, type Command } from '../src/commands';
import {
  buildingOutput,
  checkBuild,
  forestSpreadCandidates,
  forestSpreadChance,
  protectorsOf,
  turnStartForecast,
  type BuildSource,
} from '../src/rules';
import type { BuildingKind, GameState, Resources } from '../src/state';
import {
  parseFixture,
  renderFixture,
  withBuilding,
  withTreasury,
  withUnit,
} from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

const res = (gold: number, food: number, materials = 0): Resources => ({ gold, food, materials });

const build = (building: BuildingKind, center: number, tile: number): Command => ({
  type: 'build',
  building,
  center,
  tile,
});

const buy = (center: number, tile: number): Command => ({
  type: 'buyUnit',
  line: 'infantry',
  center,
  tile,
});

/**
 * Checks that the turn start of the player after the current one does exactly what
 * `turnStartForecast` predicts: treasuries, idle buildings, hungry and rebelling units.
 */
function expectForecastHolds(state: GameState): GameState {
  const next = (state.currentPlayer + 1) % state.players.length;
  const forecast = turnStartForecast(state, next);
  const after = apply(state, { type: 'endTurn' }).state;
  for (const region of forecast) {
    if (region.center !== undefined) {
      expect(after.centers[region.center]?.treasury, `treasury ${region.center}`).toEqual(
        region.after,
      );
    }
    for (const b of region.buildings) {
      expect(after.buildings[b.tile]?.idle, `building ${b.tile}`).toBe(!b.active);
    }
    for (const tile of region.tiles) {
      const unit = after.units[tile];
      if (region.rebels.includes(tile)) expect(unit, `rebel ${tile}`).toBeUndefined();
      else if (state.units[tile]) expect(unit?.hungry).toBe(region.hungry.includes(tile));
    }
  }
  return after;
}

describe('building (GDD 5)', () => {
  const f = parseFixture('A*  A   hA  fA  vA  A   .   B*', { treasury: res(0, 0, 50) });
  const center = f.tile(0, 0);

  it('pays materials from the region treasury and works at once', () => {
    const { state, events } = run(f.state, build('farm', center, f.tile(1, 0)));
    expect(state.buildings[f.tile(1, 0)]).toEqual({ kind: 'farm', idle: false });
    expect(state.centers[center]?.treasury.materials).toBe(50 - BUILDINGS.farm.cost);
    expect(eventsOf(events, 'buildingBuilt')).toEqual([
      {
        type: 'buildingBuilt',
        player: 0,
        center,
        tile: f.tile(1, 0),
        building: 'farm',
        cost: BUILDINGS.farm.cost,
      },
    ]);
    expect(renderFixture(state)).toBe('A*  A#  hA  fA  vA  A   .   B*');
  });

  it('follows the terrain rules: farm on plains, lumber camp at a forest edge, mine on a vein', () => {
    expect(refusal(f.state, build('farm', center, f.tile(2, 0)))).toBe('wrongTerrain');
    expect(refusal(f.state, build('farm', center, f.tile(3, 0)))).toBe('wrongTerrain');
    run(f.state, build('lumberCamp', center, f.tile(2, 0)));
    expect(refusal(f.state, build('lumberCamp', center, f.tile(1, 0)))).toBe('needsForest');
    expect(refusal(f.state, build('lumberCamp', center, f.tile(3, 0)))).toBe('wrongTerrain');
    run(f.state, build('goldMine', center, f.tile(4, 0)));
    expect(refusal(f.state, build('goldMine', center, f.tile(2, 0)))).toBe('needsVein');
    expect(refusal(f.state, build('barracks', center, f.tile(2, 0)))).toBe('wrongTerrain');
  });

  it('needs a free own tile of the paying region, materials and the right age', () => {
    expect(refusal(f.state, build('farm', center, center))).toBe('tileOccupied');
    const farmed = run(f.state, build('farm', center, f.tile(1, 0))).state;
    expect(refusal(farmed, build('barracks', center, f.tile(1, 0)))).toBe('tileOccupied');
    expect(refusal(f.state, build('farm', center, f.tile(6, 0)))).toBe('outsideRegion');
    expect(refusal(f.state, build('farm', f.tile(7, 0), f.tile(6, 0)))).toBe('notYourRegion');
    expect(refusal(f.state, build('farm', f.tile(1, 0), f.tile(5, 0)))).toBe('noTreasury');
    const poor = withTreasury(f.state, center, res(99, 99, BUILDINGS.farm.cost - 1));
    expect(refusal(poor, build('farm', center, f.tile(1, 0)))).toBe('notEnoughMaterials');
    expect(refusal(f.state, build('tower', center, f.tile(1, 0)))).toBe('ageLocked');
    expect(refusal(f.state, build('quarry', center, f.tile(2, 0)))).toBe('ageLocked');
    const feudal = parseFixture('A*  A   hA', { treasury: res(0, 0, 50), age: 'feudal' });
    run(feudal.state, build('tower', 0, feudal.tile(1, 0)), build('quarry', 0, feudal.tile(2, 0)));
  });

  it('shares its tile with a unit', () => {
    const g = parseFixture('A*  A1  A   .', { treasury: res(0, 0, 20) });
    const { state } = run(
      g.state,
      build('farm', 0, g.tile(1, 0)),
      move(g.tile(1, 0), g.tile(2, 0)),
    );
    const back = run(state, move(g.tile(2, 0), g.tile(1, 0))).state;
    expect(renderFixture(back)).toBe('A*  A#1 A   .');
  });

  it('refuses unknown buildings', () => {
    const bad = { type: 'build', building: 'castle', center, tile: 1 } as unknown as Command;
    expect(refusal(f.state, bad)).toBe('unknownBuilding');
  });
});

describe('barracks requirement (GDD 4.2, 5.2)', () => {
  const f = parseFixture('A*  A   A   .   A+  A   B*', { treasury: res(30, 0, 20) });

  it('infantry needs an active barracks in the paying region; workers do not', () => {
    expect(refusal(f.state, buy(0, f.tile(2, 0)))).toBe('needsBuilding');
    run(f.state, { type: 'buyUnit', line: 'worker', center: 0, tile: f.tile(2, 0) });
    const { state } = run(f.state, build('barracks', 0, f.tile(1, 0)), buy(0, f.tile(2, 0)));
    expect(state.units[f.tile(2, 0)]?.level).toBe(1);
    // The other region has no barracks of its own.
    expect(refusal(state, buy(f.tile(4, 0), f.tile(5, 0)))).toBe('needsBuilding');
  });

  it('an idle barracks unlocks nothing', () => {
    const idle = withBuilding(f.state, f.tile(1, 0), { kind: 'barracks', idle: true });
    expect(refusal(idle, buy(0, f.tile(2, 0)))).toBe('needsBuilding');
  });
});

describe('production by neighborhood (GDD 4.3)', () => {
  const output = (fixture: string, building: BuildingKind, col: number, age?: 'feudal') => {
    const f = parseFixture(fixture, age ? { age } : {});
    return buildingOutput(f.state, f.tile(col, 0), building, 0);
  };

  it('farm: itself + every own plains neighbor', () => {
    expect(output('A*  A   A   B   .   B*', 'farm', 1)).toEqual(res(0, 3));
    expect(output('A*  A   A   B   .   B*', 'farm', 2)).toEqual(res(0, 2));
    // Six own plains around it: 7 food.
    const f = parseFixture(`
      A   A   A
        A   A   A*
      A   A   A
    `);
    expect(buildingOutput(f.state, f.tile(1, 1), 'farm', 0)).toEqual(res(0, 7));
  });

  it('lumber camp: every own forest neighbor', () => {
    expect(output('A*  fA  A   f   .', 'lumberCamp', 2)).toEqual(res(0, 0, 1));
    expect(output('fA  hA  fA  A*', 'lumberCamp', 1)).toEqual(res(0, 0, 2));
  });

  it('quarry: every own hill and every mountain around it', () => {
    expect(output('A*  hA  hA  ^   h', 'quarry', 2)).toEqual(res(0, 0, 2));
    expect(output('A*  hA  hA  ^   h', 'quarry', 1)).toEqual(res(0, 0, 1));
  });

  it('gold mine: a flat amount', () => {
    expect(output('A*  vA  hA', 'goldMine', 1)).toEqual(res(3, 0));
  });

  it('previews the yield when placing (GDD 13)', () => {
    const f = parseFixture('A*  A   A   B   .   B*', { treasury: res(0, 0, 20) });
    const source: BuildSource = { kind: 'build', center: 0, building: 'farm' };
    const check = checkBuild(f.state, source, f.tile(1, 0));
    expect(check.ok && check.placement.output).toEqual(res(0, 3));
  });

  it('losing the neighbors lowers the yield: sieges hurt', () => {
    const f = parseFixture('A*  A#  A   B2  B*', { players: 2 });
    expect(buildingOutput(f.state, f.tile(1, 0), 'farm', 0)).toEqual(res(0, 3));
    const taken = run({ ...f.state, currentPlayer: 1 }, move(f.tile(3, 0), f.tile(2, 0))).state;
    expect(buildingOutput(taken, f.tile(1, 0), 'farm', 0)).toEqual(res(0, 2));
  });
});

describe('capturing buildings', () => {
  it('a building changes hands with its tile', () => {
    const f = parseFixture('A*  A1  B#  B   B*');
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(renderFixture(state)).toBe('A*  A   A#1 B   B*');
    expect(eventsOf(events, 'buildingCaptured')).toEqual([
      { type: 'buildingCaptured', tile: f.tile(2, 0), building: 'farm', from: 1, to: 0 },
    ]);
    // Its own tile and the attacker's (1,0); B's (3,0) no longer counts.
    expect(buildingOutput(state, f.tile(2, 0), 'farm', 0)).toEqual(res(0, 2));
  });

  it('is lost when its tile becomes neutral', () => {
    const f = parseFixture('A*  A   A#  A');
    const { state, events } = run(f.state, { type: 'debugPaint', tile: f.tile(2, 0), owner: null });
    expect(state.buildings[f.tile(2, 0)]).toBeUndefined();
    expect(eventsOf(events, 'buildingDestroyed')).toHaveLength(1);
  });
});

describe('building upkeep and the gold shortfall (GDD 4.4, 4.5)', () => {
  it('pays the gold upkeep at turn start, after the tile income', () => {
    const f = parseFixture('A*  A#  A#  Ak  A   B*', { players: 2, currentPlayer: 1 });
    const { state, events } = run(f.state, endTurn);
    // 5 tiles = 5 gold − 3 upkeep; two farms of 3 food each.
    expect(state.centers[0]?.treasury).toEqual(res(2, 6));
    expect(eventsOf(events, 'buildingUpkeepPaid')).toEqual([
      { type: 'buildingUpkeepPaid', player: 0, center: 0, amount: 3 },
    ]);
    expect(eventsOf(events, 'income')).toEqual([
      { type: 'income', player: 0, center: 0, income: res(5, 6) },
    ]);
  });

  it('idles the buildings it cannot pay, the military ones first; they produce nothing', () => {
    expect(BUILDING_UPKEEP_ORDER[0]).toBe('farm');
    expect(BUILDING_UPKEEP_ORDER.at(-1)).toBe('tower');
    const f = parseFixture('A*  At  At  A#  B*', {
      players: 2,
      currentPlayer: 1,
      age: 'feudal',
    });
    const { state, events } = run(f.state, endTurn);
    // 4 gold: farm 1, first tower 2, the second tower is short.
    expect(state.centers[0]?.treasury).toEqual(res(1, 2));
    expect(state.buildings[f.tile(1, 0)]?.idle).toBe(false);
    expect(state.buildings[f.tile(2, 0)]?.idle).toBe(true);
    expect(eventsOf(events, 'buildingsIdle')).toEqual([
      { type: 'buildingsIdle', player: 0, center: 0, tiles: [f.tile(2, 0)] },
    ]);
    // Once the gold is there again, it works again.
    const rich = withTreasury(state, 0, res(10, 0));
    const later = run(rich, endTurn, endTurn).state;
    expect(later.buildings[f.tile(2, 0)]?.idle).toBe(false);
  });

  it('an idle farm yields no food', () => {
    const f = parseFixture('A*  A#  B*', { players: 2, currentPlayer: 1 });
    // A region without a treasury cannot pay: a lone farm tile idles.
    const lone = parseFixture('A*  .   A#  .   B*', { players: 2, currentPlayer: 1 });
    const { state } = run(lone.state, endTurn);
    expect(state.buildings[lone.tile(2, 0)]?.idle).toBe(true);
    expect(run(f.state, endTurn).state.centers[0]?.treasury.food).toBe(2);
  });

  it('a gold mine has no upkeep and helps pay the others', () => {
    const withMine = parseFixture('A*  vA$ At  At  At  .   B*', {
      players: 2,
      currentPlayer: 1,
      age: 'feudal',
    });
    // 5 tiles + 3 from the mine = 8 gold: all three towers (6) are paid.
    const mined = run(withMine.state, endTurn).state;
    expect(mined.centers[0]?.treasury.gold).toBe(2);
    expect(Object.values(mined.buildings).every((b) => b && !b.idle)).toBe(true);
    const without = withBuilding(withMine.state, withMine.tile(1, 0), undefined);
    const short = run(without, endTurn).state;
    expect(short.buildings[withMine.tile(4, 0)]?.idle).toBe(true);
  });

  it('an idle tower protects nothing', () => {
    const f = parseFixture('A*  A1  B   Bt  B*', { age: 'feudal' });
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('protected');
    const idle = withBuilding(f.state, f.tile(3, 0), { kind: 'tower', idle: true });
    expect(run(idle, move(f.tile(1, 0), f.tile(2, 0))).state.owners[f.tile(2, 0)]).toBe(0);
  });
});

describe('tower (GDD 5.2, 7.1)', () => {
  it('protects its tile and neighbors with 2, across rivers too', () => {
    const f = parseFixture('A*  A2  B  |Bt  B*', { age: 'feudal' });
    expect(protectorsOf(f.state, f.tile(2, 0))).toEqual([
      { kind: 'building', tile: f.tile(3, 0), owner: 1, strength: 2, building: 'tower' },
    ]);
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('protected');
    const strong = withUnit(f.state, f.tile(1, 0), {
      line: 'infantry',
      level: 3,
      exhausted: false,
      hungry: false,
      suppressed: false,
    });
    expect(run(strong, move(f.tile(1, 0), f.tile(2, 0))).state.owners[f.tile(2, 0)]).toBe(0);
  });
});

describe('turn start order (GDD 2)', () => {
  it('income → building upkeep → production → food upkeep, then forest spread', () => {
    // No food, no gold: the tiles pay the farm, the farm feeds the unit.
    const f = parseFixture('A*  A#  A1  B*', { players: 2, currentPlayer: 1 });
    const { state, events } = run(f.state, endTurn);
    expect(state.centers[0]?.treasury).toEqual(res(3 - 1, 3 - 1));
    expect(state.units[f.tile(2, 0)]?.hungry).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      'turnEnded',
      'turnStarted',
      'income',
      'buildingUpkeepPaid',
      'upkeepPaid',
    ]);
  });
});

describe('forecast = what happens (GDD 13: treasury panel)', () => {
  it('matches the turn start in every scenario above', () => {
    const scenarios = [
      parseFixture('A*  A#  A#  Ak  A   B*', { players: 2, currentPlayer: 1 }).state,
      parseFixture('A*  At  At  A#  B*', { players: 2, currentPlayer: 1, age: 'feudal' }).state,
      parseFixture('A*  A2  A1  A   .   B*', { players: 2, currentPlayer: 1 }).state,
      parseFixture('A*  A1  .   A1  .   A+  A1  B*', {
        players: 2,
        currentPlayer: 1,
        treasury: res(0, 1),
      }).state,
      parseFixture('A*  .   A#  .   B*', { players: 2, currentPlayer: 1 }).state,
    ];
    for (const scenario of scenarios) {
      // Three rounds: fed, starving, rebellion...
      let state = scenario;
      for (let i = 0; i < 6; i++) state = expectForecastHolds(state);
    }
  });

  it('reports the food outcome and the rebels', () => {
    const f = parseFixture('A*  A2  A1  A   .   B*', { players: 2 });
    const hungry = withUnit(
      withUnit(withTreasury(f.state, 0, res(0, 1)), f.tile(1, 0), {
        line: 'infantry',
        level: 2,
        exhausted: false,
        hungry: true,
        suppressed: false,
      }),
      f.tile(2, 0),
      { line: 'infantry', level: 1, exhausted: false, hungry: true, suppressed: false },
    );
    const [region] = turnStartForecast(hungry, 0);
    expect(region).toMatchObject({
      food: 'rebellion',
      unitUpkeep: 4,
      foodPaid: 1,
      rebels: [f.tile(1, 0)],
      hungry: [],
      after: res(4, 0),
    });
  });
});

describe('forest spread (GDD 4.6)', () => {
  it('only reaches own empty plains next to a forest, never next to a lumber camp', () => {
    const f = parseFixture('A*  A   f   A   A#  f   A   Al  A   f   A   .   f   B   B*', {
      players: 2,
    });
    expect(forestSpreadCandidates(f.state, 0).map((c) => c.tile)).toEqual([
      f.tile(1, 0),
      f.tile(3, 0),
      f.tile(10, 0),
    ]);
    expect(forestSpreadCandidates(f.state, 1).map((c) => c.tile)).toEqual([f.tile(13, 0)]);
    expect(forestSpreadChance(1)).toBeCloseTo(FOREST_SPREAD.chancePerForest);
    expect(forestSpreadChance(2)).toBeCloseTo(1 - (1 - FOREST_SPREAD.chancePerForest) ** 2);
  });

  it('is deterministic and only reaches candidates', () => {
    const f = parseFixture(
      `
        f   A   A   A   f   A   A   A
          A   A   A*  A   A   A   f   A
        A   f   A   A   A   A   A   B*
      `,
      { players: 2 },
    );
    const play = () => {
      let state = f.state;
      const spread: number[] = [];
      for (let i = 0; i < 120; i++) {
        const candidates = new Set(forestSpreadCandidates(state, 0).map((c) => c.tile));
        const result = apply(state, { type: 'endTurn' });
        for (const e of eventsOf(result.events, 'forestSpread')) {
          for (const tile of e.tiles) expect(candidates.has(tile)).toBe(true);
          spread.push(...e.tiles);
        }
        state = result.state;
      }
      return { state, spread };
    };
    const a = play();
    const b = play();
    expect(b.state).toEqual(a.state);
    expect(a.spread.length).toBeGreaterThan(0);
    for (const tile of a.spread) expect(a.state.map.tiles[tile]?.terrain).toBe('forest');
    // A different RNG state spreads differently.
    const other = { ...f.state, rng: [1, 2, 3, 4] as const };
    let state: GameState = other;
    for (let i = 0; i < 120; i++) state = apply(state, { type: 'endTurn' }).state;
    expect(state.map.tiles).not.toEqual(a.state.map.tiles);
  });
});
