import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../src/maps.js';
import { readReviews, reviewsPageUrl, parseRelativeAge, estimateReviewDate, exactDateMatchesLabel, reviewTimestampsFromText } from '../src/reviews.js';

test('review route matches the Reviews deep link used by Google Maps', () => {
  const url = 'https://www.google.com/maps/place/Cafe/data=!4m7!3m6!1s0xabc:0xdef!8m2!3d36.8!4d30.7!10e9!16s%2Fg%2F1abc?hl=tr';
  // Same shape Google uses when the Reviews tab is opened: the enclosing counts grow with the inserted tokens.
  assert.equal(reviewsPageUrl(url), 'https://www.google.com/maps/place/Cafe/data=!4m8!3m7!1s0xabc:0xdef!8m2!3d36.8!4d30.7!9m1!1b1!16s%2Fg%2F1abc?hl=tr');
  assert.equal(reviewsPageUrl('https://www.google.com/maps/place/Cafe/data=!4m6!3m5!1s0xabc:0xdef!8m2!3d36.8!4d30.7!16s%2Fg%2F1abc'),
    'https://www.google.com/maps/place/Cafe/data=!4m8!3m7!1s0xabc:0xdef!8m2!3d36.8!4d30.7!9m1!1b1!16s%2Fg%2F1abc');
  assert.equal(reviewsPageUrl('https://evil.test/maps/place/Cafe/data=!16s%2Fg%2F1abc'), '');
});

test('review reader opens the tab, expands full text, and preserves the displayed date and metadata', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main">
      <div role="tablist"><button role="tab">Genel Bakış</button><button role="tab">Menü</button>
        <button role="tab" id="reviews">Yorumlar</button><button role="tab">Hakkında</button></div>
      <div id="review-panel" style="height:220px;overflow:auto">
        <div class="jftiEf" data-review-id="review-1" aria-label="Ada Yılmaz">
          <button aria-label="Ada Yılmaz 12 yorum · 3 fotoğraf"><span class="d4r55">Ada Yılmaz</span></button>
          <div class="DU9Pgb"><span role="img" aria-label="5 yıldız"></span><span class="rsqaWe" datetime="2026-08-01T00:00:00Z">2 ay önce düzenlendi</span></div>
          <div><span class="wiI7pd" lang="tr">Kısa metin…</span><button aria-label="Daha fazla göster" aria-expanded="false">Daha fazla</button></div>
          <div class="CDe7pd">Yanıtınız için teşekkür ederiz</div>
          <button aria-label="3 beğenme">Beğen</button>
        </div>
        <div class="jftiEf" data-review-id="review-2" aria-label="Can Demir">
          <span class="d4r55">Can Demir</span>
          <div class="DU9Pgb"><span role="img" aria-label="4 stars"></span><span class="rsqaWe">1 week ago</span></div>
          <span class="wiI7pd" lang="en">Food was great.</span>
        </div>
      </div>
      <button aria-label="En alakalı">En alakalı</button>
      <script>
        document.querySelector('#reviews').onclick = event => event.currentTarget.setAttribute('aria-selected','true');
        const more = document.querySelector('[aria-label="Daha fazla göster"]');
        more.onclick = () => { document.querySelector('.wiI7pd').textContent = 'Tam ve eksiksiz yorum metni.'; more.setAttribute('aria-expanded','true'); };
      </script>
    </main>`);
    const result = await readReviews(page, { reviewCount: 2, maxReviews: 10, waitMs: 100, maxScrolls: 5 });
    assert.equal(result.status, 'found', JSON.stringify(result));
    assert.equal(result.collected_count, 2);
    assert.equal(result.truncated, false);
    assert.equal(result.coverage_complete, true);
    assert.equal(result.reviews[0].author, 'Ada Yılmaz');
    assert.equal(result.reviews[0].rating, 5);
    assert.equal(result.reviews[0].text, 'Tam ve eksiksiz yorum metni.');
    assert.equal(result.reviews[0].date_label, '2 ay önce düzenlendi');
    assert.equal(result.reviews[0].date_iso, '2026-08-01T00:00:00.000Z');
    assert.equal(result.reviews[0].date_precision, 'day');
    assert.equal(result.reviews[0].edited, true);
    assert.equal(result.reviews[0].owner_response, 'Yanıtınız için teşekkür ederiz');
    assert.equal(result.reviews[0].likes, 3);
    assert.equal(result.reviews[1].date_label, '1 week ago');
    assert.equal(result.reviews[1].date_iso, '');
    assert.equal(result.reviews[1].date_precision, 'week');
    assert.match(result.reviews[1].date_estimate, /^\d{4}-\d{2}-\d{2}$/);
  } finally { await page.close(); await browser.close(); }
});

test('review reader reports a requested cap as truncated when more reviews are known', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    const cards = Array.from({ length: 3 }, (_, index) => `<div class="jftiEf" data-review-id="r${index}" aria-label="User ${index}">
      <span class="d4r55">User ${index}</span><span role="img" aria-label="5 yıldız"></span>
      <span class="rsqaWe">1 ay önce</span><span class="wiI7pd">Yorum ${index}</span></div>`).join('');
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Menü</button><button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <button aria-label="En alakalı">En alakalı</button><div style="height:180px;overflow:auto">${cards}</div></main>`);
    const result = await readReviews(page, { reviewCount: 8, maxReviews: 2, maxScrolls: 2, waitMs: 100 });
    assert.equal(result.collected_count, 2);
    assert.equal(result.truncated, true);
    assert.equal(result.coverage_complete, false);
  } finally { await page.close(); await browser.close(); }
});

