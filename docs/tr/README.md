# gmaps-place-reader dokümantasyonu

[English](../README.md) · [Projeye dön](../../README.md)

| Sayfa | İçerik |
|---|---|
| [Tam görünüm için oturum açma](sign-in.md) | Ekim 2026 sonundan beri tam görünüm için oturum açık profil gerekir: ekranlı bilgisayarda ya da sunucuda (SSH tüneli + `chrome://inspect`) `gmaps-login`, oturumun neden okuyucunun çalıştığı yerde oluşturulması gerektiği, `gmaps-view` ile canlı tutma. |
| [Tam görünüm](full-view.md) | Sınırlı ve tam görünüm, anonim kimlik çerezi (`__Secure-ENID` / `NID`), okuyucu sınırlı oturumsuz görünümü nasıl onarır, test sonuçları. |
| [API başvurusu](api.md) | Her fonksiyon ve seçenek. |
| [Veri başvurusu](data.md) | Mekân, menü, fotoğraf, yorum ve kayıtların her alanı. |
| [Komut satırı](cli.md) | `gmaps-place`, `gmaps-scan`, `gmaps-login`, `gmaps-view`, istek ve yanıt JSON'ları, hata kodları. |
| [MCP sunucusu](mcp.md) | Yapay zekâ ajanları için `gmaps-mcp` (Claude Code, Claude Desktop, diğer MCP istemcileri): kurulum, araçlar, sınırlar. |
| [Durumlar, uyarılar ve sorun giderme](troubleshooting.md) | Her durumun ve uyarının anlamı ve ne yapılacağı. |

## Hızlı tarifler

Bir mekânı linkle, en yeni 300 yorumuyla okumak:

```js
import { launchBrowser, readPlaceUrl } from 'gmaps-place-reader';

const browser = await launchBrowser({ userDataDir: '/srv/gmaps/profile' });   // kalıcı profil, gmaps-login ile bir kez oturum açılmış
try {
  const place = await readPlaceUrl(browser, 'https://maps.app.goo.gl/…', {
    includeReviews: true, reviewSort: 'newest', maxReviews: 300, maxReviewScrolls: 40, maxMenuImages: 200,
  });
  console.log(place.view, place.account, place.status, place.name, place.review_count);
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

Profilde bir kez oturum açmak (sunucuda da, bkz. [Oturum açma](sign-in.md)), sonra tam görünümde tutmak (cron, saatte bir):

```bash
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-login
MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view --no-repair   # çıkış 0 = tam görünüm
```
