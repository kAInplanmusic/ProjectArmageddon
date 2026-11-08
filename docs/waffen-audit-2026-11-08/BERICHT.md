# Project Armageddon – vollständiger Audit der 150 Waffen

Stand: 08.11.2026. Geprüfte Spielbasis: main / 8882aeb35aa064201170a63d9e4c9d6aaca3fbaf, weiterhin aktueller main-Stand beim Abruf. Aktuelle Waffenfassung: 15. Ergebnisdateien werden zusätzlich auf DesignRest abgelegt; an Spielmechanik und Assets wurde in diesem Audit nichts geändert.

## Ergebnis

Die 150 Waffen sind vollständig benannt, beschrieben und statisch bebildert. Die größten Probleme sind nicht fehlende Dateien, sondern falsche Funktionspunkte, widersprüchliche Datenfassungen und nicht brauchbare/unbenutzte Animationsbilder. Zusätzlich ist ein echter Widerspruch zwischen ausgewiesenem und verarbeitetem Flächenradius reproduziert.

## Methodik und Grenzen

Alle 150 Einträge wurden mit Quelle, Grundkatalog, getWaffe(F15), buildEffect, elementarem Effektpfad und Sprite-Metadaten zusammengeführt. Sämtliche Quellen, Menü-Icons, Handbilder und Geschossbilder wurden in neun Vergleichsbögen statisch gesichtet; alle 26 zusätzlichen Animations-Sheets in drei Übersichten. Alle Atlasrechtecke wurden gegen reale Bildmaße geprüft, Bilder und Bildausschnitte gehasht. Bei mehreren Richtungsfällen wurde der Griff-/Mündungsmarker im Vergleichsbogen eingeblendet und der tatsächliche Transformationspfad im Renderer gelesen.

150/150 Waffen wurden im selben deterministischen offenen Simulationsaufbau einzeln ausgelöst. Diese Erstaktionsprobe beweist Annahme/Startpfad, keinen Treffer, keine vollständige Balance und keine gelungene Animation. Zusätzlich wurde der Radiusfehler an der tatsächlichen Explosionsfunktion kontrolliert reproduziert. Keine kostenpflichtige API benutzt. Keine neue Browser-/Safari-/Touch-Abnahme: Die bekannte lokale Browserausführung bleibt blockiert.

## Bestandsaufnahme

| Bereich | Ergebnis |
|---|---|
| Waffen | 150 IDs und 150 eindeutige aktuelle Anzeigenamen |
| Beschreibungen | 150 vorhandene Grundkatalogtexte; F12 ersetzt Text/Name von pa_127 |
| Kategorien | 21 melee, 19 ranged, 20 heavy_ranged, 20 elemental, 30 magic, 10 utility, 20 tech, 10 ultimate |
| Statische Rollen | 150 held + 150 silhouette + 150 atlas-icon; alle Rechtecke innerhalb der Bilder |
| Menü-Icons | 150 Dateien, alle 64x64, keine bytegleichen Menübilder |
| Statische Handbilder | 150 verschiedene Bildausschnitte; keine pixelidentischen Hand-Dubletten |
| Atlanten | Acht Kategorieatlanten plus ein Iconatlas |
| Geschossbilder | 96 Einträge; die nominalen 54 Hitscan-Einträge brauchen kein Geschossbild |
| Zusatzanimationen | 26 WebP-Sheets à 1024x512, acht Zellen; gegenwärtig kein Produktlader dafür |
| Nominales delivery-Feld | 96 projectile, 54 hitscan |
| Tatsächlicher Erstaktionspfad | 87 Projektilstarts, 25 Hitscan-Pfade, 38 Selbstwirkungen; 150/150 angenommen |
| Effekte | 65 buildEffect-Zuordnungen, 85 ohne diesen zusätzlichen Spezialeffekt; Standard- und Elementarmechanik können trotzdem wirken |
| Datenfassung | 61 Schadenswerte, 18 Schadensarten und 10 Cooldowns weichen im aktuellen Stand vom Grundkatalog ab |

Ein fehlender buildEffect-Eintrag ist nicht automatisch eine kaputte Waffe. Standardschaden, direkte Strahlen, Zünder, Durchschlag, Zielsuche und elementare Mali liegen teilweise in anderen Pfaden. Ebenso braucht nicht jede Waffe ein eigenes KI-Animationsblatt: Starre Werkzeuge können über saubere Anker und prozedurale Bewegung überzeugend animiert werden.

## Wichtigste reproduzierte Befunde

### W01 – Radius 0 wird zu wirksamem Radius 24

`src/engine/shooting.js` setzt bei nicht-nahkämpferischen Projektilwaffen `weapon.blastRadius || 24`. Für 33 im Lauf erzeugte Projektile steht im Katalog Radius 0, im ECS-Projektil aber 24. Dieser Wert gelangt über `ProjectileSystem#explode` in `wendeExplosionAn`; deren Radiuszweig verteilt tatsächlich Schaden in einer Fläche. Das ist nicht bloß eine grafische Trefferhilfe.

Kontrollprobe mit pa_040 Maschinenpistole: echter Spawnwert 24, Zielabstand 10 px, hitTarget=null. Bei direktem Aufruf derselben Explosionsfunktion sank die Gesundheit von 104 auf 88,565 (~15,435 Schaden). Mit demselben Aufbau und Radius 0 blieb sie 104. Die Probe ruft den Schadenszweig kontrolliert mit echten Spawnparametern auf; sie ist kein vollständiger Kollisionsspieltest. Maschinenpistole ist der konkrete Schadensnachweis; die weiteren 32 Fälle haben nachgewiesene Spawnabweichung und denselben allgemeinen Radiuspfad.

Die Anzeige schreibt bei Radius 0 unter anderem „kein Flächenschaden“ oder „direkt“. Reparatur: gewünschte Wirkung festlegen, Trefferfenster vom Schadensradius trennen und veränderte Mechanik mit Replay-Fassung schützen. Nicht einfach unversioniert 24 durch 0 ersetzen.

Betroffene IDs:
pa_022, pa_023, pa_024, pa_025, pa_026, pa_027, pa_031, pa_033, pa_034, pa_036, pa_040, pa_042, pa_043, pa_045, pa_047, pa_049, pa_050, pa_051, pa_054, pa_055, pa_056, pa_057, pa_058, pa_059, pa_060, pa_062, pa_063, pa_068, pa_078, pa_082, pa_104, pa_140, pa_142.

### W02/W03 – Basiskatalog und aktuelle Spielwaffe werden vermischt

Das ist konkret sichtbar: pa_127 ist bis F11 Teleportplattform, ab F12 beauftragt eine Mine. `waffen-f12.js` überschreibt bereits Name, Beschreibung und special korrekt. Die Menü-Kachel wird jedoch über `getWeapon` aufgebaut, ihre Detailzeile über `getWaffe` ohne explizite Partiefassung. So kann dieselbe Auswahl als Teleportplattform erscheinen, im Detail Mine heißen und tatsächlich eine Mine legen.

Die ältere HUD-Waffenliste zeigt ebenfalls den Grundkatalog-Schaden. Bei der Maschinenpistole beträgt dieser 21, aktuell F15 42, jeweils vor Klassen-/Buff-/Trefferrechnung. Diese Abweichung wurde aus den beiden Datenobjekten gemessen. Die Zahlen sind keine Aussage, dass jeder Treffer genau 42 Gesundheit nimmt.

Außerdem benutzt der Renderer für gehaltene Waffen und Projektildarstellung vielfach WEAPONS_BY_ID; an einer Schadensartstelle dagegen getWaffe. Bei 18 geänderten Schadensarten können Grafik und tatsächliche Wirkung auseinanderlaufen. Eine gemeinsame, explizit partiefassungsabhängige Sicht auf Waffen ist nötig.

### W04 – numerisch gültige Anker sind semantisch falsch

Beispiele in den Vergleichsbögen: Baseballschläger am dicken Kopf gegriffen, Katana/Rapier/Energieschwert mit Klinge nach links trotz nach rechts gerichteter Wirkung, Maschinenpistole mit Mündungsmarker am hinteren Ende. Der Renderer richtet die geometrische Achse Griff→Mündung aus, weiß aber nicht, welches Ende wirklich der Lauf oder Griff ist. Alle Koordinaten können innerhalb der Zelle liegen und trotzdem falsch sein.

Grüner Punkt = deklarierter Griff; roter Punkt = deklarierte Mündung/Wirkspitze. Bei Wurfobjekten ist nicht jede rechte Außenkante eine Mündung. Potions, Rucksäcke, Aufstellobjekte und Beschwörungen benötigen eigene Funktionsrollen. Rücken-Korrekturen für Raketenrucksack/Düsenrucksack/Gleitschirm sind bereits vorhanden; die Atlasansicht allein beweist deshalb keine falsche Rückenposition im laufenden Spiel.

### W05/W06 – Zusatzanimationen sind überwiegend kein freigegebener Produktionsbestand

Kein Produktcode lädt `weapon-sprites/anim` oder dessen Manifest. Die 26 Dateien sind Material, keine funktionierenden Waffenanimationen im Spiel. Das ist momentan auch ein Schutz: Mehrere zeigen völlig fremde Motive.

Konkrete Beispiele: Bumerang wird zum geflügelten Tier, Tentakelgift zum zweibeinigen Dinosaurier, Alte Dame zu einem geflügelten Wesen, Astralkrieger zum einfachen blauen Humanoiden, Wassermelone zum geflügelten Vogelwesen und Weltendrache zum rosa geflügelten Schwein. Feuerschild zeigt ein blaues Tier statt des Schildes. Düsenrucksack pa_112 und Gleitschirm pa_114 sind bytegleich. Einzelne Blätter wie Rakete, Phönix, Bananengranate oder Superschaf sind näher an der Vorlage, benötigen aber weiterhin Bewegungs-/Rollenabnahme.

### W09/W10 – Darstellung darf keine fremde Mechanik suggerieren

38 Waffen wirken zuerst auf den eigenen Spieler bzw. stellen etwas auf. 23 davon tragen trotzdem einen positiven Schadenswert, der als Kennzahl/ableitender Parameter im Katalog steht. Eine pauschale DMG-Zeile ist dafür unverständlich. Beispiel Heilzauber: wirkliche Heilmenge 40 plus Frostreinigung, statt nur „Schaden 35“.

Der Client vergibt für fragmentation, banana_split und spread_shot eine cluster-Markierung. Im gelesenen Motorpfad gibt es keine passende Aufsplitter-/Pelletverzweigung. Die Erstaktionsprobe zeigt je ein Startprojektil; allein das schließt spätere Teilung nicht aus, deshalb wurde zusätzlich der komplette Produktpfad nach diesen Mechanikschlüsseln und entsprechenden Verzweigungen durchsucht. Die vorhandene Splittergranatenbeschreibung spricht von Splitterlöchern im Gelände, nicht ausdrücklich von zusätzlichen Geschossen. Künftig die Markierung an tatsächlich implementierte Mehrfachprojektile koppeln oder ihre Bedeutung ändern.

Beim Bumerang wurde keine gezielte Rückkehrlogik gefunden. Der aktuelle Beschreibungssatz verspricht nur einen Wurf auf mittlere Distanz. Eine Rückkehr wäre deshalb ein sinnvoller Individualisierungsvorschlag, keine bereits vorhandene Eigenschaft.

## Was bereits funktioniert und nicht erneut als offen gemeldet wird

Die Prüfungen check:targeting --strict, check:damage-types, check:effects und check:fuses bestehen aktuell. Alle 150 Zielarten stimmen in der geprüften Basiskatalog-/Quellprüfung überein; die frühere 11er-Targetingliste ist nicht mehr aktuell. Schadensarten und Sichtlinie haben echte Motorleser. Elf zeitgesteuerte Zünder passen zur Absicht; sieben impact-Absichten führen zu Zünder 0. Aktuelle Flug-/Sprungweiten kommen aus versionierten wirkung-Feldern; das alte effectMagnitude ist ausdrücklich eine historische Kennzahl, kein neu entdeckter toter Funktionsparameter.

Die Unit-Suite besteht mit 2.416 Tests. Bestehende Tests sind nützlich, prüfen aber vor allem Schema, Dateiabdeckung, einige Dateninvarianten und bestimmte Funktionen. Namenstests können gute Lesbarkeit sichern; sie beweisen keine Übereinstimmung von aktueller Mine, Basiskatalog und Menü. Farb-/Deckungstests können keine Figurenidentität oder semantisch richtige Mündung garantieren.

## Vorsicht beim vorhandenen Reichweitenbericht

`node scripts/check-range.mjs --all` wurde ausgeführt. Es wählt 94 Basiskatalogwaffen aus und meldet sieben davon mit 0 Flugweite. Diese sieben sind im aktuellen Motor Selbstwirkungen (Portalring, Kosmisches Portal, Frostrolle, Astralkrieger, Astralross, Feuerschild, Goldene Reliktkugel). Die lokale Ausschlussliste vergleicht special-Namen mit teilweise normalisierten Effektarten und greift deshalb nicht korrekt. Dieser Lauf ist ein Nachweis einer Messwerkzeuglücke, keine belastbare Balancefreigabe für 150 Waffen. Die darin angegebene Mittelzahl 0,48 wird bewusst nicht als aktuelle globale Reichweitenbewertung übernommen.

## Priorisierte Änderungsliste

