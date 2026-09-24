/**
 * Gate-Batterie.
 *
 * Ein Gate ist nur ein Gate, wenn es einen Exit-Code hat und IMMER läuft.
 * Genau daran ist im Projekt schon zweimal etwas durchgerutscht (19 Prüfwerk-
 * zeuge, von denen in der CI keines lief). Dieses Modul fährt die Batterie
 * vollständig und liefert je Gate Ergebnis + Dauer + Kennzahlen.
 */
import { npmRun } from './repo.mjs';

/**
 * Die Gates in der Reihenfolge, in der sie laufen sollen.
 *
 * `kosten` ist die Erfahrung aus dem Projekt: `test:e2e` braucht ~10 min
 * (27 Dateien, jede startet Vite + Browser), `test` ~1 min, alles andere
 * Sekunden. Wer schnell prüfen will, nimmt `schnell`.
 */
export const GATES = {
  lint: { skript: 'lint', schuetzt: 'Statische Regeln (unbenutzte Variablen, doppelte Member)', kosten: 'schnell' },
  validate: { skript: 'validate', schuetzt: 'Alle Module laden ohne Fehler', kosten: 'schnell' },
  checks: { skript: 'checks', schuetzt: 'Alle 20 Prüfwerkzeuge (Zahlen in Doku, Wirkfelder, Erreichbarkeit)', kosten: 'mittel' },
  build: { skript: 'build', schuetzt: 'Der Browser-Build geht durch', kosten: 'mittel' },
  test: { skript: 'test', schuetzt: 'Unit-Suite (node:test)', kosten: 'lang' },
  perf: { skript: 'perf', schuetzt: 'Tick-Budget 16,7 ms', kosten: 'mittel' },
  balance: { skript: 'balance', schuetzt: 'Waffen-Balance-Bericht', kosten: 'mittel' },
  'smoke:fast': { skript: 'smoke:fast', schuetzt: 'Kernpfade (Start, Match, Schuss, Zugwechsel, Ende)', kosten: 'mittel' },
  'test:e2e': { skript: 'test:e2e', schuetzt: 'Echter Browser, echte Interaktion (27 Dateien)', kosten: 'sehr-lang' },
};

/** Ordnet einen Gate-Lauf ein und zieht die Kennzahlen heraus. */
function bewerte(name, ergebnis) {
  const text = ergebnis.out;
  const kennzahlen = {};

  if (name === 'test') {
    const pass = text.match(/^# pass (\d+)/m);
    const fail = text.match(/^# fail (\d+)/m);
    const tests = text.match(/^# tests (\d+)/m);
    if (tests) kennzahlen.tests = Number(tests[1]);
    if (pass) kennzahlen.bestanden = Number(pass[1]);
    if (fail) kennzahlen.fehlgeschlagen = Number(fail[1]);
  }
  if (name === 'test:e2e') {
    const t = text.match(/(\d+)\s+passed/);
    const f = text.match(/(\d+)\s+failed/);
    if (t) kennzahlen.bestanden = Number(t[1]);
    if (f) kennzahlen.fehlgeschlagen = Number(f[1]);
  }
  if (name === 'perf') {
    const m = text.match(/Über Budget\s*:\s*(\d+)\s*Ticks\s*\((\d+)\s*%\)/);
    if (m) {
      kennzahlen.ticksUeberBudget = Number(m[1]);
      kennzahlen.prozentUeberBudget = Number(m[2]);
    }
    const m2 = text.match(/mittel\s*([\d.]+)\s*ms/);
    if (m2) kennzahlen.mittelMs = Number(m2[1]);
  }
  if (name === 'checks') {
    const fehlgeschlagen = [...text.matchAll(/(\S+)\s+FEHLGESCHLAGEN|FEHLGESCHLAGEN\s+(\S+)/g)].length;
    const zeilen = [...text.matchAll(/^\s*(?:OK|FEHLGESCHLAGEN|✓|✗)/gm)].length;
    kennzahlen.zeilen = zeilen;
    if (fehlgeschlagen) kennzahlen.fehlgeschlagen = fehlgeschlagen;
  }
  if (name === 'lint' && ergebnis.code !== 0) {
    const probleme = text.match(/(\d+) problem/);
    if (probleme) kennzahlen.probleme = Number(probleme[1]);
  }

  const letzteZeilen = text.trim().split('\n').filter(Boolean).slice(-12);
  return {
    gate: name,
    schuetzt: GATES[name]?.schuetzt ?? null,
    ok: ergebnis.code === 0,
    exitCode: ergebnis.code,
    abgebrochen: ergebnis.abgebrochen,
    dauerSekunden: Number((ergebnis.ms / 1000).toFixed(1)),
    kennzahlen,
    ausgabeEnde: letzteZeilen,
    fehler: ergebnis.fehler,
  };
}

/**
 * Fährt eine Gate-Auswahl.
 *
 * @param {{welche?: string[]|'schnell'|'alle', timeoutMs?: number}} optionen
 */
export function fahreGates({ welche = 'alle', timeoutMs = 900000 } = {}) {
  let namen;
  if (welche === 'alle') namen = Object.keys(GATES);
  else if (welche === 'schnell') namen = Object.keys(GATES).filter(g => GATES[g].kosten === 'schnell');
  else if (welche === 'mittel') namen = Object.keys(GATES).filter(g => GATES[g].kosten !== 'sehr-lang' && GATES[g].kosten !== 'lang');
  else if (Array.isArray(welche)) namen = welche.filter(n => GATES[n]);
  else namen = [];

  const ergebnisse = [];
  for (const name of namen) {
    const roh = npmRun(GATES[name].skript, { timeoutMs });
    ergebnisse.push(bewerte(name, roh));
  }

  const fehlgeschlagen = ergebnisse.filter(e => !e.ok);
  return {
    gefahren: namen,
    ergebnisse,
    gesamt: ergebnisse.length,
    bestanden: ergebnisse.length - fehlgeschlagen.length,
    fehlgeschlagen: fehlgeschlagen.map(e => e.gate),
    urteil: fehlgeschlagen.length === 0
      ? 'Alle gefahrenen Gates bestanden.'
      : `NICHT bestanden: ${fehlgeschlagen.map(e => e.gate).join(', ')}`,
    gesamtDauerSekunden: Number(ergebnisse.reduce((s, e) => s + e.dauerSekunden, 0).toFixed(1)),
  };
}

/**
 * E2E-Lauf im Hintergrund ist im MCP nicht sinnvoll abzubilden (10 min).
 * Dieses Werkzeug liefert nur den Plan, was zu tun ist — inklusive der
 * Putzregel, die im Projekt schon einmal gefehlt hat (Server am Ende beenden).
 */
export function e2ePlan() {
  return {
    hinweis: 'Der volle E2E-Lauf braucht ~10 Minuten. Im Vordergrund mit einem Timeout von 900 s aufrufen.',
    vorbereitung: [
      'pkill -f "[P]rojectArmageddon/node_modules/.bin/[v]ite"  (Klammer-Trick: sonst killt sich der Aufrufer selbst)',
      'ss -ltn | grep 5173  → muss leer sein',
    ],
    befehl: 'npm run test:e2e',
    danach: [
      'Dev-Server beenden (kein Server zurücklassen)',
      'Während eines E2E-Laufs NICHTS an Quelldateien ändern (HMR zerstört den Kontext)',
    ],
    bekannte_vorbestehende_fehler: [
      'profiling-Specs scheitern ohne GPU (SwiftShader, ~48,8 ms/Bild) — vorbestehend, nicht durch Änderungen verursacht',
    ],
  };
}
