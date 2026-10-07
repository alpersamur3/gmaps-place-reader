# API başvurusu

[English](../api.md) · [Doküman dizini](README.md)

Yalnız ESM: `import { … } from 'gmaps-place-reader'`. Alt yol dışa aktarımları: `gmaps-place-reader/media`, `/details`, `/reviews`, `/mcp` ([MCP sunucusu](mcp.md): `createMcpServer`, `TOOLS`).

## Tarayıcı

| Fonksiyon | Açıklama |
|---|---|
| `launchBrowser(options?)` | Chrome/Chromium'u `puppeteer-core` ile başlatır. Seçenekler: `executablePath` (ya da `MAPS_CHROME_PATH`; Windows'taki varsayılan kurulum kendiliğinden bulunur), `userDataDir` (ya da `MAPS_PROFILE_DIR`; mutlak yol, **önerilir**), `headless` (varsayılan `true`). Hesap kullanılmaz, çerez yüklenmez. |
| `newMapsPage(browser)` | Maps için hazırlanmış sayfa: kurulu Chrome'un masaüstü user agent'ı (asla `HeadlessChrome` değil) ve Türkçe arayüz. |
| `chromeExecutable(options?)` | `launchBrowser`'ın kullanacağı Chrome yolu. |

## Mekânlar

| Fonksiyon | Açıklama |
|---|---|
| `searchPlaces(page, { location, keyword = 'restoran', limit = 20, maxScrolls = 8 })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated, requested_limit }`. `limit` en fazla 60. |
| `readPlace(page, place, options?)` | Bir mekânı okur (`place.google_maps_url` ya da `place.url`). [Mekân kaydını](data.md#mekân-readplace) döndürür. |
| `readPlaceUrl(browser, url, options?)` | Kendi sayfasını açar, `readPlace`'i çağırır, sayfayı kapatır. |
| `scan(browser, { location, keyword?, limit?, known?, … })` | `searchPlaces` + her yeni mekân için `readPlace`: `{ status, items: [kayıt], skipped_known, search }`. `known` listesindekiler (`[{ source: 'google_maps_browser', source_id }]`) atlanır. Aşağıdaki `readPlace` seçeneklerini de alır. |
| `toObservation(place, detail, { keyword?, location? })` | Bir mekânı [`gmaps.place.v1` kaydına](data.md#kayıt-gmapsplacev1) düzleştirir. |

`readPlace` seçenekleri:

| Seçenek | Varsayılan | Anlamı |
|---|---|---|
| `maxMenuImages` | 20 | Menü albümü fotoğrafları (1–200). |
| `maxImages` | 12 | Genel fotoğraflar (1–200). |
| `maxScrolls` | 20 | Menü kategorileri ve galeri için kaydırma adımı. |
| `includeMenu` | `true` | Menüyü oku (Menü sekmesi ve menü albümü). `false` atlar: `menu.status` `not_requested` olur. |
| `includePhotos` | `true` | Genel galeriyi oku. `false` atlar: `photos.status` `not_requested` olur. |
| `includeReviews` | `false` | Yorumları oku. |
| `maxReviews` | 100 | En fazla 10.000. |
| `maxReviewScrolls` | 25 | En fazla 1.000; her adım yaklaşık 10 yorum yükler. |
| `reviewSort` | `relevant` | `relevant` · `newest` · `highest` · `lowest`. |
| `recoverView` | `true` | Sınırlı görünümü onar ([Tam görünüm](full-view.md#okuyucu-tam-görünümü-nasıl-korur)). |
| `onProgress(event, page)` | — | `overview`, `menu_category`, `menu_photos`, `reviews` aşamalarında çağrılır; ekran görüntüsü için kullanışlı. |

## Mekânın parçaları

| Fonksiyon | Açıklama |
|---|---|
| `readMenu(page, { maxImages, maxScrolls, overviewUrl, onProgress })` | Menü sekmesi (ürünler, kategoriler) ve menü albümü. |
| `readMenuPhotos(page, { overviewUrl, maxImages })` | Yalnız menü albümü: `{ status, source, images: [{ url, width, height, taken_at, label }], truncated }`. |
| `readPhotos(page, { maxImages, maxScrolls, overviewUrl, exclude })` | Genel galeri fotoğrafları. |
| `readReviews(page, { overviewUrl, reviewCount, maxReviews, maxScrolls, sort, onProgress })` | Google gönderdiğinde kesin tarihleriyle yorumlar ([alanlar](data.md#yorumlar-placereviews)). |
| `extractPlaceDetails(page)`, `extractAboutDetails(page)` (`/details`) | İşletme bilgileri, Hakkında özellikleri. |

## Görünüm

| Fonksiyon | Açıklama |
|---|---|
| `checkView(browser, url = VIEW_CHECK_PLACE)` | Bir mekânı açar, sınırlı görünümü onarır: `{ view: 'full' \| 'limited' \| …, renewed }`. |
| `mintFullViewCookies(executablePath, { attempts = 6, place })` | Yeni geçici profillerden tam görünüm veren anonim kimlik çerezleri ya da `null`. |
| `nextViewStep(state)` | Onarım kararı (`reload` · `renew` · `stop`), testler için dışa aktarılır. |
| `VIEW_CHECK_PLACE` | `checkView`'ın kullandığı iyi bilinen mekân. |

## Yardımcılar

| Fonksiyon | Açıklama |
|---|---|
| `normalizePlaceUrl(url)` | Tarayıcı açmadan önce bir Maps linkini doğrular ve normalleştirir (ülke alan adları, `?cid=`, `maps.app.goo.gl`, bir sekme açıkken kopyalanan linkler); mekân linki değilse `''`. |
| `withMapsLanguage(url)` | `hl=tr` ekler. |
| `placeIdentity(url)` | Mekân linkinin kalıcı kimliği. |
| `pageStatus(page)` | `ok` · `limited_view` · `consent_required` · `auth_required` · `blocked`. |
| `passConsent(page)` | AB onay sayfasında yalnız "Tümünü reddet"i seçer. |
| `imageUrl(url)`, `fullImageUrl(url)`, `imageIdentity(url)` (`/media`) | Güvenli Google fotoğraf URL'leri, büyük sürüm, boyuttan bağımsız kimlik. |
| `photoMonth(label)`, `viewerPhoto(href)` (`/media`) | Fotoğraf görüntüleyici tarih etiketi → `YYYY-AA`, görüntüleyici URL'si → `{ id, url, width, height }`. |
| `parseRelativeAge(label)`, `estimateReviewDate(label)` | "2 ay önce" → `{ amount, unit, edited }` → `{ date, precision }`. |
| `reviewsPageUrl(url)`, `editMapsData(data, edit)` (`/reviews`) | Yorumlar derin linki; iç içe sayaçları tutarlı kalacak şekilde bir `data=` yolunu düzenler. |
