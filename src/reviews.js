import { pageStatus } from './details.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const DAY = 86400000;
const UNIT_DAYS = { minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30.44, year: 365.25 };
const SORT_LABELS = {
  relevant: /^(?:en alakalı|most relevant)/i,
  newest: /^(?:en yeni|newest)/i,
  highest: /^(?:en yüksek|highest)/i,
  lowest: /^(?:en düşük|lowest)/i,
};

/**
 * Maps' data= path is a flat list of !<field><type><value> tokens; an "m" token's value counts the tokens nested
 * in it. Adding or removing a token must update every enclosing count, otherwise Google drops the place and
 * shows an empty panel. Removes leaf tokens matching `remove`, then inserts `insert` before the first token
 * matching `insertBefore`; '' when there is no such token.
 */
export function editMapsData(data, { remove = () => false, insertBefore, insert = [] } = {}) {
  const tokens = String(data).split('!').filter(Boolean).map(text => {
    const match = text.match(/^\d+([a-zA-Z])(\d*)/);
    return { text, nested: match?.[1] === 'm' ? Number(match[2]) || 0 : 0, container: match?.[1] === 'm' };
  });
  const containers = at => tokens.filter((token, index) => token.container && index < at && index + token.nested >= at);
  for (let index = tokens.length - 1; index >= 0; index--) {
    if (tokens[index].container || !remove(tokens[index].text)) continue;
    for (const token of containers(index)) token.nested--;
    tokens.splice(index, 1);
  }
  if (insert.length) {
    const at = tokens.findIndex(token => insertBefore(token.text));
    if (at < 0) return '';
    for (const token of containers(at)) token.nested += insert.length;
    tokens.splice(at, 0, ...insert.map(text => ({ text, nested: 0, container: false })));
  }
  return tokens.map(token => `!${token.container ? token.text.replace(/^(\d+m)\d*/, `$1${token.nested}`) : token.text}`).join('');
}

/** Build the same Reviews deep link Google creates when a user opens the tab. */
export function reviewsPageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname) || !url.pathname.startsWith('/maps/')) return '';
    if (/!9m1!1b1/.test(url.pathname)) return url.toString();
    const marker = url.pathname.indexOf('/data=');
    if (marker < 0) return '';
    const before = url.pathname.slice(0, marker + 6), data = url.pathname.slice(marker + 6);
    // A link copied on another tab (!10e…) opens that tab; the Reviews tab is !9m1!1b1 in the same place group.
    const edited = editMapsData(data, { remove: token => /^10e\d+$/.test(token),
      insertBefore: token => /^(?:16|19)s/.test(token), insert: ['9m1', '1b1'] });
    if (!edited) return '';
    url.pathname = `${before}${edited}`;
    return url.toString();
  } catch { return ''; }
}

/**
 * Parse Google's relative review age ("2 ay önce", "bir yıl önce düzenlendi", "3 weeks ago", "Edited a month ago").
 * Returns { amount, unit, edited } or null. Google rounds down: "2 ay önce" means 2 to 3 months old.
 */
