// MCP server (Model Context Protocol, JSON-RPC 2.0 over stdio) on top of this library, for AI agents:
// search, place, reviews and photos tools. Tools need only a small part of the protocol, so there is no SDK
// dependency. bin/mcp.js (`gmaps-mcp`) runs it; see docs/mcp.md.
import { readFileSync } from 'node:fs';
import { launchBrowser, newMapsPage, normalizePlaceUrl, readPlace, searchPlaces, imageUrl, fullImageUrl } from './maps.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// Newest first; a client asking for another version gets the newest (tools work the same in all of them).
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SORTS = ['newest', 'relevant', 'highest', 'lowest'];
// Longest side requested from Google: menu pages stay readable, and many images still fit one model request.
export const PHOTO_SIDE = 1280;
export const PHOTOS_PER_CALL = 8;
const PHOTO_BYTES = 5 * 1024 * 1024;

const INSTRUCTIONS = 'Reads public Google Maps pages with a local Chrome; no API key or Google account. '
  + 'Use search to find place links, place for details, the written menu and photo URLs, reviews for reviews, '
  + 'and photos to look at photo URLs (e.g. menu pages). A place read takes 30-90 s and reads run one at a time, '
  + 'so do not read the same place twice. Results say what could not be read: check status, view and warnings.';

const placeUrl = { type: 'string', description: 'Google Maps place link: a maps.app.goo.gl share link, google.<country>/maps/place/… or a ?cid= link.' };
const sort = { type: 'string', enum: SORTS, description: 'Review order (default newest).' };
const readOnly = { readOnlyHint: true, openWorldHint: true };
export const TOOLS = [
  { name: 'search', title: 'Search Google Maps',
    description: 'Find places by keyword and location. Returns names and place links for the place and reviews tools. Takes 10-30 s.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['query', 'location'], properties: {
      query: { type: 'string', maxLength: 100, description: 'What to look for: a kind of place ("pizza", "dentist") or a business name.' },
      location: { type: 'string', maxLength: 120, description: 'Area to search, e.g. "Kadıköy, İstanbul".' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Places to return (default 5).' } } },
    annotations: readOnly },
  { name: 'place', title: 'Read a Google Maps place',
    description: 'Read one place: address, phone, website, opening hours, rating, About attributes, the written menu with prices '
      + '(Menu tab), menu album photos with the month each was taken, gallery photos and optionally the newest reviews. '
      + 'Photos come as URLs; look at them with the photos tool. Takes 30-90 s.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['url'], properties: {
      url: placeUrl,
      menu_photos: { type: 'integer', minimum: 1, maximum: 200, description: 'Menu album photos to list (default 20).' },
      photos: { type: 'integer', minimum: 1, maximum: 60, description: 'Gallery photos to list (default 12).' },
      reviews: { type: 'integer', minimum: 0, maximum: 100, description: 'Reviews to include (default 0; the reviews tool reads more).' },
      review_sort: sort } },
    annotations: readOnly },
  { name: 'reviews', title: 'Read Google Maps reviews',
    description: 'Read the reviews of a place, without reviewer names: rating, full text, date (exact when Google provides it), '
      + 'sub-ratings and details such as price per person, and the owner response. About 10 reviews per 2-3 s.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['url'], properties: {
      url: placeUrl,
      count: { type: 'integer', minimum: 1, maximum: 500, description: 'Reviews to read (default 50).' },
      sort } },
    annotations: readOnly },
  { name: 'photos', title: 'Look at Google Maps photos',
    description: `Look at up to ${PHOTOS_PER_CALL} Google Maps photos by URL (from place or reviews), e.g. to read a menu page. `
      + `Each photo is returned as an image, longest side ${PHOTO_SIDE} px.`,
    inputSchema: { type: 'object', additionalProperties: false, required: ['urls'], properties: {
      urls: { type: 'array', minItems: 1, maxItems: PHOTOS_PER_CALL, items: { type: 'string' } } } },
    annotations: readOnly },
];

