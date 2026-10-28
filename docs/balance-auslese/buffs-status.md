# Balance-Auslese: Buffs, Statuseffekte, Mali und Zauberwirkungen (2026-10-28)

Stand: Arbeitsstand von `main` (nach Commit 718e64a), Katalog `src/shared/config/weapons.js` (150 Waffen, Fassung 5). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Zu den 30 Magiewaffen siehe `docs/balance-auslese/magic.md` und `magic.csv`.

Gelesen wurden: `src/engine/specials.js` (Wirkungsarten, `StatusStore`), `src/engine/schadenMali.js` und `src/shared/config/schaden.js` (Mali, Fassung 2), `src/shared/config/feuer.js` und `src/engine/systems/feuerSystem.js` (Kopf und Konfiguration), `src/shared/config/wirkungstexte.js` (Texte), `src/engine/shooting.js` (`applySelfEffect`), `src/engine/match.js` (`#applyTargetEffect`, `#beginTurn`, `#resolveHitscan`), `src/engine/guentherRad.js`, `src/engine/systems/maelstromSystem.js`, `src/client/hud.js` (Marken). Zusätzlich liefen kleine Rechnungen am `StatusStore` (Dauer von Verstärkung und Rüstung) und über den Katalog (Auslöser-Waffen je Wirkungsart).

## 0. Kurzbefund

- **Es gibt 16 Wirkungsarten** (`EFFECT_KIND`), **7 Mali** (Fassung 2), eine Betäubung mit Schutzzug, eine Verlangsamung und einige Umweltwirkungen. Alle 16 Wirkungsarten haben einen deutschen Namen und Text (`tests/wirkungstexte.test.js` hält die Vollständigkeit). 85 von 150 Waffen haben kein `special` in `SPECIAL_EFFECTS`; 10 davon bekommen trotzdem eine Wirkung aus dem Elementarwert (`elementalEffectFor`, darunter Sonnenamulett).
- **Verstärkung (`damage_boost`) wirkt nur einen eigenen Zug.** Die Dauer 2 ist im Aufruf `addBoost(.., 2)` fest eingetragen; am `StatusStore` nachgerechnet: im ersten eigenen Zug nach dem Wurf ×1,5, im zweiten wieder ×1. Der Text "für einige Züge" (Wirkungstext, Zustandsmarke) stimmt damit nicht.
- **Rüstung (`armor`) läuft nie ab.** `advanceTurn` berührt sie nicht, kein anderer Code setzt sie zurück (außer dem Ausscheiden der Figur). Der Text sagt "für einige Züge". Auslöser: Bunker, Tarnnetz, und jede der vier Zufallswaffen mit Pool-Treffer (1 von 6).
- **Aufdecken (`reveal`) hat keine Wirkung:** `isRevealed` wird im Spielcode von niemandem gelesen; der Client schreibt nur eine Protokollzeile (Allsehendes Auge).
- **`freeze`-Waffen mit Schadensart Eis bremsen nur** (Frost: Tempo 70 %), sie lassen den Zug des Ziels nicht ausfallen (`schadenMali.treffer`: bei `art === 'ice'` Frost, sonst Betäubung). Der Wirkungstext "Der getroffene Gegner setzt aus" gilt für Eispickel und Eisschlag nur im zweiten Treffer oder bei Nässe.
- **Fehlende Marken im HUD:** Rüstung, Verlangsamung (Günthers Haufen), Aufgedeckt und der Betäubungsschutz haben keine Marke (`hud.js` zeigt Schild, "Eingefroren", Schaden über Zeit, Mali, Verstärkung). Die Betäubung durch Traumfänger (Schlaf) oder Kriegshammer erscheint als "Eingefroren" mit Schneeflocke.
- **Heilung ist das einzige Gegenmittel:** große Heilung (Rohwert ≥ 20) entfernt Brand, Säure und einen Gift-Stapel, ab 40 auch Fluch und alles Gift; das geschieht auch bei vollem Leben. Heilzauber (42) und Heilspritze (47) sind damit zugleich die wirksamsten Gegenmittel der Magie.
- **Zahlen aus den Daten, die der Motor nicht liest:** `effectMagnitude` (Dimensionssprung 72, Dimensionsriss 165, Gleitschirm 150, Raketenrucksack 64) und `knockback`/Radius/`aoe` bei Strahlwaffen.

## 1. Wirkungsarten der Waffen (16, `EFFECT_KIND`)

