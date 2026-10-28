/**
 * Boden-Eigenschaften und Waffen-zu-Gelände-Matrix — reine Lesesicht auf den Stoffkatalog (`config/stoffe.js`).
 *
 * Drei Eigenschaften je Boden, abgeleitet aus den vorhandenen Stoffdaten:
 *   - Härte        wie viel vom Krater übrig bleibt (`haerte`, `radius`)          → weich … unzerstörbar
 *   - Haftung      wie rutschig der Boden ist (`reibung`)                          → rutschig, normal, griffig
 *   - Nachgiebigkeit  wie stark er die Figur bremst bzw. nicht trägt (`bremst`, `traegt`, `versinkt`) → fest, weich, tief, trägt nicht
 *
 * Die Matrix gibt je Wirkgruppe der Schadensart (Wucht, Hitze, Kälte, Ätz, Strom, Nass) den Radiusfaktor auf den Krater
 * und die Sonderwirkung (brennt weiter, schmilzt, bricht in Splitter). Nichts hier verändert Spielregeln, Hash oder Replays;
 * die Engine liest weiter direkt aus dem Katalog.
 *
 * @module materialMatrix
 */
import { STOFFE, WIRKGRUPPEN } from './config/stoffe.js';

export const HAFTUNG_STUFEN = Object.freeze(['rutschig', 'glatt', 'normal', 'griffig']);
export const NACHGIEBIGKEIT_STUFEN = Object.freeze(['fest', 'weich', 'tief', 'traegt nicht']);

/** Haftung aus dem Reibungsfaktor (1 = Erde). Fehlt der Wert, gilt normal. */
export function haftungVon(reibung) {
  if (typeof reibung !== 'number') return 'normal';
  if (reibung < 0.3) return 'rutschig';
  if (reibung < 0.85) return 'glatt';
  if (reibung <= 1.05) return 'normal';
  return 'griffig';
}

/** Nachgiebigkeit aus Bremswirkung und Tragfähigkeit. */
export function nachgiebigkeitVon(stoff) {
  if (stoff.traegt === false || stoff.versinkt) return 'traegt nicht';
  const b = stoff.bremst ?? 0;
  if (b >= 0.3) return 'tief';
  if (b >= 0.1) return 'weich';
  return 'fest';
}

/** Die drei Eigenschaften eines Stoffs. */
export function bodenEigenschaften(stoff) {
  return {
    haerte: stoff.haerte,
    haftung: haftungVon(stoff.reibung),
    nachgiebigkeit: nachgiebigkeitVon(stoff),
  };
}

/** Sonderwirkung bei Hitze/Wucht als kurzer Text (leer, wenn keine). */
export function sonderwirkung(stoff) {
  const teile = [];
  if (stoff.brennbar) teile.push('brennt');
  if (stoff.schmelzbar) teile.push('schmilzt');
  if (stoff.bruechig) teile.push(`splittert (${stoff.bruechig})`);
  return teile.join(', ');
}

/** Radiusfaktor einer Wirkgruppe auf einen Stoff (Grundfaktor mal Anfälligkeit; unzerstörbar = 0). */
export function wirkfaktor(stoff, gruppe) {
  if (stoff.haerte === 'unzerstoerbar') return 0;
  return Math.round(stoff.radius * (stoff.anfaellig?.[gruppe] ?? 1) * 100) / 100;
}

/** Die ganze Matrix: je Stoff eine Zeile mit Eigenschaften, Faktoren je Wirkgruppe und Sonderwirkung. */
export function materialMatrix() {
  return STOFFE.map(s => ({
    id: s.id,
    key: s.key,
    label: s.label ?? s.key,
    ...bodenEigenschaften(s),
    faktoren: Object.fromEntries(WIRKGRUPPEN.map(g => [g, wirkfaktor(s, g)])),
    sonder: sonderwirkung(s),
  }));
}

/** Markdown-Tabelle der Matrix (für `docs/terrain-matrix.md`). */
export function matrixAlsMarkdown() {
  const kopf = ['Stoff', 'Härte', 'Haftung', 'Nachgiebigkeit', ...WIRKGRUPPEN, 'Sonderwirkung'];
  const zeilen = [`| ${kopf.join(' | ')} |`, `|${kopf.map(() => '---').join('|')}|`];
  for (const z of materialMatrix()) {
    zeilen.push(`| ${[z.label, z.haerte, z.haftung, z.nachgiebigkeit, ...WIRKGRUPPEN.map(g => z.faktoren[g]), z.sonder || '–'].join(' | ')} |`);
  }
  return zeilen.join('\n');
}
