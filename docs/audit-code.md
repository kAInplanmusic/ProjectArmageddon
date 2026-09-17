# Fremd-Audit: Code (Subagent)

**Auftrag:** Tiefes, belegbasiertes Code-Audit — 10 wichtigste Befunde mit
`file:line`, Schweregrad, Fix-Vorschlag.
**Stand des Auftrags:** Commit `edba466`, 30.588 Zeilen `src/`, 16.076 Zeilen
Tests.
**Ergebnis:** Der Agent erreichte seine Iterationsgrenze, bevor er den Bericht
schrieb. Seine belegten Befunde sind hier festgehalten — **jeder vom
Auftraggeber nachgeprüft**, mit dem jeweiligen Ausgang.

## Vom Auftraggeber verifiziert und behoben

### ✅ KRITISCH — Geschütz-Zielberechnung nutzt einen 5× zu kleinen Wind-Term

`src/engine/match.js:1385` (`#simulateTurretPath`)

**Befund des Agenten:** `vx += wind * 0.02`, wobei `wind` aus
`services.match.currentStrength` kam — und `currentStrength = wind * 10`
(`match.js:2337`). Effektiv also `wind * 0.2`, während das echte Projektil
(`projectileSystem.js:68`) mit `match.wind * 1.0` rechnet.

**Nachprüfung: BESTÄTIGT — und um einen zweiten Fehler ergänzt.**
`vy` wurde nicht gedraggt, `vx` schon. Das echte Geschoss draggt beide Achsen.

Gemessene Abweichung der Zielweite (Kraft 100, 45°):

| Wind | vorher | nachher |
|---|---|---|
| 0 | +14,6 px | 0,00 |
| 0,0125 | −1,1 px | 0,00 |
| 0,025 | −16,9 px | 0,00 |
| 0,05 | −48,4 px | 0,00 |
| −0,05 | **+77,7 px** | 0,00 |

**Warum das zählt:** `#aimTurret` wählt mit dieser Bahn den Schusswinkel, der ein
Ziel treffen soll. Bei bis zu 78 px Fehler schießt das Geschütz daneben — nach
einer falschen Regel, nicht zufällig.

**Behoben** in `#simulateTurretPath`: Wind-Quelle `this.#wind` statt
`currentStrength`, Drag aus `DEFAULT_PROJECTILE_DRAG` (dieselbe Konstante wie
das echte Geschoss), beide Achsen gedraggt.
**Abgesichert:** `tests/turret-ballistics.test.js` (7 Tests) — vergleicht beide
Bahnen Punkt für Punkt über fünf Windwerte.

### ✅ HOCH — `stateHash()` deckte den Zustand nur teilweise ab

`src/engine/match.js:2810`

**Befund des Agenten:** Der Hash enthielt nur `round`, `tick`, `wind`,
`activePlayerId`, Position/Leben der Figuren und Projektilpositionen. Nicht
enthalten: `statuses`, `maelstrom`, `crates`, `turrets`, `guenther`,
`winnerTeamId`, `turnElapsedMs`, `inventory`, `water`.

**Nachprüfung: BESTÄTIGT — und messbar gemacht.**

```
A activeWeaponId: pa_041 | inventory: [5 Waffen]
B activeWeaponId: pa_101 | inventory: [3 andere]
Hash A: 5c9a556d
Hash B: 5c9a556d   ← identisch, obwohl die Ausrüstung völlig anders war
```

**Warum das zählt:** Der Hash ist das **Beweismittel für Determinismus**. Ein
Replay, in dem eine Figur eine andere Waffe trägt oder eingefroren ist, hätte
„gleich" gemeldet.

**Behoben:** Ausrüstung, Munition, Abklingzeiten, Zustände (Schlüssel sortiert),
Geschütze, Mahlstrom, Kisten und Sieger gehen jetzt ein.

**Dabei einen weiteren Fehler gefunden:** Der Kisten-Eintrag las `c.weaponId` —
ein Feld, das es bei Kisten nicht gibt (`{entityId, x, y, crateType, rarity}`).
Der Wert war immer `null`, eine Kiste mit anderem Inhalt blieb unsichtbar. Ein
Test deckte es auf.

**Abgesichert:** `tests/state-hash.test.js` (10 Tests) — jede Ergänzung einzeln,
plus Stabilität und Unabhängigkeit von der Einfügereihenfolge.

### ✅ HOCH — Doppelregel: fünf tote Prioritätskonstanten

`CHARACTER_PRIORITY` (characterSystem.js:16), `DAMAGE_PRIORITY` (damageSystem.js:13),
`LOOT_PRIORITY` (lootSystem.js:14), `MAELSTROM_PRIORITY` (maelstromSystem.js:13),
`PROJECTILE_PRIORITY` (projectileSystem.js:18)

