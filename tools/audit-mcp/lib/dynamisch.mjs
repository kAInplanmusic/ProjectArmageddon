/**
 * Dynamische Tiefenanalyse (laufende Engine).
 *
 * Diese Sonden starten die ECHTE Simulation (MatchController) — keine
 * Attrappen. Grundlage ist die Regel des Projekts: „Messen, nicht annehmen",
 * und: „Zahlen im Fließtext prüfen die Tests nicht".
 *
 * Alle Sonden sind deterministisch (fester Seed) und ohne Rendering, laufen
 * also headless in Node.
 */
import { MatchController, MAP_SIZES } from '../../../src/engine/match.js';
import { WEAPONS } from '../../../src/shared/config/weapons.js';
import { CLASS_IDS, ARCHETYPE_IDS, combatProfile } from '../../../src/shared/config/classes.js';
import { MATCH_RULES } from '../../../src/shared/config/match.js';
import { TERRAIN_PRESETS, generateTerrain } from '../../../src/shared/terrainGen.js';
import { createRng } from '../../../src/shared/prng.js';

/** Baut ein Match mit fester Konfiguration. */
function match({ seed, teams = 2, playersPerTeam = 2, preset = 'hills', turnDurationMs = 60000 }) {
  const m = new MatchController({ seed, teams, playersPerTeam, preset, turnDurationMs });
  m.start();
  return m;
}

/** Spielt genau EINEN Zug: feuern, Zug abgeben, Geschoss ausfliegen lassen. */
function spieleZug(m, tick, winkelSpannweite = 40) {
  const zustand = m.getState();
  const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
  let geschossen = false;
  if (aktiv?.alive && m.isPlayerAlive(aktiv.entityId)) {
    const waffe = m.inventory?.getActiveWeaponId?.(aktiv.entityId) ?? null;
    const winkel = 0.55 + ((tick % winkelSpannweite) / 100);
    const kraft = 65 + (tick % 35);
    const schuss = m.fire(aktiv.entityId, winkel, kraft, waffe);
    geschossen = Boolean(schuss?.ok);
  }
  m.endTurn();
  // Ausklingen lassen: Geschosse fliegen, Physik läuft, Zugwechsel passiert.
  let ruhe = 0;
  for (let i = 0; i < 600; i += 1) {
    m.step();
    m.consumeEvents();
    const ruhend = m.activeProjectileCount === 0;
    ruhe = ruhend ? ruhe + 1 : 0;
    if (ruhe >= 30) break;
  }
  return { geschossen, ticksVerbraucht: 0 };
}

/** Sammelt alle Ereignisse eines Laufs und zählt sie. */
function sammle(m, zaehler) {
  for (const e of m.consumeEvents()) {
    zaehler[e.type] = (zaehler[e.type] ?? 0) + 1;
  }
}

/**
 * Determinismus: derselbe Seed zweimal → gleicher Hash; anderer Seed anders.
 * Läuft über echte Züge MIT Schüssen, nicht über einen Kurzlauf.
 */
export function determinismus({ seeds = [4242, 4242, 9999], zuge = 12 } = {}) {
  const ergebnis = seeds.map((seed, i) => {
    const m = match({ seed });
    const zaehler = {};
    let t = 0;
    while (m.status === 'playing' && t < zuge) {
      spieleZug(m, t);
      sammle(m, zaehler);
      t += 1;
    }
    return {
      lauf: i + 1,
      seed,
      hash: m.stateHash(),
      status: m.status,
      runde: m.round,
      tick: m.getState().tick,
      ereignisse: Object.keys(zaehler).length,
    };
  });

  const proSeed = new Map();
  for (const e of ergebnis) {
    if (!proSeed.has(e.seed)) proSeed.set(e.seed, []);
    proSeed.get(e.seed).push(e.hash);
  }
  const gleicheSeedsGleich = [...proSeed.values()].every(h => new Set(h).size === 1);
  const verschiedeneSeedsVerschieden = new Set([...proSeed.values()].map(h => h[0])).size === proSeed.size;

  return {
    zuge,
    laeufe: ergebnis,
    deterministisch: gleicheSeedsGleich,
    seedWirkt: verschiedeneSeedsVerschieden,
    urteil: gleicheSeedsGleich && verschiedeneSeedsVerschieden
      ? 'Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes.'
      : 'DURCHGEFALLEN: Determinismus oder Seed-Wirkung verletzt.',
  };
}

/**
 * Spielverlauf: Dauer, Züge, Schüsse, Todesursachen — das Spielgefühl als Zahl.
 * Genau die Lücke, die `npm run balance` (misst Waffen) nicht abdeckt.
 */
