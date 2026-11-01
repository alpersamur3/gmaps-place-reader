// Sign in to Google once, in a visible Chrome window that uses the reader's profile (`gmaps-login`, see
// docs/sign-in.md). Chrome is started as an ordinary window, without automation flags: Google refuses sign-ins in
// automated browsers. Its DevTools port on 127.0.0.1 tells this module when Maps has opened after the sign-in, and
// on a server it lets you drive the window from your own computer through an SSH tunnel and chrome://inspect.
// The module never reads the pages or the cookies; it only looks at the list of open tab URLs.
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { chromeExecutable } from './maps.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Google's sign-in page, returning to Maps afterwards. */
export const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?hl=tr&continue=' + encodeURIComponent('https://www.google.com/maps?hl=tr');

/**
 * Chrome arguments for the sign-in window: a plain window on the reader's profile with DevTools on the loopback
 * interface only (port 0 = any free port; Chrome writes the port to <profile>/DevToolsActivePort). The cookie store
 * is pinned to the one puppeteer uses later (basic store / mock keychain), so the headless reader can decrypt the
 * cookies the window saves.
 */
export function signInChromeArgs({ userDataDir, port = 0, url = SIGN_IN_URL, platform = process.platform }) {
  return [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--lang=tr-TR', '--window-size=1365,900',
    ...(platform === 'linux' ? ['--password-store=basic', '--disable-dev-shm-usage'] : []),
    ...(platform === 'darwin' ? ['--use-mock-keychain'] : []), url];
}

const exists = async file => { try { await access(file, constants.X_OK); return true; } catch { return false; } };

// Only Linux PATHs are searched (for xvfb-run), so POSIX separators apply whatever this process runs on.
async function findOnPath(name, envPath = '', pathExists = exists) {
  for (const dir of String(envPath).split(':').filter(Boolean)) {
    const candidate = path.posix.join(dir, name);
    if (await pathExists(candidate)) return candidate;
  }
  return '';
}

/**
 * On Linux without a display (servers, SSH) the window needs a virtual one: `xvfb-run` from the `xvfb` package.
 * Returns { command, args, virtual }; throws DISPLAY_REQUIRED when neither a display nor xvfb-run is available.
 */
export async function virtualDisplayCommand(executablePath, args, { platform = process.platform, env = process.env, pathExists = exists } = {}) {
  if (platform !== 'linux' || env.DISPLAY || env.WAYLAND_DISPLAY) return { command: executablePath, args, virtual: false };
  const xvfb = await findOnPath('xvfb-run', env.PATH, pathExists);
  if (!xvfb) throw new Error('DISPLAY_REQUIRED');
  return { command: xvfb, args: ['-a', '-s', '-screen 0 1365x900x24', executablePath, ...args], virtual: true };
}

/** The port from Chrome's DevToolsActivePort file ("9222\n/devtools/browser/…"), or 0. */
export function parseDevToolsActivePort(content) {
  const port = Number(String(content || '').split(/\r?\n/)[0].trim());
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 0;
}

/**
 * The sign-in is finished when a Maps page is open and no accounts.google.com page is left (Google may show
 * account interstitials after the password; the consent page before Maps keeps the wait going as well).
 */
