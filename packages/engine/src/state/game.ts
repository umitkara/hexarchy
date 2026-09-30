import type { EdgeKey } from '../hex/edge';
import type { RngState } from '../rng';
import type { GameMap } from './map';

/**
 * The whole game state: plain, serializable JSON (no classes, no Maps, no typed arrays).
 * Changed only by commands (see commands/). Derived data — regions, income, the movement
 * and protection maps — is computed from it, never stored.
 */

/** Player index into `GameState.players`; also the turn order. */
export type PlayerId = number;

export type Controller = 'human' | 'ai';

/** Ages (GDD 9.1). v0.1 plays Dark and Feudal (see AGE_ADVANCE.lastAge). */
export type Age = 'dark' | 'feudal' | 'castle' | 'imperial';

export const AGES: readonly Age[] = ['dark', 'feudal', 'castle', 'imperial'];

/** True if `age` is `required` or later. */
export function ageAtLeast(age: Age, required: Age): boolean {
  return AGES.indexOf(age) >= AGES.indexOf(required);
}

/** The age after `age`, if any. */
export function nextAge(age: Age): Age | undefined {
  return AGES[AGES.indexOf(age) + 1];
}

/** How a player left the game (GDD 11): their capital fell in `round` to `by`. */
export interface Elimination {
  readonly round: number;
  readonly by: PlayerId;
}

export interface Player {
  readonly id: PlayerId;
  readonly controller: Controller;
  readonly age: Age;
  /**
   * The age being advanced to (GDD 9.1): paid for, and reached at the player's next turn
   * start. Null when not advancing.
   */
  readonly advancing: Age | null;
  /** Set once the player's capital falls; they own nothing after that and never play. */
  readonly eliminated: Elimination | null;
}

/**
 * Per-player match statistics for the end screen: history that cannot be derived from the
 * current state, counted from the events of the (non-debug) commands (see rules/stats).
 */
export interface PlayerStats {
  /** Round in which each age was reached. */
  readonly ageRounds: Readonly<Partial<Record<Age, number>>>;
  /** Tiles taken by capturing or attacking. */
  readonly tilesCaptured: number;
  /** Units of other players killed by taking their tiles. */
  readonly unitsKilled: number;
  /** Own units lost: tiles taken, rebellion, elimination. */
  readonly unitsLost: number;
  /** Sum of all turn-start incomes. */
  readonly income: Resources;
  readonly unitsBought: number;
  readonly buildingsBuilt: number;
  readonly structuresBuilt: number;
  /** Most tiles owned at once, and the first round that happened in. */
  readonly peakTiles: number;
  readonly peakRound: number;
}

/** The three resources (GDD 4.1). */
export interface Resources {
  readonly gold: number;
  readonly food: number;
  readonly materials: number;
}

export const RESOURCE_KINDS = [
  'gold',
  'food',
  'materials',
] as const satisfies readonly (keyof Resources)[];

export function emptyResources(): Resources {
  return { gold: 0, food: 0, materials: 0 };
}

export function addResources(a: Resources, b: Resources): Resources {
  return { gold: a.gold + b.gold, food: a.food + b.food, materials: a.materials + b.materials };
}

/** `amount` of one resource, nothing of the others. */
export function resourceAmount(kind: keyof Resources, amount: number): Resources {
  return { ...emptyResources(), [kind]: amount };
}

/**
 * Region center (GDD 4.2): the capital or a local center. It sits on a tile of its region
 * and holds the region's treasury. Its owner is the owner of that tile.
 */
export type CenterKind = 'capital' | 'local';

export interface Center {
  readonly kind: CenterKind;
  readonly treasury: Resources;
}

/**
 * Unit lines (GDD 6.1): infantry, archers, cavalry, siege (v0.1: the battering ram only)
 * and the worker. Ships follow in v0.2.
 */
export type UnitLine = 'infantry' | 'archer' | 'cavalry' | 'siege' | 'worker';

export const UNIT_LINES: readonly UnitLine[] = ['infantry', 'archer', 'cavalry', 'siege', 'worker'];

/**
 * A unit stands on a tile; its owner is the owner of that tile. At most one unit per tile
 * (units on the same tile merge).
 */
export interface Unit {
  readonly line: UnitLine;
  /** 1-4 for fighting lines, 0 for the worker. Combat strength = level (GDD 7.1). */
  readonly level: number;
  /**
   * Done for this turn: it captured, attacked or merged, so it cannot move again until its
   * owner's next turn. Moving within its own territory does not exhaust a unit.
   */
  readonly exhausted: boolean;
  /**
   * Starving (GDD 4.5): its region could not pay the food upkeep at its owner's last turn
   * start. Fights at −1 strength; if the region is short again next time, it may rebel.
   */
  readonly hungry: boolean;
  /**
   * Under an archer volley (GDD 7.3): −1 strength until the end of the current turn. Only
   * units of players other than the one on turn can be suppressed.
   */
  readonly suppressed: boolean;
}

