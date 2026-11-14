# Ladezeit und Auslieferungsgröße (BLD-1 / BUILD-1)

Stand: 2026-11-09. Gemessen auf dem Produktionsbau (`npm run build` + `vite preview`),
Chromium 1194 unter `/opt/pw-browsers/chromium` (`--headless=new --no-sandbox`), 4 Kerne,
Container ohne GPU. „Vorher“ = `2413c4f` (JPG-Kulissen), „Nachher“ = WebP-Kulissen + Gate.
Die BUILD-1-Messungen von 2026-11-09 (Preload, Rest-JPG, ungenutztes JS) stehen in §6.

## 1. Lighthouse (Startseite)

Lighthouse 12.8.2 (`npm install lighthouse` in einem Zwischenordner, kostenlos), nur Kategorie
Performance, je drei Läufe. Mobil = Lighthouse-Vorgabe (simuliertes Slow 4G, 4x CPU-Bremse),
Desktop = `--preset=desktop`. Werte: Median der drei Läufe (in Klammern die Spanne).

| Profil | Stand | Score | FCP | LCP | TBT | Speed Index | Bytes beim Start |
|---|---|---|---|---|---|---|---|
| Mobil | vorher | 73 (48–76) | 3,20 s | 4,20 s | 221 ms (128–3223) | 3,60 s | 7955 KiB |
| Mobil | nachher | 74 (71–77) | 3,30 s | 4,12 s | 196 ms (43–302) | 3,55 s | 7955 KiB |
| Desktop | vorher | 99 (98–99) | 0,65 s | 0,87 s | 0 ms | 0,87 s | 7955 KiB |
| Desktop | nachher | 99 (97–99) | 0,65 s | 0,93 s | 0 ms | 0,95 s | 7955 KiB |

Lesart:

- Die Startseite lädt **keine Kulisse** (sie kommt erst mit dem Match); deshalb ändert der
  WebP-Wechsel die Startwerte nicht. Die Unterschiede liegen in der Streuung (ein
  Ausreißer-Lauf vorher mit TBT 3,2 s, Container-Last).
- LCP-Element ist das Menü-Logo (`div.menu-logo`). Die 7955 KiB beim Start sind zu ~96 %
  Bilder (Material-/Stofftexturen, Effekt-Sheets, Logo), JS 336 KiB übertragen.
- Lighthouse meldet 175 KiB ungenutztes JS (Haupt-Bundle). Die frühere Angabe in BUILD-1
  (64/100, FCP 2,8 s, LCP 3,9 s, 152 KiB) stammt von einem anderen Rechner und älteren Stand.

## 2. Kulissen: JPG -> WebP

`scripts/kulissen-webp.py` (Pillow/libwebp 1.3.2, `method=6`). Bezug ist das bisher
ausgelieferte JPG; SSIM nach Wang 2004 (Gauß 11x11, sigma 1,5) auf der Helligkeit Y, PSNR auf RGB.

| Qualität | Basis 80 Bilder | Stimmungen 144 Bilder | SSIM Mittel (B/S) | SSIM Min | PSNR Mittel (B/S) |
|---|---|---|---|---|---|
| JPG (bisher) | 11,29 MB | 15,56 MB | 1 | 1 | – |
| WebP q70 | 5,50 MB (−51 %) | 7,47 MB (−52 %) | 0,962 / 0,954 | 0,912 | 36,6 / 38,3 dB |
| WebP q75 | 5,85 MB (−48 %) | 8,08 MB (−48 %) | 0,965 / 0,957 | 0,922 | 37,0 / 38,7 dB |
| WebP q80 | 7,15 MB (−37 %) | 10,21 MB (−34 %) | 0,974 / 0,968 | 0,944 | 38,4 / 40,0 dB |
| **WebP q82 (gewählt)** | **7,77 MB (−31,2 %)** | **11,22 MB (−27,9 %)** | **0,977 / 0,972** | **0,955** | **39,0 / 40,6 dB** |
| WebP q85 | 8,87 MB (−21 %) | 13,01 MB (−16 %) | 0,981 / 0,977 | 0,965 | 39,9 / 41,5 dB |
| WebP q90 | 11,55 MB (+2 %) | 17,38 MB (+12 %) | 0,988 / 0,986 | 0,974 | 42,0 / 43,5 dB |

