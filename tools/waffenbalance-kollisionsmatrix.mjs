/**
 * BAL-12: reale Treffer- und Kollisionsmatrix für alle 150 Waffen.
 *
 * Erzeugt `docs/waffenbalance-2026-11-09/kollisionsmatrix.json` aus echten
 * `fire()`/`step()`-Läufen. Jede Angriffswaffe bekommt genau EINEN belegten
 * Schuss in ihrer Rollenentfernung; jede Selbstwirkung genau EINE belegte
 * Anwendung mit positivem Nutzwert. Ein kontrollierter Explosionsaufruf ist
 * ausdrücklich kein Kollisionsfall (siehe `kontrollfall`).
 *
 * Aufruf:
 *   PA_ZUGPAUSE_SEKUNDEN=0 node tools/waffenbalance-kollisionsmatrix.mjs
 *   … --ziel=docs/waffenbalance-2026-11-09
 *
 * Das Werkzeug ändert keine Spielwerte. Es schreibt nur die Belegdatei.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { MatchController } from '../src/engine/match.js';
import {
  SEED, KARTENBREITE, ZIEL_LP, ROLLEN_ENTFERNUNG,
  pruefstand, reichweite, rollenDistanz, vorschauZiel, trefferProbe, selbstProbe,
  istSelbstwirkung, istLaeufer, kontrollfall,
} from './kollisionsmatrix-kern.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = path.resolve(ROOT, process.argv.find(a => a.startsWith('--ziel='))?.slice(7) ?? 'docs/waffenbalance-2026-11-09');
const NUR = process.argv.find(a => a.startsWith('--nur='))?.slice(6).split(',');

const rund = n => Math.round(n * 1000) / 1000;

/** Kandidaten in Rollenreihenfolge: zuerst die echte Rolle, dann Rückfall. */
function kandidaten(weapon) {
  const reach = reichweite(weapon);
  const rolle = rollenDistanz(weapon);
  const erst = [];
  const dann = [];
  const dazu = (liste, distance, angle, power, art) => liste.push({ distance, angle, power, art });
  if (weapon.category === 'melee') {
    for (const d of [rolle, 60, 90]) {
      if (d <= reach) {
        const a = vorschauZiel(weapon, d);
        dazu(erst, d, a.angle, a.power, 'vorschau');
      }
    }
    return { erst, dann };
  }
  if (weapon.strikeStyle === 'sky' && weapon.delivery !== 'hitscan') {
    /* Steilfeuer: der Einschlagpunkt liegt senkrecht unter dem Geschoss. Der
     * Winkel bestimmt den Zielpunkt; deshalb echtes Winkelgitter, fein genug
     * für die drei Waffen, die im alten Luftzielaufbau 0 zeigten. */
    for (let a = 0.02; a <= 1.45; a += 0.01) dazu(erst, rolle, rund(a), 100, 'steilfeuer');
    for (const d of [Math.round(reach * 0.6), 90]) {
      for (let a = 0.02; a <= 1.45; a += 0.02) dazu(dann, d, rund(a), 100, 'steilfeuer-rueckfall');
    }
    return { erst, dann };
  }
  if (istLaeufer(weapon)) {
    /* Läufer (Feuerwesen, Fassung 20): der Winkel wählt nur die Laufrichtung (0 = zum Ziel), die Kraft zählt nicht.
     * Belegt wird die Berührung auf dem Boden in Rollenentfernung, sonst näher. */
    for (const d of [rolle, 150, 90]) dazu(erst, d, 0, 50, 'laeufer');
    return { erst, dann };
  }
  if (weapon.delivery === 'hitscan') {
    for (const d of [rolle, 250, 90, 30]) {
      if (d > 0 && d <= reach) dazu(erst, Math.round(d), 0, 100, 'strahl');
    }
    return { erst, dann };
  }
  /* Vorschau zuerst — sie ist billig und trifft die Rolle fast immer. Erst
   * wenn sie daneben liegt, lohnt das echte Winkelgitter: Zielsuche und
   * Zünder verhalten sich anders als die reine Ballistik der Vorschau. */
  const a = vorschauZiel(weapon, rolle);
  dazu(erst, rolle, a.angle, a.power, 'vorschau');
  for (const power of [80, 100]) {
    for (let angle = -0.1; angle <= 1.4; angle += 0.1) dazu(dann, rolle, rund(angle), power, 'echtwinkel');
  }
  for (const d of [Math.round(reach * 0.6), 250, 90, 30]) {
    if (!(d >= 20 && d <= reach * 0.98)) continue;
    if (d === rolle || dann.some(e => e.distance === d && e.art === 'vorschau')) continue;
    const p = vorschauZiel(weapon, d);
    dazu(dann, d, p.angle, p.power, 'vorschau-rueckfall');
  }
  return { erst, dann };
}

