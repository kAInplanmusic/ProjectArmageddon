# Übergabe 2026-11-12 – offene Punkte und Regeln für den nächsten Agenten

Stand: Nachmittag 2026-11-12, `main` auf GitHub (`kAInplanmusic/ProjectArmageddon`). Der Auftraggeber schreibt Deutsch, nutzt keine Kommandozeile (alles automatisieren oder als Klick-Anleitung für iPhone/Laptop liefern) und will ehrliche Verifikation: nichts als „erledigt“ melden, was nicht nachweisbar lief.

## 1. Wichtige Regeln (nicht verhandelbar)

- `AGENTS.md` lesen: Determinismus, **Versionsmarke `config.<name>` für jede Regel-/Generatoränderung**, ältere Fassungen und alte Replays bitgleich (Goldwerte vorher/nachher vergleichen, `git archive HEAD` als Vorher-Stand).
- Zeilenbudgets: `match.js` ≤ 2790, `main.js` ≤ 4000 (zuletzt ~3979), `renderer.js` ≤ 2500 (zuletzt ~2493). Neue Client-Logik in neue Module.
- Reine Client-Optik (Wetter, Grading, Stoffoptik, Übersichtskarte) darf Engine/RNG/Hash nicht berühren.
- Testzahlen nicht von Hand pflegen: `npm run testlauf:erfassen` (nur aus nachweisbarem Lauf), `npm run check:docs -- --schreiben`; Pakete einzeln mergen (`npm run paket:stand`).
- Maschine hat 8 GB RAM: Tests nacheinander. Voller `npm test` ≈ 17–25 min, im Hintergrund. Playwright nur einzeln, 1 Worker, `PA_PORT=5190` (Port 5173 kollidiert mit liegengebliebenen Vite-Servern). SwiftShader-Läufe können „Target crashed“ melden (Speichermangel) – einzeln wiederholen.
- Git bei parallelen Agenten: nie `git add -A`, nie ganzen Index committen. Eigene Dateien über temporären Index (`GIT_INDEX_FILE`, `read-tree origin/main`, `commit-tree`) auf `origin/main` committen, vorher `git fetch`. Der Push zeigt „repository moved“ – harmlos.
- Zugangsdaten liegen privat in `~/.pa-zugang.env` und im Memory (`topics/zugangsdaten.md`); Agenten dürfen sie nutzen. Nie in Repo, Logs oder Berichte schreiben. Der Auftraggeber möchte keine Rotations-Hinweise.
- Bild-/Klangqualität ist maschinell nicht abnehmbar: immer „Sichtabnahme/Klangabnahme offen“ ausweisen.
- Stash `autostash-sicherung-rebase-2026-11-12` enthält gesicherte Web-/Konto-Änderungen eines abgebrochenen Pulls (Vergleich mit dem Arbeitsstand, bevor man ihn löscht).

## 2. Stand der Fassungen

Gelände 14 (`GELAENDE_RUND`, Standard; 13 = Brücken/Rampen/Zonenwände; Stufe `kolossal` 5760² nur 1:1), Waffen 22 (21 = Entscheidungen 8–25, 22 = Wurfmine im Bogen), Seil 3, BODENOBJEKTE_BREIT 6. Wetter (Commit 69394de, 900f7ff) und Menü `kolossal`/runde Karten sind Client/Lobby ohne Engine-Marke.

## 3. Offen – Entscheidungen des Auftraggebers

1. **Nahkampf-Reichweite:** erreicht den Startabstand mit 0 von 100 Projektilwaffen (`docs/balance-rollen-2026-11-12.md`). Gewollt? Falls nein: Wurfweiten der Klassen angleichen (Regeländerung, Versionsmarke).
2. **ASSETS-1:** Material-Texturen gras, lava-glut, lava-risse, hecke-kontrast, Normalmap und Intro-Video streichen oder behalten?
3. **Hosting:** Auftraggeber zieht auf **Cloudflare** um (ein anderer Agent). Stand unbekannt. Netlify-Umgebungsvariablen und Hetzner-Image-Auffrischung hängen davon ab. Netlify-Auto-Builds sind ausgeschaltet (`stop_builds`).
4. Annahmen noch bestätigen: eingeloggte Spieler brauchen keinen Startcode, wenn der Server läuft; Titellied ersetzt Menümusik global; Sitzung 7 Tage; Benutzername 3–20 Zeichen; Passwort ≥ 8.

## 4. Offen – Umsetzung (Reihenfolge)

