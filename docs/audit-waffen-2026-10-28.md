# Audit Waffen, Namen, Schadensarten, Wirkungen (2026-10-28)

Auftrag des Auftraggebers: „Waffen, Namen, Art, Schadensart usw. (auch Buffs, Zauber usw.)
optimieren und verbessern." Dieses Dokument ist der Befund (Abschnitt A) und wird je Abschnitt
B bis E um die Maßnahmen ergänzt. Alle Zahlen sind gemessen (Katalog `src/shared/config/weapons.js`,
Stand vor den Änderungen: 1943 Unit-Tests grün).

Quelle der Waffendaten ist `project_armageddon_weapons_v1.json`; `src/shared/config/weapons.js` wird
von `scripts/build-weapon-catalog.mjs` erzeugt (`npm run weapons:build`) und nicht von Hand bearbeitet.

## A. Befund

### A1 Anzeigenamen

- 150 Waffen, 150 verschiedene Anzeigenamen, keine Dubletten und keine Kollision mit den sieben
  Mali (Brand, Gift, Fluch, Säure, Frost, Schock, Nass).
- Mischsprachig (Denglisch): Power Gauntlets, Plasma-Blaster, Cyber-Bombe, Grappling Hook, Jetpack,
  Auto-Turret, Infinity Loop, Explosiver Punch, Void-Ritter, Wasserblaster, Minigun, Teleport-Plattform,
  Hologramm-Portal.
- Uneinheitliche Schreibweise von Zusammensetzungen: mit Bindestrich (Plasma-Gewehr, Raketen-Salve,
  Feuerwerks-Salve, Verderbnis-Siegel, Verderbnis-Kelch, Lava-Elixier, Chaos-Elixier, Heil-Injektion,
  Zeit-Sanduhr, Welten-Drache, Voodoo-Puppe, Wirbelwind-Krieger, Doppelkopf-Axt) gegen ohne
  (Raketenwerfer, Flammenwerfer, Feuerdämon, Weltenbaum, Mutationselixier).
- „Magisch…" als Muster (Magischer Kampfstock, Magischer Geschosszauber, Magischer Stiefel,
  Magische Peitsche, Magischer Kriegshammer): lang (bis 24 Zeichen), wenig sagend.
- Sonderformen: „Feldkanone / Mörser" (Schrägstrich), „Giftige Weltenflasche", „Kosmische Wassermelone"
  (im Katalog `cosmic_banana`), „Goldene Zauberrolle" gegen „Zauberrolle" (leicht verwechselbar).
- Kachelbreite im Waffenmenü (`.wm-opt`, `minmax(112px, 1fr)`, Name 12,5 px, zwei Zeilen, `overflow: hidden`):
  Einzelwörter über rund 15 Zeichen werden abgeschnitten, da die Namenszeile nicht umbricht.
  Betroffen: Multifunktionsmesser (20), Scharfschützengewehr (20), Versorgungscontainer (20),
  Artilleriegeschütz (18), Meteoritenbrocken (17).
