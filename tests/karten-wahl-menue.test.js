/**
 * Menü, Lobby und Protokoll für `kolossal` und die drei runden Kartenarten (Geländefassung 14, TODO N-40).
 *
 * (1) Reine Regeln (`engine/kartenWahl.js`): kolossal nur auf 1:1, sonst riesig; Sperre/Warnung nach Gerät; iOS-Erkennung.
 * (2) Menülogik (`client/kartenWahlMenue.js`) mit einem kleinen Ersatz-DOM: Option sperren, Format auf 1:1 ziehen, Hinweis, Startwerte.
 * (3) Server: Lobby und HTTP prüfen beide Angaben; Unbekanntes fällt definiert zurück (Größe `mittel`, Kartenart `null`).
 * (4) Die Lobby-Werte ergeben im echten Match 5760² samt gewählter runder Art.
 *
 * Optik und Bedienung am Gerät (iPhone, Touch) sind damit NICHT geprüft; siehe E2E `karten-wahl.spec.mjs` und die offene Sichtabnahme.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LobbyManager } from '../src/server/lobby.js';
import { MatchController } from '../src/engine/match.js';
import { KARTENARTEN_RUND } from '../src/shared/config/gelaende.js';
import {
  FORMAT_QUADRAT, KOLOSSAL_PIXEL, RUNDE_ARTEN_MENUE, istIos, istRundeKartenart, pruefeKolossal, wirksameGroesse,
} from '../src/engine/kartenWahl.js';
import { kartenWahlZustand, leseKartenWahl, verdrahteKartenWahl, zeigeKartenWahl } from '../src/client/kartenWahlMenue.js';
import { erstelleLobby, starteServer, trittBei } from './helfer/server-testclient.js';

/** Ersatz-DOM: Felder mit value/options/setAttribute/addEventListener, genau was das Menümodul braucht. */
function baueDom({ groesse = 'gross', format = '24:9', kartenart = '' } = {}) {
  const feld = (id, wert, optionen = []) => {
    const hoerer = {};
    return {
      id, value: wert, hidden: false, textContent: '', dataset: {}, attrs: {},
      options: optionen.map(o => ({ value: o, textContent: o, disabled: false, dataset: {} })),
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(art, f) { (hoerer[art] ??= []).push(f); },
      ausloesen(art) { for (const f of hoerer[art] ?? []) f(); },
    };
  };
  const felder = {
    'cfg-kartengroesse': feld('cfg-kartengroesse', groesse, ['klein', 'gross', 'riesig', 'kolossal']),
    'cfg-kartenformat': feld('cfg-kartenformat', format, ['24:9', '16:9', '1:1']),
    'cfg-kartenart': feld('cfg-kartenart', kartenart, ['', 'ebenen', ...KARTENARTEN_RUND]),
    'cfg-kartenwahl-hinweis': feld('cfg-kartenwahl-hinweis', ''),
    'cfg-grafik': feld('cfg-grafik', 'auto'),
  };
  return { felder, getElementById: id => felder[id] ?? null };
}
const ULTRA = { ios: false, flaechenBudgetMio: 14 };
const LITE = { ios: false, flaechenBudgetMio: 3.7 };
const IOS = { ios: true, flaechenBudgetMio: 14 };

test('wirksameGroesse: kolossal nur auf 1:1, sonst riesig; Unbekanntes wird mittel', () => {
  assert.equal(wirksameGroesse('kolossal', FORMAT_QUADRAT), 'kolossal');
  for (const f of ['24:9', '16:9', '4:3', '3:4', '9:16', '9:24', 'quark', null]) assert.equal(wirksameGroesse('kolossal', f), 'riesig', String(f));
  assert.equal(wirksameGroesse('gross', '16:9'), 'gross');
  assert.equal(wirksameGroesse('krieg', '1:1'), 'krieg');
  for (const g of ['xl', '', null, undefined, 5, {}]) assert.equal(wirksameGroesse(g, '1:1'), 'mittel', String(g));
});

