import type { PlayerId, UnitLine } from '@hexarchy/engine';
import { cssColor, PALETTE, playerColor } from '../render/palette';
import { chevronRows, CHEVRONS, RAM, UNIT_BODIES } from '../render/unitGraphics';

/** Tile units → the icon's viewBox (-50..50). */
const K = 125;

const points = (list: readonly (readonly [number, number])[]) =>
  list.map(([x, y]) => `${x * K},${y * K}`).join(' ');

/** The map's unit token as a small SVG (see render/unitGraphics.ts). */
export function UnitIcon({
  line,
  level,
  player,
  size = 28,
}: {
  readonly line: UnitLine;
  readonly level: number;
  readonly player: PlayerId;
  readonly size?: number;
}) {
  const fill = cssColor(playerColor(player));
  const outline = cssColor(PALETTE.iconOutline);
  const light = cssColor(PALETTE.iconStone);
  const stroke = { stroke: outline, strokeWidth: 7, strokeLinejoin: 'round' as const };
  let body;
  switch (line) {
    case 'worker':
      body = (
        <>
          <circle r="34" fill={fill} {...stroke} />
          <path d="M-12 18 L10 -5" stroke={light} strokeWidth="9" strokeLinecap="round" />
          <path d="M-3 -20 L10 -33 L25 -18 L12 -5 Z" fill={light} />
        </>
      );
      break;
    case 'siege':
      body = (
        <>
          <polygon points={points(RAM.beam)} fill={cssColor(PALETTE.wood)} {...stroke} />
          <polygon points={points(RAM.body)} fill={fill} {...stroke} />
          {RAM.wheels.map(([x, y]) => (
            <circle
              key={x}
              cx={x * K}
              cy={y * K}
              r={RAM.wheelRadius * K}
              fill={light}
              {...stroke}
            />
          ))}
        </>
      );
      break;
    case 'infantry':
    case 'archer':
    case 'cavalry': {
      const { half } = CHEVRONS[line];
      body = (
        <>
          <polygon points={points(UNIT_BODIES[line])} fill={fill} {...stroke} />
          {chevronRows(line, level).map((y) => (
            <path
              key={y}
              d={`M${-half * K} ${(y + 0.07) * K} L0 ${(y - 0.03) * K} L${half * K} ${(y + 0.07) * K}`}
              fill="none"
              stroke={light}
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </>
      );
    }
  }
  return (
    <svg
      className="unit-icon"
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
