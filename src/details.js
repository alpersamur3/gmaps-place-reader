// Read identity from the actual place URL. @lat,lon is the viewport centre and
// must not be mistaken for the business location.
export function placeMetadata(value) {
  let url;
  try { url = new URL(value); } catch { return {}; }
  let decoded = url.href;
  try { decoded = decodeURIComponent(decoded); } catch { /* Preserve a malformed URL as text. */ }
  const feature = decoded.match(/!1s(0x[\da-f]+:0x[\da-f]+)/i)?.[1]?.toLowerCase() || '';
  const placeId = url.searchParams.get('query_place_id') || url.searchParams.get('place_id') ||
    decoded.match(/!(?:1|19)s(ChI[\w-]+)/)?.[1] || '';
  let cid = url.searchParams.get('cid') || '';
  if (!cid && feature) {
    try { cid = BigInt(feature.split(':')[1]).toString(); } catch { /* Optional identity. */ }
  }
  if (!/^\d+$/.test(cid)) cid = '';
  const point = [...decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].at(-1);
  const latitude = point ? Number(point[1]) : null;
  const longitude = point ? Number(point[2]) : null;
  const coordinates = latitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : {};
  return { feature_id: feature, place_id: placeId, cid, ...coordinates };
}

export async function pageStatus(page) {
  return page.evaluate(() => {
    const visible = node => !!node && !!(node.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden';
    const body = (document.body?.innerText || '').slice(0, 100000);
    const hostname = location.hostname.toLowerCase();
    if (/^consent\.google\./.test(hostname) || document.querySelector('form[action*="consent.google"]') ||
      /before you continue to google|google[a-z'’ ]* devam etmeden önce|devam etmeden önce google/i.test(body)) return 'consent_required';
    if (hostname === 'accounts.google.com' || /^accounts\.google\./.test(hostname)) return 'auth_required';
    if (location.pathname.startsWith('/sorry/') ||
      /unusual traffic from your computer network|systems have detected unusual traffic|olağan dışı trafik|alışılmadık trafik|robot olmadığınızı doğrulayın|verify (?:that )?you(?:'re| are) (?:a )?human/i.test(body) ||
      [...document.querySelectorAll('form[action*="/sorry/"], #captcha, iframe[src*="recaptcha/api2/bframe"]')].some(visible)) return 'blocked';
    if (/limited view(?: of google maps)?|sınırlı görünüm|görünüm[üu] sınırlı/i.test(body)) return 'limited_view';
    // A normal Maps page always has a Sign in button. Only an explicit gate,
    // account redirect, or visible sign-in form counts as an auth failure.
    if (/sign in (?:is required|to continue(?: to google maps)?|to use google maps)|you (?:must|need to) sign in|authentication required|(?:devam etmek|google haritalar[ıi] kullanmak) için (?:lütfen )?oturum aç|oturum açmanız gerekiyor|giriş yapmanız gerekiyor/i.test(body) ||
      [...document.querySelectorAll('form[action*="accounts.google"]')].some(form => visible(form) && !!form.querySelector('input[type="email"], input[type="password"]'))) return 'auth_required';
    return 'ok';
  });
}

// This function is serialized by Puppeteer; keep all its helpers self-contained.
function readDetailsDom() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = node => !!node && !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const text = node => clean(node?.getAttribute('aria-label') || node?.innerText || node?.textContent);
  const plain = node => clean(node?.innerText || node?.textContent);
  const generic = /^(?:google\s*(?:maps|haritalar)?|maps|harita(?:lar)?|search|arama|search results|arama sonuçları|sign in|oturum aç)$/i;
  const headings = [...document.querySelectorAll('h1, [role="heading"][aria-level="1"]')]
    .filter(node => visible(node) && plain(node) && !generic.test(plain(node)) && !node.closest('[role="feed"], [role="navigation"], [role="dialog"], [role="region"][aria-label="Map"], [role="region"][aria-label="Harita"]'));
  const rank = node => (node.closest('[role="main"]') ? 4 : 0) + (node.matches('.DUwDvf') ? 2 : 0) +
    (node.closest('[role="main"]')?.querySelector('[data-item-id="address"], [data-item-id^="phone"], [data-item-id="authority"]') ? 3 : 0);
  headings.sort((a, b) => rank(b) - rank(a));
  const heading = headings[0];
  if (!heading) return { data_status: 'unavailable', name: '', opening_hours_rows: [] };
  const scope = heading.closest('[role="main"]') || document.body;
  const nodes = selector => [...scope.querySelectorAll(selector)].filter(visible);
  const first = selector => nodes(selector)[0];
  const byId = id => first(`[data-item-id="${id}"]`);
  const labelMatch = regexp => nodes('button, a, [role="button"]').find(node => regexp.test(text(node)));
  const stripPrefix = (value, re) => clean(value.replace(re, ''));
  const absoluteHttp = value => {
    if (!value) return '';
    try {
      let url = new URL(value, location.href);
      if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname === '/url') {
        const target = url.searchParams.get('q') || url.searchParams.get('url');
        if (target) url = new URL(target);
      }
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const linkFor = node => absoluteHttp(node?.getAttribute('href') || node?.closest('a')?.getAttribute('href') || node?.querySelector('a')?.getAttribute('href') || '');
  const addressNode = byId('address') || labelMatch(/^(?:adres|address)\s*:/i);
  const phoneNode = first('[data-item-id^="phone"], a[href^="tel:"]') || labelMatch(/^(?:telefon|phone|telephone)\s*:/i);
  const websiteNode = byId('authority') || first('a[aria-label^="Website:"], a[aria-label^="Web sitesi:"]');
  const menuNode = byId('menu') || first('a[data-item-id*="menu"]') || nodes('a[href]').find(node => /^(?:menu|menü)(?:\s*[:：]|$)/i.test(text(node)) && !/\/maps\//.test(node.href));
  const ratingNode = nodes('[role="img"][aria-label], [aria-label]').find(node => /(?:\d[.,]\d|\b[0-5]\b)\s*(?:yıldız|stars?|out of 5)|(?:rated|rating|puan)\s*[:：]?\s*[0-5](?:[.,]\d)?/i.test(node.getAttribute('aria-label') || ''));
  let ratingLabel = text(ratingNode);
  let rating = Number(ratingLabel.match(/(?:^|\D)([0-5](?:[.,]\d+)?)(?=\D|$)/)?.[1]?.replace(',', '.')) || 0;
  const reviewNodes = nodes('button, [role="button"], a, span').filter(node => {
    const value = text(node);
    return value.length < 150 && /\d/.test(value) && /yorum|reviews?|değerlendirme/i.test(value) && !/write|yaz|yanıt/i.test(value);
  });
  const reviewNode = reviewNodes.find(node => /yorum|review|değerlendirme/i.test(node.getAttribute('aria-label') || '')) || reviewNodes[0];
  let reviewLabel = text(reviewNode);
  if (!reviewLabel && ratingNode) {
    // Maps sometimes exposes only '(1,234)' next to the star image.
    let parent = ratingNode.parentElement;
    for (let depth = 0; parent && depth < 3 && parent !== scope; depth++, parent = parent.parentElement) {
      const candidate = plain(parent);
      const count = candidate.length < 220 && candidate.match(/\(([\d.,\s]+(?:\s*(?:K|M|B|bin))?)\)/i);
      if (count) { reviewLabel = count[1]; break; }
    }
  }
  const parseCount = value => {
    const found = clean(value).match(/\d[\d.,\s]*(?:\s*(?:bin|milyon|million|[kmb]))?/i);
    if (!found) return 0;
    const match = found[0].trim();
    const suffix = match.match(/(?:bin|milyon|million|[kmb])$/i)?.[0]?.toLowerCase();
    let numeric = match.replace(/[^\d.,]/g, '');
    if (suffix) {
      numeric = numeric.replace(/,(?=\d{3}(?:\D|$))/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
      return Math.round(Number(numeric) * (/^(m|million|milyon)$/.test(suffix) ? 1000000 : 1000)) || 0;
    }
    return Number(numeric.replace(/[.,]/g, '')) || 0;
  };
  const countLabel = reviewLabel.match(/(\d[\d.,]*(?:\s*(?:bin|milyon|million|[kmb]))?)\s*(?:reviews?|yorum|değerlendirme)/i)?.[1] ||
    reviewLabel.match(/(?:reviews?|yorum|değerlendirme)\s*[:：]?\s*(\d[\d.,]*(?:\s*(?:bin|milyon|million|[kmb]))?)/i)?.[1] || reviewLabel;
  let reviewCount = parseCount(countLabel);
  // Additional fallback for the compact Maps rating/review line.
  if (!rating) {
    const compactLine = nodes('div, span').map(plain).find(value => /^([0-5][.,]\d)\s*[·•]?\s*\([\d.,\s]+\)$/.test(value));
    if (compactLine) { ratingLabel = compactLine; rating = Number(compactLine.match(/^[0-5][.,]\d/)?.[0].replace(',', '.')) || 0; }
  }
  const categoryNode = byId('category') || first('button[jsaction*="category"], .DkEaL') || labelMatch(/^(?:category|kategori)\s*:/i);
  const businessType = stripPrefix(text(categoryNode), /^(?:category|kategori)\s*:\s*/i);
  const priceNode = byId('price') || first('[aria-label^="Price:"], [aria-label^="Fiyat:"], [aria-label^="Price range:"]');
  const priceLevel = stripPrefix(text(priceNode), /^(?:price(?: range)?|fiyat(?: aralığı)?)\s*:\s*/i) ||
    nodes('span').map(plain).find(value => /^(?:(?:[₺$€£¥]{1,4})|[₺$€£¥]\s*\d[\d.,]*(?:\s*[–—-]\s*[₺$€£¥]?\s*\d[\d.,]*)?(?:\s*(?:per person|kişi başı))?)$/.test(value)) || '';
  const hourNode = byId('oh') || first('[data-item-id^="oh;"]') || labelMatch(/^(?:hours|opening hours|çalışma saatleri|açılış saatleri)\s*:/i);
  let openingHours = stripPrefix(text(hourNode), /^(?:hours|opening hours|çalışma saatleri|açılış saatleri)\s*:\s*/i) ||
    nodes('button, span').map(text).find(value => value.length < 180 && /(?:açılış (?:zamanı|saati)|kapanış (?:zamanı|saati)|çalışma saatlerini kopyala|copy opening hours|opening time|closing time|open 24 hours|24 saat açık|opens (?:at|\d)|closes (?:at|\d))/i.test(value)) || '';
  const days = /^(?:pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s|$|[,.:])/i;
  const openingHoursRows = [];
  const seenDays = new Set();
  const hoursScopes = [scope, ...document.querySelectorAll('[role="dialog"]')];
  for (const hoursScope of hoursScopes) {
    for (const row of hoursScope.querySelectorAll('tr, [role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td, th, [role="cell"], [role="rowheader"]')]
        .map(cell => plain(cell).replace(/[\uE000-\uF8FF]/g, '').trim()).filter(Boolean);
      if (cells.length < 2 || !days.test(cells[0])) continue;
      const day = cells[0].replace(/[,:]$/, '');
      const hours = cells.slice(1).filter(value => !/^(?:suggest|öner)/i.test(value)).join('; ');
      const key = day.toLocaleLowerCase('tr');
      if (!seenDays.has(key) && hours) { openingHoursRows.push({ day, hours }); seenDays.add(key); }
    }
  }
  if (!openingHours && openingHoursRows.length) openingHours = openingHoursRows.map(row => `${row.day}: ${row.hours}`).join('; ');
  let address = stripPrefix(text(addressNode), /^(?:adres|address)\s*:\s*/i);
  let phone = stripPrefix(text(phoneNode), /^(?:telefon|phone|telephone)\s*:\s*/i);
  if (!phone && phoneNode?.getAttribute('href')?.startsWith('tel:')) phone = phoneNode.getAttribute('href').slice(4);
  let website = linkFor(websiteNode);
  const menuUrl = linkFor(menuNode);
  // Some Maps layouts include inert JSON-LD. Parse JSON only; never execute
  // downloaded scripts or initialization blobs to obtain missing fields.
  let structured = {};
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (clean(value.name).toLocaleLowerCase('tr') === plain(heading).toLocaleLowerCase('tr') && /Restaurant|LocalBusiness|FoodEstablishment|CafeOrCoffeeShop|Store|LodgingBusiness/.test(String(value['@type']))) structured = value;
    if (value['@graph']) visit(value['@graph']);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch { /* Ignore malformed optional metadata. */ }
  }
  if (!phone) phone = clean(structured.telephone);
  if (!website && typeof structured.url === 'string') website = absoluteHttp(structured.url);
  if (!address && structured.address) address = typeof structured.address === 'string' ? clean(structured.address) :
    ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'].map(key => clean(structured.address[key])).filter(Boolean).join(', ');
  if (!rating) rating = Number(String(structured.aggregateRating?.ratingValue || '').replace(',', '.')) || 0;
  if (!reviewCount) reviewCount = parseCount(structured.aggregateRating?.reviewCount || structured.aggregateRating?.ratingCount || '');
  const descriptionNode = nodes('[data-item-id="description"], [aria-label^="Description:"], [aria-label^="Açıklama:"]')
    .find(node => !generic.test(plain(node)));
  const description = clean(structured.description || descriptionNode?.innerText || descriptionNode?.getAttribute('aria-label')
    ?.replace(/^(?:description|açıklama)\s*:\s*/i, ''));
  const latitude = Number(structured.geo?.latitude), longitude = Number(structured.geo?.longitude);
  const geo = structured.geo?.latitude !== undefined && structured.geo?.longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : {};
  const name = plain(heading);
  return { data_status: 'ok', name, description, address, phone, website, menu_url: menuUrl, business_type: businessType,
    price_level: priceLevel || clean(structured.priceRange), rating: rating >= 0 && rating <= 5 ? rating : 0,
    review_count: reviewCount, rating_label: ratingLabel, review_label: reviewLabel, opening_hours: openingHours,
    opening_hours_rows: openingHoursRows, ...geo };
}

/** Open Maps' About tab for the description and categorized business attributes. */
export async function extractAboutDetails(page) {
  const opened = await page.evaluate(() => {
    const normalize = value => String(value || '').trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const tablist = tabs.find(tab => {
      const list = tab.closest('[role="tablist"]');
      const names = [...(list?.querySelectorAll('[role="tab"]') || [])].map(item => normalize(item.textContent));
      // Limited views show only Overview and About, so the Reviews tab is not required.
      return names.some(name => /^(?:genel bakis|overview)$/.test(name)) && names.some(name => /^(?:hakkinda|about)$/.test(name));
    })?.closest('[role="tablist"]');
    const tab = [...(tablist?.querySelectorAll('[role="tab"]') || [])].find(item => /^(?:hakkinda|about)$/.test(normalize(item.textContent)));
    if (!tab) return false;
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
    return true;
  });
  if (!opened) return { status: 'unavailable', description: '', attributes: [] };
  await page.waitForFunction(() => [...document.querySelectorAll('[role="region"]')].some(region =>
    region.getClientRects().length && /about|hakkında/i.test(region.getAttribute('aria-label') || '')), { timeout: 5000 }).catch(() => {});
  const allAttributes = new Map();
  let description = '', exhausted = false, status = 'ok';
  for (let attempt = 0; attempt < 20; attempt++) {
    const pageData = await page.evaluate(() => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = node => !!node && !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const region = [...document.querySelectorAll('[role="region"]')].find(item => visible(item) && /about|hakkında/i.test(item.getAttribute('aria-label') || ''));
    if (!region) return { status: 'unavailable', description: '', attributes: [] };
    const attributes = [];
    let description = '';
    for (const heading of region.querySelectorAll('h2, [role="heading"]')) {
      if (!visible(heading)) continue;
      const category = clean(heading.innerText || heading.textContent);
      const content = heading.nextElementSibling;
      if (!content || !visible(content)) continue;
      if (/description|açıklama|from the business|işletme açıklaması|işletmeden/i.test(category)) {
        description ||= clean(content.innerText || content.textContent);
        continue;
      }
      for (const row of content.querySelectorAll('li')) {
        if (!visible(row)) continue;
        const labelNode = row.querySelector('[aria-label]');
        const label = clean(labelNode?.getAttribute('aria-label') || row.innerText);
        const name = clean(labelNode?.innerText || row.innerText);
        if (!name) continue;
        // The About tab lists attributes that apply, plus explicit negatives ("… yok", "No …", "… değil").
        const negative = /(?:^|\s)(?:yok|yoktur|değil|etmiyor|sunmuyor|vermiyor|bulunmuyor|olmuyor)(?:\s|$)|^(?:no|not)\s|\b(?:not available|does not|doesn't|doesn’t)\b/i.test(label);
        attributes.push({ category, name, label, available: label ? !negative : null });
      }
    }
    return { status: 'ok', description, attributes };
  });
    if (pageData.status !== 'ok') { status = pageData.status; exhausted = true; break; }
    description ||= pageData.description || '';
    for (const row of pageData.attributes || []) allAttributes.set(JSON.stringify([row.category, row.name, row.label]), row);
    const moved = await page.evaluate(() => {
      const region = [...document.querySelectorAll('[role="region"]')].find(item =>
        item.getClientRects().length && /about|hakkında/i.test(item.getAttribute('aria-label') || ''));
      let node = region, scroller = null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (node.clientHeight > 100 && node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(style.overflowY)) { scroller = node; break; }
        node = node.parentElement;
      }
      if (!scroller) return false;
      const before = scroller.scrollTop;
      scroller.scrollBy(0, Math.max(250, Math.round(scroller.clientHeight * 0.82)));
      return scroller.scrollTop > before;
    });
    if (!moved) { exhausted = true; break; }
    await new Promise(resolve => setTimeout(resolve, 220));
  }
  return { status, description, attributes: [...allAttributes.values()], truncated: !exhausted };
}

// Places with several kinds of hours (delivery, takeaway …) open them on their own panel page.
const HOURS_PAGE = `[...document.querySelectorAll('h1')].some(node => node.getClientRects().length &&
  /^(?:çalışma saatleri|hours|opening hours)$/i.test(node.innerText.trim()))`;

// Serialized by Puppeteer. The first row per day is the business's own hours; later sections (Teslimat …) repeat days.
function readHoursRows() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const days = /^(?:pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s|$|[,.:])/i;
  const rows = [], seen = new Set();
  for (const row of document.querySelectorAll('tr, [role="row"]')) {
    if (!row.getClientRects().length) continue;
    const cells = [...row.querySelectorAll('td, th, [role="cell"], [role="rowheader"]')]
      .map(cell => clean(cell.innerText || cell.textContent).replace(/[-]/g, '').trim()).filter(Boolean);
    if (cells.length < 2 || !days.test(cells[0])) continue;
    const day = cells[0].replace(/[,:]$/, '');
    const hours = cells.slice(1).filter(value => !/^(?:suggest|öner)/i.test(value)).join('; ');
    const key = day.toLocaleLowerCase('tr');
    if (!seen.has(key) && hours) { rows.push({ day, hours }); seen.add(key); }
  }
  return rows;
}

export async function extractPlaceDetails(page, { expandHours = true } = {}) {
  let details = await page.evaluate(readDetailsDom);
  const openingSummary = details.opening_hours;
  if (expandHours && details.data_status === 'ok' && !details.opening_hours_rows.length) {
    const handle = await page.evaluateHandle(() => {
      const heading = [...document.querySelectorAll('h1')].find(node => node.getClientRects().length && !/^(?:google maps|maps|haritalar)$/i.test(node.textContent.trim()));
      const scope = heading?.closest('[role="main"]') || document.body;
      const trigger = [...scope.querySelectorAll('[data-item-id="oh"], [data-item-id^="oh;"], button[aria-label], [role="button"][aria-label], [role="img"][aria-label]')].find(node => {
        if (!node.getClientRects().length) return false;
        if (node.getAttribute('data-item-id')?.startsWith('oh')) return true;
        return /^(?:hours|opening hours|çalışma saatleri|açılış saatleri)(?:\s*[:：]|$)|(?:show|see) (?:all |weekly )?(?:opening )?hours|tüm (?:çalışma )?saatleri|haftalık çalışma saatlerini göster/i.test(node.getAttribute('aria-label') || '');
      });
      return trigger || null;
    });
    const trigger = handle.asElement();
    if (trigger) {
      let clicked = false;
      const previousDialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getClientRects().length).length);
      try {
        // A DOM click: a mouse click on the "Diğer saatlere bakın" row does not reach Maps' handler.
        await trigger.evaluate(node => node.click()); clicked = true;
        // Hours open inline, in a dialog or on their own panel page; the panel page takes a few seconds.
        await page.waitForFunction(() => [...document.querySelectorAll('tr, [role="row"]')].some(row => row.getClientRects().length && /monday|tuesday|wednesday|thursday|friday|saturday|sunday|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar/i.test(row.innerText || '')), { timeout: 6000 }).catch(() => {});
        if (await page.evaluate(HOURS_PAGE)) {
          // The place heading is gone on that page: keep the details already read, take only the rows.
          const rows = await page.evaluate(readHoursRows);
          if (rows.length) details = { ...details, opening_hours_rows: rows };
        } else {
          details = await page.evaluate(readDetailsDom);
          if (openingSummary) details.opening_hours = openingSummary;
        }
      } catch { /* Keep the already-extracted place details if hours cannot open. */ }
      finally {
        if (clicked) {
          if (await page.evaluate(HOURS_PAGE).catch(() => false)) {
            await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find(node => node.getClientRects().length &&
              /^(?:geri|back)$/i.test(node.getAttribute('aria-label')))?.click()).catch(() => {});
            await page.waitForFunction(`!(${HOURS_PAGE})`, { timeout: 5000 }).catch(() => {});
          } else {
            const currentDialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter(node => node.getClientRects().length).length).catch(() => previousDialogs);
            if (currentDialogs > previousDialogs) await page.keyboard.press('Escape').catch(() => {});
          }
        }
      }
    }
    await handle.dispose();
  }
  return { ...details, ...placeMetadata(page.url()) };
}
