import type { BuildingKind } from '@hexarchy/engine';
import { PALETTE } from './palette';

/**
 * Building emblems (GDD 14: flat vector), as data so the map (Pixi, buildingGraphics.ts)
 * and the HUD (SVG, BuildingIcon.tsx) draw the very same shapes. A building is a round
 * light badge ringed in its owner's color with a dark glyph; coordinates are in tile
 * sizes around the badge center (the badge radius is 0.3).
 */

type P = readonly [number, number];

/** `player` = the owner's color; the others are fixed palette colors. */
export type ShapeColor = 'player' | 'outline' | 'stone' | 'wood' | 'grain' | 'rock' | 'gold';

export type BuildingShape =
  | {
      readonly kind: 'poly';
      readonly points: readonly P[];
      readonly fill: ShapeColor;
      /** Dark outline width (tile sizes); none if 0. */
      readonly stroke: number;
    }
  | {
      readonly kind: 'circle';
      readonly at: P;
      readonly r: number;
      readonly fill: ShapeColor | null;
      readonly stroke: number;
      readonly strokeColor?: ShapeColor;
    }
  | {
      readonly kind: 'line';
      readonly points: readonly P[];
      readonly width: number;
      readonly color: ShapeColor;
    };

export const SHAPE_COLORS: Readonly<Record<Exclude<ShapeColor, 'player'>, number>> = {
  outline: PALETTE.iconOutline,
  stone: PALETTE.iconStone,
  wood: 0x8a5a2b,
  grain: 0xd9a520,
  rock: 0x8d8a86,
  gold: PALETTE.vein,
};

export const BADGE_RADIUS = 0.3;

const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A gear outline: `teeth` teeth between radii `inner` and `outer`. */
function gear(teeth: number, inner: number, outer: number): P[] {
  const points: P[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    for (const [da, r] of [
      [-0.3, inner],
      [-0.18, outer],
      [0.18, outer],
      [0.3, inner],
    ] as const) {
      points.push([Math.cos(a + da * step) * r, Math.sin(a + da * step) * r]);
    }
  }
  return points;
}

/** The glyph drawn inside the badge, per building. */
export const BUILDING_GLYPHS: Readonly<Record<BuildingKind, readonly BuildingShape[]>> = {
  // A wheat sheaf, tied in the middle.
  farm: [
    {
      kind: 'line',
      points: [
        [0, 0.19],
        [-0.13, -0.13],
      ],
      width: 0.055,
      color: 'grain',
    },
    {
      kind: 'line',
      points: [
        [0, 0.19],
        [0, -0.19],
      ],
      width: 0.055,
      color: 'grain',
    },
    {
      kind: 'line',
      points: [
        [0, 0.19],
        [0.13, -0.13],
      ],
      width: 0.055,
      color: 'grain',
    },
    {
      kind: 'line',
      points: [
        [-0.08, 0.05],
        [0.08, 0.05],
      ],
      width: 0.05,
      color: 'outline',
    },
  ],
  // An axe in a log.
  lumberCamp: [
    { kind: 'poly', points: rect(-0.2, 0.06, 0.2, 0.18), fill: 'wood', stroke: 0.025 },
    {
      kind: 'line',
      points: [
        [-0.1, 0.1],
        [0.08, -0.16],
      ],
      width: 0.05,
      color: 'wood',
    },
    {
      kind: 'poly',
      points: [
        [0.02, -0.2],
        [0.17, -0.16],
        [0.15, -0.03],
        [0.06, -0.09],
      ],
      fill: 'rock',
      stroke: 0.025,
    },
  ],
  // Three cut stone blocks.
  quarry: [
    { kind: 'poly', points: rect(-0.19, 0.03, -0.01, 0.17), fill: 'rock', stroke: 0.025 },
    { kind: 'poly', points: rect(0.01, 0.03, 0.19, 0.17), fill: 'rock', stroke: 0.025 },
    { kind: 'poly', points: rect(-0.09, -0.13, 0.09, 0.01), fill: 'rock', stroke: 0.025 },
  ],
  // Gold nuggets.
  goldMine: [
    {
      kind: 'poly',
      points: [
        [-0.17, 0.12],
        [-0.12, -0.02],
        [0.0, -0.05],
        [0.05, 0.06],
        [-0.02, 0.16],
      ],
      fill: 'gold',
      stroke: 0.025,
    },
    {
      kind: 'poly',
      points: [
        [0.02, -0.08],
        [0.07, -0.18],
        [0.17, -0.15],
        [0.18, -0.03],
        [0.09, 0.01],
      ],
      fill: 'gold',
      stroke: 0.025,
    },
  ],
  // Crossed swords.
  barracks: [
    {
      kind: 'line',
      points: [
        [-0.15, 0.15],
        [0.14, -0.15],
      ],
      width: 0.05,
      color: 'outline',
    },
    {
      kind: 'line',
      points: [
        [0.15, 0.15],
        [-0.14, -0.15],
      ],
      width: 0.05,
      color: 'outline',
    },
    {
      kind: 'line',
      points: [
        [-0.15, 0.06],
        [-0.06, 0.15],
      ],
      width: 0.05,
      color: 'outline',
    },
    {
      kind: 'line',
      points: [
        [0.15, 0.06],
        [0.06, 0.15],
      ],
      width: 0.05,
      color: 'outline',
    },
  ],
  // A target.
  archeryRange: [
    { kind: 'circle', at: [0, 0], r: 0.18, fill: 'player', stroke: 0.025 },
    { kind: 'circle', at: [0, 0], r: 0.11, fill: 'stone', stroke: 0 },
    { kind: 'circle', at: [0, 0], r: 0.05, fill: 'player', stroke: 0 },
  ],
  // A horseshoe.
  stable: [
    {
      kind: 'line',
      points: [
        [-0.11, 0.17],
        [-0.15, 0.02],
        [-0.12, -0.1],
        [0, -0.17],
        [0.12, -0.1],
        [0.15, 0.02],
        [0.11, 0.17],
      ],
      width: 0.075,
      color: 'outline',
    },
  ],
  // A gear.
  workshop: [
    { kind: 'poly', points: gear(8, 0.13, 0.2), fill: 'rock', stroke: 0.025 },
    { kind: 'circle', at: [0, 0], r: 0.06, fill: 'stone', stroke: 0.025 },
  ],
  // A tower with battlements.
  tower: [
    {
      kind: 'poly',
      points: [
        [-0.11, 0.2],
        [-0.09, -0.08],
        [-0.14, -0.08],
        [-0.14, -0.2],
        [-0.07, -0.2],
        [-0.07, -0.14],
        [-0.02, -0.14],
        [-0.02, -0.2],
        [0.02, -0.2],
        [0.02, -0.14],
        [0.07, -0.14],
        [0.07, -0.2],
        [0.14, -0.2],
        [0.14, -0.08],
        [0.09, -0.08],
        [0.11, 0.2],
      ],
      fill: 'rock',
      stroke: 0.025,
    },
    { kind: 'poly', points: rect(-0.03, 0.08, 0.03, 0.2), fill: 'outline', stroke: 0 },
  ],
};

/** The full emblem: badge (ringed in the owner's color) and glyph. */
export function buildingEmblem(kind: BuildingKind): readonly BuildingShape[] {
  return [
    {
      kind: 'circle',
      at: [0, 0],
      r: BADGE_RADIUS,
      fill: 'stone',
      stroke: 0.06,
      strokeColor: 'player',
    },
    { kind: 'circle', at: [0, 0], r: BADGE_RADIUS + 0.03, fill: null, stroke: 0.02 },
    ...BUILDING_GLYPHS[kind],
  ];
}
