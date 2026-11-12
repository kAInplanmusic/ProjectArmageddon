#!/usr/bin/env node
/**
 * Balancing je ROLLE statt global (Entscheidung 24 vom 2026-11-11, TODO BAL-1/BAL-14/BAL-17).
 *
 * Gemessen wird NICHT der Waffenkatalog (das macht `npm run balance`), sondern die Rolle der Figur:
 * Klassen (Fassung 3: nahkampf/fernkampf/okkultist) und die alten Klasse/Archetyp-Kombinationen
 * (Fassungen 1/2: 3 Klassen x 3 Archetypen = 9, davon 3 in der alten Platzvergabe und 6 NEUE
 * Kombinationen, die erst die freie Wahl erlaubt hat). Das Skript ÄNDERT keinen Spielwert und liest nur.
 *
 * ## Messaufbau (so, dass jede Zahl wiederholbar ist)
 *
 *   - Duelle 1 gegen 1 mit der Produktionskonfiguration (alle `*_STANDARD`-Fassungen wie in
 *     `lobbySession.js`, Start-Kit `KIT_STANDARD`), also ECHTE Lebenspunkte (BASE_HEALTH x Klassenfaktor:
 *     130/100/70), keine Normierung.
 *   - Feste Seeds: Spiel i nutzt `SEED_BASIS + SEED_SCHRITT * i` (Standard 20261111 + 131 * i). DIESELBEN
 *     Seeds gelten für jede Paarung und jede Karte; die Karte hängt nur von Seed und Format ab, nicht von
 *     der Klasse. Geradzahliges i: Figur A sitzt auf Platz 1 (zieht zuerst), ungeradzahliges: Figur B.
 *     Damit hebt sich der Vorteil des ersten Zuges über die Seeds auf; Spiegelpaarungen messen ihn (`ersterZug`).
 *   - Gleicher Bot für alle (`bot-partien.mjs`, `spiele()`): Gitter aus Winkel x Kraft über `aimPreview`, kleiner
 *     Zielfehler aus dem Seed. Bot `statisch` geht nur zum Rückzug (wie die dokumentierten Bot-Messungen);
 *     `vorruecken` geht vor dem Schuss bis höchstens `VORRUECKEN_ZIEL` px an den Gegner heran.
 *   - Kennzahlen je Rolle: Siegrate (Unentschieden = 0,5, Wilson-95-%-Intervall, Spiegelduelle nicht
 *     gezählt), Schaden je Zug (LP, Verlust des Gegners im eigenen Zug, schließt Umwelt ein), Trefferquote
 *     (Züge mit Schaden / Schüsse), Überlebensdauer (Minuten bis zum Tod, ohne Tod = bis Spielende, zensiert),
 *     Todesrate und Anteil Ertrinken.
 *   - Reichweite: rein rechnerisch mit den Funktionen des Spiels (`launchSpeedMultiplier`, `simulateFlight`), mit
 *     Gegenprobe gegen `aimPreview` (die ersten Bahnpunkte müssen übereinstimmen).
 *   - `ARCHETYPE_LAUNCH_BASE`: Rechnung je Kombination, die Wirkung auf Partien lässt sich in einer Wegwerfkopie
 *     messen (Befehl steht im Bericht); das Repository wird nie verändert.
 *
 * ## Staffelung (BAL-17: keine Vollabdeckung aus Stichproben behaupten)
 *
 *   - `klein`     Rauchprobe, Minuten (Tests, CI): 1 Karte, 1-2 Seeds.
 *   - `standard`  Voreinstellung: 3 Formate (24:9 gross = Menü-Standard, 16:9 mittel = Engine-Vorgabe, 4:3 klein),
 *                 6 Seeds je Paarung (Klassen), 4 Seeds je Paarung (alte Kombinationen, nur 24:9 gross).
 *   - `breit`     Vorschlag für den Folgelauf: 7 Formate x 2 Stufen, 20 Sonderbiome einzeln, 24 Seeds.
 *   Der Bericht nennt zu jeder Zahl, aus wie vielen Partien sie stammt. Eine Stufe belegt NUR ihre eigene Abdeckung.
 *
 * ## Fraktionen
 *
 * Die Engine liest keine Fraktion. Die 81 Figuren wirken allein über ihre Klasse (`role` -> Klasse, je 27).
 * Deshalb ist die Fraktionsebene hier keine Messachse, sondern eine Zuordnungsprüfung (`fraktionen` im Ergebnis).
 *
 * Aufruf:
 *   node scripts/balance-rollen.mjs [--stufe=standard] [--module=klassen,alt,scout,vorruecken,biome,reichweite]
 *        [--seeds=N] [--seed-basis=N] [--parallel=N] [--json] [--markdown] [--ausgabe=datei.json]
 *        [--paarung=nahkampf:okkultist]   (nur diese Paarung, für Stichproben und Tests)
 *
 * Laufzeit `standard`: rund 400 Partien (je ~3 s Rechenzeit), mit `--parallel=2` etwa 10 Minuten.
 */
