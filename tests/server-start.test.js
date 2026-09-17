/**
 * Tests: Der eigenständige Server lässt sich starten und beenden.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * `src/server/gameServer.js` bringt `startServer()` mit — und der Kommentar
 * darüber verweist auf „siehe npm run server". **Dieses Skript gab es nicht.**
 * Der Server war betriebsreif gebaut (Port, Log-Level und Persistenz alle über
 * Umgebungsvariablen steuerbar), aber es fehlte der Weg, ihn zu starten.
 *
 * ## Ein zweiter Befund beim Starten
 *
 * Beim ersten Startversuch auf einem belegten Port kam **kein** verständlicher
 * Hinweis, sondern ein roher Stapelauszug: `Unhandled 'error' event` mit
 * `EADDRINUSE`. Ursache: Der **WebSocket-Server** hängt am selben HTTP-Server
 * und bekam dessen `error`-Ereignis mit — ohne Zuhörer wirft Node es als
 * unbehandelte Ausnahme und reißt den Prozess ab, **bevor** das `await` in
 * `listen()` greifen kann.
 *
 * Behoben in `gameServer.js`: Der WebSocket-Server hat jetzt einen Zuhörer;
 * `listen()` rejected weiterhin, sodass der Aufrufer den Fehler als Startfehler
 * behandeln kann.
 *
 * ## Was hier geprüft wird
 *
 * Der echte Start- und Beendigungsweg — mit einem Prozess, nicht mit einer
 * Attrappe. Geprüft werden: erfolgreicher Start, Antwort auf einer
 * HTTP-Anfrage, geordnetes Beenden und die Meldung bei belegtem Port.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const SKRIPT = path.join(ROOT, 'scripts', 'server.mjs');

/*
 * Ein freier Port.
 *
 * FUND (belegt, im Volllauf): Der erste Anlauf nahm einen festen Bereich
 * (38_000 + Zufall). Im Volllauf schlug ein Test EINMAL fehl — allein lief er
 * dreimal grün. Ursache: `node --test` führt Dateien parallel aus, und ein
 * anderer Test kann denselben Port belegen.
 *
 * Jetzt wird der Port NICHT geraten, sondern vom Betriebssystem erfragt: Ein
 * kurz gebundener Socket auf Port 0 liefert eine garantiert freie Nummer.
 * Zwischen Freigabe und Nutzung bleibt theoretisch eine Lücke — sie ist
 * praktisch vernachlässigbar, und der Fehlerfall wird sauber gemeldet statt
 * still zu scheitern.
 */
async function freierPort() {
  /*
   * Die Port-Nummer gibt es erst im `listening`-Ereignis.
   *
   * FUND (belegt): Ein erster Anlauf las `probe.address()` direkt nach
   * `listen()` — das ist `null`. Der Test übergab `PORT=null` an den
   * Serverprozess, der daraufhin auf dem Standardport startete und nie die
   * erwartete Meldung schrieb. Die Folge war ein Hänger, kein Fehler.
   */
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Startet den Server als echten Prozess und wartet auf die Startmeldung.
 *
 * @returns {Promise<{prozess: object, ausgabe: () => string, port: number}>}
 */
function starteServer(port, extraUmgebung = {}) {
  const zustand = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-srv-')), 'lobbies.json');

  const prozess = spawn('node', [SKRIPT], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PA_STATE_PATH: zustand, ...extraUmgebung },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ausgabe = '';
  prozess.stdout.on('data', d => { ausgabe += d.toString(); });
  prozess.stderr.on('data', d => { ausgabe += d.toString(); });

  const bereit = new Promise((resolve, reject) => {
    const frist = setTimeout(() => reject(new Error(
      `Der Server meldete sich nicht innerhalb von 10 s.\n${ausgabe}`,
    )), 10_000);

    const pruefen = () => {
      if (/läuft auf http/.test(ausgabe)) { clearTimeout(frist); resolve(); }
    };
    prozess.stdout.on('data', pruefen);
    prozess.stderr.on('data', pruefen);
    prozess.on('exit', code => {
      clearTimeout(frist);
      reject(new Error(`Der Server endete vorzeitig (Code ${code}).\n${ausgabe}`));
    });
  });

  return { prozess, bereit, ausgabe: () => ausgabe, port, zustand };
}

/**
 * Wartet, bis eine Bedingung zutrifft — ohne feste Wartezeit.
 *
 * Eine `setTimeout`-Pause wäre langsam und unzuverlässig: zu kurz, und der Test
 * schlägt zufällig fehl; zu lang, und jeder Lauf kostet unnötig Zeit.
 */
function warteAuf(bedingung, fristMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const pruefen = () => {
      if (bedingung()) return resolve();
      if (Date.now() - start > fristMs) return reject(new Error('Zeitüberschreitung'));
      setTimeout(pruefen, 25);
    };
    pruefen();
  });
}

