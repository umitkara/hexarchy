import { edgeTiles, RESOURCE_KINDS } from '@hexarchy/engine';
import type {
  Age,
  BuildingKind,
  CenterKind,
  CommandError,
  EdgeKey,
  EdgeKind,
  GameEvent,
  PlayerId,
  Resources,
  StructureKind,
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
  archeryRange: 'Ovaya kurulur. Bölgede okçu alımını açar.',
  stable: 'Ovaya kurulur. Bölgede süvari alımını açar.',
  workshop: 'Ovaya kurulur. Bölgede koçbaşı alımını açar.',
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
  archer: 'Okçu',
  cavalry: 'Süvari',
  siege: 'Koçbaşı',
  worker: 'İşçi',
};

/** What each line is good at (GDD 6.1, 7.2), for tooltips. */
export const LINE_HINTS: Readonly<Record<UnitLine, string>> = {
  infantry: 'Süvariye saldırırken +1.',
  archer: '2 karo uzağı, kenarların ardını da korur. Baskı atışı: düşman birime −1 güç.',
  cavalry: 'Dışarı 2 adım gider. Okçuya ve kuşatmaya saldırırken +1.',
  siege: 'Kenar yapılarını kırar (çit 1, sur/kapı 2 vuruş). Birimli karoyu alamaz.',
  worker: 'Savaşamaz. Karosunun kenarlarına çit, sur, kapı ve köprü kurar.',
};

/** Unit names by line and level (GDD 6.1). */
const UNIT_NAMES: Readonly<Record<UnitLine, readonly string[]>> = {
  infantry: ['', 'Milis', 'Mızrakçı', 'Pikeman', 'Muhafız'],
  archer: ['', 'Okçu', 'Arbaletçi', 'Uzun yaycı'],
  cavalry: ['', 'Keşif atlısı', 'Hafif süvari', 'Şövalye', 'Paladin'],
  siege: ['', 'Koçbaşı'],
  worker: ['İşçi'],
};

export const STRUCTURE_LABELS: Readonly<Record<StructureKind, string>> = {
  fence: 'Çit',
  wall: 'Taş sur',
  gate: 'Kapı',
  bridge: 'Köprü',
};

/** What an edge structure does (GDD 3.2, 5.3), for tooltips. */
export const STRUCTURE_HINTS: Readonly<Record<StructureKind, string>> = {
  fence: 'Hareketi keser (herkes), kasayı kesmez. Koçbaşı ya da Sv3+ kırar.',
  wall: 'Kendi çitinin yerine. Hareketi keser; yalnızca kuşatma kırar (2 vuruş).',
  gate: 'Kendi surunun yerine. Sahibine açık, düşmana kapalı sur.',
  bridge: 'Derenin üstüne. Hareketi ve kasayı bağlar.',
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
  needsBuilding: 'Bu bölgede bu hattın çalışan binası gerekir.',
  ageLocked: 'Daha sonraki bir çağda açılır.',
  outsideRegion: 'Bina yalnızca kasanın bölgesine kurulur.',
  tileOccupied: 'Bu karoda zaten bir bina ya da merkez var.',
  wrongTerrain: 'Bu bina bu araziye kurulamaz.',
  needsVein: 'Altın madeni damarlı bir tepeye kurulur.',
  needsForest: 'Kereste ocağının yanında orman olmalı.',
  unreachable: 'Oraya ulaşamaz.',
  edgeBlocked: 'Kenar geçilemez (dere, çit ya da sur).',
  cannotCapture: 'İşçiler toprak alamaz.',
  protected: 'Karo korumalı: daha güçlü bir birim gerekir.',
  cannotMerge: 'Bu birimler birleşemez.',
  levelCap: 'Seviye kilidi: bu çağda daha yükseğe birleşemez.',
  lineMaxLevel: 'Bu hat daha yükseğe birleşemez.',
  unknownStructure: 'Böyle bir yapı yok.',
  cannotBuildEdges: 'Kenar yapılarını yalnızca işçi kurar.',
  notAdjacent: 'Birimin karosuna komşu bir kenar seç.',
  needsRiver: 'Köprü yalnızca dere üstüne kurulur.',
  riverEdge: 'Dere üstüne yalnızca köprü kurulur.',
  edgeOccupied: 'Bu kenarda zaten bir yapı var.',
  needsWall: 'Kapı yalnızca kendi surunun yerine kurulur.',
  cannotBreach: 'Bu birim bu yapıyı kıramaz.',
  noStructure: 'Bu kenarda yapı yok.',
  ownStructure: 'Kendi yapını kıramazsın.',
  cannotVolley: 'Yalnızca okçular baskı atışı yapar.',
  outOfRange: 'Menzil dışında (en fazla 2 karo).',
  notEnemy: 'Hedef düşman birimi olmalı.',
  alreadySuppressed: 'Bu birim zaten baskı altında.',
  noEffect: 'Bu birimin gücü zaten 0.',
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

/** The side between two tiles, e.g. "#184–#210". */
function edgeText(edge: EdgeKey): string {
  const [a, b] = edgeTiles(edge);
  return `#${a}–#${b}`;
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
    case 'edgeBuilt': {
      const what = STRUCTURE_LABELS[event.structure];
      const over = event.replaces
        ? ` (${STRUCTURE_LABELS[event.replaces].toLowerCase()} yerine)`
        : '';
      return `${playerName(event.player)}: ${what} kuruldu ${edgeText(event.edge)}${over} (−${event.cost} malzeme)`;
    }
    case 'edgeDamaged':
      return `${playerName(event.player)}: ${STRUCTURE_LABELS[event.structure]} ${edgeText(event.edge)} hasar ${event.damage}/${event.hits}`;
    case 'edgeDestroyed':
      return `${playerName(event.player)}: ${playerName(event.owner)} ${STRUCTURE_LABELS[event.structure].toLowerCase()} ${edgeText(event.edge)} yıkıldı`;
    case 'edgeCaptured':
      return `${edgeText(event.edge)}: ${STRUCTURE_LABELS[event.structure]} ${playerName(event.from)} → ${playerName(event.to)}`;
    case 'volley':
      return `${playerName(event.player)}: baskı atışı #${event.from} → ${unitName(event.unit)} #${event.target} (−1 güç)`;
  }
}
