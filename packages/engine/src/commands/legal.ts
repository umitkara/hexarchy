import { UNITS } from '../balance';
import { checkAdvanceAge } from '../rules/ages';
import { buildOptions } from '../rules/buildings';
import { targetOptions, type UnitSource } from '../rules/placement';
import { getRegions, regionCenter } from '../rules/regions';
import { breachOptions, edgeBuildOptions } from '../rules/structures';
import { volleyOptions } from '../rules/volley';
import {
  BUILDING_KINDS,
  isGameOver,
  STRUCTURE_KINDS,
  UNIT_LINES,
  unitTiles,
  type GameState,
} from '../state/game';
import type { Command } from './types';

/**
 * Every legal non-debug command of the current player: unit moves, volleys, edge strikes
 * and edge building, purchases, buildings, advancing the age and ending the turn (always
 * last). Built from the same rules as `validate`, for the AI and tests. None once the game
 * is over.
 */
export function legalCommands(state: GameState): Command[] {
  if (isGameOver(state)) return [];
  const player = state.currentPlayer;
  const commands: Command[] = [];

  for (const from of unitTiles(state)) {
    const unit = state.units[from];
    if (!unit || state.owners[from] !== player || unit.exhausted) continue;
    const source: UnitSource = { kind: 'unit', from };
    for (const { tile, check } of targetOptions(state, source)) {
      if (check.ok) commands.push({ type: 'moveUnit', from, to: tile });
    }
    const line = UNITS[unit.line];
    if (line.volley) {
      for (const { tile, check } of volleyOptions(state, { kind: 'volley', from })) {
        if (check.ok) commands.push({ type: 'archerVolley', from, target: tile });
      }
    }
    for (const { to, check } of breachOptions(state, { kind: 'breach', from })) {
      if (check.ok) commands.push({ type: 'breachEdge', from, to });
    }
    if (line.buildsEdges) {
      for (const structure of STRUCTURE_KINDS) {
        for (const { to, check } of edgeBuildOptions(state, { kind: 'edge', from, structure })) {
          if (check.ok) commands.push({ type: 'buildEdge', structure, worker: from, to });
        }
      }
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

  if (checkAdvanceAge(state, player).ok) commands.push({ type: 'advanceAge' });
  commands.push({ type: 'endTurn' });
  return commands;
}
