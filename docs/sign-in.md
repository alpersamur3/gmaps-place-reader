# Signing in for the full view

[Türkçe](tr/sign-in.md) · [Docs index](README.md)

Since late October 2026 Google Maps shows every **anonymous** browser its limited view: no Menu tab, no menu items or prices, usually no menu album, fewer details ([Full view](full-view.md)). A browser that is **signed in to a Google account** still gets the full view. The reader therefore lets you sign in once, in a visible Chrome window that uses the reader's own profile; afterwards the headless reader uses that profile and reads the full view.

Measured on 1 November 2026 with this library on a Linux server (Finland) and a Windows computer (Turkey): the signed-in profile read a restaurant with 189 menu items in 17 categories, the complete menu album and 11,218 reviews; the same place anonymously came back as `limited_view` with no menu at all.

## What you need

- A **Google account**. Use a dedicated one for the reader, not your personal account: the reader's traffic runs under it, and Google may ask it to verify itself.
- The reader's **profile folder** (`MAPS_PROFILE_DIR`, absolute path). The session lives there; keep the folder private and never copy it to another computer (see below).
- **Chrome** on the machine that will run the reader.

## Sign in where the reader runs

**Create the session on the machine that will use it.** Chrome binds Google sessions to the device they were created on (Device Bound Session Credentials: Chrome 146 and later on Windows and macOS). A profile signed in on your computer and copied to a server is signed out again within minutes to hours, as are exported cookies. A session created on the server itself stays. In our test a session created on a Linux server was still signed in and in the full view after an hour of headless use every 30 minutes; the limits beyond that are not known yet, so keep `gmaps-view` running from cron (below) and watch its `account` field.

### On a computer with a screen

```bash
MAPS_PROFILE_DIR=/absolute/private/profile npx gmaps-login
```

A Chrome window opens on Google's sign-in page. It is an ordinary window, not an automated one (Google refuses sign-ins in automated browsers), on the reader's profile. Sign in; the window closes by itself when Maps opens, and the profile is then checked headlessly:

```json
{"status":"ok","outcome":"signed_in_page","account":"signed_in","view":"full","profile":"/absolute/private/profile"}
```

Exit code `0` means signed in, `3` not signed in (`account` is `signed_out` or `unknown`), `2` an error. Press Ctrl+C to close the window early; the profile is checked as it is.

### On a server without a screen

The window runs on a virtual display and you drive it from your own computer through an SSH tunnel and Chrome's remote-debugging page. Needed on the server: the `xvfb` package (`apt install xvfb` on Debian/Ubuntu; it brings `xvfb-run` and `xauth`) and the user that will run the reader (never root).

1. Start the sign-in on the server, as the reader's user, with a fixed port:

   ```bash
   sudo -u reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-login --port 9222
   ```

   It prints what to do next and waits (15 minutes by default, `--timeout <minutes>`):

   ```
   Chrome is running on a virtual display; DevTools listens on 127.0.0.1:9222. From a computer with a screen:
     1. ssh -N -L 9222:127.0.0.1:9222 <user>@<this server>
     2. In Chrome open chrome://inspect/#devices, click "Configure…" and add 127.0.0.1:9222
     3. Under "Remote Target" click "inspect" on the Google page and sign in there.
   ```

2. On your computer, open the tunnel (the port only listens on the server's loopback interface, so the tunnel is the only way in) and the `chrome://inspect/#devices` page as described. The "inspect" link opens a DevTools window with a live screencast of the server's Chrome; type and click in it as in a normal browser and complete the sign-in, including a second factor if your account asks for one.

3. When Maps opens, `gmaps-login` closes the window on the server and checks the profile headlessly, as above. The profile is now ready for the reader on that server: set `MAPS_PROFILE_DIR` to it.

The server needs no desktop, no VNC and no open ports. `gmaps-login` never reads the pages or the cookies: it only looks at the list of open tab URLs to see when Maps has opened.

## Keep the session alive

Run `gmaps-view` from cron, hourly or so, with the same profile. It opens one place, reports `account` and `view`, and exits with `0` only for the full view. On a signed-in profile `--no-repair` is the right setting: it only reports and never starts temporary profiles (the anonymous repair would not help a signed-in profile anyway, and the reader leaves a signed-in profile's cookies alone).

```bash
# /etc/cron.d/gmaps-view — hourly, as the user that runs the reader
17 * * * * reader MAPS_CHROME_PATH=/usr/bin/google-chrome MAPS_PROFILE_DIR=/srv/gmaps/profile npx gmaps-view --no-repair >> /var/log/gmaps-view.log 2>&1
```

```json
{"status":"ok","view":"full","renewed":0,"account":"signed_in","profile":"/srv/gmaps/profile"}
```

When `account` turns `signed_out`, run `gmaps-login` again on that machine.

**One profile per running browser.** Chrome locks the profile folder. The cron check, your reader and a sign-in must not run on the same profile at the same time; on a server, `flock` around both commands is the simple way to serialise them. Workers that run in parallel need their own profiles, each signed in on its own (the same account may be signed in on several of them, like several devices).

## What changes in the results

- `readPlace`, `readPlaceUrl`, `gmaps-place` and `checkView` / `gmaps-view` report `account`: `signed_in`, `signed_out` or `unknown` (consent, sign-in or block pages). It is read from the Maps page's own header buttons; no account data is read or stored.
- A signed-in profile gets `view: 'full'` from its account. The anonymous-id repair (`recoverView`, `gmaps-view` without `--no-repair`) does nothing on a signed-in profile.
- The data is the same the anonymous full view used to return (menu items, album, About, reviews). Photo URLs come in the signed-in form (`gps-cs-s/…`), which downloads the same images.

## Privacy and responsibility

The reader stores the session only in your profile folder and never sends it anywhere. Reading Google Maps with an account still falls under the [Google Maps Terms of Service](https://www.google.com/help/terms_maps/); keep volumes low, pause between reads, and never bypass CAPTCHAs or verification steps (the reader stops at them). A dedicated account limits what is at stake if Google restricts it.
