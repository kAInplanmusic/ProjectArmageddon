# Zugang unter https://www.projectarmageddon.de (Option D)

Entscheidung des Auftraggebers: **Cloudflare** (kein Netlify) liefert den Client, hält die **Nutzerdatenbank** (Konten, Anmeldung, später Profil und Scoreboard) sowie Start, Status und Not-aus des Spielservers. Die Spielverbindung (WebSocket und API) geht direkt zum Hetzner-Knoten unter `https://<ip-mit-bindestrichen>.sslip.io`. Optionen mit eigenem Rechner oder eigenem Gateway sind verworfen und entfernt.

Kosten: Cloudflare im Gratis-Tarif 0 EUR (Pages, Workers, D1) – Grenzen des Tarifs vor dem Betrieb prüfen. Hetzner wie in `docs/betrieb-INSTANZ.md` Abschnitt 10 (nur Abbild plus Primary IP im Ruhezustand, 0,037128 EUR/h nur während der Miete). Gesamt weit unter 25 EUR/Monat. Die Nutzerdatenbank liegt **nicht** auf dem Hetzner-Knoten und überlebt dessen Selbstlöschung.

## Ablauf für den Spieler

1. www.projectarmageddon.de öffnen: zuerst das Anmeldefenster (Benutzername **oder** E-Mail plus Passwort). Darunter der Wechsel zu "Registrieren".
2. Registrieren: E-Mail, frei gewählter Benutzername, Passwort und das **Anmeldepasswort für die Registrierung** (bekommt, wer registrieren darf). Danach ist man direkt angemeldet.
3. Der Startscreen des Spiels (Logo mit Animation) erscheint, das **Titellied** läuft ab dem ersten Klick (Browser erlauben vorher keinen Ton) und weiter im Menü. Musik-Schalter, Lautstärke und Taste M gelten wie immer.
4. Auf dem Startscreen steht unter dem Logo die Konto-Zeile ("Angemeldet als ...", Passwort ändern, Abmelden), ein **unbeschriftetes Feld** (für Hilfstechnik: "Startcode") und eine Statuszeile ("Spielserver: aus / startet / bereit").
5. Ist der Server aus: Wer den Startcode hat, gibt ihn in das Feld ein und drückt Enter; der Server fährt hoch (2 bis 4 Minuten), die Statuszeile zeigt die Phase.
6. **Arbeitsannahme (vom Auftraggeber nicht ausdrücklich bestätigt):** Läuft der Server schon, kommen angemeldete Spieler ohne Startcode ins Spiel; der Startcode ist nur zum Hochfahren nötig. Der **Not-aus** (Knopf erscheint, solange der Server läuft oder startet) braucht immer den Startcode im Feld.
7. Bei "bereit" setzt die Seite "Online: Server" auf die sslip-Adresse und legt ein kurzlebiges Spieltoken als Sitzung ab; das Spiel erkennt den Spieler damit als Konto.
8. 15 Minuten ohne Verbindung: der Server sichert sich selbst und verschwindet. Dann ist Schritt 5 wieder nötig.

## Aufbau (im Repo)

