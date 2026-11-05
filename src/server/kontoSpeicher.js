/**
 * Speicher für Konten, Sitzungen und Partieergebnisse.
 *
 * ## Warum SQLite (und wann JSON)
 *
 * Geprüft am 2026-11-05 mit `node -e "require('node:sqlite')"`: Die Laufzeit ist
 * Node **v26.12.1**, `node:sqlite` (SQLite 3.54.0) ist ohne Flag vorhanden.
 * Konten brauchen gleichzeitige, abgesicherte Schreibzugriffe; SQLite bringt
 * Transaktionen, einen UNIQUE-Index auf den kleingeschriebenen Namen und
 * Fremdschlüssel mit Löschkaskade mit — alles Dinge, die eine JSON-Datei von
 * Hand nachbauen müsste.
 *
 * Der JSON-Zweig bleibt trotzdem bestehen: `package.json` erlaubt Node ≥ 22,
 * und dort steckt `node:sqlite` hinter einem Flag. Fehlt das Modul, fällt der
 * Speicher auf eine JSON-Datei mit atomarem Schreiben (temp + rename) und einer
 * Sperrdatei zurück. Welcher Zweig läuft, steht in `art` und wird beim Start
 * protokolliert.
 *
 * ## Was hier NICHT liegt
 *
 * Lobbys und laufende Partien bleiben in `persistence.js` (eigene Datei, eigener
 * Lebenszyklus). Dieser Speicher kennt nur Konten, Sitzungstoken und die
 * Ergebnisse abgeschlossener Online-Partien.
 *
 * ## Passwörter und Token
 *
 * Gespeichert wird nur der scrypt-Hash des Passworts und der SHA-256-Hash des
 * Sitzungstokens. Beide Geheimnisse selbst verlassen den Prozess nie wieder.
 *
 * @module kontoSpeicher
 */

import { createRequire } from 'node:module';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync,
  statSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const KONTO_SPEICHER_VERSION = 1;

/** Felder eines Kontos, die fortgeschrieben werden dürfen. */
const KONTO_ZAHLEN = [
  'elo', 'partien', 'siege', 'niederlagen', 'kills', 'tode',
  'schaden', 'schuesse', 'treffer', 'beste_schuesse',
];

const require = createRequire(import.meta.url);

/** Hat diese Node-Fassung `node:sqlite`? Ergebnis wird je Prozess einmal ermittelt. */
let sqliteModul;
function ladeSqlite() {
  if (sqliteModul !== undefined) return sqliteModul;
  try {
    sqliteModul = require('node:sqlite');
  } catch {
    sqliteModul = null;
  }
  return sqliteModul;
}

/** Ist der SQLite-Zweig verfügbar? (Für Tests und die Startmeldung.) */
export function sqliteVerfuegbar() {
  return Boolean(ladeSqlite()?.DatabaseSync);
}

/**
 * Öffnet den Kontospeicher.
 *
 * @param {object} [optionen]
 * @param {string} [optionen.pfad='.pa-state/konten.db'] - SQLite-Datei; im
 *   JSON-Zweig wird daraus `.json`
 * @param {'auto'|'sqlite'|'json'} [optionen.art='auto']
 * @returns {KontoSpeicher}
 */
export function oeffneSpeicher({ pfad = '.pa-state/konten.db', art = 'auto' } = {}) {
  const ziel = resolve(process.cwd(), pfad);
  if (art === 'json' || (art === 'auto' && !sqliteVerfuegbar())) {
    return new JsonSpeicher({ pfad: ziel.replace(/\.db$/, '.json') });
  }
  if (!sqliteVerfuegbar()) {
    throw new Error('node:sqlite fehlt in dieser Node-Fassung — Speicherart „sqlite" ist nicht möglich');
  }
  return new SqliteSpeicher({ pfad: ziel });
}

/**
 * Gemeinsame Form eines Kontos nach außen.
 *
 * Die Datenbank speichert flach (`name_klein`, `passwort_hash`); hier bleibt
 * alles so, wie die Dienste es lesen.
 */
