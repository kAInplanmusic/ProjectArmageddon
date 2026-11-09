# Figuren: Ausrüstung, Zustand-Sheets und fehlende Hocke

Stand 09.11.2026, Branch `bg/figur-zustand` (Abzweig von `main` 67684f7). Bearbeitet: Audit A04, A05, A06 aus [fraktions-optik-audit-2026-11-08.md](fraktions-optik-audit-2026-11-08.md). Keine Bildproduktion, kein Manifest-Eingriff in `src/client/assets/sprite-sheets/manifest.json`.

## A04 — Körper und Ausrüstung getrennt

Neue Regeldatei `src/client/figurAusruestung.js`. Standard ist **`getrennt`**: unbewaffneter Körper, Waffe/Requisit als eigenes Sprite am Anker. Nur ausdrücklich geprüfte Figuren weichen ab:

| Figur | Art | Körperteil | Anker | zusätzliches Waffen-Sprite |
|---|---|---|---|---|
| Hydra Titan-Mech | montiert | Armkanone | halterung | unterdrückt |
| Heavy-Battery Mörser-Bot | montiert | Mörserrohr auf Kettenfahrwerk | halterung | unterdrückt |
| Nullpointer-Kultist | montiert | Kanonenarm | halterung | unterdrückt |
| Iron-Hook-Harry | montiert | Hakenprothese statt Hand | hand | bleibt (Werkzeug, keine abgefeuerte Waffe) |
| Stalker Predax | angeboren | Unterarmklingen | hand | bleibt |
| Vortex Grabber | angeboren | Greiftentakel | hand | bleibt |
| Sgt. Acid-Xeno | angeboren | Säurespitzen, Chitinpanzer | hand | bleibt |
| Flame Jaws | angeboren | Flammschlund, Krallen | maul | bleibt |
| Plasma Maw Zorg | angeboren | Plasmamaul | maul | bleibt |
| Sonic Blossom | angeboren | Blütenkörper, Ranken | schwebe | bleibt |
| Quantum Qubit-Knight | getrennt | Schild am Rücken, Energieklinge in der Hand | ruecken | bleibt |

Durchsetzung im Renderer (`renderer.js`): Bei `waffeAmKoerper()` wird weder Waffen-Sprite noch Waffen-Ikone noch das prozedurale Rohr gezeichnet. Die Figur feuert weiter (Mündungsblitz und Rückstoß kommen aus der Waffenanimation), es entsteht aber kein zweites Rohr neben der eingebauten Kanone. Der Ausrüstungszustand steht zusätzlich in `figurPosen.zustand(id).ausruestung` für die Diagnose.

Wichtig: angeborene Krallen unterdrücken **nichts**. Eine Kreatur darf zusätzlich ein Requisit tragen; die Kralle bleibt trotzdem Anatomie. Nur montierte Körperwaffen, die dieselbe Waffe ein zweites Mal zeigen würden, blenden das separate Sprite aus.

### Renderer-Anker für neue Requisiten

| Anker | Status | Wofür | Betroffene Figuren |
|---|---|---|---|
| `hand` | vorhanden | gehaltene Waffe | alle `getrennt`-Figuren |
| `halterung` | vorhanden (`handAufbau`) | Lafette/Aufbau statt Hand | Fahrzeuge, Mech-Teile |
| `muendung` | vorhanden, aber **je Waffe** | Mündungsblitz | alle Schusswaffen |
| `muendungJeFigur` | **fehlt** | Körperwaffe feuert aus festem Punkt | Hydra, Mörser-Bot, Nullpointer-Kultist |
| `maul` | **fehlt** | Atem/Biss/Säurestrahl | Flame Jaws, Plasma Maw Zorg |
| `ruecken` | **fehlt** | Schild, Köcher, Rucksack | Quantum Qubit-Knight, Rail-Viper (Köcher) |
| `schwebe` | **fehlt** | Requisit ohne Hand | Sonic Blossom, Drone Theta, Cosmic Meditate, Ethereo, Banshee Beatrice, Phantomal-A, Harbinger Zeta, Grid Drifter |

