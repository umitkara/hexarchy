import {
  hexBounds,
  isLand,
  mapGrid,
  pixelToAxial,
  type GameMap,
  type Point,
  type Rect,
} from '@hexarchy/engine';
import { Container, Graphics, type Application } from 'pixi.js';
import { attachCameraControls } from '../input/cameraControls';
import { mapStore } from '../store/mapStore';
import { Camera } from './camera';
import { createLayers } from './layers';
import { drawEdges, drawHover, drawTerrain, TILE_SIZE } from './mapGraphics';

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

/** Map scene: static map layers, hover highlight, camera and its pointer controls. */
export function createScene(app: Application): () => void {
  // A render group: camera moves only update one GPU transform, children stay untouched.
  const world = new Container({ isRenderGroup: true, eventMode: 'none' });
  app.stage.addChild(world);
  const layers = createLayers(world);

  const terrainBase = new Graphics();
  const terrainGlyphs = new Graphics();
  layers.terrain.addChild(terrainBase, terrainGlyphs);
  const edges = new Graphics();
  layers.edges.addChild(edges);
  const hover = new Graphics();
  layers.highlights.addChild(hover);

  const camera = new Camera({ fitPadding: 16, minZoomOfFit: 0.85, maxZoom: 4 }, () => {
    camera.applyTo(world);
  });
  camera.setViewport(app.screen.width, app.screen.height);

  const renderMap = (map: GameMap, previous?: GameMap) => {
    drawTerrain(terrainBase, terrainGlyphs, map);
    drawEdges(edges, map);
    drawHover(hover, map, mapStore.getState().hoveredTile);
    camera.setWorldBounds(viewBounds(map));
    // Keep the view when regenerating the same map shape, so seeds can be compared.
    if (previous?.shape.radius !== map.shape.radius) camera.fit();
  };
  renderMap(mapStore.getState().map);

  const unsubscribe = mapStore.subscribe((state, previous) => {
    if (state.map !== previous.map) {
      renderMap(state.map, previous.map);
    } else if (state.hoveredTile !== previous.hoveredTile) {
      drawHover(hover, state.map, state.hoveredTile);
    }
  });

  const tileAt = (screen: Point | null): number | null => {
    if (!screen) return null;
    const hex = pixelToAxial(camera.screenToWorld(screen), TILE_SIZE);
    const index = mapGrid(mapStore.getState().map).indexOf(hex.q, hex.r);
    return index < 0 ? null : index;
  };
  const detachControls = attachCameraControls({
    element: app.canvas,
    camera,
    onHover: (screen) => {
      mapStore.getState().setHoveredTile(tileAt(screen));
    },
    onTap: (screen) => {
      mapStore.getState().setHoveredTile(tileAt(screen));
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
