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
| Unit-/Integrationstests | `npm test` | **666/666** |
| Browser-E2E | `npm run test:e2e` | **164/164** (System-Chrome; 2 bewusst übersprungen) |
| Build | `npm run build` | grün |
| Validierung | `npm run validate` | grün |
| Performance | `npm run perf` | 0 Ticks über 16,7 ms, ~195× Echtzeit |
| Balance | `npm run balance` | Auf Startentfernung 426 px: 113 Waffen mit Schaden am Ziel, 36 Selbstwirkungs-Waffen (alle wirksam), **1 ohne Wirkung** |
| Balance (Sweep) | `npm run balance:sweep` | Über acht Entfernungen (40–850 px): **Median Shots-to-Kill 13**; die eine wirkungslose Waffe ist der „Explosive Energieball" (Zünder, siehe Bekannte Grenzen) |
| Replay | `npm run replay -- record` + `play --verify` | Zustandshash identisch |
| Determinismus | manuell, 3000 Ticks | Seed 4242 → `bc9695fa` reproduzierbar, Seed 9999 → `c0531097` |
| Lasttest | in `npm test` enthalten | 8 Clients / 4 Lobbys stabil |

## Audit 2026-09-17 — vier unabhängige Sichten

Auf Auftrag ein **tiefes Audit** in vier Teilen. Die Berichte stehen in `docs/`:

| Teil | Bericht | Art |
|---|---|---|
| Selbst-Audit (Agent) | `docs/audit-selbst.md` | Code, Architektur, Determinismus, Testabdeckung |
| Fremd-Audit | `docs/audit-code.md` | unabhängiger Code-Audit durch Subagent |
| User-Flow + Spaßfaktor | `docs/audit-userflow.md` | Ablauf, Bedienbarkeit, Spielspaß |
| Black-Box-Test | `docs/audit-blackbox.md` | Spiel als blinder Tester bedient |

Die daraus abgeleiteten offenen Punkte stehen unter **„Offene Punkte aus dem
Audit"** weiter unten.

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
  Tabellen sind drei erreichbar. **BEHOBEN** — siehe „Bekannte Grenzen": Die
  Zuteilung liegt jetzt in `resolveLoadout()` und nimmt eine Wahl aus der
  Match-Konfiguration entgegen; ohne Wahl greift die alte Regel.
- **Der Bezugswert `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp**
  (1,1 / 1,4 / 1,6). Der „neutrale" Fall ist damit nirgends erreichbar; jeder
  Archetyp schießt entweder langsamer oder schneller als normal. Wert
  unverändert übernommen — ihn zu ändern ist eine Balance-Änderung und steht
  offen (siehe „Bekannte Grenzen").
- **Behoben: Das Feld `archetype.damage` hieß falsch.** Es wirkt als
  Tempofaktor, nicht als Schaden. Es heißt jetzt `launch` — Name und Wirkung
  sind deckungsgleich, ohne dass sich ein Faktor ändert.
- Die Tabellen führen Dimensionen, die der Motor **nicht liest** (`drag`,
  `mass`, Klassentempo, Archetyptempo). Sie stehen ausdrücklich unter
  `profil.inert` und sind getestet — eine stille Lüge wäre schlimmer als eine
  benannte Lücke.

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

## Auto-Turret: die letzte fehlende Waffe

`pa_124` stand im Katalog mit `special: 'auto_target'`, aber `SPECIAL_EFFECTS`
kannte den Namen nicht. `buildEffect` lieferte `null` — gemessen, nicht vermutet:

```
buildEffect(WEAPONS_BY_ID.pa_124)  →  null
```

Die Waffe fiel damit in den gewöhnlichen Schusspfad: ein Projektil, das nichts
weiter tut. Der Auto-Turret existierte nur als Katalogeintrag.

### Die Mechanik

Ein Geschütz wird am **eigenen Standort** aufgestellt — deshalb ist es eine
SELBSTWIRKUNG (`SELF_TARGET_KINDS`), kein Projektil. Es feuert in den Folgerunden
von selbst auf den **nächsten lebenden Gegner in Reichweite** und läuft nach drei
Runden ab.

```
Wirkung (abgeleitet aus der Waffe):  damage 23 | range 797 | turns 3
```

Die Zahlen kommen **aus der Waffe**, nicht aus freier Wahl: `damage × 0,6` und
`maxRange × 0,75`. Ein Geschütz, das so viel Schaden macht wie ein Volltreffer,
wäre ein zweiter Schuss gratis in jeder Runde. `turns` ist eine
Balance-Entscheidung und als solche im Code benannt.

**Feuern am RUNDENANFANG, nicht am Zugbeginn.** Ein Geschütz, das an den Zug eines
bestimmten Spielers gebunden wäre, träfe je nach Zugreihenfolge unterschiedlich
oft — mit vier Spielern viermal so oft wie mit zwei.

### Warum die Winkelsuche die Bahn wirklich rechnet

Die Bahn hängt an Schwerkraft, Luftwiderstand, Wind und `gravityScale` der Waffe.
Eine geschlossene Lösung gäbe es nur für die reine Wurfparabel — bei Wind und
gezogenen Waffen läge sie daneben. Deshalb wird für feste Winkel/Kraft-Paare die
**echte Bahn** schrittweise nachgerechnet und der Winkel gewählt, dessen Bahn dem
Ziel am nächsten kommt. Beide Listen sind **fest** (kein Zufall), damit ein Replay
dieselben Schüsse ergibt.

Kein Blindfeuer: Liegt die beste Bahn weiter als 22 px vom Ziel, wird nicht
geschossen.

### Kein ECS-Objekt — mit Absicht

Ein Geschütz bewegt sich nicht, hat keine Gesundheit und wird nicht von
Explosionen getroffen: Es braucht von einem ECS-Objekt nur eine Position. Als
schlichter Eintrag mit **eigenem Kennungszähler** bleibt es außerdem außerhalb der
Entity-ID-Wiederverwendung — der Falle, die in diesem Projekt schon zwei Fehler
verursacht hat (Kisten, Landung).

### Fünf Fehler, die der Turret aufgedeckt hat

**1. Ein zweiter Schuss im selben Zug war möglich — ein Cheat.**
Der Zug endet erst, wenn das Geschoss verflogen ist
(`#hasFired && !projectilesActive`). Solange ein Schuss flog, konnte derselbe
Spieler **erneut** feuern. Gemessen im Aufzeichnungslauf: Spieler 3 schoss bei
Takt 452 **und** 453, ohne Zugwechsel dazwischen. Im Mehrspieler wäre das ein
Exploit: Ein Client muss nur schnell genug nachlegen, bevor sein erster Schuss
landet. Die Prüfung „Spieler ist nicht am Zug" greift erst NACH dem Zugwechsel
und deckte dieses Fenster nicht ab. Jetzt lehnt `fire()` mit „In diesem Zug wurde
bereits geschossen" ab.

