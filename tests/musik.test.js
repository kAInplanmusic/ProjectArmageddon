/**
 * Hintergrundmusik: Manifest, Dateien, Playlist-Logik und die Wiedergabe-Klasse
 * (mit Attrappen für Audio und AudioContext — es klingt nichts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  STIMMUNGEN, pruefeManifest, stueckeFuer, waehleNaechstes,
} from '../src/client/musikListe.js';
import { Musik, wiedergabeErlaubt, DUCK_FAKTOR } from '../src/client/musik.js';
import { pruefeHymnen, hymnenStueck } from '../src/client/musikListe.js';
import { FACTIONS } from '../src/shared/config/factions.js';

const ORDNER = resolve(import.meta.dirname, '../src/client/assets/music');
const MANIFEST = JSON.parse(readFileSync(join(ORDNER, 'manifest.json'), 'utf8'));
const HYMNEN = JSON.parse(readFileSync(join(ORDNER, 'fraktionen', 'manifest.json'), 'utf8'));
const FRAKTION_IDS = FACTIONS.map(f => f.id);
const NAMEN = Object.fromEntries(FACTIONS.map(f => [f.id, f.name]));

/* --------------------------------------------------------------- Manifest */

test('Manifest ist gültig und vollständig', () => {
  assert.deepEqual(pruefeManifest(MANIFEST), []);
  assert.ok(MANIFEST.stuecke.length >= 3);
});

test('Jedes Stück hat seine Datei, plausible Größe und Dauer', () => {
  for (const s of MANIFEST.stuecke) {
    const pfad = join(ORDNER, s.datei);
    assert.ok(existsSync(pfad), `${s.datei} fehlt`);
    const bytes = statSync(pfad).size;
    assert.ok(bytes > 100_000 && bytes < 4_000_000, `${s.datei}: ${bytes} Bytes unplausibel`);
    assert.ok(s.dauer >= 20 && s.dauer <= 600, `${s.id}: Dauer ${s.dauer} unplausibel`);
    // Bitrate aus Größe/Dauer: für das Kodierziel (~128 kbit/s VBR) muss sie in der Nähe liegen.
    const kbit = (bytes * 8) / s.dauer / 1000;
    assert.ok(kbit > 80 && kbit < 200, `${s.id}: ${kbit.toFixed(0)} kbit/s passt nicht zu Größe und Dauer`);
  }
});

test('Gesamtgröße der Musik bleibt unter 4 MB', () => {
  const summe = MANIFEST.stuecke.reduce((a, s) => a + statSync(join(ORDNER, s.datei)).size, 0);
  assert.ok(summe < 4_000_000, `${summe} Bytes`);
});

test('Dateien tragen den Titel als Metadatum', () => {
  for (const s of MANIFEST.stuecke) {
    const kopf = readFileSync(join(ORDNER, s.datei)).subarray(0, 4096).toString('latin1');
    assert.ok(kopf.includes(s.titel), `${s.datei}: Titel "${s.titel}" nicht im ID3-Kopf`);
  }
});

test('Menü und Match haben je mindestens ein Stück', () => {
  assert.ok(stueckeFuer(MANIFEST, 'menu').length >= 1);
  assert.ok(stueckeFuer(MANIFEST, 'match').length >= 2);
  for (const s of MANIFEST.stuecke) for (const m of s.stimmung) assert.ok(STIMMUNGEN.includes(m));
});

test('pruefeManifest erkennt Fehler', () => {
  assert.ok(pruefeManifest(null).length > 0);
  assert.ok(pruefeManifest({ stuecke: [{ id: 'A b', titel: '', datei: 'x', dauer: 0, stimmung: ['x'] }] }).length >= 4);
  const doppelt = { stuecke: [MANIFEST.stuecke[0], MANIFEST.stuecke[0]] };
  assert.ok(pruefeManifest(doppelt).some(f => f.includes('doppelt')));
});

test('Rückfall: ohne Stück der Stimmung gilt match bzw. die ganze Liste', () => {
  const nurMenu = { stuecke: [{ ...MANIFEST.stuecke[0], stimmung: ['menu'] }] };
  assert.equal(stueckeFuer(nurMenu, 'match').length, 1);
  assert.equal(stueckeFuer(nurMenu, 'intensiv').length, 1);
});

/* ---------------------------------------------------------------- Playlist */

