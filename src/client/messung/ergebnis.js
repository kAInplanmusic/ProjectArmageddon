/**
 * Das Ergebnisformat der Messseite: Schema-Prüfung, Textfassung und Tabellenzeilen.
 *
 * Das JSON (`schema: 'pa-messung/1'`) ist das, was der Nutzer per „Ergebnis kopieren“ oder „Teilen“
 * schickt. Alle Zeiten in Millisekunden, soweit nicht anders benannt; Bildzeiten heißen wie im
 * Profiling-Test (`mittel`, `p50`, `p95`, `p99`, `max`, `ueber16`, `ueber33`, `fps`).
 *
 * @module messung/ergebnis
 */
import { runde } from './statistik.js';

export const SCHEMA_KENNUNG = 'pa-messung/1';
export const STATUS_ERGEBNIS = Object.freeze(['fertig', 'unvollstaendig', 'abgebrochen']);
export const STATUS_SZENE = Object.freeze(['ok', 'fehler', 'uebersprungen']);

const istZahl = w => typeof w === 'number' && Number.isFinite(w);
const istZahlOderNull = w => w === null || istZahl(w);
const istText = w => typeof w === 'string' && w.length > 0;

/**
 * Prüft ein Messergebnis gegen das Schema. Gibt die Liste der Verstöße zurück (leer = gültig).
 * @param {unknown} e
 * @returns {string[]}
 */
export function pruefeErgebnis(e) {
  const f = [];
  const muss = (bedingung, text) => { if (!bedingung) f.push(text); };
  if (!e || typeof e !== 'object') return ['Ergebnis ist kein Objekt'];
  muss(e.schema === SCHEMA_KENNUNG, `schema ist nicht ${SCHEMA_KENNUNG}`);
  muss(istText(e.plan), 'plan fehlt');
  muss(istText(e.gestartet) && !Number.isNaN(Date.parse(e.gestartet)), 'gestartet ist kein Zeitstempel');
  muss(e.beendet === null || (istText(e.beendet) && !Number.isNaN(Date.parse(e.beendet))), 'beendet ist kein Zeitstempel');
  muss(STATUS_ERGEBNIS.includes(e.status), `status unbekannt: ${e.status}`);

  const g = e.geraet;
  if (!g || typeof g !== 'object') {
    muss(false, 'geraet fehlt');
  } else {
    muss(istText(g.ua), 'geraet.ua fehlt');
    muss(istZahl(g.devicePixelRatio) && g.devicePixelRatio > 0, 'geraet.devicePixelRatio fehlt');
    muss(istZahl(g.bildschirm?.breite) && istZahl(g.bildschirm?.hoehe), 'geraet.bildschirm fehlt');
    muss(istZahl(g.fenster?.breite) && istZahl(g.fenster?.hoehe), 'geraet.fenster fehlt');
    muss(g.webgl === null || (typeof g.webgl === 'object' && 'renderer' in g.webgl), 'geraet.webgl ungültig');
    muss(g.softwareRasterung === null || typeof g.softwareRasterung === 'boolean', 'geraet.softwareRasterung ungültig');
  }
  muss(e.leertakt === null || (istZahl(e.leertakt?.mittel) && istZahl(e.leertakt?.hz)), 'leertakt ungültig');

  if (!Array.isArray(e.szenen) || e.szenen.length === 0) {
    muss(false, 'szenen fehlt oder ist leer');
  } else {
    e.szenen.forEach((s, i) => {
      const n = `szenen[${i}]`;
      muss(istText(s?.id) && istText(s?.titel), `${n}: id/titel fehlt`);
      muss(STATUS_SZENE.includes(s?.status), `${n}: status unbekannt (${s?.status})`);
      if (s?.status === 'fehler') muss(istText(s.fehler), `${n}: Fehlertext fehlt`);
      if (s?.status !== 'ok') return;
      muss(istZahl(s.karte?.breite) && istZahl(s.karte?.hoehe) && istZahl(s.karte?.pixelMio), `${n}: karte fehlt`);
      muss(istZahl(s.ladezeitMs), `${n}: ladezeitMs fehlt`);
      muss(istZahl(s.matchAufbauMs), `${n}: matchAufbauMs fehlt`);
      const t = s.terrainNeuaufbau;
      muss(t && istZahl(t.mittel) && istZahl(t.max) && istZahl(t.pixel) && istZahl(t.laeufe) && istZahl(t.msProMioPixel), `${n}: terrainNeuaufbau unvollständig`);
      muss(istZahlOderNull(s.gradingAufbauMs), `${n}: gradingAufbauMs ungültig`);
      muss(s.speicher === null || istZahl(s.speicher?.jsHeapMB), `${n}: speicher ungültig`);
      if (!Array.isArray(s.phasen) || s.phasen.length === 0) { muss(false, `${n}: phasen fehlt`); return; }
      s.phasen.forEach((p, j) => {
        const m = `${n}.phasen[${j}]`;
        muss(istText(p?.id), `${m}: id fehlt`);
        for (const k of ['bilder', 'mittel', 'p50', 'p95', 'p99', 'max', 'fps', 'dauerMs']) muss(istZahl(p?.[k]), `${m}: ${k} fehlt`);
        muss(typeof p?.abgebrochen === 'boolean', `${m}: abgebrochen fehlt`);
        muss(p?.bilder > 0, `${m}: keine Bilder gemessen`);
      });
    });
  }
  const gs = e.gesamt;
  muss(gs && istZahl(gs.dauerMs) && istZahl(gs.szenenOk) && istZahl(gs.szenenFehler) && istZahl(gs.szenenUebersprungen), 'gesamt unvollständig');
  return f;
}

