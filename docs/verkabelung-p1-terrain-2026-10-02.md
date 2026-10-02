# P1 Terrain-Prüfung: Server vs Client Generator

**Datum:** 2026-10-02  
**Seed:** 3367130477  
**Kartengröße:** 2560×1440 (landscape mittel)  
**Generator-Vergleich:** `erzeugeAutonomeKarte` (Server) vs `generateTerrain` (Client)

---

## 1. Messung

### Testlauf mit Sonde `/tmp/p1-sonde.mjs`
```bash
Kartenmaße: 2560 × 1440
Server: waterLevel = 1103
Server Bitmap-Länge: 3686400
Server Bitmap[0] = 1, Server Bitmap[1] = 0
Client: waterLevel = 1209
Client Bitmap-Länge: 3686400
Client Bitmap[0] = 1, Client Bitmap[1] = 0

========== ERGEBNIS ==========
Abweichende Zellen: 1262018 von 3686400
Abweichung: 34.23%
Server Wasserstand: 1103
Client Wasserstand: 1209
Wasserstandsdifferenz: 106
```

Die Sonde wurde zweimal ausgeführt, beide Male identische Ergebnisse.

---

## 2. Antwort auf die drei Fragen

### (a) Weichen sie ab?

**Ja.** 1.262.018 abweichende Zellen von 3.686.400 Gesamtzellen = **34,23 %**.

### (b) Wenn ja — folgt der Unterschied aus dem GENERATOR oder aus Preset/Orientierung/Seed-Unterstrom?

Der Unterschied folgt **aus dem Generator**.

- **Server/terrainBuilder.js:87** ruft `erzeugeAutonomeKarte` aus `terrainGen3.js` auf (2D-Maske, Charakter-Treiber, terrassen/hoehlung/lippen etc.)
- **Client/terrainPreview.js:25** ruft `generateTerrain` aus `terrainGen.js` auf (1D-Höhenfeld, Preset-basiert)

Beide Module verwenden `MatchSeedManager` mit TERRAIN-Offset (2.000.000), die Kartenmaße sind identisch (2560×1440, landscape mittel), Preset/Seed sind identisch. Der Unterschied ist also nicht Seed/Offset/Orientierung, sondern die grundsätzliche Generator-Logik.

Wasserstand Server: 1103, Client: 1209 → Differenz 106 Pixel, auch Generator-bedingt.

### (c) Reicht der Client den "kartentyp" überhaupt bis zum Generator durch?

**Nein, der kartentyp fällt komplett weg, und der Client nutzt den falschen Generator.**

Import-/Konstruktionskette:
- `src/client/main.js:445` hardcodet `const kartentyp = 'autonom'`
- `src/client/main.js:1060` übergibt `kartentyp` an `NetworkClient` Konstruktor
- `src/client/networkClient.js:163` definiert `constructor({ url, lobbyId, token, playerName, seed, preset, teams, playersPerTeam } = {})` — **kein kartentyp Parameter**
- `src/client/main.js:1180` ruft `buildTerrainForSeed(seed, preset, orientation)` auf — **kein kartentyp**
- `src/client/terrainPreview.js:22` `buildTerrainForSeed(seed, preset = 'hills', orientation = 'landscape')` — **Signature kennt kartentyp nicht**
- `src/client/terrainPreview.js:25` ruft `generateTerrain()` direkt auf — **nicht erzeugeAutonomeKarte**

Dadurch wird der kartentyp nicht zum Generator durchgereicht, und selbst wenn er es wäre, würde er im Client keine Wirkung entfalten, weil `buildTerrainForSeed` immer `generateTerrain` aus `terrainGen.js` nutzt.

Server-Seitig ist die Kette korrekt:
- `src/engine/match.js:18 import { baueTerrain } from './terrainBuilder.js'`
- `src/engine/match.js:801 const ergebnis = baueTerrain({ seedManager, width, height, kartentyp: this.kartentyp, preset, ... })`
- `src/engine/terrainBuilder.js:77 if (quelle.kartentyp === 'autonom')` → `erzeugeAutonomeKarte`

---

## 3. Kleiner Fix als Vorschlag

Nicht gebaut, nur Vorschlag:

1. **Protokoll**: Der Server sendet aktuell Seed/Preset/Orientation im Lobby-State, keinen kartentyp. Der kartentyp ist server-seitig fest 'autonom' (hardcoded in `main.js`). Um Konsistenz zu erzwingen, muss der Server den kartentyp im Lobby/Join-Payload mitsenden, oder der Client muss 'autonom' als Default annehmen.

2. **Client**: `src/client/terrainPreview.js:22` Signatur erweitern auf `buildTerrainForSeed(seed, preset = 'hills', orientation = 'landscape', kartentyp = null)` und Import von `erzeugeAutonomeKarte` aus `terrainGen3.js` hinzufügen. Bei `kartentyp === 'autonom'` `erzeugeAutonomeKarte` nutzen, sonst `generateTerrain`. Das wäre eine minimale Codeänderung.

3. **Kette**: `main.js` muss kartentyp an `#buildRemoteTerrain` durchreichen und dieser an `buildTerrainForSeed`.

Folgeabschätzung: Protokolländerung nötig (kartentyp im Payload). Ohne Protokolländerung wäre der Fix unvollständig, da der Client keinen kartentyp vom Server kennt — er würde zwar lokal 'autonom' annehmen, aber bei Lobby-Wechsel etc. könnte er auseinanderlaufen. Änderung betrifft UI/Netzwerk, nicht nur Renderer.

---

## 4. Git-Status

Vorher/Nachher unverändert bis auf Berichtsdatei.

