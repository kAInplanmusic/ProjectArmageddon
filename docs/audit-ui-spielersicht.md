# Audit: Die Spielersicht (HUD, Zustandsanzeigen, Treffer-Rückmeldung, große Karten)

**Datum:** 2026-09-27
**Stand:** geprüft gegen **a49e805** („docs: Testzahl nachgemessen — 1075 -> 1122").
Während der Arbeit hat ein anderer Arbeiter **fd4afc2** („refactor(engine): Textanker
durch Verhalten ersetzt") auf `src/engine/match.js`, `src/engine/turret.js` und drei
Testdateien gelegt. Alle in diesem Bericht zitierten `match.js`-Zeilen wurden danach
**einzeln nachgeprüft und stimmen weiter** (`:207` `BASE_HEALTH`, `:531`/`:541`/`:570`
Konstruktor-Vorgaben, `:1050` `maxHealth`, `:2722` `roundBreakpoint`); die Datei hat
weiter 3194 Zeilen. Die Zeilenangaben zu `main.js`, `hud.js`, `ereignisse.js` und
`index.html` sind unberührt (fd4afc2 fasst keine Client-Datei an).
**Prüfgegenstand:** die Spielersicht — HUD, Zustandsanzeigen, Treffer-Rückmeldung,
große Karten. Belege sind `datei:zeile` gegen diesen Commit und Messungen, die
unten jeweils mit Sonde/Seed/Befehl genannt sind.

> Methode: rein lesend. Keine `npm test` / `npm run checks` / `npm run build` —
> während eines parallelen Schreibzugriffs auf `src/engine/match.js` entstehen
> sonst Rot-Befunde, die keine sind. Sonden nur unter `/tmp`.

---

**Umfang (gelesen, ganz oder in den genannten Abschnitten):**
`src/client/hud.js` (814 Z.), `src/client/main.js` (3315 Z., Abschnitte
Zustand/Feuern/Sprung/Abwurf/Zeichenbild), `src/client/input.js` (220 Z.),
`src/client/ereignisse.js` (797 Z.), `src/client/networkClient.js` (Fehlerpfad),
`src/client/shotPrediction.js` (Kopf), `src/client/renderer.js` (Auszüge),
`src/shared/protocol.js` (Drossel/Filter/Kanal), `src/client/index.js`,
`index.html` (HUD-Abschnitt), `tests/event-coverage.test.js` (Teile),
`docs/hunter-ui.md`, `docs/hud-vorrang.md` (Auszüge).

**Nicht geprüft:** keine `npm test` / `npm run checks` / `npm run build` /
Playwright (siehe Methode oben). Nicht gelesen: `sceneryPainter.js`,
`terrainBaker.js`, `hoehlenSchatten.js`, `weapons.js`-Katalog im Detail,
E2E-Suiten. Kein Browser, kein laufender Server — Aussagen über das
SEHEN im echten Fenster (Pixelfarben, Kontrast) stehen deshalb nur dort, wo
der Code sie zwingend festlegt.

**Rein lesend.** In dieser Sitzung entstand nur diese Datei.

---

## Teil 0 — Bestandsaufnahme: was der Spieler wann sieht

### 0.1 Der Takt der Anzeige

- `Main#loop` hängt an `requestAnimationFrame` (`src/client/main.js:1974-1975`),
  am Ende jedes Bildes läuft `#render()` (`:2017`) und darin
  `this.hud.update(state, { aim: this.aim, onWeaponSelect: … })` (`:2075`) —
  **die Anzeige wird mit der Bildrate (~60/s) aktualisiert.**
- Innerhalb von `Hud#update` ist der Takt gestaffelt: Runde, Wind, Zugzeit und
  Status werden bei JEDEM Bild geschrieben (`hud.js:241-257`); Spielerliste und
  Waffenliste nur, wenn ihre **Signatur** sich ändert (`hud.js:318-321` für die
  Liste, `:432-433` für die Waffen); der Zugwechsel geht nur beim WECHSEL ins
  Protokoll (`hud.js:279-282`).
- Woher die Werte kommen, unterscheidet die Betriebsarten: lokal
  `match.getState()` (`main.js:1103`), online der aus dem Snapshot gebaute
  `onlineViewState` (`main.js:1117-1233`) plus die Bestandsnachricht `LOADOUTS`
  (`main.js:1064`, Erzeugung `src/server/gameServer.js:665-728`).

### 0.2 Je Anzeige: Wert, Quelle, Takt, sichtbare Änderung

| Anzeige | HUD-Feld | Wert kommt aus | Takt | Sieht der Spieler eine Änderung? |
|---|---|---|---|---|
| **Runden** | `hud-round` (`index.html:700`) | `state.round` (`hud.js:241`) | jedes Bild | ja, beim Rundenwechsel |
| **Wind** | `hud-wind` (`:704`) | `state.wind`, 3 Nachkommastellen, rot ab \|Wind\| > 0,03 (`hud.js:242-246`) | jedes Bild | ja; lokal wechselt er je Runde, online mit dem Snapshot |
| **Zugzeit** | `hud-timer` (`:708`) | `(turnDurationMs − turnElapsedMs)/1000`, rot unter 6 s (`hud.js:247-251`) | jedes Bild | ja; **online ist die Gesamtdauer geraten** — „der höchste bisher beobachtete Rest" (`main.js:1123-1125`), siehe V4 |
| **Status** | `hud-status` (`:712`) | `gameover ? 'Ende' : maelstrom.active ? 'Mahlstrom' : 'Läuft'` (`hud.js:253-256`) | jedes Bild | **online falsch für Runde 8–14** → A6 |
| **Lebensbalken + Zahl** | `.hp-fill`, Zahl (`hud.js:361-368`, `:395-396`) | `entity.health` / `entity.maxHealth`; Neuaufbau nur bei Änderung ≥ 1 HP (`hud.js:319`) | bei Änderung | ja; **online mit festem Maximum 100** → A10 |
| **Munition** | `… DMG · N` in der Waffenzeile (`hud.js:559-565`) | `active.ammo[weaponId]`; in der Signatur (`hud.js:428`) | direkt nach jedem Schuss | ja, in beiden Betriebsarten (online über `LOADOUTS`) |
| **Nachladen** | Balken + `⏳ N` (`hud.js:571-609`) | `active.cooldowns[weaponId]`; in der Signatur (`hud.js:431`) | bei Änderung | ja (Balkenbreite aus `ladungAnteil`, `hud.js:588`) |
| **Team** | Namensfarbe (`hud.js:333`) und `hud-active` (`:264`) | `entity.teamId` → `TEAM_COLORS` | jedes Bild | ja; zusätzlich die Protokollzeile „X ist am Zug" (`hud.js:280`) |
| **Wasserstand** | Marke `💧/🌊` + Prozent am Namen (`hud.js:383-393`) | `entity.waterLevel` → `waterStateFor`; in der Signatur (`hud.js:312-314`) | je 1 % neu aufgebaut, **sichtbares Wort wechselt nur an der Zustandsgrenze** | ja, aber grob: „nass" → „untergetaucht"; den Prozentwert nur als Tooltip |
| **Winkel / Kraft** | `hud-angle`, `hud-power` (`:744-745`) | die eigene Zielvorgabe (`main.js:2075` übergibt `aim`), sonst die Figur | jedes Bild | ja |
| **Radius (Flächenwirkung)** | `hud-blast` (`:746`) | `weapon.blastRadius` der aktiven Waffe (`hud.js:287-292`) | bei Waffenwechsel | ja |
| **Verbindung** | `hud-connection` (`:716`) | `network.state` + Latenz (`hud.js:218-232`, Aufruf `main.js:2076`) | jedes Bild online | ja |
| **Sprungzustand** | **keins** | — | — | **Es gibt keine Anzeige.** Rückmeldung nur als Protokollzeile: „Sprung"/„Doppelsprung" (`main.js:842`), Ablehnung als `notice` (`:826`, `:839`). `ergebnis.jumpsLeft` ist laut Kommentar bewusst ungelesen (`main.js:804-807`). **In der Luft / schon gesprungen / „erster Sprung nur vom Boden" ist nirgends sichtbar** — nur über die Meldung, die man lesen muss (A8). |

### 0.3 Bewusste Stille gegen Vergessen — die Behauptung des Tests gegen den Code

`tests/event-coverage.test.js:184-213` führt die Menge `bewusstStumm` (12 Einträge,
gezählt: `turn_start`, `turn_end`, `entity_in_water`, `damage`, `dot_applied`,
`shot`, `weapon_cooldown`, `crate_landed`, `drowning`, `round_crates`,
`projectile_expired`, `water_pushed`). Bedeutung dort: „der Spieler sieht von
diesem Ereignis NICHTS; der sichtbare Effekt entsteht über ein anderes Element."
Jede dieser Begründungen ist eine Behauptung über die Anzeige — geprüft:

| Eintrag | Behauptung | Urteil | Beleg |
|---|---|---|---|
| `turn_start`/`turn_end` | Rundenanzeige + Zugwechsel im Spielerfeld | **BESTÄTIGT** | `hud.js:241`, `:264`, `:280` |
| `damage` | Lebensbalken sinkt sichtbar | **BESTÄTIGT** (Balken online falsch skaliert → A10) | `hud.js:319`, `:365-367` |
| `entity_in_water` | Wasserstand als Marke am Namen | **BESTÄTIGT** | `hud.js:312-314`, `:383-393` |
| `dot_applied` | Zustandsmarke am Namen | **nur lokal** — online nie (A7/C2) | `main.js:1135-1136` |
| `round_crates` | „die Anzahl steht im HUD" | **WIDERLEGT** (C1) | kein Kistenfeld in `hud.js:197-210` |
| `shot` | „löst die Vorhersage auf" | **BESTÄTIGT**, aber online ist es die EINZIGE Wirkung (A5) | `ereignisse.js:296-299` |
| `weapon_cooldown` | Waffenliste zeigt den Nachladezustand | **BESTÄTIGT** | `hud.js:571-609` |
| `crate_landed` | lokal ein Fall, online die Kistenliste | **BESTÄTIGT** | `ereignisse.js:567-571` |
| `drowning` | kein Zweig, aber gedrosselt | **BESTÄTIGT** | `ereignisse.js:666` (`drowning: {}`) |
| `projectile_expired` | kein Spielerereignis | **BESTÄTIGT** — kein Treffer in `ereignisse.js` für diesen Namen; es steht nur in `ANZEIGE_EREIGNISARTEN` | `grep projectile_expired src/client/ereignisse.js` → 0 |
| `water_pushed` | Wasserstand am Ziel ist die sichtbare Wirkung | **teilweise** — nur, wenn der Zustand die Grenze überschreitet (Wortmarke), nicht beim Füllstand | `hud.js:383-393` |

**Ergebnis:** von zwölf Begründungen sind zwei falsch bzw. nur halb richtig
(`round_crates`, `dot_applied`), und eine dritte (`shot`) beschreibt für online
einen Zustand, der die Rückmeldung faktisch aufhebt.

### 0.4 Die ersten 500 ms nach einem Schuss (gemessen)

Sonde `/tmp/probe-schuss.mjs`: echtes `MatchController`, echtes `Hud`, echter
Ereignisweg, Seed 4242, `hills`, 2 Figuren, Winkel 45°, Kraft 55:

```
Takt  0: shot  projectile_spawn
Takt  3–44: landed (alle 7 Takte, die stehende Figur pendelt)
Takt 48 (0,80 s): terrain_destroyed  explosion  projectile_impact  turn_end  turn_start
Lebensdeltas: {1: 0, 2: 0}   (der Schuss traf nicht)
```

- **Lokal** quittiert `shot` den Schuss sofort mit Mündungsfeuer und Klang
  (`ereignisse.js:277-294`), main.js schreibt zusätzlich „Schuss abgegeben
  (55 Kraft)" (`main.js:1392`); der Einschlag kommt nach **0,80 s** als Krater +
  Blitz + Klang (`explosion`, `projectile_impact`).
- **Online** wird derselbe Schuss nur als Vorhersagebahn gezeichnet (türkis,
  `main.js:1367`) plus der Zeile „Schuss gesendet (55 Kraft)" (`:1368`) — Klang
  und Mündungsfeuer fehlen (A5).
- Die Zugzeit läuft während des Fluges weiter (kein Sonderzustand); der Zug endet
  im gemessenen Fall im SELBEN Takt wie der Einschlag (48). **Der Spieler hat
  also 0,80 s lang keine Rückmeldung außer dem fliegenden Projektil** — lokal
  immerhin den Abschussknall, online nichts.

---

## Teil A — BESTÄTIGTE Befunde

### A1 (Schwere A) — Online-Feuern ohne Verbindung ist stumm: der Schuss wird nirgends gemeldet

**Beleg:** `src/client/main.js:1357`

```js
if (!this.network?.isConnected) return { ok: false, errors: ['Nicht verbunden'] };
```

Kein `hud.log` an dieser Stelle — und der Rückgabewert wird vom Aufrufer
verworfen: `onFire` hängt in `src/client/input.js:180` (`#releaseCharge`) bzw.
`:105` (Enter) und ruft nur auf, ohne `ergebnis` zu lesen.

**Gegenprobe an den Nachbarn — dort steht die Meldung:**

| Aktion | nicht verbunden | Beleg |
|---|---|---|
| Springen online | `this.hud.log('Nicht verbunden', 'danger')` | `main.js:822` |
| Waffe abwerfen online | `this.hud.log('Nicht verbunden', 'danger')` | `main.js:866` |
| **Feuern online** | **nichts** | `main.js:1357` |

**Was der Spieler merkt:** Er hält die Leertaste, das Zielvisier lädt auf, er
lässt los — und es passiert exakt nichts. Kein Schuss, keine Zeile, kein Ton,
keine Erklärung. Die Figur bleibt stehen und der Zug läuft weiter (Zugzeit
zählt herunter, `hud-timer` sichtbar). Der Spieler sucht den Fehler bei sich.

**Gegenstück lokal (gleiche Klasse, kleiner):** `main.js:1348` („Kein laufendes
Match") und `:1386` (`playerId === null` → „Kein aktiver Spieler") melden
ebenfalls nichts. Spielbar nur im Randfall.

### A2 (Schwere B) — Zwei Rückrufe, die ans HUD übergeben und dort nie gelesen werden

**Beleg:** `src/client/main.js:903`

```js
this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i),
  onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()), onJump: seitlich => this.jump(seitlich) });
```

Die Signatur liest sie nicht: `src/client/hud.js:239`

```js
update(state, { aim = null, onWeaponSelect = null } = {}) {
```

`grep -rn "onJump\|onWeaponDrop" src/client/hud.js` → **0 Treffer.** Im
gesamten Client gibt es `onJump`/`onWeaponDrop` nur als Tastatur-Rückrufe
(`main.js:178`/`:181` → `input.js:131`/`:156`). Der `hud.update`-Aufruf im
Zeichenbild (`main.js:2075`) übergibt sie nicht einmal.

**Was der Spieler merkt:** Es gibt — anders als bei der Waffe, die als
klickbare Zeile existiert — **keinen anklickbaren Sprung- und keinen
Abwurf-Knopf.** Wer nicht weiß, dass Springen auf Shift und Abwerfen auf Q
liegt, kommt nicht heran. Die beiden Parameter sind der sichtbare Rest eines
begonnenen und nicht zu Ende gebauten Wegs.

### A3 (Schwere B) — `docs/hunter-ui.md` zitiert Zeilennummern, die auf etwas anderes zeigen (auch der eigene Nachtrag)

Die Datei reklamiert im Kopf „Belege: `datei:zeile`, gemessen, nicht geschätzt"
und widmet Abschnitt 6 genau diesem Vergehen. Geprüft gegen den Baum von heute
(`a49e805`):

| Behauptung | Zitat in hunter-ui.md | tatsächlich heute | Urteil |
|---|---|---|---|
| `hud.js` hat 530 Zeilen | `:8` | **814** (`wc -l`) | WIDERLEGT |
| `#renderWeapons`-Aufruf in `update` | `hud.js:111` | `hud.js:260` | WIDERLEGT |
| `#renderWeapons` selbst | `hud.js:271-357` | `hud.js:420-506` | WIDERLEGT |
| Klick-Handler der Waffenzeile | `hud.js:473` | `hud.js:622` | WIDERLEGT |
| `hud.update`-Verdrahtungen | `main.js:176`, `:839`, `:2011` | `main.js:178`, `:903`, `:2075` | WIDERLEGT |
| `dropWeapon` online-Zweig | `main.js:847` | `main.js:864` | WIDERLEGT |
| `jump` → `sendJump` | `main.js:812` | `main.js:829` | WIDERLEGT |
| `weapon_dropped`-Eintrag | `ereignisse.js:472` | `ereignisse.js:585` | WIDERLEGT |
| NACHTRAG „gemessen heute": `jumped:437`, `crate_landed:454`, `weapon_dropped:472`, `crate_pickup_blocked:492`, `crate_pickup:506`, `drowning:553` | `docs/hunter-ui.md:56-60` | `550`, `567`, `585`, `605`, `619`, `666` | WIDERLEGT — **alle sechs um genau +113 verschoben** |

Die Verschiebung um konstant 113 Zeilen zeigt: die Nummern waren beim
Schreiben richtig und sind durch spätere Einfügungen gerutscht (Commit
`258b333` „Sprünge je Zug unbegrenzt"). Welche Commit sie verschoben hat, ist
NICHT geprüft.

**Was der Spieler davon merkt:** nichts unmittelbar. Es ist ein Befund über
das Werkzeug „Dokumentation": Ein Leser, der eine dieser Stellen aufschlägt,
findet fremden Code und traut dem nächsten Beleg nicht mehr. Die Empfehlung in
§6 des Berichts („die `<Zeile>`-Angaben entfernen, statt sie zu pflegen") gilt
damit **für die Datei selbst** — sie hat es nicht angewendet.

### A4 (Schwere C) — Ablehnung mit unterschiedlicher Farbe, je nach Aktion

| Ablehnung | Ton | Farbe |
|---|---|---|
| Sprung abgelehnt (Engine) | `notice` | grau `#8ba0b4` (`main.js:839`, `hud.js:800-803`) |
| Abwurf abgelehnt (Engine) | `danger` | **rot** (`main.js:896`) |
| Waffe wechseln, falscher Zug | `notice` | grau (`main.js:1319`) |
| Feuern, falscher Zug | `danger` | rot (`main.js:1359`) |

Beide Töne sind Vorrang (`hud.js:132`) — die Überlebensdauer ist also gleich.
Nur die Farbe widerspricht sich: Für dieselbe Sache („jetzt nicht, du bist nicht
dran") gibt es zwei Aussagen über die Lage.
**Was der Spieler merkt:** mal grau, mal rot — er kann nicht lernen, was Rot
bedeutet.

---

### A5 (Schwere A) — Online ist die ganze Klangebene weg: kein Schuss, kein Mündungsfeuer, kein Explosionsklang

Alle vier Klangaufrufe des Clients liegen in **lokalen** Zweigen
(`grep -rn "sound?.verarbeite" src/client/` → `ereignisse.js:216, 236, 245, 293`):

| Ereignis | lokal | online | Beleg |
|---|---|---|---|
| `shot` | `renderer.addMuzzleFlash(n.playerId, n.angle ?? 0)` **und** `sound?.verarbeite({ type: 'shot' })` | **nur** `shotPredictor.resolve()` | `ereignisse.js:277-294` vs `:296-299` |
| `explosion` | Krater + Blitz + `sound?.verarbeite({ type: 'explosion', … })` | Partikel + Blitz + Krater, **kein Klang** | `ereignisse.js:205-217` vs `:218-222` |
| `hitscan` | Strahl + `shot`-Klang, bei Treffer zusätzlich `damage`-Klang | Strahl + Vorhersage auflösen, **kein Klang** | `ereignisse.js:233-247` vs `:248-265` |

Der Kommentar über `explosion` (`ereignisse.js:201-203`) **benennt** den
Unterschied wörtlich („Online: Partikel, Blitz, Krater — und KEIN Klang. Das ist
der Unterschied, den die beiden Einträge benennen.") — **begründet ihn aber
nicht**, und nirgends sonst im Baum steht eine Begründung: kein Test hält die
Stille fest (`grep Klang tests/event-coverage.test.js` → 1 Treffer, nur
`sound: null` im Kontext-Ersatz).

**Der Mischer steht online zur Verfügung:** `main.js:1443` gibt `sound: this.sound`
in den Ereigniskontext (in BEIDEN Betriebsarten), und `fire()` online
(`main.js:1356-1369`) ruft ihn nicht auf. Die Regel „wer spielt, entscheidet der
Mischer" (`soundMixer.js:1-21`) ist damit online gegenstandslos — es entscheidet
der Zweig, nicht der Mischer.

**Was der Spieler merkt:** Er schießt online und hört nichts und sieht an seiner
eigenen Figur kein Mündungsfeuer; Treffer und Explosionen anderer Spieler sind
ebenfalls stumm. Die einzige Rückmeldung ist die türkise Vorhersagebahn
(`main.js:1367`), die „so könnte er fliegen" bedeutet — nicht „er ist geflogen".

### A6 (Schwere A) — Online zeigt der Status „Läuft", während der Mahlstrom läuft (Runde 8–14)

**Der Motor greift ab Runde 8:** `src/engine/match.js:2722`
`if (this.#round >= MATCH_RULES.suddenDeath.roundBreakpoint)`, Wert
`src/shared/config/match.js:85` → `roundBreakpoint: 8` (Kommentar dort: „Warum 8
(vorher 15)" — die 15 ist die **alte** Zahl).

**Der Online-Zustand rechnet mit der alten Zahl:** `src/client/main.js:1194`

```js
maelstrom: { active: (snapshot.round ?? 0) >= 15, inset: this.remoteInset ?? 0 },
```

**Und drei Anzeigen hängen daran:**

- `src/client/renderer.js:1116-1117`: `#drawMaelstrom(maelstrom)` steigt aus,
  solange `active` falsch ist (`if (!maelstrom?.active || maelstrom.inset <= 0) return;`)
  — **die Sturmwand wird nicht gezeichnet.**
- `src/client/hud.js:253-256`: `state.maelstrom?.active ? 'Mahlstrom' : 'Läuft'`
  und die Farbe (`#ef476f` gegen `#90be6d`) — **grün „Läuft".**
- Der Einschnitt selbst kommt unabhängig davon an: `maelstrom_contract` hat einen
  Online-Zweig, der `renderer.applyContraction(inset)` aufruft und `remoteInset`
  setzt (`ereignisse.js:668-676`, Aufruf `:171`) — **die Karte zieht sich also
  sichtbar zusammen, während „Läuft" dasteht und keine Wand zu sehen ist.**

**Kein anderes Feld trägt den Zustand:** `protocol.js` und `networkClient.js`
kennen kein `maelstrom`-Feld (einziger Treffer: der Name in
`ZUSTANDSEREIGNISARTEN`), der Client leitet `active` also **allein aus der
Rundenzahl** ab — mit einer zweiten Kopie der Schwelle statt der Referenz auf
`MATCH_RULES`.

**Was der Spieler merkt:** In der Online-Partie ist die Gefahrenzone ab Runde 8
unsichtbar, obwohl sie Terrain frisst und außerhalb Leben kostet. Bei Ø 24
Runden und 20–30 s Zugzeit sind das rund sieben Runden Blindflug. Lokal stimmt
alles (der Motor liefert `state.maelstrom`).

### A7 (Schwere B) — Zwei Zustandsmarken können online strukturell nie erscheinen

`src/client/main.js:1129-1139` baut die Zustände für die Anzeige:

```js
statuses[entity.entityId] = {
  shield: entity.shield ?? 0,
  frozenTurns: entity.frozenTurns ?? 0,
  dots: [],            // <- fest leer
  boostMultiplier: 1,  // <- fest 1
};
```

Das HUD hängt genau daran zwei Marken: `☠` (Schaden über Zeit) und `↑`
(Schadensbonus) — `hud.js:307` (Signatur) und `hud.js:375-378` (Aufbau). Lokal
kommen beide Werte aus dem Motorzustand (`stateSnapshot.js`, `statuses`).

**Was der Spieler merkt:** Online sieht er weder die Marke „ich brenne/vergifte"
noch den Schadensbonus am Namen — der Schaden wird bei jedem Zugbeginn abgezogen
und ist im Protokoll nur eine Zeile (`dot_tick`, `ereignisse.js:445-452`). Der
Unterschied zwischen „mir fehlt Leben, weil ich im Wasser war" und „mir fehlt
Leben, weil ich brenne" ist online nicht mehr zu sehen.

### A8 (Schwere B) — Die sichtbare Protokollfläche ist ~4 Zeilen, nicht 60 (gemessen)

**Die Geometrie steht im CSS:** `index.html:257`
`#hud-log { grid-column: 1 / -1; grid-row: 3; max-height: 108px; overflow: hidden; }`
und `index.html:384` `#log-list { padding: 6px 10px; gap: 3px; font-size: 12px; … }`.
`.panel` setzt **kein** Innenmaß (`index.html:165-169`), `#log-list` hat **keine**
eigene `line-height` (die `1.5` in `index.html:145` gehört zu `#wheel-detail`,
`html, body` setzen keine) → Browser-Vorgabe ≈ 1,2, also 14,4–18 px je Zeile.
`(108 − 12) / (Zeile + 3)` ergibt damit **4 volle Zeilen** (5. angeschnitten) bis
**5 volle Zeilen**. Es gibt **kein** `overflow-y` — die Zeilen 6–60 sind da, aber
nicht erreichbar.

**Messung** (Sonde `/tmp/probe-verlauf.mjs`, echter `MatchController` + echtes
`Hud` + echte Ereignistabelle, Seed 4242, Marke `notice` nach 5,0 s, Lauf 60 s):

| Lage | Position der Meldung | Aus dem Sichtfenster | Aus dem Protokoll |
|---|---|---|---|
| 4 Figuren, `hills` | 0 s–24 s: **0**, danach 1 | nie (55 s) | nie |
| 40 Figuren, `hills` | 0 s–24 s: **0**, danach 1 | nie (55 s) | nie |
| 40 Figuren, `flooded` | 3 s: **7**, 6 s: **16** | nach **2,15 s** | nach **6,70 s** |

Der Grund im dritten Fall ist **nicht** das Anzeigerauschen: um die Marke herum
liefen **24 × „P<N> ausgeschaltet"** (`death`, `danger`, je Figur ein eigener
Text) und 2 × „P<N> ist am Zug" (`accent`) — 26 Vorrangmeldungen gegen ein
Budget von 20 (`hud.js:97`). Die Zusicherung „Anzeigerauschen verdrängt keine
Vorrangmeldung" hält (messbar: auf `hills` bleibt die Marke bei 4 UND 40 Figuren
über 55 s), aber **die Meldung stirbt an ihresgleichen.**

**Warum die vorhandene Messung das nicht zeigt:** `docs/hud-vorrang.md:259-268`
meldet „Überlebt NACHHER > 18 s" in allen acht Lagen, gemessen mit einer Sonde,
die die **Zugehörigkeit zum Modell** prüft (`#logEntries`/`children`), nicht die
**Position**. `tests/hud-vorrang.test.js:185` heißt wörtlich „Eine
Ablehnungsbegründung (`notice`) überlebt 200 Anzeigemeldungen" und prüft
`assets.includes(MARKER)`; der DOM-Ersatz dort hat bewusst kein Layout
(eigener Kommentar `:43-53`). Beide Zahlen sind richtig — sie beantworten nur
nicht die Frage „kann der Spieler sie lesen".

**Was der Spieler merkt:** Er sieht zu jedem Zeitpunkt höchstens die vier bis
fünf neuesten Zeilen. Bei 40 Figuren in einer Wasserpartie ist die Begründung
seiner abgelehnten Eingabe nach ~2 s aus dem Bild — vorher gemessen 0,2 s, jetzt
2,15 s. Der Fix hat den Fall um den Faktor 10 verbessert und **nicht beseitigt**.

### A9 (Schwere B) — Der Kader hat bei 30–40 Figuren keinen Überlaufschutz (gerechnet)

- `index.html:255` `#hud-left { grid-column: 1; grid-row: 2; align-self: start; }`
  — **kein** `max-height`, **kein** `overflow`.
- `index.html:259` `#roster { … display: grid; gap: 6px; }`, `index.html:261-269`
  `.roster-item { font-size: 13px; padding: 4px 6px; }` → Zeile ≈ 24 px + 6 px.
- Zeile 2 des HUD-Rasters (`index.html:177` `grid-template-rows: auto 1fr auto`)
  hat als Höhe: Fensterhöhe − 24 (HUD-Innenabstand) − ~60 (`#hud-top`, `.stat`
  mit zwei Zeilen) − 108 (`#hud-log`) − 20 (zwei Abstände).

| Fenster | Platz in Zeile 2 | 30 Figuren (≈900 px) | 40 Figuren (≈1200 px) |
|---|---|---|---|
| 1440×900 (E2E-Viewport, `playwright.config.mjs:48`) | ≈ 688 px | ragt ~210 px über | ragt ~510 px über |
| 1920×1080 | ≈ 868 px | ragt ~30 px über | ragt ~330 px über |
| 2560×1440 | ≈ 1228 px | passt | passt knapp |

`#hud-log` steht im DOM **nach** `#hud-left` (`index.html:735` gegen `:750`) und
sein Hintergrund ist zu 96 % deckend (`index.html:166`) → die überstehenden
Kaderzeilen liegen **hinter** dem Protokollfeld und sind nicht lesbar; einen
Scrollweg gibt es nicht (kein `overflow`).

**Die Suite fängt das nicht:** `tests/e2e/grosse-teams.spec.mjs:89` zählt
`#roster .roster-item` auf 30 und `:92` verlangt nur `#hud-log` `toBeVisible()` —
Überlappung lässt beide Zusicherungen grün (Playwright prüft Sichtbarkeit, keine
Deckung).

**Was der Spieler merkt:** In der Krieg-Matchart (30–40 Figuren, das erklärte
Zielbild) fehlen ihm unten Figuren aus der Liste — bei 1080p rund ein Drittel,
seine eigene kann dabei sein. Er sieht nicht auf einen Blick, wie viele noch
leben. **Zahlen sind gerechnet, nicht am Bildschirm gemessen → Teil B.**

### A10 (Schwere B) — Der Lebensbalken rechnet online mit einer festen 100

**Der Motor rechnet das Maximum aus:** `src/engine/match.js:1050`
`const maxHealth = Math.round(this.baseHealth * profile.healthMultiplier);`
(`baseHealth` = `BASE_HEALTH` = 100, `match.js:207`), und
`profile.healthMultiplier = Klasse × Archetyp × Sidegrade`
(`src/shared/config/classes.js:237` und `:257`).

**Nachgerechnet mit den echten Modulen** (`node --input-type=module -e "'import { combatProfile, CLASS_DEFINITIONS, CLASS_ARCHETYPES } …'"`
über alle 3 Klassen × 3 Archetypen × 5 Sidegrade-Zustände = 45 Kombinationen):

```
maxHealth-Werte: 48, 54, 56, 61, 63, 64, 70, 72, 74, 77, 79, 80, 82, 83, 88, 90,
                 91, 92, 96, 104, 105, 108, 110, 114, 120, 124, 130, 133, 135,
                 156, 179, 195
32 verschiedene Werte, min 48, max 195 — 100 ist NICHT darunter.
```

- **Lokal** kommt der Wert mit: `src/engine/stateSnapshot.js:108`
  `maxHealth: alive ? quelle.world.getComponent(…, 'Health', 'max') : 0` → Balken
  und Farbe (`hud.js:365-367`) stimmen.
- **Online** steht eine Konstante: `src/client/main.js:1168` `maxHealth: 100` —
  ein Wert, den **keine** Klasse/Archetyp/Sidegrade-Kombination erzeugt.

**Beispiel (aus derselben Rechnung):** eine Figur mit 195 maximalen und 100
aktuellen Leben → lokal Balken `100/195` = **51 %** (gelb, `#fbbf24`), online
`100/100` = **100 %** voll (grün); weil `.hp-track` `overflow: hidden` hat
(`index.html:274-278`), wird der Überlauf abgeschnitten statt sichtbar.

**Was der Spieler merkt:** Online hält er einen schwer angeschlagenen Gegner für
unversehrt — die Lebenszahl stimmt, der Balken (und seine Ampelfarbe) lügt. Wer
nach dem Balken entscheidet, wen er als Nächstes beschießt, entscheidet falsch.
Für einen Scout (48 max) zeigt der Balken umgekehrt mehr Schaden an als da ist:
bei 30 Leben lokal 63 % (grün), online 30 % (rot).

### A11 (Schwere C) — Kommentar in `hud.js` beschreibt einen Auftrag, der längst erledigt ist

`src/client/hud.js:111-114`:

> „Solche Meldungen sind **heute** mit dem Vorgabeton `neutral` unterwegs (fünf
> Stellen in `main.js`, siehe `docs/hud-vorrang.md` §6) und landen damit im
> Rauschbudget."

und `hud.js:94-95`: „die fünf Aufrufstellen in `main.js`, die ihn **setzen
sollten**, stehen in `docs/hud-vorrang.md`."

**Gegenteil ist belegt:** `main.js:826`, `:839`, `:870`, `:883`, `:1319` schreiben
alle `'notice'` — genau die fünf Stellen aus `docs/hud-vorrang.md` §7.1, die
dort noch als offen geführt werden. Auch `docs/hud-vorrang.md:289-295` führt den
Punkt als „müssen den Ton setzen" statt als erledigt.

**Was der Spieler merkt:** nichts. Es ist ein Befund über den Kommentar, und er
ist teuer: Wer diese Zeilen liest, sucht eine Arbeit, die schon getan ist — oder
schließt umgekehrt aus dem Kommentar, die Meldung sei ungeschützt, obwohl sie es
nicht ist.

---

## Teil A2 — Vier-Augen-Probe `docs/hunter-ui.md`: was der Bericht RICHTIG behauptet

Damit die Widerlegungen nicht das Bild verzerren — geprüft und **bestätigt**:

| Behauptung (Fundstelle im Bericht) | Urteil | Beleg heute |
|---|---|---|
| §0/§1: `landed`, `fall_damage`, `toxic_rain` sind `beide(...)`, `crate_pickup` hat einen eigenen `online:`-Zweig | **BESTÄTIGT** | `ereignisse.js:563` (`landed`), `:701` (`fall_damage`), `:716` (`toxic_rain`), `:619-638` (`crate_pickup` mit eigenem `online:`) |
| §1: der Dispatch ist optional-verkettet, ein fehlender Zweig ist ein lautloser No-Op | **BESTÄTIGT** | `ereignisse.js:781` (`?.lokal?.()`), `:796` (`?.online?.()`) |
| §1 (nachgezogen): nur-online = `terrain_destroyed`, `projectile_spawn`, `weapon_dropped`, `turn_start`, `karte_unerreichbar` (5) | **BESTÄTIGT** | nachgezählt über `Object.keys(EREIGNIS_WIRKUNGEN)` (39 Einträge): genau diese fünf |
| §1 (nachgezogen): nur-lokal = `crate_landed` (1) | **BESTÄTIGT** | `ereignisse.js:567` |
| §2: `landed` wird nirgends sonst ausgewertet | **BESTÄTIGT** | einziger Konsument ist `ereignisse.js:563`; der Renderer zeichnet nur die interpolierte Figur (`renderer.js:1217`) |
| §3a: die Gruppen der Waffenliste entstehen aus DERSELBEN Reihenfolge wie die Nummern | **BESTÄTIGT** | `hud.js:473-498` (Gruppen laufen über `reihenfolge`, Nummer über `positionVon`) |
| §3a: `stopPropagation` in der Waffenzeile ist nötig, weil die Leertaste global feuert | **BESTÄTIGT** | globaler `keydown` am Fenster `input.js:62-70`, Leertaste lädt auf `:83-87`, Sperre `hud.js:631-636` |
| §3a: Fokus bleibt nach `replaceChildren` auf derselben Waffe | **BESTÄTIGT** | `hud.js:447` (merken) und `:503-505` (zurückholen) |
| §3a: `aria-label`/`aria-current`/`role=button` an der Waffenzeile | **BESTÄTIGT** | `hud.js:531-534` |
| §3b: `#inventoryIndexAt` übersetzt die ANGEZEIGTE Nummer in den Inventar-Index | **BESTÄTIGT** | `main.js:1281-1287` |
| §4: `bewusstStumm` hat 12 Einträge | **BESTÄTIGT** | nachgezählt in `tests/event-coverage.test.js:184-213` |
| §4: `drowning: {}` ist der EINZIGE Tabelleneintrag ganz ohne Zweig | **BESTÄTIGT** | nachgerechnet über `EREIGNIS_WIRKUNGEN` (39 Einträge) — genau 1 ohne Zweig: `drowning` |
| §5: die Betriebsart steht in `this.mode` mit `'local'`/`'online'`/`'replay'`, genau einmal unterschieden | **BESTÄTIGT** | Zuweisungen `main.js:109/325/740` (`local`), `:917` (`online`), `:2160` (`replay`) |
| §5: `step()` läuft nur lokal | **BESTÄTIGT** | `main.js:1399` (`if (this.mode !== 'local' \|\| !this.match) return;`) |

Von den prüfbaren Aussagen des Berichts sind damit **14 bestätigt** und die in
A3/C1/C2/C4 genannten **widerlegt** — die Quote ist deutlich besser als der
Zufall, der Schaden sitzt in Zeilennummern und in zwei Anzeige-Begründungen.

## Teil A3 — Was schon gut funktioniert (mit Beleg)

- **Der Vorrang-Bau trägt, wo er tragen soll.** Gemessen auf `hills`: eine
  `notice`-Meldung bleibt bei 4 UND bei 40 Figuren **55 s lang auf Position 0–1**
  (`/tmp/probe-verlauf.mjs`). Das Zusammenfassen gleicher Texte hält die Liste
  zugleich klein (4–8 Knoten statt 60) — belegt in `hud.js:660-677` und in meinen
  Messläufen (4, 6, 7, 36, 43, 45 Knoten).
- **Die Signatur-Technik der Anzeige ist richtig gebaut:** Runde/Wind/Zugzeit/
  Status je Bild, Liste nur bei Änderung (`hud.js:318-321`, `:428-433`) — der
  Lebensbalken zieht bei jeder HP-Änderung nach, ohne die DOM-Liste jeden Bild
  neu zu bauen.
- **Bestände laufen online korrekt:** `LOADOUTS` trägt Inventar, Munition,
  Nachladezeiten, Klasse und Archetyp und geht nur bei Änderung raus
  (`gameServer.js:660-728`), der Client ordnet sie über `entityId` zu
  (`main.js:1177-1180`) — Munition und Nachladebalken sind online so gut wie lokal.
- **Zugänglichkeit ist keine Behauptung:** `role="log"`, `aria-live`,
  `aria-relevant="additions"` (`index.html:772-773`), bedienbare Waffenzeilen mit
  Fokus-Erhalt, Zugwechsel angesagt (`hud.js:279-282`), Abbruchknopf mit
  Rückfrage (`index.html:729`), `prefers-reduced-motion` respektiert
  (`index.html:91`).
- **Das Wasser ist als Information gelöst:** Marke mit Zustandswort, Prozent im
  Tooltip, Schwelle fürs Ertrinken benannt (`hud.js:383-393`) — lokal und online,
  weil `waterLevel` im Snapshot mitgeführt wird (`protocol.js:437`, `:121`).
- **Ehrliche Wartemeldung:** „Warte auf Mitspieler: … es gibt keine Bot-KI, jedes
  Team braucht einen Menschen" (`main.js:1015-1019`) — sagt dem Spieler, warum
  nichts passiert.

---

## Teil B — VERDACHT (mit dem Test, der es klären würde)

### V1 — Die sichtbare Zeilenzahl (4–5) ist gerechnet, nicht am Bildschirm gemessen

Beleg ist CSS-Arithmetik (A8) mit der Annahme „Zeilenlücke = Browser-Vorgabe ≈ 1,2,
weil keine `line-height` gesetzt ist". **Klärung:** ein Playwright-Lauf, der
`#log-list` `scrollHeight` gegen `clientHeight` stellt und die
`getBoundingClientRect()` der Kinder zählt, bei 1440×900 und 2560×1440. Erwartung
nach Rechnung: 4–5 Kinder passen vollständig; trifft es zu, ist A8 bestätigt.

### V2 — Der Kader-Überlauf (A9) ist ebenfalls gerechnet

Die **wackeligste Zahl** des Berichts ist die Zeilenhöhe des Kaders: ich habe sie
aus `font-size: 13px` + `padding: 4px 6px` mit ≈ 24 px angesetzt. Das unterschätzt
sie möglicherweise — `#roster` ist ein Gitter mit drei Spalten, und jede
Zustandsmarke (`🛡/❄/☠/↑/💧`) ist ein weiteres Gitterkind, das in eine neue Zeile
rutscht (`hud.js:403-414`). Eine Figur im Wasser mit Schild macht die Zeile damit
höher. **Der Befund wird durch den Fehler nur größer, nie kleiner** — mehr Höhe
heißt mehr Überlauf.

**Klärung:** dasselbe Playwright-Instrument: `#roster.getBoundingClientRect().bottom`
gegen `#hud-log.getBoundingClientRect().top` bei 30 und 40 Figuren, mit und ohne
Marken. Ist `bottom` größer als `top`, ragt die Liste unter das Protokollfeld.

### V3 — `remoteInset` wird nie zurückgesetzt

`main.js:1194` liest `this.remoteInset`, `main.js:1466` setzt es — sonst kommt der
Name im Baum nicht vor (kein Feld im Konstruktor, keine Rücksetzung beim
Matchstart). Nach zwei Online-Partien in derselben Seite trägt die zweite den
Einschnitt der ersten, bis das erste `maelstrom_contract` eintrifft — und weil
`active` erst ab Runde 15 wahr wird (A6), ist der Einschnitt dann längst
fortgeschritten. **Klärung:** zwei Online-Matches nacheinander in einer Seite und
`remoteInset` nach dem Start des zweiten lesen; erwartet: nicht 0.

### V4 — Die Gesamtdauer der Zugzeit wird online geraten

`main.js:1121-1125`: „Die Gesamtdauer wird aus dem höchsten beobachteten Wert
abgeleitet, damit sie ohne Zusatzfeld korrekt ist" —
`if (remaining > (this.remoteTurnDurationMs ?? 0)) this.remoteTurnDurationMs = remaining;`.
Beim Beitritt mitten in einem Zug ist der höchste beobachtete Rest **kleiner** als
die echte Zugdauer (`turnTimers`, `match.js:45-48`: 30 s im Duell, **20 s bei vier
Spielern**), und `remoteTurnDurationMs` wird zwischen Partien nicht zurückgesetzt
(derselbe Befund wie V3). Folge: `hud-timer` startet zu niedrig. **Klärung:** in
einem laufenden Online-Match beitreten und `hud-timer` im ersten Zug gegen die
echte `turnDurationMs` der Sitzung stellen; ebenso zwei Partien mit
unterschiedlicher Spielerzahl nacheinander.

### V5 — Was ich NICHT gemessen habe

- Nur `hills` und `flooded`, nur Zugzeit 30 s (Standard) und Seed 4242. Die
  Zugzeit **20 s bei vier Spielern** (`src/shared/config/match.js:45-48`) und die
  übrigen Presets sind ungeprüft.
- Die Sonde fährt ohne `main.js`: die Vorrangmeldungen der Wasserübergänge
  („P<N> ertrinkt", `danger`, `main.js:1504`) kommen **nicht** darin vor. In einer
  echten Partie sind sie ein ZUSÄTZLICHER Vorrang-Zufluss — A8 ist damit eine
  **untere** Schranke des Problems, nicht die Obergrenze.
- Kein Browser, kein Server: Aussagen über Klang, Pixel und Klickbarkeit sind
  Code-/Konfigurationsbefunde.
- **Der Motor stand nicht still:** während der Messläufe hat ein anderer Arbeiter
  `src/engine/match.js` umgebaut (Commit `fd4afc2`, danach). Die Sonden liegen als
  Wegwerfdateien in `/tmp` (`probe-verlauf.mjs`, `probe-schuss.mjs`,
  `probe-verdraengung.mjs`, `probe-sichtbar.mjs`) und sind wiederholbar; wer die
  Zahlen nachziehen will, fährt sie gegen den heutigen Baum neu. Sie schreiben
  **nichts** ins Repo.

---

## Teil C — WIDERLEGTE Behauptungen (fremd und eigen)

### C1 — `docs/hunter-ui.md` §4, `round_crates`: „die Anzahl steht im HUD" → **WIDERLEGT**

```js
'round_crates',      // Buchführung; die Anzahl steht im HUD
```
(`tests/event-coverage.test.js:201`; übernommen in `docs/hunter-ui.md:199`.)

Es gibt **keinen** Kistenzähler im Client: `hud.js` setzt nur `round`, `wind`,
`timer`, `status`, `roster`, `weapons`, `angle`, `power`, `blast`, `active`,
`connection` (`hud.js:197-210`), und `grep -rn "crates.length" src/client/` liefert
**0 Treffer**; der Renderer zeichnet die Kisten selbst (`renderer.js:1201`), aber
keine Zahl. Die Begründung für das stille Ereignis ist damit falsch — nicht die
Stille selbst (man SIEHT die Kisten auf der Karte).

### C2 — `docs/hunter-ui.md` §4, `dot_applied`: „Zustandsmarke am Spielernamen" → **WIDERLEGT FÜR ONLINE**

Lokal richtig, online unmöglich: `main.js:1135-1136` setzt `dots: []` und
`boostMultiplier: 1` fest (siehe A7). Die Begründung gilt also nur für den
lokalen Zweig — dieselbe Halbwahrheit, die `hunter-ui.md` selbst bei
`weapon_dropped` richtiggestellt hat.

### C3 — `docs/hunter-ui.md` §6 (veraltete Zeilennummern im Abdeckungstest) → **BESTÄTIGT, und erneut verrutscht**

`tests/event-coverage.test.js:268-279` zitiert:

| Ereignis | Zitat im Test | tatsächlich heute |
|---|---|---|
| `crate_pickup` | `ereignisse.js:424` | **619** |
| `jumped` | `:399` | **550** |
| `landed` | `:405` | **563** |
| `fall_damage` | `:489` | **701** |
| `dot_tick` | `:344` | **445** |

### C4 — `docs/hunter-ui.md` gibt als „tatsächlich" Werte an, die heute selbst falsch sind → **WIDERLEGT**

§6 nennt `crate_pickup:472`, `fall_damage:537`, `landed:430`, `jumped:424` — heute
619 / 701 / 563 / 550. Der Abschnitt ist richtig im Urteil („ein Beleg, der nicht
geprüft wird, ist eine Behauptung") und liefert selbst unbelegte Zahlen. Die
Empfehlung gehört auf die Datei selbst angewandt.

### C5 — Meine eigene Vermutung: „auf `flooded` wird die Marke vom Anzeigerauschen verdrängt" → **WIDERLEGT**

Ich bin mit dieser Annahme in die Sonde gegangen (sie folgte aus `hud.js:266-268`
und `hud-vorrang.md` §2a). Gemessen ist es anders: das Rauschen ist auf `flooded`
sogar **dünner** (1 verschiedener Anzeigetext gegenüber 16 Landungstexten auf
`hills`), und die Marke fällt an **`death`** (24 ×, `danger`, je Figur eigener
Text). Hätte ich nur gelesen und nicht gemessen, stünde im Bericht die falsche
Ursache.

### C6 — Meine eigene Annahme: „auf `hills` zwingt das ungedrosselte `landed` die Meldung sofort aus dem Bild" → **WIDERLEGT**

Sie ist falsch, weil gleiche Texte zu EINER Zeile zusammengefasst werden
(`hud.js:660-677`): die Liste wächst durch `landed` **gar nicht mehr** (gemessen
4 bzw. 45–46 Knoten, konstant). Gemessen bleibt die Marke auf `hills` bei 4 und
bei 40 Figuren **55 s lang auf Position 0–1**, also dauerhaft im Sichtfenster.
Der Vorrang-Bau hat hier mehr geleistet, als meine Ausgangsannahme zuließ.

### C7 — NICHT GEPRÜFT (Behauptungen, die ich nicht bestätigen oder widerlegen kann)

- `docs/hunter-ui.md:104-106`: `node --test tests/event-coverage.test.js` → 9/9
  und `npm test` → 1063/1063. Kein Testlauf in diesem Auftrag (Lastregel).
- `docs/hunter-ui.md:236-289`: die Verdrahtungstabelle (§5) ist in der Sache
  bestätigt, ihre **Zeilennummern** sind es nicht (siehe A3).
- `docs/hud-vorrang.md:28-37` und `:259-268`: die Messreihen selbst (Zahlen in
  `Zeilen/s`, Takte) — ich habe sie nicht wiederholt. Meine eigenen Messungen
  widersprechen ihnen nicht, sie beantworten eine andere Frage (A8).
- `docs/hunter-ui.md:1-10`: „Gelesene Dateien (vollständig): … `renderer.js`
  (1255)" — die Datei hat heute 1255 Zeilen, die Angabe stimmt; `hud.js (530)`
  stimmt für `ereignisse.js (655)`-Zeiten, heute 814 / 797 (A3).

---

## Teil D — Die drei Befunde, die dem Spielspaß am meisten schaden

### D1 — Online gibt es keinen Schuss-Klang und kein Mündungsfeuer (A5)

**Was der Spieler erlebt:** Er feuert und nichts passiert. Das Spiel, dessen
ganze Handlung aus Schüssen besteht, quittiert keinen einzigen davon hörbar.
Lokal ist es genau umgekehrt — dieselbe Handlung fühlt sich in den zwei
Betriebsarten unterschiedlich an, ohne dass es dafür eine dokumentierte
Entscheidung gibt.

**Kleiner Fix:** in `src/client/ereignisse.js` die zwei Zeilen des lokalen Zweigs
in den Online-Zweig übernehmen:

```js
shot: { …, online: (k, n) => {
  k.shotPredictor?.resolve();
  k.renderer?.addMuzzleFlash(n.playerId, n.angle ?? 0);
  k.sound?.verarbeite({ type: 'shot' });
} },
```

und in `explosion.online` zusätzlich
`k.sound?.verarbeite({ type: 'explosion', radius: n.radius || 12 });`.
Kein Zustand, kein Netz, keine Simulation betroffen — der Mischer entscheidet
selbst, ob überhaupt etwas erklingt (`soundMixer.js:9-21`).

### D2 — Der Mahlstrom ist online unsichtbar, während er läuft (A6)

**Was der Spieler erlebt:** Ab Runde 8 frisst der Sturm Terrain und Leben, das
HUD sagt „Läuft" (grün) und die Gefahrenzone ist nicht gezeichnet. Er verliert
Leben ohne sichtbare Ursache — genau das Symptom, das `hunter-ui.md` für
`fall_damage` als Fehler beschreibt.

**Kleiner Fix:** die zweite Kopie der Schwelle entfernen und die Referenz lesen —
`src/client/main.js:1194`:

```js
maelstrom: {
  active: (snapshot.round ?? 0) >= MATCH_RULES.suddenDeath.roundBreakpoint,
  inset: this.remoteInset ?? 0,
},
```

(Import aus `../shared/config/match.js`; `-1` Zeile Konstante, `+1` Zeile
Referenz.) Der sauberere Weg wäre, den Zustand im Snapshot mitzuführen, damit
Client und Server nicht dieselbe Regel zweimal kennen — das ist aber die
größere Änderung und gehört in einen eigenen Auftrag.

### D3 — Der Spieler kann die Begründung einer abgelehnten Eingabe nicht mehr lesen (A8)

**Was der Spieler erlebt:** Er drückt SHIFT oder feuert, es passiert nichts, und
die Zeile, die den Grund nennt, ist bei 40 Figuren nach 2,15 s aus dem Sichtfeld
(und nach 6,7 s aus dem Protokoll) — bei nur vier bis fünf sichtbaren Zeilen
überhaupt. Der letzte Anlauf hat das Verhalten von 0,2 s auf 2,15 s verbessert,
ohne die Anzeigefläche anzufassen.

**Kleiner Fix:** die Fläche scrollbar machen und die Wand aufheben —
`index.html:257`:

```css
#hud-log { grid-column: 1 / -1; grid-row: 3; max-height: 108px; overflow-y: auto; }
```

`overflow: hidden` → `auto` (ein Wort): die neuesten Zeilen bleiben oben sichtbar,
die älteren sind erreichbar. ACHTUNG: `#hud` hat `pointer-events: none`
(`index.html:174`) — mit der Maus ist nicht scrollbar, solange nicht
`#hud-log { pointer-events: auto; }` dazukommt; die Tastatur braucht die Region
ohnehin als Live-Region. Wer das größer lösen will (Vorrangmeldungen in einer
eigenen, kleinen Anzeige über dem Protokoll), ändert mehr als eine Zeile — das
gehört dann in einen eigenen Auftrag mit Bildschirmmessung (V1).

**Knapp dahinter (genannt, nicht gewertet):** A9 (Kader verdeckt sich bei 30–40
Figuren) und A10 (Lebensbalken online falsch) treffen das Zielbild „Full-HD,
2–8 Spieler" ebenso hart; sie stehen hier nicht in den Top 3, weil A9 ungerechnet
am Bildschirm und A10 nur eine Anzeige betrifft.
