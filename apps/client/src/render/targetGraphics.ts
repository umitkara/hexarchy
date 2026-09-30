import {
  axialToPixel,
  breachOptions,
  BUILDINGS,
  buildOptions,
  checkBreach,
  checkBuild,
  checkEdgeBuild,
  checkPlacement,
  checkSource,
  checkVolley,
  edgeBuildOptions,
  edgeKey,
  hexPolygon,
  mapGrid,
  newUnit,
  protectorsOf,
  strengthAgainst,
  targetOptions,
  unitStrength,
  volleyOptions,
  type EdgeKey,
  type GameState,
  type Point,
  type Protector,
  type Resources,
  type Unit,
} from '@hexarchy/engine';
import { Container, Graphics, Text } from 'pixi.js';
import { actingTile, type HandSource } from '../store/gameStore';
import { resourcesText, STRUCTURE_LABELS } from '../ui/labels';
import { drawBuildingEmblem } from './buildingGraphics';
import { edgeSegment, TILE_SIZE } from './mapGraphics';
import { PALETTE, playerColor } from './palette';
import { drawStructure } from './structureGraphics';
import { drawUnitToken } from './unitGraphics';

/** A unit action: a worker's edge structure, a strike on a structure, an archer volley. */
type ActionSource = Extract<HandSource, { kind: 'edge' | 'breach' | 'volley' }>;

function isAction(source: HandSource | null): source is ActionSource {
  return source?.kind === 'edge' || source?.kind === 'breach' || source?.kind === 'volley';
}

/**
 * Where the unit or building being placed can go (world space). A unit: free moves, merges,
 * captures and attacks, and neighbors it may not attack because they are protected. A
 * building: the free tiles of the region it fits on. A unit action: the sides of the unit's
 * tile it may build on or strike, or the enemy units in volley range.
 */
export function drawTargets(g: Graphics, game: GameState, source: HandSource | null): void {
  g.clear();
  if (!source) return;
  const grid = mapGrid(game.map);
  const hex = (tile: number, scale: number) =>
    hexPolygon(axialToPixel(grid.coord(tile), TILE_SIZE), TILE_SIZE * scale);
  const from = actingTile(source);
  const ring = () => {
    if (from !== undefined) {
      g.poly(hex(from, 0.8)).stroke({ width: 3, color: PALETTE.selection, join: 'round' });
    }
  };

  if (source.kind === 'build') {
    for (const { tile, check } of buildOptions(game, source)) {
      if (!check.ok) continue;
      g.poly(hex(tile, 0.9))
        .fill({ color: PALETTE.targetWin, alpha: 0.2 })
        .stroke({ width: 2, color: PALETTE.targetWin, alpha: 0.85, join: 'round' });
    }
    return;
  }

  if (source.kind === 'edge' || source.kind === 'breach') {
    const color = source.kind === 'edge' ? PALETTE.targetWin : PALETTE.targetBlocked;
    const options =
      source.kind === 'edge' ? edgeBuildOptions(game, source) : breachOptions(game, source);
    for (const { to, edge, check } of options) {
      if (!check.ok) continue;
      g.poly(hex(to, 0.9)).fill({ color, alpha: 0.1 });
      drawSide(g, game, edge, color);
    }
    ring();
    return;
  }

  if (source.kind === 'volley') {
    for (const { tile, check } of volleyOptions(game, source)) {
      if (!check.ok) continue;
      const c = axialToPixel(grid.coord(tile), TILE_SIZE);
      g.poly(hex(tile, 0.9))
        .fill({ color: PALETTE.targetBlocked, alpha: 0.14 })
        .stroke({ width: 2.5, color: PALETTE.targetBlocked, alpha: 0.9, join: 'round' });
      // Crosshair ticks around the target.
      const r = TILE_SIZE * 0.62;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        g.moveTo(c.x + dx * r, c.y + dy * r).lineTo(c.x + dx * r * 0.7, c.y + dy * r * 0.7);
      }
      g.stroke({ width: 3, color: PALETTE.targetBlocked, alpha: 0.9, cap: 'round' });
    }
    ring();
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
  if (source.kind === 'unit') ring();
}

