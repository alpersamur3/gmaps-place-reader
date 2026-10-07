# MCP server (`gmaps-mcp`)

[Türkçe](tr/mcp.md) · [Docs index](README.md)

`gmaps-mcp` lets AI agents read Google Maps through the [Model Context Protocol](https://modelcontextprotocol.io): Claude Code, Claude Desktop and any other MCP client. The agent can search places, read a place (details, About attributes, the written menu with prices, the menu album with the month each photo was taken, gallery photos), read reviews, and look at photos as images, for example to read a menu page.

It runs on your own computer with your own Chrome or Chromium. There is no API key, no Google account and no hosted service.

## Setup

You need Node.js 20+ and Chrome or Chromium. Choose a folder for a persistent browser profile (absolute path): it keeps Google's full view, see [Full view without an account](full-view.md). On Linux and macOS also set `MAPS_CHROME_PATH`.

**Claude Code:**

```bash
claude mcp add gmaps -e MAPS_PROFILE_DIR=/absolute/path/gmaps-profile -- npx -y -p gmaps-place-reader gmaps-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gmaps": {
      "command": "npx",
      "args": ["-y", "-p", "gmaps-place-reader", "gmaps-mcp"],
      "env": { "MAPS_PROFILE_DIR": "C:\\gmaps-profile" }
    }
  }
}
```

**Other clients:** start `npx -y -p gmaps-place-reader gmaps-mcp` as a stdio server. With the package installed in a project, `npx gmaps-mcp` is enough.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `search` | `query`, `location`, `limit` (1–20, default 5) | `{ status, places: [{ name, url }], truncated }`. About 10–30 s. |
| `place` | `url`, `menu_photos` (1–200, default 20), `photos` (1–60, default 12), `reviews` (0–100, default 0), `review_sort` | Status, `view`, `warnings`, name, address, phone, website, hours (`opening_hours_rows`), rating, review count, price level, coordinates, `about` (attributes by category), `menu` (`items` with prices, `categories`, `photos` with `taken_at`, width and height), gallery `photos`, and `reviews` when asked. About 30–90 s. |
| `reviews` | `url`, `count` (1–500, default 50), `sort` (`newest` · `relevant` · `highest` · `lowest`, default `newest`) | Rating, review count, `collected_count`, `total_count`, `sort_applied`, `coverage_complete` and `reviews`. Each review: `rating`, `date`, `date_precision` (`exact` when Google's own data confirmed the date), `text`, `details` (sub-ratings, price per person …), `owner_response`, `likes`, `language`, `photos`, `edited`, `translated`. Skips the menu and the gallery, so it is quick: 30 reviews took about 10 s in our test. |
| `photos` | `urls` (1–8 photo URLs from `place` or `reviews`) | For each photo its URL and the image itself (JPEG, longest side 1280 px). Other URLs are refused. |

`url` accepts every link the library accepts: `maps.app.goo.gl` share links, `google.<country>/maps/place/…`, `?cid=` links and links copied on the Menu or Reviews tab.

**Reviews come without reviewer names, profiles or avatars.**

## Settings and limits

| Environment variable | Default | Meaning |
|---|---|---|
| `MAPS_PROFILE_DIR` | — | Persistent browser profile, absolute path. Recommended. |
| `MAPS_CHROME_PATH` | Windows Chrome | Chrome or Chromium binary. |
| `MAPS_MCP_MAX_READS` | 30 | `search`, `place` and `reviews` calls per session. `0` = no limit. |
| `MAPS_MCP_MAX_PHOTOS` | 100 | Photos per session for the `photos` tool. `0` = no limit. |
| `MAPS_MCP_PAUSE_MS` | 3000 | Minimum pause between two Maps reads. |

A session is one run of the server; the client starts it.

## How it behaves

- **One browser, one read at a time.** Chrome opens at the first read and closes when the client disconnects. Calls wait for each other, so an agent that asks for several places gets them one after another.
- **Long reads report progress** when the client sends a `progressToken`. If your client stops waiting, raise its tool timeout (Claude Code: `MCP_TOOL_TIMEOUT`, in milliseconds) or ask for fewer menu photos and reviews.
- **Honest results.** Every result says what could not be read: `status`, `view` and `warnings` ([Troubleshooting](troubleshooting.md)). A limited view is repaired as described in [Full view](full-view.md).
- **Errors** come back as tool errors: `INVALID_MAPS_URL`, `QUERY_AND_LOCATION_REQUIRED`, `READ_LIMIT: …`, `CHROME_PATH_REQUIRED`, `MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE`, or `MAPS_READ_FAILED: …` with a short reason.

## Use it responsibly

The server is meant for personal and research use at low volumes. Automated access to Google Maps may conflict with the [Google Maps Terms of Service](https://www.google.com/help/terms_maps/); you are responsible for how you use it. Keep the default limits and pauses, read few places per session, and never try to get around CAPTCHAs (the reader stops at them). Photos, reviews and texts belong to their owners.

## Example prompts

- "Find three seafood restaurants in Kadıköy, İstanbul and compare the prices on their newest menu photos."
- "Read the 100 newest reviews of https://maps.app.goo.gl/… and summarise the complaints by month."
- "Is this café open on Sunday mornings, and does it have outdoor seating?"
