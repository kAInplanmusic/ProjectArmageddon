import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CONTROL, controlMessage, parseControlMessage } from '../../src/shared/protocol.js';
import {
  starteTestserver,
  stoppeTestserver,
  starteOnlineMatch,
  schneideServernachrichtenMit,
  warteAufEigenenZug,
  hudMeldungen,
} from './helfer/online-match.mjs';

/**
 * SPRUNG UND WAFFE-ABWERFEN IM ONLINE-MATCH — im echten Browser, gegen den echten
 * Server.
 *
 * ## Warum diese Datei nötig war (der Befund, O8)
 *
 * Der Drahtweg ist gebaut: `CONTROL.JUMP` / `CONTROL.DROP_WEAPON`
 * (`src/shared/protocol.js`), `LobbySession#handleJump` / `#handleDropWeapon`
 * (`src/server/gameServer.js`), `NetworkClient#sendJump` / `#sendDropWeapon`
 * (`src/client/networkClient.js`) und die Anzeigezweige `jumped` /
 * `weapon_dropped` (`src/client/ereignisse.js`). Belegt war das bis hierher
 * durch UNIT-Tests gegen einen echten Server (`tests/anti-cheat.test.js`) und
 * durch Replay-Rundläufe — im BROWSER hatte ihn niemand beobachtet. Genau diese
 * Lücke schließt diese Datei: von der Anzeige über den Server bis zur Anzeige,
 * mit mitgeschnittenen Steuernachrichten.
 *
 * ## Was hier gemessen wird
 *
 * Der Beweis läuft über DREI unabhängige Zeugen je Handlung:
 *   1. den RAHMEN auf der Leitung (`routeWebSocket` schneidet die
 *      Server→Client-Nachrichten mit): `jumped` bzw. `weapon_dropped` samt
 *      `playerId`, `weaponId`, `crateId`,
 *   2. den ZUSTAND der Anzeige (Position steigt / Waffe fällt aus dem Bestand /
 *      die Kiste erscheint im Snapshot),
 *   3. die HUD-Zeile im DOM (`#log-list`) — also dass der Spieler es SIEHT.
 *
 * Seed 5: ausgemessen ohne Günther (`plan: []`), damit die Meldungen dieses
 * Tests nicht von NPC-Ereignissen überlagert werden.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = 3229;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SEED = 5;

/*
 * Frist je Test: 120 s statt der Vorgabe von 60 s.
 *
 * Warum das nötig ist: Online läuft die Simulation in ECHTZEIT, die Zugzeit
 * beträgt 30 s, und es gibt keine Bot-KI. Ist die Gegenseite zuerst am Zug und
 * feuert nie, läuft ihre Zeit ab — der eigene Zug kommt also erst nach bis zu
 * 30 s. `warteAufEigenenZug` wartet deshalb bis zu 90 s. Mit der Vorgabe von 60 s
 * wäre diese Geduld gar nicht durchhaltbar: Der Test wäre eher gerissen als die
 * Wartebedingung. Auf diesem Rechner kommt der eigene Zug sofort (der Ersteller
 * sitzt auf Platz 1), gemessen 5–14 s je Test — die Frist ist Reserve.
 */
test.setTimeout(120_000);

let server = null;

test.beforeAll(async () => {
  server = await starteTestserver({ port: SERVER_PORT, repoRoot });
});

test.afterAll(async () => {
  await stoppeTestserver(server?.process);
  server = null;
});

/**
 * Ein Online-Match, in dem der eigene Client AM ZUG ist.
 *
 * Der Ersteller der Lobby sitzt auf Platz 1; der Server setzt die Figurenkennungen
 * in Sitzplatzreihenfolge und beginnt den Zug mit der ersten — der eigene Client
 * ist damit zuerst am Zug. Trotzdem wird GEWARTET statt angenommen: Kommt der
 * Zug nicht, ist der Test rot, nicht still falsch.
 */
async function matchMitEigenemZug(page) {
  const nachrichten = await schneideServernachrichtenMit(page);
  const zweiter = await starteOnlineMatch(page, {
    serverUrl: SERVER_URL, port: SERVER_PORT, seed: SEED, name: 'Zugtester',
  });
  await warteAufEigenenZug(page);
  return { nachrichten, zweiter };
}

