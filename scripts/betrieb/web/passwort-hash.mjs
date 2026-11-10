#!/usr/bin/env node
// Schreibt den Passwort-Hash für PA_WEB_PASSWORT_HASH. Passwort aus der Eingabe (stdin), NIE als Argument.
//   printf 'mein langes passwort' | node scripts/betrieb/web/passwort-hash.mjs
import { hashePasswort } from './gateway-kern.mjs';

let roh = '';
for await (const c of process.stdin) roh += c;
const passwort = roh.replace(/\r?\n$/, '');
if (passwort.length < 12) { console.error('Passwort zu kurz (mindestens 12 Zeichen).'); process.exit(2); }
console.log(await hashePasswort(passwort));
