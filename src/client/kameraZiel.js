/**
 * Kameraführung, reine Rechnung: Wohin soll die Kamera schauen?
 *
 * ## Warum diese Datei existiert
 *
 * Abnahme 2026-10-19: Zu Rundenbeginn stand die aktive Figur oft hinter der
 * Spielerliste (z. B. P1 bei Seed 5 links), und auf der 2560er Karte, die als
 * 1280-px-Fenster erscheint, waren die Figuren klein. `camera.js` folgte nur
 * der Figur — ohne Zoom, ohne Blick auf Zielrichtung, ohne Geschossverfolgung.
 *
 * Hier steht die **Rechnung** ohne Browser, ohne Zeitgeber und ohne Zustand:
 * welcher Ausschnitt (`{x, y, zoom}`) zeigt die Figur im sicheren Bereich samt
 * Zielrichtung (`zielAusschnitt`), wie folgt die Kamera einem Geschoss
 * (`flugAusschnitt`), wie stark ist der Bildschub nach einem Einschlag
 * (`stossFuer`), und wie gleitet sie weich (`glaette`). Das Zeitverhalten
 * (Phasen, Federn, Spielereingriff) steht in `kameraRegie.js`.
 *
 * Alles ist **reine Darstellung**: Es liest Positionen und ändert weder
 * Engine noch Zustands-Hash noch Replay. Kein `Math.random`, kein `Date.now`.
 *
 * Einheiten: Karten- und Bildschirmmaße sind Zeichenflächenpixel (die
 * Zeichenfläche ist so groß wie die Karte; CSS skaliert sie aufs Fenster).
 * `rand` sind die vom HUD verdeckten Ränder in Bildschirmpixeln.
 *
 * @module kameraZiel
 */
import { begrenzeAnsicht, fokusImSchirm, ZOOM_GRENZEN } from './camera.js';

/** Kartenpixel Breite, die die Standardführung zeigen will (Reichweiten sind Kartenpixel). */
const SICHT_BREITE = 1400;
/** Kartenpixel Höhe, die die Standardführung zeigen will. */
const SICHT_HOEHE = 790;
/** Wie weit die Zielrichtung im Bild gezeigt wird, als Anteil der bevorzugten Sichtbreite. */
const ZIEL_ANTEIL = 0.32;
/** Gegner innerhalb dieser Entfernung (Kartenpixel) in Schussrichtung kommen mit ins Bild. */
const GEGNER_REICHWEITE = 950;
/** Gegner innerhalb dieser Entfernung kommen auch entgegen der Schussrichtung ins Bild. */
const GEGNER_NAH = 320;
/** Höchstzahl der Gegner, die den Ausschnitt mitbestimmen. */
const GEGNER_MAX = 2;
/** Sekunden Vorausschau beim Folgen eines Geschosses. */
const VORAUS_SEKUNDEN = 0.28;

/** Rand um den Ausschnitt als Anteil der Schirmhöhe. */
const RAND_ANTEIL = 0.05;

/**
 * Der bevorzugte Zoom: so viel Karte, wie `SICHT_BREITE` × `SICHT_HOEHE` fasst,
 * zwischen „ganze Karte" und dem größten Zoom.
 *
 * @param {{b:number,h:number}} schirm
 * @param {{b:number,h:number}} karte
 * @param {{zoomMax?:number}} [optionen]
 */
export function zoomBevorzugt(schirm, karte, { zoomMax = ZOOM_GRENZEN.max } = {}) {
  const ganze = Math.min(schirm.b / karte.b, schirm.h / karte.h);
  const wunsch = Math.min(schirm.b / SICHT_BREITE, schirm.h / SICHT_HOEHE);
  return Math.max(ganze, Math.min(zoomMax, wunsch));
}

/**
 * Glättet einen Wert mit einer kritisch gedämpften Feder (kein Überschwingen,
 * stetige Geschwindigkeit — „nie ruckartig").
 *
 * Nach `glaettZeit` Sekunden ist die Strecke zu ~59 % zurückgelegt, nach
 * 2·`glaettZeit` zu ~91 %, nach 3·`glaettZeit` zu ~98 %.
 *
 * @param {number} wert aktueller Wert
 * @param {number} tempo aktuelle Geschwindigkeit (Einheiten je Sekunde)
 * @param {number} ziel Zielwert
 * @param {number} glaettZeit Zeitkonstante in Sekunden (> 0)
 * @param {number} dt Zeitschritt in Sekunden
 * @returns {{wert:number, tempo:number}}
 */
