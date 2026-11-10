# Feuerwesen (pa_118) — Waffenfassung 20

Stand 2026-11-10. Entscheidung des Auftraggebers: „kleiner Feuergnom, der geradeaus läuft, springt und bei Berührung
mit Spieler in 5 Feuerkugeln zerbirst".

## Vorher / nachher
| | bis Fassung 19 | ab Fassung 20 |
|---|---|---|
| Wirkpfad | `hitscan` (Strahl, Fläche 42, Brand) | `laeufer` (`engine/feuerwesen.js`) |
| Etikett `special: 'fire_minion'` | las im Motor niemand (siehe BAL-16) | bleibt Etikett, Verhalten kommt aus `laeufer` |

Alte Fassungen (≤ 19) bleiben bitgleich: der Läuferpfad gilt nur für `quelle.waffenFassung >= 20`.

## Werte (SSOT `src/shared/config/waffen-f20.js`)
- Läufer: Tempo 1,6 px/Takt, 270 Takte Laufzeit (432 px), Stufe 4 px, Sprunghöhe 30 px, Hopser 6 px/45 Takte,
  Körper 8×12 px. Höheres Hindernis = Wand: er kehrt um.
- Zerbirst bei Berührung einer Figur (oder am Ende der Laufzeit/Kartenrand = Leere): genau 5 Feuerkugeln im festen
  Fächer 45°/67,5°/90°/112,5°/135°, 5,5 px/Takt, ohne Zufall; je Kugel Schaden 20, Radius 30, Brand über `elemental.fire`.

## Messung (Stand: Unit-Test, nicht visuell geprüft)
- `tests/feuerwesen-fassung20.test.js` (11 Tests): läuft, springt, kehrt an 60-px-Wand um, Fächerwinkel exakt,
  fünf `projectile_spawn`, Brand am Ziel, Fassung 19 unverändert.
- Direktschaden am berührten Ziel im Testaufbau: ca. 40 (Grenze im Test: 30 ≤ Schaden ≤ 100).
- Kollisionsmatrix neu erzeugt (`kollisionsmatrix.json`): pa_118 mit Kollisionsart `feuerwesen_zerbirst`;
  111/112 Angriffswaffen mit Schaden. W15-Zählung: Flug 87, Hitscan 24, Läufer 1, Selbstwirkung 38.
- E2E `feuerwesen.spec.mjs` und `waffen-animation.spec.mjs`: 8/8 grün.

## Offen / ungeprüft
- Balance gegen andere Waffen nicht gespielt; Werte sind Erstansatz.
- Optik: seit 2026-11-10 Comic-Sprite wie Günther/Cookie (`src/client/assets/feuerwesen/`: `lauf1`, `lauf2`, `sprung`,
  `zerbirst`; Runware `openai:gpt-image@2`, lauf1 als Referenz für die anderen Posen; Kosten ca. 0,07 USD). Geladen über
  `tierBilder.js`, gezeichnet in `feuerwesenZeichnen.js` (Kante 48 Kartenpixel), Zerbersten-Bild 0,35 s beim Ereignis
  `feuerwesen_zerbirst`. Sichtabnahme im Spiel durch den Auftraggeber steht aus; das Zerbersten-Bild ist im
  Bildschirmfoto noch nicht erfasst (zu kurz).
- Bundle: +9,9 kB roh im Hauptbündel, Grenzen in `scripts/bundle-grenzen.json` begründet angehoben.
