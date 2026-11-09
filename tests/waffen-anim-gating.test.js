/**
 * Sperre für die 26 Waffen-Zusatzanimationen (W05/W06/W11/W17).
 *
 * Der Test hält drei Dinge fest, die ein grüner Datei- oder Schema-Test sonst
 * nicht sieht:
 *
 * 1. Kein Produktpfad verweist auf `weapon-sprites/anim` — auch nicht über
 *    einen Glob, ein Manifest oder einen dynamischen Import. Die Blätter sind
 *    Material, bis Rolle und Identität abgenommen sind.
 * 2. Jedes Blatt trägt Rolle, Motiv, Befund und Schwere; keine ist freigegeben,
 *    und Manifestfreigabe und `ANIM_FREIGABE` laufen nicht auseinander.
 * 3. pa_112/pa_114 sind weiterhin bytegleich und als Dublette markiert; wird
 *    die Datei getrennt, muss die Markierung mitwandern (W06).
 *
 * Dazu kommt der Datenstand für die eingebrannten Effekte (W17), damit die
 * spätere Trennung von Körper und Effekt nicht auf Zuruf passiert.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  ANIM_FREIGABE,
  ANIM_ROLLEN_NAMEN,
  ANIM_SCHWEREN,
  ANIM_STATUS,
  animBlattFreigegeben,
  animFreigabePruefen,
  erzeugeAnimLader,
  holeZusatzAnim,
  waffenAnimZustand,
} from '../src/client/waffenAnim.js';

const WURZEL = resolve(import.meta.dirname, '..');
const ANIM = join(WURZEL, 'src/client/assets/weapon-sprites/anim');
const SPRITES = join(WURZEL, 'src/client/assets/weapon-sprites');

/** Manifest der Zusatzblätter (Version 2 mit Rollen und Sperre). */
const manifest = JSON.parse(readFileSync(join(ANIM, 'manifest.json'), 'utf8'));
/** Datenstand der eingebrannten Effekte. */
const effekte = JSON.parse(readFileSync(join(SPRITES, 'effekt-trennung.json'), 'utf8'));

/** Alle Dateien unter `src` plus die Einstiegsseite, relativ zur Wurzel. */
function produktdateien() {
  const dateien = [];
  for (const eintrag of readdirSync(join(WURZEL, 'src'), { recursive: true, withFileTypes: true })) {
    if (!eintrag.isFile()) continue;
    dateien.push(join(eintrag.parentPath, eintrag.name));
  }
  for (const name of ['index.html', 'vite.config.mjs']) {
    const p = join(WURZEL, name);
    if (existsSync(p)) dateien.push(p);
  }
  return dateien;
}

function sha256(datei) {
  return createHash('sha256').update(readFileSync(datei)).digest('hex');
}

/** Entfernt Kommentare, damit ein Pfad in einer Dokumentation nicht als Lader gilt. */
function ohneKommentare(text, datei) {
  if (/\.html$/.test(datei)) return text.replace(/<!--[\s\S]*?-->/g, '');
  const ohneBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return ohneBlock
    .split('\n')
    .filter(zeile => !/^\s*(\/\/|\*)/.test(zeile))
    .join('\n');
}

test('kein Produktpfad verweist auf die Zusatzanimationen', () => {
  const treffer = [];
  for (const datei of produktdateien()) {
    if (datei.startsWith(ANIM)) continue; // die Blätter selbst
    if (!/\.(js|mjs|cjs|json|html|css)$/.test(datei)) continue;
    const text = ohneKommentare(readFileSync(datei, 'utf8'), datei);
    for (const muster of ['weapon-sprites/anim', "assets/weapon-sprites/anim", 'anim/manifest']) {
      if (text.includes(muster)) treffer.push(`${relative(WURZEL, datei)}: ${muster}`);
    }
    // Ein Glob direkt auf die Blätter wäre derselbe Fehler in anderer Schreibweise.
    if (/weapon-sprites\/\*\*?\/?\*?\.webp/.test(text) || /anim\/\*\.webp/.test(text)) {
      treffer.push(`${relative(WURZEL, datei)}: WebP-Glob auf anim`);
    }
  }
  assert.deepEqual(treffer, [], `Produktpfad lädt Zusatzanimationen: ${treffer.join('; ')}`);
});

