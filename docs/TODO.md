# ProjectArmageddon — die einzige Aufgabenliste

Stand: 2026-11-23, `main` nach `d3f6f4c`. **Dies ist die einzige Arbeits- und Planliste.** Sie ersetzt die
alte `docs/TODO.md`, `docs/plan-produktion.md`, `docs/letzter-halt-plan.md`, die Übergaben
`docs/UEBERGABE-2026-11-12.md`, `docs/UEBERGABE-2026-11-18.md`, `docs/auftraege/UEBERGABE-2026-11-10.md`,
`docs/TODO-report.json` und `bgworker-todo.json`. Deren Inhalt steht in Git (`git log --all -- <Datei>`).

Regeln für diese Liste: Neue Punkte nur hier. Erledigtes wird gelöscht (Beleg im Commit). Nichts als erledigt
führen, was nicht nachweisbar lief. Bild und Klang sind maschinell nicht abnehmbar: Sie stehen in Abschnitt 8,
bis der Auftraggeber sie abgenommen hat. Arbeitsregeln: `AGENTS.md` (Versionsmarken, Prüfen, Pakete einzeln
mergen, nichts mieten). Fachliche Aufträge und Spezifikationen bleiben eigene Dokumente
(`docs/auftraege/*.md`, `docs/deploy-plan.md` als Betriebsanleitung, Berichte unter `docs/`), sind aber
**keine** Listen: Was davon offen ist, steht hier.

## 0. Stand

| Bereich | Stand |
|---|---|
| Fassungen (Standard neuer Partien) | Gelände 16 (`GELAENDE_START`), Waffen 22 (`WAFFEN_WURF`), Klassen `KLASSEN_NEU`, Seil 3, Biomregeln 9 (Strömung, Schwerkraft, Gefahrenwasser, Wasserlauf, Treiben, Sturzflut, Treibsand, Bodenwirkung), Bodenobjekte 7 |
| Zeilenbudgets | `match.js` 2772/2790, `main.js` 3707, `renderer.js` 2218 (`tests/zeilenbudget.test.js`) |
| CI | grün auf `730f6bb` (2026-11-23, alle vier Browser-Teile, Lint/Tests/Build) |
| Abhängigkeiten | `npm audit`: 0 Schwachstellen (2026-11-23, vite 8.3.8, eslint 10.15) |
| Spieltest mit Menschen (QV-4) | nicht erfolgt |

## 1. Sofort: Fehler und rote Prüfungen

Nichts offen (2026-11-23: CI grün, `visuell.spec` grün, MERGE-4/6/10, Audit und Syntax-Tor erledigt).

## 2. Spiel: nächste Bauschritte (Reihenfolge)

