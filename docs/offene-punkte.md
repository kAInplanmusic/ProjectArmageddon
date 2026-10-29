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
| Bildvergleiche, Barrierefreiheit, Screenreader | 5 | 55 grün, 2 rot → **nach `VIS-1` behoben: 6/6 grün, zweimal** |
| Mehrspieler, Online, Zugpause, Effekte, Replay, Sieg | 10 | **54 grün, 1 übersprungen** (6,7 min) |

Danach der **vollständige** Lauf über alle 61 Specs (`--workers=1`, 59,5 min):

**356 grün, 1 rot, 1 übersprungen.** Der eine rote war `dynamik` „Ein Treffer im
selben Bild klingt NICHT zweimal" — und er war **kein** Produktivfehler, sondern
ein Reihenfolgefehler im Test: `applyDamage` stand VOR `advance(1)`, und der
Schritt setzt das Gefühls-Gedächtnis des Renderers zurück (`gefuehlZuruecksetzen`
leert `letzteWerte` und `trefferMarken`). Der Schaden konnte so nie als Änderung
gesehen werden. Behoben mit Begründung im Code; danach 7/7 grün, dreimal.

Damit der Test nicht nur „grün" ist, sondern etwas prüft, wurde die Sperre in
`main.js#spieleTrefferklang` testweise entfernt: dann erscheinen **zwei** Klänge
`[1, 0.956]` und der Test wird rot. `main.js` blieb unverändert.

Der eine Übersprung ist der dokumentierte Selbstschutz in `prediction-online`
(„abgelehnter Schuss", Client bereits am Zug). `profiling` („Bildzeiten auf dem
echten Grafikpfad") läuft auf dieser Maschine auf **echter GPU** (ANGLE, Intel HD
3000) und ist grün — der Übersprung aus dem Messlauf vom 2026-10-21 gilt hier
also nicht.

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

## 4a. `VIS-1` — **gelöst**: zwei Bildvergleiche passten nicht zur abgelegten Basis

**Befund (2026-10-25):** `tests/e2e/visuell.spec.mjs` meldete zwei von sechs
Vergleichen rot — `Lobby 390x844` und `HUD 390x844`, 11.712 Pixel (Anteil 0,04)
gegen eine Toleranz von 0,02.

**Ursachenklärung in drei Messungen.** Die erste Vermutung war falsch und wurde
verworfen, bevor irgendetwas geändert wurde (eine Basis „nachzuziehen", weil man
den Grund zu kennen glaubt, ist genau der Fehler):

| Messung | Ergebnis | Was daraus folgt |
| :-- | :-- | :-- |
| Derselbe Test dreimal | Läufe unterscheiden sich um **1–3 Pixel** | Der Zustand ist eingefroren; kein Flake. |
| Alter Stand `cfc6785` gegen jetzt | **3 Pixel** Abweichung | Der Code ist nicht die Ursache. Meine Hypothese „die a11y-Umstellung vom 2026-10-24" war falsch. |
| Beide gegen die Basis | je **104.130 Pixel** (31,6 %), identisch | Die Basis passt zur Umgebung nicht, unabhängig vom Code. |
| Bester Versatz gesucht | dy = **+2 px** halbiert den Fehler (10,9 → 5,3) | Es ist ein kleiner Layout-Versatz durch Schriftmetriken plus Rasterung — kein Inhaltsunterschied. |

**Ursache:** Die Baselines wurden auf einem anderen Rechner erzeugt. Der
Dateiname trägt nur `-chromium-linux`; zwei verschiedene Linux-Knoten landen auf
demselben Namen. Playwright 1.63 und Chromium-1234 sind seit der Anlage
unverändert — es ist die Render-Umgebung, nicht ein Versionssprung.

**Behebung:** Die zwei roten Baselines wurden auf diesem Rechner neu erzeugt
(**nur** diese zwei, nicht der ganze Satz), danach lief die Spec **zweimal
vollständig mit 6/6 grün**. Dass das Nachziehen berechtigt war, ist durch
Messung 2 belegt: der Code erzeugt dasselbe Bild wie vor der Sitzung, es gibt
also keine ungesehene Änderung, die damit zugedeckt würde.

**Damit es nicht wieder still verrottet:** Das Prüfverfahren (stabil? / Code? /
Versatz?) steht jetzt als Kommentarblock im Kopf von `visuell.spec.mjs`, samt
dem Befehl, der nur die roten Dateien nachzieht, und dem ausdrücklichen Hinweis,
dass das Hochsetzen von `maxDiffPixelRatio` keine Lösung ist.