test('review limits support places with more than 2,000 reviews', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <button aria-label="En alakalı">En alakalı</button><div style="height:300px;overflow:auto">${Array.from({length:3},(_,i)=>`<div class="jftiEf" data-review-id="r${i}">
      <span class="d4r55">User ${i}</span><span role="img" aria-label="5 yıldız"></span>
      <span class="rsqaWe">2 ay önce</span><span class="wiI7pd">Yorum ${i}</span></div>`).join('')}</div></main>`);
    const result = await readReviews(page, { reviewCount: 2548, maxReviews: 2548, maxScrolls: 1, waitMs: 100 });
    assert.equal(result.requested_limit, 2548);
    assert.equal(result.collected_count, 3);
    assert.equal(result.truncated, true);
    assert.equal(result.coverage_complete, false);
  } finally { await page.close(); await browser.close(); }
});

test('a limited Maps view is unavailable, never reported as an empty complete review set', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main">
      <div role="tablist"><button role="tab">Genel Bakış</button><button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <p>Google Haritalar'ın sınırlı görünümünü görüyorsunuz. Daha fazla göster</p>
    </main>`);
    const result = await readReviews(page, { maxReviews: 10, waitMs: 100, maxScrolls: 1, listTimeoutMs: 800 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'LIMITED_VIEW');
    assert.equal(result.coverage_complete, false);
    assert.equal(result.truncated, true);
  } finally { await page.close(); await browser.close(); }
});

test('a limited page without a Reviews tab reports the actual access limitation', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><p>Google Haritalar'ın sınırlı görünümünü görüyorsunuz</p></main>`);
    const result = await readReviews(page, { reviewCount: 2548, maxReviews: 10, waitMs: 100, maxScrolls: 1, listTimeoutMs: 800 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'LIMITED_VIEW');
    assert.equal(result.coverage_complete, false);
  } finally { await page.close(); await browser.close(); }
});