| Teil | Datei |
| --- | --- |
| Header-Regeln | `public/_headers` (Frame-Schutz, nosniff, `no-store` an `/api/*`; Format von Cloudflare Pages) |
| HTTP-Logik, Hetzner (Start, Status, Not-aus) | `scripts/betrieb/web/gateway-kern.mjs` |
| Nutzerlogik (Registrieren, Login, Sperre, Passwort, Saat, Statistik) | `scripts/betrieb/web/nutzer.mjs` |
| Speicher-Abstraktion (Cloudflare D1, Arbeitsspeicher für Tests) | `scripts/betrieb/web/speicher.mjs` |
| Hashes (scrypt, PBKDF2) | `scripts/betrieb/web/hash.mjs`, Werkzeug `scripts/betrieb/web/geheimnis-hash.mjs` |
| Spieltoken, Statistik-Signatur (beide Seiten, EINE Implementierung) | `src/server/webAnbindung.js` |
| Spielkonten (Spiegel der Web-Konten, Rangliste) | `src/server/konto.js` (`externPruefer`), `kontoSpeicher.js`, `bestenliste.js` |
| Einstieg (Cloudflare Pages Function) | `functions/api/web/[[path]].mjs` → `scripts/betrieb/web/cloudflare-einstieg.mjs` (Verdrahtung: Secrets aus `env`, D1-Bindung `DB`, Hintergrundauftrag per `waitUntil`); `public/_routes.json` lässt nur `/api/web/*` die Function aufrufen |
| Installer als Text | `scripts/betrieb/web/installer-text.mjs`, ERZEUGT mit `npm run web:installer` aus `server-erstinstallation.sh` (ein Test hält beide gleich) |
| Client | `src/client/webStart.js`, `webAnmeldung.js`, `webApi.js` (nur im Web-Build, plus `pa-web.json`) |
| Titellied | `src/client/assets/music/titellied.mp3`, Manifest-Eintrag `"titellied": true`, Logik `musikListe.js` / `musik.js` |
| Hash im Browser erzeugen | `public/passwort-hash.html` |
| Tests | `tests/betrieb-web.test.js`, `tests/web-anbindung.test.js`, `tests/origin-pruefung.test.js`, `tests/e2e/web-zugang.spec.mjs` |

## API (`/api/web/*`, JSON)

| Pfad | Zugriff | Zweck |
| --- | --- | --- |
| `POST registrieren` | Anmeldepasswort | `{email, name, passwort, anmeldepasswort}`, setzt das Sitzungscookie |
| `POST login` | offen, gebremst | `{kennung, passwort}`, Kennung = Benutzername oder E-Mail |
| `POST logout` | offen | löscht das Cookie |
| `GET ich` | Sitzung | eigene Daten (ohne Hash) |
| `POST passwort-aendern` | Sitzung | `{altes, neues}`; macht alle alten Cookies ungültig |
| `POST spieltoken` | Sitzung | `{token, laeuftAb, name}`, 2 Stunden gültig |
| `GET status` | Sitzung | `aus / startet / bereit / sichert` aus Hetzner |
| `POST start`, `POST not-aus` | Sitzung **und** `{startcode}` | Server hochfahren; Not-aus als Hintergrundauftrag |
| `POST statistik` | Signatur des Spielservers | Partieergebnis je Spieler (siehe unten) |

Alle `POST` außer `statistik` verlangen passende Herkunft und den Kopf `x-pa-web: 1`.

## Nutzerdatenbank

Ablage: **Cloudflare D1** (SQLite, Gratis-Tarif; Tabelle `pa_kv`, Schema `D1_SCHEMA` in `speicher.mjs`, wird beim ersten Zugriff angelegt). Sie steckt hinter fünf Methoden (`lies`, `neu`, `ersetze`, `setze`, `loesche`); Atomarität bringt je Aufruf ein SQL-Befehl (`INSERT OR IGNORE`, `UPDATE ... WHERE etag = ?`). `tests/betrieb-d1-speicher.test.js` prüft D1 und Arbeitsspeicher gegen denselben Vertrag, D1 über eine echte SQLite-Datenbank. Bereiche: `nutzer` (ID zu Konto), `namen` und `emails` (SHA-256 des normalisierten Werts zu ID; erzwingen die Eindeutigkeit atomar per "nur wenn neu"), `sperre` (Fehlversuchszähler), `meldungen` (Idempotenz der Statistik).

