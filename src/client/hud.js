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
import {
  getWeapon,
  iconUrlFor,
  orderInventoryBySubcategory,
  displayGroupFor,
  displayGroupLabel,
} from '../shared/config/weapons.js';
import { WATER_STATE, waterStateFor, waterLabel, DROWN_LEVEL } from '../shared/config/water.js';

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
  /** Zuletzt angesagter aktiver Spieler — für die Zugwechsel-Meldung. */
  #lastActiveId = null;

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
    /*
     * Zugwechsel ins Protokoll schreiben.
     *
     * Das Protokoll ist die Live-Region des HUD (`role="log"`), und für einen
     * Screenreader ist die wichtigste Frage im Spiel: Wer ist jetzt dran? Ohne
     * diese Zeile bliebe der Zugwechsel stumm — `#hud-active` wird nur sichtbar
     * geändert, und es absichtlich NICHT zur Live-Region gemacht: Dann kämen
     * zwei Ansagen für dasselbe Ereignis.
     *
     * Protokolliert wird nur der WECHSEL, nicht jeder Frame — `update()` läuft
     * mit der Bildrate.
     */
    if (active && active.entityId !== this.#lastActiveId) {
      this.log(`${active.label} ist am Zug`, 'accent');
      this.#lastActiveId = active.entityId;
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
      const teile = [];
      if (zustand) {
        if (zustand.shield > 0) teile.push(`S${Math.round(zustand.shield)}`);
        if (zustand.frozenTurns > 0) teile.push(`❄${zustand.frozenTurns}`);
        if (zustand.dots?.length > 0) teile.push(`☠${zustand.dots.length}`);
        if (zustand.boostMultiplier > 1) teile.push('↑');
      }
      // Wasser gehört in dieselbe Signatur: Steigt der Pegel durch Verdrängung,
      // muss die Marke erscheinen, ohne dass sich Leben oder Position ändern.
      if (waterStateFor(entity.waterLevel) !== WATER_STATE.DRY) {
        teile.push(`W${Math.round((entity.waterLevel ?? 0) * 100)}`);
      }
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

      // Wasser: Der Füllstand ist eine Zahl zwischen 0 und 1 und für den Spieler
      // bedeutungslos — deshalb Prozent und Zustandswort. „nass" bremst nur,
      // „untergetaucht" kostet Leben; die Farbe macht den Unterschied sichtbar.
      const wasserzustand = waterStateFor(entity.waterLevel);
      if (wasserzustand !== WATER_STATE.DRY) {
        const untergetaucht = wasserzustand === WATER_STATE.SUBMERGED;
        marken.push({
          text: `${untergetaucht ? '🌊' : '💧'} ${waterLabel(entity.waterLevel)}`,
          color: untergetaucht ? '#ef476f' : '#4cc9f0',
          title: untergetaucht
            ? `Untergetaucht (${Math.round((entity.waterLevel ?? 0) * 100)} % Füllstand) — verliert Leben, bis die Figur aus dem Wasser kommt. Ertrinken ab ${Math.round(DROWN_LEVEL * 100)} %.`
            : `Im Wasser (${Math.round((entity.waterLevel ?? 0) * 100)} % Füllstand) — Bewegung gebremst, noch kein Ertrinken. Ertrinken ab ${Math.round(DROWN_LEVEL * 100)} %.`,
        });
      }

      const hp = document.createElement('span');
      hp.textContent = String(Math.max(0, Math.round(entity.health)));
      hp.style.fontVariantNumeric = 'tabular-nums';

      item.append(name, track, hp);

      for (const marke of marken) {
        const badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = marke.text;
        badge.style.color = marke.color;
        badge.title = marke.title ?? (zustand?.frozenTurns > 0 && marke.text.startsWith('❄')
          ? `Eingefroren: setzt ${zustand.frozenTurns} Zug/Züge aus`
          : marke.text.startsWith('🛡') ? 'Schild: fängt Schaden ab, bevor Gesundheit sinkt'
            : marke.text.startsWith('☠') ? 'Schaden über Zeit: wirkt bei jedem Zugbeginn'
              : 'Erhöhter Schaden');
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

    /*
     * Fokus merken, bevor die Liste neu aufgebaut wird.
     *
     * Fund (belegt): `replaceChildren` entfernt alle alten Knoten. Liegt der
     * Fokus auf einer Waffenzeile — was seit der Tastaturbedienung möglich ist —,
     * wandert er mit dem entfernten Knoten auf `<body>`. Und die Liste wird bei
     * JEDER Änderung neu gebaut: nach einem Schuss (Munition), nach dem
     * Waffenwechsel, beim Zugwechsel. Ein Tastaturnutzer verlor den Fokus also
     * genau in dem Moment, in dem er etwas ausgewählt hatte, und musste sich von
     * vorn durch die Seite tabben.
     */
    const fokussierteWaffe = document.activeElement?.dataset?.weaponId ?? null;

    /*
     * Eine Ordnung für Anzeige UND Eingabe. Die angezeigte Nummer ist die
     * Position in dieser Reihenfolge; die Zifferntasten treffen dieselbe Waffe.
     */
    const reihenfolge = orderInventoryBySubcategory(weapons);
    const positionVon = new Map(reihenfolge.map((inventarIndex, position) => [inventarIndex, position]));

    /*
     * Die Gruppen entstehen aus DIESER Reihenfolge — nicht aus einer zweiten
     * Sortierung nach Unterkategorie.
     *
     * Fund (belegt): Vorher lief die Gliederung über die feste Liste der
     * Unterkategorien, die Nummerierung aber über `orderInventoryBySubcategory`.
     * Solange beide dieselbe Ordnung ergaben, fiel das nicht auf. Seit die
     * Reservewaffe in der Sortierung ans Ende wandert (sie ist nicht abwerfbar,
     * siehe `orderInventoryBySubcategory`), fiel sie in der Gliederung weiter
     * unter „Schusswaffen" — und die Nummern standen nicht mehr aufsteigend:
     * 1, 2, 3, 5, 4. Ein Leser sieht die 5 über der 4.
     *
     * Dadurch, dass die Gruppen beim Durchlaufen der Reihenfolge entstehen,
     * gilt: Die Gruppen stehen in der Reihenfolge ihres ersten Auftretens, und
     * die Nummern steigen lückenlos von oben nach unten. Die Reserve bekommt
     * über `displayGroupFor` eine eigene Gruppe, weil sie keine Spielweise ist.
     */
    const gruppen = [];
    const gruppeVon = new Map();
    for (const index of reihenfolge) {
      const weaponId = weapons[index];
      const id = displayGroupFor(weaponId);
      let gruppe = gruppeVon.get(id);
      if (!gruppe) {
        gruppe = { id, label: displayGroupLabel(id), eintraege: [] };
        gruppeVon.set(id, gruppe);
        gruppen.push(gruppe);
      }
      gruppe.eintraege.push({ weaponId, index, weapon: getWeapon(weaponId) });
    }

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

    // Fokus zurückholen — auf dieselbe Waffe, nicht auf dieselbe Position.
    if (fokussierteWaffe) {
      list.querySelector(`.weapon-item[data-weapon-id="${fokussierteWaffe}"]`)?.focus();
    }
  }

  /** Baut eine Zeile der Waffenliste. */
  #buildWeaponItem({ weaponId, index, weapon, anzeigeNummer }, active, onWeaponSelect) {
    const item = document.createElement('li');
    item.className = 'weapon-item';
    item.dataset.weaponId = weaponId;
    item.dataset.tier = weapon?.powerTier ?? 'common';
    const istAktiv = weaponId === active?.activeWeaponId;
    if (istAktiv) item.classList.add('is-active');

    /*
     * Bedienbar und benannt — auch ohne Maus.
     *
     * Die Zeilen waren reine `<li>` mit Klick-Listener: Für Maus und
     * Zifferntasten hat das gereicht, für Tastatur und Screenreader nicht. In
     * der Baumansicht des Browsers standen sie als gewöhnliche Listeneinträge,
     * ohne Rolle und ohne Fokus — wer nicht klicken kann, kam an die
     * Waffenauswahl gar nicht heran.
     *
     * `role="button"` plus `tabindex` macht sie erreichbar; `aria-label` nennt
     * Anzeigenummer, Name, Schaden und Munition, weil die sichtbare Zeile aus
     * mehreren Spans besteht und vorgelesen sonst „1. Schaufel 20 DMG · 5"
     * ohne Zusammenhang ergäbe. `aria-current` markiert die gewählte Waffe.
     */
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-label', `${anzeigeNummer ?? index + 1}. ${weapon?.displayName ?? weaponId}`);
    if (istAktiv) item.setAttribute('aria-current', 'true');

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
    /*
     * Eingabe und Leertaste wählen die Waffe.
     *
     * `stopPropagation` ist hier kein Detail, sondern nötig: Die Leertaste
     * feuert im Spiel (der Eingabe-Controller hängt global am Fenster). Ohne
     * die Sperre würde ein Tastendruck auf einer fokussierten Waffenzeile
     * gleichzeitig auswählen UND schießen.
     */
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      event.stopPropagation();
      onWeaponSelect?.(index);
    });
    return item;
  }

  /** Fügt eine Zeile zum Ereignisprotokoll hinzu. */
  log(message, tone = 'neutral') {
    this.#logEntries.unshift({ message, tone });
    if (this.#logEntries.length > LOG_LIMIT) this.#logEntries.pop();

    const list = this.#elements.log;
    if (!list) return;

    /*
     * Nur die NEUE Zeile einfügen — die Liste nicht neu aufbauen.
     *
     * Das Protokoll ist die Live-Region des HUD (`role="log"`, siehe
     * index.html). Ein `replaceChildren` über alle Zeilen würde bei jeder
     * Meldung 60 Knoten neu erzeugen; ein Screenreader liest die Region dann
     * als Ganzes vor — bei jeder einzelnen Meldung. Deshalb: vorn einfügen und
     * hinten abschneiden. Der Screenreader bekommt genau einen neuen Knoten zu
     * sehen (`aria-relevant="additions"`).
     */
    list.prepend(this.#logItem(message, tone));
    while (list.children.length > LOG_LIMIT) list.lastElementChild.remove();
  }

  /** Baut eine Protokollzeile. */
  #logItem(message, tone) {
    const item = document.createElement('li');
    item.textContent = message;
    item.style.color = tone === 'danger' ? '#ef476f'
      : tone === 'good' ? '#90be6d'
      : tone === 'accent' ? '#f4a261'
      : '#8ba0b4';
    return item;
  }

  clearLog() {
    this.#logEntries = [];
    this.#elements.log?.replaceChildren();
  }
}

export default Hud;