Wahl q82: erreicht das Ziel (≈ −27 %) in beiden Gruppen, gesamt 26,85 -> 18,99 MB (−29,3 %).
Schlechteste Bilder (`noir_rooftop_silhouette`, Filmkorn; `urban_dunkel`, Sternenhimmel) im
2x-Ausschnitt nebeneinander gesichtet: Unterschied nur im Korn bzw. in JPEG-Ringartefakten um
Sterne, die WebP glättet; Sterne, Kanten und Farben gleich. Die Kulisse liegt zudem hinter dem
Gelände (untere ~47 %) und wird per cover skaliert.

Bau (`dist/`): 108,08 MB -> 100,22 MB. Die JPG-Originale sind gelöscht (Git-Historie bis
`2413c4f`); `scripts/fetch-backdrops.py` schreibt neue Kulissen direkt als WebP q82.

Kulissenbild beim Matchstart (`scripts/lade-kulissen.mjs --drossel`, 1,6 Mbit/s, 150 ms RTT,
Median aus 3 Läufen; „Bild“ = Resource-Timing des Bildes, es teilt die Leitung mit den
Texturen des Matchstarts):

| Kulisse | JPG KiB | WebP KiB | Bild laden JPG | Bild laden WebP | bis `backdropReady` JPG | WebP |
|---|---|---|---|---|---|---|
| noir/rainy_street | 134 | 106 | 9,04 s | 9,67 s | 11,20 s | 11,61 s |
| maritime/calm_day | 105 | 69 | 9,97 s | 9,01 s | 11,45 s | 10,78 s |
| cosmos/nebula | 94 | 67 | 8,57 s | 7,79 s | 9,90 s | 9,29 s |
| alpine/stimmung_dunkel | 88 | 58 | 8,19 s | 7,36 s | 9,62 s | 9,06 s |
| forest/stimmung_hoehle | 201 | 180 | 11,24 s | 10,48 s | 12,75 s | 12,30 s |

Die Zeiten werden von den gleichzeitig geladenen Texturen beherrscht (die Kulisse steht in der
Warteschlange); der Nachher-Lauf lief zudem parallel zu `npm test`. Belastbar ist die
Byte-Ersparnis je Bild (−11 bis −34 %); die Zeiten zeigen die Richtung (4 von 5 schneller),
nicht die Größe des Gewinns.

## 3. Bundle-Größen-Gate

`npm run check:bundle` (= `node scripts/bundle-gate.mjs --bauen`, Gate 22 in `npm run checks`
und damit in der CI). Grenzen in `scripts/bundle-grenzen.json`, gzip Stufe 9.

| Größe | gemessen 2026-11-09 | Grenze |
|---|---|---|
| Haupt-Bundle roh | 1231,8 KiB | 1269,5 KiB |
| Haupt-Bundle gzip | 337,1 KiB | 348,6 KiB |
| Start (HTML + JS + CSS) roh | 1339,1 KiB | 1372,1 KiB |
| Start gzip | 364,2 KiB | 376,0 KiB |
| `dist/` gesamt | 97,36 MiB | 100,14 MiB |
| Sourcemaps | 0 | 0 |

Probe: eine untergeschobene `.map` in `dist/` lässt das Gate mit Exit 1 fehlschlagen.
(Die Werte dieser Tabelle sind der Stand vor §6; die aktuellen Grenzen und Messwerte
stehen in §6.1.)

### 3.1 Kader-Split: Grenze blieb, Bau wurde kleiner

