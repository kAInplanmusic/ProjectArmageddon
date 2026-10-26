#!/usr/bin/env node
/**
 * Erzeugt aus `docs/biome-ssot.md` je Biom eine Datei unter `docs/biome/` und die
 * Gesamtliste aller Materialien, Objekte, Trigger und Sonderwirkungen.
 *
 * Die SSOT bleibt die eine Quelle; die erzeugten Dateien sind Auswertungen und
 * werden nicht von Hand geändert. Neu erzeugen: `node scripts/biome-dateien.mjs`.
 *
 * Je Material steht, ob es im Katalog (`stoffe.js`) und als Textur vorhanden ist; die
 * drei Eigenschaften (Optik, Zerstörbarkeit, Bewegung) sind Spalten, die später je
 * Material einzeln gefüllt werden.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOFFE } from '../src/shared/config/stoffe.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUS = path.join(WURZEL, 'docs/biome');
const TEXTUR_ORDNER = ['src/client/assets/stoff-texturen-neu', 'src/client/assets/stoff-texturen'];

const norm = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, 'und').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bereinige = (s) => s.trim().replace(/\.$/, '').trim();
const liste = (s, trenner = ',') => s.split(trenner).map(bereinige).filter(Boolean);

function lies() {
  const text = fs.readFileSync(path.join(WURZEL, 'docs/biome-ssot.md'), 'utf8');
  const teile = text.split(/^### (\d+) (.+)$/m);
  const biome = [];
  for (let i = 1; i < teile.length; i += 3) {
    const nr = Number(teile[i]);
    const titel = teile[i + 1].replace(/\s*\(neu\)\s*$/, '').trim();
    const zeilen = teile[i + 2].split('\n').map((z) => z.trimEnd());
    const kern = [];
    const felder = new Map();
    const varianten = [];
    for (const z of zeilen) {
      if (!z.trim() || z.startsWith('## ')) continue;
      const m = z.match(/^- \*\*(.+?):\*\* (.*)$/);
      if (!m) {
        if (!z.startsWith('- ')) kern.push(z.trim());
        continue;
      }
      if (z.includes(' · **')) {
        for (const stueck of z.slice(2).split(' · **')) {
          const mm = stueck.replace(/^\*\*/, '').match(/^(.+?):\*\* (.*)$/);
          if (mm) varianten.push([mm[1], mm[2]]);
        }
      } else felder.set(m[1], m[2]);
    }
    const material = new Map();
    for (const n of liste(felder.get('Terrain') ?? '')) material.set(n, '');
    for (const [v, t] of varianten) for (const n of liste(t)) if (!material.has(n)) material.set(n, v);
    const objektText = felder.get('Objekte/Trigger') ?? '';
    const objekte = [];
    const trigger = [];
    for (const n of liste(objektText)) (/-Trigger$/.test(n) ? trigger : objekte).push(n);
    if (felder.has('Objekte je Variante')) {
      const erste = felder.get('Objekte je Variante').split(';')[0];
      for (const gruppe of liste(erste, '·')) for (const n of liste(gruppe, '/')) objekte.push(n);
    }
    biome.push({
      nr, titel, kern: kern.join(' '), material, objekte, trigger,
      sonder: felder.get('Sonderwirkung') ? bereinige(felder.get('Sonderwirkung')) : null,
      karten: liste(felder.get('Karten') ?? '', ';'),
    });
  }
  return biome;
}

function katalog() {
  const eintraege = STOFFE.map((s) => ({ key: s.key, n: norm(s.key), haerte: s.haerte }));
  const dateien = [];
  for (const o of TEXTUR_ORDNER) {
    const p = path.join(WURZEL, o);
    if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) dateien.push({ n: norm(f.replace(/\.[^.]+$/, '')), f });
  }
  return (name) => {
    const n = norm(name);
    const k = eintraege.find((e) => e.n === n) ?? null;
    const ahnlich = k ? null : eintraege.find((e) => e.n.length >= 4 && n.includes(e.n)) ?? null;
    const t = dateien.find((d) => d.n === n) ?? null;
    const tAhnlich = t ? null : dateien.find((d) => d.n.length >= 4 && (n.includes(d.n) || d.n.includes(n))) ?? null;
    return {
      katalog: k ? `ja (${k.key}, ${k.haerte})` : ahnlich ? `ähnlich: ${ahnlich.key}` : 'fehlt',
      textur: t ? 'ja' : tAhnlich ? `ähnlich: ${tAhnlich.f}` : 'fehlt',
      zerstoerbar: k ? k.haerte : 'offen',
    };
  };
}

function verteilung(biome, feld) {
  const m = new Map();
  for (const b of biome) {
    const namen = feld === 'material' ? [...b.material.keys()] : b[feld];
    for (const n of namen) m.set(n, [...(m.get(n) ?? []), b.nr]);
  }
  return m;
}

const kurz = (b) => `${b.nr} ${b.titel}`;