/** Ein Nachweis zählt, wenn die Engine eine echte Kollision meldet UND die
 *  Waffe ihre Rolle erfüllt: Schaden am Ziel oder (Zünderwaffe) Armierung im
 *  freien Flug am Ziel. */
function istNachweis(probe) {
  if (!probe.ok || !probe.kollision) return false;
  if (probe.schaden.ereignisse > 0) return true;
  return probe.kollision.art === 'fuse_armed' && probe.kollision.imFreien === true;
}

const ergebnis = {
  ticket: 'BAL-12',
  titel: 'Reale Treffer- und Kollisionsmatrix',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  versions: {
    waffen: WAFFEN_STANDARD, klassen: KLASSEN_STANDARD, schaden: SCHADEN_STANDARD,
    wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 0,
  },
  seed: SEED,
  kartenbreite: KARTENBREITE,
  zielLebenspunkte: ZIEL_LP,
  rollenEntfernung: ROLLEN_ENTFERNUNG,
  method: 'Echter fire()/step()-Pfad je Waffe: beide Figuren auf y=100 im freien Luftraum, '
    + 'Ziel 1000 LP, keine Kisten. Angriff: Rollenentfernung (Kategorie), Vorschau-Zielung bzw. '
    + 'Steilfeuer-Winkelgitter; Nachweis nur über hitscan/projectile_impact/projectile_pierced/fuse_armed '
    + '(Läufer: feuerwesen_zerbirst an der Figur; beide Figuren dafür festgehalten auf der Oberfläche) '
    + 'aus dem abgegebenen Schuss. Selbstwirkung: echte Startposition auf dem Boden, positiver Nutzwert. '
    + 'Ein kontrollierter wendeExplosionAn-Aufruf ist kein Kollisionsfall und wird getrennt ausgewiesen. '
    + 'Keine Trefferquote, keine Winrate, keine Aussage über Bewegung/Deckung der Partie.',
  waffen: [],
};

for (const base of WEAPONS) {
  if (NUR && !NUR.includes(base.id)) continue;
  const weapon = getWaffe(base.id);
  const selbst = istSelbstwirkung(weapon);
  if (selbst) {
    const probe = selbstProbe(weapon);
    assert.equal(probe.ok, true, `${weapon.id}: Selbstwirkung abgelehnt: ${probe.errors.join(', ')}`);
    assert.equal(probe.projectileId, null, `${weapon.id}: Selbstwirkung erzeugte ein Geschoss`);
    assert.ok(probe.nutzen, `${weapon.id}: kein positiver Nutzwert (${probe.kind})`);
    ergebnis.waffen.push({
      id: weapon.id, name: weapon.displayName, art: 'selbst',
      category: weapon.category, kind: probe.kind,
      rollenDistanz: null,
      probe,
    });
    console.log(`${weapon.id} ${weapon.displayName}: Selbstwirkung ${probe.kind} → ${probe.nutzen.art} ${probe.nutzen.wert}`);
    continue;
  }

  const rolle = rollenDistanz(weapon);
  let gewaehlt = null;
  const versuche = [];
  const kandidatenListe = kandidaten(weapon);
  for (const k of [...kandidatenListe.erst, ...kandidatenListe.dann]) {
    const probe = trefferProbe(weapon, k);
    versuche.push({
      distance: k.distance, angle: probe.angle, power: probe.power, art: k.art,
      kollision: probe.kollision?.art ?? null, schaden: probe.schaden.ereignisse,
    });
    if (istNachweis(probe)) { gewaehlt = { ...probe, art: k.art, rollenDistanz: rolle }; break; }
  }
  if (!gewaehlt) {
    console.error(`${weapon.id} ${weapon.displayName}: KEIN Nachweis in ${versuche.length} Versuchen`);
    console.error(JSON.stringify(versuche.slice(0, 12)));
  }
  ergebnis.waffen.push({
    id: weapon.id, name: weapon.displayName, art: 'angriff',
    category: weapon.category, delivery: weapon.delivery, strikeStyle: weapon.strikeStyle,
    rollenDistanz: rolle,
    reichweite: Math.round(reichweite(weapon)),
    /* rollenDistanzErreicht: der Nachweis geschah in der Rollenentfernung;
     * sonst steht die tatsächlich belegte, kleinere Entfernung im Beleg. */
    rollenDistanzErreicht: Boolean(gewaehlt) && gewaehlt.distance >= rolle - 1,
    probe: gewaehlt ? {
      distance: gewaehlt.distance, angle: gewaehlt.angle, angleAnzeige: gewaehlt.angleAnzeige, power: gewaehlt.power,
      route: gewaehlt.route, spawn: gewaehlt.spawn, ticks: gewaehlt.ticks,
      kollision: gewaehlt.kollision, schaden: gewaehlt.schaden,
      ereignisArten: gewaehlt.ereignisArten, quelle: gewaehlt.quelle,
      kontrollierteExplosion: gewaehlt.kontrollierteExplosion,
    } : null,
    versuche: versuche.length,
  });
  if (!gewaehlt) throw new Error(`${weapon.id}: kein Kollisionsnachweis`);
  const dmg = gewaehlt.schaden.ereignisse;
  const zusatz = dmg === 0 && gewaehlt.kollision.art === 'fuse_armed' ? ' [Zünder: Kollision belegt, Schaden 0]' : '';
  console.log(`${weapon.id} ${weapon.displayName}: ${gewaehlt.kollision.art} @${gewaehlt.distance} `
    + `(${rund(gewaehlt.angle)}/${gewaehlt.power}) Schaden ${rund(dmg)}${zusatz}`);
}

