# Zugang unter https://www.projectarmageddon.de (Option D)

Entscheidung des Auftraggebers: Ein kostenloser Webhoster (Netlify) liefert den Client, hält die **Nutzerdatenbank** (Konten, Anmeldung, später Profil und Scoreboard) sowie Start, Status und Not-aus des Spielservers. Die Spielverbindung (WebSocket und API) geht direkt zum Hetzner-Knoten unter `https://<ip-mit-bindestrichen>.sslip.io`. Optionen mit eigenem Rechner oder eigenem Gateway sind verworfen und entfernt.

Kosten: Netlify im Gratis-Tarif 0 EUR (Funktionen, Blobs). Hetzner wie in `docs/betrieb-INSTANZ.md` Abschnitt 10 (nur Abbild plus Primary IP im Ruhezustand, 0,037128 EUR/h nur während der Miete). Gesamt weit unter 25 EUR/Monat. Die Nutzerdatenbank liegt **nicht** auf dem Hetzner-Knoten und überlebt dessen Selbstlöschung.

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
| Hoster-Konfiguration | `netlify.toml` (Build mit `PA_WEB_BUILD=1`, Funktionen, `included_files`) |
| HTTP-Logik, Hetzner (Start, Status, Not-aus) | `scripts/betrieb/web/gateway-kern.mjs` |
| Nutzerlogik (Registrieren, Login, Sperre, Passwort, Saat, Statistik) | `scripts/betrieb/web/nutzer.mjs` |
| Speicher-Abstraktion (Netlify Blobs, Arbeitsspeicher für Tests) | `scripts/betrieb/web/speicher.mjs` |
| Hashes (scrypt, PBKDF2) | `scripts/betrieb/web/hash.mjs`, Werkzeug `scripts/betrieb/web/geheimnis-hash.mjs` |
| Spieltoken, Statistik-Signatur (beide Seiten, EINE Implementierung) | `src/server/webAnbindung.js` |
| Spielkonten (Spiegel der Web-Konten, Rangliste) | `src/server/konto.js` (`externPruefer`), `kontoSpeicher.js`, `bestenliste.js` |
| Funktionen | `netlify/functions/web.mjs` (`/api/web/*`), `netlify/functions/not-aus-background.mjs` |
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

Ablage: **Netlify Blobs** (Teil von Netlify, kein neues Konto, kostenlos). Sie steckt hinter fünf Methoden (`lies`, `neu`, `ersetze`, `setze`, `loesche` in `speicher.mjs`); ein Wechsel (z. B. Postgres) betrifft nur diese Datei. Bereiche: `nutzer` (ID zu Konto), `namen` und `emails` (SHA-256 des normalisierten Werts zu ID; erzwingen die Eindeutigkeit atomar per "nur wenn neu"), `sperre` (Fehlversuchszähler), `meldungen` (Idempotenz der Statistik).

- Benutzername: 3 bis 20 Zeichen, Buchstaben/Ziffern/Leerzeichen/`_`/`-`, **eindeutig ohne Groß/Klein, Unicode-normalisiert (NFC)**; Regeln aus `konto.js`.
- E-Mail: eindeutig (ohne Groß/Klein). Nicht erkannt werden Alias-Schreibweisen (z. B. `+tag`, Punkte bei Gmail).
- Passwörter: nur **scrypt** (`N=16384, r=8, p=1`, wie die Spielkonten), nie Klartext, nie in Logs. Die Geheimnisse der Umgebung (Anmelde-, Startpasswort) sind scrypt mit `N=65536`; PBKDF2 von `passwort-hash.html` wird ebenfalls akzeptiert.
- Sitzung: Cookie `pa_web` (`v2.<nutzer>.<sv>.<bis>.<hmac>`), HttpOnly, Secure, SameSite=Strict, 7 Tage, zustandslos; `sv` steigt beim Passwortwechsel. Abmelden löscht das Cookie im Browser; ein vorher kopiertes Cookie bleibt bis zum Ablauf oder Passwortwechsel gültig (Grenze der zustandslosen Sitzung).
- Sperre (persistent, in der Datenbank): Login 5 Fehlversuche je Name, 20 je Adresse; Registrierung 5 falsche Anmeldepasswörter je Adresse; Startcode 5 je Nutzer, 10 je Adresse; Passwortwechsel 5 je Nutzer. Fenster 15 Minuten. Zusätzlich 0,4 bis 0,6 s Verzögerung je Fehlversuch. Die Adresse kommt aus `x-nf-client-connection-ip`.
- Feste Konten (Saat): `PA_KONTEN_SAAT` wird beim ersten Aufruf je Funktionsinstanz geprüft und idempotent angelegt; bestehende Namen oder Adressen bleiben unverändert (ein später geändertes Passwort wird nicht zurückgesetzt).

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