function schreibeBiom(b, biome, vm, vo, vt, info) {
  const namen = new Map(biome.map((x) => [x.nr, kurz(x)]));
  const geteilt = (liste_) => liste_.filter((n) => n !== b.nr).map((n) => namen.get(n)).join('; ');
  const z = [];
  z.push(`# Biom ${b.nr}: ${b.titel}`, '', '> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die SSOT.', '');
  z.push('## Beschreibung', '', b.kern || '(in der SSOT keine Beschreibung)', '');
  z.push('## Materialien (Terrain)', '', '| Material | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |', '| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
  for (const [n, v] of b.material) {
    const i = info(n);
    z.push(`| ${n} | ${v || '–'} | ${i.katalog} | ${i.textur} | offen | ${i.zerstoerbar} | offen | ${geteilt(vm.get(n)) || '**einzigartig**'} |`);
  }
  z.push('', '## Objekte', '', '| Objekt | Zustände | Auslöser | Folgen | Auch in |', '| :-- | :-- | :-- | :-- | :-- |');
  for (const n of b.objekte) z.push(`| ${n} | offen | offen | offen | ${geteilt(vo.get(n)) || '**einzigartig**'} |`);
  if (!b.objekte.length) z.push('| – | | | | |');
  z.push('', '## Trigger', '');
  for (const n of b.trigger) z.push(`- ${n} — ${geteilt(vt.get(n)) ? `auch in: ${geteilt(vt.get(n))}` : '**einzigartig**'}`);
  if (!b.trigger.length) z.push('- (keine in der SSOT)');
  z.push('', '## Sonderwirkung', '', b.sonder ?? 'keine eigene; es gelten die Standardreaktionen der SSOT.', '');
  z.push('## Kartenformen', '');
  for (const k of b.karten) z.push(`- ${k}`);
  const einzig = [...b.material.keys()].filter((n) => vm.get(n).length === 1);
  const einzigO = b.objekte.filter((n) => vo.get(n).length === 1);
  z.push('', '## Einzigartig in diesem Biom', '', `- **Materialien (${einzig.length}):** ${einzig.join(', ') || '–'}`, `- **Objekte (${einzigO.length}):** ${einzigO.join(', ') || '–'}`, '');
  return z.join('\n');
}

function schreibeGesamt(biome, vm, vo, vt, info) {
  const namen = new Map(biome.map((x) => [x.nr, x.nr]));
  const nrs = (l) => l.map((n) => namen.get(n)).join(', ');
  const z = ['# Gesamtliste: Materialien, Objekte, Trigger, Sonderwirkungen', '',
    '> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern.', '',
    'Jede Zeile ist ein Eintrag, der **einzeln** gebaut und mit den drei Eigenschaften belegt wird: **Optik**, **Zerstörbarkeit**, **Bewegung** (Reihenfolge laut Auftraggeber). „Biome“ nennt die Nummern aus der SSOT.', ''];
  const fehlend = [...vm.keys()].filter((n) => info(n).katalog === 'fehlt').length;
  z.push(`**Stand:** ${biome.length} Biome · ${vm.size} Materialien (${fehlend} ohne Katalogeintrag) · ${vo.size} Objekte · ${vt.size} Trigger.`, '');
  z.push('## Materialien', '', '| Material | Biome | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung |', '| :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
  for (const n of [...vm.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
    const i = info(n);
    z.push(`| ${n} | ${nrs(vm.get(n))} | ${i.katalog} | ${i.textur} | offen | ${i.zerstoerbar} | offen |`);
  }
  z.push('', '## Objekte', '', '| Objekt | Biome | Zustände | Auslöser | Folgen |', '| :-- | :-- | :-- | :-- | :-- |');
  for (const n of [...vo.keys()].sort((a, b) => a.localeCompare(b, 'de'))) z.push(`| ${n} | ${nrs(vo.get(n))} | offen | offen | offen |`);
  z.push('', '## Trigger', '', '| Trigger | Biome |', '| :-- | :-- |');
  for (const n of [...vt.keys()].sort((a, b) => a.localeCompare(b, 'de'))) z.push(`| ${n} | ${nrs(vt.get(n))} |`);
  z.push('', '## Sonderwirkungen', '', '| Biom | Sonderwirkung |', '| :-- | :-- |');
  for (const b of biome) if (b.sonder) z.push(`| ${kurz(b)} | ${b.sonder} |`);
  z.push('');
  return z.join('\n');
}

const biome = lies();
const info = katalog();
const vm = verteilung(biome, 'material');
const vo = verteilung(biome, 'objekte');
const vt = verteilung(biome, 'trigger');
fs.mkdirSync(AUS, { recursive: true });
for (const f of fs.readdirSync(AUS)) if (/^\d\d-.*\.md$/.test(f)) fs.unlinkSync(path.join(AUS, f));
for (const b of biome) fs.writeFileSync(path.join(AUS, `${String(b.nr).padStart(2, '0')}-${slug(b.titel)}.md`), schreibeBiom(b, biome, vm, vo, vt, info));
fs.writeFileSync(path.join(AUS, 'gesamtliste.md'), schreibeGesamt(biome, vm, vo, vt, info));
console.log(`${biome.length} Biome, ${vm.size} Materialien, ${vo.size} Objekte, ${vt.size} Trigger`);
