#!/usr/bin/env node
/**
 * Messung Kartenqualität (TODO 2.3, Vorarbeit für Geländefassung 15): Wie viele Karten fallen unter welche Schwelle?
 *
 * Je Seed ein echtes Match (Menüweg `neuesMatch`, gestartet), gemessen auf der fertigen Karte und den echten Startplätzen:
 *
 *  - Enge: lichte Höhe über jedem begehbaren Boden (Luft über festem Boden bis zur nächsten Decke). Eine Figur ist
 *    20 px hoch (`PLAYER_HALF_HEIGHT` · 2). `stecken` = Bodenspalten mit Decke unter 22 px (Figur passt nicht);
 *    `eng` = 22 bis unter 32 px (passt, kann nicht springen). Gezählt nur unter einer Decke, als Anteil am Boden.
 *    `engpaesse` = zusammenhängende Läufe von mindestens 8 Spalten mit Decke unter 32 px.
 *  - Startfairness: je Team Mittel aus Abstand zum nächsten Gegner und Standhöhe; `hoehenVorteil` = größter
 *    Unterschied der mittleren Standhöhe zweier Teams (px), `abstandsVerhaeltnis` = größter / kleinster Mittelwert.
 *  - Erreichbarkeit (`match.erreichbarkeit.ok`) und Matchstart-Zeit (Bau + Start, ms).
 *
 * Nur Messung. Aufruf: node scripts/messung-kartenqualitaet.mjs [--seeds=500] [--format=24:9] [--groesse=mittel] [--json]
 */
import { neuesMatch } from './bot-partien.mjs';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

const FIGUR = PLAYER_HALF_HEIGHT * 2;
const STECKEN = FIGUR + 2;
const ENG = FIGUR + 12;
const ENGPASS_LAUF = 8;

/** Luftzellen, die von den Startplätzen aus zusammenhängen (4er-Nachbarschaft). Taschen im Fels zählen nicht. */
export function erreichbareLuft(bitmap, width, height, starts) {
  const luft = new Uint8Array(width * height);
  const schlange = new Int32Array(width * height);
  let kopf = 0; let ende = 0;
  for (const { x, y } of starts) {
    const i = Math.floor(y) * width + Math.floor(x);
    if (i >= 0 && i < luft.length && !bitmap[i] && !luft[i]) { luft[i] = 1; schlange[ende++] = i; }
  }
  while (kopf < ende) {
    const i = schlange[kopf++]; const x = i % width;
    for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
      if (j >= 0 && j < luft.length && !bitmap[j] && !luft[j]) { luft[j] = 1; schlange[ende++] = j; }
    }
  }
  return luft;
}

/**
 * Wohin passt eine Figur (Kasten 10 × 20 px um den Mittelpunkt), von den Startplätzen aus zusammenhängend?
 * Rechnet über eine Summentabelle der festen Zellen; Fliegen ist erlaubt (es geht um die Geometrie der Gänge, nicht ums Laufen).
 */
export function figurRaum(bitmap, width, height, starts, halbB = 5, halbH = PLAYER_HALF_HEIGHT) {
  const W = width + 1;
  const summe = new Int32Array(W * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let zeile = 0;
    for (let x = 0; x < width; x += 1) { zeile += bitmap[y * width + x] ? 1 : 0; summe[(y + 1) * W + x + 1] = summe[y * W + x + 1] + zeile; }
  }
  const frei = (x, y) => {
    const x0 = x - halbB; const x1 = x + halbB + 1; const y0 = y - halbH; const y1 = y + halbH + 1;
    if (x0 < 0 || y0 < 0 || x1 > width || y1 > height) return false;
    return summe[y1 * W + x1] - summe[y0 * W + x1] - summe[y1 * W + x0] + summe[y0 * W + x0] === 0;
  };
  const raum = new Uint8Array(width * height);
  const schlange = new Int32Array(width * height);
  let kopf = 0; let ende = 0;
  for (const st of starts) {
    // Startpunkt: der Figurenmittelpunkt, notfalls bis 6 px darüber (Rundung am Boden).
    for (let d = 0; d <= 6; d += 1) {
      const x = Math.round(st.x); const y = Math.round(st.y) - d;
      if (frei(x, y)) { const i = y * width + x; if (!raum[i]) { raum[i] = 1; schlange[ende++] = i; } break; }
    }
  }
  while (kopf < ende) {
    const i = schlange[kopf++]; const x = i % width; const y = (i - x) / width;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (!raum[j] && frei(nx, ny)) { raum[j] = 1; schlange[ende++] = j; }
    }
  }
  return raum;
}

