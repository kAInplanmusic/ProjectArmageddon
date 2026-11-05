/**
 * Konten: Registrierung, Anmeldung, Sitzungen, Löschung — und die Bremse gegen
 * Durchprobieren.
 *
 * ## Anmeldung ohne E-Mail
 *
 * Nur **Benutzername + Passwort**. Es gibt bewusst kein E-Mail-Feld: Ohne
 * E-Mail gibt es auch keine Selbst-Wiederherstellung. Wer sein Passwort
 * vergisst, wendet sich an den Betrieb; `scripts/betrieb/passwort-zuruecksetzen.mjs`
 * setzt es auf dem Server neu (siehe `docs/konto-und-bestenliste.md`).
 *
 * ## Passwörter
 *
 * scrypt mit 16 Byte Salz je Konto (`N=16384, r=8, p=1`), 64 Byte Ausgabe.
 * Gespeichert wird `scrypt$N$r$p$salz$hash` (hex). Verglichen wird mit
 * `timingSafeEqual`. Das Klartext-Passwort verlässt diese Datei nie — es wird
 * weder protokolliert noch in einer Antwort zurückgegeben.
 *
 * ## Sitzungstoken
 *
 * 32 Byte Zufall (base64url), 30 Tage gültig. Gespeichert wird nur sein
 * SHA-256-Hash: Wer die Datenbank liest, kann damit keine Sitzung übernehmen.
 * Der Token selbst geht einmal an den Client (Antwort auf Registrieren/Anmelden).
 *
 * Warum Token und kein httpOnly-Cookie: Der Client läuft im Entwicklungsbetrieb
 * von einem anderen Origin (Vite auf 5173, Server auf 3000). Ein Cookie müsste
 * dort `SameSite=None; Secure` tragen, was ohne TLS nicht funktioniert; und der
 * WebSocket-Handshake eines Browsers kann keine eigenen Kopfzeilen setzen.
 * Der Token reist deshalb als `Authorization: Bearer` (HTTP) und als
 * `?sitzung=` am WebSocket-Upgrade. Der Preis ist, dass JavaScript im Client
 * den Token lesen kann — er liegt nur im `sessionStorage` dieses Tabs, nicht im
 * `localStorage`, und die Anwendung lädt kein Fremdskript. Ein Cookie hätte
 * dafür CSRF-Flächen geöffnet; hier gibt es keine, weil kein Cookie mitreist.
 *
 * ## Bremse
 *
 * Gezählt werden Versuche je NAME und je IP in einem gleitenden Fenster. Der
 * Zähler lebt im Prozess: Nach einem Neustart ist er leer. Das ist bewusst —
 * eine persistente Bremse wäre ein zweiter Schreibpfad für ein Problem, das
 * nur Sekunden überbrücken muss; die Grundlast trägt der umgekehrte Proxy.
 *
 * @module konto
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { neueKontoId } from './bestenliste.js';

const scryptAsync = promisify(scrypt);

/** scrypt-Kosten. Bewusst benannt: Wer sie ändert, ändert das gespeicherte Format mit. */
export const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64, salzBytes: 16 });

/** Gültigkeitsdauer eines Sitzungstokens. */
export const SITZUNGSDAUER_MS = 30 * 24 * 60 * 60 * 1000;

/** Grenzen der Eingaben. */
export const NAME_MIN = 3;
export const NAME_MAX = 20;
export const PASSWORT_MIN = 8;
export const PASSWORT_MAX = 200;

/** Erlaubte Zeichen im Namen: Buchstaben (auch Umlaute), Ziffern, Leerzeichen, `_`, `-`. */
const NAME_MUSTER = /^[\p{L}\p{N}_\- ]+$/u;

/**
 * Passwort hashen.
 *
 * @param {string} passwort
 * @returns {Promise<string>} `scrypt$N$r$p$salzHex$hashHex`
 */
