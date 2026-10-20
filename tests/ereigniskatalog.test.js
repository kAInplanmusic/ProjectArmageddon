/**
 * Der Ereigniskatalog ist die EINE Quelle je Ereignisart (Einteilung, Drossel, Stummbegründung,
 * Einzweig-Beleg, Klang, Bildwirkung). Dieser Test hält fest, dass nichts daneben steht:
 *
 *   - Die Protokolllisten (`shared/protocol.js`) sind aus dem Katalog abgeleitet.
 *   - Jede Wirkung in `client/ereignisse.js` hat einen Katalogeintrag.
 *   - Die Wirkung führt AUSGEFÜHRT nur die im Katalog genannten Klänge und Bildwirkungen aus.
 *   - Jeder genannte Klang kennt der Mischer, jede genannte Bildwirkung der Renderer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EREIGNIS_KATALOG, KATALOG_ANZEIGE, KATALOG_ZUSTAND, KATALOG_GEDROSSELT } from '../src/shared/ereigniskatalog.js';
import { ANZEIGE_EREIGNISARTEN, ZUSTANDSEREIGNISARTEN, GEDROSSELTE_EREIGNISARTEN } from '../src/shared/protocol.js';
import { EREIGNIS_WIRKUNGEN } from '../src/client/ereignisse.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lies = datei => fs.readFileSync(path.join(ROOT, datei), 'utf8');

test('Protokolllisten sind aus dem Katalog abgeleitet, überschneidungsfrei und vollständig', () => {
  assert.deepEqual([...ANZEIGE_EREIGNISARTEN], [...KATALOG_ANZEIGE]);
  assert.deepEqual([...ZUSTANDSEREIGNISARTEN], [...KATALOG_ZUSTAND]);
  assert.deepEqual([...GEDROSSELTE_EREIGNISARTEN], [...KATALOG_GEDROSSELT]);
  assert.equal(KATALOG_ANZEIGE.length + KATALOG_ZUSTAND.length, Object.keys(EREIGNIS_KATALOG).length);
  assert.equal(new Set([...KATALOG_ANZEIGE, ...KATALOG_ZUSTAND]).size, Object.keys(EREIGNIS_KATALOG).length, 'jede Art in genau einer Klasse');
  for (const [art, e] of Object.entries(EREIGNIS_KATALOG)) {
    assert.ok(['anzeige', 'zustand'].includes(e.klasse), `${art}: Klasse`);
    if (e.drossel !== undefined) assert.ok(['boden', 'zustand'].includes(e.drossel), `${art}: Drossel`);
    if (e.drossel === 'zustand') assert.equal(e.klasse, 'zustand', `${art}: eine Zustandsdrossel gehört zu einer Zustandsart`);
    if (e.stumm !== undefined) assert.ok(e.stumm.length > 10, `${art}: die Stummbegründung muss etwas sagen`);
  }
});

test('Jede Wirkung der Tabelle hat einen Katalogeintrag', () => {
  const fehlt = Object.keys(EREIGNIS_WIRKUNGEN).filter(art => !(art in EREIGNIS_KATALOG));
  assert.deepEqual(fehlt, [], 'Diese Arten haben eine Wirkung, aber keinen Katalogeintrag');
});

/** Ein Kontext, der jeden Aufruf aufzeichnet (`k.sound.verarbeite({type})` und `k.renderer.<methode>()`). */
function rekorder(name, sink) {
  const f = function () {};
  return new Proxy(f, {
    get(_, p) {
      if (p === Symbol.toPrimitive) return () => 1;
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return rekorder(`${name}.${p}`, sink);
    },
    apply(_, __, args) { sink(name, args); return rekorder(`${name}()`, sink); },
  });
}

const nutzlast = () => new Proxy(
  { runs: [1, 2, 3, 4, 5, 6, 7, 8], zellen: [1, 2], zuege: [1, 2, 3, 4], teile: [], x: 10, y: 20, radius: 20, hit: true, target: 1, amount: 5, damage: 10 },
  { get: (t, p) => (p in t ? t[p] : (typeof p === 'string' ? 3 : undefined)) },
);

test('Ausgeführt: jede Wirkung löst nur die im Katalog genannten Klänge und Bildwirkungen aus', () => {
  let beobachtet = 0;
  for (const [art, wirkung] of Object.entries(EREIGNIS_WIRKUNGEN)) {
    const eintrag = EREIGNIS_KATALOG[art];
    const klang = new Set(eintrag.klang ?? []);
    const anim = new Set(eintrag.anim ?? []);
    for (const zweig of ['lokal', 'online']) {
      if (typeof wirkung[zweig] !== 'function') continue;
      const sink = (name, args) => {
        if (name === 'k.sound.verarbeite' && args[0]?.type) {
          beobachtet += 1;
          assert.ok(klang.has(args[0].type), `${art} (${zweig}): Klang "${args[0].type}" fehlt im Katalog`);
        } else if (name.startsWith('k.renderer.')) {
          beobachtet += 1;
          const methode = name.split('.')[2];
          assert.ok(anim.has(methode), `${art} (${zweig}): Bildwirkung "${methode}" fehlt im Katalog`);
        }
      };
      for (let i = 0; i < 4; i += 1) {
        try { wirkung[zweig](rekorder('k', sink), nutzlast()); } catch (fehler) {
          if (fehler?.name === 'AssertionError') throw fehler;
        }
      }
    }
  }
  assert.ok(beobachtet > 30, `Es wurden nur ${beobachtet} Aufrufe beobachtet — der Test prüft sonst nichts`);
});

test('Die genannten Klänge kennt der Mischer, die genannten Bildwirkungen der Renderer', () => {
  const mischer = lies('src/client/soundMixer.js');
  const renderer = lies('src/client/renderer.js');
  for (const [art, e] of Object.entries(EREIGNIS_KATALOG)) {
    for (const klang of e.klang ?? []) {
      assert.ok(mischer.includes(`case '${klang}'`), `${art}: der Mischer kennt die Klangart "${klang}" nicht`);
    }
    for (const methode of e.anim ?? []) {
      assert.match(renderer, new RegExp(`^  ${methode}\\(`, 'm'), `${art}: der Renderer hat keine Methode "${methode}"`);
    }
  }
});

test('Der Katalog nennt zu jeder Art mit Klang oder Bildwirkung auch einen Zweig der Tabelle', () => {
  for (const [art, e] of Object.entries(EREIGNIS_KATALOG)) {
    if (!(e.klang?.length || e.anim?.length)) continue;
    assert.ok(art in EREIGNIS_WIRKUNGEN, `${art}: Klang/Bildwirkung im Katalog, aber keine Wirkung in der Tabelle`);
  }
});
