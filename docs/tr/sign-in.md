# Tam görünüm için oturum açma

[English](../sign-in.md) · [Doküman dizini](README.md)

Ekim 2026 sonundan beri Google Maps her **oturumsuz** tarayıcıya sınırlı görünümü gösteriyor: Menü sekmesi yok, ürün ve fiyat yok, çoğu zaman menü albümü yok, daha az bilgi ([Tam görünüm](full-view.md)). **Google hesabıyla oturum açmış** bir tarayıcı ise tam görünümü almaya devam ediyor. Bu yüzden okuyucu, kendi profilini kullanan görünür bir Chrome penceresinde bir kez oturum açmanıza izin verir; sonrasında görünmez (headless) okuyucu o profili kullanır ve tam görünümü okur.

1 Kasım 2026'da bu kütüphaneyle, Linux bir sunucuda (Finlandiya) ve Windows bir bilgisayarda (Türkiye) ölçüldü: oturum açık profil bir restoranı 17 kategoride 189 menü ürünü, menü albümünün tamamı ve 11.218 yorumla okudu; aynı mekân oturumsuz okunduğunda `limited_view` döndü ve hiç menü gelmedi.

## Gerekenler

- Bir **Google hesabı**. Kişisel hesabınızı değil, okuyucuya ayrılmış bir hesap kullanın: okuyucunun trafiği bu hesaptan gider ve Google hesaptan doğrulama isteyebilir.
- Okuyucunun **profil klasörü** (`MAPS_PROFILE_DIR`, mutlak yol). Oturum burada yaşar; klasörü gizli tutun ve başka bir bilgisayara asla kopyalamayın (aşağıya bakın).
- Okuyucuyu çalıştıracak makinede **Chrome**.

## Oturumu okuyucunun çalıştığı yerde açın

**Oturumu, onu kullanacak makinede oluşturun.** Chrome, Google oturumlarını oluşturuldukları cihaza bağlar (Device Bound Session Credentials: Windows ve macOS'ta Chrome 146 ve sonrası). Bilgisayarınızda oturum açılıp sunucuya kopyalanan bir profil dakikalar ile saatler içinde yeniden kapatılır; dışa aktarılan çerezler de öyle. Sunucunun kendisinde oluşturulan oturum ise kalır. Testimizde Linux bir sunucuda oluşturulan oturum, 30 dakikada bir headless kullanımla bir saat sonra hâlâ açıktı ve tam görünümdeydi; bunun ötesindeki sınırlar henüz bilinmiyor, bu yüzden `gmaps-view`'u cron'dan çalıştırın (aşağıda) ve `account` alanını izleyin.

### Ekranı olan bir bilgisayarda

```bash
MAPS_PROFILE_DIR=/mutlak/ozel/profil npx gmaps-login
```

Google'ın oturum açma sayfasında bir Chrome penceresi açılır. Bu, okuyucunun profilini kullanan sıradan bir penceredir, otomasyonlu değildir (Google otomasyonlu tarayıcılarda oturum açmayı reddeder). Oturum açın; Maps açıldığında pencere kendiliğinden kapanır ve profil headless olarak denetlenir:

```json
{"status":"ok","outcome":"signed_in_page","account":"signed_in","view":"full","profile":"/mutlak/ozel/profil"}
```

Çıkış kodu `0` oturum açık, `3` oturum açık değil (`account` `signed_out` ya da `unknown`), `2` hata demektir. Pencereyi erken kapatmak için Ctrl+C'ye basın; profil olduğu gibi denetlenir.

### Ekranı olmayan bir sunucuda

Pencere sanal bir ekranda çalışır; siz onu kendi bilgisayarınızdan SSH tüneli ve Chrome'un uzaktan hata ayıklama sayfasıyla yönetirsiniz. Sunucuda gerekenler: `xvfb` paketi (Debian/Ubuntu'da `apt install xvfb`; `xvfb-run` ve `xauth` ile gelir) ve okuyucuyu çalıştıracak kullanıcı (asla root değil).