**Restrisiko, offen und bewusst:** Die Baselines bleiben an diese
Render-Umgebung gebunden. Läuft die Strecke künftig auf einem anderen Knoten,
werden dieselben zwei Vergleiche dort rot. Sauber wäre ein Vergleich, der von
der Umgebung unabhängig ist (etwa Kanten- statt Pixelvergleich, oder Toleranz je
Format). Das ist eine eigene Aufgabe und steht hier als solche.

**Teilweise gelöst (2026-10-29): Strukturvergleich statt Pixelvergleich.**
`tests/e2e/helfer/struktur-vergleich.mjs` vergleicht Kanten und Flächenfarben mit
Spielraum (±8 px) sowie die örtliche Häufung fehlender Kanten; `visuell.spec.mjs`
nutzt ihn statt `toHaveScreenshot`. Empfindlichkeit und Unempfindlichkeit sind in
`tests/struktur-vergleich.test.js` an den echten Baselines gemessen (27 Tests):
Versatz bis 3 px und gleiche Bilder bestehen; fehlende Karte, Knopf, Etikett oder
Chip, andere Flächenfarbe, 40 px Versatz und andere Seiten schlagen an. Im
Browser belegt: blendet man die „Beitreten“-Knöpfe aus, wird `Lobby 390x844` rot
(48 Zellen gehäuft, 10,5 % Kanten fehlen).

**Gegen den echten fremden Rechner geprüft** (die Altbilder aus `4477c55^`, auf
denen 31,6 % der Pixel abwichen): `HUD 390x844` besteht (1,4 % Kanten),
`Lobby 390x844` **besteht nicht** (8 % Kanten). Grund: Dort ist die Schrift
breiter, die Zeile „Fraktion je Team — Aussehen der Figuren“ bricht um, alles
darunter rutscht eine Zeile nach unten. Das ist eine Layoutänderung und von
einem fehlenden Element strukturell nicht zu unterscheiden; ein Vergleich, der
sie durchließe, würde auch fehlende Knöpfe durchlassen.

**Was bleibt offen:** Ob die CI-Runner wie dieser Rechner rendern, ist nicht
gemessen, deshalb bleibt `PA_OHNE_BILDVERGLEICH=1` in der CI gesetzt. Ein Lauf
dort entscheidet.

**Berichtigung (2026-10-29, gemessen):** Die frühere Vermutung, die Schrift sei nicht
gebündelt, war falsch. Im Browser gilt `--font: 'Exo 2', 'Segoe UI', …` (aus
`tokens.css`), geladen sind Bebas Neue 400 und Exo 2 400/600/700 — alle aus
`@fontsource`. Die Kette mit Chakra Petch in `index.html` wird überstimmt und ist
toter Text. Die Breitenunterschiede des fremden Rechners müssen also von etwas
anderem kommen: einem Bild, das vor dem Nachladen eines Schriftschnitts entstand
(Fettdruck wird erst beim Aufklappen der Lobby geladen), oder von Hinting und
Teilpixel-Positionierung. Deshalb wartet das Bild jetzt vor der Aufnahme auf
`document.fonts.ready` und zwei Bildläufe. Ob das den Umbruch behebt, ist nur auf
dem fremden Rechner (oder in der CI) zu messen.

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
**`MAHL-1` — ENTSCHIEDEN UND UMGESETZT (2026-10-25).** Valhalla beginnt jetzt zufaellig in **Runde 8-14**, bei grossen Partien (mehr als 8 Spieler, Karte „gross“/„krieg“) in **Runde 12-20** — wieder rundenbasiert, wie vor dem 2026-10-13. Nachmessung: Audit-Seeds 101…505 Sturm ab Runde 9-12, **1 von 5** Partien endet vorher; `check:maelstrom` (Seeds 1000…1685) Sturm **exakt in der gezogenen Runde**, 0 Netzfaelle. Begruendung, Umsetzung und Belege: `MASTERDOTO.md`, Eintrag „Mahlstrom-Tempo“ vom 2026-10-25.

Hinweis zur Messung (2026-10-25 korrigiert): Die früheren Audit-Zahlen (Sturm
76–129, Längen 95–145) waren ein Werkzeugfehler — `spieleZug` gab den Zug
sofort ab (`endTurn()`) und ließ jeden Spieler schießen; die Zugzeit verging
nie, und der spielzeit-abhängige Mahlstrom kam erst in Runden, die es im
echten Spiel nicht gibt. Das Werkzeug spielt jetzt wie `check:maelstrom`
(nur Team 0 schießt, die übrigen Züge laufen ihre volle Zugzeit); beide
Messungen liegen beieinander. Ein Regressionstest hält das fest
(`tests/audit-spielverlauf.test.js`).

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