**Nachprüfung: BESTÄTIGT.** Je **0 Leser** (gemessen). Der Motor liest
`SYSTEM_PRIORITIES` aus `engine/init.js`.

**Warum das zählt:** Wer eine dieser Konstanten ändert, ändert **nichts** — und
bekommt keinen Hinweis. Das ist die gefährlichste Form von totem Code: Er sieht
lebendig aus und verspricht eine Wirkung.

**Behoben:** Alle fünf entfernt, jeder Fundort trägt einen erklärenden Kommentar
mit Verweis auf `init.js`.
**Abgesichert:** `tests/system-priority.test.js` (5 Tests) — prüft, dass **keine**
Systemdatei eine eigene Priorität exportiert.

### ✅ HOCH — Toter, zugleich fehlerhafter Pfad: `ReplayRecorder.forMatch()`

`src/engine/replay.js:139-151`

**Nachprüfung: BESTÄTIGT.** Null Aufrufer. Die Methode kopierte `sidegrades` und
`loadouts` **nicht** in den Kopf — genau die Felder, die laut Kopf-Kommentar
dazugehören, „sonst spielte die Wiedergabe ein anderes Match".

**Behoben:** Entfernt statt repariert. Der Server baut den Recorder direkt
(`gameServer.js:92`) und übergibt die vollständige Konfiguration. Eine zweite,
unvollständige Abkürzung wäre eine Falle.

**Abgesichert:** `tests/replay-head.test.js` (8 Tests).

## Weitere Befunde des Agenten — eingeordnet, nicht behoben

### MITTEL — Doppelte Raritäts-Gewichtstabelle

`lootSystem.js:19` (`RARITY_WEIGHTS`) und als Default-Parameter in der
**generierten** `weapons.js:6847`.

**Nachprüfung: BESTÄTIGT.** Der Agent maß: Beide Aufrufe liefern heute dasselbe
(`pa_096` bei Seed 7), „morgen nicht".

**Offen** — die Gewichte liegen in der Designdatei. Die Entscheidung (Default
entfernen oder zwingend übergeben) gehört zum Datenbereich.

### MITTEL — GPU-Fehler wird zu einem stillen CPU-Rückfall

`terrainBaker.js:235-240`

Der Agent ordnet es selbst als **Grenzfall** ein: korrekt zurückgemeldet,
bewusst so gebaut und dokumentiert. **Kein Handlungsbedarf.**

### NIEDRIG — `registerSystem` sortiert bei jeder Registrierung neu

`ecs/world.js:65` — O(n² log n) bei 9 Systemen. Kein Determinismusproblem.
**Reine Kosmetik, nicht behoben.**

## Positiv verifiziert (vom Agenten belegt)

- **Kein `Math.random()` im Simulationspfad** — die vier Treffer sind Doku oder
  Seed-Erzeugung (`prng.js:151`, mit `crypto.getRandomValues`-Vorrang).
- **Server-Autorität intakt:** `INPUT`/`SELECT_WEAPON` laufen über
  Token→`seat.entityId` (`gameServer.js:337, 365, 379-382`); der Client sendet
  nur `angle`/`power`.
- **`POWER_TO_SPEED`, `PREDICTION_GRAVITY`, `PREDICTION_DRAG` sind gekoppelt
  getestet** (`tests/shot-prediction.test.js:36-46`).
- **Sorts in `shared/config` haben explizite Tiebreaks** (Katalogindex:
  `loadouts.js:177`; `classes.js:477-478`).
- **Persistenz-Roundtrip korrekt:** `gameServer.js:92-105` schreibt
  `sidegrades`/`loadouts` in den Kopf, `persistence.js:123` speichert sie.

## Nicht gefunden (vom Agenten)

`TODO`/`FIXME`/`XXX`/`HACK` — null Treffer in `src/`. Leere `catch`-Blöcke — alle
30 geprüften fangen gezielt ab. `Math.random`/`Date.now` im Sim-Pfad.
Client-Entscheidung über physikrelevante Aktionen. Nicht-deterministische
Iteration über `Map`/`Set` im Engine-Pfad.

## Anmerkung des Auftraggebers

Vier Befunde waren echt und sind behoben; zwei davon waren **ernster als
beschrieben** (der fehlende `vy`-Drag im Geschütz-Pfad, das falsche Kistenfeld im
Hash). Zwei weitere wurden beim Beheben erst sichtbar.

Der Agent hat seine Arbeit korrekt gemacht — er erreichte nur die
Iterationsgrenze, bevor er schreiben konnte. Die Live-Transkripte lagen vor und
haben die Nachprüfung ermöglicht.
