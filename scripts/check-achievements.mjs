#!/usr/bin/env node
/**
 * Prüft die Erfolgs-Schwellen gegen erreichbare Werte.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Ein Erfolg ist nur so gut wie seine Schwelle. Ein Erfolg „5000 Schaden in
 * einer Partie" wäre bei ~150 Schaden je Partie schlicht nicht zu holen — er
 * stünde für immer bei wenigen Prozent.
 *
 * Dieses Werkzeug rechnet jede Schwelle gegen gemessene Partiewerte und endet
 * mit **Exit-Code 1**, wenn ein Erfolg „KAUM ERREICHBAR" ist (unter 20 % des
 * Ziels). Damit ist die Frage nicht mehr nur eine Information: Dieselbe Zahl
 * kann nicht unbemerkt wieder in die Tabelle geraten.
 *
 * Der Anlass ist belegt: Der Tempo-Erfolg stand auf **200 Schaden je Minute**,
 * gemessen wurden **~12** — 6 % des Ziels. Die Schwelle ist auf 20 gesenkt.
 *
 * „streng" (20–50 % des Ziels) ist ausdrücklich erlaubt: Erfolge sollen
 * unterschiedlich schwer sein.
 *
 * ## Woher die Vergleichszahlen kommen
 *
 * Aus zwei Quellen, beide belegt:
 *
 *   1. **Partiewerte** — aus dem Balance-Bericht (`npm run balance:sweep`)
 *      und einer Simulation über mehrere Seeds: Runden, Schüsse, Treffer,
 *      Schaden je Partie.
 *   2. **Profilwerte** — aus einer angenommenen Spielhistorie (10 Partien,
 *      5 Siege), hochgerechnet aus den gemessenen Partiewerten.
 *
 * ## Aufruf
 *
 *     node scripts/check-achievements.mjs
 *     node scripts/check-achievements.mjs --partien=20   # längere Historie
 */
import { MatchController } from '../src/engine/match.js';
import { ACHIEVEMENTS, kennzahlen } from '../src/shared/achievements.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const PARTIEN = Number(args.get('partien') ?? 10);
const SEEDS = Number(args.get('seeds') ?? 4);

/**
 * Spielt eine Partie bis zum Ende und misst die Kennzahlen des Spielers.
 *
 * ## Warum hier `endTurn()` gerufen wird
 *
 * FUND (belegt, beim Bau dieses Werkzeugs): Ein erster Anlauf wartete nach dem
 * Schuss darauf, dass `activeProjectileCount` auf null geht — und hing. Der
 * Grund: Nach dem Einschlag bleibt der Zug offen, bis die Zeit abläuft. Ohne
 * ein `endTurn()` lief die Schleife bis zum Abbruch.
 *
 * Jetzt wird nach jedem Schuss der Zug abgegeben — das entspricht dem Spiel mit
 * sehr kurzer Bedenkzeit und bringt die Partie zuverlässig voran.
 */
