import type { GameEvent } from '../rules/events';
import type { Age, BuildingKind, GameState, PlayerId, UnitLine } from '../state/game';

/**
 * Commands are the only way to change the game state. They are issued by the current
 * player (UI or AI alike); debug commands bypass the rules and exist for testing.
 */
export type Command =
  | EndTurnCommand
  | BuyUnitCommand
  | MoveUnitCommand
  | BuildCommand
  | DebugPaintCommand
  | DebugSetAgeCommand;

/** Ends the current player's turn (GDD 2). */
export interface EndTurnCommand {
  readonly type: 'endTurn';
}

/**
 * Buys a unit from the treasury of the region whose center is on `center` and places it
 * on `tile`: inside that region (empty tile or merge) or one step outside (GDD 4.2, 13).
 */
export interface BuyUnitCommand {
  readonly type: 'buyUnit';
  readonly line: UnitLine;
  readonly center: number;
  readonly tile: number;
}

/** Moves the unit on `from` to `to`: move, merge, capture or attack (GDD 6.4, 7). */
export interface MoveUnitCommand {
  readonly type: 'moveUnit';
  readonly from: number;
  readonly to: number;
}

/**
 * Builds a building on `tile`, paid in materials from the treasury of the region whose
 * center is on `center`; the tile must be in that region (GDD 5).
 */
export interface BuildCommand {
  readonly type: 'build';
  readonly building: BuildingKind;
  readonly center: number;
  readonly tile: number;
}

/** Debug: sets a tile's owner (null = neutral), triggering splits and merges. */
export interface DebugPaintCommand {
  readonly type: 'debugPaint';
  readonly tile: number;
  readonly owner: PlayerId | null;
}

/** Debug: sets a player's age (level lock tests until advancing arrives in M6). */
export interface DebugSetAgeCommand {
  readonly type: 'debugSetAge';
  readonly player: PlayerId;
  readonly age: Age;
}

export type CommandType = Command['type'];

/** Why a command is not allowed. The client maps these to messages. */
export type CommandError =
  /** The tile index does not exist. */
  | 'unknownTile'
  /** The player id does not exist. */
  | 'unknownPlayer'
  /** The unit line, building kind or age does not exist. */
  | 'unknownUnit'
  | 'unknownBuilding'
  | 'unknownAge'
  /** Water and mountains cannot be owned. */
  | 'notOwnable'
  /** Capitals cannot change hands until capital conquest (M6). */
  | 'capitalLocked'
  /** The command would not change anything. */
  | 'noChange'
  /** No unit on the tile. */
  | 'noUnit'
  /** The unit belongs to another player. */
  | 'notYourUnit'
  /** The unit captured, attacked or merged this turn. */
  | 'exhausted'
  /** No center on the tile: only regions with a treasury can buy. */
  | 'noTreasury'
  /** The treasury belongs to another player. */
  | 'notYourRegion'
  | 'notEnoughGold'
  | 'notEnoughMaterials'
  /** The line needs an active building in the paying region (infantry: barracks). */
  | 'needsBuilding'
  /** The player's age has not unlocked the building yet. */
  | 'ageLocked'
  /** A building goes only on a tile of the paying region. */
  | 'outsideRegion'
  /** The tile already holds a building or a center. */
  | 'tileOccupied'
  /** The building cannot stand on this terrain. */
  | 'wrongTerrain'
  /** A gold mine needs a hill with an ore vein. */
  | 'needsVein'
  /** A lumber camp needs a forest next to it. */
  | 'needsForest'
  /** The target is neither in the unit's area nor one step outside it. */
  | 'unreachable'
  /** The target is next to the unit's area only across a river. */
  | 'edgeBlocked'
  /** Workers cannot capture or attack. */
  | 'cannotCapture'
  /** The target is protected by something at least as strong as the unit. */
  | 'protected'
  /** Only units of the same (mergeable) line merge. */
  | 'cannotMerge'
  /** The merged level would exceed the player's level cap. */
  | 'levelCap';

export type Validation =
  { readonly ok: true } | { readonly ok: false; readonly error: CommandError };

export interface CommandResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
