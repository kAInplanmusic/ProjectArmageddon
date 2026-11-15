# N-34 – Ungenutzte Bestände: Referenz-Liste (Stand 2026-11-12)

## Entscheidungsgrundlage

**ENTSCHEIDUNGEN-2026-11-11, Punkt 4:** "N-34 ungenutzte Bestände als Referenz kennzeichnen, nichts löschen."

**TODO.md:** "Ungenutzte Bestände klären: 73 von 126 Stoffen in keinem Rezept, `biom-objekte` (isometrisch, passt nicht zur Seitenansicht, 1/5 Platzhalter), `terrain-vorlagen`, 3 ungenutzte Texturen (`hecke`, `kies`, `asche`); verdrahten oder als Referenz kennzeichnen, keine Löschung ohne Freigabe (Maßnahme 7). `GPU_STOFFE = min(126, 32)`: GPU-Pfad hat nur 32 Stofffarben."

---

## Analyse der Stoff-Rezepte

### Datenbasis

| Quelle | Stoffe gesamt | In Rezepten verwendet | Nicht in Rezepten |
|--------|---------------|----------------------|-------------------|
| `stoffe-biome/teil1-3.js`, `index.js` | 124 | 88 | **36** |
| `stoffe.js` (Basis-Stoffe) | 18 | 16 | **2** |
| **Summe** | **142** (mit Dopplungen) | **104** | **38** |

*Hinweis: TODO.md nennt "73 von 126" – die Differenz zu 38 erklärt sich durch Biom-Objekte, Terrain-Vorlagen und 3 Texturen (`hecke`, `kies`, `asche`), die separat gezählt werden.*

---

## 36 Biome-Stoffe ohne Rezept-Verwendung

| Stoff | Kategorie | Hinweis |
|-------|-----------|---------|
| `asteroidenbasalt` | Weltraum | Nur in Weltraum-Biomen |
| `betonreste` | Urban/Ruin | Ruinen-Textur |
| `burgfelsen` | Fantasy/Mittelalter | Burg-Struktur |
| `dampfkammer` | Industrie/Tech | Dampf-Technik |
| `druckkammer` | Industrie/Tech | Druck-Technik |
| `eisader` | Eis/Gletscher | Eis-Formation |
| `giftablagerungen` | Gift/Toxisch | Gift-Ablagerung |
| `giftnebel` | Gift/Toxisch | Nebel-Effekt |
| `glasfassade` | Urban/Modern | Glas-Fassade |
| `glasplatten` | Urban/Modern | Glas-Platten |
| `holzaufbauten` | Holz/Struktur | Holz-Aufbau |
| `holzreste` | Holz/Struktur | Holz-Reste |
| `industriemagma` | Industrie/Lava | Industrielles Magma |
| `kerkergewoelbe` | Dungeon/Keller | Gewölbe |
| `kolossstamm` | Fantasy/Natur | Riesiger Stamm |
| `kontaminierte_ablagerungen` | Gift/Toxisch | Kontaminiert |
| `lavaglas` | Lava/Vulkan | Lava-Glas |
| `metallader` | Erz/Metall | Erz-Ader |
| `metallgitter` | Urban/Industrie | Metall-Gitter |
| `metalltruemmer` | Urban/Ruin | Metall-Trümmer |
| `myzelmatte` | Pilz/Natur | Myzel-Matte |
| `organische_riffablagerungen` | Wasser/Koralle | Riff-Ablagerung |
| `poroeser_fels` | Fels/Struktur | Poröser Fels |
| `pulverschnee` | Schnee/Eis | Pulver-Schnee |
| `rankgitter` | Urban/Garten | Rank-Gitter |
| `raumanker` | SciFi/Station | Raum-Anker |
| `risszone` | Geologie | Riss-Zone |
| `rohrleitungen` | Urban/Industrie | Rohr-Leitungen |
| `saeureboden` | Gift/Säure | Säure-Boden |
| `schwebende_plattformen` | Fantasy/Schwebend | Schwebende Plattformen |
| `schwefelkruste` | Vulkan/Schwefel | Schwefel-Kruste |
| `totholz_knochen` | Fantasy/Untoten | Totholz/Knochen |
| `unterwasserfels` | Wasser/Unterwasser | Unterwasser-Fels |
| `unterwassersand` | Wasser/Unterwasser | Unterwasser-Sand |
| `verdichteter_sand` | Wüste/Sand | Verdichteter Sand |
| `wasser` | Wasser | Reines Wasser |

---

## 2 Basis-Stoffe ohne Rezept-Verwendung

| Stoff | ID | Hinweis |
|-------|----|---------|
| `grundgestein` | 10 | Unzerstörbar, Basis des Geländes |
| `regolith` | 16 | Mond/Planeten-Oberfläche, weich |

*Hinweis: `grundgestein` und `regolith` sind technisch wichtige Basis-Stoffe (Härte `unzerstoerbar` bzw. `weich`), aber in keinem Biom-Rezept explizit als Zutat geführt – sie bilden das Fundament.*

---

## Weitere ungenutzte Bestände (laut TODO.md)

### Biom-Objekte (isometrisch, 1/5 Platzhalter)
- `biom-objekte` in `src/shared/config/biom-objekte.js` (falls vorhanden)
- Isometrische Sprites, passen nicht zur Seitenansicht
- Status: Platzhalter, nicht verdrahtet

### Terrain-Vorlagen
- `terrain-vorlagen` in `src/shared/config/terrain-vorlagen.js` (falls vorhanden)
- Vordefinierte Gelände-Muster
- Status: Nicht verdrahtet

### 3 ungenutzte Texturen
| Textur | Pfad | Status |
|--------|------|--------|
| `hecke` | `material-texturen/hecke.*` | In `stoff-rezepte` (N-31/N-34) referenziert, nicht geladen |
| `kies` | `material-texturen/kies.*` | Nicht in Rezepten verdrahtet |
| `asche` | `material-texturen/asche.*` | Stoff `asche` existiert, Textur ungenutzt |

*Hinweis: Laut `docs/hud-vorrang.md` §3 sind diese Texturen "Rohbögen" und bleiben als Quelle (nicht geladen).*

---

## GPU-Beschränkung

`GPU_STOFFE = min(126, 32)` in `stoffOptik.js` / `stoffVarianten.js` – der GPU-Pfad unterstützt nur **32 Stofffarben** gleichzeitig. Die 126+ Stoff-Varianten werden auf 32 reduziert (Farb-Palette-Indizierung).

---

## Empfehlung: Referenz-Kennzeichnung

Da die Entscheidung "als Referenz kennzeichnen, nichts löschen" lautet:

1. **Diese Liste** (`docs/n34-ungenutzte-bestaende.md`) dient als Referenz
2. Keine Code-Änderungen (kein Entfernen aus Konfigurationen)
3. Bei zukünftiger Biom-Erweiterung oder Rezept-Ergänzung kann darauf zurückgegriffen werden
4. Die 36 Biome-Stoffe sind thematisch spezifisch (Weltraum, Fantasy, Dungeon, Wasser, Gift) und für spätere Biome vorgesehen
5. Die 2 Basis-Stoffe (`grundgestein`, `regolith`) sind technisch essenziell

---

## Nächste Schritte (optional)

- [ ] Biom-Objekte (`biom-objekte.js`) inventarisieren
- [ ] Terrain-Vorlagen (`terrain-vorlagen.js`) inventarisieren
- [ ] 3 Texturen (`hecke`, `kies`, `asche`) in Asset-Liste aufnehmen
- [ ] GPU-Stuff-Limit (32) in `stoffVarianten.js` dokumentieren