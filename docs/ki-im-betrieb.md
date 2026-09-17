# KI im Betrieb — wo sie lohnt und wo nicht

Der Punkt „Auswertung: Wo lohnt KI im Betrieb?" ist eine **offene Frage**, keine
Aufgabe. Dieses Dokument beantwortet sie mit dem, was im Projekt **gemessen** ist
— und benennt, was eine Entscheidung bleibt.

**Stand:** Der Punkt stand seit der ersten TODO-Liste offen. Die Antwort ist
nicht „überall" und nicht „nirgends": Sie hängt an je einer Zahl, die im Projekt
vorliegt.

---

## Die drei genannten Möglichkeiten, geprüft

### 1. Kulissen vorab — **bereits erledigt, ohne Laufzeit-KI**

Der Punkt ist erfüllt: 60 Kulissen (12 Biome à 5 Varianten) wurden **vorab** per
Bildmodell erzeugt und liegen als Bilder im Projekt. Dazu ein generativer
Baukasten aus Himmel, Wasser, Ambiente und Landmarken, der sich jeder
Kartengröße anpasst.

**Warum das die richtige Form ist:** Nichts davon entsteht zur Laufzeit.
Determinismus und Offline-Betrieb bleiben erhalten — ein Modell im Betrieb
würde bei jedem Match andere Bilder liefern, und ein Replay wäre nicht mehr
reproduzierbar.

**Was fehlt:** nichts. Der Punkt ist abgeschlossen.

### 2. Bot-Gegner — **lohnt, aber nicht als KI**

Hier ist die Frage falsch gestellt. Ein Bot braucht **keine** KI, sondern
Ballistik: Die Simulation ist deterministisch, also lässt sich die Flugbahn
**exakt vorausberechnen** — es gibt nichts zu lernen.

Was es dafür schon gibt:

- `#simulateTurretPath` rechnet eine Flugbahn Schritt für Schritt nach (jetzt mit
  der echten Projektilphysik, siehe `tests/turret-ballistics.test.js`).
- `shotPrediction.js` macht dasselbe auf dem Client für die Zielvorschau.

Ein Bot wäre damit: Winkel und Kraft suchen, bis die vorausberechnete Bahn das
Ziel trifft. Das ist eine **Suche**, kein Modell — und sie ist billiger,
genauer und reproduzierbar.

**Wo KI doch helfen würde:** beim **Schwierigkeitsgrad**. Ein Bot, der perfekt
rechnet, ist unschlagbar; einer, der absichtlich daneben zielt, muss wissen, wie
ein Mensch daneben zielt. Das ist eine Gestaltungsfrage, keine technische.

**Aufwand mit deterministischer Suche:** klein. Der Rechenkern existiert.

### 3. Auswertung der Partien — **hier lohnt KI am wenigsten**

Was man aus einer Partie lernen kann, ist **gemessen**:

| Größe | Wert | Quelle |
|---|---|---|
| Runden je Partie | 24 | `npm run check:time` |
| Schüsse je Partie | 23 | `npm run check:achievements` |
| Trefferquote | 32 % | dito |
| Schaden je Partie | 149 | dito |
| Schaden je Minute | 12 | `check:achievements` (Ziel war 200) |
| Klassen-Balance | 3,36–4,36 (Faktor 1,30) | `npm run balance:classes` |
| Reichweiten-Faktor | 0,32–0,38 über 7 Kategorien | `npm run check:range` |
| Wirkungslose Waffen | 1 von 150 | `npm run balance:sweep` |

Diese Zahlen beantworten die Fragen, für die man sonst ein Modell bemüht: Ist
eine Waffe zu stark? Ist eine Klasse benachteiligt? Zieht sich die Partie?
**Alles nachrechenbar.** Ein Modell würde dieselben Zahlen liefern — nur mit
Unsicherheit und ohne Begründung.

**Wo KI hier etwas könnte:** Muster erkennen, die niemand abfragt — etwa
„Spieler, die in Runde 3 abwerfen, gewinnen häufiger". Das setzt aber **Daten**
voraus, die es noch nicht gibt: Der Server hält Kennzahlen im Speicher und
verliert sie beim Neustart (siehe `docs/betrieb.md`, Abschnitt 5). Eine
Auswertung ohne gespeicherte Daten ist nicht möglich.

---

## Die Antwort in einem Satz

> KI lohnt an **einer** Stelle: beim Schwierigkeitsgrad von Bots. Bei Kulissen
> ist sie schon gelaufen und war dort richtig aufgehoben. Für die Auswertung
> reichen die vorhandenen Werkzeuge — sie rechnen nach, statt zu schätzen.

---

## Was die Entscheidung braucht

**Zwei Fragen, die ich nicht beantworte:**

1. **Sollen Bots kommen?** Der Rechenkern steht; es fehlt die Suche und die
   Frage, wie stark ein Bot daneben zielen darf. Das ist Gestaltung.
2. **Sollen Partiedaten gespeichert werden?** Ohne sie gibt es nichts
   auszuwerten. Das ist dieselbe Entscheidung wie bei den Konten
   (`src/shared/identity.js`): welche Daten, wer sieht sie, wie lange bleiben
   sie.

**Technisch vorbereitet, aber nicht gebaut:**

- Die **Vorausberechnung** existiert (`#simulateTurretPath`, `shotPrediction.js`)
  und ist gegen die echte Projektilphysik geprüft.
- Die **Kennzahlen** existieren (`stats.js`, `achievements.js`) und werden je
  Match geführt — sie überleben nur keinen Neustart.

Beides zusammenzusetzen wäre der Bot. Die Entscheidung, ob er kommen soll, ist
nicht technisch.
