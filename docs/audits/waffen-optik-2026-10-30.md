# Audit Waffenoptik (2026-10-30)

Nur Lesen und Sehen: kein Code, kein Bild, kein Commit geändert. Bilder wurden aus Atlanten und Sheets zu Kontaktbögen in `/tmp/audit/` zusammengesetzt (nicht im Repo) und angesehen.

## 1. Wie Icon, Hand-Sprite, Geschoss und Animation zugeordnet werden (belegt durch Code und Manifest)

| Rolle | Quelle | Zuordnung |
|---|---|---|
| Icon (HUD, Menü) | `src/client/assets/icons/IMG_xxxx_icon.png` (150 Dateien, 64 px), Pfad `iconPath` im Katalog `src/shared/config/weapons.js` | je Waffen-ID eine eigene Datei |
| Icon im Atlas | `weapon-sprites/atlas_icons.png` (2048x1280, 256 Farben) | `manifest.json` > `waffen.<id>.icon`; HUD nutzt bewusst die Einzel-Icons (MASTERDOTO "Grenzen") |
| Waffe in der Hand | `atlas_<kategorie>.png`, Zelle `held` 128 px | `manifest.json` je ID; Lader `src/client/waffenSprites.js`, Cache 64 px, Anzeige ca. 24-34 Weltpixel (`ZELLE`, `PARAMETER.zelle` in `waffenAnimation.js`) |
| Geschoss | Zelle `projectile` 32 px im Kategorie-Atlas, Anzeige 14-22 px (`GESCHOSS_ART`) | Feld `projectile.art`; 41 Zellen sind aus dem Hand-Sprite geschnitten (`ding`), 55 sind generische, nach Art erzeugte Zellen (`generiert: true`) |
| Hand-Pose, Schussbewegung, Blitzform | `src/client/waffenAnimation.js`: `PARAMETER[kategorie]` + `KORREKTUREN[id]` (25 IDs) + Sonderfälle `SELBST`, `WURF`, `KOMPAKT`, `KACHEL_*` | pro Kategorie, nur 25 von 150 Waffen haben Einzelkorrektur |
| Mündungsfeuer | Sheet `effekt-sheets/muendung.webp` (4 Frames x 5 Varianten), `effektSheets.js` `zeichneMuendung`, Aufruf `renderer.js` ca. Z. 1378 | Variante = `entity.entityId` (die FIGUR), nicht die Waffe; Größe nur nach Figurenskala. Blitzform der Waffe (`blitzForm`) gilt nur im Sprite-Zweig. |
| Treffer/Einschlag | `SheetEffekte.einschlag(x,y,radius,art)` (`effektSheets.js`), aufgerufen aus `ereignisse.js` Z. 385 | nur nach Sprengradius (<=22 Feuerball, 23-79 Explosion + Glut/Rauchring, >=80 Pilzwolke) und Schadensart (nur 6 "blaue" Arten bekommen zusätzlich die Flamme). Die Waffe selbst geht nicht ein. |
| Hitscan-Strahl | `renderer.addBeam`, Farbe = `flashColor` der Waffe | 54 Waffen ohne Geschoss, nur Linie plus Farbe |
| Geschoss-Zusatz | Schweif in `flashColor`, Startglanz, Gruppenmarke (cluster 3, lenk 2, teleport 2, abpraller 23) | aus Katalogwerten |
| Animations-Sheets je Waffe | `weapon-sprites/anim/*.webp` + `anim/manifest.json` (26 Sheets, 8 Frames) | **nirgends im Code eingebunden** (grep über `src`, `tests`, `scripts`: kein Treffer; Manifest sagt selbst "Noch nicht eingebunden") |

### Zählung nach Schussart und Animationsfamilie (berechnet aus Katalog + `parameterFuerWaffe`, alle 150)

Schussart (`art`): hieb 44, zauber 37, kurz 24, selbst 20, schwer 13, tech 12.
Blitzform: keiner 54, stern 29, funke 24, ring 22, kegel 21.
Auslieferung: 96 Geschoss, 54 Hitscan. Sprite-Form: kompakt 66, objekt 56, kachel 28 (27 Motiv, 1 Orb).
Geschossart: ohne 54, ding 41, zauber 19, rakete 7, plasma 6, kugel 6, feuer 5, granate 3, gift 3, pfeil 2, stein 2, wasser 1, eis 1.