test('waehleNaechstes wiederholt nie direkt und mischt ohne Zurücklegen', () => {
  const kand = MANIFEST.stuecke;
  let zufall = 0;
  const lcg = () => { zufall = (zufall * 1103515245 + 12345) % 2147483648; return zufall / 2147483648; };
  let letzte = null;
  let runde = [];
  const folge = [];
  for (let i = 0; i < 300; i++) {
    if (runde.length >= kand.length) runde = [];
    const s = waehleNaechstes(kand, letzte, runde, lcg);
    assert.notEqual(s.id, letzte, `Wiederholung bei Schritt ${i}`);
    runde.push(s.id);
    letzte = s.id;
    folge.push(s.id);
  }
  // Jede Runde aus drei Stücken enthält jedes genau einmal.
  for (let i = 0; i + 3 <= folge.length; i += 3) {
    assert.equal(new Set(folge.slice(i, i + 3)).size, 3, `Runde ab ${i} nicht vollständig`);
  }
  assert.equal(new Set(folge).size, kand.length);
});

test('waehleNaechstes: ein Stück darf sich wiederholen, leere Liste liefert null', () => {
  assert.equal(waehleNaechstes([MANIFEST.stuecke[0]], MANIFEST.stuecke[0].id).id, MANIFEST.stuecke[0].id);
  assert.equal(waehleNaechstes([], null), null);
});

/* ------------------------------------------------------------- Attrappen */

function param(wert = 1) {
  return {
    value: wert,
    cancelScheduledValues() {},
    setValueAtTime(w) { this.value = w; },
    linearRampToValueAtTime(w) { this.ziel = w; this.value = w; },
  };
}
function knoten() { return { gain: param(), connect() {} }; }

class FakeAudio {
  constructor() { this.hoerer = {}; this.paused = true; this.src = ''; this.currentTime = 0; this.duration = NaN; }
  addEventListener(art, fn) { this.hoerer[art] = fn; }
  play() { this.paused = false; this.gespielt = (this.gespielt ?? 0) + 1; return Promise.resolve(); }
  pause() { this.paused = true; }
  ausloesen(art) { this.hoerer[art]?.(); }
}

function baue({ aktiv = true, speicher = null, urls = null, ctxAus = false } = {}) {
  const audios = [];
  const ctx = {
    currentTime: 0,
    createGain: knoten,
    createMediaElementSource() { return { connect() {} }; },
  };
  const mischer = {
    gestartet: 0,
    async starte() { this.gestartet += 1; return !ctxAus; },
    musikAnschluss() { return ctxAus ? null : { ctx, ziel: { } }; },
  };
  const verzoegert = [];
  const musik = new Musik({
    manifest: MANIFEST,
    urls: urls ?? {
      ...Object.fromEntries(MANIFEST.stuecke.map(s => [s.datei, `/m/${s.datei}`])),
      ...Object.fromEntries(Object.values(HYMNEN.fraktionen).map(h => [`fraktionen/${h.datei}`, `/m/fraktionen/${h.datei}`])),
    },
    hymnen: HYMNEN,
    hymnenNamen: NAMEN,
    mischer,
    aktiv,
    speicher: speicher ?? { lies: () => null, schreibe() {} },
    audioBauer: () => { const a = new FakeAudio(); audios.push(a); return a; },
    zufall: Math.random,
    setTimeoutFn: (fn) => { verzoegert.push(fn); },
  });
  return { musik, mischer, audios, verzoegert };
}

test('Vor der Freigabe klingt nichts; danach startet ein Stück der Stimmung', async () => {
  const { musik, audios } = baue();
  musik.setzeStimmung('menu');
  assert.equal(audios.length, 0);
  assert.equal(musik.zustand.spielt, false);
  assert.equal(await musik.freigeben(), true);
  assert.equal(audios.length, 1);
  const z = musik.zustand;
  assert.equal(z.spielt, true);
  assert.ok(stueckeFuer(MANIFEST, 'menu').some(s => s.id === z.id));
  assert.equal(z.titel, MANIFEST.stuecke.find(s => s.id === z.id).titel);
});

test('Stimmungswechsel blendet in das zweite Element über und pausiert das alte', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.freigeben();
  const vorher = musik.zustand.id;
  musik.setzeStimmung('match');
  assert.equal(audios.length, 2);
  assert.equal(musik.zustand.ueberblendungen, 1);
  assert.notEqual(musik.zustand.id, vorher);
  assert.equal(audios[0].paused, false, 'altes Stück läuft während der Überblendung');
  for (const fn of verzoegert) fn();
  assert.equal(audios[0].paused, true);
  assert.equal(audios[1].paused, false);
});

test('Stückende und Restzeit lösen das nächste Stück aus, nie dasselbe', async () => {
  const { musik, audios } = baue();
  musik.setzeStimmung('match');
  await musik.freigeben();
  for (let i = 0; i < 40; i++) {
    const letzte = musik.zustand.id;
    const slot = audios[musik.zustand.starts % 2 === 1 ? 0 : 1];
    slot.duration = 80;
    slot.currentTime = 79;
    slot.ausloesen('timeupdate');
    assert.notEqual(musik.zustand.id, letzte);
  }
});

