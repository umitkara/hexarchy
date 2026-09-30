import type {
  Age,
  BuildingKind,
  CenterKind,
  Resources,
  StructureKind,
  UnitLine,
} from './state/game';
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
    /**
     * Forests every starting territory gets at least: without one, no lumber camp yields and
     * the starting materials cannot pay for both a lumber camp and a barracks.
     */
    minTerritoryForests: 1,
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

/** Per-line unit data (GDD 4.4, 6.1, 7). */
export interface UnitLineStats {
  /** Gold price of a bought unit. */
  readonly cost: number;
  /** Level of a bought unit; higher levels only come from merging (GDD 4.4). */
  readonly buyLevel: number;
  /** Highest level of the line (archers stop at 3; the ram has no merged form in v0.1). */
  readonly maxLevel: number;
  /** Turn-start upkeep by level (index = level). */
  readonly upkeep: readonly number[];
  /** Can capture tiles and attack. Support units (strength 0) cannot. */
  readonly fights: boolean;
  /** Can merge with a unit of the same line (GDD 6.2; cross-line recipes come later). */
  readonly merges: boolean;
  /** Building the paying region needs (active) to buy this line (GDD 4.2, 5.2). */
  readonly requires: BuildingKind | null;
  /** Earliest age of its owner for buying it (GDD 9.1). */
  readonly age: Age;
  /** Steps it may take beyond its free-movement area (GDD 6.4: cavalry 2). */
  readonly reach: number;
  /** Protection radius around its tile (1 = the tile and its neighbors; archers 2). */
  readonly protectionRadius: number;
  /** Its protection crosses rivers, fences and walls (archers, GDD 7.1). */
  readonly rangedProtection: boolean;
  /** Can fire a volley (GDD 7.3). */
  readonly volley: boolean;
  /** Siege: 0 strength against units, batters edge structures (GDD 7.2, 7.4). */
  readonly siege: boolean;
  /** Builds edge structures (GDD 5.3). */
  readonly buildsEdges: boolean;
}

const SOLDIER_UPKEEP = [0, 1, 3, 9, 27] as const;

/**
 * Unit lines: infantry (Militia, Spearman, Pikeman, Guard), archers (Archer, Crossbowman,
 * Longbowman), cavalry (Scout, Light cavalry, Knight, Paladin), siege (the battering ram
 * in v0.1) and the worker (level 0). Every level-1 soldier costs the same (GDD 4.4).
 * Combat strength = level (GDD 7.1).
 */
export const UNITS = {
  infantry: {
    cost: 10,
    buyLevel: 1,
    maxLevel: 4,
    upkeep: SOLDIER_UPKEEP,
    fights: true,
    merges: true,
    requires: 'barracks',
    age: 'dark',
    reach: 1,
    protectionRadius: 1,
    rangedProtection: false,
    volley: false,
    siege: false,
    buildsEdges: false,
  },
  archer: {
    cost: 10,
    buyLevel: 1,
    maxLevel: 3,
    upkeep: SOLDIER_UPKEEP,
    fights: true,
    merges: true,
    requires: 'archeryRange',
    age: 'dark',
    reach: 1,
    protectionRadius: 2,
    rangedProtection: true,
    volley: true,
    siege: false,
    buildsEdges: false,
  },
  cavalry: {
    cost: 10,
    buyLevel: 1,
    maxLevel: 4,
    upkeep: SOLDIER_UPKEEP,
    fights: true,
    merges: true,
    requires: 'stable',
    age: 'feudal',
    reach: 2,
    protectionRadius: 1,
    rangedProtection: false,
    volley: false,
    siege: false,
    buildsEdges: false,
  },
  siege: {
    cost: 10,
    buyLevel: 1,
    maxLevel: 1,
    upkeep: SOLDIER_UPKEEP,
    fights: true,
    merges: false,
    requires: 'workshop',
    age: 'feudal',
    reach: 1,
    protectionRadius: 1,
    rangedProtection: false,
    volley: false,
    siege: true,
    buildsEdges: false,
  },
  worker: {
    cost: 8,
    buyLevel: 0,
    maxLevel: 0,
    upkeep: [1],
    fights: false,
    merges: false,
    requires: null,
    age: 'dark',
    reach: 1,
    protectionRadius: 0,
    rangedProtection: false,
    volley: false,
    siege: false,
    buildsEdges: true,
  },
} as const satisfies Readonly<Record<UnitLine, UnitLineStats>>;