export function signInFinished(targets) {
  const pages = (Array.isArray(targets) ? targets : []).filter(target => target?.type === 'page').map(target => String(target.url || ''));
  const pending = pages.some(url => /^https:\/\/accounts\.google\.[a-z.]+\//i.test(url));
  const maps = pages.some(url => /^https:\/\/www\.google\.[a-z.]+\/maps(?:[/?#]|$)/i.test(url));
  return maps && !pending;
}

const devtools = (port, route, init) => fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(5000), ...init });

async function listTargets(port) {
  try {
    const response = await devtools(port, '/json/list');
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Closes every tab through DevTools; Chrome exits with its last window. */
async function closeTargets(port) {
  const targets = await listTargets(port);
  for (const target of (targets || []).filter(target => target?.type === 'page')) {
    // Chrome accepts PUT for its command endpoints; older builds only answered GET.
    const closed = await devtools(port, `/json/close/${target.id}`, { method: 'PUT' }).then(response => response.ok).catch(() => false);
    if (!closed) await devtools(port, `/json/close/${target.id}`).catch(() => {});
  }
}

/**
 * Opens the sign-in window and waits until Maps opens after the sign-in, the window is closed, or `timeoutMs`
 * passes; then closes Chrome cleanly so the profile keeps the session. Resolves { outcome, port, virtual }:
 * outcome 'signed_in_page' (Maps opened), 'closed' (window closed first), 'timeout', or 'not_listening' (Chrome
 * opened no DevTools port, usually because another Chrome holds the profile). onStatus(event) reports
 * { stage: 'listening', port, virtual } once the port is known. `spawnChrome(command, args)` is for tests.
 */
export async function signIn({ userDataDir, executablePath, port = 0, timeoutMs = 15 * 60 * 1000, settleMs = 4000,
  pollMs = 2000, onStatus, platform = process.platform, env = process.env, spawnChrome } = {}) {
  if (!userDataDir || !path.isAbsolute(userDataDir)) throw new Error('MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE');
  const chrome = chromeExecutable({ executablePath });
  await mkdir(userDataDir, { recursive: true, mode: 0o700 });
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  await rm(portFile, { force: true }); // a stale file from a crashed Chrome would name a dead port
  const { command, args, virtual } = await virtualDisplayCommand(chrome, signInChromeArgs({ userDataDir, port, platform }), { platform, env });
  // On POSIX the window gets its own process group: Ctrl+C in the terminal reaches this process, which then closes
  // Chrome cleanly, and a stuck xvfb-run/Xvfb/Chrome trio can be ended together as a last resort.
  const detached = platform !== 'win32';
  const child = spawnChrome ? spawnChrome(command, args) : spawn(command, args, { stdio: 'ignore', detached, env });
  let exited = false;
  const exit = new Promise(resolve => { child.once('exit', () => { exited = true; resolve(); }); child.once('error', () => { exited = true; resolve(); }); });
  if (detached && !spawnChrome) child.unref();
  const stop = async () => {
    if (exited) return;
    if (listening) await closeTargets(listening).catch(() => {});
    await Promise.race([exit, sleep(15000)]);
    if (exited) return;
    try { if (detached) process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch { /* already gone */ }
    await Promise.race([exit, sleep(5000)]);
  };
  const interrupted = () => { stop().finally(() => process.exit(130)); };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  let listening = 0;
  try {
    // A chosen port is probed directly (Chrome 150 on Linux writes no DevToolsActivePort file for it); port 0 is
    // read from that file, where Chrome records the port it picked.
    const started = Date.now();
    while (!listening && !exited && Date.now() - started < 30000) {
      if (port > 0) listening = (await listTargets(port)) ? port : 0;
      else listening = parseDevToolsActivePort(await readFile(portFile, 'utf8').catch(() => ''));
      if (!listening) await sleep(250);
    }
    if (!listening) { await stop(); return { outcome: exited ? 'closed' : 'not_listening', port: 0, virtual }; }
    if (onStatus) await onStatus({ stage: 'listening', port: listening, virtual });
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let outcome = 'timeout';
    while (Date.now() < deadline) {
      if (exited) { outcome = 'closed'; break; }
      const targets = await listTargets(listening);
      if (targets && signInFinished(targets)) {
        outcome = 'signed_in_page';
        await sleep(settleMs); // let the Maps page finish Google's post-sign-in requests before the window closes
        break;
      }
      await sleep(pollMs);
    }
    await stop();
    await sleep(1000); // Chrome releases the profile lock a moment after its process ends
    return { outcome, port: listening, virtual };
  } finally {
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}
