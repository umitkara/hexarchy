import { isAiTurn, useGameStore } from '../store/gameStore';
import { playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** While the AI plays: whose turn it is and a button to skip the rest of the AI turns. */
export function AiBanner() {
  const playing = useGameStore(isAiTurn);
  const current = useGameStore((s) => s.game.currentPlayer);
  const fast = useGameStore((s) => s.aiFast);
  const skipAi = useGameStore((s) => s.skipAi);
  if (!playing) return null;
  return (
    <div className="hud-panel ai-banner" role="status">
      <PlayerSwatch player={current} />
      <span>{playerName(current)} oynuyor</span>
      <button
        type="button"
        className="hud-button hud-button-secondary"
        disabled={fast}
        title="AI turlarını beklemeden oynat"
        onClick={skipAi}
      >
        {fast ? 'Atlanıyor…' : 'Atla'}
      </button>
    </div>
  );
}
