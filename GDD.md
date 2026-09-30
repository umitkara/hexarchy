# Hexarchy — Oyun Tasarım Belgesi (GDD)

> **Durum:** Taslak v0.1 · **Tarih:** 2026-09-30
> `[TASLAK]` işaretli sayılar ilk tahmindir; denge testleriyle değişecek.

---

## 1. Vizyon

**Hexarchy**, Konkr.io / Slay'in zarif hex-toprak ekonomisini temel alan; Age of Empires'ın kaynak/çağ yapısı ve Stronghold'un sur/kuşatma hissiyle genişletilmiş, **sıralı tur tabanlı bir tarayıcı strateji oyunudur.**

**Tek cümle:** *"Konkr'ın bulmaca netliği + AoE'nin ekonomi derinliği + Stronghold'un surları — 15-30 dakikalık maçlarda."*

### 1.1 Tasarım ilkeleri
1. **Çekirdeği boğma.** Konkr'ın gücü az kuraldan doğan derinliktir. Her yeni mekanik *toprak → gelir → bakım* çekirdeğiyle etkileşmeli; yan sistem olarak eklenmemeli.
2. **Her zaman hesaplanabilir.** Savaş deterministiktir, zar yok. Oyuncu her hamlenin sonucunu önceden görebilir (kalkan önizlemesi).
3. **Tek kural, istisna yok.** Örn. birleştirmede seviye her zaman toplamdır; tarif sadece hattı belirler.
4. **Harita okuma önemli.** Karo sayısı kadar *hangi karo* olduğu da önemlidir (ova, orman, tepe, su, dere kenarı).
5. **Kısa oturum.** Bir maç 15-30 dakika; tarayıcıda ve mobilde rahat oynanır.

---

## 2. Temel Oyun Döngüsü

```
Tur başı: gelir → bakım → açlık/iflas → orman yayılması → olaylar
   ↓
Oyuncu turu: genişle · inşa et · asker al · birleştir · saldır · araştır · çağ atla
   ↓  (tur içinde sınırsız geri al)
Tur sonu → AI oyuncular sırayla oynar (hızlı animasyon)
```

- **Sıralı tur:** Oyuncular sırayla oynar (Konkr gibi).
- **Maç süresi:** 15-30 dk.
- **İlk mod:** AI'ya karşı tek oyunculu. Multiplayer sonraki aşamada.

---

## 3. Harita

### 3.1 Karo (hex) tipleri
| Arazi | Altın | Üzerine | Not |
|---|---|---|---|
| Ova | +1 | Çiftlik, çoğu bina | Yiyecek temeli |
| Orman | +0 | Kereste ocağı (kenarında) | Malzeme kaynağı; yavaşça yayılır |
| Tepe | +1 | Taş ocağı, kule/kale | Bazılarında **maden damarı** |
| Dağ | — | Geçilmez | Taş ocağına komşuluk verir |
| Göl / Deniz | — | Gemiler | Balık kaynağı |

> Her sahipli kara karosu Konkr'daki gibi **+1 altın** üretir (orman hariç).

### 3.2 Kenar katmanı
**Dereler, surlar, çitler, kapılar ve köprüler hex kenarlarında yaşar**, karoların üzerinde değil. Tek sistem dört mekaniği çözer.

| Kenar | Hareket | Hazine bağlantısı | Nasıl oluşur |
|---|---|---|---|
| Dere | Keser | Keser | Harita üretimi |
| Sığ geçit | Geçer | Bağlar | Harita üretimi (nadir) |
| Köprü (dere üstü) | Geçer | Bağlar | İnşa |
| Ahşap çit | Keser (herkes) | Kesmez | İnşa; Sv3+ birim kırabilir |
| Taş sur | Keser (herkes) | Kesmez | İnşa; sadece kuşatma kırar |
| Kapı | Sahibine açık, düşmana kapalı | Kesmez | İnşa (sur üzerine) |

**Önemli sonuç:** Köprüsüz bir dere **kendi ülkeni de ikiye böler**, hem hareket hem kasa olarak. Köprü hem lojistik hem ekonomik bağlantıdır; düşmanın köprüsünü yıkmak ekonomisini bölmektir.

