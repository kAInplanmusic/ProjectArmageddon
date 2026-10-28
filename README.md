# ProjectArmageddon

Rundenbasiertes 2D-Artillerie-Taktikspiel für den Browser im Geiste von Worms und Frontschweine. Das Gameplay läuft strikt in 2D, während die Präsentation optional einen 2.5D-Look nutzen darf. Das Projekt setzt auf vollständig zerstörbares Terrain, harte Determinismus-Regeln für Multiplayer und ein datenorientiertes ECS für hohe Performance im Web.

## Schnellstart

```bash
npm install
npm run dev          # Spiel lokal im Browser: http://127.0.0.1:5173
```

Lokales Match: Teams und Karte im Menü wählen, "Match starten".

### Online-Multiplayer

```bash
npm run server       # Autoritativer Server auf http://127.0.0.1:3000
```

Danach im Menü unter **Server** `http://127.0.0.1:3000` eintragen und starten. Der erste Client erstellt die Lobby, weitere Spieler geben die angezeigte **Lobby-ID** ein und treten bei. Ein freies Team bleibt leer: **Es gibt keine Bot-KI** — das Match startet erst, wenn jedes Team einen verbundenen Menschen hat (siehe „Matcharten“).

### Produktion (Single-Origin)

```bash
npm run build        # baut dist/
npm run server       # liefert dist/ UND /ws unter derselben Herkunft
```

## Sonderbiome und Materialien

