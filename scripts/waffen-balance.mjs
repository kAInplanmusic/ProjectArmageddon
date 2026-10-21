#!/usr/bin/env node
/**
 * Waffen-Balance je Seltenheitsstufe: Schaden, Reichweite, Trefferquote, Zeit bis Kill.
 *
 * Ergänzt `scripts/balance-report.mjs`. Dieser Bericht schießt mit festem Winkelsatz
 * und voller Kraft; Projektile treffen dort oft zufällig und der Schaden ist ein
 * Maß für das Zielen, nicht für die Waffe. Hier wird zuerst GEZIELT:
 *
 *  - gleiche Höhe, freie Linie, STEHENDES Ziel (Gesundheit 1000, damit der
 *    Schaden nie am Leben des Ziels abgeschnitten wird);
 *  - Projektilwaffen: Gitter aus Winkel x Kraft, bewertet mit `aimPreview` (dieselbe
 *    Bahn wie der echte Schuss), danach feine Suche um den besten Punkt; die
 *    besten drei Einstellungen werden wirklich geschossen, das Maximum zählt;
 *  - Strahlwaffen: direkt auf das Ziel;
 *  - Strike-Waffen (sky/side) wie Strahlwaffen (Zielpunkt = Strahlende). Entfernungen: siehe `ENTFERNUNGEN` (tatsächlich gemessene steht im Ergebnis).
 *
 * Je Waffe:
 *  - `schadenBest`      höchster gemessener Schaden pro Schuss (Ziel steht still)
 *  - `reichweite`       größte Entfernung mit Schaden >= 25 % des Bestwerts
 *  - `trefferquote`     Anteil der Entfernungen bis zur Katalog-Reichweite mit Schaden
 *  - `stk`              Schüsse bis Kill je Klasse (Gesundheit = Basis x Klassenfaktor)
 *  - `zuege`            Züge bis Kill je Klasse, mit Abklingzeit (`cooldown` Züge Pause)
 *  - `ausreichend`      reicht das Magazin (`maxAmmo`) für einen Kill?
 *
 * Ausreißer (ohne Selbstwirkungen und Zünderwaffen): Schaden pro Schuss gegen den Median der gleichen Seltenheitsstufe
 * (nur Waffen mit Schaden am Ziel). Zu schwach: < 0,5x Median; zu stark: > 2x Median.
 * Dazu: zu geringe Reichweite für die Stufe und Stufen, die den Median der
 * niedrigeren Stufe nicht übertreffen.
 *
 * Aufruf:
 *   node scripts/waffen-balance.mjs [--json] [--nur=pa_001,pa_028] [--ausreisser]
 */
