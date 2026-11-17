/**
 * Speicher-Abstraktion der Nutzerdatenbank (docs/zugang-www.md). Die Logik (`nutzer.mjs`) kennt nur diese
 * Schnittstelle; heute steckt Cloudflare D1 dahinter (`D1Speicher`), eine andere Ablage kann
 * dieselben fünf Methoden bedienen, ohne dass sich die Logik ändert.
 *
 * Schnittstelle (alles asynchron; `bereich` und `schluessel` sind einfache Zeichenketten):
 *   lies(bereich, schluessel)                  -> { wert, etag } | null
 *   neu(bereich, schluessel, wert)             -> true, wenn der Schlüssel NEU war (atomar), sonst false
 *   ersetze(bereich, schluessel, wert, etag)   -> true, wenn der Eintrag noch die Version `etag` hatte (atomar)
 *   setze(bereich, schluessel, wert)           -> schreibt ohne Bedingung
 *   loesche(bereich, schluessel)
 *
 * Bereiche: nutzer (ID -> Konto), namen und emails (Hash des Schlüssels -> { id }, erzwingen Eindeutigkeit),
 * sperre (Fehlversuchszähler), meldungen (Idempotenz der Statistik). Schlüssel von außen kommen nie roh
 * hinein, sondern als SHA-256 (keine Namen oder Adressen in Schlüsseln).
 */
import { createHash } from 'node:crypto';

export const schluesselHash = text => createHash('sha256').update(String(text)).digest('hex');

/** Speicher im Arbeitsspeicher: für Tests (und lokale Versuche). Verhält sich wie D1 bei bedingten Schreibzugriffen. */
export class SpeicherImSpeicher {
  #daten = new Map();
  #zaehler = 0;
  /** Nur für Tests: Anzahl der Zugriffe. */
  zugriffe = 0;
  async lies(bereich, schluessel) {
    this.zugriffe++;
    const e = this.#daten.get(`${bereich}/${schluessel}`);
    return e ? { wert: structuredClone(e.wert), etag: e.etag } : null;
  }
  async neu(bereich, schluessel, wert) {
    this.zugriffe++;
    const k = `${bereich}/${schluessel}`;
    if (this.#daten.has(k)) return false;
    this.#daten.set(k, { wert: structuredClone(wert), etag: String(++this.#zaehler) });
    return true;
  }
  async ersetze(bereich, schluessel, wert, etag) {
    this.zugriffe++;
    const k = `${bereich}/${schluessel}`;
    if (this.#daten.get(k)?.etag !== etag) return false;
    this.#daten.set(k, { wert: structuredClone(wert), etag: String(++this.#zaehler) });
    return true;
  }
  async setze(bereich, schluessel, wert) {
    this.zugriffe++;
    this.#daten.set(`${bereich}/${schluessel}`, { wert: structuredClone(wert), etag: String(++this.#zaehler) });
  }
  async loesche(bereich, schluessel) { this.zugriffe++; this.#daten.delete(`${bereich}/${schluessel}`); }
  /** Nur für Tests: Rohinhalt (um zu prüfen, dass keine Klartext-Passwörter liegen). */
  alsText() { return JSON.stringify([...this.#daten]); }
}

/** Tabelle der Nutzerdatenbank in D1 (SQLite). Einmal anlegen: `erzeugeD1Speicher` führt es selbst aus (idempotent). */
export const D1_SCHEMA = `CREATE TABLE IF NOT EXISTS pa_kv (
  bereich TEXT NOT NULL, schluessel TEXT NOT NULL, wert TEXT NOT NULL, etag INTEGER NOT NULL,
  PRIMARY KEY (bereich, schluessel)
)`;

/**
 * Cloudflare D1. `db` ist die D1-Bindung (`env.DB`: `prepare(sql).bind(...).first()/run()`). Atomar ist je Aufruf ein
 * einziger SQL-Befehl: `neu` per INSERT OR IGNORE, `ersetze` per UPDATE ... WHERE etag = ?; `meta.changes` sagt, ob er griff.
 * Die Version (`etag`) zählt bei jedem Schreiben hoch und wird als Zeichenkette zurückgegeben.
 */
export class D1Speicher {
  constructor(db) { this.db = db; }
  async lies(bereich, schluessel) {
    const z = await this.db.prepare('SELECT wert, etag FROM pa_kv WHERE bereich = ? AND schluessel = ?').bind(bereich, schluessel).first();
    return z ? { wert: JSON.parse(z.wert), etag: String(z.etag) } : null;
  }
  async neu(bereich, schluessel, wert) {
    const r = await this.db.prepare('INSERT OR IGNORE INTO pa_kv (bereich, schluessel, wert, etag) VALUES (?, ?, ?, 1)')
      .bind(bereich, schluessel, JSON.stringify(wert)).run();
    return r.meta.changes === 1;
  }
  async ersetze(bereich, schluessel, wert, etag) {
    const r = await this.db.prepare('UPDATE pa_kv SET wert = ?, etag = etag + 1 WHERE bereich = ? AND schluessel = ? AND etag = ?')
      .bind(JSON.stringify(wert), bereich, schluessel, Number(etag)).run();
    return r.meta.changes === 1;
  }
  async setze(bereich, schluessel, wert) {
    await this.db.prepare('INSERT INTO pa_kv (bereich, schluessel, wert, etag) VALUES (?, ?, ?, 1) ON CONFLICT (bereich, schluessel) DO UPDATE SET wert = excluded.wert, etag = pa_kv.etag + 1')
      .bind(bereich, schluessel, JSON.stringify(wert)).run();
  }
  async loesche(bereich, schluessel) {
    await this.db.prepare('DELETE FROM pa_kv WHERE bereich = ? AND schluessel = ?').bind(bereich, schluessel).run();
  }
}

/** Legt die Tabelle an (falls nötig) und liefert den Speicher für die D1-Bindung. */
export async function erzeugeD1Speicher(db) {
  await db.prepare(D1_SCHEMA).run();
  return new D1Speicher(db);
}
