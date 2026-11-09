# TODO-SSOT — die einzige Aufgabenliste von ProjectARMAGEDDON

*Stand: 2026-11-09. Diese Datei ersetzt alle früheren Berichte, Todo-Listen, Fahrpläne und Audits (gelöscht; Inhalt steht hier, die Historie steht in Git). Neue offene Punkte kommen NUR hier hinein. Erledigtes wird hier gestrichen, nicht abgehakt gesammelt.*

Regeln: Nichts erfinden. „Status ungeprüft“ heißt: aus einem älteren Bericht übernommen, noch nicht gegen den Code belegt. Entscheidungen des Auftraggebers stehen in Abschnitt 0.

## BAL-2026-11-09 — Waffenbalancing vorbereiten

Geprüfter Vorschlag und Belege: [Waffenbalancing-Bericht](waffenbalance-2026-11-09/BERICHT.md), [150 Einzelprüfungen](waffenbalance-2026-11-09/EINZELPRUEFUNG-150.md). Keine Spielwerte geändert. Fortschritt ausschließlich hier führen; Umsetzungsvorschlag mit Abhängigkeiten in `waffenbalance-2026-11-09/massnahmen-17.json`.

**BAL-08 erledigt 2026-11-09:** Anker aus `scripts/waffen-anker-tabelle.json` (50 gesetzte Heftpunkte, 100 am Körper gehaltene Waffen, 3 gespiegelte Zellen), `griffObjekt` entfallen, Achsklemme im Renderer entfernt. Abnahme `npm run waffen:anker:abnahme` 150/150 in 72 Konstellationen; Beleg [Ankerabnahme](waffen-anker-abnahme.md).

| ID | Priorität | Offene Arbeit | Abnahme |
|---|---|---|---|
| BAL-01 | P0 | Trefferfenster und echten Flächenradius trennen | 33 betroffene IDs: Nahvorbeiflug ohne Direkttreffer macht bei Radius 0 keinen Flächenschaden. Direkttreffer bleibt wirksam. Radius > 0 behält Abfallkurve. Altreplays bis F15 bleiben bitgleich. |
| BAL-02 | P0 | Klassenfaktor in Strahl- und Projektilpfad vereinheitlichen | Neutraler Testtreffer für pa_083 liefert bei gewollter Gleichbehandlung 34,5 / 46 / 57,5 Rohschaden statt dreimal 46. Buff, Schild, Rüstung und Mehrfachwirkung werden genau einmal verrechnet. F15 unverändert. |
| BAL-03 | P0 | Alte Archetypenboni aus neuen Klassen entfernen oder bewusst definieren | Giftregel 3 Züge bleibt ohne bewusst gewählte neue Resistenz 3 Züge statt 2. Alle drei neuen Klassen, Gift/Säure und Magie-/Schattenwiderstand getrennt prüfen. Altklassen 1/2 behalten ihre Boni. |
| BAL-04 | P0 | Urheber von Schaden über Zeit bis Schadensereignis erhalten | Pa_137: 33 direkter Schaden und 36 nachgewiesener Brand im Kontrollaufbau werden dem richtigen Angreifer zugerechnet; kein Doppelzählen von damage und dot_tick. Zwei Urheber und ein DoT-Kill erhalten eigene Gegenproben. |
| BAL-05 | P1 | Selbstauffüllenden Nachschub als Ökonomieregel entscheiden | Mindestens 20 eigene Anwendungen mit Inventar nur aus Reserve/Nachschub und mit zusätzlicher endlicher Waffe. Munitionsbilanz, Cooldowns, Inventarreihenfolge und Obergrenze 5 dokumentiert; keine unbeabsichtigte positive Rückkopplung. |
| BAL-06 | P0 | Bestehende Balancewerkzeuge auf den tatsächlichen Spielvertrag bringen | Alle 150 aktuelle Namen/Werte; Klassenleben 130/100/70; 9 unbegrenzte, 73 Drei-, 48 Zwei-, 20 Einschusswaffen. Alte Fassung separat reproduzierbar. Jede Distanz bleibt als angefragt/gemessen sichtbar. |
| BAL-07 | P1 | Menü, HUD, Beschreibung und Renderer an dieselbe Partiefassung binden | F11 zeigt historische Teleportplattform, F12/F15 die aktuelle Mine. Maschinenpistole zeigt zur Partie passende 21/42 Werte. Heilung/Schild/Bewegung zeigen reale Nutzwerte; Altreplays erhalten ihre Darstellung. |
| BAL-09 | P1 | Freistellung und Ruheeffekte gezielt bereinigen | Dunkler/heller Spielgrund; Menü 24/64, HiDPI und native Handgröße. Jede Änderung mit Vorher/Nachher pro ID und ohne Verlust von Waffenbestandteilen. |
| BAL-10 | P1 | 26 Zusatzanimationen vor Produktanschluss neu abnehmen | Je Blatt Identität aller acht Frames, Alpha, Richtung, Bewegung und Rolle prüfen. Freigabe vor Loaderanschluss. Schlechte Sheets bleiben ausgeschaltet; starre Werkzeuge dürfen prozedurale Animation behalten. |
| BAL-11 | P1 | Hand-, Rücken-, Aufstell-, Beschwörungs- und Symbolrollen festlegen | Alle 150 IDs haben dokumentierte Rolle; Spezialfälle Rucksack, Gleitschirm, Statue, Boot, Mine und Beschwörung sind im Spiel semantisch verständlich. 96 vorhandene Geschossbilder werden nicht als 96 echte Projektilpfade ausgegeben. |
| BAL-12 | P1 | Reale Treffer- und Kollisionsmatrix vervollständigen | Jede der 112 Angriffswaffen hat mindestens einen vollständigen zielgerichteten Kollisions-/Schadensnachweis in ihrer echten Rolle; 38 Selbstwirkungen haben ihren Nutzen separat belegt. Kontrollierter Explosionsaufruf ersetzt keinen Kollisionsfall. |
| BAL-13 | P1 | Status-, Schild-, Heil- und Buffökonomie mit echten LP testen | Kein unbeabsichtigtes Dauerstun oder unendliches Stapeln. Heilgrenze, 40/55/75 Schildpunkte, 20%/35% Rüstung, Überlappungen und ablaufende Verstärkung jeweils mit Gegenprobe. Nachschub und Turrets mit wirklichen Inventaren/Zielen. |
| BAL-14 | P2 | Feinbalancing pro Rolle statt globaler Schadensfaktoren | Vorher/Nachher mit identischen Seeds, aktuellem Klassenvertrag und echten LP. Änderungen einzeln begründet, kein pauschaler Nerf aus einem Besttreffer. Seltenheit, Loot und Magazin-Killpotenzial sind zusammen bewertet. |
| BAL-15 | P1 | Browser-, Touch- und Bewegungsabnahme nachholen | Betroffene E2E-Specs waffenmenue/waffen-animation und vollständige Suite grün; keine ungeprüften Baselineupdates. 24/64/128 px, geringe Bewegung, Kontrast, Links-/Rechtszielung und klares Nutzenfeedback pro Rolle. |
| BAL-16 | P1 | Namen und Bildversprechen gegen tatsächlich vorhandene Mechanik abgleichen | Cluster-/Schrot-/Salvenmarkierung nur für belegte Mechanik oder eindeutig anders benannt. Pa_127 hat Mine in Name, Icon und Weltobjekt; Zauberrolle/Buch identisch erkennbar. Zielsuche, Multihit und Beschwörung durch echte Ereignisse belegt. |
| BAL-17 | P2 | Karten-, Fraktions- und Partienabdeckung staffeln | Nicht ausgeführte Zellen explizit offen. Volles 150×5×7×20×3-Seed-Kreuzprodukt umfasst bereits 315000 Aufbauten; keine Vollabdeckung aus wenigen Beispielen behaupten. Winrates erst mit Stichprobenumfang, Seedliste und Unsicherheit veröffentlichen. |

## INT-2026-11-09 — Abnahmen des Integrationsbranches

| ID | Arbeit | Konkrete Abnahme |
|---|---|---|
| INT-E2E | Browserabnahme auf CI/Linux mit startfähigem Chromium | Vollständiges `npx playwright test`; besonders Backdrops (SDR-Stufen, Kartenwahl/Hagel), Touch, Lobby, Replay und Siegdialog. Lokaler Start mit EPERM am Unix-Socket blockiert; 18 Fälle erreichten die Anwendung nicht. |
| INT-BILD | iPhone/Desktop-Sichtprüfung der drei Fotos, Hagel und Biomobjekte | Ränder, Zoom, Kontrast, reduzierte Bewegung und Hochformat prüfen; keine HDR-Freigabe behaupten. |
| INT-QUELLE | Exakte Foto-Erzeugung reproduzierbar machen | 8K-Quellen, Crop-Koordinaten, Tonemapping und Encoderparameter zu den vorhandenen SHA-256-Dateien dokumentieren. Quellen/Lizenzen stehen bereits beim Assetbestand. |
| INT-WEGE | Diagnose niedriger Oberflächen-Erreichbarkeit bewerten | `scripts/pruefe-kistenwege.mjs`; Messung berücksichtigt weder Sprünge noch Seil/Flug. Daher kein Beweis unspielbarer Karten. Betroffene Seeds mit echten Spielwegen prüfen. |

Herkunft, Startbefehle und Grenzen: [Agentenübergabe](agenten-uebergabe-2026-11-09.md).

## 0. Entscheidungen des Auftraggebers (2026-10-29/30, verbindlich)

- Alle 20 Biome werden spielbar; neue Gelände-Fassung mit Versionsmarke (alte Replays bit-identisch).
- „567“ = 5, 6 oder 7 Varianten je Kachel/Stoff für organischere, detailreichere Kartengenerierung (reines Client-Variantensystem, deterministisch aus Koordinate und Seed).
- Minen: immer sofort scharf; 5 % Superexplosion (doppelter Schaden), 15 % Blindgänger; Friendly Fire an; Icon der Teleportplattform (pa_127) dient als Mine.
- Fässer: stehen auf der Karte ODER kommen wie Kisten geflogen (gebaut, Bodenobjektfassung 4); Explosionsradius 64 bleibt; Balance nach Playtest des Auftraggebers.
- Seil: exakt Worms-Physik, nichts Eigenes erfinden; Konstanten fehlen (SEIL-1).
- Sprites: Neon-Linie als Optik (SPR-4); 8bit verworfen; Günther und Cookie bleiben wie sie sind (SPR-8); Neuerzeugung per Together gpt-image-2 (läuft).
- Hetzner-Probeserver (Z246): bis etwa 25 €/Monat, ohne GPU, Auto-Shutdown nach 15 Minuten ohne eingeloggten Nutzer, vor dem Abschalten immer Snapshot; Token liegt nicht in der Sitzung.
- Z579 (Rendermessung): Zielgerät iPhone 18 Pro oder Asus-Laptop; der Auftraggeber führt keine Befehle aus, es muss automatisiert gehen.
- Waffenmenü: Kacheln mit Dropdown nach Kategorien, Untermenü mit Waffen, keine freien Tasten.
- 2026-11-02: Gelände je Biom unterscheidbarer bauen (N-29, neue Geländefassung, erst Kontaktbogen 3 Seeds/Biom).
- 2026-11-02: Name/Bild-Brüche der Waffen (N-06) durch neu erzeugte Bilder lösen, Namen bleiben.
- 2026-11-02: Sprite-Neuerzeugung (N-01, SPR-1 bis SPR-5) mit Budget bis 15 USD (Together gpt-image-2).
- 2026-11-02: Emotionen der Nicht-Humanoiden: Pilot über 3-D-Modell aus dem Seitenbild an einer Figur.
- 2026-11-02: Seed (UI-5): jede Partie eine neue Karte, keine zweimal; das Feld bleibt leer (keine Vorbelegung).
- 2026-11-02: Es gibt kein lokales Spiel; eine Pause (STDMECH-1) wird nicht gebaut.
- 2026-11-02: Technische Doppelungen entscheidet der Agent: `sourceRarity` streichen (ENG-10), Lobby nach Auto-Start `running` (SRV-3), ungültiges JSON → HTTP 400 (HTTP-1).
- 2026-11-03: Seil (SEIL-1): ändert die Entscheidung vom 2026-11-02 — der Agent nähert die fehlenden Konstanten selbst an (Recherche, sonst begründete Schätzung, alles als Annäherung dokumentiert und in einer Datei einstellbar), Handhabung wie Worms; der Auftraggeber testet.
- 2026-11-03: Seil: Standardstufe 5 bleibt; Schwerkraft am Seil bleibt wie bei den Figuren (0,42), nicht das langsamere WA-Zeitmaß.
- 2026-11-04: Nur Querformat („Hochformat ganz raus, nur quer und fertig“): kein Hochformat in Menü, Lobby und Server; Telefone hochkant zeigen „Bitte Gerät drehen“; alte Hochformat-Replays bleiben abspielbar. Musikschalter und ähnliche selten gebrauchte Knöpfe (Musik, Effekte, Match verlassen, Aufgeben) liegen im ⚙-Einstellungsmenü der Kopfzeile.
- 2026-11-05: Auftrag „alles bis zur Produktionsreife“; Entscheidungen, die beim Auftraggeber lagen, trifft der Agent nach Spaß/Flow (Liste und Begründung: `docs/plan-produktion.md` Abschnitt 1). Es gibt keine Bots (keine KI-Gegner). Login nur Name + Passwort; dauerhafte Rangliste. Offen beim Auftraggeber nur: Hosting (§5/§7), Bildbudget über 15 USD, Hörabnahme/Playtest.
- 2026-11-05: Hosting: Hetzner, vorerst nur IP (keine Domain) für Tests; Preis höchstens 1 €/h; Besitzer: Auftraggeber; Höchstdauer: keine feste (Auftraggeber: „egal“); Abschaltung: Server wird **nach 15 min ohne Spieler automatisch gelöscht**. Damit Konten/Rangliste das Löschen überleben, sichert die Abschaltung den Spielstand vorher außerhalb des Knotens (Umsetzung im Deploy-Paket). Mieten/Starten bleibt Sache des Auftraggebers (AGENTS.md §5).
- 2026-11-05: **Zugzeit und Kartenformate (Paket A1+A2)** — die Zugzeit hängt an der KARTENGRÖSSE, nicht mehr an der Spielerzahl: klein 30 s, mittel 40 s, groß 50 s; ein ausdrückliches `turnDurationMs` schlägt weiterhin alles. Eine Quelle ist `getTurnDurationForSize` (`engine/systems/turnSystem.js`), gelesen von Lobby, Server, HUD und Replay-Kopf; die alte Spielerzahl-Regel (30/20/15 s) lebt nur noch als Altpfad für Aufzeichnungen ohne `zugzeitFassung` (Marke 2 im Kopf). Karten: sieben Formate (24:9, 9:24, 16:9, 9:16, 4:3, 3:4, 1:1) zu drei wählbaren Stufen mit gleicher Fläche je Stufe (921 600 / 3 686 400 / 8 294 400 px); die 16:9-Maße bleiben bitgleich, `krieg` bleibt nur lesbar.
- 2026-11-05: Bildbudget um 10 € erhöht (zusätzlich zu 15 USD, davon 13,76 verbraucht). Stand Schlüssel 2026-11-05: OpenRouter ≈ 0,72 USD übrig, KIE 4,58 Credits, Together nicht abfragbar.

