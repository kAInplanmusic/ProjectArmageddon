# BAL-09 — Waffenfreistellung, Abnahme 2026-11-09

## Ergebnis

- **23 Waffen** mit Entscheidung in `tools/waffen-freistellung.json` geprüft.
- **9 Waffen** gezielt bereinigt: `pa_012`, `pa_050`, `pa_054`, `pa_066`, `pa_075`, `pa_082`, `pa_089`, `pa_101`, `pa_138`.
- **Nur Icon und Menü** werden bereinigt. `held` und `silhouette` bleiben unangetastet, weil die Anker-Heftspanne und die Wirkspitze darauf aufbauen.
- Keine Waffe verlor mehr als **25 %** ihrer Bounding-Box (Menü-Icons mit Hintergrundplatte: höchstens 80 %).
- **Keine Änderung** an bewusst belassenen Illustrationskacheln (`modus: keine`).
- Das Werkzeug ist **idempotent**: ein zweiter `--pruefen`-Lauf meldet `0 geaendert`.

## Belege

- Bericht mit Vorher/Nachher-Hashes, Bboxes, Kanten und Komponenten:
  `docs/waffenbalance-2026-11-09/freistellung/bericht.json`
- Kontaktbögen je geänderter ID (dunkel/hell, 24/64/128 px, HiDPI):
  `docs/waffenbalance-2026-11-09/freistellung/<id>.png`
- Test: `tests/waffen-freistellung.test.js` (4/4, Idempotenz nur mit scipy/Pillow).
- Waffen-Suiten: 88/88 grün.

## Werkzeugkorrekturen

- Kontaktbogen zeigte das ganze Atlasblatt statt der betroffenen Zelle; jetzt wird die Rolle mit der größten Änderung zugeschnitten.
- Palettenatlanten quantisieren beim Speichern. Der Bericht übernimmt deshalb nach dem Schreiben den tatsächlichen Zell-Hash; ohne das hätte ein zweiter Lauf die Waffe schrittweise weiter beschnitten.

## Grenze

Die drei Menü-Icons (`pa_012`, `pa_050`, `pa_054`) verlieren ihre große weiße Hintergrundplatte; das ist gewollt. Hand- und Silhouettenzellen behalten Waffe und Zubehör vollständig.
