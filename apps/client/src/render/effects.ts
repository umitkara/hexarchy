import {
  axialToPixel,
  capitalOf,
  hexPolygon,
  mapGrid,
  type EdgeKey,
  type GameEvent,
  type GameState,
  type Point,
  type Unit,
} from '@hexarchy/engine';
import { Graphics, type Container, type Ticker } from 'pixi.js';
import type { EventFeed } from '../store/gameStore';
import { edgeSegment, TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';
import { tileLayout } from './tileLayout';
import { drawUnitToken } from './unitGraphics';

/**
 * Short animations of the game events (PLAN M8): a moved unit slides, a bought one pops
 * in, a taken tile flashes in its new owner's color, a killed unit fades, new buildings and
 * structures pop a ring, a volley flies, an age or a fallen capital sends a wave. Purely
 * visual: the state has already changed; while a unit slides or pops in, its tile is left
 * out of the units layer (`hidden`).
 */

/** Durations (ms). */
const SLIDE_MS = 200;
const POP_MS = 260;
const FLASH_MS = 480;
const FADE_MS = 320;
const RING_MS = 380;
const VOLLEY_MS = 220;
const WAVE_MS = 900;

interface Anim {
  /** Start time (ms, ticker clock) and duration. */
  readonly start: number;
  readonly duration: number;
  /** Tile left out of the units layer until the animation ends. */
  readonly hides?: number;
  /** Draws the frame at progress `t` (0..1). */
  readonly draw: (g: Graphics, t: number) => void;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

type Of<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export class Effects {
  readonly #g = new Graphics();
  readonly #ticker: Ticker;
  readonly #onHiddenChange: () => void;
  #anims: Anim[] = [];
  #hidden: ReadonlySet<number> = new Set();
  #running = false;

  constructor(layer: Container, ticker: Ticker, onHiddenChange: () => void) {
    layer.addChild(this.#g);
    this.#ticker = ticker;
    this.#onHiddenChange = onHiddenChange;
  }

  /** Tiles whose unit the units layer should leave out (it is being animated). */
  get hidden(): ReadonlySet<number> {
    return this.#hidden;
  }

  /** Plays the events of a command; `before` is the state the command was applied to. */
  play(feed: EventFeed, before: GameState, after: GameState): void {
    const now = performance.now();
    const grid = mapGrid(after.map);
    const centerOf = (tile: number) => axialToPixel(grid.coord(tile), TILE_SIZE);
    const unitSlot = (game: GameState, tile: number) =>
      tileLayout(game, tile, centerOf(tile)).unit ?? { point: centerOf(tile), scale: 1 };
    const add = (anim: Omit<Anim, 'start'> & { readonly delay?: number }) => {
      this.#anims.push({ ...anim, start: now + (anim.delay ?? 0) });
    };

    const merged = new Set(feed.events.flatMap((e) => (e.type === 'unitsMerged' ? [e.tile] : [])));
    // Effects at the destination of a slide wait for the unit to arrive.
    const slides = !feed.dragged && feed.events.some((e) => e.type === 'unitMoved');
    const arrival = slides ? SLIDE_MS : 0;

    for (const event of feed.events) {
      switch (event.type) {
        case 'unitMoved': {
          const unit = before.units[event.from];
          const owner = before.owners[event.from];
          if (feed.dragged || !unit || owner === null || owner === undefined) break;
          this.#slide(add, unitSlot(before, event.from), unitSlot(after, event.to), unit, owner, {
            hides: merged.has(event.to) ? undefined : event.to,
          });
          break;
        }
        case 'unitsMerged':
          add({ delay: arrival, duration: RING_MS, draw: ring(centerOf(event.tile), 0xf3c93f) });
          break;
        case 'unitBought': {
          const unit = after.units[event.tile];
          if (!unit) break;
          this.#popIn(add, unitSlot(after, event.tile), unit, event.player, event.tile);
          break;
        }
        case 'tileOwnerChanged':
          if (event.to !== null) {
            add({
              delay: arrival,
              duration: FLASH_MS,
              draw: flash(centerOf(event.tile), playerColor(event.to)),
            });
          }
          break;
        case 'unitKilled':
          if (event.reason !== 'eliminated') {
            this.#fadeOut(add, unitSlot(before, event.tile), event, arrival);
          }
          break;
        case 'buildingBuilt':
          add({ duration: RING_MS, draw: ring(centerOf(event.tile), PALETTE.selection) });
          break;
        case 'edgeBuilt':
          this.#burst(add, grid, event.edge, PALETTE.selection);
          break;
        case 'edgeDamaged':
        case 'edgeDestroyed':
          this.#burst(add, grid, event.edge, PALETTE.wood);
          break;
        case 'volley':
          this.#volley(add, centerOf(event.from), centerOf(event.target), event);
          break;
        case 'ageReached': {
          const capital = capitalOf(after, event.player);
          if (capital !== undefined) {
            add({ duration: WAVE_MS, draw: wave(centerOf(capital), PALETTE.vein) });
          }
          break;
        }
        case 'playerEliminated':
          add({
            delay: arrival,
            duration: WAVE_MS,
            draw: wave(centerOf(event.capital), playerColor(event.by)),
          });
          break;
        default:
          break;
      }
    }
    this.#update();
  }

  /** Drops every animation (undo, a new game, skipping the AI turns). */
  clear(): void {
    this.#anims = [];
    this.#update();
  }

  destroy(): void {
    this.#stop();
    this.#g.destroy();
  }

  #slide(
    add: (anim: Omit<Anim, 'start'>) => void,
    from: { point: Point; scale: number },
    to: { point: Point; scale: number },
    unit: Unit,
    owner: number,
    options: { hides: number | undefined },
  ): void {
    add({
      duration: SLIDE_MS,
      ...(options.hides !== undefined && { hides: options.hides }),
      draw: (g, t) => {
        const k = easeOut(t);
        const scale = lerp(from.scale, to.scale, k);
        drawUnitToken(
          g,
          lerpPoint(from.point, to.point, k),
          TILE_SIZE * scale,
          unit,
          playerColor(owner),
        );
      },
    });
  }

  #popIn(
    add: (anim: Omit<Anim, 'start'>) => void,
    slot: { point: Point; scale: number },
    unit: Unit,
    owner: number,
    tile: number,
  ): void {
    add({
      duration: POP_MS,
      hides: tile,
      draw: (g, t) => {
        const scale = slot.scale * lerp(0.3, 1, easeOutBack(t));
        drawUnitToken(
          g,
          slot.point,
          TILE_SIZE * scale,
          unit,
          playerColor(owner),
          Math.min(1, t * 3),
        );
      },
    });
  }

  #fadeOut(
    add: (anim: Omit<Anim, 'start'> & { delay?: number }) => void,
    slot: { point: Point; scale: number },
    event: Of<'unitKilled'>,
    delay: number,
  ): void {
    add({
      delay,
      duration: FADE_MS,
      draw: (g, t) => {
        const scale = slot.scale * lerp(1, 0.4, easeOut(t));
        const point = { x: slot.point.x, y: slot.point.y - t * TILE_SIZE * 0.3 };
        drawUnitToken(g, point, TILE_SIZE * scale, event.unit, playerColor(event.owner), 1 - t);
      },
    });
  }

  #burst(
    add: (anim: Omit<Anim, 'start'>) => void,
    grid: ReturnType<typeof mapGrid>,
    edge: EdgeKey,
    color: number,
  ): void {
    const segment = edgeSegment(grid, edge);
    if (!segment) return;
    const mid = lerpPoint(segment[0], segment[1], 0.5);
    add({
      duration: RING_MS,
      draw: (g, t) => {
        const k = easeOut(t);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const r0 = TILE_SIZE * (0.1 + 0.35 * k);
          const r1 = r0 + TILE_SIZE * 0.15 * (1 - t);
          g.moveTo(mid.x + Math.cos(angle) * r0, mid.y + Math.sin(angle) * r0).lineTo(
            mid.x + Math.cos(angle) * r1,
            mid.y + Math.sin(angle) * r1,
          );
        }
        g.stroke({ width: 3, color, alpha: 1 - t, cap: 'round' });
      },
    });
  }

  #volley(
    add: (anim: Omit<Anim, 'start'> & { delay?: number }) => void,
    from: Point,
    to: Point,
    event: Of<'volley'>,
  ): void {
    const color = playerColor(event.player);
    add({
      duration: VOLLEY_MS,
      draw: (g, t) => {
        // An arc: the arrow rises and falls on its way.
        const head = lerpPoint(from, to, t);
        const tail = lerpPoint(from, to, Math.max(0, t - 0.25));
        const lift = (x: number) => Math.sin(x * Math.PI) * TILE_SIZE * 0.8;
        g.moveTo(tail.x, tail.y - lift(Math.max(0, t - 0.25)))
          .lineTo(head.x, head.y - lift(t))
          .stroke({ width: 3, color: PALETTE.iconOutline, cap: 'round' })
          .moveTo(tail.x, tail.y - lift(Math.max(0, t - 0.25)))
          .lineTo(head.x, head.y - lift(t))
          .stroke({ width: 1.5, color, cap: 'round' });
      },
    });
    add({ delay: VOLLEY_MS, duration: RING_MS, draw: ring(to, PALETTE.suppressedMark) });
  }

  #update(): void {
    const now = performance.now();
    this.#anims = this.#anims.filter((a) => now < a.start + a.duration);
    const hidden = new Set(this.#anims.flatMap((a) => (a.hides === undefined ? [] : [a.hides])));
    if (!sameSet(hidden, this.#hidden)) {
      this.#hidden = hidden;
      this.#onHiddenChange();
    }
    const g = this.#g;
    g.clear();
    for (const anim of this.#anims) {
      const t = (now - anim.start) / anim.duration;
      if (t >= 0) anim.draw(g, Math.min(1, t));
    }
    if (this.#anims.length > 0) this.#run();
    else this.#stop();
  }

  readonly #tick = () => {
    this.#update();
  };

  #run(): void {
    if (this.#running) return;
    this.#running = true;
    this.#ticker.add(this.#tick);
  }

  #stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#ticker.remove(this.#tick);
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** A tile flashing in a color, fading out. */
function flash(center: Point, color: number) {
  return (g: Graphics, t: number) => {
    g.poly(hexPolygon(center, TILE_SIZE * lerp(0.7, 1, easeOut(t)))).fill({
      color,
      alpha: 0.6 * (1 - t),
    });
  };
}

/** A hex outline growing and fading around a tile. */
function ring(center: Point, color: number) {
  return (g: Graphics, t: number) => {
    g.poly(hexPolygon(center, TILE_SIZE * lerp(0.55, 1.15, easeOut(t)))).stroke({
      width: 3,
      color,
      alpha: 1 - t,
      join: 'round',
    });
  };
}

/** A wide wave of rings from a tile (an age reached, a capital taken). */
function wave(center: Point, color: number) {
  return (g: Graphics, t: number) => {
    for (const lag of [0, 0.2, 0.4]) {
      const k = Math.max(0, t - lag) / (1 - lag);
      if (k <= 0) continue;
      g.circle(center.x, center.y, TILE_SIZE * lerp(0.5, 3.5, easeOut(k))).stroke({
        width: 4,
        color,
        alpha: 0.9 * (1 - k),
      });
    }
  };
}