| ID | Priorität | Thema | Konkrete Aufgabe / Abnahme |
|---|---|---|---|
| W01 | Muss | Verdeckten Radius 24 bereinigen | Bei 33 tatsächlich erzeugten Projektilen weicht der gespawnte Radius 24 vom ausgewiesenen Radius 0 ab. Trefferfenster, Splash und Anzeige auseinanderziehen; beabsichtigte Wirkung festlegen und versionieren. |
| W02 | Muss | Waffenfassung in sämtlichen Anzeigen vereinheitlichen | Waffenleiste/Kachel/Renderer lesen teils Grundkatalog, Detailzeile aktuelle Fassung. Sichtbare Werte und Namen aus derselben zur Partie gehörigen Fassung beziehen. Alte Replays dürfen nicht ungefragt F15 anzeigen. |
| W03 | Muss | Mine konsistent benennen | pa_127 heißt ab F12 Mine; alte Katalog-/Atlaswerte nennen Teleportplattform. Die Umwandlung ist beauftragt und korrekt implementiert; der Fehler ist die gemischte Anzeige. |
| W04 | Muss | Griff und Spitze semantisch prüfen | Geometrische Linkspunkt-/Rechtspunkt-Regeln reichen nicht. Unter anderem pa_001, pa_003, pa_004, pa_009, pa_012, pa_015, pa_016, pa_018, pa_038, pa_040, pa_051, pa_055 und pa_068 manuell neu verankern. |
| W05 | Muss | Falsche Animationsidentitäten aussortieren | Alle 26 Zusatz-Sheets bleiben bis zur Rollen- und Identitätsabnahme ausgeschaltet. Fremde Tiere/Humanoide bei Bumerang, Tentakelgift, Alter Dame, Astralkrieger, Wassermelone, Weltendrache und Feuerschild ersetzen. |
| W06 | Muss | Bytegleiche Fehlzuordnung entfernen | pa_112 und pa_114 sind exakt dieselbe WebP-Datei trotz Rucksack-/Schirmmotiv. Nicht bloß umbenennen; passende, getrennte Vorlagen erstellen. |
| W07 | Muss | UI-, Hand-, Geschoss- und Weltobjektrolle trennen | Ein Soldat, ganzer Baum, Katapult oder Portalbild ist nicht automatisch eine sinnvoll gehaltene Waffe. Für Beschwörung, Aufstellen, Rückenobjekt und Selbstanwendung eigene Darstellungsrollen benutzen. |
| W08 | Muss | Freistellung und Rahmenreste bereinigen | Konkrete Einzelbefunde unten, z.B. pa_012, pa_050, pa_054, pa_066, pa_118, pa_138 und pa_146. Beabsichtigte UI-Rahmen dürfen bleiben, aber kein zufälliger weißer Hintergrund als Hand-Sprite. |
| W09 | Muss | Heilung/Schutz/Bewegung mit passenden Kennzahlen anzeigen | 38 Selbstwirkungen sind nicht 38 normale Schadensschüsse. Heilwert, Schildwert, Verstärkung, Bewegung oder Minenfunktion statt pauschaler DMG-Zahl anzeigen; 23 Selbstwirkungen tragen dennoch einen positiven Katalog-Schadenswert. |
| W10 | Muss | Streu-/Cluster-Markierung auf echte Mechanik beziehen | Der Client markiert fragmentation/banana_split/spread_shot als cluster. Im geprüften Motorpfad gibt es dafür keine entsprechende Split-/Pelletverzweigung; Einzelstart-Probe erzeugt jeweils ein Projektil. Markierung entfernen/umbenennen oder echte Mechanik getrennt implementieren. |
| W11 | Soll | Animationen wirklich anbinden statt nur liefern | Aktuell kein Produktverweis auf weapon-sprites/anim. Nach Qualitätsprüfung Rollen festlegen und Loader/Renderer/Abnahme ergänzen; 124 Waffen brauchen nicht automatisch acht KI-Frames. |
| W12 | Soll | Menü-Icon aus derselben freigegebenen Vorlage ableiten | Alle 150 Menübilder sind nur 64x64. Vorhandener 128er-Iconatlas wird vom Waffenmenü nicht gelesen. Für hohe Pixeldichte 128er-Varianten/Atlas passend nutzen; 4K pro Icon ist unnötig. |
| W13 | Soll | Unterschiedliche Projektilidentität schaffen | Geteilte Kugeln/Raketen sind technisch legitim, aber Feuerdämon, Phönix und Weltendrache teilen dasselbe Feuerprojektilmotiv. Für Signaturwaffen eigene klar lesbare Form oder Spur vorsehen. |
| W14 | Soll | Funktionsquelle für Selbstanimation korrigieren | parameterFuerWaffe leitet selbst aus damage===0 ab, der Motor aus buildEffect/SELF_TARGET_KINDS. Diese Kriterien stimmen für 23 positive Selbstwirkungswerte nicht überein; bewusste Posenkorrekturen erhalten und semantische Rolle statt Nullwert verwenden. |
| W15 | Soll | Reichweitenprüfung versions- und wirkungsrichtig machen | check-range --all prüft 94 Basiskatalogkandidaten, darunter sieben tatsächliche Selbstwirkungen mit 0 Flugweite. Auswahl aus getWaffe und buildEffect ableiten; Hitscan/Flug/Selbst getrennt messen. |
| W16 | Soll | Namens- und Bildkonflikte gezielt auflösen | Goldene Zauberrolle sieht eher wie Stab/Münzen aus, Zauberbuch der Leere wie Siegel. Bumerang ohne gezielte Rückkehrlogik als Designfrage behandeln. Humorvolle Namen behalten, keine pauschale Umbenennung aller 150. |
| W17 | Soll | Mündungsblitz/Flamme/Schweif aus Ruhebild auslagern | Bei vielen Kanonen, Raketen, Fackeln und Energieobjekten sind aktive Effekte eingebrannt; das erzeugt Dauerfeuer und falsche Ruheposen. Körper und Effekt getrennt exportieren. |
| W18 | Soll | Prüfungen um semantische Fälle erweitern | Grüne Dateiexistenz-, Schema- und Stichworttests erkennen keine falschen Köpfe, vertauschten Griffe oder Radius-Fallbacks. Akzeptanzfälle mit aktuellem Waffenstand, zweitem Ziel und getrennter Anzeige ergänzen. |
| W19 | Soll | Farbsprache an die aktuelle Fassung binden | 18 Waffen ändern gegenüber dem Grundkatalog ihre Schadensart. Der Renderer liest an mehreren Stellen den Basiskatalog; positive Einzelausnahmen ersetzen keinen einheitlichen fassungsabhängigen Datenpfad. |
| W20 | Muss vor Freigabe | Im Browser in echten Spielsituationen prüfen | Alle Assets in kleiner Darstellung, vor hellen/dunklen 4K-Kulissen, beim Zielen links/rechts, bei Winkeländerung, Rückstoß und tatsächlichem Treffer prüfen. Der vorliegende Bericht enthält keine bestandene Browserabnahme. |

## Meine gestalterische Empfehlung

Die Quellen haben bereits einen wiedererkennbaren farbigen Abenteuercomic-Charakter. Diesen würde ich erhalten und schmutziger, erwachsener und kontrastreicher ausarbeiten. Mittelfinger, Pömpel, Handtuch, Clownfaust und Alte Dame geben Persönlichkeit; sie sollten nicht zugunsten generischer Militärwaffen verschwinden.

Die Hierarchie sollte lauten: klare Silhouette in 24/40 Pixeln → eindeutige Funktion → passende Hand-/Weltposition → Material und Details → kontrollierte Spezialeffekte. Manche Quellen besitzen winzige Ziersterne, Schlagschatten oder Rahmen, die im Endasset als störende Fragmente verbleiben. Beabsichtigte einheitliche UI-Plaketten sind zulässig; Hand- und Flugassets sollten davon unabhängig entstehen.

Keine 150 kompletten Neugenerierungen auf Verdacht. Zuerst semantisch falsche Anker, kaputte Freistellung, Versionsmischung und echte Funktionswidersprüche reparieren. Danach zehn Signature-Assets als Qualitätsmaßstab: Baseballschläger, Kettensäge, Plasmawerfer, Bumerang, Wasserwerfer, Schwarzes Loch, Heilzauber, Mine, Alte Dame, Weltendrache. Normale starre Waffen prozedural animieren; nur tatsächlich formveränderliche Wesen brauchen zusätzliche Frames.

## Verifikation

- 150/150 Erstaktionen im deterministischen Simulationsaufbau angenommen: 87 Projektile, 25 Hitscan, 38 Selbstwirkungen.
- Kontrollierter Radiusnachweis und Nullradius-Gegenprobe durchgeführt.
- Alle 450 held/silhouette/icon-Atlasregionen und 96 Projektilregionen innerhalb der Bildmaße.
- Alle 150 Namen-/Kategoriezuordnungen im statischen Manifest stimmen mit dem Grundkatalog überein; pa_127 weicht beabsichtigt in der aktuellen Fassung ab.
- Alle 150 Menü-Icons und alle 26 Zusatzanimationen vorhanden. pa_112/pa_114 bytegleich.
- check:targeting --strict, check:effects, check:damage-types und check:fuses: bestanden.
- Vollständige Unit-Suite: 2.416 bestanden, 0 fehlgeschlagen, 0 übersprungen.
- check:docs: bestanden. Produktionsbuild des vorausgehenden unveränderten Spielcodes bestanden.
- Reichweitenwerkzeug ausgeführt, mit methodischem Befund; keine neue Balancefreigabe.
- Keine neue bestandene Browser-E2E-/Touch-/Safari-Abnahme. Statische Sichtprüfung ist keine vollständige Animation im laufenden Spiel.
- Keine Spielwerte, Assets oder Namen in diesem Audit geändert. Dieses Dokument ist ein Bericht mit Belegen und Aufgaben.

## Einzelprüfung aller 150 Waffen

Die Zahlen sind Daten der aktuellen Waffenfassung 15, vor Klassen-, Buff-, Distanz-, Rüstungs- und Materialrechnung. Bei Selbstwirkungen bedeutet ein positiver Katalogwert nicht automatisch direkten Schaden. Standard bedeutet: kein zusätzlicher buildEffect-Eintrag; andere Mechanikpfade können trotzdem wirken. Die visuelle Einzelnotiz ist eine fachliche Beurteilung, keine automatische Messung.

### pa_001 – Baseballschläger

Kategorie: melee · stabiler interner Name: baseballschlager

Beschreibung aktuell: Wuchtiger Schlag auf kurze Distanz mit hohem Schaden.

Daten: Grundwert 53 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special bat_knockback · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Baseballschläger klar erkennbar. Im Hand-Sprite liegt der Griffmarker am dicken Schlagkopf und die Wirkspitze am Griffende: semantisch verkehrt ausgerichtet.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_002 – Feuerfaust

Kategorie: melee · stabiler interner Name: feuerfaust

Beschreibung aktuell: Brennender Faustschlag auf kurze Distanz, der den Gegner in Brand setzt.

Daten: Grundwert 51 · Art fire · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special burn · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 9, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 9, "turns": 3}.

Optische Einzelprüfung: Feuerfaust gut lesbar, aber Glut und Flammen sind fest eingebrannt. Faust/Handgelenk als Körper-/Ausrüstungsrolle festlegen; Icon berührt mehrfach den Rand.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 64} · Wirkspitze {"x": 108, "y": 58} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_003 – Hakenklinge

Kategorie: melee · stabiler interner Name: hakenklinge

Beschreibung aktuell: Kurzer Hieb mit dem Haken, der den getroffenen Gegner ein kurzes Stück heranzieht.

Daten: Grundwert 45 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special hook_pull · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 60}; elementarer Zusatz: null.

Optische Einzelprüfung: Hakenklinge mit klarer Form. Griffmarker liegt am Haken, der Stiel zeigt zur Wirkspitze: Handanker und Angriffsrichtung korrigieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 72} · Wirkspitze {"x": 120, "y": 67} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_004 – Piratenhaken

Kategorie: melee · stabiler interner Name: piratenhaken

Beschreibung aktuell: Eiserner Haken, der den getroffenen Gegner weit heranzieht, mit Nachladezeit.

Daten: Grundwert 36 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special hook_pull · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 150}; elementarer Zusatz: null.

Optische Einzelprüfung: Piratenhaken gut individualisiert. Anker sitzt nahe dem Haken statt am unteren Griff; Richtung und Zuganimation auf tatsächlichen Hakenkontakt abstimmen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 63} · Wirkspitze {"x": 120, "y": 60} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_005 – Morgenstern

Kategorie: melee · stabiler interner Name: morgenstern

Beschreibung aktuell: Schwere Stachelkugel für harte Treffer auf kurze Distanz, danach folgt eine Nachladezeit.

Daten: Grundwert 75 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special heavy_impact · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Morgenstern klarer Kopf und Schaft. Griff-/Spitzenverteilung wirkt plausibel; kleine Stacheln im 24/40-Pixel-Icon vereinfachen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 66} · Wirkspitze {"x": 120, "y": 66} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_006 – Schaufel

Kategorie: melee · stabiler interner Name: schaufel

Beschreibung aktuell: Handliche Schaufel für einen Schlag auf kurze Distanz, der auch das Gelände aufreißt.

Daten: Grundwert 38 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special dig · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Schaufel gut erkennbar und im Hand-Sprite passend ausgerichtet. Materialflächen und Blattkante in kleinen Icons bewahren; aktuelle generische Wurfbewegung bleibt eine Designentscheidung.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_007 – Tonfa

Kategorie: melee · stabiler interner Name: tonfa

Beschreibung aktuell: Handliche Schlagwaffe für Treffer auf kurze Distanz.

Daten: Grundwert 42 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special rapid_melee · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Tonfa erkennbar. Der seitliche eigentliche Griff wird vom geometrischen Anker nicht getroffen; gezielten Griffpunkt statt Hauptachsen-Endpunkt setzen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 50} · Wirkspitze {"x": 120, "y": 50} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_008 – Kriegshammer

Kategorie: melee · stabiler interner Name: kriegshammer

Beschreibung aktuell: Schwerer Hammer, der den getroffenen Gegner betäubt.

Daten: Grundwert 68 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special stun · delivery projectile.

Effektpfad: {"kind": "freeze", "turns": 1}; elementarer Zusatz: null.

Optische Einzelprüfung: Kriegshammer visuell klar, funktional Betäubung. Eigenen Schlag-/Betäubungsimpuls zeigen statt nur generischem Wurfobjekt.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 61} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_009 – Eispickel

Kategorie: melee · stabiler interner Name: eispickel

