# Audit: Der Weg des Spielers — Kaltstart, lokales Match, Online, Abbruch, Tastatur

**Auftrag:** Rein lesende Prüfung der ABLÄUFE (nicht der Pixel) vom ersten
Seitenaufruf bis zum Spielende, jeder Übergang, jeder Fehlerfall, mit Belegstelle
und wörtlichem Zitat. Dazu die Gegenprüfung vorhandener Berichte gegen den Code.

**Datum:** 2026-09-27, ~09:30–09:40 CEST
**git-Stand:** `main`. Während der Prüfung landete ein Commit des parallel
arbeitenden Autors: `fd4afc2 refactor(engine): Textanker durch Verhalten ersetzt
— Fund 1 UND Fund 5 jetzt wirklich behoben` (09:33), unmittelbar zuvor war
HEAD `a49e805`. Ein Teil der Sondierung lief also gegen `a49e805`, ein Teil
gegen `fd4afc2`.

Der Arbeitsbaum war zu Beginn schmutzig (`M src/engine/match.js`,
`M tests/reichweite-konsistenz.test.js`, `M tests/turret-ballistics.test.js`,
`M tests/turret-zerlegung.test.js`, `M docs/duplikate-bericht.md`,
`M docs/zerlegung-turret.md`) und ist am Ende **sauber** (`git status --short`
zeigt nur die zwei neuen, ungetrackten Berichte).

**Nachgezogen nach dem Commit:** Alle `src/engine/match.js`-Fundstellen dieses
Berichts wurden gegen `fd4afc2` nachgeprüft und stimmen weiter
(`match.js:734` Prüfaufruf, `:748` `this.erreichbarkeit`, `:755` `karte_unerreichbar`,
`:2831` `turn_start`). Der Commit hat Textanker ersetzt, nicht diese Stellen.

**Gelesen:** `index.html` (vollständig, Struktur + Kommentare), `src/client/main.js`
(vollständig überflogen, Ablaufstellen vollständig), `src/client/input.js` (voll),
`src/client/dom.js` (voll), `src/client/networkClient.js` (voll),
`src/client/ereignisse.js` (Tabelle + Einstiege voll),
Auszüge `src/client/hud.js`, `src/server/gameServer.js` (Lebenszyklus, Join,
Close, PING, Broadcast), `src/server/lobby.js` (join/disconnect/prune),
`tests/abort-knopf.test.js` (voll), `tests/event-coverage.test.js` (Regeln +
`EINZWEIG_BELEGT`), `tests/server-integration.test.js` (PING/Rejoin-Teil),
`tests/e2e/prediction-gpu.spec.mjs` (Tastatur-Teil), `README.md` (Steuerung),
`docs/hunter-ui.md`, `docs/audit-userflow.md`,
`docs/auftraege/online-sprung-und-abwurf.md` (Kopf + A.1),
`docs/auftraege/zerlegung-schritt3/4-*.md` (nicht inhaltlich geprüft).

**Maßnahme:** Nur Einzelgreps, `read_file`, `sed` und zwei Wegwerf-Skripte in
`/tmp` (`node /tmp/probe-events.mjs` — zählt die Zweige in `EREIGNIS_WIRKUNGEN`).
**Kein** `npm test`, `npm run checks`, `npm run build`, kein Dev-Server, kein
Browser. Geschrieben wurde **genau eine** Datei: diese.

## Was ich NICHT geprüft habe
- Kein Testlauf, kein Build, kein Browser, kein Dev-Server → **keine**
  Laufzeitmessung. Alle Aussagen sind Codepfad-Analysen mit Fundstelle, keine
  Messwerte.
- **`docs/abort-*` existiert nicht.** Der Auftrag nennt solche Dateien; im
  Baum gibt es keine (`ls docs/ | grep -i abort` → leer). Was es gibt, ist
  `tests/abort-knopf.test.js` und `docs/auftraege/online-sprung-und-abwurf.md` —
  beide sind unten gegen den Code geprüft.
