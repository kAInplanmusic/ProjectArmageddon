/**
 * Mali der Schadensarten (Fassung 2 von `config.schaden`, siehe `config/schaden.js`).
 *
 * Die Regeln stehen hier, die Zahlen in der Konfiguration. Die Klasse kennt das Match nur
 * über die kleine Schnittstelle `quelle` (Zustandsspeicher, Ereignisse, Spielerliste,
 * Wasser-, Boden- und Biomauskunft) — so bleibt `match.js` schlank und die Regeln sind ohne
 * Match prüfbar.
 *
 * Alles ist deterministisch: kein Zufall, keine Uhr; Iterationen laufen in fester
 * Reihenfolge (Malus-Schlüssel, Spieler nach Kennung). Der Zustand liegt im `StatusStore`
 * (`maliVon`) und damit im Zustands-Hash.
 *
 * Ablauf einer Figur:
 *   - Treffer: `treffer()` wendet die Mali der Waffe an (`wende`, `betaeube`).
 *   - Zugbeginn: `zugBeginn()` löscht Brand im Wasser und rechnet den Schaden über Zeit ab.
 *   - Zugende: `zugEnde()` zählt die Dauern herunter und entfernt Abgelaufenes.
 *
 * @module schadenMali
 */
import {
  MALUS, OBERGRENZEN, DOT_FAKTOR, DOT_MAX_JE_EINTRAG, WECHSELWIRKUNG, MALUS_SCHLUESSEL,
  artRegel, familieVonArt, resistenzFaktor, dauerAbzug,
} from '../shared/config/schaden.js';
import { WET_LEVEL } from '../shared/config/water.js';
import { TERRAIN_MATERIAL } from '../shared/config/terrain.js';
import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';
import { CLASS_IDS, ARCHETYPE_IDS } from '../shared/config/classes.js';
import { EFFECT_KIND, SPECIAL_DEFAULTS } from './specials.js';
import { damageTypeId, damageTypeName } from './damageTypes.js';

/** Mali, die zum Limit zählen (Nässe ist ein Zustand der Umgebung, kein Nachteil). */
const LIMIT_MALI = Object.freeze(MALUS_SCHLUESSEL.filter(k => k !== 'nass'));

/** Element einer Verstärkung oder eines Schilds (Waffenfassung 10) und der Malus, den es auslöst. */
const MALUS_VON_ELEMENT = Object.freeze({ fire: 'brand', ice: 'frost', electric: 'schock', poison: 'gift' });

/** Mali mit Schaden über Zeit, in der Reihenfolge der Abrechnung. */
const DOT_MALI = Object.freeze(['brand', 'gift', 'fluch']);

export class MaliRegeln {
  #q;

  /**
   * @param {object} quelle
   * @param {object} quelle.statuses - `StatusStore`
   * @param {object} quelle.events - Ereignisbus
   * @param {object} quelle.world - ECS-Welt (Gesundheit, Position)
   * @param {() => object[]} quelle.players - Spielerliste (`entityId`, `teamId`, `alive`, `classId`, `archetypeId`)
   * @param {(x:number,y:number) => number} quelle.waterLevelAt
   * @param {(x:number,y:number) => {id:number}} quelle.materialAt
   * @param {() => string} quelle.biomId
   * @param {() => number|null} quelle.aktiv - Kennung der Figur am Zug
   */
  constructor(quelle) {
    this.#q = quelle;
    quelle.statuses.setzeAusgangsFaktor(id => this.ausgangsFaktor(id));
  }

  // ------------------------------------------------------------- Abfragen

