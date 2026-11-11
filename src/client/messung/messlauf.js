/**
 * Der Messlauf der Messseite: spielt die Szenen des Plans ohne Server und ohne Zutun ab und misst.
 *
 * ## Wie das Spiel in die Messung kommt
 *
 * Jede Szene läuft in einem frischen, bildschirmgroßen `iframe` mit dem echten Spiel (`index.html`). Der
 * Frame bekommt den Text der Seite als `srcdoc` statt als `src`: Die Auslieferung setzt
 * `X-Frame-Options: DENY` (netlify.toml, Frame-Schutz), ein `src`-Frame würde dort verweigert. Ein
 * `srcdoc`-Dokument hat keine eigene Antwort und damit keinen solchen Kopf; seine Skripte laden über
 * `<base href>` vom selben Ursprung. Der Schutz gegen fremdes Einbetten bleibt unberührt. Ein frischer
 * Frame je Szene gibt den Speicher der vorigen Karte wieder frei (wichtig auf dem iPhone).
 *
 * Gemessen wird mit dem Bildtakt des Frames (`requestAnimationFrame` seines Fensters), also derselbe
 * Takt, in dem das Spiel zeichnet. Die Kennzahlen rechnet `statistik.js` (dieselben wie der
 * Profiling-Test), der Terrain-Neuaufbau ruft wie dieser `renderer.buildTerrainLayer` auf.
 *
 * ## Absturzspur
 *
 * Nach jeder Szene und vor der nächsten wird der Stand in `localStorage` gesichert. Lädt der Browser die
 * Seite während einer Szene neu (iOS beendet Seiten bei Speichermangel), zeigt die Messseite beim
 * nächsten Öffnen die bisherigen Ergebnisse samt der Szene, bei der es endete — auch das ist ein Befund.
 *
 * @module messung/messlauf
 */
import { bildStatistik, mittelUndMax, runde } from './statistik.js';
import { PHASEN, SZENEN, MESS_SEED, laeufeFuer } from './plan.js';
import { rundePhase, SCHEMA_KENNUNG } from './ergebnis.js';

export const SPEICHER_SCHLUESSEL = 'pa.messung.lauf.v1';
const jetzt = () => performance.now();
const warte = ms => new Promise(r => setTimeout(r, ms));

/** Geräteangaben. WebGL-Renderer nur, wenn der Browser ihn freigibt (Safari/Firefox verbergen ihn teils). */
export function sammleGeraet(win = window) {
  const nav = win.navigator;
  let webgl = null;
  try {
    const c = win.document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (gl) {
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      webgl = {
        version: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1,
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        rendererFrei: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null,
        vendorFrei: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : null,
        maxTextur: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        freigegeben: Boolean(d),
      };
    }
  } catch { webgl = null; }
  const name = webgl ? `${webgl.rendererFrei ?? ''} ${webgl.renderer ?? ''}` : '';
  const ausricht = win.screen?.orientation?.type ?? (win.innerWidth >= win.innerHeight ? 'landscape' : 'portrait');
  return {
    ua: nav.userAgent,
    sprache: nav.language ?? null,
    devicePixelRatio: win.devicePixelRatio || 1,
    bildschirm: { breite: win.screen?.width ?? 0, hoehe: win.screen?.height ?? 0 },
    fenster: { breite: win.innerWidth, hoehe: win.innerHeight },
    ausrichtung: ausricht,
    kerne: nav.hardwareConcurrency ?? null,
    geraeteSpeicherGB: nav.deviceMemory ?? null,
    touchPunkte: nav.maxTouchPoints ?? 0,
    reduzierteBewegung: Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    webgl,
    /** `null`, wenn der Renderer nicht lesbar ist; sonst ob er nach Software-Rasterung klingt (SwiftShader, llvmpipe). */
    softwareRasterung: webgl && webgl.freigegeben ? /swiftshader|llvmpipe|software/i.test(name) : null,
  };
}

/** Bildtakt ohne Spiel: Untergrund der Anzeige (60/120 Hz, Stromsparmodus mit 30 Hz). */
export async function messeLeertakt(win, bilder) {
  const zeiten = await sammleBilder(win, { bilder: bilder + 1, maxMs: 4000 });
  const stat = bildStatistik(zeiten.zeiten.slice(1));
  if (!stat.bilder) return null;
  return { bilder: stat.bilder, mittel: runde(stat.mittel), p95: runde(stat.p95), max: runde(stat.max), hz: runde(stat.fps, 1) };
}

