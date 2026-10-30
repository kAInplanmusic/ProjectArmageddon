# TODO-SSOT — die einzige Aufgabenliste von ProjectARMAGEDDON

*Stand: 2026-10-30. Diese Datei ersetzt alle früheren Berichte, Todo-Listen, Fahrpläne und Audits (gelöscht; Inhalt steht hier, die Historie steht in Git). Neue offene Punkte kommen NUR hier hinein. Erledigtes wird hier gestrichen, nicht abgehakt gesammelt.*

Regeln: Nichts erfinden. „Status ungeprüft“ heißt: aus einem älteren Bericht übernommen, noch nicht gegen den Code belegt. Entscheidungen des Auftraggebers stehen in Abschnitt 0.

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
| REL-1 (AW §5, Rollback) | Rollback fehlt vollständig, keine Release-Tags (`git tag -l` nur ein Archiv-Tag) | offen, Status ungeprüft (Stand 2026-10-02) | AW §5 (aus `docs/abnahme-deploy-2026-10-01.md` §4.2) | Betrieb |
| REL-2 (AW §5, Öffentlichkeit) | Vor öffentlicher Erreichbarkeit in dieser Reihenfolge: Firewall, TLS (Caddy/nginx), Anmeldung, Ratenbegrenzung; systemd-Unit nur auf Syntax geprüft (`systemd-analyze verify`), nie angeschlossen | offen, wartet auf Knoten | AW §5, MD (Netcode-Audit 2026-10-09 (c)) | Betrieb |
| Z579 / P2 | Rendering auf echter Hardware messen (`npm run perf:browser -- --frames=600`, `profiling.spec` mit `PLAYWRIGHT_CHANNEL=chrome`); Sandbox: 50-83 ms/Frame, 96 % native Rasterung, SwiftShader zählt nicht. Ergebnis in `docs/testgrenzen.md` und OP eintragen. Zielplattform ist nicht festgelegt | blockiert: echte Zielhardware nötig | OP §6, MD (Netcode-Audit P2), PK §B | Betrieb/QA |
| P3-HW (MD Netcode-Audit) | Client-Heap über 10 Runden, Initial-Load-Zeit, Allokationen im Render-Loop auf echter Hardware | blockiert: echte Hardware | MD (Browser-Abdeckung 2026-10-13) | QA |
| PERSIST-1 (MD "Bekannte Grenzen") | Persistenz ist eine einzelne JSON-Datei (`persistence.js`, keine Sperre): Wand vor einer zweiten Serverinstanz | offen (bewusst, erst bei 2. Instanz). Status ungeprüft (Stand 2026-09-26) | TA §8, MD | Betrieb/Technik |
| NET-1 (MD "Bekannte Grenzen") | Verpasste `match_over` wird nur auf PING wiederholt (bis 2 s Verzug) | offen, bewusst in Kauf genommen | TA §8 | Technik |
| RT-1 (AW §3.7) | `CONTROL.RESUME` angekündigt, nie implementiert: Sitzplatz-Token lebt nur im Tab, nach Neuladen kein Fortsetzen | offen. Status ungeprüft (Stand 2026-10-02) | AW §3.7 | Technik |
| RT-2 (AW §3.8 + BR "Start/Beitritt-Reihenfolge, Befund 5") | `CONTROL.START_MATCH` im Livebetrieb unerreichbar; Versprechen "Lobby nimmt wieder einen auf" gilt nur beim beitrittsgestarteten Weg. Verschiebt Oberflächenverhalten, Entscheidung nötig | wartet auf Auftraggeber. Status ungeprüft | AW §3.8, BR Warteschlange | Technik/Spiel |
| B-9a (BR Warteschlange) | Verbindungsmerkmal (Gegner getrennt) auf die Leitung: Protokolländerung (CONTROL + Client), nicht über `CONTROL.ERROR` missbrauchen | offen, braucht Protokolländerung. Status ungeprüft (B-9 selbst erledigt) | BR | Technik |
| HTTP-1 (AW §1b Nr. 11) | `#readBody`: HTTP-Status bei ungültigem JSON bewusst nicht geändert (externer Vertrag) | wartet auf Entscheidung. Status ungeprüft | AW | Technik |
| STATE-1 (AW §3.1/3.6) | `step()` baut Zustand 2x je Tick (`gameServer.js`); `toPersisted` ist zweite Fassung von `serializeLobby` | offen, klein/mittel. Status ungeprüft (P3 2026-10-09 halbierte nur die History) | AW §3.1, §3.6 | Technik |
| DEAD-1 (AW §3.9, §2.7) | `ProjectilePool`/`TerrainSync` tote Umsetzungen; `ballisticsWasm.js` Stub (0 Aufrufer) | Status ungeprüft (Stand 2026-10-02; `no-dead-code`-Wächter läuft inzwischen über ganz `src/`) | AW | Technik |
| BUILD-1 (AW §3.3/3.4, MD UX-4) | Sourcemap im `dist/` (2 MB) nicht ausliefern; WebP für Kulissen (JPG, -27 %) ; Lighthouse Performance 64/100 (FCP 2,8 s, LCP 3,9 s, 152 KiB ungenutztes JS, Code-Splitting/Preload) = eigenes Arbeitspaket | offen. Status ungeprüft | AW §3.3/3.4, MD Abschluss 2026-10-24 | Technik |
| LADEZEIT (MD Fahrplan Paket 7) | Lazy-Loading (144 JS-Dateien/13 MB beim Start, Menü Median 3,5 s, spielbar 5,6 s), Terrain-Neuaufbau, Hocke-Lücken; Messung `scripts/lade-profil.mjs` | offen. Status ungeprüft (Stand 2026-10-22) | MD Fahrplan | Technik |
| ZERLEG-1 (TA §9 Nr. 8) | `#buildTerrain()`/`#spawnPlayers()` aus `match.js` herausziehen ("letzte Architektur-Schuld", ohne Spielerwirkung, nachrangig) | offen. Status ungeprüft | TA §8b, §9 | Technik |
| WERKZEUG-1 (AW §7) | `npm run audit:bericht` überschreibt fest den getrackten `docs/audit-tief.md`; `audit:tief` existiert nicht | offen, klein. Status ungeprüft | AW §7 | Technik |
| REPLAY-1 (MD Netcode-Audit 2026-10-13 Offen (3)) | `ReplayRecorder` Vorgabe `maxRounds = 30` (Motor 300), Altlast in `scripts/replay.mjs` | offen, klein. Status ungeprüft | MD | Technik |

