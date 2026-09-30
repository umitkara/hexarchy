import { axialToPixel, hexPolygon, mapGrid, type GameState, type PlayerId } from '@hexarchy/engine';
import type { Graphics } from 'pixi.js';
import { TILE_SIZE } from './mapGraphics';
import { PALETTE, PLAYER_COLORS } from './palette';

/**
 * The AI's moves (GDD 12): tiles taken since the human's last command, faintly filled in
 * the taker's color, and the last move outlined in the mover's color.
 */
export function drawAiMoves(
  g: Graphics,
  game: Pick<GameState, 'map' | 'owners'>,
  taken: readonly number[],
  move: { readonly player: PlayerId; readonly tiles: readonly number[] } | null,
): void {
  g.clear();
  const grid = mapGrid(game.map);
  for (const tile of new Set(taken)) {
    const owner = game.owners[tile];
    if (!grid.has(tile) || owner === null || owner === undefined) continue;
    const center = axialToPixel(grid.coord(tile), TILE_SIZE);
    g.poly(hexPolygon(center, TILE_SIZE * 0.8)).fill({
      color: PLAYER_COLORS[owner] ?? PALETTE.hover,
      alpha: 0.35,
    });
  }
  if (!move) return;
  const color = PLAYER_COLORS[move.player] ?? PALETTE.hover;
  for (const tile of move.tiles) {
    if (!grid.has(tile)) continue;
    const center = axialToPixel(grid.coord(tile), TILE_SIZE);
    g.poly(hexPolygon(center, TILE_SIZE * 0.9))
      .stroke({ width: 7, color: PALETTE.iconOutline, alpha: 0.55, join: 'round' })
      .stroke({ width: 4, color, join: 'round' });
  }
}
