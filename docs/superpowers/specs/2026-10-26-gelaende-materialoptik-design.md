# Gelände: Materialoptik → Zerstörbarkeit → Bewegung

**Stand:** 2026-10-26 · **Status:** Entwurf zur Freigabe
**Auftraggeber:** „es muss besser aussehen, mehr Diversifikation haben" · „+ generator" · „wirksam" · „optik → zerstörbarkeit → bewegung" · „die karte muss details haben, prozedural sein, dynamisch wirken und agieren" · „zoombarkeit ermöglichen (bildausschnitt)" · „die karten sind nicht groß genug" · „lava unterwasser formt eine neue insel"
**Vorgabe-Bilder:** `assets/gelaende-quelle/sheet-c-querschnitt.jpg` (Maßstab), `sheet-a-sidecut.jpg` (26 Kacheln), `kontrolle.jpg` (was heute läuft), `docs/design-vorlagen/look-vorgabe-gelaende.md`

---

## 1. Warum

Das Gelände sieht heute gleichförmig aus. Der Grund ist im Code benennbar, nicht Geschmack:

- **`kontrolle.jpg` zeigt es:** acht nahtlose 512-px-Kacheln. Jede Stofffläche wird mit genau einer davon multipliziert — dieselbe Kachel wiederholt sich also alle 512 px über die ganze Karte.
- **`stoffOptik.js` bestätigt es:** `tinteStoffe` mischt je Pixel nur 58 % Stofffarbe über die Gesteinsfarbe, moduliert von einem **Muster-Schalter** mit fünf Fällen (`schichten`, `facetten`, `platten`, `fasern`, `poroes`) und der gekachelten Textur.
- **Die Materialkarte ist grob:** 8-px-Zellen, deren Quadratkanten durch einen Versatz von ±4 px nur grob gebrochen werden.
- **Kein Material hat eigene Struktur:** Fels hat keine Platten und Risse, Eis keine Bruchkanten, Kristall keinen Strahlkern, Lava keine glühenden Adern, Erde keine Wurzeln.

`sheet-c` zeigt den Gegensatz: 26 Materialien, jedes mit eigener Körnung, eigenem Glanz, eigener Lichtfarbe, ausgefransten Übergängen, dunkler Kontur an jeder Materialgrenze — und Hohlräume mit Tiefe (Wurzeln von der Decke, Stalaktiten, leuchtende Pilze in der Höhle).

## 2. Was bereits gebaut ist (belegt, nicht angenommen)

Der Auftrag „Vielfalt aus dem Generator" ist **zu einem großen Teil erledigt** — das ändert den Zuschnitt:

| Baustein | Datei | Zustand |
| :-- | :-- | :-- |
| Materialkarte als Spielzustand | `src/shared/stoffkarte.js` | 1 Byte je 8-px-Zelle, `baueStoffkarte` aus Biom-Rezept, `materialAn`, `geschuetztAm`, `stoffAmEinschlag`, `stoffHash` fürs Netz |
| Materialkatalog | `src/shared/config/stoffe.js` | **18 Stoffe** mit Härte, Radius, Tiefe, Brüchigkeit, Brennbarkeit, Schmelzbarkeit, Anfälligkeiten, Farbe, Muster |
| Rezepte je Biom | `src/shared/config/stoff-rezepte.js` | welche Stoffe ein Biom füllt |
| Zerstörbarkeit nach Material | `stoffe.js:173–177`, `einschlag.js:114–121`, `zerstoerung.js:728` | Sprengung/Splitter/Brand/Durchschlag/Beben × Härte; `bruechig >= 3` erzeugt schon Splitter |
| Schutz unzerstörbarer Stoffe | `collisionMask.js:149` | `geschuetzt` je Zelle |

Was fehlt, ist die **Optik** (Punkt 3) und die *sichtbare* Wirkung von Zerstörbarkeit und Bewegung.

## 3. Der Spielraum, den wir haben (gemessen)