`profil.angepinnteEinheit = null` bedeutet automatisch: die Einheit mit dem meisten Schaden über alle Spiele (`meisterSchadenEinheit(stat)` in `nutzer.mjs`). **Profil- und Scoreboard-Oberfläche sind nicht gebaut**, nur Schema, Verbuchung und Doku. Fremde Profile oder ein Scoreboard über alle Spieler brauchen später einen Listen-Weg (Blobs `list` oder ein Index) und sind offen.

## Verbindung zum Spiel

- **Spieltoken:** Die Funktion stellt `pa1.<nutzlast>.<hmac>` aus (Nutzer-ID, Name, Ablauf; 2 Stunden), signiert mit einem aus `PA_SPIEL_GEHEIMNIS` abgeleiteten Schlüssel. Der Client legt es wie ein Spielkonto-Token ab (`konto.js`, `?sitzung=` am WebSocket, `Authorization: Bearer` an der API) und erneuert es alle 25 Minuten und bei jedem Statusabruf.
- **Spielserver:** `KontoDienst.kontoFuerToken` erkennt Tokens mit `pa1.`, prüft sie mit `webAnbindung.js` und legt einmal ein lokales Spiegelkonto `w-<Nutzer-ID>` an (kein Passworthash, also keine Passwortanmeldung; bei Namenskonflikt mit einem lokalen Konto wird `~xxxx` angehängt). Rangliste und Sitzplätze laufen unverändert über die bestehende Kontenlogik. Das Geheimnis kommt per cloud-init nur nach `/run/projectarmageddon/spiel-geheimnis` (tmpfs, wie das Hetzner-Token, nie auf die Platte oder ins Abbild); `server-erstinstallation.sh` gibt es der Gruppe `pa` zum Lesen frei. Ohne Geheimnis nimmt der Server keine Spieltoken an (Gast).
- **Statistik:** Nach Partieende meldet der Spielserver (nur wenn `PA_STATISTIK_URL` und das Geheimnis gesetzt sind; die Funktion trägt sie automatisch ein) an `POST /api/web/statistik`. Kopfzeilen `x-pa-zeit` (ms, Fenster ±5 min) und `x-pa-signatur` (HMAC-SHA256 über `<zeit>.<body>`, eigener abgeleiteter Schlüssel). Body: `{v:1, meldungsId, beendetAm, modus, spieler:[{nutzerId, ergebnis: sieg|niederlage|unentschieden, werte:{schuesse,treffer,fehlschuesse,kills,schaden,spruenge,tode,selbsttreffer}, einheiten:{id:{schaden,kills,einsaetze}}, waffen:{id:{schuesse,treffer,schaden}}}]}`. Je Partie und Spieler wird genau einmal verbucht (Wiederholung ergibt `doppelt`); unbekannte Felder werden verworfen, Zahlen gedeckelt.
- **Heute gemeldet** wird, was der Server schon erfasst: Ergebnis, Schüsse, Treffer, Fehlschüsse (Schüsse minus Treffer), Kills, Schaden. **Spielintern noch nicht erfasst** (spätere Aufgabe): Sprünge, Selbsttreffer, Schaden je Einheit und je Waffe, Tode im Meldeweg (die Rangliste zählt sie lokal). Der Endpunkt nimmt sie bereits an.

## Netlify-Umgebungsvariablen (vollständige Liste)

Eintragen unter "Site configuration", "Environment variables". Alle als "Contains secret values" markieren. Hinweis: Netlify begrenzt alle Variablen zusammen auf rund 4 KB; die Werte hier liegen weit darunter.

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

Entfallen: die frühere Einzelpasswort-Variable der alten Anmeldung (sie gibt es nicht mehr; sie kann in Netlify gelöscht werden). Die Werte der drei Hash-Variablen für die vereinbarten Passwörter stehen im Übergabebericht, nicht in diesem Repo.

## Einrichtung (iPhone oder Laptop, ohne Kommandozeile)

