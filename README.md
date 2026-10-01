<div align="center">

# gmaps-place-reader

**Read Google Maps places with a real browser: search results, business details and the complete menu photo album with photo dates. No Places API key.**

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

[Features](#features) · [Install](#install) · [Quick start](#quick-start) · [API](#api) · [Command line](#command-line) · [Configuration](#configuration) · [Cookies](#cookies-recommended) · [Limitations](#limitations) · [Disclaimer](#disclaimer)

### Features

- **Search** Google Maps by keyword and location and collect up to 60 places per query (scrolling and de-duplication included).
- **Business details:** name, address, phone, website, rating, review count, opening hours per day, business type, price level, coordinates, place id and CID.
- **About content:** business description when Google provides one and categorized attributes such as access, service, atmosphere and payment options.
- **The complete menu photo album.** The Menu strip on the overview only renders a few thumbnails even when it says "Photo 1/12", so the album is read in the full-screen photo viewer. Every photo comes with its full-size URL, **original dimensions** and **the month it was taken** (`taken_at`, e.g. `2026-01`), which lets you prefer the newest menu when older photos show outdated prices.
- **Menu items and prices** from the Menu tab when Google shows it (usually signed-in sessions only).
- **Detailed, dated reviews on request:** reviewer, rating (rating-only reviews included), full text, owner response, likes, attached photos, edit and "translated by Google" markers. Each review gets its **exact posting date** (`date_iso`) read from the data Google sends to the page, checked against the "2 months ago" label; otherwise an approximate date (`date_estimate`) with its precision. Optional **newest-first** order (`reviewSort: 'newest'`); the list is paged to the end, so every review can be read.
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

// Cookies are optional but strongly recommended (see "Cookies" below).
const browser = await launchBrowser({ cookiesFile: './google-cookies.json' });
try {
  const page = await newMapsPage(browser);
  const found = await searchPlaces(page, { location: 'Kadıköy, İstanbul', keyword: 'cafe', limit: 5 });

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12, includeReviews: true, maxReviews: 100 });
  console.log(place.status, place.name, place.phone, place.rating, place.review_count);
  console.log(place.reviews.reviews[0]?.date_label, place.reviews.reviews[0]?.text);

  // Newest menu photos first
  const menu = [...place.menu.images].sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''));
  for (const photo of menu) console.log(photo.taken_at, `${photo.width}x${photo.height}`, photo.url);
} finally {
  await browser.close();
}
```

### API

| Function | Returns |
|---|---|
| `launchBrowser(options?)` | A Puppeteer browser with the Google cookies applied. Options: `executablePath`, `cookiesFile`, `userDataDir`, `headless` (default `true`). |
| `newMapsPage(browser)` | A page prepared for Maps (desktop user agent, Turkish UI). |
| `searchPlaces(page, { location, keyword?, limit?, maxScrolls? })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated }`. `limit` is capped at 60. |
| `readPlace(page, place, { includeReviews?, maxReviews?, maxReviewScrolls?, maxImages?, maxMenuImages?, maxScrolls?, onProgress? })` | Business details and About attributes, plus `menu`, `photos`, optional `reviews`, `warnings` and `data_quality`. Reviews default off; the limit defaults to 100 and can be raised to 10,000. |
| `readPlaceUrl(browser, url, options?)` | Opens a Maps place URL, reads the same details, then closes its page. Accepts regular Maps links and `maps.app.goo.gl` share links. |
| `readReviews(page, { reviewCount?, maxReviews?, maxScrolls?, sort?, onProgress? })` | Opens the Reviews tab, expands full review text and scrolls the list. Returns review records and explicit truncation/coverage fields. `maxScrolls` defaults to 25 and can be raised to 1,000. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Only the menu album: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages?, includeReviews?, maxReviews?, maxReviewScrolls? })` | Search and details in one call; optionally collects reviews and returns `{ status, items, skipped_known }` with normalized records. Places listed in `known` (`{ source: 'google_maps_browser', source_id }`) are skipped. |
| `toObservation(place, detail)` | Flattens a `readPlace` result into one record (`schema_version: 'gmaps.place.v1'`) with `assets`, `menu_assets` and optional reviews. |