export function glaette(wert, tempo, ziel, glaettZeit, dt) {
  if (!(dt > 0)) return { wert, tempo };
  const zeit = Math.max(0.0001, glaettZeit);
  const omega = 2 / zeit;
  const x = omega * dt;
  const daempfung = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const abstand = wert - ziel;
  const temp = (tempo + omega * abstand) * dt;
  let neuesTempo = (tempo - omega * temp) * daempfung;
  let neu = ziel + (abstand + temp) * daempfung;
  // Nie über das Ziel hinausschießen.
  if ((ziel - wert > 0) === (neu > ziel)) {
    neu = ziel;
    neuesTempo = dt > 0 ? (neu - ziel) / dt : 0;
  }
  return { wert: neu, tempo: neuesTempo };
}

/** Bildschirmposition eines Kartenpunkts bei einer Ansicht. */
function kartenPunktImSchirm(punkt, ansicht, karte, schirm, rand, schub = 0) {
  const f = fokusImSchirm(schirm, rand, ansicht.zoom, karte, schub);
  return {
    x: f.x + (punkt.x - ansicht.x) * ansicht.zoom,
    y: f.y + (punkt.y - ansicht.y) * ansicht.zoom,
  };
}

/**
 * Liegt die Figur (Fuß-/Mittelpunkt `punkt` samt Maßen in BILDSCHIRMpixeln) bei
 * dieser Ansicht innerhalb des sicheren Rechtecks?
 *
 * @param {{halb:number, oben:number, unten:number}} pad Figurmaße in Bildschirmpixeln
 * @param {number} [innen] zusätzlicher Abstand zum Rand des sicheren Bereichs
 */
export function figurImSicheren(punkt, ansicht, karte, schirm, rand, pad, innen = 0) {
  const p = kartenPunktImSchirm(punkt, ansicht, karte, schirm, rand);
  return p.x - pad.halb >= rand.links + innen
    && p.x + pad.halb <= schirm.b - rand.rechts - innen
    && p.y - pad.oben >= rand.oben + innen
    && p.y + pad.unten <= schirm.h - rand.unten - innen;
}

/**
 * Welche Gegner kommen mit ins Bild? Die nächsten (höchstens `GEGNER_MAX`) in
 * Schussrichtung bis `GEGNER_REICHWEITE` sowie sehr nahe aus jeder Richtung.
 *
 * @param {{x:number,y:number}} aktiv
 * @param {number} winkel Zielwinkel (Bogenmaß, mathematisch: `cos` > 0 = nach rechts)
 * @param {Array<{x:number,y:number}>} gegner
 */
export function gegnerImSchussweg(aktiv, winkel, gegner = []) {
  const richtung = Math.cos(winkel) >= 0 ? 1 : -1;
  return gegner
    .map(g => ({ g, dx: g.x - aktiv.x, dy: g.y - aktiv.y }))
    .map(e => ({ ...e, d: Math.hypot(e.dx, e.dy) }))
    .filter(e => e.d <= GEGNER_NAH || (Math.sign(e.dx) === richtung && Math.abs(e.dx) <= GEGNER_REICHWEITE))
    .sort((a, b) => a.d - b.d)
    .slice(0, GEGNER_MAX)
    .map(e => e.g);
}

/** Das Rechteck, das Punkte (Kartenpixel) umschließt. */
function umschliessend(punkte) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of punkte) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * Verschiebt die Mitte `mitte` so wenig wie nötig, dass die Figur (mit Maßen
 * `pad`) bei diesem Zoom innerhalb des sicheren Rechtecks steht. Ist das
 * unmöglich (Bereich kleiner als die Figur), bleibt die Mitte unverändert.
 */
