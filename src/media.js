const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = (value, fallback, max = 200) => Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));

export function imageUrl(value) {
  try {
    const url = new URL(value, 'https://www.google.com');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    if (!/(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(url.hostname)) return '';
    if (/^\/(?:a(?:-|\/|$)|ogw\/)/.test(url.pathname)) return '';
    url.hash = '';
    return url.toString();
  } catch { return ''; }
}

export function imageIdentity(value) {
  return imageUrl(value).replace(/=(?:w\d+(?:-h\d+)?|h\d+(?:-w\d+)?|s\d+)(?:-[a-z0-9]+)*(?=\?|$)/i, '');
}

export function fullImageUrl(value) {
  const safe = imageUrl(value);
  // Width-only keeps portrait menu pages uncropped. Keep the observed URL as a fallback.
  return safe.replace(/=(?:w\d+(?:-h\d+)?|h\d+(?:-w\d+)?|s\d+)(?:-[a-z0-9]+)*(?=\?|$)/i, '=w1200-k-no');
}

const MONTHS = { oca: 1, jan: 1, şub: 2, feb: 2, mar: 3, nis: 4, apr: 4, may: 5, haz: 6, jun: 6,
  tem: 7, jul: 7, ağu: 8, aug: 8, eyl: 9, sep: 9, eki: 10, oct: 10, kas: 11, nov: 11, ara: 12, dec: 12 };

/**
 * Photo viewer dates → "2026-01" ("" when unknown): the header "Fotoğraf - Oca 2026" (posted)
 * and the footer "Görüntünün çekilme tarihi: Haz 2024" (captured), also in English.
 */
export function photoMonth(label) {
  const match = String(label || '').trim()
    .match(/^(?:(?:fotoğraf|photo|video)\s*[-–·]|görüntünün çekilme tarihi:|image capture:)\s*(\S+?)\.?\s+(\d{4})$/i);
  const month = match && MONTHS[match[1].toLocaleLowerCase('tr').slice(0, 3)];
  return month ? `${match[2]}-${String(month).padStart(2, '0')}` : '';
}

/**
 * The Maps photo viewer draws the photo on a canvas but keeps it in the URL: photo id
 * (!1s…!2e10), a sized image URL (!6s…) and the original size (!7i…!8i…).
 */
export function viewerPhoto(href) {
  const value = String(href || '');
  const id = value.match(/!1s([\w-]{6,})!2e10(?:!|$)/);
  const source = value.match(/!6s(https?(?::|%3A)[^!?#]+)/i);
  if (!id || !source) return null;
  let url;
  try { url = imageUrl(decodeURIComponent(source[1])); } catch { return null; }
  if (!url) return null;
  const size = value.match(/!7i(\d{1,6})!8i(\d{1,6})/);
  return { id: id[1], url, width: size ? Number(size[1]) : 0, height: size ? Number(size[2]) : 0 };
}

async function clickControl(page, kind, wanted = '') {
  const handle = await page.evaluateHandle((kind, wanted) => {
    const norm = value => String(value || '').trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mainName = /^(genel bakıs|genel bakış|overview|yorumlar|reviews|hakkında|about|menu(?: ve one cıkanlar)?|menu & highlights)$/;
    const isMain = el => {
      const tabs = [...(el.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') || [])];
      return tabs.some(tab => /^(genel bakıs|genel bakış|overview)$/.test(norm(tab.textContent))) &&
        tabs.some(tab => /^(hakkında|about|yorumlar|reviews|menu)$/.test(norm(tab.textContent)));
    };
    return [...document.querySelectorAll('[role="tab"], button, [role="button"]')].find(el => {
      if (!el.getClientRects().length || el.getAttribute('aria-disabled') === 'true') return false;
      const text = norm(el.textContent), label = norm(el.getAttribute('aria-label'));
      if (kind === 'mainMenu') return el.getAttribute('role') === 'tab' && isMain(el) && /^menu(?:$| ve | & )/.test(text);
      if (kind === 'overview') return el.getAttribute('role') === 'tab' && isMain(el) && /^(genel bakıs|genel bakış|overview)$/.test(text);
      if (kind === 'photos') return /^(fotografları goster|show photos|all photos|tum fotograflar)$/.test(label || text.replace(/^[\s-]+/, '')) ||
        el.getAttribute('role') === 'tab' && /^(fotograflar|photos)$/.test(text);
      if (kind === 'allPhotos') return !isMain(el) && /^(tumu|all|tum fotograflar|all photos)$/.test(text || label);
      if (kind === 'category') return !isMain(el) && !mainName.test(text) && norm(wanted) === (text || label);
      return false;
    }) || null;
  }, kind, wanted);
  try {
    const element = handle.asElement();
    if (!element) return false;
    await element.click();
    await sleep(600);
    return true;
  } finally { await handle.dispose(); }
}

export async function collectImages(page, { category = 'general', maxImages = 20, maxScrolls = 20, waitMs = 450, menuOnly = false, exclude = [] } = {}) {
  maxImages = bounded(maxImages, 20);
  maxScrolls = bounded(maxScrolls, 20, 100);
  // Skipped while collecting (e.g. menu photos in the gallery), so they never use up maxImages.
  const skip = new Set(exclude.map(imageIdentity));
  const images = new Map(), items = new Map();
  let expectedImages = 0;
  let stable = 0, exhausted = false, limitReached = false;
  for (let attempt = 0; attempt <= maxScrolls; attempt++) {
    const raw = await page.evaluate(menuOnly => {
      // Google uses both <img> and CSS backgrounds, including 32px viewer previews.
      const result = [], items = [];
      const menuRegion = [...document.querySelectorAll('[role="region"]')].find(el => /^(menü|menu)$/i.test(el.getAttribute('aria-label') || ''));
      const mediaScope = menuOnly ? menuRegion : document;
      let expectedImages = 0;
      if (menuOnly && menuRegion) {
        // The Menu tab strip says "Fotoğraf 1/12" but renders only a few thumbnails. The album
        // itself is read in the photo viewer (readMenuPhotos); its size stays as evidence.
        for (const button of menuRegion.querySelectorAll('button[aria-label]')) {
          const count = (button.getAttribute('aria-label') || '').match(/^(?:Fotoğraf|Photo)\s+\d+\/(\d+)$/i);
          if (count) expectedImages = Math.max(expectedImages, Number(count[1]));
        }
        for (const row of menuRegion.querySelectorAll('.edOBIb')) {
          const name = row.querySelector('.Io6YTe')?.textContent?.trim();
          if (!name) continue;
          items.push({ name, description: row.querySelector('.gSkmPd')?.textContent?.trim() || '',
            price_text: row.querySelector('h2')?.textContent?.trim() || '' });
        }
      }
      for (const el of mediaScope?.querySelectorAll('img, [style*="background"], [data-src]') || []) {
        if (el.closest('[role="banner"], #gb, [data-review-id], a[href*="/maps/contrib/"]')) continue;
        // Menu mode keeps only a structured menu item's own photo, never the strip or highlights.
        if (menuOnly && !el.closest('.edOBIb')) continue;
        const visible = !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        if (!visible && !el.matches('img.QUPxxe, img.kSOdnb')) continue;
        const label = el.closest('button, [role="button"]')?.getAttribute('aria-label') || el.getAttribute('alt') || '';
        const background = getComputedStyle(el).backgroundImage;
        const urls = [el.currentSrc, el.getAttribute('src'), el.getAttribute('data-src')].filter(Boolean);
        for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.push(match[1]);
        for (const url of urls) result.push({ url, width: el.naturalWidth || Math.round(el.getBoundingClientRect().width) || 0,
          height: el.naturalHeight || Math.round(el.getBoundingClientRect().height) || 0, label });
      }
      return { images: result, items, expectedImages };
    }, menuOnly);
    const before = images.size + items.size;
    expectedImages = Math.max(expectedImages, raw.expectedImages);
    for (const row of raw.items) items.set(JSON.stringify([category, row.name, row.description, row.price_text]), { ...row, category });
    for (const item of raw.images) {
      const url = imageUrl(item.url), id = imageIdentity(url);
      if (!id || skip.has(id)) continue;
      const existing = images.get(id);
      const row = { ...item, url, category };
      if (!existing || row.width * row.height > existing.width * existing.height) images.set(id, row);
    }
    if (images.size >= maxImages) { limitReached = true; break; }
    stable = images.size + items.size === before ? stable + 1 : 0;
    const moved = await page.evaluate(menuOnly => {
      const candidates = [...document.querySelectorAll('[role="main"], [role="feed"], [role="tabpanel"], [role="dialog"], div')]
        .filter(el => ((el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(el).overflowY)) ||
          (el.clientWidth > 100 && el.scrollWidth > el.clientWidth + 8 && /auto|scroll/.test(getComputedStyle(el).overflowX))) &&
          (el.querySelector('img, [style*="background"]') || el.getAttribute('role') === 'feed' ||
            menuOnly && /^(menü|menu)$/i.test(el.getAttribute('aria-label') || '')));
      // Only media-bearing panels; never scroll the map canvas or unrelated page widgets.
      let moved = false;
      for (const el of candidates.slice(0, 8)) {
        const top = el.scrollTop, left = el.scrollLeft;
        const style = getComputedStyle(el);
        el.scrollBy(/auto|scroll/.test(style.overflowX) ? Math.max(200, el.clientWidth * 0.8) : 0,
          /auto|scroll/.test(style.overflowY) ? Math.max(300, el.clientHeight * 0.8) : 0);
        moved ||= top !== el.scrollTop || left !== el.scrollLeft;
      }
      return moved;
    }, menuOnly);
    if (!moved && stable >= 3) { exhausted = true; break; }
    if (attempt < maxScrolls) await sleep(waitMs);
  }
  return { images: [...images.values()].slice(0, maxImages), items: [...items.values()], expected_images: expectedImages,
    exhausted, truncated: limitReached || !exhausted };
}

async function mediaStatus(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    if (/unusual traffic|olağan dışı trafik|captcha|robot olmadığınızı/i.test(text)) return 'blocked';
    if (location.hostname === 'accounts.google.com' || document.querySelector('input[type="password"], input#identifierId')) return 'auth_required';
    if (/sınırlı görünüm|limited view/i.test(text)) return 'limited_view';
    return 'ok';
  });
}

async function openOverview(page, overviewUrl) {
  await page.goto(overviewUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[jsaction*="heroHeaderImage"], h1', { timeout: 12000 }).catch(() => {});
  await sleep(500);
}

const heroVisible = page => page.evaluate(() =>
  [...document.querySelectorAll('button[jsaction*="heroHeaderImage"]')].some(el => el.getClientRects().length));

/**
 * Cover photo → photo gallery → its "Menü" category. The gallery lists Google's photo
 * categories (Tümü, En son, Menü, …) as tabs; a limited view sometimes gets a
 * flat photo list without categories instead.
 */
async function openMenuCategory(page) {
  const opened = await page.evaluate(() => {
    const cover = [...document.querySelectorAll('button[jsaction*="heroHeaderImage"]')].find(el => el.getClientRects().length);
    cover?.click();
    return !!cover;
  });
  if (!opened) return 'PHOTO_GALLERY_NOT_EXPOSED';
  let gallery = await page.waitForFunction(() => {
    const categories = [...document.querySelectorAll('[role="tablist"]')]
      .some(list => [...list.querySelectorAll('[role="tab"]')].some(tab => /^(tümü|all)$/i.test(tab.textContent.trim())));
    return categories ? 'tabs' : document.querySelector('a[data-photo-index]') ? 'tiles' : false;
  }, { timeout: 8000, polling: 250 }).then(handle => handle.jsonValue(), () => 'none');
  // Photo tiles can render just before the category tabs.
  if (gallery === 'tiles') gallery = await page.waitForFunction(() => [...document.querySelectorAll('[role="tablist"]')]
    .some(list => [...list.querySelectorAll('[role="tab"]')].some(tab => /^(tümü|all)$/i.test(tab.textContent.trim()))),
  { timeout: 2000, polling: 250 }).then(() => 'tabs', () => 'flat');
  if (gallery !== 'tabs') return gallery === 'flat' ? 'MENU_CATEGORY_NOT_EXPOSED' : 'PHOTO_GALLERY_NOT_EXPOSED';
  // The viewer opened on the cover photo; its id tells when the Menu category's first photo is really shown.
  const cover = await page.evaluate(() => location.href.match(/!1s([\w-]{6,})!2e10(?:!|$)/)?.[1] || '');
  const selected = await page.evaluate(() => {
    const list = [...document.querySelectorAll('[role="tablist"]')]
      .find(list => [...list.querySelectorAll('[role="tab"]')].some(tab => /^(tümü|all)$/i.test(tab.textContent.trim())));
    const tab = [...(list?.querySelectorAll('[role="tab"]') || [])].find(tab => /^(menü|menu)$/i.test(tab.textContent.trim()));
    tab?.click();
    return !!tab;
  });
  if (!selected) return 'NO_MENU_CATEGORY';
  // The viewer then switches to the category's first photo (after up to ~2 s). The URL can change before the
  // photo does, so wait for a different photo id; otherwise the cover photo would be read as the first menu page.
  await page.waitForFunction(previous => {
    const id = location.href.match(/!1s([\w-]{6,})!2e10(?:!|$)/)?.[1] || '';
    return !!id && id !== previous;
  }, { timeout: 10000 }, cover).catch(() => {});
  return 'ok';
}

/** Prefer the 1/N album exposed directly on the business Menu tab. */
async function openMenuTabAlbum(page) {
  if (!await clickControl(page, 'mainMenu')) return { opened: false, expected_images: 0 };
  // readMenuTab leaves the Menu tab on its last category; the album strip is on the Menu tab's own Overview.
  await page.evaluate(() => {
    const norm = value => String(value || '').trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
    const list = [...document.querySelectorAll('[role="tablist"]')].filter(item => item.getClientRects().length).find(item => {
      const names = [...item.querySelectorAll('[role="tab"]')].map(tab => norm(tab.textContent));
      return names.some(name => /^(?:genel bakis|overview)$/.test(name)) && !names.some(name => /^(?:hakkinda|about)$/.test(name));
    });
    const tab = [...(list?.querySelectorAll('[role="tab"]') || [])].find(item => /^(?:genel bakis|overview)$/.test(norm(item.textContent)));
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('[role="region"] button[aria-label]')].some(button =>
    button.getClientRects().length && /^(?:fotoğraf|photo)\s+1\/\d+$/i.test(button.getAttribute('aria-label'))), { timeout: 5000 }).catch(() => {});
  const handle = await page.evaluateHandle(() => {
    const region = [...document.querySelectorAll('[role="region"]')].find(item => /^(?:menü|menu)$/i.test(item.getAttribute('aria-label') || ''));
    if (!region) return null;
    const buttons = [...region.querySelectorAll('button[aria-label]')];
    const first = buttons.find(button => /^(?:fotoğraf|photo)\s+1\/(\d+)$/i.test(button.getAttribute('aria-label') || ''));
    const count = Math.max(0, ...buttons.map(button => Number((button.getAttribute('aria-label') || '').match(/^(?:fotoğraf|photo)\s+\d+\/(\d+)$/i)?.[1]) || 0));
    return first ? { button: first, count } : null;
  });
  try {
    const value = await handle.jsonValue().catch(() => null);
    const button = await page.evaluateHandle(() => {
      const region = [...document.querySelectorAll('[role="region"]')].find(item => /^(?:menü|menu)$/i.test(item.getAttribute('aria-label') || ''));
      return [...(region?.querySelectorAll('button[aria-label]') || [])].find(item => /^(?:fotoğraf|photo)\s+1\/\d+$/i.test(item.getAttribute('aria-label') || '')) || null;
    });
    try {
      const first = button.asElement();
      if (!first) return { opened: false, expected_images: value?.count || 0 };
      await first.click();
      const opened = await page.waitForFunction(() => /!1e2!3m6!1s[\w-]+!2e10!3e12!6s/i.test(location.href), { timeout: 7000 }).then(() => true, () => false);
      return { opened, expected_images: value?.count || 0 };
    } finally { await button.dispose(); }
  } finally { await handle.dispose(); }
}

/**
 * Walks the open photo viewer with its "next" control. Stops when a photo repeats (the viewer
 * wrapped around) or the control disappears; a stalled viewer is reported as truncated.
 */
async function walkViewer(page, { maxImages, waitMs = 350, timeoutMs = 45000 }) {
  const images = new Map(), seen = new Set();
  const deadline = Date.now() + timeoutMs;
  let ended = false;
  await sleep(waitMs);
  for (let step = 0; step < maxImages + 10 && Date.now() < deadline; step++) {
    const current = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('div, span')]
        .filter(el => el.childElementCount === 0 && el.getClientRects().length).map(el => el.textContent.trim());
      return { href: location.href, label: texts.find(text => /^(?:Fotoğraf|Photo|Video)\s*[-–·]\s*\S+\s+\d{4}$/i.test(text)) || '',
        captured: texts.find(text => /^(?:Görüntünün çekilme tarihi|Image capture):\s*\S+\s+\d{4}$/i.test(text)) || '' };
    });
    const photo = viewerPhoto(current.href);
    if (photo) {
      if (seen.has(photo.id)) { ended = true; break; }
      seen.add(photo.id);
      // The capture month dates the menu itself; the header shows when it was posted.
      if (!/^video/i.test(current.label)) images.set(photo.id, { url: photo.url, width: photo.width, height: photo.height,
        label: current.label, taken_at: photoMonth(current.captured) || photoMonth(current.label) });
      if (images.size >= maxImages) break;
    }
    const moved = await page.evaluate(() => {
      // The viewer disables its own control on the category's last photo; other widgets
      // (e.g. popular times) also have "Sonraki" buttons, so labels are only a fallback.
      const own = [...document.querySelectorAll('button[jsaction*="onRightClick"]')];
      const next = (own.length ? own : [...document.querySelectorAll('button[aria-label="Sonraki"], button[aria-label="Next"]')])
        .find(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      next?.click();
      return !!next;
    });
    if (!moved) { ended = true; break; }
    const changed = await page.waitForFunction(previous => location.href !== previous, { timeout: 5000 }, current.href)
      .then(() => true, () => false);
    if (!changed) break;
    await sleep(waitMs); // the header (date) follows the URL
  }
  return { images: [...images.values()], ended };
}

/** Menu photos in Google's order with original size and month, via the gallery's Menu category. */
export async function readMenuPhotos(page, { overviewUrl = '', maxImages = 20, waitMs = 350 } = {}) {
  maxImages = bounded(maxImages, 20);
  const direct = await openMenuTabAlbum(page);
  if (direct.opened) {
    const walk = await walkViewer(page, { maxImages, waitMs });
    return { status: walk.images.length ? 'found' : 'empty', source: 'menu_tab', expected_images: direct.expected_images,
      images: walk.images, truncated: !walk.ended };
  }
  let reason = 'PHOTO_GALLERY_NOT_EXPOSED';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (overviewUrl && (attempt || !await heroVisible(page))) await openOverview(page, overviewUrl);
    const opened = await openMenuCategory(page);
    if (opened === 'ok') {
      const walk = await walkViewer(page, { maxImages, waitMs });
      return { status: walk.images.length ? 'found' : 'empty', images: walk.images, truncated: !walk.ended };
    }
    if (opened === 'NO_MENU_CATEGORY') return { status: 'empty', reason: opened, images: [], truncated: false };
    reason = opened;
    // A limited view often gets the categorized gallery on a later load.
    if (!overviewUrl) break;
  }
  return { status: 'unavailable', reason, images: [], truncated: false };
}

/** Structured menu (full view only): Menu tab text categories, prices and item photos. */
async function readMenuTab(page, { maxCategories, maxImages, maxScrolls, waitMs, onProgress }) {
  const result = { opened: false, categories: [], images: [], items: [], expected_images: 0, exhausted: true, truncated: false };
  if (!await clickControl(page, 'mainMenu')) return result;
  result.opened = true;
  await page.waitForSelector('[role="region"][aria-label="Menü"], [role="region"][aria-label="Menu"]', { timeout: 5000 }).catch(() => {});
  const categories = await page.evaluate(() => {
    const main = /^(genel bakış|overview|menü|menu|yorumlar|reviews|hakkında|about)$/i;
    return [...document.querySelectorAll('[role="tab"]')].filter(el => el.getClientRects().length)
      .map(el => (el.textContent || '').trim()).filter(text => text && !main.test(text));
  });
  const uniqueCategories = [...new Set(categories)];
  result.categories = uniqueCategories.slice(0, maxCategories);
  result.truncated = uniqueCategories.length > maxCategories;
  const images = new Map(), items = new Map();
  for (const category of ['Menü', ...result.categories]) {
    if (category !== 'Menü' && !await clickControl(page, 'category', category)) { result.exhausted = false; continue; }
    const found = await collectImages(page, { category, maxImages, maxScrolls, waitMs, menuOnly: true });
    result.expected_images = Math.max(result.expected_images, found.expected_images);
    for (const row of found.items) items.set(JSON.stringify([row.category, row.name, row.description, row.price_text]), row);
    for (const row of found.images) {
      const id = imageIdentity(row.url), old = images.get(id);
      if (!old) images.set(id, { ...row, categories: [category] });
      else if (!old.categories.includes(category)) old.categories.push(category);
    }
    result.exhausted &&= found.exhausted;
    result.truncated ||= found.truncated;
    if (onProgress) await onProgress({ stage: 'menu_category', category, images: images.size, items: items.size }, page);
  }
  result.images = [...images.values()];
  result.items = [...items.values()];
  return result;
}

export async function readMenu(page, { maxCategories = 50, maxImages = 20, maxScrolls = 20, waitMs = 450, overviewUrl = '', onProgress } = {}) {
  maxImages = bounded(maxImages, 20);
  maxCategories = bounded(maxCategories, 50, 50);
  const tab = await readMenuTab(page, { maxCategories, maxImages, maxScrolls, waitMs, onProgress });
  const album = await readMenuPhotos(page, { overviewUrl, maxImages });
  if (onProgress) await onProgress({ stage: 'menu_photos', status: album.status, images: album.images.length }, page);
  const images = new Map();
  for (const row of [...album.images.map(row => ({ ...row, category: 'Menü', categories: ['Menü'] })), ...tab.images]) {
    const id = imageIdentity(row.url);
    if (id && !images.has(id)) images.set(id, row);
  }
  const status = await mediaStatus(page);
  const found = images.size > 0 || tab.items.length > 0;
  if (!found && album.status === 'unavailable' && !tab.opened) {
    return { status: 'unavailable', reason: status === 'ok' ? album.reason : status.toUpperCase(),
      categories: [], images: [], items: [], expected_images: 0, coverage_complete: false, truncated: false };
  }
  return { status: found ? 'found' : 'empty', source: album.images.length ? (album.source || 'photo_viewer') : tab.opened ? 'menu_tab' : 'none',
    categories: tab.categories, images: [...images.values()].slice(0, maxImages), items: tab.items,
    expected_images: Math.max(tab.expected_images, album.expected_images || 0), reason: album.reason,
    coverage_complete: album.status === 'found' && !album.truncated && (!tab.opened || (tab.exhausted && !tab.truncated)) && status === 'ok',
    truncated: album.truncated || tab.truncated };
}

export async function readPhotos(page, { maxImages = 12, maxScrolls = 20, waitMs = 450, overviewUrl = '', exclude = [] } = {}) {
  // Start from a freshly loaded place: the menu album's viewer can stay open behind a clickable Overview tab,
  // and its thumbnails would be read as the gallery (seen live: 11 menu photos and a 32 px preview).
  if (overviewUrl) await openOverview(page, overviewUrl);
  else await clickControl(page, 'overview');
  const overview = await collectImages(page, { maxImages, maxScrolls: 1, waitMs, exclude });
  const opened = await clickControl(page, 'photos');
  if (opened) await clickControl(page, 'allPhotos');
  const found = opened ? await collectImages(page, { maxImages, maxScrolls, waitMs, exclude }) : overview;
  const images = new Map();
  for (const row of [...overview.images, ...found.images]) images.set(imageIdentity(row.url), row);
  const rows = [...images.values()].slice(0, bounded(maxImages, 12));
  // Without the gallery only the few overview photos were seen; that is not the caller's limit stopping the list.
  const short = !opened && rows.length < bounded(maxImages, 12);
  return { status: rows.length ? 'found' : 'unavailable', images: rows, coverage_complete: false,
    truncated: short ? false : found.truncated, ...(short ? { reason: 'PHOTO_GALLERY_NOT_OPENED' } : {}) };
}