export function parseRelativeAge(label) {
  const text = String(label || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const edited = /düzenlendi|edited/.test(text);
  const match = text.match(/(\d+|bir|an?|one)\s*(dakika|saat|gün|hafta|ay|yıl|minutes?|hours?|days?|weeks?|months?|years?)\s*(?:önce|ago)/);
  if (!match) return /^(?:dün|yesterday)/.test(text) ? { amount: 1, unit: 'day', edited } : null;
  const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
  const unit = { dakika: 'minute', saat: 'hour', gün: 'day', hafta: 'week', ay: 'month', yıl: 'year' }[match[2]] ||
    match[2].replace(/s$/, '');
  return UNIT_DAYS[unit] ? { amount, unit, edited } : null;
}

/** Approximate calendar date of a relative label (most recent possible day), YYYY-MM-DD. */
export function estimateReviewDate(label, observedAt = Date.now()) {
  const age = parseRelativeAge(label);
  if (!age) return null;
  const date = new Date(observedAt - age.amount * UNIT_DAYS[age.unit] * DAY);
  return { date: date.toISOString().slice(0, 10), precision: age.unit, edited: age.edited };
}

/** An exact timestamp is accepted only when it agrees with the label Google shows next to the review. */
export function exactDateMatchesLabel(timestampMs, label, observedAt = Date.now()) {
  const age = parseRelativeAge(label);
  if (!age || !Number.isFinite(timestampMs)) return false;
  const days = (observedAt - timestampMs) / DAY, unitDays = UNIT_DAYS[age.unit];
  const lower = Math.max(0, age.amount * unitDays * 0.85 - 2), upper = (age.amount + 1) * unitDays * 1.15 + 2;
  // An edited review shows the edit age; the original post can be older than that.
  return age.edited ? days >= lower - 2 : days >= lower && days <= upper;
}

/**
 * Exact posting time per review from Google's own responses: the first plausible epoch timestamp
 * (milliseconds or microseconds) after the review id, before the next review id appears.
 */
export function reviewTimestampsFromText(text, reviewIds, now = Date.now()) {
  const positions = [];
  for (const id of reviewIds) {
    if (!id) continue;
    let at = text.indexOf(id);
    while (at >= 0) { positions.push([at, id]); at = text.indexOf(id, at + id.length); }
  }
  positions.sort((a, b) => a[0] - b[0]);
  const found = new Map();
  for (let index = 0; index < positions.length; index++) {
    const [at, id] = positions[index];
    if (found.has(id)) continue;
    let end = Math.min(text.length, at + 6000);
    for (let next = index + 1; next < positions.length; next++) {
      if (positions[next][1] !== id) { end = Math.min(end, positions[next][0]); break; }
    }
    for (const match of text.slice(at + id.length, end).matchAll(/(?<!\d)(1\d{12}|1\d{15})(?!\d)/g)) {
      const value = Number(match[1]);
      const ms = match[1].length === 16 ? Math.floor(value / 1000) : value;
      if (ms > Date.UTC(2005, 0, 1) && ms < now + DAY) { found.set(id, ms); break; }
    }
  }
  return found;
}

function readReviewCardsDom() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const cards = [...document.querySelectorAll('.jftiEf[data-review-id]')].filter(card => card.getClientRects().length);
  const parseAbsoluteDate = raw => {
    if (!raw) return '';
    const value = String(raw).trim();
    if (/^\d{10,13}$/.test(value)) {
      const number = Number(value);
      const date = new Date(value.length === 10 ? number * 1000 : number);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }
    if (!/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value)) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  };
  return cards.map(card => {
    const reviewId = clean(card.getAttribute('data-review-id'));
    const dateNode = card.querySelector('.rsqaWe, [data-review-date], time[datetime]');
    const dateLabel = clean(dateNode?.innerText || dateNode?.textContent);
    const explicitDate = [dateNode?.getAttribute('datetime'), dateNode?.getAttribute('data-review-date'),
      dateNode?.getAttribute('data-timestamp'), dateNode?.getAttribute('title'),
      dateNode?.parentElement?.getAttribute('datetime'), dateNode?.parentElement?.getAttribute('data-review-date'),
      dateNode?.parentElement?.getAttribute('title')].map(parseAbsoluteDate).find(Boolean) || '';
    const ratingNode = card.querySelector('[role="img"][aria-label]');
    const ratingLabel = clean(ratingNode?.getAttribute('aria-label'));
    const rating = Number(ratingLabel.match(/([1-5])\s*(?:yıldız|stars?)/i)?.[1]) || 0;
    const bodyNode = card.querySelector('.wiI7pd');
    const body = clean(bodyNode?.innerText || bodyNode?.textContent)
      .replace(/\s+(?:Daha fazla|Diğer|More)$/i, '').replace(/\s*…\s*$/u, '').trim();
    const author = clean(card.querySelector('.d4r55')?.innerText || card.getAttribute('aria-label'));
    const authorDetails = clean(card.querySelector('.RfnDt')?.innerText || '');
    const profileButton = [...card.querySelectorAll('button[aria-label]')].find(button =>
      /yorum|review/i.test(button.getAttribute('aria-label') || '') &&
      !/işlemler|actions|paylaş|share|fotoğraf|photo/i.test(button.getAttribute('aria-label') || ''));
    const authorSummary = clean(profileButton?.innerText || authorDetails);
    const replyNode = card.querySelector('.CDe7pd, [aria-label*="business reply" i], [aria-label*="işletme yanıtı" i]');
    const reactionButton = [...card.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
      .find(button => /(?:like|beğenme)/i.test(button.getAttribute('aria-label') || ''));
    const likes = Number((reactionButton?.getAttribute('aria-label') || '').match(/\d+/)?.[0]) || 0;
    // Photos attached to the review (background images on photo buttons).
    const photos = [...card.querySelectorAll('button[style*="background-image"], [data-photo-index][style*="background-image"]')]
      .map(node => (getComputedStyle(node).backgroundImage.match(/url\("?(https:[^")]+)"?\)/) || [])[1]).filter(Boolean);
    // Structured parts under the text: sub-ratings ("Yiyecek: 5") and name/value rows ("Kişi başı fiyat" · "₺400–600").
    const details = [];
    for (const block of card.querySelectorAll('.PBK6be')) {
      const bold = block.querySelector('b');
      if (bold) {
        const name = clean(bold.innerText || bold.textContent).replace(/[:：]$/, '');
        const value = clean((block.innerText || block.textContent).replace(bold.innerText || bold.textContent, ''));
        if (name && value) details.push({ name, value });
        continue;
      }
      const parts = [...block.children].map(part => clean(part.innerText || part.textContent)).filter(Boolean);
      if (parts.length >= 2) details.push({ name: parts[0].replace(/[:：]$/, ''), value: parts.slice(1).join(' · ') });
    }
    const translated = [...card.querySelectorAll('button, span')].some(node =>
      /^(?:orijinali göster|show original|google tarafından çevrildi|translated by google)/i.test(clean(node.innerText)));
    return {
      review_id: reviewId,
      author,
      author_summary: authorSummary,
      rating,
      rating_label: ratingLabel,
      date_label: dateLabel,
      date_iso: explicitDate,
      date_precision: explicitDate ? 'day' : (dateLabel ? 'relative' : 'unknown'),
      edited: /düzenlendi|edited/i.test(dateLabel),
      text: body,
      details,
      translated,
      photos: [...new Set(photos)].slice(0, 20),
      owner_response: clean(replyNode?.innerText || ''),
      likes,
      language: bodyNode?.getAttribute('lang') || ''
    };
  }).filter(row => row.review_id && (row.text || row.rating));
}

// Serialized by Puppeteer: the place's Reviews tab → 'none' | 'selected' | 'clicked' ('idle' when click is false).
function reviewsTabState(click) {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter(tab => tab.getClientRects().length);
  const tablist = tabs.find(tab => {
    const list = tab.closest('[role="tablist"]');
    if (!list) return false;
    const names = [...list.querySelectorAll('[role="tab"]')].map(item => normalize(item.textContent));
    return names.some(name => /^(?:genel bakis|overview)$/.test(name)) &&
      names.some(name => /^(?:hakkinda|about)$/.test(name));
  })?.closest('[role="tablist"]');
  const tab = [...(tablist?.querySelectorAll('[role="tab"]') || [])].find(item => /^(?:yorumlar|reviews)$/.test(normalize(item.textContent)));
  if (!tab) return 'none';
  if (tab.getAttribute('aria-selected') === 'true') return 'selected';
  // Maps always marks the selected tab; without the attribute the switch cannot be checked.
  if (!tab.hasAttribute('aria-selected')) {
    if (click) tab.click();
    return 'unverifiable';
  }
  if (!click) return 'idle';
  tab.click();
  return 'clicked';
}

/**
 * The tab is drawn before Maps wires its click handler, so an early click is lost while the Overview, with its own
 * review search box and a few review cards, stays on screen. Retry until the tab really is selected.
 */
async function openReviewsTab(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await page.evaluate(reviewsTabState, true).catch(() => 'none');
    if (state === 'none') return attempt > 0;
    if (state === 'selected' || state === 'unverifiable') return true;
    const selected = await page.waitForFunction(`(${reviewsTabState})(false) === 'selected'`, { timeout: 1200 })
      .then(() => true, () => false);
    if (selected) return true;
  }
  return true;
}