import { execFileSync, fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spiele } from './bot-partien.mjs';
import {
  CLASS_IDS, LEGACY_CLASS_IDS, ARCHETYPE_IDS, CLASS_ARCHETYPES, ARCHETYPE_LAUNCH_BASE, combatProfile,
} from '../src/shared/config/classes.js';
import { KLASSEN_ALT, KLASSEN_SCOUT, KLASSEN_NEU } from '../src/shared/config/klassen-fassung.js';
import { KIT_STANDARD } from '../src/shared/config/loadouts.js';
import { GUENTHER_FASSUNG_STANDARD } from '../src/shared/config/guenther.js';
import { COOKIE_STANDARD } from '../src/shared/config/cookie.js';
import { FEUER_STANDARD } from '../src/shared/config/feuer.js';
import { BEWEGUNG_STANDARD } from '../src/shared/config/bewegung.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { SEIL_STANDARD } from '../src/shared/config/seil.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { ZUGREGELN_STANDARD } from '../src/shared/config/zugregeln.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { SONDERBIOM_IDS_FASSUNG_7 } from '../src/shared/config/biome-neu.js';
import { CHARACTERS, FACTIONS, classOf } from '../src/shared/config/factions.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import { simulateFlight, POWER_TO_SPEED, MAX_POWER } from '../src/shared/ballistics.js';
import { weitenFaktor } from '../src/shared/reichweite.js';
import { MatchController, BASE_HEALTH } from '../src/engine/match.js';
import { windFaktorFuerWaffe } from '../src/engine/shooting.js';

export const SEED_BASIS = 20261111;
export const SEED_SCHRITT = 131;
/** Bis auf diese Entfernung (px) geht der Bot `vorruecken` an den Gegner heran. */
export const VORRUECKEN_ZIEL = 450;
/** So lange (Sekunden Spielzeit) geht der Bot `vorruecken` höchstens, bevor er schießt. */
export const VORRUECKEN_SEKUNDEN = 14;

const KARTEN = Object.freeze({
  gross24: Object.freeze({ id: '24:9 gross', format: '24:9', groesse: 'gross' }),
  mittel16: Object.freeze({ id: '16:9 mittel', format: '16:9', groesse: 'mittel' }),
  klein43: Object.freeze({ id: '4:3 klein', format: '4:3', groesse: 'klein' }),
  klein16: Object.freeze({ id: '16:9 klein', format: '16:9', groesse: 'klein' }),
});

/** Staffelung der Abdeckung. `seeds` je Paarung und Karte. */
export const STUFEN = Object.freeze({
  klein: Object.freeze({
    klassen: { karten: [KARTEN.klein16], seeds: 2 },
    alt: { karten: [KARTEN.klein16], seeds: 1 },
    scout: { karten: [KARTEN.klein16], seeds: 1 },
    vorruecken: { karten: [KARTEN.klein16], seeds: 2 },
    biome: { karten: [KARTEN.klein16], seeds: 1, biome: ['klassisch'] },
  }),
  standard: Object.freeze({
    klassen: { karten: [KARTEN.gross24, KARTEN.mittel16, KARTEN.klein43], seeds: 6 },
    alt: { karten: [KARTEN.gross24], seeds: 4 },
    scout: { karten: [KARTEN.gross24], seeds: 4 },
    vorruecken: { karten: [KARTEN.gross24], seeds: 6 },
    biome: { karten: [KARTEN.gross24], seeds: 2, biome: ['klassisch', 'vulkan', 'eiswueste', 'schrott'] },
  }),
  breit: Object.freeze({
    klassen: { karten: [KARTEN.gross24, KARTEN.mittel16, KARTEN.klein43, KARTEN.klein16], seeds: 24 },
    alt: { karten: [KARTEN.gross24, KARTEN.mittel16], seeds: 12 },
    scout: { karten: [KARTEN.gross24, KARTEN.mittel16], seeds: 12 },
    vorruecken: { karten: [KARTEN.gross24, KARTEN.mittel16], seeds: 24 },
    biome: { karten: [KARTEN.gross24], seeds: 4, biome: ['klassisch', ...SONDERBIOM_IDS_FASSUNG_7] },
  }),
});

/* ------------------------------------------------------------------ Statistik */

/** Wilson-Intervall (95 %) für einen Anteil. */
export function wilson(erfolge, n, z = 1.96) {
  if (!(n > 0)) return { p: null, unten: null, oben: null, n: 0 };
  const p = erfolge / n;
  const nenner = 1 + (z * z) / n;
  const mitte = (p + (z * z) / (2 * n)) / nenner;
  const spanne = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / nenner;
  return { p, unten: Math.max(0, mitte - spanne), oben: Math.min(1, mitte + spanne), n };
}

