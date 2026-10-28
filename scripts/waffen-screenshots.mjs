/**
 * Sichtprüfung der Waffen-Animation im laufenden Spiel.
 *
 * Für repräsentative Waffen (alle Kategorien, Selbstwirkung, Wurfwaffen,
 * Nahkampf) entstehen
 *   - je Waffe ein Bild 960x540 (je Kategorie eines) mit gehaltener Schusspose (Rückstoß, Blitz),
 *   - Kontaktbögen mit je drei Ausschnitten (Stand, Schuss, Flug), 2fach aufgelöst.
 *
 * Die Schusspose wird für das Bild festgehalten (die Zeit seit dem Schuss
 * wird jedes Bild gesetzt), damit der Blitz sicher im Bild steht.
 *
 * Aufruf:
 *   node scripts/waffen-screenshots.mjs [--out ordner] [--ids pa_001,pa_010] [--port 5189] [--nur voll|bogen]
 *
 * Startet einen eigenen Vite-Server (Port 5189) und beendet ihn wieder.
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

const ausgabe = path.resolve(arg('out', path.join(WURZEL, 'docs', 'bilder', 'waffen-animation')));
const port = Number(arg('port', 5189));
const nur = arg('nur');
/** Bilder als JPEG: klein genug für das Repo (docs/bilder/ bleibt unter 3 MB). */
const JPEG = { type: 'jpeg', quality: 78 };
/** Spielbilder im Repo: 960x540. */
const VOLL_BREITE = 960;
const VOLL_HOEHE = 540;

/** Spielbilder: je Kategorie eine Waffe (die Kontaktbögen zeigen die größere AUSWAHL). */
const VOLL_AUSWAHL = ['pa_001', 'pa_040', 'pa_041', 'pa_062', 'pa_081', 'pa_111', 'pa_121', 'pa_141'];

/** Repräsentative Auswahl: je Kategorie mehrere, dazu Sonderfälle (Selbstwirkung, Wurfwaffen, Hitscan). */
const AUSWAHL = [
  'pa_001', 'pa_008', 'pa_010', 'pa_012', 'pa_019', // Nahkampf: Schläger, Hammer, Kettensäge, Katana, Doppelaxt
  'pa_022', 'pa_026', 'pa_032', 'pa_037', 'pa_040', // Fernkampf: Blaster, Bohrer, Rucksack (Selbst), Raketenwerfer, MP
  'pa_041', 'pa_048', 'pa_049', 'pa_054', 'pa_055', // Schwer: Salvengeber, Bananengranate, Bumerang, Schrotflinte, Scharfschütze
  'pa_062', 'pa_064', 'pa_068', 'pa_069', // Elementar: Flammenwerfer, Plasmagewehr, Raketenkanone
  'pa_081', 'pa_087', 'pa_097', 'pa_104', 'pa_110', // Magie: Zauber, Selbstwirkung, Traumfänger, Quantengewehr
  'pa_121', 'pa_126', 'pa_131', 'pa_136', // Tech: Punch, Schlauchboot, Bohrkopfrakete
  'pa_111', 'pa_117', 'pa_119', // Utility: Selbstwirkung, Ananasbombe
  'pa_141', 'pa_145', 'pa_150', // Ultimate
];

function browserOptionen() {
  const kandidaten = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  const chrome = kandidaten.find(p => existsSync(p));
  return chrome && process.env.PLAYWRIGHT_CHANNEL !== 'bundled' ? { executablePath: chrome } : {};
}

async function waffeBereit(seite, id) {
  const spieler = await seite.evaluate((w) => {
    const api = window.__PA__;
    const match = api.getMatch();
    const aktiv = match.activePlayerId;
    match.inventory.register(aktiv, [w]);
    api.selectWeaponById(w);
    window.__halte = null;
    return aktiv;
  }, id);
  await seite.waitForFunction(
    ([s, w]) => window.__PA__.waffenAnimation().posen[s]?.waffeId === w, [spieler, id], { timeout: 15000 });
  // Einschwingen abwarten, Figur in die Bildmitte holen.
  await seite.evaluate((s) => {
    const g = window.__PA__.game;
    const e = g.currentState().entities.find(x => x.entityId === s);
    g.kamera.zieleAuf(e.x, e.y, true);
  }, spieler);
  await seite.waitForTimeout(450);
  return spieler;
}