import { MatchController, MAP_WIDTH, BASE_HEALTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

export const ENTFERNUNGEN = Object.freeze([40, 90, 150, 300, 500, 800, 1200, 1700]);
export const STUFEN = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const ZIEL_LEBEN = 1000;
/** Strahl- und Strike-Waffen: dichte kleine Winkel (die Trefferfläche ist 20 px hoch, der Strahl lang). */
const HITSCAN_WINKEL = Object.freeze([0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.15]);
/** Ab diesem Anteil des Bestwerts zählt eine Entfernung als wirksam. */
const WIRKSAM_ANTEIL = 0.25;
export const ZU_SCHWACH = 0.5;
export const ZU_STARK = 2;

/** Gesundheit der drei Klassen, genau wie der Motor sie rechnet. */
export function klassenGesundheit() {
  const out = {};
  for (const k of CLASS_IDS) out[k] = Math.round(BASE_HEALTH * combatProfile(k).healthMultiplier);
  return out;
}

function freieLinie(match, dist) {
  for (let d = dist; d >= 40; d -= 10) {
    for (let x = 40; x + d <= MAP_WIDTH - 40; x += 4) {
      const grundY = Math.max(0, match.surfaceYAt(x));
      const lineY = grundY - 5;
      let frei = true;
      for (let o = 0; o <= d; o += 2) {
        const s = match.surfaceYAt(x + o);
        if (s < 0 || s <= lineY) { frei = false; break; }
      }
      // Das Ziel muss auf festem Boden stehen: Wird es in die Luft gesetzt, fällt es, und die Messung
      // zielt auf die falsche Höhe (maß dann nur Fallschaden statt des Treffers).
      if (frei && Math.abs(match.surfaceYAt(x + d) - grundY) <= 2) return { x, grundY, dist: d };
    }
  }
  return null;
}

function aufbau(seed, dist, waffe) {
  const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, schaden: 1 });
  match.start();
  const z = match.getState();
  const schuetze = z.entities.find(e => e.entityId === match.activePlayerId);
  const ziel = z.entities.find(e => e.entityId !== match.activePlayerId);
  if (!schuetze || !ziel) return null;
  const linie = freieLinie(match, dist);
  if (!linie) return null;
  const w = match.world;
  w.setComponent(schuetze.entityId, 'Position', 'x', linie.x);
  w.setComponent(schuetze.entityId, 'Position', 'y', linie.grundY);
  w.setComponent(ziel.entityId, 'Position', 'x', linie.x + linie.dist);
  w.setComponent(ziel.entityId, 'Position', 'y', linie.grundY);
  w.setComponent(ziel.entityId, 'Health', 'max', ZIEL_LEBEN);
  w.setComponent(ziel.entityId, 'Health', 'current', ZIEL_LEBEN);
  // Figuren setzen sich erst nach ein paar Takten auf den Boden (Fallschaden, Lagekorrektur).
  // Ohne Beruhigung zielte die Messung auf die alte Höhe und verfehlte die Trefferfläche um
  // wenige Pixel: Projektilwaffen maßen dann nur den Fallschaden des Ziels, nicht ihren Treffer.
  for (let i = 0; i < 12; i += 1) { match.step(); match.consumeEvents(); }
  w.setComponent(ziel.entityId, 'Health', 'current', ZIEL_LEBEN);
  w.setComponent(schuetze.entityId, 'Health', 'current', w.getComponent(schuetze.entityId, 'Health', 'max'));
  match.inventory.register(schuetze.entityId, [waffe.id]);
  match.inventory.selectWeapon(schuetze.entityId, waffe.id);
  // Die Trefferfläche liegt um die Position der Figur (siehe `PLAYER_HALF_HEIGHT`).
  const zx = w.getComponent(ziel.entityId, 'Position', 'x');
  const zy = w.getComponent(ziel.entityId, 'Position', 'y');
  return { match, schuetzeId: schuetze.entityId, zielId: ziel.entityId, dist: linie.dist, zielX: zx, zielY: zy };
}

function schiesse(seed, dist, waffe, winkel, kraft) {
  const a = aufbau(seed, dist, waffe);
  if (!a) return null;
  const { match } = a;
  const r = match.fire(a.schuetzeId, winkel, kraft, waffe.id);
  if (!r.ok) return { ok: false, schaden: 0, dist: a.dist };
  let g = 0;
  while (match.activeProjectileCount > 0 && g < 900) { match.step(); match.consumeEvents(); g += 1; }
  for (let i = 0; i < 8; i += 1) { match.step(); match.consumeEvents(); }
  const nach = match.world.getComponent(a.zielId, 'Health', 'current') ?? 0;
  return { ok: true, schaden: Math.max(0, ZIEL_LEBEN - nach), dist: a.dist };
}

