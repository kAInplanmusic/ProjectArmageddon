/**
 * Wetterzustand — weiche Übergänge, Wetterwechsel, Schneehöhe, Donner nach Entfernung. Reine Darstellung.
 *
 * Nichts hier berührt Engine, Zufallsfolgen der Engine, Zustand, Hash oder Replay. Alles folgt der Anzeigezeit (`r.time`, Bilder
 * bei 60 Hz) und `hash2` (stil.js): Zufall ist eine feste Funktion von Zeit und Platznummer, kein Würfeln.
 *
 * Aufbau: `wetterMit` (stimmung.js) liefert das ZIEL (Stärken 0 bis 1 je Wetterart); der Zustand nähert sich ihm je Bild an
 * (Anstieg langsamer als Abklingen sieht natürlicher aus). „Reduzierte Bewegung" springt ohne Übergang und lässt nichts
 * fließen.
 *
 * @module wetterZustand
 */
import { hash2 } from './stil.js';
import { wetterMit } from './stimmung.js';

/** Stärken, die der Zustand führt (alle 0 bis 1). */
export const WETTER_ACHSEN = Object.freeze(['regen', 'schnee', 'hagel', 'nebel', 'sonne', 'wind', 'sturm', 'laub']);

/** Anstiegs- und Abklingzeit (Sekunden, Zeitkonstante der Annäherung). */
const TAU_AN = 2.6;
const TAU_AB = 4.2;
/** Schneehöhe: Anwachsen bei voller Stärke je Sekunde (60 s bis „voll"), Tauen je Sekunde. */
const SCHNEE_WACHSEN = 0.017;
const SCHNEE_TAUEN = 0.012;
/** In Schneekarten liegt von Anfang an eine dünne Decke. */
const SCHNEE_START = 0.18;

/** Wechsel im Modus „wechselhaft": Dauer einer Wetterlage in Sekunden und die Auswahl (Gewicht = Häufigkeit). */
export const WECHSEL_DAUER = 75;
const WECHSEL_AUSWAHL = Object.freeze([
  'sonne', 'sonne', 'klar', 'wind', 'nebel', 'regen', 'regen', 'sturm', 'schnee', 'hagel',
]);

/**
 * Wetterlage des Modus „wechselhaft" in der Zeitscheibe `scheibe`: deterministisch, nie zweimal dieselbe hintereinander.
 * @param {number} scheibe
 * @param {number} [saat=0]
 * @returns {string} Schlüssel aus `WETTER_WAHL` (ohne `auto`)
 */
export function wechselLage(scheibe, saat = 0) {
  let folge = LAGEN.get(saat);
  if (!folge) LAGEN.set(saat, folge = []);
  const n = WECHSEL_AUSWAHL.length;
  for (let s = folge.length; s <= scheibe; s += 1) {
    let lage = WECHSEL_AUSWAHL[Math.floor(hash2(s, 77, saat) * n)];
    // Nie zweimal dieselbe Lage in Folge: bei Gleichheit zur nächsten andersartigen weiterrücken.
    for (let k = WECHSEL_AUSWAHL.indexOf(lage); s > 0 && lage === folge[s - 1]; k += 1) lage = WECHSEL_AUSWAHL[(k + 1) % n];
    folge.push(lage);
  }
  return folge[scheibe];
}
const LAGEN = new Map();

/**
 * Ziel-Stärken aus dem Ergebnis von `wetterMit`.
 * @param {object} w Ergebnis von `wetterMit` (mit `regen`, `schnee`, `hagel`, `nebel`, `sonne`, `wind`, `gewitter`, `laub`, optional `wechsel`)
 * @param {number} [sekunden=0] Anzeigezeit (nur für „wechselhaft")
 * @param {number} [saat=0]
 * @param {{stimmung?:{zeit?:string}}} [aus]
 */
export function zielAus(w, sekunden = 0, saat = 0) {
  let q = w;
  if (w.wechsel) {
    const basis = { regen: 0, schnee: 0, gewitter: false, nebel: 0, lichter: w.lichter };
    q = wetterMit(basis, wechselLage(Math.floor(sekunden / WECHSEL_DAUER), saat), 'auto');
  }
  const klemme = v => Math.max(0, Math.min(1, Number(v) || 0));
  return {
    regen: klemme(q.regen),
    schnee: klemme(q.schnee),
    hagel: klemme(q.hagel),
    nebel: klemme(q.nebel),
    sonne: klemme(q.sonne),
    wind: klemme(q.wind),
    sturm: q.gewitter ? 1 : 0,
    laub: klemme(q.laub),
  };
}

/** Ein frischer Zustand, der sofort am Ziel steht (neue Karte: nie von der alten Karte her überblenden). */
export function neuerZustand(ziel, zeit = 0, schneeStart = ziel.schnee > 0) {
  const z = { zeit, richtung: 0, richtungZiel: 0, schneeHoehe: schneeStart ? SCHNEE_START : 0 };
  for (const k of WETTER_ACHSEN) z[k] = ziel[k] ?? 0;
  return z;
}

/**
 * Nähert den Zustand dem Ziel an, `bilder` = vergangene Anzeigebilder (60 Hz). Idempotent je Bild (gleiche Zeit → nichts).
 * Rückwärts springende Zeit (neues Match) oder `still` setzen ohne Übergang.
 * @returns {object} derselbe Zustand
 */