Dauer in eigenen Zügen. "Schadensfassung" meint `config.schaden`: 2 (Standard) rechnet Mali, 1 das alte Verhalten. Zahlen aus `SPECIAL_DEFAULTS`, wo nichts anderes steht.

| Wirkung | Auslöser-Waffen | Dauer | Stärke | Stapelverhalten | Gegenmittel | Beschreibung | Name |
|---|---|---|---|---|---|---|---|
| `heal` Heilung | Heilzauber, Heilspritze (magic); Wächterstatue, Blutritual (utility) | sofort | max(35, 1,2 × Schaden): 42, 47, 35, 60; nur bis zum fehlenden Leben | nicht stapelbar (sofort) | Gift (-25 % je Stapel) und Fluch (-50 %, nie unter 25 %) mindern sie | vorhanden, stimmig ("nie über das Maximum"); Nebenwirkung Entgiftung steht nicht darin | "Heilung" stimmig |
| `shield` Schild | Engelssegen, Eisschild (magic); Himmelswächter (ultimate) | bis verbraucht, kein Ablauf | max(40, 1,1 × Schaden): 40, 40, 77 | addiert, Obergrenze 120 | Schadensart Energie (Schild fängt nur die Hälfte) | vorhanden, stimmig | "Schild" stimmig |
| `damage_boost` Verstärkung | Astraltrank, Chaoselixier, Sanduhr, Weltenbaum (magic); Goldene Reliktkugel (ultimate); Pool der Zufallswaffen | **1 eigener Zug** (Aufruf `addBoost(.., 2)`; nachgerechnet) | ×1,5 auf alle eigenen Treffer (Geschoss, Strahl, Kettenblitz) | kein Stapeln (größter Wert, längste Dauer) | Fluch (-15 % eigener Schaden, multipliziert) | vorhanden, **unstimmig** ("einige Züge") | "Verstärkung" stimmig |
| `armor` Rüstung | Bunker, Tarnnetz (tech); Pool der Zufallswaffen | **unbegrenzt** (nachgerechnet) | -30 % erlittener Schaden | größter Wert gilt, Obergrenze 0,8 | Säure (-25 Prozentpunkte); Magie, Gift, Säure, Fluch-Arten durchdringen die Hälfte | vorhanden, **unstimmig** ("einige Züge") | "Rüstung" stimmig |
| `freeze` Einfrieren/Betäuben | Kriegshammer (`stun`), Eispickel, Eisschlag (`freeze`), Traumfänger (`sleep`) | Fassung 2: Betäubung 1 Zug, dann 1 Zug Schutz; Eis: Frost 2 Züge. Fassung 1: 1 + Elementarwert/40, höchstens 5 | Zug des Ziels entfällt (Betäubung) bzw. Tempo 70 % (Frost) | Betäubung trifft nie zwei Züge hintereinander (Schutz); Fassung 1 verlängert | Schutzzug; Feuer (taut Frost) | vorhanden, **unstimmig für Eis** | "Einfrieren und Betäuben" stimmig; HUD-Marke "Eingefroren" für Schlaf und Hammer unstimmig |
| `damage_over_time` Schaden über Zeit | 12 mit `special` (u. a. Zauberbuch, Giftpilz, Lavaelixier, Verderbniskelch) und 10 aus dem Elementarwert (darunter Sonnenamulett) | Brand 3, Gift 3, Fluch 2 Züge | Tick = max(8, Elementarwert/2) × Faktor (Brand 0,8, Gift 1, Fluch 0,7), Obergrenze 16/18/10 | Brand und Fluch 1 Eintrag, Gift 2 Stapel; höchstens 3 Mali, Summe ≤ 20 % des Maximallebens je Zugbeginn; Fassung 1 unbegrenzt | siehe Abschnitt 2 | vorhanden, stimmig | "Schaden über Zeit" stimmig |
| `ammo` Nachschub | Munitionskiste (utility); Endlosschleife, Nachschubkiste (tech) | sofort | +3 Ladungen auf die erste Waffe im Inventar mit Platz | – | – | vorhanden, stimmig | "Nachschub" stimmig |
| `move` Versetzen | 13 Waffen, in magic Dimensionssprung, Dimensionsriss, Zauberstiefel, Dimensionskugel | sofort | 60 px, zuerst nach rechts, sonst links; Zielwinkel ohne Einfluss | – | – | vorhanden, stimmig (kein Wort zur Richtung) | "Versetzen" stimmig |
| `reveal` Aufdecken | Allsehendes Auge (magic) | 2 Züge | keine Wirkung im Spiel (Leser fehlt) | verlängert auf die längere Dauer | – | vorhanden, formal stimmig, **folgenlos** | "Aufdecken" stimmig; Waffenbeschreibung "Späht das Feld aus" widerspricht (der Schütze wird aufgedeckt) |
| `pull` Heranziehen | Hakenklinge, Piratenhaken (melee); Tornado, Schwarzes Loch, Psionischer Tentakel (elemental); Windkrieger (magic); Magnetkanone (tech); Leerenritter (ultimate) | sofort | Ziel 90 px zum Schützen, nur wenn es sich bewegt | – | Wand dazwischen (Wirkung entfällt) | vorhanden, stimmig; Windkrieger-Text ("im Umkreis") unstimmig | "Heranziehen" stimmig |
| `turret` Geschütz | Wachgeschütz (tech), Astralkrieger (ultimate) | 3 Runden | 0,6 (Krieger 0,5) × Waffenschaden, Reichweite 0,75 × `maxRange` | nicht geprüft | nicht geprüft | vorhanden, stimmig | "Geschütz" stimmig |
| `water_push` Wasserschub | Wasserwerfer (elemental) | sofort | Ziel 120 px weg, Wasserstand +0,4 bis +0,6 | Wasserstand wird aufgesetzt | – | vorhanden, stimmig | stimmig |
| `random` Zufallswirkung | Chaosmagier, Mutationselixier, Würfel des Chaos, Spruchrolle (magic) | je nach Auswurf | gleichverteilt aus heal, shield, damage_boost, armor, ammo, move (Zufall aus dem Match-RNG) | – | – | vorhanden, stimmig ("Selbstwirkung") | stimmig |
| `chain` Kettenblitz | Tesla-Turm (tech) | sofort | 2 Sprünge, 240 px, Rest 0,6 je Sprung | – | – | vorhanden, stimmig | stimmig |
| `mount` Reittier | Astralross (ultimate) | sofort | 140 px (Sprung) | – | – | vorhanden, stimmig | stimmig |
| `drill` Bohrstrahl | Bohrkanone (utility) | sofort | Tunnelradius 14, 12 Schritte, Mundloch 30 | – | – | vorhanden, stimmig | stimmig |

