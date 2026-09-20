# Wo die Tests an Grenzen kommen

Eine ehrliche Bestandsaufnahme. Du hast vermutet, dass wir bald an Grenzen
stoßen — **das tun wir, aber nicht dort, wo man es erwartet.**

**Stand:** 2026-09-20 (Zahlen nachgemessen; die früheren Werte in Klammern sind
vom 2026-09-17 und waren seither überholt).

---

## 1. Der Bestand in Zahlen

| | Wert |
|---|---|
| Quellcode | 35.955 Zeilen (30.255) |
| Tests | 32.684 Zeilen (26.546) |
| Unit-Tests | 974 (93 Dateien) — vorher 795 in 72 Dateien |
| E2E-Tests | 184 (28 Dateien) — 182 grün, 1 rot, 1 übersprungen; vorher 172 in 27 Dateien |
| Werkzeuge | 37 Skripte (22) |
| Unit-Laufzeit | **4,7 min** (22 s) |
| E2E-Laufzeit | **22,5 min** (9,4 min) |

Das Verhältnis Test- zu Quellcode liegt bei **0,91** — für ein Projekt dieser
Größe ist das hoch.

**Die Unit-Laufzeit ist von 22 s auf 4,7 min gewachsen.** Das ist kein Problem
der Testmenge allein: Der größte Einzelposten sind die Mess-Tests, die echte
Partien spielen (`balance`, `balance:sweep`, `check:bots`-Nachfolger,
`measure:*`-Aufrufe in Tests) — sie rechnen, statt zu prüfen. Wer schnell prüfen
will, fährt `npm run test:unit` (PRNG/Seed/Loot) oder `npm run smoke:fast`.

**Der eine rote E2E-Test ist einer, der eine GPU verlangt:** „Bildzeiten auf dem
echten Grafikpfad" startet den Browser mit `--use-angle=gl` und fordert mehr als
20 fps — gemessen **17,2 fps**, Bodenweg `cpu`. Auf diesem Rechner rastert der
Browser in Software (51,2 ms je Bild, Terrain-Neuaufbau 2531 ms für 2560×1440).
Die übrigen Bildzeit-Tests MESSEN auf dem Softwarepfad und prüfen ihn
maßstabsgerecht; sie laufen deshalb auch hier.

**Was daran lange falsch war (gefunden 2026-09-20):** Von den 7 roten Tests
lagen fünf im 60-s-Timeout (sie MESSEN 300 Bilder — `test.slow()` behoben), zwei
in **veralteten Budgets**: Sie verglichen gegen 1280×720 und 500/1000 ms, während
die Karte inzwischen 2560×1440 misst. Ein absolutes Budget ohne die Fläche wird
bei jeder Kartenvergrößerung stillschweigend falsch. Geprüft wird jetzt der
Aufwand **je Pixel** (Bezugswert gemessen 0,74 µs, Grenze 3,0 µs).

**Ein Nebenfund zum Produkt:** Der Terrain-Aufbau kostet auf dem CPU-Weg rund
2,5–2,7 s für 2560×1440 (0,7 µs je Pixel, linear in der Fläche) und läuft EINMAL
je Kartenaufbau — nicht bei jedem Krater. Der GPU-Weg bessert danach nach; ohne
GPU-Gerät sieht der Spieler den Boden erst nach diesen Sekunden.

**Online-Tests brauchen ZWEI Menschen.** Es gibt keine Bot-KI; unbesetzte Teams
übernimmt niemand, und ein Match startet erst, wenn jedes Team einen verbundenen
Menschen hat. Die Online-Spezifikationen (`multiplayer`, `network-conditions`,
`prediction-online`) verbinden deshalb einen zweiten Spieler als rohen Socket
(`tests/e2e/helfer/zweiter-mensch.mjs`). Vorher sprang dort ein Server-Bot ein —
neun der damals roten Tests hingen an dieser Annahme.

---

## 2. Die fünf Grenzen, die wirklich kommen

### Grenze 1: Die E2E-Laufzeit — **jetzt schon erreicht**

```
9,4 Minuten je vollem Lauf
```

Bei 27 Dateien läuft Playwright parallel, aber jeder Lauf startet einen
Vite-Server und einen Browser. Der Nachzügler-Effekt ist bereits aufgetreten:
**Drei frühere „Fehlschläge" waren Altlasten abgeschlossener Läufe**, deren
Meldungen verspätet eintrafen.

**Was das kostet:** Nach jeder Änderung 9 Minuten warten heißt, dass man
Änderungen **bündelt** statt sie einzeln zu prüfen. Genau das ist in dieser
Sitzung passiert — und dabei sind zwei Fehler durchgerutscht (der Signal-Handler,
der Port-Wettlauf), die ein sofortiger Lauf gefunden hätte.

**Der Hebel:** Ein **Schnelllauf** (Rauchtest) von 60 Sekunden für die
Kernpfade, der Volllauf nur vor einem Push. Nicht „weniger testen", sondern
**gestaffelt** testen. Das ist eine Einrichtung, keine Entscheidung.

### Grenze 2: Das Spielgefühl lässt sich nicht testen — **strukturell**

Die Suite prüft, dass **Mechanik** funktioniert: Eine Kiste wird aufgenommen,
der Hash ist deterministisch, die Waffe trifft. Sie kann **nicht** prüfen, ob
das Spiel **Spaß macht**.

