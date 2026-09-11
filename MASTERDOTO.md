# ProjectArmageddon — Master TODO / Codeaudit

Stand: 2026-09-11
Branch: `main`

Diese Datei ist die **Single Source of Truth** für offene Arbeit. Alles, was hier
als erledigt markiert ist, wurde durch Tests oder echte Läufe belegt — nicht durch
Absichtserklärungen.

> **Zusammengeführt am 2026-09-11.** Die frühere `todo.md` beanspruchte denselben
> Rang und war zuletzt am 2026-09-08 gegen `main` @ `0615d59` geprüft — seither
> waren über 30 Commits dazwischen. Sie führte als offen, was längst läuft: PRNG
> und Seed-Verwaltung, WebSocket-Server, Lobby, Bot, Lag Compensation,
> Zugzeit-Steuerung, Wind, Hitscan-Pfad, Fallschaden, Wasser, Mahlstrom. Sie wurde
> gelöscht; ihre noch offenen Punkte stehen unten unter
> **„Übernommen aus der alten todo.md"**. Maßgeblich ist allein diese Datei.

## Verifikationsstand

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Linting | `npm run lint` | grün, 0 Fehler |
| Unit-/Integrationstests | `npm test` | **457/457** |
| Browser-E2E | `npm run test:e2e` | **89/89** (System-Chrome) |
| Build | `npm run build` | grün |
| Validierung | `npm run validate` | grün |
| Performance | `npm run perf` | 0 Ticks über 16,7 ms, ~162× Echtzeit |
| Balance | `npm run balance` | Auf Startentfernung 426 px: 115 Waffen mit Schaden am Ziel, 35 Selbstwirkungs-Waffen (alle wirksam), **0 ohne jede Wirkung**. Über sieben Entfernungen (`npm run balance:sweep`): 30 Waffen nur Nahbereich, 89 auch ab 550 px |
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

## Fortsetzung 2026-09-11 — Klassen, Wasser und zwei schwere Fehler

Dieser Durchgang begann mit den offenen Punkten aus der Bestandsprüfung. Er hat
zwei Fehler aufgedeckt, die es in sich haben: einen, der jeden Kisten- Abwurf
unbrauchbar machte, und einen, der ein Match **nie enden ließ**.

### Behobene Fehler

26. **Gelandete Kisten sanken durch das Gelände.**
    Die generische Physik (`PhysicsSystem`, Signatur `POSITION | VELOCITY`) zog
    **jede** Kiste nach unten — eine Kiste hat weder Projektil- noch
    Gesundheitskomponente und fiel deshalb durch das Raster der Ausnahmen. Eine
    gelandete Kiste bekam erneut Schwerkraft und verschwand: bei 720 px
    Kartenhöhe stand sie nach 480 Schritten auf **y ≈ 10 558**. Betroffen waren
    alle Kisten — der abgeworfene Vorrat und die Rundenkisten.
    Zweite Folge: Die Dämpfung „über Wasser nicht untergehen" in `#stepCrate`
    (dort wird `vy` auf 0,4 begrenzt) wurde im nächsten Schritt überschrieben —
    die Kiste sank gerade dort, wo sie schwimmen sollte.
    Behoben mit `if (world.hasComponent(entityId, 'Crate')) continue;`.
    Nachgewiesen: gelandete Kiste bleibt liegen, verlässt die Karte nicht.

27. **Ein Match endete nie durch Ausschaltung (wiederverwendete Entity-IDs).**
    Der schwerste Fund bisher. Das ECS vergibt die IDs entfernter Entities neu.
    Starb eine Figur, erbte eine neu erzeugte Kiste oder ein Geschoss ihren
    Platz — und damit ihre ID. Die Siegprüfung fragte aber
    `world.isActive(entry.entityId)` und hielt die gefallene Figur deshalb für
    lebendig, weil unter derselben ID wieder etwas lag.
    Nachgestellt (Seed 5150): **alle vier Figuren gefallen, Status weiterhin
    „playing", Runde 8** — das Match lief bis zur Rundengrenze (30) weiter.
    Mitzählig: Die Anzeige meldete tote Figuren als lebendig mit 0 Leben, die
    Auszählung nach Restgesundheit schrieb einem Toten seine Gesundheit wieder
    zu, und Zugfolge wie Kommandoprüfung konnten einen Gefallenen für aktiv
    halten.
    Behoben, indem der Lebensstatus an den **Spieler** wandert (`entry.alive`,
    gesetzt beim Erzeugen, gelöscht über einen Todeslistener des DamageSystem).
    `isPlayerAlive()` ist seither die einzige Auskunft über den Lebensstatus;
    `isActive` bleibt nur dort, wo es um den ECS-Platz selbst geht (Kisten,
    Projektile). Abgesichert in `tests/victory-elimination.test.js` (5 Tests,
    inklusive der Falle mit der wiederverwendeten ID).
    **Der Fehler war latent:** Ob eine ID vor der Siegprüfung wiederverwendet
    wurde, hing am Timing der Kisten. Er wurde erst sichtbar, als die
    klassenabhängigen Startloadouts das Kampfgeschehen verschoben.

28. **Die Wasseranzeige warf beim Zeichnen einen Fehler.**
    In `hud.js` stand `wasserLabel(...)` statt `waterLabel(...)`. Die
    Unit-Tests konnten das nicht sehen — der Fehler liegt im DOM-Pfad und fiel
    erst im Browser auf (`ReferenceError`). Gefunden vom neuen E2E-Test, der die
    Marke wirklich sucht.

29. **Das Ertrinken überschwemmte das Ereignisprotokoll.**
    Das CharacterSystem meldet `drowning` in **jedem Simulationsschritt**,
    solange die Figur unter Wasser ist — bis zu 60 Meldungen je Sekunde. Das
    Protokoll fasst 60 Zeilen; es wäre davon vollständig verdrängt worden. Der
    Client meldet jetzt den **Übergang** (einmal beim Eintauchen, einmal beim
    Auftauchen) und nennt die Figur beim Namen. Gemessen: 60 Schritte unter
    Wasser → eine Meldung je Figur statt 60.

30. **Zwei Tests hingen an einem Zufall des Katalogs.**
    Der Online-Test erwartete vier Waffenzeilen. Die Reservewaffe mit
    unbegrenzter Munition (`FALLBACK_WEAPON_ID`) war aber zufällig selbst die
    erste Flächenwaffe des neutralen Loadouts und wurde beim Anlegen nicht
    doppelt genommen. Mit den Klassen-Loadouts entfiel diese Kopplung: Es sind
    jetzt korrekt fünf Zeilen (vier Klassenwaffen plus Reserve). Beide Tests
    nennen die Zahl samt Begründung.

### Klassen-Profil: eine Regel, eine Stelle

Der offene Punkt „Klassen- und Archetyp-Modifier existieren doppelt" ist
erledigt — und beim Zusammenführen kamen zwei weitere Befunde heraus.

- `applyClassModifiers` / `applyArchetypeModifiers` sind **entfallen**. Sie
  wurden nirgends aufgerufen und beschrieben eine *andere* Rechnung als die, die
  lief (sie überschrieben `power` mit `angle` und kannten den
  Archetyp-Schadensfaktor nicht). Die einzige Verrechnung ist jetzt
  `combatProfile()` in `src/shared/config/classes.js`.
- **Neu gefunden (a): Klasse und Archetyp sind im Match fest gekoppelt.** Beide
  werden über `index % 3` zugeteilt: scout tritt nur als brawler auf, heavy nur
  als artillerist, artillery nur als occultist. Von neun Kombinationen der
  Tabellen sind drei erreichbar. Bewusst **nicht** nebenbei geändert — das ist
  eine Balance-Entscheidung.
