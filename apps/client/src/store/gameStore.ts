import {
  aiStep,
  applyToHistory,
  canUndo,
  capitalOf,
  createGame,
  isGameOver,
  normalizeSeed,
  startHistory,
  undo,
  undoTurn,
  validate,
  type AiTurn,
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
import { loadGame, loadSettings, saveSettings, type Settings } from './save';

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
  /** Commands of the current turn, in order (a save replays them; undo pops them). */
  readonly commands: readonly Command[];
  /**
   * The game was started or continued from the menu. Before that the map behind the menu
   * is only a preview: it is not saved and the menu cannot be closed.
   */
  readonly started: boolean;
  /** The main menu (continue, new game, encyclopedia, sound) is open; the AI waits. */
  readonly menuOpen: boolean;
  /** The encyclopedia is open (over the map or the menu); the AI waits. */
  readonly helpOpen: boolean;
  readonly settings: Settings;
  /** The events of the latest command, for animations and sounds. */
  readonly feed: EventFeed | null;
  /** Current game state (`history.present`). */
  readonly game: GameState;
  /** Tile under the mouse, the drag target, or the last tapped tile on touch screens. */
  readonly hoveredTile: number | null;
  /** Tapped tile whose region the treasury panel shows. */
  readonly selectedTile: number | null;
  /** Picked up by a tap (map unit, recruit or build button): the next tap places it. */
  readonly armed: HandSource | null;
  readonly drag: HandDrag | null;
  /** Hotseat debug mode: humans play every player. Off: the AI plays its players. */
  readonly hotseat: boolean;
  /** Counters of the AI turn being played (engine `aiStep`), null between AI turns. */
  readonly aiTurn: AiTurn | null;
  /** The rest of the AI turns is being skipped: steps run without pauses. */
  readonly aiFast: boolean;
  /** The last AI move: who made it and its tiles, highlighted on the map. */
  readonly aiMove: AiMove | null;
  /** Tiles the AI players took since the human's last command. */
  readonly aiTaken: readonly number[];
  /** Recent events with ids, for the news banner (the AI plays many commands in a row). */
  readonly news: readonly NewsItem[];
  /** Debug paint mode: taps set the tile owner to `paintOwner` (null = neutral). */
  readonly painting: boolean;
  readonly paintOwner: PlayerId | null;
  /** The age panel (advance button, price, unlocks) is open. */
  readonly agePanelOpen: boolean;
  /** The end screen was put away to look at the final map. */
  readonly resultsHidden: boolean;
  /** Events of the last human command and of the AI moves since, for the debug log. */
  readonly lastEvents: readonly GameEvent[];
  /** Why the last command was refused; cleared by the next successful one. */
  readonly lastError: { readonly error: CommandError; readonly id: number } | null;
  readonly newGame: (options: NewGameOptions) => void;
  /** Closes the menu and plays on (the loaded or the current game). */
  readonly resume: () => void;
  readonly setMenuOpen: (open: boolean) => void;
  readonly setHelpOpen: (open: boolean) => void;
  readonly setMuted: (muted: boolean) => void;
  /** Validates and applies a command; returns whether it was applied. */
  readonly dispatch: (command: Command) => boolean;
  /** Plays the AI's next command(s) (no-op unless an AI player is on turn); see aiDriver. */
  readonly stepAi: () => void;
  /** Skips the rest of the AI turns: they play on without pauses. */
  readonly skipAi: () => void;
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
  readonly setAgePanelOpen: (open: boolean) => void;
  readonly setResultsHidden: (hidden: boolean) => void;
}

export interface NewGameOptions {
  readonly seed: number;
  /** AI opponents (1-3); the human is player 1. */
  readonly ais: number;
}

/** Most AI opponents: four players in all (one color each, PLAN 1). */
export const MAX_AIS = 3;

/** One command's events: who played it, and whether it was dropped by a drag. */
export interface EventFeed {
  readonly id: number;
  readonly events: readonly GameEvent[];
  readonly by: 'human' | 'ai';
  /** Dropped by dragging: the unit is already where it lands, no slide. */
  readonly dragged: boolean;
}

export interface AiMove {
  readonly player: PlayerId;
  readonly tiles: readonly number[];
}

export interface NewsItem {
  readonly id: number;
  readonly event: GameEvent;
}

/** News items kept (older ones have long faded). */
const NEWS_KEPT = 12;

const SEED_PARAM = 'seed';

