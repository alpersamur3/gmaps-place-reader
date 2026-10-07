# gmaps-place-reader documentation

[Türkçe](tr/README.md) · [Back to the project](../README.md)

| Page | What it covers |
|---|---|
| [Full view without an account](full-view.md) | Why Google shows a limited view, the anonymous id cookie (`__Secure-ENID` / `NID`), how the reader keeps the full view, test results, why no account is used. |
| [API reference](api.md) | Every function and option. |
| [Data reference](data.md) | Every field of places, menus, photos, reviews and observations. |
| [Command line](cli.md) | `gmaps-place`, `gmaps-scan`, `gmaps-view`, request and response JSON, error codes. |
| [MCP server](mcp.md) | `gmaps-mcp` for AI agents (Claude Code, Claude Desktop, other MCP clients): setup, tools, limits. |
| [Statuses, warnings and troubleshooting](troubleshooting.md) | What each status and warning means and what to do. |

## Quick recipes

Read one place by link, with its 300 newest reviews:

```js
import { launchBrowser, readPlaceUrl } from 'gmaps-place-reader';

const browser = await launchBrowser({ userDataDir: '/srv/gmaps/profile' });   // persistent profile, no account
try {
  const place = await readPlaceUrl(browser, 'https://maps.app.goo.gl/…', {
    includeReviews: true, reviewSort: 'newest', maxReviews: 300, maxReviewScrolls: 40, maxMenuImages: 200,
  });
  console.log(place.view, place.status, place.name, place.review_count);
  for (const review of place.reviews.reviews) console.log(review.date_iso || review.date_estimate, review.rating, review.text);
  for (const photo of place.menu.images) console.log(photo.taken_at, photo.width, photo.height, photo.url);
} finally {
  await browser.close();
}
```

The same from the command line:

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-place --url "https://maps.app.goo.gl/…" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40
```

Keep the profile in the full view (cron, hourly):

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view   # exit 0 = full view
```