Am 2026-11-09 war das Gate auf `main` rot: Haupt-Bundle 1273,6 KiB roh
(Grenze 1269,5), Start 1383,7 KiB roh (Grenze 1372,1); gzip lag mit 347,9 und
375,7 KiB noch darunter. Die Ursache war Wachstum aus dem DesignRest-Zweig
(`darstellung.js`, Stoff-/Biomdaten, Figuren-Manifeste), nicht ein einzelner
Fehler.

Gemessen und behoben, ohne die Grenze anzufassen:

- **Die neun `@fontsource`-Fraktionsschriften lagen NICHT im Haupt-Bundle.**
  Sie sind WOFF2-Dateien in `dist/assets` (zählen in keine der beiden Grenzen);
  im Start-CSS standen nur ihre `@font-face`-Regeln. Der gesamte Anteil von
  `fraktionen.css` an der Start-CSS betrug 2,9 KiB — allein damit war das Gate
  nicht zu retten.
- **Kader- und Hilfeansicht sind jetzt ein eigener, lazy geladener Chunk.**
  `main.js` ruft `import('./kaderansicht.js')` statt eines statischen Imports.
  Das verschiebt 43,8 KiB JS und 2,9 KiB CSS (samt der neun Schriften) aus dem
  Startpfad. `beschreibeWert()` liegt dafür als eigenes Modul
  `client/wertBeschreibung.js` im Startpfad — das Menü braucht die Funktion
  schon beim Füllen der Loadout-Auswahl. Beide Ansichten zeichnen weiterhin
  sofort, wenn ihr `details`-Element beim Laden bereits offen ist.

| Größe | vorher | nachher | Δ |
|---|---|---|---|
| Haupt-Bundle roh | 1304132 B (1273,6 KiB) | 1261391 B (1231,8 KiB) | −41,7 KiB |
| Haupt-Bundle gzip | 347,9 KiB | 337,1 KiB | −10,8 KiB |
| Start roh | 1416861 B (1383,7 KiB) | 1371239 B (1339,1 KiB) | −44,6 KiB |
| Start gzip | 375,7 KiB | 364,2 KiB | −11,5 KiB |

Die Grenzen in `scripts/bundle-grenzen.json` sind **unverändert**; der Spielraum
liegt jetzt bei +3,1 % (haupt roh) und +2,5 % (Start roh) statt bei −0,3 % und
−0,8 %.

### 3.2 Integration der zehn Vorarbeiter-Branches

Am 2026-11-09 wurden zehn parallele Branches zusammengeführt (Waffenradius,
Waffendaten/-anzeige/-animation, Figuren-Identität/-Zustand/-Text, Präsentation,
4K-Kulissen, CI-Bundle). Der Start-Chunk wuchs dadurch wieder über die Grenze:
Embleme und Teamfarben (A11), Figurenkarte, Waffen-HUD mit Icons und
Zustandssheets, Hymnensteuerung (A14) und die 4K-Kulissenwahl liegen im
Startpfad. Das ist sichtbare Funktion, kein toter Ballast; eine weitere
Lazy-Zerlegung der Anzeige-Module würde den Start verzögern und den
Fraktionszustand über mehrere Chunks verteilen.

| Größe | nach Kader-Split | nach Integration | Δ |
|---|---|---|---|
| Haupt-Bundle roh | 1261391 B (1231,8 KiB) | 1294305 B (1264,0 KiB) | +32,1 KiB |
| Haupt-Bundle gzip | 345178 B (337,1 KiB) | 360613 B (352,2 KiB) | +15,1 KiB |
| Start roh | 1371239 B (1339,1 KiB) | 1392658 B (1360,0 KiB) | +20,9 KiB |
| Start gzip | 372991 B (364,2 KiB) | 383498 B (374,5 KiB) | +10,3 KiB |

