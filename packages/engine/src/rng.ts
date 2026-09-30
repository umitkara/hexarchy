/**
 * Seeded, deterministic RNG.
 *
 * All randomness in the engine (map generation, forest spread, ...) must go through
 * this module, with its state stored in GameState. Same seed + same commands = same game.
 * `Math.random` is forbidden in the engine (enforced by ESLint).
 *
 * Algorithm: sfc32 (128-bit state, passes PractRand/BigCrush), seeded via splitmix32.
 * Only 32-bit integer arithmetic is used, so results are bit-identical on every JS engine.
 */

/** Serializable RNG state: four unsigned 32-bit integers. Plain JSON. */
export type RngState = readonly [number, number, number, number];

const UINT32_RANGE = 0x1_0000_0000;

/** Maps any finite number to an unsigned 32-bit integer seed. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError(`Invalid seed: ${seed}`);
  const integer = Math.trunc(seed);
  return ((integer % UINT32_RANGE) + UINT32_RANGE) % UINT32_RANGE;
}

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derives an independent sub-seed, e.g. one stream per map generation step, so that
 * changing how one step consumes randomness does not reshuffle the others.
 */
export function deriveSeed(seed: number, salt: string): number {
  return mix32(normalizeSeed(seed) ^ hashString(salt));
}

/** splitmix32 finalizer: a good 32-bit integer hash. */
function mix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Warm-up rounds so that similar seeds diverge before the first output. */
const WARM_UP_ROUNDS = 12;

/** Creates the initial RNG state for a seed. */
export function createRngState(seed: number): RngState {
  let s = normalizeSeed(seed);
  const next = () => {
    s = mix32(s);
    return s;
  };
  const rng = new Rng([next(), next(), next(), next()]);
  for (let i = 0; i < WARM_UP_ROUNDS; i++) rng.nextUint32();
  return rng.getState();
}

/**
 * Mutable generator over a serializable state. Typical use in rules code:
 * `const rng = new Rng(state.rng); ...; state.rng = rng.getState();`
 */
export class Rng {
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  constructor(state: RngState) {
    [this.#a, this.#b, this.#c, this.#d] = state;
  }

  static fromSeed(seed: number): Rng {
    return new Rng(createRngState(seed));
  }

  /** Snapshot of the current state; `new Rng(snapshot)` continues the same sequence. */
  getState(): RngState {
    return [this.#a >>> 0, this.#b >>> 0, this.#c >>> 0, this.#d >>> 0];
  }

  /** Next unsigned 32-bit integer (sfc32). */
  nextUint32(): number {
    const a = this.#a;
    const b = this.#b;
    const c = this.#c;
    this.#d = (this.#d + 1) | 0;
    const t = (((a + b) | 0) + this.#d) | 0;
    this.#a = b ^ (b >>> 9);
    this.#b = (c + (c << 3)) | 0;
    this.#c = (((c << 21) | (c >>> 11)) + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range: [${min}, ${max}]`);
    }
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Uniformly chosen element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Fisher-Yates shuffle, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