/** A highlighted tile side (world space). */
function drawSide(g: Graphics, game: GameState, edge: EdgeKey, color: number): void {
  const segment = edgeSegment(mapGrid(game.map), edge);
  if (!segment) return;
  const [a, b] = segment;
  g.moveTo(a.x, a.y)
    .lineTo(b.x, b.y)
    .stroke({ width: TILE_SIZE * 0.3, color, alpha: 0.5, cap: 'round' });
}

/** The unit a source would place or act with (none for a building). */
export function sourceUnit(game: GameState, source: HandSource): Unit | undefined {
  if (source.kind === 'build') return undefined;
  return source.kind === 'recruit' ? newUnit(source.line) : game.units[source.from];
}

/** What a unit action on `target` would do, as a short label (null if refused). */
export function actionText(game: GameState, source: HandSource, target: number): string | null {
  switch (source.kind) {
    case 'edge': {
      const check = checkEdgeBuild(game, source, target);
      if (!check.ok) return null;
      const { build } = check;
      const over = build.replaces
        ? ` (${STRUCTURE_LABELS[build.replaces].toLowerCase()} yerine)`
        : '';
      return `${STRUCTURE_LABELS[build.structure]}${over}: −${build.cost} malzeme`;
    }
    case 'breach': {
      const check = checkBreach(game, source, target);
      if (!check.ok) return null;
      const { breach } = check;
      const name = STRUCTURE_LABELS[breach.structure];
      return breach.destroyed
        ? `${name} yıkılır`
        : `${name}: hasar ${breach.damage}/${breach.hits}`;
    }
    case 'volley': {
      const check = checkVolley(game, source, target);
      if (!check.ok) return null;
      const before = game.units[target];
      const after = unitStrength(check.volley.unit);
      return `Baskı: güç ${before ? unitStrength(before) : 0} → ${after}`;
    }
    case 'unit':
    case 'recruit':
    case 'build':
      return null;
  }
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
  /** The attacker's strength against this protector less its own (GDD 7.2 counters). */
  readonly bonus: number;
  /** Red rim: this protector stops the attack. */
  readonly blocking: boolean;
  /** Faded: the attacker beats it. */
  readonly beaten: boolean;
}

type LabelFn = (text: string, at: Point, size: number) => Text;