Hinweis zu den Auslösern: Die Zuordnung steht in `SPECIAL_EFFECTS`; Abgeleitete Brandwirkungen ohne Eintrag dort (Kaktusbombe, Phönixschlag, Feuerdämon, Flammenwerfer, Feuerball, Sonnenamulett, Feuerwesen, Fliegendes Superschaf, Höllenkanone, Weltendrache) zählen zu `damage_over_time`. Außerhalb von magic wurden die Wirkungen nur gelesen, nicht beurteilt.

## 2. Mali (Fassung 2, `MALUS` in `config/schaden.js`)

Dauer zählt in eigenen Zugbeginnen des Betroffenen; Schaden über Zeit fällt zu Beginn des Zuges an. Allgemein: höchstens 3 Mali gleichzeitig (ohne Nass; ein vierter ersetzt den mit der kürzesten Restdauer oder wird abgewehrt), Dauer höchstens 5, Schaden über Zeit insgesamt höchstens 20 % des Maximallebens je Zugbeginn.

| Malus | Auslöser (Schadensart oder Wirkung) | Auslöser-Waffen | Dauer | Stärke | Stapelverhalten | Gegenmittel | Beschreibung | Name |
|---|---|---|---|---|---|---|---|---|
| Brand (`brand`) | Art Feuer, Drachenfeuer; Elementar-Feuerwirkung | 13 (u. a. Lavaelixier, Feuerfaust, Feuerwesen, Weltendrache) | 3 (+1 Biom `forest`, -1 auf Eisboden; Artillerist -1) | Tick 0,8 × Waffenwert, höchstens 16 | 1 Eintrag (höchster Wert, längste Dauer) | Nässe/Wasser am Standort, Frost- und Nass-Treffer, Heilung ≥ 20 | `MALUS_TEXT.brand` stimmig | "Brand" stimmig |
| Gift (`gift`) | Art Gift; Elementar-Gift; Günthers Haufen | Giftpilz, Giftwolke, Tentakelgift, Giftige Weltenflasche | 3 (Brawler -1) | Tick = Waffenwert, höchstens 18; Rüstung wirkt zur Hälfte | bis 2 Stapel; jeder mindert Heilung um 25 % | Heilung ≥ 20 (ein Stapel), ≥ 40 (alle); Scout nimmt 15 % weniger | `MALUS_TEXT.gift` stimmig | "Gift" stimmig |
| Fluch (`fluch`) | Arten Dunkel, Leere, Chaos | Zauberbuch der Leere, Verderbniskelch (magic); Verderbnissiegel, Schwarzes Loch, Voodoopuppe, Leerenritter, Kosmischer Kern u. a. | 2 (Okkultist -1) | Tick 0,7 × Waffenwert, höchstens 10; Heilung halbiert (nie unter 25 %); eigener Schaden -15 % | 1 Eintrag | Heilung ≥ 40 | `MALUS_TEXT.fluch` stimmig | "Fluch" stimmig |
| Säure (`saeure`) | Art Säure | Säurekanone | 2 (Brawler -1) | Rüstung -25 Prozentpunkte | 1 | Heilung ≥ 20 | stimmig | "Säure" stimmig |
| Frost (`frost`) | Art Eis | Eispickel, Eisschlag (Eisschild ist eine Selbstwirkung und löst ihn nie aus) | 2 (+1 auf Eisboden und im Biom `alpine`) | Tempo 70 % | 1; zweiter Treffer oder Nässe betäubt | Feuer taut (Brand-Treffer entfernt Frost) | stimmig | "Frost" stimmig |
| Schock (`schock`) | Art Elektrisch | Impulsbombe, Wachgeschütz, Tesla-Turm | 1 | Tempo 50 %; bei Nässe Betäubung und Leitung (40 % Schaden, 140 px) auf nasse Gegner | 1 | Gummiboden wehrt ab | stimmig | "Schock" stimmig |
| Nass (`nass`) | Art Wasser; Wasserstand ab 0,35 | Wasserwerfer | 2 | löscht Brand, verstärkt Frost und Schock | 1 (zählt nicht zum Limit) | – | stimmig | "Nass" stimmig |
| Betäubung (Aussetzen) | `stun`, `sleep` und `freeze` (nicht Eis), zweiter Frost-Treffer, Frost/Schock bei Nässe | Kriegshammer, Traumfänger | 1 Zug aussetzen, danach 1 Zug Schutz | der Zug des Ziels entfällt | Schutz verhindert eine zweite Betäubung im folgenden Zug | Schutzzug | in `WIRKUNG_TEXT.freeze` und `MALUS_TEXT`; der Schutz hat keinen Text | HUD-Marke "Eingefroren" unstimmig für Schlaf |