/**
 * Sammelt Bildzeiten im Bildtakt von `win`.
 * @param {Window} win
 * @param {{bilder:number, maxMs:number, beiBild?:(i:number)=>void}} o
 * @returns {Promise<{zeiten:number[], dauerMs:number, abgebrochen:boolean}>}
 */
export function sammleBilder(win, { bilder, maxMs, beiBild = null }) {
  return new Promise(resolve => {
    const zeiten = [];
    const start = jetzt();
    let vorher = null;
    let fertig = false;
    const ende = abgebrochen => {
      if (fertig) return;
      fertig = true;
      clearTimeout(notbremse);
      resolve({ zeiten, dauerMs: jetzt() - start, abgebrochen });
    };
    // Steht der Bildtakt still (Seite verdeckt, Gerät gesperrt), kommt kein Bild mehr: Notbremse mit setTimeout.
    const notbremse = setTimeout(() => ende(true), maxMs + 6000);
    const bild = t => {
      if (fertig) return;
      if (vorher !== null) zeiten.push(t - vorher);
      vorher = t;
      if (beiBild) { try { beiBild(zeiten.length); } catch { /* Aktion darf die Messung nicht abbrechen */ } }
      if (zeiten.length >= bilder) return ende(false);
      if (jetzt() - start >= maxMs) return ende(true);
      win.requestAnimationFrame(bild);
    };
    win.requestAnimationFrame(bild);
  });
}

/** Text der Spielseite holen und für den `srcdoc`-Frame vorbereiten (Basisadresse, Zugangsschicht ausblenden). */
export async function holeSpielSeite(doc = document) {
  const basis = new URL('./', doc.baseURI).href;
  const antwort = await fetch(new URL('index.html', basis), { cache: 'force-cache' });
  if (!antwort.ok) throw new Error(`index.html nicht ladbar (HTTP ${antwort.status})`);
  const text = await antwort.text();
  /*
   * Die Zugangsschicht des Web-Builds (`#pa-web-start`, Login/Startknopf) würde das Spielfeld verdecken
   * und es aus dem Bildaufbau nehmen; die Messung braucht sie nicht (lokales Match, kein Server).
   */
  const einschub = `<base href="${basis}"><style>#pa-web-start{display:none!important}</style>`;
  return /<head[^>]*>/i.test(text) ? text.replace(/<head[^>]*>/i, m => m + einschub) : einschub + text;
}

/** Legt den Frame an und wartet, bis `window.__PA__` steht. */
async function oeffneSpiel(doc, seitenText, grenzeMs = 90_000) {
  const frame = doc.createElement('iframe');
  frame.title = 'Messszene';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#000;z-index:1';
  const start = jetzt();
  frame.srcdoc = seitenText;
  doc.body.append(frame);
  while (jetzt() - start < grenzeMs) {
    const w = frame.contentWindow;
    if (w?.__PA__?.game?.renderer) return { frame, win: w, ladezeitMs: jetzt() - start };
    await warte(25);
  }
  frame.remove();
  throw new Error(`Spiel nach ${Math.round(grenzeMs / 1000)} s nicht bereit (window.__PA__ fehlt)`);
}

function schliesse(frame) {
  try { frame.srcdoc = ''; frame.src = 'about:blank'; } catch { /* egal */ }
  frame.remove();
}

/** Speicher des Frames, soweit der Browser ihn nennt (nur Chromium: `performance.memory`). */
function leseSpeicher(win) {
  const m = win.performance?.memory;
  if (!m) return null;
  return { jsHeapMB: runde(m.usedJSHeapSize / 1048576, 1), gesamtMB: runde(m.totalJSHeapSize / 1048576, 1), grenzeMB: runde(m.jsHeapSizeLimit / 1048576, 1) };
}

/** Wasserfeld: ein paar Zeilen im unteren Kartendrittel füllen (über die Diagnose-Schnittstelle, wie `water-hud.spec`). */
function setzeWasser(pa) {
  const { MAP_WIDTH, MAP_HEIGHT, WATER_SCALE } = pa.constants;
  const m = pa.getMatch();
  const breite = m?.width ?? MAP_WIDTH;
  const hoehe = m?.height ?? MAP_HEIGHT;
  let gesetzt = 0;
  for (let zeile = 0; zeile < 6; zeile += 1) {
    const y = Math.floor(hoehe * 0.72) + zeile * WATER_SCALE * 2;
    for (let x = 0; x < breite; x += WATER_SCALE) if (pa.setWaterLevelAt(x, y, 0.9)) gesetzt += 1;
  }
  return gesetzt;
}