- Die acht Waffen mit eigener Identität (`WEAPON_IDENTITIES`) haben im Generator andere Namen als in
  der Designdatei (Designdatei: „Raketenwerfer Mk I/II", „Maschinenpistole Mk II", „Raketenrucksack Mk III",
  „Dimensionssprung I/II"). Der Generator hat Vorrang; die Designdatei ist an dieser Stelle veraltet.

### A2 Schadensarten

- 27 verschiedene Arten im Katalog (`DAMAGE_TYPE_IDS`, 27 Einträge); bei 26 Waffen steht in der
  Designdatei keine Art, der Generator leitet sie aus dem Anzeigenamen ab (`deriveDamageType`).
- Überschneidungen:
  - `temporal` (Infinity Loop) und `time` (Zeit-Sanduhr): dieselbe Sache, zwei Namen; beide gleich geregelt
    (`ART_REGEL`, `FAMILIE_VON_ART`: Familie `magie`, Rüstung 0,5).
  - `utility`, `defense`, `medical`: reine Selbstwirkungen. Sie haben unterschiedliche Regeln und Gründe
    (Bewegung/Munition, Schutz, Heilung) und bleiben getrennt; `medical` ist die Spritze, `holy` der Segen.
  - `energy`, `arcane`, `astral`, `void`: gehören zu verschiedenen Familien mit verschiedener Wirkung
    (energie: Schild fängt nur die Hälfte; magie: Rüstung 0,5; schatten: Fluch). Keine Dublette.
  - `plasma` steht als Schlüssel in `GRUPPE_VON_ART` (`stoffe.js`) und in `BRAND_ARTEN` (`zerstoerung.js`),
    ist aber keine Schadensart des Motors (`DAMAGE_TYPE_IDS`), keine Waffe trägt sie. Toter Schlüssel.
- Fehlzuordnungen in der Verteilung (Katalog nach Ableitung):
  - Raketenrucksack (`flight`, Schaden 0) steht auf `physical`; er ist wie Jetpack und Gleitschirm ein
    Fluggerät (`utility`).
  - Astraltrank (Buff) steht auf `arcane`, heißt aber Astral (`astral`, Familie ebenfalls `magie`).
  - Salvengeber (Sprengradius 16, Nachfolger des Raketenwerfers Mk II) steht als abgeleitete Art auf
    `physical`; alle anderen Raketen- und Salvenwaffen sind `explosive`.
  - Die Namensableitung hängt am Anzeigenamen; jede Umbenennung kann die Art ändern (Fackel, Zauber, Rune).
- Wirkgruppen (`GRUPPE_VON_ART`, `stoffe.js`): hitze (fire, dragon, energy), kaelte (ice), aetz (acid, poison),
  strom (electric, magnetic), nass (water); alles andere wirkt als Wucht. Das ist stimmig; offen ist nur,
  dass `holy` (Sonnenamulett, Himmelswächter) und `astral` keine Hitze auf Gelände ausüben, obwohl das
  Thema Licht nahelegt. Kein Fehler, nur Designfrage.
- Es gibt nirgends deutsche Bezeichnungen oder Erklärtexte für die 27 Arten. Die Anzeige kennt nur die
  Schadenszahl-Farbe je Familie (`ZAHL_FAMILIE`) und die englischen Schlüssel im `damage`-Ereignis.

### A3 Beschreibungen

- `description` ist für alle 150 Waffen nicht vorhanden (Feld fehlt in Quelle und Katalog, nicht nur leer).
- Das Waffenmenü zeigt beim Überfahren eine Zeile mit Name, Schaden, Radius, Reichweite, Nachladen,
  Munition, Stufe; kein Satz, was die Waffe tut, keine Schadensart.
- Nur die Namen der `special`-Felder (englisch, z. B. `bat_knockback`) beschreiben die Waffe; 118 Namen,
  davon nur ein Teil mit Motorwirkung (`SPECIAL_EFFECTS`), der Rest ist beschreibend.

### A4 Kategorien und Gruppen

- Acht Kategorien (`waffenKategorien.js`), vier Anzeigegruppen (`WEAPON_SUBCATEGORIES`):
  Nahkampf, Schusswaffen, Elementar & Magie, Technik & Nutzen.
- Kategorie und Waffe passen teils nicht: In `utility` liegen Angriffswaffen (Bohrkanone, Ananasbombe,
  Feuerwesen, Energiefaust); in `tech` liegen Angriffe (Luftangriff, Meteorregen, Höllenkanone,
  Flammenklinge); in `elemental` Geschütze (Artilleriegeschütz, Raketenkanone, Katapult, Plasma-Gewehr).
  Die Kategorie bestimmt aber Ersatzschaden (`DAMAGE_BY_CATEGORY`) und Strahllänge
  (`HITSCAN_RANGE_BY_CATEGORY`); eine Umsortierung wäre eine Balance-Änderung. Nur als Vorschlag (Abschnitt E).

### A5 Buffs, Mali, Zauber, Statusanzeige

- Mali (`MALUS` in `schaden.js`) haben deutsche Namen, Symbole und einen Kurztext; die Kurztexte enthalten
  Zahlen („Tempo auf 70 %"). Das ist eine zweite Quelle der Werte, sie sind aber nicht Teil der
  Hilfe-Erklärtexte (`.h-erklaerung`), für die der Test „Keine Zahlen" gilt.
- Marken in der HUD-Liste (`hud.js`): Schild, Einfrieren, Schaden über Zeit und Verstärkung haben Tooltips, aber als
  harte Textketten im Anzeigecode (eine zweite Quelle neben der Config). Mali tragen `title` aus `MALUS.kurz`.
- Protokoll der Selbstwirkungen (`#logSpecialEffect` in `main.js`): für Wirkungen ohne eigenen Fall
  erscheint der englische Schlüssel („nutzt eine Wirkung (turret)"); die Zufallswirkung meldet
  „Zufallswirkung heal" mit englischem Schlüssel. Betroffen: turret, mount, pull, chain, drill,
  freeze, damage_over_time, water_push, random.
- Klassen und Archetypen werden in der Hilfe mit ihrer Kennung beschriftet (`scout`, `heavy`, `artillery`,
  `brawler`, `artillerist`, `occultist`; `classes.js: label: classId`). Nicht Teil des Auftrags
  (Waffen), aber im selben Sinn uneinheitlich; Vorschlag in Abschnitt E.
- „Zauber" gibt es als eigene Einheit nicht; Zauberwaffen sind Waffen der Kategorie `magic` und Teile von
  `elemental`/`tech`. Ihre Wirkungen laufen über `SPECIAL_EFFECTS`.

### A6 Seltenheit gegen powerScore/powerTier

- `rarity` ist die Quell-Seltenheit der Designdatei und liegt in Blöcken nach Nummer: pa_001–080 common,
  081–120 uncommon, 121–150 rare. `powerTier` ist aus den Werten abgeleitet und ist es, was der Spieler als
  Farbe sieht und was die Beute gewichtet.
- Übereinstimmung nur bei 44 von 150 Waffen (31 common, 4 uncommon, 9 rare). 106 Waffen unterscheiden sich:
  z. B. 21 „common" sind rare, 3 epic, 1 legendary; 24 „uncommon" sind common, 8 „rare" sind common.
- Ausreißer im Leistungswert: `computePowerScore` rechnet `homing * 5` (Quellskala 0 bis 100). Fliegendes Superschaf
  (homing 70) erhält 463,8 und ist damit `legendary`, obwohl Schaden 60 und gemessener Bestwert 48,3 (Median
  rare 46,5). Phönix-Angriff (homing 35) erhält 287,9 und ist `legendary` bei gemessenem Bestwert 58,2.
- Waffen ohne Schaden (Dimensionssprung, Dimensionsriss, Jetpack, Gleitschirm, Grappling Hook, Munitionskiste)
  haben Leistungswert 0 und damit Stufe `common`, auch wenn sie als Beute nützlich sind.

### A7 Messung vor den Änderungen (`npm run balance:waffen`)

Median je Stufe (Waffen mit Schaden): common 17,8; uncommon 30,4; rare 46,5; epic 68,5; legendary 58,8.
Gemeldete Ausreißer (2): Magische Peitsche (pa_108) und Tesla-Turm (pa_129) „ohne Schaden: 0". Beide sind
Hitscan-Waffen mit Sichtlinie; ihre Untersuchung steht in Abschnitt E.


## B. Maßnahmen: Namen

44 Waffen haben einen neuen Anzeigenamen (nur `displayName`; `id`, `index`, `internalName` und Icons bleiben).
Geändert wurde die Quelle `project_armageddon_weapons_v1.json`, danach `npm run weapons:build`. Dazu wurden
das Sprite-Manifest (`src/client/assets/weapon-sprites/manifest.json`, Feld `name`), der CSV-Index und die
README-Tabellen nachgezogen. Die acht Identitätswaffen (Raketenwerfer, Salvengeber, Maschinenpistole,
Präzisionsgewehr, Raketenrucksack, Gleitschirm, Dimensionssprung, Dimensionsriss) stehen jetzt auch in der
Designdatei unter ihrem Generator-Namen.

Regeln: deutsch; Zusammensetzungen in einem Wort (Eigenname „Tesla-Turm" ausgenommen); Zaubergegenstände mit
dem Vorsatz „Zauber…" oder „Arkan…" statt „Magisch…"; kein Wort über 17 Zeichen, insgesamt höchstens 24
(Kachel des Waffenmenüs); keine Namenskollision mit den Mali. `tests/waffen-namen.test.js` hält das fest.

Namenshinweise im Generator: `hasFuse` und `deriveDamageType` lesen Teile des Anzeigenamens („bombe",
„spreng", „mine" ...). „Sprengfaust" wurde deshalb verworfen (der Name hätte der Raketenfaust einen Zünder
gegeben, `check:fuses` schlug an) und heißt „Raketenfaust".

Prüfsummen in `tests/waffen-fassung.test.js`: Sie liefen über den ganzen Katalogeintrag und damit auch über den
Anzeigenamen. Die Projektion lässt jetzt `displayName` und `description` weg (Anzeigetexte ändern keinen Schuss).
Die drei Sollwerte wurden aus dem Katalog und den Fassungs-Tabellen des Stands vor der Umbenennung neu berechnet;
mit der alten Projektion ergibt derselbe Stand wieder genau die bisherigen Werte. Kein Spielwert wurde angepasst.

| ID | alt | neu |
|---|---|---|
| pa_013 | Multifunktionsmesser | Mehrzweckmesser |
| pa_021 | Gebogene Klinge | Krummsäbel |
| pa_022 | Plasma-Blaster | Plasmawerfer |
| pa_026 | Pneumatischer Bohrer | Pressluftbohrer |
| pa_030 | Cyber-Bombe | Impulsbombe |
| pa_031 | Power Gauntlets | Kraftfaust |
| pa_033 | Magischer Kampfstock | Zauberstab |
| pa_034 | Magischer Geschosszauber | Zauberbolzen |
| pa_035 | Explosiver Energieball | Energieball |
| pa_039 | Feldkanone / Mörser | Feldmörser |
| pa_042 | Feuerwerks-Salve | Feuerwerkssalve |
| pa_044 | Phönix-Angriff | Phönixschlag |
| pa_045 | Raketen-Salve | Raketensalve |
| pa_050 | Doppelkopf-Axt | Doppelkopfaxt |
| pa_055 | Scharfschützengewehr | Fernbüchse |
| pa_060 | Minigun | Gatlingkanone |
| pa_063 | Wasserblaster | Wasserwerfer |
| pa_065 | Meteoritenbrocken | Meteorbrocken |
| pa_066 | Artilleriegeschütz | Haubitze |
| pa_068 | Plasma-Gewehr | Plasmagewehr |
| pa_074 | Verderbnis-Siegel | Verderbnissiegel |
| pa_078 | Voodoo-Puppe | Voodoopuppe |
| pa_086 | Wirbelwind-Krieger | Windkrieger |
| pa_089 | Magischer Stiefel | Zauberstiefel |
| pa_091 | Astralorb | Astralkugel |
| pa_094 | Heil-Injektion | Heilspritze |
| pa_095 | Chaos-Elixier | Chaoselixier |
| pa_098 | Lava-Elixier | Lavaelixier |
| pa_099 | Zeit-Sanduhr | Sanduhr |
| pa_103 | Verderbnis-Kelch | Verderbniskelch |
| pa_105 | Zauberrolle | Spruchrolle |
| pa_108 | Magische Peitsche | Zauberpeitsche |
| pa_111 | Grappling Hook | Enterhaken |
| pa_112 | Jetpack | Düsenrucksack |
| pa_121 | Explosiver Punch | Raketenfaust |
| pa_122 | Infinity Loop | Endlosschleife |
| pa_124 | Auto-Turret | Wachgeschütz |
| pa_125 | Versorgungscontainer | Nachschubkiste |
| pa_127 | Teleport-Plattform | Teleportplattform |
| pa_128 | Hologramm-Portal | Hologrammportal |
| pa_138 | Magischer Kriegshammer | Arkanhammer |
| pa_140 | Quantenblaster | Quantenkanone |
| pa_142 | Void-Ritter | Leerenritter |
| pa_147 | Welten-Drache | Weltendrache |

## C. Maßnahmen: Schadensarten

Geändert (Quelle `project_armageddon_weapons_v1.json`, `stats.damage_type`; Katalog neu gebaut):

| ID | Waffe | alt | neu | Grund |
|---|---|---|---|---|
| pa_122 | Endlosschleife | `temporal` | `time` | Dublette von `time` (Sanduhr), in `schaden.js` gleich geregelt |
| pa_032 | Raketenrucksack | `physical` | `utility` | Fluggerät ohne Schaden, wie Düsenrucksack und Gleitschirm |
| pa_084 | Astraltrank | `arcane` | `astral` | heißt Astral; gleiche Familie `magie`, gleiche Regel |
| pa_041 | Salvengeber | `physical` (abgeleitet) | `explosive` (abgeleitet) | kleine Rakete mit Sprengradius; Namenshinweis `salve` im Generator ergänzt |

Weitere Aufräumarbeiten:

- `src/engine/damageTypes.js`: `DAMAGE_TYPE_ALIASES` (`temporal` → `time`) und `canonicalDamageType`. Die Kennung 21 bleibt
  belegt (die Liste wird nie umgeordnet), `ART_REGEL` und `FAMILIE_VON_ART` führen den Alias weiter, damit alte Daten lesbar bleiben.
- `npm run check:damage-types` meldet jede Waffe mit Alias als Fehler.
- Toter Schlüssel `plasma` aus `GRUPPE_VON_ART` (`stoffe.js`) und `BRAND_ARTEN` (`zerstoerung.js`) entfernt; keine Waffe trug ihn,
  das Verhalten ändert sich nicht.
- AGENTS.md §2: Die Änderungen der Arten würden alte Aufzeichnungen verändern. `ARTEN_BIS_F4` in `config/waffen-fassung.js` legt
  die alten Arten über die Waffenfassungen 1 bis 4; die Fassung 5 (Standard) liest die neuen. Die Prüfsummen der Fassungen 1 bis 3
  in `tests/waffen-fassung.test.js` bleiben damit unverändert gültig.
- Zerstörungstabelle (`zerstoerungsTabelle`), `docs/terrain-matrix.md` (mit `node scripts/terrain-matrix-schreiben.mjs` neu
  geschrieben: unverändert) und Wirkgruppen sind nicht betroffen: alle vier Waffen wirken in beiden Arten als Wucht.
- Klang: Der Salvengeber klingt jetzt wie eine Rakete (`explosive` mit Sprengradius, `klangProfile.js`) statt wie ein schweres
  Geschütz; die übrigen drei Waffen klangen schon über `damage === 0` oder den Vorgabewert gleich.
- Bewusst nicht geändert: `utility`, `defense`, `medical` (verschiedene Selbstwirkungen mit eigener Regel), `energy`/`arcane`/`astral`/`void`
  (verschiedene Familien mit verschiedener Wirkung), Kaktusbombe (`physical` mit Giftanteil 12: der Giftanteil wirkt über den
  Elementarwert, die Art bleibt der Stachel).

`tests/waffen-schadensarten.test.js` (7 Tests) sichert Alias, Regeln, Stichproben (44 Waffen), Waffen ohne Schaden und die Fassungen.

## D. Maßnahmen: Beschreibungen und Texte

- Neues Katalogfeld `description` (Quelle: Designdatei, Generator reicht es durch): ein Satz je Waffe, 150 von 150, ohne
  Zahlen, eindeutig. Abgeleitet aus Schadensart, `special` und der Wirkungsart aus `SPECIAL_EFFECTS`, Zustellart,
  Sichtlinie, Anflug, Zünder, Zielsuche, Durchschlag. Was der Motor nicht tut, steht nicht im Text: Beispiele sind
  Bumerang (kehrt im Motor nicht zurück), Voodoopuppe (die Verbindung des Schadens fehlt im Motor), Pressluftbohrer
  (nur Geländeschaden), Dimensionssprung und Dimensionsriss (gleiche Weite, sie unterscheiden sich nur in Munition und
  Nachladezeit). `tests/waffen-beschreibungen.test.js` prüft Form und Deckung mit den Daten (Wirkungsart, Art, Sicht, Anflug,
  Zünder, Zielsuche, Durchschlag).
- Anzeige: Waffenmenü zeigt den Satz und die Schadensart in der Infozeile und den Satz als Tooltip der Kachel
  (auch in der schmalen Ansicht, in der die Infozeile fehlt).
- Neue Config `src/shared/config/wirkungstexte.js`: deutsche Bezeichnung und Erklärung für alle 27 Schadensarten, 16 Wirkungsarten,
  7 Mali und die vier Zustandsmarken; Familien beschriftet. `tests/wirkungstexte.test.js` prüft die Vollständigkeit gegen den Motor
  (`DAMAGE_TYPE_IDS`, `EFFECT_KIND`/`SPECIAL_EFFECTS`, `MALUS`).
- Hilfe: neuer Reiter „Schaden und Wirkungen" (`src/client/hilfeWirkungen.js`): Schadensarten nach Familie, Nachteile durch
  Treffer, Wirkungen der Waffen, Marken an den Figuren. Erklärtexte mit `h-erklaerung`, ohne Zahlen. E2E in `hilfe.spec.mjs`
  (acht Reiter statt sieben, Inhalt, keine Zahl, kein englischer Schlüssel).
- Protokoll (`main.js`): Zufallswirkung und Wirkungen ohne eigenen Fall melden den deutschen Namen („setzt Geschütz ein")
  statt des englischen Schlüssels. Die Zeilenverweise im Ereigniskatalog wurden um eine Zeile nachgezogen.
- HUD-Marken (`hud.js`): Tooltips für Schild, Einfrieren, Schaden über Zeit und Verstärkung kommen jetzt aus der Config
  (`statusTooltip`); die vier Textketten im Anzeigecode entfallen.
- Bewusst offen: Klassen- und Archetypnamen (`scout`, `heavy`, `artillery`, `brawler`, `artillerist`, `occultist`) stehen als Kennung in der
  Hilfe. Das gehört nicht zu Waffen, Buffs und Zaubern und berührt viele Tests (Vorschlag in Abschnitt E).
- Hinweis zum Allsehenden Auge (`target_scan`): Die Wirkung setzt nur eine Markierung „aufgedeckt" (Protokoll, Zustand);
  kein Motorteil liest sie (`isRevealed` wird nirgends abgefragt). Der Text sagt deshalb nur das (Vorschlag E).

## E. Balance-Leseprüfung (nur Befund und Vorschläge, kein Eingriff)

### E1 Messung vorher und nachher

`node scripts/waffen-balance.mjs` (die Messung nutzt den Standard, Waffenfassung 5) vor Abschnitt B und nach Abschnitt D:
alle 112 Zeilen (Schaden Best, Reichweite, Trefferquote, Munition, Nachladen, Schüsse bis zum Kill je Klasse) und die
fünf Stufenmediane sind **identisch**. Namen, Beschreibungen und die vier Artenwechsel ändern keinen Spielwert. Median je
Stufe: common 17,8; uncommon 30,4; rare 46,5; epic 68,5; legendary 58,8.

### E2 Die zwei gemeldeten Ausreißer sind ein Messartefakt

Zauberpeitsche (pa_108) und Tesla-Turm (pa_129) „ohne Schaden: 0" treffen im Spiel. Ein Schuss auf freier Karte
(`open`, 60 und 150 px) richtet 32 beziehungsweise 48 Schaden an, genau den Katalogwert. Das Skript misst je Waffe nur
eine Karte (Seed aus dem Katalogindex) und versucht nur Winkel von 0 bis 0,15 rad; bei Sichtlinienwaffen weist der Motor
den Schuss auf der Hügelkarte oft ab (`ok: false`, kein freier Blick) oder der Strahl verfehlt die schmale Trefferfläche.
Mit anderen Seeds trifft dieselbe Waffe (Zauberpeitsche mit Index 110 trifft 32, Tesla-Turm mit Index 130 trifft 48). Es
ist kein Waffenfehler, daher kein Eingriff. Vorschlag für das Messskript: bei Sichtlinien-Strahlen mit Messwert 0 mit
einem zweiten und dritten Seed wiederholen, bevor ein Ausreißer gemeldet wird.

### E3 Eigene Leseprüfung der Messtabelle (Verhältnis Bestwert zu Stufenmedian)

Deutlich stärker als die Stufe (über 1,6): Plasmagewehr 1,96 (uncommon), Haubitze 1,89 (rare), Quantenkanone 1,72, Weltendrache
1,72 (legendary), Quantengewehr 1,69, Traumfänger 1,69 (common), Meteorbrocken 1,63 (epic). Keine liegt über der Messgrenze
`ZU_STARK` (2), alle Fassung-5-Korrekturen greifen schon.

Deutlich schwächer (unter 0,55): Boxhandschuhe, Maschinenpistole, Salvengeber, Raketenwerfer, Zauberstab (0,51 bis 0,54, knapp
bei der Grenze `ZU_SCHWACH` 0,5), dann Kaktusbombe 0,45, Pömpel 0,43, Handgranate 0,35, Roboterbombe 0,27, Kosmische Wassermelone
0,22, Impulsbombe 0,18, Splittergranate 0,18, Bananengranate 0,17. Die Zünderwaffen (Handgranate bis Bananengranate) sind vom
Ausreißerbericht ausgenommen; acht von elf liegen unter 0,5. Ob das echte Schwäche oder Messverfahren ist (Ziel steht still,
Zünder läuft nach der Landung, Trefferquote 0,4 bis 0,6), ist offen.

### E4 Vorschläge (nicht umgesetzt; brauchen eine Entscheidung des Auftraggebers)

1. **Leistungswert und Beute: Zielsuche.** `computePowerScore` rechnet `homing * 5` (Quellskala 0 bis 100). Fliegendes Superschaf
   (463,8) und Phönixschlag (287,9) sind dadurch `legendary`, obwohl der gemessene Schaden zur Stufe rare/epic passt (48,3 und 58,2).
   Mit dem Gewicht 0,5 statt 5 ergäben sich 152,0 beziehungsweise 146,1 (beide epic). Das ändert die Stufe und damit die
   Beutegewichte (`pickWeaponForRarity` liest `powerTier` des Katalogs, ohne Fassung); alte Aufzeichnungen bräuchten dafür eine
   Versionsmarke (AGENTS.md §2). Deshalb nicht ohne Rückfrage.
2. **Seltenheit der Designdatei.** `rarity` folgt der Nummer (001 bis 080 common, 081 bis 120 uncommon, 121 bis 150 rare), 106 von
   150 Waffen zeigen eine andere `powerTier`. Vorschlag: `sourceRarity` aus der Designdatei streichen oder aus `powerTier`
   ableiten, damit zwei Seltenheiten nicht dasselbe zu sagen vorgeben.
3. **Waffen ohne Schaden haben Stufe common** (Dimensionssprung, Dimensionsriss, Düsenrucksack, Gleitschirm, Enterhaken,
   Munitionskiste; Leistungswert 0), obwohl ihr Nutzen hoch ist. Vorschlag: eigener Nutzwert im Leistungswert (Reichweite der
   Versetzung, Nachladezeit, Munition).
4. **Zünderwaffen prüfen.** Messverfahren für Zünder (bewegtes oder wartendes Ziel) klären, danach entscheiden, ob Kaktusbombe,
   Pömpel, Roboterbombe, Impulsbombe, Splitter- und Bananengranate und die Wassermelone Schaden oder Radius brauchen.
5. **Kategorien nach Wirkung ordnen.** Angriffswaffen in `utility` (Bohrkanone, Ananasbombe, Feuerwesen, Energiefaust) und in
   `tech` sowie Geschütze in `elemental` beeinflussen Ersatzschaden und Strahllänge je Kategorie
   (`DAMAGE_BY_CATEGORY`, `HITSCAN_RANGE_BY_CATEGORY`). Eine Umsortierung ist eine Balance-Änderung an mehr als einem Dutzend Waffen.
6. **Kaktusbombe**: Elementarwert Gift 12 bei Art `physical`; mit Art `poison` löste ein Treffer zusätzlich den Malus Gift und die
   halbe Rüstung aus (Balance-Änderung).
7. **Handgranate**: Art `explosive`, aber Radius 0 (reiner Direkttreffer nach der Landung). Entweder Radius oder Art `physical`.
8. **Allsehendes Auge** setzt nur eine Markierung „aufgedeckt"; `isRevealed` wird nirgends gelesen. Entweder eine Wirkung
   (Sicht, Fadenkreuz) anbinden oder die Waffe als Platzhalter kennzeichnen.
9. **Klassen- und Archetypnamen** (`scout`, `heavy`, `artillery`, `brawler`, `artillerist`, `occultist`) in Hilfe und Kader deutsch
   beschriften (`label: classId` in `classes.js`); berührt Tests und E2E-Texte.

## F. Umgesetzt (Auslese)

Auftrag des Auftraggebers (2026-10-28): die eindeutigen Punkte der Balance-Auslesen `docs/balance-auslese/*.md`
(Abschnitte „Sofort umsetzbar") umsetzen. Sie ändern Leistungswert, Stufe (Beutegewicht) und Texte, **nicht den Gefechtsablauf**.
Quelle der Werte ist der Generator `scripts/build-weapon-catalog.mjs` (Tabellen `KATALOG_F5_SCHADEN` und
`AUSLESE_KORREKTUREN`, angewandt nach allen Ableitungen und vor `powerScore`), die Texte stehen in
`project_armageddon_weapons_v1.json`; `src/shared/config/weapons.js` ist wie immer erzeugt (`npm run weapons:build`).

### F1 Was geändert wurde

1. **`homing`-Gewicht im Leistungswert 5 → 0,5** (`computePowerScore`): Fliegendes Superschaf (463,82 → 151,97) und Phönixschlag
   (287,87 → 146,12) sind jetzt `epic` statt `legendary`.
2. **Katalogschaden = Spielwert der Fassung 5** (`WAFFEN_F5_WERTE`) bei zehn Waffen: pa_026, 041, 055, 059, 063, 071, 075, 097,
   104, 140. Der Katalog-Leistungswert passt damit wieder zu dem, was der Motor spielt. Reichweite, Abklingzeit und alle übrigen
   Ableitungen bleiben auf dem Schaden von vorher (sie sind Spielwerte, `getWaffe` ändert sie in Fassung 5 nie).
3. **Selbstwirkungen ohne Schaden** (`damage` → 0): Wächterstatue, Endlosschleife, Nachschubkiste, Bunker (zusätzlich
   `terrainDamage` → 0), Teleportplattform, Hologrammportal, Tarnnetz, Schlauchboot; Blutritual (`blastRadius` 55 → 0, `aoe` →
   falsch, Gift 35 → 0; Schaden 50 bleibt, die Heilung 60 = 1,2 × 50 hängt daran). Wächterstatue heilt weiter 35 (Untergrenze).
   Das Wachgeschütz bleibt (der Katalogschaden speist das Geschütz: 23 = 38 × 0,6). Die Wirkung (`buildEffect`) jeder der 150
   Waffen ist vor und nach der Änderung gleich (Test).
4. **Strahlwaffen ohne Umkreis, den der Strahl nicht liest** (`#resolveHitscan` wendet nur Schaden, Schadensart und
   Zielwirkung an; `fire()` verlässt Strahlwaffen vor `resolveStrike`): Radius, Fläche, Rückstoß (und Gelände) → 0 bei Raketenfaust,
   Magnetkanone, Alte Dame, Arkanhammer, Windkrieger; Radius und Fläche → 0 bei Luftangriff, Meteorregen, Tesla-Turm, Höllenkanone
   (Brand 48 bleibt), Zauberbuch der Leere, Chaosmagier, Giftpilz, Astralkugel, Lavaelixier, Gedankensturm, Verderbniskelch,
   Sonnenamulett; Radius, Fläche und Gelände → 0 bei Bohrkopfrakete; Gelände → 0 bei Bohrkanone; Rückstoß → 0 bei Goldener Hand und
   Zauberpeitsche. 21 Waffen, alle `delivery: hitscan` (Test).
5. **Beschreibungen**: 25 Texte, wo sie Unwahres versprachen (Tabelle unten). Die Textprüfungen in
   `tests/waffen-beschreibungen.test.js` bleiben unverändert und grün.

Alt → neu je Waffe (Katalog):

| Kennung | Waffe | alt → neu |
|---|---|---|
| pa_026 | Pressluftbohrer | Schaden 18 → 36; Leistungswert 76,56 → 96,36; Stufe uncommon → rare |
| pa_041 | Salvengeber | Schaden 22 → 48; Leistungswert 68,26 → 98,16; Stufe uncommon → rare |
| pa_044 | Phönixschlag | Leistungswert 287,87 → 146,12; Stufe legendary → epic |
| pa_055 | Fernbüchse | Schaden 65 → 42; Leistungswert 63,78 → 44,12; Stufe uncommon → common |
| pa_059 | Armbrust | Schaden 66 → 41; Leistungswert 64,64 → 43,26; Stufe uncommon → common |
| pa_063 | Wasserwerfer | Schaden 18 → 32; Leistungswert 43,2 → 57,2; Stufe common → uncommon |
| pa_071 | Eisschlag | Schaden 42 → 55; Leistungswert 97,88 → 109,58 |
| pa_075 | Tornado | Schaden 18 → 45; Leistungswert 82,4 → 106,7 |
| pa_081 | Zauberbuch der Leere | Radius 48 → 0; Fläche ja → nein; Leistungswert 97,02 → 49,5; Stufe rare → uncommon |
| pa_083 | Goldene Hand | Rückstoß 70 → 0; Leistungswert 48,96 → 41,4; Stufe uncommon → common |
| pa_085 | Chaosmagier | Radius 45 → 0; Fläche ja → nein; Leistungswert 85,73 → 40,5; Stufe rare → common |
| pa_086 | Windkrieger | Radius 46 → 0; Rückstoß 78 → 0; Fläche ja → nein; Leistungswert 92,21 → 37,8; Stufe rare → common |
| pa_090 | Giftpilz | Radius 38 → 0; Fläche ja → nein; Leistungswert 78,57 → 38,7; Stufe uncommon → common |
| pa_091 | Astralkugel | Radius 55 → 0; Fläche ja → nein; Leistungswert 105,08 → 52,2; Stufe rare → uncommon |
| pa_097 | Traumfänger | Schaden 38 → 30; Leistungswert 34,2 → 27 |
| pa_098 | Lavaelixier | Radius 50 → 0; Fläche ja → nein; Leistungswert 114,3 → 65,25; Stufe rare → uncommon |
| pa_102 | Gedankensturm | Radius 60 → 0; Fläche ja → nein; Leistungswert 103,5 → 46,8; Stufe rare → uncommon |
| pa_103 | Verderbniskelch | Radius 48 → 0; Fläche ja → nein; Leistungswert 88,02 → 40,5; Stufe rare → common |
| pa_104 | Quantengewehr | Schaden 56 → 45; Leistungswert 53,01 → 43,6; Stufe uncommon → common |
| pa_106 | Sonnenamulett | Radius 40 → 0; Fläche ja → nein; Leistungswert 86,85 → 45,45; Stufe rare → uncommon |
| pa_108 | Zauberpeitsche | Rückstoß 55 → 0; Leistungswert 33 → 27,36 |
| pa_113 | Bohrkanone | Gelände 85 → 0; Leistungswert 89,1 → 33; Stufe rare → common |
| pa_115 | Wächterstatue | Schaden 28 → 0; Schadensherkunft source → none; Leistungswert 30,8 → 0 |
| pa_116 | Blutritual | Radius 55 → 0; Fläche ja → nein; Gift 35 → 0; Leistungswert 124,99 → 49,5; Stufe rare → uncommon |
| pa_121 | Raketenfaust | Radius 35 → 0; Rückstoß 88 → 0; Fläche ja → nein; Leistungswert 109,21 → 57,42; Stufe rare → uncommon |
| pa_122 | Endlosschleife | Schaden 32 → 0; Schadensherkunft derived → none; Leistungswert 35,2 → 0 |
| pa_123 | Magnetkanone | Radius 45 → 0; Rückstoß 95 → 0; Fläche ja → nein; Leistungswert 100,63 → 39,6; Stufe rare → common |
| pa_125 | Nachschubkiste | Schaden 31 → 0; Schadensherkunft derived → none; Leistungswert 34,1 → 0 |
| pa_126 | Bunker | Schaden 27 → 0; Gelände 20 → 0; Schadensherkunft derived → none; Leistungswert 42,9 → 0 |
| pa_127 | Teleportplattform | Schaden 34 → 0; Schadensherkunft derived → none; Leistungswert 37,4 → 0 |
| pa_128 | Hologrammportal | Schaden 30 → 0; Schadensherkunft derived → none; Leistungswert 33 → 0 |
| pa_129 | Tesla-Turm | Radius 52 → 0; Fläche ja → nein; Leistungswert 98 → 45,14; Stufe rare → uncommon |
| pa_130 | Tarnnetz | Schaden 33 → 0; Schadensherkunft derived → none; Leistungswert 36,3 → 0 |
| pa_131 | Schlauchboot | Schaden 29 → 0; Schadensherkunft derived → none; Leistungswert 31,9 → 0 |
| pa_132 | Alte Dame | Radius 30 → 0; Rückstoß 82 → 0; Fläche ja → nein; Leistungswert 101,32 → 54,45; Stufe rare → uncommon |
| pa_133 | Fliegendes Superschaf | Leistungswert 463,82 → 151,97; Stufe legendary → epic |
| pa_134 | Luftangriff | Radius 65 → 0; Fläche ja → nein; Leistungswert 127,96 → 61,38; Stufe rare → uncommon |
| pa_135 | Meteorregen | Radius 55 → 0; Fläche ja → nein; Leistungswert 125,48 → 67,32; Stufe rare → uncommon |
| pa_136 | Bohrkopfrakete | Radius 48 → 0; Gelände 65 → 0; Fläche ja → nein; Leistungswert 154,24 → 63,36; Stufe epic → uncommon |
| pa_138 | Arkanhammer | Radius 45 → 0; Rückstoß 78 → 0; Fläche ja → nein; Leistungswert 120,02 → 63,95; Stufe rare → uncommon |
| pa_139 | Höllenkanone | Radius 58 → 0; Fläche ja → nein; Leistungswert 151,77 → 91,08; Stufe epic → rare |
| pa_140 | Quantenkanone | Schaden 60 → 47; Leistungswert 62,07 → 49,85 |

Beschreibungen alt → neu:

| Kennung | Waffe | alt | neu |
|---|---|---|---|
| pa_001 | Baseballschläger | Wuchtiger Schlag auf kurze Distanz, der den Gegner weit zurückstößt. | Wuchtiger Schlag auf kurze Distanz mit hohem Schaden. |
| pa_020 | Kriegssense | Lange Sense mit weitem Hieb auf mittlere Distanz. | Lange Sense für einen kräftigen Hieb auf kurze Distanz. |
| pa_047 | Handgranate | Wurfgranate mit Zünder, die abprallt, bevor sie zündet. | Wurfgranate mit Zünder, die nach dem ersten Aufprall liegen bleibt, bevor sie zündet. |
| pa_048 | Bananengranate | Granate mit Zünder, die abprallt und beim Zünden in Splitter zerfällt. | Bananenförmige Granate, die nach dem Aufprall mit Verzögerung zündet. |
| pa_053 | Roboterbombe | Kleiner Roboter mit Sprengladung, der nach kurzer Verzögerung explodiert. | Bombe in Form eines kleinen Roboters, die nach kurzer Verzögerung explodiert. |
| pa_058 | Kampfbogen | Bogen für Pfeile in flacher Bahn, der freie Sicht braucht. | Bogen für gezielte Pfeile, der freie Sicht braucht. |
| pa_061 | Feuerdämon | Beschworener Feuerdämon, der im Umkreis wütet und in Brand setzt. | Feuerdämon, der im Umkreis wütet und in Brand setzt. |
| pa_065 | Meteorbrocken | Glühender Brocken, der von oben einschlägt und das Gelände aufreißt. | Brocken, der von oben einschlägt und das Gelände aufreißt. |
| pa_071 | Eisschlag | Eisbrocken, der im Umkreis einschlägt und den Gegner einfriert. | Eisbrocken, der im Umkreis einschlägt, den Gegner verlangsamt und beim zweiten Treffer betäubt. |
| pa_081 | Zauberbuch der Leere | Zauberbuch, das die Leere entfesselt: Schaden im Umkreis und anhaltender Schaden über Zeit. | Zauberbuch, das die Leere entfesselt: Schaden am getroffenen Gegner und anhaltender Schaden über Zeit. |
| pa_086 | Windkrieger | Krieger im Wirbelwind, der Gegner im Umkreis zum Schützen heranzieht. | Krieger im Wirbelwind, der den getroffenen Gegner zum Schützen heranzieht. |
| pa_090 | Giftpilz | Giftiger Pilz, der im Umkreis vergiftet. | Giftiger Pilz, der den getroffenen Gegner vergiftet. |
| pa_091 | Astralkugel | Kugel aus Astralenergie, die unmittelbar im Umkreis einschlägt. | Kugel aus Astralenergie, die den getroffenen Gegner unmittelbar trifft. |
| pa_098 | Lavaelixier | Flüssige Lava, die im Umkreis in Brand setzt und Schaden über Zeit anrichtet. | Flüssige Lava, die den getroffenen Gegner in Brand setzt und Schaden über Zeit anrichtet. |
| pa_102 | Gedankensturm | Mentaler Sturm, der im Umkreis unmittelbar Schaden anrichtet. | Mentaler Sturm, der dem getroffenen Gegner unmittelbar Schaden anrichtet. |
| pa_103 | Verderbniskelch | Kelch, dessen Verderbnis im Umkreis Schaden über Zeit anrichtet und verflucht. | Kelch, dessen Verderbnis dem getroffenen Gegner Schaden über Zeit anrichtet und ihn verflucht. |
| pa_106 | Sonnenamulett | Amulett, das Sonnenlicht im Umkreis bündelt und Verfluchte härter trifft. | Amulett, das Sonnenlicht bündelt, den Gegner in Brand setzt und Verfluchte härter trifft. |
| pa_117 | Ananasbombe | Ananasförmige Granate mit Sprengwirkung im Umkreis und Splitterlöchern im Gelände. | Ananasförmige Granate, die das getroffene Ziel unmittelbar sprengt. |
| pa_118 | Feuerwesen | Feuerwesen, das im Umkreis Brand legt. | Feuerwesen, das den getroffenen Gegner in Brand setzt. |
| pa_121 | Raketenfaust | Faustschlag mit Raketenantrieb, der im Umkreis explodiert. | Faustschlag mit Raketenantrieb, der das getroffene Ziel unmittelbar trifft. |
| pa_123 | Magnetkanone | Magnet, der Gegner im Umkreis zum Schützen heranzieht. | Magnet, der den getroffenen Gegner zum Schützen heranzieht. |
| pa_132 | Alte Dame | Erstaunlich schlagkräftige Dame, deren Hieb auch auf große Distanz im Umkreis wirkt. | Erstaunlich schlagkräftige Dame, deren Hieb auch auf große Distanz trifft. |
| pa_136 | Bohrkopfrakete | Rakete mit Bohrkopf und großer Sprengwirkung. | Rakete mit Bohrkopf, die das getroffene Ziel unmittelbar trifft. |
| pa_138 | Arkanhammer | Hammer aus arkaner Kraft, der im Umkreis einschlägt und freie Sicht braucht. | Hammer aus arkaner Kraft, der unmittelbar einschlägt und freie Sicht braucht. |
| pa_139 | Höllenkanone | Kanone, deren Feuerstrahl von der Seite im Umkreis einschlägt. | Kanone, deren Feuerstrahl von der Seite einschlägt und in Brand setzt. |

### F2 Was bewusst nicht geändert wurde

- **Luftangriff und Meteorregen: „von oben"**, **Höllenkanone: „von der Seite"** bleiben im Text. `tests/waffen-beschreibungen.test.js`
  verlangt den Anflug im Text, solange `strikeStyle` `sky`/`flank` ist, und `tests/weapon-identity.test.js` hält `strikeStyle`
  gleich der Ableitung. Wahr wird der Satz erst durch die Entscheidung Strahl gegen Projektil (Abschnitt E4); dort steht sie.
- **Spruchrolle** `delivery` projectile → hitscan (magic.md): ändert das Zustellfeld, das Kit-Pools und Filter lesen; nicht in der
  Liste des Auftrags, nicht umgesetzt.
- **Astralkugel und Gedankensturm** Abklingzeit 3 → 2 (magic.md, Variante A): Spielwert, Entscheidung.
- **Portalring und Kosmisches Portal** `damage` → 0, **Giftwolke, Tentakelgift, Flammenwerfer** Elementarwerte auf den Deckel,
  **Rückstoß der Zug-Waffen** (Tornado, Schwarzes Loch, Psionischer Tentakel): in elemental.md „sofort", aber nicht in der
  Liste des Auftrags; die Portale sind laut elemental.md zugleich eine offene Entscheidung (Zusammenführen oder unterscheiden).
- **Energiefaust und Flammenklinge** (Strahlwaffen mit Rückstoß 78 und 55, den der Strahl nicht liest), **Ananasbombe und Feuerwesen**
  (Strahlwaffen mit Radius 45 und 42): nicht in der Liste; bei Ananasbombe und Feuerwesen wurde nur der Text angeglichen
  (melee-utility.md). Ihr Radius und Rückstoß zählen weiter im Leistungswert.
- **Bohrkopfrakete** `drill_rocket` auf `DRILL` abbilden, **Handgranate** `bounces` 2 → 0: Entscheidung bzw. nicht in der Liste.
- Nicht umgesetzt, Entscheidung beim Auftraggeber: Zünder im Motor, Rückstoß der Nahkämpfer, Himmels-/Flankenschlag-Doppeltreffer,
  Schadenswerte (Flammenwerfer, Plasmagewehr …), Zünder +15 %.

### F3 Warum das Gefecht gleich bleibt (Beleg)

Die Fassungen 1 bis 4 lesen den Katalog selbst (Fernbüchse 65, Alte Dame Radius 30). Damit ihre Aufzeichnungen Bit für Bit gelten,
legt `getWaffe` für sie als unterste Schicht `WAFFEN_F4_WERTE` über den Katalog: die Altwerte genau der Felder, die diese Auslese
bewegt (Schaden, Radius, Rückstoß, Fläche, Gelände, Gift des Blutrituals, Schadensherkunft, `powerScore`, `powerTier`). Die drei
Prüfsummen in `tests/waffen-fassung.test.js` (Fassung 1, 2, 3) sind **unverändert** und stimmen. Fassung 5 liest den neuen Katalog.

Gemessen vor und nach der Änderung (Skript im Scratchpad, nicht im Repo): je ein Schuss jeder der 150 Waffen in jeder Fassung 1 bis 5
(dreimal, andere Winkel und Abstände, `open`-Karte, Seed 31337): 2250 von 2250 Zustandshashes, Schäden und Selbstschäden
**identisch**. Die 252 Schüsse der 42 geänderten Waffen in Fassung 4 und 5 stehen als Goldhash in `tests/waffen-auslese.test.js`.

**Start-Kits.** Die Kit-Pools (`loadouts.js`) lesen Stufe, Schaden, Radius und Abklingzeit des Katalogs. Ohne Gegenmaßnahme hätten
sich die Startwaffen geändert: sieben Selbstwirkungen mit Schaden 0 fallen aus den Pools der Kits 2 und 3 (Strahlwaffe der Kategorie
`tech`), der Salvengeber (jetzt `rare`, Schaden 48) aus `getStarterFlaeche`. Die Kits lesen deshalb `waffeVorAuslese`, die Sicht
auf den Katalog vor der Auslese. Belegt: 4800 Plätze (Kits 1 bis 4, 300 Seeds, 4 Plätze) und 12 Klassen-Loadouts wählen dieselben
Waffen wie vorher (Goldhash im Test).

**Beute (Beutegewichte), erwartet und ausdrücklich beauftragt.** Die Stufe des Katalogs ist das Beutegewicht
(`pickWeaponForRarity`, `waehleWaffeNachStufe` lesen `powerTier` ohne Fassung). 29 Waffen wechseln die Stufe; die Waffen je Stufe
(Kistenfassung 3, `npm run balance:loot`):

| Stufe | Waffen vorher | Waffen nachher | Chance je Waffe und Waffenkiste vorher | nachher |
|---|---|---|---|---|
| common | 63 | 72 | 0,779 % | 0,681 % |
| uncommon | 32 | 39 | 0,780 % | 0,640 % |
| rare | 42 | 28 | 0,425 % | 0,637 % |
| epic | 8 | 8 | 0,766 % | 0,766 % |
| legendary | 5 | 3 | 0,406 % | 0,676 % |

Der Anteil je Stufe an den Waffenkisten bleibt (49,1 / 25 / 17,8 / 6,1 / 2 %), nur die Verteilung innerhalb der Stufe ändert sich:
seltene Waffen werden einzeln häufiger (rare 0,425 → 0,637 %, legendary 0,406 → 0,676 %), gewöhnliche seltener. Alle 150 Waffen
werden weiter gezogen (`nieGezogen` leer).

**Folge für alte Aufzeichnungen (zur Entscheidung).** Weil `lootSystem.js` den Katalog liest, fallen in Aufzeichnungen mit Waffenkisten
andere Waffen als vorher; die Gefechtsregeln sind gleich, der Kisteninhalt nicht. Sichtbar wurde das in
`tests/tiere-feinschliff.test.js` („Altköpfe laufen Bit für Bit"): alle fünf Läufe (Günther 1 und 2, Cookie 1 und 2) ergeben
andere Zustandshashes, etwa Seed 7 mit `guenther` 1 `bdcd6ab5` statt `d6881995` (Ereignisse und Runden gleich); mit dem Katalog von
vorher ergibt derselbe Code alle fünf alten Hashes wieder. Die Festwerte wurden nachgezogen und im Test begründet. Wer die Beute alter Aufzeichnungen erhalten will, braucht eine Versionsmarke `kisten` 4 mit
eingefrorenen Stufen (AGENTS.md §2); sie wurde auf Anweisung („Fassung nicht ohne Rückfrage erhöhen") **nicht** gesetzt.

### F4 Messung (`npm run balance:waffen`) vorher und nachher

112 Zeilen (Waffen mit gemessenem Schaden): **Bestwert, Reichweite, Trefferquote, Munition, Nachladen und Schüsse bis zum Kill
sind in allen 112 Zeilen identisch.** Es ändern sich nur die Spalte „Kat-Sch." (zehn Waffen, Katalogschaden = Spielwert) und die
Stufe (27 von 112 Zeilen; 29 im Katalog, zwei ohne Messzeile).

| Stufenmedian (Waffen mit Schaden) | vorher | nachher |
|---|---|---|
| common | n=30, Schaden 17,8, Reichweite 150 | n=38, Schaden 19,6, Reichweite 300 |
| uncommon | n=28, 30,4, 300 | n=33, 36,4, 300 |
| rare | n=30, 46,5, 300 | n=19, 33,4, 300 |
| epic | n=6, 68,5, 400 | n=6, 53,3, 300 |
| legendary | n=5, 58,8, 300 | n=3, 70, 300 |

Die Mediane verschieben sich nur, weil die Waffen anders auf die Stufen verteilt sind; kein Gefechtswert hat sich bewegt.

## Fassung 10 (2026-10-29): Dubletten gestaffelt, mit Element

Auftrag des Auftraggebers (Spracheingabe): "auseinanderskillen", "Werte auseinanderziehen", "ein Element hinein: Feuer, Eis, Blitz, Gift".
Umsetzung: `WAFFEN_F10_WERTE` in `src/shared/config/waffen-fassung.js` (Waffenfassung 10, Standard); Fassung 9 und älter bitgleich.
Die Spalte alt gilt für Fassung 9 und älter (Standardwerte `SPECIAL_DEFAULTS`). Munition (`maxAmmo`) bleibt unverändert: Inventar und
Start-Kits lesen den Katalog, die Staffelung läuft über Stärke, Dauer, Weite und Abklingzeit.

**Gadgets** (Katalogfeld `gadget`, Schritt 1): Raketenrucksack, Düsenrucksack, Gleitschirm, Enterhaken, Wächterstatue, Munitionskiste,
Nachschubkiste, Endlosschleife, Bunker, Tarnnetz, Teleportplattform, Hologrammportal, Schlauchboot. Waffen bleiben Bohrkanone, Blutritual,
Ananasbombe, Feuerwesen, Energiefaust (Schaden am Ziel) und das Wachgeschütz (schießt selbst).

| Gruppe | Waffe | alt | neu (Fassung 10) | Element / Wirkung |
|---|---|---|---|---|
| Verstärkung | Glutelixier (vorher Astraltrank) | ×1,5, 2 Züge, Pause 1 | ×1,7, 2 Züge (ein Schuss), Pause 2 | Feuer: Brand auf jedem Treffer |
| Verstärkung | Sturmelixier (vorher Chaoselixier) | ×1,5, 2 Züge, Pause 1 | ×1,3, 3 Züge (zwei Schüsse), Pause 1 | Blitz: Schock |
| Verstärkung | Frostsanduhr (vorher Sanduhr) | ×1,5, 2 Züge, Pause 1 | ×1,2, 4 Züge (drei Schüsse), Pause 1 | Eis: Frost |
| Verstärkung | Giftbaum (vorher Weltenbaum) | ×1,5, 2 Züge, Pause 1 | ×1,15, 5 Züge (vier Schüsse), Pause 1 | Gift |
| Zufall | Feuermagier (vorher Chaosmagier) | sechs Arten, Pause 2 | Verstärkung, Rüstung, Munition; Pause 2 | Feuer: Verstärkung mit Brand |
| Zufall | Frostrolle (vorher Spruchrolle) | sechs Arten, Pause 1 | Schild, Heilung, Rüstung; Pause 1 | Eis: Schild mit Frost |
| Zufall | Blitzwürfel (vorher Würfel des Chaos) | sechs Arten, Pause 1 | Verstärkung, Sprung, Munition; Pause 1 | Blitz: Verstärkung mit Schock |
| Zufall | Mutationselixier | sechs Arten, Pause 1 | Heilung, Sprung, Verstärkung; Pause 1 | Gift: Verstärkung mit Gift |
| Versetzen | Zauberstiefel | 60 px, Pause 1 | 40 px, Pause 0 | - |
| Versetzen | Dimensionssprung | 60 px, Pause 0 | 80 px, Pause 0 | - |
| Versetzen | Dimensionskugel | 60 px, Pause 1 | 110 px, Pause 1 | - |
| Versetzen | Dimensionsriss | 60 px, Pause 2 | 165 px, Pause 2 | - |
| Schild | Eisschild | 40, Pause 1 | 55, Pause 2 | Eis: Frost auf den Angreifer |
| Schild | Funkenschild (vorher Engelssegen) | 40, Pause 1 | 40, Pause 1 | Blitz: Schock auf den Angreifer |
| Heilung | Heilzauber | 42, Pause 1 | 40, Pause 0 | - |
| Heilung | Heilspritze | 47, Pause 1 | 70, Pause 2 | - |
| Fliegen/Haken (Gadgets) | Enterhaken | 60 px | 45 px | - |
| | Düsenrucksack | 60 px | 70 px | - |
| | Raketenrucksack | 60 px, Pause 0 | 100 px, Pause 1 | - |
| | Gleitschirm | 60 px, Pause 2 | 160 px, Pause 2 | - |
| Haken | Hakenklinge | zieht 90 px | zieht 60 px (mehr Schaden 30) | - |
| | Piratenhaken | zieht 90 px | zieht 150 px, Pause 1 (Schaden 24) | - |
| weitere Gadgets | Schlauchboot / Hologrammportal / Teleportplattform | je 60 px | 50 px / 90 px / 120 px mit Pause 1 | - |
| | Munitionskiste / Endlosschleife / Nachschubkiste | je 3 Ladungen | 2 / 3 / 4 mit Pause 1 | - |
| | Tarnnetz / Bunker | je 30 % Rüstung | 20 % / 35 % | - |

Wirkung des Elements, nur mit vorhandenen Mali (`config/schaden.js`): Brand (Feuer), Frost (Eis), Schock (Blitz), Gift. Die Dauer der
Verstärkung zählt wie bisher in Zügen; der Wurf kostet den eigenen Zug, die Wirkung hält `Dauer - 1` eigene Züge.
Nicht umgesetzt: Elemente für Versetzer, Flieger und Heiler (bräuchten eigene Motorwirkung wie Spuren oder Aufprallschaden), ein dritter
Schild (Feuerschild) ohne Dublette, Staffelung der Munition (Katalogfeld, würde Kits und Beute ändern), und die Anzeige der
Fassung-10-Werte im Waffenmenü (der Client liest den Katalog).