### 3.3 Harita üretimi
- Gürültü tabanlı **yükseklik** haritası → deniz / ova / tepe / dağ.
- **Nem** haritası → orman dağılımı.
- **Dereler** dağlardan başlayıp hex köşeleri üzerinden yokuş aşağı akar → doğal olarak kenarları takip eder. Çukurlarda **göller** oluşur.
- Arada **sığ geçit** kenarları (stratejik geçiş noktaları).
- **Adil başlangıç:** Her başlangıç noktasının 3 karo yarıçapındaki kaynaklar (ova, orman, tepe, su) eşitlenir.
- Tarafsız içerik (köy, barbar kampı, kalıntı) yerleştirilir.

### 3.4 Harita boyutları `[TASLAK]`
| Boyut | Oyuncu | Yaklaşık karo |
|---|---|---|
| Küçük | 2 | ~200 |
| Orta | 3-4 | ~400 |
| Büyük | 5-6 | ~700 |

**MVP hedefi:** Orta harita, **4 oyuncu FFA** (oyuncu + 3 AI).

---

## 4. Ekonomi

### 4.1 Kaynaklar
| Kaynak | Kaynağı | Harcandığı yer |
|---|---|---|
| **Altın** | Her kara karosu +1, altın madeni, ticaret | Asker alımı, bina bakımı, çağ, araştırma |
| **Yiyecek** | Çiftlik, balıkçı teknesi, iskele | Asker bakımı, çağ, araştırma |
| **Malzeme** (odun + taş) | Kereste ocağı, taş ocağı | Bina, kenar yapıları, gemi, çağ |

### 4.2 Bölgesel hazine (Konkr/Slay mekaniği)
- Birbirine **bağlı** (hazine grafiğinde) her sahipli toprak parçası bir **bölgedir** ve **kendi kasası** (3 kaynak) vardır.
- Her bölgenin bir **merkezi** vardır (Başkent veya Yerel merkez). Merkez kasayı tutar ve koruma 1 sağlar.
- **Bölünme:** Bir bölge ikiye ayrıldığında:
  - Merkezi içeren parça kasayı korur.
  - ≥2 karolu diğer parçaya **boş kasalı yerel merkez otomatik kurulur.**
  - Tek karolu parçalar kasasızdır; oradaki birimler açlık çeker.
- **Birleşme:** İki bölge birleşince kasalar toplanır; küçük bölgenin yerel merkezi kalkar. Başkent her zaman kalır.
- Asker alımı ve inşaat **bölgenin kasasından** yapılır; üretim binaları **o bölgedeyse** ilgili birimler alınabilir.

### 4.3 Üretim — komşuluk bulmacası
Binalar kendi karosuna ve **6 komşusuna** bakarak üretir:
| Bina | Üretim `[TASLAK]` |
|---|---|
| Çiftlik (ova) | Kendisi + her komşu sahipli ova için +1 yiyecek |
| Kereste ocağı (orman kenarı) | Her komşu sahipli orman için +1 malzeme |
| Taş ocağı (tepe) | Her komşu tepe/dağ için +1 malzeme (daha pahalı, daha verimli) |
| Altın madeni (damarlı tepe) | Sabit +3 altın |
| İskele (kıyı) | Her komşu su karosu için +1 yiyecek |

Düşman komşu karoları alırsa üretim düşer → **kuşatmanın ekonomik anlamı** var.

### 4.4 Bakım
| | Alım | Tur başı bakım |
|---|---|---|
| Sv1 asker | 10 altın | 1 yiyecek |
| Sv2 asker | (birleştirme) | 3 yiyecek |
| Sv3 asker | (birleştirme) | 9 yiyecek |
| Sv4 asker | (birleştirme) | 27 yiyecek |
| İşçi | 8 altın `[TASLAK]` | 1 yiyecek |
| Bina | malzeme | 1-2 altın |

Üstel bakım, Konkr'ın "bir süper birim mi, çok sayıda küçük birim mi?" gerilimini korur. Birleştirme **her zaman** bakımı artırır (1+1=2 < 3).