## Anhang-Hinweis: Referenzwissen bleibt als Dokument erhalten
Spezifikationen, Betriebs- und Biom-Dokus, Balance-Daten und alles, was Tests/Skripte per Pfad lesen, bleiben bestehen (Liste am Ende, Abschnitt 5).

## 1. Betrieb, Technik, QA, Grafik, Spiel — aus Berichten Gruppe A (Aufträge, offene Punkte, Befunde, Tasks)

### 1.1 Betrieb / Hardware (nur Auftraggeber oder echte Hardware)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| Z246 (MD Abschnitt "Sicherung vor dem Abschalten", Punkt a) | Erste Probe der Abschaltsicherung auf dem Knoten: `snapshot.sh --trocken`, `snapshot-einrichten.sh --cloud`, `abnahme-knoten.sh`, `systemctl stop` + Journalzeile, `systemctl list-timers` | blockiert: Auftraggeber muss Knoten mieten und ausführen (AGENTS.md §5/§7; Agent mietet nichts). Befehlsblatt fertig | OP §5, MD, PK §A | Betrieb |
| Z246 (b) | Cloud-Ebene (Hetzner-Abbild) nie gegen echtes Hetzner getestet, nur Platzhalter-`hcloud` | blockiert: gehört zur Probe oben | MD, OP, PK | Betrieb |
| Z246 (c) | Wer den Server nach dem Abbild LÖSCHT und neu aus Abbild erstellt: bewusst nicht automatisiert (Hetzner rechnet ausgeschalteten Server weiter ab bis Löschung) | wartet auf Auftraggeber (Entscheidung/Ablauf) | MD, PK §A0/A5 | Betrieb |
| Z246 (d) | Archiv auf demselben Server überlebt dessen Löschen nicht; Kopie nach außen nicht gebaut | offen (Entscheidung, ob bauen) | MD, PK §A7 | Betrieb |
| Z246 (e) | Preis des Abbilds je GB/Monat in `docs/betrieb-INSTANZ.md` eintragen | wartet auf Auftraggeber | MD, PK §A0 | Betrieb |
| BETRIEB-LÜCKEN (`docs/betrieb-INSTANZ.md`, 15 `LÜCKE`-Felder: Name, Zweck, Instanztyp, Preis/h, Besitzer, Höchstdauer/Worst Case, `PA_MAX_MACHINE_MINUTES`, `PA_MAX_RUNTIME_MINUTES`, `PA_IDLE_MINUTES`, `PA_ACTION`, `PA_SNAPSHOT_KEEP`, Hostname/Benutzer, zweiter Alarm außerhalb des Knotens, TLS+Anmeldung) | Pflichtangaben vor jeder Miete; ohne sie kein Start. Dazu: Marker `/etc/projectarmageddon/ist-gemietet` fehlt (Kostenbremse nicht scharf) | wartet auf Auftraggeber. Status ungeprüft (Quelle AW §5 Stand 2026-10-02, PK 2026-10-29 bestätigt "LÜCKE") | PK §A0, AW §5, MD-grep | Betrieb |
| REL-1 (AW §5, Rollback) | Rollback fehlt vollständig, keine Release-Tags (`git tag -l` nur ein Archiv-Tag) | erledigt 2026-11-05: `scripts/release/paket.mjs`, `deploy.sh`, `rollback.sh`, `smoke.mjs`, Versionskennung 0.9.0 mit Bauinfo in Client-Fuß und `/healthz`, Release-Paket als CI-Artefakt bei Tags (`v*`), Spielstand-Sicherung/Wiederherstellung (`scripts/betrieb/sichern.sh`, `wiederherstellen.sh`); Beleg `docs/deploy-plan.md` und sechs Testdateien | AW §5 (aus `docs/abnahme-deploy-2026-10-01.md` §4.2) | Betrieb |
| REL-2 (AW §5, Öffentlichkeit) | Vor öffentlicher Erreichbarkeit in dieser Reihenfolge: Firewall, TLS (Caddy/nginx), Anmeldung, Ratenbegrenzung; systemd-Unit nur auf Syntax geprüft (`systemd-analyze verify`), nie angeschlossen | teilweise erledigt 2026-11-05: Anmeldung (Konten, scrypt, Token), Ratenbegrenzung je IP, TLS-Reverse-Proxy als Vorlage (`deploy/Caddyfile.beispiel`), systemd-Vorlagen gehärtet und getestet; **offen bleibt die Betreiberaktion am Knoten** (Firewall, Zertifikat, Erststart) | AW §5, MD (Netcode-Audit 2026-10-09 (c)) | Betrieb |
| Z579 / P2 | Rendering auf echter Hardware messen (`npm run perf:browser -- --frames=600`, `profiling.spec` mit `PLAYWRIGHT_CHANNEL=chrome`); Sandbox: 50-83 ms/Frame, 96 % native Rasterung, SwiftShader zählt nicht. Ergebnis in `docs/testgrenzen.md` und OP eintragen. Zielplattform ist nicht festgelegt | blockiert: echte Zielhardware nötig | OP §6, MD (Netcode-Audit P2), PK §B | Betrieb/QA |
| P3-HW (MD Netcode-Audit) | Client-Heap über 10 Runden, Initial-Load-Zeit, Allokationen im Render-Loop auf echter Hardware | blockiert: echte Hardware | MD (Browser-Abdeckung 2026-10-13) | QA |
| PERSIST-1 (MD "Bekannte Grenzen") | Persistenz ist eine einzelne JSON-Datei (`persistence.js`, keine Sperre): Wand vor einer zweiten Serverinstanz | offen (bewusst, erst bei 2. Instanz). Status ungeprüft (Stand 2026-09-26) | TA §8, MD | Betrieb/Technik |
| NET-1 (MD "Bekannte Grenzen") | Verpasste `match_over` wird nur auf PING wiederholt (bis 2 s Verzug) | offen, bewusst in Kauf genommen | TA §8 | Technik |
| RT-2 (AW §3.8 + BR "Start/Beitritt-Reihenfolge, Befund 5") | `CONTROL.START_MATCH` im Livebetrieb unerreichbar; Versprechen "Lobby nimmt wieder einen auf" gilt nur beim beitrittsgestarteten Weg. Verschiebt Oberflächenverhalten, Entscheidung nötig | wartet auf Auftraggeber. Status ungeprüft | AW §3.8, BR Warteschlange | Technik/Spiel |
| B-9a (BR Warteschlange) | Verbindungsmerkmal (Gegner getrennt) auf die Leitung: Protokolländerung (CONTROL + Client), nicht über `CONTROL.ERROR` missbrauchen | offen, braucht Protokolländerung. Status ungeprüft (B-9 selbst erledigt) | BR | Technik |
| BUILD-1 (AW §3.3/3.4, MD UX-4) | Sourcemap im `dist/` (2 MB) nicht ausliefern; WebP für Kulissen (JPG, -27 %) ; Lighthouse Performance 64/100 (FCP 2,8 s, LCP 3,9 s, 152 KiB ungenutztes JS, Code-Splitting/Preload) = eigenes Arbeitspaket | offen. Status ungeprüft | AW §3.3/3.4, MD Abschluss 2026-10-24 | Technik |

### 1.2 Grafik / Bilder (Sprites, Gelände, Look)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| SPR-6 | datacult-Figuren zu dunkel auf dunklem Gelände (Randlicht) | Status ungeprüft: OP §4 führt offen, MD Sprite-Prüfung meldet "UMGESETZT 2026-10-25" (`stil-pass.py --randlicht`) | OP §4 / MD | Grafik |
| SPR-4 | Fraktion pixel: Neon-Linie umgesetzt; Auftraggeber sprach am 2026-10-29 erneut "8bit?" an | wartet auf Auftraggeber (ob neu bewertet wird; Pixelierung wurde gebaut und verworfen) | OP §5, MD | Grafik |
| BILDLÜCKEN (MD Fahrplan §4) | 29 Figuren ohne Hocke; fünf Figuren mit zerstückelten Zellen (Ethereo inhärent); Zustands-Sheets (81 erzeugt) Rollen noch nicht klassifiziert/im Renderer angebunden | offen. Status ungeprüft (Stand 2026-10-22) | MD | Grafik |
| WAFFENANIM-1 (MD Übergabe, "Waffen mit eigener Bewegung") | 26 Animations-Sheets erzeugt, einige unsauber; Manifest-Feld `anim` + Abspielen in `waffenAnimation.js` | offen. Status ungeprüft | MD | Grafik |
| LOOK-2 (Rest) | Sättigungsdeckel für die GENERATIVE Kulisse (13 von 21 Himmeln über 0,45); Sichtfrage, ohne Vergleichsbilder nicht bauen | wartet auf Auftraggeber (Sicht) | OP §5, MD | Grafik |
| LOOK-3 (Rest) | Prüfbild mit gefüllter Lava gegen `ref-3-vulkanschmiede-hud` (Zellen nur bei Feuerfassung 2; in einer Sonde `spalten` 0) | offen (Messung/Sicht) | OP §5, MD | Grafik/QA |
| MATOPTIK-1 (`tasks/todo.md` T1-T6, `tasks/plan.md` Checkpoint C) | Materialoptik P1: Rausch-Shader VERWORFEN (2026-10-26, "unbrauchbar"); T1-T4+T6 gebaut (`gelaendeGpu.js`, `scripts/gelaende-optik.mjs`), T5 (Einbau) NICHT. Nächster Weg: gemalte Kacheln (`stoff-texturen/`) nutzen, volle Deckung statt `DECKUNG` 0,58, Versatz/Drehung/Maß je Region, Licht von oben; ERST ein Material (Eis) als Vorher/Nachher-Bild vorlegen. Checkpoint C (Kachelmuster schwächer, >=3 Materialien in 400x300, Screenshots an Auftraggeber) offen | wartet auf Auftraggeber-Freigabe nach Eis-Vorher/Nachher | tasks/todo.md, tasks/plan.md, MD Materialoptik | Grafik |
| GELAENDE-1 (MD Gelände-Look 2026-10-27) | Offen laut Text: Höhlen = Tunnelgewirr, Inseln ähnliche Umrisse, Biom-Objekte (19 vorhanden) in Landmassen setzen, Licht an Fackeln/Lava, Nebelschichten; Planet (rund) und "Unmögliches" (Umlauf) nicht im Spiel (brauchen Engine-Regeln) | offen. Status ungeprüft (Absatz im MD abgeschnitten) | MD | Grafik/Spiel |
| TERRAIN-ENTSCH (MD Fahrplan Nr. 8) | Comic-Terrainkacheln (`terrain-vorlagen/`) vs. fotorealistische Stoff-Texturen: Stilfrage | wartet auf Auftraggeber | MD Fahrplan §3 | Grafik |
| ASSETS-1 | Effekt-Sheets ringe/wirbel/funken seit 2026-11-03 eingebaut; ungenutzt bleiben Material-Texturen gras, lava-glut, lava-risse, normalmap, hecke-kontrast und das Intro-Video | offen (Rest) | MD §3 | Grafik |
| WETTER-1 (MD Wetter/Donner) | Wetter nicht in generativer Szene der Sonderbiome; Spritzer nur oberste Fläche (nicht in Höhlen); Schnee sammelt sich nicht an; Donner ohne Lautstärke nach Entfernung | offen (Feinschliff) | MD | Grafik/Audio |
| KULISSE-1 (MD Kulisse 2026-10-27) | Online-Matches bauen Kulisse weiter generativ (`setSceneryFromSeed`), gemaltes Bild online nicht angebunden | offen. Status ungeprüft | MD | Grafik |
| GRAFIKSTUFE-1 (MD Biom-SSOT, Grafikstufen) | Renderer liest `GRENZEN` (Lite/Ultra) noch nicht: Weiche für GPU-Gelände, Palettentextur (126 Stoffe, `GPU_STOFFE` 32), größere Karten | offen. Status ungeprüft | MD | Technik/Grafik |
| VIS-1 (Rest) | `visuell.spec`: CI-Runner 2x grün gemessen (kleine Stichprobe); Schriftbreiten-Umbruch der Lobby auf fremdem Rechner nur dort/CI messbar (Wartet nun auf `document.fonts.ready`). Wird die Spec rot: messen (stabil? Code? Versatz?), nie Grenzen lockern | beobachten; bei Rot messen | OP §4a, TG | QA |

