# SSOT: Überarbeitete Biome 1–20 (Terrain-System)

**Status:** Vorgabe des Auftraggebers (Patrick Hilf), Stand 2026-10-22. Diese Datei ist die verbindliche Quelle (Single Source of Truth) für Biom-Inhalte. Bei Widerspruch zu Code oder älteren Texten gilt diese Datei; Abweichungen werden als Aufgabe in `MASTERDOTO.md` („Biom-SSOT: Umsetzung") geführt. Es geht um **Terrain**: Monster, Figuren, Items, Loot, Biom-Balancing und Synergielisten gehören nicht in dieses System.

## Leitregeln

1. **Drei Dinge trennen:** *Zerstörung* (Material verschwindet), *Zustandsänderung* (Material wird etwas anderes: Lava → Kruste, Eis → Wasser) und *bloße Wirkung* (Schub, Reflexion, Sicht, Status). Eine Explosion behandelt nicht jedes Material gleich.
2. **Materialschichten:** Deckschicht, tragender Untergrund (Kern), Materialadern und Sondermaterialien sind getrennt. Daraus folgt, was bei einer Explosion verschwindet und was darunter erscheint.
3. **Objekte mit Funktion:** Objekte haben Interaktionen, Zustände, Auslöser (Trigger) und Folgen, nicht nur Namen.
4. **Kartenformen für 2D:** begehbare Flächen, Höhlen, Überhänge, Tunnel, Abgründe, Brücken, Sichtlinien, physikalisch nachvollziehbare Einstürze.
5. **Einheitliche Materialregeln in allen Biomen:** Biome unterscheiden sich durch Zusammensetzung, Sonderobjekte und lokale Trigger, nicht dadurch, dass ein Material je Biom andere Grundeigenschaften bekommt (Metall leitet überall gleich).
6. **Verarbeitungsreihenfolge bei einem Treffer:** zuerst Material und Zustand des Getroffenen bestimmen, danach Schaden, Materialabtrag, Zustandswechsel, Trigger. Beispiel: Explosion bricht Eisdecke → Wasser frei → Wasserstands-Trigger. Keine eigene Zerstörungslogik je Biom.
7. **Nicht pauschal:** Strom wirkt nur über leitfähige, verbundene Materialien und geeignete Flüssigkeiten; Feuer nur auf Brennbares; Säure nur auf säureempfindliche Materialien; Wind verschiebt Leichtes und Flugbahnen, zerstört keinen massiven Fels; im Vakuum und unter Wasser kein gewöhnlicher Flächenbrand.

## Standardreaktionen (für alle 20 Biome)

| Einwirkung | Standardreaktion |
|---|---|
| Feuer | entzündet Brennbares, erzeugt ggf. Rauch, verändert hitzeempfindliche Materialien |
| Explosion | Schaden, Abtrag, Bruchstücke, bei instabilen Strukturen lokaler Einsturz |
| Säure | greift säureempfindliche Materialien an, senkt deren Stabilität |
| Strom | entlang verbundener Leiter und geeigneter Flüssigkeiten |
| Wasser | löscht Brände, verteilt Lösliches, ändert Bodenfeuchte, erzeugt Strömung |
| Kälte | friert Flüssigkeiten, versprödet Material, kann temporäre Eisflächen bilden |
| Mechanik | verschiebt Objekte, Risse, bricht Verbindungen, Einstürze |
| Wind | beeinflusst Leichtes, Flugbahnen, Gase und Partikel |
| Hitze | schmilzt Geeignetes, verdampft Flüssigkeiten, schwächt temperaturabhängige Verbindungen |

Sonderwirkungen je Biom (Laser/Reflexion, Gravitation, Zeitimpuls, Dimensionsimpuls, Magieimpuls, Lichtimpuls, Überdruck, Druckentlastung, Netzwerkreaktion, Raumverschiebung) wirken nur auf **markierte** Objekte und Verbindungen.

## Die 20 Biome

Je Biom: Kern (Idee) · Terraintypen · Objekte/Trigger · Kartenformen.

### 1 Vulkan & Lavafeld
Steile Basaltwände, Lavazungen, Magmakanäle, poröse Asche; Lava ist ein eigenes Gefahrenmedium, keine Bodenart; Kanäle brechen durch Risse/Sprengung/Druck auf; Dampf bei Lava+Wasser; Obsidian spröde; Schwefel setzt Giftgas frei; Kruste bricht wieder auf.
- **Terrain:** Vulkanasche, Basalt, Obsidian, Magmaader, Schlacke, Schwefelkruste.
- **Objekte/Trigger:** Lavaseen, Dampfventile, Druckkessel, Obsidianstelen, Schmiedeöfen, Magmaausbruch-Trigger, Abkühlungs-Trigger.
- **Karten:** Vulkankegel mit Kratern und Höhenstufen; zwei Kampfbereiche über zerstörbare Basaltbrücken; unterirdische Lavakanäle; Aschehänge mit Abrutsch; Basaltwall, dessen Zerstörung einen Lavastrom umleitet.

### 2 Kristallhöhlen
Fels, Kristalladern, Stalaktiten, unterirdische Wasserläufe; Kristalle reflektieren Licht/Energieprojektile; Wasser leitet; Kristallwachstum blockiert nach Verzögerung markierte Risse; Einstürze verschütten.
- **Terrain:** Massiver Fels, Kristallader, Obsidian, Kalkstein, Wasserader, Stalaktiten.
- **Objekte/Trigger:** Leuchtkristalle, Stalaktit-Trigger, Kristallbrücken, unterirdische Seen, Minenloren, Kristallresonatoren, Einsturz-Trigger.
- **Karten:** mehrstöckige Höhle mit Zentralschacht; Kristalllabyrinth; Arena über See mit Stalaktiten; Engstellen mit alternativen Schusslinien; Felsbögen, deren Zerstörung eine Seitenkammer abtrennt.

### 3 Dschungel & Sumpf
Weiches Erdreich, Wurzeln, Ranken, Wasserbecken, morsches Holz, Ruinen; Sumpf bremst; Wurzeln halten Erde zusammen (Hangrutsch bei Verlust); Sporen; Regen verändert Wasserstände.
- **Terrain:** Erde/Humus, Holz/Wurzeln, Pilzgewebe, Fels, Moos, Alienharz, Säureboden.
- **Objekte/Trigger:** Sporenschwämme, Rankenaufzüge, Säurebecken, Tempelbrücken, Wurzelherzen, Insektennester, Wasserstands-Trigger, Wurzelspannungs-Trigger.
- **Karten:** überflutete Ruinen mit tiefer Senke; Wurzeln als Brücken; dichter Dschungel mit Sichtkorridoren; Sumpfbecken mit Dämmen; Ruinenkarte, in der Wurzelverlust Plattformen kippt.

### 4 Eiswüste & Gletscher
Schnee, Firn, Gletschereis, Spalten; rutschig; Eisbrücken brechen; Lawinen; Tauwasser; gefrorene Wasserfälle; Wind.
- **Terrain:** Pulverschnee, Firn, Gletschereis, Massiver Fels, Klareiskristall, Gefrorene Wurzeln.
- **Objekte/Trigger:** Eisbrücken, Lawinenhänge, gefrorene Wasserfälle, Windturbinen, Schneehöhlen, Wetterfahnen, Eisriss-Trigger.
- **Karten:** Gletscherkluft mit Eisbrücken; Plateaus mit Seitenwind; Hang mit Lawine; gefrorene Wasserfälle als Wände; Arena mit dünner Eisdecke über Wasser.

### 5 Wüstendünen
Lose Dünen, Sandstein, Salzkrusten, Treibsand, alte Bauwerke; Wind formt um; Sandstürme; Teergruben; Oasen.
- **Terrain:** Loser Sand, Verdichteter Sand, Sandstein, Salzkruste, Treibsand, Teer, Totholz & Knochen.
- **Objekte/Trigger:** Wanderdünen, Treibsandlöcher, Teergruben, Knochengerippe, Sandsteinmonumente, Oasen, Sandsturm-Trigger.
- **Karten:** offene Dünenkarte mit Felsformationen; Canyon mit einstürzenden Wänden; Treibsandfelder unter Salzkrusten; zwei Oasen; hohe Dünen, die sich abflachen.

### 6 Schrottplatz
Wracks, Rostmetall, kontaminierte Böden, Kabel, Giftfässer; Zerstörung durch Kettenreaktionen; Strom über verbundenes Metall; Rost mindert Belastbarkeit.
- **Terrain:** Kontaminierte Erde, Rostmetall, Intaktes Metall, Holzreste, Giftablagerungen, Teer, Betonreste.
- **Objekte/Trigger:** Schrotthaufen, Giftfässer, Autowracks, Metallplatten, Kran, Schrottpresse, Stromkreis-Trigger, Kontaminations-Trigger.
- **Karten:** Schrottkorridore mit Wrackebenen; zentraler Kran; verknüpfte Metallplattformen unter Strom; rutschender Schrottberg; Pressen und Förderer bewegen Deckung.

### 7 Kristall-Archipel
Schwebende Inseln mit tragenden Kernen und Verbindungen; Zerstörung kann Inselteile abtrennen; Abgründe; Wind; Magnet; Glas rutschig.
- **Terrain:** Erdauflage, Massiver Fels, Kristall, Obsidian, Wolkenstein, Glasplatten, Magnetgestein.
- **Objekte/Trigger:** Schwebende Kristalle, Windturbinen, Glasbrücken, Magnetkräne, Spiegelwände, Observatorien, Wolkenplattformen, Inselbruch-Trigger.
- **Karten:** 3–5 Hauptinseln; zentrale Kristallinsel über Brücken; vertikale Karten mit Windkorridoren; Arena mit tragender Kristallader; Spiegelkristalle.

### 8 Korallenriff
Unterwasser, mehrere Tiefenebenen, Strömung, Seegras, Höhlen, Wracks; Wasser als eigenes Medium (Schussbahnen und Explosionen anders als an Land).
- **Terrain:** Unterwassersand, Koralle, Kalkstein, Seegras, Unterwasserfels, Organische Riffablagerungen, Wasser.
- **Objekte/Trigger:** Korallenstöcke, Unterwasserhöhlen, Sandbänke, Strömungskorridore, Giftanemonen, Schiffswracks, Luftblasenquellen, Riffbruch-Trigger.
- **Karten:** Unterwasser-Canyon; Wrack mit Korallenwänden; Sandbänke mit Strömung; Arena mit absinkendem Sand; Korallenbögen, die Passagen verschließen.

### 9 Pilzwald & Säuresumpf
Riesenpilze, Myzelmatten (Netzwerk, Kaskaden), Sporenkammern, Säurepfützen, Pilzbrücken; Leuchtpilze.
- **Terrain:** Feuchte Erde, Pilzgewebe, Myzelmatte, Holzreste, Säureboden, Fels, Pilzbrücke.
- **Objekte/Trigger:** Riesenpilze, Säurebecken, Myzelnetze, Pilzbrücken, Sporenschwämme, Leuchtpilze, Fruchtkörper-Trigger, Wachstums-Trigger.
- **Karten:** unterirdischer Pilzwald mit Myzelbrücken; Säurebecken mit Pilzstegen; Lichtverhältnisse durch Leuchtpilze; Myzelknoten gezielt trennen; kollabierende organische Plattformen.

### 10 Asteroidenfeld
Asteroiden als Geländeinseln, Regolith, Metalltrümmer, Kristall, Eisadern; Trägheit/geringe Gravitation; Randabbrüche; Gravitationssenken sind Kartenobjekte, kein Material; im Vakuum kein atmosphärischer Flächenbrand.
- **Terrain:** Regolith, Asteroidenbasalt, Metallader, Kristallader, Eisader, Poröser Fels, Metalltrümmer.
- **Objekte/Trigger:** Schwebende Asteroiden, Metalltrümmer, Kristallformationen, Eisadern, Satellitenwracks, Gravitationssenken, Trümmerfeld-Trigger, Asteroidenbruch-Trigger.
- **Karten:** mehrere Asteroiden mit Sprungverbindungen; großer Zentralasteroid + zwei Seiteninseln; Asteroidentunnel mit Kristall; Arena mit Gravitationssenke; Verbindungspunkte trennen Inseln.

### 11 Surreale Schwebewelt
Nicht-euklidisch, aber normale Zerstörungs-/Schwerkraftregeln; definierte Sonderzonen für Positionen/Verbindungen; Glas, Nebel, Portale, Spiegel, Teer.
- **Terrain:** Glas, Massiver Fels, Kristall, Nebelstein, Teer, Giftnebel, Raumanker.
- **Objekte/Trigger:** Glasinseln, Nebelbrücken, Teerseen, Spiegelwände, Schwebende Kristalle, Traumportale, Raumanker-Trigger, Realitätswechsel-Trigger.
- **Karten:** drei Glasinseln mit Portalen; Spiegelarena; Nebellabyrinth mit Lichtquellen; Raumanker für zwei Brücken; gestapelte Plattformen mit zerstörbaren Glasböden.

### 12 Fabrik & Hochhausruine
Beton, Stahlträger, Förderanlagen, Aufzüge, Rohre; tragende und nicht tragende Teile getrennt; lokale Einstürze.
- **Terrain:** Beton, Stahlträger, Metallplatten, Glasfassade, Rohrleitungen, Teer, Kontaminierte Ablagerungen.
- **Objekte/Trigger:** Förderbänder, Giftfässer, Aufzüge, Schrottpressen, Dampfrohre, Generatoren, Trägerbruch-Trigger, Notabschaltungs-Trigger.
- **Karten:** Hochhausquerschnitt mit Etagen; Fabrikhalle; Karte mit gefluteter Unterebene; vertikaler Aufzugsschacht; Gebäudeflügel stürzt bei Trägerverlust.

### 13 Burgfelsen & Magiekristall
Befestigte Felsen, Mauern, Türme, Zugbrücken, Kerker, Magiekristalle (Energiespeicher; wirken nur auf definierte magische/energetische Mechaniken).
- **Terrain:** Burgfelsen, Mauerwerk, Holzaufbauten, Magiekristall, Metallgitter, Erdaufschüttung, Kerkergewölbe.
- **Objekte/Trigger:** Burgmauern, Türme, Kerker, Magiekristalle, Zugbrücken, Fallgitter, Thronsaal, Mauerbruch-Trigger, Kristallüberlastungs-Trigger.
- **Karten:** Burg auf Plateau mit zerstörbarer Hauptbrücke; mehrstöckige Festung; Belagerungskarte; Kristallkammer unter der Burg; asymmetrische Burg mit Turmeinsturz.

### 14 Planet (eine Variante)
**Entscheidung des Auftraggebers (2026-10-26): es gibt nur einen Planeten, nicht sechs.** Die sechs Materialmixe unten sind kein Variantensatz mehr, sondern Vorrat für Zonen dieses einen Planeten; wie sie verteilt werden, ist offen. Im Code existieren noch sechs `planet_*`-Kennungen; sie auf eine zu verringern ändert alte Replays und braucht eine neue Gelände-Fassung (Versionsmarke).

Übergeordnetes System: Eis, Lava, Wüste, Dschungel, Rost, Stein; gleiche technische Grundstruktur, eigener Materialmix und eigene Umwelt; Varianten ergänzen Sonderreaktionen, widersprechen der globalen Matrix nicht.
- **Eis:** Schnee, Firn, Eis, Fels, Kristall · **Lava:** Asche, Basalt, Obsidian, Schlacke, Magmaadern · **Wüste:** Sand, Sandstein, Salzkruste, Teer · **Dschungel:** Humus, Holz, Wurzeln, Pilze, Fels · **Rost:** Rostmetall, Metall, Schrott, Beton, Korrosion · **Stein:** Geröll, Fels, Obsidian, Kristalladern.
- **Objekte je Variante:** Eisbrücken/Lawinenhänge/gefrorene Wasserfälle/Windzonen · Lavaseen/Magmarisse/Dampfventile/Lavarampen · Treibsandlöcher/Wanderdünen/Monumente/Oasen · Rankenaufzüge/Wurzeln/Sporen/Wasserstandsschalter · Metallplatten/Giftfässer/Pressen/korrodierte Träger · Stalaktiten/Kristalle/Geröllhänge/Felsbrücken; dazu Ereignis-Trigger je Variante und Materialwechsel-Trigger.
- **Karten:** eine Planetenkarte (früher: sechs mit gleichem Aufbau); Planet mit mehreren Regionen; Übergangslevel mit zwei Segmenten; Kraterplanet mit Höhenringen; modulare Kartenserie.

### 15 Vulkanische Schlackeschmiede (neu)
Industrieanlage im Vulkan: Förderplattformen, Schmelzöfen, Keramikschilde, Metallkräne, Dampfkammern auf Schlacke und Basalt.
- **Terrain:** Schlacke, Basalt, Metallschienen, Obsidian, Keramik, Dampfkammer, Lavaglas, Bimsstein.
- **Objekte/Trigger:** Förderplattformen, Dampfventile, Metallkräne, Druckkessel, Lavaglaswände, Keramikschilde, Schmelzöfen, Druckanstiegs-Trigger, Förderstau-Trigger.
- **Sonderwirkung:** Überdruck (gerichtete Dampf-/Fragmentwirkung ohne Totalzerstörung).
- **Karten:** mehrstöckige Schmiede über Schmelzkanal; drei Druckkessel steuern Plattformen; Kranschacht; Lavaglas-Labyrinth; Förderstau-Kettenreaktion.

### 16 Kristallines Schwebearchipel (neu)
Schwebende Eis- und Felsinseln, Kristalladern, Windbrücken, Schneedecken, Magnetgestein; Schnee, Eis und Wind dominieren.
- **Terrain:** Schnee, Firn, Eis, Klarer Kristall, Magnetgestein, Glas, Wolkenstein, Massiver Fels.
- **Objekte/Trigger:** Schwebende Kristalle, Windturbinen, Eisbrücken, Magnetkräne, Spiegelwände, Observatorien, Wolkenplattformen, Lawinenauslöser, Inselbruch-Trigger.
- **Karten:** Eisinseln mit Windbrücken; zwei Kristallplateaus mit Eisbrücke; Windkorridore; Schneehang legt Plattform frei; schmelzende Eisverbindungen.

### 17 Bio-Alien-Tempelstadt (neu)
Überwucherte Alien-Stadt, Organik und Technik verschmolzen; Wurzeln tragen Plattformen; Myzel überträgt Zustände.
- **Terrain:** Humus, Tempelstein, Alienharz, Metallplatten, Pilzmyzel, Rankgitter, Säureablagerungen, Organische Tragwurzeln.
- **Objekte/Trigger:** Alien-Totems, Sporenschwämme, Rankenaufzüge, Säurebecken, Generatoren, Wurzelherzen, Insektennester, Bio-Netzwerk-Trigger, Wurzelbruch-Trigger.
- **Sonderwirkung:** Netzwerkreaktion (Verlust eines Myzelknotens trennt nur angeschlossene Verbindungen).
- **Karten:** vertikale Tempelstadt; getrennte Bio- und Technikennetze; Arena auf Wurzelplattformen; Generatoren steuern Türen und Barrieren; unterirdischer Tempel mit Säure und Myzelbrücken.

### 18 Abyssale Tiefsee / Versunkene Alien-Metropole (neu)
Dunkles Unterwassergebiet: Basaltgräben, versunkene Gebäude, Druckkammern, Korallen, Leuchtalgen, Hydrothermalquellen; mehrere Tiefenstufen; Druck nur an definierte Tiefenzonen gebunden.
- **Terrain:** Tiefseeschlamm, Basalt, Koralle, Metall, Leuchtkristall, Hydrothermalablagerungen, Druckkammer, Leuchtalgen.
- **Objekte/Trigger:** Hydrothermalquellen, Versunkene Gebäude, Leuchtalgenfelder, Druckkammern, Alien-Artefakte, Tiefseegräben, Korallenstöcke, Druckentlastungs-Trigger, Lichtausfall-Trigger.
- **Sonderwirkung:** Druckentlastung (gerichtete Wasserbewegung).
- **Karten:** Unterwasserstadt über Graben; hydrothermaler Canyon; Druckkammern fluten Räume; dunkle Ruinenkarte mit Lichtquellen; Tiefenebenen mit Tunneln und Strömungen.

### 19 Dimensionsriss / Zeit-Chaosebene (neu)
Zerbrochene Landschaft aus instabilem Fels, Zeitkristallen, schwebenden Fragmenten und Raumrissen; Schwerpunkt auf zeitabhängigen Zuständen (Plattformen bewegen sich, Oberflächen wechseln, Objekte reagieren verzögert).
- **Terrain:** Instabiler Boden, Massiver Fels, Zeitkristall, Glasfragmente, Metallfragmente, Schwebende Plattformen, Risszone, Stabilisatormaterial.
- **Objekte/Trigger:** Zeitrisse, Schwebende Fragmente, Instabile Plattformen, Portale, Zeitkristalle, Chaospunkte, Stabilisatoren, Zeitablauf-Trigger, Dimensionswechsel-Trigger.
- **Sonderwirkung:** Zeitimpuls, Dimensionsimpuls (nur markierte Objekte/Verbindungen).
- **Karten:** mehrschichtige Fragmentkarte mit Zeitbrücken; zwei Teilkarten über Portal mit wechselndem Ausgang; Zeitkristall stellt Plattform wieder her; instabiles Labyrinth; Stabilisatoren-Arena.

### 20 Versteinerter Kristallwald / Uralter Koloss-Wald (neu)
Versteinerte Baumriesen mit Härtegraden, Kristallzweige (spröde, reflektierend), massive Wurzeln, Moos, mineralische Lichtquellen, Leuchtpilze.
- **Terrain:** Moos, Versteinertes Holz, Kristallader, Kristallblätter, Versteinerte Wurzeln, Massiver Fels, Kolossstamm, Leuchtpilzgewebe.
- **Objekte/Trigger:** Versteinerte Baumriesen, Kristallblätter, Versteinerte Wurzeln, Kolossstämme, Leuchtpilze, Moosfelsen, Kristallformationen, Wurzelbruch-Trigger, Stammsturz-Trigger, Kristallresonanz-Trigger.
- **Sonderwirkung:** Lichtimpuls (aktiviert definierte Kristallflächen).
- **Karten:** Wald mit Schusskorridoren; Arena mit Baumriesen als Deckung; Waldhang mit abstürzenden Stämmen; Wurzellabyrinth; erhöhte Baumplattformen.
