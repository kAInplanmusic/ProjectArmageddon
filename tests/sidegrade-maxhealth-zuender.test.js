/**
 * Was der Client zum Rechnen und Zeichnen braucht, kommt auch an: Sidegrade,
 * Höchstleben und Zünderrest.
 *
 * ## Die drei Funde (alle belegt)
 *
 * **Sidegrade fehlte auf der Leitung.** `main.js:1607` liest
 * `eigene.sidegradeId` für die Schussvorhersage — weder der binäre Snapshot noch
 * die Bestandsnachricht führten das Feld. Der Client rechnete deshalb IMMER ohne
 * Sidegrade, der Server mit ihm. Gemessen an der Bahnlänge (45°, Kraft 100,
 * flacher Boden): artillery/scharfschütze 134 px ohne, 191 px mit `kompakt`
 * (+57) und 98 px mit `schwerlast` (−36) — der Faktor geht von 0,5347 auf
 * 0,6417 bzw. 0,4545, und die Bahnweite wächst mit seinem QUADRAT.
 *
 * **Höchstleben war die Konstante 100.** Klasse und Archetyp ergeben gemessen 32
 * verschiedene Werte von 48 bis 195. `hud.js:365` und `renderer.js:795` rechnen
 * `health / maxHealth` ohne Obergrenze: Ein voller Balken eines 156-HP-Brawlers
 * war 156 % breit, ein unverletzter Späher sah mit 96 % beschädigt aus.
 *
 * **Der Zünderrest fehlte im Projektilblock.** `renderer.js` (`#drawProjectiles`)
 * zeichnet Ring
 * und Sekundenzahl aus `projectile.fuseSeconds`; der Snapshot führte nur
 * `entityId/x/y`, also stand dort online IMMER 0. Der Countdown erschien nur
 * lokal — genau die Information fehlte, für die er gebaut ist.
 *
 * ## Was hier gemessen wird
 *
 * Der erste Test geht den ECHTEN Weg: Server, zwei Menschen, die
 * Bestandsnachricht (`LOADOUTS`) — und prüft, dass der Wert ankommt und dass er
 * der ist, den der MOTOR benutzt. Dazu die Rechnung des Lesers: Der Faktor und
 * die Bahn müssen sich mit dem angekommenen Sidegrade messbar ändern.
 *
 * Der zweite Test prüft die Leitung selbst (encode/decode) — inklusive der
 * Größenformel, damit die Stride-Zahl nicht unbemerkt auseinanderläuft.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';
import { startServer } from '../src/server/gameServer.js';
import {
  CONTROL,
  controlMessage,
  parseControlMessage,
  encodeSnapshot,
  decodeSnapshot,
  HEADER_SIZE,
  PLAYER_STRIDE,
  PROJECTILE_STRIDE,
  GUENTHER_STRIDE,
  PROTOCOL_VERSION,
} from '../src/shared/protocol.js';
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../src/shared/config/classes.js';
import { BASE_HEALTH, MatchController } from '../src/engine/match.js';
import { launchSpeedMultiplier, predictTrajectory } from '../src/client/shotPrediction.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function createLobby(url, body) {
  const response = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Lobby-Erstellung fehlgeschlagen: ${response.status}`);
  return response.json();
}

function openSocket(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const controls = [];
  const tables = [];
  socket.on('message', (raw, isBinary) => {
    if (isBinary) return;
    const message = parseControlMessage(raw);
    if (!message) return;
    controls.push(message);
    if (message.t === CONTROL.LOADOUTS) tables.push(message.loadouts ?? {});
  });
  return {
    socket,
    controls,
    tables,
    opened: new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    send: (type, payload = {}) => socket.send(controlMessage(type, payload)),
    async waitFor(type, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const index = controls.findIndex(m => m.t === type);
        if (index >= 0) return controls.splice(index, 1)[0];
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error(`Timeout: ${type}`);
    },
    close: () => socket.terminate(),
  };
}

test('Sidegrad und Höchstleben kommen über die Bestandsnachricht beim Leser an', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-sidegrade-'));
  const statePath = join(dir, 'lobbies.json');
  let instanz = null;
  let a = null;
  let b = null;
  try {
    instanz = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    const created = await createLobby(instanz.url, {
      teams: 2,
      playersPerTeam: 1,
      seed: 20260910,
      // Platz 0 bekommt „kompakt", Platz 1 nichts — beide Fälle in einer Nachricht.
      sidegrades: ['kompakt', null],
    });
    const lobbyId = created.lobby.id;

    a = openSocket(instanz.port);
    await a.opened;
    a.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token: created.player.token });
    await a.waitFor(CONTROL.WELCOME);
    b = openSocket(instanz.port);
    await b.opened;
    b.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'B' });
    await b.waitFor(CONTROL.WELCOME);
    await a.waitFor(CONTROL.LOADOUTS);
    await b.waitFor(CONTROL.LOADOUTS);

    const tabelle = a.tables.at(-1);
    assert.ok(tabelle && Object.keys(tabelle).length === 2, `Zwei Plätze erwartet: ${JSON.stringify(tabelle)}`);

    const eintraege = Object.entries(tabelle);
    const mitSidegrade = eintraege.filter(([, e]) => e.sidegradeId === 'kompakt');
    const ohneSidegrade = eintraege.filter(([, e]) => e.sidegradeId === null);
    assert.equal(mitSidegrade.length, 1, 'Genau ein Platz hat den gewählten Sidegrad');
    assert.equal(ohneSidegrade.length, 1, 'Der andere Platz hat keinen (null, nicht undefined)');

    const session = instanz.server.getSession(lobbyId);
    assert.ok(session, 'Die Sitzung muss laufen');

    for (const [entityIdText, eintrag] of eintraege) {
      const entityId = Number(entityIdText);
      // Der Wert im Motor — die Quelle, aus der die Nachricht schöpft.
      const spieler = session.match.players.find(p => p.entityId === entityId);
      assert.ok(spieler, `Figur ${entityId} muss es im Motor geben`);
      assert.equal(
        eintrag.sidegradeId, spieler.sidegradeId ?? null,
        'Die Nachricht muss den Sidegrad des MOTORS tragen, nicht einen eigenen Wert',
      );

      /*
       * Höchstleben: unabhängig nachgerechnet aus Klasse/Archetyp/Sidegrad mit
       * DERSELBEN gemeinsamen Formel (`combatProfile` × `BASE_HEALTH`) — die
       * Klassenmatrix ist die Quelle, nicht die Zahl, die hier ankommt.
       *
       * ACHTUNG, die Falle aus `launchSpeed.js`: Im Motor sind `classId` und
       * `archetypeId` INDIZES, in `combatProfile` NAMEN. Ein Index, der
       * unkonvertiert hineingeht, liefert still das Rückfallprofil — genau so
       * entstünde hier ein falscher Erwartungswert.
       */
      const erwartet = Math.round(
        BASE_HEALTH * combatProfile(
          CLASS_IDS[spieler.classId],
          ARCHETYPE_IDS[spieler.archetypeId],
          spieler.sidegradeId,
        ).healthMultiplier,
      );
      assert.equal(
        eintrag.maxHealth, erwartet,
        `Höchstleben von Figur ${entityId} (${CLASS_IDS[spieler.classId]}/${ARCHETYPE_IDS[spieler.archetypeId]}/`
        + `${spieler.sidegradeId ?? '—'}): erwartet ${erwartet}, übertragen ${eintrag.maxHealth}`,
      );
    }

    // Die Konstante 100 ist weg — sonst wäre der Balken weiter falsch breit.
    assert.ok(
      eintraege.some(([, e]) => e.maxHealth !== 100),
      `Mindestens ein Platz hat ein Höchstleben ungleich 100 (hier: ${eintraege.map(([, e]) => e.maxHealth).join(', ')})`,
    );

    /*
     * Der Leser: Mit dem ANGEGEKOMMENEN Sidegrad rechnet die Vorhersage anders.
     * Gemessen wird die Bahnweite bei 45° und Kraft 100 auf flachem Boden —
     * dieselbe Rechnung, die `#startShotPrediction` für den Spieler zeichnet.
     */
    const [, mit] = mitSidegrade[0];
    const waffe = getWeapon('pa_001');
    const bahn = sidegradeId => {
      const faktor = launchSpeedMultiplier({
        classId: mit.classId, archetypeId: mit.archetypeId, weapon: waffe, sidegradeId, kartenbreite: 2560,
      });
      const ergebnis = predictTrajectory({
        x: 200, y: 400, angle: Math.PI / 4, power: 100,
        speedMultiplier: faktor, gravityScale: waffe?.gravityScale ?? 1,
        wind: 0, width: 2560, height: 1440,
        isSolid: (px, py) => py >= 400,
      });
      const punkte = ergebnis.points ?? [];
      return {
        faktor,
        weite: punkte.length > 0 ? Math.max(...punkte.map(p => p.x)) - 200 : 0,
      };
    };
    const mitSidegrad = bahn(mit.sidegradeId);
    const ohneSidegrad = bahn(null);
    assert.notEqual(
      mitSidegrad.faktor, ohneSidegrad.faktor,
      'Der Sidegrad muss den Geschwindigkeitsfaktor ändern — sonst wäre die ganze Zeile wirkungslos',
    );
    assert.notEqual(
      Math.round(mitSidegrad.weite), Math.round(ohneSidegrad.weite),
      `Die Bahn muss sich messbar unterscheiden: ohne ${ohneSidegrad.weite.toFixed(0)} px, `
      + `mit ${mitSidegrad.weite.toFixed(0)} px`,
    );
  } finally {
    if (a) a.close();
    if (b) b.close();
    if (instanz) await instanz.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Der Projektilblock trägt den Zünderrest (Protokoll v8)', () => {
  const zustand = {
    tick: 42,
    round: 1,
    wind: 0,
    activePlayerId: 0,
    entities: [],
    projectiles: [
      { entityId: 7, x: 100.25, y: 200.5, fuseSeconds: 2.4 },
      { entityId: 8, x: 10, y: 20, fuseSeconds: 0 },
    ],
    crates: [],
    turrets: [],
    guenther: null,
  };

  const bytes = encodeSnapshot(zustand, { turnRemainingMs: 1000 });
  assert.equal(
    bytes.length,
    // Der Günther-Block ist IMMER dabei (6 Byte), auch ohne Günther.
    HEADER_SIZE + zustand.projectiles.length * PROJECTILE_STRIDE + GUENTHER_STRIDE,
    'Die Größenformel muss die Stride-Zahl einhalten',
  );
  assert.equal(PROJECTILE_STRIDE, 7, 'Projektil: Kennung, x, y, Zünderrest');
  assert.equal(PLAYER_STRIDE, 15);

  const gelesen = decodeSnapshot(bytes);
  assert.ok(gelesen, 'Der eigene Snapshot muss lesbar sein');
  assert.equal(gelesen.projectiles.length, 2);
  assert.equal(
    gelesen.projectiles[0].fuseSeconds, 2.4,
    'Der Zünderrest muss die Leitung überleben (Zehntelsekunden)',
  );
  assert.equal(gelesen.projectiles[1].fuseSeconds, 0);

  // Der Wert steht in DERSELBEN Einheit wie im lokalen Ansichtszustand.
  const lokal = new MatchController({ seed: 1, teams: 2, playersPerTeam: 1 });
  lokal.start();
  const befund = lokal.getState();
  assert.ok(
    'fuseSeconds' in (befund.projectiles[0] ?? { fuseSeconds: 0 }),
    'Auch lokal heißt das Feld fuseSeconds — sonst liest der Renderer zwei Namen',
  );
});

