# SSOT — die eine maßgebliche Quelle

**SSOT** heißt „Single Source of Truth“: Für jedes Thema gibt es genau **eine** Stelle, die verbindlich ist. Steht
woanders (in einem Bericht, einem alten Plan, einem Kommentar) etwas anderes, gilt die hier genannte Quelle, und die
andere Stelle ist veraltet. Diese Datei fasst die früheren SSOT-Dokumente zusammen: die AAB-Regeln (vorher
`docs/AAB-SSOT.md`, unten in Teil B) und den Verweis auf die Biom-Quelle (`docs/biome-ssot.md`, Teil C).

## Teil A: Welche Quelle gilt wofür

| Thema | Verbindliche Quelle | Hinweis |
|---|---|---|
| Offene Arbeit, Pläne, Entscheidungen des Auftraggebers | `docs/TODO.md` | Die einzige Aufgabenliste; andere Listen gibt es nicht mehr |
| Arbeitsregeln (Prüfen, Mergen, Kosten) | `AGENTS.md` | Nur der Auftraggeber ändert sie |
| Waffen: Werte, Namen, Seltenheit | `src/shared/config/weapons.js` (Katalog) und `src/shared/config/waffen-fassung.js` mit `waffen-f*.js` (Werte je Fassung) | `project_armageddon_weapon_index.csv` ist die Liste für Menschen |
| Startausrüstung, legendäre Waffen | `src/shared/config/ausruestung.js`, `ausruestung-spezial.js` (erzeugt von `scripts/ausruestung-zuordnen.mjs`) | |
| Fraktionen und Figuren | `src/shared/config/factions.js` | |
| Biome: Inhalte (Materialien, Objekte, Auslöser) | `docs/biome-ssot.md` | `docs/biome/*.md` wird daraus erzeugt (`node scripts/biome-dateien.mjs`) |
| Biome im Spiel, Biomregeln | `src/shared/config/biome-*.js`, `biomregeln.js` | |
| Gelände und Kartenbau | `src/shared/config/gelaende.js` (Fassungen), `src/shared/terrainKomposition.js` | |
| Regelfassungen (welche Regeln neue Partien nutzen) | je Thema `*_STANDARD` in `src/shared/config/*.js` | Tests prüfen, dass der Standard die neueste Fassung ist |
| Testzahlen | `docs/testlauf.json` | Wird von `npm run testlauf:erfassen` geschrieben, nie von Hand |
| Server-Betrieb und Kosten | `docs/betrieb-INSTANZ.md` | Ohne Eintrag dort wird nichts gemietet (`AGENTS.md` §5, §7) |
| Arsenalwert (AAB) | Teil B unten, Code `src/engine/aab.js` | |

## Teil B: AAB-Regeln (Arsenalwert-System)

### Regel-Übersicht

| Ticket | Name | Status |
|--------|------|--------|
| AAB-01 | Arsenalwert (Inventarwert) | ✅ Implementiert |
| AAB-02 | 150 Waffen im Katalog | ✅ Erfüllt (150 Waffen) |
| AAB-03 | Klassen-System | ✅ Vorhanden (`src/shared/config/classes.js`) |
| AAB-04 | Kampfwert (situationelle Handlungsfähigkeit) | ✅ Implementiert |
| AAB-05 | Waffenhistorie (3-Züge) | ✅ Implementiert |
| AAB-06 | Hybrid-Formel (60/25/15) | ✅ Implementiert |
| AAB-07 | Fairnessziel (±20% Toleranz) | ✅ Implementiert |
| AAB-11 | Match-Seed RNG | ✅ Vorhanden (`src/shared/seed.js`) |
| AAB-26 | SSOT-Dokument | ✅ Aktuelles Dokument |

---

### AAB-01: Arsenalwert

#### Definition
Der Arsenalwert ist der Summenwert aller Waffen im Inventar, berechnet aus den PowerScore-Werten in der Waffenkategorie.

#### Formel
```
Arsenalwert = Σ(powerScore(waffe) für alle Waffen im Inventar)
```

#### Implementierung
- **Datei**: `src/engine/aab.js`
- **Funktion**: `arsenwert(weaponId)`, `computeArsenalwert(weaponIds, className)`
- **SSOT**: `powerScore` Feld in `src/shared/config/weapons.js`

#### PowerScore-Referenz
| Tier | Min. Score | Farbe |
|------|-----------|-------|
| legendary | 190 | #8a2be2 |
| epic | 130 | #7228ff |
| rare | 80 | #4a90d9 |
| uncommon | 45 | #7ed321 |
| common | 0 | #9b9b9b |