### 1.2 Grafik / Bilder (Sprites, Gelände, Look)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| SPR-1 | `datacult/11_synapse-streamer`: Körperteile getrennt (Zustandsblatt, 6 Zellen); Basisbild schon geräumt; muss neu erzeugt werden (`scripts/sprites-erzeugen/neu-erzeugen.py --pilot` fertig) | blockiert: Bildguthaben leer (kie.ai 402, Guthaben 4,58 Credits; Replicate 402) bzw. neue Blätter nötig | OP §4, MD Sprite-Prüfung | Grafik |
| SPR-2 (Bildteil) | `pixel/00_nullpointer-exception`: Figur zerfasert (Namensteil erledigt) | blockiert: neu erzeugtes Blatt nötig | OP §4, MD | Grafik |
| SPR-3 | `pixel/11_pyrowand-a`: Aktion-Zellen (5) zeigen abgelösten Kopf/Körper | blockiert: neu erzeugtes Blatt nötig | OP §4, MD | Grafik |
| SPR-5 (Bilder) | 11 Zellen tragen noch die Gitterlinie (shinobi/11, undead/10 aktion Z3, xeno/12 walk Z5+7); `streifen-entfernen.py` hinterlässt helle Naht; sauber nur mit neuen Blättern | blockiert: neu erzeugte Blätter | OP §4, MD | Grafik |
| SPR-6 | datacult-Figuren zu dunkel auf dunklem Gelände (Randlicht) | Status ungeprüft: OP §4 führt offen, MD Sprite-Prüfung meldet "UMGESETZT 2026-10-25" (`stil-pass.py --randlicht`) | OP §4 / MD | Grafik |
| SPR-7 | Auffällige Zerfaserung in Animationsblättern; MD: gesichtet, echt defekt nur datacult/11 zustand und pixel/11 aktion; `check:sprites`-Ampel bleibt rot bis diese neu erzeugt (OP §4 führt es noch als "nicht gesichtet") | blockiert (hängt an SPR-1/SPR-3); Status ungeprüft wegen Widerspruch OP/MD | OP §4, MD | Grafik/QA |
| SPR-4 | Fraktion pixel: Neon-Linie umgesetzt; Auftraggeber sprach am 2026-10-29 erneut "8bit?" an | wartet auf Auftraggeber (ob neu bewertet wird; Pixelierung wurde gebaut und verworfen) | OP §5, MD | Grafik |
| BILDLÜCKEN (MD Fahrplan §4) | 29 Figuren ohne Hocke; fünf Figuren mit zerstückelten Zellen (Ethereo inhärent); Zustands-Sheets (81 erzeugt) Rollen noch nicht klassifiziert/im Renderer angebunden | offen. Status ungeprüft (Stand 2026-10-22) | MD | Grafik |
| WAFFENANIM-1 (MD Übergabe, "Waffen mit eigener Bewegung") | 26 Animations-Sheets erzeugt, einige unsauber; Manifest-Feld `anim` + Abspielen in `waffenAnimation.js` | offen. Status ungeprüft | MD | Grafik |
| LOOK-2 (Rest) | Sättigungsdeckel für die GENERATIVE Kulisse (13 von 21 Himmeln über 0,45); Sichtfrage, ohne Vergleichsbilder nicht bauen | wartet auf Auftraggeber (Sicht) | OP §5, MD | Grafik |
| LOOK-3 (Rest) | Prüfbild mit gefüllter Lava gegen `ref-3-vulkanschmiede-hud` (Zellen nur bei Feuerfassung 2; in einer Sonde `spalten` 0) | offen (Messung/Sicht) | OP §5, MD | Grafik/QA |
| MATOPTIK-1 (`tasks/todo.md` T1-T6, `tasks/plan.md` Checkpoint C) | Materialoptik P1: Rausch-Shader VERWORFEN (2026-10-26, "unbrauchbar"); T1-T4+T6 gebaut (`gelaendeGpu.js`, `scripts/gelaende-optik.mjs`), T5 (Einbau) NICHT. Nächster Weg: gemalte Kacheln (`stoff-texturen/`) nutzen, volle Deckung statt `DECKUNG` 0,58, Versatz/Drehung/Maß je Region, Licht von oben; ERST ein Material (Eis) als Vorher/Nachher-Bild vorlegen. Checkpoint C (Kachelmuster schwächer, >=3 Materialien in 400x300, Screenshots an Auftraggeber) offen | wartet auf Auftraggeber-Freigabe nach Eis-Vorher/Nachher | tasks/todo.md, tasks/plan.md, MD Materialoptik | Grafik |
| GELAENDE-1 (MD Gelände-Look 2026-10-27) | Offen laut Text: Höhlen = Tunnelgewirr, Inseln ähnliche Umrisse, Biom-Objekte (19 vorhanden) in Landmassen setzen, Licht an Fackeln/Lava, Nebelschichten; Planet (rund) und "Unmögliches" (Umlauf) nicht im Spiel (brauchen Engine-Regeln) | offen. Status ungeprüft (Absatz im MD abgeschnitten) | MD | Grafik/Spiel |
| TERRAIN-ENTSCH (MD Fahrplan Nr. 8) | Comic-Terrainkacheln (`terrain-vorlagen/`) vs. fotorealistische Stoff-Texturen: Stilfrage | wartet auf Auftraggeber | MD Fahrplan §3 | Grafik |
| ASSETS-1 (MD Fahrplan §3) | Nicht verwendet: Material-Texturen gras, lava-glut, lava-risse, normalmap, hecke-kontrast; Effekt-Sheets Ringe/Blasen, Wirbel, Funken ohne Auslöser; Intro-Video `intro-granate.mp4` (überspringbarer Splash, einmal pro Sitzung) nicht eingebaut | offen. Status ungeprüft | MD | Grafik |
| WETTER-1 (MD Wetter/Donner) | Wetter nicht in generativer Szene der Sonderbiome; Spritzer nur oberste Fläche (nicht in Höhlen); Schnee sammelt sich nicht an; Donner ohne Lautstärke nach Entfernung | offen (Feinschliff) | MD | Grafik/Audio |
| KULISSE-1 (MD Kulisse 2026-10-27) | Online-Matches bauen Kulisse weiter generativ (`setSceneryFromSeed`), gemaltes Bild online nicht angebunden | offen. Status ungeprüft | MD | Grafik |
| GRAFIKSTUFE-1 (MD Biom-SSOT, Grafikstufen) | Renderer liest `GRENZEN` (Lite/Ultra) noch nicht: Weiche für GPU-Gelände, Palettentextur (126 Stoffe, `GPU_STOFFE` 32), größere Karten | offen. Status ungeprüft | MD | Technik/Grafik |
| VIS-1 (Rest) | `visuell.spec`: CI-Runner 2x grün gemessen (kleine Stichprobe); Schriftbreiten-Umbruch der Lobby auf fremdem Rechner nur dort/CI messbar (Wartet nun auf `document.fonts.ready`). Wird die Spec rot: messen (stabil? Code? Versatz?), nie Grenzen lockern | beobachten; bei Rot messen | OP §4a, TG | QA |

