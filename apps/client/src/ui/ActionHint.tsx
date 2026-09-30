import { useGameStore, type HandSource } from '../store/gameStore';
import { sourceUnit } from '../render/targetGraphics';
import type { GameState } from '@hexarchy/engine';
import { BUILDING_LABELS, STRUCTURE_LABELS, unitName } from './labels';

/** What is in hand, and where to put it: `[what, where]`, or null if nothing to show. */
function describe(game: GameState, source: HandSource): readonly [string, string] | null {
  if (source.kind === 'build') {
    return [`Yeni ${BUILDING_LABELS[source.building].toLowerCase()}`, 'yeşil bir karoya'];
  }
  const unit = sourceUnit(game, source);
  if (!unit) return null;
  switch (source.kind) {
    case 'recruit':
      return [`Yeni ${unitName(unit)}`, 'hedef karoya'];
    case 'unit':
      return [unitName(unit), 'hedef karoya'];
    case 'edge':
      return [`${STRUCTURE_LABELS[source.structure]} (${unitName(unit)})`, 'yeşil bir kenara'];
    case 'breach':
      return [`Kır (${unitName(unit)})`, 'kırmızı bir kenara'];
    case 'volley':
      return [`Baskı atışı (${unitName(unit)})`, 'bir düşman birimine'];
  }
}

/**
 * Shown while a unit, building or unit action is in hand (tapped or dragged): what to do
 * next, and a cancel button.
 */
export function ActionHint() {
  const game = useGameStore((s) => s.game);
  const armed = useGameStore((s) => s.armed);
  const drag = useGameStore((s) => s.drag);
  const arm = useGameStore((s) => s.arm);
  const source = drag?.source ?? armed;
  const described = source && describe(game, source);
  if (!described) return null;
  const [what, where] = described;
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
