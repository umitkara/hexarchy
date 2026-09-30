import type { Point, Rect } from '@hexarchy/engine';
import type { Container } from 'pixi.js';

export interface CameraOptions {
  /** Screen-space padding kept around the world bounds when fitting. */
  readonly fitPadding: number;
  /** How far below the "fit whole map" zoom the user may zoom out (0..1). */
  readonly minZoomOfFit: number;
  /** Maximum zoom (world units -> screen pixels). */
  readonly maxZoom: number;
}

/**
 * 2D camera: the world point at the screen center plus a zoom factor.
 *
 * A custom camera instead of pixi-viewport: pixi-viewport's last release (6.0.3, 2024) and
 * repository activity predate current Pixi 8.x, and the game needs full control over
 * pointer gestures anyway (unit drag vs. pan in M3). The math is small.
 *
 * Bounds: the view center is clamped so the world bounds never leave the screen edge;
 * along an axis where the whole world fits on screen, it stays centered.
 */
export class Camera {
  #x = 0;
  #y = 0;
  #zoom = 1;
  #viewWidth = 1;
  #viewHeight = 1;
  #bounds: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  #minZoom = 0.01;
  #maxZoom: number;
  readonly #options: CameraOptions;
  readonly #onChange: () => void;

  constructor(options: CameraOptions, onChange: () => void) {
    this.#options = options;
    this.#maxZoom = options.maxZoom;
    this.#onChange = onChange;
  }

  get zoom(): number {
    return this.#zoom;
  }

  setViewport(width: number, height: number): void {
    this.#viewWidth = Math.max(1, width);
    this.#viewHeight = Math.max(1, height);
    this.#update();
  }

  setWorldBounds(bounds: Rect): void {
    this.#bounds = bounds;
    this.#update();
  }

  /** Zoom and center so the whole world bounds are visible. */
  fit(): void {
    this.#zoom = this.#fitZoom();
    this.#x = (this.#bounds.minX + this.#bounds.maxX) / 2;
    this.#y = (this.#bounds.minY + this.#bounds.maxY) / 2;
    this.#update();
  }

  screenToWorld(screen: Point): Point {
    return {
      x: (screen.x - this.#viewWidth / 2) / this.#zoom + this.#x,
      y: (screen.y - this.#viewHeight / 2) / this.#zoom + this.#y,
    };
  }

  worldToScreen(world: Point): Point {
    return {
      x: (world.x - this.#x) * this.#zoom + this.#viewWidth / 2,
      y: (world.y - this.#y) * this.#zoom + this.#viewHeight / 2,
    };
  }

  /** Centers the view on a world point, keeping the zoom (clamped to the bounds). */
  centerOn(world: Point): void {
    this.#x = world.x;
    this.#y = world.y;
    this.#update();
  }

  /** Moves the view by a screen-space delta (dragging right moves the world right). */
  panBy(dx: number, dy: number): void {
    this.#x -= dx / this.#zoom;
    this.#y -= dy / this.#zoom;
    this.#update();
  }

  /** Zooms by `factor`, keeping the world point under `screen` fixed. */
  zoomAt(screen: Point, factor: number): void {
    const anchor = this.screenToWorld(screen);
    this.#zoom = clamp(this.#zoom * factor, this.#minZoom, this.#maxZoom);
    this.#x = anchor.x - (screen.x - this.#viewWidth / 2) / this.#zoom;
    this.#y = anchor.y - (screen.y - this.#viewHeight / 2) / this.#zoom;
    this.#update();
  }

  applyTo(container: Container): void {
    container.scale.set(this.#zoom);
    container.position.set(
      this.#viewWidth / 2 - this.#x * this.#zoom,
      this.#viewHeight / 2 - this.#y * this.#zoom,
    );
  }

  #fitZoom(): number {
    const padding = this.#options.fitPadding * 2;
    const width = this.#bounds.maxX - this.#bounds.minX;
    const height = this.#bounds.maxY - this.#bounds.minY;
    return Math.min(
      Math.max(1, this.#viewWidth - padding) / width,
      Math.max(1, this.#viewHeight - padding) / height,
    );
  }

  #update(): void {
    this.#minZoom = Math.min(this.#fitZoom() * this.#options.minZoomOfFit, this.#options.maxZoom);
    this.#maxZoom = Math.max(this.#options.maxZoom, this.#minZoom);
    this.#zoom = clamp(this.#zoom, this.#minZoom, this.#maxZoom);
    this.#x = clampAxis(
      this.#x,
      this.#bounds.minX,
      this.#bounds.maxX,
      this.#viewWidth / this.#zoom,
    );
    this.#y = clampAxis(
      this.#y,
      this.#bounds.minY,
      this.#bounds.maxY,
      this.#viewHeight / this.#zoom,
    );
    this.#onChange();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps a view center so [min, max] covers the view, or centers it if it cannot. */
function clampAxis(center: number, min: number, max: number, viewSize: number): number {
  const low = min + viewSize / 2;
  const high = max - viewSize / 2;
  return low > high ? (min + max) / 2 : clamp(center, low, high);
}
