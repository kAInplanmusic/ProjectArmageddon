# Hunter UI — HUD, Waffen-Auswahl und Ereignis-Handling

**Auftrag:** Hunter-Agent #2 (UI/HUD/Waffen-Auswahl/Event-Handling), O2-Lücke
bearbeiten. **Stand:** 2026-09-27. **Belege:** `datei:zeile`, gemessen, nicht
geschätzt (Zählung per Node über `EREIGNIS_WIRKUNGEN`, Laufprotokoll unten).

Gelesene Dateien (vollständig): `src/client/ereignisse.js` (655 Zeilen),
`src/client/hud.js` (530), `src/client/roster.js` (73), `src/client/renderer.js`
(1255). Ergänzend belegt: `src/client/main.js`, `src/server/gameServer.js`,
`src/client/networkClient.js`, `tests/event-coverage.test.js`.

> **NACHTRAG 2026-09-27 (Worker C, Auftrag „O8-Nachzug").** Dieser Bericht
> beschreibt den **Vor-O8-Stand**. O8 ist inzwischen umgesetzt (Commit `68f551c`,
> „feat(O8,O9): Online-Sprung und Waffe-Abwerfen ueber den Drahtweg"): das
> Protokoll kennt `CONTROL.JUMP`/`CONTROL.DROP_WEAPON`
> (`src/shared/protocol.js:93-94`), der Server hat die Handler `handleJump`
> (`src/server/gameServer.js:517`, Verteiler `:1295`) und `handleDropWeapon`
> (`:570`, Verteiler `:1303`), der Client sendet über `sendJump`/`sendDropWeapon`
> (`src/client/networkClient.js:463`/`:479`, die `send`-Zeilen darin `:465`/`:481`).
>
> Die davon betroffenen Sätze sind unten **an Ort und Stelle** richtiggestellt
> und mit `[O8, nachgezogen 2026-09-27]` markiert; die alten Formulierungen
> stehen als Zitat daneben (Projektkonvention: richtigstellen statt löschen).
> **Alles andere in dieser Datei ist gegen den heutigen Baum geprüft und
> unverändert gültig** — die geprüften und die geänderten Stellen sind einzeln
> aufgeführt in `docs/hunter-doku-nachzug.md`, Abschnitt `hunter-ui.md`.

---

## 0. Ergebnis in drei Sätzen

Die O2-Lücke ist **geschlossen**: die vier Engine-Ereignisse `crate_pickup`,
`landed`, `fall_damage` und `toxic_rain` haben jetzt einen `online:`-Zweig in
`src/client/ereignisse.js` und werden online nicht mehr still verworfen. Der
Wächter in `tests/event-coverage.test.js` ist mitgezogen (die vier sind keine
Einzweig-Fälle mehr). Vorher standen sie genau dort als „einzweigig belegt" —
d. h. die Lücke war **dokumentiert, aber nicht behoben**.

---

## 1. Die vier Ereignisse, die online keinen Spieler erreichten (O2)

Alle vier hatten in `EREIGNIS_WIRKUNGEN` **nur** `lokal:` — kein `online:`.
Dispatch ist optional-verkettet (`?.`), ein fehlender Zweig ist damit ein
lautloser No-Op.

| Ereignis | Eintrag | `lokal:`-Rumpf (vorher) | `online:` (vorher) | Emittiert in |
|---|---|---|---|---|
| `landed` | `ereignisse.js:430` | `:431-433` | **fehlte** | `src/engine/match.js:1351` |
| `crate_pickup` | `ereignisse.js:472` | `:473-482` | **fehlte** | `src/engine/systems/lootSystem.js:198` |
| `fall_damage` | `ereignisse.js:537` | `:538-540` | **fehlte** | `src/engine/systems/characterSystem.js:122` |
| `toxic_rain` | `ereignisse.js:547` | `:548-550` | **fehlte** | `src/engine/systems/maelstromSystem.js:96` |

*(Zeilennummern: Stand VOR der Korrektur. Nach der Korrektur:
`landed:439`, `crate_pickup:488`, `fall_damage:570`, `toxic_rain:585`.
**Nachtrag 2026-09-27:** die O8-Einfügungen (Kommentare + Eintrag
`weapon_dropped`) haben die Tabelle erneut verschoben — gemessen heute:
`jumped:437`, `landed:450`, `crate_landed:454`, `weapon_dropped:472`,
`crate_pickup_blocked:492`, `crate_pickup:506`, `drowning:553`,
`fall_damage:588`, `toxic_rain:603`, `karte_unerreichbar:644`.)*

**Warum sie ankommen — die Kette ist lückenlos bis zur Wirkung:**

1. Der Server führt denselben Motor und schickt **jedes** Engine-Ereignis ohne
   Whitelist raus: `src/server/gameServer.js:246-248`
   ```js
   for (const event of this.match.consumeEvents()) {
     this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
   }
   ```
2. Der Client reicht jede unbekannte Steuernachricht weiter:
   `src/client/networkClient.js:396-398` (`default:` → `#emit('game_event', …)`).
3. `main.js` hängt `game_event` an `#handleRemoteEvent`:
   `src/client/main.js:994` → `:1179-1181` → `verarbeiteOnline`.
4. Der Dispatch liest **nur** `.online`: `src/client/ereignisse.js:653-654`
   ```js
   EREIGNIS_WIRKUNGEN[nachricht.t]?.online?.(kontext, nachricht);
   ```
   Ein fehlender `online:`-Zweig ist `undefined` → `?.()` tut nicht.

**Sichtbare Folge des Fehlers:** online nahm niemand eine Kiste auf (kein
Protokolleintrag), die Landung blieb ohne Meldung, und `fall_damage`/
`toxic_rain` ließen den Lebensbalken **unerklärt** sinken — der Spieler sah
Schaden, aber keinen Grund.

### Behebung (jetzt im Baum)

- `landed`, `fall_damage`, `toxic_rain` → `beide(fn)` (Text und Wirkung sind in
  beiden Betriebsarten identisch; `k.nameOf` liest lokal aus `match.getState()`,
  online aus dem Snapshot — beide führen den Namen, `src/client/main.js:1408-1412`).
- `crate_pickup` → eigener `online:`-Zweig: der lokale Rumpf liest den Namen aus
  `k.match.players` (`ereignisse.js`, lokaler Zweig), **online ist `k.match` null**
  (`src/client/ereignisse.js`-Kontext `match: this.match`, `main.js:1380`).
  Der Online-Zweig benutzt deshalb `k.nameOf(n.playerId)`.

**Verifikation:** Node-Zählung über die Tabelle (ausgeführt im Repo):

| Stand | nur-lokal | nur-online | kein Zweig | beide |
|---|---|---|---|---|
| vorher | `jumped, landed, crate_landed, crate_pickup, fall_damage, toxic_rain` (6) | 4 | `drowning` | 27 |
| nachher | `jumped, crate_landed` (2) | 4 | `drowning` | **31** |
| heute `[O8, nachgezogen 2026-09-27]` | `crate_landed` (1) | 5 | `drowning` | **32** — 39 Einträge gesamt |

`node --test tests/event-coverage.test.js` → **9/9 grün** (u. a. „Ereignisse mit
nur EINEM Zweig sind einzeln belegt").
`npm test` (voller Unit-Lauf) → **1063/1063 grün, 0 fail** (`duration_ms 368778`).

---

## 2. Was passiert online, wenn ein Client `landed` empfaengt?

**Nichts.** `EREIGNIS_WIRKUNGEN['landed']` war `{ lokal: (k,n) => … }`
(`ereignisse.js:430-434`) — ohne `online`-Feld. Der Online-Dispatch
`verarbeiteOnline` (`:653-654`) greift ausschließlich auf `.online` zu;
`undefined?.()` ist ein No-Op. Es gibt **keinen** zweiten Pfad: `landed` wird
nirgends sonst ausgewertet (`grep` über `src/` findet nur Emitter und den
Tabelleneintrag). Die Landung war online damit weder im Protokoll (`#log-list`)
noch als Effekt sichtbar — nur als Bewegung der interpolierten Figur im Canvas
(`renderer.js:1217 #drawEntities`). Nach der Korrektur protokolliert
`beide(fn)` die Zeile „<Name> ist gelandet" in beiden Betriebsarten.

---

## 3. Wie ist die Waffen-Auswahl implementiert?

Zwei Schichten, sauber getrennt: **HUD baut und meldet**, `main.js` **übersetzt
und wendet an**.

### 3a. Darstellung und Eingabe (`src/client/hud.js`)

- `Hud#update` ruft `#renderWeapons(state, onWeaponSelect)` — `hud.js:90-111`,
  Aufruf `:111`.
- `#renderWeapons` (`:271-357`) nimmt das Inventar des **aktiven** Spielers
  (`:275-276`), bildet eine Signatur aus Inventar + aktiver Waffe + Munition +
  Nachladezeiten (`:279-284`, verhindert Neuaufbau bei unverändertem Zustand) und
  ordnet über `orderInventoryBySubcategory` (`:304`).
- Gliederung in Gruppen entsteht **aus der Reihenfolge selbst** (`:324-336`,
  Kommentar `:307-323`: verhindert die früher falsche Nummerierung 1,2,3,5,4).
- `#buildWeaponItem` (`:360-489`) baut eine Zeile und macht sie bedienbar:
  - Maus: `item.addEventListener('click', () => onWeaponSelect?.(index))` — `:473`
  - Tastatur: `keydown` auf `Enter`/`' '`/`Spacebar` mit `preventDefault()` +
    **`stopPropagation()`** — `:482-487`. Die Sperre ist notwendig, weil die
    Leertaste global am Fenster am Feuern hängt (`input.js`); ohne sie würde ein
    Tastendruck auf einer Zeile gleichzeitig auswählen **und** schießen
    (Kommentar `:474-481`).
  - Zugänglichkeit: `role="button"`, `tabIndex=0`, `aria-label`, `aria-current`
    — `:382-385`.
  - Fokus-Erhalt über `replaceChildren`: `:298` merkt die fokussierte Waffe,
    `:353-356` setzt den Fokus auf dieselbe Waffe zurück.

### 3b. Übersetzung und Anwendung (`src/client/main.js`)

- Der Rückruf landet bei `Main#selectWeapon` — verdrahtet an drei Stellen:
  `main.js:176` (InputController/Zifferntasten), `:839` und `:2011`
  (`hud.update(..., { onWeaponSelect })`).
- `#inventoryIndexAt(anzeigePosition)` (`:1217-1223`) übersetzt die
  **Anzeige-Nummer** in den Inventar-Index — dieselbe Ordnungsfunktion wie die
  Liste. Nötig, weil Anzeige (nach Gruppen) und Inventarreihenfolge abweichen.
- `#activeDisplayPosition()` (`:1190-1205`) macht die Gegenrichtung (für Q).
- `#weaponIdsForActivePlayer()` (`:1226-1234`) liest je Betriebsart:
  online aus `onlineViewState.entities[…].inventory`, lokal aus
  `match.inventory.getWeapons(...)`.
- `Main#selectWeapon(anzeigePosition)` (`:1245-1279`):
  - **online** (`:1250-1270`): nur am **eigenen** Zug (`network.isMyTurn`,
    sonst Meldung `:1255`), schickt `network.selectWeapon(weaponId)`, protokolliert
    die Wahl. Der Server bestätigt über den Snapshot.
  - **lokal** (`:1271-1278`): `match.inventory.selectWeapon(playerId, weaponId)`.
- Abwerfen (Q) wirkt **in beiden Betriebsarten** `[O8, nachgezogen 2026-09-27]`.
  Der Vor-O8-Satz lautete: „Abwerfen (Q) ist **lokal-only**: `dropWeapon`
  (`:817-841`) steigt online vorzeitig aus (`:818`, Meldung `:819`); es gibt
  keinen Online-Aufrufer." Heute hat `dropWeapon` (`main.js:838`) einen
  Online-Zweig (`:847`), ruft `sendDropWeapon` (`:862` →
  `networkClient.js:479`), der `CONTROL.DROP_WEAPON` sendet (`protocol.js:94`);
  der Server führt ihn in `handleDropWeapon` (`gameServer.js:570`, Verteiler
  `:1303`) aus. Die Rückmeldung online kommt aus dem Ereignis
  `weapon_dropped` (`ereignisse.js:472`), NICHT aus `main.js`.

---

## 4. `bewusstStumm` — welche Ereignisse sind bewusst still?

Definition und Liste stehen in `tests/event-coverage.test.js:184-213`
(Menge `bewusstStumm`, **12 Namen** `[O8, nachgezogen 2026-09-27]`; vor O8 waren
es 13 — `weapon_dropped` ist entfernt, siehe Tabelle unten). Bedeutung ist eng: „Der Spieler sieht von
diesem Ereignis NICHTS; der sichtbare Effekt entsteht über ein anderes Element."

| Eintrag | Begründung (Kurzform) | Zeile |
|---|---|---|
| `turn_start` | Rundenanzeige im HUD | `:186` |
| `turn_end` | dito + Zugwechsel im Spielerfeld | `:187` |
| `entity_in_water` | Wasserstand als Marke am Namen | `:188` |
| `damage` | Lebensbalken sinkt sichtbar | `:189` |
| `dot_applied` | Zustandsmarke am Namen | `:190` |
| `shot` | löst die Vorhersage auf (`shotPredictor.resolve`) | `:193` |
| `weapon_cooldown` | Waffenliste zeigt den Nachladezustand | `:194` |
| ~~`weapon_dropped`~~ | **NICHT MEHR IN DER MENGE** `[O8, nachgezogen 2026-09-27]`. Vor O8: „`dropWeapon()` meldet das Ergebnis direkt" (`:195`) — diese Begründung gilt nur LOKAL; seit O8 wirft man auch online ab, dort meldet kein lokaler `dropWeapon()`-Pfad, und das Ereignis hat einen `online`-Zweig (`ereignisse.js:472`). In dieser Menge bedeutet ein Eintrag „es gibt KEINEN Zweig" | — (Vor-O8-Stand) |
| `crate_landed` | lokaler Zweig hat einen Fall; online übernimmt es die Kistenliste | `:196-197` |
| `drowning` | bis 60×/s → nur beim ÜBERGANG gemeldet (`#trackWater`) | `:200` |
| `round_crates` | Buchführung; Anzahl steht im HUD | `:201` |
| `projectile_expired` | ein verfallenes Geschoss ist kein Spielerereignis | `:202-203` |
| `water_pushed` | Wasserstand am Ziel ist die sichtbare Wirkung | `:204` |

**Zusätzlich und unabhängig davon:** der **einzige** Tabelleneintrag ganz ohne
Zweig ist `drowning: {}` (heute `src/client/ereignisse.js:553`
`[O8, nachgezogen 2026-09-27]`; vor den O8-Einfügungen `:535`, Begründung im
Kommentar darüber): Das CharacterSystem meldet es bei **jedem**
Simulationsschritt (bis 60/s). Ein Eintrag steht trotzdem da, damit sichtbar
ist, dass die Stille **entschieden** und nicht vergessen wurde.
`drowning` ist zugleich in `bewusstStumm` (`:200`) — die zweite Absicherung.

> Hinweis zur Zählung: Der Kommentar `tests/event-coverage.test.js:229-230`
> nennt „8 bewusst stumm" von 47 emittierten Arten. Die **Menge** hat aber
> **12** Einträge `[O8, nachgezogen 2026-09-27]` (13 vor O8; `weapon_dropped`
> fiel heraus, weil es einen `online`-Zweig bekam); die „8" beziehen sich auf die Schnittmenge mit den 47 tatsächlich
> emittierten Arten, nicht auf die Listengröße. Kein Widerspruch, aber zwei
> verschiedene Zahlen für zwei verschiedene Dinge — hier festgehalten, damit
> die nächste Zählung nicht stolpert.

---

## 5. `main.js` zwischen lokal/online — ist das getrennt?

**Ja, an einer einzigen Naht.** Betriebsart steht in `this.mode`
(`main.js:109`, Werte `'local'` / `'online'` / `'replay'`). Es gibt **zwei
Einstiege in dieselbe Zuordnungstabelle**, und sonst keinen Ort, der
Ereignisarten auf Wirkungen abbildet:

| | lokal | online |
|---|---|---|
| Einstieg | `#handleEvents` `:1356-1359` | `#handleRemoteEvent` `:1179-1181` |
| Ruft | `verarbeiteLokal` | `verarbeiteOnline` |
| Liest | `…?.lokal?.()` | `…?.online?.()` |
| Dispatch | `ereignisse.js:643-644` | `ereignisse.js:653-654` |

- Der gemeinsame Kontext wird von `#ereignisKontext()` (`:1375-1405`) gebaut —
  lokal einmal je Ereignisfolge (`:1357`), online je Servermeldung. Er enthält
  u. a. `match` (= `null` online) und `nameOf` (`:1408-1412`).
- **Warum EINE Tabelle:** die Datei entstand, weil zwei getrennte Schalter
  (`#handleEvents` / `#handleRemoteEvent`) bereits auseinandergelaufen waren —
  `projectile_impact` fehlte lokal (Kopfkommentar `ereignisse.js:4-11`). Die
  Betriebsart ist am Eintrag **ablesbar** (`beide(fn)` / `lokal:` / `online:`),
  nicht zu erraten.

Weitere funktionale Trennpunkte (alle in `main.js`, nicht in `renderer.js` —
der Renderer kennt keine Betriebsart, er zeichnet nur den übergebenen Zustand):

- `currentState()`: online `onlineViewState`, sonst `match?.getState()` — `:1039`.
- `step()` läuft **nur** lokal (`:1335`); online ist der Server autoritativ.
- `#render()`: `myTurn`, `aimPreview` (nur lokal), `prediction` (nur online),
  `water` (online `null`) — `:1961-2013`.
- `fire()`: online `network.sendInput` + Sofort-Vorhersage (`:1292-1305`),
  lokal `match.fire` (`:1324`).
- `jump()` (`:794`) und `dropWeapon()` (`:838`) **sind nicht mehr lokal-only**
  `[O8, nachgezogen 2026-09-27]`. Der Vor-O8-Satz lautete: „`jump()` (`:793-806`)
  und `dropWeapon()` (`:817-841`) sind lokal-only; online steigen sie mit eigener
  Meldung aus." Heute: `jump` hat den Online-Zweig `:803` → `sendJump` `:812`
  (`networkClient.js:463`), `dropWeapon` den Zweig `:847` → `:862`. Online
  **meldet der Client selbst nicht** — die genau einmalige Rückmeldung kommt aus
  den Ereignissen (`jumped` `ereignisse.js:437`, `weapon_dropped` `:472`).

**Fazit:** Darstellung (Renderer/HUD) ist betriebsart-agnostisch und liest
ausschließlich den Zustand; die Unterscheidung lokal/online **existiert genau
einmal**, in `main.js` (Steuerung) plus der Ereignistabelle `ereignisse.js`
(Wirkungen). Das ist die gewollte, dokumentierte Naht — kein zweiter Schalter.

---

## 6. Nebenfund (belegt, nicht behoben): veraltete Zeilennummern in `tests/event-coverage.test.js`

Die `AUDIT_LISTE_2026_09_26` (`tests/event-coverage.test.js:238-266`) nennt je
Ereignis „ereignisse.js:<Zeile>" als Fundstelle. Diese Nummern sind **stale** —
die Tabelle ist seither gewachsen (jetzt 655 Zeilen), die Zitate zeigen nicht
mehr auf die Einträge:

| Ereignis | Zitat im Test | tatsächlich (vor meiner Änderung) |
|---|---|---|
| `crate_pickup` | `:424` | `:472` |
| `fall_damage` | `:489` | `:537` |
| `toxic_rain` | `:499` | `:547` |
| `landed` | `:405` | `:430` |
| `jumped` | `:399` | `:424` |
| `match_over` | `:505` | `:553` |
| `karte_unerreichbar` | `:542` | `:590` |

Der Test prüft nur die **Namen**, nie die Zeilen — die Zitate sind reine
Kommentare und veralten still. **Empfehlung:** die `<Zeile>`-Angaben aus den
Kommentaren entfernen (oder aus der Tabelle ableiten), statt sie zu pflegen;
ein Beleg, der nicht geprüft wird, ist eine Behauptung. Der Kern der Liste
(27 Namen, alle mit Zweig) bleibt korrekt und ist grün.

---

## Anhang — geänderte Dateien

- `src/client/ereignisse.js`: `landed` (`:439`), `fall_damage` (`:570`),
  `toxic_rain` (`:585`) → `beide(fn)`; `crate_pickup` (`:488`) → eigener
  `online:`-Zweig (nutzt `k.nameOf` statt `k.match.players`).
- `tests/event-coverage.test.js`: `EINZWEIG_BELEGT` — die vier
  nachgezogenen Ereignisse entfernt (`jumped` und `crate_landed` bleiben),
  Kopfkommentar um den O2-Nachtrag ergänzt.

**Grün:** `node --test tests/event-coverage.test.js` → 9/9.
`npm test` → 1063/1063, 0 fail.
