import {
  BUILDING_KINDS,
  BUILDINGS,
  buildingUnlocked,
  buildOptions,
  checkBuildSource,
  checkSource,
  getRegions,
  regionAt,
  regionCenter,
  RESOURCE_KINDS,
  turnStartForecast,
  UNIT_LINES,
  UNITS,
  UPKEEP,
  type BuildSource,
  type CommandError,
  type GameState,
  type RegionTurnStart,
  type Resources,
  type UnitSource,
} from '@hexarchy/engine';
import type { KeyboardEvent, ReactNode } from 'react';
import { startPanelDrag } from '../input/dragDrop';
import { canControl, sameSource, useGameStore, type HandSource } from '../store/gameStore';
import { BuildingIcon } from './BuildingIcon';
import {
  BUILDING_HINTS,
  BUILDING_LABELS,
  CENTER_LABELS,
  COMMAND_ERROR_LABELS,
  LINE_LABELS,
  playerName,
  RESOURCE_LABELS,
} from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { UnitIcon } from './UnitIcon';

/** Income and expense of one resource at the next turn start (from the engine forecast). */
function flows(forecast: RegionTurnStart, kind: keyof Resources) {
  const expense =
    kind === 'gold'
      ? forecast.buildingUpkeep
      : kind === UPKEEP.resource
        ? forecast.food === 'starving'
          ? forecast.unitUpkeep
          : forecast.foodPaid
        : 0;
  return { income: forecast.income[kind], expense, after: forecast.after[kind] };
}

/** Warnings about the next turn start: hunger, rebellion, idle buildings. */
function forecastWarnings(forecast: RegionTurnStart, game: GameState): string[] {
  const warnings: string[] = [];
  if (forecast.food === 'starving') {
    warnings.push(
      `Yiyecek yetmeyecek (${forecast.unitUpkeep} gerekli): birimler aç kalacak, −1 güç.`,
    );
  } else if (forecast.food === 'rebellion') {
    warnings.push(`Açlık isyanı: ${forecast.rebels.length} birim ölecek.`);
  }
  // Without a treasury nothing is paid anyway; the lone-tile note says so.
  if (forecast.idle.length > 0 && forecast.center !== undefined) {
    const names = forecast.idle.flatMap((t) => {
      const b = game.buildings[t];
      return b ? [BUILDING_LABELS[b.kind].toLowerCase()] : [];
    });
    warnings.push(`Altın yetmeyecek: ${names.join(', ')} boşta kalacak.`);
  }
  return warnings;
}

/** A panel button that is dragged onto the map, or tapped and then a tile tapped. */
function HandButton({
  source,
  enabled,
  title,
  children,
}: {
  readonly source: HandSource;
  readonly enabled: boolean;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const armed = useGameStore((s) => s.armed);
  const arm = useGameStore((s) => s.arm);
  const pressed = sameSource(armed, source);
  return (
    <button
      type="button"
      className="recruit-button"
      disabled={!enabled}
      aria-pressed={pressed}
      title={title}
      onPointerDown={(event) => {
        if (enabled) startPanelDrag(event, source);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          arm(pressed ? null : source);
        }
      }}
    >
      {children}
    </button>
  );
}

const PLACE_HINT = 'Haritaya sürükle ya da dokun, sonra karoya dokun.';

/**
 * Treasury panel of the selected region (GDD 13: region selection → treasury panel): the
 * treasury with a per-resource forecast of the next turn start (the engine's own turn-start
 * code), and for the player on turn the recruit and build buttons: drag one onto the map,
 * or tap it, then a tile.
 */
