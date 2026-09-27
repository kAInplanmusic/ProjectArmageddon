#!/usr/bin/env node
/**
 * Gegenprobe für den Code-Fingerabdruck (`lib/stand.mjs`).
 *
 * Aufruf:  node tools/audit-mcp/probe-stand.mjs
 * Exit-Code 0 = alle Erwartungen erfüllt, 1 = mindestens eine verletzt.
 *
 * ## Warum diese Datei existiert
 *
 * Der belegte Fehler (2026-09-26): Nach der Reparatur von `lib/statisch.mjs`
 * lieferte der LAUFENDE Server weiter die alte Welt — 43 statt 47 Ereignisse,
 * 27 „undokumentiert stumme" statt 0. Ein ganzes Arbeitsdurchgang-Kontingent
 * ging dafür drauf. Der Fingerabdruck ist die Antwort darauf, aber ein
 * Fingerabdruck, der nur „alles gut" sagen kann, wäre wertlos. Diese Probe
 * zwingt ihn in BEIDE Richtungen:
 *
 *   - gleicher Code            → `abweichung: false`
 *   - geänderte Datei          → `abweichung: true` + die Warnung im Wortlaut
 *   - neue Datei               → `abweichung: true`
 *   - unlesbare Datei          → `abweichung: true` (fail-safe, NICHT „gleich")
 *   - JEDE Werkzeugantwort     → trägt `werkzeugStand`
 *
 * Gemessen wird gegen eine KOPIE des Servers in einem Temp-Verzeichnis: der
 * echte Baum wird für diese Probe nicht angefasst (parallel arbeiten andere
 * Worker daran), und die Kopie ist genau der Fall, der im Betrieb auftritt —
 * ein bereits laufender Prozess, dessen Dateien sich unter ihm ändern.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
/** Die Projektwurzel: `tools/audit-mcp` liegt zwei Ebenen darunter. */
const PROJEKT = path.resolve(HIER, '..', '..');
const MARKER = 'Dieser Server läuft mit altem Code — Neustart nötig';
const MARKER_ASCII = 'Dieser Server laeuft mit altem Code - Neustart noetig';

let fehler = 0;
const pruefe = (titel, erwartet, gemessen, ok) => {
  console.log(`\n${ok ? 'OK  ' : 'FEHL'} ${titel}`);
  console.log(`     ERWARTET: ${erwartet}`);
  console.log(`     GEMESSEN: ${gemessen}`);
  if (!ok) fehler += 1;
};

/**
 * Kopiert den Server in ein Temp-PROJEKT (der echte Baum bleibt unberührt).
 *
 * Nur `tools/audit-mcp` wird kopiert — die Nachbarordner (`src`, `tests`, …)
 * werden verlinkt, weil `lib/dynamisch.mjs` sie über `../../../src/...` lädt.
 * Damit ist der Kopie-Prozess ein echter Server, und geändert wird
 * ausschließlich die Kopie unter `tools/audit-mcp`.
 */
function kopiereServer() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-mcp-stand-'));
  const mcp = path.join(wurzel, 'tools', 'audit-mcp');
  fs.mkdirSync(mcp, { recursive: true });
  fs.cpSync(HIER, mcp, { recursive: true });
  for (const name of ['src', 'tests', 'scripts', 'node_modules', 'package.json', 'docs']) {
    const quelle = path.join(PROJEKT, name);
    if (fs.existsSync(quelle)) fs.symlinkSync(quelle, path.join(wurzel, name));
  }
  return { wurzel, mcp };
}

