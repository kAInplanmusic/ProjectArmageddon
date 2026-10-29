#!/usr/bin/env node
/**
 * Bot-Partien: Spielbarkeit des Start-Kits (ohne Kisten).
 *
 * Frage: Werden Partien mit dem Start-Kit (Reserve + 2 Common + 1 schwache
 * Flächenwaffe) endlos oder zu zäh, wenn niemand Kisten einsammelt?
 *
 * Der Bot ist ein einfacher Zielbot, rein in der Engine (kopflos, deterministisch):
 *  - er läuft NICHT, Kisten bleiben liegen (also: Kit ohne Kisten, außer eine
 *    Kiste liegt zufällig im Aufnahmeradius des Spawns);
 *  - Projektilwaffen: Gitter aus Winkel x Kraft, bewertet mit `aimPreview`
 *    (Einschlagpunkt gegen nächsten Gegner), dazu ein kleiner, aus dem Seed
 *    abgeleiteter Zielfehler (kein Meisterschütze);
 *  - Strahlwaffen: direkt auf den Gegner;
 *  - wählt die Waffe mit dem besten Ergebnis; Munition aufgebraucht -> Reserve.
 *
 * Aufruf:
 *   node scripts/bot-partien.mjs [--seeds=24] [--kit=4] [--json] [--fehler=0.02] [--denkzeit=8] [--zugregeln=2]
 *                                [--waffen=1]
 *                                [--teams=2] [--pro-team=2]
 */
import { MatchController } from '../src/engine/match.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import { MATCH_RULES } from '../src/shared/config/match.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const SEEDS = Number(args.seeds ?? 24);
const FEHLER = Number(args.fehler ?? 0.02);
/** Bedenkzeit je Zug in Sekunden (Spielzeit, die vor dem Schuss vergeht). */
const DENKZEIT = Number(args.denkzeit ?? 8);
const TEAMS = Number(args.teams ?? 2);
const PRO_TEAM = Number(args['pro-team'] ?? 2);
const KITS = args.kit ? [Number(args.kit)] : [3, 4];
const WAFFEN = args.waffen ? Number(args.waffen) : undefined;
/** Zugregelfassung der Partien: 1 = alt (Vorgabe, die dokumentierten Messwerte), 2 = mit Rückzugsfrist (`--zugregeln=2`). */
const ZUGREGELN = args.zugregeln ? Number(args.zugregeln) : undefined;

/** Kleiner deterministischer Strom (Werkzeug, nicht Engine). */
function strom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WINKEL = Array.from({ length: 37 }, (_, i) => (i / 36) * Math.PI);
const KRAEFTE = [35, 50, 65, 80, 100];

function naechsterGegner(zustand, aktiv) {
  let best = null;
  for (const e of zustand.entities) {
    if (!e.alive || e.teamId === aktiv.teamId) continue;
    const d = Math.hypot(e.x - aktiv.x, e.y - aktiv.y);
    if (!best || d < best.d) best = { e, d };
  }
  return best;
}

/** Bester Schuss einer Waffe: { winkel, kraft, fehl } mit kleinstem Abstand zum Gegner. */
function planeSchuss(match, aktiv, gegner, waffe) {
  const dx = gegner.x - aktiv.x;
  const dy = gegner.y - aktiv.y;
  if (waffe.delivery === 'hitscan') {
    return { winkel: Math.atan2(-dy, dx), kraft: 100, fehl: 0 };
  }
  let beste = null;
  for (const winkel of WINKEL) {
    for (const kraft of KRAEFTE) {
      const bahn = match.aimPreview(aktiv.entityId, winkel, kraft, 300, waffe);
      const ende = bahn[bahn.length - 1];
      if (!ende) continue;
      const fehl = Math.hypot(ende.x - gegner.x, ende.y - gegner.y);
      if (!beste || fehl < beste.fehl) beste = { winkel, kraft, fehl };
    }
  }
  return beste;
}

