#!/usr/bin/env node
/**
 * Erzeugt die Zeile PA_STARTER_PASSWORT_HASH=… für die Umgebungsdatei des Starters.
 * Das Passwort wird von stdin gelesen (nicht als Argument: Shell-Verlauf) und nie gespeichert:
 *   printf '%s' 'mein passwort' | node passwort-hash.mjs
 * Zusätzlich mit --geheimnis eine Zeile PA_STARTER_GEHEIMNIS=<zufall>.
 */
import { randomBytes } from 'node:crypto';
import { hashePasswort } from './starter.mjs';

let eingabe = '';
process.stdin.setEncoding('utf8');
for await (const teil of process.stdin) eingabe += teil;
const passwort = eingabe.replace(/\r?\n$/, '');
if (passwort.length < 10) { console.error('Passwort zu kurz (mindestens 10 Zeichen).'); process.exit(1); }
console.log(`PA_STARTER_PASSWORT_HASH=${hashePasswort(passwort)}`);
if (process.argv.includes('--geheimnis')) console.log(`PA_STARTER_GEHEIMNIS=${randomBytes(32).toString('hex')}`);
