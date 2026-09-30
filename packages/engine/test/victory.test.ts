import { describe, expect, it } from 'vitest';
import { apply, legalCommands, validate } from '../src/commands';
import { edgeKey } from '../src/hex';
import { activePlayers, isGameOver, winnerOf } from '../src/state';
import { parseFixture, renderFixture, withStructure } from './fixtures/ascii';
import { endTurn, eventsOf, move, refusal, run } from './helpers';

describe('capital conquest (GDD 11)', () => {
  // B: a capital, a second region across the river with a local center, a barracks and a
  // Sv2, and a fence at its border. C watches from the east.
  const base = parseFixture('A*  A2  B*  B1  B  |B+  Bk  B2  .   C*  C', {
    treasury: { gold: 7, food: 5, materials: 3 },
  });
  const fenceEdge = edgeKey(base.tile(7, 0), base.tile(8, 0));
  const field = withStructure(base.state, base.tile(7, 0), base.tile(8, 0), {
    kind: 'fence',
    owner: 1,
  });
  const attack = move(base.tile(1, 0), base.tile(2, 0));

  it('eliminates the owner and leaves the rest of their land neutral', () => {
    const { state, events } = run(field, attack);
    expect(renderFixture(state)).toBe('A*  A   A2  .   .  |.   .   .   .   C*  C');
    expect(state.players[1]?.eliminated).toEqual({ round: 1, by: 0 });
    expect(activePlayers(state)).toEqual([0, 2]);
    expect(winnerOf(state)).toBeNull();
    expect(eventsOf(events, 'playerEliminated')).toEqual([
      { type: 'playerEliminated', player: 1, by: 0, capital: base.tile(2, 0), round: 1 },
    ]);
    expect(eventsOf(events, 'gameWon')).toEqual([]);
  });

  it('loses the capital treasury and every other center, unit and building', () => {
    const { events } = run(field, attack);
    const removed = eventsOf(events, 'centerRemoved');
    expect(removed.map((e) => [e.tile, e.kind, e.reason, e.lost.gold])).toEqual([
      [base.tile(2, 0), 'capital', 'captured', 7],
      [base.tile(5, 0), 'local', 'eliminated', 7],
    ]);
    const killed = eventsOf(events, 'unitKilled');
    expect(killed.map((e) => [e.tile, e.reason])).toEqual([
      [base.tile(3, 0), 'eliminated'],
      [base.tile(7, 0), 'eliminated'],
    ]);
    expect(eventsOf(events, 'buildingDestroyed').map((e) => e.tile)).toEqual([base.tile(6, 0)]);
  });

  it('leaves their edge structures standing as ruins in their name', () => {
    const { state } = run(field, attack);
    expect(state.edgeStructures[fenceEdge]).toEqual({ kind: 'fence', owner: 1, damage: 0 });
  });

  it('cancels an age advance in progress', () => {
    const advancing = {
      ...field,
      players: field.players.map((p) => (p.id === 1 ? { ...p, advancing: 'feudal' as const } : p)),
    };
    const { state } = run(advancing, attack);
    expect(state.players[1]?.advancing).toBeNull();
  });

  it('counts the conquest in the statistics', () => {
    const { state } = run(field, attack);
    expect(state.stats[0]).toMatchObject({ tilesCaptured: 1, unitsKilled: 0, peakTiles: 3 });
    expect(state.stats[1]).toMatchObject({ unitsLost: 2 });
  });

  it('skips eliminated players in the turn order', () => {
    const { state } = run(field, attack, endTurn);
    expect(state.currentPlayer).toBe(2);
    expect(state.round).toBe(1);
    const back = run(state, endTurn).state;
    expect(back.currentPlayer).toBe(0);
    expect(back.round).toBe(2);
  });

  it('still counts rounds when the first player is out', () => {
    // C (player 2) takes A's capital; the round turns over while A is skipped.
    const f = parseFixture('A*  C2  C*  .   B*  B', { currentPlayer: 2 });
    const { state } = run(f.state, move(f.tile(1, 0), f.tile(0, 0)), endTurn);
    expect(state.players[0]?.eliminated).toEqual({ round: 1, by: 2 });
    expect(state.currentPlayer).toBe(1);
    expect(state.round).toBe(2);
  });
});

describe('victory (GDD 11)', () => {
  const f = parseFixture('A*  A2  B*  B   B1');
  const won = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));

  it('goes to the last player standing', () => {
    expect(winnerOf(won.state)).toBe(0);
    expect(isGameOver(won.state)).toBe(true);
    expect(eventsOf(won.events, 'gameWon')).toEqual([{ type: 'gameWon', player: 0, round: 1 }]);
    const types = won.events.map((e) => e.type);
    expect(types.indexOf('gameWon')).toBe(types.indexOf('playerEliminated') + 1);
  });

  it('ends the game: no command is legal or valid any more', () => {
    expect(legalCommands(won.state)).toEqual([]);
    expect(refusal(won.state, endTurn)).toBe('gameOver');
    expect(refusal(won.state, { type: 'advanceAge' })).toBe('gameOver');
    expect(validate(won.state, { type: 'debugPaint', tile: 3, owner: 0 })).toEqual({
      ok: false,
      error: 'gameOver',
    });
    expect(() => apply(won.state, endTurn)).toThrow(/gameOver/);
  });
});

describe('debug commands and eliminated players', () => {
  it('do not give an eliminated player land or an age', () => {
    const f = parseFixture('A*  A2  B*  B   .   C*  C');
    const { state } = run(f.state, move(f.tile(1, 0), f.tile(2, 0)));
    expect(refusal(state, { type: 'debugPaint', tile: f.tile(4, 0), owner: 1 })).toBe('eliminated');
    expect(refusal(state, { type: 'debugSetAge', player: 1, age: 'feudal' })).toBe('eliminated');
  });
});
