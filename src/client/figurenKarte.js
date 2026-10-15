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
import { CLASS_IDS } from '../shared/config/classes.js';
import { WEAPONS_BY_ID } from '../shared/config/weapons.js';
import { spriteUrl } from './roster.js';

const KLASSEN_NAME = Object.freeze({ heavy: 'Schwer', scout: 'Späher', artillery: 'Artillerie' });

export class FigurenKarte {
  constructor(doc = document) {
    this.wurzel = doc.getElementById('hud-figur');
    this.bild = doc.getElementById('hud-figur-bild');
    this.name = doc.getElementById('hud-figur-name');
    this.klasse = doc.getElementById('hud-figur-klasse');
    this.hp = doc.getElementById('hud-figur-hp');
    this.waffe = doc.getElementById('hud-figur-waffe');
    this.zuletzt = { charakter: null, hp: -1, max: -1, waffe: null, team: -1 };
  }

  /**
   * @param {object|null} entity - die aktive Figur (Ansichtszustand)
   * @param {string|null} fraktionId - Fraktion ihres Teams
   * @param {string} teamFarbe
   */
  aktualisiere(entity, fraktionId, teamFarbe) {
    if (!this.wurzel) return;
    const charakter = entity?.alive && fraktionId
      ? charakterFuer(fraktionId, entity.classId, entity.archetypeId) : null;
    const z = this.zuletzt;
    if (!charakter) {
      if (z.charakter !== null) { this.wurzel.hidden = true; z.charakter = null; }
      return;
    }
    if (z.charakter !== charakter) {
      z.charakter = charakter;
      this.wurzel.hidden = false;
      this.bild.src = spriteUrl(charakter) ?? '';
      this.name.textContent = charakter.name;
      const rolle = COMBAT_ROLES[charakter.role]?.label ?? '';
      const klasse = typeof entity.classId === 'number' ? CLASS_IDS[entity.classId] : entity.classId;
      this.klasse.textContent = `${rolle} · ${KLASSEN_NAME[klasse] ?? klasse ?? ''}`;
      z.hp = -1; z.waffe = null;
    }
    if (z.team !== entity.teamId) { z.team = entity.teamId; this.wurzel.style.borderLeftColor = teamFarbe; }
    const hp = Math.max(0, Math.round(entity.health));
    const max = Math.round(entity.maxHealth);
    if (hp !== z.hp || max !== z.max) {
      z.hp = hp; z.max = max;
      this.hp.textContent = `Leben ${hp} / ${max}`;
    }
    const w = entity.activeWeaponId ?? null;
    if (w !== z.waffe) {
      z.waffe = w;
      this.waffe.textContent = w ? (WEAPONS_BY_ID[w]?.displayName ?? '') : '';
    }
  }
}
