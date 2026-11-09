/**
 * Semantische Waffenprüfungen (W04, W12, W13, W15, W16, W18 des Audits 2026-11-08).
 *
 * Die bestehenden Prüfungen sichern Schema, Dateiabdeckung und einzelne
 * Dateninvarianten. Sie erkennen NICHT, ob ein Griff am dicken Schlagkopf
 * sitzt, ob das Menü die scharfe 128er-Vorlage benutzt oder ob drei
 * Signaturwaffen dasselbe Projektilbild teilen. Genau diese Fälle stehen hier.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { WEAPONS, WEAPONS_BY_ID, getWeapon } from '../src/shared/config/weapons.js';
import { getWaffe } from '../src/shared/config/waffen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import { atlasAusschnitt } from '../src/client/waffenIcons.js';
import { schweifArt } from '../src/client/waffenOptik.js';
import { MatchController } from '../src/engine/match.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const SPRITES = path.join(WURZEL, 'src', 'client', 'assets', 'weapon-sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(SPRITES, 'manifest.json'), 'utf8'));
const korrekturen = JSON.parse(fs.readFileSync(path.join(WURZEL, 'scripts', 'waffen-sprites-korrekturen.json'), 'utf8'));

/** Die im Audit W04 einzeln geprüften Waffen. */
const SEMANTIK_IDS = [
  'pa_001', 'pa_003', 'pa_004', 'pa_009', 'pa_012', 'pa_015',
  'pa_016', 'pa_018', 'pa_038', 'pa_040', 'pa_051', 'pa_055', 'pa_068',
];

/**
 * Waffen, deren Bild vor der Korrektur mit dem Wirkende nach links standen.
 * Zwei Wege: `spitzeWechseln` (Richtungsentscheidung umdrehen) oder — bei
 * pa_018/pa_040 — das Entfernen eines `umkehren`, das die Waffe nach der
 * Ausrichtung wieder zurückgedreht hat.
 */
const GEDREHT_SPITZE = ['pa_001', 'pa_003', 'pa_004', 'pa_012', 'pa_038', 'pa_051'];
const GEDREHT_UMKEHREN = ['pa_018', 'pa_040'];

/** RGBA-PNG (Farbtyp 6, 8 Bit, ohne Interlace) -> {breite, hoehe, alpha}. */
function leseAlpha(datei) {
  const p = fs.readFileSync(datei);
  assert.equal(p.toString('hex', 0, 8), '89504e470d0a1a0a', `${datei}: kein PNG`);
  const breite = p.readUInt32BE(16);
  const hoehe = p.readUInt32BE(20);
  assert.equal(p[24], 8, `${datei}: nur 8 Bit`);
  assert.equal(p[25], 6, `${datei}: nur RGBA (Farbtyp 6)`);
  const teile = [];
  for (let pos = 8; pos < p.length;) {
    const laenge = p.readUInt32BE(pos);
    const name = p.toString('ascii', pos + 4, pos + 8);
    if (name === 'IDAT') teile.push(p.subarray(pos + 8, pos + 8 + laenge));
    pos += 12 + laenge;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const zeile = breite * 4;
  const px = Buffer.alloc(zeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    for (let x = 0; x < zeile; x++) {
      const a = x >= 4 ? px[y * zeile + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * zeile + x - 4] : 0;
      let w = roh[y * (zeile + 1) + 1 + x];
      if (filter === 1) w += a;
      else if (filter === 2) w += b;
      else if (filter === 3) w += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        w += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * zeile + x] = w & 255;
    }
  }
  const alpha = new Uint8Array(breite * hoehe);
  for (let i = 0; i < breite * hoehe; i++) alpha[i] = px[i * 4 + 3];
  return { breite, hoehe, alpha };
}

const atlanten = new Map();
function alphaVon(atlasName) {
  if (!atlanten.has(atlasName)) atlanten.set(atlasName, leseAlpha(path.join(SPRITES, manifest.atlanten[atlasName].datei)));
  return atlanten.get(atlasName);
}

