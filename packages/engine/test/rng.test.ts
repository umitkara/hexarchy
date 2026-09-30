import { describe, expect, it } from 'vitest';
import { createRngState, deriveSeed, hashString, normalizeSeed, Rng } from '../src/rng';

function take(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(Rng.fromSeed(42), 100)).toEqual(take(Rng.fromSeed(42), 100));
  });

  it('produces different sequences for different seeds, even adjacent ones', () => {
    const a = take(Rng.fromSeed(1), 20);
    const b = take(Rng.fromSeed(2), 20);
    expect(a.filter((v, i) => v === b[i])).toHaveLength(0);
  });

  it('is pinned to a known sequence (changing the algorithm breaks saved games)', () => {
    expect(take(Rng.fromSeed(12345), 4)).toMatchInlineSnapshot(`
      [
        32731855,
        3489271466,
        318760923,
        341348823,
      ]
    `);
  });

  it('continues the same sequence from a saved state, also through JSON', () => {
    const rng = Rng.fromSeed(7);
    take(rng, 13);
    const saved = JSON.parse(JSON.stringify(rng.getState())) as [number, number, number, number];
    const expected = take(rng, 50);
    expect(take(new Rng(saved), 50)).toEqual(expected);
  });

  it('keeps its state as four uint32 numbers', () => {
    const state = createRngState(99);
    expect(state).toHaveLength(4);
    for (const word of state) {
      expect(Number.isInteger(word) && word >= 0 && word < 2 ** 32).toBe(true);
    }
  });

  it('does not mutate a state passed to the constructor', () => {
    const state = createRngState(5);
    const copy = [...state];
    take(new Rng(state), 10);
    expect(state).toEqual(copy);
  });

  it('returns floats in [0, 1) with a plausible mean', () => {
    const rng = Rng.fromSeed(3);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it('returns integers in an inclusive range, hitting every value roughly evenly', () => {
    const rng = Rng.fromSeed(11);
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const v = rng.int(-2, 3);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    for (const count of counts.values()) expect(count).toBeGreaterThan(850);
  });

  it('rejects invalid integer ranges', () => {
    const rng = Rng.fromSeed(1);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });

  it('shuffles into a permutation, deterministically', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = Rng.fromSeed(8).shuffle([...items]);
    const b = Rng.fromSeed(8).shuffle([...items]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(items);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });

  it('picks elements and handles chance edge cases', () => {
    const rng = Rng.fromSeed(4);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });
});

describe('seed helpers', () => {
  it('normalizes any finite number to uint32', () => {
    expect(normalizeSeed(5)).toBe(5);
    expect(normalizeSeed(-1)).toBe(2 ** 32 - 1);
    expect(normalizeSeed(2 ** 32 + 3)).toBe(3);
    expect(normalizeSeed(7.9)).toBe(7);
    expect(() => normalizeSeed(NaN)).toThrow(RangeError);
  });

  it('hashes strings stably', () => {
    expect(hashString('hexarchy')).toBe(hashString('hexarchy'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('derives distinct, stable sub-seeds', () => {
    expect(deriveSeed(1, 'rivers')).toBe(deriveSeed(1, 'rivers'));
    expect(deriveSeed(1, 'rivers')).not.toBe(deriveSeed(1, 'elevation'));
    expect(deriveSeed(1, 'rivers')).not.toBe(deriveSeed(2, 'rivers'));
  });
});
