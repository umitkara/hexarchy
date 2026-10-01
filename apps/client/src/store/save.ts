import {
  applyToHistory,
  startHistory,
  validate,
  type Command,
  type GameState,
  type TurnHistory,
} from '@hexarchy/engine';

/**
 * Save and continue (localStorage). The game state is plain JSON, so a save is the state at
 * the start of the current turn plus the commands played since: replaying them rebuilds the
 * in-turn undo history too, and keeps the save small (one state instead of one per move).
 * Only the client touches storage; the engine stays pure.
 */

const SAVE_KEY = 'hexarchy.save';
const SETTINGS_KEY = 'hexarchy.settings';
/** Bump when the save format changes; older saves are dropped. */
const SAVE_VERSION = 1;

export interface SavedGame {
  readonly history: TurnHistory;
  /** Commands of the current turn, in order (replayed onto `history.past[0]`). */
  readonly commands: readonly Command[];
  readonly hotseat: boolean;
}

interface SaveFile {
  readonly version: number;
  readonly turnStart: GameState;
  readonly commands: readonly Command[];
  readonly hotseat: boolean;
}

/** Player settings kept between games. */
export interface Settings {
  /** AI opponents of the last new game (1-3). */
  readonly ais: number;
  readonly muted: boolean;
}

const DEFAULT_SETTINGS: Settings = { ais: 3, muted: false };

function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the game goes on unsaved.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A light shape check: enough to tell a game state from garbage or an old format. */
function looksLikeGame(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    isRecord(value.map) &&
    Array.isArray(value.players) &&
    Array.isArray(value.owners) &&
    Array.isArray(value.stats) &&
    typeof value.round === 'number' &&
    typeof value.currentPlayer === 'number'
  );
}

/**
 * Replays the turn's commands onto its start state. A command that no longer validates
 * (a save from an older rules version) ends the replay there.
 */
function replay(turnStart: GameState, commands: readonly Command[]): SavedGame['history'] {
  let history = startHistory(turnStart);
  for (const command of commands) {
    if (!validate(history.present, command).ok) break;
    history = applyToHistory(history, command).history;
  }
  return history;
}

export function loadGame(): SavedGame | null {
  const file = read(SAVE_KEY);
  if (!isRecord(file) || file.version !== SAVE_VERSION || !looksLikeGame(file.turnStart)) {
    return null;
  }
  const commands = Array.isArray(file.commands) ? (file.commands as Command[]) : [];
  try {
    const history = replay(file.turnStart, commands);
    return {
      history,
      commands: commands.slice(0, history.past.length),
      hotseat: file.hotseat === true,
    };
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame): void {
  const file: SaveFile = {
    version: SAVE_VERSION,
    turnStart: game.history.past[0] ?? game.history.present,
    commands: game.commands,
    hotseat: game.hotseat,
  };
  write(SAVE_KEY, file);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function loadSettings(): Settings {
  const stored = read(SETTINGS_KEY);
  if (!isRecord(stored)) return DEFAULT_SETTINGS;
  const ais = typeof stored.ais === 'number' ? Math.round(stored.ais) : DEFAULT_SETTINGS.ais;
  return {
    ais: Math.min(3, Math.max(1, ais)),
    muted: stored.muted === true,
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}