test('no visible cards without an explicit no-reviews message is unavailable', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div><p>Yorumlar yükleniyor</p></main>`);
    const result = await readReviews(page, { maxReviews: 10, waitMs: 100, maxScrolls: 1, listTimeoutMs: 800 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'REVIEW_CARDS_NOT_LOADED');
    assert.equal(result.coverage_complete, false);
  } finally { await page.close(); await browser.close(); }
});

test('relative ages, approximate dates and exact-date sanity check', () => {
  assert.deepEqual(parseRelativeAge('2 ay önce düzenlendi'), { amount: 2, unit: 'month', edited: true });
  assert.deepEqual(parseRelativeAge('bir yıl önce'), { amount: 1, unit: 'year', edited: false });
  assert.deepEqual(parseRelativeAge('3 weeks ago'), { amount: 3, unit: 'week', edited: false });
  assert.deepEqual(parseRelativeAge('Edited a month ago'), { amount: 1, unit: 'month', edited: true });
  assert.equal(parseRelativeAge(''), null);
  const now = Date.UTC(2026, 8, 29);
  assert.deepEqual(estimateReviewDate('2 ay önce', now), { date: '2026-07-30', precision: 'month', edited: false });
  assert.equal(exactDateMatchesLabel(Date.UTC(2026, 6, 10), '2 ay önce', now), true);
  assert.equal(exactDateMatchesLabel(Date.UTC(2025, 0, 10), '2 ay önce', now), false, 'a far older stamp belongs to something else');
  assert.equal(exactDateMatchesLabel(Date.UTC(2026, 3, 1), '2 ay önce düzenlendi', now), true, 'edited: original post may be older');
});

test('exact timestamps are read after each review id and never borrowed from the next review', () => {
  const text = '[["ChdAAA",null,"x",1751234567890123,["ChdBBB"],"y"],["ChdBBB",["z",1740000000000]],["ChdCCC","no stamp"]]';
  const stamps = reviewTimestampsFromText(text, ['ChdAAA', 'ChdBBB', 'ChdCCC'], Date.UTC(2026, 8, 29));
  assert.equal(new Date(stamps.get('ChdAAA')).toISOString().slice(0, 10), '2025-06-29');
  assert.equal(new Date(stamps.get('ChdBBB')).toISOString().slice(0, 10), '2025-02-19');
  assert.equal(stamps.has('ChdCCC'), false);
});

test('reaching the end of the list loads more reviews; rating-only reviews are kept', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <button aria-label="En alakalı">En alakalı</button>
      <div id="list" style="height:200px;overflow:auto"></div>
      <script>
        let next = 0;
        const add = count => { for (let i = 0; i < count && next < 25; i++, next++) {
          const card = document.createElement('div'); card.className = 'jftiEf'; card.setAttribute('data-review-id', 'r' + next);
          card.style.height = '60px';
          card.innerHTML = '<span class="d4r55">U' + next + '</span><span role="img" aria-label="' + (next % 5 + 1) + ' yıldız"></span>' +
            '<span class="rsqaWe">' + (next + 1) + ' hafta önce</span>' + (next % 4 ? '<span class="wiI7pd">Yorum ' + next + '</span>' : '');
          document.querySelector('#list').appendChild(card); } };
        add(10);
        const list = document.querySelector('#list');
        list.addEventListener('scroll', () => { if (list.scrollTop + list.clientHeight >= list.scrollHeight - 5) setTimeout(() => add(10), 150); });
      </script></main>`);
    const result = await readReviews(page, { reviewCount: 25, maxReviews: 100, maxScrolls: 10, waitMs: 200 });
    assert.equal(result.collected_count, 25);
    assert.equal(result.coverage_complete, true);
    assert.equal(result.truncated, false);
    assert.equal(result.reviews.filter(row => !row.text && row.rating).length, 7, 'rating-only reviews are not dropped');
  } finally { await page.close(); await browser.close(); }
});

