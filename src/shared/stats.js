/**
 * Spielerkennzahlen.
 *
 * ## Woher die Zahlen kommen
 *
 * Nicht aus einer zweiten Buchführung neben dem Spiel, sondern aus den
 * EREIGNISSEN des Matches: `shot`, `damage`, `turn_start`, `match_over`. Damit
 * gibt es die Zahlen nur einmal, und sie können nicht von dem abweichen, was
 * tatsächlich geschehen ist. Wer eine neue Kennzahl braucht, braucht ein
 * Ereignis — nicht eine zusätzliche Zählung.
 *
 * ## Näherung, offen benannt
 *
 * „Treffer" ist genähert: Ein Schuss gilt als Treffer, wenn danach Schaden an
 * einem Gegner ankommt, bevor der nächste Schuss desselben Spielers fällt. Bei
 * Flächenwaffen kann das mehrere Gegner treffen — gezählt wird trotzdem EIN
 * Treffer (der Schuss hat getroffen, nicht drei). Das ist die ehrliche Definition
 * für „Trefferquote" (treffende Schüsse / alle Schüsse); die Anzahl getroffener
 * Figuren wäre eine andere Zahl und steht nicht hier.
 *
 * ## Kein Zufall, keine Zeitmessung von außen
 *
 * Die Spielzeit kommt aus `match_over.ticks` — nicht aus der Uhr des Rechners.
 * Sonst hinge die Statistik davon ab, wie schnell der Rechner war.
 *
 * @module stats
 */

/** Ein Schuss gilt als Treffer, wenn innerhalb dieser Takte Schaden ankommt. */
const TREFFER_FENSTER_TICKS = 240;

/**
 * Sammelt Kennzahlen einer Partie.
 *
 * Bewusst als Sammler statt als reine Funktion: Die Ereignisse kommen in der
 * Reihenfolge des Spiels, und „Treffer" hängt an der Reihenfolge (Schuss, dann
 * Schaden). Eine reine Funktion über eine ungeordnete Liste könnte das nicht
 * entscheiden.
 */
export class MatchStats {
  /**
   * @param {object} optionen
   * @param {Map<number, number>|object} optionen.teams - entityId → teamId
   */
  constructor({ teams = new Map() } = {}) {
    /** entityId → teamId */
    this.teams = teams instanceof Map ? teams : new Map(Object.entries(teams).map(([k, v]) => [Number(k), v]));
    /** playerId → Kennzahlen */
    this.spieler = new Map();
    this.tick = 0;
    this.runde = 0;
    this.winde = [];
    this.gewinnerTeamId = null;
    this.endeGrund = null;
    this.entschieden = false;
  }

