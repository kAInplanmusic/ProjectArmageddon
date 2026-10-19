/**
 * Tests zu den verifizierten Befunden aus docs/audit-2026-10-09/01-verifizierte-befunde.md.
 *
 * Jeder Test ist der Wächter für genau einen Befund. Die Datei wächst mit jedem
 * Fix; die Reihenfolge folgt der Schwere im Audit (A vor B vor C).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInput } from '../src/shared/validation.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';
import { MatchController } from '../src/engine/match.js';
import { hashState } from '../src/engine/stateSnapshot.js';
import { serializeLobby, restoreLobby } from '../src/server/persistence.js';
import { LobbyManager } from '../src/server/lobby.js';
import {
  erzeugePartikel,
  erzeugeBlitz,
  schreitePartikelFort,
  schreiteEffekteFort,
} from '../src/client/effects.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const validationQuelle = ohneKommentare(
  fs.readFileSync(path.join(ROOT, 'src', 'shared', 'validation.js'), 'utf8')
);

const gameServerQuelle = ohneKommentare(
  fs.readFileSync(path.join(ROOT, 'src', 'server', 'gameServer.js'), 'utf8')
);

const mainQuelle = ohneKommentare(
  fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8')
);

test('B-1: Die Winkelprüfung hängt nicht an der clientValidatedInputs-Liste', () => {
  // Verhalten: Ein ungültiger Winkel wird abgelehnt, ein gültiger angenommen.
  assert.equal(normalizeInput({ angle: 9, power: 50 }).valid, false);
  assert.equal(normalizeInput({ angle: 1, power: 50 }).valid, true);

  // Quelltext-Wächter: Die Prüfung muss bedingungslos laufen. Die doppelte
  // Verneinung (`!includes('angle') === false`) schaltete die Validierung genau
  // dann ab, wenn der Client die Prüfung NICHT übernahm — eine stille
  // Sicherheitslücke, die auf einer Zeichensetzung beruhte.
  assert.ok(
    validationQuelle.includes('if (!isValidAngle(angle))'),
    'Die Winkelprüfung muss bedingungslos laufen (if (!isValidAngle(angle)))'
  );
  assert.ok(
    !validationQuelle.includes("clientValidatedInputs.includes('angle')"),
    'Die Winkelprüfung darf nicht an der clientValidatedInputs-Liste hängen'
  );
});

test('A-2: dropWeapon lehnt Spieler ab, die nicht am Zug sind, und verbraucht keinen Zufall', () => {
  /*
   * Audit-Befund: `dropWeapon` prüfte nur Match-Status und Lebenszeichen, nicht
   * den aktiven Spieler. Ein Spieler, der nicht am Zug ist, konnte Kisten werfen
   * und dabei den gemeinsamen Zufallsstrom konsumieren — ein Determinismus-Bruch,
   * kein Komfortproblem.
   *
   * Der Test fährt zwei identische Matches: Im ersten wird der verbotene Abwurf
   * versucht (und muss abgelehnt werden), im zweiten nicht. Danach schießt in
   * beiden der aktive Spieler mit denselben Werten. Stimmen die Zustandshashes
   * überein, wurde kein Zufall verbraucht.
   */
  const seed = 4242;
  const winkel = 1.1;
  const kraft = 60;

  const matchMitVersuch = new MatchController({ seed, teams: 2, playersPerTeam: 2 });
  matchMitVersuch.start();
  const aktiver = matchMitVersuch.activePlayerId;
  const anderer = matchMitVersuch.getState().entities
    .find(entity => entity.entityId !== aktiver && entity.alive);

  const abgelehnt = matchMitVersuch.dropWeapon(anderer.entityId, anderer.activeWeaponId);
  assert.equal(abgelehnt.ok, false, 'Ein Spieler, der nicht am Zug ist, darf nicht abwerfen');
  assert.ok(
    abgelehnt.errors.some(fehler => fehler.includes('aktive Spieler')),
    `Fehlermeldung muss den aktiven Spieler nennen: ${abgelehnt.errors.join(', ')}`
  );

  const schussMitVersuch = matchMitVersuch.fire(aktiver, winkel, kraft);
  assert.equal(schussMitVersuch.ok, true);

  const matchOhneVersuch = new MatchController({ seed, teams: 2, playersPerTeam: 2 });
  matchOhneVersuch.start();
  const schussOhneVersuch = matchOhneVersuch.fire(matchOhneVersuch.activePlayerId, winkel, kraft);
  assert.equal(schussOhneVersuch.ok, true);

  assert.equal(
    hashState(matchMitVersuch.getState()),
    hashState(matchOhneVersuch.getState()),
    'Der abgelehnte Abwurf hat den Zufallsstrom verbraucht — die Partien laufen auseinander'
  );
});

