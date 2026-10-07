# Data reference

[Türkçe](tr/data.md) · [Docs index](README.md)

What `readPlace` / `readPlaceUrl` return, and the flat record `toObservation` / `gmaps-scan` produce. Missing data is never reported as "absent": empty fields come with a status, a reason or a warning.

## Place (`readPlace`)

| Field | Meaning |
|---|---|
| `status` | `ok` · `incomplete` (some parts could not be read, see `warnings`) · `limited_view` · `consent_required` · `auth_required` · `blocked` · `unavailable`. |
| `view`, `view_renewed` | `full` · `limited` · `unknown`, and how many anonymous ids were brought in for this place ([Full view](full-view.md)). |
| `source_id` | Stable identity: feature id (`0x…:0x…`), else `cid:…` or `place:…`. |
| `google_maps_url` | The canonical link that was read (always with `hl=tr`). |
| `name`, `address`, `phone`, `website`, `menu_url` | Business details as Maps shows them. |
| `business_type`, `price_level`, `description` | Category, price range (e.g. `₺200–1.000`), description when the business has one. |
| `rating`, `review_count`, `rating_label`, `review_label` | Numbers and the labels they were read from. |
| `opening_hours` | Summary line (e.g. "Açık · Kapanış saati: 00:00"). |
| `opening_hours_rows` | `[{ day, hours }]` for each day; seven rows in the full view. |
| `latitude`, `longitude`, `feature_id`, `place_id`, `cid` | Position of the business (not of the map viewport) and its ids. |
| `attributes` | About tab: `[{ category, name, label, available }]`, e.g. `{ category: 'Erişilebilirlik', name: 'Tekerlekli sandalyeye uygun giriş', available: false }`. |
| `about_status`, `about_coverage_complete` | Whether the About tab was read completely. |
| `menu` | See below. |
| `photos` | `{ status, images: [{ url, width, height, label, category }], truncated, reason? }`: general gallery photos, menu photos excluded. `reason: 'PHOTO_GALLERY_NOT_OPENED'` when only the overview's photos could be read. |
| `reviews` | Only with `includeReviews: true`. See below. |
| `warnings` | Codes such as `LIMITED_VIEW`, `MENU_PHOTOS_UNAVAILABLE`, `REVIEWS_LIMIT_OR_SCROLL_LIMIT` (see [Troubleshooting](troubleshooting.md)). |
| `data_quality` | `{ partial, review_count_observed, menu_coverage_complete, review_coverage_complete, about_coverage_complete, opening_hours_coverage_complete, photo_coverage_complete }`. |

## Menu (`place.menu`)

| Field | Meaning |
|---|---|
| `status` | `found` · `empty` (no menu photos, `reason: 'NO_MENU_CATEGORY'`, or photos did not load) · `unavailable` (with `reason`). |
| `source` | `menu_tab` (album opened from the Menu tab strip) · `photo_viewer` (from the gallery's Menu category) · `none`. |
| `images` | Menu album photos: `{ url, width, height, label, taken_at, category, categories }`. `width`/`height` are the original size. `taken_at` is the month the photo was taken (`2026-01`; the posting month when Maps shows no capture date). Use it to prefer the newest menu. |
| `expected_images` | The count shown on the Menu strip ("Fotoğraf 1/12"); the album itself can be larger. |
| `items` | Menu tab items: `{ category, name, description, price_text }`. |
| `categories` | Menu tab categories. |
| `coverage_complete`, `truncated` | Whether the whole album and all categories were read; `truncated` when your limits stopped it. |

`fullImageUrl(url)` turns an image URL into its large variant (`=w1200-k-no`).

## Reviews (`place.reviews`)

| Field | Meaning |
|---|---|
| `status`, `reason` | `found` · `empty` · `unavailable` (`REVIEW_TAB_NOT_FOUND`, `REVIEW_CARDS_NOT_LOADED`, `LIMITED_VIEW` …). |
| `total_count`, `collected_count`, `requested_limit`, `scrolls` | Counts. |
| `sort_label`, `sort_applied` | The order Maps showed, and whether the requested `reviewSort` was applied. |
| `exact_dates` | How many reviews got an exact date. |
| `truncated`, `coverage_complete` | `coverage_complete` only when every review of the place was read. |
| `reviews` | Records, see below. |

Each review:

| Field | Meaning |
|---|---|
| `review_id`, `author`, `author_summary` | Id, name, and e.g. "Yerel Rehber · 412 yorum". |
| `rating`, `rating_label` | 1–5 stars. Rating-only reviews are kept. |
| `text`, `language`, `translated` | Full text (expanded), its language, and whether Google translated it. |
| `details` | Structured lines under the text: `[{ name: 'Yiyecek', value: '5' }, { name: 'Kişi başı fiyat', value: '₺400–600' }, { name: 'Öğün', value: 'Akşam yemeği' }]`. |
| `date_label` | What Maps shows ("2 ay önce", "bir hafta önce düzenlendi"). |
| `date_iso`, `date_precision` | Exact posting time from Google's own data (`date_precision: 'exact'`) when it agrees with the label; otherwise `date_iso` is empty and `date_precision` is `day`, `week`, `month` or `year`. |
| `date_estimate` | `YYYY-MM-DD`: the exact date, or an estimate from the label (the most recent possible day). |
| `edited`, `edited_estimate` | Edited reviews: `date_iso` is the original posting time, `edited_estimate` the approximate edit date. |
| `photos` | Photo URLs attached to the review. |
| `owner_response`, `likes` | Owner reply text and like count. |

## Observation (`gmaps.place.v1`)

`toObservation(place, detail)` and every `gmaps-scan` item flatten a place into one record:

`schema_version`, `source` (`google_maps_browser`), `source_id`, `name`, `description`, `attributes`, `address`, `phone`, `website`, `website_status`, `opening_hours`, `opening_hours_rows`, `has_opening_hours`, `business_type`, `price_level`, `latitude`, `longitude`, `place_id`, `cid`, `rating`, `review_count`, `reviews`, `review_coverage_complete`, `menu_url`, `menu_items`, `menu_categories`, `maps_menu_status` (`menu_found` · `menu_partial` · `menu_not_found` · `unavailable`), `menu_assets` and `assets` (photos with `url` large, `preview_url`, `observed_width`, `observed_height`, `taken_at`, `label`, `categories`, and `rights_status: 'unknown'`; rights are never assumed), `photo_count` (lower bound), `view`, `warnings`, `data_quality`, `source_error` (empty when the place was read `ok`), `evidence`, `google_maps_url`, `observed_at`, `scan_keyword`, `scan_location`.
