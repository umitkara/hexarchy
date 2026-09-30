import {
  applyToHistory,
  canUndo,
  createGame,
  normalizeSeed,
  startHistory,
  undo,
  undoTurn,
  validate,
  type Command,
  type CommandError,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Point,
  type TurnHistory,
  type UnitSource,
} from '@hexarchy/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** A unit being dragged: from the map or from the recruit panel. */
export interface UnitDrag {
  readonly source: UnitSource;
  /** Pointer position relative to the canvas, or null while it is off the canvas. */
  readonly screen: Point | null;
  /** Tile under the pointer (the drop target), or null. */
  readonly tile: number | null;
}

/**
 * Bridge between the engine, the Pixi scene and the React HUD. It holds the game (with the
 * in-turn undo history) and UI state (hover, selection, the unit being placed, debug
 * paint). Every game change goes through `dispatch`, i.e. the engine's validate/apply.
 * Pixi subscribes imperatively, React via `useGameStore`.
 */
export interface GameStoreState {
  readonly history: TurnHistory;
  /** Current game state (`history.present`). */
  readonly game: GameState;
  /** Tile under the mouse, the drag target, or the last tapped tile on touch screens. */
  readonly hoveredTile: number | null;
  /** Tapped tile whose region the treasury panel shows. */
  readonly selectedTile: number | null;
  /** Unit picked up by a tap (map unit or recruit button): the next tap places it. */
  readonly armed: UnitSource | null;
  readonly drag: UnitDrag | null;
  /** Hotseat debug mode: humans play every player. Off: AI players just pass (M7 adds AI). */
  readonly hotseat: boolean;
  /** Debug paint mode: taps set the tile owner to `paintOwner` (null = neutral). */
  readonly painting: boolean;
  readonly paintOwner: PlayerId | null;
  /** Events of the last applied command, for the debug log. */
  readonly lastEvents: readonly GameEvent[];
  /** Why the last command was refused; cleared by the next successful one. */
  readonly lastError: { readonly error: CommandError; readonly id: number } | null;
  readonly newGame: (seed: number) => void;
  /** Validates and applies a command; returns whether it was applied. */
  readonly dispatch: (command: Command) => boolean;
  readonly undo: () => void;
  readonly undoTurn: () => void;
  readonly setHoveredTile: (tile: number | null) => void;
  /** A tap on the map (null = off the map): paints, places the armed unit, or selects. */
  readonly tapTile: (tile: number | null) => void;
  readonly selectTile: (tile: number | null) => void;
  readonly arm: (source: UnitSource | null) => void;
  readonly startDrag: (source: UnitSource) => void;
  readonly updateDrag: (screen: Point | null, tile: number | null) => void;
  /** Drops the dragged unit on `tile` (null = cancel). */
  readonly endDrag: (tile: number | null) => void;
  readonly setHotseat: (hotseat: boolean) => void;
  readonly setPainting: (painting: boolean) => void;
  readonly setPaintOwner: (owner: PlayerId | null) => void;
}

const SEED_PARAM = 'seed';

/** A short random seed (easy to read and type back). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

function initialSeed(): number {
  const param = new URLSearchParams(window.location.search).get(SEED_PARAM);
  const seed = param === null ? NaN : Number(param);
  return Number.isFinite(seed) ? normalizeSeed(seed) : randomSeed();
}

/** Keeps `?seed=` in the address bar so a game can be reloaded or shared. */
function writeSeedToUrl(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(SEED_PARAM, String(seed));
  window.history.replaceState(null, '', url);
}

/** True if the human at the screen may act for the player on turn. */
export function canControl(state: Pick<GameStoreState, 'game' | 'hotseat'>): boolean {
  const { game, hotseat } = state;
  return hotseat || game.players[game.currentPlayer]?.controller === 'human';
}

/** The command that puts a source's unit on `tile`. */
export function placeCommand(source: UnitSource, tile: number): Command {
  return source.kind === 'unit'
    ? { type: 'moveUnit', from: source.from, to: tile }
    : { type: 'buyUnit', line: source.line, center: source.center, tile };
}

