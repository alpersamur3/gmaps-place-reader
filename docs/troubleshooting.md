# Statuses, warnings and troubleshooting

[Türkçe](tr/troubleshooting.md) · [Docs index](README.md)

Every result says what it could and could not read. Check `status` and `view` first, then `warnings`.

## Status

| `status` | Meaning | What to do |
|---|---|---|
| `ok` | Everything that was requested was read. Limits you set may still have stopped a list (`…_LIMIT_OR_SCROLL_LIMIT`). | — |
| `incomplete` | The place was read in the full view, but a part failed; see `warnings`. | Usually transient; read the place again. |
| `limited_view` | Google served the limited view and it could not be repaired ([Full view](full-view.md)). Menu items, the album and some details are missing. Since late October 2026 Google serves it to every anonymous browser. | Sign the persistent profile in once with `gmaps-login` ([Signing in](sign-in.md)) and keep `gmaps-view --no-repair` running from cron. For anonymous profiles: run `gmaps-view` and make sure the user agent's operating system matches the one the profile was created on. |
| `consent_required` | The EU consent page could not be passed (no "Reject all" button). | Check the page in a visible browser (`headless: false`). |
| `auth_required` | Google showed a sign-in page instead of the place. | Rare. Read the place again; if it repeats on a signed-in profile, the session ended: run `gmaps-login` again on that machine. Otherwise start with a fresh profile. |
| `blocked` | "Unusual traffic" / CAPTCHA. The reader never tries to bypass it. | Slow down, pause, read fewer places per run. |
| `unavailable` | The place panel did not load, or the link is not a place. | Check the link; try again. |

## Warnings

| Warning | Meaning |
|---|---|
| `LIMITED_VIEW` | The place was read in the limited view. |
| `MENU_PHOTOS_UNAVAILABLE` | Menu items were read but the menu photo album could not be opened. |
| `MENU_IMAGES_NOT_LOADED` | The album opened but no photo loaded. |
| `PHOTO_GALLERY_NOT_EXPOSED`, `MENU_CATEGORY_NOT_EXPOSED`, `MENU_UNAVAILABLE` | Why the menu album was unavailable (gallery not offered, or offered without categories). |
| `MENU_READ_FAILED`, `PHOTOS_READ_FAILED` | Reading the menu or the gallery threw an error (the gallery is retried once first). |
| `PHOTOS_UNAVAILABLE` | No general photos were found. |
| `PHOTO_GALLERY_NOT_OPENED` | The photo gallery did not open, so `photos` holds only the few photos shown on the place overview. Usually transient; read the place again. |
| `REVIEWS_UNAVAILABLE` | Reviews were requested but none could be read, although the place has a rating. |
| `REVIEW_SORT_NOT_APPLIED` | The requested `reviewSort` could not be selected; reviews are in `sort_label` order. |
| `REVIEWS_LIMIT_OR_SCROLL_LIMIT`, `MENU_IMAGE_LIMIT_OR_SCROLL_LIMIT`, `PHOTO_IMAGE_LIMIT_OR_SCROLL_LIMIT` | Your own limits stopped a list. Not an error; raise `maxReviews` / `maxReviewScrolls`, `maxMenuImages`, `maxImages`. |

`reviews.reason`: `REVIEW_TAB_NOT_FOUND`, `REVIEW_CARDS_NOT_LOADED`, `REVIEW_READ_FAILED`, or the page status in capitals. `menu.reason`: `NO_MENU_CATEGORY` (the place has no menu photos), `PHOTO_GALLERY_NOT_EXPOSED`, `MENU_CATEGORY_NOT_EXPOSED`.

## Common questions

**Some reviews have no exact date.** `date_iso` is only filled when Google's own data agrees with the visible label; `date_estimate` and `date_precision` are always there. Edited reviews show the edit age in the label but the original posting time in `date_iso`.

**The menu album has more photos than "Fotoğraf 1/N" says.** The strip shows Google's selection; the album in the viewer is the full Menu category.

**The same photo has different URLs in different runs.** Google signs photo URLs per browser (`gps-cs-s/…`, `grass-cs/…`). Compare photos by `taken_at`, `width`, `height` and `label`, not by URL.

**Results differ between two computers.** Check `view` and `account` in both results. Since late October 2026 the full view needs a signed-in profile (`account: 'signed_in'`); sign in with `gmaps-login` on the computer that shows `limited`.

**The profile was signed in, now `account` is `signed_out`.** Run `gmaps-login` again on the same machine. A profile that was signed in on one computer and copied to another is signed out by Google within minutes to hours; create the session where the reader runs ([Signing in](sign-in.md)).

**Chrome does not start on Linux.** Set `MAPS_CHROME_PATH` (e.g. `/usr/bin/google-chrome`), run as a normal user (not root), and give each running browser its own profile folder.

**Selectors stop working after a Maps update.** You get `unavailable` or `incomplete` with warnings, never invented data. Please open an issue with the place link and the warnings.