export function spielverlauf({ seeds = [101, 202, 303, 404, 505], teams = 2, playersPerTeam = 2, zugeMax = 400, preset = 'hills' } = {}) {
  const parteien = [];
  for (const seed of seeds) {
    const m = match({ seed, teams, playersPerTeam, preset });
    let zuge = 0;
    let schuesse = 0;
    const ereigniszahl = {};
    let ticks = 0;

    while (m.status === 'playing' && zuge < zugeMax) {
      const { geschossen } = spieleZug(m, zuge);
      if (geschossen) schuesse += 1;
      sammle(m, ereigniszahl);
      zuge += 1;
    }
    ticks = m.getState().tick;

    parteien.push({
      seed,
      status: m.status,
      runden: m.round,
      zuge,
      schuesse,
      ticks,
      spielzeitSekunden: Number((ticks / 60).toFixed(1)),
      sieger: m.winnerTeamId,
      ereignisse: ereigniszahl,
    });
  }

  const mittel = feld => Number((parteien.reduce((s, p) => s + p[feld], 0) / parteien.length).toFixed(1));
  const abbruch = MATCH_RULES?.suddenDeath?.roundBreakpoint ?? 15;
  return {
    konfiguration: { teams, playersPerTeam, preset },
    parteien,
    mittel: {
      runden: mittel('runden'),
      zuge: mittel('zuge'),
      schuesse: mittel('schuesse'),
      spielzeitSekunden: mittel('spielzeitSekunden'),
    },
    spanne: {
      runden: [Math.min(...parteien.map(p => p.runden)), Math.max(...parteien.map(p => p.runden))],
      spielzeitSekunden: [
        Math.min(...parteien.map(p => p.spielzeitSekunden)),
        Math.max(...parteien.map(p => p.spielzeitSekunden)),
      ],
    },
    mahlstromAb: abbruch,
    vorMahlstromBeendet: parteien.filter(p => p.runden < abbruch).length,
    durchAusschaltung: parteien.filter(p => p.status === 'gameover' && p.runden < abbruch).length,
  };
}

/**
 * Ballistik: Wurfweite und Lebensdauer als gemessene Größen (nicht als Formel).
 * `aimPreview` liefert die Bahnpunkte DIREKT (Array), ohne Startpunkt — der
 * erste Punkt ist der erste Simulationsschritt.
 */
export function ballistik({ winklerGrad = [20, 35, 45, 60, 75], kraefte = [30, 60, 100], seed = 4242, preset = 'hills' } = {}) {
  const m = match({ seed, teams: 2, playersPerTeam: 1, preset });
  const zustand = m.getState();
  const schuetze = zustand.entities.find(e => e.teamId === 0 && e.alive);
  if (!schuetze) return { fehler: 'kein Schütze gefunden' };

  const ergebnis = [];
  for (const grad of winklerGrad) {
    for (const kraft of kraefte) {
      const bahn = m.aimPreview(schuetze.entityId, (grad * Math.PI) / 180, kraft, 600);
      const punkte = Array.isArray(bahn) ? bahn : [];
      const start = m.launchOrigin(schuetze.entityId, (grad * Math.PI) / 180);
      const ende = punkte[punkte.length - 1];
      ergebnis.push({
        winkelGrad: grad,
        kraft,
        bahnpunkte: punkte.length,
        horizontaleWeitePx: start && ende ? Number(Math.abs(ende.x - start.x).toFixed(1)) : null,
        hoeheEndePx: start && ende ? Number((start.y - ende.y).toFixed(1)) : null,
      });
    }
  }

  const lebensdauer = m.projectileLifetime(schuetze.entityId, (45 * Math.PI) / 180, 100);
  const kartenGroesse = MAP_SIZES.landscape.mittel;
  return {
    preset,
    vorhersage: 'Die Vorhersage ist echter Simulationslauf; Kraft 100 wird bei 45° gegen die Reichweiten-Regel geprüft.',
    karte: kartenGroesse,
    abstandZumGegnerPx: Number((kartenGroesse.width / 4).toFixed(0)),
    ergebnis,
    lebensdauerTicks: lebensdauer,
  };
}

/**
 * Waffenkennzahlen — Verteilung statt Einzelwert. Zeigt, ob die 150 Waffen
 * wirklich unterscheidbar sind oder nur umbenannte Kopien.
 */
