/**
 * Umgebungsunabhängiger Bildvergleich (Struktur statt Pixel).
 *
 * ## Warum es das gibt (VIS-1, `docs/offene-punkte.md` §4a)
 *
 * `toHaveScreenshot` zählt abweichende PIXEL. Dieselbe Seite ergibt auf zwei
 * Rechnern aber andere Pixel: Schriftmetriken und Rasterung verschieben Text um
 * 1–2 px und glätten Kanten anders. Gemessen am 2026-10-25: derselbe Code,
 * 104.130 abweichende Pixel (31,6 %), obwohl kein Inhalt anders war. Ein Gate,
 * das auf jedem anderen Knoten rot wird, prüft nicht das Spiel.
 *
 * ## Was stattdessen verglichen wird
 *
 * 1. **Kanten mit Spielraum.** Aus beiden Bildern wird eine Kantenkarte (Sobel
 *    auf Helligkeit) in Zellen von `ZELLE` px gebildet. Eine Kantenzelle des
 *    einen Bildes gilt als gefunden, wenn das andere Bild im Umkreis von
 *    `SPIELRAUM` Zellen ebenfalls eine hat. Ein Versatz von wenigen Pixeln und
 *    anders geglättete Buchstaben fallen damit heraus; ein fehlendes, neues oder
 *    verschobenes Bedienelement nicht.
 * 2. **Flächenfarben mit Spielraum.** Beide Bilder werden in Blöcke von
 *    `BLOCK` px gemittelt. Ein Block gilt als gleich, wenn er einem Block des
 *    anderen Bildes im Umkreis von einem Block in jedem Farbkanal um höchstens
 *    `FARBTOLERANZ` ähnelt. Das fängt, was Kanten nicht sehen: eine andere
 *    Flächenfarbe, ein dunkleres Thema, ein gefülltes statt leeres Feld.
 *
 * 3. **Häufung.** Fehlt nur ein kleines Element, verdünnt der Anteil es unter das
 *    Rauschen. Deshalb zählt zusätzlich die größte Zahl kantenloser Zellen in einem
 *    32-px-Fenster: Rauschen streut, ein fehlender Knopf häuft sich.
 *
 * Geprüft wird in beiden Richtungen (A→B und B→A), weil „fehlt" und „kommt neu
 * hinzu" verschiedene Fehler sind.
 *
 * ## Grenzen (ehrlich)
 *
 * Gleiche Anordnung mit ANDEREM TEXT, gleich langen Wörtern fällt nicht auf: Die
 * Kantenkarte sieht Buchstaben nur als Textur. Dafür sind die DOM-Prüfungen der
 * übrigen Specs da. Dieser Vergleich fängt Layout, Größen, Farben und
 * Vorhandensein — nicht den Wortlaut.
 *
 * Er liegt als eigenes Modul vor (und nicht in der Spec), damit
 * `tests/struktur-vergleich.test.js` ihn mit künstlichen Bildern auf Empfindlichkeit
 * UND Unempfindlichkeit prüfen kann: ein Vergleich, der nie rot wird, ist wertlos.
 */
import { inflateSync, deflateSync } from 'node:zlib';

/** Kantenzelle in Pixeln. */
export const ZELLE = 4;
/** Umkreis in Zellen, in dem eine Gegenkante gesucht wird (±2 Zellen = ±8–11 px). */
export const SPIELRAUM = 2;
/** Sobel-Betrag (Helligkeit 0–255), ab dem ein Pixel als Kante zählt. */
export const KANTENSCHWELLE = 60;
/** Fenstergröße in Zellen für die Häufungsprüfung (8 Zellen = 32 px). */
export const FENSTER = 8;
/** Kantenlänge der Farbblöcke in Pixeln. */
export const BLOCK = 16;
/** Höchster Unterschied je Farbkanal (0–255), den zwei Blöcke haben dürfen. */
export const FARBTOLERANZ = 28;