/**
 * Eine Explosion zeichnen lassen, genau auf dem Weg des Ereignisses `explosion` (`ereignisse.js`): Krater in
 * der Geländeebene samt Splittern und Narbe, Blitz, Einschlag-Sheet. Nur die Anzeige: Die Kollisionsmaske des
 * Matches bleibt unberührt, damit die Szene wiederholbar ist (ein echter Schuss fällt je Zug nur einmal).
 */
function zeigeExplosion(renderer, i) {
  const q = renderer.terrainSource;
  if (!q) return false;
  const x = Math.floor(q.width * (0.2 + 0.6 * ((i * 0.618) % 1)));
  let y = Math.floor(q.height * 0.6);
  for (let z = 0; z < q.height; z += 1) if (q.bitmap[z * q.width + x]) { y = z; break; }
  const radius = 36 + (i % 4) * 14;
  renderer.applyCrater(x, y, radius);
  renderer.addFlash?.(x, y, radius * 1.4, {});
  renderer.sheetEinschlag?.(x, y, radius, null);
  renderer.merkeEinschlag?.(x, y);
  return true;
}

/** Eine Phase messen (Kamera, Aktion, Bildtakt). */
async function messePhase(win, pa, phase, plan, karte) {
  const game = pa.game;
  const kamera = game.kamera;
  if (phase.zoom !== null) {
    game.kameraRegie?.uebersteuere?.(); // die Automatik (folgt der Figur) schweigt, die Fahrt führt
    kamera?.setzeZoom?.(phase.zoom === 'ganz' ? kamera.zoomGanzeKarte : phase.zoom);
  }
  await warte(60);

  let schuesse = 0;
  let explosionen = 0;
  let wasserZellen = 0;
  if (phase.aktion === 'wasser') wasserZellen = setzeWasser(pa);
  const beiBild = i => {
    if (phase.aktion === 'schuesse') {
      // Echte Schüsse (einer je Zug: der erste Aufruf beendet die Zugpause, der nächste schießt)…
      if (i % (plan.explosionsAbstand * 3) === 1) {
        const r = pa.fire(0.5 + ((i * 7) % 11) * 0.12, 70 + (i % 5) * 6);
        if (r?.ok && r.projectileId !== undefined) schuesse += 1;
      }
      // …und zusätzlich Einschläge im Takt, damit Krater, Splitter und Blitze auch ohne Schusserlaubnis zählen.
      if (i % plan.explosionsAbstand === 1 && zeigeExplosion(game.renderer, i)) explosionen += 1;
    }
    if (phase.aktion === 'fahrt' && kamera && phase.zoom !== 'ganz') {
      const anteil = i / Math.max(1, plan.bilderProPhase);
      kamera.zieleAuf(karte.breite * (0.15 + 0.7 * anteil), karte.hoehe * 0.6, true);
    }
  };
  const roh = await sammleBilder(win, { bilder: plan.bilderProPhase + 1, maxMs: plan.maxMsProPhase, beiBild });
  const stat = bildStatistik(roh.zeiten.slice(1)); // das erste Delta ist der Anlauf
  return rundePhase(stat, {
    id: phase.id,
    titel: phase.titel,
    zoom: runde(kamera?.zoom ?? 0, 3),
    dauerMs: Math.round(roh.dauerMs),
    abgebrochen: roh.abgebrochen,
    schuesse,
    explosionen,
    wasserZellen,
  });
}

/** Terrain neu aufbauen und die Zeiten sammeln (wie der Profiling-Test: `renderer.buildTerrainLayer`). */
function baueTerrainNeu(renderer, laeufe) {
  const q = renderer.terrainSource;
  if (!q) return null;
  const zeiten = [];
  for (let i = 0; i < laeufe; i += 1) {
    const t = jetzt();
    renderer.buildTerrainLayer(q.bitmap, q.width, q.height);
    zeiten.push(jetzt() - t);
  }
  return { zeiten, breite: q.width, hoehe: q.height };
}

