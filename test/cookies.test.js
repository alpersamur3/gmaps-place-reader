import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeGoogleCookies, loadGoogleCookies, applyBrowserCookies, cookieOptionsFromArgs } from '../src/cookies.js';

const nowSeconds = 1800000000;
const cookie = (overrides = {}) => ({ name: 'TEST_AUTH', value: 'synthetic-value', domain: '.google.com',
  path: '/', secure: true, httpOnly: true, ...overrides });

test('Cookie Editor normalizes SameSite, expiry, session and host-only cookies', () => {
  const { cookies, stats } = normalizeGoogleCookies([
    cookie({ sameSite: 'no_restriction', expirationDate: nowSeconds + 3600, hostOnly: false, storeId: '0' }),
    cookie({ name: 'SESSION', sameSite: null, session: true, expirationDate: 1 }),
    cookie({ name: 'HOST', domain: '.www.google.com', hostOnly: true, sameSite: 'strict' }),
  ], { nowSeconds });
  assert.equal(cookies[0].sameSite, 'None');
  assert.equal(cookies[0].expires, nowSeconds + 3600);
  assert.equal(cookies[0].storeId, undefined);
  assert.equal(cookies[1].expires, undefined);
  assert.equal(cookies[1].sameSite, undefined);
  assert.equal(cookies[2].domain, 'www.google.com');
  assert.equal(cookies[2].sameSite, 'Strict');
  assert.equal(stats.accepted, 3);
});

test('Playwright storage state preserves session and partition isolation, ignores local storage', () => {
  const input = { cookies: [cookie({ expires: -1, sameSite: 'Lax' }),
    cookie({ name: 'PARTITIONED', partitionKey: 'https://www.google.com' })],
  origins: [{ origin: 'https://www.google.com', localStorage: [{ name: 'private', value: 'not-a-cookie' }] }] };
  const result = normalizeGoogleCookies(input, { nowSeconds });
  assert.equal(result.cookies[0].expires, undefined);
  assert.equal(result.cookies[0].sameSite, 'Lax');
  assert.deepEqual(result.cookies[1].partitionKey, { sourceOrigin: 'https://www.google.com' });
  assert.equal(JSON.stringify(result.cookies).includes('not-a-cookie'), false);
});

test('expired, foreign, invalid and duplicate cookies counted without exposing credentials', () => {
  const result = normalizeGoogleCookies([
    cookie({ expires: nowSeconds - 1 }), cookie({ expires: 0 }),
    cookie({ domain: '.google.com.evil.test' }), cookie({ value: 'bad\nvalue' }),
    cookie({ name: 'VALID', value: 'old-synthetic' }), cookie({ name: 'VALID', value: 'new-synthetic' }),
    cookie({ name: 'INVALID_SAMESITE', sameSite: 'anything' }),
  ], { nowSeconds });
  assert.deepEqual(result.stats, { total: 7, accepted: 1, expired: 2, invalid: 2, foreign: 1, duplicates: 1 });
  assert.equal(result.cookies[0].value, 'new-synthetic');
  assert.equal(JSON.stringify(result.stats).includes('synthetic'), false);
});

test('only HTTPS Google cookie URLs accepted; URL/domain mismatch cannot broaden credentials', () => {
  const result = normalizeGoogleCookies([
    cookie({ domain: undefined, url: 'https://www.google.com/maps' }),
    cookie({ name: 'TR', domain: '.google.com.tr' }),
    cookie({ url: 'https://maps.google.com.evil.test' }), cookie({ url: 'http://www.google.com' }),
    cookie({ url: 'https://user:password@www.google.com' }),
    cookie({ domain: 'accounts.google.com', url: 'https://www.google.com' }),
    cookie({ domain: 'google.com:443' }),
  ], { nowSeconds });
  assert.equal(result.cookies.length, 2);
  assert.equal(result.cookies[0].domain, 'www.google.com');
  assert.equal(result.stats.foreign, 3);
  assert.equal(result.stats.invalid, 2);
});

test('invalid prefixes, insecure SameSite=None and malformed values rejected independently', () => {
  const result = normalizeGoogleCookies([
    cookie({ sameSite: 'None', secure: false }), cookie({ name: '__Secure-SYNTHETIC', secure: false }),
    cookie({ name: '__Host-SYNTHETIC' }), cookie({ name: '__Host-VALID', hostOnly: true }),
    cookie({ secure: 'true' }), cookie({ expires: '1800003600' }), cookie({ expires: Infinity }),
    cookie({ partitionKeyOpaque: true }), cookie({ partitionKey: 'https://evil.test' }),
    cookie({ value: 'x'.repeat(5000) }), null, 'synthetic-invalid-row',
  ], { nowSeconds });
  assert.equal(result.cookies.length, 1);
  assert.equal(result.cookies[0].name, '__Host-VALID');
  assert.equal(result.stats.invalid, 11);
});

