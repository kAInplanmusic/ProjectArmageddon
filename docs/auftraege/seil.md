# Auftrag: Seil — das Ninja Rope aus Worms

*Stand: 2026-11-03 · Status: **gebaut (Seilfassung 2, Standard für neue Partien).** Entscheidung des Auftraggebers
2026-11-03: fehlende Konstanten werden angenähert, jede Annäherung ist als solche markiert.*

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

## 2. Wertetabelle (`src/shared/config/seil.js` — EINE Datei)

Umrechnung WA → hier: Tempo × 50/60, Beschleunigung × (50/60)². Maßstab 1 : 1 (WA-Figur rund 20 px hoch, unsere
14 × 20 px).

| Wert | hier | Herkunft |
|---|---|---|
| `laengen` (Stufe 1–5) | 297, 339, 381, 423, 465 px | belegt (oberer Wert der Spanne) |
| `schuesse` je Flugphase | 1, 2, 2, 3, ∞ | belegt |
| `standardStufe` | 5 | **Annäherung/offen** — welche Stufe das WA-Standardschema hat, ist nicht belegt (Rope-Race-Schemata: 5) |
| `winkelMin`/`winkelMax` | 0 … π (nie unter den Horizont) | belegt (Unrestrict Rope); das 45°/90°-Fenster der BattyRope-Tabelle ist ohne Zuordnung, genommen ist das volle |
| `schwerkraft` | 0,42 px/Takt² | abgeleitet: wie die Figuren (`CharacterSystem`); WA wäre 0,1667 — das Pendel schwingt hier 1,59-mal schneller |
| `maxTempo` | 13,33 px/Takt (800 px/s) | belegt (16 px/Schritt × 50/60); gilt nach dem Lösen bis zur Landung |
| `kletterTempo` | 2,5 px/Takt (150 px/s) | **Annäherung**: Einholen eines 300-px-Seils in WA-Aufnahmen rund 2 s |
| `minLaenge` | 20 px | **Annäherung**: eine Figurenhöhe |
| `schwung` | 0,05 px/Takt² | **Annäherung**: ≈ 12 % der Schwerkraft, Überschlag nach zwei, drei Schwüngen |
| `reibung` | 0,999 je Takt | **Annäherung**: WA hat eine Seilreibung (belegt), ihr Wert nicht; ≈ 6 % je Sekunde |
| `abprall` | 0,3 | **Annäherung**: Anteil, mit dem die Figur am Seil von einer Wand zurückprallt |
| `bodenReibung` | 0,86 | abgeleitet: wie `CharacterSystem` |
| `maxKnicke`, `knickeJeTakt`, `knickAbtastung` | 32, 4, 8 | Schutzgrenzen bzw. Rechengenauigkeit, keine Spielregel |
| `haltedauer`, `erneuernMs`, `nachrichtenProSekunde` | 90 Takte, 500 ms, 20/s | wie beim Gehen (`BEWEGUNG`) |
| `verboteneKategorien` | `melee` | belegt (Nahkampf; Selbstmordbomber gibt es nicht) |

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
- Versionsmarke `config.seil` (1 = kein Seil, fehlt in alten Dateien; 2 = Seil). Eingabeart `kind: 'seil'`
  (`aktion` schuss/loesen/steuer). Der Zustand trägt `seil` nur, solange es hängt oder Neuwürfe laufen — ohne Benutzung
  bleiben alle Hashes gleich (Test).
- Server: `CONTROL.SEIL`, `pruefeSeilEingabe` (`shared/validation.js`), Grenze je Sitz; online kommt die Seillinie aus
  den Ereignissen `seil_angeheftet`/`seil_knick`/`seil_geloest`.
- Warum kein Katalogeintrag: Ein neuer Eintrag in `project_armageddon_weapons_v1.json` landete in Beute, Kisten und
  Start-Kits und verschöbe deren Zufallszüge — alte Aufzeichnungen liefen anders. Das Seil ist ein Werkzeug ohne
  Munition und steht deshalb als eigene Zeile im Waffenmenü.

## 5. Nachjustieren

1. Wert in `src/shared/config/seil.js` ändern (Kommentar: Quelle oder „Annäherung, Begründung“).
2. Weil sich die Physik ändert: neue Fassung anlegen (`SEIL_… = 3`, `normalisiereSeil`, Standard), die alten Werte
   für Fassung 2 behalten — sonst laufen Aufzeichnungen mit Fassung 2 anders.
3. `npm test` (`tests/seil.test.js` prüft Verhalten: Pendeldauer, Drehimpuls, Wickeln, Neuwürfe, Replay) und
   `npx playwright test tests/e2e/seil.spec.mjs`.

Offen: Messung an einer echten WA-Installation (Einzelbilder: Einholtempo, Schwungbeschleunigung, Reibung) würde die
Annäherungen ersetzen; Wahl der Standardstufe durch den Auftraggeber.
