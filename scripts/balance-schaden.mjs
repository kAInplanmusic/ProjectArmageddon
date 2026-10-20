#!/usr/bin/env node
/**
 * Wirksamkeit der Schadensarten (`npm run balance:schaden`).
 *
 * Misst je Schadensart, je Fassung von `config.schaden`:
 *   - Gesamtschaden über drei Züge des Opfers (Schuss + Schaden über Zeit), im Mittel über alle
 *     Waffen der Art, die im Messaufbau treffen, und getrennt nach Klasse des Opfers
 *   - Anteil des Schadens über Zeit am Gesamtschaden
 *   - Zeit bis zum Kill (Schützenzüge), wenn der Schütze jeden Zug dieselbe Waffe feuert
 *   - Stapel-Exploit: höchster Schaden über Zeit je Zug und ausgesetzte Züge bei Dauerbeschuss
 *
 * Aufbau: zwei Figuren, 30 px Abstand, offene Karte, Seed 31337 — derselbe Aufbau wie die
 * Goldwert-Tests. Das Opfer hat zum Messen 1000 Leben (kein vorzeitiger Tod); die Zeit bis zum
 * Kill rechnet mit dem echten Leben der Klasse.
 *
 *   node scripts/balance-schaden.mjs [--fassung=1|2] [--json] [--schnell]
 */