/** Startet die Kopie als echter MCP-Prozess (stdio, JSON-RPC) und spricht mit ihr. */
function starteServer({ mcp }) {
  const kind = spawn(process.execPath, [path.join(mcp, 'server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const warten = new Map();
  let puffer = '';
  let stderr = '';
  kind.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
  kind.stdout.on('data', (d) => {
    puffer += d.toString('utf8');
    let i;
    while ((i = puffer.indexOf('\n')) >= 0) {
      const zeile = puffer.slice(0, i).trim();
      puffer = puffer.slice(i + 1);
      if (!zeile) continue;
      let nachricht;
      try { nachricht = JSON.parse(zeile); } catch { continue; }
      if (nachricht.id !== undefined && warten.has(nachricht.id)) {
        warten.get(nachricht.id)(nachricht);
        warten.delete(nachricht.id);
      }
    }
  });
  let id = 0;
  const ruf = (method, params) => {
    const meineId = ++id;
    const antwort = new Promise((res, rej) => {
      warten.set(meineId, res);
      setTimeout(() => {
        if (warten.has(meineId)) {
          warten.delete(meineId);
          rej(new Error(`Zeitüberschreitung bei ${method}${stderr ? ` · stderr: ${stderr.slice(0, 200)}` : ''}`));
        }
      }, 30000);
    });
    kind.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: meineId, method, params })}\n`);
    return antwort;
  };
  return { kind, ruf, stderr: () => stderr, beenden: () => kind.kill('SIGKILL') };
}

/** Sucht im Ergebnis den JSON-Block (der Fingerabdruck hängt IM JSON). */
function nutzlast(antwort) {
  for (const c of antwort?.result?.content ?? []) {
    if (c?.type !== 'text') continue;
    try {
      const obj = JSON.parse(c.text);
      if (obj && typeof obj === 'object') return obj;
    } catch { /* Textblock ohne JSON */ }
  }
  return null;
}
const textbloecke = (antwort) => (antwort?.result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text);
const resultRoh = (antwort) => (antwort?.result?.content ?? []).map((c) => c.text).join('\n');

/* ══ 1. Frischer Prozess: gleicher Code, Feld an jeder Antwort ══════════════ */
console.log('── 1. Frischer Prozess: läuft mit dem Code, der jetzt auf der Platte liegt ──');
const dir1 = kopiereServer();
const s1 = starteServer(dir1);
const handschlag = await s1.ruf('initialize', { protocolVersion: '2025-06-18' });
pruefe(
  '1a) Handschlag nennt den Fingerabdruck des antwortenden Codes',
  'serverInfo.stand.hash = 64 Hex-Zeichen, prozessStart vorhanden',
  `hash = ${handschlag.result?.serverInfo?.stand?.hash?.slice(0, 16)}… (${handschlag.result?.serverInfo?.stand?.hash?.length} Zeichen) · prozessStart = ${handschlag.result?.serverInfo?.stand?.prozessStart}`,
  /^[0-9a-f]{64}$/.test(handschlag.result?.serverInfo?.stand?.hash ?? '')
    && typeof handschlag.result?.serverInfo?.stand?.prozessStart === 'string',
);

const standFrisch = await s1.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pFrisch = nutzlast(standFrisch);
pruefe(
  '1b) audit_stand, unberührter Baum → KEINE Abweichung',
  'abweichung = false, geaendert = [], unlesbar = [], Meldung „…liegt JETZT auf der Platte"',
  `abweichung = ${pFrisch?.abweichung} · geaendert = ${JSON.stringify(pFrisch?.geaendert)} · unlesbar = ${JSON.stringify(pFrisch?.unlesbar)} · meldung = „${pFrisch?.meldung}"`,
  pFrisch?.abweichung === false && pFrisch?.geaendert?.length === 0 && pFrisch?.unlesbar?.length === 0
    && /JETZT auf der Platte/.test(pFrisch?.meldung ?? ''),
);

const status = await s1.ruf('tools/call', { name: 'audit_status', arguments: {} });
const pStatus = nutzlast(status);
pruefe(
  '1c) Jede Werkzeugantwort trägt `werkzeugStand` (hier: audit_status)',
  'nutzlast.werkzeugStand.hash = Prozesshash · _meta.werkzeugStand vorhanden · veraltet = false',
  `nutzlast.werkzeugStand.hash = ${pStatus?.werkzeugStand?.hash?.slice(0, 16)}… · _meta vorhanden = ${Boolean(standFrisch.result?._meta?.werkzeugStand)} · veraltet = ${pStatus?.werkzeugStand?.veraltet}`,
  pStatus?.werkzeugStand?.hash?.length === 64 && pStatus?.werkzeugStand?.veraltet === false
    && standFrisch.result?._meta?.werkzeugStand?.hash?.length === 64,
);

const fehlerpfad = await s1.ruf('tools/call', { name: 'audit_determinism', arguments: { seeds: 5 } });
pruefe(
  '1d) Auch ein Fehlerergebnis trägt den Fingerabdruck (Textpfad, kein JSON)',
  'isError = true · _meta.werkzeugStand vorhanden · Antworttext enthält „werkzeugStand"',
  `isError = ${fehlerpfad.result?.isError} · _meta vorhanden = ${Boolean(fehlerpfad.result?._meta?.werkzeugStand)} · enthält werkzeugStand = ${/werkzeugStand/.test(resultRoh(fehlerpfad))}`,
  fehlerpfad.result?.isError === true
    && fehlerpfad.result?._meta?.werkzeugStand?.hash?.length === 64
    && /werkzeugStand/.test(resultRoh(fehlerpfad)),
);

/* ══ 2. Dieselbe Prozessinstanz, geänderte Datei ════════════════════════════ */
console.log('\n── 2. Dieselbe Prozessinstanz, Datei unter ihr geändert ──');
fs.appendFileSync(path.join(dir1.mcp, 'lib', 'gates.mjs'), '\n// Probe: nach dem Start geändert\n');
const standNachAenderung = await s1.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pGeaendert = nutzlast(standNachAenderung);
pruefe(
  '2a) Geänderte lib/gates.mjs → LAUTE Meldung im Wortlaut',
  `abweichung = true · Meldung enthält „${MARKER}" und die ASCII-Fassung · geaendert nennt lib/gates.mjs`,
  `abweichung = ${pGeaendert?.abweichung} · Meldung im Wortlaut = ${(pGeaendert?.meldung ?? '').includes(MARKER)} · ASCII = ${(pGeaendert?.meldungAscii ?? '').includes(MARKER_ASCII)} · geaendert = ${JSON.stringify(pGeaendert?.geaendert?.map((g) => g.datei))}`,
  pGeaendert?.abweichung === true
    && (pGeaendert?.meldung ?? '').includes(MARKER)
    && (pGeaendert?.meldungAscii ?? '').includes(MARKER_ASCII)
    && pGeaendert?.geaendert?.some((g) => g.datei === 'lib/gates.mjs'),
);

pruefe(
  '2b) Der Fingerabdruck steht auch am Telegramm dieser Antwort — in der Nutzlast UND als Kopfzeile',
  'nutzlast.werkzeugStand.veraltet = true · prozessHash ≠ platteHash · erster Textblock beginnt mit der Warnung',
  `veraltet = ${pGeaendert?.werkzeugStand?.veraltet} · prozessHash${pGeaendert?.werkzeugStand?.hash?.slice(0, 8)} ≠ platteHash${pGeaendert?.werkzeugStand?.platteHash?.slice(0, 8)} · Kopfblock = ${JSON.stringify((textbloecke(standNachAenderung)[0] ?? '').split('\n')[0])}`,
  pGeaendert?.werkzeugStand?.veraltet === true
    && pGeaendert?.werkzeugStand?.hash !== pGeaendert?.werkzeugStand?.platteHash
    && (textbloecke(standNachAenderung)[0] ?? '').includes(MARKER),
);

const standAnderesWerkzeug = await s1.ruf('tools/call', { name: 'audit_checklist', arguments: { thema: 'messung' } });
const pAnderes = nutzlast(standAnderesWerkzeug);
pruefe(
  '2c) Auch ein ANDERES Werkzeug im veralteten Prozess warnt an seiner eigenen Antwort',
  'nutzlast.werkzeugStand.veraltet = true (nicht nur audit_stand warnt)',
  `veraltet = ${pAnderes?.werkzeugStand?.veraltet} · urteil = „${String(pAnderes?.werkzeugStand?.urteil ?? '').slice(0, 80)}…"`,
  pAnderes?.werkzeugStand?.veraltet === true,
);

/* ══ 3. Neue Datei im lib-Ordner ════════════════════════════════════════════ */
console.log('\n── 3. Neue Datei im lib-Ordner ──');
fs.writeFileSync(path.join(dir1.mcp, 'lib', 'zz-probe-neu.mjs'), 'export const NEU = 1;\n');
const standNeu = await s1.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pNeu = nutzlast(standNeu);
pruefe(
  '3) Neu hinzugekommene lib/*.mjs → Abweichung (der Fingerabdruck ist keine feste Dateiliste)',
  'abweichung = true · neuAufDerPlatte enthält lib/zz-probe-neu.mjs',
  `abweichung = ${pNeu?.abweichung} · neuAufDerPlatte = ${JSON.stringify(pNeu?.neuAufDerPlatte)}`,
  pNeu?.abweichung === true && pNeu?.neuAufDerPlatte?.includes('lib/zz-probe-neu.mjs'),
);

/* ══ 4. Fail-safe: unlesbare Datei ist eine ABWEICHUNG ═════════════════════ */
console.log('\n── 4. Fail-safe: unlesbare Datei ──');
const dir2 = kopiereServer();
const s2 = starteServer(dir2);
await s2.ruf('initialize', {});
const standSauber = await s2.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pSauber = nutzlast(standSauber);
fs.chmodSync(path.join(dir2.mcp, 'lib', 'repo.mjs'), 0o000);
const standUnlesbar = await s2.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pUnlesbar = nutzlast(standUnlesbar);
pruefe(
  '4) Unlesbare Datei bei sonst identischem Baum → Abweichung, NICHT „gleich"',
  `vorher abweichung = false · nachher abweichung = true · unlesbar nennt lib/repo.mjs · Meldung nennt „NICHT messbar"`,
  `vorher = ${pSauber?.abweichung} · nachher = ${pUnlesbar?.abweichung} · unlesbar = ${JSON.stringify((pUnlesbar?.unlesbar ?? []).map((u) => `${u.datei}(${u.seite},${u.fehler})`))} · Meldung nennt „NICHT messbar" = ${/NICHT messbar/.test(pUnlesbar?.meldung ?? '')}`,
  pSauber?.abweichung === false && pUnlesbar?.abweichung === true
    && pUnlesbar?.unlesbar?.some((u) => u.datei === 'lib/repo.mjs')
    && /NICHT messbar/.test(pUnlesbar?.meldung ?? ''),
);
fs.chmodSync(path.join(dir2.mcp, 'lib', 'repo.mjs'), 0o644);

/* ══ 5. Neu gestartet → wieder gleicher Stand ══════════════════════════════ */
console.log('\n── 5. Neustart auf denselben Dateien → Warnung verstummt ──');
s1.beenden();
const s1b = starteServer(dir1);
await s1b.ruf('initialize', {});
const standNeustart = await s1b.ruf('tools/call', { name: 'audit_stand', arguments: {} });
const pNeustart = nutzlast(standNeustart);
pruefe(
  '5) Frischer Prozess auf dem GEÄNDERTEN Baum → wieder „gleicher Code" (die Warnung ist kein Dauerzustand)',
  'abweichung = false · Prozesshash ≠ Hash der ersten Instanz (der Code hat sich wirklich geändert)',
  `abweichung = ${pNeustart?.abweichung} · alter Prozesshash = ${pFrisch?.prozess?.hash?.slice(0, 12)} · neuer = ${pNeustart?.prozess?.hash?.slice(0, 12)}`,
  pNeustart?.abweichung === false && pFrisch?.prozess?.hash !== pNeustart?.prozess?.hash,
);

/* ── Aufräumen ── */
s1b.beenden();
s2.beenden();
fs.rmSync(dir1.wurzel, { recursive: true, force: true });
fs.rmSync(dir2.wurzel, { recursive: true, force: true });

console.log(`\n${fehler === 0 ? 'Alle Erwartungen erfüllt.' : `${fehler} Erwartung(en) verletzt.`}`);
process.exit(fehler === 0 ? 0 : 1);
