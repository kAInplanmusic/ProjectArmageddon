#!/usr/bin/env node
/**
 * Schritt 0 des Seil-Entwurfs (`docs/auftraege/seil.md`): Machbarkeitsmessung der Pendelrechnung.
 *
 * Beantwortet zwei Fragen, BEVOR irgendetwas in den Motor kommt:
 *   1. Ist die Rechnung bitgleich reproduzierbar (zwei Läufe, gleicher Hash)? Sie nutzt nur +, −, ·, / und
 *      Math.sqrt (nach IEEE 754 exakt gerundet) — KEIN Math.sin/cos/hypot, deren letzte Bits je Maschine
 *      abweichen dürfen.
 *   2. Driftet die Energie? Ein Pendel ohne Dämpfung darf keine Energie GEWINNEN (Gewinn ≈ 0); ein kleiner,
 *      stetiger Verlust ist als Dämpfung hinnehmbar und wird ausgewiesen.
 *
 * Verfahren: ortsbasiert (Verlet mit Längenzwang). Je Takt `vy += g`, Ort fortschreiben, dann die Figur auf
 * den Kreis um den Anker zurückführen; die Geschwindigkeit ist die tatsächliche Ortsänderung.
 *
 * Aufruf: node scripts/seil-pendel-messung.mjs [--takte=N] [--json]
 * Die Schwerkraft 0,42 px/Takt² ist die der Figuren (`systems/characterSystem.js`).
 */
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const TAKTE = Number(arg('takte') ?? 10_000);
const G = 0.42;

function lauf({ laenge, startWinkelGrad, daempfung = 0 }) {
  const ax = 1000; const ay = 300;
  // Start: waagerecht-ähnliche Lage ohne Geschwindigkeit; Winkel nur über Seitenverhältnis, ohne sin/cos.
  const a = startWinkelGrad / 90; // 0 = senkrecht unten, 1 = waagerecht
  const dx0 = laenge * a;
  let x = ax + dx0;
  let y = ay + Math.sqrt(Math.max(0, laenge * laenge - dx0 * dx0));
  let vx = 0; let vy = 0;
  const energie = (px, py, ux, uy) => 0.5 * (ux * ux + uy * uy) - G * py; // y nach unten: tiefer = weniger Energie
  const e0 = energie(x, y, vx, vy);
  let eMin = e0; let eMax = e0;
  const puffer = new Float64Array(2); const bits = new Uint32Array(puffer.buffer);
  let hash = 0x811c9dc5;
  for (let t = 0; t < TAKTE; t += 1) {
    const ox = x; const oy = y;
    vy += G;
    x += vx; y += vy;
    const dx = x - ax; const dy = y - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > laenge) { const f = laenge / d; x = ax + dx * f; y = ay + dy * f; }
    vx = (x - ox) * (1 - daempfung); vy = (y - oy) * (1 - daempfung);
    const e = energie(x, y, vx, vy);
    if (e < eMin) eMin = e;
    if (e > eMax) eMax = e;
    puffer[0] = x; puffer[1] = y;
    for (const w of bits) { hash ^= w; hash = Math.imul(hash, 0x01000193) >>> 0; }
  }
  const ende = energie(x, y, vx, vy);
  return {
    laenge, startWinkelGrad, daempfung, hash: hash.toString(16),
    energieStart: e0, energieEnde: ende, abweichungEnde: ende - e0, spanne: eMax - eMin,
    gewinnProzentVonHub: 100 * Math.max(0, eMax - e0) / (G * laenge),
    verlustProzentVonHub: 100 * Math.max(0, e0 - eMin) / (G * laenge),
  };
}

const faelle = [
  { laenge: 120, startWinkelGrad: 60 }, { laenge: 240, startWinkelGrad: 80 }, { laenge: 400, startWinkelGrad: 45 },
  { laenge: 240, startWinkelGrad: 80, daempfung: 0.0005 },
];
const ergebnis = faelle.map(f => {
  const a = lauf(f); const b = lauf(f);
  return { ...a, zweiterLaufGleich: a.hash === b.hash };
});
if (process.argv.includes('--json')) console.log(JSON.stringify(ergebnis, null, 2));
else {
  console.log(`Takte: ${TAKTE}, g = ${G} px/Takt²`);
  for (const r of ergebnis) {
    console.log(`L=${String(r.laenge).padStart(3)} Start ${r.startWinkelGrad}° Dämpfung ${r.daempfung}: hash ${r.hash} gleich=${r.zweiterLaufGleich}  `
      + `E-Ende−E-Start ${r.abweichungEnde.toFixed(2)}  Gewinn ${r.gewinnProzentVonHub.toFixed(1)} % / Verlust ${r.verlustProzentVonHub.toFixed(1)} % des Hubs`);
  }
}
process.exit(ergebnis.every(r => r.zweiterLaufGleich) ? 0 : 1);
