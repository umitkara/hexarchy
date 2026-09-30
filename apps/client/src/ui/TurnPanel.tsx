import { useGameStore } from '../store/gameStore';
import { playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Round, whose turn it is, and the end-turn button. */
export function TurnPanel() {
  const round = useGameStore((s) => s.game.round);
  const current = useGameStore((s) => s.game.currentPlayer);
  const human = useGameStore((s) => s.game.players[current]?.controller === 'human');
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <section className="hud-panel turn-panel" aria-label="Tur">
      <div className="turn-info" aria-live="polite">
        <span className="hud-label">Tur {round}</span>
        <span className="turn-player">
          <PlayerSwatch player={current} />
          {playerName(current)}
          {human && <span className="hud-meta">(sen)</span>}
        </span>
      </div>
      <button
        type="button"
        className="hud-button"
        onClick={() => {
          dispatch({ type: 'endTurn' });
        }}
      >
        Turu bitir
      </button>
    </section>
  );
}
