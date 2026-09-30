import { describe, expect, it } from 'vitest';
import { STRUCTURES } from '../src/balance';
import type { Command } from '../src/commands';
import { edgeKey } from '../src/hex';
import { checkPlacement, getRegions, movementArea } from '../src/rules';
import type { StructureKind } from '../src/state';
import { parseFixture, withStructure, withUnit } from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

const materials = (amount: number) => ({ gold: 50, food: 50, materials: amount });

const buildEdge = (structure: StructureKind, worker: number, to: number): Command => ({
  type: 'buildEdge',
  structure,
  worker,
  to,
});

const breach = (from: number, to: number): Command => ({ type: 'breachEdge', from, to });

describe('building edge structures (GDD 5.3)', () => {
  const f = parseFixture('A*  Aw  .   B*', { treasury: materials(5) });
  const worker = f.tile(1, 0);

  it('pays materials from the worker region, exhausts the worker and belongs to its owner', () => {
    const { state, events } = run(f.state, buildEdge('fence', worker, f.tile(2, 0)));
    const edge = edgeKey(worker, f.tile(2, 0));
    expect(state.edgeStructures[edge]).toEqual({ kind: 'fence', owner: 0, damage: 0 });
    expect(state.centers[f.tile(0, 0)]?.treasury.materials).toBe(5 - STRUCTURES.fence.cost);
    expect(state.units[worker]?.exhausted).toBe(true);
    expect(eventsOf(events, 'edgeBuilt')).toEqual([
      {
        type: 'edgeBuilt',
        player: 0,
        center: f.tile(0, 0),
        worker,
        edge,
        structure: 'fence',
        replaces: null,
        cost: STRUCTURES.fence.cost,
      },
    ]);
    // Exhausted: one structure per worker per turn.
    expect(refusal(state, buildEdge('fence', worker, f.tile(0, 0)))).toBe('exhausted');
  });

  it('needs a worker, an adjacent ownable tile, the age and the materials', () => {
    expect(refusal(f.state, buildEdge('fence', f.tile(0, 0), f.tile(1, 0)))).toBe('noUnit');
    const soldier = withUnit(f.state, worker, {
      line: 'infantry',
      level: 1,
      exhausted: false,
      hungry: false,
      suppressed: false,
    });
    expect(refusal(soldier, buildEdge('fence', worker, f.tile(2, 0)))).toBe('cannotBuildEdges');
    expect(refusal(f.state, buildEdge('fence', worker, f.tile(3, 0)))).toBe('notAdjacent');
    expect(refusal(f.state, buildEdge('wall', worker, f.tile(2, 0)))).toBe('ageLocked');
    const poor = parseFixture('A*  Aw  .', { treasury: materials(1) });
    expect(refusal(poor.state, buildEdge('fence', poor.tile(1, 0), poor.tile(2, 0)))).toBe(
      'notEnoughMaterials',
    );
    const sea = parseFixture('A*  Aw  ~', { treasury: materials(5) });
    expect(refusal(sea.state, buildEdge('fence', sea.tile(1, 0), sea.tile(2, 0)))).toBe(
      'notOwnable',
    );
  });

  it('may face any tile: neutral, own or enemy', () => {
    const g = parseFixture('A*  Aw  B*', { treasury: materials(5) });
    const { state } = run(g.state, buildEdge('fence', g.tile(1, 0), g.tile(2, 0)));
    expect(state.edgeStructures[edgeKey(g.tile(1, 0), g.tile(2, 0))]?.owner).toBe(0);
  });

  it('puts bridges on rivers only, and everything else off them (fords are land)', () => {
    const feudal = { treasury: materials(20), age: 'feudal' as const };
    const river = parseFixture('A*  Aw |.', feudal);
    const [w, across] = [river.tile(1, 0), river.tile(2, 0)];
    expect(refusal(river.state, buildEdge('fence', w, across))).toBe('riverEdge');
    expect(refusal(river.state, buildEdge('wall', w, across))).toBe('riverEdge');
    expect(run(river.state, buildEdge('bridge', w, across)).state.edgeStructures).toEqual({
      [edgeKey(w, across)]: { kind: 'bridge', owner: 0, damage: 0 },
    });
    const ford = parseFixture('A*  Aw =.', feudal);
    expect(refusal(ford.state, buildEdge('bridge', ford.tile(1, 0), ford.tile(2, 0)))).toBe(
      'needsRiver',
    );
    run(ford.state, buildEdge('fence', ford.tile(1, 0), ford.tile(2, 0)));
  });

  it('upgrades own fences to walls and walls to gates, keeping the damage', () => {
    const g = parseFixture('A*  Aw  .   B*', { treasury: materials(20), age: 'feudal' });
    const [w, to] = [g.tile(1, 0), g.tile(2, 0)];
    const edge = edgeKey(w, to);
    expect(refusal(g.state, buildEdge('gate', w, to))).toBe('needsWall');

    const fenced = withStructure(g.state, w, to, { kind: 'fence', owner: 0 });
    expect(refusal(fenced, buildEdge('fence', w, to))).toBe('edgeOccupied');
    expect(refusal(fenced, buildEdge('gate', w, to))).toBe('needsWall');
    const walled = run(fenced, buildEdge('wall', w, to));
    expect(eventsOf(walled.events, 'edgeBuilt')[0]?.replaces).toBe('fence');
    expect(walled.state.edgeStructures[edge]?.kind).toBe('wall');

    const damaged = withStructure(g.state, w, to, { kind: 'wall', owner: 0, damage: 1 });
    const gated = run(damaged, buildEdge('gate', w, to)).state;
    expect(gated.edgeStructures[edge]).toEqual({ kind: 'gate', owner: 0, damage: 1 });

    // Another player's structure cannot be built over.
    const foreign = withStructure(g.state, w, to, { kind: 'fence', owner: 1 });
    expect(refusal(foreign, buildEdge('wall', w, to))).toBe('edgeOccupied');
  });
});