Probe-Shader mit dem Muster von `faerbeGelaende` (9 Kandidatenzellen je Pixel), 2560×1440 = 3,69 Mio. Pixel:

| Weg | Kern | + `readPixels` | Summe |
| :-- | --: | --: | --: |
| CPU heute (`faerbeGelaende`) | — | — | **400,6 ms** |
| WebGL2 / SwiftShader (Software) | 230,3 ms | — | ≈ 230 ms |
| WebGL2 / Intel HD 3000 | 45,2 ms | 10,8 ms | ≈ 56 ms |
| WebGL2 / **GT 540M** (`DRI_PRIME=1`) | 31,4 ms | 12,4 ms | ≈ 44 ms |

**7–9× mehr Rechenluft.** Ladezeit ist laut Auftraggeber zweitrangig — der Spielraum darf in Aussehen fließen.

**WebGPU ist nicht verfügbar:** Vulkan kennt hier nur `llvmpipe` (CPU). Nouveau auf der GT 540M (Fermi) hat kein Vulkan, die HD 3000 ist zu alt. **WebGL2 dagegen läuft auf beiden** (GT 540M meldet NVC1/OpenGL 4.3).

## 4. Ziele

1. **Optik:** Materialien sehen aus wie in `sheet-a`/`sheet-c` — dicht, materialtypisch, ohne sichtbare Kachelwiederholung, prozedural aus Position und Seed.
2. **Maßstab und Zoom:** Die Karte wird zur *Welt*, nicht zum Bild. Gezeigt wird ein **Ausschnitt** (1 Bildschirmpixel = 1 Kartenpixel), zoombar hinein und heraus.
3. **Formate:** freie Seitenverhältnisse — 16:5 bis 5:16, quadratisch, 4:3/3:4 und alles dazwischen — bei **gleichem Flächenbudget** (§8.1).
4. **Dynamik (Stoffumwandlung):** Material verändert sich im Spiel — Lava unter Wasser erstarrt zu neuem Land, Schnee deckt zu, Vulkanasche fällt.
5. **Zerstörbarkeit sichtbar:** ein Treffer zerlegt das Gelände je Material verschieden (Holz splittert, Beton bricht in Platten, Glas/Kristall zersplittert, Sand rieselt).
6. **Bewegung:** der Boden greift je Material anders (Eis rutscht, Asche/Sand bremsen, Geröll stolpert).

## 5. Nicht-Ziele

- **Keine Änderung an Kollision, Maske oder Netcode.** Die 8-px-Stoffkarte bleibt die Wahrheit für Spiel, Hash und Replay.
- **Keine Reichweitenskalierung der 150 Waffen.** Entscheidung des Auftraggebers: die Waffen bleiben, die Karte wird zu mehr Gelände. Einzelne Waffen nachzuskalieren bleibt ein **eigener** Auftrag (mit eigener Balance-Messung), nicht Teil dieses Projekts.
- **Kein WebGPU-Weg** (in dieser Umgebung nicht lauffähig; siehe §3).
- **Kein Umbau der Simulation** auf einen anderen Tick oder andere Determinismus-Regeln.

## 6. Anti-Ziele (woran dieses Projekt scheitern würde)

- Das Gelände sieht **anders, aber nicht besser** aus (mehr Rauschen statt mehr Struktur).
- Details, die nur im Zoom existieren und bei Spielgröße wie Schmutz wirken.
- Große Karten, die **leer** sind — mehr Fläche ohne mehr Material und Form.
- Zerstörbarkeit oder Umwandlung verändern die **Balance** unbemerkt (30-Partien-Gates, Bot-Verhalten).
- Zwei Wege (CPU/GPU) liefern so unterschiedliche Bilder, dass ein Screenshot nicht mehr sagt, was der Spieler sieht.

## 7. Entscheidungen des Auftraggebers

