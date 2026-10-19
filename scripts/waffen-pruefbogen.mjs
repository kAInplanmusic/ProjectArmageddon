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
 *   node scripts/waffen-pruefbogen.mjs [--kategorie melee] [--ids pa_001,pa_002]
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
      if (fig) {
        figuren.zeichneFigurSprite(ctx, fig, {
          team: '#4cc9f0', winkel: po.winkel, aktiv: false, zeit: 0, reduziert: true, pose: null,
        });
      }
      if (sp) {
        zeit.idle = 0;
        zeit.seitZiehen = Infinity;
        // Schuss: Zeitpunkt des stärksten Blitzes bzw. Glanzes.
        zeit.seitSchuss = po.schuss ? par.aufladen + 0.012 : Infinity;
        zeit.bereit = 1;
        zeit.treffer = 0;
        anim.waffenPose(par, zeit, !po.schuss, pose);
        anim.handPunkt(par, Math.cos(po.winkel), 52, 10, hand);
        figuren.zeichneWaffeSprite(ctx, sp, par, pose, { winkel: po.winkel, handX: hand.x, handY: hand.y });

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
  } finally {
    await browser.close();
    await server.close();
  }
  return ergebnisse;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