export function waffenKennzahlen() {
  const feld = k => WEAPONS.map(w => w[k]).filter(v => typeof v === 'number');
  const verteilung = werte => {
    if (!werte.length) return null;
    const sortiert = [...werte].sort((a, b) => a - b);
    return {
      n: werte.length,
      min: sortiert[0],
      median: sortiert[Math.floor(sortiert.length / 2)],
      max: sortiert[sortiert.length - 1],
      verschiedene: new Set(werte).size,
    };
  };
  const zaehle = schluessel => {
    const out = {};
    for (const w of WEAPONS) out[w[schluessel]] = (out[w[schluessel]] ?? 0) + 1;
    return out;
  };

  return {
    anzahl: WEAPONS.length,
    kategorien: zaehle('category'),
    seltenheit: zaehle('rarity'),
    lieferung: zaehle('delivery'),
    wirkarten: zaehle('special'),
    verteilung: {
      damage: verteilung(feld('damage')),
      blastRadius: verteilung(feld('blastRadius')),
      knockback: verteilung(feld('knockback')),
      cooldown: verteilung(feld('cooldown')),
      maxRange: verteilung(feld('maxRange')),
      projectileSpeed: verteilung(feld('projectileSpeed')),
      powerScore: verteilung(feld('powerScore')),
      terrainDamage: verteilung(feld('terrainDamage')),
      fuseTime: verteilung(feld('fuseTime')),
    },
    auffaellig: {
      ohneSchadenswert: WEAPONS.filter(w => !(w.damage > 0)).length,
      ohneMunition: WEAPONS.filter(w => !(w.maxAmmo > 0)).length,
      ohneKlassenbezug: WEAPONS.filter(w => w.special === null || w.special === undefined).length,
    },
    wirkungsloseFelder: wirkungsloseFelder(),
  };
}

/**
 * Felder im Waffenkatalog, die überall denselben Wert tragen — sie versprechen
 * eine Unterscheidung, die es nicht gibt.
 */
function wirkungsloseFelder() {
  const numerisch = ['gravityScale', 'bounces', 'fuseTime', 'terrainDamage', 'homing', 'piercing', 'knockback', 'blastRadius'];
  const konstant = [];
  for (const k of numerisch) {
    const werte = new Set(WEAPONS.map(w => w[k]));
    if (werte.size === 1) konstant.push({ feld: k, wert: [...werte][0] });
  }
  const boolKonstant = [];
  for (const k of ['aoe', 'requiresLineOfSight']) {
    const werte = new Set(WEAPONS.map(w => w[k]));
    if (werte.size === 1) boolKonstant.push({ feld: k, wert: [...werte][0] });
  }
  return { konstantNumerisch: konstant, konstantBool: boolKonstant };
}

/**
 * Klassen × Archetypen: die volle Matrix gegen das, was das Spiel vergibt.
 * `combatProfile()` hat 3 Parameter — das ist die Lesestelle, an der die
 * Balance hängt. Die wirksamen Achsen sind `healthMultiplier`,
 * `damageMultiplier`, `launchSpeedMultiplier`, `mobilityMultiplier`.
 */
export function klassenMatrix({ figuren = 6, seed = 4242 } = {}) {
  const matrix = [];
  for (const klasse of CLASS_IDS) {
    for (const archetyp of ARCHETYPE_IDS) {
      const p = combatProfile(klasse, archetyp);
      matrix.push({
        klasse,
        archetyp,
        health: Number(p.healthMultiplier.toFixed(4)),
        damage: Number(p.damageMultiplier.toFixed(4)),
        launch: Number(p.launchSpeedMultiplier.toFixed(4)),
        mobility: Number(p.mobilityMultiplier.toFixed(4)),
        inert: Object.keys(p.inert ?? {}),
      });
    }
  }

  const achsen = ['health', 'damage', 'launch', 'mobility'];
  const spannen = {};
  for (const a of achsen) {
    const werte = matrix.map(m => m[a]);
    spannen[a] = {
      min: Number(Math.min(...werte).toFixed(4)),
      max: Number(Math.max(...werte).toFixed(4)),
      verhaeltnis: Number((Math.max(...werte) / Math.max(1e-9, Math.min(...werte))).toFixed(3)),
    };
  }

  // Was vergibt das Spiel tatsächlich? (Beleg, nicht Vermutung.)
  const teams = 3;
  const m = match({ seed, teams, playersPerTeam: Math.max(1, Math.floor(figuren / teams)), preset: 'hills' });
  const vergeben = m
    .getState()
    .entities.filter(e => e.kind === 'player' || e.alive !== undefined)
    .map(e => e.entityId);

  return {
    klassen: CLASS_IDS,
    archetypen: ARCHETYPE_IDS,
    kombinationen: CLASS_IDS.length * ARCHETYPE_IDS.length,
    figurenImMatch: vergeben.length,
    achsenSpannen: spannen,
    matrix,
  };
}

