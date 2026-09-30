import { BUILDINGS, CENTER_PROTECTION, COUNTER_BONUS, UNITS } from '../balance';
import type { BuildingKind, CenterKind, GameState, PlayerId, Unit } from '../state/game';
import { mapGrid } from '../state/map';
import { openRiver, structureAt, type EdgeState } from './edgeState';
import { unitStrength } from './units';

/**
 * Protection (GDD 7.1): who defends a tile, and with what strength.
 *
 * A tile is protected by its owner's unit on it, the owner's units on adjacent tiles, the
 * owner's region center and active towers on it or next to it, and the owner's archers up
 * to two tiles away. Melee units and centers protect across fords, bridges and gates, but
 * not across rivers, fences or walls; archers and towers protect across any edge. Hungry
 * and suppressed units protect at their reduced strength. Derived data: computed from the
 * state, never stored.
 */

export type Protector =
  | {
      readonly kind: 'unit';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly strength: number;
      readonly unit: Unit;
    }
  | {
      readonly kind: 'center';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly strength: number;
      readonly center: CenterKind;
    }
  | {
      readonly kind: 'building';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly strength: number;
      readonly building: BuildingKind;
    };

/** True if melee and center protection reach across the edge between `a` and `b`. */
export function protectionLinked(state: EdgeState, a: number, b: number): boolean {
  if (openRiver(state, a, b)) return false;
  const kind = structureAt(state, a, b)?.kind;
  return kind !== 'fence' && kind !== 'wall';
}

type ProtectionState = Pick<
  GameState,
  'map' | 'owners' | 'centers' | 'units' | 'buildings' | 'edgeStructures'
>;

/** Widest protection radius of any unit line. */
const MAX_RADIUS = Math.max(...Object.values(UNITS).map((u) => u.protectionRadius));

/**
 * `tile`, then its neighbors in direction order, then the ring beyond them, and so on up to
 * `radius`; each with its distance from `tile`.
 */
function rings(state: Pick<GameState, 'map'>, tile: number, radius: number) {
  const grid = mapGrid(state.map);
  const seen = new Set([tile]);
  const result = [{ tile, distance: 0 }];
  // Breadth-first: the array iterator also visits entries pushed during the loop.
  for (const { tile: t, distance } of result) {
    if (distance >= radius) continue;
    for (const n of grid.neighbors(t)) {
      if (seen.has(n)) continue;
      seen.add(n);
      result.push({ tile: n, distance: distance + 1 });
    }
  }
  return result;
}

/**
 * Everything that protects `tile`: the tile itself first, then its neighbors in direction
 * order, then the tiles two steps away; per tile the unit, then the center, then the
 * building. Neutral tiles have no protectors. Units of strength 0 (workers, hungry
 * militia) protect nothing: every attacker beats them anyway.
 */
export function protectorsOf(state: ProtectionState, tile: number): Protector[] {
  const owner = state.owners[tile] ?? null;
  if (owner === null) return [];
  const protectors: Protector[] = [];
  for (const { tile: t, distance } of rings(state, tile, MAX_RADIUS)) {
    if (state.owners[t] !== owner) continue;
    // Melee protection (units, centers) reaches a neighbor only across an open edge.
    const linked = distance === 0 || (distance === 1 && protectionLinked(state, tile, t));

    const unit = state.units[t];
    if (unit && unitStrength(unit) > 0) {
      const { protectionRadius, rangedProtection } = UNITS[unit.line];
      if (distance <= protectionRadius && (rangedProtection || linked)) {
        protectors.push({ kind: 'unit', tile: t, owner, strength: unitStrength(unit), unit });
      }
    }
    const center = state.centers[t];
    if (center && linked) {
      protectors.push({
        kind: 'center',
        tile: t,
        owner,
        strength: CENTER_PROTECTION[center.kind],
        center: center.kind,
      });
    }
    // Towers protect their tile and its neighbors across any edge.
    const building = state.buildings[t];
    const strength = building && !building.idle ? BUILDINGS[building.kind].protection : 0;
    if (building && strength > 0 && distance <= 1) {
      protectors.push({ kind: 'building', tile: t, owner, strength, building: building.kind });
    }
  }
  return protectors;
}

/** The counter bonus of `attacker` against one defender (GDD 7.2), 0 if none. */
export function counterBonus(attacker: Unit, defender: Protector): number {
  return defender.kind === 'unit' ? (COUNTER_BONUS[attacker.line]?.[defender.unit.line] ?? 0) : 0;
}

/**
 * The attacker's strength against one defender (GDD 7.1, 7.2): level + counter bonus.
 * Siege has full strength against centers and towers but none against units.
 */
export function strengthAgainst(attacker: Unit, defender: Protector): number {
  if (UNITS[attacker.line].siege && defender.kind === 'unit') return 0;
  return unitStrength(attacker) + counterBonus(attacker, defender);
}

/**
 * The protectors of `tile` that `attacker` does not beat. The attack succeeds iff there
 * are none: the attacker must be strictly stronger than every defender (GDD 7.1).
 */
export function attackBlockers(state: ProtectionState, attacker: Unit, tile: number): Protector[] {
  return protectorsOf(state, tile).filter((p) => strengthAgainst(attacker, p) <= p.strength);
}

/**
 * Protection map: the strongest protector of every tile (0 = unprotected), ignoring
 * counter bonuses. Indexed like `map.tiles`.
 */
export function computeProtectionMap(state: ProtectionState): Int8Array {
  const grid = mapGrid(state.map);
  const levels = new Int8Array(grid.tileCount);
  for (let tile = 0; tile < grid.tileCount; tile++) {
    for (const p of protectorsOf(state, tile))
      levels[tile] = Math.max(levels[tile] ?? 0, p.strength);
  }
  return levels;
}
