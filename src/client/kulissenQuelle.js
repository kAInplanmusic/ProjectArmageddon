/**
 * Wahl der Kulissenquelle: 1280 / 1920 / 2560 / 3840.
 *
 * Die Kulisse wird in Weltkoordinaten gezeichnet (`renderer.width`), auf dem
 * Bildschirm aber nur mit der CSS-Breite des Canvas sichtbar. Welche
 * Quelldatei sinnvoll ist, hängt deshalb an drei Dingen: sichtbare Breite,
 * Pixeldichte (DPR) und Leistung des Geräts. Ein 4K-Bild auf einem 1280er
 * Fenster wäre teuer und nicht schärfer; ein 1280er Bild auf einem 4K-Display
 * wäre sichtbar weich.
 *
 * Regeln (A18, docs/DesignRest/kulissen-4k.md):
 *  - Bedarf = sichtbare CSS-Breite × gedeckelte DPR. DPR über 2 wird nicht
 *    vergrößert: der Gewinn ist kaum sichtbar, der Speicherbedarf aber linear.
 *  - Nächstgrößere Stufe, nie darüber hinaus. Kein Hochskalieren einer
 *    kleineren Datei (die 1280er ist die Basis und bleibt unverändert).
 *  - Obergrenze aus der Geräteleistung: Lite/2 Kerne/2 GB → 1920,
 *    ≤4 Kerne oder ≤4 GB → 2560, sonst 3840.
 *  - Nur die aktuelle und höchstens eine vorgeladene Variante bleiben im
 *    Speicher (`KulissenBildspeicher`). Alles andere wird freigegeben.
 *
 * Das Modul ist DOM-frei, damit es ohne Browser prüfbar ist.
 *
 * @module kulissenQuelle
 */

/** Erlaubte Quellbreiten, aufsteigend. 1280 ist die vorhandene Basis. */
export const KULISSEN_BREITEN = Object.freeze([1280, 1920, 2560, 3840]);

/** Obergrenze der Pixeldichte für die Quellwahl (Geräte melden bis 4). */
export const DPR_OBERGRENZE = 2;

/** Ordner der nativen 4K-Fassungen (noch leer; siehe Produktionsplan). */
export const KULISSEN_4K_ORDNER = 'backdrops-4k';

const LEISTUNGS_GRENZE = Object.freeze({ lite: 1920, mittel: 2560, hoch: 3840 });

/** Begrenzt eine gemeldete DPR auf den sinnvollen Bereich 1…2. */
export function gedeckelteDpr(dpr) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(DPR_OBERGRENZE, d);
}

/**
 * Höchste Quellbreite, die das Gerät nach seiner Leistung bekommen soll.
 *
 * `leistung` ist entweder das Ergebnis von `loeseGrafik()` (mit `stufe` und
 * `messung`) oder eine flache Messung `{ kerne, speicherGB }`.
 */
export function leistungsObergrenze(leistung = {}) {
  const m = leistung.messung ?? leistung ?? {};
  if (leistung.stufe === 'lite') return LEISTUNGS_GRENZE.lite;
  const kerne = Number.isFinite(m.kerne) ? m.kerne : null;
  const speicher = Number.isFinite(m.speicherGB) ? m.speicherGB : null;
  if ((kerne != null && kerne <= 2) || (speicher != null && speicher <= 2)) return LEISTUNGS_GRENZE.lite;
  if ((kerne != null && kerne <= 4) || (speicher != null && speicher <= 4)) return LEISTUNGS_GRENZE.mittel;
  return LEISTUNGS_GRENZE.hoch;
}

/**
 * Wählt die Quellbreite.
 *
 * @param {{sichtbareBreite:number, dpr?:number, leistung?:object}} werte
 * @returns {{breite:number, bedarf:number, dpr:number, grenze:number, grund:string}}
 */