/** Beste Einstellungen (nach Abstand des Einschlags zum Ziel), grob dann fein. */
function zielloesung(seed, dist, waffe) {
  const a = aufbau(seed, dist, waffe);
  if (!a) return null;
  const bewerte = (winkel, kraft) => {
    const bahn = a.match.aimPreview(a.schuetzeId, winkel, kraft, 400, waffe);
    // Kleinster Abstand der ganzen Bahn zum Ziel: Direkttreffer-Geschosse fliegen in der
    // Vorschau durch die Figur hindurch (ohne `hitTest`); der Endpunkt allein wäre falsch.
    let abstand = Infinity;
    for (const p of bahn) abstand = Math.min(abstand, Math.hypot(p.x - a.zielX, p.y - a.zielY));
    return abstand;
  };
  const kand = [];
  for (let w = -0.1; w <= 1.5; w += 0.05) {
    for (const k of [30, 45, 60, 75, 90, 100]) kand.push({ w, k, f: bewerte(w, k) });
  }
  kand.sort((x, y) => x.f - y.f);
  const fein = [];
  for (const c of kand.slice(0, 3)) {
    let best = c;
    for (let w = c.w - 0.05; w <= c.w + 0.05; w += 0.01) {
      for (let k = Math.max(20, c.k - 8); k <= Math.min(100, c.k + 8); k += 2) {
        const f = bewerte(w, k);
        if (f < best.f) best = { w, k, f };
      }
    }
    fein.push(best);
  }
  fein.sort((x, y) => x.f - y.f);
  return { dist: a.dist, kandidaten: fein };
}

export function messeWaffe(waffe, index) {
  const seed = 4242 + index * 977;
  const effekt = buildEffect(waffe);
  const selbst = effekt !== null && SELF_TARGET_KINDS.has(effekt.kind);
  const zeilen = [];
  for (const dist of ENTFERNUNGEN) {
    let ergebnis;
    if (waffe.delivery === 'hitscan' || (waffe.strikeStyle ?? 'self') !== 'self') {
      // Etwas Erhebung probieren: Sichtlinienwaffen werden am Hang bei 0 rad abgelehnt.
      ergebnis = null;
      for (const winkel of HITSCAN_WINKEL) {
        const r = schiesse(seed, dist, waffe, winkel, 100);
        if (r && (!ergebnis || r.schaden > ergebnis.schaden || (!ergebnis.ok && r.ok))) ergebnis = r;
      }
    } else {
      const l = zielloesung(seed, dist, waffe);
      if (!l) continue;
      ergebnis = null;
      for (const c of l.kandidaten) {
        const r = schiesse(seed, dist, waffe, c.w, c.k);
        if (r && (!ergebnis || r.schaden > ergebnis.schaden)) ergebnis = r;
      }
    }
    if (ergebnis) zeilen.push({ angefragt: dist, gemessen: ergebnis.dist, schaden: Number(ergebnis.schaden.toFixed(1)), ok: ergebnis.ok });
  }
  // Doppelte (verkürzte) Entfernungen zusammenfassen.
  const einmalig = [];
  for (const z of zeilen) if (!einmalig.some(e => e.gemessen === z.gemessen)) einmalig.push(z);
  const best = Math.max(0, ...einmalig.map(z => z.schaden));
  const wirksam = einmalig.filter(z => best > 0 && z.schaden >= best * WIRKSAM_ANTEIL);
  const imBereich = einmalig.filter(z => z.gemessen <= waffe.maxRange);
  const trefferquote = imBereich.length ? imBereich.filter(z => z.schaden > 0).length / imBereich.length : 0;
  const gesundheit = klassenGesundheit();
  const stk = {};
  const zuege = {};
  const ausreichend = {};
  for (const [k, hp] of Object.entries(gesundheit)) {
    stk[k] = best > 0 ? Math.ceil(hp / best) : null;
    zuege[k] = stk[k] === null ? null : stk[k] + (stk[k] - 1) * (waffe.cooldown ?? 0);
    ausreichend[k] = stk[k] !== null && stk[k] <= waffe.maxAmmo;
  }
  return {
    id: waffe.id,
    name: waffe.displayName,
    stufe: waffe.powerTier,
    kategorie: waffe.category,
    kontakt: waffe.category === 'melee',
    selbstwirkung: selbst,
    lunte: (waffe.fuseTime ?? 0) > 0,
    schadenKatalog: waffe.damage,
    schadenBest: best,
    reichweite: wirksam.length ? Math.max(...wirksam.map(z => z.gemessen)) : 0,
    reichweiteKatalog: waffe.maxRange,
    trefferquote: Number(trefferquote.toFixed(2)),
    munition: waffe.maxAmmo,
    abklingzeit: waffe.cooldown ?? 0,
    stk, zuege, ausreichend,
    proEntfernung: einmalig,
  };
}

