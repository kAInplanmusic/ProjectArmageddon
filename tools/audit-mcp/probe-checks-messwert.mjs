#!/usr/bin/env node
/**
 * Gegenprobe für den Messwert des `checks`-Gates (`lib/gates.mjs`).
 *
 * Aufruf:  node tools/audit-mcp/probe-checks-messwert.mjs
 * Exit-Code 0 = alle Erwartungen erfüllt, 1 = mindestens eine verletzt.
 *
 * ## Warum diese Datei existiert (belegter Fehler)
 *
 * Die Kennzahlen-Regex des `checks`-Gates suchte `OK|FEHLGESCHLAGEN`.
 * `scripts/checks.mjs:81` druckt aber `ok  ` (klein) bzw. `FEHL` (kurz). Ergebnis:
 * 0 Treffer, `kennzahlen = {"zeilen": 0}` — ein Gate, das 21 Prüfwerkzeuge
 * fährt, meldete sich wie ein Gate ohne Messung. Gemessen mit einem echten Lauf
 * am 2026-09-27:
 *
 *   vorher  (alte Regex):  kennzahlen = { "zeilen": 0 }             ← leer
 *   nachher (neue Regex):  kennzahlen = { "zeilen": 21, "bestanden": 20,
 *                                        "fehlgeschlagen": 1,
 *                                        "fehlgeschlageneWerkzeuge": ["check:docs"],
 *                                        "gatesLautSumme": 21, "dauerSekunden": 56.6,
 *                                        "fehlgeschlagenLautSumme": 1 }
 *
 * Diese Probe prüft die Funktion, die im Betrieb läuft (`bewerte`, exportiert),
 * und zwar in BEIDE Richtungen: echte Ausgabe → Zahlen; unbekanntes Format →
 * lauter Hinweis statt stiller Null.
 */
import { bewerte } from './lib/gates.mjs';

let fehler = 0;
const pruefe = (titel, erwartet, gemessen, ok) => {
  console.log(`\n${ok ? 'OK  ' : 'FEHL'} ${titel}`);
  console.log(`     ERWARTET: ${erwartet}`);
  console.log(`     GEMESSEN: ${gemessen}`);
  if (!ok) fehler += 1;
};

/* Die echte Ausgabe von `npm run checks` — Zeichen für Zeichen die Form aus
 * `scripts/checks.mjs:82` (`${marke} ${skript.padEnd(22)} ${dauer} ms ${schuetzt}`)
 * und der Summenzeile aus Zeile 85. */
const ECHTE_AUSGABE = [
  'ok   check:docs                383 ms  Zahlen in der Doku',
  'ok   check:effects             502 ms  Wirkfeld ohne Motorleser',
  'FEHL check:range              2129 ms  Reichweiten-Konsistenz',
  '',
  '3 Gates in 3.0 s | fehlgeschlagen: 1',
  '',
  'Ausgabe der fehlgeschlagenen Gates:',
  '',
  '--- check:range (exit 1) ---',
  'FEHL  Reichweite: 3 Waffen außerhalb der Toleranz',
].join('\n');

const echt = bewerte('checks', { out: ECHTE_AUSGABE, code: 1, ms: 3014, abgebrochen: false, fehler: null });
pruefe(
  '1) Echte Ausgabe → die Zahlen erscheinen (vorher: zeilen = 0)',
  'zeilen = 3 · bestanden = 2 · fehlgeschlagen = 1 · fehlgeschlageneWerkzeuge = [check:range]',
  `zeilen = ${echt.kennzahlen.zeilen} · bestanden = ${echt.kennzahlen.bestanden} · fehlgeschlagen = ${echt.kennzahlen.fehlgeschlagen} · Werkzeuge = ${JSON.stringify(echt.kennzahlen.fehlgeschlageneWerkzeuge)}`,
  echt.kennzahlen.zeilen === 3 && echt.kennzahlen.bestanden === 2
    && echt.kennzahlen.fehlgeschlagen === 1
    && JSON.stringify(echt.kennzahlen.fehlgeschlageneWerkzeuge) === '["check:range"]',
);

pruefe(
  '2) Die Summenzeile wird als unabhängige Gegenprobe gelesen',
  'gatesLautSumme = 3 · fehlgeschlagenLautSumme = 1 · dauerSekunden = 3',
  `gatesLautSumme = ${echt.kennzahlen.gatesLautSumme} · fehlgeschlagenLautSumme = ${echt.kennzahlen.fehlgeschlagenLautSumme} · dauerSekunden = ${echt.kennzahlen.dauerSekunden}`,
  echt.kennzahlen.gatesLautSumme === 3 && echt.kennzahlen.fehlgeschlagenLautSumme === 1
    && echt.kennzahlen.dauerSekunden === 3,
);