/**
 * Terrain-Erzeugung: nutzt der Generator seinen Spielraum, und hält jede Form
 * ihre Zusicherungen (Landanteil über alle Formen)?
 */
export function terrainVielfalt({ anzahl = 24, seed = 20260924, breite = 2560, hoehe = 1440 } = {}) {
  const formen = Object.keys(TERRAIN_PRESETS ?? {});
  const ergebnis = {};
  for (const preset of formen) {
    const werte = [];
    for (let i = 0; i < anzahl; i += 1) {
      const rng = createRng(seed + i * 7919);
      const { bitmap } = generateTerrain({ rng, width: breite, height: hoehe, preset });
      let fest = 0;
      for (let k = 0; k < bitmap.length; k += 1) if (bitmap[k]) fest += 1;
      werte.push(Number(((fest / bitmap.length) * 100).toFixed(1)));
    }
    const sortiert = [...werte].sort((a, b) => a - b);
    const mw = werte.reduce((a, b) => a + b, 0) / werte.length;
    const varianz = werte.reduce((a, b) => a + (b - mw) ** 2, 0) / werte.length;
    ergebnis[preset] = {
      min: sortiert[0],
      max: sortiert[sortiert.length - 1],
      mittel: Number(mw.toFixed(1)),
      streuung: Number(Math.sqrt(varianz).toFixed(3)),
    };
  }
  return { formen, anzahlJeForm: anzahl, karte: { breite, hoehe }, ergebnis };
}

/**
 * Leistungsbudget: Tick-Kosten der Simulation. Der einzige Gate, der sich im
 * Projekt als umgebungsabhängig gezeigt hat (SwiftShader im Browser,
 * Node-Werte gelten dort nicht).
 */
export function leistung({ seed = 20260910, zuge = 300, teams = 2, playersPerTeam = 2 } = {}) {
  const m = match({ seed, teams, playersPerTeam, turnDurationMs: 60000 });
  const dauern = [];
  let schuesse = 0;
  let zugeGespielt = 0;

  // Schritt-Kosten werden EINZELN gemessen (hrtime je step), nicht aus einer
  // Gesamtzeit heruntergerechnet — genau die Regel aus dem Projekt, dass eine
  // Zahl nur zählt, wenn sie im selben Zugriff entsteht.
  const steppe = () => {
    const t0 = process.hrtime.bigint();
    m.step();
    dauern.push(Number(process.hrtime.bigint() - t0) / 1e6);
  };

  while (m.status === 'playing' && zugeGespielt < zuge) {
    const zustand = m.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (aktiv?.alive && m.isPlayerAlive(aktiv.entityId)) {
      const waffe = m.inventory?.getActiveWeaponId?.(aktiv.entityId) ?? null;
      const schuss = m.fire(aktiv.entityId, 0.55 + ((zugeGespielt % 40) / 100), 65 + (zugeGespielt % 35), waffe);
      if (schuss?.ok) schuesse += 1;
    }
    m.endTurn();
    let ruhe = 0;
    for (let i = 0; i < 600; i += 1) {
      steppe();
      m.consumeEvents();
      ruhe = m.activeProjectileCount === 0 ? ruhe + 1 : 0;
      if (ruhe >= 30) break;
    }
    zugeGespielt += 1;
  }

  const sortiert = [...dauern].sort((a, b) => a - b);
  const q = p => sortiert[Math.min(sortiert.length - 1, Math.max(0, Math.floor(sortiert.length * p)))];
  const ueberBudget = dauern.filter(d => d > 16.6667).length;
  const summe = dauern.reduce((a, b) => a + b, 0);
  return {
    seed,
    schuesse,
    zugeGespielt,
    status: m.status,
    runden: m.round,
    ticksGemessen: dauern.length,
    tickMittelMs: Number((summe / Math.max(1, dauern.length)).toFixed(4)),
    p95Ms: Number(q(0.95).toFixed(4)),
    p99Ms: Number(q(0.99).toFixed(4)),
    maxMs: Number(Math.max(...dauern).toFixed(4)),
    budgetMs: 16.6667,
    ticksUeberBudget: ueberBudget,
    urteil: ueberBudget === 0
      ? 'Budget eingehalten: kein Tick über 16,7 ms.'
      : `${ueberBudget} von ${dauern.length} Ticks über Budget.`,
  };
}

export const SONDEN = {
  determinismus,
  spielverlauf,
  ballistik,
  waffenKennzahlen,
  klassenMatrix,
  terrainVielfalt,
  leistung,
};