const mittelwert = werte => (werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null);
const median = werte => {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Stichproben-Standardabweichung (n-1). */
const streuung = werte => {
  if (werte.length < 2) return null;
  const m = mittelwert(werte);
  return Math.sqrt(werte.reduce((a, b) => a + (b - m) ** 2, 0) / (werte.length - 1));
};
const runde = (wert, stellen = 2) => (wert === null || wert === undefined || Number.isNaN(wert) ? null : Number(wert.toFixed(stellen)));

/* ------------------------------------------------------------------ Konfiguration */

/** Konfiguration wie im Spielbetrieb (`lobbySession.js`); `kit`, Zerstörung, Waffen, Kisten, Schaden = Konstruktorvorgabe = Standard. */
export function produktion(klassen) {
  return {
    guenther: GUENTHER_FASSUNG_STANDARD,
    cookie: COOKIE_STANDARD,
    feuer: FEUER_STANDARD,
    bewegung: BEWEGUNG_STANDARD,
    zugregeln: ZUGREGELN_STANDARD,
    bodenobjekte: BODENOBJEKTE_STANDARD,
    seil: SEIL_STANDARD,
    wind: WIND_STANDARD,
    klassen,
  };
}

/** Kennung einer Rolle: `nahkampf` oder `scout/brawler`. */
const rollenName = r => (r.archetypeId ? `${r.classId}/${r.archetypeId}` : r.classId);

/** Alle Paarungen a <= b einer Rollenliste (inkl. Spiegel). */
export function paarungen(rollen) {
  const aus = [];
  for (let i = 0; i < rollen.length; i += 1) for (let j = i; j < rollen.length; j += 1) aus.push([rollen[i], rollen[j]]);
  return aus;
}

const KLASSEN_ROLLEN = CLASS_IDS.map(classId => ({ classId, archetypeId: null }));
const ALT_ROLLEN = LEGACY_CLASS_IDS.flatMap(classId => ARCHETYPE_IDS.map(archetypeId => ({ classId, archetypeId })));
/** Die drei Kombinationen der alten Platzvergabe (`index % 3` für Klasse UND Archetyp). */
export const ALTE_PLATZVERGABE = Object.freeze(LEGACY_CLASS_IDS.map((classId, i) => `${classId}/${ARCHETYPE_IDS[i]}`));

/* ------------------------------------------------------------------ ein Spiel */

/**
 * Spielt EIN Duell und liefert die Rohzahlen beider Plätze (Platz 0 zieht zuerst).
 * Läuft im Arbeitsprozess; reine Funktion von `job`.
 */
export function messeSpiel(job) {
  const plaetze = job.plaetze; // [{classId, archetypeId}, {...}]
  const extra = {
    ...produktion(job.klassen),
    format: job.karte.format,
    groesse: job.karte.groesse,
    loadouts: plaetze.map(p => ({ classId: p.classId, archetypeId: p.archetypeId })),
    ...(job.biom && job.biom !== 'klassisch' ? { biom: job.biom } : {}),
    ...(job.biom === 'klassisch' ? { biom: 'klassisch' } : {}),
  };
  const zuege = []; // { akteur, tick, hp: {id: lp} }
  let lpStart = null;
  const schuesse = {};
  const ertrunken = {};
  const todTick = {};
  let match = null;

  const bilanz = spiele(job.seed, KIT_STANDARD, {
    teams: 2,
    proTeam: 1,
    extra,
    ereignis: (liste, m) => {
      match = m;
      for (const e of liste) {
        if (e.type === 'shot') schuesse[e.payload.playerId] = (schuesse[e.payload.playerId] ?? 0) + 1;
        else if (e.type === 'drowning') ertrunken[e.payload.entityId] = true;
        else if (e.type === 'death') todTick[e.payload.entityId] = m.getState().tick;
      }
    },
    beiZug: (m, aktiv, ev) => {
      match = m;
      const zustand = m.getState();
      lpStart ??= Object.fromEntries(zustand.entities.map(e => [e.entityId, e.maxHealth]));
      zuege.push({
        akteur: aktiv.entityId,
        tick: zustand.tick,
        hp: Object.fromEntries(zustand.entities.map(e => [e.entityId, e.alive ? Math.max(0, e.health) : 0])),
      });
      if (job.bot === 'vorruecken') vorruecken(m, aktiv, ev);
    },
  });

  const ende = match.getState();
  const figuren = ende.entities; // Reihenfolge = Platz
  const hpEnde = Object.fromEntries(figuren.map(e => [e.entityId, e.alive ? Math.max(0, e.health) : 0]));
  const proPlatz = figuren.map((fig, platz) => {
    const gegner = figuren.find(e => e.entityId !== fig.entityId);
    const eigene = zuege.map((z, i) => ({ z, i })).filter(({ z }) => z.akteur === fig.entityId);
    let schaden = 0;
    let trefferZuege = 0;
    for (const { z, i } of eigene) {
      const danach = i + 1 < zuege.length ? zuege[i + 1].hp[gegner.entityId] : hpEnde[gegner.entityId];
      const verlust = Math.max(0, z.hp[gegner.entityId] - danach);
      schaden += verlust;
      if (verlust > 0) trefferZuege += 1;
    }
    const tot = todTick[fig.entityId] !== undefined;
    return {
      rolle: rollenName(plaetze[platz]),
      lp0: lpStart[fig.entityId],
      zuege: eigene.length,
      schuesse: schuesse[fig.entityId] ?? 0,
      schaden: runde(schaden, 2),
      trefferZuege,
      tot,
      todMinuten: tot ? runde(todTick[fig.entityId] / 3600, 3) : null,
      ertrunken: tot && Boolean(ertrunken[fig.entityId]),
    };
  });
  const sieger = bilanz.siegerTeam === null || bilanz.siegerTeam === undefined ? null
    : figuren.findIndex(e => e.teamId === bilanz.siegerTeam);
  return {
    seed: job.seed,
    karte: job.karte.id,
    biom: match.sonderbiom ?? 'klassisch',
    biomWahl: job.biom ?? null,
    bot: job.bot,
    klassen: job.klassen,
    sieger: sieger === -1 ? null : sieger,
    ausgang: bilanz.ausgang,
    runden: bilanz.runden,
    minuten: runde(bilanz.minuten, 3),
    plaetze: proPlatz,
  };
}

/** Geht der aktiven Figur vor dem Schuss auf den Gegner zu (Bot `vorruecken`). */
function vorruecken(match, aktiv, ev) {
  const start = match.getState();
  const gegner = start.entities.find(e => e.alive && e.teamId !== aktiv.teamId);
  if (!gegner || !match.gehen) return;
  const richtung = gegner.x > aktiv.x ? 1 : -1;
  for (let t = 0; t < VORRUECKEN_SEKUNDEN * 60 && match.status === 'playing' && match.activePlayerId === aktiv.entityId; t += 1) {
    if (t % 30 === 0) match.gehen.setzeRichtung(aktiv.entityId, richtung);
    match.step();
    ev();
    if (t % 30 === 29) {
      const jetzt = match.getState().entities.find(e => e.entityId === aktiv.entityId);
      if (!jetzt?.alive || Math.abs(gegner.x - jetzt.x) <= VORRUECKEN_ZIEL) break;
    }
  }
  match.gehen.setzeRichtung(aktiv.entityId, 0);
}

/* ------------------------------------------------------------------ Aufträge */

/** Baut die Spielaufträge eines Moduls. `nur` (`a:b`) beschränkt auf eine Paarung. */
export function bauePlan({ modul, rollen, klassen, stufe, seedBasis, bot = 'statisch', nur = null, filter = null, seeds = null }) {
  const cfg = stufe;
  const jobs = [];
  const n = seeds ?? cfg.seeds;
  let paare = paarungen(rollen);
  if (filter) paare = paare.filter(([a, b]) => filter(a, b));
  if (nur) {
    const [x, y] = nur.split(':');
    paare = paare.filter(([a, b]) => (rollenName(a) === x && rollenName(b) === y) || (rollenName(a) === y && rollenName(b) === x));
  }
  for (const karte of cfg.karten) {
    for (const biom of cfg.biome ?? [null]) {
      for (const [a, b] of paare) {
        for (let i = 0; i < n; i += 1) {
          const platzA = i % 2 === 0 ? 0 : 1;
          const plaetze = platzA === 0 ? [a, b] : [b, a];
          jobs.push({
            modul, klassen, bot, karte, biom, seed: seedBasis + SEED_SCHRITT * i,
            plaetze, a: rollenName(a), b: rollenName(b), seedIndex: i,
          });
        }
      }
    }
  }
  return jobs;
}

/* ------------------------------------------------------------------ Auswertung */

/** Rollenkennzahlen aus einer Spielliste. Siegrate zählt keine Spiegelduelle. */
export function wertAus(spiele_, rolle) {
  let n = 0;
  let siege = 0;
  let remis = 0;
  let zuege = 0;
  let schuesse = 0;
  let schaden = 0;
  let trefferZuege = 0;
  let toteAnz = 0;
  let ertrunkenAnz = 0;
  const lebenszeit = [];
  const schadenJeSpiel = []; // Schaden/Zug je Figur und Partie (für die Streuung)
  const lp = new Set();
  let figurenSpiele = 0;
  const gegner = {};
  for (const s of spiele_) {
    s.plaetze.forEach((p, platz) => {
      if (p.rolle !== rolle) return;
      const anderer = s.plaetze[1 - platz];
      figurenSpiele += 1;
      lp.add(p.lp0);
      zuege += p.zuege;
      schuesse += p.schuesse;
      schaden += p.schaden;
      trefferZuege += p.trefferZuege;
      if (p.zuege) schadenJeSpiel.push(p.schaden / p.zuege);
      if (p.tot) toteAnz += 1;
      if (p.ertrunken) ertrunkenAnz += 1;
      lebenszeit.push(p.tot ? p.todMinuten : s.minuten);
      if (anderer.rolle === rolle) return; // Spiegel: nicht in Siegrate
      n += 1;
      if (s.sieger === platz) siege += 1;
      else if (s.sieger === null) remis += 1;
      const g = (gegner[anderer.rolle] ??= { n: 0, siege: 0, remis: 0 });
      g.n += 1;
      if (s.sieger === platz) g.siege += 1;
      else if (s.sieger === null) g.remis += 1;
    });
  }
  const w = wilson(siege + remis * 0.5, n);
  return {
    rolle,
    lp: [...lp].join('/'),
    partien: n,
    figurenSpiele,
    siegrate: runde(w.p, 3),
    ci95: w.p === null ? null : [runde(w.unten, 3), runde(w.oben, 3)],
    siege,
    remis,
    schadenProZug: runde(zuege ? schaden / zuege : null, 2),
    schadenProZugStreuung: runde(streuung(schadenJeSpiel), 2),
    schadenProZugStdFehler: runde(schadenJeSpiel.length > 1 ? streuung(schadenJeSpiel) / Math.sqrt(schadenJeSpiel.length) : null, 2),
    trefferquote: runde(schuesse ? trefferZuege / schuesse : null, 3),
    schuesseProPartie: runde(figurenSpiele ? schuesse / figurenSpiele : null, 1),
    zuegeProPartie: runde(figurenSpiele ? zuege / figurenSpiele : null, 1),
    lebenszeitMin: runde(mittelwert(lebenszeit), 2),
    lebenszeitMedianMin: runde(median(lebenszeit), 2),
    todesrate: runde(figurenSpiele ? toteAnz / figurenSpiele : null, 3),
    ertrinkenAnteilAnTod: runde(toteAnz ? ertrunkenAnz / toteAnz : null, 3),
    gegner,
  };
}

/** Matrix Siegrate Zeile gegen Spalte (ohne Spiegel). */
export function matrix(spiele_, rollen) {
  const namen = rollen.map(rollenName);
  const zeilen = {};
  for (const r of namen) {
    const w = wertAus(spiele_, r);
    zeilen[r] = Object.fromEntries(namen.filter(g => g !== r).map(g => {
      const e = w.gegner[g];
      return [g, e ? { n: e.n, siegrate: runde((e.siege + e.remis * 0.5) / e.n, 2) } : null];
    }));
  }
  return zeilen;
}

/** Vorteil des ersten Zuges aus den Spiegelduellen (Platz 0 = zieht zuerst). */
export function ersterZug(spiele_) {
  let n = 0;
  let erster = 0;
  let remis = 0;
  for (const s of spiele_) {
    if (s.plaetze[0].rolle !== s.plaetze[1].rolle) continue;
    n += 1;
    if (s.sieger === 0) erster += 1;
    else if (s.sieger === null) remis += 1;
  }
  const w = wilson(erster + remis * 0.5, n);
  return { partien: n, siegrateErsterZug: runde(w.p, 3), ci95: w.p === null ? null : [runde(w.unten, 3), runde(w.oben, 3)] };
}

/** Zusammenfassung eines Moduls: Rollenkennzahlen, Matrix, erster Zug, Ausgänge, Abdeckung. */
export function fasseZusammen(spiele_, rollen) {
  const namen = rollen.map(rollenName);
  const rollenWerte = namen.map(r => wertAus(spiele_, r));
  const ausgaenge = {};
  for (const s of spiele_) ausgaenge[s.ausgang] = (ausgaenge[s.ausgang] ?? 0) + 1;
  const karten = {};
  const biome = {};
  for (const s of spiele_) {
    karten[s.karte] = (karten[s.karte] ?? 0) + 1;
    biome[s.biom] = (biome[s.biom] ?? 0) + 1;
  }
  return {
    partien: spiele_.length,
    ausgaenge,
    karten,
    biome,
    ersterZug: ersterZug(spiele_),
    medianMinuten: runde(median(spiele_.map(s => s.minuten)), 2),
    rollen: rollenWerte,
    matrix: matrix(spiele_, rollen),
  };
}

/* ------------------------------------------------------------------ Reichweite, Skalierung */

const PROJEKTILWAFFEN = WEAPONS.map(w => getWaffe(w.id, WAFFEN_STANDARD))
  .filter(w => w.delivery === 'projectile' && w.maxRange > 0);

/** Wurfweite (px) einer Waffe bei voller Kraft und bestem Winkel, ebener Boden, Abschuss `HOEHE` px über dem Boden, kein Wind. */
export function wurfweite({ waffe, classId, archetypeId = null, klassen, breite, hoehe = 10 }) {
  const speed = MAX_POWER * POWER_TO_SPEED * launchSpeedMultiplier({
    classId, archetypeId, weapon: waffe, klassen, kartenbreite: breite,
  });
  let best = 0;
  for (let grad = 5; grad <= 85; grad += 1) {
    const bahn = simulateFlight({
      x: 0, y: -hoehe, angle: (grad * Math.PI) / 180, power: MAX_POWER, speed,
      gravityScale: waffe.gravityScale ?? 1, steps: 4000, includeStart: true, isSolid: (_x, y) => y >= 0,
    });
    const letzter = bahn.points[bahn.points.length - 1];
    if (letzter && letzter.x > best) best = letzter.x;
  }
  return best;
}

/** Reichweite je Rolle und Kartenbreite relativ zur Katalogzahl `maxRange`, plus Erreichbarkeit der Startentfernung. */
export function messeReichweite() {
  const breiten = [1280, 2560, 4704];
  const profile = [
    { name: 'neutral (fernkampf, F3)', classId: 'fernkampf', archetypeId: null, klassen: KLASSEN_NEU },
    ...CLASS_IDS.filter(c => c !== 'fernkampf').map(c => ({ name: `${c} (F3)`, classId: c, archetypeId: null, klassen: KLASSEN_NEU })),
    ...ALT_ROLLEN.map(r => ({ name: `${rollenName(r)} (F2)`, classId: r.classId, archetypeId: r.archetypeId, klassen: KLASSEN_SCOUT })),
  ];
  const startAbstand = { 1280: 1280 / 3, 2560: 2560 / 3, 4704: 4704 / 3 };
  const zeilen = profile.map(p => {
    const je = {};
    for (const breite of breiten) {
      const verhaeltnisse = [];
      let erreichen = 0;
      for (const waffe of PROJEKTILWAFFEN) {
        const w = wurfweite({ waffe, ...p, breite });
        verhaeltnisse.push(w / waffe.maxRange);
        if (w >= startAbstand[breite]) erreichen += 1;
      }
      je[breite] = {
        medianVerhaeltnis: runde(median(verhaeltnisse), 3),
        p10: runde([...verhaeltnisse].sort((a, b) => a - b)[Math.floor(verhaeltnisse.length * 0.1)], 3),
        p90: runde([...verhaeltnisse].sort((a, b) => a - b)[Math.floor(verhaeltnisse.length * 0.9)], 3),
        waffenErreichenStartabstand: erreichen,
        startabstandPx: Math.round(startAbstand[breite]),
      };
    }
    const profil = combatProfile(p.classId, p.archetypeId, null, p.klassen);
    return { profil: p.name, tempoFaktor: runde(profil.launchSpeedMultiplier, 3), je };
  });
  return {
    projektilwaffen: PROJEKTILWAFFEN.length,
    weitenfaktor: Object.fromEntries(breiten.map(b => [b, runde(weitenFaktor(b), 3)])),
    zeilen,
    gegenprobe: gegenprobeBahn(),
  };
}

/** Gegenprobe: `aimPreview` des echten Matches gegen die Rechnung hier — größte Abweichung der ersten 40 Bahnpunkte (px). */
export function gegenprobeBahn() {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, ...produktion(KLASSEN_NEU), format: '24:9', groesse: 'gross',
    loadouts: [{ classId: 'fernkampf', archetypeId: null }, { classId: 'okkultist', archetypeId: null }],
  });
  match.start();
  const zustand = match.getState();
  const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
  const waffe = getWaffe(aktiv.activeWeaponId, WAFFEN_STANDARD);
  const winkel = Math.PI / 4;
  const bahn = match.aimPreview(aktiv.entityId, winkel, 100, 120, waffe);
  const speed = MAX_POWER * POWER_TO_SPEED * launchSpeedMultiplier({
    classId: 'fernkampf', archetypeId: null, weapon: waffe, klassen: KLASSEN_NEU, kartenbreite: match.width,
  });
  // `aimPreview` startet an der Figurposition (launchVector), nicht an der Mündung (`launchOrigin`, hier 5 px höher).
  const ursprung = { x: aktiv.x, y: aktiv.y };
  // Wie `aimPreview` (shooting.js): Abtastung alle 3 Schritte, Wind und Windfaktor der Waffe, Punkte NACH dem ersten Schritt.
  const eigene = simulateFlight({
    x: ursprung.x, y: ursprung.y, angle: winkel, power: MAX_POWER, speed, gravityScale: waffe.gravityScale ?? 1,
    windFactor: windFaktorFuerWaffe(waffe, match.config?.wind ?? WIND_STANDARD), wind: zustand.wind ?? 0,
    steps: 120, sampleEvery: 3, includeStart: false,
  }).points;
  let maximal = 0;
  const n = Math.min(40, bahn.length, eigene.length);
  for (let i = 0; i < n; i += 1) maximal = Math.max(maximal, Math.hypot(bahn[i].x - eigene[i].x, bahn[i].y - eigene[i].y));
  return { waffe: waffe.id, punkteVerglichen: n, maxAbweichungPx: runde(maximal, 4) };
}

