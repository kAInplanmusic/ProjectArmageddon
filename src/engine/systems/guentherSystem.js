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
  GUENTHER_PEE,
  GUENTHER_POOP,
  GUENTHER_CONTACT,
  GUENTHER_WHEEL,
  GUENTHER_WHEEL_TOTAL,
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

  /**
   * @param {object} options
   * @param {object} options.rng - eigener Teilgenerator (deterministisch)
   * @param {number} options.maxRounds
   * @param {number} options.width - Kartenbreite
   * @param {number} options.height - Kartenhöhe
   */
  constructor({ rng, maxRounds = 30, width, height }) {
    if (!rng || typeof rng.next !== 'function') {
      throw new TypeError('GuentherSystem benötigt einen RNG mit next()');
    }
    this.#rng = rng;
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
    this.#pinkelTimer = this.#rng.nextInt(20, GUENTHER_PEE.intervalTicks[0]);
    this.#kackTimer = this.#rng.nextInt(60, GUENTHER_POOP.intervalTicks[0]);
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
    const ziel = this.#naechsterSpieler(world, kontext.spielerIds ?? [], GUENTHER_MOVEMENT.seekRange);
    if (ziel !== null) {
      const zielX = world.getComponent(ziel, 'Position', 'x') ?? this.#position.x;
      this.#richtung = zielX >= this.#position.x ? 1 : -1;
      this.#pausenTicks = 0;
    }

    if (this.#pausenTicks > 0) {
      this.#pausenTicks -= 1;
    } else {
      // Laufen: Richtung halten, an den Rändern umdrehen.
      const tempo = ziel !== null
        ? GUENTHER_MOVEMENT.speed * GUENTHER_MOVEMENT.seekSpeed
        : GUENTHER_MOVEMENT.speed;
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
      if (ziel === null && this.#rng.nextBoolean(GUENTHER_MOVEMENT.turnChance)) {
        this.#richtung *= -1;
        this.#pausenTicks = this.#rng.nextInt(
          GUENTHER_MOVEMENT.pauseTicks[0], GUENTHER_MOVEMENT.pauseTicks[1],
        );
      }
    }

    // Er läuft AUF der Oberfläche, nicht durch sie hindurch.
    const boden = surfaceYAt(Math.round(this.#position.x));
    if (boden > 0) this.#position.y = boden;

    if (this.#kontaktSperre > 0) this.#kontaktSperre -= 1;

    // --- Anpinkeln ---------------------------------------------------------
    this.#pinkelTimer -= 1;
    if (this.#pinkelTimer <= 0) {
      this.#pinkelTimer = this.#rng.nextInt(
        GUENTHER_PEE.intervalTicks[0], GUENTHER_PEE.intervalTicks[1],
      );
      const opfer = this.#naechsterSpieler(world, kontext.spielerIds ?? [], GUENTHER_PEE.range);
      if (opfer !== null) {
        const vorher = this.#pinkelZaehler.get(opfer) ?? 0;
        const betrag = Math.max(
          GUENTHER_PEE.minDamage,
          GUENTHER_PEE.baseDamage * (GUENTHER_PEE.decay ** vorher),
        );
        this.#pinkelZaehler.set(opfer, vorher + 1);
        this.#pinkelGesamt += 1;
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

    // --- Kackhaufen --------------------------------------------------------
    this.#kackTimer -= 1;
    if (this.#kackTimer <= 0) {
      this.#kackTimer = this.#rng.nextInt(
        GUENTHER_POOP.intervalTicks[0], GUENTHER_POOP.intervalTicks[1],
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
      while (this.#haufen.length > GUENTHER_POOP.maxPiles) this.#haufen.shift();
      melde('guenther_poop', { x: this.#position.x, y: this.#position.y });
    }

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
        if (abstand <= GUENTHER_POOP.triggerRadius) {
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
        const ergebnis = radAufloesen(aktiverSpieler);
        melde('guenther_wheel', { playerId: aktiverSpieler, ...ergebnis });
      }
    }

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
    };
  }
}

export { poisson };
export default GuentherSystem;
