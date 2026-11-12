import assert from 'node:assert/strict';
import test from 'node:test';
import {
  wilson, wertAus, bauePlan, paarungen, profilTabelle, messeLaunchBase, messeReichweite, gegenprobeBahn,
  pruefeFraktionen, laufe, ALTE_PLATZVERGABE, STUFEN, SEED_BASIS, SEED_SCHRITT,
} from '../scripts/balance-rollen.mjs';

/**
 * Balancing je Rolle (Entscheidung 24, BAL-14): Das Messwerkzeug muss stimmen, bevor seine Zahlen etwas aussagen.
 * Diese Tests prüfen das Werkzeug (Pläne, Statistik, Gegenprobe der Ballistik, ein kleiner echter Lauf), nicht Spielwerte.
 */

test('Wilson-Intervall: bekannte Werte und Grenzfälle', () => {
  const w = wilson(5, 10);
  assert.equal(w.p, 0.5);
  assert.ok(Math.abs(w.unten - 0.2366) < 0.001 && Math.abs(w.oben - 0.7634) < 0.001);
  assert.equal(wilson(0, 0).p, null);
  assert.equal(wilson(10, 10).oben, 1);
});

test('Plan: feste Seeds, Platzwechsel, jede Paarung gleiche Seeds', () => {
  const rollen = [{ classId: 'a', archetypeId: null }, { classId: 'b', archetypeId: null }, { classId: 'c', archetypeId: null }];
  assert.equal(paarungen(rollen).length, 6, '3 Rollen: 3 Spiegel + 3 Kreuzpaarungen');
  const plan = bauePlan({ modul: 'x', rollen, klassen: 3, stufe: { karten: [{ id: 'k', format: '16:9', groesse: 'klein' }], seeds: 4 }, seedBasis: SEED_BASIS });
  assert.equal(plan.length, 6 * 4);
  const seeds = [...new Set(plan.map(j => j.seed))].sort((x, y) => x - y);
  assert.deepEqual(seeds, [0, 1, 2, 3].map(i => SEED_BASIS + SEED_SCHRITT * i));
  const ab = plan.filter(j => j.a === 'a' && j.b === 'b');
  assert.equal(ab[0].plaetze[0].classId, 'a');
  assert.equal(ab[1].plaetze[0].classId, 'b', 'ungerader Seedindex tauscht den Platz');
});

test('Rollen: 3 Klassen und 9 alte Kombinationen, davon 6 neue', () => {
  const t = profilTabelle();
  assert.equal(t.filter(z => z.fassung === 3).length, 3);
  const alt = t.filter(z => z.fassung === 2);
  assert.equal(alt.length, 9);
  assert.equal(alt.filter(z => z.neueKombination).length, 6);
  assert.equal(ALTE_PLATZVERGABE.length, 3);
  // Echte LP: 100 x Klassenfaktor.
  assert.deepEqual(t.filter(z => z.fassung === 3).map(z => z.lp), [130, 100, 70]);
});

test('Auswertung: Siegrate ohne Spiegel, Schaden je Zug', () => {
  const p = (rolle, schaden, zuege, schuesse, treffer) => ({ rolle, lp0: 100, zuege, schuesse, schaden, trefferZuege: treffer, tot: false, todMinuten: null, ertrunken: false });
  const spiele = [
    { sieger: 0, minuten: 3, plaetze: [p('a', 40, 4, 4, 2), p('b', 10, 4, 4, 1)] },
    { sieger: null, minuten: 5, plaetze: [p('b', 0, 4, 4, 0), p('a', 0, 4, 4, 0)] },
    { sieger: 0, minuten: 2, plaetze: [p('a', 10, 2, 2, 1), p('a', 0, 2, 2, 0)] }, // Spiegel
  ];
  const a = wertAus(spiele, 'a');
  assert.equal(a.partien, 2);
  assert.equal(a.siegrate, 0.75);
  // Schaden und Züge zählen auch die Spiegelfigur (nur die Siegrate lässt Spiegel aus): 50 LP in 12 Zügen, 3 Trefferzüge bei 12 Schüssen.
  assert.equal(a.schadenProZug, runde2(50 / 12));
  assert.equal(a.trefferquote, runde3(3 / 12));
});
const runde2 = x => Number(x.toFixed(2));
const runde3 = x => Number(x.toFixed(3));

test('ARCHETYPE_LAUNCH_BASE: Normalisierung auf das Mittel verschiebt Geschwindigkeit und Wurfweite rechnerisch', () => {
  const v = messeLaunchBase();
  assert.equal(v[0].geschwindigkeitProzent, 0, 'Ist-Zustand ist die Bezugsvariante');
  const mittel = v[1];
  assert.ok(mittel.geschwindigkeit < 1);
  assert.ok(Math.abs(mittel.reichweiteProzent - ((mittel.geschwindigkeit ** 2 - 1) * 100)) < 0.1);
});

test('Reichweite: Rechnung stimmt mit aimPreview des Matches überein', () => {
  const g = gegenprobeBahn();
  assert.ok(g.punkteVerglichen >= 20);
  assert.ok(g.maxAbweichungPx < 0.5, `Abweichung ${g.maxAbweichungPx} px`);
});

test('Reichweite: Okkultist weiter als Fernkampf, Nahkampf kürzer', () => {
  const r = messeReichweite();
  const med = name => r.zeilen.find(z => z.profil.startsWith(name)).je[2560].medianVerhaeltnis;
  assert.ok(med('okkultist') > med('neutral') && med('neutral') > med('nahkampf'));
});

test('Fraktionen: 3 Figuren je Klasse und Fraktion; die Engine liest keine Fraktion', () => {
  const f = pruefeFraktionen();
  assert.equal(f.dreiJeKlasseUndFraktion, true);
  assert.equal(f.figuren, 81);
});

test('Stufen: standard ist ausdrücklich enger als breit', () => {
  assert.ok(STUFEN.breit.klassen.seeds > STUFEN.standard.klassen.seeds);
  assert.ok(STUFEN.standard.klassen.karten.some(k => k.format === '24:9' && k.groesse === 'gross'), 'Menü-Standard 24:9 gross gehört zur Standardstufe');
});

test('Kleiner Lauf: ein Duell, deterministisch wiederholbar', { timeout: 120_000 }, async () => {
  const opt = { stufe: 'klein', module: ['klassen'], seeds: 1, nur: 'nahkampf:okkultist', parallel: 1 };
  const a = await laufe(opt);
  const b = await laufe(opt);
  assert.equal(a.klassen.zusammenfassung.partien, 1);
  assert.deepEqual(a.klassen.zusammenfassung.rollen, b.klassen.zusammenfassung.rollen, 'gleiche Seeds, gleiche Zahlen');
  const nk = a.klassen.zusammenfassung.rollen.find(r => r.rolle === 'nahkampf');
  assert.equal(nk.lp, '130');
});
