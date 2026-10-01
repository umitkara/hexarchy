# Hexarchy — v0.1 Uygulama Planı

> **Tarih:** 2026-09-30 · Tasarım kaynağı: [`GDD.md`](GDD.md)
> **İşbölümü:** Claude kodlar; kullanıcı her kilometre taşında oynayıp geri bildirim verir.

---

## 1. v0.1 Kapsamı

**Hedef:** Tarayıcıda, oyuncu + 3 AI, orta harita (~400 karo), 4 oyunculu FFA; Karanlık + Feodal çağ; 15-30 dk'lık tam bir maç.

### Dahil
| Alan | İçerik |
|---|---|
| Harita | Ova, orman, tepe (maden damarlı), dağ, göl/deniz (engel); dereler (kenar), sığ geçitler; adil başlangıç |
| Ekonomi | Altın / Yiyecek / Malzeme, bölgesel hazine, bölünme/birleşme, bakım, açlık, orman yayılması |
| Binalar | Başkent, yerel merkez, çiftlik, kereste ocağı, taş ocağı, altın madeni, kışla, atış alanı, ahır, atölye, kule |
| Kenar yapıları | Ahşap çit, taş sur, kapı, köprü (işçi gerekir), sahiplik kuralı |
| Birimler | İşçi; Piyade Sv1-3; Okçu Sv1-3 (baskı atışı); Süvari Sv1-3; Koçbaşı |
| Savaş | Deterministik güç + karşılık bonusu, koruma (kenar kuralları dahil), kalkan önizlemesi |
| İlerleme | Karanlık → Feodal (seviye kilidi Sv2 → Sv3), başkent bölgesinden ödeme |
| Zafer | Başkent fethi → **elenme** (v0.1'de Kale yok, taşınma yok) |
| AI | Utility AI, 1 zorluk seviyesi |
| UX | Masaüstü + mobil, sürükle-bırak, tur içinde geri al, yeni oyun menüsü, oyun sonu ekranı, localStorage kayıt |

### Hariç (sonraki sürümler)
Gemiler ve iskele (v0.2), Kale/İmparatorluk çağları, tarifler, araştırmalar, mühendis, kale binası, başkent taşınması (v0.2) · Tarafsız içerik, pazar, ticaret (v0.3) · Multiplayer (v0.4+)

---

## 2. Mimari

### 2.1 Repo yapısı
```
hexarchy/
├── GDD.md, PLAN.md
├── package.json              # pnpm workspace kökü
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   └── engine/               # Saf TS: DOM yok, Pixi yok, React yok
│       ├── src/
│       │   ├── hex/          # koordinatlar, komşuluk, kenar anahtarları, köşeler
│       │   ├── map/          # harita üretimi (gürültü, dereler, başlangıçlar)
│       │   ├── state/        # GameState tipleri, başlangıç durumu
│       │   ├── rules/        # bölgeler, hareket, koruma, savaş, ekonomi, çağlar
│       │   ├── commands/     # komut tipleri + applyCommand + doğrulama
│       │   ├── ai/           # utility AI
│       │   ├── balance.ts    # TÜM denge sayıları tek yerde
│       │   └── rng.ts        # tohumlu RNG
│       └── test/             # Vitest + ASCII harita fikstürleri
└── apps/
    └── client/               # Vite + React + PixiJS
        └── src/
            ├── render/       # Pixi katmanları, kamera, animasyon
            ├── input/        # pointer (fare+dokunmatik), sürükle-bırak, kenar modu
            ├── ui/           # React HUD: kasa paneli, alım paneli, menüler
            └── store/        # oyun durumu köprüsü (zustand)
```

### 2.2 Motor (engine) temel kararları
- **Koordinatlar:** Axial `(q, r)`. Karolar düz dizi (`tiles[index]`); komşular önceden hesaplanır.
- **Kenarlar:** İki karo indeksinin sıralı çifti → `EdgeKey`. `edges: Map<EdgeKey, EdgeFeature>` (dere, geçit, köprü, çit, sur, kapı + sahip).
- **Köşeler:** Sadece harita üretiminde (dere akışı köşeden köşeye → kenar dizisi).
- **Durum:** Serileştirilebilir düz JSON (`GameState`): tur, sıradaki oyuncu, oyuncular (çağ, elenme), karolar (arazi, sahip, bina, birim), kenarlar, hazineler (merkez karosuna bağlı), RNG durumu.
- **Türetilmiş veri:** Bölgeler (hazine grafiği), hareket erişilebilirliği, koruma haritası — durumdan hesaplanır, önbelleğe alınır; asla ayrıca saklanmaz (tek doğruluk kaynağı).
- **Komutlar:** `BuyUnit`, `MoveUnit` (hareket/ele geçirme/birleştirme), `Build`, `BuildEdge`, `ArcherVolley`, `AdvanceAge`, `EndTurn`.
  - `validate(state, cmd)` → hata veya OK; `apply(state, cmd)` → `{ state, events }`.
  - UI ve AI aynı `getLegalCommands` / `validate` fonksiyonlarını kullanır → kural tek yerde.
- **Değişmezlik:** Immer ile saf güncellemeler; React'e yapısal paylaşım bedava.
- **Geri al:** Tur içi durum anlık görüntü yığını (durum küçük, ~400 karo). `EndTurn` yığını temizler.
- **Determinizm:** Tüm rastgelelik (harita, orman yayılması) `rng.ts` üzerinden, durumdaki tohumla. Aynı tohum + aynı komutlar = aynı oyun (tekrar oynatma ve ileride multiplayer için).
- **Olaylar (events):** `apply` animasyon için olay listesi döndürür (birim hareket etti, karo alındı, bölge bölündü, açlık...).

### 2.3 İstemci (client)
- **Pixi katmanları (alttan üste):** arazi → bölge sınırları/sahiplik renkleri → kenarlar (dere, sur, köprü) → binalar → birimler → vurgular/önizlemeler.
- **Kamera:** Sürükleyerek kaydırma, tekerlek/pinch ile zoom (pixi-viewport v8 uyumluysa, değilse basit özel kamera — M1'de karar).
- **Girdi:** Pointer Events (fare+dokunmatik tek yol). Birim sürükleme → geçerli hedefler + kalkan önizlemesi; kenar modu → kenar hit-test.
- **React HUD:** Canvas üstünde overlay. Zustand store motor durumunu tutar; Pixi ve React aynı store'a abone.

### 2.4 Test stratejisi
- Her kural modülü için Vitest birim testleri.
- **ASCII harita fikstürleri:** Kuralları küçük elle çizilmiş haritalarla test etmek için metin formatı, örn:
  ```
  . A1 A  | B2 .
  ~ A  A# B  B
  ```
  (`A1` = A oyuncusu Sv1 birim, `|` = sur kenarı, `~` = su ...) — format M2'de netleşir.
- Senaryo testleri: bölünme, açlık, kenar el değiştirme, koruma kenar kuralı.
- AI duman testi: 4 AI tohumlu 50 maç oynar → çökme yok, maçlar biter, ortalama tur sayısı raporlanır (denge sinyali).

---

## 3. Kilometre Taşları

Her kilometre taşı sonunda **oynanabilir bir sürüm** ve kullanıcı testi var. ✅ = kabul kriteri.

### M0 — İskelet
- git init, pnpm workspace, TS strict, ESLint/Prettier, Vitest.
- `packages/engine` + `apps/client` (Vite + React + Pixi) boş iskelet.
- ✅ `pnpm dev` açılır, boş canvas + React HUD görünür; `pnpm test` çalışır.

### M1 — Hex harita ve kamera
- Hex matematiği, kenar anahtarları, köşeler.
- Harita üretimi: yükseklik/nem gürültüsü → arazi; dereler köşelerden kenarlara; göller; sığ geçitler; maden damarları.
- Pixi render: düz vektör karolar, dere kenarları; kamera (pan/zoom, mobil pinch).
- Tohum girişli debug paneli (farklı haritalar üret).
- ✅ **Test:** Farklı tohumlarla haritaları gez; dereler doğal görünüyor mu, mobilde akıcı mı?

### M2 — Toprak, bölgeler, tur döngüsü
- Sahiplik, 4 başlangıç noktası (adil başlangıç), başkent.
- Hazine grafiği, bölge hesaplama, bölünme (otomatik yerel merkez) / birleşme.
- Tur döngüsü (sadece altın geliri), sıradaki oyuncu, `EndTurn`.
- Sahiplik renkleri ve bölge sınırları render; bölge seçimi → kasa paneli.
- Debug: karoyu boya (bölünme/birleşme testleri için).
- ✅ **Test:** Debug ile bölgeleri böl/birleştir; kasalar ve merkezler doğru davranıyor mu?

### M3 — Konkr çekirdeği: birimler ve savaş
- Asker alımı (sürükle-bırak), hareket grafiği (kendi toprağında serbest + dışarı 1 adım), tarafsız karo ele geçirme.
- Koruma haritası (kenar kuralı dahil), deterministik saldırı, kalkan önizlemesi.
- Birleştirme (Slay toplamı + seviye kilidi), asker bakımı (bu aşamada geçici olarak altından).
- Tur içi geri al.
- **Hotseat debug modu:** tüm oyuncuları insan yönetir.
- ✅ **Test — kritik kontrol noktası:** *"Konkr çekirdeği bu haliyle eğlenceli mi?"* Kenar/dere etkisi hissediliyor mu?

### M4 — Ekonomi
- Yiyecek ve malzeme; bakımın yiyeceğe taşınması (1/3/9/27).
- Binalar: çiftlik, kereste ocağı, taş ocağı, altın madeni, kışla, atış alanı, ahır, atölye, kule; komşuluk üretimi; bina bakımı.
- Bina yerleştirmede üretim önizlemesi (“bu çiftlik +4 yiyecek verir”).
- Tur başı sırası: gelir → bakım → açlık/iflas → orman yayılması.
- Açlık (−1 güç → isyan), altın açığı (bina üretmez).
- ✅ **Test:** Ekonomi okunaklı mı? Kasa paneli gelir/gider tahmini doğru mu? Açlık adil hissettiriyor mu?

### M5 — Kenar yapıları ve askeri hatlar
- İşçi; çit / taş sur / kapı / köprü inşası (kenar modu); kenar sahipliği kuralı.
- Hareket ve hazine grafiklerinin kenar kuralları (köprü bağlar, sur hareketi keser).
- Birim hatları: piyade, okçu (koruma yarıçapı 2, kenardan geçen koruma, baskı atışı), süvari (dışarı 2 adım), koçbaşı (çit 1 tur, sur/kapı 2 tur), kule.
- Karşılık bonusları.
- ✅ **Test:** Sur + okçu savunması ve koçbaşıyla kuşatma çalışıyor mu? Köprü yıkıp ekonomi bölmek tatmin edici mi?

### M6 — Çağlar ve zafer
- Karanlık → Feodal (başkent bölgesinden ödeme, 1 tur geçiş), içerik kilitleri, seviye kilidi.
- Başkent fethi → elenme, kalan bölgelerin tarafsızlaşması; son kalan kazanır.
- Oyun sonu ekranı (özet istatistikler).
- ✅ **Test:** Hotseat ile baştan sona tam maç.

### M7 — Yapay zekâ
- Utility AI: aday komutları üret → puanla → açgözlü uygula, tur bitene kadar tekrar.
- Puanlama: gelir/bakım dengesi, tehdit altındaki sınır, bölen saldırılar, genişleme, bina yerleşimi, çağ zamanlaması, kenar yapıları (dere geçişine köprü, sınır suru).
- AI duman testleri (50 tohumlu maç).
- AI turlarının hızlı animasyonu.
- ✅ **Test:** 3 AI'ya karşı maç; AI rakip gibi hissettiriyor mu, aptalca hatalar?

### M8 — Cila ve yayın
- Yeni oyun menüsü (tohum, AI sayısı), localStorage kaydet/devam et.
- Mobil UX geçişi (dokunma hedefleri, dikey/yatay yerleşim).
- Animasyonlar, basit ses (opsiyonel), basit ansiklopedi.
- Denge geçişi (`balance.ts` + AI duman testi istatistikleri).
- Statik hosting'e yayın: GitHub Pages (açık repo, `main`e push → GitHub Actions; karar 83).
- ✅ **Test:** Arkadaşlara link gönderilebilir, 15-30 dk'lık keyifli bir maç.

---

## 4. Riskler

| Risk | Önlem |
|---|---|
| Kenar sistemi render/hit-test karmaşıklığı | M1'de erken çöz; kenar modunda geniş dokunma alanı |
| Kural etkileşimlerinde hata (bölünme × kenar × açlık) | ASCII fikstürlü senaryo testleri, kurallar tek yerde |
| Konkr çekirdeği genişlemelerle eğlencesini kaybeder | M3 sonunda kritik oyun testi; sonra her mekanikte "çekirdeği güçlendiriyor mu?" sorusu |
| AI zayıf kalır | Motor saf ve hızlı → AI simülasyonu ucuz; M7'ye yeterli zaman |
| Mobilde performans | Pixi + statik katmanların önbelleklenmesi; M1'de mobilde ölç |
| Denge | Tüm sayılar `balance.ts`'de; AI-vs-AI istatistikleri |
