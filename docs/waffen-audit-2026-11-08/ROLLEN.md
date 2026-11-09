# Rollen aller 150 Waffen (BAL-11)

Stand: 09.11.2026, Branch `bg/bal-11`. Grundlage: Audit 2026-11-08, W07
(UI-, Hand-, Geschoss- und Weltobjektrolle trennen) und W09. Die Daten stehen
EINMAL in [`src/shared/config/waffen-rollen.js`](../../src/shared/config/waffen-rollen.js)
und werden von `scripts/waffen-rollen-eintragen.mjs` ins
[`manifest.json`](../../src/client/assets/weapon-sprites/manifest.json)
geschrieben. Tests: `tests/waffen-rollen.test.js`.

## Zwei Achsen statt eines Feldes

`delivery` allein beantwortet die Frage nicht, wie eine Waffe an der Figur
hängt. Deshalb sind Rolle und Wirkpfad getrennt:

| Achse | Werte | Frage |
|---|---|---|
| **Rolle** | Hand, Rücken, Aufstellobjekt, Beschwörung, Symbol | Wie hängt die Waffe an der Figur? |
| **Wirkpfad** | Projektil, Strahl, Selbst/Welt | Was verlässt die Figur beim Einsatz? |

Beispiele für die Trennung: Der Raketenrucksack ist **Rücken + Selbst** (er
versetzt den Träger, das Raketenbild ist Abgas), die Mine ist **Aufstellobjekt
+ Selbst** (sie bleibt liegen), der Feuerdämon ist **Beschwörung + Projektil**
(er fliegt selbst). Der Wachgeschütz-Turm ist **Aufstellobjekt + Selbst**; sein
Geschossbild gehört zum Turm, nicht zur Hand.

## Rollen

| Rolle | Bedeutung | Anzahl |
|---|---|---|
| Hand | Wird in der Hand geführt oder geworfen; das Handbild ist bei Wurfwaffen zugleich das Flugbild. | 109 |
| Rücken | Wird am Körper getragen (Rucksack, Düsenantrieb, Gleitschirm), nicht in der Faust. | 3 |
| Aufstellobjekt | Wird als Objekt in die Welt gesetzt und wirkt dort weiter (Mine, Geschütz, Bunker, Kiste, Statue, Boot, Portal, Baum, Netz). | 12 |
| Beschwörung | Ruft ein Wesen herbei, das selbst handelt (Astralkrieger, Astralross, Feuerdämon, Feuerwesen, Windkrieger). | 5 |
| Symbol | Zeichen oder Anwendungsobjekt am eigenen Träger (Elixier, Schriftrolle, Schild-Aura, Sanduhr, Werkzeug); kein gerichtetes Handgerät. | 21 |
| **Summe** | | **150** |

Wirkpfade: **87 Projektil**, **25 Strahl**,
**38 Selbst/Welt**.

## 96 Geschossbilder sind nicht 96 Projektilpfade

Der Sprite-Generator legt eine Geschosszelle an, sobald `delivery` gleich
`projectile` ist — das sind **96** Waffen. Wirklich ein
Geschoss mit Flugbahn starten aber nur **87**. Bei den
neun übrigen Waffen wirkt die Waffe zuerst auf den Anwender oder stellt etwas
auf; ihre Zelle ist Begleitmaterial und im Manifest als
`projectile.eigenerPfad: false`, `verwendung: "begleitbild"` markiert:

- `pa_032` Raketenrucksack — Rücken, Selbst/Welt
- `pa_076` Portalring — Aufstellobjekt, Selbst/Welt
- `pa_079` Kosmisches Portal — Aufstellobjekt, Selbst/Welt
- `pa_105` Frostrolle — Symbol, Selbst/Welt
- `pa_124` Wachgeschütz — Aufstellobjekt, Selbst/Welt
- `pa_141` Astralkrieger — Beschwörung, Selbst/Welt
- `pa_143` Astralross — Beschwörung, Selbst/Welt
- `pa_148` Feuerschild — Symbol, Selbst/Welt
- `pa_149` Goldene Reliktkugel — Symbol, Selbst/Welt