/** `ARCHETYPE_LAUNCH_BASE`: Wirkung einer Normalisierung (Rechnung; Partienwirkung siehe Bericht, Wegwerfkopie). */
export function messeLaunchBase() {
  const launches = ARCHETYPE_IDS.map(a => CLASS_ARCHETYPES[a].launch);
  const mittel = mittelwert(launches);
  const kandidaten = [
    { name: 'Ist: 1,2 (kein Archetyp hat diesen Wert)', basis: ARCHETYPE_LAUNCH_BASE },
    { name: 'Mittel der drei Archetypen', basis: mittel },
    { name: 'brawler (1,1) = neutral', basis: CLASS_ARCHETYPES.brawler.launch },
    { name: 'artillerist (1,4) = neutral', basis: CLASS_ARCHETYPES.artillerist.launch },
  ];
  return kandidaten.map(k => {
    const geschw = ARCHETYPE_LAUNCH_BASE / k.basis; // Faktor auf die Abschussgeschwindigkeit aller alten Kombinationen
    return {
      variante: k.name,
      basis: runde(k.basis, 4),
      geschwindigkeit: runde(geschw, 4),
      geschwindigkeitProzent: runde((geschw - 1) * 100, 1),
      reichweiteProzent: runde((geschw * geschw - 1) * 100, 1),
      tempoJeArchetyp: Object.fromEntries(ARCHETYPE_IDS.map(a => [a, runde(CLASS_ARCHETYPES[a].launch / k.basis, 3)])),
    };
  });
}

