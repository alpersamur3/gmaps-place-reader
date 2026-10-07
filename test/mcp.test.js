import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMcpServer, downloadPhoto, photoUrl, PROTOCOL_VERSIONS } from '../src/mcp.js';

const PLACE = 'https://www.google.com/maps/place/Test/data=!4m2!3m1!1s0x1:0x2';
const photo = id => `https://lh3.googleusercontent.com/gps-cs-s/${id}=w203-h152-k-no`;
const DETAIL = {
  status: 'ok', view: 'full', google_maps_url: PLACE, name: 'Test Cafe', address: 'Adres: Sokak 1', phone: 'Telefon: 0242 111 22 33',
  rating: 4.5, review_count: 120, warnings: [],
  attributes: [{ category: 'Hizmet seçenekleri', name: 'Paket servis', available: true }, { category: 'Hizmet seçenekleri', name: 'Teslimat', available: false }],
  menu: { status: 'found', coverage_complete: true, expected_images: 2, categories: ['İçecekler'],
    items: [{ category: 'İçecekler', name: 'Ayran', price_text: '₺40,00', description: '' }],
    images: [{ url: photo('menu1'), taken_at: '2026-01', width: 900, height: 1200 }] },
  photos: { status: 'found', images: [{ url: photo('hall'), label: 'Salon' }] },
  reviews: { status: 'found', total_count: 120, collected_count: 1, sort_label: 'En yeni', sort_applied: true, coverage_complete: false, truncated: true,
    reviews: [{ review_id: 'r1', author: 'Ayşe Yılmaz', author_summary: 'Yerel Rehber', rating: 5, text: 'Çok  güzel',
      date_iso: '2026-10-01T09:00:00.000Z', date_estimate: '2026-10-01', details: [{ name: 'Yiyecek', value: '5' }],
      owner_response: 'Teşekkürler', likes: 2, photos: [photo('rp')], language: 'tr' }] },
};

function fakeReader(detail = DETAIL) {
  const calls = [];
  return { calls,
    place: async (url, options) => { calls.push(['place', url, options]); if (options.onProgress) await options.onProgress({ stage: 'overview' }); return detail; },
    search: async (...args) => { calls.push(['search', ...args]); return { status: 'ok', places: [{ name: 'Test Cafe', google_maps_url: PLACE, source_id: 'x' }], truncated: false }; },
    close: async () => { calls.push(['close']); } };
}
const server = (env = {}, options = {}) => createMcpServer({ env: { MAPS_MCP_PAUSE_MS: '0', ...env }, reader: fakeReader(), ...options });
const call = (mcp, name, args = {}, id = 1, meta) => mcp.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } });
const body = response => JSON.parse(response.result.content[0].text);

test('MCP handshake: version negotiation, four read-only tools, notifications and unknown methods', async () => {
  const mcp = server();
  const init = await mcp.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'gmaps-place-reader');
  const future = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
  assert.equal(future.result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.equal(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await mcp.handle({ jsonrpc: '2.0', id: 9, result: {} }), null);
  const tools = (await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['search', 'place', 'reviews', 'photos']);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && tool.inputSchema.type === 'object'));
  assert.deepEqual((await mcp.handle({ jsonrpc: '2.0', id: 3, method: 'ping' })).result, {});
  assert.equal((await mcp.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).error.code, -32601);
  assert.equal((await call(mcp, 'delete_everything')).error.code, -32602);
  assert.equal((await mcp.handle([1, 2])).error.code, -32600);
});

