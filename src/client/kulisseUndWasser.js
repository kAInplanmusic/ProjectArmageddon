/**
 * Kulisse und Wasser des Renderers.
 *
 * Der hintere Teil des Bildes (Himmel, Himmelskörper, Ambiente, Landmarken) und
 * die Wasserebene sind Darstellung ohne Spielzustand: Sie lesen Kulisse, Zeit
 * und Wassermaske und schreiben nur in eigene Ebenen. Ausgezogen aus
 * `renderer.js` am 2026-10-23, weil das Zeilenbudget (C-9,
 * `tests/zeilenbudget.test.js`) nach dem Zusammenführen der beiden Linien
 * gerissen war.
 *
 * Alle Funktionen bekommen den Renderer als erstes Argument (`r`) und arbeiten
 * auf dessen Ebenen und Feldern — es gibt keine zweite Ablage.
 *
 * @module kulisseUndWasser
 */
import { WATER_SCALE } from '../engine/match.js';
import { BACKDROP_URLS } from './kulissenUrls.js';
import { coverZuschnitt, glutStaerke } from './kulissenZuschnitt.js';
import { mischeRgb as mischeFarbe } from './stil.js';
import { SPIEGEL_TIEFE, spiegelFarbe, spiegelGewicht } from './wasserSpiegel.js';
import {
  drawSky as drawGenerativeSky,
  drawAmbient,
  drawLandmarks,
  drawWaterSurface,
} from './sceneryPainter.js';

/** Himmel über dem generativen Bild, wenn keine Kulisse geladen ist. */
const SKY_TOP = '#0d1b2a';
const SKY_BOTTOM = '#1b3a4b';

/** Die hintere Kulisse wird nur jedes n-te Bild neu gezeichnet (siehe `zeichneKulisse`). */
const KULISSE_BILDER = 3;
/** Anteil der Bildhöhe (von oben), in dem das bewegte Ambiente liegt; nur dieser Streifen wird aufgelegt. */
const KULISSE_BEWEGT_ANTEIL = 0.7;

  /**
   * Die hintere Kulisse (Himmel, Himmelskörper, Ambiente hinten, Landmarken) wird nur jedes
   * `KULISSE_BILDER`-te Bild neu gezeichnet und sonst als fertiges Bild aufgelegt.
   *
   * Messung (Audit 2026-10-13, Software-Rendering 1280×720, Canvas 2560×1440): `fill()` 43 ms und `fillRect`
   * 14 ms je Bild bei ~187 Aufrufen — fast alles aus dem Ambiente (Sterne, Wolken, Regen). Wolken und
   * Funkeln ändern sich langsam; mit jedem 2. Bild sieht man keinen Unterschied. Ohne `document`
   * (Tests) oder bei Größen-/Kulissenwechsel wird direkt gezeichnet bzw. neu aufgebaut.
   */
