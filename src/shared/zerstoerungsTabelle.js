/**
 * Zerstörungstabelle: Welches Material bei welcher Schadensart mehr oder weniger kaputtgeht.
 *
 * Alle Zahlen werden aus der Stoffkonfiguration GERECHNET (`config/stoffe.js`, `stoffWirkung` in der
 * Feinfassung der Zerstörung 7), nicht abgetippt: Die Hilfe (`client/hilfeZerstoerung.js`) und die
 * Wirkungsübersicht (`scripts/build-matrix.mjs`) lesen dieselbe Quelle wie der Motor. Ein Faktor ist das
 * Verhältnis des Kraters zu dem, den dieselbe Waffe ohne Stoff gestanzt hätte (1,00 = unverändert).
 *
 * @module zerstoerungsTabelle
 */
import { STOFFE, WIRKGRUPPEN, stoffWirkung } from './config/stoffe.js';
import { NEUE_BIOME } from './config/biome-neu.js';
import { ALTE_REZEPTE } from './config/stoff-rezepte.js';

/** Anzeigenamen der Wirkgruppen (Spaltenköpfe). */
export const GRUPPEN_LABEL = Object.freeze({
  wucht: 'Wucht', hitze: 'Feuer/Hitze', kaelte: 'Frost', aetz: 'Säure', strom: 'Strom', nass: 'Wasser',
});

/** Der Zerstörungscharakter, mit dem eine Waffe der Gruppe typischerweise wirkt. */
const CHARAKTER_DER_GRUPPE = Object.freeze({ hitze: 'brand' });

/** Ab diesem Faktor gilt ein Material als „mehr kaputt", bis zu diesem als „weniger" (darunter 0 = hält). */
export const MEHR_AB = 1.15;
export const WENIGER_BIS = 0.85;

/** Urteil zu einem Faktor: `haelt`, `weniger`, `normal` oder `mehr`. */
export function urteil(faktor) {
  if (faktor <= 0) return 'haelt';
  if (faktor < WENIGER_BIS) return 'weniger';
  if (faktor >= MEHR_AB) return 'mehr';
  return 'normal';
}

/**
 * Eine Zeile je Stoff: Härte, Faktor und Urteil je Wirkgruppe, Nebenwirkung auf Hitze.
 * @returns {{key:string,label:string,haerte:string,spalten:{gruppe:string,faktor:number,urteil:string,reaktion:string|null}[]}[]}
 */
export function zerstoerungsTabelle() {
  return STOFFE.map(stoff => ({
    key: stoff.key,
    label: stoff.label,
    haerte: stoff.haerte,
    spalten: WIRKGRUPPEN.map(gruppe => {
      const w = stoffWirkung(stoff.id, CHARAKTER_DER_GRUPPE[gruppe] ?? 'sprengung', gruppe, true);
      return { gruppe, faktor: Math.round(w.radius * 100) / 100, urteil: urteil(w.radius), reaktion: w.reaktion };
    }),
  }));
}

/** Die Stoffe eines Rezepts (Deck, Kern, Adern, Platten), ohne Doppelte, in Reihenfolge der Häufigkeit. */
function rezeptStoffe(rezept) {
  const keys = [...(rezept.deck ?? []).map(d => d[0]), rezept.kern, ...(rezept.adern ?? []).map(a => a.stoff), ...(rezept.platten ? [rezept.platten.stoff] : [])];
  return [...new Set(keys)];
}

/** Welche Stoffe ein Biom enthält: Sonderbiome (mit Namen) und die alten Biome. */
export function biomStoffe() {
  const sonder = Object.entries(NEUE_BIOME).map(([id, b]) => ({ id, label: b.label, stoffe: rezeptStoffe(b.stoffe) }));
  const alt = Object.entries(ALTE_REZEPTE).map(([id, r]) => ({ id, label: id, stoffe: rezeptStoffe(r) }));
  return { sonder, alt };
}

export default { zerstoerungsTabelle, biomStoffe, urteil, GRUPPEN_LABEL, MEHR_AB, WENIGER_BIS };
