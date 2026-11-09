#!/usr/bin/env node
/**
 * Schreibt die Rollen aus `src/shared/config/waffen-rollen.js` ins
 * Sprite-Manifest (`src/client/assets/weapon-sprites/manifest.json`).
 *
 * BAL-11: Das Manifest ist die Stelle, an der die Darstellung nachschlägt.
 * Die Rolle (Hand/Rücken/Aufstell/Beschwörung/Symbol) und der Wirkpfad
 * (Projektil/Strahl/Selbst) dürfen dort nicht aus `delivery` geraten werden:
 * 96 Waffen tragen eine Geschosszelle, aber nur 87 starten ein echtes Geschoss.
 * Die neun übrigen Bilder sind Begleitmaterial und werden mit
 * `projectile.eigenerPfad: false` gekennzeichnet.
 *
 * Aufruf: `node scripts/waffen-rollen-eintragen.mjs` (idempotent, prüft 150 IDs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROLLEN, ROLLE_JE_WAFFE, WIRKPFAAD_JE_WAFFE, SPEZIALFAELLE, rollenUebersicht,
} from '../src/shared/config/waffen-rollen.js';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(WURZEL, 'src', 'client', 'assets', 'weapon-sprites', 'manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const ids = Object.keys(manifest.waffen ?? {});
const sollIds = Object.keys(ROLLE_JE_WAFFE);

const fehlend = sollIds.filter(id => !manifest.waffen[id]);
const ueberzaehlig = ids.filter(id => !ROLLE_JE_WAFFE[id]);
if (fehlend.length || ueberzaehlig.length) {
  console.error(`Manifest und Rollentabelle passen nicht: fehlend ${fehlend.join(', ') || '—'}; überzählig ${ueberzaehlig.join(', ') || '—'}`);
  process.exit(1);
}

let geschossbilder = 0;
let projektilpfade = 0;
const bilderOhnePfad = [];
for (const [id, w] of Object.entries(manifest.waffen)) {
  const rolle = ROLLE_JE_WAFFE[id];
  const wirkpfad = WIRKPFAAD_JE_WAFFE[id];
  w.rolle = rolle;
  w.wirkpfad = wirkpfad;
  if (SPEZIALFAELLE[id]) w.rollenHinweis = SPEZIALFAELLE[id];
  else delete w.rollenHinweis;

  if (w.projectile) {
    geschossbilder += 1;
    const eigenerPfad = wirkpfad === 'projektil';
    w.projectile.eigenerPfad = eigenerPfad;
    w.projectile.verwendung = eigenerPfad ? 'geschoss' : 'begleitbild';
    if (eigenerPfad) projektilpfade += 1;
    else bilderOhnePfad.push(id);
  }
}

const uebersicht = rollenUebersicht();
manifest.rollen = {
  hinweis: 'rolle = wie die Waffe an der Figur hängt; wirkpfad = was die Figur beim Einsatz verlässt. '
    + 'Die 96 Geschosszellen sind nicht 96 Projektilpfade: 87 Waffen starten ein Geschoss, 9 Bilder sind '
    + 'Begleitmaterial (Abgas, Portalglanz, Turmschuss, Beschwörungsglühen). Quelle: src/shared/config/waffen-rollen.js.',
  definitionen: Object.fromEntries(Object.entries(ROLLEN).map(([id, r]) => [id, r.beschreibung])),
  zaehlung: uebersicht.rollen,
  wirkpfade: uebersicht.wirkpfade,
  geschossbilder,
  projektilpfade,
  bilderOhnePfad: bilderOhnePfad.sort(),
};

fs.writeFileSync(MANIFEST, `${JSON.stringify({
  version: manifest.version,
  generator: manifest.generator,
  facing: manifest.facing,
  hinweis: manifest.hinweis,
  rollen: manifest.rollen,
  zellen: manifest.zellen,
  atlanten: manifest.atlanten,
  waffen: manifest.waffen,
}, null, 1)}\n`);
console.log(`Manifest aktualisiert: ${uebersicht.gesamt} Rollen, ${geschossbilder} Geschossbilder, ${projektilpfade} Projektilpfade, ${bilderOhnePfad.length} Bilder ohne Pfad.`);