/** True if tapping `tile` should pick up the unit standing there. */
function isMovableUnit(game: GameState, tile: number): boolean {
  const unit = game.units[tile];
  return unit !== undefined && !unit.exhausted && game.owners[tile] === game.currentPlayer;
}

let errorId = 0;

const initialGame = createGame({ seed: initialSeed() });

export const gameStore = createStore<GameStoreState>()((set, get) => {
  /** Applies a command to the history; without hotseat, AI players pass their turns. */
  const commit = (history: TurnHistory, command: Command) => {
    let result = applyToHistory(history, command);
    const events = [...result.events];
    const { hotseat } = get();
    for (let i = 0; !hotseat && i < result.history.present.players.length; i++) {
      const { present } = result.history;
      if (present.players[present.currentPlayer]?.controller !== 'ai') break;
      result = applyToHistory(result.history, { type: 'endTurn' });
      events.push(...result.events);
    }
    return { history: result.history, events };
  };

  const setHistory = (history: TurnHistory, extra: Partial<GameStoreState> = {}) => {
    set({ history, game: history.present, armed: null, drag: null, ...extra });
  };

  return {
    history: startHistory(initialGame),
    game: initialGame,
    hoveredTile: null,
    selectedTile: null,
    armed: null,
    drag: null,
    hotseat: true,
    painting: false,
    paintOwner: 0,
    lastEvents: [],
    lastError: null,

    newGame(seed) {
      const game = createGame({ seed });
      writeSeedToUrl(game.map.seed);
      setHistory(startHistory(game), { selectedTile: null, lastEvents: [], lastError: null });
    },

    dispatch(command) {
      const state = get();
      const validation = validate(state.game, command);
      if (!validation.ok) {
        set({ lastError: { error: validation.error, id: ++errorId } });
        return false;
      }
      const { history, events } = commit(state.history, command);
      setHistory(history, { lastEvents: events, lastError: null });
      return true;
    },

    undo() {
      const { history } = get();
      if (canUndo(history)) setHistory(undo(history), { lastEvents: [], lastError: null });
    },

    undoTurn() {
      const { history } = get();
      if (canUndo(history)) setHistory(undoTurn(history), { lastEvents: [], lastError: null });
    },

    setHoveredTile(tile) {
      if (get().hoveredTile !== tile) set({ hoveredTile: tile });
    },

    tapTile(tile) {
      const state = get();
      const { painting, paintOwner, armed, game, dispatch } = state;
      if (tile === null) {
        set({ selectedTile: null, armed: null });
        return;
      }
      if (painting) {
        const painted = dispatch({ type: 'debugPaint', tile, owner: paintOwner });
        // Follow the painted region in the treasury panel.
        if (painted && paintOwner !== null) set({ selectedTile: tile });
        return;
      }
      if (armed) {
        if (armed.kind === 'unit' && armed.from === tile) {
          set({ armed: null });
          return;
        }
        const command = placeCommand(armed, tile);
        if (validate(game, command).ok || !isMovableUnit(game, tile)) {
          if (dispatch(command)) set({ selectedTile: tile });
          else set({ armed: null });
          return;
        }
      }
      const movable = canControl(state) && isMovableUnit(game, tile);
      set({ selectedTile: tile, armed: movable ? { kind: 'unit', from: tile } : null });
    },

    selectTile(tile) {
      set({ selectedTile: tile, armed: null });
    },

    arm(source) {
      set({ armed: source });
    },

    startDrag(source) {
      set({ drag: { source, screen: null, tile: null }, armed: null });
    },

    updateDrag(screen, tile) {
      const { drag } = get();
      if (drag) set({ drag: { ...drag, screen, tile }, hoveredTile: tile });
    },

    endDrag(tile) {
      const { drag, dispatch } = get();
      if (!drag) return;
      set({ drag: null });
      if (tile === null) return;
      if (drag.source.kind === 'unit' && drag.source.from === tile) return;
      if (dispatch(placeCommand(drag.source, tile))) set({ selectedTile: tile });
    },

    setHotseat(hotseat) {
      set({ hotseat });
    },

    setPainting(painting) {
      set({ painting, armed: null });
    },

    setPaintOwner(owner) {
      set({ paintOwner: owner, painting: true, armed: null });
    },
  };
});

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
