# ProjectArmageddon — Master TODO / Codeaudit

Stand: 2026-09-10 (zweiter Durchgang)
Branch: `main`

Diese Datei ist die **Single Source of Truth** für offene Arbeit. Alles, was hier
als erledigt markiert ist, wurde durch Tests oder echte Läufe belegt — nicht durch
Absichtserklärungen.

## Verifikationsstand

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Linting | `npm run lint` | grün, 0 Fehler |
| Unit-/Integrationstests | `npm test` | **175/175** |
| Browser-E2E | `npm run test:e2e` | **33/33** (System-Chrome) |
| Build | `npm run build` | grün |
| Validierung | `npm run validate` | grün |
| Performance | `npm run perf` | 18 000 Ticks, 0 über 16,7 ms, ~195× Echtzeit |
| Balance | `npm run balance` | 105 Waffen mit Schaden, 35 Selbstwirkungs-Waffen (alle wirksam), 10 ohne Wirkung |
| Replay | `npm run replay -- record` + `play --verify` | Zustandshash identisch |
| Lasttest | in `npm test` enthalten | 8 Clients / 4 Lobbys stabil |

## In diesem Durchgang gefundene und behobene Fehler

Alle folgenden Punkte waren echte Produktfehler, keine Testkosmetik. Sie wurden
durch Messungen oder fehlschlagende Tests aufgedeckt.

1. **Hitscan-Waffen richteten keinen Schaden an (76 von 150 Waffen).**
   Der Strahl begann exakt auf der Schützenposition. Das ist die Fußposition auf
   dem Boden, und das Trefferfeld reicht `±PLAYER_HALF_HEIGHT` darum — der Strahl
   endete deshalb sofort im eigenen Körper. Behoben durch einen Mündungspunkt auf
   halber Körperhöhe (`#findMuzzle`) und Ausschluss des Schützen aus dem
   Treffertest (`#playerAt(x, y, excludeId)`).

2. **Projektile verschwanden im ersten Simulationsschritt (74 Waffen).**
   Zwei Ursachen: Das Projektil entstand in der Bodenposition (im festen Terrain)
   und die Zielliste enthielt den Schützen selbst, sodass das Geschoss mit seinem
   Absender kollidierte. Behoben durch Mündungsversatz beim Erzeugen und
   Ausschluss des Eigentümers in `ProjectileSystem.update`.

3. **Waffenkatalog: alle Waffen hatten denselben Schaden (25).**
   Die Quelldatei führt zwei Feldfamilien. Die camelCase-Felder sind Platzhalter
   (`baseDamage` konstant 25, `blastRadius`/`terrainDamage`/`fuseTime` und alle
   Elementarschäden konstant 0, `projectileSpeed` konstant 70); die echten Werte
   stehen in snake_case. Der Generator bevorzugte den jeweils ersten positiven
   Wert und erwischte damit die Platzhalter. Behoben durch konsequente Priorität
   auf snake_case mit camelCase als Rückfall. Ergebnis: Schaden 0–110 statt
   konstant 25, 54 Waffen mit Flächenwirkung, 74 Projektile.

4. **Wasserphysik stapelte Wasser unbegrenzt und verlor bei Verdrängung Wasser.**
   `WaterField.step()` lief von oben nach unten, wodurch die Kapazitätsprüfung
   der Zelle darunter auf einem noch leeren Puffer lief — der Pegel erreichte
   10,3 statt maximal 1,0. Die Verdrängung sättigte ohne Kapazitätsprüfung und
   verlor dabei Menge. Beide behoben; die Massenerhaltung ist jetzt exakt und
   wird getestet.

5. **Matches konnten unbegrenzt laufen.**
   `maxRounds` wurde nie erzwungen. Ein Match ohne tödliche Treffer lief über
   20 000 Ticks und Runde 37 weiter. Behoben durch eine harte Rundengrenze im
   `#onRoundStart`; bei Überschreitung gewinnt das Team mit der meisten
   verbleibenden Gesundheit (deterministisch, kein Zufall).

6. **Delta-Encoding verglich skalierte gegen unskalierte Werte.**
   Der Encoder meldete dadurch jede Position als geändert, das Delta sparte
   nichts. Behoben durch den gemeinsamen Helfer `toDeltaBase()`; der Vergleich
   läuft jetzt auf den tatsächlich übertragenen Ganzzahlen.

