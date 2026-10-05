#!/usr/bin/env node
// JSON on stdin or --url + options → one detailed Google Maps place record on stdout.
import { launchBrowser, readPlaceUrl, fullImageUrl } from '../src/maps.js';
import { COOKIE_ERROR_CODES, cookieOptionsFromArgs } from '../src/cookies.js';

let browser;
try {
  const argv = process.argv.slice(2);
  const cookieArgs = [], flags = { includeReviews: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = name => {
      const next = argument === name ? argv[++index] : argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : undefined;
      if (!next || next.startsWith('--')) throw new Error('INVALID_ARGUMENT');
      return next;
    };
    if (argument === '--url' || argument.startsWith('--url=')) flags.url = value('--url');
    else if (argument === '--reviews') flags.includeReviews = true;
    else if (argument === '--max-reviews' || argument.startsWith('--max-reviews=')) flags.maxReviews = Number(value('--max-reviews'));
    else if (argument === '--max-review-scrolls' || argument.startsWith('--max-review-scrolls=')) flags.maxReviewScrolls = Number(value('--max-review-scrolls'));
    else if (argument === '--max-images' || argument.startsWith('--max-images=')) flags.maxImages = Number(value('--max-images'));
    else if (argument === '--sort' || argument.startsWith('--sort=')) flags.reviewSort = value('--sort');
    else cookieArgs.push(argument);
  }

  let input;
  if (flags.url) input = { google_maps_url: flags.url };
  else {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
      if (chunks.reduce((n, item) => n + item.length, 0) > 16000) throw new Error('INPUT_TOO_LARGE');
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  if (input.schema_version && !['gmaps.place.request.v1', 'gmaps.place.request.v2'].includes(input.schema_version)) throw new Error('INVALID_SCHEMA');
  const url = input.google_maps_url || input.url;
  if (!url) throw new Error('INVALID_SCHEMA');
  const options = cookieOptionsFromArgs(cookieArgs);
  options.cookiesFile ??= input.cookiesFile ?? input.cookies_file;
  browser = await launchBrowser(options);
  const maxImages = Math.max(1, Math.min(200, Number(flags.maxImages ?? input.max_images) || 8));
  const includeReviews = flags.includeReviews || input.include_reviews === true || input.reviews === true;
  const maxReviews = Math.max(1, Math.min(10000, Number(flags.maxReviews ?? input.max_reviews) || 100));
  const maxReviewScrolls = Math.max(1, Math.min(1000, Number(flags.maxReviewScrolls ?? input.max_review_scrolls) || 25));
  const reviewSort = ['relevant', 'newest', 'highest', 'lowest'].includes(flags.reviewSort ?? input.review_sort)
    ? (flags.reviewSort ?? input.review_sort) : 'relevant';
  const detail = await readPlaceUrl(browser, url, { maxImages, maxMenuImages: maxImages,
    includeReviews, maxReviews, maxReviewScrolls, reviewSort });
  const larger = rows => (rows || []).map(row => ({ ...row, preview_url: row.url, url: fullImageUrl(row.url) }));
  const place = { ...detail,
    menu: detail.menu && { ...detail.menu, images: larger(detail.menu.images) },
    photos: detail.photos && { ...detail.photos, images: larger(detail.photos.images) } };
  const hasMenu = detail.menu?.images?.length > 0;
  const partial = detail.menu?.coverage_complete === false ||
    ['limited_view', 'auth_required', 'blocked'].includes(detail.status) || detail.menu?.status !== 'found';
  const status = hasMenu ? (partial ? 'menu_partial' : 'menu_found') :
    detail.status === 'ok' && detail.menu?.status === 'empty' && detail.menu?.reason === 'NO_MENU_CATEGORY' ? 'menu_not_found' : 'unavailable';
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.place.response.v1', status,
    place, reviews: detail.reviews?.reviews || [],
    menu_assets: larger(detail.menu?.images), assets: larger(detail.photos?.images),
    menu_items: detail.menu?.items || [], menu_categories: detail.menu?.categories || [],
    detail_status: detail.status, menu_status: detail.menu?.status, warnings: detail.warnings,
    source_error: detail.status === 'ok' ? undefined : detail.status, cookie_stats: browser.mapsCookieStats }));
} catch (error) {
  const code = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL',
    'INVALID_SCHEMA', 'INVALID_ARGUMENT', 'INPUT_TOO_LARGE', ...COOKIE_ERROR_CODES].includes(error?.message) ? error.message : 'BROWSER_FAILED';
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.place.response.v1', status: 'unavailable',
    menu_assets: [], assets: [], error_code: code, cookie_stats: error?.stats }));
  process.exitCode = 2;
} finally { if (browser) await browser.close(); }