1. **Kartenqualität Fassung 15** (Agent lief zuletzt): Mindestgangbreite (Fantasywald-Lichtung hat zu dünne Gänge), runde Karten interessanter (Planet langweilig: verzweigte Tunnel, hohler Kern mit Karte darin), gelobte gross/riesig nicht verschlechtern.
2. **GRAFIKSTUFE-1** (Agent lief zuletzt): `flaechenBudgetMio` im Renderer durchsetzen, Figuren-Schärfe bei `kolossal` (Auftraggeber findet Figuren „krätzig“), Ultra besser.
3. **HAGEL-1** (Agent lief zuletzt): große Hagelkörner mit 1–2 Schaden, deterministisch, nur unter freiem Himmel, Vorwarnung; Wetter ist immer zufällig.
4. **MENUE-EINFACH:** Wetterwahl entfällt; Karte standardmäßig zufällig, Knopf für Auswahl aus den 20 Biomen; Größe je Lobby frei; Kartenart und Seed immer zufällig.
5. **Hintergründe:** hochgeladene Hintergründe des Auftraggebers (Repo: `uploaded/`, `assets/backdrops*`, `docs/design-vorlagen/referenz-karten/`) in die Kulissen einsetzen/ersetzen; Worms-Referenzen unter `docs/vergleich-alternativspiele-2026-10-19/referenzen/`.
6. **Mine/Fass-Feinschliff (MINEN-1):** Fass als Kiste bleibt, **Wurffass entfällt** (150 Waffen bleiben). Bild/Klang abnehmen lassen.
7. **PORTAL-1:** seltene zufällige Portale mit Gegenstück-Pflicht (Waffe oder zwei Nutzer), Ziel taktisch günstig oder Munitionsort – erst spezifizieren.
8. **KONTO-2/3** (Profil, Scoreboard) – wartet auf den Cloudflare-Umzug (`scripts/betrieb/web/*`).
9. Rest-TODOs: WETTER-1-Feinschliff, Menü-Auswahl für Online-Lobby-Sperre (iOS/Lite bei `kolossal`), Sprite-Reste (`datacult/02`, `datacult/20` Splitter), Hocke/Sprites Sichtabnahme, Funkenkugel/Mine Klangabnahme, GELAENDE-1, N-31, N-43, N-46, UI-REST (kein Hochformat-HUD), N-34 (nur Referenz kennzeichnen, nichts löschen), BAL-14/15/17.
10. **Später/Zukunft:** komplette englische Übersetzung per Einstellung; WELT-ABC (mehrere Mini-Karten für Riesenkämpfe, Raumkonzept in der Engine).

## 5. Abschluss-Checkliste vor dem nächsten Release-Stand

- Voller `npm test` im sauberen Worktree, danach `npm run testlauf:erfassen -- --unit-log <datei>`, `npm run check:docs -- --schreiben`.
- `npm run checks`, `check:bundle` (Haupt-Chunk war über der Grenze – Ursache im Stand von HEAD, nicht in neuen Modulen), `npx playwright test` einzeln/1 Worker.
- Zuletzt rote Tests (vor den letzten Agenten): `konto-profil` (Rangliste, 13 ≠ 12), E2E `waffen-zustand`/`waffen-animation` (vermutlich Speicher), `profiling.spec` flackert.
- Messung auf iPhone und Asus-Laptop über `messung.html` (Z579) steht aus; erst danach Grafikstufen-Grenzen festnageln.

## 6. Optimierungs- und Iterationslauf (Auftrag an den nächsten Agenten)

Budget: ca. 15 % Wochenlimit. Arbeitsregeln zum Tokensparen: ein Paket nach dem anderen (keine parallelen Agenten), pro Paket nur die genannten Dateien lesen (Grep statt ganze Dateien), gezielte Testdateien statt `npm test` (voller Lauf nur einmal am Ende, im Hintergrund, Ergebnis per `tail`), Berichte ≤ 15 Zeilen, keine Kontaktbögen in den Kontext laden außer einem pro Paket, stabile Prompt-Präfixe (AGENTS.md + diese Datei) für Caching. Nach jedem Paket committen und pushen.

Reihenfolge nach Wirkung pro Aufwand. Alles Ungemessene ist Hypothese: erst messen, dann bauen.

