/**
 * Materialwerte Teil 2 (Biom-Materialien, siehe docs/biome/material-spezifikation.md).
 * Noch nicht ins Spiel eingebunden. Katalogstoffe (Koralle, Kristall, Magiekristall, Metall,
 * Obsidian, Pilzgewebe) tragen die Katalogwerte unverändert; die übrigen Einträge orientieren
 * sich am verwandten Katalogstoff. Metall-Stufen: Metall unzerstörbar > Platten/Träger sehr hart
 * > Schienen hart > Gitter/Fragmente/Trümmer normal.
 */
export default Object.freeze([
  // Wie Erde, aber vergiftet: ätzempfindlicher; sonst Erdwerte.
  {
    key: 'kontaminierte_erde', label: 'Kontaminierte Erde', farbe: [98, 86, 52], muster: 'koernig', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 1.1, aetz: 1.1 }, bruch: 'rieseln', reibung: 1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Katalogstoff Koralle, unverändert.
  {
    key: 'koralle', label: 'Koralle', farbe: [226, 128, 124], muster: 'poroes', glanz: 0.2, textur: 'koralle', kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.8, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.3 }, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Rostiges Metall ist nicht mehr unzerstörbar: hart und brüchig, ätzempfindlich; leitet noch (Rost nur an der Oberfläche).
  {
    key: 'korrodiertes_metall', label: 'korrodiertes Metall', farbe: [122, 90, 68], muster: 'platten', glanz: 0.15, textur: 'rostmetall', kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { aetz: 1.4, nass: 1.1 }, bruch: 'platten', reibung: 0.95, bremst: 0, traegt: true, versinkt: false,
  },
  // Rostschicht/Krümel (Biom Rost): weich, rieselt, Oxid leitet nicht; Textur fehlt (rostmetall meint festes Metall).
  {
    key: 'korrosion', label: 'Korrosion', farbe: [150, 82, 44], muster: 'koernig', glanz: 0.05, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.2, nass: 1.1 }, bruch: 'rieseln', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Katalogstoff Kristall, unverändert. Glatt (reibung 0,6), leitet nicht (nur anfällig für Strom).
  {
    key: 'kristall', label: 'Kristall', farbe: [150, 120, 220], muster: 'facetten', glanz: 0.8, textur: 'kristall', kontur: 'hell',
    haerte: 'hart', radius: 0.8, tiefe: 0.6, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 1.15, aetz: 0.9 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Adern im Gestein: Kristallwerte, etwas matter.
  {
    key: 'kristalladern', label: 'Kristalladern', farbe: [146, 118, 214], muster: 'facetten', glanz: 0.7, textur: 'kristall', kontur: 'hell',
    haerte: 'hart', radius: 0.8, tiefe: 0.6, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 1.15, aetz: 0.9 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Dünne Blätter: wie Kristall, aber nur normal hart und größerer Radius (zerbrechlich); Zweifel: Form nicht aus dem Namen.
  {
    key: 'kristallblaetter', label: 'Kristallblätter', farbe: [162, 134, 228], muster: 'facetten', glanz: 0.8, textur: 'kristall', kontur: 'hell',
    haerte: 'normal', radius: 1, tiefe: 0.7, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 1.15, aetz: 0.9 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Fels mit Kristallen: zwischen Fels und Kristall; Textur kristall.webp wäre reiner Kristall, daher null.
  {
    key: 'kristallfelsen', label: 'Kristallfelsen', farbe: [126, 112, 168], muster: 'facetten', glanz: 0.4, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 3, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 1.1, aetz: 1.1 }, bruch: 'splitter', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Vulkanglas: Glasnähe (schmelzbar, scherbend) mit Härte von Obsidian-Nähe; Zweifel: Härte zwischen Glas und Obsidian gewählt.
  {
    key: 'lavaglas', label: 'Lavaglas', farbe: [60, 40, 50], muster: 'facetten', glanz: 0.8, textur: 'lavaglas', kontur: 'hell',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 4, brennbar: false, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 1.2, kaelte: 1.1 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Lebende Koralle: wie Koralle, aber elastischer (weniger Nebenbrüche), empfindlicher gegen Ätzendes und Hitze.
  {
    key: 'lebende_koralle', label: 'lebende Koralle', farbe: [236, 120, 140], muster: 'poroes', glanz: 0.25, textur: 'koralle', kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.75, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.4, hitze: 1.1 }, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Lehm: wie Erde, aber klebrig (bremst mehr) und Wasser macht ihn weniger angreifbar.
  {
    key: 'lehmige_erde', label: 'lehmige Erde', farbe: [150, 100, 66], muster: 'koernig', glanz: 0.05, textur: 'erde', kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.95, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 0.9 }, bruch: 'rieseln', reibung: 1.1, bremst: 0.3, traegt: true, versinkt: false,
  },
  // Algenteppich unter Wasser: weich, feucht (nicht brennbar), glitschig; Textur leuchtalgen vorhanden.
  {
    key: 'leuchtalgen', label: 'Leuchtalgen', farbe: [80, 220, 170], muster: 'poroes', glanz: 0.4, textur: 'leuchtalgen', kontur: 'keine',
    haerte: 'weich', radius: 1.25, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.2, aetz: 1.2, nass: 0.9 }, bruch: 'faser', reibung: 0.8, bremst: 0.2, traegt: true, versinkt: false,
  },
  // Leuchtender Kristall: Kristallwerte (hart, scherbend, glatt), hellere Farbe, mehr Glanz; Textur kristall.webp ist unbeleuchtet, daher null.
  {
    key: 'leuchtkristall', label: 'Leuchtkristall', farbe: [170, 230, 240], muster: 'facetten', glanz: 0.9, textur: null, kontur: 'hell',
    haerte: 'hart', radius: 0.8, tiefe: 0.6, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 1.15, aetz: 0.9 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Wie Pilzgewebe (Katalog pilz), nur anderer Farbton; Textur pilz.jpg wäre unpassend leuchtlos, daher null.
  {
    key: 'leuchtpilzgewebe', label: 'Leuchtpilzgewebe', farbe: [90, 200, 190], muster: 'fasern', glanz: 0.3, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Katalogstoff Magiekristall, unverändert; leitfähig, weil er stark auf Strom anspricht (1,3).
  {
    key: 'magiekristall', label: 'Magiekristall', farbe: [190, 120, 236], muster: 'facetten', glanz: 0.85, textur: 'magiekristall', kontur: 'hell',
    haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 4, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.3, hitze: 1.1, aetz: 0.85 }, bruch: 'scherben', reibung: 0.6, bremst: 0, traegt: true, versinkt: false,
  },
  // Erstarrte/glühende Adern im Fels: schmelzen unter Hitze nicht weiter (0,9), Kälte schreckt sie ab (1,2). Zweifel: Zustand (heiß/kalt) unklar, Schaden durch Berührung ist Sache der Wirkung. Textur fehlt.
  {
    key: 'magmaadern', label: 'Magmaadern', farbe: [214, 80, 34], muster: 'schichten', glanz: 0.5, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 1, brennbar: false, schmelzbar: true, leitfaehig: false,
    anfaellig: { hitze: 0.9, kaelte: 1.2 }, bruch: 'schmelzen', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Eisenhaltiges Gestein: hart wie Fels, leitet und spricht auf Strom/Magnetik an (Gruppe strom 1,2).
  {
    key: 'magnetgestein', label: 'Magnetgestein', farbe: [74, 72, 84], muster: 'schichten', glanz: 0.35, textur: 'magnetgestein', kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.2 }, bruch: 'platten', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Wie Fels (Katalog fels), Werte dort übernommen; kein unzerstörbares Grundgestein.
  {
    key: 'massivfels', label: 'Massivfels', farbe: [108, 108, 114], muster: 'schichten', glanz: 0.1, textur: 'fels', kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.2, kaelte: 0.95 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Ziegel/Steinbau: wie Beton (hart, brüchig 2), bricht in Platten.
  {
    key: 'mauerwerk', label: 'Mauerwerk', farbe: [150, 120, 104], muster: 'platten', glanz: 0.1, textur: 'mauerwerk', kontur: 'dunkel',
    haerte: 'hart', radius: 0.74, tiefe: 0.55, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.15, hitze: 0.95 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Katalogstoff metall (Metallplatte, unzerstörbar) für "Intaktes Metall"; leitet, glatt, nicht schmelzbar.
  {
    key: 'metall', label: 'Metall', farbe: [96, 104, 116], muster: 'platten', glanz: 0.7, textur: 'metall', kontur: 'dunkel',
    haerte: 'unzerstoerbar', radius: 0, tiefe: 0, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: {}, bruch: 'ganz', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Erzader im Gestein: eingebettetes Metall, sehr hart statt unzerstörbar (Gestein drumherum bricht); leitet.
  {
    key: 'metallader', label: 'Metallader', farbe: [128, 134, 146], muster: 'schichten', glanz: 0.6, textur: 'metall', kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.45, tiefe: 0.4, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'ganz', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Lose Splitter: normal hart, bricht in Splitter, holpriger Boden (bremst leicht), leitet.
  {
    key: 'metallfragmente', label: 'Metallfragmente', farbe: [108, 114, 126], muster: 'koernig', glanz: 0.5, textur: 'metall', kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.8, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'splitter', reibung: 0.85, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Dünne Stäbe: normal hart (dünner als Platten), durchlässig im Gefühl, aber tragend; leitet.
  {
    key: 'metallgitter', label: 'Metallgitter', farbe: [88, 96, 108], muster: 'platten', glanz: 0.5, textur: 'metall', kontur: 'dunkel',
    haerte: 'normal', radius: 0.9, tiefe: 0.7, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'platten', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Verbaute Platten: sehr hart (dünner als Vollmetall), nicht unzerstörbar; Zweifel: der Katalogstoff "Metallplatte" ist hier Metall, Platten bekommen daher einen eigenen Schlüssel.
  {
    key: 'metallplatten', label: 'Metallplatten', farbe: [96, 104, 116], muster: 'platten', glanz: 0.7, textur: 'metall', kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.45, tiefe: 0.35, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'platten', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Schienen: hart, schmal, glatter Stahl (reibung 0,8); leitet.
  {
    key: 'metallschienen', label: 'Metallschienen', farbe: [100, 100, 108], muster: 'platten', glanz: 0.6, textur: 'metall', kontur: 'dunkel',
    haerte: 'hart', radius: 0.65, tiefe: 0.45, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'ganz', reibung: 0.8, bremst: 0, traegt: true, versinkt: false,
  },
  // Stahlträger: massiv, sehr hart wie Platten.
  {
    key: 'metalltraeger', label: 'Metallträger', farbe: [92, 100, 112], muster: 'platten', glanz: 0.6, textur: 'metall', kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.45, tiefe: 0.35, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'ganz', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Schrott: wie Fragmente, aber unebener (bremst 0,2) und gröber.
  {
    key: 'metalltruemmer', label: 'Metalltrümmer', farbe: [92, 94, 100], muster: 'koernig', glanz: 0.4, textur: 'metall', kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.8, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'splitter', reibung: 1.1, bremst: 0.2, traegt: true, versinkt: false,
  },
  // Dichter Meteoritenstein (Eisen-Anteil): sehr hart, aber nicht unzerstörbar; Zweifel: Leitfähigkeit offen, daher nicht leitend. Textur fels.jpg wäre irdischer Fels, daher null.
  {
    key: 'meteoritenfels', label: 'Meteoritenfels', farbe: [78, 70, 66], muster: 'schichten', glanz: 0.2, textur: null, kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.5, tiefe: 0.4, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: {}, bruch: 'splitter', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Moos: weich, trocken brennbar (wie Pilzgewebe), federnde Decke bremst leicht.
  {
    key: 'moos', label: 'Moos', farbe: [74, 120, 58], muster: 'poroes', glanz: 0.05, textur: 'moos', kontur: 'keine',
    haerte: 'weich', radius: 1.3, tiefe: 1.05, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.2, nass: 0.9 }, bruch: 'faser', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Fruchtbare Erde: etwas weicher als Erde, dunkel und locker; Textur fehlt (erde.jpg ist Rohboden).
  {
    key: 'mutterboden', label: 'Mutterboden', farbe: [84, 62, 44], muster: 'koernig', glanz: 0.02, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.15, tiefe: 1.05, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { nass: 1.1 }, bruch: 'rieseln', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Pilzfasergeflecht: wie Pilzgewebe, Textur myzel.jpg.
  {
    key: 'myzelmatte', label: 'Myzelmatte', farbe: [196, 184, 168], muster: 'fasern', glanz: 0.05, textur: 'myzel', kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Meteoriteneisen: sehr hart, leitet, glänzt; Textur fehlt.
  {
    key: 'nickel_eisen', label: 'Nickel-Eisen', farbe: [136, 138, 144], muster: 'schichten', glanz: 0.65, textur: null, kontur: 'dunkel',
    haerte: 'sehr_hart', radius: 0.45, tiefe: 0.4, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: true,
    anfaellig: { strom: 1.1 }, bruch: 'ganz', reibung: 0.9, bremst: 0, traegt: true, versinkt: false,
  },
  // Katalogstoff Obsidian, unverändert; Vulkanglas, glatt, bricht in Scherben.
  {
    key: 'obsidian', label: 'Obsidian', farbe: [34, 30, 44], muster: 'facetten', glanz: 0.9, textur: 'obsidian', kontur: 'hell',
    haerte: 'sehr_hart', radius: 0.4, tiefe: 0.35, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { strom: 0.9 }, bruch: 'scherben', reibung: 0.7, bremst: 0, traegt: true, versinkt: false,
  },
  // Kalkige Riffreste: wie Koralle (ätzempfindlich), aber lockerer (weich, rieselt). Textur fehlt.
  {
    key: 'organische_riffablagerungen', label: 'Organische Riffablagerungen', farbe: [200, 170, 150], muster: 'poroes', glanz: 0.05, textur: null, kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1, bruechig: 1, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.3 }, bruch: 'rieseln', reibung: 1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Lebendes, tragendes Wurzelwerk: wie Holz (brennbar, Faserbruch). Zweifel: "organisch" nur aus dem Namen; kolossholz.jpg meint Riesenholz, daher null.
  {
    key: 'organische_tragwurzeln', label: 'Organische Tragwurzeln', farbe: [96, 72, 44], muster: 'fasern', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 0.95, tiefe: 0.9, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, nass: 0.9 }, bruch: 'faser', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Wie Fels; "Phasen" steht für Zeitriss-Optik, die Werte erfinden wir nicht dazu. Farbe leicht bläulich.
  {
    key: 'phasen_fels', label: 'Phasen-Fels', farbe: [100, 96, 140], muster: 'schichten', glanz: 0.3, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.2, kaelte: 0.95 }, bruch: 'platten', reibung: 1, bremst: 0, traegt: true, versinkt: false,
  },
  // Pilzbrücke: tragend, wie Pilzgewebe, aber fester (normal) damit Figuren darauf stehen; brennbar.
  {
    key: 'pilzbruecke', label: 'Pilzbrücke', farbe: [150, 96, 120], muster: 'fasern', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'normal', radius: 1, tiefe: 0.85, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.1, traegt: true, versinkt: false,
  },
  // Einzelne Pilze: Werte von Pilzgewebe (Katalog pilz), eigener Schlüssel, andere Farbe.
  {
    key: 'pilze', label: 'Pilze', farbe: [176, 120, 100], muster: 'fasern', glanz: 0.05, textur: 'pilz', kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Katalogstoff pilz (Pilzgewebe), unverändert.
  {
    key: 'pilz', label: 'Pilzgewebe', farbe: [150, 96, 120], muster: 'fasern', glanz: 0.05, textur: 'pilz', kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Wie Myzelmatte (gleiches Material, anderer Name im Manifest).
  {
    key: 'pilzmyzel', label: 'Pilzmyzel', farbe: [196, 184, 168], muster: 'fasern', glanz: 0.05, textur: 'myzel', kontur: 'keine',
    haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false, leitfaehig: false,
    anfaellig: { hitze: 1.25, aetz: 1.15 }, bruch: 'faser', reibung: 1.1, bremst: 0.15, traegt: true, versinkt: false,
  },
  // Beton (Katalog) mit Hohlräumen: brüchiger (3), größerer Radius, rieselt, saugt Nässe und Säure auf.
  {
    key: 'poroeser_beton', label: 'Poröser Beton', farbe: [150, 148, 142], muster: 'poroes', glanz: 0.03, textur: 'beton', kontur: 'dunkel',
    haerte: 'hart', radius: 0.85, tiefe: 0.65, bruechig: 3, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.25, nass: 1.1 }, bruch: 'rieseln', reibung: 1.05, bremst: 0, traegt: true, versinkt: false,
  },
  // Fels mit Hohlräumen (Asteroid): wie poröser Beton gewählt, damit ähnliche Stoffe ähnliche Werte haben. Textur fels.jpg ist dichter Fels, daher null.
  {
    key: 'poroeser_fels', label: 'Poröser Fels', farbe: [120, 116, 112], muster: 'poroes', glanz: 0.05, textur: null, kontur: 'dunkel',
    haerte: 'hart', radius: 0.85, tiefe: 0.6, bruechig: 2, brennbar: false, schmelzbar: false, leitfaehig: false,
    anfaellig: { aetz: 1.25 }, bruch: 'rieseln', reibung: 1.05, bremst: 0, traegt: true, versinkt: false,
  },
]);