function figurMitte(mitte, figur, zoom, karte, schirm, rand, pad, innen = 0) {
  const f = fokusImSchirm(schirm, rand, zoom, karte);
  const klemme = (m, fig, lo, hi, fo) => {
    if (hi < lo) return m;
    // Bildschirmposition der Figur = fo + (fig - m)·zoom muss in [lo, hi] liegen.
    const von = fig - (hi - fo) / zoom;
    const bis = fig - (lo - fo) / zoom;
    return Math.max(von, Math.min(bis, m));
  };
  return {
    x: klemme(mitte.x, figur.x, rand.links + innen + pad.halb, schirm.b - rand.rechts - innen - pad.halb, f.x),
    y: klemme(mitte.y, figur.y, rand.oben + innen + pad.oben, schirm.h - rand.unten - innen - pad.unten, f.y),
  };
}

/**
 * Der Ausschnitt zu Zugbeginn und beim Zielen: aktive Figur UND Zielrichtung
 * (und Gegner im Schussweg) im Bild, die Figur im sicheren Bereich.
 *
 * Vorgehen: Das Rechteck aus Figur, Zielpunkt und Gegnern bestimmt den Zoom
 * (höchstens der bevorzugte, mindestens „ganze Karte"). Danach wird auf die
 * Kartenfläche geklemmt — und gelingt es der Klemmung nicht, die Figur aus dem
 * HUD-Rand zu holen (Figur nahe am Kartenrand), wird weiter hineingezoomt, bis
 * sie im sicheren Bereich steht oder der größte Zoom erreicht ist.
 *
 * @param {object} p
 * @param {{x:number,y:number,winkel:number}} p.aktiv Figur (Kartenpixel) und Zielwinkel
 * @param {Array<{x:number,y:number}>} [p.gegner]
 * @param {{b:number,h:number}} p.karte
 * @param {{b:number,h:number}} p.schirm
 * @param {{oben:number,unten:number,links:number,rechts:number}} p.rand
 * @param {{halb:number,oben:number,unten:number}} p.pad Figurmaße in Bildschirmpixeln
 * @param {number} [p.zoomMax]
 * @returns {{x:number,y:number,zoom:number,sicher:boolean}} `sicher`: Figur im sicheren Bereich
 */
export function zielAusschnitt({
  aktiv, gegner = [], karte, schirm, rand, pad, zoomMax = ZOOM_GRENZEN.max,
}) {
  const ganze = Math.min(schirm.b / karte.b, schirm.h / karte.h);
  const bevorzugt = zoomBevorzugt(schirm, karte, { zoomMax });
  const reichweite = (schirm.b / bevorzugt) * ZIEL_ANTEIL;
  const winkel = Number.isFinite(aktiv.winkel) ? aktiv.winkel : 0;
  const ziel = {
    x: aktiv.x + Math.cos(winkel) * reichweite,
    y: aktiv.y - Math.sin(winkel) * reichweite * 0.7,
  };
  const punkte = [aktiv, ziel, ...gegnerImSchussweg(aktiv, winkel, gegner)];
  const kasten = umschliessend(punkte);

  const rahmen = RAND_ANTEIL * schirm.h;
  const freiB = schirm.b - rand.links - rand.rechts - 2 * (pad.halb + rahmen);
  const freiH = schirm.h - rand.oben - rand.unten - pad.oben - pad.unten - 2 * rahmen;
  const kastenB = Math.max(1, kasten.x1 - kasten.x0);
  const kastenH = Math.max(1, kasten.y1 - kasten.y0);
  const passt = Math.min(Math.max(1, freiB) / kastenB, Math.max(1, freiH) / kastenH);
  let zoom = Math.max(ganze, Math.min(bevorzugt, passt, zoomMax));

  const mitte0 = { x: (kasten.x0 + kasten.x1) / 2, y: (kasten.y0 + kasten.y1) / 2 };
  const innen = Math.min(rahmen, 24);
  // Die Mitte des Kastens, soweit die Figur dabei im sicheren Bereich bleibt.
  const mitteFuer = z => figurMitte(mitte0, aktiv, z, karte, schirm, rand, pad, innen);
  let ansicht = begrenzeAnsicht({ ...mitteFuer(zoom), zoom }, karte, schirm, rand);
  let sicher = figurImSicheren(aktiv, ansicht, karte, schirm, rand, pad, innen);
  for (let i = 0; i < 16 && !sicher && zoom < zoomMax; i += 1) {
    zoom = Math.min(zoomMax, zoom * 1.1);
    ansicht = begrenzeAnsicht({ ...mitteFuer(zoom), zoom }, karte, schirm, rand);
    sicher = figurImSicheren(aktiv, ansicht, karte, schirm, rand, pad, innen);
  }
  // Die Figur selbst, nicht der Kasten, muss mittig genug stehen: Ist sie nach der
  // Klemmung im Rand, wurde oben schon hineingezoomt; sonst gilt die Ansicht.
  if (!sicher) sicher = figurImSicheren(aktiv, ansicht, karte, schirm, rand, pad, 0);
  return { ...ansicht, sicher };
}

