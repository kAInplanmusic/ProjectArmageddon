#!/usr/bin/env node
/**
 * Misst Günther (`config.guenther`) und Cookie (`config.cookie`) in ECHTEN Bot-Partien.
 *
 * Es laufen volle Partien der Engine (Zielbot aus `bot-partien.mjs`, 2x2, Kit 4), mit den
 * Fassungen, die man übergibt. Aus den Ereignissen entsteht je Partie eine Bilanz; der Bericht
 * mittelt über alle Seeds: Aktionen je Partie (Häufigkeit, Heilung, Fund, Schaden), Rad-Anteile,
 * Cookies Hunger- und Miau-Verlauf, Füttern/Kuscheln, Hungerwut (Dauer, Schaden, Zerstörung),
 * Spielen und die Frage "entscheiden die Tiere Partien?" (Todesfälle durch Tier, letzter Tod).
 *
 * Zwei Spielweisen des Bots: `steht` (läuft nie, trifft Tiere nur, wenn sie zu ihm kommen),
 * `sucht` (springt auf ein Tier in Reichweite zu, wie ein Spieler, der das Rad / Cookie will) und
 * `sammelt` (springt auf die nächste Kiste zu: so zeigt sich, wie viele Kisten die Tiere den Spielern lassen).
 *
 * Aufruf: node scripts/tiere-verteilung.mjs [--seeds=24] [--guenther=3] [--cookie=2]
 *           [--weg=steht|sucht|sammelt] [--json]
 */
import { spiele } from './bot-partien.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const SEEDS = Number(args.seeds ?? 24);
const GUENTHER = Number(args.guenther ?? 2);
const COOKIE = Number(args.cookie ?? 2);
const WEG = args.weg ?? 'steht';

const plus = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

/** Läuft (springt) auf das nächste Tier zu, solange der Zug Zeit lässt. */
function suchen(match, aktiv, ev, kisten = false) {
  const z = match.getState();
  const ziele = kisten
    ? (z.crates ?? []).filter(k => k.x !== undefined)
    : [z.guenther?.aktiv ? z.guenther : null, z.cookie].filter(Boolean);
  if (!ziele.length) return;
  let ziel = null;
  let d = Infinity;
  for (const t of ziele) { const e = Math.abs(t.x - aktiv.x); if (e < d) { d = e; ziel = t; } }
  if (!ziel || d > 700) return;
  for (let sprung = 0; sprung < 14; sprung += 1) {
    const jetzt = match.getState().entities.find(e => e.entityId === aktiv.entityId);
    if (!jetzt?.alive || match.status !== 'playing') return;
    const dx = ziel.x - jetzt.x;
    if (Math.abs(dx) < 30) return;
    match.jump(aktiv.entityId, dx > 0 ? 1 : -1);
    for (let i = 0; i < 100; i += 1) { match.step(); ev(); if (i > 10 && match.isGrounded(aktiv.entityId)) break; }
  }
}

function neueBilanz() {
  return { aktion: {}, wirkung: {}, heilG: 0, funde: 0, kistenGefressen: 0, pee: 0, peeSchaden: 0, haufenTreffer: 0,
    rad: {}, radSchaden: 0, radHeilung: 0, radWaffe: 0, radSkip: 0,
    miau: {}, miauErst: {}, fuetter: {}, kuschel: 0, kuschelHeil: 0, tobt: 0, schlag: 0, schlagSchaden: 0,
    zerstoert: 0, objekte: 0, kraterWut: 0, erschoepft: 0, spielt: 0, schock: 0, schockGetroffen: 0,
    aufgehoben: 0, heilJe: {}, tierTode: 0, tierSchaden: 0, tierHeilung: 0, tode: 0, letzterTodTier: 0, tobTicks: 0, wutBeginn: null };
}

