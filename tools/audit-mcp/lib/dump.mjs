#!/usr/bin/env node
import { doppelregeln, beurteileDoppelregeln } from './statisch.mjs';

const m = doppelregeln();
const u = beurteileDoppelregeln(m);
console.log(JSON.stringify({
  anzahl: m.length,
  begruendet: u.begruendet.map(d => d.name),
  verwaist: u.verwaisteAusnahmen.map(d => d.name),
  offen: u.offen.map(d => ({ name: d.name, orte: d.orte, grund: d.grund })),
}, null, 2));