import {
  BUILDINGS,
  buildingOutput,
  checkBreach,
  checkBuild,
  checkEdgeBuild,
  checkPlacement,
  checkVolley,
  COUNTER_BONUS,
  counterBonus,
  edgeKey,
  mapGrid,
  protectorsOf,
  STRUCTURES,
  UNIT_LINES,
  type EdgeKind,
  type GameState,
  type PlacementAction,
  type UnitLine,
} from '@hexarchy/engine';
import { actionText, buildEffectText } from '../render/targetGraphics';
import { useGameStore, type HandSource } from '../store/gameStore';
import { BuildingIcon } from './BuildingIcon';
import {
  BUILDING_LABELS,
  COMMAND_ERROR_LABELS,
  EDGE_LABELS,
  LINE_HINTS,
  LINE_LABELS,
  playerName,
  STRUCTURE_LABELS,
  TERRAIN_LABELS,
  unitName,
} from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { UnitIcon } from './UnitIcon';

const ACTION_LABELS: Readonly<Record<PlacementAction, string>> = {
  move: 'Buraya yürür',
  merge: 'Birleşir',
  capture: 'Ele geçirir',
  attack: 'Saldırır, kazanır',
};

/** The counter bonuses of a line as attacker (GDD 7.2): "süvariye +1". */
function counterText(line: UnitLine): string {
  const bonuses = COUNTER_BONUS[line] ?? {};
  return UNIT_LINES.flatMap((target) => {
    const bonus = bonuses[target];
    return bonus ? [`${LINE_LABELS[target].toLowerCase()} +${bonus}`] : [];
  }).join(', ');
}

/** What placing the unit or building in hand on `tile`, or its action there, would do. */
function verdict(game: GameState, source: HandSource, tile: number) {
  if (source.kind === 'edge' || source.kind === 'breach' || source.kind === 'volley') {
    const text = actionText(game, source, tile);
    if (text) return { ok: true, text };
    const check =
      source.kind === 'edge'
        ? checkEdgeBuild(game, source, tile)
        : source.kind === 'breach'
          ? checkBreach(game, source, tile)
          : checkVolley(game, source, tile);
    return check.ok ? null : { ok: false, text: COMMAND_ERROR_LABELS[check.error] };
  }
  if (source.kind === 'build') {
    const check = checkBuild(game, source, tile);
    if (!check.ok) return { ok: false, text: COMMAND_ERROR_LABELS[check.error] };
    const effect = buildEffectText(check.placement.output, BUILDINGS[source.building].protection);
    const name = BUILDING_LABELS[source.building];
    return { ok: true, text: effect ? `${name}: ${effect}/tur` : `${name} kurulur` };
  }
  const check = checkPlacement(game, source, tile);
  if (check.ok) {
    const { action, unit, defenders, via } = check.placement;
    const owner = game.owners[tile] ?? null;
    let text =
      action === 'merge' ? `${ACTION_LABELS.merge} → ${unitName(unit)}` : ACTION_LABELS[action];
    if (action === 'attack' && owner !== null && game.centers[tile]?.kind === 'capital') {
      text = `Başkenti alır: ${playerName(owner)} elenir`;
    }
    if (via !== undefined) text += ` (#${via} üzerinden)`;
    const bonus = Math.max(0, ...defenders.map((d) => counterBonus(unit, d)));
    if (bonus > 0) text += ` · karşılık +${bonus}`;
    return { ok: true, text };
  }
  if (check.error === 'noChange') return null;
  return { ok: false, text: COMMAND_ERROR_LABELS[check.error] };
}

