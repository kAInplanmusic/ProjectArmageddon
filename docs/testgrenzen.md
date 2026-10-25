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
| E2E-Tests | 191 (30 Dateien) — 190 grün, 0 rot, 1 übersprungen (gemessen 2026-09-27, seriell); vorher 184 in 28 Dateien |
| Werkzeuge | 37 Skripte (22) |
| Unit-Laufzeit | **4,7 min** (22 s) |
| E2E-Laufzeit | **25,2 min** (9,4 min) |

Das Verhältnis Test- zu Quellcode liegt bei **0,91** — für ein Projekt dieser
Größe ist das hoch.

**Die Unit-Laufzeit ist von 22 s auf 4,7 min gewachsen.** Das ist kein Problem
der Testmenge allein: Der größte Einzelposten sind die Mess-Tests, die echte
Partien spielen (`balance`, `balance:sweep`, `check:bots`-Nachfolger,
`measure:*`-Aufrufe in Tests) — sie rechnen, statt zu prüfen. Wer schnell prüfen
will, fährt `npm run test:unit` (PRNG/Seed/Loot) oder `npm run smoke:fast`.

**Die Bildzeit-Prüfung läuft auf der echten GPU — die Flagge war die Ursache.**
Gemessen mit `--use-gl=angle --use-angle=gl`: `ANGLE (Intel, Mesa Intel HD
Graphics 3000 (SNB GT2), OpenGL 3.3)`, **13,6 ms je Mio. Pixel** auf der
2560×1440-Leinwand (21,3 fps kopflos, 29,3 fps mit Fenster). Ohne die Flags
schaltet Chrome auf **SwiftShader** um: 48,2 ms je Mio. Pixel, 5,6 fps —
Faktor 3,5. Geprüft wird deshalb der Aufwand JE MILLION PIXEL (Grenze 30 ms)
statt eines fps-Festwerts, der für eine viermal kleinere Karte galt.

Der einzige übersprungene Test ist der Aufschlag-Test: Er überspringt sich mit
Begründung, wenn Untergrund UND Differenz beide auffällig sind.

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

Bei 28 Dateien läuft Playwright parallel, aber jeder Lauf startet einen
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

---

## Bildvergleiche: ein Gate für EINEN Rechner, nicht für die CI

`tests/e2e/visuell.spec.mjs` vergleicht Menü, Lobby und HUD gegen abgelegte
Bilder (`tests/e2e/visuell.spec.mjs-snapshots/`), Toleranz
`maxDiffPixelRatio: 0.02`. Das ist ein gutes Gate — aber nur dort, wo die Bilder
entstanden sind.

### Warum es nicht in die CI gehört

Die Bilder hängen an der **Render-Umgebung**: Schriftmetriken, Hinting,
Rasterung. Der Dateiname trägt nur `-chromium-linux`; zwei verschiedene
Linux-Rechner landen auf demselben Namen und überschreiben sich gegenseitig.

Gemessen am **2026-10-25**, und zwar so, dass die Ursache belegt ist und nicht
vermutet:

| Messung | Ergebnis | Aussage |
|---|---|---|
| Derselbe Test dreimal auf einem Rechner | Läufe unterscheiden sich um **1–3 Pixel** | Der Zustand ist eingefroren, kein Flake |
| Alter Commit gegen neuen Commit | **3 Pixel** | Der Code ist nicht die Ursache |
| Beide gegen die abgelegten Bilder | je **104.130 Pixel** (31,6 %) | Der Abstand hängt an der Umgebung |
| Bester Versatz gesucht | dy = **+2 px** halbiert den Fehler | Layout-Versatz aus Schriftmetriken, kein Inhaltsunterschied |

Ein Vergleich auf einem fremden Runner prüft also **den Unterschied zwischen zwei
Rechnern**, nicht das Spiel. Und eine Ampel, die auf fremder Hardware dauerhaft
rot steht, wird nach zwei Tagen ignoriert — dann fällt auch ein echter
Bildfehler nicht mehr auf.

### Die Regel

- **Lokal** (Variable nicht gesetzt): Bildvergleiche laufen und **sind** das Gate.
  Vor dem Übergeben laufen lassen.
- **In der CI** setzt `.github/workflows/ci.yml` `PA_OHNE_BILDVERGLEICH=1`. Die
  Tests werden dann als **übersprungen mit Begründung** gemeldet — sie
  verschwinden nicht stillschweigend.

### Wenn ein Vergleich rot wird

`--update-snapshots` ist **kein Reflex**. Erst die drei Messungen aus der Tabelle
oben (stabil? / Code? / Versatz?) — sie stehen mit Befehlen im Kopf von
`visuell.spec.mjs`. Erst wenn sie gegen „Code" sprechen, ist das Nachziehen
richtig, und dann **nur die roten Dateien**, nicht der ganze Satz. Danach zweimal
vollständig laufen lassen; ein einzelnes Grün beweist nichts.

**Was nicht in Frage kommt:** `maxDiffPixelRatio` hochsetzen, damit es grün wird.
Dann prüft der Vergleich nichts mehr und meldet trotzdem Erfolg.

### Bekannte Grenze, bewusst offen

Wer die Strecke künftig auf einem **anderen** Knoten laufen lässt, bekommt
dieselben zwei Vergleiche dort rot. Sauber wäre ein umgebungsunabhängiger
Vergleich (etwa Kanten statt Pixel). Das ist eine eigene Aufgabe und steht als
solche in `docs/offene-punkte.md`.

### Die Dossier-Bilder: kein Vergleich, aber dieselbe Grenze

`tests/e2e/vergleich-screenshots.spec.mjs` erzeugt die Bilder für
`docs/vergleich-alternativspiele-2026-10-19/` und **überschreibt dabei
getrackte Dateien**. Diese Spezifikation vergleicht nichts — sie hängt aber an
derselben Render-Umgebung wie die Baselines.

Gemessen am **2026-10-25**: Ein Volllauf änderte **27 Bilder**, ohne dass sich
eine Zeile Produktcode änderte (derselbe Code, ein anderer Lauf; Dateigrößen
zum Teil deutlich anders). Ein CI-Lauf würde also Bilder einer fremden Maschine
in das Dossier schreiben, die niemand committen will.

Deshalb gilt dieselbe Regel: Die CI setzt `PA_OHNE_BILDVERGLEICH=1`, die
Spezifikation meldet sich dann als **übersprungen mit Begründung**. Lokal läuft
sie und erneuert das Dossier — bewusst, nicht als Nebenwirkung jedes Laufs.
Der Bilder-Zweig fällt damit in der CI weg; die Mindestzusagen (Seite lädt,
Menü öffnet, HUD steht, keine Seitenfehler) decken die übrigen Spezifikationen
dort weiter ab.
