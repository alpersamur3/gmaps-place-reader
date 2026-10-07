# Command line

[Türkçe](tr/cli.md) · [Docs index](README.md)

All commands print one JSON object to stdout. They exit with `0` on success and `2` on errors (with `error_code`); `gmaps-view` uses `3` for "not the full view". Configuration comes from flags, then the JSON request, then the environment (`MAPS_CHROME_PATH`, `MAPS_PROFILE_DIR`). No account is used and no cookies are loaded. The MCP server for AI agents, `gmaps-mcp`, has its own page: [MCP server](mcp.md).

## gmaps-place — one place by link

```bash
# Details, menu, photos and the 300 newest reviews of one place
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-place --url "https://maps.app.goo.gl/…" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40
```

| Flag | JSON request field | Default | Meaning |
|---|---|---|---|
| `--url <link>` | `google_maps_url` (or `url`) | — | Any Maps place link: share links (`maps.app.goo.gl`), country domains, `?cid=` links, links copied on the Menu or Reviews tab. |
| `--reviews` | `include_reviews: true` | off | Also read reviews. |
| `--max-reviews <n>` | `max_reviews` | 100 | Up to 10,000. |
| `--max-review-scrolls <n>` | `max_review_scrolls` | 25 | Each step loads about 10 reviews; up to 1,000. |
| `--sort <order>` | `review_sort` | `relevant` | `relevant` · `newest` · `highest` · `lowest`. |
| `--max-images <n>` | `max_images` | 8 | Limit for menu album photos and for general photos (1–200). |

Without `--url`, one JSON request is read from stdin:

```bash
echo '{"schema_version":"gmaps.place.request.v1","google_maps_url":"https://www.google.com/maps?cid=5682962314133110183","include_reviews":true,"review_sort":"newest"}' | npx gmaps-place
```

Response (`schema_version: "gmaps.place.response.v1"`):

| Field | Meaning |
|---|---|
| `status` | Summary for the menu: `menu_found`, `menu_partial` (limits reached, or not a full view), `menu_not_found` (the place has no menu photos), `unavailable`. |
| `detail_status` | The place's status: `ok`, `incomplete`, `limited_view`, … (see [Troubleshooting](troubleshooting.md)). |
| `view` | `full` · `limited` · `unknown`. |
| `place` | The whole `readPlace` result (see [Data](data.md)); image URLs are the large variant, `preview_url` keeps the observed one. |
| `reviews` | Review records (empty without `--reviews`). |
| `menu_assets`, `assets` | Menu album photos and general photos, large URLs. |
| `menu_items`, `menu_categories` | Menu tab items and categories. |
| `warnings`, `menu_status`, `source_error` | Details for diagnosis. |

## gmaps-scan — search and read several places

```bash
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"kafe","limit":5,"includeReviews":true,"maxReviews":20,"reviewSort":"newest"}' \
  | MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-scan
```

Request fields: `location` (required), `keyword` (default `restoran`), `limit` (1–60, default 20), `known` (`[{ "source": "google_maps_browser", "source_id": "…" }]` to skip), `maxImages`, `maxMenuImages`, `maxScrolls`, `includeReviews`, `maxReviews`, `maxReviewScrolls`, `reviewSort`.

Response (`schema_version: "gmaps.scan.v1"`): `status` (`ok` or `incomplete` when a place could not be read completely), `items` (one [observation](data.md#observation-gmapsplacev1) per place), `skipped_known`, `search` (`status`, `truncated`, `requested_limit`).

## gmaps-view — keep a profile in the full view

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view                     # reports the view, repairs a limited one
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view --place "<link>"    # check with another place
```

Output: `{ "status": "ok", "view": "full" | "limited" | …, "renewed", "profile" }`. `--profile <absolute dir>` overrides `MAPS_PROFILE_DIR`.

Exit code `0` = full view, `3` = not full, `2` = error. Run it hourly from cron; see [Full view](full-view.md).

## Error codes

`CHROME_PATH_REQUIRED` (set `MAPS_CHROME_PATH`), `MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE`, `INVALID_MAPS_URL`, `INVALID_SCHEMA`, `INVALID_ARGUMENT`, `INPUT_TOO_LARGE`, `LOCATION_REQUIRED`, `BROWSER_FAILED` (anything else). Errors never contain file paths.