Die Gegenmittel liegen in `schadenMali.heilung` und `wende`. Dass Heilung Brand und Säure löscht, auch wenn die Figur schon volles Leben hat, folgt aus `applySelfEffect` (die Prüfung `heilung()` läuft vor der Begrenzung auf das fehlende Leben).

## 3. Weitere Zustände und Schadensart-Regeln

| Eintrag | Auslöser | Dauer | Stärke | Stapel | Gegenmittel | Beschreibung | Name |
|---|---|---|---|---|---|---|---|
| Verlangsamung (`slow`) | Günthers Haufen | 3 Züge (`GUENTHER_POOP.turns`) | Faktor 0,55 auf Sprung und Bewegung (`slowFactor`), mit Frost/Schock gilt der kleinere | stärkster Faktor | – | keine Beschreibung, **keine Marke** im HUD | – |
| Gift aus Günthers Haufen | Haufen | 3 Züge | 4 je Zug (Günther-Fassung ab 3: 3), Schadensfassung 2: als Gift-Eintrag ohne Umrechnung (`roh`) | wie Gift | wie Gift | über Gift | – |
| Günthers Rad: Aussetzen | Glücksrad (Gassi, Füttern, Spielen) | 1 Zug | wie Betäubung, ohne Schutz | – | – | im Rad-Text | – |
| Flammen- und Lavazellen | `FeuerSystem` | pro Schritt | Flamme 3, Lava 9 je Schritt, dazu Brand 2 Züge à 3; Artillerist nimmt 0,6 | – | Wasser löscht; Nässe der Zelle 45 Schritte | `config/feuer.js` (Code-Kommentar), kein Spielertext | "Brand" |
| Toxischer Regen | Mahlstrom (ab Valhalla) | je Zug außerhalb der Zone | 15 % des Maximallebens | – | zurück in die Zone | nicht geprüft | – |
| Schadensart Energie | Waffen mit Art `energy` | – | Schild fängt nur die Hälfte | – | – | `ART_TEXT.energy` stimmig | – |
| Schadensarten Arkan, Astral, Psi, Raum, Zeit | Waffen dieser Arten | – | durchdringen die Hälfte der Rüstung (Fluch-Arten ebenso) | – | – | `ART_TEXT` stimmig | – |
| Schadensart Heilig | Heilzauber, Engelssegen (Selbstwirkung, nie ausgelöst); Sonnenamulett | – | +25 % gegen Verfluchte | – | – | `ART_TEXT.holy` stimmig | – |
| Resistenzen je Klasse/Archetyp | Klasse, Archetyp | – | z. B. Scout Gift 0,85, Heavy Körper 0,9, Artillerist Feuer-Dauer -1 | – | – | in `config/schaden.js` | – |

