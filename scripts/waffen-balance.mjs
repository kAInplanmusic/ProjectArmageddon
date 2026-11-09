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
 *  - `ausreichend`      reicht die FRISCHE Munition aus dem Inventar für einen Kill?
 *
 * ## Spielvertrag statt Grundkatalog (BAL-06)
 *
 * Das Werkzeug las bisher `WEAPONS` direkt und startete seine Matches ohne
 * ausdrückliche Fassungen. Damit maß es den Grundkatalog und die Altklassen:
 * `pa_127` hieß „Teleportplattform“ statt „Mine“, der F15-Schaden fehlte, und
 * `maxAmmo` stand als Munition, obwohl 110 Waffen seit Fassung 11 eine andere
 * Frischmunition haben. Jetzt wird jede Waffe über `getWaffe(id, fassung)`
 * gezogen, und jedes Match bekommt Klassen-, Schaden-, Wind- und
 * Bodenobjektfassung ausdrücklich. `--vertrag` zeigt den Vertrag ohne
 * Simulation; `--waffen=<n>` misst eine alte Fassung separat.
 *
 * Ausreißer (ohne Selbstwirkungen und Zünderwaffen): Schaden pro Schuss gegen den Median der gleichen Seltenheitsstufe
 * (nur Waffen mit Schaden am Ziel). Zu schwach: < 0,5x Median; zu stark: > 2x Median.
 * Dazu: zu geringe Reichweite für die Stufe und Stufen, die den Median der
 * niedrigeren Stufe nicht übertreffen.
 *
 * Aufruf:
 *   node scripts/waffen-balance.mjs [--json] [--nur=pa_001,pa_028] [--ausreisser]
 *                                   [--waffen=16] [--vertrag]
 */
import { MatchController, MAP_WIDTH, BASE_HEALTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, normalisiereWaffen, WAFFEN_STANDARD, WAFFEN_MUNITION } from '../src/shared/config/waffen-fassung.js';
import { PlayerInventory } from '../src/engine/inventory.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

/**
 * Waffenfassung der Messung. Ohne Angabe die Standardfassung des Motors —
 * ausdrücklich aufgelöst, nicht als `undefined` an den Konstruktor gereicht.
 * `--waffen=11` misst eine alte Fassung separat; unbekannte Werte werden
 * abgelehnt statt still auf den Standard zu fallen.
 */
const gewaehlteFassung = args.waffen !== undefined ? Number(args.waffen) : WAFFEN_STANDARD;
const WAFFEN_FASSUNG = normalisiereWaffen(gewaehlteFassung);
if (WAFFEN_FASSUNG !== gewaehlteFassung) {
  console.error(`Unbekannte Waffenfassung: ${args.waffen}. Erwartet: 1 bis ${WAFFEN_STANDARD}.`);
  process.exit(2);
}

/** Der aktuelle Katalog unter der gemessenen Fassung — eine Quelle für Auswahl, Namen und Werte. */
export function katalogFuer(fassung = WAFFEN_FASSUNG) {
  return WEAPONS.map(waffe => getWaffe(waffe.id, fassung));
}

/**
 * Frische Munition einer Waffe aus dem Inventar (nicht `maxAmmo`).
 * Ab Waffenfassung 11 liefert das Inventar die Munitionsklasse (auch `Infinity`);
 * davor ist es der alte `maxAmmo`-Wert. Beides ist damit fassungstreu.
 */
export function frischeMunition(waffe, fassung = WAFFEN_FASSUNG) {
  const inventar = new PlayerInventory();
  inventar.setzeMunition(fassung >= WAFFEN_MUNITION);
  inventar.register('messung', [waffe.id]);
  return inventar.getAmmo('messung', waffe.id);
}

/** Munition für die Anzeige: `Infinity` wird als `"unbegrenzt"` ausgegeben, nicht als JSON-`null`. */
export const munitionAnzeige = wert => Number.isFinite(wert) ? wert : 'unbegrenzt';

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
  for (const k of CLASS_IDS) out[k] = Math.round(BASE_HEALTH * combatProfile(k, null, null, KLASSEN_STANDARD).healthMultiplier);
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

function aufbau(seed, dist, waffe, fassung = WAFFEN_FASSUNG) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
    schaden: SCHADEN_STANDARD, waffen: fassung, klassen: KLASSEN_STANDARD,
    wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD,
    /* Neutraler Angreifer (Fernkampf, Faktor 1,0): gemessen wird die Waffe, nicht die Klasse. */
    loadouts: [{ classId: 'fernkampf', archetypeId: null }, { classId: 'fernkampf', archetypeId: null }],
  });
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