function spielePartie(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const eigener = match.getState().entities.find(e => e.teamId === 0);
  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];

  let schuesse = 0;
  let treffer = 0;
  let schaden = 0;
  let runde = 0;
  let schutz = 0;

  while (match.status === 'playing' && schutz < 4000) {
    const zustand = match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (!aktiv?.alive) { match.endTurn(); schutz += 1; continue; }

    if (aktiv.teamId === 0) {
      const waffe = match.inventory?.getActiveWeaponId?.(eigener.entityId);
      const vorher = new Map(
        zustand.entities.filter(e => e.teamId === 1).map(e => [e.entityId, e.health]),
      );

      const ergebnis = match.fire(eigener.entityId, WINKEL[runde % WINKEL.length], 80, waffe);
      if (ergebnis.ok) { schuesse += 1; runde += 1; }

      // Einschlag abwarten, dann den Zug beenden.
      let s2 = 0;
      while (match.activeProjectileCount > 0 && s2 < 400) {
        match.step();
        match.consumeEvents();
        s2 += 1;
      }

      for (const gegner of match.getState().entities.filter(e => e.teamId === 1)) {
        const vor = vorher.get(gegner.entityId) ?? 0;
        if (gegner.health < vor) { treffer += 1; schaden += vor - gegner.health; }
      }
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  const ende = match.getState();
  return {
    seed,
    runden: ende.round ?? schutz,
    schuesse,
    treffer,
    schaden: Math.round(schaden),
    trefferquote: schuesse > 0 ? treffer / schuesse : 0,
    sieg: ende.winnerTeamId === 0,
  };
}

console.log(`Erfolgs-Prüfung: ${SEEDS} Partien, echte Simulation`);
console.log('');

const partien = [];
for (let i = 0; i < SEEDS; i += 1) {
  const p = spielePartie(1000 + i * 137);
  partien.push(p);
  console.log(
    `  Seed ${String(p.seed).padStart(6)}: ${String(p.runden).padStart(3)} Runden, `
    + `${String(p.schuesse).padStart(3)} Schüsse, ${String(p.treffer).padStart(3)} Treffer, `
    + `${String(p.schaden).padStart(5)} Schaden, ${(p.trefferquote * 100).toFixed(0)} %`
    + `${p.sieg ? '  (Sieg)' : ''}`,
  );
}

const mittel = feld => partien.reduce((s, p) => s + p[feld], 0) / partien.length;
const max = feld => Math.max(...partien.map(p => p[feld]));

console.log('');
console.log('Erreichte Werte je Partie:');
console.log(`  Schüsse       Mittel ${mittel('schuesse').toFixed(1)}  | bester ${max('schuesse')}`);
console.log(`  Treffer       Mittel ${mittel('treffer').toFixed(1)}  | bester ${max('treffer')}`);
console.log(`  Schaden       Mittel ${mittel('schaden').toFixed(0)}  | bester ${max('schaden')}`);
console.log(`  Trefferquote  Mittel ${(mittel('trefferquote') * 100).toFixed(0)} %  | beste ${(max('trefferquote') * 100).toFixed(0)} %`);
console.log(`  Runden        Mittel ${mittel('runden').toFixed(1)}  | längste ${max('runden')}`);
console.log(`  Siege         ${partien.filter(p => p.sieg).length} von ${partien.length}`);
console.log('');

/*
 * Die Kennzahlen, wie die Auswertung sie sieht. Die Partiewerte sind die
 * GEMESSENEN Mittel; die Profilwerte entstehen daraus hochgerechnet.
 */
const beispiel = {
  eigener: {
    schuesse: Math.round(mittel('schuesse')),
    treffer: Math.round(mittel('treffer')),
    schaden: Math.round(mittel('schaden')),
    zuege: Math.round(mittel('schuesse')),
    trefferquote: mittel('trefferquote'),
    sieg: true,
  },
  runden: Math.round(mittel('runden')),
  dauerSekunden: Math.round(mittel('runden') * 30),
  schadenGesamt: Math.round(mittel('schaden')),
};
const profil = {
  partien: PARTIEN,
  siege: Math.round(PARTIEN / 2),
  serie: 2,
  serieRekord: 3,
  schuesse: Math.round(mittel('schuesse') * PARTIEN),
  treffer: Math.round(mittel('treffer') * PARTIEN),
  schaden: Math.round(mittel('schaden') * PARTIEN),
  zuege: Math.round(mittel('schuesse') * PARTIEN),
  spielzeitSekunden: Math.round(mittel('runden') * 30 * PARTIEN),
  waffen: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`w${i}`, 1])),
  absorbierterSchaden: 120,
};
const k = kennzahlen(beispiel, profil);

console.log(`Erfolgs-Prüfung gegen eine Durchschnittspartie und ${PARTIEN} Partien Historie:`);
console.log('');
console.log(`${'Erfolg'.padEnd(32)}${'Kennzahl'.padEnd(24)}${'Ziel'.padStart(9)}${'Ist'.padStart(10)}  Urteil`);
console.log('-'.repeat(100));

/**
 * Kennzahlen, die EINE Partie beschreiben (oder eine Rate).
 *
 * Nur für sie ist „kaum erreichbar" ein Fehler: Sie werden in JEDER Partie neu
 * gemessen. Kumulative Kennzahlen (Gesamtschaden, Partien, Spielzeit) wachsen
 * dagegen mit der Historie — eine kurze angenommene Historie macht sie nicht
 * unerreichbar, sondern nur langwierig. Sie werden deshalb hochgerechnet statt
 * benotet.
 */
const PARTIE_KENNZAHLEN = new Set([
  'schuesse_partie', 'treffer_partie', 'schaden_partie', 'zuege_partie',
  'trefferquote_partie', 'runden', 'dauer_sekunden', 'schaden_gesamt_partie',
  'trefferquote', 'siegquote', 'schaden_pro_minute',
]);

