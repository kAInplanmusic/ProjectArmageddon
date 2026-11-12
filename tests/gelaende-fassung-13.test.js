/**
 * Gelände-Fassung 13 („Form“): Feinschliff der Fassung 12.
 *
 * Belegt wird: (1) die Marke, (2) Fassung 12 und älter bleiben Bit für Bit gleich (Goldwerte vom Stand vor Fassung 13, gemessen mit
 * dem unveränderten Code aus `git archive`), (3) Karten unter 2800 px bekommen keine Schächte mehr (Fassung 12 hat dort welche) bei
 * unveränderter Zahl der Ziehungen, (4) Brückenpfeiler: kegelig, an hohen Brücken am Fuß breit (Fassung 12: 40 px), (5) Rampen und
 * Brücken bleiben zu Fuß in beide Richtungen begehbar (`gehSchritt`, drei Tempi) und die Figuren laufen in der echten Engine, (6) die
 * Fensterränder der Nähte haben keine Stufe über 8 px (Absatz), (7) Matchstart mit 8 bis 10 Figuren, (8) Kosten der Generierung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { SeededRandom } from '../src/shared/prng.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { pruefeErreichbarkeit } from '../src/shared/erreichbarkeit.js';
import { gehSchritt } from '../src/engine/systems/bewegungSystem.js';
import { BEWEGUNG } from '../src/shared/config/bewegung.js';
import { SCHACHT_MIN_BREITE, SCHACHT_MIN_BREITE_13, NAHT_STEIGUNG_MAX, BRUECKE_DICKE, BRUECKE_STEIGUNG_MAX } from '../src/shared/terrainKomposition.js';
import {
  GELAENDE_RAMPE, GELAENDE_FORM, GELAENDE_STANDARD, normalisiereGelaende,
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


/** Goldwerte vom Stand VOR Fassung 13: [Fassung, Seed, Breite, Höhe, Hash] (`new SeededRandom(seed)`, ohne Stoffe). */
const GOLD = [[12, 2, 4704, 1764, "0xf90cf3a1"], [11, 2, 4704, 1764, "0xed276f79"], [10, 2, 4704, 1764, "0xa7900188"], [9, 2, 4704, 1764, "0x5d045c9f"], [12, 5, 4704, 1764, "0x284b95c3"], [11, 5, 4704, 1764, "0x62104ece"], [10, 5, 4704, 1764, "0xb966a365"], [9, 5, 4704, 1764, "0xd9f1f5e8"], [12, 4, 6272, 2352, "0xc737aca2"], [11, 4, 6272, 2352, "0xfc37df5f"], [10, 4, 6272, 2352, "0xc9bef256"], [9, 4, 6272, 2352, "0x6feea0e4"], [12, 3, 2560, 1440, "0x1b586099"], [11, 3, 2560, 1440, "0x1b586099"], [10, 3, 2560, 1440, "0x1b586099"], [9, 3, 2560, 1440, "0x1b586099"], [12, 7, 1568, 588, "0x899bd95e"], [11, 7, 1568, 588, "0x899bd95e"], [10, 7, 1568, 588, "0x899bd95e"], [9, 7, 1568, 588, "0x899bd95e"], [12, 11, 2560, 1440, "0x481b1b1a"], [11, 11, 2560, 1440, "0x481b1b1a"], [10, 11, 2560, 1440, "0x481b1b1a"], [9, 11, 2560, 1440, "0x481b1b1a"], [12, 9, 1920, 1080, "0x86e44ba3"], [11, 9, 1920, 1080, "0x86e44ba3"], [10, 9, 1920, 1080, "0x86e44ba3"], [9, 9, 1920, 1080, "0x86e44ba3"]];

test('Marke: Fassung 13 ist gültig und der Standard, 12 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_FORM, 13);
  assert.ok(GELAENDE_STANDARD >= GELAENDE_FORM, "seit Fassung 14 ist der Standard höher; Fassung 13 bleibt gültig");
  assert.equal(normalisiereGelaende(12), 12);
  assert.equal(normalisiereGelaende(13), 13);
  assert.equal(normalisiereGelaende(15), GELAENDE_STANDARD);
});

test('Fassungen 9 bis 12 bleiben bitgleich (Goldwerte vom Stand vor Fassung 13)', () => {
  for (const [fassung, seed, w, h, gold] of GOLD) {
    assert.equal('0x' + hash(karte(seed, w, h, fassung).bitmap).toString(16), gold, `Fassung ${fassung}, Seed ${seed}, ${w}×${h}`);
  }
});

test('Breite Karte in Fassung 13: deterministisch, anders als Fassung 12', () => {
  const a = karte(3, 4704, 1764, GELAENDE_FORM);
  assert.equal(hash(a.bitmap), hash(karte(3, 4704, 1764, GELAENDE_FORM).bitmap));
  assert.notEqual(hash(a.bitmap), hash(karte(3, 4704, 1764, GELAENDE_RAMPE).bitmap));
  assert.ok(a.versuche <= 8);
});