/**
 * Der Ausschnitt beim Folgen eines Geschosses: weiche Verfolgung mit
 * Vorausschau, Zoom-Out bei großer Flugweite.
 *
 * Die Mitte liegt auf dem Geschoss plus `VORAUS_SEKUNDEN` Vorausschau
 * (höchstens ein Drittel der Sichtbreite). Der Zoom wird so gewählt, dass bei
 * wachsender Flugweite `d` (Abstand vom Abschusspunkt) die sichtbare Breite
 * mindestens 2,2·`d` ist: Der Abschusspunkt bleibt so lange im Bild, bis die
 * ganze Karte nötig ist. Bei mehreren Geschossen (Salve) gilt das Rechteck um alle.
 *
 * @param {object} p
 * @param {Array<{x:number,y:number}>} p.geschosse
 * @param {{x:number,y:number}} [p.tempo] Geschwindigkeit in Kartenpixel je Sekunde
 * @param {{x:number,y:number}} [p.ursprung] Abschusspunkt
 * @param {{b:number,h:number}} p.karte
 * @param {{b:number,h:number}} p.schirm
 * @param {{oben:number,unten:number,links:number,rechts:number}} p.rand
 * @param {number} [p.zoomMax]
 * @returns {{x:number,y:number,zoom:number}|null}
 */
export function flugAusschnitt({
  geschosse, tempo = { x: 0, y: 0 }, ursprung = null, karte, schirm, rand, zoomMax = ZOOM_GRENZEN.max,
}) {
  const kasten = umschliessend(geschosse ?? []);
  if (!kasten) return null;
  const ganze = Math.min(schirm.b / karte.b, schirm.h / karte.h);
  const bevorzugt = zoomBevorzugt(schirm, karte, { zoomMax });
  const sichtB = schirm.b / bevorzugt;

  // Vorausschau: nie mehr als ein Drittel der bevorzugten Sichtbreite.
  let vx = (tempo.x ?? 0) * VORAUS_SEKUNDEN;
  let vy = (tempo.y ?? 0) * VORAUS_SEKUNDEN;
  const laenge = Math.hypot(vx, vy);
  const grenze = sichtB / 3;
  if (laenge > grenze) { vx *= grenze / laenge; vy *= grenze / laenge; }

  const kopf = { x: (kasten.x0 + kasten.x1) / 2 + vx, y: (kasten.y0 + kasten.y1) / 2 + vy };
  const kastenB = kasten.x1 - kasten.x0 + Math.abs(vx);
  const kastenH = kasten.y1 - kasten.y0 + Math.abs(vy);

  let wunschB = sichtB;
  if (ursprung) {
    const d = Math.max(...geschosse.map(g => Math.hypot(g.x - ursprung.x, g.y - ursprung.y)));
    wunschB = Math.max(wunschB, 2.2 * d);
  }
  const freiB = schirm.b - rand.links - rand.rechts;
  const freiH = schirm.h - rand.oben - rand.unten;
  // Zoom: Flugweite (Breite) bestimmt; die Salve darf nicht aus dem Bild laufen.
  let zoom = schirm.b / Math.max(1, wunschB);
  zoom = Math.min(zoom, (freiB * 0.8) / Math.max(1, kastenB), (freiH * 0.8) / Math.max(1, kastenH));
  zoom = Math.max(ganze, Math.min(bevorzugt, zoom, zoomMax));
  return begrenzeAnsicht({ ...kopf, zoom }, karte, schirm, rand);
}

/**
 * Ob ein Kartenpunkt innerhalb des (verkleinerten) sichtbaren Bereichs liegt.
 * Für Bewegungsreduktion: Nur wenn das Geschoss diesen Bereich verlässt, wird geschnitten.
 */