test('place: details, written menu, dated menu photos as large URLs, About, reviews without reviewer names', async () => {
  const reader = fakeReader();
  const mcp = createMcpServer({ env: { MAPS_MCP_PAUSE_MS: '0' }, reader });
  const result = body(await call(mcp, 'place', { url: PLACE, reviews: 5, menu_photos: 999 }));
  const options = reader.calls[0][2];
  assert.equal(reader.calls[0][1], 'https://www.google.com/maps/place/Test/data=!4m2!3m1!1s0x1:0x2?hl=tr');
  assert.deepEqual([options.maxMenuImages, options.maxImages, options.includeReviews, options.maxReviews, options.reviewSort], [200, 12, true, 5, 'newest']);
  assert.equal(result.address, 'Sokak 1');
  assert.equal(result.phone, '0242 111 22 33');
  assert.deepEqual(result.about, { 'Hizmet seçenekleri': ['Paket servis'] });
  assert.deepEqual(result.menu.items, [{ category: 'İçecekler', name: 'Ayran', price: '₺40,00' }]);
  assert.deepEqual(result.menu.photos, [{ url: 'https://lh3.googleusercontent.com/gps-cs-s/menu1=w1200-k-no', taken_at: '2026-01', width: 900, height: 1200 }]);
  assert.deepEqual(result.photos, [{ url: 'https://lh3.googleusercontent.com/gps-cs-s/hall=w1200-k-no', label: 'Salon' }]);
  const review = result.reviews.reviews[0];
  assert.deepEqual([review.rating, review.date, review.date_precision, review.text, review.owner_response], [5, '2026-10-01', 'exact', 'Çok güzel', 'Teşekkürler']);
  assert.deepEqual(review.details, [{ name: 'Yiyecek', value: '5' }]);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('Ayşe') && !text.includes('Yerel Rehber') && !text.includes('"r1"'));
});

test('reviews reads only the reviews (no menu, no gallery) in the requested order', async () => {
  const reader = fakeReader();
  const mcp = createMcpServer({ env: { MAPS_MCP_PAUSE_MS: '0' }, reader });
  const result = body(await call(mcp, 'reviews', { url: PLACE, count: 120, sort: 'lowest' }));
  const options = reader.calls[0][2];
  assert.deepEqual([options.includeMenu, options.includePhotos, options.includeReviews, options.maxReviews, options.maxReviewScrolls, options.reviewSort],
    [false, false, true, 120, 14, 'lowest']);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.sort_applied, true);
  assert.equal(result.menu, undefined);
  assert.ok(!JSON.stringify(result).includes('Ayşe'));
});

test('search returns names and links; bad links and missing fields are tool errors, not crashes', async () => {
  const mcp = server();
  assert.deepEqual(body(await call(mcp, 'search', { query: 'kafe', location: 'Kadıköy', limit: 50 })),
    { status: 'ok', places: [{ name: 'Test Cafe', url: PLACE }], truncated: false });
  const bad = await call(mcp, 'place', { url: 'https://example.com/maps/place/x' });
  assert.deepEqual([bad.result.isError, bad.result.content[0].text], [true, 'INVALID_MAPS_URL']);
  assert.equal((await call(mcp, 'search', { query: 'kafe' })).result.content[0].text, 'QUERY_AND_LOCATION_REQUIRED');
  const crash = createMcpServer({ env: { MAPS_MCP_PAUSE_MS: '0' }, reader: { ...fakeReader(), place: async () => { throw new Error('Navigation timeout of 30000 ms exceeded'); } } });
  assert.equal((await call(crash, 'place', { url: PLACE })).result.content[0].text, 'MAPS_READ_FAILED: Navigation timeout of 30000 ms exceeded');
});

test('reads are limited per session and paced; 0 turns the limit off', async () => {
  const mcp = server({ MAPS_MCP_MAX_READS: '2' });
  await call(mcp, 'search', { query: 'a', location: 'b' });
  await call(mcp, 'place', { url: PLACE });
  const third = await call(mcp, 'reviews', { url: PLACE });
  assert.equal(third.result.isError, true);
  assert.match(third.result.content[0].text, /^READ_LIMIT: this server allows 2 Maps reads/);
  const open = server({ MAPS_MCP_MAX_READS: '0' });
  for (let i = 0; i < 40; i++) assert.equal((await call(open, 'search', { query: 'a', location: 'b' })).result.isError, undefined);

  const waits = [];
  const paced = createMcpServer({ env: { MAPS_MCP_PAUSE_MS: '5000' }, reader: fakeReader(), sleep: async ms => { waits.push(ms); } });
  await call(paced, 'search', { query: 'a', location: 'b' });
  await call(paced, 'search', { query: 'a', location: 'b' });
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 4000 && waits[0] <= 5000);
});

