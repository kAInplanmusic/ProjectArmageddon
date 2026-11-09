# Auftrag: Kameraeffekte (KAMERA C1–C6)

*Stand: 2026-11-09 · Status: **C1, C2, C4, C5, C6 gebaut und getestet; C3 (Zeitlupe) bewusst nicht in diesem Teil.***

Quelle: `docs/TODO.md`, Zeile KAMERA (MASTERDOTO Backlog Block 4, Fahrplan Nr. 5), Entscheidung des
Auftraggebers 2026-11-05 (`docs/plan-produktion.md` §1): „Höhepunkte inszenieren."

## 0. Was gebaut ist

| Punkt | Umsetzung | Wo |
|---|---|---|
| **C1 Beben-Feinschliff + Einstellung** | Vier Stufen `Aus / Leicht / Normal / Stark`. Die Stufe skaliert den Einschlagsschub UND das Erdbeben-Zittern; `Aus` schaltet beides ab. Die Lesbarkeitsdeckel (`STOSS_MAX` 14 px, `RUCK_MAX` 5 px) gelten in jeder Stufe. Dauer folgt der gedeckelten Stärke. | `client/kameraEffekte.js` (Stufen/Faktoren), `client/kameraZiel.js#stossFuer`, `client/gefuehl.js#ruckVersatz`, `client/kameraRegie.js` |
| **C2 Knapp-vorbei-Zoom** | Neue Phase `knapp`: Erkennt einen Vorbeiflug als Abstand der Geschoss-**Strecke** (voriges → aktuelles Bild) zum Figurmittelpunkt, 12–30 px. Kurzer Zoom (Faktor 1,25, 0,4 s), Mitte zwischen Vorbeiflugpunkt und Geschoss. Sperre 1,1 s gegen Zoom-Ketten; nie in der Wiederholung, nie bei Bewegungsreduktion, nie während des Einschlags. | `client/kameraZiel.js#naechsterVorbeiflug`, `client/kameraRegie.js` |
| **C4 Wasser-Sturz-Kamera** | Beim Übergang einer Figur ins *Untergetaucht*-Sein (`DROWN_LEVEL`) legt der Ereigniszweig einen Auftrag ab; die Regie hält 1,3 s auf der Stelle, 30 px unter der Oberfläche, Zoom ×1,4. Der Wächter zählt nur den Übergang — nicht die bis zu 60 Meldungen je Sekunde einer schwimmenden Figur. Aus bei Bewegungsreduktion und bei abgeschaltetem Effekt. | `client/kameraEffekte.js#Wasserwaechter`, `client/ereignisse.js` (`entity_in_water`), `client/kameraRegie.js` |
| **C5 Kettenzähler** | Zählt je Schuss (Fenster `shot` → nächster `shot`): Figur, Mine, Fass. Ab zwei Gliedern erscheint mittig „Kette ×N — Mine · Fass · Figur" für 2,6 s. Reine Anzeige, `aria-live`; abschaltbar. | `client/kameraEffekte.js#Kettenzaehler`, `client/kameraEffekteBedienung.js`, `client/ereignisse.js` |
| **C6 Menü „Kameraeffekte"** | Gruppe im ⚙-Dropdown: ein Knopf für die Beben-Stufe (schaltet durch, damit die Pfeiltasten dem Dropdown gehören) und drei `aria-pressed`-Schalter. Auswahl liegt in `localStorage` (`pa.kameraeffekte`), kaputte Werte fallen einzeln auf die Vorgaben zurück. | `index.html`, `client/kameraEffekteBedienung.js`, `client/styles/design.css` |

**Tests:** `tests/kamera-effekte.test.js` (20) — Einstellungen/Normalisierung, Bebenstufen, Schubdeckel,
Knapp-Erkennung (Strecke, Treffer-Grenze, Unfug), Regie-Phasen `knapp`/`sturz` samt Abschaltungen,
Wasserwächter, Kettenzähler, Auftragswarteschlange, Bedienung mit DOM-Attrappe und Speicher.
E2E: `tests/e2e/hud-einstellungen.spec.mjs` (Menüzeile, Tastenreihenfolge, Durchschalten, Speichern über
Neuladen). Kameraführung unverändert grün: `tests/kamera-ziel.test.js`.

## 1. Warum die Verdrahtung so aussieht

