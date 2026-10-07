import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, toObservation } from '../src/maps.js';
import { collectImages, imageIdentity, readMenu, readMenuPhotos, readPhotos, viewerPhoto, photoMonth } from '../src/media.js';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
async function fixture(html, run) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent(html);
    return await run(page);
  } finally { await page.close(); }
}

const PLACE = 'https://www.google.com/maps/place/Test/data=!4m2!3m1!1s0x1:0x2';
// Served under a Maps URL so the fake viewer can use history.pushState like Maps does.
async function mapsFixture(html, run) {
  const page = await browser.newPage();
  let loads = 0;
  try {
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (!request.isNavigationRequest() || !request.url().startsWith('https://www.google.com/maps/')) return request.abort();
      loads++;
      request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });
    await page.goto(PLACE);
    return await run(page, () => loads);
  } finally { await page.close(); }
}

// Cover photo → gallery categories → Menü → viewer with a "next" control, like Maps.
function galleryHtml({ categories = ['Tümü', 'Menü', 'Yeme-içme'], photos = [], wraps = false, flat = false, cover = '' } = {}) {
  const tabs = categories.map(name => `<div role="tab" aria-selected="false">${name}</div>`).join('');
  return `<main role="main"><h1>Test Cafe</h1>
    <button jsaction="pane.x.heroHeaderImage" style="display:block;width:80px;height:40px">cover</button>
    <div role="tablist"><button role="tab">Genel Bakış</button><button role="tab">Hakkında</button></div>
    <div id="gallery" hidden>${flat ? '<a href="#" data-photo-index="0">1. fotoğraf</a>' : `<div role="tablist">${tabs}</div>`}</div>
    <div id="date"></div><div id="captured"></div>
    <button aria-label="Sonraki" id="popular">popüler saatler</button>
    <button aria-label="Sonraki" jsaction="play.onRightClick" id="next">›</button></main>
    <script>
      const photos = ${JSON.stringify(photos)};
      let index = -1;
      const show = i => {
        index = i;
        const [id, label, w, h] = photos[i];
        const image = encodeURIComponent('https://lh3.googleusercontent.com/gps-cs-s/' + id + '=w203-h152-k-no');
        history.pushState(null, '', '/maps/place/Test/@1,2,3a,75y,90t/data=!3m8!1e2!3m6!1s' + id + '!2e10!3e12!6s' + image +
          '!7i' + w + '!8i' + h + '!4m2!3m1!1s0x1:0x2');
        document.querySelector('#date').textContent = label;
        document.querySelector('#captured').textContent = photos[i][4] || '';
        document.querySelector('#next').disabled = !${wraps} && i === photos.length - 1;
      };
      // Real Maps opens the viewer on the cover photo; selecting a category changes the URL before the photo.
      const coverUrl = extra => '/maps/place/Test/@1,2,3a,75y,90t/data=!3m8!1e2!3m6!1s${cover}!2e10!3e12!6s' +
        encodeURIComponent('https://lh3.googleusercontent.com/gps-cs-s/${cover}=w203-h152-k-no') + '!7i800!8i600' + extra;
      document.querySelector('[jsaction*=heroHeaderImage]').onclick = () => {
        document.querySelector('#gallery').hidden = false;
        if (${JSON.stringify(cover)}) history.pushState(null, '', coverUrl(''));
      };
      for (const tab of document.querySelectorAll('#gallery [role=tab]')) tab.onclick = () => {
        tab.setAttribute('aria-selected', 'true');
        if (tab.textContent !== 'Menü') return;
        if (${JSON.stringify(cover)}) history.pushState(null, '', coverUrl('!4m2!3m1!1s0x1:0x2'));
        setTimeout(() => show(0), ${JSON.stringify(cover)} ? 600 : 150);
      };
      document.querySelector('#next').onclick = () => show((index + 1) % photos.length);
      document.querySelector('#popular').onclick = () => { document.body.dataset.popular = 'clicked'; };
    </script>`;
}

