#!/usr/bin/env node
// JSON on stdin ({ schema_version: 'gmaps.place.request.v1', google_maps_url, max_images }) → JSON on stdout.
import { launchBrowser, newMapsPage, readPlace, fullImageUrl } from '../src/maps.js';
import { COOKIE_ERROR_CODES, cookieOptionsFromArgs } from '../src/cookies.js';

let browser;
try {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    if (chunks.reduce((n, item) => n + item.length, 0) > 16000) throw new Error('INPUT_TOO_LARGE');
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.schema_version !== 'gmaps.place.request.v1') throw new Error('INVALID_SCHEMA');
  const options = cookieOptionsFromArgs();
  options.cookiesFile ??= input.cookiesFile ?? input.cookies_file;
  browser = await launchBrowser(options);
  const page = await newMapsPage(browser);
  try {
    const detail = await readPlace(page, { google_maps_url: input.google_maps_url },
      { maxImages: Math.max(1, Math.min(200, Number(input.max_images) || 8)),
        maxMenuImages: Math.max(1, Math.min(200, Number(input.max_images) || 8)) });
    const hasMenu = detail.menu?.images?.length > 0;
    const partial = detail.menu?.coverage_complete === false ||
      ['limited_view', 'auth_required', 'blocked'].includes(detail.status) || detail.menu?.status !== 'found';
    const status = hasMenu ? (partial ? 'menu_partial' : 'menu_found') :
      detail.status === 'ok' && detail.menu?.status === 'not_found' ? 'menu_not_found' : 'unavailable';
    const larger = rows => (rows || []).map(row => ({ ...row, preview_url: row.url, url: fullImageUrl(row.url) }));
    process.stdout.write(JSON.stringify({ schema_version: 'gmaps.place.response.v1', status,
      menu_assets: larger(detail.menu?.images), assets: larger(detail.photos?.images),
      menu_items: detail.menu?.items || [], menu_categories: detail.menu?.categories || [],
      detail_status: detail.status, menu_status: detail.menu?.status, warnings: detail.warnings,
      source_error: detail.status === 'ok' ? undefined : detail.status, cookie_stats: browser.mapsCookieStats }));
  } finally { await page.close(); }
} catch (error) {
  const code = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL',
    'INVALID_SCHEMA', 'INPUT_TOO_LARGE', ...COOKIE_ERROR_CODES].includes(error?.message) ? error.message : 'BROWSER_FAILED';
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.place.response.v1', status: 'unavailable',
    menu_assets: [], assets: [], error_code: code, cookie_stats: error?.stats }));
  process.exitCode = 2;
} finally { if (browser) await browser.close(); }