- Darstellung, Layout, Farben, Kontraste („nicht die Pixel").
- Ob ein E2E-Test aktuell grün oder rot ist (nicht ausführbar unter dem Verbot);
  wo ich einen Test für rot halte, steht die Begründung aus dem Codepfad dabei.
- `docs/auftraege/zerlegung-schritt3-ereignisse.md` und
  `-schritt4-zustand-und-schuss.md` inhaltlich (Zeitbudget; nur ihre Existenz
  festgestellt).

---

## Ablauf 1: Kaltstart — was sieht der Mensch zuerst?

| Schritt | Funktion (datei:zeile) | Was der Spieler sieht | Ausgang bei Fehler |
|---|---|---|---|
| Seite laden | `index.html:669-1055` | Overlay „Project **Armageddon**" + Untertitel: „Rundenbasierte 2D-Artillerie-Taktik. Zerstöre das Terrain, lies den Wind und schalte die gegnerischen Teams aus, bevor der Mahlstrom alles verschlingt." (`index.html:780-783`) | – |
| Felder | `startFromMenu` `main.js:353-406` | Teams (2–8), Einheiten je Spieler (3/4/5), Kulisse, Ausrichtung, Seed, Server-URL, Lobby-ID | Alle Felder haben Vorgaben → Start ohne jede Eingabe möglich |
| Start | `#bindMenu` `main.js:205` → `startMatch` `main.js:733` | Canvas füllt sich mit der Karte, Protokoll: „Lokales Match — Seed 4242" (`main.js:776`) | `seed` leer → Zufallskarte |
| Erster Schuss | **nicht geführt** | Der Spieler muss selbst finden: `#keymap` `index.html:1026-1036` | – |

**Einzige Führung zum ersten Schuss ist die Keymap am Kartenende**
(`index.html:1026-1036`, immer sichtbar, kein `<details>`): „Maus Zielen",
„Klick / Leertaste Aufladen und feuern", „Enter Sofort feuern", „A / D Winkel
feinjustieren", „W / S Kraft ändern", „1–9 Waffe wählen", „Q Waffe abwerfen",
„R Neustart". Dieselbe Liste steht im `aria-label` des Canvas
(`index.html:676`).

**Nicht selbsterklärend (Befund B-1 und A-1):**

1. **Die Kraft steht nirgends am Anfang.** Das Spiel startet mit Kraft 55
   (`main.js:114` `this.aim = { angle: Math.PI / 4, power: 55 }`,
   `input.reset(firstAngle, 55)` in `#afterWorldReady` `main.js:1858`), aber der
   einzige Weg, sie zu ändern, ist `W`/`S` — und zwar **ein Tipp = 1 Punkt**
   (`input.js:116-123`). Von 55 auf 100 sind das 45 Tastendrücke.
2. **Halten wirkt nicht:** `input.js:63` `if (event.repeat) return;` verwirft
   Tastenwiederholung. Wer `W` hält, bekommt **einen** Punkt, nicht einen
   steigenden Wert. Die Keymap sagt „Kraft ändern", nicht „je Druck 1".
3. **Das Aufladen ist eine Attrappe** — siehe Befund **A-1** (wichtigster
   Befund dieses Berichts): „Klick / Leertaste Aufladen und feuern" lädt nichts
   auf.
4. **Die Zugzeit (30 s) ist nicht erklärt.** Sie steht als Zahl im HUD
   (`index.html:706-709`), die Keymap erwähnt kein Wort dazu.

---

## Ablauf 2: Lokales Match — jeder Übergang

| Schritt | Funktion (datei:zeile) | Was der Spieler sieht | Ausgang bei Fehler |
|---|---|---|---|
| Menü → Match | `startMatch` `main.js:733-779` | Menü weg (`:772`), Canvas mit Karte, Protokoll „Lokales Match — Seed N" (`:776`), Abbruchknopf erscheint (`:774`) | Kein Fehlerfall: alles lokal, kein Netz, kein Warten auf Dritte |
| Zugbeginn | Engine-Event `turn_start` (`engine/match.js:2831`) — **hat keinen `lokal:`-Zweig** (`ereignisse.js:738-742`) | Trotzdem sichtbar: `hud.js:264` (`P# am Zug`) und `hud.js:280` `this.log('${active.label} ist am Zug', 'accent')` — aus dem ZUSTAND, nicht aus dem Ereignis | Kein stiller Ausfall (Gegenprüfung siehe Ablauf 6) |
| Schuss | `fire` `main.js:1346-1395` | „Schuss abgegeben (55 Kraft)" (`:1392`) oder „Schuss verweigert: …" (`:1390`) | Zustand nicht `playing` → „Match ist beendet" (`:1349`) |
| Zugende/Rundenwechsel | Engine → `#loop` `main.js:1986-1993` | Runde/Wind/Zugzeit im HUD; Protokoll aus `ereignisse.js` (`round_start`, `maelstrom_contract`, …) | Rundenende ohne Ereignis wäre ein stiller Übergang — hier vorhanden |
| Spielende | `step` `main.js:1408-1410` → `#showEndScreen` `main.js:1862-1898` | End-Overlay: „Team N gewinnt" bzw. „Unentschieden — niemand überlebt" (`:1872-1874`), „X Runden, Y Simulationsticks, Seed Z" (`:1880`), Kennzahlen-Tabelle (`#zeigeMatchKennzahlen` `:1907-1972`) | Sieger `null` ist behandelt |
| Spielende → Menü | Knopf „Revanche" `main.js:206-209` | Menü erscheint wieder. **Der Knopf startet keine Revanche** (Befund B-2) | – |
| Hängenbleiben? | – | Nein: lokal gibt es **keine** Wartestelle auf ein externes Ereignis. Die Zugfolge treibt der eigene Timer (`turnSystem.js`), das Spielende der eigene `step()` | – |

Der lokale Weg ist der gesündeste Teil des Spiels: **kein Netz, keine Wartezeit
auf Dritte, beide Enden (Abbruch und Spielende) führen ins Menü.** Einzige
Schwachstelle ist die Steuerung (Ablauf 5).

---

## Ablauf 3: Online — Lobby, Verbindung, Trennung

| Schritt | Funktion (datei:zeile) | Was der Spieler sieht | Ausgang bei Fehler |
|---|---|---|---|
| Start mit Server-URL | `startFromMenu` `main.js:397-401` → `startOnline` `main.js:907` | Menü weg (`:913`), Protokoll „Verbinde mit Server …" (`:916`), HUD „Netz: …" | **A-2/A-3: kein Rückweg sichtbar** |
| Lobby erzeugen | `main.js:925-957` | – | `catch` `:958-962`: „Serverfehler: …" (`:959`), Menü zurück (`:960`) — aber `mode` bleibt `online` (Befund B-3) |
| WebSocket + Handshake | `networkClient.js:253-294` | „Handshake abgeschlossen" (`main.js:979`) | `connect()` **wartet nicht** auf das Öffnen (`:293 return this;`) → ein nicht erreichbarer Server fällt nicht hier auf, sondern im Reconnect |
| Beitritt | Server `gameServer.js:1202-1317`, `lobby.js:353-399` | „Lobby <id> — Platz 1" (`main.js:991-995`) | Unbekannte Lobby → Server-Fehler „Lobby nicht gefunden" (`gameServer.js:1205`) → Client zeigt nur „Server: …" (`main.js:1056`), Menü bleibt weg |
| Warten auf Mitspieler | Server `gameServer.js:421-448` (`attach`) + `:1278-1291` | „Warte auf Mitspieler: 1/2 Teams besetzt — es gibt keine Bot-KI, jedes Team braucht einen Menschen." (`main.js:1015-1019`) | Kein Timeout, kein Abbrechen-Knopf → A-2 |
| Matchstart | Server `:1278-1279` (`session.start()`) | Snapshots laufen, Terrain aus dem Seed (`main.js:1073-1084`) | Der **letzte** Beitretende liest „2/2 Teams besetzt — es gibt keine Bot-KI…" (Befund B-4) |
| Zug | `isMyTurn` `networkClient.js:239-241`, `fire` `main.js:1356-1369` | „Schuss gesendet (N Kraft)" (`:1368`), Vorhersage gezeichnet | Nicht am Zug → „Nicht am Zug" (`:1359`); nicht verbunden → `main.js:822` „Nicht verbunden" |
| Trennung mitten im Zug | Client `networkClient.js:283-312`; Server `gameServer.js:1422-1431` | „Verbindung verloren — versuche Wiederverbindung" (`main.js:1034`), HUD „Netz: reconnecting", **Standbild** | Reconnect mit Backoff bis 8 s, **endlos** (`MAX_BACKOFF_MS = 8000` `networkClient.js:29`) |
| Wiederverbindung | `lobby.js:357-367` (Token holt alle Plätze zurück) + `gameServer.js:1277-1291` | „Verbunden" (`main.js:1035`); Match läuft weiter, sobald alle Teams verbunden sind | **Funktioniert** — siehe BESTÄTIGT |
| Mitten im Zug getrennt (Gegenseite) | Server: `session.detach` + Lobby-`disconnect` (`gameServer.js:1422-1431`) | **Keine Meldung an den noch verbundenen Spieler.** Es gibt nur einen `LOBBY_STATE`-Sender (Verbindungsaufbau, `:421`), nichts wird bei Trennung gesendet | Zug läuft über die Zugzeit ab (`gameServer.js:353-356` — bewusste Entscheidung, kein Bot). Der verbliebene Spieler wartet 30 s auf einen Abwesenden, ohne zu wissen, warum |
| Reconnect-Fenster läuft ab | `lobby.js:462-488` `pruneDisconnected` | – | **Wird in `src/` nirgends aufgerufen** (nur `tests/netcode.test.js:153-154`) → Befund B-5: das Team verfällt nie |
| Matchende | `#finish` `gameServer.js:359-412` → Client `ereignisse.js:731-735` | End-Overlay mit Sieger | Siehe WIDERLEGT (PING-Wiederholung) |
| Verlassen | `abortMatch` `main.js:301-316` | – | Online **kein Knopf** (A-2) |

---

## Ablauf 4: Fehlerfälle, Abbruch, Wartestellen

**Kann der Spieler jederzeit zurück?** Nein — aber fast:

| Situation | Zurück möglich? | Beleg |
|---|---|---|
| Im lokalen Match | Ja, per Knopf **und** `R`, beide mit Rückfrage | `main.js:286`, `:273-275`, `:306-312` |
| Im lokalen Match, versehentlich `R` | Ja, `confirm` fängt es ab | `main.js:306-311` |
| Nach Spielende (End-Overlay) | Ja, „Revanche" → Menü | `main.js:206-209` |
| Während der Replay-Wiedergabe | Ja, Abbruchknopf wird ausgeblendet (`:2169`), `R` greift (Modus bleibt nicht `local`, aber `this.match` steht → `laeuft` wahr) | `main.js:303`, `:2169` |
| Im Online-Match | **Nur `R`** — kein sichtbares Element | A-2 |
| Online, Beitritt abgelehnt (falsche/volle/beendete Lobby) | **Nur `R`**; Menü bleibt ausgeblendet, kein Knopf | `main.js:913`, `gameServer.js:1205`, `lobby.js:369` |
| Online, Server nicht erreichbar | Menü kommt zurück | `main.js:958-962` |

**Gezielte Suche nach Wartestellen auf ein Ereignis, das ausbleiben kann:**

1. **Online: Warten auf Mitspieler** — kein Timeout, kein Abbrechen-Knopf
   (`main.js:1012-1019`, kein Gegenstück zu einem „Start"/„Verlassen" in der
   Lobby). Wer allein in einer 3-Team-Lobby sitzt, wartet unbegrenzt (A-3).
2. **Online: Reconnect-Schleife** — `networkClient.js:296-312` versucht es
   endlos (250 ms · 2^n, gedeckelt auf 8 s). Kein Aufgeben, keine Meldung
   „Server nicht erreichbar, abbrechen?" (A-3).
3. **Online: Zug eines abwesenden Menschen** — die Zugzeit läuft ab, es zieht
   niemand (`gameServer.js:353-356`). Bewusst so entschieden; **die Folge ist
   aber, dass der verbliebene Spieler 30 s auf nichts wartet** und es nicht
   erfährt (B-6).
4. **Online: Matchende-Nachricht verpasst** — der Client wartet dann dauerhaft
   auf Zustandsänderungen, die nicht mehr kommen (WIDERLEGT-Abschnitt unten).
5. **Lokal:** keine Wartestelle gefunden. Der einzige „Wartezustand" ist die
   Zugzeit, und die treibt der eigene Motor.

---

## Ablauf 5: Tastatur und Eingaben (jede Taste, ihre Wirkung, ihr Fehlerfall)

Implementiert in `src/client/input.js:80-158` (Spiel) und `main.js:257-276`
(Abbruch). Die Anzeige der Belegung: `index.html:1026-1036`, README `:138-148`.

| Taste | Wirkung im Code | Beleg | Fehlerfall | Doku sagt |
|---|---|---|---|---|
| `Maus` (bewegen) | **nur Winkel**: `#updateAngleFromPointer` → `setAngle` (`input.js:43-48, 160-170`) | `input.js:169` | Ohne gültigen Ursprung: `if (!origin) return` (`:162`) — still, aber nur wenn keine Figur am Zug ist | README:141 „Zielen (**Winkel und Kraft** am Zeiger)" → **WIDERLEGT** |
| `Klick` (halten) | `#beginCharge` (`:50-55`), kein Anzeigeeffekt | – | – | „Aufladen" → **WIDERLEGT (A-1)** |
| `Klick` loslassen / `Leertaste` loslassen | `#releaseCharge` → `onFire` (`:178-181`) | `input.js:57-60, 72-75` | Fenster-Fokus verloren → `pointerup` kommt nicht, der Schuss kommt beim nächsten Loslassen (nur kosmetisch, weil das Aufladen nichts bewirkt) | „…und feuern" → stimmt |
| `Enter` | sofort feuern, ohne Aufladen (`:103-107`) | `input.js:105` | – | stimmt |
| `A` / `ArrowLeft` | Winkel **+0,012 rad** (`:108-111`) | `input.js:109` | Anschlag bei 0,02 rad (`setAngle` `:191`) — kein Feedback, dass es nicht weitergeht | „Winkel feinjustieren" → stimmt |
| `D` / `ArrowRight` | Winkel −0,012 rad (`:112-115`) | `input.js:113` | Anschlag bei π−0,02 (`:191`) | stimmt |
| `W` / `ArrowUp` | Kraft +1 (`:116-119`) | `input.js:117` | Anschlag 100 (`setPower` `:196`); **Halten wirkt nicht** (`:63`) — für 45 Punkte sind 45 Drücke nötig | „Kraft ändern" → unvollständig |
| `S` / `ArrowDown` | Kraft −1 (`:120-123`) | `input.js:121` | Anschlag 5 (`:196`) | stimmt |
| `1`–`9` | Waffe an ANZEIGEposition (`:124-127` → `selectWeapon` `main.js:1309`) | `#inventoryIndexAt` `main.js:1275-1284` | Position > 8 oder leer → `null`, **stumm** (`main.js:1278, 1282, 1340`); im Replay → „Im Replay kann nicht gespielt werden" (`main.js:1381`) | „Waffe wählen" → stimmt |
| `Q` | Waffe abwerfen (`:130-133` → `dropWeapon` `main.js:855`) | – | Lokal: „Abwerfen nicht möglich: …" (`main.js:896`). Replay: „Abwerfen ist im Replay nicht möglich" (`:883`). Online nicht am Zug: „Nur am eigenen Zug kann eine Waffe abgeworfen werden" (`:870`) | „Waffe abwerfen" → stimmt |
| `Shift` | Sprung, mit A/D seitlich (`:152-157` → `main.js:811`) | – | Lokal abgewiesen → Meldung aus `ergebnis.errors` (`main.js:839`); online ohne Verbindung → „Nicht verbunden" (`:822`) | „Springen (mit A/D seitlich)" → stimmt |
| `R` | **Match verlassen** → `abortMatch()` → Abräumen + Menü (`main.js:273-275`, `:319-329`) | – | Im Menü: `if (!laeuft) return false` (`:304`) — greift nur, solange kein Match und `mode !== 'online'` (B-3) | `index.html:1035` „**R Neustart**" → **WIDERLEGT**; README:148 „Zurück zum Menü" → stimmt |

**Während der Gegner-Zugzeit drücken:** `fire` prüft `state.status !== 'playing'`
(`main.js:1349`) — lokal gibt es keine Sperre für „nicht am Zug": Im Hot-Seat ist
der Mensch am Zug und darf auch feuern. Online greift `network.isMyTurn`
(`main.js:1358-1361`) → „Nicht am Zug" (`:1359`). `jump` und `dropWeapon` haben
dieselbe Prüfung mit eigenen Texten (`main.js:825-828`, `:869-872`).
**Beobachtung:** In der Gegner-Zugzeit zeigt das HUD weiter Winkel/Kraft des
EIGENEN Ziels (`this.aim`, `main.js:114`) — es gibt keine Anzeige „du bist nicht
am Zug" außer dem Protokolltext beim Drücken. Die Roster-Zeile markiert den
aktiven Spieler; ein Blick auf `#hud-active` (`hud.js:264`) ist nötig.

---

## Ablauf 6: Vier-Augen-Probe (Doku gegen Code)

| Behauptung | Quelle | Ausgang | Beleg |
|---|---|---|---|
| „Deshalb fragt nur der Knopf nach." | `main.js:292-295` | **WIDERLEGT** | Beide Aufrufer übergeben nichts; `frage = true` ist Vorgabe (`main.js:301`, `:273`, `:286`) |
| „Der Knopf macht den Weg sichtbar" (im Match) | `index.html:718-732`, `tests/abort-knopf.test.js` | **WIDERLEGT für online** | `#zeigeAbbruch(true)` nur in `main.js:774` |
| „Der Knopf ist nur im Match sichtbar" / „im Menü wirkungslos" | `tests/abort-knopf.test.js:131-147, 172-183` | **NICHT gehalten** | Nach „Revanche" und nach fehlgeschlagenem Online-Start ist `match`/`mode` noch gesetzt → `abortMatch` fragt im Menü nach (`main.js:206-209`, `:958-962`, `:303`) |
| „`R` **Neustart**" | `index.html:1035` | **WIDERLEGT** | `main.js:273-275` → `abortMatch` → `#verlasseMatch` (Menü) |
| „`Maus` Zielen (**Winkel und Kraft** am Zeiger)" | `README.md:141` | **WIDERLEGT** | `input.js:160-170` setzt nur den Winkel |
| „`Klick`/`Leertaste` Aufladen … halten = mehr Kraft" | `README.md:142`, `index.html:1028` | **WIDERLEGT** | A-1 |
| „Die Leertaste lädt weiterhin auf und feuert beim Loslassen" | `tests/e2e/prediction-gpu.spec.mjs:181-191` | **NICHT GEPRÜFT (Test zu schwach)** | Der Test prüft `expect(zustand.tick).toBeGreaterThan(0)` — nicht die Kraft. Ein Schuss ohne Aufladen erfüllt ihn ebenso |
| „`chargeRatio` wird gelesen, also entsteht die Kraft daraus" (Verdikt „FEHLALARM") | `docs/audit-userflow.md`, A2 | **TEILWEISE WIDERLEGT** | Die Lesestelle existiert (`main.js:1353`), ist aber im Standardablauf **tot** (A-1). Die ursprüngliche Teilbehauptung „die Ladeanzeige existiert nicht" ist RICHTIG (`grep charge` in `renderer.js`/`hud.js`/`main.js` → nur die Rechenzeile) |
| „`R` bricht ab, wirkt global und ohne Rückfrage, Abbruchknopf fehlt" | `docs/audit-userflow.md`, A5 | **TEILWEISE BESTÄTIGT / ÜBERHOLT** | Rückfrage gibt es jetzt (`main.js:306`), Knopf lokal ja (`:774`), online nein (A-2) |
| Die vier O2-Ereignisse (`landed`, `crate_pickup`, `fall_damage`, `toxic_rain`) haben jetzt einen `online:`-Zweig | `docs/hunter-ui.md:30-45` | **BESTÄTIGT** | `/tmp/probe-events.mjs`: 39 Einträge, diese vier in **beiden** Zweigen; nur-online = `terrain_destroyed, projectile_spawn, weapon_dropped, turn_start, karte_unerreichbar` |
| „Belege: `datei:zeile`, gemessen" — `handleJump` `gameServer.js:517`, Verteiler `:1295`, `handleDropWeapon:570`, `protocol.js:93-94` | `docs/hunter-ui.md:20-27` | **WIDERLEGT (Zeilen veraltet)** | Heute: `handleJump:574`, Verteiler `:1363`, `handleDropWeapon:627`, `protocol.js:94-95`. Zeilen um 47–68 verschoben; die Angaben sind Nachträge ohne Nachmessung |
| „Ein Ereignis mit nur einem Zweig ist im anderen Modus STILL … vier Ereignisse behoben" | `tests/event-coverage.test.js:348-355` | **BESTÄTIGT** | Regel stimmt; `karte_unerreichbar` bleibt als `offen` dokumentiert (`:397-400`) |
| „wer lokal auf einer abgeschnittenen Karte spielt, erfährt es nicht" (BEFUND) | `tests/event-coverage.test.js:397-400` | **BESTÄTIGT** | `karte_unerreichbar` ist nur-online (`ereignisse.js:757-765`), wird aber im Motor auch lokal emittiert (`match.js:755`). Der Kommentar `ereignisse.js:755` („die Prüfung gehört zur Karte, und die kennt der Server") **widerspricht** dem Test-Befund — der Motor prüft lokal genauso (`match.js:734` `pruefeErreichbarkeit`) |
| Auftrag O8: „Im Online-Modus ist [der Sprung] ein **stummer** Ausstieg" | `docs/auftraege/online-sprung-und-abwurf.md`, Abschnitt A.1 | **WIDERLEGT (überholt)** | A.1 zitiert `main.js:793-794` mit `if (!this.match || this.mode !== 'local') return null;`. Heute steht dort der Online-Zweig (`main.js:820-831`). Das Dokument ist ein Entwurf vom Stand `32b1f81` — als Ist-Stand-Beschreibung heute falsch |
| „Auf PING kommt das Match-Ende erneut" | `tests/server-integration.test.js:335-371`, `gameServer.js:1378-1403`, `main.js:1021-1031` | **WIDERLEGT (Codepfad)** | `#finish` ruft `onEmpty` (`gameServer.js:411`) → `#sessions.delete(id)` (`:1228`). Der Wiederholungszweig liest `this.#sessions.get(context.lobbyId)` (`:1396`) — die Sitzung ist weg, der Zweig kann nie greifen. Testlauf nicht durchgeführt (Verbot); die Aussage folgt aus den zwei Zeilen |
| „Ein späterer Beitritt erzeugt eine NEUE Sitzung …“ / „Der Reconnect startet faktisch ein neues Match" | `main.js:1021-1031` | **BESTÄTIGT** | `join` prüft den Status nur für NEUE Sitze (`lobby.js:369`), ein bekannter Token kommt davor zurück (`:358-367`) → `gameServer.js:1215-1275` legt eine neue Sitzung an, `lobby.status` wird von FINISHED auf RUNNING gezogen (`:1275`) |
| „`#zeigeAbbruch` wird u. a. **online** gerufen" | `tests/abort-knopf.test.js:144-146` | **WIDERLEGT** | Zähler ≥ 4 ist ohne den Online-Aufruf erfüllt |
| „Nach dem Reconnect-Fenster verfällt sein Team (`pruneDisconnected`) und die Lobby nimmt wieder einen Menschen auf" | `lobby.js:444-447` | **WIDERLEGT** | `pruneDisconnected` hat **keinen** Produktionsaufrufer; und eine nicht-`open` Lobby lehnt neue Spieler ab (`lobby.js:369`) |