/** Was je Partie dazukommt — Grundlage der Hochrechnung kumulativer Ziele. */
const PRO_PARTIE = Object.freeze({
  partien: 1,
  // Angenommene Siegquote wie in der Historie (PARTIEN Partien, die Hälfte Siege).
  siege: 0.5,
  schuesse: mittel('schuesse'),
  treffer: mittel('treffer'),
  schaden: mittel('schaden'),
  spielzeit_sekunden: mittel('runden') * 30,
});

const zeilen = [];
for (const a of ACHIEVEMENTS) {
  const bed = a.condition;
  const ist = k[bed.kennzahl];
  const titel = a.title;
  const kumulativ = !PARTIE_KENNZAHLEN.has(bed.kennzahl);

  if (ist === undefined) {
    zeilen.push({ titel, kz: bed.kennzahl, ziel: bed.wert, ist: '—', urteil: 'KENNZAHL FEHLT', kumulativ });
    continue;
  }
  const anteil = bed.wert > 0 ? ist / bed.wert : 0;

  let urteil;
  if (ist >= bed.wert) {
    urteil = 'erreicht';
  } else if (kumulativ) {
    const proPartie = PRO_PARTIE[bed.kennzahl];
    urteil = proPartie > 0
      ? `offen (~${Math.ceil((bed.wert - ist) / proPartie)} Partien)`
      : 'offen';
  } else {
    urteil = anteil >= 0.5 ? 'in Reichweite'
      : anteil >= 0.2 ? 'streng'
        : 'KAUM ERREICHBAR';
  }
  zeilen.push({
    titel,
    kz: bed.kennzahl,
    ziel: bed.wert,
    ist: typeof ist === 'number' ? (ist < 10 ? ist.toFixed(2) : Math.round(ist)) : String(ist),
    urteil,
    anteil,
    kumulativ,
  });
}

for (const z of zeilen) {
  console.log(
    `${z.titel.padEnd(32)}${z.kz.padEnd(24)}${String(z.ziel).padStart(9)}`
    + `${String(z.ist).padStart(10)}  ${z.urteil}`,
  );
}

/*
 * „streng" ist erlaubt — Erfolge SOLLEN unterschiedlich schwer sein. Ein
 * „KAUM ERREICHBAR" (unter 20 % des Ziels) ist dagegen ein Fehler in der Tabelle:
 * Der Erfolg fällt praktisch nie. Genau so stand es bis zum 2026-09-20 beim
 * Tempo-Erfolg (200 gefordert, ~7 erreicht = 3 %). Der Lauf endet deshalb mit
 * Exit-Code 1, damit dieselbe Zahl nicht wieder unbemerkt in die Tabelle kommt.
 *
 * Geprüft werden nur PARTIE- und RATEN-Kennzahlen — siehe PARTIE_KENNZAHLEN.
 */
const kaum = zeilen.filter(z => z.urteil === 'KAUM ERREICHBAR' || z.urteil === 'KENNZAHL FEHLT');
console.log('');
if (kaum.length > 0) {
  console.log(`FEHLER: ${kaum.length} Erfolge sind kaum erreichbar:`);
  for (const z of kaum) {
    const prozent = z.anteil !== undefined ? ` (${(z.anteil * 100).toFixed(0)} % des Ziels)` : '';
    console.log(`  ${z.titel}: ${z.kz} >= ${z.ziel}, erreicht ${z.ist}${prozent}`);
  }
  console.log('');
  console.log('  Ein Erfolg, der nie fällt, motiviert nicht. Schwelle senken oder Text');
  console.log('  ändern — die Vergleichszahlen stehen oben.');
  process.exitCode = 1;
} else {
  console.log('Alle Partie-Schwellen und Raten sind erreichbar oder in Reichweite.');
  const offen = zeilen.filter(z => z.urteil.startsWith('offen'));
  if (offen.length > 0) {
    console.log(`Kumulative Ziele brauchen Zeit (${offen.length}) — das ist gewollt.`);
  }
}

console.log('');
console.log('EINORDNUNG');
console.log('  Die Inhalte sind seit dem 2026-09-20 gesetzt; diese Prüfung schützt die');
console.log('  SCHWELLEN, nicht die Texte. Der Katalog umfasst 11 Erfolge — die');
console.log('  ursprüngliche Vorgabe nennt 100. Das ist eine Inhaltsfrage und im');
console.log('  Modulkopf von `src/shared/achievements.js` festgehalten.');