test('A-3: Persistenz erhält teamId und figureIndex je Sitz über den Roundtrip', () => {
  /*
   * Audit-Befund: `serializeLobby` speicherte je Sitz nur seatIndex, name, token,
   * entityId und connected. `teamId` und `figureIndex` fehlten — nach einer
   * Wiederherstellung war die Zuordnung Sitz -> Team -> Figur zerrissen, und die
   * Teamvergabe (`alleTeamsBesetzt`) fand keine echte Team-Nummer mehr.
   */
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, playersPerTeam: 2, preset: 'hills', hostName: 'Host' });

  // So vergibt die Lobby die Felder im echten Betrieb.
  lobby.seats[0].teamId = 0;
  lobby.seats[0].figureIndex = 1;
  lobby.seats[1].teamId = 0;
  lobby.seats[1].figureIndex = 0;

  const serialized = serializeLobby(lobby, null);
  assert.equal(serialized.seats[0].teamId, 0, 'teamId muss gespeichert werden');
  assert.equal(serialized.seats[0].figureIndex, 1, 'figureIndex muss gespeichert werden');
  assert.equal(serialized.seats[1].teamId, 0);
  assert.equal(serialized.seats[1].figureIndex, 0);

  const restored = restoreLobby(serialized, {
    lobbyManager: new LobbyManager(),
    createSession: () => null,
  });
  assert.equal(restored.lobby.seats[0].teamId, 0, 'teamId muss den Roundtrip überleben');
  assert.equal(restored.lobby.seats[0].figureIndex, 1, 'figureIndex muss den Roundtrip überleben');
  assert.equal(restored.lobby.seats[1].teamId, 0);
  assert.equal(restored.lobby.seats[1].figureIndex, 0);
});

test('A-1: Jeder Socket bekommt einen error-Handler, die Nutzlast ist begrenzt', () => {
  /*
   * Audit-Befund (PROVEN): Der Server registrierte nur `message` und `close` am
   * Socket. Ein Protokollfehler (4 Bytes ungültiges UTF-8) emittiert `error` —
   * ohne Listener eine unbehandelte Ausnahme, die den GESAMTEN Spielserver
   * beendet. Zusätzlich galt der ws-Standard `maxPayload` von 100 MiB, bevor die
   * 512-Byte-Prüfung greift.
   *
   * Der Quelltext-Wächter erzwingt beides. Der Live-Beweis (Server-Prozess +
   * 4 Bytes) würde im Testprozess selbst crashen und bleibt der Audit-Sonde
   * vorbehalten.
   */
  assert.ok(
    gameServerQuelle.includes("socket.on('error'"),
    'Jeder Socket braucht einen error-Handler, sonst beenden 4 Bytes den Server'
  );
  assert.ok(
    gameServerQuelle.includes('maxPayload'),
    'maxPayload muss gesetzt sein, damit nicht 100 MiB gepuffert werden, bevor die 512-Byte-Prüfung greift'
  );
});

test('B-2: Wasser wird in jedem Bild gezeichnet, nicht nur in jedem vierten', () => {
  /*
   * Audit-Befund: `waterFrame = (waterFrame + 1) % 4` lieferte das Wasser nur in
   * jedem vierten Bild an den Renderer. Da der Bildschirm jeden Frame geleert
   * wird, war Wasser in drei von vier Bildern unsichtbar (Flackern).
   */
  assert.ok(
    !mainQuelle.includes('waterFrame'),
    'Die waterFrame-Drosselung muss weg — Wasser gehört in jedes Bild'
  );
  assert.ok(
    mainQuelle.includes("water: this.mode === 'online' ? null : this.match.water"),
    'Der Renderer muss das Wasser in jedem Bild bekommen'
  );
});

