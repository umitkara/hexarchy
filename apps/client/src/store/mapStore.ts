import { generateMap, normalizeSeed, type GameMap } from '@hexarchy/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * M1 bridge between the engine, the Pixi scene and the React HUD: the generated map
 * and the tile under the pointer. Pixi subscribes imperatively, React via `useMapStore`.
 */
export interface MapStoreState {
  readonly map: GameMap;
  /** Tile under the mouse, or the last tapped tile on touch screens. */
  readonly hoveredTile: number | null;
  readonly generate: (seed: number) => void;
  readonly setHoveredTile: (tile: number | null) => void;
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

/** Keeps `?seed=` in the address bar so a map can be reloaded or shared. */
function writeSeedToUrl(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(SEED_PARAM, String(seed));
  window.history.replaceState(null, '', url);
}

export const mapStore = createStore<MapStoreState>()((set, get) => ({
  map: generateMap({ seed: initialSeed() }),
  hoveredTile: null,
  generate(seed) {
    const map = generateMap({ seed });
    writeSeedToUrl(map.seed);
    set({ map });
  },
  setHoveredTile(tile) {
    if (get().hoveredTile !== tile) set({ hoveredTile: tile });
  },
}));

export function useMapStore<T>(selector: (state: MapStoreState) => T): T {
  return useStore(mapStore, selector);
}