test('Karten unter 2800 px: keine Schächte in Fassung 13 (Fassung 12 hat welche), gleiche Zahl der Ziehungen, nie die Notkarte', () => {
  const schaechte = (k, w) => {
    const schmal = new Uint8Array(w * k.wasserY);
    for (let y = 0; y < k.wasserY; y += 1) {
      for (let x = 0; x < w;) {
        if (k.bitmap[y * w + x]) { x += 1; continue; }
        const a = x;
        while (x < w && !k.bitmap[y * w + x]) x += 1;
        if (a > 0 && x < w && x - a < SCHACHT_MIN_BREITE_13) schmal.fill(1, y * w + a, y * w + x);
      }
    }
    let n = 0;
    for (let x = 0; x < w; x += 1) {
      let lauf = 0;
      for (let y = 0; y <= k.wasserY; y += 1) {
        if (y < k.wasserY && schmal[y * w + x]) lauf += 1;
        else { if (lauf >= SCHACHT_MIN_BREITE) n += 1; lauf = 0; }
      }
    }
    return n;
  };
  assert.ok(SCHACHT_MIN_BREITE_13 > SCHACHT_MIN_BREITE);
  let alt = 0;
  let neu = 0;
  let versucheAlt = 0;
  let versucheNeu = 0;
  for (const [w, h] of [[2560, 1440], [1568, 588]]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const k13 = karteMotor(seed, w, h, GELAENDE_FORM);
      const k12 = karteMotor(seed, w, h, GELAENDE_RAMPE);
      neu += schaechte(k13, w);
      alt += schaechte(k12, w);
      versucheNeu += k13.versuche;
      versucheAlt += k12.versuche;
      assert.ok(!k13.warnung, `${w}×${h} Seed ${seed}: ${k13.warnung}`);
    }
  }
  assert.equal(neu, 0, `Fassung 13: ${neu} Schachtspalten`);
  assert.ok(alt > 0, 'die Messung findet Schächte in Fassung 12 (sonst misst sie nichts)');
  assert.ok(versucheNeu <= versucheAlt + 2, `Ziehungen: Fassung 13 ${versucheNeu}, Fassung 12 ${versucheAlt}`);
});

test('Brückenpfeiler: Fassung 13 baut Felssäulen (am Fuß breit), Fassung 12 Masten von 40 px', () => {
  /** Breiteste Festzeile auf der Zeile Wasserlinie − 25 innerhalb der Spanne einer Brücke (Pfeilerfuß; Brücken ab 150 px Spanne und 600 px Höhe über der Wasserlinie). */
  const fussBreite = (k, w, { xa, xb }) => {
    const y = k.wasserY - 25;
    let best = 0;
    for (let x = xa + 20; x < xb - 20;) {
      if (!k.bitmap[y * w + x]) { x += 1; continue; }
      const a = x;
      while (x < xb - 20 && k.bitmap[y * w + x]) x += 1;
      best = Math.max(best, x - a);
    }
    return best;
  };
  let hoch = 0;
  for (const [w, h, seeds] of [[4704, 1764, [1, 2, 3, 5, 6, 8]], [6272, 2352, [1, 2, 3, 5, 6, 7]]]) {
    for (const seed of seeds) {
      const k13 = karteMotor(seed, w, h, GELAENDE_FORM);
      for (const b of k13.bruecken) {
        if (k13.wasserY - Math.max(b.ya, b.yb) < 600 || b.xb - b.xa < 150) continue;
        hoch += 1;
        const f13 = fussBreite(k13, w, b);
        assert.ok(f13 >= 100, `${w} Seed ${seed} Brücke ${b.xa}..${b.xb}: Fußbreite ${f13} px (Fassung 12 hatte an denselben Brücken Masten von 40 px)`);
      }
    }
  }
  assert.ok(hoch >= 3, `genug hohe Brücken gemessen (${hoch})`);
});

test('Absatz: an den Fensterrändern der Nähte steigt die Oberkante des Standlandes nie um mehr als 8 px je Spalte', () => {
  let ränder = 0;
  for (const [w, h, seeds] of [[4704, 1764, [1, 2, 3, 4, 5, 6, 7, 8]], [6272, 2352, [1, 3, 4, 6]]]) {
    for (const seed of seeds) {
      const k = karteMotor(seed, w, h, GELAENDE_FORM);
      const o = standOben(k.bitmap, w, h, k.wasserY);
      for (const { xa, profil } of k.naehte) {
        for (const x of [xa, xa + profil.length]) {
          for (let i = -6; i < 6; i += 1) {
            if (o[x + i] < 0 || o[x + i + 1] < 0 || o[x + i] >= k.wasserY - 20) continue;
            ränder += 1;
            assert.ok(Math.abs(o[x + i + 1] - o[x + i]) <= 8, `${w} Seed ${seed} x=${x + i}: Stufe ${Math.abs(o[x + i + 1] - o[x + i])}`);
          }
        }
      }
    }
  }
  assert.ok(ränder > 100, `gemessene Stellen: ${ränder}`);
});

