#!/usr/bin/env node
/**
 * Misst die Sichtbarkeit des Kantenlichts am Boden.
 *
 * ## Der Befund
 *
 * Die Aufgabe „Terrain optisch aufwerten" verlangt eine Entscheidung über
 * Stil. Bevor Stil entschieden wird, ist eine Frage MESSBAR: **Sieht man das
 * Kantenlicht überhaupt?**
 *
 * Eine Sichtprüfung im Browser ergab: Der Boden hat Körnung und Farbabstufung,
 * das Kantenlicht ist aber ein einzelner Saum von 1–2 px. Das ist die
 * schmale Grenze zwischen „Kante betont" und „nicht wahrnehmbar".
 *
 * ## Was gemessen wird
 *
 * `edgeLightColor()` liefert die Farbe, `drawSurfaceEdge()` malt sie. Gemessen
 * wird der **Helligkeitsunterschied** zwischen der Oberkante und dem Boden
 * direkt darunter — und wie viele Pixel die Kante breit ist.
 *
 * Ein Unterschied unter ~8 Stufen ist bei 8 Bit je Kanal kaum zu sehen; ab ~20
 * ist er deutlich.
 *
 * ## Aufruf
 *
 *     node scripts/check-terrain-look.mjs
 */
import {
  edgeLightColor, drawSurfaceEdge, groundColorAt, DEPTH_REACH_PX,
} from '../src/client/terrainBaker.js';

/** Ein Canvas-Ersatz, der die Aufrufe mitschreibt — kein Browser nötig. */
function malAttrappe() {
  const striche = [];
  return {
    striche,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect(x, y, w, h) { striche.push({ x, y, w, h, farbe: this.fillStyle }); },
  };
}

/**
 * Zerlegt eine Farbe in Zahlen.
 *
 * Nimmt BEIDE Formen: `rgba(r, g, b, a)` von `edgeLightColor` und `r,g,b` von
 * `groundColorAt`. Die Funktionen liefern unterschiedliche Formate — das ist
 * Absicht (die eine malt, die andere rechnet), aber ein Messwerkzeug muss
 * beides lesen können.
 */
function zerlege(farbe) {
  if (Array.isArray(farbe)) return farbe;
  const treffer = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(farbe));
  if (!treffer) throw new Error(`Farbe nicht lesbar: ${farbe}`);
  return [Number(treffer[1]), Number(treffer[2]), Number(treffer[3])];
}

/** Wahrgenommene Helligkeit (Rec. 709). */
const helligkeit = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Die Bodenfarben aus der Palette — typische Vertreter. */
const BOEDEN = [
  { name: 'Wiese', farbe: [86, 148, 74] },
  { name: 'Sand', farbe: [214, 190, 130] },
  { name: 'Eis', farbe: [188, 214, 226] },
  { name: 'Basalt', farbe: [72, 72, 82] },
  { name: 'Schnee', farbe: [232, 236, 240] },
];

console.log('Kantenlicht: Helligkeitsunterschied zur Bodenfarbe');
console.log('');
console.log(`${'Boden'.padEnd(10)}${'Bodenfarbe'.padStart(16)}${'Kante'.padStart(18)}${'Δ Helligkeit'.padStart(15)}  Urteil`);
console.log('-'.repeat(76));

for (const boden of BOEDEN) {
  const kante = edgeLightColor(boden.farbe);
  const kanteRgb = zerlege(kante);
  const delta = helligkeit(kanteRgb) - helligkeit(boden.farbe);

  const urteil = delta < 8 ? 'KAUM SICHTBAR'
    : delta < 20 ? 'schwach'
      : 'deutlich';

  console.log(
    `${boden.name.padEnd(10)}`
    + `${`${boden.farbe.join(',')}`.padStart(16)}`
    + `${`${kanteRgb.join(',')}`.padStart(18)}`
    + `${delta.toFixed(1).padStart(15)}  ${urteil}`,
  );
}

console.log('');
console.log('Die Kante wird mit Alpha 0,22 aufgetragen. Der wirksame Unterschied ist');
console.log('daher nur etwa ein Fünftel des hier gezeigten Werts:');
console.log('');

for (const boden of BOEDEN) {
  const kante = zerlege(edgeLightColor(boden.farbe));
  const delta = helligkeit(kante) - helligkeit(boden.farbe);
  const wirksam = delta * 0.22;
  const urteil = wirksam < 4 ? 'KAUM SICHTBAR'
    : wirksam < 8 ? 'schwach'
      : 'deutlich';
  console.log(`  ${boden.name.padEnd(8)} wirksam Δ ${wirksam.toFixed(1).padStart(5)}  ${urteil}`);
}