- Benutzername: 3 bis 20 Zeichen, Buchstaben/Ziffern/Leerzeichen/`_`/`-`, **eindeutig ohne Groß/Klein, Unicode-normalisiert (NFC)**; Regeln aus `konto.js`.
- E-Mail: eindeutig (ohne Groß/Klein). Nicht erkannt werden Alias-Schreibweisen (z. B. `+tag`, Punkte bei Gmail).
- Passwörter: nur **scrypt** (`N=16384, r=8, p=1`, wie die Spielkonten), nie Klartext, nie in Logs. Die Geheimnisse der Umgebung (Anmelde-, Startpasswort) sind scrypt mit `N=65536`; PBKDF2 von `passwort-hash.html` wird ebenfalls akzeptiert.
- Sitzung: Cookie `pa_web` (`v2.<nutzer>.<sv>.<bis>.<hmac>`), HttpOnly, Secure, SameSite=Strict, 7 Tage, zustandslos; `sv` steigt beim Passwortwechsel. Abmelden löscht das Cookie im Browser; ein vorher kopiertes Cookie bleibt bis zum Ablauf oder Passwortwechsel gültig (Grenze der zustandslosen Sitzung).
- Sperre (persistent, in der Datenbank): Login 5 Fehlversuche je Name, 20 je Adresse; Registrierung 5 falsche Anmeldepasswörter je Adresse; Startcode 5 je Nutzer, 10 je Adresse; Passwortwechsel 5 je Nutzer. Fenster 15 Minuten. Zusätzlich 0,4 bis 0,6 s Verzögerung je Fehlversuch. Die Adresse kommt aus `cf-connecting-ip` (einstellbar über `PA_WEB_IP_HEADER`).
- Feste Konten (Saat): `PA_KONTEN_SAAT` wird beim ersten Aufruf je Instanz geprüft und idempotent angelegt; bestehende Namen oder Adressen bleiben unverändert (ein später geändertes Passwort wird nicht zurückgesetzt).

### Schema des Datensatzes `nutzer/<id>` (v1)

```json
{ "v": 1, "id": "uuid", "name": "Wodan", "nameKlein": "wodan", "email": "...", "emailKlein": "...",
  "passwortHash": "scrypt$...", "sv": 1, "angelegt": 0, "geaendert": 0,
  "profil": { "foto": null, "bio": "", "angepinnteEinheit": null },
  "stat": { "partien": 0, "siege": 0, "niederlagen": 0, "unentschieden": 0, "spruenge": 0, "schuesse": 0, "treffer": 0,
            "fehlschuesse": 0, "schaden": 0, "kills": 0, "tode": 0, "selbsttreffer": 0,
            "einheiten": { "<einheitId>": { "schaden": 0, "kills": 0, "einsaetze": 0 } },
            "waffen": { "<waffenId>": { "schuesse": 0, "treffer": 0, "schaden": 0 } }, "zuletzt": null } }
```

`profil.angepinnteEinheit = null` bedeutet automatisch: die Einheit mit dem meisten Schaden über alle Spiele (`meisterSchadenEinheit(stat)` in `nutzer.mjs`). **Profil- und Scoreboard-Oberfläche sind nicht gebaut**, nur Schema, Verbuchung und Doku. Fremde Profile oder ein Scoreboard über alle Spieler brauchen später einen Listen-Weg (`SELECT` über `pa_kv` oder ein Index) und sind offen.

## Verbindung zum Spiel