  #lies(id) {
    return this.#q.statuses.maliLesen(id) ?? {};
  }

  #spieler(id) {
    return this.#q.players().find(p => p.entityId === id) ?? null;
  }

  #lebt(id) {
    return this.#spieler(id)?.alive === true;
  }

  #ort(id) {
    return {
      x: this.#q.world.getComponent(id, 'Position', 'x') ?? 0,
      y: this.#q.world.getComponent(id, 'Position', 'y') ?? 0,
    };
  }

  /** Läuft der Malus? (Gift: mindestens ein Stapel.) */
  hat(id, schluessel) {
    const eintrag = this.#lies(id)[schluessel];
    return Array.isArray(eintrag) ? eintrag.length > 0 : Boolean(eintrag);
  }

  /** Nass durch Wasser am Standort oder durch den Zustand `nass`. */
  istNass(id) {
    if (this.hat(id, 'nass')) return true;
    const { x, y } = this.#ort(id);
    return this.#q.waterLevelAt(x, y) >= WET_LEVEL;
  }

  /** Material unter den Füßen (`TERRAIN_MATERIAL`). */
  #bodenMaterial(id) {
    const { x, y } = this.#ort(id);
    return this.#q.materialAt(x, y + PLAYER_HALF_HEIGHT)?.id ?? TERRAIN_MATERIAL.NORMAL;
  }

  /** Tempofaktor aus Frost und Schock (der stärkere gilt). */
  langsamFaktor(id) {
    let faktor = 1;
    if (this.hat(id, 'frost')) faktor = Math.min(faktor, MALUS.frost.tempo);
    if (this.hat(id, 'schock')) faktor = Math.min(faktor, MALUS.schock.tempo);
    return faktor;
  }

  /** Faktor auf den eigenen Schaden (Fluch). */
  ausgangsFaktor(id) {
    return this.hat(id, 'fluch') ? 1 - MALUS.fluch.schadenAbzug : 1;
  }

  /** Bitfeld der laufenden Mali (für die Leitung). */
  mali(id) {
    return this.#lies(id);
  }

  // ------------------------------------------------------------ Anwendung

  #melde(typ, daten) {
    this.#q.events.emit(typ, daten);
  }

  #abgewehrt(id, art, grund) {
    this.#melde('malus_abgewehrt', { playerId: id, art, grund });
    return null;
  }

  #beendet(id, art, grund) {
    this.#melde('malus_beendet', { playerId: id, art, grund });
  }

  /** Entfernt einen Malus (bei Gift den stärksten Stapel, mit `alle` alle). */
  entferne(id, schluessel, grund, { alle = true } = {}) {
    const mali = this.#lies(id);
    const eintrag = mali[schluessel];
    if (!eintrag) return false;
    if (Array.isArray(eintrag) && !alle && eintrag.length > 1) {
      let beste = 0;
      eintrag.forEach((e, i) => { if (e.dmg > eintrag[beste].dmg) beste = i; });
      eintrag.splice(beste, 1);
    } else {
      delete mali[schluessel];
    }
    this.#beendet(id, schluessel, grund);
    return true;
  }

  #anzahlMali(id, ohne = null) {
    const mali = this.#lies(id);
    return LIMIT_MALI.filter(k => k !== ohne && this.hat(id, k) && mali[k]).length;
  }

  #restdauer(eintrag) {
    return Array.isArray(eintrag) ? Math.max(0, ...eintrag.map(e => e.turns)) : (eintrag.turns ?? 0);
  }

  /**
   * Wendet einen Malus an.
   *
   * @param {number} id - Ziel
   * @param {string} schluessel - Schlüssel aus `MALUS`
   * @param {object} [o]
   * @param {number} [o.dmg] - Schaden je Zug (Rohwert der Waffe; wird mit `DOT_FAKTOR` umgerechnet)
   * @param {boolean} [o.roh] - `dmg` ohne Umrechnung übernehmen
   * @param {number|null} [o.by] - Urheber
   * @param {number|null} [o.dauer] - eigene Dauer statt der Standarddauer
   * @param {boolean} [o.ohneLeitung] - Schock leitet nicht weiter (zweite Stufe)
   * @param {object|null} [o.waffe] - für die Leitung (Schadenswert)
   * @returns {object|null} Ergebnis oder `null`, wenn abgewehrt
   */
  wende(id, schluessel, { dmg = 0, roh = false, by = null, dauer = null, ohneLeitung = false, waffe = null } = {}) {
    const m = MALUS[schluessel];
    if (!m || !this.#lebt(id)) return null;
    const verstaerkt = [];

    if (schluessel === 'brand' && this.istNass(id)) return this.#abgewehrt(id, schluessel, 'nass');
    if (schluessel === 'schock' && this.#bodenMaterial(id) === TERRAIN_MATERIAL.RUBBER) {
      return this.#abgewehrt(id, schluessel, 'gummi');
    }

    const spieler = this.#spieler(id);
    const klasse = CLASS_IDS[spieler?.classId ?? 0];
    const archetyp = ARCHETYPE_IDS[spieler?.archetypeId ?? 0];
    const biom = this.#q.biomId();
    const eis = this.#bodenMaterial(id) === TERRAIN_MATERIAL.ICE;
    void klasse;

    let turns = dauer ?? m.dauer;
    if (schluessel === 'brand') {
      const plus = WECHSELWIRKUNG.brandBiomZusatz[biom] ?? 0;
      if (plus) { turns += plus; verstaerkt.push(`biom:${biom}`); }
      if (eis) { turns -= WECHSELWIRKUNG.brandEisbodenAbzug; verstaerkt.push('eisboden'); }
    }
    const nass = this.istNass(id);
    if (schluessel === 'frost') {
      const plus = (WECHSELWIRKUNG.frostBiomZusatz[biom] ?? 0) + (eis ? WECHSELWIRKUNG.frostEisbodenZusatz : 0);
      if (plus) { turns += plus; verstaerkt.push(eis ? 'eisboden' : `biom:${biom}`); }
    }
    turns = Math.min(SPECIAL_DEFAULTS.maxTurns, Math.max(OBERGRENZEN.mindestDauer, turns - dauerAbzug(archetyp, schluessel)));

    // Gegenspiel zwischen den Elementen: Feuer taut, Eis und Wasser löschen.
    if (schluessel === 'brand') this.entferne(id, 'frost', 'feuer');
    if (schluessel === 'frost') this.entferne(id, 'brand', 'eis');
    if (schluessel === 'nass') this.entferne(id, 'brand', 'wasser');

    const mali = this.#q.statuses.maliVon(id);
    const vorhanden = Boolean(mali[schluessel]);
    if (!vorhanden && LIMIT_MALI.includes(schluessel)) {
      const laufend = LIMIT_MALI.filter(k => this.hat(id, k));
      if (laufend.length >= OBERGRENZEN.maxMali) {
        // Der Malus mit der kürzesten Restdauer weicht, wenn der neue mindestens so lange währt.
        let schwach = laufend[0];
        for (const k of laufend) if (this.#restdauer(mali[k]) < this.#restdauer(mali[schwach])) schwach = k;
        if (this.#restdauer(mali[schwach]) > turns) return this.#abgewehrt(id, schluessel, 'limit');
        this.entferne(id, schwach, 'limit');
      }
    }

    const frisch = this.#q.aktiv() === id;
    let wert = 0;
    let stapel = 1;
    let betaeubung = false;
    if (DOT_MALI.includes(schluessel)) {
      wert = roh ? Math.round(dmg) : Math.round(dmg * (DOT_FAKTOR[schluessel] ?? 1));
      if (dmg > 0) wert = Math.max(1, Math.min(DOT_MAX_JE_EINTRAG[schluessel] ?? wert, wert));
      if (schluessel === 'brand' || schluessel === 'fluch') {
        const alt = mali[schluessel];
        mali[schluessel] = {
          dmg: Math.max(wert, alt?.dmg ?? 0), turns: Math.max(turns, alt?.turns ?? 0), by, ...(frisch ? { frisch: 1 } : {}),
        };
      } else {
        const liste = mali.gift ?? (mali.gift = []);
        const neu = { dmg: wert, turns, by, ...(frisch ? { frisch: 1 } : {}) };
        if (liste.length < m.stapel) {
          liste.push(neu);
        } else {
          let schwach = 0;
          liste.forEach((e, i) => {
            if (e.dmg < liste[schwach].dmg || (e.dmg === liste[schwach].dmg && e.turns < liste[schwach].turns)) schwach = i;
          });
          if (wert >= liste[schwach].dmg) liste[schwach] = neu;
          else liste[schwach].turns = Math.max(liste[schwach].turns, turns);
        }
        stapel = liste.length;
      }
    } else {
      const alt = mali[schluessel];
      betaeubung = schluessel === 'frost' && Boolean(alt);
      mali[schluessel] = { turns: Math.max(turns, alt?.turns ?? 0), by, ...(frisch ? { frisch: 1 } : {}) };
    }

    this.#melde('malus_angewendet', { playerId: id, art: schluessel, dauer: turns, stapel, wert, by, verstaerkt });

    if (schluessel === 'frost' && (betaeubung || nass)) this.betaeube(id, by, nass && !betaeubung ? 'nass' : 'frost');
    if (schluessel === 'schock' && nass) {
      this.betaeube(id, by, 'nass');
      if (!ohneLeitung) this.#leite(id, by, waffe);
    }
    return { art: schluessel, dauer: turns, stapel, wert };
  }

  /** Betäubung: ein Zug Aussetzen, danach `betaeubungSchutz` eigene Züge Schutz. */
  betaeube(id, by = null, grund = 'betaeubung') {
    if (!this.#lebt(id)) return null;
    const mali = this.#lies(id);
    if ((mali.schutz ?? 0) > 0) return this.#abgewehrt(id, 'betaeubung', 'schutz');
    if (this.#q.statuses.isFrozen(id)) return null;
    const turns = this.#q.statuses.freeze(id, 1);
    this.#melde('frozen', { playerId: id, turns, by, grund });
    return { art: 'betaeubung', dauer: turns };
  }

  /** Schock im Wasser springt auf nasse Gegner im Umkreis über (eine Stufe, kein Kettenreißen). */
  #leite(quelleId, by, waffe) {
    const von = this.#ort(quelleId);
    const schuetze = by === null ? null : this.#spieler(by);
    const damage = this.#q.world.getSystem('damage');
    const ziele = this.#q.players()
      .filter(p => p.alive && p.entityId !== quelleId && p.entityId !== by && (!schuetze || p.teamId !== schuetze.teamId))
      .sort((a, b) => a.entityId - b.entityId);
    for (const ziel of ziele) {
      const ort = this.#ort(ziel.entityId);
      if (Math.hypot(ort.x - von.x, ort.y - von.y) > WECHSELWIRKUNG.leitungReichweite) continue;
      if (!this.istNass(ziel.entityId)) continue;
      const betrag = (waffe?.damage ?? 0) * WECHSELWIRKUNG.leitungAnteil;
      if (betrag > 0) damage?.applyDamage(this.#q.world, ziel.entityId, betrag, by, { damageType: damageTypeId('electric') });
      this.#melde('malus_leitung', { playerId: ziel.entityId, von: quelleId, by, schaden: Math.round(betrag) });
      this.wende(ziel.entityId, 'schock', { by, ohneLeitung: true });
    }
  }

  /**
   * Wirkung eines Treffers: die Wirkung des `special` (Schaden über Zeit, Einfrieren) und der
   * Malus der Schadensart. Aufgerufen nur für Gegner (die Teamprüfung macht das Match).
   *
   * @returns {object[]} angewendete Mali
   */
  treffer(effekt, waffe, zielId, schuetzeId) {
    const art = waffe?.damageType ?? 'physical';
    const regel = artRegel(art);
    const angewendet = new Set();
    const ergebnisse = [];
    const nimm = (schluessel, optionen) => {
      angewendet.add(schluessel);
      ergebnisse.push(this.wende(zielId, schluessel, { by: schuetzeId, waffe, ...optionen }));
    };

    if (effekt?.kind === EFFECT_KIND.DAMAGE_OVER_TIME) {
      const schluessel = effekt.element === 'fire' ? 'brand' : (regel.malus === 'fluch' ? 'fluch' : 'gift');
      nimm(schluessel, { dmg: effekt.damagePerTurn });
    } else if (effekt?.kind === EFFECT_KIND.FREEZE) {
      if (art === 'ice') nimm('frost', {});
      else ergebnisse.push(this.betaeube(zielId, schuetzeId, 'betaeubung'));
    }

    if (regel.malus && !angewendet.has(regel.malus)) {
      const standard = regel.malus === 'brand' || regel.malus === 'gift' ? { dmg: SPECIAL_DEFAULTS.dotDamagePerTurn } : {};
      nimm(regel.malus, standard);
    }

    // Waffenfassung 10: Eine Verstärkung mit Element gibt jedem Treffer des Schützen den Nachteil des Elements dazu.
    const zusatz = MALUS_VON_ELEMENT[this.#q.statuses.boostElementOf(schuetzeId) ?? ''];
    if (zusatz && !angewendet.has(zusatz)) {
      nimm(zusatz, zusatz === 'brand' || zusatz === 'gift' ? { dmg: SPECIAL_DEFAULTS.dotDamagePerTurn } : {});
    }
    return ergebnisse.filter(Boolean);
  }

  // ----------------------------------------------------------------- Ablauf

  /**
   * Zugbeginn einer Figur: Betäubungsschutz führen, Brand im Wasser löschen, Schaden über
   * Zeit abrechnen (gedeckelt auf `OBERGRENZEN.dotAnteil` der Maximalgesundheit).
   *
   * @param {number} id
   * @param {boolean} betaeubtGewesen - die Figur setzt diesen Zug wegen Betäubung aus
   */
  zugBeginn(id, betaeubtGewesen) {
    const mali = this.#lies(id);
    if (betaeubtGewesen) {
      this.#q.statuses.maliVon(id).schutz = OBERGRENZEN.betaeubungSchutz;
    } else if ((mali.schutz ?? 0) > 0) {
      mali.schutz -= 1;
      if (mali.schutz <= 0) delete mali.schutz;
    }

    if (this.hat(id, 'brand') && this.istNass(id)) this.entferne(id, 'brand', 'wasser');

    const posten = [];
    for (const schluessel of DOT_MALI) {
      const eintrag = mali[schluessel];
      if (!eintrag) continue;
      for (const e of Array.isArray(eintrag) ? eintrag : [eintrag]) {
        if (e.dmg > 0) posten.push({ art: schluessel, dmg: e.dmg, by: e.by ?? null });
      }
    }
    if (posten.length === 0 || !this.#lebt(id)) return null;

    const summe = posten.reduce((s, p) => s + p.dmg, 0);
    const maximum = this.#q.world.getComponent(id, 'Health', 'max') ?? 100;
    const deckel = Math.max(1, Math.round(maximum * OBERGRENZEN.dotAnteil));
    const faktor = summe > deckel ? deckel / summe : 1;
    const damage = this.#q.world.getSystem('damage');
    const eintraege = [];
    let gesamt = 0;
    for (const p of posten) {
      if (!this.#lebt(id)) break;
      const vorher = this.#q.world.getComponent(id, 'Health', 'current') ?? 0;
      damage?.applyDamage(this.#q.world, id, p.dmg * faktor, null, { damageType: damageTypeId(MALUS[p.art].schadensart) });
      const nachher = this.#q.world.getComponent(id, 'Health', 'current') ?? 0;
      eintraege.push({ art: p.art, schaden: Math.round((vorher - nachher) * 10) / 10, by: p.by });
      gesamt += vorher - nachher;
    }
    const rest = this.#q.world.getComponent(id, 'Health', 'current') ?? 0;
    this.#melde('dot_tick', {
      playerId: id,
      damage: gesamt,
      elements: [...new Set(eintraege.map(e => MALUS[e.art].schadensart))],
      eintraege,
      gedeckelt: faktor < 1,
      remaining: rest,
      lethal: rest <= 0,
    });
    return { gesamt, eintraege };
  }

  /** Zugende einer Figur: Dauern herunterzählen, Abgelaufenes entfernen. */
  zugEnde(id) {
    const mali = this.#lies(id);
    for (const schluessel of MALUS_SCHLUESSEL) {
      const eintrag = mali[schluessel];
      if (!eintrag) continue;
      if (Array.isArray(eintrag)) {
        for (const e of eintrag) {
          if (e.frisch) delete e.frisch;
          else e.turns -= 1;
        }
        mali[schluessel] = eintrag.filter(e => e.turns > 0);
        if (mali[schluessel].length === 0) {
          delete mali[schluessel];
          this.#beendet(id, schluessel, 'ablauf');
        }
      } else if (eintrag.frisch) {
        delete eintrag.frisch;
      } else {
        eintrag.turns -= 1;
        if (eintrag.turns <= 0) {
          delete mali[schluessel];
          this.#beendet(id, schluessel, 'ablauf');
        }
      }
    }
  }

  // ------------------------------------------------------------ Heilung

  /**
   * Heilung unter Mali: Gift mindert um ein Viertel je Stapel, Fluch um die Hälfte (nie unter
   * einem Viertel); große Heilung (Rohwert) löscht Brand, Säure und einen Gift-Stapel,
   * sehr große auch Fluch und alles Gift.
   *
   * @returns {number} der tatsächliche Heilbetrag
   */
  heilung(id, roh) {
    if (!(roh > 0)) return roh;
    let faktor = 1;
    const stapel = this.#lies(id).gift?.length ?? 0;
    if (stapel > 0) faktor *= 1 - MALUS.gift.heilungAbzug * stapel;
    if (this.hat(id, 'fluch')) faktor *= 1 - MALUS.fluch.heilungAbzug;
    faktor = Math.max(0.25, faktor);
    if (roh >= WECHSELWIRKUNG.heilungLoescht) {
      this.entferne(id, 'brand', 'heilung');
      this.entferne(id, 'saeure', 'heilung');
      this.entferne(id, 'gift', 'heilung', { alle: false });
    }
    if (roh >= WECHSELWIRKUNG.heilungBrichtFluch) {
      this.entferne(id, 'fluch', 'heilung');
      this.entferne(id, 'gift', 'heilung');
    }
    return Math.round(roh * faktor);
  }

  // ---------------------------------------------------------- Schadenslauf

  /**
   * Schild und Rüstung unter Berücksichtigung der Schadensart, der Resistenz der Figur und
   * des Säureabzugs. Ersetzt den Modifikator der Fassung 1, wenn die Art bekannt ist.
   *
   * @param {number} id
   * @param {number} betrag - Schaden nach flacher und prozentualer Verminderung
   * @param {number|undefined} artKennung - Kennung der Schadensart (`undefined` = Umwelt)
   * @returns {{amount:number}}
   */
  schaden(id, betrag, artKennung, schuetzeId = null) {
    const statuses = this.#q.statuses;
    const art = artKennung === undefined ? null : damageTypeName(artKennung);
    const regel = art === null ? null : artRegel(art);
    const abzug = this.hat(id, 'saeure') ? MALUS.saeure.ruestungAbzug : 0;
    const ruestung = Math.max(0, statuses.armorOf(id) - abzug) * (regel?.ruestung ?? 1);
    let danach = betrag * (1 - ruestung);
    if (art !== null) {
      const spieler = this.#spieler(id);
      danach *= resistenzFaktor(CLASS_IDS[spieler?.classId ?? 0], ARCHETYPE_IDS[spieler?.archetypeId ?? 0], art);
      if (familieVonArt(art) === 'heilig' && this.hat(id, 'fluch')) danach *= WECHSELWIRKUNG.heiligGegenFluch;
    }
    const anteil = regel?.schild ?? 1;
    const gegenElement = statuses.shieldGegenOf(id); // vor dem Auffangen lesen: ein leergeschlagenes Schild verliert sein Element
    const { absorbed, rest } = statuses.absorbWithShield(id, danach * anteil);
    if (absorbed > 0) this.#melde('shield_absorbed', { playerId: id, absorbed });
    // Waffenfassung 10: Ein Elementschild gibt dem Angreifer, dessen Treffer es auffängt, den Nachteil des Elements.
    const gegen = MALUS_VON_ELEMENT[gegenElement ?? ''] ?? null;
    if (absorbed > 0 && gegen && schuetzeId !== null && schuetzeId !== id && this.#lebt(schuetzeId)
        && this.#spieler(schuetzeId)?.teamId !== this.#spieler(id)?.teamId) {
      this.wende(schuetzeId, gegen, { by: id, ...(gegen === 'brand' || gegen === 'gift' ? { dmg: SPECIAL_DEFAULTS.dotDamagePerTurn } : {}) });
    }
    return { amount: rest + danach * (1 - anteil) };
  }
}

export default MaliRegeln;
