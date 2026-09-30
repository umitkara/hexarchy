/**
 * Every balance number (costs, upkeep, yields, age prices, ...) lives here and only here.
 * Rules code must read from this module instead of hard-coding values.
 *
 * Game rule numbers are populated from M2 onward (see GDD.md for draft numbers).
 */

/** Map size presets (GDD 3.4). v0.1 ships the medium map only. */
export const MAP_SIZES = {
  medium: {
    /** Hexagon grid radius. The outermost ring is always sea. */
    radius: 16,
    /** Land tiles of the continent (including mountains, excluding lakes). */
    landTiles: 400,
    /** Target river count (fewer if the map lacks valid, well-spaced sources). */
    rivers: 6,
  },
} as const;

export type MapSize = keyof typeof MAP_SIZES;

/** Map generation tuning (GDD 3.3). */
export const MAP_GEN = {
  elevation: {
    /** Noise frequency, per unit hex size. Lower = larger features. */
    scale: 0.09,
    octaves: 4,
    persistence: 0.5,
    /** Radial falloff strength: pushes the map edge under water, forming a continent. */
    falloff: 0.5,
  },
  /** Ruggedness noise: blended with elevation to pick mountains and hills. */
  relief: {
    scale: 0.15,
    octaves: 3,
    persistence: 0.5,
    /** Weight of elevation vs ruggedness (0..1). Lower = ranges spread across the map. */
    elevationWeight: 0.35,
  },
  moisture: {
    scale: 0.13,
    octaves: 3,
    persistence: 0.5,
  },
  terrain: {
    /** Shares of the land tiles, assigned by relief rank (highest first). */
    mountainShare: 0.07,
    hillShare: 0.15,
    /** Share of the remaining lowland that becomes forest, by moisture rank. */
    forestShare: 0.32,
    /** Chance that a hill carries an ore vein. */
    veinChance: 0.3,
  },
  rivers: {
    /** Rivers shorter than this many edges are discarded. */
    minLength: 4,
    /** Minimum hex distance between river sources. */
    sourceSpacing: 4,
    /** Expected fords per river edge (stochastic rounding per river). */
    fordRate: 0.08,
  },
} as const;