test('CSS photos, lazy sources and small canvas previews survive; avatar and size duplicates do not', async () => {
  await fixture(`<main role="main">
    <div style="width:120px;height:150px;background-image:url(https://lh3.googleusercontent.com/p/one=w120-h150)"></div>
    <img width="300" height="400" src="https://lh3.googleusercontent.com/p/one=w300-h400">
    <img class="QUPxxe" style="display:none" src="https://lh3.googleusercontent.com/p/two=w32-h32-p-k-no">
    <img width="200" height="200" data-src="https://lh3.googleusercontent.com/p/three=w200">
    <img src="https://lh3.googleusercontent.com/a-/avatar=w300">
    <img src="https://lh3.googleusercontent.com/ogw/avatar=s300">
    <img src="https://evil.example/p/evil=w500">
    </main>`, async page => {
    const result = await collectImages(page, { maxImages:20, waitMs:5 });
    assert.equal(result.images.length, 3);
    assert.equal(new Set(result.images.map(row => imageIdentity(row.url))).size, 3);
    assert.equal(result.exhausted, true);
  });
});

test('virtualized gallery accumulates earlier photos and waits for delayed scroll loading', async () => {
  await fixture(`<div role="main" style="height:160px;overflow-y:auto"><div style="height:900px">
    <img width="200" height="200" src="https://lh3.googleusercontent.com/p/first=w200">
    </div></div>`, async page => {
    await page.evaluate(() => {
      const panel = document.querySelector('[role=main]');
      let changed = false;
      panel.addEventListener('scroll', () => {
        if (changed) return; changed = true;
        setTimeout(() => { panel.querySelector('img').src = 'https://lh3.googleusercontent.com/p/second=w200'; }, 70);
      });
    });
    const result = await collectImages(page, { maxImages:20, maxScrolls:10, waitMs:400 });
    assert.equal(result.images.length, 2, JSON.stringify({ result, dom: await page.$eval('[role=main]', el => ({ top:el.scrollTop, height:el.scrollHeight, client:el.clientHeight, src:el.querySelector('img').src })) }));
    assert.ok(result.images.some(row => row.url.includes('/first=')));
    assert.ok(result.images.some(row => row.url.includes('/second=')));
  });
});

const photo = (id, size = 100) => `<img style="width:${size}px;height:${size}px" src="https://lh3.googleusercontent.com/gps-cs-s/${id}=w${size}-h${size}">`;
const ids = rows => rows.map(row => row.url.match(/\/gps-cs-s\/(\w+)=/)?.[1]);

// Live Maps: the menu album's viewer stayed open behind a clickable Overview tab and its thumbnails were read as
// the gallery (11 menu photos and a 32 px preview), so after removing the menu photos one general photo was left.
test('general photos come from a reloaded place, never from a menu album viewer left open', async () => {
  const html = `<main role="main"><h1>Test Cafe</h1>
    <div role="tablist"><button role="tab">Genel Bakış</button><button role="tab">Hakkında</button></div>
    <button aria-label="Fotoğrafları göster" onclick="document.querySelector('#gallery').hidden = false">photos</button>
    <div id="gallery" hidden>${['g1', 'g2', 'g3'].map(id => photo(id)).join('')}</div></main>`;
  await mapsFixture(html, async (page, loads) => {
    const menu = ['m1', 'm2', 'm3', 'm4'].map(id => `https://lh3.googleusercontent.com/gps-cs-s/${id}=w112-h112`);
    await page.evaluate(urls => document.body.insertAdjacentHTML('afterbegin',
      `<div role="dialog">${urls.map(url => `<img style="width:112px;height:112px" src="${url}">`).join('')}</div>`), menu);
    const before = loads();
    const photos = await readPhotos(page, { maxImages: 3, maxScrolls: 2, waitMs: 5, overviewUrl: PLACE, exclude: menu });
    assert.equal(loads(), before + 1);
    assert.deepEqual(ids(photos.images), ['g1', 'g2', 'g3']);
  });
});