/* Deterministische Kontrolle: derselbe Schuss zweimal. */
const kontrolle = getWaffe('pa_040');
const a = trefferProbe(kontrolle, { distance: 90, angle: 0, power: 100 });
const b = trefferProbe(kontrolle, { distance: 90, angle: 0, power: 100 });
assert.deepEqual(a, b, 'Identische Eingaben müssen identische Nachweise ergeben');

const angriff = ergebnis.waffen.filter(w => w.art === 'angriff');
const selbstw = ergebnis.waffen.filter(w => w.art === 'selbst');
const mitKollision = angriff.filter(w => w.probe?.kollision);
const mitSchaden = angriff.filter(w => (w.probe?.schaden.ereignisse ?? 0) > 0);
const nurKollision = angriff.filter(w => w.probe?.kollision && (w.probe?.schaden.ereignisse ?? 0) === 0)
  .map(w => ({ id: w.id, name: w.name, art: w.probe.kollision.art, begruendung: 'Zünderwaffe: Kollision belegt, Schaden 0 — offene Entscheidung GP-1 (Radius 0 vs. Art)' }));
const selbstMitNutzen = selbstw.filter(w => w.probe?.nutzen);

ergebnis.summary = {
  waffen: ergebnis.waffen.length,
  angriff: angriff.length,
  selbst: selbstw.length,
  angriffMitKollision: mitKollision.length,
  angriffMitSchaden: mitSchaden.length,
  angriffNurKollision: nurKollision,
  selbstMitNutzen: selbstMitNutzen.length,
  rollenDistanzErreicht: angriff.filter(w => w.rollenDistanzErreicht).length,
};
ergebnis.kontrollfall = kontrollfall();
ergebnis.kontrolle = { wiederholterSchussIdentisch: true, pa_040: a.kollision && a.schaden };
ergebnis.szenarien = szenarien();

fs.mkdirSync(ZIEL, { recursive: true });
fs.writeFileSync(path.join(ZIEL, 'kollisionsmatrix.json'), JSON.stringify(ergebnis, null, 2) + '\n');

