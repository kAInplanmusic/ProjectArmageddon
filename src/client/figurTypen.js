/**
 * Figurtypen: Parametertabelle der Animation (nur Darstellung).
 *
 * Jede der 81 Figuren gehört zu genau einem Typ; der Typ bestimmt, wie sie im
 * Stand atmet bzw. schwebt, läuft, springt, schießt, getroffen wird und stirbt.
 * Zeiten in Sekunden, Längen in Pixeln des Sprites (52 px hoch), Winkel in rad.
 *
 * @module figurTypen
 */

export const FIGUR_TYPEN = Object.freeze(['humanoid', 'tier', 'fahrzeug', 'schweber', 'wesen', 'schwarm']);

/** Typ je Charakter-ID — vollständig (Test: `tests/figur-typen.test.js`). */
export const TYP_JE_CHARAKTER = Object.freeze({
  // xeno
  'sgt-acid-xeno': 'humanoid', 'stalker-predax': 'humanoid', 'vortex-grabber': 'wesen',
  'drone-theta': 'schweber', 'desintegrator-kael': 'humanoid', 'plasma-maw-zorg': 'tier',
  'harbinger-zeta': 'schweber', 'dark-matter-witch': 'schweber', 'null-entity-quark': 'wesen',
  // rodentia
  'commander-chewk': 'humanoid', 'berzerker-fang': 'humanoid', 'vanguard-captain-rix': 'humanoid',
  'sharpshooter-quill': 'humanoid', 'grenadier-skitter': 'humanoid',
  'volley-captain-spark': 'humanoid', 'alchemage-nibble': 'humanoid',
  'technomancer-squeak': 'humanoid', 'grand-conduit-vex': 'humanoid',
  // pirates
  'captain-sven': 'humanoid', 'swashbuckler-piet': 'humanoid', 'iron-hook-harry': 'humanoid',
  'cannoneer-klaus': 'humanoid', 'sniper-marie': 'humanoid', 'bombard-billy': 'humanoid',
  'voodoo-witch-morgana': 'humanoid', 'storm-schamane-hooky': 'humanoid',
  'chanteyman-drake': 'humanoid',
  // machina
  'chassis-endo-t8': 'humanoid', 'slasher-cyber-jax': 'humanoid', 'hydra-titan-mech': 'fahrzeug',
  'recon-luchs-01': 'tier', 'heavy-battery-moerser-bot': 'fahrzeug',
  'ordnance-rail-viper': 'fahrzeug', 'grid-drifter-datastream': 'schweber',
  'proxy-glitch-hack': 'humanoid', 'overlord-kernel-panic': 'humanoid',
  // undead
  'bone-racker-karl': 'humanoid', 'grave-zombie-kauer': 'humanoid',
  'grim-reaper-silas': 'humanoid', 'archer-mortis': 'humanoid', 'pitcher-igor': 'humanoid',
  'vessel-plague-skull': 'humanoid', 'lich-king-alistair': 'humanoid',
  'scribe-necro-silas': 'humanoid', 'banshee-beatrice': 'schweber',
  // shinobi
  'shred-katana-hanzmon': 'humanoid', 'kunoichi-wind-flapper': 'humanoid',
  'tetsubo-oni-brute': 'humanoid', 'dazzler-werner': 'humanoid', 'rauch-meister-genzi': 'fahrzeug',
  'blowpipe-koga': 'wesen', 'ninjutsu-master-goemon': 'humanoid',
  'talisman-sorcerer-jun': 'humanoid', 'vixen-kitsune': 'humanoid',
  // beasts
  'pikamon': 'tier', 'shrew-quakes': 'tier', 'storm-talon': 'tier', 'flame-jaws': 'tier',
  'ember-tails': 'tier', 'magma-plate': 'tier', 'decay-spawn': 'wesen',
  'cosmic-meditate': 'schweber', 'sonic-blossom': 'schweber',
  // pixel
  'nullpointer-exception': 'tier', 'pyrofox-a': 'tier', 'pyrofox-b': 'tier',
  'arcershorn-a': 'tier', 'pyrowand-a': 'tier', 'shieldmon': 'tier', 'phantom-mal-a': 'wesen',
  'arcanus-a': 'humanoid', 'arcanus-b': 'humanoid',
  // datacult
  'nullpointer-exception-cult': 'humanoid', 'datapath-replicant': 'humanoid',
  'chrome-code-shifter': 'wesen', 'quantum-qubit-knight': 'humanoid', 'synapse-streamer': 'tier',
  'arcology-agent': 'humanoid', 'buffer-flow-swarm': 'schwarm', 'hyper-link-hound': 'tier',
  'ethereo': 'schweber',
});

