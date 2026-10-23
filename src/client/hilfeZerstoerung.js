/**
 * Hilfe: Zerstörungstabelle (Material × Schadensart) und die Regeln für Feuer und Lava.
 *
 * Alle Zahlen kommen aus der Config (`shared/zerstoerungsTabelle.js`, `config/feuer.js`); hier steht kein
 * Wert. Die Zellen tragen das Urteil als Klasse und als Text (nicht nur als Farbe).
 *
 * @module hilfeZerstoerung
 */
import { zerstoerungsTabelle, biomStoffe, GRUPPEN_LABEL, MEHR_AB, WENIGER_BIS } from '../shared/zerstoerungsTabelle.js';
import { stoffByKey } from '../shared/config/stoffe.js';
import { FEUER, FEUERFEST } from '../shared/config/feuer.js';
import { el } from './dom.js';

const URTEIL_TEXT = Object.freeze({ mehr: 'mehr', normal: 'normal', weniger: 'weniger', haelt: 'hält' });

/** Die Tabelle Material × Schadensart. */
export function zeichneZerstoerungsTabelle(container) {
  container.append(el('h3', 'Was bei welcher Schadensart kaputtgeht'));
  container.append(el('p',
    `Zahl = Kraterradius im Vergleich zu dem, den dieselbe Waffe ohne Material stanzen würde. Ab ${Math.round(MEHR_AB * 100)} % geht ein Material `
    + `mehr kaputt, unter ${Math.round(WENIGER_BIS * 100)} % weniger, bei 0 hält es. „brennt“ und „schmilzt“ nennen die Wirkung von Hitze; `
    + 'Unzerstörbares (Metallplatte, Grundgestein) lässt jeden Krater stehen.', 'h-erklaerung'));
  const tabelle = el('table', undefined, 'h-tabelle h-zerstoerung');
  const kopf = el('tr');
  kopf.append(el('th', 'Material'), el('th', 'Härte'));
  for (const [gruppe, label] of Object.entries(GRUPPEN_LABEL)) {
    const th = el('th', label);
    th.dataset.gruppe = gruppe;
    kopf.append(th);
  }
  tabelle.append(kopf);
  for (const zeile of zerstoerungsTabelle()) {
    const tr = el('tr');
    tr.dataset.stoff = zeile.key;
    tr.append(el('th', zeile.label), el('td', zeile.haerte.replace('_', ' ')));
    for (const s of zeile.spalten) {
      const zusatz = s.reaktion === 'brennt' || s.reaktion === 'schmilzt' ? ` ${s.reaktion}` : '';
      const td = el('td', s.urteil === 'haelt' ? 'hält' : `${Math.round(s.faktor * 100)} %${zusatz}`, `h-z-${s.urteil}`);
      td.title = `${zeile.label} bei ${GRUPPEN_LABEL[s.gruppe]}: ${URTEIL_TEXT[s.urteil]} kaputt`;
      tr.append(td);
    }
    tabelle.append(tr);
  }
  container.append(tabelle);

  container.append(el('h3', 'Welche Biome aus welchem Material bestehen'));
  const { sonder } = biomStoffe();
  const liste = el('ul', undefined, 'h-liste');
  for (const b of sonder) {
    liste.append(el('li', `${b.label}: ${b.stoffe.map(k => stoffByKey(k)?.label ?? k).join(', ')}`));
  }
  container.append(liste);
}

/** Feuer, Lava und Ragnarök: die Regeln mit den Zahlen der Config. */
export function zeichneFeuerRegeln(container) {
  const sek = ticks => Math.round(ticks / 6) / 10;
  container.append(el('h3', 'Feuer, Lava und Ragnarök'));
  const [dMin, dMax] = FEUER.brenndauer;
  const liste = el('ul', undefined, 'h-liste h-feuer');
  for (const zeile of [
    `Brennbar sind Holz und Pilzgewebe. Eine Hitzewaffe entzündet sie im Einschlagradius; das Feuer springt mit ${Math.round(FEUER.ausbreitung * 100)} % je Schritt auf brennbare Nachbarn (nach oben öfter) und brennt nach ${dMin} bis ${dMax} Schritten (je ${sek(FEUER.takt)} s) zu Asche aus.`,
    `Asche ist weich und bricht leicht weg. Ausgebranntes Holz bricht mit ${Math.round(FEUER.holzDurchbrand * 100)} % Chance als Loch weg.`,
    `Wasser löscht: Eine Wasserwaffe löscht im Umkreis, Zellen unter dem Wasserspiegel brennen nicht, und nasse Zellen brennen ${sek(FEUER.nassSchritte * FEUER.takt)} s lang nicht. Eis und Schnee schmelzen in der Nähe von Lava und Feuerwaffen.`,
    `Wer in Flammen steht, nimmt ${FEUER.schadenFlamme} Feuerschaden je Schritt und fängt Brand, in Lava ${FEUER.schadenLava}. Klassen- und Archetypresistenzen gegen Feuer gelten.`,
    `Feuerfest: ${Object.entries(FEUERFEST).map(([id, f]) => `${id[0].toUpperCase()}${id.slice(1)} nimmt ${Math.round(f * 100)} %`).join(', ')} Schaden aus Flammen und Lava.`,
    'Im Vulkan brechen Lavaströme aus. Sie fallen, rinnen und erstarren nach einer Weile zu Basalt, am Wasser zu Obsidian, und bauen dabei Gelände auf.',
    'Ab Valhalla (Ragnarök) kommen Flammenwände und Lavarisse dazu, in immer kürzeren Abständen.',
  ]) liste.append(el('li', zeile));
  container.append(liste);
}