### 1.3 Spiel / Design / Balance (meist Entscheidungen des Auftraggebers)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| SEIL-1 (`docs/auftraege/seil.md`) | Ninja Rope "eins zu eins" wie Worms: nichts gebaut. Fehlende Konstanten (Verkürz-/Verlängergeschwindigkeit, Schwungbeschleunigung, Dämpfung, Gravitation, Wickeln um Gelände, Abwurfwinkel, Fallschaden beim Lösen) stehen in keiner erreichbaren Quelle | blockiert: Messung an installiertem Worms Armageddon durch Auftraggeber oder Quelle mit Konstanten | tasks: docs/auftraege/seil.md, MD Standardmechaniken | Spiel |
| MINEN-1 (`docs/auftraege/minen-faesser.md` §0 "Noch nicht gebaut") | Fässer als Kiste/Wurf; Auslösen durch Geschoss-Direkttreffer ohne Radius; Flugbahn der geworfenen Mine; Bild+Klang der Mine nicht geprüft (Waffenmenü zeigt Teleportplattform-Icon, Zeichnung = einfache Scheibe); Werte (Schaden 50, Radius 48, Rückstoß 35; Fass 60/64/45/36) unbalanciert | offen / wartet auf Sicht- und Klangprüfung des Auftraggebers | minen-faesser.md | Spiel/Grafik/Audio |
| MINEN-2 (minen-faesser.md §6 Akzeptanz) | Neun Kästchen alle unabgehakt, obwohl Kern laut §0 gebaut (npm test 2107 grün): Goldwert Marke 1, Hash-Gleichheit, Auslöseradius, 80/5/15-Messung, Kettenreaktion, Serverablehnung (Hinweis: Umsetzung als Selbstwirkung statt Nachricht `lege_mine`), `npm run checks`/eslint/`match.js` <= 2790, E2E online "Mine legen und auslösen", Sichtprüfung | Status ungeprüft: Kästchen gegen `tests/minen.test.js` und Code abgleichen | minen-faesser.md | QA |
| STDMECH-1 (MD Standardmechaniken) | Pause (lokal): FEHLT, niedrig; Fallschirm: bewusst nicht bauen | offen (niedrig) / Entscheidung | MD | Spiel |
| AERO (MD Backlog Block 2, Fahrplan Nr. 4) | Windfaktor je Waffe (0-2,5, explizite 0 = windfrei), Katalog-Fassung, Bahnvorschau mit Wind der Waffe, Windanzeige in Segmenten, Bots berücksichtigen Windfaktor; Wind immer zufällig, auch innerhalb eines Zuges (Seed-Sub-RNG, neue Marke z. B. `config.wind: 2`); Wasser setzt Windfaktor 0 (A1-A6). Im Code kein `windFactor` in `config/` gefunden | offen (entschieden, nicht gebaut). Status ungeprüft | MD | Spiel |
| KAMERA (MD Backlog Block 4, Fahrplan Nr. 5) | C1-C6: Beben-Feinschliff + Einstellung, Knapp-vorbei-Zoom (Phase `knapp`), Zeitlupe NUR bei Schuss mit >= 250 Gesamtschaden oder >= 3 Toten (reine Darstellung), Wasser-Sturz, Kettenzähler, Menü "Kameraeffekte". Kein Zeitlupen-Modul gefunden | offen (entschieden, nicht gebaut). Status ungeprüft | MD | Spiel/Grafik |
| FIGUREN-B (MD Backlog Block 3, Fahrplan Nr. 6) | B1-B4, B6: Zustands-Sheets als Rollen anbinden, Zielen mit Kopf-/Oberkörperrotation, Angst-Reaktion (Radius 150 px, 1-1,5 s), Tod-Epilog Stufe 1 (Spruch je Fraktion, Sprechblase, Detonation, Grabstein nur Optik), Backflip-Rotation; Grabstein als Regelobjekt (B5) GESTRICHEN; Obergrenze Epilog 1,2 s überspringbar | offen (entschieden, nicht gebaut). Status ungeprüft | MD | Spiel/Grafik |
| UI-REST (MD Fahrplan Nr. 2, "UI-Design") | Endscreen/Rangliste, hohe Lobby-Karten mit Podest/Statusfarbe, Home-Bildschirm, Eckleisten mit Porträt (Spielerliste), Hochformat-HUD, Intro-Splash, alte Inline-Styles in `index.html` auf Tokens. Platzhalter (Pineapple, Battle Pass, Shop, XP) nicht einbauen; Endscreen nur mit vorhandenen Werten (keine Kills) | offen. Status ungeprüft (Stand 2026-10-22; Hochformat laut Auftraggeber 2026-10-13 bewusst nicht gebaut) | MD | Spiel/Grafik |
| BIOM-BS (MD "Biom-SSOT: Umsetzung", BS-1 ... BS-13) | Material-Katalog (126 Stoffe erledigt), Zerstörungsmatrix je Einwirkung (BS-2), Schichtenmodell (BS-3), Treffer-Pipeline (BS-4), Einsturz/Tragfähigkeit (BS-5), Objekt-/Trigger-System (BS-6), Medien Gase/Flüssigkeiten (BS-7), Biom 1-14 an SSOT angleichen (BS-8), Biom 15-20 neu: Schlackeschmiede, Kristallines Schwebearchipel, Bio-Alien-Tempelstadt, Abyssale Tiefsee, Dimensionsriss, Versteinerter Kristallwald (BS-9), Kartenformen (BS-10), Optik (BS-11), Hilfe/Doku (BS-12), Tests/Balance (BS-13); Zonen mit eigener Gravitation (Biom 10, 19), Projektil-Reflexion nur Energiewaffen, Wasser als Medium (Entscheidungen 2026-10-22). Offene Widersprüche Manifest/SSOT stehen am Ende von `docs/biome-manifest.md` | offen (große Brocken). Status ungeprüft je BS (BS-1 teilweise erledigt, Gelände-Fassung 5/6 gebaut) | MD, docs/biome-* | Spiel |
| O2-REST | Ereigniszweige: `crate_landed` online ohne Zweig (nur `bewusstStumm`) | Status ungeprüft (Stand 2026-09-27; Rest von O2 sonst nachgezogen) | TA §1 O2-Nachtrag, bgworker-todo.json O2 | Spiel/Technik |
| EREIGNIS-1 (MD Fahrplan §7 "Bekannte offene Punkte") | Magische Peitsche (pa_108) und Tesla-Turm (pa_129) messen 0 Schaden (Messgrenze?); Rolling-Waffen ohne eigene Flugmarke; Seen im Planeten-Biom fehlen; Kills fehlen in Statistiken; Laufknöpfe Hochformat überlappen Kraftanzeige; Feuer-/Lava-Zellen nicht im Snapshot (Spätbeitritt sieht Flammen verzögert) | offen. Status ungeprüft (Stand 2026-10-22) | MD | Spiel |
| WAFFEN-F10 (MD Waffenfassung 6/10/11) | Versetzen und Fliegen ohne Element; `maxAmmo` bleibt Katalogwert; Waffenanzeige zeigt Katalogwerte statt Fassung-10-Werte; Split-/Impuls-Waffen +15 % `damage` Empfehlung nicht umgesetzt | offen. Status ungeprüft | MD | Spiel |
| ERFOLGE-1 (TA §5/§8) | Erfolgs-Symbole als Bilder (derzeit ★/☆); Belohnungen (`reward` überall `null`, kein Vergabesystem); Katalogumfang 11 statt 100 | wartet auf Auftraggeber (Content). Status ungeprüft (Stand 2026-09-26) | TA | Spiel |
| LIEBLING-1 (TA §5) | Lieblingsnation im Profil braucht Charakter-/Fraktionswahl je Platz (Zeile zeigt "—") | wartet auf Auftraggeber. Status ungeprüft | TA | Spiel |
| EXKL-1 (TA §5) | Exklusive Waffe je Charakter, nur als legendärer Drop (kein Feld im Katalog) | wartet auf Auftraggeber. Status ungeprüft | TA | Spiel |
| DESIGNWERT-1 (TA §8b) | 52 von 150 Waffen ohne Designwert in der Quelldatei (`damageSource` derived/none) | wartet auf Inhaltslieferung des Auftraggebers. Status ungeprüft | TA | Spiel |
| TURRET-1 (TA §4) | Nur EINE Waffe (pa_124) mit `special: 'auto_target'`: Content-Frage, ob genug | wartet auf Auftraggeber | TA | Spiel |
| BAL-1 (TA §7/§8/§8b) | maxRange-Anzeige "Reichweite bei neutralem Profil" (Faktor 0,37; eine Zeile Anzeige); Scout-Bewertung; Vergleichszahlen für 6 neue Klasse/Archetyp-Kombinationen (`balance:classes`, `balance:sweep`); `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp (normalisieren verschiebt ~8 %); Wurfweiten-Deckel unter Wurfweite bei 465 Kombinationen (Balance-Entscheidung) | wartet auf Auftraggeber (Balance). Status ungeprüft (Stand 2026-09-26) | TA, MD | Spiel |
| MAHL-Reste (MD Netcode-Audit 2026-10-13) | Warnung vor Valhalla-Beginn, schnellere Mahlstrom-Kontraktion bei 8 Figuren/Karte 2560 px. MAHL-1 selbst ENTSCHIEDEN (Runde 8-14, groß 12-20) | Status ungeprüft, vermutlich durch MAHL-1 überholt | MD, OP §5 | Spiel |
| AUDIO-1 (MD Musik/Hymnen) | Stimmung `intensiv` ohne Auslöser; Hymnen-Einsatz bei Zugbeginn bewusst nicht gebaut | offen (niedrig) | MD | Audio |
| AUDIO-2 (MD Klang, Netcode) | Sicht-/Hörprüfung von Klang bleibt manuell (Projektregel 6.4); Mine/Fass-Klang ungeprüft (s. MINEN-1) | offen: Abnahme durch Auftraggeber | minen-faesser.md, TG | Audio/QA |

### 1.4 QA / Tests

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| TESTLUECKE-1 (BR "Prüfloch", AW §4) | E2E-Lücken: Mahlstrom 0 Specs, Klang 0 Specs, Maus/Touch/Hochformat/kleines Fenster/W-S-Wirkung/Onboarding je 0 | offen. Status ungeprüft (Stand 2026-10-01/02; seither neue Specs, z. B. 61 Specs im Lauf 2026-10-25) | BR, AW §4 | QA |
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
| DEP-1 | Kein dokumentiertes Rollback-Verfahren: keine Release-Tags/Versionskennung zum dist-Build, kein Aufbewahren des letzten guten dist (`emptyOutDir`), keine Rückspiel-Schritte, kein Backup/Restore für `PA_STATE_PATH` | offen (grep: "Rollback" nur als Code-Eigenschaft; kein Tag im Repo geprüft: keiner) | abnahme-deploy-2026-10-01.md §4.2; release-readiness-audit-2026-10-01.md | Betrieb |
| DEP-2 | Kein Dockerfile/Compose-Manifest (Container-Rollback per Image-Tag nicht möglich) | offen (Datei fehlt; ob gewünscht = Entscheidung) | abnahme-deploy §4.2 Pkt 5 | Betrieb |
| DEP-3 | Absicherung vor öffentlichem Betrieb in dieser Reihenfolge: Firewall (Spielport nur Loopback), TLS-Reverse-Proxy (Caddy/nginx, `/ws` durchreichen), Anmeldung/Konten, Rate-Limit je IP | offen/blockiert (Betreiberaktion; Projekt bisher "privat/lokal") | abnahme-deploy §5.2 | Betrieb |
| DEP-4 | systemd-Units + Idle-Timer auf dem Knoten installieren, Marker `/etc/projectarmageddon/ist-gemietet` setzen, `PA_MAX_MACHINE_MINUTES` setzen (heute AUS), `PA_STATE_PATH` persistent; Units nur auf Syntax, nicht auf Anschluss geprüft | blockiert (braucht echten Knoten); entspricht Z246 in offene-punkte.md | abnahme-deploy §5.2/§6 | Betrieb |
| DEP-5 | Betreiberentscheidungen: Instanzanbieter/Modell/Region/Preis, Kostenrahmen + zweiter Alarm außerhalb des Knotens, `PA_IDLE_MINUTES`/`PA_GRACE_MINUTES`/`PA_MAX_RUNTIME_MINUTES` bestätigen, `PA_ACTION` stop vs poweroff (+`PA_POWEROFF_CONFIRM=yes`) | blockiert (nur Betreiber; AGENTS.md §5: sonst wird nichts gemietet) | abnahme-deploy §6 | Betrieb |
| DEP-6 | Nicht lokal messbar: DNS/Zertifikat/TLS-Abnahme, echte Mehrspieler-Session mit Menschen (8 Figuren übersichtlich?), Lastgrenze "viele Lobbys parallel" (68-Matches-Zahl ist Hochrechnung) | blockiert (echte Hardware/Menschen) | abnahme-deploy §6; abnahme-bugs §8; release-readiness-audit | Betrieb |
| SRV-1 | HTTP: `GET /api/<unbekannt>` liefert bei gebautem dist 200 + index.html (SPA-Fallback ohne /api-Ausnahme) statt 404 JSON | offen (Code gelesen: `createDistHandler` Fallback unverändert) | server-seite-fixes.md Offene Punkte 3 | Technik |
| SRV-2 | Host-Sitz bleibt `connected: true` ohne Socket (Lobby-Anlage über HTTP); Host, dessen Browser nie verbindet, verfällt nicht | ungeprüft (lobby.js:432 setzt `connected: true` beim Anlegen; Reconnect-Pfad hängt daran, "eigene Entscheidung") | server-seite-fixes.md Offene Punkte 2; audit-2026-10-09/00-claude-rest-auswertung §3.2 | Technik |
| SRV-3 | Zwei Startwege, zwei Lobby-Zustände (Auto-Start bei letztem JOIN lässt Lobby `open`, `START_MATCH` -> `running`); Produktentscheidung, welcher Zustand gilt | offen/Entscheidung (gameServer.js:1419 Kommentar "Bewusst NICHT hier: markRunning" noch vorhanden; markRunning an anderen Stellen) | server-seite-fixes.md Offene Punkte 5; 00-claude-rest §3.1 Pkt 5 | Technik |
| SRV-4 | CORS spiegelt jeden Origin (`Access-Control-Allow-Origin: request.origin`), keine Origin-Prüfung am WebSocket | offen (Code unverändert; Gewicht niedrig laut privatem Kontext) | audit-2026-10-09/00-claude-rest §3.2 | Betrieb |
| SRV-5 | `POST /api/lobby/create` ohne Rate-Limit/Auth (Wachstum begrenzt? Session-Cleanup `#sessions.delete` existiert inzwischen) | ungeprüft (nur Rate-Limit/Auth fraglich) | audit-2026-10-09/00-claude-rest §3.2; audit-arch-datenfluss B5 | Betrieb |
| SRV-6 | `tick()` ohne try/catch und kein `process.on('uncaughtException')`: Ausnahme in `match.step()` kann Prozess beenden | ungeprüft (gameServer.js:422 tick ohne try gelesen; Handler in scripts/server.mjs nicht nachgesehen) | audit-2026-10-09/00-claude-rest §3.2; 01-verifizierte-befunde A-1 Zusatz | Technik |
| SRV-7 | `maxTickDrift = lagCompensationBufferMs * 2` = 400 ms, aber als 400 Ticks (~6,7 s) verwendet; fehlt `tick`, entfällt die Prüfung; `SnapshotHistory` füllt nur `interpolatedFrom` (rundenbasiert wirkungslos) | offen (validation.js:18 unverändert) | audit-2026-10-09/00-claude-rest §3.2; audit-arch-datenfluss B2 | Technik |
| SRV-8 | Befehle werden auch bei pausierter/nicht gestarteter Session angenommen (`#handleInput` prüft `session.laeuft` nicht; Match startet im Konstruktor) | ungeprüft | audit-2026-10-09/00-claude-rest §3.1 Pkt 3 | Technik |
| SRV-9 | `previousByToken` wird auch für nicht-offene Sockets aktualisiert -> Feld nach Reconnect bis nächsten Vollsnapshot (max ~2 s) veraltet (vom Subagent selbst "unsicher") | ungeprüft | audit-2026-10-09/00-claude-rest §3.2 | Technik |
| SRV-10 | Protokoll-Restmängel: `isActiveTurn`-Byte (1 B/Spieler) und Projektil-`entityId` werden gesendet, nie gelesen; `crateType` im Snapshot, Renderer färbt nur nach rarity; "Delta"-Snapshot spart 0 B | ungeprüft (crateType wird inzwischen im Renderer per switch gelesen -> dieser Teil erledigt) | audit-arch-datenfluss B1/B3/B4; optimierung-bericht §8.2; 00-claude-rest §3.2 | Technik |
| SRV-11 | `decodeSnapshot` bei abgeschnittenem Puffer: Kommentar protocol.js verspricht Prüfung, die es nicht gibt (Spielerabschnitt `return null`, Kisten/Geschütze brechen still ab, ungezählt); `v`-Feld eingehender Steuernachrichten und `WELCOME.protocol` werden nicht gegen `PROTOCOL_VERSION` verglichen | ungeprüft (snapshot_rejected für Version erledigt, A-14; Rest nicht nachgesehen) | audit-arch-datenfluss A7/B7 | Technik |
| ENG-1 | Wurf/Abwurf und Wind teilen denselben `MATCH_BASE`-Zufallsstrom (fachlich unabhängige Systeme verkoppelt); "deterministischer Wurf statt Zufallsstrom bewusst offen" | offen/Design (nicht geändert; `#rollDropThrow` jetzt in kistenWurf.js verschoben) | hunter-physics P4; o9-impl.md Offene Punkte | Spiel |
| ENG-2 | `speedFactorFor` und weitere Helfer liegen als Generator-Code UND als erzeugter Text-Kopie vor (`build-weapon-catalog.mjs` vs `weapons.js`); Test "Rumpf gleich" oder Import aus erzeugtem Text fehlt | ungeprüft (Fund 16 / P5) | duplikate-bericht.md Fund 16; hunter-physics P5 | Technik |
| ENG-3 | Kistenmaße/Randabstand an zwei Stellen mit zwei Zahlen (14 und 12); Seltenheitsfarben `RARITY_COLORS` im Renderer fest vs `rarityColors` in config/loot.js (Fund 12) | ungeprüft (renderer.js:104 hartes Array noch vorhanden) | duplikate-bericht.md "Offen, nicht geprüft" 5 + Fund 12 | Technik |
| ENG-4 | Weitere Duplikat-Verdachtsfälle ungeklärt: 4-Stellen-Rundung (`*10000/10000`), `WATER_SCALE=4` vs `COORD_SCALE=4`, `MUZZLE_SEARCH_DISTANCE=48`/`MAX_SHIFT_SLOPE=16`, `POWER_TO_SPEED=0.14` vs `PULS_TEMPO`/`decay`, 21 Körper-Vergleichsgruppen nicht einzeln beurteilt; Detektor für "fast gleich" (Konstanten maskieren) fehlt | offen (Verdacht, kein Befund) | duplikate-bericht.md "Offen, nicht geprüft" 1-7 | Technik |
| ENG-5 | Optimierung `step()` baut Zustand umsonst (`return this.getState()` am Ende von `step`, 126 Aufrufer, 0 Leser; ~46 % des Ticks, 0,17 % des Frame-Budgets) | offen (match.js:1072 unverändert; Nutzen gering) | optimierung-bericht §7 #2; abnahme-optimierung-2026-10-01 §0.2/§6 #5; hunter-arch §9 Pkt 3 | Technik |
| ENG-6 | Weitere Mikro-Optimierungen laut Messung: `LootSystem.update` je Tick (12 %), ECS-Query-Allokation je System (9 %); Bounce der stehenden Figur als Ursache der `landed`-Flut ("groß/hoch, verboten ohne Auftrag: bricht Replays") | ungeprüft (niedrige Wirkung; Bounce nur mit Auftrag) | optimierung-bericht §7 #3-#6 | Technik |
| ENG-7 | `registerSystem` sortiert bei jeder Registrierung neu (reine Kosmetik, 9 Systeme) | offen (nicht behoben, bewusst) | audit-code.md | Technik |
| ENG-8 | `effectMagnitude` (4 Waffen) hat weiter keinen Produktleser (steht in `FELDER_OHNE_PRODUKTLESER_OFFEN`); Wirkdistanz kommt inzwischen aus Fassung 10/11 | offen/teils überholt: Feld kann entfernt oder angeschlossen werden | waffen-verkabelung.md §3b; abgleich-dubletten-animationen §A | Technik |
| ENG-9 | Raritäts-Gewichte doppelt: `RARITY_WEIGHTS` (lootSystem) und Default-Parameter in generierter `weapons.js`; Entscheidung Default entfernen oder erzwingen | ungeprüft (tests/rarity-weights.test.js prüft Abwesenheit des Defaults für `pickWeaponForRarity`) | audit-code.md | Technik |
| ENG-10 | `sourceRarity` ist Doppelspur zu `rarity` (150/150 identisch) bzw. laut Waffenaudit weicht `rarity` bei 106 von 150 von `powerTier` ab; Vorschlag: streichen/ableiten | offen/Entscheidung | audit-selbst.md Befund 4; audit-waffen-2026-10-28 E4.2 | Spiel |
| ENG-11 | `balance-report`: Ursachentext nennt weiter pauschal drei Ursachen inkl. "Platzhalter ohne Designwert"; Ergänzung "Wirkung fehlt trotz Werten" fehlt | ungeprüft | audit-selbst.md Befund 5 | QA |
| ENG-12 | `src/client/renderer.js` ist in `node --test` nicht ladbar (Vite-`import.meta.glob`); braucht Vitest-Läufer oder Logik-Auszug in eigene Module | offen/Architekturvorschlag | audit-selbst.md Befund 3 | QA |
| GP-1 | Waffenbalance-Entscheidungen (alle "braucht Entscheidung Auftraggeber", nicht umgesetzt): (1) `homing*5` im powerScore (Superschaf/Phönixschlag fälschlich legendary; Versionsmarke für Replays nötig), (2) Waffen ohne Schaden = common (Nutzwert fehlt), (3) Zünderwaffen unter 0,5 Verhältnis (Messverfahren klären, dann Schaden/Radius), (4) Kategorien nach Wirkung ordnen (utility/tech/elemental), (5) Kaktusbombe Gift-Art, (6) Handgranate Radius 0 vs Art, (7) Allsehendes Auge ohne Wirkung (`isRevealed` hat keinen Leser außerhalb der Definition), (8) Klassen-/Archetypnamen deutsch beschriften | offen/Entscheidung | audit-waffen-2026-10-28.md E3/E4/F2 | Spiel |
| GP-2 | Weitere ausdrücklich nicht umgesetzte Waffenpunkte: Strahl vs Projektil für Luftangriff/Meteorregen/Höllenkanone, Spruchrolle delivery, Astralkugel/Gedankensturm Abklingzeit 3->2, Portale (zusammenführen/unterscheiden), Giftwolke/Tentakelgift/Flammenwerfer Deckel, Energiefaust/Flammenklinge Rückstoß-Strahl, Bohrkopfrakete->DRILL, Handgranate bounces 2->0, Zünder im Motor +15 %, Himmels-/Flankenschlag-Doppeltreffer, Schadenswerte (Flammenwerfer, Plasmagewehr) | offen/Entscheidung | audit-waffen-2026-10-28.md F2 | Spiel |
| GP-3 | Waffen-Dubletten: Staffelung in Fassung 10/11 umgesetzt; offen bleibt: Nahkämpfer mit identischen Flugwerten, aber schwächere Schwesterwaffe (Piratenhaken/Hakenklinge, Mehrzweckmesser/Kampfmesser, Rapier/Taschenmesser), Eisschlag friert in Schadensfassung 2 nicht ein, Ananasbombe vs Splittergranate; Anzeige der Fassung-10-Werte im Waffenmenü | ungeprüft (abgleich vom 10-29 ist durch Fassung 10/11 teils überholt) | abgleich-dubletten-animationen-2026-10-29.md §A; audit-waffen Fassung 10 | Spiel |
| GP-4 | Balance Median STK 37 bei 200 HP/854 px (Mehrdistanz 10): Designentscheidung (Startdistanz/HP/Schaden) mit Sweep-Daten, 37 Waffen nur nah wirksam, 36 mit Selbstwirkung (Selbstschaden-Cap prüfen); Gegenprobe `npm run check:time` | offen/Entscheidung (Zahlen vom 10-01, danach Fassungen 9-11 und MAHL-1 geändert; nicht neu gemessen) | abnahme-balance-2026-10-01.md §6; audit-userflow B1 | Spiel |
| GP-5 | Scout-Anhebung (power 0,85, health 0,95, Klassenfassung 2) nur rechnerisch (Summe), echte Bot-/Spielmessung steht aus | offen | audit-klassen-2026-10-28.md "Offen" | Spiel |
| GP-6 | Klassen/Archetyp-Faktoren (Lebensspanne 0,56-1,56) sind im Menü unsichtbar ("nur Namen ohne Zahlen"); Kosmetik-Kader (81 Figuren) im Match nicht gezeigt | ungeprüft | audit-userflow.md Fazit/B6 | Spiel |
| GP-7 | Emotionen: im Schnitt 2,3 von 8 Zellen je Figur fehlen (v. a. Nicht-Humanoide: Schlange, Spinne, Panzer, Drohne); bessere Methode nötig (Referenzbild + eigene Zeichnung) | offen (braucht neue Bilder) | abgleich-dubletten-animationen-2026-10-29.md §C1 | Grafik |
| GP-8 | Waffen-Animationen nur parametrisch je Kategorie; Korrekturen je Waffen-ID für Dubletten fehlen; Rauchring/Flamme nur als Skript, nicht als Sheet im Repo; 19 isometrische Biom-Objekt-Sheets bewusst nicht eingebaut; keine automatische Prüfung "sieht gut aus" | offen | abgleich-dubletten-animationen-2026-10-29.md §C2-C4 | Grafik |
| UI-1 | Client online: `remoteInset` und `remoteTurnDurationMs` werden nie zurückgesetzt (kein Reset beim Matchstart im Code gefunden); zweite Online-Partie in derselben Seite kann Mahlstrom-Einschnitt/Zugzeit-Gesamtdauer der ersten tragen, Zugdauer wird nur aus Maximum der Restwerte geraten | offen (grep: nur Zuweisungen bei :1751/:1856/:2391) | audit-ui-spielersicht.md V3/V4 | Technik |
| UI-2 | HUD-Messungen nur gerechnet, nicht am Bildschirm gemessen: sichtbare Protokollzeilen (4-5, inzwischen laut E2E >=8), Kader-Überlauf bei 30-40 Figuren; Zugzeit 20 s (4 Spieler) und weitere Presets ungeprüft | ungeprüft (E2E grosse-teams.spec deckt Teile ab laut befundregister) | audit-ui-spielersicht.md V1/V2/V5 | QA |
| UI-3 | `confirm`-Dialog (Match verlassen) blockiert Frame-Loop/friert Zugzeit-Anzeige; Keymap-Position als Layout nicht gemessen | ungeprüft (Keymap laut UX-1 nach oben verschoben) | audit-ui-ablauf.md Verdacht 1-2 | QA |
| UI-4 | Revanche startet kein neues Match (öffnet nur Menü mit Seed) bzw. Zustand `match/mode` nach Revanche nicht geleert (R fragt dann "Match verlassen?"); Entscheidung: umbenennen oder echter Neustart | ungeprüft (seedFuerRevanche existiert, Menü-Zweig main.js:486ff unverändert) | abnahme-ux-2026-10-01.md §5 #5/#6 | Spiel |
| UI-5 | Seed-Feld leer vorbelegt -> Match standardmäßig nicht reproduzierbar (bewusst so; Widerspruch zum Kernversprechen Determinismus bleibt Entscheidung) | offen (bewusst) | audit-userflow.md A1; abnahme-ux §3a | Spiel |
| UI-6 | Online-Statistik: `MatchStats` wird nur lokal gefüttert; Online-Trefferquote/Bericht ungeprüft | ungeprüft | stille-fehler-fixes.md "Was ich NICHT geprüft habe" | Technik |
| UI-7 | Online `crate_landed`: nur lokaler Zweig (bewusst stumm, Begründung im Wächter ist umzuschreiben); Empfehlung: Online-Zweig "Abgeworfene Waffe gelandet" | ungeprüft (ereignisse.js:955 nur `lokal:`) | hunter-doku-nachzug.md §4 | Technik |
| UI-8 | `karte_unerreichbar`: 0 Auslösungen in 90 Karten; welche Seeds es treffen, offen (Werkzeug `check-erreichbarkeit` vorhanden) | offen (niedrig) | analyse-ereigniszweige.md §4/§9 | QA |
| QA-1 | E2E-Lücken laut UX-Abnahme (Stand 10-01, teils inzwischen durch touch-bedienung/hud-hochformat/a11y-Specs gedeckt): 200 %-Zoom-Test, Fokusfallen in Overlays, Screenreader-Zugänglichkeit des Glücksrads, aria-Meldung für Ladefortschritt, aria-live-Doppelansagen (Rad + Log), Erstkontakt-/Onboarding-E2E, Kontrastmessung als Test | ungeprüft | abnahme-ux-2026-10-01.md §1b L5-L9, §4 Pkt 1-6 | QA |
| QA-2 | Nie gehört/gesehen: Klang online/lokal nur über Mischer-Zähler belegt (kein Hörtest), Ladebalken nicht bildlich geprüft, Wasser-Flackern/Effekt-Alterung auf 144 Hz wurden durch Fixes ersetzt, aber nicht visuell bestätigt, Gegner hört Schuss online nicht per zweitem Browser gemessen | offen (manuelle Prüfung nötig) | spielgefuehl-fixes.md "Was ich NICHT geprüft habe" 2-4; audit-2026-10-09/00-claude-rest §6 | QA |
| QA-3 | Black-Box-Messlauf auf Produktionsbau (`npm run build` + preview, nicht Dev-Server mit HMR) für "30 s Wartezeit beim Matchstart" und Anzeige-vs-Simulation-Abweichungen; Beobachtungen des Black-Box-Agenten blieben unbelegt | offen | audit-blackbox.md | QA |
| QA-4 | Gegenprüfung durch fremde Modelle ausweiten: Engine/Physik/Terrain (Bericht des abgebrochenen Laufs verloren), Prompt-Varianten, weitere Anbieter; Fremdbefunde nur nach Verifikation übernehmen. Engine-Subagent-Spur (ballistics, shooting, characterSystem Fallphysik, prng, network.js Latenz, persistence) unbearbeitet | offen | audit-2026-10-09/02-gegenpruefung.md §6; 00-claude-rest §4/§6 | QA |
| QA-5 | Frame-Allokationen im Renderer (createImageData Wasser, Gradients je Projektil/Rauch/Blitz, Regex `parseCss` je Umgebungselement/Frame, `.find` je Entität, `currentState()` Spread, HUD ohne Vorher-Vergleich, kein globaler Partikeldeckel/Pooling), Accumulator-Wachstum bei 140-250-ms-Frames | ungeprüft (nur Lesebefund des abgebrochenen Subagenten; nicht gemessen) | audit-2026-10-09/00-claude-rest §2.3-2.5 | Technik |
| QA-6 | Rendering auf CPU-Hardware: ~50 ms/Frame (Intel HD 3000: 50,1 ms, Faktor 3 über 16,7-ms-Budget), 96 % native Rasterarbeit; Terrain-Backen CPU 2,5-2,7 s; echter Messlauf auf Zielhardware fehlt (entspricht Z579/P2 in offene-punkte.md) | blockiert (echte Hardware) | optimierung-bericht §7 #8; abnahme-optimierung §8 | Betrieb |
| BLD-1 | Auslieferung: 80 Kulissen-JPG (11,3 MB) noch nicht als WebP (-27 %, ca. -3 MB); Sprites/Biom-Objekte sind bereits WebP (501 .webp im Baum); Debug-API + Profil lazy splitten (~2,6 kB gzip); Bundle-Größen-Gate fehlt | offen (Sourcemap bereits `sourcemap: false`, erledigt) | abnahme-optimierung-2026-10-01 §6 #1/#6/#7 | Technik |
| BLD-2 | CI fährt `validate`, `smoke:fast`, `balance` nicht (nur lint, checks, test, build, perf, e2e) | ungeprüft (ci.yml gelesen) | hunter-tools.md H1-11 | QA |
| BLD-3 | Werkzeug-Ordnung: `scripts/build_weapon_metadata.cjs` (und .js, Letzteres im Baum nicht mehr vorhanden) ohne Referenz; 15 Skriptdateien ohne npm-Skript, README dokumentiert nur 3 von 51; 0 von 42 .mjs ausführbar trotz Shebang; Kopf-Kommentare `checks.mjs`/`ci.yml` sagen "19 Prüfwerkzeuge" (Batterie hat 21); statische Sonden sehen nur `src/` (tote Skripte unsichtbar); parallele Hunter-Probe-.mjs machen `npm run lint` rot (keine Isolierung) | offen/teils ungeprüft (Zahl 19 in scripts/checks.mjs und ci.yml bestätigt; build_weapon_metadata.cjs bestätigt) | hunter-tools.md H1-03..H1-10 | QA |
| BLD-4 | Ordnung: `.aiderignore` und `.roo/` weiter ungetrackt/nicht in `.gitignore` (AGENTS.md/CONTRIBUTING/ARCHITECTURE sind inzwischen gefüllt, "kein TypeScript") | ungeprüft (nur .gitignore auf aider/roo gegreppt: kein Treffer) | release-readiness-audit-2026-10-01.md U-1 | QA |
| TER-1 | Hitscan-Waffen mit `terrainDamage` (3 Stück) graben nicht; Hitscan zerstört kein Terrain | ungeprüft (match.js nicht gefunden per grep "hitscan") | hunter-terrain.md Befund G | Spiel |
| TER-2 | `pruefeSpielbarkeit`-Regel "zu nadelig" war toter Code (`k.width` fehlt -> NaN) | ungeprüft (terrainGen3 wurde seitdem umgebaut: Notbremse 0,25 erwähnt) | hunter-terrain.md Befund F | Technik |
| TER-3 | Kleinere Doku-/Ordnungspunkte: Materialverteilung 38,5 % Sonderboden vs Kommentar "FUNDSTÜCK" (I), `SYSTEM_PRIORITIES.TERRAIN/WEAPON/EFFECTS` ohne registriertes System (J, init.js:20-22 bestätigt noch vorhanden), `collisionMask.js`-Kopf "bis 32xN" (K), match.js-Kommentar "teams 2 bis 4" vs Lobby 2-8 (L); Körpermaße in characterSystem sind inzwischen aus config/player importiert (H erledigt) | offen/teils ungeprüft (J bestätigt offen) | hunter-terrain.md Befund I-L | Technik |


