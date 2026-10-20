/**
 * Klanganalyse in Node: Pegel, Spektrum, Spektrogramm, WAV und PNG.
 * Arbeitet auf Float32-Feldern (aus dem OfflineAudioContext), ohne Browser.
 */
import zlib from 'node:zlib';

const dB = x => (x > 1e-9 ? 20 * Math.log10(x) : -180);

/** Radix-2-FFT, in place; re/im Länge 2^n. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const w = (-2 * Math.PI) / len;
    const wr = Math.cos(w);
    const wi = Math.sin(w);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k; const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Spektraler Schwerpunkt (Hz) eines Signals, gewichtet mit der Leistung. */
export function schwerpunkt(signal, sr) {
  let n = 1;
  while (n < signal.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(signal);
  fft(re, im);
  let summe = 0; let gewicht = 0;
  for (let k = 1; k < n / 2; k += 1) {
    const p = re[k] * re[k] + im[k] * im[k];
    summe += p * ((k * sr) / n);
    gewicht += p;
  }
  return gewicht > 0 ? summe / gewicht : 0;
}

/**
 * Kennzahlen eines Stereo-Renderings.
 * @returns {{dauer:number, ende:number, peakDb:number, rmsDb:number, schwerpunkt:number,
 *   endpegelDb:number, nan:boolean, ueber0dB:boolean}}
 */
export function kennzahlen(links, rechts, sr) {
  const n = links.length;
  let peak = 0; let summe = 0; let nan = false;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const l = links[i]; const r = rechts[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan = true; continue; }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    mono[i] = (l + r) / 2;
    summe += mono[i] * mono[i];
  }
  // Hüllkurve in 10-ms-Blöcken: Dauer = letzter Block über −60 dB (relativ zur Spitze),
  // Endpegel = Spitze der letzten 50 ms.
  const block = Math.floor(sr * 0.01);
  let letzter = 0;
  const grenze = peak * 10 ** (-60 / 20);
  for (let b = 0; b * block < n; b += 1) {
    let m = 0;
    for (let i = b * block; i < Math.min(n, (b + 1) * block); i += 1) m = Math.max(m, Math.abs(mono[i]));
    if (m > grenze) letzter = (b + 1) * block;
  }
  let ende = 0;
  for (let i = Math.max(0, n - Math.floor(sr * 0.05)); i < n; i += 1) {
    ende = Math.max(ende, Math.abs(links[i]) || 0, Math.abs(rechts[i]) || 0);
  }
  return {
    dauer: letzter / sr,
    peakDb: dB(peak),
    rmsDb: dB(Math.sqrt(summe / n)),
    schwerpunkt: schwerpunkt(mono, sr),
    endpegelDb: dB(ende),
    nan,
    ueber0dB: peak > 1,
  };
}

/** Spektrogramm als Matrix [zeit][bin] in dB (Fenster 1024, Sprung 512, bis `maxHz`). */
export function spektrogramm(signal, sr, { fenster = 1024, sprung = 512, maxHz = 12000 } = {}) {
  const bins = Math.floor((maxHz / sr) * fenster);
  const hann = Float64Array.from({ length: fenster }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fenster - 1)));
  const spalten = [];
  for (let start = 0; start + fenster <= signal.length; start += sprung) {
    const re = new Float64Array(fenster);
    const im = new Float64Array(fenster);
    for (let i = 0; i < fenster; i += 1) re[i] = signal[start + i] * hann[i];
    fft(re, im);
    const spalte = new Float32Array(bins);
    for (let k = 0; k < bins; k += 1) spalte[k] = dB(Math.hypot(re[k], im[k]) / fenster * 4);
    spalten.push(spalte);
  }
  return { spalten, bins };
}

const FARBEN = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function farbe(dbWert) {
  const t = Math.max(0, Math.min(1, (dbWert + 100) / 100)) * (FARBEN.length - 1);
  const i = Math.min(FARBEN.length - 2, Math.floor(t));
  const f = t - i;
  return FARBEN[i].map((c, k) => Math.round(c + (FARBEN[i + 1][k] - c) * f));
}

/** Zeichnet ein Spektrogramm in einen RGB-Puffer der Größe breite×hoehe (Zeit x, Frequenz y, tief unten). */
export function malSpektrogramm(sp, rgb, breite, hoehe, ox, oy, w, h) {
  const spalten = sp.spalten;
  for (let x = 0; x < w; x += 1) {
    const s = spalten[Math.min(spalten.length - 1, Math.floor((x / w) * spalten.length))];
    for (let y = 0; y < h; y += 1) {
      const bin = Math.min(sp.bins - 1, Math.floor(((h - 1 - y) / h) * sp.bins));
      const c = s ? farbe(s[bin]) : FARBEN[0];
      const o = ((oy + y) * breite + ox + x) * 3;
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (art, daten) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
  const teil = Buffer.concat([Buffer.from(art), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(teil));
  return Buffer.concat([len, teil, crc]);
};

/** PNG (RGB, 8 Bit) aus einem Pixelpuffer. */
export function pngKodieren(rgb, breite, hoehe) {
  const zeilen = Buffer.alloc((breite * 3 + 1) * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    zeilen[y * (breite * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * breite * 3, breite * 3).copy(zeilen, y * (breite * 3 + 1) + 1);
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0); kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; kopf[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', kopf), chunk('IDAT', zlib.deflateSync(zeilen, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** WAV (16 Bit, mono) aus einem Float-Signal. */
export function wavKodieren(signal, sr) {
  const daten = Buffer.alloc(signal.length * 2);
  for (let i = 0; i < signal.length; i += 1) {
    daten.writeInt16LE(Math.round(Math.max(-1, Math.min(1, signal[i])) * 32767), i * 2);
  }
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0); kopf.writeUInt32LE(36 + daten.length, 4); kopf.write('WAVEfmt ', 8);
  kopf.writeUInt32LE(16, 16); kopf.writeUInt16LE(1, 20); kopf.writeUInt16LE(1, 22);
  kopf.writeUInt32LE(sr, 24); kopf.writeUInt32LE(sr * 2, 28); kopf.writeUInt16LE(2, 32); kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36); kopf.writeUInt32LE(daten.length, 40);
  return Buffer.concat([kopf, daten]);
}
