import type { Draft } from 'immer';
import { BUILDINGS } from '../balance';
import { checkBuild, type BuildSource } from '../rules/buildings';
import type { GameEvent } from '../rules/events';
import type { GameState } from '../state/game';
import type { BuildCommand, Validation } from './types';

export function buildSource(command: BuildCommand): BuildSource {
  return { kind: 'build', center: command.center, building: command.building };
}

export function validateBuild(state: GameState, command: BuildCommand): Validation {
  const check = checkBuild(state, buildSource(command), command.tile);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

/** Pays the materials and puts the building up; it works right away (GDD 5). */
export function applyBuild(
  draft: Draft<GameState>,
  command: BuildCommand,
  events: GameEvent[],
): void {
  const center = draft.centers[command.center];
  if (!center) throw new Error(`No center on tile ${command.center}`);
  const { cost } = BUILDINGS[command.building];
  center.treasury.materials -= cost;
  draft.buildings[command.tile] = { kind: command.building, idle: false };
  events.push({
    type: 'buildingBuilt',
    player: draft.currentPlayer,
    center: command.center,
    tile: command.tile,
    building: command.building,
    cost,
  });
}