const clip = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (value, fallback, min, max) => (Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback);
/** A count from the environment; empty or invalid keeps the default, 0 means no limit. */
const envCount = (value, fallback) => {
  const number = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number) || Infinity;
};
const reviewSort = value => (SORTS.includes(value) ? value : 'newest');

/** Reviews without reviewer identity (no name, profile, avatar or review id). */
export function reviewRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    rating: Number.isFinite(row?.rating) ? row.rating : null,
    date: row?.date_iso ? row.date_iso.slice(0, 10) : row?.date_estimate || '',
    date_precision: row?.date_iso ? 'exact' : row?.date_precision || '',
    ...(row?.edited ? { edited: true, edited_estimate: row.edited_estimate || '' } : {}),
    text: clip(row?.text, 4000),
    ...(row?.translated ? { translated: true } : {}),
    language: row?.language || '',
    details: (Array.isArray(row?.details) ? row.details : []).map(item => ({ name: clip(item?.name, 80), value: clip(item?.value, 200) })),
    owner_response: clip(row?.owner_response, 2000),
    likes: Number.isFinite(row?.likes) ? row.likes : 0,
    photos: (Array.isArray(row?.photos) ? row.photos : []).map(url => fullImageUrl(url)).filter(Boolean),
  }));
}

const reviewSummary = result => ({ status: result.status, reason: result.reason, total_count: result.total_count,
  collected_count: result.collected_count, sort_label: result.sort_label, sort_applied: result.sort_applied,
  coverage_complete: !!result.coverage_complete, truncated: !!result.truncated, reviews: reviewRows(result.reviews) });

/** What the place tool returns: readPlace without raw page data, photos as large URLs, reviews without names. */
export function placeSummary(detail) {
  const menu = detail.menu || {};
  const about = {};
  for (const item of Array.isArray(detail.attributes) ? detail.attributes : []) {
    if (item?.available === false || !item?.name) continue;
    (about[item.category || 'Other'] ||= []).push(item.name);
  }
  return {
    status: detail.status, view: detail.view, warnings: detail.warnings || [], google_maps_url: detail.google_maps_url,
    name: detail.name, address: String(detail.address || '').replace(/^(?:Adres|Address):\s*/i, '') || undefined,
    phone: String(detail.phone || '').replace(/^(?:Telefon|Phone):\s*/i, '') || undefined,
    website: detail.website, menu_url: detail.menu_url, business_type: detail.business_type, price_level: detail.price_level,
    rating: detail.rating, review_count: detail.review_count, description: detail.description,
    opening_hours: detail.opening_hours, opening_hours_rows: detail.opening_hours_rows,
    latitude: detail.latitude, longitude: detail.longitude, place_id: detail.place_id, cid: detail.cid,
    about: Object.keys(about).length ? about : undefined,
    ...(detail.menu ? { menu: { status: menu.status, reason: menu.reason, coverage_complete: !!menu.coverage_complete,
      expected_photos: menu.expected_images, categories: menu.categories || [],
      items: (menu.items || []).map(item => ({ category: item.category, name: item.name, price: item.price_text, description: item.description || undefined })),
      photos: (menu.images || []).map(image => ({ url: fullImageUrl(image.url), taken_at: image.taken_at || '', width: image.width, height: image.height })) } } : {}),
    ...(detail.photos ? { photos: (detail.photos.images || []).map(image => ({ url: fullImageUrl(image.url), label: image.label || undefined })) } : {}),
    ...(detail.reviews ? { reviews: reviewSummary(detail.reviews) } : {}),
  };
}

/** A Google photo URL resized to `side` on its longest side; '' for anything that is not a Google photo. */
export function photoUrl(value, side = PHOTO_SIDE) {
  const safe = imageUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  const size = /=(?:w\d+(?:-h\d+)?|h\d+(?:-w\d+)?|s\d+)(?:-[a-z0-9]+)*$/i;
  url.pathname = size.test(url.pathname) ? url.pathname.replace(size, `=s${side}-k-no`) : `${url.pathname}=s${side}-k-no`;
  return url.toString();
}