```bash
git status --short
?? docs/verkabelung-p1-terrain-2026-10-02.md
```

Weitere zufällige Untiefen im Repo unverändert.

---

## 5. Sonde

Sondenpfad: `/tmp/p1-sonde.mjs`

---

## 6. Was nicht geprüft wurde

- Ob `erzeugeAutonomeKarte` im Client-Kontext ohne Events/Statuses/Material vollständig deterministisch bleibt (Material-Fork wird im Builder genutzt).
- Ob der Server den kartentyp tatsächlich an den Client meldet (aktuell nur im Konstruktor des Local-Match).
- Ob `erzeugeKarte` (terrainGen2) als Zwischenschritt eine Rolle spielt.

---

## 7. Offene Fragen

1. Ist es beabsichtigt, dass der Client für Terrain-Vorschau einen anderen Generator nutzt als der Server für Simulation? Wenn ja, warum?
2. Soll der kartentyp vom Server an den Client gesendet werden, oder bleibt er client-seitig hardcoded?
3. Gibt es eine E2E-Spezifikation, die die Kartengleichheit zwischen Client-Vorschau und Server-Simulation vorschreibt? Falls nein, ist der Befund evtl. bewusst?

---

## Nachtrag des Auftraggebers (nachgeprueft, 2026-10-02)

Der Bericht oben ist im Kern richtig, in ZWEI Punkten aber falsch — beide haetten
den Fix teurer gemacht als noetig.

### Unabhaengig nachgemessen (nicht uebernommen)

Eigene Sonde, dieselben Zahlen wie der Agent:

    SERVER (erzeugeAutonomeKarte) wasserY   = 1103
    CLIENT (generateTerrain)     waterLevel = 1209
    abweichende Zellen: 1262018 von 3686400 = 34.23 %
    Wasserstand-Differenz: 106 Pixel

Seed 3367130477, 2560x1440, `MapSize.for('landscape')`.

### WIDERLEGT: „Protokolländerung erforderlich" — der Server SENDET kartentyp bereits

Der Bericht schliesst aus dem fehlenden `kartentyp` im `NetworkClient`-Konstruktor
auf eine noetige Protokollaenderung. Falsch. `kartentyp` geht sehr wohl ueber die
Leitung — an vier Stellen:

    src/server/gameServer.js:122   kartentyp: lobby.kartentyp ?? null
    src/server/gameServer.js:142   kartentyp: lobby.kartentyp ?? null
    src/server/gameServer.js:488   kartentyp: this.lobby.kartentyp ?? null   <- lobby_snapshot
    src/server/gameServer.js:533   kartentyp: this.lobby.kartentyp ?? null

Der Client BEKOMMT das Feld im `payload` und WIRFT ES WEG — die Ursache ist eine
Zeile, nicht das Protokoll:

    src/client/main.js:1084
      this.#buildRemoteTerrain(payload.seed, payload.preset ?? preset, payload.orientation ?? orientation);
      //                        payload.kartentyp wird hier nicht uebergeben

### WIDERLEGT: „Client hardcodet kartentyp"

`main.js:445` setzt `kartentyp = 'autonom'` fuer den EIGENEN Client, und `main.js:1059`
gibt es an den `NetworkClient`-Konstruktor weiter — der nimmt es nur nicht an
(`networkClient.js:163` kennt es nicht). Fuer das FREMDE Terrain gilt der hartkodierte
Wert ohnehin nicht: dort wird `payload` gelesen, und `payload.kartentyp` ist da.

### Der Fix ist bewiesen, nicht nur vorgeschlagen

Beide Karten ueber den SERVERPFAD gebaut (`baueTerrain`, `terrainBuilder.js:77`),
einmal mit `kartentyp: 'autonom'`, einmal ohne:

    heute (kartentyp faellt weg) vs. Fix (kartentyp durchgereicht):
      abweichende Zellen: 1262018 = 34.23 %
      Kontrolle (Fix zweimal gebaut, muss 0 sein): 0

Die Kette ist damit vollstaendig belegt: `kartentyp: 'autonom'` durchgereicht
ergibt **0 abweichende Zellen**. Und der Fix ist billiger als im Bericht steht:

1. `terrainPreview.js:22` — Signatur um `kartentyp = null` erweitern, bei
   `'autonom'` `erzeugeAutonomeKarte` statt `generateTerrain` (Muster und
   RNG-Fach `getSubRng('TERRAIN')` stehen in `terrainBuilder.js:87`).
2. `main.js:1179` `#buildRemoteTerrain` — Parameter ergaenzen.
3. `main.js:1084/1089` — `payload.kartentyp` mitgeben.

KEINE Protokollaenderung, kein Netzwerkumbau, kein Serverantasten.

### Berichtigung des eigenen Nachtrags

Der Satz oben, `terrainBuilder.js:46-51` dokumentiere `width`/`height` FALSCH, war
selbst falsch — nachgeprueft: `match.js:803-804` uebergibt genau `width`/`height`,
die Doku stimmt. Die Notiz stammte aus einer Sonde, deren Sonden-Kommentar ich fuer
Code hielt. Gestrichen, damit kein falscher Auftrag in der Queue stehen bleibt.
(Und es ist dieselbe Fehlerklasse wie die, die der Kommentar-Fix in fa42c70 im
Audit-Werkzeug behebt: ein Kommentar ist kein Leser.)

Ob `erzeugeAutonomeKarte` im Client ohne `events`/`statuses`/`world` (die der
Serverpfad mitgibt) vollstaendig deterministisch bleibt, ist NICHT geprueft.