const alleGruen = bewerte('checks', {
  out: ['ok   check:docs                383 ms  Zahlen in der Doku', '', '1 Gates in 0.4 s | fehlgeschlagen: 0'].join('\n'),
  code: 0, ms: 400, abgebrochen: false, fehler: null,
});
pruefe(
  '3) Alles grün → bestanden = 1, fehlgeschlagen = 0 (die Null ist JETZT gemessen, nicht geraten)',
  'zeilen = 1 · bestanden = 1 · fehlgeschlagen = 0 · kein Hinweis',
  `zeilen = ${alleGruen.kennzahlen.zeilen} · bestanden = ${alleGruen.kennzahlen.bestanden} · fehlgeschlagen = ${alleGruen.kennzahlen.fehlgeschlagen} · hinweis = ${alleGruen.kennzahlen.hinweis ?? '–'}`,
  alleGruen.kennzahlen.zeilen === 1 && alleGruen.kennzahlen.bestanden === 1
    && alleGruen.kennzahlen.fehlgeschlagen === 0 && alleGruen.kennzahlen.hinweis === undefined,
);

/* Die alte, falsche Erwartung — als Gegenprobe, dass die Probe nicht einfach
 * immer „Zahlen da" sagt: genau dieser Text ergab früher 0 Treffer. */
const alteForm = bewerte('checks', {
  out: ['OK   check:docs    383 ms', 'FEHLGESCHLAGEN check:docs', '', '20 Gates in 30.0 s'].join('\n'),
  code: 0, ms: 30000, abgebrochen: false, fehler: null,
});
pruefe(
  '4) Fremdes Format (die alte Annahme) → lauter Hinweis statt stiller Null (fail-safe)',
  'zeilen = 0, aber kennzahlen.hinweis nennt die unlesbare Ausgabe (nicht „0 Fehler")',
  `zeilen = ${alteForm.kennzahlen.zeilen} · hinweis = ${alteForm.kennzahlen.hinweis ? `„${alteForm.kennzahlen.hinweis.slice(0, 60)}…"` : 'FEHLT'}`,
  alteForm.kennzahlen.zeilen === 0 && typeof alteForm.kennzahlen.hinweis === 'string'
    && /NICHT lesbar/.test(alteForm.kennzahlen.hinweis),
);

const leer = bewerte('checks', { out: '', code: 1, ms: 10, abgebrochen: false, fehler: 'spawn npm ENOENT' });
pruefe(
  '5) Gate ohne Ausgabe (spawn-Fehler) → Hinweis + fehler-Feld, keine erfundenen Zahlen',
  'zeilen = 0 · hinweis vorhanden · fehler nennt ENOENT',
  `zeilen = ${leer.kennzahlen.zeilen} · hinweis = ${Boolean(leer.kennzahlen.hinweis)} · fehler = ${leer.fehler}`,
  leer.kennzahlen.zeilen === 0 && typeof leer.kennzahlen.hinweis === 'string'
    && /ENOENT/.test(leer.fehler ?? ''),
);

/* Die anderen Gates dürfen durch die Reparatur nicht kaputtgegangen sein. */
const smoke = bewerte('smoke:fast', {
  out: 'Rauchtest: 4 von 4 Schritten OK in 26,8 s', code: 0, ms: 26800, abgebrochen: false, fehler: null,
});
pruefe(
  '6) Unberührt: smoke:fast liest seine eigene Zeile weiter',
  'schritteOk = 4 · schritteGesamt = 4 · dauerSekunden = 26.8 · keine checks-Kennzahlen',
  `schritteOk = ${smoke.kennzahlen.schritteOk} · schritteGesamt = ${smoke.kennzahlen.schritteGesamt} · dauerSekunden = ${smoke.kennzahlen.dauerSekunden} · zeilen = ${smoke.kennzahlen.zeilen ?? '–'}`,
  smoke.kennzahlen.schritteOk === 4 && smoke.kennzahlen.schritteGesamt === 4
    && smoke.kennzahlen.dauerSekunden === 26.8 && smoke.kennzahlen.zeilen === undefined,
);

console.log(`\n${fehler === 0 ? 'Alle Erwartungen erfüllt.' : `${fehler} Erwartung(en) verletzt.`}`);
process.exit(fehler === 0 ? 0 : 1);