function median(liste) {
  if (!liste.length) return 0;
  const s = [...liste].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Ausreißer relativ zur Stufe. Ausgenommen: Selbstwirkungen (kein Schaden vorgesehen)
 * und Waffen mit Zünder — ihre Bahn endet nicht am ersten Aufprall (Rollen, Abprallen,
 * Zündzeit), die Zielhilfe `aimPreview` bildet das nicht ab; sie wären Messartefakte.
 */
export function findeAusreisser(ergebnisse) {
  const kampf = ergebnisse.filter(e => !e.selbstwirkung && !e.lunte);
  const stufen = {};
  for (const s of STUFEN) {
    const l = kampf.filter(e => e.stufe === s && e.schadenBest > 0);
    stufen[s] = {
      anzahl: l.length,
      medianSchaden: Number(median(l.map(e => e.schadenBest)).toFixed(1)),
      medianReichweite: median(l.map(e => e.reichweite)),
    };
  }
  const liste = [];
  for (const e of kampf) {
    const m = stufen[e.stufe].medianSchaden;
    if (!m) continue;
    if (e.schadenBest === 0) liste.push({ id: e.id, name: e.name, stufe: e.stufe, art: 'ohne Schaden', schadenBest: 0, median: m });
    else if (e.schadenBest < m * ZU_SCHWACH) liste.push({ id: e.id, name: e.name, stufe: e.stufe, art: 'zu schwach', schadenBest: e.schadenBest, median: m, kontakt: e.kontakt, reichweite: e.reichweite });
    else if (e.schadenBest > m * ZU_STARK) liste.push({ id: e.id, name: e.name, stufe: e.stufe, art: 'zu stark', schadenBest: e.schadenBest, median: m });
  }
  return { stufen, liste };
}

function main() {
  const nur = typeof args.nur === 'string' ? new Set(args.nur.split(',')) : null;
  const ziel = WEAPONS.filter(w => !nur || nur.has(w.id));
  const ergebnisse = ziel.map(w => messeWaffe(w, w.index));
  const { stufen, liste } = findeAusreisser(ergebnisse);
  if (args.json) {
    console.log(JSON.stringify({ gesundheit: klassenGesundheit(), entfernungen: ENTFERNUNGEN, stufen, ausreisser: liste, waffen: ergebnisse }, null, 1));
    return;
  }
  console.log(`Gesundheit: ${JSON.stringify(klassenGesundheit())}; Entfernungen ${ENTFERNUNGEN.join('/')} px; Ziel steht still`);
  console.log('Median je Stufe (Waffen mit Schaden):');
  for (const s of STUFEN) console.log(`  ${s.padEnd(10)} n=${String(stufen[s].anzahl).padStart(2)}  Schaden ${String(stufen[s].medianSchaden).padStart(6)}  Reichweite ${stufen[s].medianReichweite}`);
  if (!args.ausreisser) {
    console.log('\nid      Stufe     Name                       Kat.         Kat-Sch. Best  Reich. Treffer Mun CD  STK(sc/he/ar)');
    for (const e of ergebnisse) {
      if (e.selbstwirkung) continue;
      const k = e.stk;
      console.log(`${e.id}  ${e.stufe.padEnd(9)} ${e.name.slice(0, 26).padEnd(26)} ${e.kategorie.padEnd(12)} ${String(e.schadenKatalog).padStart(5)} ${String(e.schadenBest).padStart(6)} ${String(e.reichweite).padStart(6)} ${e.trefferquote.toFixed(2).padStart(6)} ${String(e.munition).padStart(3)} ${String(e.abklingzeit).padStart(2)}  ${k.scout}/${k.heavy}/${k.artillery}`);
    }
  }
  console.log(`\nAusreißer (${liste.length}):`);
  for (const a of liste) console.log(`  ${a.id} ${a.name} [${a.stufe}] ${a.art}: ${a.schadenBest} gegen Median ${a.median}${a.kontakt ? ` (Kontakt, Reichweite ${a.reichweite})` : ''}`);
}

if (import.meta.main) main();
