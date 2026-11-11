/**
 * Nutzerdatenbank der Webseite (docs/zugang-www.md): Registrieren, Anmelden, Sitzung, Passwort ändern,
 * Sperre bei Fehlversuchen, Saat der festen Konten, Statistik. Nur gegen die Speicher-Schnittstelle
 * (`speicher.mjs`) — heute Netlify Blobs, in Tests ein Arbeitsspeicher.
 *
 * Wiederverwendet aus dem Spiel (`src/server/konto.js`): Namensregeln, Normalisierung, Passwortform, scrypt.
 *
 * ## Datensatz `nutzer/<id>` (Schema v1; Profil und Statistik sind vorbereitet, die Oberfläche folgt später)
 * ```
 * { v: 1, id, name, nameKlein, email, emailKlein, passwortHash, sv,   // sv = Sitzungsversion (Passwortwechsel macht alte Cookies ungültig)
 *   angelegt, geaendert,
 *   profil: { foto: null, bio: '', angepinnteEinheit: null },          // null = automatisch: Einheit mit dem meisten Schaden
 *   stat: { partien, siege, niederlagen, unentschieden, spruenge, schuesse, treffer, fehlschuesse, schaden, kills, tode, selbsttreffer,
 *           einheiten: { <einheitId>: { schaden, kills, einsaetze } },
 *           waffen:    { <waffenId>:  { schuesse, treffer, schaden } }, zuletzt } }
 * ```
 * Eindeutigkeit: `namen/<sha256(nameKlein)>` und `emails/<sha256(emailKlein)>` -> `{ id }`, per `neu()` atomar.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { nameSchluessel, pruefeName, pruefePasswortform, PASSWORT_MAX } from '../../../src/server/konto.js';
import { hasheNutzerPasswort, pruefeGeheimnis } from './hash.mjs';
import { schluesselHash } from './speicher.mjs';

export const SITZUNG_SEKUNDEN = 7 * 24 * 3600;
export const COOKIE = 'pa_web';
export const SPERRE = { name: 5, ip: 20, fensterMs: 15 * 60_000 };
const EMAIL_MUSTER = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/u;

export const emailSchluessel = email => String(email).normalize('NFC').trim().toLowerCase();
export const pruefeEmail = email => (typeof email !== 'string' ? 'E-Mail fehlt'
  : email.trim().length > 254 || !EMAIL_MUSTER.test(email.trim()) ? 'Bitte eine gültige E-Mail-Adresse angeben' : null);

export const leereStatistik = () => ({
  partien: 0, siege: 0, niederlagen: 0, unentschieden: 0, spruenge: 0, schuesse: 0, treffer: 0, fehlschuesse: 0,
  schaden: 0, kills: 0, tode: 0, selbsttreffer: 0, einheiten: {}, waffen: {}, zuletzt: null,
});

/** Öffentliche Sicht (nie Hash, nie Sitzungsversion). */
export const nutzerOeffentlich = n => ({ id: n.id, name: n.name, email: n.email, profil: n.profil, stat: n.stat });

/** Die Einheit mit dem meisten Schaden über alle Spiele (Vorgabe der angepinnten Einheit), oder `null`. */
export function meisterSchadenEinheit(stat) {
  let beste = null; let max = 0;
  for (const [id, e] of Object.entries(stat?.einheiten ?? {})) if ((e?.schaden ?? 0) > max) { max = e.schaden; beste = id; }
  return beste;
}