- **Neu gefunden (b): Der Bezugswert `ARCHETYPE_DAMAGE_BASE = 1,2` gehört zu
  keinem Archetyp** (1,1 / 1,4 / 1,6). Der „neutrale" Fall ist damit nirgends
  erreichbar; jeder Archetyp schießt entweder langsamer oder schneller als
  normal. Wert unverändert übernommen und als Fund dokumentiert.
- Die Tabellen führen Dimensionen, die der Motor **nicht liest** (`drag`,
  `mass`, Klassentempo, Archetyptempo, `archetype.damage` als Schaden). Sie
  stehen jetzt ausdrücklich unter `profil.inert` und sind getestet — eine
  stille Lüge wäre schlimmer als eine benannte Lücke.

### Klassenabhängige Startloadouts

Bis hierher startete jede Klasse mit `getDefaultLoadout(4)`, also mit exakt
denselben vier Waffen; die Klasse veränderte nur Werte, nicht die Mittel.

- Neu: `src/shared/config/loadouts.js`. Gleiche **Rollenstruktur** für jede
  Klasse — Fläche, Direktschuss, Strahl-/Nahkampf, Kür —, aber andere Waffen
  je Klasse. Nur die Kür unterscheidet sich inhaltlich: Scout ein
  Bewegungsmittel, Heavy ein Flächenelement, Artillerie eine weittragende
  Schusswaffe.
- **Startwaffen nur `common`/`uncommon`/`rare`.** Episch und legendär bleiben
  Loot. Ohne diese Grenze hätte der Heavy die stärkste Waffe des Katalogs (110
  Schaden, 90 Radius) im ersten Zug — die Loot-Kisten wären entwertet, bevor
  das Match beginnt.
- Vollständig deterministisch (reine Sortierungen über Katalogfelder, bei
  Gleichstand entscheidet der Katalogindex). Es wird keine Waffe erfunden.
- Abgesichert in `tests/class-loadout.test.js` (12 Tests): Rollenstruktur,
  Unterschiede zwischen den Klassen, Stufengrenze mit Gegenprobe,
  Determinismus, Rückfall für unbekannte Klassen, Deckung der Bewegungsliste
  mit dem Wirkungskatalog.

## Fortsetzung 2026-09-11 (2) — Netzwerk unter Störung, Screenreader

### Behobene Fehler