1. **Zufallsgeheimnisse:** Zwei verschiedene zufällige Zeichenketten von mindestens 32 Zeichen erzeugen (Passwort-Manager des iPhones: "Starkes Passwort verwenden", Länge 40 oder mehr) und für `PA_WEB_GEHEIMNIS` und `PA_SPIEL_GEHEIMNIS` bereithalten.
2. **Hashes:** Entweder die fertigen Werte aus dem Übergabebericht nehmen, oder neue im Browser erzeugen: `https://www.projectarmageddon.de/passwort-hash.html` öffnen (vor dem ersten Deploy: Netlify-Vorschau-Adresse oder die Datei `public/passwort-hash.html` lokal im Browser öffnen), Passwort eingeben, "Hash erzeugen", das Ergebnis `pbkdf2$600000$...` kopieren. Es wird nichts gesendet.
3. Konto auf netlify.com anlegen (kostenlos, Anmeldung mit GitHub möglich).
4. "Add new project", "Import an existing project", GitHub, das Repository `ProjectArmageddon` wählen. Branch `main`. Die Einstellungen kommen aus `netlify.toml` (nichts ändern).
5. Vor dem ersten Deploy unter "Site configuration", "Environment variables", "Add a variable" die Variablen der Tabelle oben anlegen: Pflichtvariablen immer, `PA_KONTEN_SAAT` mit dem Wert aus dem Bericht (eine Zeile, JSON, die Anführungszeichen gehören dazu).
6. "Deploy". Danach "Domain management", "Add a domain", `www.projectarmageddon.de` eintragen.
7. DNS bei Speed it (Zone `projectarmageddon.de`): CNAME-Eintrag, Name `www`, Wert `<name-der-netlify-seite>.netlify.app` (steht in Netlify unter der Domainverwaltung). Etwaige alte A/AAAA/CNAME-Einträge für `www` entfernen. Netlify stellt das TLS-Zertifikat selbst aus (kann einige Minuten dauern). Die Adresse ohne `www` braucht bei Speed it eine Weiterleitung auf `www` oder ALIAS/ANAME, falls angeboten.
8. Test: `https://www.projectarmageddon.de` öffnen, mit dem Konto aus `PA_KONTEN_SAAT` anmelden (die feste Konten entstehen beim ersten Aufruf), Passwort ändern prüfen, Startcode eingeben.

Neue Variablen oder geänderte Werte wirken erst nach einem neuen Deploy ("Deploys", "Trigger deploy", "Deploy site").

Das GitHub-Verfahren `server-hochfahren.yml` (docs/betrieb.md) bleibt als Alternative zum Starten erhalten.

## Aktualisieren

Neuer Code: nach dem Push baut Netlify die Seite selbst. Der Spielserver nutzt das Abbild: Server starten, `scripts/release/deploy.sh` wie in `deploy/README.md` ausführen, ruhen lassen (Selbstabbild) oder Not-aus. Bis dahin warnt die Statuszeile bei abweichender Version. **Wichtig für diese Änderung:** Das Abbild enthält noch den alten Spielservercode ohne Spieltoken-Prüfung. Bis das Abbild erneuert ist, spielen angemeldete Spieler auf dem Server als Gäste.

## Sicherheit und Grenzen (ehrlich)

- Das Startpasswort schützt das Starten und damit die Kosten. Der Spielserver unter der sslip-Adresse ist öffentlich erreichbar; ohne gültiges Spieltoken spielt man als Gast.
- Das Anmeldepasswort für die Registrierung ist ein gemeinsames Geheimnis vieler Menschen: Wer es weitergibt, öffnet die Registrierung. Ändern: neuen Hash erzeugen, `PA_REGISTRIER_HASH` ersetzen, neu deployen (bestehende Konten bleiben).
- Der Spieltoken liegt im `sessionStorage` des Tabs (lesbar für Skripte der Seite; die Seite lädt kein Fremdskript). Das Sitzungscookie ist HttpOnly.
- Die Hashes der Umgebung sind kein Klartext, aber mit genug Rechenzeit angreifbar: Ein langes Passwort und die Sperre bremsen, ersetzen aber keine Geheimhaltung. Das Netlify-Konto mit Zwei-Faktor absichern.
- Das Token liegt in den Hoster-Umgebungsvariablen und für die Laufzeit im RAM des Spielservers (Beschreibung in betrieb-INSTANZ.md).
- Not-aus läuft als Netlify-Hintergrundfunktion (bis 15 Minuten, signierter 60-Sekunden-Auftrag) und löscht nur mit geprüftem Abbild; sonst bleibt der Server stehen und kostet weiter.
- Datenschutz: Die Datenbank enthält E-Mail-Adressen und Statistiken. Ein Löschweg für Nutzer ist **nicht gebaut** (offen).

## Ungeprüft (nicht in dieser Umgebung nachweisbar)

- Der echte Deploy auf Netlify (Konto, Build, Funktionen, `included_files`, Hintergrundfunktion antwortet 202) wurde nicht ausgeführt.
- **Netlify Blobs gegen die echte Ablage** (`BlobSpeicher`: `getWithMetadata`, `setJSON` mit `onlyIfNew`/`onlyIfMatch`, starke Konsistenz) ist nicht erprobt; getestet ist die Logik gegen einen Arbeitsspeicher mit demselben Verhalten bei bedingten Schreibzugriffen.
- Der Aufruf Funktion zu Hintergrundfunktion über `/.netlify/functions/not-aus-background` ist nach Dokumentation angelegt, aber nicht erprobt.
- DNS und Zertifikat für www (Speed it, Netlify): nicht erprobt.
- Spieltoken-Prüfung und Statistik-Meldung auf einem echten Hetzner-Knoten (Datei unter `/run`, Rechte, Meldung durch das Netz): nicht erprobt; Unit-getestet sind Token, Signatur, Zuordnung zum lokalen Konto und das Bauen der Meldung.
- Die Hörbarkeit des Titelliedes (Schleife, Überblendung) und das Aussehen der Leiste: nur automatisch geprüft, nicht von Menschen gehört oder gesehen.
