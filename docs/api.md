# API reference

[Türkçe](tr/api.md) · [Docs index](README.md)

ESM only: `import { … } from 'gmaps-place-reader'`. Subpath exports: `gmaps-place-reader/media`, `/details`, `/reviews`, `/login` (the sign-in flow behind `gmaps-login`), `/mcp` (the [MCP server](mcp.md): `createMcpServer`, `TOOLS`).

## Browser

| Function | Description |
|---|---|
| `launchBrowser(options?)` | Starts Chrome/Chromium through `puppeteer-core`. Options: `executablePath` (or `MAPS_CHROME_PATH`; the default Windows install is found automatically), `userDataDir` (or `MAPS_PROFILE_DIR`; absolute, **recommended**), `headless` (default `true`). A profile signed in once with `gmaps-login` gives the full view ([Signing in](sign-in.md)); no cookie files are loaded. |
| `newMapsPage(browser)` | A page prepared for Maps: the installed Chrome's desktop user agent (never `HeadlessChrome`) and Turkish UI. |
| `chromeExecutable(options?)` | The Chrome path that `launchBrowser` would use. |

## Places

| Function | Description |
|---|---|
| `searchPlaces(page, { location, keyword = 'restoran', limit = 20, maxScrolls = 8 })` | `{ status, places: [{ source_id, name, google_maps_url }], truncated, requested_limit }`. `limit` is capped at 60. |
| `readPlace(page, place, options?)` | Reads one place (`place.google_maps_url` or `place.url`). Returns the [place record](data.md#place-readplace). |
| `readPlaceUrl(browser, url, options?)` | Opens its own page, calls `readPlace`, closes the page. |
| `scan(browser, { location, keyword?, limit?, known?, … })` | `searchPlaces` + `readPlace` for each new place: `{ status, items: [observation], skipped_known, search }`. Places in `known` (`[{ source: 'google_maps_browser', source_id }]`) are skipped. Accepts the `readPlace` options below. |
| `toObservation(place, detail, { keyword?, location? })` | Flattens a place into a [`gmaps.place.v1` record](data.md#observation-gmapsplacev1). |

`readPlace` options:

| Option | Default | Meaning |
|---|---|---|
| `maxMenuImages` | 20 | Menu album photos (1–200). |
| `maxImages` | 12 | General photos (1–200). |
| `maxScrolls` | 20 | Scroll steps for menu categories and the gallery. |
| `includeMenu` | `true` | Read the menu (Menu tab and menu album). `false` skips it: `menu.status` is `not_requested`. |
| `includePhotos` | `true` | Read the general gallery. `false` skips it: `photos.status` is `not_requested`. |
| `includeReviews` | `false` | Read reviews. |
| `maxReviews` | 100 | Up to 10,000. |
| `maxReviewScrolls` | 25 | Up to 1,000; each step loads about 10 reviews. |
| `reviewSort` | `relevant` | `relevant` · `newest` · `highest` · `lowest`. |
| `recoverView` | `true` | Repair a limited anonymous view ([Full view](full-view.md#how-the-reader-keeps-the-full-view)); does nothing on a signed-in profile. |
| `onProgress(event, page)` | — | Called with stages `overview`, `menu_category`, `menu_photos`, `reviews`; useful for screenshots. |

## Parts of a place

| Function | Description |
|---|---|
| `readMenu(page, { maxImages, maxScrolls, overviewUrl, onProgress })` | Menu tab (items, categories) and the menu album. |
| `readMenuPhotos(page, { overviewUrl, maxImages })` | Only the menu album: `{ status, source, images: [{ url, width, height, taken_at, label }], truncated }`. |
| `readPhotos(page, { maxImages, maxScrolls, overviewUrl, exclude })` | General gallery photos. |
| `readReviews(page, { overviewUrl, reviewCount, maxReviews, maxScrolls, sort, onProgress })` | Reviews with exact dates when Google sends them ([fields](data.md#reviews-placereviews)). |
| `extractPlaceDetails(page)`, `extractAboutDetails(page)` (`/details`) | Business details, About attributes. |

## View and account

| Function | Description |
|---|---|
| `checkView(browser, url = VIEW_CHECK_PLACE, { repair = true })` | Opens one place, repairs a limited anonymous view unless `repair` is `false`: `{ view: 'full' \| 'limited' \| …, renewed, account }`. |
| `accountState(page, { waitMs = 4000 })` | `signed_in` · `signed_out` · `unknown`, read from the Maps header buttons (account button or Sign in link); waits up to `waitMs` for the header. |
| `signIn({ userDataDir, executablePath?, port = 0, timeoutMs, onStatus })` (`/login`) | The `gmaps-login` flow: opens an ordinary Chrome window on the profile at Google's sign-in page (under `xvfb-run` on Linux without a display), waits until Maps opens, closes the window: `{ outcome: 'signed_in_page' \| 'closed' \| 'timeout' \| 'not_listening', port, virtual }`. Check the profile afterwards with `checkView(browser, url, { repair: false })`. [Signing in](sign-in.md). |
| `mintFullViewCookies(executablePath, { attempts = 6, place })` | Full-view anonymous id cookies from fresh temporary profiles, or `null`. |
| `nextViewStep(state)` | The recovery decision (`reload` · `renew` · `stop`; `stop` for a signed-in profile), exported for tests. |
| `VIEW_CHECK_PLACE` | The well-known place used by `checkView`. |

## Helpers

| Function | Description |
|---|---|
| `normalizePlaceUrl(url)` | Validates and normalizes a Maps link (country domains, `?cid=`, `maps.app.goo.gl`, links with a tab open) before a browser is started; `''` when not a Maps place link. |
| `withMapsLanguage(url)` | Adds `hl=tr`. |
| `placeIdentity(url)` | Stable id of a place link. |
| `pageStatus(page)` | `ok` · `limited_view` · `consent_required` · `auth_required` · `blocked`. |
| `passConsent(page)` | On the EU consent page, chooses "Reject all" only. |
| `imageUrl(url)`, `fullImageUrl(url)`, `imageIdentity(url)` (`/media`) | Safe Google photo URLs, the large variant, size-independent identity. |
| `photoMonth(label)`, `viewerPhoto(href)` (`/media`) | Photo viewer date labels → `YYYY-MM`, viewer URL → `{ id, url, width, height }`. |
| `parseRelativeAge(label)`, `estimateReviewDate(label)` | "2 ay önce" → `{ amount, unit, edited }` → `{ date, precision }`. |
| `reviewsPageUrl(url)`, `editMapsData(data, edit)` (`/reviews`) | The Reviews deep link; edits a `data=` path keeping its nested counts consistent. |
