# Hesapsız tam görünüm

[English](../full-view.md) · [Doküman dizini](README.md)

Google Maps, oturumsuz tarayıcılara bir mekân sayfasının iki sürümünden birini gösterir:

| | Sınırlı görünüm | Tam görünüm |
|---|---|---|
| Ad, adres, telefon, web sitesi, puan, koordinat | var | var |
| Yorum sayısı | çoğu zaman gizli | var |
| Yedi günün çalışma saatleri | çoğu zaman yalnız bugün | var |
| Fiyat aralığı | yok | var |
| Hakkında sekmesi (özellikler) | birkaç tane ya da hiç | hepsi |
| Menü sekmesi: ürünler, fiyatlar, kategoriler | **yok** | var |
| Menü fotoğraf albümü | nadiren, çoğu zaman tek fotoğraf | var, her fotoğrafın çekildiği ayla |
| Yorumlar sekmesi | bazen yok | var |

Tam görünüm için Google hesabı gerekmez. Aşağıdaki her şey Ekim 2026'da bu kütüphaneyle, AB'deki (Finlandiya) bir sunucudan ve Türkiye'deki bir bilgisayardan ölçüldü.

## Görünümü ne belirliyor

Tarayıcının **anonim kimlik çerezi** belirliyor:

- AB'nin çerez onayı bölgesinde bu çerez `__Secure-ENID`'dir. Google onu ilk Maps sayfasıyla, onay sayfasından sonra verir; okuyucu onay sayfasında "Tümünü reddet"i seçer. Yaklaşık 13 ay yaşar.
- Başka yerlerde çerez `NID`'dir (yaklaşık 6 ay). Türkiye'de onay sayfası çıkmaz ve ENID verilmez.

Google her kimliği iki sınıftan birinde verir ve kimlik o sınıfta kalır. Testlerimizde yeni kimliklerin Türkiye'de yaklaşık yarısı, AB'de yaklaşık üçte ikisi tam sınıftaydı.

