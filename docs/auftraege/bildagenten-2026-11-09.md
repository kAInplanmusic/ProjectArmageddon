# Aufträge für Bild-Agenten (Stand 2026-11-09)

Sechs Pakete, die neue Bilder brauchen und deshalb nicht von einem reinen Code-Agenten
erledigt werden können. Jedes Paket ist für sich lauffähig. Die Entscheidungen des
Auftraggebers stehen bei den Paketen B1 und B2 (am 2026-11-10 erneut bestätigt).
Alle Pfade in diesem Auftrag sind am 2026-11-10 gegen das Repo geprüft; Asset-Pfade wie
`sprite-sheets/manifest.json` liegen unter `src/client/assets/`, `tog.py` unter
`scripts/sprites-erzeugen/`.

**Lies zuerst:** `AGENTS.md`, `docs/TODO.md` (dieser Auftrag ersetzt die dortigen Zeilen
nicht, er führt sie aus), `scripts/sprites-erzeugen/README.md`.

## Regeln für alle Pakete

1. **Ein Paket, ein Branch, ein Agent.** Branchname steht beim Paket. Basis `origin/main`.
   Kein Merge nach `main` durch den erzeugenden Agenten: Ein zweiter Agent prüft (Regel 6),
   erst dann wird gemergt.
2. **Nur die genannten Dateien anfassen.** Die Pakete überschneiden sich nicht; wer eine
   Datei außerhalb seiner Liste ändern muss, hält an und schreibt den Grund in den Bericht.
3. **Bildquelle:** die vorhandenen Werkzeuge unter `scripts/sprites-erzeugen/` und
   `scripts/seitenansichten/` (dort ist der Weg über Together AI bereits verdrahtet, siehe
   `tog.py`). Keine neue Bild-API und kein neuer Schlüssel ohne Freigabe des Auftraggebers.
   Vor dem ersten bezahlten Lauf steht die erwartete Bildzahl im Bericht; Preise werden
   nicht geschätzt, sondern aus der Abrechnung nachgetragen.
4. **Nichts überschreiben, bevor es geprüft ist.** Neue Bilder zuerst unter
   `artifacts/<paket>/` (gitignored) ablegen, Kontaktbogen bauen, dann ersetzen. Das alte
   Bild bleibt über die Git-Historie erreichbar; keine `*_alt`-Kopien im Repo.
5. **Kein Bild ändert das Spiel.** Kollisionsform, Fußpunkt (`KOLLISIONSANKER`), Karten-
   maske, Zustandshash und Replays bleiben unberührt. Wer dafür Code im Motor
   (`src/engine`, `src/shared`) ändern müsste, ist im falschen Paket.
6. **Zwei Prüfungen, getrennt ausgewiesen:**
   - automatisch: die beim Paket genannten Tests, dazu `npm test`, `npm run check:sprites`,
     `npm run check:docs`, `npm run check:bundle`;
   - Sicht: ein Kontaktbogen (vorher/nachher, bei 24, 64 und 128 px sowie auf hellem und
     dunklem Gelände) unter `docs/abnahme/<paket>/kontaktbogen.png`. Ein grüner Test ist
     **keine** Sichtabnahme. Die Sichtabnahme erteilt der Auftraggeber; bis dahin heißt der
     Stand „erzeugt, automatisch geprüft, Sicht offen".
7. **Unsicheres Bild = neu erzeugen**, nicht retuschieren (Vorgabe des Auftraggebers). Ein
   Bild, das nach drei Versuchen nicht besteht, wird im Bericht als offen geführt.
8. **Ladezeit halten:** Texturen unter 200 kB je Datei (`tests/stoff-texturen.test.js`),
   WebP q82 wie in `docs/ladezeit.md` §6, `dist` unter der Grenze aus
   `scripts/bundle-grenzen.json`. Grenzen werden nicht angehoben.
