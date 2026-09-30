import {
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
import { attachCameraControls } from '../input/cameraControls';
import { gameStore } from '../store/gameStore';
import { Camera } from './camera';
import { createLayers } from './layers';
import { drawEdges, drawHover, drawTerrain, TILE_SIZE } from './mapGraphics';
import { drawCenters, drawSelection, drawTerritory } from './territoryGraphics';

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

/**
 * Game scene: static map layers, territory (ownership, region borders, centers),
 * hover/selection highlights, camera and its pointer controls.
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
  layers.edges.addChild(edges);
  const centers = new Graphics();
  layers.buildings.addChild(centers);
  const selection = new Graphics();
  const hover = new Graphics();
  layers.highlights.addChild(selection, hover);

  const camera = new Camera({ fitPadding: 16, minZoomOfFit: 0.85, maxZoom: 4 }, () => {
    camera.applyTo(world);
  });
  camera.setViewport(app.screen.width, app.screen.height);

  const renderMap = (map: GameMap, previous?: GameMap) => {
    drawTerrain(terrainBase, terrainGlyphs, map);
    drawEdges(edges, map);
    camera.setWorldBounds(viewBounds(map));
    // Keep the view when regenerating the same map shape, so seeds can be compared.
    if (!previous || !sameShape(previous.shape, map.shape)) camera.fit();
  };
  const renderTerritory = (game: GameState) => {
    drawTerritory(territoryFill, territoryBorders, game);
    drawCenters(centers, game);
  };

  const initial = gameStore.getState();
  renderMap(initial.game.map);
  renderTerritory(initial.game);
  drawSelection(selection, initial.game, initial.selectedTile);
  drawHover(hover, initial.game.map, initial.hoveredTile);

  const unsubscribe = gameStore.subscribe((state, previous) => {
    const { game } = state;
    const old = previous.game;
    if (game.map !== old.map) renderMap(game.map, old.map);
    // Ownership and centers only change through commands; their identity tells.
    const territoryChanged =
      game.map !== old.map || game.owners !== old.owners || game.centers !== old.centers;
    if (territoryChanged) renderTerritory(game);
    if (territoryChanged || state.selectedTile !== previous.selectedTile) {
      drawSelection(selection, game, state.selectedTile);
    }
    if (game.map !== old.map || state.hoveredTile !== previous.hoveredTile) {
      drawHover(hover, game.map, state.hoveredTile);
    }
  });

  const tileAt = (screen: Point | null): number | null => {
    if (!screen) return null;
    const hex = pixelToAxial(camera.screenToWorld(screen), TILE_SIZE);
    const index = mapGrid(gameStore.getState().game.map).indexOf(hex.q, hex.r);
    return index < 0 ? null : index;
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
  });

  const onResize = () => {
    camera.setViewport(app.screen.width, app.screen.height);
  };
  app.renderer.on('resize', onResize);

  return () => {
    app.renderer.off('resize', onResize);
    detachControls();
    unsubscribe();
    world.destroy({ children: true });
  };
}