export function waehleKulissenBreite({ sichtbareBreite, dpr = 1, leistung = {} } = {}) {
  const sichtbar = Number.isFinite(sichtbareBreite) && sichtbareBreite > 0 ? sichtbareBreite : 0;
  const d = gedeckelteDpr(dpr);
  const bedarf = Math.round(sichtbar * d);
  const grenze = leistungsObergrenze(leistung);
  let breite = KULISSEN_BREITEN.find(b => b >= bedarf) ?? KULISSEN_BREITEN[KULISSEN_BREITEN.length - 1];
  const durchLeistung = breite > grenze;
  if (durchLeistung) breite = grenze;
  const grund = durchLeistung
    ? `Bedarf ${bedarf} px, aber Geräteleistung begrenzt auf ${grenze} px`
    : `sichtbar ${Math.round(sichtbar)} CSS-px × DPR ${d} = ${bedarf} px`;
  return { breite, bedarf, dpr: d, grenze, grund };
}

/**
 * Dateiname einer Fassung. 1280 nutzt die vorhandene Basisdatei, alle
 * größeren Fassungen tragen die Breite vor der Endung:
 * `maritime_calm_day.webp` → `maritime_calm_day-2560.webp`.
 */
export function kulissenDateiname(datei, breite) {
  const name = String(datei ?? '');
  if (!name) return '';
  const stufe = KULISSEN_BREITEN.includes(breite) ? breite : KULISSEN_BREITEN[0];
  if (stufe <= KULISSEN_BREITEN[0]) return name;
  const punkt = name.lastIndexOf('.');
  if (punkt <= 0) return `${name}-${stufe}`;
  return `${name.slice(0, punkt)}-${stufe}${name.slice(punkt)}`;
}

/**
 * Ladereihenfolge: gewünschte Fassung, dann die Basis als Rückfall. Doppelte
 * Namen entfallen (bei 1280 sind beide gleich).
 */
export function kulissenKandidaten(datei, breite) {
  return [...new Set([kulissenDateiname(datei, breite), String(datei ?? '')])].filter(Boolean);
}

/**
 * Was vorgeladen werden darf: die aktuelle Variante und höchstens eine
 * nächste — nie der ganze Katalog.
 *
 * @param {{aktuell?:{file:string}, naechste?:{file:string}|null, breite:number}} plan
 * @returns {{datei:string, breite:number}[]}
 */
export function vorladePlan({ aktuell, naechste = null, breite } = {}) {
  const liste = [];
  for (const eintrag of [aktuell, naechste]) {
    if (!eintrag?.file || liste.length >= 2) continue;
    if (liste.some(e => e.datei === eintrag.file)) continue;
    liste.push({ datei: eintrag.file, breite });
  }
  return liste;
}

/**
 * Bildspeicher mit harter Obergrenze.
 *
 * Hält höchstens die aktuelle und eine vorgeladene Kulisse. Beim Wechsel
 * werden alte Bild- und Warteschlangenverweise gelöscht; der Browser kann den
 * Speicher danach freigeben (erzwingen lässt sich das von JavaScript aus nicht).
 * `ImageCtor` und `urlFuer` sind einschiebbar, damit die Klasse ohne DOM prüfbar ist.
 */
export class KulissenBildspeicher {
  constructor({ urlFuer, ImageCtor = globalThis.Image, hoechstens = 2 } = {}) {
    this.urlFuer = urlFuer;
    this.ImageCtor = ImageCtor;
    this.hoechstens = Math.max(1, hoechstens);
    this.eintraege = new Map();
    this.aktuell = null;
    this.vorlauf = null;
  }

  get groesse() {
    return this.eintraege.size;
  }

  /** Kennung einer Variante in einer Quellbreite. */
  static schluessel(backdrop, breite) {
    return `${backdrop?.key ?? backdrop?.file ?? '?'}@${breite}`;
  }