import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { SCHADEN_ALT, SCHADEN_STATUS } from '../src/shared/config/schaden.js';
import { buildEffect, elementalEffectFor, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const KLASSEN = ['scout', 'heavy', 'artillery'];
const SEED = 31337;
const OPFER_LEBEN = 1000;

function neuesMatch(fassung, opferKlasse = null, extra = {}) {
  const probe = new MatchController({ seed: SEED, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, schaden: fassung });
  probe.start();
  const schuetzeIndex = probe.getState().entities.findIndex(e => e.entityId === probe.activePlayerId);
  const loadouts = opferKlasse
    ? [0, 1].map(i => ({ classId: i === schuetzeIndex ? 'heavy' : opferKlasse, archetypeId: 'brawler' }))
    : null;
  const match = new MatchController({
    seed: SEED, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, schaden: fassung,
    ...(loadouts ? { loadouts } : {}), ...extra,
  });
  match.start();
  const schuetze = match.activePlayerId;
  const opfer = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const boden = match.surfaceYAt(300);
  match.world.setComponent(schuetze, 'Position', 'x', 300);
  match.world.setComponent(schuetze, 'Position', 'y', boden - 12);
  match.world.setComponent(opfer, 'Position', 'x', 330);
  match.world.setComponent(opfer, 'Position', 'y', boden - 12);
  return { match, schuetze, opfer };
}

function schiesse(match, schuetze, id) {
  match.inventory.grantWeapon(schuetze, id);
  match.inventory.grantAmmo?.(schuetze, id, 99);
  match.inventory.selectWeapon(schuetze, id);
  const r = match.fire(schuetze, 0.05, 80, id);
  if (!r.ok) return false;
  let g = 0;
  while (match.activeProjectileCount > 0 && g < 900) { match.step(); g += 1; }
  for (let i = 0; i < 20; i += 1) match.step();
  return true;
}

function leben(match, id) {
  return match.world.getComponent(id, 'Health', 'current') ?? 0;
}

/** Lässt die Züge laufen, bis das Opfer `zuege` Zugbeginne erlebt hat; liefert die Leben danach. */
function opferZuege(match, opfer, zuege, onZug = null) {
  let gezaehlt = 0;
  const verlauf = [];
  for (let i = 0; i < 40 && gezaehlt < zuege; i += 1) {
    match.endTurn();
    for (const e of match.consumeEvents()) {
      if ((e.type === 'turn_start' || e.type === 'turn_skipped') && e.payload.playerId === opfer) {
        gezaehlt += 1;
        verlauf.push(leben(match, opfer));
        onZug?.(e);
      }
    }
    if (match.status !== 'playing') break;
  }
  return verlauf;
}

function wirkt(waffe) {
  if (!(waffe.damage > 0)) return false;
  const e = buildEffect(waffe) ?? elementalEffectFor(waffe);
  return !(e && SELF_TARGET_KINDS.has(e.kind));
}

function messeWaffe(fassung, waffe, klasse) {
  const { match, schuetze, opfer } = neuesMatch(fassung, klasse);
  match.world.setComponent(opfer, 'Health', 'max', OPFER_LEBEN);
  match.world.setComponent(opfer, 'Health', 'current', OPFER_LEBEN);
  if (!schiesse(match, schuetze, waffe.id)) return null;
  match.consumeEvents();
  const direkt = OPFER_LEBEN - leben(match, opfer);
  const verlauf = opferZuege(match, opfer, 3);
  const gesamt = OPFER_LEBEN - (verlauf.at(-1) ?? leben(match, opfer));
  return { direkt, gesamt, dot: Math.max(0, gesamt - direkt) };
}

function zeitBisKill(fassung, waffe) {
  const { match, schuetze, opfer } = neuesMatch(fassung, 'heavy');
  for (let runde = 1; runde <= 12; runde += 1) {
    if (match.activePlayerId === schuetze && match.cooldownFor(schuetze, waffe.id) === 0) schiesse(match, schuetze, waffe.id);
    match.consumeEvents();
    if (leben(match, opfer) <= 0 || !match.isPlayerAlive(opfer)) return runde;
    opferZuege(match, opfer, 1);
    if (!match.isPlayerAlive(opfer)) return runde;
  }
  return null;
}

function stapelTest(fassung, id) {
  const waffe = WEAPONS.find(w => w.id === id);
  const { match, schuetze, opfer } = neuesMatch(fassung, 'heavy');
  match.world.setComponent(opfer, 'Health', 'max', OPFER_LEBEN);
  match.world.setComponent(opfer, 'Health', 'current', OPFER_LEBEN);
  let hoechsterTick = 0;
  let ausgesetzt = 0;
  let zuege = 0;
  const zaehle = () => {
    for (const e of match.consumeEvents()) {
      if (e.type === 'dot_tick') hoechsterTick = Math.max(hoechsterTick, e.payload.damage);
      if ((e.type === 'turn_start' || e.type === 'turn_skipped') && e.payload.playerId === opfer) {
        zuege += 1;
        if (e.type === 'turn_skipped') ausgesetzt += 1;
      }
    }
  };
  for (let i = 0; i < 12; i += 1) {
    if (match.activePlayerId === schuetze) schiesse(match, schuetze, waffe.id);
    zaehle();
    for (let k = 0; k < 4; k += 1) {
      match.endTurn();
      zaehle();
      if (match.activePlayerId === schuetze) break;
    }
  }
  return { id, name: waffe.displayName, hoechsterTick: Math.round(hoechsterTick * 10) / 10, ausgesetzt, zuege };
}

export function messeAlles(fassung, { schnell = false } = {}) {
  const gruppen = new Map();
  for (const waffe of WEAPONS.filter(wirkt)) {
    if (!gruppen.has(waffe.damageType)) gruppen.set(waffe.damageType, []);
    gruppen.get(waffe.damageType).push(waffe);
  }
  const arten = [];
  for (const [art, waffen] of [...gruppen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const liste = schnell ? waffen.slice(0, 3) : waffen;
    const werte = { scout: [], heavy: [], artillery: [] };
    const dotAnteil = [];
    const kill = [];
    for (const waffe of liste) {
      for (const klasse of KLASSEN) {
        const r = messeWaffe(fassung, waffe, klasse);
        if (!r || r.direkt + r.dot <= 0) continue;
        werte[klasse].push(r.gesamt);
        if (klasse === 'heavy') dotAnteil.push(r.gesamt > 0 ? r.dot / r.gesamt : 0);
      }
      const k = zeitBisKill(fassung, waffe);
      if (k !== null) kill.push(k);
    }
    const mittel = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    arten.push({
      art, waffen: liste.length, treffer: werte.heavy.length,
      gesamt3: Object.fromEntries(KLASSEN.map(k => [k, Math.round(mittel(werte[k]) * 10) / 10])),
      dotAnteil: Math.round(mittel(dotAnteil) * 100),
      killZuege: kill.length ? Math.round(mittel(kill) * 10) / 10 : null,
    });
  }
  const stapel = ['pa_072', 'pa_070', 'pa_071', 'pa_008', 'pa_097'].map(id => stapelTest(fassung, id));
  return { fassung, arten, stapel };
}

function ausgeben(e) {
  console.log(`\nFassung ${e.fassung} — Gesamtschaden über 3 Züge des Opfers (Mittel je Waffe der Art, Leben 1000)\n`);
  console.log('Art         Waffen Treffer  scout  heavy  artill  DoT%  Kill-Züge');
  for (const a of e.arten) {
    console.log(`${a.art.padEnd(11)} ${String(a.waffen).padStart(6)} ${String(a.treffer).padStart(6)}  ${String(a.gesamt3.scout).padStart(5)}  ${String(a.gesamt3.heavy).padStart(5)}  ${String(a.gesamt3.artillery).padStart(6)}  ${String(a.dotAnteil).padStart(4)}  ${a.killZuege ?? '-'}`);
  }
  console.log('\nStapel-Exploit (12 Runden Dauerbeschuss mit derselben Waffe)');
  for (const s of e.stapel) console.log(`${s.id} ${s.name.padEnd(18)} höchster Tick ${String(s.hoechsterTick).padStart(5)}  ausgesetzt ${s.ausgesetzt}/${s.zuege} Züge`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  const fassungen = arg('fassung') ? [Number(arg('fassung'))] : [SCHADEN_ALT, SCHADEN_STATUS];
  const schnell = process.argv.includes('--schnell');
  const alle = fassungen.map(f => messeAlles(f, { schnell }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(alle, null, 2));
  else alle.forEach(ausgeben);
}