## 3. Grafik, Waffen, Terrain, Spielgefühl, Strategie — aus Audits 2026-10-30 und Recherchen (Gruppe C)

### Grafik: Sprites

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-01 | Figurblätter neu erzeugen: von 324 Blättern (81 Figuren x walk/aktion/zustand/emotion) haben 84 Note 3 (neu erzeugen, an 39 Figuren), 147 Note 2 (brauchbar mit Makel), 93 Note 1. Pro Blatt: walk 23/16/42 (N3/N2/N1), aktion 16/39/26, zustand 25/56/0, emotion 20/36/25. Dateibestand lückenlos (648 + 9 Effekt-Sheets). Häufigste Mängel: Wasser eingebacken im Zustandsblatt (74 von 81), Figur wechselt im Blatt, senkrecht abgeschnittene Zellen (pirates/21, datacult/22, beasts/10, xeno/21), zerfaserte Silhouetten (SPR-1/2/3/7), Gitterlinie sichtbar (SPR-5: shinobi/11 aktion, undead/10 aktion, xeno/12 walk, beasts/20 walk), Waffen in Zustandsblättern, Hintergrundreste. Reihenfolge: zuerst 16 Figuren mit 3-4 Note-3-Blättern (u.a. datacult/02,11,20,21,22, machina/11, pixel/10, shinobi/11, beasts/01,02,12, undead/00,10), Vorlage in `characters-side` vorher prüfen; danach `schneide.py`, `streifen-entfernen.py`, `sprite-sheets-klassifizieren.py` bzw. `emotion-pruefen.py`, Blatt erneut ansehen. Detailtabelle (324 Zeilen) nicht übernommen. | offen | docs/audits/sprites-2026-10-30.md | Grafik |
| N-02 | Stillbilder nachziehen: `charactersheets/datacult/22_ethereo.png` (Vorderansicht ist andere Figur, Note 3); `machina/11_heavy-battery-moerser-bot` alle vier Stillbilder (Platzhalter-Quadrat am Rohr, Note 2); 4 Vorlagen `characters-side` weichen von HD/characters ab (undead/12, 20, 21, 22; Sheets folgen der Vorlage): Entscheidung welche Fassung gilt | offen | docs/audits/sprites-2026-10-30.md | Grafik |
| N-03 | Emotionen für Figuren mit höchstens 3 gültigen Zellen neu erzeugen (datacult/11: 1, machina/11: 1, machina/12: 2, shinobi/11: 2, shinobi/12: 3); übrige 76 haben mindestens 4. Besseres Verfahren für Nicht-Humanoide nötig (Referenzbild plus eigene Zeichnung statt nur Prompt); im Schnitt fehlen 2,3 von 8 Zellen je Figur | offen | docs/emotionen-schwache-figuren-2026-10-29.md, docs/abgleich-dubletten-animationen-2026-10-29.md (C.1) | Grafik |
| N-04 | Sprite-Prüfung ohne Abdeckung: Noten sind Sichtungsurteile (Walk-Zyklen aus Standbildern, Stillbilder mit 200 px); nicht geprüft: Stillbilder in Spielszenen, Manifest-Rollen (`gehen/rollen/gueltig`) gegen Blätter, Aktion-/Zustandsblätter nicht automatisch auf Grundlinie | offen | docs/audits/sprites-2026-10-30.md | QA |
| N-05 | Effekt-Sheets glut.webp, leuchtgeschosse.webp, muendung.webp (Frame 4 am Zellrand angeschnitten) Note 2; Wirkung von glut visuell prüfen | offen (klein) | docs/audits/sprites-2026-10-30.md | Grafik |

