import { RESOURCE_KINDS } from '@hexarchy/engine';
import type {
  Age,
  BuildingKind,
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

/** Lower-case resource amounts: "4 yiyecek". */
export function resourceText(kind: keyof Resources, amount: number): string {
  return `${amount} ${RESOURCE_LABELS[kind].toLowerCase()}`;
}

/** Non-zero amounts of `resources`, signed: "+2 altın, +4 yiyecek" (empty if all zero). */
export function resourcesText(resources: Resources, sign = '+'): string {
  return RESOURCE_KINDS.filter((kind) => resources[kind] !== 0)
    .map((kind) => `${sign}${resourceText(kind, resources[kind])}`)
    .join(', ');
}

export const BUILDING_LABELS: Readonly<Record<BuildingKind, string>> = {
  farm: 'Çiftlik',
  lumberCamp: 'Kereste ocağı',
  quarry: 'Taş ocağı',
  goldMine: 'Altın madeni',
  barracks: 'Kışla',
  archeryRange: 'Atış alanı',
  stable: 'Ahır',
  workshop: 'Atölye',
  tower: 'Kule',
};

/** What a building does and where it stands (GDD 5), for tooltips. */
export const BUILDING_HINTS: Readonly<Record<BuildingKind, string>> = {
  farm: 'Ovaya kurulur. 1 yiyecek + komşu her kendi ovan için +1.',
  lumberCamp: 'Ormana komşu ova ya da tepeye kurulur. Komşu her kendi ormanın için +1 malzeme.',
  quarry: 'Tepeye kurulur. Komşu her kendi tepen ve her dağ için +1 malzeme.',
  goldMine: 'Damarlı tepeye kurulur. +3 altın, bakımı yok.',
  barracks: 'Ovaya kurulur. Bölgede piyade alımını açar.',
  archeryRange: 'Ovaya kurulur. Okçu hattını açar (M5).',
  stable: 'Ovaya kurulur. Süvari hattını açar (M5).',
  workshop: 'Ovaya kurulur. Kuşatma hattını açar (M5).',
  tower: 'Ova ya da tepeye kurulur. Kendi karosunu ve komşularını 2 güçle korur.',
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
  unknownBuilding: 'Böyle bir bina yok.',
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
  notEnoughMaterials: 'Kasada yeterli malzeme yok.',
  needsBuilding: 'Bu bölgede çalışan bir kışla gerekir.',
  ageLocked: 'Bu bina daha sonraki bir çağda açılır.',
  outsideRegion: 'Bina yalnızca kasanın bölgesine kurulur.',
  tileOccupied: 'Bu karoda zaten bir bina ya da merkez var.',
  wrongTerrain: 'Bu bina bu araziye kurulamaz.',
  needsVein: 'Altın madeni damarlı bir tepeye kurulur.',
  needsForest: 'Kereste ocağının yanında orman olmalı.',
  unreachable: 'Oraya ulaşamaz.',
  edgeBlocked: 'Dere geçilemez: köprü ya da geçit gerekir.',
  cannotCapture: 'İşçiler toprak alamaz.',
  protected: 'Karo korumalı: daha güçlü bir birim gerekir.',
  cannotMerge: 'Bu birimler birleşemez.',
  levelCap: 'Seviye kilidi: bu çağda daha yükseğe birleşemez.',
};

/** Errors the player causes by just tapping around; not worth a notice. */
export const QUIET_ERRORS: ReadonlySet<CommandError> = new Set([
  'noChange',
  'unreachable',
  'outsideRegion',
]);

function centerText(center: number | null): string {
  return center === null ? 'kasasız bölge' : `#${center}`;
}

function tilesText(tiles: readonly number[]): string {
  return tiles.map((t) => `#${t}`).join(' ');
}

function ownerName(player: PlayerId | null): string {
  return player === null ? 'tarafsız' : playerName(player);
}

const KILL_REASONS: Readonly<Record<Extract<GameEvent, { type: 'unitKilled' }>['reason'], string>> =
  {
    captured: 'karosu alındı',
    rebellion: 'açlık isyanı',
  };

/** One log line per event (null = not worth a line). */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'turnEnded':
      return null;
    case 'turnStarted':
      return `Tur ${event.round}: sıra ${playerName(event.player)}`;
    case 'income':
      return `${playerName(event.player)}: gelir ${resourcesText(event.income) || '0'} → #${event.center}`;
    case 'buildingUpkeepPaid':
      return `${playerName(event.player)}: −${event.amount} altın bina bakımı ← #${event.center}`;
    case 'buildingsIdle':
      return `${playerName(event.player)}: altın yetmedi, boşta: ${tilesText(event.tiles)} (${centerText(event.center)})`;
    case 'starvation':
      return `${playerName(event.player)}: AÇLIK ${centerText(event.center)} (bakım ${event.owed}, kasa ${event.lost}) → ${tilesText(event.tiles)} aç`;
    case 'rebellion':
      return `${playerName(event.player)}: İSYAN ${centerText(event.center)} (bakım ${event.owed}) → ${tilesText(event.tiles)}`;
    case 'buildingBuilt':
      return `${playerName(event.player)}: ${BUILDING_LABELS[event.building]} kuruldu → #${event.tile} (−${event.cost} malzeme)`;
    case 'buildingCaptured':
      return `#${event.tile}: ${BUILDING_LABELS[event.building]} ${playerName(event.from)} → ${playerName(event.to)}`;
    case 'buildingDestroyed':
      return `${playerName(event.owner)}: ${BUILDING_LABELS[event.building]} #${event.tile} yıkıldı`;
    case 'forestSpread':
      return `${playerName(event.player)}: orman yayıldı → ${tilesText(event.tiles)}`;
    case 'tileOwnerChanged':
      return `#${event.tile}: ${ownerName(event.from)} → ${ownerName(event.to)}`;
    case 'centerFounded':
      return `${playerName(event.owner)}: #${event.tile} yeni yerel merkez (boş kasa)`;
    case 'centerRemoved': {
      const what = CENTER_LABELS[event.kind].toLowerCase();
      const why = event.reason === 'captured' ? 'ele geçirildi' : 'tek karoda kaldı, kalktı';
      return `${playerName(event.owner)}: ${what} #${event.tile} ${why} (${resourcesText(event.lost, '−') || 'boş kasa'})`;
    }
    case 'treasuriesMerged':
      return `${playerName(event.owner)}: ${event.absorbed.length + 1} kasa birleşti → #${event.center} (${resourcesText(event.treasury, '') || 'boş'})`;
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
    case 'ageChanged':
      return `${playerName(event.player)}: ${AGE_LABELS[event.age]}`;
  }
}