test('global Maps Menu button is never mistaken for restaurant menu', async () => {
  await fixture(`<button aria-label="Menü" onclick="this.dataset.clicked='yes'">☰</button>
    <main role="main"><h1>Restaurant</h1><img src="https://lh3.googleusercontent.com/general=w200"></main>`, async page => {
    const result = await readMenu(page, { waitMs:5 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.images.length, 0);
    assert.equal(await page.$eval('button', el => el.dataset.clicked), undefined);
  });
});

test('partial detail preserves observed assets and signals incomplete menu coverage', () => {
  const place = { source_id:'0x1:0x2', name:'Cafe', google_maps_url:'https://www.google.com/maps/place/Cafe' };
  const detail = { status:'limited_view', name:'Cafe', rating:4.5, review_count:1234,
    menu:{status:'found', coverage_complete:false, images:[{url:'https://lh3.googleusercontent.com/menu=w200',width:200,height:300}]},
    photos:{images:[{url:'https://lh3.googleusercontent.com/general=w200'}]},
    opening_hours:'Open 24 hours', opening_hours_rows:[{day:'Monday',hours:'24 hours'}], latitude:36.8, longitude:30.7 };
  const row=toObservation(place,detail);
  assert.equal(row.menu_assets.length,1);
  assert.equal(row.assets.length,1);
  assert.equal(row.maps_menu_status,'menu_partial');
  assert.equal(row.source_error,'MAPS_BROWSER_LIMITED_VIEW');
  assert.equal(row.review_count,1234);
  assert.equal(row.latitude,36.8);
  assert.equal(row.opening_hours_rows.length,1);
});

test('text-only menu categories preserve products, portions and displayed prices', async () => {
  await fixture(`<main role="main"><div role="region" aria-label="Menü">
    <div class="edOBIb"><div class="Io6YTe">Çorba</div><div class="gSkmPd">Bir porsiyon</div><h2>₺150,00</h2></div>
    <div class="edOBIb"><div class="Io6YTe">Çorba</div><div class="gSkmPd">Yarım porsiyon</div><h2>₺90,00</h2></div>
  </div></main>`, async page => {
    const result = await collectImages(page, { menuOnly:true, category:'Çorbalar', waitMs:5 });
    assert.equal(result.images.length, 0);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items[0], { name:'Çorba', description:'Bir porsiyon', price_text:'₺150,00', category:'Çorbalar' });
  });
});

test('viewer URL yields photo identity, sized image and original size', () => {
  const href = 'https://www.google.com/maps/place/X/@36.8,30.7,3a,75y,90t/data=!3m8!1e2!3m6!1sCIHM0ogKEICAgIDKj_T4qgE!2e10!3e12' +
    '!6shttps:%2F%2Flh3.googleusercontent.com%2Fgps-cs-s%2FAHRPTWma%3Dw195-h146-k-no!7i4032!8i3024!4m7!3m6!1s0x1:0x2?hl=tr';
  assert.deepEqual(viewerPhoto(href), { id: 'CIHM0ogKEICAgIDKj_T4qgE',
    url: 'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWma=w195-h146-k-no', width: 4032, height: 3024 });
  assert.equal(viewerPhoto('https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x1:0x2'), null);
  assert.equal(viewerPhoto(href.replace('lh3.googleusercontent.com', 'evil.example')), null);
});

test('viewer header month is parsed in Turkish and English, unknown stays empty', () => {
  assert.equal(photoMonth('Fotoğraf - Oca 2026'), '2026-01');
  assert.equal(photoMonth('Fotoğraf - Ağu 2023'), '2023-08');
  assert.equal(photoMonth('Photo - Sep 2020'), '2020-09');
  assert.equal(photoMonth('Video - May 2022'), '2022-05');
  assert.equal(photoMonth('Görüntünün çekilme tarihi: Haz 2024'), '2024-06');
  assert.equal(photoMonth('Image capture: Dec 2025'), '2025-12');
  assert.equal(photoMonth('Fotoğraf - Foo 2026'), '');
  assert.equal(photoMonth('11 gün önce'), '');
});

test('menu album is walked in the viewer: dates, original sizes, videos skipped, stops on disabled next', async () => {
  const photos = [['MENU_PAGE_1', 'Fotoğraf - Oca 2026', 4032, 3024, 'Görüntünün çekilme tarihi: Ara 2025'],
    ['MENU_VIDEO_1', 'Video - May 2022', 1080, 1920],
    ['MENU_PAGE_2', 'Fotoğraf - Eyl 2020', 3024, 4032]];
  await mapsFixture(galleryHtml({ photos }), async page => {
    const result = await readMenuPhotos(page, { overviewUrl: PLACE, maxImages: 20, waitMs: 20 });
    assert.equal(result.status, 'found');
    assert.equal(result.truncated, false);
    // The capture month wins over the posting month shown in the header.
    assert.deepEqual(result.images.map(row => [row.taken_at, row.width, row.height]), [['2025-12', 4032, 3024], ['2020-09', 3024, 4032]]);
    assert.ok(result.images.every(row => row.url.startsWith('https://lh3.googleusercontent.com/gps-cs-s/MENU_PAGE_')));
    assert.equal(await page.evaluate(() => document.body.dataset.popular), undefined);
  });
});