/** Buildings (GDD 5.1, 5.2); centers are separate (see Center). */
export type BuildingKind =
  | 'farm'
  | 'lumberCamp'
  | 'quarry'
  | 'goldMine'
  | 'barracks'
  | 'archeryRange'
  | 'stable'
  | 'workshop'
  | 'tower';

export const BUILDING_KINDS: readonly BuildingKind[] = [
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

/**
 * A building stands on a tile; its owner is the owner of that tile, so a captured building
 * changes hands with its tile. At most one building per tile; it may share the tile with a
 * unit, and with a center founded there later (buildings are never built on centers).
 */
export interface Building {
  readonly kind: BuildingKind;
  /**
   * Its gold upkeep was not paid at its owner's last turn start (GDD 4.5): until the next
   * one it produces nothing, unlocks no units and protects nothing.
   */
  readonly idle: boolean;
}

/** Edge structures (GDD 3.2, 5.3), built by workers on hex edges. */
export type StructureKind = 'fence' | 'wall' | 'gate' | 'bridge';

export const STRUCTURE_KINDS: readonly StructureKind[] = ['fence', 'wall', 'gate', 'bridge'];

/**
 * A structure on the edge between two tiles. It belongs to its builder until both sides of
 * the edge pass to one other player, who then takes it over (GDD 5.3, decision 30).
 */
export interface EdgeStructure {
  readonly kind: StructureKind;
  readonly owner: PlayerId;
  /** Siege hits taken so far; it falls at STRUCTURES[kind].hits (GDD 7.4). */
  readonly damage: number;
}

export interface GameState {
  readonly map: GameMap;
  /** 1-based round; a round is one turn of every player. */
  readonly round: number;
  readonly currentPlayer: PlayerId;
  readonly players: readonly Player[];
  /** Owner of every tile (indexed like `map.tiles`), or null for neutral tiles. */
  readonly owners: readonly (PlayerId | null)[];
  /**
   * Region centers by tile index. Invariants (restored after every ownership change):
   * each region of 2+ tiles has exactly one center; a 1-tile region has none unless it is
   * the capital's; every player has at most one capital.
   */
  readonly centers: Readonly<Partial<Record<number, Center>>>;
  /** Units by tile index. Invariant: units only stand on owned tiles. */
  readonly units: Readonly<Partial<Record<number, Unit>>>;
  /** Buildings by tile index. Invariant: buildings only stand on owned tiles. */
  readonly buildings: Readonly<Partial<Record<number, Building>>>;
  /**
   * Edge structures by edge key (the map's natural edges — rivers, fords — stay in
   * `map.edges`). Invariants: both tiles of the edge are ownable land; a bridge stands on a
   * river, the others never do; if both tiles have one owner, the structure is theirs.
   */
  readonly edgeStructures: Readonly<Partial<Record<EdgeKey, EdgeStructure>>>;
  /** Match statistics, indexed like `players`. */
  readonly stats: readonly PlayerStats[];
  /** State of the seeded RNG for in-game randomness. */
  readonly rng: RngState;
}

/** Tiles that hold a center, ascending. */
export function centerTiles(state: Pick<GameState, 'centers'>): number[] {
  return Object.keys(state.centers)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Tiles that hold a unit, ascending. */
export function unitTiles(state: Pick<GameState, 'units'>): number[] {
  return Object.keys(state.units)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Edges that hold a structure, in key order. */
export function structureEdges(state: Pick<GameState, 'edgeStructures'>): EdgeKey[] {
  return (Object.keys(state.edgeStructures) as EdgeKey[]).sort();
}

/** Tiles that hold a building, ascending. */
export function buildingTiles(state: Pick<GameState, 'buildings'>): number[] {
  return Object.keys(state.buildings)
    .map(Number)
    .sort((a, b) => a - b);
}

/** The capital tile of a player, if any. */
export function capitalOf(
  state: Pick<GameState, 'centers' | 'owners'>,
  player: PlayerId,
): number | undefined {
  return centerTiles(state).find(
    (tile) => state.centers[tile]?.kind === 'capital' && state.owners[tile] === player,
  );
}

export function isEliminated(state: Pick<GameState, 'players'>, player: PlayerId): boolean {
  return (state.players[player]?.eliminated ?? null) !== null;
}

/** Players still in the game, in turn order. */
export function activePlayers(state: Pick<GameState, 'players'>): PlayerId[] {
  return state.players.filter((p) => p.eliminated === null).map((p) => p.id);
}

/** The last player standing (GDD 11), or null while two or more remain. */
export function winnerOf(state: Pick<GameState, 'players'>): PlayerId | null {
  const active = activePlayers(state);
  return active.length === 1 ? (active[0] ?? null) : null;
}

export function isGameOver(state: Pick<GameState, 'players'>): boolean {
  return winnerOf(state) !== null;
}

/** Statistics of a player at the start of a game. */
export function emptyStats(startAge: Age, round: number): PlayerStats {
  return {
    ageRounds: { [startAge]: round },
    tilesCaptured: 0,
    unitsKilled: 0,
    unitsLost: 0,
    income: emptyResources(),
    unitsBought: 0,
    buildingsBuilt: 0,
    structuresBuilt: 0,
    peakTiles: 0,
    peakRound: round,
  };
}