### 4.5 Açlık ve iflas (hafif Stronghold)
- **Yiyecek açığı:** Kasa 0'a çekilir, bölgedeki tüm askerler **Aç** durumuna geçer (**−1 güç**).
- **Üst üste 2. tur açlık:** Açık kapanana kadar en yüksek bakımlı birimler **isyan eder** (ölür veya tarafsızlaşır). `[TASLAK]`
- **Altın açığı:** Bakımı ödenemeyen binalar bu tur **üretmez**. `[TASLAK]`

**Kuşatma dinamiği:** Surla çevrili şehir kendi çiftlikleri kadar dayanır; çevre ovalar alınırsa içerideki ordu aç kalır.

### 4.6 Orman yayılması
- Ormanlar yavaşça komşu **boş ova** karolarına yayılır (bina/çiftlik olmayan). Ormanlaşan karo altın üretmez.
- Kereste ocağı çevresinde yayılma durur.
- = "Bakımsız toprak" cezası + malzeme fırsatı.

### 4.7 Başlangıç `[TASLAK]`
Her oyuncu: **Başkent + ~7 karo**, kasa: 20 altın, 10 yiyecek, 10 malzeme, 1 işçi. Harita geri kalanı tarafsız.

---

## 5. Binalar

- **Binalar** Konkr gibi **anında** kurulur: bölge kasasında yeterli malzeme olması yeter, işçi gerekmez.
- **Kenar yapıları** (çit, sur, kapı, köprü) için kenarın yanındaki karolardan birinde **işçi veya mühendis** bulunmalıdır. İnşa anında biter; işçi o tur tekrar hareket edemez.

### 5.1 Ekonomi binaları `[TASLAK maliyetler]`
| Bina | Yer | Maliyet | Bakım | Çağ |
|---|---|---|---|---|
| Başkent | — | başlangıç | 0 | — |
| Yerel merkez | — | otomatik | 0 | — |
| Çiftlik | Ova | 5 M | 1 A | Karanlık |
| Kereste ocağı | Orman kenarı | 4 M | 1 A | Karanlık |
| Taş ocağı | Tepe | 10 M | 1 A | Feodal |
| Altın madeni | Damarlı tepe | 10 M | 0 | Karanlık |
| İskele | Kıyı | 8 M | 1 A | Feodal |
| Pazar yeri | — | 15 M | 2 A | Feodal |

### 5.2 Askeri binalar
| Bina | Açtığı | Maliyet | Çağ |
|---|---|---|---|
| Kışla | Piyade | 8 M | Karanlık |
| Atış alanı | Okçu | 8 M | Karanlık |
| Ahır | Süvari | 10 M | Feodal |
| Atölye | Kuşatma (Koçbaşı Feodal, Mancınık/Trebuchet sonraki çağlar) | 15 M | Feodal |
| Kule | Koruma **2** | 10 M | Feodal |
| Kale | Koruma **3**, başkent taşıma noktası | 30 M | Kale |

### 5.3 Kenar yapıları
| Yapı | Maliyet | Çağ | Kural |
|---|---|---|---|
| Ahşap çit | 2 M | Karanlık | Sv3+ birim kırabilir |
| Taş sur | 5 M | Feodal | Sadece kuşatma kırar |
| Kapı | 4 M | Feodal | Sur üzerine; sahibine açık |
| Köprü | 6 M | Feodal | Dere kenarına |

- Kenar inşası için kenarın **en az bir yanındaki karo** oyuncuya ait olmalı ve orada işçi/mühendis bulunmalı.
- **Sahiplik:** Kenar yapısı kurucusuna aittir. Kenarın **iki yanı da** başka bir oyuncuya geçerse yapı o oyuncunun olur. Tek yanı alınırsa sahibi değişmez (düşman surla karşı karşıya kalır).

---

## 6. Birimler