Beschreibung aktuell: Eisiger Hieb, der den getroffenen Gegner einfriert.

Daten: Grundwert 56 · Art ice · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special freeze · delivery projectile.

Effektpfad: {"kind": "freeze", "turns": 1}; elementarer Zusatz: {"kind": "freeze", "turns": 1}.

Optische Einzelprüfung: Eispickel im Hand-Sprite links mit Hakenkopf, rechts mit Griffende. Griffmarker sitzt kopfnah: Kopf und Griff semantisch ausrichten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 21, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_010 – Kettensäge

Kategorie: melee · stabiler interner Name: kettensage

Beschreibung aktuell: Wuchtige Säge für harte Treffer auf kurze Distanz, danach folgt eine Nachladezeit.

Daten: Grundwert 78 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special multi_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kettensäge klar erkennbar. Feste statische Kette wirkt leblos; Kettenbewegung, Vibrationsprofil und vorderen Kettenkontakt getrennt animieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 69} · Wirkspitze {"x": 120, "y": 69} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_011 – Zwillingskatanas

Kategorie: melee · stabiler interner Name: zwillingskatanas

Beschreibung aktuell: Zwei Klingen für schnelle Hiebe auf kurze bis mittlere Distanz.

Daten: Grundwert 38 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Zwillingskatanas als gekreuztes Icon gut, als gehaltene Waffe unklar. Beide Schwerter getrennt oder eine bewusste Doppelwaffenpose verankern.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 65} · Wirkspitze {"x": 120, "y": 107} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_012 – Katana

Kategorie: melee · stabiler interner Name: katana

Beschreibung aktuell: Schlanke Klinge mit weitem, flachem Wurf.

Daten: Grundwert 48 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Katana im Hand-Sprite mit Klinge nach links und Heft nach rechts; Anker vertauschen. Menü-Icon enthält zusätzlich einen sichtbaren quadratischen Rand/Hintergrundrest.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 58} · Wirkspitze {"x": 120, "y": 58} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_013 – Mehrzweckmesser

Kategorie: melee · stabiler interner Name: multifunktionsmesser

Beschreibung aktuell: Vielseitiges Messer für einen sauberen Treffer auf kurze Distanz.

Daten: Grundwert 42 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Mehrzweckmesser klarer Griff und Klinge; Hand-Sprite plausibel. Gegen Kampfmesser stärker über Sägezahnprofil und Griffsilhouette unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 64} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_014 – Taschenmesser

Kategorie: melee · stabiler interner Name: taschenmesser

Beschreibung aktuell: Kleines Klappmesser, das flach und weit fliegt.

Daten: Grundwert 53 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Taschenmesser gut lesbar und eigenständig. Die aufgeklappte Form muss in Hand und Wurf konsistent bleiben; keine zusätzliche Nahkampfmechanik aus dem Namen ableiten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 72} · Wirkspitze {"x": 120, "y": 72} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_015 – Runenschwert

Kategorie: melee · stabiler interner Name: runenschwert

Beschreibung aktuell: Schwert mit Runen, dessen Hieb als arkaner Schaden wirkt.

Daten: Grundwert 47 · Art arcane · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Runenschwert hübsch, aber Klinge im Hand-Sprite links und Griff rechts. Griff-/Wirkspitze korrigieren; Runenglühen als eigenen Effekt führen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 60} · Wirkspitze {"x": 120, "y": 60} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_016 – Rapier

Kategorie: melee · stabiler interner Name: rapier

Beschreibung aktuell: Dünner Degen mit flachem, schnellem Stich auf mittlere Distanz.

Daten: Grundwert 41 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Rapier im Hand-Sprite rückwärts zum Ziel. Feine Spitze/Parierstange vereinfachen und echten Heftanker setzen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 65} · Wirkspitze {"x": 119, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_017 – Kampfmesser

Kategorie: melee · stabiler interner Name: kampfmesser

Beschreibung aktuell: Robustes Messer für harte Treffer auf kurze Distanz.

Daten: Grundwert 51 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kampfmesser klarer Umriss und grundsätzlich passende Ausrichtung. Die Differenz zu Mehrzweckmesser über Klingenform/Animation stärken.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 61} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_018 – Energieschwert

Kategorie: melee · stabiler interner Name: energieschwert

Beschreibung aktuell: Klinge aus gebündelter Energie, die ein Ziel durchschlägt und Schilde schwächt.

Daten: Grundwert 63 · Art energy · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special energy_blade · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Energieschwert im Hand-Sprite mit leuchtender Klinge links und Griff rechts. Drehen/spiegeln und Energieglühen unabhängig vom Körper-Sprite behandeln.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_019 – Doppelaxt

Kategorie: melee · stabiler interner Name: doppelaxt

Beschreibung aktuell: Schwere Wurfaxt, die nach dem Aufprall mehrfach abprallt.

Daten: Grundwert 39 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Doppelaxt gut erkennbar. Griffanker am Schaft plausibel; die asymmetrischen Köpfe nicht durch geometrische Streckung verfälschen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 68} · Wirkspitze {"x": 100, "y": 56} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_020 – Kriegssense

Kategorie: melee · stabiler interner Name: kriegssense

Beschreibung aktuell: Lange Sense für einen kräftigen Hieb auf kurze Distanz.

Daten: Grundwert 50 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kriegssense bleibt kompakte diagonale Gesamtform statt sauberer Seitenwaffe. Spezifischen Schaftgriff und Sensenbogen vorsehen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 46, "y": 77} · Wirkspitze {"x": 117, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_021 – Krummsäbel

Kategorie: melee · stabiler interner Name: gebogene_klinge

Beschreibung aktuell: Gebogener Säbel, der nach dem Aufprall mehrfach abprallt.

Daten: Grundwert 44 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Krummsäbel gut erkennbar, Griff links und Klinge rechts plausibel. Klinge/Parierstange im kleineren HUD-Kontext scharf halten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_022 – Plasmawerfer

Kategorie: ranged · stabiler interner Name: plasma_blaster

Beschreibung aktuell: Schießt Plasmaschüsse in gerader Linie, trifft weit und braucht freie Sicht.

Daten: Grundwert 68 · Art energy · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special plasma_bolt · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Plasmawerfer visuell stark. Fest eingebrannter Mündungsblitz sollte separater Effekt sein; generisches gelbes Plasmaprojektil schwächt die cyanfarbene Identität.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 64} · Wirkspitze {"x": 120, "y": 70} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_023 – Boxhandschuhe

Kategorie: ranged · stabiler interner Name: boxhandschuhe

Beschreibung aktuell: Boxhandschuhe, die den getroffenen Gegner mit gewaltigem Rückstoß davonschleudern.

Daten: Grundwert 40 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special mega_knockback · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Boxhandschuhe werden als einzelner nach rechts gedrehter Handschuh angezeigt; Schlagfläche liegt links, Marker zur Manschette rechts. Körper-/Faustrolle und Richtung korrigieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 66} · Wirkspitze {"x": 120, "y": 66} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_024 – Mittelfinger

Kategorie: ranged · stabiler interner Name: mittelfinger

Beschreibung aktuell: Eine unmissverständliche Geste, die flach und weit zum Gegner fliegt.

Daten: Grundwert 48 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Mittelfinger ist ein starkes schwarzhumoriges Icon. Der Hand-Sprite zeigt seitlich statt aufrecht; festlegen, ob Handgeste oder geworfenes Objekt gemeint ist.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_025 – Handtuch

Kategorie: ranged · stabiler interner Name: handtuch

Beschreibung aktuell: Zusammengerolltes Handtuch, das auf mittlere Distanz klatscht.

Daten: Grundwert 62 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Handtuch gut wiedererkennbar und witzig. Als Wurfobjekt plausibel; weiche Peitschen-/Schlagbewegung würde mehr Charakter liefern.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_026 – Pressluftbohrer

Kategorie: ranged · stabiler interner Name: pneumatischer_bohrer

Beschreibung aktuell: Dröhnender Bohrer, der auf mittlere Distanz tief ins Gelände reißt.

Daten: Grundwert 72 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special drill · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Pressluftbohrer klarer Entwurf, aber mit eingebrannten Bodensplittern. Griff und Bohrspitze prüfen, Splitter als Kontakteffekt auslagern.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 61} · Wirkspitze {"x": 117, "y": 56} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_027 – Fackel

Kategorie: ranged · stabiler interner Name: fackel

Beschreibung aktuell: Brennende Fackel, die den Gegner in Brand setzt.

Daten: Grundwert 46 · Art fire · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Fackel klar lesbar. Feuer nicht in starres Handbild einbacken; Flamme und Rauch unabhängig animieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_028 – Kaktusbombe

Kategorie: ranged · stabiler interner Name: kaktusbombe

Beschreibung aktuell: Stachelige Bombe, die nach kurzer Verzögerung im Umkreis zündet.

Daten: Grundwert 79 · Art physical · Radius 48 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special spike_blast · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 8, "turns": 3}.

Optische Einzelprüfung: Kaktusbombe gute ungewöhnliche Silhouette. Spitze/Blüte/Lunte im kleinen Icon separieren, Explosion von eventuell erwarteter Stachelstreuung unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_029 – Pömpel

Kategorie: ranged · stabiler interner Name: pompel

Beschreibung aktuell: Wurfgerät mit Zünder, das nach kurzer Verzögerung im Umkreis wirkt.

Daten: Grundwert 64 · Art physical · Radius 30 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special sticky · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Pömpel gut erkennbar. Beschreibung ist ein generisches verzögertes Wurfgerät; Klebeverhalten darf aus special=sticky nicht als implementiert versprochen werden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 26, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_030 – Impulsbombe

Kategorie: ranged · stabiler interner Name: cyber_bombe

Beschreibung aktuell: Elektrische Bombe, die nach kurzer Verzögerung im Umkreis zündet und Schock auslöst.

Daten: Grundwert 79 · Art electric · Radius 52 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special emp_blast · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Impulsbombe technisch klar. Nicht mit der tatsächlichen Mine pa_127 verwechseln; Form/Farbe im Menü stärker unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 29, "y": 60} · Wirkspitze {"x": 120, "y": 53} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_031 – Kraftfaust

Kategorie: ranged · stabiler interner Name: power_gauntlets

Beschreibung aktuell: Gepanzerte Faust, die mit Energie zuschlägt und Schilde schwächt.

Daten: Grundwert 79 · Art energy · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special power_punch · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kraftfaust zeigt zwei Fäuste im Icon, aber nur ein generisches geworfenes Gesamtmotiv. Eine eindeutige aktive Faust oder eine bewusste Doppelfaustpose definieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 62, "y": 65} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_032 – Raketenrucksack

Kategorie: ranged · stabiler interner Name: raketenrucksack

Beschreibung aktuell: Raketenstoß, der den Schützen weit versetzt, eine Feuerspur auf dem Weg hinterlässt und danach Pause braucht.

Daten: Grundwert 0 · Art fire · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 6 (tatsächliche Zuteilung über Munitionsklassen) · special flight · delivery projectile.

Effektpfad: {"kind": "move", "distance": 100, "element": "fire", "spur": "weg", "radius": 30}; elementarer Zusatz: null.

Optische Einzelprüfung: Raketenrucksack im Atlas horizontal; der Renderer besitzt bereits eine Hinterkörper-Korrektur. Position in Bewegung im Spiel prüfen. Das Animationsblatt zeigt einen fremden blauen Flugkörper statt des grünen Rucksacks: nicht integrieren.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 68} · Wirkspitze {"x": 120, "y": 68} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_033 – Zauberstab

Kategorie: ranged · stabiler interner Name: magischer_kampfstock

Beschreibung aktuell: Geworfener Stab voller arkaner Kraft, der den Gegner zurückstößt.

Daten: Grundwert 42 · Art arcane · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Zauberstab ist lesbar, Mündungsanker an Kristallspitze plausibel. Gegen Zauberbolzen durch Stabschaft und anderes Flugmotiv unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 45, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_034 – Zauberbolzen

Kategorie: ranged · stabiler interner Name: magischer_geschosszauber

Beschreibung aktuell: Schneller Zauberbolzen, der flach und weit fliegt.

Daten: Grundwert 56 · Art arcane · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Zauberbolzen zeigt im Hand-Sprite die Spitze links, Anker rechts am Schaftende. Richtungszuordnung und Projektilkopf prüfen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 62} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_035 – Energieball

Kategorie: ranged · stabiler interner Name: explosiver_energieball

Beschreibung aktuell: Kugel aus Energie, die beim Aufprall im Umkreis explodiert.

Daten: Grundwert 79 · Art energy · Radius 34 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special energy_explosion · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Energieball als leuchtende Kugel gut lesbar. Eigene Blitzstruktur im Flug erhalten statt austauschbarem Orb; Lichtintensität bei kleinster Darstellung reduzieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 61, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_036 – Raketenhandschuh

Kategorie: ranged · stabiler interner Name: raketenhandschuh

Beschreibung aktuell: Handschuh mit Raketenantrieb für einen wuchtigen Treffer mit Sprengkraft.

Daten: Grundwert 62 · Art explosive · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Raketenhandschuh erkennbar, Handanker unter dem Werfer prüfen. Die feste Schussflamme aus dem Ruhe-Sprite entfernen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 40, "y": 62} · Wirkspitze {"x": 120, "y": 48} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_037 – Raketenwerfer

Kategorie: ranged · stabiler interner Name: raketenwerfer_mk_i

Beschreibung aktuell: Schwere Rakete mit großem Explosionsradius, aber wenig Munition.

Daten: Grundwert 79 · Art explosive · Radius 46 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Raketenwerfer gute Silhouette und richtige Hauptrichtung. Eingebackene Flammen/Rakete vom leeren Werfer trennen; generisches Flugprojektil nur als Basis.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 61} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_038 – Rakete

Kategorie: ranged · stabiler interner Name: rakete

Beschreibung aktuell: Rakete, die beim Aufprall im Umkreis explodiert.

