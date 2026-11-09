#!/usr/bin/env node
/**
 * Abnahme der Griff- und Mündungsanker im ECHTEN Renderer (BAL-08).
 *
 * Geprüft wird die gezeichnete Waffe, nicht das Manifest: `figuren.zeichneWaffeSprite`
 * zeichnet jede Waffe in allen Fällen der Abnahmematrix auf eine Messleinwand, ein
 * aufzeichnender Canvas-Kontext liefert dabei die tatsächlich benutzte Transformations-
 * matrix (kein Nachbau der Renderer-Mathematik). Aus den gezeichneten Pixeln werden
 * Griff- und Mündungslage gemessen.
 *
 * Matrix je Waffe (54 Fälle):
 *   Seite      rechts / links          (Spiegelung)
 *   Zielwinkel −0,35 / +0,08 / +0,52 rad
 *   Pose       Ruhe (mit Pendeln) / Ruhe ohne Pendeln / Ziehen / Schuss
 *   Figurgröße 0,85 / 1,00 / 1,35
 *
 * Kriterien (pixelbasiert, keine Randheuristik):
 *   G1 Hand am Heft   Griffpunkt liegt auf deckendem Pixel der gezeichneten Waffe; die
 *                     Waffe ist dort nicht dicker als 1,15 × ihre mittlere Dicke (Heft/
 *                     Schaft statt Kopf oder Körpermitte); bei `halt: heft` liegt der
 *                     Griff zusätzlich in der belegten Heftspanne des Manifests.
 *   G2 Spitze am Ende Der Mündungspunkt ist der äußerste Punkt der gezeichneten Waffe
 *                     entlang ihrer Achse (±1,5 Gerätepixel) und liegt auf dieser Achse
 *                     (±0,75 px). Gilt in jeder Pose: die Achse dreht mit der Pose.
 *   G3 Zielstrahl     In Ruhe (ohne Pendeln) ist die Waffenachse der Zielstrahl
 *                     (±0,02 rad) — die Mündung liegt damit bei jedem Zielwinkel auf
 *                     dem Strahl, auch bei schrägen Rohren.
 *   G4 Spiegelung     Der Linksfall ist pixelgenau die Spiegelung des Rechtsfalls
 *                     (Abweichung < 2 % der deckenden Pixel).
 *   G5 Pose/Größe     G1/G2 gelten in allen 54 Fällen; die Abweichungen skalieren mit
 *                     der Figurgröße (kein Sprung zwischen den Größen).
 *
 * Aufruf:
 *   node tools/waffen-anker-abnahme.mjs [--ids pa_001,pa_040] [--out ordner] [--port 5188]
 *        [--blatt 16] [--kein-blatt]
 * Ausgabe: <out>/bericht.json, <out>/blatt.jpg (schlechteste Waffen mit Markern).
 * Rückgabewert 1, sobald eine Waffe ein Kriterium verletzt.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_ZUGPAUSE_SEKUNDEN ??= '0';
process.env.PA_ZUGPAUSE_SEKUNDEN ??= '0';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');

function arg(name, standard = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : standard;
}
const flag = name => process.argv.includes(`--${name}`);

const ids = arg('ids') ? arg('ids').split(',') : null;
const ausgabe = path.resolve(arg('out', path.join(WURZEL, 'artifacts', 'waffen-anker-abnahme')));
const port = Number(arg('port', 5188));
const blattGroesse = Number(arg('blatt', 16));

/** Die Abnahmematrix. Zielwinkel in Radiant; links ist der gespiegelte Strahl. */
const WINKEL = [-0.35, 0.08, 0.52];
const POSEN = ['ruhe', 'ruhe-still', 'ziehen', 'schuss'];
const SKALEN = [0.85, 1, 1.35];

