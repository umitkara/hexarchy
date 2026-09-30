import type { RngState } from '../rng';
import type { GameMap } from './map';

/**
 * The whole game state: plain, serializable JSON (no classes, no Maps, no typed arrays).
 * Changed only by commands (see commands/). Derived data — regions, income, later the
 * movement and protection maps — is computed from it, never stored.
 */

/** Player index into `GameState.players`; also the turn order. */
export type PlayerId = number;

export type Controller = 'human' | 'ai';

export interface Player {
  readonly id: PlayerId;
  readonly controller: Controller;
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

/**
 * Region center (GDD 4.2): the capital or a local center. It sits on a tile of its region
 * and holds the region's treasury. Its owner is the owner of that tile.
 */
export type CenterKind = 'capital' | 'local';

export interface Center {
  readonly kind: CenterKind;
  readonly treasury: Resources;
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
  /** State of the seeded RNG for in-game randomness. */
  readonly rng: RngState;
}

/** Tiles that hold a center, ascending. */
export function centerTiles(state: Pick<GameState, 'centers'>): number[] {
  return Object.keys(state.centers)
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
