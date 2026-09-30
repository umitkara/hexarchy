import type { Age, CenterKind, PlayerId, Resources, Unit, UnitLine } from '../state/game';

/**
 * What happened while applying a command, in order. The client animates and reports
 * these; they carry no information that is not also in the resulting state.
 */
export type GameEvent =
  | { readonly type: 'turnEnded'; readonly player: PlayerId }
  | { readonly type: 'turnStarted'; readonly player: PlayerId; readonly round: number }
  /** Turn-start income paid into a region's treasury. */
  | {
      readonly type: 'income';
      readonly player: PlayerId;
      readonly center: number;
      readonly gold: number;
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
  /**
   * A unit died: its tile was taken (`captured`), its region could not pay the upkeep
   * (`bankrupt`), or it stood in a region without a treasury (`noTreasury`).
   */
  | {
      readonly type: 'unitKilled';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly unit: Unit;
      readonly reason: 'captured' | 'bankrupt' | 'noTreasury';
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
   * A region could not pay its upkeep: its treasury (`lost`) dropped to 0 and all its
   * units die (the `unitKilled` events follow).
   */
  | {
      readonly type: 'bankrupt';
      readonly player: PlayerId;
      readonly center: number;
      readonly resource: keyof Resources;
      readonly owed: number;
      readonly lost: number;
    }
  | { readonly type: 'ageChanged'; readonly player: PlayerId; readonly age: Age };

export type GameEventType = GameEvent['type'];
