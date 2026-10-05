import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const GOOGLE_DOMAINS = ['google.com', 'google.com.tr'];
export const COOKIE_ERROR_CODES = Object.freeze([
  'MAPS_COOKIES_FILE_REQUIRED', 'MAPS_COOKIES_FILE_UNREADABLE', 'MAPS_COOKIES_FILE_TOO_LARGE',
  'MAPS_COOKIES_INVALID_JSON', 'MAPS_COOKIES_INVALID_FORMAT', 'MAPS_COOKIES_EMPTY',
  'MAPS_COOKIES_REJECTED', 'INVALID_ARGUMENT',
]);

const fail = code => new Error(code);
const isGoogleHost = host => GOOGLE_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const safeUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      isGoogleHost(url.hostname) ? url : null;
  } catch { return null; }
};

function normalizeCookie(raw, nowSeconds) {
  if (!isRecord(raw) || typeof raw.name !== 'string' || !raw.name ||
      /[\x00-\x20\x7f()<>@,;:\\"/\[\]?={}]/.test(raw.name) ||
      typeof raw.value !== 'string' || /[\x00-\x1f\x7f;]/.test(raw.value)) return { reason: 'invalid' };
  if (raw.name.length + raw.value.length > 4096) return { reason: 'invalid' };
  for (const key of ['secure', 'httpOnly', 'hostOnly', 'session']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') return { reason: 'invalid' };
  }
  let domain;
  if (raw.domain !== undefined) {
    if (typeof raw.domain !== 'string') return { reason: 'invalid' };
    domain = raw.domain.toLowerCase();
    if (!/^\.?[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain)) return { reason: 'invalid' };
    if (!isGoogleHost(domain.replace(/^\./, ''))) return { reason: 'foreign' };
  }
  if (raw.url !== undefined) {
    const url = safeUrl(raw.url);
    if (!url) return { reason: 'foreign' };
    const host = domain?.replace(/^\./, '');
    if (host && url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return { reason: 'invalid' };
    domain ||= url.hostname;
  }
  if (!domain) return { reason: 'invalid' };
  if (raw.hostOnly === true) domain = domain.replace(/^\./, '');
  if (raw.hostOnly === false && !domain.startsWith('.')) domain = `.${domain}`;
  const cookiePath = raw.path ?? '/';
  if (typeof cookiePath !== 'string' || !cookiePath.startsWith('/') || /[\x00-\x1f\x7f;]/.test(cookiePath)) {
    return { reason: 'invalid' };
  }
  const cookie = { name: raw.name, value: raw.value, domain, path: cookiePath,
    secure: raw.secure ?? true, httpOnly: raw.httpOnly ?? false };
  if (raw.sameSite !== undefined && raw.sameSite !== null && raw.sameSite !== '') {
    if (typeof raw.sameSite !== 'string') return { reason: 'invalid' };
    const sameSite = { lax: 'Lax', strict: 'Strict', none: 'None', no_restriction: 'None', unspecified: undefined }[
      raw.sameSite.toLowerCase()];
    if (!sameSite && raw.sameSite.toLowerCase() !== 'unspecified') return { reason: 'invalid' };
    if (sameSite) cookie.sameSite = sameSite;
  }
  if (cookie.sameSite === 'None' && !cookie.secure) return { reason: 'invalid' };
  if (/^__Secure-/.test(cookie.name) && !cookie.secure) return { reason: 'invalid' };
  if (/^__Host-/.test(cookie.name) && (!cookie.secure || cookie.path !== '/' || domain.startsWith('.'))) {
    return { reason: 'invalid' };
  }
  const expires = raw.expires ?? raw.expirationDate;
  if (raw.session !== true && expires !== undefined && expires !== null && expires !== -1) {
    if (typeof expires !== 'number' || !Number.isFinite(expires) || expires < 0 || expires > 253402300799) {
      return { reason: 'invalid' };
    }
    if (expires <= nowSeconds) return { reason: 'expired' };
    cookie.expires = expires;
  }
  if (raw.partitionKey !== undefined && raw.partitionKey !== null) {
    const key = raw.partitionKey;
    const origin = safeUrl(typeof key === 'string' ? key : key?.sourceOrigin ?? key?.topLevelSite);
    if (!origin || origin.pathname !== '/' || origin.search || origin.hash) return { reason: 'invalid' };
    if (isRecord(key) && key.hasCrossSiteAncestor !== undefined && typeof key.hasCrossSiteAncestor !== 'boolean') {
      return { reason: 'invalid' };
    }
    cookie.partitionKey = { sourceOrigin: origin.origin,
      ...(isRecord(key) && key.hasCrossSiteAncestor !== undefined ? { hasCrossSiteAncestor: key.hasCrossSiteAncestor } : {}) };
  }
  if (raw.partitionKeyOpaque === true) return { reason: 'invalid' };
  return { cookie };
}

const isQuickManagerRow = row => isRecord(row) && typeof row['Name raw'] === 'string' && 'Host raw' in row;

/**
 * Cookie Quick Manager (Firefox) rows: "Host raw" is a URL such as https://.google.com/, flags are "true"/"false"
 * strings. It exports every cookie store; when private-window stores are present only those are kept, because a
 * private window is where a dedicated session is signed in.
 */
function fromQuickManager(rows) {
  const isPrivate = row => /private/i.test(String(row['Store raw'] || ''));
  const kept = rows.some(isPrivate) ? rows.filter(isPrivate) : rows;
  return kept.map(row => {
    let domain;
    try { domain = new URL(String(row['Host raw'])).hostname; } catch { domain = undefined; }
    const expires = Number(row['Expires raw']);
    return { name: row['Name raw'], value: row['Content raw'], domain, path: row['Path raw'] || '/',
      secure: row['Send for raw'] === 'true', httpOnly: row['HTTP only raw'] === 'true',
      hostOnly: row['This domain only raw'] === 'true', sameSite: row['SameSite raw'] || undefined,
      ...(Number.isFinite(expires) && expires > 0 ? { expirationDate: expires } : { session: true }) };
  });
}

/** Accept Cookie Editor/Puppeteer arrays, Playwright storageState objects and Cookie Quick Manager exports. */
export function normalizeGoogleCookies(input, { nowSeconds = Date.now() / 1000 } = {}) {
  let rows = Array.isArray(input) ? input : isRecord(input) ? input.cookies : undefined;
  if (!Array.isArray(rows)) throw fail('MAPS_COOKIES_INVALID_FORMAT');
  if (rows.some(isQuickManagerRow)) rows = fromQuickManager(rows.filter(isQuickManagerRow));
  const stats = { total: rows.length, accepted: 0, expired: 0, invalid: 0, foreign: 0, duplicates: 0 };
  const unique = new Map();
  for (const raw of rows) {
    const { cookie, reason } = normalizeCookie(raw, nowSeconds);
    if (!cookie) { stats[reason]++; continue; }
    const key = JSON.stringify([cookie.domain, cookie.path, cookie.name, cookie.partitionKey ?? null]);
    if (unique.has(key)) stats.duplicates++;
    unique.set(key, cookie);
  }
  const cookies = [...unique.values()];
  stats.accepted = cookies.length;
  return { cookies, stats };
}

/** All errors deliberately omit paths, file contents, cookie names and values. */
export async function loadGoogleCookies({ cookiesFile, env = process.env, cwd = process.cwd(), nowSeconds } = {}) {
  const configuredPath = cookiesFile ?? env.MAPS_COOKIES_FILE;
  if (configuredPath === undefined || configuredPath === null) {
    return { ...normalizeGoogleCookies([], { nowSeconds }), configured: false };
  }
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) throw fail('MAPS_COOKIES_FILE_REQUIRED');
  const filename = path.resolve(cwd, configuredPath);
  let content;
  try {
    const info = await stat(filename);
    if (!info.isFile()) throw fail('MAPS_COOKIES_FILE_UNREADABLE');
    if (info.size > MAX_FILE_BYTES) throw fail('MAPS_COOKIES_FILE_TOO_LARGE');
    content = await readFile(filename, 'utf8');
  } catch (error) {
    throw fail(COOKIE_ERROR_CODES.includes(error?.message) ? error.message : 'MAPS_COOKIES_FILE_UNREADABLE');
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw fail('MAPS_COOKIES_FILE_TOO_LARGE');
  let parsed;
  try { parsed = JSON.parse(content.replace(/^\uFEFF/, '')); }
  catch { throw fail('MAPS_COOKIES_INVALID_JSON'); }
  const result = normalizeGoogleCookies(parsed, { nowSeconds });
  if (!result.cookies.length) {
    const error = fail('MAPS_COOKIES_EMPTY');
    error.stats = result.stats;
    throw error;
  }
  return { ...result, configured: true };
}

/** Import before opening Maps; one rejected cookie cannot discard valid cookies. */
export async function applyBrowserCookies(browser, loaded) {
  const stats = { ...loaded.stats, configured: loaded.configured, applied: 0, rejected: 0 };
  if (!loaded.configured) return stats;
  const context = browser.defaultBrowserContext();
  for (const cookie of loaded.cookies) {
    try { await context.setCookie(cookie); stats.applied++; }
    catch { stats.rejected++; }
  }
  if (!stats.applied) {
    const error = fail('MAPS_COOKIES_REJECTED');
    error.stats = stats;
    throw error;
  }
  return stats;
}

export function cookieOptionsFromArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--cookies-file' || argument.startsWith('--cookies-file=')) {
      if (options.cookiesFile !== undefined) throw fail('INVALID_ARGUMENT');
      const value = argument === '--cookies-file' ? argv[++index] : argument.slice('--cookies-file='.length);
      if (!value || value.startsWith('--')) throw fail('MAPS_COOKIES_FILE_REQUIRED');
      options.cookiesFile = value;
    } else throw fail('INVALID_ARGUMENT');
  }
  return options;
}
