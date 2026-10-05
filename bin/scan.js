#!/usr/bin/env node
// JSON on stdin ({ schema_version: 'gmaps.scan.request.v1', location, keyword, limit, … }) → JSON on stdout.
import { launchBrowser, scan } from '../src/maps.js';

let browser;
try {
  if (process.argv.length > 2) throw new Error('INVALID_ARGUMENT');
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    if (chunks.reduce((n, item) => n + item.length, 0) > 1024 * 1024) throw new Error('INPUT_TOO_LARGE');
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.schema_version !== 'gmaps.scan.request.v1') throw new Error('INVALID_SCHEMA');
  browser = await launchBrowser();
  const result = await scan(browser, input);
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.scan.v1', ...result }));
} catch (error) {
  const code = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'LOCATION_REQUIRED',
    'INVALID_SCHEMA', 'INVALID_ARGUMENT', 'INPUT_TOO_LARGE'].includes(error?.message) ? error.message : 'BROWSER_FAILED';
  process.stdout.write(JSON.stringify({ schema_version: 'gmaps.scan.v1', status: 'unavailable',
    items: [], skipped_known: 0, error_code: code }));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
}