/** Eine Szene laufen lassen. Wirft nicht: Fehler stehen im Ergebnis. */
export async function messeSzene(doc, seitenText, szene, plan) {
  const ergebnis = { id: szene.id, titel: szene.titel, format: szene.format, groesse: szene.groesse, biom: szene.biom, spieler: 2 * szene.spielerProTeam, status: 'fehler', fehler: null, karte: null, ladezeitMs: null, matchAufbauMs: null, bereitMs: null, terrainNeuaufbau: null, gradingAufbauMs: null, grafik: null, speicher: null, seitenfehler: 0, phasen: [] };
  let spiel = null;
  try {
    spiel = await oeffneSpiel(doc, seitenText);
    const { win } = spiel;
    ergebnis.ladezeitMs = Math.round(spiel.ladezeitMs);
    let fehler = 0;
    let ersterFehler = null;
    win.addEventListener('error', e => { fehler += 1; ersterFehler ??= String(e.message ?? e); });
    win.addEventListener('unhandledrejection', e => { fehler += 1; ersterFehler ??= String(e.reason); });
    const pa = win.__PA__;
    pa.setAutoLoop(true);

    // Match-Aufbau: Karte (Generator), Gelände, Grading — der synchrone Teil von `startMatch`.
    const t0 = jetzt();
    const r = pa.startMatch({
      teams: 2, playersPerTeam: szene.spielerProTeam, preset: 'hills', kartentyp: 'autonom', seed: MESS_SEED,
      backdropKey: 'automatisch', biom: szene.biom ?? 'klassisch', mapSize: szene.groesse, mapFormat: szene.format,
    });
    ergebnis.matchAufbauMs = Math.round(jetzt() - t0);
    if (!r?.ok) throw new Error(`startMatch abgelehnt: ${JSON.stringify(r)}`);
    // Ladebild (Texturen, Figuren) abwarten: bis dahin ist die Szene nicht spielbereit.
    while (win.document.querySelector('.ladebild') && jetzt() - t0 < 12_000) await warte(40);
    ergebnis.bereitMs = Math.round(jetzt() - t0);
    await warte(400);

    const renderer = pa.game.renderer;
    const q = renderer.terrainSource;
    if (!q) throw new Error('Kein Terrain-Quellbild (renderer.terrainSource)');
    ergebnis.karte = { breite: q.width, hoehe: q.height, pixelMio: runde((q.width * q.height) / 1e6, 2) };
    const g = pa.grafik?.();
    ergebnis.grafik = g ? { wahl: g.wahl ?? null, stufe: g.stufe ?? null } : null;

    // Grading-Aufbau: Neuaufbau OHNE Biom-Grading, danach (wieder mit) die eigentliche Messreihe; Differenz = Grading.
    const laeufe = laeufeFuer(szene, plan);
    let ohneMs = null;
    const biomVorher = renderer.gelaendeBiom ?? null;
    if (biomVorher) {
      renderer.gelaendeBiom = null;
      ohneMs = baueTerrainNeu(renderer, 1)?.zeiten[0] ?? null;
      renderer.gelaendeBiom = biomVorher;
    }
    const neu = baueTerrainNeu(renderer, laeufe);
    const { mittel, max } = mittelUndMax(neu.zeiten);
    const pixel = neu.breite * neu.hoehe;
    ergebnis.terrainNeuaufbau = { laeufe: neu.zeiten.length, mittel: Math.round(mittel), max: Math.round(max), pixel, msProMioPixel: runde(mittel / (pixel / 1e6), 1) };
    ergebnis.gradingAufbauMs = ohneMs === null ? null : Math.round(mittel - ohneMs);

    for (const phase of PHASEN) ergebnis.phasen.push(await messePhase(win, pa, phase, plan, ergebnis.karte));
    ergebnis.speicher = leseSpeicher(win);
    ergebnis.seitenfehler = fehler;
    if (ersterFehler) ergebnis.ersterSeitenfehler = ersterFehler;
    ergebnis.status = 'ok';
  } catch (e) {
    ergebnis.status = 'fehler';
    ergebnis.fehler = String(e?.message ?? e);
  } finally {
    if (spiel) schliesse(spiel.frame);
  }
  return ergebnis;
}

/** Stand sichern (Absturzspur). Fehler beim Speichern (privater Modus, voll) sind kein Grund abzubrechen. */
export function sichereSpur(stand) {
  try { localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(stand)); } catch { /* ohne Spur weiter */ }
}

