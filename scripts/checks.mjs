#!/usr/bin/env node
/**
 * ALLE Prüfwerkzeuge in einem Lauf — der Wächter-Wächter.
 *
 * ## Warum dieses Skript
 *
 * AUDIT-BEFUND (2026-09-20): Das Projekt hat **19 Prüfwerkzeuge** mit eigenem
 * Exit-Code — `check:fuses` (Zünder-Absicht), `check:effects` (Wirkfeld ohne
 * Leser), `matrix:check` (veraltete Übersicht), `check:achievements`
 * (unerreichbare Schwellen) und so weiter. In der CI lief **keines** davon: Die
 * Pipeline machte `lint`, `npm test` und den E2E-Lauf. Ein Werkzeug, das nur
 * läuft, wenn jemand daran denkt, ist kein Gate — es ist eine Empfehlung.
 *
 * Genau daran ist schon zweimal etwas durchgerutscht: Die Übersicht
 * (`matrix:check`) und die Wirkfelder (`check:effects`) waren da, aber ihre
 * Verstöße hätten die CI nie erreicht.
 *
 * Dieses Skript fährt alle Gates hintereinander, zeigt je Werkzeug eine Zeile
 * mit Dauer und Ergebnis und endet mit Exit-Code 1, sobald EINES fehlschlägt.
 * Aufruf: `npm run checks` (lokal) und in `.github/workflows/ci.yml` (CI).
 *
 * Laufzeit aller Gates: ~30 s — billig genug, um bei JEDEM Push zu laufen.
 */
import { spawnSync } from 'node:child_process';

/**
 * Die Gates — mit dem, was sie schützen.
 *
 * `schnell` trennt die Läufe unter zwei Sekunden von den Messungen, die länger
 * dauern. Beide laufen, aber die Aufteilung macht die Ausgabe lesbar und
 * erlaubt später ein `--schnell` für enge Zeitfenster.
 */
const GATES = [
  { skript: 'check:docs', schuetzt: 'Zahlen in der Doku' },
  { skript: 'check:effects', schuetzt: 'Wirkfeld ohne Motorleser' },
  { skript: 'check:fuses', schuetzt: 'Zünder-Absicht (timed/impact)' },
  { skript: 'matrix:check', schuetzt: 'veraltete Wirkungs-Übersicht' },
  { skript: 'check:targeting', schuetzt: 'Zielarten der Waffen' },
  { skript: 'check:range', schuetzt: 'Reichweiten-Konsistenz' },
  { skript: 'check:terrain', schuetzt: 'Terrain-Erzeugung' },
  { skript: 'check:map', schuetzt: 'Kartenmaße' },
  { skript: 'check:camera', schuetzt: 'Kameraführung' },
  { skript: 'check:sizes', schuetzt: 'Figuren- und Zuggrößen' },
  { skript: 'check:reichweite', schuetzt: 'Erreichbarkeit der Figuren' },
  { skript: 'check:simultaneous', schuetzt: 'gleichzeitige Züge (nicht gebaut)' },
  { skript: 'balance:classes', schuetzt: 'Klassen-Balance' },
  { skript: 'check:biome', schuetzt: 'Kulisse passt zum Kartencharakter' },
  { skript: 'check:crates', schuetzt: 'Loot-Kisten' },
  { skript: 'check:achievements', schuetzt: 'erreichbare Erfolgs-Schwellen' },
  { skript: 'check:autonom', schuetzt: 'Autonomie der Figuren' },
  { skript: 'check:maelstrom', schuetzt: 'Mahlstrom-Abbruch' },
  { skript: 'check:time', schuetzt: 'Matchdauer' },
  { skript: 'check:erreichbarkeit', schuetzt: '30 Partien ohne unerreichbare Figur' },
];

const nurSchnell = process.argv.includes('--schnell');
const LANGE = new Set(['check:erreichbarkeit', 'check:time', 'check:maelstrom', 'check:autonom']);

const zeilen = [];
let fehlgeschlagen = 0;
let gesamtMs = 0;

for (const gate of GATES) {
  if (nurSchnell && LANGE.has(gate.skript)) continue;
  const start = Date.now();
  const lauf = spawnSync('npm', ['run', '--silent', gate.skript], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  });
  const dauer = Date.now() - start;
  gesamtMs += dauer;
  const exit = lauf.status ?? 1;
  if (exit !== 0) fehlgeschlagen += 1;
  zeilen.push({
    skript: gate.skript,
    schuetzt: gate.schuetzt,
    dauer,
    exit,
    ausgabe: `${lauf.stdout ?? ''}${lauf.stderr ?? ''}`.trim(),
  });
  const marke = exit === 0 ? 'ok  ' : 'FEHL';
  console.log(`${marke} ${gate.skript.padEnd(22)} ${String(dauer).padStart(6)} ms  ${gate.schuetzt}`);
}

console.log(`\n${zeilen.length} Gates in ${(gesamtMs / 1000).toFixed(1)} s`
  + ` | fehlgeschlagen: ${fehlgeschlagen}`);

if (fehlgeschlagen > 0) {
  console.error('\nAusgabe der fehlgeschlagenen Gates:');
  for (const zeile of zeilen.filter(z => z.exit !== 0)) {
    console.error(`\n--- ${zeile.skript} (exit ${zeile.exit}) ---`);
    console.error(zeile.ausgabe || '(keine Ausgabe)');
  }
  console.error('\nDie CI ist damit keine Freigabe.');
  process.exitCode = 1;
}