## 4. Die 30 Magiewaffen und ihre Wirkung

Auslöser-Zuordnung aus `buildEffect`/`elementalEffectFor` und `ART_REGEL`. "Selbst" = Wirkung auf den Schützen, es entsteht kein Schuss; die Schadensart hat dann keine Folge.

| ID | Waffe | `special` | Wirkung | Art → Malus am Ziel | Zahlen |
|---|---|---|---|---|---|
| pa_081 | Zauberbuch der Leere | `void_spell` | Schaden über Zeit | Leere → Fluch | direkt 55, Tick 6 × 2 |
| pa_082 | Goldene Zauberrolle | `magic_bolt` | keine | Arkan → – | 44 |
| pa_083 | Goldene Hand | `magic_hand` | keine | Arkan → – | 46 |
| pa_084 | Astraltrank | `buff` | Selbst: Verstärkung | – | ×1,5, 1 Zug |
| pa_085 | Chaosmagier | `random_spell` | Selbst: Zufall | – | Pool 6; Heilung 54, Schild 50 |
| pa_086 | Windkrieger | `whirlwind` | Heranziehen | Wind → – | 90 px |
| pa_087 | Dimensionssprung | `teleport` | Selbst: Versetzen | – | 60 px |
| pa_088 | Dimensionsriss | `teleport` | Selbst: Versetzen | – | 60 px |
| pa_089 | Zauberstiefel | `mobility` | Selbst: Versetzen | – | 60 px |
| pa_090 | Giftpilz | `poison_zone` | Schaden über Zeit | Gift → Gift | direkt 18, Tick 18 × 3 |
| pa_091 | Astralkugel | `astral_burst` | keine | Astral → – | 58 |
| pa_092 | Heilzauber | `heal` | Selbst: Heilung | – | 42 (entgiftet ab 40) |
| pa_093 | Engelssegen | `shield_heal` | Selbst: Schild | – | 40 |
| pa_094 | Heilspritze | `instant_heal` | Selbst: Heilung | – | 47 |
| pa_095 | Chaoselixier | `random_buff` | Selbst: Verstärkung | – | ×1,5, 1 Zug |
| pa_096 | Mutationselixier | `mutation` | Selbst: Zufall | – | Heilung 35, Schild 40 |
| pa_097 | Traumfänger | `sleep` | Betäubung | Psi → – (kein Eis) | 1 Zug aussetzen |
| pa_098 | Lavaelixier | `lava` | Schaden über Zeit | Feuer → Brand | direkt 50, Tick 16 × 3 |
| pa_099 | Sanduhr | `time_control` | Selbst: Verstärkung | – | ×1,5, 1 Zug |
| pa_100 | Würfel des Chaos | `random_effect` | Selbst: Zufall | – | Heilung 43, Schild 40 |
| pa_101 | Eisschild | `shield_freeze` | Selbst: Schild | – | 40 |
| pa_102 | Gedankensturm | `mind_aoe` | keine | Psi → – | 52 |
| pa_103 | Verderbniskelch | `corruption` | Schaden über Zeit | Dunkel → Fluch | direkt 30, Tick 10 × 2 |
| pa_104 | Quantengewehr | `quantum_shot` | keine | Energie → – (Schild halb) | 56, durchschlägt |
| pa_105 | Spruchrolle | `scroll_spell` | Selbst: Zufall | – | Heilung 58, Schild 53 |
| pa_106 | Sonnenamulett | `solar` (nicht gemappt) | Brand aus dem Elementarwert | Heilig → – (+25 % gegen Fluch) | direkt 38, Tick 10 × 3 |
| pa_107 | Allsehendes Auge | `target_scan` | Selbst: Aufdecken (folgenlos) | – | 2 Züge |
| pa_108 | Zauberpeitsche | `magic_whip` | keine | Arkan → – | 32 |
| pa_109 | Weltenbaum | `area_buff` | Selbst: Verstärkung | – | ×1,5, 1 Zug |
| pa_110 | Dimensionskugel | `dimension_orb` | Selbst: Versetzen | – | 60 px |

