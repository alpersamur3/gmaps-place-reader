# Tam görünüm

[English](../full-view.md) · [Doküman dizini](README.md)

Google Maps bir mekân sayfasını iki sürümden birinde gösterir:

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

**Ekim 2026 sonundan beri tam görünüm için oturum açık bir profil gerekir.** Google artık her oturumsuz tarayıcıya sınırlı görünümü veriyor: yeni anonim kimliklerin hepsi sınırlıydı (Türkiye'de ve AB'de 8'de 8), Ekim başında tam görünüm alan bir kimlik sınırlı görünüm alıyor, elle başlatılan bir Chrome da öyle. Google hesabıyla oturum açmış bir tarayıcı ise tam görünümü almaya devam ediyor; bu yüzden okuyucu, profilinde `gmaps-login` ile bir kez oturum açmanıza izin verir, ekranı olmayan bir sunucuda da: [Tam görünüm için oturum açma](sign-in.md). Google aynısını Şubat 2026'da oturumsuz kullanıcılara yapmış ve yaklaşık bir hafta sonra geri almıştı; oturumsuz tam görünümün ne zaman döndüğünü `gmaps-view` gösterir.

Bu sayfanın geri kalanı **oturumsuz** görünümü anlatır; Ekim 2026 başında bu kütüphaneyle, AB'deki (Finlandiya) bir sunucudan ve Türkiye'deki bir bilgisayardan ölçüldü. Okuyucunun oturumsuz profilleri nasıl ele aldığı için hâlâ geçerlidir.

## Oturumsuz görünümü ne belirliyor

Hesapsız bir tarayıcıda **anonim kimlik çerezi** belirliyor:

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

### Hesaplar ve taşınan oturumlar

Ekim 2026'ya kadar hesap bir şey kazandırmıyordu (yukarıya bakın), bu yüzden okuyucu oturum açmıyordu. Çerez dosyası yüklemeyi hâlâ yapmaz: Google, çerezleri başka bir makineye taşınan oturumları iptal eder (testlerimizde içe aktarılan oturumlar sunucuya ulaştıktan yaklaşık beş dakika ile iki saat arasında kapandı, çerezler bir daha kullanılmayan gizli bir pencereden alındığında da). Chrome, Google oturumunu oluşturulduğu cihaza bağlar (Device Bound Session Credentials); `gmaps-login`'in oturumu okuyucunun çalıştığı makinede oluşturması bu yüzdendir. Bu yolla Linux bir sunucuda oluşturulan oturum headless kullanımda açık kaldı ([Oturum açma](sign-in.md)).

## Okuyucu tam görünümü nasıl korur

1. **Kalıcı bir profil kullanın** (`MAPS_PROFILE_DIR` ya da `launchBrowser({ userDataDir })`, mutlak yol). Anonim kimlik, ya da `gmaps-login` sonrasında açık oturum, profilde saklanır. Profil olmadan her başlatma yeni ve rastgele bir kimlikle başlar.
2. **`readPlace` içinde onarım** (`recoverView` seçeneği, varsayılan `true`), oturumsuz profiller için. Oturum açık profil tam görünümü hesabından alır ve çerezlerine dokunulmaz. Oturumsuz bir mekân sınırlı gelirse şu adımlar sırayla çalışır:
   1. **Bir kez yeniden yükle.** Yeni bir profil kimliğini ilk sayfayla alır; kimlik ancak bir sonraki istekten itibaren geçerli olur.
   2. **Yenile.** Aynı Chrome ile, biri tam görünüm alana kadar en çok altı yeni geçici profil başlatılır. Onun anonim kimlik çerez(ler)i sınırlı olanların yerine sizin profilinize taşınır ve mekân yeniden yüklenir. Her geçici profil yaklaşık 10–20 sn sürer ve ardından silinir.
   3. **Hiçbir geçici profil tam görünüm alamazsa** (Ekim 2026 sonundan beri olağan durum; öncesinde seyrekti: profil başına %50 olasılıkla yaklaşık %1–2, ya da Google hiç kimlik vermiyorsa), mekân olduğu gibi döner: `status: 'limited_view'`, `view: 'limited'`, uyarı `LIMITED_VIEW`. Tarayıcı işaretlenir ve sonraki mekânlar için yeniden denenmez; onlar da sınırlı görünümde okunur ve her sonuç bunu söyler. Bir sonraki tarayıcı başlatma ya da bir sonraki `gmaps-view` yeniden dener; `recoverView: false` denemeyi atlar.
3. **Cron ile denetleyin.** `gmaps-view` iyi bilinen bir mekânı açar, `"view"` ve `"account"` bildirir ve sınırlı oturumsuz görünümü aynı yolla onarır (`--no-repair` yalnız bildirir). Çıkış kodu `0` tam görünüm, `3` sınırlı demektir. Oturum açık profilde oturumu da canlı tutar.

   ```bash
   # /etc/cron.d/gmaps-view — saatte bir, okuyucuyu çalıştıran kullanıcıyla
   17 * * * * reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view >> /var/log/gmaps-view.log 2>&1
   ```

   ```json
   {"status":"ok","view":"full","renewed":0,"account":"signed_out","profile":"/srv/gmaps/profile"}
   ```

### Her sonuç hangi görünümü aldığını söyler

- `readPlace` / `readPlaceUrl`: `view` (`full` · `limited` · `unknown`: onay, oturum açma ya da engel sayfası veya yüklenmeyen mekân paneli), `view_renewed` (bu mekân için kaç kimlik getirildi), `account` (`signed_in` · `signed_out` · `unknown`), `status`, `warnings` ve `data_quality`.
- `scan` kayıtları ve `toObservation`: `view`, `warnings`, `source_error`.
- `gmaps-place`: hem en üst düzeyde hem `place` içinde `view` ve `account`.

### Pratik notlar

- **Çalışan her tarayıcıya bir profil.** Chrome profil klasörünü kilitler. Paralel çalışanlar için ayrı profiller kullanın; her biri kendi kimliğini alır.
- **Aynı işletim sistemi.** Linux'ta verilen bir kimlik yalnız Linux user agent'ıyla çalışır. Profilleri işletim sistemleri arasında kopyalamayın.
- **Toplu denemeden kaçının.** Testlerimizde aynı adresten kısa sürede çok yeni kimlik oluşturmak daha çok sınırlı kimlik verdi. Okuyucu kimliği yalnız gerektiğinde oluşturur; kalıcı bir profil iyi bir kimliği aylarca tutar.
- **Profili gizli tutun.** Oturumsuz profil tarayıcıyı tanımlar; oturum açık profil hesabın oturumunu taşır.

