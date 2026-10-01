import { Container } from 'pixi.js';

/**
 * World layers, bottom to top (PLAN.md 2.3). Created up front so later milestones only
 * fill them in: territory (M2), buildings (M4), units (M3).
 */
export const LAYER_ORDER = [
  'terrain',
  'territory',
  'edges',
  'buildings',
  'units',
  'effects',
  'highlights',
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];
export type Layers = Readonly<Record<LayerName, Container>>;

export function createLayers(world: Container): Layers {
  const layers = {} as Record<LayerName, Container>;
  for (const name of LAYER_ORDER) {
    const layer = new Container({ label: name });
    world.addChild(layer);
    layers[name] = layer;
  }
  return layers;
}