export function RegionPanel() {
  const game = useGameStore((s) => s.game);
  const tile = useGameStore((s) => s.selectedTile);
  const controllable = useGameStore(canControl);
  const selectTile = useGameStore((s) => s.selectTile);
  if (tile === null) return null;

  const owner = game.owners[tile] ?? null;
  const region = regionAt(getRegions(game), tile);
  const centerTile = region && regionCenter(game, region);
  const center = centerTile === undefined ? undefined : game.centers[centerTile];
  const unitCount = region ? region.tiles.filter((t) => game.units[t]).length : 0;
  const buildingCount = region ? region.tiles.filter((t) => game.buildings[t]).length : 0;
  const hungryCount = region ? region.tiles.filter((t) => game.units[t]?.hungry).length : 0;
  const forecast =
    owner === null ? undefined : turnStartForecast(game, owner).find((f) => f.tiles.includes(tile));
  const warnings = forecast ? forecastWarnings(forecast, game) : [];
  const canAct = controllable && owner === game.currentPlayer && centerTile !== undefined && center;

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
          {region.tiles.length} karo · {unitCount} birim
          {hungryCount > 0 && ` (${hungryCount} aç)`} · {buildingCount} bina ·{' '}
          {center ? `${CENTER_LABELS[center.kind]} #${centerTile}` : 'merkez yok'}
        </p>
      )}
      {region && center && forecast && (
        <dl className="treasury" aria-label="Kasa ve sonraki tur tahmini">
          {RESOURCE_KINDS.map((kind) => {
            const { income, expense, after } = flows(forecast, kind);
            return (
              <div key={kind} className="treasury-item">
                <dt className="hud-label">{RESOURCE_LABELS[kind]}</dt>
                <dd>{center.treasury[kind]}</dd>
                <dd
                  className="treasury-forecast"
                  title={`Sonraki tur başı: +${income} gelir, −${expense} gider → ${after}`}
                >
                  <span className="income">+{income}</span>
                  {expense > 0 && <span className="upkeep">−{expense}</span>}
                  <span className="forecast-after">→ {after}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {region && !center && (
        <p className="hud-meta region-note">
          Tek karo: kasası yok, geliri boşa gider
          {buildingCount > 0 && ', binası çalışmaz'}
          {unitCount > 0 && ', birimi aç kalır, sonra isyan eder'}.
        </p>
      )}
      {warnings.map((text) => (
        <p key={text} className="region-warning">
          {text}
        </p>
      ))}
      {canAct && <RecruitButtons game={game} center={centerTile} />}
      {canAct && <BuildButtons game={game} center={centerTile} />}
    </section>
  );
}

function RecruitButtons({ game, center }: { readonly game: GameState; readonly center: number }) {
  const blockers = new Set<CommandError>();
  const buttons = UNIT_LINES.map((line) => {
    const source: UnitSource = { kind: 'recruit', center, line };
    const { cost, buyLevel } = UNITS[line];
    const check = checkSource(game, source);
    if (!check.ok) blockers.add(check.error);
    const title = check.ok
      ? `${LINE_LABELS[line]}: ${cost} altın. ${PLACE_HINT}`
      : `${LINE_LABELS[line]}: ${COMMAND_ERROR_LABELS[check.error]}`;
    return (
      <HandButton key={line} source={source} enabled={check.ok} title={title}>
        <UnitIcon line={line} level={Math.max(1, buyLevel)} player={game.currentPlayer} />
        <span className="recruit-label">{LINE_LABELS[line]}</span>
        <span className="recruit-cost cost-gold">{cost}</span>
      </HandButton>
    );
  });
  return (
    <>
      <div className="recruit" role="group" aria-label="Asker al">
        {buttons}
      </div>
      {blockers.has('needsBuilding') && (
        <p className="hud-meta region-note">Piyade için bölgede çalışan bir kışla gerekir.</p>
      )}
    </>
  );
}

function BuildButtons({ game, center }: { readonly game: GameState; readonly center: number }) {
  const player = game.currentPlayer;
  const kinds = BUILDING_KINDS.filter((kind) => buildingUnlocked(game, player, kind));
  return (
    <div className="build" role="group" aria-label="Bina kur">
      {kinds.map((building) => {
        const source: BuildSource = { kind: 'build', center, building };
        const { cost } = BUILDINGS[building];
        const check = checkBuildSource(game, source);
        const fits = check.ok && buildOptions(game, source).some((o) => o.check.ok);
        const name = BUILDING_LABELS[building];
        const reason = !check.ok
          ? COMMAND_ERROR_LABELS[check.error]
          : fits
            ? PLACE_HINT
            : 'Bölgede uygun karo yok.';
        return (
          <HandButton
            key={building}
            source={source}
            enabled={fits}
            title={`${name}: ${cost} malzeme, bakım ${BUILDINGS[building].upkeep} altın. ${BUILDING_HINTS[building]} ${reason}`}
          >
            <BuildingIcon building={building} player={player} />
            <span className="recruit-label">{name}</span>
            <span className="recruit-cost cost-materials">{cost}</span>
          </HandButton>
        );
      })}
    </div>
  );
}