export async function hashePasswort(passwort) {
  const salz = randomBytes(SCRYPT.salzBytes);
  const hash = await scryptAsync(passwort, salz, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 96 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salz.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Prüft ein Passwort gegen einen gespeicherten Hash.
 *
 * @param {string} passwort
 * @param {string} gespeichert
 * @returns {Promise<boolean>}
 */
export async function pruefePasswort(passwort, gespeichert) {
  if (typeof passwort !== 'string' || typeof gespeichert !== 'string') return false;
  const teile = gespeichert.split('$');
  if (teile.length !== 6 || teile[0] !== 'scrypt') return false;
  const [, n, r, p, salzHex, hashHex] = teile;
  let salz;
  let erwartet;
  try {
    salz = Buffer.from(salzHex, 'hex');
    erwartet = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salz.length === 0 || erwartet.length === 0) return false;
  const hash = await scryptAsync(passwort, salz, erwartet.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 96 * 1024 * 1024,
  });
  if (hash.length !== erwartet.length) return false;
  return timingSafeEqual(hash, erwartet);
}

/** SHA-256 in hex — für Sitzungstoken (kein Geheimnis mehr nach dem Hashing). */
export function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Name auf die Vergleichsform bringen: Unicode-NFC, kleingeschrieben. */
export function nameSchluessel(name) {
  return String(name).normalize('NFC').trim().toLowerCase();
}

/** Prüft einen Benutzernamen. Gibt `null` (gültig) oder einen Grund zurück. */
export function pruefeName(name) {
  if (typeof name !== 'string') return 'Name muss eine Zeichenkette sein';
  const sauber = name.normalize('NFC').trim();
  if (sauber.length < NAME_MIN) return `Name muss mindestens ${NAME_MIN} Zeichen haben`;
  if (sauber.length > NAME_MAX) return `Name darf höchstens ${NAME_MAX} Zeichen haben`;
  if (!NAME_MUSTER.test(sauber)) return 'Name darf nur Buchstaben, Ziffern, Leerzeichen, _ und - enthalten';
  if (!/[\p{L}\p{N}]/u.test(sauber)) return 'Name muss mindestens einen Buchstaben oder eine Ziffer enthalten';
  return null;
}

/** Prüft ein Passwort. Gibt `null` (gültig) oder einen Grund zurück. */
export function pruefePasswortform(passwort) {
  if (typeof passwort !== 'string') return 'Passwort muss eine Zeichenkette sein';
  if (passwort.length < PASSWORT_MIN) return `Passwort muss mindestens ${PASSWORT_MIN} Zeichen haben`;
  if (passwort.length > PASSWORT_MAX) return `Passwort darf höchstens ${PASSWORT_MAX} Zeichen haben`;
  return null;
}

/**
 * Gleitendes Fenster je Schlüssel.
 *
 * `erlaube` zählt JEDEN Versuch (auch den erfolgreichen), damit ein Angreifer
 * nicht zwischen Treffern weiterprobieren kann. Nach einer erfolgreichen
 * Anmeldung wird der Namenszähler geleert — der rechtmäßige Besitzer soll nicht
 * wegen fremder Fehlversuche ausgesperrt bleiben.
 */
export class Bremse {
  #eintraege = new Map();

  /**
   * @param {object} [grenzen]
   * @param {number} [grenzen.name=10] - Versuche je Name im Fenster
   * @param {number} [grenzen.ip=40] - Versuche je IP im Fenster
   * @param {number} [grenzen.registrierung=20] - neue Konten je IP im Fenster
   * @param {number} [grenzen.fensterMs=900000] - 15 Minuten
   * @param {() => number} [grenzen.jetzt]
   */
  constructor({ name = 10, ip = 40, registrierung = 20, fensterMs = 15 * 60_000, jetzt = () => Date.now() } = {}) {
    this.grenzen = { name, ip, registrierung, fensterMs };
    this.jetzt = jetzt;
  }

  #liste(schluessel) {
    const jetzt = this.jetzt();
    const alt = this.#eintraege.get(schluessel) ?? [];
    const frisch = alt.filter(zeit => jetzt - zeit < this.grenzen.fensterMs);
    if (frisch.length === 0) this.#eintraege.delete(schluessel);
    else this.#eintraege.set(schluessel, frisch);
    return frisch;
  }

  /** Darf dieser Versuch stattfinden? Zählt ihn bei Ja. */
  erlaube(nameSchluesselWert, ip) {
    const nameListe = this.#liste(`n:${nameSchluesselWert}`);
    const ipListe = this.#liste(`i:${ip ?? '?'}`);
    if (nameListe.length >= this.grenzen.name || ipListe.length >= this.grenzen.ip) return false;
    const jetzt = this.jetzt();
    nameListe.push(jetzt);
    ipListe.push(jetzt);
    this.#eintraege.set(`n:${nameSchluesselWert}`, nameListe);
    this.#eintraege.set(`i:${ip ?? '?'}`, ipListe);
    // Der Verlauf wächst nur mit der Zahl erfolgter Versuche; ein Aufräumen bei
    // jedem Aufruf wäre teurer als die Karte selbst. Bei vielen Namen greift
    // dennoch eine Obergrenze, damit ein Namens-Scanner den Speicher nicht füllt.
    if (this.#eintraege.size > 20_000) this.#aufraeumen();
    return true;
  }

  /** Darf diese Registrierung stattfinden? Eigenes Kontingent je IP. */
  erlaubeRegistrierung(ip) {
    const schluessel = `r:${ip ?? '?'}`;
    const liste = this.#liste(schluessel);
    if (liste.length >= this.grenzen.registrierung) return false;
    liste.push(this.jetzt());
    this.#eintraege.set(schluessel, liste);
    return true;
  }

  /** Leert den Zähler eines Namens (nach erfolgreicher Anmeldung). */
  entlaste(nameSchluesselWert) {
    this.#eintraege.delete(`n:${nameSchluesselWert}`);
  }

  #aufraeumen() {
    for (const schluessel of [...this.#eintraege.keys()]) {
      if (this.#liste(schluessel).length === 0) this.#eintraege.delete(schluessel);
    }
  }
}

/** Fertige Ablehnung für den HTTP-Pfad. */
function ablehnung(status, fehler, code) {
  return { ok: false, status, fehler, code };
}

/**
 * Der Kontodienst: alles, was ein Konto braucht, ohne Wissen über HTTP.
 *
 * @param {object} optionen
 * @param {object} optionen.speicher - `KontoSpeicher` (SQLite oder JSON)
 * @param {object} [optionen.logger]
 * @param {() => number} [optionen.jetzt]
 * @param {number} [optionen.sitzungsdauerMs]
 * @param {Bremse} [optionen.bremse]
 */
export class KontoDienst {
  constructor({ speicher, logger = null, jetzt = () => Date.now(), sitzungsdauerMs = SITZUNGSDAUER_MS, bremse = null } = {}) {
    if (!speicher) throw new Error('KontoDienst braucht einen Speicher');
    this.speicher = speicher;
    this.logger = logger;
    this.jetzt = jetzt;
    this.sitzungsdauerMs = sitzungsdauerMs;
    this.bremse = bremse ?? new Bremse({ jetzt });
  }

  /**
   * Legt ein Konto an und meldet es sofort an.
   *
   * @returns {Promise<object>} `{ok:true, konto, token, laeuftAb}` oder Ablehnung
   */
  async registrieren({ name, passwort, ip = null } = {}) {
    const nameFehler = pruefeName(name);
    if (nameFehler) return ablehnung(400, nameFehler, 'name_ungueltig');
    const passwortFehler = pruefePasswortform(passwort);
    if (passwortFehler) return ablehnung(400, passwortFehler, 'passwort_ungueltig');

    const sauber = name.normalize('NFC').trim();
    const klein = nameSchluessel(sauber);
    if (!this.bremse.erlaubeRegistrierung(ip)) return this.#zuVieleVersuche(klein, ip);

    // Vorab prüfen: Ein UNIQUE-Fehler beim Schreiben ist derselbe Fall, aber
    // hier lässt sich die Antwort ohne Ausnahme bauen.
    if (this.speicher.kontoNachNameKlein(klein)) return ablehnung(409, 'Dieser Name ist schon vergeben', 'name_vergeben');

    const passwortHash = await hashePasswort(passwort);
    const konto = this.speicher.kontoAnlegen({
      id: neueKontoId(), name: sauber, nameKlein: klein, passwortHash, jetzt: this.jetzt(),
    });
    if (!konto) return ablehnung(409, 'Dieser Name ist schon vergeben', 'name_vergeben');

    this.logger?.info('konto_angelegt', 'Konto angelegt', { kontoId: konto.id, name: konto.name });
    return this.#sitzungAusstellen(konto);
  }

  /**
   * Meldet ein Konto an.
   *
   * Falscher Name und falsches Passwort ergeben dieselbe Antwort (kein
   * Auskunftsdienst darüber, welche Namen existieren). Beides wird gebremst.
   */
  async anmelden({ name, passwort, ip = null } = {}) {
    if (typeof name !== 'string' || name.trim() === '') return ablehnung(400, 'Name fehlt', 'name_ungueltig');
    if (typeof passwort !== 'string' || passwort === '') return ablehnung(400, 'Passwort fehlt', 'passwort_ungueltig');
    const klein = nameSchluessel(name);
    if (!this.bremse.erlaube(klein, ip)) return this.#zuVieleVersuche(klein, ip);

    const konto = this.speicher.kontoNachNameKlein(klein);
    // Auch bei unbekanntem Namen wird gerechnet: Die Antwortzeit soll nicht
    // verraten, ob es den Namen gibt.
    const gespeichert = konto?.passwortHash ?? 'scrypt$16384$8$1$00$00';
    const richtig = await pruefePasswort(passwort, gespeichert);
    if (!konto || !richtig) {
      this.logger?.warn('konto_anmeldung_fehlgeschlagen', 'Anmeldung fehlgeschlagen', { name: klein });
      return ablehnung(401, 'Name oder Passwort ist falsch', 'zugangsdaten_falsch');
    }
    this.bremse.entlaste(klein);
    return this.#sitzungAusstellen(konto);
  }

  /** Meldet eine Sitzung ab. Unbekannte Token sind kein Fehler. */
  abmelden(token) {
    if (typeof token !== 'string' || token.length === 0) return { ok: true };
    this.speicher.sitzungLoeschen(tokenHash(token));
    return { ok: true };
  }

  /**
   * Löscht das Konto samt Daten.
   *
   * Das Passwort wird erneut verlangt: Ein gestohlener Token allein darf kein
   * Konto vernichten.
   */
  async loeschen({ token, passwort } = {}) {
    const konto = this.kontoFuerToken(token);
    if (!konto) return ablehnung(401, 'Nicht angemeldet', 'nicht_angemeldet');
    if (typeof passwort !== 'string' || passwort === '') {
      return ablehnung(400, 'Zum Löschen wird das Passwort benötigt', 'passwort_fehlt');
    }
    if (!(await pruefePasswort(passwort, konto.passwortHash))) {
      return ablehnung(403, 'Passwort ist falsch', 'passwort_falsch');
    }
    this.speicher.kontoLoeschen(konto.id);
    this.logger?.info('konto_geloescht', 'Konto samt Daten gelöscht', { kontoId: konto.id });
    return { ok: true, geloescht: true };
  }

  /**
   * Konto zu einem Sitzungstoken — oder `null`.
   *
   * Abgelaufene Sitzungen werden dabei entfernt; sie sind danach auch in der
   * Datenbank weg, nicht nur „ungültig".
   */
  kontoFuerToken(token) {
    if (typeof token !== 'string' || token.length === 0) return null;
    const hash = tokenHash(token);
    const sitzung = this.speicher.sitzungFinden(hash);
    if (!sitzung) return null;
    if (sitzung.laeuftAb <= this.jetzt()) {
      this.speicher.sitzungLoeschen(hash);
      return null;
    }
    return this.speicher.kontoNachId(sitzung.kontoId);
  }

  /** Liest den Token aus `Authorization: Bearer …`. */
  static tokenAusKopfzeilen(headers = {}) {
    const wert = headers.authorization ?? headers.Authorization;
    if (typeof wert !== 'string') return null;
    const treffer = wert.match(/^Bearer\s+(\S+)$/i);
    return treffer ? treffer[1] : null;
  }

  /** Stellt ein neues Sitzungstoken aus. Der Token steht nur in der Antwort. */
  #sitzungAusstellen(konto) {
    const token = randomBytes(32).toString('base64url');
    const jetzt = this.jetzt();
    const laeuftAb = jetzt + this.sitzungsdauerMs;
    this.speicher.sitzungAnlegen({ tokenHash: tokenHash(token), kontoId: konto.id, angelegtAm: jetzt, laeuftAb });
    return {
      ok: true,
      konto: {
        id: konto.id,
        name: konto.name,
        elo: konto.elo,
        partien: konto.partien,
        siege: konto.siege,
        niederlagen: konto.niederlagen,
      },
      token,
      laeuftAb,
    };
  }

  #zuVieleVersuche(klein, ip) {
    this.logger?.warn('konto_rate_limit', 'Zu viele Anmeldeversuche — gebremst', { name: klein, ip });
    return ablehnung(429, 'Zu viele Versuche — bitte später erneut versuchen', 'zu_viele_versuche');
  }
}

export default { KontoDienst, Bremse, hashePasswort, pruefePasswort, pruefeName };
