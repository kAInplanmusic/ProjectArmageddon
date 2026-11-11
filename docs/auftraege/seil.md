# Auftrag: Seil — das Ninja Rope aus Worms

*Stand: 2026-11-11 · Status: **gebaut (Seilfassung 3 ist Standard für neue Partien; Fassung 2 bleibt bitgleich).**
Entscheidung des Auftraggebers 2026-11-03: fehlende Konstanten werden angenähert, jede Annäherung ist als solche
markiert. 2026-11-11: fünf Werte vom Auftraggeber festgelegt (Fassung 3, siehe Wertetabelle).*

## 1. Was belegt ist

- Das Ninja Rope ist ein Bewegungswerkzeug: Es wird an einen Punkt geschossen und zieht die Figur dorthin.
- **Maximale Länge je Kraftstufe** (Worms Knowledge Base `worms2d.info/BattyRope`, Worms Wiki Fandom): Stufe 1 =
  294–297 px, 2 = 336–339, 3 = 378–381, 4 = 420–423, 5 = 462–465.
- **Neu schwingen:** Mit der Feuertaste lösen, in der Luft erneut feuern. Wer den Boden berührt, verliert nicht
  genutzte Neuwürfe. Stufe 1 = 1 Schuss, 2 und 3 = 2, 4 = 3, 5 = unbegrenzt.
- **Handhabung:** Feuertaste schießt; Pfeiltasten ziehen bzw. geben Schwung; Feuertaste löst das Seil.
- **Waffen vom Seil:** jede Waffe außer Nahkampf und Selbstmordbomber; Bomben mit der Sprungtaste fallen lassen.
- Kürzeres Seil = stärkerer Schwung (Worms Wiki, „Tips & Tricks“). Rope Knocking: offline aus.
- **Neu recherchiert (2026-11-03):**
  - WA rechnet mit **50 Physikschritten je Sekunde** (worms2d.info „Worms Armageddon 3.8 Features“).
  - Schwerkraft WA: **0,24 px/Schritt²** (`0x00003D70` = 15728/65536; worms2d.info „Game scheme file“, Feld Gravity).
  - **Maximum Rope Speed** Vorgabe **16,0 px/Schritt** (`0x00100000`, ebenda; Text der WA-3.8-Sprachdatei: „The
    maximum speed at which a worm with a Ninja Rope or Bungee attached can move, in pixels per frame“).
  - Abschuss nicht unter den Horizont: Die Option „Unrestrict Rope“ „allows firing the rope 54 degrees below the
    horizon, and reduces rope friction/drag“ (WA-3.8-Sprachdatei) — ohne sie also nur darüber, und es gibt eine
    Seilreibung.
  - Nicht erreichbar: die Physikseiten von worms2d.info (Bot-Sperre), Archive.org (Verbindung abgewiesen). Ein
    Quelltext mit den übrigen Konstanten (OpenWA/WormKit) wurde nicht gefunden.

## 2. Wertetabelle (`src/shared/config/seil.js` — EINE Datei, Tabelle je Fassung)

Umrechnung WA → hier: Tempo × 50/60, Beschleunigung × (50/60)². Maßstab 1 : 1 (WA-Figur rund 20 px hoch, unsere
14 × 20 px). Spalte „Fassung 3“ gilt für neue Partien; „Fassung 2“ bleibt für alte Replays unverändert
(`SEIL_FASSUNG_2`, `seilWerte(2)`).