Daten: Grundwert 79 · Art explosive · Radius 38 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special rocket · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Rakete im Hand-Sprite mit rundem Kopf links und Triebwerksflamme rechts; Flugrichtung laut Manifest rechts. Kopf-/Triebwerksachse ist verkehrt. Das separate Animationsblatt ist näher am Original, aber nicht eingebunden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 64} · Wirkspitze {"x": 120, "y": 65} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_039 – Feldmörser

Kategorie: ranged · stabiler interner Name: feldkanone_morser

Beschreibung aktuell: Mörser, dessen Granate von oben auf den Zielpunkt niedergeht.

Daten: Grundwert 79 · Art explosive · Radius 45 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special mortar · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Feldmörser als stehendes Gerät gut, als getragenes Motiv ungewöhnlich. Eigenen Aufstellanker und Rohrmündung definieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 62, "y": 76} · Wirkspitze {"x": 104, "y": 24} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_040 – Maschinenpistole

Kategorie: ranged · stabiler interner Name: maschinenpistole

Beschreibung aktuell: Schnelle Schüsse mit viel Munition für kurze bis mittlere Distanz.

Daten: Grundwert 42 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 8 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Maschinenpistole zeigt im Hand-Sprite den Lauf nach links, Mündungsmarker nach rechts auf das hintere Ende. Semantische Spiegelung/Anker korrigieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 44} · Wirkspitze {"x": 120, "y": 44} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_041 – Salvengeber

Kategorie: heavy_ranged · stabiler interner Name: raketenwerfer_mk_ii

Beschreibung aktuell: Kleine Raketen in schneller Folge mit kleinem Explosionsradius.

Daten: Grundwert 62 · Art explosive · Radius 16 · Cooldown 0 · maxAmmo-Katalogwert 6 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Salvengeber besitzt klares Rohr und vorn sitzende Ladung. Mechanisch wird nicht allein wegen des Namens eine echte Mehrfachsalve erzeugt; Rückstoß und Anzahl sichtbar mit Mechanik abgleichen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 73} · Wirkspitze {"x": 120, "y": 71} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_042 – Feuerwerkssalve

Kategorie: heavy_ranged · stabiler interner Name: feuerwerks_salve

Beschreibung aktuell: Feuerwerksraketen mit hohem Schaden, wenig Munition und langer Nachladezeit.

Daten: Grundwert 75 · Art explosive · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Feuerwerkssalve als Icon farbenfroh, in kleiner Größe unruhig. Mehrfachraketenmotiv nicht mit einem einzelnen generischen Raketenprojektil gleichsetzen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 65} · Wirkspitze {"x": 120, "y": 53} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_043 – Kampfgeschütz

Kategorie: heavy_ranged · stabiler interner Name: kampfgeschutz

Beschreibung aktuell: Schweres Geschütz mit weiter Schussbahn und wenig Munition.

Daten: Grundwert 65 · Art explosive · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kampfgeschütz zeigt einen Soldaten im befestigten Sitz statt eine isolierte Waffe. Maschinenkörper, Bediener und Aufstell-/Handrolle trennen; aktuelle Funktion ist kein aufgestelltes Wachgeschütz.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 30, "y": 60} · Wirkspitze {"x": 117, "y": 60} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_044 – Phönixschlag

Kategorie: heavy_ranged · stabiler interner Name: phonix_angriff

Beschreibung aktuell: Feuervogel, der sein Ziel verfolgt und im Umkreis in Flammen aufgeht.

Daten: Grundwert 79 · Art fire · Radius 55 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special phoenix_strike · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 18, "turns": 3}.

Optische Einzelprüfung: Phönixschlag hat eigene Flügel-/Feueridentität, das Animationsblatt bleibt überwiegend referenznah. Flugbild derzeit generischer Feuerdiamant; erst nach Bewegungsprüfung passende Phönixanimation anbinden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 66, "y": 62} · Wirkspitze {"x": 115, "y": 44} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_045 – Raketensalve

Kategorie: heavy_ranged · stabiler interner Name: raketen_salve

Beschreibung aktuell: Rakete mit hohem Schaden, aber wenig Munition und langer Nachladezeit.

Daten: Grundwert 73 · Art explosive · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Raketensalve zeigt drei Raketen im Icon, aber ein Standardprojektil im Atlas. Reale Salvenmechanik oder rein symbolische Darstellung ausdrücklich unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 68, "y": 58} · Wirkspitze {"x": 118, "y": 58} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_046 – Splittergranate

Kategorie: heavy_ranged · stabiler interner Name: splittergranate

Beschreibung aktuell: Granate mit Zünder, die im Umkreis explodiert und Splitterlöcher ins Gelände reißt.

Daten: Grundwert 55 · Art explosive · Radius 42 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special fragmentation · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Splittergranate gut erkennbar. Streu-Gruppenmarker suggeriert Splitterprojektile, während der geprüfte Schuss nur ein Projektil erzeugt; Effektvertrag prüfen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 65} · Wirkspitze {"x": 104, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert; W10: Cluster-Marker ohne nachgewiesene Split-Mechanik


### pa_047 – Handgranate

Kategorie: heavy_ranged · stabiler interner Name: handgranate

Beschreibung aktuell: Wurfgranate mit Zünder, die nach dem ersten Aufprall liegen bleibt, bevor sie zündet.

Daten: Grundwert 79 · Art explosive · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Handgranate klare rote Silhouette. Trotz ausgewiesenem Radius 0 wird aktuell Radius 24 gespawnt; beim Asset nicht durch optische Explosion eine widersprüchliche Mechanik kaschieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 61, "y": 64} · Wirkspitze {"x": 112, "y": 57} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_048 – Bananengranate

Kategorie: heavy_ranged · stabiler interner Name: bananengranate

Beschreibung aktuell: Bananenförmige Granate, die nach dem Aufprall mit Verzögerung zündet.

Daten: Grundwert 60 · Art explosive · Radius 40 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special banana_split · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Bananengranate witzig und lesbar. Handbild zeigt Körper links/Lunte rechts; kein gerichteter Lauf nötig. Das Animationsblatt ist überwiegend passend, echte Splittermechanik jedoch nicht allein durch banana_split belegt.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen; W10: Cluster-Marker ohne nachgewiesene Split-Mechanik


### pa_049 – Bumerang

Kategorie: heavy_ranged · stabiler interner Name: bumerang

Beschreibung aktuell: Gebogenes Wurfholz für einen Treffer auf mittlere Distanz.

Daten: Grundwert 39 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special returning_projectile · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Bumerang hat passende Grundform; Animationsblatt wird dagegen zu einem fliegenden Insekt/Raketentier. Keine gezielte Rückkehrlogik im geprüften Motorpfad gefunden; Rückkehr als Designwunsch behandeln.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 60, "y": 56} · Wirkspitze {"x": 106, "y": 66} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_050 – Doppelkopfaxt

Kategorie: heavy_ranged · stabiler interner Name: doppelkopf_axt

Beschreibung aktuell: Schwere Wurfaxt mit zwei Köpfen und hohem Schaden.

Daten: Grundwert 77 · Art physical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Doppelkopfaxt hat deutlichen weißen Hintergrund im Menü-Icon; freistellen. Handanker auf dem Axtkopf statt auf dem unteren Schaft wirkt falsch.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 70, "y": 57} · Wirkspitze {"x": 120, "y": 57} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_051 – Wurfklingen

Kategorie: heavy_ranged · stabiler interner Name: wurfklingen

Beschreibung aktuell: Flache Wurfklingen, die schnell und weit fliegen.

Daten: Grundwert 68 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Wurfklingen im Hand-Sprite zeigen Spitzen links und Griffwicklungen rechts; Achse ist zum Ziel verkehrt. Bündel und einzelne fliegende Klinge getrennt aufbereiten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 32, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_052 – Molotowcocktail

Kategorie: heavy_ranged · stabiler interner Name: molotowcocktail

Beschreibung aktuell: Brandflasche, die nach kurzer Verzögerung zündet und im Umkreis in Brand setzt.

Daten: Grundwert 47 · Art fire · Radius 42 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special fire_pool · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 16, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 16, "turns": 3}.

Optische Einzelprüfung: Molotowcocktail klar. Flasche, Stofflunte und Flamme trennen; Flamme nicht als vermeintliche feste Mündung benutzen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 60} · Wirkspitze {"x": 120, "y": 56} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_053 – Roboterbombe

Kategorie: heavy_ranged · stabiler interner Name: roboterbombe

Beschreibung aktuell: Bombe in Form eines kleinen Roboters, die nach kurzer Verzögerung explodiert.

Daten: Grundwert 68 · Art explosive · Radius 45 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special delayed_bot · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Roboterbombe starke Figurensilhouette. Animationsblatt reduziert das Modell auf einen anderen kastenförmigen Roboter; Referenzkopf, Körper und Antennen erhalten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 67} · Wirkspitze {"x": 103, "y": 67} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_054 – Schrotflinte

Kategorie: heavy_ranged · stabiler interner Name: schrotflinte

Beschreibung aktuell: Wuchtiger Schuss auf mittlere Distanz mit anschließender Nachladezeit.

Daten: Grundwert 57 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special spread_shot · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Schrotflinte erkennbar; Menü-Icon trägt eine große Hintergrundfläche. Spread-/Streumarker bedeutet im aktuellen Erstschuss noch keine verifizierte Pelletwolke.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 25, "y": 67} · Wirkspitze {"x": 120, "y": 67} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert; W10: Cluster-Marker ohne nachgewiesene Split-Mechanik


### pa_055 – Fernbüchse

Kategorie: heavy_ranged · stabiler interner Name: scharfschutzengewehr

Beschreibung aktuell: Präzise Büchse, die ein Ziel durchschlägt, weit reicht und freie Sicht braucht.

Daten: Grundwert 55 · Art physical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special precision · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Fernbüchse im Hand-Sprite mit Lauf links und hinterem Schaft rechts, Mündungsmarker hinten: Richtung und Griff korrigieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 52} · Wirkspitze {"x": 120, "y": 53} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_056 – Präzisionsgewehr

Kategorie: heavy_ranged · stabiler interner Name: maschinenpistole_mk_ii

Beschreibung aktuell: Einzelner, harter Schuss auf große Distanz mit sehr wenig Munition.

Daten: Grundwert 72 · Art physical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 2 (tatsächliche Zuteilung über Munitionsklassen) · special direct_hit · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Präzisionsgewehr gut erkennbar, aber sehr dünn. Schaftgriff statt geometrischem Linkspunkt verankern; Fernbüchse durch eigene Optik/Schusscharakter unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_057 – Revolver

Kategorie: heavy_ranged · stabiler interner Name: revolver

Beschreibung aktuell: Handfeuerwaffe für gezielte Schüsse, die freie Sicht braucht.

Daten: Grundwert 49 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special precision · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Revolver klare Form und plausibler Lauf nach rechts. Geometrischer Griffpunkt liegt zu hoch nahe Trommel statt am tatsächlichen Griff: kontrollieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 70} · Wirkspitze {"x": 120, "y": 70} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_058 – Kampfbogen

Kategorie: heavy_ranged · stabiler interner Name: kampfbogen

Beschreibung aktuell: Bogen für gezielte Pfeile, der freie Sicht braucht.

Daten: Grundwert 55 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special arrow · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kampfbogen schöne Form, aber Schussachse/Sehnenmitte braucht semantische Abnahme. Pfeil separat aus Sehnenkontakt starten lassen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 63, "y": 64} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_059 – Armbrust

Kategorie: heavy_ranged · stabiler interner Name: armbrust

Beschreibung aktuell: Armbrust mit harten Bolzen, die ein Ziel durchschlagen und freie Sicht brauchen.

Daten: Grundwert 53 · Art physical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special heavy_arrow · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Armbrust im Hand-Sprite räumlich schräg und nicht rein seitlich. Bolzenrinne, Griff und Auslass gezielt markieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 27, "y": 70} · Wirkspitze {"x": 120, "y": 53} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_060 – Gatlingkanone

Kategorie: heavy_ranged · stabiler interner Name: minigun

Beschreibung aktuell: Drehlaufgeschütz mit großer Reichweite.

Daten: Grundwert 44 · Art physical · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special minigun · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Gatlingkanone klarer Mehrlaufkopf. Laufrotation und echte Schussfolge sollten zusammenpassen; statischer Mehrlaufkopf allein erzeugt keine Schnellfeuermechanik.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 34, "y": 64} · Wirkspitze {"x": 112, "y": 56} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_061 – Feuerdämon

Kategorie: elemental · stabiler interner Name: feuerdamon

Beschreibung aktuell: Feuerdämon, der im Umkreis wütet und in Brand setzt.

Daten: Grundwert 58 · Art fire · Radius 44 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special fire_entity · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 19, "turns": 3}.

Optische Einzelprüfung: Feuerdämon wird als gehaltenes Wesen gezeichnet. Animationsblatt zeigt überwiegend denselben Dämon mit einzelnen starken Farbwechseln; Begleiter-/Beschwörungsrolle bewusst festlegen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 56, "y": 69} · Wirkspitze {"x": 120, "y": 69} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_062 – Flammenwerfer

Kategorie: elemental · stabiler interner Name: flammenwerfer

Beschreibung aktuell: Feuerstrahl auf mittlere Distanz, der den Gegner in Brand setzt.

Daten: Grundwert 48 · Art fire · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special continuous_stream · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 15, "turns": 3}.

Optische Einzelprüfung: Flammenwerfer gut erkennbar, jedoch Flamme fest eingebrannt. Feuerstrahl, Brennstatus und tatsächliche zeitliche Schusswirkung sind getrennte Aufgaben.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_063 – Wasserwerfer

Kategorie: elemental · stabiler interner Name: wasserblaster

Beschreibung aktuell: Wasserstoß, der den Gegner wegdrückt und nass macht.

Daten: Grundwert 32 · Art water · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special water_push · delivery projectile.