9. **Bericht** je Paket als `docs/abnahme/<paket>/BERICHT.md`: was erzeugt wurde (Liste der
   Dateien), was automatisch grün ist (mit Befehl und Ausgabezeile), was nur Sicht klären
   kann, was offen blieb. Danach die Zeile in `docs/TODO.md` anpassen; erledigte Zeilen
   werden dort gelöscht.

---

## B1 — SPR-4: Fraktion „pixel" als echte 8-Bit-Figuren

**Entscheidung des Auftraggebers (2026-11-09): echte 8-Bit-Figuren.** Die Neon-Linie war
ein Zwischenstand; eine nachträgliche Pixelierung der vorhandenen Bilder wurde früher gebaut
und verworfen. Verlangt sind deshalb **neu erzeugte** Figuren, keine Filter.

1. **Aufgabe:** Die neun Figuren der Fraktion `pixel` als grobe Pixel-Sprites neu erzeugen.
2. **Ziel:** Die Fraktion ist auf den ersten Blick als 8-Bit-Fraktion erkennbar, auch bei
   24 px im HUD, und bleibt dabei dieselbe Figur (Name, Rolle, Silhouette).
3. **Ausgangslage:** `src/client/assets/characters/pixel/` (9 Dateien, von
   `00_nullpointer-exception.png` bis `22_arcanus-b.png`), dazu dieselben Namen in
   `characters-hd/pixel/`, `characters-side/pixel/`, `sprite-sheets/pixel/`
   (`__walk`, `__aktion`, `__zustand`), `sprite-sheets-emotion/pixel/`.
4. **Betroffen:** nur die Ordner `*/pixel/` der fünf genannten Asset-Ordner und die
   `pixel/…`-Einträge der drei Manifeste (`characters-side/manifest.json`,
   `sprite-sheets/manifest.json`, `sprite-sheets-emotion/manifest.json`).
5. **Schritte:**
   1. Stilblatt festlegen und als erstes Bild ablegen: feste Palette (höchstens 16 Farben
      je Figur), ein Pixelraster (Vorschlag 32×32 logische Pixel, auf die Zielgröße ohne
      Glättung hochskaliert), harte Kanten, keine Verläufe, kein Antialiasing.
   2. Eine Figur (`00_nullpointer-exception`) komplett durchziehen: Porträt, HD, Seite,
      Geh- und Aktionsblatt, Emotionen. Kontaktbogen bauen, **Sichtfreigabe abwarten**.
   3. Erst nach der Freigabe die übrigen acht Figuren.
   4. Manifest-Einträge neu messen (Anker, Zellen, `gehen`), nicht von Hand übernehmen.
6. **Einschränkungen:** Figurgröße, Fußpunkt und Blickrichtung (Seite: nach rechts) wie
   bisher. Günther und Cookie bleiben, wie sie sind. Das Rendering skaliert Figuren mit
   Glättung (`figurStufen.js`); ob Pixel-Sprites dort eine Ausnahme brauchen
   (`imageSmoothingEnabled`), ist eine **Code-Frage** — als Befund in den Bericht, nicht
   selbst umbauen.
7. **Abnahme:** neun Figuren × alle Fassungen vorhanden; Palette je Figur ≤ 16 Farben
   (per Skript gezählt, Zahl im Bericht); Silhouette bei 24 px von den acht anderen
   Fraktionen unterscheidbar (Kontaktbogen); Sicht durch den Auftraggeber.
8. **Tests:** `tests/figur-identitaet.test.js`, `tests/figur-sheets.test.js`,
   `tests/sprite-sheets.test.js`, `tests/figur-emotion.test.js`,
   `tests/figuren-redaktion.test.js`, `npm run check:sprites`; E2E
   `figuren-sheets.spec.mjs`, `figuren-sichtbarkeit.spec.mjs`, `roster.spec.mjs`
   (zwei davon haben einen bekannten roten Test, siehe `docs/TODO.md` MERGE-3 — vorher
   und nachher zählen).
9. **Ergebnis:** Branch `bild/spr4-8bit`, Kontaktbogen, Bericht, angepasste TODO-Zeile SPR-4.

