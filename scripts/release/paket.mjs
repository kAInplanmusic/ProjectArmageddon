#!/usr/bin/env node
/**
 * Release-Paket (DEP-1/REL-1): baut ein versioniertes Archiv zum Ausrollen auf einem Knoten.
 *
 * ## Aufruf
 *
 *     npm run build && npm run release:paket          # Archiv nach release/
 *     node scripts/release/paket.mjs --bauen           # baut vorher selbst (npm run build)
 *     node scripts/release/paket.mjs --trocken         # zeigt nur, was hineinkäme
 *
 * Optionen: `--ausgabe <dir>` (Vorgabe `release/`), `--dist <dir>` (Vorgabe `dist/`),
 * `--erlaube-geaendert` (Build aus einem Arbeitsbaum mit Änderungen zulassen).
 *
 * ## Ergebnis
 *
 *     release/projectarmageddon-<version>-<sha7>.tar.gz
 *     release/projectarmageddon-<version>-<sha7>.tar.gz.sha256   (Format von `sha256sum -c`)
 *
 * Im Archiv liegt ein Ordner `projectarmageddon-<version>-<sha7>/` mit allem, was der Server
 * braucht: `dist/` (gebauter Client samt `version.json`), `src/server|engine|shared`,
 * `scripts/server.mjs`, `scripts/betrieb/`, `scripts/release/`, `deploy/`, `package.json`,
 * `package-lock.json`, die Betriebsdokumente und `RELEASE.json` (Bauinfo + Dateiliste mit SHA-256).
 * `node_modules` liegt NICHT darin: `scripts/release/deploy.sh` installiert auf dem Knoten
 * `npm ci --omit=dev` (eine Laufzeitabhängigkeit: `ws`).
 *
 * ## Was das Skript verweigert
 *
 * - `dist/` fehlt oder passt nicht zur Version in `package.json` (veralteter Build);
 * - der Build kam aus einem Arbeitsbaum mit Änderungen (nicht reproduzierbar) — außer mit
 *   `--erlaube-geaendert`;
 * - eine Datei sieht nach einem Geheimnis aus (`.env`, `betrieb.env`, Schlüssel, Token-Zeile);
 * - ein Import des Servers zeigt auf eine Datei, die nicht im Paket liegt.
 *
 * Reproduzierbar: Dateien sortiert, Eigentümer 0, Zeitstempel = Bauzeit, `gzip -n`. Zwei Läufe
 * über denselben Build ergeben dieselbe Prüfsumme (Test: `tests/release-paket.test.js`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WURZEL } from './bauinfo.mjs';

/** Verzeichnisse und Dateien aus dem Projekt (ohne `dist/`, das kommt aus `--dist`). */
export const INHALT = Object.freeze({
  verzeichnisse: ['src/server', 'src/engine', 'src/shared', 'scripts/betrieb', 'scripts/release', 'deploy'],
  dateien: [
    'scripts/server.mjs', 'package.json', 'package-lock.json', 'AGENTS.md',
    'docs/betrieb.md', 'docs/betrieb-INSTANZ.md', 'docs/deploy-plan.md',
    'docs/sicherheit-vor-oeffentlich.md',
  ],
});

/** Nie mitnehmen (Laufzeitreste, Abhängigkeiten, Python-Zwischenstände). */
const AUSLASSEN = [/(^|\/)node_modules(\/|$)/, /(^|\/)\.pa-state(\/|$)/, /(^|\/)__pycache__(\/|$)/, /\.log$/, /\.pyc$/, /(^|\/)\.DS_Store$/];

/** Dateinamen, die nach Geheimnis aussehen. `*.example` ist ausdrücklich erlaubt. */
const GEHEIM_NAME = [
  /(^|\/)\.env(\.[^/]*)?$/, /(^|\/)betrieb\.env$/, /\.(pem|key|p12|pfx|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, /(^|\/)\.npmrc$/, /token/i,
];
/** Inhalte, die ein Geheimnis sind (nicht: Erwähnungen in Kommentaren). */
const GEHEIM_INHALT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^\s*(export\s+)?HCLOUD_TOKEN\s*=\s*['"]?[A-Za-z0-9]{20,}/m,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
];
/** Erlaubte Ausnahmen der Namensregeln (Skripte, die ein Token VERWALTEN, enthalten keins). */
const GEHEIM_ERLAUBT = [/\.example$/, /^scripts\/betrieb\/token-setzen\.sh$/];

const posix = p => p.split(sep).join('/');

function laufe(verzeichnis, basis, ergebnis) {
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = join(verzeichnis, eintrag.name);
    const rel = posix(relative(basis, voll));
    if (AUSLASSEN.some(r => r.test(rel))) continue;
    if (eintrag.isDirectory()) laufe(voll, basis, ergebnis);
    else if (eintrag.isFile()) ergebnis.push(rel);
  }
  return ergebnis;
}

