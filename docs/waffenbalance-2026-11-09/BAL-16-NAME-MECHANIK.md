# BAL-16 · Name und Bildversprechen gegen Mechanik (Stand 2026-11-10)

Status: **erledigt 2026-11-10.** Entscheidung des Auftraggebers: Texte anpassen, nur die
Schrotflinte bekommt eine echte Streuung (Waffenfassung 19). Umsetzung siehe Teil 3.

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

## Teil 3 — Umsetzung (2026-11-10)

**Texte** (Quelle `project_armageddon_weapons_v1.json`, Katalog neu erzeugt; außer Name und
Beschreibung kein Feld verändert, Feld für Feld gegen den alten Katalog verglichen):

| Waffe | vorher | nachher |
|---|---|---|
| pa_036 | „… wuchtigen Treffer mit Sprengkraft." | „… wuchtigen Einzeltreffer mit starkem Rückstoß." |
| pa_041 | Salvengeber · „Kleine Raketen in schneller Folge …" | **Minirakete** (erst „Kleinraketenwerfer", zu lang für die Menükachel: höchstens 17 Zeichen je Wort) · „Kleine Rakete mit kleinem Explosionsradius; viel Munition für viele Züge." |
| pa_042 | Feuerwerkssalve · „Feuerwerksraketen …" | **Feuerwerksrakete** · „Schwere Feuerwerksrakete …" |
| pa_045 | Raketensalve | **Schwere Rakete** · „Schwere Rakete mit hohem Schaden …" |
| pa_060 | „Drehlaufgeschütz mit großer Reichweite." | „… ; ein schwerer Schuss je Zug." |

Fallstrick: Der Generator leitet bei 26 Waffen ohne Quellangabe die **Schadensart aus dem Namen**
ab. „Schwere Rakete" traf keinen Hinweis mehr und wäre von `explosive` auf `physical` gekippt —
eine Regeländerung durch eine Umbenennung. Der Hinweis `rakete` ist ergänzt; danach ist der
Katalog außer den Texten feldgleich.

**Schrotflinte** (Waffenfassung 19, `config/waffen-f19.js`, `engine/shooting.js`): fünf Kugeln in
einem festen Fächer von 12 Grad, je ein Fünftel von Schaden, Rückstoß und Geländeschaden, kein
Zufall. Gemessen (gleicher Prüfstand wie die Kollisionsmatrix, bester Winkel nach Zielvorschau):

| Abstand | Fassung 18 | Fassung 19 |
|---:|---|---|
| 80–200 px | 1 Treffer, 57 | 5/5, 57 |
| 300 px | 1 Treffer, 57 | 4/5, 45,6 |
| 400–500 px | 1 Treffer, 57 | 3/5, 34,2 |
| 600 px | 1 Treffer, 57 | 2/5, 22,8 |

**Folge für die Balance (offen, Auftraggeber spielt selbst durch):** Die Kollisionsmatrix prüft
schwere Fernwaffen auf 600 px; dort bringt die Schrotflinte jetzt 40 % ihres bisherigen Schadens.
Das ist die gewollte Wirkung der Streuung, macht sie aber auf großen Karten deutlich schwächer.
Stellschrauben: Fächerbreite (`faecherGrad`) oder Grundschaden in `waffen-f19.js`.

Tests: `tests/streuung-fassung19.test.js` (Fächer, Anteile, nah gegen weit, Hashgleichheit ohne
Schrotflinte, Fassung 18 als Gegenprobe), `tests/waffen-schadensarten.test.js` (neue Namen).
