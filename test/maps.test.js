import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaceUrl, imageUrl, fullImageUrl, placeIdentity, toObservation, launchBrowser, newMapsPage, readMenu, readPhotos, passConsent } from '../src/maps.js';

test('headless Maps page uses the installed Chrome desktop user agent', async () => {
  const browser = await launchBrowser();
  try {
    const page = await newMapsPage(browser);
    const actual = await page.evaluate(() => navigator.userAgent);
    assert.equal(actual, (await browser.userAgent()).replace(/HeadlessChrome\//g, 'Chrome/'));
    assert.ok(!actual.includes('HeadlessChrome/'));
  } finally { await browser.close(); }
});

test('stable Maps identity and image host validation', () => {
  assert.equal(placeIdentity('https://www.google.com/maps/place/X/data=!1s0xabc:0xdef!8m2'), '0xabc:0xdef');
  assert.equal(placeIdentity('https://www.google.com/maps/place/My+Cafe/?x=1'), 'path:my+cafe');
  assert.equal(imageUrl('https://lh3.googleusercontent.com/abc=w140-h140'), 'https://lh3.googleusercontent.com/abc=w140-h140');
  assert.equal(imageUrl('https://evil.googleusercontent.com.example/abc'), '');
  assert.equal(imageUrl('http://lh3.googleusercontent.com/abc'), '');
  assert.equal(fullImageUrl('https://lh3.googleusercontent.com/abc=w140-h140-p-k-no'),
    'https://lh3.googleusercontent.com/abc=w1200-k-no');
});

test('observation keeps Menu photos separate and never verifies rights or menu readability', () => {
  const place = { source_id: '0x1:0x2', name: 'Test Cafe', google_maps_url: 'https://www.google.com/maps/place/Test/data=!1s0x1:0x2' };
  const detail = { status: 'ok', source_id: '0x1:0x2', name: 'Test Cafe', phone: 'Telefon: 0242 111 22 33',
    address: 'Adres: Sokak 1', website: '', rating_label: '4,5 yıldız', review_label: '568 yorum',
    menu: { status: 'found', categories: ['İçecekler'], images: [{ url: 'https://lh3.googleusercontent.com/menu', category: 'İçecekler', width: 500, height: 800 }] },
    photos: { images: [{ url: 'https://lh3.googleusercontent.com/photo', width: 500, height: 500 }] } };
  const observation = toObservation(place, detail);
  assert.equal(observation.review_count, 568);
  assert.equal(observation.rating, 4.5);
  assert.equal(observation.maps_menu_status, 'menu_found');
  assert.equal(observation.menu_assets[0].category, 'İçecekler');
  assert.equal(observation.menu_status, 'unknown');
  assert.equal(observation.menu_assets[0].rights_confirmed, false);
  assert.equal(observation.menu_assets[0].preview_url, 'https://lh3.googleusercontent.com/menu');
  assert.equal(observation.phone, '0242 111 22 33');
  assert.equal(observation.view, 'unknown');
  assert.equal(toObservation(place, { ...detail, view: 'full' }).view, 'full');
});

test('menu tab yields text categories and strip size; strip thumbnails are not the album', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(`<div role="tablist"><button role="tab" aria-label="Test Cafe adlı yere genel bakış">Genel Bakış</button>
          <button role="tab" id="menu-tab">Menü</button><button role="tab">Hakkında</button></div>
        <div role="region" aria-label="Menü" hidden>
          <div role="tablist"><button role="tab">Genel Bakış</button><button role="tab" id="drinks">İçecekler</button></div>
          <button aria-label="Fotoğraf 1/12"><img src="https://lh3.googleusercontent.com/menu=w500-h600"></button>
          <div id="rows"></div></div>
        <button><img src="https://lh3.googleusercontent.com/a/avatar=w300-h300"></button>
        <script>
          document.querySelector('#menu-tab').onclick = () => { document.querySelector('[role=region]').hidden = false; };
          document.querySelector('#drinks').onclick = () => {
            document.querySelector('#rows').innerHTML = '<div class="edOBIb"><div class="Io6YTe">Ayran</div><h2>₺40,00</h2></div>';
          };
        </script>`);
      await page.evaluate(() => {
        Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { get: () => 500 });
        Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { get: () => 600 });
      });
      const menu = await readMenu(page, { waitMs: 20 });
      assert.equal(menu.status, 'found');
      assert.deepEqual(menu.categories, ['İçecekler']);
      assert.deepEqual(menu.items.map(row => [row.category, row.name, row.price_text]), [['İçecekler', 'Ayran', '₺40,00']]);
      assert.equal(menu.expected_images, 12);
      assert.equal(menu.images.length, 0);
      assert.equal(menu.coverage_complete, false);
      const photos = await readPhotos(page);
      assert.equal(photos.images.length, 1);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('EU consent page: only "reject all" is chosen, then Google returns to Maps', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const posted = [];
    try {
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('https://consent.google.com/save')) {
          posted.push(request.postData() || '');
          return request.respond({ status: 302, headers: { location: 'https://www.google.com/maps/search/kafe' } });
        }
        if (url.startsWith('https://consent.google.com/')) return request.respond({ contentType: 'text/html; charset=utf-8', body:
          `<h1>Google'a devam etmeden önce</h1>
           <form action="https://consent.google.com/save" method="post"><input type="hidden" name="choice" value="accept"><button>Tümünü kabul et</button></form>
           <form action="https://consent.google.com/save" method="post"><input type="hidden" name="choice" value="reject"><button>Tümünü reddet</button></form>` });
        if (url.startsWith('https://www.google.com/maps/')) return request.respond({ contentType: 'text/html; charset=utf-8', body: '<h1>Haritalar</h1>' });
        return request.abort();
      });
      await page.goto('https://consent.google.com/ml?continue=https://www.google.com/maps/search/kafe');
      assert.equal(await passConsent(page), true);
      assert.deepEqual(posted, ['choice=reject']);
      assert.equal(new URL(page.url()).hostname, 'www.google.com');
      assert.equal(await passConsent(page), false);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test('place links: country domains, ?cid= and short links are accepted; other hosts are not', () => {
  assert.equal(normalizePlaceUrl('https://www.google.com.tr/maps/place/Cafe/data=!4m2!3m1!1s0x1:0x2'),
    'https://www.google.com/maps/place/Cafe/data=!4m2!3m1!1s0x1:0x2?hl=tr');
  assert.equal(normalizePlaceUrl('https://www.google.com/maps?cid=5682962314133110183'), 'https://www.google.com/maps?cid=5682962314133110183&hl=tr');
  assert.equal(normalizePlaceUrl('https://maps.google.com/?cid=5682962314133110183&hl=en'), 'https://www.google.com/maps?cid=5682962314133110183&hl=tr',
    'the UI language is always Turkish, whatever the link or account says');
  assert.equal(normalizePlaceUrl('https://maps.app.goo.gl/AbCdEf123'), 'https://maps.app.goo.gl/AbCdEf123');
  assert.equal(normalizePlaceUrl('https://www.google.com/search?q=cafe'), '');
  assert.equal(normalizePlaceUrl('https://google.evil.com/maps/place/x'), '');
  assert.equal(normalizePlaceUrl('http://www.google.com/maps/place/x'), '');
});

test('limited view: reload once, then bring in a full-view ENID once per browser, never when signed in', async () => {
  const { nextViewStep } = await import('../src/maps.js');
  assert.equal(nextViewStep({ status: 'ok' }), 'stop');
  // A just-issued ENID only works from the next request on.
  assert.equal(nextViewStep({ status: 'limited_view' }), 'reload');
  assert.equal(nextViewStep({ status: 'limited_view', reloaded: true }), 'renew');
  assert.equal(nextViewStep({ status: 'limited_view', reloaded: true, renewals: 1 }), 'stop');
  assert.equal(nextViewStep({ status: 'limited_view', signedIn: true }), 'stop');
  // A browser that could not leave the limited view does not retry on every place.
  assert.equal(nextViewStep({ status: 'limited_view', sticky: true }), 'stop');
});
