/**
 * Waffenmenü ("Dropdown" wie in Worms): der Besitz der Figur am Zug auf einen Blick.
 *
 * - zeigt die Waffen, die die Figur gerade hat (0 bis wenige, Reserve unbegrenzt),
 * - gruppiert nach Kategorie wie die HUD-Leiste,
 * - mit Icon, Name, Munition, Nachladen und Stufenfarbe,
 * - Waffen ohne Munition sind ausgegraut und nicht wählbar,
 * - Pfeiltasten + Enter, Esc, Maus (Detailzeile beim Überfahren), Touch (große Zeilen).
 *
 * Die Liste ist klein; sie wird bei offenem Menü nur dann neu aufgebaut, wenn
 * sich Bestand, Munition, Nachladen oder aktive Waffe ändern (Signatur) — nie
 * pro Frame. Bei geschlossenem Menü passiert nichts.
 *
 * Der Zugriff auf die Datenform der Engine (`inventory` = IDs, `ammo` = Zahl
 * oder 'unbegrenzt', `cooldowns`) steckt in {@link bestandVon}.
 *
 * @module waffenMenue
 */
import {
  getWeapon,
  iconUrlFor,
  orderInventoryBySubcategory,
  displayGroupFor,
  displayGroupLabel,
} from '../shared/config/weapons.js';
import { artLabel } from '../shared/config/wirkungstexte.js';

const STUFEN_NAMEN = Object.freeze({
  common: 'gewöhnlich', uncommon: 'ungewöhnlich', rare: 'selten', epic: 'episch', legendary: 'legendär',
});

/**
 * Bestand einer Figur als Liste in Anzeigereihenfolge (wie die HUD-Leiste).
 * Die EINE Stelle, die die Datenform der Engine kennt.
 *
 * @param {object|null|undefined} figur Figur aus dem State
 * @returns {{weaponId:string, weapon:object|null, nummer:number, ammo:number,
 *   maxAmmo:number, unbegrenzt:boolean, cooldown:number, aktiv:boolean, waehlbar:boolean, gruppe:string}[]}
 */
function bestandVon(figur) {
  const ids = Array.isArray(figur?.inventory) ? figur.inventory : [];
  return orderInventoryBySubcategory(ids).map((index, position) => {
    const weaponId = ids[index];
    const weapon = getWeapon(weaponId);
    const roh = figur?.ammo?.[weaponId];
    const unbegrenzt = roh === 'unbegrenzt' || roh === Infinity;
    const ammo = unbegrenzt ? Infinity : Math.max(0, Number(roh) || 0);
    return {
      weaponId,
      weapon,
      nummer: position + 1,
      ammo,
      maxAmmo: unbegrenzt ? Infinity : Math.max(weapon?.maxAmmo ?? 0, ammo),
      unbegrenzt,
      cooldown: Math.max(0, Number(figur?.cooldowns?.[weaponId]) || 0),
      aktiv: weaponId === figur?.activeWeaponId,
      // Nachladen lässt sich vormerken (wie in der Leiste); nur Munition sperrt.
      waehlbar: unbegrenzt || ammo > 0,
      gruppe: displayGroupFor(weaponId),
    };
  });
}

const zahl = wert => (wert === Infinity ? '∞' : String(wert));

export class WaffenMenue {
  #doc;
  #opts;
  #wurzel;
  #knopf;
  #liste;
  #info;
  #eintraege = [];
  #signatur = null;
  #offen = false;
  #aktiv = null;
  #hover = null;