export function schreiteFort(z, ziel, zeit, still = false, richtungZiel = 0) {
  const bilder = zeit - z.zeit;
  if (bilder === 0) return z;
  z.zeit = zeit;
  z.richtungZiel = richtungZiel;
  if (still || bilder < 0) {
    for (const k of WETTER_ACHSEN) z[k] = ziel[k];
    z.richtung = richtungZiel;
    z.schneeHoehe = Math.max(z.schneeHoehe, ziel.schnee > 0 ? 0.6 * ziel.schnee : 0);
    if (ziel.schnee === 0) z.schneeHoehe = 0;
    return z;
  }
  const dt = Math.min(0.25, bilder / 60);
  for (const k of WETTER_ACHSEN) {
    const d = ziel[k] - z[k];
    const kf = 1 - Math.exp(-dt / (d > 0 ? TAU_AN : TAU_AB));
    z[k] = Math.abs(d) < 0.003 ? ziel[k] : z[k] + d * kf;
  }
  // Windrichtung schwenkt weich (die Spielwindrichtung wechselt je Zug; ein Umklappen der Teilchen wäre hässlich).
  z.richtung += (richtungZiel - z.richtung) * (1 - Math.exp(-dt / 1.4));
  if (z.schnee > 0.05) z.schneeHoehe = Math.min(1, z.schneeHoehe + dt * SCHNEE_WACHSEN * z.schnee);
  else z.schneeHoehe = Math.max(0, z.schneeHoehe - dt * SCHNEE_TAUEN);
  return z;
}

/** Ob irgendetwas Sichtbares läuft (spart die ganze Zeichnung bei klarem Wetter). */
export function wetterAktiv(z) {
  return WETTER_ACHSEN.some(k => z[k] > 0.01) || z.schneeHoehe > 0.01;
}

/**
 * Windrichtung (−1 links, +1 rechts) aus dem Spielwind (nur gelesen, nie verändert) oder, wenn windstill, aus einem festen
 * Wert je Karte. Die Stärke des SPIELwinds fließt nur als leichter Zusatz in die Neigung ein (`spielStaerke` 0 bis 1).
 * @param {number|undefined} spielWind Wert wie `state.wind` (Betrag bis etwa 0,05)
 * @param {number} saat
 */
export function windRichtung(spielWind, saat = 0) {
  const w = Number(spielWind) || 0;
  const staerke = Math.min(1, Math.abs(w) / 0.05);
  const fest = hash2(saat, 5, 31) < 0.5 ? -1 : 1;
  const richtung = Math.abs(w) < 0.0005 ? fest : Math.sign(w);
  return { richtung, spielStaerke: staerke };
}

/** Böen: langsame Schwankung 0,45 bis 1 der Windstärke (Mischung zweier Sinusse, nie ganz still). */
export function boe(t, phase = 0) {
  return 0.72 + 0.28 * Math.sin(t * 0.37 + phase) * Math.sin(t * 0.91 + phase * 1.7 + 1.3) + 0.12 * Math.sin(t * 2.3 + phase);
}

/**
 * Donner zu einem Blitz: Entfernung 0 (direkt über uns) bis 1 (fernes Grollen).
 * Verzug 0,4 bis 2,3 s (Schall braucht länger als das Licht), Lautstärke 1 bis 0,3, Dumpfheit 0 bis 0,8
 * (Ferne nimmt die hohen Töne).
 * @param {number} entfernung
 */
export function donnerFuer(entfernung) {
  const e = Math.max(0, Math.min(1, entfernung));
  return { verzug: 0.4 + e * 1.9, lautstaerke: 1 - 0.7 * Math.pow(e, 0.85), dumpf: 0.8 * e, entfernung: e };
}

/** Helligkeitsfaktor des Blitzes nach Entfernung: nahe Einschläge blenden, ferne leuchten nur noch am Himmel. */
export function blitzHelle(entfernung) {
  return 1 - 0.55 * Math.max(0, Math.min(1, entfernung));
}

/**
 * Wetter aus einer generativen Szene (`pickScenery`): Regen, Schnee und Blitz, die das Ambiente der Szene nennt, werden hier
 * gezeichnet (nicht mehr von `sceneryPainter`), Sandsturm und Aschesturm bringen sichtbaren Wind mit.
 * @param {{ambient?:{elemente?:{kind:string}[]}, skyId?:string}|null|undefined} szene
 * @returns {{regen:number, schnee:number, gewitter:boolean, nebel:number, lichter:boolean, wind:number, windTon:string|null}}
 */
export function wetterAusSzene(szene) {
  const aus = { regen: 0, schnee: 0, gewitter: false, nebel: 0, lichter: false, wind: 0, windTon: null };
  if (!szene) return aus;
  const arten = new Set((szene.ambient?.elemente ?? []).map(e => e.kind));
  const himmel = String(szene.skyId ?? '');
  if (arten.has('rain')) aus.regen = arten.has('clouds_storm') ? 0.8 : 0.5;
  if (arten.has('snow')) aus.schnee = 0.6;
  if (arten.has('lightning')) { aus.gewitter = true; aus.regen = Math.max(aus.regen, 0.7); aus.wind = 0.5; }
  if (aus.regen > 0.4 && aus.schnee > 0) aus.schnee = 0;
  if (himmel === 'sandstorm') { aus.wind = 0.9; aus.windTon = 'sand'; }
  if (himmel === 'ash_storm') { aus.wind = 0.7; aus.windTon = 'asche'; }
  return aus;
}
