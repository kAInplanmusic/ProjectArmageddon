/**
 * Gelände des Planeten-Bioms (`config/biome-planet.js`): eine Scheibenwelt im bestehenden 2D-Zellraster.
 *
 * ## Geometrie
 *
 * Der Körper ist eine Ellipse (Halbachsen als Anteil der Karte). Je Spalte entsteht die Oberkante aus
 *
 *   1. der Ellipse (`mitteY - halbHoehe·√(1-u²)`, `u` = Abstand von der Mitte in Halbbreiten),
 *   2. einem Rauschen aus dem Seed (zwei Oktaven, zur Kante hin gedämpft),
 *   3. Terrassen an den Flanken (`ebenen`): Stufen mit befahrbaren Rampen,
 *   4. Kratern: Schüssel nach innen, Wall nach außen (Kranz).
 *
 * Die Unterkante folgt der Ellipse. Darin liegen Tunnelbögen (Teile konzentrischer Ellipsenringe mit
 * einer Decke von mindestens `dach` px) und wenige Schächte vom Kraterboden dorthin. Alles ist ein
 * Höhenfeld plus Hohlräume — es gibt weder Kugelschwerkraft noch schwebende Teile: Die Leere um den
 * Planeten ist die Wasserart `void` (tödlich), ihr Spiegel liegt knapp unter dem Planeten.
 *
 * Der Zufall kommt ausschließlich aus dem übergebenen RNG (Seed-Zweig des Geländes); die Zahl der
 * Ziehungen hängt nur von den Konfigurationswerten ab, nicht vom Ergebnis. Keine Zufallsquelle
 * außerhalb des Seeds (AGENTS.md §2).
 *
 * @module terrainPlanet
 */
import { planetFormFuer } from './config/biome-planet.js';