/**
 * The Overview tab also shows a few review snippets with the same card markup. The real list is
 * only ready once the Reviews tab is selected and its own controls (search box / sort menu) render.
 */
// Serialized by Puppeteer. strict: the Overview's own review search box and snippet cards (ids in `snippets`)
// do not count; the list is ready once a sort control or a card that was not a snippet is visible.
function reviewListReady(snippets, strict) {
  const visible = node => !!node && node.getClientRects().length > 0;
  const label = node => (node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.innerText || '').trim();
  const controls = [...document.querySelectorAll('input, button')].filter(visible).map(label);
  const search = controls.some(text => /^(?:yorumlarda ara|search reviews)/i.test(text));
  const sort = controls.some(text => /^(?:en alakalı|en yeni|en yüksek|en düşük|most relevant|newest|highest|lowest)/i.test(text));
  // Overview snippets stay in the DOM (hidden) after switching tabs: only visible cards count.
  const cards = [...document.querySelectorAll('.jftiEf[data-review-id]')].filter(visible).map(card => card.getAttribute('data-review-id'));
  const empty = /no reviews|henüz yorum yok|yorum bulunamadı/i.test(document.body?.innerText || '');
  if (!search && !sort) return false;
  if (empty) return true;
  if (!strict) return cards.length > 0;
  return cards.length > 0 && (sort || cards.some(id => !snippets.includes(id)));
}