Helpers: `normalizePlaceUrl(url)` (check a link before launching a browser), `fullImageUrl(url)` (large variant of a Google photo URL), `placeIdentity(url)`, `pageStatus(page)`, `sessionState(page)`, `passConsent(page)`, `parseRelativeAge(label)`, `estimateReviewDate(label)`.
Subpath exports: `gmaps-place-reader/media`, `/details`, `/reviews`, `/cookies`.

Review options: `includeReviews` (default `false`), `maxReviews` (100, up to 10,000), `maxReviewScrolls` (25, up to 1,000 — each step loads about 10 reviews), `reviewSort` (`relevant` · `newest` · `highest` · `lowest`). Review fields: `review_id`, `author`, `author_summary`, `rating`, `text`, `date_label`, `date_iso`, `date_estimate`, `date_precision` (`exact`, `day`, `week`, `month`, `year` …), `edited`, `translated`, `photos`, `owner_response`, `likes`, `language`.

Every result carries `session` (`signed_in` · `signed_out` · `unknown`). When cookies were loaded but Google still shows the session as signed out, `warnings` contains `COOKIES_NOT_SIGNED_IN`.

**Statuses:** `ok`, `incomplete` (some parts could not be read, see `warnings`), `limited_view`, `auth_required`, `consent_required`, `blocked`, `unavailable`.

### Command line

The commands read one JSON request from stdin and write one JSON response to stdout (exit code `2` on failure, with an `error_code`).

```bash
# Search + details for several places
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"cafe","limit":5}' \
  | npx gmaps-scan --cookies-file ./google-cookies.json

# Menu album, menu items and photos of one place
echo '{"schema_version":"gmaps.place.request.v1","google_maps_url":"https://www.google.com/maps/place/...","max_images":12}' \
  | npx gmaps-place --cookies-file ./google-cookies.json

# Sign in once in a normal Chrome window and keep the profile (computer with a screen)
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-login

# Servers / SSH: load an exported cookie file into a profile once, then check it any time
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-session import ./google-cookies.json
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-session check   # exit code 0 = signed in, 3 = not
```

You can also pass a place URL directly and request detailed reviews:

```bash
npx gmaps-place --url "https://maps.app.goo.gl/your-place-link" --reviews --sort newest --max-reviews 2548 --max-review-scrolls 300 --cookies-file ./google-cookies.json
```

### Configuration

| Environment variable | Option | Purpose |
|---|---|---|
| `MAPS_CHROME_PATH` | `executablePath` | Chrome or Chromium binary |
| `MAPS_COOKIES_FILE` | `cookiesFile` | Google cookie export (Cookie-Editor JSON, Puppeteer cookies or Playwright storage state). Only `google.com` and `google.com.tr` cookies are loaded. |
| `MAPS_PROFILE_DIR` | `userDataDir` | Persistent, private browser profile (absolute path) |

Priority: command-line flag, then the JSON request (`cookies_file`), then the environment. Errors never include file paths, cookie names or values; `cookie_stats` only reports counts.

### Cookies (recommended)

Without cookies, Google Maps often serves a **limited view**: no Menu tab (so no menu items or prices), fewer details, and sometimes a gallery without categories, which means **no menu album** either. Server and datacenter IP addresses are limited or blocked more often, and EU addresses first get a consent page.

Use a **separate** Google account (never your personal one) and keep its session in a persistent profile (`MAPS_PROFILE_DIR` / `userDataDir`). Every read then refreshes the session inside that profile.

- **Computer with a screen:** `gmaps-login` opens your installed Chrome as an ordinary window (not automated — Google refuses sign-ins in automated browsers). Sign in, **close the window**, and the command checks the profile headlessly and prints whether it is signed in.

  ```powershell
  # Windows PowerShell
  $env:MAPS_PROFILE_DIR = "C:\gmaps-profile"; npx gmaps-login
  ```

- **Server or SSH, no screen:** sign in on any computer, export the cookies with a browser extension such as Cookie-Editor, copy the file to the server and run `gmaps-session import <file>` once. Delete the file afterwards; the profile keeps the session. `gmaps-session check` tells you later whether it is still signed in (suitable for cron / monitoring).
- Passing `cookiesFile` / `MAPS_COOKIES_FILE` on every run also works, but exported cookies go stale sooner than a profile, because Chrome binds Google sessions to the device.