---

## B2 — N-32 / TERRAIN-ENTSCH: Gelände einheitlich im Comic-Stil

**Entscheidung des Auftraggebers (2026-11-09): alles Comic.** Die Stilfrage
`TERRAIN-ENTSCH` ist damit beantwortet; fotorealistische Texturen werden ersetzt.

1. **Aufgabe:** Die 15 Basis-Texturen im Fotostil durch Comic-Fassungen im Stil der neuen
   Biom-Texturen ersetzen.
2. **Ziel:** Kein sichtbarer Stilbruch zwischen Basisstoffen und Biom-Materialien auf
   derselben Karte.
3. **Ausgangslage:** `src/client/assets/stoff-texturen/` — `basalt`, `beton`, `eis`,
   `erde`, `fels`, `hecke`, `holz`, `kies`, `kohle`, `moos`, `obsidian`, `pilz`,
   `regolith`, `sand`, `schnee` (alle `.jpg`, 512 px). Stilvorbild:
   `src/client/assets/stoff-texturen-neu/` und `docs/design-vorlagen/look-vorgabe-gelaende.md`
   (welche Kachel zu welchem Stoff passt, fasst `docs/TODO.md` N-41 zusammen).
4. **Betroffen:** nur `src/client/assets/stoff-texturen/*` und
   `scripts/stoff-naht-messwerte.json`. Soll das Format auf WebP wechseln, muss der Glob in
   `src/client/main.js` (`./assets/stoff-texturen/*.jpg`) mit — das ist die eine erlaubte
   Code-Zeile dieses Pakets.
5. **Schritte:**
   1. `erde` und `fels` zuerst (sie liegen auf fast jeder Karte), Kontaktbogen mit drei
      echten Karten bauen (`npm run kontaktbogen`), Sichtfreigabe abwarten.
   2. Übrige 13 Texturen. `pilz` ist unscharf und wird in jedem Fall neu erzeugt.
   3. Nahtprüfung je Datei: `python3 scripts/stoff-naht.py … --schreiben`; das
      Kantenverhältnis muss unter 4,5 bleiben.
   4. Mittlere Helligkeit je Textur gegen die alte Datei halten (±10 %): Die Färbung
      multipliziert Textur und Stofffarbe, eine dunklere Textur verdunkelt die ganze Karte.
6. **Einschränkungen:** Dateinamen behalten (die Zuordnung `STOFF_TEXTUR` hängt daran).
   512×512, kachelbar, unter 200 kB. Keine neue Textur ohne Stoff. `gras`, `lava-glut`,
   `lava-risse`, `normalmap`, `hecke-kontrast` (ASSETS-1) sind ungenutzt und gehören nicht
   in dieses Paket.
7. **Abnahme:** 15 Dateien ersetzt; Naht < 4,5; Helligkeit im Band; auf dem Kontaktbogen
   ist keine Basis-Textur mehr als Foto erkennbar; Sicht durch den Auftraggeber.
8. **Tests:** `tests/stoff-naht.test.js`, `tests/stoff-texturen.test.js`,
   `tests/stoffe-biome.test.js`, `tests/ladezeit-nach-bedarf.test.js`,
   `npm run check:terrain`, `npm run check:biome`.
9. **Ergebnis:** Branch `bild/n32-comic-texturen`, Kontaktbogen, Bericht; in
   `docs/TODO.md` die Zeilen N-32 und TERRAIN-ENTSCH anpassen.

---

## B3 — N-02: fehlerhafte Stillbilder

1. **Aufgabe:** Stillbilder nachziehen, die eine andere Figur oder einen Platzhalter zeigen.
2. **Ziel:** Jede Ansicht einer Figur zeigt dieselbe Figur.
3. **Ausgangslage:** `charactersheets/datacult/22_ethereo.png` (Vorderansicht ist eine
   andere Figur); `machina/11_heavy-battery-moerser-bot` in allen vier Stillbildern mit
   einem Platzhalter-Quadrat am Rohr; vier Vorlagen in `characters-side/undead/`
   (`12`, `20`, `21`, `22`) weichen von HD und Porträt ab, die Sheets folgen der Vorlage.
