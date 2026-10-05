# Komut satırı

[English](../cli.md) · [Doküman dizini](README.md)

Her komut stdout'a tek bir JSON nesnesi yazar. Başarıda `0`, hatada `2` ile çıkar (`error_code` ile birlikte); `gmaps-view`, "tam görünüm değil" için `3` kullanır. Yapılandırma önce bayraklardan, sonra JSON isteğinden, en son ortam değişkenlerinden (`MAPS_CHROME_PATH`, `MAPS_PROFILE_DIR`) gelir. Hesap kullanılmaz, çerez yüklenmez.

## gmaps-place — linkten tek mekân

```bash
# Bir mekânın detayları, menüsü, fotoğrafları ve en yeni 300 yorumu
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-place --url "https://maps.app.goo.gl/…" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40
```

| Bayrak | JSON istek alanı | Varsayılan | Anlamı |
|---|---|---|---|
| `--url <link>` | `google_maps_url` (ya da `url`) | — | Her türlü Maps mekân linki: paylaşım linkleri (`maps.app.goo.gl`), ülke alan adları, `?cid=` linkleri, Menü ya da Yorumlar sekmesindeyken kopyalanan linkler. |
| `--reviews` | `include_reviews: true` | kapalı | Yorumları da oku. |
| `--max-reviews <n>` | `max_reviews` | 100 | En fazla 10.000. |
| `--max-review-scrolls <n>` | `max_review_scrolls` | 25 | Her adım yaklaşık 10 yorum yükler; en fazla 1.000. |
| `--sort <sıra>` | `review_sort` | `relevant` | `relevant` · `newest` · `highest` · `lowest`. |
| `--max-images <n>` | `max_images` | 8 | Menü albümü ve genel fotoğraflar için sınır (1–200). |

`--url` yoksa stdin'den tek bir JSON isteği okunur:

```bash
echo '{"schema_version":"gmaps.place.request.v1","google_maps_url":"https://www.google.com/maps?cid=5682962314133110183","include_reviews":true,"review_sort":"newest"}' | npx gmaps-place
```

Yanıt (`schema_version: "gmaps.place.response.v1"`):

| Alan | Anlamı |
|---|---|
| `status` | Menü özeti: `menu_found`, `menu_partial` (sınıra ulaşıldı ya da tam görünüm değil), `menu_not_found` (mekânın menü fotoğrafı yok), `unavailable`. |
| `detail_status` | Mekânın durumu: `ok`, `incomplete`, `limited_view`, … (bkz. [Sorun giderme](troubleshooting.md)). |
| `view` | `full` · `limited` · `unknown`. |
| `place` | `readPlace` sonucunun tamamı (bkz. [Veri](data.md)); görsel URL'leri büyük boyutludur, `preview_url` gözlenen URL'yi tutar. |
| `reviews` | Yorum kayıtları (`--reviews` yoksa boş). |
| `menu_assets`, `assets` | Menü albümü ve genel fotoğraflar, büyük URL'lerle. |
| `menu_items`, `menu_categories` | Menü sekmesinin ürünleri ve kategorileri. |
| `warnings`, `menu_status`, `source_error` | Teşhis ayrıntıları. |

## gmaps-scan — arama ve birden çok mekân

```bash
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"kafe","limit":5,"includeReviews":true,"maxReviews":20,"reviewSort":"newest"}' \
  | MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-scan
```

İstek alanları: `location` (zorunlu), `keyword` (varsayılan `restoran`), `limit` (1–60, varsayılan 20), `known` (atlanacaklar: `[{ "source": "google_maps_browser", "source_id": "…" }]`), `maxImages`, `maxMenuImages`, `maxScrolls`, `includeReviews`, `maxReviews`, `maxReviewScrolls`, `reviewSort`.

Yanıt (`schema_version: "gmaps.scan.v1"`): `status` (`ok`; bir mekân tam okunamadıysa `incomplete`), `items` (mekân başına bir [kayıt](data.md#kayıt-gmapsplacev1)), `skipped_known`, `search` (`status`, `truncated`, `requested_limit`).

## gmaps-view — profili tam görünümde tutmak

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view                     # görünümü bildirir, sınırlıysa onarır
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view --place "<link>"    # başka bir mekânla denetle
```

Çıktı: `{ "status": "ok", "view": "full" | "limited" | …, "renewed", "profile" }`. `--profile <mutlak klasör>`, `MAPS_PROFILE_DIR`'in yerine geçer.

Çıkış kodu `0` = tam görünüm, `3` = tam değil, `2` = hata. Cron ile saatte bir çalıştırın; bkz. [Tam görünüm](full-view.md).

## Hata kodları

`CHROME_PATH_REQUIRED` (`MAPS_CHROME_PATH` ayarlayın), `MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE`, `INVALID_MAPS_URL`, `INVALID_SCHEMA`, `INVALID_ARGUMENT`, `INPUT_TOO_LARGE`, `LOCATION_REQUIRED`, `BROWSER_FAILED` (diğer her şey). Hatalar hiçbir zaman dosya yolu içermez.
