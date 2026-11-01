#!/usr/bin/env node
// Sign in to Google once, in a visible Chrome window on the reader's profile (see docs/sign-in.md).
//   gmaps-login [--profile <absolute dir>] [--port <n>] [--timeout <minutes>] [--place <url>]
// With a screen: sign in in the window that opens; it closes by itself when Maps opens. On a server without a
// screen (Linux, xvfb-run installed): the window runs on a virtual display and DevTools listens on 127.0.0.1:<port>;
// reach it from your computer with an SSH tunnel and chrome://inspect. Afterwards the profile is checked headlessly.
// Output: one JSON line; exit code 0 = signed in, 3 = not signed in, 2 = error. Use the profile with MAPS_PROFILE_DIR.
import path from 'node:path';
import { launchBrowser, checkView, VIEW_CHECK_PLACE } from '../src/maps.js';
import { signIn } from '../src/login.js';

const argv = process.argv.slice(2);
const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const valued = ['--profile', '--port', '--timeout', '--place'];
const profile = option('--profile') ?? process.env.MAPS_PROFILE_DIR;
const port = Number(option('--port') ?? 0);
const minutes = Number(option('--timeout') ?? 15);
const place = option('--place') ?? VIEW_CHECK_PLACE;

const fail = (code, exit = 2) => { process.stdout.write(JSON.stringify({ status: 'error', error_code: code }) + '\n'); process.exit(exit); };
const say = text => process.stderr.write(text + '\n');
if (argv.some((argument, index) => argument.startsWith('--') && !valued.includes(argument) ||
  !argument.startsWith('--') && !valued.includes(argv[index - 1]))) fail('USAGE: gmaps-login [--profile <absolute dir>] [--port <n>] [--timeout <minutes>] [--place <url>]');
if (!profile) fail('MAPS_PROFILE_DIR_REQUIRED');
if (!path.isAbsolute(profile)) fail('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
if (!Number.isInteger(port) || port < 0 || port > 65535 || !(minutes > 0 && minutes <= 24 * 60)) fail('INVALID_ARGUMENT');

let browser;
try {
  say(`Profile: ${profile}`);
  const { outcome } = await signIn({ userDataDir: profile, port, timeoutMs: minutes * 60 * 1000, onStatus: ({ port: listening, virtual }) => {
    if (!virtual) {
      say('A Chrome window opened on this computer. Sign in to Google there; the window closes by itself when Maps opens.');
    } else {
      say(`Chrome is running on a virtual display; DevTools listens on 127.0.0.1:${listening}. From a computer with a screen:`);
      say(`  1. ssh -N -L ${listening}:127.0.0.1:${listening} <user>@<this server>`);
      say(`  2. In Chrome open chrome://inspect/#devices, click "Configure…" and add 127.0.0.1:${listening}`);
      say('  3. Under "Remote Target" click "inspect" on the Google page and sign in there.');
    }
    say(`Waiting up to ${minutes} minutes (Ctrl+C closes the window and checks the profile as it is).`);
  } });
  if (outcome === 'not_listening') say('Chrome opened no DevTools port: is another Chrome using this profile?');
  else if (outcome === 'timeout') say('Time is up; the window was closed.');
  say('Checking the profile headlessly…');
  browser = await launchBrowser({ userDataDir: profile });
  const { view, account } = await checkView(browser, place, { repair: false });
  process.stdout.write(JSON.stringify({ status: 'ok', outcome, account, view, profile }) + '\n');
  say(account === 'signed_in' ? `Signed in; the view is ${view}. Use this profile with MAPS_PROFILE_DIR=${profile}` : `Not signed in (${account}); run gmaps-login again.`);
  process.exitCode = account === 'signed_in' ? 0 : 3;
} catch (error) {
  const known = ['CHROME_PATH_REQUIRED', 'MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE', 'INVALID_MAPS_URL', 'DISPLAY_REQUIRED'];
  if (error?.message === 'DISPLAY_REQUIRED') say('No display and no xvfb-run: install the xvfb package (Debian/Ubuntu: apt install xvfb) or run on a computer with a screen.');
  fail(known.includes(error?.message) ? error.message : 'BROWSER_FAILED');
} finally { if (browser) await browser.close(); }
