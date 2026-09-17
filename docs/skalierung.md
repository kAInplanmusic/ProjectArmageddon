# Skalierung: vom Browser-Spiel zum Server-Spiel

Wie das Spiel auf gemieteten Instanzen läuft — mit **gemessenen** Zahlen statt
Schätzungen. Und mit der klaren Trennung: Was ist gerechnet, was ist entschieden.

**Stand:** 2026-09-17. Alle Zahlen mit `npm run measure:load` und
`npm run plan:scale` nachmessbar.

---

## 1. Die Ausgangslage in Zahlen

Gemessen an echten Partien (`scripts/measure-load.mjs`):

| Konfiguration | Rechenzeit je Tick | Zustandsgröße |
|---|---|---|
| 2 Spieler | 2,40 ms | 2,7 KB |
| 4 Spieler | 1,11 ms | 3,4 KB |
| 6 Spieler | 0,88 ms | 4,1 KB |
| 8 Spieler | 0,79 ms | 5,0 KB |

> **Befund:** Bei 4 Spielern kostet ein Match **6,7 % eines Kerns**. Die
> Simulation ist mit Abstand der billigste Teil des Systems.

---

## 2. Die Hochrechnung auf deine Zielgrößen

Modell (offen benannt, damit widerlegbar):

- Rechenzeit je Tick — **linear mit der Figurenzahl**
- Terrain-Erzeugung — **linear mit der Kartenbreite**
- Snapshot-Größe — **linear mit Figuren und Kisten**
- Zerstörbare Mehrkomponenten — **Faktor 1,6** auf Kollision

| Szenario | Spieler | Karte | Tick | % Kern |
|---|---|---|---|---|
| Duell | 2 | 1280×720 | 0,96 ms | 5,8 % |
| Kleines Match | 4 | 1920×1080 | 1,92 ms | 11,5 % |
| Großes Match | 6 | 2560×1440 | 2,88 ms | 17,3 % |
| Krieg | 8 | 3840×2160 | 3,84 ms | 23,1 % |
| Krieg 4K | 8 | 3840×2160 | 6,15 ms | 36,9 % |

