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
} as const;

export const BACKGROUND_COLOR = PALETTE.seaDepths[2];
