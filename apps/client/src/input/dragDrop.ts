import type { Point, UnitSource } from '@hexarchy/engine';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { gameStore } from '../store/gameStore';

/**
 * Drag and drop from the HUD onto the map (GDD 13: recruit by dragging from the panel,
 * like Konkr). The scene registers how screen points map to canvas points and tiles.
 * A press that does not move far is a click: it arms the unit for tap-to-place instead.
 */

export interface MapPicker {
  /** Canvas-relative point for a client (viewport) point, or null if off the canvas. */
  readonly toCanvas: (clientX: number, clientY: number) => Point | null;
  readonly tileAt: (canvas: Point) => number | null;
}

let picker: MapPicker | null = null;

/** Called by the scene; returns the unregister function. */
export function registerMapPicker(next: MapPicker): () => void {
  picker = next;
  return () => {
    if (picker === next) picker = null;
  };
}

/** Movement (px) before a press on a panel button becomes a drag. */
const DRAG_THRESHOLD = 8;

/** Starts a drag (or, without movement, a click) from a HUD button. */
export function startPanelDrag(event: ReactPointerEvent<HTMLElement>, source: UnitSource): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  const pointerId = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let dragging = false;

  const locate = (e: PointerEvent) => {
    const canvas = picker?.toCanvas(e.clientX, e.clientY) ?? null;
    return { canvas, tile: canvas && picker ? picker.tileAt(canvas) : null };
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
      dragging = true;
      gameStore.getState().startDrag(source);
    }
    const { canvas, tile } = locate(e);
    gameStore.getState().updateDrag(canvas, tile);
  };

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    const store = gameStore.getState();
    if (!dragging) {
      if (e.type === 'pointerup') {
        const armed = store.armed;
        const same =
          armed?.kind === 'recruit' &&
          source.kind === 'recruit' &&
          armed.line === source.line &&
          armed.center === source.center;
        store.arm(same ? null : source);
      }
      return;
    }
    store.endDrag(e.type === 'pointerup' ? locate(e).tile : null);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
