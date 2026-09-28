import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../src/maps.js';
import { extractPlaceDetails, pageStatus, placeMetadata } from '../src/details.js';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(html, run) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await run(page);
  } finally { await page.close(); }
}

test('extracts Turkish details from the place panel, excluding generic Maps heading', async () => {
  await fixture(`<h1>Google Maps</h1><div role="main"><h1 class="DUwDvf">Örnek Lokanta</h1>
    <button data-item-id="address" aria-label="Adres: Atatürk Cd. No: 12, Antalya">Adres kopyala</button>
    <button data-item-id="phone:tel:+902421112233" aria-label="Telefon: 0242 111 22 33"></button>
    <a data-item-id="authority" href="https://example.com/">example.com</a>
    <a data-item-id="menu" href="https://example.com/menu.pdf">Menü</a>
    <div><span role="img" aria-label="4,7 yıldız"></span><button aria-label="1.234 yorum">(1.234)</button></div>
    <button jsaction="pane.rating.category">Türk restoranı</button><span>₺200–400</span>
    <button data-item-id="oh">Açık · Kapanış saati: 23:30</button>
    <table><tr><td>Pazartesi</td><td>08:00–23:30</td></tr><tr><td>Salı</td><td>08:00–23:30</td></tr><tr><td>Pazar</td><td>Kapalı</td></tr></table>
  </div><button aria-label="9.999 yorum">Unrelated</button>`, async page => {
    const result = await extractPlaceDetails(page);
    assert.equal(result.data_status, 'ok');
    assert.equal(result.name, 'Örnek Lokanta');
    assert.equal(result.address, 'Atatürk Cd. No: 12, Antalya');
    assert.equal(result.phone, '0242 111 22 33');
    assert.equal(result.website, 'https://example.com/');
    assert.equal(result.menu_url, 'https://example.com/menu.pdf');
    assert.equal(result.rating, 4.7);
    assert.equal(result.review_count, 1234);
    assert.equal(result.business_type, 'Türk restoranı');
    assert.equal(result.price_level, '₺200–400');
    assert.match(result.opening_hours, /23:30/);
    assert.deepEqual(result.opening_hours_rows, [
      { day: 'Pazartesi', hours: '08:00–23:30' }, { day: 'Salı', hours: '08:00–23:30' }, { day: 'Pazar', hours: 'Kapalı' }
    ]);
  });
});

test('weekly hours caret used by live Turkish Maps expands the seven-day table', async () => {
  await fixture(`<main role="main"><h1>Restaurant</h1><div>
    <span>Açık · Kapanış saati: 23:30</span>
    <span role="img" aria-label="Haftalık çalışma saatlerini göster" onclick="document.querySelector('table').hidden=false">⌄</span>
    <table hidden><tr><td>Pazartesi</td><td>08:00 - 23:30</td></tr><tr><td>Salı</td><td>08:00 - 23:30</td></tr></table>
  </div></main>`, async page => {
    const result = await extractPlaceDetails(page);
    assert.equal(result.opening_hours_rows.length, 2);
    assert.equal(result.opening_hours_rows[0].day, 'Pazartesi');
  });
});

test('English labels, redirected website, and compact review counts', async () => {
  await fixture(`<main role="main"><h1>Corner Cafe</h1>
    <button aria-label="Address: 12 High Street">Copy address</button>
    <a href="tel:+441234567890" aria-label="Phone: +44 1234 567890">Call</a>
    <a data-item-id="authority" href="https://www.google.com/url?q=https%3A%2F%2Fexample.org%2F">Website</a>
    <span role="img" aria-label="Rated 4.6 out of 5"></span><button aria-label="Reviews: 1.2K">Reviews</button>
    <span>Open 24 hours</span><button data-item-id="category">Cafe</button><span>$$</span>
  </main>`, async page => {
    const result = await extractPlaceDetails(page, { expandHours: false });
    assert.equal(result.address, '12 High Street');
    assert.equal(result.phone, '+44 1234 567890');
    assert.equal(result.website, 'https://example.org/');
    assert.equal(result.menu_url, '');
    assert.equal(result.rating, 4.6);
    assert.equal(result.review_count, 1200);
    assert.equal(result.opening_hours, 'Open 24 hours');
    assert.equal(result.price_level, '$$');
  });
});

test('rating line count fallback and missing contact fields remain empty', async () => {
  await fixture('<div role="main"><h1>A Cafe</h1><div><span role="img" aria-label="4.8 stars"></span> (2,345)</div></div>', async page => {
    const result = await extractPlaceDetails(page, { expandHours: false });
    assert.equal(result.review_count, 2345);
    assert.equal(result.rating, 4.8);
    assert.equal(result.website, '');
    assert.equal(result.phone, '');
  });
});

