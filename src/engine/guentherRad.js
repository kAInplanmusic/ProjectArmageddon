/**
 * Glücksrad des Günther: wendet einen ausgewürfelten Ausgang an.
 *
 * Aus `match.js` herausgelöst (Zeilenbudget); die Logik ist unverändert. Ausgewürfelt wird im
 * GuentherSystem, angewendet hier: Das Rad braucht Zugriff auf Inventar, Zustände und Schaden.
 *
 * @module guentherRad
 */
import { LOW_RARITY_WEIGHTS, LEGENDARY_WEIGHTS, GUENTHER_FEINSCHLIFF } from '../shared/config/guenther.js';

/**
 * @param {{guenther:object, statuses:object, inventory:object, world:object}} q
 * @returns {{outcome:string, label:string, detail:string, effect:string}}
 */
export function loeseGuentherRad(q, playerId) {
    const ausgang = q.guenther.wuerfleAusgang();
    const wirkung = ausgang.effect;
    const ergebnis = {
      outcome: ausgang.id,
      label: ausgang.label,
      detail: ausgang.detail,
      effect: wirkung.kind,
      amount: 0,
      weaponId: null,
      weaponName: null,
    };

    switch (wirkung.kind) {
      case 'skip':
        // Aussetzen: eine Runde nicht handeln können.
        q.statuses.freeze(playerId, wirkung.turns);
        break;

      case 'skipAndWeapon': {
        q.statuses.freeze(playerId, wirkung.turns);
        const waffe = q.guenther.waehleWaffe(LOW_RARITY_WEIGHTS);
        if (waffe) {
          if (!q.inventory.has(playerId, waffe.id)) {
            q.inventory.grantWeapon(playerId, waffe.id);
          } else {
            /*
             * Schon im Besitz: Munition nachfüllen statt einer wirkungslosen
             * Gabe.
             *
             * FUND (belegt): Hier stand `q.inventory.refill(...)` — diese
             * Methode gibt es nicht. Die richtige heißt `grantAmmo`. Der Aufruf
             * lief nur, wenn der Spieler die Waffe SCHON hatte — also im
             * Zweifelsfall: Günthers „Füttern" hat in diesem Fall nichts getan,
             * und zwar still.
             *
             * Gefunden wurde es, weil ein Test `refill is not a function`
             * meldete — nachdem eine Änderung an Günthers Beweidung den
             * betroffenen Zweig häufiger erreichte.
             */
            if (q.inventory.munition) q.inventory.grantWeapon(playerId, waffe.id); else q.inventory.grantAmmo(playerId, waffe.id, 3); // Fassung 11: nur auf die Klasse füllen (4 und 5 gibt nur die Munitionskiste)
          }
          ergebnis.weaponId = waffe.id;
          ergebnis.weaponName = waffe.displayName;
        }
        break;
      }

      case 'skipAndHeal': {
        q.statuses.freeze(playerId, wirkung.turns);
        const betrag = Math.round(q.guenther.zieheBereich(wirkung.heal));
        const system = q.world.getSystem('damage');
        const geheilt = system?.heal?.(q.world, playerId, betrag);
        ergebnis.amount = typeof geheilt === 'number' ? geheilt : betrag;
        break;
      }

      case 'damage': {
        let betrag = Math.round(q.guenther.zieheBereich(wirkung.range));
        // Fassung 3: Der Angriff entscheidet keine Partie — mindestens 1 Leben bleibt (der Wurf wird trotzdem gezogen).
        if (q.fassung >= GUENTHER_FEINSCHLIFF) betrag = Math.min(betrag, Math.max(0, (q.world.getComponent(playerId, 'Health', 'current') ?? 0) - 1));
        // Als Schaden OHNE Verursacher: Günther gehört keinem Team, ein Abschuss
        // durch ihn darf nicht als Treffer eines Spielers zählen.
        q.world.getSystem('damage')?.applyDamage(q.world, playerId, betrag, null);
        ergebnis.amount = betrag;
        break;
      }

      case 'legendaryWeapon': {
        const waffe = q.guenther.waehleWaffe(LEGENDARY_WEIGHTS);
        if (waffe) {
          if (!q.inventory.has(playerId, waffe.id)) {
            q.inventory.grantWeapon(playerId, waffe.id);
          } else {
            // Wie oben: `refill` existiert nicht — `grantAmmo` ist gemeint.
            if (q.inventory.munition) q.inventory.grantWeapon(playerId, waffe.id); else q.inventory.grantAmmo(playerId, waffe.id, 99);
          }
          ergebnis.weaponId = waffe.id;
          ergebnis.weaponName = waffe.displayName;
        }
        break;
      }

      default:
        break;
    }

    return ergebnis;
}
