/**
 * Prüfbögen der Waffen-Anker (Waffen-Animation, Ankerprüfung).
 *
 * Je Kategorie entstehen Bilder, auf denen jede Waffe dreimal gezeichnet ist:
 * Standpose nach rechts, im Schuss (Rückstoß, Blitz) und Standpose nach links.
 * Gezeichnet wird mit den echten Routinen des Spiels (Figur, Waffe, Pose), nicht
 * mit einer Kopie. Marker: grün = Griffanker (sitzt in der Hand), rot =
 * Mündungsanker, gestrichelt = Zielstrahl (die Mündung soll darauf liegen).
 * Unter jeder Zelle stehen ID, Name, Art des Ankers (standard = nur Vorgabe,
 * geometrie = aus dem Umriss geschätzt) und eine Zahl zur Mündungsabweichung vom
 * Zielstrahl in Weltpixeln.
 *
 * Aufruf:
 *   node scripts/waffen-pruefbogen.mjs [--modus anker|fraktionen|typen|sequenz] [--kategorie melee] [--ids pa_001,pa_002]
 *        [--out ordner] [--pro-bogen 12] [--port 5188]
 *
 * Startet einen eigenen Vite-Server (Port 5188, nicht 5173) und beendet ihn
 * wieder. Ausgabe nach `docs/bilder/waffen-pruefboegen/` (oder `--out`).
 *
 * Feinjustierung: `scripts/waffen-sprites-korrekturen.json` (grip/muzzle in
 * Zellpixeln) und danach `npm run waffen:sprites`; Details in MASTERDOTO
 * „Waffen-Animation".
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Wie in playwright.config.mjs: keine Zugpause, die Aufnahmen beginnen sofort.
process.env.VITE_ZUGPAUSE_SEKUNDEN ??= '0';
process.env.PA_ZUGPAUSE_SEKUNDEN ??= '0';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');

function arg(name, standard = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : standard;
}

const kategorie = arg('kategorie');
const ids = arg('ids') ? arg('ids').split(',') : null;
const ausgabe = path.resolve(arg('out', path.join(WURZEL, 'docs', 'bilder', 'waffen-pruefboegen')));
const proBogen = Number(arg('pro-bogen', 12));
const port = Number(arg('port', 5188));
const modus = arg('modus', 'anker'); // anker | fraktionen | typen | sequenz
const proKategorie = Number(arg('waffen-je-kategorie', 6));

/** Je eine Figur aus jeder der 9 Fraktionen (erste Figur jeder Reihe). */
const FRAKTIONS_FIGUREN = [
  'captain-sven', 'chassis-endo-t8', 'pikamon', 'nullpointer-exception-cult', 'nullpointer-exception',
  'commander-chewk', 'shred-katana-hanzmon', 'bone-racker-karl', 'sgt-acid-xeno',
];
/** Figuren je Figurtyp (Humanoid, Tier, Fahrzeug, Schweber, Wesen) samt Sonderfällen aus `FIGUR_OFFSETS`. */
const TYP_FIGUREN = [
  'captain-sven', 'hydra-titan-mech', 'pyrofox-a', 'storm-talon', 'recon-luchs-01',
  'heavy-battery-moerser-bot', 'rauch-meister-genzi', 'banshee-beatrice', 'cosmic-meditate', 'chrome-code-shifter',
];

function browserOptionen() {
  const kandidaten = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  const chrome = kandidaten.find(p => existsSync(p));
  return chrome && process.env.PLAYWRIGHT_CHANNEL !== 'bundled' ? { executablePath: chrome } : {};
}