| ID | Arbeit | Abnahme / Hinweis |
|---|---|---|
| 2.2 KARTE-WASSER | Seen in Höhlen und auf Inseln, kleine Wasserfälle (Treibsand wirkt seit Biomregel-Fassung 8) | Geländefassung mit Marke; Matchstart-Zeit (QV-7) und `check:erreichbarkeit` bleiben im Rahmen |
| 2.3 KARTE-QUALITÄT | Durchgangstor steht (Fassung 15: 0 von 500 Menü-Seeds mit Boden hinter zu dünnem Gang, vorher 30; kein Stand am oberen Rand). Offen: runde Karten interessanter (Planet: verzweigte Tunnel, hohler Kern); Rest auf groß 24:9 Seed 7 (Ruinenkammer hinter einem Riss, 176 px, das Tor misst auf halber Auflösung 90); unerreichbar 8 von 500 (vorher 6) | `node scripts/messung-kartenqualitaet.mjs --vergleich=14` |
| 2.6 QV-6-C/D | C Bodenwirkung: Bremsen steht (Biomregel 9, halb wirksam, höchstens etwa 18 % langsamer); offen: Glätte auf Eis (`reibung`, braucht Schwung beim Gehen), Sumpf. D Splitter/Kettenreaktion (Kristalle, Burg, Dimensionsriss) | Fassung mit Marke, Goldwerte |
| 2.7 MENUE-EINFACH | Ein-Klick-Start: ein großer „Spielen“-Knopf, Karte/Art/Seed/Wetter zufällig; Biomwahl (20) und Größe hinter einem Knopf; Wetterwahl entfällt | Partie mit ≤ 2 Klicks (E2E) |
| 2.8 ZUGTEMPO | Wartezeiten zwischen Zügen messen (Kamerafahrt, Nachlauf, Zugpause) und auf das Nötige kürzen (zuerst nur Client-Timing) | Messung vorher/nachher |
| 2.9 JUICE | Trefferstopp (wenige Bilder, nur Client), gestaffelte Schadenszahlen, kurze Kill-Kamera, Kettenzähler deutlicher | Sichtabnahme (8) |
| 2.10 PORTAL-1 | Seltene Portale mit Gegenstück-Pflicht (Waffe oder zwei Nutzer), Ziel taktisch günstig oder Munitionsort: erst spezifizieren, dann bauen | Spezifikation, danach Fassung mit Marke |
| 2.11 ONBOARDING | 60-Sekunden-Einstieg (Zielen, Kraft, Waffe, Zündzeit Z) als überspringbare Einblendungen in der ersten Partie | E2E Erstkontakt |
| 2.12 DICHTE-RUND | Startplätze zu dicht: Nach der Startfairness (Geländefassung 16) stehen Gegner noch in 11 von 100 1:1-Partien und 7 von 100 kleinen näher als 120 px (alle sechs Plätze auf wenigen hundert Pixeln, keine Teilung hilft); auch kleiner Rest Höhenvorteil auf klein (3 von 100). Mindestabstand beim Spawn oder runde Arten erst ab mittlerer Größe | Messung über Seeds |
| 2.13 LETZTER-HALT | Gelände-vor-Schaden-Hypothese (Konzept in Git: `docs/letzter-halt-plan.md`): Stufe 2 A/B-Test Materiallesbarkeit (2 Teams, 1 Karte, 5 Wiederholungen, Anteil Geländewege > 60 %), Stufe 3 Bruchvisualisierung und Werkzeugklang, Stufe 4 Gegenmaßnahmen statt universeller Schwachstellen, Stufe 5 Rollen-Biome; offen: Rodentia ohne Heim-Biom | erst nach Spieltest (8) |
| 2.14 FIGUREN-B-REST | Dauerhafter Grabstein in der Welt; echte Kopf-/Oberkörperrotation (Teilsprites, Renderer-Ebene) | Sichtabnahme |
| 2.15 SCHUSS-FAMILIEN | Eigene Schussbewegungen für Fernkampf (Pumpen, Spannen, Aufziehen) und Magie (Nahkampf ist gebaut); sanfte Geschütz-Drehung (Zustand trägt keine Zielrichtung); HUD-Animationen Kill-Feed, Waffenwahl, wenig Munition; Menü-Übergänge | Sichtabnahme |
| 2.16 ONLINE-KENNZAHLEN | `MatchStats` wird nur lokal gefüttert (UI-6); Asche/Basalt (`karte.ueber`) erreichen spät Beitretende nur über Ereignisse; `crate_landed` online ohne Zweig (UI-7) | Online-E2E mit zwei Browsern |
| 2.17 EXKL-TURRET | EXKL-1: exklusive Waffen je Charakter (Datenschicht steht, Einbau offen); TURRET-1: zwei Waffen mit Turm-Mechanik klären | Entscheidung festhalten, Test |

## 3. Balance (immer: messen, dann ändern, Freigabe)

| ID | Arbeit |
|---|---|
| 3.1 BIOM-WERTE | Schwerkraft 0,6–0,85, surreal 0,7–1,3, Strömung 0,5/0,35/0,5, Gefahrenwasser sind erste Ansätze; Sturzflut (Schub 1,5, 4 Teilschritte) ist nur in einer Rinne gemessen (`node scripts/messung-wasserlauf.mjs`), auf echten Karten noch nicht: `npm run balance:biome`, `node scripts/balance-rollen.mjs --stufe=standard` |
| 3.2 ROLLEN | BAL-14 Feinbalancing je Rolle mit festen Seeds; Okkultist-Vorsprung 69 % (36 Partien je Rolle, Intervall beachten) |
| 3.3 NAHKAMPF | Nahkampf-Reichweite erreicht den Startabstand mit 0 von 100 Projektilwaffen: Wurfweiten angleichen (Marke) oder Startabstände je Klasse mischen |
| 3.4 BAL-1 | maxRange-Anzeige, Scout-Bewertung (N-21: Beweglichkeit ohne Netto-Vorteil), Wurfweiten-Deckel |
| 3.5 BAL-15/17 | Browser-, Touch- und Bewegungsabnahme der Waffen (24/64/128 px, Kontrast, links/rechts); Abdeckung Karten × Fraktionen × Partien staffeln, nichts aus Stichproben behaupten |
| 3.6 HAGEL | Schaden je Partie messen (Lagenanteil 20 %, 50 % gezielte Körner), ggf. senken |
| 3.7 TIERE | N-51: Balance-Nachmessung (Code und Tests stehen) |
| 3.8 MESSGRENZE | N-17 Messleiter feiner; N-48 Flake-Risiko der Balance-Tests |

## 4. Grafik und Optik

