#!/usr/bin/env node
/**
 * Klärt, was eine Kamera braucht — und was sie kostet.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Auftrag lautet: **größere Welten.** Heute ist die Karte genau so groß wie
 * das Fenster (`render()` zeichnet 1:1, es gibt keine Kamera). Auf einem 4K-TV
 * sieht man deshalb die ganze Karte — das ist das Gegenteil von „größer".
 *
 * Bevor eine Kamera gebaut wird, muss klar sein, **welche Teile der Anzeige in
 * Weltkoordinaten und welche in Bildschirmkoordinaten laufen.** Wer das
 * verwechselt, baut eine Kamera, die den Himmel mitschiebt.
 *
 * ## Was dieses Werkzeug tut
 *
 * Es liest die Zeichenfunktionen des Renderers und ordnet jede ein — nach ihrer
 * Aufgabe, nicht nach ihrer Position. Die Zuordnung steht im Code als
 * Kommentar; dieses Werkzeug prüft sie gegen die Quelle.
 *
 * ## Aufruf
 *
 *     node scripts/check-camera.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'renderer.js'), 'utf8');

/**
 * Die Einordnung. „Welt" heißt: Die Funktion rechnet in Kartenkoordinaten und
 * muss mit der Kamera verschoben werden. „Bildschirm" heißt: Sie füllt das
 * Fenster und darf sich NICHT bewegen.
 */
const EINORDNUNG = {
  '#drawSky': 'bildschirm',
  '#drawWater': 'welt',
  '#drawWindArrow': 'bildschirm',
  '#drawBlastPreview': 'welt',
  '#drawPoopPiles': 'welt',
  '#drawCrates': 'welt',
  '#drawTurrets': 'welt',
  '#drawMaelstrom': 'bildschirm',
  '#drawAimPreview': 'welt',
  '#drawPrediction': 'welt',
  '#drawEntities': 'welt',
  '#drawGuenther': 'welt',
  '#drawProjectiles': 'welt',
  '#drawEffects': 'welt',
  '#drawHeimdall': 'welt',
  '#drawParticles': 'welt',
  /* Rechnet nur Zustände fort — zeichnet nichts, gehört in keine Schicht. */
  '#updateEffects': 'keins',
};

/** Alle Zeichenfunktionen, die `render()` aufruft. */
function aufgerufeneFunktionen() {
  const renderRumpf = /render\(state,[\s\S]*?\n  \}/.exec(quelle);
  if (!renderRumpf) throw new Error('render() nicht gefunden');

  const namen = [...renderRumpf[0].matchAll(/this\.(#[a-zA-Z]+)\(/g)].map(m => m[1]);
  // Unabhängig davon, wie oft sie gerufen werden (drawAmbient zweimal).
  return [...new Set(namen)];
}

const gerufen = aufgerufeneFunktionen();
const welt = gerufen.filter(n => EINORDNUNG[n] === 'welt');
const bildschirm = gerufen.filter(n => EINORDNUNG[n] === 'bildschirm');
const ohneZeichnung = gerufen.filter(n => EINORDNUNG[n] === 'keins');
const unbekannt = gerufen.filter(n => !EINORDNUNG[n]);

console.log('Kamera-Bedarf: Was bewegt sich mit, was bleibt?');
console.log('');
console.log(`Zeichenfunktionen in render(): ${gerufen.length}`);
console.log(`  Welt        ${String(welt.length).padStart(2)}   (bewegen sich mit der Kamera)`);
console.log(`  Bildschirm  ${String(bildschirm.length).padStart(2)}   (füllen das Fenster)`);
console.log(`  ohne Zeichnung ${ohneZeichnung.length}   (rechnen nur)`);
console.log('');

if (unbekannt.length > 0) {
  console.log('NICHT EINGEORDNET:');
  for (const n of unbekannt) console.log(`  ${n}`);
  console.log('');
  console.log('Jede Zeichenfunktion muss eingeordnet sein — sonst schiebt die Kamera');
  console.log('sie mit, oder sie bleibt stehen, obwohl sie soll.');
  process.exitCode = 1;
} else {
  console.log('Alle Zeichenfunktionen sind eingeordnet.');
}

console.log('');
console.log('WELT (mit der Kamera verschieben):');
for (const n of welt) console.log(`  ${n}`);

console.log('');
console.log('BILDSCHIRM (bleibt am Platz):');
for (const n of bildschirm) console.log(`  ${n}`);

console.log('');
console.log('WAS EINE KAMERA KOSTET');
console.log('');

/*
 * Die Kostenfrage: Ein Canvas kann mit `setTransform` verschoben werden — dann
 * bleiben alle Zeichenaufrufe unverändert. Gemessen wird, wie viele Aufrufe
 * das betrifft, und ob die Einordnung dagegen spricht.
 */
const zeichenaufrufe = (quelle.match(/this\.ctx\./g) ?? []).length;

console.log(`  Zeichenaufrufe im Renderer: ${zeichenaufrufe}`);
console.log('');
console.log('  Ein Umbau, der jeden Aufruf einzeln verschiebt, wäre invasiv und');
console.log('  fehleranfällig. Der gangbare Weg ist eine TRANSFORMATION am Canvas:');
console.log('');
console.log('      ctx.save();');
console.log('      ctx.setTransform(zoom, 0, 0, zoom, -kameraX * zoom, -kameraY * zoom);');
console.log('      ... alle Weltfunktionen ...');
console.log('      ctx.restore();');
console.log('      ... die Bildschirmfunktionen ...');
console.log('');
console.log('  Damit bleiben die Zeichenaufrufe unverändert — es kommt eine Klammer');
console.log('  um sie herum. Das ist der Grund, warum die Einordnung oben zählt:');
console.log(`  ${welt.length} Funktionen gehören in die Klammer, ${bildschirm.length} nicht.`);

console.log('');
console.log('WAS DIE KARTENGRÖSSE ERLAUBT');
console.log('');

/*
 * Die Grenze des Drahtformats: Int16 mit COORD_SCALE.
 */
const protokoll = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'protocol.js'), 'utf8');
const scale = Number(/COORD_SCALE = (\d+)/.exec(protokoll)[1]);
const maxKoordinate = 32767 / scale;

console.log(`  Das Drahtformat überträgt Koordinaten als Int16 mit Faktor ${scale}:`);
console.log(`  Die größte darstellbare Koordinate ist ${Math.round(maxKoordinate)} px.`);
console.log('');
for (const [name, breite] of [
  ['heute', 1280], ['Full HD', 1920], ['4K', 3840], ['8K', 7680],
]) {
  const anteil = (breite / maxKoordinate) * 100;
  const urteil = anteil > 95 ? 'AM LIMIT' : anteil > 70 ? 'knapp' : 'möglich';
  console.log(`    ${name.padEnd(9)} ${String(breite).padStart(5)} px   ${anteil.toFixed(0).padStart(3)} % der Grenze   ${urteil}`);
}

console.log('');
console.log('  Eine Karte bis 8192 px ist ohne Formatänderung möglich. Das entspricht');
console.log('  8K-Breite — mehr, als ein Fernseher zeigt. Die Kamera ist damit die');
console.log('  einzige echte Sperre für große Welten.');