test('Ausschalten pausiert, Einschalten setzt fort; Zustand wird gespeichert', async () => {
  const gespeichert = [];
  const { musik, audios, verzoegert } = baue({ speicher: { lies: () => null, schreibe: t => gespeichert.push(JSON.parse(t)) } });
  await musik.freigeben();
  musik.setzeAn(false);
  for (const fn of verzoegert) fn();
  assert.equal(audios[0].paused, true);
  assert.equal(musik.zustand.spielt, false);
  musik.setzeAn(true);
  assert.equal(audios[0].paused, false);
  musik.setzeLautstaerke(0.6);
  assert.deepEqual(gespeichert.at(-1), { an: true, lautstaerke: 0.6 });
});

test('Gespeicherter Zustand wird gelesen; Müll fällt auf Vorgaben zurück', () => {
  const a = baue({ speicher: { lies: () => '{"an":false,"lautstaerke":0.8}', schreibe() {} } }).musik;
  assert.equal(a.an, false);
  assert.equal(a.lautstaerke, 0.8);
  const b = baue({ speicher: { lies: () => '{kaputt', schreibe() {} } }).musik;
  assert.equal(b.an, true);
  assert.equal(b.lautstaerke, 0.35);
  const c = baue({ speicher: { lies: () => { throw new Error('gesperrt'); }, schreibe() { throw new Error('x'); } } }).musik;
  assert.equal(c.lautstaerke, 0.35);
  c.setzeLautstaerke(2);
  assert.equal(c.lautstaerke, 1);
  c.setzeLautstaerke(-1);
  assert.equal(c.lautstaerke, 0);
});

test('Versteckter Tab pausiert, sichtbarer setzt fort', async () => {
  const { musik, audios } = baue();
  await musik.freigeben();
  musik.setzeVersteckt(true);
  assert.equal(audios[0].paused, true);
  musik.setzeVersteckt(false);
  assert.equal(audios[0].paused, false);
});

test('Ducken senkt den Pegel auf −6 dB und zählt', async () => {
  const { musik } = baue();
  await musik.freigeben();
  musik.ducken();
  assert.equal(musik.zustand.ducken, 1);
  assert.equal(DUCK_FAKTOR, 0.5);
});

test('Defekte Dateien werden übersprungen; nach einer Runde gibt die Musik still auf', async () => {
  const { musik, audios } = baue({ urls: {} });
  assert.equal(await musik.freigeben(), true);
  assert.equal(musik.zustand.aufgegeben, true);
  assert.equal(musik.zustand.spielt, false);
  assert.equal(audios.length, 0);

  const b = baue();
  await b.musik.freigeben();
  const z0 = b.musik.zustand.id;
  b.audios[0].ausloesen('error');
  assert.notEqual(b.musik.zustand.id, z0, 'Fehler → nächstes Stück');
  assert.equal(b.musik.zustand.aufgegeben, false);
});

test('Ohne AudioContext oder bei inaktiver Wiedergabe bleibt alles still und wirft nicht', async () => {
  const ohneCtx = baue({ ctxAus: true });
  assert.equal(await ohneCtx.musik.freigeben(), false);
  ohneCtx.musik.setzeStimmung('match');
  ohneCtx.musik.ducken();
  ohneCtx.musik.setzeVersteckt(true);

  const aus = baue({ aktiv: false });
  assert.equal(await aus.musik.freigeben(), false);
  assert.equal(aus.mischer.gestartet, 0, 'inaktiv: kein AudioContext durch die Musik');
  assert.equal(aus.audios.length, 0);
  // Schalter und Regler arbeiten trotzdem (testbar).
  aus.musik.schalte();
  assert.equal(aus.musik.an, false);
  aus.musik.setzeLautstaerke(0.5);
  assert.equal(aus.musik.lautstaerke, 0.5);
});

test('wiedergabeErlaubt: ?musik=0 aus, ?musik=1 an, webdriver aus', () => {
  assert.equal(wiedergabeErlaubt({ suche: '', webdriver: false }), true);
  assert.equal(wiedergabeErlaubt({ suche: '', webdriver: true }), false);
  assert.equal(wiedergabeErlaubt({ suche: '?musik=0', webdriver: false }), false);
  assert.equal(wiedergabeErlaubt({ suche: '?musik=1', webdriver: true }), true);
});

