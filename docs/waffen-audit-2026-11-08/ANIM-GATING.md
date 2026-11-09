# Zusatzanimationen: Sperre, Rollen, Abnahme (W05/W06/W11/W17)

Stand: 09.11.2026 · Branch `bg/waffen-anim` · Ergänzung zu [BERICHT.md](BERICHT.md)

An Spielmechanik, Waffenwerten und Bildern wurde nichts geändert. Diese Ergänzung
schließt die Lücke zwischen „26 Sheets sind da“ und „26 Sheets sind benutzbar“:
Der Bestand bleibt gesperrt, die Sperre ist jetzt technisch durchgesetzt und
testbar, und jeder einzelne Befund ist je Blatt festgehalten.

## Ergebnis in einem Satz

Kein Produktpfad lädt `weapon-sprites/anim`; das ist keine Zufallsbeobachtung mehr,
sondern ein Test. 26 Blätter sind mit Rolle, Motiv, Befund und Schweregrad im
Manifest erfasst, keines ist freigegeben, 12 zeigen ein fremdes Motiv,
pa_112/pa_114 bleiben bytegleich, und 15 Ruhebilder plus 8 Animationsblätter sind
als Effektträger (W17) auf Datenebene erfasst.

## W05 – Prüfung des Ladepfads

Gesucht wurde im gesamten Produktbaum (`src/`, `index.html`, `vite.config.mjs`)
nach `weapon-sprites/anim`, `anim/manifest`, `pa_0xx.webp` und WebP-Globs.
Treffer außerhalb von `docs/` gab es keinen. Der einzige Verweis auf den Ordner
war bisher der Manifest-Hinweistext selbst.

Damit ist die Aussage aus dem Bericht bestätigt und verschärft: Es gibt nicht nur
keinen Loader, es gibt auch keinen toten Import, kein Glob und keinen
Manifesteintrag, über den die Blätter versehentlich in ein Bundle geraten.
`tests/waffen-anim-gating.test.js` prüft das bei jedem Lauf; eine Gegenprobe mit
einer Testdatei `src/client/_gate-probe.js` ließ den Test bewusst rot werden.

### Blatt für Blatt

Schweregrad: `fremd` = anderes Motiv/Tier/Humanoid · `identitaet` = Motiv bricht
innerhalb des Blattes oder weicht stark ab · `statisch` = Motiv passt, Bewegung
fehlt oder springt · `nah` = motivnah, nur Bewegungs-/Rollenabnahme offen.
Rolle = geplante Darstellungsrolle nach W07 (noch nicht abgenommen).

