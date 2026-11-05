/**
 * Die Wirkungen der Tier-Perks und -Mali (Günther-/Cookie-Fassung 4).
 *
 * ## Warum eine Stelle
 *
 * 30 Perks und 30 Mali teilen sich eine kleine Zahl von Wirkungsarten. Läge die
 * Anwendung an zwei Stellen (Rad und Berührung), gäbe es zwei Fassungen
 * derselben Heilung — genau die Doppelung, die `engine/tierKontext.js` schon für
 * die NPC-Handgriffe beseitigt hat. Diese Datei ist die EINE Auslegestelle: Sie
 * liest `{art, …}` aus `config/guentherPerks.js` bzw. `config/cookieMali.js` und
 * benutzt ausschließlich bestehende Systeme:
 *
 *   Heilung/Schaden   `engine/damageSystem.js` (über `tierKontext`)
 *   Schild/Panzerung  `StatusStore` (`specials.js`)
 *   Munition/Inventar `PlayerInventory`
 *   Wind              `MatchController#dreheWind`
 *   Zugzeit/Zielhilfe `TierZustand`
 *   Kiste/Krater/Stoß `tierKontext`
 *
 * Keine neue Physik, kein Zufall außer dem übergebenen Teilgenerator
 * (AGENTS.md §2). Wirkungen, deren Voraussetzung fehlt (keine Kiste, keine
 * abwerfbare Waffe), bleiben folgenlos und melden das über `betrag: 0`.
 *
 * @module tierWirkung
 */
import { getWeapon, pickWeaponForRarity } from '../shared/config/weapons.js';
import { PERK_WAFFEN_GEWICHTE } from '../shared/config/guentherPerks.js';
import { KISTE_KANTE } from '../shared/config/kisten.js';

/** Alle Wirkungsarten, die Perks und Mali verwenden dürfen. */
export const TIER_WIRKUNGSARTEN = Object.freeze([
  'heilung', 'schild', 'panzerung', 'verstaerkung',
  'munition', 'waffe', 'waffeWeg', 'munitionWeg',
  'wind', 'zugzeit', 'zielhilfe', 'stoss',
  'schaden', 'brand', 'verlangsamung', 'einfrieren', 'aufdecken',
  'kiste', 'kisteWeg', 'krater',
]);

/** Position eines Spielers (0, wenn die Figur nicht mehr lebt). */
function position(q, playerId) {
  return {
    x: q.world.getComponent(playerId, 'Position', 'x') ?? 0,
    y: q.world.getComponent(playerId, 'Position', 'y') ?? 0,
  };
}

/** Nächste liegende Kiste zu einer Position (deterministisch: kleinster Abstand, dann kleinste ID). */
function naechsteKiste(q, x, y) {
  let beste = null;
  let besterAbstand = Infinity;
  for (const kiste of q.tier.kisten?.() ?? []) {
    const abstand = Math.hypot(kiste.x - x, kiste.y - y);
    if (abstand < besterAbstand || (abstand === besterAbstand && beste && kiste.id < beste.id)) {
      besterAbstand = abstand;
      beste = kiste;
    }
  }
  return beste;
}

/** Munition auffüllen: `alle` füllt jede füllbare Waffe, sonst die aktive (mit Rückfall). */
function munitionAuffuellen(q, playerId, wirkung) {
  const menge = Math.max(1, Math.floor(wirkung.menge ?? 1));
  const fuellbar = q.inventory.fuellbareWaffen?.(playerId) ?? [];
  if (wirkung.alle) {
    let summe = 0;
    for (const id of fuellbar) summe += q.inventory.grantAmmo(playerId, id, menge);
    return summe;
  }
  const aktiv = q.inventory.getActiveWeaponId(playerId);
  const ziel = aktiv && fuellbar.includes(aktiv) ? aktiv : fuellbar[0];
  if (!ziel) return 0;
  return q.inventory.grantAmmo(playerId, ziel, menge);
}

