import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KULISSEN_BREITEN,
  DPR_OBERGRENZE,
  gedeckelteDpr,
  leistungsObergrenze,
  waehleKulissenBreite,
  kulissenDateiname,
  kulissenKandidaten,
  vorladePlan,
  KulissenBildspeicher,
} from '../src/client/kulissenQuelle.js';

/**
 * A18: responsive Kulissenwahl. Geprüft wird die reine Rechnung — sichtbare
 * Breite, DPR-Deckel, Leistungsgrenze — und der Bildspeicher mit harter
 * Obergrenze, ohne DOM und ohne Bilddateien.
 */

class FakeBild {
  static alle = [];

  constructor() {
    this.onload = null;
    this.onerror = null;
    this.decoding = '';
    this._src = '';
    FakeBild.alle.push(this);
  }

  set src(wert) { this._src = wert; }
  get src() { return this._src; }
  fertig() { this.onload?.(); }
  scheitern() { this.onerror?.(); }
}

const OHNE_URL = () => undefined;
const URL_FUER = datei => (datei.includes('-2560') ? `/${datei}` : undefined);

test('Stufen sind aufsteigend und decken 1280 bis 3840 ab', () => {
  assert.deepEqual([...KULISSEN_BREITEN], [1280, 1920, 2560, 3840]);
  assert.equal(DPR_OBERGRENZE, 2);
});

test('Wahl folgt sichtbarer Breite × gedeckelter DPR', () => {
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 1280, dpr: 1 }).breite, 1280);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 1280, dpr: 2 }).breite, 2560);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 1920, dpr: 1 }).breite, 1920);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 1920, dpr: 2 }).breite, 3840);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 2560, dpr: 1 }).breite, 2560);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 3840, dpr: 1 }).breite, 3840);
});

test('DPR über 2 wird nicht vergrößert', () => {
  assert.equal(gedeckelteDpr(3), 2);
  assert.equal(gedeckelteDpr(4), 2);
  assert.equal(gedeckelteDpr(0), 1);
  assert.equal(gedeckelteDpr(NaN), 1);
  // iPhone-ähnlich: 390 CSS-px bei DPR 3 → 2560, nicht 3840.
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 390, dpr: 3 }).breite, 1280);
  assert.equal(waehleKulissenBreite({ sichtbareBreite: 1024, dpr: 3 }).breite, 2560);
});

test('Kein Hochskalieren über 3840 hinaus', () => {
  const r = waehleKulissenBreite({ sichtbareBreite: 7680, dpr: 2 });
  assert.equal(r.breite, 3840);
  assert.ok(r.bedarf > 3840, 'der Bedarf darf größer sein, die Quelle nicht');
});

test('Leistungsgrenze: Lite/kleine Geräte höchstens 1920, mittlere 2560', () => {
  assert.equal(leistungsObergrenze({ stufe: 'lite' }), 1920);
  assert.equal(leistungsObergrenze({ stufe: 'ultra', messung: { kerne: 2, speicherGB: 8 } }), 1920);
  assert.equal(leistungsObergrenze({ messung: { kerne: 4, speicherGB: 8 } }), 2560);
  assert.equal(leistungsObergrenze({ messung: { kerne: 8, speicherGB: 4 } }), 2560);
  assert.equal(leistungsObergrenze({ messung: { kerne: 8, speicherGB: 8 } }), 3840);
  // Unbekannte Werte sperren die große Fassung nicht.
  assert.equal(leistungsObergrenze({}), 3840);

  const begrenzt = waehleKulissenBreite({ sichtbareBreite: 1920, dpr: 2, leistung: { stufe: 'lite' } });
  assert.equal(begrenzt.breite, 1920);
  assert.match(begrenzt.grund, /Geräteleistung/);
});

test('Dateiname: 1280 bleibt Basis, größere Fassungen tragen die Breite', () => {
  assert.equal(kulissenDateiname('maritime_calm_day.webp', 1280), 'maritime_calm_day.webp');
  assert.equal(kulissenDateiname('maritime_calm_day.webp', 1920), 'maritime_calm_day-1920.webp');
  assert.equal(kulissenDateiname('maritime_calm_day.webp', 3840), 'maritime_calm_day-3840.webp');
  assert.equal(kulissenDateiname('', 3840), '');
});

test('Kandidaten: gewünschte Fassung zuerst, Basis als Rückfall', () => {
  assert.deepEqual(kulissenKandidaten('a.webp', 2560), ['a-2560.webp', 'a.webp']);
  assert.deepEqual(kulissenKandidaten('a.webp', 1280), ['a.webp']);
});

