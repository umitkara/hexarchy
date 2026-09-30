import {
  getRegions,
  regionAt,
  regionCenter,
  regionGoldIncome,
  regionUpkeep,
  RESOURCE_KINDS,
  UNIT_LINES,
  UNITS,
  UPKEEP,
  type UnitSource,
} from '@hexarchy/engine';
import { startPanelDrag } from '../input/dragDrop';
import { canControl, useGameStore } from '../store/gameStore';
import { CENTER_LABELS, LINE_LABELS, playerName, RESOURCE_LABELS } from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { UnitIcon } from './UnitIcon';

/**
 * Treasury panel of the selected region (GDD 13: region selection → treasury panel), with
 * the recruit buttons of the player on turn: drag one onto the map, or tap it, then a tile.
 */
export function RegionPanel() {
  const game = useGameStore((s) => s.game);
  const tile = useGameStore((s) => s.selectedTile);
  const armed = useGameStore((s) => s.armed);
  const controllable = useGameStore(canControl);
  const selectTile = useGameStore((s) => s.selectTile);
  const arm = useGameStore((s) => s.arm);
  if (tile === null) return null;

  const owner = game.owners[tile] ?? null;
  const region = regionAt(getRegions(game), tile);
  const centerTile = region && regionCenter(game, region);
  const center = centerTile === undefined ? undefined : game.centers[centerTile];
  const unitCount = region ? region.tiles.filter((t) => game.units[t]).length : 0;
  const upkeep = region ? regionUpkeep(game, region) : 0;
  const canRecruit =
    controllable && owner === game.currentPlayer && centerTile !== undefined && center;

  return (
    <section className="hud-panel region-panel" aria-label="Bölge" aria-live="polite">
      <header className="region-header">
        <PlayerSwatch player={owner} />
        <strong>{owner === null ? 'Tarafsız karo' : `${playerName(owner)} bölgesi`}</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Kapat"
          onClick={() => {
            selectTile(null);
          }}
        >
          ×
        </button>
      </header>
      {region && (
        <p className="hud-meta region-meta">
          {region.tiles.length} karo · {unitCount} birim ·{' '}
          {center ? `${CENTER_LABELS[center.kind]} #${centerTile}` : 'merkez yok'}
        </p>
      )}
      {region && center && (
        <dl className="treasury">
          {RESOURCE_KINDS.map((kind) => (
            <div key={kind} className="treasury-item">
              <dt className="hud-label">{RESOURCE_LABELS[kind]}</dt>
              <dd>
                {center.treasury[kind]}
                {kind === 'gold' && (
                  <span className="income">+{regionGoldIncome(game.map, region)}/tur</span>
                )}
                {kind === UPKEEP.resource && upkeep > 0 && (
                  <span className="upkeep">−{upkeep} bakım</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {region && !center && (
        <p className="hud-meta region-note">
          Tek karo: kasası yok, geliri boşa gider{unitCount > 0 && ', birimi tur başında ölür'}.
        </p>
      )}
      {canRecruit && (
        <div className="recruit" role="group" aria-label="Asker al">
          {UNIT_LINES.map((line) => {
            const source: UnitSource = { kind: 'recruit', center: centerTile, line };
            const { cost, buyLevel } = UNITS[line];
            const affordable = center.treasury.gold >= cost;
            const pressed =
              armed?.kind === 'recruit' && armed.line === line && armed.center === centerTile;
            return (
              <button
                key={line}
                type="button"
                className="recruit-button"
                disabled={!affordable}
                aria-pressed={pressed}
                title={`${LINE_LABELS[line]}: ${cost} altın. Haritaya sürükle ya da dokun, sonra karoya dokun.`}
                onPointerDown={(event) => {
                  if (affordable) startPanelDrag(event, source);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    arm(pressed ? null : source);
                  }
                }}
              >
                <UnitIcon line={line} level={Math.max(1, buyLevel)} player={owner} />
                <span className="recruit-label">{LINE_LABELS[line]}</span>
                <span className="recruit-cost">{cost}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
