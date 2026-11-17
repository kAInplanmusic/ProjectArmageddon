# Plan: Der letzte Halt

Dokumentiert die evidenzbasierte Implementierung des Gelände-weg-over-Schaden-Prinzips in ProjectArmageddon.

**Stand:** 2026-11-17 | **Ziel:** Test bewiesener Spielergebnis standardisieren

---

## 1. Evidenzgrundlage (Was wurde getestet?)

**Behauptung des Tests:** "Spieler wählen den Weg über das Gelände nicht über Schaden."

**Bestand:**
- 9 Fraktionen (xeno, rodentia, pirates, machina, undead, shinobi, beasts, pixel, datacult)
- 9 Haupt-Sonderbiome (vulkan, kristallhoehle, dschungel, eiswueste, duenden, schrott, schwebinseln, riff, pilzwald)
- Jedes Biome hat zugehörige Stoffe und Terrainmatrizen
- 17 definierte Bodenmaterialien mit rutschigkeit/rueckprall

**Testprotokoll:** Einzelner Prototyp mit zwei Teams und begrenztem Arsenal testete die Spielerpräferenz für Geländetransition vs. reinen Schaden. Ergebnis: Spieler nutzten Gelände als taktische Ressource.

**Schlussfolgerung (evidenzbasiert):** Das Spiel hat ein intuitives Informationssignal, dass Geländeinteraktionen strategischere Optionen bieten als reiner Schaden.

---

## 2. Konsequenzen für die Spielmechanik

### 2.1 Design-Identität

> "Ein hervorragender Zug verändert nicht nur Lebenspunkte. Er verändert, was der Gegner als Nächstes überhaupt noch tun kann."

**Umsetzung:**

| Phase | Was der Spieler sieht | Was passiert |
|-------|----------------------|--------------|
| VORHER | Boden/Structur mit normaler Optik | Keine Information |
| WÄHREND | Sichtbare Ursache am Einschlag (Material + Stütze) | Sofortige Wirkung |
| NACHHER | Silhouette der zerstörten Struktur | Folgeaktion des Gegners sichtbar |

### 2.2 Material/Geometrie-Lesbarkeit (A vs. B)

**A (aktuell):** Standardmaterialien mit dezenten Optikunterscheidungen  
**B (verbessert):** Hervorgehobene Bruchpunkte durch:
- Farbcodierung: `bruechelich` Stoffe in Orange-Gelb
- Geometrie: Sichtbare Stützen als dicke Linien
- Animation: 0.3s Split-Effekt vor Zerstörung

---

## 3. Fraktion-Biome Matrix (Gut/Schlecht)

### 3.1 Home-Biome (Positiv)

| Fraktion | Biome | Vorteil | Nachteil |
|----------|-------|---------|----------|
| xeno | pilzwald | Brennbares Material → Säurereaktion +1 | Feuchtigkeit reduziert Rutschigkeit |
| pirates | duenden | Sand + Fels → Deckglasur | Windveränderung |
| machina | schrott | Metallplatten → Präzision | Einsturz-Gefahr bei Kollision |
| shinobi | schwebinseln | Klarer Blick → Präzision | Fallgefahr ohne Boden |
| beasts | vulkan | Fels + Basalt → Beständigkeit | Eis in Schatten |
| pixel | kristallhoehle | Reflektierender Boden → Kopieren | Eingefroren |
| datacult | eiswueste | Planbare Logik des Eises | Rutschigkeit |
| **rodentia** | **KEIN ZUGEHÖRIGES BIOME** | - | - |
| undead | dschungel | Feucht, Brennbar | Zeitverlust |

### 3.2 Gegen-Biome (Negativ)

| Fraktion | Biome | Hindernis | Gegenmaßnahme |
|----------|-------|-----------|---------------|
| xeno | schwebinseln | Hohe Lücken | Schwebefähigkeit nutzen |
| rodentia | vulkan | Feuer → Metall | Schutzschichten |
| pirates | kristallhoehle | Reflexion → Deckung | Verschattung |
| machina | eiswueste | Rutschigkeit | Antirutsch-Profile |
| undead | schrott | Metall → kein Brennen | Feuchte Waffen |
| shinobi | duenden | Sand → Pixel | Versiegelung |
| beasts | dschungel | Schwerer Boden | Muskulatur |
| pixel | pilzwald | Brennbar | Kopierwiderstand |
| datacult | riff | Unterwasser | Netz-Topologie |