1. Sunucuda oturum açmayı okuyucunun kullanıcısıyla ve sabit bir portla başlatın:

   ```bash
   sudo -u reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-login --port 9222
   ```

   Ne yapacağınızı yazar ve bekler (varsayılan 15 dakika, `--timeout <dakika>`):

   ```
   Chrome is running on a virtual display; DevTools listens on 127.0.0.1:9222. From a computer with a screen:
     1. ssh -N -L 9222:127.0.0.1:9222 <user>@<this server>
     2. In Chrome open chrome://inspect/#devices, click "Configure…" and add 127.0.0.1:9222
     3. Under "Remote Target" click "inspect" on the Google page and sign in there.
   ```

2. Bilgisayarınızda tüneli açın (port yalnız sunucunun loopback arayüzünde dinler; içeri girmenin tek yolu tüneldir) ve `chrome://inspect/#devices` sayfasını tarif edildiği gibi kullanın. "inspect" bağlantısı, sunucudaki Chrome'un canlı ekran yayınını gösteren bir DevTools penceresi açar; içinde normal bir tarayıcıdaki gibi yazın ve tıklayın, hesabınız istiyorsa ikinci adımı da tamamlayarak oturumu açın.

3. Maps açıldığında `gmaps-login` sunucudaki pencereyi kapatır ve profili yukarıdaki gibi headless denetler. Profil artık o sunucudaki okuyucu için hazırdır: `MAPS_PROFILE_DIR`'i ona ayarlayın.

Sunucuda masaüstü, VNC ya da açık port gerekmez. `gmaps-login` sayfaları ve çerezleri hiç okumaz; Maps'in ne zaman açıldığını görmek için yalnız açık sekmelerin adres listesine bakar.

## Oturumu canlı tutun

`gmaps-view`'u aynı profille cron'dan, saatte bir gibi çalıştırın. Bir mekân açar, `account` ve `view` bildirir ve yalnız tam görünümde `0` ile çıkar. Oturum açık profilde doğru ayar `--no-repair`'dir: yalnız bildirir, geçici profil başlatmaz (anonim onarım oturum açık profile zaten yaramaz; okuyucu oturum açık profilin çerezlerine dokunmaz).

```bash
# /etc/cron.d/gmaps-view — saatte bir, okuyucuyu çalıştıran kullanıcıyla
17 * * * * reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view --no-repair >> /var/log/gmaps-view.log 2>&1
```

```json
{"status":"ok","view":"full","renewed":0,"account":"signed_in","profile":"/srv/gmaps/profile"}
```

`account` `signed_out` olursa o makinede `gmaps-login`'i yeniden çalıştırın.

**Çalışan her tarayıcıya bir profil.** Chrome profil klasörünü kilitler. Cron denetimi, okuyucunuz ve bir oturum açma aynı profilde aynı anda çalışmamalı; sunucuda iki komutu da `flock` ile sarmak en basit sıraya koyma yoludur. Paralel çalışanların kendi profilleri olmalı ve her biri kendi başına oturum açmalı (aynı hesap birkaç cihaz gibi birkaç profilde açık olabilir).

## Sonuçlarda ne değişir

- `readPlace`, `readPlaceUrl`, `gmaps-place` ve `checkView` / `gmaps-view` `account` bildirir: `signed_in`, `signed_out` ya da `unknown` (onay, oturum açma ya da engel sayfaları). Maps sayfasının kendi başlık düğmelerinden okunur; hesap verisi okunmaz, saklanmaz.
- Oturum açık profil `view: 'full'` değerini hesabından alır. Anonim kimlik onarımı (`recoverView`, `--no-repair`siz `gmaps-view`) oturum açık profilde hiçbir şey yapmaz.
- Veri, eskiden oturumsuz tam görünümün döndürdüğüyle aynıdır (menü ürünleri, albüm, Hakkında, yorumlar). Fotoğraf URL'leri oturumlu biçimde (`gps-cs-s/…`) gelir; aynı görselleri indirir.

## Gizlilik ve sorumluluk

Okuyucu oturumu yalnız profil klasörünüzde saklar ve hiçbir yere göndermez. Hesapla Google Maps okumak da [Google Haritalar Hizmet Şartları](https://www.google.com/help/terms_maps/) kapsamındadır; hacmi düşük tutun, okumalar arasında bekleyin, CAPTCHA ve doğrulama adımlarını asla atlatmayın (okuyucu onlarda durur). Okuyucuya ayrılmış bir hesap, Google kısıtlarsa kaybı sınırlar.