Diese vier fehlenden Anker sind die eigentliche Renderer-Arbeit. Ohne sie kann ein Requisit nur am Hand- oder Lafettenpunkt sitzen und würde bei Schwebern, Mäulern und Rückenausrüstung sichtbar falsch hängen.

## A05 — Zustand-Sheets sind Quellmaterial

Geprüft: `figurenBilder.ladeBlatt` lud bisher ausschließlich `walk` und `aktion`. Alle 81 `__zustand.webp` existieren und stehen im Manifest, wurden aber von keiner Spielanimation gelesen — tote Dateien, die in Berichten als Animationsblätter mitgezählt wurden.

Entscheidung: **Quellmaterial, nicht verdrahtet.** Belegt am Kontaktbogen (Zellen 0–3 je Figur, u. a. `rodentia/00_commander-chewk`, `pixel/02_pyrofox-b`):

- Zellen 1–2 zeigen Wasserspritzer und nasse Untergründe, die fest ins Bild eingebrannt sind. Im Spiel würde die Figur auf trockenem Terrain im Wasser stehen.
- Die Anatomie weicht ab: Commander Chewk trägt im Zustand-Sheet keine Stiefel, Pyrofox-B verliert Hose und Rüstungsteile der Seitenansicht.
- Die Reihenfolge „Hocke, Fallen, Schwimmen A/B, Ertrinken, Jubeln, Winken, Posieren“ ist je Figur nicht garantiert; Zelle 0 ist nur bei einem Teil der Figuren tatsächlich eine Kauerpose.

Umsetzung:

- `figurSheets.js` dokumentiert das im Modulkopf und exportiert `ZUSTAND_ZELLEN` (Zellreihenfolge) sowie `zustandHockeZelle()`.
- Eine Zustand-Zelle wird **nur** verwendet, wenn das Manifest sie ausdrücklich freigibt: `hockeQuelle: { blatt: 'zustand', zelle: 0, geprueft: true }`. Ohne `geprueft === true` liefert die Funktion `null`.
- `figurenBilder.ladeBlatt` hängt die Zustand-URL nur bei freigegebener Zelle in die Ladeliste. Ohne Freigabe entsteht kein Netzwerk-Request; eine tote Datei kann so nicht als Animation auftauchen.
- `scripts/check-sprites.mjs` nennt das Zustand-Sheet im Kopf jetzt Quellmaterial statt Animationsblatt.

Der Vorschlag für die 22 Kandidaten steht in `docs/DesignRest/manifest-figur-zustand.json`. Alle 22 sind dort mit `geprueft: false` geführt, vier davon als `kandidat: true` (Morgana, Chewk, Igor, Predax). Freigabe bleibt eine Einzelbildabnahme, keine automatische Übernahme.

## A06 — 22 fehlende Hockrollen

Alle 22 Einträge aus dem Audit bestätigt. Sie teilen exakt denselben Rollensatz (`idle [0,1]`, `luft 2`, `treffer 5`, `tod 7`), es fehlt nur `hocke`. Sichtprüfung der Kandidatenzelle 3 im Aktionsblatt ergab **keine** versteckte Hocke: die Zellen zeigen Jubel (Mörser-Bot), Zwischenschritt (Grid Drifter), Stehen oder Angriff. Eine Umklassifizierung wäre also eine falsche Ersatzpose und unterbleibt.

Ersatz je Morphologie (`HOCKE_ERSATZ` in `figurAnimation.js`):

| Typ | Ersatz | Wirkung |
|---|---|---|
| humanoid | `menschlich` | Kniebeuge wie bisher |
| wesen | `daempfen` | gedämpftes Absenken ohne Kniebeuge |
| tier, schwarm | `daempfen` | federnde Stauchung, halbe Stärke |
| fahrzeug | `absenken` | Körper senkt sich, kein breiterer Stand, keine Kniebeuge |
| schweber | `absenken` | Schwebehöhe sinkt kurz ab |

