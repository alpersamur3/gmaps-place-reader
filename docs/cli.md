# Command line

[Türkçe](tr/cli.md) · [Docs index](README.md)

All commands print one JSON object to stdout. They exit with `0` on success and `2` on errors (with `error_code`); `gmaps-session` and `gmaps-login` use `3` for "not full view" / "not signed in". Configuration comes from flags, then the JSON request, then the environment (`MAPS_CHROME_PATH`, `MAPS_PROFILE_DIR`, `MAPS_COOKIES_FILE`).

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
| `--cookies-file <file>` | `cookies_file` | — | Optional cookie export (see [Full view](full-view.md#sessions-optional)). |

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
| `warnings`, `menu_status`, `source_error`, `cookie_stats` | Details for diagnosis; `cookie_stats` only counts cookies. |

## gmaps-scan — search and read several places

```bash
echo '{"schema_version":"gmaps.scan.request.v1","location":"Kadıköy, İstanbul","keyword":"kafe","limit":5,"includeReviews":true,"maxReviews":20,"reviewSort":"newest"}' \
  | MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-scan
```

Request fields: `location` (required), `keyword` (default `restoran`), `limit` (1–60, default 20), `known` (`[{ "source": "google_maps_browser", "source_id": "…" }]` to skip), `maxImages`, `maxMenuImages`, `maxScrolls`, `includeReviews`, `maxReviews`, `maxReviewScrolls`, `reviewSort`, `cookiesFile`.

Response (`schema_version: "gmaps.scan.v1"`): `status` (`ok` or `incomplete` when a place could not be read completely), `items` (one [observation](data.md#observation-gmapsplacev1) per place), `skipped_known`, `search` (`status`, `truncated`, `requested_limit`), `cookie_stats`.

## gmaps-session — keep a profile healthy

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-session check                     # view + session, repairs a limited view
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-session check --place "<link>"    # check with another place
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-session import ./cookies.json     # optional: load a cookie export once
```

Output: `{ "status": "ok", "command", "session": "signed_in" | "signed_out" | "unknown", "rotated", "view": "full" | "limited" | …, "renewed", "profile", "cookie_stats" }`.

Exit code `0` = full view, `3` = not full, `2` = error. Run `check` hourly from cron: it repairs a limited view, and for signed-in profiles it waits for Google's cookie rotation (up to 60 s). See [Full view](full-view.md).

## gmaps-login — optional sign-in on a computer with a screen

```powershell
$env:MAPS_PROFILE_DIR = "C:\gmaps-profile"; npx gmaps-login
```

Opens the installed Chrome as an ordinary (not automated) window with the profile. Sign in, close the window, and the command checks the profile headlessly. Default profile: `~/.gmaps-place-reader/profile`; `--profile <absolute dir>` overrides it. Exit code `0` = signed in, `3` = not.

## Error codes

`CHROME_PATH_REQUIRED` (set `MAPS_CHROME_PATH`), `MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE`, `INVALID_MAPS_URL`, `INVALID_SCHEMA`, `INVALID_ARGUMENT`, `INPUT_TOO_LARGE`, `LOCATION_REQUIRED`, `MAPS_COOKIES_FILE_REQUIRED`, `MAPS_COOKIES_FILE_UNREADABLE`, `MAPS_COOKIES_FILE_TOO_LARGE`, `MAPS_COOKIES_INVALID_JSON`, `MAPS_COOKIES_INVALID_FORMAT`, `MAPS_COOKIES_EMPTY`, `MAPS_COOKIES_REJECTED`, `BROWSER_FAILED` (anything else). Errors never contain file paths, cookie names or values.
