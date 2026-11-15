# P0 Balance – Offene Items (Stand 2026-11-12)

## Übersicht

| ID | Titel | Status | Quelle |
|----|-------|--------|--------|
| BAL-1 | maxRange-Anzeige, Scout-Bewertung, 6 Klassen-/Archetyp-Vergleiche, Wurfweiten-Deckel | Offen (wartet auf AG) | TODO.md:17, 108 |
| BAL-14 | Feinbalancing pro Rolle statt globaler Faktoren, identische Seeds, echte LP | Offen | TODO.md:14 |
| BAL-15 | Browser-/Touch-/Bewegungsabnahme Waffen-E2E (24/64/128px, Kontrast, L/R-Zielung) | Offen | TODO.md:12 |
| BAL-17 | Karten-/Fraktions-/Partienabdeckung staffeln | Offen | TODO.md:15 |

---

## BAL-1 – maxRange-Anzeige & Scout-Bewertung

**Aus TA §7/§8/§8b (TODO.md:108):**
- `maxRange`-Anzeige: „Reichweite bei neutralem Profil“ (Faktor 0,37; eine Zeile Anzeige)
- Scout-Bewertung
- Vergleichszahlen für 6 neue Klasse/Archetyp-Kombinationen (`balance:classes`, `balance:sweep`)
- `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp (normalisieren verschiebt ~8 %)
- Wurfweiten-Deckel unter Wurfweite bei 465 Kombinationen (Balance-Entscheidung)

**Nötige Schritte:**
1. `maxRange`-Anzeige im Waffenmenü/HUD umsetzen (Faktor 0.37)
2. Scout-Bewertungs-Logik implementieren
3. 6 Klassen-/Archetyp-Kombinationen messen (`balance:classes`)
4. `ARCHETYPE_LAUNCH_BASE` normalisieren
5. Wurfweiten-Deckel Entscheidung treffen (465 Kombinationen)

---

## BAL-14 – Feinbalancing pro Rolle

**Anforderung:** Statt globaler Faktoren (wie `WAFFEN_FAIR` = 5, `WAFFEN_ZUENDER` = 6) feingranulares Balancing **pro Waffen-Rolle** mit identischen Seeds und echten LP-Werten.

**Rollen (aus `waffen-rollen.js`):**
- `hand` – Gewehr, Schwert, Zauberstab
- `geschoss` – Wurfwaffen
- `ruecken` – Rucksack, Düsenrucksack, Gleitschirm
- `selbst` – Heilung, Schild, Sprung, Munition
- `weltobjekt` – Mine, Geschütz, Portal, Baum
- `aufstell`, `beschwoerung`, `symbol`

**Nötige Schritte:**
1. Balancing-Metriken pro Rolle definieren (nicht global)
2. Identische Seeds für Vorher/Nachher-Vergleich
3. Echte LP (130/100/70 für Nahkampf/Fernkampf/Okkultist) in Tests verwenden
4. Rollen-spezifische Anpassungen statt pauschaler Faktoren

---

## BAL-15 – Waffen-E2E Browser/Touch/Bewegungsabnahme

**Anforderung:** Vollständige E2E-Abnahme der 150 Waffen im Browser:
- 24px, 64px, 128px Icon-Grössen
- Kontrast-Prüfung (WCAG)
- Links-/Rechts-Zielung
- Touch-Bedienung
- Bewegungs-Animationen

**Status:** Playwright E2E läuft (erste Tests grün), aber volle Suite noch nicht durchgelaufen.

**Nötige Schritte:**
1. Playwright E2E-Suite vollständig durchlaufen lassen
2. Sichtprüfung aller 150 Waffen in 3 Auflösungen
3. Touch-Tests auf Mobile/Tablet
4. Links/Rechts-Zielung verifizieren

---

## BAL-17 – Abdeckungs-Staffelung

**Anforderung:** Keine Vollabdeckung aus Stichproben behaupten. Karten-, Fraktions- und Partienabdeckung müssen gestaffelt werden.

**Nötige Schritte:**
1. Abdeckungs-Matrix definieren (Karten × Fraktionen × Partien)
2. Staffelungsplan erstellen (z.B. Kern-Karten 100%, Rand-Karten 50%)
3. Dokumentation: Was wurde getestet, was nicht
4. Keine pauschalen „alles grün“ Claims aus Teilstichproben

---

## Nächste Aktionen (Empfehlung)

1. **BAL-1** – maxRange-Anzeige im Waffenmenü (schnellster Win, UI-only)
2. **BAL-14** – Rollen-basiertes Balancing-Framework aufsetzen (Tools/Tests)
3. **BAL-15** – Playwright E2E voll durchlaufen lassen (läuft bereits)
4. **BAL-17** – Dokumentation der Test-Abdeckung (nach BAL-15)

---

*Priorisierung: BAL-1 → BAL-14 → BAL-15 → BAL-17*