import type { PlayerId, UnitLine } from '@hexarchy/engine';
import { cssColor, PALETTE, playerColor } from '../render/palette';

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
  const count = Math.max(1, Math.min(4, level));
  const top = -12 - ((count - 1) * 12) / 2;
  return (
    <svg
      className="unit-icon"
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
    >
      {line === 'worker' ? (
        <>
          <circle r="34" fill={fill} stroke={outline} strokeWidth="7" />
          <path d="M-12 18 L10 -5" stroke={light} strokeWidth="9" strokeLinecap="round" />
          <path d="M-3 -20 L10 -33 L25 -18 L12 -5 Z" fill={light} />
        </>
      ) : (
        <>
          <path
            d="M-38 -45 H38 V2 L30 21 L15 36 L0 45 L-15 36 L-30 21 L-38 2 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="7"
            strokeLinejoin="round"
          />
          {Array.from({ length: count }, (_, i) => {
            const y = top + i * 12;
            return (
              <path
                key={i}
                d={`M-21 ${y + 8} L0 ${y - 4} L21 ${y + 8}`}
                fill="none"
                stroke={light}
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </>
      )}
    </svg>
  );
}