/** A short random seed (easy to read and type back). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** The `?seed=` of a shared link, if any. */
export function urlSeed(): number | null {
  const param = new URLSearchParams(window.location.search).get(SEED_PARAM);
  const seed = param === null || param.trim() === '' ? NaN : Number(param);
  return Number.isFinite(seed) ? normalizeSeed(seed) : null;
}

/** Keeps `?seed=` in the address bar so a game can be reloaded or shared. */
function writeSeedToUrl(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(SEED_PARAM, String(seed));
  window.history.replaceState(null, '', url);
}

/**
 * True while the AI plays: hotseat is off, the player on turn is an AI and the match is not
 * decided for the screen (after the human's elimination the AI stops).
 */
export function isAiTurn(state: Pick<GameStoreState, 'game' | 'hotseat'>): boolean {
  const { game, hotseat } = state;
  return !hotseat && game.players[game.currentPlayer]?.controller === 'ai' && !isDecided(state);
}

/** True if the human at the screen may act for the player on turn (never once it is over). */
export function canControl(state: Pick<GameStoreState, 'game' | 'hotseat'>): boolean {
  const { game, hotseat } = state;
  if (isGameOver(game)) return false;
  return hotseat || game.players[game.currentPlayer]?.controller === 'human';
}

/**
 * True once the match is decided for the screen: a player has won, or — playing against the
 * AI — the human has been eliminated.
 */
export function isDecided(state: Pick<GameStoreState, 'game' | 'hotseat'>): boolean {
  const { game, hotseat } = state;
  if (isGameOver(game)) return true;
  return !hotseat && game.players.some((p) => p.controller === 'human' && p.eliminated !== null);
}

/** True if this turn's moves can be taken back (not the one that ended the game). */
export function canUndoTurn(state: Pick<GameStoreState, 'history' | 'game' | 'hotseat'>): boolean {
  return canUndo(state.history) && !isGameOver(state.history.present) && canControl(state);
}

