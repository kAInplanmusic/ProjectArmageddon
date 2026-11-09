/**
 * Fraktionsfarbe und Fraktionsschrift — ohne Bildpfade, ohne Vite-Glob.
 *
 * ## Warum getrennt von `fraktionsIdentitaet.js`
 *
 * Das Emblem-/Banner-Modul lädt die SVGs über `import.meta.glob`; das ist
 * Vite-spezifisch und in einem reinen Node-Test nicht ladbar. Die Farbwerte
 * selbst sind aber Daten, die auch die Team-/Fraktions-Trennung (Audit A09)
 * und die Prüfung der Mindestgröße (A11) brauchen. Deshalb stehen sie hier in
 * einer reinen Tabelle — eine Quelle, zwei Verbraucher.
 *
 * A09: Diese Farbe gehört der FRAKTION. Sie färbt Körper, Emblem und Banner.
 * Sie sagt NICHTS über den Eigentümer einer Figur aus — dafür gilt
 * `TEAM_COLORS` (Teamring, Namensschild, Marker).
 */
export const FRAKTIONS_FARBEN = Object.freeze({
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

/** Farbe und Schrift einer Fraktion, `null` bei unbekannter Kennung. */
export function fraktionsFarbe(id) {
  return FRAKTIONS_FARBEN[id] ?? null;
}
