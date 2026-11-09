/**
 * Figurenkarte der aktiven Figur im HUD: Porträt, Name, Klasse, Leben, Waffe.
 *
 * Sichtbar nur, wenn die aktive Figur eine Fraktion hat (sonst bleibt das HUD
 * wie bisher). Das DOM wird nur angefasst, wenn sich ein Wert ändert — der
 * Aufruf je Bild kostet sonst nichts.
 *
 * @module figurenKarte
 */
import { COMBAT_ROLES } from '../shared/config/factions.js';
import { charakterFuer } from '../shared/config/darstellung.js';
import { klassenKennung } from '../shared/config/classes.js';
import { istKlassenfassungNeu, KLASSEN_STANDARD } from '../shared/config/klassen-fassung.js';
import { WEAPONS_BY_ID, iconUrlFor } from '../shared/config/weapons.js';
import { spriteUrl, hdUrl } from './roster.js';
import { fraktionsMerkmale, teamFarbe as teamFarbeFuer, teamMarke } from './teamFarben.js';
import { fraktionsIdentitaet } from './fraktionsIdentitaet.js';
import { klassenSvg } from './klassenZeichen.js';

const KLASSEN_NAME = Object.freeze({
  heavy: 'Schwer', scout: 'Späher', artillery: 'Artillerie',
  nahkampf: 'Nahkampf', fernkampf: 'Fernkampf', okkultist: 'Okkultist',
});

export class FigurenKarte {
  constructor(doc = document) {
    this.wurzel = doc.getElementById('hud-figur');
    this.bild = doc.getElementById('hud-figur-bild');
    this.name = doc.getElementById('hud-figur-name');
    this.rolle = doc.getElementById('hud-figur-rolle');
    this.klasse = doc.getElementById('hud-figur-klasse');
    this.hp = doc.getElementById('hud-figur-hp');
    this.balken = doc.querySelector('#hud-figur-balken i');
    this.waffe = doc.getElementById('hud-figur-waffe');
    this.waffeIcon = doc.getElementById('hud-figur-waffe-icon');
    this.emblem = doc.getElementById('hud-figur-emblem');
    this.team = doc.getElementById('hud-figur-team');
    this.zuletzt = { charakter: null, hp: -1, max: -1, waffe: null, team: -1, fraktion: null, klasse: null };
  }

  /**
   * @param {object|null} entity - die aktive Figur (Ansichtszustand)
   * @param {string|null} fraktionId - Fraktion ihres Teams
   * @param {string} teamFarbe
   * @param {object} [umgebung] - `{klassen, platz}`: Klassenfassung und Platz in der Zeile
   */
  aktualisiere(entity, fraktionId, teamFarbe, umgebung = {}) {
    if (!this.wurzel) return;
    const charakter = entity?.alive && fraktionId
      ? charakterFuer(fraktionId, entity.classId,
        umgebung.klassen && istKlassenfassungNeu(umgebung.klassen) ? umgebung.platz : entity.archetypeId,
        umgebung.klassen)
      : null;
    const z = this.zuletzt;
    if (!charakter) {
      if (z.charakter !== null) { this.wurzel.hidden = true; z.charakter = null; }
      return;
    }
    if (z.charakter !== charakter) {
      z.charakter = charakter;
      this.wurzel.hidden = false;
      // Sanftes Einblenden bei jedem Zugwechsel (CSS-Animation neu anstoßen).
      this.wurzel.classList.remove('figur-ein');
      void this.wurzel.offsetWidth;
      this.wurzel.classList.add('figur-ein');
      // Erst das 256er (sofort da), dann das HD-Porträt, sobald es geladen ist.
      this.bild.src = spriteUrl(charakter) ?? '';
      hdUrl(charakter).then((url) => {
        if (url && this.zuletzt.charakter === charakter) this.bild.src = url;
      }, () => {});
      this.name.textContent = charakter.name;
      this.rolle.textContent = COMBAT_ROLES[charakter.role]?.label ?? '';
      this.rolle.dataset.rolle = charakter.role;
      const klasse = klassenKennung(entity.classId, umgebung.klassen ?? KLASSEN_STANDARD);
      /*
       * Klassenzeichen vor dem Klassennamen (Audit A16). Die Kennung steht
       * daneben, weil ein Zeichen allein beim ersten Kontakt gelernt werden
       * müsste; die Haltung der Figur ist Sache der Bildproduktion.
       */
      const zeichen = klassenSvg(klasse, { groesse: 13 });
      if (zeichen) this.klasse.innerHTML = `${zeichen} <span>${KLASSEN_NAME[klasse] ?? klasse ?? ''}</span>`;
      else this.klasse.textContent = KLASSEN_NAME[klasse] ?? klasse ?? '';
      /*
       * In Klassenfassung 3 sind Rollen- und Klassenname identisch („Nahkampf“
       * stand zweimal nebeneinander). Der Rollen-Chip entfällt dann; in den
       * alten Fassungen (Nahkampf gegen heavy/scout/artillery) bleiben beide,
       * weil sie dort Verschiedenes sagen.
       */
      this.rolle.hidden = (COMBAT_ROLES[charakter.role]?.label ?? '') === (KLASSEN_NAME[klasse] ?? klasse);
      z.hp = -1; z.waffe = null;
    }
    /*
     * Zwei Farbrollen (Audit A09):
     *  - Rahmen links und Team-Chip = EIGENTÜMER (Teamfarbe, Marke „T1“).
     *  - Emblem daneben = FRAKTION (Fraktionfarbe, Fraktionsname als Titel).
     */
    if (z.fraktion !== fraktionId) {
      z.fraktion = fraktionId;
      const merkmal = fraktionsMerkmale(fraktionId);
      if (this.emblem) {
        const url = fraktionId ? fraktionsIdentitaet(fraktionId)?.emblem : null;
        this.emblem.hidden = !url;
        if (url) {
          this.emblem.src = url;
          this.emblem.alt = `Emblem ${merkmal?.name ?? ''}`.trim();
          this.emblem.title = merkmal?.name ?? '';
        }
      }
    }
    if (z.team !== entity.teamId) {
      z.team = entity.teamId;
      const farbe = teamFarbeFuer(entity.teamId);
      this.wurzel.style.borderLeftColor = farbe || teamFarbe;
      this.wurzel.title = `Eigentümer: Team ${Number(entity.teamId) + 1}`;
      if (this.team) {
        this.team.textContent = teamMarke(entity.teamId);
        this.team.style.background = farbe;
      }
    }
    const hp = Math.max(0, Math.round(entity.health));
    const max = Math.round(entity.maxHealth);
    if (hp !== z.hp || max !== z.max) {
      z.hp = hp; z.max = max;
      this.hp.textContent = `${hp} / ${max}`;
      if (this.balken) this.balken.style.transform = `scaleX(${max > 0 ? Math.min(1, hp / max) : 0})`;
    }
    const w = entity.activeWeaponId ?? null;
    if (w !== z.waffe) {
      z.waffe = w;
      const waffe = w ? WEAPONS_BY_ID[w] : null;
      this.waffe.textContent = waffe?.displayName ?? '';
      const url = waffe ? iconUrlFor(waffe) : null;
      if (this.waffeIcon) {
        if (url) this.waffeIcon.src = url;
        this.waffeIcon.hidden = !url;
      }
    }
  }
}