### 6.1 Birim hatları
| Hat | Sv1 | Sv2 | Sv3 | Sv4 | Rol |
|---|---|---|---|---|---|
| **Piyade** | Milis | Mızrakçı | Pikeman | Muhafız | Süvariye karşı +1, sağlam savunma |
| **Okçu** | Okçu | Arbaletçi | Uzun yaycı | — | Koruma yarıçapı 2, baskı atışı |
| **Süvari** | Keşif atlısı | Hafif süvari | Şövalye | Paladin | Dışarı 2 adım, okçu/kuşatmaya +1 |
| **Kuşatma** | Koçbaşı | Mancınık | Trebuchet | — | Kenar/bina kırar; birimlere karşı zayıf |
| **Destek** | İşçi (sv0) | Mühendis (sv0) | | | İnşa; savaş gücü 0 |
| **Deniz** | Balıkçı | Nakliye | Savaş gemisi | Kadırga | Yiyecek / taşıma / deniz kontrolü |

### 6.2 Birleştirme (merge)
- **Seviye kuralı (Slay toplamı):** Sonuç seviyesi = seviyelerin toplamı, **maksimum 4.**
  - Sv1+Sv1 = Sv2 · Sv1+Sv2 = Sv3 · Sv2+Sv2 = Sv4 · Sv1+Sv3 = Sv4
- **Hat kuralı:** Aynı hattan iki birim → aynı hat. Farklı hatlar → sadece **tarif** varsa birleşir; hattı tarif belirler.
- Birleşen birim o tur tekrar hareket edemez (Konkr).

### 6.3 Tarifler (açık, çağa bağlı)
Ansiklopedide görünür, ilgili çağda aktifleşir; sürükleme sırasında sonuç önizlenir.
| Tarif | Sonuç | Çağ |
|---|---|---|
| İşçi + İşçi | Mühendis | Kale |
| Mızrakçı (sv2) + Keşif atlısı (sv1) | Şövalye (sv3 süvari) | Kale |
| Okçu (sv1) + Keşif atlısı (sv1) | Atlı okçu (sv2, özel) | Kale |
| Mühendis + Koçbaşı (sv1) | Mancınık (sv2 kuşatma) | İmparatorluk |

### 6.4 Hareket
- **Kendi bağlı toprağında serbest hareket** (hareket grafiğinde), **dışarıya 1 adım** (süvari 2).
- Hareket grafiğini köprüsüz dere, sur ve çit keser; kapı sahibine açıktır.
- Tarafsız karoya adım atmak = ele geçirmek (koruması yoksa).

---

## 7. Savaş

### 7.1 Kural (deterministik)
> Saldırı başarılı ⟺ saldırganın gücü, hedef karoyu **koruyan her savunmacıdan** kesin olarak büyük.
> **Güç = seviye + o savunmacıya karşı karşılık bonusu.**

**Koruma sağlayanlar:** Karodaki birim, komşu sahipli karolardaki birimler (Konkr), Merkez (1), Kule (2), Kale (3), Okçular (yarıçap 2).

**Kenarlar ve koruma:**
- **Yakın dövüş birimlerinin** ve merkezin koruması dere/çit/sur kenarından **geçmez** (köprü, geçit ve kapı geçer).
- **Okçu ve kule** koruması kenarlardan **geçer**.
- Sonuç: Sur içindeki piyade dışarıdaki karoyu savunamaz; sur arkasındaki okçular ve kuleler savunur → *"sur + okçu = kale."* Dereler doğal savunma hattıdır.

### 7.2 Karşılık bonusları `[TASLAK]`
| Saldıran → Savunan | Bonus |
|---|---|
| Piyade → Süvari | +1 |
| Süvari → Okçu | +1 |
| Süvari → Kuşatma | +1 |
| Kuşatma → Bina / kenar | tam güç |
| Kuşatma → Birim | güç 0 (birimli karoyu alamaz) |

### 7.3 Okçu baskı atışı
Okçu, 2 karo içindeki düşman birimine **kenar engellerinden bağımsız** atış yapar → hedef tur sonuna kadar **−1 güç.** Okçu o tur hareket etmez. (Sur arkasından savunma + yakın dövüşçüyle kombinasyon.)

### 7.4 Kenar üzerinden saldırı
- Köprüsüz dere / düşman suru / çit üzerinden **saldırı yapılamaz** (geçit ve kapı hariç kurallar geçerli).
- **Kuşatma:** Koçbaşı komşu çiti 1 turda, taş suru/kapıyı 2 turda kırar. Mancınık 2 menzilden kenar/bina kırar. `[TASLAK]`