test('"newest" sort is chosen from Google\'s sort menu before reading', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <button id="sort">En alakalı</button><div id="menu"></div>
      <div id="list" style="height:300px;overflow:auto"><div class="jftiEf" data-review-id="old"><span class="d4r55">Eski</span>
        <span role="img" aria-label="4 yıldız"></span><span class="rsqaWe">bir yıl önce</span><span class="wiI7pd">Eski yorum</span></div></div>
      <script>
        document.querySelector('#sort').onclick = () => { document.querySelector('#menu').innerHTML =
          '<div role="menuitemradio">En alakalı</div><div role="menuitemradio" id="newest">En yeni</div>';
          document.querySelector('#newest').onclick = () => { document.querySelector('#sort').textContent = 'En yeni';
            document.querySelector('#menu').innerHTML = '';
            document.querySelector('#list').innerHTML = '<div class="jftiEf" data-review-id="new"><span class="d4r55">Yeni</span>' +
              '<span role="img" aria-label="5 yıldız"></span><span class="rsqaWe">2 gün önce</span><span class="wiI7pd">Yeni yorum</span></div>'; }; };
      </script></main>`);
    const result = await readReviews(page, { reviewCount: 1, maxReviews: 5, maxScrolls: 1, waitMs: 100, sort: 'newest' });
    assert.equal(result.sort_label, 'En yeni');
    assert.deepEqual(result.reviews.map(row => row.review_id), ['new']);
  } finally { await page.close(); await browser.close(); }
});

test('hidden overview snippets do not count as the review list, and a late sort button is still used', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab" id="reviews">Yorumlar</button><button role="tab">Hakkında</button></div>
      <div style="display:none"><div class="jftiEf" data-review-id="snippet"><span class="d4r55">Özet</span>
        <span role="img" aria-label="5 yıldız"></span><span class="wiI7pd">Genel bakış özeti</span></div></div>
      <input aria-label="Yorumlarda ara"><div id="menu"></div><div id="list" style="height:300px;overflow:auto"></div>
      <script>
        const card = (id, label) => '<div class="jftiEf" data-review-id="' + id + '"><span class="d4r55">' + id + '</span>' +
          '<span role="img" aria-label="5 yıldız"></span><span class="rsqaWe">' + label + '</span><span class="wiI7pd">Metin ' + id + '</span></div>';
        // The real list and its sort button render a moment after the search box.
        setTimeout(() => { document.querySelector('#list').innerHTML = card('relevant', 'bir yıl önce'); }, 700);
        setTimeout(() => {
          const sort = document.createElement('button'); sort.id = 'sort'; sort.textContent = 'En alakalı';
          document.querySelector('main').insertBefore(sort, document.querySelector('#menu'));
          sort.onclick = () => { document.querySelector('#menu').innerHTML = '<div role="menuitemradio" id="newest">En yeni</div>';
            document.querySelector('#newest').onclick = () => { sort.textContent = 'En yeni'; document.querySelector('#menu').innerHTML = '';
              document.querySelector('#list').innerHTML = card('newest', '2 gün önce'); }; };
        }, 1600);
      </script></main>`);
    const result = await readReviews(page, { reviewCount: 1, maxReviews: 5, maxScrolls: 1, waitMs: 100, sort: 'newest' });
    assert.equal(result.status, 'found', JSON.stringify(result));
    assert.equal(result.sort_label, 'En yeni');
    assert.equal(result.sort_applied, true);
    assert.deepEqual(result.reviews.map(row => row.review_id), ['newest']);
  } finally { await page.close(); await browser.close(); }
});