---

## Befunde

### A-1 (A) Das Aufladen des Schusses ist wirkungslos — die Hauptsteuerung tut nicht, was dasteht

**Beleg (zwei Zeilen, die sich gegenseitig aufheben):**
```js
// src/client/input.js:178-181
#releaseCharge() {
  this.#charging = false;      // erst zurücksetzen …
  this.#handlers.onFire?.();   // … dann feuern
}
```
```js
// src/client/main.js:1351-1354
const charging = this.input.isCharging;               // beim Feuern bereits false
const power = charging
  ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70)))
  : this.aim.power;                                    // ← immer dieser Zweig
```
Jeder Weg, der einen Schuss AUSLÖST, setzt `#charging` vorher auf `false`:
Loslassen der Maus (`input.js:57-60` → `:178-181`) und Loslassen der Leertaste
(`:74-75` → `:178-181`). `onFire` wird sonst nur noch von `Enter` gerufen
(`:103-107`) — und `Enter` setzt kein `charging`. Der Ladeast ist damit nur
erreichbar, wenn man die Maustaste oder die Leertaste **hält** und zusätzlich
`Enter` drückt.

**Was der Spieler merkt:** Er hält den Klick (oder die Leertaste), wartet, sieht
**nichts** (es gibt keine Ladeanzeige: `grep -n "charge" src/client/renderer.js
src/client/hud.js` → kein Treffer), lässt los — und schießt immer mit Kraft 55
bzw. mit dem letzten `W`/`S`-Wert. Die versprochene Steigerung durch Halten
existiert nicht; die einzige Möglichkeit, die Kraft zu setzen, sind
Einzeldrücke auf `W`/`S` (+1 je Druck, `input.js:117` — Halten wirkt wegen
`:63` nicht).

