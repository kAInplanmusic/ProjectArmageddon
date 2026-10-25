#!/usr/bin/env node
/**
 * Schneidet die Gelände-Kacheln des Auftraggebers aus dem Tile-Sheet.
 *
 * Quelle: `assets/gelaende-quelle/sheet-a-sidecut.jpg` (26 nummerierte Kacheln, 7 Spalten).
 * Das Raster wird aus den dunklen Trennfugen bestimmt (Zeilen- und Spaltenhelligkeit über
 * ImageMagick-Profile), nicht fest eingetragen. Jede Kachel wird um ~12 % eingerückt
 * (entfernt die Nummer), auf 512 px skaliert und per 50-%-Rollen + weicher Kreuzmaske
 * nahtlos geblendet. Ausgabe: `src/client/assets/stoff-texturen/<name>.jpg` (JPEG 82).
 *
 * Kontrolle: `assets/gelaende-quelle/kontrolle.jpg` zeigt jede Textur 4x4 gekachelt.
 *
 * Aufruf: `node scripts/kacheln-schneiden.mjs`
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');
const QUELLE = join(WURZEL, 'assets', 'gelaende-quelle', 'sheet-a-sidecut.jpg');
const ZIEL = join(WURZEL, 'src', 'client', 'assets', 'stoff-texturen');
const KONTROLLE = join(WURZEL, 'assets', 'gelaende-quelle', 'kontrolle.jpg');

/** A-Nummer (Reihenfolge links-rechts, oben-unten) → Dateiname der Stofftextur. */
const NAMEN = Object.freeze({
  3: 'sand',
  7: 'basalt',
  9: 'eis',
  10: 'pilz',
  11: 'holz',
  16: 'beton',
  21: 'obsidian',
  22: 'regolith',
});

const UMFANG = 0.12; // Innenrand je Seite (Nummer oben links verschwindet)
const ZIEL_KANTE = 512;
const QUALITAET = 82;
const MAX_BYTES = 120 * 1024;
const UEBERBLENDUNG = 64; // weiche Zone um das Fugenkreuz nach dem Rollen

function magick(args, opts = {}) {
  return execFileSync('convert', args, {
    encoding: opts.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  });
}

/** @returns {{breite:number, hoehe:number}} */
function masse(pfad) {
  const txt = execFileSync('identify', ['-format', '%w %h', pfad], {
    encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
  });
  const [breite, hoehe] = txt.trim().split(/\s+/).map(Number);
  return { breite, hoehe };
}

/** Helligkeitsprofil einer Achse: ein Pixel je Zeile bzw. Spalte (Graustufen). */
function profil(achse, laenge, von = 0, bis = null) {
  const groesse = achse === 'x' ? `${laenge}x1!` : `1x${laenge}!`;
  const args = [QUELLE];
  if (bis !== null && bis > von) args.push('-crop', `${achse === 'x' ? laenge : 1}x${bis - von}+0+${von}`, '+repage');
  args.push('-colorspace', 'Gray', '-resize', groesse, '-depth', '8', 'txt:-');
  const txt = magick(args);
  const werte = [];
  for (const zeile of txt.split('\n')) {
    const m = zeile.match(/^[-+]?\d+,[-+]?\d+:\s*\(([^)]+)\)/);
    if (!m) continue;
    const teile = m[1].split(',').map(Number);
    // Graustufe: r=g=b; Mittelwert ist robust gegen minimale Farbabweichungen.
    werte.push((teile[0] + (teile[1] ?? teile[0]) + (teile[2] ?? teile[0])) / 3);
  }
  return werte;
}

function glaetten(werte, fenster = 11) {
  const halb = Math.floor(fenster / 2);
  return werte.map((_, i) => {
    let summe = 0; let anzahl = 0;
    for (let j = Math.max(0, i - halb); j <= Math.min(werte.length - 1, i + halb); j += 1) {
      summe += werte[j]; anzahl += 1;
    }
    return summe / anzahl;
  });
}