| Wert | Fassung 2 | Fassung 3 (Standard) | Herkunft |
|---|---|---|---|
| `laengen` (Stufe 1–5) | 297, 339, 381, 423, 465 px | wie Fassung 2 | belegt (oberer Wert der Spanne) |
| `schuesse` je Flugphase | 1, 2, 2, 3, ∞ | wie Fassung 2 | belegt |
| `standardStufe` | 5 | 5 (bestätigt) | **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung); welche Stufe das WA-Standardschema hat, ist nicht belegt (Rope-Race-Schemata: 5) |
| `winkelMin`/`winkelMax` | 0 … π (nie unter den Horizont) | wie Fassung 2 | belegt (Unrestrict Rope); das 45°/90°-Fenster der BattyRope-Tabelle ist ohne Zuordnung, genommen ist das volle |
| `schwerkraft` | 0,42 px/Takt² | wie Fassung 2 | abgeleitet: wie die Figuren (`CharacterSystem`); WA wäre 0,1667 — das Pendel schwingt hier 1,59-mal schneller |
| `maxTempo` | 13,33 px/Takt (800 px/s) | wie Fassung 2 | belegt (16 px/Schritt × 50/60); gilt nach dem Lösen bis zur Landung |
| `kletterTempo` | 2,5 px/Takt (150 px/s) | **3,2 px/Takt** | Fassung 2: Annäherung (Einholen eines 300-px-Seils in WA-Aufnahmen rund 2 s); Fassung 3: **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung) |
| `minLaenge` | 20 px | **18 px** | Fassung 2: Annäherung (eine Figurenhöhe); Fassung 3: **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung) |
| `schwung` | 0,05 px/Takt² | **0,07 px/Takt²** | Fassung 2: Annäherung (≈ 12 % der Schwerkraft); Fassung 3: **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung; 17 % der Schwerkraft) |
| `reibung` | 0,999 je Takt | **0,99995 je Takt** | Fassung 2: Annäherung (WA hat eine Seilreibung, ihr Wert ist nicht belegt; ≈ 6 % je Sekunde); Fassung 3: **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung; ≈ 0,3 % je Sekunde) |
| `abprall` | 0,3 | **0,25** | Fassung 2: Annäherung; Fassung 3: **Festlegung des Auftraggebers 2026-11-11** (Playtest-Wert, keine WA-Messung) |
| `bodenReibung` | 0,86 | wie Fassung 2 | abgeleitet: wie `CharacterSystem` |
| `maxKnicke`, `knickeJeTakt`, `knickAbtastung` | 32, 4, 8 | wie Fassung 2 | Schutzgrenzen bzw. Rechengenauigkeit, keine Spielregel |
| `haltedauer`, `erneuernMs`, `nachrichtenProSekunde` | 90 Takte, 500 ms, 20/s | wie Fassung 2 | wie beim Gehen (`BEWEGUNG`) |
| `verboteneKategorien` | `melee` | wie Fassung 2 | belegt (Nahkampf; Selbstmordbomber gibt es nicht) |

Nicht gebaut, weil nicht belegt oder offline aus: Rope Knocking (offline aus), eigener Fallschaden beim Lösen (es
gilt die normale Fallschadenregel), Seilschussflug (das Seil trifft sofort, ein Fehlschuss kostet nichts).

## 3. Bedienung

| Aktion | Tastatur | Touch |
|---|---|---|
| Seil wählen/abwählen | F, oder Waffenmenü (E) → Gruppe „Werkzeuge“ → Seil | Knopf „Seil“ |
| Seil schießen (Zielwinkel) | Feuertaste (Leertaste/Shift) mit gewähltem Seil | FEUER |
| Lösen | Feuertaste (oder Enter) mit gewähltem Seil | FEUER |
| Schwung | A/D, ←/→ | Gehen ◀/▶ |
| Einholen/Ausfahren | W/S, ↑/↓ (statt zielen) | „Seil ▲/▼“ gedrückt halten |
| Waffe vom Seil | Waffe wählen (1–9, E), Feuertaste — der Schuss löst das Seil | Waffe wählen, FEUER |
| Bombe fallen lassen | Enter mit gewählter Waffe am Seil (Kraft 0) | — |

Zugregeln: Das Seil ist Bewegung im Zug (vor dem Schuss); ein Waffenschuss vom Seil löst es, danach gibt es kein
Seil mehr (Rückzug nur Gehen/Springen). Zugende, Wasser oder ein weggesprengter Anker lösen das Seil ebenfalls.

## 4. Technik

- Motor: `src/engine/seil.js` (`SeilSystem`, reine Funktion `pendelSchritt`). Höchstlänge als Zwang (Verlet), Wickeln:
  Knick an der Kante, wenn Gelände die Linie Drehpunkt → Figur verdeckt; Entwickeln, wenn die Seite kippt und die Linie
  zum vorigen Drehpunkt frei ist. Ein-/Ausfahren erhält den Drehimpuls (kürzer = schneller).