test('B-3: Effekte und Partikel altern nach Zeitschritt, nicht nach Bild', () => {
  /*
   * Audit-Befund: Die Simulation ist bildratenunabhängig (fester Zeitschritt),
   * die Darstellung nicht: `this.time += 1`, Partikel und Effekte alterten je
   * gezeichnetem Frame. Auf 144 Hz liefen sie 2,4-mal so schnell wie auf 60 Hz.
   *
   * Der Verhaltenstest prüft die Skalierung: Ein doppelter Zeitschritt altert
   * doppelt, ein halber halb. Der Quelltext-Wächter erzwingt, dass der Zeitschritt
   * tatsächlich durchgereicht wird.
   */
  const partikel = erzeugePartikel(0, 0, 40);
  const einSchritt = schreitePartikelFort(partikel, 1);
  const zweiSchritte = schreitePartikelFort(partikel, 2);
  assert.ok(Math.abs(einSchritt[0].life - (1 - 0.035)) < 1e-9, `life nach 1 Schritt: ${einSchritt[0].life}`);
  assert.ok(Math.abs(zweiSchritte[0].life - (1 - 2 * 0.035)) < 1e-9, `life nach 2 Schritten: ${zweiSchritte[0].life}`);
  assert.ok(Math.abs(zweiSchritte[0].x - (0 + 2 * einSchritt[0].vx)) < 1e-9, 'Bewegung skaliert mit dt');

  const blitz = erzeugeBlitz(0, 0, 10);
  const halb = schreiteEffekteFort([blitz], 0.5);
  assert.ok(Math.abs(halb[0].life - (1 - 0.09 * 0.5)) < 1e-9, `Effekt-Life nach 0,5: ${halb[0].life}`);

  const effectsQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'client', 'effects.js'), 'utf8')
  );
  const rendererQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'client', 'renderer.js'), 'utf8')
  );
  assert.ok(effectsQuelle.includes('schreitePartikelFort(partikel, dt'), 'Partikel-Fortschritt braucht dt');
  assert.ok(effectsQuelle.includes('schreiteEffekteFort(effekte, dt'), 'Effekt-Fortschritt braucht dt');
  assert.ok(rendererQuelle.includes('this.time += dt'), 'Renderer-Zeit muss mit dt laufen');
  assert.ok(mainQuelle.includes('this.#render(delta / FIXED_TIMESTEP)'), 'main.js muss dt als Simulationsschritte übergeben');
});

test('C-1b: Die Zustandsdatei mit Spieler-Tokens ist nur für den Owner lesbar', () => {
  /*
   * Audit-Befund: Spieler-Tokens lagen im Klartext in `.pa-state/lobbies.json`.
   * Ein echtes Hashing wäre eine Formatänderung; die sofortige Vorsorge ist die
   * Dateiberechtigung 0600 beim atomaren Schreiben (temp + rename). Damit liest
   * nur der Server-Prozess-Eigentümer die Tokens.
   */
  const persistenceQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'server', 'persistence.js'), 'utf8')
  );
  assert.ok(
    persistenceQuelle.includes('mode: 0o600'),
    'writeFileSync muss die Zustandsdatei mit mode 0o600 schreiben'
  );
});