function zeichneKulisse(r) {
    const horizont = r.height * 0.47;
    const direkt = ctx => {
      drawGenerativeSky(ctx, r.width, r.height, r.scenery, r.time);
      drawAmbient(ctx, r.width, r.height, r.scenery, r.time, false);
      drawLandmarks(ctx, r.width, r.height, r.scenery, horizont);
    };
    if (typeof document === 'undefined') { direkt(r.ctx); return; }
    const schicht = (maßstab = 1, anteil = 1) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(r.width * maßstab);
      canvas.height = Math.ceil(r.height * anteil * maßstab);
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    };
    let c = r.kulissenSchicht;
    const neu = !c || c.scenery !== r.scenery || c.w !== r.width || c.h !== r.height;
    if (neu) {
      // Statisch: Himmel UND Silhouetten in EINER Ebene (ein Blit je Bild statt zwei). Bewegtes (Wolken, Sterne,
      // Dunst) liegt darüber in der zweiten — nur im oberen Teil des Bildes, dort liegt das ganze Ambiente hinten.
      const himmel = schicht();
      // Das bewegte Ambiente (weiche Wolken, Sterne, Dunst) in halber Auflösung und nur im oberen Streifen:
      // ein Fünftel der Pixel; beim Auflegen wird hochskaliert. Gemessen: das Auflegen kostete vorher 27 ms je Bild.
      const bewegt = schicht(0.5, KULISSE_BEWEGT_ANTEIL);
      if (!himmel || !bewegt) { direkt(r.ctx); return; }
      drawGenerativeSky(himmel.ctx, r.width, r.height, r.scenery, 0);
      drawLandmarks(himmel.ctx, r.width, r.height, r.scenery, horizont);
      c = r.kulissenSchicht = { himmel, bewegt, scenery: r.scenery, w: r.width, h: r.height, zeit: -Infinity };
    }
    if (neu || r.time - c.zeit >= KULISSE_BILDER || r.time < c.zeit) {
      c.bewegt.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.bewegt.ctx.clearRect(0, 0, c.bewegt.canvas.width, c.bewegt.canvas.height);
      c.bewegt.ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      drawAmbient(c.bewegt.ctx, c.w, c.h, r.scenery, r.time, false);
      c.bewegt.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.zeit = r.time;
    }
    r.ctx.drawImage(c.himmel.canvas, 0, 0, r.width, r.height);
    const oben = Math.ceil(r.height * KULISSE_BEWEGT_ANTEIL);
    r.ctx.drawImage(c.bewegt.canvas, 0, 0, c.bewegt.canvas.width, c.bewegt.canvas.height, 0, 0, r.width, oben);
  }

  /** Lädt die Hochkant-Fassung der Kulisse einmalig und nur bei Bedarf. */
function ladeHochBild(r, backdrop) {
    if (r.backdropHochBild?.key === backdrop.key) return;
    const url = BACKDROP_URLS[`./assets/backdrops/${backdrop.fileHoch}`];
    const eintrag = { key: backdrop.key, bild: null, bereit: false };
    r.backdropHochBild = eintrag;
    if (!url) return;
    const bild = new Image();
    bild.decoding = 'async';
    bild.onload = () => { eintrag.bild = bild; eintrag.bereit = true; };
    bild.src = url;
  }

  /**
   * Die fertig zugeschnittene Kulisse (Bild, Glut, Abdunkelung nach unten) als eigene Zeichenfläche.
   *
   * Vorher wurde das Bild jedes Bild neu auf Fenstergröße skaliert und zweimal überfüllt
   * (Glut, Abdunkelung): in Software-Rasterung rund 20 ms je Bild. Der Verlauf ist in x
   * gleichförmig, deshalb kann er in die (breitere) Fläche eingebacken werden; die Kamera
   * schiebt nur den Ausschnitt (`pan`). Neu gebaut wird nur bei anderem Bild, anderer Größe
   * oder anderer Glutstufe (ändert sich einmal je Runde).
   *
   * @returns {{canvas: HTMLCanvasElement, breite: number}}
   */
/**
 * LOOK-2 (2026-10-25), Tiefenstaffel: Die Kulisse tritt zurück, damit das
 * scharfe Spielgelände die vorderste Ebene bleibt.
 *
 * Gemessen am 2026-10-25 über `src/client/assets/backdrops/*.jpg`: die mittlere
 * Sättigung liegt zwischen 0,28 (Kloster) und 0,87 (abstrakt-psychedelisch).
 * Die hohen Werte konkurrieren mit dem Gelände. Deshalb wird NICHT pauschal
 * entsättigt (das macht Fotokulissen tot), sondern nur so weit, bis der Deckel
 * erreicht ist — Faktor 1,0 für Bilder, die schon darunter liegen.
 */
const SAETTIGUNG_DECKEL = 0.45;
const SAETTIGUNGS_FAKTOR = new WeakMap();

