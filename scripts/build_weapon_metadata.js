#!/usr/bin/env node
/**
 * generate weapon metadata JSON from the PNG icon files.
 * If a CSV with detailed stats exists, it will be used; otherwise a placeholder
 * entry is created for each PNG.
 */
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'assets', 'weapons', 'source');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'client', 'assets', 'weapons.json');

function humanize(name) {
  // Turn "IMG_9033" into "Img 9033" – simple heuristic
  return name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
}

function readCSV(csvPath) {
  const rows = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = rows[0].split(',');
  const data = {};
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(',');
    const entry = {};
    header.forEach((h, idx) => entry[h.trim()] = cols[idx]?.trim());
    if (entry.id) data[entry.id] = entry;
  }
  return data;
}

let csvData = {};
const csvPath = path.join(__dirname, '..', 'project_armageddon_weapon_index.csv');
if (fs.existsSync(csvPath)) {
  csvData = readCSV(csvPath);
}

const weapons = {};
fs.readdirSync(ICONS_DIR).forEach(file => {
  if (!file.match(/\.png$/i)) return;
  const id = path.basename(file, path.extname(file));
  const base = csvData[id] || {};
  weapons[id] = {
    id,
    name: base.displayName || humanize(id),
    type: base.category || 'unknown',
    rarity: base.rarity || 'common',
    baseDamage: Number(base.baseDamage) || 0,
    damageType: base.damage_type || 'physical',
    icon: `src/client/assets/icons/${id}_icon.png`
  };
});

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(weapons, null, 2));
console.log('Weapon metadata written to', OUTPUT_FILE);