**Beleg, dass es niemandem aufgefallen ist:**
`tests/e2e/prediction-gpu.spec.mjs:181-191` heißt „Die Leertaste lädt weiterhin
auf und feuert beim Loslassen", prüft aber nur
`expect(zustand.tick).toBeGreaterThan(0)` — also ob die Welt sich bewegt hat.
Der Test hält die Implementierung fest, nicht das Verhalten.

**Fixvorschlag (klein):** `#releaseCharge` meldet den Ladestand VOR dem
Zurücksetzen: `const ratio = this.chargeRatio; this.#charging = false;
this.#handlers.onFire?.(ratio)` — und `fire(ratio)` rechnet mit dem
übergebenen Wert. Zusätzlich einen Ladungsbalken im HUD, sonst bleibt die
Steuerung blind. Danach den E2E-Test auf die **Kraft** prüfen lassen
(`getState().entities.find(aktiv).power` vor/nach), nicht auf `tick > 0`.

### A-2 (A) Im Online-Match gibt es kein sichtbares Bedienelement zum Verlassen

`#zeigeAbbruch(true)` steht nur im lokalen Start (`main.js:774`). Im
Online-Pfad fehlt es; der Knopf bleibt `hidden` (`main.js:201`, HTML
`index.html:729`). Der einzige Weg ist `R` — dessen Beschreibung steht in der
Keymap im **Menü** (`index.html:1035`), das während des Spiels ausgeblendet ist
(`main.js:913`).