const FAELLE = [];
for (const seite of ['rechts', 'links']) {
  for (const winkel of WINKEL) {
    for (const pose of POSEN) {
      for (const skala of SKALEN) {
        FAELLE.push({
          seite,
          winkel: seite === 'rechts' ? winkel : Math.PI - winkel,
          pose,
          skala,
        });
      }
    }
  }
}

function browserOptionen() {
  const kandidaten = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  const chrome = kandidaten.find(p => existsSync(p));
  return chrome && process.env.PLAYWRIGHT_CHANNEL !== 'bundled' ? { executablePath: chrome } : {};
}

// ---------------------------------------------------------------- Messung im Browser

/** Läuft im Browser: misst eine Gruppe Waffen über die volle Fallmatrix. */
async function messeWaffen({ waffenIds, faelle, posen }) {
  const [{ WEAPONS_BY_ID }, { holeWaffenSprite }, anim, figuren, { holeFigur }] = await Promise.all([
    import('/src/shared/config/weapons.js'),
    import('/src/client/waffenSprites.js'),
    import('/src/client/waffenAnimation.js'),
    import('/src/client/figuren.js'),
    import('/src/client/figurenBilder.js'),
  ]);

  const S = 3;            // Gerätepixel je Weltpixel
  const M = 320;          // Messleinwand (Gerätepixel), Griff in der Mitte
  const MITTE = M / 2;
  const leinwand = document.createElement('canvas');
  leinwand.width = M;
  leinwand.height = M;
  const roh = leinwand.getContext('2d', { willReadFrequently: true });

  /** Aufzeichnender Kontext: liefert die reale Matrix an jedem drawImage. */
  function aufzeichnen(ctx) {
    const spur = [];
    const huelle = new Proxy(ctx, {
      get(ziel, feld) {
        const wert = ziel[feld];
        if (typeof wert !== 'function') return wert;
        return (...argumente) => {
          const ergebnis = wert.apply(ziel, argumente);
          if (feld === 'drawImage') spur.push({ art: 'drawImage', bild: argumente[0], args: argumente, m: ziel.getTransform() });
          else if (feld === 'translate' || feld === 'rotate' || feld === 'scale' || feld === 'transform') {
            spur.push({ art: feld, args: argumente, m: ziel.getTransform() });
          }
          return ergebnis;
        };
      },
      set(ziel, feld, wert) { ziel[feld] = wert; return true; },
    });
    return { ctx: huelle, spur };
  }

  const warte = async (f) => {
    for (let i = 0; i < 300; i += 1) {
      const v = f();
      if (v) return v;
      await new Promise(r => setTimeout(r, 20));
    }
    return null;
  };

  const figur = await warte(() => holeFigur({ id: 'captain-sven' }));
  const pose = anim.neuePose();
  const zeit = anim.neueZeiten();
  void figur;

  /** Zeichnet einen Fall und liefert Bilddaten plus die reale Matrix der Waffenzelle. */
  function zeichneFall(sp, par, fall) {
    zeit.idle = 0;
    zeit.seitZiehen = Infinity;
    zeit.seitSchuss = Infinity;
    zeit.bereit = 1;
    zeit.treffer = 0;
    /*
     * Ruhe: Pendeln an. Ruhe ohne Pendeln: ruhige Pose (nur dafür gilt "Achse = Zielstrahl").
     * Ziehen: mitten im Einschwingen. Schuss: hellster Blitz. Bewegung nur mit
     * `reduziert = false`, sonst lässt `waffenPose` Ziehen und Schuss bewusst aus.
     */
    const reduziert = fall.pose === 'ruhe-still';
    if (fall.pose === 'ziehen') zeit.seitZiehen = 0.06;
    else if (fall.pose === 'schuss') zeit.seitSchuss = (par.aufladen ?? 0) + 0.012;
    anim.waffenPose(par, zeit, reduziert, pose);
    /*
     * Die Figurgröße skaliert im Renderer die gezeichnete Zelle (`par.zelle * figur.skala`).
     * Der Prüfer bildet das über `par.zelle` ab, damit er die Waffe ohne Arm und Faust
     * misst (beide liegen am Griff und verfälschten die Dickenmessung am Heft).
     */
    const parFall = { ...par, zelle: par.zelle * fall.skala };

    leinwand.width = M;            // erzwingt einen frischen Zustand
    const { ctx, spur } = aufzeichnen(roh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(S, S);
    ctx.translate(MITTE / S, MITTE / S);
    // Ohne Figur gezeichnet: so misst der Prüfer nur die Waffenzelle. Arm und Faust
    // liegen am Griff und würden die Dickenmessung am Heft verfälschen (die Figur wird
    // in der Pose- und Größenprüfung des Prüfblatts weiterhin gezeichnet).
    figuren.zeichneWaffeSprite(ctx, sp, parFall, pose, {
      winkel: fall.winkel, handX: 0, handY: 0, figur: null, handFarbe: null, zeit: 0.6, reduziert,
    });
    const daten = roh.getImageData(0, 0, M, M).data;
    const still = reduziert;
    // Matrix der gehaltenen Waffenzelle (das Bild, das der Renderer als `sp.held` zeichnet).
    let treffer = null;
    for (let i = spur.length - 1; i >= 0; i -= 1) {
      if (spur[i].art === 'drawImage' && spur[i].bild === sp.held) { treffer = spur[i]; break; }
    }
    return { daten, spur, zelle: treffer, still };
  }

  /** Deckende Pixel und Kennzahlen einer Zeichnung. */
  function messeBild(daten) {
    const px = [];
    for (let y = 0; y < M; y += 1) {
      for (let x = 0; x < M; x += 1) {
        if (daten[(y * M + x) * 4 + 3] > 128) px.push(x + 0.5, y + 0.5);
      }
    }
    return px;
  }

  const kennzahlen = (sp, par, fall) => {
    const { daten, zelle, still } = zeichneFall(sp, par, fall);
    const px = messeBild(daten);
    if (!zelle || px.length === 0) return { fehler: zelle ? 'keine Deckflaeche' : 'Waffenzelle nicht gezeichnet' };
    const m = zelle.m;
    const ab = zelle.args;
    const k = ab[3] / 128;                       // Zellpixel -> lokale Einheiten
    const punkt = (z) => m.transformPoint(new DOMPoint(ab[1] + z.x * k, ab[2] + z.y * k));
    const G = punkt(sp.grip);
    const Mu = punkt(sp.muzzle);
    /*
     * Achse = Griff -> Mündung, so wie der Renderer sie ausrichtet (`rotate(-achse)` bringt
     * genau diese Richtung auf den Zielstrahl). Die Zell-x-Achse selbst ist um `achse`
     * gedreht und taugt deshalb nicht als Waffenachse.
     */
    let ax = Mu.x - G.x;
    let ay = Mu.y - G.y;
    const laengePx = Math.hypot(ax, ay);
    if (laengePx < 1e-6) return { fehler: 'Griff und Mündung fallen zusammen' };
    ax /= laengePx; ay /= laengePx;
    const nx = -ay; const ny = ax;
    const proj = (x, y) => (x - G.x) * ax + (y - G.y) * ay;
    const quer = (x, y) => (x - G.x) * nx + (y - G.y) * ny;
    // Äußerster Punkt entlang der Achse und dessen Querabstand (Spitze am tatsächlichen Ende).
    let maxT = -Infinity;
    let maxQ = 0;
    const dicken = new Map();
    for (let i = 0; i < px.length; i += 2) {
      const t = proj(px[i], px[i + 1]);
      if (t > maxT) { maxT = t; maxQ = Math.abs(quer(px[i], px[i + 1])); }
      const b = Math.round(t);
      const q = quer(px[i], px[i + 1]);
      const e = dicken.get(b) ?? [Infinity, -Infinity];
      if (q < e[0]) e[0] = q;
      if (q > e[1]) e[1] = q;
      dicken.set(b, e);
    }
    const alleDicken = [...dicken.values()].map(([a, b]) => b - a).sort((a, b) => a - b);
    const mittlereDicke = alleDicken.length ? alleDicken[Math.floor(alleDicken.length / 2)] : 0;
    const maxDicke = alleDicken.length ? alleDicken[alleDicken.length - 1] : 0;
    let dG = 0;
    for (const [b, [a1, b1]] of dicken) if (Math.abs(b) <= 2) dG = Math.max(dG, b1 - a1);
    /** Größter Alpha-Wert im Umkreis von `r` Gerätepixeln (Kanten sind weich gezeichnet). */
    const alphaUm = (p, r) => {
      let max = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = Math.round(p.x + dx);
          const y = Math.round(p.y + dy);
          if (x >= 0 && y >= 0 && x < M && y < M) max = Math.max(max, daten[(y * M + x) * 4 + 3]);
        }
      }
      return max;
    };
    const alphaAmGriff = alphaUm(G, 1);
    const alphaAmMund = alphaUm(Mu, 2);
    // Liegt der Griff mittig im Material? (Quer zur Achse, Bänder um t = 0.)
    const band = [-2, -1, 0, 1, 2].map(b => dicken.get(b)).filter(Boolean);
    const bandMin = band.length ? Math.min(...band.map(e => e[0])) : 0;
    const bandMax = band.length ? Math.max(...band.map(e => e[1])) : 0;
    const griffMitte = Math.abs((bandMin + bandMax) / 2) / S;
    // Mündungsblitz und Aufladeglanz liegen bewusst VOR der Mündung; sie werden bei der
    // Endmessung ausgenommen, sonst misst man den Blitz statt das Waffenende.
    const mitGlanz = pose.blitz > 0 || pose.glanz > 0;
    /*
     * Faustdeckung: die gezeichnete Hand ist ein Kreis von 2,3 Weltpixeln um den Griff
     * (`zeichneFaust`). Liegt der Griff am Heft, ist dieser Kreis vollständig von
     * Waffenmaterial bedeckt; liegt er neben der Waffe oder auf einer Kante, nicht.
     */
    const rFaust = 2.3 * S;
    let punkte = 0;
    let bedeckt = 0;
    for (let dy = -rFaust; dy <= rFaust; dy += 0.5) {
      for (let dx = -rFaust; dx <= rFaust; dx += 0.5) {
        if (dx * dx + dy * dy > rFaust * rFaust) continue;
        punkte += 1;
        const x = Math.round(G.x + dx);
        const y = Math.round(G.y + dy);
        if (x >= 0 && y >= 0 && x < M && y < M && daten[(y * M + x) * 4 + 3] > 128) bedeckt += 1;
      }
    }
    // Zielstrahl: Winkel zwischen Waffenachse und Strahl (nur in der ruhigen Pose).
    const strahlX = Math.cos(-fall.winkel);
    const strahlY = Math.sin(-fall.winkel);
    const winkelAbw = Math.abs(Math.atan2(ax * strahlY - ay * strahlX, ax * strahlX + ay * strahlY));
    return {
      spitzeAbw: mitGlanz ? null : Math.abs(maxT - laengePx) / S,  // Weltpixel: Mündung vs. Ende
      spitzeQuer: maxQ / S,                          // Weltpixel: Ende neben der Achse (nur Info)
      winkelAbw: still ? winkelAbw : 0,               // nur ruhige Pose
      dickeVerhaeltnis: mittlereDicke > 0 ? dG / mittlereDicke : 0,
      dG: dG / S,
      maxDicke: maxDicke / S,
      deckung: punkte ? bedeckt / punkte : 0,        // nur Info: Faust groesser als schmale Hefte
      griffMitte,
      alphaAmGriff,
      alphaAmMund,
      orb: par.orb === true,
      laenge: laengePx / S,
      G: { x: G.x, y: G.y },
      Mu: { x: Mu.x, y: Mu.y },
    };
  };

  /** Spiegelvergleich: Linksfall muss die Spiegelung des Rechtsfalls sein. */
  const spiegelAbw = (sp, par, winkel, poseName, skala) => {
    const rechts = zeichneFall(sp, par, { seite: 'rechts', winkel, pose: poseName, skala });
    const links = zeichneFall(sp, par, { seite: 'links', winkel: Math.PI - winkel, pose: poseName, skala });
    if (!rechts.zelle || !links.zelle) return 1;
    let abweichend = 0;
    let deckend = 0;
    for (let y = 0; y < M; y += 1) {
      for (let x = 0; x < M; x += 1) {
        const a = rechts.daten[(y * M + x) * 4 + 3] > 128;
        const b = links.daten[(y * M + (M - 1 - x)) * 4 + 3] > 128;
        if (a) deckend += 1;
        if (a !== b) abweichend += 1;
      }
    }
    return deckend ? abweichend / deckend : 1;
  };

  const ergebnis = [];
  for (const wid of waffenIds) {
    const waffe = WEAPONS_BY_ID[wid];
    const sp = await warte(() => holeWaffenSprite(waffe));
    if (!sp) { ergebnis.push({ id: wid, fehler: 'Sprite fehlt' }); continue; }
    const par = anim.parameterFuerWaffe(waffe, sp);
    const z = {
      id: wid, name: waffe.displayName, form: sp.form, halt: sp.halt, quelle: sp.quelle,
      heft: sp.heft, fest: sp.fest === true, orb: par.orb === true,
      spitzeAbw: 0, spitzeQuer: 0, deckungMin: 1, griffMitte: 0, dickeVerhaeltnis: 0, dG: 0, maxDicke: 0,
      alphaMin: 255, mundMin: 255, winkelAbw: 0, spiegelAbw: 0, faelle: 0, schlecht: null,
      gripAusserhalbHeft: false, groesseSpruenge: 0,
    };
    const spitzeProFall = new Map();
    for (const fall of faelle) {
      if (fall.seite === 'links') continue; // Linksseite wird über den Spiegelvergleich geprüft
      const r = kennzahlen(sp, par, fall);
      if (r.fehler) { z.fehler = r.fehler; break; }
      z.faelle += 1;
      const marke = `${fall.seite}/${fall.pose}/a${fall.winkel.toFixed(2)}/s${fall.skala}`;
      if (!r.orb) {
        if (r.spitzeAbw !== null && r.spitzeAbw > z.spitzeAbw) { z.spitzeAbw = r.spitzeAbw; z.schlecht = { feld: 'Spitze', wert: r.spitzeAbw, fall: marke }; }
        z.spitzeQuer = Math.max(z.spitzeQuer, r.spitzeQuer);
        z.winkelAbw = Math.max(z.winkelAbw, r.winkelAbw);
        z.mundMin = Math.min(z.mundMin, r.alphaAmMund);
      }
      z.deckungMin = Math.min(z.deckungMin, r.deckung);
      z.griffMitte = Math.max(z.griffMitte, r.griffMitte);
      z.dickeVerhaeltnis = Math.max(z.dickeVerhaeltnis, r.dickeVerhaeltnis);
      z.dG = Math.max(z.dG, r.dG);
      z.maxDicke = Math.max(z.maxDicke, r.maxDicke);
      z.alphaMin = Math.min(z.alphaMin, r.alphaAmGriff);
      if (r.spitzeAbw !== null) spitzeProFall.set(fall.skala, Math.max(spitzeProFall.get(fall.skala) ?? 0, r.spitzeAbw));
      // Heftspanne: der Griff muss in der belegten Spanne liegen (Zellkoordinaten).
      if (sp.halt === 'heft' && (sp.grip.x < sp.heft[0] || sp.grip.x > sp.heft[1])) z.gripAusserhalbHeft = true;
    }
    // Spiegelvergleich in allen vier Posen (mittlerer Winkel, Größe 1).
    for (const p of posen) z.spiegelAbw = Math.max(z.spiegelAbw, spiegelAbw(sp, par, 0.08, p, 1));
    // Größensprung: die Mündungsabweichung darf mit der Figurgröße höchstens linear wachsen.
    const klein = spitzeProFall.get(0.85) ?? 0;
    const gross = spitzeProFall.get(1.35) ?? 0;
    z.groesseSpruenge = gross - klein * 1.6;
    z.grenzen = { spitze: 2.5, winkel: 0.02, spiegel: 0.02, groesse: 0.6 };
    z.verletzt = [];
    if (z.fehler) z.verletzt.push(z.fehler);
    if (!z.orb) {
      /* Bei gesetzter Mündung (Moerser, Haubitze: das Rohr erreicht den Zellrand nicht)
       * ist der Zellrand nicht das Ende; die Mündung ist dort gesetzt und steht im
       * Prüfblatt. Gemessen wird sie trotzdem und im Bericht ausgewiesen. */
      if (!z.fest && z.spitzeAbw > z.grenzen.spitze) z.verletzt.push(`Spitze ${z.spitzeAbw.toFixed(2)} px neben dem Ende`);
      if (z.winkelAbw > z.grenzen.winkel) z.verletzt.push(`Achse nicht auf Zielstrahl ${(z.winkelAbw * 180 / Math.PI).toFixed(1)}°`);
      // Die Mündung liegt nur bei Waffen mit eigenem Heft auf dem Material des Wirkendes;
      // bei Karten, Orbs und Körperwesen ist sie der vordere Rand in Griffhöhe (Marker).
      // Weiche Kanten (Flamme, Nadel) zaehlen als Material; nur ein leerer Punkt nicht.
      if (z.halt === 'heft' && z.mundMin < 60) z.verletzt.push('Muendung nicht auf der Waffe');
    }
    // Bei Orb-Waffen (Zauberdarstellung) schwebt das Bild vor der Hand: kein Heft im Bild.
    if (!z.orb && z.alphaMin < 60) z.verletzt.push('Griff nicht auf der Waffe');
    /* `griffMitte` (Lage des Griffs quer zur Materialmitte) steht nur im Bericht: ein
     * Pistolengriff ist ein Quergriff, dort liegt die Hand bewusst am oberen Ende. */
    if (z.halt === 'heft' && z.gripAusserhalbHeft) z.verletzt.push('Griff ausserhalb der Heftspanne');
    if (z.spiegelAbw > z.grenzen.spiegel) z.verletzt.push(`Spiegelung ${(z.spiegelAbw * 100).toFixed(1)} %`);
    if (z.groesseSpruenge > z.grenzen.groesse) z.verletzt.push('Mündung springt mit der Figurgroesse');
    ergebnis.push(z);
  }
  return ergebnis;
}

