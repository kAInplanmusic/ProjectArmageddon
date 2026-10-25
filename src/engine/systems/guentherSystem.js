/**
 * Günther — frei laufender NPC.
 *
 * Aufgaben:
 *   - Auftritte über das Spiel verteilen (gewürfelt, Mittelwert 2)
 *   - auf der Geländeoberfläche laufen
 *   - Spieler anpinkeln (Schaden, mit jedem Mal geringer)
 *   - Kackhaufen hinterlassen (Schaden über drei Runden und langsamere Bewegung)
 *   - bei Berührung das Glücksrad auslösen
 *
 * Das System entscheidet alles selbst und meldet die Ergebnisse als Ereignisse.
 * Der Client zeigt sie nur an — insbesondere das Rad wird HIER ausgewürfelt, nicht
 * im Browser. Sonst könnte ein Client das Ergebnis bestimmen oder verschiedene
 * Clients zeigten verschiedene Ergebnisse.
 *
 * @module guentherSystem
 */
import {
  GUENTHER_IDENTITY,
  GUENTHER_SPAWN,
  GUENTHER_MOVEMENT,
  guentherBewegung,
  GUENTHER_PEE,
  GUENTHER_POOP,
  GUENTHER_CONTACT,
  GUENTHER_WHEEL,
  GUENTHER_WHEEL_TOTAL,
  GUENTHER_ALT,
  GUENTHER_AKTIONEN,
  GUENTHER_AKTION_REGELN,
  GUENTHER_AKTION_IDS,
  GUENTHER_KACK_POSE_TICKS,
  guentherWerte,
} from '../../shared/config/guenther.js';
import { pickWeaponForRarity } from '../../shared/config/weapons.js';

/** Zieht eine Zahl aus einer Poisson-Verteilung (Knuth). */
function poisson(rng, mittelwert) {
  const grenze = Math.exp(-mittelwert);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > grenze && k < 1000);
  return k - 1;
}

export class GuentherSystem {
  #rng;
  /** Runden, in denen Günther auftritt. */
  #plan = [];
  #aktivBisRunde = -1;
  #position = { x: 0, y: 0 };
  #richtung = 1;
  #pausenTicks = 0;
  #pinkelTimer = 0;
  #kackTimer = 0;
  /** Wie oft welcher Spieler angepinkelt wurde. */
  #pinkelZaehler = new Map();
  /** Liegende Kackhaufen. */
  #haufen = [];
  /** Welcher Spieler von welchem Haufen schon getroffen wurde. */
  #haufenTreffer = new Set();
  /**
   * Fortlaufende Kennung für Kackhaufen.
   *
   * Nötig, weil Haufen aus der Liste entfernt werden und die übrigen dabei
   * aufrücken. Mit dem Listenindex als Schlüssel würde ein bereits abgewehrter
   * Haufen unter neuer Nummer erneut zuschlagen — derselbe Haufen träfe denselben
   * Spieler mehrfach.
   */
  #haufenNummer = 0;
  #kontaktSperre = 0;
  /** Letzte Position je Spieler — daraus wird die Bewegung erkannt. */
  #letztePosition = new Map();
  /** X-Positionen der Spieler beim letzten Schritt (für die Einlaufseite). */
  #spielerMitten = [];
  /** Zähler über das ganze Spiel, für die Anzeige. */
  #auftritte = 0;
  #pinkelGesamt = 0;
  #haufenGesamt = 0;
  #aktionen = 0;
  /** Fassung 2: Aktionen (`config.guenther`). In Fassung 1 bleiben alle folgenden Felder ungenutzt. */
  #fassung = GUENTHER_ALT;
  /** Pinkeln und Häufchen der Fassung (ab 3 seltener und milder). */
  #pee = GUENTHER_PEE;
  #poop = GUENTHER_POOP;
  #aktionRng = null;
  /** Laufende Aktion `{id, gesamt, rest, ziel}` oder null. */
  #aktion = null;
  #aktionTimer = 0;
  #letzteAktion = null;
  /** Kurze Pose neben den Aktionen (kacken, schütteln, hüpfen): `{name, ticks}`. */
  #kurzPose = null;