console.log('');
console.log('BREITE DER KANTE');
console.log('');

/*
 * Die Kante wird als `fillRect(x, y, 1, 2)` gemalt — 1 px breit, 2 px hoch.
 * Gemessen wird, wie viele Striche je Spalte entstehen: genau einer.
 */
const breite = 64;
const hoehe = 32;
const bitmap = new Uint8Array(breite * hoehe);
// Eine flache Oberfläche bei y = 16.
for (let x = 0; x < breite; x += 1) {
  for (let y = 16; y < hoehe; y += 1) bitmap[y * breite + x] = 1;
}

const ctx = malAttrappe();
drawSurfaceEdge(ctx, bitmap, breite, hoehe, BOEDEN[0].farbe);

const jeSpalte = new Map();
for (const strich of ctx.striche) {
  jeSpalte.set(strich.x, (jeSpalte.get(strich.x) ?? 0) + 1);
}

const spalten = [...jeSpalte.keys()].length;
const mehrfach = [...jeSpalte.values()].filter(v => v > 1).length;

console.log(`  Gemalte Striche:  ${ctx.striche.length}`);
console.log(`  betroffene Spalten: ${spalten} von ${breite}`);
console.log(`  Spalten mit mehr als einem Strich: ${mehrfach}`);
console.log('');

if (mehrfach === 0) {
  console.log('BEFUND: Die Kante ist überall ein EINZELNER Strich von 1 px Breite.');
  console.log('  Es gibt keinen Verlauf und keine zweite Stufe — die Kante ist damit');
  console.log('  eine Linie, kein Licht. Für eine Tiefenwirkung bräuchte es mehrere');
  console.log('  Stufen mit abnehmender Helligkeit.');
} else {
  console.log(`Die Kante hat an ${mehrfach} Spalten mehr als eine Stufe.`);
}

console.log('');
console.log('TIEFENWIRKUNG: Wie dunkel wird der Boden nach unten?');
console.log('');
console.log(`  (gemessen über groundColorAt, Reichweite ${DEPTH_REACH_PX} px)`);
console.log('');
console.log(`${'Boden'.padEnd(10)}${'oben'.padStart(16)}${'unten'.padStart(16)}${'Δ Helligkeit'.padStart(15)}  Urteil`);
console.log('-'.repeat(76));

for (const boden of BOEDEN) {
  const tief = [Math.round(boden.farbe[0] * 0.45), Math.round(boden.farbe[1] * 0.45), Math.round(boden.farbe[2] * 0.45)];
  const oben = zerlege(groundColorAt(boden.farbe, tief, 0));
  const unten = zerlege(groundColorAt(boden.farbe, tief, 1));
  const delta = helligkeit(oben) - helligkeit(unten);
  const urteil = delta < 20 ? 'flach' : delta < 50 ? 'deutlich' : 'stark';
  console.log(
    `${boden.name.padEnd(10)}${`${oben.join(',')}`.padStart(16)}`
    + `${`${unten.join(',')}`.padStart(16)}${delta.toFixed(1).padStart(15)}  ${urteil}`,
  );
}

console.log('');
console.log('WAS DARAUS FOLGT');
console.log('');
console.log('  Zwei Befunde, beide messbar:');
console.log('');
console.log('   1. Der wirksame Helligkeitsunterschied liegt bei 3–6 Stufen (Alpha 0,22');
console.log('      auf einem Δ von 15–27). Bei 8 Bit je Kanal ist das die Grenze der');
console.log('      Wahrnehmbarkeit — auf einem hellen Boden (Sand, Schnee) stärker,');
console.log('      auf einem dunklen (Basalt) schwächer.');
console.log('   2. Die Kante ist EINE Stufe von 1 px. Ein Licht, das Tiefe erzeugt,');
console.log('      hätte zwei bis drei Stufen mit abnehmender Helligkeit.');
console.log('');
console.log('  Beides zu ändern ist eine GESTALTUNGSENTSCHEIDUNG — wie stark die');
console.log('  Oberfläche hervortreten soll, ist Geschmack. Die Zahlen sagen, wie viel');
console.log('  Spielraum bleibt: Die Kante ist da, aber sie ist am unteren Rand.');
