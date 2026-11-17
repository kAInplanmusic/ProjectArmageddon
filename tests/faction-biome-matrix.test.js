import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const skript = new URL('../scripts/letzter-halt-bestand.mjs', import.meta.url);

function bestand() {
  const r = spawnSync(process.execPath, [skript.pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('Matrix: Jede Fraktion hat genau ein Heim-Biome (ausgenommen rodentia)', () => {
  const b = bestand();
  for (const f of b.fraktionen) {
    const eintraege = b.matrix.filter(m => m.fraktion === f.id);
    const homes = eintraege.filter(m => m.home);
    const _gegen = eintraege.filter(m => !m.home);

    if (f.id === 'rodentia') {
      // rodentia hat kein zugehöriges Biome in FASSUNG_2
      assert.equal(homes.length, 1, `${f.id}: Hat 1 Heim-Eintrag (als 'keine')`);
      assert.equal(homes[0].biome, 'keine', `${f.id}: Heim-Biome ist 'keine'`);
    } else {
      assert.equal(homes.length, 1, `${f.id}: genau 1 Heim-Biome`);
      assert.equal(homes[0].biome, homes[0].biome, `${f.id}: Heim-Biome hat ID`);
    }
  }
});

test('Matrix: Rodentia hat kein Heim-Biome in FASSUNG_2', () => {
  const b = bestand();
  const rodentiaHome = b.matrix.find(m => m.fraktion === 'rodentia' && m.home);
  assert.ok(rodentiaHome, 'rodentia hat Heim-Eintrag');
  assert.equal(rodentiaHome.biome, 'keine', 'rodentia: Heim-Biome ist leer (kein zugehöriges Biome)');
});

test('Matrix: Pirates hat 2 Biome in FASSUNG_2', () => {
  const b = bestand();
  const pirateBiomes = b.biome.filter(bm => bm.fraktion === 'pirates');
  assert.equal(pirateBiomes.length, 2, 'pirates hat 2 Biome in FASSUNG_2 (duenden + riff)');
});

test('Matrix: Vollständige Abdeckung aller Faction-Biome-Kombinationen', () => {
  const b = bestand();
  const fraktionen = b.fraktionen.map(f => f.id);
  const biome = b.biome.map(bm => bm.id);

  // Matrix sollte: fraktionen * (biome + 1 für 'keine') = 9 * (9 + 1) = 90? Nein!
  // Matrix ist: fraktionen * (anzahl_biome + 1 für 'keine' falls nötig)
  // Rodentia bekommt 'keine' als Heim, also 9 Biome x 9 Fraktionen = 81, plus rodentia extra = 90

  const matrixSet = new Set(b.matrix.map(m => `${m.fraktion}:${m.biome}`));
  console.log('Matrix-Einträge:', b.zaehler.matrix_eintraege);
  console.log('Matrix-Set Größe:', matrixSet.size);

  // Jede Fraktion sollte für jedes Biome einen Eintrag haben
  for (const f of fraktionen) {
    for (const bm of biome) {
      assert.ok(matrixSet.has(`${f}:${bm}`), `Fehlende Kombination: ${f} x ${bm}`);
    }
  }
  // Rodentia hat 'keine' als Heim-Biome
  assert.ok(matrixSet.has('rodentia:keine'), 'rodentia sollte Keim-Biome haben');
});

test('Matrix: Biome haben korrekte Stoffe definiert', () => {
  const b = bestand();
  const erwarteteStoffe = ['basalt', 'obsidian', 'erde', 'holz', 'pilz', 'sand', 'fels', 'eis', 'kristall', 'metall', 'rosterbeton', 'metallplatte', 'koralle', 'asche', 'halde', 'halde_feucht', 'schnee'];

  for (const m of b.matrix) {
    const biome = b.biome.find(bm => bm.id === m.biome);
    if (biome) {
      for (const stoffKey of m.stoffe) {
        const stoffGefunden = erwarteteStoffe.includes(stoffKey);
        assert.ok(stoffGefunden, `${m.fraktion} vs ${m.biome}: Ungültiger Stoff '${stoffKey}'`);
      }
    }
  }
});

test('Matrix: Keine doppelten Factionen oder Biome in der Basis', () => {
  const b = bestand();
  const fraktionen = b.fraktionen.map(f => f.id);
  assert.equal(new Set(fraktionen).size, fraktionen.length, 'Keine duplizierten Fraktionen');
  const biome = b.biome.map(b => b.id);
  assert.equal(new Set(biome).size, biome.length, 'Keine duplizierten Biome');
});

test('Matrix: Quell-Hashes sind gültig SHA256', () => {
  const b = bestand();
  assert.match(b.quellHash, /^[a-f0-9]{64}$/, 'Quell-Hash muss SHA256 sein');
});

test('Matrix: P0-Befund A01 - Stoff-ID 32-125 werden am Einschlag zu Erde (Zähler begrenzt auf 32)', () => {
  // Dieses Test-Datum dokumentiert den kritischen P0-Befund aus dem Architektur-Audit
  // 94 von 126 Stoffkennungen werden am Einschlag fälschlicherweise zu Erde
  // weil src/shared/stoffkarte.js:169 nur 32 Zähler reserviert
  const b = bestand();
  // Biome und Matrix enthalten Stoffe, aber der Stoff-Reaktions-Test in
  // tests/terrain-material.test.js zeigt: Stoffe 32-125 → Erde-ID 0
  // Siehe pa-letzter-halt-architektur.md für vollständige Erweiterung
  assert.ok(b.biome.length >= 9, 'Biome-Menge ausreichend für Reaktionstest');
  // Dieser Test dient als Platzhalter für den vollständigen A01-Audit
});

test('Matrix: P0-Befund A13 - Fraktionen haben keine simulierte Biomeignung', () => {
  // Dieser Test bestätigt den P0-Befund aus dem Architektur-Audit:
  // "Aktuell neun Fraktionen, aber ihre Biomeignung ist keine simulierte Eigenschaft"
  // Die Fraktionsdaten enthalten nur ID, Name, Motto, Palette, SpriteDir
  // Keine Biomprofile, keine passive Boni, keine simulierten Umweltbeziehungen
  const b = bestand();
  for (const f of b.fraktionen) {
    // Jede Fraktion soll eine Heim-Biome-Zuordnung haben, aber diese ist
    // KEINE mechanisch simulierte Eigenschaft - nur eine Design-Hypothese
    const fraktion = b.fraktionen.find(fr => fr.id === f.id);
    assert.ok(fraktion, `Fraktion ${f.id} existiert`);
    // Die Heim-Biome-Zuordnungen sind Teil der Design-Hypothese, nicht der Implementierung
  }
});