/** Alpha-Ausschnitt einer Zelle als eigenes Feld. */
function zelleAlpha(zelle) {
  const { breite, alpha } = alphaVon(zelle.atlas);
  const feld = new Uint8Array(zelle.w * zelle.h);
  for (let y = 0; y < zelle.h; y++) {
    for (let x = 0; x < zelle.w; x++) feld[y * zelle.w + x] = alpha[(zelle.y + y) * breite + zelle.x + x];
  }
  return feld;
}

// ---------------------------------------------------------------- W04

test('W04: die korrigierten Anker stehen so im Manifest wie in der Korrekturdatei', () => {
  for (const id of SEMANTIK_IDS) {
    const eintrag = manifest.waffen[id];
    assert.ok(eintrag, `${id}: fehlt im Manifest`);
    const k = korrekturen[id] ?? {};
    if (k.grip) {
      assert.equal(eintrag.anchor.source, 'korrektur', `${id}: Anker muss von Hand gesetzt sein`);
      assert.deepEqual(eintrag.anchor.grip, { x: k.grip[0], y: k.grip[1] }, `${id}: Griff`);
    }
    if (k.muzzle) {
      assert.deepEqual(eintrag.anchor.muzzle, { x: k.muzzle[0], y: k.muzzle[1] }, `${id}: Mündung`);
    }
  }
});

test('W04: Wirkende zeigt nach rechts — Mündung rechts vom Griff, Achse flach', () => {
  for (const id of SEMANTIK_IDS) {
    const { grip, muzzle } = manifest.waffen[id].anchor;
    // Untergrenze statt fester Achse: Bei Kurzwaffen liegt der Griff dicht an
    // der Mündung (pa_068: 22 px), die Richtung muss trotzdem stimmen.
    assert.ok(muzzle.x - grip.x >= 20, `${id}: Griff→Mündung nur ${muzzle.x - grip.x} px`);
    assert.ok(Math.abs(muzzle.y - grip.y) <= 10, `${id}: Achse schief (${grip.y}→${muzzle.y}) — die Waffe würde schräg stehen`);
  }
});

test('W04: Anker liegen auf der Waffe selbst, die Mündung am äußeren Rand', () => {
  for (const id of SEMANTIK_IDS) {
    const eintrag = manifest.waffen[id];
    const alpha = zelleAlpha(eintrag.held);
    const { grip, muzzle } = eintrag.anchor;
    const deckend = (x, y) => alpha[y * eintrag.held.w + x] > 100;
    assert.ok(deckend(grip.x, grip.y), `${id}: Griff (${grip.x},${grip.y}) liegt neben der Waffe`);
    assert.ok(deckend(muzzle.x, muzzle.y), `${id}: Mündung (${muzzle.x},${muzzle.y}) liegt neben der Waffe`);

    let rechteste = 0;
    for (let y = 0; y < eintrag.held.h; y++) {
      for (let x = 0; x < eintrag.held.w; x++) if (alpha[y * eintrag.held.w + x] > 100) rechteste = Math.max(rechteste, x);
    }
    assert.ok(rechteste - muzzle.x <= 4, `${id}: Mündung ${rechteste - muzzle.x} px vor dem Rand`);
  }
});

test('W04: gedrehte Waffen tragen die Drehung in der Korrekturdatei (Nachvollziehbarkeit)', () => {
  for (const id of GEDREHT_SPITZE) {
    assert.equal(korrekturen[id].spitzeWechseln, true, `${id}: spitzeWechseln fehlt`);
    assert.notEqual(korrekturen[id].umkehren, true, `${id}: umkehren würde die Drehung wieder aufheben`);
  }
  for (const id of GEDREHT_UMKEHREN) {
    assert.notEqual(korrekturen[id]?.umkehren, true, `${id}: umkehren dreht die Waffe wieder nach links`);
  }
  // Gegenprobe: Waffen, die schon richtig standen, wurden NICHT gedreht.
  for (const id of ['pa_009', 'pa_015', 'pa_016', 'pa_055', 'pa_068']) {
    assert.notEqual(korrekturen[id].spitzeWechseln, true, `${id}: unnötig gedreht`);
  }
});