Gegenüber dem Kader-Split bleiben `haupt.roh` (1 300 000 B) und `start.gzip`
(385 000 B) **unverändert**; nur `haupt.gzip` (362 000 B) und `start.roh`
(1 400 000 B) wurden angehoben. Der lokale Stand hat zugleich ungenutzte
Zustand-Sheets aus dem Bau genommen, deshalb fällt der Zuwachs kleiner aus als
die Summe der Branches. Die Zerlegung aus 3.1 bleibt bestehen; `main.js` und
`renderer.js` wurden zusätzlich um `profilDatei.js`, `windPfeil.js` und
`kulissenLaden.js` entlastet und halten ihre Zeilenbudgets (2471/2500) ein.

## 4. Sourcemaps

`vite.config.mjs` setzt `build.sourcemap: false`; im Bau liegt keine `*.map`, kein Chunk trägt
`sourceMappingURL`. Das Gate hält beides fest (Grenzen 0), `tests/bundle-gate.test.js` prüft die
Einstellung und einen untergeschobenen Verweis ohne Map.

## 5. Debug-API und Profil lazy splitten: bewusst nicht

Gemessen per Probebau (dynamisches `import()` statt statischem Import):

| Variante | Haupt-Bundle roh | gzip |
|---|---|---|
| heute | 1216,9 KiB | 333,5 KiB |
| `debugApi.js` lazy | 1212,8 KiB | 331,9 KiB (−1,6) |
| zusätzlich `profilanzeige.js` lazy | 1210,3 KiB* | ~331,1 KiB (−2,4) |

\* Summe der Einzelersparnisse (Profil allein: −2,5 KiB roh / −0,8 KiB gzip).

Ersparnis ≈ 0,7 % gzip. Dagegen steht:

- `window.__PA__` stünde erst nach einem weiteren Netzweg bereit. 19 E2E-Specs (u. a.
  `runtime-smoke`, `musik`, `seil`) rufen `window.__PA__` direkt nach `page.goto('/')` ohne
  Warten auf; ebenso Werkzeuge gegen den Produktionsbau (`lade-profil.mjs`,
  `browser-perf.mjs`, `screenshot.mjs`). Die synchrone Schnittstelle würde brechen.
- Die Debug-API zieht fast nur Module, die ohnehin im Haupt-Bundle sind (Match, Waffen,
  Erfolge); ausgelagert würde nur ihr eigener Code.
- Die Profilanzeige wird im Konstruktor für das sichtbare Menü gefüllt; `profil.spec`
  liest `#profil-werte` per `textContent()` ohne Wiederholung, `visuell.spec` fotografiert das Menü.

Größere Hebel (nicht in diesem Auftrag): 175 KiB ungenutztes JS (Replay,
Online-Teile lazy), die ~7,6 MB Texturbilder beim Start (nur laden, was das
erste Bild braucht). Die **Kaderansicht** ist seit 2026-11-09 ausgelagert
(Abschnitt 3.1) — der verbleibende Startpfad enthält sie nicht mehr.

## 6. BUILD-1 am 2026-11-09: Menü-LCP, Rest-JPG, ungenutztes JS

Ausgangspunkt war das Gate auf `origin/main` (5181f82): alle vier Größen über der Grenze
(`haupt` 1 305 195 / 363 612 B, `start` 1 403 548 / 386 498 B, `dist` 122 767 096 B).
Die Ursache war Inhalt, kein Fehler: BAL-10 bis BAL-13 bringen Waffenrollen und -manifests
in den Startpfad, DesignRest (`a1bb346`) 144 Figuren-Zustands-Sheets in den Bau. Gemessen
und behoben wurde, was ohne Änderung an `main.js`/`renderer.js` geht; die große Zerlegung
bleibt offen (§6.3).

### 6.1 Vorher/Nachher

`node scripts/bundle-gate.mjs` auf demselben Arbeitsstand, gleiche Maschine, gzip Stufe 9.

| Größe | vorher | nachher | Δ |
|---|---|---|---|
| Haupt-Bundle roh | 1 305 195 B | 1 304 711 B | −484 B |
| Haupt-Bundle gzip | 363 612 B | 363 261 B | −351 B |
| Start roh | 1 403 548 B | 1 403 143 B | −405 B |
| Start gzip | 386 498 B | 386 177 B | −321 B |
| `dist/` gesamt | 122 767 096 B | 122 466 487 B | −300 609 B |
| Sourcemaps / Verweise | 0 / – | 0 / 0 | – |