/** Sättigungsfaktor je Bild, einmal aus einer 64×36-Probe gerechnet. */
function saettigungsFaktor(img) {
  const bekannt = SAETTIGUNGS_FAKTOR.get(img);
  if (bekannt !== undefined) return bekannt;
  let faktor = 1;
  try {
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const g = probe.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0, 64, 36);
      const daten = g.getImageData(0, 0, 64, 36).data;
      let summe = 0;
      let n = 0;
      for (let i = 0; i < daten.length; i += 4) {
        const r = daten[i] / 255;
        const gg = daten[i + 1] / 255;
        const b = daten[i + 2] / 255;
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        if (max <= 0.05) continue;
        summe += (max - min) / max;
        n += 1;
      }
      const s = n > 0 ? summe / n : 0;
      if (s > SAETTIGUNG_DECKEL) faktor = SAETTIGUNG_DECKEL / s;
    }
  } catch {
    // Ohne Bilddaten (z. B. Canvas gesperrt) bleibt die Kulisse unverändert.
    faktor = 1;
  }
  SAETTIGUNGS_FAKTOR.set(img, faktor);
  return faktor;
}

/**
 * Baut (und merkt sich) die fertige Kulissenfläche: Zuschnitt für Stimmungsbilder,
 * Sättigungsdeckel (LOOK-2), Glut der Ragnarök-Stimmungen und Abdunkelung nach unten.
 * Neu gebaut wird nur bei anderem Bild, anderer Größe oder anderer Glutstufe.
 *
 * @param {object} r Renderer (Breite, Höhe, Cache)
 * @param {HTMLImageElement} img geladene Kulisse
 * @param {boolean} stimmung Stimmungsbild (cover-Zuschnitt) oder Vollbild
 * @param {number} glut Glutstärke 0…1
 * @returns {{canvas: HTMLCanvasElement, breite: number}}
 */
function kulissenBild(r, img, stimmung, glut) {
    const w = r.width;
    const h = r.height;
    const glutKey = glut > 0 ? glut.toFixed(3) : '';
    const c = r.kulissenCache;
    if (c && c.img === img && c.w === w && c.h === h && c.stimmung === stimmung && c.glutKey === glutKey) return c;

    const bw = img.naturalWidth || img.width;
    const bh = img.naturalHeight || img.height;
    const z = stimmung ? coverZuschnitt(bw, bh, w, h, 0) : null;
    const breite = z ? Math.max(w, Math.ceil(bw * (w / z.sb))) : w;
    const canvas = c?.canvas ?? document.createElement('canvas');
    canvas.width = breite;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // LOOK-2: Kulisse hinter das Gelände legen (Sättigungsdeckel, s. o.).
    const saettigung = saettigungsFaktor(img);
    if (saettigung < 1) ctx.filter = `saturate(${saettigung.toFixed(3)})`;
    if (z) ctx.drawImage(img, 0, z.sy, bw, z.sh, 0, 0, breite, h);
    else ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
    if (glut > 0) {
      ctx.fillStyle = `rgba(255,70,20,${glutKey})`;
      ctx.fillRect(0, 0, breite, h);
    }
    /*
     * Abdunkelung nach unten.
     *
     * Ohne sie verschwinden Figuren, Lebensbalken und Munitionsanzeige vor
     * hellen Kulissen (Schnee, Wüste, Sonnenuntergang) — das Spiel wäre dort
     * spielbar, aber nicht lesbar. Der Verlauf ist unten am stärksten, weil
     * dort die Figuren stehen, und oben fast durchsichtig, damit die Kulisse
     * sichtbar bleibt.
     */
    const daempfung = ctx.createLinearGradient(0, h * 0.35, 0, h);
    daempfung.addColorStop(0, 'rgba(8,14,24,0)');
    daempfung.addColorStop(0.55, 'rgba(8,14,24,0.28)');
    daempfung.addColorStop(1, 'rgba(8,14,24,0.55)');
    ctx.fillStyle = daempfung;
    ctx.fillRect(0, 0, breite, h);
    return (r.kulissenCache = { img, w, h, stimmung, glutKey, canvas, breite });
  }

