import type { Rng } from '../rng';

/**
 * Seeded 2D gradient (Perlin) noise. Only +, -, *, / and floor are used, so values are
 * bit-identical across JS engines.
 */
export type Noise2D = (x: number, y: number) => number;

const DIAGONAL = 0.7071067811865476;
const SQRT2 = 1.4142135623730951;
const GRADIENT_X = [1, -1, 0, 0, DIAGONAL, -DIAGONAL, DIAGONAL, -DIAGONAL];
const GRADIENT_Y = [0, 0, 1, -1, DIAGONAL, DIAGONAL, -DIAGONAL, -DIAGONAL];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Creates a noise function with values roughly in [-1, 1]. */
export function createNoise2D(rng: Rng): Noise2D {
  const permutation = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = permutation[i & 255] ?? 0;
  // A random offset so the map center is not pinned to a lattice point (where noise is 0).
  const offsetX = rng.float() * 256;
  const offsetY = rng.float() * 256;

  const gradientDot = (ix: number, iy: number, dx: number, dy: number): number => {
    const g = (perm[(perm[ix] ?? 0) + iy] ?? 0) & 7;
    return (GRADIENT_X[g] ?? 0) * dx + (GRADIENT_Y[g] ?? 0) * dy;
  };

  return (x, y) => {
    const px = x + offsetX;
    const py = y + offsetY;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const ix = x0 & 255;
    const iy = y0 & 255;
    const n00 = gradientDot(ix, iy, fx, fy);
    const n10 = gradientDot(ix + 1, iy, fx - 1, fy);
    const n01 = gradientDot(ix, iy + 1, fx, fy - 1);
    const n11 = gradientDot(ix + 1, iy + 1, fx - 1, fy - 1);
    const u = fade(fx);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(fy)) * SQRT2;
  };
}

export interface FractalOptions {
  readonly scale: number;
  readonly octaves: number;
  readonly persistence: number;
}

/** Fractal (fBm) noise: octaves of doubling frequency, normalized to roughly [-1, 1]. */
export function fractalNoise(noise: Noise2D, x: number, y: number, options: FractalOptions) {
  let sum = 0;
  let amplitude = 1;
  let amplitudeSum = 0;
  let frequency = options.scale;
  for (let octave = 0; octave < options.octaves; octave++) {
    sum += amplitude * noise(x * frequency, y * frequency);
    amplitudeSum += amplitude;
    amplitude *= options.persistence;
    frequency *= 2;
  }
  return sum / amplitudeSum;
}