test('a requested order that Maps does not offer is reported as not applied', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab">Genel Bakış</button>
      <button role="tab">Yorumlar</button><button role="tab">Hakkında</button></div>
      <button>En alakalı</button><div style="height:300px;overflow:auto"><div class="jftiEf" data-review-id="a"><span class="d4r55">A</span>
        <span role="img" aria-label="4 yıldız"></span><span class="rsqaWe">bir ay önce</span><span class="wiI7pd">Yorum</span></div></div></main>`);
    const result = await readReviews(page, { reviewCount: 1, maxReviews: 5, maxScrolls: 1, waitMs: 100, sort: 'newest' });
    assert.equal(result.status, 'found');
    assert.equal(result.sort_label, 'En alakalı');
    assert.equal(result.sort_applied, false);
  } finally { await page.close(); await browser.close(); }
});

test('Maps data edits keep every enclosing count consistent', async () => {
  const { editMapsData } = await import('../src/reviews.js');
  // Search results carry an extra !19s place id after !16s inside the same group.
  assert.equal(editMapsData('!4m7!3m6!1s0x1:0x2!8m2!3d1!4d2!16s%2Fg%2Fx!19sChIJabc', { insertBefore: token => /^16s/.test(token), insert: ['9m1', '1b1'] }),
    '!4m9!3m8!1s0x1:0x2!8m2!3d1!4d2!9m1!1b1!16s%2Fg%2Fx!19sChIJabc');
  assert.equal(editMapsData('!3m4!1sA!8m2!3d1!4d2!5m1!1e1', { remove: token => token === '4d2' }), '!3m3!1sA!8m1!3d1!5m1!1e1');
  assert.equal(editMapsData('!3m1!1sA', { insertBefore: token => /^16s/.test(token), insert: ['9m1'] }), '');
});

test('an early Reviews tab click lost before Maps wires it is retried; overview snippets are not the list', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    const card = id => `<div class="jftiEf" data-review-id="${id}"><span class="d4r55">${id}</span>
      <span role="img" aria-label="5 yıldız"></span><span class="rsqaWe">bir ay önce</span><span class="wiI7pd">Metin ${id}</span></div>`;
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab" aria-selected="true">Genel Bakış</button>
      <button role="tab" id="reviews" aria-selected="false">Yorumlar</button><button role="tab">Hakkında</button></div>
      <section id="overview"><input aria-label="Yorumlarda arayın">${['s1', 's2', 's3'].map(card).join('')}</section>
      <section id="list" hidden><button>En alakalı</button><div style="height:300px;overflow:auto">${['r1', 'r2', 'r3', 'r4', 'r5'].map(card).join('')}</div></section>
      <script>
        // Maps wires the tab a moment after drawing it: the first click does nothing.
        setTimeout(() => { document.querySelector('#reviews').onclick = event => {
          event.currentTarget.setAttribute('aria-selected', 'true');
          document.querySelector('#overview').hidden = true; document.querySelector('#list').hidden = false; }; }, 800);
      </script></main>`);
    const result = await readReviews(page, { reviewCount: 5, maxReviews: 10, maxScrolls: 1, waitMs: 100 });
    assert.deepEqual(result.reviews.map(row => row.review_id), ['r1', 'r2', 'r3', 'r4', 'r5']);
  } finally { await page.close(); await browser.close(); }
});

test('overview snippets are never returned as reviews while the Reviews tab stays unselected', async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    const card = id => `<div class="jftiEf" data-review-id="${id}"><span class="d4r55">${id}</span>
      <span role="img" aria-label="5 yıldız"></span><span class="rsqaWe">bir ay önce</span><span class="wiI7pd">Metin ${id}</span></div>`;
    await page.setContent(`<main role="main"><div role="tablist"><button role="tab" aria-selected="true">Genel Bakış</button>
      <button role="tab" aria-selected="false">Yorumlar</button><button role="tab" aria-selected="false">Hakkında</button></div>
      <input aria-label="Yorumlarda arayın">${['s1', 's2', 's3'].map(card).join('')}</main>`);
    const result = await readReviews(page, { reviewCount: 50, maxReviews: 10, maxScrolls: 1, waitMs: 100, listTimeoutMs: 1500 });
    assert.equal(result.status, 'unavailable', JSON.stringify(result));
    assert.equal(result.reason, 'REVIEW_CARDS_NOT_LOADED');
    assert.equal(result.reviews.length, 0);
  } finally { await page.close(); await browser.close(); }
});