test('Der Sprung geht online als Befehl raus und kommt als Ereignis zurück', async ({ page }) => {
  const { nachrichten } = await matchMitEigenemZug(page);

  /*
   * Die Flugbahn wird an den SNAPSHOTS mitgeschrieben, nicht an den Bildern.
   *
   * FUND (belegt, zweiter Lauf dieser Datei): Ein Abtasten je `requestAnimationFrame`
   * maß auf diesem Rechner nur 29 Werte in 8 s — der Browser rastet unter Last mit
   * ~3,6 Bildern je Sekunde, und der Flug (0,9–1,3 s) fiel zwischen zwei Proben.
   * Der Test meldete „nicht gestiegen", obwohl im Verlauf bei y=780 genau ein
   * Ausschlag stand. `getState()` hängt am Zeichnen; die SNAPSHOTS kommen als
   * Netzereignisse und werden auch dann zugestellt, wenn kein Bild fertig wird —
   * 20 je Sekunde, unabhängig von der Bildrate.
   *
   * `NetworkClient#on('snapshot', …)` ist die öffentliche Schnittstelle, über die
   * auch `main.js` den Zustand aufbaut.
   */
  await page.evaluate(() => {
    const api = window.__PA__;
    const net = api.getNetwork();
    const eigen = net.entityId;
    window.__SPUR__ = [];
    net.on('snapshot', snapshot => {
      const figur = (snapshot.entities ?? []).find(e => e.entityId === eigen);
      if (figur) window.__SPUR__.push({ tick: snapshot.tick, y: figur.y });
    });
  });

  const yVorher = await page.evaluate(() => {
    const api = window.__PA__;
    const net = api.getNetwork();
    return api.getState().entities.find(e => e.entityId === net.entityId)?.y ?? null;
  });
  expect(yVorher).toBeGreaterThan(0);

  /*
   * Auf den RUHEZUSTAND warten, BEVOR gesprungen wird.
   *
   * FUND (belegt, dritter Lauf dieser Datei): Der Sprung wurde abgeschickt, kam
   * aber nie als Ereignis zurück — der Server lehnt ihn ab, wenn die Figur noch
   * fällt („In der Luft ist kein erster Sprung möglich"). Beim Matchstart fällt
   * jede Figur ein paar Takte auf den Boden (offline gemessen: 4 Takte), und der
   * eigene Zug beginnt SOFORT — `isMyTurn` ist also wahr, während die Figur noch
   * in der Luft ist.
   *
   * Prüfen kann das online NIEMAND: `__PA__.isGrounded()` liest `game.match`, und
   * das ist online `null` — die Auskunft lautet deshalb immer `false`. Der Test
   * wartet also auf die ruhende Höhe: In zwölf aufeinanderfolgenden Snapshots darf
   * sich y um weniger als 8 px ändern. Das Restzittern der stehenden Figur beträgt
   * gemessen ±2 px (Spanne 5), die Fallstrecke ist ein Vielfaches davon.
   */
  await page.waitForFunction(() => {
    const spur = window.__SPUR__ ?? [];
    if (spur.length < 20) return false;
    const letzte = spur.slice(-12).map(eintrag => eintrag.y);
    return Math.max(...letzte) - Math.min(...letzte) < 8;
  }, null, { timeout: 20_000 });

  /*
   * Der Sprung nimmt denselben Weg wie die Leertaste/der Knopf im HUD — und er
   * wird bis zu DREIMAL versucht.
   *
   * Warum mit Wiederholung: Der Server lehnt einen Sprung ab, solange die Figur
   * fällt („In der Luft ist kein erster Sprung möglich"). Genau diese Lage trat
   * im dritten Lauf dieser Datei ein: `isMyTurn` war wahr, die Figur aber noch
   * nicht gelandet — und der Client kann das online NICHT prüfen, weil
   * `isGrounded()` `game.match` liest und das online `null` ist. Der Test wartet
   * deshalb erst auf die ruhende Höhe (siehe oben) und drückt sonst wie ein
   * Spieler noch einmal. Wie viele Versuche nötig waren, steht im Lauf.
   */
  let rahmen = null;
  let eigeneKennung = null;
  const versuche = [];
  for (let versuch = 1; versuch <= 3 && !rahmen; versuch += 1) {
    const vorher = nachrichten.filter(n => n.t === 'jumped').length;
    const befehl = await page.evaluate(() => {
      const api = window.__PA__;
      const net = api.getNetwork();
      return {
        ergebnis: api.jump(0),
        entityId: net.entityId,
        istAmZug: net.isMyTurn,
        stehtLautDebugApi: api.isGrounded(),
      };
    });
    eigeneKennung = befehl.entityId;

    if (versuch === 1) {
      expect(befehl.ergebnis?.ok, `Der Sprung wurde am Client abgelehnt (am Zug: ${befehl.istAmZug})`).toBe(true);
      expect(befehl.ergebnis?.pending).toBe(true);
      /*
       * Und die Anzeige kann den Bodenkontakt NICHT prüfen: `isGrounded()` liest
       * `game.match`, das online `null` ist. Das steht hier als Zusicherung, weil
       * es die Ursache des Funds oben ist — ein Spieler, der im falschen Moment
       * springt, erfährt online nichts davon, außer dass sich nichts bewegt.
       */
      expect(
        befehl.stehtLautDebugApi,
        'Online meldet der Client Bodenkontakt — dann ist die Begründung oben überholt',
      ).toBe(false);
    }

    // (1) Der Rahmen auf der Leitung.
    const frist = Date.now() + 4000;
    while (!rahmen && Date.now() < frist) {
      rahmen = nachrichten.filter(n => n.t === 'jumped')[vorher] ?? null;
      if (!rahmen) await page.waitForTimeout(100);
    }
    versuche.push({
      versuch,
      clientAntwort: befehl.ergebnis,
      rahmen: Boolean(rahmen),
      serverfehler: nachrichten.filter(n => n.t === 'error').map(n => n.errors ?? n.error),
    });
  }

  if (!rahmen) {
    // Nicht „nicht gefunden", sondern: was der Client zuletzt über sich sagte und
    // WELCHE Rahmen überhaupt ankamen.
    const lage = await page.evaluate(() => {
      const net = window.__PA__.getNetwork();
      return {
        state: net.state,
        isConnected: net.isConnected,
        isMyTurn: net.isMyTurn,
        entityId: net.entityId,
        lastServerError: net.lastServerError,
        messageLog: net.messageLog,
      };
    });
    throw new Error([
      'Kein jumped-Rahmen nach drei Versuchen.',
      `Versuche: ${JSON.stringify(versuche)}`,
      `Lage: ${JSON.stringify(lage)}`,
      `Rahmenarten auf der Leitung: ${JSON.stringify([...new Set(nachrichten.map(n => n.t))])}`,
    ].join('\n'));
  }
  // Der Sprung gehört der EIGENEN Figur — die Kennung kommt aus dem Token, nicht
  // aus einer Nachricht des Clients.
  expect(rahmen.playerId, 'Der Sprung traf die falsche Figur').toBe(eigeneKennung);
  expect(rahmen.double).toBe(false);
  // Der erste Sprung eines Zuges verbraucht einen von zwei.
  expect(rahmen.jumpsLeft).toBe(1);

  /*
   * (2) Der Zustand: die Figur ist wirklich geflogen. Zwei Zuglängen werden
   * abgewartet, damit der ganze Flug im Mitschnitt liegt.
   */
  await page.waitForTimeout(2500);
  const flug = await page.evaluate(() => {
    const spur = window.__SPUR__ ?? [];
    const werte = spur.map(eintrag => eintrag.y);
    return {
      proben: werte.length,
      yTiefst: werte.length > 0 ? Math.min(...werte) : null,
      verlauf: werte.map(y => Math.round(y)).join(' '),
      takte: spur.length > 1 ? spur[spur.length - 1].tick - spur[0].tick : 0,
    };
  });

  expect(
    flug.proben,
    `Zu wenige Snapshots für die Flugbahn (${flug.proben} in ${flug.takte} Takten): ${flug.verlauf}`,
  ).toBeGreaterThanOrEqual(8);
  console.log('[sprung] Flugmessung:', JSON.stringify({ yVorher, ...flug }), 'Versuche:', JSON.stringify(versuche), 'Rahmen:', JSON.stringify(rahmen));
  expect(
    yVorher - flug.yTiefst,
    `Die Figur ist nicht gestiegen (y ${yVorher} → ${flug.yTiefst}; Verlauf: ${flug.verlauf})`,
  ).toBeGreaterThan(30);

  // (3) Die Anzeige meldet es — genau einmal.
  const meldungen = (await hudMeldungen(page)).filter(m => /springt/.test(m.text));
  expect(meldungen.length, 'Keine Sprungmeldung im Protokoll').toBe(1);
  expect(meldungen[0].text).toMatch(/^P\d+ springt$/);
  /*
   * Und die Zeile stand in DIESEM Augenblick in der Liste (`#log-list`) — im
   * Hook synchron mitgelesen, siehe `helfer/online-match.mjs`.
   *
   * Warum nicht `expect(page.locator('#log-list')).toContainText('springt')`:
   * FUND (belegt, erster Lauf dieser Datei) — das Protokoll wird von
   * `landed`-Meldungen überschwemmt (gemessen offline: 172 `landed` in 600 Takten
   * ohne jede Eingabe, ~17 je Sekunde). Die Liste führt 40 Zeilen; die
   * Sprungmeldung fällt damit nach rund zwei Sekunden heraus. Die Abfrage von
   * außen meldete deshalb „springt nicht gefunden", obwohl die Zeile angezeigt
   * worden war. Der Blick im Anzeige-Augenblick ist die belastbare Zusage.
   */
  expect(meldungen[0].imDom, 'Die Meldung stand nicht in der Anzeigeliste').toBe(true);
});

