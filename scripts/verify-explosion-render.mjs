/**
 * Prüft, dass Einschläge im lokalen Spiel tatsächlich gezeichnet werden.
 *
 * Hintergrund: `MatchController.step()` leerte die Ereignis-Warteschlange, sodass
 * Explosionen, Krater und Partikel den Renderer nie erreichten. Sichtbar war das
 * nur im Bild — kein Unit-Test hätte es gefunden. Dieses Skript misst die
 * Pixelveränderung an der Einschlagstelle.
 *
 * Aufruf: node scripts/verify-explosion-render.mjs   (Dev-Server auf 5173)
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', error => console.log('PAGEERROR', error.message));

await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => Boolean(window.__PA__));

const ergebnis = await page.evaluate(async () => {
  const api = window.__PA__;
  api.setAutoLoop(false);
  api.startMatch({ seed: 2024, teams: 2, playersPerTeam: 1 });
  api.setAutoLoop(false);

  const match = api.getMatch();
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  /** Zählt Pixel, die deutlich von Schwarz abweichen (gezeichneter Inhalt). */
  const bildStand = region => {
    const daten = ctx.getImageData(region.x, region.y, region.w, region.h).data;
    let summe = 0;
    for (let i = 0; i < daten.length; i += 4) {
      summe += daten[i] + daten[i + 1] + daten[i + 2];
    }
    return summe;
  };

  // Einmal rendern, damit das Ausgangsbild steht.
  api.game.renderer.render(match.getState(), { aim: { angle: 0, power: 60 } });

  const aktiver = match.activePlayerId;
  const spieler = match.getState().entities.find(e => e.entityId === aktiver);
  const bodenY = Math.floor(match.surfaceYAt(Math.round(spieler.x)));
  const region = { x: Math.max(0, Math.round(spieler.x) - 70), y: Math.max(0, bodenY - 40), w: 140, h: 80 };

  const vorher = bildStand(region);
  const kraterVorher = match.terrain.isDirty;

  // Senkrecht nach unten feuern: erzwingt einen Einschlag im Boden.
  api.fire(Math.PI / 2, 100);
  api.advance(60);

  // Den Renderer die aufgelaufenen Ereignisse verarbeiten lassen.
  api.game.renderer.render(match.getState(), { aim: { angle: 0, power: 60 } });
  const nachher = bildStand(region);

  return {
    vorher,
    nachher,
    differenz: nachher - vorher,
    kraterGesetzt: match.terrain.isDirty && !kraterVorher,
    partikel: api.game.renderer.particles.length,
    effekte: api.game.renderer.effects.length,
    erdbodenVorher: match.terrain.isSolid(Math.round(spieler.x), bodenY + 20),
  };
});

console.log(JSON.stringify(ergebnis, null, 2));

const zeichnet = ergebnis.differenz !== 0;
const krater = ergebnis.kraterGesetzt;
console.log(zeichnet
  ? 'OK: Die Einschlagstelle hat sich im Bild verändert.'
  : 'FEHLER: Das Bild ist an der Einschlagstelle unverändert — Ereignisse erreichen den Renderer nicht.');
console.log(krater ? 'OK: Der Krater wurde im Terrain gesetzt.' : 'FEHLER: Kein Krater im Terrain.');

await browser.close();
process.exit(zeichnet && krater ? 0 : 1);