### 1.3 Spiel / Design / Balance (meist Entscheidungen des Auftraggebers)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| SEIL-1 (`docs/auftraege/seil.md`) | Seil gebaut 2026-11-03 (`config.seil` 2, `engine` + `src/shared/config/seil.js`, Bedienung F / Waffenmenü „Werkzeuge“, 22 Unit-Tests + E2E). Entschieden: Stufe 5, Schwerkraft wie Figuren. Offen: Annäherungen (Einholtempo, Schwung, Reibung) nach Playtest nachstellen; Zielfenster je Stufe; nicht gebaut: Rope Knocking, sichtbarer Seilflug, Online-Vorhersage; Touch-Leiste am echten Gerät prüfen | offen (Playtest/Entscheidung des Auftraggebers) | seil.md | Spiel |
| MINEN-1 (`docs/auftraege/minen-faesser.md` §0 "Noch nicht gebaut") | Fässer als Kiste/Wurf; Auslösen durch Geschoss-Direkttreffer ohne Radius; Flugbahn der geworfenen Mine; Bild+Klang der Mine nicht geprüft (Waffenmenü zeigt Teleportplattform-Icon, Zeichnung = einfache Scheibe); Werte (Schaden 50, Radius 48, Rückstoß 35; Fass 60/64/45/36) unbalanciert | offen / wartet auf Sicht- und Klangprüfung des Auftraggebers | minen-faesser.md | Spiel/Grafik/Audio |
| MINEN-2 | 8 von 9 Akzeptanzkästchen mit Testbeleg abgehakt (2026-11-03); offen nur Sicht- und Klangprüfung durch den Auftraggeber | wartet auf Auftraggeber (Playtest) | minen-faesser.md §6 | QA |
| AERO (MD Backlog Block 2, Fahrplan Nr. 4) | Windfaktor je Waffe (0-2,5, explizite 0 = windfrei), Katalog-Fassung, Bahnvorschau mit Wind der Waffe, Windanzeige in Segmenten, Bots berücksichtigen Windfaktor; Wind immer zufällig, auch innerhalb eines Zuges (Seed-Sub-RNG, neue Marke z. B. `config.wind: 2`); Wasser setzt Windfaktor 0 (A1-A6). Im Code kein `windFactor` in `config/` gefunden | erledigt 2026-11-05 (Windfassung 2, Waffenfassung 14; Tests `wind.test.js`). Bots entfallen (keine Bots) | MD | Spiel |
| KAMERA (MD Backlog Block 4, Fahrplan Nr. 5) | C1-C6: Beben-Feinschliff + Einstellung, Knapp-vorbei-Zoom (Phase `knapp`), Zeitlupe NUR bei Schuss mit >= 250 Gesamtschaden oder >= 3 Toten (reine Darstellung), Wasser-Sturz, Kettenzähler, Menü "Kameraeffekte". Kein Zeitlupen-Modul gefunden | offen (entschieden, nicht gebaut). Status ungeprüft | MD | Spiel/Grafik |
| FIGUREN-B (MD Backlog Block 3, Fahrplan Nr. 6) | B1-B4, B6: Zustands-Sheets als Rollen anbinden, Zielen mit Kopf-/Oberkörperrotation, Angst-Reaktion (Radius 150 px, 1-1,5 s), Tod-Epilog Stufe 1 (Spruch je Fraktion, Sprechblase, Detonation, Grabstein nur Optik), Backflip-Rotation; Grabstein als Regelobjekt (B5) GESTRICHEN; Obergrenze Epilog 1,2 s überspringbar | offen (entschieden, nicht gebaut). Status ungeprüft | MD | Spiel/Grafik |
| UI-REST (MD Fahrplan Nr. 2, "UI-Design") | Endscreen/Rangliste, hohe Lobby-Karten mit Podest/Statusfarbe, Home-Bildschirm, Eckleisten mit Porträt (Spielerliste), Hochformat-HUD, Intro-Splash, alte Inline-Styles in `index.html` auf Tokens. Platzhalter (Pineapple, Battle Pass, Shop, XP) nicht einbauen; Endscreen nur mit vorhandenen Werten (keine Kills) | offen. Status ungeprüft (Stand 2026-10-22; Hochformat laut Auftraggeber 2026-10-13 bewusst nicht gebaut) | MD | Spiel/Grafik |
| BIOM-BS (MD "Biom-SSOT: Umsetzung", BS-1 ... BS-13) | Material-Katalog (126 Stoffe erledigt), Zerstörungsmatrix je Einwirkung (BS-2), Schichtenmodell (BS-3), Treffer-Pipeline (BS-4), Einsturz/Tragfähigkeit (BS-5), Objekt-/Trigger-System (BS-6), Medien Gase/Flüssigkeiten (BS-7), Biom 1-14 an SSOT angleichen (BS-8), Biom 15-20 neu: Schlackeschmiede, Kristallines Schwebearchipel, Bio-Alien-Tempelstadt, Abyssale Tiefsee, Dimensionsriss, Versteinerter Kristallwald (BS-9), Kartenformen (BS-10), Optik (BS-11), Hilfe/Doku (BS-12), Tests/Balance (BS-13); Zonen mit eigener Gravitation (Biom 10, 19), Projektil-Reflexion nur Energiewaffen, Wasser als Medium (Entscheidungen 2026-10-22). Offene Widersprüche Manifest/SSOT stehen am Ende von `docs/biome-manifest.md` | offen (große Brocken). Status ungeprüft je BS (BS-1 teilweise erledigt, Gelände-Fassung 5/6 gebaut) | MD, docs/biome-* | Spiel |
| O2-REST | Ereigniszweige: `crate_landed` online ohne Zweig (nur `bewusstStumm`) | Status ungeprüft (Stand 2026-09-27; Rest von O2 sonst nachgezogen) | TA §1 O2-Nachtrag, bgworker-todo.json O2 | Spiel/Technik |
| EREIGNIS-1 | Rest nach 2026-11-04: Seen im Planeten-Biom (Erweiterung, eigener Auftrag mit Geländefassung); Asche/Basalt (`karte.ueber`) erreichen spät beitretende Clients nur über Ereignisse; Kennzahlen (`MatchStats`) nur lokal, online ohne Ereigniszufuhr | offen (Erweiterungen, keine Fehler) | MD | Spiel |
| ERFOLGE-1 (TA §5/§8) | Erfolgs-Symbole als Bilder (derzeit ★/☆); Belohnungen (`reward` überall `null`, kein Vergabesystem); Katalogumfang 11 statt 100 | wartet auf Auftraggeber (Content). Status ungeprüft (Stand 2026-09-26) | TA | Spiel |
| LIEBLING-1 (TA §5) | Lieblingsnation im Profil braucht Charakter-/Fraktionswahl je Platz (Zeile zeigt "—") | wartet auf Auftraggeber. Status ungeprüft | TA | Spiel |
| EXKL-1 (TA §5) | Exklusive Waffe je Charakter, nur als legendärer Drop (kein Feld im Katalog) | wartet auf Auftraggeber. Status ungeprüft | TA | Spiel |
| DESIGNWERT-1 (TA §8b) | 52 von 150 Waffen ohne Designwert in der Quelldatei (`damageSource` derived/none) | wartet auf Inhaltslieferung des Auftraggebers. Status ungeprüft | TA | Spiel |
| TURRET-1 (TA §4) | Nur EINE Waffe (pa_124) mit `special: 'auto_target'`: Content-Frage, ob genug | wartet auf Auftraggeber | TA | Spiel |
| BAL-1 (TA §7/§8/§8b) | maxRange-Anzeige "Reichweite bei neutralem Profil" (Faktor 0,37; eine Zeile Anzeige); Scout-Bewertung; Vergleichszahlen für 6 neue Klasse/Archetyp-Kombinationen (`balance:classes`, `balance:sweep`); `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp (normalisieren verschiebt ~8 %); Wurfweiten-Deckel unter Wurfweite bei 465 Kombinationen (Balance-Entscheidung) | wartet auf Auftraggeber (Balance). Status ungeprüft (Stand 2026-09-26) | TA, MD | Spiel |
| MAHL-Reste (MD Netcode-Audit 2026-10-13) | Warnung vor Valhalla-Beginn, schnellere Mahlstrom-Kontraktion bei 8 Figuren/Karte 2560 px. MAHL-1 selbst ENTSCHIEDEN (Runde 8-14, groß 12-20) | Status ungeprüft, vermutlich durch MAHL-1 überholt | MD, OP §5 | Spiel |
| AUDIO-1 (MD Musik/Hymnen) | Stimmung `intensiv` ohne Auslöser; Hymnen-Einsatz bei Zugbeginn bewusst nicht gebaut | erledigt 2026-11-05 (Auslöser: Valhalla/Mahlstrom, letzte zwei Figuren, Team ≤ 25 % Leben; `src/client/musikStimmung.js`, Test `musik-stimmung.test.js`). Hymnen bei Zugbeginn bleiben bewusst nicht gebaut | MD | Audio |
| AUDIO-2 (MD Klang, Netcode) | Sicht-/Hörprüfung von Klang bleibt manuell (Projektregel 6.4); Mine/Fass-Klang ungeprüft (s. MINEN-1) | offen: Abnahme durch Auftraggeber | minen-faesser.md, TG | Audio/QA |

### 1.4 QA / Tests

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| TESTLUECKE-1 | E2E-Lücken: Mahlstrom und Online-Mine 2026-11-03 ergänzt; Klang, W/S, kleines Fenster, Hochformat, Touch, DPR2, aria-live, Kontrast waren schon abgedeckt. Offen: 200-%-Zoom, Fokusfallen in Overlays, Onboarding-E2E | offen (Rest) | BR, AW §4 | QA |
| UX-10 (AW §4) | Erstkontakt-Führung/Onboarding | wartet auf Auftraggeber (Content-/Designfrage, nicht eigenmächtig bauen) | AW §4 | Spiel/QA |
| FLOW-1 (TG Grenze 2) | Keine Messung für "Flow"/Spielspaß; Zahlen als Näherung (Zugzeit x Züge, Trefferquote, Wirkung je Schuss); Urteil liegt beim Auftraggeber | offen (strukturell) | TG | QA |
| TG-RANG (TG §3) | Rangfolge: 4K in `MAP_SIZES` (Kamera muss mitskalieren), Strukturtests statt Wertetests; Rauchtest, Delta-Snapshots, Teamgröße öffnen sind inzwischen (smoke:fast, Protokoll v9, 6 Spieler/Team) umgesetzt | 4K/Strukturtests offen. Status ungeprüft (Stand 2026-09-20) | TG | QA/Technik |
| TG-ZEIT (TG Grenze 1/4) | Unit-Laufzeit 4,7 min wegen Mess-Tests, E2E ~25-60 min seriell; Prozess-Tests brauchen erfragte Ports und Wiederholungsläufe | beobachten | TG, OP §2 | QA |
| E2E-1 (OP §2) | Vollständiger Lauf 2026-10-25: 356 grün, 1 rot (Testfehler, behoben), 1 übersprungen; 36 von 61 Specs (HUD, Kamera, Kulissen, Terrain, Ton, Erfolge, Bedienung) in dieser Sitzung nicht gelaufen | Status ungeprüft für diese Bereiche; vor Abgabe Volllauf wiederholen | OP §2 | QA |
| MATOPTIK-CHK / MINEN-CHK | Siehe MATOPTIK-1 und MINEN-2 | s. dort | tasks/, minen-faesser.md | QA |

Zahl offener Punkte (Zeilen mit ID): siehe Zusammenfassung unten.


## 2. Technik, Server, UI, Engine, Betrieb — aus Audits und Abnahmen (Gruppe B)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| DEP-1 | Kein dokumentiertes Rollback-Verfahren: keine Release-Tags/Versionskennung zum dist-Build, kein Aufbewahren des letzten guten dist (`emptyOutDir`), keine Rückspiel-Schritte, kein Backup/Restore für `PA_STATE_PATH` | erledigt 2026-11-05: Rollback-Verfahren dokumentiert und gebaut (`docs/deploy-plan.md`, `scripts/release/rollback.sh` mit Rückfall auf die vorige `current`-Ablage, Sicherung vor jedem Deploy), Versionskennung 0.9.0, Release-Tags `v*` lösen das Paket aus | abnahme-deploy-2026-10-01.md §4.2; release-readiness-audit-2026-10-01.md | Betrieb |
| DEP-2 | Kein Dockerfile/Compose-Manifest (Container-Rollback per Image-Tag nicht möglich) | erledigt 2026-11-05: `Dockerfile`, `deploy/compose.yaml`, `.dockerignore` (Port nur lokal gebunden, Volume für den Spielstand), Test `container-dateien.test.js` | abnahme-deploy §4.2 Pkt 5 | Betrieb |
| DEP-3 | Absicherung vor öffentlichem Betrieb in dieser Reihenfolge: Firewall (Spielport nur Loopback), TLS-Reverse-Proxy (Caddy/nginx, `/ws` durchreichen), Anmeldung/Konten, Rate-Limit je IP | offen/blockiert (Betreiberaktion; Projekt bisher "privat/lokal") | abnahme-deploy §5.2 | Betrieb |
| DEP-4 | systemd-Units + Idle-Timer auf dem Knoten installieren, Marker `/etc/projectarmageddon/ist-gemietet` setzen, `PA_MAX_MACHINE_MINUTES` setzen (heute AUS), `PA_STATE_PATH` persistent; Units nur auf Syntax, nicht auf Anschluss geprüft | blockiert (braucht echten Knoten); entspricht Z246 in offene-punkte.md | abnahme-deploy §5.2/§6 | Betrieb |
| DEP-5 | Betreiberentscheidungen: Instanzanbieter/Modell/Region/Preis, Kostenrahmen + zweiter Alarm außerhalb des Knotens, `PA_IDLE_MINUTES`/`PA_GRACE_MINUTES`/`PA_MAX_RUNTIME_MINUTES` bestätigen, `PA_ACTION` stop vs poweroff (+`PA_POWEROFF_CONFIRM=yes`) | blockiert (nur Betreiber; AGENTS.md §5: sonst wird nichts gemietet) | abnahme-deploy §6 | Betrieb |
| DEP-6 | Nicht lokal messbar: DNS/Zertifikat/TLS-Abnahme, echte Mehrspieler-Session mit Menschen (8 Figuren übersichtlich?), Lastgrenze "viele Lobbys parallel" (68-Matches-Zahl ist Hochrechnung) | blockiert (echte Hardware/Menschen) | abnahme-deploy §6; abnahme-bugs §8; release-readiness-audit | Betrieb |
| SRV-5 | `POST /api/lobby/create` ohne Rate-Limit/Auth (Wachstum begrenzt? Session-Cleanup `#sessions.delete` existiert inzwischen) | ungeprüft (nur Rate-Limit/Auth fraglich) | audit-2026-10-09/00-claude-rest §3.2; audit-arch-datenfluss B5 | Betrieb |
| SRV-8 | Spielkommandos bei nicht laufender Simulation: mit Audit-Befund 7 (Commit 3e194ad) behoben | erledigt, Zeile kann bei nächster Pflege weg | — | Technik |
| SRV-10 | Protokoll-Restmängel: `isActiveTurn`-Byte (1 B/Spieler) und Projektil-`entityId` werden gesendet, nie gelesen; `crateType` im Snapshot, Renderer färbt nur nach rarity; "Delta"-Snapshot spart 0 B | ungeprüft (crateType wird inzwischen im Renderer per switch gelesen -> dieser Teil erledigt) | audit-arch-datenfluss B1/B3/B4; optimierung-bericht §8.2; 00-claude-rest §3.2 | Technik |
| SRV-11 | `decodeSnapshot` bei abgeschnittenem Puffer: Kommentar protocol.js verspricht Prüfung, die es nicht gibt (Spielerabschnitt `return null`, Kisten/Geschütze brechen still ab, ungezählt); `v`-Feld eingehender Steuernachrichten und `WELCOME.protocol` werden nicht gegen `PROTOCOL_VERSION` verglichen | ungeprüft (snapshot_rejected für Version erledigt, A-14; Rest nicht nachgesehen) | audit-arch-datenfluss A7/B7 | Technik |
| ENG-1 | Wurf/Abwurf und Wind teilen denselben `MATCH_BASE`-Zufallsstrom (fachlich unabhängige Systeme verkoppelt); "deterministischer Wurf statt Zufallsstrom bewusst offen" | erledigt 2026-11-05 (Windfassung 2: eigener Strom `KISTENWURF`, Fassung 1 bitgleich; Test `wind.test.js`) | hunter-physics P4; o9-impl.md Offene Punkte | Spiel |
| ENG-6 | Weitere Mikro-Optimierungen laut Messung: `LootSystem.update` je Tick (12 %), ECS-Query-Allokation je System (9 %); Bounce der stehenden Figur als Ursache der `landed`-Flut ("groß/hoch, verboten ohne Auftrag: bricht Replays") | ungeprüft (niedrige Wirkung; Bounce nur mit Auftrag) | optimierung-bericht §7 #3-#6 | Technik |
| ENG-7 | `registerSystem` sortiert bei jeder Registrierung neu (reine Kosmetik, 9 Systeme) | offen (nicht behoben, bewusst) | audit-code.md | Technik |
| ENG-12 | `src/client/renderer.js` ist in `node --test` nicht ladbar (Vite-`import.meta.glob`); braucht Vitest-Läufer oder Logik-Auszug in eigene Module | offen/Architekturvorschlag | audit-selbst.md Befund 3 | QA |
| GP-1 | Waffenbalance-Entscheidungen (alle "braucht Entscheidung Auftraggeber", nicht umgesetzt): (1) `homing*5` im powerScore (Superschaf/Phönixschlag fälschlich legendary; Versionsmarke für Replays nötig), (2) Waffen ohne Schaden = common (Nutzwert fehlt), (3) Zünderwaffen unter 0,5 Verhältnis (Messverfahren klären, dann Schaden/Radius), (4) Kategorien nach Wirkung ordnen (utility/tech/elemental), (5) Kaktusbombe Gift-Art, (6) Handgranate Radius 0 vs Art, (7) Allsehendes Auge ohne Wirkung (`isRevealed` hat keinen Leser außerhalb der Definition), (8) Klassen-/Archetypnamen deutsch beschriften | offen/Entscheidung | audit-waffen-2026-10-28.md E3/E4/F2 | Spiel |
| GP-2 | Weitere ausdrücklich nicht umgesetzte Waffenpunkte: Strahl vs Projektil für Luftangriff/Meteorregen/Höllenkanone, Spruchrolle delivery, Astralkugel/Gedankensturm Abklingzeit 3->2, Portale (zusammenführen/unterscheiden), Giftwolke/Tentakelgift/Flammenwerfer Deckel, Energiefaust/Flammenklinge Rückstoß-Strahl, Bohrkopfrakete->DRILL, Handgranate bounces 2->0, Zünder im Motor +15 %, Himmels-/Flankenschlag-Doppeltreffer, Schadenswerte (Flammenwerfer, Plasmagewehr) | offen/Entscheidung | audit-waffen-2026-10-28.md F2 | Spiel |
| GP-3 | Waffen-Dubletten: Staffelung in Fassung 10/11 umgesetzt; offen bleibt: Nahkämpfer mit identischen Flugwerten, aber schwächere Schwesterwaffe (Piratenhaken/Hakenklinge, Mehrzweckmesser/Kampfmesser, Rapier/Taschenmesser), Eisschlag friert in Schadensfassung 2 nicht ein, Ananasbombe vs Splittergranate; Anzeige der Fassung-10-Werte im Waffenmenü | ungeprüft (abgleich vom 10-29 ist durch Fassung 10/11 teils überholt) | abgleich-dubletten-animationen-2026-10-29.md §A; audit-waffen Fassung 10 | Spiel |
| GP-4 | Balance-„37" bei 200 HP/854 px: die Zahl stammt aus einer Messung, bei der 98 von 112 Waffen die Distanz nicht erreichen (kein Maß für „gute Treffer"). Neu gemessen mit `scripts/waffen-balance.mjs` (gezielt, beste Entfernung): Median Schüsse bis Sieg vorher Nahkampf 5 / Fernkampf 4 / Okkultist 3, Kategorien 2–6,5. Umgesetzt 2026-11-05 als **Waffenfassung 15 (`WAFFEN_TEMPO`, Standard)**: Nahkampf ×1,5, Fernkampf ×2,0, Lenkwaffen ×1,3, Deckel 79 (kein neuer Ein-Treffer-Kill); nachher 4 / 3 / 2 und Kategorien 2–4. Fassungen 1–14 bitgleich, Katalog unverändert. | erledigt 2026-11-05 (Beleg `docs/balance-tempo-2026-11-05.md` mit Vorher/Nachher-JSON in `docs/balance-auslese/`; Tests `waffen-fassung` Fassung 14 Prüfsumme, Fassung 15 Zielband, Ein-Treffer-Grenze) | abnahme-balance-2026-10-01.md §6; audit-userflow B1 | Spiel |
| GP-5 | Scout-Anhebung (Klassenfassung 2): Bot-Messung 2026-10-29 gemacht (`npm run balance:classes`: Spannweite 3,80–4,36, Faktor 1,15, Scout 3,87; `balance:bot` 16/16 Partien vor Valhalla entschieden, Median 2,7 min); offen bleibt nur die echte Spielmessung | überholt 2026-11-05: Klassenfassung 3 ersetzt scout/heavy/artillery; Fassung 2 bleibt nur für Altreplays lesbar | audit-klassen-2026-10-28.md „Offen“ | Spiel |
| GP-6 | Klassen/Archetyp-Faktoren (Lebensspanne 0,56-1,56) sind im Menü unsichtbar („nur Namen ohne Zahlen“) | erledigt 2026-11-05 (Klassenfassung 3: Menü nennt Leben und Schaden je Klasse; Archetyp-Auswahl entfällt) | audit-userflow.md Fazit/B6 | Spiel |
| KLASSEN-3 | Klassen-Umbau auf `nahkampf`/`fernkampf`/`okkultist` (Klassenfassung 3, Standard): drei Klassen ohne Archetypen, `CLASS_IDS` als Snapshot-Vertrag, `charakterFuer(fraktion, klasse, platz)` deterministisch, Startwaffen je Klasse, Fassungen 1/2 bitgleich (`GOLD_F1`), Fassung 3 `GOLD_F3` = `fca0dcaf`; Balance `npm run balance:classes` 4,00/4,00/4,00 (vorher 3,80–4,36) | erledigt 2026-11-05 (Beleg: `docs/anforderungen-2026-11-05.md` §6, Tests `klassen-fassung`, `class-profile`, `darstellung`, `loadout-choice`, `counterplay`, `onboarding-hilfe`, `mobility`, `class-loadout`) | docs/anforderungen-2026-11-05.md §6 | Spiel |
| GP-7 | siehe N-03 (erledigt 2026-11-03) | erledigt | — | Grafik |
| GP-8 | Waffen-Animationen: Rauchring- und Flammen-Sheet sind im Repo und eingebaut (`effektSheets.js`), Prüfmechanismus `tests/animation-pruefung.test.js` (alle 150 Waffenposen, Sheets, 81 Figuren); offen: Korrekturen je Waffen-ID nur für einen Teil der Dubletten (`KORREKTUREN` in `waffenAnimation.js`), 19 isometrische Biom-Objekt-Sheets bewusst nicht eingebaut, keine automatische Prüfung "sieht gut aus" | offen (Rest) | abgleich-dubletten-animationen-2026-10-29.md §C2-C4 | Grafik |
| UI-2 | HUD-Messungen nur gerechnet, nicht am Bildschirm gemessen: sichtbare Protokollzeilen (4-5, inzwischen laut E2E >=8), Kader-Überlauf bei 30-40 Figuren; Zugzeit 20 s (4 Spieler) und weitere Presets ungeprüft | ungeprüft (E2E grosse-teams.spec deckt Teile ab laut befundregister) | audit-ui-spielersicht.md V1/V2/V5 | QA |
| UI-3 | `confirm`-Dialog (Match verlassen) blockiert Frame-Loop/friert Zugzeit-Anzeige; Keymap-Position als Layout nicht gemessen | erledigt 2026-11-05 (`src/client/bestaetigung.js`: Rückfrage als eigenes Overlay, `abortMatch` liefert ein Promise; Keymap-Position bleibt offen gemessen) | audit-ui-ablauf.md Verdacht 1-2 | QA |
| UI-4 | Revanche startet kein neues Match (öffnet nur Menü mit Seed) bzw. Zustand `match/mode` nach Revanche nicht geleert (R fragt dann "Match verlassen?"); Entscheidung: umbenennen oder echter Neustart | erledigt 2026-11-05 (`src/client/revanche.js`: echter Neustart aus gemerktem Seed, räumt vorher auf; online entscheidet der Server) | abnahme-ux-2026-10-01.md §5 #5/#6 | Spiel |
| UI-6 | Online-Statistik: `MatchStats` wird nur lokal gefüttert; Online-Trefferquote/Bericht ungeprüft | ungeprüft | stille-fehler-fixes.md "Was ich NICHT geprüft habe" | Technik |
| UI-7 | Online `crate_landed`: nur lokaler Zweig (bewusst stumm, Begründung im Wächter ist umzuschreiben); Empfehlung: Online-Zweig "Abgeworfene Waffe gelandet" | ungeprüft (ereignisse.js:955 nur `lokal:`) | hunter-doku-nachzug.md §4 | Technik |
| QA-1 | E2E-Lücken laut UX-Abnahme (Stand 10-01, teils inzwischen durch touch-bedienung/hud-hochformat/a11y-Specs gedeckt): 200 %-Zoom-Test, Fokusfallen in Overlays, Screenreader-Zugänglichkeit des Glücksrads, aria-Meldung für Ladefortschritt, aria-live-Doppelansagen (Rad + Log), Erstkontakt-/Onboarding-E2E, Kontrastmessung als Test | ungeprüft | abnahme-ux-2026-10-01.md §1b L5-L9, §4 Pkt 1-6 | QA |
| QA-2 | Nie gehört/gesehen: Klang online/lokal nur über Mischer-Zähler belegt (kein Hörtest), Ladebalken nicht bildlich geprüft, Wasser-Flackern/Effekt-Alterung auf 144 Hz wurden durch Fixes ersetzt, aber nicht visuell bestätigt, Gegner hört Schuss online nicht per zweitem Browser gemessen | offen (manuelle Prüfung nötig) | spielgefuehl-fixes.md "Was ich NICHT geprüft habe" 2-4; audit-2026-10-09/00-claude-rest §6 | QA |
| QA-3 | Black-Box-Messlauf auf Produktionsbau (`npm run build` + preview, nicht Dev-Server mit HMR) für "30 s Wartezeit beim Matchstart" und Anzeige-vs-Simulation-Abweichungen; Beobachtungen des Black-Box-Agenten blieben unbelegt | offen | audit-blackbox.md | QA |
| QA-4 | Gegenprüfung durch fremde Modelle ausweiten: Engine/Physik/Terrain (Bericht des abgebrochenen Laufs verloren), Prompt-Varianten, weitere Anbieter; Fremdbefunde nur nach Verifikation übernehmen. Engine-Subagent-Spur (ballistics, shooting, characterSystem Fallphysik, prng, network.js Latenz, persistence) unbearbeitet | offen | audit-2026-10-09/02-gegenpruefung.md §6; 00-claude-rest §4/§6 | QA |
| QA-5 | Frame-Allokationen im Renderer (createImageData Wasser, Gradients je Projektil/Rauch/Blitz, Regex `parseCss` je Umgebungselement/Frame, `.find` je Entität, `currentState()` Spread, HUD ohne Vorher-Vergleich, kein globaler Partikeldeckel/Pooling), Accumulator-Wachstum bei 140-250-ms-Frames | ungeprüft (nur Lesebefund des abgebrochenen Subagenten; nicht gemessen) | audit-2026-10-09/00-claude-rest §2.3-2.5 | Technik |
| QA-6 | Rendering auf CPU-Hardware: ~50 ms/Frame (Intel HD 3000: 50,1 ms, Faktor 3 über 16,7-ms-Budget), 96 % native Rasterarbeit; Terrain-Backen CPU 2,5-2,7 s; echter Messlauf auf Zielhardware fehlt (entspricht Z579/P2 in offene-punkte.md) | blockiert (echte Hardware) | optimierung-bericht §7 #8; abnahme-optimierung §8 | Betrieb |
| BLD-1 | Auslieferung: 80 Kulissen-JPG (11,3 MB) noch nicht als WebP (-27 %, ca. -3 MB); Sprites/Biom-Objekte sind bereits WebP (501 .webp im Baum); Debug-API + Profil lazy splitten (~2,6 kB gzip); Bundle-Größen-Gate fehlt | erledigt 2026-11-05: 80 Kulissen als WebP ausgeliefert (`scripts/kulissen-webp.py`, `src/client/kulissenUrls.js`), Bundle-Größen-Gate `check:bundle` in `npm run checks` (22 Gates), Beleg `docs/ladezeit.md`; offen bleibt nur Code-Splitting der Engine (s. LADEZEIT) | abnahme-optimierung-2026-10-01 §6 #1/#6/#7 | Technik |
| TER-2 | `pruefeSpielbarkeit`-Regel "zu nadelig" war toter Code (`k.width` fehlt -> NaN) | ungeprüft (terrainGen3 wurde seitdem umgebaut: Notbremse 0,25 erwähnt) | hunter-terrain.md Befund F | Technik |
| TER-3 | Kleinere Doku-/Ordnungspunkte: Materialverteilung 38,5 % Sonderboden vs Kommentar "FUNDSTÜCK" (I), `SYSTEM_PRIORITIES.TERRAIN/WEAPON/EFFECTS` ohne registriertes System (J, init.js:20-22 bestätigt noch vorhanden), `collisionMask.js`-Kopf "bis 32xN" (K), match.js-Kommentar "teams 2 bis 4" vs Lobby 2-8 (L); Körpermaße in characterSystem sind inzwischen aus config/player importiert (H erledigt) | offen/teils ungeprüft (J bestätigt offen) | hunter-terrain.md Befund I-L | Technik |


