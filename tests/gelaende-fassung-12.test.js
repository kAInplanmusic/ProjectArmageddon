/**
 * Gelände-Fassung 12 („Rampe“): Zonenkarten (ab 2800 px) mit begehbaren Rampen an den Nähten (Zonen werden nicht mehr verschoben, sondern die
 * Oberfläche nachgeformt), ohne Schächte (senkrechte Hohlräume unter 64 px Breite) und mit dicken, bündigen Brücken mit Stützen.
 *
 * Belegt wird: (1) die Marke, (2) Fassung 11 und Karten unter 2800 px bleiben Bit für Bit gleich (Goldwerte), (3) Determinismus, (4) keine Schächte,
 * (5) Rampenprofil: Steigung höchstens 1,0 (Engine-Grenze 1,4, gemessen), reines Gehen mit `gehSchritt` über jede Rampe in beide Richtungen bei
 * kleinstem, normalem und größtem Klassentempo, (6) Brücken: Dicke ≥ 40 px, Steigung ≤ 0,8, begehbar von Kante zu Kante, (7) Figuren laufen in der
 * echten Engine (MatchController, Bewegungssystem, Schwerkraft) über die Rampen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { SeededRandom } from '../src/shared/prng.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { gehSchritt } from '../src/engine/systems/bewegungSystem.js';
import { BEWEGUNG } from '../src/shared/config/bewegung.js';
import { SCHACHT_MIN_BREITE, NAHT_STEIGUNG_MAX, BRUECKE_DICKE, BRUECKE_STEIGUNG_MAX } from '../src/shared/terrainKomposition.js';
import {
  GELAENDE_WEIT, GELAENDE_NAHT, GELAENDE_RAMPE, GELAENDE_STANDARD, GELAENDE_WEIT_AB_BREITE, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';

const hash = (bitmap) => {
  let h = 2166136261;
  for (let i = 0; i < bitmap.length; i += 7) h = Math.imul(h ^ bitmap[i], 16777619) >>> 0;
  return h;
};
const karte = (seed, width, height, fassung) => erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width, height, fassung, stoffe: false });
/** Die Karte, die der Motor für diesen Match-Seed baut (Sub-RNG „TERRAIN“). */
const karteMotor = (seed, width, height, fassung) => erzeugeAutonomeKarte({ rng: new MatchSeedManager(seed).getSubRng('TERRAIN'), width, height, fassung, stoffe: false });

/** Oberkante je Spalte des Landes, das auf dem Grund steht (Flutfüllung von der Zeile Wasserlinie − 60); −1 ohne Land. */
function standOben(bitmap, width, height, wasserY) {
  const stand = new Uint8Array(width * height);
  const stapel = new Int32Array(width * height);
  let sp = 0;
  const yT = wasserY - 60;
  for (let x = 0; x < width; x += 1) if (bitmap[yT * width + x]) { stand[yT * width + x] = 1; stapel[sp++] = yT * width + x; }
  while (sp > 0) {
    const q = stapel[--sp];
    const x = q % width;
    const y = (q - x) / width;
    if (x > 0 && !stand[q - 1] && bitmap[q - 1]) { stand[q - 1] = 1; stapel[sp++] = q - 1; }
    if (x < width - 1 && !stand[q + 1] && bitmap[q + 1]) { stand[q + 1] = 1; stapel[sp++] = q + 1; }
    if (y > 0 && !stand[q - width] && bitmap[q - width]) { stand[q - width] = 1; stapel[sp++] = q - width; }
    if (y < height - 1 && !stand[q + width] && bitmap[q + width]) { stand[q + width] = 1; stapel[sp++] = q + width; }
  }
  const o = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x += 1) for (let y = 0; y < height; y += 1) if (stand[y * width + x]) { o[x] = y; break; }
  return o;
}

