import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SIGN_IN_URL, parseDevToolsActivePort, signIn, signInChromeArgs, signInFinished, virtualDisplayCommand } from '../src/login.js';

test('sign-in window: the reader profile, DevTools on loopback, no automation or headless flags', () => {
  const args = signInChromeArgs({ userDataDir: '/srv/gmaps/profile', port: 9222, platform: 'linux' });
  assert.ok(args.includes('--user-data-dir=/srv/gmaps/profile'));
  assert.ok(args.includes('--remote-debugging-port=9222'));
  assert.equal(args.at(-1), SIGN_IN_URL);
  assert.match(SIGN_IN_URL, /^https:\/\/accounts\.google\.com\/ServiceLogin\?hl=tr&continue=https%3A%2F%2Fwww\.google\.com%2Fmaps/);
  assert.ok(!args.some(argument => /automation|headless|remote-debugging-address/.test(argument)));
  // The window stores cookies the way puppeteer's headless Chrome reads them later.
  assert.ok(args.includes('--password-store=basic'));
  assert.ok(signInChromeArgs({ userDataDir: 'C:\\p', platform: 'win32' }).every(argument => !/password-store|mock-keychain/.test(argument)));
  assert.ok(signInChromeArgs({ userDataDir: '/p', platform: 'darwin' }).includes('--use-mock-keychain'));
  assert.ok(signInChromeArgs({ userDataDir: '/p' }).includes('--remote-debugging-port=0'), 'any free port by default');
});

test('the sign-in is finished once Maps is open and no accounts.google.com page is left', () => {
  const page = url => ({ type: 'page', url });
  assert.equal(signInFinished([page('https://accounts.google.com/v3/signin/identifier?x=1')]), false);
  assert.equal(signInFinished([page('https://consent.google.com/m?continue=https://www.google.com/maps')]), false);
  assert.equal(signInFinished([page('https://www.google.com/maps?hl=tr&authuser=0')]), true);
  assert.equal(signInFinished([page('https://www.google.com/maps/@41.0,29.0,12z?hl=tr')]), true);
  assert.equal(signInFinished([page('https://www.google.com/maps?hl=tr'), page('https://accounts.google.com/signin/v2/challenge')]), false, 'an interstitial is still open');
  assert.equal(signInFinished([{ type: 'service_worker', url: 'https://www.google.com/maps/sw.js' }]), false, 'only pages count');
  assert.equal(signInFinished([page('https://www.google.com/mapsfake/x')]), false);
  assert.equal(signInFinished(null), false);
});

test('DevToolsActivePort file and the virtual display decision', async () => {
  assert.equal(parseDevToolsActivePort('9222\n/devtools/browser/abc'), 9222);
  assert.equal(parseDevToolsActivePort('54321\r\n/devtools/browser/abc'), 54321);
  assert.equal(parseDevToolsActivePort(''), 0);
  assert.equal(parseDevToolsActivePort('nope'), 0);
  const chrome = '/usr/bin/google-chrome', args = ['--a'];
  assert.deepEqual(await virtualDisplayCommand(chrome, args, { platform: 'win32', env: {} }), { command: chrome, args, virtual: false });
  assert.deepEqual(await virtualDisplayCommand(chrome, args, { platform: 'linux', env: { DISPLAY: ':0' } }), { command: chrome, args, virtual: false });
  const found = await virtualDisplayCommand(chrome, args, { platform: 'linux', env: { PATH: '/nowhere:/usr/bin' }, pathExists: async file => file === '/usr/bin/xvfb-run' });
  assert.equal(found.virtual, true);
  assert.equal(found.command, '/usr/bin/xvfb-run');
  assert.deepEqual(found.args.slice(0, 3), ['-a', '-s', '-screen 0 1365x900x24']);
  assert.deepEqual(found.args.slice(3), [chrome, ...args]);
  await assert.rejects(virtualDisplayCommand(chrome, args, { platform: 'linux', env: { PATH: '/nowhere' }, pathExists: async () => false }), /DISPLAY_REQUIRED/);
});