## 3. Grafik, Waffen, Terrain, Spielgefühl, Strategie — aus Audits 2026-10-30 und Recherchen (Gruppe C)

### Grafik: Sprites

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-01 | Figurblätter: alle 81 Figuren haben seit 2026-11-03 8/8 Emotionszellen (nachgeprüft mit neuem `emotion-pruefen.py`-Lauf); Quanten-Ritter neu in Grün, Drone-Theta per 3-D als schwebende Drohne, Schlange blinzelt (Bildkosten gesamt 13,63 USD von 15). Namensdublette gelöst (datacult heißt „Nullpointer-Kultist“). Ritter-Jubel neu mit erhobenen Armen (Bildkosten gesamt etwa 13,76 USD von 15) | erledigt 2026-11-03 | sprite-pruefung.json | Grafik |
| N-02 | Stillbilder nachziehen: `charactersheets/datacult/22_ethereo.png` (Vorderansicht ist andere Figur, Note 3); `machina/11_heavy-battery-moerser-bot` alle vier Stillbilder (Platzhalter-Quadrat am Rohr, Note 2); 4 Vorlagen `characters-side` weichen von HD/characters ab (undead/12, 20, 21, 22; Sheets folgen der Vorlage): Entscheidung welche Fassung gilt | offen | docs/audits/sprites-2026-10-30.md | Grafik |
| N-03 | Emotionen Nicht-Humanoide: erledigt 2026-11-03 — 3-D-Verfahren (TRELLIS, `emotion-3d.py`) für shinobi/11, machina/11, machina/12 (je 8/8, Farben ans Seitenbild angeglichen); beasts/02 Zellen 2 und 4 aus der Stehpose abgeleitet. Im Schnitt 6,3 von 8, 17 Figuren komplett, keine leer | erledigt, Zeile kann bei nächster Pflege weg | 2026-11-03 | Grafik |
| N-04 | Sprite-Prüfung ohne Abdeckung: Noten sind Sichtungsurteile (Walk-Zyklen aus Standbildern, Stillbilder mit 200 px); nicht geprüft: Stillbilder in Spielszenen, Manifest-Rollen (`gehen/rollen/gueltig`) gegen Blätter, Aktion-/Zustandsblätter nicht automatisch auf Grundlinie | offen | docs/audits/sprites-2026-10-30.md | QA |