/** Position der Figur auf dem Bildschirm (CSS-Pixel). */
function figurPunkt(seite, spieler) {
  return seite.evaluate((s) => {
    const g = window.__PA__.game;
    const e = g.currentState().entities.find(x => x.entityId === s);
    const t = g.kamera.transformation();
    const r = g.renderer.canvas.getBoundingClientRect();
    return {
      x: r.left + (e.x * t.skalierung + t.versatzX) * g.renderer.cssFaktor,
      y: r.top + (e.y * t.skalierung + t.versatzY) * g.renderer.cssFaktor,
      weapon: e.activeWeaponId,
    };
  }, spieler);
}

/** Hält die Schusspose: setzt die Zeit seit dem Schuss in jedem Bild. */
function halte(seite, spieler, sekunden) {
  return seite.evaluate(([s, t]) => {
    const g = window.__PA__.game;
    const lauf = () => {
      const z = g.renderer.waffenZustand.get(s);
      if (z && window.__halte) z.schuss = performance.now() / 1000 - window.__halte.t;
      if (window.__halte) requestAnimationFrame(lauf);
    };
    window.__halte = { t };
    requestAnimationFrame(lauf);
  }, [spieler, sekunden]);
}

function loese(seite) {
  return seite.evaluate(() => { window.__halte = null; });
}

/** Wann der Blitz bzw. der Höhepunkt der Bewegung liegt (Kategorieparameter). */
function haltezeit(par) {
  return par.art === 'hieb' ? 0.2 : par.aufladen + 0.012;
}

async function sammle(seite, ids) {
  const ergebnis = [];
  for (const id of ids) {
    const spieler = await waffeBereit(seite, id);
    const info = await seite.evaluate(async (w) => {
      const { parameterFuerWaffe } = await import('/src/client/waffenAnimation.js');
      const { holeWaffenSprite } = await import('/src/client/waffenSprites.js');
      const waffe = window.__PA__.getWeapon(w);
      return { par: parameterFuerWaffe(waffe, holeWaffenSprite(waffe)), name: waffe.displayName, kategorie: waffe.category };
    }, id);
    const p = await figurPunkt(seite, spieler);
    const clip = { x: Math.max(0, p.x - 150), y: Math.max(0, p.y - 120), width: 300, height: 200 };
    const rec = { id, name: info.name, kategorie: info.kategorie, art: info.par.art };
    rec.stand = (await seite.screenshot({ clip, ...JPEG })).toString('base64');
    await halte(seite, spieler, haltezeit(info.par));
    await seite.waitForTimeout(120);
    rec.schuss = (await seite.screenshot({ clip, ...JPEG })).toString('base64');
    await loese(seite);
    await seite.waitForTimeout(500);
    // Flug: echter Schuss, Ausschnitt kurz danach (breiter, das Geschoss ist unterwegs).
    const flugClip = { x: Math.max(0, p.x - 150), y: Math.max(0, p.y - 150), width: 420, height: 250 };
    await seite.evaluate(() => window.__PA__.fire(Math.PI / 5, 55));
    await seite.waitForTimeout(260);
    rec.flug = (await seite.screenshot({ clip: flugClip, ...JPEG })).toString('base64');
    ergebnis.push(rec);
    // Nächster Zug: Zugwechsel abwarten, die Figur am Zug wechselt.
    await seite.waitForTimeout(300);
  }
  return ergebnis;
}

