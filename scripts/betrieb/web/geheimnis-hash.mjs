#!/usr/bin/env node
// Erzeugt Hashes für die Umgebungsvariablen der Webseite. Passwort NUR über stdin, nie als Argument.
//   printf 'Anmeldepasswort' | node scripts/betrieb/web/geheimnis-hash.mjs            -> scrypt-Hash (PA_REGISTRIER_HASH / PA_START_HASH)
//   printf '...' | node scripts/betrieb/web/geheimnis-hash.mjs --konto               -> Hash eines Nutzerpassworts (scrypt wie die Spielkonten)
// Ohne Kommandozeile geht auch public/passwort-hash.html im Browser (PBKDF2, wird ebenfalls akzeptiert).
import { hasheNutzerPasswort, hasheStark } from './hash.mjs';

let roh = '';
for await (const c of process.stdin) roh += c;
const passwort = roh.replace(/\r?\n$/, '');
if (passwort.length < 8) { console.error('Passwort zu kurz (mindestens 8 Zeichen).'); process.exit(2); }
console.log(process.argv.includes('--konto') ? await hasheNutzerPasswort(passwort) : await hasheStark(passwort));