// ---------------------------------------------------------------- Sitzungs-Cookie --
const mac = (geheimnis, text) => createHmac('sha256', geheimnis).update(text).digest('base64url');
const gleich = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** `v2.<nutzerId>.<sv>.<bis>.<mac>` — signiert, ohne Zustand auf dem Server; `sv` bindet das Cookie an den Passwortstand. */
export function neueSitzung(geheimnis, nutzerId, sv, jetztMs) {
  const nutz = `v2.${nutzerId}.${sv}.${Math.floor(jetztMs / 1000) + SITZUNG_SEKUNDEN}`;
  return `${nutz}.${mac(geheimnis, nutz)}`;
}
/** Liest ein Cookie: `{ nutzerId, sv }` bei gültiger Signatur und Frist, sonst `null`. */
export function liesSitzung(wert, geheimnis, jetztMs) {
  const t = String(wert ?? '').split('.');
  if (t.length !== 5 || t[0] !== 'v2' || !/^[A-Za-z0-9-]{8,64}$/.test(t[1]) || !/^\d{1,9}$/.test(t[2]) || !/^\d{1,12}$/.test(t[3])) return null;
  if (!gleich(mac(geheimnis, t.slice(0, 4).join('.')), t[4]) || Number(t[3]) <= jetztMs / 1000) return null;
  return { nutzerId: t[1], sv: Number(t[2]) };
}
export const cookieSetzen = wert => `${COOKIE}=${wert}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SITZUNG_SEKUNDEN}`;
export const cookieLoeschen = `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
export const cookieAusKopf = kopf => new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_.-]+)`).exec(kopf ?? '')?.[1] ?? '';

// ---------------------------------------------------------------- Dienst ---------
const fehler = (status, code, text) => ({ ok: false, status, code, fehler: text });