/**
 * The Overview also shows a review search box and a few review cards. Right after the tab switch they can still be
 * on screen, so the list counts as ready only once it differs from them; after the timeout a plain check decides.
 */
async function waitForReviewList(page, timeout, snippets = []) {
  // A Reviews tab that exists but is not selected means the Overview (or another tab) is on screen.
  const check = strict => `(${reviewsTabState})(false) !== 'idle' && (${reviewListReady})(${JSON.stringify(snippets)}, ${strict})`;
  const ready = await page.waitForFunction(check(true), { timeout }).then(() => true, () => false);
  return ready || page.evaluate(check(false)).catch(() => false);
}

/** Review cards visible on the Overview before switching tabs (none when the Reviews tab is already selected). */
const overviewSnippets = page => page.evaluate(`(${reviewsTabState})(false) === 'selected' ? [] :
  [...document.querySelectorAll('.jftiEf[data-review-id]')].filter(card => card.getClientRects().length).map(card => card.getAttribute('data-review-id'))`)
  .catch(() => []);

/** Choose a review order from Google's sort menu; returns the label shown afterwards ('' when not possible). */
async function applySort(page, sort) {
  const target = SORT_LABELS[sort];
  if (!target) return '';
  // The sort button can render a moment after the search box that marks the list as ready.
  await page.waitForFunction(source => {
    const labels = new RegExp(source, 'i');
    return [...document.querySelectorAll('button')].some(node => node.getClientRects().length &&
      labels.test((node.innerText || node.getAttribute('aria-label') || '').trim()));
  }, { timeout: 6000 }, Object.values(SORT_LABELS).map(regex => regex.source).join('|')).catch(() => {});
  const current = await page.evaluate(source => {
    const labels = new RegExp(source, 'i');
    return [...document.querySelectorAll('button')].filter(node => node.getClientRects().length)
      .map(node => (node.innerText || node.getAttribute('aria-label') || '').split(String.fromCharCode(10))[0].trim()).find(text => labels.test(text)) || '';
  }, Object.values(SORT_LABELS).map(regex => regex.source).join('|'));
  if (!current) return '';
  if (target.test(current)) return current;
  const before = await page.evaluate(() => document.querySelector('.jftiEf[data-review-id]')?.getAttribute('data-review-id') || '');
  const opened = await page.evaluate(source => {
    const labels = new RegExp(source, 'i');
    const button = [...document.querySelectorAll('button')].find(node => node.getClientRects().length &&
      labels.test((node.innerText || node.getAttribute('aria-label') || '').trim()));
    button?.click();
    return !!button;
  }, Object.values(SORT_LABELS).map(regex => regex.source).join('|'));
  if (!opened) return current;
  await page.waitForFunction(() => document.querySelector('[role="menuitemradio"], [role="menuitem"]'), { timeout: 4000 }).catch(() => {});
  const picked = await page.evaluate(source => {
    const label = new RegExp(source, 'i');
    const item = [...document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')].find(node => label.test((node.innerText || '').trim()));
    item?.click();
    return !!item;
  }, target.source);
  if (!picked) { await page.keyboard.press('Escape').catch(() => {}); return current; }
  await page.waitForFunction(first => {
    const now = document.querySelector('.jftiEf[data-review-id]')?.getAttribute('data-review-id') || '';
    return now && now !== first;
  }, { timeout: 8000 }, before).catch(() => {});
  await sleep(400);
  return page.evaluate(source => {
    const labels = new RegExp(source, 'i');
    return [...document.querySelectorAll('button')].filter(node => node.getClientRects().length)
      .map(node => (node.innerText || node.getAttribute('aria-label') || '').split(String.fromCharCode(10))[0].trim()).find(text => labels.test(text)) || '';
  }, Object.values(SORT_LABELS).map(regex => regex.source).join('|'));
}

async function expandReviewText(page) {
  const ids = await page.evaluate(() => [...document.querySelectorAll('.jftiEf[data-review-id]')]
    .filter(card => card.getClientRects().length)
    .filter(card => [...card.querySelectorAll('button[aria-label]')].some(button =>
      /^(?:daha fazla göster|daha fazla|diğer|more|see more)$/i.test((button.getAttribute('aria-label') || '').trim()) &&
      button.getAttribute('aria-expanded') !== 'true'))
    .map(card => card.getAttribute('data-review-id')).filter(Boolean));
  for (const id of ids) {
    await page.evaluate(id => {
      const card = [...document.querySelectorAll('.jftiEf[data-review-id]')].find(item => item.getAttribute('data-review-id') === id);
      const button = [...(card?.querySelectorAll('button[aria-label]') || [])].find(item =>
        /^(?:daha fazla göster|daha fazla|diğer|more|see more)$/i.test((item.getAttribute('aria-label') || '').trim()));
      button?.click();
    }, id);
  }
  if (ids.length) await sleep(180);
  return ids.length;
}

/**
 * Google loads the next page of reviews only when the end of the list is reached: jump to the bottom
 * of the review list's own scroller and wait until more cards appear (or the wait runs out).
 */
async function loadMoreReviews(page, waitMs) {
  const before = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.jftiEf[data-review-id]')].filter(card => card.getClientRects().length);
    const last = cards[cards.length - 1];
    let node = last?.parentElement, scroller = null;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (node.clientHeight > 100 && node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(style.overflowY)) { scroller = node; break; }
      node = node.parentElement;
    }
    if (!scroller) return { scroller: false, count: cards.length };
    scroller.scrollTop = scroller.scrollHeight;
    return { scroller: true, count: cards.length };
  });
  if (!before.scroller) return { scroller: false, grew: false };
  const grew = await page.waitForFunction(count => [...document.querySelectorAll('.jftiEf[data-review-id]')]
    .filter(card => card.getClientRects().length).length > count, { timeout: waitMs * 4 }, before.count).then(() => true, () => false);
  return { scroller: true, grew };
}