/** Nominale Wirkfaktoren aller Rollen (Quelle der Messung). */
export function profilTabelle() {
  const zeilen = [];
  for (const r of KLASSEN_ROLLEN) zeilen.push({ rolle: rollenName(r), fassung: 3, ...profilWerte(r, KLASSEN_NEU) });
  for (const r of ALT_ROLLEN) {
    zeilen.push({
      rolle: rollenName(r),
      fassung: 2,
      neueKombination: !ALTE_PLATZVERGABE.includes(rollenName(r)),
      ...profilWerte(r, KLASSEN_SCOUT),
    });
  }
  return zeilen;
}

function profilWerte(r, klassen) {
  const p = combatProfile(r.classId, r.archetypeId, null, klassen);
  return {
    lp: Math.round(BASE_HEALTH * p.healthMultiplier),
    leben: runde(p.healthMultiplier, 3),
    wucht: runde(p.damageMultiplier, 3),
    tempo: runde(p.launchSpeedMultiplier, 3),
    beweglichkeit: runde(p.mobilityMultiplier, 3),
    summe: runde(p.healthMultiplier + p.damageMultiplier + p.launchSpeedMultiplier + p.mobilityMultiplier, 3),
    wurfweiteRelativ: runde(p.launchSpeedMultiplier ** 2, 3),
  };
}

