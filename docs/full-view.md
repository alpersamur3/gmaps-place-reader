# Full view without an account

[Türkçe](tr/full-view.md) · [Docs index](README.md)

Google Maps shows anonymous browsers one of two versions of a place page:

| | Limited view | Full view |
|---|---|---|
| Name, address, phone, website, rating, coordinates | yes | yes |
| Review count | often hidden | yes |
| Opening hours for all seven days | often only today | yes |
| Price range | no | yes |
| About tab (attributes) | a few or none | all |
| Menu tab: items, prices, categories | **no** | yes |
| Menu photo album | rarely, often a single photo | yes, with the month each photo was taken |
| Reviews tab | sometimes missing | yes |

No Google account is needed for the full view. Everything below was measured with this library in October 2026, from a server in the EU (Finland) and from a computer in Turkey.

## What decides the view

The browser's **anonymous id cookie** decides it:

- In the EU consent region the cookie is `__Secure-ENID`. Google issues it with the first Maps page, after the consent page; the reader picks "Reject all" there. It lives about 13 months.
- Elsewhere the cookie is `NID` (about 6 months). Turkey shows no consent page and issues no ENID.

Google issues each id in one of the two classes and the id keeps that class. In our tests about half of the new ids in Turkey and about two thirds in the EU were in the full class.

| Observation | Result |
|---|---|
| A full-class id copied into a profile that only got limited ids | Full view from the first page load; it stays after restarts. |
| The same id from another IP address (server → home computer) | Works. |
| The same id with a user agent of another operating system (Linux id, Windows user agent) | Limited. With a Linux user agent, full. The Chrome version does not matter. |
| Deleting the id (and SOCS, `__Secure-BUCKET`, `SEARCH_SAMESITE`) in a limited profile | The profile receives a limited id again. |
| Copying Chrome's `Local State` (field trials) from a full profile | No effect. |
| The NID of a signed-in profile, used alone | Limited. Signing in does not upgrade the anonymous id. |

### Same data as a signed-in session

The same place was read with the same options twice, once by a signed-in profile and once by an anonymous full-view profile. The results were identical:

- Business details (name, address, phone, website, rating, review count, price range, coordinates, 7-day hours) and 51 of 51 About attributes.
- Menu: 187 of 187 items and 23 of 23 categories.
- Menu album: the same 40 photos in the same order, by month, size and label. Only the URL form differs (`gps-cs-s/…` signed in, `grass-cs/…` anonymous); both download the same image.
- Reviews: the same 100 reviews in "newest" order, by id. All 100 had exact dates and 87 had details.

On the EU server, anonymous profiles also read 300 newest reviews (all with exact dates), the complete menu album, every supported link format including a `maps.app.goo.gl` share link, and multi-place scans.

### Why no account

The reader never signs in and loads no cookies. A Google account would add nothing (see above), and Google revokes sessions whose cookies are moved to another machine: in our tests imported sessions were signed out between about five minutes and two hours after they reached the server, also when the cookies came from a private window that was not used again.

## How the reader keeps the full view

1. **Use a persistent profile** (`MAPS_PROFILE_DIR` or `launchBrowser({ userDataDir })`, an absolute path). The profile stores the anonymous id. Without one, every launch starts with a new random id.
2. **Recovery in `readPlace`** (option `recoverView`, default `true`). When a place comes back limited, these steps run in order:
   1. **Reload once.** A fresh profile receives its id with the first page, and the id only applies from the next request.
   2. **Renew.** Start up to six fresh temporary profiles with the same Chrome until one gets the full view. Move its anonymous id cookie(s) into your profile, replacing the limited ones, and reload the place. Each temporary profile takes about 10–20 s and is deleted afterwards.
   3. **If no temporary profile gets the full view** (rare: about 1–2 % with a 50 % chance per profile, or when Google issues no id at all), the place is returned as it is: `status: 'limited_view'`, `view: 'limited'`, warning `LIMITED_VIEW`. The browser is marked so that later places do not pay for more attempts; it reads them in the limited view and says so in every result. The next browser launch, or the next `gmaps-view`, tries again.
3. **Check from cron.** `gmaps-view` opens a well-known place, reports `"view"` and repairs a limited view the same way. Exit code `0` means full view, `3` limited.

   ```bash
   # /etc/cron.d/gmaps-view — every hour, as the user that runs the reader
   17 * * * * reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view >> /var/log/gmaps-view.log 2>&1
   ```

   ```json
   {"status":"ok","view":"full","renewed":0,"profile":"/srv/gmaps/profile"}
   ```

### Every result says which view it got

- `readPlace` / `readPlaceUrl`: `view` (`full` · `limited` · `unknown`), `view_renewed` (how many ids were brought in for this place), `status`, `warnings` and `data_quality`.
- `scan` items and `toObservation`: `view`, `warnings`, `source_error`.
- `gmaps-place`: `view` at the top level and in `place`.

### Practical notes

- **One profile per running browser.** Chrome locks the profile folder. Use separate profiles for parallel workers; each gets its own id.
- **Same operating system.** An id issued on Linux only works with a Linux user agent. Do not copy profiles between operating systems.
- **Avoid bursts.** Creating many new ids from one address in a short time produced more limited ids in our tests. The reader creates them only when needed, and a persistent profile keeps a good one for months.
- **Keep the profile private.** It is not an account credential, but it identifies the browser.