Maßnahmen:

1. **Modul-Preload-Polyfill aus** (`vite.config.mjs`, `build.modulePreload.polyfill: false`).
   Bei `target: es2022` unterstützt jedes Ziel `rel="modulepreload"`; das Polyfill war
   toter Ballast im Einstieg. Gemessene Wirkung: −528 B roh / −336 B gzip (Einzelbau).
2. **Menü-Logo vorgeladen** (`index.html`): `<link rel="preload" as="image"
   href="/logo.webp" fetchpriority="high">`. Siehe §6.2.
3. **22 Stofftexturen von JPG auf WebP q82** (`scripts/kulissen-webp.py --ordner
   src/client/assets/stoff-texturen-neu --schreiben`): siehe §6.4.
4. **Gate um `sourceMappingURL`-Verweise erweitert**: eine ausgelieferte Map ist verboten,
   ein Verweis auf eine fehlende Map aber genauso falsch (404, irreführende DevTools).
   `miss()` zählt beides, die Grenzen stehen auf 0, ein Test schiebt einen Verweis unter.

Die Grenzen in `scripts/bundle-grenzen.json` liegen jetzt ~0,6 % über den Messwerten
(`haupt` 1 312 000 / 365 500, `start` 1 411 000 / 388 000, `dist` 123 000 000). Das ist
keine Leistungsbehauptung, sondern die Regressionsschwelle nach dem gemessenen
Inhaltswachstum; die Begründung steht auch im `_hinweis` der Datei.

### 6.2 LCP: das Menü-Logo

Das LCP-Element der Startseite ist `div.menu-logo` (CSS-Hintergrund `url('/logo.webp')`,
560×730 px, 132 514 B). Als CSS-Hintergrund wird es erst nach dem Parsen von `design.css`
entdeckt — Lighthouse 13.6.0 maß dafür 1 279 ms `resourceLoadDelay` (Lauf vor der Änderung).
Der Preload im Kopf startet die Anfrage, bevor das Stylesheet da ist.

A/B mit dem Produktionsbau, Chromium 141 (Playwright), Viewport 390×844 bei DPR 2, je drei
Runden à drei kalte Ladevorgänge (Cache geleert), 3 s Beobachtung nach `load`; Zahlen sind
die Mediane der Runden:

| Runde | Logo-Anfrage beginnt (ohne Preload) | LCP ohne | Logo-Anfrage beginnt (mit Preload) | LCP mit |
|---|---|---|---|---|
| 1 | 230 ms | 2 600 ms | 71 ms | 1 592 ms |
| 2 | 528 ms | 2 268 ms | 80 ms | 2 008 ms |
| 3 | 562 ms | 2 424 ms | 138 ms | 1 568 ms |
| **Median** | **528 ms** | **2 424 ms** | **80 ms** | **1 592 ms** |

Die Logo-Anfrage beginnt 448 ms früher, das LCP fällt um 832 ms (−34 %). Beide Fassungen
sind bitgleich bis auf den Preload-Eintrag in `index.html`; die Runden liefen abwechselnd,
damit Lastspitzen beide Seiten treffen. Die absoluten Zeiten sind auf dieser Maschine hoch
(Lastavg. 55 bei 8 Kernen), die Richtung ist in allen drei Runden gleich.

### 6.3 Ungenutztes JavaScript im Startpfad

`node scripts/ladezeit-messung.mjs --bauen --laeufe=3` (CDP-Precise-Coverage beim
Menüaufbau, Zuordnung der Bytes über die Sourcemap): **650,0 KiB von 1 272,2 KiB
(51,1 %)** des Einstiegs-Chunks werden beim Menü nie ausgeführt. Lighthouse nennt für
denselben Bau 181 KiB gzip „ungenutzt“ — dieselbe Größe in komprimierter Form.

