/**
 * Tod-Epilog Stufe 1 (FIGUREN-B, B4, nur Darstellung): letzter Spruch der Fraktion in einer Sprechblase über dem
 * Todesort, dazu ein kleiner Grabstein. Höchstens 1,2 s, jederzeit überspringbar (Taste oder Klick), und er hält
 * das Spiel NICHT an: Der Epilog ist ein kurzes Overlay und kein Spielzustand. Die Detonation beim Tod bleibt
 * der vorhandene Fall-Effekt (`figurEffekte.tod`, `fallPose`).
 *
 * Der Grabstein ist ausdrücklich kein Regelobjekt (B5 gestrichen): kein Eintrag in Engine, Karte oder Hash, nur ein
 * Bild über dem Spielfeld für die Dauer des Epilogs. Ein dauerhafter Grabstein in der Welt bräuchte eine Ebene im
 * Renderer; `renderer.js` ist am Zeilenbudget und bleibt dafür unberührt (siehe docs/TODO.md FIGUREN-B).
 *
 * @module todEpilog
 */

/** Längste Dauer in Sekunden (Vorgabe des Auftraggebers: 1,2 s, überspringbar). */
export const EPILOG_DAUER = 1.2;

/** Letzter Spruch je Fraktion (`FACTIONS[].id`). */
export const SPRUECHE = Object.freeze({
  xeno: 'Zisch … ich löse mich … auf.',
  rodentia: 'Klein … aber … ich war dabei.',
  pirates: 'Mein Schiff … gehört … dir.',
  machina: 'Fehler 404: Held nicht gefunden.',
  undead: 'Ich hatte schon … schlimmere Tage.',
  shinobi: 'Der Schatten … kehrt heim.',
  beasts: 'Das Rudel … rächt mich!',
  pixel: 'GAME OVER … insert coin.',
  datacult: 'Verbindung … getrennt …',
});

/** Spruch einer Fraktion; unbekannte Fraktionen bekommen einen neutralen. */
export function spruchFuer(fraktionId) {
  return SPRUECHE[fraktionId] ?? 'Das war’s … für mich.';
}

const GRABSTEIN_SVG = '<svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">'
  + '<path d="M3 25V10a8 8 0 0 1 16 0v15z" fill="#9aa3ad" stroke="#2b3138" stroke-width="1.6"/>'
  + '<path d="M11 8v9M7.5 11.5h7" stroke="#2b3138" stroke-width="1.8" stroke-linecap="round"/>'
  + '<path d="M1 25h20" stroke="#2b3138" stroke-width="2" stroke-linecap="round"/></svg>';

let aktuell = null;

/** Beendet den laufenden Epilog sofort (überspringen, Matchende, neuer Epilog). */
export function beendeEpilog() {
  if (!aktuell) return;
  const a = aktuell;
  aktuell = null;
  clearTimeout(a.timer);
  if (a.raf) cancelAnimationFrame(a.raf);
  globalThis.removeEventListener?.('keydown', a.skip, true);
  globalThis.removeEventListener?.('pointerdown', a.skip, true);
  a.box.remove();
}

/**
 * Zeigt den Epilog einer Figur.
 *
 * @param {object} p
 * @param {string|null} p.fraktionId
 * @param {() => ({x:number,y:number}|null)} p.ort - Bildschirmposition (CSS-Pixel, Fensterkoordinaten) des Todesorts
 *   (wird je Bild gerufen, damit die Blase der Kamera folgt); `null` = nicht sichtbar
 * @param {boolean} [p.reduziert] - weniger Bewegung: nur stehen lassen, kein Aufsteigen
 * @returns {boolean} true, wenn ein Epilog gestartet wurde
 */
export function starteEpilog({ fraktionId = null, ort, reduziert = false }) {
  try {
    if (typeof document === 'undefined' || typeof ort !== 'function') return false;
    beendeEpilog();
    const start = performance.now();
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.dataset.todEpilog = fraktionId ?? '';
    box.style.cssText = 'position:fixed;left:0;top:0;z-index:30;pointer-events:none;display:flex;flex-direction:column;'
      + 'align-items:center;gap:2px;transform:translate(-9999px,-9999px);transition:opacity .2s linear;opacity:1;';
    const blase = document.createElement('div');
    blase.textContent = spruchFuer(fraktionId);
    blase.style.cssText = 'max-width:200px;padding:5px 9px;border:2px solid #2b3138;border-radius:10px;background:#fffbe8;'
      + 'color:#1c1f24;font:600 12px/1.25 system-ui,sans-serif;text-align:center;box-shadow:0 2px 0 #2b3138;';
    const stein = document.createElement('div');
    stein.innerHTML = GRABSTEIN_SVG;
    box.append(blase, stein);
    document.body.append(box);
    const skip = () => beendeEpilog();
    aktuell = { box, skip, timer: setTimeout(beendeEpilog, EPILOG_DAUER * 1000), raf: 0 };
    globalThis.addEventListener?.('keydown', skip, true);
    globalThis.addEventListener?.('pointerdown', skip, true);
    const bild = () => {
      if (!aktuell || aktuell.box !== box) return;
      const t = (performance.now() - start) / 1000;
      const o = ort();
      if (o) {
        const steigen = reduziert ? 0 : Math.min(1, t / EPILOG_DAUER) * 14;
        const b = box.offsetWidth || 120;
        box.style.transform = `translate(${Math.round(o.x - b / 2)}px,${Math.round(o.y - (box.offsetHeight || 50) - 18 - steigen)}px)`;
      }
      box.style.opacity = t > EPILOG_DAUER - 0.25 ? String(Math.max(0, (EPILOG_DAUER - t) / 0.25)) : '1';
      aktuell.raf = requestAnimationFrame(bild);
    };
    bild();
    return true;
  } catch {
    return false;
  }
}

/**
 * Bildschirmposition eines Weltpunkts aus Kamera und Leinwand (Fensterkoordinaten, CSS-Pixel).
 * @param {{transformation:()=>{skalierung:number,versatzX:number,versatzY:number}}|null} kamera
 * @param {HTMLCanvasElement} leinwand
 * @param {number} cssFaktor - CSS-Pixel je Leinwandpixel
 */
export function weltZuFenster(kamera, leinwand, x, y, cssFaktor = 1) {
  if (!kamera || !leinwand?.getBoundingClientRect) return null;
  const t = kamera.transformation();
  const r = leinwand.getBoundingClientRect();
  const px = x * t.skalierung + t.versatzX;
  const py = y * t.skalierung + t.versatzY;
  const fx = r.left + px * cssFaktor;
  const fy = r.top + py * cssFaktor;
  return Number.isFinite(fx) && Number.isFinite(fy) ? { x: fx, y: fy } : null;
}
