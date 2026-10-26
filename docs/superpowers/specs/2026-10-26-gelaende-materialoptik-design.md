# Gelände: Materialoptik → Zerstörbarkeit → Bewegung

**Stand:** 2026-10-26 · **Status:** Entwurf zur Freigabe
**Auftraggeber:** „es muss besser aussehen, mehr Diversifikation haben" · „+ generator" · „wirksam" · „optik → zerstörbarkeit → bewegung"
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

1. **Optik:** Materialien sehen aus wie in `sheet-a`/`sheet-c` — dicht, materialtypisch, ohne sichtbare Kachelwiederholung.
2. **Zerstörbarkeit sichtbar:** Ein Treffer zerlegt das Gelände **je Material** verschieden (Holz splittert, Beton bricht in Platten, Glas/Kristall zersplittert, Sand rieselt).
3. **Bewegung:** Der Boden greift je Material anders (Eis rutschig, Asche/Sand bremsen, Geröll stolpert).

## 5. Nicht-Ziele

- **Keine Änderung an Kollision, Maske oder Netcode.** Die 8-px-Stoffkarte bleibt die Wahrheit für Spiel, Hash und Replay.
- **Kein Umbau der Simulation** auf einen anderen Tick oder andere Determinismus-Regeln.
- **Kein WebGPU-Weg** (in dieser Umgebung nicht lauffähig; siehe §3).
- **Kein neues Kartenformat** — Materialkarte und Rezepte bleiben, wie sie sind.

## 6. Anti-Ziele (woran dieses Projekt scheitern würde)

- Das Gelände sieht **anders, aber nicht besser** aus (mehr Rauschen statt mehr Struktur).
- Die Optik wird teurer als der Gewinn: Rückfall auf eine Kantenlänge, bei der Figuren nicht mehr lesbar sind.
- Zerstörbarkeit verändert die **Balance** unbemerkt (30-Partien-Gates, Bot-Verhalten).
- Zwei Wege (CPU/GPU) liefern so unterschiedliche Bilder, dass ein Screenshot nicht mehr sagt, was der Spieler sieht.

## 7. Entscheidungen des Auftraggebers

| Entscheidung | Wortlaut |
| :-- | :-- |
| Reihenfolge | **Optik → Zerstörbarkeit → Bewegung** |
| Herkunft der Vielfalt | **aus dem Generator** (echte Materialadern je Karte) |
| Materialien sollen wirken | **wirksam**, nicht nur Farbe |
| Ladezeit | **zweitrangig** |
| Maßstab | die gelieferten Bildvorlagen (§ Kopf) |

## 8. Entscheidungen des Bauers (meine, nicht Ihre — prüfen Sie sie)

1. **WebGL2-Shader statt CPU-Ausbau.** Der Kern von `faerbeGelaende` wird für Material und Detail auf die GPU verlagert; der CPU-Weg bleibt als Rückfall (Kopf, Tests, kein WebGL2) und liefert dieselbe Karte in flacherer Malerei.
2. **Der Shader verzerrt nur den Blick, nicht die Daten.** Die 8-px-Zellkanten werden im Shader per Domain-Warp gebrochen; die Stoffkarte selbst bleibt unangetastet. Damit wird die Optik organisch, **ohne** Netcode, Hash oder Determinismus anzufassen.
3. **Acht Materialien bekommen eigenen Detail-Code**, die übrigen erben das ähnlichste: Erde (Wurzeln, Körnung), Fels (Platten, Risse), Sand (Dünen, Körner), Eis (Bruchkanten, Blaustich), Basalt (Säulen, Poren), Kristall (Facetten, Strahlkern), Holz (Fasern, Jahresringe), Beton (Platten, freiliegende Ziegel). Die acht decken `sheet-a` Nr. 1, 3, 5, 7, 9, 11, 13, 16 ab.
4. **Dark-Contour an Materialgrenzen** wie in der Vorlage: eine dunkle Ader dort, wo zwei Stoffe aufeinandertreffen — billig im Shader, prägend im Bild.
5. **Glut und Licht** bleiben lokal (Lava/Kristall/Magiekristall) und werden nicht zu einer globalen Beleuchtung ausgebaut.
6. **Zerstörbarkeit** nutzt die vorhandenen Felder `haerte`, `bruechig`, `brennbar`, `schmelzbar` — es kommen **keine neuen Materialdaten** dazu, nur sichtbare Folgen.
7. **Bewegung** bekommt genau **einen** neuen Wert je Stoff (Reibung) statt eines Physik-Umbaus.

## 9. Phasen mit Abnahmekriterien

### P1 — Optik (der eigentliche Auftrag)

- WebGL2-Modul `gelaendeGpu.js`: Materialkarte + Tabellen als Texturen, Fragment-Shader mit acht Materialschemata, Domain-Warp, Kontur, Glut.
- Einbau in `baueGelaendeEbene` mit Rückfall auf den heutigen CPU-Weg.
- **Abnahme:**
  - Screenshot 2560×1440 mit vier Biompaletten liegt vor; ich beschreibe, was gegen `sheet-c` noch fehlt.
  - **Kachelmuster messbar weg:** Autokorrelation der Helligkeit bei Versatz 512 px liegt unter der bei Versatz 511/513 px (heute: deutlich darüber).
  - Material ist im Bild erkennbar: acht Stoffe, je eigene Struktur, in einem Ausschnitt von 400×300 px mindestens drei Materialien sichtbar.
  - `npm test`, `npm run checks` (21 Gates), `check:docs` grün; `check:terrain` und `check:hoehlensicht` weiter grün.
  - Ladezeit dokumentiert (vorher/nachher), aber **nicht** Abnahmekriterium.

### P2 — Zerstörbarkeit sichtbar

- Trefferfolgen je Material: Holz splittert in lange Fasern, Beton in Platten, Glas/Kristall in Scherben, Sand rieselt, Metall bleibt ganz (heute schon `unzerstoerbar`).
- **Abnahme:** ein Test je Materialfamilie (Form und Anzahl der Bruchstücke), `check:zerstoerung`-Gates und die Goldwerte der Krater-Läufe neu basiert **mit Begründung im Testkopf**, Bot-Partien und Balance-Gates unverändert grün.

### P3 — Bewegung

- Ein Reibungswert je Stoff; Eis rutscht, Sand/Asche bremsen, Geröll stolpert.
- **Abnahme:** Messung der Rutschstrecke je Material auf gleicher Steigung, Bot-Partien bleiben grün (keine unerreichbaren Figuren), `check:erreichbarkeit` und `check:autonom` unverändert.

## 10. Offene Punkte (Ihre Entscheidung, nicht meine)

1. **Figurenmaßstab:** In `sheet-c` sind die Figuren winzig vor dem Terrain. Im Spiel sind sie groß. Soll das Terrain feiner werden (mehr Pixel je Materialdetail) oder bleibt der Maßstab?
2. **Zerstörbarkeit in P2:** Soll ein Treffer auch **Stoff umwandeln** (Lava verbrennt Holz zu Asche, Hitze schmilzt Eis zu Wasser)? Die Felder `brennbar`/`schmelzbar` gibt es schon — das wäre eine Mechanik, keine Optik.
3. **Rückfall-Optik:** Ist es hinnehmbar, dass ohne WebGL2 (Kopf, alte Rechner) das Gelände flacher aussieht als heute — oder muss der CPU-Weg mitwachsen?
