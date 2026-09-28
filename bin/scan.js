#!/usr/bin/env node
// JSON on stdin ({ schema_version: 'gmaps.scan.request.v1', location, keyword, limit, … }) → JSON on stdout.
import { launchBrowser, scan } from '../src/maps.js';
import { COOKIE_ERROR_CODES, cookieOptionsFromArgs } from '../src/cookies.js';

let browser;
try {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    if (chunks.reduce((n, item) => n + item.length, 0) > 1024 * 1024) throw new Error('INPUT_TOO_LARGE');
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.schema_version !== 'gmaps.scan.request.v1') throw new Error('INVALID_SCHEMA');
  const options = cookieOptionsFromArgs();
  options.cookiesFile ??= input.cookiesFile ?? input.cookies_file;
  browser = await launchBrowser(options);
  const result = await scan(browser, input);
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.scan.v1', ...result,
    cookie_stats: browser.mapsCookieStats }));
} catch (error) {
  const code = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'LOCATION_REQUIRED',
    'INVALID_SCHEMA', 'INPUT_TOO_LARGE', ...COOKIE_ERROR_CODES].includes(error?.message) ? error.message : 'BROWSER_FAILED';
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.scan.v1', status: 'unavailable',
    items: [], skipped_known: 0, error_code: code, cookie_stats: error?.stats }));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
}