  #eintrag(playerId) {
    if (!this.spieler.has(playerId)) {
      this.spieler.set(playerId, {
        playerId,
        schuesse: 0,
        treffer: 0,
        schaden: 0,
        absorbierterSchaden: 0,
        /** Waffe → Anzahl Schüsse. Grundlage für die Lieblingswaffe. */
        waffen: new Map(),
        /** Waffe des letzten Schusses, für die Trefferzuordnung. */
        letzterSchuss: null,
        zuege: 0,
        rundenUeberlebt: 0,
      });
    }
    return this.spieler.get(playerId);
  }

  /** Anzahl der Schüsse, die zu einem Spieler gehören. */
  get schuesseGesamt() {
    let summe = 0;
    for (const e of this.spieler.values()) summe += e.schuesse;
    return summe;
  }

  /**
   * Verarbeitet ein Ereignis des Matches.
   * @returns {boolean} true, wenn das Ereignis ausgewertet wurde
   */
  feed(ereignis) {
    if (!ereignis || typeof ereignis.type !== 'string') return false;
    const p = ereignis.payload ?? {};

    switch (ereignis.type) {
      case 'turn_start': {
        // Die Rundenzahl und der Wind kommen mit dem Zugbeginn — beides je Runde
        // einmal, deshalb nur beim ersten Zug der Runde übernehmen.
        if (typeof p.round === 'number' && p.round > this.runde) {
          this.runde = p.round;
          if (typeof p.wind === 'number') this.winde.push(p.wind);
        }
        if (typeof p.playerId === 'number') this.#eintrag(p.playerId).zuege += 1;
        return true;
      }

      case 'shot': {
        if (typeof p.playerId !== 'number') return false;
        const eintrag = this.#eintrag(p.playerId);
        eintrag.schuesse += 1;
        eintrag.letzterSchuss = {
          // Der Tick, damit ein späterer Schaden nicht einem alten Schuss
          // zugerechnet wird.
          tick: this.tick,
          waffe: p.weaponId ?? null,
          getroffen: false,
        };
        if (p.weaponId) eintrag.waffen.set(p.weaponId, (eintrag.waffen.get(p.weaponId) ?? 0) + 1);
        return true;
      }

      case 'damage': {
        /*
         * Schaden am Gegner. Schaden an sich selbst oder durch die Umgebung
         * (Günther, Sturz, Ertrinken) hat keinen Angreifer und zählt nicht.
         */
        const angreifer = p.attackerId;
        const ziel = p.entityId;
        if (typeof angreifer !== 'number' || typeof ziel !== 'number') return false;
        if (angreifer === ziel) return false;
        const teamAngreifer = this.teams.get(angreifer);
        const teamZiel = this.teams.get(ziel);
        if (teamAngreifer !== undefined && teamAngreifer === teamZiel) return false;

        const eintrag = this.#eintrag(angreifer);
        const betrag = Number(p.amount) || 0;
        if (betrag > 0) eintrag.schaden += betrag;
        if (Number(p.absorbedByShield) > 0) eintrag.absorbierterSchaden += Number(p.absorbedByShield);

        // Treffer: der letzte Schuss dieses Spielers hat angerichtet.
        const letzter = eintrag.letzterSchuss;
        if (letzter && !letzter.getroffen && this.tick - letzter.tick <= TREFFER_FENSTER_TICKS) {
          letzter.getroffen = true;
          eintrag.treffer += 1;
        }
        return true;
      }

      case 'match_over': {
        this.gewinnerTeamId = p.winnerTeamId ?? null;
        this.endeGrund = p.reason ?? null;
        this.entschieden = true;
        if (typeof p.rounds === 'number') this.runde = p.rounds;
        if (typeof p.ticks === 'number') this.tick = p.ticks;
        return true;
      }

      default:
        return false;
    }
  }

  /** Verarbeitet eine Liste von Ereignissen. */
  feedAll(ereignisse = []) {
    let verarbeitet = 0;
    for (const e of ereignisse) if (this.feed(e)) verarbeitet += 1;
    return verarbeitet;
  }

  /**
   * Kennzahlen eines Spielers.
   *
   * @param {number} playerId
   * @returns {object|null} null, wenn der Spieler nie geschossen oder gezogen hat
   */
  fuer(playerId) {
    const eintrag = this.spieler.get(playerId);
    if (!eintrag) return null;
    return {
      playerId,
      teamId: this.teams.get(playerId) ?? null,
      schuesse: eintrag.schuesse,
      treffer: eintrag.treffer,
      schaden: Math.round(eintrag.schaden),
      absorbierterSchaden: Math.round(eintrag.absorbierterSchaden),
      /** Treffer / Schüsse, 0..1. `null`, wenn nicht geschossen wurde. */
      trefferquote: eintrag.schuesse > 0 ? eintrag.treffer / eintrag.schuesse : null,
      zuege: eintrag.zuege,
      /** Häufigste Waffe (Gleichstand: die mit den meisten Schüssen, sonst erste). */
      lieblingswaffe: lieblingswaffe(eintrag.waffen),
      /** Sieg aus Sicht dieses Spielers — `null`, solange nicht entschieden. */
      sieg: this.entschieden && this.gewinnerTeamId !== null
        ? this.teams.get(playerId) === this.gewinnerTeamId
        : null,
    };
  }

  /** Kennzahlen aller Spieler, nach Schaden sortiert. */
  alle() {
    return [...this.spieler.keys()]
      .map(id => this.fuer(id))
      .filter(Boolean)
      .sort((a, b) => b.schaden - a.schaden || b.schuesse - a.schuesse || a.playerId - b.playerId);
  }

  /**
   * Zusammenfassung der Partie — die Grundlage für das Profil.
   *
   * @param {number} [eigenerSpielerId] - aus dessen Sicht (Sieg, „bester Schuss")
   */
  zusammenfassung(eigenerSpielerId = null) {
    const figuren = this.alle();
    const gesamt = figuren.reduce((summe, f) => summe + f.schaden, 0);
    // Spielzeit aus den Takten des Matches, nicht aus der Uhr des Rechners.
    const dauerSekunden = this.tick / 60;
    return {
      runden: this.runde,
      ticks: this.tick,
      dauerSekunden,
      entschieden: this.entschieden,
      gewinnerTeamId: this.gewinnerTeamId,
      endeGrund: this.endeGrund,
      // Durchschnittlicher Wind über die Runden — eine Kennzahl der Partie.
      windSchnitt: this.winde.length > 0
        ? this.winde.reduce((a, b) => a + b, 0) / this.winde.length
        : 0,
      figuren,
      schadenGesamt: Math.round(gesamt),
      /** Schaden je Minute — über die TATSÄCHLICHE Spieldauer. */
      schadenProMinute: dauerSekunden > 0 ? Math.round(gesamt / (dauerSekunden / 60)) : 0,
      eigener: eigenerSpielerId !== null ? this.fuer(eigenerSpielerId) : null,
    };
  }
}

