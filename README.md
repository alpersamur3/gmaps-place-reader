<div align="center">

# gmaps-place-reader

**Read Google Maps places with a real browser: business details, menu items and the complete dated menu album, and dated reviews. No Places API key, no Google account.**

[![npm version](https://img.shields.io/npm/v/gmaps-place-reader.svg)](https://www.npmjs.com/package/gmaps-place-reader)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/alpersamur3/gmaps-place-reader/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/gmaps-place-reader.svg)](https://nodejs.org)

**[🇬🇧 English](#english)** &nbsp;·&nbsp; **[🇹🇷 Türkçe](#turkce)**

[npm](https://www.npmjs.com/package/gmaps-place-reader) · [GitHub](https://github.com/alpersamur3/gmaps-place-reader) · [Issues](https://github.com/alpersamur3/gmaps-place-reader/issues)

</div>

---

<details open>
<summary><h2 id="english">🇬🇧 English</h2></summary>

### Contents

[Features](#features) · [Install](#install) · [Quick start](#quick-start) · [Documentation](#documentation) · [API](#api) · [Command line](#command-line) · [Configuration](#configuration) · [Full view without an account](#full-view-without-an-account) · [Limitations](#limitations) · [Disclaimer](#disclaimer)

### Features

- **Search** Google Maps by keyword and location and collect up to 60 places per query (scrolling and de-duplication included).
- **Business details:** name, address, phone, website, rating, review count, opening hours per day, business type, price level, coordinates, place id and CID.
- **About content:** business description when Google provides one and categorized attributes such as access, service, atmosphere and payment options.
- **The complete menu photo album.** The Menu strip on the overview only renders a few thumbnails even when it says "Photo 1/12", so the album is read in the full-screen photo viewer. Every photo comes with its full-size URL, **original dimensions** and **the month it was taken** (`taken_at`, e.g. `2026-01`), which lets you prefer the newest menu when older photos show outdated prices.
- **Menu items and prices** from the Menu tab, by category.
- **Full view without an account.** Google shows anonymous browsers either a limited or the full place page. A persistent profile keeps the full view, and the reader repairs a limited view by itself; every result says which view it got (`view`). A Google account would add nothing: in our tests a signed-in session returned exactly the same data. See [Full view without an account](docs/full-view.md).
- **Detailed, dated reviews on request:** reviewer, rating (rating-only reviews included), full text, owner response, likes, attached photos, sub-ratings and other details (`Yiyecek: 5`, price per person …), edit and "translated by Google" markers. Each review gets its **exact posting date** (`date_iso`) read from the data Google sends to the page, checked against the "2 months ago" label; otherwise an approximate date (`date_estimate`) with its precision. Optional **newest-first** order (`reviewSort: 'newest'`); the list is paged to the end, so every review can be read.
- **One-link lookup:** pass a Google Maps link to `readPlaceUrl` or `gmaps-place --url ...` — `maps.app.goo.gl` share links, links on any Google country domain (`google.com.tr`, …), `?cid=` links, and links copied while the Menu or Reviews tab was open.
- **General photos** from the place gallery; menu photos, avatars and size variants of the same image are removed.
- **EU cookie consent** is handled by choosing **"Reject all"**; nothing is ever accepted.
- **Honest results:** missing data is never reported as "absent". Statuses and warnings (`limited_view`, `consent_required`, `blocked`, `truncated`, …) tell you exactly what could not be read.
- Plain ESM on top of [`puppeteer-core`](https://pptr.dev) and your own Chrome or Chromium. No API keys, no browser download.

### Install

```bash
npm install gmaps-place-reader
```

Requires **Node.js 20+** and an installed **Chrome or Chromium**. The package uses `puppeteer-core` and never downloads a browser. On Windows the default Chrome location is used automatically; on Linux and macOS set `MAPS_CHROME_PATH`:

```bash
export MAPS_CHROME_PATH=/usr/bin/google-chrome   # or /usr/bin/chromium
```

### Quick start

```js
import { launchBrowser, newMapsPage, searchPlaces, readPlace } from 'gmaps-place-reader';

// A persistent profile keeps Google's full view; no account or cookies needed.
const browser = await launchBrowser({ userDataDir: '/absolute/path/gmaps-profile' });
try {
  const page = await newMapsPage(browser);
  const found = await searchPlaces(page, { location: 'Kadıköy, İstanbul', keyword: 'cafe', limit: 5 });

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12, includeReviews: true, maxReviews: 100 });
  console.log(place.status, place.view, place.name, place.phone, place.rating, place.review_count);
  console.log(place.reviews.reviews[0]?.date_iso, place.reviews.reviews[0]?.text);

  // Newest menu photos first
  const menu = [...place.menu.images].sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''));
  for (const photo of menu) console.log(photo.taken_at, `${photo.width}x${photo.height}`, photo.url);
} finally {
  await browser.close();
}
```

### Documentation

Detailed documentation lives in [`docs/`](docs/README.md): [full view without an account](docs/full-view.md) · [API reference](docs/api.md) · [data reference](docs/data.md) (every field) · [command line](docs/cli.md) · [statuses, warnings and troubleshooting](docs/troubleshooting.md).

### API

| Function | Returns |
|---|---|
| `launchBrowser(options?)` | A Puppeteer browser. Options: `executablePath`, `userDataDir` (persistent profile, recommended), `headless` (default `true`). |
| `newMapsPage(browser)` | A page prepared for Maps (desktop user agent, Turkish UI). |
| `searchPlaces(page, { location, keyword?, limit?, maxScrolls? })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated }`. `limit` is capped at 60. |
| `readPlace(page, place, { includeReviews?, maxReviews?, maxReviewScrolls?, reviewSort?, maxImages?, maxMenuImages?, maxScrolls?, recoverView?, onProgress? })` | Business details and About attributes, plus `menu`, `photos`, optional `reviews`, `view`, `warnings` and `data_quality`. Reviews default off; the limit defaults to 100 and can be raised to 10,000. `recoverView` (default `true`) repairs a limited view. |
| `readPlaceUrl(browser, url, options?)` | Opens a Maps place URL, reads the same details, then closes its page. Accepts regular Maps links and `maps.app.goo.gl` share links. |
| `readReviews(page, { reviewCount?, maxReviews?, maxScrolls?, sort?, onProgress? })` | Opens the Reviews tab, expands full review text and scrolls the list. Returns review records and explicit truncation/coverage fields. `maxScrolls` defaults to 25 and can be raised to 1,000. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Only the menu album: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages?, includeReviews?, maxReviews?, maxReviewScrolls? })` | Search and details in one call; optionally collects reviews and returns `{ status, items, skipped_known }` with normalized records. Places listed in `known` (`{ source: 'google_maps_browser', source_id }`) are skipped. |
| `toObservation(place, detail)` | Flattens a `readPlace` result into one record (`schema_version: 'gmaps.place.v1'`) with `assets`, `menu_assets` and optional reviews. |

Helpers: `normalizePlaceUrl(url)` (check a link before launching a browser), `fullImageUrl(url)` (large variant of a Google photo URL), `placeIdentity(url)`, `pageStatus(page)`, `passConsent(page)`, `parseRelativeAge(label)`, `estimateReviewDate(label)`, `checkView(browser, url?)` (`{ view, renewed }`, repairs a limited view).
Subpath exports: `gmaps-place-reader/media`, `/details`, `/reviews`.

Review options: `includeReviews` (default `false`), `maxReviews` (100, up to 10,000), `maxReviewScrolls` (25, up to 1,000 — each step loads about 10 reviews), `reviewSort` (`relevant` · `newest` · `highest` · `lowest`). Review fields: `review_id`, `author`, `author_summary`, `rating`, `text`, `date_label`, `date_iso`, `date_estimate`, `date_precision` (`exact`, `day`, `week`, `month`, `year` …), `edited`, `edited_estimate` (approximate edit date of an edited review), `translated`, `photos`, `owner_response`, `likes`, `language`, `details` (the structured lines under a review: sub-ratings such as `{ name: 'Yiyecek', value: '5' }` and rows such as `{ name: 'Kişi başı fiyat', value: '₺400–600' }`). The `reviews` result also reports `sort_label` and `sort_applied`; when the requested order could not be chosen, `warnings` contains `REVIEW_SORT_NOT_APPLIED`.

Every result carries `view` (`full` · `limited` · `unknown`). Every function, option and field: [docs/api.md](docs/api.md), [docs/data.md](docs/data.md).

**Statuses:** `ok`, `incomplete` (some parts could not be read, see `warnings`), `limited_view`, `auth_required`, `consent_required`, `blocked`, `unavailable`. Common warnings: `MENU_PHOTOS_UNAVAILABLE` (menu items were read but the menu photo album could not be opened), `REVIEWS_UNAVAILABLE`, `REVIEW_SORT_NOT_APPLIED`, `LIMITED_VIEW`, and `…_LIMIT_OR_SCROLL_LIMIT` when your own limits stopped a list.

### Command line

The commands write one JSON response to stdout (exit code `2` on failure, with an `error_code`). Set `MAPS_PROFILE_DIR` to a persistent profile; no account or cookies are used. All flags and fields: [docs/cli.md](docs/cli.md).

```bash
# One place by link: details, menu, photos and the 300 newest reviews with dates
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-place --url "https://maps.app.goo.gl/your-place-link" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40

# Search + details for several places (JSON request on stdin)
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"cafe","limit":5}' \
  | MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-scan

# Keep the profile in the full view (cron, hourly): exit code 0 = full view, 3 = limited
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-view
```

### Configuration

| Environment variable | Option | Purpose |
|---|---|---|
| `MAPS_CHROME_PATH` | `executablePath` | Chrome or Chromium binary |
| `MAPS_PROFILE_DIR` | `userDataDir` | Persistent, private browser profile (absolute path). **Recommended:** it keeps the full view. |

Command-line flags and JSON request fields take priority over the environment.

### Full view without an account

Google Maps shows anonymous browsers either a **limited view** (no Menu tab, no menu items or prices, often no menu album, fewer details) or the **full view**. In our tests the browser's anonymous id cookie decided it: `__Secure-ENID` in the EU, `NID` elsewhere. Google issues each id in one of the two classes and the id keeps it (ENID about 13 months, NID about 6). It works from any IP address, but only with a user agent of the same operating system. Signing in does not change the class, and a signed-in session returned exactly the same data as the anonymous full view.

- **Use a persistent profile** (`MAPS_PROFILE_DIR` / `userDataDir`). It keeps the anonymous id.
- **Limited view?** `readPlace` reloads the place once. If the profile still holds a limited id, it brings in a full-view id from up to six fresh temporary profiles. If none gets one, the place comes back as `limited_view` with `view: 'limited'`, and later places in that browser are not retried.
- **Run `gmaps-view` hourly** (cron). It reports `"view"`, repairs a limited view, and exits with `0` only for the full view.
- **No account, no cookie files.** The reader never signs in and loads no cookies. A signed-in session returned the same data in our tests, and Google revokes sessions whose cookies are moved to another machine (within minutes to two hours).

Details, measurements and tips: [docs/full-view.md](docs/full-view.md).

Chrome or Chromium is needed in every case. It runs headless, so no desktop is required; on Linux run it as a normal user, not root. Keep the profile folder private.

### Limitations

- Reads the **Turkish** Google Maps interface: every Maps URL is opened with `hl=tr`, so the server locale and the browser language do not matter. English labels are recognized as well.
- Google changes the Maps markup regularly, so selectors may need updates. When that happens you get `unavailable` or `incomplete` instead of wrong data.
- Search radius is not an exact filter; Maps text search decides what is "nearby".
- Exact review dates come from Google's own page data and are accepted only when they agree with the visible label; when they cannot be matched, `date_estimate` is derived from the label and `date_precision` says how coarse it is. For an edited review the label shows the edit age, while `date_iso` is the original posting date. Paging limits are reported through `truncated` and `coverage_complete`. Reading thousands of reviews takes minutes (about 10 per step).
- Keep volumes small and pause between requests. CAPTCHAs and verification pages are never bypassed.

### Disclaimer

**Use at your own risk.** This project is not affiliated with or endorsed by Google. Automated access to Google Maps may conflict with the [Google Maps Terms of Service](https://www.google.com/help/terms_maps/). You are responsible for how you use this library and for complying with the applicable terms and laws. Photos, reviews and texts belong to their respective owners.

### Development

```bash
git clone https://github.com/alpersamur3/gmaps-place-reader.git
cd gmaps-place-reader
npm install
npm test   # node --test, runs against local fixture pages; needs Chrome (MAPS_CHROME_PATH on Linux/macOS)
```

Issues and pull requests are welcome.

### License

[MIT](https://github.com/alpersamur3/gmaps-place-reader/blob/main/LICENSE) © Alper Samur

</details>

<details open>
<summary><h2 id="turkce">🇹🇷 Türkçe</h2></summary>

### İçindekiler

[Özellikler](#özellikler) · [Kurulum](#kurulum) · [Hızlı başlangıç](#hızlı-başlangıç) · [Dokümantasyon](#dokümantasyon) · [API](#api-1) · [Komut satırı](#komut-satırı) · [Yapılandırma](#yapılandırma) · [Hesapsız tam görünüm](#hesapsız-tam-görünüm) · [Sınırlar](#sınırlar) · [Sorumluluk reddi](#sorumluluk-reddi)

### Özellikler

- Google Maps'te anahtar kelime ve konumla **arama**; sorgu başına 60 işletmeye kadar (kaydırma ve tekilleştirme dahil).
- **İşletme bilgileri:** ad, adres, telefon, web sitesi, puan, yorum sayısı, gün gün çalışma saatleri, işletme türü, fiyat seviyesi, koordinat, place id ve CID.
- **Hakkında bilgileri:** Google veriyorsa işletme açıklaması; erişilebilirlik, hizmet, atmosfer ve ödeme gibi kategorilere ayrılmış özellikler.
- **Menü albümünün tamamı.** Genel bakıştaki menü şeridi "Fotoğraf 1/12" yazsa da yalnız birkaç küçük resim gösterir; bu yüzden albüm tam ekran fotoğraf görüntüleyicisinden okunur. Her fotoğraf tam boy adresi, **orijinal boyutu** ve **çekildiği ay** (`taken_at`, ör. `2026-01`) ile gelir. Eski fotoğraflarda güncel olmayan fiyatlar varsa en yeni menüyü seçebilirsiniz.
- Menü sekmesinden kategorileriyle **ürünler ve fiyatlar**.
- **Hesapsız tam görünüm.** Google oturumsuz tarayıcılara mekân sayfasının ya sınırlı ya da tam sürümünü gösterir. Kalıcı bir profil tam görünümü korur, okuyucu sınırlı görünümü kendisi onarır; her sonuç hangi görünümü aldığını söyler (`view`). Google hesabı bir şey kazandırmaz: testlerimizde oturum açık bir profil birebir aynı veriyi döndürdü. Bkz. [Hesapsız tam görünüm](docs/tr/full-view.md).
- **Ayrıntılı, tarihli yorumlar (isteğe bağlı):** yorumcu, yıldız (yalnız yıldız verilenler dahil), tam metin, işletme yanıtı, beğeni, yorum fotoğrafları, alt puanlar ve diğer detaylar (`Yiyecek: 5`, kişi başı fiyat …), düzenleme ve "Google tarafından çevrildi" işaretleri. Her yorumun **kesin yayın tarihi** (`date_iso`), Google'ın sayfaya gönderdiği veriden okunur ve ekrandaki "2 ay önce" etiketiyle doğrulanır; okunamazsa yaklaşık tarih (`date_estimate`) ve hassasiyeti verilir. İsteğe bağlı **en yeniden eskiye** sıralama (`reviewSort: 'newest'`); liste sonuna kadar sayfalandığı için bütün yorumlar okunabilir.
- **Tek bağlantıyla sorgu:** Google Maps bağlantısını `readPlaceUrl` ya da `gmaps-place --url ...` komutuna verin — `maps.app.goo.gl` paylaşım bağlantıları, tüm Google ülke alan adları (`google.com.tr` …), `?cid=` bağlantıları ve Menü/Yorumlar sekmesi açıkken kopyalanan bağlantılar kabul edilir.
- İşletme galerisinden **genel fotoğraflar**; menü fotoğrafları, profil resimleri ve aynı görselin farklı boyutları ayıklanır.
- AB'deki **çerez onayı** sayfasında yalnız **"Tümünü reddet"** seçilir; hiçbir şey kabul edilmez.
- **Dürüst sonuçlar:** okunamayan veri hiçbir zaman "yok" diye raporlanmaz. Durumlar ve uyarılar (`limited_view`, `consent_required`, `blocked`, `truncated`, …) neyin okunamadığını açıkça söyler.
- [`puppeteer-core`](https://pptr.dev) ve kendi Chrome/Chromium'unuz üzerinde saf ESM. API anahtarı yok, tarayıcı indirmez.

### Kurulum

```bash
npm install gmaps-place-reader
```

**Node.js 20+** ve kurulu bir **Chrome ya da Chromium** gerekir. Paket `puppeteer-core` kullanır ve tarayıcı indirmez. Windows'ta varsayılan Chrome konumu kendiliğinden kullanılır; Linux ve macOS'ta `MAPS_CHROME_PATH` ayarlayın:

```bash
export MAPS_CHROME_PATH=/usr/bin/google-chrome   # ya da /usr/bin/chromium
```

### Hızlı başlangıç

```js
import { launchBrowser, newMapsPage, searchPlaces, readPlace } from 'gmaps-place-reader';

// Kalıcı bir profil Google'ın tam görünümünü korur; hesap ya da çerez gerekmez.
const browser = await launchBrowser({ userDataDir: '/mutlak/yol/gmaps-profile' });
try {
  const page = await newMapsPage(browser);
  const found = await searchPlaces(page, { location: 'Kadıköy, İstanbul', keyword: 'kafe', limit: 5 });

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12, includeReviews: true, maxReviews: 100 });
  console.log(place.status, place.view, place.name, place.phone, place.rating, place.review_count);
  console.log(place.reviews.reviews[0]?.date_iso, place.reviews.reviews[0]?.text);

  // Önce en yeni menü fotoğrafları
  const menu = [...place.menu.images].sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''));
  for (const photo of menu) console.log(photo.taken_at, `${photo.width}x${photo.height}`, photo.url);
} finally {
  await browser.close();
}
```

### Dokümantasyon

Ayrıntılı dokümantasyon [`docs/tr/`](docs/tr/README.md) altında: [hesapsız tam görünüm](docs/tr/full-view.md) · [API başvurusu](docs/tr/api.md) · [veri başvurusu](docs/tr/data.md) (her alan) · [komut satırı](docs/tr/cli.md) · [durumlar, uyarılar ve sorun giderme](docs/tr/troubleshooting.md).

### API

| Fonksiyon | Döndürdüğü |
|---|---|
| `launchBrowser(options?)` | Puppeteer tarayıcısı. Seçenekler: `executablePath`, `userDataDir` (kalıcı profil, önerilir), `headless` (varsayılan `true`). |
| `newMapsPage(browser)` | Maps için hazırlanmış sayfa (masaüstü user agent, Türkçe arayüz). |
| `searchPlaces(page, { location, keyword?, limit?, maxScrolls? })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated }`. `limit` en fazla 60. |
| `readPlace(page, place, { includeReviews?, maxReviews?, maxReviewScrolls?, reviewSort?, maxImages?, maxMenuImages?, maxScrolls?, recoverView?, onProgress? })` | İşletme ve Hakkında bilgileri ile `menu`, `photos`, isteğe bağlı `reviews`, `view`, `warnings` ve `data_quality`. Yorumlar varsayılan kapalıdır; sınır 100'dür ve 10.000'e kadar yükseltilebilir. `recoverView` (varsayılan `true`) sınırlı görünümü onarır. |
| `readPlaceUrl(browser, url, options?)` | Maps mekan bağlantısını açar, aynı bilgileri çeker ve sayfayı kapatır. Normal Maps ve `maps.app.goo.gl` bağlantıları kabul edilir. |
| `readReviews(page, { reviewCount?, maxReviews?, maxScrolls?, sort?, onProgress? })` | Yorum sekmesini açar, tam metinleri genişletir ve listeyi kaydırır. Yorumları, kesilme ve tamlık durumuyla döndürür. `maxScrolls` varsayılan 25, üst sınır 1.000'dir. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Yalnız menü albümü: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages?, includeReviews?, maxReviews?, maxReviewScrolls? })` | Arama ve detay tek çağrıda; istenirse yorumları da çeker ve normalize kayıtlarla `{ status, items, skipped_known }` döner. `known` listesindeki işletmeler (`{ source: 'google_maps_browser', source_id }`) atlanır. |
| `toObservation(place, detail)` | `readPlace` sonucunu `assets`, `menu_assets` ve istenirse yorumları içeren tek kayda (`schema_version: 'gmaps.place.v1'`) çevirir. |

