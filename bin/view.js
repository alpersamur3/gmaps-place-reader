#!/usr/bin/env node
// Reports whether a persistent profile gets Google Maps' full view, and repairs a limited one (see docs/full-view.md).
//   gmaps-view [--profile <absolute dir>] [--place <url>]     exit code 0 = full view, 3 = limited, 2 = error
// Profile: --profile or MAPS_PROFILE_DIR. Run it every hour or so (cron) to keep the profile in the full view.
import path from 'node:path';
import { launchBrowser, checkView, VIEW_CHECK_PLACE } from '../src/maps.js';

const argv = process.argv.slice(2);
const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const profile = option('--profile') ?? process.env.MAPS_PROFILE_DIR;
const place = option('--place') ?? VIEW_CHECK_PLACE;

const fail = (code, exit = 2) => { process.stdout.write(JSON.stringify({ status: 'error', error_code: code }) + '\n'); process.exit(exit); };
if (argv.some((argument, index) => argument.startsWith('--') && !['--profile', '--place'].includes(argument) ||
  !argument.startsWith('--') && !['--profile', '--place'].includes(argv[index - 1]))) fail('USAGE: gmaps-view [--profile <absolute dir>] [--place <url>]');
if (!profile || !path.isAbsolute(profile)) fail('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');

let browser;
try {
  browser = await launchBrowser({ userDataDir: profile });
  const { view, renewed } = await checkView(browser, place);
  process.stdout.write(JSON.stringify({ status: 'ok', view, renewed, profile }) + '\n');
  process.exitCode = view === 'full' ? 0 : 3;
} catch (error) {
  const known = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL'];
  fail(known.includes(error?.message) ? error.message : 'BROWSER_FAILED');
} finally { if (browser) await browser.close(); }