export function spiele(seed, kit, { teams = TEAMS, proTeam = PRO_TEAM, fehler = FEHLER, waffen = WAFFEN, denkzeit = DENKZEIT, extra = {}, ereignis = null, beiZug = null } = {}) {
  const zugSek = teams * proTeam === 2 ? MATCH_RULES.turnTimers.duelSeconds.seconds : MATCH_RULES.turnTimers.fourPlayerSeconds.seconds;
  const zufall = strom(seed ^ 0x5bd1e995);
  const FEHLER = fehler;
  const match = new MatchController({
    seed, teams, playersPerTeam: proTeam, preset: 'hills', kit, waffen,
    turnDurationMs: zugSek * 1000, turnPauseTicks: 0, ...(ZUGREGELN ? { zugregeln: ZUGREGELN, bewegung: 2 } : {}), ...extra,
  });
  // Messwerkzeuge (Tier-Verteilung): jede Ereignisliste (ein Schritt) geht durch `ereignis(liste, match)`; ohne Haken bleibt alles wie vorher.
  const ev = () => { const liste = match.consumeEvents(); if (ereignis && liste.length) ereignis(liste, match); return liste; };
  match.start();
  const bilanz = {
    seed, schuesse: 0, treffer: 0, schaden: 0, zuege: 0, nurReserve: 0,
    ersterSchadenTick: null, aufgenommen: 0, fehl: {}, ohneSchuss: 0,
  };
  let schutz = 0;
  while (match.status === 'playing' && schutz < 3000) {
    schutz += 1;
    for (let i = 0; i < Math.round(denkzeit * 60) && match.status === 'playing'; i += 1) { match.step(); ev(); }
    if (match.status !== 'playing') break;
    let z = match.getState();
    let aktiv = z.entities.find(e => e.entityId === z.activePlayerId);
    bilanz.zuege += 1;
    if (beiZug && aktiv?.alive) {
      beiZug(match, aktiv, ev);
      z = match.getState();
      aktiv = z.entities.find(e => e.entityId === z.activePlayerId);
    }
    if (aktiv?.alive) {
      const ziel = naechsterGegner(z, aktiv);
      const ids = match.inventory.getWeapons(aktiv.entityId)
        .filter(id => match.inventory.getAmmo(aktiv.entityId, id) > 0 && !(match.cooldownFor(aktiv.entityId, id) > 0));
      if (ziel && ids.length) {
        const kandidaten = [];
        for (const id of ids) {
          const waffe = getWeapon(id);
          if (!waffe || waffe.damage <= 0) continue;
          const plan = planeSchuss(match, aktiv, ziel.e, waffe);
          if (plan) kandidaten.push({ id, waffe, plan });
        }
        // Treffer zählt, wenn der Einschlag innerhalb Radius+Reichweite der Wirkung liegt.
        const bewerte = k => k.plan.fehl - (k.waffe.blastRadius ?? 0) * 0.5 - (k.waffe.id === 'pa_028' ? 0 : 5);
        kandidaten.sort((a, b) => bewerte(a) - bewerte(b));
        const lebenVor = z.entities.filter(e => e.teamId !== aktiv.teamId).reduce((s, e) => s + Math.max(0, e.health), 0);
        let geschossen = false;
        for (const k of kandidaten) {
          match.inventory.selectWeapon(aktiv.entityId, k.id);
          const winkel = Math.min(Math.PI, Math.max(0, k.plan.winkel + (zufall() - 0.5) * 2 * FEHLER));
          const kraft = Math.min(100, k.plan.kraft + (zufall() - 0.5) * 6);
          const r = match.fire(aktiv.entityId, winkel, kraft, k.id);
          if (!r.ok) { bilanz.fehl[r.errors?.[0] ?? '?'] = (bilanz.fehl[r.errors?.[0] ?? '?'] ?? 0) + 1; continue; }
          bilanz.schuesse += 1;
          geschossen = true;
          if (kandidaten.length === 1 && k.id === 'pa_028') bilanz.nurReserve += 1;
          let w = 0;
          while (match.activeProjectileCount > 0 && w < 900) { match.step(); ev(); w += 1; }
          for (let i = 0; i < 12; i += 1) { match.step(); ev(); }
          // Zugregeln 2: Rückzug — der Bot läuft vom Gegner weg, bis der Zug wechselt (Schutzgrenze: Soft-Lock ausgeschlossen).
          if (match.zug) {
            const weg = ziel.e.x > aktiv.x ? -1 : 1;
            for (let r = 0; r < 1200 && match.status === 'playing' && match.activePlayerId === aktiv.entityId; r += 1) {
              if (r % 30 === 0) match.gehen?.setzeRichtung(aktiv.entityId, weg);
              match.step(); ev();
            }
          }
          const nach = match.getState().entities.filter(e => e.teamId !== aktiv.teamId);
          const lebenNach = nach.reduce((s, e) => s + Math.max(0, e.alive ? e.health : 0), 0);
          const schaden = Math.max(0, lebenVor - lebenNach);
          bilanz.schaden += schaden;
          if (schaden > 0) {
            bilanz.treffer += 1;
            bilanz.ersterSchadenTick ??= match.getState().tick;
          }
          break;
        }
        if (!geschossen) bilanz.ohneSchuss += 1;
      } else bilanz.ohneSchuss += 1;
    }
    if (match.status !== 'playing') break;
    if (!match.getState().entities.length) break;
    // Mit Rückzug endet der Zug von selbst; nur wer nicht geschossen hat (und noch dran ist) beendet ihn hier.
    if (!match.zug || match.activePlayerId === aktiv?.entityId) match.endTurn();
    match.step();
    ev();
  }
  const ende = match.getState();
  bilanz.tick = ende.tick;
  bilanz.minuten = ende.tick / 3600;
  bilanz.runden = ende.round;
  bilanz.siegerTeam = ende.winnerTeamId ?? null;
  bilanz.valhallaMinuten = match.valhallaTick / 3600;
  bilanz.ausgang = match.status === 'playing' ? 'offen' : (ende.winnerTeamId === null ? 'unentschieden' : 'sieg');
  // Valhalla (Mahlstrom) beginnt nach `valhallaTick` Ticks; die Bedenkzeit läuft als Spielzeit mit.
  bilanz.vorValhalla = ende.tick < match.valhallaTick;
  return bilanz;
}