function kontoAusZeile(zeile) {
  if (!zeile) return null;
  return {
    id: zeile.id,
    name: zeile.name,
    nameKlein: zeile.name_klein,
    passwortHash: zeile.passwort_hash,
    elo: Number(zeile.elo),
    partien: Number(zeile.partien),
    siege: Number(zeile.siege),
    niederlagen: Number(zeile.niederlagen),
    kills: Number(zeile.kills),
    tode: Number(zeile.tode),
    schaden: Number(zeile.schaden),
    schuesse: Number(zeile.schuesse),
    treffer: Number(zeile.treffer),
    besteSchuesse: Number(zeile.beste_schuesse),
    angelegtAm: Number(zeile.angelegt_am),
    zuletztAm: Number(zeile.zuletzt_am),
  };
}

/** Leeres Konto für den JSON-Zweig und für Neuanlagen. */
function leeresKonto({ id, name, nameKlein, passwortHash, jetzt }) {
  return {
    id,
    name,
    name_klein: nameKlein,
    passwort_hash: passwortHash,
    elo: 1000,
    partien: 0,
    siege: 0,
    niederlagen: 0,
    kills: 0,
    tode: 0,
    schaden: 0,
    schuesse: 0,
    treffer: 0,
    beste_schuesse: 0,
    angelegt_am: jetzt,
    zuletzt_am: jetzt,
  };
}

/**
 * SQLite-Zweig.
 *
 * `DatabaseSync` läuft im selben Faden wie der Server. Die Schreibvorgänge sind
 * klein (ein Konto, eine Partie), und der Server ist ohnehin ein Prozess — ein
 * eigener Thread wäre eine zusätzliche Fehlerquelle ohne Gewinn.
 */
export class SqliteSpeicher {
  #db;
  #art = 'sqlite';

