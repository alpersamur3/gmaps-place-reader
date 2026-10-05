import puppeteer from 'puppeteer-core';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadGoogleCookies, applyBrowserCookies } from './cookies.js';
import { extractPlaceDetails, extractAboutDetails, pageStatus } from './details.js';
import { readReviews, reviewsPageUrl } from './reviews.js';
import { imageUrl, fullImageUrl, imageIdentity, readMenu, readMenuPhotos, readPhotos, viewerPhoto, photoMonth } from './media.js';
export { pageStatus, imageUrl, fullImageUrl, readMenu, readMenuPhotos, readPhotos, readReviews, reviewsPageUrl, viewerPhoto, photoMonth };
export { parseRelativeAge, estimateReviewDate } from './reviews.js';

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

const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/**
 * Accepts Maps place/search links and ?cid= links on any Google country domain (google.com.tr, maps.google.de …).
 * The host is normalised to www.google.com: Google session cookies are set for .google.com only.
 */
function safeMapsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !GOOGLE_HOST.test(url.hostname)) return '';
    const cidLink = (url.pathname === '/maps' || url.pathname === '/') && /^\d{5,25}$/.test(url.searchParams.get('cid') || '');
    if (!url.pathname.startsWith('/maps/') && !cidLink) return '';
    url.hostname = 'www.google.com';
    if (url.pathname === '/') url.pathname = '/maps';
    return withMapsLanguage(url.toString());
  } catch { return ''; }
}

/**
 * The reader matches Maps' Turkish UI texts, so every Maps URL carries hl=tr: the page language then no longer
 * depends on the server locale or the signed-in account's language.
 */
export function withMapsLanguage(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'www.google.com' || !url.pathname.startsWith('/maps')) return value;
    url.searchParams.set('hl', 'tr');
    return url.toString();
  } catch { return value; }
}

/** Normalised Maps link for readPlace/readPlaceUrl, or '' when the link is not a Google Maps place link. */
export function normalizePlaceUrl(value) {
  const direct = safeMapsUrl(value);
  if (direct) return direct;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    if (url.hostname === 'maps.app.goo.gl' || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/'))) return url.toString();
  } catch { /* Invalid or unsupported Maps URL. */ }
  return '';
}

/** Chrome/Chromium binary: option, MAPS_CHROME_PATH, or the default Windows install location. */
export function chromeExecutable(options = {}) {
  const executablePath = options.executablePath || process.env.MAPS_CHROME_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  if (!executablePath) throw new Error('CHROME_PATH_REQUIRED');
  return executablePath;
}

const startChrome = (executablePath, userDataDir, headless = true) => puppeteer.launch({ executablePath, headless,
  args: ['--lang=tr-TR', '--no-first-run', '--disable-extensions'],
  defaultViewport: { width: 1365, height: 900 }, userDataDir, timeout: 20000 });

