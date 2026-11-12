/**
 * Messung der runden Kartenarten (N-40), gemeinsam genutzt von `scripts/check-rund.mjs` und `tests/gelaende-fassung-14.test.js`.
 * Alles hier ist Messung am fertigen Match, nichts davon wirkt auf Engine oder Replay.
 */
import { MatchController } from '../src/engine/match.js';
import { gehSchritt } from '../src/engine/systems/bewegungSystem.js';

export const SEITEN = { 960: 'klein', 1920: 'mittel', 2880: 'gross', 3840: 'riesig', 5760: 'kolossal' };

/** Gehen mit der reinen Bewegungsfunktion der Engine von x0 nach x1 (Fuß auf `startY`); Kante: fallen bis zum Boden. */
export function geheStrecke(bitmap, width, height, startY, x0, x1, tempo) {
  const t = { width, isSolid: (x, y) => x < 0 || x >= width || y >= height || (y >= 0 && bitmap[y * width + x] === 1) };
  const richtung = x1 > x0 ? 1 : -1;
  let x = x0 + 0.5;
  let y = startY - 10;
  for (let n = 0; n < 400000; n += 1) {
    const r = gehSchritt(t, x, y, richtung, tempo);
    if (r.blockiert) return { ok: false, x, y };
    x = r.x;
    y = r.y;
    if (r.abgrund) {
      let yy = Math.floor(y + 10);
      while (!t.isSolid(Math.floor(x), yy) && yy < height) yy += 1;
      y = yy - 10;
    }
    if (richtung > 0 ? x >= x1 : x <= x1) return { ok: true, x, y };
  }
  return { ok: false, x, y };
}

export function oberkanten(bitmap, w, h) {
  const o = new Int32Array(w).fill(-1);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (o[x] < 0 && bitmap[y * w + x]) o[x] = y;
  return o;
}

/** Startet ein Match auf der runden Karte und misst Stand, Wege, Startplätze. */
export function messeRundeKarte({ art, seite, seed, teams = 2, pro = 3, wege = true }) {
  const t0 = performance.now();
  const m = new MatchController({ seed, teams, playersPerTeam: pro, kartentyp: 'autonom', maxRounds: 2, format: '1:1', groesse: SEITEN[seite], kartenart: art, turnDurationMs: 1e9 });
  m.start();
  const ms = Math.round(performance.now() - t0);
  const w = m.width;
  const h = m.height;
  const rund = m.kartencharakter?.rund ?? null;
  const bm = m.bitmap;
  const o = oberkanten(bm, w, h);
  const r = { art, seite, seed, teams, pro, ms, flaeche: w * h, kartenart: m.kartenart, rund: Boolean(rund), erreichbar: m.erreichbarkeit?.ok ?? null };
  if (!rund?.stand) return { ...r, standBreite: 0 };
  const [a, b] = rund.stand;
  r.standBreite = b - a;
  if (wege) {
    r.standHin = [0.72, 1.2, 1.68].every((tp) => geheStrecke(bm, w, h, o[a], a, b, tp).ok && geheStrecke(bm, w, h, o[b], b, a, tp).ok);
  }
  const figuren = m.players.map((p) => ({ team: p.teamId, x: m.world.getComponent(p.entityId, 'Position', 'x'), y: m.world.getComponent(p.entityId, 'Position', 'y') }));
  r.figuren = figuren.length;
  r.imStand = figuren.every((f) => f.x >= a - 120 && f.x <= b + 120);
  r.aufBoden = figuren.every((f) => { const bx = Math.round(f.x); return o[bx] >= 0 && Math.abs(f.y + 10 - o[bx]) <= 6; });
  const naechste = figuren.map((f) => Math.min(...figuren.filter((g) => g.team !== f.team).map((g) => Math.hypot(g.x - f.x, g.y - f.y))));
  const mittel = (t) => { const l = naechste.filter((_, i) => figuren[i].team === t); return l.reduce((s, v) => s + v, 0) / l.length; };
  const tm = [...new Set(figuren.map((f) => f.team))].map(mittel);
  r.fairness = Math.max(...tm) / Math.min(...tm);
  r.naechsterGegner = naechste.reduce((s, v) => s + v, 0) / naechste.length;
  const ys = figuren.map((f) => f.y);
  r.hoehenSpreizung = Math.max(...ys) - Math.min(...ys);
  return r;
}
