/**
 * Lader der Waffen-Sprite-Atlanten (nur Darstellung).
 *
 * `src/client/assets/weapon-sprites/` enthält je Kategorie einen Atlas
 * (`atlas_<kategorie>.png`), einen Icon-Atlas und `manifest.json` (Zellen,
 * Anker, Blitzfarbe, Geschossdaten). Geladen wird LAZY: Das Manifest beim
 * ersten Bedarf, ein Kategorie-Atlas erst, wenn eine Waffe dieser Kategorie
 * gezeichnet werden soll. Je Waffe entstehen einmal kleine Zeichenflächen
 * (Waffe, Silhouette, Farb- und Dunkelfassung, Glanzpunkt, Geschoss); danach
 * kostet jeder Zugriff nur noch einen Map-Nachschlag, ohne Allokation je Bild.
 *
 * Fällt etwas aus (Manifest oder Atlas nicht ladbar, Waffe nicht im Manifest),
 * liefert `hole` dauerhaft `null`, und der Renderer zeichnet das bisherige Icon.
 *
 * Die Abhängigkeiten (Bild laden, Leinwand anlegen, URLs) sind einsetzbar,
 * damit die Logik ohne Browser prüfbar ist (`erzeugeWaffenSprites`).
 *
 * Zusatzanimationen (`weapon-sprites/anim/`) werden hier absichtlich nicht
 * geladen. Die 26 Blätter sind seit 2026-11-11 gelöscht (N-12, nur das Protokoll `manifest.json` bleibt);
 * neue Blätter blieben bis zur Rollen- und Identitätsabnahme gesperrt (W05/W11); Rollen, Sperre und Abnahmekriterien stehen in `waffenAnim.js`,
 * der Stand in `docs/waffen-audit-2026-11-08/ANIM-GATING.md`.
 *
 * @module waffenSprites
 */

import { ladeBild, neueLeinwand } from './dom.js';
import { ZELLE } from './waffenAnimation.js';

/** Kantenlänge der gecachten Waffenzellen (Atlas: 128 px; für die Anzeige genügt die Hälfte). */
export const CACHE_KANTE = 64;
/** Kantenlänge der Geschosszellen im Atlas und im Cache. */
const GESCHOSS_KANTE = 32;
const GLANZ_KANTE = 32;

/*
 * Die Neigung der Achse Griff -> Mündung ist die Achse der Waffe selbst (Anker aus
 * `scripts/waffen-anker-tabelle.json`). Sie wird deshalb nicht mehr auf einen
 * "plausiblen" Bereich begrenzt: eine Begrenzung ließ die Mündung bei schrägen
 * Rohren neben dem Zielstrahl liegen. Die Schranke unten fängt nur fehlerhafte
 * Daten ab (eine Waffe, deren Mündung hinter dem Griff liegt) und ist kein
 * Ausrichtungs-Toleranzwert; `tests/waffen-anker.test.js` verlangt für alle 150
 * Waffen eine Neigung unter 0,6 rad.
 */
const MAX_ACHSE = 1.35;
const STANDARD_GRIFF = { x: 38, y: 64 };
const STANDARD_MUENDUNG = { x: 118, y: 64 };

/**
 * Wie die Zellen einer Waffe im Atlas liegen (rein, ohne Zeichnen).
 *
 * @param {object} manifest
 * @param {string} id
 * @returns {object|null} `null`, wenn die Waffe oder ihre Zelle fehlt
 */