Dreizehn Sonderbiome (Vulkan, Kristallhöhlen, Dschungel, Eiswüste, Dünen, Schrottplatz, Kristall-Archipel, Riff, Pilzwald
und seit `config.gelaende: 3` die Themenbiome Asteroidenfeld, Surreale Schwebewelt, Fabrik und Burgfelsen; seit `config.gelaende: 4` das Biom Planet in sechs Arten)
mit eigener Geländeform, Palette, Kulisse, Pflanzen und Wetter; Menü „Biom". Dazu eine Materialkarte aus Seed und Biom
(18 Stoffe); mit `config.zerstoerung: 5` bestimmt sie, wie tief und wie weit ein Krater ausfällt. Mit `config.feuer: 2`
brennen Holz und Pilz (Ausbreitung, Asche, Wasser löscht), im Vulkan brechen Lavaströme aus (erstarren zu Basalt oder
Obsidian), und ab Valhalla kommen Flammenwände und Lavarisse (Ragnarök). Die Hilfe (Reiter „Karte und Gelände") zeigt die
Tabelle Material × Schadensart aus der Config. Tabellen in `MASTERDOTO.md` („Biome und Materialien", „Feuer, Lava und Themenbiome").

## Kulissen

160 KI-erzeugte Hintergrundbilder aus sechzehn Biomen mit je zehn Varianten:
fünf Basis-Varianten (Tabelle) und fünf Stimmungen (Heller Himmel, Sternennacht,
Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt). Stimmungsbilder haben wechselnde
Formate und werden per cover-Zuschnitt ohne Stauchen mit horizontalem Parallax
gezeichnet; bei Hochformat nimmt der Renderer die Hochkant-Fassung (`_h`, bei
Ragnarök 2 die von Ragnarök). Es wird nur das gewählte Bild geladen; die
automatische Wahl nimmt nie eine Stimmung. Bei Ragnarök steigert sich ein Glutfilter
mit den Runden (nur Optik).
Die Kulisse liegt hinter dem prozeduralen Gelände und bestimmt dessen Bodenfarbe.

| Biom | Varianten |
|---|---|
| Maritim & Meer | Ruhige See, Sturm bei Nacht, Polarmeer, Kriegshafen, asiatische Karstküste |
| Südsee & Karibik | Karibischer Tag, Sonnenuntergang, Vulkanausbruch, Taifun, polynesische Nacht |
| Gebirge & Alpin | Alpensommer, Hochwinter, Himalaya-Kloster, Kriegsruinen, Mondnacht |
| Wald & Wiese | Sommerwiese, Herbstwald, Winterwald, Nebelnacht, verzauberte Lichtung |
| Stadt & Industrie | Moderne Stadt, Neonnacht, Industrieruine, Kriegsstadt, Monsunstadt |
| Universum | Nebel, Ringplanet, Raumstation, Schwarzes Loch, fremde Welt |
| Abstrakt | Geometrisch, psychedelisch, Vaporwave, Fraktal, surreal |
| Höhlenwelten | Tropfstein, Kristall, Lavaröhre, Eishöhle, Unterwasserhöhle |
| Fantasy | Elfenstadt, Drachenberg, Belagerung, dunkler Sumpf, Kristallmagie |
| Hyperrealismus | Goldenes Tal, Wüste, Polstation, Dschungelfluss, Steilküste |
| Cowboy & Western | Wüstenstadt, Duell im Sonnenuntergang, Lagerfeuer, Wintergrenze, Prärie |
| Film Noir | Regennasse Straße, Hafenkai, verrauchte Bar, Verfolgung, Dachsilhouette |

**Auswahl:** Im Menü unter „Kulisse" (nach Biom gruppiert). „automatisch" überlässt
die Wahl dem Seed — damit bleibt ein Match reproduzierbar, und ein Replay zeigt
dieselbe Landschaft. Ohne Wahl bekommt jede Geländeform ihr Leitbiom (Inseln →
Maritim, Berge → Alpin, Hügel → Wald, Höhlen → Höhlenwelten).

**Bodenfarbe:** Jede Kulisse bringt ihre eigene Bodenfarbe mit. Vorher war der
Boden immer grün — über Packeis, Basalt und Sand gleichermaßen.

**Erzeugen:** Die Prompts stehen im Katalog (`src/shared/config/backdrops.js`) und
sind die einzige Quelle. Neue Bilder laufen über:
`python3 scripts/fetch-backdrops.py <manifest.json>` (Zuschnitt auf 1280×720,
JPEG, Ablage unter `src/client/assets/backdrops/`).

## Fraktionen und Charaktere

Neun Fraktionen zu je neun Charakteren — **81 insgesamt**. Die Inhalte stehen in
`src/shared/config/factions.js`, die Bilder in `src/client/assets/characters/`.

| Datei | Zweck |
|---|---|
| `assets/fraktionen/team 1..9.png` | Quellbögen (3×3, Zeile = Klasse) |
| `scripts/extract_factions.py` | schneidet die 81 Figuren frei |
| `scripts/namen.py` | Positions- und Namensliste der Bögen |
| `scripts/sprite-sheets-klassifizieren.py` | leitet aus den Sprite-Sheets (`assets/sprite-sheets/`, Gehzyklus + Aktionen je Figur) die Rollen der Zellen ab und schreibt sie ins Manifest |
| `src/shared/config/factions.js` | Katalog: Namen, Biografien, Waffen, Profile |
| `src/client/roster.js` | lädt die Bilder, ordnet sie dem Katalog zu |

```bash
python3 scripts/extract_factions.py      # 81 Sprites + 81 HD-Porträts neu erzeugen
```

Im Menü unter **„Kader ansehen"**: neun Reiter, je Fraktion die neun Charaktere
mit Bild, Kampfweise, Superwaffe, Biografie und Stärken/Schwächen.

**Aufbau der Bögen.** Die Zeile bestimmt die Kampfweise (Schwert = Nahkampf,
Bogen = Fernkampf, Stab = Magie), der Platz innerhalb der Zeile die Spielklasse
(0 = heavy, 1 = scout, 2 = artillery). Die Dateien heißen `<zeile><spalte>_<name>.png`.

**Freistellung.** Die Bögen sind RGB-PNG mit eingebranntem Schachbrett als
„Transparenz" (zwei Grautöne, Felder von rund 25 px, je Bogen leicht anderer Ton).
Verfahren in `scripts/extract_factions.py` (numpy/scipy, deterministisch):
Zellen exakt schneiden (Rahmen weg), Töne als glatte Karten aus dem Zellrand
schätzen, den Hintergrund per Flutfüllung entfernen, die mit dem Rand
zusammenhängt (dunkle Konturen halten das Figureninnere zusammen, helle Teile
darin bleiben), eingeschlossene Schachbrettinseln über Gittertest oder flache
Tonflächen entfernen, Randpixel entmischen (Deckungsgrad schätzen, Hintergrund
herausrechnen, kein heller Saum), Namen, Waffensymbol und kleine Reste über
Komponentenanalyse verwerfen (Schwärme und Glühen bleiben). Das
halbtransparente Wasserzeichen (Vierzackstern unten rechts) wird vorher
herausgerechnet. Einzelfälle stehen in `KORREKTUREN` im Skript.

Ausgabe: `src/client/assets/characters/` (256×256, für Anzeigen bis ~128 px) und
`src/client/assets/characters-hd/` (gleiche Dateinamen, quadratisch, in
Quellgröße der Zelle, ~260-350 px, nie hochskaliert). Der Kader zeigt die Liste
mit den 256ern und beim Anklicken einer Figur das HD-Porträt (220 px, lazy).
`tests/portraets.test.js` prüft Alphakanal, Ecken, deckenden Anteil und
Schachbrett-Reste.

**Seitenansichten.** `src/client/assets/characters-side/<fraktion>/NN_name.png`
(256×256, Blick nach rechts, Fußpunkt y=240, `manifest.json` mit `hasSide`,
`anchor`, `facing`) und `src/client/assets/charactersheets/` (Front + Seite je
Figur, 512×256) entstehen mit `scripts/seitenansichten/` (Together AI,
FLUX.1.1-pro Text-zu-Bild, für 72 der 81 Figuren nachgebessert per Bild-zu-Bild
mit dem Porträt als Referenz, FLUX.1-kontext-pro, 2 weitere mit dem Porträt selbst als Seite;
lokale Freistellung); Verfahren, Kosten und Grenzen in
`MASTERDOTO.md`, Prüfung in `tests/seitenansichten.test.js`.

**Waffen-Sprites und Waffen-Animation.** `scripts/waffen-sprites.py`
(`npm run waffen:sprites`, deterministisch, kostenlos, lokal) stellt die 150 Waffen
aus den 1024-px-Originalen frei, richtet sie waagerecht nach rechts aus und packt sie
in 8 Kategorie-Atlanten (`atlas_<kategorie>.png`: held, silhouette, projectile) plus
`atlas_icons.png` mit `manifest.json` (Zellen, Anker grip/muzzle, Drehung,
Projektil, flashColor) unter `src/client/assets/weapon-sprites/` (rund 5,1 MB).
Handkorrekturen in `scripts/waffen-sprites-korrekturen.json`; Verfahren, Pilot mit
KI-Bildern und Kostenhochrechnung in `MASTERDOTO.md`, Prüfung in
`tests/waffen-sprites.test.js` (Kachel-Waffen: Motiv herausgelöst oder Zauber-Orb; Anker aus dem Schwerpunkt; Hand je Figurtyp). Im Spiel hält die Figur die Waffe als Sprite
(`src/client/waffenSprites.js` lädt Manifest und Kategorie-Atlanten lazy,
`src/client/waffenAnimation.js` rechnet Pendeln, Ziehen, Rückstoß, Aufladeglanz und
Mündungsblitz je Kategorie); Geschosse fliegen als Sprite mit Schweif. Fehlt ein Atlas,
bleibt das alte Icon. Tabelle, Anker-Korrekturen und Feinjustierung stehen in
`MASTERDOTO.md` („Waffen-Animation“), die Prüfbögen unter
`docs/bilder/waffen-pruefboegen/` (Anker je Kategorie, Matrix je Fraktion und Figurtyp).

**Bekannter Inhaltsfehler.** Die Bögen 7 und 8 benennen je eine Figur
„Nullpointer Exception" (im Bild deutlich verschieden: vierbeiniges Plattenwesen
gegen schweren Rahmen mit Kanonenarm). Die Namen wurden unverändert aus den Bögen
übernommen (Pixel-Bogen: „Unit A/B" statt „Einheit A/B", „Phantomal" statt
„Phantom-Mal"; ID `phantom-mal-a` bleibt). Erfasst in `NAMING_CONFLICTS`,
geprüft durch einen Test.

## Günther

Ein frei laufender Kleinspitz. Er ist kein Gegner: Er gehört keinem Team, läuft
über die Karte, pinkelt Spieler an und hinterlässt Häufchen. Bei Berührung öffnet
sich ein Glücksrad.

| Was | Wirkung |
|---|---|
| **Anpinkeln** | Schaden, mit jedem weiteren Mal auf denselben Spieler geringer (Fassung 3: 7 → 0,65× je Treffer, Untergrenze 1; Fassung 2: 9 → 0,72×), alle 1,5 bis 2,8 s in 130 px |
| **Häufchen** | Wer hineingerät: 3 Runden Schaden (Fassung 3: 3/Zug, Fassung 2: 4/Zug) und verlangsamte Bewegung (Faktor 0,55); alle 7 bis 11,7 s, höchstens 4 liegen |
| **Berührung** | Glücksrad mit fünf Ausgängen (siehe unten) |

Er erscheint im Mittel **zweimal pro Spiel** — die Zahl wird aber gewürfelt
(Poisson), nicht gesetzt: In etwa 15 % der Spiele kommt er gar nicht, in 18 %
dreimal. Je Auftritt bleibt er drei Runden und läuft auf den nächsten Spieler zu.

**Das Glücksrad** wird in der Simulation gedreht, nicht im Browser: Sonst könnten
zwei Clients verschiedene Ergebnisse zeigen. Die Anzeige dreht nur noch auf den
feststehenden Ausgang zu.

| Ausgang | Anteil | Wirkung |
|---|---|---|
| Du gehst mit Günther Gassi | 30 % | eine Runde aussetzen |
| Du fütterst Günther | 25 % | aussetzen + eine Waffe niederer Seltenheit |
| Du spielst mit Günther | 22 % | aussetzen, dafür +50 bis +100 Leben |
| Günther greift dich an | 18 % | 1–99 Schaden (ab Fassung 3 nie tödlich: mindestens 1 Leben bleibt) |
| **Günther wird Heimdall** | **5 %** | legendäre Waffe, Blitze, Gjallarhorn und Bifröst über dem Feld |

Die Berührung zählt nur beim **eigenen Laufen** — wer stillsteht, berührt nichts.
Nach einem Rad bleibt Günther vier Sekunden unbeteiligt, sonst ginge es dauernd auf.

### Günthers Aktionen (Fassung 2, `config.guenther`)

Neue Partien geben Günther zusätzliche Aktionen, die nach einer zufälligen Pause
mit einem **eigenen Zufallsstrom** (`GUENTHER_AKTION`) gewählt werden — nie
zweimal dieselbe hintereinander, nur wenn die Bedingung stimmt. Das Sprite zeigt
die passende Pose.

| Aktion | Bedingung | Wirkung |
|---|---|---|
| Essen | Kiste in 150 px | frisst die Kiste, heilt den nächsten Spieler um 20 |
| Hüpfen | – | nur Pose |
| Ziehen (Seil) | Spieler in 260 px | zieht ihn zu sich |
| Wühlen | – | kleines Loch ins Gelände, 35 % Chance auf eine ausgegrabene Kiste |
| Kuscheln | Spieler in 90 px | +15 Leben |
| Rücken kraulen | Spieler in 70 px | +28 Leben |
| Sitz / Platz | – | steht still, pinkelt und kackt in der Zeit nicht |
| Wildes Bellen | – | Chaos: scheucht alle im Umkreis von 260 px auf |

Die Marke steht im Replay-Kopf als `config.guenther` (1 = nur Laufen, Pinkeln,
Kacken, Rad; 2 = Aktionen; 3 = Feinschliff nach Messung). Fehlt sie, gilt 1 — Bit
für Bit das alte Verhalten; Köpfe mit 2 laufen unverändert.

### Fassung 3: gemessen statt geschätzt

`npm run balance:tiere` spielt volle Bot-Partien (2x2, 60 Seeds, drei Spielweisen:
Bot steht, Bot sucht die Tiere, Bot sammelt Kisten) und zählt jede Aktion,
Heilung, Schaden, Kisten, Hungerwut und Tiertode. Befund der Fassung 2: Günther
und Cookie verursachten zusammen rund **260 Schaden je Partie** (bei etwa 200
Waffenschaden des Bots), wer neben Cookie stand, wurde bis zu **390 Leben**
geheilt, und der Futternapf fraß **45 %** aller Kisten. Fassung 3 senkt das auf
rund 140 bis 180 Schaden, höchstens ~100 Heilung für eine Figur und 16–34 % Kisten; Tiertode
bleiben bei **0** in 180 gemessenen Partien (kein Soft-Lock, keine Partie
wird allein von einem Tier entschieden). Die Tabellen mit Chance, Effekt, Dauer
und Wartezeit stehen im Hilfe-Reiter „Günther und Cookie" und in
`docs/tiere-balance.md`.

## Cookie, der Kater des Weltuntergangs

Ein zweiter neutraler NPC (`config.cookie`: 2 = Kater, 3 = Feinschliff; fehlt die
Marke, gibt es ihn nicht). Er schläft oder frisst. Sein **Hunger** (0–100) wächst in etwa drei
Minuten (Fassung 2: zwei) von leer auf voll; die Miau-Stufen **leise** (ab 30), **laut** (ab 60)
und **Hungerwut** (ab 85) werden lauter und häufiger — die Lautstärke ist die
Dringlichkeit.

| Was | Wirkung |
|---|---|
| **Füttern** | im Laufen an ihn herangehen: −45 Hunger, +10 Leben; oder eine Kiste in 70 px Nähe (Futternapf, ab Hunger 60, höchstens eine je Minute): −45 (Fassung 2: ab 30, −30) |
| **Kuscheln** | 60 Ticks still daneben stehen: −5 Hunger, +12 Leben, Sperre 50 s, höchstens dreimal je Figur (Fassung 2: −10, +20, 20 s, unbegrenzt) |
| **Toben** | in der Hungerwut: läuft auf den nächsten Spieler zu, reißt alle 12 Ticks ein Loch (Radius 30), zerstört Kisten, schlägt Figuren (25 Schaden, Sperre 2,5 s; Fassung 2: 40 und 2 s) – bis zur Fütterung oder Erschöpfung nach 20 s (Fassung 2: 30 s) |
| **Spielen** | extrem selten (0,8 % je Runde): kosmische Schockwelle – Krater-Ringe, Stoß und nie tödlicher Schaden (10–35) im Umkreis von 60 % der Kartenbreite |

## Steuerung

Die zweite Tabelle ersetzt die erste: Diese Datei führte „Steuerung" zweimal und
widersprach sich dabei (Klick/Leertaste feuert gegen Leertaste springt). Gültig
ist die folgende.

| Taste | Wirkung |
|---|---|
| `A` / `←` | Nach links laufen (gehalten; Stufen und Hänge bis 3 px je Schritt, an Kanten fällt die Figur) |
| `D` / `→` | Nach rechts laufen (gehalten) |
| `W` / `↑` | Nach oben zielen (gehalten; zur Senkrechten hin) |
| `S` / `↓` | Nach unten zielen (gehalten) |
| `Leertaste` oder `Shift` | Gehalten: Schuss aufladen; beim Loslassen feuern (Kraft = Haltedauer, Tippen = schwacher Schuss) |
| `Maus` | Zielen am Zeiger; Klick halten = aufladen, loslassen = feuern |
| `Enter` | Springen (mit gehaltenem `A`/`D` seitlich; in der Luft Doppelsprung) |
| `Rück` (Backspace) | Rückwärtssalto: hoher, weiter Sprung entgegen der Blickrichtung |
| `1`–`9` | Waffe wählen (Nummern wie in der Liste) |
| `P` | Zug überspringen (ohne Schuss; höchstens zweimal hintereinander) |
| `Q` | Aktive Waffe abwerfen |
| `M` | Musik stumm/laut (nicht beim Tippen in ein Textfeld) |
| `T` | Effekte (Schüsse, Einschläge, Treffer) stumm/laut |
| `R` | Match verlassen (zurück zum Menü, mit Rückfrage am Knopf; gibt nicht auf) |

**Gehen (Bewegungsfassung 2, `config.bewegung`):** Die Figur am Zug läuft mit `A`/`D` (72 px/s, mal
Klassenfaktor 0,6–1,4 aus der Beweglichkeit, gebremst von Verlangsamung). Sie folgt Hängen und Stufen bis
`BEWEGUNG.maxStufe` (3 px je Schritt), eine höhere Kante ist eine Wand, ein tieferer Absatz lässt sie fallen
(Fallschaden-Regel und Wasser wie bisher). Solange ein Geschoss fliegt, wird nicht gegangen; danach beginnt der Rückzug (siehe unten). Online geht die Absicht als
`move` an den Server (höchstens 12 Nachrichten/s je Sitz, Absicht verfällt nach 1,5 s ohne Erneuerung); der Client
läuft sofort mit (`laufVorhersage.js`) und gleitet auf den Serverstand zurück. Die Marke steht im Replay-Kopf;
Aufzeichnungen ohne `bewegung` spielen unverändert ohne Gehen. Touch (Hochformat): Knöpfe „Gehen“ links/rechts
(gehalten), Sprung links/rechts, Salto, Abwurf.

**Zugregeln (Fassung 2, `config.zugregeln`):** Nach dem Schuss bleibt der Zug für die **Rückzugsfrist** aktiv
(`ZUGREGELN.rueckzugSekunden`, 5 s): Laufen und Springen gehen, ein zweiter Schuss nicht. Die Zugzeit-Anzeige zeigt die
Frist blau und als „Rückzug“. Sie endet früher, wenn die aktive Figur Schaden nimmt oder stirbt, und der Zug endet erst,
wenn nichts mehr fliegt. **Zug überspringen** (`P`, Touch „Passen“): beendet den eigenen Zug ohne Schuss, höchstens
zweimal hintereinander (ein Schuss setzt den Zähler zurück), nicht in der Zugpause; der Server prüft Token, aktiven
Spieler und je Sitz einen Mindestabstand. **Aufgeben** (Knopf „aufgeben“ im Kopf, mit Rückfrage): die eigenen Figuren
zählen als besiegt, das Match endet wie sonst; online nur für den eigenen Sitz. Die Taste `R` bleibt „Match
verlassen“ und gibt nie still auf. Die Marke `zugregeln` steht im Replay-Kopf (`skip_turn`, `surrender` als Eingaben);
Aufzeichnungen ohne sie spielen unverändert (Zug endet gleich nach dem Schuss).

**Musik:** Hintergrundmusik im Menü und im Match (`src/client/musik.js`, Stücke und
`manifest.json` in `src/client/assets/music/`). Schalter „Musik an/aus“ und Regler
„Musik-Lautstärke“ stehen im Menü und oben im Spiel; die Einstellung liegt in
`localStorage`. `?musik=0` an der Adresse schaltet die Wiedergabe ab (Tests laufen
ohnehin ohne Musik). Einzelheiten und das Ergänzen weiterer Stücke: `MASTERDOTO.md`,
Abschnitt „Musik-System“.

**Effekte:** Schüsse, Einschläge, Treffer, Landungen, Kisten und Hinweistöne sind
erzeugt, nicht geladen (`src/client/klangProfile.js`, `klangSynth.js`, `soundMixer.js`):
14 Schussprofile je Waffenart (Pistole, Gewehr, schwere Waffe, Rakete, Feuer, Eis, Blitz,
Magie, Laser, Strahl, Nahkampf, Wurf, Selbstwirkung, Ultimate) und 56 Ereignisprofile (darunter Einschlag je Schadensart: Feuer, Gift, Eis, Säure, Elektro; Tiere; `kiste_voll`),
Stereolage und Abstand nach der Bildposition, höchstens 24 Stimmen. Schalter „Effekte
an/aus“ und Regler „Effekt-Lautstärke“ stehen im Menü neben der Musik (Taste `T`,
`localStorage` `pa.ton.v1`); in Tests ist der Ausgang stumm, `?ton=1` erzwingt ihn. Die
Offline-Messung aller Profile (Spitze, Dauer, Schwerpunkt, Spektrogramme in `docs/klang/`):
`MASTERDOTO.md`, Abschnitt „Klang-System“.

**Sprung:** Die Sprünge eines Zuges sind **unbegrenzt**. Der erste geht nur vom
Boden, weitere in der Luft. Der Sprung beendet den Zug nicht, damit Sprungfolgen
auslösbar bleiben.

> **Fallschaden bremst das Springen (Stand 2026-10-13, `docs/fallschaden-bremse.md`):** Jeder
> Sprung in der Luft erhöht das Aufpralltempo um `luftsprungZuschlag` (3 px/Takt) über die
> Fallschaden-Schwelle (11 px/Takt). Ein Bodensprung bleibt frei (Aufprall 9,6 px/Takt); ein Luftsprung
> kostet rund 10,8 Leben, drei rund 33, neun rund 87–92 bei 96 Leben. Die Entscheidung „Sprung
> unbegrenzt, Fallschaden beendet“ ist damit umgesetzt (die frühere Messung „freier Flug“ gilt nicht mehr).

**Abwurf:** Der Vorrat fasst sechs abwerfbare Waffen. Ist er voll, wird eine
Waffenkiste nicht aufgenommen; stattdessen muss zuerst abgeworfen werden. Die
abgeworfene Waffe wird **geschleudert** (0,75 s Flugzeit, windbeeinflusst) und
landet als aufhebbare Kiste — nie im Wasser. Die verbleibende Munition reist mit.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server mit Hot Reload |
| `npm run build` | Production-Build nach `dist/` |
| `npm run preview` | Gebauten Client vorschauen |
| `npm run server` | Autoritativer HTTP/WebSocket-Server |
| `npm run matrix` | Erzeugt `docs/matrix-terrain-waffen-wirkung.md` — Wirkung jeder der 150 Waffen, Zerstörungsgrad, Terrain-Arten |
| `npm run matrix:check` | Prüft, ob diese Übersicht noch zum Katalog passt |
| `npm run check:effects` | Prüft, ob jedes Wirkfeld des Katalogs im Motor ankommt |
| `npm run check:targeting` | Prüft die Zielart (`targeting`) gegen die Wirkung — 0 Widersprüche erwartet |
| `npm run check:damage-types` | Prüft Schadensart und Sichtlinie aller 150 Waffen |
| `npm run checks` | **Alle 21 Prüfwerkzeuge in einem Lauf** (~52 s); Exit-Code 1, sobald eines fehlschlägt |
| `npm test` | Unit- und Integrationstests (Integrationstest: `tests/integration-ereignisablauf.test.js` Mini-Partie Schuss bis Klang, `tests/replay-altkoepfe.test.js` Altmarken, E2E `online-einschlag.spec.mjs`): **1955 Tests in 215 Dateien** (alle grün; 2056-10-26: −34 durch den entfernten GPU-Geländeweg, den alten CPU-Bäcker und die Höhlenschattierung samt ihren Tests), ~2 min (Stand 2056-10-25: alle grün; setzt `PA_ZUGPAUSE_SEKUNDEN=0`, damit die Server-Tests ohne Zugpause laufen). Ältere Messreihen und die Zugänge je Datum stehen in `MASTERDOTO.md`. |
| `npm run test:unit` | Nur PRNG/Seed/Loot (schneller Rauchtest) |
| `npm run test:e2e` | Browser-E2E: **359 Tests in 62 Spezifikationen**, ~40 min seriell (Zahl am 2026-10-25 über `npx playwright test --list` gezogen, nachdem `a11y.spec.mjs` und `visuell.spec.mjs` dazukamen; **vollständiger Messlauf 2026-10-25** auf `c21a659` mit `--workers=1`: **59,5 min, 356 grün, 1 rot, 1 übersprungen**; der eine rote (`dynamik` „Treffer im selben Bild klingt NICHT zweimal“) war ein Reihenfolgefehler im Test — der Schaden stand vor dem Schritt, der das Gefühls-Gedächtnis des Renderers zurücksetzt — und ist behoben (7/7 grün, dreimal). Der Übersprung ist Selbstschutz: `prediction-online` „abgelehnter Schuss“ (Client bereits am Zug); `profiling` läuft auf dieser Maschine auf ECHTER GPU (ANGLE, Intel HD 3000) und ist grün. Voriger Messlauf 2026-10-21: 309 grün, 0 rot, 2 übersprungen auf aa28a29. Zahl der Tests über `npx playwright test --list`). 7 davon messen Bildzeiten; sie sind LASTempfindlich — parallel zu schreibenden Arbeitern werden sie rot, ohne dass etwas kaputt ist (gemessen: 900 ms längstes Bild gegen ein 500-ms-Limit). Siehe `docs/testgrenzen.md` |
| `npm run test:all` | Tests und E2E hintereinander |
| `npm run lint` | ESLint (CI-Gate, bricht bei Fehlern ab) |
| `npm run smoke` | Headless-Match bis Spielende |
| `npm run perf` | Performance-Profil mit 60-Hz-Budget-Gate |
| `npm run balance` | Balance-Bericht über alle 150 Waffen |
| `npm run replay` | Replay aufzeichnen/abspielen (`record`, `play`, `info`) |
| `npm run icons` | Waffen-Icons erzeugen (Pillow, ohne ImageMagick) |
| `npm run waffen:sprites` | Waffen-Sprite-Sheets + Manifest erzeugen (Pillow, numpy, scipy) |
| `npm run validate` | Modulimporte prüfen |
| `npm run weapons:build` | Waffenkatalog aus der Designdatei generieren |

E2E-Browserwahl ist portabel: lokal wird der System-Chrome genutzt, auf CI das
Playwright-Chromium. Erzwingen mit `PLAYWRIGHT_CHANNEL=chrome|bundled`.

### Replay verwenden

```bash
# Ein Match aufzeichnen
npm run replay -- record --seed=20260910 --rounds=8 --out=artifacts/lauf.json

# Abspielen und die exakte Reproduzierbarkeit bestätigen
npm run replay -- play artifacts/lauf.json --verify
```

`--verify` vergleicht Status, Runde, Tickzahl und den Zustandshash gegen die
Aufzeichnung. Weicht etwas ab, endet der Befehl mit Exit-Code 1 — der Befehl ist
damit als Determinismusprüfung in Skripten nutzbar.

### Zustandsabfrage

`GET /healthz` liefert neben Status und Protokollversion auch Betriebszähler
(Verbindungen, Trennungen, gesendete Snapshots, angenommene und abgelehnte
Kommandos, Fehler, Lobby-Erstellungen, Uptime) sowie einen `healthy`-Schalter,
der verwaiste Sitzungen meldet:

```bash
curl -s http://127.0.0.1:3000/healthz | python3 -m json.tool
```

### Lobby-Browser

Im Menü unter „Offene Lobbys anzeigen“ lassen sich laufende Lobbys vom Server
auflisten. Voraussetzung ist eine eingetragene Server-URL — ohne sie wird lokal
gespielt. Die Liste wird beim Aufklappen und über den Knopf „Lobbys laden“
aktualisiert; ein Klick auf „Beitreten“ übernimmt nur die Lobby-ID ins Formular,
gestartet wird weiterhin über „Match starten“. Wiederbeitritts-Token werden
dabei nicht angezeigt.

### Matcharten — ein Mensch führt ein Team

Ein Team = ein Mensch. Das Menü stellt beide Zahlen ein: **Teams** (2–8) und
**Einheiten je Spieler** — und die zweite Zahl ist keine freie Wahl, sondern die
Matchart:

| Matchart | Spieler (Teams) | Einheiten je Spieler | Figuren |
|---|---|---|---|
| klein | 2–4 | 3 | 6–12 |
| groß | 4 | 4 | 16 |
| Krieg | 6–8 | 5 | 30–40 |

Wer ein Match startet, besetzt also ein GANZES Team: Alle Einheiten dieses Teams
gehören ihm. **Es gibt keine Bot-KI**: Ein unbesetztes Team bleibt leer, und die
Simulation läuft erst, wenn jedes Team einen verbundenen Menschen hat. Die
Zugordnung bleibt „jede Einheit einzeln" (S1E1, S2E1, S1E2 …) — nie zweimal dieselbe Seite
hintereinander, und die Zugzeit gilt je Zug.

Einen Modus mit **einer** Einheit je Spieler gibt es nicht: Bis 2026-09-20 nahm
jeder Beitritt genau einen Platz ein (ein Mensch = eine Figur), was den Matcharten
widersprach. Mit `unitsPerPlayer` in `POST /api/lobby/create` besetzt ein Beitritt
das ganze Team; das Feld wird auch im Lokalspiel ausgewertet.

### Balance messen

```bash
npm run balance                      # alle Waffen
npm run balance -- --tier=legendary  # nur eine Stufe
npm run balance -- --json            # maschinenlesbar
```

Gemessen wird ein Einzelschuss pro frischem Match auf gleicher Höhe. Waffen ohne
Wirkung gibt es nach `npm run balance` keine (0). Waffen ohne Schaden im Einzelschuss sind
Selbstwirkungen (Düsenrucksack, Dimensionssprung, Raketenrucksack …) und Nahkampfwaffen, die nur mit
Annäherung wirken (40 Waffen ohne Schaden auf 854 px, Stand 2026-10-13).

## Architektur

```text
index.html                  Browser-Shell mit HUD, Menü, Endscreen
vite.config.mjs             Build-/Dev-Konfiguration
playwright.config.mjs       E2E-Konfiguration
src/
  client/
    main.js                 Einstieg: lokaler + Online-Modus, Game-Loop, Debug-API
    renderer.js             Canvas-Rendering (Terrain, Wasser, Figuren, Vorschau)
    terrainBaker.js         Bodenfläche: reiner Rechenkern + optionaler WebGPU-Weg
    shotPrediction.js       Vorhersage des eigenen Schusses (Online) mit Rollback
    input.js                Maus-/Tastatureingabe
    hud.js                  DOM-HUD (Runde, Wind, Zugzeit, Listen, Protokoll)
    networkClient.js        WebSocket-Client, Interpolation, Reconnect
    terrainPreview.js       Terrain-Rekonstruktion aus dem Server-Seed
  engine/
    match.js                MatchController: verbindet alle Systeme
    headless.js             Rendering-freie Runtime
    events.js               gepufferter Event-Bus
    waterField.js           zelluläres Wasser
    inventory.js            Waffen und Munition
    ecs/                    World, ComponentStore (TypedArrays), EntityManager
    systems/                Turn, Damage, Projektile, Figuren, Maelstrom, Loot
    physics/                analytische Ballistik, CCD-Raycast
    terrain/                CollisionMask (Bitmasken), Loader, Canvas-Sync
  server/
    gameServer.js           autoritativer HTTP/WebSocket-Server
    lobby.js                Lobby- und Platzverwaltung
    lagCompensation.js      200-ms-Snapshot-Verlauf
  shared/
    config/                 Regel-Configs, Waffenkatalog (generiert)
    prng.js, seed.js        deterministischer Zufall
    protocol.js             portables Binärprotokoll (DataView)
    validation.js           serverseitige Input-Validierung
    terrainGen.js           seed-deterministische Kartengenerierung
tests/
  *.test.js                 Unit- und Integrationstests (node:test)
  e2e/                      Playwright-Tests (Browser + Multiplayer)
scripts/
  server.mjs                Serverstart
  smoke-match.mjs           Headless-Match
  verify-render.mjs         Pixel-Verifikation der Darstellung
```

## Determinismus

Alle Simulationszufälle stammen aus einem Match-Seed:

- **PRNG:** Mulberry32, 32-Bit-Integer-Arithmetik, in Node und Browser identisch.
- **Seed-Verteilung:** `MatchSeedManager` gibt jedem Subsystem (Loot, Terrain,
  Waffen, Effekte) einen eigenen Offset-Stream, damit Systeme nicht korrelieren.
- **Keine Wanduhrzeit im Simulationspfad:** Killfeed und Effekte nutzen
  Simulationsticks, kein `Date.now()`.
- **Snapshots:** `World.serialize()` enthält Entities, Komponenten, Signaturen
  und Turn-State und lässt sich vollständig wiederherstellen.

Damit ist ein Match aus `(seed, Eingabefolge)` reproduzierbar — im Browser-E2E
wird geprüft, dass gleiche Seeds identische Zustandshashes erzeugen.

## Waffenkatalog

150 Waffen, aufgebaut aus `project_armageddon_weapons_v1.json`. Der Katalog ist
**generiert** (`npm run weapons:build` → `src/shared/config/weapons.js`) und wird
nicht von Hand gepflegt.

| Eigenschaft | Stand |
|---|---|
| Anzeigename, interner Name, ID, Index | eindeutig, keine Platzhalter |
| Schussart | 96 Projektil, 54 Hitscan |
| Schaden | 143 von 150; 7 richten keinen an (Selbstwirkung/Nutzen) |
| Schadensart | 27 Arten; alle 150 gesetzt (124 aus der Designdatei, 26 aus dem Anzeigenamen abgeleitet) |
| Sichtlinie | 13 Direktschützen verlangen freie Sicht; Steilfeuer ist ausgenommen |
| Zielart | 150/150 gesetzt, deckungsgleich mit der Wirkung (0 Widersprüche) |
| Flächenwirkung | 56 Waffen, 22 verschiedene Radien |
| Seltenheit | fünf Stufen (`powerTier`), nach Stärke abgeleitet |
| Schadensherkunft | 98 echte Designwerte, 45 aus der Kategorie abgeleitet, 7 ohne Schaden |
| Zünder | 11 Waffen mit 1–5 s (`fuseIntent: timed`); 7 wirken beim Aufprall (`impact`) |
| Reichweite | 63 verschiedene `maxRange` (110–1062 px), mit der Kartenbreite skaliert |
| Nachladezeit | 0–3 Züge, abgeleitet aus der Last (`cooldownSource` nennt die Herkunft) |
| Anflugart | 5 von oben, 2 von der Seite, 143 vom Schützen |
| Erreichbarkeit über Kisten | alle 150 |
| Icons | 150/150 verknüpft und im Browser geladen |

**Vier Gruppen in der Waffenauswahl** (`WEAPON_SUBCATEGORIES`): Nahkampf (21),
Schusswaffen (39), Elementar & Magie (50), Technik & Nutzen (40). Die Liste zeigt
nur die Waffen des Spielers, der am Zug ist, jeweils mit Munition. Die
angezeigten Nummern entsprechen den Zifferntasten.

**Wichtige Unterscheidung:** Die Quelldatei führt zwei Feldfamilien. Die
snake_case-Felder (`base_damage`, `blast_radius`, …) tragen die echten
Designdaten, die camelCase-Felder sind überwiegend 0-Platzhalter. Der Generator
bevorzugt je Feld den ersten positiven Wert und kennzeichnet einen
Ersatz-Schadenswert als `damageSource: "placeholder"`.

**Zünder-Absicht statt Namensdeutung:** Ob eine Waffe liegen bleibt und dann
zündet (`timed`) oder beim Aufprall wirkt (`impact`), steht als
`mechanic.fuseIntent` in der Designdatei. Der Generator leitet `fuseTime` daraus
ab, `npm run check:fuses` prüft die Zusage (impact ⇒ 0 s, timed ⇒ länger als der
Flug, kein Zünder an einer Hitscan-Waffe — dort gäbe es kein Geschoss, das liegen
bleiben könnte). Vorher wurde die Absicht aus dem Namen erschlossen; dadurch
zündete jede Zünderwaffe erst nach der Landung.

**Schadensart (`damageType`): im Motor angekommen.** Die Designdatei nennt für
124 der 150 Waffen eine Schadensart; die 26 übrigen (alle Nahkampf, ein Teil des
direkten Fernkampfs) bekommen sie im Generator aus dem **Anzeigenamen**
abgeleitet — ein Raketenwerfer wirkt als `explosive`, eine Fackel als `fire`,
eine Zauberwaffe als `arcane`. Damit steht die Herkunft als
`damageTypeSource: "source" | "derived"` im Katalog.

Die Arten sind in `src/engine/damageTypes.js` als **Zahlenindex** festgehalten
(27 Arten, `physical = 0`). Der Index ist handgepflegt und darf nur **erweitert,
nie umgeordnet** werden: Die Kennungen stehen in Int32-Feldern des
Komponentenspeichers und gehen über Momentaufnahmen an den Client — eine
Verschiebung würde die Bedeutung laufender Aufzeichnungen brechen. Die Art reist
im Projektil mit und steht im `damage`-Ereignis als Kennung **und** Name
(`damageType`, `damageTypeName`), damit Anzeige, Aufzeichnung und künftige
Resistenzen sie lesen können.

**Sichtlinie (`requiresLineOfSight`): 13 Waffen brauchen freie Sicht.** Das
Merkmal stand zuvor für **alle** 150 Waffen auf `false` — eine Zusage ohne
Wirkung. Der Generator leitet es aus dem Wirkungsnamen ab und setzt es für
Direktschützen (Präzision, Strahl, Plasma, Pfeil, Blitz). Geprüft wird die
**Zielgerade** von der Mündung in Schussrichtung bis zur Reichweite bzw. zum
Kartenrand (`MatchController.hasLineOfSight()`); liegt Gestein darauf, lehnt
`fire()` den Schuss ab — **vor** dem Munitionsverbrauch, ein abgelehnter Schuss
kostet also keine Ladung.

Bewusst **nicht** betroffen sind Steilfeuerwaffen: Mörser, Granaten und das
Geschütz schießen über Deckung hinweg und tragen das Merkmal deshalb nicht.
Selbstwirkungen (Heilung, Schild, Sprung, Munition) brauchen ebenfalls keine
Sichtlinie — ein Verband benötigt kein Ziel.

**Zielart (`targeting`): Feld und Wirkung stimmen überein.** Der Motor
entscheidet die Frage „geht das auf den Schützen oder ins Ziel?" aus der
**Wirkung** (`SELF_TARGET_KINDS`) — eine Regel, eine Stelle. Die Designdatei
widersprach dem bei 11 Waffen (Heilzauber als `directional`); diese 11 sind
korrigiert, `npm run check:targeting` meldet **150/150 Übereinstimmung, 0
Widersprüche**. Die Zielart reist im `shot`-Ereignis mit.

**Nachgemessen, nicht behauptet:** `maxRange` und `cooldown` sind NICHT mehr für
alle Waffen gleich (63 bzw. 4 verschiedene Werte). Frühere Fassungen dieses
README behaupteten das Gegenteil — damals stimmte es, inzwischen leitet der
Generator beide aus der Designdatei ab. Die Waffe in der Hand wird aus den Waffen-Sprite-Atlanten unter
`src/client/assets/weapon-sprites/` gezeichnet und prozedural animiert (siehe oben);
HUD-Leiste und Menü zeigen weiter die Einzel-Icons.

## Waffendarstellung und Animationen

Die Darstellung ist **prozedural** (es gibt keine Waffensprites, nur Icons — siehe
„Waffenkatalog"). Die Bewegung kommt aus einem eigenen Rechenkern,
`src/client/weaponAnimation.js`:

| Teil | Was man sieht | Umsetzung |
|---|---|---|
| Mündungsfeuer | Beim Schuss blitzt ein Kegel an der Mündung, mit hellem Kern | `muendungsfeuer()` — Kegel in **Schussrichtung**, Geometrie in Weltachsen |
| Rückstoß | Das Rohr fährt kurz zurück und kommt wieder vor | `rueckstossVersatz()` — im ersten Bild am größten, dann linear auf 0 |
| Zielen | Am Einschlagpunkt der Zielhilfe steht ein **atmendes Fadenkreuz** | `fadenkreuzSegmente()` + `pulsFaktor()` |
| Flächenwirkung | Der Radius der Explosionsvorschau atmet, der Ring dreht sich | `blitzPuls()` |
| Nachladen | Die Waffenzeile zeigt einen **Nachladebalken** statt nur „⏳ N" | `ladungAnteil()` (0 = gerade geschossen, 1 = bereit) |

**Warum ein eigenes Modul:** `renderer.js` ist in `node --test` nicht ladbar
(Vite-Importe), jede dort versteckte Animation ist damit unprüfbar. Die
Geometrie liegt deshalb in einem reinen Modul — dasselbe Muster wie bei
`effects.js` (Partikel, Strahlen, Blitze). `tests/weapon-animation.test.js`
misst die Aussagen: dass der Kegel in **Schussrichtung** zeigt (nicht in eine
feste Richtung), dass der Rückstoß am Anfang am größten ist, dass das
Fadenkreuz eine **Lücke in der Mitte** hat (sonst verdeckt es genau den Punkt,
den es markiert) und dass der Balken beim Schuss leer und bei Bereitschaft voll
ist.

**Barrierefreiheit ist Bedingung, nicht Zugabe:** Bei
`prefers-reduced-motion` entfällt jede BEWEGUNG, aber keine Aussage — das
Mündungsfeuer erscheint weiterhin (nur ohne Rückstoßfahrt), das Fadenkreuz
steht still, der Radius bleibt konstant, die CSS-Übergänge des Balkens
entfallen. Die Tests haben dafür je eine Gegenprobe mit `reducedMotion: true`.

## Spezialeffekte

Neben Schaden und Flächenwirkung kennen die Waffen Wirkungen, die in
`src/engine/specials.js` beschrieben sind:

| Wirkung | Beispielwaffen | Verhalten |
|---|---|---|
| Heilung | Heilspritze, Engelssegen | Stellt Gesundheit wieder her, nie über das Maximum |
| Schild | Engelssegen, Wächterstatue | Fängt Schaden ab, bevor Gesundheit sinkt |
| Schadensbonus | Astraltrank, Reliktsplitter | Erhöht den eigenen Schaden für zwei Züge |
| Rüstung | Bunker, Tarnnetz | Reduziert eingehenden Schaden |
| Einfrieren | Frostwaffe, Schlafzauber | Das Ziel setzt einen Zug aus |
| Schaden über Zeit | Flammenwerfer, Giftwolke | Wirkt bei jedem Zugbeginn, für drei Züge |
| Munitionsnachschub | Munitionskiste, Nachschubkiste | Füllt Ladungen auf, bis zur Kapazität |
| Bewegung | Düsenrucksack, Teleport, Portalring | Versetzt die Figur auf festes Gelände |
| Heranziehen | Enterhaken | Zieht einen Gegner zum Schützen |

Selbstwirkende Waffen verschießen bewusst kein Geschoss: Sie lösen ihren Effekt
aus und beenden den Zug. Wirkungsdauern zählen in **Zügen**, nicht in Sekunden —
dadurch bleiben Replays unabhängig von der Zugzeit reproduzierbar. Der Zufall
für die Zufallswaffe stammt aus dem Match-Seed, nicht aus `Math.random()`.

Im HUD erscheinen laufende Zustände als Marken in der Spielerliste
(🛡 Schild, ❄ eingefroren, ☠ Schaden über Zeit, ↑ erhöhter Schaden).

## Multiplayer-Protokoll

- Steuernachrichten: JSON (selten, lesbar, versioniert).
- Snapshots: Binär, festes Layout, ~20 Hz (Simulation läuft mit 60 Hz).
- `DataView` statt Node-Buffer → dasselbe Modul läuft im Browser und auf dem Server.
- Server ist autoritativ: Clients senden Wünsche, der Server validiert
  Spielerberechtigung, Winkel, Kraft, Tick-Fenster und Waffen-Whitelist.
- Lag-Kompensation über einen 200-ms-Snapshot-Verlauf.
- Reconnect per Sitzungs-Token innerhalb eines Fensters von 30 s.
- **Vorhersage des eigenen Schusses:** Der Client rechnet die Bahn beim Feuern
  sofort und zeichnet sie, bevor die Serverantwort eintrifft; die Antwort löst
  sie auf oder verwirft sie. Die Vorhersage ist rein anzeigend — sie ändert
  keinen Zustand, sendet nichts und erteilt keine Autorität. Sie rechnet mit
  denselben Konstanten wie `MatchController.aimPreview`; ein Test verlangt
  Übereinstimmung auf 1 px. Klasse, Archetyp und Waffe kommen dafür aus der
  Bestandsnachricht (nicht geraten — siehe `MASTERDOTO.md`).

## Spielregeln

### Klassen

| Klasse | Drag | Masse | Kraft | Tempo | Leben |
|---|---|---|---|---|---|
| Scout | 0.9 | 0.8 | 0.7 | 1.2 | 0.8 |
| Heavy | 1.1 | 1.2 | 1.0 | 0.8 | 1.3 |
| Artillery | 0.8 | 0.9 | 1.3 | 0.7 | 0.9 |

Rohfelder der Tabelle (`src/shared/config/classes.js:55-68`): `drag`, `mass`,
`power` (Spalte „Kraft“), `speed` (Spalte „Tempo“), `health`. **Vorsicht bei der
Spalte „Tempo“:** Gemeint ist der Klassenwert `speed`, und der wirkt auf den
**Absprung** — die Anzeige nennt ihn deshalb „Beweglichkeit“. Intern heißt
dagegen `power` (= Spalte „Kraft“) `tempo`, weil er die Schussgeschwindigkeit
meint (`classes.js:332-345`). Beides zu verwechseln wäre irreführend.

Dazu drei Archetypen (Brawler, Artillerist, Okkultist) mit eigenen Prozent-Modifikatoren.

### Mahlstrom / Sudden Death

**Valhalla** beginnt zufällig zwischen **Runde 8 und 14** (bei großen Partien — mehr als
8 Spieler, Karte „gross"/„krieg" — zwischen **Runde 12 und 20**), aus dem Match-Seed gezogen
und den Spielern nicht angekündigt; wirksam zu Beginn der gezogenen Runde. Danach zieht
sich die sichere Zone zusammen: Terrain wird in jedem Schritt um 32 px von außen abgetragen (1–4 Schritte je Runde, s. u.),
außerhalb der Zone wirkt toxischer Regen (15 % Max-HP pro Zug) und der Knockback aller
Waffen steigt um 100 %. Ein Match läuft, **bis es entschieden ist** — es gibt kein
Rundenlimit im Spiel (nur ein Notnetz bei Runde 300, das nie erreicht wird).

**Tempo:** Je in der Vorrunde gefallener Figur zieht sich der Sturm einen zusätzlichen
Schritt zusammen (1–4 Schritte je Runde); der Rückstoß wächst mit jeder Sturmrunde um
25 % (Start +100 %, Deckel +300 %).

**Zugpause:** Vor jedem Zug steht das Spiel 3 Sekunden still (Zugzeit läuft nicht, Schießen,
Springen und Abwerfen sind gesperrt, Zielen erlaubt); nach einem Schuss läuft vorher 2 Sekunden die
Wiederholung der Flugbahn. Zahlen in `MATCH_RULES.turnPauseSeconds` / `turnReplaySeconds`; der
Server nimmt `PA_ZUGPAUSE_SEKUNDEN` (0 = ohne Pause), der Browser `?zugpause=N` oder
`VITE_ZUGPAUSE_SEKUNDEN`.

**Vorzeichen:** zufällig 1–60 s vor Valhalla (ebenfalls aus dem Match-Seed) erscheinen zwei
Raben in Blitzen am Himmel und blicken aufs Schlachtfeld (Ereignis `valhalla_omen`, mit
Donner; reine Anzeige, ohne Einfluss auf den Spielzustand; bei „reduzierte Bewegung“ ohne
Blitze).

### Schadensreihenfolge

Verbindlich: **erst Flat-, dann Prozent-Modifikatoren.**

### Loot

Kisten werden pro Rundenstart per Drohne abgeworfen (5 % keine, 45 % eine,
35 % zwei, 15 % drei; im Mittel 1,6; höchstens 6 unaufgehobene Kisten gleichzeitig
auf der Karte, Kistenfassung 2). Aufzeichnungen ohne `config.kisten` spielen mit der
alten Rate (10 % keine, 85 % eine, 5 % zwei, ohne Obergrenze). Inhalte: 55 % Waffen, 30 % Heilung, 10 % leer, 5 % Sprengfalle.
Die Verteilung nutzt PRD, damit Fehlschläge die Chance auf bessere Folgedrops
erhöhen. Jeder Spieler führt zusätzlich eine Reservewaffe mit unbegrenzter
Munition, damit kein Match durch leere Magazine stehenbleibt.

## Terrain

- Zeichenbasiert: `#` oder `1` = solide, alles andere = Luft.
- Physik liegt in `Uint32Array`-Bitmasken (32 Pixel pro Wort).
- Krater werden über `punchCrater` in Bitmaske **und** Canvas-Ebene gestrichen —
  beide werden aus demselben Ereignisstrom geändert und können nicht divergieren.
- Zerstörungsfassung 4 (Standard; Replay-Kopf `config.zerstoerung`): wie 3, dazu landende Inseln,
  die am Rand zerbröseln (Brocken fliegen als Partikel-Zellen und setzen sich als Schutt ab),
  Inseln, die bei hartem Aufprall in zwei Teile brechen, Waffencharakter (Bohrtunnel, Splitterstreuung,
  Beben-Setzrutsch, Brandspuren als Optik) und Figuren, die am Kraterrand in den Krater rutschen.
  Fassung 1–3 laufen Bit für Bit unverändert (Goldhashes in `tests/zerstoerung.test.js`).
- Zerstörungsfassung 3 (Replay-Kopf `config.zerstoerung`, `src/engine/zerstoerung.js`):
  raue Kraterränder (deterministisch aus Ort, Radius und Tiefe), Tiefe nach Waffe
  (grabende Waffen tief, Sprengwaffen flach), freischwebende Geländeinseln und
  gekappte Brücken stürzen nach (Figuren, Kisten, Geschütze fahren mit), lose
  Kisten und Geschütze fallen bei Bodenverlust. Fassung 3 lässt auch große Schollen
  (bis 60 000 Zellen) fallen; Fassung 2 (Grenze 6000 Zellen) und Dateien ohne das Feld
  (Fassung 1: runde Krater, kein Nachrutschen) spielen unverändert weiter. Die Landung
  einer Insel zeigt Staubwolke, Druckwellen, Brocken und ein Bildzittern nach Masse
  und Fallhöhe (nur Client, nicht im Hash).
- Vier Presets: Hügel, Berge, Inseln, Höhlen.

## Qualitätsregeln

- Gameplay und Physik bleiben 2D.
- Kein `Math.random()` im Simulationspfad.
- Keine Client-Autorität bei physikrelevanten Aktionen.
- Keine rotierte/skalierte Runtime-Maskenkollision ohne Prebakes.
- Keine unsynchronisierte Divergenz zwischen Canvas-Terrain und CollisionMask.
- Keine Number-Bloat-Progression im Match.

## Status

Spielbarer Kern mit lokalem und Online-Multiplayer, SPEZIELLEN NPCs (Günther,
Geschütze), Loot, Wasser,
Mahlstrom und zerstörbarem Terrain. Verifiziert durch die Unit-/Integrationstests,
den Browser-E2E (siehe [`MASTERDOTO.md`](./MASTERDOTO.md) für die aktuellen
Zahlen) und den Production-Build.

Was der Status **nicht** mehr behauptet, weil es inzwischen läuft: Audio
(prozedural erzeugt, `src/client/sound.js` + `soundMixer.js`), Client-Prädiktion
des eigenen Schusses (`shotPrediction.js`), serverseitig erzwungene Zugzeit,
Lobby-Persistenz über einen Neustart und strukturierte Server-Logs.

**Fortschritt mitnehmen:** Profil, Erfolge und Statistik liegen im Browser
(`localStorage`) — es gibt bewusst **keine Konten**. Damit ein Browserwechsel
nicht stillschweigend alles löscht, hat das Profil „Fortschritt sichern" und
„Sicherung laden" (JSON-Datei; ohne Geräte-Kennung, ohne Personenbezug).

Offene Arbeit und bewusst dokumentierte Grenzen stehen in
[`MASTERDOTO.md`](./MASTERDOTO.md). Stand 2026-09-20 sind dort **keine Häkchen
mehr offen**; verbliebene Grenzen sind ausdrücklich benannt (u. a. kein
Online-Mehrplatz je Mensch, Waffenwerte nicht fein ausbalanciert, 11 statt 100
Erfolge, Zünder- und `maxRange`-Auslegung dokumentiert statt geändert).