**Was der Spieler merkt:** Er sitzt online in einem Match, das nicht
vorangeht (Gegner abwesend, Verbindung tot) und findet keinen Ausweg in der
Oberfläche. Er muss die Taste raten, die im Menü „Neustart" heißt.

**Fixvorschlag:** `this.#zeigeAbbruch(true)` in `startOnline` (nach `:918`)
setzen und beim Fehlerpfad `:960` mit `#zeigeAbbruch(false)`. Der Test in
`tests/abort-knopf.test.js` sollte dann die **Fundstelle** prüfen (z. B. dass
`startOnline` die Methode ruft), nicht eine Vorkommenszahl.

### A-3 (A) Ein abgelehnter Online-Beitritt führt in einen Zustand ohne sichtbaren Rückweg

Der Client blendet das Menü **vor** jedem Netzversuch aus (`main.js:913`).
Scheitert der Beitritt am Server, gibt es danach keinen Pfad zurück ins Menü:

- Lobby unbekannt: `gameServer.js:1205` `throw new Error('Lobby nicht gefunden')`
  → Client zeigt nur „Server: Lobby nicht gefunden" (`main.js:1056`).
- Lobby beendet: `lobby.js:369` `throw new Error('Lobby nimmt keine Spieler mehr
  auf')` → dieselbe Zeile im Protokoll.
