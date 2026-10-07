# Durumlar, uyarılar ve sorun giderme

[English](../troubleshooting.md) · [Doküman dizini](README.md)

Her sonuç neyi okuyabildiğini ve neyi okuyamadığını söyler. Önce `status` ve `view`'a, sonra `warnings`'e bakın.

## Durum

| `status` | Anlamı | Ne yapmalı |
|---|---|---|
| `ok` | İstenen her şey okundu. Koyduğunuz sınırlar bir listeyi yine de durdurmuş olabilir (`…_LIMIT_OR_SCROLL_LIMIT`). | — |
| `incomplete` | Mekân tam görünümde okundu ama bir kısım başarısız oldu; `warnings`'e bakın. | Genellikle geçicidir; mekânı yeniden okuyun. |
| `limited_view` | Google sınırlı görünüm verdi ve onarılamadı ([Tam görünüm](full-view.md)). Menü ürünleri, albüm ve bazı bilgiler eksik. | Kalıcı profil kullanın ve `gmaps-view` çalıştırın. User agent'ın işletim sisteminin, profilin oluşturulduğu sistemle aynı olduğundan emin olun. |
| `consent_required` | AB onay sayfası geçilemedi ("Tümünü reddet" düğmesi yok). | Sayfaya görünür bir tarayıcıyla bakın (`headless: false`). |
| `auth_required` | Google mekân yerine oturum açma sayfası gösterdi. | Seyrek. Mekânı yeniden okuyun; tekrarlarsa yeni bir profille başlayın. |
| `blocked` | "Olağan dışı trafik" / CAPTCHA. Okuyucu bunu asla aşmaya çalışmaz. | Yavaşlayın, ara verin, çalıştırma başına daha az mekân okuyun. |
| `unavailable` | Mekân paneli yüklenmedi ya da link bir mekân değil. | Linki kontrol edin; yeniden deneyin. |

## Uyarılar

| Uyarı | Anlamı |
|---|---|
| `LIMITED_VIEW` | Mekân sınırlı görünümde okundu. |
| `MENU_PHOTOS_UNAVAILABLE` | Menü ürünleri okundu ama menü fotoğraf albümü açılamadı. |
| `MENU_IMAGES_NOT_LOADED` | Albüm açıldı ama hiç fotoğraf yüklenmedi. |
| `PHOTO_GALLERY_NOT_EXPOSED`, `MENU_CATEGORY_NOT_EXPOSED`, `MENU_UNAVAILABLE` | Menü albümünün neden alınamadığı (galeri sunulmadı ya da kategorisiz sunuldu). |
| `MENU_READ_FAILED`, `PHOTOS_READ_FAILED` | Menü ya da galeri okunurken hata oluştu (galeri önce bir kez yeniden denenir). |
| `PHOTOS_UNAVAILABLE` | Genel fotoğraf bulunamadı. |
| `PHOTO_GALLERY_NOT_OPENED` | Fotoğraf galerisi açılamadı; `photos` yalnız mekânın genel bakışında görünen birkaç fotoğrafı içerir. Çoğunlukla geçicidir; mekânı yeniden okuyun. |
| `REVIEWS_UNAVAILABLE` | Yorum istendi ama mekânın puanı olduğu hâlde hiç yorum okunamadı. |
| `REVIEW_SORT_NOT_APPLIED` | İstenen `reviewSort` seçilemedi; yorumlar `sort_label` sırasındadır. |
| `REVIEWS_LIMIT_OR_SCROLL_LIMIT`, `MENU_IMAGE_LIMIT_OR_SCROLL_LIMIT`, `PHOTO_IMAGE_LIMIT_OR_SCROLL_LIMIT` | Sizin sınırınız bir listeyi durdurdu. Hata değildir; `maxReviews` / `maxReviewScrolls`, `maxMenuImages`, `maxImages` değerlerini artırın. |

`reviews.reason`: `REVIEW_TAB_NOT_FOUND`, `REVIEW_CARDS_NOT_LOADED`, `REVIEW_READ_FAILED` ya da büyük harfle sayfa durumu. `menu.reason`: `NO_MENU_CATEGORY` (mekânın menü fotoğrafı yok), `PHOTO_GALLERY_NOT_EXPOSED`, `MENU_CATEGORY_NOT_EXPOSED`.

## Sık sorulanlar

**Bazı yorumların kesin tarihi yok.** `date_iso` yalnız Google'ın kendi verisi görünen etiketle uyuştuğunda dolar; `date_estimate` ve `date_precision` her zaman vardır. Düzenlenmiş yorumların etiketinde düzenleme yaşı görünür, `date_iso` ise ilk yayın zamanıdır.

**Menü albümünde "Fotoğraf 1/N"de yazandan fazla fotoğraf var.** Şerit Google'ın seçkisini gösterir; görüntüleyicideki albüm Menü kategorisinin tamamıdır.

**Aynı fotoğrafın URL'si çalıştırmadan çalıştırmaya değişiyor.** Google fotoğraf URL'lerini tarayıcıya göre imzalar (`gps-cs-s/…`, `grass-cs/…`). Fotoğrafları URL ile değil `taken_at`, `width`, `height` ve `label` ile karşılaştırın.

**İki bilgisayarda sonuçlar farklı.** İki sonuçta da `view`'a bakın. Birinde sınırlı görünüm varsa o profilde sınırlı bir anonim kimlik vardır; `gmaps-view` onu onarır.

**Chrome Linux'ta başlamıyor.** `MAPS_CHROME_PATH`'i ayarlayın (ör. `/usr/bin/google-chrome`), root yerine normal bir kullanıcıyla çalıştırın ve çalışan her tarayıcıya ayrı bir profil klasörü verin.

**Maps güncellemesinden sonra seçiciler çalışmıyor.** Uydurulmuş veri değil, uyarılarla birlikte `unavailable` ya da `incomplete` alırsınız. Lütfen mekân linki ve uyarılarla bir issue açın.