  /**
   * @param {object} options
   * @param {object} options.rng - eigener Teilgenerator (deterministisch)
   * @param {number} options.maxRounds
   * @param {number} options.width - Kartenbreite
   * @param {number} options.height - Kartenhöhe
   * @param {number} [options.fassung] - `config.guenther` (1 = nur alte Regeln, 2 = Aktionen)
   * @param {object} [options.aktionRng] - Teilgenerator der Aktionen (Pflicht ab Fassung 2)
   */
  constructor({ rng, maxRounds = 30, width, height, fassung = GUENTHER_ALT, aktionRng = null }) {
    if (!rng || typeof rng.next !== 'function') {
      throw new TypeError('GuentherSystem benötigt einen RNG mit next()');
    }
    this.#rng = rng;
    this.#fassung = fassung;
    this.#pee = guentherWerte(fassung).pee;
    this.#poop = guentherWerte(fassung).poop;
    this.#aktionRng = aktionRng;
    if (fassung >= GUENTHER_AKTIONEN && !aktionRng) throw new TypeError('Günther ab Fassung 2 benötigt aktionRng');
    this.maxRounds = maxRounds;
    this.width = width;
    this.height = height;
    this.#plan = this.#planeAuftritte();
  }

  /**
   * Verteilt die Auftritte über das Spiel.
   *
   * Die ANZAHL kommt aus einer Poisson-Verteilung um `meanPerMatch` — dadurch
   * gibt es Spiele ohne Günther und solche mit mehreren Auftritten. Die RUNDEN
   * werden anschließend zufällig gezogen und sortiert, damit die Auftritte
   * unregelmäßig liegen und nicht im gleichmäßigen Takt.
   */
  #planeAuftritte() {
    const anzahl = Math.min(
      GUENTHER_SPAWN.maxPerMatch,
      poisson(this.#rng, GUENTHER_SPAWN.meanPerMatch),
    );
    if (anzahl <= 0) return [];

    const moeglich = Math.max(1, this.maxRounds - GUENTHER_SPAWN.roundsPerVisit);
    const runden = new Set();
    // Begrenzte Versuche: bei wenigen Runden kann dieselbe Runde mehrfach fallen.
    for (let versuch = 0; versuch < anzahl * 12 && runden.size < anzahl; versuch += 1) {
      runden.add(1 + this.#rng.nextIntBelow(moeglich));
    }
    return [...runden].sort((a, b) => a - b);
  }

  /** Auftritte, die in dieser Runde beginnen. */
  auftritteInRunde(runde) {
    return this.#plan.filter(r => r === runde).length;
  }

  get plan() { return [...this.#plan]; }
  get aktiv() { return this.#aktivBisRunde >= this.#runde; }
  get position() { return { ...this.#position }; }

  /**
   * Setzt Günther an eine Stelle — nur für Messungen und Tests (LOOK-4).
   *
   * Ohne diesen Zugriff lässt sich nicht prüfen, ob er auf einem Innenboden
   * stehen bleibt: Seine Position entsteht sonst allein aus seiner eigenen
   * Bewegung, ein Test könnte ihn nie in einen Hohlraum stellen.
   */
  setzePosition(x, y) {
    this.#position = { x, y };
  }
  get haufen() { return this.#haufen.map(h => ({ x: h.x, y: h.y })); }
  #runde = 0;

  /**
   * Setzt die aktuelle Runde; startet und beendet Auftritte.
   *
   * Wird bei JEDEM Simulationsschritt aufgerufen. Der frühe Ausstieg bei
   * unveränderter Runde ist deshalb keine Optimierung, sondern notwendig:
   * `#betrete` setzt die Pinkel- und Kack-Timer zurück. Ohne die Sperre würde es
   * in der Auftrittsrunde jeden Tick erneut laufen, die Timer kämen nie zum
   * Ablaufen — Günther erschiene und bliebe die ganze Runde regungslos stehen.
   */
  setRunde(runde) {
    if (runde === this.#runde) return;
    this.#runde = runde;
    for (const start of this.#plan) {
      if (start === runde) {
        this.#betrete(runde);
        break;
      }
    }
    // Auftritt beenden.
    if (this.#aktivBisRunde >= 0 && runde > this.#aktivBisRunde) {
      this.#aktivBisRunde = -1;
    }
  }

  /** Günther betritt die Karte an einem zufälligen Rand. */
  #betrete(runde) {
    this.#aktivBisRunde = runde + GUENTHER_SPAWN.roundsPerVisit - 1;
    this.#auftritte += 1;
    // Von der Seite hereinlaufen, auf der die Spieler stehen. Vom gegenüber-
    // liegenden Rand bräuchte er den ganzen Auftritt, nur um anzukommen.
    const spielerX = this.#spielerMitten ?? [];
    const mitte = spielerX.length > 0
      ? spielerX.reduce((a, b) => a + b, 0) / spielerX.length
      : this.width / 2;
    const vonLinks = mitte < this.width / 2;
    this.#richtung = vonLinks ? 1 : -1;
    this.#position = {
      x: vonLinks ? GUENTHER_SPAWN.edgeMargin : this.width - GUENTHER_SPAWN.edgeMargin,
      y: 0,
    };
    this.#pausenTicks = 0;
    this.#pinkelTimer = this.#rng.nextInt(20, this.#pee.intervalTicks[0]);
    this.#kackTimer = this.#rng.nextInt(60, this.#poop.intervalTicks[0]);
    if (this.#fassung >= GUENTHER_AKTIONEN) {
      this.#aktion = null;
      this.#kurzPose = null;
      this.#aktionTimer = this.#aktionRng.nextInt(60, 120);
    }
  }

  /**
   * Ein Simulationsschritt.
   *
   * @param {object} world
   * @param {object} kontext
   * @param {number} kontext.aktiverSpieler - Spieler, der gerade am Zug ist
   * @param {number} kontext.surfaceYAt - Funktion(x) -> y der Geländeoberfläche
   * @param {(spielerId:number, schaden:number)=>void} kontext.schaden - fügt Schaden zu
   * @param {(spielerId:number, haufen:{x:number,y:number})=>void} kontext.haufenGetroffen
   * @param {(spielerId:number)=>object} kontext.radAufloesen - löst das Glücksrad aus
   * @param {(typ:string, daten:object)=>void} kontext.melde - Ereignis melden
   */
  update(world, kontext) {
    if (!this.aktiv) return;

    const { aktiverSpieler, surfaceYAt, schaden, haufenGetroffen, radAufloesen, melde } = kontext;

    // Spielerpositionen merken: Sie bestimmen, von welcher Seite er einläuft.
    this.#spielerMitten = (kontext.spielerIds ?? [])
      .filter(id => world.isActive(id))
      .map(id => world.getComponent(id, 'Position', 'x') ?? this.width / 2);

    // Ein Ziel in der Nähe hat Vorrang: Er läuft darauf zu. Ein Hund, dem man
    // ausweicht, pinkelt nicht — die Mechanik braucht diese Annäherung.
    /*
     * Die Suchreichweite hängt an der KARTENBREITE (siehe `guentherBewegung`).
     *
     * FUND (belegt): Mit dem festen Wert 320 px fand Günther auf einer 5120er
     * Karte praktisch nie einen Spieler — gemessen kam in acht Partien keine
     * einzige Begegnung zustande.
     */
    const bewegung = guentherBewegung(this.width);
    const ziel = this.#naechsterSpieler(world, kontext.spielerIds ?? [], bewegung.seekRange);
    // Beim wilden Bellen (Fassung 2) läuft er kopflos, nicht gezielt auf jemanden zu.
    if (ziel !== null && !(this.#fassung >= GUENTHER_AKTIONEN && this.#aktion?.id === 'chaos')) {
      const zielX = world.getComponent(ziel, 'Position', 'x') ?? this.#position.x;
      this.#richtung = zielX >= this.#position.x ? 1 : -1;
      this.#pausenTicks = 0;
    }

    if (this.#pausenTicks > 0) {
      this.#pausenTicks -= 1;
    } else if (this.#fassung >= GUENTHER_AKTIONEN && this.#steht()) {
      // Fassung 2: Während einer Aktion (außer wildem Bellen) bleibt er stehen.
    } else {
      // Laufen: Richtung halten, an den Rändern umdrehen.
      let tempo = ziel !== null
        ? bewegung.speed * GUENTHER_MOVEMENT.seekSpeed
        : bewegung.speed;
      if (this.#fassung >= GUENTHER_AKTIONEN && this.#aktion?.id === 'chaos') tempo *= GUENTHER_AKTION_REGELN.chaos.tempo;
      this.#position.x += this.#richtung * tempo;
      if (this.#position.x < GUENTHER_SPAWN.edgeMargin) {
        this.#position.x = GUENTHER_SPAWN.edgeMargin;
        this.#richtung = 1;
      } else if (this.#position.x > this.width - GUENTHER_SPAWN.edgeMargin) {
        this.#position.x = this.width - GUENTHER_SPAWN.edgeMargin;
        this.#richtung = -1;
      }
      // Gelegentlich stehen bleiben und die Richtung wechseln — aber nicht,
      // während er ein Ziel verfolgt.
      /*
       * Die Umkehrwahrscheinlichkeit leitet sich aus der KARTENBREITE ab.
       *
       * FUND (belegt): Mit der festen Rate 0,004 je Tick drehte Günther alle
       * 250 Ticks um — rund 450 px, unabhängig von der Karte. Auf einer 5120er
       * Karte sind das 9 % der Breite: Er pendelt am Rand, statt zu wandern.
       *
       * Jetzt gilt: dieselbe STRECKE je Umkehrung wie auf der Referenzkarte,
       * umgerechnet auf das Tempo dieser Karte.
       */
      const umkehrStrecke = GUENTHER_MOVEMENT.turnStreckeAnteil * this.width;
      const umkehrChance = umkehrStrecke > 0
        ? Math.min(1, bewegung.speed / umkehrStrecke)
        : 0;
      if (ziel === null && this.#rng.nextBoolean(umkehrChance)) {
        this.#richtung *= -1;
        this.#pausenTicks = this.#rng.nextInt(
          GUENTHER_MOVEMENT.pauseTicks[0], GUENTHER_MOVEMENT.pauseTicks[1],
        );
      }
    }

    /*
     * Er läuft AUF dem Boden, nicht durch ihn hindurch. Seit LOOK-4 Stufe 1
     * (2026-10-25) ist das der Boden NAHE seiner Hoehe — in einem Hohlraum
     * bleibt er damit beim Spieler, statt nach oben auf die Oberfläche gesetzt
     * zu werden. Ohne durchgereichte Abfrage bleibt es bei der Oberfläche.
     */
    const spalte = Math.round(this.#position.x);
    const boden = kontext.bodenNahe ? kontext.bodenNahe(spalte, this.#position.y) : surfaceYAt(spalte);
    if (boden > 0) this.#position.y = boden;

    if (this.#kontaktSperre > 0) this.#kontaktSperre -= 1;

    this.#pinkeln(world, kontext, schaden, melde);

    this.#kacken(melde);

    this.#haufenPruefen(world, kontext, haufenGetroffen, melde);

    this.#beruehrung(world, aktiverSpieler, radAufloesen, melde);

    if (this.#fassung >= GUENTHER_AKTIONEN) this.#aktionSchritt(world, kontext);

    this.#positionenMerken(world, kontext);
  }

  /**
   * Anpinkeln ---------------------------------------------------------.
   *
   * Aus `update()` herausgezogen (AU-9a/C-8). Der Rumpf ist zeichengleich
   * uebernommen, und die Ziehungen von `this.#rng` stehen in derselben
   * Reihenfolge wie vorher — der Zustands-Hash bleibt damit gleich.
   */
  #pinkeln(world, kontext, schaden, melde) {
    // --- Anpinkeln ---------------------------------------------------------
    if (!this.#ruhig()) this.#pinkelTimer -= 1;
    if (this.#pinkelTimer <= 0) {
      this.#pinkelTimer = this.#rng.nextInt(
        this.#pee.intervalTicks[0], this.#pee.intervalTicks[1],
      );
      const opfer = this.#naechsterSpieler(world, kontext.spielerIds ?? [], this.#pee.range);
      if (opfer !== null) {
        const vorher = this.#pinkelZaehler.get(opfer) ?? 0;
        const betrag = Math.max(
          this.#pee.minDamage,
          this.#pee.baseDamage * (this.#pee.decay ** vorher),
        );
        this.#pinkelZaehler.set(opfer, vorher + 1);
        this.#pinkelGesamt += 1;
        if (this.#fassung >= GUENTHER_AKTIONEN) this.#kurzPose = { name: 'schuetteln', ticks: 30 };
        schaden(opfer, betrag);
        melde('guenther_pee', {
          playerId: opfer,
          amount: Number(betrag.toFixed(1)),
          count: vorher + 1,
          x: this.#position.x,
          y: this.#position.y,
        });
      }
    }
  }

  /**
   * Kackhaufen --------------------------------------------------------.
   *
   * Aus `update()` herausgezogen (AU-9a/C-8). Der Rumpf ist zeichengleich
   * uebernommen, und die Ziehungen von `this.#rng` stehen in derselben
   * Reihenfolge wie vorher — der Zustands-Hash bleibt damit gleich.
   */
  #kacken(melde) {
    // --- Kackhaufen --------------------------------------------------------
    if (!this.#ruhig()) this.#kackTimer -= 1;
    if (this.#kackTimer <= 0) {
      this.#kackTimer = this.#rng.nextInt(
        this.#poop.intervalTicks[0], this.#poop.intervalTicks[1],
      );
      this.#haufenNummer += 1;
      this.#haufen.push({
        id: this.#haufenNummer,
        x: this.#position.x,
        y: this.#position.y,
        seitRunde: this.#runde,
      });
      this.#haufenGesamt += 1;
      // Älteste Haufen entfernen, damit sich das Feld nicht zupflastert.
      while (this.#haufen.length > this.#poop.maxPiles) this.#haufen.shift();
      if (this.#fassung >= GUENTHER_AKTIONEN) this.#kurzPose = { name: 'kacken', ticks: GUENTHER_KACK_POSE_TICKS };
      melde('guenther_poop', { x: this.#position.x, y: this.#position.y });
    }
  }

  /**
   * Haufen prüfen -----------------------------------------------------.
   *
   * Aus `update()` herausgezogen (AU-9a/C-8). Der Rumpf ist zeichengleich
   * uebernommen, und die Ziehungen von `this.#rng` stehen in derselben
   * Reihenfolge wie vorher — der Zustands-Hash bleibt damit gleich.
   */
  #haufenPruefen(world, kontext, haufenGetroffen, melde) {
    // --- Haufen prüfen -----------------------------------------------------
    for (const haufen of this.#haufen) {
      for (const spielerId of kontext.spielerIds ?? []) {
        if (!world.isActive(spielerId)) continue;
        // Jeder Haufen trifft denselben Spieler nur einmal — über die FESTE
        // Kennung des Haufens, nicht über seinen Listenplatz.
        const schluessel = `${haufen.id}:${spielerId}`;
        if (this.#haufenTreffer.has(schluessel)) continue;
        const x = world.getComponent(spielerId, 'Position', 'x') ?? 0;
        const y = world.getComponent(spielerId, 'Position', 'y') ?? 0;
        const abstand = Math.hypot(x - haufen.x, y - haufen.y);
        if (abstand <= this.#poop.triggerRadius) {
          this.#haufenTreffer.add(schluessel);
          haufenGetroffen(spielerId, { x: haufen.x, y: haufen.y });
          melde('guenther_poop_hit', {
            // Die Haufen-Kennung gehört ins Ereignis: Damit lässt sich prüfen,
            // dass kein Haufen mehrfach zuschlägt.
            pileId: haufen.id,
            playerId: spielerId, x: haufen.x, y: haufen.y,
          });
        }
      }
    }
  }

  /**
   * Berührung ---------------------------------------------------------.
   *
   * Aus `update()` herausgezogen (AU-9a/C-8). Der Rumpf ist zeichengleich
   * uebernommen, und die Ziehungen von `this.#rng` stehen in derselben
   * Reihenfolge wie vorher — der Zustands-Hash bleibt damit gleich.
   */
  #beruehrung(world, aktiverSpieler, radAufloesen, melde) {
    // --- Berührung ---------------------------------------------------------
    if (this.#kontaktSperre === 0 && aktiverSpieler !== null && world.isActive(aktiverSpieler)) {
      const x = world.getComponent(aktiverSpieler, 'Position', 'x') ?? 0;
      const y = world.getComponent(aktiverSpieler, 'Position', 'y') ?? 0;
      const vorher = this.#letztePosition.get(aktiverSpieler);
      const bewegung = vorher ? Math.hypot(x - vorher.x, y - vorher.y) : 0;
      const abstand = Math.hypot(x - this.#position.x, y - this.#position.y);
      // Beides muss zutreffen: nah dran UND selbst in Bewegung.
      if (abstand <= GUENTHER_CONTACT.radius && bewegung >= GUENTHER_CONTACT.minPlayerMove) {
        this.#kontaktSperre = GUENTHER_CONTACT.cooldownTicks;
        this.#pausenTicks = this.#rng.nextInt(60, 150);
        if (this.#fassung >= GUENTHER_AKTIONEN) this.#kurzPose = { name: 'huepfen', ticks: 50 };
        const ergebnis = radAufloesen(aktiverSpieler);
        melde('guenther_wheel', { playerId: aktiverSpieler, ...ergebnis });
      }
    }
  }

  /**
   * Positionen GANZ AM ENDE fortschreiben.
   *
   * Aus `update()` herausgezogen (AU-9a/C-8). Der Rumpf ist zeichengleich
   * uebernommen, und die Ziehungen von `this.#rng` stehen in derselben
   * Reihenfolge wie vorher — der Zustands-Hash bleibt damit gleich.
   */
  #positionenMerken(world, kontext) {
    // Positionen GANZ AM ENDE fortschreiben.
    //
    // Die Reihenfolge ist entscheidend: Würde sie vor der Berührungsprüfung
    // stehen, wäre die gemessene Bewegung immer null — der Spieler bewegte sich
    // zwar, aber der Vergleichswert wäre bereits der neue. Die Berührung hätte
    // dann nie ausgelöst.
    for (const spielerId of kontext.spielerIds ?? []) {
      if (!world.isActive(spielerId)) continue;
      this.#letztePosition.set(spielerId, {
        x: world.getComponent(spielerId, 'Position', 'x') ?? 0,
        y: world.getComponent(spielerId, 'Position', 'y') ?? 0,
      });
    }
  }

  // ------------------------------------------------------------------
  // Fassung 2: Aktionen
  // ------------------------------------------------------------------

  /** Steht er still? Jede Aktion außer wildem Bellen hält ihn an. */
  #steht() {
    return this.#aktion !== null && this.#aktion.id !== 'chaos';
  }

  /** Sitz und Platz beruhigen ihn: Pinkel- und Kack-Uhr stehen. */
  #ruhig() {
    return this.#fassung >= GUENTHER_AKTIONEN && this.#aktion !== null
      && GUENTHER_AKTION_REGELN[this.#aktion.id].ruhig === true;
  }

  /**
   * Startet eine Aktion sofort (Tests und Werkzeuge; Fassung 2).
   *
   * @param {string} id - Schlüssel in `GUENTHER_AKTION_REGELN`
   * @param {number|null} [ziel] - Entity-ID des Ziels (Spieler oder Kiste)
   */
  erzwingeAktion(id, ziel = null) {
    const regel = GUENTHER_AKTION_REGELN[id];
    if (this.#fassung < GUENTHER_AKTIONEN || !regel || !GUENTHER_AKTION_IDS.includes(id)) {
      throw new Error(`Aktion nicht verfügbar: ${id}`);
    }
    this.#aktion = { id, gesamt: regel.ticks, rest: regel.ticks, ziel };
    this.#letzteAktion = id;
  }

  /** Aktuelle Pose (Sprite-Name aus `GUENTHER_POSEN`). */
  get pose() {
    if (this.#aktion) {
      const regel = GUENTHER_AKTION_REGELN[this.#aktion.id];
      // Beim Platz döst er in der zweiten Hälfte ein.
      if (this.#aktion.id === 'platz' && this.#aktion.rest < this.#aktion.gesamt / 2) return 'schlafen';
      return regel.pose;
    }
    if (this.#kurzPose) return this.#kurzPose.name;
    return this.#pausenTicks > 0 ? 'stehen' : 'laufen';
  }

  /** Ein Schritt der Aktionsmaschine (nur Fassung 2). */
  #aktionSchritt(world, kontext) {
    if (this.#kurzPose && --this.#kurzPose.ticks <= 0) this.#kurzPose = null;
    const a = this.#aktion;
    if (a) {
      const regel = GUENTHER_AKTION_REGELN[a.id];
      const vergangen = a.gesamt - a.rest;
      if (a.id === 'chaos') {
        if (vergangen % regel.takt === 0) this.#chaos(world, kontext, regel);
      } else if (vergangen === regel.wirkung) {
        this.#wirke(world, kontext, a);
      }
      a.rest -= 1;
      if (a.rest <= 0) {
        this.#aktion = null;
        this.#aktionTimer = this.#aktionRng.nextInt(
          GUENTHER_AKTION_REGELN.intervalTicks[0], GUENTHER_AKTION_REGELN.intervalTicks[1],
        );
      }
      return;
    }
    this.#aktionTimer -= 1;
    if (this.#aktionTimer <= 0) this.#waehleAktion(world, kontext);
  }

  /** Wählt eine Aktion, deren Bedingung erfüllt ist (gewichtet, mit eigenem Generator). */
  #waehleAktion(world, kontext) {
    const spielerIds = kontext.spielerIds ?? [];
    const kisten = kontext.kisten?.() ?? [];
    const moegliche = [];
    for (const id of GUENTHER_AKTION_IDS) {
      const regel = GUENTHER_AKTION_REGELN[id];
      let ziel = null;
      if (regel.braucht === 'kiste') {
        let best = Infinity;
        for (const k of kisten) {
          const d = Math.hypot(k.x - this.#position.x, k.y - this.#position.y);
          if (d <= regel.reichweite && d < best) { best = d; ziel = k.id; }
        }
        if (ziel === null) continue;
      } else if (regel.braucht === 'spieler') {
        ziel = this.#naechsterSpieler(world, spielerIds, regel.reichweite);
        if (ziel === null) continue;
      }
      moegliche.push({ id, regel, ziel });
    }
    // Dieselbe Aktion nie zweimal hintereinander (wenn es eine Wahl gibt).
    const auswahl = moegliche.length > 1 ? moegliche.filter(m => m.id !== this.#letzteAktion) : moegliche;
    if (auswahl.length === 0) {
      this.#aktionTimer = GUENTHER_AKTION_REGELN.intervalTicks[0];
      return;
    }
    const summe = auswahl.reduce((acc, m) => acc + m.regel.gewicht, 0);
    let wurf = this.#aktionRng.next() * summe;
    let gewaehlt = auswahl[auswahl.length - 1];
    for (const m of auswahl) {
      wurf -= m.regel.gewicht;
      if (wurf < 0) { gewaehlt = m; break; }
    }
    this.#letzteAktion = gewaehlt.id;
    this.#aktion = { id: gewaehlt.id, gesamt: gewaehlt.regel.ticks, rest: gewaehlt.regel.ticks, ziel: gewaehlt.ziel };
    if (gewaehlt.ziel !== null && gewaehlt.regel.braucht === 'spieler') {
      const zx = world.getComponent(gewaehlt.ziel, 'Position', 'x') ?? this.#position.x;
      this.#richtung = zx >= this.#position.x ? 1 : -1;
    }
    this.#aktionen += 1;
    kontext.melde('guenther_aktion', {
      aktion: gewaehlt.id, pose: gewaehlt.regel.pose, x: this.#position.x, y: this.#position.y,
      playerId: gewaehlt.regel.braucht === 'spieler' ? gewaehlt.ziel : null,
    });
  }

  /** Die Wirkung einer Aktion zum Wirk-Tick. */
  #wirke(world, kontext, a) {
    const regel = GUENTHER_AKTION_REGELN[a.id];
    const { x, y } = this.#position;
    const live = id => id !== null && world.isActive(id);
    let spielerId = null;
    let betrag = 0;
    let fund = false;
    switch (a.id) {
      case 'essen': {
        // Die Kiste wird gefressen; der nächste Spieler in Reichweite wird davon satt und gesund.
        const noch = (kontext.kisten?.() ?? []).some(k => k.id === a.ziel);
        if (!noch) return;
        kontext.kisteVerzehren?.(a.ziel);
        spielerId = this.#naechsterSpieler(world, kontext.spielerIds ?? [], regel.heilReichweite);
        if (spielerId !== null) { kontext.heile?.(spielerId, regel.heilung); betrag = regel.heilung; }
        break;
      }
      case 'ziehen': {
        if (!live(a.ziel)) return;
        spielerId = a.ziel;
        const px = world.getComponent(spielerId, 'Position', 'x') ?? x;
        kontext.stosse?.(spielerId, (px >= x ? -1 : 1) * regel.zugX, regel.zugY);
        break;
      }
      case 'wuehlen': {
        kontext.krater?.(x, y + 2, regel.kraterRadius, regel.kraterTiefe);
        // Pro Wühlen genau EIN Wurf — auch wenn nichts gefunden wird.
        if (this.#aktionRng.nextBoolean(regel.fundChance)) {
          const boden = kontext.surfaceYAt?.(Math.round(x)) ?? y;
          kontext.legeKiste?.(this.#aktionRng, x, (boden > 0 ? boden : y) - 14);
          fund = true;
        }
        break;
      }
      case 'kuscheln':
      case 'kraulen':
        if (!live(a.ziel)) return;
        spielerId = a.ziel;
        kontext.heile?.(spielerId, regel.heilung);
        betrag = regel.heilung;
        break;
      default:
        break;
    }
    kontext.melde('guenther_aktion_wirkung', { aktion: a.id, playerId: spielerId, amount: betrag, fund, x, y });
  }

  /** Wildes Bellen: Spieler in der Nähe werden aufgescheucht, Günther wechselt wirr die Richtung. */
  #chaos(world, kontext, regel) {
    if (this.#aktionRng.nextBoolean(0.5)) this.#richtung *= -1;
    for (const id of kontext.spielerIds ?? []) {
      if (!world.isActive(id)) continue;
      const px = world.getComponent(id, 'Position', 'x') ?? 0;
      const py = world.getComponent(id, 'Position', 'y') ?? 0;
      const vx = (this.#aktionRng.next() * 2 - 1) * regel.stossX;
      if (Math.hypot(px - this.#position.x, py - this.#position.y) > regel.radius) continue;
      kontext.stosse?.(id, vx, regel.stossY);
    }
    kontext.melde('guenther_aktion_wirkung', { aktion: 'chaos', playerId: null, amount: 0, fund: false, x: this.#position.x, y: this.#position.y });
  }

  /**
   * Nächster Spieler innerhalb einer Reichweite.
   *
   * Die Spielerliste kommt von außen: Das System kennt die Teams nicht und soll
   * sie auch nicht kennen. `world.activeEntities` gibt es nicht — ein Zugriff
   * darauf lief ins Leere.
   */
  #naechsterSpieler(world, spielerIds, reichweite) {
    let bester = null;
    let besterAbstand = Infinity;
    for (const entityId of spielerIds) {
      // Die Liste kommt vom Match und enthält nur lebende Spieler. Eine eigene
      // Prüfung über die Lebenskomponente war zu streng: Sie schloss Figuren aus,
      // deren Leben gerade abgefragt wird, und ließ das Anpinkeln ausfallen.
      if (!world.isActive(entityId)) continue;
      const x = world.getComponent(entityId, 'Position', 'x') ?? 0;
      const y = world.getComponent(entityId, 'Position', 'y') ?? 0;
      const abstand = Math.hypot(x - this.#position.x, y - this.#position.y);
      if (abstand <= reichweite && abstand < besterAbstand) {
        besterAbstand = abstand;
        bester = entityId;
      }
    }
    return bester;
  }

  /**
   * Würfelt einen Ausgang des Glücksrads.
   *
   * Die Gewichte sind so verteilt, dass Heimdall bei genau `HEIMDALL_MAX_PERCENT`
   * liegt. Ausgewürfelt wird mit dem EIGENEN Teilgenerator: Das Ergebnis steht
   * damit fest, bevor der Client die Animation zeigt — der Client dreht nur noch
   * auf das feststehende Feld.
   */
  wuerfleAusgang() {
    const wurf = this.#rng.next() * GUENTHER_WHEEL_TOTAL;
    let summe = 0;
    for (const ausgang of GUENTHER_WHEEL) {
      summe += ausgang.weight;
      if (wurf < summe) return ausgang;
    }
    return GUENTHER_WHEEL[0];
  }

  /** Wählt eine Waffe für einen Radausgang. */
  waehleWaffe(gewichte) {
    return pickWeaponForRarity(this.#rng, gewichte);
  }

  /** Zieht einen Wert aus einem Bereich. */
  zieheBereich([min, max]) {
    return this.#rng.nextFloat(min, max);
  }

  /** Serialisierbare Momentaufnahme (Replay und Anzeige). */
  snapshot() {
    const aktionen = this.#fassung >= GUENTHER_AKTIONEN
      ? { fassung: this.#fassung, pose: this.pose, aktion: this.#aktion?.id ?? null, aktionen: this.#aktionen }
      : {};
    return {
      aktiv: this.aktiv,
      x: Number(this.#position.x.toFixed(1)),
      y: Number(this.#position.y.toFixed(1)),
      richtung: this.#richtung,
      runde: this.#runde,
      haufen: this.haufen.map(h => ({ x: Number(h.x.toFixed(1)), y: Number(h.y.toFixed(1)) })),
      auftritte: this.#auftritte,
      pinkelGesamt: this.#pinkelGesamt,
      haufenGesamt: this.#haufenGesamt,
      plan: this.plan,
      identity: GUENTHER_IDENTITY,
      ...aktionen,
    };
  }
}

export { poisson };
export default GuentherSystem;
