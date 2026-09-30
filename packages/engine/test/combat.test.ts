import { describe, expect, it } from 'vitest';
import {
  attackBlockers,
  checkPlacement,
  computeProtectionMap,
  protectorsOf,
  type Protector,
} from '../src/rules';
import { parseFixture, renderFixture } from './fixtures/ascii';
import { eventsOf, move, refusal, run } from './helpers';

const summary = (protectors: readonly Protector[]) =>
  protectors.map((p) => [p.kind, p.tile, p.strength]);

describe('protection (GDD 7.1)', () => {
  it('comes from the unit on the tile, own units next to it and the center', () => {
    const f = parseFixture(`
      .   B2  B1  B*
        .   B   B   .
    `);
    // (2,0) is protected by itself (1), the capital (3,0) (1) and (1,0) (2); neighbors
    // come in direction order, east first.
    expect(summary(protectorsOf(f.state, f.tile(2, 0)))).toEqual([
      ['unit', f.tile(2, 0), 1],
      ['center', f.tile(3, 0), 1],
      ['unit', f.tile(1, 0), 2],
    ]);
    // (1,1): odd row, touches (1,0) and (2,0) above.
    expect(summary(protectorsOf(f.state, f.tile(1, 1)))).toEqual([
      ['unit', f.tile(1, 0), 2],
      ['unit', f.tile(2, 0), 1],
    ]);
  });

  it('never comes from other players, neutral tiles or workers', () => {
    const f = parseFixture('A3  B   Bw  .');
    expect(protectorsOf(f.state, f.tile(1, 0))).toEqual([]);
    expect(protectorsOf(f.state, f.tile(3, 0))).toEqual([]);
  });

  it('crosses a ford but not a river (units and centers alike)', () => {
    const river = parseFixture('.   B  |B2  B*');
    expect(protectorsOf(river.state, river.tile(1, 0))).toEqual([]);
    const ford = parseFixture('.   B  =B2  B*');
    expect(summary(protectorsOf(ford.state, ford.tile(1, 0)))).toEqual([
      ['unit', ford.tile(2, 0), 2],
    ]);
    const center = parseFixture('.   B  =B*');
    expect(summary(protectorsOf(center.state, center.tile(1, 0)))).toEqual([
      ['center', center.tile(2, 0), 1],
    ]);
    expect(protectorsOf(parseFixture('.   B  |B*').state, 1)).toEqual([]);
  });

  it('maps the strongest protector of every tile', () => {
    const f = parseFixture('A*  A   .   B   B2 |B');
    expect([...computeProtectionMap(f.state)]).toEqual([1, 1, 0, 2, 2, 0]);
  });
});

describe('attack (GDD 7.1)', () => {
  it('fails on a tie: the attacker must be strictly stronger than every protector', () => {
    const f = parseFixture('A*  A1  B1  .   B*');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('protected');
    const check = checkPlacement(f.state, { kind: 'unit', from: f.tile(1, 0) }, f.tile(2, 0));
    expect(check.ok ? [] : summary(check.blockers ?? [])).toEqual([['unit', f.tile(2, 0), 1]]);
  });

  it('beats weaker protectors and kills the unit on the tile', () => {
    const f = parseFixture('A*  A2  B1  .   B*');
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(renderFixture(state)).toBe('A*  A   A2  .   B*');
    expect(eventsOf(events, 'unitKilled')).toEqual([
      {
        type: 'unitKilled',
        tile: f.tile(2, 0),
        owner: 1,
        unit: { line: 'infantry', level: 1, exhausted: false },
        reason: 'captured',
      },
    ]);
  });

  it('must beat the neighbors too', () => {
    const f = parseFixture('A*  A2  B   B2  B*');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('protected');
    const feudal = parseFixture('A*  A3  B   B2  B*', { age: 'feudal' });
    expect(run(feudal.state, move(feudal.tile(1, 0), feudal.tile(2, 0))).state.owners[2]).toBe(0);
  });

  it('respects the center: level 1 cannot take a tile next to a center', () => {
    const f = parseFixture('A*  A1  B   B+  B');
    expect(attackBlockers(f.state, { line: 'infantry', level: 1, exhausted: false }, 2)).toEqual([
      { kind: 'center', tile: f.tile(3, 0), owner: 1, strength: 1, center: 'local' },
    ]);
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('protected');
  });

  it('destroys a captured local center with its treasury', () => {
    const f = parseFixture('A*  A2  B+  B   .', { treasury: { gold: 9, food: 0, materials: 0 } });
    const { state, events } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(renderFixture(state)).toBe('A*  A   A2  B   .');
    expect(eventsOf(events, 'centerRemoved')[0]?.lost.gold).toBe(9);
  });

  it('cannot take a capital before M6', () => {
    const f = parseFixture('A*  A4  B*  B', { age: 'imperial' });
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('capitalLocked');
  });

  it('never crosses a river, even against an empty tile', () => {
    const f = parseFixture('A*  A2 |B   B*');
    expect(refusal(f.state, move(f.tile(1, 0), f.tile(2, 0)))).toBe('edgeBlocked');
  });

  it('turns rivers into defense lines: a river-side tile loses its neighbors', () => {
    // Same layout: across a ford (2,0) is protected by B2, behind a river it is not.
    const ford = parseFixture('A*  A2  B  =B2  B*');
    expect(refusal(ford.state, move(ford.tile(1, 0), ford.tile(2, 0)))).toBe('protected');
    const river = parseFixture('A*  A2  B  |B2  B*');
    const { state } = run(river.state, move(river.tile(1, 0), river.tile(2, 0)));
    expect(renderFixture(state)).toBe('A*  A   A2 |B2  B*');
  });
});