Yardımcılar: `normalizePlaceUrl(url)` (tarayıcı açmadan bağlantıyı denetler), `fullImageUrl(url)` (Google fotoğraf adresinin büyük hali), `placeIdentity(url)`, `pageStatus(page)`, `passConsent(page)`, `parseRelativeAge(label)`, `estimateReviewDate(label)`, `checkView(browser, url?)` (`{ view, renewed }`, sınırlı görünümü onarır).
Alt yollar: `gmaps-place-reader/media`, `/details`, `/reviews`.

Yorum seçenekleri: `includeReviews` (varsayılan `false`), `maxReviews` (100, en fazla 10.000), `maxReviewScrolls` (25, en fazla 1.000 — her adım yaklaşık 10 yorum yükler), `reviewSort` (`relevant` · `newest` · `highest` · `lowest`). Yorum alanları: `review_id`, `author`, `author_summary`, `rating`, `text`, `date_label`, `date_iso`, `date_estimate`, `date_precision` (`exact`, `day`, `week`, `month`, `year` …), `edited`, `edited_estimate` (düzenlenmiş yorumun yaklaşık düzenlenme tarihi), `translated`, `photos`, `owner_response`, `likes`, `language`, `details` (yorumun altındaki yapılandırılmış satırlar: `{ name: 'Yiyecek', value: '5' }` gibi alt puanlar ve `{ name: 'Kişi başı fiyat', value: '₺400–600' }` gibi satırlar). `reviews` sonucu ayrıca `sort_label` ve `sort_applied` bildirir; istenen sıralama seçilemezse `warnings` içinde `REVIEW_SORT_NOT_APPLIED` olur.