31. **Die Reservewaffe stand bei „heavy" auf Anzeigeposition 1.**
    Beim Nachlaufen der Gates aufgefallen. Die Reservewaffe
    (`FALLBACK_WEAPON_ID`, unbegrenzte Munition) ist die einzige, die sich nicht
    abwerfen lässt. Ihre Stellung in der Liste ergab sich allein aus ihrer
    Kategorie — und die ist `guns`. Bei `heavy` stand sie damit auf
    Anzeigeposition 1 (scout 4, artillery 3): Der erste Listeneintrag war nicht
    abwerfbar, und die Zifferntaste „1" wählte sie. `PlayerInventory` hält
    dieselbe Regel für die AKTIVE Waffe längst ein („Als aktive Waffe die erste
    ABWERFBARE wählen, nicht die Reserve") — jetzt gilt sie auch für die
    Reihenfolge der Anzeige. Geändert wurde der **Generator**, nicht der
    Katalog.

32. **Verpasste ein Client das `match_over`, blieb er dauerhaft im laufenden
    Spiel.** Nach dem Ende ruft die Sitzung `stop()` auf und sendet keine
    Snapshots mehr; die einzige Nachricht über das Ende ist ein einmaliges
    `match_over`. Verpasst ein Client sie — etwa weil sein Socket im Moment der
    Aussendung nicht offen war; `broadcastSnapshot` überspringt solche Clients
    still —, kommt nie wieder etwas außer PONGs. Nachgestellt mit einem
    mehrsekündigen Aussetzer: Status „playing", Zugzeit lief, Tick stand still.
    Behoben, indem der Server die Nachricht auf jede PING-Anfrage wiederholt,
    solange das Match entschieden ist. Kein neuer Nachrichtentyp, kein neues
    Feld im Drahtformat.

33. **Der Screenreader bekam vom Spiel nichts mit.** Das Spiel läuft auf einem
    Canvas; der gesamte Spielzustand ist damit unsichtbar. Das Ereignisprotokoll
    trug aber keine Live-Region, und `turn_start` wurde gar nicht protokolliert.
    Behoben: `role="log"` + `aria-live="polite"` + `aria-relevant="additions"`
    auf `#log-list`, und der Zugwechsel wird gemeldet. **Dabei war ein Detail
    entscheidend:** `Hud#log` baute die Liste bei jeder Meldung mit
    `replaceChildren` komplett neu — in einer Live-Region hätte ein Screenreader
    damit bei JEDER Meldung alle 60 Zeilen vorgelesen. Jetzt wird genau eine
    Zeile eingefügt und die älteste entfernt.

34. **Die Waffenliste war ohne Maus nicht erreichbar.** Die Zeilen waren reine
    `<li>` mit Klick-Listener: kein Fokus, keine Rolle, kein Name. Im
    Accessibility-Baum standen sie als gewöhnliche Listeneinträge — wer nicht
    klicken kann, kam an die Waffenauswahl nicht heran (die Zifferntasten halfen
    nur, wenn man sie kennt). Jetzt `role="button"`, `tabindex`, benannter Text
    mit Anzeigenummer und Name, `aria-current` für die gewählte Waffe, und
    Eingabe/Leertaste wählen. Das `stopPropagation` dabei ist kein Detail: Die
    Leertaste feuert im Spiel, ohne Sperre würde ein Tastendruck auswählen UND
    schießen.

35. **Ein fokussierter Waffeneintrag verlor den Fokus beim Neuaufbau.**
    Die Liste wird bei jeder Änderung neu gebaut (nach einem Schuss, nach dem
    Waffenwechsel, beim Zugwechsel). `replaceChildren` entfernt die alten
    Knoten — der Fokus fiel auf `<body>`. Wer mit der Tastatur eine Waffe
    gewählt hatte, verlor den Fokus genau in diesem Moment und musste sich von
    vorn durch die Seite tabben. Behoben: Der fokussierte Waffenschlüssel wird
    vor dem Neuaufbau gemerkt und danach auf dieselbe Waffe zurückgeholt.

36. **Jeder Seitenaufruf erzeugte einen 404.** Es gab kein Favicon und keinen
    `<link rel="icon">`, also fragte der Browser `/favicon.ico` an und bekam
    nichts. Aufgefallen, weil ein neuer E2E-Test Seitenfehler sammelt. Behoben
    mit `public/favicon.svg` (Vite kopiert `public/` in den Build) und dem
    Verweis im Kopf von `index.html` — das Spiel hat damit auch ein Tab-Symbol.

37. **Die Waffenliste im Onlinemodus sprengte ihr Test-Budget.** Bis zu 15
    Playwright-Aufrufe mit je eigenem Timeout (Icon-Prüfung bis 10 s je Zeile),
    und der Server spielt das Match in Echtzeit weiter: Ist es zu Ende,
    verschwindet der aktive Spieler und die Liste kollabiert auf 0 Zeilen. Der
    Fehlschlag sah nach kaputtem Produkt aus, war aber ein zu schwerfälliger
    Test. Jetzt wird einmal auf „gefüllt und alle Icons dekodiert" gewartet und
    die Liste in einem Zug gelesen: 2,0 s statt >60 s, E2E-Lauf 2,6 statt
    4,3 min.

38. **Der Glücksrad-Test rannte gegen den Ausblend-Timer.** Das Rad blendet sich
    nach 3,2 s selbst aus, der Text erscheint erst am Ende der Drehung (1,8 s) —
    ein Fenster von 1,4 s, gegen das Playwright unter Last verliert. Erst nach
    dem vollen Suite-Lauf zu sehen, in Einzelausführung nie. Der Zustand wird
    jetzt synchron gelesen und auf den Text INNERHALB der Seite gewartet.

### Verbindung unter erschwerten Bedingungen

Neu: `tests/e2e/network-conditions.spec.mjs` (5 Tests). `page.routeWebSocket`
hängt sich zwischen Seite und Server; vom Server zur Seite werden Nachrichten
verzögert oder verworfen, die Gegenrichtung bleibt unangetastet.

- **120 ms Latenz** auf allen Nachrichten (auch dem PONG — sonst wäre die
  Latenzmessung eine Selbstbestätigung): Verbindung bleibt, Snapshots fließen,
  die gemessene Latenz ist ≥ 100 ms, das HUD zeigt sie, und der aktive Spieler
  kann feuern.
- **Jeder dritte Snapshot verworfen:** Die Verbindung bleibt, der Tick läuft
  weiter, und es kommt ein Vollsnapshot nach — der Beleg, dass die
  Wiederherstellung greift.
- **Mehrsekündiger Aussetzer:** Hier zeigte sich Fehler 32. Geprüft wird, was in
  beiden Ausgängen gelten muss: Der Client darf nicht still auf einem laufenden
  Spiel sitzen bleiben — entweder läuft der Zustand weiter (Vollsnapshot) oder
  das Ende kommt an (Wiederholung).
- **Gegenprobe zum Störer selbst:** Steuerungsnachrichten müssen durchlaufen.
  Sonst wäre der Verlusttest grün, weil der Client gar nicht erst verbunden wäre.

Wichtig zur Einordnung: Über WebSocket/TCP gibt es **keinen** echten
Paketverlust — TCP wiederholt verlorene Segmente. Der Test bildet deshalb keinen
Produktionsfall ab, sondern belegt die **Wiederherstellung** (Vollsnapshot alle
2 s), die bei Aussetzern, Reconnects und Serverneustarts greift. Die Tests
prüfen jeweils mit, dass die Störung gewirkt hat; ein Verlusttest, der nichts
verworfen hat, wäre eine leere Behauptung.

Dazu drei Tests in `tests/server-integration.test.js`: die Wiederholung des
Endes auf PING, die Gegenprobe (kein `match_over`, solange das Match läuft) und
das Verhalten beim Wiederverbinden (siehe „Bekannte Grenzen").

### Screenreader-Durchlauf

Neu: `tests/e2e/screenreader.spec.mjs` (11 Tests). Geprüft wird gegen den
**echten Accessibility-Baum des Browsers** (CDP,
`Accessibility.getFullAXTree`), nicht gegen Attribute im Markup — der
Unterschied ist wesentlich, weil ein `aria-label` an einem Element, das der
Browser aus dem Baum wirft, niemandem nützt.

Was bereits gut war und jetzt festgehalten ist: kein bedienbares Element ohne
Namen (Menü und Match), benannte Listen, beschriebenes Spielfeld, Sprunglink.

Was fehlte und behoben ist: Fehler 33, 34 und 35.

Bewusste Entscheidung, im Test festgehalten: **Runde, Wind und Zugzeit sind
KEINE Live-Regionen.** Sie ändern sich im Sekundentakt; ein Screenreader würde
pausenlos reden und jede echte Meldung übertönen.

### Nachgemessen statt vermutet: die Tab-Reihenfolge

Beim Abschluss der Barrierefreiheit stand die Vermutung im Raum, die Waffenliste
sei mit je einem Tab-Stopp pro Zeile zu langsam zu durchlaufen und brauche eine
Navigationsleiste („roving tabindex"). **Die Messung widerlegt das:** Im Match
gibt es genau **8 Tab-Stopps** — 1 Sprunglink, 2 Spielfeld, dann die fünf
Waffenzeilen. Das Spielfeld ist der ZWEITE Stopp, also mit einem Tastendruck
erreichbar. Bei höchstens sieben Waffen (sechs plus Reserve) bleibt das
überschaubar; die zusätzliche Mechanik wäre Aufwand ohne Nutzen und würde die
Zahl der Tab-Stopps nur von unten begrenzen, nicht senken.

Festgehalten, damit die Frage nicht erneut aufgeworfen wird. Kommt eine
größere Auswahl hinzu (Loot mit vielen Waffen, Entwurfsphase), ist sie neu zu
stellen — dann mit einer Messung, nicht aus dem Gefühl.

### Behobener Fehler

39. **Die Waffennummern standen nicht mehr in aufsteigender Reihenfolge
    (selbst eingebaut).** Sichtbar als „1, 2, 3, 5, 4" — die Nummer 5 stand ÜBER
    der 4.
    Ursache: Nummerierung und Gliederung liefen auseinander. Die Nummer kommt
    aus `orderInventoryBySubcategory`, der Platz in der Liste aus einer zweiten
    Sortierung nach Unterkategorie. Solange beide dieselbe Ordnung ergaben, fiel
    das nicht auf. Mit Fehler 31 („Reserve ans Ende") wanderte die Reservewaffe
    in der Nummerierung nach hinten, in der Gliederung blieb sie unter
    „Schusswaffen" — die beiden Ordnungen liefen auseinander.
    Behoben, indem die Gliederung aus DERSELBEN Reihenfolge entsteht: Die
    Gruppen werden beim Durchlaufen der Anzeigeordnung gebildet, stehen also in
    der Reihenfolge ihres ersten Auftretens, und die Nummern steigen lückenlos.
    Die Reserve bekommt über `displayGroupFor` eine eigene Gruppe („Reserve
    (unbegrenzt)") — sie ist keine Spielweise, sondern eine Ausnahme.
    `WEAPON_SUBCATEGORIES` bleibt bei vier Einträgen: Die beschreiben weiterhin
    die Kategorien-Zuordnung des Katalogs und werden getestet.
    Abgesichert in `tests/drop-mechanic.test.js` (Ordnung lückenlos, Reserve
    zuletzt, Gruppen-Zuordnung) und in zwei E2E-Tests: aufsteigende Nummern in
    der Liste **und** „Taste N wählt die mit N beschriftete Waffe" für jede
    Position. Genau dieser Vergleich hätte den Fehler gefunden.

    **Der Fehler steckte in einem Bereich, den die bisherigen Tests nicht
    abdeckten:** Sie prüften, DASS Zifferntasten funktionieren und dass die
    Reserve geschützt ist — nicht, ob die sichtbare Nummer zum Platz passt.

## Zustandsübertragung: geprüft, nicht komprimiert

Der offene Punkt lautete „Snapshot-Kompression prüfen (Delta läuft, Quantisierung
ist schon aktiv)". Die Prüfung hat zwei Dinge ergeben — die erste ist eine
Korrektur der Annahme, die zweite eine Zahl.

**1. Das Delta-Encoding spart KEINE Bytes.** Die Größe eines Zustandstakts ist
`HEADER + Figuren × 15 + Projektile × 6`, unabhängig davon, wie viele Felder sich
geändert haben. Gemessen: Ein Vollsnapshot und ein Delta-Snapshot mit acht
Figuren sind **beide exakt 142 Byte** — Unterschied 0. Die Dirty-Bits sind ein
SIGNAL an den Client („was ist neu"), keine Kompression. Wer „Delta" liest und
Einsparung annimmt, irrt; die Annahme stand genau so im offenen Punkt.

**2. Kompression wäre eine Lösung ohne Problem.** Gemessen über den
Spielverlauf:

| Figuren | Ø Snapshot | Höchstfall | Übertragung bei 20 Hz |
|---|---|---|---|
| 2 | 53 B | 58 B | 1,0 kB/s |
| 8 | 143 B | 148 B | 2,8 kB/s |
| **12 (Maximum)** | **203 B** | **208 B** | **4,0 kB/s** |

Vier Kilobyte je Sekunde im Höchstfall und pro Client. Eine variable Stride
würde Bytes sparen, aber das Drahtformat deutlich komplizierter machen (variable
Länge, neue Fehlerquellen beim Lesen) — für weniger als ein Bild pro Sekunde.
Entschieden: **nicht komprimieren.**

`SNAPSHOT_HZ`, `PLAYER_STRIDE`, `PROJECTILE_STRIDE` und `HEADER_SIZE` sind jetzt
exportiert und in `tests/snapshot-size.test.js` (5 Tests) mit einem **Budget**
belegt: Ein Snapshot darf höchstens 320 Byte groß sein, die Übertragung höchstens
6 kB/s. Wächst die Größe unerwartet (neues Feld ohne Bedacht), schlägt der Test
an und die Entscheidung wird neu verhandelt. Weitere Tests halten fest, dass das
Delta gleich groß bleibt, das Wachstum linear ist (kein überlineares
Mitschleppen von Verlauf, Inventar oder Protokoll) und die Quantisierung aktiv
ist.

## Replay im Client

Eine Aufzeichnung enthält nur die EINGABEN (Seed und Schüsse), nicht den
Verlauf — darum ist sie wenige Kilobyte groß statt Megabytes, und darum lässt
sich jede Stelle anspringen. Die Wiedergabe rechnet das Match neu.

Neu: `ReplayPlayer` in `src/engine/replay.js` — schrittweise steuerbar
(`step`, `stepMany`, `seek`, `reset`), mit Fortschritt und Endekennzeichen.
`playReplay` (Werkzeugkette, `replay --verify`) läuft jetzt darüber, damit es nur
EINE Umsetzung der Eingabegruppierung gibt: Wiedergabe im Client und Prüfung in
der Werkzeugkette müssen sich gleich verhalten, sonst zeigt der Client etwas
anderes als das, was `--verify` bestätigt.

Im Menü unter „Replay ansehen": Aufzeichnung laden, abspielen/pausieren, Tempo
0,25×–4×, ± 1 s, an jede Stelle springen, Fortschrittsbalken und Statuszeile
(Live-Region). Eingaben sind während der Wiedergabe gesperrt — wer zusieht,
spielt nicht; ohne die Sperre würde ein Tastendruck die nachgespielte Rechnung
verändern.

### Behobener Fehler

43. **Nach einem Rücksprung zeigte die Anzeige den veralteten Zustand
    (selbst eingebaut).** `ReplayPlayer.seek` baut beim Rückspringen den
    MatchController NEU (`reset`), die Anzeige hielt aber weiter das alte
    Objekt. Gemessen: `replay().tick` meldete korrekt 120, der gezeichnete
    Zustandshash stammte vom ENDE des Matches. Der Fehler war stumm — die
    Anzeige sah nur falsch aus, ohne dass etwas geworfen wurde.
    Behoben mit `#syncReplayMatch()` nach jedem `reset`/`seek`.

    Gefunden hat das der **Hash-Vergleich** im Test: Die Wiedergabe muss nach
    vollständiger Durchführung denselben Zustandshash liefern wie die
    Aufzeichnung. Ohne ihn hätte der Test nur geprüft, dass irgendetwas
    gezeichnet wird.

Der Weg dorthin war aufschlussreich: In Node (ohne Anzeige) war der Player
**vollkommen deterministisch** — drei verschiedene Sprungwege ergaben denselben
Hash. Erst der Vergleich mit dem Browser zeigte, dass der Unterschied nicht im
Player lag, sondern in der Anzeige. Die Messung in der Umgebung ohne Anzeige hat
den Suchraum halbiert.

Abgesichert in `tests/e2e/replay.spec.mjs` (7 Tests): Laden und schrittweises
Ansehen, Zustand entspricht der Aufzeichnung (Hash-Vergleich), Springen vorwärts
und rückwärts deterministisch, Abspielen/Pause/Neustart, Ende ist endgültig,
Eingaben gesperrt, Aufzeichnung bleibt klein.

Nebenbei behoben: Im Wiedergabemodus wurde das Wasser nicht gezeichnet (die
Prüfung ließ nur `local` zu) — bei einem Wasserschub-Replay wäre die Wirkung
unsichtbar geblieben.

## Wasserschub und zwei Fehler in der Verschiebung

Der Wasserblaster (`pa_063`, `special: "water_push"`) hatte als einzige der
genannten Mechaniken **keinen Eintrag im Wirkungskatalog** — er fiel durch, weil
`effectFor('water_push')` `null` lieferte. Statt eines neuen Nachrichtentyps
oder Protokolls benutzt er das vorhandene Wasserfeld: Das ist dieselbe Größe, die
schon Ertrinken und Wasserverdrängung speist.

Umgesetzt:

- `EFFECT_KIND.WATER_PUSH` in `src/engine/specials.js`, Wirkung auf das ZIEL
  (nicht in `SELF_TARGET_KINDS`), Zahlen aus dem Schaden der Waffe hergeleitet
  statt erfunden: `raise` = Schaden/100, begrenzt auf 0,4…0,6.
- `#pushAway` in `match.js` — der Gegenpol zum vorhandenen `#pullToward`; beide
  benutzen jetzt dieselbe Schrittsuche `#shiftToward`.
- Neues Ereignis `water_pushed` mit `dx`, `dy`, `waterBefore`, `waterAfter` und
  `cellsFlooded`.

### Drei Funde auf dem Weg dorthin

40. **Eine einzelne geflutete Zelle wirkt für die Anzeige nicht.** Das
    Wasserfeld hat 4 px große Zellen, der Zustand einer Figur liest die
    MITTE, die Figur steht aber auf `Boden − HALF_HEIGHT` (10 px) — das sind
    verschiedene Zellen. Gemessen: `waterLevelAt(600, 420)` = **0,5**, aber
    `state.waterLevel` = **0**. Die Ertrinkgefahr griff nie. Behoben mit
    `floodArea`, das einen kleinen Bereich (16 × 20 px) um die Figur flutet —
    klein genug, dass ein Wasserloch entsteht und kein See.

41. **Eine Waffe mit Flächenwirkung wendete ihren Effekt ZWEIMAL auf das direkt
    getroffene Ziel an.** Erst direkt aus dem Einschlag, dann noch einmal über
    die Fläche, die das Ziel einschließt. Am Wasserschub gemessen: `waterAfter`
    stieg in einem Einschlag erst auf 0,4 und dann auf 0,8. Dieselbe Verdopplung
    traf Einfrierdauer (doppelt so lange), Heranziehen (doppelte Distanz) und
    Schaden über Zeit (doppelte Stapel). Bei den meisten Waffen fiel es nicht
    auf, weil ihr Radius 0 ist — bei Flächenwaffen schon.
    *Nebenwirkung: Der erste Testlauf meldete „Ertrinken ausgelöst", und das war
    nur dem Fehler zu verdanken (0,4 + 0,4 = 0,8 > DROWN_LEVEL). Nach der
    Korrektur macht ein Schuss nass (0,4), aber ertränkt nicht.*

42. **Eine Verschiebung setzte das Ziel auf die nächste Klippe.** `#shiftToward`
    verankert das Ziel auf der Geländeoberfläche der neuen Stelle; stand dort ein
    Hügel, wurde es katapultiert statt geschoben — gemessen: 120 px seitwärts und
    **115 px nach oben in einem Schritt**, mitten auf einen Berggipfel. Behoben
    mit einer Höhenbegrenzung (`MAX_SHIFT_SLOPE` = 16 px, gemessen an der
    Fußposition). Die Grenze gilt für BEIDE Verschiebungen — auch ein Enterhaken
    (`PULL`) konnte das Ziel vorher auf einen Berg setzen.

Abgesichert in `tests/specials.test.js` (6 neue Tests): nass aber nicht
ertränkend beim ersten Schuss, Ertrinken über `DROWN_LEVEL`, Wirkung genau
EINMAL, kein Sprung in der Höhe (Schub und Ziehen), `floodArea` deckt Zentrum
und Fuß ab, `floodArea` senkt nie einen vorhandenen Füllstand.

**Offen bleibt:** das aufgestellte Geschütz (`Auto-Turret`, `special:
"auto_target"`). Es braucht ein eigenes Entity mit eigener Lebensdauer und
Trefferlogik und damit einen neuen Nachrichtentyp im Protokoll — das ist eine
Design-Entscheidung, kein Nachziehen einer Lücke.

## Balance-Messung über die Kartenbreite

Das Messwerkzeug des Berichts war falsch eingestellt und hat dadurch Waffen
schlechtgeredet: Es hat auf festen **90 px** geschossen, während das Spiel bei
**426 px** startet. 90 px ist die Entfernung für einen Nahkampfangriff, nicht
die des Spiels. Die Zahl stand nirgends gegen die Wirklichkeit geprüft — bis
die Messung gegen den echten Matchstart gestellt wurde.

Behoben:

- Ohne Angabe wird jetzt auf der **Startentfernung des Spiels** gemessen, aus
  einem echten Match abgelesen (nicht geraten).
- `--sweep` (`npm run balance:sweep`) misst auf sieben Entfernungen von 90 bis
  850 px. Bewertet wird die beste — jede Waffe ist für eine Entfernung gebaut,
  und einen Baseballschläger auf 850 px zu messen ist so unfair wie schwere
  Artillerie auf 90 px.
- `testDistanz` ist immer die **tatsächlich** gemessene Entfernung. Bei
  hügeligem Gelände verkürzt die Liniensuche stillschweigend; ohne diesen Wert
  ginge eine 800-px-Messung, die in Wahrheit bei 400 px stattfand, als
  800-px-Messung durch. `angefragteDistanz` bleibt daneben stehen.
- Getestet wird das Werkzeug selbst (`tests/balance-report.test.js`, 5 Tests):
  Messdistanz gleich Startentfernung, Durchlauf deckt die Kartenbreite ab,
  gemeldete Entfernung ist eine wirklich gemessene (nie verlängert), Nahkampf
  reicht weniger weit als Artillerie, Rollenverteilung vollständig.

### Ergebnis (Karte hills, 150 Waffen, sieben Entfernungen)

| Größe | Wert |
|---|---|
| Waffen mit Schaden am Ziel | 115 |
| Selbstwirkende Waffen (wirken nachweislich) | 35 |
| **Waffen ohne jede Wirkung** | **0** |
| Ø Schaden je Schuss (nur wirksame) | 31,9 |
| Median Shots-to-Kill | 7 |
| Nur Nahbereich (bis 200 px) | 30 |
| Auch Langstrecke (ab 550 px) | 89 |

Reichweite (größte Entfernung, auf der die Waffe noch wirkt): 24 Waffen enden
bei 90 px, dann eine breite Streuung über 200–800 px, und 37 Waffen wirken noch
auf 850 px.

**Zwei Annahmen sind damit widerlegt:**

1. *„Schwere Artillerie erscheint nur wegen der kurzen Messdistanz als
   wirkungslos."* Beim kurzen Aufbau war genau **eine** Waffe ohne Wirkung. Nach
   der Messung über die Kartenbreite: keine. Der Effekt war also klein — was
   gestimmt hat, war die **Reihenfolge**: Waffen wie Artilleriegeschütz und
   Feldkanone stehen jetzt mit 97 bzw. 81 Schaden oben, weil sie auf 200 px
   gemessen werden, wo sie treffen.
2. *„Die meisten Waffen sind Nahkampf."* Von 150 Waffen enden nur 30 im
   Nahbereich; 89 wirken auch ab 550 px. Der Katalog hat eine echte
   Rollenverteilung über die Entfernung.

**Was die Verteilung „beste Entfernung" NICHT aussagt:** 128 von 150 Waffen
sind bei 90 px am stärksten. Das ist Physik, nicht Design — auf kurze Entfernung
trifft jede Waffe, weil nichts danebengehen kann. Für die Frage nach der
Rollenverteilung ist deshalb die **Reichweite** die aussagekräftige Größe, nicht
die Stelle des höchsten Schadens. Beides steht im Bericht, mit Hinweis.

**Offen, aber jetzt beziffert:** 52 Waffen haben keinen Designwert in der
Quelldatei und rechnen mit einem Ersatz-Schadenswert (`istPlatzhalter`). Das ist
ein Datenmangel, kein Codefehler — und ohne Zahl war er nicht greifbar.

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
  Anzeige auch im Online-Modus stimmt. **v4** ergänzt den Wasserstand (1 Byte)
  für Ertrinken und Verdrängung — siehe unten.


## Bestandsprüfung der 150 Waffen

Vollständige Durchsicht am 2026-09-11. Ergebnis je Frage:

| Frage | Befund |
|---|---|
| Richtig benannt? | Ja. 150 eindeutige Anzeigenamen, 150 eindeutige interne Namen, keine Platzhalter. Serienkennungen waren uneinheitlich (siehe Fehler 19). |
| Seltenheit vorhanden? | Ja, alle 150. Quelldaten führen drei Stufen (80/40/30); abgeleitet gibt es fünf (70/21/41/13/5). |
| Für Drafting/Abwurf quantifiziert? | `powerScore` (0–515) und `powerTier` vorhanden; Loot gewichtet nach der Stufe. `cooldown` ist **hergeleitet** (Werte 0–3, siehe `deriveCooldown`) und wirkt: Schuss abgelehnt, Nachladeanzeige in der Liste. Eine Abwurf-Mechanik existiert (Q, Kiste fliegt, siehe 26). |
| Sinnvolle Spritesheets und Icons? | Icons: 150/150 vorhanden, keine Duplikate, keine Waisen, keine defekten Dateien — **aber im Browser nie geladen** (Fehler 20). Spritesheets: keine; die Darstellung ist prozedural (Canvas). |
| Schussart, Schaden, Reichweite, Explosion vorhanden? | Schussart: 76 Hitscan / 74 Projektil. Schaden: alle 150, 52 davon abgeleitet (`damageSource`). Explosion: 54 Waffen mit Radius, 22 verschiedene Werte. Reichweite: `maxRange` ist **hergeleitet** aus Feuerart, Kategorie und Geschoss — 61 verschiedene Werte von 110 bis 1062 px (siehe `deriveMaxRange`). |
| Sinnvolle Namen? | Ja (siehe oben). |
| Waffenmenü sinnvoll? | Jetzt ja: vier Gruppen, nur Waffen des aktiven Spielers, Munition je Waffe, Anzeigenummern deckungsgleich mit den Zifferntasten. Online war die Liste zuvor immer leer (Fehler 21). |
| Alle Icons verknüpft? | Ja, seit Fehler 20 behoben. |

### Gefundene und behobene Fehler

19. **Serienkennungen waren uneinheitlich.** `Raketenrucksack` stand ohne Kennung neben
    `Raketenrucksack Mk III` (ohne Mk I/II), `Maschinenpistole` neben
    `Maschinenpistole Mk II` (ohne Mk I). Vereinheitlicht im Generator
    (`NAME_SERIES_FIXES`): `Raketenrucksack` → `Mk I`, `Mk III` → `Mk II`,
    `Maschinenpistole` → `Mk I`. IDs und Icons unberührt.

20. **Waffen-Icons wurden im Browser nie geladen.** Der gespeicherte `iconPath`
    ist relativ zu `src/shared/config/weapons.js`; der Client löste ihn gegen
    sein eigenes Modul auf (`src/client/hud.js`) — eine Ebene zu tief, das Ziel
    existierte nicht. Der stille `error`-Handler entfernte das Bild daraufhin
    lautlos, deshalb blieb der Fehler unsichtbar: In der Liste fehlten die Icons,
    ohne dass ein Fehler auftrat. Behoben durch `iconUrlFor()` im Katalog, das
    gegen die eigene Datei auflöst. Abgesichert durch einen E2E-Test, der prüft,
    dass jedes Bild wirklich geladen ist (`naturalWidth > 0`).

21. **Die Waffenliste war im Online-Modus immer leer.** Der Ansichtszustand für
    den Mehrspielermodus setzte `inventory: []`, `ammo: {}` und
    `activeWeaponId: null` fest. Der binäre Snapshot führt Bestände nicht
    (variable Länge je Spieler), und es gab keinen Ersatzweg. Folge: Im
    Mehrspielermodus ließ sich keine Waffe sehen oder wählen. Behoben durch eine
    eigene Nachricht `CONTROL.LOADOUTS`, die nur bei Änderung gesendet wird
    (Munitionsverbrauch, Kistenfund, Waffenwechsel).

22. **Vier Utility-Waffen waren nie zu bekommen.** `pickWeaponForRarity` filterte
    auf `damage > 0`. Betroffen waren genau die Waffen ohne Schadenswert:
    Grappling Hook, Jetpack, Raketenrucksack Mk III, Munitionskiste. Behoben:
    Der Filter lässt jetzt alles zu, was Schaden **oder** eine Wirkung hat.

23. **Acht Prozent des Loot-Gewichts liefen ins Leere.** Die Ziehung gewichtete
    nach `rarity` (drei Stufen), während die Gewichtstabelle fünf Stufen kennt —
    `epic` und `legendary` hatten keine Waffe und wurden nie gezogen. Zugleich
    färbte die Anzeige nach `powerTier`. Beide nutzen jetzt dieselbe Stufe.

24. **Es gab keine Unterkategorien.** Die Waffenliste war eine flache Aufzählung.
    Jetzt vier Gruppen (Nahkampf, Schusswaffen, Elementar & Magie, Technik &
    Nutzen), die die acht Kategorien lückenlos abdecken. Anzeigenummern und
    Zifferntasten nutzen dieselbe Ordnung (`orderInventoryBySubcategory`) —
    vorher wären sie bei gegliederter Liste auseinandergelaufen.

25. **Waffenwechsel im Onlinemodus gab keine Rückmeldung** und war auch bei
    fremdem Zug möglich. Jetzt nur am eigenen Zug, mit Meldung im Protokoll.

### Offene Punkte aus der Durchsicht

Alle vier Punkte sind inzwischen erledigt. Sie standen hier, weil die
Bestandsprüfung sie als offen führte — der Stand war bereits überholt, was die
Abstände zwischen Prüfung und Eintrag zeigt:

- ~~`maxRange` ist bei allen 150 Waffen 600.~~ Falsch. Die Reichweite wird im
  Generator hergeleitet (`deriveMaxRange`), 61 verschiedene Werte.
- ~~`cooldown` ist bei allen 150 konstant 0.~~ Falsch. Der Generator leitet ihn
  her (`deriveCooldown`), vier Werte 0–3, und der Motor erzwingt ihn.
- ~~Alle Spieler starten mit demselben Loadout.~~ Erledigt: klassenabhängige
  Startloadouts, siehe „Klassenabhängige Startloadouts".
- ~~Eine Abwurf-Mechanik existiert nicht.~~ Erledigt: `Q` wirft die aktive Waffe
  ab, sie fliegt und landet aufhebbar (siehe 26).

### Werkzeuge
- `npm run lint` / `lint:fix` — ESLint, als CI-Gate nutzbar.
- `npm run balance` — Balance-Bericht über alle 150 Waffen (auf der
  Startentfernung des Spiels). `npm run balance:sweep` misst zusätzlich über
  sieben Entfernungen von 90 bis 850 px.
- `npm run perf` — Performance-Profil mit Budget-Gate.
- `npm run replay` — Aufzeichnen, Abspielen, `--verify`.
- `npm run icons` — Icon-Pipeline (Pillow, ohne ImageMagick).
- `scripts/verify-explosion-render.mjs` — Pixelprüfung, dass Einschläge
  tatsächlich gezeichnet werden (findet Fehler, die kein Unit-Test sieht).
- `npm run weapons:build` — Kataloggenerator mit dokumentierter Stufenableitung.
- CI: Lint → Tests → Build → Performance-Budget, danach E2E.

## Testabdeckung

- **Unit/Integration (457):** PRNG und Seeds, Loot, Terrain, Wasser und
  Ertrinken, Ballistik und Tunneling, Munition, Matchregeln, Rundengrenze,
  Zugzeit und Zugwechsel, Replay und Determinismus, Netcode und
  Delta-Encoding, Lobby und Servervalidierung, Persistenz, Betriebszähler,
  Waffenkatalog und Icon-Zuordnung, Lasttest mit 8 Clients, DOM-Helfer sowie
  Neustart mit Persistenz (Lobby ohne Sitzung und gespieltes Match),
  Spezialeffekte (24 Tests über Registry, StatusStore, Wirkung im Spiel,
  Zustandswirkungen und Determinismus), Ereignisweitergabe an den Konsumenten
  (7 Tests, inklusive Gegenprobe).

  Neu in diesem Durchgang: **Kampfprofil** (7 Tests, `class-profile.test.js`),
  **Klassen-Loadouts** (12 Tests, `class-loadout.test.js`), **Wasser im HUD**
  (13 Tests, `water-hud.test.js` — Zustände, Ertrinken, Verdrängung,
  Drahtkodierung, Delta), **Sieg durch Ausschaltung** (5 Tests,
  `victory-elimination.test.js`), **Bewegung reduzieren** (2 Tests in
  `dom.test.js`).

Details zu den Spezialeffekten: `src/engine/specials.js`.
- **Browser-E2E (89):** Laufzeit-Smoke (Menü, Matchstart, HUD, Zielvorschau,
  Schuss, Spielende, Determinismus, Terrainzerstörung), Multiplayer mit zwei
  Browsern und Reconnect, Latenzmessung, Lobby-Browser gegen einen echten
  Server, Tastatur- und Fokusverhalten, Spezialeffekte im Browser (7 Tests:
  Heilung im Protokoll, Schildmarke, Einfrieren, Schaden über Zeit,
  Selbstwirkung ohne Projektil, Lauffähigkeit nach allen Effekten,
  Determinismus). Neu: **Verbindung unter Störung** (5 Tests,
  `network-conditions.spec.mjs` — Latenz, Paketverlust, Aussetzer, Gegenprobe)
  und **Screenreader-Durchlauf** (11 Tests, `screenreader.spec.mjs` — Namen im
  Accessibility-Baum, Live-Region des Protokolls, Zugwechsel-Ansage,
  bedienbare Waffenliste, Fokus über den Neuaufbau) sowie **Wasser im HUD**
  (4 Tests, `water-hud.spec.mjs` —
  Marke mit Prozent, „nass" gegen „untergetaucht", Meldung nur beim Übergang,
  Verschwinden der Marke) und **Bewegung reduzieren** (2 Tests in
  `accessibility.spec.mjs`, mit Gegenprobe ohne die Einstellung).

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
      **Wasserschub ist umgesetzt** (siehe „Wasserschub und zwei Fehler in der
      Verschiebung"). Offen bleibt nur noch das aufgestellte Geschütz.
- [x] Balance über die volle Kartenbreite messen. Der Bericht misst jetzt auf
      der Startentfernung des Spiels (aus einem echten Match abgelesen: 426 px
      bei 1280 px Kartenbreite) statt auf festen 90 px, und mit `--sweep`
      (`npm run balance:sweep`) auf sieben Entfernungen von 90 bis 850 px.
      Siehe „Balance-Messung über die Kartenbreite".
- [x] Zustände im HUD: Schild, Einfrieren, Schaden über Zeit und Schadensbonus
      erscheinen als Marken in der Spielerliste, mit Erläuterung beim Überfahren.
- [x] Ertrinken und Wasserverdrängung im HUD anzeigen. Wasserstand je Spieler
      (Protokoll v4, ein Byte), Marke am Spielernamen mit Zustand und Prozent
      („nass 50 %" / „untergetaucht 80 %"), Erläuterung beim Überfahren,
      Protokollmeldung beim Übergang. Schwellen stehen einmal in
      `src/shared/config/water.js` und gelten für Motor und Anzeige gleich
      (`tests/water-hud.test.js`, `tests/e2e/water-hud.spec.mjs`).

### P1 — Netcode
- [x] Server-autoritative Zugzeit. Geprüft: Der Zug wechselt nach Ablauf der
      Zugzeit auch ohne Schuss (sechs Wechsel ohne einen einzigen Schuss);
      abgesichert in `tests/turn.test.js`. Der frühere TODO-Eintrag war falsch —
      die Zeitmessung lief bereits serverseitig.
- [ ] Client-seitige Prädiktion des eigenen Schusses mit Server-Rollback.
      Aktuell fühlt sich der eigene Schuss bei Latenz verzögert an.
- [x] Snapshot-Kompression geprüft — **nicht nötig**, und das Delta spart keine
      Bytes. Gemessen: 4,0 kB/s bei zwölf Figuren und 20 Hz (Höchstfall).
      Siehe „Zustandsübertragung: geprüft, nicht komprimiert".

### P2 — Client & UX
- [x] Lobby-Browser im Menü (offene Lobbys listen und beitreten).
- [x] Kartenwahl im Menü (Presets: hills, mountains, islands, caverns).
- [x] Latenz-Anzeige per Ping-Intervall (2 s, mit Messung echter RTT).
- [x] Tastatur-Fokusreihenfolge und Fokusindikatoren inkl. Skip-Link.
- [x] Tastatursteuerung greift nicht mehr in Formularfelder ein.
- [ ] Entwurfsphase (Draft) für 4–6 Einheiten pro Team.
- [x] `prefers-reduced-motion` befolgt: CSS-Animationen und -Übergänge entfallen
      vollständig (nicht verkürzt), Explosionspartikel werden nicht erzeugt, der
      Explosionsblitz bleibt. Die Einstellung wird je Bild neu gelesen, greift
      also ohne Neuladen (`tests/dom.test.js`, in `accessibility.spec.mjs` mit
      Gegenprobe).
- [x] Screenreader-Durchlauf. Gegen den echten Accessibility-Baum des Browsers
      geprüft (CDP, `Accessibility.getFullAXTree`), nicht gegen Attribute im
      Markup. Behoben: Das Ereignisprotokoll ist jetzt die Live-Region des
      Spiels (`role="log"`, `aria-live="polite"`, `aria-relevant="additions"`),
      der Zugwechsel wird angesagt, die Waffenliste ist ohne Maus bedienbar
      (Knopf-Rolle, Fokus, Beschriftung, Eingabe/Leertaste) und behält den
      Fokus über den Neuaufbau der Liste. Siehe „Screenreader-Durchlauf".
- [ ] Optionale WebGPU-Pipeline mit Canvas-2D-Rückfall.

### P3 — Betrieb
- [x] Betriebszähler und erweiterte Zustandsabfrage. `/healthz` liefert
      Verbindungen, Trennungen, gesendete Snapshots, angenommene und abgelehnte
      Kommandos, Fehler, Lobby-Erstellungen, Uptime sowie einen
      `healthy`-Schalter für verwaiste Sitzungen. Abgesichert in
      `tests/metrics.test.js`.
- [x] `dist/` wird in der CI als Artefakt abgelegt (14 Tage Aufbewahrung).
- [x] Lasttest mit künstlicher Latenz und Paketverlust. `page.routeWebSocket`
      hängt sich zwischen Seite und Server und verzögert bzw. verwirft
      Nachrichten; alle Störungen zählen mit und werden geprüft (eine Störung,
      die nichts gestört hat, wäre eine leere Behauptung). Abgedeckt:
      120 ms Latenz (Verbindung bleibt, die Latenzmessung ist ehrlich, das Spiel
      bleibt bedienbar), jeder dritte Snapshot verworfen, mehrsekündiger
      Aussetzer mit Erholung über den Vollsnapshot. Dazu drei
      Server-Integrationstests für die Ende-Mitteilung.
      Siehe „Verbindung unter erschwerten Bedingungen".
- [x] Replay im Client abspielen. Eigene Wiedergabe im Menü („Replay ansehen"):
      Aufzeichnung laden, abspielen/pausieren, Tempo 0,25×–4×, ± 1 s, an jede
      Stelle springen, Fortschrittsanzeige. Siehe „Replay im Client".
- [x] Strukturierte Logs (JSON) statt Freitext im Server. Eine JSON-Zeile je
      Ereignis mit festem Schema (`ts`, `level`, `event`, `msg` + Felder),
      Redigierung verdächtiger Feldnamen, `LOG_LEVEL` und `LOG_FORMAT=pretty`.
      Siehe „Strukturierte Logs" — dabei fielen drei Fehler auf.

---

## Auftrag vom 2026-09-11 — offene Punkte aus der Spielerdurchsicht

Reihenfolge nach Abhängigkeit. `[x]` heißt: durch Test oder Messung belegt.

### A. Waffen-Identität
- [x] **Mk-Dubletten zu eigenständigen Waffen umgebaut.** Vier Paare sind faktisch
      dieselbe Waffe, der „höhere" Mk ist dabei schwächer (weniger Munition) oder
      identisch:
      - `Raketenwerfer Mk I` / `Mk II` — beide 25 Schaden, 70 Speed
      - `Maschinenpistole` / `Mk II` — beide 25 Schaden, 70 Speed
      - `Raketenrucksack` / `Mk III` — beide Flug, kein Mk I/II vorhanden
      - `Dimensionssprung I` / `II` — in allen Werten identisch
      Vorschlag: eigenständige Konzepte mit echtem Zielkonflikt statt
      Scheinsteigerung. IDs und Icons bleiben erhalten.
- [x] **Platzhalter-Schadenswerte aufgewertet.** 52 Waffen tragen den konstanten
      Ersatzwert 25 (`damageSource: "placeholder"`). Diese sollen aus Kategorie,
      Stufe und Rolle abgeleitet echte, unterschiedliche Werte bekommen — die
      Quelldatei liefert für sie keinen Designwert.

### B. Waffen-Mechanik
- [x] **Zünder (fuseTime) für passende Waffentypen.** Aktuell ist `fuseTime` bei
      149 von 150 Waffen 0 (nur die Kaktusbombe hat 1,8 s). Granaten, Minen und
      Abwurfwaffen sollen Zünder von 1–5 Sekunden erhalten, sichtbar als
      Countdown.
- [x] **Zielrichtungsauswahl (Anflugart).** Waffen wie Luftangriff und Artillerie sollen eine
      wählbare Anflugrichtung oder einen Zielbereich bekommen, statt nur „nach
      vorne" zu wirken.
- [x] **Super-Schuss geklärt:** ultimative Fähigkeit eines Charakters, kommt mit den Charakterdaten. Der Befund war: Kraft 100 ist die
      Obergrenze, löst aber nichts aus — kein Sonderfeld, kein Extra-Effekt.
      Der Nutzer hat den Begriff als „Typo" bezeichnet; Bedeutung vor Umsetzung
      bestätigen lassen.

### C. Abwurf und Vorrat
- [x] Abwurfmechanik: Vorrat auf 6 begrenzt, `Q` wirft ab, Kiste bleibt liegen,
      Munition reist mit, Reserve geschützt (`tests/drop-mechanic.test.js`).
- [x] **Abwurf zufällig und physikalisch.** Die Kiste soll nicht
      geprüft danebenfallen, sondern herausgeschleudert werden, eine Flugzeit
      haben und vom Wind beeinflusst werden. Einzige harte Regel: sie darf NICHT
      im Wasser landen.

### D. Bewegung
- [x] **Sprung als echte Physik.** Es gibt derzeit keine `jump`-API; die einzige
      Fortbewegung ist ein horizontaler Versatz von 60 px über den Spezialeffekt
      `MOVE`. Fallschaden ist bereits implementiert und wartet auf Nutzung.
- [x] **Doppelsprung** (zweiter Impuls, einmal je Zug).
- [x] Bodenerkennung (`isGrounded`) („steht auf festem Grund") als Voraussetzung für Sprünge.

### E. Erfolge, Profile, Soziales
- [ ] **100 Erfolge von leicht bis sehr schwer.** Je Erfolg: kurzer Text,
      eigenes Icon, Belohnung, und eine Übersicht der eigenen Erfolge mit
      Hinweis, wie die feindlichen zu holen sind.
- [ ] **Erfolgs-Emblem am Spielernamen** (wie eine Visitenkarte).
- [ ] **Spielerprofile.** Name, Lieblingsnation, Lieblingswaffe, Kennzahlen:
      Schüsse gesamt, Spielzeit, Gesamtschaden, Schaden pro Minute, Trefferquote,
      Siege, Serie.
- [x] **Charaktere.** 9 Fraktionen x 3 Kampfweisen x 3 Charaktere = 81. Namen,
      Biografien, Superwaffen und Staerken/Schwaechen-Profile stehen in
      src/shared/config/factions.js; die Bilder wurden mit
      scripts/extract_factions.py aus den Fraktionsboegen geschnitten.
      OFFEN: die exklusive Waffe je Charakter, die NUR als legendaerer Drop
      erscheint. Die Superwaffe im Katalog ist die Ultimate-Faehigkeit des
      Charakters, NICHT dieser Drop — das sind zwei verschiedene Dinge.

### F. Darstellung
- [x] **Landschaftsgeneration per KI.** 60 Kulissen (12 Biome a 5 Varianten) als
      Bilder vorab erzeugt und eingebaut, dazu ein generativer Baukasten aus Himmel,
      Wasser, Ambiente und Landmarken, der sich jeder Kartengroesse anpasst. Der
      Prompt steht im Katalog; nichts davon entsteht zur Laufzeit — Determinismus
      und Offline-Betrieb bleiben erhalten.
- [ ] Terrain, Wasser und Effekte optisch aufwerten (prozedural: Textur,
      Kantenlicht, Farbtiefe, Partikel).

### G. Betrieb und Backend
- [ ] **Deployment-Konzept.** Prüfen, ob ein dauerhaft laufender Backendserver
      (Hetzner oder RunPod) sinnvoller ist als reines Peer-für-Peer: der Server
      rechnet autoritativ, hält Profile und Erfolge und liefert die Kulissen.
- [ ] Konten und Anmeldung (Profile müssen zuordenbar sein).
- [ ] Auswertung: Wo lohnt KI im Betrieb (Kulissen vorab, Bot-Gegner,
      Auswertung der Partien)?

## Übernommen aus der alten `todo.md`

Die alte Datei wurde gelöscht. Ihre Punkte waren fast alle erledigt (siehe Kopf),
die folgenden waren es nicht — jeder wurde einzeln gegen den Code geprüft:

- [ ] **Onboarding.** Kein Tutorial, keine Klassenübersicht, keine Erklärung von
      Loot und Sidegrades. Geprüft: kein Treffer für `tutorial`/`onboarding` in
      `src/` und `index.html`.
- [ ] **Sidegrades.** Kein System gefunden, das Klassen mit Trade-offs statt mit
      reinen Zuwächsen ausstattet. Geprüft: kein Treffer für `sidegrade`.
- [ ] **Counterplay und Map-Synergie.** Keine Regeln zur Teamzusammenstellung und
      keine Tests dafür. Geprüft: kein Treffer für `counterplay`/`synergie`.
- [ ] **Karten-Authoring über die Presets hinaus.** Es gibt vier Presets
      (`hills`, `mountains`, `islands`, `caverns`). Gewünscht waren zusätzlich
      offene, vertikale, wasserreiche und nahkampflastige Karten.
- [x] **`prefers-reduced-motion`.** Erledigt, siehe P2 — CSS und Canvas.
- [ ] **Release-Härtung.** Anti-Cheat-Audit und Browser-Profiling. (Lasttest und
      Barrierefreiheit stehen schon unter P2/P3.)

### Dabei aufgefallen, nicht behoben

- [x] **Klassen- und Archetyp-Modifier existierten doppelt.** Erledigt: Die
      Helferfunktionen sind entfallen, die einzige Verrechnung ist
      `combatProfile()` in `src/shared/config/classes.js`. Dabei kamen zwei
      weitere Befunde heraus (feste Kopplung von Klasse und Archetyp, Bezugswert
      1,2 gehört zu keinem Archetyp) — siehe „Klassen-Profil: eine Regel, eine
      Stelle".

- [x] **Archetypen wirken im Spiel.** Der frühere Eintrag „nur Config, nicht
      Gameplay" ist damit erledigt: `match.js` setzt Leben und Werte je Archetyp
      tatsächlich ein.

## Bekannte Grenzen (bewusst dokumentiert)

- **Balance-Bericht bei 90 px.** Schwere Artillerie und Ultimate-Waffen sind für
  große Entfernungen gebaut und erscheinen in der Messung als wirkungslos. Das
  ist eine Grenze des Aufbaus, kein Urteil über die Waffe.
- **Keine Client-Prädiktion.** Bei Latenz weicht der eigene Schuss sichtbar vom
  Serverergebnis ab.
- **Persistenz ist dateibasiert.** Für mehrere Serverinstanzen wäre ein
  gemeinsamer Speicher nötig.
- **Erfolge, Profile und Konten existieren nicht.** Alle Kennzahlen werden
  derzeit nirgends dauerhaft erfasst.

- **Klasse und Archetyp sind im Match fest gekoppelt.** Beide werden über
  `index % 3` zugeteilt, es sind also nur drei der neun Kombinationen
  erreichbar (scout/brawler, heavy/artillerist, artillery/occultist). Die
  Tabellen führen neun. Das ist ein offener Balance-Punkt, kein Fehler —
  `combatProfile()` kann alle neun, das Spiel erzeugt nur drei.
- **Fünf Dimensionen der Klassentabellen sind wirksamkeitslos.** `drag`, `mass`,
  Klassentempo, Archetyptempo und `archetype.damage` als Schaden liest der
  Motor nicht; sie stehen in `profil.inert` und sind getestet. Sie zu verdrahten
  ist eine Balance-Entscheidung. Besonders benannt: `archetype.damage` wirkt
  heute als **Tempo**faktor (der Okkultist schießt am schnellsten), obwohl der
  Name Schaden verspricht.
- **Der Bezugswert 1,2 der Archetyp-Abschussgeschwindigkeit gehört zu keinem
  Archetyp** (1,1 / 1,4 / 1,6). Normaltempo ist damit nicht erreichbar.

- **Ein Wiederverbinden auf ein entschiedenes Match startet ein NEUES Match.**
  Beim Ende löscht die Sitzung sich selbst (`#finish` → `onEmpty`), ein späterer
  Beitritt findet keine Sitzung mehr und legt eine neue an — das Match beginnt
  bei Runde 1. Für den Client ist das eher angenehm (es fließen wieder
  Snapshots, kein „für immer veraltetes Brett"), aber zwei Dinge überraschen und
  sind in `tests/server-integration.test.js` festgehalten: Der **Lobby-Status
  bleibt „finished"**, während in ihr wieder gespielt wird, und ein **fremder
  Client kommt nicht mehr hinein**, obwohl dort gespielt wird. Ein „Rematch" ist
  das also nur für die, die schon drin waren.
- **Verpasste `match_over` wird nur auf die PING-Anfrage wiederholt.** Das
  schließt die Lücke (Fehler 32), kostet aber bis zu zwei Sekunden, bis der
  Client es erfährt. Ein eigenes Zeitintervall wäre schneller, würde aber ohne
  Not Nachrichten erzeugen, solange sich niemand meldet.

- **Kein Audio.**