Every result reports `session`; `COOKIES_NOT_SIGNED_IN` means the cookies were loaded but Google no longer accepts them. Without a session you typically get far fewer details: no review count, no Menu tab, sometimes no Reviews tab at all.

Chrome or Chromium is needed in every case (it runs headless, no desktop required); on Linux run it as a normal user, not root.

Treat the cookie file and the profile folder like passwords: keep them out of repositories, logs and backups.

### Limitations

- Reads the **Turkish** Google Maps interface: every Maps URL is opened with `hl=tr`, so the server locale and the account language do not matter. English labels are recognized as well.
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

[Özellikler](#özellikler) · [Kurulum](#kurulum) · [Hızlı başlangıç](#hızlı-başlangıç) · [API](#api-1) · [Komut satırı](#komut-satırı) · [Yapılandırma](#yapılandırma) · [Çerezler](#çerezler-önerilir) · [Sınırlar](#sınırlar) · [Sorumluluk reddi](#sorumluluk-reddi)

### Özellikler

- Google Maps'te anahtar kelime ve konumla **arama**; sorgu başına 60 işletmeye kadar (kaydırma ve tekilleştirme dahil).
- **İşletme bilgileri:** ad, adres, telefon, web sitesi, puan, yorum sayısı, gün gün çalışma saatleri, işletme türü, fiyat seviyesi, koordinat, place id ve CID.
- **Hakkında bilgileri:** Google veriyorsa işletme açıklaması; erişilebilirlik, hizmet, atmosfer ve ödeme gibi kategorilere ayrılmış özellikler.
- **Menü albümünün tamamı.** Genel bakıştaki menü şeridi "Fotoğraf 1/12" yazsa da yalnız birkaç küçük resim gösterir; bu yüzden albüm tam ekran fotoğraf görüntüleyicisinden okunur. Her fotoğraf tam boy adresi, **orijinal boyutu** ve **çekildiği ay** (`taken_at`, ör. `2026-01`) ile gelir. Eski fotoğraflarda güncel olmayan fiyatlar varsa en yeni menüyü seçebilirsiniz.
- Google gösteriyorsa (genelde yalnız oturum açıkken) Menü sekmesinden **ürünler ve fiyatlar**.
- **Ayrıntılı, tarihli yorumlar (isteğe bağlı):** yorumcu, yıldız (yalnız yıldız verilenler dahil), tam metin, işletme yanıtı, beğeni, yorum fotoğrafları, düzenleme ve "Google tarafından çevrildi" işaretleri. Her yorumun **kesin yayın tarihi** (`date_iso`), Google'ın sayfaya gönderdiği veriden okunur ve ekrandaki "2 ay önce" etiketiyle doğrulanır; okunamazsa yaklaşık tarih (`date_estimate`) ve hassasiyeti verilir. İsteğe bağlı **en yeniden eskiye** sıralama (`reviewSort: 'newest'`); liste sonuna kadar sayfalandığı için bütün yorumlar okunabilir.
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

// Çerez isteğe bağlıdır ama kesinlikle önerilir (aşağıdaki "Çerezler" bölümüne bakın).
const browser = await launchBrowser({ cookiesFile: './google-cookies.json' });
try {
  const page = await newMapsPage(browser);
  const found = await searchPlaces(page, { location: 'Kadıköy, İstanbul', keyword: 'kafe', limit: 5 });

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12, includeReviews: true, maxReviews: 100 });
  console.log(place.status, place.name, place.phone, place.rating, place.review_count);
  console.log(place.reviews.reviews[0]?.date_label, place.reviews.reviews[0]?.text);

  // Önce en yeni menü fotoğrafları
  const menu = [...place.menu.images].sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''));
  for (const photo of menu) console.log(photo.taken_at, `${photo.width}x${photo.height}`, photo.url);
} finally {
  await browser.close();
}
```

### API

| Fonksiyon | Döndürdüğü |
|---|---|
| `launchBrowser(options?)` | Google çerezleri yüklenmiş Puppeteer tarayıcısı. Seçenekler: `executablePath`, `cookiesFile`, `userDataDir`, `headless` (varsayılan `true`). |
| `newMapsPage(browser)` | Maps için hazırlanmış sayfa (masaüstü user agent, Türkçe arayüz). |
| `searchPlaces(page, { location, keyword?, limit?, maxScrolls? })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated }`. `limit` en fazla 60. |
| `readPlace(page, place, { includeReviews?, maxReviews?, maxReviewScrolls?, maxImages?, maxMenuImages?, maxScrolls?, onProgress? })` | İşletme ve Hakkında bilgileri ile `menu`, `photos`, isteğe bağlı `reviews`, `warnings` ve `data_quality`. Yorumlar varsayılan kapalıdır; sınır 100'dür ve 10.000'e kadar yükseltilebilir. |
| `readPlaceUrl(browser, url, options?)` | Maps mekan bağlantısını açar, aynı bilgileri çeker ve sayfayı kapatır. Normal Maps ve `maps.app.goo.gl` bağlantıları kabul edilir. |
| `readReviews(page, { reviewCount?, maxReviews?, maxScrolls?, sort?, onProgress? })` | Yorum sekmesini açar, tam metinleri genişletir ve listeyi kaydırır. Yorumları, kesilme ve tamlık durumuyla döndürür. `maxScrolls` varsayılan 25, üst sınır 1.000'dir. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Yalnız menü albümü: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages?, includeReviews?, maxReviews?, maxReviewScrolls? })` | Arama ve detay tek çağrıda; istenirse yorumları da çeker ve normalize kayıtlarla `{ status, items, skipped_known }` döner. `known` listesindeki işletmeler (`{ source: 'google_maps_browser', source_id }`) atlanır. |
| `toObservation(place, detail)` | `readPlace` sonucunu `assets`, `menu_assets` ve istenirse yorumları içeren tek kayda (`schema_version: 'gmaps.place.v1'`) çevirir. |