- **Spieltoken:** Der Web-Einstieg stellt `pa1.<nutzlast>.<hmac>` aus (Nutzer-ID, Name, Ablauf; 2 Stunden), signiert mit einem aus `PA_SPIEL_GEHEIMNIS` abgeleiteten Schlüssel. Der Client legt es wie ein Spielkonto-Token ab (`konto.js`, `?sitzung=` am WebSocket, `Authorization: Bearer` an der API) und erneuert es alle 25 Minuten und bei jedem Statusabruf.
- **Spielserver:** `KontoDienst.kontoFuerToken` erkennt Tokens mit `pa1.`, prüft sie mit `webAnbindung.js` und legt einmal ein lokales Spiegelkonto `w-<Nutzer-ID>` an (kein Passworthash, also keine Passwortanmeldung; bei Namenskonflikt mit einem lokalen Konto wird `~xxxx` angehängt). Rangliste und Sitzplätze laufen unverändert über die bestehende Kontenlogik. Das Geheimnis kommt per cloud-init nur nach `/run/projectarmageddon/spiel-geheimnis` (tmpfs, wie das Hetzner-Token, nie auf die Platte oder ins Abbild); `server-erstinstallation.sh` gibt es der Gruppe `pa` zum Lesen frei. Ohne Geheimnis nimmt der Server keine Spieltoken an (Gast).
- **Statistik:** Nach Partieende meldet der Spielserver (nur wenn `PA_STATISTIK_URL` und das Geheimnis gesetzt sind; der Web-Einstieg trägt sie automatisch ein) an `POST /api/web/statistik`. Kopfzeilen `x-pa-zeit` (ms, Fenster ±5 min) und `x-pa-signatur` (HMAC-SHA256 über `<zeit>.<body>`, eigener abgeleiteter Schlüssel). Body: `{v:1, meldungsId, beendetAm, modus, spieler:[{nutzerId, ergebnis: sieg|niederlage|unentschieden, werte:{schuesse,treffer,fehlschuesse,kills,schaden,spruenge,tode,selbsttreffer}, einheiten:{id:{schaden,kills,einsaetze}}, waffen:{id:{schuesse,treffer,schaden}}}]}`. Je Partie und Spieler wird genau einmal verbucht (Wiederholung ergibt `doppelt`); unbekannte Felder werden verworfen, Zahlen gedeckelt.
- **Heute gemeldet** wird, was der Server schon erfasst: Ergebnis, Schüsse, Treffer, Fehlschüsse (Schüsse minus Treffer), Kills, Schaden. **Spielintern noch nicht erfasst** (spätere Aufgabe): Sprünge, Selbsttreffer, Schaden je Einheit und je Waffe, Tode im Meldeweg (die Rangliste zählt sie lokal). Der Endpunkt nimmt sie bereits an.

## Umgebungsvariablen des Web-Einstiegs (vollständige Liste)

Als **Secrets** des Cloudflare-Projekts eintragen (Dashboard: Workers & Pages, das Projekt, Settings, Variables and Secrets; nicht als Klartext-Variable). Zusätzlich die D1-Bindung `DB`.

| Name | Pflicht | Inhalt |
| --- | --- | --- |
| `HCLOUD_TOKEN` | ja | Hetzner-Projekt-Token (nur dort eintragen) |
| `PA_WEB_GEHEIMNIS` | ja | zufällige Zeichenkette, mindestens 32 Zeichen (Cookie-Signatur, Hintergrundauftrag) |
| `PA_SPIEL_GEHEIMNIS` | ja | zweite, andere zufällige Zeichenkette, mindestens 32 Zeichen (Spieltoken und Statistik, wird dem Spielserver mitgegeben) |
| `PA_REGISTRIER_HASH` | ja | Hash des Anmeldepassworts für die Registrierung (`scrypt$...`) |
| `PA_START_HASH` | ja | Hash des Startcodes (`scrypt$...`) |
| `PA_KONTEN_SAAT` | optional | JSON-Liste fester Konten mit **Hashes**: `[{"name":"...","email":"...","hash":"scrypt$..."}]` |
| `PA_WEB_ORIGIN` | optional | Herkunft der Seite, Vorgabe `https://www.projectarmageddon.de` |
| `PA_SERVER_TYP` (`cpx22`), `PA_ORT` (`fsn1`), `PA_DOMAIN`, `PA_ACME_EMAIL`, `PA_NAME`, `PA_WEB_FRISCH` | optional | wie bisher |

Entfallen: die frühere Einzelpasswort-Variable der alten Anmeldung (sie gibt es nicht mehr). Die Werte der drei Hash-Variablen für die vereinbarten Passwörter stehen im Übergabebericht, nicht in diesem Repo.

## Einrichtung (iPhone oder Laptop, ohne Kommandozeile)