test('Vorladeplan: höchstens aktuelle und eine nächste Variante', () => {
  const plan = vorladePlan({
    aktuell: { file: 'a.webp' },
    naechste: { file: 'b.webp' },
    breite: 2560,
  });
  assert.deepEqual(plan.map(e => e.datei), ['a.webp', 'b.webp']);
  assert.ok(plan.every(e => e.breite === 2560));
  assert.equal(vorladePlan({ aktuell: { file: 'a.webp' }, naechste: { file: 'a.webp' }, breite: 1280 }).length, 1);
  assert.equal(vorladePlan({}).length, 0);
});

test('Bildspeicher hält nur die aktuelle Kulisse und gibt die alte frei', () => {
  FakeBild.alle = [];
  const speicher = new KulissenBildspeicher({ urlFuer: URL_FUER, ImageCtor: FakeBild });
  let geliefert = null;
  speicher.hole({ key: 'a', file: 'a.webp' }, 2560, { onBild: (bild) => { geliefert = bild; } });
  const erstes = FakeBild.alle.at(-1);
  assert.equal(erstes.src, '/a-2560.webp');
  erstes.fertig();
  assert.equal(geliefert, erstes);
  assert.equal(speicher.groesse, 1);

  speicher.hole({ key: 'b', file: 'b.webp' }, 2560, {});
  assert.equal(speicher.groesse, 1, 'die alte Kulisse wird beim Wechsel freigegeben');
  FakeBild.alle.at(-1).fertig();
  assert.equal(speicher.groesse, 1);
});

test('Bildspeicher: fehlende Großfassung fällt auf die Basisdatei zurück', () => {
  FakeBild.alle = [];
  const speicher = new KulissenBildspeicher({ urlFuer: d => `/${d}`, ImageCtor: FakeBild });
  let datei = null;
  speicher.hole({ key: 'a', file: 'a.webp' }, 2560, { onBild: (_b, d) => { datei = d; } });
  FakeBild.alle[0].scheitern();
  const zweites = FakeBild.alle[1];
  assert.equal(zweites.src, '/a.webp');
  zweites.fertig();
  assert.equal(datei, 'a.webp');
});

test('Bildspeicher: eine vorgeladene Variante bleibt, eine dritte wird verworfen', () => {
  FakeBild.alle = [];
  const speicher = new KulissenBildspeicher({ urlFuer: URL_FUER, ImageCtor: FakeBild });
  speicher.hole({ key: 'a', file: 'a.webp' }, 2560, {});
  FakeBild.alle.at(-1).fertig();

  speicher.vorladen({ key: 'b', file: 'b.webp' }, 2560);
  FakeBild.alle.at(-1).fertig();
  assert.equal(speicher.groesse, 2, 'aktuell + nächste');

  let sofort = null;
  const vorher = FakeBild.alle.length;
  speicher.hole({ key: 'b', file: 'b.webp' }, 2560, { onBild: b => { sofort = b; } });
  assert.equal(FakeBild.alle.length, vorher, 'die vorgeladene Datei wird nicht erneut geladen');
  assert.ok(sofort, 'das vorgeladene Bild kommt sofort');
  assert.equal(speicher.groesse, 1);

  speicher.vorladen({ key: 'c', file: 'c.webp' }, 2560);
  FakeBild.alle.at(-1).fertig();
  assert.equal(speicher.groesse, 2);
});

test('Bildspeicher: leere() entfernt alle Bildverweise', () => {
  FakeBild.alle = [];
  const speicher = new KulissenBildspeicher({ urlFuer: URL_FUER, ImageCtor: FakeBild });
  speicher.hole({ key: 'a', file: 'a.webp' }, 2560, {});
  FakeBild.alle.at(-1).fertig();
  speicher.leere();
  assert.equal(speicher.groesse, 0);
  assert.equal(speicher.aktuell, null);
  assert.equal(speicher.vorlauf, null);
});

test('Bildspeicher: ohne erreichbare Datei kommt genau ein Fehler', () => {
  FakeBild.alle = [];
  const speicher = new KulissenBildspeicher({ urlFuer: OHNE_URL, ImageCtor: FakeBild });
  const fehler = [];
  speicher.hole({ key: 'x', file: 'x.webp' }, 3840, { onFehler: e => fehler.push(e) });
  assert.equal(fehler.length, 1);
  assert.match(fehler[0].message, /lädt nicht/);
  assert.equal(speicher.groesse, 0);
});