Yardımcılar: `normalizePlaceUrl(url)` (tarayıcı açmadan bağlantıyı denetler), `fullImageUrl(url)` (Google fotoğraf adresinin büyük hali), `placeIdentity(url)`, `pageStatus(page)`, `sessionState(page)`, `passConsent(page)`, `parseRelativeAge(label)`, `estimateReviewDate(label)`.
Alt yollar: `gmaps-place-reader/media`, `/details`, `/reviews`, `/cookies`.

Yorum seçenekleri: `includeReviews` (varsayılan `false`), `maxReviews` (100, en fazla 10.000), `maxReviewScrolls` (25, en fazla 1.000 — her adım yaklaşık 10 yorum yükler), `reviewSort` (`relevant` · `newest` · `highest` · `lowest`). Yorum alanları: `review_id`, `author`, `author_summary`, `rating`, `text`, `date_label`, `date_iso`, `date_estimate`, `date_precision` (`exact`, `day`, `week`, `month`, `year` …), `edited`, `translated`, `photos`, `owner_response`, `likes`, `language`.

Her sonuçta `session` (`signed_in` · `signed_out` · `unknown`) bulunur. Çerez yüklendiği hâlde Google oturumu kapalı gösteriyorsa `warnings` içinde `COOKIES_NOT_SIGNED_IN` olur.

**Durumlar:** `ok`, `incomplete` (bazı kısımlar okunamadı, `warnings`e bakın), `limited_view`, `auth_required`, `consent_required`, `blocked`, `unavailable`.

### Komut satırı

Komutlar stdin'den tek bir JSON istek okur, stdout'a tek bir JSON yanıt yazar (hata durumunda çıkış kodu `2` ve `error_code`).

```bash
# Birden çok işletme için arama + detay
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"kafe","limit":5}' \
  | npx gmaps-scan --cookies-file ./google-cookies.json

# Tek işletmenin menü albümü, menü ürünleri ve fotoğrafları
echo '{"schema_version":"gmaps.place.request.v1","google_maps_url":"https://www.google.com/maps/place/...","max_images":12}' \
  | npx gmaps-place --cookies-file ./google-cookies.json

# Normal bir Chrome penceresinde bir kez oturum açıp profili saklayın (ekranı olan bilgisayar)
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-login

# Sunucu / SSH: dışa aktarılmış çerez dosyasını profile bir kez yükleyin, sonra istediğiniz zaman denetleyin
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-session import ./google-cookies.json
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-session check   # çıkış kodu 0 = oturum açık, 3 = değil
```