4. **Betroffen:** die genannten Dateien, bei `undead` zusätzlich deren Sheets und
   Manifest-Einträge.
5. **Schritte:** Ethereo und Mörser-Bot neu erzeugen. Für die vier Untoten **zuerst** einen
   Paarbogen bauen (`scripts/seitenansichten/paarbogen.py`): links Porträt/HD, rechts
   Seitenvorlage. Welche Fassung gilt, entscheidet der Auftraggeber am Bogen — bis dahin
   nichts ersetzen.
6. **Einschränkungen:** Ethereo hat konstruktionsbedingt zerstückelte Zellen; das ist kein
   Fehler dieses Pakets.
7. **Abnahme:** Ethereo und Mörser-Bot bestehen `tests/figur-identitaet.test.js` und die
   Sicht; für die vier Untoten liegt der Paarbogen samt Frage vor.
8. **Tests:** `tests/figur-identitaet.test.js`, `tests/sprite-sheets.test.js`,
   `npm run check:sprites`.
9. **Ergebnis:** Branch `bild/n02-stillbilder`, Paarbogen, Bericht, TODO-Zeile N-02.

---

## B4 — BILDLÜCKEN: Hocke und Zustandsblätter

1. **Aufgabe:** Die Hocke für die 29 Figuren ohne Hocke liefern und die 81 Zustandsblätter
   klassifizieren.
2. **Ziel:** Jede Figur hat eine geprüfte Hocke-Zelle; der Renderer darf sie zeigen.
3. **Ausgangslage:** `sprite-sheets/*/*__zustand.webp` (81 Dateien) liegen im Repo, sind
   aber nirgends freigegeben: Kein Manifest-Eintrag trägt `hockeQuelle` mit
   `geprueft: true` (`zustandHockeZelle` in `src/client/figurSheets.js`). **Zusätzlich
   erfasst kein Glob die `__zustand`-Dateien** (`src/client/figurenDaten.js` lädt nur
   `__walk` und `__aktion`): Eine Freigabe im Manifest bliebe heute ohne Wirkung.
4. **Betroffen:** `sprite-sheets/manifest.json`, `sprite-sheets/*/*__zustand.webp`;
   **Code-Übergabe** an einen Code-Agenten: den Glob in `figurenDaten.js` um `zustand`
   erweitern — aber nur für freigegebene Figuren, sonst wachsen `dist` und der Baustein um
   81 Dateien.
5. **Schritte:** `scripts/sprite-sheets-klassifizieren.py` über alle 81 Blätter; je Figur
   die Hocke-Zelle bestimmen oder neu erzeugen; `hockeQuelle` nur nach Sichtprüfung
   eintragen; Liste der freigegebenen Figuren an den Code-Agenten.
6. **Einschränkungen:** Zustandsblätter enthalten Anatomieabweichungen und eingebrannte
   Wasserspritzer; solche Zellen werden nicht freigegeben, sondern neu erzeugt.
7. **Abnahme:** je Figur entweder freigegebene Hocke oder begründeter Eintrag „offen";
   `tests/figur-zustand-hocke.test.js` grün.
8. **Tests:** `tests/figur-zustand-hocke.test.js`, `tests/figur-sheets.test.js`,
   `tests/sprite-sheets.test.js`; E2E `figuren-sheets.spec.mjs`.
9. **Ergebnis:** Branch `bild/hocke-zustand`, Kontaktbogen, Bericht, TODO-Zeile BILDLÜCKEN.

---

## B5 — N-12: Waffen-Animationsblätter

1. **Aufgabe:** Über die 26 vorhandenen Animationsblätter entscheiden und die brauchbaren
   neu erzeugen.