function quantil(werte, q) {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.min(sortiert.length - 1, Math.max(0, Math.round((sortiert.length - 1) * q)))];
}

/**
 * Findet helle Bänder (Kacheln) zwischen dunklen Trennfugen.
 * @returns {{start:number, ende:number}[]} inklusive Endindex
 */
function baender(werte, minLaenge) {
  const glatt = glaetten(werte);
  const bg = quantil(glatt, 0.10);
  const median = quantil(glatt, 0.50);
  const schwelle = bg + 0.22 * (median - bg);
  if (process.env.KACHELN_DEBUG) console.error('Schwelle', { bg, median, schwelle });
  const hell = glatt.map(v => v > schwelle);

  // Kleine Löcher (helle Blitzer in der Fuge) und kurze Einbrüche schließen.
  const laeufe = [];
  let start = -1;
  for (let i = 0; i <= hell.length; i += 1) {
    const an = i < hell.length && hell[i];
    if (an && start < 0) start = i;
    if (!an && start >= 0) { laeufe.push({ start, ende: i - 1 }); start = -1; }
  }
  const geschlossen = [];
  for (const lauf of laeufe) {
    const letzter = geschlossen[geschlossen.length - 1];
    if (letzter && lauf.start - letzter.ende - 1 < 3) letzter.ende = lauf.ende;
    else geschlossen.push({ ...lauf });
  }
  return geschlossen.filter(l => l.ende - l.start + 1 >= minLaenge);
}

