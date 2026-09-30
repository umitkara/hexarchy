import {
  breachOptions,
  BUILDING_KINDS,
  BUILDINGS,
  buildingUnlocked,
  buildOptions,
  canBreach,
  checkBuildSource,
  checkEdgeBuildSource,
  checkSource,
  edgeBuildOptions,
  getRegions,
  lineUnlocked,
  regionAt,
  regionCenter,
  RESOURCE_KINDS,
  STRUCTURE_KINDS,
  STRUCTURES,
  structureUnlocked,
  turnStartForecast,
  UNIT_LINES,
  UNITS,
  UPKEEP,
  volleyOptions,
  type BreachSource,
  type BuildSource,
  type EdgeBuildSource,
  type GameState,
  type RegionTurnStart,
  type Resources,
  type UnitLine,
  type UnitSource,
  type VolleySource,
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
  LINE_HINTS,
  LINE_LABELS,
  playerName,
  RESOURCE_LABELS,
  STRUCTURE_HINTS,
  STRUCTURE_LABELS,
  unitName,
} from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { StructureIcon } from './StructureIcon';
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
const EDGE_HINT = 'Dokun, sonra birimin karosunun bir kenarına ya da komşu karoya dokun.';

/**
 * Treasury panel of the selected region (GDD 13: region selection → treasury panel): the
 * treasury with a per-resource forecast of the next turn start (the engine's own turn-start
 * code), and for the player on turn the selected unit's actions and the recruit and build
 * buttons: drag one onto the map, or tap it, then a tile.
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
  const own = controllable && owner === game.currentPlayer;
  const canAct = own && centerTile !== undefined && center;
  const unit = game.units[tile];

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
      {own && unit && !unit.exhausted && <UnitActions game={game} tile={tile} />}
      {canAct && <RecruitButtons game={game} center={centerTile} />}
      {canAct && <BuildButtons game={game} center={centerTile} />}
    </section>
  );
}

/**
 * What the selected unit can do besides moving: a worker builds edge structures, an archer
 * shoots a volley, a ram (or a Sv3+ unit, at fences) strikes structures. Each button arms
 * the action and its targets light up on the map.
 */
function UnitActions({ game, tile }: { readonly game: GameState; readonly tile: number }) {
  const unit = game.units[tile];
  if (!unit) return null;
  const player = game.currentPlayer;
  const line = UNITS[unit.line];
  const buttons: ReactNode[] = [];

  if (line.buildsEdges) {
    for (const structure of STRUCTURE_KINDS) {
      if (!structureUnlocked(game, player, structure)) continue;
      const source: EdgeBuildSource = { kind: 'edge', from: tile, structure };
      const check = checkEdgeBuildSource(game, source);
      const fits = check.ok && edgeBuildOptions(game, source).some((o) => o.check.ok);
      const name = STRUCTURE_LABELS[structure];
      const { cost } = STRUCTURES[structure];
      const reason = !check.ok
        ? COMMAND_ERROR_LABELS[check.error]
        : fits
          ? EDGE_HINT
          : 'Bu karonun kenarlarında uygun yer yok.';
      buttons.push(
        <HandButton
          key={structure}
          source={source}
          enabled={fits}
          title={`${name}: ${cost} malzeme. ${STRUCTURE_HINTS[structure]} ${reason}`}
        >
          <StructureIcon structure={structure} player={player} />
          <span className="recruit-label">{name}</span>
          <span className="recruit-cost cost-materials">{cost}</span>
        </HandButton>,
      );
    }
  }
  if (line.volley) {
    const source: VolleySource = { kind: 'volley', from: tile };
    const targets = volleyOptions(game, source).filter((o) => o.check.ok).length;
    const reason = targets > 0 ? 'Dokun, sonra hedefe dokun.' : 'Menzilde hedef yok.';
    buttons.push(
      <HandButton
        key="volley"
        source={source}
        enabled={targets > 0}
        title={`Baskı atışı: 2 karo içindeki bir düşman birimi tur sonuna dek −1 güç. ${reason}`}
      >
        <UnitIcon line={unit.line} level={unit.level} player={player} />
        <span className="recruit-label">Baskı atışı</span>
      </HandButton>,
    );
  }
  if (canBreach(unit)) {
    const source: BreachSource = { kind: 'breach', from: tile };
    const targets = breachOptions(game, source).filter((o) => o.check.ok).length;
    const what = line.siege ? 'kenar yapısına bir vuruş' : 'düşman çitini yıkar';
    const reason = targets > 0 ? EDGE_HINT : 'Kenarlarda kırılacak düşman yapısı yok.';
    buttons.push(
      <HandButton
        key="breach"
        source={source}
        enabled={targets > 0}
        title={`Kır: ${what}; birim yerinde kalır. ${reason}`}
      >
        <UnitIcon line={unit.line} level={unit.level} player={player} />
        <span className="recruit-label">Kır</span>
      </HandButton>,
    );
  }
  if (buttons.length === 0) return null;
  return (
    <>
      <p className="hud-meta region-note" title={LINE_HINTS[unit.line]}>
        {unitName(unit)} eylemleri
      </p>
      <div className="recruit" role="group" aria-label="Birim eylemleri">
        {buttons}
      </div>
    </>
  );
}

function RecruitButtons({ game, center }: { readonly game: GameState; readonly center: number }) {
  const player = game.currentPlayer;
  const missing: UnitLine[] = [];
  const lines = UNIT_LINES.filter((line) => lineUnlocked(game, player, line));
  const buttons = lines.map((line) => {
    const source: UnitSource = { kind: 'recruit', center, line };
    const { cost, buyLevel } = UNITS[line];
    const check = checkSource(game, source);
    if (!check.ok && check.error === 'needsBuilding') missing.push(line);
    const title = check.ok
      ? `${LINE_LABELS[line]}: ${cost} altın. ${LINE_HINTS[line]} ${PLACE_HINT}`
      : `${LINE_LABELS[line]}: ${COMMAND_ERROR_LABELS[check.error]}`;
    return (
      <HandButton key={line} source={source} enabled={check.ok} title={title}>
        <UnitIcon line={line} level={Math.max(1, buyLevel)} player={player} />
        <span className="recruit-label">{LINE_LABELS[line]}</span>
        <span className="recruit-cost cost-gold">{cost}</span>
      </HandButton>
    );
  });
  const needs = missing.flatMap((line) => {
    const building = UNITS[line].requires;
    return building ? [`${LINE_LABELS[line]}: ${BUILDING_LABELS[building].toLowerCase()}`] : [];
  });
  return (
    <>
      <div className="recruit" role="group" aria-label="Asker al">
        {buttons}
      </div>
      {needs.length > 0 && (
        <p className="hud-meta region-note">Bölgede çalışan bina gerekir · {needs.join(' · ')}</p>
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