---

### AAB-04: Kampfwert

#### Definition
Der Kampfwert misst die situationelle Handlungsfähigkeit eines Spielers an einem Zug.

#### Formel
```
Kampfwert = (Arsenalwert × Munitionsgewicht) + EffektBonus
```

#### Komponenten
- **Arsenalwert (60%)**: Basiswert der Waffen
- **Munitionsgewicht**: Verhältnis kampfähiger Waffen (Munition > 0)
- **Effekt-Bonus**: Heilung (+5), Schutz (+10%), Versetzen (+10)

#### Implementierung
- **Datei**: `src/engine/aab.js`
- **Funktion**: `computeKampfwert(inventar, zustaende, className)`

---

### AAB-05: Waffenhistorie

#### Definition
Eine Ringpuffer-Historie der letzten 3 Waffen-Interaktionen pro Spieler.

#### Ereignis-Typen
- `erhalten`: Neue Waffe ins Inventar
- `verloren`: Waffe wurde verworfen
- `verbraucht`: Munition leer am Ende des Zuges
- `geschossen`: Waffe wurde benutzt (geplant)

#### Historienwert
```
Historienwert = Σ( wartWert × Gewicht für Ereignis )
```
Gewicht: `erhalten` = 1.0, `verbraucht` = 0.8

#### Implementierung
- **Datei**: `src/engine/aab.js`
- **Klasse**: `WaffenHistorie`
- **Singleton**: `WAFFEN_HISTORIE`
- **Integrierung**: `src/engine/inventory.js` → `grantWeapon()`, `removeWeapon()`, `consume()`
- **Zug-Tracking**: `src/engine/match.js` → `#beginTurn()` → `setzeZug(index)`

---

### AAB-06: Hybrid-Formel

#### Definition
Ein kombinierter Wert, der alle drei Bereiche gewichtet.

#### Formel
```
Hybrid-Wert = (Arsenalwert × 0.60) + (Kampfwert × 0.25) + (Historienwert × 0.15)
```

#### Implementierung
- **Datei**: `src/engine/aab.js`
- **Funktion**: `computeHybridWert(inventar, zustaende, className, playerId)`

---

### AAB-07: Fairnessziel

#### Definition
Die Balancezwänge zwischen Spielern soll innerhalb von ±20% liegen.

#### Formel
```
Abweichung = max|Wert - Mittelwert| / Mittelwert
IstFair = Abweichung ≤ 0.20
```

#### Ausgleichsempfehlung
```
EmpfohlenerAusgleich = max(0, Mittelwert × 0.25 - min(Werte))
```

#### Implementierung
- **Datei**: `src/engine/aab.js`
- **Funktion**: `bewerteFairness(kampfwerte)`, `istUnterversorgt(kampfwert, alleKampfwerte)`

---

### API-Referenz

#### Engine-Index (`src/engine/index.js`)
```javascript
export {
  arsenalwert,
  computeArsenalwert,
  computeKampfwert,
  computeHybridWert,
  bewerteFairness,
  istUnterversorgt,
  aabStatus,
  WAFFEN_HISTORIE,
}
```

#### Inventar (`src/engine/inventory.js`)
```javascript
PlayerInventory
  .getArsenalwert(playerId)
  .getKampfwert(playerId, zustaende)
  .getHybridWert(playerId, zustaende)
  .setzeZug(zug) // für Historie-Tracking
```

---

### Waffenkatalog

- **Quelle**: `src/shared/config/weapons.js`
- **Anzahl**: 150 Waffen
- **Version**: 1.0.0 (auto-generated von `scripts/build-weapon-catalog.mjs`)
- **PowerScore**: Katalogwert, nicht dynamisch berechnet

---

### Test-Status

```
npm test: 3072 Tests, 0 Fehler ✓
```

---

### Historie

| Datum | Änderung |
|-------|----------|
| 2026-11-16 | AAB-01 bis AAB-07 initial implementiert |
| 2026-11-16 | `inventory.js` um `computeHybridWert` erweitert |
| 2026-11-16 | `index.js` für alle AAB-Exporte konfiguriert |

## Teil C: Biome

Die Inhalte aller 20 Biome stehen in [`docs/biome-ssot.md`](biome-ssot.md). Die Datei bleibt eigenständig, weil
`scripts/biome-dateien.mjs` sie einliest und daraus `docs/biome/` erzeugt.