7. **Replay lief ohne Tickgrenze endlos.**
   Ohne Eingaben endet ein Match nie; `playReplay` lief bis zum Notausstieg bei
   2 Mio. Ticks. Behoben durch `recorder.finalize(totalTicks)` und eine
   abgeleitete Standardgrenze.

8. **Ein Waffen-Icon fehlte.**
   `IMG_9049` war als Original vorhanden, aber nicht verarbeitet. Da ImageMagick
   auf diesem System fehlt, wurde der Pipelineschritt portabel als
   `scripts/create-weapon-icons.py` (Pillow) nachgebaut. Jetzt 150/150 Icons.

9. **Race Condition in den E2E-Tests.**
   Zwischen `startMatch` und dem Deaktivieren der Render-Schleife lief kurz die
   Schleife, wodurch der Zustand unbestimmt wurde. Behoben durch Deaktivieren
   vor dem Start.

10. **Tastatursteuerung griff auch in Formularfelder (Bedienfehler).**
    Beide keydown-Handler (Spielsteuerung und Neustart) hingen global am Fenster
    und prüften nicht, ob der Nutzer gerade tippt. Der Seed "2026" veränderte
    den Winkel, die Leertaste begann eine Ladung, und ein "r" im Serverfeld
    setzte das Match zurück. Behoben durch den gemeinsamen Helfer
    `isTextEntry()` (`src/client/dom.js`), der in beiden Handlern greift.
    Nachgewiesen per Gegenprobe: ohne die Sperre schlagen die E2E-Tests fehl.

11. **Fokusindikatoren und Tastaturbedienung fehlten.**
    Es gab kein `:focus-visible`-Styling; beim Tabben war nicht erkennbar,
    welches Element aktiv ist. Ergänzt: Fokusring, Skip-Link zum Spielfeld,
    fokussierbares Canvas mit Beschreibung und `[hidden]`-Ausblendung, damit
    verborgene Overlays keine Fokusziele liefern.

12. **Frisch angelegte Lobbys überlebten keinen Neustart.**
    Der Zustandsdump lief nur über die laufenden Sitzungen. Eine Lobby, der noch
    niemand beigetreten war, hat aber keine Sitzung — sie wurde in der
    Lobby-Liste angezeigt, war nach einem Neustart jedoch verschwunden. Behoben,
    indem über den Lobby-Manager gelaufen wird; Lobbys ohne Replay-Kern werden
    als Lobby wiederhergestellt und erhalten ihre Sitzung beim ersten Beitritt.
    Abgesichert in `tests/persistence-restart.test.js`.

13. **`totalTicks` blieb beim Speichern auf 0.**
    Die Aufzeichnung wurde vor dem Auslesen nicht abgeschlossen. Dadurch war ein
    gespieltes Match von einer leeren Lobby nicht zu unterscheiden und kam ohne
    Sitzung zurück. Behoben durch `finalize()` in `serializeLobby`.

14. **Die Gravitation der Quelldaten wurde als Multiplikator übernommen.**
    Die Quelldatei nennt für 26 Waffen einen `gravity`-Wert zwischen 62 und 92,
    wovon 19 exakt 65 haben — 65 ist der Bezugswert der Skala. Der Generator
    setzte ihn direkt als `gravityScale` ein, was die Fallbeschleunigung auf das
    65-fache hob (20,8 statt 0,32 px/Tick²). Das Geschoss schlug im nächsten Tick
    auf dem Boden auf; die Waffe war wirkungslos. Behoben durch Normalisierung auf
    den Bezugswert (`gravityScaleFor`, Bereich 0,95–1,42). Wirkung: 23 Waffen
    wurden auf einen Schlag funktionsfähig.

15. **52 Waffen trugen einen Platzhalter-Schadenswert als echten Wert.**
    Die Quelldatei enthält `base_damage` nur für 124 Waffen. Wo es fehlt, blieb
    nur der camelCase-Platzhalter mit dem konstanten Wert 25. Er wurde still
    übernommen und war damit von einem Designwert nicht zu unterscheiden. Jetzt
    wird die Herkunft mitgeführt (`damageSource`: `source`, `placeholder`,
    `none`) — 94 Waffen mit echtem Wert, 52 mit Platzhalter, 4 ohne Wert.

