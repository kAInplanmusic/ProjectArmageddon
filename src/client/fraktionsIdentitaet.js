/** Visuelle Fraktionsidentität. Keine Spielwerte; Spieler-Teamfarbe bleibt unabhängig. */
const IDENTITAET = Object.freeze({
  xeno: Object.freeze({ farbe: '#c026d3', schrift: 'Rajdhani' }),
  rodentia: Object.freeze({ farbe: '#b91c1c', schrift: 'Cinzel' }),
  pirates: Object.freeze({ farbe: '#d4af37', schrift: 'Pirata One' }),
  machina: Object.freeze({ farbe: '#22d3ee', schrift: 'Orbitron' }),
  undead: Object.freeze({ farbe: '#84cc16', schrift: 'Creepster' }),
  shinobi: Object.freeze({ farbe: '#e5e5e5', schrift: 'Reggae One' }),
  beasts: Object.freeze({ farbe: '#ea580c', schrift: 'Rye' }),
  pixel: Object.freeze({ farbe: '#a78bfa', schrift: 'Press Start 2P' }),
  datacult: Object.freeze({ farbe: '#22c55e', schrift: 'Share Tech Mono' }),
});
const ZEICHEN = import.meta.glob('./assets/fraktionszeichen/*.svg', { eager: true, query: '?url', import: 'default' });

/** Liefert lokale URLs und Gestaltungswerte für eine bekannte Fraktion. */
export function fraktionsIdentitaet(id) {
  const eintrag = IDENTITAET[id];
  return eintrag ? { ...eintrag,
    emblem: ZEICHEN[`./assets/fraktionszeichen/${id}.svg`],
    banner: ZEICHEN[`./assets/fraktionszeichen/${id}-banner.svg`],
  } : null;
}
