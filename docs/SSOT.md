# SSOT — die eine maßgebliche Quelle

**SSOT** heißt „Single Source of Truth“: Für jedes Thema gibt es genau **eine** Stelle, die verbindlich ist. Steht
woanders (in einem Bericht, einem alten Plan, einem Kommentar) etwas anderes, gilt die hier genannte Quelle, und die
andere Stelle ist veraltet. Diese Datei fasst die früheren SSOT-Dokumente zusammen: die AAB-Regeln (vorher
`docs/AAB-SSOT.md`, unten in Teil B) und den Verweis auf die Biom-Quelle (`docs/biome-ssot.md`, Teil C). Teil D hält das
**Wunschbild des Auftraggebers** fest: wie das Spiel werden soll. Was davon schon gebaut ist und was fehlt, steht dort je
Punkt mit Verweis auf die Aufgabe in `docs/TODO.md`.

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
| Wunschbild des Spiels (Ziel) | Teil D unten | Aussagen des Auftraggebers; Änderungen nur durch ihn |
| Kartengröße | `src/engine/karte.js` (`MAP_SIZES`, `MAP_GROESSEN`, `mapGroesseFuerFiguren`), Menüvorschlag `src/client/kartenVorschlag.js` | „Automatisch“: `MAP_GROESSE_AUTO`, `kartenMasseFuer` (TODO 2.12b); online `mapWidth`/`mapHeight` vom Server |
| Seed, neue Karte je Partie, Revanche | `src/client/revanche.js`, `#seedFuerRevanche` in `src/client/main.js`, Seed-Feld `#cfg-seed` in `index.html` | Revanche zieht eine neue Karte (TODO 2.12c) |
| Schwerkraft | `src/shared/config/biomregeln.js` (`schwerkraftFuer`), Physik `src/engine/systems/physicsSystem.js`, `characterSystem.js`, `src/engine/physics/ballistics.js` | Heute nur Betrag nach unten; Richtung je Kartenart geplant (TODO 2.12a, Entscheidung 2026-11-28) |
| Wetter | Bild: `src/client/wetterZustand.js` (`WETTER_ACHSEN`); Wirkung: `src/shared/config/wind.js`, `src/shared/config/hagel.js`, `src/engine/hagel.js` | Wirkung weiterer Wetter geplant (TODO 2.13) |
| Besucher und Ereignisse | `src/shared/config/guenther.js`, `src/engine/guentherRad.js`, `src/shared/config/cookie.js`, `src/shared/config/ereignisse.js` (Fassung 2: Blondine, Gewitter, Erdbeben), `src/engine/systems/ereignisSystem.js` | TODO 2.13 |
| Feuer, Lava, Stoffreaktionen | `src/engine/systems/feuerSystem.js`, `src/shared/config/feuer.js`, Stoffe `src/shared/config/stoffe.js` | Gefrieren/Schmelzen geplant (TODO 2.12e) |
| Kisten, Minen, Fässer, Biomobjekte | `src/shared/config/bodenobjekte.js`, `src/engine/systems/bodenobjektSystem.js` | Mehr Biomobjekte geplant (TODO 2.12d) |
| Portal | `src/engine/portal.js`, Spezifikation `docs/auftraege/portal.md` | |
| Kulissen (Hintergründe) | `src/shared/config/backdrops*.js`, Bilder `src/client/assets/backdrops*`, Boden nach Motiv `src/client/bodenMotiv.js` | Herkunftstabelle geplant (TODO 2.12g) |
| Ereignisnamen und Drahtformat | `src/shared/ereigniskatalog.js`, `src/shared/protocol.js` | `tests/event-coverage.test.js` prüft Fundstellen in `main.js` mit Zeilennummer: nach Verschieben nachführen |

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

## Teil D: Wunschbild des Auftraggebers (Stand 2026-11-28)

So soll das Spiel werden (Aussagen des Auftraggebers, geordnet). Die rechte Spalte sagt, wie weit der Code ist.

