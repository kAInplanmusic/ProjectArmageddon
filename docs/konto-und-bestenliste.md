# Konten und historische Bestenliste

*Stand: 2026-11-05 (Paket C). Quelle der Anforderungen bleibt
`docs/anforderungen-2026-11-05.md` (Punkt 10 und 11), die Einzelliste
`docs/TODO-SSOT.md`. Diese Datei hält die **Entscheidungen** fest und begründet
sie — sie ist keine zweite Aufgabenliste.*

## 1. Was gebaut ist

| Teil | Ort |
|---|---|
| Kontodienst (Registrieren, Anmelden, Abmelden, Löschen, Bremse, scrypt) | `src/server/konto.js` |
| Speicher (SQLite, JSON-Rückfall) | `src/server/kontoSpeicher.js` |
| Elo, Rangliste, Bestwerte, Partieverbuchung | `src/server/bestenliste.js` |
| HTTP-Routen und Handshake-Token | `src/server/gameServer.js` (`#kontoRoute`, `#nimmUpgrade`) |
| Serverseitige Partieauswertung | `LobbySession.stats` + `LobbySession#finish` → `onMatchEnd` |
| Admin-Passwort-Reset | `scripts/betrieb/passwort-zuruecksetzen.mjs` |
| Client-Einstieg | `src/client/konto.js`, Menüblöcke in `index.html` |
| Tests | `tests/konto-http.test.js`, `tests/konto-bestenliste.test.js` |

## 2. Entscheidungen

### 2.1 Speicher: SQLite (`node:sqlite`)

Vor dem Bau geprüft:

```
$ node --version
v26.12.1
$ node -e "require('node:sqlite')"
(sqlite ok, SQLite 3.54.0, keine Ausgabe, kein Flag nötig)
```

Also **SQLite über `node:sqlite`**, keine neue Abhängigkeit. Gründe:

- Konten brauchen einen **UNIQUE-Index auf den kleingeschriebenen Namen** — die
  Eindeutigkeit „ohne Groß/Klein" ist damit eine Eigenschaft der Datenbank, nicht
  eine Prüfung, die man beim zweiten Schreibpfad vergisst.
- Löschen muss **Konto, Sitzungen und Partien zusammen** entfernen. Das ist ein
  Fremdschlüssel mit `ON DELETE CASCADE`, eingeschaltet per `PRAGMA
  foreign_keys = ON` (in SQLite je Verbindung aus!).
- Gleichzeitige Schreibzugriffe sind der Normalfall (zwei Menschen melden sich
  im selben Moment an) — SQLite transaktioniert das, eine JSON-Datei nicht.

**Rückfall JSON** bleibt trotzdem gebaut (`JsonSpeicher`): `package.json` erlaubt
Node ≥ 22, und dort steckt `node:sqlite` hinter einem Flag. Fehlt das Modul,
nimmt der Server die Datei `konten.json` mit atomarem Schreiben (temp + rename)
und einer Sperrdatei (`konten.json.lock`, verwaiste Sperre nach 10 s). Welcher
Zweig läuft, steht beim Öffnen im Log (`konten_offen`, Feld `art`).

Ablage: `PA_KONTEN_PFAD`, Standard `.pa-state/konten.db` (wie die
Lobby-Persistenz, per `.gitignore` ausgeschlossen, Modus 600 für die Datei).
Lobbys und laufende Partien bleiben unverändert in `persistence.js`.

### 2.2 Sitzungstoken: im Netzwerk-Handshake, kein Cookie

Der Token (32 Byte Zufall, base64url, 30 Tage gültig) wird bei Registrieren und
Anmelden **einmal** ausgeliefert und reist danach:

- HTTP: `Authorization: Bearer <token>`
- WebSocket: `/ws?sitzung=<token>` im Upgrade

**Warum kein httpOnly-Cookie:** Der Client läuft im Entwicklungsbetrieb von
einem anderen Origin (Vite 5173, Server 3000). Ein Cookie müsste dort
`SameSite=None; Secure` tragen — ohne TLS unmöglich. Zudem kann ein Browser bei
`new WebSocket()` keine eigenen Kopfzeilen setzen; ein Cookie wäre der einzige
Weg, den Token im Handshake mitzunehmen, aber dann hinge die Anmeldung an einer
Cookie-Richtlinie, die je nach Deploy verschieden ist. Der Token im Handshake
funktioniert in beiden Betrieben gleich und öffnet **keine CSRF-Fläche**, weil
kein Cookie automatisch mitreist.