Her sonuçta `view` (`full` · `limited` · `unknown`) bulunur. Her fonksiyon, seçenek ve alan: [docs/tr/api.md](docs/tr/api.md), [docs/tr/data.md](docs/tr/data.md).

**Durumlar:** `ok`, `incomplete` (bazı kısımlar okunamadı, `warnings`e bakın), `limited_view`, `auth_required`, `consent_required`, `blocked`, `unavailable`. Sık uyarılar: `MENU_PHOTOS_UNAVAILABLE` (menü ürünleri okundu ama menü fotoğraf albümü açılamadı), `REVIEWS_UNAVAILABLE`, `REVIEW_SORT_NOT_APPLIED`, `LIMITED_VIEW` ve sizin koyduğunuz sınır bir listeyi durdurduysa `…_LIMIT_OR_SCROLL_LIMIT`.

### Komut satırı

Komutlar stdout'a tek bir JSON yanıt yazar (hata durumunda çıkış kodu `2` ve `error_code`). `MAPS_PROFILE_DIR`'i kalıcı bir profile ayarlayın; hesap ya da çerez kullanılmaz. Bütün bayraklar ve alanlar: [docs/tr/cli.md](docs/tr/cli.md).

```bash
# Linkle tek mekân: detaylar, menü, fotoğraflar ve tarihleriyle en yeni 300 yorum
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-place --url "https://maps.app.goo.gl/mekan-linki" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40

# Birden çok işletme için arama + detay (JSON istek stdin'den)
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"kafe","limit":5}' \
  | MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-scan

# Profili tam görünümde tutmak (cron, saatte bir): çıkış kodu 0 = tam görünüm, 3 = sınırlı
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-view
```

