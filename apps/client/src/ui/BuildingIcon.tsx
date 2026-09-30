import type { BuildingKind, PlayerId } from '@hexarchy/engine';
import { buildingEmblem, SHAPE_COLORS, type ShapeColor } from '../render/buildingShapes';
import { cssColor, PALETTE, playerColor } from '../render/palette';

/** Tile sizes → SVG units (viewBox -0.4..0.4 around the badge). */
const VIEW = 0.4;

/** The map's building emblem as a small SVG (see render/buildingShapes.ts). */
export function BuildingIcon({
  building,
  player,
  size = 28,
}: {
  readonly building: BuildingKind;
  readonly player: PlayerId;
  readonly size?: number;
}) {
  const paint = (role: ShapeColor) =>
    cssColor(role === 'player' ? playerColor(player) : SHAPE_COLORS[role]);
  const outline = cssColor(PALETTE.iconOutline);
  const points = (list: readonly (readonly [number, number])[]) =>
    list.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <svg
      className="building-icon"
      width={size}
      height={size}
      viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
      aria-hidden="true"
    >
      {buildingEmblem(building).map((shape, i) => {
        if (shape.kind === 'poly') {
          return (
            <polygon
              key={i}
              points={points(shape.points)}
              fill={paint(shape.fill)}
              stroke={shape.stroke > 0 ? outline : 'none'}
              strokeWidth={shape.stroke}
              strokeLinejoin="round"
            />
          );
        }
        if (shape.kind === 'circle') {
          return (
            <circle
              key={i}
              cx={shape.at[0]}
              cy={shape.at[1]}
              r={shape.r}
              fill={shape.fill ? paint(shape.fill) : 'none'}
              stroke={shape.stroke > 0 ? paint(shape.strokeColor ?? 'outline') : 'none'}
              strokeWidth={shape.stroke}
            />
          );
        }
        return (
          <polyline
            key={i}
            points={points(shape.points)}
            fill="none"
            stroke={paint(shape.color)}
            strokeWidth={shape.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