### 7.5 Arayüz
Hover/sürükleme sırasında hedef karoda **kalkan ikonları**: kim, hangi güçle koruyor. Oyuncu her zaman sonucu görür.

---

## 8. Su ve Gemiler

- **Göl ve deniz** = su karoları. **Dere** = kenar.
- **İlk sürüm:** Balıkçı teknesi + Nakliye. Deniz savaşı sonraki aşama.
- **Balıkçı:** Su karosunda durur, +yiyecek (bağlı iskelenin bölgesine).
- **Nakliye:** Kıyıdan **1 birim** alır (seviye fark etmez), su karolarında hareket eder, karşı kıyıya indirir. İndirme = dışarıya 1 adım (saldırı olabilir). Birleştirme mekaniğiyle uyumlu: tek bir Sv4 taşımak güçlü ama pahalı.
- Nakliye bağlantısı hazineleri birleştirmez (sadece köprü/geçit/kara bağlar).

---

## 9. İlerleme

### 9.1 Çağlar
Çağ atlamak pahalıdır ve **1 tur sürer** (risk penceresi). Hedef: her çağ ~5-8 turda.
| Çağ | Maliyet `[TASLAK]` | Açtıkları |
|---|---|---|
| Karanlık | — | İşçi, Milis, Okçu, Çiftlik, Kereste ocağı, Altın madeni, Ahşap çit, Kışla, Atış alanı |
| Feodal | 50A / 30Y / 20M | Sv3 birleştirme, Köprü, Taş sur, Kapı, Kule, Ahır (süvari hattı), Taş ocağı, İskele, Balıkçı, Pazar, **Atölye, Koçbaşı** |
| Kale | 120A / 80Y / 60M | Mühendis, tarifler (Şövalye, Atlı okçu), Nakliye, Kale |
| İmparatorluk | 250A / 150Y / 120M | Mancınık, Trebuchet, Sv4 birimler, son tarifler |

**Seviye kilidi (birleştirmeyle ulaşılabilecek en yüksek seviye):**
| Çağ | Maks. seviye |
|---|---|
| Karanlık | Sv2 |
| Feodal | Sv3 |
| Kale | Sv3 + tarifler |
| İmparatorluk | Sv4 |

Çağ atlamayı askeri olarak da anlamlı kılar ve erken "Sv4 rush"ı engeller.

**Ödeme:** Çağ atlama (ve araştırmalar `[TASLAK]`) **başkentin bölgesinin kasasından** ödenir. Başkent bölgesini büyük ve bağlı tutmak ödüllendirilir; düşmanı bölmek onun çağını da geciktirir.

### 9.2 Araştırmalar (bina başına 2-3) `[TASLAK]`
| Bina | Araştırma | Etki |
|---|---|---|
| Çiftlik | Ağır saban | +1 yiyecek / çiftlik |
| Çiftlik | Ürün rotasyonu | Çiftlik komşularına orman yayılmaz |
| Merkez | Nöbetçi | Merkez koruması +1 |
| Merkez | Vergi defteri | +%10 altın |
| Kule | Kaynar yağ | Sura saldıran kuşatma 1 tur geri itilir |
| Pazar | Kervan | Ticaret geliri +%50 |
| Ahır | Nal | Süvari dışarı 3 adım |
| Kereste | Çift balta | +1 malzeme / kereste ocağı |

---

## 10. Tarafsız İçerik

| İçerik | Davranış `[TASLAK]` |
|---|---|
| **Tarafsız köy** | Korumalı (güç 1-2); ele geçirilince bonus kaynak veya özel birim |
| **Barbar kampı** | Her N turda en yakın sınıra baskın; güç çağla artar; yok edilince ödül |
| **Kalıntı / harabe** | Birim üzerine girince tek seferlik ödül (kaynak, araştırma, birim) |
| **Ticaret yolu** | İki Pazar yeri (veya Pazar + tarafsız köy) arası bağlantı altın üretir; uzunluğa göre gelir; kesilebilir |

Gelir, Pazar yerinin bulunduğu **bölgenin kasasına** gider → uzak ticaret karakolu kendi kendine yaşayabilir.