/** Häufigste Waffe; bei Gleichstand die mit dem kleineren Schlüssel (stabil). */
export function lieblingswaffe(zaehler) {
  if (!zaehler || zaehler.size === 0) return null;
  let beste = null;
  let besterWert = -1;
  for (const [waffe, anzahl] of [...zaehler.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (anzahl > besterWert) { beste = waffe; besterWert = anzahl; }
  }
  return { waffeId: beste, anzahl: besterWert };
}

/**
 * Ein Spielerprofil über mehrere Partien.
 *
 * `merge` ist der einzige Weg, ein Profil zu verändern: Es nimmt das Ergebnis
 * EINER Partie und schreibt es fort. Die Serie (Siege in Folge) wird dabei
 * gepflegt — sie lässt sich nicht aus Summen rekonstruieren, sondern braucht die
 * Reihenfolge der Partien.
 */
export class PlayerProfile {
  /**
   * @param {object} [felder]
   * @param {string} [felder.name]
   * @param {string} [felder.fraktion] - Lieblingsfraktion (Kennung)
   */
  constructor(felder = {}) {
    this.name = felder.name ?? 'Spieler';
    this.fraktion = felder.fraktion ?? null;
    this.partien = felder.partien ?? 0;
    this.siege = felder.siege ?? 0;
    this.niederlagen = felder.niederlagen ?? 0;
    /** Aktuelle Serie: positiv = Siege in Folge, negativ = Niederlagen. */
    this.serie = felder.serie ?? 0;
    this.serieRekord = felder.serieRekord ?? 0;
    this.schuesse = felder.schuesse ?? 0;
    this.treffer = felder.treffer ?? 0;
    this.schaden = felder.schaden ?? 0;
    this.absorbierterSchaden = felder.absorbierterSchaden ?? 0;
    this.zuege = felder.zuege ?? 0;
    /** Spielzeit in Sekunden, summiert über alle Partien. */
    this.spielzeitSekunden = felder.spielzeitSekunden ?? 0;
    /** Waffe → Schüsse, über alle Partien. */
    this.waffen = new Map(Object.entries(felder.waffen ?? {}));
    /** Fraktion → Partien. */
    this.fraktionen = new Map(Object.entries(felder.fraktionen ?? {}));
  }

  /**
   * Schreibt das Ergebnis einer Partie fort.
   *
   * @param {object} partie - aus `MatchStats#zusammenfassung(eigenerSpielerId)`
   * @returns {this}
   */
  merge(partie) {
    const eigener = partie?.eigener;
    // Ohne eigene Kennzahlen gibt es nichts zu verbuchen — eine Partie ohne
    // eigenen Zug (Zuschauer, sofortiges Ende) verändert das Profil nicht.
    if (!eigener) return this;

    this.partien += 1;
    this.schuesse += eigener.schuesse;
    this.treffer += eigener.treffer;
    this.schaden += eigener.schaden;
    this.absorbierterSchaden += eigener.absorbierterSchaden;
    this.zuege += eigener.zuege;
    this.spielzeitSekunden += partie.dauerSekunden ?? 0;

    if (eigener.sieg === true) {
      this.siege += 1;
      this.serie = this.serie >= 0 ? this.serie + 1 : 1;
    } else if (eigener.sieg === false) {
      this.niederlagen += 1;
      this.serie = this.serie <= 0 ? this.serie - 1 : -1;
    }
    // Beste Serie: nur die Siegesserie zählt, nicht die Niederlagenserie.
    if (this.serie > this.serieRekord) this.serieRekord = this.serie;

    return this;
  }

  /** Verbucht die Fraktion einer Partie (für die Lieblingsnation). */
  spieleMit(fraktion) {
    if (!fraktion) return this;
    this.fraktionen.set(fraktion, (this.fraktionen.get(fraktion) ?? 0) + 1);
    return this;
  }

  /** Verbucht die in einer Partie benutzten Waffen. */
  benutzeWaffen(zaehler) {
    if (!zaehler) return this;
    for (const [waffe, anzahl] of zaehler) {
      this.waffen.set(waffe, (this.waffen.get(waffe) ?? 0) + anzahl);
    }
    return this;
  }

  /** Trefferquote über alle Partien (0..1) oder `null`. */
  get trefferquote() {
    return this.schuesse > 0 ? this.treffer / this.schuesse : null;
  }

  /** Schaden je Minute über die gesamte Spielzeit. */
  get schadenProMinute() {
    return this.spielzeitSekunden > 0
      ? Math.round(this.schaden / (this.spielzeitSekunden / 60))
      : 0;
  }

  /** Siegquote (0..1) oder `null`, wenn noch nicht gespielt. */
  get siegquote() {
    return this.partien > 0 ? this.siege / this.partien : null;
  }

  /** Häufigste Waffe über alle Partien. */
  get lieblingswaffe() {
    return lieblingswaffe(this.waffen);
  }

  /** Häufigste Fraktion über alle Partien. */
  get lieblingsfraktion() {
    if (this.fraktionen.size === 0) return null;
    let beste = null;
    let besterWert = -1;
    for (const [fraktion, anzahl] of [...this.fraktionen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (anzahl > besterWert) { beste = fraktion; besterWert = anzahl; }
    }
    return { fraktion: beste, partien: besterWert };
  }

  /** Als schlichtes Objekt — für die Speicherung. */
  toJSON() {
    return {
      name: this.name,
      fraktion: this.fraktion,
      partien: this.partien,
      siege: this.siege,
      niederlagen: this.niederlagen,
      serie: this.serie,
      serieRekord: this.serieRekord,
      schuesse: this.schuesse,
      treffer: this.treffer,
      schaden: this.schaden,
      absorbierterSchaden: this.absorbierterSchaden,
      zuege: this.zuege,
      spielzeitSekunden: Math.round(this.spielzeitSekunden),
      waffen: Object.fromEntries(this.waffen),
      fraktionen: Object.fromEntries(this.fraktionen),
    };
  }

  static fromJSON(felder) {
    return new PlayerProfile(felder ?? {});
  }
}

/**
 * Menschenlesbare Kennzahlen für die Anzeige.
 *
 * Rechnet die Rohwerte in Text um — Prozent, Minuten, Vorzeichen der Serie. Die
 * Formatierung liegt hier und nicht in der Anzeige, damit alle Anzeigen dieselbe
 * Zahl gleich schreiben.
 */
export function beschreibe(profil) {
  const prozent = wert => (wert === null || wert === undefined ? '—' : `${Math.round(wert * 100)} %`);
  const dauer = sekunden => {
    if (!sekunden || sekunden < 1) return '0 s';
    const minuten = Math.floor(sekunden / 60);
    const rest = Math.round(sekunden % 60);
    return minuten > 0 ? `${minuten} min ${rest} s` : `${rest} s`;
  };
  const waffe = profil.lieblingswaffe;
  const fraktion = profil.lieblingsfraktion;
  return {
    partien: String(profil.partien),
    bilanz: `${profil.siege} S / ${profil.niederlagen} N`,
    siegquote: prozent(profil.siegquote),
    serie: profil.serie === 0 ? '—'
      : (profil.serie > 0 ? `${profil.serie} Siege in Folge` : `${-profil.serie} Niederlagen in Folge`),
    besteSerie: `${profil.serieRekord} Siege`,
    schuesse: String(profil.schuesse),
    trefferquote: prozent(profil.trefferquote),
    schaden: String(profil.schaden),
    schadenProMinute: `${profil.schadenProMinute} / min`,
    spielzeit: dauer(profil.spielzeitSekunden),
    lieblingswaffe: waffe ? `${waffe.waffeId} (${waffe.anzahl}×)` : '—',
    lieblingsfraktion: fraktion ? `${fraktion.fraktion} (${fraktion.partien}×)` : '—',
  };
}

export default { MatchStats, PlayerProfile, lieblingswaffe, beschreibe };