export function imageMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

/** Downloads one Google photo (photoUrl only): no redirects, at most 5 MB, JPEG/PNG/WebP by content. */
export async function downloadPhoto(url, { fetchImpl = fetch, maxBytes = PHOTO_BYTES, timeoutMs = 20000 } = {}) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'image/jpeg,image/png,image/webp' } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('TOO_LARGE');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('TOO_LARGE');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const mimeType = imageMime(buffer);
  if (!mimeType) throw new Error('NOT_AN_IMAGE');
  return { data: buffer.toString('base64'), mimeType };
}

/** One browser for the whole session, opened on the first read (MAPS_CHROME_PATH, MAPS_PROFILE_DIR) and reopened if it died. */
export function mapsReader({ launch = launchBrowser } = {}) {
  let browser;
  const withPage = async run => {
    if (!browser?.connected) { await browser?.close().catch(() => {}); browser = await launch(); }
    const page = await newMapsPage(browser);
    try { return await run(page); } finally { await page.close().catch(() => {}); }
  };
  return {
    place: (url, options) => withPage(page => readPlace(page, { google_maps_url: url }, options)),
    search: (query, location, limit) => withPage(page => searchPlaces(page, { location, keyword: query, limit })),
    async close() { const open = browser; browser = undefined; await open?.close().catch(() => {}); },
  };
}

/**
 * The protocol and the tools. handle(message) answers one JSON-RPC message (null for notifications); tool calls run
 * one at a time on one browser. notify(message) sends progress notifications when a call carries a progressToken.
 * Limits: MAPS_MCP_MAX_READS (search/place/reviews per session, default 30), MAPS_MCP_MAX_PHOTOS (photos per session,
 * default 100), MAPS_MCP_PAUSE_MS (pause between Maps reads, default 3000); 0 turns a limit off.
 */