**Preis, offen benannt:** JavaScript im Client kann den Token lesen. Deshalb
liegt er im `sessionStorage` dieses Tabs (nicht `localStorage`) und die Seite
lädt kein Fremdskript. Wer XSS hat, hat ohnehin die Sitzung — das ist bei
Bearer-Token unvermeidlich und der Grund, warum die Anwendung keine
Fremdinhalte einbettet.

Gespeichert wird nur der **SHA-256-Hash** des Tokens. Wer die Datenbank liest,
kann damit keine Sitzung übernehmen.

### 2.3 Passwörter

scrypt, `N=16384, r=8, p=1`, 16 Byte Salz je Konto, 64 Byte Ausgabe, Format
`scrypt$N$r$p$salzHex$hashHex`, Vergleich mit `timingSafeEqual`. Kein
E-Mail-Feld, keine Selbst-Wiederherstellung. Klartext-Passwörter erscheinen
nirgends — weder im Log noch in einer Antwort; das Admin-Skript gibt das NEUE
Passwort einmal auf stdout aus (das ist sein Zweck) und schreibt es nicht in eine
Datei.

### 2.4 Bremse gegen Durchprobieren

Gleitendes Fenster (15 min), im Prozess:

| Zähler | Grenze | Zweck |
|---|---|---|
| je Name | 10 Versuche | Ein Konto nicht durchprobieren |
| je IP | 40 Versuche | Viele Namen von einer Adresse |
| je IP (Registrieren) | 20 neue Konten | Kein Massenanlegen |

Ein erfolgreicher Login leert den **Namens**zähler (der Besitzer soll nicht
wegen fremder Fehlversuche ausgesperrt bleiben), nicht den IP-Zähler. Nach einem
Neustart ist die Bremse leer — bewusst: Sie überbrückt Sekunden, die Grundlast
trägt der umgekehrte Proxy. Eine persistente Bremse wäre ein zweiter
Schreibpfad für ein Problem, das keine dauerhaften Daten braucht.

### 2.5 Was für die Rangliste zählt

**Nur Partien, die der Server selbst gesehen hat, mit mindestens zwei
angemeldeten Menschen.** Der Server führt die Kennzahlen aus den
Simulationsereignissen (`MatchStats`, `src/shared/stats.js`) — nichts davon
meldet der Client. Lokale Partien am selben Gerät gibt es nicht mehr (Entscheidung
2026-11-02); Gäste haben keine Kennung über die Partie hinaus und zählen nicht.
Ein Konto, das nur mit Gästen spielt, bekommt keine Partie. Und ein Konto
besetzt je Lobby **genau einen Platz**: Ein zweiter Tab mit demselben Konto wird
mit „Dieses Konto spielt in dieser Lobby bereits" abgelehnt, sonst könnte man
mit zwei Tabs beide Teams besetzen und gegen sich selbst Elo sammeln.

Gespeichert je Konto: Elo, Partien, Siege, Niederlagen, Kills, Tode, Schaden,
Schüsse, Treffer, meiste Schüsse **einer** Partie. Dazu eine Zeile je Partie
(`partien`-Tabelle: Ergebnis, Elo vorher/nachher, Kennzahlen, Lobby-ID) — damit
ist eine Wertung nachvollziehbar und nicht nur eine Summe.

**Modi:** Gewertet wird je Team. Im „jeder gegen jeden" ist jeder Mensch sein
eigenes Team; der letzte Überlebende trägt die `winnerTeamId`, alle anderen
verlieren. Die Auswertung liest dieselbe Teamzuordnung wie 1v1/2v2 und braucht
für FFA keinen Sonderfall (Entscheidung des Auftraggebers,
`docs/anforderungen-2026-11-05.md` §5.1). Ein Match ohne Gewinnerteam
(`winnerTeamId === null`) zählt als Unentschieden mit 0,5.