function messePartie(seed) {
  const b = neueBilanz();
  const ereignis = (liste, match) => {
    const batch = liste;
    const tierOpfer = new Set();
    for (const e of batch) {
      const p = e.payload ?? {};
      switch (e.type) {
        case 'crate_pickup': b.aufgehoben += 1; break;
        case 'guenther_aktion': plus(b.aktion, p.aktion); break;
        case 'guenther_aktion_wirkung':
          plus(b.wirkung, p.aktion);
          if (p.amount) { b.heilG += p.amount; b.tierHeilung += p.amount; plus(b.heilJe, p.playerId, p.amount); }
          if (p.fund) b.funde += 1;
          if (p.aktion === 'essen') b.kistenGefressen += 1;
          break;
        case 'guenther_pee': b.pee += 1; b.peeSchaden += p.amount; b.tierSchaden += p.amount; tierOpfer.add(p.playerId); break;
        case 'guenther_poop_hit': b.haufenTreffer += 1; break;
        case 'guenther_wheel':
          plus(b.rad, p.outcome);
          if (p.outcome === 'angriff') { b.radSchaden += p.amount; b.tierSchaden += p.amount; tierOpfer.add(p.playerId); }
          if (p.outcome === 'spielen') { b.radHeilung += p.amount; b.tierHeilung += p.amount; plus(b.heilJe, p.playerId, p.amount); }
          if (p.weaponId) b.radWaffe += 1;
          break;
        case 'cookie_miau': plus(b.miau, p.stufe); b.miauErst[p.stufe] ??= match.getState().tick; break;
        case 'cookie_gefuettert': plus(b.fuetter, p.wie); break;
        case 'cookie_kuschelt': b.kuschel += 1; b.kuschelHeil += p.amount; b.tierHeilung += p.amount; plus(b.heilJe, p.playerId, p.amount); break;
        case 'cookie_tobt': b.tobt += 1; b.wutBeginn = match.getState().tick; break;
        case 'cookie_erschoepft': b.erschoepft += 1; break;
        case 'cookie_zerstoert': b.zerstoert += 1; b.objekte += p.objekte ?? 0; break;
        case 'cookie_schlag': b.schlag += 1; b.schlagSchaden += p.amount; b.tierSchaden += p.amount; tierOpfer.add(p.playerId); break;
        case 'cookie_spielt': b.spielt += 1; break;
        case 'cookie_schockwelle': b.schock += 1; b.schockGetroffen += p.getroffen; break;
        default: break;
      }
    }
    for (const e of batch) {
      if (e.type !== 'death') continue;
      b.tode += 1;
      const tier = tierOpfer.has(e.payload.entityId);
      if (tier) b.tierTode += 1;
      b.letzterTodTier = tier ? 1 : 0;
    }
  };
  const extra = { guenther: GUENTHER, cookie: COOKIE };
  const r = spiele(seed, 4, { extra, ereignis, beiZug: WEG === 'sucht' ? suchen : (WEG === 'sammelt' ? (m, a, ev) => suchen(m, a, ev, true) : null) });
  b.heilMax = Math.max(0, ...Object.values(b.heilJe));
  b.waffenSchaden = r.schaden;
  b.minuten = r.minuten;
  b.runden = r.runden;
  b.ausgang = r.ausgang;
  return b;
}

const summe = (liste, f) => liste.reduce((s, x) => s + f(x), 0);
const mittel = (liste, f) => summe(liste, f) / liste.length;
const fmt = n => Number(n.toFixed(2));
const perz = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

const partien = [];
for (let i = 0; i < SEEDS; i += 1) partien.push(messePartie(7000 + i * 131));

const alleSchluessel = (feld) => [...new Set(partien.flatMap(p => Object.keys(p[feld])))].sort();
const je = (feld) => Object.fromEntries(alleSchluessel(feld).map(k => [k, fmt(mittel(partien, p => p[feld][k] ?? 0))]));
const erst = (stufe) => partien.map(p => p.miauErst[stufe]).filter(t => t !== undefined).map(t => t / 3600);

