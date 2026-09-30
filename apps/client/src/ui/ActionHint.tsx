import { useGameStore } from '../store/gameStore';
import { sourceUnit } from '../render/targetGraphics';
import { BUILDING_LABELS, unitName } from './labels';

/**
 * Shown while a unit or building is in hand (tapped or dragged): what to do next, and a
 * cancel button.
 */
export function ActionHint() {
  const game = useGameStore((s) => s.game);
  const armed = useGameStore((s) => s.armed);
  const drag = useGameStore((s) => s.drag);
  const arm = useGameStore((s) => s.arm);
  const source = drag?.source ?? armed;
  if (!source) return null;
  const unit = sourceUnit(game, source);
  let what: string;
  if (source.kind === 'build') what = `Yeni ${BUILDING_LABELS[source.building].toLowerCase()}`;
  else if (!unit) return null;
  else what = source.kind === 'recruit' ? `Yeni ${unitName(unit)}` : unitName(unit);
  const where = source.kind === 'build' ? 'yeşil bir karoya' : 'hedef karoya';
  const how = `${where} ${drag ? 'bırak' : 'dokun'}`;
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
