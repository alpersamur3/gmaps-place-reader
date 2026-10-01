#!/usr/bin/env node
// Sign in to Google once on a computer with a screen. The installed Chrome is started as an ordinary window
// (not automated — Google rejects sign-ins in automated browsers) with a private profile; close the window when
// you are done. The profile is then checked headlessly and can be used via MAPS_PROFILE_DIR / userDataDir.
// Servers / SSH: export cookies on a computer and run `gmaps-session import <cookies.json>` instead.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromeExecutable, launchBrowser, checkSession } from '../src/maps.js';

const argv = process.argv.slice(2);
const profileIndex = argv.indexOf('--profile');
const profile = (profileIndex >= 0 ? argv[profileIndex + 1] : process.env.MAPS_PROFILE_DIR) ||
  path.join(os.homedir(), '.gmaps-place-reader', 'profile');
if (!path.isAbsolute(profile)) { process.stderr.write('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE\n'); process.exit(2); }

let chrome;
try { chrome = chromeExecutable(); } catch { process.stderr.write('CHROME_PATH_REQUIRED (set MAPS_CHROME_PATH)\n'); process.exit(2); }
await mkdir(profile, { recursive: true });
const signIn = 'https://accounts.google.com/ServiceLogin?hl=tr&continue=' + encodeURIComponent('https://www.google.com/maps?hl=tr');
process.stdout.write(`Profile: ${profile}\nSign in to Google in the Chrome window that opened, then CLOSE that window.\n`);
const child = spawn(chrome, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', signIn], { stdio: 'ignore' });
const code = await new Promise(resolve => { child.on('exit', resolve); child.on('error', () => resolve(-1)); });
if (code === -1) { process.stderr.write('BROWSER_FAILED\n'); process.exit(2); }
await new Promise(resolve => setTimeout(resolve, 1500)); // let Chrome release the profile lock

let browser;
try {
  browser = await launchBrowser({ userDataDir: profile, env: {} });
  const session = await checkSession(browser);
  process.stdout.write(session === 'signed_in'
    ? `Signed in. Use this profile with MAPS_PROFILE_DIR=${profile}\n`
    : 'Not signed in yet (session: ' + session + '). Run gmaps-login again.\n');
  process.exitCode = session === 'signed_in' ? 0 : 3;
} finally { if (browser) await browser.close(); }
