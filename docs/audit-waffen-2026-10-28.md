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
- Marken in HUD und Rangliste (`hud.js`): Schild `🛡`, Einfrieren `❄`, Schaden über Zeit `☠`, Verstärkung `↑`
  haben keinen Tooltip; nur Mali tragen `title`.
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