/** Grenzen des Urteils, gemessen und begründet in `tests/struktur-vergleich.test.js`. */
export const GRENZEN = Object.freeze({
  /** Anteil der Kantenzellen ohne Gegenstück (je Richtung, der größere zählt). */
  kantenAbweichung: 0.06,
  /**
   * Höchste Zahl kantenloser Zellen ohne Gegenstück in EINEM 32-px-Fenster. Fängt, was der Anteil
   * verdünnt: ein einzelner Knopf, ein Etikett oder ein Chip, der fehlt, ist global unter 2 % der
   * Kanten, aber lokal eine Häufung. Rauschen (Glättung, Versatz) streut und häuft sich nicht.
   * Gemessen (Zellen): gleicher Rechner 0–21, fremder Rechner HUD 16; fehlender Knopf/Etikett 32,
   * fehlender Chip 53. Die Grenze liegt dazwischen; der Abstand ist bewusst klein und steht im Test.
   */
  haeufung: 26,
  /** Anteil der Farbblöcke ohne ähnlichen Nachbarn (je Richtung, der größere zählt). */
  farbAbweichung: 0.03,
});

const PNG_KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Liest ein PNG (8 Bit, nicht verschachtelt: Graustufen, Graustufen+Alpha, RGB, RGBA).
 * Das genügt für Bildschirmfotos von Playwright; alles andere wirft einen Fehler.
 * @param {Buffer} puffer
 * @returns {{ breite: number, hoehe: number, rgba: Uint8Array }}
 */
export function leseBild(puffer) {
  if (!Buffer.isBuffer(puffer) || puffer.length < 33 || !puffer.subarray(0, 8).equals(PNG_KOPF)) {
    throw new Error('Kein PNG');
  }
  let position = 8;
  let breite = 0;
  let hoehe = 0;
  let tiefe = 0;
  let farbtyp = 0;
  let verschachtelt = 0;
  const daten = [];
  while (position + 8 <= puffer.length) {
    const laenge = puffer.readUInt32BE(position);
    const typ = puffer.toString('latin1', position + 4, position + 8);
    const inhalt = puffer.subarray(position + 8, position + 8 + laenge);
    if (typ === 'IHDR') {
      breite = inhalt.readUInt32BE(0);
      hoehe = inhalt.readUInt32BE(4);
      tiefe = inhalt[8];
      farbtyp = inhalt[9];
      verschachtelt = inhalt[12];
    } else if (typ === 'IDAT') {
      daten.push(inhalt);
    } else if (typ === 'IEND') {
      break;
    }
    position += 12 + laenge;
  }
  const kanaele = { 0: 1, 2: 3, 4: 2, 6: 4 }[farbtyp];
  if (!breite || !hoehe || tiefe !== 8 || verschachtelt !== 0 || !kanaele) {
    throw new Error(`PNG-Fassung nicht unterstützt (Tiefe ${tiefe}, Farbtyp ${farbtyp}, verschachtelt ${verschachtelt})`);
  }

  const roh = inflateSync(Buffer.concat(daten));
  const zeile = breite * kanaele;
  if (roh.length < (zeile + 1) * hoehe) throw new Error('PNG-Daten unvollständig');
  const pixel = new Uint8Array(zeile * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    const filter = roh[y * (zeile + 1)];
    const von = y * (zeile + 1) + 1;
    const nach = y * zeile;
    for (let x = 0; x < zeile; x += 1) {
      const wert = roh[von + x];
      const links = x >= kanaele ? pixel[nach + x - kanaele] : 0;
      const oben = y > 0 ? pixel[nach - zeile + x] : 0;
      const obenLinks = y > 0 && x >= kanaele ? pixel[nach - zeile + x - kanaele] : 0;
      let vorhersage = 0;
      if (filter === 1) vorhersage = links;
      else if (filter === 2) vorhersage = oben;
      else if (filter === 3) vorhersage = (links + oben) >> 1;
      else if (filter === 4) {
        const p = links + oben - obenLinks;
        const pa = Math.abs(p - links);
        const pb = Math.abs(p - oben);
        const pc = Math.abs(p - obenLinks);
        vorhersage = pa <= pb && pa <= pc ? links : (pb <= pc ? oben : obenLinks);
      } else if (filter !== 0) {
        throw new Error(`Unbekannter PNG-Filter ${filter}`);
      }
      pixel[nach + x] = (wert + vorhersage) & 0xff;
    }
  }

  const rgba = new Uint8Array(breite * hoehe * 4);
  for (let i = 0; i < breite * hoehe; i += 1) {
    const q = i * kanaele;
    if (kanaele === 1 || kanaele === 2) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = pixel[q];
      rgba[i * 4 + 3] = kanaele === 2 ? pixel[q + 1] : 255;
    } else {
      rgba[i * 4] = pixel[q];
      rgba[i * 4 + 1] = pixel[q + 1];
      rgba[i * 4 + 2] = pixel[q + 2];
      rgba[i * 4 + 3] = kanaele === 4 ? pixel[q + 3] : 255;
    }
  }
  return { breite, hoehe, rgba };
}