test('missing configuration is a no-op; configured invalid shapes fail clearly', async () => {
  assert.equal((await loadGoogleCookies({ env: {} })).configured, false);
  assert.throws(() => normalizeGoogleCookies({ value: 'synthetic-sensitive' }), { message: 'MAPS_COOKIES_INVALID_FORMAT' });
  await assert.rejects(loadGoogleCookies({ cookiesFile: '', env: {} }), { message: 'MAPS_COOKIES_FILE_REQUIRED' });
});

test('relative files, explicit precedence, environment configuration and UTF-8 BOM work', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maps-cookie-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'synthetic.json');
  await writeFile(file, '\uFEFF' + JSON.stringify({ cookies: [cookie({ expires: -1 })] }));
  const explicit = await loadGoogleCookies({ cookiesFile: 'synthetic.json', cwd: dir,
    env: { MAPS_COOKIES_FILE: 'missing-synthetic.json' }, nowSeconds });
  assert.equal(explicit.configured, true);
  assert.equal(explicit.stats.accepted, 1);
  const fromEnv = await loadGoogleCookies({ env: { MAPS_COOKIES_FILE: file }, nowSeconds });
  assert.deepEqual(fromEnv.stats, explicit.stats);
});

test('file failures redact contents; all-expired input reports counts; size bounded', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maps-cookie-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'synthetic-private-name.json');
  await assert.rejects(loadGoogleCookies({ cookiesFile: file }), { message: 'MAPS_COOKIES_FILE_UNREADABLE' });
  await writeFile(file, '{"secret":"synthetic-private-value"');
  await assert.rejects(loadGoogleCookies({ cookiesFile: file }), error =>
    error.message === 'MAPS_COOKIES_INVALID_JSON' && !String(error.stack).includes('synthetic-private-value'));
  await writeFile(file, JSON.stringify([cookie({ expires: 1 })]));
  await assert.rejects(loadGoogleCookies({ cookiesFile: file, nowSeconds }), error =>
    error.message === 'MAPS_COOKIES_EMPTY' && error.stats.expired === 1 && !JSON.stringify(error).includes('synthetic-value'));
  await writeFile(file, ' '.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(loadGoogleCookies({ cookiesFile: file }), { message: 'MAPS_COOKIES_FILE_TOO_LARGE' });
});

test('browser import isolates rejected cookies and never exposes browser error contents', async () => {
  const loaded = { ...normalizeGoogleCookies([cookie(), cookie({ name: 'REJECT' })]), configured: true };
  const browser = { defaultBrowserContext: () => ({ setCookie: async row => {
    if (row.name === 'REJECT') throw new Error('synthetic-sensitive-browser-error');
  } }) };
  const stats = await applyBrowserCookies(browser, loaded);
  assert.equal(stats.applied, 1);
  assert.equal(stats.rejected, 1);
  assert.equal(JSON.stringify(stats).includes('synthetic'), false);
  await assert.rejects(applyBrowserCookies(browser, { ...loaded, cookies: [cookie({ name: 'REJECT' })] }),
    error => error.message === 'MAPS_COOKIES_REJECTED' && !String(error.stack).includes('synthetic-sensitive'));
  assert.equal((await applyBrowserCookies({}, await loadGoogleCookies({ env: {} }))).applied, 0);
});

test('CLI accepts paths without interpolation; missing or ambiguous arguments rejected', () => {
  assert.deepEqual(cookieOptionsFromArgs(['--cookies-file', 'private folder/cookies.json']),
    { cookiesFile: 'private folder/cookies.json' });
  assert.deepEqual(cookieOptionsFromArgs(['--cookies-file=private/cookies.json']), { cookiesFile: 'private/cookies.json' });
  assert.throws(() => cookieOptionsFromArgs(['--cookies-file']), { message: 'MAPS_COOKIES_FILE_REQUIRED' });
  assert.throws(() => cookieOptionsFromArgs(['--cookies-file', '--unknown']), { message: 'MAPS_COOKIES_FILE_REQUIRED' });
  assert.throws(() => cookieOptionsFromArgs(['--cookies-file=x', '--cookies-file=y']), { message: 'INVALID_ARGUMENT' });
  assert.throws(() => cookieOptionsFromArgs(['--unknown']), { message: 'INVALID_ARGUMENT' });
});
