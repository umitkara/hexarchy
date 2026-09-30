import { buildOptions } from '../rules/buildings';
import { getRegions, regionCenter } from '../rules/regions';
import { targetOptions, type UnitSource } from '../rules/placement';
import { BUILDING_KINDS, UNIT_LINES, unitTiles, type GameState } from '../state/game';
import type { Command } from './types';

/**
 * Every legal non-debug command of the current player: unit moves, purchases, buildings
 * and ending the turn. Built from the same rules as `validate`, for the AI and tests.
 */
export function legalCommands(state: GameState): Command[] {
  const player = state.currentPlayer;
  const commands: Command[] = [];

  for (const from of unitTiles(state)) {
    if (state.owners[from] !== player) continue;
    const source: UnitSource = { kind: 'unit', from };
    for (const { tile, check } of targetOptions(state, source)) {
      if (check.ok) commands.push({ type: 'moveUnit', from, to: tile });
    }
  }

  for (const region of getRegions(state).regions) {
    if (region.owner !== player) continue;
    const center = regionCenter(state, region);
    if (center === undefined) continue;
    for (const line of UNIT_LINES) {
      for (const { tile, check } of targetOptions(state, { kind: 'recruit', center, line })) {
        if (check.ok) commands.push({ type: 'buyUnit', line, center, tile });
      }
    }
    for (const building of BUILDING_KINDS) {
      for (const { tile, check } of buildOptions(state, { kind: 'build', center, building })) {
        if (check.ok) commands.push({ type: 'build', building, center, tile });
      }
    }
  }

  commands.push({ type: 'endTurn' });
  return commands;
}