- Server nie erreichbar: `networkClient.js:283-312` verbindet endlos neu
  (Backoff bis 8 s), `connect()` wartet nicht (siehe Ablauf 3).

Der Spieler sieht: leeres Spielfeld, HUD „Netz: connecting/reconnecting", eine
Protokollzeile — und keinen Knopf (A-2). Der Weg zum Warten auf Mitspieler hat
dasselbe Problem: kein Timeout, kein „Abbrechen".

**Fixvorschlag:** Nach dem `catch` in `startOnline` (`main.js:958-962`) auch die
WS-Fehler des ersten Versuchs abfangen — z. B. in `client.on('server_error', …)`
prüfen, ob noch kein `WELCOME` kam (`networkClient.isConnected === false`), und
dann `#verlasseMatch()` + eine Meldung „Beitritt fehlgeschlagen — zurück zum
Menü" auslösen. Ein `joinTimeout` (z. B. 15 s ohne `WELCOME`) ist die zweite
Hälfte.

### A-4 (A) Das Spiel sagt „R Neustart", `R` verlässt aber das Match

`index.html:1035`: „**R** Neustart". Der Code: `main.js:273-275`
(`if (event.key === 'r' …) this.abortMatch();`) → `#verlasseMatch`
(`main.js:319-329`) → Menü. Ein Neustart findet nicht statt. README:148 sagt
korrekt „Zurück zum Menü" — die Doku widerspricht sich selbst.