Das ist keine Lücke, die man schließt — es ist die Grenze der Methode. Was
bleibt, sind **Stellvertreter-Messungen**, und einige haben bereits echte Fehler
gefunden:

| Messung | Was sie aufdeckte |
|---|---|
| `check:crates` | Kisten waren praktisch unerreichbar (1 von 6 Partien) |
| `check:maelstrom` | Der Sturm griff, wenn die Partie vorbei war |
| `check:time` | Gesundheits-Hebel wirkt unter 70 gar nicht |
| `balance:classes` | Scout 26 % schwächer als Artillery |
| `balance:sweep` | 59 Waffen wirkungslos (behoben: 1) |

**Was fehlt:** eine Messung für **Flow**. Ein Spiel kann mechanisch korrekt und
trotzdem langweilig sein. Die Zahlen, die dem am nächsten kommen, sind bereits
da: Zugzeit × Züge (13 min), Trefferquote (32 %), Wirkung je Schuss.

### Grenze 3: Tests können nicht entscheiden, was richtig ist

Mehrfach in dieser Sitzung: Ein Test schlug fehl, und die **Frage** war, ob der
Test oder der Code unrecht hat.

| Fall | Wer hatte recht |
|---|---|
| Mahlstrom-Schadensformel bei Runde 14/15 | **Der Test war zu starr** — die Formel stimmte |
| „Kein Schaden nach Effektablauf" | **Der Test mass zwei Ursachen** — der Sturm kam dazu |
| „Ohne Lobby keine Datei" | **Der Code hatte recht** — `save()` schreibt auch leer |
| Server-Signal | **Der Test hatte recht** — der Server verlor den Zustand |

**Die Grenze:** Ein Test kann nur prüfen, was jemand als Bedingung formuliert
hat. Bei **jeder** dieser vier Stellen war die Bedingung selbst falsch
formuliert — und kein Werkzeug hätte das erkannt. Das ist Arbeit, keine Technik.

### Grenze 4: Determinismus und Nebenläufigkeit vertragen sich schlecht

Zweimal trat derselbe Fehler auf: Ein Test war **isoliert grün** und im
**Volllauf rot** (der Port-Wettlauf, der Signal-Handler). Ursache: Tests, die
echte Prozesse starten, teilen sich Maschinenressourcen.

**Der Hebel:** Prozess-Start-Tests brauchen **erfragte statt gewählte**
Ressourcen (Ports vom Betriebssystem) und **wiederholte Läufe** (der
Signal-Fehler trat in 1 von 3 auf — ein einzelner Lauf fand ihn nicht).

### Grenze 5: Die Testmenge selbst wird zum Pflegefall

Der Umbau zum Server-Spiel berührt **jede** Schicht: Lobby, Netzwerk, Kamera,
Karten, Spielerzahl. Bei 795 Tests, die den heutigen Zustand festhalten, ist
jede Strukturänderung ein Test-Umbau.

**Konkret:** Die Teamgröße ist auf 1–3 **gesperrt** — vermutlich in mehreren
Tests. Sie zu öffnen heißt, die Sperre zu finden und die Tests umzuschreiben.

**Der Hebel:** Strukturtests prüfen **Beziehungen**, nicht Werte („der Radius
liegt über der Sprungdistanz" statt „der Radius ist 110"). Das ist in dieser
Sitzung mehrfach nachträglich eingebaut worden — nachdem starre Werte die
Änderung blockiert hatten.

---

## 3. Die Rangfolge

Was **zuerst** zu tun ist, begründet aus den Messungen:

| # | Maßnahme | Warum zuerst |
|---|---|---|
| 1 | **Rauchtest (60 s)** | Der Volllauf kostet 9,4 min — dadurch wird zu selten geprüft |
| 2 | **Delta-Snapshots** | Löst den Netz-Engpass (Faktor 5–20), siehe `docs/skalierung.md` |
| 3 | **Teamgröße öffnen** | Ohne sie gibt es keine 6er- und 8er-Matches (dein Ziel) |
| 4 | **4K in `MAP_SIZES`** | Die Tabelle nimmt jede Größe; Kamera muss mitskalieren |
| 5 | **Strukturtests statt Werten** | Jede Strukturänderung wird sonst zum Test-Umbau |

**Punkt 1 und 5 sind technisch und klein.** Punkt 2 ist der größte Einzelgewinn.
Punkt 3 und 4 schalten deine Ziele frei.

---

## 4. Was ich dir nicht ersparen kann

**Ob das Spiel Spaß macht, entscheidet kein Test.** Die Suite kann dir sagen:
Es läuft, es ist deterministisch, die Waffen wirken, die Kisten sind erreichbar,
die Partie dauert 13 Minuten. Sie kann **nicht** sagen, ob 13 Minuten zu lang
sind — das ist ein Urteil, kein Messwert.

Der ehrlichste Umgang damit: Die Messungen liefern **die Zahlen, die man für ein
Urteil braucht**. Die 13 Minuten, die 32 % Trefferquote, der 26-%-Rückstand des
Scouts — daraus wird ein Urteil, sobald du sagst, was du willst.

**Und die zweite Grenze:** Bei Gestaltung (Namen, Lore, Aufbau der Karten,
Sound) hört die Messung ganz auf. Dort hilft kein Werkzeug — dort hilft nur,
dass jemand entscheidet.