/**
 * Schreibt ein RGBA-Bild als PNG (für Tests und Diagnose-Ausgaben).
 * @param {{ breite: number, hoehe: number, rgba: Uint8Array }} bild
 * @returns {Buffer}
 */
export function schreibeBild({ breite, hoehe, rgba }) {
  const zeile = breite * 4;
  const roh = Buffer.alloc((zeile + 1) * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    roh[y * (zeile + 1)] = 0;
    roh.set(rgba.subarray(y * zeile, (y + 1) * zeile), y * (zeile + 1) + 1);
  }
  const chunk = (typ, inhalt) => {
    const kopf = Buffer.alloc(8);
    kopf.writeUInt32BE(inhalt.length, 0);
    kopf.write(typ, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), inhalt])) >>> 0, 0);
    return Buffer.concat([kopf, inhalt, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([PNG_KOPF, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(roh)), chunk('IEND', Buffer.alloc(0))]);
}

let crcTabelle = null;
function crc32(puffer) {
  if (!crcTabelle) {
    crcTabelle = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTabelle[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of puffer) c = crcTabelle[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Helligkeit 0–255 je Pixel (Rec. 601). */
function helligkeit({ breite, hoehe, rgba }) {
  const h = new Float32Array(breite * hoehe);
  for (let i = 0; i < h.length; i += 1) {
    h[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return h;
}

/** Kantenkarte in Zellen: 1, wenn die Zelle mindestens ein Kantenpixel enthält. */
function kantenZellen(bild) {
  const { breite, hoehe } = bild;
  const h = helligkeit(bild);
  const zb = Math.ceil(breite / ZELLE);
  const zh = Math.ceil(hoehe / ZELLE);
  const karte = new Uint8Array(zb * zh);
  for (let y = 1; y < hoehe - 1; y += 1) {
    for (let x = 1; x < breite - 1; x += 1) {
      const i = y * breite + x;
      const gx = -h[i - breite - 1] - 2 * h[i - 1] - h[i + breite - 1] + h[i - breite + 1] + 2 * h[i + 1] + h[i + breite + 1];
      const gy = -h[i - breite - 1] - 2 * h[i - breite] - h[i - breite + 1] + h[i + breite - 1] + 2 * h[i + breite] + h[i + breite + 1];
      // Betrag durch 4 geteilt: ein Sprung um 255 ergibt 4·255 → wieder 255.
      if (Math.hypot(gx, gy) / 4 >= KANTENSCHWELLE) karte[Math.floor(y / ZELLE) * zb + Math.floor(x / ZELLE)] = 1;
    }
  }
  return { karte, zb, zh };
}

/** Quadratische Aufweitung um `r` Zellen (trennbar). */
function weite(karte, zb, zh, r) {
  const quer = new Uint8Array(karte.length);
  for (let y = 0; y < zh; y += 1) {
    for (let x = 0; x < zb; x += 1) {
      let treffer = 0;
      for (let d = -r; d <= r && !treffer; d += 1) {
        const xx = x + d;
        if (xx >= 0 && xx < zb && karte[y * zb + xx]) treffer = 1;
      }
      quer[y * zb + x] = treffer;
    }
  }
  const aus = new Uint8Array(karte.length);
  for (let y = 0; y < zh; y += 1) {
    for (let x = 0; x < zb; x += 1) {
      let treffer = 0;
      for (let d = -r; d <= r && !treffer; d += 1) {
        const yy = y + d;
        if (yy >= 0 && yy < zh && quer[yy * zb + x]) treffer = 1;
      }
      aus[y * zb + x] = treffer;
    }
  }
  return aus;
}

/**
 * Kantenzellen in `von`, die in `weitMit` (aufgeweitet) keine Entsprechung haben.
 * @returns {{ anteil: number, haeufung: number }} Anteil an allen Kantenzellen UND die
 *   größte Zahl solcher Zellen in einem Fenster von `FENSTER` × `FENSTER` Zellen
 */
function ohneGegenstueck(von, weitMit, zb, zh) {
  let kanten = 0;
  let fehlt = 0;
  const ohne = new Uint8Array(von.length);
  for (let i = 0; i < von.length; i += 1) {
    if (!von[i]) continue;
    kanten += 1;
    if (!weitMit[i]) { fehlt += 1; ohne[i] = 1; }
  }
  // Fensterzählung über Summentabelle (integrales Bild).
  const sb = zb + 1;
  const summe = new Uint32Array(sb * (zh + 1));
  for (let y = 0; y < zh; y += 1) {
    let zeile = 0;
    for (let x = 0; x < zb; x += 1) {
      zeile += ohne[y * zb + x];
      summe[(y + 1) * sb + x + 1] = summe[y * sb + x + 1] + zeile;
    }
  }
  let haeufung = 0;
  for (let y = 0; y + FENSTER <= zh; y += 1) {
    for (let x = 0; x + FENSTER <= zb; x += 1) {
      const n = summe[(y + FENSTER) * sb + x + FENSTER] - summe[y * sb + x + FENSTER]
        - summe[(y + FENSTER) * sb + x] + summe[y * sb + x];
      if (n > haeufung) haeufung = n;
    }
  }
  return { anteil: kanten === 0 ? 0 : fehlt / kanten, haeufung };
}

/** Mittlere Farbe je Block: Feld aus [r, g, b] pro Block. */
function farbBloecke({ breite, hoehe, rgba }) {
  const bb = Math.ceil(breite / BLOCK);
  const bh = Math.ceil(hoehe / BLOCK);
  const summe = new Float64Array(bb * bh * 3);
  const anzahl = new Uint32Array(bb * bh);
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      const b = Math.floor(y / BLOCK) * bb + Math.floor(x / BLOCK);
      const i = (y * breite + x) * 4;
      summe[b * 3] += rgba[i];
      summe[b * 3 + 1] += rgba[i + 1];
      summe[b * 3 + 2] += rgba[i + 2];
      anzahl[b] += 1;
    }
  }
  for (let b = 0; b < anzahl.length; b += 1) {
    for (let k = 0; k < 3; k += 1) summe[b * 3 + k] /= anzahl[b];
  }
  return { mittel: summe, bb, bh };
}

/** Anteil der Blöcke in `a`, die keinem Block in `b` im Umkreis von 1 Block ähneln. */
function farbAbweichung(a, b) {
  const { mittel: ma, bb, bh } = a;
  const { mittel: mb } = b;
  let ohne = 0;
  for (let y = 0; y < bh; y += 1) {
    for (let x = 0; x < bb; x += 1) {
      let aehnlich = false;
      for (let dy = -1; dy <= 1 && !aehnlich; dy += 1) {
        for (let dx = -1; dx <= 1 && !aehnlich; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= bb || yy >= bh) continue;
          const p = (y * bb + x) * 3;
          const q = (yy * bb + xx) * 3;
          if (
            Math.abs(ma[p] - mb[q]) <= FARBTOLERANZ
            && Math.abs(ma[p + 1] - mb[q + 1]) <= FARBTOLERANZ
            && Math.abs(ma[p + 2] - mb[q + 2]) <= FARBTOLERANZ
          ) aehnlich = true;
        }
      }
      if (!aehnlich) ohne += 1;
    }
  }
  return ohne / (bb * bh);
}

/**
 * Vergleicht zwei Bilder nach Struktur.
 *
 * @param {Buffer|{breite:number,hoehe:number,rgba:Uint8Array}} a - Soll (Baseline)
 * @param {Buffer|{breite:number,hoehe:number,rgba:Uint8Array}} b - Ist
 * @param {{ kantenAbweichung?: number, farbAbweichung?: number, haeufung?: number }} [grenzen]
 * @returns {{ ok: boolean, grund: string|null, kanten: {fehlend:number, neu:number, haeufung:number},
 *   farbe: {fehlend:number, neu:number} }}
 */
export function vergleicheStruktur(a, b, grenzen = GRENZEN) {
  const bildA = Buffer.isBuffer(a) ? leseBild(a) : a;
  const bildB = Buffer.isBuffer(b) ? leseBild(b) : b;
  const leer = { fehlend: 0, neu: 0, haeufung: 0 };
  if (bildA.breite !== bildB.breite || bildA.hoehe !== bildB.hoehe) {
    return {
      ok: false,
      grund: `Größe ${bildA.breite}×${bildA.hoehe} gegen ${bildB.breite}×${bildB.hoehe}`,
      kanten: leer,
      farbe: leer,
    };
  }
  const ka = kantenZellen(bildA);
  const kb = kantenZellen(bildB);
  const fehlend = ohneGegenstueck(ka.karte, weite(kb.karte, kb.zb, kb.zh, SPIELRAUM), ka.zb, ka.zh);
  const neu = ohneGegenstueck(kb.karte, weite(ka.karte, ka.zb, ka.zh, SPIELRAUM), kb.zb, kb.zh);
  const kanten = { fehlend: fehlend.anteil, neu: neu.anteil, haeufung: Math.max(fehlend.haeufung, neu.haeufung) };
  const fa = farbBloecke(bildA);
  const fb = farbBloecke(bildB);
  const farbe = { fehlend: farbAbweichung(fa, fb), neu: farbAbweichung(fb, fa) };

  const gruende = [];
  const kantenWert = Math.max(kanten.fehlend, kanten.neu);
  if (kanten.haeufung > grenzen.haeufung) {
    gruende.push(`Kanten gehäuft: ${kanten.haeufung} Zellen ohne Gegenstück in einem Fenster (Grenze ${grenzen.haeufung})`);
  }
  const farbWert = Math.max(farbe.fehlend, farbe.neu);
  if (kantenWert > grenzen.kantenAbweichung) {
    gruende.push(`Kanten: ${(kanten.fehlend * 100).toFixed(1)} % fehlen, ${(kanten.neu * 100).toFixed(1)} % neu (Grenze ${(grenzen.kantenAbweichung * 100).toFixed(1)} %)`);
  }
  if (farbWert > grenzen.farbAbweichung) {
    gruende.push(`Flächenfarben: ${(farbe.fehlend * 100).toFixed(1)} % fehlen, ${(farbe.neu * 100).toFixed(1)} % neu (Grenze ${(grenzen.farbAbweichung * 100).toFixed(1)} %)`);
  }
  return { ok: gruende.length === 0, grund: gruende.length ? gruende.join('; ') : null, kanten, farbe };
}