export function createMcpServer({ env = process.env, reader = mapsReader(), download = downloadPhoto, notify = () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const pause = envCount(env.MAPS_MCP_PAUSE_MS, 3000);
  const limits = { reads: envCount(env.MAPS_MCP_MAX_READS, 30), photos: envCount(env.MAPS_MCP_MAX_PHOTOS, 100),
    pauseMs: pause === Infinity ? 0 : Math.min(60000, pause) };
  const used = { reads: 0, photos: 0 };
  let lastRead = 0, queue = Promise.resolve();
  const json = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const target = args => {
    const url = normalizePlaceUrl(String(args?.url || ''));
    if (!url) throw new Error('INVALID_MAPS_URL');
    return url;
  };
  const read = async () => {
    if (used.reads >= limits.reads) {
      throw new Error(`READ_LIMIT: this server allows ${limits.reads} Maps reads per session (MAPS_MCP_MAX_READS); use the results you already have`);
    }
    used.reads++;
    const wait = lastRead + limits.pauseMs - Date.now();
    if (lastRead && wait > 0) await sleep(wait);
  };
  const done = () => { lastRead = Date.now(); };

  const handlers = {
    async search(args) {
      const query = clip(args?.query, 100), location = clip(args?.location, 120);
      if (!query || !location) throw new Error('QUERY_AND_LOCATION_REQUIRED');
      await read();
      try {
        const found = await reader.search(query, location, int(args?.limit, 5, 1, 20));
        return json({ status: found.status, places: (found.places || []).map(place => ({ name: place.name, url: place.google_maps_url })),
          truncated: !!found.truncated });
      } finally { done(); }
    },
    async place(args, onProgress) {
      const url = target(args);
      const reviews = int(args?.reviews, 0, 0, 100);
      await read();
      try {
        return json(placeSummary(await reader.place(url, { maxMenuImages: int(args?.menu_photos, 20, 1, 200),
          maxImages: int(args?.photos, 12, 1, 60), includeReviews: reviews > 0, maxReviews: Math.max(1, reviews),
          maxReviewScrolls: Math.ceil(reviews / 10) + 2, reviewSort: reviewSort(args?.review_sort), onProgress })));
      } finally { done(); }
    },
    async reviews(args, onProgress) {
      const url = target(args);
      const count = int(args?.count, 50, 1, 500);
      await read();
      try {
        const detail = await reader.place(url, { includeMenu: false, includePhotos: false, includeReviews: true, maxReviews: count,
          maxReviewScrolls: Math.ceil(count / 10) + 2, reviewSort: reviewSort(args?.sort), onProgress });
        return json({ status: detail.status, view: detail.view, warnings: detail.warnings || [], name: detail.name,
          google_maps_url: detail.google_maps_url, rating: detail.rating, review_count: detail.review_count,
          ...(detail.reviews ? reviewSummary(detail.reviews) : {}) });
      } finally { done(); }
    },
    async photos(args) {
      const urls = (Array.isArray(args?.urls) ? args.urls : []).slice(0, PHOTOS_PER_CALL);
      if (!urls.length) throw new Error('URLS_REQUIRED');
      const content = [], seen = new Set();
      for (const raw of urls) {
        const url = photoUrl(String(raw));
        const shown = clip(String(raw), 300);
        if (!url) { content.push({ type: 'text', text: `${shown}: not a Google Maps photo URL` }); continue; }
        if (seen.has(url)) continue;
        seen.add(url);
        if (used.photos >= limits.photos) {
          content.push({ type: 'text', text: `${shown}: photo limit of this session reached (MAPS_MCP_MAX_PHOTOS)` });
          continue;
        }
        try {
          const image = await download(url);
          used.photos++;
          content.push({ type: 'text', text: url }, { type: 'image', data: image.data, mimeType: image.mimeType });
        } catch (error) {
          content.push({ type: 'text', text: `${shown}: could not be downloaded (${clip(String(error?.message), 40)})` });
        }
      }
      return { content };
    },
  };

  const progress = token => {
    if (token === undefined || token === null) return undefined;
    let step = 0;
    return async event => {
      const text = event.stage === 'menu_category' ? `menu: ${event.category}`
        : event.stage === 'menu_photos' ? `menu photos: ${event.images}`
          : event.stage === 'reviews' ? `reviews: ${event.collected ?? event.collected_count ?? 0}` : 'place opened';
      notify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++step, message: text } });
    };
  };

  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }
    // Notifications (no id) and responses to us (no method) need no answer.
    if (message.id === undefined || message.id === null || typeof message.method !== 'string') return null;
    const reply = result => ({ jsonrpc: '2.0', id: message.id, result });
    const error = (code, text) => ({ jsonrpc: '2.0', id: message.id, error: { code, message: text } });
    switch (message.method) {
      case 'initialize': {
        const asked = message.params?.protocolVersion;
        return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} }, serverInfo: { name: 'gmaps-place-reader', title: 'Google Maps place reader', version: VERSION },
          instructions: INSTRUCTIONS });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = message.params?.name;
        if (!Object.hasOwn(handlers, name)) return error(-32602, `Unknown tool: ${clip(String(name), 40)}`);
        const onProgress = progress(message.params?._meta?.progressToken);
        const run = queue.then(() => handlers[name](message.params?.arguments || {}, onProgress));
        queue = run.catch(() => {});
        try { return reply(await run); }
        catch (failure) {
          // Our own codes (INVALID_MAPS_URL, READ_LIMIT: …, CHROME_PATH_REQUIRED …) as they are; anything else shortened.
          const text = String(failure?.message || '');
          return reply({ content: [{ type: 'text', text: /^[A-Z_]+(?::|$)/.test(text) ? text : `MAPS_READ_FAILED: ${clip(text, 200)}` }], isError: true });
        }
      }
      default: return error(-32601, 'Method not found');
    }
  }
  return { handle, close: () => reader.close(), limits, used };
}
