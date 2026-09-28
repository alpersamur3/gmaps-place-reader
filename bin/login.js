#!/usr/bin/env node
// Opens a visible browser with a private profile (MAPS_PROFILE_DIR) so you can sign in to Google once.
import { launchBrowser, newMapsPage } from '../src/maps.js';
import { COOKIE_ERROR_CODES, cookieOptionsFromArgs } from '../src/cookies.js';
import readline from 'node:readline/promises';

if (!process.env.MAPS_PROFILE_DIR) {
  process.stderr.write('Set MAPS_PROFILE_DIR to a private absolute directory first.\n');
  process.exit(2);
}
let browser;
try {
  browser = await launchBrowser({ ...cookieOptionsFromArgs(), headless: false });
  const page = await newMapsPage(browser);
  await page.goto('https://www.google.com/maps/');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { await rl.question('Sign in to Google Maps in this separate browser profile, then press Enter. '); }
  finally { rl.close(); }
} catch (error) {
  const code = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE',
    ...COOKIE_ERROR_CODES].includes(error?.message) ? error.message : 'BROWSER_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 2;
} finally { if (browser) await browser.close(); }