  /**
   * @param {Document} doc
   * @param {object} opts
   * @param {function():object|null} opts.getFigur - Figur am Zug (State-Form)
   * @param {function(string):boolean} opts.onSelect - wählt die Waffe; true = angenommen
   */
  constructor(doc, opts) {
    this.#doc = doc;
    this.#opts = opts;
    this.#wurzel = doc.getElementById('waffenmenue');
    this.#knopf = doc.getElementById('waffen-menue-knopf');
    if (!this.#wurzel) return;
    this.#liste = doc.getElementById('waffenmenue-liste');
    this.#info = doc.getElementById('waffenmenue-info');

    this.#knopf?.addEventListener('click', () => this.toggle());
    doc.getElementById('waffenmenue-schliessen')?.addEventListener('click', () => this.close());
    this.#wurzel.addEventListener('keydown', e => this.#taste(e));
    this.#wurzel.addEventListener('keyup', e => e.stopPropagation());
    this.#liste.addEventListener('click', e => {
      const zeile = e.target.closest?.('[role="option"]');
      if (zeile) { this.#setzeAktiv(zeile.dataset.weaponId, false); this.#waehle(zeile.dataset.weaponId); }
    });
    this.#liste.addEventListener('pointerover', e => {
      const zeile = e.target.closest?.('[role="option"]');
      if (zeile) { this.#hover = zeile.dataset.weaponId; this.#zeigeInfo(this.#hover); }
    });
    this.#liste.addEventListener('pointerleave', () => { this.#hover = null; this.#zeigeInfo(this.#aktiv); });