### Grafik/Spiel: Waffenoptik (Prio 1-8 der Quelle)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-06 | Name/Bild-Brüche klären (Auftraggeber entscheidet Name oder Bild): pa_032 Raketenrucksack (Bild Krallenhandschuh), pa_109 Giftbaum (Bild Gleitschirm), pa_114 Gleitschirm = Dublette zu pa_112 Düsenrucksack (braucht eigenes Bild), pa_056 Präzisionsgewehr = gleiche Waffe wie pa_040, pa_034 Zauberbolzen, pa_035 Energieball, pa_036 Raketenhandschuh, pa_084 Glutelixier (Flasche nicht glutrot), vier Faust-Motive (pa_031/120/002/035) schwer trennbar, pa_013/014 Messer unorientiert. pa_127 Teleportplattform ist Absicht | offen, Entscheidung Auftraggeber (Prio 1, hoher Nutzen) | docs/audits/waffen-optik-2026-10-30.md | Grafik/Spiel |
| N-07 | Waffenabhängiges Mündungsfeuer: Variante heute nach `entityId` (Figur), Größe nur nach Figurenskala; soll nach Waffe/Kategorie, Größe `blitzGroesse`, Farbe `flashColor` (`effektSheets.zeichneMuendung`, `renderer.js` ca. Z. 1378). Aufwand S, kein neues Bild. Deckt sich mit ANIMATION_DESIGN Punkt 2 "Weapon-Specific Muzzle Effects" | offen (Prio 2) | docs/audits/waffen-optik-2026-10-30.md, ANIMATION_DESIGN.md | Grafik |
| N-08 | Einschlag nach Schadensart und Waffe (Eis, Gift, Wasser, Feuer, Magie) statt nur nach Radius; Kandidaten ungenutzt: `sheet-ringe-blasen-farben`, `sheet-wirbel-gruen-pink` (laut grep ungenutzt); Rauchring ist farblos weiß. Deckt sich mit ANIMATION_DESIGN Punkt 1/3 (Impact Sparks, Surface-Specific, Dust Kicks, Water Splashes, Debris) | offen (Prio 3, Aufwand M) | docs/audits/waffen-optik-2026-10-30.md, ANIMATION_DESIGN.md | Grafik |
| N-09 | Geschosse je Familie eigene 32 auf 64 px Zelle: zauber-Orbs 19 gleich, Rakete 7 Waffen, Kugel 6, Granate 3 (pa_039/043/066), Feuer 5, Gift 3; pa_148 Feuerschild Orb blau statt orange; verpixelt: pa_053, 046, 020, 011; Quelle `assets/weapons/source/*.PNG` (1024 px) höher auflösen | offen (Prio 4) | docs/audits/waffen-optik-2026-10-30.md | Grafik |
| N-10 | Eigene Schussfamilien statt 22 Kombinationen für 150 Waffen (z.B. Nahkampf stoßen/schneiden/schlagen: 21 identisch; Magie Ring/Funke je Element); `KORREKTUREN` für ca. 40 weitere Waffen (nur 25 haben Einzelkorrektur). Deckt sich mit abgleich C.2/(b) "Waffen-Korrekturen je ID für die Dubletten" | offen (Prio 5) | docs/audits/waffen-optik-2026-10-30.md, docs/abgleich-dubletten-animationen-2026-10-29.md | Grafik |
| N-11 | Hitscan-Strahlen je Art (Laser, Blitz, Wasser, Eis) statt einer Linie in `flashColor` (54 Waffen) | offen (Prio 6) | docs/audits/waffen-optik-2026-10-30.md | Grafik |
| N-12 | 26 Waffen-Anim-Sheets (`weapon-sprites/anim/*.webp`) sind nirgends eingebunden und überwiegend unbrauchbar (falsches Motiv, Standbild, springende Frames; höchstens pa_038, pa_135, pa_142 denkbar). Entscheidung: nicht einbauen, nur pa_038/pa_135 prüfen, Rest neu erzeugen (Zellbild als Bildbedingung) oder prozedural lassen | offen (Prio 7, Aufwand L, Risiko hoch) | docs/audits/waffen-optik-2026-10-30.md | Grafik |
| N-13 | Test, dass `GESCHOSS_ART`-Zellen nicht doppelt belegt sind und Sheet-Frames sich unterscheiden | offen (Prio 8, Aufwand S) | docs/audits/waffen-optik-2026-10-30.md | QA |
| N-14 | Sichtprüfung der Waffenoptik im laufenden Spiel steht aus (`node scripts/waffen-screenshots.mjs`, `node scripts/waffen-pruefbogen.mjs`, nicht ausgeführt); Projektdateien `PA Sprite Sheets/*`, `IMG_9329/9330/9333/9335` nicht gelesen, Verwertbarkeit ungeprüft | offen | docs/audits/waffen-optik-2026-10-30.md | QA |
| N-15 | Waffen-Animation Rest aus ANIMATION_DESIGN: Trails für langsame Geschosse, Lade-/Überhitzungsanimationen, Minen-Platzierung, Schild-Visuals, Laser-Dauerstrahl, Kill-Feed-/Waffenwahl-/Low-Ammo-Animationen im HUD, sanfte Turret-Rotation, Menü-Übergänge, Kamera-Easing, kritische-Treffer-Anzeige, Screenshake nach Kaliber | Vorschlag, Status ungeprüft (Doc ist ein Wunschkatalog, viele Teile evtl. inzwischen vorhanden: gefuehl.js, kameraRegie.js) | ANIMATION_DESIGN.md | Grafik |

