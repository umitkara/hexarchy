import {
  axialToPixel,
  BUILDINGS,
  buildOptions,
  checkBuild,
  checkPlacement,
  checkSource,
  hexPolygon,
  mapGrid,
  newUnit,
  protectorsOf,
  strengthAgainst,
  targetOptions,
  unitStrength,
  type GameState,
  type Point,
  type Protector,
  type Resources,
  type Unit,
} from '@hexarchy/engine';
import { Container, Graphics, Text } from 'pixi.js';
import type { HandSource } from '../store/gameStore';
import { resourcesText } from '../ui/labels';
import { drawBuildingEmblem } from './buildingGraphics';
import { TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';
import { drawUnitToken } from './unitGraphics';

/**
 * Where the unit or building being placed can go (world space). A unit: free moves, merges,
 * captures and attacks, and neighbors it may not attack because they are protected. A
 * building: the free tiles of the region it fits on.
 */
export function drawTargets(g: Graphics, game: GameState, source: HandSource | null): void {
  g.clear();
  if (!source) return;
  const grid = mapGrid(game.map);
  const hex = (tile: number, scale: number) =>
    hexPolygon(axialToPixel(grid.coord(tile), TILE_SIZE), TILE_SIZE * scale);

  if (source.kind === 'build') {
    for (const { tile, check } of buildOptions(game, source)) {
      if (!check.ok) continue;
      g.poly(hex(tile, 0.9))
        .fill({ color: PALETTE.targetWin, alpha: 0.2 })
        .stroke({ width: 2, color: PALETTE.targetWin, alpha: 0.85, join: 'round' });
    }
    return;
  }

  for (const { tile, check } of targetOptions(game, source)) {
    if (check.ok) {
      const { action } = check.placement;
      if (action === 'move') {
        g.poly(hex(tile, 0.9)).fill({ color: PALETTE.targetMove, alpha: 0.16 });
      } else {
        const color = action === 'merge' ? PALETTE.targetMerge : PALETTE.targetWin;
        g.poly(hex(tile, 0.9))
          .fill({ color, alpha: 0.26 })
          .stroke({ width: 2.5, color, alpha: 0.95, join: 'round' });
      }
    } else if (check.error === 'protected') {
      g.poly(hex(tile, 0.88))
        .fill({ color: PALETTE.targetBlocked, alpha: 0.1 })
        .stroke({ width: 2, color: PALETTE.targetBlocked, alpha: 0.75, join: 'round' });
    }
  }
  if (source.kind === 'unit') {
    g.poly(hex(source.from, 0.8)).stroke({ width: 3, color: PALETTE.selection, join: 'round' });
  }
}

/** The unit a source would place (none for a building). */
export function sourceUnit(game: GameState, source: HandSource): Unit | undefined {
  if (source.kind === 'build') return undefined;
  return source.kind === 'unit' ? game.units[source.from] : newUnit(source.line);
}

/** What a building on a tile would do per turn, as a short label ("" if nothing to show). */
export function buildEffectText(output: Resources, protection: number): string {
  const text = resourcesText(output);
  if (text) return text;
  return protection > 0 ? `koruma ${protection}` : '';
}

/** Screen-space size (px) of a preview shield, following the zoom within limits. */
function shieldSize(zoom: number): number {
  return Math.min(34, Math.max(22, TILE_SIZE * zoom * 0.5));
}

const SHIELD_POINTS: readonly (readonly [number, number])[] = [
  [-0.42, -0.5],
  [0.42, -0.5],
  [0.42, 0.05],
  [0.3, 0.3],
  [0, 0.5],
  [-0.3, 0.3],
  [-0.42, 0.05],
];

interface ShieldMark {
  readonly at: Point;
  readonly color: number;
  readonly value: number;
  /** Red rim: this protector stops the attack. */
  readonly blocking: boolean;
  /** Faded: the attacker beats it. */
  readonly beaten: boolean;
}

/**
 * Shield preview (GDD 7.5), drawn in screen space so it stays crisp and readable at any
 * zoom: on the target, who protects it and with what strength; with a unit in hand, which
 * protectors stop it (red) and the attacker's strength (green = wins, red = refused).
 * With a building in hand, the production preview instead: each tile it fits on shows what
 * it would yield per turn, the target tile in full. Also draws what is being dragged under
 * the pointer.
 */
export class ShieldPreview {
  readonly container = new Container({ label: 'shield-preview', eventMode: 'none' });
  readonly #lines = new Graphics();
  readonly #shields = new Graphics();
  readonly #ghost = new Graphics();
  readonly #labels: Text[] = [];

  constructor() {
    this.container.addChild(this.#lines, this.#shields, this.#ghost);
  }

  draw(options: {
    readonly game: GameState;
    readonly source: HandSource | null;
    readonly target: number | null;
    readonly ghost: Point | null;
    readonly zoom: number;
    readonly toScreen: (world: Point) => Point;
  }): void {
    const { game, source, target, ghost, zoom, toScreen } = options;
    this.#lines.clear();
    this.#shields.clear();
    this.#ghost.clear();
    let labelCount = 0;
    const label = (text: string, at: Point, size: number): Text => {
      let t = this.#labels[labelCount];
      if (!t) {
        t = new Text({
          text,
          style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fill: 0xffffff },
        });
        t.anchor.set(0.5);
        this.#labels.push(t);
        this.container.addChild(t);
      }
      t.text = text;
      t.style.fontSize = size;
      t.position.set(at.x, at.y);
      t.visible = true;
      labelCount++;
      return t;
    };

    if (source?.kind === 'build') {
      this.#drawBuildPreview(game, source, target, zoom, toScreen, label);
    } else if (target !== null) {
      this.#drawTarget(game, source, target, zoom, toScreen, label);
    }

    if (ghost && source?.kind === 'build') {
      const size = Math.max(30, TILE_SIZE * zoom);
      const color = playerColor(game.currentPlayer);
      drawBuildingEmblem(this.#ghost, ghost, size, source.building, color, 0.9);
    } else if (ghost && source) {
      const unit = sourceUnit(game, source);
      if (unit) {
        const size = Math.max(30, TILE_SIZE * zoom);
        drawUnitToken(this.#ghost, ghost, size, unit, playerColor(game.currentPlayer), 0.9);
      }
    }
    for (let i = labelCount; i < this.#labels.length; i++) {
      const t = this.#labels[i];
      if (t) t.visible = false;
    }
  }

  /** Yield per turn on every tile the building fits on; the target gets a larger pill. */
  #drawBuildPreview(
    game: GameState,
    source: Extract<HandSource, { kind: 'build' }>,
    target: number | null,
    zoom: number,
    toScreen: (world: Point) => Point,
    label: (text: string, at: Point, size: number) => Text,
  ): void {
    const grid = mapGrid(game.map);
    const { protection } = BUILDINGS[source.building];
    const pill = (text: string, at: Point, size: number, strong: boolean) => {
      const t = label(text, at, size);
      const w = t.width + size * 0.8;
      const h = size * 1.45;
      this.#shields
        .roundRect(at.x - w / 2, at.y - h / 2, w, h, h / 2)
        .fill({ color: PALETTE.iconOutline, alpha: strong ? 0.9 : 0.7 })
        .stroke({ width: strong ? 2 : 1, color: PALETTE.targetWin, alpha: strong ? 1 : 0.7 });
    };
    // Small numbers only once tiles are big enough on screen to hold them.
    const tilePx = TILE_SIZE * zoom;
    for (const { tile, check } of buildOptions(game, source)) {
      if (!check.ok || tile === target || tilePx < 30) continue;
      const text = buildEffectText(check.placement.output, 0);
      if (!text) continue;
      const short = text
        .split(', ')
        .map((part) => part.split(' ')[0])
        .join(' ');
      const at = toScreen(axialToPixel(grid.coord(tile), TILE_SIZE));
      pill(short, { x: at.x, y: at.y + tilePx * 0.32 }, Math.min(14, tilePx * 0.3), false);
    }
    if (target === null || !grid.has(target)) return;
    const check = checkBuild(game, source, target);
    if (!check.ok) return;
    const text = buildEffectText(check.placement.output, protection);
    if (!text) return;
    const at = toScreen(axialToPixel(grid.coord(target), TILE_SIZE));
    pill(`${text}/tur`, { x: at.x, y: at.y - Math.max(24, tilePx * 0.62) }, 14, true);
  }

  #drawTarget(
    game: GameState,
    source: HandSource | null,
    target: number,
    zoom: number,
    toScreen: (world: Point) => Point,
    label: (text: string, at: Point, size: number) => Text,
  ): void {
    const grid = mapGrid(game.map);
    if (!grid.has(target)) return;
    if (source?.kind === 'build') return;
    const owner = game.owners[target] ?? null;
    const protectors = protectorsOf(game, target);

    // With a unit in hand, only foreign tiles are attacks worth previewing.
    const checkedSource = source ? checkSource(game, source) : null;
    const attacker =
      checkedSource?.ok && owner !== game.currentPlayer ? checkedSource.info.unit : null;
    if (source && !attacker) return;
    if (!attacker && protectors.length === 0) return;
    // Preview real attacks only: not across rivers, out of reach, with workers...
    const check = source && attacker ? checkPlacement(game, source, target) : null;
    if (check && !check.ok && check.error !== 'protected') return;

    const worldOf = (tile: number) => axialToPixel(grid.coord(tile), TILE_SIZE);
    const targetWorld = worldOf(target);
    const size = shieldSize(zoom);

    // One mark per protector: on the target's top for its own, else on the shared side;
    // two marks from one tile (unit + center) sit side by side.
    const marks: ShieldMark[] = [];
    const perTile = new Map<number, Protector[]>();
    for (const p of protectors) perTile.set(p.tile, [...(perTile.get(p.tile) ?? []), p]);
    for (const [tile, group] of perTile) {
      const from = worldOf(tile);
      const base =
        tile === target
          ? { x: targetWorld.x, y: targetWorld.y - TILE_SIZE * 0.5 }
          : { x: (from.x + targetWorld.x) / 2, y: (from.y + targetWorld.y) / 2 };
      const screen = toScreen(base);
      group.forEach((p, i) => {
        const shift = (i - (group.length - 1) / 2) * size * 0.95;
        const blocking = attacker !== null && strengthAgainst(attacker, p) <= p.strength;
        marks.push({
          at: { x: screen.x + shift, y: screen.y },
          color: playerColor(p.owner),
          value: p.strength,
          blocking,
          beaten: attacker !== null && !blocking,
        });
      });
      if (tile !== target) {
        const a = toScreen(from);
        const b = screen;
        this.#lines.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
    }
    this.#lines.stroke({ width: 2, color: 0xffffff, alpha: 0.55, cap: 'round' });

    for (const mark of marks) {
      const alpha = mark.beaten ? 0.55 : 1;
      this.#shields
        .poly(SHIELD_POINTS.flatMap(([x, y]) => [mark.at.x + x * size, mark.at.y + y * size]))
        .fill({ color: mark.color, alpha })
        .stroke({
          width: mark.blocking ? 3 : 1.5,
          color: mark.blocking ? PALETTE.targetBlocked : PALETTE.iconOutline,
          join: 'round',
          alpha,
        });
      label(String(mark.value), { x: mark.at.x, y: mark.at.y - size * 0.04 }, size * 0.55);
    }

    if (attacker && check) {
      // Attacker badge on the target's upper right: its strength, green if it wins.
      const at = toScreen({
        x: targetWorld.x + TILE_SIZE * 0.5,
        y: targetWorld.y - TILE_SIZE * 0.5,
      });
      this.#shields
        .circle(at.x, at.y, size * 0.5)
        .fill(check.ok ? PALETTE.targetWin : PALETTE.targetBlocked)
        .stroke({ width: 2, color: PALETTE.iconOutline });
      label(String(unitStrength(attacker)), at, size * 0.55);
    }
  }
}