/**
 * Review pages arrive as streamed batchexecute responses that Maps cancels once it has parsed them, so their
 * bodies are often gone from the network log. Pausing them at the response stage copies each body before the
 * page reads it; the request then continues unchanged. Returns a function that stops the capture.
 */
async function captureDataResponses(page, keep) {
  let client;
  try {
    client = await page.createCDPSession();
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*://www.google.com/maps/*batchexecute*', requestStage: 'Response' }] });
  } catch {
    await client?.detach().catch(() => {});
    return async () => {};
  }
  const pending = new Set();
  const onPaused = event => {
    const job = (async () => {
      try {
        if (event.responseStatusCode >= 200 && event.responseStatusCode < 300) {
          const body = await client.send('Fetch.getResponseBody', { requestId: event.requestId });
          keep(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
        }
      } catch { /* a request the page cancelled meanwhile has no body */ }
      await client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {});
    })();
    pending.add(job);
    job.finally(() => pending.delete(job));
  };
  client.on('Fetch.requestPaused', onPaused);
  let stopped = false;
  return async () => {
    if (stopped) return;
    stopped = true;
    await Promise.allSettled([...pending]);
    await client.send('Fetch.disable').catch(() => {});
    client.off('Fetch.requestPaused', onPaused);
    await client.detach().catch(() => {});
  };
}