16. **25 Nutzwaffen hatten keine Wirkung.**
    Teleport, Jetfallschirm, Heilung, Schild und Munitionsnachschub waren im
    Katalog beschrieben, aber nicht implementiert: Diese Waffen verbrauchten
    Munition und beendeten den Zug, ohne etwas zu bewirken.

17. **`step()` leerte die Ereignis-Warteschlange — der Client sah nichts.**
    Der teuerste stille Fehler dieses Projekts. `MatchController.step()` rief
    `this.#events.drain()`, was die Warteschlange leert und die Ereignisse an die
    Push-Handler verteilt. Client und Server holen sie aber über
    `consumeEvents()` (Pull), und die Push-API wird im Projekt nirgends benutzt.
    Folge: Jedes Ereignis, das während der Simulation entstand, war beim Abholen
    bereits weg. Sichtbar wurde das als fehlende Explosionsgrafik im lokalen
    Spiel und — nach Einbau der Spezialeffekte — als Protokollzeile, die es nie
    geben konnte. Behoben durch Entfernen des `drain()`-Aufrufs; dazu eine
    Obergrenze für die Warteschlange, weil sie nun nicht mehr automatisch geleert
    wird. Nachgewiesen per Gegenprobe (drei Tests fallen ohne den Fix) und per
    Pixelmessung am Einschlagpunkt (26 Partikel, Krater gesetzt).

18. **Kein Test prüfte, ob der Konsument die Ereignisse tatsächlich sieht.**
    Alle bestehenden Tests prüften den Match-Zustand, nicht den Ereignisstrom —
    deshalb blieb Fehler 17 unbemerkt. `tests/events.test.js` modelliert jetzt den
    echten Ablauf (feuern, einen Schritt ausführen, DANN lesen).

Zusätzlich beim Bau der Betriebszähler aufgefallen und behoben: Der Zähler für
abgelehnte Kommandos saß zunächst nur am Ende von `handleInput`. Die frühen
Ablehnungen (falscher Platz, ungültiger Winkel, Tick außerhalb des Fensters)
blieben dadurch ungezählt, was einen falschen Eindruck erzeugt hätte. Jetzt
zählt eine Hülle um die Methode jeden Ausgang.

## Umgesetzt

### Engine
- Deterministischer Kern (PRNG, Seed-Verwaltung), ECS mit Typed-Arrays,
  Headless-Runtime mit fester Zeitschrittweite.
- `MatchController`: Terrain, Wasser, Systeme, Runden-, Zug- und Sieglogik,
  Rundengrenze mit Sieger nach Restgesundheit.
- Projektil- und Hitscan-Pfad mit korrektem Mündungspunkt; CCD-gesicherter
  Flug ohne Tunneling; Krater, Flächenschaden mit Distanzabfall, Knockback.
- Wasser: deterministischer Zellfluss mit Massenerhaltung, Verdrängung durch
  Explosionen, Ertrinken untergetauchter Figuren.
- Replay: Aufzeichnung als Seed + Eingabeliste, exakte Wiedergabe
  (`stateHash`-identisch), Vorspulen bis zu einem Tick.

### Multiplayer
- Autoritativer Server mit HTTP-Lobby-API und WebSocket.
- Binärprotokoll v2 mit `DataView` (läuft in Node **und** Browser),
  Delta-Encoding pro Client plus periodischem Vollsnapshot als Resync.
- Restzugzeit wird übertragen (vorher fror die Anzeige im Online-Modus ein).
- Lobby-Verwaltung mit Reconnect-Token, 200 ms Lag-Kompensation, Bot-KI,
  serverseitige Eingabevalidierung.
- Lasttest: 8 gleichzeitige Clients über 4 Lobbys ohne Verbindungsverlust.

### Persistenz
- `PersistenceStore` schreibt atomar (temp + rename), übersteht beschädigte
  Dateien und lehnt fremde Versionen ab.
- Serverzustand wird als Replay-Kern gespeichert; nach einem Neustart werden
  Matches durch erneutes Anwenden der Eingaben rekonstruiert.

### Client
- Vite-Build, HUD, Menü, Renderer (Terrain, Wasser, Figuren, Zielvorschau,
  Partikel, Windpfeil, Mahlstrom-Zone).
