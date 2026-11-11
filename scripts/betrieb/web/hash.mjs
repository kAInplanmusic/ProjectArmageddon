/**
 * Passwort-Hashes der Webseite. Zwei Formate werden geprüft (Erkennung am Präfix):
 *   scrypt$N$r$p$salz$hash   wie die Spielkonten (src/server/konto.js — dieselbe Prüfung, keine zweite)
 *   pbkdf2$Runden$salz$hash  wie public/passwort-hash.html im Browser erzeugt (für Anmelde- und Startpasswort)
 * Neue Hashes für Nutzer und für die Geheimnisse (Anmelde-/Startpasswort) sind scrypt.
 */
import { pbkdf2 as pbkdf2Cb, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hashePasswort as hasheScryptStandard, pruefePasswort as pruefeScrypt } from '../../../src/server/konto.js';

const pbkdf2 = promisify(pbkdf2Cb);
const scrypt = promisify(scryptCb);
export const RUNDEN = 600_000;
/** Kosten für die Geheimnisse in Umgebungsvariablen (selten geprüft, wenige Versuche): stärker als die Spielkonten. */
export const SCRYPT_STARK = Object.freeze({ N: 65536, r: 8, p: 1, keylen: 64 });

export async function hashePasswort(passwort, salz = randomBytes(16), runden = RUNDEN) {
  const h = await pbkdf2(String(passwort), salz, runden, 32, 'sha256');
  return `pbkdf2$${runden}$${salz.toString('hex')}$${h.toString('hex')}`;
}

export async function pruefePbkdf2(passwort, gespeichert) {
  const [art, n, salz, hash] = String(gespeichert ?? '').split('$');
  const runden = Number(n);
  if (art !== 'pbkdf2' || !(runden >= 1000 && runden <= 5_000_000) || !/^[0-9a-f]+$/.test(salz ?? '') || !/^[0-9a-f]+$/.test(hash ?? '')) return false;
  const soll = Buffer.from(hash, 'hex');
  const ist = await pbkdf2(String(passwort), Buffer.from(salz, 'hex'), runden, soll.length, 'sha256');
  return ist.length === soll.length && timingSafeEqual(ist, soll);
}

/** scrypt mit den starken Kosten (für Geheimnisse). Format wie konto.js, daher von `pruefeScrypt` prüfbar. */
export async function hasheStark(passwort, salz = randomBytes(16)) {
  const { N, r, p, keylen } = SCRYPT_STARK;
  const h = await scrypt(String(passwort), salz, keylen, { N, r, p, maxmem: 96 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salz.toString('hex')}$${h.toString('hex')}`;
}

/** Nutzerpasswort hashen (scrypt wie die Spielkonten). */
export const hasheNutzerPasswort = hasheScryptStandard;

/** Prüft gegen beide Formate. Unbekanntes Format = falsch. */
export async function pruefeGeheimnis(passwort, gespeichert) {
  const text = String(gespeichert ?? '');
  try {
    if (text.startsWith('pbkdf2$')) return await pruefePbkdf2(passwort, text);
    if (text.startsWith('scrypt$')) return await pruefeScrypt(String(passwort), text);
  } catch { /* kaputter Hash */ }
  return false;
}