/** Read Google Maps reviews: full text, rating, author, exact date when Google sends it, owner reply. */
export async function readReviews(page, options = {}) {
  const bodies = []; let stored = 0;
  const keep = text => {
    if (stored > 80 * 1024 * 1024 || text.length > 8 * 1024 * 1024 || !/data-review-id|Ch[A-Za-z0-9_-]{20}|\d{13}/.test(text)) return;
    bodies.push(text); stored += text.length;
  };
  const onResponse = async response => {
    try {
      const type = response.request().resourceType();
      if (!['xhr', 'fetch', 'document'].includes(type) || /batchexecute/.test(response.url())) return;
      keep(await response.text());
    } catch { /* bodies of redirects or aborted requests are unavailable */ }
  };
  page.on('response', onResponse);
  const stopCapture = await captureDataResponses(page, keep);
  try {
    const result = await collectReviews(page, options);
    await stopCapture();
    if (result.reviews.length) {
      const observedAt = Date.now();
      const stamps = reviewTimestampsFromText(bodies.join('\n'), result.reviews.map(row => row.review_id), observedAt);
      for (const row of result.reviews) {
        const exact = stamps.get(row.review_id);
        if (!row.date_iso && exact && exactDateMatchesLabel(exact, row.date_label, observedAt)) {
          row.date_iso = new Date(exact).toISOString();
          row.date_precision = 'exact';
        }
        const estimate = estimateReviewDate(row.date_label, observedAt);
        row.date_estimate = row.date_iso ? row.date_iso.slice(0, 10) : estimate?.date || '';
        if (!row.date_iso && estimate) row.date_precision = estimate.precision;
        // An edited review's label dates the edit; date_iso stays the original posting time.
        if (row.edited) row.edited_estimate = estimate?.date || '';
      }
      result.exact_dates = result.reviews.filter(row => row.date_precision === 'exact').length;
    }
    return result;
  } finally {
    await stopCapture();
    page.off('response', onResponse);
  }
}