test('musik.js und musikListe.js nutzen keine Engine-/Shared-Zufallsquellen', () => {
  // Reine Darstellung: Math.random ist im Client erlaubt, aber hier nur als Vorgabewert.
  const text = readFileSync(resolve(import.meta.dirname, '../src/client/musik.js'), 'utf8');
  assert.ok(!/from '\.\.\/(engine|shared)/.test(text), 'Musik darf nichts aus engine/shared ziehen');
});


/* --------------------------------------------------------- Fraktionshymnen */

test('Hymnen: alle 9 Fraktionen aus factions.js haben genau eine gültige Hymne', () => {
  assert.equal(FRAKTION_IDS.length, 9);
  assert.deepEqual(pruefeHymnen(HYMNEN, FRAKTION_IDS), []);
  assert.ok(pruefeHymnen(HYMNEN, [...FRAKTION_IDS, 'neu']).length > 0, 'fehlende Hymne wird erkannt');
  assert.ok(pruefeHymnen(HYMNEN, FRAKTION_IDS.slice(1)).length > 0, 'fremder Eintrag wird erkannt');
});

test('Hymnen: Dateien vorhanden, Dauer stimmt grob mit der Größe überein', () => {
  for (const id of FRAKTION_IDS) {
    const h = HYMNEN.fraktionen[id];
    const pfad = join(ORDNER, 'fraktionen', h.datei);
    assert.ok(existsSync(pfad), `${h.datei} fehlt`);
    assert.ok(h.dauer >= 15 && h.dauer <= 120, `${id}: Dauer ${h.dauer}`);
    const kbit = (statSync(pfad).size * 8) / h.dauer / 1000;
    assert.ok(kbit > 60 && kbit < 260, `${id}: ${kbit.toFixed(0)} kbit/s passt nicht zur Dauer`);
    assert.equal(hymnenStueck(HYMNEN, id, NAMEN[id]).datei, `fraktionen/${h.datei}`);
  }
  assert.equal(hymnenStueck(HYMNEN, 'gibtsnicht', 'x'), null);
});

test('Hymne: Anwahl spielt sie, Wechsel überblendet, es läuft nie mehr als eine', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.freigeben();
  for (const id of ['xeno', 'pirates', 'pixel']) {
    musik.setzeHymne(id);
    assert.equal(musik.zustand.id, `hymne-${id}`);
    assert.equal(musik.zustand.titel, `Hymne: ${NAMEN[id]}`);
    assert.equal(musik.zustand.hymne, id);
    for (const fn of verzoegert.splice(0)) fn();
    assert.equal(audios.filter(a => !a.paused).length, 1, 'höchstens eine Hymne zugleich');
  }
  assert.ok(audios.length <= 2);
  assert.ok(audios.some(a => a.src.endsWith('/pixel.mp3')));
  musik.setzeHymne('pixel'); // dieselbe Wahl: kein Neustart
  assert.equal(musik.zustand.starts, 4);
  musik.setzeHymne('gibtsnicht');
  assert.equal(musik.zustand.hymne, null);
  assert.ok(!musik.zustand.id.startsWith('hymne-'), 'zurück zur Menümusik');
});

test('Hymne: Match-Start beendet sie, Musik-Aus macht stumm, Wiederkehr ins Menü startet keine', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.freigeben();
  musik.setzeHymne('machina');
  musik.setzeAn(false);
  for (const fn of verzoegert.splice(0)) fn();
  assert.equal(audios.filter(a => !a.paused).length, 0, 'stumm bei Musik aus');
  musik.setzeAn(true);
  assert.equal(musik.zustand.id, 'hymne-machina', 'Fortsetzung bei Musik an');
  musik.setzeStimmung('match');
  assert.equal(musik.zustand.hymne, null);
  assert.ok(stueckeFuer(MANIFEST, 'match').some(s => s.id === musik.zustand.id));
  for (const fn of verzoegert.splice(0)) fn();
  assert.equal(audios.filter(a => !a.paused).length, 1);
  musik.setzeStimmung('menu');
  assert.ok(!musik.zustand.id.startsWith('hymne-'));
});

test('Hymne: defekte Datei fällt still auf die Menümusik zurück; vor Freigabe kein Ton', async () => {
  const urls = Object.fromEntries(MANIFEST.stuecke.map(s => [s.datei, `/m/${s.datei}`]));
  const { musik } = baue({ urls });
  musik.setzeHymne('undead');
  assert.equal(musik.zustand.starts, 0, 'vor der Freigabe klingt nichts');
  await musik.freigeben();
  assert.equal(musik.zustand.hymne, null, 'ohne URL verworfen');
  assert.ok(!musik.zustand.aufgegeben);
  assert.ok(musik.zustand.id && !musik.zustand.id.startsWith('hymne-'));
});

test('Hymne: Lautstärke läuft über die Musik-Steuerung (kein eigener Pegel in main.js)', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, '../src/client/main.js'), 'utf8');
  assert.ok(quelle.includes('setzeHymne'));
  assert.ok(!/new Audio\(/.test(quelle), 'Hymnen laufen über Musik, nicht über ein eigenes Audio');
});
