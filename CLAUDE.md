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
| `pnpm test`      | Tüm Vitest testleri (şimdilik engine)              |
| `pnpm lint`      | ESLint (type-aware) + Prettier kontrolü            |
| `pnpm format`    | Prettier ile tüm dosyaları biçimlendirir           |
| `pnpm typecheck` | Tüm paketlerde `tsc`                               |

Tek paket için: `pnpm --filter @hexarchy/engine test:watch`.

## Yapı

```
packages/engine/   @hexarchy/engine — saf TS oyun motoru (kaynaktan tüketilir, build adımı yok)
  src/hex, map, state, rules, commands, ai/   (PLAN.md 2.1)
  src/state/game.ts   GameState (düz JSON); src/state/setup.ts createGame
  src/rules/       saf kural fonksiyonları (bölgeler, merkezler, ekonomi, tur, hareket, koruma,
                   yerleştirme = checkPlacement/targetOptions, bakım); draft üzerinde
  src/commands/    Command birliği + validate/apply (Immer) → {state, events};
                   history.ts tur içi geri al, legal.ts legalCommands (AI/fuzz için)
  src/balance.ts   TÜM denge sayıları burada
  src/rng.ts       tohumlu RNG — tüm rastgelelik buradan
  test/            Vitest testleri
  test/fixtures/   ASCII harita fikstürleri (format: ascii.ts başındaki yorum) + invariant'lar
apps/client/       @hexarchy/client — Vite + React + PixiJS
  src/render/      Pixi: uygulama, sahne, katmanlar, kamera (imperatif, React dışında)
  src/input/       pointer (fare + dokunmatik), kamera; dragDrop.ts panelden haritaya sürükleme
  src/ui/          React HUD (canvas üstünde overlay)
  src/store/       gameStore (zustand): TurnHistory + UI durumu (seçim, eldeki birim, sürükleme,
                   hotseat); komutlar `dispatch` ile
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