/** Ganzzahl in [lo, hi] (beide eingeschlossen) aus dem RNG. */
function ziehe(rng, [lo, hi]) {
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

/** Kosinus-Interpolation zwischen Stützwerten im Abstand `welle`. */
function baueRauschen(rng, laenge, welle) {
  const n = Math.ceil(laenge / welle) + 2;
  const stuetz = new Float64Array(n);
  for (let i = 0; i < n; i += 1) stuetz[i] = rng.next() * 2 - 1;
  return x => {
    const t = x / welle;
    const i = Math.floor(t);
    const f = (1 - Math.cos((t - i) * Math.PI)) / 2;
    return stuetz[i] * (1 - f) + stuetz[i + 1] * f;
  };
}

/** Stufenfunktion mit Rampen: jede Stufe hat ein Plateau und eine Rampe (Anteil `rampe`). */
function terrasse(y, stufe, rampe) {
  const k = y / stufe;
  const i = Math.floor(k);
  const f = k - i;
  const s = f < 1 - rampe ? 0 : (f - (1 - rampe)) / rampe;
  return (i + s * s * (3 - 2 * s)) * stufe;
}

/**
 * Baut die Maske.
 *
 * @param {object} o
 * @param {{next:function():number}} o.rng - Seed-Zweig des Geländes
 * @param {number} o.width
 * @param {number} o.height
 * @param {string} o.biom - `planet_*`
 * @returns {{bitmap:Uint8Array, wasserY:number, planet:object}} `planet` beschreibt, was gebaut wurde (Prüfung, Anzeige)
 */
export function baueGelaendePlanet({ rng, width, height, biom }) {
  const f = planetFormFuer(biom);
  const bitmap = new Uint8Array(width * height);
  const cx = width * f.mitteX;
  const cy = height * f.mitteY;
  const rx = width * f.halbBreite;
  const ry = height * f.halbHoehe;

  const grob = baueRauschen(rng, width, f.rand.welle);
  const fein = baueRauschen(rng, width, f.rand.welle / 2.6);

  // Krater: Mitten aus dem Seed mit Mindestabstand (feste Zahl an Versuchen, damit die Ziehungen nicht vom Ergebnis abhängen).
  const wunschKrater = ziehe(rng, f.krater.anzahl);
  const krater = [];
  for (let versuch = 0; versuch < wunschKrater * 6; versuch += 1) {
    const u = (rng.next() * 2 - 1) * f.krater.u;
    const r = f.krater.radius[0] + rng.next() * (f.krater.radius[1] - f.krater.radius[0]);
    if (krater.length >= wunschKrater) continue;
    const x = cx + u * rx;
    const frei = krater.every(k => Math.abs(k.x - x) >= k.r + r * (1 + f.krater.kranzBreite) + f.krater.abstand);
    if (frei) krater.push({ x, r });
  }
  krater.sort((a, b) => a.x - b.x);

  const oben = new Int32Array(width).fill(-1);
  const unten = new Int32Array(width).fill(-1);
  let tiefsteUnterkante = 0;
  for (let x = 0; x < width; x += 1) {
    const u = (x - cx) / rx;
    if (Math.abs(u) >= 1) continue;
    const bogen = Math.sqrt(1 - u * u);
    let yTop = cy - ry * bogen + f.rand.amplitude * (grob(x) + 0.4 * fein(x)) * (0.3 + 0.7 * bogen);
    if (f.ebenen.staerke > 0 && Math.abs(u) > f.ebenen.ab) {
      const t = Math.min(1, (Math.abs(u) - f.ebenen.ab) / 0.15) * f.ebenen.staerke;
      yTop += (terrasse(yTop, f.ebenen.stufe, f.ebenen.rampe) - yTop) * t;
    }
    for (const k of krater) {
      const dx = Math.abs(x - k.x);
      if (dx < k.r) yTop += f.krater.tiefe * k.r * Math.sqrt(1 - (dx / k.r) ** 2);
      else if (dx < k.r * (1 + f.krater.kranzBreite)) {
        const t = (dx - k.r) / (k.r * f.krater.kranzBreite);
        yTop -= f.krater.kranzHoehe * k.r * Math.sin(Math.PI * t);
      }
    }
    const yBot = cy + ry * bogen;
    const a = Math.max(2, Math.round(yTop));
    const b = Math.min(height - 3, Math.round(yBot));
    if (b <= a) continue;
    oben[x] = a;
    unten[x] = b;
    if (b > tiefsteUnterkante) tiefsteUnterkante = b;
    for (let y = a; y <= b; y += 1) bitmap[y * width + x] = 1;
  }

  // Tunnelbögen: Teile konzentrischer Ellipsenringe im oberen Halbraum, mit Mindestdecke.
  const boegen = ziehe(rng, f.tunnel.boegen);
  const tunnel = [];
  for (let i = 0; i < boegen; i += 1) {
    const radius = f.tunnel.radius[0] + rng.next() * (f.tunnel.radius[1] - f.tunnel.radius[0]);
    const dicke = f.tunnel.dicke[0] + rng.next() * (f.tunnel.dicke[1] - f.tunnel.dicke[0]);
    const spanne = (f.tunnel.oeffnung[0] + rng.next() * (f.tunnel.oeffnung[1] - f.tunnel.oeffnung[0])) * Math.PI;
    // Mitte des Bogens: abwechselnd rechts und links der Mitte (Winkel aus der waagerechten Achse, 0 = Osten).
    const mitte = (i % 2 === 0 ? 0.28 : 0.72) * Math.PI + (rng.next() - 0.5) * 0.12 * Math.PI;
    tunnel.push({ radius, dicke, a0: mitte - spanne / 2, a1: mitte + spanne / 2 });
  }
  const kleinsteAchse = Math.min(rx, ry);
  for (const t of tunnel) {
    const xMin = Math.max(1, Math.floor(cx + rx * (t.radius + t.dicke / kleinsteAchse) * Math.cos(t.a1)) - 2);
    const xMax = Math.min(width - 2, Math.ceil(cx + rx * (t.radius + t.dicke / kleinsteAchse) * Math.cos(t.a0)) + 2);
    for (let x = xMin; x <= xMax; x += 1) {
      if (oben[x] < 0) continue;
      const ex = (x - cx) / rx;
      for (let y = oben[x] + f.tunnel.dach; y < unten[x]; y += 1) {
        const ey = (cy - y) / ry;
        const d = Math.hypot(ex, ey);
        if (Math.abs(d - t.radius) * kleinsteAchse > t.dicke / 2) continue;
        const w = Math.atan2(ey, ex);
        if (w >= t.a0 && w <= t.a1) bitmap[y * width + x] = 0;
      }
    }
  }

  // Schächte: von einem Kraterboden senkrecht hinunter bis zum ersten Hohlraum (höchstens bis dahin; ohne Tunnel kein Schacht).
  const schaechte = Math.min(krater.length, ziehe(rng, f.schacht.anzahl));
  const gebohrt = [];
  for (let i = 0; i < schaechte; i += 1) {
    const k = krater[(i * 2 + 1) % krater.length];
    const x0 = Math.round(k.x);
    if (oben[x0] < 0) continue;
    let ziel = -1;
    for (let y = oben[x0] + 1; y < unten[x0]; y += 1) if (!bitmap[y * width + x0]) { ziel = y; break; }
    if (ziel < 0) continue;
    const halb = Math.floor(f.schacht.breite / 2);
    for (let x = Math.max(1, x0 - halb); x <= Math.min(width - 2, x0 + halb); x += 1) {
      for (let y = oben[x]; y <= ziel; y += 1) bitmap[y * width + x] = 0;
    }
    gebohrt.push(x0);
  }

  // Ränder: Boden und Seiten werden unter dem Spiegel der Leere versiegelt (dort unsichtbar).
  const wasserY = Math.min(height - 8, tiefsteUnterkante + f.wasser.abstand);
  for (let x = 0; x < width; x += 1) bitmap[(height - 1) * width + x] = 1;
  for (let y = wasserY; y < height; y += 1) { bitmap[y * width] = 1; bitmap[y * width + width - 1] = 1; }

  return { bitmap, wasserY, planet: { biom, mitte: [cx, cy], halbachsen: [rx, ry], krater, tunnel, schaechte: gebohrt } };
}

export default baueGelaendePlanet;