test('pruefeKolossal: iOS und Lite gesperrt, Ultra mit Warnung, Budget ab 33,2 Mio. frei; jeder Fall nennt den Grund', () => {
  assert.equal(KOLOSSAL_PIXEL, 5760 * 5760);
  const ios = pruefeKolossal(IOS);
  assert.equal(ios.status, 'gesperrt');
  assert.match(ios.grund, /iPhone und iPad/);
  assert.match(ios.grund, /16,7 Mio/);
  const lite = pruefeKolossal(LITE);
  assert.equal(lite.status, 'gesperrt');
  assert.match(lite.grund, /Lite/);
  assert.match(lite.grund, /3,7 Mio/);
  const ultra = pruefeKolossal(ULTRA);
  assert.equal(ultra.status, 'warnung');
  assert.match(ultra.grund, /sehr groß/);
  assert.equal(pruefeKolossal({ ios: false, flaechenBudgetMio: 34 }).status, 'frei');
  // Unbekanntes Budget (Messung fehlt) sperrt nicht; iOS sperrt immer, auch bei großem Budget.
  assert.equal(pruefeKolossal({ ios: false, flaechenBudgetMio: null }).status, 'frei');
  assert.equal(pruefeKolossal({ ios: true, flaechenBudgetMio: 100 }).status, 'gesperrt');
  assert.equal(pruefeKolossal().status, 'frei');
});

