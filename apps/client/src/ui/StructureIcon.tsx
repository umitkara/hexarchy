import type { PlayerId, StructureKind } from '@hexarchy/engine';
import { cssColor, PALETTE, playerColor } from '../render/palette';

/** An edge structure as a small SVG, drawn on a horizontal side (see structureGraphics.ts). */
export function StructureIcon({
  structure,
  player,
  size = 28,
}: {
  readonly structure: StructureKind;
  readonly player: PlayerId;
  readonly size?: number;
}) {
  const color = cssColor(playerColor(player));
  const outline = cssColor(PALETTE.iconOutline);
  const stone = cssColor(PALETTE.iconStone);
  const wood = cssColor(PALETTE.wood);
  const band = (width: number, stroke: string, from = -40, to = 40) => (
    <path d={`M${from} 0 H${to}`} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
  );
  let body;
  switch (structure) {
    case 'fence':
      body = (
        <>
          {band(13, outline)}
          {band(7, wood)}
          {[-34, 0, 34].map((x) => (
            <circle key={x} cx={x} r="9" fill={color} stroke={outline} strokeWidth="3" />
          ))}
        </>
      );
      break;
    case 'wall':
    case 'gate':
      body = (
        <>
          {band(34, outline)}
          {band(26, cssColor(PALETTE.wallStone))}
          {[-20, 0, 20].map((x) => (
            <path key={x} d={`M${x} -9 V9`} stroke={outline} strokeWidth="2" opacity="0.55" />
          ))}
          {(structure === 'gate' ? [-34, 34] : [-34, 0, 34]).map((x) => (
            <rect
              key={x}
              x={x - 8}
              y="-8"
              width="16"
              height="16"
              fill={color}
              stroke={outline}
              strokeWidth="3"
            />
          ))}
          {structure === 'gate' && (
            <>
              {band(40, outline, -16, 16)}
              {band(30, color, -16, 16)}
              {band(6, stone, -10, 10)}
            </>
          )}
        </>
      );
      break;
    case 'bridge':
      body = (
        <>
          <rect x="-44" y="-14" width="88" height="28" fill={cssColor(PALETTE.river)} />
          <rect
            x="-14"
            y="-36"
            width="28"
            height="72"
            fill={wood}
            stroke={outline}
            strokeWidth="3"
          />
          <path d="M-14 -36 V36 M14 -36 V36" stroke={color} strokeWidth="7" />
        </>
      );
      break;
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
