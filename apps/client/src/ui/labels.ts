import type { EdgeKind, Terrain } from '@hexarchy/engine';

/** Turkish UI labels (identifiers stay English). */
export const TERRAIN_LABELS: Readonly<Record<Terrain, string>> = {
  sea: 'Deniz',
  lake: 'Göl',
  plains: 'Ova',
  forest: 'Orman',
  hill: 'Tepe',
  mountain: 'Dağ',
};

export const EDGE_LABELS: Readonly<Record<EdgeKind, string>> = {
  river: 'dere',
  ford: 'sığ geçit',
};
