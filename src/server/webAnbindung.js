/**
 * Anbindung an die Nutzerdatenbank der Webseite (docs/zugang-www.md): Spieltoken und Statistik-Meldung.
 *
 * EINE Implementierung für beide Seiten: Die Netlify-Funktion (`scripts/betrieb/web/`) stellt Spieltoken
 * aus und prüft Meldungen; der Spielserver prüft Spieltoken und meldet Partieergebnisse. Beide teilen
 * das Geheimnis `PA_SPIEL_GEHEIMNIS` (Netlify: Umgebungsvariable; Spielserver: per cloud-init als
 * Datei unter /run, tmpfs — nie auf der Platte, nie im Abbild).
 *
 * ## Spieltoken
 *
 * `pa1.<payload>.<mac>`, payload = base64url(JSON `{u, n, e}`): Nutzer-ID, Anzeigename, Ablauf (Sekunden).
 * mac = HMAC-SHA256 mit einem aus dem Geheimnis abgeleiteten Teilschlüssel (`spieltoken-v1`), damit ein
 * Token nie als Statistik-Signatur taugt und umgekehrt. Kurzlebig (Vorgabe 2 h): Der Client holt vor
 * Ablauf ein neues. Der Spielserver ordnet den Spieler über `KontoDienst` einem lokalen Konto zu
 * (`externPruefer`, siehe konto.js) — keine zweite Kontenlogik.
 *
 * ## Statistik-Meldung
 *
 * POST an die Webseite, Kopfzeilen `x-pa-zeit` (ms) und `x-pa-signatur` (hex, HMAC über `<zeit>.<body>`,
 * Teilschlüssel `statistik-v1`). Zeitfenster ±5 min; Wiederholungen fängt die Idempotenz der Gegenseite
 * (Meldungs-ID je Partie und Spieler) ab.
 *
 * Kein Zufall, keine Uhr in der Logik: Zeit kommt als Parameter (Determinismus-Regel gilt hier nicht,
 * wird aber trotzdem eingehalten, damit die Tests stabil sind).
 *
 * @module webAnbindung
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const TOKEN_PRAEFIX = 'pa1';
export const TOKEN_SEKUNDEN = 2 * 3600;
export const ZEITFENSTER_MS = 5 * 60_000;
export const GEHEIMNIS_MIN = 32;

const teilschluessel = (geheimnis, zweck) => createHmac('sha256', String(geheimnis)).update(zweck).digest();
const macB64 = (schluessel, text) => createHmac('sha256', schluessel).update(text).digest('base64url');
const gleich = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Geheimnis aus `PA_SPIEL_GEHEIMNIS` oder der Datei `PA_SPIEL_GEHEIMNIS_DATEI`. Leer = nicht eingerichtet. */
export function leseSpielGeheimnis(env = process.env) {
  const direkt = String(env.PA_SPIEL_GEHEIMNIS ?? '').trim();
  if (direkt) return direkt;
  const datei = env.PA_SPIEL_GEHEIMNIS_DATEI;
  if (!datei) return '';
  try { return readFileSync(datei, 'utf8').trim(); } catch { return ''; }
}

/** Stellt ein Spieltoken aus. `jetztMs` ist die aktuelle Zeit (Millisekunden). */
export function stelleSpieltokenAus(geheimnis, { nutzerId, name }, jetztMs, sekunden = TOKEN_SEKUNDEN) {
  if (String(geheimnis ?? '').length < GEHEIMNIS_MIN) throw new Error('Spiel-Geheimnis fehlt oder ist zu kurz');
  const e = Math.floor(jetztMs / 1000) + sekunden;
  const payload = Buffer.from(JSON.stringify({ u: String(nutzerId), n: String(name), e })).toString('base64url');
  const nutz = `${TOKEN_PRAEFIX}.${payload}`;
  return { token: `${nutz}.${macB64(teilschluessel(geheimnis, 'spieltoken-v1'), nutz)}`, laeuftAb: e * 1000 };
}

/** Prüft ein Spieltoken. Gibt `{ id, name }` oder `null` (falsche Form, Signatur, abgelaufen). */
export function pruefeSpieltoken(token, geheimnis, jetztMs) {
  if (String(geheimnis ?? '').length < GEHEIMNIS_MIN) return null;
  const teile = String(token ?? '').split('.');
  if (teile.length !== 3 || teile[0] !== TOKEN_PRAEFIX || teile[1].length > 600) return null;
  const nutz = `${teile[0]}.${teile[1]}`;
  if (!gleich(macB64(teilschluessel(geheimnis, 'spieltoken-v1'), nutz), teile[2])) return null;
  let daten;
  try { daten = JSON.parse(Buffer.from(teile[1], 'base64url').toString('utf8')); } catch { return null; }
  if (typeof daten?.u !== 'string' || typeof daten?.n !== 'string' || !Number.isFinite(daten?.e)) return null;
  if (daten.e * 1000 <= jetztMs || !/^[A-Za-z0-9-]{8,64}$/.test(daten.u)) return null;
  return { id: daten.u, name: daten.n };
}