| Gözlem | Sonuç |
|---|---|
| Tam sınıf bir kimlik, hep sınırlı kimlik almış bir profile kopyalandı | İlk yüklemeden itibaren tam görünüm; yeniden başlatmalarda da kalıyor. |
| Aynı kimlik başka bir IP adresinden (sunucu → ev bilgisayarı) | Çalışıyor. |
| Aynı kimlik başka bir işletim sisteminin user agent'ıyla (Linux kimliği, Windows user agent'ı) | Sınırlı. Linux user agent'ıyla tam. Chrome sürümü fark etmiyor. |
| Sınırlı bir profilde kimliği (ve SOCS, `__Secure-BUCKET`, `SEARCH_SAMESITE`'ı) silmek | Profil yine sınırlı bir kimlik alıyor. |
| Tam bir profilin Chrome `Local State` dosyasını (deney grupları) kopyalamak | Etkisi yok. |
| Oturum açık bir profilin NID'si tek başına | Sınırlı. Oturum açmak anonim kimliğin sınıfını yükseltmiyor. |

### Oturumla aynı veri

Aynı mekân aynı ayarlarla iki kez okundu: bir kez oturum açık bir profille, bir kez oturumsuz tam görünümlü bir profille. Sonuçlar birebir aynıydı:

- İşletme bilgileri (ad, adres, telefon, web sitesi, puan, yorum sayısı, fiyat aralığı, koordinat, 7 günlük saat) ve Hakkında'daki 51 özelliğin 51'i.
- Menü: 187 ürünün 187'si ve 23 kategorinin 23'ü.
- Menü albümü: aynı 40 fotoğraf aynı sırayla (ay, boyut ve etikete göre). Yalnız URL biçimi farklı (oturumlu `gps-cs-s/…`, oturumsuz `grass-cs/…`); ikisi de aynı görseli indiriyor.
- Yorumlar: "en yeni" sırasında aynı 100 yorum (kimliğe göre). 100'ünün de kesin tarihi vardı, 87'sinde detay vardı.

AB'deki sunucuda oturumsuz profiller ayrıca şunları da okudu: en yeni 300 yorum (hepsi kesin tarihli), menü albümünün tamamı, `maps.app.goo.gl` paylaşım linki dahil desteklenen her link biçimi ve çok mekânlı taramalar.

### Neden hesap yok

Okuyucu hiçbir zaman oturum açmaz ve çerez yüklemez. Google hesabı bir şey kazandırmaz (yukarıya bakın); üstelik Google, çerezleri başka bir makineye taşınan oturumları iptal eder: testlerimizde içe aktarılan oturumlar sunucuya ulaştıktan yaklaşık beş dakika ile iki saat arasında kapandı, çerezler bir daha kullanılmayan gizli bir pencereden alındığında da.

## Okuyucu tam görünümü nasıl korur

1. **Kalıcı bir profil kullanın** (`MAPS_PROFILE_DIR` ya da `launchBrowser({ userDataDir })`, mutlak yol). Anonim kimlik profilde saklanır. Profil olmadan her başlatma yeni ve rastgele bir kimlikle başlar.
2. **`readPlace` içinde onarım** (`recoverView` seçeneği, varsayılan `true`). Bir mekân sınırlı gelirse şu adımlar sırayla çalışır:
   1. **Bir kez yeniden yükle.** Yeni bir profil kimliğini ilk sayfayla alır; kimlik ancak bir sonraki istekten itibaren geçerli olur.
   2. **Yenile.** Aynı Chrome ile, biri tam görünüm alana kadar en çok altı yeni geçici profil başlatılır. Onun anonim kimlik çerez(ler)i sınırlı olanların yerine sizin profilinize taşınır ve mekân yeniden yüklenir. Her geçici profil yaklaşık 10–20 sn sürer ve ardından silinir.
   3. **Hiçbir geçici profil tam görünüm alamazsa** (seyrek: profil başına %50 olasılıkla yaklaşık %1–2; ya da Google hiç kimlik vermiyorsa), mekân olduğu gibi döner: `status: 'limited_view'`, `view: 'limited'`, uyarı `LIMITED_VIEW`. Tarayıcı işaretlenir ve sonraki mekânlar için yeniden denenmez; onlar da sınırlı görünümde okunur ve her sonuç bunu söyler. Bir sonraki tarayıcı başlatma ya da bir sonraki `gmaps-view` yeniden dener.
3. **Cron ile denetleyin.** `gmaps-view` iyi bilinen bir mekânı açar, `"view"` bildirir ve sınırlı görünümü aynı yolla onarır. Çıkış kodu `0` tam görünüm, `3` sınırlı demektir.

   ```bash
   # /etc/cron.d/gmaps-view — saatte bir, okuyucuyu çalıştıran kullanıcıyla
   17 * * * * reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view >> /var/log/gmaps-view.log 2>&1
   ```

   ```json
   {"status":"ok","view":"full","renewed":0,"profile":"/srv/gmaps/profile"}
   ```

### Her sonuç hangi görünümü aldığını söyler

- `readPlace` / `readPlaceUrl`: `view` (`full` · `limited` · `unknown`), `view_renewed` (bu mekân için kaç kimlik getirildi), `status`, `warnings` ve `data_quality`.
- `scan` kayıtları ve `toObservation`: `view`, `warnings`, `source_error`.
- `gmaps-place`: hem en üst düzeyde hem `place` içinde `view`.

### Pratik notlar

- **Çalışan her tarayıcıya bir profil.** Chrome profil klasörünü kilitler. Paralel çalışanlar için ayrı profiller kullanın; her biri kendi kimliğini alır.
- **Aynı işletim sistemi.** Linux'ta verilen bir kimlik yalnız Linux user agent'ıyla çalışır. Profilleri işletim sistemleri arasında kopyalamayın.
- **Toplu denemeden kaçının.** Testlerimizde aynı adresten kısa sürede çok yeni kimlik oluşturmak daha çok sınırlı kimlik verdi. Okuyucu kimliği yalnız gerektiğinde oluşturur; kalıcı bir profil iyi bir kimliği aylarca tutar.
- **Profili gizli tutun.** Bir hesap bilgisi değildir ama tarayıcıyı tanımlar.