| ID | Arbeit |
|---|---|
| 4.1 GRAFIKSTUFE-1 | `flaechenBudgetMio` im Renderer durchsetzen; Figuren immer in voller Bildschirmauflösung (Auftraggeber: Figuren bei `kolossal` „krätzig“); Ultra besser |
| 4.2 KACHELUNG | Gelände-Canvas in Kacheln ≤ 4 Mio. px: hebt die iOS-Sperre für `kolossal` auf, senkt Speicher; Verhalten von iOS-Gästen in einer `kolossal`-Lobby klären |
| 4.3 N-31 | Übergänge statt harter Kanten: Lippe/Überhang an Oberkanten, Mischzonen, Konturlinien an Materialgrenzen |
| 4.4 N-32 | Die 15 alten Foto-Texturen im Comic-Stil der übrigen 85 (Auftrag B2 in `docs/auftraege/bildagenten-2026-11-09.md`; Bildbudget vorhanden) |
| 4.5 N-35-REST | Wasser `foam_lines`/`oil_slick`, dynamische Himmelsfarbe, Stil der Foto-Kulissen (Western, Hyperreal); Hintergründe des Auftraggebers (`uploaded/`, `IMG_*`) einsetzen; Menügruppe Panoramen |
| 4.6 GELAENDE-1 | Höhlen weniger Tunnelgewirr, Inseln mit verschiedenen Umrissen, Licht an Fackeln und Lava, Nebelschichten |
| 4.7 BIOM-15-20 | Restmängel: 15 Streifen oben, 16 Facetten gitterartig, 17 Fries klein, 18 Tiefsee-Feinschliff, Fantasywald-Deko; Kristallarchipel-Grading 1,1 s → 0,4 s |
| 4.8 NAHTEN | Keramik und Metall: sichtbare Brüche, nahtlos neu |
| 4.9 SPRITES | SPR-4: Emotionsblätter der 8-Bit-pixel-Figuren sind noch die alten; `pixel/00_nullpointer-exception` nur mit Tod-Rolle; Glättung je Fraktion (`imageSmoothingEnabled`) für Pixelkunst; zwei gesperrte Walk-Zellen (`chrome-code-shifter`, `buffer-flow-swarm`) neu; Luchs-Emotionszellen |
| 4.10 LOOK-3 | Prüfbild mit gefüllter Lava gegen `ref-3-vulkanschmiede-hud` |
| 4.11 BESTÄNDE | ASSETS-1/N-34: ungenutzte Texturen (gras, lava-glut, lava-risse, hecke-kontrast), Normalmap, Intro-Video, 73 ungenutzte Stoffe, isometrische Biom-Objekte: als Referenz kennzeichnen, nichts löschen (Entscheidung 2026-11-11) |

## 5. Technik und Qualität

| ID | Arbeit |
|---|---|
| 5.1 N-43 | Wasser-Ereignisse (`damage`, `entity_in_water`, `drowning`) gebündelt statt je Takt (42 KB/s, gemessen −94 %), Drahtformat mit Marke |
| 5.2 OPT-1/OPT-7 | Bundle: Menü zuerst, Engine, Renderer und Waffenkatalog erst beim Matchstart; Geländegenerator nachladen; `dist` 117 MiB (OPT-2): größte Posten messen |
| 5.3 OPT-3 | `npm test` dauert 13–25 min: langsame Dateien in einen eigenen Lauf trennen (`test:unit` schnell) |
| 5.4 ENG-12 | `renderer.js` ist in `node --test` nicht ladbar (`import.meta.glob`): Logik in eigene Module oder Vitest |
| 5.5 QA-5 | Bild-Allokationen im Renderer (ImageData Wasser, Gradients je Geschoss, `parseCss` je Bild, `.find` je Entität, kein Partikeldeckel) messen und senken |
| 5.6 KLEIN | N-46 (`integrateStep`-Duplikat in `match.js`), ENG-6 (LootSystem je Takt, Query-Allokation), ENG-7 (Sortieren bei Registrierung), TER-2 (`pruefeSpielbarkeit` „zu nadelig“), TER-3 (Doku-/Ordnungspunkte I–L) |
| 5.7 SKALIERUNG | TG-RANG/N-47: 4K in `MAP_SIZES` mit Kamera, Strukturtests statt Wertetests; Snapshot-Strides sparen |
| 5.8 E2E-VOLLLAUF | Volle E2E-Suite (CI, vier Teile) nach jedem größeren Merge; QA-1/QA-3 (Black-Box auf Produktionsbau) |
| 5.9 G1 | Spielgefühl messen: Eingabe bis Bild, lokal und online mit Latenz |
| 5.10 ÜBERSETZUNG | (später) Englisch per Einstellung; zuerst alle Texte in eine Tabelle ziehen |

## 6. Konten, Web-Zugang, Betrieb