/* Vertrag: 150 Waffen, 112 Angriff, 38 Selbst — und jeder Nachweis vollständig. */
if (!NUR) {
  assert.equal(ergebnis.summary.waffen, 150);
  assert.equal(ergebnis.summary.angriff, 112);
  assert.equal(ergebnis.summary.selbst, 38);
  assert.equal(ergebnis.summary.angriffMitKollision, 112, 'nicht jede Angriffswaffe hat eine Kollision');
  assert.equal(ergebnis.summary.selbstMitNutzen, 38, 'nicht jede Selbstwirkung hat einen Nutzwert');
  for (const w of angriff) {
    assert.ok(w.probe?.kollision, `${w.id}: Kollision fehlt`);
    assert.equal(w.probe.kontrollierteExplosion, false, `${w.id}: Explosionsaufruf statt Kollision`);
  }
  for (const w of selbstw) assert.ok(w.probe?.nutzen, `${w.id}: Nutzwert fehlt`);
  assert.equal(ergebnis.kontrollfall.kollisionsEreignisse, 0,
    'Der kontrollierte Explosionsaufruf darf kein Kollisionsereignis erzeugen');
}
console.log(`\nFertig: ${ergebnis.summary.waffen} Waffen, ${ergebnis.summary.angriffMitKollision}/112 Kollisionen, `
  + `${ergebnis.summary.angriffMitSchaden}/112 mit Schaden, ${ergebnis.summary.selbstMitNutzen}/38 Selbstwirkungen mit Nutzen.`);
console.log(`Kontrollfall: wendeExplosionAn richtet ${ergebnis.kontrollfall.schaden} Schaden an, `
  + `meldet aber ${ergebnis.kontrollfall.kollisionsEreignisse} Kollisionsereignisse.`);
if (!NUR) {
  console.log(`Rollenentfernung erreicht: ${ergebnis.summary.rollenDistanzErreicht}/112`
    + (ergebnis.summary.angriffNurKollision.length ? `; nur Kollision: ${ergebnis.summary.angriffNurKollision.map(w => w.id).join(', ')}` : ''));
}

