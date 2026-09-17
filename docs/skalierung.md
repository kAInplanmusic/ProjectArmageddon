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

| Szenario | Spieler | Karte | Tick | % Kern | Snapshot | Netz je Sek. |
|---|---|---|---|---|---|---|
| Duell | 2 | 1280×720 | 0,96 ms | 5,8 % | 3 KB | 0 MB |
| Kleines Match | 4 | 1920×1080 | 1,92 ms | 11,5 % | 5 KB | ~0 MB |
| Großes Match | 6 | 2560×1440 | 2,88 ms | 17,3 % | 8 KB | ~1 MB |
| Krieg | 8 | 3840×2160 | 3,84 ms | 23,1 % | 12 KB | ~2 MB |
| Krieg 4K | 8 | 3840×2160 | 6,15 ms | 36,9 % | 13 KB | ~2 MB |

**Was daran überrascht:** Die Karte wächst um Faktor 9 (720p → 4K), die
Rechenlast aber nur um Faktor 6,4. Der Grund: Die Simulation läuft über
**Figuren**, nicht über Pixel. Die Fläche kostet nur bei der Terrain-Erzeugung —
**einmal je Runde**, nicht je Tick.

---

## 3. Der echte Engpass

| Szenario | Matches je CPU-Kern | Matches je 100 Mbit |
|---|---|---|
| Duell | 22 | 117 |
| Kleines Match | 11 | 29 |
| Großes Match | 7 | 12 |
| Krieg | 5 | 6 |
| Krieg 4K | 3 | **5** |

> **Die Netzlast ist der Engpass, nicht die Rechenlast.**

Ein Snapshot geht **20× je Sekunde an jeden Spieler**. Bei 8 Spielern sind das
160 Sendungen je Sekunde — und jede trägt den Zustand aller Figuren und Kisten.

**Das ist der wichtigste Hebel**, und er ist billiger als jede größere Maschine:
Ein **Delta-Snapshot** (nur Änderungen statt Vollzustand) würde die Netzlast um
den Faktor 5 bis 20 senken. Die Rechenlast eines Deltas ist vernachlässigbar,
weil der Server den vorherigen Zustand ohnehin kennt.

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

Die Rechnung: Ein CX32 trägt rechnerisch ~44 kleine Matches (4 Kerne × 11) oder
**28 (4 Kerne × 7 große)**. Begrenzt wird er vom Netz — bei 1 GBit Anschluss
trägt er 120 kleine oder 120 Krieg-Matches netzseitig.

**Also: Ein CX32 für 7 €/Monat trägt einen echten Betrieb.** Die Netzlast
begrenzt bei 1 GBit nicht.

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

**Zuerst, weil es den Engpass löst (billig):**

1. **Delta-Snapshots.** Der Netz-Engpass verschwindet um Faktor 5–20, die
   Rechenlast steigt kaum. Ein Server für 7 € trägt dann einen echten Betrieb.

**Dann, weil es deine Ziele freischaltet (mittel):**

2. **Teamgröße über 3 öffnen.** Die Sperre steht in `lobby.js`. Ohne sie gibt
   es keine 6er- und 8er-Matches.
3. **4K in `MAP_SIZES` eintragen.** Die Tabelle nimmt jede Größe; die Kamera
   muss mitskalieren.

**Danach, weil es Gestaltung ist (deine Entscheidung):**

4. Sound, Detailtiefe, Mehrkomponenten-Karten — jede davon ist eine eigene
   Größe. Die Rechenlast trägt sie alle (Faktor 1,6 im Modell ist eingerechnet).

---

## 8. Was dieses Dokument nicht beantwortet

- **Ob 8-Spieler-Matches Spaß machen.** Die Technik trägt sie; ob die Partie bei
  8 Figuren übersichtlich bleibt, ist eine Designfrage — und die Zugzeit von
  20 s mal 8 Spielern ergibt 160 s je Runde.
- **Wie die Kamera bei 4K arbeitet.** Mehr Fläche auf demselben Bildschirm
  heißt kleinere Figuren oder Bildlauf. Das ist Gestaltung.
- **Ob KI-NPCs Günthers Klasse brauchen.** Der Rechenkern für die
  Zielberechnung existiert; wie ein NPC sich verhalten SOLL, ist Inhalt.