export async function launchBrowser(options = {}) {
  const executablePath = chromeExecutable(options);
  const userDataDir = options.userDataDir || process.env.MAPS_PROFILE_DIR;
  if (userDataDir && !path.isAbsolute(userDataDir)) throw new Error('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
  const loaded = await loadGoogleCookies(options);
  const browser = await startChrome(executablePath, userDataDir, options.headless ?? true);
  try {
    browser.mapsExecutablePath = executablePath;
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

const PANEL_READY = `(() => {
  const heading = [...document.querySelectorAll('h1')].find(el => el.getClientRects().length && el.innerText.trim() &&
    !/^google maps$|^google haritalar$/i.test(el.innerText.trim()));
  return !!heading && !!document.querySelector('[data-item-id]');
})()`;
const ACCESS_PAGE = `(location.hostname === 'accounts.google.com' || location.hostname.startsWith('consent.google.') ||
  location.pathname.startsWith('/sorry/'))`;

// The place's main tab list is the one with About; the Menu tab has its own "Overview" sub-tab list.
const MAIN_OVERVIEW_TAB = `(() => {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const tablist = [...document.querySelectorAll('[role="tablist"]')].find(list => list.getClientRects().length &&
    [...list.querySelectorAll('[role="tab"]')].some(item => /^(?:hakkinda|about)$/.test(normalize(item.textContent))));
  return [...(tablist?.querySelectorAll('[role="tab"]') || [])].find(item => /^(?:genel bakis|overview)$/.test(normalize(item.textContent))) || null;
})()`;

/** Links copied on the Menu or Reviews tab open that tab; the business details live on Overview. */
async function showOverview(page) {
  // The first tabs can render before the main tab list does: wait for the panel or the main Overview tab.
  await page.waitForFunction(`${PANEL_READY} || !!${MAIN_OVERVIEW_TAB}`, { timeout: 8000 }).catch(() => {});
  // The tab is drawn before Maps wires its click handler, so an early click can be lost: retry until it switches.
  let clicked = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await page.evaluate(`(() => {
      if (${PANEL_READY}) return 'ready';
      const tab = ${MAIN_OVERVIEW_TAB};
      if (!tab) return 'none';
      if (tab.getAttribute('aria-selected') === 'true') return 'selected';
      tab.click();
      return 'clicked';
    })()`).catch(() => 'none');
    if (state === 'ready' || state === 'none') break;
    if (state === 'clicked') clicked = true;
    await page.waitForFunction(PANEL_READY, { timeout: 2500 }).catch(() => {});
  }
  return clicked;
}

async function navigatePlace(page, target) {
  for (let load = 0; load < 2; load++) {
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
    // Share links (maps.app.goo.gl) redirect to a URL without hl=tr: reload it in Turkish.
    const turkish = withMapsLanguage(page.url());
    if (turkish !== page.url() && /^https:\/\/www\.google\.com\/maps/.test(turkish)) {
      await page.goto(turkish, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    target = turkish.startsWith('https://www.google.com/maps') ? turkish : target;
    await page.waitForFunction(`${PANEL_READY} || ${ACCESS_PAGE} || !!document.querySelector('[role="tab"]')`,
      { timeout: 15000 }).catch(() => {});
    await showOverview(page);
    // The place panel sometimes never renders on the first load; one fresh load usually fixes it.
    if (await page.evaluate(`${PANEL_READY} || ${ACCESS_PAGE}`).catch(() => false)) break;
  }
  await sleep(500);
}

/**
 * Google serves the limited or the full anonymous view by the browser's __Secure-ENID cookie. Each ENID is issued
 * in one class and keeps it (about 13 months), and a profile receives new ENIDs of the same class, so a limited
 * profile cannot fix itself by dropping the cookie. A full-view ENID works in any profile on the same platform
 * (it is tied to the user agent's operating system, not to the IP address). In the EU consent region Google issues
 * an ENID with the first Maps response; elsewhere usually none, and only a session gives the full view.
 * Next step for a limited page: 'reload' (a just-issued ENID only works from the next request on), 'renew' (bring
 * in a full-view ENID from a fresh temporary profile) or 'stop'.
 */
export function nextViewStep({ status, signedIn = false, reloaded = false, renewals = 0, maxRenewals = 1, sticky = false }) {
  if (status !== 'limited_view' || signedIn || sticky) return 'stop';
  if (!reloaded) return 'reload';
  return renewals < maxRenewals ? 'renew' : 'stop';
}

async function googleCookie(page, name) {
  const client = await page.createCDPSession();
  try {
    const { cookies } = await client.send('Network.getCookies', { urls: ['https://www.google.com/maps'] });
    return cookies.find(cookie => cookie.name === name) || null;
  } finally { await client.detach().catch(() => {}); }
}

/**
 * A full-view __Secure-ENID from a fresh temporary profile: each new profile gets its class by chance (about two in
 * three were full in tests), so up to `attempts` profiles are tried. null when Google issues no ENID at all here.
 */
export async function mintFullViewCookie(executablePath, { attempts = 4, place = VIEW_CHECK_PLACE } = {}) {
  const target = normalizePlaceUrl(place);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gmaps-view-'));
    let browser;
    try {
      browser = await startChrome(executablePath, dir);
      const page = await newMapsPage(browser);
      await navigatePlace(page, target);
      const enid = await googleCookie(page, '__Secure-ENID');
      if (!enid) return null;
      if (await pageStatus(page) !== 'ok') await navigatePlace(page, target);
      if (await pageStatus(page) === 'ok') {
        const { name, value, domain, path: cookiePath, expires, httpOnly, secure, sameSite } = await googleCookie(page, '__Secure-ENID') || enid;
        return { name, value, domain, path: cookiePath, httpOnly, secure, ...(expires > 0 ? { expires } : {}), ...(sameSite ? { sameSite } : {}) };
      }
    } catch { /* try another profile */ } finally {
      await browser?.close().catch(() => {});
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return null;
}

/**
 * Turns a limited anonymous view into the full one (see nextViewStep). Renewals are counted per browser, and a
 * browser that cannot leave the limited view stops trying, so later places do not pay for extra loads.
 * Returns { status, renewed }.
 */
async function recoverFullView(page, target, status) {
  const browser = page.browser();
  const state = browser.mapsView ||= { renewals: 0, sticky: false };
  let reloaded = false, renewed = 0;
  for (;;) {
    const step = nextViewStep({ status, signedIn: await sessionState(page) === 'signed_in', reloaded,
      renewals: state.renewals, sticky: state.sticky });
    if (step === 'stop') break;
    if (step === 'renew') {
      state.renewals++;
      let cookie = null;
      try { cookie = await mintFullViewCookie(browser.mapsExecutablePath || chromeExecutable()); } catch { cookie = null; }
      if (!cookie) break;
      await browser.defaultBrowserContext().setCookie(cookie);
      renewed++;
    }
    reloaded = true;
    await navigatePlace(page, target);
    status = await pageStatus(page);
  }
  if (status === 'limited_view') state.sticky = true;
  return { status, renewed };
}

/** A well-known place whose page shows Google's limited-view notice when the browser only gets that view. */
export const VIEW_CHECK_PLACE = 'https://www.google.com/maps?cid=10222232094831998944';

/**
 * Opens one place and reports whether this browser gets the full view: { view: 'full' | 'limited' | <status>,
 * renewed }. A limited ENID is renewed on the way (see recoverFullView), so a periodic check also repairs it.
 */
export async function checkView(browser, url = VIEW_CHECK_PLACE) {
  const target = normalizePlaceUrl(url);
  if (!target) throw new Error('INVALID_MAPS_URL');
  const page = await newMapsPage(browser);
  try {
    await navigatePlace(page, target);
    let status = await pageStatus(page), renewed = 0;
    if (status === 'limited_view') ({ status, renewed } = await recoverFullView(page, target, status));
    return { view: status === 'ok' ? 'full' : status === 'limited_view' ? 'limited' : status, renewed };
  } finally { await page.close(); }
}

/** Opens Maps once and reports whether Google treats this browser (profile) as signed in. */
export async function checkSession(browser, options) {
  return (await refreshSession(browser, options)).session;
}

/**
 * Opens Maps once: { session, rotated }. A signed-in Maps page asks accounts.google.com to rotate the session
 * cookies once they are due (POST /RotateCookies, observed 8 to 45 seconds after loading); staying until that
 * request completes stores the fresh cookies in the profile. An idle profile that never rotates them is signed out
 * within hours. rotated: false only means no rotation was due during the wait.
 */
export async function refreshSession(browser, { rotationWaitMs = 60000 } = {}) {
  const page = await newMapsPage(browser);
  let rotated = false;
  const onResponse = response => {
    if (/^https:\/\/accounts\.google\.com\/RotateCookies(?:[?#]|$)/.test(response.url()) && response.ok()) rotated = true;
  };
  page.on('response', onResponse);
  try {
    await page.goto('https://www.google.com/maps?hl=tr', { waitUntil: 'domcontentloaded' });
    await passConsent(page);
    await page.waitForFunction(() => [...document.querySelectorAll('a, button')].some(el =>
      /^(?:google hesabı|google account)/i.test(el.getAttribute('aria-label') || '') || /^(?:oturum açın|sign in)$/i.test((el.innerText || '').trim())),
      { timeout: 15000 }).catch(() => {});
    await sleep(3000);
    const session = await sessionState(page);
    if (session === 'signed_in') {
      const deadline = Date.now() + Math.max(0, Number(rotationWaitMs) || 0);
      while (!rotated && Date.now() < deadline) await sleep(500);
    }
    return { session, rotated };
  } finally {
    page.off('response', onResponse);
    await page.close();
  }
}

/** Whether Google shows this browser session as signed in (account button) or signed out. */
export async function sessionState(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('a[aria-label], button[aria-label]')].map(el => el.getAttribute('aria-label') || '');
    if (labels.some(label => /^(?:google hesabı|google account)/i.test(label))) return 'signed_in';
    if ([...document.querySelectorAll('a, button')].some(el => /^(?:oturum açın|oturum aç|sign in)$/i.test((el.innerText || '').trim()))) return 'signed_out';
    return 'unknown';
  }).catch(() => 'unknown');
}

export async function readPlace(page, place, { maxImages = 12, maxMenuImages = 20, maxScrolls = 20,
  includeReviews = false, maxReviews = 100, maxReviewScrolls = 25, reviewSort = 'relevant', recoverView = true, onProgress } = {}) {
  const target = normalizePlaceUrl(place?.google_maps_url || place?.url);
  if (!target) throw new Error('INVALID_MAPS_URL');
  await navigatePlace(page, target);
  let status = await pageStatus(page);
  if (status === 'limited_view' && recoverView) ({ status } = await recoverFullView(page, target, status));
  const canonical = safeMapsUrl(page.url()) || target;
  const session = await sessionState(page);
  const identity = placeIdentity(canonical) || placeIdentity(target);
  if (!['ok', 'limited_view'].includes(status)) return { status, session, source_id: identity, google_maps_url: canonical };
  const details = await extractPlaceDetails(page);
  if (details.data_status !== 'ok') return { status: 'unavailable', session, source_id: identity, google_maps_url: canonical };
  try {
    const about = await extractAboutDetails(page);
    details.description ||= about.description;
    details.attributes = about.attributes || [];
    details.about_status = about.status;
    details.about_coverage_complete = !about.truncated;
  } catch { details.attributes = []; details.about_status = 'unavailable'; }
  if (onProgress) await onProgress({ stage:'overview', status }, page);
  const warnings = [];
  if (status !== 'ok') warnings.push(status.toUpperCase());
  // Cookies were loaded but Google does not treat the session as signed in (expired or device-bound cookies).
  if (session === 'signed_out' && page.browser?.()?.mapsCookieStats?.configured) warnings.push('COOKIES_NOT_SIGNED_IN');
  let menu, photos, reviews;
  try { menu = await readMenu(page, { maxImages: maxMenuImages, maxScrolls, overviewUrl: canonical, onProgress }); }
  catch { menu = { status: 'unavailable', images: [], categories: [], coverage_complete: false }; warnings.push('MENU_READ_FAILED'); }
  // A limited view shows only part of the menu album (often a single photo), so it is never complete.
  if (status !== 'ok') menu.coverage_complete = false;
  try { photos = await readPhotos(page, { maxImages, maxScrolls, overviewUrl: canonical, exclude: (menu.images || []).map(row => row.url) }); }
  catch { photos = { status: 'unavailable', images: [], coverage_complete: false }; warnings.push('PHOTOS_READ_FAILED'); }
  if (includeReviews) {
    try { reviews = await readReviews(page, { overviewUrl: canonical, reviewCount: details.review_count,
      maxReviews, maxScrolls: maxReviewScrolls, sort: reviewSort, onProgress }); }
    catch { reviews = { status: 'unavailable', reviews: [], total_count: details.review_count || 0,
      collected_count: 0, truncated: true, coverage_complete: false, reason: 'REVIEW_READ_FAILED' }; }
  }
  const menuUrls = new Set(menu.images.map(row => imageIdentity(row.url)));
  photos.images = photos.images.filter(row => !menuUrls.has(imageIdentity(row.url)));
  if (menu.status === 'unavailable') warnings.push(menu.reason || 'MENU_UNAVAILABLE');
  // A gallery with categories but no Menu category means the place has no menu photos, not a read failure.
  if (menu.status === 'empty' && menu.reason !== 'NO_MENU_CATEGORY') warnings.push('MENU_IMAGES_NOT_LOADED');
  // Menu items were read but the menu photo album could not be opened.
  if (menu.status === 'found' && !menu.images?.length && menu.reason && menu.reason !== 'NO_MENU_CATEGORY') warnings.push('MENU_PHOTOS_UNAVAILABLE');
  if (photos.status === 'unavailable') warnings.push('PHOTOS_UNAVAILABLE');
  // A rating means the place has reviews even when a limited view hides their count.
  if (includeReviews && (reviews.status === 'unavailable' || (reviews.status === 'empty' && (details.review_count > 0 || details.rating > 0)))) warnings.push('REVIEWS_UNAVAILABLE');
  if (includeReviews && reviews.status === 'found' && reviews.sort_applied === false) warnings.push('REVIEW_SORT_NOT_APPLIED');
  if (reviews?.truncated) warnings.push('REVIEWS_LIMIT_OR_SCROLL_LIMIT');
  if (menu.truncated) warnings.push('MENU_IMAGE_LIMIT_OR_SCROLL_LIMIT');
  if (photos.truncated) warnings.push('PHOTO_IMAGE_LIMIT_OR_SCROLL_LIMIT');
  // Hitting our own image limits is not a source failure; the warnings still record it.
  const finalStatus = status !== 'ok' ? status : warnings.some(code => !code.endsWith('_LIMIT_OR_SCROLL_LIMIT')) ? 'incomplete' : 'ok';
  return { status: finalStatus, session, source_id: identity, google_maps_url: canonical, ...details, menu, photos,
    ...(includeReviews ? { reviews } : {}),
    warnings: [...new Set(warnings)], data_quality: { partial: finalStatus !== 'ok',
      review_count_observed: !!details.review_label, menu_coverage_complete: !!menu.coverage_complete,
      review_coverage_complete: !!reviews?.coverage_complete,
      about_coverage_complete: !!details.about_coverage_complete,
      opening_hours_coverage_complete: details.opening_hours_rows?.length === 7,
      photo_coverage_complete: !!photos.coverage_complete } };
}

/** Open and read one Maps URL without requiring callers to create or close a page. */
export async function readPlaceUrl(browser, url, options = {}) {
  const page = await newMapsPage(browser);
  try { return await readPlace(page, { google_maps_url: url }, options); }
  finally { await page.close(); }
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
    name: cap(detail.name || place.name, 200) || 'Adsız işletme', description: cap(detail.description, 5000),
    attributes: detail.attributes || [], address: cap(String(detail.address || '').replace(/^Adres:\s*/i, ''), 500),
    phone: cap(String(detail.phone || '').replace(/^(Telefon|Phone):\s*/i, ''), 80), website: cap(detail.website, 1000),
    website_status: detail.website ? 'present' : 'unknown', website_verified: false,
    opening_hours: detail.opening_hours || '', opening_hours_rows: detail.opening_hours_rows || [],
    business_type: detail.business_type || '', latitude: detail.latitude ?? 0, longitude: detail.longitude ?? 0,
    menu_url: detail.menu_url || '', price_level: detail.price_level || '',
    menu_items: detail.menu?.items || [], menu_categories: detail.menu?.categories || [],
    reviews: detail.reviews?.reviews || [], review_coverage_complete: !!detail.reviews?.coverage_complete,
    place_id: detail.place_id || '', cid: detail.cid || '',
    data_quality: detail.data_quality || { partial: !ok }, warnings: detail.warnings || [],
    review_count: reviewCount, rating, photo_count: new Set([...images, ...menus].map(row => imageIdentity(row.url)).filter(Boolean)).size,
    photo_count_scope: images.length || menus.length ? 'lower_bound' : 'unknown',
    photo_coverage_complete: false, photo_usability_verified: false, contact_coverage_complete: false,
    menu_status: 'unknown', maps_menu_status: detail.menu?.status === 'found' ?
      (detail.menu?.coverage_complete === false || ['limited_view', 'auth_required', 'blocked'].includes(detail.status) ? 'menu_partial' : 'menu_found') :
      detail.menu?.status === 'empty' && detail.menu?.reason === 'NO_MENU_CATEGORY' ? 'menu_not_found' : 'unavailable',
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

export async function scan(browser, { location, keyword = 'restoran', limit = 20, known = [], maxImages = 12,
  maxMenuImages = 20, maxScrolls = 20, includeReviews = false, maxReviews = 100, maxReviewScrolls = 25, reviewSort = 'relevant' } = {}) {
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
        const detail = await readPlace(page, place, { maxImages, maxMenuImages, maxScrolls, includeReviews, maxReviews, maxReviewScrolls, reviewSort });
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