export function zellenFuer(manifest, id) {
  const w = manifest?.waffen?.[id];
  if (!w?.held || !w.silhouette) return null;
  /*
   * Die Anker sind gesetzt, nicht geschätzt: `heft` nennt den Punkt, an dem die Hand
   * greift, `muzzle` das tatsächliche Ende (Quelle `scripts/waffen-anker-tabelle.json`).
   * `halt` unterscheidet Waffen mit eigenem Heft von solchen, die am Körper gehalten
   * werden (Griff = Schwerpunkt); `heftSpanne` ist der belegte Heftbereich.
   */
  const grip = w.anchor?.grip ?? STANDARD_GRIFF;
  const muzzle = w.anchor?.muzzle ?? STANDARD_MUENDUNG;
  /*
   * BAL-11: Rolle und Wirkpfad stehen im Manifest (Quelle
   * `src/shared/config/waffen-rollen.js`). Nur ein echter Projektilpfad darf
   * die Geschosszelle als Flugbild benutzen: 96 Waffen tragen eine Zelle,
   * aber neun davon sind Aufstell-/Selbstwirkungen; ihre Zelle ist
   * Begleitmaterial (`eigenerPfad: false`) und wird hier nicht als Projektil
   * durchgereicht.
   */
  const geschossbild = w.projectile ?? null;
  const projekt = geschossbild && geschossbild.eigenerPfad !== false ? geschossbild : null;
  return {
    atlas: w.held.atlas,
    held: w.held,
    silhouette: w.silhouette,
    projectile: projekt,
    /** Geschosszelle, auch wenn sie nur Begleitbild ist (Diagnose/Tests). */
    geschossbild,
    rolle: typeof w.rolle === 'string' ? w.rolle : null,
    wirkpfad: typeof w.wirkpfad === 'string' ? w.wirkpfad : null,
    grip,
    muzzle,
    halt: typeof w.anchor?.halt === 'string' ? w.anchor.halt : 'koerper',
    heftSpanne: Array.isArray(w.anchor?.heft) ? w.anchor.heft : [grip.x, grip.x],
    quelle: typeof w.anchor?.source === 'string' ? w.anchor.source : '',
    /** Mündung in der Ankertabelle gesetzt (Rohr erreicht den Zellrand nicht). */
    fest: w.anchor?.fest === true,
    flashColor: typeof w.flashColor === 'string' ? w.flashColor : '#ffd166',
    form: typeof w.form === 'string' ? w.form : '',
    kachel: w.form === 'kachel' && typeof w.kachel?.modus === 'string' ? w.kachel.modus : '',
  };
}

/**
 * Erzeugt einen Sprite-Lader.
 *
 * @param {object} abh
 * @param {() => Promise<object>} abh.ladeManifest
 * @param {(datei: string) => (string|Promise<string>)} abh.atlasUrl
 * @param {(url: string) => Promise<CanvasImageSource>} abh.ladeBild
 * @param {(b: number, h: number) => any} abh.neueLeinwand
 */