test('long reads send progress notifications when the client asks for them', async () => {
  const sent = [];
  const mcp = server({}, { notify: message => sent.push(message) });
  await call(mcp, 'place', { url: PLACE }, 1, { progressToken: 'p1' });
  assert.deepEqual(sent, [{ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 'p1', progress: 1, message: 'place opened' } }]);
  await call(mcp, 'place', { url: PLACE });
  assert.equal(sent.length, 1);
});

test('photos: only Google photo URLs, resized, returned as images, within the session limit', async () => {
  const fetched = [];
  const mcp = server({ MAPS_MCP_MAX_PHOTOS: '2' }, { download: async url => { fetched.push(url); if (url.includes('broken')) throw new Error('HTTP_404'); return { data: 'AAAA', mimeType: 'image/jpeg' }; } });
  const result = (await call(mcp, 'photos', { urls: [photo('a'), 'https://evil.example/x.jpg', photo('a'), photo('broken'), photo('b'), photo('c')] })).result;
  assert.deepEqual(fetched, ['https://lh3.googleusercontent.com/gps-cs-s/a=s1280-k-no', 'https://lh3.googleusercontent.com/gps-cs-s/broken=s1280-k-no',
    'https://lh3.googleusercontent.com/gps-cs-s/b=s1280-k-no']);
  assert.deepEqual(result.content.filter(part => part.type === 'image'), [{ type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }, { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }]);
  const texts = result.content.filter(part => part.type === 'text').map(part => part.text);
  assert.ok(texts.some(text => text.startsWith('https://evil.example/x.jpg: not a Google Maps photo URL')));
  assert.ok(texts.some(text => text.includes('broken') && text.includes('could not be downloaded (HTTP_404)')));
  assert.ok(texts.some(text => text.includes('/c=') && text.includes('photo limit of this session reached')));
  assert.equal(photoUrl('https://lh3.googleusercontent.com/p/AF1Qip'), 'https://lh3.googleusercontent.com/p/AF1Qip=s1280-k-no');
  assert.equal(photoUrl('https://lh3.googleusercontent.com/a/avatar=s64'), '');
});

test('photo download: no redirects, size cap, real image bytes only', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
  const response = (bytes, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers), body: [bytes] });
  let options;
  const image = await downloadPhoto('https://lh3.googleusercontent.com/x=s1280-k-no', { fetchImpl: async (url, init) => { options = init; return response(jpeg); } });
  assert.deepEqual(image, { data: jpeg.toString('base64'), mimeType: 'image/jpeg' });
  assert.equal(options.redirect, 'error');
  await assert.rejects(downloadPhoto('u', { fetchImpl: async () => response(Buffer.from('<html>')) }), /NOT_AN_IMAGE/);
  await assert.rejects(downloadPhoto('u', { maxBytes: 3, fetchImpl: async () => response(jpeg) }), /TOO_LARGE/);
  await assert.rejects(downloadPhoto('u', { fetchImpl: async () => response(jpeg, { 'content-length': '999999999' }) }), /TOO_LARGE/);
  await assert.rejects(downloadPhoto('u', { fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP_403/);
});

test('gmaps-mcp speaks line-delimited JSON-RPC on stdio and exits when the client closes it', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/mcp.js', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  child.stdout.setEncoding('utf8');
  let buffer = '';
  child.stdout.on('data', chunk => { buffer += chunk; let index; while ((index = buffer.indexOf('\n')) >= 0) { lines.push(JSON.parse(buffer.slice(0, index))); buffer = buffer.slice(index + 1); } });
  const exited = new Promise(resolve => child.on('exit', resolve));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write('not json\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await new Promise(resolve => { const timer = setInterval(() => { if (lines.length >= 3) { clearInterval(timer); resolve(); } }, 20); });
  child.stdin.end();
  assert.equal(await exited, 0);
  assert.equal(lines.find(line => line.id === 1).result.serverInfo.name, 'gmaps-place-reader');
  assert.equal(lines.find(line => line.id === null).error.code, -32700);
  assert.equal(lines.find(line => line.id === 2).result.tools.length, 4);
});