### Spiel: Waffen-Balance und Dubletten

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-16 | Waffen-Dubletten entscheiden (nur Spielwerte, wäre Waffenfassung 10): (1) bewusst lassen und durch Zahlen unterscheiden, (2) zusammenführen, (3) nur Fehlzuordnungen in Texten beheben. Vorschlag der Quelle: Variante 1 für Verstärkung x1,5 (4 Waffen), Zufall (4), Versetzen 60 px (4); Variante 3 für Texte. Konkret: flight (Raketenrucksack/Düsenrucksack/Gleitschirm, Gleitschirm `effectMagnitude` ungelesen), Dimensionsriss schlechter als Sprung (`effectMagnitude` ungelesen), Eisschlag friert nicht ein, Eisschild nichts Eisiges, Aufdecken (`isRevealed`) ohne Leser, Ananasbombe als Strahl vs Splittergranate | Vorschlag, Entscheidung Auftraggeber offen | docs/abgleich-dubletten-animationen-2026-10-29.md | Spiel |
| N-17 | Messleiter des Balance-Reports ist grob (6 Stufen 40-650 px, 1 Schuss/4 Winkel); Waffen mit Wirkband zwischen Stufen oder jenseits 854 px könnten weiter als wirkungslos gelten; Werkzeugfehler "43 Waffen ohne Wirkung" ist entschärft (alle 43 wirken), nicht ausgerottet | offen (kleiner Rest), Status ungeprüft | docs/balance-messgrenze.md, docs/10-balance-tests.md | QA |
| N-18 | 36 selbstwirksame Waffen (`special`/moveset): dokumentieren, was sie bewirken; 52 Waffen ohne Design-`damage` (Generator-Ersatzwert, Balance automatisch erzeugt); "1 von 150 Waffen wirkt nicht" (Stand skalierung/ki-im-betrieb, Messung 'balance:sweep') | offen, Status ungeprüft | docs/10-balance-tests.md, docs/skalierung.md, docs/ki-im-betrieb.md | Spiel |
| N-19 | Whitepaper-Funde: (a) Duplikat `GRAVITY = 0.32` in `match.js` vs `PROJECTILE_GRAVITY` in `ballistics.js` (Geschütz zielt still falsch bei Änderung), (b) `RARITY_IDS` vs `LOOT_DROP_RULES.rarities` doppelt, (c) offene Designfragen: Nutzen 150 vs 80 getunte Waffen, Online-Spezifika (Günther-Poops) | offen, Status ungeprüft (Whitepaper vom 2026-09-26/27, später nur Nachtrag O8) | docs/waffen-balance-whitepaper.md | Technik |
| N-20 | 10 neue Waffen vorgeschlagen (Plasma Cannon, Cryo Cannon, Solar Flare, Graviton Anchor, Neural Disruptor, Acid Sprayer, Biomass Spitter, Quantum Gauntlet, Arc Blade, Void Blade) mit neuen Mechaniken (Piercing 3, Gravity Wells, EMP-Stun, Lightning Chain, Void Corruption, Elementar-Resistenz); Katalog-Stichprobe: nicht vorhanden, Katalog hat 150 | Vorschlag, vermutlich überholt, Status ungeprüft, nie freigegeben | project_armageddon_weapons_design_v2.md | Spiel |
| N-21 | Scout hat zwar Beweglichkeit (Sprung 116,9 px), aber keinen Netto-Vorteil (verliert auf drei Achsen), `starkGegen` für Scout bleibt `null`; Klassen-Balance insgesamt als offen markiert; inerte Dimensionen (`drag`, `mass`) ohne Wirkung | offen (Balance-Entscheidung) | docs/entwurf-onboarding-sidegrades-counterplay.md | Spiel |