1. **Zufallsgeheimnisse:** Zwei verschiedene zufällige Zeichenketten von mindestens 32 Zeichen erzeugen (Passwort-Manager des iPhones: "Starkes Passwort verwenden", Länge 40 oder mehr) und für `PA_WEB_GEHEIMNIS` und `PA_SPIEL_GEHEIMNIS` bereithalten.
2. **Hashes:** Entweder die fertigen Werte aus dem Übergabebericht nehmen, oder neue im Browser erzeugen: `https://www.projectarmageddon.de/passwort-hash.html` öffnen (vor dem ersten Deploy: die Datei `public/passwort-hash.html` lokal im Browser öffnen), Passwort eingeben, "Hash erzeugen", das Ergebnis `pbkdf2$600000$...` kopieren. Es wird nichts gesendet.
3. Cloudflare-Projekt (Pages) mit dem Repository verbinden, Branch `main`, Build `npm ci && PA_WEB_BUILD=1 npm run build`, Ausgabe `dist`; eine D1-Datenbank anlegen und als Bindung `DB` an das Projekt hängen. **Der Einstieg (Pages Function) fehlt noch im Repo**, siehe unten.
4. Secrets der Tabelle oben anlegen: Pflichtvariablen immer, `PA_KONTEN_SAAT` mit dem Wert aus dem Bericht (eine Zeile, JSON).
5. Domain `www.projectarmageddon.de` im Projekt eintragen, DNS und Zertifikat über Cloudflare.
6. Test: `https://www.projectarmageddon.de` öffnen, mit dem Konto aus `PA_KONTEN_SAAT` anmelden (die feste Konten entstehen beim ersten Aufruf), Passwort ändern prüfen, Startcode eingeben.

Neue Secrets wirken erst nach einem neuen Deploy.

Das GitHub-Verfahren `server-hochfahren.yml` (docs/betrieb.md) bleibt als Alternative zum Starten erhalten.

## Einstieg auf Cloudflare

Gebaut und mit einer SQLite-Hülle für D1 getestet (`tests/cloudflare-einstieg.test.js`), **nicht auf Cloudflare ausgeführt**. Einstellungen im Cloudflare-Dashboard (Workers & Pages, Projekt aus dem GitHub-Repository, Branch `main`):

| Einstellung | Wert |
| --- | --- |
| Build-Befehl | `npm ci && PA_WEB_BUILD=1 npm run build` |
| Ausgabeordner | `dist` (enthält `_headers` und `_routes.json` aus `public/`) |
| Node-Version | Umgebungsvariable `NODE_VERSION` = `22` |
| Kompatibilitäts-Kennzeichen | `nodejs_compat` (Settings, Functions; für `node:crypto`, `Buffer`) |
| D1-Datenbank | anlegen (z. B. Name `pa-nutzer`), als Bindung **`DB`** an das Projekt hängen; die Tabelle legt der Code selbst an |
| Secrets | Tabelle „Umgebungsvariablen“ oben |

Es gibt bewusst **keine `wrangler.toml`**: Mit einer solchen Datei gälte sie als alleinige Quelle für die Bindungen, und die D1-ID, die nur der Auftraggeber kennt, müsste im Repo stehen.

Bekannte Stolpersteine (im Code berücksichtigt):

- `fetch` wird als Hülle übergeben; ein gespeichertes `globalThis.fetch` wirft in Workers „Illegal invocation“.
- Kein Dateisystem: Der Installer kommt als Text (`installer-text.mjs`).
- Die Adresse für die Sperre kommt aus `cf-connecting-ip`.

**Rechenzeit prüfen, bevor der Dienst öffentlich wird:** Anmeldung und Registrierung rechnen scrypt (`N=16384`, Geheimnisse `N=65536`). Nach meinem Kenntnisstand begrenzt der kostenlose Tarif die Rechenzeit je Aufruf auf wenige Millisekunden; scrypt braucht deutlich mehr. Geht das nicht, sind zwei Wege offen: der bezahlte Workers-Tarif (Preis, Entscheidung und Besitzer legt der Auftraggeber fest, AGENTS.md §5/§7) oder ein kleineres `N` (schwächerer Hash, nur mit ausdrücklicher Entscheidung). Erst ein echter Aufruf zeigt es.