/** Fraktionen: die Engine liest keine; geprüft wird nur, dass jede Fraktion je Klasse gleich viele Figuren stellt. */
export function pruefeFraktionen() {
  const je = {};
  for (const c of CHARACTERS) {
    const klasse = classOf(c);
    (je[c.faction] ??= {})[klasse] = ((je[c.faction] ??= {})[klasse] ?? 0) + 1;
  }
  const gleich = FACTIONS.every(f => CLASS_IDS.every(k => (je[f.id]?.[k] ?? 0) === 3));
  return { fraktionen: FACTIONS.length, figuren: CHARACTERS.length, dreiJeKlasseUndFraktion: gleich, engineLiestFraktion: false };
}

/* ------------------------------------------------------------------ Ausführung */

/** Führt Aufträge aus: im selben Prozess (`parallel` 1) oder in Arbeitsprozessen. */
async function fuehreAus(jobs, parallel, fortschritt) {
  if (parallel <= 1 || jobs.length < 2) {
    return jobs.map((j, i) => { const r = messeSpiel(j); fortschritt?.(i + 1, jobs.length); return r; });
  }
  const ergebnisse = new Array(jobs.length);
  let naechster = 0;
  let fertig = 0;
  const pfad = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, () => new Promise((ok, fehler) => {
    const kind = fork(pfad, ['--arbeiter'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const naechsteAufgabe = () => {
      if (naechster >= jobs.length) { kind.send({ ende: true }); return; }
      const index = naechster; naechster += 1;
      kind.send({ index, job: jobs[index] });
    };
    kind.on('message', m => {
      if (m.fehler) { fehler(new Error(m.fehler)); return; }
      ergebnisse[m.index] = m.ergebnis;
      fertig += 1;
      fortschritt?.(fertig, jobs.length);
      naechsteAufgabe();
    });
    kind.on('exit', () => ok());
    kind.on('error', fehler);
    naechsteAufgabe();
  })));
  return ergebnisse;
}