Folgen: Die vier Chaos-Waffen (Chaosmagier, Chaoselixier, Mutationselixier, Würfel) und der Eisschild tragen Schadensarten (Chaos → Fluch, Eis → Frost), die nie ausgelöst werden, weil sie Selbstwirkungen sind. Fluch kommt in magic nur von Zauberbuch und Verderbniskelch.

## 5. Urteil je Eintrag und Vorschlag

Urteile: ok / unstimmig (Text oder Name) / wirkungslos / Verdacht. Vorschläge sind Testwerte, keine Änderung. Texte in `wirkungstexte.js` dürfen nach Test und Konvention keine Zahlen nennen.

| Eintrag | Urteil | Begründung | Vorschlag alt → neu | Risiko |
|---|---|---|---|---|
| Heilung | ok | stimmt mit Text; wirkt zusätzlich als Gegenmittel (Entgiftung ab 20 und 40, unabhängig vom Leben) | Text ergänzen: "Heilung lindert Brand, Gift und Fluch" | Nur Text |
| Schild | ok | Text stimmt; kein Ablauf, bis 120 | keine | – |
| Verstärkung | unstimmig, Verdacht zu schwach | Text "einige Züge", Wirkung 1 Zug; rechnerisch 25 % Schadensverlust gegenüber Schießen (Wurf beendet den Zug) | Text: "im nächsten eigenen Zug"; Test: Faktor 1,5 → 2,0 oder Dauer 2 → 4 (drei Folgezüge = Break-even); `addBoost(.., 2)` aus der Wirkung lesen statt fest | Gemeinsame Zahl für fünf Waffen und den Zufallspool; Replay-Fassungsmarke (§2) |
| Rüstung | unstimmig | läuft nie ab; Text "einige Züge" | Entscheidung: Dauer einführen (Test: 3 Eigenzüge, Zähler in `advanceTurn`) oder Text "dauerhaft" und den Wert senken | Replay-Fassungsmarke (§2); betrifft Bunker, Tarnnetz, Zufallspool |
| Einfrieren/Betäuben | unstimmig bei Eis | Eis-Waffen bremsen nur (Frost), Text sagt "setzt aus" | Text: "Der getroffene Gegner setzt aus oder wird gebremst (Eis)" | Nur Text |
| Marke "Eingefroren" | unstimmig | gilt auch für Schlaf und Hammer | Marke "Betäubt" (✱ statt ❄) für Betäubung, ❄ nur bei Frost | Client-Test `status-marke-online.test.js` prüfen |
| Schaden über Zeit | ok | Text stimmt; Fassung 2 mit Obergrenzen schlüssig | keine | – |
| Nachschub | ok | – | keine | – |
| Versetzen | Verdacht (Daten) | `effectMagnitude` unbenutzt; Richtung rechts-vor-links ohne Bezug zum Zielwinkel (Code-Kommentar sagt "Blickrichtung") | Weite aus `effectMagnitude`; Richtung nach Zielwinkel (Entscheidung) | Replay-Fassungsmarke (§2) |
| Aufdecken | wirkungslos | Leser fehlt; Text und Waffenbeschreibung widersprechen sich | Entscheidung: Wirkung (z. B. Zielvorschau) oder Wirkungsart streichen | Replay-Fassungsmarke; `specials.test.js` hält `isRevealed` fest |
| Heranziehen | ok | Windkrieger-Beschreibung "im Umkreis" falsch (siehe magic.md) | – | – |
| Zufallswirkung | ok, Verdacht | Pool enthält die dauerhafte Rüstung (1 von 6) | Rüstung im Pool bis zur Klärung der Dauer herausnehmen | Replay-Fassungsmarke, ändert die Folge des RNG |
| Geschütz, Wasserschub, Kettenblitz, Reittier, Bohrstrahl | ok (nur gelesen) | Texte stimmen mit dem Code | keine | – |
| Brand | ok | Text stimmt; Biom-Zusatz und Gegenspiel gelesen | keine | – |
| Gift | ok | stimmt | keine | – |
| Fluch | ok | stimmt; in magic nur von 2 Waffen ausgelöst | keine | – |
| Säure | ok | stimmt | keine | – |
| Frost | ok | stimmt; Tempo 70 % wirkt über `langsamFaktor` | keine | – |
| Schock | ok | stimmt | keine | – |
| Nass | ok | stimmt; nur Wasserwerfer löst den Zustand aus, der Wasserstand wirkt auch ohne | keine | – |
| Betäubungsschutz | wirkungslos im Display | kein Text, keine Marke | Marke "Geschützt" oder Hilfetext | Nur Client |
| Verlangsamung | unstimmig | keine Marke, kein Text; nur Günthers Haufen löst sie aus | Marke wie Frost | Nur Client |
| Rüstungsmarke, Aufdeck-Marke | fehlt | Rüstung ändert Schadenszahlen ohne Hinweis | Marke "Gerüstet" | Nur Client |

