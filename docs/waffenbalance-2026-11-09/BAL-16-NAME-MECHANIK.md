# BAL-16 · Name und Bildversprechen gegen Mechanik (Stand 2026-11-10)

Status: **Teil 1 erledigt, Teil 2 wartet auf Entscheidungen.** Nichts an Werten oder Regeln
geändert.

## Teil 1 — die drei genannten Fälle

| Waffe | Befund der Einzelprüfung | heutiger Stand (Fassungsschicht) |
|---|---|---|
| pa_127 | hieß „Teleportplattform", ist aber die Mine | heißt „Mine", Beschreibung nennt Legen/Werfen und sofort scharf (`tests/balance-report.test.js` prüft den Namen) |
| pa_081 | „Zauberbuch der Leere": Menü wirkt wie Siegel, Handbild wie Vortex | heißt „Siegel der Leere" |
| pa_082 | „Goldene Zauberrolle" wirkt wie Stab mit Münzen | heißt „Goldener Münzstab" |

Die Namen folgen damit dem Bild. Offen bleibt bei pa_081 die uneinheitliche Bildidentität
(Menü Siegel, Hand Vortex) — das ist Bildarbeit (Bildagenten, Paket B5/N-12-Umfeld).

## Teil 2 — systematische Durchsicht aller 150 Waffen

Werkzeug: Abgleich von Name und Beschreibung (aktuelle Fassung) gegen die Wirkfelder
`homing`, `piercing`, `bounces`, `blastRadius`/`aoe`, `fuseTime` und gegen Mehrfachgeschosse.
Treffer wurden einzeln gelesen; Fehlalarme (z. B. „zurückstößt" = Rückstoß, „mehrere Züge")
sind ausgesondert.

**Verdacht: Name oder Text verspricht etwas, das der Motor nicht tut**

| Waffe | Versprechen | Daten | Vorschlag |
|---|---|---|---|
| pa_036 Raketenhandschuh | „mit Sprengkraft" | `blastRadius` 0, keine Fläche | Text ändern oder kleinen Radius geben |
| pa_041 Salvengeber | „kleine Raketen in schneller Folge" | ein Geschoss, Radius 16 | Text ändern oder Mehrfachschuss bauen |
| pa_042 Feuerwerkssalve | „Feuerwerksraketen" (Mehrzahl), „Salve" | ein Geschoss, keine Fläche | dito |
| pa_045 Raketensalve | Name „Salve" | ein Geschoss, keine Fläche (Text sagt ehrlich „Rakete") | Namen ändern oder Mehrfachschuss |
| pa_054 Schrotflinte | Schrot (Streuung) | `special: spread_shot` erzeugt im Motor kein zusätzliches Geschoss (`waffenAnimation.js` sagt es selbst) | Streuung bauen oder als Einzelschuss benennen |
| pa_060 Gatlingkanone | Mehrlauf, gefühlt Dauerfeuer | ein Geschoss je Schuss | Anzeige des Schussmodus (Einzelprüfung) |

**Nebenbefund:** Das Feld `special` ist für 92 von 118 Werten in Motor und Regeln (`src/engine`,
`src/shared` ohne Katalog) nirgends als Zeichenkette genannt. Viele Wirkungen kommen über andere
Felder (Kategorie, Wirkart) zustande, `special` ist dort nur Etikett für Bild und Klang. Daraus
folgt **nicht**, dass 92 Mechaniken fehlen — aber `special` ist kein Beleg für eine Mechanik und
darf in Texten und Prüfungen nicht als solcher gelten.

## Entscheidung nötig (je Zeile oben)

„Text an Mechanik anpassen" ist billig und ändert keine Replays. „Mechanik an Text anpassen"
(Mehrfachschuss, Streuung, Fläche) ist eine Regeländerung: neue Waffenfassung, Balance-Messung.
Empfehlung: Texte anpassen, außer bei pa_054 Schrotflinte (Streuung ist das Wesen der Waffe).
