/**
 * Speicher-Abstraktion der Nutzerdatenbank (docs/zugang-www.md). Die Logik (`nutzer.mjs`) kennt nur diese
 * Schnittstelle; heute steckt Netlify Blobs dahinter, später kann eine andere Ablage (z. B. Postgres)
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

/** Speicher im Arbeitsspeicher: für Tests (und lokale Versuche). Verhält sich wie die Blobs bei bedingten Schreibzugriffen. */
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

/**
 * Netlify Blobs. `getStore` kommt aus `@netlify/blobs` (nur in der Funktion geladen, nie im Spielserver).
 * Starke Konsistenz, damit Eindeutigkeits- und Sperrprüfungen sofort sichtbar sind.
 */
export class BlobSpeicher {
  #stores = new Map();
  constructor(getStore) { this.getStore = getStore; }
  #store(bereich) {
    if (!this.#stores.has(bereich)) this.#stores.set(bereich, this.getStore({ name: `pa-${bereich}`, consistency: 'strong' }));
    return this.#stores.get(bereich);
  }
  async lies(bereich, schluessel) {
    const r = await this.#store(bereich).getWithMetadata(schluessel, { type: 'json', consistency: 'strong' });
    return r ? { wert: r.data, etag: r.etag } : null;
  }
  async neu(bereich, schluessel, wert) {
    return (await this.#store(bereich).setJSON(schluessel, wert, { onlyIfNew: true })).modified === true;
  }
  async ersetze(bereich, schluessel, wert, etag) {
    return (await this.#store(bereich).setJSON(schluessel, wert, { onlyIfMatch: etag })).modified === true;
  }
  async setze(bereich, schluessel, wert) { await this.#store(bereich).setJSON(schluessel, wert); }
  async loesche(bereich, schluessel) { await this.#store(bereich).delete(schluessel); }
}

/** Standard in der Netlify-Funktion: Blobs der Seite. */
export async function erzeugeBlobSpeicher() {
  const { getStore } = await import('@netlify/blobs');
  return new BlobSpeicher(getStore);
}