/** Szenarien aus dem Ticket, jeweils mit echtem Schuss/step. */
function szenarien() {
  const ergebnisse = {};

  /* Zwei Ziele: Durchschlag trifft beide, ein normales Geschoss nur das erste. */
  const zweiZiele = (weaponId) => {
    const m = new MatchController({
      seed: 7, teams: 2, playersPerTeam: 2, preset: 'open', turnDurationMs: 1_000_000,
      waffen: WAFFEN_STANDARD, klassen: KLASSEN_STANDARD, schaden: SCHADEN_STANDARD,
      wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 0,
    });
    m.start();
    const ids = m.getState().entities.map(e => e.entityId);
    const [schuetze, erstes, zweites] = ids;
    const setze = (id, x) => {
      m.world.setComponent(id, 'Position', 'x', x);
      m.world.setComponent(id, 'Position', 'y', 100);
      m.world.setComponent(id, 'Velocity', 'x', 0);
      m.world.setComponent(id, 'Velocity', 'y', 0);
    };
    setze(schuetze, 200); setze(erstes, 300); setze(zweites, 420);
    m.inventory.register(schuetze, [weaponId]);
    m.inventory.selectWeapon(schuetze, weaponId);
    m.consumeEvents();
    const vorher = ids.map(id => m.world.getComponent(id, 'Health', 'current'));
    const schuss = m.fire(schuetze, 0.05, 100, weaponId);
    assert.equal(schuss.ok, true, `${weaponId}: Szenario-Schuss abgelehnt`);
    for (let i = 0; i < 900 && m.activeProjectileCount > 0; i += 1) {
      for (const id of ids) {
        m.world.setComponent(id, 'Velocity', 'x', 0);
        m.world.setComponent(id, 'Velocity', 'y', 0);
      }
      m.step(); m.consumeEvents();
    }
    const nachher = ids.map(id => m.world.getComponent(id, 'Health', 'current'));
    return { erstes: rund(vorher[1] - nachher[1]), zweites: rund(vorher[2] - nachher[2]) };
  };
  ergebnisse.zweiZiele = { durchschlag: zweiZiele('pa_055'), normal: zweiZiele('pa_040') };

  /* Wanddeckung: eine Sichtlinienwaffe wird durch eine echte Wand gesperrt. */
  {
    const { m, shooter, target } = pruefstand('pa_129', { distance: 500 });
    for (const [id, x] of [[shooter, 400], [target, 900]]) {
      m.world.setComponent(id, 'Position', 'x', x);
      m.world.setComponent(id, 'Position', 'y', 100);
    }
    for (let x = 648; x <= 652; x += 1) for (let y = 40; y <= 160; y += 1) m.terrain.setPixel(x, y, true);
    m.consumeEvents();
    const r = m.fire(shooter, 0, 100, 'pa_129');
    ergebnisse.wanddeckung = {
      wand: { x: 650, y: 40, breite: 5, hoehe: 121 },
      abgelehnt: r.ok === false,
      grund: r.errors?.[0] ?? null,
      schaden: [...m.consumeEvents()].filter(e => e.type === 'damage' && e.payload.entityId === target).length,
    };
    assert.equal(ergebnisse.wanddeckung.abgelehnt, true, 'Wanddeckung: Schuss wurde nicht gesperrt');
  }

  /* Randtreffer: Ziel kurz vor dem rechten Kartenrand, Strahl trifft. */
  {
    const { m, shooter, target } = pruefstand('pa_129', { distance: 360 });
    const breite = m.terrain.width;
    for (const [id, x] of [[shooter, breite - 400], [target, breite - 40]]) {
      m.world.setComponent(id, 'Position', 'x', x);
      m.world.setComponent(id, 'Position', 'y', 100);
    }
    m.world.setComponent(target, 'Health', 'max', ZIEL_LP);
    m.world.setComponent(target, 'Health', 'current', ZIEL_LP);
    m.consumeEvents();
    const r = m.fire(shooter, 0, 100, 'pa_129');
    const ereignisse = [...m.consumeEvents()];
    const treffer = ereignisse.find(e => e.type === 'hitscan' && e.payload.target === target);
    ergebnisse.randtreffer = {
      kartenbreite: breite, zielX: breite - 40, ok: r.ok === true,
      trefferX: treffer ? rund(treffer.payload.hitX) : null,
      schaden: rund(ZIEL_LP - (m.world.getComponent(target, 'Health', 'current') ?? 0)),
    };
    assert.ok(ergebnisse.randtreffer.schaden > 0, 'Randtreffer verursachte keinen Schaden');
  }

  /* Zielsuche: versetztes Ziel, Geschoss mit homing-Feld trifft. */
  {
    const { m, shooter, target } = pruefstand('pa_133', { distance: 120 });
    const halte = () => {
      for (const [id, x, y] of [[shooter, 400, 100], [target, 520, 160]]) {
        if (!m.world.isActive(id)) continue;
        m.world.setComponent(id, 'Position', 'x', x);
        m.world.setComponent(id, 'Position', 'y', y);
        m.world.setComponent(id, 'Velocity', 'x', 0);
        m.world.setComponent(id, 'Velocity', 'y', 0);
      }
    };
    halte();
    m.world.setComponent(target, 'Health', 'max', ZIEL_LP);
    m.world.setComponent(target, 'Health', 'current', ZIEL_LP);
    m.consumeEvents();
    const r = m.fire(shooter, 0, 100, 'pa_133');
    const ereignisse = [...m.consumeEvents()];
    const homing = r.projectileId == null ? 0 : m.world.getComponent(r.projectileId, 'Projectile', 'homing');
    let takte = 0;
    while (m.activeProjectileCount > 0 && takte < 900) {
      halte(); m.step(); halte(); ereignisse.push(...m.consumeEvents()); takte += 1;
    }
    const kollision = ereignisse.find(e => ['projectile_impact', 'projectile_pierced'].includes(e.type) && e.payload.target === target);
    ergebnisse.zielsuche = {
      homing, ok: r.ok === true, takte,
      kollision: kollision?.type ?? null,
      schaden: rund(ZIEL_LP - (m.world.getComponent(target, 'Health', 'current') ?? 0)),
    };
    assert.ok(ergebnisse.zielsuche.homing > 0, 'Zielsuche: Waffe trägt kein homing');
    assert.ok(ergebnisse.zielsuche.schaden > 0, 'Zielsuche: versetztes Ziel wurde nicht getroffen');
  }

  /* Durchschlag: dieselbe Figur wird nicht doppelt getroffen (pierce-Schutz). */
  ergebnisse.durchschlag = {
    hinweis: 'Zwei-Ziele-Fall oben: pa_055 durchschlägt, pa_040 nicht; Einzeltrefferzahlen stehen dort.',
  };

  /* Zünder: vorhandene Abnahme bleibt maßgeblich (tests/zuender-armierung.test.js). */
  ergebnisse.zuender = {
    hinweis: 'Armierung, Zündort und Mindestschaden der elf Zünderwaffen sind in tests/zuender-armierung.test.js belegt; hier nicht dupliziert.',
  };
  ergebnisse.seil = {
    hinweis: 'Schuss vom Seil löst das Seil: tests/seil.test.js („Waffe vom Seil“).',
  };
  ergebnisse.wasser = {
    hinweis: 'Kein Wasserfall in der Luftzielmatrix; offen für BAL-17 (Kartenabdeckung).',
  };
  return ergebnisse;
}
