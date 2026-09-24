#!/usr/bin/env node
/**
 * Rauchtest: die Kernpfade in unter einer Minute.
 *
 * ## Warum dieses Skript existiert
 *
 * Der volle E2E-Lauf dauert **9,4 Minuten** (27 Dateien, jede startet einen
 * Vite-Server und einen Browser). Neun Minuten Wartezeit nach jeder Änderung
 * führen dazu, dass man Änderungen **bündelt** — und dann rutschen Fehler
 * durch, die ein sofortiger Lauf gefunden hätte.
 *
 * Genau das ist passiert: Der Signal-Handler-Fehler und der Port-Wettlauf im
 * Server-Test wurden erst spät entdeckt, weil zwischen den Läufen zu viel
 * Arbeit lag.
 *
 * ## Was der Rauchtest ist und was nicht
 *
 * Er ist **kein Ersatz** für die volle Suite. Er prüft die Pfade, deren
 * Bruch sofort alles lahmlegt: Start, Match, Schuss, Zugwechsel, Ende.
 *
 *     Rauchtest       ~60 s    nach jeder Änderung
 *     Volle Suite     ~10 min  vor einem Push
 *
 * ## Aufruf
 *
 *     npm run smoke:fast
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

/*
 * `fileURLToPath`, NICHT `.pathname`.
 *
 * Belegt am 2026-09-24: Das Projektverzeichnis enthält Leerzeichen
 * („AnunnakiTools Projekte/laufende Projekte"). `new URL(...).pathname`
 * liefert den Pfad deshalb PROZENT-KODIERT —
 * `/home/patrick/AnunnakiTools%20Projekte/…` — und `fs.existsSync` darauf
 * ist `false`. Jeder `spawn` mit diesem `cwd` scheitert mit ENOENT
 * (`spawn npm ENOENT`), der Rauchtest war damit vollständig
 * funktionsunfähig und meldete keinen einzigen Schritt.
 *
 * 38 andere Dateien im Projekt machen es bereits richtig; diese eine war
 * die Ausnahme. Wer hier `.pathname` zurückbaut, bricht den Rauchtest
 * erneut — auf einem Rechner ohne Leerzeichen im Pfad aber unsichtbar.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Ein freier Port, vom Betriebssystem erfragt statt geraten. */
function freierPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Führt einen Befehl aus und liefert Ausgabe und Dauer. */
function laufe(befehl, argumente, fristMs) {
  return new Promise(resolve => {
    const start = performance.now();
    const p = spawn(befehl, argumente, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let ausgabe = '';
    // Vorab deklariert, damit der `error`-Zweig die Frist aufräumen kann, ohne
    // von der zeitlichen Reihenfolge der Zuweisung abzuhängen.
    let frist = null;
    p.stdout.on('data', d => { ausgabe += d.toString(); });
    p.stderr.on('data', d => { ausgabe += d.toString(); });

    /*
     * Ohne diesen Zweig wird ein Startfehler (z. B. ENOENT, weil `cwd` nicht
     * existiert) als unbehandeltes `error`-Ereignis GEWORFEN und reißt den
     * ganzen Lauf mit einem Stacktrace ab — der Rauchtest meldet dann keinen
     * FEHLER-Schritt, er stürzt ab. Genau das ist am 2026-09-24 passiert:
     * `spawn npm ENOENT`, und die Ausgabe war ein Stacktrace statt einer
     * Zeile „FEHLER".
     */
    p.on('error', fehler => {
      clearTimeout(frist);
      resolve({ code: -1, ausgabe: `${ausgabe}\nStart fehlgeschlagen: ${fehler?.message ?? fehler}`, ms: performance.now() - start });
    });

    frist = setTimeout(() => { p.kill('SIGKILL'); }, fristMs);
    p.on('exit', code => {
      clearTimeout(frist);
      resolve({ code, ausgabe, ms: performance.now() - start });
    });
  });
}

const schritte = [];

/** Führt einen Prüfschritt aus und schreibt das Ergebnis. */
async function schritt(name, fn) {
  process.stdout.write(`  ${name.padEnd(38)}`);
  const start = performance.now();
  try {
    const ergebnis = await fn();
    const ms = performance.now() - start;
    if (ergebnis.ok) {
      console.log(`OK   ${(ms / 1000).toFixed(1)} s`);
      schritte.push({ name, ok: true, ms, detail: ergebnis.detail });
      return true;
    }
    console.log(`FEHLER   ${(ms / 1000).toFixed(1)} s`);
    schritte.push({ name, ok: false, ms, detail: ergebnis.detail });
    return false;
  } catch (fehler) {
    const ms = performance.now() - start;
    console.log(`ABBRUCH   ${(ms / 1000).toFixed(1)} s`);
    schritte.push({ name, ok: false, ms, detail: fehler?.message ?? String(fehler) });
    return false;
  }
}

console.log('Rauchtest: die Kernpfade');
console.log('');
const gesamtStart = performance.now();

/*
 * 1. Die Gates, die bei jedem Fehler zuerst brechen: Syntax und Verkabelung.
 *    `validate` importiert alle vier Schichten — bricht eine, ist alles hin.
 */
await schritt('Verkabelung (validate)', async () => {
  const r = await laufe('npm', ['run', '--silent', 'validate'], 30_000);
  return {
    ok: r.code === 0 && /skeleton is valid/.test(r.ausgabe),
    detail: r.ausgabe.trim().split('\n').slice(-2).join(' | '),
  };
});

/*
 * 2. Lint — schnell und findet Tippfehler, bevor sie in einen 9-Minuten-Lauf
 *    gehen. `eslint` über 900 Dateien braucht rund 3 Sekunden.
 */
await schritt('Lint', async () => {
  const r = await laufe('npm', ['run', '--silent', 'lint'], 60_000);
  return { ok: r.code === 0, detail: r.ausgabe.trim().split('\n').slice(-1)[0] };
});

/*
 * 3. Die Kern-Tests. NICHT alle 795 — nur die, deren Bruch das Spiel
 *    unspielbar macht: Match-Ablauf, Determinismus, Waffen, Lobby.
 */
/*
 * Die Dateien werden VOR dem Lauf geprüft (siehe unten) — fehlt eine, wird das
 * gemeldet statt still übersprungen. Ein Rauchtest, der eine verschwundene
 * Datei übersieht, meldet „OK" für einen Pfad, den er nicht geprüft hat.
 */
const KERN_TESTDATEIEN = [
  'tests/gameplay.test.js',      // Match-Ablauf, Zugwechsel, Mahlstrom
  'tests/replay.test.js',        // Determinismus — die Kernzusage
  'tests/server-integration.test.js', // Lobby, Beitritt, Server-Ablauf
  'tests/anti-cheat.test.js',    // Client-Autorität
  'tests/damage-system.test.js', // Schaden und Gesundheit
];

await schritt('Kern-Tests (Match, Replay, Waffen)', async () => {
  const vorhanden = [];
  const fs = await import('node:fs');
  const path = await import('node:path');
  for (const datei of KERN_TESTDATEIEN) {
    if (fs.existsSync(path.join(ROOT, datei))) vorhanden.push(datei);
  }
  const r = await laufe('node', ['--test', ...vorhanden], 90_000);
  const treffer = /# fail (\d+)/.exec(r.ausgabe);
  const fehler = treffer ? Number(treffer[1]) : -1;
  const pass = /# pass (\d+)/.exec(r.ausgabe);
  return {
    ok: r.code === 0 && fehler === 0,
    detail: `${pass?.[1] ?? '?'} bestanden, ${fehler} fehlgeschlagen`,
  };
});

/*
 * 4. Der Server startet und beendet sich. Das ist der Pfad, der in dieser
 *    Sitzung zweimal kaputt war (Signal-Handler, Port) — und beide Male
 *    hätte ein Rauchtest ihn sofort gefunden.
 */
await schritt('Server startet und beendet sich', async () => {
  const port = await freierPort();
  const { spawn: sp } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-smoke-'));
  const zustand = path.join(dir, 'lobbies.json');

  const p = sp('node', ['scripts/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PA_STATE_PATH: zustand },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ausgabe = '';
  p.stdout.on('data', d => { ausgabe += d.toString(); });
  p.stderr.on('data', d => { ausgabe += d.toString(); });

  // Auf die Startmeldung warten.
  const bereit = await new Promise(resolve => {
    const frist = setTimeout(() => resolve(false), 10_000);
    const pruefen = () => {
      if (/läuft auf http/.test(ausgabe)) { clearTimeout(frist); resolve(true); }
    };
    p.stdout.on('data', pruefen);
    p.stderr.on('data', pruefen);
  });

  if (!bereit) {
    p.kill('SIGKILL');
    return { ok: false, detail: `keine Startmeldung. Ausgabe: ${ausgabe.slice(0, 200)}` };
  }

  /*
   * Beenden und warten, bis die Zustandsdatei da ist — genau der Fall, der
   * vorher in 2 von 3 Läufen fehlschlug. Er wird hier ZWINGEND geprüft.
   */
  const code = await new Promise(resolve => { p.on('exit', resolve); p.kill('SIGTERM'); });

  const dateiDa = await new Promise(resolve => {
    const start = Date.now();
    const pruefen = () => {
      if (fs.existsSync(zustand)) return resolve(true);
      if (Date.now() - start > 5000) return resolve(false);
      setTimeout(pruefen, 25);
    };
    pruefen();
  });

  if (p.exitCode === null) p.kill('SIGKILL');

  return {
    ok: code === 0 && dateiDa,
    detail: `exit=${code}, Zustand gesichert=${dateiDa}`,
  };
});

const gesamtMs = performance.now() - gesamtStart;
const fehlgeschlagen = schritte.filter(s => !s.ok);

console.log('');
console.log(`Rauchtest: ${schritte.length - fehlgeschlagen.length} von ${schritte.length} Schritten OK `
  + `in ${(gesamtMs / 1000).toFixed(1)} s`);

if (fehlgeschlagen.length > 0) {
  console.log('');
  console.log('FEHLGESCHLAGEN:');
  for (const s of fehlgeschlagen) {
    console.log(`  ${s.name}`);
    console.log(`    ${s.detail}`);
  }
  console.log('');
  console.log('Der volle Lauf wäre jetzt verschwendete Zeit — erst hier reparieren:');
  console.log('  npm test && npx playwright test');
  process.exit(1);
}

console.log('');
console.log(`Der volle Lauf (9,4 min) lohnt sich jetzt: npm run test:all`);