/** Archer volley (GDD 7.3) [DRAFT]: range in tiles, strength lost until the turn ends. */
export const VOLLEY = {
  range: 2,
  penalty: 1,
} as const;

export interface StructureStats {
  /** Materials paid from the builder's region treasury (GDD 5.3). */
  readonly cost: number;
  /** Earliest age of its builder (GDD 9.1). */
  readonly age: Age;
  /** Where it goes: on a river edge (bridge) or on any other land edge. */
  readonly onRiver: boolean;
  /** Replaces this own structure when built on its edge (upgrade at full price). */
  readonly upgrades: StructureKind | null;
  /** Only as an upgrade of `upgrades` (the gate needs a wall). */
  readonly upgradeOnly: boolean;
  /** Siege hits that bring it down (GDD 7.4: fence 1 turn, wall and gate 2). */
  readonly hits: number;
  /** Non-siege units of this level or more break it with one blow (fence: Sv3+), or null. */
  readonly breakLevel: number | null;
}

/**
 * Edge structures (GDD 3.2, 5.3) [DRAFT costs]. Built by a worker next to the edge.
 * Movement: fences and walls cut it for everyone, gates only for others, bridges connect a
 * river. Treasuries: only bridges change anything (they link across a river).
 */
export const STRUCTURES = {
  fence: {
    cost: 2,
    age: 'dark',
    onRiver: false,
    upgrades: null,
    upgradeOnly: false,
    hits: 1,
    breakLevel: 3,
  },
  wall: {
    cost: 5,
    age: 'feudal',
    onRiver: false,
    upgrades: 'fence',
    upgradeOnly: false,
    hits: 2,
    breakLevel: null,
  },
  gate: {
    cost: 4,
    age: 'feudal',
    onRiver: false,
    upgrades: 'wall',
    upgradeOnly: true,
    hits: 2,
    breakLevel: null,
  },
  bridge: {
    cost: 6,
    age: 'feudal',
    onRiver: true,
    upgrades: null,
    upgradeOnly: false,
    hits: 1,
    breakLevel: null,
  },
} as const satisfies Readonly<Record<StructureKind, StructureStats>>;

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
 * 4.3); military ones unlock unit lines (see UNITS.requires) or protect (tower).
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

/**
 * Advancing an age (GDD 9.1) [DRAFT costs]: paid from the capital region's treasury; the
 * new age arrives at the player's next turn start (a one-turn risk window).
 */
export const AGE_ADVANCE = {
  /** The last age a player can reach (v0.1 plays Dark and Feudal, PLAN 1). */
  lastAge: 'feudal' satisfies Age,
  /** Price of reaching each age. */
  cost: {
    feudal: { gold: 50, food: 30, materials: 20 },
    castle: { gold: 120, food: 80, materials: 60 },
    imperial: { gold: 250, food: 150, materials: 120 },
  } satisfies Readonly<Record<Exclude<Age, 'dark'>, Resources>>,
} as const;

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
 * Counter bonuses (GDD 7.2) [DRAFT]: attacker line → defender line → extra strength. Only
 * the attacker gets them (GDD 7.1). Siege is special instead (UNITS.siege): full strength
 * against centers and towers, 0 against units.
 */
export const COUNTER_BONUS: Readonly<Partial<Record<UnitLine, Partial<Record<UnitLine, number>>>>> =
  {
    infantry: { cavalry: 1 },
    cavalry: { archer: 1, siege: 1 },
  };

/**
 * Utility AI (GDD 12, PLAN M7) [DRAFT]: every candidate command gets a score in points —
 * roughly gold-equivalents — and the best one is played, until none scores `minScore`.
 * Values are what gaining (or losing) something is worth; weights scale costs and risks.
 */