## 6. Gegenmittel-Matrix (Wirkung gegen Mittel)

| Wirkung | Heilung ≥ 20 | Heilung ≥ 40 | Wasser/Nass | Eis (Frost-Treffer) | Feuer | Schutzzug | Rüstung/Schild |
|---|---|---|---|---|---|---|---|
| Brand | löscht | löscht | löscht | löscht | – | – | Schild und Rüstung wirken auch auf Ticks |
| Gift | ein Stapel | alle | – | – | – | – | Schild wirkt auf Ticks, Rüstung zur Hälfte |
| Fluch | – | löscht | – | – | – | – | – |
| Säure | löscht | löscht | – | – | – | – | – |
| Frost | – | – | verstärkt (Betäubung) | – | taut | – | – |
| Schock | – | – | verstärkt | – | – | – | Gummiboden |
| Betäubung | – | – | – | – | – | 1 Zug | – |

Schild und Rüstung gelten auch für Mali-Ticks: `zugBeginn` ruft `applyDamage` mit der Schadensart des Malus auf, und `damageSystem.applyDamage` schickt jeden Schaden über 0 durch den `damageModifier` (`MaliRegeln.schaden`). Dass Fassung 1 dasselbe tut (`terrainBuilder.js` hat einen eigenen Modifikator), habe ich nicht verfolgt.

## 7. Entscheidungsbedarf (kurz)

1. **Rüstung**: Dauer einführen oder dauerhaft belassen und Text/Wert anpassen.
2. **Verstärkung**: Wirkung anheben (Faktor oder Dauer) oder Zug der Verstärkung günstiger machen; Text auf "nächster eigener Zug".
3. **Aufdecken**: Wirkung festlegen oder streichen.
4. **Eis und `freeze`**: Text ändern (sofort möglich) oder Eis-Waffen wieder aussetzen lassen (Regeländerung).
5. **HUD-Marken** für Rüstung, Verlangsamung, Aufgedeckt, Betäubungsschutz; Marke "Eingefroren" für Betäubung umbenennen.
6. **`effectMagnitude`** lesen (Versetzen, Gleitschirm) oder aus den Daten entfernen.

## 8. Grenzen

- Beurteilt sind Wirkungen und Texte aus gelesenem Code und kleinen Rechnungen; nichts davon wurde im Spiel getestet.
- Die Wirkungen außerhalb von magic (Turret, Kettenblitz, Wasserschub, Bohrstrahl, Mahlstrom, Feuer) wurden nur überflogen.
- Offen geblieben: das Geschütz im Detail; ob Fassung 1 Ticks durch Schild und Rüstung schickt.
- Das Verhalten "Verstärkung = ein Zug" und "Rüstung läuft nie ab" ist am `StatusStore` und per Quelltext belegt; ob das Spiel an anderer Stelle (z. B. Zugwechsel in `match.js`) die Rüstung zurücksetzt, habe ich per Suche über `src/engine` und `src/client` ausgeschlossen (Treffer nur `specials.js`, `shooting.js`, `terrainBuilder.js`).