const perzentil = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function main() {
const ergebnis = {};
for (const kit of KITS) {
  const partien = [];
  for (let i = 0; i < SEEDS; i += 1) partien.push(spiele(7000 + i * 131, kit));
  const mittel = f => partien.reduce((s, p) => s + p[f], 0) / partien.length;
  ergebnis[kit] = {
    partien: partien.length,
    offen: partien.filter(p => p.ausgang === 'offen').length,
    unentschieden: partien.filter(p => p.ausgang === 'unentschieden').length,
    vorValhalla: partien.filter(p => p.vorValhalla).length,
    medianMinuten: Number(perzentil(partien.map(p => p.minuten), 0.5).toFixed(1)),
    p90Minuten: Number(perzentil(partien.map(p => p.minuten), 0.9).toFixed(1)),
    maxMinuten: Number(Math.max(...partien.map(p => p.minuten)).toFixed(1)),
    medianRunden: perzentil(partien.map(p => p.runden), 0.5),
    trefferquote: Number((partien.reduce((s, p) => s + p.treffer, 0) / Math.max(1, partien.reduce((s, p) => s + p.schuesse, 0))).toFixed(2)),
    schadenProSchuss: Number((partien.reduce((s, p) => s + p.schaden, 0) / Math.max(1, partien.reduce((s, p) => s + p.schuesse, 0))).toFixed(1)),
    zuegeProPartie: Number(mittel('zuege').toFixed(1)),
    schuesseProPartie: Number(mittel('schuesse').toFixed(1)),
    zuegeOhneSchuss: Number((partien.reduce((s, p) => s + p.ohneSchuss, 0) / Math.max(1, partien.reduce((s, p) => s + p.zuege, 0))).toFixed(2)),
    fehlschlaege: partien.reduce((m, p) => { for (const [k, v] of Object.entries(p.fehl)) m[k] = (m[k] ?? 0) + v; return m; }, {}),
    reserveAnteil: Number((partien.reduce((s, p) => s + p.nurReserve, 0) / Math.max(1, partien.reduce((s, p) => s + p.schuesse, 0))).toFixed(2)),
  };
}

if (args.json) {
  console.log(JSON.stringify(ergebnis, null, 2));
} else {
  console.log(`Bot-Partien, ${TEAMS}x${PRO_TEAM}, ${SEEDS} Seeds, Zielfehler ${FEHLER} rad, Bot läuft nicht (keine Kisten)`);
  for (const [kit, e] of Object.entries(ergebnis)) {
    console.log(`Kit ${kit}: offen ${e.offen}, unentschieden ${e.unentschieden}, vor Valhalla (6-12 min) entschieden ${e.vorValhalla}/${e.partien}`);
    console.log(`  Spieldauer Median ${e.medianMinuten} min (P90 ${e.p90Minuten}, Max ${e.maxMinuten}), Runden Median ${e.medianRunden}`);
    console.log(`  Trefferquote ${e.trefferquote}, Schaden/Schuss ${e.schadenProSchuss}, Schüsse/Partie ${e.schuesseProPartie} in ${e.zuegeProPartie} Zügen, Reserve-Anteil ${e.reserveAnteil}, Züge ohne Schuss ${e.zuegeOhneSchuss}`);
    if (Object.keys(e.fehlschlaege).length) console.log(`  abgelehnte Schüsse: ${JSON.stringify(e.fehlschlaege)}`);
  }
}
}

if (import.meta.main) main();