### A. Spielfluss und Spielspaß
1. **Ein-Klick-Start (MENUE-EINFACH):** Login → ein großer „Spielen“-Knopf; Karte, Art, Seed, Wetter zufällig; Biomwahl und Größe hinter einem Knopf. Akzeptanz: Start einer Partie mit ≤ 2 Klicks (E2E).
2. **Kartenqualitäts-Tor:** Generator würfelt neu, wenn das Qualitätsmaß (Gangbreite, Ebenenzahl, offen/geschlossen, Spawn-Fairness, Erreichbarkeit) unter der Schwelle liegt; deterministisch über Versuchszähler. Akzeptanz: 0 von 500 Seeds unter der Schwelle.
3. **Zugtempo:** Wartezeiten zwischen Zügen messen (Kamerafahrt, Nachlauf, Zugpause) und auf das Nötige kürzen; Zuschauerzeit ist der größte Spaßkiller in Rundenspielen. Client-Timing ohne Regeländerung zuerst.
4. **Treffer-Feedback („Juice“):** Trefferstopp (wenige Frames, nur Client), Schadenszahlen gestaffelt, Kill-Kamera kurz, Kettenzähler prominent, Todes-Epilog-Sprüche vom Auftraggeber abnehmen lassen.
5. **Nahkampf-Reichweite:** 0 von 100 Projektilwaffen erreichen den Startabstand – nach Entscheidung des Auftraggebers Wurfweiten angleichen (Versionsmarke) oder Startabstände je Klasse mischen.
6. **Dichte auf kleinen runden Karten:** Gegner 55–110 px entfernt – Mindestabstand beim Spawn oder runde Arten erst ab mittlerer Größe.
7. **Onboarding:** 60-Sekunden-Einstieg (Zielen, Kraft, Waffe wählen, Zündzeit Z) als überspringbare Einblendungen in der ersten Partie; Solo-Übung gegen gekennzeichnete KI (N-23, Rechenkern existiert).
8. **Kisten und Portale (PORTAL-1):** seltene Portale mit Gegenstück-Pflicht spezifizieren und bauen – schafft Kartenziele abseits des Gegners.
9. **Hagel-Balance spielen:** Lagenanteil 20 %, 50 % gezielte Körner – mit festen Seeds messen, wie viel Schaden pro Partie anfällt; ggf. senken.

### B. Grafik
1. **Figuren-Schärfe:** Figuren/HUD immer in voller Bildschirmauflösung (devicePixelRatio), nur Gelände/Kulisse skalieren; Ergebnis von GRAFIKSTUFE-1 prüfen, sonst hier abschließen.
2. **Hintergründe des Auftraggebers** einsetzen (`uploaded/`, Projektdateien `IMG_*`), Stil je Biom vereinheitlichen (N-35), 80 Kulissen-JPG → WebP (BLD-1, ca. −3 MB).
3. **Gelände-Kanten:** Lippe/Überhang an Oberkanten, Mischzonen statt harter Materialgrenzen (N-31) – größter optischer Hebel Richtung Worms-Look.
4. **Nahtlose Texturen** für Keramik und Metall neu erzeugen (sichtbare Brüche); Kristallarchipel-Grading von 1,1 s zurück Richtung 0,4 s (Voronoi mit Gitter-Suche).
5. **Wetter im echten Spiel abnehmen** (Lite/Ultra), eigener Hagelklang, Luchs-Emotionszellen, zwei datacult-Splitterzellen.
6. **Kachelung großer Karten:** Gelände-Canvas in Kacheln ≤ 4 Mio. px – hebt die iOS-Sperre für `kolossal` auf und senkt Speicher auf allen Geräten.

### C. Gesamtsystem und Technik
1. **Messung auf echten Geräten** (`messung.html` auf iPhone und Asus) – Grundlage für alle Grafikgrenzen; bisher nur Software-Rasterung (62–67 ms/Bild bei 4704×1764).
2. **Bundle:** Haupt-Chunk 1,27 MB über der Grenze, dist 129 MB – Code-Splitting (Menü/Spiel/Messseite), Assets je Biom nachladen statt alles vorab (OPT-7). Senkt Ladezeit und Hosting-Verkehr.
3. **Ereigniskanal Wasser (N-43):** 42 KB/s je Client → gebündelte Meldungen (−94 % gemessen), Drahtformat mit Versionsmarke.
4. **Stabiler Gesamtlauf:** `konto-profil` (Rangliste 13 ≠ 12), E2E `waffen-zustand`/`waffen-animation`, flackerndes `profiling.spec` beheben; danach `testlauf:erfassen`. Syntax-Tor ergänzen: `node --check` über `src/**` als Pre-Push/`check`-Schritt (der Server war auf `main` zeitweise nicht ladbar).
5. **Konto/Hosting abschließen:** Cloudflare-Umzug übernehmen, Stash `autostash-sicherung-rebase-2026-11-12` einarbeiten oder verwerfen, Profil + Scoreboard (KONTO-2/3), Hetzner-Image auffrischen, Online-Beitrittssperre für `kolossal` auf iOS/Lite.
6. **Zerlegung:** `main.js` (3980/4000) und `renderer.js` (2493/2500) sind am Budget – je ein Modul herauslösen (Menü-Verdrahtung, Ereignis-Zeichnung), sonst blockiert jede neue Funktion.
7. **Später:** englische Übersetzung (Texte zuerst in eine Tabelle ziehen), WELT-ABC.
