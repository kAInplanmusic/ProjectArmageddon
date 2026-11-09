/**
 * BAL-10: Abnahme der 26 Waffen-Zusatzanimationen.
 *
 * Der Test prüft die Spur der Abnahme, nicht die Sichturteile selbst:
 * 1. Jedes Blatt hat eine vollständige Messung über alle acht Frames und alle
 *    sechs Datenkriterien plus Effekt/Browser.
 * 2. Manifesturteil, Messung und Sperrgründe laufen nicht auseinander.
 * 3. Kein Blatt mit einem offenen Kriterium lässt sich freigeben — auch nicht
 *    mit manipulierter Freigabeliste im Lader.
 * 4. Ein synthetischer Vollbeleg öffnet den Lader (Gegenprobe), ein einzelnes
 *    fehlendes Kriterium schließt ihn wieder.
 * 5. Der Bericht nennt jedes Blatt mit seinem Urteil.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ANIM_ABNAHME_STUFEN,
  ANIM_FREIGABE,
  ANIM_KRITERIEN,
  ANIM_PRODUKT_KRITERIEN,
  ANIM_STATUS,
  animAbnahmePruefen,
  animBlattFreigegeben,
  animFreigabePruefen,
  erzeugeAnimLader,
  holeZusatzAnim,
  waffenAnimZustand,
} from '../src/client/waffenAnim.js';

const WURZEL = resolve(import.meta.dirname, '..');
const ANIM = join(WURZEL, 'src/client/assets/weapon-sprites/anim');
const AUDIT = join(WURZEL, 'docs/waffen-audit-2026-11-08');
const manifest = JSON.parse(readFileSync(join(ANIM, 'manifest.json'), 'utf8'));
const messung = JSON.parse(readFileSync(join(AUDIT, 'anim-abnahme-messung.json'), 'utf8'));
const bericht = readFileSync(join(AUDIT, 'ANIM-ABNAHME.md'), 'utf8');
const ids = Object.keys(manifest.waffen);

const KRITERIEN = [...ANIM_KRITERIEN, ...ANIM_PRODUKT_KRITERIEN];

function vollbeleg(id = 'pa_test') {
  const e = structuredClone(manifest.waffen.pa_065);
  e.id = id;
  e.datei = 'pa_065.webp';
  e.freigabe = true;
  e.abnahme = 'abgenommen';
  e.sperrgruende = [];
  e.pruefung = { datum: '2026-11-09', verfahren: 'test' };
  for (const k of KRITERIEN) e.pruefung[k] = { ok: true, befund: 'Testbeleg' };
  e.pruefung.ergebnis = { abnahme: 'abgenommen', datenOk: true, produktOk: true, sperrgruende: [] };
  return e;
}

test('Messung deckt jedes Blatt, alle acht Frames und alle Kriterien ab', () => {
  assert.equal(messung.auftrag, 'BAL-10');
  assert.match(messung.verfahren, /waffen-anim-abnahme/);
  assert.deepEqual(Object.keys(messung.blaetter).sort(), [...ids].sort());
  for (const id of ids) {
    const e = messung.blaetter[id];
    assert.equal(e.id, id);
    assert.equal(e.frames.length, 8, `${id}: nicht acht Frames gemessen`);
    for (const [i, f] of e.frames.entries()) {
      assert.equal(f.index, i, `${id}: Frameindex`);
      assert.ok(Array.isArray(f.bbox) && f.bbox.length === 4, `${id}/F${f.index}: bbox fehlt`);
      assert.ok(Number.isFinite(f.deckung), `${id}/F${f.index}: Deckung fehlt`);
      assert.ok(Number.isFinite(f.halbsaum), `${id}/F${f.index}: Halbsaum fehlt`);
    }
    for (const k of KRITERIEN) {
      assert.equal(typeof e.pruefung[k]?.ok, 'boolean', `${id}: ${k}.ok fehlt`);
    }
    assert.ok(e.pruefung.frames.belegt >= 0 && e.pruefung.frames.belegt <= 8);
    assert.ok(Number.isFinite(e.pruefung.alpha.transparenteEcken));
    assert.ok(Number.isFinite(e.pruefung.identitaet.histKorrMin));
    assert.ok(Number.isFinite(e.pruefung.identitaet.silhouetteIouMin));
    assert.ok(Number.isFinite(e.pruefung.richtung.streuungGrad));
    assert.ok(Number.isFinite(e.pruefung.bewegung.distinkteFrames));
    assert.ok(Number.isFinite(e.pruefung.bewegung.loopDiff));
    assert.ok(e.pruefung.rolle.befund.length > 3);
    assert.ok(e.pruefung.effekt.befund.length > 3);
    assert.ok(e.pruefung.browser.befund.length > 3);
    assert.ok(e.naechsterSchritt.length > 10, `${id}: nächster Schritt fehlt`);
    assert.ok(e.identitaetFrames.length === 8, `${id}: Frame-Identitätsmessung fehlt`);
  }
});

/** Frameindex 0..7 in Rasterreihenfolge. */
test('Manifesturteil, Messung und Sperrgründe laufen nicht auseinander', () => {
  let daten = 0;
  let abgelehnt = 0;
  for (const id of ids) {
    const e = manifest.waffen[id];
    const m = messung.blaetter[id];
    assert.ok(ANIM_ABNAHME_STUFEN.includes(e.abnahme), `${id}: unbekannte Stufe`);
    assert.equal(e.abnahme, m.pruefung.ergebnis.abnahme, `${id}: Manifest ≠ Messung`);
    assert.deepEqual(e.sperrgruende, m.pruefung.ergebnis.sperrgruende, `${id}: Sperrgründe ≠ Messung`);
    assert.deepEqual(e.sperrgruende, KRITERIEN.filter(k => e.pruefung[k].ok !== true), `${id}: Sperrgründe ≠ Kriterien`);
    assert.equal(e.freigabe, false, `${id}: vor Produktanschluss freigegeben`);
    assert.equal(animAbnahmePruefen(e).fehler.length, 0, `${id}: ${animAbnahmePruefen(e).fehler.join('; ')}`);
    if (e.abnahme === 'datenabgenommen') {
      daten += 1;
      assert.equal(animAbnahmePruefen(e).datenOk, true);
      assert.equal(animAbnahmePruefen(e).produktOk, false, `${id}: Datenabnahme darf nicht Produkt sein`);
      assert.ok(e.sperrgruende.every(k => ANIM_PRODUKT_KRITERIEN.includes(k)), `${id}: Datenkriterium offen`);
    } else {
      abgelehnt += 1;
      assert.equal(animAbnahmePruefen(e).datenOk, false, `${id}: abgelehnt, aber Daten ok`);
    }
  }
  assert.equal(daten, 1, 'genau ein Blatt darf die Datenabnahme bestehen');
  assert.equal(abgelehnt, 25);
  assert.equal(manifest.abnahme.ergebnis.datenabgenommen, daten);
  assert.equal(manifest.abnahme.ergebnis.abgelehnt, abgelehnt);
  assert.equal(manifest.abnahme.ergebnis.abgenommen, 0);
  assert.equal(manifest.waffen.pa_065.abnahme, 'datenabgenommen');
  assert.deepEqual(manifest.waffen.pa_065.sperrgruende, ['effekt', 'browser']);
  assert.equal(ANIM_STATUS, 'gesperrt');
  assert.equal(ANIM_FREIGABE.size, 0);
  assert.deepEqual(animFreigabePruefen(manifest), []);
});

