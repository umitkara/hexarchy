import {
  AGE_ADVANCE,
  ageUnlocks,
  AGES,
  BUILDING_KINDS,
  BUILDINGS,
  ECONOMY,
  LEVEL_CAP,
  MAX_UNIT_LEVEL,
  RESOURCE_KINDS,
  START,
  STRUCTURE_KINDS,
  STRUCTURES,
  TERRAINS,
  UNIT_LINES,
  UNITS,
  type Age,
  type Resources,
} from '@hexarchy/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { BuildingIcon } from './BuildingIcon';
import {
  AGE_LABELS,
  AGE_SHORT_LABELS,
  BUILDING_HINTS,
  BUILDING_LABELS,
  LINE_HINTS,
  LINE_LABELS,
  RESOURCE_LABELS,
  STRUCTURE_HINTS,
  STRUCTURE_LABELS,
  TERRAIN_LABELS,
  unitName,
} from './labels';
import { StructureIcon } from './StructureIcon';
import { UnitIcon } from './UnitIcon';

/** Icons in the encyclopedia wear the first player's color. */
const ICON_PLAYER = 0;

/** Ages played in v0.1: up to AGE_ADVANCE.lastAge. */
const PLAYED_AGES: readonly Age[] = AGES.slice(0, AGES.indexOf(AGE_ADVANCE.lastAge) + 1);

function resourcesList(resources: Resources): string {
  return RESOURCE_KINDS.filter((kind) => resources[kind] > 0)
    .map((kind) => `${resources[kind]} ${RESOURCE_LABELS[kind].toLowerCase()}`)
    .join(' · ');
}

function Basics() {
  const upkeep = UNITS.infantry.upkeep.slice(1).join(' / ');
  return (
    <div className="help-text">
      <h3>Amaç</h3>
      <p>
        Rakiplerin başkentlerini al. Başkentini kaybeden oyuncu elenir, kalan toprakları
        tarafsızlaşır; son kalan kazanır.
      </p>
      <h3>Bölgeler ve kasalar</h3>
      <p>
        Birbirine bağlı karoların bir bölge olur; her bölgenin merkezinde (başkent ya da yerel
        merkez) kendi kasası vardır. Alım ve inşaat o bölgenin kasasından ödenir. Köprüsüz dere
        bölgeleri ayırır. Bir bölge bölünürse kopan parçaya boş kasalı yeni bir yerel merkez
        kurulur; iki bölge birleşince kasaları toplanır.
      </p>
      <h3>Tur başı</h3>
      <p>
        Gelir → bakım → açlık. Her ova ve tepe karosu +{ECONOMY.tileGold.plains} altın verir (orman
        vermez); binalar komşularına göre üretir. Askerlerin bakımı yiyecektir (Sv1-Sv4: {upkeep}).
        Yiyecek yetmezse askerler aç kalır (−1 güç); bir dahaki tur da yetmezse isyan eder ve
        ölürler. Altın yetmezse binalar o tur boşta kalır.
      </p>
      <h3>Hareket ve savaş</h3>
      <p>
        Birimler kendi bağlı toprağında serbestçe dolaşır, dışarıya 1 adım atar (süvari 2). Bir
        karoyu almak için gücün, onu koruyan her şeyden <strong>kesin büyük</strong> olmalı. Güç =
        seviye. Koruyanlar: karodaki ve komşu karolardaki birimler, merkezler (1), kuleler (
        {BUILDINGS.tower.protection}), okçular ({UNITS.archer.protectionRadius} karo). Yakın dövüş
        koruması dere, çit ve surdan geçmez; okçu ve kule koruması geçer.
      </p>
      <h3>Birleştirme</h3>
      <p>
        Aynı hattan iki birimi üst üste koy: seviyeler toplanır (en çok Sv{MAX_UNIT_LEVEL}). Çağ
        sınırı: {PLAYED_AGES.map((a) => `${AGE_SHORT_LABELS[a]} Sv${LEVEL_CAP[a]}`).join(', ')}.
        Bakım hızla artar: bir büyük birim mi, çok küçük birim mi?
      </p>
      <h3>Başlangıç</h3>
      <p>
        Başkent + {START.territoryTiles - 1} karo, {resourcesList(START.treasury)} ve{' '}
        {START.workers} işçi. İlk iş: çiftlik ve kereste ocağı, sonra kışla.
      </p>
      <h3>Kontroller</h3>
      <ul>
        <li>
          Bölgeye dokun: kasa paneli. Birimi ya da paneldeki düğmeyi haritaya sürükle ya da önce
          ona, sonra hedef karoya dokun.
        </li>
        <li>Haritayı sürükleyerek kaydır; tekerlek ya da iki parmakla yakınlaştır.</li>
        <li>Geri al: Ctrl+Z ya da ↶. Elindekini bırak: Esc ya da Vazgeç.</li>
        <li>Hedefteki kalkanlar kimin hangi güçle koruduğunu gösterir.</li>
      </ul>
    </div>
  );
}