/** Eine Phase für die Ausgabe runden (zwei Nachkommastellen). */
export function rundePhase(stat, zusatz = {}) {
  return {
    ...zusatz,
    bilder: stat.bilder,
    mittel: runde(stat.mittel),
    p50: runde(stat.p50),
    p95: runde(stat.p95),
    p99: runde(stat.p99),
    max: runde(stat.max),
    ueber16: stat.ueber16,
    ueber33: stat.ueber33,
    fps: runde(stat.fps, 1),
  };
}

const sek = ms => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`);
const ms1 = w => (w === null || w === undefined ? '–' : w.toFixed(1));

/**
 * Tabellenzeilen für die Anzeige: `aufbau` (eine Zeile je Szene) und `bilder` (eine Zeile je Phase).
 * @param {object} e Ergebnis
 */
export function tabellenZeilen(e) {
  const aufbau = e.szenen.map(s => (s.status === 'ok'
    ? [s.titel, `${s.karte.breite}×${s.karte.hoehe}`, sek(s.ladezeitMs), sek(s.matchAufbauMs), sek(s.terrainNeuaufbau.mittel),
      s.gradingAufbauMs === null ? '–' : sek(s.gradingAufbauMs), s.speicher ? `${s.speicher.jsHeapMB} MB` : '–']
    : [s.titel, '–', '–', '–', '–', '–', s.status === 'fehler' ? `Fehler: ${s.fehler}` : 'übersprungen (Zeitgrenze)']));
  const bilder = [];
  for (const s of e.szenen) {
    if (s.status !== 'ok') continue;
    for (const p of s.phasen) {
      bilder.push([s.titel, p.titel ?? p.id, String(p.bilder), ms1(p.mittel), ms1(p.p95), ms1(p.max), p.fps.toFixed(1),
        p.abgebrochen ? 'Zeitgrenze' : '']);
    }
  }
  return { aufbau, bilder };
}

export const KOPF_AUFBAU = Object.freeze(['Szene', 'Karte', 'Laden', 'Match-Aufbau', 'Terrain neu', 'Grading', 'JS-Speicher / Hinweis']);
export const KOPF_BILDER = Object.freeze(['Szene', 'Phase', 'Bilder', 'Mittel ms', 'p95 ms', 'max ms', 'fps', '']);

/** Kurzfazit in einem Satz: die langsamste Phase. */
export function fazit(e) {
  let schlecht = null;
  for (const s of e.szenen) {
    if (s.status !== 'ok') continue;
    for (const p of s.phasen) if (!schlecht || p.fps < schlecht.p.fps) schlecht = { s, p };
  }
  if (!schlecht) return 'Keine Szene ist durchgelaufen.';
  return `Langsamste Phase: ${schlecht.s.titel}, ${schlecht.p.titel ?? schlecht.p.id} mit ${schlecht.p.fps.toFixed(1)} fps `
    + `(Mittel ${ms1(schlecht.p.mittel)} ms, p95 ${ms1(schlecht.p.p95)} ms).`;
}

/** Dateiname für „Als Datei sichern/teilen“. */
export function dateiname(e) {
  const tag = String(e.gestartet).slice(0, 16).replace(/[-:T]/g, '');
  return `pa-messung-${tag}.json`;
}
