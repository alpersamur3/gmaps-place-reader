#!/usr/bin/env node
// Reports whether a persistent profile gets Google Maps' full view, and repairs a limited anonymous one (see docs/full-view.md).
//   gmaps-view [--profile <absolute dir>] [--place <url>] [--no-repair]     exit code 0 = full view, 3 = limited, 2 = error
// Profile: --profile or MAPS_PROFILE_DIR. Run it every hour or so (cron): it keeps a signed-in profile fresh and an
// anonymous one in the full view. --no-repair only reports (no temporary profiles are started).
import path from 'node:path';
import { launchBrowser, checkView, VIEW_CHECK_PLACE } from '../src/maps.js';

const argv = process.argv.slice(2);
const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const profile = option('--profile') ?? process.env.MAPS_PROFILE_DIR;
const place = option('--place') ?? VIEW_CHECK_PLACE;
const repair = !argv.includes('--no-repair');

const fail = (code, exit = 2) => { process.stdout.write(JSON.stringify({ status: 'error', error_code: code }) + '\n'); process.exit(exit); };
const valued = ['--profile', '--place'];
if (argv.some((argument, index) => argument.startsWith('--') && ![...valued, '--no-repair'].includes(argument) ||
  !argument.startsWith('--') && !valued.includes(argv[index - 1]))) fail('USAGE: gmaps-view [--profile <absolute dir>] [--place <url>] [--no-repair]');
if (!profile || !path.isAbsolute(profile)) fail('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');

let browser;
try {
  browser = await launchBrowser({ userDataDir: profile });
  const { view, renewed, account } = await checkView(browser, place, { repair });
  process.stdout.write(JSON.stringify({ status: 'ok', view, renewed, account, profile }) + '\n');
  process.exitCode = view === 'full' ? 0 : 3;
} catch (error) {
  const known = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL'];
  fail(known.includes(error?.message) ? error.message : 'BROWSER_FAILED');
} finally { if (browser) await browser.close(); }