function stand() {
  const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) }).trim(); } catch { return null; } };
  const hash = git('rev-parse', '--short=10', 'HEAD');
  const veraendert = (git('status', '--porcelain', '--', 'src', 'scripts/bot-partien.mjs', 'scripts/balance-rollen.mjs') ?? '').split('\n').filter(Boolean);
  return { commit: hash, ungespeicherteAenderungenInSrc: veraendert.filter(z => z.includes(' src/')).length, waffenfassung: WAFFEN_STANDARD, kit: KIT_STANDARD };
}

/** Läuft alle gewählten Module und liefert das Gesamtergebnis. */
export async function laufe({
  stufe = 'standard', module = ['klassen', 'alt', 'scout', 'vorruecken', 'biome', 'reichweite'], seeds = null,
  seedBasis = SEED_BASIS, parallel = 1, nur = null, fortschritt = null,
} = {}) {
  const cfg = STUFEN[stufe];
  if (!cfg) throw new Error(`Unbekannte Stufe: ${stufe}`);
  const aus = { stand: stand(), parameter: { stufe, module, seeds, seedBasis, nur }, stufeConfig: cfg };
  const lauf = async (name, rollen, klassen, optionen = {}) => {
    const jobs = bauePlan({
      modul: name, rollen, klassen, stufe: cfg[optionen.cfg ?? name], seedBasis, nur, seeds, ...optionen.plan,
    });
    const t = Date.now();
    const roh = await fuehreAus(jobs, parallel, fortschritt && ((i, n) => fortschritt(name, i, n)));
    return { zusammenfassung: fasseZusammen(roh, rollen), sekunden: Math.round((Date.now() - t) / 1000), spiele: optionen.rohdaten ? roh : undefined };
  };
  if (module.includes('klassen')) aus.klassen = await lauf('klassen', KLASSEN_ROLLEN, KLASSEN_NEU);
  if (module.includes('alt')) aus.alt = await lauf('alt', ALT_ROLLEN, KLASSEN_SCOUT);
  if (module.includes('scout')) {
    const istScout = r => r.classId === 'scout';
    // Fassung 1 (alter Scout) gegen alle Nicht-Scouts; Fassung 2 mit denselben Seeds liefert `alt`.
    aus.scoutFassung1 = await lauf('scout', ALT_ROLLEN, KLASSEN_ALT, { plan: { filter: (a, b) => istScout(a) !== istScout(b) } });
    aus.scoutFassung2 = await lauf('scout', ALT_ROLLEN, KLASSEN_SCOUT, { plan: { filter: (a, b) => istScout(a) !== istScout(b) } });
  }
  if (module.includes('vorruecken')) aus.vorruecken = await lauf('vorruecken', KLASSEN_ROLLEN, KLASSEN_NEU, { plan: { bot: 'vorruecken' } });
  if (module.includes('biome')) aus.biome = await lauf('biome', KLASSEN_ROLLEN, KLASSEN_NEU);
  if (module.includes('reichweite')) {
    aus.reichweite = messeReichweite();
    aus.launchBase = messeLaunchBase();
  }
  aus.profile = profilTabelle();
  aus.fraktionen = pruefeFraktionen();
  return aus;
}

/* ------------------------------------------------------------------ Ausgabe */

const pz = v => (v === null || v === undefined ? '–' : `${Math.round(v * 100)} %`);
const ci = r => (r.ci95 ? `${Math.round(r.ci95[0] * 100)}–${Math.round(r.ci95[1] * 100)} %` : '–');

