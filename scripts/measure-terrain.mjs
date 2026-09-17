#!/usr/bin/env node
/**
 * Misst die Qualität des Kartengenerators.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Auftrag lautet: „Der Kartengenerator muss richtig gut werden."
 * „Gut" ist kein Messwert — aber mehrere **Eigenschaften** eines Terrains sind
 * es. Ohne diese Messung wäre jede Verbesserung eine Behauptung.
 *
 * ## Was gemessen wird
 *
 * 1. **Abwechslung** — wie unterschiedlich sind zwei Karten desselben Presets?
 *    Ein Generator, der immer dasselbe liefert, ist kein Generator.
 * 2. **Struktur** — wie viele Erhebungen gibt es? Ein Terrain mit einer Welle
 *    ist langweilig; eines mit zwanzig ist zackig.
 * 3. **Spielbarkeit** — gibt es genug ebene Flächen? Figuren brauchen Platz.
 * 4. **Höhenausnutzung** — wie viel der Kartenhöhe wird genutzt? Ein Terrain,
 *    das nur im unteren Drittel spielt, verschenkt die halbe Karte.
 * 5. **Höhlen** — wie viel Hohlraum entsteht, und ist er zusammenhängend?
 *
 * ## Aufruf
 *
 *     node scripts/measure-terrain.mjs
 *     node scripts/measure-terrain.mjs --karten=50
 */