export function imBild(punkt, ansicht, karte, schirm, rand, anteil = 0.8) {
  const p = kartenPunktImSchirm(punkt, ansicht, karte, schirm, rand);
  const mx = (rand.links + schirm.b - rand.rechts) / 2;
  const my = (rand.oben + schirm.h - rand.unten) / 2;
  const hb = ((schirm.b - rand.links - rand.rechts) / 2) * anteil;
  const hh = ((schirm.h - rand.oben - rand.unten) / 2) * anteil;
  return Math.abs(p.x - mx) <= hb && Math.abs(p.y - my) <= hh;
}

/**
 * Weg-Easing für große Wege: Je weiter das Ziel noch entfernt ist, desto mehr
 * wird herausgezoomt, damit die Kamera bei einem Zugwechsel nicht über die
 * ganze Karte „springt", sondern einen weichen Bogen fährt (heraus, hinüber,
 * wieder hinein). Mit `abstand` = 0 ist das Ergebnis `zoomZiel`.
 *
 * @param {number} zoomZiel gewünschter Zoom am Ziel
 * @param {number} abstand Kartenpixel bis zum Ziel (Betrag)
 * @param {number} schirmBreite Zeichenflächenbreite
 * @param {number} zoomUnten kleinster erlaubter Zoom (ganze Karte)
 */
export function bogenZoom(zoomZiel, abstand, schirmBreite, zoomUnten) {
  const sichtZiel = schirmBreite / zoomZiel;
  // Bis zu einer halben Sichtbreite Abstand bleibt alles beim Alten.
  const noetigB = Math.max(sichtZiel, 1.3 * Math.max(0, abstand) + 0.5 * sichtZiel);
  return Math.max(zoomUnten, Math.min(zoomZiel, schirmBreite / noetigB));
}

/** Multiplikator der Stoßstärke je Waffenkategorie. */
const STOSS_KATEGORIE = Object.freeze({
  melee: 0.4, ranged: 0.8, heavy_ranged: 1.2, ultimate: 1.4,
  magic: 1, elemental: 1, tech: 1, utility: 0.5,
});

/** Kleinster Bildschub in Bildschirmpixeln, unterhalb dessen gar nichts geschieht. */
const STOSS_MIN = 1.5;
/** Größter Bildschub in Bildschirmpixeln (Lesbarkeit: die Zielhilfe bleibt lesbar). */
const STOSS_MAX = 14;

/**
 * Der Bildschub nach einem Einschlag: Stärke und Dauer nach Explosionsradius
 * und Waffenkategorie.
 *
 * @param {{radius:number, kategorie?:string|null}} p
 * @returns {{amplitude:number, dauer:number}|null} `null`, wenn der Einschlag zu klein ist
 */
export function stossFuer({ radius, kategorie = null }) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= 0) return null;
  const faktor = STOSS_KATEGORIE[kategorie] ?? 1;
  const amplitude = Math.min(STOSS_MAX, (2 + r * 0.14) * faktor);
  if (amplitude < STOSS_MIN) return null;
  return { amplitude, dauer: 0.3 + amplitude * 0.02 };
}

/**
 * Der Schubverlauf: schneller Anstieg, weiches Ausklingen (0 → 1 → 0).
 * @param {number} t Sekunden seit dem Einschlag
 * @param {number} dauer Gesamtdauer
 */
export function stossKurve(t, dauer) {
  if (!(dauer > 0) || t <= 0 || t >= dauer) return 0;
  const k = t / dauer;
  if (k < 0.15) { const a = k / 0.15; return a * a * (3 - 2 * a); }
  const a = 1 - (k - 0.15) / 0.85;
  return a * a;
}

/**
 * Bildversatz (Bildschirmpixel) des Stoßes zum Zeitpunkt `t`: ein Schub in
 * Richtung `richtung` (vom Schützen zum Einschlag, normiert; fehlt sie: nach unten).
 */
export function stossVersatz(stoss, t, richtung = { x: 0, y: 1 }) {
  if (!stoss) return { x: 0, y: 0 };
  const k = stoss.amplitude * stossKurve(t, stoss.dauer);
  return { x: richtung.x * k, y: richtung.y * k };
}