**Not-aus** läuft als eigener Aufruf an `/api/web/not-aus-auftrag` (signierter, 60 Sekunden gültiger Auftrag), den die Antwort-Function mit `waitUntil` anstößt. Ob Cloudflare einen solchen Aufruf über mehrere Minuten (Abbild, Prüfung, Löschen) am Leben hält, ist nicht belegt; ein Not-aus-Versuch auf Cloudflare gehört zur ersten Abnahme. Bleibt er hängen, löscht `server-hochfahren.yml` (GitHub) bzw. die Idle-Bremse auf dem Knoten.

## Aktualisieren

Neuer Code: nach dem Push baut Cloudflare Pages die Seite selbst. Der Spielserver nutzt das Abbild: Server starten, `scripts/release/deploy.sh` wie in `deploy/README.md` ausführen, ruhen lassen (Selbstabbild) oder Not-aus. Bis dahin warnt die Statuszeile bei abweichender Version. **Wichtig für diese Änderung:** Das Abbild enthält noch den alten Spielservercode ohne Spieltoken-Prüfung. Bis das Abbild erneuert ist, spielen angemeldete Spieler auf dem Server als Gäste.

## Sicherheit und Grenzen (ehrlich)

- Das Startpasswort schützt das Starten und damit die Kosten. Der Spielserver unter der sslip-Adresse ist öffentlich erreichbar; ohne gültiges Spieltoken spielt man als Gast.
- Das Anmeldepasswort für die Registrierung ist ein gemeinsames Geheimnis vieler Menschen: Wer es weitergibt, öffnet die Registrierung. Ändern: neuen Hash erzeugen, `PA_REGISTRIER_HASH` ersetzen, neu deployen (bestehende Konten bleiben).
- Der Spieltoken liegt im `sessionStorage` des Tabs (lesbar für Skripte der Seite; die Seite lädt kein Fremdskript). Das Sitzungscookie ist HttpOnly.
- Die Hashes der Umgebung sind kein Klartext, aber mit genug Rechenzeit angreifbar: Ein langes Passwort und die Sperre bremsen, ersetzen aber keine Geheimhaltung. Das Cloudflare-Konto mit Zwei-Faktor absichern.
- Das Token liegt in den Hoster-Umgebungsvariablen und für die Laufzeit im RAM des Spielservers (Beschreibung in betrieb-INSTANZ.md).
- Not-aus läuft als Hintergrundauftrag (Minuten, signierter 60-Sekunden-Auftrag; auf Cloudflare über `ctx.waitUntil` oder einen Queue-/Cron-Aufruf) und löscht nur mit geprüftem Abbild; sonst bleibt der Server stehen und kostet weiter.
- Datenschutz: Die Datenbank enthält E-Mail-Adressen und Statistiken. Ein Löschweg für Nutzer ist **nicht gebaut** (offen).

## Ungeprüft (nicht in dieser Umgebung nachweisbar)

- Der echte Deploy auf Cloudflare (Pages, Function, D1-Bindung, Hintergrundauftrag, Rechenzeit von scrypt, Dauer des Not-aus-Aufrufs) wurde nicht ausgeführt.
- **D1 gegen die echte Datenbank:** getestet ist `D1Speicher` gegen SQLite über dieselbe Aufrufform (`prepare().bind().first()/run()`, `meta.changes`); das Verhalten der Cloudflare-Bindung selbst ist nicht erprobt.
- Läuft `scrypt` (`node:crypto`) im Worker und reicht die Rechenzeit des Tarifs? Siehe „Einstieg auf Cloudflare“; nicht erprobt.
- DNS und Zertifikat für www bei Cloudflare: nicht erprobt.
- Spieltoken-Prüfung und Statistik-Meldung auf einem echten Hetzner-Knoten (Datei unter `/run`, Rechte, Meldung durch das Netz): nicht erprobt; Unit-getestet sind Token, Signatur, Zuordnung zum lokalen Konto und das Bauen der Meldung.
- Die Hörbarkeit des Titelliedes (Schleife, Überblendung) und das Aussehen der Leiste: nur automatisch geprüft, nicht von Menschen gehört oder gesehen.