### Grafik/Spiel: Waffenoptik (Prio 1-8 der Quelle)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-09 | Geschossfamilien: eigener Schweif je Familie (Rauch, Flamme, Frost, Tropfen, Funkeln, Leuchtspur, Staub) seit 2026-11-03; offen: eigene 64-px-Geschosszellen je Familie (Atlas/Generator), blauer Orb bei pa_148 | offen (Rest) | Waffenoptik | Grafik |
| N-10 | Eigene Schussbewegungen je Familie (Nahkampf stoßen/schneiden/schlagen usw.) | offen | Waffenoptik | Grafik |
| N-12 | 26 Waffen-Anim-Sheets (`weapon-sprites/anim/*.webp`) sind nirgends eingebunden und überwiegend unbrauchbar (falsches Motiv, Standbild, springende Frames; höchstens pa_038, pa_135, pa_142 denkbar). Entscheidung: nicht einbauen, nur pa_038/pa_135 prüfen, Rest neu erzeugen (Zellbild als Bildbedingung) oder prozedural lassen | offen (Prio 7, Aufwand L, Risiko hoch) | docs/audits/waffen-optik-2026-10-30.md | Grafik |
| N-14 | Sichtprüfung der Waffenoptik im laufenden Spiel steht aus (`node scripts/waffen-screenshots.mjs`, `node scripts/waffen-pruefbogen.mjs`, nicht ausgeführt); Projektdateien `PA Sprite Sheets/*`, `IMG_9329/9330/9333/9335` nicht gelesen, Verwertbarkeit ungeprüft | offen | docs/audits/waffen-optik-2026-10-30.md | QA |
| N-15 | Waffen-Animation Rest aus ANIMATION_DESIGN: Trails für langsame Geschosse, Lade-/Überhitzungsanimationen, Minen-Platzierung, Schild-Visuals, Laser-Dauerstrahl, Kill-Feed-/Waffenwahl-/Low-Ammo-Animationen im HUD, sanfte Turret-Rotation, Menü-Übergänge, Kamera-Easing, kritische-Treffer-Anzeige, Screenshake nach Kaliber | Vorschlag, Status ungeprüft (Doc ist ein Wunschkatalog, viele Teile evtl. inzwischen vorhanden: gefuehl.js, kameraRegie.js) | ANIMATION_DESIGN.md | Grafik |

### Spiel: Waffen-Balance und Dubletten

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-16 | Waffen-Dubletten entscheiden (nur Spielwerte, wäre Waffenfassung 10): (1) bewusst lassen und durch Zahlen unterscheiden, (2) zusammenführen, (3) nur Fehlzuordnungen in Texten beheben. Vorschlag der Quelle: Variante 1 für Verstärkung x1,5 (4 Waffen), Zufall (4), Versetzen 60 px (4); Variante 3 für Texte. Konkret: flight (Raketenrucksack/Düsenrucksack/Gleitschirm, Gleitschirm `effectMagnitude` ungelesen), Dimensionsriss schlechter als Sprung (`effectMagnitude` ungelesen), Eisschlag friert nicht ein, Eisschild nichts Eisiges, Aufdecken (`isRevealed`) ohne Leser, Ananasbombe als Strahl vs Splittergranate | Vorschlag, Entscheidung Auftraggeber offen | docs/abgleich-dubletten-animationen-2026-10-29.md | Spiel |
| N-17 | Messleiter des Balance-Reports ist grob (6 Stufen 40-650 px, 1 Schuss/4 Winkel); Waffen mit Wirkband zwischen Stufen oder jenseits 854 px könnten weiter als wirkungslos gelten; Werkzeugfehler "43 Waffen ohne Wirkung" ist entschärft (alle 43 wirken), nicht ausgerottet | offen (kleiner Rest), Status ungeprüft | docs/balance-messgrenze.md, docs/10-balance-tests.md | QA |
| N-18 | 36 selbstwirksame Waffen (`special`/moveset): dokumentieren, was sie bewirken; 52 Waffen ohne Design-`damage` (Generator-Ersatzwert, Balance automatisch erzeugt); "1 von 150 Waffen wirkt nicht" (Stand skalierung/ki-im-betrieb, Messung 'balance:sweep') | offen, Status ungeprüft | docs/10-balance-tests.md, docs/skalierung.md, docs/ki-im-betrieb.md | Spiel |
| N-20 | 10 neue Waffen vorgeschlagen (Plasma Cannon, Cryo Cannon, Solar Flare, Graviton Anchor, Neural Disruptor, Acid Sprayer, Biomass Spitter, Quantum Gauntlet, Arc Blade, Void Blade) mit neuen Mechaniken (Piercing 3, Gravity Wells, EMP-Stun, Lightning Chain, Void Corruption, Elementar-Resistenz); Katalog-Stichprobe: nicht vorhanden, Katalog hat 150 | Vorschlag, vermutlich überholt, Status ungeprüft, nie freigegeben | project_armageddon_weapons_design_v2.md | Spiel |
| N-21 | Scout hat zwar Beweglichkeit (Sprung 116,9 px), aber keinen Netto-Vorteil (verliert auf drei Achsen), `starkGegen` für Scout bleibt `null`; Klassen-Balance insgesamt als offen markiert; inerte Dimensionen (`drag`, `mass`) ohne Wirkung | offen (Balance-Entscheidung) | docs/entwurf-onboarding-sidegrades-counterplay.md | Spiel |

### Spiel/Produkt: Strategie und Features

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-22 | Progression: keine Waffen-Upgrades/Ränge/Freischaltpfad (größter Abstand zu ShellShock Live); Vorschlag Upgrade-Pfad je Waffe plus Rangliste aus Profil-Kennzahlen; höchster Hebel laut Vergleich | Vorschlag | docs/vergleich-alternativspiele-2026-10-19/vergleich.md | Spiel |
| N-23 | Solo-/Trainings-Modus mit klar gekennzeichneter Übungs-KI (keine Bot-Teams online); Rechenkern existiert (`#simulateTurretPath`, `shotPrediction.js`), offen: Stärke/Streuung des Bots (Gestaltung). Entscheidung "Sollen Bots kommen?" steht aus. Recherche-Empfehlungen (Gauss-Streuung + 3 % Aussetzer, Softmax-Zielwahl, Denkverzögerung 1-2 s, Fähigkeits-Gating, Persönlichkeit als Fehler-Signatur, Waffen-Registry mit Flags) wären die Grundlage. Hinweis: Projektstand "keine Bot-KI, Server-Bot entfernt" | Vorschlag, Entscheidung Auftraggeber offen | docs/vergleich-alternativspiele-2026-10-19/vergleich.md, docs/ki-im-betrieb.md, docs/recherche/npc-ki.md | Spiel |
| N-24 | Partiedaten speichern? Kennzahlen (`stats.js`, `achievements.js`) leben nur im Speicher und gehen beim Neustart verloren; ohne gespeicherte Daten keine Auswertung; Entscheidung welche Daten, wer sieht sie, wie lange (wie bei Konten `identity.js`) | **erledigt 2026-11-05 (Paket C):** Konten + historische Rangliste in SQLite (`node:sqlite`) bzw. JSON-Rückfall; Elo, Siege, Partien, Kills, Tode, Schaden, Schüsse und Bestwerte; nur Online-Partien mit ≥ 2 angemeldeten Menschen; Konto löschbar. Entscheidungen und Grenzen: `docs/konto-und-bestenliste.md` | docs/konto-und-bestenliste.md, docs/anforderungen-2026-11-05.md §1.10/1.11 | Betrieb |
| N-25 | Fahrzeuge/betretbare Gebäude (Worms W.M.D), Level-Editor, kurze Fraktions-Kampagne mit 9 Fraktionen/81 Charakteren | Vorschlag, nachrangig/optional | docs/vergleich-alternativspiele-2026-10-19/vergleich.md | Spiel |
| N-26 | Mehr NPCs neben Günther/Cookie (Skalierung: "mehr NPCs fehlen"); Verhalten ist Inhalt, nicht Technik | Vorschlag, Status ungeprüft | docs/skalierung.md, docs/recherche/npc-ki.md | Spiel |
| N-27 | Tiere-Balance: Messwerkzeug `npm run balance:tiere` vorhanden, Fassung 3 gemessen (0 Tiertode in 360 Partien); offen nur Nachmessung nach künftigen Änderungen, nichts als Todo benannt | Status ungeprüft (kein offener Punkt in Quelle) | docs/tiere-balance.md | QA |
| N-51 | Günther/Cookie (Paket D): 30 benannte Perks (Günther-Fassung 4, `config/guentherPerks.js`) und 30 benannte Mali (Cookie-Fassung 4, `config/cookieMali.js`) wirken im Motor, stehen im HUD-Protokoll und tragen die Marke im Replay-Kopf. Fassungen 1–3 bitgleich. Offen: Nachmessung der Tier-Balance mit Fassung 4 (`npm run balance:tiere`) | erledigt (Code+Tests), Balance-Nachmessung offen | docs/anforderungen-2026-11-05.md §§1.6–1.7, 3, 5; docs/tiere-balance.md | Spiel |

### Spiel/Grafik/Audio: Terrain, Biome, Spielgefühl, Klang (Audit 2026-10-30)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-30 | Material-Varianten nur Client (Variantensystem): je Stoff 1..k Textur-Alternativen plus Farbverschiebung/Maßstab/Spiegelung, Wahl aus festem Hash (Seed, Stoff-Id, Zellblock), kein Eintrag in Maske/Hash; Test gleicher Seed = gleiche Wahl (Maßnahme 3). Vorher Definition von "567 Varianten/Ausstand" vom Auftraggeber klären: Zahl existiert nirgends im Repo, einzig realistische Lesart = kombinatorische Looks aus Biom x Stoffrolle x Achsen | offen, Definition Auftraggeber nötig | docs/audits/terrain-spielgefuehl-2026-10-30.md | Grafik |
| N-31 | Übergänge statt harter Kanten: Mischzone Deck/Kern, Lippe/Überhang an Oberkante (Gras, Schnee, Sand), unregelmäßige Kontur (Konturlinien an Materialgrenzen); größter Eindruckshebel für "organischer"; in MASTERDOTO als offen geführt (Maßnahme 4). Spec P1 verlangt Dark-Contour an Materialgrenzen | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md | Grafik |
| N-32 | Texturstil vereinheitlichen: 15 alte Foto-Texturen durch Comic-Fassung im Stil der 85 neuen ersetzen (Namen behalten), Pilz-Textur unscharf neu (Maßnahme 5) | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Grafik |
| N-33 | Biome 15 bis 20 spielbar machen: Definitionen in `biome-neu.js`/Themen, Rezepte, `backdrops-neu` einbinden (Bilder und Objekt-Sheets vorhanden, keine Spieldefinition, 0 Code-Verweise); Menü/Seed-Wahrscheinlichkeit Entscheidung Auftraggeber; neue Fassung `GELAENDE_*` mit Marke zwingend (Maßnahme 6, Aufwand L). Spiel hat 14 wählbare Sonderbiome von 20 SSOT-Biomen | offen, Freigabe nötig | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/biome-manifest.md | Spiel |
| N-34 | Ungenutzte Bestände klären: 73 von 126 Stoffen in keinem Rezept, `biom-objekte` (isometrisch, passt nicht zur Seitenansicht, 1/5 Platzhalter), `terrain-vorlagen`, 3 ungenutzte Texturen (`hecke`, `kies`, `asche`); verdrahten oder als Referenz kennzeichnen, keine Löschung ohne Freigabe (Maßnahme 7). `GPU_STOFFE = min(126, 32)`: GPU-Pfad hat nur 32 Stofffarben | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Technik/Grafik |
| N-35 | Kulissen: Stil je Biom vereinheitlichen (Noir, Foto, Cartoon gemischt), `dunkel`-Bänder aufhellen, Kammformen der prozeduralen Kulisse biomgerecht (keine Palmen in Eiswüste); `backdrops-neu` (48 Dateien) nicht eingebunden (Maßnahme 8). Ideen aus background_elements_design: `fog_sheets`, `light_pillars`, Parallax-Gebirge (`distant_range`), Wasser `foam_lines`/`oil_slick`, dynamische Himmelsfarbe (aurora/plasma_storm/toxic_noon) | offen / Vorschlag (background_elements: nicht umgesetzt, per grep) | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/background_elements_design.md | Grafik |
| N-37 | Regelkonflikt `AGENTS.md` §2 (Versionsmarke bei Regeländerung) gegen MASTERDOTO "keine Marken mehr nötig" klären; Vorschlag der Quelle: Marke trotzdem setzen bis `AGENTS.md` ausdrücklich geändert wird | offen, Entscheidung Auftraggeber | docs/audits/terrain-spielgefuehl-2026-10-30.md | Betrieb |
| G1 | Spielgefühl: erst messen (Eingabe-zu-Bild lokal und online mit Latenzsimulation, Totzeit je Zug im Probematch); keine Messung vorhanden | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | QA |
| G2 | Totzeit senken: Schuss-Wiederholung (2 s) überspringbar, Zugpause nur zeigen wenn etwas zu sehen ist; berührt Zugablauf, Marke `ZUGREGELN_*` nötig | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Spiel |
| G3 | Treffer-Rückmeldung verstärken (nur Client): Hitstop wenige Frames (nicht Simulation), Kameraschub in Einschlagrichtung, größere Schadenszahlen bei großem Anteil; deckt sich mit Recherche sound-und-juice Phase 2 (Hit-Stop 25-100 ms nur mit Sound+Partikeln, Screen-Shake mit Abklingen, Vollbild-Blitz, Anticipation, Kamera-Trägheit; `gefuehl.js` kennt Hitstop teils) | Vorschlag, Status ungeprüft | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/recherche/sound-und-juice.md | Spiel |
| G4 | Ziel- und Ladeanzeige auf Lesbarkeit prüfen; Tastaturwege für Winkel/Kraft in Feinschritten | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Spiel |
| G5 | Sicht-Fokus nach dem Schuss ohne Wartezeit (Kamera Geschoss, Einschlag, nächste Figur), Feinabstimmung messen | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Spiel |
| K1 | Einschlagklang nach Materialfamilie (Sand/Schnee dumpf, Eis/Glas/Kristall klirrend, Holz splittrig, Schlamm nass, Beton hart) über Tabelle Stoff zu Klangfamilie; heute 126 Stoffe auf 4 Materialklänge | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Audio |
| K2 | Biom-Ambiente als leise Schleifen (Wind, Lavablubbern, Tropfen, Insekten, Unterwasserdruck) auf Bus `umgebung`; heute keine biomabhängige Klangkulisse | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Audio |
| K3 | Musik je Stimmung/Biom: weitere Stücke/Layer, Manifest-Feld `biom`; heute 3 Stücke + 9 Fraktionshymnen (nur im Fraktionsmenü); Rechte beim Auftraggeber (`CREDITS.md`) | Vorschlag | docs/audits/terrain-spielgefuehl-2026-10-30.md | Audio |
| K4 | Hörabnahme als fester Schritt (je Waffenkategorie, Materialfamilie, Biom-Ambiente, mit Notizfeld); niemand hat die Klänge gehört, Spektren/Pegel sagen nichts über Qualität. Offen: wer nimmt Hör- und Spielerprobe ab | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Audio/QA |
| N-38 | Biom-Manifest offen: Fluide/Schichten sind für Planet freigegeben; Rest der Entscheidungen (Namen, Magieintensität +50 % für Biome 2 und 7 als Biom-Modifikator auf `occultist`/Schadensgruppe `magie`, Abgründe vs Fluide) sind entschieden, aber Umsetzung der Magie-Modifikatoren in Code nicht geprüft | Status ungeprüft | docs/biome-manifest.md | Spiel |
| N-39 | BS-1 "Fehlt laut SSOT": 24 Stoffe (schlacke, schwefelkruste, salzkruste, kalkstein, moos, alienharz, firn, wolkenstein, magnetgestein, keramik, lavaglas, bimsstein, tempelstein, mauerwerk, rostmetall, tiefseeschlamm, hydrothermal, versteinertes_holz, kolossholz, instabiler_boden, teer, treibsand, myzel, leuchtalgen); Inventar ist veraltet (18 Stoffe), Audit 10-30 zählt 126 Stoffe, daher vermutlich erledigt | Status ungeprüft (vermutlich erledigt) | docs/terrain-inventar.md | Spiel |
| N-40 | Gelände-Spec Phasen: P1 Materialoptik (WebGL2-Shader, Abnahme: Kachelmuster messbar weg per Autokorrelation 512 px, 3 Materialien in 400x300 px unterscheidbar), P2 Zoom/Kartenmaße/Flächenbudget (Formate 16:5, 4:3, 1:1, 3:4, 5:16, `check:erreichbarkeit` je Format), P3 Zerstörbarkeit sichtbar (Holz Fasern, Beton Platten, Glas Scherben, Sand rieselt), P4 Stoffumwandlung (Lava+Wasser = Insel, Hitze schmilzt Eis, Brand Holz zu Asche, fallender Schnee), P5 Bewegung (ein Reibungswert je Stoff: Eis rutscht, Sand bremst); offene Fragen: "rund" = 1:1 oder kreisförmige Grundfläche? Auflösungsdecke 14 Mio Pixel (Stufe 2) oder bis 33 Mio? | Status ungeprüft (Entwurf zur Freigabe vom 2026-10-26; gelaendeGpu.js und Zoom existieren, P3-P5 und die zwei Fragen unbekannt) | docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md | Spiel/Grafik |
| N-41 | Look-Vorgabe: Zuordnung neuer Kacheln zu `STOFF_TEXTUR` (eis, sand, holz, beton, obsidian, basalt, regolith, pilz = A9, A3, A11, A16, A21, A7, A22, A10) vorgeschlagen; sheet-b Fantasy für Spezialbiome; Umsetzungsstand ungeprüft | Vorschlag, Status ungeprüft | docs/design-vorlagen/look-vorgabe-gelaende.md | Grafik |
| N-42 | Kartengenerierung-Recherche, Reihenfolge-Vorschlag (16-24 Tage): 2D-Maske als Wahrheit, simplex-noise+alea, Hedgewars-Perlin-Formel, Zwei-Noise-Höhlen mit Connected-Component, Outline-Template-Pipeline, Biom-Postpass+Wetterpartikel, Kanten/Highlight/Antialiasing, optional Maze-Tunnel; nicht empfohlen: WFC, Hedgewars-Code kopieren (GPLv2) | Vorschlag, größtenteils vermutlich umgesetzt (2D-Maske, `terrainGen2.js` existiert); Rest ungeprüft | docs/recherche/kartengenerierung.md | Technik |