// ---------------------------------------------------------------- W12

test('W12: Menüicon rechnet den 128er-Atlasausschnitt in Prozent', () => {
  const sti = atlasAusschnitt({ x: 0, y: 0, w: 128, h: 128 }, { w: 2048, h: 1280 });
  assert.ok(sti, 'Ausschnitt fehlt');
  assert.equal(sti.spalten, 16);
  assert.equal(sti.zeilen, 10);
  assert.equal(sti.backgroundSize, '1600% 1000%');
  assert.equal(sti.backgroundPosition, '0.0000% 0.0000%');

  const letzte = atlasAusschnitt({ x: 1920, y: 1152, w: 128, h: 128 }, { w: 2048, h: 1280 });
  assert.equal(letzte.backgroundPosition, '100.0000% 100.0000%');
});

test('W12: jede Waffe hat eine Zelle im 128er-Iconatlas', () => {
  const atlas = manifest.atlanten.icons;
  assert.equal(atlas.waffen, 150);
  assert.equal(atlas.w, 2048);
  assert.equal(atlas.h, 1280);
  assert.equal(manifest.zellen.icon, 128, 'Iconzellen sind 128 px, nicht 64');
  const gesehen = new Set();
  for (const w of WEAPONS) {
    const z = manifest.waffen[w.id].icon;
    assert.equal(z.atlas, 'icons');
    assert.ok(z.x + z.w <= atlas.w && z.y + z.h <= atlas.h, `${w.id}: Zelle außerhalb des Atlas`);
    const sti = atlasAusschnitt(z, atlas);
    assert.ok(sti && sti.zeilen === 10, `${w.id}: Ausschnitt nicht berechenbar`);
    const schluessel = `${z.x}:${z.y}`;
    assert.ok(!gesehen.has(schluessel), `${w.id}: Zelle doppelt belegt`);
    gesehen.add(schluessel);
  }
  assert.equal(gesehen.size, 150);
});