Effektpfad: {"kind": "water_push", "distance": 120, "raise": 0.4}; elementarer Zusatz: null.

Optische Einzelprüfung: Wasserwerfer richtige Richtung und klare Farbkennung. Der Tank-/Griffanker wirkt am hinteren Tank; echte Handposition kontrollieren. Versteckten Radius 24 beachten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 29, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_064 – Katapult

Kategorie: elemental · stabiler interner Name: katapult

Beschreibung aktuell: Schleudert einen schweren Brocken, der im großen Umkreis einschlägt.

Daten: Grundwert 68 · Art physical · Radius 48 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special catapult · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Katapult als komplettes Objekt samt Felsen und Figur zu detailliert für ein Hand-Sprite. Aufstellobjekt/Bediener/Stein trennen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 31, "y": 66} · Wirkspitze {"x": 118, "y": 66} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_065 – Meteorbrocken

Kategorie: elemental · stabiler interner Name: meteoritenbrocken

Beschreibung aktuell: Brocken, der von oben einschlägt und das Gelände aufreißt.

Daten: Grundwert 74 · Art impact · Radius 50 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special meteor_impact · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Meteorbrocken als Stein erkennbar; animierter gelber Schweif ist stark vereinfacht und wirkt angeklebt. Rotation/Glut als kontrollierte Effekte statt Formwechsel.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_066 – Haubitze

Kategorie: elemental · stabiler interner Name: artilleriegeschutz

Beschreibung aktuell: Schwere Artillerie, deren Granate von oben auf den Zielpunkt niedergeht.

Daten: Grundwert 56 · Art explosive · Radius 48 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special artillery · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Haubitze samt Standfuß ist nachvollziehbar; Menü-Icon trägt weißen Hintergrund. Rohrmündung ist oben rechts, Handmarker am Aufbau unten: Aufstellrolle definieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 86} · Wirkspitze {"x": 104, "y": 12} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_067 – Säurekanone

Kategorie: elemental · stabiler interner Name: saurekanone

Beschreibung aktuell: Verschießt Säure, die im Umkreis die Rüstung zersetzt.

Daten: Grundwert 35 · Art acid · Radius 38 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special acid_dot · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 14, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 14, "turns": 3}.

Optische Einzelprüfung: Säurekanone als Kettenfahrzeug gut, als Handgerät schwer zu lesen. Säurewolke separat animieren; eigenes grünes Tropfenprojektil von Gift unterscheiden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 29, "y": 69} · Wirkspitze {"x": 118, "y": 52} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_068 – Plasmagewehr

Kategorie: elemental · stabiler interner Name: plasma_gewehr

Beschreibung aktuell: Gewehr mit Plasmaladung, die ein Ziel durchschlägt und freie Sicht braucht.

Daten: Grundwert 46 · Art energy · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special plasma · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Plasmagewehr zeigt Lauf links, Mündungsmarker rechts hinten. Hand-Sprite horizontal richtig ausrichten; feste blaue Strahlen entfernen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 30, "y": 63} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W02: Schadenswert gegenüber Grundkatalog geändert


### pa_069 – Raketenkanone

Kategorie: elemental · stabiler interner Name: raketenkanone

Beschreibung aktuell: Kanone für Raketen mit großem Radius und hoher Wirkung.

Daten: Grundwert 56 · Art explosive · Radius 40 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special launcher · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Raketenkanone zeigt im Hand-Sprite Spitze rechts und Waffe links grundsätzlich plausibel. Handpunkt liegt am hinteren Rohr statt am unteren Griff; feste Rakete/Schussflamme trennen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_070 – Giftwolke

Kategorie: elemental · stabiler interner Name: giftwolke

Beschreibung aktuell: Giftwolke, die nach kurzer Verzögerung aufgeht und im Umkreis vergiftet.

Daten: Grundwert 18 · Art poison · Radius 58 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special poison_cloud · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 23, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 23, "turns": 3}.

Optische Einzelprüfung: Giftwolke ist im Menü ein gerahmtes Symbol, in der Hand bleibt ein deutliches Rahmenstück erhalten. Symbol und frei schwebende Wolke als verschiedene Assets führen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_071 – Eisschlag

Kategorie: elemental · stabiler interner Name: eisschlag

Beschreibung aktuell: Eisbrocken, der im Umkreis einschlägt, den Gegner verlangsamt und beim zweiten Treffer betäubt.

Daten: Grundwert 55 · Art ice · Radius 35 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special freeze · delivery projectile.

Effektpfad: {"kind": "freeze", "turns": 1}; elementarer Zusatz: {"kind": "freeze", "turns": 1}.

Optische Einzelprüfung: Eisschlag hat gutes kantiges Eisprofil. Geschoss ist nur generischer Eisdiamant; Eisbruch und Wirbel getrennt darstellen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 67, "y": 61} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_072 – Feuerball

Kategorie: elemental · stabiler interner Name: feuerball

Beschreibung aktuell: Feuerball, der im Umkreis explodiert und in Brand setzt.

Daten: Grundwert 48 · Art fire · Radius 34 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special fireball · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 15, "turns": 3}.

Optische Einzelprüfung: Feuerball trägt in der Hand noch einen quadratischen Bildrahmen. Frei stehenden Feuerkern extrahieren statt das UI-Bild als Waffe zu verwenden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 64} · Wirkspitze {"x": 118, "y": 57} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_073 – Tentakelgift

Kategorie: elemental · stabiler interner Name: tentakelgift

Beschreibung aktuell: Giftiges Tentakel, das nach kurzer Verzögerung im Umkreis vergiftet.

Daten: Grundwert 32 · Art poison · Radius 44 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special tentacle_zone · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 28, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 28, "turns": 3}.

Optische Einzelprüfung: Tentakelgift als vielarmiges Giftmotiv erkennbar, das Animationsblatt wird zu einem zweibeinigen Dinosaurier. Vollständig neu referenzführen oder nicht verwenden.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_074 – Verderbnissiegel

Kategorie: elemental · stabiler interner Name: verderbnis_siegel

Beschreibung aktuell: Dunkles Siegel, das im Umkreis Schaden anrichtet und verflucht.

Daten: Grundwert 34 · Art dark · Radius 46 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special curse · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 10, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 10, "turns": 3}.

Optische Einzelprüfung: Verderbnissiegel gut als UI-Symbol. Handmotiv braucht klare Glyphen-/Orbkonvention, damit es nicht wie ein tragbares Bildschild wirkt.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 65} · Wirkspitze {"x": 120, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02: Schadenswert gegenüber Grundkatalog geändert


### pa_075 – Tornado

Kategorie: elemental · stabiler interner Name: tornado

Beschreibung aktuell: Wirbelsturm, der Gegner im Umkreis zum Schützen heranzieht.

Daten: Grundwert 45 · Art wind · Radius 60 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special suction · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Tornado im Menü mit weißem Hintergrund und Restplatte. Wirbel als räumlichen Effekt statt statisches aufrechtes Handobjekt vorsehen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 62} · Wirkspitze {"x": 116, "y": 47} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_076 – Portalring

Kategorie: elemental · stabiler interner Name: portalring

Beschreibung aktuell: Ring, durch den der Schütze an einen anderen Ort springt.

Daten: Grundwert 35 · Art spatial · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special portal · delivery projectile.

Effektpfad: {"kind": "move", "distance": 60}; elementarer Zusatz: null.

Optische Einzelprüfung: Portalring hat eigenständige Form, aber mehrere Rahmenteile bleiben im Handmotiv. Bewegungswirkung und Orbdarstellung klar trennen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_077 – Schwarzes Loch

Kategorie: elemental · stabiler interner Name: schwarzes_loch

Beschreibung aktuell: Kollabierender Punkt, der Gegner anzieht und mit schwerem Schaden zerreißt.

Daten: Grundwert 75 · Art void · Radius 72 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special gravity_well · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Schwarzes Loch sehr gut lesbar. Ruhiges Zentrum erhalten und nur Rand/Verzerrung animieren; nicht mit beliebigem violettem Zauberorb verwechseln.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_078 – Voodoopuppe

Kategorie: elemental · stabiler interner Name: voodoo_puppe

Beschreibung aktuell: Puppe mit dunkler Kraft, die den Gegner verflucht.

Daten: Grundwert 45 · Art dark · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special linked_damage · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Voodoopuppe einprägsam. linked_damage ist im aktuellen buildEffect kein eigenständiger Effekt; Fluch entsteht über andere Schadens-/Maluspfade, keine Kopplungsmechanik behaupten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 65} · Wirkspitze {"x": 100, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_079 – Kosmisches Portal

Kategorie: elemental · stabiler interner Name: kosmisches_portal

Beschreibung aktuell: Kosmisches Tor, durch das der Schütze an einen anderen Ort springt.

Daten: Grundwert 20 · Art spatial · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special portal_field · delivery projectile.

Effektpfad: {"kind": "move", "distance": 60}; elementarer Zusatz: null.

Optische Einzelprüfung: Kosmisches Portal visuell komplex und mit kleiner Mittelfigur. Für 24/40 Pixel stark vereinfachen; vom Dimensionsring über klare Kontur unterscheiden.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 63} · Wirkspitze {"x": 119, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_080 – Psionischer Tentakel

Kategorie: elemental · stabiler interner Name: psionischer_tentakel

Beschreibung aktuell: Geistiger Griff, der Gegner im Umkreis zum Schützen heranzieht.

Daten: Grundwert 44 · Art psychic · Radius 52 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special mind_pull · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Psionischer Tentakel zeigt zusätzlich eine menschliche Hand im Motiv. Angeborenes Wesen, Beschwörung und Ausrüstungsgegenstand gestalterisch festlegen; Handbild nicht doppelt am Figurenarm zeichnen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 67, "y": 61} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_081 – Zauberbuch der Leere

Kategorie: magic · stabiler interner Name: zauberbuch_der_leere

Beschreibung aktuell: Zauberbuch, das die Leere entfesselt: Schaden am getroffenen Gegner und anhaltender Schaden über Zeit.

Daten: Grundwert 55 · Art void · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special void_spell · delivery hitscan.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 8, "turns": 3}; elementarer Zusatz: null.

Optische Einzelprüfung: Zauberbuch der Leere zeigt überwiegend ornamentiertes Siegel statt aufgeschlagenem Buch. Buchform oder ehrlicheren Siegelnamen erwägen; aktuelle IDs beibehalten.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 61} · Wirkspitze {"x": 119, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_082 – Goldene Zauberrolle

Kategorie: magic · stabiler interner Name: goldene_zauberrolle

Beschreibung aktuell: Rolle, die einen goldenen Zauberbolzen entsendet und freie Sicht braucht.

Daten: Grundwert 44 · Art arcane · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special magic_bolt · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Goldene Zauberrolle zeigt im Bild einen goldenen Stab mit Münzen, keine eindeutig erkennbare Rolle. Name und Motiv abgleichen; weißer UI-Hintergrund verstärkt die Unruhe.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 45, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_083 – Goldene Hand

Kategorie: magic · stabiler interner Name: goldene_hand

Beschreibung aktuell: Goldene Hand, die das Ziel unmittelbar mit arkaner Kraft trifft.

Daten: Grundwert 46 · Art arcane · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special magic_hand · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Goldene Hand als goldene Faust gut lesbar. Kontur von Feuerfaust/Kraftfaust durch klare Material- und Gestenform absetzen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 64} · Wirkspitze {"x": 119, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_084 – Glutelixier

Kategorie: magic · stabiler interner Name: astraltrank

Beschreibung aktuell: Glutroter Trank, der den eigenen Schaden kurz stark verstärkt und Treffer in Brand setzt.

Daten: Grundwert 34 · Art fire · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special buff · delivery hitscan.

Effektpfad: {"kind": "damage_boost", "multiplier": 1.7, "turns": 2, "element": "fire"}; elementarer Zusatz: null.

Optische Einzelprüfung: Glutelixier starkes Flaschenmotiv. Aktuelle Wirkung Feuerverstärkung, Grundkatalog astral: Renderer-/UI-Datenversion beachten, nicht alte Magiefarben übernehmen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 70} · Wirkspitze {"x": 104, "y": 70} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_085 – Feuermagier

Kategorie: magic · stabiler interner Name: chaosmagier

Beschreibung aktuell: Feuerzauber mit zufälliger Wirkung aus dem Angriffspool: Brandverstärkung, Rüstung oder Munition.

Daten: Grundwert 45 · Art fire · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special random_spell · delivery hitscan.

Effektpfad: {"kind": "random", "pool": ["damage_boost", "armor", "ammo"], "element": "fire"}; elementarer Zusatz: null.

Optische Einzelprüfung: Feuermagier als komplette Figur im Hand-Sprite kann mit Spielfiguren verwechselt werden. Besser Beschwörungssymbol oder separates Effektwesen; aktuelle Feuerwirkung aus Versionsschicht übernehmen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 62, "y": 62} · Wirkspitze {"x": 109, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_086 – Windkrieger

Kategorie: magic · stabiler interner Name: wirbelwind_krieger

Beschreibung aktuell: Krieger im Wirbelwind, der den getroffenen Gegner zum Schützen heranzieht.

Daten: Grundwert 42 · Art wind · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special whirlwind · delivery hitscan.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Windkrieger als kleiner Krieger unter Wirbel. Hintergrundreste im Icon/Handmotiv; Beschwörungsrolle und tatsächlicher Zieheffekt verständlich darstellen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 58} · Wirkspitze {"x": 117, "y": 41} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_087 – Dimensionssprung

Kategorie: magic · stabiler interner Name: dimensionssprung_i

Beschreibung aktuell: Sprung durch die Dimension; beim Aufprall zuckt am Zielpunkt ein Blitz.

Daten: Grundwert 0 · Art electric · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special teleport · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 80, "element": "electric", "spur": "ziel", "radius": 36}; elementarer Zusatz: null.