/** Liest die Spur der letzten Messung (oder `null`). */
export function liesSpur() {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    return roh ? JSON.parse(roh) : null;
  } catch { return null; }
}

async function holeBauinfo(doc) {
  try {
    const a = await fetch(new URL('version.json', new URL('./', doc.baseURI)), { cache: 'no-store' });
    if (!a.ok || !String(a.headers.get('content-type')).includes('json')) return null;
    const j = await a.json();
    return { version: j.version ?? null, gitSha: j.gitSha ?? j.git ?? null, bauzeit: j.bauzeit ?? j.builtAt ?? null };
  } catch { return null; }
}

/**
 * Der ganze Lauf.
 *
 * @param {object} o
 * @param {Document} o.doc
 * @param {object} o.plan                 aus `plan.js`
 * @param {(info:{szene:number, von:number, titel:string, phase?:string})=>void} [o.beiFortschritt]
 * @param {{abgebrochen:boolean}} [o.abbruch]  vom Aufrufer gesetzt, um zwischen den Szenen zu stoppen
 * @returns {Promise<object>} Messergebnis (Schema `pa-messung/1`)
 */
export async function fuehreMessungAus({ doc = document, plan, beiFortschritt = () => {}, abbruch = { abgebrochen: false } }) {
  const start = jetzt();
  const gestartet = new Date().toISOString();
  let wachhalten = false;
  let sperre = null;
  try { sperre = await navigator.wakeLock?.request?.('screen'); wachhalten = Boolean(sperre); } catch { wachhalten = false; }

  const e = {
    schema: SCHEMA_KENNUNG, plan: plan.id, gestartet, beendet: null, status: 'unvollstaendig', hinweis: null,
    bauinfo: await holeBauinfo(doc), seite: { adresse: doc.location.origin + doc.location.pathname, host: doc.location.host },
    geraet: { ...sammleGeraet(window), wachhalten }, leertakt: null, szenen: [],
    gesamt: { dauerMs: 0, szenenOk: 0, szenenFehler: 0, szenenUebersprungen: 0 },
  };
  const merke = (aktuell = null) => sichereSpur({ status: 'laeuft', aktuelleSzene: aktuell, ergebnis: e });

  try {
    e.leertakt = await messeLeertakt(window, plan.leertaktBilder);
    const seitenText = await holeSpielSeite(doc);
    for (let i = 0; i < SZENEN.length; i += 1) {
      const szene = SZENEN[i];
      if (abbruch.abgebrochen) { e.hinweis = 'Vom Nutzer abgebrochen.'; break; }
      if (jetzt() - start > plan.gesamtgrenzeMs) {
        e.szenen.push({ id: szene.id, titel: szene.titel, status: 'uebersprungen', fehler: null });
        e.gesamt.szenenUebersprungen += 1;
        continue;
      }
      beiFortschritt({ szene: i + 1, von: SZENEN.length, titel: szene.titel });
      merke(szene.id);
      const s = await messeSzene(doc, seitenText, szene, plan);
      e.szenen.push(s);
      if (s.status === 'ok') e.gesamt.szenenOk += 1; else e.gesamt.szenenFehler += 1;
      merke(null);
      await warte(150); // dem Browser Zeit lassen, den Frame zu räumen
    }
    e.status = abbruch.abgebrochen ? 'abgebrochen' : (e.gesamt.szenenUebersprungen > 0 ? 'unvollstaendig' : 'fertig');
    if (e.status === 'unvollstaendig') e.hinweis = 'Zeitgrenze erreicht: spätere Szenen wurden übersprungen.';
  } catch (fehler) {
    e.status = 'abgebrochen';
    e.hinweis = `Messlauf abgebrochen: ${String(fehler?.message ?? fehler)}`;
  } finally {
    try { await sperre?.release?.(); } catch { /* egal */ }
  }
  if (e.szenen.length === 0) e.szenen.push({ id: 'keine', titel: 'keine Szene gelaufen', status: 'fehler', fehler: e.hinweis ?? 'unbekannt' });
  e.beendet = new Date().toISOString();
  e.gesamt.dauerMs = Math.round(jetzt() - start);
  sichereSpur({ status: 'fertig', aktuelleSzene: null, ergebnis: e });
  return e;
}