function schiesse(seed, dist, waffe, winkel, kraft, fassung = WAFFEN_FASSUNG) {
  const a = aufbau(seed, dist, waffe, fassung);
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
function zielloesung(seed, dist, waffe, fassung = WAFFEN_FASSUNG) {
  const a = aufbau(seed, dist, waffe, fassung);
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

export function messeWaffe(waffe, index, fassung = WAFFEN_FASSUNG) {
  const seed = 4242 + index * 977;
  const effekt = buildEffect(waffe);
  const selbst = effekt !== null && SELF_TARGET_KINDS.has(effekt.kind);
  const zeilen = [];
  for (const dist of ENTFERNUNGEN) {
    let ergebnis = null;
    if (waffe.delivery === 'hitscan' || (waffe.strikeStyle ?? 'self') !== 'self') {
      // Etwas Erhebung probieren: Sichtlinienwaffen werden am Hang bei 0 rad abgelehnt.
      for (const winkel of HITSCAN_WINKEL) {
        const r = schiesse(seed, dist, waffe, winkel, 100, fassung);
        if (r && (!ergebnis || r.schaden > ergebnis.schaden || (!ergebnis.ok && r.ok))) ergebnis = r;
      }
    } else {
      const l = zielloesung(seed, dist, waffe, fassung);
      if (l) {
        for (const c of l.kandidaten) {
          const r = schiesse(seed, dist, waffe, c.w, c.k, fassung);
          if (r && (!ergebnis || r.schaden > ergebnis.schaden)) ergebnis = r;
        }
      }
    }
    /*
     * JEDE angefragte Entfernung bleibt sichtbar — auch die, für die keine
     * freie Schusslinie gefunden wurde. Vorher fiel sie still aus der Liste,
     * und der Bericht behauptete eine Vollabdeckung, die es nicht gab.
     */
    zeilen.push(ergebnis
      ? { angefragt: dist, gemessen: ergebnis.dist, schaden: Number(ergebnis.schaden.toFixed(1)), ok: ergebnis.ok }
      : { angefragt: dist, gemessen: null, schaden: null, ok: false, grund: 'keine freie Schusslinie' });
  }
  /*
   * Für die Kennzahlen zählt jede tatsächlich gemessene Entfernung genau
   * einmal; verkürzt das Gelände mehrere Anfragen auf denselben Wert, ist das
   * eine Messung, keine Mehrfachzählung.
   */
  const einmalig = [];
  for (const z of zeilen) {
    if (z.gemessen !== null && !einmalig.some(e => e.gemessen === z.gemessen)) einmalig.push(z);
  }
  const frisch = frischeMunition(waffe, fassung);
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
    ausreichend[k] = stk[k] !== null && stk[k] <= frisch;
  }
  return {
    id: waffe.id,
    name: waffe.displayName,
    waffenfassung: fassung,
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
    /* Frische Munition aus dem Inventar, nicht der alte Katalogwert `maxAmmo`. */
    munition: munitionAnzeige(frisch),
    maxAmmoKatalog: waffe.maxAmmo,
    abklingzeit: waffe.cooldown ?? 0,
    stk, zuege, ausreichend,
    entfernungen: {
      angefragt: zeilen.map(z => z.angefragt),
      gemessen: einmalig.map(z => z.gemessen),
      nichtGemessen: zeilen.filter(z => z.gemessen === null).map(z => z.angefragt),
    },
    proEntfernung: zeilen,
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

/**
 * Der Spielvertrag OHNE Simulation: alle aktuellen Namen und Werte, Klassenleben
 * und die frische Munition aus dem Inventar. Das ist die schnelle Gegenprobe zu
 * `docs/waffenbalance-2026-11-09` und die Abnahme für BAL-06.
 */
export function vertrag(fassung = WAFFEN_FASSUNG) {
  const waffen = katalogFuer(fassung);
  const zaehler = { unbegrenzt: 0, 1: 0, 2: 0, 3: 0 };
  const zeilen = waffen.map(waffe => {
    const frisch = frischeMunition(waffe, fassung);
    const klasse = munitionAnzeige(frisch);
    zaehler[klasse] += 1;
    return {
      id: waffe.id,
      name: waffe.displayName,
      schaden: waffe.damage,
      maxAmmoKatalog: waffe.maxAmmo,
      frischmunition: klasse,
      kategorie: waffe.category,
      stufe: waffe.powerTier,
      /* Alle aktuellen Werte unter der gemessenen Fassung — nicht nur der Schaden. */
      werte: waffe,
    };
  });
  return {
    waffenfassung: fassung,
    klassenfassung: KLASSEN_STANDARD,
    schadenfassung: SCHADEN_STANDARD,
    windfassung: WIND_STANDARD,
    bodenobjektfassung: BODENOBJEKTE_STANDARD,
    katalog: waffen.length,
    eindeutigeIds: new Set(waffen.map(w => w.id)).size,
    klassenLeben: klassenGesundheit(),
    munition: zaehler,
    waffen: zeilen,
  };
}

function main() {
  const nur = typeof args.nur === 'string' ? new Set(args.nur.split(',')) : null;
  if (args.vertrag) {
    const v = vertrag();
    const waffen = nur ? v.waffen.filter(w => nur.has(w.id)) : v.waffen;
    const eindeutigeIds = new Set(waffen.map(w => w.id)).size;
    if (args.json) {
      console.log(JSON.stringify({ ...v, katalog: waffen.length, eindeutigeIds, waffen }, null, 1));
      return;
    }
    console.log(`Waffenvertrag: Waffenfassung ${v.waffenfassung}, Klassenfassung ${v.klassenfassung}, Schaden ${v.schadenfassung}, Wind ${v.windfassung}, Bodenobjekte ${v.bodenobjektfassung}`);
    console.log(`Waffen: ${waffen.length} (${eindeutigeIds} eindeutige IDs)`);
    console.log(`Klassenleben: ${Object.entries(v.klassenLeben).map(([k, hp]) => `${k} ${hp}`).join(', ')}`);
    console.log(`Frische Munition: ${v.munition.unbegrenzt} unbegrenzt, ${v.munition[3]}x3, ${v.munition[2]}x2, ${v.munition[1]}x1`);
    console.log('\nid      Name                       Schaden maxAmmo frisch');
    for (const w of waffen) {
      console.log(`${w.id}  ${w.name.slice(0, 26).padEnd(26)} ${String(w.schaden).padStart(7)} ${String(w.maxAmmoKatalog).padStart(7)} ${String(w.frischmunition).padStart(6)}`);
    }
    return;
  }
  const katalog = katalogFuer();
  const ziel = katalog.filter(w => !nur || nur.has(w.id));
  const ergebnisse = ziel.map((w, i) => messeWaffe(w, w.index ?? i));
  const { stufen, liste } = findeAusreisser(ergebnisse);
  if (args.json) {
    console.log(JSON.stringify({
      waffenfassung: WAFFEN_FASSUNG, klassenfassung: KLASSEN_STANDARD,
      gesundheit: klassenGesundheit(), entfernungen: ENTFERNUNGEN,
      stufen, ausreisser: liste, waffen: ergebnisse,
    }, null, 1));
    return;
  }
  console.log(`Waffenfassung ${WAFFEN_FASSUNG}, Klassenfassung ${KLASSEN_STANDARD}`);
  console.log(`Gesundheit: ${JSON.stringify(klassenGesundheit())}; Entfernungen ${ENTFERNUNGEN.join('/')} px (angefragt; gemessen steht je Waffe); Ziel steht still`);
  console.log('Median je Stufe (Waffen mit Schaden):');
  for (const s of STUFEN) console.log(`  ${s.padEnd(10)} n=${String(stufen[s].anzahl).padStart(2)}  Schaden ${String(stufen[s].medianSchaden).padStart(6)}  Reichweite ${stufen[s].medianReichweite}`);
  if (!args.ausreisser) {
    console.log(`\nid      Stufe     Name                       Kat.         Kat-Sch. Best  Reich. Treffer Mun CD  STK(${CLASS_IDS.map(k => k.slice(0, 3)).join('/')})`);
    for (const e of ergebnisse) {
      if (e.selbstwirkung) continue;
      const k = e.stk;
      console.log(`${e.id}  ${e.stufe.padEnd(9)} ${e.name.slice(0, 26).padEnd(26)} ${e.kategorie.padEnd(12)} ${String(e.schadenKatalog).padStart(5)} ${String(e.schadenBest).padStart(6)} ${String(e.reichweite).padStart(6)} ${e.trefferquote.toFixed(2).padStart(6)} ${String(e.munition).padStart(3)} ${String(e.abklingzeit).padStart(2)}  ${Object.values(k).join('/')}`);
    }
  }
  console.log(`\nAusreißer (${liste.length}):`);
  for (const a of liste) console.log(`  ${a.id} ${a.name} [${a.stufe}] ${a.art}: ${a.schadenBest} gegen Median ${a.median}${a.kontakt ? ` (Kontakt, Reichweite ${a.reichweite})` : ''}`);
}

if (import.meta.main) main();
