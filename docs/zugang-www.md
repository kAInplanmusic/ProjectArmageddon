# Zugang unter https://www.projectarmageddon.de (Option D)

Entscheidung des Auftraggebers: Ein kostenloser Webhoster (Netlify) liefert den Client und hält Login sowie Start, Status und Not-aus des Spielservers. Die Spielverbindung (WebSocket und API) geht direkt zum Hetzner-Knoten unter `https://<ip-mit-bindestrichen>.sslip.io`. Optionen mit eigenem Rechner oder eigenem Gateway sind verworfen und entfernt.

Kosten: Netlify im Gratis-Tarif 0 EUR. Hetzner wie in `docs/betrieb-INSTANZ.md` Abschnitt 10 (nur Abbild plus Primary IP im Ruhezustand, 0,037128 EUR/h nur während der Miete). Gesamt weit unter 25 EUR/Monat.

## Ablauf für den Spieler

1. www.projectarmageddon.de öffnen, Passwort eingeben.
2. Ist der Server aus: Knopf "Server starten". Die Seite zeigt "wird gestartet" (Phase) und prüft alle 5 s.
3. Bei "bereit" verschwindet die Startseite; das Feld "Online: Server" steht auf die sslip-Adresse, das Spiel läuft wie bisher.
4. 15 Minuten ohne Verbindung: der Server sichert sich selbst und verschwindet. Dann ist Schritt 2 wieder nötig.

## Aufbau (im Repo)

| Teil | Datei |
| --- | --- |
| Hoster-Konfiguration | `netlify.toml` (Build mit `PA_WEB_BUILD=1`, Funktionen, `included_files`) |
| Logik (Login, Sitzung, Hetzner) | `scripts/betrieb/web/gateway-kern.mjs` |
| Funktionen | `netlify/functions/web.mjs` (`/api/web/*`), `netlify/functions/not-aus-background.mjs` |
| Client-Seite | `src/client/webStart.js`, nur im Web-Build, plus `pa-web.json` |
| Hash-Erzeugung | `public/passwort-hash.html` (im Browser) oder `scripts/betrieb/web/passwort-hash.mjs` |
| Tests | `tests/betrieb-web.test.js`, `tests/origin-pruefung.test.js` |

Server-Seite: `PA_ERLAUBTE_ORIGINS` enthält automatisch die sslip-Adresse und `PA_WEB_ORIGIN` (Vorgabe `https://www.projectarmageddon.de`); Lobby-API (CORS) und WebSocket prüfen die Herkunft. Die Seite ist https, der Server wss; Mixed Content entsteht nicht. Versionsabgleich: Die Startseite vergleicht `version.json` der Seite mit `/healthz` des Servers und warnt bei Abweichung ("Trotzdem spielen"); die Protokollversion prüft der Server ohnehin. Das Abbild enthält den Code vom letzten Einrichten: Nach Codeänderungen Seite und Abbild gemeinsam erneuern (Abschnitt "Aktualisieren").

## Einrichtung (iPhone oder Laptop, ohne Kommandozeile)

1. Passwort-Hash erzeugen: im Browser `https://www.projectarmageddon.de/passwort-hash.html` öffnen (vor dem ersten Deploy: Netlify-Vorschau-Adresse oder lokal `public/passwort-hash.html` im Browser öffnen). Ein langes Passwort (mindestens 12 Zeichen) eingeben, "Hash erzeugen", das Ergebnis `pbkdf2$600000$...` kopieren. Es wird nichts gesendet.
2. Geheimnis für die Cookies: eine zufällige Zeichenkette von mindestens 32 Zeichen (Passwort-Manager des iPhones, "Starkes Passwort verwenden").
3. Konto auf netlify.com anlegen (kostenlos, Anmeldung mit GitHub möglich).
4. "Add new project", "Import an existing project", GitHub, das Repository `ProjectArmageddon` wählen. Branch `main`. Die Einstellungen kommen aus `netlify.toml` (nichts ändern).
5. Vor dem ersten Deploy unter "Site configuration", "Environment variables" anlegen:
   - `HCLOUD_TOKEN` = Hetzner-Projekt-Token (nur dort eintragen)
   - `PA_WEB_PASSWORT_HASH` = der Hash aus Schritt 1
   - `PA_WEB_GEHEIMNIS` = Zeichenkette aus Schritt 2
   - optional `PA_WEB_ORIGIN` (Vorgabe `https://www.projectarmageddon.de`), `PA_SERVER_TYP` (Vorgabe `cpx22`), `PA_ORT` (`fsn1`), `PA_DOMAIN` (eigene Domain für den Spielserver statt sslip.io), `PA_ACME_EMAIL`
   Als "Contains secret values" markieren, mindestens für die ersten drei.
