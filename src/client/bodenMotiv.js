/**
 * Bodenart nach dem MOTIV der Kulisse (Rückmeldung 2026-11-25: „überall grauer Stein“).
 *
 * FUND (gezählt, alle 160 Kulissen aus `config/backdrops.js`): Die Bodenart kam nur aus der Helligkeit
 * der Bodenfarbe (`bodenArt`). Bei dunklen und nächtlichen Bildern ergab das fast immer Fels oder Asche:
 * 120 von 160 Kulissen bekamen grauen Stein, darunter Herbstwald, Weizenfeld, Heidemoor, Reisterrassen,
 * Bambusdickicht und fast alle Landschaftsfotos des Auftraggebers (Herbstwiese, Feldweg, Hügelweide …).
 *
 * Jetzt entscheidet zuerst der Name des Bildes (Kennung, Biom, Datei), erst danach die Farbe.
 * Reine Darstellung: Gelände, Kollision und Replay bleiben unberührt.
 *
 * @module bodenMotiv
 */

/** Reihenfolge zählt: die erste passende Regel gewinnt. */
const REGELN = Object.freeze([
  ['asche', /ragnarok|volcano|vulkan|lava|black_hole|nebula/],
  ['schnee', /winter|snow|schnee|(?:^|[/_ ])ice(?:[_. ]|$)|arctic|polar|frost|klondike/],
  ['fels', /hoehle|cave|cavern|crystal|kristall|limestone|underwater/],
  ['sand', /desert|caravan|dune|sand|strand|beach|caribbean|sunset_golden|hoodoo|salt_flat|slot_canyon|sunset_duel|desert_town/],
  ['fels', /urban|noir|street|(?<!elven_)city|harbor|hafen|ruin|industrial|war_|station|cosmos|abstract|basalt|dolomit|trench|neon|rooftop|dam_break|castle|dragon_peak|moonlit|himalaya/],
  ['gras', /meadow|wiese|forest|wald|glade|jungle|valley|elven|swamp|drowned|rice|bamboo|wheat|heath|prairie|polder|karst|typhoon|calm_day|autumn|herbst|polynesian|feld|weg|baum|birke|huegel|weide|bergsee|scheune|zaun|sonne|garten|fluss|gewitter|halbmond|rosa|schaefchen|nebel|alpendorf|regenbogen|monsoon|rooftops|coastal/],
]);

/** Biom als Rückfall, wenn der Name nichts sagt (z. B. `forest/stimmung_dunkel`). `stil` = Landschaftsfotos des Auftraggebers: fast alle zeigen Wiese oder Feld im Vordergrund. */
const BIOM = Object.freeze({
  forest: 'gras', alpine: 'gras', fantasy: 'gras', hyperreal: 'gras', open: 'gras', deluge: 'gras', island: 'sand',
  western: 'sand', stil: 'gras', maritime: 'fels', urban: 'fels', noir: 'fels', caverns: 'fels', cosmos: 'fels', abstract: 'fels', spires: 'fels', warren: 'fels',
});

/**
 * @param {{key?:string, biomeId?:string, id?:string, file?:string}|null} kulisse
 * @returns {'gras'|'sand'|'schnee'|'fels'|'asche'|null} null = der Name sagt nichts, die Farbe entscheidet
 */
export function bodenFuerMotiv(kulisse) {
  if (!kulisse) return null;
  // Nur Kennung und Datei: das Biom einer Stil-Kulisse ist bloß ihre Bildfamilie (`nachtstadt_tal` steht unter `urban`).
  const text = `${kulisse.key ?? ''} ${kulisse.file ?? ''}`.toLowerCase();
  for (const [art, muster] of REGELN) if (muster.test(text)) return art;
  const praefix = String(kulisse.key ?? '').split('/')[0];
  return BIOM[praefix === 'stil' ? 'stil' : kulisse.biomeId] ?? BIOM[praefix] ?? null;
}
