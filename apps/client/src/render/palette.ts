import type { Terrain } from '@hexarchy/engine';

/** Flat vector palette (GDD 14). Terrain stays mid-toned so player colors can pop later. */
export const TERRAIN_COLORS: Readonly<Record<Terrain, number>> = {
  sea: 0x2f5f86,
  lake: 0x4d93c2,
  plains: 0xb3c46c,
  forest: 0x77a453,
  hill: 0xcdb277,
  mountain: 0x9d948b,
};

export const PALETTE = {
  /** Open sea by distance from land (1, 2, 3+ tiles); the last one is also the background. */
  seaDepths: [0x3a7098, 0x2f5f86, 0x28537a],
  gridLine: 0x1f2a1a,
  coast: 0xeadfb4,
  tree: 0x3f6f35,
  treeShade: 0x335d2b,
  hillShade: 0xb09457,
  mountainLight: 0x8a8179,
  mountainDark: 0x6f665f,
  snow: 0xf1ede4,
  vein: 0xf3c93f,
  veinOutline: 0x5a4310,
  river: 0x4d93c2,
  riverBank: 0x2a5a80,
  ford: 0xa9d8f2,
  fordStone: 0xe6dcc0,
  hover: 0xffffff,
  selection: 0xffffff,
  /** Dark outline of center icons. */
  iconOutline: 0x1d1a16,
  /** Light body of center icons (walls, roofs are in the player color). */
  iconStone: 0xf1ead8,
  /** Unit targets: move within own land, merge, capture/attack, protected (refused). */
  targetMove: 0xffffff,
  targetMerge: 0xf3c93f,
  targetWin: 0x5fd35f,
  targetBlocked: 0xff4d3d,
  /** Status marks: a building idling for lack of gold, a hungry unit (GDD 4.5). */
  idleMark: 0x6b6f76,
  hungryMark: 0xf08a1c,
  /** A unit under an archer volley (GDD 7.3). */
  suppressedMark: 0x2c6fb0,
  /** Edge structures: timber (fences, bridges), wall masonry, cracks of a damaged one. */
  wood: 0x9a6a3a,
  wallStone: 0x9c958a,
  crack: 0x2a1d12,
} as const;

/**
 * Player colors, by player id. Saturated and far apart in hue so they read over the
 * mid-toned terrain and next to each other (red, blue, purple, orange).
 */
export const PLAYER_COLORS: readonly number[] = [0xe0443a, 0x2f7de1, 0x9b55d8, 0xf08a1c];

/** Territory fill opacity over the terrain. */
export const TERRITORY_FILL_ALPHA = 0.42;

export function playerColor(player: number): number {
  return PLAYER_COLORS[player % PLAYER_COLORS.length] ?? 0xffffff;
}

/** A Pixi color number as a CSS hex color. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export const BACKGROUND_COLOR = PALETTE.seaDepths[2];
