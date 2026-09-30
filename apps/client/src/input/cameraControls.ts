import type { Point } from '@hexarchy/engine';

/** What the controls drive (implemented by render/camera.ts). */
export interface PanZoomTarget {
  panBy(dx: number, dy: number): void;
  zoomAt(screen: Point, factor: number): void;
}

/** A drag claimed by the game (e.g. a unit), instead of panning the camera. */
export interface DragHandler {
  move(screen: Point): void;
  end(screen: Point): void;
  cancel(): void;
}

export interface CameraControlsOptions {
  readonly element: HTMLElement;
  readonly camera: PanZoomTarget;
  /** Mouse hover over the element (null when the pointer leaves or a drag starts). */
  readonly onHover: (screen: Point | null) => void;
  /** A click or tap that did not turn into a drag or pinch. */
  readonly onTap: (screen: Point) => void;
  /**
   * Called when a one-finger press turns into a drag, with the press position: return a
   * handler to drag something (a unit) there, or null to pan the camera.
   */
  readonly beginDrag?: (pressed: Point) => DragHandler | null;
}

/** Movement (px) before a press becomes a drag; touch is less precise than a mouse. */
const DRAG_THRESHOLD = { mouse: 5, touch: 10 } as const;
/** Zoom per wheel pixel; trackpad pinch (ctrl + wheel) sends small deltas, so boost it. */
const WHEEL_ZOOM_SPEED = 0.0015;
const PINCH_WHEEL_ZOOM_SPEED = 0.01;
/** Inertia: velocity decay per millisecond and the speed (px/ms) at which it stops. */
const INERTIA_FRICTION = 0.995;
const INERTIA_MIN_SPEED = 0.02;
/** Only pointer movement from this recent window (ms) counts toward the release velocity. */
const VELOCITY_WINDOW = 100;

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

/**
 * Pan (drag), zoom (wheel at cursor, two-finger pinch), game drags (units) and tap/hover
 * for the map canvas. One code path for mouse, pen and touch via Pointer Events.
 */
export function attachCameraControls(options: CameraControlsOptions): () => void {
  const { element, camera, onHover, onTap, beginDrag } = options;
  const pointers = new Map<number, Point>();
  let pressStart: Point | null = null;
  let dragging = false;
  /** The game drag in progress, if the current drag is not a pan. */
  let gameDrag: DragHandler | null = null;
  /** Set once a gesture involved two pointers; suppresses the tap on release. */
  let multiTouch = false;
  let samples: Sample[] = [];
  let inertiaFrame = 0;

  const local = (event: PointerEvent | WheelEvent): Point => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const stopInertia = () => {
    cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
  };

  const startInertia = () => {
    const now = performance.now();
    const recent = samples.filter((s) => now - s.time <= VELOCITY_WINDOW);
    const first = recent[0];
    const last = recent.at(-1);
    samples = [];
    if (!first || !last || last.time - first.time < 8) return;
    let vx = (last.x - first.x) / (last.time - first.time);
    let vy = (last.y - first.y) / (last.time - first.time);
    let previous = now;
    const step = (time: number) => {
      const dt = Math.min(time - previous, 50);
      previous = time;
      const decay = INERTIA_FRICTION ** dt;
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < INERTIA_MIN_SPEED) {
        inertiaFrame = 0;
        return;
      }
      camera.panBy(vx * dt, vy * dt);
      inertiaFrame = requestAnimationFrame(step);
    };
    inertiaFrame = requestAnimationFrame(step);
  };

  const centroid = (): Point => {
    let x = 0;
    let y = 0;
    for (const p of pointers.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / pointers.size, y: y / pointers.size };
  };

  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stopInertia();
    element.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.set(event.pointerId, point);
    samples = [{ ...point, time: event.timeStamp }];
    if (pointers.size === 1) {
      pressStart = point;
      dragging = false;
      multiTouch = false;
    } else {
      // A second finger turns any drag into a pinch.
      gameDrag?.cancel();
      gameDrag = null;
      multiTouch = true;
      dragging = true;
      onHover(null);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    const point = local(event);
    if (!previous) {
      if (event.pointerType === 'mouse') onHover(point);
      return;
    }

    if (pointers.size >= 2) {
      // Pinch: zoom by the change in finger spread around the old centroid, then pan by
      // the centroid's movement. Works for any pair of simultaneous moves.
      const oldCenter = centroid();
      const oldSpread = spread();
      pointers.set(event.pointerId, point);
      const newCenter = centroid();
      const newSpread = spread();
      if (oldSpread > 0 && newSpread > 0) camera.zoomAt(oldCenter, newSpread / oldSpread);
      camera.panBy(newCenter.x - oldCenter.x, newCenter.y - oldCenter.y);
      return;
    }

    pointers.set(event.pointerId, point);
    if (!dragging && pressStart) {
      const threshold = event.pointerType === 'mouse' ? DRAG_THRESHOLD.mouse : DRAG_THRESHOLD.touch;
      if (Math.hypot(point.x - pressStart.x, point.y - pressStart.y) < threshold) return;
      dragging = true;
      gameDrag = multiTouch ? null : (beginDrag?.(pressStart) ?? null);
      if (!gameDrag) onHover(null);
    }
    if (gameDrag) {
      gameDrag.move(point);
      return;
    }
    camera.panBy(point.x - previous.x, point.y - previous.y);
    samples.push({ ...point, time: event.timeStamp });
    if (samples.length > 20) samples.shift();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event);
    pointers.delete(event.pointerId);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);

    if (pointers.size === 1) {
      // Pinch -> one finger: keep panning from the remaining finger without a jump.
      const remaining = [...pointers.values()][0] ?? point;
      samples = [{ ...remaining, time: event.timeStamp }];
      return;
    }
    if (pointers.size > 0) return;

    const cancelled = event.type === 'pointercancel';
    if (gameDrag) {
      if (cancelled) gameDrag.cancel();
      else gameDrag.end(point);
      gameDrag = null;
    } else if (!dragging && !multiTouch && !cancelled) onTap(point);
    else if (dragging && !cancelled) startInertia();
    if (event.pointerType === 'mouse' && !cancelled) onHover(point);
    pressStart = null;
    dragging = false;
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && pointers.size === 0) onHover(null);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    stopInertia();
    // Normalize line/page deltas to pixels.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    const speed = event.ctrlKey ? PINCH_WHEEL_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
    const factor = Math.exp(-event.deltaY * unit * speed);
    camera.zoomAt(local(event), Math.min(2, Math.max(0.5, factor)));
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  element.addEventListener('pointerleave', onPointerLeave);
  element.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    stopInertia();
    gameDrag?.cancel();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerUp);
    element.removeEventListener('pointerleave', onPointerLeave);
    element.removeEventListener('wheel', onWheel);
  };
}