### Spiel/Produkt: Strategie und Features

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-22 | Progression: keine Waffen-Upgrades/Ränge/Freischaltpfad (größter Abstand zu ShellShock Live); Vorschlag Upgrade-Pfad je Waffe plus Rangliste aus Profil-Kennzahlen; höchster Hebel laut Vergleich | Vorschlag | docs/vergleich-alternativspiele-2026-10-19/vergleich.md | Spiel |
| N-23 | Solo-/Trainings-Modus mit klar gekennzeichneter Übungs-KI (keine Bot-Teams online); Rechenkern existiert (`#simulateTurretPath`, `shotPrediction.js`), offen: Stärke/Streuung des Bots (Gestaltung). Entscheidung "Sollen Bots kommen?" steht aus. Recherche-Empfehlungen (Gauss-Streuung + 3 % Aussetzer, Softmax-Zielwahl, Denkverzögerung 1-2 s, Fähigkeits-Gating, Persönlichkeit als Fehler-Signatur, Waffen-Registry mit Flags) wären die Grundlage. Hinweis: Projektstand "keine Bot-KI, Server-Bot entfernt" | Vorschlag, Entscheidung Auftraggeber offen | docs/vergleich-alternativspiele-2026-10-19/vergleich.md, docs/ki-im-betrieb.md, docs/recherche/npc-ki.md | Spiel |
| N-24 | Partiedaten speichern? Kennzahlen (`stats.js`, `achievements.js`) leben nur im Speicher und gehen beim Neustart verloren; ohne gespeicherte Daten keine Auswertung; Entscheidung welche Daten, wer sieht sie, wie lange (wie bei Konten `identity.js`) | offen, Entscheidung Auftraggeber | docs/ki-im-betrieb.md | Betrieb |
| N-25 | Fahrzeuge/betretbare Gebäude (Worms W.M.D), Level-Editor, kurze Fraktions-Kampagne mit 9 Fraktionen/81 Charakteren | Vorschlag, nachrangig/optional | docs/vergleich-alternativspiele-2026-10-19/vergleich.md | Spiel |
| N-26 | Mehr NPCs neben Günther/Cookie (Skalierung: "mehr NPCs fehlen"); Verhalten ist Inhalt, nicht Technik | Vorschlag, Status ungeprüft | docs/skalierung.md, docs/recherche/npc-ki.md | Spiel |
| N-27 | Tiere-Balance: Messwerkzeug `npm run balance:tiere` vorhanden, Fassung 3 gemessen (0 Tiertode in 360 Partien); offen nur Nachmessung nach künftigen Änderungen, nichts als Todo benannt | Status ungeprüft (kein offener Punkt in Quelle) | docs/tiere-balance.md | QA |

### Spiel/Grafik/Audio: Terrain, Biome, Spielgefühl, Klang (Audit 2026-10-30)