test('Hohe senkrechte Wände zu trockenem Land: Fassung 13 hat deutlich weniger als Fassung 12 (acht Seeds gross und riesig)', () => {
  const kanten = (k, w) => {
    const o = standOben(k.bitmap, w, k.bitmap.length / w, k.wasserY);
    let n = 0;
    for (let x = 0; x + 4 < w; x += 1) if (o[x] >= 0 && o[x + 4] >= 0 && o[x] < k.wasserY - 20 && o[x + 4] < k.wasserY - 20 && Math.abs(o[x + 4] - o[x]) >= 240) n += 1;
    return n;
  };
  let alt = 0;
  let neu = 0;
  for (const [w, h] of [[4704, 1764], [6272, 2352]]) {
    for (let seed = 1; seed <= 8; seed += 1) {
      neu += kanten(karteMotor(seed, w, h, GELAENDE_FORM), w);
      alt += kanten(karteMotor(seed, w, h, GELAENDE_RAMPE), w);
    }
  }
  assert.ok(alt >= 40, `Fassung 12 hat Wandspalten (${alt})`);
  assert.ok(neu <= alt * 0.7, `Wandspalten: Fassung 13 ${neu}, Fassung 12 ${alt}`);
});

test('Rampen (Fassung 13): Steigung ≤ 1,0 + Rundung, reines Gehen in beide Richtungen bei kleinstem, normalem und größtem Tempo', () => {
  assert.ok(NAHT_STEIGUNG_MAX < 1.4, 'unter der gemessenen Engine-Grenze (maxStufe 3 px je Vorlauf 2 px = 1,5; glatte Rampe bis 1,4 begehbar)');
  assert.equal(BEWEGUNG.maxStufe / BEWEGUNG.vorlauf, 1.5);
  let stuecke = 0;
  for (const [w, h, seeds] of [[4704, 1764, [1, 3, 5, 8]], [6272, 2352, [2, 4, 7]]]) {
    for (const seed of seeds) {
      const k = karteMotor(seed, w, h, GELAENDE_FORM);
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

test('Brücken (Fassung 13): ≥ 40 px dick, Steigung ≤ 0,8, freier Raum darüber, von Kante zu Kante begehbar', () => {
  assert.equal(BRUECKE_DICKE, 40);
  assert.ok(BRUECKE_STEIGUNG_MAX < 1.4);
  let bruecken = 0;
  for (const [w, h, seeds] of [[4704, 1764, [5, 6, 10]], [6272, 2352, [2, 3, 7]]]) {
    for (const seed of seeds) {
      const k = karteMotor(seed, w, h, GELAENDE_FORM);
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

test('Engine (Fassung 13): Figuren laufen mit Bewegungssystem und Schwerkraft über die Rampen (gross, Seeds 3 und 5)', () => {
  let laeufe = 0;
  for (const seed of [3, 5]) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', maxRounds: 2, format: '24:9', groesse: 'gross', zerstoerung: 5, turnDurationMs: 1e9, bewegung: 2, gelaende: GELAENDE_FORM });
    m.start();
    assert.equal(m.gelaende, GELAENDE_FORM);
    const k = karteMotor(seed, m.width, m.height, GELAENDE_FORM);
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

test('Matchstart (Standardfassung): 8 bis 10 Figuren, alle erreichbar mit fester Wurfweite 939 px', () => {
  for (const [seed, teams, proTeam, format, groesse] of [
    [1, 2, 4, '24:9', 'gross'], [2, 2, 5, '24:9', 'gross'], [3, 4, 2, '24:9', 'gross'], [4, 2, 5, '24:9', 'riesig'],
    [5, 3, 3, '24:9', 'riesig'], [6, 2, 4, '16:9', 'gross'],
  ]) {
    const m = new MatchController({ seed, teams, playersPerTeam: proTeam, kartentyp: 'autonom', maxRounds: 2, format, groesse, zerstoerung: 5 });
    m.start();
    assert.equal(m.gelaende, GELAENDE_STANDARD);
    const figuren = (m.getState().entities ?? []).filter((e) => e.alive && e.type !== 'crate').map((e) => ({ x: e.x, y: e.y, teamId: e.teamId }));
    assert.ok(figuren.length >= 8, `${seed}: mindestens 8 Figuren (${figuren.length})`);
    assert.equal(m.erreichbarkeit?.ok, true, `${seed} ${format}/${groesse}: Engine-Prüfung (${m.erreichbarkeit?.grund})`);
    const urteil = pruefeErreichbarkeit({ bitmap: m.bitmap, width: m.width, height: m.height, figuren, wurfweite: 939 });
    assert.equal(urteil.ok, true, `${seed} ${format}/${groesse}: ${urteil.grund} bei 939 px`);
  }
});

test('Kosten: wenige Ziehungen je Karte (gross und riesig), nie die Notkarte nach acht Versuchen', () => {
  let versuche = 0;
  let n = 0;
  for (const [w, h] of [[4704, 1764], [6272, 2352]]) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const k = karteMotor(seed, w, h, GELAENDE_FORM);
      assert.ok(!k.warnung, `${w} Seed ${seed}: ${k.warnung}`);
      versuche += k.versuche;
      n += 1;
    }
  }
  assert.ok(versuche / n <= 1.5, `Ziehungen je Karte im Mittel ${(versuche / n).toFixed(2)}`);
});
