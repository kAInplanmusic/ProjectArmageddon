# GP-3 – Waffen-Dubletten & Fassung-10-Werte UI (Stand 2026-11-12)

## Ausgangslage (aus TODO.md)

> Waffen-Dubletten: Staffelung in Fassung 10/11 umgesetzt; offen bleibt:
> - Nahkämpfer mit identischen Flugwerten, aber schwächere Schwesterwaffe (Piratenhaken/Hakenklinge, Mehrzweckmesser/Kampfmesser, Rapier/Taschenmesser)
> - Eisschlag friert in Schadensfassung 2 nicht ein
> - Ananasbombe vs Splittergranate
> - Anzeige der Fassung-10-Werte im Waffenmenü

---

## 1. Nahkämpfer-Dubletten (identische Flugwerte, schwächere Schwesterwaffe)

### Bekannte Paare

| Paar | Waffen-ID (stärker) | Waffen-ID (schwächer) | Status |
|------|---------------------|----------------------|--------|
| Piratenhaken / Hakenklinge | – | – | Zu identifizieren |
| Mehrzweckmesser / Kampfmesser | – | – | Zu identifizieren |
| Rapier / Taschenmesser | – | – | Zu identifizieren |

### Nächste Schritte
- Waffen-IDs der sechs Nahkampf-Waffen in `src/shared/config/weapons.js` (category: "melee") identifizieren
- Flugwerte (`windFactor`, `trefferRadius`, `maxRange`, `knockback`, `stossRichtung`) vergleichen
- Dokumentieren, welche Werte identisch sind und wo die Schwesterwaffe schwächer ist

---

## 2. Eisschlag friert in Schadensfassung 2 nicht ein ✓ BEKANNT

**Quelle:** `src/shared/config/waffen-fassung.js:259`
```javascript
// Eis friert in Fassung 2 nicht ein, Zahlen aus `elemental.md` Abschnitt 5.
pa_071: Object.freeze({ elemental: Object.freeze({ fire: 0, ice: 30, poison: 0 }) }), // Eisschlag: Eis 50 (friert nicht ein)
```

**Entscheidung:** Dies ist eine **produktentscheidung**, kein Bug. Die Eisschlag-Waffe (`pa_071`) hat Eis-Wert 30, friert aber in Fassung 2 (WAFFEN_FAIR) nicht ein. Dies ist in der Balance-Dokumentation (`elemental.md` Abschnitt 5) begründet.

**Status:** Kein Handlungsbedarf – dokumentiert.

---

## 3. Ananasbombe vs Splittergranate

| Waffe | ID | Kategorie | Schaden (Fassung) | Besonderheit |
|-------|-----|-----------|-------------------|--------------|
| Ananasbombe | `pa_117` | utility / heavy_ranged | – | `waffen-f21.js:57` |
| Splittergranate | `pa_046` | heavy_ranged | 63 (F21), 48 (Fassung in waffen-fassung.js:253) | `waffen-f21.js:85` |

**Vergleich:**
- Ananasbombe ist als `utility` klassifiziert (kein expliziter Schaden in F21 sichtbar)
- Splittergranate ist `heavy_ranged` mit explizitem Schaden
- Unterschiedliche Wirkpfade: Splittergranate = klassische Fläche, Ananasbombe = Utility-Effekt

**Status:** Teilweise dokumentiert. Offene Frage: Welche Fassung-10-Baseline-Werte gelten für den Vergleich?

---

## 4. Anzeige der Fassung-10-Werte im Waffenmenü

### Aktueller Stand

**Waffenmenü** (`src/client/waffenMenue.js`):
- Zeigt die Waffen der **aktuellen Partiefassung** an (Zeile 195): `const fassung = this.#opts.getFassung?.() ?? WAFFEN_STANDARD;`
- `WAFFEN_STANDARD = WAFFEN_WURF = 22` (neueste Fassung)
- Keine explizite Anzeige von "Fassung 10" Baseline-Werten

**Waffensicht** (`src/client/waffenSicht.js`):
- `waffeFuerAnzeige(id, fassung)` ruft `getWaffe(id, fassung)` auf
- Zeigt Schaden, Wirkungskennzahl, Rolle, Munition, Nachladen, Stufe

### Fehlendes Feature

**Explizite Anzeige der Fassung-10-Werte** als Vergleich/Baseline im Waffenmenü:
- User Story: Spieler soll sehen, wie sich die Waffe von Fassung 10 zur aktuellen Partie-Fassung geändert hat
- Mögliche Implementierung: Tooltip/Dropdown im Detailbereich mit "Fassung 10: Schaden X, Reichweite Y" vs. "Aktuell: Schaden A, Reichweite B"

**Status:** **Offen** – nicht implementiert.

---

## Zusammenfassung GP-3

| Item | Status | Nächster Schritt |
|------|--------|------------------|
| Nahkämpfer-Dubletten | Offen | Waffen-IDs identifizieren, Flugwerte vergleichen |
| Eisschlag (Fassung 2) | ✓ Dokumentiert | Keine Aktion (Produktentscheidung) |
| Ananasbombe vs Splittergranate | Teilweise | Fassung-10-Baseline für beide ermitteln |
| Fassung-10-Werte im Waffenmenü | Offen | UI-Feature implementieren (Tooltip/Vergleich) |

---

## Empfehlung

**Priorität:** Die Nahkämpfer-Dubletten sind der Kern von GP-3. Der Rest ist Folgearbeit.

**Vorgehen:**
1. Die 6 Nahkampf-Waffen-IDs aus `weapons.js` (category: "melee", subcategory: "melee") extrahieren
2. Flugwerte (`windFactor`, `trefferRadius`, `maxRange`, `knockback`, `stossRichtung`) in einer Tabelle gegenüberstellen
3. Dokumentieren, welche Paare identische Flugwerte haben und wo die Schwesterwaffe schwächer ist
4. Dann Item 4 (Fassung-10-Anzeige) als separates UI-Ticket erstellen