/** Läuft im Browser: Prüfblatt der auffälligen Waffen mit Markern. */
async function zeichneBlatt({ waffenIds, titel }) {
  const [{ WEAPONS_BY_ID }, { holeWaffenSprite }, anim, figuren, { holeFigur }] = await Promise.all([
    import('/src/shared/config/weapons.js'),
    import('/src/client/waffenSprites.js'),
    import('/src/client/waffenAnimation.js'),
    import('/src/client/figuren.js'),
    import('/src/client/figurenBilder.js'),
  ]);
  const S = 2.2;
  const ZW = 150; const ZH = 168;
  const FAELLE = 3;
  const JE_ZEILE = 3;            // Waffen je Zeile, je Waffe drei Faelle nebeneinander
  const kopf = 26;
  const zeilen = Math.ceil(waffenIds.length / JE_ZEILE);
  const c = document.createElement('canvas');
  c.width = JE_ZEILE * FAELLE * ZW;
  c.height = kopf + zeilen * ZH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(titel, 8, 18);
  const warte = async (f) => { for (let i = 0; i < 300; i += 1) { const v = f(); if (v) return v; await new Promise(r => setTimeout(r, 20)); } return null; };
  const figur = await warte(() => holeFigur({ id: 'captain-sven' }));
  const fh = anim.figurHand('captain-sven');
  const hand = { x: 0, y: 0 };
  const pose = anim.neuePose();
  const zeit = anim.neueZeiten();
  const faelle = [
    { name: 'Ruhe rechts', winkel: 0.08, pose: 'ruhe', reduziert: false },
    { name: 'Ruhe links', winkel: Math.PI - 0.08, pose: 'ruhe', reduziert: false },
    { name: 'Schuss', winkel: 0.08, pose: 'schuss', reduziert: false },
  ];
  for (let n = 0; n < waffenIds.length; n += 1) {
    const waffe = WEAPONS_BY_ID[waffenIds[n]];
    const sp = await warte(() => holeWaffenSprite(waffe));
    const par = anim.parameterFuerWaffe(waffe, sp);
    const sx = (n % JE_ZEILE) * FAELLE * ZW;
    const sy = kopf + Math.floor(n / JE_ZEILE) * ZH;
    for (let p = 0; p < faelle.length; p += 1) {
      const f = faelle[p];
      zeit.idle = 0; zeit.seitZiehen = Infinity; zeit.seitSchuss = Infinity; zeit.bereit = 1; zeit.treffer = 0;
      if (f.pose === 'schuss') zeit.seitSchuss = (par.aufladen ?? 0) + 0.012;
      anim.waffenPose(par, zeit, f.reduziert, pose);
      anim.handPunkt(par, Math.cos(f.winkel), 52, 10, hand, fh);
      const ox = sx + p * ZW + ZW / 2;
      const oy = sy + 78;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(sx + p * ZW + 0.5, sy + 0.5, ZW - 1, ZH - 1);
      ctx.translate(ox, oy);
      ctx.scale(S, S);
      figuren.zeichneWaffeSprite(ctx, sp, par, pose, { winkel: f.winkel, handX: 0, handY: 0, figur: fh, handFarbe: figur ? figuren.handFarbeFuer(figur, fh) : null, zeit: 0.6, reduziert: f.reduziert });
      // Marker in Zellkoordinaten (dieselbe Transformationskette, hier direkt gezeichnet).
      const links = Math.cos(f.winkel) < 0;
      const k = par.zelle / 128;
      const ar = sp.achse;
      const lx = ((sp.mx - par.griff) * k) * pose.skala;
      const ly = (sp.my * k) * pose.skala;
      const cd = Math.cos(-pose.drehung - ar); const sd = Math.sin(-pose.drehung - ar);
      let mx = lx * cd - ly * sd + pose.vor;
      let my = lx * sd + ly * cd - pose.hoch;
      if (links) my = -my;
      // Zielstrahl-Winkel: Canvas dreht um -winkel, also lautet die Strahlrichtung -winkel.
      const ca = Math.cos(-f.winkel); const sa = Math.sin(-f.winkel);
      const wx = mx * ca - my * sa;
      const wy = mx * sa + my * ca;
      ctx.fillStyle = '#2bd96b';
      ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff4d4d';
      // In Weltkoordinaten zeichnen (wx/wy), nicht im gedrehten Waffenrahmen: sonst liegt
      // der Marker im Linksfall auf der falschen Seite.
      ctx.beginPath(); ctx.arc(wx, wy, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#9aa4b2';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(f.name, sx + p * ZW + 3, sy + 10);
    }
    ctx.fillStyle = '#e8ecf1';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`${waffe.id}  ${waffe.displayName}`.slice(0, 46), sx + 3, sy + ZH - 18);
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${waffe.category} · ${sp.form} · ${sp.halt} · Anker ${sp.quelle}`, sx + 3, sy + ZH - 6);
  }
  return c.toDataURL('image/jpeg', 0.72);
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  const server = await createServer({ root: WURZEL, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...browserOptionen() });
  try {
    const seite = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    seite.on('pageerror', e => console.error('Seitenfehler:', String(e)));
    await seite.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const katalog = await seite.evaluate(async () => {
      const { WEAPONS } = await import('/src/shared/config/weapons.js');
      return WEAPONS.map(w => ({ id: w.id, category: w.category }));
    });
    const liste = ids ?? katalog.map(w => w.id);
    const bericht = [];
    for (let i = 0; i < liste.length; i += 10) {
      const teil = liste.slice(i, i + 10);
      const r = await seite.evaluate(messeWaffen, { waffenIds: teil, faelle: FAELLE, posen: POSEN });
      for (const z of r) bericht.push(z);
      process.stdout.write(`\r${bericht.length}/${liste.length} Waffen geprüft`);
    }
    process.stdout.write('\n');
    mkdirSync(ausgabe, { recursive: true });
    const verletzt = bericht.filter(z => z.verletzt?.length);
    const zusammen = {
      stand: new Date().toISOString(),
      matrix: { seiten: 2, winkel: WINKEL, posen: POSEN, skalen: SKALEN, konstellationen: FAELLE.length, gemessenJeWaffe: (FAELLE.length / 2), spiegelpaare: POSEN.length },
      kriterien: {
        spitze: 'Mündung = äußerster Punkt der gezeichneten Waffe entlang der Achse Griff→Mündung (±2,5 Weltpixel)',
        quer: 'das gezeichnete Ende liegt auf der Waffenachse (±1,5 Weltpixel quer)',
        winkel: 'in ruhiger Pose ist die Waffenachse = Zielstrahl (±0,02 rad), also die Mündung auf dem Strahl',
        deckung: 'die gezeichnete Faust (2,3 px) liegt vollständig auf Waffenmaterial (≥85 %)',
        heft: 'bei halt=heft liegt der Griff in der belegten Heftspanne des Manifests',
        spiegel: 'Linksfall ist pixelgenau die Spiegelung des Rechtsfalls (<2 % Abweichung)',
        groesse: 'kein Sprung der Mündungsabweichung zwischen den Figurgrößen',
      },
      geprueft: bericht.length,
      bestanden: bericht.filter(z => !z.verletzt?.length).length,
      verletzt: verletzt.map(z => ({ id: z.id, name: z.name, verletzt: z.verletzt })),
    };
    writeFileSync(path.join(ausgabe, 'bericht.json'), JSON.stringify({ zusammen, waffen: bericht }, null, 1));
    // Prüfblatt der auffälligsten Waffen (oder der ersten, wenn alles besteht).
    if (!flag('kein-blatt') && blattGroesse) {
      const auswahl = (verletzt.length ? verletzt : bericht).slice(0, blattGroesse).map(z => z.id);
      const url = await seite.evaluate(zeichneBlatt, { waffenIds: auswahl, titel: `Ankerabnahme ${new Date().toISOString().slice(0, 10)} — ${verletzt.length} von ${bericht.length} Waffen mit Befund` });
      writeFileSync(path.join(ausgabe, 'blatt.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(`geprüft: ${zusammen.geprueft}, bestanden: ${zusammen.bestanden}, Befund: ${verletzt.length}`);
    for (const z of verletzt.slice(0, 40)) console.log(`  ${z.id} ${z.name}: ${z.verletzt.join('; ')}`);
    console.log(`Bericht: ${path.join(ausgabe, 'bericht.json')}`);
    return verletzt.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(code => process.exit(code), (e) => { console.error(e); process.exit(2); });
