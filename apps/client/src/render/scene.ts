import {
  axialToPixel,
  capitalOf,
  hexBounds,
  isLand,
  mapGrid,
  pixelToAxial,
  sameShape,
  type GameMap,
  type GameState,
  type Point,
  type Rect,
} from '@hexarchy/engine';
import { Container, Graphics, type Application } from 'pixi.js';
import { attachCameraControls, type DragHandler } from '../input/cameraControls';
import { registerMapPicker } from '../input/dragDrop';
import { canControl, gameStore, isEdgeSource, type GameStoreState } from '../store/gameStore';
import { drawAiMoves } from './aiGraphics';
import { Camera } from './camera';
import { drawBuildings } from './buildingGraphics';
import { Effects } from './effects';
import { createLayers } from './layers';
import { drawEdges, drawHover, drawTerrain, TILE_SIZE } from './mapGraphics';
import { drawStructures } from './structureGraphics';
import { drawTargets, ShieldPreview } from './targetGraphics';
import { drawCenters, drawSelection, drawTerritory } from './territoryGraphics';
import { drawUnits } from './unitGraphics';

/** Duration of the camera glide to the capital (ms). */
const GLIDE_MS = 450;

/** Within this share of the tile size from the unit's tile center, no side is picked. */
const EDGE_PICK_INNER = 0.35;

/** Sea margin (in tiles) around the land that the camera may show. */
const VIEW_MARGIN_TILES = 1.5;

