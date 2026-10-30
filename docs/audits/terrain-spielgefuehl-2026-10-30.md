# Audit Terrain, Biom-Optik, Varianten, Spielgefühl und Klang (2026-10-30)

Nur Lesen und Bildsichtung; kein Code, keine Bilder, keine Tests verändert oder gestartet.
Kennzeichnung: **BEFUND** = im Repo belegt (Datei/Zahl genannt), **EINDRUCK** = Bildsichtung, **VORSCHLAG** = meine Empfehlung,
**OFFEN** = nicht geprüft. Gezählt wurde mit kurzen Node-Skripten gegen die Config (Skripte lagen in `/tmp`, nicht im Repo).

## 0. Kurzfassung

1. Die Zahl „567 ähnlich-organische Varianten" und der Begriff „Ausstand/Variantensystem" kommen im Repo nirgends vor (Suche in `docs/`, `MASTERDOTO.md`, `README.md`, `tasks/`, `src/`). Sie ist also keine bestehende Vorgabe, sondern muss erst definiert werden (Abschnitt 3).
2. Varianten gibt es heute nur auf Kulissen- und Biom-Ebene, **nicht auf Material-Ebene**: ein Stoff hat genau eine Farbe und eine Textur.
3. Von den 20 SSOT-Biomen sind im Spiel 14 spielbar (13 Sonderbiome + Planet mit 6 Arten). Die Biome 15 bis 20 haben Bilder (`backdrops-neu`, `biom-objekte`), aber keine Spieldefinition und keinen Code-Verweis.
4. Sichtbarer Hauptmangel (EINDRUCK, Abschnitt 2): Die Geländeoberflächen sehen biomübergreifend ähnlich aus (grau-violettes Tarnmuster); die Unterscheidung tragen fast nur Himmel und Kulisse.
5. 73 von 126 Stoffen kommen in keinem Rezept der Fassung 5/6 vor; 3 Textur-Dateien sind ungenutzt.

## 1. Bestandsaufnahme (BEFUND, gezählt)

### 1.1 Biome

| Größe | Zahl | Quelle |
|---|---|---|
| Biome laut SSOT/Manifest | 20 | `docs/biome-ssot.md`, `docs/biome-manifest.md` |
| Sonderbiome im Spiel (`NEUE_BIOME`, Rezept-IDs) | 19 = 13 + 6 Planetenarten | `config/biome-neu.js` |
| Wählbare Sonderbiome (Fassung 4+) | 14 (13 + `planet`, Art zieht der Seed) | `SONDERBIOM_IDS_FASSUNG_4` |
| Kulissenbiome (klassisch, je 10 Varianten) | 16 | `config/backdrops.js` |
| `SCENERY_BIOMES` gesamt | 35 (13 + 6 + 16) | `config/scenery.js` |
| SSOT-Biome 15 bis 20 mit Spieldefinition | **0** | Kommentar in `stoff-rezepte-material.js` Z. 6-8; `grep` nach Biom-Id in Config ohne Treffer |
| Karten-Vorlagen (Fassung 6) | 11 | `KARTENARTEN` in `config/gelaende.js` |

Wahl: ohne ausdrückliche Wahl zieht der Seed zu 40 % ein Sonderbiom (`SONDER_ANTEIL`), sonst „klassisch". Der klassische Pfad (`biomwahl.js`) kann aus dem Karten-Charakter nur 5 Biome ableiten (`deluge`, `caverns`, `island`, `alpine`, `forest`). Die übrigen 11 Kulissenbiome erreicht man nur durch Auswahl oder über die Leitbiom-Zuordnung je Kartenform (nicht vollständig nachverfolgt, OFFEN).

### 1.2 Stoffe, Texturen, Rezepte