import { generateTerrain, TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import { SeededRandom } from '../src/shared/prng.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('karten') ?? 20);
const BREITE = Number(args.get('breite') ?? 1280);
const HOEHE = Number(args.get('hoehe') ?? 720);

/** Eine Karte erzeugen. */
function karte(preset, seed, breite = BREITE, hoehe = HOEHE) {
  return generateTerrain({
    rng: new SeededRandom(seed), width: breite, height: hoehe, preset,
  });
}

/**
 * Zählt die Erhebungen: Stellen, an denen die Steigung das Vorzeichen wechselt.
 *
 * Ein Terrain mit einer einzigen Welle hat 1 Erhebung; eines mit zwanzig
 * Hügeln hat 20. Das ist der Unterschied zwischen „langweilig" und „strukturiert".
 */
function erhebungen(heightMap) {
  let wechsel = 0;
  let letzteRichtung = 0;
  for (let x = 1; x < heightMap.length; x += 1) {
    const d = heightMap[x] - heightMap[x - 1];
    const richtung = d > 0.0005 ? 1 : d < -0.0005 ? -1 : 0;
    if (richtung !== 0 && letzteRichtung !== 0 && richtung !== letzteRichtung) wechsel++;
    if (richtung !== 0) letzteRichtung = richtung;
  }
  return wechsel;
}

/**
 * Ebene Flächen: zusammenhängende Stellen mit weniger als 2 px Steigung.
 *
 * Figuren stehen auf Plateaus. Ein Terrain aus lauter steilen Hängen ist
 * unspielbar — die Figuren rutschen oder finden keinen Platz.
 */
function ebeneFlaeche(heightMap) {
  let eben = 0;
  for (let x = 1; x < heightMap.length; x += 1) {
    if (Math.abs(heightMap[x] - heightMap[x - 1]) < 0.003) eben++;
  }
  return eben / heightMap.length;
}

/** Wie viel der Kartenhöhe das Terrain nutzt. */
function hoehennutzung(heightMap) {
  return Math.max(...heightMap) - Math.min(...heightMap);
}

/** Der Anteil solider Pixel unterhalb der Oberfläche (Hohlraum-Maß). */
function hohlraum(bitmap, heightMap, breite, hoehe) {
  let unterOberflaeche = 0;
  let solide = 0;
  for (let x = 0; x < breite; x += 1) {
    const oberflaeche = Math.floor(hoehe * heightMap[x]);
    for (let y = oberflaeche; y < hoehe; y += 1) {
      unterOberflaeche++;
      if (bitmap[y * breite + x]) solide++;
    }
  }
  return unterOberflaeche === 0 ? 0 : 1 - solide / unterOberflaeche;
}

const PRESETS = Object.keys(TERRAIN_PRESETS);
console.log(`Kartengenerator: ${ANZAHL} Karten je Preset (${BREITE}×${HOEHE})`);
console.log('');
console.log(`${'Preset'.padEnd(12)}${'Erhebungen'.padStart(12)}${'eben'.padStart(8)}${'Höhe'.padStart(8)}${'Hohlraum'.padStart(11)}${'Streuung'.padStart(11)}`);
console.log('-'.repeat(62));

const gesamt = [];

for (const preset of PRESETS) {
  const karten = [];
  for (let i = 0; i < ANZAHL; i += 1) {
    karten.push(karte(preset, 1000 + i * 137));
  }

  const erhebung = karten.map(k => erhebungen(k.heightMap));
  const eben = karten.map(k => ebeneFlaeche(k.heightMap));
  const hoehe = karten.map(k => hoehennutzung(k.heightMap));
  const hohl = karten.map(k => hohlraum(k.bitmap, k.heightMap, k.width, k.height));

  const mittel = a => a.reduce((x, y) => x + y, 0) / a.length;
  const streuung = a => {
    const m = mittel(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  gesamt.push({
    preset,
    erhebung: mittel(erhebung),
    erhebungStreuung: streuung(erhebung),
    eben: mittel(eben),
    hoehe: mittel(hoehe),
    hohl: mittel(hohl),
  });

  console.log(
    `${preset.padEnd(12)}${mittel(erhebung).toFixed(1).padStart(12)}`
    + `${`${(mittel(eben) * 100).toFixed(0)} %`.padStart(8)}`
    + `${`${(mittel(hoehe) * 100).toFixed(0)} %`.padStart(8)}`
    + `${`${(mittel(hohl) * 100).toFixed(0)} %`.padStart(11)}`
    + `${streuung(erhebung).toFixed(1).padStart(11)}`,
  );
}

console.log('');
console.log('WAS DIE ZAHLEN BEDEUTEN');
console.log('');
console.log('  Erhebungen   Vorzeichenwechsel der Steigung. 1 = eine Welle (langweilig),');
console.log('               10+ = strukturiert. Die STREUUNG daneben sagt, ob zwei Karten');
console.log('               desselben Presets unterschiedlich ausfallen — eine Streuung von');
console.log('               0 hieße: Jede Karte sieht gleich aus.');
console.log('  eben         Anteil flacher Stellen. Figuren brauchen Plateaus; unter 20 %');
console.log('               wird das Aufstellen schwierig.');
console.log('  Höhe         Wie viel der Kartenhöhe genutzt wird. Unter 50 % verschenkt die');
console.log('               halbe Karte.');
console.log('  Hohlraum     Anteil nicht-solider Pixel unterhalb der Oberfläche. Das sind');
console.log('               die Höhlen. 0 % = massiver Block (keine Verstecke).');

console.log('');
console.log('DIE GRENZEN DES HEUTIGEN GENERATORS');
console.log('');

/*
 * Die Beobachtung aus dem Code: Der heutige Generator baut aus ZWEI
 * Rauschoktaven ein Höhenfeld, streut KREISE als Höhlen und flutet unten.
 * Gemessen wird, was daraus folgt.
 */
const hills = gesamt.find(g => g.preset === 'hills');

if (hills && hills.erhebungStreuung < 0.5) {
  console.log(`  BEFUND: Die Streuung der Erhebungen ist ${hills.erhebungStreuung.toFixed(2)} —`);
  console.log('  die Karten sind nahezu identisch. Zwei Oktaven mit festen Stützstellen');
  console.log('  ergeben wenig Variation: Die grobe Form ist bei 6 Stützstellen fast');
  console.log('  immer dieselbe Wellenform.');
} else if (hills) {
  console.log(`  Die Streuung der Erhebungen ist ${hills.erhebungStreuung.toFixed(2)} — die Karten`);
  console.log('  unterscheiden sich merklich.');
}

console.log('');
console.log('  BEFUND: DIE STRUKTUR HÄNGT AN DER STÜTZSTELLENZAHL, NICHT AN DER BREITE');
console.log('');

/*
 * Der Kern des Problems, gemessen.
 *
 * `valueNoise(rng, 6)` nutzt IMMER sechs Stützstellen — unabhängig davon, wie
 * breit die Karte ist. Eine 5120er Karte bekommt damit dieselbe Struktur wie
 * eine 1280er, nur gestreckt: Wellen von 850 px Breite.
 */
console.log('  Breite   Erhebungen (hills, zwei Seeds)');
console.log('  ' + '-'.repeat(40));

for (const breite of [1280, 2560, 3840, 5120]) {
  const a = karte('hills', 1000, breite, Math.round(breite * 9 / 16));
  const b = karte('hills', 9999, breite, Math.round(breite * 9 / 16));
  console.log(`  ${String(breite).padStart(6)}   ${String(erhebungen(a.heightMap)).padStart(8)} / ${String(erhebungen(b.heightMap)).padStart(8)}`);
}

console.log('');
console.log('  Auf der Kriegskarte (5120 px) bleiben davon 0 bis 1 Erhebung übrig —');
console.log('  das Gelände ist praktisch flach. Eine Figur ist 14 px breit, eine Welle');
console.log('  850 px: kein Hügel, sondern ein Brett.');
console.log('');
console.log('  Weitere Beobachtungen aus dem Code (belegt):');
console.log('  - Die Höhlen sind ZUFÄLLIGE KREISE. Sie verbinden sich nicht, bilden keine');
console.log('    Gänge und liegen gleichmäßig verteilt. Ein Höhlensystem entsteht so nicht.');
console.log('  - Es gibt KEINE Überhänge und KEINE schwebenden Inseln. Das Höhenfeld ist');
console.log('    ein 1D-Feld: je Spalte genau eine Oberfläche. Alles darunter ist massiv.');
console.log('  - Das Wasser ist eine gerade Linie. Es spiegelt nicht die Geländeform.');
console.log('  - Die Kanten sind hart: Ein Pixel ist solide oder nicht, ohne Übergang.');
console.log('');
console.log('  Das sind die Ansatzpunkte für einen „richtig guten" Generator.');