Optische Einzelprüfung: Dimensionssprung als quadratischer Raumring gut erkennbar. Aktuell elektrische Zusatzwirkung: Versionsdaten in Effektdarstellung übernehmen; Name im Vergleich zu Dimensionsriss begrifflich schärfen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 65, "y": 68} · Wirkspitze {"x": 118, "y": 68} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert


### pa_088 – Dimensionsriss

Kategorie: magic · stabiler interner Name: dimensionssprung_ii

Beschreibung aktuell: Riss in der Dimension für den weitesten Sprung; am Zielpunkt entlädt sich ein Schock.

Daten: Grundwert 0 · Art electric · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 2 (tatsächliche Zuteilung über Munitionsklassen) · special teleport · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 165, "element": "electric", "spur": "ziel", "radius": 52}; elementarer Zusatz: null.

Optische Einzelprüfung: Dimensionsriss als runder Raumring ähnelt Dimensionssprung sehr stark. Durch Rissform, Farbe oder Bewegung unterscheidbar machen; keine andere Grundmechanik bloß aus dem Namen ableiten.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 119, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert


### pa_089 – Zauberstiefel

Kategorie: magic · stabiler interner Name: magischer_stiefel

Beschreibung aktuell: Verzauberte Stiefel für einen kleinen Sprung mit Feuerspur, dafür jeden Zug.

Daten: Grundwert 36 · Art fire · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special mobility · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 40, "element": "fire", "spur": "weg", "radius": 22}; elementarer Zusatz: null.

Optische Einzelprüfung: Zauberstiefel ein gutes Bewegungsicon, aber Restlinien vom Bildrahmen bleiben. Stiefel nicht wie ein gerahmtes Schild vor den Spieler halten.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 66, "y": 64} · Wirkspitze {"x": 120, "y": 90} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_090 – Giftpilz

Kategorie: magic · stabiler interner Name: giftpilz

Beschreibung aktuell: Giftiger Pilz, der den getroffenen Gegner vergiftet.

Daten: Grundwert 18 · Art poison · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special poison_zone · delivery hitscan.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 25, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 25, "turns": 3}.

Optische Einzelprüfung: Giftpilz klarer individueller Entwurf. Feinste Fäden bei kleinen Icons vereinfachen; Giftfläche als gesonderten Bodeneffekt ausgeben.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_091 – Astralkugel

Kategorie: magic · stabiler interner Name: astralorb

Beschreibung aktuell: Kugel aus Astralenergie, die den getroffenen Gegner unmittelbar trifft.

Daten: Grundwert 58 · Art astral · Radius 0 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special astral_burst · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Astralkugel dekorativ, ähnelt vielen Kreisglyphen. Eigenen Kern-/Ringumriss und charakteristische Flug-/Strahlbewegung definieren.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 119, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_092 – Heilzauber

Kategorie: magic · stabiler interner Name: heilzauber

Beschreibung aktuell: Heilt den Schützen ein wenig, wärmt ihn vom Frost frei und ist jeden Zug nutzbar.

Daten: Grundwert 35 · Art holy · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special heal · delivery hitscan.

Effektpfad: {"kind": "heal", "amount": 40, "reinigt": ["frost"]}; elementarer Zusatz: null.

Optische Einzelprüfung: Heilzauber als grün-goldenes Siegel lesbar. Menüdetail nennt weiterhin Schaden als Zahl, obwohl die Selbstwirkung heilt; Heilwert und Reinigung separat anzeigen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 66, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_093 – Funkenschild

Kategorie: magic · stabiler interner Name: engelssegen

Beschreibung aktuell: Schild unter Strom: Wer es trifft, wird geschockt.

Daten: Grundwert 30 · Art electric · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special shield_heal · delivery hitscan.

Effektpfad: {"kind": "shield", "amount": 40, "gegen": "electric"}; elementarer Zusatz: null.

Optische Einzelprüfung: Funkenschild zeigt im Original einen goldblauen Engel, die aktuelle Wirkung ist elektrisch. Schildsilhouette in der UI klarer zeigen; Bildfarbe nicht als heilige Wirkung missverstehen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_094 – Heilspritze

Kategorie: magic · stabiler interner Name: heil_injektion

Beschreibung aktuell: Spritze, die den Schützen kräftig heilt, löst einen Schock und braucht danach Pause.

Daten: Grundwert 39 · Art medical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special instant_heal · delivery hitscan.

Effektpfad: {"kind": "heal", "amount": 70, "reinigt": ["schock"]}; elementarer Zusatz: null.

Optische Einzelprüfung: Heilspritze eindeutig, aber Icon enthält Schatten-/Hintergrundlinie unter der Spritze. Heilwert und Reinigung statt allgemeinem DMG anzeigen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_095 – Sturmelixier

Kategorie: magic · stabiler interner Name: chaos_elixier

Beschreibung aktuell: Geladenes Elixier, das den eigenen Schaden für zwei Züge verstärkt und Treffer schockt.

Daten: Grundwert 34 · Art electric · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special random_buff · delivery hitscan.

Effektpfad: {"kind": "damage_boost", "multiplier": 1.3, "turns": 3, "element": "electric"}; elementarer Zusatz: null.

Optische Einzelprüfung: Sturmelixier wird im Hand-Sprite liegend gezeichnet. Für Trinken/Anwenden aufrechte Flaschenpose statt Waffenmündung verwenden; elektrische Wirkung aus aktueller Fassung lesen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_096 – Mutationselixier

Kategorie: magic · stabiler interner Name: mutationselixier

Beschreibung aktuell: Elixier mit zufälliger Wirkung aus dem Giftpool: Heilung, Sprung oder Giftverstärkung.

Daten: Grundwert 29 · Art poison · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special mutation · delivery hitscan.

Effektpfad: {"kind": "random", "pool": ["heal", "move", "damage_boost"], "element": "poison"}; elementarer Zusatz: null.

Optische Einzelprüfung: Mutationselixier hat gute Flaschenform, ebenfalls horizontal als Schusswaffe gedreht. Anwenden-/Trinkenpose und sichtbare Gift-/Zufallswirkung getrennt darstellen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 27, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_097 – Traumfänger

Kategorie: magic · stabiler interner Name: traumfanger

Beschreibung aktuell: Fängt den Gegner im Traum und lässt ihn einen Zug aussetzen.

Daten: Grundwert 30 · Art psychic · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special sleep · delivery hitscan.

Effektpfad: {"kind": "freeze", "turns": 1}; elementarer Zusatz: null.

Optische Einzelprüfung: Traumfänger wird wie ein horizontaler Stab gedreht. Eigene Hänge-/Schwingpose und Schlafsymbol wären verständlicher als generischer Waffenanker.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_098 – Lavaelixier

Kategorie: magic · stabiler interner Name: lava_elixier

Beschreibung aktuell: Flüssige Lava, die den getroffenen Gegner in Brand setzt und Schaden über Zeit anrichtet.

Daten: Grundwert 50 · Art fire · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special lava · delivery hitscan.

Effektpfad: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 23, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 23, "turns": 3}.

Optische Einzelprüfung: Lavaelixier klare grobe Flasche. Im Handbild seitlich ausgerichtet; Flaschen-/Anwendungsrolle statt Lauf/Mündung verwenden.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_099 – Frostsanduhr

Kategorie: magic · stabiler interner Name: zeit_sanduhr

Beschreibung aktuell: Sanduhr aus Eis, die den eigenen Schaden mehrere Züge lang leicht verstärkt und mit Frost bremst.

Daten: Grundwert 28 · Art ice · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special time_control · delivery hitscan.

Effektpfad: {"kind": "damage_boost", "multiplier": 1.2, "turns": 4, "element": "ice"}; elementarer Zusatz: null.

Optische Einzelprüfung: Frostsanduhr gutes Zeit-/Eismotiv. Horizontale Ausrichtung erschwert Lesen; aufrechte Glyphenpose und tatsächlichen Frost-Buff statt behaupteter Zeitmanipulation zeigen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 64} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_100 – Blitzwürfel

Kategorie: magic · stabiler interner Name: wurfel_des_chaos

Beschreibung aktuell: Würfel mit zufälliger Wirkung aus dem Tempopool: Schockverstärkung, Sprung oder Munition.

Daten: Grundwert 36 · Art electric · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special random_effect · delivery hitscan.

Effektpfad: {"kind": "random", "pool": ["damage_boost", "move", "ammo"], "element": "electric"}; elementarer Zusatz: null.

Optische Einzelprüfung: Blitzwürfel klarer Würfel mit leuchtenden Kanten. Im Detail zu viel Neon; Zufalls-/Blitzfunktion durch Symbol und Kurztext statt nur Farbigkeit unterscheiden.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 62, "y": 63} · Wirkspitze {"x": 116, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_101 – Eisschild

Kategorie: magic · stabiler interner Name: eisschild

Beschreibung aktuell: Dickes Schild aus Eis: Wer es trifft, wird mit Frost gebremst.

Daten: Grundwert 32 · Art ice · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special shield_freeze · delivery hitscan.

Effektpfad: {"kind": "shield", "amount": 55, "gegen": "ice"}; elementarer Zusatz: null.

Optische Einzelprüfung: Eisschild gut erkennbar, trägt aber Sockel-/Rahmenreste in Icon und Handbild. Schildrolle ohne Bodenplatte; Schutzwert und Reaktion auf Angreifer anzeigen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 65} · Wirkspitze {"x": 120, "y": 109} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_102 – Gedankensturm

Kategorie: magic · stabiler interner Name: gedankensturm

Beschreibung aktuell: Mentaler Sturm, der dem getroffenen Gegner unmittelbar Schaden anrichtet.

Daten: Grundwert 52 · Art psychic · Radius 0 · Cooldown 3 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special mind_aoe · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Gedankensturm schönes Auge/Tentakelmotiv. In kleinsten Größen visuell überladen; zentrale Augenform priorisieren.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 66, "y": 65} · Wirkspitze {"x": 115, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_103 – Verderbniskelch

Kategorie: magic · stabiler interner Name: verderbnis_kelch

Beschreibung aktuell: Kelch, dessen Verderbnis dem getroffenen Gegner Schaden über Zeit anrichtet und ihn verflucht.

Daten: Grundwert 30 · Art dark · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special corruption · delivery hitscan.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 15, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 15, "turns": 3}.

Optische Einzelprüfung: Verderbniskelch im Handmotiv mit Rahmenteilen. Kelch als echtes Objekt extrahieren; dunkle Aura separat animieren.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 68} · Wirkspitze {"x": 118, "y": 86} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_104 – Quantengewehr

Kategorie: magic · stabiler interner Name: quantengewehr

Beschreibung aktuell: Gewehr mit Energiestrahl, der ein Ziel durchschlägt und freie Sicht braucht.

Daten: Grundwert 45 · Art energy · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special quantum_shot · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Quantengewehr bleibt räumlich gedreht, Mündungsrichtung nicht sauber zur Hauptachse. Griff/Lauf nach manueller Abnahme festlegen und feste Quanteneffekte abtrennen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 62} · Wirkspitze {"x": 119, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_105 – Frostrolle

Kategorie: magic · stabiler interner Name: zauberrolle

Beschreibung aktuell: Rolle mit zufälligem Eiszauber aus dem Schutzpool: Eisschild, Heilung oder Rüstung.

Daten: Grundwert 48 · Art ice · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special scroll_spell · delivery projectile.

Effektpfad: {"kind": "random", "pool": ["shield", "heal", "armor"], "element": "ice"}; elementarer Zusatz: null.

Optische Einzelprüfung: Frostrolle klarer Schriftrollenentwurf, aber Rahmenreste verbleiben. Symbol/UI-Rolle von der in der Hand entrollten Rolle trennen; aktuelle Eiswirkung lesen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 63} · Wirkspitze {"x": 120, "y": 50} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_106 – Sonnenamulett

Kategorie: magic · stabiler interner Name: sonnenamulett

Beschreibung aktuell: Amulett, das Sonnenlicht bündelt, den Gegner in Brand setzt und Verfluchte härter trifft.

Daten: Grundwert 38 · Art holy · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special solar · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 13, "turns": 3}.

Optische Einzelprüfung: Sonnenamulett hat klare Sonnenform. Im kleinsten Icon Ornamente reduzieren; Eigenidentität gegenüber Goldener Reliktkugel erhalten.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 61} · Wirkspitze {"x": 107, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_107 – Allsehendes Auge

Kategorie: magic · stabiler interner Name: allsehendes_auge

Beschreibung aktuell: Späht das Feld aus: Der Schütze gilt für einige Züge als aufgedeckt.

Daten: Grundwert 29 · Art utility · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special target_scan · delivery hitscan.

Effektpfad: {"kind": "reveal", "turns": 2}; elementarer Zusatz: null.

Optische Einzelprüfung: Allsehendes Auge visuell passend zur Aufdeckung, mit deutlich erhaltenen Rahmenresten. UI-Symbol und schwebender Aufklärungseffekt getrennt aufbereiten.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 64} · Wirkspitze {"x": 119, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_108 – Zauberpeitsche

Kategorie: magic · stabiler interner Name: magische_peitsche

Beschreibung aktuell: Peitsche aus arkaner Kraft, die unmittelbar trifft und freie Sicht braucht.

Daten: Grundwert 32 · Art arcane · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special magic_whip · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Zauberpeitsche zeigt ein aufgerolltes Seil, kaum lesbare aktive Spitze. Gehaltenen Griff, ausgezogene Peitsche und magischen Strahl als getrennte Zustände darstellen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 62} · Wirkspitze {"x": 119, "y": 74} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_109 – Giftbaum

Kategorie: magic · stabiler interner Name: weltenbaum

Beschreibung aktuell: Giftiger Baum, der den eigenen Schaden lange, aber schwach verstärkt und Treffer vergiftet.

Daten: Grundwert 33 · Art poison · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special area_buff · delivery hitscan.

Effektpfad: {"kind": "damage_boost", "multiplier": 1.15, "turns": 5, "element": "poison"}; elementarer Zusatz: null.

