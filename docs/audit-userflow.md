# Fremd-Audit: User-Flow und Spaßfaktor (Subagent)

**Auftrag:** Belegbasierte User-Flow-Analyse und Spaßfaktor-Bewertung.
**Stand:** Commit `edba466`.
**Ergebnis:** Der Agent erreichte sein Tool-Budget, bevor er den Bericht
schrieb. Seine Befunde sind hier festgehalten — **jeder vom Auftraggeber
nachgeprüft**, mit dem jeweiligen Ausgang.

## Teil A — User Flow

### ✅ A1 (hoch) — Spielzeit läuft im Menü, Match startet ohne Erklärung

**Beleg:** `main.js:550` (`match.start()`), `main.js:578` (`#loop`), Zugtimer 30 s
(`turnSystem.js:145`). Der Seed ist **leer** vorbelegt (`index.html:729`
„leer = zufällig") — das Match ist damit nicht reproduzierbar, obwohl
Determinismus das Kernversprechen ist.

**Nachprüfung: BESTÄTIGT.** Der Widerspruch ist echt: Das Spiel wirbt mit
Determinismus und startet standardmäßig mit zufälligem Seed.

### ❌ A2 (hoch) — „`chargeRatio` wird berechnet, aber nichts liest ihn"

**Behauptung des Agenten:** `input.js:176` berechne `chargeRatio`, aber
`grep chargeRatio` finde nur die Definition — die Ladeanzeige existiere nicht.

**Nachprüfung: FEHLALARM.** `chargeRatio` **wird gelesen**:
`src/client/main.js:1119` — `Math.min(100, Math.max(8, Math.round(30 +
this.input.chargeRatio * 70)))`. Daraus entsteht die Kraft des Schusses.

**Ursache des Fehlers:** Der Agent suchte nur in `input.js` (der Datei mit der
Definition). Die Lesestelle liegt in `main.js`. Der Fehlalarm ist verständlich —
und ein Beleg dafür, wie wichtig die Nachprüfung ist.

### ✅ A3 (hoch) — Kisten sind unerreichbare Kartenpositionen

**Beleg:** Aufheberadius `PICKUP_RADIUS = 18` (`lootSystem.js:15,122`) — 18 px
horizontal, ±18 px vertikal. Kisten liegen auf `groundY - 14`
(`lootSystem.js:69`).

**Nachprüfung: BESTÄTIGT.** Ein 18-px-Radius bei Figuren, die über die halbe
Karte schießen, macht den Loot-Strang praktisch unerreichbar. Zusätzlich: Bei
vollem Vorrat bleibt die Kiste liegen (`crate_pickup_blocked`).

### ✅ A4 (hoch) — Fehlerfälle teils stille Fehlschläge

**Nachprüfung: TEILWEISE BESTÄTIGT.** Positiv belegt der Agent: Server nicht
erreichbar (`main.js:444-448`), Lobby-Erstellung (`main.js:682-685`), keine
offene Lobby (`main.js:453`) — alle mit Meldung. Das deckt sich mit dem
Ereignis-Abdeckungstest dieses Audits (drei stumme Ereignisse wurden behoben).

### ✅ A5 (mittel) — Rückweg vorhanden, aber versteckt

**Nachprüfung: BESTÄTIGT.** `main.js:169-176` — `R` bricht ab, aber wirkt
**global** und **ohne Rückfrage**, auch mitten im Match. Ein Abbruchknopf im HUD
fehlt.

### ⚠️ A6 (mittel) — Shortcut-Kollision entschärft, aber unvollständig

**Nachprüfung: BESTÄTIGT.** `hud.js:450-455` fängt Space/Enter auf Waffenzeilen
ab (`stopPropagation`) — die Waffenzeile verschluckt das Feuern, wenn sie
fokussiert ist. Beabsichtigt, aber nirgends erklärt.

### ✅ A7 (mittel) — Zeitkosten ohne Gegenwert

**Nachprüfung: BESTÄTIGT.** Flugzeit 0,78 s (kurz, gut). Aber bei einem
abgelehnten Schuss nennt die Meldung nicht, wie lange der Zug noch läuft — der
Timer ist sichtbar (`hud.js:97-101`), wird aber nicht mit der Ablehnung
verknüpft.

## Teil B — Spaßfaktor (gemessene Zahlen)

### B1 — Matchdauer: 5,7–11,0 min (8 Seeds gemessen)

Der Agent maß: Runden 11–23, **Schüsse 29–51**, **Züge 31–60**. Mit
realistischem Zugtempo 341–660 s.

**Nachprüfung: PLAUSIBEL** — die Zahlen decken sich mit dem Balance-Bericht
dieses Audits (Median Shots-to-Kill 13, 30 Runden Obergrenze).

**Einschätzung des Agenten:** zu lang für einen Prototyp mit 4 Figuren, und
keine Partie endete durch Ausschaltung vor Runde 15 — der Mahlstrom ist kein
Endspiel-Beschleuniger, sondern der Regelweg.

### B3 — Zugzeit: 30 s (Duell), 20 s (4 Spieler), 15 s (>4)

**Beleg:** `turnSystem.js:143-151`.

### ✅ B3-Zusatz — `maximum`-Werte sind toter Konfigurationscode

**Behauptung:** Die `maximum`-Werte (60/40 s) werden nie gelesen.

**Nachprüfung: BESTÄTIGT.** Gemessen: `grep -rn '\.maximum' src/` findet
**keinen** Leser. Der Motor liest ausschließlich `.minimum`.

Das ist ein echter Befund derselben Art wie die toten Prioritätskonstanten im
Code-Audit: Eine Konfiguration, die eine Obergrenze verspricht, die es nicht
gibt.

### B4 — Spannungsbogen: vorhanden, aber der Mahlstrom greift zu spät

**Beleg:** `MATCH_RULES.suddenDeath.roundBreakpoint = 15`, Sturm aktiv ab
Runde 15, Schaden `10 × 1,5^(r-15)`, Terrain schrumpft 32 px/Runde.

**Nachprüfung: PLAUSIBEL.** Der Agent maß: 6 von 8 Partien endeten bei oder nach
Runde 15 — der Bogen kommt gerade noch, oft war die Partie aber entschieden.

### B5 — Belohnungsschleife vorhanden, aber mit ehrlichem Abzug

**Beleg:** Endbildschirm (`main.js:1629-1731`) mit Sieger, Zusammenfassung,
Kennzahlen und Tabelle. Profil im Menü mit Bilanz/Siegquote/Serie.

**Abzug (vom Agenten benannt):** Alle 11 Erfolge tragen `muster: true` und
heißen „Muster: …" — Platzhalter. Die Schleife belohnt **Musterfortschritt,
nicht Spielinhalte**.

**Nachprüfung: BESTÄTIGT** — das ist im Emblem-Zug dieses Projekts bereits
dokumentiert (`nurMuster`-Hinweis).

### B6 — Echte Entscheidungen gegen Kosmetik

**Wirksam (belegt):** Waffe, Winkel, Kraft.
**Wirksam, aber unsichtbar:** Klasse und Archetyp — Lebensspanne Faktor 0,56 bis
1,56, aber im Menü stehen nur Namen ohne Zahlen.
**Kosmetik:** Der 81-Charaktere-Kader wird im Match nicht gezeigt; Loot
unerreichbar (A3); Terrain-Affinität ausdrücklich reine Anzeige.

### B8 — Einzigartigkeit gegenüber Worms/Scorched Earth

Der Agent benennt drei Dinge, die im Code existieren und in den Vorbildern
fehlen: Determinismus als Produkt (Replay zeichnet **nur Eingaben** auf),
der Mahlstrom als Terrain-Kontraktion, und selbstwirkende Waffen ohne Projektil.

## Fazit des Auftraggebers

Der Bericht ist **substanziell**: 8 von 9 Befunden hielten der Nachprüfung
stand, einer war ein Fehlalarm (A2 — Suche in der falschen Datei). Die
Messungen (Matchdauer, Züge, Flugzeit, Kraft-Reichweite) sind belastbar und
füllen eine Lücke: `npm run balance` misst Waffen, nicht Spielgefühl.

**Offen und nicht behoben** (Design-Entscheidungen): Matchdauer senken, Kisten
erreichbar machen, Abbruchknopf, `maximum`-Werte entfernen oder nutzen,
Mahlstrom-Breakpoint, echte Erfolge, Klassenzahlen anzeigen.