describe('edge ownership (decision 30)', () => {
  const f = parseFixture(`
    A*  A2  B   B*
      A   A   B   B
  `);
  const [a, b, below] = [f.tile(1, 0), f.tile(2, 0), f.tile(2, 1)];
  const state = withStructure(withStructure(f.state, a, b, { kind: 'fence', owner: 1 }), b, below, {
    kind: 'fence',
    owner: 1,
  });

  it('passes a structure to whoever owns both of its sides', () => {
    // The fence stops the direct step, but (1,1) also touches (2,0).
    const { state: after, events } = run(state, move(a, b));
    expect(after.owners[b]).toBe(0);
    expect(after.edgeStructures[edgeKey(a, b)]?.owner).toBe(0);
    // Taking one side only leaves the structure to its owner.
    expect(after.edgeStructures[edgeKey(b, below)]?.owner).toBe(1);
    expect(eventsOf(events, 'edgeCaptured')).toEqual([
      { type: 'edgeCaptured', edge: edgeKey(a, b), structure: 'fence', from: 1, to: 0 },
    ]);
  });
});

describe('edges in the movement and treasury graphs (GDD 3.2)', () => {
  it('fences and walls cut movement for everyone but not the treasury', () => {
    for (const kind of ['fence', 'wall'] as const) {
      const f = parseFixture('A*  A1  A   A');
      const state = withStructure(f.state, f.tile(1, 0), f.tile(2, 0), { kind, owner: 0 });
      expect(movementArea(state, f.tile(1, 0))).toEqual([f.tile(0, 0), f.tile(1, 0)]);
      expect(refusal(state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('edgeBlocked');
      expect(getRegions(state).regions).toHaveLength(1);
    }
  });

  it('opens a gate to its owner only', () => {
    const f = parseFixture('A*  A1  A   A', { age: 'feudal' });
    const own = withStructure(f.state, f.tile(1, 0), f.tile(2, 0), { kind: 'gate', owner: 0 });
    expect(movementArea(own, f.tile(1, 0))).toHaveLength(4);
    run(own, move(f.tile(1, 0), f.tile(3, 0)));

    const g = parseFixture('A*  A1  B2  B*', { currentPlayer: 1 });
    const gate = withStructure(g.state, g.tile(1, 0), g.tile(2, 0), { kind: 'gate', owner: 1 });
    // B walks out through its own gate and takes the tile behind it...
    expect(run(gate, move(g.tile(2, 0), g.tile(1, 0))).state.owners[g.tile(1, 0)]).toBe(1);
    // ...but A cannot get in through it.
    const aTurn = { ...gate, currentPlayer: 0 };
    expect(refusal(aTurn, move(g.tile(1, 0), g.tile(2, 0)))).toBe('edgeBlocked');
  });

  it('lets units and treasuries cross a river on a bridge', () => {
    const f = parseFixture('A*  A1 |A   A');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(3, 0)))).toBe('unreachable');
    const bridged = withStructure(f.state, f.tile(1, 0), f.tile(2, 0), {
      kind: 'bridge',
      owner: 0,
    });
    expect(getRegions(bridged).regions).toHaveLength(1);
    run(bridged, move(f.tile(1, 0), f.tile(3, 0)));
  });

  it('merges the treasuries of both banks when a bridge goes up', () => {
    const f = parseFixture('A*  Aw |A+  A', { treasury: materials(10), age: 'feudal' });
    const { state, events } = run(f.state, buildEdge('bridge', f.tile(1, 0), f.tile(2, 0)));
    expect(eventsOf(events, 'treasuriesMerged')).toHaveLength(1);
    expect(Object.keys(state.centers)).toEqual([String(f.tile(0, 0))]);
    expect(state.centers[f.tile(0, 0)]?.treasury).toEqual({
      gold: 100,
      food: 100,
      materials: 20 - STRUCTURES.bridge.cost,
    });
  });
});