test('kein Blatt mit offenem Kriterium lässt sich freigeben', () => {
  for (const id of ids) {
    const original = manifest.waffen[id];
    assert.equal(animBlattFreigegeben(original), false, `${id}: ohne Gate freigegeben`);
    assert.equal(animBlattFreigegeben(original, new Set([id])), false, `${id}: mit Gate freigegeben`);

    // Pauschale Manipulation: freigabe true, Stufe abgenommen. Der Beleg fehlt
    // bzw. ein Kriterium ist offen -> der Lader muss geschlossen bleiben.
    const manipuliert = structuredClone(original);
    manipuliert.freigabe = true;
    manipuliert.abnahme = 'abgenommen';
    assert.equal(animBlattFreigegeben(manipuliert, new Set([id])), false, `${id}: manipulierte Freigabe`);
    assert.ok(animAbnahmePruefen(manipuliert).fehler.length > 0, `${id}: Fehler nicht erkannt`);
    const halb = structuredClone(manifest);
    halb.waffen[id] = manipuliert;
    assert.ok(animFreigabePruefen(halb, new Set([id])).some(f => f.includes(id)), `${id}: Manifestprüfung blind`);
  }
  for (const id of ids) assert.equal(holeZusatzAnim(id), null);
  assert.equal(waffenAnimZustand().freigegeben.length, 0);
});