const P = (o) => Object.freeze(o);

/**
 * Parameter je Typ.
 * atem*: Stand (Hz, Amplitude als Streckung, seitliches Wiegen in px);
 * mikro*: seltene Mikro-Bewegung (Periode s, Amplitude px);
 * schweb*: Schwebehöhe/-amplitude/-Hz; vib*: Motor-Vibration; puls*: Pulsieren; wusel*: Wuseln;
 * lauf*: Wippen (px), max. Neigung (rad), Wellen-Stauchung; sprung*, lande*: Streckung/Stauchung;
 * zielKipp: max. Neigung nach Zielwinkel; schuss*: Rückstoß (px), Neigung, Dauer;
 * treffer*: Zucken (px, rad); tod: Art des Sterbens; fussBreite: Faktor für Ring/Schatten;
 * hand*: Griffpunkt der Waffe (Anteil der Sprite-Höhe über den Füßen, Verschiebung vor/zurück in px,
 * Aufbau 1 = Waffe auf Halterung statt in der Hand, Waffengröße-Faktor), siehe `waffenAnimation.js`.
 */
export const PARAMETER = Object.freeze({
  humanoid: P({
    atemHz: 0.4, atemAmp: 0.016, atemWiegen: 0.25, mikroPeriode: 4.6, mikroAmp: 0.5,
    schwebHoehe: 0, schwebAmp: 0, schwebHz: 0, vibAmp: 0, vibHz: 0, pulsAmp: 0, pulsHz: 0, wuselAmp: 0, wuselHz: 0,
    laufWippen: 1.6, laufNeigung: 0.18, laufWelle: 0.015, laufRate: 1,
    sprungStreck: 0.14, sprungHocke: 0.1, landeStauch: 0.2, landeDauer: 0.24, staub: 1,
    zielKipp: 0.07, schussKick: 1.4, schussNeigung: 0.05, schussDauer: 0.42,
    trefferZuck: 2.4, trefferNeigung: 0.14, tod: 'kippen', fussBreite: 1,
    handAnteil: 17.25 / 52, handVor: 0, handZurueck: 0, handAufbau: 0, handSkala: 1,
  }),
  tier: P({
    atemHz: 0.7, atemAmp: 0.022, atemWiegen: 0.35, mikroPeriode: 3.1, mikroAmp: 0.7,
    schwebHoehe: 0, schwebAmp: 0, schwebHz: 0, vibAmp: 0, vibHz: 0, pulsAmp: 0, pulsHz: 0, wuselAmp: 0, wuselHz: 0,
    laufWippen: 2.2, laufNeigung: 0.12, laufWelle: 0.03, laufRate: 1.25,
    sprungStreck: 0.16, sprungHocke: 0.13, landeStauch: 0.22, landeDauer: 0.22, staub: 1.1,
    zielKipp: 0.05, schussKick: 1.1, schussNeigung: 0.06, schussDauer: 0.4,
    trefferZuck: 2.8, trefferNeigung: 0.16, tod: 'kippen', fussBreite: 1.25,
    handAnteil: 0.3800, handVor: 0, handZurueck: 3, handAufbau: 1, handSkala: 0.95,
  }),
  fahrzeug: P({
    atemHz: 0.5, atemAmp: 0.004, atemWiegen: 0, mikroPeriode: 2.4, mikroAmp: 0.25,
    schwebHoehe: 0, schwebAmp: 0, schwebHz: 0, vibAmp: 0.3, vibHz: 26, pulsAmp: 0, pulsHz: 0, wuselAmp: 0, wuselHz: 0,
    laufWippen: 0.35, laufNeigung: 0.05, laufWelle: 0.006, laufRate: 1.6,
    sprungStreck: 0.04, sprungHocke: 0.03, landeStauch: 0.08, landeDauer: 0.3, staub: 1.7,
    zielKipp: 0.03, schussKick: 2.2, schussNeigung: 0.035, schussDauer: 0.5,
    trefferZuck: 1.2, trefferNeigung: 0.05, tod: 'explodieren', fussBreite: 1.35,
    handAnteil: 0.3000, handVor: 0, handZurueck: 1, handAufbau: 1, handSkala: 1.12,
  }),
  schweber: P({
    atemHz: 0.5, atemAmp: 0.006, atemWiegen: 0.4, mikroPeriode: 5.5, mikroAmp: 0.6,
    schwebHoehe: 2.6, schwebAmp: 1.5, schwebHz: 0.55, vibAmp: 0, vibHz: 0, pulsAmp: 0, pulsHz: 0, wuselAmp: 0, wuselHz: 0,
    laufWippen: 0, laufNeigung: 0.16, laufWelle: 0, laufRate: 0.6,
    sprungStreck: 0.06, sprungHocke: 0, landeStauch: 0.03, landeDauer: 0.2, staub: 0.3,
    zielKipp: 0.09, schussKick: 1.6, schussNeigung: 0.07, schussDauer: 0.45,
    trefferZuck: 3, trefferNeigung: 0.2, tod: 'stuerzen', fussBreite: 0.85,
    handAnteil: 0.4000, handVor: 2, handZurueck: 0, handAufbau: 0, handSkala: 1,
  }),
  wesen: P({
    atemHz: 0.3, atemAmp: 0.01, atemWiegen: 0.2, mikroPeriode: 3.7, mikroAmp: 0.4,
    schwebHoehe: 0.8, schwebAmp: 0.6, schwebHz: 0.35, vibAmp: 0, vibHz: 0, pulsAmp: 0.035, pulsHz: 0.8, wuselAmp: 0, wuselHz: 0,
    laufWippen: 0.6, laufNeigung: 0.08, laufWelle: 0.05, laufRate: 0.9,
    sprungStreck: 0.18, sprungHocke: 0.12, landeStauch: 0.25, landeDauer: 0.28, staub: 0.7,
    zielKipp: 0.05, schussKick: 1.2, schussNeigung: 0.05, schussDauer: 0.45,
    trefferZuck: 2, trefferNeigung: 0.1, tod: 'zerfallen', fussBreite: 1,
    handAnteil: 0.4000, handVor: 1, handZurueck: 0, handAufbau: 1, handSkala: 0.95,
  }),
  schwarm: P({
    atemHz: 0.9, atemAmp: 0.01, atemWiegen: 0.3, mikroPeriode: 1.7, mikroAmp: 0.6,
    schwebHoehe: 2, schwebAmp: 1.1, schwebHz: 1.3, vibAmp: 0, vibHz: 0, pulsAmp: 0.02, pulsHz: 1.6, wuselAmp: 0.9, wuselHz: 9,
    laufWippen: 0.8, laufNeigung: 0.1, laufWelle: 0.03, laufRate: 1.4,
    sprungStreck: 0.1, sprungHocke: 0.05, landeStauch: 0.1, landeDauer: 0.2, staub: 0.4,
    zielKipp: 0.04, schussKick: 0.8, schussNeigung: 0.04, schussDauer: 0.36,
    trefferZuck: 2.4, trefferNeigung: 0.1, tod: 'zerstieben', fussBreite: 1.1,
    handAnteil: 0.4500, handVor: 0, handZurueck: 0, handAufbau: 1, handSkala: 0.9,
  }),
});

/** Typ einer Figur (`humanoid`, wenn die ID unbekannt ist). */
export function typFuer(charakterId) {
  return TYP_JE_CHARAKTER[charakterId] ?? 'humanoid';
}

/** Parametersatz einer Figur. */
export function parameterFuer(charakterId) {
  return PARAMETER[typFuer(charakterId)];
}