| Bereich | Wunschbild | Stand im Code / Aufgabe |
|---|---|---|
| Biome | 20 Biome, jedes mit den vom Auftraggeber hochgeladenen und verbesserten Hintergründen, mit Effekten, Besonderheiten und Varianten | 20 Biome, 81 Kulissen; Herkunft je Kulisse nicht belegt → TODO 2.12g, 4.5 |
| Elemente | Je Biom eigene Elemente (Bäume, Autos, Pilze …), teils geteilt, teils eigen; jedes in Varianten (Farbe, Form, Größe) mit Eigenschaften: beweglich, zerstörbar, explosiv oder nichts | Spielwirksam nur 7 Biomobjekte (explodieren); Pflanzen nur Bild → TODO 2.12d |
| Gelände | Jedes Gelände hat eigene Eigenschaften und reagiert anders auf Beschuss; Quellen wirken aufeinander: Holz und Bäume brennen, Wasser gefriert, Eis schmilzt oder zersplittert | Brennen, Asche, Lava erstarrt, Löschen, spröde Stoffe brechen: gebaut; Gefrieren und Schmelzen fehlen → TODO 2.12e |
| Schwerkraft | Runde Karten: Schwerkraft zur Kartenmitte. Schwebekarten: keine oder schwache Atmosphäre (Entscheidung 2026-11-28) | Heute überall nach unten → TODO 2.12a |
| Kartenformen | Extrem breit und niedrig oder sehr hoch und schmal; kleine und große Höhlen und Inseln, Berge, Täler, Planeten, abstrakte Konstrukte; zwei komplett getrennte Inseln | Formate 24:9 bis 9:24, Zonenarten, Planeten, Archipel/Inselgruppe: gebaut (Geländefassung 19); Landhöhe variieren → TODO 2.4 |
| Strukturen | Brücken, Boote, Geheimtunnel, Portale, Teleport-Auslöser | Brücken (Gelände 11), Kartenportal (20 % der Partien): gebaut; Boote, Geheimtunnel, Auslöser fehlen → TODO 2.12f |
| Ereignisse | Schnee und Blizzard, Regen, Tsunami bzw. Hurrikan, Gewitter mit Blitz, Erdbeben, Vulkanausbruch, Rattenplage, Flugzeugabsturz, UFO, UFO-Absturz, U-Boot-Unfall | Gewitter und Erdbeben wirken (Ereignisfassung 2); übriges Wetter nur Bild (außer Wind, Hagel) → TODO 2.13a–j |
| Besucher | Heiler **Dr. Stilzchen-Rumpel**; alte, verwirrte, strickende Landstreicherin, die Gummibärchen isst; dünner, verpeilter Dealer (tauscht Waffen gegen Leben, andere Waffen oder Züge); süße Blondine: küsst und heilt (+10 bis +50) oder lacht aus (−69), Verhältnis 8 : 1 | Günther, Cookie und die Blondine (Ereignisfassung 2, Anzeige als Protokollzeile) sind gebaut; die übrigen fehlen → TODO 2.13k–m |
| Karte je Partie | Keine Karte gibt es zweimal, kein Neu-Erzeugen: gespielt wird, die nächste Karte wird neu erzeugt. Das Biom nur auf Wunsch wählbar | „Spielen“ würfelt alles, Biom optional: gebaut; Revanche auf neuer Karte → TODO 2.12c (Paket offen, Abschnitt 10) |
| Kartengröße | Richtet sich nach der Spielerzahl: 2 → klein bis mittel, 3 → mittel bis groß, 4 → groß, 5 → groß bis riesig, 6 → riesig; dazu Zufall von −25 % bis +50 % (Entscheidung 2026-11-28) | „Automatisch“ gebaut, „Spielen“ nutzt es; Menü-Vorgabe noch „groß“ → TODO 2.12b |
| Bedienung | Handy und iPad zuerst, Tastatur an zweiter Stelle; nur Querformat | gebaut, Sichtabnahme am Gerät offen → TODO 2.1 |
| Stil | Alles Comic; Spaß und Action zuerst, viel Zufall mit Absicht | Leitlinie für alle Entscheidungen |

