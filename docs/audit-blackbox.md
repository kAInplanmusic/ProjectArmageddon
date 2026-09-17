# Fremd-Audit: Black-Box (Subagent)

**Auftrag:** Das Spiel als blinder Tester bedienen — Oberfläche nutzen, nicht
Code lesen.
**Stand:** Commit `edba466`. Getestet mit eigenen Playwright-Skripten
(`/tmp/pa-audit/`), Dev-Server auf Port 5173, Chrome-Channel.
**Ergebnis:** Der Agent erreichte seine Iterationsgrenze, bevor er den Bericht
schrieb. Seine Befunde sind hier festgehalten — **jeder vom Auftraggeber
nachgeprüft**.

## Vom Auftraggeber verifiziert und behoben

### ✅ `projectile_impact` fehlte im lokalen Zweig

**Was der Agent beobachtete:** Im Ereignisprotokoll stand nur „ist gelandet" —
nicht, wo sein Schuss eingeschlagen ist.

**Nachprüfung: BESTÄTIGT.** Der Client hat zwei getrennte Ereignisbehandler —
`#handleEvents` (lokal) und `#handleRemoteEvent` (online). Der Einschlag war
**nur** im Online-Zweig behandelt (`main.js:936`). Die Engine sendet das
Ereignis sehr wohl (`projectileSystem.js:119`).

**Behoben:** Beide Zweige erzeugen jetzt denselben Einschlagblitz.
**Abgesichert:** `tests/event-coverage.test.js`.

### ✅ 13 Engine-Ereignisse waren vollständig stumm

**Nachprüfung: BESTÄTIGT.** Ein neuer Test vergleicht automatisch, welche
Ereignisse die Engine emittiert und welcher Client-Zweig sie behandelt. Erste
Messung: **13 unbehandelt**.

**Behoben:** `fuse_armed` („Eine Granate liegt und tickt"), `fuse_expired`
(„… und gezündet"), `loot_error` (Fehler wird gemeldet statt verschluckt).
Die übrigen zehn sind **bewusst stumm** und einzeln begründet.
**Abgesichert:** `tests/event-coverage.test.js`, Test 4.

### ✅ `loot_error` verschwand spurlos

Ein Fehler in der Beuteverteilung wurde von keinem Zweig behandelt. Selten —
aber genau deshalb ist eine Meldung nötig.

## Widerlegte Fehlalarme (nachgeprüft)

### ❌ „Die Kernsteuerung ist wirkungslos"

**Behauptung:** Pfeiltasten und A/D/W/S ändern **nur die HUD-Anzeige**, niemals
`entity.angle`/`entity.power`. Die Simulation bleibe bei 45°/55.

**Nachprüfung: WIDERLEGT — mit Messung.**

`match.fire(playerId, angle, power)` setzt `entity.angle` auf den übergebenen
Wert. Gemessen: Winkel 1,000 rad übergeben → Projektil fliegt 0,982 rad (die
Abweichung ist die Schwerkraft im ersten Schritt), und `entity.angle` steht
danach auf exakt 1.

**Ursache der Fehlbeobachtung:** Die Testläufe des Agenten wurden durch eine
**gleichzeitige Änderung an `src/shared/config/weapons.js`** gestört — Vite lud
die Seite per HMR mitten im Lauf neu (im Protokoll als „FRAME NAVIGATED"
sichtbar). Der Agent hat das selbst erkannt, aber der Befund blieb in seiner
Zusammenfassung stehen.

**Lehre für künftige Messläufe:** Ein Dev-Server mit laufendem HMR ist die
falsche Umgebung für Messungen. Für Black-Box-Läufe gehört ein **Produktionsbau**
(`npm run build` + Vorschau) verwendet.

### ❌ „Das Ereignisprotokoll ist funktional kaputt"

**Behauptung:** Das Log ist bei Matchbeginn mit 60 Zeilen „P# ist gelandet"
geflutet; echte Ereignisse werden hinausgedrängt; in 6 Schüssen wuchs es
**0 Zeilen**.

**Nachprüfung: TEILWEISE BESTÄTIGT, in der Deutung falsch.**
Der Einschlag fehlte tatsächlich (`projectile_impact`, siehe oben) — das ist
behoben. Die Behauptung „0 Zeilen Wachstum" erklärt sich daraus.
Die „60 Zeilen ist gelandet" sind dagegen **echtes Spielgeschehen**: Bei jedem
Zug landen die Figuren nach Sprung oder Rückstoß. Das ist kein Fehler, sondern
eine Frage der Darstellung (Wiederholungen könnten zusammengefasst werden) —
eine **Design-Entscheidung**, nicht behoben.

## Beobachtungen des Agenten (nicht nachgeprüft, als Hinweis)

Der Agent berichtete außerdem über:
- Wartezeiten beim Matchstart (sein Protokoll nennt „30 s Wartezeit")
- Zustände, in denen die Anzeige etwas anderes zu zeigen schien als die
  Simulation

Diese Beobachtungen stammen aus Läufen, die durch das HMR-Neuladen gestört
waren. Ob ein echter Befund darunter ist, lässt sich aus dem vorliegenden
Material **nicht sicher trennen** — sie sind deshalb **nicht** in die TODO
übernommen. Ein neuer Messlauf auf einem Produktionsbau wäre nötig.

## Was einwandfrei funktionierte (vom Agenten)

- Match starten, schießen, Runden und Wind beobachten
- WebGPU-Auswahl in einer Umgebung ohne WebGPU (Rückfall auf CPU)
- Fehlermeldungen bei nicht erreichbarem Server

## Anmerkung des Auftraggebers

Der wichtigste Beitrag dieses Berichts war **nicht** ein einzelner Befund,
sondern die Beobachtungslücke selbst: Zwei von drei zentralen Behauptungen
waren Fehlalarme, verursacht durch eine gestörte Messumgebung. Genau deshalb
wurde jeder Befund nachgeprüft — und der eine, der standhielt (der fehlende
Einschlag), führte zur systematischen Prüfung aller Engine-Ereignisse. Dabei
kamen **13 stumme Ereignisse** heraus, von denen der Agent nur eines gesehen
hatte.

Der Agent hat zusätzlich einen Dev-Server zurückgelassen, der 63 Minuten weiter
lief. Für künftige Delegationen: **Messläufe auf einem Produktionsbau, und der
Server wird am Ende beendet.**