test('Eine Zündgranate trägt ihren Rest auch durch die echte Leitung', () => {
  /*
   * Der Motor muss den Wert überhaupt liefern: Eine Waffe mit Zünder
   * (`fuseTime > 0`) erzeugt ein Projektil mit `fuseSeconds > 0`, und genau
   * dieser Wert ist es, den der Renderer zeichnet.
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 6000 });
  match.start();
  const werfer = match.getState().entities.find(e => e.teamId === 0);
  // Die Zündgranate in den Bestand legen (mit Munition) und schießen.
  match.inventory.grantWeapon(werfer.entityId, 'pa_144', { ammo: 2 });
  match.inventory.selectWeapon(werfer.entityId, 'pa_144');
  const schuss = match.fire(werfer.entityId, Math.PI / 4, 60, 'pa_144');
  assert.ok(schuss.ok, `Der Schuss muss angenommen werden: ${JSON.stringify(schuss.errors)}`);

  const zustand = match.getState();
  assert.equal(zustand.projectiles.length, 1, 'Ein Projektil muss unterwegs sein');
  const rest = zustand.projectiles[0].fuseSeconds;
  assert.ok(rest > 0, `Eine Zündgranate (pa_144, fuseTime 5 s) muss einen Rest tragen (war ${rest})`);

  const bytes = encodeSnapshot(zustand, { turnRemainingMs: 1000 });
  const zurueck = decodeSnapshot(bytes);
  assert.equal(
    zurueck.projectiles[0].fuseSeconds, rest,
    'Der Rest muss die Leitung unverändert überstehen (auf 0,1 s gerundet)',
  );
});

test('Die Lesestellen im Client reichen Sidegrad und Höchstleben durch (Wache)', () => {
  /*
   * Die Wache gegen den Rückfall: A1 war „der Leser liest, die Leitung führt
   * nicht". Das Gegenstück — „die Leitung führt, der Leser liest nicht" — ist
   * derselbe stille Fehler. Geprüft wird ohne Kommentare, weil die Kommentare
   * die Sache erklären.
   */
  const quelltext = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src/client/main.js'), 'utf8'));
  assert.match(
    quelltext,
    /sidegradeId:\s*this\.remoteLoadouts\?\.\[entity\.entityId\]\?\.sidegradeId/,
    'Der Ansichtszustand muss den Sidegrad aus der Bestandsnachricht übernehmen',
  );
  assert.match(
    quelltext,
    /maxHealth:\s*this\.remoteLoadouts\?\.\[entity\.entityId\]\?\.maxHealth/,
    'Der Ansichtszustand muss das Höchstleben aus der Bestandsnachricht übernehmen',
  );
  assert.equal(PROTOCOL_VERSION, 8, 'Der Zünderrest kam mit v8');
});
