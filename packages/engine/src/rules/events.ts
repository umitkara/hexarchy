import type { CenterKind, PlayerId, Resources } from '../state/game';

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
    };

export type GameEventType = GameEvent['type'];
