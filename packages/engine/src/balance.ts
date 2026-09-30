import type { Age, BuildingKind, CenterKind, Resources, UnitLine } from './state/game';
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
  /** Starting treasury of the capital region. */
  treasury: { gold: 20, food: 10, materials: 10 },
  /** Workers placed next to the capital. */
  workers: 1,
  /** Every player starts in this age. */
  age: 'dark' satisfies Age,
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

/** Per-line unit data (GDD 4.4, 6.1). */
export interface UnitLineStats {
  /** Gold price of a bought unit. */
  readonly cost: number;
  /** Level of a bought unit; higher levels only come from merging (GDD 4.4). */
  readonly buyLevel: number;
  /** Turn-start upkeep by level (index = level). */
  readonly upkeep: readonly number[];
  /** Can capture tiles and attack. Support units (strength 0) cannot. */
  readonly fights: boolean;
  /** Can merge with a unit of the same line (GDD 6.2; cross-line recipes come later). */
  readonly merges: boolean;
  /** Building the paying region needs (active) to buy this line (GDD 4.2, 5.2). */
  readonly requires: BuildingKind | null;
}

/**
 * Unit lines of M3: infantry (Militia, Spearman, Pikeman, Guard) and the worker (level 0).
 * Archers, cavalry and siege join in M5. Combat strength = level (GDD 7.1).
 */
export const UNITS = {
  infantry: {
    cost: 10,
    buyLevel: 1,
    upkeep: [0, 1, 3, 9, 27],
    fights: true,
    merges: true,
    requires: 'barracks',
  },
  worker: { cost: 8, buyLevel: 0, upkeep: [1], fights: false, merges: false, requires: null },
} as const satisfies Readonly<Record<UnitLine, UnitLineStats>>;

/** Unit upkeep (GDD 4.4): paid in food at turn start. */
export const UPKEEP = {
  resource: 'food',
} as const satisfies { readonly resource: keyof Resources };

/** Starvation (GDD 4.5) [DRAFT]. */
export const HUNGER = {
  /** Strength lost by a hungry unit (not below 0). */
  strengthPenalty: 1,
} as const;

/**
 * What a building yields per turn (GDD 4.3): `base`, plus `amount` for every neighbor of a
 * listed terrain — only neighbors owned by the building's owner if `owned` (so capturing
 * them cuts the yield), any neighbor otherwise.
 */
export interface BuildingYield {
  readonly resource: keyof Resources;
  readonly base: number;
  readonly neighbors: Readonly<
    Partial<Record<Terrain, { readonly amount: number; readonly owned: boolean }>>
  >;
}

export interface BuildingStats {
  /** Materials paid from the region treasury; built instantly (GDD 5). */
  readonly cost: number;
  /** Gold per turn; unpaid buildings idle for the turn (GDD 4.4, 4.5). */
  readonly upkeep: number;
  /** Earliest age of its owner (GDD 9.1). */
  readonly age: Age;
  /** Terrain the building may stand on (GDD 3.1, 5). */
  readonly terrain: readonly Terrain[];
  /** Needs an ore vein on its tile (gold mine). */
  readonly vein: boolean;
  /** Needs a forest next to its tile (lumber camp: "forest edge"). */
  readonly nextToForest: boolean;
  readonly yield: BuildingYield | null;
  /** Protection of its tile and neighbors; crosses edges like archers (GDD 7.1). */
  readonly protection: number;
}

/**
 * Buildings (GDD 5.1, 5.2) [DRAFT costs]. Production buildings yield by neighborhood (GDD
 * 4.3); military ones unlock unit lines (see UNITS.requires; archers, cavalry and siege
 * arrive in M5) or protect (tower).
 */