Optische Einzelprüfung: Giftbaum als vollständiger Baum kann Landschaft statt Waffe suggerieren. Buff-/Beschwörungsrolle erklären und Boden-/Pflanzenteile vom Handmotiv trennen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 67} · Wirkspitze {"x": 111, "y": 64} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_110 – Dimensionskugel

Kategorie: magic · stabiler interner Name: dimensionskugel

Beschreibung aktuell: Kugel, die den Schützen durch die Dimension versetzt; am Landepunkt gefriert der Boden.

Daten: Grundwert 28 · Art ice · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special dimension_orb · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 110, "element": "ice", "spur": "ziel", "radius": 40}; elementarer Zusatz: null.

Optische Einzelprüfung: Dimensionskugel ist im Spiel Eisbewegung. Motiv mit Portaltechnik ist brauchbar, doch aktuelle Elementfarbe und UI-Nutzen aus Versionsdaten ableiten.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 67} · Wirkspitze {"x": 113, "y": 83} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_111 – Enterhaken

Kategorie: utility · stabiler interner Name: grappling_hook

Beschreibung aktuell: Haken, mit dem sich der Schütze ein Stück versetzt; beim Einschlag schockt er alle am Zielpunkt.

Daten: Grundwert 0 · Art electric · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special grapple · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 45, "element": "electric", "spur": "ziel", "radius": 30}; elementarer Zusatz: null.

Optische Einzelprüfung: Enterhaken-Icon zeigt überwiegend ein Seilknäuel mit Karabiner. Hakenkopf als Hauptsilhouette ergänzen; vom separaten Ninja-Seil-Werkzeug unterscheiden.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 68, "y": 65} · Wirkspitze {"x": 120, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert


### pa_112 – Düsenrucksack

Kategorie: utility · stabiler interner Name: jetpack

Beschreibung aktuell: Düsenantrieb, der den Schützen ein mittleres Stück versetzt; das Abgas setzt am Startpunkt alles in Brand.

Daten: Grundwert 0 · Art fire · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special flight · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 70, "element": "fire", "spur": "start", "radius": 36}; elementarer Zusatz: null.

Optische Einzelprüfung: Düsenrucksack ist eindeutig; der Renderer besitzt bereits eine Rücken-Korrektur. Das Animationsblatt zeigt ein fremdes geflügeltes Fluggerät und ist exakt identisch mit Gleitschirm: nicht verwenden.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 61} · Wirkspitze {"x": 108, "y": 61} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_113 – Bohrkanone

Kategorie: utility · stabiler interner Name: bohrkanone

Beschreibung aktuell: Bohrstrahl von der Seite, der einen Tunnel durchs Gelände gräbt.

Daten: Grundwert 30 · Art physical · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special drill_cannon · delivery hitscan.

Effektpfad: {"kind": "drill", "entryRadius": 30, "radius": 14, "steps": 12}; elementarer Zusatz: null.

Optische Einzelprüfung: Bohrkanone guter Bohrkopf. Gehaltene Richtung plausibel; Griffpunkt und Tunnelanfang kontrollieren, klar von Bohrkopfrakete unterscheiden.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 60} · Wirkspitze {"x": 120, "y": 60} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_114 – Gleitschirm

Kategorie: utility · stabiler interner Name: raketenrucksack_mk_iii

Beschreibung aktuell: Schirm, der den Schützen am weitesten versetzt; am Landepunkt gefriert der Boden, mit Nachladezeit.

Daten: Grundwert 0 · Art ice · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 3 (tatsächliche Zuteilung über Munitionsklassen) · special flight · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 160, "element": "ice", "spur": "ziel", "radius": 56}; elementarer Zusatz: null.

Optische Einzelprüfung: Gleitschirm als Schirm lesbar. Animationsblatt ist bytegleich zum Düsenrucksack und zeigt keinen Schirm; neues Referenzblatt nötig.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 66, "y": 58} · Wirkspitze {"x": 108, "y": 58} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_115 – Wächterstatue

Kategorie: utility · stabiler interner Name: wachterstatue

Beschreibung aktuell: Statue, die den Schützen heilt.

Daten: Grundwert 0 · Art defense · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special guardian · delivery hitscan.

Effektpfad: {"kind": "heal", "amount": 35}; elementarer Zusatz: null.

Optische Einzelprüfung: Wächterstatue als Giraffenstatue eigenständig und humorvoll. Aktuelle Funktion ist Heilung; Wirkung oder Bezeichnung verständlich verbinden. Animation referenznah, aber wenig echte Bewegung.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 71} · Wirkspitze {"x": 98, "y": 38} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_116 – Blutritual

Kategorie: utility · stabiler interner Name: blutritual

Beschreibung aktuell: Dunkles Ritual, das den Schützen heilt.

Daten: Grundwert 50 · Art dark · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special blood_ritual · delivery hitscan.

Effektpfad: {"kind": "heal", "amount": 60}; elementarer Zusatz: null.

Optische Einzelprüfung: Blutritual als gerahmtes Handsymbol, Handbild bereits besser freigestellt. Tatsächliche Heilung kenntlich machen, keine ungeprüfte Opfer-/Lebensdiebstahlmechanik versprechen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 62} · Wirkspitze {"x": 119, "y": 48} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_117 – Ananasbombe

Kategorie: utility · stabiler interner Name: ananasbombe

Beschreibung aktuell: Ananasförmige Granate, die das getroffene Ziel unmittelbar sprengt.

Daten: Grundwert 48 · Art explosive · Radius 45 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special fragmentation · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Ananasbombe gute ausgefallene Granatensilhouette. Richtungs-/Handrolle für Wurfobjekt prüfen; der special-Name fragmentation ist kein Nachweis realer Splittergeschosse.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 64} · Wirkspitze {"x": 120, "y": 71} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_118 – Feuerwesen

Kategorie: utility · stabiler interner Name: feuerwesen

Beschreibung aktuell: Feuerwesen, das den getroffenen Gegner in Brand setzt.

Daten: Grundwert 46 · Art fire · Radius 42 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special fire_minion · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 20, "turns": 3}.

Optische Einzelprüfung: Feuerwesen wirkt als vollständiger Kämpfer mit Bodenplatte. Menü-Icon mit weißem Resthintergrund; Animationsblatt verändert Material und Körperform stark.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 63} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_119 – Munitionskiste

Kategorie: utility · stabiler interner Name: munitionskiste

Beschreibung aktuell: Kiste, die die Munition des Schützen auffüllt.

Daten: Grundwert 0 · Art utility · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special ammo_drop · delivery hitscan.

Effektpfad: {"kind": "ammo", "amount": 2}; elementarer Zusatz: null.

Optische Einzelprüfung: Munitionskiste als geöffnete Kiste gut erkennbar. Als Selbstwirkung Gegenstand/Anwendungsanimation vorsehen; große Detailfülle im HUD reduzieren.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 67, "y": 65} · Wirkspitze {"x": 120, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_120 – Energiefaust

Kategorie: utility · stabiler interner Name: energiefaust

Beschreibung aktuell: Energiestoß, der unmittelbar trifft, Schilde schwächt und freie Sicht braucht.

Daten: Grundwert 48 · Art energy · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special energy_fist · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Energiefaust gut lesbar und individuell. Handmotiv zeigt Faust links, der Wirkmarker liegt rechts am Anbau: Angriffsseite semantisch prüfen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 71, "y": 60} · Wirkspitze {"x": 120, "y": 60} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_121 – Raketenfaust

Kategorie: tech · stabiler interner Name: explosiver_punch

Beschreibung aktuell: Faustschlag mit Raketenantrieb, der das getroffene Ziel unmittelbar trifft.

Daten: Grundwert 58 · Art explosive · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special rocket_punch · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Raketenfaust mit Clownsgesicht einprägsam. Handbild zeigt Boxkopf links und Feder rechts, Wirkmarker am Federende: Kraft-/Kontaktpunkt verkehrt. Animation erhält Motiv, aber Achse prüfen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 28, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_122 – Endlosschleife

Kategorie: tech · stabiler interner Name: infinity_loop

Beschreibung aktuell: Zeitschleife, die die Munition des Schützen auffüllt.

Daten: Grundwert 0 · Art time · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special loop · delivery hitscan.

Effektpfad: {"kind": "ammo", "amount": 3}; elementarer Zusatz: null.

Optische Einzelprüfung: Endlosschleife als Unendlichkeitszeichen klar. Animationsblatt verwandelt es überwiegend in ein rosa geflügeltes Wesen; eigene Glyphenanimation nötig. Mechanisch Munition, keine Zeitrücksetzung.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_123 – Magnetkanone

Kategorie: tech · stabiler interner Name: magnetkanone

Beschreibung aktuell: Magnet, der den getroffenen Gegner zum Schützen heranzieht.

Daten: Grundwert 40 · Art magnetic · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special magnetism · delivery hitscan.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Magnetkanone zeigt einen Hufeisenmagneten. Pole und Zugrichtung als Funktionspunkte definieren; nicht generischen Mündungsanker an der rechten Außenkante benutzen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 60, "y": 69} · Wirkspitze {"x": 120, "y": 69} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_124 – Wachgeschütz

Kategorie: tech · stabiler interner Name: auto_turret

Beschreibung aktuell: Stellt ein Geschütz auf, das in den folgenden Runden von selbst feuert.

Daten: Grundwert 38 · Art electric · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special auto_target · delivery projectile.

Effektpfad: {"kind": "turret", "damage": 23, "range": 797, "turns": 3}; elementarer Zusatz: null.

Optische Einzelprüfung: Wachgeschütz guter Turm auf Standfuß. Nicht als gehaltene Miniatur vor dem Körper inszenieren; Aufstellobjekt und Schussanimation trennen. Mechanischer Turret-Effekt vorhanden.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 56, "y": 64} · Wirkspitze {"x": 106, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_125 – Nachschubkiste

Kategorie: tech · stabiler interner Name: versorgungscontainer

Beschreibung aktuell: Abwurf, der die Munition des Schützen auffüllt.

Daten: Grundwert 0 · Art utility · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special supply_drop · delivery hitscan.

Effektpfad: {"kind": "ammo", "amount": 4}; elementarer Zusatz: null.

Optische Einzelprüfung: Nachschubkiste wirkt wie ein orangefarbener Container mit Moos. Vom Munitionsbehälter und Bunker im kleinen Icon über klare Silhouette trennen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 67} · Wirkspitze {"x": 120, "y": 66} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_126 – Bunker

Kategorie: tech · stabiler interner Name: bunker

Beschreibung aktuell: Bunker, der den erlittenen Schaden mindert.

Daten: Grundwert 0 · Art defense · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special bunker · delivery hitscan.

Effektpfad: {"kind": "armor", "reduction": 0.35}; elementarer Zusatz: null.

Optische Einzelprüfung: Bunker als gepanzerter Bau gut. Aktuell Rüstungswirkung auf den Schützen, kein begehbarer Bau; passende Schutzanimation oder Begriffserklärung nötig.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 65} · Wirkspitze {"x": 120, "y": 86} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_127 – Mine

Kategorie: tech · stabiler interner Name: teleport_plattform

Beschreibung aktuell: Wird vor die Füße gelegt oder weiter geworfen, bleibt liegen und ist sofort scharf. Wer sie berührt, löst sie aus, auch du. Selten ein Blindgänger, selten doppelt stark.

Daten: Grundwert 0 · Art spatial · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special mine · delivery hitscan.

Effektpfad: {"kind": "mine"}; elementarer Zusatz: null.

Optische Einzelprüfung: Aktuell Mine, bis Waffenfassung 11 Teleportplattform. Altes Bild kann bewusst wiederverwendet werden, aber Menüzeile/Atlasname/Detail nutzen unterschiedliche Datenstände. Name und Text fassungsabhängig konsistent ausgeben.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 68} · Wirkspitze {"x": 120, "y": 78} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W02/W03: Grundname anders als aktuelle Fassung


### pa_128 – Hologrammportal

Kategorie: tech · stabiler interner Name: hologramm_portal

Beschreibung aktuell: Hologramm, durch das der Schütze an einen anderen Ort springt.

Daten: Grundwert 0 · Art spatial · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special hologram_portal · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Hologrammportal klar als Plattform mit Figur. Das aktuelle Handbild enthält ein fremdes Menschensilhouettenmotiv; beim Anwenden als Welt-/Teleporteffekt statt Ausrüstung halten.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 70} · Wirkspitze {"x": 120, "y": 70} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_129 – Tesla-Turm

Kategorie: tech · stabiler interner Name: tesla_turm

Beschreibung aktuell: Blitz, der auf nahe Gegner überspringt und freie Sicht braucht.

Daten: Grundwert 48 · Art electric · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special chain_lightning · delivery hitscan.

Effektpfad: {"kind": "chain", "range": 240, "jumps": 2, "falloff": 0.6}; elementarer Zusatz: null.

Optische Einzelprüfung: Tesla-Turm gute elektrische Silhouette. Tatsächlich Kettenblitz; eigenes Turmobjekt wird dadurch nicht automatisch aufgestellt. Nutzung als Gerät oder beschworene Säule klar zeigen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 66} · Wirkspitze {"x": 91, "y": 95} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_130 – Tarnnetz

Kategorie: tech · stabiler interner Name: tarnnetz

Beschreibung aktuell: Tarnnetz, das den erlittenen Schaden mindert.

Daten: Grundwert 0 · Art utility · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special camouflage · delivery hitscan.

Effektpfad: {"kind": "armor", "reduction": 0.2}; elementarer Zusatz: null.

Optische Einzelprüfung: Tarnnetz wirkt im Spiel als Rüstungsreduktion. Das ist korrekt im Text beschrieben; Transparenz/Unsichtbarkeit wäre dagegen eine neue Mechanik. Netzauflage statt fliegendem Netzblock.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 64, "y": 62} · Wirkspitze {"x": 120, "y": 62} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_131 – Schlauchboot

Kategorie: tech · stabiler interner Name: schlauchboot