/** Beendet einen Prozess und wartet auf sein Ende. */
function beende(prozess, signal = 'SIGTERM') {
  return new Promise(resolve => {
    if (prozess.exitCode !== null) return resolve(prozess.exitCode);
    prozess.on('exit', code => resolve(code));
    prozess.kill(signal);
  });
}

test('Der Server startet, antwortet und beendet sich geordnet', async () => {
  /*
   * Der volle Weg in einem Test: starten, anfragen, beenden. Ein Server, der
   * startet aber nicht antwortet (oder sich nicht beenden lässt), wäre in
   * Betrieb schlimmer als einer, der gar nicht startet.
   */
  const port = await freierPort();
  const s = starteServer(port);

  try {
    await s.bereit;

    // Antwortet er auf eine HTTP-Anfrage?
    const antwort = await fetch(`http://127.0.0.1:${port}/`);
    assert.ok(antwort.status < 500,
      `Der Server antwortete mit Status ${antwort.status}`);

    // Und beendet er sich geordnet?
    const code = await beende(s.prozess);
    assert.equal(code, 0, 'SIGTERM muss zu einem sauberen Ende (Code 0) führen');
    assert.match(s.ausgabe(), /speichere Zustand/,
      'das geordnete Beenden muss den Zustand sichern');
  } finally {
    if (s.prozess.exitCode === null) s.prozess.kill('SIGKILL');
  }
});

test('Ohne Lobby wird nichts gespeichert — das ist richtig so', async () => {
  /*
   * FUND (belegt, beim Schreiben dieses Tests): Ein erster Anlauf erwartete,
   * dass beim Beenden eine Zustandsdatei entsteht. Sie entstand nicht — und das
   * ist korrekt:
   *
   * `snapshotState()` sammelt die Lobbys in einer Schleife. Ohne Lobby bleibt
   * die Liste leer, `save()` schreibt nichts. Ein Server, der nie eine Lobby
   * hatte, hat auch nichts zu bewahren.
   *
   * Der Test hält deshalb das RICHTIGE Verhalten fest — nicht eine Erwartung,
   * die ich beim Schreiben geraten hatte.
   */
  const port = await freierPort();
  const s = starteServer(port);

  try {
    await s.bereit;
    await beende(s.prozess);

    assert.equal(fs.existsSync(s.zustand), false,
      'Ohne Lobby darf keine Zustandsdatei entstehen — sie wäre leer und '
      + 'würde beim nächsten Start nur gelesen und verworfen');
  } finally {
    if (s.prozess.exitCode === null) s.prozess.kill('SIGKILL');
  }
});