| ID | Waffe | Rolle | Motiv im Blatt (F0/F3/F7) | Befund | Schwere |
| --- | --- | --- | --- | --- | --- |
| pa_032 | Raketenrucksack | rücken | blauer geflügelter Käfer/Krebs | fremdes Tier statt grünem Rucksack | fremd |
| pa_038 | Rakete | flug | Rakete mit Flammenmantel | Triebwerksflamme eingebrannt (W17), sonst motivnah | nah |
| pa_044 | Phönixschlag | flug | brennender Phönix | Motiv passend, Frames nahezu identisch, Feuer eingebrannt | statisch |
| pa_048 | Bananengranate | flug | Bananengranate mit Zünder | motivnah, statisch, keine Rotation/Splitter | nah |
| pa_049 | Bumerang | wurf | orange Bombe mit grauen Flügeln | fremdes Flugobjekt, kein Bumerang | fremd |
| pa_053 | Roboterbombe | welt | Holzwagen mit Mäusen | fremdes Motiv, keine Roboterbombe | fremd |
| pa_061 | Feuerdämon | beschwörung | brennender Dämon | Motiv passend, Flammen eingebrannt, statisch | statisch |
| pa_065 | Meteorbrocken | flug | Stein mit gelbem Schweif | Schweif angeklebt/eingebrannt, Formwechsel | statisch |
| pa_073 | Tentakelgift | welt | grüner zweibeiniger Dinosaurier | fremdes Tier, kein Tentakelgift | fremd |
| pa_112 | Düsenrucksack | rücken | blau geflügeltes Flugwesen | fremdes Tier; bytegleich mit pa_114 (W06) | fremd |
| pa_114 | Gleitschirm | rücken | blau geflügeltes Flugwesen | kein Schirm; bytegleich mit pa_112 (W06) | fremd |
| pa_115 | Wächterstatue | beschwörung | Giraffenstatue | motivnah, keine Bewegung | statisch |
| pa_118 | Feuerwesen | beschwörung | grauer Humanoid mit Feuerball | Körper/Material weicht ab, Flamme eingebrannt | identitaet |
| pa_121 | Raketenfaust | hand | Clownfaust mit Raketenantrieb | motivnah, Frames fast identisch, Achse prüfen | statisch |
| pa_122 | Endlosschleife | selbst | rosa geflügeltes Wesen, F7 Unendlichkeitszeichen | fremdes Tier, harter Motivsprung | fremd |
| pa_132 | Alte Dame | beschwörung | Alte Dame (F0), danach geflügeltes Wesen | Identitätsbruch ab Frame 3 | identitaet |
| pa_133 | Fliegendes Superschaf | flug | geflügeltes Schaf mit Cape | motivnah, Flügelkontinuität prüfen | nah |
| pa_134 | Luftangriff | flug | brauner Flugkörper mit Flamme | generisch, Flamme eingebrannt, keine Luftangriffsszene | identitaet |
| pa_135 | Meteorregen | flug | Meteor mit Feuerschweif | Schweif eingebrannt, Gestalt wechselt | statisch |
| pa_136 | Bohrkopfrakete | flug | Bohrkopfrakete mit Flamme/Rauch | Schweif eingebrannt, Frames springen | statisch |
| pa_141 | Astralkrieger | beschwörung | einfacher blauer Humanoid | fremder Humanoid statt Krieger | fremd |
| pa_142 | Leerenritter | beschwörung | blauer Cartoon-Zauberer | fremder Humanoid statt Leerenritter | fremd |
| pa_143 | Astralross | beschwörung | ausgewaschenes gepanzertes Pferd | Kontrastverlust, statisch, weiße Reste | identitaet |
| pa_144 | Kosmische Wassermelone | flug | geflügeltes Vogelwesen mit Melonenkopf | fremdes Tier, keine Wassermelone | fremd |
| pa_147 | Weltendrache | beschwörung | rosa geflügeltes Schwein | fremdes Tier statt Weltendrache | fremd |
| pa_148 | Feuerschild | selbst | blaues geflügeltes Tier | fremdes Tier, kein Schild | fremd |

Verteilung: 12 fremd, 4 identitaet, 8 statisch, 2 nah. Rollen: 9 flug, 8
beschwörung, 3 rücken, 2 welt, 2 selbst, 1 wurf, 1 hand.

Der Unterschied zur bisherigen Kurzliste im Bericht: auch pa_053 (Roboterbombe →
Mäusewagen) und pa_121 (Achse), pa_143 (Kontrast), pa_118 (Körperform) sind neu
erfasst; pa_115, pa_133 und pa_048 sind motivnah und damit die realistischen
Kandidaten für eine Abnahme ohne Neuerzeugung.

## W06 – pa_112 und pa_114 sind bytegleich

| | pa_112 | pa_114 |
| --- | --- | --- |
| SHA-256 | `51215e68c3147220838c664c3fd53127956f295214c5532c152fe2e29081316c` | identisch |
| Größe | 67.530 Byte | 67.530 Byte |
| Sicht | blau geflügeltes Flugwesen, 8 Frames | dasselbe Bild |
| Soll | Düsenrucksack (Rückenobjekt, Düsen unten) | Gleitschirm (Kappe, Leinen, Aufhängung) |

Bestätigt: Es ist dieselbe Datei, nicht nur ein ähnliches Motiv. Im Manifest ist
pa_114 als `dubletteVon: "pa_112"` markiert, beide bleiben gesperrt.

**Getrennte Vorlagen bleiben offen (bewusst nicht umbenannt, nicht gelöscht).**
Ein Umbenennen würde zwei Düsenrucksäcke erzeugen und den Gleitschirm weiter
verschwinden lassen. Nötig sind zwei eigene Blätter mit unterschiedlicher
Silhouette und Rolle:

1. Düsenrucksack: Rückenansicht, zwei Düsen unten, Flamme *nicht* eingebrannt.
2. Gleitschirm: Kappe über dem Träger, Leinen sichtbar, Startpose ohne Flugzustand.

Der Test hält den Zustand fest, ohne ihn zu zementieren: Solange die Hashes
gleich sind, muss `dubletteVon` gesetzt sein; sobald sie sich unterscheiden, muss
die Markierung entfernt werden. Ein stiller Fix an nur einer Datei fällt damit auf.

## W11 – Rollen, Lader, Abnahme (definiert, nicht aktiviert)

### Rollen

`src/client/waffenAnim.js` definiert sieben Rollen. Jede Rolle legt fest, welche
Anker überhaupt sinnvoll sind; eine Waffe mit falscher Rolle wird nicht abgenommen,
auch wenn die Zahlenwerte stimmen.

| Rolle | Bedeutung | Anker |
| --- | --- | --- |
| flug | Geschoss/Rakete/Granate/Meteor im Flug | flugStart, flugEnde |
| wurf | geworfenes Objekt mit eigener Drehachse | wurfHand, wurfDrehpunkt |
| rücken | Rucksack/Schirm am Spieler | rückenMitte |
| hand | gehaltene Waffe | grip, muzzle |
| selbst | Aura/Schild/Tempo am Träger | trägerMitte |
| welt | abgelegtes/aufgestelltes Objekt | bodenMitte |
| beschwörung | Wächter/Kreatur mit eigenen Aktionen | figurFuß |

### Lader

`erzeugeAnimLader({ ladeManifest, freigabe })` lädt ein Blatt nur, wenn **alle
drei** Bedingungen gelten:

1. `freigabe === true` und `abnahme === "abgenommen"` im Manifesteintrag,
2. die ID steht in `ANIM_FREIGABE`,
3. ein Lader ist verdrahtet (`ladeManifest`).

Fehlt eine davon, liefert `hole()` `null`, und `ladeManifest` wird **nicht
aufgerufen** — das Manifest ist also kein Nebenpfad ins Bundle. Der
Produkt-Einstiegspunkt `holeZusatzAnim(id)` ist gesperrt und liefert immer `null`;
der Renderer zeichnet weiter Atlas-Zelle plus prozedurale Bewegung.

Nicht aktiviert: Es gibt keinen Aufruf im Renderer, keinen Import der WebP-Dateien,
keinen Manifest-Import. `ANIM_FREIGABE` ist leer, `status` ist `gesperrt`,
`freigabe.produktpfad` ist `false`.

### Abnahmekriterien je Blatt

Ein Blatt wird nur freigegeben, wenn alle Punkte belegt sind:

1. **Identität:** Motiv ist die Waffe, kein fremdes Tier/Humanoid; keine
   Identitätsbrüche zwischen Frames (pa_132, pa_122).
2. **Rolle:** Rolle gesetzt, Anker passen zur Rolle (kein Mündungsanker an einem
   Rucksack).
3. **Bewegung:** mindestens 6 unterscheidbare Frames, Schleife schließt, keine
   Form-/Materialwechsel; Ruhebild ist keine Schusspose.
4. **Effekte:** eingebrannte Flamme/Blitz/Schweif getrennt oder als Ruhebild
   begründet (W17).
5. **Browser (W20):** kleine Darstellung, helle/dunkle Kulisse, Zielen links/rechts,
   Rückstoß, Treffer.

Aktivierung ist ein bewusster Dreischritt (Manifest, `ANIM_FREIGABE`, Renderer-
Verdrahtung) plus Anpassung des Gate-Tests. Wer nur eine Stelle ändert, bekommt
einen roten Test statt eines stillen Dauerfeuers.

## W17 – Eingebrannte Effekte aus Ruhebildern trennen

Datenstand: `src/client/assets/weapon-sprites/effekt-trennung.json`
(Auftrag W17). Es wurde nichts neu gezeichnet und nichts geladen; die Datei
beschreibt nur, welcher Ruhezustand einen aktiven Effekt enthält und welche Ebene
später abgetrennt werden muss.