export function zeichneHimmel(r) {
    // Generative Kulisse hat Vorrang: sie passt sich jeder Kartengröße an.
    if (r.scenery) {
      zeichneKulisse(r);
      return;
    }

    // Kulisse, sobald geladen. Sie liegt HINTER dem Terrain: der Boden wird
    // danach darübergezeichnet und verdeckt die untere Bildhälfte.
    if (r.backdropReady && r.backdropImage) {
      let img = r.backdropImage;
      const stimmung = Boolean(r.backdrop?.stimmung);
      let pan = 0.5;
      let glut = 0;
      if (stimmung) {
        // Stimmungsbilder haben wechselnde Formate: cover-Zuschnitt, kein Stauchen.
        // Hochformat (Seitenverhältnis < 1): die Hochkant-Fassung, sobald geladen (lazy).
        if (r.width < r.height && r.backdrop.fileHoch) {
          ladeHochBild(r, r.backdrop);
          if (r.backdropHochBild?.key === r.backdrop.key && r.backdropHochBild.bereit) {
            img = r.backdropHochBild.bild;
          }
        }
        const k = r.kamera;
        if (k?.scrolltHorizontal) {
          const t = k.transformation({ ohneStoss: true });
          const spanne = k.karte.b * t.skalierung - k.schirm.b;
          if (spanne > 0) pan = -t.versatzX / spanne;
        }
        // Rein optisch: Glut der Ragnarök-Stimmungen steigert sich mit dem Rundenverlauf.
        if (String(r.backdrop.id).includes('ragnarok')) glut = glutStaerke(r.rundeFuerKulisse);
      }
      // Zuschnitt, Glut und Abdunkelung sind je Bild gleich: einmal vorgerechnet, je Bild nur ein 1:1-Ausschnitt.
      const fertig = kulissenBild(r, img, stimmung, glut);
      const sx = Math.round(Math.max(0, fertig.breite - r.width) * Math.min(1, Math.max(0, pan)));
      r.ctx.drawImage(fertig.canvas, sx, 0, r.width, r.height, 0, 0, r.width, r.height);
      return;
    }

    const gradient = r.ctx.createLinearGradient(0, 0, 0, r.height);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(1, SKY_BOTTOM);
    r.ctx.fillStyle = gradient;
    r.ctx.fillRect(0, 0, r.width, r.height);

    // Deterministische Sternpunkte als statischer Hintergrund.
    r.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % r.width;
      const y = (i * 71) % Math.round(r.height * 0.5);
      r.ctx.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Farbe des Wassers an einer Stelle.
   * Ohne Kulisse bleibt es beim bisherigen Blau.
   */
function wasserFarbe(r, tiefe) {
    const art = r.scenery?.water;
    if (!art) return [42, 122, 176];
    const flach = art.shallow;
    const tief = art.body;
    // Zur dunklen Palette hin abgedunkelt (#0D0F12), Tönung bleibt.
    const dunkel = (kanal, ziel) => Math.round(kanal + (ziel - kanal) * 0.35);
    return [
      dunkel(Math.round(flach[0] + (tief[0] - flach[0]) * tiefe), 13),
      dunkel(Math.round(flach[1] + (tief[1] - flach[1]) * tiefe), 15),
      dunkel(Math.round(flach[2] + (tief[2] - flach[2]) * tiefe), 18),
    ];
  }

  /**
   * Uferkarte des Wassers: je Wasserzelle, ob dort Gelände steht.
   *
   * Aus der gebackenen Geländeebene (der sichtbaren Wahrheit, mit allen Kratern) auf Wassergröße
   * verkleinert. Neu gebaut wird nur, wenn sich die Ebene oder der letzte Krater geändert hat
   * (oder alle 120 Bilder für den Mahlstrom-Rand) — nie jedes Bild.
   */
function uferMaske(r) {
    const schicht = r.terrainLayer;
    if (!schicht || typeof document === 'undefined') return null;
    const w = r.waterLayer.width;
    const h = r.waterLayer.height;
    let u = r.uferStand;
    if (!u || u.schicht !== schicht || u.krater !== r.letzterKrater || u.w !== w || u.h !== h || r.time - u.zeit > 120) {
      const c = u?.canvas && u.w === w && u.h === h ? u.canvas : document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return null;
      cx.drawImage(schicht, 0, 0, w, h);
      const daten = cx.getImageData(0, 0, w, h).data;
      const maske = u?.maske?.length === w * h ? u.maske : new Uint8Array(w * h);
      for (let i = 0; i < maske.length; i += 1) maske[i] = daten[i * 4 + 3] > 110 ? 1 : 0;
      u = { schicht, krater: r.letzterKrater, w, h, zeit: r.time, canvas: c, maske };
      r.uferStand = u;
    }
    return u.maske;
  }

  /**
   * Wasser zeichnen.
   *
   * Die Wasserebene (Farben, Wellen, Schaum) wird nur alle paar Bilder neu BERECHNET (`neu`), aber
   * JEDES Bild aufgelegt. Zuvor kam `water` nur in jedem vierten Bild an und alles andere übersprang
   * das Zeichnen — das Wasser blinkte mit 15 Hz (belegt: 4 `putImageData` auf 16 Bilder).
   *
   * @param {object|null} water - WaterField des Matches
   * @param {boolean} neu - Ebene neu berechnen (sonst die zuletzt berechnete auflegen)
   */
export function zeichneWasser(r, water, neu = true) {
    if (!water) return;
    if (!neu && r.wasserFertig) {
      legeWasserAuf(r);
      return;
    }
    r.wasserFertig = true;
    r.waterCtx.clearRect(0, 0, r.waterLayer.width, r.waterLayer.height);
    // Der Puffer wird wiederverwendet (statt je Neuberechnung ~Megabytes neu anzulegen); nasse Zellen
    // überschreiben alle vier Kanäle, trockene müssen durchsichtig sein.
    let image = r.wasserBild;
    if (image?.width !== r.waterLayer.width || image.height !== r.waterLayer.height) {
      image = r.wasserBild = r.waterCtx.createImageData(r.waterLayer.width, r.waterLayer.height);
    } else {
      image.data.fill(0);
    }
    const data = image.data;
    const levels = water.levels;
    const bg = r.waterLayer.width;
    const hg = r.waterLayer.height;

    /*
     * Ein Durchlauf, der alles Wasser-Aussehen mitnimmt (keine zusätzliche Ebene):
     *  - Tiefenverlauf: je Spalte zählt `lauf` die Zellen unter dem Spiegel; flach hell, tief dunkel.
     *  - Glanz und sanfte Wellen in den obersten Zellen (Phase aus Zeit und Spalte).
     *  - Schaum dort, wo am Spiegel Gelände neben dem Wasser steht (Uferkarte).
     * Die Farbstufen je Tiefe sind einmal je Bild vorgerechnet, nicht je Zelle.
     */
    const art = r.scenery?.water ?? null;
    const STUFEN = 26;
    const stufen = new Array(STUFEN);
    for (let k = 0; k < STUFEN; k += 1) stufen[k] = wasserFarbe(r, Math.min(1, k / (STUFEN - 1)));
    const glanz = art ? mischeFarbe(art.shallow, [255, 255, 255], 0.8) : [226, 244, 255];
    const schaum = art ? mischeFarbe(art.shallow, [255, 255, 255], 0.82) : [240, 248, 255];
    const alphaArt = art?.alpha ?? 1;
    const phase = r.reducedMotion ? 0 : r.time * 0.05;
    const ufer = uferMaske(r);
    const spiegel = r.spiegelung ? spiegelFarbe(r.scenery) : null;
    const lauf = r.wasserLauf?.length === bg ? r.wasserLauf : (r.wasserLauf = new Int16Array(bg));
    const oben = r.wasserOben?.length === bg ? r.wasserOben : (r.wasserOben = new Int16Array(bg));
    lauf.fill(-1);
    oben.fill(-1);
    // Umschließendes Rechteck der nassen Zellen: Nur dieses Stück wird später aufgelegt.
    let nx0 = bg; let nx1 = -1; let ny0 = hg; let ny1 = -1;

    for (let y = 0; y < hg; y += 1) {
      const zeile = y * bg;
      for (let x = 0; x < bg; x += 1) {
        const i = zeile + x;
        const level = levels[i];
        if (level <= 0.02) { lauf[x] = -1; continue; }
        const k = lauf[x] + 1;
        if (x < nx0) nx0 = x;
        if (x > nx1) nx1 = x;
        if (y < ny0) ny0 = y;
        if (y > ny1) ny1 = y;
        if (k === 0) { if (oben[x] < 0) oben[x] = y; }
        lauf[x] = k;
        const f = stufen[k < STUFEN ? k : STUFEN - 1];
        let r = f[0];
        let g = f[1];
        let b = f[2];
        let a = Math.round(Math.min(0.72, level) * 210 * alphaArt);
        if (k < 14) {
          // Sanfte Wellen: Helligkeit schwingt mit Spalte, Tiefe und Zeit, nach unten abklingend.
          const m = Math.sin(x * 0.42 + k * 0.85 + phase) * 0.075 * (1 - k / 14);
          r += r * m; g += g * m; b += b * m;
          if (k < 5) {
            // Glanz am Spiegel, in der Spalte unruhig.
            const gl = (5 - k) / 5 * (0.5 + 0.4 * Math.sin(x * 0.9 - phase * 1.7));
            r += (glanz[0] - r) * gl; g += (glanz[1] - g) * gl; b += (glanz[2] - b) * gl;
            a += (255 - a) * gl * 0.4;
          }
          if (ufer && k < 9 && (ufer[i - 1] || ufer[i + 1] || (k < 4 && (ufer[i - bg] || ufer[i - 2 * bg])))) {
            // Schaumsaum am Ufer: stärker am Spiegel, mit Brandung (die Breite pulsiert leicht).
            const sf = (1 - k / 9) * (0.62 + 0.3 * Math.sin(x * 0.2 + phase * 2.3));
            if (sf > 0) {
              r += (schaum[0] - r) * sf; g += (schaum[1] - g) * sf; b += (schaum[2] - b) * sf;
              a += (255 - a) * sf * 0.7;
            }
          }
        }
        if (spiegel && k < SPIEGEL_TIEFE) {
          const w = spiegelGewicht(x, k, phase);
          r += (spiegel[0] - r) * w; g += (spiegel[1] - g) * w; b += (spiegel[2] - b) * w;
        }
        const index = i * 4;
        data[index] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[index + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[index + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        data[index + 3] = a > 255 ? 255 : a;
      }
    }
    r.waterCtx.putImageData(image, 0, 0);
    // Zwei Zellen Rand: Das Hochskalieren der Ebene blendet an der Kante in Transparent aus.
    r.wasserRahmen = nx1 < 0 ? null : {
      x0: Math.max(0, nx0 - 2), y0: Math.max(0, ny0 - 2), x1: Math.min(bg, nx1 + 3), y1: Math.min(hg, ny1 + 3),
    };
    legeWasserAuf(r);
  }

  /** Legt die berechnete Wasserebene samt Oberflächenstruktur auf das Bild. */
function legeWasserAuf(r) {
    const rahmen = r.wasserRahmen;
    if (rahmen) {
      r.ctx.save();
      r.ctx.globalAlpha = 0.88;
      // Nur das Rechteck mit Wasser (die Ebene ist sonst durchsichtig, aber ein ganzes Bild groß).
      const sx = r.width / r.waterLayer.width;
      const sy = r.height / r.waterLayer.height;
      r.ctx.drawImage(r.waterLayer, rahmen.x0, rahmen.y0, rahmen.x1 - rahmen.x0, rahmen.y1 - rahmen.y0, rahmen.x0 * sx, rahmen.y0 * sy, (rahmen.x1 - rahmen.x0) * sx, (rahmen.y1 - rahmen.y0) * sy);
      r.ctx.restore();
    }

    // Struktur der Wasserart NACH der Fläche: Kruste, Wellen, Blasen und Sterne
    // liegen auf dem Wasser, nicht darunter — an den Spiegel der Spalten geheftet.
    if (r.scenery) {
      drawWaterSurface(r.ctx, r.width, r.height, r.scenery, r.time, { oben: r.wasserOben, skala: WATER_SCALE });
    }
  }