2. **Ziel:** Kein unbrauchbares Blatt im Repo; jedes behaltene Blatt ist abspielbar.
3. **Ausgangslage:** `src/client/assets/weapon-sprites/anim/*.webp` (27 Dateien), nirgends
   eingebunden, überwiegend falsches Motiv, Standbild oder springende Frames. Denkbar sind
   höchstens `pa_038`, `pa_135`, `pa_142`.
4. **Betroffen:** nur `weapon-sprites/anim/`. Das Abspielen (`waffenAnimation.js`,
   Manifest-Feld `anim`) ist Code und gehört zu WAFFENANIM-1, nicht hierher.
5. **Schritte:** `tools/waffen-anim-abnahme.py` über alle Blätter; `pa_038` und `pa_135`
   sichten; unbrauchbare Blätter löschen; für neu zu erzeugende das Zellbild der Waffe als
   Bildbedingung verwenden, damit das Motiv stimmt.
6. **Einschränkungen:** Lieber kein Blatt als ein schlechtes: Ohne Blatt bleibt die
   prozedurale Bewegung, und die ist geprüft.
7. **Abnahme:** je Blatt „behalten", „neu erzeugt" oder „gelöscht" mit Grund; behaltene
   bestehen `tests/waffen-anim-abnahme.test.js`.
8. **Tests:** `tests/waffen-anim-abnahme.test.js`, `tests/waffen-anim-gating.test.js`,
   `tests/animation-pruefung.test.js`.
9. **Ergebnis:** Branch `bild/n12-waffen-anim`, Bericht, TODO-Zeilen N-12 und WAFFENANIM-1.

---

## B6 — N-09: Geschosszellen je Familie

1. **Aufgabe:** Eigene 64-px-Geschosszellen für die sieben Geschossfamilien (Rauch,
   Flamme, Frost, Tropfen, Funkeln, Leuchtspur, Staub) und den blauen Orb für `pa_148`.
2. **Ziel:** Ein Geschoss ist im Flug an seiner Form erkennbar, nicht nur am Schweif.
3. **Ausgangslage:** Schweife je Familie sind seit 2026-11-03 gebaut
   (`tests/waffen-optik.test.js`, `GESCHOSS_ART`); die Geschosse selbst teilen sich Zellen.
4. **Betroffen:** der Geschoss-Atlas unter `src/client/assets/weapon-sprites/` und sein
   Manifest; die Zuordnung Familie → Zelle ist Code (Übergabe an einen Code-Agenten).
5. **Schritte:** je Familie eine Zelle, 64×64, transparent, nach rechts fliegend; bei 16 px
   Anzeige noch unterscheidbar; Atlas über `python3 scripts/waffen-sprites.py` neu bauen.
6. **Einschränkungen:** Trefferfenster und Flugbahn sind Regeln und bleiben unberührt.
7. **Abnahme:** sieben Zellen plus Orb; paarweise unterscheidbar bei 16 px (Kontaktbogen).
8. **Tests:** `tests/waffen-sprites.test.js`, `tests/waffen-optik.test.js`; E2E
   `effekt-sheets.spec.mjs`.
9. **Ergebnis:** Branch `bild/n09-geschosszellen`, Kontaktbogen, Bericht, TODO-Zeile N-09.

---

## Reihenfolge und Abhängigkeiten

| Paket | hängt ab von | blockiert | parallel möglich mit |
|---|---|---|---|
| B1 | — | — | B2, B5, B6 |
| B2 | — | N-30 (Varianten je Kachel), N-31 (Übergänge) bauen auf dem einheitlichen Stil auf | B1, B3, B5, B6 |
| B3 | Entscheidung am Paarbogen (Untote) | B4 für die vier Untoten | B2, B5, B6 |
| B4 | B1 und B3 für deren Figuren | FIGUREN-B (Zustandsblätter als Rollen) | B2, B5, B6 |
| B5 | — | WAFFENANIM-1 | alle |
| B6 | — | — | alle |

B1 und B4 fassen beide `sprite-sheets/manifest.json` an: nicht gleichzeitig, B1 zuerst.