test('W12: das Waffenmenü liest den Atlas, nicht nur das 64er-Bild', () => {
  const quelle = fs.readFileSync(path.join(WURZEL, 'src', 'client', 'waffenMenue.js'), 'utf8');
  assert.match(quelle, /holeWaffenIcon\(/, 'Menü fragt den Iconatlas nicht ab');
  assert.match(quelle, /atlasAusschnitt\(/, 'Menü rechnet den Ausschnitt nicht');
  const icons = fs.readFileSync(path.join(WURZEL, 'src', 'client', 'waffenIcons.js'), 'utf8');
  assert.match(icons, /atlas_icons\.png/, 'Iconatlasdatei nicht verdrahtet');
});

// ---------------------------------------------------------------- W13

test('W13: Feuerdämon, Phönix und Weltendrache fliegen mit eigener Form', () => {
  const signatur = { pa_061: 'daemon', pa_044: 'phoenix', pa_147: 'drache' };
  const formen = new Set();
  for (const [id, art] of Object.entries(signatur)) {
    const p = manifest.waffen[id].projectile;
    assert.ok(p, `${id}: kein Projektil`);
    assert.equal(p.art, art, `${id}: Geschossart`);
    assert.equal(p.generiert, true);
    formen.add(p.art);
    // Gegenprobe gegen das geteilte Feuerprojektil (Feuerball pa_072).
    assert.notEqual(p.art, manifest.waffen.pa_072.projectile.art, `${id}: teilt das generische Feuerbild`);
  }
  assert.equal(formen.size, 3, 'die drei Signaturen sind nicht unterscheidbar');

  // Auch die Form selbst muss sich unterscheiden, nicht nur der Name.
  const muster = new Map();
  for (const id of Object.keys(signatur)) {
    const feld = zelleAlpha(manifest.waffen[id].projectile);
    const hash = [...feld].map(v => (v > 100 ? 1 : 0)).join('');
    assert.ok(!muster.has(hash), `${id}: Pixelmuster gleich wie ${muster.get(hash)}`);
    muster.set(hash, id);
    const sichtbar = [...feld].filter(v => v > 100).length;
    assert.ok(sichtbar >= 120, `${id}: Projektil zu dünn (${sichtbar} Pixel)`);
  }
});

test('W13: die drei Signaturen ziehen unterschiedliche Spuren', () => {
  const daemon = { id: 'pa_061', damageType: 'fire' };
  const phoenix = { id: 'pa_044', damageType: 'fire' };
  const drache = { id: 'pa_147', damageType: 'fire' };
  const spuren = new Set([
    schweifArt('daemon', daemon),
    schweifArt('phoenix', phoenix),
    schweifArt('drache', drache),
  ]);
  assert.ok(spuren.size >= 2, 'alle drei Signaturen ziehen dieselbe Spur');
  assert.equal(schweifArt('daemon', daemon), 'rauch');
  assert.equal(schweifArt('drache', drache), 'funkeln');
});

// ---------------------------------------------------------------- W15

test('W15: Reichweitenprüfung trennt Flug, Hitscan und Selbstwirkung über den Motor', () => {
  const zaehlung = { flug: 0, hitscan: 0, selbst: 0 };
  const selbst = [];
  for (const roh of WEAPONS) {
    const waffe = getWaffe(roh.id);
    const effekt = buildEffect(waffe);
    if (effekt && SELF_TARGET_KINDS.has(effekt.kind)) { zaehlung.selbst += 1; selbst.push(roh.id); continue; }
    if (waffe.delivery === 'hitscan') zaehlung.hitscan += 1;
    else if (waffe.delivery === 'projectile') zaehlung.flug += 1;
  }
  assert.deepEqual(zaehlung, { flug: 87, hitscan: 25, selbst: 38 },
    'Aufteilung Flug/Hitscan/Selbstwirkung weicht vom gemessenen Erstaktionspfad ab');

  // Genau diese sieben galten im alten Werkzeug fälschlich als 0-Reichweite.
  for (const id of ['pa_076', 'pa_079', 'pa_093', 'pa_141', 'pa_143', 'pa_148', 'pa_149']) {
    const effekt = buildEffect(getWaffe(id));
    assert.ok(effekt && SELF_TARGET_KINDS.has(effekt.kind), `${id}: müsste Selbstwirkung sein, ist ${effekt?.kind}`);
    assert.ok(selbst.includes(id));
  }
});

test('W15: check-range liest getWaffe und buildEffect statt special-Namen', () => {
  const quelle = fs.readFileSync(path.join(WURZEL, 'scripts', 'check-range.mjs'), 'utf8');
  assert.match(quelle, /getWaffe\(/, 'check-range nutzt nicht die Waffenfassung');
  assert.match(quelle, /buildEffect\(/, 'check-range nutzt nicht die Motorwirkung');
  assert.match(quelle, /SELF_TARGET_KINDS/, 'Selbstwirkung nicht über den Motor erkannt');
  assert.doesNotMatch(quelle, /const SELBSTWIRKUNG = new Set/, 'alte Namensliste steckt noch drin');
  assert.match(quelle, /wegesteStrahllaenge|weitesteStrahllaenge/, 'Hitscan wird nicht gemessen');
});

// ---------------------------------------------------------------- W16

test('W16: Name und Bild passen zusammen, ohne die IDs zu ändern', () => {
  assert.equal(getWaffe('pa_081').displayName, 'Siegel der Leere');
  assert.equal(getWaffe('pa_082').displayName, 'Goldener Münzstab');
  assert.equal(WEAPONS_BY_ID.pa_081.internalName, 'zauberbuch_der_leere', 'interne Kennung bleibt stabil');
  assert.equal(WEAPONS_BY_ID.pa_082.internalName, 'goldene_zauberrolle', 'interne Kennung bleibt stabil');
  // Die Bilder zeigen ein Siegel und einen goldenen Stab mit Münzen — nicht Buch und Rolle.
  for (const [id, wort] of [['pa_081', /Siegel/], ['pa_082', /stab/i]]) {
    const w = getWaffe(id);
    assert.match(w.displayName, wort, `${id}: Name passt nicht zum Motiv`);
    assert.ok(!/Buch|Rolle/.test(w.displayName), `${id}: Name verspricht weiter ein anderes Motiv`);
  }
});

test('W16: keine pauschale Umbenennung, der Bumerang verspricht keine Rückkehr', () => {
  const namen = new Set();
  for (const w of WEAPONS) {
    const aktuell = getWaffe(w.id);
    assert.ok(aktuell.displayName?.trim(), `${w.id}: ohne Namen`);
    assert.ok(!namen.has(aktuell.displayName), `Doppelter Name: ${aktuell.displayName}`);
    namen.add(aktuell.displayName);
  }
  assert.equal(namen.size, 150);

  const bumerang = getWaffe('pa_049');
  assert.equal(bumerang.displayName, 'Bumerang', 'der humorvolle Name bleibt');
  assert.doesNotMatch(bumerang.description, /kehr|zurück|zurueck|return/i,
    'die Beschreibung darf keine Rückkehr versprechen — die Mechanik hat keine');
});

// ---------------------------------------------------------------- W18

test('W18: Anzeige und Prüfwerkzeug benutzen den aktuellen Waffenstand', () => {
  // Fassung 15 hebt den Schaden an; der Katalog bleibt unverändert.
  assert.equal(WEAPONS_BY_ID.pa_040.damage, 21);
  assert.equal(getWaffe('pa_040').damage, 42);
  assert.equal(getWeapon('pa_040').damage, 21, 'Katalog bleibt bitgleich');
  const abweichend = WEAPONS.filter(w => getWaffe(w.id).damage !== w.damage).length;
  assert.ok(abweichend >= 50, `nur ${abweichend} Waffen weichen vom Katalog ab — Fassung 15 fehlt?`);
});

test('W18: zweites Ziel — Durchschlag trifft beide Figuren, ein normales Geschoss nur die erste', () => {
  /**
   * Aufbau: drei Figuren auf flacher Karte, Schütze links, Ziel bei 300 px,
   * zweites Ziel bei 420 px, gleiche Höhe. Geschossen wird flach nach rechts.
   */
  function schuss(waffeId) {
    const m = new MatchController({ seed: 7, teams: 2, playersPerTeam: 2, preset: 'open', turnDurationMs: 1_000_000 });
    m.start();
    const ids = m.getState().entities.map(e => e.entityId);
    const [schuetze, erstes, zweites] = ids;
    const setze = (id, x) => {
      m.world.setComponent(id, 'Position', 'x', x);
      m.world.setComponent(id, 'Position', 'y', m.surfaceYAt(x) - 12);
    };
    setze(schuetze, 200); setze(erstes, 300); setze(zweites, 420);
    m.inventory.register(schuetze, [waffeId]);
    m.inventory.selectWeapon(schuetze, waffeId);
    const hp = () => Object.fromEntries(m.getState().entities.map(e => [e.entityId, e.health]));
    const vorher = hp();
    const schuss = m.fire(schuetze, 0.05, 100, waffeId);
    assert.equal(schuss.ok, true, `${waffeId}: Schuss abgelehnt`);
    for (let i = 0; i < 900 && m.activeProjectileCount > 0; i += 1) { m.step(); m.consumeEvents(); }
    const nachher = hp();
    return {
      erstes: vorher[erstes] - nachher[erstes],
      zweites: vorher[zweites] - nachher[zweites],
    };
  }

  const durchschlag = schuss('pa_055');           // Fernbüchse, piercing 1
  assert.ok(durchschlag.erstes > 0, 'Durchschlag traf das erste Ziel nicht');
  assert.ok(durchschlag.zweites > 0, 'Durchschlag erreichte das zweite Ziel nicht');

  const normal = schuss('pa_040');                // Maschinenpistole, kein Durchschlag
  assert.ok(normal.erstes > 0, 'Normalschuss traf das erste Ziel nicht');
  assert.equal(normal.zweites, 0, 'Normalschuss verletzte das zweite Ziel — verdeckter Flächenschaden?');
});