| ID | Arbeit |
|---|---|
| 6.1 WWW-1 | Cloudflare (kein Netlify): Einstieg gebaut und getestet (Pages Function, D1, `_headers`, `_routes.json`). Offen beim Auftraggeber: Projekt anlegen, D1 und Bindung `DB`, `nodejs_compat`, Secrets, DNS und Zertifikat für www, alte Netlify-Seite `proarmgame` und Netlify-DNS abschalten. Hashes der Umgebung als `pbkdf2$20000$` neu erzeugen. Erste Abnahme prüft: Rechenzeit der Passwortprüfung im kostenlosen Tarif, Dauer des Not-aus-Aufrufs (`docs/zugang-www.md`) |
| 6.2 KONTO-2/3 | Profil (Foto, Biografie, angepinnte Einheit) und Scoreboard-Oberfläche aus der Nutzerdatenbank; Kennzahlen Sprünge, Selbsttreffer, Schaden je Einheit und Waffe im Spiel erfassen und melden |
| 6.3 ABBILD | Hetzner-Abbild auffrischen (Spielserver mit Spieltoken-Prüfung) |
| 6.4 KNOTEN | Auf einem echten Knoten (Auftraggeber mietet, AGENTS.md §5): Firewall `deploy/firewall.nft`, Zertifikat, systemd-Units und Idle-Timer, Marker `ist-gemietet`, Belege S1–S3 und 5/6 in `docs/betrieb-INSTANZ.md`, `systemctl list-timers` als Nachweis |
| 6.5 PERSIST-1 | Eine JSON-Datei ohne Sperre: bewusst bis zur zweiten Serverinstanz |
| 6.6 Z579 | Messung `messung.html` auf iPhone und Asus-Laptop (Auftraggeber), danach Grafikstufen-Grenzen festlegen |
| 6.7 BRANCHES | 26 Remote-Branches: über den Workflow „Branches aufräumen“ die vollständig enthaltenen löschen |

## 7. Entscheidungen des Auftraggebers (gelten)

| Datum | Entscheidung |
|---|---|
| 2026-11-04 | Nur Querformat; Telefone hochkant zeigen „Bitte Gerät drehen“; Hochformat-HUD bleibt weg; ⚙-Menü für Musik, Effekte, Verlassen, Aufgeben |
| 2026-11-05 | Alles bis zur Produktionsreife; Entscheidungen trifft der Agent nach Spaß und Flow, nur Unentscheidbares geht zurück. **Es gibt keine Bots** (Mess-Skripte simulieren nur). Rangliste mit Elo; Revanche als echter Neustart; Musik „intensiv“ in der Schlussphase; Fortsetzen nach Neuladen; Tempo: eine Figur fällt nach 3–4 guten Treffern |
| 2026-11-05 | Hosting Hetzner, höchstens 1 €/h, Löschen nach 15 min ohne Spieler (Spielstand vorher außerhalb sichern); Bildbudget +10 € |
| 2026-11-11 | Versionsmarken bleiben Pflicht; Materialoptik-Shader gestrichen; „rund“ = 1:1 (Planet, runde Höhle, schwebende Insel), Auflösung bis 33 Mio. px; ungenutzte Bestände als Referenz, nichts löschen; GP-1/GP-2-Entscheidungen 8–25 (umgesetzt in Waffenfassung 21/22); Seil Fassung 3 „wie Worms“; Biome 15–20 freigegeben; Stil: alles Comic |
| 2026-11-12 | Wurffass entfällt, 150 Waffen bleiben; Wetter immer zufällig; Menü vereinfachen (2.7) |
| 2026-11-17 | Kein Netlify; Hosting des Web-Zugangs auf Cloudflare |
| 2026-11-23 | Registrierung mit E-Mail (eindeutige Namen und Adressen, Anmeldung mit Name oder E-Mail); Web-Zugang mit schwächerem Hash (PBKDF2, 20 000 Runden) statt bezahltem Cloudflare-Tarif |

## 8. Abnahmen durch den Auftraggeber (maschinell nicht möglich)

Spieltest mit Menschen (QV-4: Wasserlauf, Sturzflut/Dammbruch, Treibsand, Treiben, Strömung, Lesbarkeit der Hinweise, Windpfeil) · Sicht: Figuren
(Randlicht, Hocke, 8-Bit-pixel, Angst, Tod-Epilog-Sprüche), Waffenoptik im Flug und im Nahkampf (N-09, N-10, N-14,
N-15, GP-8), Wetter und Hagel, Kameraeffekte, Mine und Fass (MINEN-1/2), Biomobjekte (Druckkessel, Giftblüte, Sporenbovist, Runenstein), Seil am Touch-Gerät, Menü `kolossal`
am Telefon, Biome 15–20 · Hören: alle Klänge (K4, AUDIO-2, QA-2), Funkenkugel, Mine, Hagel, Titellied.

## 9. Fragen an den Auftraggeber

Keine offen (E-Mail und Hash am 2026-11-23 entschieden, Abschnitt 7).
