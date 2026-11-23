/**
 * Passwort-Hashes der Webseite. Zwei Formate werden geprüft (Erkennung am Präfix):
 *   pbkdf2$Runden$salz$hash  PBKDF2-SHA256; alle NEUEN Hashes (Nutzer und Geheimnisse), auch aus public/passwort-hash.html
 *   scrypt$N$r$p$salz$hash   ältere Hashes wie die Spielkonten (src/server/konto.js); werden weiter angenommen und bei
 *                            der nächsten Anmeldung auf PBKDF2 umgestellt (`brauchtNeuenHash`)
 *
 * Entscheidung des Auftraggebers 2026-11-23: schwächerer Hash statt bezahltem Cloudflare-Tarif. Der kostenlose Tarif
 * erlaubt nur wenige Millisekunden Rechenzeit je Aufruf; scrypt (N=16384) passt nicht hinein. `RUNDEN` = 20 000 braucht
 * gemessen 2,6 ms (node:crypto) bzw. 4,6 ms (WebCrypto) auf dem Entwicklungsrechner. Ausgleich für die schwächeren
 * Kosten: Sperren je Name, Adresse und IP (nutzer.mjs) und die Passwortmindestlänge.
 */
import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pruefePasswort as pruefeScrypt } from '../../../src/server/konto.js';

const pbkdf2 = promisify(pbkdf2Cb);
export const RUNDEN = 20_000;
/** Für unbekannte Kennungen: kostet dieselbe Rechenzeit wie ein echter Hash, passt aber zu keinem Passwort. */
export const LEER_HASH = `pbkdf2$${RUNDEN}$00$00`;

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

/** Nutzerpasswort hashen (PBKDF2 mit `RUNDEN`). */
export const hasheNutzerPasswort = (passwort) => hashePasswort(passwort);

/** Wahr, wenn ein gespeicherter Hash nicht das aktuelle Format hat (scrypt oder andere Rundenzahl). */
export function brauchtNeuenHash(gespeichert) {
  return !String(gespeichert ?? '').startsWith(`pbkdf2$${RUNDEN}$`);
}

/** Prüft gegen beide Formate. Unbekanntes Format = falsch. */
export async function pruefeGeheimnis(passwort, gespeichert) {
  const text = String(gespeichert ?? '');
  try {
    if (text.startsWith('pbkdf2$')) return await pruefePbkdf2(passwort, text);
    if (text.startsWith('scrypt$')) return await pruefeScrypt(String(passwort), text);
  } catch { /* kaputter Hash */ }
  return false;
}
