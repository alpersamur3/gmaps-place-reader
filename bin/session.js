#!/usr/bin/env node
// Keeps a Google session in a persistent, private profile — for servers and SSH sessions without a screen.
//   gmaps-session import <cookies.json>   load an exported cookie file into the profile once and verify it
//   gmaps-session check                   is the profile still signed in? (exit code 0 = yes, 3 = no); run it
//                                         every hour or so (cron) to keep the session's cookies rotated
// Profile: --profile <absolute dir> or MAPS_PROFILE_DIR. The browser keeps the session's cookies fresh afterwards.
import path from 'node:path';
import { launchBrowser, refreshSession } from '../src/maps.js';
import { COOKIE_ERROR_CODES } from '../src/cookies.js';

const argv = process.argv.slice(2);
const command = argv[0];
const profileIndex = argv.indexOf('--profile');
const profile = profileIndex >= 0 ? argv[profileIndex + 1] : process.env.MAPS_PROFILE_DIR;
const cookiesFile = command === 'import' ? argv[1] : undefined;

const fail = (code, exit = 2) => { process.stdout.write(JSON.stringify({ status: 'error', error_code: code }) + '\n'); process.exit(exit); };
if (!['import', 'check'].includes(command)) fail('USAGE: gmaps-session import <cookies.json> | check  [--profile <absolute dir>]');
if (!profile || !path.isAbsolute(profile)) fail('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
if (command === 'import' && (!cookiesFile || cookiesFile.startsWith('--'))) fail('MAPS_COOKIES_FILE_REQUIRED');

let browser;
try {
  // env: {} — `check` must never re-import a MAPS_COOKIES_FILE from the environment.
  browser = await launchBrowser({ userDataDir: profile, cookiesFile, env: {} });
  // Signed in: stays until Google has rotated the session cookies, so a periodic check also keeps the profile fresh.
  const { session, rotated } = await refreshSession(browser);
  process.stdout.write(JSON.stringify({ status: 'ok', command, session, rotated, profile,
    cookie_stats: command === 'import' ? browser.mapsCookieStats : undefined }) + '\n');
  process.exitCode = session === 'signed_in' ? 0 : 3;
} catch (error) {
  const known = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', ...COOKIE_ERROR_CODES];
  fail(known.includes(error?.message) ? error.message : 'BROWSER_FAILED');
} finally { if (browser) await browser.close(); }
