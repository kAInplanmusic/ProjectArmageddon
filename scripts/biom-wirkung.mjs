#!/usr/bin/env node
/**
 * QV-3 (2026-11-17): Wie stark verändert die Biom-Wahl das Spiel?
 *
 * Misst je Biom im Menümodus (`MENUE_KARTENTYP`, Vorgabe 24:9 groß) und je Seed drei Ebenen:
 *   1. Form   – Kollisionsmaske (`terrain.hash()`) gleich der von „klassisch“?
 *   2. Stoffe – Stofffeld gleich dem von „klassisch“? Dazu die drei häufigsten Stoffe.
 *   3. Verlauf – Bot-Duell (scripts/bot-partien.mjs) gleich dem von „klassisch“?
 *      Verlauf = Züge, Schüsse, Treffer, Schaden (gerundet), Siegerteam, Endtick.
 *
 * Hauptkennzahl je Seed: Zahl verschiedener Verläufe über alle 21 Wahlen und die größte Gruppe gleicher
 * Verläufe. Je Biom: „eigener Verlauf“ = Seeds, bei denen kein anderes Biom denselben Verlauf hat.
 * Der Vergleich nur mit „klassisch“ reicht nicht: Viele Biome weichen von klassisch ab, verlaufen aber
 * untereinander gleich. Nur Messung, keine Wertung; Bot-Duelle sind kein Spielerurteil.
 *
 * Aufruf: node scripts/biom-wirkung.mjs [--seeds=4] [--ohne-duell] [--ausgabe=docs/biom-wirkung.json]
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SONDERBIOM_IDS_FASSUNG_7 } from '../src/shared/config/biome-neu.js';
import { STOFFE } from '../src/shared/config/stoffe.js';
import { neuesMatch, spiele } from './bot-partien.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const SEED_BASIS = 20261111;
const SEEDS = Array.from({ length: Number(args.seeds ?? 4) }, (_, i) => SEED_BASIS + i * 7919);
const KIT = 4;
const KARTE = { format: '24:9', groesse: 'gross' };
export const BIOME = Object.freeze(['klassisch', ...SONDERBIOM_IDS_FASSUNG_7]);

const kurz = buf => createHash('sha1').update(buf).digest('hex').slice(0, 12);

/** Form und Stoffe eines Bioms bei einem Seed, ohne zu spielen. */
export function karte(biom, seed) {
  const m = neuesMatch(seed, KIT, { teams: 2, proTeam: 1, extra: { biom, ...KARTE } });
  m.start();
  const feld = m.stoffkarte?.feld ?? null;
  const zaehl = new Map();
  if (feld) for (const id of feld) if (id) zaehl.set(id, (zaehl.get(id) ?? 0) + 1);
  const summe = [...zaehl.values()].reduce((a, b) => a + b, 0) || 1;
  const top = [...zaehl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => `${STOFFE[id]?.key ?? id} ${Math.round((100 * n) / summe)} %`);
  return { form: m.terrain.hash(), stoffe: feld ? kurz(Buffer.from(feld.buffer)) : null, top, kartentyp: m.kartentyp };
}

/** Verlaufsschlüssel eines Bot-Duells. */
export function verlauf(biom, seed) {
  const b = spiele(seed, KIT, { teams: 2, proTeam: 1, extra: { biom, ...KARTE } });
  return `${b.zuege}/${b.schuesse}/${b.treffer}/${Math.round(b.schaden)}/${b.siegerTeam}/${b.tick}`;
}