/** Steiler als 1,5 (die Engine steigt bis 1,4, `config/bewegung.js`)? Vergleicht die Bodenhöhe 4 px links und rechts. */
function zuSteil(bitmap, width, x, y) {
  const boden = xx => {
    for (let d = 0; d <= 8; d += 1) {
      for (const yy of [y - d, y + d]) if (yy > 0 && bitmap[yy * width + xx] && !bitmap[(yy - 1) * width + xx]) return yy;
    }
    return null;
  };
  const l = boden(x - 4); const r = boden(x + 4);
  return l === null || r === null || Math.abs(l - y) > 6 || Math.abs(r - y) > 6;
}

/**
 * Abgeschnittener Boden: begehbare Stellen (Decke ≥ 22 px oder offen), die Luft von den Startplätzen erreicht, eine Figur aber nicht
 * (sie liegen hinter einem Gang, der dünner ist als die Figur). Anteil am erreichbaren begehbaren Boden.
 */
export function abgeschnitten(bitmap, width, height, luft, raum) {
  let begehbar = 0; let weg = 0;
  // Längster Lauf benachbarter Spalten mit abgeschnittenem Boden (Höhenunterschied ≤ 12 px je Spalte): eine ganze
  // unerreichbare Fläche statt eines Keils unter einem Überhang.
  let lauf = 0; let laufY = -1; let groessterLauf = 0;
  for (let x = PLAYER_HALF_HEIGHT; x < width - PLAYER_HALF_HEIGHT; x += 1) {
    let spalteY = -1;
    for (let y = height - 1; y > FIGUR + 2; y -= 1) {
      if (!bitmap[y * width + x] || bitmap[(y - 1) * width + x] || !luft[(y - 1) * width + x]) continue;
      let frei = true;
      for (let yy = y - 1; yy >= y - STECKEN; yy -= 1) if (bitmap[yy * width + x]) { frei = false; break; }
      if (!frei) continue;
      if (zuSteil(bitmap, width, x, y)) continue; // steiler als die Engine steigt: kein Stand
      begehbar += 1;
      // Am Hang steht die Figur ein paar Pixel höher (der Kasten ist 10 px breit): bis 8 px Anhebung zählen als erreicht.
      let drin = false;
      for (let d = 0; d <= 8 && !drin; d += 1) { const yy = y - 1 - PLAYER_HALF_HEIGHT - d; if (yy >= 0 && raum[yy * width + x]) drin = true; }
      if (!drin) {
        weg += 1;
        if (spalteY < 0 || (laufY >= 0 && Math.abs(y - laufY) < Math.abs(spalteY - laufY))) spalteY = y;
      }
    }
    if (spalteY >= 0 && (laufY < 0 || Math.abs(spalteY - laufY) <= 12)) { lauf += 1; laufY = spalteY; } else if (spalteY >= 0) { lauf = 1; laufY = spalteY; } else { lauf = 0; laufY = -1; }
    groessterLauf = Math.max(groessterLauf, lauf);
  }
  return { begehbar, abgeschnittenAnteil: begehbar ? weg / begehbar : 0, abgeschnittenLauf: groessterLauf };
}

/** Enge-Kennzahlen einer Karte (Bitmap 1 = fest); nur Boden, über dem erreichbare Luft liegt. */
export function enge(bitmap, width, height, luft = null) {
  let boden = 0; let stecken = 0; let eng = 0; let engpaesse = 0; let lauf = 0;
  for (let x = 0; x < width; x += 1) {
    let engeSpalte = false;
    // Von unten nach oben: jede Oberkante eines festen Stücks mit Luft darüber ist ein Boden.
    for (let y = height - 1; y > 0; y -= 1) {
      if (!bitmap[y * width + x] || bitmap[(y - 1) * width + x]) continue;
      if (luft && !luft[(y - 1) * width + x]) continue;
      boden += 1;
      let h = 0;
      let yy = y - 1;
      while (yy >= 0 && !bitmap[yy * width + x]) { h += 1; yy -= 1; }
      if (yy < 0) continue; // offener Himmel: keine Decke
      if (h < STECKEN) stecken += 1;
      else if (h < ENG) { eng += 1; engeSpalte = true; }
      if (h < ENG) engeSpalte = true;
    }
    if (engeSpalte) lauf += 1;
    else { if (lauf >= ENGPASS_LAUF) engpaesse += 1; lauf = 0; }
  }
  if (lauf >= ENGPASS_LAUF) engpaesse += 1;
  return { boden, steckenAnteil: boden ? stecken / boden : 0, engAnteil: boden ? eng / boden : 0, engpaesse };
}