### Technik/Betrieb

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-43 | Ereigniskanal Wasser-Karten: `damage`, `entity_in_water`, `drowning` melden je Takt (42,29 KB/s je Client bei 40 Figuren `flooded`); Drossel brächte 42,29 auf 2,46 KB/s (-94 %), aber Entscheidung über Spielinformation; sauberer Weg wäre gebündelte Meldung (Zustand+Zeitfenster), ändert Drahtformat, eigener Auftrag. `entity_in_water`/`drowning` redundant zum Snapshot (a), `damage` nur teilweise (b, Urheber nicht im Snapshot, aber ohne Leser). Folge: Test-Wächter in `event-coverage.test.js` müssten angepasst werden | offen, Status ungeprüft (sprung-regel §5 meldet "Drossel-Gruppe" inzwischen umgesetzt; Stand `GEDROSSELTE_EREIGNISARTEN` im Code prüfen) | docs/ereigniskanal-filter.md, docs/ereignis-info-gehalt.md, docs/hud-vorrang.md | Technik |
| N-46 | match.js-Zerlegung: Fund 1 des Duplikat-Berichts (`integrateStep` aus `shared/ballistics.js` statt Duplikat; würde `vy *= drag` entfernen und `turret-ballistics.test.js:276` rot machen) und Fund 5 (zeichengleicher Ausdruck zweimal in `match.js`, durch Wächtertest festgehalten) blieben offen; `WATER_SCALE` und `#simulateTurretPath` bewusst im Match | offen, Status ungeprüft | docs/zerlegung-turret.md, docs/zerlegung-match.md | Technik |
| N-47 | Skalierung: Teamgröße über 3 öffnen (erledigt: MAX_PLAYERS_PER_TEAM = 6), 4K in `MAP_SIZES` eintragen + Kamera mitskalieren, Konten und TLS/Reverse-Proxy (`docs/betrieb.md`), Sound-Prüfung; Snapshot-Strides optional sparen (`waterLevel`, `frozenTurns` nur bei Bedarf), Delta-Encoding spart nichts (`dirty` wird im Client nicht gelesen); Hetzner CX32 trägt rund 68 gleichzeitige 8-Spieler-Matches (Messung 2026-09-17); offene Design-Fragen: Übersicht bei 8 Figuren, Kamera bei 4K | Status ungeprüft (Stand 2026-09-17, teils überholt) | docs/skalierung.md | Betrieb |
| N-48 | Batterie `npm run test:e2e` nur seriell/allein fahren (Last macht Bildzeit-Specs rot, `profiling`); im Vergleichslauf 2026-10-19: 2 rote (online-sprung-abwurf Timeout-Flake, profiling 60-Hz-Budget 0,90 ms Aufschlag) einzeln grün, 2 übersprungen | Hinweis / Flake-Risiko, Status ungeprüft | docs/10-balance-tests.md, docs/vergleich-alternativspiele-2026-10-19/vergleich.md | QA |
| N-49 | Sprite-Prüfwerkzeug `check-sprites` (JSON-Stand 2026-10-25): Befunde zu zerfaserten Zellen (u.a. datacult/11 zustand) noch in `docs/sprite-pruefung.json`; Deckung Waffen-Bilder Mittel 42,59 | Daten, bildet N-01 ab | docs/sprite-pruefung.json | QA |
| N-50 | Recherche-Hinweise nicht umgesetzt/offen: `openartillery.net` als nächster Rechercheschritt (nur GitHub-Topic gesehen); Reddit-Threads nicht lesbar; Sonniss-GDC-Bundle sichten (Lizenz geprüft, kein KI-Training, kein Weitervertrieb); Kenney CC0 / OpenGameArt nur als Ergänzung; ZzFX/Voice-Kette; Wasser-Heightmap und Partikel-Pool (Phase 3) | Vorschlag, Status ungeprüft (Sound laufzeit-synthetisiert, `klangSynth.js`) | docs/recherche/npc-ki.md, docs/recherche/sound-und-juice.md | Audio/Technik |

## 4. Stand-Korrekturen (nach den Berichten erledigt oder entschieden)

- Erledigt 2026-11-05 (Abend): **Welle 0 und 1 nach `main` gebracht und geprüft.** (1) Klassenfassung 3 (Nahkampf/Fernkampf/Okkultist, keine Archetypen, Standard) gemergt, Balance 4,00/4,00/4,00. (2) Deploy-Reife (DEP-1/2/3, REL-1/Rel-2 teilweise) gemergt: Release-Paket, Rollback, Sicherung/Wiederherstellung, Dockerfile/Compose, Caddy-Vorlage, Versionskennung 0.9.0, sechs neue Testdateien. (3) Auslieferung (BLD-1/BUILD-1) gemergt: 80 Kulissen als WebP, Bundle-Gate `check:bundle` in `npm run checks` (jetzt 22 Gates). (4) GP-4 Tempo als Waffenfassung 15 (`WAFFEN_TEMPO`, Standard) gemergt, Messbeleg `docs/balance-tempo-2026-11-05.md`. Gesamtlauf auf `main`: **2416 Tests, 2410 grün, 6 rot** — davon 3 Alt-Replay-Goldwerte (Ursache: Waffenfassung 15 als Standard; danach Marke 14 in den Alt-Replay-Tests gepinnt, Goldwerte unverändert gültig, Stichprobe `{"gelaende":6,"waffen":14}` = `4913d98d`) und 3 lastabhängige Zeitmessungen (`load`, `mengenbegrenzung`, `server-start`), die einzeln grün laufen. Offen bleiben die Welle-2/3-Pakete aus `docs/plan-produktion.md` §2.

- Erledigt 2026-11-03 (Bilder, 2,31 USD bei Together): N-06 neue Bilder für neun Waffen, Gleitschirm eigenes Bild; fünf Emotionsblätter neu (undead/00, undead/02, undead/11, datacult/11, datacult/20); 3-D-Pilot Genzi übernommen; SPR-1/2/3/5/7 per Sichtprüfung als erledigt bestätigt. Bekannt: zwei Touch-Tests in `waffenmenue.spec.mjs` laufen auf main in einen `tap`-Timeout (QA-6).
- Erledigt 2026-11-02/03 (Agentenlauf): Server SRV-1/2/3/6/7/9, HTTP-1 (400 bei kaputtem Body), UI-1, ENG-5, REPLAY-1, WERKZEUG-1; Engine N-19, ENG-2/3/4/9/10 (`sourceRarity` gestrichen), ENG-8 begründet, TER-1 geklärt (Bohrkopfrakete gräbt nicht = Designfrage), ZERLEG-1 war schon erledigt, Waffenfassung 13 (Sichtlinie endet an der ersten Figur); Waffenoptik N-05/07/08/11/13; QA N-36 (`npm run kontaktbogen`), BLD-2/3/4, ENG-11, MINEN-2 bis auf Playtest; Gelände N-29 und UI-8 mit Geländefassung 8 (Leitstoff je Biom, begehbare Ruinen, Start nur auf großer Landmasse), `check:biome` grün. Offen aus diesem Lauf: SRV-4, DEAD-1, STATE-1 (nicht bearbeitet), Pilzwald Seed 2092081 (am 2026-11-04 mit Geländefassung 9 behoben).
- Erledigt 2026-11-03 (Agentenlauf 2): QA-6 Touch-Timeout (Aktionsleiste als Raster, nur Knöpfe fangen Berührungen), CI-E2E in 4 Teilen (`--shard=i/4`), LADEZEIT (Stofftexturen und Effekt-Sheets im Leerlauf: bis Menü bedienbar 1850 → 538 kB, Menü 206 → 189 ms), SRV-4 (`PA_ERLAUBTE_ORIGINS`); DEAD-1 und STATE-1 waren schon erledigt. Haupt-Bundle bleibt 1,24 MB (Engine-`import()` bräche die synchrone `__PA__`-API).
- Erledigt 2026-11-04: KAMERA-1 (Kamera touch844 kam nicht zur Ruhe). Ursache: Figurrand `pad` in Bildschirmpixeln hängt vom Zoom ab, Zoom und Rand schaukelten sich an einer Rundungsgrenze auf (Ziel sprang Zoom 1 ↔ 1,15), und die Zugwechsel-Fahrt endete nie, weil das Ziel jenseits der Klemmung lag. Fix in `kameraRegie.js`: Rand wächst in der Übersicht nur, Zugwechsel endet bei Stillstand. Regressionstest in `kamera-ziel.test.js`, `kamera.spec` 15/15 grün.
- Erledigt 2026-11-04 (Agentenlauf 3): EREIGNIS-1-Fehler (Laufknöpfe im Hochformat über Kraftanzeige und Protokoll, E2E `touch-laufen-hochformat`; Kills in Statistik/Endscreen/Profil; Feuer-/Lava-Zellen im Online-Stand über `terrain_hash`/`terrain_state`, Hash unverändert; Flugmarke `zuender` für Zünderwaffen); N-44 (Quelltext-Wächter `hud-ablehnung-ton.test.js`, Aufrufstellen waren schon richtig); N-45 (Doku gegen Code: unbegrenzte Sprünge mit Luftsprung-Zuschlag); N-28 (9 Stofftexturen nahtlos per Offset-Blend, `scripts/stoff-naht.py`, Test `stoff-naht.test.js`; `stoff-texturen-neu/moos.jpg` ist eine ungenutzte Doppelung, im Spiel gilt die nahtlose `stoff-texturen/moos.jpg`); Pilzwald Seed 2092081 mit Geländefassung 9 (`GELAENDE_OHNE_SCHACHT`: Ruinenfenster nicht mehr in der Krone, Start braucht 96 px begehbaren Abschnitt), Fassung ≤8 und Alt-Replays bit-identisch.
- Erledigt 2026-11-04 (Abend): Hochformat entfernt und ⚙-Einstellungsmenü (Specs `querformat-telefon`, `dreh-hinweis`, `hud-einstellungen`, Unit `nur-querformat-server`, `replay-hochformat`); HUD-Referenzbild 1280x720 aus dem CI-Artefakt übernommen (in diesem Container weicht die Schriftumgebung ab); E2E-Zeitgrenzen wirksam (`test.setTimeout`); `seil.spec` an Geländefassung 9 angepasst und zeitunabhängig; `waffen-animation` „danach Ruhe“ wartet auf die Bildzeit statt 400 ms Wanduhr. Offen: Touch-Knöpfe überlappen auf 1280x720-Touchgeräten Wählrad und FEUER (älter); Hochkant-Kulissen (`_h`) nur noch für alte Replays.
- Erledigt 2026-10-30: Fass-Abwurf (Bodenobjektfassung 4), Biome 15–20 spielbar (Gelände-Fassung 7), Together-Zugang (gpt-image-2, Referenzbild per öffentlicher raw-URL, User-Agent nötig).
- In Arbeit: Neuerzeugung der 64 Sprite-Blätter ohne Emotion (Rohbilder in /tmp/pa-roh, danach schneide.py, streifen-entfernen.py, sprite-sheets-klassifizieren.py, Sichtprüfung), danach 20 Emotion-Blätter.
- Offen und beschlossen: 5–7 Varianten je Kachel/Stoff (Client), Neon-Optik, Biom-Objekte in Seitenansicht, Objekte/Trigger der Biome 15–20 (BS-6/BS-7).
- Wartet auf Auftraggeber: Hetzner-API-Token (Z246), Seil-Konstanten, Klärung der Namens-/Bildbrüche pa_032, pa_109, pa_114, pa_056.
- Bekannt: `check:biome` ist bei einzelnen Seeds (951031, 1080350, 1224883) rot, weil weniger als 50 % der trockenen Kistenplätze zu Fuß erreichbar sind; Ursache im Kartengenerator der Fassung 6, nicht in den neuen Biomen.
- Bekannt: Drei Texturen im Arbeitsbaum (`stoff-texturen-neu/kerkergewoelbe|risszone|wurzeln.webp`) sind unversioniert verändert und zu groß für `tests/stoff-texturen.test.js`; Herkunft unklar, Auftraggeber entscheidet.