export function erzeugeWaffenSprites(abh) {
  /** @type {object|null|'laedt'|'fehlt'} */
  let manifest = null;
  /** Atlasname -> Bild | 'laedt' | 'fehlt' */
  const atlanten = new Map();
  /** Waffen-ID -> Eintrag | 'fehlt' */
  const eintraege = new Map();
  /** Waffen-ID -> Kategorie, die noch auf ihren Atlas wartet. */
  const wartend = new Map();
  const stat = { manifestLadungen: 0, atlasLadungen: 0, ausgeschnitten: 0 };

  function kopie(quelle, z, kante) {
    const c = abh.neueLeinwand(kante, kante);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(quelle, z.x, z.y, z.w, z.h, 0, 0, kante, kante);
    return c;
  }

  /** Füllt eine Silhouette (weiß) mit einer Farbe. */
  function faerbe(silhouette, farbe) {
    const c = abh.neueLeinwand(CACHE_KANTE, CACHE_KANTE);
    const g = c.getContext('2d');
    g.drawImage(silhouette, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = farbe;
    g.fillRect(0, 0, CACHE_KANTE, CACHE_KANTE);
    return c;
  }

  /** Weicher Lichtpunkt in der Blitzfarbe (für Glanz und Blitzkern). */
  function glanzpunkt(farbe) {
    const c = abh.neueLeinwand(GLANZ_KANTE, GLANZ_KANTE);
    const g = c.getContext('2d');
    const m = GLANZ_KANTE / 2;
    const v = g.createRadialGradient(m, m, 0, m, m, m);
    v.addColorStop(0, '#ffffff');
    v.addColorStop(0.3, farbe);
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, GLANZ_KANTE, GLANZ_KANTE);
    return c;
  }

  function schneide(id, atlas) {
    const z = zellenFuer(manifest, id);
    if (!z) { eintraege.set(id, 'fehlt'); return; }
    try {
      const faktor = CACHE_KANTE / ZELLE;
      const silhouette = kopie(atlas, z.silhouette, CACHE_KANTE);
      const dx = z.muzzle.x - z.grip.x;
      const dy = z.muzzle.y - z.grip.y;
      const winkel = Math.atan2(dy, dx);
      const achse = Math.max(-MAX_ACHSE, Math.min(MAX_ACHSE, winkel));
      const laenge = Math.hypot(dx, dy);
      const gesamt = {
        id,
        held: kopie(atlas, z.held, CACHE_KANTE),
        silhouette,
        farbig: faerbe(silhouette, z.flashColor),
        dunkel: faerbe(silhouette, '#05070a'),
        glanz: glanzpunkt(z.flashColor),
        projektil: z.projectile ? kopie(atlas, z.projectile, GESCHOSS_KANTE) : null,
        projektilInfo: z.projectile ? { art: z.projectile.art, spin: z.projectile.spin === true, angle: z.projectile.angle ?? 0 } : null,
        /** Anker in Zellenpixeln des 128er-Rasters (0,0 = links oben). */
        grip: { x: z.grip.x, y: z.grip.y },
        muzzle: { x: z.muzzle.x, y: z.muzzle.y },
        /**
         * Neigung der Achse Griff -> Mündung in der Zelle (Radiant, begrenzt). Die Waffe wird um
         * den Griff so gedreht, dass die Mündung auf dem Zielstrahl liegt; `mx`/`my` ist die
         * Mündung in diesem ausgerichteten Rahmen (Zellpixel ab dem Griff).
         */
        achse,
        mx: laenge * Math.cos(winkel - achse),
        my: laenge * Math.sin(winkel - achse),
        /** `heft` = eigenes Heft, `koerper` = am Körper gehalten (Griff = Schwerpunkt). */
        halt: z.halt,
        /** BAL-11: dokumentierte Rolle (Hand/Rücken/Aufstell/Beschwörung/Symbol). */
        rolle: z.rolle,
        /** BAL-11: Projektil/Strahl/Selbst — getrennt von der Rolle. */
        wirkpfad: z.wirkpfad,
        /** Geschosszelle vorhanden, auch wenn sie nur Begleitbild ist. */
        geschossbild: z.geschossbild,
        /** Belegter Heftbereich [x0, x1] in Zellpixeln (nur bei `halt: 'heft'` eine echte Spanne). */
        heft: z.heftSpanne,
        quelle: z.quelle,
        /** Mündung aus der Ankertabelle gesetzt statt am Rand der Zelle (schräge Rohre). */
        fest: z.fest,
        flashColor: z.flashColor,
        form: z.form,
        kachel: z.kachel,
        faktor,
      };
      eintraege.set(id, gesamt);
      stat.ausgeschnitten += 1;
    } catch {
      eintraege.set(id, 'fehlt');
    }
  }

  function atlasBereit(name) {
    for (const [id, kat] of wartend) {
      const z = zellenFuer(manifest, id);
      const atlasName = z?.atlas ?? kat;
      if (atlasName !== name) continue;
      wartend.delete(id);
      const a = atlanten.get(atlasName);
      if (typeof a === 'object') schneide(id, a);
      else eintraege.set(id, 'fehlt');
    }
  }

  function ladeAtlas(name) {
    if (atlanten.has(name)) return;
    atlanten.set(name, 'laedt');
    stat.atlasLadungen += 1;
    const datei = manifest?.atlanten?.[name]?.datei ?? `atlas_${name}.png`;
    Promise.resolve(abh.atlasUrl(datei)).then(url => abh.ladeBild(url)).then(
      (img) => { atlanten.set(name, img); atlasBereit(name); },
      () => { atlanten.set(name, 'fehlt'); atlasBereit(name); },
    );
  }

  function verarbeiteWartende() {
    for (const [id, kat] of wartend) {
      const z = zellenFuer(manifest, id);
      if (!z) { eintraege.set(id, 'fehlt'); wartend.delete(id); continue; }
      const a = atlanten.get(z.atlas ?? kat);
      if (a === undefined) ladeAtlas(z.atlas ?? kat);
      else if (typeof a === 'object') { wartend.delete(id); schneide(id, a); }
      else if (a === 'fehlt') { wartend.delete(id); eintraege.set(id, 'fehlt'); }
    }
  }

  function ladeManifest() {
    if (manifest !== null) return;
    manifest = 'laedt';
    stat.manifestLadungen += 1;
    abh.ladeManifest().then(
      (m) => {
        manifest = m && typeof m === 'object' && m.waffen ? m : 'fehlt';
        if (manifest === 'fehlt') { for (const id of wartend.keys()) eintraege.set(id, 'fehlt'); wartend.clear(); return; }
        verarbeiteWartende();
      },
      () => {
        manifest = 'fehlt';
        for (const id of wartend.keys()) eintraege.set(id, 'fehlt');
        wartend.clear();
      },
    );
  }

  return {
    /**
     * Der Sprite-Eintrag einer Waffe oder `null`, solange er nicht bereit ist
     * (der erste Aufruf stößt das Laden an) bzw. dauerhaft, wenn er fehlt.
     *
     * @param {{id:string, category?:string}|null} waffe
     */
    hole(waffe) {
      if (!waffe) return null;
      const e = eintraege.get(waffe.id);
      if (e !== undefined) return typeof e === 'object' ? e : null;
      eintraege.set(waffe.id, 'laedt');
      wartend.set(waffe.id, waffe.category ?? '');
      if (manifest === null) ladeManifest();
      else if (typeof manifest === 'object') verarbeiteWartende();
      else if (manifest === 'fehlt') { eintraege.set(waffe.id, 'fehlt'); wartend.delete(waffe.id); }
      return null;
    },

    /** Lädt die Sprites der Waffen vor (z. B. die eines Loadouts), ohne zu blockieren. */
    ladeVor(waffen) {
      for (const w of waffen) this.hole(w);
    },

    /** Diagnose: Zähler und Zustand (für Tests und die Debug-Schnittstelle). */
    zustand() {
      return {
        manifest: typeof manifest === 'object' && manifest !== null ? 'bereit' : manifest,
        atlanten: Object.fromEntries([...atlanten].map(([k, v]) => [k, typeof v === 'object' ? 'bereit' : v])),
        bereit: [...eintraege].filter(([, v]) => typeof v === 'object').length,
        fehlt: [...eintraege].filter(([, v]) => v === 'fehlt').length,
        ...stat,
      };
    },
  };
}

// ---------------------------------------------------------- Standardverdrahtung

/** Der Lader des Spiels. */
const waffenSpritesLader = erzeugeWaffenSprites({
  // Das Manifest ist ein eigener, lazy geladener Chunk; die Atlanten werden je Kategorie erst bei Bedarf geholt.
  ladeManifest: () => import('./assets/weapon-sprites/manifest.json').then(m => m.default),
  atlasUrl: async (datei) => {
    const lader = import.meta.glob('./assets/weapon-sprites/*.png', { query: '?url', import: 'default' });
    const f = lader[`./assets/weapon-sprites/${datei}`];
    if (!f) throw new Error(`Atlas fehlt: ${datei}`);
    return f();
  },
  ladeBild: url => ladeBild(url, 'Atlas nicht ladbar'),
  neueLeinwand,
});

/**
 * Der Sprite-Eintrag einer Waffe für die Hand und den Flug oder `null`
 * (nicht geladen oder nicht vorhanden: dann das Icon).
 */
export function holeWaffenSprite(waffe) {
  return waffenSpritesLader.hole(waffe);
}

/** Zustand des Laders (Diagnose). */
export function waffenSpritesZustand() {
  return waffenSpritesLader.zustand();
}