/**
 * Liste der Paketdateien als `{ ziel, quelle }` (Ziel relativ zum Paketordner).
 *
 * @param {{root?: string, distDir?: string}} [optionen]
 */
export function sammleDateien({ root = WURZEL, distDir = join(root, 'dist') } = {}) {
  const liste = [];
  for (const v of INHALT.verzeichnisse) {
    for (const rel of laufe(join(root, v), root, [])) liste.push({ ziel: rel, quelle: join(root, rel) });
  }
  for (const d of INHALT.dateien) {
    if (!existsSync(join(root, d))) throw new Error(`Pflichtdatei fehlt: ${d}`);
    liste.push({ ziel: d, quelle: join(root, d) });
  }
  for (const rel of laufe(distDir, distDir, [])) liste.push({ ziel: `dist/${rel}`, quelle: join(distDir, rel) });
  return liste.sort((a, b) => (a.ziel < b.ziel ? -1 : a.ziel > b.ziel ? 1 : 0));
}

/**
 * Findet Dateien, die nach Geheimnis aussehen. Leere Liste = sauber.
 *
 * @param {{ziel: string, quelle?: string, inhalt?: string}[]} dateien
 * @returns {string[]} Befunde, je einer pro Datei
 */
export function pruefeGeheimnisse(dateien) {
  const befunde = [];
  for (const { ziel, quelle, inhalt } of dateien) {
    if (GEHEIM_ERLAUBT.some(r => r.test(ziel))) continue;
    if (GEHEIM_NAME.some(r => r.test(ziel))) { befunde.push(`${ziel}: Dateiname sieht nach Geheimnis aus`); continue; }
    if (ziel.startsWith('dist/') && !/\.(js|json|html|css|txt|webmanifest)$/.test(ziel)) continue; // Bilder, Ton
    let text = inhalt;
    if (text === undefined && quelle) {
      if (statSync(quelle).size > 4 * 1024 * 1024) continue;
      text = readFileSync(quelle, 'utf8');
    }
    if (text !== undefined && GEHEIM_INHALT.some(r => r.test(text))) befunde.push(`${ziel}: Inhalt sieht nach Geheimnis aus`);
  }
  return befunde;
}

const IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/**
 * Alle relativ importierten Dateien ab einem Einstieg (statische und literale dynamische Importe).
 *
 * @param {string} root
 * @param {string} einstieg relativ zu `root`
 * @returns {Set<string>} Pfade relativ zu `root`
 */
export function importHuelle(root, einstieg) {
  const gesehen = new Set();
  const offen = [einstieg];
  while (offen.length) {
    const rel = offen.pop();
    if (gesehen.has(rel)) continue;
    gesehen.add(rel);
    const quelle = readFileSync(join(root, rel), 'utf8');
    for (const treffer of quelle.matchAll(IMPORT)) {
      const ziel = treffer[1] ?? treffer[2] ?? treffer[3];
      offen.push(posix(relative(root, resolve(root, dirname(rel), ziel))));
    }
  }
  return gesehen;
}

function sha256(puffer) {
  return createHash('sha256').update(puffer).digest('hex');
}

function argumente(argv) {
  const opt = { ausgabe: join(WURZEL, 'release'), dist: join(WURZEL, 'dist'), bauen: false, trocken: false, erlaubeGeaendert: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ausgabe') opt.ausgabe = resolve(argv[++i]);
    else if (a === '--dist') opt.dist = resolve(argv[++i]);
    else if (a === '--bauen') opt.bauen = true;
    else if (a === '--trocken' || a === '--dry-run') opt.trocken = true;
    else if (a === '--erlaube-geaendert') opt.erlaubeGeaendert = true;
    else if (a === '--help' || a === '-h') opt.hilfe = true;
    else throw new Error(`Unbekannte Option: ${a}`);
  }
  if (process.env.DRY_RUN === '1') opt.trocken = true;
  return opt;
}

/**
 * Baut das Paket. Gibt Name, Archivpfad, Prüfsumme und Dateiliste zurück.
 *
 * @param {{root?: string, ausgabe: string, dist: string, trocken?: boolean, erlaubeGeaendert?: boolean, log?: (s: string) => void}} opt
 */