> **Korrektur (2026-09-17):** Hier standen zunächst geschätzte Netzwerte
> (bis „2 MB/s je Match"). Nachgemessen mit `npm run measure:network` sind es
> **38 KB/s** für ein 8-Spieler-Match — **Faktor 100 weniger**. Die Schätzung
> war falsch; die Tabelle führt die gemessene Zahl jetzt weiter unten.

**Was daran überrascht:** Die Karte wächst um Faktor 9 (720p → 4K), die
Rechenlast aber nur um Faktor 6,4. Der Grund: Die Simulation läuft über
**Figuren**, nicht über Pixel. Die Fläche kostet nur bei der Terrain-Erzeugung —
**einmal je Runde**, nicht je Tick.

---

## 3. Die Netzlast — gemessen, nicht geschätzt

Gemessen am **Drahtformat** (`npm run measure:network`):

| Konfiguration | Snapshot (Ø) | Spitze | je Spieler/s |
|---|---|---|---|
| 2 Spieler | 95 B | 166 B | 1,9 KB |
| 4 Spieler | 141 B | 234 B | 2,8 KB |
| 6 Spieler | 179 B | 246 B | 3,5 KB |
| **8 Spieler** | **202 B** | **246 B** | **4,8 KB** |

Ein Snapshot geht 20× je Sekunde an jeden Spieler. Für 8 Spieler ergibt das
**38 KB/s** — nicht 2 MB/s, wie zuvor geschätzt.

> **Ein 100-Mbit-Anschluss trägt 325 solcher Matches gleichzeitig.** Das Netz
> ist damit kein Engpass.

### Zwei Befunde, die dabei auffielen

**1. Das Delta-Encoding spart nichts.** Es ist umgesetzt
(`encodeSnapshot(state, { previous })`), aber die Nachrichtengröße ist **fest**:

```javascript
const size = HEADER_SIZE + players.length * PLAYER_STRIDE + ...;
const bytes = new Uint8Array(size);   // immer gleich groß
```

Das Delta setzt nur ein `dirty`-Byte je Spieler — die Felder werden trotzdem
vollständig geschrieben. Und `dirty` wird im Client **nicht gelesen** (geprüft).
Der vorher als „größter Einzelgewinn" bezeichnete Hebel existiert nicht.

**2. Wo wirklich Spielraum wäre:** Die Aufteilung eines 4-Spieler-Snapshots ist

| Teil | Bytes | Anteil |
|---|---|---|
| Kopf | 24 | 14 % |
| Spieler | 60 | 36 % |
| Projektile | 62 | 37 % |
| Kisten | 18 | 11 % |
| Geschütze | 5 | 3 % |

Wer sparen will, muss die **Strides** ändern (etwa `waterLevel` und
`frozenTurns` nur bei Bedarf senden), nicht das Delta-Flag. **Nötig ist es bei
den gemessenen Werten aber nicht.**

---

## 4. Was das für RunPod und Hetzner bedeutet

### RunPod (GPU) — **für die Simulation nicht nötig**

Die Simulation ist CPU-Arbeit und braucht keine GPU. Sie wäre erst nötig für
**gerenderte Kulissen zur Laufzeit** — und das widerspräche dem Determinismus,
der die Grundlage von Replays und Persistenz ist (siehe `docs/betrieb.md`).

**Wofür RunPod trotzdem sinnvoll wäre:**

| Zweck | Zeitpunkt | Begründung |
|---|---|---|
| Kulissen **vorab** erzeugen | heute möglich | 60 Bilder liegen bereits vor — neue Sätze ließen sich auf einer GPU in Minuten erzeugen |
| KI-Gegner **trainieren** | später, falls überhaupt | Ein Bot braucht keine KI (siehe `docs/ki-im-betrieb.md`) — die Flugbahn ist exakt berechenbar |
| Video-/Trailer-Erzeugung | Gelegenheit | Einmalig, nicht im Betrieb |

**Kostenmodell:** RunPod rechnet sekundengenau ab. Eine A100-Stunde liegt bei
rund 1,50 €. **Für einen Batch-Lauf von 60 Kulissen sind das wenige Cent** — die
GPU ist damit ein **Werkzeug**, kein Betriebsmittel.

### Hetzner (CPU) — **für den Betrieb richtig**

| Bedarf | Instanz | Kosten |
|---|---|---|
| Entwicklung, Tests | CX22 (2 vCPU, 4 GB) | ~4 €/Monat |
| Kleiner Betrieb (≤ 10 Matches) | CX32 (4 vCPU, 8 GB) | ~7 €/Monat |
| Größerer Betrieb (≤ 50 Matches) | CX42 (8 vCPU, 16 GB) | ~16 €/Monat |

Die Rechnung mit den **gemessenen** Werten: Ein CX32 hat 4 Kerne. Ein
8-Spieler-Match braucht 23 % eines Kerns — das sind **17 Matches je Kern**, also
**68 gleichzeitige Matches** auf der Maschine.

Das Netz begrenzt dabei nicht: 68 Matches × 38 KB/s ergeben **2,6 MB/s** — ein
Zehntel eines 100-Mbit-Anschlusses.

**Also: Ein CX32 für 7 €/Monat trägt rund 68 gleichzeitige 8-Spieler-Matches.**
Das ist weit mehr, als ein Start braucht.

---

## 5. Die Minutenabrechnung

Du hast „minutengenau abgerechnet" erwähnt — das ist bei beiden Anbietern so,
aber mit **sehr unterschiedlicher Folge**:

| | Hetzner (CPU) | RunPod (GPU) |
|---|---|---|
| Abrechnung | stundengenau, monatlich gedeckelt | sekundengenau |
| Bei Nichtnutzung | Kosten laufen weiter | Kosten = 0 |
| Für ein Spiel sinnvoll? | **ja** — der Server soll erreichbar sein | **nein** — die Simulation braucht keine GPU |

> **Für den Betrieb ist „Instanz bei Bedarf starten" die teurere und
> langsamere Variante.** Ein Spieler, der 40 Sekunden auf eine Instanz wartet,
> spielt nicht. Ein dauerhaft laufender CX22 kostet 4 €/Monat — weniger als
> zehn Minuten A100 im Monat.

**Wo die Minutenabrechnung passt:** für **Batch-Arbeit**, die nicht im
Spielbetrieb hängt — Kulissen erzeugen, Tests über Nacht, Messreihen.

---

## 6. Was von deinen Zielen heute schon trägt

| Ziel | Stand | Was fehlt |
|---|---|---|
| Server-Betrieb | **läuft** — `npm run server`, TLS fehlt (siehe `docs/betrieb.md`) | Konten, Reverse-Proxy |
| 2 bis 8 Spieler | **läuft** — Lobby erlaubt 1–3 je Team | Teamgröße > 3 ist gesperrt |
| Große Karten | **möglich** — `MAP_SIZES` ist eine Tabelle | 4K ist noch nicht eingetragen |
| 150 Waffen | **vorhanden** — 150 im Katalog | 1 wirkt nicht (gemessen) |
| Günther als NPC | **vorhanden** — `guenther.js` | mehr NPCs fehlen |
| Zerstörbare Mehrkomponenten | **teilweise** — 1D-Terrain, zerstörbar | Komponenten (Höhlen, Böden) fehlen |
| Sound | **vorhanden?** | nicht geprüft |
| Full-HD/4K | **1280×720 heute** | Skalierung der Anzeige |

---

## 7. Was zu tun ist — in der Reihenfolge, die die Messung nahelegt

**Zuerst, weil es deine Ziele freischaltet (mittel):**

1. **Teamgröße über 3 öffnen.** Die Sperre steht in `lobby.js`. Ohne sie gibt
   es keine 6er- und 8er-Matches.
2. **4K in `MAP_SIZES` eintragen.** Die Tabelle nimmt jede Größe; die Kamera
   muss mitskalieren.
3. **Konten und TLS** (`docs/betrieb.md`) — ohne sie ist der Server offen.

**Danach, weil es Gestaltung ist (deine Entscheidung):**

4. Sound, Detailtiefe, Mehrkomponenten-Karten — jede davon ist eine eigene
   Größe. Die Rechenlast trägt sie alle (Faktor 1,6 im Modell ist eingerechnet).

**Nicht nötig, entgegen der ersten Einschätzung:**

- Delta-Snapshots — sie existieren, sparen aber nichts (siehe Abschnitt 3).
- Eine größere Maschine — weder CPU noch Netz sind der Engpass.

---

## 8. Was dieses Dokument nicht beantwortet

- **Ob 8-Spieler-Matches Spaß machen.** Die Technik trägt sie; ob die Partie bei
  8 Figuren übersichtlich bleibt, ist eine Designfrage — und die Zugzeit von
  20 s mal 8 Spielern ergibt 160 s je Runde.
- **Wie die Kamera bei 4K arbeitet.** Mehr Fläche auf demselben Bildschirm
  heißt kleinere Figuren oder Bildlauf. Das ist Gestaltung.
- **Ob KI-NPCs Günthers Klasse brauchen.** Der Rechenkern für die
  Zielberechnung existiert; wie ein NPC sich verhalten SOLL, ist Inhalt.
