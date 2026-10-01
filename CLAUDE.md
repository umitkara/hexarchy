# Hexarchy

Konkr.io/Slay tabanlı; Age of Empires ve Stronghold'dan esinlenmiş, **sıralı tur tabanlı hex
tarayıcı strateji oyunu**. Tek oyunculu (oyuncu + AI), 15-30 dakikalık maçlar, masaüstü ve mobil.

- **Tasarım:** [`GDD.md`](GDD.md) — oyun kuralları, denge taslakları, karar günlüğü.
- **Uygulama planı:** [`PLAN.md`](PLAN.md) — mimari (bölüm 2) ve kilometre taşları M0–M8 (bölüm 3).

Bir kilometre taşına başlamadan önce ikisinin ilgili bölümlerini oku. Kural sorularında GDD.md
tek doğruluk kaynağıdır; belirsizlik varsa tahmin etme, sor.

## Çalışma kuralları

- Kodu Claude yazar; kullanıcı her kilometre taşının sonunda oynayıp geri bildirim verir.
- Her kilometre taşı ayrı, temiz bir oturumda yapılır. **Sadece istenen kilometre taşını yap**,
  bir sonrakine geçme.
- İletişim **Türkçe**; kod, tanımlayıcılar, yorumlar ve commit mesajları **İngilizce**.
- Kilometre taşı bitmeden önce `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
  hatasız geçmeli; görsel değişiklikler tarayıcıda kontrol edilmeli.

## Komutlar

Gereksinimler: Node >= 22.12, pnpm 11.

| Komut            | Ne yapar                                           |
| ---------------- | -------------------------------------------------- |
| `pnpm install`   | Bağımlılıkları kurar                               |
| `pnpm dev`       | Client dev sunucusu (Vite) — http://localhost:5173 |
| `pnpm build`     | Client üretim derlemesi (`apps/client/dist`)       |
| `pnpm test`      | Tüm Vitest testleri (engine)                       |
| `pnpm lint`      | ESLint (type-aware) + Prettier kontrolü            |
| `pnpm format`    | Prettier ile tüm dosyaları biçimlendirir           |
| `pnpm typecheck` | Tüm paketlerde `tsc`                               |

Tek paket için: `pnpm --filter @hexarchy/engine test:watch`.

Yayın: `main`e her push `.github/workflows/deploy.yml` ile denetlenip GitHub Pages'e çıkar —
https://umitkara.github.io/hexarchy/. `?debug` debug panelini açar, `?seed=N` menünün tohumunu doldurur.

## Yapı

```
packages/engine/   @hexarchy/engine — saf TS oyun motoru (kaynaktan tüketilir, build adımı yok)
  src/hex, map, state, rules, commands, ai/   (PLAN.md 2.1)
  src/state/game.ts   GameState (düz JSON; oyuncu advancing/eliminated, stats); activePlayers,
                   winnerOf, isGameOver; src/state/setup.ts createGame
  src/rules/       saf kural fonksiyonları (bölgeler, merkezler, ekonomi, tur, hareket, koruma,
                   yerleştirme = checkPlacement/targetOptions, bakım); draft üzerinde
                   buildings.ts checkBuild/buildOptions/buildingOutput (bina kuralları + üretim)
                   turnStart.ts turnStartForecast = tur başı ekonomisi (gelir → bakım → açlık);
                   applyTurnStart aynı tahmini uygular (kasa paneli tahmini = gerçek)
                   forest.ts orman yayılması (rng.ts ile)
                   edgeState.ts kenar = doğal özellik (dere/geçit) + yapı; hareket, kasa ve
                   koruma grafları kenarları buradan okur; structures.ts kenar yapısı kurma/
                   kırma kuralları + sahiplik (karar 30); volley.ts okçu baskı atışı
                   ages.ts çağ atlama (checkAdvanceAge, ageUnlocks; geçiş tur başında,
                   gelirden önce tamamlanır); elimination.ts takeTile = karo alma + başkent
                   fethinde eleme/tarafsızlaştırma + zafer; stats.ts recordStats = maç
                   istatistikleri komut olaylarından sayılır (debug hariç)
  src/commands/    Command birliği + validate/apply (Immer) → {state, events}; oyun bitince
                   her komut 'gameOver'; edges.ts buildEdge/breachEdge; ages.ts advanceAge;
                   history.ts tur içi geri al, legal.ts legalCommands (AI/fuzz için)
  src/ai/          Utility AI (GDD 12, karar 72): view.ts analyze = adım başı analiz (tehdit/koruma
                   haritası, karo değeri, risk, bölge ekonomisi + çağ birikimi, kişilik);
                   score.ts puanlar (riskDelta, takeGain, mergeFuture, buildScore, canFeed);
                   turn.ts adaylar + aiStep/chooseCommand/playAiTurn (açgözlü, tur başı sınırlı)
  src/balance.ts   TÜM denge sayıları burada (AI ağırlıkları: `AI` bölümü)
  src/rng.ts       tohumlu RNG — tüm rastgelelik buradan
  test/            Vitest testleri
  test/fixtures/   ASCII harita fikstürleri (format: ascii.ts başındaki yorum) + invariant'lar
  test/aiMatch.ts  AI'ya karşı AI maç yardımcısı (oyuncu sayısı seçilebilir); aiSmoke1-5 = 50
                   tohumlu smoke testi (5 dosya, paralel koşsun diye); ai.test.ts AI birim
                   testleri; save.test.ts kayıt (JSON gidiş-dönüş) + 2-3 oyunculu oyunlar
