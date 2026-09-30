import type { PlayerId } from '@hexarchy/engine';
import { cssColor, playerColor } from '../render/palette';

/** A dot in the player's color (neutral: hollow). */
export function PlayerSwatch({ player }: { readonly player: PlayerId | null }) {
  return (
    <span
      className={player === null ? 'swatch swatch-neutral' : 'swatch'}
      style={player === null ? undefined : { background: cssColor(playerColor(player)) }}
      aria-hidden="true"
    />
  );
}