test('hours expansion collects the weekly dialog and restores the place panel', async () => {
  await fixture(`<div role="main"><h1>Open Cafe</h1><button data-item-id="oh">Hours: Open · Closes 11 PM</button></div>
    <div role="dialog" hidden><table><tr><td>Monday</td><td>8 AM–11 PM</td></tr><tr><td>Tuesday</td><td>Closed</td></tr></table></div>`, async page => {
    await page.evaluate(() => {
      document.querySelector('[data-item-id="oh"]').addEventListener('click', () => { document.querySelector('[role="dialog"]').hidden = false; });
      document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('[role="dialog"]').hidden = true; });
    });
    const result = await extractPlaceDetails(page);
    assert.deepEqual(result.opening_hours_rows, [{ day: 'Monday', hours: '8 AM–11 PM' }, { day: 'Tuesday', hours: 'Closed' }]);
    assert.equal(await page.$eval('[role="dialog"]', node => node.hidden), true);
  });
});

test('blank or generic Maps heading does not become a successful business', async () => {
  for (const html of ['<h1>Google Maps</h1><main role="main"></main>', '<h1></h1>', '<div role="feed"><h1>Search results</h1></div>', '<div role="region" aria-label="Map"><h1>Antalya</h1></div>']) {
    await fixture(html, async page => {
      const result = await extractPlaceDetails(page);
      assert.equal(result.data_status, 'unavailable');
      assert.equal(result.name, '');
    });
  }
});

test('status detects gates while accepting the ordinary Maps Sign in button', async () => {
  const cases = [
    ['<h1>A Cafe</h1><button>Sign in</button>', 'ok'],
    ['<h1>A Cafe</h1><a>Oturum aç</a>', 'ok'],
    ['<h1>Before you continue to Google</h1>', 'consent_required'],
    ['<p>Google’a devam etmeden önce</p>', 'consent_required'],
    ['<p>Our systems have detected unusual traffic from your computer network.</p>', 'blocked'],
    ['<p>Bilgisayar ağınızdan olağan dışı trafik algılandı.</p>', 'blocked'],
    ['<h1>Sign in to continue to Google Maps</h1>', 'auth_required'],
    ['<p>Devam etmek için oturum açmanız gerekiyor.</p>', 'auth_required'],
    ['<p>You are seeing a limited view of Google Maps</p><button>Sign in</button>', 'limited_view'],
    ['<p>Google Haritalar sınırlı görünüm</p>', 'limited_view']
  ];
  for (const [html, expected] of cases) await fixture(html, async page => assert.equal(await pageStatus(page), expected, html));
});

test('inert matching structured data fills contact and geo without running scripts', async () => {
  await fixture(`<div role="main"><h1>Schema Cafe</h1></div><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Schema Cafe', telephone: '+90 555 000 00 00',
    address: { streetAddress: 'Test Sokak 1', addressLocality: 'Antalya' }, url: 'https://example.net/',
    aggregateRating: { ratingValue: '4.9', reviewCount: 87 }, geo: { latitude: 36.89, longitude: 30.71 }, priceRange: '₺₺'
  })}</script>`, async page => {
    const result = await extractPlaceDetails(page, { expandHours: false });
    assert.equal(result.phone, '+90 555 000 00 00');
    assert.equal(result.address, 'Test Sokak 1, Antalya');
    assert.equal(result.rating, 4.9);
    assert.equal(result.review_count, 87);
    assert.equal(result.latitude, 36.89);
    assert.equal(result.longitude, 30.71);
  });
});

test('place metadata uses business coordinates and lossless identity', () => {
  const result = placeMetadata('https://www.google.com/maps/place/Cafe/@36.8,30.8,14z/data=!1s0xabc:0xffffffffffffffff!8m2!3d36.89!4d30.71?query_place_id=ChIJ123');
  assert.equal(result.feature_id, '0xabc:0xffffffffffffffff');
  assert.equal(result.cid, '18446744073709551615');
  assert.equal(result.place_id, 'ChIJ123');
  assert.equal(result.latitude, 36.89);
  assert.equal(result.longitude, 30.71);
  assert.equal(placeMetadata('https://www.google.com/maps/place/Cafe/@36.8,30.8,14z').latitude, undefined);
  assert.equal(placeMetadata('https://www.google.com/maps/?cid=123').cid, '123');
});