function mitte(lauf) { return (lauf.start + lauf.ende + 1) / 2; }
function breite(lauf) { return lauf.ende - lauf.start + 1; }
function medianZahl(zahlen) {
  const s = [...zahlen].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Ermittelt das Kachelraster aus den Helligkeitsprofilen. */
function raster() {
  const { breite: B, hoehe: H } = masse(QUELLE);
  const zeilen = baender(profil('y', H), Math.round(H * 0.12));
  // Spaltenprofil nur über die vollen Zeilen (die letzte Zeile ist ggf. unvollständig und dunkler).
  const volleBis = zeilen.length >= 2 ? zeilen[zeilen.length - 2].ende : null;
  const spalten = baender(profil('x', B, zeilen[0]?.start ?? 0, volleBis), Math.round(B * 0.08));
  if (process.env.KACHELN_DEBUG) console.error('Bänder', { zeilen, spalten });
  if (zeilen.length !== 4 || spalten.length !== 7) {
    throw new Error(`Raster nicht erkannt: ${zeilen.length} Zeilen, ${spalten.length} Spalten`);
  }
  return { breite: B, hoehe: H, zeilen, spalten };
}

/** Kachel-Nummer → Rasterzelle (0-basiert). */
function zelle(nummer, spalten) {
  const i = nummer - 1;
  return { zeile: Math.floor(i / spalten), spalte: i % spalten };
}

function schneide(name, nummer, r) {
  const { zeile, spalte } = zelle(nummer, r.spalten.length);
  const z = r.zeilen[zeile];
  const s = r.spalten[spalte];
  if (!z || !s) throw new Error(`A${nummer} liegt außerhalb des Rasters`);

  const kachelH = medianZahl(r.zeilen.map(breite));
  const kachelB = medianZahl(r.spalten.map(breite));
  const x0 = Math.round(mitte(s) - kachelB / 2 + kachelB * UMFANG);
  const y0 = Math.round(mitte(z) - kachelH / 2 + kachelH * UMFANG);
  const w = Math.round(kachelB * (1 - 2 * UMFANG));
  const h = Math.round(kachelH * (1 - 2 * UMFANG));
  const x = Math.max(0, Math.min(r.breite - w, x0));
  const y = Math.max(0, Math.min(r.hoehe - h, y0));
  return { x, y, w, h };
}

function nahtlos(ausschnitt, name, tmp) {
  const original = join(tmp, `${name}-original.png`);
  const gerollt = join(tmp, `${name}-gerollt.png`);
  const maske = join(tmp, `${name}-maske.png`);
  const ziel = join(ZIEL, `${name}.jpg`);

  magick([QUELLE, '-crop', `${ausschnitt.w}x${ausschnitt.h}+${ausschnitt.x}+${ausschnitt.y}`,
    '+repage', '-resize', `${ZIEL_KANTE}x${ZIEL_KANTE}!`, '-strip', original]);
  // 50 % rollen: Die Außenkanten werden dadurch nahtlos, die Fugen liegen im Kreuz.
  magick([original, '-roll', '+256+256', gerollt]);
  // Maske: 1 = Original, 0 = gerollte Fassung. Am Fugenkreuz Original (dort liegt die Naht der
  // gerollten Fassung), an den Bildkanten gerollt (nur dort ist sie zyklisch fortlaufend).
  const schwelle = Math.max(1, Math.round(UEBERBLENDUNG));
  const fx = `dd=min(abs(i-${ZIEL_KANTE / 2}),abs(j-${ZIEL_KANTE / 2}));`
    + ` cc=min(dd/${schwelle},1);`
    + ` ee=min(min(i,${ZIEL_KANTE - 1}-i),min(j,${ZIEL_KANTE - 1}-j));`
    + ` bb=min(ee/${schwelle},1); min(1-cc,bb)`;
  magick(['-size', `${ZIEL_KANTE}x${ZIEL_KANTE}`, 'xc:black', '-fx', fx, maske]);
  magick([gerollt, original, maske, '-composite', '-strip',
    '-sampling-factor', '4:2:0', '-quality', String(QUALITAET), ziel]);

  const groesse = statSync(ziel).size;
  if (groesse >= MAX_BYTES) {
    throw new Error(`${name}.jpg ist ${groesse} B groß (Grenze ${MAX_BYTES} B)`);
  }
  return { name, ziel, groesse, ...ausschnitt };
}

function kontrolle(ergebnisse, tmp) {
  // Jede Textur 4x4 kacheln (Nahtprüfung), daraus eine Übersicht 4 Spalten × 2 Reihen.
  const gefliest = [];
  for (const e of ergebnisse) {
    const datei = join(tmp, `${e.name}-4x4.jpg`);
    const wiederholung = Array.from({ length: 16 }, () => e.ziel);
    execFileSync('montage', [...wiederholung, '-tile', '4x4', '-geometry', '+0+0',
      '-background', '#101418', datei], { env: { ...process.env, LC_ALL: 'C' } });
    gefliest.push(datei);
  }
  execFileSync('montage', [...gefliest, '-tile', '4x2', '-geometry', '512x512+6+6',
    '-background', '#101418', '-strip', '-quality', '86', KONTROLLE],
  { env: { ...process.env, LC_ALL: 'C' } });
}

function main() {
  const r = raster();
  const tmp = mkdtempSync(join(tmpdir(), 'kacheln-'));
  try {
    const ergebnisse = Object.entries(NAMEN)
      .map(([nummer, name]) => nahtlos(schneide(name, Number(nummer), r), name, tmp));
    kontrolle(ergebnisse, tmp);
    const rasterText = `Zeilen ${r.zeilen.map(z => `${z.start}-${z.ende}`).join(', ')}; `
      + `Spalten ${r.spalten.map(s => `${s.start}-${s.ende}`).join(', ')}`;
    console.log(`Raster: ${rasterText}`);
    for (const e of ergebnisse) {
      console.log(`  ${e.name.padEnd(9)} A${Object.keys(NAMEN).find(n => NAMEN[n] === e.name)}`
        + ` → ${e.w}x${e.h}+${e.x}+${e.y} → ${Math.round(e.groesse / 1024)} KB`);
    }
    console.log(`Kontrolle: ${KONTROLLE}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
