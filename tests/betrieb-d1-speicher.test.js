/**
 * Vertrag des Speichers der Nutzerdatenbank (scripts/betrieb/web/speicher.mjs): Der D1-Speicher verhält sich wie der
 * Arbeitsspeicher-Speicher der Tests, einschließlich der atomaren Bedingungen (`neu` nur bei neuem Schlüssel,
 * `ersetze` nur bei passender Version). Die D1-Bindung wird hier von einer echten SQLite-Datenbank (`node:sqlite`)
 * bedient, die dieselbe Schnittstelle (`prepare().bind().first()/run()`, `meta.changes`) anbietet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SpeicherImSpeicher, D1Speicher, erzeugeD1Speicher } from '../scripts/betrieb/web/speicher.mjs';

/** Minimale D1-Hülle über node:sqlite (gleiche Aufrufform wie die Cloudflare-Bindung). */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const h = {
        bind(...a) { args = a; return h; },
        async first() { return stmt.get(...args) ?? null; },
        async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
      };
      return h;
    },
  };
}

const faelle = {
  'Arbeitsspeicher': async () => new SpeicherImSpeicher(),
  'D1': async () => erzeugeD1Speicher(fakeD1()),
};

for (const [name, bau] of Object.entries(faelle)) {
  test(`Speicher ${name}: lesen, neu, ersetzen, setzen, löschen mit atomaren Bedingungen`, async () => {
    const s = await bau();
    assert.equal(await s.lies('nutzer', 'a'), null);
    assert.equal(await s.neu('nutzer', 'a', { n: 1 }), true);
    assert.equal(await s.neu('nutzer', 'a', { n: 2 }), false, 'zweites neu() verliert');
    const e1 = await s.lies('nutzer', 'a');
    assert.deepEqual(e1.wert, { n: 1 });
    assert.equal(await s.ersetze('nutzer', 'a', { n: 3 }, e1.etag), true);
    assert.equal(await s.ersetze('nutzer', 'a', { n: 4 }, e1.etag), false, 'alte Version verliert');
    const e2 = await s.lies('nutzer', 'a');
    assert.deepEqual(e2.wert, { n: 3 });
    assert.notEqual(e2.etag, e1.etag);
    await s.setze('nutzer', 'a', { n: 5 });
    assert.deepEqual((await s.lies('nutzer', 'a')).wert, { n: 5 });
    assert.equal(await s.ersetze('nutzer', 'a', { n: 6 }, e2.etag), false, 'setze() zählt die Version hoch');
    await s.setze('nutzer', 'neu', { n: 7 });
    assert.deepEqual((await s.lies('nutzer', 'neu')).wert, { n: 7 });
    assert.equal(await s.lies('namen', 'a'), null, 'Bereiche sind getrennt');
    await s.loesche('nutzer', 'a');
    assert.equal(await s.lies('nutzer', 'a'), null);
    assert.equal(await s.neu('nutzer', 'a', { n: 8 }), true, 'nach dem Löschen wieder neu');
  });
}

test('D1-Speicher: Werte kommen als JSON an, Schema ist idempotent', async () => {
  const d1 = fakeD1();
  const s1 = await erzeugeD1Speicher(d1);
  await s1.setze('x', 'k', { liste: [1, 2], text: 'äö' });
  const s2 = await erzeugeD1Speicher(d1); // zweites Anlegen darf nichts zerstören
  assert.deepEqual((await s2.lies('x', 'k')).wert, { liste: [1, 2], text: 'äö' });
  assert.ok(new D1Speicher(d1));
});