test('A-10: Ein abgelehnter Online-Beitritt führt ins Menü zurück', () => {
  /*
   * Befundregister A-10: Lehnte der Server den Beitritt ab (Lobby voll, läuft
   * schon), blieb das Menü geschlossen und der Spieler sah nur eine
   * Protokollzeile — kein Rückweg außer Neuladen. Der Fix: Solange kein
   * `joined` eingetroffen ist, behandelt der `server_error`-Zweig den Fehler
   * als Beitrittsfehler und räumt über `#verlasseMatch()` auf (Menü wieder da,
   * Abbruchknopf aus, Verbindung getrennt).
   */
  assert.ok(
    mainQuelle.includes("if (!beigetreten && this.mode === 'online')"),
    'Der server_error-Zweig muss ungejoint Beitrittsfehler erkennen'
  );
  assert.ok(
    mainQuelle.includes('this.#verlasseMatch();'),
    'Der Beitrittsfehler muss über #verlasseMatch() ins Menü zurückführen'
  );
});

test('A-14: Ein verworfener Zustandstakt wird gemeldet, nicht verschwiegen', () => {
  /*
   * Befundregister A-14: `decodeSnapshot -> null -> return` ergab ein schwarzes
   * Bild ohne Meldung. Der Fix (Datenfluss-Audit) emittiert `snapshot_rejected`
   * mit Grund, Version und Bytezahl; main.js schreibt die erste Zeile ins
   * Protokoll. Der Wächter hält fest, dass dieser Pfad bleibt.
   */
  const networkClientQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'client', 'networkClient.js'), 'utf8')
  );
  assert.ok(
    networkClientQuelle.includes("this.#emit('snapshot_rejected'"),
    'Ein verworfener Zustandstakt muss snapshot_rejected emittieren'
  );
});

test('3.4: Der Build liefert keine Sourcemap aus', () => {
  /*
   * Auftragswarteschlange 3.4: Die Sourcemap lag mit ~2 MB im dist/. Sie ist
   * ein Entwicklungs-Artefakt und gehört nicht in die Auslieferung.
   */
  const viteQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'vite.config.mjs'), 'utf8')
  );
  assert.ok(
    viteQuelle.includes('sourcemap: false'),
    'vite.config.mjs muss sourcemap: false setzen'
  );
});

test('2.4: Ein Geschoss am Kartenrand wird gemeldet, nicht still entfernt', () => {
  /*
   * Auftragswarteschlange 2.4: Verließ ein Geschoss die Karte, wurde es still
   * entfernt — anders als der Zeitablauf, der sichtbar detoniert. Der
   * outOfBounds-Zweig kennzeichnet das Ereignis jetzt mit `grund: 'kartenrand'`,
   * und der Client meldet genau diesen Fall im Protokoll.
   */
  const projectileSystemQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'engine', 'systems', 'projectileSystem.js'), 'utf8')
  );
  const ereignisseQuelle = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'client', 'ereignisse.js'), 'utf8')
  );
  assert.ok(
    projectileSystemQuelle.includes("grund: 'kartenrand'"),
    'Der outOfBounds-Zweig muss das Ereignis als Kartenrand kennzeichnen'
  );
  assert.ok(
    ereignisseQuelle.includes('projectile_expired: beide('),
    'Der Client braucht einen projectile_expired-Zweig'
  );
  assert.ok(
    ereignisseQuelle.includes("n.grund === 'kartenrand'"),
    'Der Client muss den Kartenrand-Fall melden'
  );
});

test('C-6/2.5: Keine Gegenwarts-Aussage behauptet eine Bot-KI', () => {
  /*
   * Befundregister C-6 / Warteschlange 2.5: Zwei Kommentare beschrieben die
   * GEGENWART mit einer Bot-KI, die es seit 2026-09-20 nicht mehr gibt
   * (shotPrediction.js). Historische Belege („die Bot-KI ist entfallen")
   * bleiben stehen; Gegenwarts-Aussagen werden korrigiert.
   */
  const shotPredictionQuelle = fs.readFileSync(
    path.join(ROOT, 'src', 'client', 'shotPrediction.js'), 'utf8'
  );
  assert.ok(
    !shotPredictionQuelle.includes('und die Bot-KI'),
    'shotPrediction.js darf die Bot-KI nicht als gegenwärtige Leserin nennen'
  );
  assert.ok(
    !shotPredictionQuelle.includes('die Bot-KI (Server)'),
    'shotPrediction.js darf die Bot-KI nicht als gegenwärtigen Nutzer nennen'
  );
});
