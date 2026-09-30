import { describe, expect, it } from 'vitest';
import { winnerOf } from '../src/state';
import { playAiMatch } from './aiMatch';

describe('AI matches', () => {
  it('end with a winner', () => {
    const { state } = playAiMatch(7, 60, false);
    expect(winnerOf(state)).not.toBeNull();
  });

  it('are deterministic: the same seed plays the same match', () => {
    const a = playAiMatch(11, 10, false);
    const b = playAiMatch(11, 10, false);
    expect(b.commands).toEqual(a.commands);
    expect(b.state).toEqual(a.state);
  });
});