test('Das Abwerfen geht online über den Server und wird gemeldet', async ({ page }) => {
  const { nachrichten } = await matchMitEigenemZug(page);

  // Die Waffenliste MUSS im DOM stehen: Sie liefert die Anzeigeposition, und
  // ihre Reihenfolge ist die Reihenfolge der Zifferntasten.
  await expect.poll(
    () => page.evaluate(() => document.querySelectorAll('#weapon-list .weapon-item').length),
    { timeout: 20_000, message: 'Die Waffenliste steht nicht im DOM' },
  ).toBeGreaterThan(1);

  const vorbereitung = await page.evaluate(() => {
    const api = window.__PA__;
    const zustand = api.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);

    // Anzeigeposition = die Nummer, die in der Zeile steht (1-basiert).
    const zeilen = [...document.querySelectorAll('#weapon-list .weapon-item')].map((el, i) => {
      const beschriftung = el.querySelector('.weapon-name')?.textContent ?? '';
      const nummer = Number((beschriftung.match(/^(\d+)\./) ?? [])[1] ?? i + 1);
      return {
        weaponId: el.dataset.weaponId,
        anzeigePosition: nummer - 1,
        beschriftung,
        // Die Reservewaffe trägt „unbegrenzt" — sie lässt sich NICHT abwerfen.
        ammo: aktiv?.ammo?.[el.dataset.weaponId] ?? null,
      };
    });

    const kandidat = zeilen.find(z => z.weaponId && z.ammo !== 'unbegrenzt');
    return {
      zeilen,
      kandidat: kandidat ?? null,
      entityId: aktiv?.entityId ?? null,
      inventarVorher: aktiv?.inventory ?? [],
      kistenVorher: zustand.crates.map(c => c.entityId),
    };
  });

  expect(vorbereitung.kandidat, `Keine abwerfbare Waffe in der Liste: ${JSON.stringify(vorbereitung.zeilen)}`)
    .not.toBeNull();
  const { kandidat, entityId } = vorbereitung;
  expect(vorbereitung.inventarVorher).toContain(kandidat.weaponId);

  // Abwerfen über den Weg der Anzeige (dieselbe Funktion wie die Q-Taste).
  const ergebnis = await page.evaluate(
    position => window.__PA__.dropWeapon(position),
    kandidat.anzeigePosition,
  );
  expect(ergebnis?.ok, 'Der Abwurf wurde am Client abgelehnt').toBe(true);
  expect(ergebnis?.pending).toBe(true);

  // (1) Der Rahmen auf der Leitung.
  await expect.poll(
    () => nachrichten.filter(n => n.t === 'weapon_dropped').length,
    { timeout: 10_000, message: 'Der Server hat kein weapon_dropped geschickt' },
  ).toBeGreaterThan(0);

  const rahmen = nachrichten.filter(n => n.t === 'weapon_dropped').pop();
  console.log('[abwurf] Rahmen:', JSON.stringify(rahmen), 'Waffe:', JSON.stringify(kandidat));
  expect(rahmen.playerId, 'Der Abwurf traf die falsche Figur').toBe(entityId);
  expect(rahmen.weaponId, 'Der Server hat eine andere Waffe abgeworfen').toBe(kandidat.weaponId);
  expect(rahmen.crateId).toBeGreaterThan(0);
  expect(rahmen.ammo).toBe(kandidat.ammo);

  // (2) Der Zustand: die Kiste des Abwurfs kommt über den Snapshot zurück …
  await expect.poll(
    () => page.evaluate(id => (window.__PA__.getState().crates ?? []).some(c => c.entityId === id), rahmen.crateId),
    { timeout: 15_000, message: 'Die abgeworfene Kiste erscheint nicht im Snapshot' },
  ).toBe(true);

  // … und die Waffe ist aus dem Bestand verschwunden (Servernachricht LOADOUTS).
  await expect.poll(
    () => page.evaluate(
      ({ id, waffe }) => !(window.__PA__.getState().entities
        .find(e => e.entityId === id)?.inventory ?? [waffe]).includes(waffe),
      { id: entityId, waffe: kandidat.weaponId },
    ),
    { timeout: 15_000, message: 'Die Waffe steht weiter im Bestand' },
  ).toBe(true);

  // (3) Die Anzeige meldet es mit Name und Munition.
  const meldungen = (await hudMeldungen(page)).filter(m => /wirft .* ab/.test(m.text));
  expect(meldungen.length, 'Keine Abwurfmeldung im Protokoll').toBe(1);
  expect(meldungen[0].text).toContain(`${kandidat.ammo} Munition`);
  // Im Anzeige-Augenblick mitgelesen — Begründung siehe Sprungtest.
  expect(meldungen[0].imDom, 'Die Meldung stand nicht in der Anzeigeliste').toBe(true);
});

