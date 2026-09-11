/**
 * DOM-HUD: Runden-, Wind- und Zugzeitanzeige, Spielerliste, Waffenliste
 * und Ereignisprotokoll.
 *
 * Das HUD liest ausschließlich aus dem Match-State und schreibt nie in die
 * Simulation — die Trennung hält Replays und Netzwerk-Sync sauber.
 *
 * @module hud
 */
import { TEAM_COLORS } from '../engine/match.js';
import { getWeapon, WEAPON_SUBCATEGORIES, iconUrlFor, orderInventoryBySubcategory } from '../shared/config/weapons.js';

const LOG_LIMIT = 60;

/**
 * Farben der abgeleiteten Waffenstufen.
 *
 * Die Quelle kennt nur common/uncommon/rare; epic und legendary leitet der
 * Katalog-Generator deterministisch aus den Waffenwerten ab (siehe
 * scripts/build-weapon-catalog.mjs, POWER_TIERS).
 */
const TIER_COLORS = Object.freeze({
  common: '#c8d3de',
  uncommon: '#90be6d',
  rare: '#4cc9f0',
  epic: '#b388ff',
  legendary: '#ffb703',
});

export class Hud {
  #elements;
  #logEntries = [];
  #selectedWeaponIndex = 0;
  #rosterSignature = '';
  #weaponSignature = '';

