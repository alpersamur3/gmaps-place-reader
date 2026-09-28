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
- **The complete menu photo album.** The Menu strip on the overview only renders a few thumbnails even when it says "Photo 1/12", so the album is read in the full-screen photo viewer. Every photo comes with its full-size URL, **original dimensions** and **the month it was taken** (`taken_at`, e.g. `2026-01`), which lets you prefer the newest menu when older photos show outdated prices.
- **Menu items and prices** from the Menu tab when Google shows it (usually signed-in sessions only).
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

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12 });
  console.log(place.status, place.name, place.phone, place.rating, place.review_count);

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
| `readPlace(page, place, { maxImages?, maxMenuImages?, maxScrolls?, onProgress? })` | Business details plus `menu` (`images`, `items`, `categories`, `coverage_complete`), `photos`, `warnings` and `data_quality`. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Only the menu album: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages? })` | Search and details in one call; returns `{ status, items, skipped_known }` with normalized records. Places listed in `known` (`{ source: 'google_maps_browser', source_id }`) are skipped. |
| `toObservation(place, detail)` | Flattens a `readPlace` result into one record (`schema_version: 'gmaps.place.v1'`) with `assets` and `menu_assets`. |

Helpers: `fullImageUrl(url)` (large variant of a Google photo URL), `placeIdentity(url)`, `pageStatus(page)`, `passConsent(page)`.
Subpath exports: `gmaps-place-reader/media`, `/details`, `/cookies`.

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

# Sign in once in a visible browser and keep the profile
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-login
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

For reliable results:

- export the cookies of a **separate** Google account (never your personal one) with a browser extension such as Cookie-Editor and pass the file with `cookiesFile` / `MAPS_COOKIES_FILE`, **or**
- sign in once with `gmaps-login` and reuse the profile via `MAPS_PROFILE_DIR`.

Treat the cookie file and the profile folder like passwords: keep them out of repositories, logs and backups.

### Limitations

- Tuned for the **Turkish** Google Maps interface (`hl=tr`); English labels are recognized as well.
- Google changes the Maps markup regularly, so selectors may need updates. When that happens you get `unavailable` or `incomplete` instead of wrong data.
- Search radius is not an exact filter; Maps text search decides what is "nearby".
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
- **Menü albümünün tamamı.** Genel bakıştaki menü şeridi "Fotoğraf 1/12" yazsa da yalnız birkaç küçük resim gösterir; bu yüzden albüm tam ekran fotoğraf görüntüleyicisinden okunur. Her fotoğraf tam boy adresi, **orijinal boyutu** ve **çekildiği ay** (`taken_at`, ör. `2026-01`) ile gelir. Eski fotoğraflarda güncel olmayan fiyatlar varsa en yeni menüyü seçebilirsiniz.
- Google gösteriyorsa (genelde yalnız oturum açıkken) Menü sekmesinden **ürünler ve fiyatlar**.
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

  const place = await readPlace(page, found.places[0], { maxMenuImages: 20, maxImages: 12 });
  console.log(place.status, place.name, place.phone, place.rating, place.review_count);

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
| `readPlace(page, place, { maxImages?, maxMenuImages?, maxScrolls?, onProgress? })` | İşletme bilgileri ile `menu` (`images`, `items`, `categories`, `coverage_complete`), `photos`, `warnings` ve `data_quality`. |
| `readMenuPhotos(page, { overviewUrl, maxImages? })` | Yalnız menü albümü: `{ status: 'found' \| 'empty' \| 'unavailable', images: [{ url, width, height, taken_at, label }], truncated }`. |
| `scan(browser, { location, keyword?, limit?, known?, maxImages?, maxMenuImages? })` | Arama ve detay tek çağrıda; normalize kayıtlarla `{ status, items, skipped_known }` döner. `known` listesindeki işletmeler (`{ source: 'google_maps_browser', source_id }`) atlanır. |
| `toObservation(place, detail)` | `readPlace` sonucunu `assets` ve `menu_assets` içeren tek kayda (`schema_version: 'gmaps.place.v1'`) çevirir. |

Yardımcılar: `fullImageUrl(url)` (Google fotoğraf adresinin büyük hali), `placeIdentity(url)`, `pageStatus(page)`, `passConsent(page)`.
Alt yollar: `gmaps-place-reader/media`, `/details`, `/cookies`.

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

# Görünür tarayıcıda bir kez oturum açıp profili saklayın
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-login
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

Güvenilir sonuç için:

- **ayrı** bir Google hesabının (asla kişisel hesabınız değil) çerezlerini Cookie-Editor gibi bir eklentiyle dışa aktarıp `cookiesFile` / `MAPS_COOKIES_FILE` ile verin, **ya da**
- `gmaps-login` ile bir kez oturum açıp profili `MAPS_PROFILE_DIR` ile tekrar kullanın.

Çerez dosyasını ve profil klasörünü parola gibi saklayın: repoya, günlüklere ve yedeklere koymayın.

### Sınırlar

- **Türkçe** Google Maps arayüzüne (`hl=tr`) göre ayarlıdır; İngilizce etiketler de tanınır.
- Google, Maps sayfa yapısını sık değiştirir; seçicilerin güncellenmesi gerekebilir. Böyle bir durumda yanlış veri yerine `unavailable` ya da `incomplete` alırsınız.
- Arama yarıçapı kesin bir filtre değildir; "yakın" olanı Maps metin araması belirler.
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