---

## 11. Zafer

- **Başkent fethi:** Rakibin başkenti alınırsa:
  - Başka bir **Kalesi** varsa başkent oraya taşınır — ceza: kasa kaybı (%50) + 1 tur **Kargaşa** (asker alınamaz). `[TASLAK]`
  - Kalesi yoksa **elenir**; kalan bölgeleri tarafsızlaşır.
- Son kalan oyuncu kazanır.

---

## 12. Yapay Zekâ

- **Utility AI:** Olası hamleleri puanlar, açgözlü seçer. Deterministik oyun motoru bunu kolaylaştırır.
- **Öncelikler:** ekonomi dengesi (bakım/gelir), tehdit altındaki sınırı savunma, **düşman bölgesini bölen karoya saldırı**, çağ zamanlaması, tarafsız genişleme.
- **Zorluk:** tahmin derinliği + kaynak bonusu.

---

## 13. Arayüz / UX

- **Platform:** Masaüstü (fare) ve mobil (dokunmatik) **eşit**, responsive.
- **Bölge seçimi** → kasa paneli (3 kaynak, gelir/gider önizlemesi).
- **Asker alımı:** Konkr gibi panelden sürükle-bırak.
- **Kenar modu:** Kenarlara dokunarak sur/köprü/kapı inşası.
- **Birim sürükleme:** Geçerli hedefler vurgulanır, kalkan önizlemesi, birleştirme sonucu önizlemesi.
- **Tur içinde sınırsız geri al** (deterministik motor sayesinde).
- **Ansiklopedi:** Birimler, tarifler, binalar, çağlar.

---

## 14. Görsel Tarz

**Düz, temiz vektör** (Konkr gibi): renkli düz hex'ler, sade ikonlar, net kenar çizgileri (dere mavi şerit, sur kalın çizgi, köprü belirgin). Mobilde okunaklılık öncelik.

---

## 15. Teknik Yaklaşım