    // Außerhalb tippen schließt — und der Klick geht NICHT ans Spielfeld (kein Schuss nebenbei).
    globalThis.addEventListener?.('pointerdown', e => {
      if (!this.#offen) return;
      if (this.#wurzel.contains(e.target) || this.#knopf?.contains(e.target)) return;
      e.stopPropagation();
      this.close({ fokus: false });
    }, true);
    // Esc auch, wenn der Fokus nicht im Menü liegt.
    globalThis.addEventListener?.('keydown', e => {
      if (this.#offen && e.key === 'Escape' && !this.#wurzel.contains(e.target)) { e.preventDefault(); this.close(); }
    });
  }

  get isOpen() { return this.#offen; }
  get aktiveId() { return this.#aktiv; }
  /** Angezeigte Waffen-IDs in Reihenfolge (für Tests). */
  get ids() { return this.#eintraege.map(b => b.weaponId); }

  toggle() { if (this.#offen) this.close(); else this.open(); }

  open() {
    if (!this.#wurzel || this.#offen) return;
    const figur = this.#opts.getFigur();
    if (!figur) return;
    this.#offen = true;
    this.#wurzel.hidden = false;
    this.#knopf?.setAttribute('aria-expanded', 'true');
    this.#signatur = null;
    this.#aktiv = figur.activeWeaponId ?? null;
    this.#render(figur);
    this.#wurzel.focus({ preventScroll: true });
  }

  close({ fokus = true } = {}) {
    if (!this.#wurzel || !this.#offen) return;
    this.#offen = false;
    this.#wurzel.hidden = true;
    this.#knopf?.setAttribute('aria-expanded', 'false');
    // Nicht auf dem Knopf liegen lassen: die Leertaste soll feuern, nicht den Knopf drücken.
    if (fokus) this.#doc.activeElement?.blur?.();
  }

  /** Pro Frame aufgerufen; bei geschlossenem Menü ein No-op. */
  aktualisiere(figur) {
    if (!this.#offen) return;
    if (!figur) { this.close(); return; }
    this.#render(figur);
  }

  // ------------------------------------------------------------------

  #render(figur) {
    const bestand = bestandVon(figur);
    const signatur = bestand
      .map(b => `${b.weaponId}:${zahl(b.ammo)}:${b.cooldown}:${b.aktiv ? 1 : 0}`).join('|');
    if (signatur === this.#signatur) return;
    this.#signatur = signatur;
    this.#eintraege = bestand;
    if (!bestand.some(b => b.weaponId === this.#aktiv)) {
      this.#aktiv = (bestand.find(b => b.aktiv) ?? bestand[0])?.weaponId ?? null;
    }

    const doc = this.#doc;
    const kinder = [];
    if (bestand.length === 0) {
      const leer = doc.createElement('p');
      leer.className = 'wm-leer';
      leer.textContent = 'Keine Waffen.';
      kinder.push(leer);
    }
    let gruppe = null;
    let gruppeEl = null;
    for (const b of bestand) {
      if (b.gruppe !== gruppe) {
        gruppe = b.gruppe;
        gruppeEl = doc.createElement('div');
        gruppeEl.className = 'wm-gruppe';
        gruppeEl.setAttribute('role', 'group');
        gruppeEl.setAttribute('aria-label', displayGroupLabel(gruppe));
        const kopf = doc.createElement('div');
        kopf.className = 'wm-kopf';
        kopf.setAttribute('aria-hidden', 'true');
        kopf.innerHTML = '<span class="wm-kopf-haupt"></span>';
        kopf.firstChild.textContent = displayGroupLabel(gruppe);
        gruppeEl.append(kopf);
        kinder.push(gruppeEl);
      }
      gruppeEl.append(this.#baueZeile(b));
    }
    this.#liste.replaceChildren(...kinder);
    this.#markiereFokus(false);
    this.#zeigeInfo(this.#hover ?? this.#aktiv);
  }

  #baueZeile(b) {
    const doc = this.#doc;
    const w = b.weapon;
    const zeile = doc.createElement('div');
    zeile.id = `wm-o-${b.weaponId}`;
    zeile.className = 'wm-opt';
    zeile.setAttribute('role', 'option');
    zeile.setAttribute('aria-selected', b.aktiv ? 'true' : 'false');
    zeile.dataset.weaponId = b.weaponId;
    zeile.dataset.tier = w?.powerTier ?? 'common';
    if (b.aktiv) zeile.classList.add('is-aktiv');
    if (b.cooldown > 0) zeile.classList.add('is-cooling');
    if (!b.waehlbar) { zeile.classList.add('is-leer'); zeile.setAttribute('aria-disabled', 'true'); }

    const url = iconUrlFor(w);
    if (url) {
      const bild = doc.createElement('img');
      bild.className = 'wm-icon';
      bild.alt = '';
      bild.width = 40;
      bild.height = 40;
      bild.src = url;
      bild.addEventListener('error', () => bild.remove());
      zeile.append(bild);
    }
    const name = doc.createElement('span');
    name.className = 'wm-name';
    name.textContent = `${b.nummer <= 9 ? `${b.nummer}. ` : ''}${w?.displayName ?? b.weaponId}`;
    const munition = doc.createElement('span');
    munition.className = 'wm-munition';
    munition.textContent = b.unbegrenzt ? '∞' : `${zahl(b.ammo)}/${zahl(b.maxAmmo)}`;
    const nachladen = doc.createElement('span');
    nachladen.className = 'wm-nachladen';
    nachladen.textContent = b.cooldown > 0 ? `⏳ ${b.cooldown}` : '';
    zeile.append(name, munition, nachladen);

    // Der Satz zur Waffe erscheint als Tooltip der Kachel (auch dort, wo die Infozeile fehlt: schmale Anzeige).
    if (w?.description) zeile.title = `${w.displayName}: ${w.description}`;
    const teile = [w?.displayName ?? b.weaponId, ...(w?.description ? [w.description] : []),
      b.unbegrenzt ? 'unbegrenzte Munition' : b.ammo > 0 ? `Munition ${b.ammo} von ${b.maxAmmo}` : 'keine Munition'];
    if (b.cooldown > 0) teile.push(`lädt nach, noch ${b.cooldown} ${b.cooldown === 1 ? 'Zug' : 'Züge'}`);
    zeile.setAttribute('aria-label', teile.join(', '));
    return zeile;
  }

  #markiereFokus(scrollen) {
    for (const z of this.#liste.querySelectorAll('.is-fokus')) z.classList.remove('is-fokus');
    const zeile = this.#aktiv ? this.#doc.getElementById(`wm-o-${this.#aktiv}`) : null;
    if (zeile) {
      zeile.classList.add('is-fokus');
      this.#liste.setAttribute('aria-activedescendant', zeile.id);
      this.#wurzel.setAttribute('aria-activedescendant', zeile.id);
      if (scrollen) zeile.scrollIntoView?.({ block: 'nearest' });
    } else {
      this.#liste.removeAttribute('aria-activedescendant');
      this.#wurzel.removeAttribute('aria-activedescendant');
    }
  }

  #setzeAktiv(id, scrollen) {
    this.#aktiv = id;
    this.#markiereFokus(scrollen);
    this.#zeigeInfo(id);
  }

  #bewege(delta) {
    const n = this.#eintraege.length;
    if (n === 0) return;
    const i = this.#eintraege.findIndex(b => b.weaponId === this.#aktiv);
    const ziel = i < 0 ? 0 : Math.max(0, Math.min(n - 1, i + delta));
    this.#setzeAktiv(this.#eintraege[ziel].weaponId, true);
  }

  #taste(e) {
    // Das Spiel (Zielen, Feuern, Zifferntasten, ...) darf hiervon nichts sehen.
    e.stopPropagation();
    switch (e.key) {
      case 'Escape': case 'e': case 'E': e.preventDefault(); this.close(); return;
      case 'ArrowDown': case 'ArrowRight': e.preventDefault(); this.#bewege(1); return;
      case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); this.#bewege(-1); return;
      case 'Home': e.preventDefault(); this.#bewege(-99); return;
      case 'End': e.preventDefault(); this.#bewege(99); return;
      case 'Enter': case ' ':
        if (e.target?.id === 'waffenmenue-schliessen') return;
        e.preventDefault();
        this.#waehle(this.#aktiv);
        return;
      case 'Tab': {
        // Fokusfalle: Menü <-> Schließen-Knopf.
        const zu = this.#doc.getElementById('waffenmenue-schliessen');
        e.preventDefault();
        (e.target === zu ? this.#wurzel : zu).focus();
        return;
      }
      default:
        // Ziffern wählen die Waffe an dieser Stelle der Liste.
        if (/^[1-9]$/.test(e.key)) {
          const b = this.#eintraege[Number(e.key) - 1];
          if (b) this.#waehle(b.weaponId);
        }
    }
  }

  #waehle(id) {
    const b = this.#eintraege.find(x => x.weaponId === id);
    if (!b) return;
    if (!b.waehlbar) {
      const zeile = this.#doc.getElementById(`wm-o-${id}`);
      zeile?.classList.remove('is-wackeln');
      void zeile?.offsetWidth;
      zeile?.classList.add('is-wackeln');
      return;
    }
    if (this.#opts.onSelect(id)) this.close();
  }

  #zeigeInfo(id) {
    const info = this.#info;
    if (!info) return;
    const b = this.#eintraege.find(x => x.weaponId === id);
    const w = b?.weapon;
    if (!w) { info.textContent = ''; return; }
    info.textContent = [
      w.description ? `${w.displayName}: ${w.description}` : w.displayName,
      `Art ${artLabel(w.damageType)}`,
      `Schaden ${w.damage ?? 0}`,
      w.blastRadius > 0 ? `Radius ${Math.round(w.blastRadius)}` : 'kein Flächenschaden',
      `Reichweite ${w.maxRange ?? 0}`,
      w.cooldown > 0 ? `Nachladen ${w.cooldown} ${w.cooldown === 1 ? 'Zug' : 'Züge'}` : 'kein Nachladen',
      `Munition ${b.unbegrenzt ? '∞' : `${zahl(b.ammo)}/${zahl(b.maxAmmo)}`}`,
      STUFEN_NAMEN[w.powerTier] ?? '',
    ].filter(Boolean).join(' · ');
    info.dataset.weaponId = id;
  }
}

export default WaffenMenue;
