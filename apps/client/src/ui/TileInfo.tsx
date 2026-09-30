import {
  checkPlacement,
  edgeKey,
  mapGrid,
  protectorsOf,
  type EdgeKind,
  type GameState,
  type PlacementAction,
  type UnitSource,
} from '@hexarchy/engine';
import { useGameStore } from '../store/gameStore';
import { COMMAND_ERROR_LABELS, EDGE_LABELS, playerName, TERRAIN_LABELS, unitName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { UnitIcon } from './UnitIcon';

const ACTION_LABELS: Readonly<Record<PlacementAction, string>> = {
  move: 'Buraya yürür',
  merge: 'Birleşir',
  capture: 'Ele geçirir',
  attack: 'Saldırır, kazanır',
};

/** What placing the unit in hand on `tile` would do. */
function verdict(game: GameState, source: UnitSource, tile: number) {
  const check = checkPlacement(game, source, tile);
  if (check.ok) {
    const { action, unit } = check.placement;
    const text =
      action === 'merge' ? `${ACTION_LABELS.merge} → ${unitName(unit)}` : ACTION_LABELS[action];
    return { ok: true, text };
  }
  if (check.error === 'noChange') return null;
  return { ok: false, text: COMMAND_ERROR_LABELS[check.error] };
}

/** Details of the hovered (or tapped) tile: terrain, owner, unit, protection. */
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
  const edgeCounts = new Map<EdgeKind, number>();
  for (const n of grid.neighbors(index)) {
    const kind = map.edges[edgeKey(index, n)]?.kind;
    if (kind) edgeCounts.set(kind, (edgeCounts.get(kind) ?? 0) + 1);
  }
  const edgeText = [...edgeCounts].map(([kind, count]) => `${count} ${EDGE_LABELS[kind]}`);
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
      {unit && owner !== null && (
        <span className="tile-unit">
          <UnitIcon line={unit.line} level={unit.level} player={owner} size={18} />
          {unitName(unit)}
          {unit.exhausted && <span className="hud-meta">(yorgun)</span>}
        </span>
      )}
      {owner !== null && <span className="tile-tag">koruma {protection}</span>}
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