test('jedes Blatt ist gesperrt, hat Rolle, Motiv und Befund', () => {
  assert.deepEqual(animFreigabePruefen(manifest), []);
  const ids = Object.keys(manifest.waffen);
  assert.equal(ids.length, 26, 'erwartet 26 Zusatz-Sheets');
  assert.equal(manifest.status, 'gesperrt');
  assert.equal(manifest.freigabe.produktpfad, false);
  for (const id of ids) {
    const e = manifest.waffen[id];
    assert.equal(e.freigabe, false, `${id} darf nicht freigegeben sein`);
    assert.equal(e.abnahme, 'offen', `${id} ist ohne Abnahme`);
    assert.ok(ANIM_ROLLEN_NAMEN.includes(e.rolle), `${id} ohne gültige Rolle`);
    assert.ok(ANIM_SCHWEREN.includes(e.schwere), `${id} ohne gültigen Schweregrad`);
    assert.ok(e.motiv.length > 3, `${id} ohne Motivbeschreibung`);
    assert.ok(e.befund.length > 3, `${id} ohne Befund`);
    assert.equal(e.zelle, 256, `${id} mit unerwarteter Zellgröße`);
    assert.equal(e.frames, 8, `${id} mit unerwarteter Framezahl`);
  }
});

test('Rollen sind gesetzt und decken alle Blätter ab', () => {
  const genutzt = new Set(Object.values(manifest.waffen).map(w => w.rolle));
  for (const rolle of genutzt) assert.ok(ANIM_ROLLEN_NAMEN.includes(rolle), `unbekannte Rolle ${rolle}`);
  // Rollen mit mehreren Blättern müssen auch mehrfach vorkommen; keine Rolle darf
  // stillschweigend zu einer Sammelrolle für alles werden.
  assert.ok(genutzt.size >= 5, `nur ${genutzt.size} Rollen vergeben`);
  for (const [name, def] of Object.entries(manifest.rollen)) {
    assert.ok(ANIM_ROLLEN_NAMEN.includes(name), `Rolle ${name} fehlt in waffenAnim.js`);
    assert.ok(def.titel && def.beschreibung, `Rolle ${name} ohne Titel/Beschreibung`);
    assert.ok(Array.isArray(def.anker) && def.anker.length > 0, `Rolle ${name} ohne Anker`);
  }
});

test('Abnahme und Gate laufen nicht auseinander (fail closed)', () => {
  assert.equal(ANIM_STATUS, 'gesperrt');
  assert.equal(ANIM_FREIGABE.size, 0, 'kein Blatt darf vor der Abnahme freigegeben sein');

  // Ein Manifesteintrag allein genügt nicht: ohne Gate-Eintrag bleibt er zu.
  const scheinbar = { ...manifest.waffen.pa_038, freigabe: true, abnahme: 'abgenommen' };
  assert.equal(animBlattFreigegeben(scheinbar), false);
  // Und ein Gate-Eintrag ohne Manifestfreigabe ebenso wenig.
  assert.equal(animBlattFreigegeben({ ...manifest.waffen.pa_038, freigabe: false }, new Set(['pa_038'])), false);

  // Ein freigegebenes Blatt ohne Abnahme bzw. ohne Gate-Eintrag ist ein Fehler.
  const kaputt = structuredClone(manifest);
  kaputt.waffen.pa_038.freigabe = true;
  const fehler = animFreigabePruefen(kaputt);
  assert.ok(fehler.some(f => f.includes('pa_038')), `Freigabe ohne Abnahme nicht erkannt: ${fehler}`);

  const halb = structuredClone(manifest);
  halb.waffen.pa_038.freigabe = true;
  halb.waffen.pa_038.abnahme = 'abgenommen';
  assert.ok(animFreigabePruefen(halb).some(f => f.includes('ANIM_FREIGABE')), 'Gate-Eintrag nicht erzwungen');
});

