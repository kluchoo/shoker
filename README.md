# Shoker

Poker shotów w sieci lokalnej. Karty rozdajecie na stole — aplikacja prowadzi kolejkę, stawki w kieliszkach i ruletkę wypicia.

Możesz hostować stół z **komputera** (`npm start`) albo z **telefonu Android** (APK z wbudowanym Node.js). Gracze zawsze dołączają przez przeglądarkę.

## Wymagania

### Desktop

- Node.js 18+
- Telefony / laptopy w tej samej sieci Wi‑Fi co host

### Android (host)

- Telefon Android 8.0+ (API 26)
- Hotspot Wi‑Fi (uczestnicy łączą się z siecią telefonu hosta)
- Do budowy APK: JDK 17+, Android SDK, NDK, CMake

## Uruchomienie (desktop)

```bash
npm install
npm start
```

Serwer startuje na porcie **3000** i nasłuchuje na `0.0.0.0`.

W terminalu zobaczysz adresy LAN. Otwórz jeden z nich w przeglądarce albo zeskanuj kod QR z ekranu lobby.

## Android — host z telefonu

Aplikacja `pl.shoker.host` uruchamia ten sam `server.js` wewnątrz procesu (nodejs-mobile 18.20.4) w **Foreground Service**, pokazuje IP, QR i liczbę graczy. Pozostali gracze **nie instalują** APK — wchodzą przeglądarką na `http://<IP>:3000`.

### Debug na telefonie / emulatorze

Telefon: włącz **Opcje deweloperskie** → **Debugowanie USB**, podłącz kabel i zaakceptuj fingerprint ADB.

```bash
npm install
npm run android:run
```

To zbuduje debug APK (`pl.shoker.host.debug`), wgra go na pierwsze urządzenie `adb` i uruchomi aplikację.

```bash
npm run android:emulator   # start AVD Pixel_9_Pro_XL_API_35
npm run android:logcat     # logi Node / HostService
```

W Cursorze: **Terminal → Run Task…** → `android: install + launch (device/emulator)`  
albo **Run and Debug** → `Shoker: Install & Launch`.

**Breakpointy / debugger:** otwórz folder `android/` w Android Studio → konfiguracja **Shoker Debug** → 🐞 Debug.

### Budowa APK

```bash
npm install
npm run android:prepare
cd android
gradlew.bat :app:assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`  
(package debug: `pl.shoker.host.debug`)

`android:prepare` bundluje `server.js`, `public/`, `node_modules` oraz pobiera `libnode.so`.

### Jak hostować z APK

1. Zainstaluj APK na telefonie hosta.
2. Włącz **hotspot** (aplikacja nie może go włączyć automatycznie — jest przycisk do ustawień).
3. Jeśli producent oferuje opcję, wyłącz **izolację klientów AP**, żeby urządzenia widziały hosta.
4. W Shokerze naciśnij **Utwórz stół**.
5. Poczekaj na status **Aktywny**, pokaż QR / skopiuj link.
6. Goście łączą się z hotspotem i otwierają link w przeglądarce.
7. Na telefonie hosta możesz też wybrać **Graj na tym telefonie** (`http://127.0.0.1:3000`).
8. **Zakończ stół** zatrzymuje HTTP i Foreground Service.

Przykładowy adres (zależy od telefonu): `http://192.168.43.1:3000` — aplikacja wykrywa rzeczywisty IPv4, nie hardcoduje go.

## Jak grać

1. Pierwsza osoba, która wejdzie i poda nick, staje się **hostem gry** (to osobna rola od hosta sieci / APK).
2. Reszta dołącza z telefonów (QR lub link). Max **8** graczy.
3. Host ustawia stawkę i startuje rozdanie.
4. Karty rozdajecie fizycznie. W aplikacji każdy po kolei:
   - **wchodzi** (dokłada stawkę wejścia),
   - idzie **all-in**, albo
   - **pasuje**.
5. Po okrążeniu host odsłania kolejne karty wspólne (jak we flop / turn / river).
6. Na showdown host wskazuje zwycięzcę.
7. Przegrani z stawką kręcą **ruletkę** — im dalej poszli w rozdaniu, tym więcej komór jest „gorących”.

### Ustawienia (host gry)

| Parametr | Domyślnie | Znaczenie |
| --- | --- | --- |
| Wejście | 1 | Kieliszki za wejście w ulicę |
| All-in | 3 | Kieliszki za all-in (min. 3× wejście: rozdanie + flop + turn) |
| Komory | 5 | Liczba komór w ruletce |
| Soplica | 5% | Szansa, że all-in nic nie pije („Tadeusz Soplica ratuje”) |

### Uprawnienia hosta gry

- zmiana ustawień (lobby / między rozdaniami)
- start i kolejne rozdanie
- odsłanianie kart / wybór zwycięzcy
- kolejność graczy, kick, pominięcie tury (fold)

## Stack

- **Express** + **Socket.IO** — gra i synchronizacja
- **QRCode** — QR w lobby przeglądarki; APK generuje własne QR (ZXing)
- **GSAP** — animacje
- **Android / Kotlin** — host UI, Foreground Service, JNI → `libnode.so` (nodejs-mobile)

## Struktura

```
server.js              logika gry + start/stop HTTP
android-entry.js       entry pod Android (kontroler :3010)
public/                frontend przeglądarki
scripts/prepare-android-assets.js
android/               natywna aplikacja hosta
```

## Uwagi

- Gra jest przeznaczona do zabawy w gronie dorosłych. Pijcie odpowiedzialnie.
- Sesja żyje w pamięci procesu Node — restart serwera / „Zakończ stół” czyści stół.
- Runtime Android: Node 18 (nodejs-mobile). Desktop może używać nowszego Node.
- `POST /api/shutdown` i kontroler `:3010` przyjmują tylko localhost.
