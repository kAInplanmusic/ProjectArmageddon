# Spezifikation: Materialwerte (Optik, Zerstörbarkeit, Bewegung)

Gilt für jedes Material aus `docs/biome/gesamtliste.md` (Namen laut `docs/biome/materialien-teile.json`). Ein Eintrag je Material, reine Daten, Dateien `src/shared/config/stoffe-biome/teil1.js` bis `teil3.js` (Standard-Export: gefrorenes Array). **Nicht** in `stoffe.js` eintragen, **nicht** in Renderer oder Engine einbauen.

## Regeln (aus `docs/biome-ssot.md`)

1. **Einheitlich in allen Biomen:** ein Material hat überall dieselben Werte (Metall leitet überall gleich). Keine Werte je Biom.
2. **Drei Dinge trennen:** Zerstörung (Material verschwindet), Zustandsänderung (Lava → Kruste), bloße Wirkung. Hier nur Zerstörbarkeit und die Eigenschaften, die eine Wirkung entscheiden.
3. **Nicht pauschal:** Strom nur über Leitfähiges, Feuer nur auf Brennbarem, Säure nur auf Säureempfindlichem; Wind zerstört keinen massiven Fels.
4. **Bereits im Katalog** (`src/shared/config/stoffe.js`, 18 Stoffe: erde, sand, schnee, pilz, holz, fels, eis, kristall, basalt, obsidian, asche, …): Schlüssel und alle dort stehenden Werte **unverändert übernehmen** (Zerstörbarkeit gehört dem Katalog), nur die neuen Felder ergänzen. Ob ein Name dem Katalog entspricht, entscheidet die Bedeutung, nicht der Gleichklang („ähnlich" in der Gesamtliste ist nur ein Hinweis).
5. **Werte begründen:** Wo die Wahl nicht offensichtlich ist, steht ein kurzer Kommentar über dem Eintrag (warum so hart, warum so glatt). Nichts erfinden, das der Name nicht hergibt; im Zweifel den Wert eines verwandten Katalogstoffs nehmen und es im Kommentar sagen.

## Felder je Eintrag

| Feld | Gruppe | Typ und Skala |
| :-- | :-- | :-- |
| `key` | – | klein, ohne Umlaute und Leerzeichen (`ae`/`oe`/`ue`/`ss`, Wortgrenze `_`), eindeutig; bei Katalogstoffen der Katalogschlüssel |
| `label` | – | **genau** der Name aus `materialien-teile.json` |
| `farbe` | Optik | `[r, g, b]`, ganze Zahlen 0–255 (Grundton, wie im Katalog) |
| `muster` | Optik | `koernig` · `schichten` · `facetten` · `platten` · `fasern` · `poroes` |
| `glanz` | Optik | 0–1 (0 matt, 1 spiegelnd) |
| `textur` | Optik | Dateiname ohne Endung aus `src/client/assets/stoff-texturen-neu/` oder `stoff-texturen/`, sonst `null` (Textur fehlt) |
| `kontur` | Optik | `dunkel` · `hell` · `keine` (Linie an der Materialgrenze) |
| `haerte` | Zerstörbarkeit | `weich` · `normal` · `hart` · `sehr_hart` · `unzerstoerbar` |
| `radius`, `tiefe` | Zerstörbarkeit | Zahl; Radius 0,3–1,6, Tiefe 0,3–1,4; bei `unzerstoerbar` beide `0` |
| `bruechig` | Zerstörbarkeit | ganze Zahl 0–4 (Nebenbrüche bei Wucht) |
| `brennbar`, `schmelzbar` | Zerstörbarkeit | boolesch |
| `leitfaehig` | Zerstörbarkeit | boolesch (leitet Strom) |
| `anfaellig` | Zerstörbarkeit | Objekt: Wirkgruppen `wucht`, `hitze`, `kaelte`, `aetz`, `strom`, `nass` → Faktor 0,5–1,8 (fehlt = 1) |
| `bruch` | Zerstörbarkeit | `splitter` · `platten` · `scherben` · `rieseln` · `faser` · `schmelzen` · `ganz` (Trefferfolge) |
| `reibung` | Bewegung | 0,1–1,6; 1 = normaler Boden, Eis ≈ 0,15, Sand/Asche ≈ 1,2 |
| `bremst` | Bewegung | 0–0,8 (Verlangsamung beim Laufen; 0 = keine) |
| `traegt` | Bewegung | boolesch (Figuren können stehen) |
| `versinkt` | Bewegung | boolesch (Treibsand, Schlamm: Figur sinkt) |

Flüssigkeiten und Abgründe (Wasser, Lava …) stehen **nicht** hier, sondern bei den Fluiden. Steht ein Fluid-ähnlicher Name in der Materialliste (z. B. „Wasser", „Wasserader", „Dampfkammer"), wird er als begehbarer oder durchdringbarer Stoff beschrieben, nicht als Fluid, und der Kommentar sagt, wie er gemeint ist.

## Prüfung

`tests/stoffe-biome.test.js` prüft: jedes Material genau einmal, Labels wie in `materialien-teile.json`, alle Felder in der Skala, eindeutige Schlüssel, Katalogstoffe unverändert. Dazu laufen `npx eslint` auf der Datei und `node --test tests/stoffe-biome.test.js`.