/** Markdown-Tabellen eines Modulergebnisses. */
export function tabellen(titel, z) {
  const zeilen = [`#### ${titel}`, ''];
  zeilen.push(`Partien: ${z.partien}; Ausgänge: ${JSON.stringify(z.ausgaenge)}; Karten: ${JSON.stringify(z.karten)}; Median Spieldauer ${z.medianMinuten} min; erster Zug gewinnt in Spiegelduellen ${pz(z.ersterZug.siegrateErsterZug)} (n=${z.ersterZug.partien}, 95 %: ${z.ersterZug.ci95 ? `${Math.round(z.ersterZug.ci95[0] * 100)}–${Math.round(z.ersterZug.ci95[1] * 100)} %` : '–'}).`, '');
  zeilen.push('| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |');
  zeilen.push('|---|---:|---:|---:|---|---:|---:|---:|---:|---:|');
  for (const r of z.rollen) {
    zeilen.push(`| ${r.rolle} | ${r.lp} | ${r.partien} | ${pz(r.siegrate)} | ${ci(r)} | ${r.schadenProZug ?? '–'} (± ${r.schadenProZugStreuung ?? '–'}) | ${pz(r.trefferquote)} | ${r.lebenszeitMedianMin ?? '–'} | ${pz(r.todesrate)} | ${pz(r.ertrinkenAnteilAnTod)} |`);
  }
  const namen = Object.keys(z.matrix);
  zeilen.push('', `Siegrate Zeile gegen Spalte (n je Zelle in Klammern):`, '');
  zeilen.push(`| | ${namen.join(' | ')} |`);
  zeilen.push(`|---|${namen.map(() => '---:').join('|')}|`);
  for (const r of namen) {
    zeilen.push(`| ${r} | ${namen.map(g => (r === g ? '·' : (z.matrix[r][g] ? `${Math.round(z.matrix[r][g].siegrate * 100)} % (${z.matrix[r][g].n})` : '–'))).join(' | ')} |`);
  }
  return zeilen.join('\n');
}

function hilfe() {
  console.log(`balance-rollen: Balancing je Rolle (Duelle mit festen Seeds, echte LP).
  --stufe=klein|standard|breit   Abdeckung (Standard: standard)
  --module=klassen,alt,scout,vorruecken,biome,reichweite
  --seeds=N                      Seeds je Paarung und Karte überschreiben
  --seed-basis=N                 Seed des ersten Spiels (Standard ${SEED_BASIS}), Schritt ${SEED_SCHRITT}
  --paarung=a:b                  nur diese Paarung (z. B. nahkampf:okkultist)
  --parallel=N                   Arbeitsprozesse (Standard: min(2, Kerne))
  --json | --markdown | --ausgabe=datei.json`);
}

async function haupt() {
  const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
  if (args.hilfe || args.help) { hilfe(); return; }
  const modulListe = typeof args.module === 'string' ? args.module.split(',') : undefined;
  const ergebnis = await laufe({
    stufe: args.stufe ?? 'standard',
    module: modulListe,
    seeds: args.seeds ? Number(args.seeds) : null,
    seedBasis: args['seed-basis'] ? Number(args['seed-basis']) : SEED_BASIS,
    parallel: args.parallel ? Number(args.parallel) : Math.min(2, cpus().length),
    nur: typeof args.paarung === 'string' ? args.paarung : null,
    fortschritt: args.json ? null : (name, i, n) => { if (i === n || i % 20 === 0) process.stderr.write(`  ${name}: ${i}/${n}\n`); },
  });
  if (typeof args.ausgabe === 'string') {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.ausgabe, `${JSON.stringify(ergebnis, null, 2)}\n`);
  }
  if (args.json) { console.log(JSON.stringify(ergebnis, null, 2)); return; }
  console.log(`Stand: Commit ${ergebnis.stand.commit}, geänderte Quelldateien in src/: ${ergebnis.stand.ungespeicherteAenderungenInSrc}, Waffenfassung ${ergebnis.stand.waffenfassung}, Kit ${ergebnis.stand.kit}`);
  for (const [schluessel, titel] of [['klassen', 'Klassen (Fassung 3), Bot statisch'], ['alt', 'Alte Kombinationen (Fassung 2), Bot statisch'],
    ['scoutFassung1', 'Scout gegen Rest, Fassung 1'], ['scoutFassung2', 'Scout gegen Rest, Fassung 2'], ['vorruecken', 'Klassen (Fassung 3), Bot vorrückend'], ['biome', 'Klassen nach Biom']]) {
    if (ergebnis[schluessel]) console.log(`\n${tabellen(titel, ergebnis[schluessel].zusammenfassung)}`);
  }
  if (ergebnis.reichweite) {
    console.log('\n#### Reichweite (Median Wurfweite / maxRange, volle Kraft, ebener Boden)\n');
    console.log(JSON.stringify(ergebnis.reichweite, null, 1));
    console.log(JSON.stringify(ergebnis.launchBase, null, 1));
  }
  console.log(`\nFraktionen: ${JSON.stringify(ergebnis.fraktionen)}`);
}

if (process.argv.includes('--arbeiter')) {
  // Arbeitsprozess: Aufträge über IPC, Ergebnisse zurück.
  process.on('message', m => {
    if (m.ende) { process.exit(0); }
    try { process.send({ index: m.index, ergebnis: messeSpiel(m.job) }); } catch (e) { process.send({ fehler: String(e?.stack ?? e) }); }
  });
} else if (import.meta.main) {
  haupt().catch(e => { console.error(e); process.exit(1); });
}