/** Gehen mit der reinen Bewegungsfunktion der Engine (`gehSchritt`) von x0 nach x1; Kante: fallen bis zum Boden. */
function geheStrecke(bitmap, width, height, startY, x0, x1, tempo) {
  const t = { width, isSolid: (x, y) => x < 0 || x >= width || y >= height || (y >= 0 && bitmap[y * width + x] === 1) };
  const richtung = x1 > x0 ? 1 : -1;
  let x = x0 + 0.5;
  let y = startY - 10;
  for (let n = 0; n < 400000; n += 1) {
    const r = gehSchritt(t, x, y, richtung, tempo);
    if (r.blockiert) return { ok: false, x };
    x = r.x;
    y = r.y;
    if (r.abgrund) {
      let yy = Math.floor(y + 10);
      while (!t.isSolid(Math.floor(x), yy) && yy < height) yy += 1;
      y = yy - 10;
    }
    if (richtung > 0 ? x >= x1 : x <= x1) return { ok: true, x };
  }
  return { ok: false, x };
}

/** Rampenstücke ≥ 100 px, auf denen die Oberkante des Bodenlandes dem Rampenprofil folgt (±1 px), trocken. */
function rampenStuecke(k, width, height) {
  const o = standOben(k.bitmap, width, height, k.wasserY);
  const stuecke = [];
  for (const { xa, profil } of k.naehte) {
    const gut = (i) => o[xa + i] >= 0 && Math.abs(o[xa + i] - profil[i]) <= 1 && o[xa + i] < k.wasserY - 20;
    for (let x = 0; x < profil.length;) {
      if (!gut(x)) { x += 1; continue; }
      let e = x;
      while (e + 1 < profil.length && gut(e + 1)) e += 1;
      if (e - x >= 100) stuecke.push([xa + x + 2, xa + e - 2]);
      x = e + 1;
    }
  }
  return { o, stuecke };
}

test('Marke: Fassung 12 ist gültig und der Standard, 10 und 11 bleiben gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_RAMPE, 12);
  assert.equal(GELAENDE_STANDARD, GELAENDE_RAMPE);
  assert.equal(normalisiereGelaende(10), 10);
  assert.equal(normalisiereGelaende(11), 11);
  assert.equal(normalisiereGelaende(12), 12);
  assert.equal(normalisiereGelaende(13), GELAENDE_STANDARD);
});

test('Fassung 11 bleibt bitgleich (Goldwerte vom Stand vor Fassung 12); Karten unter 2800 px sind in 11 und 12 gleich', () => {
  for (const [seed, w, h, gold] of [[2, 4704, 1764, 0xed276f79], [5, 4704, 1764, 0x62104ece], [4, 6272, 2352, 0xfc37df5f]]) {
    assert.equal(hash(karte(seed, w, h, GELAENDE_NAHT).bitmap), gold, `Fassung 11, Seed ${seed}, ${w}×${h}`);
  }
  for (const [w, h] of [[2560, 1440], [1568, 588]]) {
    assert.ok(w < GELAENDE_WEIT_AB_BREITE);
    for (const seed of [1, 2]) {
      assert.equal(hash(karte(seed, w, h, GELAENDE_NAHT).bitmap), hash(karte(seed, w, h, GELAENDE_RAMPE).bitmap), `${w}×${h} Seed ${seed}`);
    }
  }
  assert.notEqual(hash(karte(2, 4704, 1764, GELAENDE_WEIT).bitmap), hash(karte(2, 4704, 1764, GELAENDE_RAMPE).bitmap));
});

test('Breite Karte in Fassung 12: deterministisch, anders als Fassung 11, Nähte und Brücken im Ergebnis', () => {
  const a = karte(3, 4704, 1764, GELAENDE_RAMPE);
  const b = karte(3, 4704, 1764, GELAENDE_RAMPE);
  assert.equal(hash(a.bitmap), hash(b.bitmap));
  assert.notEqual(hash(a.bitmap), hash(karte(3, 4704, 1764, GELAENDE_NAHT).bitmap));
  assert.ok(a.versuche <= 8);
  assert.equal(a.naehte.length, 1, 'zwei Zonen, eine Naht');
  assert.equal(karte(1, 6272, 2352, GELAENDE_RAMPE).naehte.length, 2, 'drei Zonen, zwei Nähte');
});