// A stand-in for Chrome: listens on the requested port (any free one for 0, then it writes DevToolsActivePort as
// Chrome does), answers /json/list (sign-in page first, Maps after two polls) and exits when its page is closed
// through /json/close.
const FAKE_CHROME = `
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const dir = process.argv.find(a => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const port = Number(process.argv.find(a => a.startsWith('--remote-debugging-port=')).split('=')[1]);
let polls = 0, closedWith = '';
const server = http.createServer((request, response) => {
  if (request.url === '/json/list') {
    polls++;
    const url = polls > 2 ? 'https://www.google.com/maps?hl=tr&authuser=0' : 'https://accounts.google.com/v3/signin/identifier';
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify([{ type: 'page', id: 'T1', url }, { type: 'service_worker', id: 'S1', url: 'https://www.google.com/maps/sw.js' }]));
  } else if (request.url === '/json/close/T1') {
    closedWith = request.method;
    response.end('Target is closing');
    setTimeout(() => { writeFileSync(dir + '/fake-exit.json', JSON.stringify({ polls, closedWith, argv: process.argv.slice(2) })); process.exit(0); }, 50);
  } else { response.statusCode = 404; response.end(); }
});
server.listen(port, '127.0.0.1', () => { if (!port) writeFileSync(dir + '/DevToolsActivePort', server.address().port + '\\n/devtools/browser/fake'); });
`;

test('signIn waits for Maps, closes the window through DevTools and reports the page outcome', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gmaps-login-test-'));
  try {
    const fake = path.join(dir, 'fake-chrome.mjs');
    await writeFile(fake, FAKE_CHROME);
    await writeFile(path.join(dir, 'DevToolsActivePort'), '1\n/stale'); // from a "crashed" run: must be ignored
    const profile = path.join(dir, 'profile');
    const events = [];
    const result = await signIn({ userDataDir: profile, executablePath: '/fake/chrome', platform: 'win32', settleMs: 10, pollMs: 20, timeoutMs: 10000,
      onStatus: event => events.push(event), spawnChrome: (command, args) => {
        assert.equal(command, '/fake/chrome');
        return spawn(process.execPath, [fake, ...args], { stdio: 'ignore' });
      } });
    assert.equal(result.outcome, 'signed_in_page');
    assert.equal(result.virtual, false);
    assert.ok(result.port > 0);
    assert.deepEqual(events, [{ stage: 'listening', port: result.port, virtual: false }]);
    const seen = JSON.parse(await readFile(path.join(profile, 'fake-exit.json'), 'utf8'));
    assert.equal(seen.polls, 4, 'three polls until Maps was open, one more to list the tabs to close');
    assert.equal(seen.closedWith, 'PUT');
    assert.ok(seen.argv.includes(`--user-data-dir=${profile}`));
    assert.ok(seen.argv.includes('--remote-debugging-port=0'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a chosen port is probed directly: Chrome need not write DevToolsActivePort for it', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gmaps-login-test-'));
  try {
    const fake = path.join(dir, 'fake-chrome.mjs');
    await writeFile(fake, FAKE_CHROME);
    const profile = path.join(dir, 'profile');
    // A port that is free right now (test files run in parallel, so a fixed one could be taken).
    const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); }); });
    const result = await signIn({ userDataDir: profile, executablePath: '/fake/chrome', platform: 'win32', port, settleMs: 10, pollMs: 20, timeoutMs: 10000,
      spawnChrome: (command, args) => spawn(process.execPath, [fake, ...args], { stdio: 'ignore' }) });
    assert.equal(result.outcome, 'signed_in_page', JSON.stringify(result));
    assert.equal(result.port, port);
    const seen = JSON.parse(await readFile(path.join(profile, 'fake-exit.json'), 'utf8'));
    assert.ok(seen.argv.includes(`--remote-debugging-port=${port}`));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('signIn reports a window that was closed before Maps opened, and a Chrome that never listened', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gmaps-login-test-'));
  try {
    const profile = path.join(dir, 'profile');
    const closed = await signIn({ userDataDir: profile, executablePath: '/fake/chrome', platform: 'win32', pollMs: 20, timeoutMs: 5000,
      spawnChrome: () => spawn(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(path.join(profile, 'DevToolsActivePort'))}, '1\\n/x'); setTimeout(() => {}, 300)`], { stdio: 'ignore' }) });
    assert.equal(closed.outcome, 'closed');
    const silent = await signIn({ userDataDir: profile, executablePath: '/fake/chrome', platform: 'win32', pollMs: 20, timeoutMs: 5000,
      spawnChrome: () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 100)'], { stdio: 'ignore' }) });
    assert.equal(silent.outcome, 'closed', 'Chrome exited without a port: the window is gone');
    await assert.rejects(signIn({ userDataDir: 'relative/profile', executablePath: '/fake/chrome' }), /MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