apps/client/       @hexarchy/client — Vite + React + PixiJS (base './': GitHub Pages alt yolu)
  src/render/      Pixi: uygulama, sahne, katmanlar, kamera (imperatif, React dışında)
  src/input/       pointer (fare + dokunmatik), kamera; dragDrop.ts panelden haritaya sürükleme
  src/ui/          React HUD (canvas üstünde overlay); AgePanel.tsx çağ düğmesi + paneli,
                   GameOver.tsx bitiş ekranı, Notice.tsx hata bildirimi + büyük haber bandı,
                   Menu.tsx ana menü (devam et, yeni oyun: tohum + AI sayısı, ses),
                   Encyclopedia.tsx ansiklopedi (sayılar balance.ts'den); DebugPanel yalnızca
                   ?debug ile (src/debug.ts)
  src/audio/       sound.ts: WebAudio sentez sesler, komut başına bir ses (feed'den), sessize alma
                   ayarı
  src/store/       gameStore (zustand): TurnHistory + UI durumu (seçim, eldeki birim/bina/eylem =
                   HandSource, sürükleme, hotseat (varsayılan kapalı = 3 AI'ya karşı),
                   agePanelOpen, resultsHidden, menuOpen/helpOpen, started, settings); komutlar
                   `dispatch` ile (AI turunda reddedilir), turun komutları `commands`'ta, son
                   komutun olayları `feed`'de (animasyon + ses);
                   isDecided = oyun bitti ya da (AI'a karşı) insan elendi; isAiTurn; stepAi/skipAi
                   + aiTurn/aiFast/aiMove/aiTaken; news = haber kuyruğu (Notice)
                   aiDriver.ts: AI turlarını zamanlayıcıyla adım adım oynatır (App'te başlar;
                   menü açıkken bekler); save.ts localStorage kaydı (tur başı durumu + turun
                   komutları, yüklerken yeniden oynatılır → geri alma korunur) + ayarlar;
                   autosave.ts her değişiklikte (gecikmeli) ve sayfa gizlenince kaydeder;
                   ui/AiBanner.tsx "Oyuncu N oynuyor · Atla"; render/aiGraphics.ts AI vurguları
                   render/tileLayout.ts: merkez + bina + birim aynı karodaysa ikon yerleri
                   render/effects.ts olay animasyonları (kayma, belirme, karo parlaması, halka,
                   ok, dalga); oynarken birimin karosu birim katmanından düşülür (hidden)
                   render/structureGraphics.ts kenar yapıları; kenar eylemlerinde (işçi yapısı,
                   kır) birimin kendi karosunda kenara yakın dokunuş o kenarı seçer (scene.ts)
```

## Mimari sınır kuralı (ihlal edilemez)

**`packages/engine` asla `apps/client`'a, Pixi'ye, React'e, tarayıcı API'lerine (DOM, `window`,
`localStorage`, ...) veya Node API'lerine bağımlı olamaz.** Bağımlılık yönü tek yönlüdür:
client → engine.

- Engine tsconfig'i yalnızca ES kütüphanesini içerir (`lib: ["ES2023"]`, `types: []`); DOM/Node
  global'leri derleme hatası verir.
- ESLint engine içinde `pixi.js`, `react*`, `@hexarchy/client`, `apps/**` ve `node:*`
  import'larını; ayrıca determinizm için `Math.random` ve `Date.now`'u yasaklar.
- Engine deterministiktir: tüm rastgelelik `rng.ts` üzerinden, durumdaki tohumla. Aynı tohum +
  aynı komutlar = aynı oyun.
- Durum serileştirilebilir düz JSON'dur; türetilmiş veri (bölgeler, koruma haritası...) saklanmaz,
  hesaplanır. Durum değişimi yalnızca komutlarla (`validate` / `apply`) olur; UI ve AI aynı
  kural fonksiyonlarını kullanır.
- Denge sayıları kodun içine gömülmez, `balance.ts`'den okunur.

## Kodlama notları

- TypeScript strict + `noUncheckedIndexedAccess`; `any` yok.
- TypeScript 6.0.x'te sabit (typescript-eslint henüz TS 7'yi desteklemiyor).
- Pixi v8 imperatif kullanılır (`@pixi/react` yok); React yalnızca host elementini ve HUD'u yönetir.
  StrictMode çift mount'una dikkat: bkz. `apps/client/src/render/GameCanvas.tsx`.
- HUD katmanı `pointer-events: none`; yalnızca paneller olayları yakalar, geri kalanı canvas'a düşer.
- Metin dosyaları LF (`.gitattributes`).