### Yapılandırma

| Ortam değişkeni | Seçenek | Amaç |
|---|---|---|
| `MAPS_CHROME_PATH` | `executablePath` | Chrome ya da Chromium dosyası |
| `MAPS_PROFILE_DIR` | `userDataDir` | Kalıcı, özel tarayıcı profili (mutlak yol). **Önerilir:** tam görünümü korur. |

Komut satırı bayrakları ve JSON istek alanları ortam değişkenlerinden önce gelir.

### Hesapsız tam görünüm

Google Maps oturumsuz tarayıcılara ya **sınırlı görünüm** (Menü sekmesi yok, ürün ve fiyat yok, çoğu zaman menü albümü yok, daha az bilgi) ya da **tam görünüm** gösterir. Testlerimizde bunu tarayıcının anonim kimlik çerezi belirledi: AB'de `__Secure-ENID`, başka yerlerde `NID`. Google her kimliği iki sınıftan birinde verir ve kimlik o sınıfta kalır (ENID yaklaşık 13 ay, NID yaklaşık 6 ay). Her IP adresinden çalışır, ama yalnız aynı işletim sisteminin user agent'ıyla. Oturum açmak sınıfı değiştirmez; oturum açık bir profil, oturumsuz tam görünümle birebir aynı veriyi döndürdü.

