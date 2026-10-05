#!/usr/bin/env node
// Keeps a persistent, private browser profile healthy — for servers and SSH sessions without a screen.
//   gmaps-session import <cookies.json>   load an exported cookie file into the profile once and verify it
//   gmaps-session check                   signed in? full view? (exit code 0 = full view, 3 = limited); run it
//                                         every hour or so (cron): it keeps session cookies rotated and renews a
//                                         limited anonymous view (--place <url> checks another place)
// Profile: --profile <absolute dir> or MAPS_PROFILE_DIR. The browser keeps the profile's cookies fresh afterwards.
import path from 'node:path';
import { launchBrowser, refreshSession, checkView, VIEW_CHECK_PLACE } from '../src/maps.js';
import { COOKIE_ERROR_CODES } from '../src/cookies.js';

const argv = process.argv.slice(2);
const command = argv[0];
const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const profile = option('--profile') ?? process.env.MAPS_PROFILE_DIR;
const place = option('--place') ?? VIEW_CHECK_PLACE;
const cookiesFile = command === 'import' ? argv[1] : undefined;

const fail = (code, exit = 2) => { process.stdout.write(JSON.stringify({ status: 'error', error_code: code }) + '\n'); process.exit(exit); };
if (!['import', 'check'].includes(command)) fail('USAGE: gmaps-session import <cookies.json> | check  [--profile <absolute dir>] [--place <url>]');
if (!profile || !path.isAbsolute(profile)) fail('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
if (command === 'import' && (!cookiesFile || cookiesFile.startsWith('--'))) fail('MAPS_COOKIES_FILE_REQUIRED');

let browser;
try {
  // env: {} — `check` must never re-import a MAPS_COOKIES_FILE from the environment.
  browser = await launchBrowser({ userDataDir: profile, cookiesFile, env: {} });
  // Signed in: stays until Google has rotated the session cookies, so a periodic check also keeps the profile fresh.
  const { session, rotated } = await refreshSession(browser);
  // The full view is what reading places needs, signed in or not; a limited anonymous view is renewed on the way.
  const { view, renewed } = await checkView(browser, place);
  process.stdout.write(JSON.stringify({ status: 'ok', command, session, rotated, view, renewed, profile,
    cookie_stats: command === 'import' ? browser.mapsCookieStats : undefined }) + '\n');
  process.exitCode = view === 'full' ? 0 : 3;
} catch (error) {
  const known = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL', ...COOKIE_ERROR_CODES];
  fail(known.includes(error?.message) ? error.message : 'BROWSER_FAILED');
} finally { if (browser) await browser.close(); }