- Das `CharacterSystem` lässt eine Figur am Seil aus; danach gilt bis zur Landung `maxTempo` statt 6 px/Takt.
- Versionsmarke `config.seil` (1 = kein Seil, fehlt in alten Dateien; 2 = Seil mit den Werten der Fassung 2; 3 = dieselbe
  Mechanik mit den festgelegten Werten, Standard neuer Partien; `SeilSystem` liest die Tabelle über `seilWerte(match.seil)`). Eingabeart `kind: 'seil'`
  (`aktion` schuss/loesen/steuer). Der Zustand trägt `seil` nur, solange es hängt oder Neuwürfe laufen — ohne Benutzung
  bleiben alle Hashes gleich (Test).
- Server: `CONTROL.SEIL`, `pruefeSeilEingabe` (`shared/validation.js`), Grenze je Sitz; online kommt die Seillinie aus
  den Ereignissen `seil_angeheftet`/`seil_knick`/`seil_geloest`.
- Warum kein Katalogeintrag: Ein neuer Eintrag in `project_armageddon_weapons_v1.json` landete in Beute, Kisten und
  Start-Kits und verschöbe deren Zufallszüge — alte Aufzeichnungen liefen anders. Das Seil ist ein Werkzeug ohne
  Munition und steht deshalb als eigene Zeile im Waffenmenü.

## 5. Nachjustieren

1. Die Tabelle einer bestehenden Fassung wird nie geändert. Neue Physik = neue Fassung (`SEIL_… = 4`, eigene Tabelle in
   `SEIL_WERTE`, `normalisiereSeil`, Standard); Fassung 2 und 3 bleiben für alte Replays.
2. Herkunft je Wert im Kommentar: belegt (Quelle), Annäherung (Begründung) oder Festlegung des Auftraggebers.
3. `npm test` (`tests/seil.test.js`: Verhalten, Goldwerte der Fassung 2 und 3, Pendelstabilität) und
   `npx playwright test tests/e2e/seil.spec.mjs`.

Offen: Messung an einer echten WA-Installation (Einzelbilder: Einholtempo, Schwungbeschleunigung, Reibung) würde die
Festlegungen belegen oder ersetzen.

## 6. Änderungsprotokoll

| Datum | Fassung | Änderung |
|---|---|---|
| 2026-11-03 | 2 | Seil gebaut, Werte großteils Annäherungen, Standardstufe 5. |
| 2026-11-09 | 2 | **A7:** kein Feintuning ohne Playtest-Zahlen; eine Änderung wäre eine neue Fassung (3) mit Vergleichsmessung, alte Replays bitgleich. |
| 2026-11-11 | 3 | **A8:** Auftraggeber legt fest (Playtest-Wert, keine WA-Messung): `kletterTempo` 2,5 → 3,2; `schwung` 0,05 → 0,07; `reibung` 0,999 → 0,99995; `abprall` 0,3 → 0,25; `minLaenge` 20 → 18; `standardStufe` 5 bestätigt; `schwerkraft` 0,42 unverändert. Fassung 3 ist Standard neuer Partien; Fassung 2 bleibt bitgleich. |

**A7 (2026-11-09):** Kein Feintuning an den Annäherungen ohne Playtest-Zahlen; erfüllt durch A8.

**A8 (2026-11-11): Seilfassung 3.** Vergleichsmessung wie in A7 verlangt: (a) Goldwerte der Fassung 2 (Zustandshashes einer
festen Seilfolge, Pendel-Endlage) vor der Änderung gemessen und in `tests/seil.test.js` festgeschrieben — nach der Änderung
bitgleich. (b) Fassung 3 deterministisch (zwei Läufe, Replay), eigene Goldhashes. (c) Stabilität der fast reibungsfreien
`reibung` per Simulation (10 min freies Pendel, 20 min Zufallssteuerung mit Hindernissen, Dauerschwung): keine Energiezunahme
ohne Schwung, keine ungültigen Zahlen, Tempo ≤ `maxTempo` + 0,3 px/Takt (Überschreitung durch den Seilzwang, in Fassung 2 ebenso),
Knickzahl ≤ 4, Figur nie im Gelände. Befund: Das freie Pendel klingt trotzdem ab (Auslenkung 96 → 3 px in 60 s, Fassung 2: 1 px
in 60 s; Auslenkung in den Sekunden 15–20: 35 px gegen 23 px), weil der Verlust überwiegend aus dem Seilzwang und dem Schrittverfahren kommt,
nicht aus `reibung`. Die Energie ist nach dem Abklingen konstant (Ruhelage).