| Entscheidung | Wortlaut / Inhalt |
| :-- | :-- |
| Reihenfolge | **Optik → Zerstörbarkeit → Bewegung** |
| Herkunft der Vielfalt | **aus dem Generator** (echte Materialadern je Karte) |
| Materialien sollen wirken | **wirksam**, nicht nur Farbe |
| Ladezeit | **zweitrangig** |
| Maßstab | „die karte muss details haben, prozedural sein, dynamisch wirken und agieren … nach der waffen-/zielmechanik eins der wichtigsten elemente" |
| Zoom | „zoombarkeit ermöglichen (bildausschnitt)" |
| Formate | 16:5 · 5:16 · quadratisch/rund · 4:3 · 3:4 — „und alles dazwischen" |
| Größere Karten | Waffen bleiben, Fläche wächst; „wobei man das balancing und bestimmte waffen nochmal nachskalieren kann" |
| Stoffumwandlung | „ja fände ich stark": Lava unter Wasser → neue Insel, Schnee bedeckt, Vulkanasche fällt |

## 8. Entscheidungen des Bauers (meine, nicht Ihre — prüfen Sie sie)

1. **Flächenbudget statt Kantenlänge.** Alle Formate bekommen dieselbe Pixelzahl; das Seitenverhältnis ist frei. Damit kostet ein 16:5-Panorama genau so viel wie ein Quadrat.

   | Format | Beispielmaße | Fläche |
   | :-- | :-- | --: |
   | heute | 2560×1440 | 3,69 Mio |
   | 16:5 | 3200×1000 | 3,20 Mio |
   | 4:3 | 2000×1500 | 3,00 Mio |
   | 1:1 | 1800×1800 | 3,24 Mio |
   | 5:16 | 1000×3200 | 3,20 Mio |
   | **Zielstufe 1** | Budget **6 Mio** (≈ 1,6× heute) | 6,00 Mio |
   | **Zielstufe 2** | Budget **14 Mio** (≈ 3,8× heute) | 14,00 Mio |

   Tempo: je Mio Pixel rund 12 ms auf der GPU (gemessen, §3) → 6 Mio ≈ 75 ms, 14 Mio ≈ 180 ms Backen.
2. **Zoom ist ein Ausschnitt, keine Skalierung.** 1 Bildschirmpixel = 1 Kartenpixel; gezoomt wird durch kleineren Ausschnitt, nicht durch Schrumpfen des Bildes. Dadurch bleibt die Detaildichte bei jedem Kartenmaß gleich — und eine 4K-Karte wird nicht auf ein Drittel verkleinert (das war der Befund von `check:map`).
3. **WebGL2-Shader statt CPU-Ausbau.** Material und Detail laufen auf der GPU; der CPU-Weg bleibt als Rückfall (Kopf, Tests, kein WebGL2).
4. **Der Shader verzerrt nur den Blick, nicht die Daten.** Die 8-px-Zellkanten werden per Domain-Warp gebrochen; die Stoffkarte selbst bleibt unangetastet — kein Eingriff in Netcode, Hash oder Determinismus.
5. **Acht Materialien bekommen eigenen Detail-Code**, die übrigen erben das ähnlichste: Erde (Wurzeln, Körnung), Fels (Platten, Risse), Sand (Dünen, Körner), Eis (Bruchkanten, Blaustich), Basalt (Säulen, Poren), Kristall (Facetten, Strahlkern), Holz (Fasern, Jahresringe), Beton (Platten, freiliegende Ziegel) — `sheet-a` Nr. 1, 3, 5, 7, 9, 11, 13, 16.
6. **Dark-Contour an Materialgrenzen** wie in der Vorlage: eine dunkle Ader dort, wo zwei Stoffe aufeinandertreffen.
7. **Glut und Licht** bleiben lokal (Kristall, Magiekristall) und werden keine globale Beleuchtung.
8. **Zerstörbarkeit und Umwandlung** nutzen die vorhandenen Felder `haerte`, `bruechig`, `brennbar`, `schmelzbar` — es kommen **keine neuen Materialdaten** dazu.
9. **Bewegung** bekommt genau **einen** neuen Wert je Stoff (Reibung) statt eines Physik-Umbaus.
10. **Der CPU-Rückfall bleibt flacher.** Ohne WebGL2 sieht das Gelände schlichter aus als heute. Sie haben die Frage nicht beantwortet — das ist deshalb meine Entscheidung, und sie ist umkehrbar.

