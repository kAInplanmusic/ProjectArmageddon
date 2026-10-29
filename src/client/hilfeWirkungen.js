/**
 * Hilfe-Reiter „Schaden und Wirkungen": Schadensarten, Mali, Waffenwirkungen und Zustandsmarken
 * in Worten.
 *
 * Alle Sätze stehen in `shared/config/wirkungstexte.js`, die Zuordnung zu Familien und Mali in
 * `shared/config/schaden.js`; hier steht kein eigener Text und keine Zahl. Die Seite entsteht in
 * `baueWirkungsSeite` (reine Daten, ohne DOM, testbar), `zeichneWirkungen` setzt sie in Elemente um.
 * Die Erklärsätze tragen die Klasse `h-erklaerung` und enthalten keine Zahlen.
 *
 * @module hilfeWirkungen
 */
import { DAMAGE_TYPE_IDS, DAMAGE_TYPE_ALIASES } from '../engine/damageTypes.js';
import { FAMILIE_VON_ART, MALUS, MALUS_SCHLUESSEL } from '../shared/config/schaden.js';
import {
  ART_TEXT, WIRKUNG_TEXT, MALUS_TEXT, STATUS_TEXT, FAMILIE_LABEL,
} from '../shared/config/wirkungstexte.js';
import { el } from './dom.js';

/**
 * @returns {{
 *   familien: {schluessel:string, label:string, arten:{art:string, label:string, text:string}[]}[],
 *   mali: {schluessel:string, label:string, symbol:string, text:string}[],
 *   wirkungen: {kind:string, label:string, text:string}[],
 *   status: {schluessel:string, label:string, text:string}[],
 * }}
 */
export function baueWirkungsSeite() {
  const familien = [];
  for (const [schluessel, label] of Object.entries(FAMILIE_LABEL)) {
    const arten = DAMAGE_TYPE_IDS
      // Stillgelegte Namen (temporal → time) stehen nicht in der Hilfe.
      .filter(art => !DAMAGE_TYPE_ALIASES[art] && FAMILIE_VON_ART[art] === schluessel)
      .map(art => ({ art, label: ART_TEXT[art].label, text: ART_TEXT[art].text }));
    if (arten.length > 0) familien.push({ schluessel, label, arten });
  }
  return {
    familien,
    mali: MALUS_SCHLUESSEL.map(k => ({ schluessel: k, label: MALUS[k].label, symbol: MALUS[k].symbol, text: MALUS_TEXT[k] })),
    wirkungen: Object.entries(WIRKUNG_TEXT).map(([kind, e]) => ({ kind, label: e.label, text: e.text })),
    status: Object.entries(STATUS_TEXT).map(([schluessel, e]) => ({ schluessel, label: e.label, text: e.text })),
  };
}

/** Zeichnet die Seite in den Hilfe-Inhalt. */
export function zeichneWirkungen(container) {
  const seite = baueWirkungsSeite();

  container.append(el('p',
    'Jede Waffe trägt eine Schadensart. Sie entscheidet, welchen Nachteil ein Treffer auslöst, wie Rüstung '
    + 'und Schild reagieren und wie das Gelände zerfällt. Was eine einzelne Waffe tut, steht im Waffenmenü. Gadgets (Fluggeräte, Haken, Kisten, Schutz) sind keine Waffen: '
    + 'Sie stehen dort in einer eigenen Gruppe.',
    'h-einleitung'));

  container.append(el('h3', 'Schadensarten'));
  const raster = el('div', undefined, 'h-karten');
  for (const familie of seite.familien) {
    const karte = el('div', undefined, 'h-karte');
    karte.dataset.familie = familie.schluessel;
    karte.append(el('h3', familie.label));
    for (const art of familie.arten) {
      const zeile = el('p', undefined, 'h-erklaerung');
      zeile.dataset.art = art.art;
      zeile.append(el('strong', `${art.label}: `), document.createTextNode(art.text));
      karte.append(zeile);
    }
    raster.append(karte);
  }
  container.append(raster);

  container.append(el('h3', 'Nachteile durch Treffer'));
  const maliKarten = el('div', undefined, 'h-karten');
  for (const m of seite.mali) {
    const karte = el('div', undefined, 'h-karte');
    karte.dataset.malus = m.schluessel;
    karte.append(el('h3', `${m.symbol} ${m.label}`));
    karte.append(el('p', m.text, 'h-erklaerung'));
    maliKarten.append(karte);
  }
  container.append(maliKarten);

  container.append(el('h3', 'Wirkungen der Waffen'));
  const wirkListe = el('ul', undefined, 'h-liste');
  for (const w of seite.wirkungen) {
    const punkt = el('li');
    punkt.dataset.wirkung = w.kind;
    punkt.append(el('strong', `${w.label}: `), document.createTextNode(w.text));
    wirkListe.append(punkt);
  }
  container.append(wirkListe);

  container.append(el('h3', 'Marken an den Figuren'));
  const statusListe = el('ul', undefined, 'h-liste');
  for (const s of seite.status) {
    const punkt = el('li');
    punkt.dataset.status = s.schluessel;
    punkt.append(el('strong', `${s.label}: `), document.createTextNode(s.text));
    statusListe.append(punkt);
  }
  container.append(statusListe);
}