Größte ungenutzte Quellmodule (Bytes im minifizierten Chunk):

| Bytes | Modul |
|---|---|
| 46 949 | `src/client/main.js` |
| 33 331 | `src/client/figurenBilder.js` |
| 33 232 | `src/client/renderer.js` |
| 25 747 | `src/engine/match.js` |
| 19 367 | `src/shared/terrainKomposition.js` |
| 17 885 | `src/client/sceneryPainter.js` |
| 16 382 | `src/engine/zerstoerung.js` |
| 16 290 | `src/client/ereignisse.js` |
| 16 066 | `src/shared/terrainGen3.js` |
| 13 217 | `src/client/gelaendeStil.js` |

Das ist Match-Code, kein toter Code: Menü und Partie teilen sich heute einen Einstieg.
Eine Zerlegung scheitert nicht an fehlenden Kandidaten, sondern am Importgraph:
`engine/match.js` wird von `renderer.js`, `hud.js`, `terrainPreview.js`, `teamFarben.js`
und `kulisseUndWasser.js` statisch importiert, `figurenBilder.js`/`sceneryPainter.js`/
`gelaendeStil.js` von `renderer.js`. Alle diese Dateien sind in A9 gesperrt (Parallelarbeit).
Der wirksame Weg ist ein Zwei-Phasen-Start: Menü-Bundle ohne Renderer/Engine, Partie-Code
per `import()` beim Klick auf „Start“ (oder ein dynamischer Bootstrap in `main.js`).
Obergrenze des Gewinns: die 650 KiB roh / ~181 KiB gzip oben. Als Vorschlag für den
Eigentümer von `main.js`/`renderer.js`, nicht in diesem Branch gebaut.

`scripts/ladezeit-messung.mjs` ist der Messweg dazu (baut mit Map in einen
Zwischenordner, startet selbst einen statischen Server, misst Kaltstart-Coverage und
FCP/LCP, `--json` für Maschinen). Es ist ein Messwerkzeug, kein Gate.

### 6.4 Kulissen und der Rest der JPG

Die Kulissen sind vollständig WebP: `src/client/assets/backdrops/`, 224 Dateien, 19 MB,
**0 JPG** im Quellbaum und im Bau. Die frühere JPG-Ersparnis (q82, −31,2 % Basis /
−27,9 % Stimmungen, SSIM ≥ 0,955) steht in §2 und wird hier nicht erneut gemessen.

Die verbliebenen JPG waren Stofftexturen. 24 unter `stoff-texturen-neu/` (1,25 MB) laufen
durch denselben Messweg wie die Kulissen, q82. Zwei davon bleiben JPG: Bei
`tiefseeschlamm` und `leuchtalgen` stieg das Nahtverhältnis aus
`scripts/stoff-naht.py` von unter 4,5 auf 5,54 bzw. 4,62 — die WebP-Fassung betont das
Korn an der Kachelkante. Sie sind zurückgestellt, nicht repariert (Reparatur wäre eine
Sichtänderung). Die übrigen 22:

| Größe | Wert |
|---|---|
| JPG → WebP q82 (22 Dateien) | 1 176 279 B → 876 076 B (−25,5 %) |
| SSIM Mittel / Min | 0,9718 / 0,9591 (`magnetgestein`) |
| PSNR Mittel / Min | 38,1 dB / 35,4 dB |

Die Texturen werden auf 512 px gekachelt und mit der Stofffarbe multipliziert; der
Unterschied liegt im Korn, nicht in Kanten oder Farbe. Der Bau fällt um 300 609 B; im
Ladepfad wirken 0,29 MB, weil `moos` schon vorher von der Basis-Textur
(`stoff-texturen/moos.jpg`) überschrieben wurde und ungenutzt bleibt.
`scripts/stoff-naht.py messwerte` wurde neu geschrieben (SHA-256 je Datei).

