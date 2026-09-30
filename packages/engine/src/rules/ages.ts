import type { Draft } from 'immer';
import { AGE_ADVANCE, BUILDINGS, LEVEL_CAP, STRUCTURES, UNITS } from '../balance';
import type { CommandError } from '../commands/types';
import {
  AGES,
  BUILDING_KINDS,
  capitalOf,
  nextAge,
  STRUCTURE_KINDS,
  UNIT_LINES,
  type Age,
  type BuildingKind,
  type GameState,
  type PlayerId,
  type Resources,
  type StructureKind,
  type UnitLine,
} from '../state/game';
import type { GameEvent } from './events';

/**
 * Ages (GDD 9.1). A player advances to the next age by paying its price from the capital
 * region's treasury; the age arrives at their next turn start, so the other players get a
 * turn while the price is paid but nothing is unlocked yet. Units, buildings, structures
 * and the level cap all read the player's current age.
 */

/** Price of reaching `age` (nothing for the first age). */
export function ageCost(age: Age): Resources | undefined {
  return age === 'dark' ? undefined : AGE_ADVANCE.cost[age];
}

/** The age `player` can advance to next, or undefined past the last age. */
export function advanceTarget(
  state: Pick<GameState, 'players'>,
  player: PlayerId,
): Age | undefined {
  const age = state.players[player]?.age;
  const next = age && nextAge(age);
  if (!next || AGES.indexOf(next) > AGES.indexOf(AGE_ADVANCE.lastAge)) return undefined;
  return next;
}

export type AdvanceCheck =
  | {
      readonly ok: true;
      readonly age: Age;
      /** The capital, whose treasury pays. */
      readonly center: number;
      readonly cost: Resources;
    }
  | { readonly ok: false; readonly error: CommandError };

/** Whether `player` can start advancing to the next age now. */
export function checkAdvanceAge(
  state: Pick<GameState, 'players' | 'centers' | 'owners'>,
  player: PlayerId,
): AdvanceCheck {
  const info = state.players[player];
  if (!info) return { ok: false, error: 'unknownPlayer' };
  if (info.eliminated) return { ok: false, error: 'eliminated' };
  if (info.advancing) return { ok: false, error: 'alreadyAdvancing' };
  const age = advanceTarget(state, player);
  const cost = age && ageCost(age);
  if (!age || !cost) return { ok: false, error: 'lastAge' };
  const center = capitalOf(state, player);
  const treasury = center === undefined ? undefined : state.centers[center]?.treasury;
  if (center === undefined || !treasury) return { ok: false, error: 'noTreasury' };
  if (treasury.gold < cost.gold) return { ok: false, error: 'notEnoughGold' };
  if (treasury.food < cost.food) return { ok: false, error: 'notEnoughFood' };
  if (treasury.materials < cost.materials) return { ok: false, error: 'notEnoughMaterials' };
  return { ok: true, age, center, cost };
}

/** At `player`'s turn start: the age they paid for arrives. */
export function completeAgeAdvance(
  draft: Draft<GameState>,
  player: PlayerId,
  events: GameEvent[],
): void {
  const info = draft.players[player];
  if (!info?.advancing) return;
  info.age = info.advancing;
  info.advancing = null;
  events.push({ type: 'ageReached', player, age: info.age });
}

/** What an age unlocks (GDD 9.1): the content first available in it, and its level cap. */
export interface AgeUnlocks {
  readonly lines: readonly UnitLine[];
  readonly buildings: readonly BuildingKind[];
  readonly structures: readonly StructureKind[];
  /** Highest level reachable by merging in this age. */
  readonly levelCap: number;
}

export function ageUnlocks(age: Age): AgeUnlocks {
  return {
    lines: UNIT_LINES.filter((line) => UNITS[line].age === age),
    buildings: BUILDING_KINDS.filter((kind) => BUILDINGS[kind].age === age),
    structures: STRUCTURE_KINDS.filter((kind) => STRUCTURES[kind].age === age),
    levelCap: LEVEL_CAP[age],
  };
}