`zellenFuer()` in `src/client/waffenSprites.js` reicht nur bei
`eigenerPfad !== false` eine Geschosszelle als Projektil durch. Damit kann kein
Aufstell- oder Selbstobjekt versehentlich als Flugbahn gezeichnet werden.

## Spezialfälle aus der Abnahme

**Rucksack (`pa_032`, `pa_112`).** Beide liegen am Rücken. Der Raketenrucksack
versetzt den Träger nach vorn und hinterlässt eine Feuerspur; der Düsenrucksack
ist derselbe Antrieb in kürzerer Reichweite. Keiner verschießt ein Geschoss —
die Raketenzelle ist Abgas-/Flugbegleiter.

**Gleitschirm (`pa_114`).** Der Schirm liegt über dem Rücken und trägt den
Anwender am weitesten. Er wird nicht in der Faust geführt; die Rückenhalterung
im Renderer gilt für alle drei Trageobjekte.

**Statue (`pa_115`).** Die Wächterstatue wird aufgestellt und heilt den
Anwender. Sie ist kein Handgerät: Rolle Aufstellobjekt, Wirkpfad Selbst.

**Boot (`pa_131`).** Das Schlauchboot wird als Wasserfahrzeug eingesetzt und
versetzt den Anwender. Es wird nicht als Waffe geschwungen: Aufstellobjekt,
Wirkpfad Selbst.

**Mine (`pa_127`).** Sie wird vor die Füße gelegt oder weiter geworfen, bleibt
liegen und ist sofort scharf. Kein Projektilpfad, keine Handwaffe; die Wirkung
kommt aus dem Bodenobjektsystem. Nicht mit der Impulsbombe `pa_030` verwechseln,
die sehr wohl ein Geschoss startet.

**Beschwörung (`pa_141`, `pa_143`, `pa_061`, `pa_118`, `pa_086`).** Astralkrieger
und Astralross erscheinen als Wesen und handeln selbst (Wächter bzw. Reittier).
Feuerdämon und Feuerwesen sind Kämpferwesen; der Dämon fliegt dabei selbst als
Projektil. Der Windkrieger zieht Gegner im Wirbel heran. Alle fünf tragen kein
Handbild.

## Vollständige Tabelle

