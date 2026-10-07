# MCP sunucusu (`gmaps-mcp`)

[English](../mcp.md) · [Doküman dizini](README.md)

`gmaps-mcp`, yapay zekâ ajanlarının Google Maps'i [Model Context Protocol](https://modelcontextprotocol.io) üzerinden okumasını sağlar: Claude Code, Claude Desktop ve diğer MCP istemcileri. Ajan mekân arayabilir; bir mekânı okuyabilir (bilgiler, Hakkında özellikleri, fiyatlı yazılı menü, her fotoğrafın çekildiği ayla menü albümü, galeri fotoğrafları); yorumları okuyabilir ve fotoğraflara görsel olarak bakabilir, örneğin bir menü sayfasını okumak için.

Kendi bilgisayarınızda, kendi Chrome ya da Chromium'unuzla çalışır. API anahtarı, Google hesabı ya da barındırılan bir servis yoktur.

## Kurulum

Node.js 20+ ve Chrome ya da Chromium gerekir. Kalıcı tarayıcı profili için bir klasör seçin (mutlak yol): Google'ın tam görünümünü korur, bkz. [Hesapsız tam görünüm](full-view.md). Linux ve macOS'ta `MAPS_CHROME_PATH`'i de ayarlayın.

**Claude Code:**

```bash
claude mcp add gmaps -e MAPS_PROFILE_DIR=/mutlak/yol/gmaps-profile -- npx -y -p gmaps-place-reader gmaps-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gmaps": {
      "command": "npx",
      "args": ["-y", "-p", "gmaps-place-reader", "gmaps-mcp"],
      "env": { "MAPS_PROFILE_DIR": "C:\\gmaps-profile" }
    }
  }
}
```

**Diğer istemciler:** `npx -y -p gmaps-place-reader gmaps-mcp` komutunu stdio sunucusu olarak başlatın. Paket bir projede kuruluysa `npx gmaps-mcp` yeterli.

## Araçlar

| Araç | Argümanlar | Döndürdüğü |
|---|---|---|
| `search` | `query`, `location`, `limit` (1–20, varsayılan 5) | `{ status, places: [{ name, url }], truncated }`. Yaklaşık 10–30 sn. |
| `place` | `url`, `menu_photos` (1–200, varsayılan 20), `photos` (1–60, varsayılan 12), `reviews` (0–100, varsayılan 0), `review_sort` | Durum, `view`, `warnings`, ad, adres, telefon, web sitesi, saatler (`opening_hours_rows`), puan, yorum sayısı, fiyat seviyesi, koordinat, `about` (kategorilere göre özellikler), `menu` (fiyatlı `items`, `categories`, `taken_at`, genişlik ve yükseklikle `photos`), galeri `photos` ve istenirse `reviews`. Yaklaşık 30–90 sn. |
| `reviews` | `url`, `count` (1–500, varsayılan 50), `sort` (`newest` · `relevant` · `highest` · `lowest`, varsayılan `newest`) | Puan, yorum sayısı, `collected_count`, `total_count`, `sort_applied`, `coverage_complete` ve `reviews`. Her yorum: `rating`, `date`, `date_precision` (tarih Google'ın kendi verisiyle doğrulandıysa `exact`), `text`, `details` (alt puanlar, kişi başı fiyat …), `owner_response`, `likes`, `language`, `photos`, `edited`, `translated`. Menüyü ve galeriyi atladığı için hızlıdır: testimizde 30 yorum yaklaşık 10 sn sürdü. |
| `photos` | `urls` (`place` ya da `reviews`'tan 1–8 fotoğraf adresi) | Her fotoğraf için adresi ve görselin kendisi (JPEG, uzun kenar 1280 px). Başka adresler reddedilir. |

`url`, kütüphanenin kabul ettiği her linki kabul eder: `maps.app.goo.gl` paylaşım linkleri, `google.<ülke>/maps/place/…`, `?cid=` linkleri ve Menü ya da Yorumlar sekmesinde kopyalanan linkler.

**Yorumlar yorumcu adı, profili ya da profil resmi olmadan gelir.**

## Ayarlar ve sınırlar

| Ortam değişkeni | Varsayılan | Anlamı |
|---|---|---|
| `MAPS_PROFILE_DIR` | — | Kalıcı tarayıcı profili, mutlak yol. Önerilir. |
| `MAPS_CHROME_PATH` | Windows Chrome'u | Chrome ya da Chromium dosyası. |
| `MAPS_MCP_MAX_READS` | 30 | Oturum başına `search`, `place` ve `reviews` çağrısı. `0` = sınır yok. |
| `MAPS_MCP_MAX_PHOTOS` | 100 | Oturum başına `photos` aracıyla bakılan fotoğraf. `0` = sınır yok. |
| `MAPS_MCP_PAUSE_MS` | 3000 | İki Maps okuması arasındaki en kısa bekleme. |

Oturum, sunucunun bir çalışmasıdır; sunucuyu istemci başlatır.

## Nasıl çalışır

- **Tek tarayıcı, sırayla okuma.** Chrome ilk okumada açılır, istemci bağlantıyı kapatınca kapanır. Çağrılar birbirini bekler; birkaç mekân isteyen ajan onları art arda alır.
- **Uzun okumalar ilerleme bildirir** (istemci `progressToken` gönderirse). İstemciniz beklemeyi bırakıyorsa araç zaman aşımını artırın (Claude Code: `MCP_TOOL_TIMEOUT`, milisaniye) ya da daha az menü fotoğrafı ve yorum isteyin.
- **Dürüst sonuçlar.** Her sonuç neyin okunamadığını söyler: `status`, `view` ve `warnings` ([Sorun giderme](troubleshooting.md)). Sınırlı görünüm [Tam görünüm](full-view.md) sayfasındaki gibi onarılır.
- **Hatalar** araç hatası olarak döner: `INVALID_MAPS_URL`, `QUERY_AND_LOCATION_REQUIRED`, `READ_LIMIT: …`, `CHROME_PATH_REQUIRED`, `MAPS_PROFILE_PATH_MUST_BE_ABSOLUTE` ya da kısa bir nedenle `MAPS_READ_FAILED: …`.

## Sorumlu kullanım

Sunucu kişisel ve araştırma amaçlı, düşük hacimli kullanım içindir. Google Maps'e otomatik erişim [Google Haritalar Hizmet Şartları](https://www.google.com/help/terms_maps/) ile çelişebilir; nasıl kullandığınızdan siz sorumlusunuz. Varsayılan sınırları ve beklemeleri koruyun, oturum başına az mekân okuyun ve CAPTCHA'ları aşmaya çalışmayın (okuyucu orada durur). Fotoğraf, yorum ve metinler sahiplerine aittir.

## Örnek istekler

- "Kadıköy, İstanbul'da üç balık restoranı bul ve en yeni menü fotoğraflarındaki fiyatları karşılaştır."
- "https://maps.app.goo.gl/… mekânının en yeni 100 yorumunu oku ve şikâyetleri aylara göre özetle."
- "Bu kafe pazar sabahları açık mı, açık hava oturma alanı var mı?"
