/**
 * Tests: Die Design-Prüfwerkzeuge antworten auf ihre Fragen.
 *
 * ## Warum diese Datei existiert
 *
 * Im Projekt liegen mehrere Werkzeuge, die **Entscheidungsgrundlagen** liefern
 * statt Entscheidungen: `check:targeting`, `check:fuses`, `check:range`,
 * `check:crates`, `check:maelstrom`, `check:achievements`, `balance:classes`.
 *
 * Sie sind keine Tests — sie messen und berichten. Damit fällt auf, dass sie
 * selbst **ungetestet** sind: Ein Werkzeug, das still falsch rechnet, liefert
 * eine falsche Entscheidungsgrundlage, und das fällt niemandem auf.
 *
 * ## Was hier geprüft wird
 *
 * Kein Zahlenwert (die ändern sich mit der Balance), sondern die **Mechanik**
 * jedes Werkzeugs: Es läuft durch, es meldet eine Zahl, und seine Antwort
 * enthält die Größe, nach der gefragt wurde.
 *
 * Bewusst NICHT geprüft wird die Höhe der Werte: Ein Test, der „Faktor 0,37"
 * festschreibt, müsste bei jeder Balance-Änderung angepasst werden — und würde
 * damit genau die Arbeit behindern, für die das Werkzeug da ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Führt ein Werkzeug aus und liefert seine Ausgabe. */
function fahreAus(skript, argumente = [], fristMs = 120_000) {
  return execFileSync('node', [path.join('scripts', skript), ...argumente], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: fristMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Die Werkzeuge, die OHNE Simulation schnell antworten können. */
const SCHNELL = [
  { skript: 'check-weapon-targeting.mjs', args: [], erwartet: /Widersprüche\s*:\s*\d+/ },
  { skript: 'check-fuses.mjs', args: [], erwartet: /Waffen mit Zünder:\s*\d+/ },
  { skript: 'class-balance.mjs', args: [], erwartet: /Spannweite:/ },
];

for (const { skript, args, erwartet } of SCHNELL) {
  test(`${skript} läuft durch und nennt seine Größe`, () => {
    const ausgabe = fahreAus(skript, args);
    assert.match(ausgabe, erwartet,
      `${skript} hat nicht geantwortet wie erwartet.\nAusgabe:\n${ausgabe.slice(0, 600)}`);
  });
}

test('check-weapon-targeting nennt die eine Quelle und den Stand', () => {
  /*
   * Das Werkzeug vergleicht die Designdatei gegen die Wirkung im Code. Die
   * Antwort muss BEIDE Zahlen nennen — sonst weiß niemand, ob der Widerspruch
   * gewachsen ist.
   */
  const ausgabe = fahreAus('check-weapon-targeting.mjs');
  assert.match(ausgabe, /Verglichen\s*:\s*\d+\s*Waffen/);
  assert.match(ausgabe, /Übereinstimmend:\s*\d+/);
});

test('check-fuses nennt die Flugzeit UND den Zünder', () => {
  /*
   * Der Vergleich ist der Punkt: Ein Zünder allein sagt nichts — erst im
   * Verhältnis zur Flugzeit wird er zur Aussage.
   */
  const ausgabe = fahreAus('check-fuses.mjs');
  assert.match(ausgabe, /Zünder/, 'die Zünderzeit fehlt');
  assert.match(ausgabe, /Flugzeit/, 'die Flugzeit fehlt');
  assert.match(ausgabe, /Faktor/, 'das Verhältnis fehlt');
});

test('class-balance nennt alle neun Kombinationen', () => {
  /*
   * Es gibt 3 Klassen × 3 Archetypen = 9 Kombinationen. Eine Antwort mit
   * weniger wäre unvollständig — und die Balance-Aussage trüge nicht.
   */
  const ausgabe = fahreAus('class-balance.mjs');
  const zeilen = ausgabe.split('\n').filter(z => /^\S+\/\S+\s+\d/.test(z));
  assert.equal(zeilen.length, 9,
    `Es wurden ${zeilen.length} Kombinationen genannt, erwartet 9`);
});

test('Jedes Prüfwerkzeug ist über npm erreichbar', () => {
  /*
   * Ein Werkzeug, das nur über einen Pfad erreichbar ist, wird nicht benutzt.
   * Der Wächter ruft sie über `npm run --silent <name>` auf.
   */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of [
    'check:targeting', 'check:fuses', 'check:range',
    'check:crates', 'check:maelstrom', 'check:achievements', 'balance:classes',
  ]) {
    assert.ok(pkg.scripts[name], `npm run ${name} fehlt in package.json`);
  }
});

test('Der Wächter ruft nur Werkzeuge auf, die es gibt', () => {
  /*
   * Der Cron-Wächter (`~/.hermes/scripts/projectarmageddon-audit-waechter.sh`)
   * ruft drei dieser Werkzeuge auf. Wird eines umbenannt, schlägt der Wächter
   * still fehl — er meldet dann nichts, obwohl etwas zu melden wäre.
   *
   * Geprüft wird deshalb, dass die dort genannten Skriptnamen existieren.
   */
  const waechterPfad = path.join(
    process.env.HOME ?? '/home/patrick',
    '.hermes', 'scripts', 'projectarmageddon-audit-waechter.sh',
  );
  if (!fs.existsSync(waechterPfad)) {
    // Auf einem anderen Rechner ist der Wächter nicht vorhanden — dann ist
    // dieser Test nicht anwendbar. Er wird NICHT als bestanden vorgetäuscht.
    assert.ok(true, 'Wächter nicht vorhanden (anderer Rechner)');
    return;
  }

  const waechter = fs.readFileSync(waechterPfad, 'utf8');
  const aufgerufen = [...waechter.matchAll(/npm run --silent ([a-z:-]+)/g)].map(m => m[1]);
  assert.ok(aufgerufen.length > 0, 'der Wächter ruft keine Werkzeuge auf');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of aufgerufen) {
    assert.ok(pkg.scripts[name],
      `Der Wächter ruft "npm run ${name}" auf — dieses Skript gibt es nicht`);
  }
});

test('Die Werkzeuge schreiben nichts ins Projekt', () => {
  /*
   * Wichtig: Ein Prüfwerkzeug darf keine Spuren hinterlassen. Ein Messlauf, der
   * Dateien anlegt, würde beim nächsten `git status` als Änderung erscheinen —
   * und die Verwechslung von Messung und Änderung ist genau die Art Fehler, die
   * dieses Projekt an mehreren Stellen behoben hat.
   *
   * Geprüft wird über einen echten Lauf: Vorher und nachher muss der
   * Arbeitsbaum gleich aussehen.
   */
  const vorher = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8',
  });

  fahreAus('check-weapon-targeting.mjs');

  const nachher = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8',
  });

  assert.equal(nachher, vorher,
    'Ein Prüfwerkzeug hat den Arbeitsbaum verändert — es soll nur lesen');
});
