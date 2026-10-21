/**
 * Tests: Klangprofile, Zuordnung Waffe → Profil, Raumklang, Stimmenlimit, Auswertung.
 *
 * Die Tabellen sind reine Daten; hier wird geprüft, dass jede Waffe und jede Kategorie ein
 * Profil hat, dass die Zuordnung die vorgesehenen Klänge wählt und dass Panning, Abstand und
 * Stimmenlimit rechnen, wie dokumentiert. Die Offline-Messung (`tools/klang-auswertung.mjs`)
 * liegt als `docs/klang/auswertung.json` vor und wird hier gegen die aktuelle Tabelle gelesen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { WEAPONS, getWeapon } from '../src/shared/config/weapons.js';
import {
  ALLE_PROFILE, BUSSE, DAUER_MAX, EREIGNIS_PROFILE, KATEGORIEN, KATEGORIE_PROFIL, PROFIL_KORREKTUR,
  SCHUSS_PROFILE, STIMMEN_MAX, StimmenVerwalter, einschlagProfil, explosionKlasse, gesamtDauer,
  mulberry, profilDauer, raeumlich, schussProfilFuer, tonErlaubt, trefferProfil,
} from '../src/client/klangProfile.js';

test('Jede Kategorie hat ein Standardprofil, und alle sind verschieden', () => {
  assert.deepEqual(Object.keys(KATEGORIE_PROFIL).sort(), [...KATEGORIEN].sort());
  const namen = Object.values(KATEGORIE_PROFIL);
  for (const n of namen) assert.ok(SCHUSS_PROFILE[n], `Profil ${n} fehlt`);
  assert.equal(new Set(namen).size, KATEGORIEN.length, 'zwei Kategorien teilen sich ein Profil');
});

test('Jede Waffe des Katalogs bekommt ein vorhandenes Schussprofil', () => {
  const benutzt = new Map();
  for (const w of WEAPONS) {
    const p = schussProfilFuer(w);
    assert.ok(SCHUSS_PROFILE[p], `${w.id} → ${p} ist kein Schussprofil`);
    benutzt.set(p, (benutzt.get(p) ?? 0) + 1);
  }
  for (const name of Object.keys(SCHUSS_PROFILE)) {
    assert.ok(benutzt.has(name), `kein einziger Schuss nutzt das Profil ${name}`);
  }
  assert.ok(Object.keys(SCHUSS_PROFILE).length >= 8 && Object.keys(SCHUSS_PROFILE).length <= 16);
});

test('Die Korrekturtabelle nennt nur echte Waffen und echte Profile', () => {
  for (const [id, profil] of Object.entries(PROFIL_KORREKTUR)) {
    assert.ok(getWeapon(id), `${id} gibt es nicht`);
    assert.ok(SCHUSS_PROFILE[profil], `${id} → ${profil} unbekannt`);
  }
});

test('Die Zuordnung wählt je Waffenart den vorgesehenen Klang', () => {
  const soll = {
    pa_001: 'nahkampf', // Baseballschläger
    pa_037: 'rakete', // Raketenwerfer
    pa_039: 'rakete', // Mörser
    pa_047: 'wurf', // Handgranate (Zünder)
    pa_049: 'wurf', // Bumerang
    pa_055: 'gewehr', // Scharfschützengewehr
    pa_057: 'pistole', // Revolver
    pa_043: 'schwer', // Kampfgeschütz
    pa_062: 'feuer', // Flammenwerfer
    pa_071: 'eis', // Eisschlag
    pa_129: 'blitz', // Tesla-Turm
    pa_022: 'laser', // Plasma-Blaster
    pa_092: 'selbst', // Heilzauber (Selbstwirkung)
    pa_082: 'magie', // Goldene Zauberrolle
    pa_147: 'ultimate', // Welten-Drache
    pa_140: 'laser', // Quantenblaster
  };
  for (const [id, profil] of Object.entries(soll)) {
    assert.equal(schussProfilFuer(getWeapon(id)), profil, `${id} (${getWeapon(id).displayName})`);
  }
  // Hitscan-Energiewaffen klingen als Strahl.
  assert.equal(schussProfilFuer({ id: 'x', category: 'tech', damage: 30, damageType: 'energy', delivery: 'hitscan' }), 'strahl');
  assert.equal(schussProfilFuer(null), 'pistole');
});

test('Alle Profile haben gültige Schichten, Busse und eine Dauer unter drei Sekunden', () => {
  for (const [name, p] of Object.entries(ALLE_PROFILE)) {
    assert.ok(BUSSE.includes(p.bus), `${name}: Bus ${p.bus}`);
    assert.ok(Number.isFinite(p.pegel) && p.pegel > 0 && p.pegel <= 1, `${name}: Pegel`);
    assert.ok(p.nachhall >= 0 && p.nachhall <= 1, `${name}: Nachhall`);
    assert.ok(p.schichten.length >= 2, `${name}: zu wenige Schichten`);
    for (const s of p.schichten) {
      assert.ok(['rausch', 'ton', 'knistern'].includes(s.art), `${name}: Art ${s.art}`);
      for (const [feld, wert] of Object.entries(s)) {
        if (typeof wert === 'number') assert.ok(Number.isFinite(wert) && wert >= 0, `${name}.${feld} = ${wert}`);
      }
      if (s.art === 'ton') assert.ok(s.f0 > 0, `${name}: f0`);
      if (s.art !== 'knistern') assert.ok(s.ab > 0, `${name}: ab`);
      if (s.art === 'rausch') assert.ok(s.an + s.ab <= 2, `${name}: Rauschschicht länger als der Puffer erlaubt`);
    }
    assert.ok(gesamtDauer(p) < DAUER_MAX, `${name}: ${gesamtDauer(p)} s inklusive Hall`);
    assert.ok(profilDauer(p) > 0.05);
  }
  assert.ok(Object.keys(EREIGNIS_PROFILE).length >= 20);
});

test('Explosionsklassen und Einschlagprofile folgen Radius und Material', () => {
  assert.equal(explosionKlasse(0), 'einschlag');
  assert.equal(explosionKlasse(12), 'klein');
  assert.equal(explosionKlasse(40), 'mittel');
  assert.equal(explosionKlasse(60), 'gross');
  assert.equal(explosionKlasse(90), 'riesig');
  assert.equal(einschlagProfil({ radius: 0, material: 'erde' }), 'einschlag_erde');
  assert.equal(einschlagProfil({ radius: 0, material: 'fels' }), 'einschlag_fels');
  assert.equal(einschlagProfil({ radius: 90 }), 'explosion_riesig');
  assert.equal(einschlagProfil({ radius: 20, material: 'wasser' }), 'platscher_klein');
  assert.equal(einschlagProfil({ radius: 60, material: 'wasser' }), 'platscher_gross');
  for (const r of [0, 10, 30, 50, 80]) for (const m of ['erde', 'fels', 'wasser']) {
    assert.ok(ALLE_PROFILE[einschlagProfil({ radius: r, material: m })]);
  }
});

test('Trefferprofile nach Schadensanteil, Krit und Selbstschaden', () => {
  assert.equal(trefferProfil({ schaden: 5, maxHealth: 100 }), 'treffer_figur_klein');
  assert.equal(trefferProfil({ schaden: 20, maxHealth: 100 }), 'treffer_figur_mittel');
  assert.equal(trefferProfil({ schaden: 60, maxHealth: 100 }), 'treffer_figur_gross');
  assert.equal(trefferProfil({ schaden: 20, kritisch: true }), 'treffer_krit');
  assert.equal(trefferProfil({ schaden: 20, selbst: true }), 'treffer_selbst');
  assert.equal(trefferProfil({ schaden: 20, maxHealth: 0 }), 'treffer_figur_mittel');
});

test('Panning und Abstand: Mitte voll, links/rechts getrennt, weit leiser und dunkler', () => {
  const h = { x: 500, y: 300, halbBreite: 400 };
  const mitte = raeumlich({ x: 500, y: 300 }, h);
  assert.deepEqual(mitte, { pan: 0, pegel: 1, tiefpass: 0, verzoegerung: 0 });
  const links = raeumlich({ x: 200, y: 300 }, h);
  const rechts = raeumlich({ x: 800, y: 300 }, h);
  assert.ok(links.pan < 0 && rechts.pan > 0);
  assert.ok(Math.abs(links.pan + rechts.pan) < 1e-9, 'symmetrisch');
  assert.ok(links.pegel < 1 && links.pegel >= 0.7);
  const weit = raeumlich({ x: 2500, y: 300 }, h);
  assert.ok(weit.pan <= 0.85 && weit.pan > 0.8, 'Stereolage ist begrenzt');
  assert.ok(weit.pegel < links.pegel && weit.pegel >= 0.12);
  assert.ok(weit.tiefpass > 0 && weit.tiefpass < 16000);
  assert.ok(weit.verzoegerung > 0 && weit.verzoegerung <= 0.4);
  // monoton: je weiter, desto leiser
  let davor = 2;
  for (let d = 0; d <= 3000; d += 100) {
    const p = raeumlich({ x: 500 + d, y: 300 }, h).pegel;
    assert.ok(p <= davor + 1e-12, `Pegel steigt bei ${d}`);
    davor = p;
  }
  // ohne Position oder Hörer: mittig, voll
  assert.deepEqual(raeumlich(null, h), mitte);
  assert.deepEqual(raeumlich({ x: 1, y: 1 }, null), mitte);
  assert.deepEqual(raeumlich({ x: NaN, y: 1 }, h), mitte);
});

test('Stimmenlimit: ab dem Limit wird die älteste Stimme gekappt', () => {
  const v = new StimmenVerwalter(3);
  const gekappt = [];
  const stimme = (start, ende) => ({ start, ende, kappen: () => gekappt.push(start) });
  v.melde(stimme(1, 100), 1);
  v.melde(stimme(2, 100), 2);
  v.melde(stimme(3, 100), 3);
  assert.equal(v.anzahl, 3);
  assert.equal(v.melde(stimme(4, 100), 4), 1);
  assert.deepEqual(gekappt, [1]);
  assert.equal(v.anzahl, 3);
  // abgelaufene Stimmen zählen nicht mehr
  assert.equal(v.melde(stimme(200, 300), 150), 0);
  assert.equal(v.anzahl, 1);
  assert.equal(v.spitze, 3);
  assert.equal(v.gekappt, 1);
  assert.equal(STIMMEN_MAX, 24);
});

test('Ton ist in Tests aus, mit ?ton=1 erzwungen und mit ?ton=0 aus', () => {
  assert.equal(tonErlaubt({ suche: '', webdriver: false }), true);
  assert.equal(tonErlaubt({ suche: '', webdriver: true }), false);
  assert.equal(tonErlaubt({ suche: '?ton=1', webdriver: true }), true);
  assert.equal(tonErlaubt({ suche: '?ton=0', webdriver: false }), false);
});

test('mulberry ist deterministisch', () => {
  const a = mulberry(5); const b = mulberry(5);
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b());
});

test('Die Offline-Auswertung passt zur Tabelle und hält die Grenzen ein', () => {
  const datei = new URL('../docs/klang/auswertung.json', import.meta.url);
  const a = JSON.parse(fs.readFileSync(datei, 'utf8'));
  const hash = crypto.createHash('sha256').update(JSON.stringify(ALLE_PROFILE)).digest('hex').slice(0, 16);
  assert.equal(a.profilHash, hash,
    'Die Profiltabelle hat sich geändert: node tools/klang-auswertung.mjs neu laufen lassen');
  assert.deepEqual(Object.keys(a.profile).sort(), Object.keys(ALLE_PROFILE).sort());
  for (const [name, m] of Object.entries(a.profile)) {
    assert.equal(m.nan, false, `${name}: NaN`);
    assert.ok(m.peakDb <= 0, `${name}: Spitze ${m.peakDb} dBFS`);
    assert.ok(m.peakDb > -40, `${name}: praktisch stumm`);
    assert.ok(m.dauer > 0 && m.dauer < DAUER_MAX, `${name}: Dauer ${m.dauer}`);
    assert.ok(m.endpegelDb < -60, `${name}: klingt nicht aus (${m.endpegelDb} dB)`);
    assert.ok(m.schwerpunkt > 20 && m.schwerpunkt < 12000, `${name}: Schwerpunkt`);
  }
  for (const [name, s] of Object.entries(a.stress)) {
    assert.equal(s.ueber0dB, false, `Stresstest ${name} übersteuert`);
    assert.ok(s.peakDb <= 0 && !s.nan, `Stresstest ${name}: ${s.peakDb} dBFS`);
  }
  for (const kat of KATEGORIEN) assert.ok(a.kategorien[kat], `Kategorie ${kat} fehlt in der Auswertung`);
  assert.ok(a.minAbstandVerhaeltnis >= 1.25,
    `Kategorien klingen zu ähnlich: kleinster Schwerpunkt-Abstand ×${a.minAbstandVerhaeltnis}`);
});