## 5. Referenzdokumente, die bleiben (kein Bericht, keine Liste)

Spezifikationen und Betrieb: `AGENTS.md`, `README.md`, `MASTERDOTO.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CREDITS.md`, `deploy/README.md`, `docs/betrieb.md`, `docs/betrieb-INSTANZ.md`, `docs/probe-knoten-und-hardware.md` (Befehlsblatt Z246/Z579), `docs/testgrenzen.md`, `docs/auftraege/minen-faesser.md`, `docs/auftraege/seil.md` (belegte Worms-Fakten), `docs/fortsetzen-nach-neuladen.md` (RT-1), Biom-Dokus (`docs/biome/*`, `biome-ssot`, `biome-manifest`, `biome-uebersicht`, `biome-20`), Terrain-/Material-Matrizen, `docs/recherche/*`, `docs/design-vorlagen/*`, `docs/balance-auslese/*`, `docs/superpowers/specs/*`, `docs/zerlegung-match.md`, `docs/zerlegung-turret.md`, `docs/ereignis-info-gehalt.md`, `docs/ereigniskanal-filter.md`, Entwurf Onboarding/Sidegrades, Tier-Balance, Skalierung, Fallschaden-Bremse, Sprung-Regel, HUD-Vorrang, `ARCHIVED.md`, `docs/audit-2026-10-09/prompt-01-audit.md` (wiederverwendbarer Audit-Prompt).
Bis Code/Tests nicht mehr darauf verweisen, bleiben außerdem: `bgworker-todo.json`, `docs/audit-tief.md`, `docs/audit-code.md`, `docs/audit-selbst.md`, `docs/audit-arch-grenzen.md`, `docs/audit-waffen-2026-10-28.md`, `docs/befundregister.md`, `docs/offene-punkte.md`, `docs/bgworker-todo-2026-10-02.json`, `docs/abnahme-bugs-2026-10-01.md`, `docs/analyse-guenther-online.md`, `docs/audit-2026-10-09/01-verifizierte-befunde.md`, `docs/auftraege/look4-innenraeume.md`, `docs/duplikate-bericht.md`, `docs/server-seite-fixes.md`, `docs/tote-regeln.md`, `docs/verkabelung.md`, `docs/waffen-verkabelung.md` (Offen: Verweise umschreiben, dann löschen).

## 6. Wiederherstellung gelöschter Dokumente

Alle gelöschten Dateien stehen unverändert in Git: `git show f136d48:<pfad>` (Stand vor der Löschung). Dort liegen auch die Messtabellen, Befehlsblätter und Fallen aus den Einzelberichten.

## 7. Gesichertes Wissen aus gelöschten Dateien

### 7.1 Architekturentscheidungen Materialoptik (aus tasks/plan.md)

# Umsetzungsplan P1: Materialoptik

Grundlage: `docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md` (freigegeben 2026-10-26).

## Überblick

Das Gelände bekommt seine Materialoptik auf der GPU: Die vorhandene 8-px-Stoffkarte
wird als Textur hochgeladen, ein WebGL2-Fragment-Shader malt je Material ein eigenes
Detail (Risse, Dünen, Facetten, Fasern), bricht die Zellkanten per Domain-Warp auf und
setzt eine dunkle Kontur an Materialgrenzen. Der CPU-Weg bleibt als Rückfall und sieht
weiter aus wie heute.

## Architekturentscheidungen

- **Nur die Materialmalerei wandert auf die GPU, nicht der Steinkern.** `faerbeGelaende`
  rechnet Steine/Lagen/Kantenlicht weiter auf der CPU (400 ms — Ladezeit ist laut
  Auftraggeber zweitrangig). Die GPU bekommt das fertige CPU-Bild als Textur und legt
  die Materialoptik darüber. Damit ist der neue Weg isoliert prüfbar, und der Rückfall
  ist pixelgleich zu heute.
- **Die Stoffkarte bleibt Wahrheit.** Der Shader verzerrt nur den *Blick* darauf
  (Domain-Warp in Pixeln), nie die Daten. Kein Eingriff in Hash, Netcode, Determinismus.
- **Ein Kontext, einmal angefordert.** Der Renderer hält den WebGL2-Kontext; Aufbau je
  Karte = Texturen hochladen, zeichnen, zurücklesen.
- **Kein WebGPU** (in dieser Umgebung nicht lauffähig, §3 des Entwurfs).

## Aufgaben

### Phase 1 — Fundament (rein, in Node prüfbar)

- [ ] **T1** Stofffeld als Textur packen: `packeStofffeld(karte)` → `{daten, spalten, zeilen}`,
      Überlagerung (`ueber`) wie in `tinteStoffe` angewandt.
- [ ] **T2** WebGL2-Erkennung `erkenneWebGl2()`: Kontext oder `null` **mit Grund**; kein DOM
      in Node ist ein Grund, kein Fehler.
- [ ] **T3** Shader-Quelle `STOFF_SHADER_GLSL` + Materialfarben `stoffFarben()` aus `STOFFE`.

**Checkpoint A:** `npm test` grün; die drei Bausteine haben Tests, die vorher rot waren.

### Phase 2 — Zeichnen und Einbau

- [ ] **T4** `tinteStoffeGpu({bild, breite, hoehe, karte, seed, gpu})`: Texturen hochladen,
      Shader zeichnen, Pixel zurücklesen; gibt das neue Pixelfeld zurück oder `null`.
- [ ] **T5** Einbau in `baueGelaendeEbene`: GPU wenn vorhanden, sonst `tinteStoffe`;
      Renderer fordert den Kontext einmal an.

**Checkpoint B:** Spiel läuft im Browser, Konsole ohne Fehler, `npm test` + `npm run checks` grün.

### Phase 3 — Abnahme

- [ ] **T6** `scripts/gelaende-optik.mjs`: Screenshots in Spielgröße **und** als
      Nahausschnitt, Autokorrelation bei Versatz 512 gegen 511/513, Materialzählung in
      400×300.

**Checkpoint C (Abnahme P1):**
- [ ] Kachelmuster messbar schwächer als heute
- [ ] mindestens drei Materialien in 400×300 unterscheidbar
- [ ] `npm test`, `npm run checks` (21 Gates), `check:docs`, `check:terrain`, `check:hoehlensicht` grün
- [ ] Screenshots dem Auftraggeber vorgelegt

## Risiken

| Risiko | Wirkung | Gegenmaßnahme |
| :-- | :-- | :-- |
| Shader sieht anders aus als die CPU-Fassung | hoch | CPU-Rückfall bleibt Standard; GPU nur wenn Kontext da ist |
| GT 540M/HD 3000 können `highp`-Schleifen nicht | mittel | Probe lief auf beiden (§3 des Entwurfs: 31/45 ms) |
| Rücklesen kostet mehr als das Zeichnen | mittel | gemessen: 10,8–12,4 ms für 14,7 MB |
| Zwei Wege driften auseinander | mittel | ein Screenshot-Vergleich im Abnahme-Werkzeug |

## Offene Fragen

- „rund" (1:1 oder kreisförmige Karte) und Auflösungsdecke — betreffen P2, nicht P1.


### 7.2 Lehren aus der Auftragswarteschlange 2026-10-02 (Auszug, Merksätze)

- Ein Test, der eine feste MENGE verlangt, wo er eine belastbare STICHPROBE braucht, prüft die Maschine, nicht das Spiel (Profiling-Spezifikation).
- Erst EINE Änderung im Werkzeug machen, dann messen; nicht mehrere Änderungen mischen.
- Eine Sonde, die den Fix voraussetzt, beweist nichts; erst den Arbeitsbaum putzen, dann messen.
- Nie zwei Arbeiter auf derselben Datei; Fundstellen über NAMEN verankern, nie nackte Zeilennummern (Anker-Regel).

### 7.3 Urteil je Quelldatei (Gruppe A und B, vor der Löschung)

## 2. Quelldatei -> Übernahme

| Datei | Urteil |
|---|---|
| docs/offene-punkte.md | enthält zusätzlich Wissen, das nirgends sonst steht: (a) Prüfverfahren für rote Bildvergleiche (3 Messungen stabil?/Code?/Versatz?, nur rote Baselines nachziehen, nie `maxDiffPixelRatio` hochsetzen); (b) Betriebsnotiz 4b: E2E-Vergleichs-Sweep (`vergleich-screenshots.spec`) überschreibt 27 getrackte Bilder unter `docs/vergleich-alternativspiele-2026-10-19/` -> danach `git checkout -- docs/vergleich-alternativspiele-2026-10-19/`; (c) Messwerte Struktur-Vergleich (Lobby 390x844 auf fremdem Rechner 8 % Kanten, HUD 1,4 %), Schriften wirklich `Exo 2`/Bebas (Chakra-Petch-Kette in `index.html` toter Text); (d) Lehren §8 (Ampel die immer rot ist, Bericht der nie neu erzeugt wird); (e) FLAKE-1/2, MAHL-1-Messhinweis (Werkzeugfehler `spieleZug`); (f) Erledigt-Liste 2026-10-25 mit Commits. Offene Punkte sind oben übernommen |
| docs/befundregister.md | enthält zusätzlich: Anker-Regel (Fundstellen über NAMEN verankern, nie nackte Zeilennummern), Arbeiter-Regeln (nie zwei Arbeiter auf derselben Datei; E2E erst wenn alle Schreiber ruhen; Altreplay-Hash `9ec63e8c` als Kriterium unveränderter Simulation), Liste widerlegter Fehlalarme und widerlegter Behauptungen in alten Berichten, "was die Prüfung bestätigt hat" (90 Module, 249 Kanten, 0 Zyklen/Schichtverletzungen). Befunde A-1..B-12, C-1..C-9 alle erledigt; offene Reste oben (B-9a, RT-2) übernommen |
| docs/todo-abgleich.md | vollständig übernommen, Stand 2026-09-26/27, größtenteils überholt (O8/O9/O2 erledigt, fire() ausgezogen, Turret gebaut). Zusätzlich: Lehre "mehrere Sitzungen schreiben gleichzeitig: jede Existenzaussage braucht Zeitstempel", Muster "[x]-Zeile gesetzt, darunter stehender Prosasatz nicht nachgezogen" (MASTERDOTO enthält solche Altsätze) |
| docs/todo-verifikation-1.md | vollständig übernommen (historischer Prüfbericht 2026-09-27, 41 bestätigt/12 widerlegt); Nutzwert nur als Zeitzeugnis. Einzig bewahrenswert: Liste der nie selbst gefahrenen Läufe/Messungen (Abschnitt 9) |
| docs/todo-verifikation-2.md | vollständig übernommen (historisch). Enthält zusätzlich eine Tabelle "Nicht geprüft und welcher Befehl es klärt" (u. a. `npm run balance:sweep` >20 min, Replay-Verify gegen `9ec63e8c` via `npm run replay -- record` + `play --verify`, A/B gegen Baseline `9cb5fe5` per `git worktree`) und die Selbstkritik "Testfunktionen nicht per grep zählen, sondern `playwright test --list`" |
| docs/auftragswarteschlange-2026-10-02.md | enthält zusätzlich Wissen: Merksatz "Test verlangt feste MENGE statt belastbarer STICHPROBE prüft die Maschine" (Profiling-Spec `MESS_ZEITGRENZE_MS = 45_000`, mind. 60 Bilder); Lehre A/B-Messung: EINE Änderung im Baum, Gegenprobe gegen KOPIE, Baum vorher putzen; Cron-Wächter-Pfad-Fehler; Offen: Default-Export-Block `shooting.js` (inzwischen laut MD 2026-10-13 entfernt). Offene Punkte oben übernommen |
| bgworker-todo.json | vollständig übernommen: alle 23 Einträge `erledigt` (O2 "teilweise" mit Rest `crate_landed`, siehe O2-REST). Enthält Regelwerk der Worker-Arbeitsweise (`_meta.arbeitsweise`: Phasen, Dateieigentum `besitzt`/`verboten`, Kinder committen nicht) und Merkregel O10: MCP-Ergebnis ist ein Zeitpunkt, immer gegen frisch gestarteten CLI-Lauf prüfen (`node tools/audit-mcp/server.mjs --ruf audit_events`) |
| docs/bgworker-todo-2026-10-02.json | vollständig übernommen: W1-W3 erledigt; W4 (Online-Karte falscher Generator, 34 %) laut `terrainPreview.js` (importiert `erzeugeAutonomeKarte`) und Bericht `docs/verkabelung-p1-terrain-2026-10-02.md` inzwischen behoben (kartentyp im welcome/joined, MD 2026-10-27) -> nicht aufgenommen |
| tasks/todo.md, tasks/plan.md | vollständig übernommen als MATOPTIK-1; plan.md enthält zusätzlich Architekturentscheidungen (nur Materialmalerei auf GPU, Stoffkarte bleibt Wahrheit, Domain-Warp nur Blick, CPU-Rückfall pixelgleich, kein WebGPU), Risikotabelle und Messwerte (Rücklesen 10,8-12,4 ms für 14,7 MB; Intel HD 3000 45 ms, GT 540M 31 ms). Entwurf `docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md` nicht in Gruppe A |
| docs/auftraege/online-sprung-und-abwurf.md | vollständig übernommen: umgesetzt (Commit `68f551c`, E2E belegt 2026-10-13); einzig offenes Kästchen G.5 ("Seed 4242 über `#cfg-seed`") ist laut Vermerk überholt. Enthält zusätzlich eine Zwei-Wege-Abwägung und Skill-Hinweise für E2E (Zustand prüfen, nicht Uhrzeit) |
| docs/auftraege/zerlegung-schritt3-ereignisse.md, zerlegung-schritt4-zustand-und-schuss.md | vollständig übernommen: Zerlegung abgeschlossen (main.js/match.js verkleinert, `ereignisse.js`, `stateSnapshot.js`, `shooting.js` existieren); die zwei unabgehakten Kästchen (npm test 983/983, main.js < 3.250) sind überholt |
| docs/auftraege/look4-innenraeume.md | vollständig übernommen: LOOK-4 laut OP/MD in allen vier Stufen erledigt (Entscheidungen: Decken unzerstörbar, Röntgen-Schnitt, erst Ruinen dann Hochhäuser). Der Text zeigt noch "Offen: vier x-only-Stellen" (Stufe 1), im MD als erledigt geführt. Enthält Ist-Stand-Fundstellen (`materialAmPunkt`, `terrainGen3.js:520`) |
| docs/auftraege/minen-faesser.md | enthält zusätzlich Wissen: Entscheidungen 2026-10-29 (Friendly Fire AN; sofort scharf; 80/5/15 %; Teleportplattform `pa_127` wird in Waffenfassung 12 zur Mine, Fassung 11 und älter unverändert; Bodenobjektmarke 1/2/3; Fass explodiert immer), Ausgangslage-Tabelle mit Fundstellen, technische Einschränkungen. Offene Punkte oben (MINEN-1/-2) übernommen |
| docs/auftraege/seil.md | vollständig übernommen als SEIL-1; enthält zusätzlich die belegten Worms-Fakten (Länge je Kraftstufe 294-297/336-339/378-381/420-423/462-465 px, Neuwürfe 1/2/2/3/unbegrenzt, Handhabung, Rope Knocking) und die Einbau-Tabelle; Quellen worms2d.info/BattyRope, Worms Wiki |
| docs/probe-knoten-und-hardware.md | enthält zusätzlich das vollständige Befehlsblatt (A1-A7 Abschaltprobe: Befehle, Erwartung, Nachweisfelder; B1-B4 Rendermessung: `chrome://gpu` GL_RENDERER, SwiftShader gilt nicht) und Hetzner-Hinweis (ausgeschaltet bleibt abgerechnet bis gelöscht). Muss als Anleitung erhalten bleiben (z. B. in `docs/betrieb.md` einsortieren), sonst geht die Schritt-für-Schritt-Probe verloren |
| docs/testgrenzen.md | enthält zusätzlich Wissen: die fünf Testgrenzen mit Hebeln, Bildvergleich-Regeln (CI setzt `PA_OHNE_BILDVERGLEICH=1` nur für `vergleich-screenshots.spec`), Messung 13,6 ms/Mio. Pixel (Intel HD 3000, ANGLE) vs. 48,2 ms SwiftShader, Terrain-Aufbau CPU 2,5-2,7 s, Online-Tests brauchen zwei Menschen (`helfer/zweiter-mensch.mjs`), Zahlen veraltet (Stand 2026-09-20; laut BR 1116/107/39 902) |
| MASTERDOTO.md (Abschnitte Offenes/Fahrplan) | durchgesehen: Abschnitte Performance 2026-10-26, GPU-Gelände entfernt, Materialoptik, Sprite-Prüfung, Audit 2026-10-23, Standardmechaniken, Sicherung, Netcode-Audit 2026-10-09, Waffenfassungen, Backlog Block 2-4, Übergabe/Fahrplan, Biom-SSOT, Gelände-Look. Gelesen wurde NICHT jede der ~7300 Zeilen (ältere Abschnitte 1568-6660 nur per Stichprobe über TA/Verifikationsberichte). MD behält Wissen, das sonst nirgends steht: Performance-Messreihen (Tick 0,154 ms/16,67 ms; `faerbeGelaende` 400,6 ms = 72 %), verworfene Optimierungen (Puffer-Wiederverwendung, Zeilenscan: Rauschen), GPU-Geländeweg-Entfernung samt Wächter, Rezept Sprite-Erzeugung, Bildzugänge/Preise (Replicate ~0,04 USD/Bild), Fahrplan-Fallen (PA_PORT, `.pa-state/lobbies.json` vor Volllauf löschen, kein `pkill -f`). Nicht löschen ohne diese Punkte zu sichern |

