#!/usr/bin/env node
// Erzeugt Hashes für die Umgebungsvariablen der Webseite. Passwort NUR über stdin, nie als Argument.
//   printf 'Anmeldepasswort' | node scripts/betrieb/web/geheimnis-hash.mjs
//     -> PBKDF2-Hash für PA_REGISTRIER_HASH, PA_START_HASH und die Einträge in PA_KONTEN_SAAT
// Ohne Kommandozeile geht auch public/passwort-hash.html im Browser (dasselbe Format).
import { hashePasswort } from './hash.mjs';

let roh = '';
for await (const c of process.stdin) roh += c;
const passwort = roh.replace(/\r?\n$/, '');
if (passwort.length < 8) { console.error('Passwort zu kurz (mindestens 8 Zeichen).'); process.exit(2); }
console.log(await hashePasswort(passwort));