async function bogen(seite, recs, titel) {
  return seite.evaluate(async ({ recs: r, titel: t }) => {
    const lade = b64 => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/jpeg;base64,${b64}`; });
    const W = 440;
    const H = 280;
    const kopf = 24;
    const c = document.createElement('canvas');
    c.width = W * 3;
    c.height = kopf + H * r.length;
    const x = c.getContext('2d');
    x.fillStyle = '#16191e';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#e8ecf1';
    x.font = 'bold 14px system-ui, sans-serif';
    x.fillText(t, 8, 17);
    for (let i = 0; i < r.length; i += 1) {
      const y = kopf + i * H;
      const bilder = await Promise.all([lade(r[i].stand), lade(r[i].schuss), lade(r[i].flug)]);
      for (let j = 0; j < 3; j += 1) {
        x.drawImage(bilder[j], j * W, y, W, H - 18);
        x.strokeStyle = 'rgba(255,255,255,0.15)';
        x.strokeRect(j * W + 0.5, y + 0.5, W - 1, H - 19);
      }
      x.fillStyle = '#e8ecf1';
      x.font = 'bold 12px system-ui, sans-serif';
      x.fillText(`${r[i].id}  ${r[i].name}  (${r[i].kategorie}, ${r[i].art})    Stand | Schuss | Flug`, 8, y + H - 5);
    }
    return c.toDataURL('image/jpeg', 0.6);
  }, { recs, titel });
}

async function main() {
  const ids = arg('ids') ? arg('ids').split(',') : AUSWAHL;
  const modus = { voll: nur !== 'bogen', bogen: nur !== 'voll' };
  mkdirSync(ausgabe, { recursive: true });
  const server = await createServer({
    root: WURZEL, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error',
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...browserOptionen() });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const seite = await ctx.newPage();
    seite.on('pageerror', e => console.error('Seitenfehler:', String(e)));
    await seite.goto(`http://127.0.0.1:${port}/`);
    await seite.fill('#cfg-seed', '4');
    await seite.click('#start-button');
    await seite.waitForSelector('#menu-overlay', { state: 'hidden' });
    await seite.waitForFunction(() => Boolean(window.__PA__?.getMatch()));
    // Für die Ausschnitte nur die Zeichenfläche zeigen (kein HUD über den Figuren).
    await seite.evaluate(() => {
      document.body.style.visibility = 'hidden';
      document.querySelector('canvas').style.visibility = 'visible';
    });
    const recs = await sammle(seite, ids);
    await seite.evaluate(() => { document.body.style.visibility = ''; });
    const leer = await ctx.newPage();
    for (let i = 0; i * 3 < recs.length; i += 1) {
      const teil = recs.slice(i * 3, i * 3 + 3);
      const url = await bogen(leer, teil, `Waffen-Animation ${i + 1}: ${teil.map(r => r.id).join(', ')}`);
      const datei = path.join(ausgabe, `bogen-${String(i + 1).padStart(2, '0')}.jpg`);
      writeFileSync(datei, Buffer.from(url.split(',')[1], 'base64'));
      console.log(datei);
    }
    if (modus.voll) {
      // Die Bögen wurden mit zweifacher Auflösung aufgenommen: Spielbilder neu in einem 1x-Kontext mit 960x540.
      const ctx1 = await browser.newContext({ viewport: { width: VOLL_BREITE, height: VOLL_HOEHE }, deviceScaleFactor: 1 });
      const s1 = await ctx1.newPage();
      await s1.goto(`http://127.0.0.1:${port}/`);
      await s1.fill('#cfg-seed', '4');
      await s1.click('#start-button');
      await s1.waitForSelector('#menu-overlay', { state: 'hidden' });
      await s1.waitForFunction(() => Boolean(window.__PA__?.getMatch()));
      for (const id of (arg('ids') ? ids : VOLL_AUSWAHL)) {
        const spieler = await waffeBereit(s1, id);
        const par = await s1.evaluate(async (w) => {
          const { parameterFuerWaffe } = await import('/src/client/waffenAnimation.js');
          const { holeWaffenSprite } = await import('/src/client/waffenSprites.js');
          const waffe = window.__PA__.getWeapon(w);
          return parameterFuerWaffe(waffe, holeWaffenSprite(waffe));
        }, id);
        await halte(s1, spieler, haltezeit(par));
        await s1.waitForTimeout(120);
        writeFileSync(path.join(ausgabe, `voll-${id}.jpg`), await s1.screenshot(JPEG));
        await loese(s1);
        console.log(`voll-${id}.jpg`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