/** Startfairness aus den Figuren `{x, y, teamId}`. */
export function fairness(figuren) {
  const teams = new Map();
  for (const f of figuren) {
    let d = Infinity;
    for (const g of figuren) if (g.teamId !== f.teamId) d = Math.min(d, Math.hypot(g.x - f.x, g.y - f.y));
    const t = teams.get(f.teamId) ?? { d: 0, y: 0, n: 0 };
    t.d += d; t.y += f.y; t.n += 1;
    teams.set(f.teamId, t);
  }
  const mittel = [...teams.values()].map(t => ({ d: t.d / t.n, y: t.y / t.n }));
  const ds = mittel.map(m => m.d); const ys = mittel.map(m => m.y);
  return {
    hoehenVorteil: Math.round(Math.max(...ys) - Math.min(...ys)),
    abstandsVerhaeltnis: Math.round((Math.max(...ds) / Math.max(1, Math.min(...ds))) * 100) / 100,
    naechsterMin: Math.round(Math.min(...ds)),
  };
}

export function miss(seed, extra = {}) {
  const t0 = performance.now();
  const m = neuesMatch(seed, 4, { teams: 2, proTeam: 3, extra });
  if (m.status !== 'playing') m.start();
  const ms = performance.now() - t0;
  const s = m.getState();
  const figuren = s.entities.filter(e => e.teamId !== undefined && e.alive !== false && Number.isFinite(e.x)).map(e => ({ x: e.x, y: e.y, teamId: e.teamId }));
  return {
    seed, ms: Math.round(ms), width: m.width, height: m.height,
    kartenart: m.kartencharakter?.kartenart ?? null, biom: m.biomId,
    erreichbar: m.erreichbarkeit?.ok ?? null,
    ...(() => {
      const luft = erreichbareLuft(m.bitmap, m.width, m.height, figuren);
      const raum = figurRaum(m.bitmap, m.width, m.height, figuren);
      return { ...enge(m.bitmap, m.width, m.height, luft), ...abgeschnitten(m.bitmap, m.width, m.height, luft, raum) };
    })(),
    ...fairness(figuren),
  };
}

const istHaupt = import.meta.url === `file://${process.argv[1]}`;
if (istHaupt) {
  const arg = (n, v) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? v;
  const seeds = Number(arg('seeds', 500));
  const extra = {};
  if (arg('format', null)) extra.format = arg('format', null);
  if (arg('groesse', null)) extra.groesse = arg('groesse', null);
  const zeilen = [];
  for (let seed = 1; seed <= seeds; seed += 1) zeilen.push(miss(seed, extra));
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ extra, zeilen })); process.exit(0); }
  const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const anteil = f => `${zeilen.filter(f).length}/${zeilen.length}`;
  console.log(`Kartenqualität, ${seeds} Seeds, ${JSON.stringify(extra)}`);
  console.log(`Matchstart ms: Median ${q(zeilen.map(z => z.ms), 0.5)}, p95 ${q(zeilen.map(z => z.ms), 0.95)}, max ${Math.max(...zeilen.map(z => z.ms))}`);
  console.log(`unerreichbar: ${anteil(z => z.erreichbar === false)}`);
  console.log(`Stecken (Decke < ${STECKEN} px) über 1 % des Bodens: ${anteil(z => z.steckenAnteil > 0.01)}; Engpässe ≥ 1: ${anteil(z => z.engpaesse > 0)}`);
  console.log(`Abgeschnittene Fläche ≥ 60 px breit: ${anteil(z => z.abgeschnittenLauf >= 60)}; ≥ 120 px: ${anteil(z => z.abgeschnittenLauf >= 120)}`);
  console.log(`Abgeschnitten (hinter zu dünnem Gang) über 2 %: ${anteil(z => z.abgeschnittenAnteil > 0.02)}; über 5 %: ${anteil(z => z.abgeschnittenAnteil > 0.05)}; p95 ${(q(zeilen.map(z => z.abgeschnittenAnteil), 0.95) * 100).toFixed(1)} %`);
  console.log(`Höhenvorteil > 150 px: ${anteil(z => z.hoehenVorteil > 150)}; Abstandsverhältnis > 1,6: ${anteil(z => z.abstandsVerhaeltnis > 1.6)}; nächster Gegner < 120 px: ${anteil(z => z.naechsterMin < 120)}`);
  const jeArt = {};
  for (const z of zeilen) {
    const a = (jeArt[z.kartenart] ??= { n: 0, stecken: 0, eng: 0, hoehe: 0, abstand: 0, unerr: 0 });
    a.n += 1; a.ab = (a.ab ?? 0) + (z.abgeschnittenLauf >= 60); a.stecken += z.steckenAnteil > 0.01; a.eng += z.engpaesse > 0; a.hoehe += z.hoehenVorteil > 150; a.abstand += z.abstandsVerhaeltnis > 1.6; a.unerr += z.erreichbar === false;
  }
  console.log('| Kartenart | n | abgeschnitten ≥60 px | Stecken >1 % | Engpass | Höhenvorteil >150 | Abstand >1,6 | unerreichbar |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [art, a] of Object.entries(jeArt).sort()) console.log(`| ${art} | ${a.n} | ${a.ab} | ${a.stecken} | ${a.eng} | ${a.hoehe} | ${a.abstand} | ${a.unerr} |`);
}