`src/client/main.js` ist eine **gemeinsame Datei** und wird von diesem Auftrag nur gelesen
(`docs/TODO.md` §„Subagenten-Pakete", Regeln). Zwei Effekte brauchen aber Daten aus dem Browser:

- **Kettenzähler und Wasser-Sturz** hängen an Ereignissen. Sie sind deshalb Zweige in
  `client/ereignisse.js` (dort steht die Ereignistabelle für beide Betriebsarten) und laufen über den
  Modul-Singleton `kameraEffekte`. Kein neuer Zugang in `main.js` nötig.
- **Menü und Kettenanzeige** brauchen DOM. `KameraSteuerung` wird ohnehin mit Canvas und Fenster gebaut
  (`main.js:216`) und erzeugt die Bedienung in ihrem Konstruktor. Wer die Kamerabedienung baut, baut damit
  auch ihr Menü — keine zweite, unsichtbare Verdrahtungsstelle.

Die Regie bleibt DOM-frei und ohne Uhr: Sie bekommt `dt` und holt fertige Aufträge ab.

## 2. C3 Zeitlupe — entschieden, nicht gebaut

Die Regel aus der Entscheidung: Zeitlupe **nur** bei einem Schuss mit ≥ 250 Gesamtschaden ODER ≥ 3 Toten,
abschaltbar, reine Darstellung. Sie fehlt in diesem Teil aus zwei Gründen:

1. Die Zeitlupe skaliert den **Bild-Zeitschritt** im Renderpfad (`Main#render`/Frame-Akkumulator). Das ist
   eine Änderung in `main.js`; sie gehört als Vorschlag eingereicht, nicht eigenmächtig eingebaut.
2. Ohne Zuordnung „Schaden und Tote je Schuss" gibt es keine belastbare Auslösung. Die Kennzahlen entstehen
   heute in `MatchStats` lokal und im Server online — zwei Quellen, die erst zusammengeführt werden müssten.

**Vorschlag (ein Hook, ~10 Zeilen in `main.js`)**: `const zeit = this.zeitlupe.faktor(dtSek, { schaden,
tote })` vor `this.#render(...)`; der Faktor geht auf `render(dt)` und die Kamera-Zeit, nie auf die
Simulation. Ein Modul `client/zeitlupe.js` (rein, testbar) hielte Schwelle, Rampe (0,35 für 0,9 s) und
Abschaltung. Der Menüpunkt ist dafür schon vorbereitet (ein weiterer Schalter in derselben Gruppe).

**Ebenfalls offen (kein Muss):** Eine exaktere Sturz-Kamera könnte der Figur folgen statt auf der
Eintrittsstelle zu halten. Dafür müsste `main.js#kameraEingabe` den Wasserstand/die Figurliste mitgeben
(heute bekommt die Regie nur die aktive Figur und Gegnerpositionen). Der jetzige Weg ist ohne diese
Änderung vollständig lauffähig.

## 3. Bewusste Grenzen

- **Keine Engine-Regel berührt.** Keine Änderung an Zustandshash, Replay oder Determinismus; alles ist
  Anzeige. Der Kettenzähler liest Ereignisse, er erzeugt keine.
- **Kein Zufall, keine eigene Uhr** in der Regie; der Wasserwächter bekommt die Zeit im Test ausdrücklich.
- **Sperren statt Dauerfeuer:** Knapp-Zoom höchstens alle 1,1 s, Wasser-Sturz höchstens alle 4 s je Figur.
- **Einschlag hat Vorrang** vor Knapp und Sturz; Tierauftritt hat Nachrang hinter allen drei.
- **Bewegungsreduktion** (`prefers-reduced-motion`) schaltet Knapp, Sturz und jeden Bildschub ab. Der
  Kettenzähler bleibt (Text, keine Bewegung).

## 4. Offene Punkte für den Playtest (nicht automatisierbar)

1. **Beben:** Sind „Leicht" und „Stark" angenehm unterscheidbar? Ist „Aus" wirklich ruhig genug für
   Empfindliche (auch das Erdbeben-Zittern)?
2. **Knapp-vorbei:** 30 px Reichweite und 0,4 s Haltezeit am echten Bild prüfen — zu häufig? zu hektisch?
   Besonders bei Salven und bei mehreren Figuren auf einer Linie.
3. **Wasser-Sturz:** Wirkt der Halt wie „da ist jemand reingefallen", oder stört er den Zugwechsel?
   Prüfen auf kleiner Karte (Wasser nah am Rand) und im Hochformat.
4. **Kettenzähler:** Lesbarkeit bei 8 Figuren/Team, Überlagerung mit Tier-Leiste und Protokoll; soll die
   Anzeige auch bei genau einem Glied kurz aufblitzen (derzeit nein)?
5. **Menü:** Berührflächen und Scrollen im Dropdown auf Telefon quer; Verhalten mit gesperrtem Speicher
   (Privatmodus) — Vorgaben müssen gelten, nichts darf hängen.
6. **Klang:** Der Kettenzähler ist stumm. Falls ein Ton gewünscht ist, gehört er in `klangProfile.js` und
   in die Hörprüfung (AUDIO-2).