test('der Lader weist auch eine manipulierte Freigabeliste ab', async () => {
  let ladungen = 0;
  const alle = new Set(ids);
  const lader = erzeugeAnimLader({
    freigabe: alle,
    abnahme: manifest.waffen,
    ladeManifest: () => { ladungen += 1; return Promise.resolve(manifest); },
  });
  for (const id of ids) assert.equal(lader.hole(id), null, `${id}: trotz Abweisung geladen`);
  assert.equal(ladungen, 0, 'Manifest wurde trotz fehlender Produktabnahme geladen');
  const z = lader.zustand();
  assert.equal(z.gesperrt, 0);
  assert.equal(z.abgewiesen, 26);
  assert.equal(z.manifestLadungen, 0);

  // Auch ohne Vorabbildung muss der Lader nach dem Laden jeden Eintrag prüfen.
  let ladungen2 = 0;
  const lader2 = erzeugeAnimLader({
    freigabe: alle,
    ladeManifest: () => { ladungen2 += 1; return Promise.resolve(manifest); },
  });
  assert.equal(lader2.hole('pa_065'), null);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ladungen2, 1);
  for (const id of ids) assert.equal(lader2.hole(id), null, `${id}: aus Manifest geladen`);
});

test('Gegenprobe: ein vollständiger Beleg öffnet den Lader, ein offenes Kriterium schließt ihn', async () => {
  const gut = vollbeleg();
  assert.equal(animAbnahmePruefen(gut).produktOk, true);
  assert.equal(animBlattFreigegeben(gut, new Set([gut.id])), true);

  const lader = erzeugeAnimLader({
    freigabe: new Set([gut.id]),
    abnahme: { [gut.id]: gut },
    ladeManifest: () => Promise.resolve({ waffen: { [gut.id]: gut } }),
  });
  assert.equal(lader.hole(gut.id), null, 'erster Aufruf startet nur den Ladevorgang');
  await Promise.resolve();
  await Promise.resolve();
  const geladen = lader.hole(gut.id);
  assert.equal(geladen?.id, gut.id, 'vollständiger Beleg wurde nicht geladen');

  // Ein einziges offenes Kriterium genügt, um denselben Beleg zu schließen.
  const kaputt = vollbeleg();
  kaputt.pruefung.bewegung = { ok: false, befund: 'nur 3 Frames' };
  kaputt.abnahme = 'abgelehnt';
  kaputt.freigabe = true;
  kaputt.sperrgruende = ['bewegung'];
  assert.equal(animAbnahmePruefen(kaputt).produktOk, false);
  assert.equal(animBlattFreigegeben(kaputt, new Set([kaputt.id])), false);
  const lader2 = erzeugeAnimLader({
    freigabe: new Set([kaputt.id]),
    abnahme: { [kaputt.id]: kaputt },
    ladeManifest: () => { throw new Error('darf nicht laden'); },
  });
  assert.equal(lader2.hole(kaputt.id), null);
});

test('der Bericht nennt jedes Blatt mit seinem Urteil', () => {
  assert.match(bericht, /0 produktfreigegeben/);
  assert.match(bericht, /1 datenabgenommen/);
  assert.match(bericht, /25 abgelehnt/);
  assert.ok(existsSync(join(AUDIT, 'anim-abnahme-messung.json')));
  for (const id of ids) {
    assert.ok(bericht.includes(`### ${id} —`), `${id}: Einzelbefund fehlt`);
    assert.ok(bericht.includes(`**Abnahme: ${manifest.waffen[id].abnahme}**`), `${id}: Urteil fehlt`);
  }
});