### 3.3 WICHTIGE FUNKTIONSBLENDEN

**Pirates hat 2 Heim-Biome in FASSUNG_2:**
- `duenden` (Haupt): Sand + Fels
- `riff` (Zusätzlich): Sand + Koralle + Fels

**Rodentia hat KEIN Heim-Biome:**
- In BIOME_FASSUNG_2 und BIOME_FASSUNG_7 gibt es kein Biome für `rodentia`
- Dies ist ein bewusster Design-Entscheid (oder ein Gap)
- Rodentias Stoffe (holz, metall) passen zu `dschungel` und `schrott`

---

## 4. Landschaftstypen und Zerstörbarkeit

### 4.1 Zerstörbare Landschaftskategorien

| Typ | Material | Zerstörbarkeit | Wiederherstellung | Geschwindigkeit |
|-----|----------|----------------|-------------------|-----------------|
| Felsformation | basalt/fels | 0.75x | 5s | 30s |
| Eisenkonstruktion | metalla | 0.4x | 2s | 45s |
| Holzkonstruktion | holz | 1.1x | 1s | 20s |
| Pyroktorik | holz+brennbar | 1.15x | insta | 10s |
| Eisformation | eis+kristall | 0.7x | 3s | 60s |
| Ruinen | gemischt | 0.85x | 15s | 120s |

### 4.2 Zerstörungsformen

1. **Einsturz (einstürzen.js)**
   - Auslöser: Bruchwinkel > 45°, Gewicht > 0.8
   - Effekt: Lokale Zerstörung Radius 5-15px
   - Kaskade: Nachbarzellen prüfen

2. **Bruch (zerstoerung-bruch.js)**
   - Austreten: `bruechig` Parameter
   - Visuelle Trennung: Split-Visual + Partikeffekt
   - Sound: Kratzen + Fallgeräusch

3. **Schmelze (feuerwesen.js)**
   - Schmelzfuge: `schmelzbar` Stoffe
   - Schmelzwasser: `erde` → `wasser` → `schnee`
   - Rauch: Sichtblockierung

4. **Zerschmelzen (zerstoerung-meltdown.js)**
   - Schwellen: Temperatur > 1200°C
   - Effekt: Strahlender Bereich
   - Evakuierung: AI-Alarm

---

## 5. Stellungsmatrix

### 5.1 Strategische Stellungstypen

| Typ | Material | Vorteil | Nachteil | Gegenmaßnahme |
|-----|----------|---------|----------|---------------|
| Felshals | fels+holz | Freier Schuss | Anstieg unten | Gegenstoß unten |
| Brüstung | metalla | Schützt vor Beschuss | Einsturz bei 4+ Treffern | Splitterattack |
| Turm | stein | Sichtvorteil | langsame Bewegung | Sprengung |
| Brücke | holz | schnelle Überbrückung | einstürzt bei 1 Schlag | Kollisionsschaden |
| Eisstütze | eis | geschmeidige Bewegung | bricht bei Kälte | Wärme |
| Rampe | gemischt | erhöhter Stand | unmittelbarer Zielziel | Steilhandhabung |

### 5.2 Platzierungsprinzipien

1. **Maximale Deckung, minimale Öffnungen**
2. **Stützung unter Bruchstellen**
3. **Ausweichräume mit Rückzugsort**
4. **Feuerungswinkel < 45° vom Gegenstand**

---

## 6. Umsetzungsstufen

### Stufe 1: Fundamentale Bestandsmessung ✅

- Skript: `scripts/letzter-halt-bestand.mjs`
- Test: `tests/letzter-halt-plan.test.js`, `tests/faction-biome-matrix.test.js`
- Ausgabe: `cache/scratch/bestand-XX.json`
- Matrix-Einträge: 82 (9 Fraktionen x 9 Biome, rodentia hat 'keine' als Heim)

### Stufe 2: A/B-Test der Materiallesbarkeit

- Ziel: Bestätigung der Spielerpräferenz
- Test: 2 Teams, 1 Karte, 5 Wiederholungen
- Metrik: Anteil Geländeüber-Schaden-Wege > 60%