Mekan bağlantısını doğrudan verip ayrıntılı yorumları da isteyebilirsiniz:

```bash
npx gmaps-place --url "https://maps.app.goo.gl/mekan-linki" --reviews --sort newest --max-reviews 2548 --max-review-scrolls 300 --cookies-file ./google-cookies.json
```

### Yapılandırma

| Ortam değişkeni | Seçenek | Amaç |
|---|---|---|
| `MAPS_CHROME_PATH` | `executablePath` | Chrome ya da Chromium dosyası |
| `MAPS_COOKIES_FILE` | `cookiesFile` | Google çerez dışa aktarımı (Cookie-Editor JSON, Puppeteer çerezleri ya da Playwright storage state). Yalnız `google.com` ve `google.com.tr` çerezleri yüklenir. |
| `MAPS_PROFILE_DIR` | `userDataDir` | Kalıcı, özel tarayıcı profili (mutlak yol) |

Öncelik: komut satırı, ardından JSON istek (`cookies_file`), ardından ortam değişkeni. Hata mesajları dosya yolu, çerez adı ya da değeri içermez; `cookie_stats` yalnız sayıları verir.

### Çerezler (önerilir)

Çerez olmadan Google Maps çoğu zaman **sınırlı görünüm** sunar: Menü sekmesi gelmez (ürün ve fiyat yok), daha az detay gelir ve galeri bazen kategorisiz açılır; bu durumda **menü albümü de okunamaz**. Sunucu ve veri merkezi IP'leri daha sık kısıtlanır ya da engellenir; AB'deki adresler önce çerez onayı sayfası görür.

**Ayrı** bir Google hesabı kullanın (asla kişisel hesabınızı değil) ve oturumunu kalıcı bir profilde tutun (`MAPS_PROFILE_DIR` / `userDataDir`). Her okuma, oturumu o profil içinde tazeler.

- **Ekranı olan bilgisayar:** `gmaps-login`, kurulu Chrome'unuzu sıradan bir pencere olarak açar (otomasyonlu değil — Google otomasyonlu tarayıcıda oturum açtırmaz). Oturum açın, **pencereyi kapatın**; komut profili görünmez modda denetler ve oturumun açık olup olmadığını yazar.

  ```powershell
  # Windows PowerShell
  $env:MAPS_PROFILE_DIR = "C:\gmaps-profile"; npx gmaps-login
  ```

- **Sunucu ya da SSH, ekran yok:** herhangi bir bilgisayarda oturum açın, çerezleri Cookie-Editor gibi bir eklentiyle dışa aktarın, dosyayı sunucuya kopyalayıp bir kez `gmaps-session import <dosya>` çalıştırın. Ardından dosyayı silin; oturum profilde kalır. `gmaps-session check` daha sonra oturumun hâlâ açık olup olmadığını söyler (cron / izleme için uygundur).
- Her çalıştırmada `cookiesFile` / `MAPS_COOKIES_FILE` vermek de çalışır; ancak Chrome Google oturumunu cihaza bağladığı için dışa aktarılan çerezler profile göre daha çabuk geçersizleşir.

Her sonuç `session` bildirir; `COOKIES_NOT_SIGNED_IN`, çerezlerin yüklendiğini ama Google'ın artık kabul etmediğini gösterir. Oturum yokken çok daha az bilgi gelir: yorum sayısı ve Menü sekmesi yoktur, bazen Yorumlar sekmesi de hiç görünmez.

Her durumda Chrome ya da Chromium gerekir (görünmez modda çalışır, masaüstü gerekmez); Linux'ta root olarak değil, normal bir kullanıcıyla çalıştırın.

Çerez dosyasını ve profil klasörünü parola gibi saklayın: repoya, günlüklere ve yedeklere koymayın.

### Sınırlar

- **Türkçe** Google Maps arayüzünü okur: her Maps adresi `hl=tr` ile açılır, bu yüzden sunucunun dili ve hesabın dili önemli değildir. İngilizce etiketler de tanınır.
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