function Units() {
  return (
    <ul className="help-list">
      {UNIT_LINES.map((line) => {
        const stats = UNITS[line];
        const levels = Array.from(
          { length: stats.maxLevel - stats.buyLevel + 1 },
          (_, i) => stats.buyLevel + i,
        );
        const facts = [
          `${stats.cost} altın`,
          `bakım ${stats.upkeep.slice(stats.buyLevel, stats.maxLevel + 1).join('/')} yiyecek`,
          stats.requires ? `${BUILDING_LABELS[stats.requires]} gerekir` : 'bina gerekmez',
          AGE_SHORT_LABELS[stats.age],
        ];
        return (
          <li key={line} className="help-item">
            <UnitIcon line={line} level={stats.maxLevel} player={ICON_PLAYER} size={36} />
            <div>
              <h3>{LINE_LABELS[line]}</h3>
              <p className="hud-meta">{facts.join(' · ')}</p>
              <p>{LINE_HINTS[line]}</p>
              {line !== 'worker' && levels.length > 1 && (
                <p className="hud-meta">
                  {levels.map((level) => unitName({ line, level })).join(' → ')}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Buildings() {
  return (
    <ul className="help-list">
      {BUILDING_KINDS.map((kind) => {
        const stats = BUILDINGS[kind];
        const facts = [
          `${stats.cost} malzeme`,
          stats.upkeep > 0 ? `bakım ${stats.upkeep} altın` : 'bakımsız',
          AGE_SHORT_LABELS[stats.age],
        ];
        return (
          <li key={kind} className="help-item">
            <BuildingIcon building={kind} player={ICON_PLAYER} size={36} />
            <div>
              <h3>{BUILDING_LABELS[kind]}</h3>
              <p className="hud-meta">{facts.join(' · ')}</p>
              <p>{BUILDING_HINTS[kind]}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Structures() {
  return (
    <>
      <p className="help-text">
        Kenar yapılarını işçi kurar: kendi karosunun bir kenarına, bölgesinin malzemesiyle. İşçi o
        tur yorulur. Bir yapının iki yanı da başka bir oyuncuya geçerse yapı ona geçer.
      </p>
      <ul className="help-list">
        {STRUCTURE_KINDS.map((kind) => {
          const stats = STRUCTURES[kind];
          const facts = [
            `${stats.cost} malzeme`,
            AGE_SHORT_LABELS[stats.age],
            `${stats.hits} kuşatma vuruşu`,
          ];
          return (
            <li key={kind} className="help-item">
              <StructureIcon structure={kind} player={ICON_PLAYER} size={36} />
              <div>
                <h3>{STRUCTURE_LABELS[kind]}</h3>
                <p className="hud-meta">{facts.join(' · ')}</p>
                <p>{STRUCTURE_HINTS[kind]}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Ages() {
  return (
    <div className="help-text">
      <p>
        Sonraki çağın fiyatı başkent bölgesinin kasasından hemen ödenir; çağ, sonraki turunun
        başında gelir. O arada başkentin düşerse geçiş iptal olur, ödenen de gider.
      </p>
      {PLAYED_AGES.map((age) => {
        const unlocks = ageUnlocks(age);
        const cost = age === 'dark' ? undefined : AGE_ADVANCE.cost[age];
        const items = [
          ...unlocks.lines.map((l) => LINE_LABELS[l]),
          ...unlocks.buildings.map((b) => BUILDING_LABELS[b]),
          ...unlocks.structures.map((s) => STRUCTURE_LABELS[s]),
        ];
        return (
          <section key={age}>
            <h3>{AGE_LABELS[age]}</h3>
            <p className="hud-meta">
              {cost ? `Fiyat: ${resourcesList(cost)}` : 'Başlangıç çağı'} · birleştirme en çok Sv
              {unlocks.levelCap}
            </p>
            <p>{items.join(', ')}</p>
          </section>
        );
      })}
      <p className="hud-meta">Kale ve İmparatorluk çağları sonraki sürümlerde.</p>
    </div>
  );
}

const TERRAIN_NOTES = {
  plains: 'Çiftlik, askerî binalar ve kule kurulur.',
  forest: 'Kereste ocağını besler. Boş ovalara yavaşça yayılır (kereste ocağı yanında durur).',
  hill: 'Kule ve taş ocağı kurulur; damarlı tepeye altın madeni.',
  mountain: 'Sahiplenilemez, geçilemez. Taş ocağına komşuysa malzeme verir.',
  lake: 'Geçilemez.',
  sea: 'Geçilemez (gemiler sonraki sürümde).',
} as const;

function Terrain() {
  return (
    <div className="help-text">
      <ul className="help-terrain">
        {TERRAINS.map((terrain) => (
          <li key={terrain}>
            <strong>{TERRAIN_LABELS[terrain]}</strong>
            {ECONOMY.tileGold[terrain] > 0 && (
              <span className="hud-meta"> · +{ECONOMY.tileGold[terrain]} altın</span>
            )}
            <span> — {TERRAIN_NOTES[terrain]}</span>
          </li>
        ))}
        <li>
          <strong>Dere</strong>{' '}
          <span>
            — Karo kenarında akar: hareketi, yakın dövüş korumasını ve kasayı keser. Köprü bağlar.
          </span>
        </li>
        <li>
          <strong>Sığ geçit</strong> <span>— Derenin geçilebilir yeri: hiçbir şeyi kesmez.</span>
        </li>
      </ul>
    </div>
  );
}

const TOPICS: readonly {
  readonly id: string;
  readonly label: string;
  readonly body: () => ReactNode;
}[] = [
  { id: 'basics', label: 'Temeller', body: Basics },
  { id: 'units', label: 'Birimler', body: Units },
  { id: 'buildings', label: 'Binalar', body: Buildings },
  { id: 'structures', label: 'Yapılar', body: Structures },
  { id: 'ages', label: 'Çağlar', body: Ages },
  { id: 'terrain', label: 'Arazi', body: Terrain },
];

/** Simple encyclopedia (GDD 13): rules, units, buildings, structures, ages, terrain. */
export function Encyclopedia() {
  const open = useGameStore((s) => s.helpOpen);
  const setOpen = useGameStore((s) => s.setHelpOpen);
  const [topic, setTopic] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [topic]);

  if (!open) return null;
  const current = TOPICS[topic] ?? TOPICS[0];
  if (!current) return null;
  const Body = current.body;

  return (
    <div
      className="modal-backdrop help-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section className="hud-panel help" role="dialog" aria-modal="true" aria-label="Ansiklopedi">
        <header className="modal-header">
          <h2 className="modal-title">Ansiklopedi</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Kapat"
            onClick={() => {
              setOpen(false);
            }}
          >
            ×
          </button>
        </header>
        <nav className="help-tabs" role="tablist" aria-label="Konular">
          {TOPICS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="help-tab"
              aria-selected={i === topic}
              onClick={() => {
                setTopic(i);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="help-body" ref={bodyRef} role="tabpanel" aria-label={current.label}>
          <Body />
        </div>
      </section>
    </div>
  );
}