test('Keine Schächte: kein senkrechter Hohlraum schmaler als SCHACHT_MIN_BREITE und tiefer als dieselbe Länge (gross Seeds 9, 11 und riesig 3, 5: dort hat Fassung 11 Schächte)', () => {
  const schaechte = (k, w, h) => {
    // Luftläufe zwischen Fels, kürzer als die Mindestbreite; zählt senkrechte Folgen solcher Zellen gleicher Spalte von mindestens der Mindesttiefe.
    const schmal = new Uint8Array(w * k.wasserY);
    for (let y = 0; y < k.wasserY; y += 1) {
      for (let x = 0; x < w;) {
        if (k.bitmap[y * w + x]) { x += 1; continue; }
        const a = x;
        while (x < w && !k.bitmap[y * w + x]) x += 1;
        if (a > 0 && x < w && x - a < SCHACHT_MIN_BREITE) schmal.fill(1, y * w + a, y * w + x);
      }
    }
    let anzahl = 0;
    for (let x = 0; x < w; x += 1) {
      let lauf = 0;
      for (let y = 0; y <= k.wasserY; y += 1) {
        if (y < k.wasserY && schmal[y * w + x]) lauf += 1;
        else { if (lauf >= SCHACHT_MIN_BREITE) anzahl += 1; lauf = 0; }
      }
    }
    return anzahl;
  };
  let alt = 0;
  let neu = 0;
  for (const [w, h, seeds] of [[4704, 1764, [9, 11]], [6272, 2352, [3, 5]]]) {
    for (const seed of seeds) {
      neu += schaechte(karte(seed, w, h, GELAENDE_RAMPE), w, h);
      alt += schaechte(karte(seed, w, h, GELAENDE_NAHT), w, h);
    }
  }
  assert.equal(neu, 0, `Fassung 12: ${neu} Schachtspalten`);
  assert.ok(alt > 0, 'die Messung findet Schächte in Fassung 11 (sonst misst sie nichts)');
});

test('Rampen: Steigung ≤ 1,0 + Rundung, reines Gehen in beide Richtungen bei kleinstem, normalem und größtem Tempo', () => {
  assert.ok(NAHT_STEIGUNG_MAX < 1.4, 'unter der gemessenen Engine-Grenze (maxStufe 3 px je Vorlauf 2 px = 1,5; glatte Rampe bis 1,4 begehbar)');
  assert.equal(BEWEGUNG.maxStufe / BEWEGUNG.vorlauf, 1.5);
  let stuecke = 0;
  for (const [w, h, seeds] of [[4704, 1764, [1, 3, 5, 8]], [6272, 2352, [2, 4, 7]]]) {
    for (const seed of seeds) {
      const k = karteMotor(seed, w, h, GELAENDE_RAMPE);
      const { o, stuecke: liste } = rampenStuecke(k, w, h);
      for (const [a, b] of liste) {
        stuecke += 1;
        let steilste = 0;
        for (let x = a; x + 12 < b; x += 1) steilste = Math.max(steilste, Math.abs(o[x + 12] - o[x]) / 12);
        assert.ok(steilste <= NAHT_STEIGUNG_MAX + 0.12, `${w} Seed ${seed} ${a}..${b}: Steigung ${steilste.toFixed(2)}`);
        for (const tempo of [0.72, 1.2, 1.68]) {
          const hin = geheStrecke(k.bitmap, w, h, o[a], a, b, tempo);
          const zurueck = geheStrecke(k.bitmap, w, h, o[b], b, a, tempo);
          assert.ok(hin.ok, `${w} Seed ${seed} ${a}→${b} Tempo ${tempo}: blockiert bei ${hin.x}`);
          assert.ok(zurueck.ok, `${w} Seed ${seed} ${b}→${a} Tempo ${tempo}: blockiert bei ${zurueck.x}`);
        }
      }
    }
  }
  assert.ok(stuecke >= 6, `genug Rampenstücke gemessen (${stuecke})`);
});