test('Die Persistenz ist über die Umgebung abschaltbar', async () => {
  /*
   * Die andere Seite: `PA_PERSISTENCE=off` muss wirklich greifen. Für Tests und
   * Wegwerf-Instanzen ist das der Unterschied zwischen „schreibt in mein
   * Projektverzeichnis" und „fasst nichts an".
   */
  const port = await freierPort();
  const s = starteServer(port, { PA_PERSISTENCE: 'off' });

  try {
    /*
     * Die Startzeile („läuft auf …") kommt VOR der Persistenzzeile. Ein erster
     * Anlauf prüfte direkt nach `bereit` und sah sie noch nicht.
     *
     * Deshalb wird auf die ZWEITE Zeile gewartet — nicht mit einer festen
     * Wartezeit, sondern über den Text selbst.
     */
    await warteAuf(() => /Persistenz: AUS/.test(s.ausgabe()), 5000);
    assert.match(s.ausgabe(), /Persistenz: AUS/,
      'Die Startmeldung muss den abgeschalteten Zustand nennen');

    const code = await beende(s.prozess);
    assert.equal(code, 0, 'auch ohne Persistenz muss das Beenden sauber sein');
    assert.equal(fs.existsSync(s.zustand), false,
      'Mit PA_PERSISTENCE=off darf keine Datei entstehen');
  } finally {
    if (s.prozess.exitCode === null) s.prozess.kill('SIGKILL');
  }
});

test('Ein belegter Port meldet sich verständlich, nicht als Stapelauszug', async () => {
  /*
   * DIE Prüfung des zweiten Befunds. Vor der Korrektur kam hier ein roher
   * Auszug mit „Unhandled 'error' event" — und der Prozess endete mit einem
   * Stapel, statt zu sagen, was zu tun ist.
   *
   * Geprüft wird: Exit-Code 1 (kein Absturz mit Signal), ein Satz mit dem Port
   * und ein konkreter Hinweis.
   */
  const port = await freierPort();
  const erster = starteServer(port);

  try {
    await erster.bereit;

    // Der zweite Start auf demselben Port muss sauber scheitern.
    const zweiter = spawn('node', [SKRIPT], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    zweiter.stdout.on('data', d => { text += d.toString(); });
    zweiter.stderr.on('data', d => { text += d.toString(); });

    const code = await new Promise(resolve => {
      zweiter.on('exit', resolve);
      setTimeout(() => { zweiter.kill('SIGKILL'); resolve('timeout'); }, 10_000);
    });

    assert.equal(code, 1, 'Ein belegter Port muss mit Code 1 enden, nicht abstürzen');
    assert.match(text, /bereits belegt/,
      `Die Meldung muss den belegten Port nennen.\nAusgabe:\n${text}`);
    assert.match(text, /PORT=8080|anderen Port/,
      'Die Meldung muss einen Ausweg nennen');
    assert.doesNotMatch(text, /Unhandled 'error' event/,
      'Der rohe Stapelauszug darf nicht zurückkehren');
  } finally {
    if (erster.prozess.exitCode === null) erster.prozess.kill('SIGKILL');
  }
});

test('Der WebSocket-Server hat einen Fehlerzuhörer', () => {
  /*
   * Der Strukturtest zum zweiten Befund. Ohne diesen Zuhörer wirft Node das
   * `error`-Ereignis des HTTP-Servers als unbehandelte Ausnahme — und der
   * Prozess endet, bevor `listen()` rejecten kann.
   *
   * Ein Verhaltenstest dafür ist möglich (siehe oben), aber er hängt am
   * Prozessstart. Dieser Test hält die Ursache fest, damit sie nicht
   * zurückkehrt, auch wenn die Meldung zufällig anders aussähe.
   */
  const quelle = fs.readFileSync(
    path.join(ROOT, 'src', 'server', 'gameServer.js'), 'utf8',
  );

  assert.match(quelle, /#wsServer\.on\('error'/,
    'Der WebSocket-Server braucht einen Fehlerzuhörer — sonst reißt ein '
    + 'belegter Port den Prozess mit einem rohen Stapelauszug ab');
});

test('Das Startskript ist über npm erreichbar', () => {
  /*
   * Der Kommentar in `gameServer.js` verweist auf „npm run server". Der
   * Verweis und der Eintrag müssen zusammenpassen — sonst führt die
   * Dokumentation ins Leere, was genau der Ausgangsbefund war.
   */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.server, 'npm run server fehlt in package.json');

  const quelle = fs.readFileSync(
    path.join(ROOT, 'src', 'server', 'gameServer.js'), 'utf8',
  );
  assert.match(quelle, /npm run server/,
    'der Verweis auf npm run server ist verschwunden');
});