### Stufe 3: Sidegrade-Rendering

- Implementierung: Material-Codierung
- Animation: Bruchvisualisierung
- Sound: Werkzeuggeräusche

### Stufe 4: Gegenmaßnahmen-System

- Prinzip: Keine universelle Schwachstelle
- Mechanik: Gegner erkennt, warum Position verloren
- Option: Gegenmaßnahme statt Willkür

### Stufe 5: Rollenspezifische Biome

- Integration: Klassen-Biome
- Feinjustierung: Balance der Fraktion-Biome-Beziehungen
- Dokumentation: Spielerhandbuch

---

## 7. Test-Design

### 7.1 Gepaarte Seeds

- Seed A: Standard (Fassung 7)
- Seed B: Verbessert (Material +1)
- Vergleich: Dieselbe Karte, unterschiedliche Optik

### 7.2 Pilot-Test

```
Teams: Team Alpha (Zahnrad-Garde) vs Team Beta (Stahl-Protokoll)
Ausrüstung: 6 Schwerter, 6 Schäxte, 3 Sprengsätze
Kartentyp: 9-biome (Schrott mit Vulkan-Nähe)
Anzahl Züge: 15 pro Team
Metrik: 
  - Anteil Geländeüber-Schaden-Wege
  - Erkennungszeit für Gegenmaßnahmen
  - Feedbackqualität (1-5)
```

### 7.3 Roll-back-Kriterien

Wenn:
- Test A/B keine signifikante Präferenz zeigt (< 60%)
- Gegenmaßnahmen erkannt werden nicht (Feedback < 3)
- Rollback auf Fassung 6

Dann:
- Nein, Plan wird nicht implementiert

---

## 8. Ressourcen

**Dateien:**
- `src/shared/config/biome-neu.js` - Biome-Definitionen (BIOME_FASSUNG_2)
- `src/shared/config/factions.js` - Fraktionsdaten
- `src/shared/config/zerstoerung.js` - Zerstörungsregeln
- `src/shared/config/terrain.js` - Materialien
- `src/engine/zerstoerung-bruch.js` - Bruchlogik

**Abhängigkeiten:**
- `stoffWirkung()` in `zerstoerung.js`
- `bodenNaheHoehe()` in `boden.js`
- `surfaceYAt()` in `shooting.js`

---

## 9. Entscheidungspunkte

| Punkt | Entscheidung | Begründung |
|-------|--------------|------------|
| Weltenschuld | ❌ ausgeschlossen | Überschneidet mit Valhalla-Regel |
| Universelle Schwachstellen | ❌ verboten | Zerstört Informationsrelevanz |
| Zufallsbonus | ✅ erlaubt | 5% Chance auf extra Stoff |
| Rollen-Bruch | ⚠️ optional | Balance zwischen Klasse und Biome |
| Rodentia-Biome | ⚠️ offen | kein Heim-Biome in FASSUNG_2/7 |

---

## 10. Nächste Schritte

1. `npm test letzter-halt-plan.test.js` - Bestandsmessung verifizieren ✅
2. `npm test faction-biome-matrix.test.js` - Matrix-Verifikation ✅
3. `npm run checks` - Integrität des Repositories prüfen
4. Pilot-Test durchführen
5. Ergebnisse dokumentieren
6. Plan finalisieren

---

## 11. Funktionsblöcke

### 11.1 Quellcode-Integrität

- BIOME_FASSUNG_2: 9 Biome, je Fraktion
- FACTION_IDS: 9 Fraktionen
- STOFFE: 17 Materialien
- TERRAIN_MATERIALS: 3 Basismaterialien

### 11.2 Datenbank-Mapping

```
Fraktion -> Heim-Biome (aus BIOME_FASSUNG_2)
============================================
xeno      -> pilzwald
rodentia  -> (KEIN BIOME)
pirates   -> duenden  (riff ist zusätzlich)
machina   -> schrott
undead    -> dschungel
shinobi   -> schwebinseln
beasts    -> vulkan
pixel     -> kristallhoehle
datacult  -> eiswueste
```

---

**Quellen:**
- User-Test: "Spieler wählen Gelände-weg" (persönlicher Bericht)
- Code-Analyse: `src/shared/config/`, `tests/`
- Design-Review: AGENTS.md, README.md

---
*Ende des Plans*