import type { Terrain } from './state/map';

/**
 * Every balance number (costs, upkeep, yields, age prices, ...) lives here and only here.
 * Rules code must read from this module instead of hard-coding values.
 * Numbers marked [DRAFT] in GDD.md are first guesses and will be tuned.
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
  /** Fair start placement (GDD 3.3). */
  starts: {
    /** Resources (plains, forest, hill, water, veins) are balanced within this radius. */
    fairRadius: 3,
    /** Minimum hex distance between two capitals (keeps the fair areas disjoint). */
    minSpacing: 7,
    /** The starting territory must fit within this distance of the capital. */
    territoryRadius: 2,
    /** Minimum ownable land tiles within `fairRadius` of a capital (37 tiles in total). */
    minLand: 24,
    /** Random restarts of the spread-out placement search; the best one wins. */
    attempts: 64,
    /** Placement score = min capital distance − weights × spread (max − min) of these counts. */
    waterWeight: 0.5,
    landWeight: 0.5,
  },
} as const;

/** Game start (GDD 4.7) [DRAFT]. */
export const START = {
  /** MVP: the player + 3 AI (GDD 3.4). */
  players: 4,
  /** Starting territory, including the capital tile (capital + its neighbors). */
  territoryTiles: 7,
  /** Starting treasury of the capital region. The starting worker joins with units (M3/M5). */
  treasury: { gold: 20, food: 10, materials: 10 },
} as const;

/** Economy (GDD 4.1-4.2). */
export const ECONOMY = {
  /** Gold per owned tile, by terrain (GDD 3.1: every land tile +1, forest 0). */
  tileGold: {
    plains: 1,
    forest: 0,
    hill: 1,
    mountain: 0,
    sea: 0,
    lake: 0,
  } satisfies Readonly<Record<Terrain, number>>,
  /**
   * Turn-start income begins in this round. Round 1 runs on the starting treasury, so every
   * player collects the same number of incomes before each of their turns.
   */
  firstIncomeRound: 2,
} as const;
