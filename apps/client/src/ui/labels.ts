import type {
  Age,
  CenterKind,
  CommandError,
  EdgeKind,
  GameEvent,
  PlayerId,
  Resources,
  Terrain,
  Unit,
  UnitLine,
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

export const AGE_LABELS: Readonly<Record<Age, string>> = {
  dark: 'Karanlık Çağ',
  feudal: 'Feodal Çağ',
  castle: 'Kale Çağı',
  imperial: 'İmparatorluk Çağı',
};

export const LINE_LABELS: Readonly<Record<UnitLine, string>> = {
  infantry: 'Piyade',
  worker: 'İşçi',
};

/** Unit names by line and level (GDD 6.1). */
const UNIT_NAMES: Readonly<Record<UnitLine, readonly string[]>> = {
  infantry: ['', 'Milis', 'Mızrakçı', 'Pikeman', 'Muhafız'],
  worker: ['İşçi'],
};

export function unitName(unit: Pick<Unit, 'line' | 'level'>): string {
  const name = UNIT_NAMES[unit.line][unit.level] ?? LINE_LABELS[unit.line];
  return unit.line === 'worker' ? name : `${name} (Sv${unit.level})`;
}

export const COMMAND_ERROR_LABELS: Readonly<Record<CommandError, string>> = {
  unknownTile: 'Harita dışında.',
  unknownPlayer: 'Böyle bir oyuncu yok.',
  unknownUnit: 'Böyle bir birim yok.',
  unknownAge: 'Böyle bir çağ yok.',
  notOwnable: 'Su ve dağ karoları sahiplenilemez.',
  capitalLocked: 'Başkent alınamaz (başkent fethi M6’da).',
  noChange: 'Değişiklik yok.',
  noUnit: 'Bu karoda birim yok.',
  notYourUnit: 'Bu birim senin değil.',
  exhausted: 'Bu birim bu tur işini bitirdi.',
  noTreasury: 'Bu bölgenin kasası yok.',
  notYourRegion: 'Bu kasa senin değil.',
  notEnoughGold: 'Kasada yeterli altın yok.',
  unreachable: 'Oraya ulaşamaz.',
  edgeBlocked: 'Dere geçilemez: köprü ya da geçit gerekir.',
  cannotCapture: 'İşçiler toprak alamaz.',
  protected: 'Karo korumalı: daha güçlü bir birim gerekir.',
  cannotMerge: 'Bu birimler birleşemez.',
  levelCap: 'Seviye kilidi: bu çağda daha yükseğe birleşemez.',
};

/** Errors the player causes by just tapping around; not worth a notice. */
export const QUIET_ERRORS: ReadonlySet<CommandError> = new Set(['noChange', 'unreachable']);

function ownerName(player: PlayerId | null): string {
  return player === null ? 'tarafsız' : playerName(player);
}

const KILL_REASONS: Readonly<Record<Extract<GameEvent, { type: 'unitKilled' }>['reason'], string>> =
  {
    captured: 'karosu alındı',
    bankrupt: 'iflas',
    noTreasury: 'kasasız bölge',
  };

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
    case 'unitBought':
      return `${playerName(event.player)}: ${LINE_LABELS[event.line]} alındı → #${event.tile} (−${event.cost} altın)`;
    case 'unitMoved':
      return `${playerName(event.player)}: birim #${event.from} → #${event.to}`;
    case 'unitsMerged':
      return `${playerName(event.player)}: birleşme → ${unitName(event.unit)} #${event.tile}`;
    case 'unitKilled':
      return `${playerName(event.owner)}: ${unitName(event.unit)} #${event.tile} öldü (${KILL_REASONS[event.reason]})`;
    case 'upkeepPaid':
      return `${playerName(event.player)}: −${event.amount} ${RESOURCE_LABELS[event.resource].toLowerCase()} bakım ← #${event.center}`;
    case 'bankrupt':
      return `${playerName(event.player)}: #${event.center} İFLAS (bakım ${event.owed}, kasa ${event.lost})`;
    case 'ageChanged':
      return `${playerName(event.player)}: ${AGE_LABELS[event.age]}`;
  }
}