const ergebnis = {
  kopf: { seeds: SEEDS, guenther: GUENTHER, cookie: COOKIE, weg: WEG },
  partie: {
    minutenMedian: fmt(perz(partien.map(p => p.minuten), 0.5)), minutenP90: fmt(perz(partien.map(p => p.minuten), 0.9)),
    rundenMittel: fmt(mittel(partien, p => p.runden)),
  },
  guenther: {
    aktionenJeAktion: je('aktion'), wirkungenJeAktion: je('wirkung'),
    aktionenGesamt: fmt(mittel(partien, p => summe(Object.values(p.aktion), x => x))),
    heilungJePartie: fmt(mittel(partien, p => p.heilG)), kistenGefressen: fmt(mittel(partien, p => p.kistenGefressen)),
    fundeJePartie: fmt(mittel(partien, p => p.funde)),
    pinkelnJePartie: fmt(mittel(partien, p => p.pee)), pinkelSchaden: fmt(mittel(partien, p => p.peeSchaden)),
    haufenTreffer: fmt(mittel(partien, p => p.haufenTreffer)), haufenSchadenGeschaetzt: fmt(mittel(partien, p => p.haufenTreffer * 12)),
    radJePartie: je('rad'), radAngriffSchaden: fmt(mittel(partien, p => p.radSchaden)), radHeilung: fmt(mittel(partien, p => p.radHeilung)),
    radWaffen: fmt(mittel(partien, p => p.radWaffe)),
  },
  cookie: {
    miauJePartie: je('miau'),
    ersteMiauMin: Object.fromEntries(['leise', 'laut', 'wut'].map(s => [s, { median: erst(s).length ? fmt(perz(erst(s), 0.5)) : null, anteilPartien: fmt(erst(s).length / SEEDS) }])),
    gefuettert: je('fuetter'), kuscheln: fmt(mittel(partien, p => p.kuschel)),
    tobenJePartie: fmt(mittel(partien, p => p.tobt)), partienMitWut: fmt(partien.filter(p => p.tobt > 0).length / SEEDS),
    schlaegeJePartie: fmt(mittel(partien, p => p.schlag)), schlagSchaden: fmt(mittel(partien, p => p.schlagSchaden)),
    zerstoerungsSchritte: fmt(mittel(partien, p => p.zerstoert)), kistenZerstoert: fmt(mittel(partien, p => p.objekte)),
    kuschelnHeilung: fmt(mittel(partien, p => p.kuschelHeil)),
    erschoepftJePartie: fmt(mittel(partien, p => p.erschoepft)),
    spielenJePartie: fmt(mittel(partien, p => p.spielt)), partienMitSpielen: fmt(partien.filter(p => p.spielt > 0).length / SEEDS),
    schockwelleGetroffen: fmt(mittel(partien, p => p.schockGetroffen)),
  },
  entscheidung: {
    todeJePartie: fmt(mittel(partien, p => p.tode)), tierTodeJePartie: fmt(mittel(partien, p => p.tierTode)),
    partienMitTierTod: fmt(partien.filter(p => p.tierTode > 0).length / SEEDS),
    letzterTodDurchTier: fmt(partien.filter(p => p.letzterTodTier).length / SEEDS),
    tierSchadenJePartie: fmt(mittel(partien, p => p.tierSchaden)), tierHeilungJePartie: fmt(mittel(partien, p => p.tierHeilung)),
    kistenAufgehoben: fmt(mittel(partien, p => p.aufgehoben)),
    kistenAnTiere: fmt(mittel(partien, p => p.kistenGefressen + (p.fuetter.napf ?? 0) + p.objekte)),
    kistenAnteilAnTiere: fmt(summe(partien, p => p.kistenGefressen + (p.fuetter.napf ?? 0) + p.objekte) / Math.max(1, summe(partien, p => p.kistenGefressen + (p.fuetter.napf ?? 0) + p.objekte + p.aufgehoben))),
    waffenSchadenJePartie: fmt(mittel(partien, p => p.waffenSchaden)),
    tierSchadenAnteil: fmt(summe(partien, p => p.tierSchaden + p.haufenTreffer * 12) / Math.max(1, summe(partien, p => p.tierSchaden + p.haufenTreffer * 12 + p.waffenSchaden))),
    meisteHeilungEinesSpielers: fmt(mittel(partien, p => p.heilMax)),
    offen: partien.filter(p => p.ausgang === 'offen').length,
  },
};

if (args.json) console.log(JSON.stringify(ergebnis, null, 2));
else {
  const k = ergebnis.kopf;
  console.log(`Tiere in Bot-Partien: ${k.seeds} Seeds, guenther=${k.guenther}, cookie=${k.cookie}, Bot ${k.weg}`);
  console.log(JSON.stringify(ergebnis, null, 1).replace(/[{}",]/g, '').replace(/\n\s*\n/g, '\n'));
}