function messe() {
  const mitDuell = !args['ohne-duell'];
  const ergebnis = {};
  for (const biom of BIOME) ergebnis[biom] = { seeds: [] };
  for (const seed of SEEDS) {
    const basis = { ...karte('klassisch', seed), verlauf: mitDuell ? verlauf('klassisch', seed) : null };
    for (const biom of BIOME) {
      const k = biom === 'klassisch' ? basis : { ...karte(biom, seed), verlauf: mitDuell ? verlauf(biom, seed) : null };
      ergebnis[biom].seeds.push({
        seed, top: k.top,
        formWieKlassisch: k.form === basis.form,
        stoffeWieKlassisch: k.stoffe === basis.stoffe,
        verlaufWieKlassisch: mitDuell ? k.verlauf === basis.verlauf : null,
        verlauf: k.verlauf,
      });
      process.stderr.write('.');
    }
  }
  process.stderr.write('\n');
  const zeilen = BIOME.map(biom => {
    const s = ergebnis[biom].seeds;
    return {
      biom,
      formAnders: s.filter(x => !x.formWieKlassisch).length,
      stoffeAnders: s.filter(x => !x.stoffeWieKlassisch).length,
      verlaufAnders: mitDuell ? s.filter(x => !x.verlaufWieKlassisch).length : null,
      top: s[0].top.join(', '),
    };
  });
  const jeSeed = SEEDS.map((seed, i) => {
    const gruppen = new Map();
    for (const biom of BIOME) {
      const v = ergebnis[biom].seeds[i].verlauf;
      gruppen.set(v, [...(gruppen.get(v) ?? []), biom]);
    }
    return { seed, verschiedeneVerlaeufe: mitDuell ? gruppen.size : null, groessteGruppe: mitDuell ? Math.max(...[...gruppen.values()].map(g => g.length)) : null, gruppen: mitDuell ? [...gruppen.values()] : null };
  });
  for (const z of zeilen) {
    z.eigenerVerlauf = mitDuell ? jeSeed.filter(js => js.gruppen.some(g => g.length === 1 && g[0] === z.biom)).length : null;
  }
  const andere = zeilen.filter(z => z.biom !== 'klassisch');
  const zusammenfassung = {
    biome: andere.length,
    seeds: SEEDS.length,
    formUnterscheidbar: andere.filter(z => z.formAnders > 0).length,
    stoffeUnterscheidbar: andere.filter(z => z.stoffeAnders > 0).length,
    verlaufUnterscheidbar: mitDuell ? andere.filter(z => z.verlaufAnders > 0).length : null,
    verlaufWieKlassischBeiAllenSeeds: mitDuell ? andere.filter(z => z.verlaufAnders === 0).map(z => z.biom) : null,
    verschiedeneVerlaeufeJeSeed: jeSeed.map(js => js.verschiedeneVerlaeufe),
    groessteGruppeJeSeed: jeSeed.map(js => js.groessteGruppe),
    nieEigenerVerlauf: mitDuell ? zeilen.filter(z => z.eigenerVerlauf === 0).map(z => z.biom) : null,
  };
  return { stand: { datum: new Date().toISOString().slice(0, 10), seeds: SEEDS, kit: KIT, karte: KARTE }, zusammenfassung, jeSeed, zeilen, ergebnis };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = messe();
  const z = r.zusammenfassung;
  console.log(`Biome ${z.biome}, Seeds ${z.seeds}: Form anders als klassisch ${z.formUnterscheidbar}, Stoffe anders ${z.stoffeUnterscheidbar}, Verlauf anders ${z.verlaufUnterscheidbar ?? '–'}`);
  console.log(`Verschiedene Verläufe je Seed (von ${BIOME.length}): ${z.verschiedeneVerlaeufeJeSeed.join(', ')}; größte Gruppe: ${z.groessteGruppeJeSeed.join(', ')}`);
  console.log(`Nie eigener Verlauf: ${(z.nieEigenerVerlauf ?? []).join(', ') || '–'}`);
  console.log('| Biom | Form anders | Stoffe anders | Verlauf anders als klassisch | eigener Verlauf | häufigste Stoffe (Seed 1) |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const zl of r.zeilen) console.log(`| ${zl.biom} | ${zl.formAnders}/${z.seeds} | ${zl.stoffeAnders}/${z.seeds} | ${zl.verlaufAnders ?? '–'}/${z.seeds} | ${zl.eigenerVerlauf ?? '–'}/${z.seeds} | ${zl.top} |`);
  if (args.ausgabe) fs.writeFileSync(args.ausgabe, JSON.stringify(r, null, 2) + '\n');
}
