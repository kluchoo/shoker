# Shoker

Poker shotów w sieci lokalnej. Karty rozdajecie na stole — aplikacja prowadzi kolejkę, stawki w kieliszkach i ruletkę wypicia.

## Wymagania

- Node.js 18+
- Telefony / laptopy w tej samej sieci Wi‑Fi co host

## Uruchomienie

```bash
npm install
npm start
```

Serwer startuje na porcie **3000** i nasłuchuje na wszystkich interfejsach (`0.0.0.0`).

W terminalu zobaczysz adresy LAN. Otwórz jeden z nich w przeglądarce albo zeskanuj kod QR z ekranu hosta.

## Jak grać

1. Pierwsza osoba, która wejdzie i poda nick, staje się **hostem**.
2. Reszta dołącza z telefonów (QR lub link). Max **8** graczy.
3. Host ustawia stawkę i startuje rozdanie.
4. Karty rozdajecie fizycznie. W aplikacji każdy po kolei:
   - **wchodzi** (dokłada stawkę wejścia),
   - idzie **all-in**, albo
   - **pasuje**.
5. Po okrążeniu host odsłania kolejne karty wspólne (jak we flop / turn / river).
6. Na showdown host wskazuje zwycięzcę.
7. Przegrani z stawką kręcą **ruletkę** — im dalej poszli w rozdaniu, tym więcej komór jest „gorących”.

### Ustawienia (host)

| Parametr | Domyślnie | Znaczenie |
| --- | --- | --- |
| Wejście | 1 | Kieliszki za wejście w ulicę |
| All-in | 3 | Kieliszki za all-in |
| Komory | 5 | Liczba komór w ruletce |
| Soplica | 5% | Szansa, że all-in nic nie pije („Tadeusz Soplica ratuje”) |

Ryzyko w ruletce rośnie z ulicą: po flopie więcej komór jest załadowanych niż na starcie. All-in ładuje wszystkie komory, z szansą Soplicy.

### Uprawnienia hosta

- zmiana ustawień (lobby / między rozdaniami)
- start i kolejne rozdanie
- odsłanianie kart / wybór zwycięzcy
- kolejność graczy, kick, pominięcie tury (fold)

## Stack

- **Express** — statyczny frontend z `public/`
- **Socket.IO** — synchronizacja stołu na żywo
- **QRCode** — linki dołączenia w LAN
- **GSAP** — animacje (m.in. ruletka)

## Struktura

```
server.js          logika gry + serwer
public/
  index.html
  client.js
  style.css
```

## Uwagi

- Gra jest przeznaczona do zabawy w gronie dorosłych. Pijcie odpowiedzialnie.
- Działa w jednej sesji procesu Node — po restarcie serwera stół znika.
