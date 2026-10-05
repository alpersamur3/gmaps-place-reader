# Veri başvurusu

[English](../data.md) · [Doküman dizini](README.md)

`readPlace` / `readPlaceUrl`'in döndürdükleri ve `toObservation` / `gmaps-scan`'in ürettiği düz kayıt. Eksik veri hiçbir zaman "yok" diye bildirilmez: boş alanlar bir durum, bir neden ya da bir uyarıyla gelir.

## Mekân (`readPlace`)

| Alan | Anlamı |
|---|---|
| `status` | `ok` · `incomplete` (bazı kısımlar okunamadı, `warnings`'e bakın) · `limited_view` · `consent_required` · `auth_required` · `blocked` · `unavailable`. |
| `view`, `view_renewed` | `full` · `limited` · `unknown` ve bu mekân için kaç anonim kimlik getirildiği ([Tam görünüm](full-view.md)). |
| `source_id` | Kalıcı kimlik: özellik kimliği (`0x…:0x…`), yoksa `cid:…` ya da `place:…`. |
| `google_maps_url` | Okunan kanonik link (her zaman `hl=tr` ile). |
| `name`, `address`, `phone`, `website`, `menu_url` | Maps'in gösterdiği işletme bilgileri. |
| `business_type`, `price_level`, `description` | Kategori, fiyat aralığı (ör. `₺200–1.000`), varsa açıklama. |
| `rating`, `review_count`, `rating_label`, `review_label` | Sayılar ve okundukları etiketler. |
| `opening_hours` | Özet satır (ör. "Açık · Kapanış saati: 00:00"). |
| `opening_hours_rows` | Her gün için `[{ day, hours }]`; tam görünümde yedi satır. |
| `latitude`, `longitude`, `feature_id`, `place_id`, `cid` | İşletmenin konumu (harita görünümünün değil) ve kimlikleri. |
| `attributes` | Hakkında sekmesi: `[{ category, name, label, available }]`, ör. `{ category: 'Erişilebilirlik', name: 'Tekerlekli sandalyeye uygun giriş', available: false }`. |
| `about_status`, `about_coverage_complete` | Hakkında sekmesinin tamamen okunup okunmadığı. |
| `menu` | Aşağıya bakın. |
| `photos` | `{ status, images: [{ url, width, height, label, category }], truncated }`: genel galeri fotoğrafları, menü fotoğrafları hariç. |
| `reviews` | Yalnız `includeReviews: true` ile. Aşağıya bakın. |
| `warnings` | `LIMITED_VIEW`, `MENU_PHOTOS_UNAVAILABLE`, `REVIEWS_LIMIT_OR_SCROLL_LIMIT` gibi kodlar (bkz. [Sorun giderme](troubleshooting.md)). |
| `data_quality` | `{ partial, review_count_observed, menu_coverage_complete, review_coverage_complete, about_coverage_complete, opening_hours_coverage_complete, photo_coverage_complete }`. |

## Menü (`place.menu`)

| Alan | Anlamı |
|---|---|
| `status` | `found` · `empty` (menü fotoğrafı yok, `reason: 'NO_MENU_CATEGORY'`; ya da fotoğraflar yüklenmedi) · `unavailable` (`reason` ile). |
| `source` | `menu_tab` (albüm Menü sekmesindeki şeritten açıldı) · `photo_viewer` (galerinin Menü kategorisinden) · `none`. |
| `images` | Menü albümü fotoğrafları: `{ url, width, height, label, taken_at, category, categories }`. `width`/`height` özgün boyuttur. `taken_at` fotoğrafın çekildiği aydır (`2026-01`; Maps çekim tarihi göstermiyorsa paylaşım ayı). En güncel menüyü seçmek için kullanın. |
| `expected_images` | Menü şeridinde yazan sayı ("Fotoğraf 1/12"); albümün kendisi daha büyük olabilir. |
| `items` | Menü sekmesi ürünleri: `{ category, name, description, price_text }`. |
| `categories` | Menü sekmesi kategorileri. |
| `coverage_complete`, `truncated` | Albümün tamamı ve tüm kategoriler okundu mu; sizin sınırınız durdurduysa `truncated`. |

`fullImageUrl(url)` bir görsel URL'sini büyük sürümüne (`=w1200-k-no`) çevirir.

## Yorumlar (`place.reviews`)

| Alan | Anlamı |
|---|---|
| `status`, `reason` | `found` · `empty` · `unavailable` (`REVIEW_TAB_NOT_FOUND`, `REVIEW_CARDS_NOT_LOADED`, `LIMITED_VIEW` …). |
| `total_count`, `collected_count`, `requested_limit`, `scrolls` | Sayılar. |
| `sort_label`, `sort_applied` | Maps'in gösterdiği sıra ve istenen `reviewSort`'un uygulanıp uygulanmadığı. |
| `exact_dates` | Kaç yorumun kesin tarihi olduğu. |
| `truncated`, `coverage_complete` | `coverage_complete` yalnız mekânın bütün yorumları okunduğunda doğrudur. |
| `reviews` | Kayıtlar, aşağıya bakın. |

Her yorum:

| Alan | Anlamı |
|---|---|
| `review_id`, `author`, `author_summary` | Kimlik, ad ve ör. "Yerel Rehber · 412 yorum". |
| `rating`, `rating_label` | 1–5 yıldız. Yalnız yıldız verilen yorumlar da alınır. |
| `text`, `language`, `translated` | Tam metin (genişletilmiş), dili ve Google'ın çevirip çevirmediği. |
| `details` | Metnin altındaki yapılandırılmış satırlar: `[{ name: 'Yiyecek', value: '5' }, { name: 'Kişi başı fiyat', value: '₺400–600' }, { name: 'Öğün', value: 'Akşam yemeği' }]`. |
| `date_label` | Maps'in gösterdiği ("2 ay önce", "bir hafta önce düzenlendi"). |
| `date_iso`, `date_precision` | Görünen etiketle uyuşuyorsa Google'ın kendi verisinden kesin yayın zamanı (`date_precision: 'exact'`); değilse `date_iso` boştur ve `date_precision` `day`, `week`, `month` ya da `year` olur. |
| `date_estimate` | `YYYY-AA-GG`: kesin tarih ya da etiketten tahmin (olası en yakın gün). |
| `edited`, `edited_estimate` | Düzenlenmiş yorumlar: `date_iso` ilk yayın zamanı, `edited_estimate` yaklaşık düzenlenme tarihi. |
| `photos` | Yoruma eklenmiş fotoğrafların URL'leri. |
| `owner_response`, `likes` | İşletme yanıtı ve beğeni sayısı. |

## Kayıt (`gmaps.place.v1`)

`toObservation(place, detail)` ve her `gmaps-scan` öğesi bir mekânı tek bir kayda düzleştirir:

`schema_version`, `source` (`google_maps_browser`), `source_id`, `name`, `description`, `attributes`, `address`, `phone`, `website`, `website_status`, `opening_hours`, `opening_hours_rows`, `has_opening_hours`, `business_type`, `price_level`, `latitude`, `longitude`, `place_id`, `cid`, `rating`, `review_count`, `reviews`, `review_coverage_complete`, `menu_url`, `menu_items`, `menu_categories`, `maps_menu_status` (`menu_found` · `menu_partial` · `menu_not_found` · `unavailable`), `menu_assets` ve `assets` (büyük `url`, `preview_url`, `observed_width`, `observed_height`, `taken_at`, `label`, `categories` ve `rights_status: 'unknown'` ile fotoğraflar; haklar asla varsayılmaz), `photo_count` (alt sınır), `view`, `warnings`, `data_quality`, `source_error` (mekân `ok` okunduysa boş), `evidence`, `google_maps_url`, `observed_at`, `scan_keyword`, `scan_location`.