## 2. Quelldatei -> Urteil

Legende: "nur erledigt" = alle Punkte behoben/belegt, sonst nichts Offenes; "übernommen" = offene Punkte stehen oben; "Wissen" = zusätzlich Inhalt, der sonst nirgends steht (Messdaten, Methodik, Begründungen).

| Datei | Urteil |
|---|---|
| audit-arch-datenfluss.md | übernommen (befundregister A/B-Befunde erledigt; SRV-10/11). Wissen: Messwerte Kanalgrößen (142,65 KB/s, 88,9 % Zustandsarten), Tabellen A/B Snapshot-Felder (§2), Determinismus-Grenzen je Fundstelle (§5), Wiederherstellung-Takt/Seed-Messungen |
| audit-arch-grenzen.md | übernommen (V1-V3 ungemessen, siehe ENG-3/ENG-9). Wissen: Import-Graph-Zahlen, Zeilenbudget-Tabellen §6, "Fehlalarm der Sonde"-Lehren (W1-W6), Sichtgrenzen der Werkzeuge |
| audit-blackbox.md | übernommen (QA-3). Wissen: Lehre "Messläufe auf Produktionsbau, Dev-Server am Ende beenden" |
| audit-code.md | übernommen (ENG-7, ENG-9); Rest erledigt. Wissen: Tabelle Geschütz-Wind-Abweichung vorher/nachher (nur historisch) |
| audit-klassen-2026-10-28.md | übernommen (GP-5). Wissen: Messtabelle Fassung 1 vs 2 (Klassen-Summen, Spannweite 1,30 -> 1,15) und Begründung speed bleibt 1,2 |
| audit-selbst.md | übernommen (ENG-10, ENG-11, ENG-12). Wissen: Begründung warum `targeting` NICHT verdrahtet wird (11 Waffen widersprüchlich, Motor leitet aus Wirkung ab), Leser-Prüfung aoe/sourceRarity/requiresLineOfSight/effectMagnitude über scripts/ |
| audit-tief.md | nur erledigt (alle Gates grün, TODO 0). Wissen: Begründungen der 15 Doppelregel-Ausnahmen (stehen auch in tools/audit-mcp/lib/statisch.mjs), Sichtgrenzen der statischen Sonden §16.1, smoke-fast `.pathname`-Fehler |
| audit-ui-ablauf.md | nur erledigt (alle A/B/C im befundregister erledigt); Verdacht -> UI-3. Wissen: Tastatur-/Ablauf-Tabellen, "drei Stellen an denen ein neuer Spieler aufgibt" |
| audit-ui-spielersicht.md | übernommen (UI-1, UI-2). Wissen: 500-ms-Messung nach Schuss, Anzeige-Takt/Quelle-Tabelle §0.2 |
| audit-userflow.md | übernommen (UI-5, GP-6, GP-4); Kisten (Radius 110) und `maximum` erledigt. Wissen: Matchdauer-Messung 5,7-11 min (8 Seeds), Zugzeiten 30/20/15 s |
| audit-waffen-2026-10-28.md | übernommen (GP-1, GP-2, ENG-10). Wissen: vollständige Umbenennungs-/Text-/Wert-Tabellen Fassung 9/10/11, Rückstoß-Tabelle, Element-Spuren-Tabelle (Fassungsdoku, sonst nirgends vollständig) |
| audit-2026-10-09/00-claude-rest-auswertung.md | übernommen (SRV-4..9, QA-4, QA-5). Wissen: Allokations-Tabelle §2.4, Rekonstruktion des Engine-Subagenten (Startpunkt für Engine-Audit), Methodik/Token-Aufwand |
| audit-2026-10-09/01-verifizierte-befunde.md | nur erledigt (A-1..A-3, B-1..B-3, C-1b getestet in tests/audit-2026-10-09-fixes.test.js; socket.on('error') und maxPayload 65536 im Code) |
| audit-2026-10-09/02-gegenpruefung.md | übernommen (QA-4). Wissen: Methodik + Lehre "Fremdmodelle liefern Hypothesen, keine Beweise (1 von 4 Aussagen falsch)" |
| audit-2026-10-09/prompt-01-audit.md | enthält Wissen: wiederverwendbarer Audit-Prompt (Rollen-/Phasenstruktur, "private Forschung, 0 % kommerziell, lokal"); Auftragsvorlage, keine Todos. Beim Löschen ggf. nach docs/auftraege oder tools/ sichern |
| release-readiness-audit-2026-10-01.md | übernommen (DEP-6, BLD-4). Wissen: Ergebnis-Tabelle der Gates vom 10-01 (1230 Tests, 21 Gates, perf 0,0565 ms/Tick) nur historisch |
| abnahme-balance-2026-10-01.md | übernommen (GP-4). Wissen: Messzahlen Ein-/Mehrdistanz (nur Stand 10-01) |
| abnahme-bugs-2026-10-01.md | nur erledigt (Punkte 1-9 in §7: Barrels, readBody null/400, Zeilenbudget, Bot-KI-Kommentare, befundregister alle umgesetzt oder im Code belegt; 7 tote Exporte beurteilt als harmlos) |
| abnahme-deploy-2026-10-01.md | übernommen (DEP-1..DEP-6). Wissen: gemessene Start-/Stopp-/Port-Konflikt-Läufe §1-3, Hochrechnung Hetzner CX32 ~68 Matches (§5.1), Reihenfolge der Absicherung; es ist die einzige ausführliche Operator-Checkliste neben betrieb.md |
| abnahme-optimierung-2026-10-01.md | übernommen (BLD-1, ENG-5, QA-6). Wissen: Messwerte Bundle 505,61 kB/138,38 kB gzip, WebP-Samples, measure:load/figures, "Was nicht zu holen ist" §7 |
| abnahme-ux-2026-10-01.md | übernommen (QA-1, UI-4). Wissen: Abdeckungsmatrix Spielerhandlungen §1a, A11y-Bestandsaufnahme §4 |
| hunter-arch.md | nur erledigt/Doku (Protokoll v7 Layout, Replay-Aufzeichnung); Wissen: Binärlayout HEADER_SIZE, MAX_WIRE_POOPS, ECS-Pipeline-Beschreibung, 12 markierte Designentscheidungen §9 (Vor-v8-Stand) |
| hunter-doku-nachzug.md | übernommen (UI-7); sonst erledigt (O8). Wissen: wörtliche Belegausgaben Drahtweg Sprung/Abwurf |
| hunter-e2e-luecke.md | nur erledigt (7 E2E grün). Wissen: Messmethodik (Renderer-Uhr anhalten, Snapshots statt rAF abtasten, Seed-Auswahl) |
| hunter-physics.md | übernommen (ENG-1, ENG-2). Wissen: Begründung speedFactorFor-Untergrenze 0,3 für melee, CRATE_GRAVITY 0,30 absichtlich verschieden (§5.2), weightedRarity-Kollaps-Messung |
| hunter-terrain.md | übernommen (TER-1..TER-3). Wissen: Materialverteilung gemessen (Erde 61,5/Eis 22,1/Gummi 16,4 %), Gen1/2/3-Beschreibung, Persistenz-Feldliste §6.2, Determinismus Krater §7.2 |
| hunter-tools.md | übernommen (BLD-2, BLD-3). Wissen: Fallenliste MCP vs CLI "eingefrorene Sicht" §1.5/§7 |
| hunter-tools-nachzug.md | nur erledigt (audit_stand/werkzeugStand gebaut, 10/10 Probe). Wissen: Beschreibung Fingerabdruck-Mechanismus; Rest: produktiven MCP neu verbinden (Betrieb, nicht prüfbar) |
| hunter-ui.md | nur erledigt (O2/O8). Wissen: bewusstStumm-Liste mit Begründungen, Waffenauswahl-Implementierung §3; veraltete Zeilennummern im Test (trivial) |
| worker-reports/2026-10-23-au1-3-checks.md | nur erledigt (Flake mengenbegrenzung später als FLAKE-1 behoben laut offene-punkte.md) |
| worker-reports/2026-10-23-au5-doppel.md | nur erledigt (Review "NICHT MERGEN" -> später durch Doppelregel-Auflösung 3096467 überholt) |
| worker-reports/2026-10-23-au9-register.md | nur erledigt (C-8/AU-9a später umgesetzt) |
| optimierung-bericht.md | übernommen (ENG-5, ENG-6, QA-6). Wissen: Messwerte "was nicht zu holen ist" (Tick 0,092 ms, Snapshot 217 B, Kaltstart 33-45 ms), Rangliste §7 |
| duplikate-bericht.md | übernommen (ENG-2..ENG-4). Wissen: Verfahren/Urteilskategorien (a/b/c), Mutationsproben, 16 Funde mit Gegenproben (Fund 1/5 behoben) |
| abgleich-dubletten-animationen-2026-10-29.md | übernommen (GP-3, GP-7, GP-8); Dublettenvorschläge sind durch Fassung 10/11 großteils umgesetzt. Wissen: Animationsbestand-Tabelle §B (Dateien/Zuständigkeiten) |
| stille-fehler-fixes.md | übernommen (UI-6); sonst erledigt (A-6/A-14/Restore-Seed). Wissen: Begründung Protokoll v8 berührt Determinismus nicht |
| server-seite-fixes.md | übernommen (SRV-1..SRV-3); Rest erledigt. Wissen: Fehlerpfad-Tabelle 15 Stellen §A-10 (Fehlernutzlast-Vereinheitlichung) |
| spielgefuehl-fixes.md | übernommen (QA-2); Rest erledigt (Mündungsfeuer online später gebaut) |
| tote-regeln.md | nur erledigt (A-12 erledigt; B-4 8 von 10, später zu Ende laut befundregister). Wissen: Anker-Regel "Namen statt Zeilennummern" |
| analyse-ereigniszweige.md | übernommen (UI-8, UI-7). Wissen: Ereignis-Reachability-Tabelle 38/22/11/4/1, Häufigkeiten aus Motorläufen |
| analyse-guenther-online.md | nur erledigt (Günther online verdrahtet, Hunter-E2E 4 Tests grün). Wissen: Belegweg/Messbefehle, Draht-Budget-Überlegung (Protokoll v7) |
| o8-impl.md | nur erledigt (Online-Sprung/Abwurf umgesetzt). |
| o9-impl.md | übernommen (ENG-1 "deterministischer Wurf bewusst offen"); Rest erledigt. |
| o9-test.md | nur erledigt (Replay Sprung/Abwurf bewiesen). |
| verkabelung.md | nur erledigt (Fünf-Stellen-Liste: kartentyp, crateType, dots/boost, t.roundsLeft, rules.js alle im Code behoben); Verdacht Barrels erledigt. Wissen: A-H-Verdrahtungsklassifikation und Pipeline-Stationen 1-5 (Ausgangsstand 2d365d3) |
| verkabelung-p1-terrain-2026-10-02.md | nur erledigt (Client nutzt kartentyp; 34 % Abweichung Befund behoben). |
| waffen-verkabelung.md | übernommen (ENG-8). Wissen: Feldweise Tabelle 41 Waffenfelder / Leser / Gate, Begründungen der 12 bewusst leseroseren Felder (auch im Generator `FELDER_OHNE_PRODUKTLESER_BEWUSST`) |