/** Läuft im Browser: zeichnet einen Bogen und liefert ihn als PNG-Daten-URL. */
async function zeichneBogen({ waffenIds, titel }) {
  const [{ WEAPONS_BY_ID }, { holeWaffenSprite }, anim, figuren, { holeFigur }, { charakterFuer }] = await Promise.all([
    import('/src/shared/config/weapons.js'),
    import('/src/client/waffenSprites.js'),
    import('/src/client/waffenAnimation.js'),
    import('/src/client/figuren.js'),
    import('/src/client/figurenBilder.js'),
    import('/src/shared/config/darstellung.js'),
  ]);
  const manifest = (await import('/src/client/assets/weapon-sprites/manifest.json')).default;
  const char = charakterFuer('pirates', 'heavy', 'artillerist');
  let fig = null;
  for (let i = 0; i < 200 && !fig; i += 1) {
    fig = holeFigur(char);
    if (!fig) await new Promise(r => setTimeout(r, 25));
  }
  const spriteVon = async (waffe) => {
    for (let i = 0; i < 200; i += 1) {
      const s = holeWaffenSprite(waffe);
      if (s) return s;
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  };

  const F = 2.2;
  const ZW = 150; // Breite einer Pose
  const ZH = 168;
  const SPALTEN = 2;
  const zeilen = Math.ceil(waffenIds.length / SPALTEN);
  const kopf = 26;
  const c = document.createElement('canvas');
  c.width = SPALTEN * ZW * 3;
  c.height = kopf + zeilen * ZH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(titel, 8, 18);

  const posen = [
    { name: 'Stand rechts', winkel: 0.28, schuss: false },
    { name: 'Schuss', winkel: 0.28, schuss: true },
    { name: 'Stand links', winkel: Math.PI - 0.28, schuss: false },
  ];
  const hand = { x: 0, y: 0 };
  const pose = anim.neuePose();
  const zeit = anim.neueZeiten();

  for (let n = 0; n < waffenIds.length; n += 1) {
    const waffe = WEAPONS_BY_ID[waffenIds[n]];
    const m = manifest.waffen[waffe.id];
    const sp = await spriteVon(waffe);
    const par = anim.parameterFuerWaffe(waffe, sp);
    const sx = (n % SPALTEN) * ZW * 3;
    const sy = kopf + Math.floor(n / SPALTEN) * ZH;
    const neigung = sp ? sp.achse : 0;
    for (let p = 0; p < 3; p += 1) {
      const po = posen[p];
      const ox = sx + p * ZW + ZW / 2;
      const oy = sy + 92;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(sx + p * ZW + 0.5, sy + 0.5, ZW - 1, ZH - 1);
      ctx.translate(ox, oy);
      ctx.scale(F, F);
      const fh = anim.figurHand(char.id);
      const hinten = sp && par.lage === 'hinter';
      let gezeichnet = false;
      const zeichneWaffe = () => {
        gezeichnet = true;
        figuren.zeichneWaffeSprite(ctx, sp, par, pose, {
          winkel: po.winkel, handX: hand.x, handY: hand.y, figur: fh,
          handFarbe: fig ? figuren.handFarbeFuer(fig, fh) : null, zeit: 0.6, reduziert: !po.schuss,
        });
      };
      const zeichneFig = () => {
        if (fig) {
          figuren.zeichneFigurSprite(ctx, fig, {
            team: '#4cc9f0', winkel: po.winkel, aktiv: false, zeit: 0, reduziert: true, pose: null,
          });
        }
      };
      if (sp) {
        zeit.idle = 0;
        zeit.seitZiehen = Infinity;
        // Schuss: Zeitpunkt des stärksten Blitzes bzw. Glanzes.
        zeit.seitSchuss = po.schuss ? par.aufladen + 0.012 : Infinity;
        zeit.bereit = 1;
        zeit.treffer = 0;
        anim.waffenPose(par, zeit, !po.schuss, pose);
        anim.handPunkt(par, Math.cos(po.winkel), 52, 10, hand, fh);
        if (hinten) zeichneWaffe();
        zeichneFig();
        if (!hinten) zeichneWaffe();

        // Marker im Figurrahmen: Griff, Mündung, Zielstrahl.
        const links = Math.cos(po.winkel) < 0;
        const k = par.zelle / 128;
        const ar = sp.achse;
        const lx = ((sp.mx - par.griff) * k) * pose.skala;
        const ly = (sp.my * k) * pose.skala;
        const cd = Math.cos(-pose.drehung - ar);
        const sd = Math.sin(-pose.drehung - ar);
        const lx2 = lx * cd - ly * sd;
        const ly2 = lx * sd + ly * cd;
        const mx = lx2 + pose.vor;
        let my = ly2 - pose.hoch;
        if (links) my = -my;
        const ca = Math.cos(-po.winkel);
        const sa = Math.sin(-po.winkel);
        const wx = hand.x + mx * ca - my * sa;
        const wy = hand.y + mx * sa + my * ca;
        ctx.save();
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#4cc9f0';
        ctx.beginPath();
        ctx.moveTo(hand.x, hand.y);
        ctx.lineTo(hand.x + Math.cos(-po.winkel) * 40, hand.y + Math.sin(-po.winkel) * 40);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#2bd96b';
        ctx.beginPath(); ctx.arc(hand.x, hand.y, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath(); ctx.arc(wx, wy, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      if (!sp || !gezeichnet) zeichneFig();
      ctx.restore();
      ctx.fillStyle = '#9aa4b2';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(po.name, sx + p * ZW + 4, sy + 11);
    }
    ctx.fillStyle = '#e8ecf1';
    ctx.font = 'bold 11px system-ui, sans-serif';
    const beschr = `${waffe.id}  ${waffe.displayName}`;
    ctx.fillText(beschr.slice(0, 46), sx + 4, sy + ZH - 20);
    ctx.fillStyle = m?.anchor?.source === 'standard' ? '#ffd166' : '#9aa4b2';
    ctx.font = '10px system-ui, sans-serif';
    const art = `${waffe.category} · Anker: ${m?.anchor?.source ?? '?'} · Art: ${par.art} · Achse ${(neigung * 180 / Math.PI).toFixed(0)}°`;
    ctx.fillText(art, sx + 4, sy + ZH - 7);
  }
  return c.toDataURL('image/jpeg', 0.6);
}


/**
 * Läuft im Browser: Matrix Figuren (Zeilen) x Waffen (Spalten), je Zelle Stand und Schuss.
 * Zeigt, wie dieselbe Waffe von Figuren verschiedener Fraktionen und Figurtypen getragen wird.
 */
async function zeichneMatrix({ waffenIds, figurIds, titel }) {
  const [{ WEAPONS_BY_ID }, { holeWaffenSprite }, anim, figuren, { holeFigur }, { CHARACTERS }] = await Promise.all([
    import('/src/shared/config/weapons.js'),
    import('/src/client/waffenSprites.js'),
    import('/src/client/waffenAnimation.js'),
    import('/src/client/figuren.js'),
    import('/src/client/figurenBilder.js'),
    import('/src/shared/config/factions.js'),
  ]);
  const F = 1.9;
  const ZW = 98;
  const ZH = 124;
  const kopf = 40;
  const rand = 118;
  const c = document.createElement('canvas');
  c.width = rand + waffenIds.length * ZW * 2;
  c.height = kopf + figurIds.length * ZH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(titel, 8, 16);
  const warte = async (f) => {
    for (let i = 0; i < 200; i += 1) {
      const v = f();
      if (v) return v;
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  };
  const sprites = [];
  for (let n = 0; n < waffenIds.length; n += 1) {
    const waffe = WEAPONS_BY_ID[waffenIds[n]];
    const sp = await warte(() => holeWaffenSprite(waffe));
    sprites.push({ waffe, sp, par: anim.parameterFuerWaffe(waffe, sp) });
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#9aa4b2';
    ctx.fillText(`${waffe.id} ${waffe.displayName}`.slice(0, 30), rand + n * ZW * 2 + 4, 33);
  }
  const hand = { x: 0, y: 0 };
  const pose = anim.neuePose();
  const zeit = anim.neueZeiten();
  for (let r = 0; r < figurIds.length; r += 1) {
    const char = CHARACTERS.find(x => x.id === figurIds[r]);
    const fig = await warte(() => holeFigur(char));
    const fh = anim.figurHand(char.id);
    const sy = kopf + r * ZH;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(char.faction, 4, sy + 14);
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(char.id.slice(0, 20), 4, sy + 27);
    ctx.fillText(`Typ: ${fh.typ}`, 4, sy + 40);
    for (let n = 0; n < sprites.length; n += 1) {
      const { sp, par } = sprites[n];
      for (let p = 0; p < 2; p += 1) {
        const winkel = p === 0 ? 0.22 : -0.1;
        const ox = rand + (n * 2 + p) * ZW + ZW / 2;
        const oy = sy + 78;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.strokeRect(ox - ZW / 2 + 0.5, sy + 0.5, ZW - 1, ZH - 1);
        ctx.beginPath(); ctx.rect(ox - ZW / 2, sy, ZW, ZH); ctx.clip();
        ctx.translate(ox, oy);
        ctx.scale(F, F);
        if (sp) {
          zeit.idle = 0; zeit.seitZiehen = Infinity; zeit.bereit = 1; zeit.treffer = 0;
          zeit.seitSchuss = p === 1 ? par.aufladen + 0.012 : Infinity;
          anim.waffenPose(par, zeit, p === 0, pose);
          anim.handPunkt(par, Math.cos(winkel), 52, 10, hand, fh);
          const farbe = fig ? figuren.handFarbeFuer(fig, fh) : null;
          const daten = {
            winkel, handX: hand.x, handY: hand.y, figur: fh, handFarbe: farbe, zeit: 0.6, reduziert: p === 0,
          };
          const hinten = par.lage === 'hinter';
          if (hinten) figuren.zeichneWaffeSprite(ctx, sp, par, pose, daten);
          if (fig) figuren.zeichneFigurSprite(ctx, fig, { team: '#4cc9f0', winkel, aktiv: false, zeit: 0, reduziert: true, pose: null });
          if (!hinten) figuren.zeichneWaffeSprite(ctx, sp, par, pose, daten);
        }
        ctx.restore();
      }
    }
  }
  return c.toDataURL('image/jpeg', 0.5);
}

/**
 * Läuft im Browser: Schuss-Sequenz je Kategorie. Zeile = eine Waffe der Kategorie, Spalten =
 * Zeitpunkte seit dem Schuss; mit Körperpose (Rückstoß, Ausfallschritt), Waffenpose und Blitz in der
 * Spielgröße (~80 px Figurenhöhe). Zeigt, wie unterscheidbar die Schüsse der Kategorien sind.
 */
async function zeichneSequenz({ waffenIds, zeiten, titel }) {
  const [{ WEAPONS_BY_ID }, { holeWaffenSprite }, anim, figuren, { holeFigur }, { CHARACTERS }, { FigurPosen }, typen] = await Promise.all([
    import('/src/shared/config/weapons.js'),
    import('/src/client/waffenSprites.js'),
    import('/src/client/waffenAnimation.js'),
    import('/src/client/figuren.js'),
    import('/src/client/figurenBilder.js'),
    import('/src/shared/config/factions.js'),
    import('/src/client/figurAnimation.js'),
    import('/src/client/figurTypen.js'),
  ]);
  const F = 1.55;
  const ZW = 118;
  const ZH = 112;
  const kopf = 30;
  const rand = 96;
  const c = document.createElement('canvas');
  c.width = rand + zeiten.length * ZW;
  c.height = kopf + waffenIds.length * ZH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(titel, 8, 14);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#9aa4b2';
  zeiten.forEach((t, i) => ctx.fillText(`${(t * 1000).toFixed(0)} ms`, rand + i * ZW + 6, 26));
  const warte = async (f) => {
    for (let i = 0; i < 200; i += 1) {
      const v = f();
      if (v) return v;
      await new Promise(r => setTimeout(r, 25));
    }
    return null;
  };
  const char = CHARACTERS.find(x => x.id === 'captain-sven');
  const fig = await warte(() => holeFigur(char));
  const fh = anim.figurHand(char.id);
  const winkel = 0.2;
  const hand = { x: 0, y: 0 };
  const pose = anim.neuePose();
  const zeit = anim.neueZeiten();
  const ende = Math.max(...zeiten);
  for (let r = 0; r < waffenIds.length; r += 1) {
    const waffe = WEAPONS_BY_ID[waffenIds[r]];
    const sp = await warte(() => holeWaffenSprite(waffe));
    const par = anim.parameterFuerWaffe(waffe, sp);
    const sy = kopf + r * ZH;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(waffe.category, 4, sy + 14);
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(waffe.displayName.slice(0, 16), 4, sy + 27);
    ctx.fillText(`Art: ${par.art}`, 4, sy + 40);
    // Körper über die Zeit mit der echten Figurpose treiben (60 Hz), Zeitpunkte abgreifen.
    const posen = new FigurPosen();
    const e = { entityId: 1, x: 100, y: 100 };
    const opt = { params: typen.PARAMETER.humanoid, typ: 'humanoid', winkel, schussStaerke: par.koerper, ausfall: par.ausfall };
    posen.pose(e, 0, { ...opt, feuer: 0 });
    const proben = new Map();
    const schritt = 1 / 120;
    for (let t = schritt; t <= ende + 1e-6; t += schritt) {
      const p = posen.pose(e, t, { ...opt, feuer: t <= schritt * 1.5 ? 1 : 0.8 });
      zeiten.forEach((z) => { if (!proben.has(z) && t >= z) proben.set(z, { ...p }); });
    }
    for (let n = 0; n < zeiten.length; n += 1) {
      const bp = proben.get(zeiten[n]) ?? { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0, neigung: 0 };
      const ox = rand + n * ZW + ZW / 2 - 10;
      const oy = sy + 76;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.strokeRect(rand + n * ZW + 0.5, sy + 0.5, ZW - 1, ZH - 1);
      ctx.beginPath(); ctx.rect(rand + n * ZW, sy, ZW, ZH); ctx.clip();
      ctx.translate(ox, oy);
      ctx.scale(F, F);
      if (fig && sp) {
        zeit.idle = 0; zeit.seitZiehen = Infinity; zeit.bereit = 1; zeit.treffer = 0;
        zeit.seitSchuss = zeiten[n] + 0.001;
        anim.waffenPose(par, zeit, false, pose);
        anim.handPunkt(par, Math.cos(winkel), 52, 10, hand, fh);
        const daten = { winkel, handX: hand.x, handY: hand.y, figur: fh, handFarbe: figuren.handFarbeFuer(fig, fh), zeit: 0.6, reduziert: false };
        const hinten = par.lage === 'hinter';
        const folge = () => {
          const rr = bp.neigung + bp.rot;
          const hh = 10 + 7.25;
          ctx.translate(bp.dx + hh * Math.sin(rr), bp.dy - hh * (bp.sy - 1) + hh * (1 - Math.cos(rr)));
        };
        if (hinten) { ctx.save(); folge(); figuren.zeichneWaffeSprite(ctx, sp, par, pose, daten); ctx.restore(); }
        figuren.zeichneFigurSprite(ctx, fig, { team: '#4cc9f0', winkel, aktiv: false, zeit: 0, reduziert: true, pose: bp });
        folge();
        if (!hinten) figuren.zeichneWaffeSprite(ctx, sp, par, pose, daten);
      }
      ctx.restore();
    }
  }
  return c.toDataURL('image/jpeg', 0.55);
}

async function main() {
  const server = await createServer({
    root: WURZEL,
    server: { port, strictPort: true, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...browserOptionen() });
  const ergebnisse = [];
  try {
    const seite = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    seite.on('pageerror', e => console.error('Seitenfehler:', String(e)));
    await seite.goto(`http://127.0.0.1:${port}/`);
    const katalog = await seite.evaluate(async () => {
      const { WEAPONS } = await import('/src/shared/config/weapons.js');
      return WEAPONS.map(w => ({ id: w.id, category: w.category }));
    });
    const kategorien = [...new Set(katalog.map(w => w.category))];
    mkdirSync(ausgabe, { recursive: true });
    const gruppen = ids
      ? [['auswahl', ids]]
      : kategorien.filter(k => !kategorie || k === kategorie)
        .map(k => [k, katalog.filter(w => w.category === k).map(w => w.id)]);
    if (modus === 'anker') {
      for (const [name, liste] of gruppen) {
        for (let i = 0; i * proBogen < liste.length; i += 1) {
          const teil = liste.slice(i * proBogen, (i + 1) * proBogen);
          const titel = `Waffen-Prüfbogen ${name} ${i + 1} (grün: Griff, rot: Mündung, gestrichelt: Zielstrahl)`;
          const url = await seite.evaluate(zeichneBogen, { waffenIds: teil, titel });
          const datei = path.join(ausgabe, `${name}-${String(i + 1).padStart(2, '0')}.jpg`);
          writeFileSync(datei, Buffer.from(url.split(',')[1], 'base64'));
          ergebnisse.push(datei);
          console.log(datei);
        }
      }
    } else if (modus === 'sequenz') {
      const waffenIds = ids ?? ['pa_001', 'pa_040', 'pa_041', 'pa_062', 'pa_104', 'pa_121', 'pa_111', 'pa_141'];
      const zeiten = [0, 0.03, 0.07, 0.12, 0.2, 0.32, 0.5, 0.8];
      const titel = 'Schuss-Sequenz je Kategorie (Zeit seit dem Schuss, Spielgröße ~80 px)';
      const url = await seite.evaluate(zeichneSequenz, { waffenIds, zeiten, titel });
      const datei = path.join(ausgabe, 'sequenz.jpg');
      writeFileSync(datei, Buffer.from(url.split(',')[1], 'base64'));
      ergebnisse.push(datei);
      console.log(datei);
    } else {
      // Matrix: Figuren (Zeilen) x gleichmäßig gewählte Waffen der Kategorie (Spalten), je Stand und Schuss.
      const figurIds = modus === 'typen' ? TYP_FIGUREN : FRAKTIONS_FIGUREN;
      for (const [name, liste] of gruppen) {
        const schritt = Math.max(1, Math.floor(liste.length / proKategorie));
        const teil = ids ? liste : liste.filter((_, i) => i % schritt === 0).slice(0, proKategorie);
        const titel = `Prüfbogen ${modus}: ${name} (Stand | Schuss je Waffe, Zeilen = Figuren)`;
        const url = await seite.evaluate(zeichneMatrix, { waffenIds: teil, figurIds, titel });
        const datei = path.join(ausgabe, `${modus}-${name}.jpg`);
        writeFileSync(datei, Buffer.from(url.split(',')[1], 'base64'));
        ergebnisse.push(datei);
        console.log(datei);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return ergebnisse;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