test('Ein fremder Sprung wird abgelehnt und erzeugt kein Ereignis', async ({ page }) => {
  /*
   * Die Gegenprobe zum ersten Test — sonst könnte das `jumped` dort auch von
   * irgendeinem Sprung stammen. Der ZWEITE MENSCH schickt hier denselben
   * Befehl, während der eigene Client am Zug ist: Der Motor gehört der aktiven
   * Figur, der Server lehnt ab.
   *
   * Gemessen wird beides: die Ablehnung (CONTROL.ERROR an den Absender) UND dass
   * auf der Leitung KEIN `jumped` entsteht.
   */
  const { nachrichten, zweiter } = await matchMitEigenemZug(page);

  const antworten = [];
  zweiter.on('message', roh => {
    const nachricht = parseControlMessage(roh);
    if (nachricht) antworten.push(nachricht);
  });

  // Fremder Sprung über EXAKT denselben Nachrichtentyp.
  zweiter.send(controlMessage(CONTROL.JUMP, { seitlich: 0 }));

  await expect.poll(
    () => antworten.filter(n => n.t === CONTROL.ERROR).length,
    { timeout: 10_000, message: 'Der Server hat den fremden Sprung nicht abgelehnt' },
  ).toBeGreaterThan(0);

  const fehler = antworten.filter(n => n.t === CONTROL.ERROR).pop();
  expect(fehler.errors?.join(' ') ?? fehler.error ?? '').toMatch(/aktive Spieler/i);

  // Und keine Wirkung: kein Sprung-Ereignis, nirgends.
  expect(
    nachrichten.filter(n => n.t === 'jumped').length,
    'Ein abgelehnter Sprung hat trotzdem ein jumped erzeugt',
  ).toBe(0);
});