/** Der Prüfer, den `KontoDienst` als `externPruefer` bekommt (oder `null`, wenn kein Geheimnis da ist). */
export function baueExternPruefer(geheimnis) {
  if (String(geheimnis ?? '').length < GEHEIMNIS_MIN) return null;
  return (token, jetztMs) => pruefeSpieltoken(token, geheimnis, jetztMs);
}

/** Signatur einer Statistik-Meldung (hex). */
export function signiereMeldung(geheimnis, zeitMs, body) {
  return createHmac('sha256', teilschluessel(geheimnis, 'statistik-v1')).update(`${zeitMs}.${body}`).digest('hex');
}

/** Prüft Zeit und Signatur einer Meldung. `true` nur bei beidem in Ordnung. */
export function pruefeMeldung(geheimnis, zeitText, signatur, body, jetztMs) {
  if (String(geheimnis ?? '').length < GEHEIMNIS_MIN) return false;
  const zeit = Number(zeitText);
  if (!Number.isFinite(zeit) || Math.abs(jetztMs - zeit) > ZEITFENSTER_MS) return false;
  return gleich(signiereMeldung(geheimnis, zeit, body), String(signatur ?? ''));
}

/**
 * Baut die Meldung einer beendeten Partie aus den Sitzplätzen und den Auswertungswerten des Servers.
 * Nur Spieler mit Web-Konto (lokale Konto-ID `w-<Nutzer-ID>`) kommen hinein. Es werden nur Zahlen gemeldet,
 * die der Server tatsächlich erfasst (`MatchStats.fuerMehrere`); alles Weitere (Sprünge, Selbsttreffer, je
 * Einheit/Waffe) bleibt leer, bis die Erfassung im Spiel gebaut ist — es wird nichts erfunden.
 *
 * @returns {object|null} Nutzlast oder `null`, wenn kein Web-Konto mitgespielt hat
 */
export function baueMeldung({ lobby, stats, jetztMs }) {
  const nachKonto = new Map();
  for (const seat of lobby?.seats ?? []) {
    if (typeof seat?.kontoId !== 'string' || !seat.kontoId.startsWith('w-')) continue;
    if (!nachKonto.has(seat.kontoId)) nachKonto.set(seat.kontoId, []);
    nachKonto.get(seat.kontoId).push(seat);
  }
  if (nachKonto.size === 0) return null;
  const spieler = [];
  for (const [kontoId, sitze] of nachKonto) {
    const z = stats.fuerMehrere(sitze.map(s => s.entityId).filter(w => w !== null && w !== undefined));
    let ergebnis = 'unentschieden';
    if (stats.entschieden && stats.gewinnerTeamId !== null && stats.gewinnerTeamId !== undefined) {
      ergebnis = sitze.some(s => s.teamId === stats.gewinnerTeamId) ? 'sieg' : 'niederlage';
    }
    const schuesse = Math.max(0, Number(z?.schuesse) || 0);
    const treffer = Math.max(0, Number(z?.treffer) || 0);
    spieler.push({
      nutzerId: kontoId.slice(2),
      ergebnis,
      werte: { schuesse, treffer, fehlschuesse: Math.max(0, schuesse - treffer), kills: Number(z?.kills) || 0, schaden: Number(z?.schaden) || 0 },
    });
  }
  return { v: 1, meldungsId: `${lobby.id}-${Math.floor(jetztMs / 1000)}`, beendetAm: jetztMs, modus: String(lobby.modus ?? 'unbekannt'), spieler };
}

/** Sendet eine Meldung signiert an die Webseite. Wirft nie; gibt `{ ok, status }` zurück. */
export async function sendeMeldung({ url, geheimnis, nutzlast, jetztMs, fetchFn = globalThis.fetch }) {
  if (!url || String(geheimnis ?? '').length < GEHEIMNIS_MIN || !nutzlast) return { ok: false, status: 0 };
  const body = JSON.stringify(nutzlast);
  try {
    const r = await fetchFn(url, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'x-pa-zeit': String(jetztMs), 'x-pa-signatur': signiereMeldung(geheimnis, jetztMs, body) },
      body,
    });
    return { ok: r.ok, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}
