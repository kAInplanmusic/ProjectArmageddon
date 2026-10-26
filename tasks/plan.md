# Umsetzungsplan P1: Materialoptik

Grundlage: `docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md` (freigegeben 2026-10-26).

## Überblick

Das Gelände bekommt seine Materialoptik auf der GPU: Die vorhandene 8-px-Stoffkarte
wird als Textur hochgeladen, ein WebGL2-Fragment-Shader malt je Material ein eigenes
Detail (Risse, Dünen, Facetten, Fasern), bricht die Zellkanten per Domain-Warp auf und
setzt eine dunkle Kontur an Materialgrenzen. Der CPU-Weg bleibt als Rückfall und sieht
weiter aus wie heute.

## Architekturentscheidungen

- **Nur die Materialmalerei wandert auf die GPU, nicht der Steinkern.** `faerbeGelaende`
  rechnet Steine/Lagen/Kantenlicht weiter auf der CPU (400 ms — Ladezeit ist laut
  Auftraggeber zweitrangig). Die GPU bekommt das fertige CPU-Bild als Textur und legt
  die Materialoptik darüber. Damit ist der neue Weg isoliert prüfbar, und der Rückfall
  ist pixelgleich zu heute.
- **Die Stoffkarte bleibt Wahrheit.** Der Shader verzerrt nur den *Blick* darauf
  (Domain-Warp in Pixeln), nie die Daten. Kein Eingriff in Hash, Netcode, Determinismus.
- **Ein Kontext, einmal angefordert.** Der Renderer hält den WebGL2-Kontext; Aufbau je
  Karte = Texturen hochladen, zeichnen, zurücklesen.
- **Kein WebGPU** (in dieser Umgebung nicht lauffähig, §3 des Entwurfs).

## Aufgaben

### Phase 1 — Fundament (rein, in Node prüfbar)

- [ ] **T1** Stofffeld als Textur packen: `packeStofffeld(karte)` → `{daten, spalten, zeilen}`,
      Überlagerung (`ueber`) wie in `tinteStoffe` angewandt.
- [ ] **T2** WebGL2-Erkennung `erkenneWebGl2()`: Kontext oder `null` **mit Grund**; kein DOM
      in Node ist ein Grund, kein Fehler.
- [ ] **T3** Shader-Quelle `STOFF_SHADER_GLSL` + Materialfarben `stoffFarben()` aus `STOFFE`.

**Checkpoint A:** `npm test` grün; die drei Bausteine haben Tests, die vorher rot waren.

### Phase 2 — Zeichnen und Einbau

- [ ] **T4** `tinteStoffeGpu({bild, breite, hoehe, karte, seed, gpu})`: Texturen hochladen,
      Shader zeichnen, Pixel zurücklesen; gibt das neue Pixelfeld zurück oder `null`.
- [ ] **T5** Einbau in `baueGelaendeEbene`: GPU wenn vorhanden, sonst `tinteStoffe`;
      Renderer fordert den Kontext einmal an.

**Checkpoint B:** Spiel läuft im Browser, Konsole ohne Fehler, `npm test` + `npm run checks` grün.

### Phase 3 — Abnahme

- [ ] **T6** `scripts/gelaende-optik.mjs`: Screenshots in Spielgröße **und** als
      Nahausschnitt, Autokorrelation bei Versatz 512 gegen 511/513, Materialzählung in
      400×300.

**Checkpoint C (Abnahme P1):**
- [ ] Kachelmuster messbar schwächer als heute
- [ ] mindestens drei Materialien in 400×300 unterscheidbar
- [ ] `npm test`, `npm run checks` (21 Gates), `check:docs`, `check:terrain`, `check:hoehlensicht` grün
- [ ] Screenshots dem Auftraggeber vorgelegt

## Risiken

| Risiko | Wirkung | Gegenmaßnahme |
| :-- | :-- | :-- |
| Shader sieht anders aus als die CPU-Fassung | hoch | CPU-Rückfall bleibt Standard; GPU nur wenn Kontext da ist |
| GT 540M/HD 3000 können `highp`-Schleifen nicht | mittel | Probe lief auf beiden (§3 des Entwurfs: 31/45 ms) |
| Rücklesen kostet mehr als das Zeichnen | mittel | gemessen: 10,8–12,4 ms für 14,7 MB |
| Zwei Wege driften auseinander | mittel | ein Screenshot-Vergleich im Abnahme-Werkzeug |

## Offene Fragen

- „rund" (1:1 oder kreisförmige Karte) und Auflösungsdecke — betreffen P2, nicht P1.
