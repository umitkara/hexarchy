import { describe, expect, it } from 'vitest';
import {
  applyToHistory,
  canUndo,
  startHistory,
  undo,
  undoTurn,
  type Command,
  type TurnHistory,
} from '../src/commands';
import { parseFixture } from './fixtures/ascii';
import { endTurn, move } from './helpers';

function play(history: TurnHistory, ...commands: Command[]): TurnHistory {
  for (const command of commands) history = applyToHistory(history, command).history;
  return history;
}

describe('in-turn undo (GDD 13)', () => {
  const f = parseFixture('A*k A1  A1  .   .   B*', {
    treasury: { gold: 20, food: 0, materials: 0 },
  });
  const buy: Command = {
    type: 'buyUnit',
    line: 'infantry',
    center: f.tile(0, 0),
    tile: f.tile(4, 0),
  };

  it('steps back one command at a time, to the very same states', () => {
    const start = startHistory(f.state);
    expect(canUndo(start)).toBe(false);
    const afterCapture = play(start, move(f.tile(1, 0), f.tile(3, 0)));
    const afterMerge = play(afterCapture, move(f.tile(2, 0), f.tile(3, 0)));
    expect(afterMerge.present.units[f.tile(3, 0)]?.level).toBe(2);

    const back = undo(afterMerge);
    expect(back.present).toBe(afterCapture.present);
    expect(undo(back).present).toBe(f.state);
    expect(canUndo(undo(back))).toBe(false);
    expect(undo(undo(back))).toEqual(undo(back));
  });

  it('returns to the turn start in one go, undoing purchases too', () => {
    const history = play(startHistory(f.state), move(f.tile(1, 0), f.tile(3, 0)), buy);
    expect(history.past).toHaveLength(2);
    expect(history.present.centers[f.tile(0, 0)]?.treasury.gold).toBe(10);
    const reset = undoTurn(history);
    expect(reset.present).toBe(f.state);
    expect(reset.past).toEqual([]);
  });

  it('commits the turn on endTurn: nothing before it can be undone', () => {
    const history = play(startHistory(f.state), move(f.tile(1, 0), f.tile(3, 0)), endTurn);
    expect(history.present.currentPlayer).toBe(1);
    expect(canUndo(history)).toBe(false);
    expect(undoTurn(history)).toEqual(history);
  });

  it('replays to the same state after undo (deterministic commands)', () => {
    const commands = [move(f.tile(1, 0), f.tile(3, 0)), buy, move(f.tile(2, 0), f.tile(1, 0))];
    const once = play(startHistory(f.state), ...commands);
    const again = play(undoTurn(once), ...commands);
    expect(again.present).toEqual(once.present);
  });
});
