# ARCHIVE — ProjectArmageddon

Dokumentation archivierter/unbenutzter Exports

---

## Export ohne Leser (nicht importiert von außen)

### `ausruestungAmKoerper` (entfernt)
**Datei:** `src/client/figurAusruestung.js:121`

**Beschreibung:** Prüft, ob die Ausrüstung für eine Figur angeboren oder montiert ist.

**Status:** **Vollständig entfernt** (15.11.2026)

**Begründung:** Funktion wurde nicht von keinem anderen Modul importiert und auch nicht intern verwendet. `waffeAmKoerper` nutzt ähnliche Logik und reicht als Ersatz. Bei Bedarf kann die Funktion neu implementiert werden.

---

## Verwendete Konstanten mit dynamischer Berechnung

### `IOS_CANVAS_MAX_PIXEL`
**Datei:** `src/engine/kartenWahl.js:29`

**Beschreibung:** Größte Canvasfläche von iOS-Safari (4096 × 4096 = 16 777 216 Pixel).

**Status:** Exportiert und verwendet in `pruefeKolossal` (15.11.2026)

**Änderung:** Konstante wurde definiert und anschließend in die Fehlermeldungen von `pruefeKolossal` integriert, um dynamische Berechnung der Pixel-Werte zu ermöglichen.

---

## Falsch-positive Funde (nicht archivieren)

Folgende Exporte wurden als "ohne Leser" gemeldet, sind aber **innerhalb ihrer Module aktiv verwendet**:

| Export | Datei | Verwendung |
|--------|-------|------------|
| `zeigeBauinfo` | `src/client/bauinfo.js` | Selbstaufruf am Dateiende (IIFE) |
| `DREH_ABFRAGE` | `src/client/drehHinweis.js` | In `bindeDrehHinweis` verwendet |
| `ZERBIRST_DAUER_S` | `src/client/feuerwesenZeichnen.js` | In `zeichneFeuerwesenZerbersten` verwendet |
| `RAND_BREITE` | `src/client/figurRandlicht.js` | In `saumBauen` verwendet |
| `RAND_FARBE` | `src/client/figurRandlicht.js` | In `saumBauen` verwendet |
| `ANGST_MIN` | `src/client/figurReaktion.js` | In `angstDauer` verwendet |
| `ANGST_SPANNE` | `src/client/figurReaktion.js` | In `angstDauer` verwendet |
| `DREHPUNFT` | `src/client/figurReaktion.js` | In `saltoVersatz` verwendet |
| `IDENTITAETSKRITISCHE_ROLLEN` | `src/client/figurSheets.js` | In `freigabeFuer` verwendet |
| `dunkleNachTiefe` | `src/client/gelaendeStil.js` | In `faerbeGelaende` verwendet |
| `toeneNachPalette` | `src/client/gelaendeStil.js` | In `faerbeGelaende` verwendet |
| `GRAFIK_WAHLEN` | `src/client/grafikStufe.js` | In `liesWahl` und `schreibeWahl` verwendet |

---

## Eintritspunkte (falsch-positive tote Dateien)

| Datei | Beleg |
|-------|-------|
| `src/client/messung/messseite.js` | Wird in `messung.html` als Script tag geladen |
| `src/client/webStart.js` | Wird in `vite.config.mjs` für Web-Build eingebunden |

---

Erzeugt: 2026-11-15