- Hitscan-Strahl und Explosionsblitz sichtbar; Explosionsradius-Vorschau am
  Zielpunkt; Munitionsanzeige aktualisiert sich sofort nach dem Schuss.
- Waffenliste mit Logos aus `assets/weapons/icons` und Farbcodierung nach
  abgeleiteter Stufe.
- Lokaler und Online-Modus mit Snapshot-Interpolation und Reconnect-Backoff.

### Spezialeffekte
- Datengetriebenes System (`src/engine/specials.js`): 60 Katalognamen werden auf
  9 normalisierte Wirkungen abgebildet (Heilung, Schild, Schadensbonus, Rüstung,
  Einfrieren, Schaden über Zeit, Munition, Bewegung, Heranziehen). Unbekannte
  Namen bleiben ohne Wirkung, statt einen Fehler zu werfen.
- Selbstwirkende Waffen lösen ihren Effekt beim Abfeuern aus und verschießen
  bewusst kein Geschoss — ein Projektil, das nur den eigenen Effekt auslöst,
  wäre im Spiel irreführend.
- Zieleffekte (Einfrieren, Schaden über Zeit, Heranziehen) wirken nur auf
  Gegner; bei Flächenwirkung auf alle Gegner im Radius.
- **Dauern zählen in Zügen, nicht in Millisekunden** — deterministisch,
  unabhängig von der Zugzeit und in Replays stabil.
- Der „Würfel des Chaos" wählt seine Wirkung über den Match-Zufallsgenerator,
  nicht über `Math.random()`: Bei gleichem Seed dieselbe Folge, per Test belegt.
- Schild und Rüstung greifen im DamageSystem über einen Modifikator, damit sie
  auch bei Flächenschaden wirken — dort verteilt der Radius den Schaden.
- Protokoll v3 überträgt Schild und Einfrierdauer (2 Byte je Spieler), damit die
  Anzeige auch im Online-Modus stimmt.

### Werkzeuge
- `npm run lint` / `lint:fix` — ESLint, als CI-Gate nutzbar.
- `npm run balance` — Balance-Bericht über alle 150 Waffen.
- `npm run perf` — Performance-Profil mit Budget-Gate.
- `npm run replay` — Aufzeichnen, Abspielen, `--verify`.
- `npm run icons` — Icon-Pipeline (Pillow, ohne ImageMagick).
- `scripts/verify-explosion-render.mjs` — Pixelprüfung, dass Einschläge
  tatsächlich gezeichnet werden (findet Fehler, die kein Unit-Test sieht).
- `npm run weapons:build` — Kataloggenerator mit dokumentierter Stufenableitung.
- CI: Lint → Tests → Build → Performance-Budget, danach E2E.

## Testabdeckung

- **Unit/Integration (175):** PRNG und Seeds, Loot, Terrain, Wasser und
  Ertrinken, Ballistik und Tunneling, Munition, Matchregeln, Rundengrenze,
  Zugzeit und Zugwechsel, Replay und Determinismus, Netcode und
  Delta-Encoding, Lobby und Servervalidierung, Persistenz, Betriebszähler,
  Waffenkatalog und Icon-Zuordnung, Lasttest mit 8 Clients, DOM-Helfer sowie
  Neustart mit Persistenz (Lobby ohne Sitzung und gespieltes Match),
  Spezialeffekte (24 Tests über Registry, StatusStore, Wirkung im Spiel,
  Zustandswirkungen und Determinismus), Ereignisweitergabe an den Konsumenten
  (7 Tests, inklusive Gegenprobe).

Details zu den Spezialeffekten: `src/engine/specials.js`.
- **Browser-E2E (33):** Laufzeit-Smoke (Menü, Matchstart, HUD, Zielvorschau,
  Schuss, Spielende, Determinismus, Terrainzerstörung), Multiplayer mit zwei
  Browsern und Reconnect, Latenzmessung, Lobby-Browser gegen einen echten
  Server, Tastatur- und Fokusverhalten, Spezialeffekte im Browser (7 Tests:
  Heilung im Protokoll, Schildmarke, Einfrieren, Schaden über Zeit,
  Selbstwirkung ohne Projektil, Lauffähigkeit nach allen Effekten,
  Determinismus).

## Einstufung der Waffen

