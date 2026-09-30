import { useGameStore } from '../store/gameStore';
import { sourceUnit } from '../render/targetGraphics';
import { unitName } from './labels';

/** Shown while a unit is in hand (tapped or dragged): what to do next, and a cancel button. */
export function ActionHint() {
  const game = useGameStore((s) => s.game);
  const armed = useGameStore((s) => s.armed);
  const drag = useGameStore((s) => s.drag);
  const arm = useGameStore((s) => s.arm);
  const source = drag?.source ?? armed;
  const unit = source && sourceUnit(game, source);
  if (!source || !unit) return null;

  const what = source.kind === 'recruit' ? `Yeni ${unitName(unit)}` : unitName(unit);
  const how = drag ? 'hedef karoya bırak' : 'hedef karoya dokun';
  return (
    <section className="hud-panel action-hint" aria-live="polite">
      <span>
        <strong>{what}</strong> · {how}
      </span>
      {!drag && (
        <button
          type="button"
          className="hud-button hud-button-secondary"
          onClick={() => {
            arm(null);
          }}
        >
          Vazgeç
        </button>
      )}
    </section>
  );
}
