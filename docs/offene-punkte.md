# Offene Punkte — eine Liste

**Stand:** 2026-10-25 · **Basis:** `main` nach dem Zusammenführen aller Linien
(lokal und `brain`)

Diese Datei ist die **eine** Liste. Vorher lagen die Punkte verstreut in
`MASTERDOTO.md` (6876 Zeilen), `bgworker-todo.json`, drei `WORKER-REPORT.md` in
den Worktrees auf `brain` und `docs/audit-tief.md`. Wer wissen wollte, was noch
zu tun ist, musste vier Quellen lesen und drei davon richtig interpretieren.

## 1. Woher die Punkte kommen

| Quelle | Umfang | Zustand beim Einsammeln |
| :-- | :-- | :-- |
| `MASTERDOTO.md` | 6876 Zeilen, 174 Checkboxen | 158 erledigt, **16 offen** |
| `bgworker-todo.json` | 23 Einträge | **23 erledigt**, 0 offen |
| `docs/worker-reports/*.md` | 3 Berichte | je mit eigenem Restpunkt |
| `docs/audit-tief.md` | erzeugter Tiefen-Audit | 2 Gates gelb/rot |
| GitHub Issues | — | **nicht erreichbar**: `gh` meldet `HTTP 401`, Token ungültig |

Die 16 offenen MASTERDOTO-Punkte sind unten vollständig abgebildet. Nichts
davon ist stillschweigend verschwunden.

## 2. In dieser Sitzung erledigt

| ID | Typ | Was | Beleg |
| :-- | :-- | :-- | :-- |
| `FLAKE-1` | Bug (Test) | Mengenbegrenzung rechnete die Auffüllung nicht mit; unter Last dauerhaft rot (61–70 statt ≤ 60). Neue Schranke ist die exakte Obergrenze des Token-Buckets. Belegt: im 1500-ms-Fenster gehen **104** Nachrichten durch, die alte Schranke 60 war unerfüllbar. | `89d01e7` |
| `FLAKE-2` | Bug (Werkzeug) | `npm run smoke:fast` meldete auf gesundem Baum 8 Fehler, weil die Kern-Tests ohne `PA_ZUGPAUSE_SEKUNDEN=0` gestartet wurden. Nachher 4/4 OK. | `e7cdf51` |
| `SPR-2` (Teil) | Bug (Daten) | `nameConflict` der pixel-Figur zeigte auf eine nicht existierende Kennung und traf beim Auflösen die Figur selbst. Neuer Wächter erzwingt Gegenseitigkeit. | `c7cb2e7` |
| `SPR-5` | Untersuchung | Frage „Stab oder Artefakt?" **beantwortet: Artefakt.** Rest einer Gitterlinie der Bildvorlage, in 11 Zellen von 243 Blättern. Ursache in `schneide.py` benannt, Werkzeug `streifen-entfernen.py` gebaut, Generator gehärtet. | `ad8a804` |
| `AU-9a` / `C-8` | Umbau | `GameServer#handleConnection`: **438 → 37 Zeilen**, 69 → 3 `this.`. `GuentherSystem#update`: **185 → 88 Zeilen**, 92 → 43 `this.`. Rümpfe zeichengleich verschoben, Zustands-Hash unverändert. | `1ec2600`, `cc4cc4e` |
| `REST-3` | Prüfauftrag | Nachgezählt: die Abschnitte P1 Gameplay (4), P1 Netcode (3), P2 Client & UX (9), P3 Betrieb (5) sind **21 von 21 erledigt, 0 offen**. Der Punkt war überholt. | diese Datei |
| `O10` | Werkzeug | Fingerabdruck-Wächter des Audit-MCP-Servers bewiesen (10 Fälle). | `ade48d3` |
| `Doppelregeln` | Ordnung | Die zwei offenen Doppelregeln `cache` und `standard` durch sprechende Namen aufgelöst (`bildCache`, `tierCache`, `STANDARD_ANKER`, `waffenSpritesLader`); die veralteten Ausnahmen entfernt. Gate von gelb auf **grün**. | `3096467` |