**Was der Spieler merkt:** Er will nach einem verkorksten Start neu anfangen,
drückt `R` und verliert die Partie — abgefangen nur von der `confirm`-Rückfrage
(„Match verlassen? Der Spielstand geht verloren.", `main.js:308-310`).

**Fixvorschlag:** Label auf „Zurück zum Menü" ändern (`index.html:1035`) —
oder, wenn ein echter Neustart gewünscht ist, einen eigenen Weg dafür bauen
(`abortMatch` + `startMatch` mit demselben Seed). Eines von beidem, nicht beides.

### B-1 (B) Kommentar: „Deshalb fragt nur der Knopf nach" — es fragen beide

`main.js:292-295` gegen `main.js:301` (`{ frage = true }`, Vorgabe **true**),
`:273-275` und `:286` (beide ohne Argument). Kein `frage: false` im ganzen Repo.
Wirkung harmlos (mehr Sicherheit), Text falsch.

**Fix:** Kommentar richtigstellen, oder wenn die Absicht „Taste ohne Rückfrage"
war, `abortMatch({ frage: false })` im Tastenzweig übergeben — die Entscheidung
gehört bewusst getroffen.

### B-2 (B) „Revanche" startet keine Revanche

`main.js:206-209`:
```js
document.getElementById('rematch-button')?.addEventListener('click', () => {
  this.endOverlay.hidden = true;
  this.menuOverlay.hidden = false;
});
```
Der Knopf tut genau das, was ein Knopf „Zurück zum Menü" täte. Ein neues Match
beginnt erst über „Match starten" — und dann mit **neuer Zufallskarte**, weil
das Seed-Feld leer bleibt (nichts schreibt `#cfg-seed`; der einzige Vorkommen im
Client ist das *Lesen* `main.js:390`). Der Seed steht nur im Endbildschirm
(`main.js:1880`) und muss von Hand abgetippt werden.

**Was der Spieler merkt:** Er drückt „Revanche" — und ist im Menü. Nach
„Match starten" spielt er auf einer anderen Karte als eben.

**Fix:** Entweder den Knopf in „Zum Menü" umbenennen, oder ihn wirklich neu
starten lassen (`startMatch` mit denselben Optionen und dem Seed der eben
beendeten Partie) und das Seed-Feld damit füllen.

### B-3 (B) Nach einem gescheiterten Online-Start fragt das Menü „Match verlassen?"

`startOnline` setzt `mode = 'online'` und `running = true` vor dem Netzversuch
(`main.js:917-918`); der Fehlerpfad `:958-962` setzt nur das Menü zurück.
`abortMatch` prüft `Boolean(this.match) || this.mode === 'online'`
(`main.js:303`) → im Menü wahr. Dasselbe gilt nach „Revanche": `this.match`
wird dort nicht geleert (`main.js:206-209`), der Modus bleibt `local`.

**Was der Spieler merkt:** Im Menü (nichts läuft) kommt auf `R` die Frage
„Match verlassen? Der Spielstand geht verloren."

**Fix:** Im Fehlerpfad `this.mode = 'local'` und `this.running = false` setzen;
im „Revanche"-Zweig `this.match = null`. Der Test „Der Abbruch im Menü ist
wirkungslos" (`tests/abort-knopf.test.js:172-183`) sollte statt der Zeile den
Zustand prüfen (kein Match, kein Online-Modus).

### B-4 (B) Der letzte Beitretende liest „Warte auf Mitspieler: 2/2 Teams besetzt"

Der Server schickt den Lobby-Zustand in `attach` mit `laeuft: this.laeuft`
(`gameServer.js:441`) — und `attach` läuft **bevor** gestartet wird
(`:1277` vor `:1278-1279`). Der Client protokolliert bei `laeuft === false`
wörtlich (`main.js:1015-1019`):

> „Warte auf Mitspieler: 2/2 Teams besetzt — es gibt keine Bot-KI, jedes Team
> braucht einen Menschen."

Eine zweite `LOBBY_STATE`-Nachricht gibt es nicht (einziger Sender ist
`gameServer.js:421`) — der Satz bleibt stehen, obwohl das Match genau in diesem
Moment startet.

**Was der Spieler merkt:** Genau im Startmoment sagt ihm das Protokoll, dass er
warten muss, und begründet es mit einer Zahl, die das Gegenteil zeigt. Er sucht
einen Fehler bei sich.

**Fix:** Reihenfolge in `attach`/Join tauschen (erst `session.start()` bei
`alleTeamsBesetzt`, dann `attach`) — oder den Text am Client nur zeigen, wenn
`besetzteTeams < teams`, und die Anzeige bei `laeuft === true` durch eine
Startmeldung ersetzen.

### B-5 (B) Das Reconnect-Fenster ist gebaut, aber nie in Betrieb

`lobby.js:444-447` verspricht: „Nach dem Reconnect-Fenster verfällt sein Team
(`pruneDisconnected`) und die Lobby nimmt wieder einen Menschen auf." Beides
trifft nicht zu:

- `pruneDisconnected` (`lobby.js:462-488`) wird in `src/` **nirgends** gerufen
  (einzige Aufrufer: `tests/netcode.test.js:153-154`).
- Eine Lobby in der Matchphase ist `RUNNING`, und `join` lehnt alles außer
  `open` ab (`lobby.js:369`) — neue Menschen kommen also nicht hinein, auch
  wenn ein Platz frei wäre.

**Was der Spieler merkt:** Wer die Verbindung verliert, blockiert sein Team
dauerhaft; der verbliebene Spieler spielt gegen eine Seite, in der nie jemand
schießt, und kann niemanden nachholen lassen.

**Fix:** Entweder ehrlich machen (Kommentar streichen, Zustand „Team verwaist"
im Protokoll melden) oder `pruneDisconnected` an eine Stelle hängen, die
wirklich läuft (z. B. im `close`-Handler neben `:1428` oder zusammen mit dem
Persistenz-Takt `:990-997`).

### B-6 (B) Der verbliebene Spieler erfährt nicht, dass der Gegner weg ist

Beim Trennen geht **keine** Nachricht an die anderen: der Socket-`close`-Handler
(`gameServer.js:1422-1431`) ruft `detach`, `lobbies.disconnect` und ggf.
`stop()` — aber nichts wird gesendet. `LOBBY_STATE` gibt es nur beim
Verbindungsaufbau (`:421`). Der Zug des Abwesenden läuft über die Zugzeit ab
(`gameServer.js:353-356`).

**Was der Spieler merkt:** 30 Sekunden Stillstand, dann ist er selbst am Zug —
ohne jede Erklärung. Er weiß nicht, ob das Spiel hängt oder der andere weg ist.

**Fix:** Bei `detach` eine Control-Nachricht an die verbleibenden Clients
(`'spieler_getrennt'` mit Name/Team) und eine Protokollzeile im Client. Klein,
wirkt sofort.

### C-1 (C) Die Keymap steht am unteren Ende des Menüs

`index.html:1026-1036` liegt unter acht `<details>`-Blöcken (Lobby-Browser,
Roster, Hilfe, Loadout, Sidegrades, Replay, Erfolge, Profil) und unter dem
Start-Knopf (`:884`). Ob sie ohne Scrollen sichtbar ist, hängt an Schriftgröße
und Fensterhöhe; **nicht messbar ohne Browser** → als Verdacht geführt.
Ein Fix wäre billig und sicher: die drei wichtigsten Zeilen (Maus, Klick/Leertaste,
W/S) direkt unter den Untertitel setzen.

### C-2 (C) Ereignis ohne Empfänger: `karte_unerreichbar` lokal

Emitted im Motor für beide Betriebsarten (`match.js:755`, im Rahmen von
`pruefeErreichbarkeit`, `match.js:734`), aber nur mit `online:`-Zweig
(`ereignisse.js:757-765`). Die Begründung im Kommentar („die Prüfung gehört zur
Karte, und die kennt der Server") ist irreführend: die Prüfung rechnet der
**Motor**. Der Test dokumentiert denselben Sachverhalt bereits als offen
(`tests/event-coverage.test.js:397-400`: „BEFUND: wer lokal auf einer
abgeschnittenen Karte spielt, erfährt es nicht."). Also **bekannt**, aber die
Begründung im Code widerspricht dem Test.

### C-3 (C) `const teams = payload.teams ?? teams;` kann nicht greifen

`main.js:1014`: Der Rückfall liest den Namen, den dieselbe Anweisung gerade
deklariert (TDZ). Wäre `payload.teams` fehlend, gäbe es einen `ReferenceError`
statt eines Rückfalls. Heute unerreichbar, weil der Server `teams` immer
mitschickt (`gameServer.js:442`) — ein Rückfall, der nur auslöst, wenn er
gebraucht würde.

---

## BESTÄTIGT / VERDACHT / NICHT PRÜFBAR / WIDERLEGT

### BESTÄTIGT (im Code belegbar)
1. **Lokaler Ablauf ist geschlossen:** Menü → Match → Züge → Spielende →
   Menü. Kein Zustand ohne Ausgang (Belege: `main.js:733-779`, `:1408-1410`,
   `:1862-1898`, `:206-209`).
2. **Wiederverbindung während des Matches funktioniert:** bekannter Token holt
   alle Plätze zurück (`lobby.js:357-367`), der Server startet die Sitzung,
   wenn wieder alle Teams verbunden sind (`gameServer.js:1278-1279`).
3. **Die Zugwechsel-Meldung im Protokoll kommt aus dem HUD, nicht aus dem
   Ereignis** (`hud.js:264, 280`) — deshalb ist der fehlende `lokal:`-Zweig von
   `turn_start` (`ereignisse.js:738-742`) **kein** sichtbarer Ausfall.
4. **Beide Abbruchwege laufen durch dieselbe Methode** (`main.js:274, 286`) —
   die Regel „eine Stelle" ist eingehalten.
5. **Ein nicht erreichbarer Server beim Lobby-Laden wird gemeldet und das Menü
   bleibt bedienbar** (`main.js:628-633`: „Server nicht erreichbar (…)").
6. **`ich bin nicht am Zug` wird nicht stumm verworfen:** Feuer, Sprung und
   Abwurf haben je eine Meldung (`main.js:1359, 826, 870`).
7. **Die vier O2-Ereignisse sind wirklich behoben** (`/tmp/probe-events.mjs`).

### VERDACHT (plausibel, ohne Laufzeitmessung nicht entscheidbar)
1. Die Keymap liegt unterhalb des sichtbaren Bereichs (C-1) — Layout nicht
   messbar ohne Browser.
2. Der `confirm`-Dialog friert die Zugzeit-Anzeige kurz ein (er blockiert den
   Frame-Loop); lokal ohne Folge, online läuft die Serveruhr weiter. Nicht
   gemessen.

### NICHT PRÜFBAR in dieser Umgebung
- **Jeder Testlauf** (Verbot) → die Aussage zum PING-Wiederholungszweig
  („kann nie greifen") ist eine Codepfad-Aussage, kein Messergebnis.
- **Jede Laufzeitmessung** (Zugdauer, Reaktionszeit, Ladezeit).
- **Pixel/Layout/Kontrast** (nicht Auftrag, kein Browser).
- **`docs/auftraege/zerlegung-schritt3-*.md` und `-schritt4-*.md`** inhaltlich.

### WIDERLEGT (Doku/Test/Mechanik gegen den Code)
1. „Deshalb fragt nur der Knopf nach" (`main.js:292-295`) — beide fragen.
2. Abbruchknopf „macht den Weg sichtbar" online (`index.html:718-732`) — online
   fehlt der Aufruf.
3. Test „#zeigeAbbruch wird u. a. online gerufen"
   (`tests/abort-knopf.test.js:144-146`) — Zähler erfüllt ohne die Stelle.
4. Test „Der Abbruch im Menü ist wirkungslos"
   (`tests/abort-knopf.test.js:172-183`) — im Menü ist `mode`/`match` noch
   gesetzt, die Rückfrage kommt.
5. `R` = „Neustart" (`index.html:1035`).
6. README „Maus: Winkel **und Kraft**" (`README.md:141`).
7. README/Keymap „Aufladen … halten = mehr Kraft" (`README.md:142`,
   `index.html:1028`) — Befund A-1.
8. E2E „Die Leertaste lädt weiter auf" (`prediction-gpu.spec.mjs:181-191`) —
   der Test prüft die Kraft nicht.
9. `docs/hunter-ui.md`-Zeilenangaben 517/570/1295/93-94 — heute 574/627/1363/94-95.
10. `docs/auftraege/online-sprung-und-abwurf.md` A.1 „der Sprung existiert
    online nicht" — seit O8 überholt.
11. `lobby.js:444-447` „Nach dem Reconnect-Fenster verfällt sein Team …" —
    kein Aufrufer, und die Lobby nimmt keine neuen Menschen auf.
12. `gameServer.js:1390-1403` „Diese Antwort ist der natürliche Ort für die
    Wiederholung" — die Sitzung ist zu diesem Zeitpunkt bereits aus der Map
    gelöscht (`:411` → `:1228`, gelesen `:1396`).
13. `docs/audit-userflow.md` A2-Verdikt „FEHLALARM" — die Lesestelle ist tot.

---

## Die drei Stellen, an denen ein neuer Spieler am ehesten aufgibt

**1. Der erste Schuss (Aufladen ohne Wirkung und ohne Anzeige).**
Er liest „Klick / Leertaste — Aufladen und feuern", hält, sieht nichts
passieren und schießt nach dem Loslassen immer mit derselben Kraft. Wenn
„weiter" nicht klappt, versucht er die Kraft zu ändern und stellt fest, dass
`W` nur einen Punkt je Druck gibt (45 Drücke auf 100).
**Fix (klein):** Ladestand in `#releaseCharge` auslesen und an `fire(ratio)`
übergeben (2 Zeilen), plus ein Ladungsbalken in `#hud-aim` (dort steht bereits
Winkel/Kraft, `index.html:743-748`). Ein zusätzlicher Halteschritt für
`W`/`S` (`event.repeat` zulassen und je Frame 1 Punkt) macht die Kraft
bedienbar.

**2. Der Ausstieg aus einem Online-Match (kein Knopf, nur eine Taste, die
„Neustart" heißt).**
Wer online in einer Lobby wartet oder gegen einen abwesenden Gegner spielt,
findet in der Oberfläche kein „Verlassen" und keinen Ausweg aus einem
abgelehnten Beitritt.
**Fix (klein):** `this.#zeigeAbbruch(true)` in `startOnline` (eine Zeile) und
`frage`-Rückweg im Fehlerpfad (`this.mode = 'local'`, `this.menuOverlay.hidden
= false`) — zusammen mit dem Label „Zurück zum Menü" statt „Neustart"
(`index.html:1035`).

**3. Das Ende einer Partie („Revanche", die keine ist).**
Nach dem Spielende erwartet der Spieler „nochmal, gleiche Karte". Der Knopf
führt ins Menü, das Seed-Feld ist leer, und der nächste Start liefert eine
andere Welt. Der Seed steht nur im Endbildschirm (`main.js:1880`).
**Fix (klein):** In `#showEndScreen` den Seed in `#cfg-seed` schreiben
(`document.getElementById('cfg-seed').value = …`) und den Revanche-Knopf mit
diesem Seed neu starten — oder ihn „Zum Menü" nennen und den Seed sichtbar
stehen lassen (er steht schon da, aber nicht kopierbar).

---

## Anhang: Was in dieser Sitzung nicht verifiziert werden konnte

- Ob der Test `tests/server-integration.test.js:335-371` („Auf PING kommt das
  Match-Ende erneut") aktuell rot ist. Nach dem Codepfad müsste er es sein; der
  Lauf war verboten. **Diese eine Frage braucht einen Testlauf**, bevor jemand
  den Zweig als „funktioniert" behandelt.
- Ob `#zeigeAbbruch` im Online-Pfad durch einen anderen Mechanismus sichtbar
  wird. **Geprüft und ausgeschlossen:** `#hud-abort` hat nur Stil-Regeln
  (`index.html:221-238`, u. a. `pointer-events: auto`), keine `display`-Regel —
  und `index.html:400` enthält `[hidden] { display: none !important; }`. Das
  `hidden`-Attribut (`index.html:729`) ist damit nicht überstimmbar: der Knopf
  ist online **definitiv** unsichtbar.