Der Test `class-loadout.test.js` („läuft über viele Züge ohne Munitionsnot")
**verließ sich auf diesen Fehler**: Er schoss achtmal mit je EINEM Schritt
dazwischen — der Zug war nie vorbei. Er bestand nur, weil Mehrfachschüsse möglich
waren. Umgebaut: Der Zug wird jetzt ausgespielt, bis er wechselt.

**2. Die Aufzeichnung rundete Winkel und Kraft.**
`recordInput` speicherte `Math.round(angle * 1e6) / 1e6`. Die Wiedergabe schoss
mit `1.145398` statt `1.1453981633974482` — ein Unterschied von 1,6 × 10⁻⁷ rad.
Bei einer Wurfparabel wächst das an: Gemessen wich die Explosion nach rund 200
Takten um 1,2 × 10⁻⁴ px ab (`893.99380811` gegen `893.99393033`), und der
Zustandshash ging **ab Takt 471** auseinander. Eine Aufzeichnung, die das Match
nicht exakt reproduziert, taugt nicht als Beweismittel. Jetzt wird unverändert
gespeichert; die Datei wird wenige Prozent größer.

**3. Eine Eingabe im LETZTEN Takt ging verloren.**
`ReplayPlayer.finished` galt am letzten Takt als wahr (`tick >= totalTicks`), und
die Aufrufer prüfen `finished` **vor** `step()`. Eine Eingabe, die genau auf
diesen Takt aufgezeichnet wurde, wurde nie angewendet. Gemessen (Seed 4242):
letzte Eingabe auf Tick 1205 bei `totalTicks` 1205 → 35 statt 36 angewendete
Eingaben. Behoben mit einem Merker je Takt (`letzterEingabeTakt`), damit die
Eingaben des letzten Takts **einmal** angewendet werden — `step()` wird nach dem
Ende weiter aufgerufen (die Anzeige fragt weiter nach Bildern).

Fehler 2 und 3 zusammen waren der Grund, warum `replay.test.js` nach dem Einbau
des Turrets umfiel. Die erste Messung war irreführend: Der Test lief auf dem Stand
davor grün, die Fehler also **latent** — sie traten nur auf, wenn ein Schuss genau
im letzten Takt fiel, und das hing am Timing.

**4. Ein Geschoss ohne Meldung.**
Das Geschütz feuerte nur `turret_fired`. Gemessen fehlte das `projectile_spawn` zu
seinem Geschoss — wer dieses Ereignis auswertet (Effekte, Ton, Protokoll), hätte
das Geschoss nicht gesehen, obwohl es fliegt. Jetzt meldet es sich wie jedes
andere. Bewusst **kein** `shot`-Ereignis: Das zählt die Schüsse eines Spielers,
und der Eigentümer hat in dieser Runde nicht geschossen — ein zusätzliches `shot`
würde seine Trefferquote verfälschen.

**5. Die Meldung fehlte im LOKALEN Match.**
Die Fälle für `turret_deployed`/`turret_fired`/`turret_expired` waren nur im
**Online-Zweig** (`#handleRemoteEvent`) verdrahtet. Im lokalen Match blieb das
Aufstellen stumm — gemessen stand im Protokoll nur „Schuss abgegeben (60 Kraft)".
Ein Geschütz, dessen Aufstellen niemand gemeldet bekommt, ist für den Spieler
nicht vorhanden. Jetzt in beiden Zweigen. (Derselbe Fehlertyp wie bei den Kisten:
zwei Wege, nur einer verdrahtet.)

### Übertragung (Protokoll v6)

Geschütze sind ein **Spielzustand**, kein Beiwerk: Der Gegner muss wissen, wo eines
steht und wie lange es noch feuert — sonst wäre der Auto-Turret online ein
unsichtbarer Angreifer.

```
Kopf 23 → 24 Byte  ([23] = Geschützzahl)
je Geschütz 8 Byte: id Uint16, x/y Int16 (0,25 px), Team Uint8, Restrunden Uint8
```

Der **Schaden geht nicht mit**: Er ist eine Eigenschaft der aufstellenden Waffe
und für die Anzeige ohne Bedeutung — dort zählt, WO das Geschütz steht und wie
lange es feuert. Kein Delta (wie bei den Kisten): Der einzige Änderungsfall ist
„dasselbe Geschütz verliert eine Runde", und ein Delta bräuchte Kennungen und
Entfernungsmeldungen, die mehr kosten als sie sparen.

### Anzeige

Eigene Form, nicht als Kiste: Sockel mit Rohr in Schussrichtung (aus dem Team
abgeleitet) plus kleine Punkte für die Restrunden. Beides ist im laufenden Spiel
begutachtet — das Geschütz ist von den Figuren unterscheidbar, und die Punkte sind
lesbar. Gezeichnet wird es VOR den Kisten: Lägen beide übereinander, ist die Kiste
(aufhebbar) wichtiger.

### Sechster Fund: die Reihenfolge der Prüfungen verdeckte die Begründung

Die Zug-Sperre stand zuerst GANZ OBEN in `fire()` — und verdeckte damit die
genauere Auskunft. Der E2E-Test „Nachladezeit erscheint in der Waffenliste und
blockiert den Schuss" (Seed 4711) feuert zweimal im selben Zug und erwartete
„lädt nach", bekam aber „In diesem Zug wurde bereits geschossen". Gemessen im
Volllauf: 117 statt 118 grün, genau dieser eine Test.

Beide Aussagen sind wahr. Die Waffe ist die nützlichere Auskunft, weil sie dem
Spieler sagt, WAS ihn hindert — die Zug-Sperre sagt nur, dass gerade nicht
geschossen wird. Die Prüfung steht jetzt NACH Nachladezeit und Munition.
**Blockiert wird in beiden Fällen**; es geht nur darum, welche Begründung der
Spieler liest. Zwei Tests halten beide Fälle fest (Nachladezeit nennt die Waffe,
kühle Waffe nennt den Zug).

## Kulissen für alle acht Formen

Jede Geländeform hat jetzt ein **eigenes Leitbiom mit fünf eigenen Bildern**. Vorher
liefen die vier später hinzugekommenen Formen mit dem `forest`-Rückfall — eine
„Flut" sah aus wie ein Wald.

| Form | Biom | Kulissen |
|---|---|---|
| `islands` | `maritime` | (ursprünglich) |
| `mountains` | `alpine` | (ursprünglich) |
| `hills` | `forest` | (ursprünglich) |
| `caverns` | `caverns` | (ursprünglich) |
| `flooded` | `deluge` | Versunkene Stadt, Monsun, Ertränkter Wald, Reisterrassen, Dammbruch |
| `open` | `open` | Weizenfelder, Heide, Salzpfanne, Polder, Präriesturm |
| `spires` | `spires` | Karsttürme, Dolomiten, Basaltsäulen, Felspfeiler, Eisnadeln |
| `warren` | `warren` | Schlucht, Stadtruinen, Höhlengänge, Bambusdickicht, Schützengräben |

**Die Kulissen sind nach der FORM gewählt, nicht nach Geschmack** — das ist die
Begründung jeder Auswahl:

- `open` ist die **flachste** Form (Höhenvarianz 16). Also weite Horizonte, viel
  Himmel, sanfte Landmarken (`hill_soft`, `dunes`, `mesa`) — **kein** Gipfel im
  Hintergrund, der der Flachheit widerspräche.
- `spires` ist die **steilste** (213, mehr als das Dreifache von `hills`). Also
  senkrechte Formen: Karsttürme, Dolomitenwände, Basaltsäulen, Hoodos, Eisnadeln —
  **kein** `hill_soft`.
- `warren` ist die **zerklüftetste** (47 Geländesprünge je Breite, gedacht für den
  Nahkampf). Also **enge** Orte: Schlucht, Ruinen, Höhlen, Dickicht, Gräben — keine
  offene Landschaft.
- `flooded` ist **wasserreich** (22 % Land). Also Hochwasser in vier Weltgegenden.

Zusätzlich zum Bildkatalog steht je Biom ein Eintrag in `SCENERY_BIOMES` — das ist
der Weg, der im Menü **Vorgabe** ist (generative Szene). Ohne ihn fällt
`pickScenery` weiter auf `forest` zurück, und die Karte sähe trotz vorhandener
Bilder wie ein Wald aus. Die Listen sind auf die Form abgestimmt: Die Flut bekommt
bedeckten Himmel und Sturm (kein `clear_day`, keine Vögel), die Steilwand bekommt
`crystal_spires` und `ice_peaks`, das Gewirr bekommt Regen und Nebel.

### Die Bodenfarben sind nach Sichtprüfungen nachgezogen

Alle 20 neuen Kulissen wurden **im laufenden Spiel** begutachtet, nicht nur im
Katalog. Zwei Runden waren nötig:

1. **Flut:** „Reisterrassen" hatte ein fast grelles Grün über schlammigem Wasser,
   „Monsun" ein zu helles Sandbraun, „Ertränkter Wald" war zu blass. Alle fünf
   liegen jetzt gedämpft und schlammig nahe beieinander — Schlamm ist nicht farbig.
2. **Gewirr:** Die Szenen sind detailreich, und ein zu heller Boden **stach davor
   hervor** statt davor zu liegen (`Schlucht` und `Bambusdickicht`, letzteres am
   stärksten). Beide sind dunkler und in der Farbfamilie ihres Bildes: rostbraun
   über rotem Canyon, **erdig-braun** über grünem Bambus — bewusst nicht grün, denn
   ein grüner Boden würde mit den Halmen verschmelzen und die Oberfläche wäre nicht
   mehr zu erkennen. Erkennbarkeit geht vor Farbnähe.

Beim Dammbruch war der Kontrast zwischen Boden und rotem Wasser zu gering; dort ist
der Boden etwas heller, weil die Oberfläche sichtbar bleiben muss.

### Zwei Testfehler, die dabei herauskamen

**Feste Zahlen statt der Regel.** Drei Tests prüften „12 Biome, 60 Kulissen" und
brachen mit dem neuen Biom — ohne etwas über die Regel zu sagen. Sie leiten die
Zahl jetzt ab (`Biome × 5`, Kataloglänge) und behalten nur die Untergrenze als
Zusage. Dieselbe Lehre wie bei `HEADER_SIZE` im Protokoll.

**Ein Test, der den zufälligen Seed maß.** Der Browser-Test „Vier Formen
unterscheiden sich messbar" startete über den Menüknopf und ließ das Seed-Feld
leer — `startMatch` zog damit einen **zufälligen** Seed. Jeder `messen()`-Aufruf
erzeugte eine andere Karte. Gemessen über vier Läufe:

```
spires:  124, 182, 197, 221      ← vier Läufe, vier Karten
open:     15,4 / 15,7 / 15,7     ← zufällig stabil, weil sehr flach
```

Der Test war ein Wettrennen um 26 Punkte. Mit festem Seed (`SEED = 4242`) sind die
Werte **deterministisch** — drei Läufe hintereinander identisch:

```
open 15,6 | hills 61,5 | spires 212,8 | flooded 242,6
```

Verglichen wird jetzt der **Abstand** (`spires` mehr als doppelt so steil wie
`hills`, `open` weniger als halb so steil), nicht eine Zahl aus einer anderen
Umgebung — der Abstand gilt in jeder Auflösung.

## Flut hat eigene Kulissen

Die Geländeform `flooded` sah bisher aus wie ein **Wald**: Sie hatte kein eigenes
Leitbiom, `pickScenery` fiel auf `forest` zurück. Jetzt hat sie das Biom `deluge`
mit **fünf eigenen Kulissenbildern** — und die sind nicht nur eingetragen, sondern
im laufenden Spiel begutachtet und nachgezogen.

| Variante | Szene |
|---|---|
| `rooftops` | Versunkene Stadt — nur Dachgeschosse und Dächer über dem Wasser |
| `monsoon` | Monsun — braune Flut in einem Delta, Hütten knietief |
| `drowned_forest` | Ertränkter Wald — Stämme im Wasser, Laub auf der Oberfläche |
| `rice_terraces` | Reisterrassen — gestufte Wasserflächen im Morgenlicht |
| `dam_break` | Dammbruch — gebrochene Staumauer, überflutetes Tal |

Dazu: neues Biom in `scenery.js` (bedeckter Himmel, Sturm, Nebel; Schlamm- und
Flachwasser; Ruinen und Waldkanten als Landmarken — **kein** `clear_day` und
**keine** Vögel, eine Sintflut bei Sonnenschein wäre eine andere Karte), fünf
Einträge in `TERRAIN_PALETTES`, das Leitbiom in beiden Tabellen.

### Die Bodenfarben sind nach einer Sichtprüfung nachgezogen

Der erste Anlauf war zu bunt. Im Spiel begutachtet: „Reisterrassen" hatte ein
fast grelles Grün über schlammigem Wasser, „Monsun" ein zu helles Sandbraun, und
„Ertränkter Wald" war zu blass für den Sonnenuntergang. Alle fünf liegen jetzt
nahe beieinander — gedämpft, schlammig, dunkel. Schlamm ist nicht farbig.

Beim Dammbruch war der Kontrast zwischen Boden und rotem Wasser anschließend zu
gering; dort ist der Boden etwas heller, weil die Oberfläche erkennbar bleiben
muss.

### Zwei Testfehler, die dabei herauskamen

**Feste Zahlen statt der Regel.** Drei Tests prüften „12 Biome, 60 Kulissen" und
brachen mit dem neuen Biom — ohne etwas über die Regel zu sagen. Sie leiten die
Zahl jetzt ab (`Biome × 5`, Anzahl der Katalogeinträge) und behalten nur die
Untergrenze als Zusage. Dieselbe Lehre wie bei `HEADER_SIZE` im Protokoll.

**Ein Test, der den zufälligen Seed maß.** Der Browser-Test „Vier Formen
unterscheiden sich messbar" startete über den Menüknopf — und ließ das Seed-Feld
leer, also zog `startMatch` einen **zufälligen** Seed. Jeder `messen()`-Aufruf
erzeugte damit eine andere Karte. Gemessen über vier Läufe:

```
spires:  124, 182, 197, 221      ← vier Läufe, vier Karten
open:     15,4 / 15,7 / 15,7     ← zufällig stabil, weil sehr flach
```

Der Test war ein Wettrennen um 26 Punkte und fiel um, sobald der zufällige Seed
gerade eine flachere `spires`-Karte ergab. Mit festem Seed (`SEED = 4242`) sind
die Werte **deterministisch** — drei Läufe hintereinander identisch:

```
open 15,6 | hills 61,5 | spires 212,8 | flooded 242,6
```

Verglichen wird jetzt der Abstand (`spires` mehr als doppelt so steil wie
`hills`, `open` weniger als halb so steil), nicht eine Zahl aus einer anderen
Umgebung — der Abstand gilt in jeder Auflösung.

## Erfolge: Mechanik und Inhalte

Die Mechanik steht, die Inhalte fehlen — **absichtlich**. Was im Katalog steht,
sind 12 **Muster** (`muster: true`), damit die Mechanik prüfbar ist; im Menü sind
sie als „Muster" gekennzeichnet, damit ein Platzhalterkatalog nicht wie ein
fertiger aussieht.

**Die 12 Muster sind als Beispiele bestätigt** (Entscheidung des Auftraggebers) —
sie bleiben stehen, bis ein vollständiger Katalog kommt, und der Katalog wird
später an genau dieser Stelle ergänzt.

**Die Erfolge sind allgemein** (ebenfalls entschieden): kein Fraktionsbezug, kein
Charakterbezug, eine einzige Liste für alle. Damit ist auch die Frage nach
getrennten Erfolgen je Seite beantwortet — es gibt sie nicht.

### Wie ein Erfolg aufgebaut ist

```
{ id, tier, category, title, text, hint, icon, reward, condition }
   ↑     ↑        ↑                                       ↑
   stabil Mechanik                              nur das ist Mechanik
              (leicht … sehr schwer, 6 Gruppen)
```

`condition` ist eine Bedingung über **flachen Kennzahlen**:

```
{ kind: 'mindestens', kennzahl: 'schaden', wert: 500 }
```

Die Kennzahlen kommen aus **zwei** Quellen und werden zu einem Objekt
zusammengeführt:

| Quelle | Beispiele |
|---|---|
| die Partie | `schuesse_partie`, `schaden_partie`, `sieg_partie`, `trefferquote_partie` |
| das Profil | `partien`, `siege`, `serie_rekord`, `schaden`, `trefferquote`, `schaden_pro_minute`, `verschiedene_waffen` |

Damit braucht die Auswertung **keine Kenntnis des Motors** — sie liest Zahlen.
Ein neuer Erfolg ist eine Zeile in der Tabelle, kein Code; ein ausgetauschter
Katalog lässt die Auswertung unverändert. Genau so ist es geprüft.

### Vier Entscheidungen, die nicht selbstverständlich sind

1. **Fortschritt statt nur erreicht/nicht erreicht.** Ein Erfolg bei 800 von 1000
   zeigt 80 %. Ohne das wäre die Übersicht eine Liste von „nein".
2. **`mindestbasis` verhindert einen zu frühen Erfolg.** Eine Trefferquote von
   50 % ist mit 1 von 2 Schüssen erreicht und sagt nichts. Mit einer Mindestbasis
   muss zuerst eine Mindestzahl Schüsse zusammenkommen; der Fortschritt zeigt
   dann diese erste Hürde (3 von 20), nicht die Quote.
3. **Ein einmal erreichter Erfolg verschwindet nicht.** `serie_rekord` fällt nie,
   aber eine Bedingung über die *aktuelle* Serie könnte wieder darunter fallen.
   Ein Erfolg, der sich zurücknimmt, wäre keiner.
4. **Der Zurücksetzen-Knopf nimmt die Erfolge nicht mit.** Er heißt „Zahlen
   zurücksetzen" und tut genau das. Erfolge sind verdient, keine Kennzahl.
   (Beim Schreiben des Tests fiel auf, dass die erste Fassung sie mitnahm.)

### Zwei Fehler in der eigenen Anzeige

- `profilZuruecksetzen` gab das `PlayerProfile` zurück. Darin sind `erfolge` eine
  **Menge** und `waffen` eine **Karte** — nach der Serialisierung kommt `{}` an,
  und ein Test las `undefined`. Die Debug-Schnittstelle gibt jetzt schlichtes JSON.
- Der Zurücksetzen-Pfad **löschte** den Speichereintrag, statt den neuen Stand zu
  schreiben. Mit „Erfolge bleiben" wäre das ein Datenverlust geworden.

### OFFEN

- **Die 100 Erfolge**: Namen, Texte, Hinweise, Symbole, Belohnungen.
- **Die Symbole als Bilder.** Es gibt keine Bilddateien; die Anzeige verwendet
  ★/☆ und tut nicht so, als gäbe es welche. Ein Symbol je Erfolg gehört zur
  Inhaltslieferung.
- **Erfolge sind ALLGEMEIN — entschieden.** Sie hängen nicht an Fraktionen und
  nicht an Charakteren. Jeder Erfolg gilt für jeden Spieler gleichermaßen, und
  die Übersicht zeigt alle. Damit entfällt die Frage nach „feindlichen" Erfolgen:
  Es gibt keine zwei getrennten Listen. Die Mechanik trägt jeden Erfolg mit
  eigenem Hinweis — das genügt.
- **Belohnungen.** Das Feld ist vorhanden und überall `null`. Was ein Erfolg
  gibt (Waffe, Titel, Emblem, nichts) ist eine Balance- und Designfrage.

## Anti-Cheat: was der Server nicht glaubt

Der Angriffspunkt ist die Steuerleitung. Alles, was der Client schickt, ist eine
Behauptung — der Server entscheidet. Geprüft gegen einen **echten** Server über
echte WebSockets (`tests/anti-cheat.test.js`, 8 Tests): Eine Attrappe würde nur
die Annahmen des Tests bestätigen.

### Was hält

| Angriff | Ergebnis |
|---|---|
| `playerId` des Gegners in der INPUT-Nachricht | abgelehnt — der Server nimmt die Kennung aus dem **Token** |
| `playerId` = 0, 9999, -1, `"1"` | abgelehnt |
| Schuss mit nicht besessener Waffe | abgelehnt („Keine Munition") |
| Auswahl einer nicht besessenen Waffe | abgelehnt **mit Begründung** (keine stille Ablehnung) |
| Tick weit in der Vergangenheit/Zukunft | abgelehnt (Lag-Kompensationsfenster) |
| Kaputtes JSON, unbekannte Typen, 200-fach verschachtelt | abgelehnt, der Server sendet weiter |
| Mehrfachschuss im selben Zug | abgelehnt („Spieler ist nicht am Zug") |

Die wichtigste Zeile ist die erste: Wäre sie nicht so, könnte jeder für jeden
schießen — beliebig oft, ohne Zugzwang. Der Server ruft die Prüfung mit
`seat.entityId` aus dem Token auf und sieht die `playerId` der Nachricht gar
nicht an.

### 47. Nicht-numerische Werte wurden zu gültigen Zahlen

`normalizeInput` wandelte mit `Number(...)` um. Gemessen (mit `validateCommand`)
wurden dadurch **alle** diese Werte akzeptiert:

| Eingabe | wurde zu |
|---|---|
| `{angle: null}` | `angle = 0` |
| `{power: null}` | `power = 0` |
| `{angle: '1.5'}` | `angle = 1.5` |
| `{angle: true}` | `angle = 1` |
| `{angle: []}` | `angle = 0` |

Ein Vorteil war damit nicht zu erlangen — die Werte liegen im erlaubten Bereich.
Das Problem ist ein anderes: Das Drahtformat sagt „Zahl", und eine kaputte
Nachricht wurde zu einem **echten Schuss** statt zu einer Ablehnung. Genau den
Fall soll eine Validierung abfangen.

Behoben: Winkel und Kraft müssen vom Typ `number` sein, sonst `NaN` und damit
abgelehnt.

### 48. Die Nutzlastgrenze war toter Code

`INPUT_LIMITS.maxPayloadBytes` (512 Byte) war definiert und wurde **nirgends
verwendet** — `grep -rn maxPayloadBytes src/` fand nur die Definition.
`parseControlMessage` rief `JSON.parse` auf beliebig große Eingaben auf.
Gemessen: Eine Nachricht mit **1 MB** Füllsel wurde angenommen und geparst.

Behoben im Server **vor** dem Parsen. Bewusst nicht im gemeinsamen Parser: Die
Grenze gilt nur für die Richtung Client → Server — die Waffenbestände aller
Spieler gehen als **eine** Nachricht an den Client und dürfen größer sein.
Gezählt werden Bytes, nicht Zeichen (ein Umlaut zählt im UTF-8 als zwei).

### Ein Testaufbau, der korrektes Verhalten bemängelt hätte

Der erste Anlauf des Mehrfachschuss-Tests sendete zehn Schüsse in einer Lobby mit
**einem** verbundenen Spieler. Gemessen kamen **5 durch** — und das war kein
Fehler: Der zweite Platz gehört einem Bot, der sofort feuert und den Zug
zurückgibt. Das Spiel war wirklich wieder an der Reihe. Der Test hätte also eine
korrekte Zugordnung als Fehler gemeldet.

Der Test besetzt jetzt **beide** Plätze mit verbundenen Clients. Nach dem Schuss
von A ist B am Zug, und B tut nichts — damit bleibt der Zug stehen.

Zwei weitere Testfehler kamen dabei heraus:

- `CONTROL.WEAPON_SELECT` gibt es nicht; richtig ist `SELECT_WEAPON`. Mit dem
  falschen Namen war `t` undefined, und der Server antwortete „Ungültige
  Nachricht" — die Prüfung sah aus, als würde eine fremde Waffe stillschweigend
  akzeptiert.
- Der Test wählte den angreifenden Client anhand eines Snapshots, der noch
  `activePlayerId: null` tragen konnte (vor dem Matchstart). Dafür gibt es jetzt
  `warteAufSnapshot`.

## Kisten im Netzwerk

**Online war kein Loot zu sehen.** Im lokalen Match wurden die Loot-Kisten
gezeichnet, im Online-Match nie. Gemessen mit zwei Browsern an einem echten
Server, vor der Korrektur:

```
PROBE A {"status":"playing","kisten":0,...}
PROBE B {"status":"playing","kisten":0,...}
```

obwohl der Server eine Startkiste führte.

**46. Zwei Stellen waren falsch — und nur zusammen ergaben sie den Fehler.**

1. `onlineViewState` im Client setzte fest `crates: []`. Die Liste konnte gar
   nicht gefüllt werden.
2. `encodeSnapshot` übertrug Kisten überhaupt nicht — es kannte nur Figuren und
   Projektile. Auch `decodeSnapshot` las nichts davon.

Ein Test auf nur einer der beiden Seiten hätte die Lücke nicht gefunden: Der
Encoder war für sich „in Ordnung" (er übertrug, was er kannte), und der Client
war für sich „in Ordnung" (er zeigte, was er bekam).

Behoben mit Protokoll **v5**: Der Kopf wächst von 22 auf 23 Byte (Kistenzahl in
Byte 22), je Kiste 8 Byte (Kennung, x, y, Art, Seltenheit). `inFlight` geht
bewusst nicht mit — es steuert die Landephysik auf dem Server und hat für die
Anzeige keine Bedeutung.

Kisten sind **nicht deltafähig**: Sie gehen bei jedem Snapshot vollständig mit.
Ihre Zahl ist klein, und „dieselbe Kiste bewegt sich" ist der einzige
Änderungsfall; ein Delta bräuchte Kennungen und Entfernungsmeldungen, die mehr
kosten als sie sparen. Ein Test hält fest, dass `toDeltaBase` keine Kisten
erfindet.

### Ein Testfehler, der wie ein Produktfehler aussah

Nach der Änderung fiel `network-conditions` „Nach einem Aussetzer holt der
Vollsnapshot den Client zurück" um — reproduzierbar. Mit zurückgenommenen
Änderungen (`git stash`) war er grün, also sah es nach einer Regression aus.

War es nicht. Der Test prüfte `latestSnapshot.isFull === true`, aber der
Vollsnapshot ist nur rund **50 ms** lang der jüngste (der Server sendet alle 2 s
einen, dazwischen alle 50 ms ein Delta). Bei 100 ms Abtastung wird dieser Moment
**zufällig** getroffen. Gemessen: 2 von 69 Proben. Dass der Test vorher grün war,
war Glück — ein zusätzliches Byte im Kopf hat das Timing verschoben.

Behoben mit einem Zähler (`NetworkClient#stats.fullSnapshots`). Der kann nicht
verpasst werden, und für die Diagnose („holt mich der Vollsnapshot zurück?") ist
er ohnehin das, was man wissen will. **Die Laufzeit des Tests sank von 56 s auf
21 s** — der Beleg, dass vorher gewartet wurde.

### Literale durch Konstanten ersetzt

Drei Tests schrieben die Kopfgröße als `22` und die Protokollversion als `4` fest
und brachen mit der Erweiterung, ohne etwas auszusagen. Sie nutzen jetzt
`HEADER_SIZE` bzw. eine **Mindestversion** („der Wasserstand kam mit v4") — das
sagt, was der Test braucht, und bricht nicht bei jeder Erweiterung.

## Spielerkennzahlen

Schüsse, Treffer, Trefferquote, Schaden, Züge, Runden und Spielzeit je Partie;
darüber ein Profil mit Bilanz, Serie, Siegquote, Lieblingswaffe und Spielzeit.
Angezeigt im Endbildschirm (die Partie) und im Menü (alle Partien).

Die Zahlen kommen aus den **Ereignissen** des Matches (`shot`, `damage`,
`turn_start`, `match_over`), nicht aus einer zweiten Buchführung — so gibt es jede
Zahl nur einmal und sie kann nicht von dem abweichen, was geschehen ist.

### Ein fehlendes Ereignis

Für Projektile gab es `projectile_spawn`, für Treffer `hitscan` und
`projectile_impact` — aber **nichts für einen Schuss, der weder trifft noch ein
Projektil erzeugt**. Die Trefferquote (`Treffer / Schüsse`) hatte damit keinen
Nenner, und für Hitscan-Waffen wäre er grundsätzlich 0 gewesen. Das Ereignis
`shot` entsteht jetzt an einer Stelle in `fire()`, vor der Verzweigung nach
Anflugart; alle drei Wege melden es. Ein Test hält fest, dass jeder erfolgreiche
Schuss genau ein Ereignis ergibt.

### Offen benannte Näherungen

- **„Treffer" ist genähert.** Ein Schuss gilt als Treffer, wenn danach Schaden an
  einem Gegner ankommt. Bei Flächenwaffen kann das mehrere treffen — gezählt wird
  trotzdem **ein** Treffer (der Schuss hat getroffen, nicht drei), sonst wäre die
  Quote über 100 %. Ein Zeitfenster von 240 Takten verhindert, dass späterer
  Schaden einem alten Schuss zugerechnet wird.
- Schaden ohne Verursacher (Sturz, Ertrinken, Günther) und Schaden am eigenen Team
  zählen nicht.
- Die Spielzeit kommt aus den **Takten** des Matches, nicht aus der Uhr des
  Rechners.

### Wo das Profil liegt

Im lokalen Speicher des Browsers (`localStorage`), nicht auf einem Server — es
gibt keine Konten. Das ist eine Zwischenlösung, und sie ist der Grund, warum ein
**Zurücksetzen-Knopf** dazugehört: Ohne ihn wäre die Angabe unerreichbar. Ein
beschädigter Eintrag blockiert das Spiel nicht.

Der Sieg ist während einer laufenden Partie `null`, nicht `false` — eine laufende
Partie darf nicht als Niederlage zählen.

### OFFEN: die Lieblingsnation ist nicht füllbar

Das Feld existiert, die Zeile zeigt aber „—" und nennt den Grund im Menü: Es gibt
keine Charakterwahl, und der Match vergibt keine Fraktion. Bewusst nicht erfunden —
welche Fraktion ein Spieler spielt, ist eine Inhaltsfrage und hängt an der noch
fehlenden Auswahl.

## Landung: ein Fehler, der Matches von selbst entschied

Figuren sprangen mitten im Match von ihrer Position an den **oberen Kartenrand**
und stürzten 340 px tief. Auf allen Karten und Seeds starben sie dadurch im
Stehen, ohne dass jemand geschossen hatte.

**45. Die Oberflächensuche lief in die falsche Richtung.** `CharacterSystem#surfaceY`
soll die Oberfläche unter einer Position finden, die im Festkörper steckt: von
dort nach oben, solange Festkörper ist. Die Schleife ging aber nach oben, solange
`(x, y−1)` **nicht** solide war — in einer Spalte, die über dem Boden nur Luft
enthält, lief sie bis zum oberen Rand durch und lieferte 1. Die Landung setzte die
Figur auf `1 − HALF_HEIGHT`, was die Begrenzung auf `HALF_HEIGHT` anhob.

Spur einer Figur (`open`, Seed 4242):

```
tick 26 | y 360.3 | vy 2.10   ← läuft normal
tick 27 | y  10.0 | vy 0.00   ← SPRUNG an den oberen Rand
```

Fallschaden je Partie, vorher → nachher:

| Karte | Seed | vorher | nachher |
|---|---|---|---|
| `open` | 4242 | 14 × / 186 Schaden | 0 |
| `open` | 7 | 9 × / 123 | 0 |
| `hills` | 4242 | 14 × / 172 | 0 |
| `hills` | 7 | 15 × / 211 | 0 |
| `mountains` | 4242 | 21 × / 188 | 0 |
| `mountains` | 7 | 11 × / 110 | 0 |

### Drei Tests, die in Wahrheit den Fehler prüften

Der Fehler war in den Tests unsichtbar, weil er sie **grün machte**:

1. **`victory-elimination` „Ein Match endet durch Ausschaltung"** — der Helfer
   schoss je Runde mit 45° und 60–90 Kraft. Gemessen trifft das kaum: höchstens
   **9 Schaden bei 100 Leben**, bei einem Schuss je Spieler und Runde und höchstens
   30 Runden. Eine Ausschaltung war rechnerisch unmöglich. Grün war der Test nur,
   weil der Fallschaden die Figuren tötete.
2. **`runtime-smoke` „Match läuft deterministisch bis zum Spielende"** — derselbe
   Aufbau, dieselbe Abhängigkeit.
3. **`drop-mechanic` „Die Kiste landet auf festem Boden"** — der Test las die
   Position der Kiste **nach** der Landung. Eine gelandete Kiste wird aber
   aufgenommen, sobald eine Figur sie berührt (`crate_pickup` → `removeEntity`),
   und ihre Entity-ID wird sofort neu vergeben. Gemessen: Kiste 8 landete, wurde
   aufgenommen, und dieselbe ID 8 trug danach eine andere Kiste — der Test las
   `x=0, y=0`. Vorher fiel das nicht auf, weil die Figuren am Kartenrand standen
   und die Kisten weit weg von ihnen landeten.

Alle drei wurden so umgebaut, dass sie **von** dem Fehler unabhängig sind statt
ihn zu brauchen: Das Match-Ende wird ausdrücklich herbeigeführt (über den
Schadensweg des Motors), und die Kiste wird an der Landeposition aus dem
`crate_landed`-Ereignis geprüft — die steht fest, bevor etwas sie aufheben kann.
Keine Zusicherung wurde abgeschwächt; zwei wurden sogar verschärft (das Match muss
**vor** der Rundengrenze enden, und der Sieger muss das andere Team sein).

## Vier neue Geländeformen

Es gab vier Geländeformen (`hills`, `mountains`, `islands`, `caverns`). Gewünscht
waren zusätzlich offene, vertikale, wasserreiche und nahkampflastige Karten —
hinzugekommen sind:

| Kennung | Name | Eigenart (gemessen) |
|---|---|---|
| `open` | Offene Weite | Höhenvarianz 7 (flach); 41 % freie weite Sichtlinien gegen 15–17 % bei `hills` |
| `spires` | Felsspitzen | Höhenvarianz 191 (steil, mehr als das Doppelte von `mountains`) |
| `flooded` | Flut | nur 22 % Land — die wasserreichste Form |
| `warren` | Gewirr | 47 Geländesprünge je Kartenbreite (gegen 0 bei `hills`) |

Die Werte sind nicht frei gewählt, sondern an Kennzahlen ausgerichtet und danach
justiert. Alle acht Formen sind im Menü wählbar.

### Behobener Fehler

44. **Startfiguren konnten untergetaucht beginnen — das Match war entschieden,
    bevor der erste Zug lief.** Die Startposition war schlicht
    `spacing × (index + 1)` und wurde nicht auf Wasser geprüft. Gemessen bei
    `flooded`: **81 von 480 Figuren (40 Seeds × 12) starteten untergetaucht**
    (Wasserstand ≥ 0,72) und ertranken sofort.

    Bei den vier ursprünglichen Formen fiel das nie auf, weil dort der
    Wasserspiegel tief genug liegt — die Startposition war also nur zufällig
    sicher, nicht geprüft. Behoben mit `#drySpawnX`: Sucht abwechselnd rechts und
    links vom Wunschpunkt eine Stelle mit festem Boden unterhalb von `WET_LEVEL`.
    Die Suchreihenfolge ist fest (rechts vor links, kleine vor großen
    Abständen), damit die Platzierung bei gleichem Seed dieselbe bleibt — der
    Determinismus hängt daran.

    Vorher 81 von 3840, nachher **0 von 3840** — und keine Figur startet auch
    nur nass.

### Zwei Irrtümer, korrigiert statt festgeschrieben

**„Offene Weite ist die offenste Form."** Falsch: `spires` erreicht 43 % freie
weite Sichtlinien, `open` 41 %. Steiles Gelände verkürzt Sichtlinien nicht — wer
auf einem Gipfel steht, sieht weit, und dieses Maß belohnt hohe Positionen.
`spires` ist nicht eng, sondern steil. Der Test wurde entsprechend korrigiert und
prüft jetzt zusätzlich, dass die beiden Formen über ihre EIGENE Eigenschaft
definiert sind (Höhe bzw. Unebenheit).

**„Ohne Leitbiom fällt die Kulisse auf den Gesamtkatalog zurück."** Ebenfalls
falsch formuliert: Der Weg über ein BILD (`pickBackdrop`) wird nur bei
ausdrücklicher Wahl im Menü beschritten. Vorgabe ist die GENERATIVE Szene, und
die fällt ohne Leitbiom auf `forest` zurück. Aufgefallen beim Schreiben eines
E2E-Tests, der `backdrop().key` prüfte und `null` bekam — ein korrekt
gezeichnetes Spiel, das der Test für eine leere Darstellung hielt. Die
Debug-Abfrage liefert jetzt beide Wege, damit die Unterscheidung nicht wieder
verlorengeht.

### TEILWEISE ERLEDIGT: Kulissen für die neuen Formen

Das Projekt verlangt: Jede Geländeform hat ein **eigenes** Leitbiom, und dessen
`mapPreset` ist genau diese Form (`tests/backdrops.test.js`). Ein Leitbiom ist
eine Kulissengruppe mit **eigenen Bildern**.

**`flooded` ist erledigt** — es hat das Biom `deluge` mit fünf eigenen Bildern,
siehe „Flut hat eigene Kulissen".

**Alle vier sind erledigt.** Jede Geländeform hat jetzt ein eigenes Leitbiom mit
fünf eigenen Bildern:

| Form | Biom | Kulissen |
|---|---|---|
| `flooded` | `deluge` | Versunkene Stadt, Monsun, Ertränkter Wald, Reisterrassen, Dammbruch |
| `open` | `open` | Weizenfelder, Heide, Salzpfanne, Polder, Präriesturm |
| `spires` | `spires` | Karsttürme, Dolomiten, Basaltsäulen, Felspfeiler, Eisnadeln |
| `warren` | `warren` | Schlucht, Stadtruinen, Höhlengänge, Bambusdickicht, Schützengräben |

Die Listen `OHNE_LEITBIOM` und `OHNE_KULISSEN` sind **leer** und bleiben als
Prüfstelle stehen: Eine neue Geländeform ohne Kulissen trägt sich dort ein, und
der Test hält die Lücke dann namentlich fest, statt sie stillschweigend
durchzulassen. Die Zuordnung der Biome zu ihren Formen ist eine Zusage — die
Kulissen sind bewusst nach der FORM gewählt (die flachste Form bekommt weite
Ebenen, die steilste bekommt senkrechte Felsformen, die zerklüftetste bekommt
enge Orte), nicht nach Geschmack.

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

26. **Die Schussvorhersage deckte drei zusammenhängende Fehler auf.** Keiner war
    beim Schreiben der Vorhersage geplant; jeder fiel durch eine Messung auf.

    a) **Klasse und Archetyp wurden NIE übertragen.** Der Client musste sie
       erraten — `CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1`, also
       abwechselnd je Listenposition, unabhängig davon, welche Figur der Spieler
       führt. Im Spiel fiel das nicht auf, weil nur Position und Gesundheit
       übertragen wurden. Mit der Vorhersage wurde es sichtbar: Der
       Geschwindigkeitsfaktor folgt der Klasse — gemessen Scout 0,6417 gegen
       Artillery 1,1917. Eine geratene Klasse verschob die angezeigte Flugbahn um
       bis zu einem Drittel. Beide Werte gehen jetzt über die
       Bestandsnachricht (nicht über den binären Snapshot: dessen festes Layout
       müsste zwei Bytes je Spieler für Werte aufgeben, die sich nie während
       eines Matches ändern).

    b) **`classId` ist ein INDEX, `CLASS_IDS` enthält NAMEN.** Der Motor
       konvertiert durchgehend (`CLASS_IDS[classId]`); wer den Index
       unkonvertiert an `combatProfile` gibt, bekommt keinen Fehler und keinen
       leeren Wert, sondern STILL für jede Klasse dasselbe Rückfallprofil
       (`CLASS_DEFINITIONS[0]` findet nichts, also greift der Standard). Die
       Klassen wären damit wirkungslos, ohne dass irgendetwas auffällt.

    c) **`Enter` feuerte nicht.** In `input.js` stand es in der Aufzählung der
       ignorierten Tasten (`if (... || key === 'Enter' || ...) return;`) und
       wurde damit stumm verworfen — während das README „`Enter` | Feuern"
       dokumentierte. Kein einziger E2E-Test hat die Taste je geprüft; die
       Steuerungstabelle war eine Behauptung. Aufgefallen ist es, weil der
       Vorhersage-Test ohne Maus feuern musste (ein Klick verändert den Winkel
       mit). Enter schießt jetzt sofort mit der eingestellten Kraft; die
       Leertaste lädt weiterhin auf.

    **Dazu eine Diagnose-Lücke:** `__PA__.terrainPath()` meldete ohne GPU-Gerät
    `null` statt `cpu` — sie schwieg also im Normalfall. Eine Diagnose, die nur
    im Ausnahmefall spricht, ist keine.

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

- **Unit/Integration (507):** PRNG und Seeds, Loot, Terrain, Wasser und
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
- **Browser-E2E (118):** Laufzeit-Smoke (Menü, Matchstart, HUD, Zielvorschau,
  Schuss, Spielende, Determinismus, Terrainzerstörung), Multiplayer mit zwei
  Browsern und Reconnect, Latenzmessung, Lobby-Browser gegen einen echten
  Server, Tastatur- und Fokusverhalten, Spezialeffekte im Browser (7 Tests:
  Heilung im Protokoll, Schildmarke, Einfrieren, Schaden über Zeit,
  Selbstwirkung ohne Projektil, Lauffähigkeit nach allen Effekten,
  Determinismus). Neu: **Geländeformen** (5 Tests, `terrain-presets.spec.mjs` —
  jede Form in der Auswahl, Start über das Menü mit jeder Form und trockenem
  Grund, Darstellung ohne Fehler, gemessene Unterschiede im Browser),
  **Verbindung unter Störung** (5 Tests,
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
- [x] Client-seitige Prädiktion des eigenen Schusses mit Server-Rollback.
      Erledigt: `src/client/shotPrediction.js` rechnet die Bahn des abgeschickten
      Schusses sofort und zeichnet sie, bevor die Serverantwort eintrifft; die
      Antwort löst sie auf (`resolve`) oder verwirft sie (`discard`), und ohne
      Antwort läuft sie nach 1 s aus. Die Rechnung nutzt DIESELBEN Konstanten und
      dieselbe Schleife wie `MatchController.aimPreview` — ein Test stellt beide
      Bahnen gegen den echten MatchController und verlangt Übereinstimmung auf
      1 px (`tests/shot-prediction.test.js`).
      **Ein Fehler kam dabei ans Licht:** Der Client kannte Klasse und Archetyp
      gar nicht und RIET sie aus dem Listenindex
      (`CLASS_IDS[index % length] === 'scout' ? 0 : 1`). Im Spiel fiel das nicht
      auf, weil nur Position und Gesundheit übertragen wurden; mit der Vorhersage
      wurde es sichtbar, denn der Geschwindigkeitsfaktor folgt der Klasse
      (Scout 0,64 gegen Artillery 1,19 gemessen). Beides geht jetzt über die
      Bestandsnachricht (`classId`/`archetypeId` je Spieler), abgesichert in
      `tests/server-integration.test.js`.
      **Dabei aufgefallen und festgehalten:** `classId` ist im Motor ein INDEX,
      in `CLASS_IDS` steht der NAME. Wer den Index unkonvertiert an
      `combatProfile` gibt, bekommt keinen Fehler, sondern still das
      Rückfallprofil — für jede Klasse denselben Wert. Ein eigener Test
      (`Unkonvertierte Indizes liefern unterschiedliche Faktoren je Klasse`)
      hält das fest.
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
- [x] Optionale WebGPU-Pipeline mit Canvas-2D-Rückfall.
      Erledigt als **Boden-Bäckerei** (`src/client/terrainBaker.js`): Der
      Rechenkern für die Bodenfläche (je Spalte Oberfläche suchen, dann jedes
      Pixel darunter einfärben — bei 1280×720 rund 900 000 Pixel) liegt jetzt
      als reine Funktion vor und kann wahlweise auf der GPU laufen. Der
      Canvas-2D-Weg bleibt der **geprüfte Hauptpfad**.
      **Was hier NICHT behauptet wird:** dass der Shader auf echter Hardware
      läuft. Gemessen in dieser Umgebung: `navigator.gpu` ist im System-Chrome
      VORHANDEN, `requestAdapter()` liefert aber `null` — auch mit
      `--enable-unsafe-swiftshader` (headless, keine GPU). Der GPU-Weg ist
      deshalb ungetestet und ausdrücklich als solcher gekennzeichnet.
      **Was stattdessen geprüft wird** (`tests/terrain-baker.test.js`, 20 Tests):
      dass die FORMEL beide Wege speist (dieselbe Funktion, dieselbe Konstante
      `DEPTH_REACH_PX`), dass der CPU-Weg exakt die Pixel des Rechenkerns
      erzeugt, dass die Erkennung bis zum GERÄT prüft statt nur auf
      `'gpu' in navigator`, und dass ein fehlendes oder werfendes Gerät sauber
      auf die CPU zurückfällt. Da die Erkennung bis zum Gerät geht, wäre die
      naheliegende Prüfung hier fehlgeschlagen — sie hätte „verfügbar" gemeldet.
      **Aufgefallen und behoben:** Die Diagnose (`__PA__.terrainPath()`) meldete
      ohne Gerät `null` statt „cpu" — sie schwieg also im Normalfall. Jetzt nennt
      sie immer den benutzten Weg und den Grund.
      Die Wahl steht im Menü unter „Bodenberechnung" (Vorgabe: CPU). Ohne Wahl
      wird kein Gerät angefordert; im Protokoll steht, ob die Option gegriffen
      hat. E2E: `tests/e2e/prediction-gpu.spec.mjs`.

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
- [x] **Erfolgs-MECHANIK.** Definition als Datentabelle, Auswertung über flache
      Kennzahlen (Partie + Profil), Fortschritt 0..100 %, Persistenz im Profil,
      Übersicht im Menü mit Stand und Hinweis. Siehe „Erfolge: Mechanik und
      Inhalte". **OFFEN: die Inhalte** — die 100 Erfolge (Namen, Texte, Symbole,
      Belohnungen) und die Icons sind Gestaltung und wurden nicht erfunden; im
      Katalog stehen 12 MUSTER (`muster: true`), im Menü als Muster gekennzeichnet.
- [x] **Erfolgs-Emblem am Spielernamen.** Erledigt als **Ableitung ohne
      Gestaltung**: `emblem()` in `src/shared/achievements.js` verdichtet die
      erreichten Erfolge zu Anzahl, Rang (höchster `tier`) und Fortschrittsanteil
      — **kein Symbol, kein Name, kein Text wird erfunden.** Die MASTERDOTO
      nennt genau das als Grund, warum der Punkt offen blieb („Namen, Texte und
      Symbole sind eine Gestaltungsentscheidung des Auftraggebers"); die
      Ableitung liefert deshalb nur Daten, die Darstellung (Farbe je Rang)
      steht im Stylesheet an einer Stelle.
      Angezeigt im HUD in der Spielerliste, **nur am EIGENEN Spieler**: Nur
      dessen Profil liegt vor, ein fremdes Emblem wäre geraten.
      Kein Emblem, solange nichts erreicht ist (`rang: null`) — ein leerer
      Platzhalter wäre irreführend. Ein Tooltip nennt Anzahl, Rang und den
      Hinweis, dass die heutigen Erfolge Muster sind.
      Abgesichert in `tests/emblem.test.js` (8) und
      `tests/e2e/emblem.spec.mjs` (5).
      **Offen bleibt die Gestaltung:** Die 100 Erfolge sind weiterhin Muster
      (`muster: true`, im Menü gekennzeichnet). Namen, Texte und Symbole sind
      deine Entscheidung; die Mechanik nimmt sie auf, ohne Code-Änderung.
- [x] **Spielerprofile.** Name, Lieblingsnation, Lieblingswaffe, Kennzahlen:
      Schüsse gesamt, Spielzeit, Gesamtschaden, Schaden pro Minute, Trefferquote,
      Siege, Serie. **ERFASSEN und ANZEIGEN erledigt** — siehe
      „Spielerkennzahlen". Offen bleibt allein die **Lieblingsnation**: Sie
      braucht eine Charakterwahl, die es nicht gibt, und der Match vergibt keine
      Fraktion. Die Zeile bleibt auf „—" und nennt den Grund im Menü.
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
- [x] **Deployment-Konzept.** Erledigt - siehe `docs/betrieb.md` und die
      ausfuehrliche Fassung unter "Offene Punkte aus dem Audit". Der Server ist
      jetzt startbar (`npm run server`); das Startskript fehlte vorher.
- [ ] Konten und Anmeldung (Profile müssen zuordenbar sein).
- [ ] Auswertung: Wo lohnt KI im Betrieb (Kulissen vorab, Bot-Gegner,
      Auswertung der Partien)?

## Übernommen aus der alten `todo.md`

Die alte Datei wurde gelöscht. Ihre Punkte waren fast alle erledigt (siehe Kopf),
die folgenden waren es nicht — jeder wurde einzeln gegen den Code geprüft:

- [x] **Onboarding.** Erledigt: Der Menü-Bereich „Hilfe" (`details#hilfe-browser`)
      erklärt Klassen, Loot und Gelände in drei Reitern. Die Inhalte werden
      **abgeleitet**, nicht abgetippt: erklärende Sätze stehen als
      `erklaerung`-Felder neben ihren Werten (`classes.js`: 3 Klassen +
      3 Archetypen, `terrainGen.js`: 8 Formen), die Zahlen kommen aus
      `uebersichtFuerHilfe()` bzw. direkt aus `loot.js`/`lootSystem.js`. Der
      Client rendert nur — keine Zahl, kein Satz ist dort hartkodiert.
      Zwei Aussagen, die vorher NIRGENDS im Menü standen: die Loot-Grenze
      (Startwaffen sind nur common/uncommon/rare — episch und legendär gibt es
      ausschließlich über Kisten) und das Startaufgebot je Klasse.
      Abgesichert in `tests/onboarding-hilfe.test.js` (10 Tests ohne Browser)
      und `tests/e2e/hilfe.spec.mjs` (9 Tests, prüfen die ANGEZEIGTEN Werte
      gegen die Configs — eine Anzeige mit veraltetem Wert wäre schlimmer als
      keine).
      **Fund beim Umsetzen:** Der Entwurf versprach, aus `getClassLoadoutDetail()
      .reason` erklärenden Text zu gewinnen. Nachgemessen ist `reason` ein
      maschinell zusammengesetzter Satz („Rolle Flächenwirkung — Wahl der Klasse
      scout") ohne eigene Information; angezeigt werden deshalb Rolle und Waffe.
      Ein Test hält den Befund fest.
      Die drei bewusst NICHT umgesetzten Punkte (Sidegrades, Counterplay,
      Map-Synergie) bleiben offen — dazu liegt der Entwurf in
      `docs/entwurf-onboarding-sidegrades-counterplay.md`.
- [x] **Sidegrades.** Erledigt als datenorientiertes Trade-off-System auf dem
      Kampfprofil. Neue Datei `src/shared/config/sidegrades.js`: vier Einträge
      (`kompakt`, `schwerlast`, `gepanzert`, `praezision`), je mit mindestens
      einem Faktor > 1 UND einem < 1 — das ist die Trade-off-Bedingung und wird
      per Test erzwungen. Die Verrechnung sitzt in `combatProfile()` als
      **optionaler dritter Parameter** (Klasse × Archetyp × Sidegrade in fester
      Reihenfolge): eine Regel, eine Stelle. Der Client rendert nur; die
      Auswahl im Menü ist **je Klasse** (nicht je Platz, weil das Menü die
      Platzvergabe `index % 3` nicht kennt) und wird aus der Config gefüllt.
      Determinismus belegt: kein `Math.random()`, kein neuer Seed-Strom, die
      Wahl ist Match-Konfiguration wie `preset`. Der Replay-Kopf trägt die
      Sidegrades — eine alte Aufzeichnung OHNE das Feld läuft unverändert
      (per Test nachgewiesen, siehe `tests/replay.test.js`).
      **Fund beim Umsetzen:** Die Kennung stand zunächst nicht am Spieler-Objekt,
      obwohl die Verrechnung stimmte — das LEBEN war korrekt, `sidegradeId` aber
      `null`. Die Anzeige hätte raten müssen. `tests/sidegrades-match.test.js`
      hält den Weg ins Spiel jetzt fest.
      Abgesichert in `tests/sidegrades.test.js` (14), `tests/sidegrades-match.test.js`
      (8), `tests/replay.test.js` (+5) und `tests/e2e/sidegrades.spec.mjs` (5).
- [x] **Counterplay und Map-Synergie.** Erledigt als **sichtbare Beziehung ohne
      Multiplikator** — der Entwurf (C.1) wählt diesen Weg bewusst: Counterplay
      findet durch die WAHL statt (Klasse, Sidegrade, Karte), nicht durch eine
      unsichtbare Rechnung. Ein Schadensbonus „Klasse X gegen Y" wäre Number-
      Bloat und für den Spieler nicht erklärbar.
      - `TERRAIN_AFFINITY` in `terrainGen.js`: je Geländeform die begünstigte
        Klasse, **reine Anzeige**. Ein Test hält fest, dass der Motor sie NICHT
        liest.
      - `classCounterplay()` in `classes.js`: leitet „stark gegen / schwach
        gegen" aus den drei **wirksamen** Achsen ab (Leben, Wucht, Reichweite) —
        keine zweite Tabelle.
      - Anzeige: Menü-Zeile unter der Kartenwahl (wandert beim Wechsel mit),
        Counterplay-Zeile je Charakter im Kader, eigener Hilfe-Reiter.
      - Abgesichert in `tests/counterplay.test.js` (9) und
        `tests/e2e/counterplay.spec.mjs` (5).
      **FUND (belegt) — und er war größer als diese Anzeige:** Der Entwurf nahm
      eine Schere-Stein-Papier-Beziehung an. Gemessen war es eine **Rangfolge**,
      weil der Scout auf allen drei wirksamen Achsen der Schwächste war.
      Ursache: Seine Beweglichkeit (`speed: 1.2`) stand unter `inert`.
      **Dieser Befund ist inzwischen BEHOBEN** — `speed` wirkt jetzt auf den
      Absprung, der Scout springt höher als die anderen Klassen. Die Behebung
      samt Messwerten steht unter „Bekannte Grenzen".
      Die Anzeige zählt die Beweglichkeit als eigene Achse mit. Der Scout hat
      damit eine **Stärke**, aber weiterhin keinen **Netto-Vorteil** (er verliert
      auf drei Achsen) — `starkGegen` bleibt für ihn `null`, und die Hilfe sagt
      das ausdrücklich. Ein Test hält diese Unterscheidung fest.
      Abgesichert in `tests/counterplay.test.js` (10), `tests/mobility.test.js`
      (5) und `tests/e2e/counterplay.spec.mjs` (5).
- [x] **Karten-Authoring über die Presets hinaus.** Vier Formen kamen hinzu:
      `open` (Offene Weite), `spires` (Felsspitzen), `flooded` (Flut), `warren`
      (Gewirr) — im Menü wählbar, in ihren Kennzahlen belegt, alle spielbar.
      Dabei ein Fehler gefunden und behoben: Die Startpositionen wurden nicht
      auf Wasser geprüft, ein Match konnte beginnen, wenn beide Figuren bereits
      untergetaucht waren (Fehler 44).
            **Alle Kulissen sind da:** Jede der acht Geländeformen hat ein eigenes
      Leitbiom mit fünf eigenen Bildern (siehe „Kulissen für alle acht Formen").
- [x] **`prefers-reduced-motion`.** Erledigt, siehe P2 — CSS und Canvas.
- [x] **Anti-Cheat-Audit.** Durchgeführt, siehe „Anti-Cheat: was der Server nicht
      glaubt". Zwei Lücken gefunden und geschlossen: nicht-numerische Werte wurden
      zu gültigen Zahlen umgewandelt (`Number(null) === 0`), und die
      Nutzlastgrenze war toter Code (1 MB wurden angenommen). Bestätigt hat sich
      die Kernregel: Die `playerId` des Clients wird ignoriert, der Token
      entscheidet.
- [x] **Browser-Profiling.** Durchgeführt (`tests/e2e/profiling.spec.mjs`,
      `npm run perf:browser`). Gemessen im echten Chrome auf dem Referenzrechner
      (ASUS-Laptop, **Intel HD Graphics 3000 von 2011**, 8 Kerne, 1440×900).

      **Die entscheidende Messung ist ein VERGLEICH, keine absolute Zahl.**
      Absolute Bildzeiten sind hier wertlos: Der leere
      `requestAnimationFrame`-Takt OHNE jedes Spiel liegt schon bei 59,5 ms,
      weil die Rasterung der Maschine selbst der Engpass ist. Ein Spiel, das
      „nur" 62,3 ms braucht, sähe damit genauso langsam aus wie eines, das gar
      nichts tut. Deshalb wird in DERSELBEN Sitzung zweimal gemessen — einmal
      mit pausierter Spielschleife, einmal mit laufendem Spiel:

      | Messung | Mittel | p50 |
      |---|---|---|
      | Leerer Bildtakt (Spiel pausiert) | 59,52 ms | 66,6 ms |
      | Mit laufendem Spiel (`islands`) | 62,32 ms | 66,6 ms |
      | **Aufschlag durch das Spiel** | **2,80 ms** | **0,0 ms** |

      Das Spiel kostet **2,8 ms je Bild** und liegt damit deutlich im
      60-Hz-Budget (16,7 ms). Die restlichen 59,5 ms sind die Umgebung. Der
      p50-Aufschlag ist 0,0 — im Median kostet das Spiel den Bildtakt gar
      nichts.

      **Weitere Belege für denselben Befund:**

      | Messung | Ergebnis |
      |---|---|
      | Isolierte JS-Zeit von `renderer.render()` | **0,18–0,56 ms** je Bild |
      | Bildtakt mit SwiftShader (Software) | 62–72 ms (≈16 fps) |
      | Bildtakt mit der echten GPU (`--use-angle=gl`) | Mittel 21,2 ms, **p50 16,7 ms**, 47,2 fps |

      **Was das NICHT heißt:** dass `islands` auf schneller Hardware zu langsam
      wäre. Zahlen je Geländeform (je 300 Bilder, mit Explosionen und Partikeln;
      derselbe Lauf, ohne parallele Last):

      | Form | Wasseranteil | SwiftShader | GPU | Bemerkung |
      |---|---|---|---|---|
      | `mountains` | 10 % | 28,3 ms / 35 fps | **21,2 ms / 47,2 fps**, p50 16,7 | im Budget |
      | `islands` | 29,9 % | 66,4 ms / 15 fps | **26,0 ms / 38,5 fps**, p50 33,3 | über Budget, aber bedienbar |

      Die Wasser-Ebene kostet rund 2 ms (gemessen bei 30 % Wasserfläche auf
      `islands`) — sie ist NICHT die Ursache der Bildzeit. Der Unterschied
      zwischen `mountains` und `islands` liegt in der Zahl zu compositeierender
      Ebenen.

      **Der Test prüft deshalb den Aufschlag, nicht die Bildrate.** Eine
      60-fps-Schwelle wäre auf dieser Maschine eine Prüfung der iGPU von 2011:
      rot hier, grün auf aktueller Hardware, ohne dass sich am Spiel etwas
      ändert. Geprüft wird `Aufschlag < 16,7 ms` (gemessen 2,8 ms) — eine
      Aussage über das Spiel, die von der Hardware weitgehend unabhängig ist.
      Auf einer Maschine, deren leerer Takt am vsync klebt, ist der Aufschlag
      nicht messbar; der Test überspringt dann MIT Begründung, statt zu raten.
      Die absoluten Zahlen stehen als Annotation im Report.

      Der Terrain-Neuaufbau (Bodenfläche, 1280×720) liegt bei **20–32 ms** über
      fünf Läufe und ist damit der teuerste reine CPU-Schritt; er läuft bei
      Kartenaufbau und Resize, nicht je Bild. Siehe „Optionale WebGPU-Pipeline"
      für den optionalen GPU-Weg dazu.

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

## Offene Punkte aus dem Audit

Abgeleitet aus den vier Audit-Berichten (`docs/audit-*.md`). Nach Schweregrad,
nicht nach Reihenfolge des Findens. Jeder Punkt nennt den Beleg.

### Behebbar ohne Design-Entscheidung

- [x] **974 Zeilen toter Code entfernt.** Fünf Dateien gelöscht:
      `engine/terrain/terrainEngine.js` (494), `engine/weapons/weaponEngine.js`
      (480), `engine/terrainEngine/index.js` (Stub),
      `engine/weaponEngine/index.js` (Stub),
      `engine/weapons/projectArmageddonWorldAdapter.js` (175).
      *Vorher geprüft:* keine statischen Importe, keine dynamischen Importe,
      keine Referenz in der Bau-Konfiguration — und beide Engines hatten einen
      **lebenden Ersatz im Produktivpfad** (`terrain/collisionMask.js` für
      Gelände, `shared/config/weapons.js` für Waffen).
      *Belegt:* Nach dem Löschen blieben `npm test` (685/685) und
      `npm run validate` grün — ohne eine einzige Anpassung.
      *Abgesichert:* `tests/no-dead-code.test.js` prüft jetzt systematisch, dass
      **jede** Datei unter `src/engine/` einen Importeur hat. Ein künftiger
      verwaister Baustein fällt sofort auf.
      Beleg: `docs/audit-selbst.md`, Befund 1.

- [x] **`wurfAbgeleitet` entfernt — 0 Leser.** Vom Agenten selbst im Zug
      „Nahkampf wirft" eingeführt und nie benutzt (21 Einträge im Katalog).
      Fünf weitere Verdachtsfelder wurden in der Einzelprüfung **entlastet**:
      `aoe`, `sourceRarity`, `requiresLineOfSight` und `effectMagnitude` werden
      im Generator gelesen, `cooldownSource` ist als Herkunftsnachweis
      kommentiert.
      Beleg: `docs/audit-selbst.md`, Befund 2.

- [x] **`targeting`: Widerspruch dokumentiert und prüfbar gemacht.**
      Die Designdatei nennt 11 Waffen `directional`, die nachweislich auf den
      **Schützen** wirken (Heilzauber, Eisschild, Auto-Turret …). Bei 139 von
      150 stimmt das Feld.
      *Nicht geändert:* `project_armageddon_weapons_v1.json` ist die
      handgepflegte **Designdatei** — dort ohne Auftrag Werte zu ändern wäre
      derselbe Fehler wie eine Balance-Änderung nebenbei.
      *Stattdessen:* `npm run check:targeting` meldet den Widerspruch mit einer
      **fertigen Korrekturtabelle** (ID, Name, special, Wirkung, Vorschlag), und
      `tests/weapon-targeting.test.js` hält ihn fest.
      *Der Motor leitet korrekt ab* (`SELF_TARGET_KINDS`); das Feld zu
      verdrahten würde 11 Waffen falsch steuern (Heilzauber als Angriff).
      Beleg: `docs/audit-selbst.md`, Befund 2.

- [x] **`sourceRarity` ist Doppelspur zu `rarity` — kein Befund.** Der Verdacht
      kam aus einer Zählung über `src/` allein. Die Nachprüfung zeigt: Beide
      werden genutzt und sind bei allen 150 Waffen identisch, aber sie haben
      verschiedene Herkunft (Quelldatei vs. abgeleitet) und `sourceRarity` wird
      für die Ausgabe des Balance-Berichts gebraucht. Kein Handlungsbedarf.

- [x] **Testabdeckung für `sceneryPainter.js` (599 Zeilen) — geschlossen.**
      Neun Tests in `tests/scenery-painter.test.js`: alle Kulissen aus
      `pickScenery()` zeichnen ohne Absturz, `save`/`restore` sind ausgeglichen
      (kein Zustandsleck), `drawWaterSurface` schweigt ohne Wasserart, der
      Zeichner ist rein, Randgrößen 1×1 bis 3840×2160.
      *Drei weitere Verdachtsfälle wurden entlastet:* `protocol.js` ist über
      zehn Testdateien gedeckt, `terrainEngine.js` und `weaponEngine.js` sind
      toter Code (Befund 1).
      Beleg: `docs/audit-selbst.md`, Befund 3.

- [x] **`renderer.js`: testbare Logik in ein eigenes Modul gezogen.**
      Der Renderer ist in `node --test` nicht ladbar (`import.meta.glob`,
      Vite-spezifisch). Gewählt wurde Weg (b) aus dem Audit: die Zustandslogik
      nach `src/client/effects.js` — Partikelentstehung, Alterung, Aufräumen,
      Strahlen und Blitze. Der Renderer führt nur noch den Zustand.
      *Warum nicht Weg (a) (Vitest):* Das Herausziehen folgt dem Muster, das
      das Projekt schon zweimal nutzt (`terrainBaker.js`, `shotPrediction.js`),
      und macht die Logik ohne neuen Testläufer prüfbar.
      *Dabei einen echten Fehler gefunden:* `radius ?? 0` fängt `NaN` nicht ab —
      eine Explosion mit `NaN`-Radius ergab eine **leere** Partikelwolke, ohne
      dass jemand einen Fehler sah. Der alte Renderer hatte denselben Fehler;
      er ist in `effects.js` behoben.
      *Abgesichert:* `tests/effects.test.js` (15 Tests) — Verteilung,
      Deckelung, Alterung, Aufräumen, Reinheit, Determinismus, Randfälle.
      *Im Browser gegengeprüft:* 16/16 grün in `accessibility` und `profiling`
      nach dem Umbau.
      Beleg: `docs/audit-selbst.md`, Befund 3.

- [x] **Balance-Bericht: Ursachenschätzung korrigiert.** Der Bericht nannte
      pauschal „Platzhalter ohne Designwert — ein Datenmangel, kein Codefehler".
      Das war bei den 21 Nahkampfwaffen schlicht falsch: Sie hatten
      Schadenswerte (20–52), es fehlte die **Mechanik**. Der Bericht schickte
      den Leser in die falsche Richtung.
      Jetzt wird je Waffe die Herkunft des Katalogwerts geprüft
      (`damageSource === 'source'` oder nicht) und danach getrennt gemeldet:
      „Ohne Designwert" gegen „Wirkung fehlt trotz Designwert". Bei der zweiten
      Gruppe nennt er die Zustellart und weist auf den Zünder als mögliche
      Ursache hin.
      *Gemessen nach der Korrektur:* 1 Waffe ohne Wirkung, davon 0 ohne
      Designwert und 1 mit (Explosiver Energieball).
      Beleg: `docs/audit-selbst.md`, Befund 5.

### Design-Entscheidung nötig (nicht eigenmächtig)

- [x] **Zünder-Waffen: Befund gemessen, Entscheidungsvorlage steht.**
      Neues Werkzeug `npm run check:fuses` — es simuliert die Flugzeit mit
      denselben Konstanten wie der Motor und stellt sie dem Zünder gegenüber.

      *Ergebnis:* **Alle 18** Zünder-Waffen zünden nach der Landung, **12 davon
      deutlich** (Faktor > 3):

      | Waffe | Zünder | Flugzeit | Faktor |
      |---|---|---|---|
      | Meteoritenbrocken | 4 s | 0,66 s | **6,1×** |
      | Höllenkanone | 5 s | 0,93 s | 5,4× |
      | Kosmische Wassermelone | 5 s | 0,93 s | 5,4× |
      | Meteorregen | 4 s | 0,93 s | 4,3× |
      | … 8 weitere bei 3,2× | | | |
      | Giftwolke, Giftpilz | 1 s | 0,93 s | 1,1× (knapp) |

      *Offen — Design-Entscheidung:* Für eine **Granate** ist der Zünder richtig
      (sie soll liegen bleiben und dann zünden — taktisch). Für eine
      **Einschlagwaffe** ist er falsch; „Meteoritenbrocken" verspricht einen
      Einschlag, keine Liegezeit.

      *Der Lösungsweg steht im Werkzeug:* **Nicht** nach Namen unterscheiden
      (ein Skript, das „granate" sucht, ordnet irgendwann eine Waffe falsch ein —
      und der Fehler sähe plausibel aus). Stattdessen in der Designdatei je
      Waffe `mechanic.fuseIntent: "timed" | "impact"` setzen; der Generator
      leitet `fuseTime` daraus ab. Dann ist die Absicht **dokumentiert** statt
      erschlossen.
      Beleg: `MASTERDOTO.md`, „Bekannte Grenzen"; Werkzeug `scripts/check-fuses.mjs`.

- [x] **`maxRange`: Faktor gemessen und über alle Kategorien bestätigt.**
      Neues Werkzeug `npm run check:range` — es misst in echten Matches auf
      flacher Karte über sechs Winkel und stellt die Weite der gespeicherten
      `maxRange` gegenüber.

      *Ergebnis (Stichprobe je Kategorie):*

      | Waffe | Kategorie | maxRange | gemessen | Faktor |
      |---|---|---|---|---|
      | Baseballschläger | melee | 110 | 35 | 0,32 |
      | Plasma-Blaster | ranged | 850 | 320 | 0,38 |
      | Salvengeber | heavy_ranged | 919 | 349 | 0,38 |
      | Feuerdämon | elemental | 565 | 210 | 0,37 |
      | Goldene Zauberrolle | magic | 719 | 272 | 0,38 |
      | Quantenblaster | tech | 1062 | 403 | 0,38 |
      | Astralkrieger | ultimate | 565 | 210 | 0,37 |

      **Mittel 0,37, Bereich 0,32–0,38** — kein Ausreißer, ein systematischer
      Faktor.

      *Ursache (belegt):* `simulateProjectileReach` rechnet mit
      `launchSpeedMultiplier = 1,0` (neutrales Klassenprofil). Im Match dämpft
      die Klasse, und der Abschuss beginnt knapp unter der Kopfposition.

      *Warum es kein Fehler ist:* `maxRange` beschreibt die Obergrenze bei
      neutralem Profil — eine Eigenschaft der **Waffe**, nicht des Schützen.

      *Offen — Balance-Entscheidung:* Eine Korrektur würde alle 150 Waffen neu
      bewerten; die Vergleichszahlen des Balance-Berichts wären mit einem Schlag
      anders. **Empfehlung des Werkzeugs:** Den Wert lassen (er ist konsistent
      und dokumentiert), aber in der **Anzeige** klarstellen, dass es die
      Reichweite bei neutralem Profil ist — sonst verspricht die Waffenliste
      mehr, als das Spiel hält.
      Beleg: `MASTERDOTO.md`, „Bekannte Grenzen"; Werkzeug `scripts/check-range.mjs`.

- [x] **Balance der Klasse/Archetyp-Kombinationen ist jetzt gemessen.**
      Neues Werkzeug `npm run balance:classes` — es listet alle **neun**
      Kombinationen mit ihren vier wirksamen Achsen (Leben, Wucht, Tempo,
      Beweglichkeit) und ordnet sie nach einer Summe.

      *Ergebnis:*

      | Kombination | Leben | Wucht | Tempo | Bewegl. | Summe |
      |---|---|---|---|---|---|
      | artillery/occultist | 0,63 | 1,30 | 1,73 | 0,70 | **4,36** |
      | heavy/brawler | 1,56 | 1,00 | 0,92 | 0,80 | 4,28 |
      | artillery/artillerist | 0,72 | 1,30 | 1,52 | 0,70 | 4,24 |
      | heavy/artillerist | 1,04 | 1,00 | 1,17 | 0,80 | 4,01 |
      | scout/brawler | 0,96 | 0,70 | 0,64 | 1,20 | 3,50 |
      | scout/occultist | 0,56 | 0,70 | 0,93 | 1,20 | 3,39 |
      | scout/artillerist | 0,64 | 0,70 | 0,82 | 1,20 | **3,36** |

      *Spannweite:* 3,36 bis 4,36 (Faktor 1,30).

      **BEFUND: Der Scout liegt mit ALLEN drei Archetypen durchgehend zurück**
      (Mittel 3,42 gegen 4,29 beim Artillery — 26 % Abstand). Das ist mehr als
      eine schwache Kombination: Es ist die Klasse selbst.

      *Offen — Design-Entscheidung:* Ob der Scout angehoben wird (mehr Wucht?)
      oder seine Rolle geschärft (Beweglichkeit stärker gewichten, etwa über
      die Sprunghöhe) hängt vom Spielgefühl ab. Die Zahlen liegen vor; die
      Entscheidung nicht.

      *Einschränkung, die im Werkzeug steht:* Die Summe wiegt alle vier Achsen
      gleich und ist ein **grober Indikator**, kein Balancenachweis. Sie zeigt
      Ausreißer, nicht Feinheiten.

### Aus dem Fremd-Audit (Code) — siehe `docs/audit-code.md`

Alle vier Befunde wurden nachgeprüft und **behoben**. Zwei waren ernster als
beschrieben.

- [x] **Geschütz-Zielberechnung rechnete mit dem falschen Wind — BEHOBEN.**
      `#simulateTurretPath` nutzte `currentStrength` (also `wind × 10`) mit
      Faktor 0,02 → effektiv `wind × 0,2` gegen `wind × 1,0` im echten Geschoss.
      Zusätzlich fehlte der Drag auf `vy`.
      *Gemessene Zielabweichung:* bei Windstille +14,6 px, bei Wind 0,05
      −48,4 px, bei −0,05 **+77,7 px**. Nach der Korrektur: **0,00 px** über
      alle Windwerte.
      *Wirkung:* Das Geschütz wählt mit dieser Bahn seinen Schusswinkel — es
      schoss bei starkem Wind systematisch daneben.
      Abgesichert: `tests/turret-ballistics.test.js` (7 Tests).

- [x] **Zustandshash deckte nur einen Teil des Zustands ab — BEHOBEN.**
      Gemessen: Zwei Matches mit völlig verschiedener Ausrüstung ergaben
      **denselben** Hash (`5c9a556d`). Der Hash ist das Beweismittel für
      Determinismus — ein Replay mit anderer Waffe hätte „gleich" gemeldet.
      Behoben: Ausrüstung, Munition, Abklingzeiten, Zustände, Geschütze,
      Mahlstrom, Kisten und Sieger gehen jetzt ein.
      *Dabei einen weiteren Fehler gefunden:* Der Kisten-Eintrag las
      `c.weaponId` — ein Feld, das es bei Kisten nicht gibt.
      Abgesichert: `tests/state-hash.test.js` (10 Tests).

- [x] **Fünf tote Prioritätskonstanten — BEHOBEN.** `CHARACTER_PRIORITY`,
      `DAMAGE_PRIORITY`, `LOOT_PRIORITY`, `MAELSTROM_PRIORITY`,
      `PROJECTILE_PRIORITY` — je 0 Leser. Wer sie änderte, änderte **nichts**.
      Abgesichert: `tests/system-priority.test.js` (5 Tests).

- [x] **`ReplayRecorder.forMatch()` entfernt.** Null Aufrufer, und sie kopierte
      `sidegrades`/`loadouts` nicht in den Kopf.
      Abgesichert: `tests/replay-head.test.js` (8 Tests).

- [x] **Raritäts-Gewichte: eine Quelle statt zwei.**
      `RARITY_WEIGHTS` (`lootSystem.js`) und der Default in der generierten
      `weapons.js` waren zwei Kopien derselben Zahlen.

      Behoben: Der Default ist im **Generator** entfernt; die Funktion **wirft**
      jetzt ohne Gewichte. Damit kann kein Aufrufer mehr stillschweigend auf
      einer zweiten, veralteten Zahl sitzen.
      *Abgesichert:* `tests/rarity-weights.test.js` (7 Tests).

      *Dabei eine Falle gefunden und dokumentiert:* Der Generator bettet den
      Katalog in ein **Template-Literal** ein (ab `const file = \`). Ein
      Backtick in einem neuen Kommentar schließt es vorzeitig — und der
      Parser meldet dann einen Fehler an einer **anderen** Stelle als der
      Ursache. Das kostete mehrere Suchanlaeufe. Der Bereich ist jetzt im
      Generator mit einem Warnhinweis gekennzeichnet, und
      `tests/generator-syntax.test.js` (5 Tests) prüft mechanisch, dass die
      Backticks ausgeglichen sind und beide Dateien parsbar bleiben.

### Aus dem Fremd-Audit (User-Flow/Spaßfaktor) — siehe `docs/audit-userflow.md`

- [ ] **Kisten sind praktisch unerreichbar — Zahlen liegen vor, Entscheidung
      offen.** Aufheberadius **18 px** (`lootSystem.js:25`) bei Karten von
      1280 px Breite.

      *Neu: `npm run check:crates`* — es misst für mehrere Radien, wie oft eine
      Figur in Reichweite kommt. Ergebnis über 6 Partien:

      | Radius | Partien mit Berührung | Berührungen gesamt |
      |---|---|---|
      | **18 px (heute)** | **1 von 6** | **1** |
      | 40 px | 6 von 6 | 757 |
      | 70 px | 6 von 6 | 1.913 |
      | 110 px | 6 von 6 | 3.957 |

      **Der Sprung von 18 auf 40 px entscheidet über alles** — von „1 von 6" auf
      „6 von 6". Der heutige Wert liegt *unterhalb* des Sprungbogens: Eine Figur
      ist 14 px breit, ein Sprung trägt sie weiter. In einer Messung fehlte
      **1 px** (Seed 1137: kleinster Abstand 19 px).

      *Offen — Spielgefühls-Entscheidung:* Der Radius bestimmt, ob eine Kiste
      eine Belohnung für Zufall, eine erreichbare Wahl oder ein Automatismus
      ist. Die Zahlen zeigen, was jeder Wert bewirkt; gewählt ist noch keiner.

- [ ] **Matchdauer 5,7–11,0 min** (8 Seeds gemessen: 31–60 Züge, 29–51
      Schüsse). Für einen Prototyp mit 4 Figuren zu lang; keine Partie endete
      vor Runde 15 durch Ausschaltung — der Mahlstrom ist der Regelweg, nicht
      die Ausnahme. *Hebel:* Startgesundheit senken oder Rundengrenze 30 → ~12.

- [x] **`maximum`-Werte entfernt — dazu ein Widerspruch aufgedeckt.**
      `MATCH_RULES` führte `duelSeconds.maximum: 60`,
      `fourPlayerSeconds.maximum: 40` (je 0 Leser) und
      `teamSize: {minimum: 4, maximum: 6}`.

      *Der `teamSize`-Fall war der ernsteste:* Er widersprach der geltenden
      Regel — `server/lobby.js:36` lässt `playersPerTeam` nur zwischen **1 und 3**
      zu. Die Konfiguration versprach 4–6. Wer dort nachschlug, bekam eine
      falsche Antwort.

      Behoben: Obergrenzen und `teamSize` entfernt; die Zugzeit-Felder heißen
      jetzt `seconds` (nur eine Zahl, keine Scheinstruktur).
      *Abgesichert:* `tests/match-rules.test.js` (6 Tests) — prüft auch, dass
      **kein** Konfigurationsfeld ohne Leser bleibt (Ausnahme: die beiden
      Dimensionsangaben, die ausdrücklich Beschreibung sind).

- [ ] **Mahlstrom greift zu spät — Zahlen liegen vor, Entscheidung offen.**
      Breakpoint heute **Runde 15**.

      *Neu: `npm run check:maelstrom`* — es spielt Partien und protokolliert die
      Endrunden. Ergebnis über 6 Partien: **Keine einzige endete vor Runde 15.**
      Der Mahlstrom ist damit kein Endspiel-Beschleuniger, sondern der Regelweg:
      Er greift, wenn die Partie ohnehin zu Ende geht (Ø 11 Runden unter Sturm).

      *Was die Breakpoints bedeuteten:*

      | Breakpoint | greift nach | verbleibende Runden (Ø) |
      |---|---|---|
      | 4 | Runde 4 | 22,0 |
      | 8 | Runde 8 | 18,0 |
      | 10 | Runde 10 | 16,0 |
      | **15 (heute)** | Runde 15 | 11,0 |

      *Offen — Spielgefühls-Entscheidung:* Ein später Breakpoint räumt auf, ein
      früher (8–10) macht die Verengung zum **Spielziel** — beide Seiten müssen
      sich bewegen und können den Gegner hineinwerfen. Das verkürzt die Partie
      und ändert das Spielgefühl.

- [ ] **Erfolge: Inhalte fehlen, aber die Schwellen sind jetzt geprüft.**
      Alle 11 Erfolge tragen `muster: true`. Die **Mechanik ist vollständig** —
      der Modulkopf sagt ausdrücklich: „Ein neuer Erfolg ist eine neue Zeile in
      der Tabelle, kein Code." Namen, Texte und Symbole sind eine
      Gestaltungsentscheidung (Content).

      *Neu: `npm run check:achievements`* — es spielt echte Partien und prüft die
      Schwellen gegen die gemessenen Werte.

      *Gemessen (3 Seeds, volle Partien):*

      | | Wert |
      |---|---|
      | Runden je Partie | 24 |
      | Schüsse je Partie | 23 |
      | Treffer je Partie | 7 (32 %) |
      | Schaden je Partie | 149 |
      | Dauer je Partie | ~12 min |

      *Ergebnis der Prüfung:* 9 von 11 Mustern sind erreichbar oder in
      Reichweite. **Eines ist praktisch unerreichbar:**

      > **„200 Schaden je Minute"** — verlangt 200, erreicht werden **13**
      > (6 % des Ziels). Bei 12 Minuten Partiedauer und 149 Schaden ergibt das
      > 12 Schaden je Minute; das Ziel verlangt das 17-Fache.

      *Offen — Content-Entscheidung:* Entweder die Schwelle senken (auf ~20 je
      Minute, dann ist sie knapp erreichbar) oder den Text ändern. Die
      Infrastruktur steht; es ist eine Tabellenzeile.

- [x] **Klassen-/Archetypzahlen in der Auswahl — umgesetzt.**
      Vorher zeigte die Auswahl nur die nackten Kennungen („scout", „brawler"),
      obwohl das wirksame Leben je Klasse um Faktor 0,56 bis 1,56 schwankt.

      Neu: Jede Option nennt ihre Wirkung — Klasse: „Leben 0,96 · Schaden 0,70",
      Archetyp: „Tempo 0,64". Die Zahlen kommen aus `combatProfile()`, der
      Quelle, die der Motor liest; eine eigene Liste wäre eine zweite Regel.

      *Beim Archetyp steht das TEMPO, nicht der Schaden:* Er wirkt über
      `launchSpeedMultiplier` auf die Flugbahn. Das Feld hieß früher irreführend
      `damage` und wurde in `launch` umbenannt.

      *Abgesichert:* `tests/e2e/klassenwerte.spec.mjs` (6 Tests) — prüft, dass
      jede Option einen Wert nennt UND dass der genannte Wert mit dem
      übereinstimmt, den `combatProfile()` liefert. Die zweite Prüfung ist die
      wichtigere: Eine Anzeige, die etwas anderes behauptet als die Simulation,
      wäre schlimmer als keine.

- [x] **Abbruchknopf im HUD.** Erledigt - Knopf "Match verlassen" mit
      Rueckfrage, per Tastatur erreichbar, nur im Match sichtbar.

- [x] **Seed-Feld erklaert sich selbst.** Es nennt jetzt beide Seiten
      ("Gleicher Seed = gleiche Karte"; der gezogene Wert steht im Protokoll).
      Das Verhalten blieb bewusst unveraendert: leer = neue Karte, weil ein
      fester Vorgabewert bei jedem Start dieselbe Karte erzeugte.
      **Erledigt:** Das Feld erklaert sich jetzt (Hinweis nennt beide Seiten;
      der gezogene Wert steht im Protokoll). Das Verhalten blieb unveraendert:
      leer = neue Karte, weil ein fester Vorgabewert bei jedem Start dieselbe
      Karte erzeugte. Siehe die ausfuehrliche Fassung unter "Offene Punkte aus
      dem Audit".

### Aus dem Black-Box-Audit (Teilbericht, Agent lief in die Iterationsgrenze)

Der Agent hat als blinder Tester das Spiel über Playwright bedient. Er kam
nicht dazu, seinen Bericht nach `docs/audit-blackbox.md` zu schreiben — die
belegbaren Befunde aus seinem Live-Protokoll sind hier festgehalten und **vom
Agenten nachgeprüft** (zwei erwiesen sich als Fehlalarm):

- [x] **`projectile_impact` fehlte im lokalen Zweig — BEHOBEN.** Die Engine
      sendet den Einschlag (`projectileSystem.js:119`), der lokale
      Ereignisbehandler (`#handleEvents`) behandelte ihn **nicht** — nur der
      Online-Zweig tat es. Folge: Wer lokal spielte (der Standardfall), sah
      keinen Einschlagblitz, und im Protokoll stand nur „ist gelandet".
      Behoben; beide Zweige erzeugen jetzt denselben Blitz.
      Beleg: `tests/event-coverage.test.js`.

- [x] **13 Engine-Ereignisse waren vollständig stumm — BEHOBEN.** Ein neuer
      Test vergleicht automatisch, welche Ereignisse die Engine sendet und
      welcher Client-Zweig sie behandelt. Ergebnis der ersten Messung: 13
      Ereignisse behandelte **kein** Zweig.
      Neu angebunden (mit Wirkung im Spiel): `fuse_armed` („Eine Granate liegt
      und tickt …"), `fuse_expired` („… und gezündet"), `loot_error` (Fehler
      wird gemeldet statt verschluckt).
      Die übrigen zehn sind **bewusst stumm** und einzeln begründet — die
      Darstellung läuft dort über ein anderes Element (Lebensbalken,
      Zustandsmarke, Rundenanzeige) oder das Ereignis dient der Steuerung.
      Beleg: `tests/event-coverage.test.js`, Test 4.

- [x] **Fehlalarm: „Die Kernsteuerung ist wirkungslos" — widerlegt.** Der
      Agent meldete, Pfeiltasten und A/D/W/S änderten nur die Anzeige, nie die
      Simulation. Nachgeprüft mit echtem Messaufbau: `match.fire(playerId,
      angle, power)` setzt `entity.angle` auf den übergebenen Wert (1,000 rad),
      und das Projektil fliegt in genau diesem Winkel (gemessen 0,982 rad nach
      Abzug der Schwerkraft im ersten Schritt).
      *Ursache der Fehlbeobachtung:* Seine Testläufe wurden durch eine
      gleichzeitige Änderung an `src/shared/config/weapons.js` gestört — Vite
      lud die Seite per HMR mitten im Lauf neu (im Protokoll als
      „FRAME NAVIGATED" sichtbar). Der Agent hat das selbst erkannt.

- [x] **Fehlalarm: „Das Protokoll zeigt nur ‚ist gelandet'" — eingeordnet.**
      Das stimmte für den Einschlag (`projectile_impact`, siehe oben). Die
      übrigen Meldungen sind vorhanden: Das Protokoll kennt über 30
      Ereignistypen (Springen, Einfrieren, Heilung, Schild, Günther, Geschütze,
      Kisten, Mahlstrom). Die Beobachtung war ein Ausschnitt, kein Befund.

**Was noch aussteht:** Der Agent erreichte seine Iterationsgrenze, bevor er
seinen Bericht schrieb. Die übrigen zwei Audits (Code, User-Flow/Spaßfaktor)
laufen noch; ihre Ergebnisse kommen in einem eigenen Durchgang.

## Bekannte Grenzen (bewusst dokumentiert)

- **Nahkampfwaffen waren wirkungslos — BEHOBEN (58 von 59 Waffen).**

  *Der Befund:* `npm run balance` meldete **59 der 150 Waffen „ohne jede
  Wirkung"**. Die größte Gruppe waren alle **21 Nahkampfwaffen**: Sie hatten
  Schadenswerte (20–52), aber `projectileSpeed: 0` und `blastRadius: 0`. Der
  Motor kennt keine Nahkampfmechanik — die Waffe war ausrüstbar und abfeuerbar,
  aber es geschah nichts.

  *Die Ursache war ein Codefehler, kein Datenmangel:* Der Generator stufte sie
  als `hitscan` ein (`isMelee || projectileSpeed <= 0`). Ein Hitscan ohne
  Flugweg trifft nichts.

  *Die Behebung:* Nahkampf wirkt als **WURF** (`meleeThrowFor`). Die Wurfstärke
  kommt aus dem `knockback` (der einzige vorhandene Ausdruck für Wucht) und ist
  **deckend** — eine schwere Waffe fliegt kürzer. Gewählt wurde der Wurf, weil
  er den bestehenden Projektilpfad nutzt: keine neue Systemart, kein zweites
  stationäres Element neben dem Geschütz.

  *Vier zusammenhängende Fehler kamen dabei zum Vorschein:*

  | | Fehler | Wirkung |
  |---|---|---|
  | 1 | `isMelee` in der `delivery`-Ableitung | 21 Waffen als Hitscan eingestuft |
  | 2 | Wurf-Ableitung stand HINTER `speedFactorFor` | `speedFactor: 1` — Wurf flog mit 70 statt 27; galt als „850 px weit" |
  | 3 | `speedFactorFor` existierte ZWEIMAL (Generator + eingebettet im Katalog) | eine Korrektur traf nur eine Kopie |
  | 4 | `blastRadius \|\| 24` gab jeder Waffe ein 24-px-Trefferfenster | der Wurf traf den WERFER (104 Schaden am Schützen, 0 am Ziel) |

  *Wirkung, gemessen mit `npm run balance:sweep`:*

  | | vorher | nachher |
  |---|---|---|
  | Ohne jede Wirkung | 59 Waffen | **1 Waffe** |
  | Schaden am Ziel | 55 Waffen | **113 Waffen** |
  | Median Shots-to-Kill | 67 | **13** |

  Die eine verbleibende Waffe ist „Explosiver Energieball" — siehe die
  Zünder-Grenze unten.

  *Belegt durch:* `tests/melee-throw.test.js` (11, Ableitung),
  `tests/melee-throw-match.test.js` (5, Wirkung im Match inkl. Gegenprobe, dass
  sich der Werfer nicht selbst trifft).

- **Die Zünder ALLER 18 Zünder-Waffen sind länger als die Flugzeit.**

  Gemessen: Die Flugzeit eines Projektils beträgt bei voller Kraft rund
  **1 Sekunde**, die Zünder stehen auf **1 bis 5 Sekunden**. Jede Zünder-Waffe
  zündet damit erst **nach** der Landung.

  Für Granaten ist das gewollt — sie sollen liegen bleiben und dann zünden. Für
  „Explosiver Energieball", „Meteoritenbrocken", „Meteorregen" und
  „Höllenkanone" ist es vermutlich falsch: Diese Namen versprechen einen
  Einschlag, nicht eine Liegezeit. Ein einzelner Test deckt es auf: Nur der
  Energieball bleibt dadurch als einzige Waffe „ohne Wirkung".

  **Offen — das ist eine Design-Entscheidung.** Eine automatische Unterscheidung
  nach Namen wäre Namensdeutung und wurde bewusst nicht gebaut.

- **`maxRange` beschreibt die Reichweite bei NEUTRALEM Klassenprofil.**

  `simulateProjectileReach` rechnet mit `launchSpeedMultiplier = 1,0`. Im Match
  dämpft die Klasse (scout/brawler: 0,642), und der Abschuss beginnt 5 px unter
  der Kopfposition. Gemessen (Karte `open`, volle Kraft, bester Winkel):

  | Waffe | `maxRange` | tatsächlich | Faktor |
  |---|---|---|---|
  | Plasma-Blaster (Fernkampf) | 850 | 317 | 0,37 |
  | Baseballschläger (Wurf) | 110 | 30 | 0,28 |

  Der Faktor gilt für **alle 150 Waffen**, nicht nur für Würfe. `maxRange` ist
  damit die Obergrenze, nicht die im Spiel erreichbare Reichweite. Die Zahl
  stillschweigend zu korrigieren wäre eine Balance-Änderung an allen Waffen —
  bewusst unterlassen und hier festgehalten.

- **Die Kopplung von Klasse und Archetyp ist aufgehoben — offen bleibt die
  Balance.**

  *Der Befund:* Beide wurden über DENSELBEN Index zugeteilt (`index % 3`), sodass
  nur drei der neun Kombinationen erreichbar waren — gerade die extremsten
  Profile fehlten:

  | | erreichbar vorher | Tempo |
  |---|---|---|
  | scout/brawler | ja | 0,64 |
  | heavy/artillerist | ja | 1,17 |
  | artillery/occultist | ja | 1,73 |
  | artillery/artillerist | **nein** | 1,52 |
  | heavy/brawler | **nein** | 0,92 |
  | scout/occultist | **nein** | 0,93 |

  Die Tabellen spannen 0,64 bis 1,73 (Faktor 2,7); genutzt wurden drei Punkte
  daraus.

  *Die Behebung:* `resolveLoadout(index, wahl)` in `classes.js` lässt eine Wahl
  aus der **Match-Konfiguration** zu (`MatchController({ loadouts })`). Ohne
  Wahl greift die alte Regel — ein Match ohne die Option verläuft exakt wie
  bisher, ebenso ein Replay aus einer älteren Fassung. Wie bei den Sidegrades
  ist die Wahl Konfiguration, kein Zufall: Sie berührt keinen Seed-Strom.

  *Was offen bleibt:* **Welche Kombinationen sinnvoll sind, ist eine
  Balance-Frage.** Die Entkopplung macht sie möglich, sie bewertet sie nicht.
  Die Balance-Messungen (`npm run balance`) wurden für die drei alten
  Kombinationen erhoben; für die neuen gibt es noch keine Vergleichszahlen.

- **Der Bezugswert `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp.**
  Die Archetypen haben 1,1 (brawler), 1,4 (artillerist), 1,6 (occultist) — kein
  Archetyp schießt also mit unverändertem Tempo, der „Normalfall" ist nirgends
  erreichbar. Eine Normalisierung auf brawler (1,1) würde alle
  Abschussgeschwindigkeiten um rund 8 % verschieben. Das ist eine
  Balance-Entscheidung und bewusst **nicht** nebenbei getroffen;
  `tests/class-profile.test.js` hält den aktuellen Wert fest.

- **Die Klasse/Archetyp-Kopplung als Anzeige-Hinweis.** Die Hilfe nennt die
  Kopplung weiterhin als Hinweis („Im laufenden Match sind nur drei der neun
  Kombinationen erreichbar"). Das gilt für den Standardfall ohne Wahl — wer die
  Konfiguration nutzt, kann alle neun erreichen. Der Hinweis ist damit nicht
  falsch, aber unvollständig; er wird beim nächsten Anzeige-Durchgang
  präzisiert.

- **Der Scout hatte keine wirksame Stärke — BEHOBEN.**

  *Der Befund:* Gemessen über die Achsen, die der Motor liest, war der Scout auf
  allen dreien der schwächste. Seine im Profil angelegte Beweglichkeit
  (`speed: 1.2`, der höchste Wert der Tabelle) stand unter `inert` und wurde
  nicht gelesen — eine Stärke auf dem Papier, keine im Spiel. Folge: Es entstand
  keine Schere-Stein-Papier-Beziehung, sondern eine Rangfolge.

  | Klasse | Leben | Wucht | Reichweite | Bewegung |
  |---|---|---|---|---|
  | scout | 0,96 | 0,70 | 0,64 | **1,20** |
  | heavy | 1,56 | 1,00 | 0,92 | 0,80 |
  | artillery | 1,08 | 1,30 | 1,19 | 0,70 |

  *Die Behebung:* `speed` wirkt jetzt auf den **Absprung**
  (`match.js`, `#mobilityFactor`). Der Sprung ist die einzige Bewegung, die eine
  Figur selbst auslöst, und die Position ist in einem Artillerie-Spiel die
  kostbarste Größe. Die Wirkung ist **getrennt gedämpft** (oben 0,50 / unten
  0,25), weil die Sprunghöhe mit dem Quadrat des Impulses wächst: Ohne Dämpfung
  ergäbe `speed` 1,2 rund +125 % gegenüber dem Heavy.

  Gemessen im Match (`tests/mobility.test.js`, Seed 4242, `hills`):

  | Klasse | Sprunghöhe |
  |---|---|
  | scout | **116,9 px** (+35 % gegenüber Heavy) |
  | heavy | 86,6 px |
  | artillery | 82,0 px |

  Der Scout bleibt damit **unter** dem Höhenunterschied von `hills` (rund 151 px)
  — er kommt nicht über das Gelände hinweg. Heavy und Artillery verlieren nur
  rund 10 % bzw. 15 %, weil ihre Schwäche nicht zusätzlich verschärft werden
  soll.

  Die Beweglichkeit steht jetzt als `mobilityMultiplier` im **Kampfprofil**
  (`classes.js`), nicht in den Rohdaten: `match.js` darf Klassenwerte nicht
  selbst verrechnen (`tests/class-profile.test.js`, „Eine Stelle nur" — der
  erste Anlauf verstieß dagegen und wurde vom Test beanstandet).
  Die Counterplay-Anzeige zählt die Achse mit und zeigt sie als Balken.
  Der Scout hat damit eine **Stärke** — aber weiterhin keinen **Netto-Vorteil**
  (er verliert auf drei Achsen), weshalb `starkGegen` für ihn `null` bleibt.
  Diese Unterscheidung ist Absicht und wird getestet.

- **`import` des Waffen-Generators war ein Schreibvorgang — behoben.**
  Der Schreibvorgang in `scripts/build-weapon-catalog.mjs` stand auf der
  obersten Ebene und lief damit auch beim Import. Nachgemessen: `node -e
  "import('./scripts/build-weapon-catalog.mjs')"` änderte die mtime von
  `src/shared/config/weapons.js`; drei Testdateien importieren aus diesem Modul
  und lösten das mit aus (im Vite-Log als drei `page reload`-Zeilen sichtbar).
  **Unkritisch war es, weil der Generator deterministisch ist** — dieselben
  Bytes, `git status` blieb sauber. **Die Schwäche** zeigte sich in einem
  schreibgeschützten Checkout: Dort brach der Import ab, und der Fehler sah nach
  einem Testproblem aus.

  Der Schreibvorgang hängt jetzt an `import.meta.main`, und zwar **fail-safe**:
  `import.meta.main !== false`. Ein blosses `if (import.meta.main)` würde auf
  Node < 22.13 (`undefined`) NIE schreiben — `npm run weapons:build` liefe ohne
  Fehler durch und der Katalog veraltete still. Bei `undefined` wird deshalb
  geschrieben wie zuvor.

  Abgesichert in `tests/weapon-builder-guard.test.js` — mit echten
  Node-Prozessen, in BEIDE Richtungen: Der Import schreibt nicht UND der
  Programmaufruf schreibt weiterhin. Der zweite Fall ist der wichtigere: Ein
  still nicht mehr erneuerter Katalog würde von keinem bestehenden Test bemerkt,
  weil alle den vorhandenen Katalog lesen.

  **Nebenbefund:** Der Generator und der Katalog führen verschiedene
  Funktionssätze. Der Generator exportiert die ABLEITUNGSFUNKTIONEN
  (`deriveMaxRange`, `deriveCooldown`, `simulateProjectileReach`), die
  Laufzeit-Helfer (`getWeapon`, `orderInventoryBySubcategory`) stehen im
  ERZEUGTEN Katalog — der Generator schreibt sie als Text.
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

  **Gemessen** (`node`, `MatchController` mit 6 Figuren, Seed 4242): Die
  tatsächlich vergebenen Kombinationen sind genau die drei genannten. Was dabei
  unerreichbar bleibt, sind gerade die EXTREME der Tabellen:

  | erreichbar | Tempo-Faktor | unerreichbar | Tempo-Faktor |
  |---|---|---|---|
  | scout/brawler | 0,6417 | scout/occultist | 0,9333 |
  | heavy/artillerist | 1,1667 | heavy/brawler | 0,9167 |
  | artillery/occultist | 1,7333 | heavy/occultist | 1,3333 |
  | | | artillery/brawler | 1,1917 |
  | | | artillery/artillerist | 1,5167 |
  | | | scout/artillerist | 0,8167 |

  Die Spannweite der Tabellen reicht von 0,64 bis 1,73 (Faktor 2,7), das Spiel
  nutzt davon drei Punkte. Wer die Kopplung löst, ändert damit die Balance
  messbar — siehe den Entwurf in
  `docs/entwurf-onboarding-sidegrades-counterplay.md`, der sie im Menü
  ausdrücklich BENENNEN will, statt sie zu verschweigen.
- **Vier Dimensionen der Klassentabellen sind wirksamkeitslos.** `drag`, `mass`,
  Klassentempo und Archetyptempo liest der Motor nicht; sie stehen in
  `profil.inert` und sind getestet. Sie zu verdrahten ist eine
  Balance-Entscheidung.
  **Behoben:** `archetype.damage` stand hier ebenfalls — der Name versprach
  Schaden, der Wert wirkte aber aufs **Tempo** (der Okkultist schießt am
  schnellsten). Das Feld heißt jetzt `launch`; die Umbenennung ändert keinen
  Faktor, nur die Bezeichnung. `speed` ist inzwischen verdrahtet (Absprung,
  siehe „Bekannte Grenzen").
- **Der Bezugswert 1,2 der Archetyp-Abschussgeschwindigkeit gehört zu keinem
  Archetyp** (1,1 / 1,4 / 1,6). Normaltempo ist damit nicht erreichbar — offen,
  siehe „Bekannte Grenzen".

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