  /** Liefert ein bereits fertiges Bild oder `null`. */
  holeFertig(datei, breite) {
    for (const eintrag of this.eintraege.values()) {
      if (eintrag.bild && eintrag.datei === datei && eintrag.breite === breite) return eintrag.bild;
    }
    return null;
  }

  /**
   * Lädt die aktuelle Kulisse. Ist sie schon vorgeladen, kommt der Rückruf
   * sofort — ohne zweite Anfrage.
   */
  hole(backdrop, breite, { onBild, onFehler } = {}) {
    if (!backdrop?.file) return null;
    const key = KulissenBildspeicher.schluessel(backdrop, breite);
    this.aktuell = key;
    this.vorlauf = null;
    const fertig = this.eintraege.get(key);
    if (fertig?.bild) {
      this.#raeume();
      onBild?.(fertig.bild, fertig.datei);
      return key;
    }
    if (fertig?.laeuft) {
      if (onBild) fertig.wartend.push(onBild);
      if (onFehler) fertig.fehlerWartend.push(onFehler);
      return key;
    }
    this.#raeume();
    this.#lade(key, backdrop.file, breite, { onBild, onFehler });
    return key;
  }

  /** Lädt eine nächste Variante stumm vor; sie ersetzt keinen laufenden Ladevorgang. */
  vorladen(backdrop, breite, { onFehler } = {}) {
    if (!backdrop?.file) return null;
    const key = KulissenBildspeicher.schluessel(backdrop, breite);
    if (key === this.aktuell) return key;
    this.vorlauf = key;
    this.#raeume();
    const fertig = this.eintraege.get(key);
    if (fertig?.bild || fertig?.laeuft) return key;
    this.#lade(key, backdrop.file, breite, { onFehler });
    return key;
  }

  /** Gibt alles außer der aktuellen und der vorgeladenen Variante frei. */
  #raeume() {
    const behalten = new Set([this.aktuell, this.vorlauf].filter(Boolean));
    for (const [key, eintrag] of [...this.eintraege]) {
      if (behalten.has(key)) continue;
      this.eintraege.delete(key);
      if (eintrag) {
        eintrag.bild = null;
        eintrag.wartend.length = 0;
        eintrag.fehlerWartend.length = 0;
      }
    }
  }

  #lade(key, datei, breite, { onBild, onFehler } = {}) {
    const eintrag = {
      datei,
      breite,
      bild: null,
      laeuft: true,
      wartend: onBild ? [onBild] : [],
      fehlerWartend: onFehler ? [onFehler] : [],
    };
    this.eintraege.set(key, eintrag);
    const kandidaten = kulissenKandidaten(datei, breite);
    const versuch = (i) => {
      if (i >= kandidaten.length) {
        eintrag.laeuft = false;
        if (this.eintraege.get(key) === eintrag) this.eintraege.delete(key);
        for (const cb of eintrag.fehlerWartend.splice(0)) {
          cb?.(new Error(`Kulisse lädt nicht: ${datei}`));
        }
        return;
      }
      const url = this.urlFuer?.(kandidaten[i]);
      if (!url) { versuch(i + 1); return; }
      const bild = new this.ImageCtor();
      bild.decoding = 'async';
      bild.onload = () => {
        eintrag.bild = bild;
        eintrag.datei = kandidaten[i];
        eintrag.laeuft = false;
        for (const cb of eintrag.wartend.splice(0)) cb?.(bild, eintrag.datei);
        if (key === this.aktuell || key === this.vorlauf) this.#raeume();
        else this.eintraege.delete(key);
      };
      bild.onerror = () => versuch(i + 1);
      bild.src = url;
    };
    versuch(0);
  }

  /** Gibt den gesamten Speicher frei (Kulisse abgewählt, Match beendet). */
  leere() {
    for (const eintrag of this.eintraege.values()) {
      eintrag.bild = null;
      eintrag.wartend.length = 0;
      eintrag.fehlerWartend.length = 0;
    }
    this.eintraege.clear();
    this.aktuell = null;
    this.vorlauf = null;
  }
}