/** Map tiles a command acts on (to highlight AI moves). */
function commandTiles(game: GameState, command: Command): number[] {
  switch (command.type) {
    case 'moveUnit':
      return [command.from, command.to];
    case 'buyUnit':
    case 'build':
      return [command.tile];
    case 'buildEdge':
      return [command.worker, command.to];
    case 'breachEdge':
      return [command.from, command.to];
    case 'archerVolley':
      return [command.from, command.target];
    case 'advanceAge': {
      const capital = capitalOf(game, game.currentPlayer);
      return capital === undefined ? [] : [capital];
    }
    default:
      return [];
  }
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
let newsId = 0;
let feedId = 0;

/** Time budget of one skip slice: the rest waits for the next timer, so the page stays live. */
const FAST_SLICE_MS = 40;

const initialSettings = loadSettings();
const saved = loadGame();
/** The saved game, or a preview of a new one behind the menu. */
const initialHistory =
  saved?.history ??
  startHistory(createGame({ seed: urlSeed() ?? randomSeed(), players: initialSettings.ais + 1 }));

export const gameStore = createStore<GameStoreState>()((set, get) => {
  const setHistory = (history: TurnHistory, extra: Partial<GameStoreState> = {}) => {
    set({ history, game: history.present, armed: null, drag: null, ...extra });
  };

  /** The turn's commands after `command` (ending the turn starts a new list). */
  const withCommand = (command: Command): readonly Command[] =>
    command.type === 'endTurn' ? [] : [...get().commands, command];

  const feedOf = (
    events: readonly GameEvent[],
    by: EventFeed['by'],
    dragged = false,
  ): EventFeed => ({ id: ++feedId, events, by, dragged });

  const withNews = (events: readonly GameEvent[]): readonly NewsItem[] => {
    const { news } = get();
    if (events.length === 0) return news;
    return [...news, ...events.map((event) => ({ id: ++newsId, event }))].slice(-NEWS_KEPT);
  };

  /** Applies the AI's next command; false if there is none (not an AI turn). */
  const playAiStep = (): boolean => {
    const state = get();
    if (!isAiTurn(state)) return false;
    const step = aiStep(state.game, state.aiTurn ?? undefined);
    if (!step) return false;
    const { command } = step.choice;
    const result = applyToHistory(state.history, command);
    const taken = result.events.flatMap((e) =>
      e.type === 'tileOwnerChanged' && e.to !== null ? [e.tile] : [],
    );
    const moves = commandTiles(state.game, command);
    setHistory(result.history, {
      commands: withCommand(command),
      feed: feedOf(result.events, 'ai'),
      aiTurn: command.type === 'endTurn' ? null : step.turn,
      aiMove: moves.length > 0 ? { player: state.game.currentPlayer, tiles: moves } : state.aiMove,
      aiTaken: taken.length > 0 ? [...state.aiTaken, ...taken] : state.aiTaken,
      lastEvents: [...state.lastEvents, ...result.events],
      news: withNews(result.events),
      lastError: null,
    });
    return true;
  };

  return {
    history: initialHistory,
    game: initialHistory.present,
    commands: saved?.commands ?? [],
    started: saved !== null,
    menuOpen: true,
    helpOpen: false,
    settings: initialSettings,
    feed: null,
    hoveredTile: null,
    selectedTile: null,
    armed: null,
    drag: null,
    hotseat: saved?.hotseat ?? false,
    aiTurn: null,
    aiFast: false,
    aiMove: null,
    aiTaken: [],
    news: [],
    painting: false,
    paintOwner: 0,
    agePanelOpen: false,
    resultsHidden: false,
    lastEvents: [],
    lastError: null,

    newGame({ seed, ais }) {
      const count = Math.min(MAX_AIS, Math.max(1, Math.round(ais)));
      const game = createGame({ seed, players: count + 1 });
      writeSeedToUrl(game.map.seed);
      const settings = { ...get().settings, ais: count };
      saveSettings(settings);
      setHistory(startHistory(game), {
        commands: [],
        started: true,
        menuOpen: false,
        helpOpen: false,
        settings,
        feed: null,
        selectedTile: null,
        aiTurn: null,
        aiFast: false,
        aiMove: null,
        aiTaken: [],
        news: [],
        lastEvents: [],
        lastError: null,
        agePanelOpen: false,
        resultsHidden: false,
      });
    },

    resume() {
      set({ started: true, menuOpen: false });
    },

    setMenuOpen(open) {
      // Before the first game starts the menu stays (the map behind it is a preview).
      if (open || get().started) set({ menuOpen: open, armed: null, drag: null });
    },

    setHelpOpen(open) {
      set({ helpOpen: open });
    },

    setMuted(muted) {
      const settings = { ...get().settings, muted };
      saveSettings(settings);
      set({ settings });
    },

    dispatch(command) {
      const state = get();
      // The screen waits while the AI plays.
      if (isAiTurn(state)) return false;
      const validation = validate(state.game, command);
      if (!validation.ok) {
        set({ lastError: { error: validation.error, id: ++errorId } });
        return false;
      }
      const { history, events } = applyToHistory(state.history, command);
      setHistory(history, {
        commands: withCommand(command),
        feed: feedOf(events, 'human', state.drag !== null),
        lastEvents: events,
        news: withNews(events),
        lastError: null,
        aiMove: null,
        aiTaken: [],
        aiFast: false,
      });
      return true;
    },

    stepAi() {
      if (!get().aiFast) {
        playAiStep();
        return;
      }
      const until = performance.now() + FAST_SLICE_MS;
      while (playAiStep() && performance.now() < until);
    },

    skipAi() {
      if (isAiTurn(get())) set({ aiFast: true });
    },

    undo() {
      const state = get();
      if (canUndoTurn(state)) {
        setHistory(undo(state.history), {
          commands: state.commands.slice(0, -1),
          lastEvents: [],
          lastError: null,
        });
      }
    },

    undoTurn() {
      const state = get();
      if (canUndoTurn(state)) {
        setHistory(undoTurn(state.history), { commands: [], lastEvents: [], lastError: null });
      }
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
      if (tile === null || actingTile(drag.source) === tile) {
        set({ drag: null });
        return;
      }
      // Dispatch still sees the drag (a dropped unit does not slide) and clears it.
      if (dispatch(placeCommand(drag.source, tile))) {
        set({ selectedTile: afterUse(drag.source, tile) });
      } else {
        set({ drag: null });
      }
    },

    setHotseat(hotseat) {
      set({ hotseat, aiTurn: null, aiFast: false });
    },

    setPainting(painting) {
      set({ painting, armed: null });
    },

    setPaintOwner(owner) {
      set({ paintOwner: owner, painting: true, armed: null });
    },

    setAgePanelOpen(open) {
      set({ agePanelOpen: open });
    },

    setResultsHidden(hidden) {
      set({ resultsHidden: hidden });
    },
  };
});

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
