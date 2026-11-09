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
import { iconUrlFor } from '../shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../shared/config/waffen-fassung.js';
import { spriteUrl, hdUrl } from './roster.js';

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
    this.zuletzt = { charakter: null, hp: -1, max: -1, waffe: null, team: -1 };
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
      this.klasse.textContent = KLASSEN_NAME[klasse] ?? klasse ?? '';
      z.hp = -1; z.waffe = null;
    }
    if (z.team !== entity.teamId) { z.team = entity.teamId; this.wurzel.style.borderLeftColor = teamFarbe; }
    const hp = Math.max(0, Math.round(entity.health));
    const max = Math.round(entity.maxHealth);
    if (hp !== z.hp || max !== z.max) {
      z.hp = hp; z.max = max;
      this.hp.textContent = `${hp} / ${max}`;
      if (this.balken) this.balken.style.transform = `scaleX(${max > 0 ? Math.min(1, hp / max) : 0})`;
    }
    const w = entity.activeWeaponId ?? null;
    const fassung = umgebung.waffen ?? WAFFEN_STANDARD;
    if (w !== z.waffe || fassung !== z.waffenFassung) {
      z.waffe = w;
      z.waffenFassung = fassung;
      // W03: Auch die Figurenkarte nennt pa_127 ab Fassung 12 „Mine“.
      const waffe = w ? getWaffe(w, fassung) : null;
      this.waffe.textContent = waffe?.displayName ?? '';
      const url = waffe ? iconUrlFor(waffe) : null;
      if (this.waffeIcon) {
        if (url) this.waffeIcon.src = url;
        this.waffeIcon.hidden = !url;
      }
    }
  }
}
