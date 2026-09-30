import type { GameEvent } from '../rules/events';
import type { GameState, PlayerId } from '../state/game';

/**
 * Commands are the only way to change the game state. They are issued by the current
 * player (UI or AI alike); debug commands bypass the rules and exist for testing.
 */
export type Command = EndTurnCommand | DebugPaintCommand;

/** Ends the current player's turn (GDD 2). */
export interface EndTurnCommand {
  readonly type: 'endTurn';
}

/** Debug: sets a tile's owner (null = neutral), triggering splits and merges. */
export interface DebugPaintCommand {
  readonly type: 'debugPaint';
  readonly tile: number;
  readonly owner: PlayerId | null;
}

export type CommandType = Command['type'];

/** Why a command is not allowed. The client maps these to messages. */
export type CommandError =
  /** The tile index does not exist. */
  | 'unknownTile'
  /** The player id does not exist. */
  | 'unknownPlayer'
  /** Water and mountains cannot be owned. */
  | 'notOwnable'
  /** Capitals cannot change hands until capital conquest (M6). */
  | 'capitalLocked'
  /** The command would not change anything. */
  | 'noChange';

export type Validation =
  { readonly ok: true } | { readonly ok: false; readonly error: CommandError };

export interface CommandResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