## 9. Phasen mit Abnahmekriterien

### P1 — Materialoptik (der eigentliche Auftrag)

- WebGL2-Modul `gelaendeGpu.js`: Stoffkarte + Tabellen als Texturen, Fragment-Shader mit acht Materialschemata, Domain-Warp, Kontur, lokale Glut.
- Einbau in `baueGelaendeEbene` mit Rückfall auf den heutigen CPU-Weg.
- **Abnahme:**
  - Screenshots in Spielgröße **und** im Zoom liegen vor; ich beschreibe, was gegen `sheet-c` noch fehlt.
  - **Kachelmuster messbar weg:** Autokorrelation der Helligkeit bei Versatz 512 px liegt unter der bei Versatz 511/513 px (heute deutlich darüber).
  - In einem Ausschnitt von 400×300 px sind mindestens drei Materialien unterscheidbar, jedes mit eigener Struktur.
  - `npm test`, `npm run checks` (21 Gates), `check:docs` grün; `check:terrain` und `check:hoehlensicht` weiter grün.
  - Ladezeit dokumentiert, aber **nicht** Abnahmekriterium.

### P2 — Ausschnitt, Zoom, Kartenmaße, Formate

- Kamera: Ausschnitt-Rendering mit 1:1-Pixeln, Zoom etwa 0,75×–2×, Grenzen so, dass nie außerhalb der Karte geschaut wird.
- Generator und Kartenmaße auf **Flächenbudget** statt fester Kantenlänge (§8.1); Seitenverhältnis frei.
- **Abnahme:**
  - Formattabelle 16:5 · 4:3 · 1:1 · 3:4 · 5:16 spielbar, je ein Screenshot.
  - `check:erreichbarkeit` (30 Partien) für **jedes** Format grün.
  - Bildzeit mit `perf:browser --use-angle=gl` gemessen; Rückgang der Bildzeit oder mindestens Gleichstand gegen heute.
  - `check:map` und `check:sizes` auf die neue Regel umgestellt, mit Messung im Kopf.

### P3 — Zerstörbarkeit sichtbar

- Trefferfolgen je Material: Holz splittert in Fasern, Beton in Platten, Glas/Kristall in Scherben, Sand rieselt, Metall bleibt ganz.
- **Abnahme:** ein Test je Materialfamilie (Form und Anzahl der Bruchstücke); Goldwerte der Krater-Läufe neu basiert **mit Begründung im Testkopf**; Bot-Partien und Balance-Gates unverändert grün.

### P4 — Stoffumwandlung (Dynamik)

- Regeln: Lava + Wasser → erstarrtes Gestein (neue Insel), Hitze schmilzt Eis, Brand wandelt Holz zu Asche, fallende Asche/Schnee legt sich auf die Oberfläche.
- **Abnahme:** je Regel ein Test mit Vorher/Nachher-Bild und Zellprüfung; Determinismus über zwei Läufe gleicher Hash; Umwandlung ist im Bild sichtbar (Screenshot), nicht nur im Feld.

### P5 — Bewegung

- Ein Reibungswert je Stoff; Eis rutscht, Sand/Asche bremsen, Geröll stolpert.
- **Abnahme:** Rutschstrecke je Material auf gleicher Steigung gemessen; Bot-Partien grün; `check:erreichbarkeit` und `check:autonom` unverändert.

## 10. Offene Punkte (Ihre Entscheidung)

1. **„rund"** — heißt das nur „quadratisches Bild" (1:1), oder soll die Karte eine **kreisförmige Grundfläche** haben (Rand fällt ins Nichts)?
2. **Auflösungsdecke** — reicht Zielstufe 2 (14 Mio Pixel ≈ 3,8× heute), oder soll es weiter gehen (z. B. 33 Mio = 8192×4096, dann ≈ 400 ms Backen auf der GPU)?

