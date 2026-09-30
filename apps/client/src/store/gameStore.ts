import {
  applyToHistory,
  canUndo,
  createGame,
  normalizeSeed,
  startHistory,
  undo,
  undoTurn,
  validate,
  type BreachSource,
  type BuildSource,
  type Command,
  type CommandError,
  type EdgeBuildSource,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Point,
  type TurnHistory,
  type UnitSource,
  type VolleySource,
} from '@hexarchy/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * What the player holds to use on the map: a unit (moved or recruited), a building, or a
 * unit action — a worker's edge structure, a strike on a structure, an archer volley.
 */
export type HandSource = UnitSource | BuildSource | EdgeBuildSource | BreachSource | VolleySource;

/** A unit action aimed at one of the six edges of the unit's tile (target = the tile across). */
export type EdgeSource = EdgeBuildSource | BreachSource;

export function isEdgeSource(source: HandSource | null): source is EdgeSource {
  return source?.kind === 'edge' || source?.kind === 'breach';
}

/** The tile of the unit that acts, for unit actions (undefined otherwise). */
export function actingTile(source: HandSource): number | undefined {
  return source.kind === 'unit' ||
    source.kind === 'edge' ||
    source.kind === 'breach' ||
    source.kind === 'volley'
    ? source.from
    : undefined;
}

/** A unit or building being dragged: from the map or from the treasury panel. */
export interface HandDrag {
  readonly source: HandSource;
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
  /** Picked up by a tap (map unit, recruit or build button): the next tap places it. */
  readonly armed: HandSource | null;
  readonly drag: HandDrag | null;
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
  readonly arm: (source: HandSource | null) => void;
  readonly startDrag: (source: HandSource) => void;
  readonly updateDrag: (screen: Point | null, tile: number | null) => void;
  /** Drops what is dragged on `tile` (null = cancel). */
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

/** The command that puts a source's unit or building on `tile`. */
export function placeCommand(source: HandSource, tile: number): Command {
  switch (source.kind) {
    case 'unit':
      return { type: 'moveUnit', from: source.from, to: tile };
    case 'recruit':
      return { type: 'buyUnit', line: source.line, center: source.center, tile };
    case 'build':
      return { type: 'build', building: source.building, center: source.center, tile };
    case 'edge':
      return { type: 'buildEdge', structure: source.structure, worker: source.from, to: tile };
    case 'breach':
      return { type: 'breachEdge', from: source.from, to: tile };
    case 'volley':
      return { type: 'archerVolley', from: source.from, target: tile };
  }
}

/** The tile to select after using a source on `tile`: the target, or the acting unit's. */
function afterUse(source: HandSource, tile: number): number {
  return source.kind === 'unit' ? tile : (actingTile(source) ?? tile);
}

/** True if two sources pick up the same thing (a second click on a button drops it). */
export function sameSource(a: HandSource | null, b: HandSource): boolean {
  if (a?.kind !== b.kind) return false;
  switch (b.kind) {
    case 'unit':
      return a.kind === 'unit' && a.from === b.from;
    case 'recruit':
      return a.kind === 'recruit' && a.line === b.line && a.center === b.center;
    case 'build':
      return a.kind === 'build' && a.building === b.building && a.center === b.center;
    case 'edge':
      return a.kind === 'edge' && a.structure === b.structure && a.from === b.from;
    case 'breach':
      return a.kind === 'breach' && a.from === b.from;
    case 'volley':
      return a.kind === 'volley' && a.from === b.from;
  }
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
        // A tap on the acting unit itself puts it down.
        if (actingTile(armed) === tile) {
          set({ armed: null, selectedTile: tile });
          return;
        }
        const command = placeCommand(armed, tile);
        if (validate(game, command).ok || !isMovableUnit(game, tile)) {
          if (dispatch(command)) set({ selectedTile: afterUse(armed, tile) });
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
      if (actingTile(drag.source) === tile) return;
      if (dispatch(placeCommand(drag.source, tile))) {
        set({ selectedTile: afterUse(drag.source, tile) });
      }
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
