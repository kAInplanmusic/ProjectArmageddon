/**
 * Unit-Tests für den PRNG (mulberry32-basiert).
 */
import { describe, it, runAndPrintResults } from './test-harness.js';
import { SeededRandom, createRng, hashToSeed, generateSeed } from '../src/shared/prng.js';

describe('SeededRandom', () => {
  it('sollle mit demselben Seed dieselbe Sequenz erzeugen', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());
    if (JSON.stringify(results1) !== JSON.stringify(results2)) {
      throw new Error('Sequenzen unterscheiden sich');
    }
  });

  it('sollle mit verschiedenen Seeds unterschiedliche Sequenzen erzeugen', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(1337);
    const results1 = rng1.next();
    const results2 = rng2.next();
    if (results1 === results2) {
      throw new Error('Verschiedene Seeds erzeugten gleiche Werte');
    }
  });

  it('sollle Werte im Bereich [0, 1) erzeugen', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      if (val < 0 || val >= 1) throw new Error(`Wert außerhalb [0,1): ${val}`);
    }
  });

  it('sollle nextFloat(min, max) korrekt berechnen', () => {
    const rng = new SeededRandom(999);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextFloat(10, 20);
      if (val < 10 || val >= 20) throw new Error(`nextFloat(10,20) = ${val}`);
    }
  });

  it('sollle nextInt(min, max) inklusive max zurückgeben', () => {
    const rng = new SeededRandom(777);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(1, 6);
      if (val < 1 || val > 6 || !Number.isInteger(val)) throw new Error(`nextInt(1,6) = ${val}`);
    }
  });

  it('sollle nextBoolean mit gegebener Wahrscheinlichkeit funktionieren', () => {
    const rng = new SeededRandom(555);
    let countTrue = 0;
    for (let i = 0; i < 1000; i++) {
      if (rng.nextBoolean(0.3)) countTrue++;
    }
    if (countTrue < 250 || countTrue > 350) throw new Error(`Erwartet ~300 true, bekam ${countTrue}`);
  });

  it('sollle pick() ein Element aus dem Array wählen', () => {
    const rng = new SeededRandom(321);
    const items = ['a', 'b', 'c', 'd', 'e'];
    const picked = rng.pick(items);
    if (!items.includes(picked)) throw new Error(`pick() gab "${picked}" zurück`);
  });

  it('sollle fork() unabhängige Teilfolgen erzeugen', () => {
    const rng = new SeededRandom(42);
    const fork1 = rng.fork(1);
    const fork2 = rng.fork(2);
    const seq1 = Array.from({ length: 5 }, () => fork1.next());
    const seq2 = Array.from({ length: 5 }, () => fork2.next());
    if (JSON.stringify(seq1) === JSON.stringify(seq2)) throw new Error('Fork-Instanzen erzeugten identische Sequenzen');
  });

  it('sollle reset() die Sequenz neu starten lassen', () => {
    const rng = new SeededRandom(123);
    const firstRun = Array.from({ length: 5 }, () => rng.next());
    rng.reset();
    const secondRun = Array.from({ length: 5 }, () => rng.next());
    if (JSON.stringify(firstRun) !== JSON.stringify(secondRun)) throw new Error('reset() startete nicht bei derselben Sequenz');
  });
});

describe('weightedIndex', () => {
  it('sollle bei gleichen Gewichten gleichmäßig verteilen', () => {
    const rng = new SeededRandom(100);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const idx = rng.weightedIndex([1, 1, 1]);
      counts[idx]++;
    }
    for (const count of counts) {
      if (count < 850 || count > 1150) throw new Error(`Ungleichmäßige Verteilung: ${counts}`);
    }
  });

  it('sollle bei ungleichen Gewichten proportional wählen', () => {
    const rng = new SeededRandom(200);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const idx = rng.weightedIndex([1, 2, 3]);
      counts[idx]++;
    }
    if (counts[0] < 400 || counts[0] > 600) throw new Error(`Index 0: ${counts[0]}`);
    if (counts[1] < 900 || counts[1] > 1100) throw new Error(`Index 1: ${counts[1]}`);
    if (counts[2] < 1400 || counts[2] > 1600) throw new Error(`Index 2: ${counts[2]}`);
  });
});

describe('createRng', () => {
  it('sollle einen nummerischen Seed akzeptieren', () => {
    const rng = createRng(12345);
    if (!(rng instanceof SeededRandom)) throw new Error('createRng erzeugte kein SeededRandom');
    const val = rng.next();
    if (val < 0 || val >= 1) throw new Error(`Ungültiger Wert: ${val}`);
  });

  it('sollle einen String-Seed hashern und akzeptieren', () => {
    const rng1 = createRng('test-seed');
    const rng2 = createRng('test-seed');
    if (rng1.seed !== rng2.seed) throw new Error('Gleicher String-Seed erzeugte unterschiedliche Seeds');
    const seq1 = Array.from({ length: 5 }, () => rng1.next());
    const seq2 = Array.from({ length: 5 }, () => rng2.next());
    if (JSON.stringify(seq1) !== JSON.stringify(seq2)) throw new Error('Gleicher String-Seed erzeugte unterschiedliche Sequenzen');
  });

  it('sollle ungültige Seeds ablehnen', () => {
    const invalid = [null, undefined, NaN, 1.5, {}, []];
    for (const val of invalid) {
      try {
        createRng(val);
        throw new Error(`createRng akzeptierte ungültigen Seed: ${val}`);
      } catch (e) {
        if (!e.message.includes('Zahl') && !e.message.includes('Zeichenkette') && !e.message.includes('ganze Zahl')) throw new Error(`Falsche Fehlermeldung: ${e.message}`);
      }
    }
  });
});

describe('hashToSeed', () => {
  it('sollle deterministisch einen 32-Bit-Integer erzeugen', () => {
    const seed1 = hashToSeed('hello');
    const seed2 = hashToSeed('hello');
    if (seed1 !== seed2) throw new Error('hashToSeed ist nicht deterministisch');
    if (seed1 > 0xFFFFFFFF || seed1 < 0) throw new Error(`hashToSeed erzeugte ungültigen 32-Bit-Wert: ${seed1}`);
  });

  it('sollle verschiedene Strings unterschiedliche Seeds erzeugen', () => {
    const s1 = hashToSeed('hello');
    const s2 = hashToSeed('world');
    if (s1 === s2) throw new Error('Verschiedene Strings erzeugten gleiche Seeds');
  });
});

describe('generateSeed', () => {
  it('sollle einen gültigen 32-Bit-Integer erzeugen', () => {
    const seed = generateSeed();
    if (seed < 0 || seed > 0xFFFFFFFF) throw new Error(`Ungültiger Seed: ${seed}`);
    if (!Number.isInteger(seed)) throw new Error(`Seed ist keine ganze Zahl: ${seed}`);
  });

  it('sollle bei wiederholten Aufrufen verschiedene Seeds erzeugen', () => {
    const seeds = new Set();
    for (let i = 0; i < 100; i++) seeds.add(generateSeed());
    if (seeds.size < 95) throw new Error(`Zu viele Duplikate: ${seeds.size}/100 eindeutig`);
  });
});

runAndPrintResults();
