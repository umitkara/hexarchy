import type {
  CenterKind,
  CommandError,
  EdgeKind,
  GameEvent,
  PlayerId,
  Resources,
  Terrain,
} from '@hexarchy/engine';

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

/** Player names follow their colors (render/palette.ts PLAYER_COLORS). */
const PLAYER_NAMES: readonly string[] = ['Kırmızı', 'Mavi', 'Mor', 'Turuncu'];

export function playerName(player: PlayerId): string {
  return PLAYER_NAMES[player] ?? `Oyuncu ${player + 1}`;
}

export const CENTER_LABELS: Readonly<Record<CenterKind, string>> = {
  capital: 'Başkent',
  local: 'Yerel merkez',
};

export const RESOURCE_LABELS: Readonly<Record<keyof Resources, string>> = {
  gold: 'Altın',
  food: 'Yiyecek',
  materials: 'Malzeme',
};

export const COMMAND_ERROR_LABELS: Readonly<Record<CommandError, string>> = {
  unknownTile: 'Harita dışında.',
  unknownPlayer: 'Böyle bir oyuncu yok.',
  notOwnable: 'Su ve dağ karoları sahiplenilemez.',
  capitalLocked: 'Başkent karosu boyanamaz.',
  noChange: 'Karo zaten bu sahipte.',
};

function ownerName(player: PlayerId | null): string {
  return player === null ? 'tarafsız' : playerName(player);
}

/** One log line per event (null = not worth a line). */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'turnEnded':
      return null;
    case 'turnStarted':
      return `Tur ${event.round}: sıra ${playerName(event.player)}`;
    case 'income':
      return `${playerName(event.player)}: +${event.gold} altın gelir → #${event.center}`;
    case 'tileOwnerChanged':
      return `#${event.tile}: ${ownerName(event.from)} → ${ownerName(event.to)}`;
    case 'centerFounded':
      return `${playerName(event.owner)}: #${event.tile} yeni yerel merkez (boş kasa)`;
    case 'centerRemoved': {
      const what = CENTER_LABELS[event.kind].toLowerCase();
      const why = event.reason === 'captured' ? 'ele geçirildi' : 'tek karoda kaldı, kalktı';
      return `${playerName(event.owner)}: ${what} #${event.tile} ${why} (−${event.lost.gold} altın)`;
    }
    case 'treasuriesMerged':
      return `${playerName(event.owner)}: ${event.absorbed.length + 1} kasa birleşti → #${event.center} (${event.treasury.gold} altın)`;
  }
}