Familien (Kategorie | Art | Blitz -> Anzahl), d. h. wer sich dieselbe Bewegung teilt:
melee hieb/keiner 21; ranged kurz/kegel 7; ranged hieb(Wurf)/keiner 10; ranged selbst 1; ranged schwer/kegel 1 (pa_039); heavy_ranged schwer/kegel 12; heavy_ranged hieb(Wurf) 8; elemental kurz/stern 17; elemental hieb 3; magic zauber/ring 21; magic zauber/stern 3; magic zauber/funke 4; magic selbst/funke 2; utility selbst (funke 6, kegel 1, ring 1, keiner 2); tech tech/funke 12; tech selbst 7; tech hieb 1; ultimate zauber/stern 9; ultimate hieb 1.

Ergebnis: Nur **22 Kombinationen** für 150 Waffen. Die größten Gruppen mit identischer Bewegung UND identischem Blitz: melee 21, magic/ring 21, elemental/stern 17, tech/funke 12, heavy/schwer/kegel 12. Eigene Pose haben nur 25 Waffen (Korrekturtabelle, meist nur Blitzform/Größe geändert). Geteilte Geschosszellen (gleiche Pixel): Rakete 7 Waffen (pa_032, 036, 037, 041, 042, 045, 069), Kugel 6 (pa_040, 054, 055, 056, 057, 060: Schrotflinte, Sniper, Revolver, Gatling gleiche Patrone), Feuer 5, Granate 3 (pa_039, 043, 066), Gift 3, Pfeil 2, Stein 2. 96 Geschosse = 75 verschiedene Zellen; die 19 `zauber`-Orbs unterscheiden sich nur durch Farbton.

## 2. Sichtprüfung

### Tatsächlich angesehen
- **Alle 150 Waffen** als Kontaktbogen Icon | Hand-Sprite | Geschoss-Zelle (15 Bögen, je Kategorie). Das ist eine Sicht auf Atlaszellen, nicht auf das laufende Spiel.
- Alle **26 Animations-Sheets** (`anim/*.webp`) als Übersicht, je 8 Frames.
- Effekt-Sheets `muendung`, `explosion`, `rauchring`.
- Bestehende Repo-Bilder: `docs/bilder/waffen-pruefboegen/sequenz.jpg` (je Kategorie eine Waffe, Schussfolge) und `docs/bilder/waffen-animation/voll-pa_081.jpg` (Spielbild).

### Nicht geprüft
- Kein laufendes Spiel gestartet, keine Bewegung/Zeitverlauf selbst gesehen, keine Skalierung auf echte Spielgröße (die Hand-Sprites erscheinen im Spiel ca. 4x kleiner als in den Bögen). Aussagen zur Wirkung im Spiel stützen sich nur auf die zwei vorhandenen Spielbilder.
- Verwendung der Vorlagen im Claude-Projekt (`PA Sprite Sheets/*`, `IMG_9329/9330/9333/9335.png` des Projekts, `Musik/`): liegen nicht auf der Platte, ich hatte kein Projekt-Lesewerkzeug. Nur die Repo-Entsprechungen wurden gesehen (siehe 4).
- Klang, Hit-Effekte an Figuren (`treffer`), Einzel-HUD-Icons in 64 px (nur über die Atlas-Icons beurteilt).

### Gesamteindruck
Icons (150) und Hand-Sprites sind einheitlich im selben dunkel konturierten Comic-Stil, hohe Qualität und gut wiedererkennbar. Die Schwächen liegen beim **Geschoss (32 px, pixelig, generisch)**, beim **Treffer/Mündungsfeuer (waffenunabhängig)**, bei **Namen/Bild-Brüchen** und den **unbrauchbaren KI-Animationssheets**.

### Markierte Waffen (alle in den Bögen gesehen)

Name passt nicht zum Bild oder Dublette:
| ID | Name | Befund |
|---|---|---|
| pa_032 | Raketenrucksack | Bild ist ein blauer Krallenhandschuh, kein Rucksack; Geschoss = generische Rakete |
| pa_109 | Giftbaum | Bild ist ein Gleitschirm mit Pilot (Name/Bild vertauscht oder falsch) |
| pa_114 | Gleitschirm | Bild ist ein Düsenrucksack, praktisch identisch zu pa_112 (Dublette) |
| pa_112 | Düsenrucksack | siehe pa_114 |
| pa_056 | Präzisionsgewehr | zeigt dieselbe Uzi-artige Waffe wie pa_040 Maschinenpistole |
| pa_034 | Zauberbolzen | Kachel mit Skelett-Hand in Violett, liest sich nicht als Bolzen |
| pa_035 | Energieball | Faust mit Energie, nicht Ball |
| pa_036 | Raketenhandschuh | Schild mit Gesicht und Flammen |
| pa_084 | Glutelixier | blau-violette Flasche, nicht glutrot (Lavaelixier pa_098 passt, Sturm/Mutation ähnlich bunt) |
| pa_031 / pa_120 / pa_002 / pa_035 | Kraftfaust, Energiefaust, Feuerfaust, Energieball | vier Faust-Motive, schwer zu trennen |
| pa_013 / pa_014 | Mehrzweckmesser / Taschenmesser | in der Hand unorientiert (kompakt, Griff nicht erkennbar), Geschoss ein Pixelbrei |
| pa_127 | Teleportplattform (Mine) | Bild bleibt Geräte-Plattform: laut `docs/auftraege/minen-faesser.md` Absicht |

