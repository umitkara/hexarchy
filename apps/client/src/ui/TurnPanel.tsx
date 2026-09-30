import { canUndo } from '@hexarchy/engine';
import { useGameStore } from '../store/gameStore';
import { playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Round, whose turn it is, in-turn undo and the end-turn button. */
export function TurnPanel() {
  const round = useGameStore((s) => s.game.round);
  const current = useGameStore((s) => s.game.currentPlayer);
  const human = useGameStore((s) => s.game.players[current]?.controller === 'human');
  const hotseat = useGameStore((s) => s.hotseat);
  const undoable = useGameStore((s) => canUndo(s.history));
  const dispatch = useGameStore((s) => s.dispatch);
  const undo = useGameStore((s) => s.undo);
  const undoTurn = useGameStore((s) => s.undoTurn);

  return (
    <section className="hud-panel turn-panel" aria-label="Tur">
      <div className="turn-info" aria-live="polite">
        <span className="hud-label">Tur {round}</span>
        <span className="turn-player">
          <PlayerSwatch player={current} />
          {playerName(current)}
          {hotseat ? (
            <span className="hud-meta">(hotseat)</span>
          ) : (
            human && <span className="hud-meta">(sen)</span>
          )}
        </span>
      </div>
      <div className="turn-actions">
        <button
          type="button"
          className="hud-button hud-button-secondary"
          disabled={!undoable}
          aria-label="Geri al"
          title="Son hamleyi geri al (Ctrl+Z)"
          onClick={undo}
        >
          <span className="button-icon" aria-hidden="true">
            ↶
          </span>
          <span className="button-text">Geri al</span>
        </button>
        <button
          type="button"
          className="hud-button hud-button-secondary"
          disabled={!undoable}
          aria-label="Tur başına dön"
          title="Bu turdaki tüm hamleleri geri al"
          onClick={undoTurn}
        >
          <span className="button-icon" aria-hidden="true">
            ⏮
          </span>
          <span className="button-text">Tur başına dön</span>
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            dispatch({ type: 'endTurn' });
          }}
        >
          Turu bitir
        </button>
      </div>
    </section>
  );
}
