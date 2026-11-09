# Ladezeit und Auslieferungsgröße (BLD-1 / BUILD-1)

Stand 2026-11-05. Gemessen auf dem Produktionsbau (`npm run build` + `vite preview`),
Chromium 1194 unter `/opt/pw-browsers/chromium` (`--headless=new --no-sandbox`), 4 Kerne,
Container ohne GPU. „Vorher“ = `2413c4f` (JPG-Kulissen), „Nachher“ = WebP-Kulissen + Gate.

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

## 4. Sourcemaps

`vite.config.mjs` setzt `build.sourcemap: false`; im Bau liegt keine `*.map`, kein Chunk trägt
`sourceMappingURL`. Das Gate hält das fest (Grenze 0), `tests/bundle-gate.test.js` prüft die
Einstellung.

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
