#!/usr/bin/env node
/**
 * Setzt das Passwort eines Kontos auf dem Server neu.
 *
 * Es gibt bewusst keine Selbst-Wiederherstellung (kein E-Mail-Feld, siehe
 * `docs/konto-und-bestenliste.md`). Wer sein Passwort vergisst, wendet sich an
 * den Betrieb; dieses Skript ist der Weg.
 *
 * ## Aufruf
 *
 *     node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna
 *     node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna --passwort 'Neues-Passwort-1'
 *     PA_KONTEN_PFAD=/srv/pa/konten.db node scripts/betrieb/passwort-zuruecksetzen.mjs --name Anna
 *
 * Ohne `--passwort` wird ein zufälliges erzeugt (16 Zeichen, base64url) und
 * EINMAL auf stdout ausgegeben — das ist der einzige Kanal, über den der
 * Betreiber es erfährt. Es wird nicht protokolliert und nicht in eine Datei
 * geschrieben. Alle bestehenden Sitzungen des Kontos werden entwertet.
 *
 * ## Sicherheit
 *
 * Der Aufruf braucht Schreibzugriff auf die Kontendatei — also dieselben Rechte
 * wie der Server. Er läuft NICHT über das Netz und hat keine HTTP-Route: Ein
 * Passwort-Reset ist eine Betreiberhandlung, keine Selbstbedienung.
 *
 * Exit-Codes: 0 Erfolg, 2 Konto unbekannt, 3 Aufruffehler, 4 Speicherfehler.
 */
import { randomBytes } from 'node:crypto';
import { oeffneSpeicher } from '../../src/server/kontoSpeicher.js';
import { hashePasswort, nameSchluessel, pruefePasswortform } from '../../src/server/konto.js';

function argumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [schluessel, direkt] = arg.slice(2).split('=');
    if (direkt !== undefined) {
      werte[schluessel] = direkt;
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      werte[schluessel] = argv[i + 1];
      i += 1;
    } else {
      werte[schluessel] = true;
    }
  }
  return werte;
}

const args = argumente(process.argv.slice(2));

if (args.hilfe || args.help) {
  console.log('Aufruf: passwort-zuruecksetzen.mjs --name <Name> [--passwort <Passwort>] [--datenbank <Pfad>]');
  process.exit(0);
}

if (typeof args.name !== 'string' || args.name.trim() === '') {
  console.error('Fehler: --name fehlt.');
  console.error('Aufruf: passwort-zuruecksetzen.mjs --name <Name> [--passwort <Passwort>] [--datenbank <Pfad>]');
  process.exit(3);
}

const neuesPasswort = typeof args.passwort === 'string'
  ? args.passwort
  : randomBytes(12).toString('base64url');

const formFehler = pruefePasswortform(neuesPasswort);
if (formFehler) {
  console.error(`Fehler: ${formFehler}`);
  process.exit(3);
}

const pfad = typeof args.datenbank === 'string'
  ? args.datenbank
  : (process.env.PA_KONTEN_PFAD ?? '.pa-state/konten.db');

let speicher;
try {
  speicher = oeffneSpeicher({ pfad, art: process.env.PA_KONTEN_SPEICHER ?? 'auto' });
} catch (fehler) {
  console.error(`Fehler: Kontospeicher konnte nicht geöffnet werden: ${fehler.message}`);
  process.exit(4);
}

const konto = speicher.kontoNachNameKlein(nameSchluessel(args.name));
if (!konto) {
  console.error(`Fehler: Kein Konto mit dem Namen „${args.name}" gefunden.`);
  speicher.schliessen();
  process.exit(2);
}

try {
  const hash = await hashePasswort(neuesPasswort);
  if (!speicher.passwortSetzen(konto.id, hash)) {
    console.error('Fehler: Passwort konnte nicht gespeichert werden.');
    speicher.schliessen();
    process.exit(4);
  }
  const entwertet = speicher.sitzungenVonKontoLoeschen(konto.id);
  speicher.schliessen();
  /*
   * Ausgabe auf stdout, nicht über den Logger: Der Betreiber muss das neue
   * Passwort erfahren, sonst wäre der Reset nutzlos. Es ist die EINZIGE Stelle,
   * an der ein Passwort im Klartext erscheint — und sie endet im Terminal des
   * Betreibers, nicht in einer Logdatei.
   */
  console.log(`Passwort für „${konto.name}" neu gesetzt.`);
  console.log(`Neues Passwort: ${neuesPasswort}`);
  console.log(`Entwertete Sitzungen: ${entwertet}`);
} catch (fehler) {
  console.error(`Fehler: ${fehler.message}`);
  speicher.schliessen();
  process.exit(4);
}