export function baue(opt) {
  const root = opt.root ?? WURZEL;
  const log = opt.log ?? (s => console.log(s));
  const paket = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  if (!existsSync(join(opt.dist, 'index.html'))) throw new Error(`${opt.dist}/index.html fehlt — erst bauen (npm run build oder --bauen)`);
  if (!existsSync(join(opt.dist, 'version.json'))) throw new Error(`${opt.dist}/version.json fehlt — der Build ist älter als die Versionskennung, neu bauen`);
  const bau = JSON.parse(readFileSync(join(opt.dist, 'version.json'), 'utf8'));
  if (bau.version !== paket.version) {
    throw new Error(`Build trägt Version ${bau.version}, package.json ${paket.version} — Build veraltet, neu bauen`);
  }
  if (bau.geaendert === true && !opt.erlaubeGeaendert) {
    throw new Error('Build stammt aus einem Arbeitsbaum mit Änderungen (nicht reproduzierbar). Erst committen oder --erlaube-geaendert');
  }
  const sha7 = /^[0-9a-f]{7,}$/.test(String(bau.gitSha)) ? String(bau.gitSha).slice(0, 7) : 'unbekannt';
  const kennung = `${paket.version}-${sha7}${bau.geaendert === true ? '-geaendert' : ''}`;
  const name = `projectarmageddon-${kennung}`;

  const dateien = sammleDateien({ root, distDir: opt.dist });
  const ziele = new Set(dateien.map(d => d.ziel));
  const fehlend = [...importHuelle(root, 'scripts/server.mjs')].filter(p => !ziele.has(p));
  if (fehlend.length) throw new Error(`Server importiert Dateien außerhalb des Pakets: ${fehlend.join(', ')}`);
  const geheim = pruefeGeheimnisse(dateien);
  if (geheim.length) throw new Error(`Geheimnis-Verdacht, Paket verweigert:\n  ${geheim.join('\n  ')}`);

  log(`Paket ${name}: ${dateien.length} Dateien (davon ${dateien.filter(d => d.ziel.startsWith('dist/')).length} in dist/)`);
  if (opt.trocken) {
    log('Trockenlauf: es wird nichts geschrieben.');
    return { name, kennung, archiv: null, pruefsumme: null, dateien };
  }

  mkdirSync(opt.ausgabe, { recursive: true });
  const buehne = join(opt.ausgabe, `.bau-${process.pid}`);
  rmSync(buehne, { recursive: true, force: true });
  const ordner = join(buehne, name);
  try {
    const manifest = {};
    for (const { ziel, quelle } of dateien) {
      mkdirSync(dirname(join(ordner, ziel)), { recursive: true });
      cpSync(quelle, join(ordner, ziel), { preserveTimestamps: false });
      manifest[ziel] = sha256(readFileSync(quelle));
    }
    const release = {
      name: paket.name, kennung, version: paket.version, gitSha: bau.gitSha, bauzeit: bau.bauzeit,
      geaendert: bau.geaendert ?? null, node: paket.engines?.node ?? null, dateien: manifest,
    };
    writeFileSync(join(ordner, 'RELEASE.json'), `${JSON.stringify(release, null, 2)}\n`);

    const epoche = Number.isFinite(Date.parse(bau.bauzeit)) ? Math.floor(Date.parse(bau.bauzeit) / 1000) : 0;
    const archiv = join(opt.ausgabe, `${name}.tar.gz`);
    const zwischen = `${archiv}.tmp`;
    execFileSync('tar', [
      '--sort=name', '--owner=0', '--group=0', '--numeric-owner', `--mtime=@${epoche}`,
      '--mode=u+rwX,go+rX,go-w', '--use-compress-program=gzip -n', '-cf', zwischen, '-C', buehne, name,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    renameSync(zwischen, archiv);
    const pruefsumme = sha256(readFileSync(archiv));
    writeFileSync(`${archiv}.sha256`, `${pruefsumme}  ${name}.tar.gz\n`);
    log(`Archiv:     ${archiv}`);
    log(`SHA-256:    ${pruefsumme}`);
    return { name, kennung, archiv, pruefsumme, dateien };
  } finally {
    rmSync(buehne, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = argumente(process.argv.slice(2));
    if (opt.hilfe) {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    }
    if (opt.bauen && !opt.trocken) execFileSync('npm', ['run', 'build'], { cwd: WURZEL, stdio: 'inherit' });
    baue(opt);
  } catch (fehler) {
    console.error(`paket.mjs: ${fehler.message}`);
    process.exit(1);
  }
}