test('istIos erkennt iPhone, iPad und iPadOS (Mac mit Touch); Desktop und Android nicht', () => {
  assert.equal(istIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(istIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' }), true);
  assert.equal(istIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(istIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(istIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
  assert.equal(istIos(null), false);
});

test('Runde Arten: Menüliste deckt KARTENARTEN_RUND genau ab, deutsche Namen', () => {
  assert.deepEqual(RUNDE_ARTEN_MENUE.map(a => a.wert), [...KARTENARTEN_RUND]);
  for (const a of RUNDE_ARTEN_MENUE) assert.ok(/[A-Za-zÄÖÜäöü]{4}/.test(a.name) && !/[a-z][A-Z]/.test(a.name), a.name);
  assert.equal(istRundeKartenart('rundPlanet'), true);
  assert.equal(istRundeKartenart('insel'), false);
  assert.equal(istRundeKartenart(null), false);
});

test('Zustand: Hinweise nach Wahl (Sperre immer, Warnung nur bei gewähltem kolossal, Formathinweise)', () => {
  const z = (o) => kartenWahlZustand({ groesse: 'gross', format: '1:1', kartenart: '', geraet: ULTRA, ...o });
  assert.deepEqual(z({}).hinweise, []);
  assert.equal(z({ groesse: 'kolossal' }).hinweise.length, 1);
  assert.match(z({ groesse: 'kolossal' }).hinweise[0], /sehr groß/);
  assert.match(z({ groesse: 'kolossal', format: '16:9' }).hinweise.join(' '), /„Riesig“ gespielt/);
  assert.match(z({ kartenart: 'rundPlanet', format: '16:9' }).hinweise.join(' '), /Format 1:1/);
  assert.deepEqual(z({ kartenart: 'rundPlanet' }).hinweise, []);
  assert.match(z({ geraet: IOS }).hinweise[0], /iPhone/);
});

test('Menü: Option kolossal wird gesperrt (iOS/Lite), mit Warnung freigegeben (Ultra); gewähltes kolossal fällt auf riesig', () => {
  const dom = baueDom({ groesse: 'kolossal', format: '1:1' });
  const opt = dom.felder['cfg-kartengroesse'].options.find(o => o.value === 'kolossal');
  zeigeKartenWahl(dom, ULTRA);
  assert.equal(opt.disabled, false);
  assert.equal(dom.felder['cfg-kartenwahl-hinweis'].hidden, false);
  assert.match(dom.felder['cfg-kartenwahl-hinweis'].textContent, /sehr groß/);
  assert.equal(dom.felder['cfg-kartenwahl-hinweis'].dataset.stufe, 'warnung');
  zeigeKartenWahl(dom, IOS);
  assert.equal(opt.disabled, true);
  assert.match(opt.textContent, /\(gesperrt\)$/);
  assert.equal(dom.felder['cfg-kartengroesse'].value, 'riesig');
  assert.equal(dom.felder['cfg-kartenwahl-hinweis'].dataset.stufe, 'gesperrt');
  zeigeKartenWahl(dom, ULTRA);
  assert.equal(opt.disabled, false);
  assert.equal(opt.textContent, 'kolossal', 'Beschriftung ohne Doppelzusatz zurück');
  // Reicht das Budget für 33,2 Mio. Pixel, ist die Option frei und der Hinweis leer.
  const frei = baueDom({ groesse: 'kolossal', format: '1:1' });
  zeigeKartenWahl(frei, { ios: false, flaechenBudgetMio: 34 });
  assert.equal(frei.felder['cfg-kartengroesse'].options.find(o => o.value === 'kolossal').disabled, false);
  assert.equal(frei.felder['cfg-kartenwahl-hinweis'].hidden, true);
  assert.equal(frei.felder['cfg-kartengroesse'].value, 'kolossal');
});

test('Menü verdrahtet: kolossal und runde Art ziehen das Format auf 1:1; ohne WebGL (Lite) bleibt kolossal gesperrt', () => {
  const win = { navigator: { userAgent: 'x' } };
  const dom = baueDom();
  verdrahteKartenWahl(dom, win);
  const f = dom.felder;
  for (const id of ['cfg-kartengroesse', 'cfg-kartenformat', 'cfg-kartenart']) assert.equal(f[id].attrs['aria-describedby'], 'cfg-kartenwahl-hinweis');
  // Die Ersatz-Umgebung hat kein WebGL2 → Lite → kolossal gesperrt, Grund steht im Hinweis.
  assert.equal(f['cfg-kartengroesse'].options.find(o => o.value === 'kolossal').disabled, true);
  assert.match(f['cfg-kartenwahl-hinweis'].textContent, /Lite/);
  f['cfg-kartenart'].value = 'rundeHoehle';
  f['cfg-kartenart'].ausloesen('change');
  assert.equal(f['cfg-kartenformat'].value, '1:1');
  assert.match(f['cfg-kartenwahl-hinweis'].textContent, /Format auf 1:1 gestellt, weil die runde Karte nur dort gilt/);
  f['cfg-kartenformat'].value = '16:9';
  f['cfg-kartenformat'].ausloesen('change');
  assert.match(f['cfg-kartenwahl-hinweis'].textContent, /Format 1:1 gebaut/);
});

test('leseKartenWahl: Startwerte für das Protokoll (Größe wirksam, Kartenart leer = null, gesperrte Option wird riesig)', () => {
  const dom = baueDom({ groesse: 'kolossal', format: '1:1', kartenart: 'schwebendeInsel' });
  assert.deepEqual(leseKartenWahl(dom), { mapSize: 'kolossal', mapFormat: '1:1', kartenart: 'schwebendeInsel' });
  dom.felder['cfg-kartenformat'].value = '16:9';
  assert.equal(leseKartenWahl(dom).mapSize, 'riesig');
  dom.felder['cfg-kartenformat'].value = '1:1';
  dom.felder['cfg-kartengroesse'].options.find(o => o.value === 'kolossal').disabled = true;
  assert.equal(leseKartenWahl(dom).mapSize, 'riesig');
  dom.felder['cfg-kartenart'].value = '';
  assert.equal(leseKartenWahl(dom).kartenart, null);
  assert.deepEqual(leseKartenWahl({ getElementById: () => null }), { mapSize: 'mittel', mapFormat: '16:9', kartenart: null });
});

test('Lobby: kolossal nur auf 1:1, runde Arten bleiben, Unbekanntes fällt zurück (mittel / null); Zugzeit wie riesig', () => {
  const lobbies = new LobbyManager();
  // `create` liefert die öffentliche Beschreibung (ohne Kartenart); die gespeicherte Lobby trägt sie.
  const erzeuge = (opt) => lobbies.get(lobbies.create({ teams: 2, ...opt }).lobby.id);
  const a = erzeuge({ mapFormat: '1:1', mapSize: 'kolossal', kartenart: 'rundPlanet' });
  assert.equal(a.mapSize, 'kolossal');
  assert.equal(a.mapFormat, '1:1');
  assert.equal(a.kartenart, 'rundPlanet');
  assert.equal(lobbies.create({ mapFormat: '1:1', mapSize: 'kolossal' }).lobby.turnDurationMs, 55_000);
  const b = erzeuge({ mapFormat: '16:9', mapSize: 'kolossal' });
  assert.equal(b.mapSize, 'riesig');
  assert.equal(lobbies.create({ mapFormat: '16:9', mapSize: 'kolossal' }).lobby.turnDurationMs, 55_000);
  for (const art of KARTENARTEN_RUND) assert.equal(erzeuge({ mapFormat: '1:1', kartenart: art }).kartenart, art);
  for (const roh of ['kreis', '', 'RUNDPLANET', 7, {}, [], true]) assert.equal(erzeuge({ kartenart: roh }).kartenart, null, String(roh));
  for (const roh of ['kolosal', 'KOLOSSAL', '', 5, {}, null]) assert.equal(erzeuge({ mapFormat: '1:1', mapSize: roh }).mapSize, 'mittel', String(roh));
});

test('HTTP und WebSocket: kolossal und runde Arten kommen im WELCOME an; Unbekanntes fällt zurück', async () => {
  const { server, url, wsUrl, lobbyManager } = await starteServer();
  const clients = [];
  try {
    const sende = async (body) => {
      const { lobby } = await erstelleLobby(url, body);
      return { beschreibung: lobby, gespeichert: lobbyManager.get(lobby.id) };
    };
    const ok = await sende({ mapFormat: '1:1', mapSize: 'klein', kartenart: 'schwebendeInsel' });
    assert.deepEqual([ok.beschreibung.mapFormat, ok.gespeichert.kartenart], ['1:1', 'schwebendeInsel']);
    // Das Protokoll: der Beitritt liefert Kartenart, Format und Stufe an den Client (kolossal selbst baut den Test nicht auf, 33 Mio. px).
    const beitritt = await trittBei(wsUrl, ok.beschreibung.id, { name: 'Host' });
    clients.push(beitritt.client);
    assert.equal(beitritt.welcome.kartenart, 'schwebendeInsel');
    assert.equal(beitritt.welcome.mapFormat, '1:1');
    assert.equal(beitritt.welcome.mapSize, 'klein');
    const gross = await sende({ mapFormat: '1:1', mapSize: 'kolossal' });
    assert.equal(gross.beschreibung.mapSize, 'kolossal');
    assert.equal(gross.beschreibung.turnDurationMs, 55_000);
    const quer = await sende({ mapFormat: '24:9', mapSize: 'kolossal' });
    assert.equal(quer.beschreibung.mapSize, 'riesig');
    const muell = await sende({ mapFormat: '1:1', mapSize: 123, kartenart: { x: 1 } });
    assert.equal(muell.beschreibung.mapSize, 'mittel');
    assert.equal(muell.gespeichert.kartenart, null);
    const fremd = await sende({ mapFormat: '1:1', mapSize: 'gigantisch', kartenart: 'rundWuerfel' });
    assert.equal(fremd.beschreibung.mapSize, 'mittel');
    assert.equal(fremd.gespeichert.kartenart, null);
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
});

test('Lobby-Werte ergeben im echten Match 5760² mit der gewählten runden Art', () => {
  const lobbies = new LobbyManager();
  const lobby = lobbies.get(lobbies.create({ teams: 2, playersPerTeam: 1, seed: 4242, mapFormat: '1:1', mapSize: 'kolossal', kartenart: 'rundPlanet' }).lobby.id);
  const match = new MatchController({
    seed: lobby.seed, teams: lobby.teams, playersPerTeam: lobby.playersPerTeam, preset: lobby.preset, kartentyp: lobby.kartentyp ?? null,
    orientation: lobby.orientation, format: lobby.mapFormat, groesse: lobby.mapSize, kartenart: lobby.kartenart,
  });
  assert.equal(match.width, 5760);
  assert.equal(match.height, 5760);
  assert.equal(match.kartenart, 'rundPlanet');
});