- **Dil:** TypeScript (strict) · **Build:** Vite · **Paket yöneticisi:** pnpm workspace
- **Render:** PixiJS (WebGL) · **UI (HUD/menüler):** React, canvas üstünde DOM overlay
- **Yapı:** `packages/engine` (saf, DOM'suz, deterministik oyun motoru) + `apps/client` (render + UI)
- **Saf, deterministik oyun motoru:** Render'dan tamamen ayrı; tohumlu RNG; komut (command) tabanlı durum değişimi → geri al, tekrar oynatma, AI simülasyonu ve ileride sunucu-otoriteli multiplayer aynı çekirdeği kullanır.
- **Test:** Vitest ile motor kuralları için birim testleri.
- Ayrıntılı uygulama planı: [`PLAN.md`](PLAN.md)

---

## 16. Yol Haritası

| Aşama | Kapsam |
|---|---|
| **v0.1 (MVP)** | Kara haritası, 3 kaynak, bölgesel hazine, birleştirme (toplam), kenar sistemi (dere, köprü, sur/çit), 2 çağ, temel binalar, basit utility AI, geri al |
| **v0.2** | Su ve gemiler (balıkçı, nakliye), 4 çağ, tarifler, araştırmalar |
| **v0.3** | Tarafsız içerik (köy, barbar, kalıntı, ticaret yolu), orman yayılması ince ayarı |
| **v0.4+** | Online multiplayer, deniz savaşı, harita editörü, kampanya |

---

## 17. Açık Sorular

1. Denge sayıları: bina/çağ maliyetleri, karşılık bonusları, üretim oranları.
2. Gemilerin seviye/birleştirme kuralları; balıkçı ve nakliye saldırıya açık mı?
3. Araştırmalar da başkent bölgesinden mi ödenir, yoksa binanın bulunduğu bölgeden mi?
4. Barbar baskın sıklığı ve gücü; ticaret yolu kurulum/kesilme kuralları.

---

## 18. Karar Günlüğü

| # | Karar | Seçilen | Alternatifler |
|---|---|---|---|
| 1 | Tempo | Sıralı tur | Eşzamanlı tur, gerçek zamanlı, tick |
| 2 | Ekonomi derinliği | 3 kaynak | Tek altın, 4 kaynak |
| 3 | İşçi mekaniği | Hibrit (bina + komşuluk) | Karoya işçi koyma, soyut |
| 4 | İlk mod | Tek oyunculu vs AI | Online, sıcak koltuk |
| 5 | Kaynak seti | Altın + Yiyecek + Malzeme | 4 kaynak, yiyeceksiz |
| 6 | Savaş | Deterministik + karşılık bonusu | Saf Konkr, HP sistemi |
| 7 | Sur/dere yeri | Kenar katmanı | Karo tabanlı, karışık |
| 8 | Maç süresi | 15-30 dk | 5-15, 45+ |
| 9 | Birleştirme | Aynı hat + tarifler | Sadece aynı hat, serbest |
| 10 | Hareket | Konkr + kenar engeli | Hareket puanı |
| 11 | Deniz (ilk) | Balıkçı + Nakliye | Tam deniz savaşı, gemisiz |
| 12 | Görsel | Düz vektör | El çizimi, piksel, izometrik |
| 13 | İlerleme | Çağlar + araştırma | Sadece çağ, teknoloji ağacı |
| 14 | Zafer | Başkent fethi | Tam fetih, çoklu zafer |
| 15 | Memnuniyet | Hafif (açlık → −1 güç → isyan) | Yok, tam Stronghold |
| 16 | Hazine | Bölgesel | Global, hibrit |
| 17 | Başlangıç | Başkent + tarafsız toprak | Dağınık, karma |
| 18 | Bakım | Alım altın, bakım yiyecek 1/3/9/27 | Altın bakım, ikisi |
| 19 | Tarafsız içerik | Köy, barbar, kalıntı, ticaret yolu (hepsi) | — |
| 20 | Bölünme | Otomatik yerel merkez | Merkez inşa edilmeli |
| 21 | Başkent kaybı | Kale varsa taşınır | Anında elenme, geri alma süresi |
| 22 | Kod adı | Hexarchy | Sur ve Sancak, Edgeholds, Tilecraft |
| 23 | Birleştirme matematiği | Slay toplamı (max 4) | Sadece eş seviye |
| 24 | Tarif sunumu | Açık, çağa bağlı | Gizli, araştırmayla |
| 25 | Orman | Yavaşça yayılır | Statik |
| 26 | Platform | Masaüstü + mobil eşit | Masaüstü/mobil öncelikli |
| 27 | İnşaat | Bina anında; kenar yapısı yanında işçi ister | Her şey anında, her şey süreli işçiyle |
| 28 | Seviye kilidi | K=Sv2, F=Sv3, Kale=Sv3+tarif, İmp=Sv4 | Serbest seviyeler |
| 29 | Çağ ödemesi | Başkent bölgesi kasası | Çoklu bölge, ulusal hazine |
| 30 | Kenar sahipliği | İki yanı da geçerse el değiştirir | Hep kurucunun, alınınca yıkılır |
| 31 | Koruma ve kenarlar | Yakın dövüş geçmez, okçu/kule geçer | Kenarlar etkilemez, hiçbiri geçmez |
| 32 | Nakliye kapasitesi | 1 birim, seviye fark etmez | Seviye kapasitesi, 2 birim |
| 33 | Varsayımlar | İki bağlantı grafiği, okçu baskı atışı, kuşatma birimlere 0, nakliye kasa birleştirmez → onaylandı | — |
| 34 | MVP formatı | Orta harita, 4 oyuncu FFA | 1v1 küçük, ayarlanabilir |
| 35 | Render | PixiJS (WebGL) | Canvas 2D, SVG/DOM |
| 36 | UI katmanı | React | Svelte, vanilla |
| 37 | Proje yapısı | pnpm workspace: engine + client | Tek Vite uygulaması |
| 38 | İşbölümü | Claude kodlar, kullanıcı yönlendirir ve kilometre taşlarında test eder | Birlikte kodlama, öğretici |
| 39 | Koçbaşı/Atölye çağı | Feodal (taş surla aynı çağ) | v0.1'e 3 çağ, v0.1'de taş sur yok |