test('Menu tab 1/N strip opens and exhausts its own photo album', async () => {
  const photos = [['MENU_TAB_1', 'Fotoğraf - Oca 2026', 4032, 3024, 'Görüntünün çekilme tarihi: Ara 2025'],
    ['MENU_TAB_2', 'Fotoğraf - Şub 2026', 3024, 4032, '']];
  const html = `<main role="main"><div role="tablist">
    <button role="tab">Genel Bakış</button><button role="tab" id="menu">Menü</button>
    <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
    <div role="region" aria-label="Menü" hidden>
      <button aria-label="Fotoğraf 1/2" id="first"></button><button aria-label="Fotoğraf 2/2"></button>
    </div><div id="date"></div><div id="captured"></div>
    <button aria-label="Sonraki" jsaction="play.onRightClick" id="next">›</button>
    <script>
      const photos = ${JSON.stringify(photos)}; let index = -1;
      const show = i => {
        index = i; const [id,label,w,h,captured] = photos[i];
        const src = encodeURIComponent('https://lh3.googleusercontent.com/p/' + id + '=w195-h146-k-no');
        history.pushState(null,'','/maps/place/Test/data=!3m8!1e2!3m6!1s' + id + '!2e10!3e12!6s' + src + '!7i' + w + '!8i' + h + '!4m2!3m1!1s0x1:0x2');
        document.querySelector('#date').textContent=label; document.querySelector('#captured').textContent=captured;
        document.querySelector('#next').disabled=i===photos.length-1;
      };
      document.querySelector('#menu').onclick=()=>document.querySelector('[role=region]').hidden=false;
      document.querySelector('#first').onclick=()=>show(0);
      document.querySelector('#next').onclick=()=>show(index+1);
    </script></main>`;
  await mapsFixture(html, async page => {
    const result = await readMenuPhotos(page, { overviewUrl: PLACE, maxImages: 10, waitMs: 20 });
    assert.equal(result.status, 'found');
    assert.equal(result.source, 'menu_tab');
    assert.equal(result.expected_images, 2);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.images.map(row => [row.width,row.height,row.taken_at]), [[4032,3024,'2025-12'],[3024,4032,'2026-02']]);
  });
});

test('a wrapping viewer ends at the first repeated photo; the limit marks the album truncated', async () => {
  const photos = [['MENU_PAGE_1', 'Fotoğraf - Oca 2026', 10, 20], ['MENU_PAGE_2', 'Fotoğraf - Şub 2026', 10, 20]];
  await mapsFixture(galleryHtml({ photos, wraps: true }), async page => {
    const result = await readMenuPhotos(page, { maxImages: 20, waitMs: 20 });
    assert.equal(result.images.length, 2);
    assert.equal(result.truncated, false);
  });
  await mapsFixture(galleryHtml({ photos, wraps: true }), async page => {
    const result = await readMenuPhotos(page, { maxImages: 1, waitMs: 20 });
    assert.equal(result.images.length, 1);
    assert.equal(result.truncated, true);
  });
});

test('flat gallery without categories is unavailable after reloads, never read as menu', async () => {
  await mapsFixture(galleryHtml({ flat: true }), async (page, loads) => {
    const result = await readMenuPhotos(page, { overviewUrl: PLACE, waitMs: 20 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'MENU_CATEGORY_NOT_EXPOSED');
    assert.equal(result.images.length, 0);
    assert.equal(loads(), 3);
  });
});

test('gallery without a menu category is empty rather than unavailable', async () => {
  await mapsFixture(galleryHtml({ categories: ['Tümü', 'Yeme-içme'] }), async page => {
    const result = await readMenuPhotos(page, { waitMs: 20 });
    assert.equal(result.status, 'empty');
    assert.equal(result.reason, 'NO_MENU_CATEGORY');
  });
});

test('the cover photo the viewer opens on is never read as the first menu page', async () => {
  const photos = [['menuPageOne', 'Fotoğraf - Oca 2026', 1200, 1600], ['menuPageTwo', 'Fotoğraf - Şub 2026', 1200, 1600]];
  await mapsFixture(galleryHtml({ photos, cover: 'coverPhoto' }), async page => {
    const result = await readMenuPhotos(page, { waitMs: 20 });
    assert.equal(result.status, 'found', JSON.stringify(result));
    assert.deepEqual(result.images.map(row => row.taken_at), ['2026-01', '2026-02']);
    assert.ok(result.images.every(row => !row.url.includes('coverPhoto')));
  });
});
