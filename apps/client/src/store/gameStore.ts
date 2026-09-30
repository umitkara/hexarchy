import {
  apply,
  createGame,
  normalizeSeed,
  validate,
  type Command,
  type CommandError,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@hexarchy/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Bridge between the engine, the Pixi scene and the React HUD. It holds the game state and
 * UI state (hover, selection, debug paint). Every game change goes through `dispatch`,
 * i.e. the engine's validate/apply. Pixi subscribes imperatively, React via `useGameStore`.
 */
export interface GameStoreState {
  readonly game: GameState;
  /** Tile under the mouse, or the last tapped tile on touch screens. */
  readonly hoveredTile: number | null;
  /** Tapped tile whose region the treasury panel shows. */
  readonly selectedTile: number | null;
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
  readonly setHoveredTile: (tile: number | null) => void;
  /** A tap on the map (null = off the map): paints in paint mode, else selects. */
  readonly tapTile: (tile: number | null) => void;
  readonly selectTile: (tile: number | null) => void;
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

let errorId = 0;

export const gameStore = createStore<GameStoreState>()((set, get) => ({
  game: createGame({ seed: initialSeed() }),
  hoveredTile: null,
  selectedTile: null,
  painting: false,
  paintOwner: 0,
  lastEvents: [],
  lastError: null,

  newGame(seed) {
    const game = createGame({ seed });
    writeSeedToUrl(game.map.seed);
    set({ game, selectedTile: null, lastEvents: [], lastError: null });
  },

  dispatch(command) {
    const { game } = get();
    const validation = validate(game, command);
    if (!validation.ok) {
      set({ lastError: { error: validation.error, id: ++errorId } });
      return false;
    }
    const result = apply(game, command);
    set({ game: result.state, lastEvents: result.events, lastError: null });
    return true;
  },

  setHoveredTile(tile) {
    if (get().hoveredTile !== tile) set({ hoveredTile: tile });
  },

  tapTile(tile) {
    const { painting, paintOwner, dispatch } = get();
    if (!painting || tile === null) {
      set({ selectedTile: tile });
      return;
    }
    const painted = dispatch({ type: 'debugPaint', tile, owner: paintOwner });
    // Follow the painted region in the treasury panel.
    if (painted && paintOwner !== null) set({ selectedTile: tile });
  },

  selectTile(tile) {
    set({ selectedTile: tile });
  },

  setPainting(painting) {
    set({ painting });
  },

  setPaintOwner(owner) {
    set({ paintOwner: owner, painting: true });
  },
}));

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
