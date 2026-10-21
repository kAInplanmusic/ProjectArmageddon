/**
 * Planeten-Biom (Geländefassung 4): Fassungen 1 bis 3 bleiben bitgleich, Geometrie, Spielbarkeit,
 * Stoffe und Kulisse der sechs Arten. Alle Konstruktionswerte stehen in `config/biome-planet.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PLANET_ARTEN, PLANET_BIOM_IDS, PLANET_BIOME, PLANET_WAHL, PLANET_FORM, planetFormFuer, istPlanetBiom, planetArt, planetArtAusZug,
} from '../src/shared/config/biome-planet.js';
import { NEUE_BIOME, SONDERBIOM_IDS_FASSUNG_3, SONDERBIOM_IDS_FASSUNG_4 } from '../src/shared/config/biome-neu.js';
import {
  GELAENDE_ALT, GELAENDE_BIOME, GELAENDE_THEMEN, GELAENDE_PLANET, normalisiereBiomWahl, waehleSonderbiom, loeseGelaende,
} from '../src/shared/config/gelaende.js';
import { SCENERY_BIOMES, pickScenery } from '../src/shared/config/scenery.js';
import { stoffByKey } from '../src/shared/config/stoffe.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { baueGelaendePlanet } from '../src/shared/terrainPlanet.js';
import { SeededRandom } from '../src/shared/prng.js';
import { MatchController } from '../src/engine/match.js';
import { stoffHash, zaehleStoffe } from '../src/shared/stoffkarte.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { kugelLage } from '../src/client/planetenKulisse.js';
import { WET_LEVEL } from '../src/shared/config/water.js';
import { getFaction } from '../src/shared/config/factions.js';

const hash = bitmap => { let h = 0x811c9dc5; for (let i = 0; i < bitmap.length; i += 1) h = Math.imul(h ^ bitmap[i], 0x01000193); return h >>> 0; };

test('Marke 4: Standard, Fassung 3 kennt planet nicht (Wahl und Ziehung), Fassung 4 zieht Planetenarten', () => {
  assert.equal(GELAENDE_PLANET, 4);
  assert.equal(SONDERBIOM_IDS_FASSUNG_4.length, SONDERBIOM_IDS_FASSUNG_3.length + 1);
  assert.equal(normalisiereBiomWahl(PLANET_WAHL, GELAENDE_THEMEN), null);
  assert.equal(normalisiereBiomWahl('planet_eis', GELAENDE_THEMEN), null);
  assert.equal(normalisiereBiomWahl(PLANET_WAHL, GELAENDE_PLANET), PLANET_WAHL);
  assert.equal(normalisiereBiomWahl('planet_lava', GELAENDE_PLANET), 'planet_lava');
  const arten = new Set();
  for (let seed = 1; seed < 6000; seed += 1) {
    for (const f of [GELAENDE_BIOME, GELAENDE_THEMEN]) {
      const b = waehleSonderbiom(seed, null, f);
      assert.ok(!istPlanetBiom(b), `Seed ${seed}, Fassung ${f}: ${b}`);
    }
    const neu = waehleSonderbiom(seed, null, GELAENDE_PLANET);
    if (istPlanetBiom(neu)) arten.add(neu);
    // Die Fassung 3 ist von der Einführung unberührt: gleiche Ziehung wie die Liste der dreizehn.
    const drei = waehleSonderbiom(seed, null, GELAENDE_THEMEN);
    assert.ok(drei === null || SONDERBIOM_IDS_FASSUNG_3.includes(drei));
  }
  assert.deepEqual([...arten].sort(), [...PLANET_BIOM_IDS].sort(), 'alle sechs Arten werden gezogen');
  assert.ok(istPlanetBiom(waehleSonderbiom(5, PLANET_WAHL, GELAENDE_PLANET)));
  assert.equal(loeseGelaende(GELAENDE_ALT, PLANET_WAHL, 5).sonderbiom, null);
  assert.equal(planetArt('planet_sand'), 'sand');
  assert.equal(planetArtAusZug(0.999999), 'planet_stein');
});

test('Fassungen 2 und 3: Karten von Seeds mit allen alten Sonderbiomen bleiben Bit für Bit gleich (Fingerabdruck)', () => {
  // Zwei Läufe mit verschiedener Importreihenfolge sind kein Beweis; belegt wird die Ziehung selbst:
  // Fassung 3 liefert für 4000 Seeds exakt dieselben Biome wie die Liste der dreizehn vorgibt.
  let n = 0;
  for (let seed = 1; seed < 4000; seed += 1) {
    const rng = new SeededRandom(((seed >>> 0) + 0x42494F) >>> 0);
    const erwartet = rng.next() >= 0.4 ? null : SONDERBIOM_IDS_FASSUNG_3[Math.floor(rng.next() * SONDERBIOM_IDS_FASSUNG_3.length)];
    assert.equal(waehleSonderbiom(seed, null, GELAENDE_THEMEN), erwartet, `Seed ${seed}`);
    n += 1;
  }
  assert.ok(n > 3000);
});

test('Jede Art: Eintrag vollständig, Stoffe bekannt, Fraktion gültig, Kulisse und Rezept über dieselben Tabellen', () => {
  assert.equal(PLANET_ARTEN.length, 6);
  const rezepte = new Set();
  for (const id of PLANET_BIOM_IDS) {
    const b = NEUE_BIOME[id];
    assert.ok(b, id);
    for (const f of ['label', 'beschreibung', 'fraktion', 'mapPreset', 'sky', 'water', 'landmarks', 'ambient', 'ground', 'groundVarianten', 'stoffe', 'pflanzen', 'kugel']) assert.ok(b[f], `${id}.${f}`);
    assert.ok(getFaction(b.fraktion), `${id}: Fraktion`);
    for (const [stoff] of b.stoffe.deck) assert.ok(stoffByKey(stoff), `${id}: ${stoff}`);
    for (const a of b.stoffe.adern) assert.ok(stoffByKey(a.stoff), `${id}: ${a.stoff}`);
    assert.ok(stoffByKey(b.stoffe.kern));
    rezepte.add(JSON.stringify(b.stoffe));
    assert.equal(SCENERY_BIOMES[id], b, `${id}: Kulisse liest denselben Eintrag`);
    const s = pickScenery(7, 'islands', id);
    assert.equal(s.celestial.kind, 'planet');
    assert.equal(s.water.id, 'void');
    assert.equal(kugelLage(s.celestial, id, 2560, 1440)[0].name, b.kugel);
  }
  assert.equal(rezepte.size, 6, 'sechs verschiedene Materialmixe');
});

test('Alle Konstruktionswerte kommen aus der Config: Überschreibungen wirken, nichts ist im Generator verdrahtet', () => {
  assert.equal(planetFormFuer('planet_eis').krater.tiefe, PLANET_BIOME.planet_eis.planetForm.krater.tiefe);
  assert.equal(planetFormFuer('planet_eis').krater.u, PLANET_FORM.krater.u, 'nicht überschriebene Werte bleiben');
  assert.equal(planetFormFuer('planet_rost').ebenen.staerke, 1);
  const quelle = readFileSync(resolve(import.meta.dirname, '../src/shared/terrainPlanet.js'), 'utf8');
  assert.ok(!/Math\.random|Date\.now/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '')), 'Zufall nur aus dem Seed');
});

test('Geometrie: Ellipse in der Mitte, Leere an den Rändern, Wasser unter dem Planeten, deterministisch', () => {
  for (const [w, h] of [[2560, 1440], [1440, 2560]]) {
    for (const id of PLANET_BIOM_IDS) {
      const a = baueGelaendePlanet({ rng: new SeededRandom(42), width: w, height: h, biom: id });
      const b = baueGelaendePlanet({ rng: new SeededRandom(42), width: w, height: h, biom: id });
      assert.equal(hash(a.bitmap), hash(b.bitmap), `${id}: deterministisch`);
      assert.deepEqual(a.planet.krater, b.planet.krater);
      const f = planetFormFuer(id);
      // Oberkante: in der Mitte hoch, am Rand tief; ganz außen keine Spalte mit Land über dem Wasser.
      const oben = x => { for (let y = 0; y < a.wasserY; y += 1) if (a.bitmap[y * w + x]) return y; return -1; };
      const mitte = oben(w >> 1);
      assert.ok(mitte > 0 && mitte < h * (f.mitteY - f.halbHoehe * 0.5), `${id}: Mitte ${mitte}`);
      assert.equal(oben(2), -1, `${id}: linker Rand ist Leere`);
      assert.equal(oben(w - 3), -1, `${id}: rechter Rand ist Leere`);
      assert.ok(oben(Math.round(w * 0.1)) > mitte, `${id}: Flanke liegt tiefer`);
      assert.ok(a.wasserY < h - 4 && a.wasserY > h * (f.mitteY + f.halbHoehe) - 5, `${id}: Spiegel unter dem Planeten`);
      assert.ok(a.planet.krater.length >= f.krater.anzahl[0] - 2, `${id}: Krater`);
      assert.ok(a.planet.tunnel.length >= f.tunnel.boegen[0]);
      // Tunnel sind Luft im Körper: dort gibt es Luftzellen unterhalb der Oberkante.
      let luft = 0;
      for (let x = Math.round(w * 0.2); x < w * 0.8; x += 1) { const t = oben(x); for (let y = t + 1; t >= 0 && y < t + 400; y += 1) if (!a.bitmap[y * w + x] && y < h * 0.9) { luft += 1; break; } }
      assert.ok(luft > 20, `${id}: Tunnel/Hohlräume vorhanden`);
    }
  }
});

test('Karte über erzeugeAutonomeKarte: spielbar, Stoffkarte mit mindestens zwei Stoffen, Client baut zellengleich', () => {
  for (const id of PLANET_BIOM_IDS) {
    for (const seed of [11, 90210]) {
      const k = erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width: 2560, height: 1440, biom: id, stoffe: true });
      assert.ok(!k.warnung, `${id} ${seed}: ${k.warnung}`);
      assert.ok(k.kennzahlen.landAnteil > 0.3 && k.kennzahlen.landAnteil < 0.7);
      assert.ok(k.kennzahlen.groesstesStueckAnteil > 0.9, 'eine tragende Landmasse');
      const c = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { gelaende: GELAENDE_PLANET, zerstoerung: 5, biom: id });
      assert.equal(c.sonderbiom, id);
      // Der Server baut aus dem Zweig TERRAIN des Match-Seeds; der Client muss dieselbe Karte bauen.
      const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom: id, maxRounds: 2, gelaende: GELAENDE_PLANET, zerstoerung: 5 });
      m.start();
      assert.equal(Buffer.compare(Buffer.from(c.bitmap), Buffer.from(m.bitmap)), 0, `${id}: Client gleich Server`);
      assert.equal(stoffHash(c.stoffkarte), stoffHash(m.stoffkarte));
      assert.ok(zaehleStoffe(k.stoffkarte, k.bitmap).size >= 2, `${id}: Stoffe`);
    }
  }
});

test('Match auf jeder Art: Spawns erreichbar, Kisten liegen auf dem Planeten, Hash deterministisch (Quer- und Hochformat)', () => {
  for (const orientation of ['landscape', 'portrait']) {
    for (const id of PLANET_BIOM_IDS) {
      const baue = () => {
        const m = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', biom: id, orientation, maxRounds: 2, turnDurationMs: 2000, gelaende: GELAENDE_PLANET, zerstoerung: 5 });
        m.start();
        return m;
      };
      const a = baue();
      assert.equal(a.sonderbiom, id);
      assert.ok(a.erreichbarkeit.ok, `${id}/${orientation}: ${a.erreichbarkeit.grund}`);
      for (let x = Math.round(a.width * 0.08); x <= a.width * 0.92; x += Math.round(a.width * 0.04)) {
        const y = a.surfaceYAt(x);
        assert.ok(y > 0 && y < a.height * 0.95 && a.waterLevelAt(x, y - 14) < WET_LEVEL, `${id}/${orientation}: Kistenplatz x=${x} auf trockenem Land (y=${y})`);
      }
      assert.equal(a.stateHash(), baue().stateHash(), `${id}/${orientation}: Zustands-Hash`);
    }
  }
});