describe('breaking structures (GDD 7.4)', () => {
  const feudal = { treasury: materials(0), age: 'feudal' as const };

  it('takes a ram two turns against a wall, and the damage stays', () => {
    const f = parseFixture('A*  Am  B   B*', feudal);
    const [ram, beyond] = [f.tile(1, 0), f.tile(2, 0)];
    const edge = edgeKey(ram, beyond);
    const walled = withStructure(f.state, ram, beyond, { kind: 'wall', owner: 1 });
    expect(checkPlacement(walled, { kind: 'unit', from: ram }, beyond)).toMatchObject({
      ok: false,
      error: 'edgeBlocked',
    });

    const first = run(walled, breach(ram, beyond));
    expect(first.state.edgeStructures[edge]).toEqual({ kind: 'wall', owner: 1, damage: 1 });
    expect(first.state.units[ram]?.exhausted).toBe(true);
    expect(eventsOf(first.events, 'edgeDamaged')).toEqual([
      {
        type: 'edgeDamaged',
        player: 0,
        unitTile: ram,
        edge,
        structure: 'wall',
        owner: 1,
        damage: 1,
        hits: 2,
      },
    ]);
    expect(refusal(first.state, breach(ram, beyond))).toBe('exhausted');

    const second = run(first.state, endTurn, endTurn, breach(ram, beyond));
    expect(second.state.edgeStructures[edge]).toBeUndefined();
    expect(eventsOf(second.events, 'edgeDestroyed')).toHaveLength(1);
    // The way is open (next turn): now only the capital's protection stands in the way.
    const later = run(second.state, endTurn, endTurn).state;
    expect(checkPlacement(later, { kind: 'unit', from: ram }, beyond)).toMatchObject({
      ok: false,
      error: 'protected',
    });
  });

  it('lets another ram finish a damaged gate, and fells fences and bridges at once', () => {
    const f = parseFixture('A*  Am  B   B*', feudal);
    const [ram, beyond] = [f.tile(1, 0), f.tile(2, 0)];
    for (const [kind, damage] of [
      ['gate', 1],
      ['fence', 0],
    ] as const) {
      const state = withStructure(f.state, ram, beyond, { kind, owner: 1, damage });
      const { events } = run(state, breach(ram, beyond));
      expect(eventsOf(events, 'edgeDestroyed')).toHaveLength(1);
    }
    const river = parseFixture('A*  Am |B   B*', feudal);
    const bridged = withStructure(river.state, river.tile(1, 0), river.tile(2, 0), {
      kind: 'bridge',
      owner: 1,
    });
    const { state } = run(bridged, breach(river.tile(1, 0), river.tile(2, 0)));
    expect(state.edgeStructures).toEqual({});
  });

  it('lets Sv3+ break a fence (and nothing stronger) without moving', () => {
    const f = parseFixture('A*  A3  B   B*', feudal);
    const [unit, beyond] = [f.tile(1, 0), f.tile(2, 0)];
    const fenced = withStructure(f.state, unit, beyond, { kind: 'fence', owner: 1 });
    const { state } = run(fenced, breach(unit, beyond));
    expect(state.edgeStructures).toEqual({});
    expect(state.units[unit]).toMatchObject({ level: 3, exhausted: true });

    const walled = withStructure(f.state, unit, beyond, { kind: 'wall', owner: 1 });
    expect(refusal(walled, breach(unit, beyond))).toBe('cannotBreach');
    const weak = parseFixture('A*  A2  B   B*', feudal);
    const weakFence = withStructure(weak.state, unit, beyond, { kind: 'fence', owner: 1 });
    expect(refusal(weakFence, breach(unit, beyond))).toBe('cannotBreach');
  });

  it('only strikes other players’ structures on the unit’s own edges', () => {
    const f = parseFixture('A*  Am  A   .   B*', feudal);
    const [ram, next] = [f.tile(1, 0), f.tile(2, 0)];
    expect(refusal(f.state, breach(ram, next))).toBe('noStructure');
    const own = withStructure(f.state, ram, next, { kind: 'fence', owner: 0 });
    expect(refusal(own, breach(ram, next))).toBe('ownStructure');
    const far = withStructure(f.state, next, f.tile(3, 0), { kind: 'fence', owner: 1 });
    expect(refusal(far, breach(ram, f.tile(3, 0)))).toBe('notAdjacent');
  });
});