| Größe | Zahl |
|---|---|
| Stoffe im Katalog (`stoffe.js`) | 126 (18 Basis + 108 Biom-Materialien) |
| Stoffe, die in `REZEPTE_MATERIAL` (13 Sonder + 6 Planet) vorkommen | 53 |
| Stoffe ohne Vorkommen dort | 73 (die 16 klassischen Rezepte `ALTE_REZEPTE` nicht mitgezählt, OFFEN ob sie einige nutzen) |
| Häufigste Stoffe in den 19 Rezepten | `fels` 8, `kristall` 6, `obsidian` 5, `holz` 5 |
| Textur-Dateien Stoffe | 15 (`stoff-texturen`, 512 px JPG) + 85 (`stoff-texturen-neu`, 512 px WebP/JPG) = 100 Dateien, 99 Namen |
| In `STOFF_TEXTUR` genutzte Namen | 96; ungenutzt: `hecke`, `kies`, `asche` |
| GPU-Palette | `GPU_STOFFE = min(126, 32)` (`gelaendeGpu.js` Z. 43): auf dem GPU-Pfad haben nur die ersten 32 Stoff-IDs eine Farbe im Shader (laut MASTERDOTO bewusst, Weiche über Grafikstufe; Umsetzung im Renderer dort als „noch nicht gelesen" vermerkt) |
| Textur-Wiederholung | 512 px, per Maske in Weltkoordinaten (`stoffOptik.js` `TEX_MASKE`) |
| Textur-Stärke | `TEX_FARBE` 0,8; `DECKUNG_TEX` 0,94 |

### 1.3 Hintergründe und Objekte

| Ordner | Dateien | Im Code verwendet? |
|---|---|---|
| `backdrops/` | 224 (80 Basis, 144 Stimmung quer + `_h`) = 160 Motive | ja (`kulissenUrls.js`) |
| `backdrops-neu/` | 48 (6 Biome × 4 Stimmungen × quer/hoch) | **nein** (kein Verweis in `src`, `scripts`, `tests`) |
| `biom-objekte/` | 19 Sheets (01 bis 20 ohne 14) | **nein** (nur `scripts/terrain-inventar.mjs`, „noch nicht eingebaut") |
| `terrain-vorlagen/` | 2 | **nein** (Stilreferenz, Inventar-Skript) |
| `planeten-kulisse/` | 9 | ja (`planetenKulisse.js`) |
| `material-texturen/` | 36 (Originale 1024 px, Planeten, Effekte) | Ausgangsmaterial für `stoff-texturen` |

Die automatische Kulissenwahl nimmt nie eine Stimmung (`biomwahl.js` `kulisseFuerBiom`: Pool = Varianten ohne `stimmung`), also 5 Motive je Biom = 80 in der Auto-Wahl. Hochformat-Fassungen entstehen nur bei Stimmungsbildern bzw. per `fileHoch`.

### 1.4 Wie viel Varianz entsteht heute

- Theoretische Looks aus Himmel × Wasser × Boden-Variante je Szenerie-Biom, summiert über alle 35 Biome: **1969** (Skript über `SCENERY_BIOMES`). Das ist eine Obergrenze der Konfigurationsmöglichkeiten, nicht der sichtbar verschiedenen Bilder; viele Einträge unterscheiden sich nur in Farbwerten.
- Dazu 11 Kartenvorlagen und die Seed-Rauschfelder der Stoffkarte (Adern, Plattenstreifen). Die Kombination Karte × Szenerie wird nicht als Katalog geführt; eine Zahl wie „567" lässt sich daraus nicht ableiten.
- Auf Materialebene: **keine** Variantenwahl. `STOFF_TEXTUR` ist 1:1 (Stoff → Datei), die Farbe ist fest (`farbe` im Katalog, z. B. Kristall `[104,84,170]`). Zwei Karten desselben Bioms unterscheiden sich in Form und Ader-Verteilung, nicht im Material-Aussehen.

## 2. Bildsichtung (EINDRUCK, mit Bild-Tool angesehen)

Umfang ehrlich: 5 Bilder einzeln in voller Größe (Terrain-Vorlage 1, Kontaktbogen, `planet_stein_spiel`, `duenen_spiel`, `eiswueste_spiel`) plus 11 Kontaktbögen aus `/tmp` mit zusammen rund 215 Einzelbildern: 15 Stoff-Texturen, 85 neue Stoff-Texturen (3 Bögen), 20 Spielbilder je Biom, 19 Objekt-Sheets, 12 neue Kulissen, 9 Planeten-Kulissen, 16 Basis-Kulissen (je eine pro Biom), 12 Stimmungs-Kulissen, 8 Nahttests (2×2-Kacheln). **Nicht gesehen:** `terrain-kacheln-vorlage-2`, die 21 Dateien von `material-texturen` (nur Naht-Statistik), die `_h`-Hochformate, rund 130 der 160 Kulissen. Die Spielbilder stammen vom 2026-10-29 (`docs/bilder/biome-realistisch`); ob der aktuelle Code noch genauso aussieht, ist nicht geprüft (OFFEN).

**Alle 20 Biome je ein Bild** (die 20 `*_spiel.jpg`: burg, dschungel, duenen, eiswueste, fabrik, kosmos, kristallhoehle, pilzwald, planet, 6 Planetenarten, riff, schrott, schwebinseln, surreal, vulkan). Die Biome 15 bis 20 gibt es nur als Kulissen (`backdrops-neu`, 12 Bilder gesehen) und Objekt-Sheets, nicht als Spielbild.

| Thema | Eindruck |
|---|---|
| Wiedererkennbarkeit Gelände | Schwach. Das Tarnmuster aus grauem Fels mit violetten, schraffierten Flecken (Kristall) taucht in Burg, Kosmos, Kristallhöhle, Schwebinseln, Surreal, Eiswüste und fast allen Planetenarten auf. Bei den sechs Planetenarten ist das Gelände kaum zu unterscheiden; Lava, Eis, Rost, Sand und Stein erkennt man am Himmelskörper im Hintergrund, nicht am Boden. Klar eigenständig wirken Riff (rosa) und Dschungel (leuchtend grüne Kante). |
| Organik | Die Oberflächen wirken zusammengesetzt (Foto-Textur × Farbe × Raster), nicht gewachsen. Die Deckschicht-Lippe (Gras, Schnee, Sand) ist dünn bis nicht erkennbar; Eiswüste zeigt an der Kante eine weiße Linie, aber keinen Schneeüberhang. |
| Stilbruch Texturen | Die 15 alten Texturen sind überwiegend fotorealistisch/gerendert (Lava-Steine, bröckelnder Putz, Kohle) und teils unscharf hochskaliert (Pilz: violettes Netz mit verwaschenen grünen Flecken). Die 85 neuen sind Comic-Texturen mit Konturlinien. Beide Sets sind gemischt im Einsatz; im Spielbild (Dünen) mischen sich zudem Foto-Kies und weiße Flecken. |
| Stil der Vorlage | `terrain-kacheln-vorlage-1` zeigt den gewünschten Comic-Stil (dicke Kontur, Nieten, Gras-Kante). Sie enthält KI-Beschriftungsfehler („Graw", „Rrow", „Deser4"); als Stilreferenz brauchbar, als Datei nicht. Die neuen Texturen treffen diesen Stil teilweise, das Gelände im Spiel nicht. |
| Nähte (Sicht) | Sichtbar in `moos.jpg` (Draufsicht-Wiese mit Baumkronen, Vignette: bildet beim Kacheln ein Punktegitter), `rostmetall.jpg` (dunkle Randlinien), leicht bei `alienharz.jpg`, `schwefelkruste.jpg`, `firn.jpg`. `keramik`, `metall` sind Plattenmuster mit gewollten Fugen; `kristall` ist ein Fehlalarm der Statistik. |
| Nähte (Statistik) | Heuristik (Kantensprung im Wrap gegenüber mittlerem Nachbarsprung, `scripts` nicht im Repo): Median 1,10 bei den 15 alten, 1,50 bei den 85 neuen; Verhältnis über 3 bei 16 der 85 neuen (nur ein Hinweis, Sichtprüfung bestätigte 2 klar, 3 leicht). |
| Wiederholung | Bei 512 px Periode und Karten ab etwa 1280 px Breite wiederholt sich jede Textur mindestens zweimal. Große Einzelmotive (Moos-Wiese, Pilzgeflecht, Fliesen mit Rissen) fallen dadurch auf. Im Dünen-Spielbild ist die Wiederholung wegen des unruhigen Fotomusters kaum zu sehen. |
| Kulissen | Hohe Qualität, aber Stil gemischt: Foto, Cartoon, Gemälde, Schwarzweiß (Noir) je nach Biom. `dunkel`-Stimmungen sind teils fast schwarze Silhouettenbänder (3 von 4 gesehene). `backdrops-neu` sind einheitlich im Stil und dichter an der Atmosphäre als die alten Kulissen. |
| Prozedurale Kulisse im Spiel | Die Spielbilder zeigen flache Vektor-Hügelketten mit Palmen und Tannen. In Eiswüste sind Palmen zu sehen (EINDRUCK). MASTERDOTO nennt eine Korrektur der Kammformen (`kammArt`); ob das Bild vor oder nach dieser Korrektur entstand, ist offen. |
| Objekt-Sheets | Isometrische Pixel-Art (Würfelfelsen, Brücken, Windräder), das Spiel ist eine Seitenansicht. Rund ein Fünftel der Zellen sind nahezu identische graue Felsblöcke (Platzhalter). Als Biom-Objekte nicht ohne Neuzeichnung nutzbar (EINDRUCK). |
| Planeten-Kulisse | Die Kugeln sind rau texturiert, wirken im Spiel stimmig; als Einzelbilder auf Weiß mit Leuchtrand. Wirkt unterscheidbar (Blau, Grün, Rot, Orange). |

## 3. Was „567 Varianten / Variantensystem" konkret heißen kann (ehrliche Einordnung)

- **BEFUND:** Weder Zahl noch Begriff existieren im Repo. Aus den vorhandenen Zahlen (20 Biome, 126 Stoffe, 11 Karten, 160 Kulissen) ergibt sich 567 nicht als Produkt oder Summe ohne willkürliche Annahme (567 = 7 × 81; 126 × 4,5; 20 × 28,35).
- **Sinnvolle Lesarten:**
  1. 567 handgemachte Textur-Dateien: nicht umsetzbar im Sinn von „organisch", Kosten und Stilkonsistenz (die 85 vorhandenen Texturen entstanden per KI und haben schon Stilbruch/Nähte).
  2. 567 **kombinatorische Looks**, erzeugt aus wenigen Bausteinen: Biom × Stoffrolle (Deck/Kern/Ader) × Variantenachsen (Textur-Alternative, Farbverschiebung, Maßstab, Spiegelung, Kantenprofil). Das ist machbar und die einzige realistische Lesart.
  3. 567 **wahrnehmbar verschiedene** Looks: unrealistisch. Mehr als einige Dutzend Gelände-Looks unterscheidet ein Spieler im laufenden Spiel nicht; dafür ist die Zahl der Achsen wichtiger als die Kopfzahl.
- **VORSCHLAG:** Den Auftraggeber um eine Definition bitten (Zähleinheit und Akzeptanztest, z. B. „je Biom mindestens N unterscheidbare Gelände-Looks pro Seed, Prüfung per Kontaktbogen"), statt 567 als Ziel zu übernehmen.

## 4. Verbesserungen (priorisiert)

Determinismus-Regeln: `src/engine` und `src/shared` ohne `Math.random`/`Date.now`; Regeln, die alte Replays verändern, brauchen eine Versionsmarke (`AGENTS.md` §2). Hinweis auf einen Zielkonflikt: `MASTERDOTO.md` (Biom-SSOT, Stand 2026-10-27) hält fest, dass wegen fehlender Aufzeichnungen im Umlauf neue Regeländerungen keine neue Marke mehr brauchen; `AGENTS.md` verlangt sie weiter. **VORSCHLAG:** Marke trotzdem setzen (kostet eine Konstante, `GELAENDE_*` nach Muster in `gelaende.js`), bis der Auftraggeber `AGENTS.md` ausdrücklich ändert.

Kategorien: **C** = nur Client (Darstellung, kein Einfluss auf Maske/Hash/Replay), **S** = berührt `src/shared`/Stoffkarte (Hash, Marke nötig). Aufwand S/M/L, Nutzen und Risiko grob (VORSCHLAG, nicht gemessen).

| # | Maßnahme | Art | Aufwand | Nutzen | Risiko Determinismus |
|---|---|---|---|---|---|
| 1 | **Nähte beheben** für `moos`, `rostmetall`, `alienharz`, `schwefelkruste`, `firn` (neu erzeugen oder per Offset-Blend nahtlos machen) und Naht-Test als Skript (Kantenverhältnis), damit neue Texturen geprüft eingehen | C | S | mittel | keins |
| 2 | **Unterscheidbarkeit der Gelände je Biom**: Kristall-Violett und Grau-Fels aus Biomen herausnehmen, wo sie nicht Leitmaterial sind; je Biom 1 dominante Deckfarbe plus 1 Kontrastader festlegen. Erst als Kontaktbogen-Test (je Biom 3 Seeds), dann Rezepte ändern | S (Rezepte) | M | **hoch** | Stoffkarte und `stoffHash` ändern sich: Marke `config.gelaende` 7 nötig; Maske bleibt gleich (wie Fassung 5) |
| 3 | **Material-Varianten (Kern des Variantensystems), nur Client**: je Stoff 1 bis k Textur-Alternativen plus Farbverschiebung/Maßstab/Spiegelung; Wahl aus Seed über einen Client-Zweig, der nur die Anzeige trägt (kein Eintrag in Maske/Hash). Zwei Clients mit gleichem Seed müssen dasselbe sehen: Zufall aus festem Hash von (Seed, Stoff-Id, Zellblock), nicht aus Wanduhr | C | M | hoch | niedrig, solange nichts in `shared` oder `engine` fließt; Test: gleicher Seed ergibt gleiche Variantenwahl |
| 4 | **Übergänge statt harter Kanten**: Mischzone zwischen Deck und Kern, Lippe/Überhang an der Oberkante (Gras, Schnee, Sand), unregelmäßige Kontur. In MASTERDOTO als offen geführt („Konturlinien an Materialgrenzen, Deckschicht-Lippe") | C | M | hoch (größter Eindruckshebel für „organischer") | keins |
| 5 | **Texturstil vereinheitlichen**: 15 Foto-Texturen durch Comic-Fassung im Stil der 85 neuen ersetzen (alte Namen behalten, damit Rezepte gleich bleiben); Pilz-Textur neu (unscharf) | C | M | mittel | keins |
| 6 | **Biome 15 bis 20 spielbar machen**: Definitionen in `biome-neu.js`/Themen, Rezepte, `backdrops-neu` einbinden. Entscheidung des Auftraggebers nötig (Menü, Wahrscheinlichkeit im Seed-Zweig) | S | L | hoch (6 neue Looks, Bilder vorhanden) | Biomziehung ändert Seeds: neue Fassung `GELAENDE_*` mit Marke zwingend, sonst ändern sich Karten bestehender Seeds |
| 7 | **Ungenutzte Bestände klären**: 73 nicht gerezeptete Stoffe, `biom-objekte` (isometrisch, passt nicht zur Seitenansicht), `terrain-vorlagen`: entweder verdrahten oder als Referenz kennzeichnen. Keine Löschung ohne Freigabe | – | S | niedrig | keins |
| 8 | **Kulissen**: Stil je Biom vereinheitlichen (Noir-Schwarzweiß, Foto-Hyperrealismus neben Cartoon), `dunkel`-Bänder aufhellen oder mit Horizontdetail versehen; Kammformen der prozeduralen Kulisse biomgerecht (keine Palmen in Eis) prüfen | C | M | mittel | keins |
| 9 | **Vergleichswerkzeug**: Skript, das je Biom N Seeds rendert und einen Kontaktbogen schreibt (Grundlage jeder Optik-Abnahme; vorhanden ist nur ein manuell erstellter Bogen) | C/Tools | S | hoch (macht „besser unterscheidbar" prüfbar) | keins |

Reihenfolge: 9, 1, 4, 3, 5, danach 2 und 6 (beide brauchen Marke und Freigabe). 3 und 4 liefern ohne Replay-Risiko den größten sichtbaren Sprung.

## 5. Spielgefühl (Reaktionszeit, Flow)

**BEFUND (Konfiguration):** Zugzeit 30 s im Duell, 20 s zu viert (`turnTimers`); Zugpause 3 s plus Schuss-Wiederholung 2 s (`turnPauseSeconds`, `turnReplaySeconds`, `config/match.js`); Rückzug nach dem Schuss 5 s (`ZUGREGELN`); Simulation 60 Hz; Pause lässt sich vorzeitig beenden (nur der Spieler, der dran ist, `gameServer.js` Z. 976). Der Client sagt den eigenen Schuss voraus (`shotPrediction.js`, Rollback auf Serverwahrheit); der Kommentar dort rechnet mit rund 120 ms plus bis zu 50 ms Snapshot-Takt bei 60 ms Latenz (Rechnung im Code, nicht gemessen). Rückmeldung bei Treffern liegt in `gefuehl.js` (Zucken, Blitz, Ruck, aus dem Zustand abgeleitet; Richtung des Treffers fehlt laut Kommentar), dazu Schadenszahlen, Kameraregie (`kameraRegie.js`).

**OFFEN:** Es gibt keine Messung der Eingabe-bis-Bild-Zeit im echten Spiel und keine Spielerprobe; „Reaktionszeit" ist für ein rundenbasiertes Spiel zunächst die Rückmeldung auf Eingaben (Zielen, Aufladen, Feuer) und die Totzeit zwischen Zügen. Für die Totzeit ist nur die Konfiguration belegt (bis 5 s pro Zug ohne Eingriff).

| # | VORSCHLAG | Art | Aufwand | Nutzen | Risiko Determinismus |
|---|---|---|---|---|---|
| G1 | Erst messen: Eingabe-zu-Bild (Zielen, Feuer) lokal und online mit Latenzsimulation; Totzeit je Zug in einem Probematch protokollieren. Ohne Messung keine Abstimmung | Tools | S | hoch | keins |
| G2 | Totzeit senken: Schuss-Wiederholung (2 s) überspringbar machen und Zugpause nur zeigen, wenn jemand etwas zu sehen hat; Standard prüfen | Regel/Server | S bis M | hoch für Flow | Zugablauf liegt im Server/Match: Zugregel-Fassung mit Marke (`ZUGREGELN_*`) nötig, wenn Takte sich ändern |
| G3 | Treffer-Rückmeldung verstärken, nur Client: kurzer Hitstop (wenige Frames Kamera/Partikel, nicht Simulation), Kameraschub in Einschlagrichtung (Richtung ist aus dem Ereignis `explosion`/Einschlag bekannt), Schadenszahlen größer bei großem Anteil | C | S bis M | mittel bis hoch | keins, solange die Simulation nicht angehalten wird |
| G4 | Ziel- und Ladeanzeige (Vorschaubahn, Kraftanzeige) auf Lesbarkeit prüfen; Tastaturwege für Winkel/Kraft in Feinschritten | C | S | mittel | keins |
| G5 | Sicht-Fokus nach dem Schuss: Kamera folgt Geschoss, dann Einschlag, dann nächste Figur ohne Wartezeit (vorhanden, Feinabstimmung messen) | C | M | mittel | keins |

## 6. Klang

**BEFUND:**
- Alle Effekte werden zur Laufzeit synthetisiert (WebAudio, `klangSynth.js`, `klangProfile.js`): 72 Profile (`ALLE_PROFILE`), davon 56 Ereignisprofile und 16 Schussprofile, 8 Waffenkategorien, bis 24 Stimmen, Hall 1,4 s, Räumlichkeit (Pan, Pegel, Tiefpass, Verzögerung nach Bildposition). Die Synthese nutzt `Math.random` als Vorgabe (nur Client; zulässig, da nicht `src/engine`/`src/shared`).
- Einschlag-Klang unterscheidet nur Wasser, Metall, Fels, Erde und die Schadensart (`einschlagProfil`): **126 Stoffe laufen auf 4 Materialklänge** hinaus; Biom, Eis, Glas, Kristall, Sand, Holz, Schlamm, Beton klingen nicht eigen (Ausnahme Schadensart-Färbungen wie Feuer/Eis/Gift als Explosion).
- Keine biomabhängige Klangkulisse (Wind, Wasser, Höhle, Vulkan): die Suche in den Klangmodulen nach Biom/Ambient ergab nichts; `AMBIENT_KINDS` in `scenery.js` ist rein visuell. (Eine vollständige Suche in allen Client-Dateien habe ich nicht gemacht.)
- Musik: 3 Stücke (75,9 s / 90,7 s / 84,7 s, Stimmung menu/match/intensiv), dazu 9 Fraktionshymnen von etwa 30 bis 72 s, nur im Fraktionsmenü (`musik.js`, `manifest.json`). Ducken bei Einschlägen 6 dB. Keine Biom-Zuordnung der Musik. Bei langen Partien wiederholen sich 3 Stücke.
- Es existieren Spektrogramme und Pegelprüfungen (`docs/klang/`, kein Clipping bei 24 und 48 Stimmen laut `auswertung.json`).

**OFFEN:** Ich habe nichts gehört. Spektren und Pegel sagen nichts über Klangqualität aus (Projektregel §6.4). „Bessere Sounds" lässt sich nur per Hörprobe durch den Auftraggeber bewerten.

| # | VORSCHLAG | Art | Aufwand | Nutzen | Risiko Determinismus |
|---|---|---|---|---|---|
| K1 | Einschlagklang nach Materialfamilie erweitern (Sand/Schnee dumpf, Eis/Glas/Kristall klirrend, Holz splittrig, Schlamm/Wasser nass, Beton hart), über eine Tabelle Stoff → Klangfamilie statt `if` je Biom; neue Profile in `klangProfile.js` | C | M | hoch | keins; Zuordnung aus dem bereits gemeldeten Stoffschlüssel (`stoffSchluesselAmEinschlag`), keine Engine-Änderung |
| K2 | Biom-Ambiente als leise Schleifen (Wind, Lavablubbern, Tropfen, Insekten, Unterwasserdruck) auf Bus `umgebung`; Auswahl aus der Biom-Kennung der Szenerie, Zufallsanteile nur im Client | C | M | hoch für Atmosphäre | keins |
| K3 | Musik je Stimmung/Biom: weitere Stücke oder Layer (ruhig/intensiv nach Rundenstand bzw. Valhalla), Manifest-Feld `biom`; Rechte und Urheber sind beim Auftraggeber (`CREDITS.md`) | C | M | mittel | keins |
| K4 | Hörabnahme als festen Schritt aufnehmen (kurze Liste: je Waffenkategorie, je Materialfamilie, je Biom-Ambiente) mit Notizfeld; Messwerte bleiben Zusatz | Prozess | S | hoch | keins |

## 7. Offene Fragen an den Auftraggeber

1. Definition und Zähleinheit von „567" und „Ausstand" (Abschnitt 3).
2. Biome 15 bis 20 spielbar machen, in welcher Priorität; Stil der Objekte (isometrische Sheets vs. Seitenansicht).
3. `AGENTS.md` §2 gegen die MASTERDOTO-Aussage „keine Marken mehr nötig" abgleichen.
4. Hörprobe und Spielerprobe: Wer nimmt sie ab, mit welchen Kriterien?

## 8. Einschränkungen dieses Audits

- Keine Tests, kein Build, kein Browserlauf; Aussagen zu Zahlen stammen aus Config-Import per Node, Aussagen zu Bildern aus Sichtung der oben genannten Dateien.
- Die Naht-Heuristik ist ein Hinweis, kein Beweis. Sichtprüfung nur an 8 Kacheln.
- Spielgefühl und Klang sind aus Code und Doku gelesen, nicht erlebt.