  constructor({ pfad }) {
    const { DatabaseSync } = ladeSqlite();
    mkdirSync(dirname(pfad), { recursive: true, mode: 0o700 });
    this.pfad = pfad;
    this.#db = new DatabaseSync(pfad);
    // Fremdschlüssel sind in SQLite je Verbindung aus — ohne sie löscht
    // `kontoLoeschen` die Sitzungen und Partien NICHT mit.
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS konten (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_klein TEXT NOT NULL UNIQUE,
        passwort_hash TEXT NOT NULL,
        elo INTEGER NOT NULL DEFAULT 1000,
        partien INTEGER NOT NULL DEFAULT 0,
        siege INTEGER NOT NULL DEFAULT 0,
        niederlagen INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        tode INTEGER NOT NULL DEFAULT 0,
        schaden INTEGER NOT NULL DEFAULT 0,
        schuesse INTEGER NOT NULL DEFAULT 0,
        treffer INTEGER NOT NULL DEFAULT 0,
        beste_schuesse INTEGER NOT NULL DEFAULT 0,
        angelegt_am INTEGER NOT NULL,
        zuletzt_am INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sitzungen (
        token_hash TEXT PRIMARY KEY,
        konto_id TEXT NOT NULL REFERENCES konten(id) ON DELETE CASCADE,
        angelegt_am INTEGER NOT NULL,
        laeuft_ab INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sitzungen_konto ON sitzungen(konto_id);
      CREATE TABLE IF NOT EXISTS partien (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        konto_id TEXT NOT NULL REFERENCES konten(id) ON DELETE CASCADE,
        lobby_id TEXT,
        zeit INTEGER NOT NULL,
        modus TEXT NOT NULL,
        teilnehmer INTEGER NOT NULL,
        ergebnis TEXT NOT NULL,
        elo_vorher INTEGER NOT NULL,
        elo_nachher INTEGER NOT NULL,
        schuesse INTEGER NOT NULL DEFAULT 0,
        treffer INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        tode INTEGER NOT NULL DEFAULT 0,
        schaden INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS partien_konto ON partien(konto_id);
      CREATE TABLE IF NOT EXISTS meta (
        schluessel TEXT PRIMARY KEY,
        wert TEXT NOT NULL
      );
    `);
    this.#db.prepare('INSERT OR IGNORE INTO meta(schluessel, wert) VALUES (?, ?)')
      .run('version', String(KONTO_SPEICHER_VERSION));
  }

  get art() { return this.#art; }

  /** Öffnet die Datei erneut — nur für den Neustart-Test. */
  schliessen() {
    this.#db?.close();
    this.#db = null;
  }

  kontoAnlegen({ id, name, nameKlein, passwortHash, jetzt }) {
    try {
      this.#db.prepare(`
        INSERT INTO konten (id, name, name_klein, passwort_hash, angelegt_am, zuletzt_am)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, nameKlein, passwortHash, jetzt, jetzt);
    } catch (fehler) {
      // UNIQUE-Verstoß: Der Name ist vergeben. Jeder andere Fehler ist echt.
      if (String(fehler?.message ?? '').includes('UNIQUE')) return null;
      throw fehler;
    }
    return this.kontoNachId(id);
  }

  kontoNachNameKlein(nameKlein) {
    return kontoAusZeile(this.#db.prepare('SELECT * FROM konten WHERE name_klein = ?').get(nameKlein));
  }

  kontoNachId(id) {
    return kontoAusZeile(this.#db.prepare('SELECT * FROM konten WHERE id = ?').get(id));
  }

  /** Schreibt geänderte Kontofelder. Gibt das neue Konto zurück. */
  kontoAktualisieren(id, felder = {}) {
    const erlaubt = Object.keys(felder).filter(schluessel => KONTO_ZAHLEN.includes(schluessel));
    if (erlaubt.length > 0) {
      const setzung = erlaubt.map(schluessel => `${schluessel} = ?`).join(', ');
      const werte = erlaubt.map(schluessel => Number(felder[schluessel]) || 0);
      if (felder.zuletztAm !== undefined) {
        this.#db.prepare(`UPDATE konten SET ${setzung}, zuletzt_am = ? WHERE id = ?`)
          .run(...werte, Number(felder.zuletztAm), id);
      } else {
        this.#db.prepare(`UPDATE konten SET ${setzung} WHERE id = ?`).run(...werte, id);
      }
    }
    return this.kontoNachId(id);
  }

  /** Löscht Konto, Sitzungen und Partien (Kaskade). Gibt true zurück, wenn es das Konto gab. */
  kontoLoeschen(id) {
    const ergebnis = this.#db.prepare('DELETE FROM konten WHERE id = ?').run(id);
    return Number(ergebnis.changes) > 0;
  }

  sitzungAnlegen({ tokenHash, kontoId, angelegtAm, laeuftAb }) {
    this.#db.prepare(`
      INSERT OR REPLACE INTO sitzungen (token_hash, konto_id, angelegt_am, laeuft_ab)
      VALUES (?, ?, ?, ?)
    `).run(tokenHash, kontoId, angelegtAm, laeuftAb);
  }

  sitzungFinden(tokenHash) {
    const zeile = this.#db.prepare('SELECT * FROM sitzungen WHERE token_hash = ?').get(tokenHash);
    if (!zeile) return null;
    return { tokenHash: zeile.token_hash, kontoId: zeile.konto_id, angelegtAm: Number(zeile.angelegt_am), laeuftAb: Number(zeile.laeuft_ab) };
  }

  sitzungLoeschen(tokenHash) {
    return Number(this.#db.prepare('DELETE FROM sitzungen WHERE token_hash = ?').run(tokenHash).changes) > 0;
  }

  /** Alle Sitzungen eines Kontos entwerten (Passwort-Reset, Kontolöschung). */
  sitzungenVonKontoLoeschen(kontoId) {
    return Number(this.#db.prepare('DELETE FROM sitzungen WHERE konto_id = ?').run(kontoId).changes);
  }

  /** Entfernt abgelaufene Sitzungen; gibt deren Anzahl zurück. */
  sitzungenAufraeumen(jetzt) {
    return Number(this.#db.prepare('DELETE FROM sitzungen WHERE laeuft_ab <= ?').run(jetzt).changes);
  }

  /** Alle Konten, für die Rangliste (klein gehalten: nur die Ranglistenspalten). */
  kontenAlle() {
    return this.#db.prepare('SELECT * FROM konten ORDER BY elo DESC, siege DESC, name ASC').all().map(kontoAusZeile);
  }

  partieEintragen(eintrag) {
    this.#db.prepare(`
      INSERT INTO partien (konto_id, lobby_id, zeit, modus, teilnehmer, ergebnis,
        elo_vorher, elo_nachher, schuesse, treffer, kills, tode, schaden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eintrag.kontoId, eintrag.lobbyId ?? null, eintrag.zeit, eintrag.modus, eintrag.teilnehmer,
      eintrag.ergebnis, eintrag.eloVorher, eintrag.eloNachher,
      eintrag.schuesse ?? 0, eintrag.treffer ?? 0, eintrag.kills ?? 0, eintrag.tode ?? 0, eintrag.schaden ?? 0,
    );
  }

  /** Partien eines Kontos (neueste zuerst) — für Nachweise und Verwaltung. */
  partienVon(kontoId, grenze = 50) {
    return this.#db.prepare('SELECT * FROM partien WHERE konto_id = ? ORDER BY zeit DESC LIMIT ?')
      .all(kontoId, grenze);
  }

  /** Setzt einen neuen Passworthash (Admin-Reset). */
  passwortSetzen(id, passwortHash) {
    return Number(this.#db.prepare('UPDATE konten SET passwort_hash = ? WHERE id = ?').run(passwortHash, id).changes) > 0;
  }
}

/**
 * JSON-Zweig (Rückfall ohne `node:sqlite`).
 *
 * Gleiche Methoden wie der SQLite-Zweig, damit die Dienste nichts davon wissen
 * müssen. Geschrieben wird atomar (temp + rename) unter einer Sperrdatei; die
 * Sperre verhindert, dass zwei Prozesse einander die Datei überschreiben.
 */
export class JsonSpeicher {
  #datei;
  #art = 'json';
  #daten;
  #sperrPfad;

  constructor({ pfad }) {
    this.pfad = pfad;
    this.#datei = pfad;
    this.#sperrPfad = `${pfad}.lock`;
    mkdirSync(dirname(pfad), { recursive: true, mode: 0o700 });
    this.#daten = this.#lesen();
  }

  get art() { return this.#art; }

  schliessen() {
    this.#daten = null;
  }

  #leer() {
    return { version: KONTO_SPEICHER_VERSION, konten: [], sitzungen: [], partien: [] };
  }

  #lesen() {
    if (!existsSync(this.#datei)) return this.#leer();
    try {
      const gelesen = JSON.parse(readFileSync(this.#datei, 'utf8'));
      if (!gelesen || gelesen.version !== KONTO_SPEICHER_VERSION) return this.#leer();
      return { ...this.#leer(), ...gelesen };
    } catch {
      // Beschädigte Datei: nicht abstürzen, aber auch nicht stillschweigend
      // weiterschreiben — der Aufrufer sieht an der leeren Liste, dass nichts da ist.
      return this.#leer();
    }
  }

  /** Führt eine Änderung unter Sperre aus und schreibt atomar zurück. */
  #aendern(aenderung) {
    const sperre = this.#sperre();
    try {
      const ergebnis = aenderung(this.#daten);
      this.#schreiben();
      return ergebnis;
    } finally {
      this.#entsperren(sperre);
    }
  }

  #sperre() {
    const ende = Date.now() + 2000;
    for (;;) {
      try {
        const fd = openSync(this.#sperrPfad, 'wx', 0o600);
        writeSync(fd, String(process.pid));
        closeSync(fd);
        return true;
      } catch (fehler) {
        if (fehler?.code !== 'EEXIST') throw fehler;
        // Alte Sperre (Prozess abgestürzt): nach 10 s als verwaist behandeln.
        try {
          if (Date.now() - statSync(this.#sperrPfad).mtimeMs > 10_000) unlinkSync(this.#sperrPfad);
        } catch { /* gleich noch einmal versuchen */ }
        if (Date.now() > ende) throw new Error('Kontospeicher ist gesperrt (Sperrdatei bleibt)');
        // Warten ohne `await`: Der Speicher ist synchron, die Wartezeit ist kurz.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
  }

  #entsperren() {
    try { unlinkSync(this.#sperrPfad); } catch { /* schon weg */ }
  }

  #schreiben() {
    const temp = `${this.#datei}.${randomUUID().slice(0, 8)}.tmp`;
    writeFileSync(temp, JSON.stringify(this.#daten), { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, this.#datei);
  }

  kontoAnlegen({ id, name, nameKlein, passwortHash, jetzt }) {
    if (this.#daten.konten.some(konto => konto.name_klein === nameKlein)) return null;
    const konto = leeresKonto({ id, name, nameKlein, passwortHash, jetzt });
    this.#daten.konten.push(konto);
    this.#schreiben();
    return kontoAusZeile(konto);
  }

  kontoNachNameKlein(nameKlein) {
    return kontoAusZeile(this.#daten.konten.find(konto => konto.name_klein === nameKlein));
  }

  kontoNachId(id) {
    return kontoAusZeile(this.#daten.konten.find(konto => konto.id === id));
  }

  kontoAktualisieren(id, felder = {}) {
    const konto = this.#daten.konten.find(eintrag => eintrag.id === id);
    if (!konto) return null;
    for (const schluessel of KONTO_ZAHLEN) {
      if (felder[schluessel] !== undefined) konto[schluessel] = Number(felder[schluessel]) || 0;
    }
    if (felder.zuletztAm !== undefined) konto.zuletzt_am = Number(felder.zuletztAm) || konto.zuletzt_am;
    this.#schreiben();
    return kontoAusZeile(konto);
  }

  kontoLoeschen(id) {
    const vorher = this.#daten.konten.length;
    this.#daten.konten = this.#daten.konten.filter(konto => konto.id !== id);
    this.#daten.sitzungen = this.#daten.sitzungen.filter(sitzung => sitzung.konto_id !== id);
    this.#daten.partien = this.#daten.partien.filter(partie => partie.konto_id !== id);
    this.#schreiben();
    return this.#daten.konten.length < vorher;
  }

  sitzungAnlegen({ tokenHash, kontoId, angelegtAm, laeuftAb }) {
    this.#daten.sitzungen = this.#daten.sitzungen.filter(sitzung => sitzung.token_hash !== tokenHash);
    this.#daten.sitzungen.push({ token_hash: tokenHash, konto_id: kontoId, angelegt_am: angelegtAm, laeuft_ab: laeuftAb });
    this.#schreiben();
  }

  sitzungFinden(tokenHash) {
    const zeile = this.#daten.sitzungen.find(sitzung => sitzung.token_hash === tokenHash);
    if (!zeile) return null;
    return { tokenHash: zeile.token_hash, kontoId: zeile.konto_id, angelegtAm: zeile.angelegt_am, laeuftAb: zeile.laeuft_ab };
  }

  sitzungLoeschen(tokenHash) {
    const vorher = this.#daten.sitzungen.length;
    this.#daten.sitzungen = this.#daten.sitzungen.filter(sitzung => sitzung.token_hash !== tokenHash);
    this.#schreiben();
    return this.#daten.sitzungen.length < vorher;
  }

  sitzungenVonKontoLoeschen(kontoId) {
    const vorher = this.#daten.sitzungen.length;
    this.#daten.sitzungen = this.#daten.sitzungen.filter(sitzung => sitzung.konto_id !== kontoId);
    this.#schreiben();
    return vorher - this.#daten.sitzungen.length;
  }

  sitzungenAufraeumen(jetzt) {
    const vorher = this.#daten.sitzungen.length;
    this.#daten.sitzungen = this.#daten.sitzungen.filter(sitzung => sitzung.laeuft_ab > jetzt);
    this.#schreiben();
    return vorher - this.#daten.sitzungen.length;
  }

  kontenAlle() {
    return this.#daten.konten.map(kontoAusZeile);
  }

  partieEintragen(eintrag) {
    this.#daten.partien.push({ ...eintrag, id: this.#daten.partien.length + 1 });
    this.#schreiben();
  }

  partienVon(kontoId, grenze = 50) {
    return this.#daten.partien
      .filter(partie => partie.konto_id === kontoId)
      .sort((a, b) => b.zeit - a.zeit)
      .slice(0, grenze);
  }

  passwortSetzen(id, passwortHash) {
    const konto = this.#daten.konten.find(eintrag => eintrag.id === id);
    if (!konto) return false;
    konto.passwort_hash = passwortHash;
    this.#schreiben();
    return true;
  }

  /** Nur für Tests: Zugriff auf die Rohdaten. */
  get roh() { return this.#daten; }
}

export default { oeffneSpeicher, sqliteVerfuegbar, SqliteSpeicher, JsonSpeicher };