### Handbilder (Ruhebild im Atlas, 15 Stück)

| ID | Waffe | Effekt | Beobachtung |
| --- | --- | --- | --- |
| pa_002 | Feuerfaust | Flamme | Faust von Flammen umschlossen |
| pa_022 | Plasmawerfer | Mündungsblitz | heller Blitz am Laufende |
| pa_026 | Pressluftbohrer | Späne | Metallspäne an der Bohrspitze (Kontakt, kein Schuss) |
| pa_027 | Fackel | Flamme | große Flamme plus Rauch |
| pa_036 | Raketenhandschuh | Flamme | Rakete bereits abgefeuert gezeichnet |
| pa_037 | Raketenwerfer | Mündungsflamme | Rakete mit Flamme im Rohr |
| pa_038 | Rakete | Triebwerksflamme | Abgasflamme am Heck |
| pa_045 | Raketensalve | Flamme | drei Raketen mit Abgasflammen |
| pa_052 | Molotowcocktail | Flamme | brennende Lunte als Dauerzustand |
| pa_061 | Feuerdämon | Flamme | Flammen an Händen und Körper |
| pa_062 | Flammenwerfer | Feuerstrahl | Strahl aus der Düse |
| pa_118 | Feuerwesen | Flamme | Feuerball in der Hand |
| pa_136 | Bohrkopfrakete | Rauchfahne | Rauch-/Feuerfahne am Heck |
| pa_137 | Flammenklinge | Flamme | Flamme entlang der Klinge |
| pa_139 | Höllenkanone | Glut | Glut/Mündungsfeuer im Lauf |

### Animationsblätter mit eingebranntem Effekt (8 Stück)

pa_038, pa_044, pa_061, pa_065, pa_118, pa_134, pa_135, pa_136 — jeweils Flamme
oder Schweif im Blatt. Diese Blätter sind doppelt betroffen: falsche Ruhepose und
Effekt im Animationsbild.

### Grenzfälle (dokumentiert, nicht im Auftrag)

pa_044 (Flammenflügel sind Identität), pa_072 (Feuerball als Gesamtmotiv),
pa_129 (Funkenbogen am Turm), pa_140 (Glühen am Lauf, kein Strahl),
pa_148 (Glut um den Schild).

### Warum das zählt

Ein Ruhebild mit eingebranntem Strahl erzeugt Dauerfeuer und eine falsche
Ruhepose. Zusätzlich kollidiert es mit dem prozeduralen Mündungsblitz aus
`waffenAnimation.js`: zwei Blitze übereinander. Die Trennung braucht je Asset
zwei Ebenen (Körper, Effekt) und einen Anker für den Effektursprung; sie ist
ohne Neuerzeugung nicht erledigt, weil die Pixel im Atlas bereits verbrannt sind.
Der Datenstand verhindert, dass die Liste bei der nächsten Sichtung neu geraten
werden muss, und der Gate-Test verlangt für jeden Eintrag `trennung: "offen"`.

## Prüfung

```
node tests/waffen-anim-gating.test.js     # 8/8 ok
npx eslint src/client/waffenAnim.js tests/waffen-anim-gating.test.js   # sauber
```

Gegenprobe: eine Testdatei mit einem Pfad auf `anim/manifest.json` im Produktbaum
lässt Test 1 fehlschlagen (danach wieder entfernt). Die Sperre ist also wirksam,
nicht nur dokumentiert.

## Offen

- W05: 12 Blätter mit fremdem Motiv brauchen neue Vorlagen (nicht Teil dieses
  Auftrags). Motivnahe Kandidaten für eine Abnahme ohne Neuerzeugung: pa_048,
  pa_115, pa_121, pa_133.
- W06: getrennte Vorlagen für Düsenrucksack und Gleitschirm; bis dahin bleibt
  `dubletteVon` gesetzt.
- W11: Renderer-Verdrahtung, sobald das erste Blatt abgenommen ist.
- W17: Trennung von Körper und Effekt je Asset; der Datenstand ist die Liste.
- W20: Browserabnahme steht weiterhin aus.