| ID | Name | Kategorie | Rolle | Wirkpfad | Hinweis |
|---|---|---|---|---|---|
| pa_001 | Baseballschläger | melee | Hand | Projektil |  |
| pa_002 | Feuerfaust | melee | Hand | Projektil |  |
| pa_003 | Hakenklinge | melee | Hand | Projektil |  |
| pa_004 | Piratenhaken | melee | Hand | Projektil |  |
| pa_005 | Morgenstern | melee | Hand | Projektil |  |
| pa_006 | Schaufel | melee | Hand | Projektil |  |
| pa_007 | Tonfa | melee | Hand | Projektil |  |
| pa_008 | Kriegshammer | melee | Hand | Projektil |  |
| pa_009 | Eispickel | melee | Hand | Projektil |  |
| pa_010 | Kettensäge | melee | Hand | Projektil |  |
| pa_011 | Zwillingskatanas | melee | Hand | Projektil |  |
| pa_012 | Katana | melee | Hand | Projektil |  |
| pa_013 | Mehrzweckmesser | melee | Hand | Projektil |  |
| pa_014 | Taschenmesser | melee | Hand | Projektil |  |
| pa_015 | Runenschwert | melee | Hand | Projektil |  |
| pa_016 | Rapier | melee | Hand | Projektil |  |
| pa_017 | Kampfmesser | melee | Hand | Projektil |  |
| pa_018 | Energieschwert | melee | Hand | Projektil |  |
| pa_019 | Doppelaxt | melee | Hand | Projektil |  |
| pa_020 | Kriegssense | melee | Hand | Projektil |  |
| pa_021 | Krummsäbel | melee | Hand | Projektil |  |
| pa_022 | Plasmawerfer | ranged | Hand | Projektil |  |
| pa_023 | Boxhandschuhe | ranged | Hand | Projektil |  |
| pa_024 | Mittelfinger | ranged | Hand | Projektil |  |
| pa_025 | Handtuch | ranged | Hand | Projektil |  |
| pa_026 | Pressluftbohrer | ranged | Hand | Projektil |  |
| pa_027 | Fackel | ranged | Hand | Projektil |  |
| pa_028 | Kaktusbombe | ranged | Hand | Projektil |  |
| pa_029 | Pömpel | ranged | Hand | Projektil |  |
| pa_030 | Impulsbombe | ranged | Hand | Projektil |  |
| pa_031 | Kraftfaust | ranged | Hand | Projektil |  |
| pa_032 | Raketenrucksack | ranged | Rücken | Selbst/Welt | Raketenrucksack: am Rücken getragen; der Raketenstoß versetzt den Träger. Das Bild ist kein abgefeuertes Geschoss. |
| pa_033 | Zauberstab | ranged | Hand | Projektil |  |
| pa_034 | Zauberbolzen | ranged | Hand | Projektil |  |
| pa_035 | Energieball | ranged | Hand | Projektil |  |
| pa_036 | Raketenhandschuh | ranged | Hand | Projektil |  |
| pa_037 | Raketenwerfer | ranged | Hand | Projektil |  |
| pa_038 | Rakete | ranged | Hand | Projektil |  |
| pa_039 | Feldmörser | ranged | Hand | Projektil |  |
| pa_040 | Maschinenpistole | ranged | Hand | Projektil |  |
| pa_041 | Salvengeber | heavy_ranged | Hand | Projektil |  |
| pa_042 | Feuerwerkssalve | heavy_ranged | Hand | Projektil |  |
| pa_043 | Kampfgeschütz | heavy_ranged | Hand | Projektil |  |
| pa_044 | Phönixschlag | heavy_ranged | Hand | Projektil |  |
| pa_045 | Raketensalve | heavy_ranged | Hand | Projektil |  |
| pa_046 | Splittergranate | heavy_ranged | Hand | Projektil |  |
| pa_047 | Handgranate | heavy_ranged | Hand | Projektil |  |
| pa_048 | Bananengranate | heavy_ranged | Hand | Projektil |  |
| pa_049 | Bumerang | heavy_ranged | Hand | Projektil |  |
| pa_050 | Doppelkopfaxt | heavy_ranged | Hand | Projektil |  |
| pa_051 | Wurfklingen | heavy_ranged | Hand | Projektil |  |
| pa_052 | Molotowcocktail | heavy_ranged | Hand | Projektil |  |
| pa_053 | Roboterbombe | heavy_ranged | Hand | Projektil |  |
| pa_054 | Schrotflinte | heavy_ranged | Hand | Projektil |  |
| pa_055 | Fernbüchse | heavy_ranged | Hand | Projektil |  |
| pa_056 | Präzisionsgewehr | heavy_ranged | Hand | Projektil |  |
| pa_057 | Revolver | heavy_ranged | Hand | Projektil |  |
| pa_058 | Kampfbogen | heavy_ranged | Hand | Projektil |  |
| pa_059 | Armbrust | heavy_ranged | Hand | Projektil |  |
| pa_060 | Gatlingkanone | heavy_ranged | Hand | Projektil |  |
| pa_061 | Feuerdämon | elemental | Beschwörung | Projektil | Feuerdämon: beschworenes Wesen; es fliegt selbst als Projektil (Rolle Beschwörung, Wirkpfad Projektil). |
| pa_062 | Flammenwerfer | elemental | Hand | Projektil |  |
| pa_063 | Wasserwerfer | elemental | Hand | Projektil |  |
| pa_064 | Katapult | elemental | Hand | Projektil |  |
| pa_065 | Meteorbrocken | elemental | Hand | Projektil |  |
| pa_066 | Haubitze | elemental | Hand | Projektil |  |
| pa_067 | Säurekanone | elemental | Hand | Projektil |  |
| pa_068 | Plasmagewehr | elemental | Hand | Projektil |  |
| pa_069 | Raketenkanone | elemental | Hand | Projektil |  |
| pa_070 | Giftwolke | elemental | Hand | Projektil |  |
| pa_071 | Eisschlag | elemental | Hand | Projektil |  |
| pa_072 | Feuerball | elemental | Hand | Projektil |  |
| pa_073 | Tentakelgift | elemental | Hand | Projektil |  |
| pa_074 | Verderbnissiegel | elemental | Hand | Projektil |  |
| pa_075 | Tornado | elemental | Hand | Projektil |  |
| pa_076 | Portalring | elemental | Aufstellobjekt | Selbst/Welt | Portalring: wird als Tor in der Welt aufgestellt; der Anwender springt hindurch. |
| pa_077 | Schwarzes Loch | elemental | Hand | Projektil |  |
| pa_078 | Voodoopuppe | elemental | Hand | Projektil |  |
| pa_079 | Kosmisches Portal | elemental | Aufstellobjekt | Selbst/Welt | Kosmisches Portal: aufgestelltes Tor, kein Handgerät. |
| pa_080 | Psionischer Tentakel | elemental | Hand | Projektil |  |
| pa_081 | Siegel der Leere | magic | Hand | Strahl |  |
| pa_082 | Goldener Münzstab | magic | Hand | Projektil |  |
| pa_083 | Goldene Hand | magic | Hand | Strahl |  |
| pa_084 | Glutelixier | magic | Symbol | Selbst/Welt |  |
| pa_085 | Feuermagier | magic | Symbol | Selbst/Welt |  |
| pa_086 | Windkrieger | magic | Beschwörung | Strahl | Windkrieger: Krieger im Wirbelwind, zieht Gegner heran; kein Handbild. |
| pa_087 | Dimensionssprung | magic | Symbol | Selbst/Welt |  |
| pa_088 | Dimensionsriss | magic | Symbol | Selbst/Welt |  |
| pa_089 | Zauberstiefel | magic | Symbol | Selbst/Welt |  |
| pa_090 | Giftpilz | magic | Hand | Strahl |  |
| pa_091 | Astralkugel | magic | Hand | Strahl |  |
| pa_092 | Heilzauber | magic | Symbol | Selbst/Welt |  |
| pa_093 | Funkenschild | magic | Symbol | Selbst/Welt |  |
| pa_094 | Heilspritze | magic | Symbol | Selbst/Welt |  |
| pa_095 | Sturmelixier | magic | Symbol | Selbst/Welt |  |
| pa_096 | Mutationselixier | magic | Symbol | Selbst/Welt |  |
| pa_097 | Traumfänger | magic | Hand | Strahl |  |
| pa_098 | Lavaelixier | magic | Hand | Strahl |  |
| pa_099 | Frostsanduhr | magic | Symbol | Selbst/Welt |  |
| pa_100 | Blitzwürfel | magic | Symbol | Selbst/Welt |  |
| pa_101 | Eisschild | magic | Symbol | Selbst/Welt |  |
| pa_102 | Gedankensturm | magic | Hand | Strahl |  |
| pa_103 | Verderbniskelch | magic | Hand | Strahl |  |
| pa_104 | Quantengewehr | magic | Hand | Projektil |  |
| pa_105 | Frostrolle | magic | Symbol | Selbst/Welt | Frostrolle: Schriftrolle (Symbol) für einen zufälligen Schutzzauberspruch; das Zauberbild ist kein abgefeuertes Geschoss. |
| pa_106 | Sonnenamulett | magic | Hand | Strahl |  |
| pa_107 | Allsehendes Auge | magic | Symbol | Selbst/Welt |  |
| pa_108 | Zauberpeitsche | magic | Hand | Strahl |  |
| pa_109 | Giftbaum | magic | Aufstellobjekt | Selbst/Welt | Giftbaum: wird als Baum in der Welt aufgestellt (Verstärkung), kein Handbild. |
| pa_110 | Dimensionskugel | magic | Symbol | Selbst/Welt |  |
| pa_111 | Enterhaken | utility | Symbol | Selbst/Welt |  |
| pa_112 | Düsenrucksack | utility | Rücken | Selbst/Welt | Düsenrucksack: Rückenantrieb, kein Handgerät. |
| pa_113 | Bohrkanone | utility | Hand | Strahl |  |
| pa_114 | Gleitschirm | utility | Rücken | Selbst/Welt | Gleitschirm: liegt über dem Rücken; wird nicht in der Faust geführt. |
| pa_115 | Wächterstatue | utility | Aufstellobjekt | Selbst/Welt | Wächterstatue: wird aufgestellt und heilt den Anwender; kein Handgerät. |
| pa_116 | Blutritual | utility | Symbol | Selbst/Welt |  |
| pa_117 | Ananasbombe | utility | Hand | Strahl |  |
| pa_118 | Feuerwesen | utility | Beschwörung | Strahl | Feuerwesen: erscheint als Kämpfer und entzündet das Ziel; kein Handbild. |
| pa_119 | Munitionskiste | utility | Aufstellobjekt | Selbst/Welt | Munitionskiste: wird abgestellt und füllt Munition auf. |
| pa_120 | Energiefaust | utility | Hand | Strahl |  |
| pa_121 | Raketenfaust | tech | Hand | Strahl |  |
| pa_122 | Endlosschleife | tech | Symbol | Selbst/Welt |  |
| pa_123 | Magnetkanone | tech | Hand | Strahl |  |
| pa_124 | Wachgeschütz | tech | Aufstellobjekt | Selbst/Welt | Wachgeschütz: wird aufgestellt und feuert selbst; das Geschossbild gehört zum Turm, nicht zur Hand. |
| pa_125 | Nachschubkiste | tech | Aufstellobjekt | Selbst/Welt | Nachschubkiste: Abwurf, wird in der Welt abgesetzt. |
| pa_126 | Bunker | tech | Aufstellobjekt | Selbst/Welt | Bunker: wird aufgestellt und mindert Schaden. |
| pa_127 | Mine | tech | Aufstellobjekt | Selbst/Welt | Mine: wird abgelegt oder geworfen, bleibt liegen und ist sofort scharf; kein Projektilpfad. |
| pa_128 | Hologrammportal | tech | Aufstellobjekt | Selbst/Welt | Hologrammportal: aufgestelltes Tor; der Anwender springt hindurch. |
| pa_129 | Tesla-Turm | tech | Hand | Strahl |  |
| pa_130 | Tarnnetz | tech | Aufstellobjekt | Selbst/Welt | Tarnnetz: wird über die Stellung gelegt und mindert Schaden. |
| pa_131 | Schlauchboot | tech | Aufstellobjekt | Selbst/Welt | Schlauchboot: wird als Wasserfahrzeug eingesetzt, nicht gehalten. |
| pa_132 | Alte Dame | tech | Hand | Strahl |  |
| pa_133 | Fliegendes Superschaf | tech | Hand | Projektil |  |
| pa_134 | Luftangriff | tech | Hand | Strahl |  |
| pa_135 | Meteorregen | tech | Hand | Strahl |  |
| pa_136 | Bohrkopfrakete | tech | Hand | Strahl |  |
| pa_137 | Flammenklinge | tech | Hand | Strahl |  |
| pa_138 | Arkanhammer | tech | Hand | Strahl |  |
| pa_139 | Höllenkanone | tech | Hand | Strahl |  |
| pa_140 | Quantenkanone | tech | Hand | Projektil |  |
| pa_141 | Astralkrieger | ultimate | Beschwörung | Selbst/Welt | Astralkrieger: beschworener Wächter, feuert in den Folgerunden selbst. |
| pa_142 | Leerenritter | ultimate | Hand | Projektil |  |
| pa_143 | Astralross | ultimate | Beschwörung | Selbst/Welt | Astralross: beschworenes Reittier, trägt den Anwender. |
| pa_144 | Kosmische Wassermelone | ultimate | Hand | Projektil |  |
| pa_145 | Erdspalter | ultimate | Hand | Projektil |  |
| pa_146 | Giftige Weltenflasche | ultimate | Hand | Projektil |  |
| pa_147 | Weltendrache | ultimate | Hand | Projektil |  |
| pa_148 | Feuerschild | ultimate | Symbol | Selbst/Welt | Feuerschild: Aura um den Anwender, kein aufgestelltes Objekt und kein Geschoss. |
| pa_149 | Goldene Reliktkugel | ultimate | Symbol | Selbst/Welt | Goldene Reliktkugel: Relikt wirkt auf den Anwender; kein abgefeuertes Geschoss. |
| pa_150 | Kosmischer Kern | ultimate | Hand | Projektil |  |