/** Camera bounds: the land plus a margin; open sea beyond it blends into the background. */
function viewBounds(map: GameMap): Rect {
  const grid = mapGrid(map);
  const land = grid.coords.filter((_, i) => {
    const tile = map.tiles[i];
    return tile !== undefined && isLand(tile.terrain);
  });
  const bounds = hexBounds(land.length > 0 ? land : grid.coords, TILE_SIZE);
  const margin = VIEW_MARGIN_TILES * TILE_SIZE;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

/** The source being placed (unit or building): the dragged one, else the armed one. */
function activeSource(state: GameStoreState) {
  return state.drag?.source ?? state.armed;
}

/** The unit tile of an edge action in hand (its sides are the targets), else null. */
function edgeFrom(state: GameStoreState): number | null {
  const source = activeSource(state);
  return isEdgeSource(source) ? source.from : null;
}

/** Tile whose unit is lifted by a drag (drawn faint in place). */
function draggedFrom(state: GameStoreState): number | null {
  return state.drag?.source.kind === 'unit' ? state.drag.source.from : null;
}

/**
 * Game scene: static map layers, territory (ownership, region borders, centers), units,
 * targets and highlights, the shield preview (screen space), camera and pointer controls.
 */
export function createScene(app: Application): () => void {
  // A render group: camera moves only update one GPU transform, children stay untouched.
  const world = new Container({ isRenderGroup: true, eventMode: 'none' });
  app.stage.addChild(world);
  const layers = createLayers(world);

  const terrainBase = new Graphics();
  const terrainGlyphs = new Graphics();
  layers.terrain.addChild(terrainBase, terrainGlyphs);
  const territoryFill = new Graphics();
  const territoryBorders = new Graphics();
  layers.territory.addChild(territoryFill, territoryBorders);
  const edges = new Graphics();
  const structures = new Graphics();
  layers.edges.addChild(edges, structures);
  const centers = new Graphics();
  const buildings = new Graphics();
  layers.buildings.addChild(centers, buildings);
  const units = new Graphics();
  layers.units.addChild(units);
  const redrawUnits = () => {
    const state = gameStore.getState();
    drawUnits(units, state.game, draggedFrom(state), effects.hidden);
  };
  const effects: Effects = new Effects(layers.effects, app.ticker, redrawUnits);
  const aiMoves = new Graphics();
  const targets = new Graphics();
  const selection = new Graphics();
  const hover = new Graphics();
  layers.highlights.addChild(aiMoves, targets, selection, hover);
  // Screen-space overlay above the world: not scaled by the camera.
  const preview = new ShieldPreview();
  app.stage.addChild(preview.container);

  const renderPreview = () => {
    const state = gameStore.getState();
    preview.draw({
      game: state.game,
      source: activeSource(state),
      target: state.drag ? state.drag.tile : state.hoveredTile,
      ghost: state.drag?.screen ?? null,
      zoom: camera.zoom,
      toScreen: (p) => camera.worldToScreen(p),
    });
  };

  const camera: Camera = new Camera({ fitPadding: 16, minZoomOfFit: 0.85, maxZoom: 4 }, () => {
    camera.applyTo(world);
    renderPreview();
  });
  camera.setViewport(app.screen.width, app.screen.height);

  const renderMap = (map: GameMap, previous?: GameMap) => {
    drawTerrain(terrainBase, terrainGlyphs, map);
    drawEdges(edges, map);
    camera.setWorldBounds(viewBounds(map));
    // Keep the view when regenerating the same map shape, so seeds can be compared.
    if (!previous || !sameShape(previous.shape, map.shape)) camera.fit();
  };

  /** Glides the view to a world point; a pan or zoom by the player stops it. */
  let glide: (() => void) | null = null;
  const stopGlide = () => {
    if (glide) app.ticker.remove(glide);
    glide = null;
  };
  const glideTo = (target: Point) => {
    stopGlide();
    const from = camera.center;
    const start = performance.now();
    let expected = from;
    const step = () => {
      const now = camera.center;
      // Moved by the player since the last frame: hand the camera back.
      if (Math.hypot(now.x - expected.x, now.y - expected.y) > 0.5) {
        stopGlide();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / GLIDE_MS);
      const k = t * t * (3 - 2 * t);
      camera.centerOn({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k });
      expected = camera.center;
      if (t >= 1) stopGlide();
    };
    glide = step;
    app.ticker.add(step);
  };

  const centerOnCapital = (game: GameState) => {
    const capital = capitalOf(game, game.currentPlayer);
    if (capital !== undefined) {
      glideTo(axialToPixel(mapGrid(game.map).coord(capital), TILE_SIZE));
    }
  };

  const initial = gameStore.getState();
  renderMap(initial.game.map);
  drawTerritory(territoryFill, territoryBorders, initial.game);
  drawCenters(centers, initial.game);
  drawBuildings(buildings, initial.game);
  drawStructures(structures, initial.game);
  drawUnits(units, initial.game, null, effects.hidden);
  drawSelection(selection, initial.game, initial.selectedTile);
  drawAiMoves(aiMoves, initial.game, initial.aiTaken, initial.aiMove);
  drawHover(hover, initial.game.map, initial.hoveredTile, edgeFrom(initial));
  renderPreview();

  const unsubscribe = gameStore.subscribe((state, previous) => {
    const { game } = state;
    const old = previous.game;
    if (game.map !== old.map) renderMap(game.map, old.map);
    // Game data only changes through commands; identity tells what changed.
    const territoryChanged =
      game.map !== old.map || game.owners !== old.owners || game.centers !== old.centers;
    const unitsChanged = game.units !== old.units || game.currentPlayer !== old.currentPlayer;
    // Icons sharing a tile make room for each other (tileLayout).
    const layoutChanged =
      territoryChanged || game.units !== old.units || game.buildings !== old.buildings;
    if (territoryChanged) drawTerritory(territoryFill, territoryBorders, game);
    if (game.map !== old.map || game.edgeStructures !== old.edgeStructures) {
      drawStructures(structures, game);
    }
    if (layoutChanged) {
      drawCenters(centers, game);
      drawBuildings(buildings, game);
    }
    // Animations first: they decide which units the units layer leaves out for now.
    if (state.feed !== previous.feed) {
      if (state.feed && !state.aiFast) effects.play(state.feed, old, game);
      else effects.clear();
    } else if (game !== old) {
      effects.clear();
    }
    if (layoutChanged || unitsChanged || draggedFrom(state) !== draggedFrom(previous)) {
      drawUnits(units, game, draggedFrom(state), effects.hidden);
    }
    if (game !== old || activeSource(state) !== activeSource(previous)) {
      drawTargets(targets, game, activeSource(state));
    }
    if (state.aiTaken !== previous.aiTaken || state.aiMove !== previous.aiMove) {
      drawAiMoves(aiMoves, game, state.aiTaken, state.aiMove);
    }
    if (territoryChanged || state.selectedTile !== previous.selectedTile) {
      drawSelection(selection, game, state.selectedTile);
    }
    if (
      game.map !== old.map ||
      state.hoveredTile !== previous.hoveredTile ||
      edgeFrom(state) !== edgeFrom(previous)
    ) {
      drawHover(hover, game.map, state.hoveredTile, edgeFrom(state));
    }
    if (
      game !== old ||
      state.hoveredTile !== previous.hoveredTile ||
      state.drag !== previous.drag ||
      state.armed !== previous.armed
    ) {
      renderPreview();
    }
    // Hotseat: follow the player on turn. Against the AI the camera stays put while it
    // plays and comes back to the human's capital on their turn.
    if (game.map === old.map && game.currentPlayer !== old.currentPlayer && canControl(state)) {
      centerOnCapital(game);
    }
  });

  /**
   * The tile under a screen point. With an edge action in hand, a point near a side of the
   * acting unit's own tile picks the tile across that side: the edge is the target, and
   * either of its tiles selects it (large targets for touch).
   */
  const tileAt = (screen: Point | null): number | null => {
    if (!screen) return null;
    const state = gameStore.getState();
    const grid = mapGrid(state.game.map);
    const world = camera.screenToWorld(screen);
    const hex = pixelToAxial(world, TILE_SIZE);
    const index = grid.indexOf(hex.q, hex.r);
    if (index < 0) return null;
    const from = edgeFrom(state);
    if (from !== index) return index;
    const center = axialToPixel(grid.coord(index), TILE_SIZE);
    const dx = world.x - center.x;
    const dy = world.y - center.y;
    // The middle of the tile is the unit itself (a tap there puts it down).
    if (Math.hypot(dx, dy) < TILE_SIZE * EDGE_PICK_INNER) return index;
    let best = index;
    let bestDot = -Infinity;
    for (const n of grid.neighbors(index)) {
      const c = axialToPixel(grid.coord(n), TILE_SIZE);
      const dot = (c.x - center.x) * dx + (c.y - center.y) * dy;
      if (dot > bestDot) {
        bestDot = dot;
        best = n;
      }
    }
    return best;
  };

  /** A drag that starts on a movable unit of the player on turn picks the unit up. */
  const beginDrag = (pressed: Point): DragHandler | null => {
    const state = gameStore.getState();
    const tile = tileAt(pressed);
    if (tile === null || state.painting || !canControl(state)) return null;
    const unit = state.game.units[tile];
    if (!unit || unit.exhausted || state.game.owners[tile] !== state.game.currentPlayer) {
      return null;
    }
    state.startDrag({ kind: 'unit', from: tile });
    return {
      move: (screen) => {
        gameStore.getState().updateDrag(screen, tileAt(screen));
      },
      end: (screen) => {
        gameStore.getState().endDrag(tileAt(screen));
      },
      cancel: () => {
        gameStore.getState().endDrag(null);
      },
    };
  };

  const detachControls = attachCameraControls({
    element: app.canvas,
    camera,
    onHover: (screen) => {
      gameStore.getState().setHoveredTile(tileAt(screen));
    },
    onTap: (screen) => {
      const tile = tileAt(screen);
      gameStore.getState().setHoveredTile(tile);
      gameStore.getState().tapTile(tile);
    },
    beginDrag,
  });

  const unregisterPicker = registerMapPicker({
    toCanvas: (clientX, clientY) => {
      const rect = app.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return x < 0 || y < 0 || x > rect.width || y > rect.height ? null : { x, y };
    },
    tileAt,
  });

  const onResize = () => {
    camera.setViewport(app.screen.width, app.screen.height);
  };
  app.renderer.on('resize', onResize);

  return () => {
    app.renderer.off('resize', onResize);
    unregisterPicker();
    detachControls();
    unsubscribe();
    stopGlide();
    effects.destroy();
    world.destroy({ children: true });
    preview.container.destroy({ children: true });
  };
}
