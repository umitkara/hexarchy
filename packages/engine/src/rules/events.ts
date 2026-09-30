import type {
  Age,
  BuildingKind,
  CenterKind,
  PlayerId,
  Resources,
  Unit,
  UnitLine,
} from '../state/game';

/**
 * What happened while applying a command, in order. The client animates and reports
 * these; they carry no information that is not also in the resulting state.
 */
export type GameEvent =
  | { readonly type: 'turnEnded'; readonly player: PlayerId }
  | { readonly type: 'turnStarted'; readonly player: PlayerId; readonly round: number }
  /**
   * Turn-start income paid into a region's treasury: tile gold plus the output of its
   * working buildings (GDD 3.1, 4.3).
   */
  | {
      readonly type: 'income';
      readonly player: PlayerId;
      readonly center: number;
      readonly income: Resources;
    }
  /** Turn-start gold upkeep of a region's buildings (GDD 4.4). */
  | {
      readonly type: 'buildingUpkeepPaid';
      readonly player: PlayerId;
      readonly center: number;
      readonly amount: number;
    }
  /**
   * Gold shortfall (GDD 4.5): these buildings' upkeep could not be paid, so they idle until
   * the next turn start. `center` is null for a region without a treasury.
   */
  | {
      readonly type: 'buildingsIdle';
      readonly player: PlayerId;
      readonly center: number | null;
      readonly tiles: readonly number[];
    }
  | {
      readonly type: 'tileOwnerChanged';
      readonly tile: number;
      readonly from: PlayerId | null;
      readonly to: PlayerId | null;
    }
  /** A region of 2+ tiles without a center got an automatic local center (empty treasury). */
  | { readonly type: 'centerFounded'; readonly tile: number; readonly owner: PlayerId }
  /**
   * A center disappeared with its treasury: its tile was taken (`captured`) or its
   * region shrank to that single tile (`isolated`).
   */
  | {
      readonly type: 'centerRemoved';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly kind: CenterKind;
      readonly reason: 'captured' | 'isolated';
      readonly lost: Resources;
    }
  /** Regions merged: the absorbed centers' treasuries were added to the surviving one. */
  | {
      readonly type: 'treasuriesMerged';
      readonly owner: PlayerId;
      readonly center: number;
      readonly absorbed: readonly number[];
      readonly treasury: Resources;
    }
  /** A unit was bought from a region's treasury and placed on `tile`. */
  | {
      readonly type: 'unitBought';
      readonly player: PlayerId;
      readonly center: number;
      readonly tile: number;
      readonly line: UnitLine;
      readonly cost: number;
    }
  | {
      readonly type: 'unitMoved';
      readonly player: PlayerId;
      readonly from: number;
      readonly to: number;
    }
  /** Two units merged on `tile` into `unit` (GDD 6.2). */
  | {
      readonly type: 'unitsMerged';
      readonly player: PlayerId;
      readonly tile: number;
      readonly unit: Unit;
    }
  /** A unit died: its tile was taken (`captured`) or it starved into rebellion. */
  | {
      readonly type: 'unitKilled';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly unit: Unit;
      readonly reason: 'captured' | 'rebellion';
    }
  /** Turn-start unit upkeep paid from a region's treasury. */
  | {
      readonly type: 'upkeepPaid';
      readonly player: PlayerId;
      readonly center: number;
      readonly resource: keyof Resources;
      readonly amount: number;
    }
  /**
   * Food shortfall (GDD 4.5): the region could not feed its units. Its food (`lost`) drops
   * to 0 and the units on `tiles` go hungry. `center` is null without a treasury.
   */
  | {
      readonly type: 'starvation';
      readonly player: PlayerId;
      readonly center: number | null;
      readonly owed: number;
      readonly lost: number;
      readonly tiles: readonly number[];
    }
  /**
   * Food shortfall while already hungry (GDD 4.5): the units on `tiles` rebel and die,
   * highest upkeep first, until the rest can be fed (`unitKilled` events follow).
   */
  | {
      readonly type: 'rebellion';
      readonly player: PlayerId;
      readonly center: number | null;
      readonly owed: number;
      readonly tiles: readonly number[];
    }
  /** A building was bought with materials from a region's treasury. */
  | {
      readonly type: 'buildingBuilt';
      readonly player: PlayerId;
      readonly center: number;
      readonly tile: number;
      readonly building: BuildingKind;
      readonly cost: number;
    }
  /** A building changed hands with its tile. */
  | {
      readonly type: 'buildingCaptured';
      readonly tile: number;
      readonly building: BuildingKind;
      readonly from: PlayerId;
      readonly to: PlayerId;
    }
  /** A building was lost because its tile became neutral. */
  | {
      readonly type: 'buildingDestroyed';
      readonly tile: number;
      readonly building: BuildingKind;
      readonly owner: PlayerId;
    }
  /** Forest spread onto these plains tiles of `player` at their turn start (GDD 4.6). */
  | { readonly type: 'forestSpread'; readonly player: PlayerId; readonly tiles: readonly number[] }
  | { readonly type: 'ageChanged'; readonly player: PlayerId; readonly age: Age };

export type GameEventType = GameEvent['type'];