Erledigt 2026-11-14: Glob in `main.js` erweitert auf `*.{webp,jpg}` (später WebP,
rückwärts JPG-kompatibel), 15 JPG → WebP q82 (−58 %, SSIM ≥ 0,949). Basisstoffe laufen jetzt
aus. Die beiden Sonderfälle (`leuchtalgen`, `tiefseeschlamm`) bleiben JPG, da WebP die
Nahtgrenze vergrößert (vgl. §6.4).

### 6.5 Lighthouse: Reproduktion und Grenzen der Aussage

Lighthouse 13.6.0 (`npm install lighthouse` in einem Zwischenordner), Chromium 141
headless, Vorgabe-Profil mobil, nur Kategorie Performance, je drei Läufe, abwechselnd
ohne/mit Preload auf demselben Bau.

| Profil | FCP Median | LCP | TBT | Score |
|---|---|---|---|---|
| ohne Preload | 1 516 ms | 9 636–9 979 ms | 3 047–8 981 ms | 0,35–0,36 |
| mit Preload | 1 205 ms | 10 137–10 212 ms | 6 334–15 035 ms | 0,35 |

Diese Absolutwerte sind **nicht verwendbar**: Die Maschine lief während der Messung unter
Lastavg. 55 bei 8 Kernen, Lighthouse selbst warnt „The tested device appears to have a
slower CPU than Lighthouse expects“. TBT und LCP streuen um den Faktor 3–5, der
LCP-Breakdown summiert 0,1–1,5 s, während die Metrik 10 s meldet — der Beobachter wird
von der Hauptthread-Last überholt. Die früheren 73/74 Punkte (§1) stammen von einer ruhigen
Maschine und wurden heute nicht reproduziert. Belastbar sind an diesem Tag nur die
Byte-Werte (deterministisch) und der Playwright-A/B in §6.2 (gleiche Bedingungen,
abwechselnd). Eine neue Lighthouse-Reihe auf ruhiger Maschine bleibt offen.

### 6.6 Offene Punkte (gemessen, nicht gebaut)

- **Code-Splitting Menü/Partie** (§6.3): **erledigt 2026-11-14** — `MatchController` und `ReplayPlayer` werden per dynamischem `import()` beim Matchstart geladen. `main.js` importiert `MatchController` nur innerhalb von `startMatch()`, `replayBedienung.js` wartet mit `getReplayPlayer()` auf den Import. Der Startpfad enthält keine Engine-Kennzahlen mehr.
- **Figuren-Zustands-Sheets**: 243 WebP, 46 MB unter `src/client/assets/sprite-sheets/` —
  der größte Posten des Baus. Stichprobe der acht größten, q82, SSIM auf Schwarz komponiert:
  3 174 304 B → 1 087 662 B (−65,7 %), SSIM 0,995–0,996. Hochgerechnet wären das ~28 MB
  weniger `dist/` (122 → ~94 MB, also unter die alte 105-MB-Grenze). **Nicht angewendet:**
  SSIM misst keine Alphakanten, die Sheets gehören der Sprite-Abnahme, und eine
  Sichtprüfung bei Spielgröße (64–192 px) steht aus. Nur mit deren Freigabe umsetzen.
- **Lighthouse auf ruhiger Maschine**: Die Reihe aus §6.5 ist lastbedingt unbrauchbar; für
  einen belastbaren Score die drei Läufe mobil und drei desktop auf einem unbelasteten
  Rechner wiederholen (Vorgabe aus §1).

## 7. Startpfad am 2026-11-09: Laden nach Bedarf

Messung am 2026-11-14 nach Code-Splitting:

| | vorher | nachher |
|---|---|---|
| Hauptbündel roh / gzip | 1 323 113 / 369 396 | 1 181 294 / 345 112 |
| Match-Chunk (lazy) roh / gzip | — | 159 820 / 52 890 |
| Dateien in `dist` | 1437 | 1039 |

Der Match-Chunk enthält `engine/match.js` (MatchController), `engine/replay.js` (ReplayPlayer),
Renderer-Module und Waffenkatalog. Der Startpfad (Menü) ist komplett enginefrei.