6. "Deploy". Danach "Domain management", "Add a domain", `www.projectarmageddon.de` eintragen.
7. DNS bei Speed it (Zone `projectarmageddon.de`): CNAME-Eintrag, Name `www`, Wert `<name-der-netlify-seite>.netlify.app` (steht in Netlify unter der Domainverwaltung; bei "Netlify DNS" nicht nötig). Etwaige alte A/AAAA/CNAME-Einträge für `www` entfernen. Netlify stellt das TLS-Zertifikat selbst aus (kann einige Minuten dauern). Die Adresse ohne `www` (Apex) braucht bei Speed it eine Weiterleitung auf `www` oder ALIAS/ANAME, falls angeboten; sonst nur `www` nutzen.
8. Test: `https://www.projectarmageddon.de` öffnen, Passwort eingeben, "Server starten".

Das GitHub-Verfahren `server-hochfahren.yml` (docs/betrieb.md) bleibt als Alternative zum Starten erhalten.

## Aktualisieren

Neuer Code: nach dem Push baut Netlify die Seite selbst. Der Spielserver nutzt das Abbild: Server starten, `scripts/release/deploy.sh` wie in `deploy/README.md` ausführen, ruhen lassen (Selbstabbild) oder Not-aus. Bis dahin warnt die Startseite bei abweichender Version.

## Sicherheit und Grenzen (ehrlich)

- Das Login schützt das Starten und damit die Kosten. Der Spielserver unter der sslip-Adresse ist öffentlich erreichbar; Spieler schützt das Konto des Spiels. Wer die Adresse kennt, kann spielen, solange er läuft.
- Sitzung: signiertes Cookie (HMAC), HttpOnly, Secure, SameSite=Strict, 12 h; POST nur mit passender Herkunft und Schutzkopf.
- Sperre nach 5 Fehlversuchen je Adresse (15 min) liegt im Speicher der Funktionsinstanz: bestmöglich, nicht verteilt. Deshalb ein langes Passwort und PBKDF2 mit 600 000 Runden plus 0,6 s Verzögerung je Fehlversuch.
- Das Token liegt in den Hoster-Umgebungsvariablen (Netlify-Konto absichern, Zwei-Faktor) und für die Laufzeit im RAM des Spielservers (Beschreibung in betrieb-INSTANZ.md).
- Not-aus läuft als Netlify-Hintergrundfunktion (bis 15 Minuten) und löscht nur mit geprüftem Abbild; sonst bleibt der Server stehen und kostet weiter.

## Ungeprüft (nicht in dieser Umgebung nachweisbar)

- Der echte Deploy auf Netlify (Konto, Build, Funktionen, `included_files` für die Installer-Datei, Hintergrundfunktion antwortet 202) wurde nicht ausgeführt.
- Der Aufruf Funktion -> Hintergrundfunktion über `/.netlify/functions/not-aus-background` ist nach Dokumentation angelegt, aber nicht erprobt.
- DNS und Zertifikat für www (Speed it, Netlify): nicht erprobt; die API von Speed it ist unbekannt und wird nicht gebraucht.
- Mock-getestet: Login, Sitzung, Sperre, Herkunft, Start/Status/Not-aus gegen ein falsches Hetzner, Server-Herkunftsprüfung. Der Client-Build mit `PA_WEB_BUILD=1` erzeugt `pa-web.json` und lädt `webStart.js`; die Bedienung der Startseite im Browser ist nicht geprüft.
