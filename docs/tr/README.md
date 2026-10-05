# gmaps-place-reader dokümantasyonu

[English](../README.md) · [Projeye dön](../../README.md)

| Sayfa | İçerik |
|---|---|
| [Hesapsız tam görünüm](full-view.md) | Google neden sınırlı görünüm gösterir, anonim kimlik çerezi (`__Secure-ENID` / `NID`), okuyucu tam görünümü nasıl korur, test sonuçları, neden hesap kullanılmadığı. |
| [API başvurusu](api.md) | Her fonksiyon ve seçenek. |
| [Veri başvurusu](data.md) | Mekân, menü, fotoğraf, yorum ve kayıtların her alanı. |
| [Komut satırı](cli.md) | `gmaps-place`, `gmaps-scan`, `gmaps-view`, istek ve yanıt JSON'ları, hata kodları. |
| [Durumlar, uyarılar ve sorun giderme](troubleshooting.md) | Her durumun ve uyarının anlamı ve ne yapılacağı. |

## Hızlı tarifler

Bir mekânı linkle, en yeni 300 yorumuyla okumak:

```js
import { launchBrowser, readPlaceUrl } from 'gmaps-place-reader';

const browser = await launchBrowser({ userDataDir: '/srv/gmaps/profile' });   // kalıcı profil, hesap yok
try {
  const place = await readPlaceUrl(browser, 'https://maps.app.goo.gl/…', {
    includeReviews: true, reviewSort: 'newest', maxReviews: 300, maxReviewScrolls: 40, maxMenuImages: 200,
  });
  console.log(place.view, place.status, place.name, place.review_count);
  for (const review of place.reviews.reviews) console.log(review.date_iso || review.date_estimate, review.rating, review.text);
  for (const photo of place.menu.images) console.log(photo.taken_at, photo.width, photo.height, photo.url);
} finally {
  await browser.close();
}
```

Aynısı komut satırından:

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-place --url "https://maps.app.goo.gl/…" --reviews --sort newest --max-reviews 300 --max-review-scrolls 40
```

Profili tam görünümde tutmak (cron, saatte bir):

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view   # çıkış 0 = tam görünüm
```