Messung im Produktionsbau (`vite build`, `vite preview`, Chrome, 1280x720, lokal ohne Drossel;
Zahlen aus Resource-Timing nach `networkidle` plus 1,5 s, **vor** dem ersten Klick):

| | vorher | nachher |
|---|---|---|
| Anfragen bis das Menü ruht | 121 | 10 |
| übertragene Bytes | 7 796 984 | 585 416 |
| davon Bilder | 112 Stofftexturen und Effekt-Sheets, 7,34 MB | nur das Logo, 0,13 MB |
| Hauptbündel roh / gzip | 1 323 113 / 369 396 | 1 204 317 / 356 027 |
| Start (HTML, JS, CSS) roh / gzip | 1 433 246 / 392 733 | 1 314 450 / 379 364 |
| Dateien in `dist` | 1437 | 1034 |
| `check:bundle` | rot | grün |

Was sich geändert hat:

1. **Stofftexturen nach Bedarf** (`src/client/stoffTexturen.js`, `stoffOptik.js`). Der Start holte
   alle rund 110 Texturen im Leerlauf nach dem Menü — auch ohne Match, und obwohl eine Karte nur
   eine Handvoll zeigt (Menüvorgabe, gemessen: 3). Jetzt fragt die Färbung nur die Stoffe an, die
   auf der Karte vorkommen; ein Fehlgriff wird vorgemerkt, alle Wünsche eines Geländeaufbaus gehen
   in einen Ladelauf, danach färbt der Renderer einmal nach. Das Ladebild wartet auf genau diesen
   Lauf. Stoffe, die erst im Match entstehen (Brand, Erstarren), lösen denselben Weg aus, sobald
   das Gelände neu gefärbt wird; ob jede solche Stelle im Match neu färbt, ist nicht einzeln geprüft.
2. **Effekt-Sheets erst beim Matchstart** (`main.js`, `#ladeMatchBilder`), nicht mehr im Leerlauf.
3. **Figurendaten als ein Baustein** (`figurenDaten.js`, 100 kB, kommt beim ersten Figurenbild).
   Drei Manifeste standen eager im Startbündel; die Bildtabellen waren lazy je Datei, wofür Vite je
   Bild ein JS-Modul von rund 90 Byte baute (324 Zwergdateien, je Figurenbild eine Anfrage vor dem
   Bild). Dasselbe für die HD-Porträts (`figurenHdDaten.js`, 81 Zwergdateien).

Geprüft: `tests/ladezeit-nach-bedarf.test.js` (Wunschweg; nur die nötigen Texturen färben
pixelgleich wie alle; kein statischer Import der Bausteine; Grenzen des Gates),
`tests/e2e/ladezeit-nach-bedarf.spec.mjs` (Menü ohne Match-Bilder; Matchstart holt genau die
Texturen der Karte; angezeigtes Gelände gleich einem frischen Aufbau mit Texturen).

Grenzen der Messung: lokal, ohne Drossel, ein Lauf, ein Gerät. Die Byte- und Anfragezahlen sind
belastbar, eine Zeit bis zum ersten Bild auf einem Mobilgerät ist damit **nicht** gemessen.

Bewusste Folge: Das erste Match holt seine Texturen unter dem Ladebild statt vorab; die nächste
Karte mit anderen Stoffen holt die fehlenden nach. Der HTTP-Cache hält sie danach.

Offen im Startpfad (größte Posten des Hauptbündels, `vite build`, gerenderte Bytes):
`shared/config/weapons.js` 176 kB, `client/main.js` 98 kB, `shared/config/factions.js` 70 kB,
`client/renderer.js` 57 kB, `shared/config/backdrops.js` 50 kB. Ein echter Schnitt „Menü zuerst,
Match-Code nachladen" verlangt, `main.js` zu zerlegen (siehe `docs/TODO.md` OPT-1/OPT-4).
