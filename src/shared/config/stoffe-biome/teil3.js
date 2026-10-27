/** Materialwerte Teil 3 (Biom-Materialien, siehe docs/biome/material-spezifikation.md). Noch nicht ins Spiel eingebunden. */
export default Object.freeze([
  // Pulverschnee: wie Katalog-Schnee, aber lockerer (leichter abzutragen, kaum Halt, bremst stärker). Textur: schnee.
  {
    key: 'pulverschnee', label: 'Pulverschnee', farbe: [240, 246, 252], muster: 'poroes', glanz: 0.05, textur: 'schnee', kontur: 'keine',
    haerte: 'weich', radius: 1.4, tiefe: 1.2, bruechig: 0, brennbar: false, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.4, kaelte: 0.9 }, bruch: 'rieseln', reibung: 0.9, bremst: 0.5, traegt: true, versinkt: false,
  },
  // Rankgitter: Organik-Technik-Gitter der Alien-Stadt (Biom 17). Dünn, pflanzlich: brennt, ätzbar, bricht in Fasern.
  // Zweifel: Name gibt nur "Gitter aus Ranken" her; keine Textur vorhanden.
  {
    key: 'rankgitter', label: 'Rankgitter', farbe: [88, 120, 76], muster: 'fasern', glanz: 0.1, textur: null, kontur: 'dunkel',
    haerte: 'weich', radius: 1.1, tiefe: 0.9, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.3, aetz: 1.15, nass: 0.9 }, bruch: 'faser', reibung: 0.9, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Raumanker: Brückenanker der Schwebewelt (Biom 11), Raumtechnik. Massiv und stabil wie Metall, leitet, nicht zerstörbar,
  // damit die Brücken halten. Zweifel: Name gibt Zerstörbarkeit nicht her; unzerstörbar wegen der Ankerfunktion gewählt.
  {
    key: 'raumanker', label: 'Raumanker', farbe: [120, 150, 200], muster: 'facetten', glanz: 0.6, textur: null, kontur: 'hell',
    haerte: 'unzerstoerbar', radius: 0, tiefe: 0, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: {}, bruch: 'ganz', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Regolith-Staub: gemeint wie Katalog-Regolith, hier als feinerer Staub; Katalogwerte von regolith übernommen
  // (weich, hitze/nass 0,9), Bewegung wie Sand/Asche (bremst, rau). Eigener Schlüssel, da anderer Name.
  {
    key: 'regolith_staub', label: 'Regolith-Staub', farbe: [128, 122, 134], muster: 'koernig', glanz: 0.05, textur: 'regolith', kontur: 'keine',
    haerte: 'weich', radius: 1.3, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 0.9, nass: 0.9 }, bruch: 'rieseln', reibung: 1.2, bremst: 0.3, traegt: true, versinkt: false,
  },
  // Riff-Kalkstein: Kalkgestein am Riff, härter als Sand, ätzempfindlich (Kalk löst sich in Säure), spröde in Platten.
  // Textur kalkstein.jpg passt.
  {
    key: 'riff_kalkstein', label: 'Riff-Kalkstein', farbe: [214, 206, 184], muster: 'schichten', glanz: 0.1, textur: 'kalkstein', kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.8, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.35 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Risszone: Raumriss im zerbrochenen Zeit-Biom (19). Instabil, weich zu zerstören, bricht schnell; Figuren stehen noch
  // darauf (kein Abgrund, der gehört zu den Fluiden). Zweifel: Name gibt wenig her, Werte angelehnt an "instabiler Boden".
  {
    key: 'risszone', label: 'Risszone', farbe: [96, 70, 120], muster: 'schichten', glanz: 0.2, textur: null, kontur: 'dunkel',
    haerte: 'weich', radius: 1.3, tiefe: 1.1, bruechig: 3, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { wucht: 1.2, strom: 1.2 }, bruch: 'splitter', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Rohrleitungen: Metallrohre der Industriestadt (12). Leiten Strom, Metall, aber hohl und daher nicht unzerstörbar wie
  // die Metallplatte: hart, bricht in Platten, rostet bei Säure/Nässe.
  {
    key: 'rohrleitungen', label: 'Rohrleitungen', farbe: [110, 116, 122], muster: 'platten', glanz: 0.55, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.2, aetz: 1.2 }, bruch: 'platten', reibung: 0.7, bremst: 0, traegt: true, versinkt: false,
  },
  // Rostmetall: korrodiertes Metall, nicht mehr die Metallplatte: zerstörbar, aber hart; leitet noch, rostig also rauer
  // und matter. Säure frisst es stärker. Textur rostmetall.
  {
    key: 'rostmetall', label: 'Rostmetall', farbe: [140, 86, 58], muster: 'platten', glanz: 0.2, textur: 'rostmetall', kontur: 'dunkel',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { aetz: 1.4, nass: 1.1, strom: 1.1 }, bruch: 'platten', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Salzkruste: spröde Kruste, wasserlöslich (nass), bricht in Platten; leichtes Salz ätzt nicht, löst sich aber.
  {
    key: 'salzkruste', label: 'Salzkruste', farbe: [232, 228, 222], muster: 'platten', glanz: 0.25, textur: 'salzkruste', kontur: 'hell',
    haerte: 'normal', radius: 1, tiefe: 0.85, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 1.4, aetz: 1.1 }, bruch: 'platten', reibung: 1, bremst: 0.05, traegt: true, versinkt: false,
  },
  // Sand: Katalogstoff, Werte unverändert; Bewegung laut Spezifikation (Sand bremst, reibung 1,2).
  {
    key: 'sand', label: 'Sand', farbe: [214, 190, 140], muster: 'koernig', glanz: 0.05, textur: 'sand', kontur: 'keine',
    haerte: 'weich', radius: 1.25, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.85, hitze: 0.9 }, bruch: 'rieseln', reibung: 1.2, bremst: 0.3, traegt: true, versinkt: false,
  },
  // Sandstein: verfestigter Sand (Sandsteinmonumente, Biom 5/14): Fels-nah, aber weicher als Fels; Textur sand.jpg
  // meint losen Sand, daher null.
  {
    key: 'sandstein', label: 'Sandstein', farbe: [196, 160, 108], muster: 'schichten', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 0.9, tiefe: 0.75, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.15, nass: 1.05 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Säureablagerungen: Krusten aus Säurerückständen (Alien-Stadt, 17). Spröde, ätzend-stabil: Säure schadet ihnen nicht
  // (aetz 0,6), Wasser löst sie. Zweifel: Name gibt Härte nicht her; mittlere Härte, keine Textur.
  {
    key: 'saeureablagerungen', label: 'Säureablagerungen', farbe: [150, 190, 70], muster: 'poroes', glanz: 0.2, textur: null, kontur: 'dunkel',
    haerte: 'weich', radius: 1.15, tiefe: 1, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 0.6, nass: 1.3 }, bruch: 'rieseln', reibung: 0.9, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Säureboden: Boden aus Säuresumpf/Dschungel (3, 9). Weich wie Erde, durch Säure schon zersetzt (aetz 0,6), bremst
  // wie Schlamm leicht. Kein Fluid, begehbar; versinkt nicht (Treibsand/Schlamm sind eigene Einträge).
  {
    key: 'saeureboden', label: 'Säureboden', farbe: [128, 150, 72], muster: 'koernig', glanz: 0.15, textur: null, kontur: 'dunkel',
    haerte: 'weich', radius: 1.2, tiefe: 1.05, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 0.6, nass: 1.1 }, bruch: 'rieseln', reibung: 0.9, bremst: 0.25, traegt: true, versinkt: false,
  },
  // Schlacke: erstarrte Hüttenrückstände, glasig-poröse Brocken (Textur schlacke). Spröde, hart, schmelzbar bei Hitze.
  {
    key: 'schlacke', label: 'Schlacke', farbe: [78, 66, 62], muster: 'poroes', glanz: 0.3, textur: 'schlacke', kontur: 'dunkel',
    haerte: 'normal', radius: 0.9, tiefe: 0.75, bruechig: 3, brennbar: false, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.2, kaelte: 1.1 }, bruch: 'splitter', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Schnee: Katalogstoff, Werte unverändert; Bewegung: Schnee bremst, mäßig glatt.
  {
    key: 'schnee', label: 'Schnee', farbe: [232, 240, 248], muster: 'poroes', glanz: 0.05, textur: 'schnee', kontur: 'keine',
    haerte: 'weich', radius: 1.35, tiefe: 1.15, bruechig: 0, brennbar: false, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.4, kaelte: 0.9 }, bruch: 'rieseln', reibung: 0.8, bremst: 0.4, traegt: true, versinkt: false,
  },
  // Schrott: Metallabfall, lose und verbeult. Leitet, aber zerstörbar (weicher als Rostmetall wegen Hohlräumen),
  // kantig, rauh. Keine Textur vorhanden.
  {
    key: 'schrott', label: 'Schrott', farbe: [104, 98, 94], muster: 'platten', glanz: 0.35, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.8, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.15, aetz: 1.2 }, bruch: 'splitter', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Schwebende Plattformen: Fragmente der Zeitwelt (19). Fester Fels in der Luft; tragen. Zeitmechanik gehört nicht hierher.
  // Werte wie Fels, etwas brüchiger (Fragmente). Zweifel: Material ungenau, daher Fels als Verwandter.
  {
    key: 'schwebende_plattformen', label: 'Schwebende Plattformen', farbe: [122, 116, 140], muster: 'schichten', glanz: 0.2, textur: null, kontur: 'hell',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.2, kaelte: 0.95 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Schwefelkruste: Vulkanische Kruste (Biom 1), spröde, schmilzt und brennt (Schwefel); wir setzen brennbar, da Schwefel
  // in der Realität brennt. Ätzt nicht selbst. Textur schwefelkruste.
  {
    key: 'schwefelkruste', label: 'Schwefelkruste', farbe: [214, 196, 70], muster: 'platten', glanz: 0.2, textur: 'schwefelkruste', kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.85, bruechig: 2, brennbar: true, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.3, aetz: 1.05 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Seegras: Unterwasserpflanze (Biom 8), kein Fluid. Weich, faserig; brennt nicht unter Wasser, aber als Stoff brennbar,
  // da pflanzlich. Bremst die Figur leicht (Strömung/Halme). Trägt keine Last (Halme).
  {
    key: 'seegras', label: 'Seegras', farbe: [60, 130, 80], muster: 'fasern', glanz: 0.1, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.3, aetz: 1.1 }, bruch: 'faser', reibung: 0.8, bremst: 0.3, traegt: false, versinkt: false,
  },
  // Stabilisatormaterial: stabilisiert die Zeitwelt (19). Technisches Spezialmaterial; Werte wie Metall: leitet, sehr
  // stabil. Zweifel: unzerstörbar gewählt, weil es Stabilisatoren sind, die den Rest halten; Name gibt es nicht her.
  {
    key: 'stabilisatormaterial', label: 'Stabilisatormaterial', farbe: [150, 200, 210], muster: 'facetten', glanz: 0.55, textur: null, kontur: 'hell',
    haerte: 'unzerstoerbar', radius: 0, tiefe: 0, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: {}, bruch: 'ganz', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Stahlbeton: Beton (Katalog) mit Stahlarmierung: etwas härter, leitet über die Stäbe, weniger brüchig als Beton.
  // Textur beton.jpg meint reinen Beton, passt hier als Grundton.
  {
    key: 'stahlbeton', label: 'Stahlbeton', farbe: [130, 132, 132], muster: 'platten', glanz: 0.1, textur: 'beton', kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.5, tiefe: 0.4, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { aetz: 1.1, hitze: 0.95 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Stalaktiten: Tropfstein der Höhle (2). Kalkstein, spröde und dünn, bricht in Splittern, ätzempfindlich.
  {
    key: 'stalaktiten', label: 'Stalaktiten', farbe: [190, 180, 160], muster: 'schichten', glanz: 0.2, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.8, bruechig: 3, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.3, wucht: 1.2 }, bruch: 'splitter', reibung: 0.7, bremst: 0, traegt: true, versinkt: false,
  },
  // Teer: zähe, klebrige Masse (Teergruben), hier als begehbarer Stoff. Weich, brennbar, bremst stark, Figur sinkt nicht
  // (versinkt bleibt Treibsand/Schlamm vorbehalten). Textur teer.
  {
    key: 'teer', label: 'Teer', farbe: [30, 28, 32], muster: 'poroes', glanz: 0.4, textur: 'teer', kontur: 'keine',
    haerte: 'weich', radius: 1.1, tiefe: 1, bruechig: 0, brennbar: true, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.3 }, bruch: 'schmelzen', reibung: 1.3, bremst: 0.6, traegt: true, versinkt: false,
  },
  // Tempelstein: bearbeiteter Stein der Tempel (17), dichter als Fels, Mauerwerk; hart, Platten. Textur tempelstein.
  {
    key: 'tempelstein', label: 'Tempelstein', farbe: [150, 138, 112], muster: 'platten', glanz: 0.1, textur: 'tempelstein', kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.15 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Tiefenfels: Fels der Tiefe (Biom 4); gemeint wie Katalog-Fels, aber dichter: sehr hart. Textur fels (verwandt).
  // Zweifel: Katalogschlüssel "fels" gehört dem normalen Fels; Tiefenfels ist ein eigener Stoff.
  {
    key: 'tiefenfels', label: 'Tiefenfels', farbe: [84, 86, 96], muster: 'schichten', glanz: 0.1, textur: 'fels', kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.5, tiefe: 0.4, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.1, kaelte: 0.95 }, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Tiefseebasalt: Basalt (Katalog) unter Wasser, gleiche Härte; durch Wasser abgeschreckt, nass-unempfindlich.
  {
    key: 'tiefseebasalt', label: 'Tiefseebasalt', farbe: [50, 54, 66], muster: 'schichten', glanz: 0.15, textur: 'basalt', kontur: 'dunkel',
    haerte: 'hart', radius: 0.65, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 0.9, aetz: 1.1 }, bruch: 'splitter', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Tiefseeschlamm: feiner Meeresgrund. Weich, bremst stark, Figur sinkt ein (wie Schlamm). Textur tiefseeschlamm.
  {
    key: 'tiefseeschlamm', label: 'Tiefseeschlamm', farbe: [70, 82, 76], muster: 'poroes', glanz: 0.1, textur: 'tiefseeschlamm', kontur: 'keine',
    haerte: 'weich', radius: 1.3, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.85 }, bruch: 'rieseln', reibung: 1.3, bremst: 0.5, traegt: true, versinkt: true,
  },
  // Totholz & Knochen: Mischung abgestorbenes Holz und Knochen (Biom 5). Werte von Holz (Katalog) übernommen:
  // brennbar, Fasern. Knochen sind spröder, daher leicht brüchig. Textur: null, holz.jpg meint nur das Holz.
  {
    key: 'totholz_knochen', label: 'Totholz & Knochen', farbe: [168, 150, 120], muster: 'fasern', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.9, bruechig: 1, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, nass: 0.9 }, bruch: 'faser', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Traumgestein: Gestein der Schwebewelt (11), Kern der Inseln. Name gibt wenig her: fels-ähnlich, hart, leicht
  // glänzend/traumhaft. Zweifel: Werte von Fels, keine Textur.
  {
    key: 'traumgestein', label: 'Traumgestein', farbe: [170, 140, 200], muster: 'facetten', glanz: 0.4, textur: null, kontur: 'hell',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.1 }, bruch: 'splitter', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Treibsand: Sand, in dem man versinkt (Biom 5): weich wie Sand, bremst stark, versinkt. Textur treibsand.
  {
    key: 'treibsand', label: 'Treibsand', farbe: [200, 174, 120], muster: 'koernig', glanz: 0.05, textur: 'treibsand', kontur: 'keine',
    haerte: 'weich', radius: 1.25, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.85, hitze: 0.9 }, bruch: 'rieseln', reibung: 1.4, bremst: 0.7, traegt: false, versinkt: true,
  },
  // Unterwasserfels: Fels (Katalog) unter Wasser: gleiche Härte und Anfälligkeit wie Fels.
  {
    key: 'unterwasserfels', label: 'Unterwasserfels', farbe: [96, 104, 112], muster: 'schichten', glanz: 0.1, textur: 'fels', kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.2, kaelte: 0.95 }, bruch: 'splitter', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Unterwassersand: Sand (Katalog) am Meeresgrund: gleiche Härte und Anfälligkeit, durch Wasser etwas glatter.
  {
    key: 'unterwassersand', label: 'Unterwassersand', farbe: [196, 182, 140], muster: 'koernig', glanz: 0.05, textur: 'sand', kontur: 'keine',
    haerte: 'weich', radius: 1.25, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.85, hitze: 0.9 }, bruch: 'rieseln', reibung: 1.1, bremst: 0.3, traegt: true, versinkt: false,
  },
  // Verdichteter Sand: fest gepresst, trägt ohne Einsinken. Härter als loser Sand, bremst weniger.
  {
    key: 'verdichteter_sand', label: 'Verdichteter Sand', farbe: [200, 174, 124], muster: 'koernig', glanz: 0.05, textur: 'sand', kontur: 'keine',
    haerte: 'normal', radius: 1, tiefe: 0.9, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.9, hitze: 0.9 }, bruch: 'rieseln', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Versteinerte Wurzeln: Wurzeln zu Stein geworden (Baumriesen, Biom 20): nicht mehr brennbar, hart wie Fels, Fasertextur.
  // Textur: null, versteinertes_holz meint den Stamm, nicht die Wurzeln.
  {
    key: 'versteinerte_wurzeln', label: 'Versteinerte Wurzeln', farbe: [118, 100, 84], muster: 'fasern', glanz: 0.15, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.1 }, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Versteinertes Holz: Holz zu Stein, nicht brennbar, hart; wie die Wurzeln, aber glatter. Textur versteinertes_holz.
  {
    key: 'versteinertes_holz', label: 'Versteinertes Holz', farbe: [132, 108, 86], muster: 'fasern', glanz: 0.2, textur: 'versteinertes_holz', kontur: 'dunkel',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.1 }, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Wasser: als begehbarer, durchdringbarer Stoff gemeint (Fluide stehen anderswo): flacher Wasserboden/Wasserkörper,
  // der nichts trägt, kaum Widerstand gegen Wucht (weich), bremst die Figur stark, leitet Strom, löscht Feuer.
  // Zweifel: Zerstörbarkeit "weich" ist nur Näherung; versinkt true, weil Figuren im Wasser nicht stehen.
  {
    key: 'wasser', label: 'Wasser', farbe: [60, 120, 190], muster: 'poroes', glanz: 0.6, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.4, tiefe: 1.2, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.3, kaelte: 1.2, wucht: 0.8 }, bruch: 'ganz', reibung: 0.5, bremst: 0.6, traegt: false, versinkt: true,
  },
  // Wasserader: Wasserlauf im Höhlenfels (2), als durchdringbarer Stoff: wie Wasser (leitet, bremst), aber schmaler
  // und von Gestein gefasst, daher trägt sie ebenso nicht, versinkt aber nicht (flacher Lauf).
  {
    key: 'wasserader', label: 'Wasserader', farbe: [80, 140, 200], muster: 'schichten', glanz: 0.5, textur: null, kontur: 'dunkel',
    haerte: 'weich', radius: 1.2, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.3, kaelte: 1.2 }, bruch: 'ganz', reibung: 0.4, bremst: 0.4, traegt: true, versinkt: false,
  },
  // Wolkenstein: leichter Stein der Schwebewelt/Himmel (7, 11, 16). Porös, wenig dicht, leicht abzutragen, hell. Textur wolkenstein.
  {
    key: 'wolkenstein', label: 'Wolkenstein', farbe: [226, 230, 240], muster: 'poroes', glanz: 0.15, textur: 'wolkenstein', kontur: 'hell',
    haerte: 'weich', radius: 1.15, tiefe: 1, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.9 }, bruch: 'rieseln', reibung: 0.9, bremst: 0.05, traegt: true, versinkt: false,
  },
  // Wurzeln: lebende Wurzeln (Dschungel, 3, 14): wie Holz (Katalog) faserig und brennbar, etwas weicher und feucht.
  // Zweifel: Katalogschlüssel "holz" bleibt bei Holz; Werte nur angelehnt.
  {
    key: 'wurzeln', label: 'Wurzeln', farbe: [110, 80, 52], muster: 'fasern', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.9, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.2, nass: 0.9 }, bruch: 'faser', reibung: 1, bremst: 0.05, traegt: true, versinkt: false,
  },
  // Zeitkristall: Kristall (Katalog) der Zeitwelt (19): gleiche Härte und Anfälligkeit wie Kristall, sehr brüchig, leitet
  // Energie. Textur kristall, Farbe Katalogstoff-nah. Zweifel: Zeitwirkung gehört nicht hierher.
  {
    key: 'zeitkristall', label: 'Zeitkristall', farbe: [130, 170, 230], muster: 'facetten', glanz: 0.8, textur: 'kristall', kontur: 'hell',
    haerte: 'hart', radius: 0.8, tiefe: 0.6, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.15, aetz: 0.9 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
]);