  constructor(documentRef = document) {
    this.#elements = {
      round: documentRef.getElementById('hud-round'),
      wind: documentRef.getElementById('hud-wind'),
      timer: documentRef.getElementById('hud-timer'),
      status: documentRef.getElementById('hud-status'),
      roster: documentRef.getElementById('roster'),
      weapons: documentRef.getElementById('weapon-list'),
      angle: documentRef.getElementById('hud-angle'),
      power: documentRef.getElementById('hud-power'),
      blast: documentRef.getElementById('hud-blast'),
      active: documentRef.getElementById('hud-active'),
      log: documentRef.getElementById('log-list'),
      connection: documentRef.getElementById('hud-connection'),
    };
  }

  /**
   * Zeigt den Verbindungszustand im Online-Modus.
   * @param {string} state
   * @param {number} latencyMs
   */
  setConnection(state, latencyMs = 0) {
    const element = this.#elements.connection;
    if (!element) return;
    const labels = {
      idle: 'offline',
      connecting: 'verbindet …',
      connected: `online · ${latencyMs} ms`,
      reconnecting: 'neu verbinden …',
      closed: 'getrennt',
    };
    element.textContent = labels[state] ?? state;
    element.style.color = state === 'connected' ? '#90be6d'
      : state === 'reconnecting' || state === 'closed' ? '#ef476f'
      : '#8ba0b4';
  }

  get elements() {
    return this.#elements;
  }

  /** Aktualisiert alle HUD-Felder aus einem Match-State. */
  update(state, { aim = null, onWeaponSelect = null } = {}) {
    const el = this.#elements;
    if (el.round) el.round.textContent = String(state.round);
    if (el.wind) {
      const wind = state.wind ?? 0;
      el.wind.textContent = `${wind >= 0 ? '→' : '←'} ${Math.abs(wind).toFixed(3)}`;
      el.wind.style.color = Math.abs(wind) > 0.03 ? '#ef476f' : '#e8eef5';
    }
    if (el.timer) {
      const remaining = Math.max(0, (state.turnDurationMs - state.turnElapsedMs) / 1000);
      el.timer.textContent = remaining.toFixed(0);
      el.timer.style.color = remaining < 6 ? '#ef476f' : '#e8eef5';
    }
    if (el.status) {
      el.status.textContent = state.status === 'gameover'
        ? 'Ende'
        : state.maelstrom?.active ? 'Mahlstrom' : 'Läuft';
      el.status.style.color = state.maelstrom?.active ? '#ef476f' : '#90be6d';
    }

    this.#renderRoster(state);
    this.#renderWeapons(state, onWeaponSelect);

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    if (el.active) {
      el.active.textContent = active ? `${active.label} am Zug` : '—';
      el.active.style.color = active ? TEAM_COLORS[active.teamId % TEAM_COLORS.length] : '#8ba0b4';
    }
    if (el.angle) el.angle.textContent = `${Math.round((((aim?.angle ?? active?.angle ?? 0)) * 180) / Math.PI)}°`;
    if (el.power) el.power.textContent = String(Math.round(aim?.power ?? active?.power ?? 0));

    // Flächenwirkung der gewählten Waffe: hilft beim Einschätzen des Splash-Radius.
    if (el.blast) {
      const weapon = active?.activeWeaponId ? getWeapon(active.activeWeaponId) : null;
      const radius = weapon?.blastRadius ?? 0;
      el.blast.textContent = radius > 0 ? `⌀ ${Math.round(radius)}` : '— direkt —';
      el.blast.style.color = radius > 0 ? '#f4a261' : '#8ba0b4';
    }
  }

  #renderRoster(state) {
    const list = this.#elements.roster;
    if (!list) return;

    // Zustände (Schild, Einfrieren, Schaden über Zeit) gehören in die Signatur:
    // sonst bliebe die Anzeige stehen, obwohl sich der Zustand geändert hat.
    const zustandsText = entity => {
      const zustand = state.statuses?.[entity.entityId];
      if (!zustand) return '';
      const teile = [];
      if (zustand.shield > 0) teile.push(`S${Math.round(zustand.shield)}`);
      if (zustand.frozenTurns > 0) teile.push(`❄${zustand.frozenTurns}`);
      if (zustand.dots?.length > 0) teile.push(`☠${zustand.dots.length}`);
      if (zustand.boostMultiplier > 1) teile.push('↑');
      return teile.join(' ');
    };

    const signature = state.entities
      .map(entity => `${entity.entityId}:${entity.alive ? 1 : 0}:${Math.round(entity.health)}:${entity.entityId === state.activePlayerId ? 1 : 0}:${zustandsText(entity)}`)
      .join('|');
    if (this.#rosterSignature === signature) return;
    this.#rosterSignature = signature;

    list.replaceChildren(...state.entities.map(entity => {
      const item = document.createElement('li');
      item.className = 'roster-item';
      item.dataset.entityId = String(entity.entityId);
      if (entity.entityId === state.activePlayerId) item.classList.add('is-active');
      if (!entity.alive) item.classList.add('is-dead');

      const name = document.createElement('span');
      name.textContent = entity.label;
      name.style.color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      const track = document.createElement('span');
      track.className = 'hp-track';
      const fill = document.createElement('span');
      fill.className = 'hp-fill';
      const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.style.background = ratio > 0.6 ? '#90be6d' : ratio > 0.3 ? '#fbbf24' : '#ef476f';
      track.append(fill);

      // Laufende Zustände als kompakte Marken: Schild, Einfrieren, Schaden über
      // Zeit, Schadensbonus. Ohne sie wäre nicht erkennbar, warum eine Figur
      // aussetzt oder weniger Schaden nimmt.
      const zustand = state.statuses?.[entity.entityId];
      const marken = [];
      if (zustand?.shield > 0) marken.push({ text: `🛡 ${Math.round(zustand.shield)}`, color: '#4cc9f0' });
      if (zustand?.frozenTurns > 0) marken.push({ text: `❄ ${zustand.frozenTurns}`, color: '#7fd8ff' });
      if (zustand?.dots?.length > 0) marken.push({ text: `☠ ${zustand.dots.length}`, color: '#90be6d' });
      if (zustand?.boostMultiplier > 1) marken.push({ text: '↑', color: '#ffb703' });

      const hp = document.createElement('span');
      hp.textContent = String(Math.max(0, Math.round(entity.health)));
      hp.style.fontVariantNumeric = 'tabular-nums';

      item.append(name, track, hp);

      for (const marke of marken) {
        const badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = marke.text;
        badge.style.color = marke.color;
        badge.title = zustand?.frozenTurns > 0 && marke.text.startsWith('❄')
          ? `Eingefroren: setzt ${zustand.frozenTurns} Zug/Züge aus`
          : marke.text.startsWith('🛡') ? 'Schild: fängt Schaden ab, bevor Gesundheit sinkt'
            : marke.text.startsWith('☠') ? 'Schaden über Zeit: wirkt bei jedem Zugbeginn'
              : 'Erhöhter Schaden';
        item.append(badge);
      }

      return item;
    }));
  }

  #renderWeapons(state, onWeaponSelect) {
    const list = this.#elements.weapons;
    if (!list) return;

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    const weapons = active?.inventory ?? [];
    // Munition gehört in die Signatur: sonst aktualisiert sich die Anzeige
    // erst beim Zugwechsel statt direkt nach einem Schuss.
    const ammoKey = weapons.map(id => `${id}=${active?.ammo?.[id] ?? 0}`).join(',');
    // Nachladezeiten gehören in die Signatur: sonst bliebe die Anzeige stehen,
    // obwohl eine Waffe wieder bereit ist.
    const cdKey = weapons.map(id => `${id}=${active?.cooldowns?.[id] ?? 0}`).join(',');
    const signature = `${state.activePlayerId}:${weapons.join(',')}:${active?.activeWeaponId ?? ''}:${ammoKey}:${cdKey}`;
    if (this.#weaponSignature === signature) return;
    this.#weaponSignature = signature;

    // Nach den vier Gruppen gliedern, in fester Reihenfolge. Innerhalb einer
    // Gruppe bleibt die Reihenfolge des Inventars erhalten, und der laufende
    // Index bleibt der Gesamtindex — das Klicken und die Zifferntasten arbeiten
    // deshalb unverändert.
    // Eine Ordnung für Anzeige UND Eingabe. Die angezeigte Nummer ist die
    // Position in dieser Reihenfolge; die Zifferntasten treffen dieselbe Waffe.
    const reihenfolge = orderInventoryBySubcategory(weapons);
    const positionVon = new Map(reihenfolge.map((inventarIndex, position) => [inventarIndex, position]));

    const gruppen = WEAPON_SUBCATEGORIES.map(gruppe => ({
      id: gruppe.id,
      label: gruppe.label,
      eintraege: reihenfolge
        .map(index => ({ weaponId: weapons[index], index, weapon: getWeapon(weapons[index]) }))
        .filter(eintrag => (eintrag.weapon?.subcategory ?? 'special') === gruppe.id),
    })).filter(gruppe => gruppe.eintraege.length > 0);

    const kinder = [];
    for (const gruppe of gruppen) {
      const kopf = document.createElement('li');
      kopf.className = 'weapon-group';
      kopf.dataset.subcategory = gruppe.id;
      kopf.textContent = `${gruppe.label} (${gruppe.eintraege.length})`;
      kinder.push(kopf);
      kinder.push(...gruppe.eintraege.map(eintrag => this.#buildWeaponItem({
        ...eintrag,
        anzeigeNummer: positionVon.get(eintrag.index) + 1,
      }, active, onWeaponSelect)));
    }

    list.replaceChildren(...kinder);
  }

  /** Baut eine Zeile der Waffenliste. */
  #buildWeaponItem({ weaponId, index, weapon, anzeigeNummer }, active, onWeaponSelect) {
    const item = document.createElement('li');
    item.className = 'weapon-item';
    item.dataset.weaponId = weaponId;
    item.dataset.tier = weapon?.powerTier ?? 'common';
    if (weaponId === active?.activeWeaponId) item.classList.add('is-active');

    // Waffen-Icon: das Logo aus assets/weapons/icons, vom Generator als Pfad
    // hinterlegt. Fehlt die Datei, bleibt die Zeile ohne Bild nutzbar.
    const iconUrl = iconUrlFor(weapon);
    if (iconUrl) {
      const image = document.createElement('img');
      image.className = 'weapon-icon';
      // Auflösung über den Katalog: der Pfad ist relativ zu weapons.js.
      image.src = iconUrl;
      image.alt = '';
      image.width = 24;
      image.height = 24;
      image.loading = 'lazy';
      // Ladefehler dürfen die Liste nicht stören.
      image.addEventListener('error', () => image.remove());
      item.append(image);
    }

    const label = document.createElement('span');
    label.className = 'weapon-name';
    label.textContent = `${anzeigeNummer ?? index + 1}. ${weapon?.displayName ?? weaponId}`;
    // Rarität als Farbe: die abgeleitete Stufe ist im Katalog dokumentiert.
    label.style.color = TIER_COLORS[weapon?.powerTier] ?? TIER_COLORS.common;

    const meta = document.createElement('span');
    const ammo = active?.ammo?.[weaponId];
    const restCooldown = active?.cooldowns?.[weaponId] ?? 0;
    meta.textContent = ammo === 'unbegrenzt'
      ? `${weapon?.damage ?? 0} DMG · ∞`
      : `${weapon?.damage ?? 0} DMG · ${ammo ?? 0}`;
    meta.style.color = '#8ba0b4';

    item.append(label, meta);

    // Nachladezeit sichtbar machen: ohne sie wäre unklar, warum ein Schuss
    // abgelehnt wird. Die Zeile wird zusätzlich abgeblendet.
    if (restCooldown > 0) {
      const cd = document.createElement('span');
      cd.className = 'weapon-cooldown';
      cd.textContent = `⏳ ${restCooldown}`;
      cd.title = `Lädt nach — noch ${restCooldown} ${restCooldown === 1 ? 'Zug' : 'Züge'}`;
      item.append(cd);
      item.classList.add('is-cooling');
      item.dataset.cooldown = String(restCooldown);
    }

    const radius = weapon?.blastRadius ?? 0;
    item.title = [
      weapon?.displayName ?? weaponId,
      `Schaden ${weapon?.damage ?? 0}`,
      radius > 0 ? `Radius ${Math.round(radius)}` : 'kein Flächenschaden',
      `Stufe ${weapon?.powerTier ?? 'common'} (Wert ${weapon?.powerScore ?? 0})`,
      `Reichweite ${weapon?.maxRange ?? 0} px`,
      (weapon?.cooldown ?? 0) > 0 ? `Nachladen ${weapon.cooldown} Zug/Züge` : 'kein Nachladen',
      weapon?.category ? `Kategorie ${weapon.category}` : null,
    ].filter(Boolean).join(' · ');
    item.addEventListener('click', () => onWeaponSelect?.(index));
    return item;
  }

  /** Fügt eine Zeile zum Ereignisprotokoll hinzu. */
  log(message, tone = 'neutral') {
    this.#logEntries.unshift({ message, tone });
    if (this.#logEntries.length > LOG_LIMIT) this.#logEntries.pop();

    const list = this.#elements.log;
    if (!list) return;

    list.replaceChildren(...this.#logEntries.map(entry => {
      const item = document.createElement('li');
      item.textContent = entry.message;
      item.style.color = entry.tone === 'danger' ? '#ef476f'
        : entry.tone === 'good' ? '#90be6d'
        : entry.tone === 'accent' ? '#f4a261'
        : '#8ba0b4';
      return item;
    }));
  }

  clearLog() {
    this.#logEntries = [];
    this.#elements.log?.replaceChildren();
  }
}

export default Hud;
