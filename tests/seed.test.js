/**
 * Unit-Tests für die Seed-Verwaltung (MatchSeedManager).
 *
 * Lauf: node tests/seed.test.js
 */

import { describe, it, runAndPrintResults } from './test-harness.js';
import {
  MatchSeedManager,
  SEED_OFFSETS,
  createMatchRng
} from '../src/shared/seed.js';


describe('MatchSeedManager', () => {
  it('sollte einen gültigen Match-Seed speichern', () => {
    const manager = new MatchSeedManager(123456789);

    if (manager.baseSeed !== 123456789) {
      throw new Error(`baseSeed sollte 123456789 sein, bekam ${manager.baseSeed}`);
    }
  });

  it('sollte ungültige Seeds ablehnen', () => {
    const invalid = [-1, 'abc', null, undefined, 1.5, NaN, Infinity, -Infinity];

    for (const val of invalid) {
      try {
        new MatchSeedManager(val);
        throw new Error(`MatchSeedManager akzeptierte ungültigen Seed: ${val}`);
      } catch (e) {
        if (!e.message.includes('32-Bit') && !e.message.includes('TypeError')) {
          throw new Error(`Falsche Fehlermeldung für ${val}: ${e.message}`);
        }
      }
    }
  });

  it('sollte denselben baseSeed + offset immer denselben Teil-PRNG erzeugen', () => {
    const manager1 = new MatchSeedManager(42);
    const manager2 = new MatchSeedManager(42);

    const rng1 = manager1.getSubRng(SEED_OFFSETS.LOOT);
    const rng2 = manager2.getSubRng(SEED_OFFSETS.LOOT);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    if (JSON.stringify(seq1) !== JSON.stringify(seq2)) {
      throw new Error('Gleiche Seeds erzeugten unterschiedliche Teil-PRNGs');
    }
  });

  it('sollte verschiedene Offsets unterschiedliche Teil-PRNGs erzeugen', () => {
    const manager = new MatchSeedManager(42);

    const lootRng = manager.getSubRng(SEED_OFFSETS.LOOT);
    const terrainRng = manager.getSubRng(SEED_OFFSETS.TERRAIN);
    const weaponsRng = manager.getSubRng(SEED_OFFSETS.WEAPONS);

    const lootSeq = lootRng.next();
    const terrainSeq = terrainRng.next();
    const weaponsSeq = weaponsRng.next();

    if (lootSeq === terrainSeq || lootSeq === weaponsSeq || terrainSeq === weaponsSeq) {
      throw new Error('Verschiedene Offsets erzeugten gleiche Werte');
    }
  });

  it('sollte denselben Teil-PRNG bei wiederholtem getSubRng-Aufruf zurückgeben (Memoisierung)', () => {
    const manager = new MatchSeedManager(42);

    const rng1 = manager.getSubRng(SEED_OFFSETS.LOOT);
    const rng2 = manager.getSubRng(SEED_OFFSETS.LOOT);

    // Dieselbe Instanz (Referenzidentität)
    if (rng1 !== rng2) {
      throw new Error('getSubRng erzeugte nicht die memoisierte Instanz');
    }

    // Sequenz-Fortsetzung sollte weitergehen
    const next1 = rng1.next();
    const next2 = rng2.next();

    // Da dieselbe Instanz, sollten die Werte unterschiedlich sein
    if (next1 === next2) {
      throw new Error('Memoisierte Instanz erzeugte gleiche Werte hintereinander');
    }
  });
});

describe('MatchSeedManager.fromString', () => {
  it('sollte String-Seeds deterministisch hashen', () => {
    const m1 = MatchSeedManager.fromString('match-abc');
    const m2 = MatchSeedManager.fromString('match-abc');

    if (m1.baseSeed !== m2.baseSeed) {
      throw new Error('Gleiche String-Seeds ergaben unterschiedliche baseSeeds');
    }
  });

  it('sollte verschiedene Strings unterschiedliche Seeds erzeugen', () => {
    const m1 = MatchSeedManager.fromString('match-abc');
    const m2 = MatchSeedManager.fromString('match-xyz');

    if (m1.baseSeed === m2.baseSeed) {
      throw new Error('Verschiedene Strings erzeugten gleiche Seeds');
    }
  });
});

describe('MatchSeedManager.serialize/deserialize', () => {
  it('sollte Seed round-trip-konform serialisieren', () => {
    const manager = MatchSeedManager.createRandom();
    const serialized = manager.serialize();
    const deserialized = MatchSeedManager.deserialize(serialized);

    if (deserialized.baseSeed !== manager.baseSeed) {
      throw new Error(
        `Round-trip fehlgeschlagen: ${manager.baseSeed} → ${deserialized.baseSeed}`
      );
    }
  });
});

describe('createMatchRng', () => {
  it('sollte einen funktionierenden SeededRandom zurückgeben', () => {
    const rng = createMatchRng(42, 'LOOT');

    const val = rng.next();
    if (val < 0 || val >= 1) {
      throw new Error(`Ungültiger Wert: ${val}`);
    }
  });

  it('sollte denselben Seed+Offset immer dieselbe Sequenz geben', () => {
    const rng1 = createMatchRng(42, 'LOOT');
    const rng2 = createMatchRng(42, 'LOOT');

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    if (JSON.stringify(seq1) !== JSON.stringify(seq2)) {
      throw new Error('createMatchRng mit gleichem Seed erzeugte unterschiedliche Sequenzen');
    }
  });

  it('sollte ungültige Offset-Schlüssel ablehnen', () => {
    try {
      createMatchRng(42, 'INVALID_KEY');
      throw new Error('Ungültiger Offset-Schlüssel wurde akzeptiert');
    } catch (e) {
      if (!e.message.includes('Unbekannter Seed-Offset-Schlüssel')) {
        throw new Error(`Falsche Fehlermeldung: ${e.message}`);
      }
    }
  });
});

describe('SEED_OFFSETS', () => {
  it('sollte alle Offset-Werte als Zahlen haben', () => {
    for (const [key, value] of Object.entries(SEED_OFFSETS)) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`SEED_OFFSETS.${key} ist keine ganze Zahl: ${value}`);
      }
    }
  });

  it('sollte eindeutige Offset-Werte haben (keine Kollisionen)', () => {
    const values = Object.values(SEED_OFFSETS);
    const unique = new Set(values);

    if (values.length !== unique.size) {
      throw new Error(`Nicht-eindeutige Offset-Werte: ${values}`);
    }
  });

  it('sollte den MATCH_BASE-Offset auf 0 setzen (Standard)', () => {
    if (SEED_OFFSETS.MATCH_BASE !== 0) {
      throw new Error(`MATCH_BASE sollte 0 sein, bekam ${SEED_OFFSETS.MATCH_BASE}`);
    }
  });
});

runAndPrintResults();