export const AI = {
  /** Loop guards: an AI turn ends after this many commands, whatever is left to do. */
  maxCommandsPerTurn: 80,
  /** Moves within own land exhaust nothing; at most this many per turn. */
  maxRepositionsPerTurn: 12,
  /** The best candidate must score at least this, or the AI ends its turn. */
  minScore: 0.5,
  /** Personalities: each AI scales aggression, expansion and caution by 1 ± this (seeded). */
  personalitySpread: 0.15,

  /** Worth of owning a tile: per gold it yields per turn, and extras. */
  tile: {
    perGold: 5,
    /** Forests yield no gold but feed lumber camps and keep options open. */
    forest: 2,
    /** A hill with an ore vein (gold mine site). */
    vein: 3,
    /** Per own neighbor of a captured tile: compact land is easier to hold. */
    compact: 0.3,
    /** Joining two own regions into one treasury, plus per tile of the smaller ones. */
    join: 4,
    joinPerTile: 0.5,
  },
  /** Worth of a unit per level (a worker counts as `worker`). */
  unitPerLevel: 8,
  worker: 4,
  /** Worth of a building: its materials cost times this. */
  buildingPerMaterial: 1,
  /** Losing a local center: its treasury times this, plus per tile of its region. */
  centerTreasury: 0.3,
  centerPerTile: 1,
  /** Losing the capital means elimination. */
  capital: 400,
  /** Per tile cut off from its region's center by losing a tile (split, GDD 12). */
  splitPerTile: 2,
  /** Taking an enemy capital (it eliminates them). */
  eliminate: 400,
  /** Enemy losses count this much of an own gain. */
  harm: 0.7,
  /** An own tile an enemy could take next turn loses this share of its worth. */
  risk: 0.6,

  /** Spending: points per gold (buying) and per material (building, structures). */
  goldSpend: 0.5,
  materialSpend: 1,
  /** Per food of extra upkeep each turn (GDD 4.4). */
  upkeep: 2,
  /** A bought fighter keeps capturing on later turns. */
  newUnit: 3,
  /** Turns of food deficit a region may run on its stock before refusing more upkeep. */
  foodLookahead: 3,
  /** Merging: share of the best target the merged level newly opens up (next turn). */
  mergeFuture: 0.5,
  /** Buying a unit to merge with a second one (no own fighter nearby): share of `mergeFuture`. */
  muster: 0.6,
  /** Stocks above `stock` are spent at a discount (rich / stock), down to `floor`. */
  wealth: { stock: 80, floor: 0.2 },
  /** Per ready unit used up by a merge (it cannot act again this turn). */
  actionLoss: 2,
  /** Moving within own land to defend: a small cost, so pointless moves are not made. */
  reposition: 0.2,

  /** Per resource yielded per turn, times `buildHorizon` turns. */
  buildHorizon: 5,
  /**
   * A region saves materials for a building it cannot yet afford: per turn of saving its
   * value is discounted by this factor; cheaper builds must beat the discounted value.
   */
  savingDiscount: 0.9,
  goldPerTurn: 1,
  /** Food per turn is worth more while a region's food balance (after upkeep) is low. */
  food: { deficit: 3, low: 2, surplus: 0.4, comfortNet: 4 },
  /** Materials per turn are worth more while a region yields few. */
  materials: { none: 5, low: 1.5, plenty: 0.6, plentyIncome: 3 },
  /** A captured tile next to an own farm, lumber camp or quarry: per extra resource per turn. */
  neighborYieldTurns: 2,
  /** Military buildings (the region has none of the kind yet). */
  barracks: 30,
  archeryRange: 10,
  stable: 6,
  workshop: 6,
  /** A non-production building on a tile that would suit a farm: per food it could yield. */
  farmSiteLoss: 1,
  /** Regions smaller than this get military buildings at a third of their value. */
  militaryMinTiles: 6,

  /** Age timing (GDD 9.1): the capital region saves up the price once it is ready. */
  age: {
    advance: 120,
    saveFromRound: 5,
    minTiles: 12,
    /** Food and materials are worth this much more in the capital region while saving. */
    savingBoost: 2,
  },
  /** Defending moves this valuable may spend the age savings. */
  emergency: 40,

  /** Edge structures (GDD 5.3): bridges joining own regions or opening a crossing. */
  bridgeJoin: 10,
  bridgeOpen: 1.5,
  /** A bridge toward land to take: this share of the gain of taking the tile across. */
  bridgeReach: 0.5,
  /** Fences and walls block own attacks across their edge too. */
  fenceOffense: 1,
  /** Upgrading a fence to a wall where enemies could break fences (Sv3+). */
  wall: 4,
  /** A worker walking to a structure site: this share of the structure's score. */
  workerTravel: 0.9,
  /** Buying a worker for a structure (the region has none): this much is deducted. */
  workerNeed: 4,
  /** A volley that lets an own unit take a tile: this share of the take. */
  volleyFollow: 0.8,
  /** Striking an enemy structure; more if an enemy capital is within 2 tiles. */
  breach: 3,
  breachCapital: 8,
} as const;
