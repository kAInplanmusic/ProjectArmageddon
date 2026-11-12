/**
 * Anzeige des Allsehenden Auges (Waffenfassung 21): Beschriftung und Zeichnung des Kisteninhalts.
 * Reine Darstellung; die Daten kommen vom Motor (`engine/kistenSicht.js`, lokal) oder vom Server
 * (`kisten_sicht`, nur an das Team des Schützen).
 *
 * @module client/kistenSichtAnzeige
 */
import { getWaffe, WAFFEN_STANDARD } from '../shared/config/waffen-fassung.js';

const ARTEN = Object.freeze({ sustain: 'Nachschub', empty: 'leer', trap: 'Falle', ammo: 'Munition' });

/** Text über einer Kiste: Waffenname, „Falle", „leer" ... */
export function kistenBeschriftung(inhalt, fassung = WAFFEN_STANDARD) {
  if (!inhalt) return '';
  if (inhalt.weaponId) return getWaffe(inhalt.weaponId, fassung)?.displayName ?? inhalt.weaponId;
  if (inhalt.art === 'ammo') return inhalt.ammo > 0 ? `Munition +${inhalt.ammo}` : 'Munition';
  return ARTEN[inhalt.art] ?? inhalt.art;
}

/** Hängt jedem Kistenobjekt den Inhalt an (nach `entityId`); ohne Sicht bleibt die Liste unverändert. */
export function kistenMitInhalt(kisten, sicht) {
  if (!Array.isArray(kisten) || !sicht?.length) return kisten;
  const nach = new Map(sicht.map(k => [k.entityId, k]));
  return kisten.map(k => (nach.has(k.entityId) ? { ...k, inhalt: nach.get(k.entityId) } : k));
}

/** Zeichnet das Etikett über der Kiste (Koordinaten wie `#drawCrates`: Ursprung = Kistenmitte). */
export function zeichneKistenInhalt(ctx, kiste, fassung = WAFFEN_STANDARD) {
  const text = kistenBeschriftung(kiste.inhalt, fassung);
  if (!text) return;
  ctx.save();
  ctx.translate(kiste.x, kiste.y);
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const breite = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(10,14,20,0.85)';
  ctx.fillRect(-breite / 2, -34, breite, 15);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(text, 0, -21);
  ctx.restore();
}