/** Eine Waffe geben: feste Kennung oder gewichtet nach der Stufe des Perks. */
function schenkeWaffe(q, playerId, wirkung) {
  let waffe = null;
  if (wirkung.id) waffe = getWeapon(wirkung.id);
  if (!waffe) {
    const gewichte = PERK_WAFFEN_GEWICHTE[wirkung.seltenheit] ?? PERK_WAFFEN_GEWICHTE.common;
    waffe = pickWeaponForRarity(q.rng, gewichte);
  }
  if (!waffe) return null;
  if (!q.inventory.has(playerId, waffe.id)) {
    q.inventory.grantWeapon(playerId, waffe.id);
  } else {
    // Schon vorhanden: Munition nachfüllen, sonst wäre die Gabe wirkungslos.
    q.inventory.grantAmmo(playerId, waffe.id, 3);
  }
  return waffe;
}

/** Eine abwerfbare Waffe verlieren (aktiv zuerst, sonst die erste im Inventar). */
function verliereWaffe(q, playerId) {
  const weapons = q.inventory.getWeapons(playerId) ?? [];
  const aktiv = q.inventory.getActiveWeaponId(playerId);
  const abwerfbar = id => !q.inventory.isUnlimited(playerId, id);
  const ziel = (aktiv && abwerfbar(aktiv) ? aktiv : weapons.find(abwerfbar)) ?? null;
  if (!ziel) return null;
  const rest = q.inventory.removeWeapon(playerId, ziel);
  return rest.ok ? ziel : null;
}

/**
 * Munition verlieren.
 *
 * Bevorzugt die aktive Waffe; ist die unbegrenzt, die erste begrenzte mit
 * Vorrat. Sonst wäre der Malus in einer Partie mit unbegrenzten Startwaffen
 * wirkungslos. Es wird nie mehr genommen, als da ist.
 */
function verliereMunition(q, playerId, wirkung) {
  const menge = Math.max(1, Math.floor(wirkung.menge ?? 1));
  const weapons = q.inventory.getWeapons(playerId) ?? [];
  const begrenzt = id => !q.inventory.isUnlimited(playerId, id) && (q.inventory.getAmmo(playerId, id) ?? 0) > 0;
  const aktiv = q.inventory.getActiveWeaponId(playerId);
  const ziel = (aktiv && begrenzt(aktiv) ? aktiv : weapons.find(begrenzt)) ?? null;
  if (!ziel) return 0;
  const vorher = q.inventory.getAmmo(playerId, ziel) ?? 0;
  q.inventory.consume(playerId, ziel, Math.min(menge, vorher));
  const nachher = q.inventory.getAmmo(playerId, ziel) ?? 0;
  return Math.max(0, vorher - nachher);
}

/**
 * Wendet eine Wirkung an.
 *
 * @param {{world:object, statuses:object, inventory:object, tier:object, rng:object}} q
 * @param {number} playerId - betroffene Figur
 * @param {{art:string}} wirkung - Wirkparameter aus der Liste
 * @returns {{art:string, betrag:number, weaponId:string|null}} Kurzbericht für Ereignis und Test
 */