test('der Lader ruft ohne Freigabe nicht einmal das Manifest', async () => {
  let ladungen = 0;
  const lader = erzeugeAnimLader({
    ladeManifest: () => { ladungen += 1; throw new Error('darf nicht laden'); },
  });
  for (const id of Object.keys(manifest.waffen)) assert.equal(lader.hole(id), null);
  assert.equal(lader.hole('pa_999'), null);
  assert.equal(ladungen, 0, 'Manifest wurde trotz Sperre angefordert');
  const z = lader.zustand();
  assert.equal(z.status, 'gesperrt');
  assert.equal(z.manifestLadungen, 0);
  assert.equal(z.gesperrt, 27);

  // Der Produkt-Einstiegspunkt bleibt gesperrt.
  for (const id of Object.keys(manifest.waffen)) assert.equal(holeZusatzAnim(id), null);
  assert.equal(waffenAnimZustand().freigegeben.length, 0);
});

test('Blätter sind vorhanden, lesbare WebP-Behälter und passen zum Raster', () => {
  for (const id of Object.keys(manifest.waffen)) {
    const datei = join(ANIM, manifest.waffen[id].datei);
    assert.ok(existsSync(datei), `${id}: Datei fehlt`);
    const kopf = readFileSync(datei).subarray(0, 12);
    assert.equal(kopf.subarray(0, 4).toString('ascii'), 'RIFF', `${id}: kein RIFF-Behälter`);
    assert.equal(kopf.subarray(8, 12).toString('ascii'), 'WEBP', `${id}: kein WebP`);
    assert.ok(statSync(datei).size > 1024, `${id}: Datei zu klein für 8 Frames`);
  }
});

test('W06: pa_112 und pa_114 sind bytegleich und als Dublette markiert', () => {
  const a = sha256(join(ANIM, 'pa_112.webp'));
  const b = sha256(join(ANIM, 'pa_114.webp'));
  const e114 = manifest.waffen.pa_114;
  const e112 = manifest.waffen.pa_112;
  if (a === b) {
    assert.equal(e114.dubletteVon, 'pa_112', 'bytegleiche Datei ohne Dublettenmarkierung');
    assert.equal(e112.dubletteVon, undefined, 'Original darf nicht als Dublette gelten');
  } else {
    // Getrennte Vorlagen: die Markierung muss verschwinden, sonst zeigt sie ins Leere.
    assert.equal(e114.dubletteVon, undefined, 'getrennte Datei trägt noch Dublettenmarkierung');
  }
  // Unabhängig vom Hash bleibt die Zuordnung gesperrt: ein Schirmblatt ist noch nicht entstanden.
  assert.equal(e114.freigabe, false);
  assert.equal(e112.freigabe, false);
});

test('W17: eingebrannte Effekte sind vollständig und ungetrennt dokumentiert', () => {
  const hand = effekte.handbilder;
  assert.ok(Array.isArray(hand) && hand.length >= 15, `nur ${hand.length} Handbilder dokumentiert`);
  const arten = new Set(hand.map(e => e.art));
  for (const art of ['muendungsblitz', 'flamme', 'feuerstrahl', 'rauchfahne', 'glut']) {
    assert.ok(arten.has(art), `Effektart ${art} fehlt im Datenstand`);
  }
  for (const e of hand) {
    assert.match(e.id, /^pa_\d{3}$/);
    assert.ok(e.waffe && e.beobachtung && e.detail, `${e.id}: Beobachtung unvollständig`);
    assert.equal(e.trennung, 'offen', `${e.id}: Trennung behauptet, ohne getrennte Ebene`);
  }
  assert.ok(effekte.animationsblaetter.length >= 5, 'Animationsblätter mit Effekt fehlen');
  for (const e of effekte.animationsblaetter) {
    assert.ok(manifest.waffen[e.id], `${e.id}: Animationsblatt im Effektstand, aber nicht im Manifest`);
    assert.equal(e.trennung, 'offen');
  }
  // Kein Effektträger darf gleichzeitig als abgenommenes Animationsblatt gelten.
  for (const e of effekte.animationsblaetter) assert.equal(manifest.waffen[e.id].freigabe, false);
  assert.equal(effekte.auftrag, 'W17');
});