Beschreibung aktuell: Schlauchboot für eine Fahrt, die den Schützen ein Stück versetzt.

Daten: Grundwert 0 · Art utility · Radius 0 · Cooldown 0 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special water_mobility · delivery hitscan.

Effektpfad: {"kind": "move", "distance": 50}; elementarer Zusatz: null.

Optische Einzelprüfung: Schlauchboot gut lesbar, aber als horizontales Handobjekt statt Wasserfahrzeug gezeichnet. Eigenbewegung/Beschwörungsrolle bildlich verständlich machen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 64} · Wirkspitze {"x": 120, "y": 70} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_132 – Alte Dame

Kategorie: tech · stabiler interner Name: alte_dame

Beschreibung aktuell: Erstaunlich schlagkräftige Dame, deren Hieb auch auf große Distanz trifft.

Daten: Grundwert 55 · Art physical · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special old_lady_strike · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Alte Dame im Icon charakterstark. Animationsblatt verwandelt sie ab Frame 1 in ein geflügeltes Wesen; Identität vollständig neu absichern.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 65, "y": 64} · Wirkspitze {"x": 100, "y": 110} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_133 – Fliegendes Superschaf

Kategorie: tech · stabiler interner Name: fliegendes_superschaf

Beschreibung aktuell: Lenkbares Schaf, das sein Ziel verfolgt, im Umkreis explodiert und in Brand setzt.

Daten: Grundwert 60 · Art fire · Radius 40 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special guided_sheep · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 13, "turns": 3}.

Optische Einzelprüfung: Fliegendes Superschaf gut wiedererkennbar; vorhandene Animation eher referenznah. Flügel-/Körperkontinuität und tatsächliche Zielsuche in Bewegung prüfen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 62, "y": 66} · Wirkspitze {"x": 120, "y": 53} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_134 – Luftangriff

Kategorie: tech · stabiler interner Name: luftangriff

Beschreibung aktuell: Bomber, die von oben auf den Zielpunkt niedergehen.

Daten: Grundwert 62 · Art explosive · Radius 0 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special air_strike · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Luftangriff als UI-Schlagmarke passend; Handmotiv enthält abgeschnittene Flugzeuge. Animationsblatt zeigt generische braune Flugkörper statt der gesamten Luftangriffsszene: bewusst auf Geschossrolle beschränken.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 61} · Wirkspitze {"x": 116, "y": 52} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_135 – Meteorregen

Kategorie: tech · stabiler interner Name: meteorregen

Beschreibung aktuell: Meteore, die von oben auf den Zielpunkt niedergehen.

Daten: Grundwert 68 · Art impact · Radius 0 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special meteor_rain · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Meteorregen als Symbol verständlich. Animationsblatt wechselt Meteorgestalt/Leuchtkern; für einzelne Meteorprojektile kontrolliert nutzbar, aber kein Nachweis mehrerer Einschläge.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kachel · Griff {"x": 70, "y": 58} · Wirkspitze {"x": 120, "y": 58} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_136 – Bohrkopfrakete

Kategorie: tech · stabiler interner Name: bohrkopfrakete

Beschreibung aktuell: Rakete mit Bohrkopf, die das getroffene Ziel unmittelbar trifft.

Daten: Grundwert 64 · Art explosive · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special drill_rocket · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Bohrkopfrakete im Handbild mit Bohrkopf links und Wirkmarker am rechten Heck. Korrekte Vorwärtsachse festlegen; eigener animierter Schweif statt mitgezeichneter Rauchfahne.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform objekt · Griff {"x": 29, "y": 67} · Wirkspitze {"x": 120, "y": 64} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_137 – Flammenklinge

Kategorie: tech · stabiler interner Name: flammenklinge

Beschreibung aktuell: Klinge aus Feuer, die unmittelbar trifft und in Brand setzt.

Daten: Grundwert 33 · Art fire · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special flame_blade · delivery hitscan.

Effektpfad: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 15, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 15, "turns": 3}.

Optische Einzelprüfung: Flammenklinge bleibt eine gerahmte Waffenplakette im Handbild. Klinge/Griff extrahieren, Feuer als eigenen Effekt führen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 45, "y": 64} · Wirkspitze {"x": 119, "y": 42} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_138 – Arkanhammer

Kategorie: tech · stabiler interner Name: magischer_kriegshammer

Beschreibung aktuell: Hammer aus arkaner Kraft, der unmittelbar einschlägt und freie Sicht braucht.

Daten: Grundwert 68 · Art arcane · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special magic_hammer · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Arkanhammer mit sichtbarem Rahmen und weißem Menü-Icon-Hintergrund. Das eigentliche Hammerobjekt freistellen und einen Griffanker am Stiel setzen.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 45, "y": 74} · Wirkspitze {"x": 120, "y": 67} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_139 – Höllenkanone

Kategorie: tech · stabiler interner Name: hollenkanone

Beschreibung aktuell: Kanone, deren Feuerstrahl von der Seite einschlägt und in Brand setzt.

Daten: Grundwert 68 · Art fire · Radius 0 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special hell_cannon · delivery hitscan.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 24, "turns": 3}.

Optische Einzelprüfung: Höllenkanone als komplexe Maschine gut, im Handbild schwerer Kopf links und Wirkmarker rechts. Laufmündung von Verzierung unterscheiden; eingebrannte Glut reduzieren.

Verkabelung: hitscan · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 31, "y": 66} · Wirkspitze {"x": 120, "y": 63} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_140 – Quantenkanone

Kategorie: tech · stabiler interner Name: quantenblaster

Beschreibung aktuell: Energieschuss, der ein Ziel durchschlägt und freie Sicht braucht.

Daten: Grundwert 47 · Art energy · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special quantum_blast · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Quantenkanone als großer kantiger Lauf gut, Handbild wirkt frontal mit rechter Wirkmarke am Anbau. Saubere Seitenansicht mit eindeutigem Auslass erzeugen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 29, "y": 65} · Wirkspitze {"x": 120, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W01: Radius 0→24 beim Spawn


### pa_141 – Astralkrieger

Kategorie: ultimate · stabiler interner Name: astralkrieger

Beschreibung aktuell: Beschworener Krieger, der den Standort bewacht und in den folgenden Runden selbst feuert.

Daten: Grundwert 70 · Art astral · Radius 55 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special summon_warrior · delivery projectile.

Effektpfad: {"kind": "turret", "damage": 35, "range": 424, "turns": 3}; elementarer Zusatz: null.

Optische Einzelprüfung: Astralkrieger hat ein gutes beschworenes Rittermotiv; Animationsblatt zeigt völlig fremde einfache blaue Humanoide. Keine automatische Integration. Mechanisch ein aufgestellter Wächter, kein normaler Flugzauber.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 65} · Wirkspitze {"x": 119, "y": 65} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_142 – Leerenritter

Kategorie: ultimate · stabiler interner Name: void_ritter

Beschreibung aktuell: Ritter der Leere, der Gegner zum Schützen heranzieht und verflucht.

Daten: Grundwert 82 · Art void · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special void_knight · delivery projectile.

Effektpfad: {"kind": "pull", "distance": 90}; elementarer Zusatz: null.

Optische Einzelprüfung: Leerenritter starkes dunkles Rittermotiv. Animationsblatt wird zu einem anderen cartoonhaften blauen Zauberer. Vor Neuherstellung nicht aktivieren; aktuelle Zugwirkung und Darstellung getrennt erklären.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 59, "y": 65} · Wirkspitze {"x": 119, "y": 46} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W01: Radius 0→24 beim Spawn; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_143 – Astralross

Kategorie: ultimate · stabiler interner Name: astralross

Beschreibung aktuell: Astralross, das den Schützen weit trägt.

Daten: Grundwert 65 · Art astral · Radius 0 · Cooldown 1 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special summon_mount · delivery projectile.

Effektpfad: {"kind": "mount", "distance": 140}; elementarer Zusatz: null.

Optische Einzelprüfung: Astralross als gepanzertes Pferd lesbar. Animationsblatt enthält stark ausgewaschene Körper und wechselnde Form. Reittier-/Statuswirkung statt generischem Orb in der Hand verständlich zeigen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kompakt · Griff {"x": 63, "y": 60} · Wirkspitze {"x": 109, "y": 58} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_144 – Kosmische Wassermelone

Kategorie: ultimate · stabiler interner Name: kosmische_wassermelone

Beschreibung aktuell: Riesige Frucht, die nach Verzögerung explodiert und in Stücke zerspringt.

Daten: Grundwert 85 · Art explosive · Radius 70 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special cosmic_banana · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kosmische Wassermelone einprägsam. Animationsblatt zeigt fremde geflügelte Tiere statt der Melone. Kleine Menüversion enthält deutlichen Hintergrundrest; eigenes Fruchtprojektil empfohlen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 66, "y": 62} · Wirkspitze {"x": 119, "y": 62} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_145 – Erdspalter

Kategorie: ultimate · stabiler interner Name: erdspalter

Beschreibung aktuell: Spaltet die Erde und reißt einen gewaltigen Krater.

Daten: Grundwert 95 · Art impact · Radius 75 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special earth_splitter · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Erdspalter im Handmotiv teilweise aus der Zelle angeschnitten; Menü-Icon berührt den Rand stark. Bodenriss als Welt-/Einschlageffekt statt gehaltenem Bildmotiv ausarbeiten.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 67} · Wirkspitze {"x": 120, "y": 67} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_146 – Giftige Weltenflasche

Kategorie: ultimate · stabiler interner Name: giftige_weltenflasche

Beschreibung aktuell: Flasche voll Weltengift, die im großen Umkreis vergiftet.

Daten: Grundwert 55 · Art poison · Radius 65 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special world_poison · delivery projectile.

Effektpfad: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 40, "turns": 3}; elementarer Zusatz: {"kind": "damage_over_time", "element": "poison", "damagePerTurn": 40, "turns": 3}.

Optische Einzelprüfung: Giftige Weltenflasche im Icon stark beschädigt/fleckig freigestellt, Umriss berührt viele Kanten. Handbild schief mit enthaltenem Boden: Flasche, Gift und Sockel sauber trennen.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 61, "y": 65} · Wirkspitze {"x": 119, "y": 85} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.


### pa_147 – Weltendrache

Kategorie: ultimate · stabiler interner Name: welten_drache

Beschreibung aktuell: Beschworener Drache, dessen Feuer im großen Umkreis sengt und in Brand setzt.

Daten: Grundwert 100 · Art dragon · Radius 80 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special dragon_ultimate · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: {"kind": "damage_over_time", "element": "fire", "damagePerTurn": 38, "turns": 3}.

Optische Einzelprüfung: Weltendrache im Menüicon mit weißen Fragmenten. Animationsblatt wird zu einem einfachen rosa geflügelten Schwein; Originaldrache muss verbindliche Referenz bleiben.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 66} · Wirkspitze {"x": 120, "y": 54} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen


### pa_148 – Feuerschild

Kategorie: ultimate · stabiler interner Name: himmelswachter

Beschreibung aktuell: Schild aus Glut um den Eigenen: Wer es trifft, geht selbst in Flammen auf.

Daten: Grundwert 70 · Art fire · Radius 60 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special guardian_ultimate · delivery projectile.

Effektpfad: {"kind": "shield", "amount": 75, "gegen": "fire"}; elementarer Zusatz: null.

Optische Einzelprüfung: Feuerschild: Menü-Icon zeigt alten goldblauen Engelswächter, Hand-Sprite einen orangefarbenen Schild, Animationsblatt ein fremdes blaues Tier. Alle drei Rollen auf aktuelles Schildmotiv abstimmen.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 63, "y": 60} · Wirkspitze {"x": 107, "y": 60} · Animationsblatt vorhanden, aber nicht geladen.

Befundzuordnung: W19: Schadensart gegenüber Grundkatalog geändert; W05/W11: Animationsdatei vorhanden, im Produkt nicht geladen; W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_149 – Goldene Reliktkugel

Kategorie: ultimate · stabiler interner Name: goldene_reliktkugel

Beschreibung aktuell: Relikt, das den eigenen Schaden verstärkt.

Daten: Grundwert 78 · Art arcane · Radius 0 · Cooldown 2 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special relic_buff · delivery projectile.

Effektpfad: {"kind": "damage_boost", "multiplier": 1.5}; elementarer Zusatz: null.

Optische Einzelprüfung: Goldene Reliktkugel hat einen ornamental starken Umriss; Menüicon mit weißem Resthintergrund. Tatsächliche Verstärkung statt Schadenszahl erklären; Effektglühen separat.

Verkabelung: Selbstwirkung · Erstaktion angenommen · Spriteform kachel · Griff {"x": 62, "y": 71} · Wirkspitze {"x": 117, "y": 61} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: W09/W14: positive Kennzahl trotz Selbstwirkung


### pa_150 – Kosmischer Kern

Kategorie: ultimate · stabiler interner Name: kosmischer_kern

Beschreibung aktuell: Kern eines Sterns, der gewaltige Zerstörung im großen Umkreis auslöst.

Daten: Grundwert 110 · Art void · Radius 90 · Cooldown 3 · maxAmmo-Katalogwert 5 (tatsächliche Zuteilung über Munitionsklassen) · special cosmic_ultimate · delivery projectile.

Effektpfad: Standardpfad; kein zusätzlicher buildEffect-Effekt; elementarer Zusatz: null.

Optische Einzelprüfung: Kosmischer Kern als Gesamtmotiv sehr detailliert. Menüicon mit weißen Resten und hoher Motivdichte; Kernform als klaren Schwerpunkt erhalten, Nebensymbole reduzieren.

Verkabelung: projectile · Erstaktion angenommen · Spriteform kachel · Griff {"x": 64, "y": 65} · Wirkspitze {"x": 112, "y": 65} · Animationsblatt nicht vorhanden; prozedurale Bewegung möglich.

Befundzuordnung: Kein zusätzlicher automatischer Verdachtsmarker; visuelle Notiz und globalen Funktionspfad beachten.