- **Kalıcı bir profil kullanın** (`MAPS_PROFILE_DIR` / `userDataDir`). Anonim kimlik orada saklanır.
- **Sınırlı görünüm mü geldi?** `readPlace` mekânı bir kez yeniden yükler. Profilde hâlâ sınırlı bir kimlik varsa, en çok altı yeni geçici profilden tam görünüm veren bir kimlik getirir. Hiçbiri alamazsa mekân `limited_view` ve `view: 'limited'` ile döner; o tarayıcıdaki sonraki mekânlar için yeniden denenmez.
- **`gmaps-view`'u saatte bir çalıştırın** (cron). `"view"` bildirir, sınırlı görünümü onarır ve yalnız tam görünümde `0` ile çıkar.
- **Hesap yok, çerez dosyası yok.** Okuyucu hiçbir zaman oturum açmaz ve çerez yüklemez. Testlerimizde oturum açık bir profil aynı veriyi döndürdü; Google da çerezleri başka bir makineye taşınan oturumları iptal ediyor (birkaç dakika ile iki saat arasında).

Ayrıntılar, ölçümler ve ipuçları: [docs/tr/full-view.md](docs/tr/full-view.md).

Her durumda Chrome ya da Chromium gerekir. Görünmez modda çalıştığı için masaüstü gerekmez; Linux'ta root olarak değil, normal bir kullanıcıyla çalıştırın. Profil klasörünü gizli tutun.