Die Pose setzt bei `absenken` ein `dy` nach unten und nur minimale Stauchung (Faktor 0,15 statt voller `landeStauch`); bei `daempfen` halbe Stauchung. Ein echter Blatt-Frame hat immer Vorrang (`hockeArt = 'blatt'`). Der Zustand steht als `z.hockeArt` bereit.

| Figur | Typ | Ersatz | Zustand-Zelle 0 |
|---|---|---|---|
| beasts/10_flame-jaws | tier | daempfen | Vierbeinerhaltung, abweichende Anatomie |
| beasts/22_sonic-blossom | schweber | absenken | kniende Blütenfigur, keine Standlinie |
| datacult/20_buffer-flow-swarm | schwarm | daempfen | Schwarm ohne Gliedmaßen |
| machina/11_heavy-battery-moerser-bot | fahrzeug | absenken | Ketten tief, kein Hocken möglich |
| machina/20_grid-drifter-datastream | schweber | absenken | kniende Schwebeform |
| machina/22_overlord-kernel-panic | humanoid | menschlich | stehende Robe |
| pirates/20_voodoo-witch-morgana | humanoid | menschlich | Kauerpose, Kandidat |
| pixel/02_pyrofox-b | tier | daempfen | ohne Hose/Rüstung, Identität weicht ab |
| pixel/12_shieldmon | tier | daempfen | stehend, Panzer deckt Beine |
| pixel/20_phantomal-a | wesen | daempfen | Tentakel, keine Beine |
| pixel/22_arcanus-b | humanoid | menschlich | stehend |
| rodentia/00_commander-chewk | humanoid | menschlich | Kauerpose, Kandidat, Stiefel fehlen |
| rodentia/02_vanguard-captain-rix | humanoid | menschlich | stehend |
| rodentia/10_sharpshooter-quill | humanoid | menschlich | stehend |
| rodentia/12_volley-captain-spark | humanoid | menschlich | stehend |
| rodentia/20_alchemage-nibble | humanoid | menschlich | stehend |
| rodentia/22_grand-conduit-vex | humanoid | menschlich | stehend |
| shinobi/11_rauch-meister-genzi | fahrzeug | absenken | Kettenfahrzeug, Dampf eingebrannt |
| undead/11_pitcher-igor | humanoid | menschlich | geducktes Skelett, Kandidat |
| xeno/01_stalker-predax | humanoid | menschlich | geduckte Jägerhaltung, Kandidat |
| xeno/11_desintegrator-kael | humanoid | menschlich | stehend |
| xeno/20_harbinger-zeta | schweber | absenken | tief schwebend |

Fehlende Rolle bleibt sichtbar: `waehleRolle()` liefert weiter `null`, der Renderer zeichnet die Seitenansicht mit der prozeduralen Pose. Es wird keine fremde Zelle eingesetzt.

## Prüfungen

- `node --test tests/figur-zustand-hocke.test.js` — siehe Testausgabe unten.
- `node --test tests/figur-sheets.test.js tests/figur-emotion.test.js tests/figur-typen.test.js` — unverändert grün.
- `npx eslint src/client/figurAusruestung.js src/client/figurSheets.js src/client/figurAnimation.js src/client/figurenBilder.js src/client/renderer.js tests/figur-zustand-hocke.test.js`
- `node scripts/check-sprites.mjs` ist nicht Teil dieses Laufs (Playwright/Chromium-Umgebung, siehe Audit).

## Offen

- Die vier fehlenden Renderer-Anker (`maul`, `ruecken`, `schwebe`, `muendungJeFigur`) sind dokumentiert, aber nicht implementiert. Sie brauchen Zeichencode und Sichtabnahme, keine reinen Daten.
- Vier Zustand-Zellen sind Kandidaten, aber nicht freigegeben. Freigabe erfordert Einzelbildabnahme jeder Zelle gegen die Seitenansicht.
- Neue Hocke-Frames für die 22 sind nicht produziert; der Ersatz ist bewusst die Zwischenlösung.
- Browser-E2E und Sichtprüfung im laufenden Spiel stehen aus (Playwright-Chromium fehlt in dieser Umgebung).