export const BUILDINGS = {
  farm: {
    cost: 5,
    upkeep: 1,
    age: 'dark',
    terrain: ['plains'],
    vein: false,
    nextToForest: false,
    yield: { resource: 'food', base: 1, neighbors: { plains: { amount: 1, owned: true } } },
    protection: 0,
  },
  lumberCamp: {
    cost: 4,
    upkeep: 1,
    age: 'dark',
    terrain: ['plains', 'hill'],
    vein: false,
    nextToForest: true,
    yield: { resource: 'materials', base: 0, neighbors: { forest: { amount: 1, owned: true } } },
    protection: 0,
  },
  quarry: {
    cost: 10,
    upkeep: 1,
    age: 'feudal',
    terrain: ['hill'],
    vein: false,
    nextToForest: false,
    yield: {
      resource: 'materials',
      base: 0,
      neighbors: { hill: { amount: 1, owned: true }, mountain: { amount: 1, owned: false } },
    },
    protection: 0,
  },
  goldMine: {
    cost: 10,
    upkeep: 0,
    age: 'dark',
    terrain: ['hill'],
    vein: true,
    nextToForest: false,
    yield: { resource: 'gold', base: 3, neighbors: {} },
    protection: 0,
  },
  barracks: {
    cost: 8,
    upkeep: 1,
    age: 'dark',
    terrain: ['plains'],
    vein: false,
    nextToForest: false,
    yield: null,
    protection: 0,
  },
  archeryRange: {
    cost: 8,
    upkeep: 1,
    age: 'dark',
    terrain: ['plains'],
    vein: false,
    nextToForest: false,
    yield: null,
    protection: 0,
  },
  stable: {
    cost: 10,
    upkeep: 2,
    age: 'feudal',
    terrain: ['plains'],
    vein: false,
    nextToForest: false,
    yield: null,
    protection: 0,
  },
  workshop: {
    cost: 15,
    upkeep: 2,
    age: 'feudal',
    terrain: ['plains'],
    vein: false,
    nextToForest: false,
    yield: null,
    protection: 0,
  },
  tower: {
    cost: 10,
    upkeep: 2,
    age: 'feudal',
    terrain: ['plains', 'hill'],
    vein: false,
    nextToForest: false,
    yield: null,
    protection: 2,
  },
} as const satisfies Readonly<Record<BuildingKind, BuildingStats>>;

/**
 * Order in which a region pays its buildings' gold upkeep (GDD 4.5): when the gold runs
 * short, the later ones idle first. Food comes first, military last; ties by tile index.
 */
export const BUILDING_UPKEEP_ORDER: readonly BuildingKind[] = [
  'farm',
  'lumberCamp',
  'quarry',
  'goldMine',
  'barracks',
  'archeryRange',
  'stable',
  'workshop',
  'tower',
];

/** Forest spread (GDD 4.6) [DRAFT]. */
export const FOREST_SPREAD = {
  /**
   * At a player's turn start, each of their plains tiles without a building or center
   * turns into forest with this chance per neighboring forest (combined: 1 − (1 − p)^n),
   * unless it is next to a lumber camp.
   */
  chancePerForest: 0.015,
} as const;

/** Merging adds levels (Slay sum) up to this level (GDD 6.2). */
export const MAX_UNIT_LEVEL = 4;

/** Highest level reachable by merging, by the owner's age (GDD 9.1). */
export const LEVEL_CAP = {
  dark: 2,
  feudal: 3,
  castle: 3,
  imperial: 4,
} as const satisfies Readonly<Record<Age, number>>;

/** Protection a region center gives its own tile and its neighbors (GDD 4.2, 7.1). */
export const CENTER_PROTECTION = {
  capital: 1,
  local: 1,
} as const satisfies Readonly<Record<CenterKind, number>>;

/**
 * Counter bonuses (GDD 7.2): attacker line → defender line → extra strength. Only lines that
 * exist are listed; M5 adds infantry → cavalry +1, cavalry → archer/siege +1.
 */
export const COUNTER_BONUS: Readonly<Partial<Record<UnitLine, Partial<Record<UnitLine, number>>>>> =
  {};