### Sınırlar

- **Türkçe** Google Maps arayüzünü okur: her Maps adresi `hl=tr` ile açılır, bu yüzden sunucunun ve tarayıcının dili önemli değildir. İngilizce etiketler de tanınır.
- Google, Maps sayfa yapısını sık değiştirir; seçicilerin güncellenmesi gerekebilir. Böyle bir durumda yanlış veri yerine `unavailable` ya da `incomplete` alırsınız.
- Arama yarıçapı kesin bir filtre değildir; "yakın" olanı Maps metin araması belirler.
- Kesin yorum tarihleri Google'ın kendi sayfa verisinden gelir ve yalnız görünen etiketle uyuşursa kabul edilir; eşleşmezse `date_estimate` etiketten hesaplanır, `date_precision` ne kadar kaba olduğunu söyler. Düzenlenmiş yorumda etiket düzenleme yaşını gösterir, `date_iso` ise ilk yayın tarihidir. Sayfalama sınırları `truncated` ve `coverage_complete` alanlarında belirtilir. Binlerce yorum okumak dakikalar sürer (adım başına ~10 yorum).
- Küçük partilerle çalışın ve istekler arasında bekleyin. CAPTCHA ve doğrulama sayfaları asla atlatılmaz.

### Sorumluluk reddi

**Kendi riskinizde kullanın.** Bu proje Google ile bağlantılı değildir ve Google tarafından onaylanmamıştır. Google Maps'e otomatik erişim [Google Haritalar Hizmet Şartları](https://www.google.com/help/terms_maps/) ile çelişebilir. Kütüphaneyi nasıl kullandığınızdan, ilgili şartlara ve yasalara uymaktan siz sorumlusunuz. Fotoğraf, yorum ve metinler sahiplerine aittir.

### Geliştirme

```bash
git clone https://github.com/alpersamur3/gmaps-place-reader.git
cd gmaps-place-reader
npm install
npm test   # node --test, yerel sahte sayfalarla çalışır; Chrome gerekir (Linux/macOS'ta MAPS_CHROME_PATH)
```

Hata bildirimleri ve pull request'ler memnuniyetle karşılanır.

### Lisans

[MIT](https://github.com/alpersamur3/gmaps-place-reader/blob/main/LICENSE) © Alper Samur

</details>
