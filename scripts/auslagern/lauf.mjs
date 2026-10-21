#!/usr/bin/env node
/**
 * Auslagerung einer Programmieraufgabe an ein externes Sprachmodell (OpenAI-kompatible API).
 *
 *   node scripts/auslagern/lauf.mjs <aufgabe.json> [--worktree DIR]
 *
 * aufgabe.json: { name, anbieter: {url, modell, keyEnv}, aufgabe: "Text", dateien: ["relativer/pfad", ...],
 *                 pruefen: ["npx eslint ...", "node --test tests/x.test.js"], runden: 4 }
 * Ablauf: Dateien lesen -> Modell liefert JSON {dateien:[{pfad, inhalt}]} (vollständige neue Dateiinhalte,
 * auch neue Dateien) -> schreiben -> Prüfbefehle -> bei Fehler Ausgabe zurückgeben (bis `runden`) ->
 * Ergebnis im Worktree, Commit auf dem Branch des Worktrees. Nie direkt auf main; der Koordinator prüft den Diff.
 * Schlüssel werden nur aus der Umgebung gelesen und nie geschrieben oder ausgegeben.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const [, , aufgabenDatei, ...rest] = process.argv;
const wt = path.resolve(rest[rest.indexOf('--worktree') + 1] || '.');
const A = JSON.parse(fs.readFileSync(aufgabenDatei, 'utf8'));
const key = process.env[A.anbieter.keyEnv];
if (!key) { console.error('Schlüssel fehlt:', A.anbieter.keyEnv); process.exit(2); }

const lies = p => { const f = path.join(wt, p); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const regeln = fs.readFileSync(path.join(wt, 'AGENTS.md'), 'utf8');
const sys = `Du bist ein erfahrener JavaScript-Entwickler (reines ESM, kein TypeScript) in einem Repo mit diesen Regeln:\n${regeln}\n` +
  'Antworte AUSSCHLIESSLICH mit JSON: {"hinweis":"kurz","dateien":[{"pfad":"relativ","inhalt":"VOLLSTÄNDIGER neuer Dateiinhalt"}]}. ' +
  'Nur geänderte oder neue Dateien liefern. Kommentare und Texte deutsch, Stil und Dichte der umgebenden Dateien übernehmen. Keine Tests abschwächen oder löschen.';
const verlauf = [{ role: 'system', content: sys }];
const kontext = A.dateien.map(p => `=== ${p} ===\n${lies(p) ?? '(neu)'}`).join('\n\n');
verlauf.push({ role: 'user', content: `${A.aufgabe}\n\nDateien:\n${kontext}` });

async function frage() {
  const r = await fetch(A.anbieter.url, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: A.anbieter.modell, messages: verlauf, temperature: 0.2, max_tokens: 16000, ...(A.anbieter.json === false ? {} : { response_format: { type: 'json_object' } }) }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}
let ok = false;
for (let runde = 1; runde <= (A.runden || 4); runde++) {
  const antwort = await frage();
  verlauf.push({ role: 'assistant', content: antwort });
  let d;
  try { d = JSON.parse(antwort); } catch { verlauf.push({ role: 'user', content: 'Kein gültiges JSON. Nur JSON liefern.' }); continue; }
  for (const f of d.dateien || []) {
    if (f.pfad.includes('..') || path.isAbsolute(f.pfad)) continue;
    fs.mkdirSync(path.dirname(path.join(wt, f.pfad)), { recursive: true });
    fs.writeFileSync(path.join(wt, f.pfad), f.inhalt);
  }
  console.log(`Runde ${runde}: ${(d.dateien || []).map(f => f.pfad).join(', ')} — ${d.hinweis || ''}`);
  let fehler = '';
  for (const cmd of A.pruefen || []) {
    try { execSync(cmd, { cwd: wt, stdio: 'pipe', timeout: 600000, env: { ...process.env, PA_ZUGPAUSE_SEKUNDEN: '0' } }); }
    catch (e) { fehler += `$ ${cmd}\n${String(e.stdout || '')}${String(e.stderr || '')}`.slice(-3500) + '\n'; }
  }
  if (!fehler) { ok = true; break; }
  console.log('Prüfung rot, Rückgabe an das Modell');
  verlauf.push({ role: 'user', content: `Die Prüfung schlägt fehl:\n${fehler}\nKorrigiere und liefere wieder JSON mit den vollständigen geänderten Dateien.` });
}
try {
  execSync(`git add -A && git commit -q -m "Ausgelagert (${A.name}, ${A.anbieter.modell}): ${ok ? 'Prüfung grün' : 'Prüfung ROT, Zwischenstand'}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`, { cwd: wt });
} catch { /* nichts geändert */ }
console.log(ok ? 'FERTIG grün' : 'FERTIG rot');
process.exit(ok ? 0 : 1);