Geschoss-Zelle schlecht oder falsch:
- pa_148 Feuerschild: Icon orange (flashColor #eb8a2e), Geschoss-Orb **blau** (Rest vom früheren Himmelswächter).
- pa_022 Plasmawerfer, pa_068, pa_104, pa_124, pa_140: leuchtender Kreis, nicht unterscheidbar; pa_034/035 ebenso.
- pa_039/043/066: Kanonen verschießen eine graue Kugel mit gelbem Band, pa_042/045 (Salven) nur eine einzelne Rakete.
- pa_053 Roboterbombe, pa_046, pa_020, pa_011: stark verpixelt, Detail verloren.
- 54 Hitscan-Waffen ohne Geschoss (z. B. pa_084-pa_120 Selbstwirkungen): beabsichtigt, aber ohne eigenes Wirkbild außer Glanz.

Gut (Vorbild): pa_001-pa_012 Nahkampf (Hand-Sprite gedreht, passt), pa_037 Raketenwerfer, pa_038 Rakete, pa_054/055/057 Schusswaffen, pa_058 Kampfbogen mit Pfeil, pa_062 Flammenwerfer, pa_063 Wasserwerfer, pa_065 Meteorbrocken, pa_093-pa_101 Elixiere und Schild, pa_141-pa_150 Ultimates als Kachel-Motive (visuell stark, aber Geschoss generischer Orb).

### Animationssheets (`anim/`, alle 26 angesehen, Urteil: überwiegend nicht verwendbar)
- **Falsches Motiv (KI hat das Wesen ersetzt):** pa_049 Bumerang (rote Biene/Rakete mit Flügeln), pa_073 Tentakelgift (grüner Saurier), pa_112 und pa_114 (identischer blauer geflügelter Käfer), pa_122 Endlosschleife (rosa Flügelblob, Frames wechseln zur Schleife), pa_132 Alte Dame (Vogelwesen), pa_134 Luftangriff (braune Planke), pa_141 Astralkrieger (blauer Blob-Mensch), pa_144 Wassermelone (Flügelfisch), pa_147 Weltendrache (rosa Schwein mit Flügeln), pa_148 Feuerschild (blaue Katze), pa_032.
- **Nahezu Standbild (8 gleiche Frames):** pa_038, pa_044, pa_048, pa_115, pa_118, pa_121, pa_133, pa_065, pa_061 (ein Frame kaputt).
- **Frames springen/ausgebleicht:** pa_143 Astralross, pa_053, pa_136 (Größe wechselt).
- **Brauchbare Ansätze:** pa_038 Rakete (Flamme), pa_135 Meteorregen (Flug), pa_142 Leerenritter (Bewegung, aber Motiv weicht ab). Fazit: höchstens 3 von 26 ohne Nacharbeit denkbar; Einbau ohne Neuerzeugung wäre ein Rückschritt gegenüber den guten Atlas-Zellen.

### Effekt-Sheets
`muendung`: 5 Varianten, orangefarbener Cartoon-Blitz plus Rauch, gut lesbar, aber alle Waffen gleich (Pistole, Gatling, Bazooka). `explosion`: Feuerball bis Rauch, brauchbar; `rauchring` rein weiß, farblos gegenüber der Schadensart.

## 3. Priorisierte Maßnahmen (Aufwand / Nutzen; Schätzungen, nicht gemessen)

| Prio | Maßnahme | Aufwand | Nutzen |
|---|---|---|---|
| 1 | Name/Bild-Brüche klären (pa_032, 109, 112/114, 056/040, 084, 034, 035, 036): Auftraggeber entscheidet, ob Name oder Bild geändert wird; pa_114 braucht ein eigenes Bild | S (Entscheidung) bis M (neues Bild) | hoch: Spieler erkennt Waffe nicht |
| 2 | Waffenabhängiges Mündungsfeuer: Variante nach Waffe/Kategorie statt `entityId`; Größe nach `blitzGroesse`, Farbe nach `flashColor` (`effektSheets.zeichneMuendung`, `renderer.js` ~1378) | S | hoch, Code klein, kein neues Bild |
| 3 | Einschlag nach Schadensart und Waffe: Farbe/Variante (Eis, Gift, Wasser, Feuer, Magie) statt nur Radius; Rauchring und Flamme sind laut Doku erst als Skript vorhanden (`scripts/sprites-erzeugen/effekt-zeichnen.py`) | M | hoch: 150 Waffen enden heute in derselben Explosion |
| 4 | Geschosse: je Familie eigene 32->64 px Zelle: Patrone je Kaliber, Rakete je Typ, Granate je Kanone, Orb-Motiv je Zauber (zauber 19 gleich, rakete 7, kugel 6); pa_148 Orb orange; Zellen aus dem Hand-Sprite höher auflösen (Quelle liegt in `assets/weapons/source/*.PNG`, 1024 px) | M | mittel bis hoch |
| 5 | Eigene Schussfamilien statt 22 Kombinationen: z. B. Nahkampf stoßen/schneiden/schlagen (21 Waffen heute identisch), Magie Ring/Funke je Element, Tech Aufladen je Gerät; Korrekturtabelle `KORREKTUREN` gezielt für ca. 40 Waffen erweitern (Daten, kein neuer Code) | M | mittel |
| 6 | Geschoss-Familien als Kategorie-Flug: Hitscan-Strahlen je Art (Laser, Blitz, Wasser, Eis) statt einer Linie in `flashColor` (54 Waffen) | M | mittel |
| 7 | Anim-Sheets: nicht einbauen wie vorliegend. Nur pa_038/pa_135 prüfen; die Übrigen neu erzeugen mit Zellbild als Bildbedingung und Handprüfung, sonst prozedural (Rotation, Flammenspur) belassen | L, Risiko hoch | niedrig bis mittel |
| 8 | Prüfung automatisieren: Test, dass `GESCHOSS_ART`-Zellen nicht doppelt belegt sind und Sheet-Frames sich unterscheiden (Test gegen Standbilder, sonst nicht sichtbar) | S | mittel |

### Vorlagen des Auftraggebers
- Auf der Platte (Repo): `assets/weapons/source/IMG_*.PNG` (150 Originale 1024 px; IMG_9329 = pa_099 Frostsanduhr, IMG_9330 = pa_100 Blitzwürfel, IMG_9333 = pa_103 Verderbniskelch, IMG_9335 = pa_105 Frostrolle laut `manifest.quelle`). Das sind die Quellen der Icons, bereits für Atlas und Geschosszellen verwendet; neu nutzbar für höher aufgelöste Geschosszellen (Maßnahme 4), Aufwand S.
- `src/client/assets/material-texturen/` (`sheet-explosion-rot.png`, `sheet-glut-gluehen.png`, `effekte/sheet-feuerring-flammen`, `sheet-leuchtgeschosse-farben`, `sheet-ringe-blasen-farben`, `sheet-wirbel-gruen-pink`, `partikel-sheet-funken-blaetter`): davon sind explosion, glut, feuerring, leuchtgeschosse eingebaut; **`sheet-ringe-blasen-farben` und `sheet-wirbel-gruen-pink` sind laut Code nicht verwendet** (nur grep, nicht angesehen): Kandidaten für farbige Magie-/Eis-/Gift-Treffer (Maßnahme 3), Aufwand S-M. `sheet-leuchtgeschosse-farben` liefert nur 4 Kometen; Erweiterung für Wasser/Magie möglich.
- Projektdateien `PA Sprite Sheets/*` (Texturen, `explosion 1 2.png`, Planeten), `IMG_9329/9330/9333/9335.png` im Projekt: nicht gelesen (kein Zugriff); Verwertbarkeit ungeprüft.

## 4. Offene Punkte
- Sichtprüfung im laufenden Spiel (Spielgröße, Bewegung) steht aus: `node scripts/waffen-screenshots.mjs`, `node scripts/waffen-pruefbogen.mjs` (nicht ausgeführt).
- Entscheidung des Auftraggebers zu Prio 1 nötig; keine Spielwerte betroffen, reine Darstellung (keine Versionsmarke nach AGENTS.md §2).