Nebenbei aufgeräumt (keine offenen Punkte, nur Ordnung): `.gitignore` griff nicht
für `node_modules`-Symlinks (`afcf41d`), zwei Werkzeug-Stummel eingecheckt
(`94f61bd`), Doku-Zahlen nachgezogen, `brain`-Arbeit aus fünf Worktrees
committet.

### E2E-Prüfung der Änderungen (2026-10-25)

Die Umbenennungen greifen in den Zeichenpfad, der Umbau in den Serverpfad —
beides ist mit Unit-Tests allein nicht belegt. Deshalb nach AGENTS.md §3 die
betroffenen Browser-Specs laufen lassen, seriell (`--workers=1`), weil die
Bildzeit-Messungen lastempfindlich sind:

| Gruppe | Specs | Ergebnis |
| :-- | :-- | :-- |
| Figuren, Waffen, Günther, Kader, Profil | 10 | **52 grün** (7,5 min) |
| Bildvergleiche, Barrierefreiheit, Screenreader | 5 | 55 grün, **2 rot** (siehe `VIS-1`) |
| Mehrspieler, Online, Zugpause, Effekte, Replay, Sieg | 10 | **54 grün, 1 übersprungen** (6,7 min) |

Zusammen **161 grün, 2 rot, 1 übersprungen** über 25 von 61 Specs. Der eine
Übersprung ist der dokumentierte Selbstschutz in `prediction-online`
(„abgelehnter Schuss", Client bereits am Zug).

Die 36 nicht gelaufenen Specs betreffen HUD, Kamera, Kulissen, Terrain, Ton,
Erfolge und Bedienung — Bereiche, die von den Änderungen dieser Sitzung nicht
berührt werden.

## 3. Offen — im Code lösbar

**Nichts.** Alle codeseitig lösbaren Punkte sind abgearbeitet. Was übrig ist,
braucht Bilder, eine Entscheidung oder Hardware — siehe unten.

## 4. Offen — braucht neue Bilddateien

Diese Punkte sitzen in den WebP-Bildern selbst. Ein Agent kann sie nicht
erzeugen; ein Überschreiben mit selbst gemalten Pixeln wäre erfunden. Für jeden
Punkt gilt: Quellbild neu erzeugen, dann `schneide.py` (mit dem neuen
Strich-Nachlauf) und `scripts/sprite-sheets-klassifizieren.py` laufen lassen.

| ID | Befund | Quelle |
| :-- | :-- | :-- |
| `SPR-1` | `datacult/11_synapse-streamer`: Kopf und Glieder als getrennte Teile (auch im Zustandsblatt) | MASTERDOTO Z59 |
| `SPR-2` (Bild) | `pixel/00_nullpointer-exception`: Figur zerfasert. Die Dateien sind **verschieden** von `datacult/00` (44.914 B / `6f768df2` gegen 69.400 B / `4ffdcfbe`), es ist also keine versehentliche Kopie. Nur der Bildinhalt ist defekt; die Namensfrage ist erledigt. | MASTERDOTO Z61 |
| `SPR-3` | `pixel/11_pyrowand-a`: Silhouette löchrig/fragmentiert | MASTERDOTO Z63 |
| `SPR-5` (Bilder) | Die 11 Zellen aus dem Befund tragen die Gitterlinie noch. Werkzeug und Aufruf stehen bereit: `python3 scripts/sprites-erzeugen/streifen-entfernen.py`. Das räumt sie weg, hinterlässt aber dort, wo der Strich durch die Figur lief, eine dünne helle Naht — die verdeckten Pixel sind nicht rekonstruierbar. Sauber ist es erst mit neu erzeugten Blättern. | MASTERDOTO Z66 |
| `SPR-6` | `datacult`-Figuren (v. a. `20_buffer-flow-swarm`, `00`, `10`) sehr dunkel auf dunklem Gelände — Randlicht/Umriss nötig | MASTERDOTO Z68 |
| `SPR-7` | Automatisch als auffällig gemeldet (Zusammenhangskomponenten): `datacult/20` zustand, `datacult/21` walk, `undead/00` zustand, `undead/12` zustand — noch **nicht gesichtet** | MASTERDOTO Z70 |

## 4a. `VIS-1` — zwei Bildvergleiche passen nicht zur abgelegten Basis

**Befund (2026-10-25, beim Prüfen der E2E-Strecke):** `tests/e2e/visuell.spec.mjs`
meldet zwei von sechs Vergleichen rot:

```
Lobby 390x844  und  HUD 390x844
11712 Pixel (Anteil 0,04) weichen ab — Toleranz ist maxDiffPixelRatio 0.02
```

**Eingegrenzt, nicht geraten:**

- Dieselben zwei Vergleiche scheitern **auch auf `cfc6785`**, also dem Stand
  VOR der Arbeit dieser Sitzung. Sie kommen nicht aus den Umbenennungen oder
  dem Umbau.
- Sie scheitern auf diesem Rechner **deterministisch** (mehrfach, gleiche zwei).
- Die vier übrigen Vergleiche (Menü/Lobby/HUD in 1280x720 sowie Menü 390x844)
  sind grün.
- Erwartetes und tatsächliches Bild sind **mit dem Auge nicht zu unterscheiden**.
  Die Abweichung liegt auf Textkanten und Rasterung, nicht auf fehlenden oder
  verschobenen Bausteinen.

**Deutung:** Die abgelegten Bilder (`tests/e2e/visuell.spec.mjs-snapshots/*.png`)
sind auf einem anderen Rechner entstanden. Der Dateiname trägt nur
`-chromium-linux`, also dieselbe Endung für beide Linux-Knoten — Schrift- und
Rasterunterschiede zwischen ihnen schlagen voll durch, und bei 390 px Breite
reicht das für 4 % der Pixel.

**Das ist eine Entscheidung, keine Reparatur.** Zwei Wege:

1. **Basis auf dem Rechner neu erzeugen, der künftig prüft** (`--update-snapshots`)
   — dann prüft der Vergleich wieder etwas, aber nur dort.
2. **Vergleich von der Umgebung lösen** — etwa Toleranz je Format, oder die
   Textstellen aus dem Vergleich nehmen.

Was **nicht** in Frage kommt: die Toleranz pauschal hochsetzen, damit es grün
wird. Dann prüft der Vergleich nichts mehr und meldet trotzdem Erfolg. Die
Bilder wurden deshalb **unverändert gelassen**.

## 4b. Betriebsnotiz: der Vergleichs-Sweep schreibt in versionierte Dateien

`tests/e2e/vergleich-screenshots.spec.mjs` erzeugt bei **jedem** Lauf die 27
Bilder unter `docs/vergleich-alternativspiele-2026-10-19/eigene/` neu. Das ist
Absicht (der Kopf der Datei begründet ausdrücklich, warum nicht `artifacts/`),
hat aber eine Folge, die man kennen muss: **nach einem E2E-Lauf ist der
Arbeitsbaum schmutzig.** Wer das nicht weiß, checkt 27 geänderte Binärbilder als
„Änderung" ein.

Vor dem Weiterarbeiten daher:

```bash
git checkout -- docs/vergleich-alternativspiele-2026-10-19/
```


## 5. Offen — braucht eine Entscheidung des Auftraggebers

| ID | Frage | Quelle |
| :-- | :-- | :-- |
| `SPR-4` | Fraktion „pixel" hat keinen gemeinsamen Stil (Füchse gleichen den `beasts`-Füchsen, `ethereo` flach neongrün, `shieldmon` ein Igel). **Leitbild festlegen** — das ist keine Codefrage. | MASTERDOTO Z64 |
| `SPR-8` | Stilbruch Haustiere: Günther/Cookie flach-cartoonig gegen gemalte Figuren. Bewusst lassen oder angleichen? | MASTERDOTO Z72 |
| `LOOK-2` | Tiefenstaffel: drei Ebenen (entsättigte Kulisse, scharfes Gelände, Vordergrundpartikel) nach den Referenzkarten | MASTERDOTO Z6873 |
| `LOOK-3` | Lava-Glühen als glühender Stoff mit warmen Lichtakzenten nach `ref-3-vulkanschmiede-hud` | MASTERDOTO Z6874 |
| `LOOK-4` | Begehbare Innenräume und Etagen nach `ref-6-hochhaus-schnitt` und `ref-4-turmruine` | MASTERDOTO Z6875 |
| `Z246` | Erste Probe der Abschaltsicherung **auf dem Knoten** (`--trocken`, dann echt, dann `systemctl stop` und Journalzeile); Cloud-Ebene ist nicht gegen echtes Hetzner getestet. Nach AGENTS.md §5/§7 entscheidet und führt das der Auftraggeber aus — ein Agent mietet oder startet nichts. | MASTERDOTO Z246 |

## 6. Offen — braucht echte Hardware

| ID | Befund | Quelle |
| :-- | :-- | :-- |
| `Z579` / `P2` | Rendering auf CPU-Hardware messen. In der Sandbox (Software-Rasterung, headless) liegt ein Frame bei 50–83 ms; der Profiler zeigt nur ~4 % JavaScript, 96 % native Rasterarbeit. Für eine belastbare Zahl fehlt ein echter Grafikpfad auf Zielhardware. | MASTERDOTO Z579 |

## 7. Statische Gates des Tiefen-Audits — alle grün

Beim Einsammeln stand im **zusammengeführten** `docs/audit-tief.md` noch
`pfade` rot und `zufall` gelb. Beides war **veraltet**: der Bericht stammte aus
der Linie `bg/doppel` (`Commit: 0e96f8b`) und beschrieb einen älteren Baum.
Am 2026-10-25 auf `main` nachgemessen und den Bericht mit dem eigenen Werkzeug
neu erzeugt:

| Gate | Stand | Kennzahl |
| :-- | :-- | :-- |
| `marker` | 🟢 grün | 0 TODO/FIXME im Quelltext |
| `zufall` | 🟢 grün | 0 Zeit-/Zufallstreffer im Simulationspfad |
| `pfade` | 🟢 grün | **alle 84** Pfad-Auflösungen nutzen `fileURLToPath` |
| `doppelregeln` | 🟢 grün | 15 Doppelregeln, **alle 15** begründet, 0 offen |
| `secrets` | 🟢 grün | 0 Fundstellen in getrackten Dateien |
| `perf` | 🟢 grün | kein Tick über 16,7 ms |

Die zwei offenen Doppelregeln (`cache`, `standard`) sind aufgelöst — nicht durch
eine Ausnahme, sondern durch sprechende Namen: `bildCache`/`tierCache` und
`STANDARD_ANKER`/`waffenSpritesLader`. Die beiden zugehörigen Einträge in
`DOPPELREGEL_AUSNAHMEN` sind entfernt, weil eine Ausnahme, die nichts mehr
abdeckt, selbst zu einer falschen Aussage wird (`doppelregeln` meldete das
prompt: „2 Ausnahme(n) in der Liste greifen nicht").

## 8. Zusagen, die beim Nachprüfen aufgefallen sind

- `nameConflict` (SPR-2) war eine Zusage ohne Prüfung — jetzt geprüft.
- `context` in `#handleConnection` wurde **ersetzt statt verändert** und
  funktionierte nur, weil Zuhoerer und close-Behandlung dieselbe Closure teilten.
  Beim Ausziehen wurde das sichtbar (zwei Tests rot) und ist jetzt ausdrücklich
  als Feldänderung geschrieben.
- Der Rauchtest war dauerhaft rot (FLAKE-2). Eine Ampel, die immer rot zeigt,
  wird ignoriert — und dann fällt der echte Defekt nicht mehr auf.
- Der versionierte Tiefen-Audit behauptete `pfade` rot, während der Code längst
  sauber war. Ein Bericht, der nie neu erzeugt wird, ist eine Aussage über die
  Vergangenheit, die wie eine über die Gegenwart aussieht.