async function collectReviews(page, { overviewUrl = '', reviewCount = 0, maxReviews = 100, maxScrolls = 25, waitMs = 650,
  sort = 'relevant', listTimeoutMs = 15000, onProgress } = {}) {
  maxReviews = Math.max(1, Math.min(10000, Math.floor(Number(maxReviews) || 100)));
  maxScrolls = Math.max(1, Math.min(1000, Math.floor(Number(maxScrolls) || 25)));
  waitMs = Math.max(100, Math.min(3000, Math.floor(Number(waitMs) || 650)));
  const deepLink = overviewUrl ? reviewsPageUrl(overviewUrl) : '';
  let snippets = await overviewSnippets(page);
  let opened = await openReviewsTab(page);
  let loaded = opened && await waitForReviewList(page, listTimeoutMs, snippets);
  // Limited views hide the Reviews tab but still open Google's own review deep link. Signed-in sessions can land
  // on the Overview there, so the tab is opened on that page too.
  if (!loaded && deepLink) {
    await page.goto(deepLink, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('[role="tab"]'), { timeout: 10000 }).catch(() => {});
    snippets = await overviewSnippets(page);
    opened = await openReviewsTab(page) || opened;
    loaded = await waitForReviewList(page, Math.min(listTimeoutMs, 10000), snippets);
  }
  if (!loaded && overviewUrl) {
    await page.goto(overviewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('[role="tab"]'), { timeout: 10000 }).catch(() => {});
    snippets = await overviewSnippets(page);
    opened = await openReviewsTab(page) || opened;
    loaded = opened && await waitForReviewList(page, listTimeoutMs, snippets);
  }
  if (!loaded) {
    const currentStatus = await pageStatus(page).catch(() => 'unavailable');
    const explicitlyEmpty = await page.evaluate(() => /no reviews|henüz yorum yok|yorum bulunamadı/i.test(document.body?.innerText || '')).catch(() => false);
    const available = currentStatus === 'ok' && explicitlyEmpty;
    const result = { status: available ? 'empty' : 'unavailable', reviews: [], total_count: reviewCount || 0,
      collected_count: 0, requested_limit: maxReviews, truncated: !available, coverage_complete: available,
      reason: currentStatus !== 'ok' ? currentStatus.toUpperCase() : explicitlyEmpty ? '' : opened ? 'REVIEW_CARDS_NOT_LOADED' : 'REVIEW_TAB_NOT_FOUND' };
    if (onProgress) await onProgress({ stage: 'reviews', ...result }, page);
    return result;
  }
  let sortLabel = sort === 'relevant' ? '' : await applySort(page, sort);
  // On a slow page the menu can close before the choice registers: one more try.
  if (SORT_LABELS[sort] && sort !== 'relevant' && !SORT_LABELS[sort].test(sortLabel)) sortLabel = await applySort(page, sort);

  const reviews = new Map();
  let exhausted = false, limitReached = false, scrolls = 0, stalled = 0;
  for (let attempt = 0; attempt <= maxScrolls; attempt++) {
    await expandReviewText(page);
    for (const row of await page.evaluate(readReviewCardsDom)) reviews.set(row.review_id, row);
    if (onProgress) await onProgress({ stage: 'reviews', collected: reviews.size, total: reviewCount || null }, page);
    if (reviews.size >= maxReviews) { limitReached = true; break; }
    if (reviewCount && reviews.size >= reviewCount) { exhausted = true; break; }
    if (attempt === maxScrolls) break;
    const step = await loadMoreReviews(page, waitMs);
    if (!step.scroller) { exhausted = true; break; }
    scrolls++;
    stalled = step.grew ? 0 : stalled + 1;
    // Three end-of-list waits in a row without new cards: Google has nothing more to send.
    if (stalled >= 3) { exhausted = true; break; }
  }
  await expandReviewText(page);
  for (const row of await page.evaluate(readReviewCardsDom)) reviews.set(row.review_id, row);

  const rows = [...reviews.values()].slice(0, maxReviews);
  const finalSort = sortLabel || await page.evaluate(source => {
    const labels = new RegExp(source, 'i');
    return [...document.querySelectorAll('button')].filter(node => node.getClientRects().length)
      .map(node => (node.innerText || node.getAttribute('aria-label') || '').split(String.fromCharCode(10))[0].trim()).find(text => labels.test(text)) || '';
  }, Object.values(SORT_LABELS).map(regex => regex.source).join('|'));
  const knownTotal = Math.max(0, Number(reviewCount) || 0);
  const knownComplete = knownTotal > 0 && rows.length >= knownTotal;
  const truncated = !knownComplete && (limitReached || !exhausted || knownTotal > rows.length);
  return { status: rows.length ? 'found' : 'empty', reviews: rows, total_count: knownTotal,
    collected_count: rows.length, requested_limit: maxReviews, scrolls, sort_label: finalSort,
    sort_applied: sort === 'relevant' || !SORT_LABELS[sort] || SORT_LABELS[sort].test(finalSort),
    truncated, coverage_complete: rows.length > 0 && (knownComplete || (exhausted && !knownTotal)) };
}