export function wendeTierWirkung(q, playerId, wirkung) {
  const bericht = { art: wirkung.art, betrag: 0, weaponId: null };
  if (!wirkung || !TIER_WIRKUNGSARTEN.includes(wirkung.art)) return bericht;
  if (!q.world?.isActive?.(playerId)) return bericht;

  switch (wirkung.art) {
    case 'heilung': {
      const max = q.world.getComponent(playerId, 'Health', 'max') ?? 100;
      const betrag = Math.max(1, Math.round(wirkung.betrag ?? max * (wirkung.anteil ?? 0.25)));
      const vorher = q.world.getComponent(playerId, 'Health', 'current') ?? 0;
      const nachher = q.tier.heile?.(playerId, betrag);
      // `heal` liefert den neuen Stand, nicht die Differenz — der Bericht nennt
      // die tatsächlich gewonnene Menge.
      bericht.betrag = typeof nachher === 'number' ? Math.max(0, nachher - vorher) : betrag;
      break;
    }
    case 'schild':
      bericht.betrag = q.statuses.addShield(playerId, wirkung.betrag ?? 20);
      break;
    case 'panzerung':
      bericht.betrag = q.statuses.addArmor(playerId, wirkung.anteil ?? 0.2);
      break;
    case 'verstaerkung':
      bericht.betrag = q.statuses.addBoost(playerId, wirkung.faktor ?? 1.3, wirkung.zuege ?? 1);
      break;
    case 'munition':
      bericht.betrag = munitionAuffuellen(q, playerId, wirkung);
      break;
    case 'waffe': {
      const waffe = schenkeWaffe(q, playerId, wirkung);
      if (waffe) {
        bericht.weaponId = waffe.id;
        bericht.betrag = 1;
      }
      break;
    }
    case 'waffeWeg': {
      const weg = verliereWaffe(q, playerId);
      if (weg) {
        bericht.weaponId = weg;
        bericht.betrag = 1;
      }
      break;
    }
    case 'munitionWeg':
      bericht.betrag = verliereMunition(q, playerId, wirkung);
      break;
    case 'wind':
      bericht.betrag = q.tier.dreheWind?.() ?? 0;
      break;
    case 'zugzeit':
      q.tier.setzeZugzeit?.(playerId, wirkung.faktor ?? 1, wirkung.zuege ?? 1);
      bericht.betrag = wirkung.faktor ?? 1;
      break;
    case 'zielhilfe':
      q.tier.setzeZielhilfe?.(playerId, wirkung.faktor ?? 1, wirkung.zuege ?? 1);
      bericht.betrag = wirkung.faktor ?? 1;
      break;
    case 'stoss': {
      const { x, y } = position(q, playerId);
      q.tier.stosse?.(playerId, wirkung.vx ?? 0, wirkung.vy ?? 0);
      bericht.betrag = Math.hypot(wirkung.vx ?? 0, wirkung.vy ?? 0);
      bericht.x = x; bericht.y = y;
      break;
    }
    case 'schaden':
      q.tier.schaden?.(playerId, wirkung.betrag ?? 5);
      bericht.betrag = wirkung.betrag ?? 5;
      break;
    case 'brand':
      q.statuses.addDot(playerId, {
        damagePerTurn: wirkung.betrag ?? 2, turns: wirkung.zuege ?? 2, element: wirkung.element ?? 'neutral',
      });
      bericht.betrag = wirkung.betrag ?? 2;
      break;
    case 'verlangsamung': {
      const r = q.statuses.addSlow(playerId, wirkung.faktor ?? 0.6, wirkung.zuege ?? 2);
      bericht.betrag = r.factor;
      break;
    }
    case 'einfrieren':
      bericht.betrag = q.statuses.freeze(playerId, wirkung.zuege ?? 1);
      break;
    case 'aufdecken':
      bericht.betrag = q.statuses.reveal(playerId, wirkung.zuege ?? 1);
      break;
    case 'kiste': {
      const { x } = position(q, playerId);
      const boden = q.tier.surfaceYAt?.(Math.round(x)) ?? 0;
      const id = q.tier.legeKiste?.(q.rng, x, (boden > 0 ? boden : 0) - KISTE_KANTE);
      if (id !== undefined && id !== null) bericht.betrag = 1;
      bericht.x = x;
      break;
    }
    case 'kisteWeg': {
      const { x, y } = position(q, playerId);
      const kiste = naechsteKiste(q, x, y);
      if (kiste) {
        q.tier.kisteVerzehren?.(kiste.id);
        bericht.betrag = 1;
        bericht.kisteId = kiste.id;
      }
      break;
    }
    case 'krater': {
      const { x, y } = position(q, playerId);
      const boden = q.tier.surfaceYAt?.(Math.round(x)) ?? y;
      q.tier.krater?.(x, (boden > 0 ? boden : y) + 2, wirkung.radius ?? 20, wirkung.tiefe ?? 40);
      bericht.betrag = wirkung.radius ?? 20;
      bericht.x = x; bericht.y = y;
      break;
    }
    default:
      break;
  }
  return bericht;
}

export default wendeTierWirkung;