| ID | Thema | Status | Quelle | Bereich |
|---|---|---|---|---|
| N-28 | Nähte beheben für `moos`, `rostmetall`, `alienharz`, `schwefelkruste`, `firn` (neu erzeugen oder Offset-Blend) plus Naht-Test als Skript (Kantenverhältnis); Aufwand S, kein Determinismus-Risiko (Audit-Maßnahme 1) | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Grafik |
| N-29 | Unterscheidbarkeit der Gelände je Biom: Kristall-Violett/Grau-Fels nur wo Leitmaterial; je Biom 1 dominante Deckfarbe plus 1 Kontrastader; Test erst als Kontaktbogen (3 Seeds/Biom). Braucht Marke `config.gelaende` 7 (stoffHash ändert sich), Freigabe nötig (Audit-Maßnahme 2, Nutzen hoch, Aufwand M) | offen, Freigabe nötig | docs/audits/terrain-spielgefuehl-2026-10-30.md | Spiel/Grafik |
| N-30 | Material-Varianten nur Client (Variantensystem): je Stoff 1..k Textur-Alternativen plus Farbverschiebung/Maßstab/Spiegelung, Wahl aus festem Hash (Seed, Stoff-Id, Zellblock), kein Eintrag in Maske/Hash; Test gleicher Seed = gleiche Wahl (Maßnahme 3). Vorher Definition von "567 Varianten/Ausstand" vom Auftraggeber klären: Zahl existiert nirgends im Repo, einzig realistische Lesart = kombinatorische Looks aus Biom x Stoffrolle x Achsen | offen, Definition Auftraggeber nötig | docs/audits/terrain-spielgefuehl-2026-10-30.md | Grafik |
| N-31 | Übergänge statt harter Kanten: Mischzone Deck/Kern, Lippe/Überhang an Oberkante (Gras, Schnee, Sand), unregelmäßige Kontur (Konturlinien an Materialgrenzen); größter Eindruckshebel für "organischer"; in MASTERDOTO als offen geführt (Maßnahme 4). Spec P1 verlangt Dark-Contour an Materialgrenzen | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md | Grafik |
| N-32 | Texturstil vereinheitlichen: 15 alte Foto-Texturen durch Comic-Fassung im Stil der 85 neuen ersetzen (Namen behalten), Pilz-Textur unscharf neu (Maßnahme 5) | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Grafik |
| N-33 | Biome 15 bis 20 spielbar machen: Definitionen in `biome-neu.js`/Themen, Rezepte, `backdrops-neu` einbinden (Bilder und Objekt-Sheets vorhanden, keine Spieldefinition, 0 Code-Verweise); Menü/Seed-Wahrscheinlichkeit Entscheidung Auftraggeber; neue Fassung `GELAENDE_*` mit Marke zwingend (Maßnahme 6, Aufwand L). Spiel hat 14 wählbare Sonderbiome von 20 SSOT-Biomen | offen, Freigabe nötig | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/biome-manifest.md | Spiel |
| N-34 | Ungenutzte Bestände klären: 73 von 126 Stoffen in keinem Rezept, `biom-objekte` (isometrisch, passt nicht zur Seitenansicht, 1/5 Platzhalter), `terrain-vorlagen`, 3 ungenutzte Texturen (`hecke`, `kies`, `asche`); verdrahten oder als Referenz kennzeichnen, keine Löschung ohne Freigabe (Maßnahme 7). `GPU_STOFFE = min(126, 32)`: GPU-Pfad hat nur 32 Stofffarben | offen | docs/audits/terrain-spielgefuehl-2026-10-30.md | Technik/Grafik |
| N-35 | Kulissen: Stil je Biom vereinheitlichen (Noir, Foto, Cartoon gemischt), `dunkel`-Bänder aufhellen, Kammformen der prozeduralen Kulisse biomgerecht (keine Palmen in Eiswüste); `backdrops-neu` (48 Dateien) nicht eingebunden (Maßnahme 8). Ideen aus background_elements_design: `fog_sheets`, `light_pillars`, Parallax-Gebirge (`distant_range`), Wasser `foam_lines`/`oil_slick`, dynamische Himmelsfarbe (aurora/plasma_storm/toxic_noon) | offen / Vorschlag (background_elements: nicht umgesetzt, per grep) | docs/audits/terrain-spielgefuehl-2026-10-30.md, docs/background_elements_design.md | Grafik |
| N-36 | Vergleichswerkzeug: Skript, das je Biom N Seeds rendert und einen Kontaktbogen schreibt (Grundlage jeder Optik-Abnahme; Reihenfolge der Quelle: zuerst 9, 1, 4, 3, 5, danach 2 und 6) | offen (Maßnahme 9, Aufwand S, Nutzen hoch) | docs/audits/terrain-spielgefuehl-2026-10-30.md | QA |
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
| N-44 | HUD-Vorrang: die fünf Aufrufstellen in `src/client/main.js` müssen den Ton (Ablehnungsbegründung) setzen, danach Quelltext-Wächter, dass keine Ablehnung mehr mit Vorgabeton geschrieben wird; Doku-Zähler README (Testdateizahl) nachziehen | offen, Status ungeprüft (Stand 2026-09-27) | docs/hud-vorrang.md | Technik |
| N-45 | Doku-Nachzug laut sprung-regel §6: veraltete Behauptungen "zwei Sprünge je Zug" in README:150, MASTERDOTO:2768, hunter-e2e-luecke, auftraege/online-sprung-und-abwurf; Regel "gedrosselt = Anzeige" in ereignis-info-gehalt; Testzahlen README/MASTERDOTO | offen, Status ungeprüft (Stand 2026-09-27) | docs/sprung-regel.md | Betrieb |
| N-46 | match.js-Zerlegung: Fund 1 des Duplikat-Berichts (`integrateStep` aus `shared/ballistics.js` statt Duplikat; würde `vy *= drag` entfernen und `turret-ballistics.test.js:276` rot machen) und Fund 5 (zeichengleicher Ausdruck zweimal in `match.js`, durch Wächtertest festgehalten) blieben offen; `WATER_SCALE` und `#simulateTurretPath` bewusst im Match | offen, Status ungeprüft | docs/zerlegung-turret.md, docs/zerlegung-match.md | Technik |
| N-47 | Skalierung: Teamgröße über 3 öffnen (erledigt: MAX_PLAYERS_PER_TEAM = 6), 4K in `MAP_SIZES` eintragen + Kamera mitskalieren, Konten und TLS/Reverse-Proxy (`docs/betrieb.md`), Sound-Prüfung; Snapshot-Strides optional sparen (`waterLevel`, `frozenTurns` nur bei Bedarf), Delta-Encoding spart nichts (`dirty` wird im Client nicht gelesen); Hetzner CX32 trägt rund 68 gleichzeitige 8-Spieler-Matches (Messung 2026-09-17); offene Design-Fragen: Übersicht bei 8 Figuren, Kamera bei 4K | Status ungeprüft (Stand 2026-09-17, teils überholt) | docs/skalierung.md | Betrieb |
| N-48 | Batterie `npm run test:e2e` nur seriell/allein fahren (Last macht Bildzeit-Specs rot, `profiling`); im Vergleichslauf 2026-10-19: 2 rote (online-sprung-abwurf Timeout-Flake, profiling 60-Hz-Budget 0,90 ms Aufschlag) einzeln grün, 2 übersprungen | Hinweis / Flake-Risiko, Status ungeprüft | docs/10-balance-tests.md, docs/vergleich-alternativspiele-2026-10-19/vergleich.md | QA |
| N-49 | Sprite-Prüfwerkzeug `check-sprites` (JSON-Stand 2026-10-25): Befunde zu zerfaserten Zellen (u.a. datacult/11 zustand) noch in `docs/sprite-pruefung.json`; Deckung Waffen-Bilder Mittel 42,59 | Daten, bildet N-01 ab | docs/sprite-pruefung.json | QA |
| N-50 | Recherche-Hinweise nicht umgesetzt/offen: `openartillery.net` als nächster Rechercheschritt (nur GitHub-Topic gesehen); Reddit-Threads nicht lesbar; Sonniss-GDC-Bundle sichten (Lizenz geprüft, kein KI-Training, kein Weitervertrieb); Kenney CC0 / OpenGameArt nur als Ergänzung; ZzFX/Voice-Kette; Wasser-Heightmap und Partikel-Pool (Phase 3) | Vorschlag, Status ungeprüft (Sound laufzeit-synthetisiert, `klangSynth.js`) | docs/recherche/npc-ki.md, docs/recherche/sound-und-juice.md | Audio/Technik |

## 4. Stand-Korrekturen (nach den Berichten erledigt oder entschieden)

- Erledigt 2026-10-30: Fass-Abwurf (Bodenobjektfassung 4), Biome 15–20 spielbar (Gelände-Fassung 7), Together-Zugang (gpt-image-2, Referenzbild per öffentlicher raw-URL, User-Agent nötig).
- In Arbeit: Neuerzeugung der 64 Sprite-Blätter ohne Emotion (Rohbilder in /tmp/pa-roh, danach schneide.py, streifen-entfernen.py, sprite-sheets-klassifizieren.py, Sichtprüfung), danach 20 Emotion-Blätter.
- Offen und beschlossen: 5–7 Varianten je Kachel/Stoff (Client), Neon-Optik, Biom-Objekte in Seitenansicht, Objekte/Trigger der Biome 15–20 (BS-6/BS-7).
- Wartet auf Auftraggeber: Hetzner-API-Token (Z246), Seil-Konstanten, Klärung der Namens-/Bildbrüche pa_032, pa_109, pa_114, pa_056.
- Bekannt: `check:biome` ist bei einzelnen Seeds (951031, 1080350, 1224883) rot, weil weniger als 50 % der trockenen Kistenplätze zu Fuß erreichbar sind; Ursache im Kartengenerator der Fassung 6, nicht in den neuen Biomen.
- Bekannt: Drei Texturen im Arbeitsbaum (`stoff-texturen-neu/kerkergewoelbe|risszone|wurzeln.webp`) sind unversioniert verändert und zu groß für `tests/stoff-texturen.test.js`; Herkunft unklar, Auftraggeber entscheidet.

## 5. Referenzdokumente, die bleiben (kein Bericht, keine Liste)

Spezifikationen und Betrieb: `AGENTS.md`, `README.md`, `MASTERDOTO.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CREDITS.md`, `deploy/README.md`, `docs/betrieb.md`, `docs/betrieb-INSTANZ.md`, `docs/probe-knoten-und-hardware.md` (Befehlsblatt Z246/Z579), `docs/testgrenzen.md`, `docs/auftraege/minen-faesser.md`, `docs/auftraege/seil.md` (belegte Worms-Fakten), Biom-Dokus (`docs/biome/*`, `biome-ssot`, `biome-manifest`, `biome-uebersicht`, `biome-20`), Terrain-/Material-Matrizen, `docs/recherche/*`, `docs/design-vorlagen/*`, `docs/balance-auslese/*`, `docs/superpowers/specs/*`, `docs/zerlegung-match.md`, `docs/zerlegung-turret.md`, `docs/ereignis-info-gehalt.md`, `docs/ereigniskanal-filter.md`, Entwurf Onboarding/Sidegrades, Tier-Balance, Skalierung, Fallschaden-Bremse, Sprung-Regel, HUD-Vorrang, `ARCHIVED.md`, `docs/audit-2026-10-09/prompt-01-audit.md` (wiederverwendbarer Audit-Prompt).
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