Die Quelldaten kennen nur `common`, `uncommon` und `rare`. `epic` und
`legendary` werden **nicht erfunden**, sondern deterministisch aus den
Waffenwerten abgeleitet (`computePowerScore` in
`scripts/build-weapon-catalog.mjs`, Schwellen in `POWER_TIERS`). Die Zuordnung
ist eine reine Funktion der Statistik und wird getestet. Verteilung:
common 70, uncommon 21, rare 41, epic 13, legendary 5.

## Offene Arbeit

### P1 — Gameplay-Vertiefung
- [x] Spezialmechaniken implementiert: Heilung, Schild, Schadensbonus, Rüstung,
      Einfrieren, Schaden über Zeit, Munitionsnachschub, Bewegung, Heranziehen.
      35 Waffen wirken dadurch nachweislich (per Test belegt). Offen bleiben
      einzelne Mechaniken: aufgestelltes Geschütz (Auto-Turret), Wasserschub
      (Wasserblaster).
- [ ] Balance über die volle Kartenbreite messen (aktuell 90 px; schwere
      Artillerie wird dadurch unterschätzt).
- [x] Zustände im HUD: Schild, Einfrieren, Schaden über Zeit und Schadensbonus
      erscheinen als Marken in der Spielerliste, mit Erläuterung beim Überfahren.
- [ ] Ertrinken und Wasserverdrängung im HUD anzeigen.

### P1 — Netcode
- [x] Server-autoritative Zugzeit. Geprüft: Der Zug wechselt nach Ablauf der
      Zugzeit auch ohne Schuss (sechs Wechsel ohne einen einzigen Schuss);
      abgesichert in `tests/turn.test.js`. Der frühere TODO-Eintrag war falsch —
      die Zeitmessung lief bereits serverseitig.
- [ ] Client-seitige Prädiktion des eigenen Schusses mit Server-Rollback.
      Aktuell fühlt sich der eigene Schuss bei Latenz verzögert an.
- [ ] Snapshot-Kompression prüfen (Delta läuft, Quantisierung ist schon aktiv).

### P2 — Client & UX
- [x] Lobby-Browser im Menü (offene Lobbys listen und beitreten).
- [x] Kartenwahl im Menü (Presets: hills, mountains, islands, caverns).
- [x] Latenz-Anzeige per Ping-Intervall (2 s, mit Messung echter RTT).
- [x] Tastatur-Fokusreihenfolge und Fokusindikatoren inkl. Skip-Link.
- [x] Tastatursteuerung greift nicht mehr in Formularfelder ein.
- [ ] Entwurfsphase (Draft) für 4–6 Einheiten pro Team.
- [ ] Accessibility vertiefen: Screenreader-Durchlauf, `prefers-reduced-motion`.
- [ ] Optionale WebGPU-Pipeline mit Canvas-2D-Rückfall.

### P3 — Betrieb
- [x] Betriebszähler und erweiterte Zustandsabfrage. `/healthz` liefert
      Verbindungen, Trennungen, gesendete Snapshots, angenommene und abgelehnte
      Kommandos, Fehler, Lobby-Erstellungen, Uptime sowie einen
      `healthy`-Schalter für verwaiste Sitzungen. Abgesichert in
      `tests/metrics.test.js`.
- [x] `dist/` wird in der CI als Artefakt abgelegt (14 Tage Aufbewahrung).
- [ ] Lasttest mit künstlicher Latenz und Paketverlust.
- [ ] Replay im Client abspielen (Server hat das Werkzeug bereits).
- [ ] Strukturierte Logs (JSON) statt Freitext im Server.

## Bekannte Grenzen (bewusst dokumentiert)

- **Balance-Bericht bei 90 px.** Schwere Artillerie und Ultimate-Waffen sind für
  große Entfernungen gebaut und erscheinen in der Messung als wirkungslos. Das
  ist eine Grenze des Aufbaus, kein Urteil über die Waffe.
- **Keine Client-Prädiktion.** Bei Latenz weicht der eigene Schuss sichtbar vom
  Serverergebnis ab.
- **Zugzeit wird clientseitig geführt.** Ein manipulierender Client könnte die
  Anzeige verfälschen; die Simulation bleibt serverseitig autoritativ.
- **Persistenz ist dateibasiert.** Für mehrere Serverinstanzen wäre ein
  gemeinsamer Speicher nötig.
- **Kein Audio.**
