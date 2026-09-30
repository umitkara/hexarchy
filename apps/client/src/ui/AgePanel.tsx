import {
  advanceTarget,
  ageCost,
  ageUnlocks,
  capitalOf,
  checkAdvanceAge,
  LEVEL_CAP,
  RESOURCE_KINDS,
  type Age,
  type GameState,
  type PlayerId,
} from '@hexarchy/engine';
import { canControl, useGameStore } from '../store/gameStore';
import { BuildingIcon } from './BuildingIcon';
import {
  AGE_DATIVE_LABELS,
  AGE_LABELS,
  AGE_SHORT_LABELS,
  BUILDING_LABELS,
  COMMAND_ERROR_LABELS,
  LINE_LABELS,
  playerName,
  RESOURCE_LABELS,
  STRUCTURE_LABELS,
} from './labels';
import { PlayerSwatch } from './PlayerSwatch';
import { StructureIcon } from './StructureIcon';
import { UnitIcon } from './UnitIcon';

/** The age the player is heading for: the one being advanced to, or the next one. */
function targetAge(game: GameState, player: PlayerId): Age | undefined {
  return game.players[player]?.advancing ?? advanceTarget(game, player);
}

/**
 * Age button of the turn panel: the current player's age, the advance in progress, and a
 * mark when the next age is affordable. Opens the age panel.
 */
export function AgeChip() {
  const game = useGameStore((s) => s.game);
  const open = useGameStore((s) => s.agePanelOpen);
  const controllable = useGameStore(canControl);
  const setOpen = useGameStore((s) => s.setAgePanelOpen);
  const player = game.players[game.currentPlayer];
  if (!player) return null;
  const ready = controllable && checkAdvanceAge(game, player.id).ok;
  return (
    <button
      type="button"
      className={ready ? 'age-chip age-chip-ready' : 'age-chip'}
      aria-expanded={open}
      title={
        player.advancing
          ? `${AGE_DATIVE_LABELS[player.advancing]} geçiliyor: sonraki turunun başında gelir.`
          : ready
            ? 'Sonraki çağa geçebilirsin.'
            : 'Çağ: fiyat ve açılacaklar'
      }
      onClick={() => {
        setOpen(!open);
      }}
    >
      <span className="age-chip-name">
        <span className="age-long">{AGE_LABELS[player.age]}</span>
        <span className="age-short" aria-hidden="true">
          {AGE_SHORT_LABELS[player.age]}
        </span>
      </span>
      {player.advancing && (
        <span className="age-chip-next">
          <span aria-hidden="true">⏳</span>{' '}
          <span className="age-long">{AGE_LABELS[player.advancing]}</span>
          <span className="age-short" aria-hidden="true">
            {AGE_SHORT_LABELS[player.advancing]}
          </span>
        </span>
      )}
      {ready && <span className="age-chip-dot" aria-label="(geçilebilir)" />}
    </button>
  );
}

/**
 * Advancing the age (GDD 9.1): the price against the capital treasury, the one-turn
 * transition, and what the next age unlocks.
 */
export function AgePanel() {
  const open = useGameStore((s) => s.agePanelOpen);
  const game = useGameStore((s) => s.game);
  const controllable = useGameStore(canControl);
  const dispatch = useGameStore((s) => s.dispatch);
  const setOpen = useGameStore((s) => s.setAgePanelOpen);
  if (!open) return null;

  const player = game.currentPlayer;
  const info = game.players[player];
  if (!info) return null;
  const target = targetAge(game, player);
  const cost = target && ageCost(target);
  const check = checkAdvanceAge(game, player);
  const capital = capitalOf(game, player);
  const treasury = capital === undefined ? undefined : game.centers[capital]?.treasury;
  const unlocks = target && ageUnlocks(target);

  return (
    <section className="hud-panel age-panel" aria-label="Çağ">
      <header className="region-header">
        <PlayerSwatch player={player} />
        <strong>
          {playerName(player)}: {AGE_LABELS[info.age]}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Kapat"
          onClick={() => {
            setOpen(false);
          }}
        >
          ×
        </button>
      </header>

      {!target && <p className="hud-meta region-note">Bu sürümün son çağındasın.</p>}

      {target && info.advancing && (
        <p className="age-status">
          {AGE_DATIVE_LABELS[target]} geçiliyor: sonraki turunun başında gelir.
        </p>
      )}

      {target && cost && !info.advancing && (
        <>
          <p className="hud-meta region-note">
            {AGE_LABELS[target]}: başkent kasasından ödenir, 1 tur sürer (sonraki turunun başında
            gelir).
          </p>
          <dl className="treasury age-cost" aria-label="Başkent kasası ve fiyat">
            {RESOURCE_KINDS.map((kind) => {
              const have = treasury?.[kind] ?? 0;
              const short = have < cost[kind];
              return (
                <div key={kind} className="treasury-item">
                  <dt className="hud-label">{RESOURCE_LABELS[kind]}</dt>
                  <dd title={`Başkent kasasında ${have}, gereken ${cost[kind]}`}>
                    <span className={short ? 'age-short' : undefined}>{have}</span>
                    <span className="forecast-after">/ {cost[kind]}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <button
            type="button"
            className="hud-button"
            disabled={!controllable || !check.ok}
            title={check.ok ? undefined : COMMAND_ERROR_LABELS[check.error]}
            onClick={() => {
              dispatch({ type: 'advanceAge' });
            }}
          >
            {AGE_DATIVE_LABELS[target]} geç
          </button>
          {!check.ok && controllable && (
            <p className="region-warning">{COMMAND_ERROR_LABELS[check.error]}</p>
          )}
        </>
      )}

      {target && unlocks && (
        <>
          <p className="hud-label age-unlocks-title">{AGE_LABELS[target]} açar</p>
          <ul className="age-unlocks">
            {unlocks.lines.map((line) => (
              <li key={line}>
                <UnitIcon line={line} level={1} player={player} size={24} />
                {LINE_LABELS[line]}
              </li>
            ))}
            {unlocks.buildings.map((building) => (
              <li key={building}>
                <BuildingIcon building={building} player={player} size={24} />
                {BUILDING_LABELS[building]}
              </li>
            ))}
            {unlocks.structures.map((structure) => (
              <li key={structure}>
                <StructureIcon structure={structure} player={player} size={24} />
                {STRUCTURE_LABELS[structure]}
              </li>
            ))}
            {unlocks.levelCap > LEVEL_CAP[info.age] && (
              <li className="age-unlock-cap">
                Birleştirme Sv{LEVEL_CAP[info.age]} → Sv{unlocks.levelCap}
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