/**
 * Shield preview (GDD 7.5), drawn in screen space so it stays crisp and readable at any
 * zoom: on the target, who protects it and with what strength; with a unit in hand, which
 * protectors stop it (red), the attacker's strength (green = wins, red = refused), its
 * counter bonus against each protector (GDD 7.2) and a cavalry's two-step path.
 * With a building in hand, the production preview instead: each tile it fits on shows what
 * it would yield per turn, the target tile in full. With a unit action in hand, what it
 * would do on the target. Also draws what is being dragged under the pointer.
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
    const label: LabelFn = (text, at, size) => {
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
    } else if (isAction(source)) {
      if (target !== null) this.#drawActionPreview(game, source, target, zoom, toScreen, label);
    } else if (target !== null) {
      this.#drawTarget(game, source, target, zoom, toScreen, label);
    }

    if (ghost && source?.kind === 'build') {
      const size = Math.max(30, TILE_SIZE * zoom);
      const color = playerColor(game.currentPlayer);
      drawBuildingEmblem(this.#ghost, ghost, size, source.building, color, 0.9);
    } else if (ghost && source?.kind === 'edge') {
      const half = Math.max(30, TILE_SIZE * zoom) / 2;
      drawStructure(
        this.#ghost,
        { x: ghost.x - half, y: ghost.y },
        { x: ghost.x + half, y: ghost.y },
        { x: 0, y: 1 },
        { kind: source.structure, owner: game.currentPlayer, damage: 0 },
        0.9,
      );
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

  /** A text pill; the label is drawn above the pill graphics (labels sit higher). */
  #pill(label: LabelFn, text: string, at: Point, size: number, rim: number, strong: boolean) {
    const t = label(text, at, size);
    const w = t.width + size * 0.8;
    const h = size * 1.45;
    this.#shields
      .roundRect(at.x - w / 2, at.y - h / 2, w, h, h / 2)
      .fill({ color: PALETTE.iconOutline, alpha: strong ? 0.9 : 0.7 })
      .stroke({ width: strong ? 2 : 1, color: rim, alpha: strong ? 1 : 0.7 });
  }

  /** Yield per turn on every tile the building fits on; the target gets a larger pill. */
  #drawBuildPreview(
    game: GameState,
    source: Extract<HandSource, { kind: 'build' }>,
    target: number | null,
    zoom: number,
    toScreen: (world: Point) => Point,
    label: LabelFn,
  ): void {
    const grid = mapGrid(game.map);
    const { protection } = BUILDINGS[source.building];
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
      const y = at.y + tilePx * 0.32;
      this.#pill(
        label,
        short,
        { x: at.x, y },
        Math.min(14, tilePx * 0.3),
        PALETTE.targetWin,
        false,
      );
    }
    if (target === null || !grid.has(target)) return;
    const check = checkBuild(game, source, target);
    if (!check.ok) return;
    const text = buildEffectText(check.placement.output, protection);
    if (!text) return;
    const at = toScreen(axialToPixel(grid.coord(target), TILE_SIZE));
    const y = at.y - Math.max(24, tilePx * 0.62);
    this.#pill(label, `${text}/tur`, { x: at.x, y }, 14, PALETTE.targetWin, true);
  }

  /** A unit action on the target: what it would do, in a pill over the edge or tile. */
  #drawActionPreview(
    game: GameState,
    source: ActionSource,
    target: number,
    zoom: number,
    toScreen: (world: Point) => Point,
    label: LabelFn,
  ): void {
    const grid = mapGrid(game.map);
    if (!grid.has(target)) return;
    const text = actionText(game, source, target);
    if (!text) return;
    const segment =
      source.kind !== 'volley' && grid.areAdjacent(source.from, target)
        ? edgeSegment(grid, edgeKey(source.from, target))
        : undefined;
    const base = segment
      ? { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 }
      : axialToPixel(grid.coord(target), TILE_SIZE);
    const at = toScreen(base);
    const y = at.y - Math.max(24, TILE_SIZE * zoom * 0.5);
    const rim = source.kind === 'edge' ? PALETTE.targetWin : PALETTE.targetBlocked;
    this.#pill(label, text, { x: at.x, y }, 14, rim, true);
  }

  #drawTarget(
    game: GameState,
    source: HandSource | null,
    target: number,
    zoom: number,
    toScreen: (world: Point) => Point,
    label: LabelFn,
  ): void {
    const grid = mapGrid(game.map);
    if (!grid.has(target)) return;
    if (source && source.kind !== 'unit' && source.kind !== 'recruit') return;
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

    // A cavalry's two-step path: from its land, over the tile it passes, onto the target.
    const via = check?.ok ? check.placement.via : undefined;
    if (via !== undefined) {
      const start = grid.neighbors(via).find((n) => game.owners[n] === game.currentPlayer);
      const path = [...(start === undefined ? [] : [start]), via, target].map((t) =>
        toScreen(worldOf(t)),
      );
      path.forEach((p, i) => {
        if (i === 0) this.#lines.moveTo(p.x, p.y);
        else this.#lines.lineTo(p.x, p.y);
      });
      this.#lines.stroke({
        width: 4,
        color: PALETTE.targetWin,
        alpha: 0.85,
        cap: 'round',
        join: 'round',
      });
      const passed = toScreen(worldOf(via));
      this.#shields.circle(passed.x, passed.y, 6).fill(PALETTE.targetWin);
    }

    // One mark per protector: on the target's top for its own, else on the shared side
    // (halfway for archers two tiles off); two marks from one tile sit side by side.
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
        const against = attacker === null ? 0 : strengthAgainst(attacker, p);
        const blocking = attacker !== null && against <= p.strength;
        marks.push({
          at: { x: screen.x + shift, y: screen.y },
          color: playerColor(p.owner),
          value: p.strength,
          bonus: attacker === null ? 0 : against - unitStrength(attacker),
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
      if (mark.bonus !== 0) {
        // The attacker's counter bonus (or siege's zero) against this protector.
        const at = { x: mark.at.x, y: mark.at.y + size * 0.66 };
        const r = size * 0.28;
        this.#shields
          .roundRect(at.x - r * 1.4, at.y - r, r * 2.8, r * 2, r)
          .fill(mark.bonus > 0 ? PALETTE.targetWin : PALETTE.targetBlocked)
          .stroke({ width: 1.5, color: PALETTE.iconOutline });
        label(mark.bonus > 0 ? `+${mark.bonus}` : `${mark.bonus}`, at, size * 0.42);
      }
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