export class NutzerDienst {
  /** @param {{speicher: object, jetzt?: () => number, sleep?: (ms:number)=>Promise<void>, logger?: Function}} o */
  constructor({ speicher, jetzt = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), logger = () => {} }) {
    this.s = speicher; this.jetzt = jetzt; this.sleep = sleep; this.log = logger;
  }

  // ---- Sperre (persistent, im Speicher der Nutzerdatenbank) ----
  async #sperrRecord(schluessel) { return this.s.lies('sperre', schluesselHash(schluessel)); }
  /** Ist der Schlüssel (z. B. `n:wodan`, `i:1.2.3.4`) gesperrt? */
  async gesperrt(schluessel, grenze) {
    const r = await this.#sperrRecord(schluessel);
    return Boolean(r && r.wert.n >= grenze && r.wert.start + SPERRE.fensterMs > this.jetzt());
  }
  /** Zählt einen Fehlversuch (mit Wiederholung bei gleichzeitigem Schreiben). */
  async fehlversuch(schluessel) {
    const key = schluesselHash(schluessel);
    for (let i = 0; i < 5; i++) {
      const t = this.jetzt(); const r = await this.s.lies('sperre', key);
      const frisch = !r || r.wert.start + SPERRE.fensterMs <= t;
      const neu = { n: frisch ? 1 : r.wert.n + 1, start: frisch ? t : r.wert.start };
      if (!r ? await this.s.neu('sperre', key, neu) : await this.s.ersetze('sperre', key, neu, r.etag)) return neu.n;
    }
    return 0;
  }
  async entlaste(schluessel) { await this.s.loesche('sperre', schluesselHash(schluessel)); }

  // ---- Anlegen ----
  /** Reserviert einen Eindeutigkeits-Eintrag; ein verwaister Eintrag (Nutzer fehlt) wird übernommen. */
  async #reserviere(bereich, key, id) {
    if (await this.s.neu(bereich, key, { id })) return true;
    const alt = await this.s.lies(bereich, key);
    if (!alt) return this.s.neu(bereich, key, { id });
    if (alt.wert.id === id) return true;
    if (await this.s.lies('nutzer', alt.wert.id)) return false;
    return this.s.ersetze(bereich, key, { id }, alt.etag);
  }

  /** Legt einen Nutzer mit fertigem Passworthash an. Gibt `{ ok, nutzer }` oder `{ ok:false, code }`. */
  async nutzerAnlegen({ name, email, passwortHash }) {
    const sauber = name.normalize('NFC').trim();
    const nameKlein = nameSchluessel(sauber); const emailKlein = emailSchluessel(email);
    const id = randomUUID(); const nk = schluesselHash(nameKlein); const ek = schluesselHash(emailKlein);
    if (!(await this.#reserviere('namen', nk, id))) return fehler(409, 'name_vergeben', 'Dieser Benutzername ist schon vergeben');
    if (!(await this.#reserviere('emails', ek, id))) {
      await this.s.loesche('namen', nk);
      return fehler(409, 'email_vergeben', 'Diese E-Mail-Adresse ist schon registriert');
    }
    const t = this.jetzt();
    const nutzer = {
      v: 1, id, name: sauber, nameKlein, email: email.trim(), emailKlein, passwortHash, sv: 1, angelegt: t, geaendert: t,
      profil: { foto: null, bio: '', angepinnteEinheit: null }, stat: leereStatistik(),
    };
    await this.s.setze('nutzer', id, nutzer);
    this.log('nutzer_angelegt', { id });
    return { ok: true, nutzer };
  }

  /**
   * Registrierung. `anmeldepasswortHash` ist PA_REGISTRIER_HASH. Falsches Anmeldepasswort zählt je Adresse als Fehlversuch.
   */
  async registrieren({ email, name, passwort, anmeldepasswort, ip, anmeldepasswortHash }) {
    if (!anmeldepasswortHash) return fehler(500, 'einrichtung', 'Einrichtung unvollständig: PA_REGISTRIER_HASH fehlt');
    if (await this.gesperrt(`r:${ip}`, 5)) return fehler(429, 'gesperrt', 'Zu viele Versuche. Bitte später erneut.');
    if (typeof anmeldepasswort !== 'string' || !(await pruefeGeheimnis(anmeldepasswort.slice(0, 200), anmeldepasswortHash))) {
      await this.fehlversuch(`r:${ip}`); await this.sleep(600);
      return fehler(403, 'anmeldepasswort_falsch', 'Das Anmeldepasswort ist falsch');
    }
    const f = pruefeEmail(email) ? ['email_ungueltig', pruefeEmail(email)] : pruefeName(name) ? ['name_ungueltig', pruefeName(name)]
      : pruefePasswortform(passwort) ? ['passwort_ungueltig', pruefePasswortform(passwort)] : null;
    if (f) return fehler(400, f[0], f[1]);
    const r = await this.nutzerAnlegen({ name, email, passwortHash: await hasheNutzerPasswort(passwort) });
    return r.ok ? { ok: true, nutzer: r.nutzer } : r;
  }

  /** Anmeldung mit Benutzername ODER E-Mail. Name und Adresse sind einzeln und je IP gesperrt. */
  async anmelden({ kennung, passwort, ip }) {
    if (typeof kennung !== 'string' || !kennung.trim() || typeof passwort !== 'string' || !passwort) return fehler(400, 'angaben_fehlen', 'Benutzername oder E-Mail und Passwort angeben');
    const klein = kennung.includes('@') ? emailSchluessel(kennung) : nameSchluessel(kennung);
    const nKey = `n:${klein.slice(0, 254)}`; const iKey = `i:${ip}`;
    if ((await this.gesperrt(nKey, SPERRE.name)) || (await this.gesperrt(iKey, SPERRE.ip))) return fehler(429, 'gesperrt', 'Zu viele Versuche. Bitte in 15 Minuten erneut.');
    const idEintrag = await this.s.lies(kennung.includes('@') ? 'emails' : 'namen', schluesselHash(klein));
    const nutzer = idEintrag ? (await this.s.lies('nutzer', idEintrag.wert.id))?.wert : null;
    // Auch bei unbekannter Kennung wird gerechnet (Antwortzeit verrät nichts).
    const ok = await pruefeGeheimnis(passwort.slice(0, PASSWORT_MAX), nutzer?.passwortHash ?? 'scrypt$16384$8$1$00$00');
    if (!nutzer || !ok) {
      await this.fehlversuch(nKey); await this.fehlversuch(iKey); await this.sleep(400);
      return fehler(401, 'zugangsdaten_falsch', 'Benutzername/E-Mail oder Passwort ist falsch');
    }
    await this.entlaste(nKey);
    return { ok: true, nutzer };
  }

  async nutzerNachId(id) { return (await this.s.lies('nutzer', String(id)))?.wert ?? null; }

  /** Nutzer zu einem Cookie (Signatur, Frist, Sitzungsversion). */
  async nutzerAusSitzung(cookie, geheimnis) {
    const s = liesSitzung(cookie, geheimnis, this.jetzt());
    if (!s) return null;
    const n = await this.nutzerNachId(s.nutzerId);
    return n && n.sv === s.sv ? n : null;
  }

  /** Passwort ändern: altes Passwort nötig; macht alle alten Cookies ungültig (sv + 1). */
  async passwortAendern({ nutzer, altes, neues }) {
    if (await this.gesperrt(`p:${nutzer.id}`, SPERRE.name)) return fehler(429, 'gesperrt', 'Zu viele Versuche. Bitte in 15 Minuten erneut.');
    if (typeof altes !== 'string' || !(await pruefeGeheimnis(altes.slice(0, PASSWORT_MAX), nutzer.passwortHash))) {
      await this.fehlversuch(`p:${nutzer.id}`); await this.sleep(400);
      return fehler(403, 'passwort_falsch', 'Das alte Passwort ist falsch');
    }
    const f = pruefePasswortform(neues);
    if (f) return fehler(400, 'passwort_ungueltig', f);
    if (neues === altes) return fehler(400, 'passwort_gleich', 'Das neue Passwort muss sich vom alten unterscheiden');
    const hash = await hasheNutzerPasswort(neues);
    for (let i = 0; i < 5; i++) {
      const r = await this.s.lies('nutzer', nutzer.id);
      if (!r) break;
      const neu = { ...r.wert, passwortHash: hash, sv: r.wert.sv + 1, geaendert: this.jetzt() };
      if (await this.s.ersetze('nutzer', nutzer.id, neu, r.etag)) { await this.entlaste(`p:${nutzer.id}`); return { ok: true, nutzer: neu }; }
    }
    return fehler(409, 'konflikt', 'Gleichzeitige Änderung, bitte erneut versuchen');
  }

  // ---- Saat ----
  /**
   * Legt die festen Konten aus `PA_KONTEN_SAAT` an (JSON-Liste `[{name, email, hash}]`, nur Hashes). Idempotent:
   * bestehende Namen oder Adressen werden nicht verändert (ein später geändertes Passwort bleibt).
   * Gibt eine Zusammenfassung (ohne Hashes) zurück.
   */
  async saat(roh) {
    const ergebnis = { angelegt: 0, vorhanden: 0, fehlerhaft: 0 };
    if (!roh) return ergebnis;
    let liste;
    try { liste = JSON.parse(roh); } catch { liste = null; }
    if (!Array.isArray(liste)) return { ...ergebnis, fehlerhaft: 1 };
    for (const e of liste) {
      if (typeof e?.name !== 'string' || typeof e?.email !== 'string' || !/^(scrypt|pbkdf2)\$/.test(String(e?.hash)) || pruefeName(e.name) || pruefeEmail(e.email)) { ergebnis.fehlerhaft++; continue; }
      const vorhanden = (await this.s.lies('namen', schluesselHash(nameSchluessel(e.name)))) || (await this.s.lies('emails', schluesselHash(emailSchluessel(e.email))));
      if (vorhanden) { ergebnis.vorhanden++; continue; }
      const r = await this.nutzerAnlegen({ name: e.name, email: e.email, passwortHash: e.hash });
      if (r.ok) ergebnis.angelegt++; else ergebnis.vorhanden++;
    }
    return ergebnis;
  }

  // ---- Statistik ----
  /**
   * Verbucht die Meldung des Spielservers (bereits auf Signatur geprüft). Je Partie und Spieler genau einmal.
   * Nur bekannte Zahlenfelder, gedeckelt; unbekannte Felder werden ignoriert.
   */
  async statistikVerbuchen(m) {
    if (!m || m.v !== 1 || typeof m.meldungsId !== 'string' || !/^[\w.:-]{1,120}$/.test(m.meldungsId) || !Array.isArray(m.spieler) || m.spieler.length < 1 || m.spieler.length > 32) {
      return fehler(400, 'meldung_ungueltig', 'Meldung ungültig');
    }
    const ergebnisse = [];
    for (const sp of m.spieler) {
      const id = String(sp?.nutzerId ?? '');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(id) || !['sieg', 'niederlage', 'unentschieden'].includes(sp?.ergebnis)) { ergebnisse.push({ id, status: 'ungueltig' }); continue; }
      if (!(await this.s.neu('meldungen', schluesselHash(`${m.meldungsId}|${id}`), { zeit: this.jetzt() }))) { ergebnisse.push({ id, status: 'doppelt' }); continue; }
      let status = 'unbekannt';
      for (let i = 0; i < 5; i++) {
        const r = await this.s.lies('nutzer', id);
        if (!r) break;
        const neu = { ...r.wert, stat: fuehreFort(r.wert.stat ?? leereStatistik(), sp, this.jetzt()) };
        if (await this.s.ersetze('nutzer', id, neu, r.etag)) { status = 'verbucht'; break; }
        status = 'konflikt';
      }
      if (status !== 'verbucht') await this.s.loesche('meldungen', schluesselHash(`${m.meldungsId}|${id}`)); // erneut meldbar
      ergebnisse.push({ id, status });
    }
    return { ok: true, ergebnisse };
  }
}

const OBERGRENZE = 10_000_000;
const zahl = w => { const n = Math.floor(Number(w)); return Number.isFinite(n) && n > 0 ? Math.min(n, OBERGRENZE) : 0; };
const objekt = w => (w && typeof w === 'object' && !Array.isArray(w) ? w : {});
const KENNUNG = /^[A-Za-z0-9_-]{1,40}$/;
const WERTE = ['spruenge', 'schuesse', 'treffer', 'fehlschuesse', 'schaden', 'kills', 'tode', 'selbsttreffer'];

function fuehreFort(alt, sp, jetzt) {
  const s = { ...leereStatistik(), ...alt, einheiten: { ...(alt.einheiten ?? {}) }, waffen: { ...(alt.waffen ?? {}) } };
  const deckel = (a, b) => Math.min(OBERGRENZE * 100, a + b);
  s.partien = deckel(s.partien, 1);
  if (sp.ergebnis === 'sieg') s.siege = deckel(s.siege, 1);
  else if (sp.ergebnis === 'niederlage') s.niederlagen = deckel(s.niederlagen, 1);
  else s.unentschieden = deckel(s.unentschieden, 1);
  for (const k of WERTE) s[k] = deckel(s[k] ?? 0, zahl(sp.werte?.[k]));
  for (const [id, e] of Object.entries(objekt(sp.einheiten)).slice(0, 64)) {
    if (!KENNUNG.test(id)) continue;
    const a = s.einheiten[id] ?? { schaden: 0, kills: 0, einsaetze: 0 };
    s.einheiten[id] = { schaden: deckel(a.schaden, zahl(e?.schaden)), kills: deckel(a.kills, zahl(e?.kills)), einsaetze: deckel(a.einsaetze, zahl(e?.einsaetze)) };
  }
  for (const [id, e] of Object.entries(objekt(sp.waffen)).slice(0, 128)) {
    if (!KENNUNG.test(id)) continue;
    const a = s.waffen[id] ?? { schuesse: 0, treffer: 0, schaden: 0 };
    s.waffen[id] = { schuesse: deckel(a.schuesse, zahl(e?.schuesse)), treffer: deckel(a.treffer, zahl(e?.treffer)), schaden: deckel(a.schaden, zahl(e?.schaden)) };
  }
  s.zuletzt = jetzt;
  return s;
}
