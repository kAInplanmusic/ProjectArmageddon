# Wo die Tests an Grenzen kommen

Eine ehrliche Bestandsaufnahme. Du hast vermutet, dass wir bald an Grenzen
stoßen — **das tun wir, aber nicht dort, wo man es erwartet.**

**Stand:** 2026-09-17. Zahlen nachmessbar.

---

## 1. Der Bestand in Zahlen

| | Wert |
|---|---|
| Quellcode | 30.255 Zeilen |
| Tests | 26.546 Zeilen |
| Unit-Tests | 795 (72 Dateien) |
| E2E-Tests | 172 (27 Dateien) |
| Werkzeuge | 22 Skripte |
| Unit-Laufzeit | **22 s** |
| E2E-Laufzeit | **9,4 min** |

Das Verhältnis Test- zu Quellcode liegt bei **0,88** — für ein Projekt dieser
Größe ist das hoch. Die Unit-Suite läuft in 22 Sekunden, ist also **kein**
Problem.

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