/** The structures on a tile's sides: "Çit (Mavi), Taş sur (Kırmızı, hasar 1/2)". */
function structuresText(game: GameState, tile: number): string {
  const grid = mapGrid(game.map);
  return grid
    .neighbors(tile)
    .flatMap((n) => {
      const structure = game.edgeStructures[edgeKey(tile, n)];
      if (!structure) return [];
      const damage =
        structure.damage > 0
          ? `, hasar ${structure.damage}/${STRUCTURES[structure.kind].hits}`
          : '';
      const ruin = game.players[structure.owner]?.eliminated ? ', harabe' : '';
      return [
        `${STRUCTURE_LABELS[structure.kind]} (${playerName(structure.owner)}${ruin}${damage})`,
      ];
    })
    .join(', ');
}

/** Details of the hovered (or tapped) tile: terrain, owner, building, unit, protection. */
export function TileInfo() {
  const game = useGameStore((s) => s.game);
  const index = useGameStore((s) => s.hoveredTile);
  const source = useGameStore((s) => s.drag?.source ?? s.armed);
  const { map } = game;
  const tile = index === null ? undefined : map.tiles[index];

  if (index === null || !tile) {
    return (
      <section className="hud-panel tile-info">
        <span className="hud-meta">Bir karonun üzerine gel ya da dokun</span>
      </section>
    );
  }

  const grid = mapGrid(map);
  const { q, r } = grid.coord(index);
  const owner = game.owners[index] ?? null;
  const unit = game.units[index];
  const building = game.buildings[index];
  const buildingEffect =
    building && owner !== null && !building.idle
      ? buildEffectText(buildingOutput(game, index, building.kind, owner), 0)
      : '';
  const edgeCounts = new Map<EdgeKind, number>();
  for (const n of grid.neighbors(index)) {
    const kind = map.edges[edgeKey(index, n)]?.kind;
    if (kind) edgeCounts.set(kind, (edgeCounts.get(kind) ?? 0) + 1);
  }
  const edgeText = [...edgeCounts].map(([kind, count]) => `${count} ${EDGE_LABELS[kind]}`);
  const structures = structuresText(game, index);
  const counters = unit ? counterText(unit.line) : '';
  const protection = Math.max(0, ...protectorsOf(game, index).map((p) => p.strength));
  const result = source ? verdict(game, source, index) : null;

  return (
    <section className="hud-panel tile-info" aria-live="polite">
      <strong className="tile-terrain">{TERRAIN_LABELS[tile.terrain]}</strong>
      {tile.vein && <span className="tile-tag">maden damarı</span>}
      {owner !== null && (
        <span className="tile-owner">
          <PlayerSwatch player={owner} />
          {playerName(owner)}
        </span>
      )}
      {building && owner !== null && (
        <span className="tile-unit">
          <BuildingIcon building={building.kind} player={owner} size={18} />
          {BUILDING_LABELS[building.kind]}
          {building.idle && <span className="hud-meta">(boşta: bakım ödenmedi)</span>}
          {buildingEffect && <span className="hud-meta">({buildingEffect}/tur)</span>}
        </span>
      )}
      {unit && owner !== null && (
        <span className="tile-unit" title={LINE_HINTS[unit.line]}>
          <UnitIcon line={unit.line} level={unit.level} player={owner} size={18} />
          {unitName(unit)}
          {counters && <span className="tile-tag">saldırıda {counters}</span>}
          {unit.hungry && <span className="tile-hungry">aç (−1 güç)</span>}
          {unit.suppressed && <span className="tile-hungry">baskı altında (−1 güç)</span>}
          {unit.exhausted && <span className="hud-meta">(yorgun)</span>}
        </span>
      )}
      {owner !== null && <span className="tile-tag">koruma {protection}</span>}
      {structures && <span className="tile-tag">{structures}</span>}
      {result && (
        <span className={result.ok ? 'tile-verdict tile-verdict-ok' : 'tile-verdict'}>
          {result.text}
        </span>
      )}
      <span className="hud-meta tile-coords">
        q {q}, r {r} · #{index}
        {edgeText.length > 0 && ` · ${edgeText.join(', ')}`}
      </span>
    </section>
  );
}