### 2.6 Elo

Startwert **1000**, K = **32**, Erwartungswert `1 / (1 + 10^((gegner − eigen)/400))`,
neue Wertung `rund(eigen + K · (Ergebnis − Erwartung))`, nie unter 0. Bei mehr als
zwei Teilnehmern wird jedes Paar einzeln gerechnet und der Zugewinn **gemittelt**
— ein Sieg gegen drei Starke ist so viel wert wie gegen einen. Nullsumme gilt
nur bei gleichen Startwerten und paarweiser Rechnung; sie ist keine Zusage der
Formel, sondern eine Folge davon.

Beispiel (Testfall): 1000 gegen 1000 siegen = **+16**; 1000 gegen 1400 siegen =
**+29**; 1000 gegen 600 siegen = **+3**.

### 2.7 Bestwerte über alle Zeiten

`GET /api/bestenliste` liefert vier Rekorde: **meiste Schüsse in einer Partie**,
**beste K/D**, **schlechteste K/D**, **meiste Siege**. K/D = Kills / Tode, wobei
0 Tode als 1 gezählt wird (eine anzeigbare Zahl statt „unendlich"). „Beste K/D"
verlangt mindestens einen Kill, „schlechteste" mindestens einen Tod — sonst
wäre der Rekord ein Konto, das nie gespielt hat. Ohne Träger ist der Rekord
`null`, nicht 0.

## 3. HTTP-Endpunkte

Alle Antworten sind JSON. Fehler tragen `error` (Text), `errors` (Liste) und
`code` (maschinenlesbar), damit der Client den Grund anzeigen kann.

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| POST | `/api/konto/registrieren` | `{name, passwort}` | 201 `{konto, token, laeuftAb}` |
| POST | `/api/konto/anmelden` | `{name, passwort}` | 200 wie oben |
| POST | `/api/konto/abmelden` | — (Bearer) | 200 `{ok}` |
| DELETE | `/api/konto` | `{passwort}` (Bearer) | 200 `{ok, geloescht}` |
| GET | `/api/konto` | — (Bearer) | 200 `{konto}` / 401 |
| GET | `/api/bestenliste` | — | 200 `{eintraege, bestwerte, stand}` |

Fehlercodes: `name_ungueltig`, `passwort_ungueltig`, `name_vergeben`,
`zugangsdaten_falsch`, `zu_viele_versuche`, `nicht_angemeldet`,
`passwort_falsch`.

Der WebSocket-Handshake trägt den Token als `?sitzung=`. Ein unbekannter oder
abgelaufener Token ist **kein Fehler** — der Client spielt als Gast weiter. Ein
angemeldeter Spieler bekommt den Kontonamen als Platznamen; ein Wunschname aus
`JOIN_LOBBY` wird ignoriert (sonst stünde ein fremder Name in der Rangliste).

`PROTOCOL_VERSION` bleibt **9**: Alle neuen Nachrichten sind additiv (neue
HTTP-Pfade, ein zusätzliches Feld im Handshake). Ein alter Client ohne
Kontowissen verbindet sich wie bisher und spielt als Gast.

## 4. Betrieb

```
node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna
node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna --passwort 'Neues-Passwort-1'
PA_KONTEN_PFAD=/srv/pa/konten.db node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna
```

Ohne `--passwort` wird ein zufälliges erzeugt und **einmal** auf stdout
ausgegeben; alle Sitzungen des Kontos werden entwertet. Exit-Codes: 0 Erfolg,
2 Konto unbekannt, 3 Aufruffehler, 4 Speicherfehler. Das Skript läuft lokal auf
dem Server (Schreibrechte auf die Kontendatei), nicht über das Netz.

## 5. Was bewusst NICHT gebaut ist

- Kein Shop, kein Battle-Pass, kein XP, keine Ränge (Vorgabe des Auftraggebers).
- Keine E-Mail, keine Selbst-Wiederherstellung, kein „Passwort vergessen"-Link.
- Keine Freundesliste, keine Chat-Whitelist, keine Moderationsrolle.
- Keine clientseitige Meldung von Ergebnissen — der Server wertet selbst aus.