test('Brücken: ≥ 40 px dick, Steigung ≤ 0,8, freier Raum darüber, von Kante zu Kante begehbar', () => {
  assert.equal(BRUECKE_DICKE, 40);
  assert.ok(BRUECKE_STEIGUNG_MAX < 1.4);
  let bruecken = 0;
  for (const [w, h, seeds] of [[4704, 1764, [5, 6, 10]], [6272, 2352, [2, 3, 7]]]) {
    for (const seed of seeds) {
      const k = karteMotor(seed, w, h, GELAENDE_RAMPE);
      for (const { xa, xb, ya, yb } of k.bruecken) {
        bruecken += 1;
        assert.ok(Math.abs(yb - ya) / (xb - xa) <= BRUECKE_STEIGUNG_MAX + 1e-9, `Steigung ${xa}..${xb}`);
        for (let x = xa + 14; x <= xb - 14; x += 2) {
          const y = Math.round(ya + ((yb - ya) * (x - xa)) / (xb - xa));
          let d = 0;
          while (d < BRUECKE_DICKE + 10 && k.bitmap[(y + d) * w + x]) d += 1;
          assert.ok(d >= BRUECKE_DICKE, `${w} Seed ${seed} Brücke ${xa}..${xb} bei x=${x}: Dicke ${d}`);
          for (let dy = 1; dy <= 20; dy += 1) assert.equal(k.bitmap[(y - dy) * w + x], 0, `${w} Seed ${seed} Brücke ${xa}..${xb} bei x=${x}: Kopffreiheit`);
        }
        const o = standOben(k.bitmap, w, h, k.wasserY);
        const start = Math.max(o[xa - 10] >= 0 ? o[xa - 10] : ya, 0);
        assert.ok(geheStrecke(k.bitmap, w, h, start, xa - 10, xb + 10, 1.2).ok, `${w} Seed ${seed} Brücke ${xa}..${xb} hin`);
        assert.ok(geheStrecke(k.bitmap, w, h, o[xb + 10] >= 0 ? o[xb + 10] : yb, xb + 10, xa - 10, 1.2).ok, `${w} Seed ${seed} Brücke ${xa}..${xb} zurück`);
      }
    }
  }
  assert.ok(bruecken >= 6, `genug Brücken gemessen (${bruecken})`);
});

test('Engine: Figuren laufen mit Bewegungssystem und Schwerkraft über die Rampen (gross, Seeds 3 und 5)', () => {
  let laeufe = 0;
  for (const seed of [3, 5]) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', maxRounds: 2, format: '24:9', groesse: 'gross', zerstoerung: 5, turnDurationMs: 1e9, bewegung: 2 });
    m.start();
    assert.equal(m.gelaende, GELAENDE_RAMPE);
    const k = karteMotor(seed, m.width, m.height, GELAENDE_RAMPE);
    assert.equal(hash(k.bitmap), hash(m.bitmap), 'der Motor baut dieselbe Karte');
    const { o, stuecke } = rampenStuecke(k, m.width, m.height);
    const id = m.activePlayerId;
    for (const [a, b] of stuecke) {
      for (const richtung of [1, -1]) {
        const xs = richtung > 0 ? a : b;
        const xe = richtung > 0 ? b : a;
        m.world.setComponent(id, 'Position', 'x', xs + 0.5);
        m.world.setComponent(id, 'Position', 'y', o[xs] - 10);
        m.world.setComponent(id, 'Velocity', 'x', 0);
        m.world.setComponent(id, 'Velocity', 'y', 0);
        for (let t = 0; t < 5; t += 1) m.step();
        m.gehen.setzeRichtung(id, richtung);
        const grenze = Math.ceil((b - a) / 0.72) + 120;
        let t = 0;
        let x = xs;
        for (; t < grenze; t += 1) {
          m.step();
          if (t % 60 === 59) m.gehen.setzeRichtung(id, richtung);
          x = m.world.getComponent(id, 'Position', 'x');
          if (richtung > 0 ? x >= xe : x <= xe) break;
        }
        m.gehen.setzeRichtung(id, 0);
        assert.ok(richtung > 0 ? x >= xe : x <= xe, `Seed ${seed} ${a}..${b} Richtung ${richtung}: Figur bei x=${x.toFixed(1)} statt ${xe}`);
        laeufe += 1;
      }
    }
  }
  assert.ok(laeufe >= 2, `Läufe: ${laeufe}`);
});
