import puppeteer from 'puppeteer-core';
import crypto from 'node:crypto';
import path from 'node:path';
import { loadGoogleCookies, applyBrowserCookies } from './cookies.js';
import { extractPlaceDetails, pageStatus } from './details.js';
import { imageUrl, fullImageUrl, imageIdentity, readMenu, readMenuPhotos, readPhotos, viewerPhoto, photoMonth } from './media.js';
export { pageStatus, imageUrl, fullImageUrl, readMenu, readMenuPhotos, readPhotos, viewerPhoto, photoMonth };

const MAPS = 'https://www.google.com/maps';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const cap = (value, max) => clean(value).slice(0, max);

export function placeIdentity(url) {
  const value = String(url || '');
  const feature = value.match(/!1s(0x[\da-f]+:0x[\da-f]+)/i);
  if (feature) return feature[1].toLowerCase();
  const cid = value.match(/[?&]cid=(\d+)/);
  if (cid) return `cid:${cid[1]}`;
  const placeId = value.match(/[?&](?:query_place_id|place_id)=([^&#]+)/) || value.match(/!(?:1|19)s(ChI[\w-]+)/);
  if (placeId) return `place:${placeId[1]}`;
  const path = value.match(/\/maps\/place\/([^/?#]+)/);
  if (!path) return '';
  try { return `path:${decodeURIComponent(path[1]).toLocaleLowerCase('tr')}`; }
  catch { return ''; }
}

function safeMapsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname)) return '';
    if (!url.pathname.startsWith('/maps/')) return '';
    return url.toString();
  } catch { return ''; }
}

export async function launchBrowser(options = {}) {
  const executablePath = options.executablePath || process.env.MAPS_CHROME_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  if (!executablePath) throw new Error('CHROME_PATH_REQUIRED');
  const userDataDir = options.userDataDir || process.env.MAPS_PROFILE_DIR;
  if (userDataDir && !path.isAbsolute(userDataDir)) throw new Error('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
  const loaded = await loadGoogleCookies(options);
  const browser = await puppeteer.launch({ executablePath, headless: options.headless ?? true,
    args: ['--lang=tr-TR', '--no-first-run', '--disable-extensions'],
    defaultViewport: { width: 1365, height: 900 },
    userDataDir, timeout: 20000 });
  try {
    browser.mapsCookieStats = await applyBrowserCookies(browser, loaded);
    return browser;
  } catch (error) { await browser.close(); throw error; }
}

export async function newMapsPage(browser) {
  const page = await browser.newPage();
  // Maps serves a reduced UI to Chrome's HeadlessChrome UA (including no Menu
  // tab). Keep the installed browser/version/platform, using its desktop UA.
  const userAgent = await browser.userAgent();
  if (userAgent.includes('HeadlessChrome/')) await page.setUserAgent(userAgent.replace(/HeadlessChrome\//g, 'Chrome/'));
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9' });
  page.setDefaultNavigationTimeout(25000);
  return page;
}

/**
 * From EU IP addresses Google first shows its cookie consent page. Only "Reject all" is chosen
 * (nothing is accepted, only essential cookies remain); a persistent profile (MAPS_PROFILE_DIR)
 * remembers the choice and Google returns to the requested page. Without a reject button the
 * status stays consent_required.
 */
export async function passConsent(page) {
  if (await pageStatus(page) !== 'consent_required') return false;
  const clicked = await page.evaluate(() => {
    const reject = [...document.querySelectorAll('button, input[type="submit"]')]
      .find(el => /^(tümünü reddet|reject all|alle ablehnen|tout refuser|rifiuta tutto|rechazar todo)$/i.test((el.innerText || el.value || '').trim()));
    reject?.click();
    return !!reject;
  });
  if (!clicked) return false;
  await page.waitForFunction(() => !/^consent\./.test(location.hostname), { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
  return await pageStatus(page) !== 'consent_required';
}

export async function searchPlaces(page, { location, keyword = 'restoran', limit = 20, maxScrolls = 8 } = {}) {
  if (!clean(location)) throw new Error('LOCATION_REQUIRED');
  limit = Math.max(1, Math.min(60, Number(limit) || 20));
  maxScrolls = Math.max(1, Math.min(50, Math.floor(Number(maxScrolls) || 8)));
  const query = `${cap(keyword, 100)} ${cap(location, 120)}`;
  await page.goto(`${MAPS}/search/${encodeURIComponent(query)}?hl=tr`, { waitUntil: 'domcontentloaded' });
  await passConsent(page);
  await page.waitForSelector('a[href*="/maps/place/"], h1', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => location.pathname.includes('/maps/place/') ||
    !!document.querySelector('[role="feed"] a[href*="/maps/place/"]'), { timeout: 10000 }).catch(() => {});
  await sleep(900); // Maps may render the place panel before updating the URL.
  const status = await pageStatus(page);
  if (!['ok', 'limited_view'].includes(status)) return { status, places: [] };
  const places = new Map();
  let stable = 0, exhausted = false;
  for (let attempt = 0; attempt <= maxScrolls; attempt++) {
    const beforeCount = places.size;
    const links = await page.evaluate(() => Array.from((document.querySelector('[role="feed"]') || document).querySelectorAll('a[href*="/maps/place/"]')).map(a => ({
      url: a.href, name: (a.getAttribute('aria-label') || a.querySelector('[role="heading"]')?.textContent || a.innerText || '').trim()
    })));
    for (const link of links) {
      const url = safeMapsUrl(link.url), id = placeIdentity(url);
      if (id && !places.has(id)) places.set(id, { source_id: id, name: cap(link.name, 200), google_maps_url: url });
      if (places.size >= limit) break;
    }
    stable = places.size === beforeCount ? stable + 1 : 0;
    if (places.size >= limit || attempt === maxScrolls) break;
    const scrolled = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return false;
      const before = feed.scrollTop;
      feed.scrollBy(0, Math.max(feed.clientHeight, 600));
      return feed.scrollTop !== before;
    });
    if (!scrolled && stable >= 3) { exhausted = true; break; }
    await sleep(650);
  }
  // Maps sometimes opens a single place rather than a list.
  if (!places.size && page.url().includes('/maps/place/')) {
    const url = safeMapsUrl(page.url()), id = placeIdentity(url);
    if (id) places.set(id, { source_id: id, name: cap(await page.title(), 200), google_maps_url: url });
  }
  return { status: places.size ? (status === 'limited_view' ? 'limited_view' : 'ok') : 'unavailable',
    places: [...places.values()].slice(0, limit), truncated: !exhausted, requested_limit: limit };
}

async function navigatePlace(page, target) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await passConsent(page);
      break;
    } catch (error) {
      if (attempt || !/Timeout|net::ERR_(CONNECTION|TIMED_OUT|NETWORK)/.test(String(error?.message))) throw error;
      await sleep(600);
    }
  }
  await page.waitForFunction(() => {
    const heading = [...document.querySelectorAll('h1')].find(el => el.innerText.trim() && !/^google maps$|^google haritalar$/i.test(el.innerText.trim()));
    return heading && document.querySelector('[data-item-id], [role="tab"]') ||
      location.hostname === 'accounts.google.com' || location.hostname.startsWith('consent.google.') || location.pathname.startsWith('/sorry/');
  }, { timeout: 15000 }).catch(() => {});
  await sleep(500);
}

export async function readPlace(page, place, { maxImages = 12, maxMenuImages = 20, maxScrolls = 20, onProgress } = {}) {
  const target = safeMapsUrl(place?.google_maps_url || place?.url);
  if (!target) throw new Error('INVALID_MAPS_URL');
  await navigatePlace(page, target);
  const status = await pageStatus(page);
  const canonical = safeMapsUrl(page.url()) || target;
  const identity = placeIdentity(canonical) || placeIdentity(target);
  if (!['ok', 'limited_view'].includes(status)) return { status, source_id: identity, google_maps_url: canonical };
  const details = await extractPlaceDetails(page);
  if (details.data_status !== 'ok') return { status: 'unavailable', source_id: identity, google_maps_url: canonical };
  if (onProgress) await onProgress({ stage:'overview', status }, page);
  const warnings = [];
  if (status !== 'ok') warnings.push(status.toUpperCase());
  let menu, photos;
  try { menu = await readMenu(page, { maxImages: maxMenuImages, maxScrolls, overviewUrl: canonical, onProgress }); }
  catch { menu = { status: 'unavailable', images: [], categories: [], coverage_complete: false }; warnings.push('MENU_READ_FAILED'); }
  try { photos = await readPhotos(page, { maxImages, maxScrolls, overviewUrl: canonical, exclude: (menu.images || []).map(row => row.url) }); }
  catch { photos = { status: 'unavailable', images: [], coverage_complete: false }; warnings.push('PHOTOS_READ_FAILED'); }
  const menuUrls = new Set(menu.images.map(row => imageIdentity(row.url)));
  photos.images = photos.images.filter(row => !menuUrls.has(imageIdentity(row.url)));
  if (menu.status === 'unavailable') warnings.push(menu.reason || 'MENU_UNAVAILABLE');
  if (menu.status === 'empty') warnings.push('MENU_IMAGES_NOT_LOADED');
  if (photos.status === 'unavailable') warnings.push('PHOTOS_UNAVAILABLE');
  if (menu.truncated) warnings.push('MENU_IMAGE_LIMIT_OR_SCROLL_LIMIT');
  if (photos.truncated) warnings.push('PHOTO_IMAGE_LIMIT_OR_SCROLL_LIMIT');
  // Hitting our own image limits is not a source failure; the warnings still record it.
  const finalStatus = status !== 'ok' ? status : warnings.some(code => !code.endsWith('_LIMIT_OR_SCROLL_LIMIT')) ? 'incomplete' : 'ok';
  return { status: finalStatus, source_id: identity, google_maps_url: canonical, ...details, menu, photos,
    warnings: [...new Set(warnings)], data_quality: { partial: finalStatus !== 'ok',
      review_count_observed: !!details.review_label, menu_coverage_complete: !!menu.coverage_complete,
      opening_hours_coverage_complete: details.opening_hours_rows?.length === 7,
      photo_coverage_complete: !!photos.coverage_complete } };
}

export function toObservation(place, detail, { keyword = '', location = '' } = {}) {
  const now = new Date().toISOString();
  const sourceId = detail.source_id || place.source_id ||
    `unresolved:${crypto.createHash('sha256').update(place.google_maps_url).digest('hex').slice(0, 32)}`;
  const ok = detail.status === 'ok';
  const images = detail.photos?.images || [];
  const menus = detail.menu?.images || [];
  const number = text => Number((String(text || '').match(/\d[\d.,]*/) || ['0'])[0].replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;
  const reviewCount = Number.isFinite(detail.review_count) ? detail.review_count : number(detail.review_label);
  const rating = Number.isFinite(detail.rating) ? detail.rating : number(detail.rating_label);
  const assets = (rows, category) => rows.map(row => ({ source: 'google_maps_browser', category: row.category || category,
    url: fullImageUrl(row.url), preview_url: row.url,
    checked_at: now, verified_usable: false, rights_confirmed: false, rights_status: 'unknown',
    observed_width: row.width, observed_height: row.height, categories: row.categories || [], label: cap(row.label, 250),
    taken_at: /^\d{4}-\d{2}$/.test(row.taken_at || '') ? row.taken_at : '' }));
  return { schema_version: 'gmaps.place.v1', source: 'google_maps_browser', source_id: sourceId,
    name: cap(detail.name || place.name, 200) || 'Adsız işletme', address: cap(String(detail.address || '').replace(/^Adres:\s*/i, ''), 500),
    phone: cap(String(detail.phone || '').replace(/^(Telefon|Phone):\s*/i, ''), 80), website: cap(detail.website, 1000),
    website_status: detail.website ? 'present' : 'unknown', website_verified: false,
    opening_hours: detail.opening_hours || '', opening_hours_rows: detail.opening_hours_rows || [],
    business_type: detail.business_type || '', latitude: detail.latitude ?? 0, longitude: detail.longitude ?? 0,
    menu_url: detail.menu_url || '', price_level: detail.price_level || '',
    menu_items: detail.menu?.items || [], menu_categories: detail.menu?.categories || [],
    place_id: detail.place_id || '', cid: detail.cid || '',
    data_quality: detail.data_quality || { partial: !ok }, warnings: detail.warnings || [],
    review_count: reviewCount, rating, photo_count: new Set([...images, ...menus].map(row => imageIdentity(row.url)).filter(Boolean)).size,
    photo_count_scope: images.length || menus.length ? 'lower_bound' : 'unknown',
    photo_coverage_complete: false, photo_usability_verified: false, contact_coverage_complete: false,
    menu_status: 'unknown', maps_menu_status: detail.menu?.status === 'found' ?
      (detail.menu?.coverage_complete === false || ['limited_view', 'auth_required', 'blocked'].includes(detail.status) ? 'menu_partial' : 'menu_found') :
      detail.menu?.status === 'not_found' ? 'menu_not_found' : 'unavailable',
    has_opening_hours: !!detail.opening_hours, google_maps_url: detail.google_maps_url || place.google_maps_url,
    source_error: ok ? '' : `MAPS_BROWSER_${String(detail.status || 'unavailable').toUpperCase()}`,
    assets: assets(images, 'general'), menu_assets: assets(menus, 'menu_candidate'),
    evidence: [{ kind: 'maps_browser', url: detail.google_maps_url || place.google_maps_url,
      source_id: sourceId, status: detail.status, checked_at: now,
      menu_categories: detail.menu?.categories || [], menu_candidates: menus.length,
      menu_item_count: detail.menu?.items?.length || 0, expected_menu_images: detail.menu?.expected_images || 0,
      photo_candidates: images.length, data_quality: detail.data_quality || { partial: !ok },
      warnings: detail.warnings || [], opening_hours_rows: detail.opening_hours_rows || [], opening_hours_label: cap(detail.opening_hours, 300) }],
    observed_at: now, scan_keyword: keyword, scan_location: location };
}

export async function scan(browser, { location, keyword = 'restoran', limit = 20, known = [], maxImages = 12, maxMenuImages = 20, maxScrolls = 20 } = {}) {
  const page = await newMapsPage(browser);
  try {
    const found = await searchPlaces(page, { location, keyword, limit, maxScrolls });
    if (!['ok', 'limited_view'].includes(found.status)) return { status: found.status, items: [], skipped_known: 0 };
    if (!Array.isArray(known)) throw new Error('INVALID_SCHEMA');
    const knownIds = new Set(known.filter(item => item?.source === 'google_maps_browser').map(item => item.source_id));
    const items = []; let skipped = 0, incomplete = found.status !== 'ok';
    for (const place of found.places) {
      if (knownIds.has(place.source_id)) { skipped++; continue; }
      try {
        const detail = await readPlace(page, place, { maxImages, maxMenuImages, maxScrolls });
        items.push(toObservation(place, detail, { location, keyword }));
        if (detail.status !== 'ok') incomplete = true;
      } catch {
        items.push(toObservation(place, { status: 'unavailable' }, { location, keyword }));
        incomplete = true;
      }
    }
    return { status: incomplete ? 'incomplete' : 'ok', items, skipped_known: skipped,
      search: { status: found.status, truncated: found.truncated, requested_limit: found.requested_limit } };
  } finally { await page.close(); }
}
