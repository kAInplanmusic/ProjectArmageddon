/**
 * Wirkungen der Ereignisse — EINE Zuordnungstabelle für beide Betriebsarten.
 *
 * ## Warum diese Datei existiert
 *
 * In `main.js` standen ZWEI Schalter über dieselben Ereignisarten: einer für
 * das lokale Match (`#handleEvents`), einer für den Online-Betrieb
 * (`#handleRemoteEvent`). Sie umfassten 229 bzw. 142 Zeilen — und sie sind
 * bereits einmal auseinandergelaufen: `projectile_impact` war nur im
 * Online-Zweig behandelt, im lokalen Match blieb der Einschlag ohne Blitz
 * (FUND, belegt; `tests/event-coverage.test.js` hält ihn fest).
 *
 * Hier steht deshalb EINE Tabelle: Ereignisart → Wirkung. Beide Einstiege
 * (`verarbeiteLokal`, `verarbeiteOnline`) lesen daraus. Ob eine Wirkung in
 * beiden Betriebsarten gilt, ist am Eintrag ABLESBAR und nicht daran zu
 * erraten, dass zwei Blöcke zufällig gleich aussehen:
 *
 *   `beide(fn)` — dieselbe Wirkung in beiden Betriebsarten
 *   `lokal:`    — nur im lokalen Match
 *   `online:`   — nur im Online-Betrieb
 *
 * Eine fehlende Angabe heißt „in dieser Betriebsart gibt es nichts zu tun" —
 * das ist eine Entscheidung, keine Lücke.
 *
 * ## Ohne Selbstbezug
 *
 * Das Modul hat keinen Besitzer und kennt die Klasse nicht, aus der es gerufen
 * wird: `main.js` übergibt ein `kontext`-Objekt (`Main#ereignisKontext`).
 * Dadurch ist jede Kopplung an die Klasse eine sichtbare Zeile in `main.js`
 * statt eines Zugriffs quer durch die Klasse — und dieses Modul ist ohne
 * Browser ladbar.
 *
 * @module client/ereignisse
 */
import { getWeapon } from '../shared/config/weapons.js';

/**
 * Eine Wirkung: bekommt den Kontext und die Nutzlast, gibt nichts zurück.
 * @callback Wirkung
 * @param {object} kontext Zugänge zu Renderer, HUD, Match und Zustand
 * @param {object} nutzlast Der Rumpf der Ereignis-/Servermeldung
 * @returns {void}
 */

/**
 * Ein Eintrag der Tabelle.
 * @typedef {object} WirkungsEintrag
 * @property {Wirkung} [lokal] Wirkung im lokalen Match
 * @property {Wirkung} [online] Wirkung im Online-Betrieb
 */

/**
 * Dieselbe Wirkung in beiden Betriebsarten.
 *
 * Der Helfer macht aus „das gilt überall" einen Aufruf statt einer zweiten
 * Kopie des Rumpfs — eine Wirkung, die nur scheinbar geteilt ist, kann nicht
 * mehr auseinanderlaufen.
 * @param {Wirkung} fn Die gemeinsame Wirkung
 * @returns {WirkungsEintrag} Eintrag mit `lokal` UND `online`
 */
function beide(fn) {
  return { lokal: fn, online: fn };
}

/* ======================================================================
 * Der Kontext — unvollständig geliefert heißt: nichts werfen
 * ======================================================================
 *
 * FUND (belegt, 2026-09-27): Ein Aufruf mit unvollständigem Kontext riss den
 * GESAMTEN Ereignis-Durchlauf ab —
 *
 *   TypeError: Cannot read properties of undefined (reading 'status')
 *     at Object.lokal (src/client/ereignisse.js:615:25)
 *
 * `k.fernzustand` war dort nicht gesetzt, und der Wurf brach die Schleife über
 * alle Ereignisse ab: EIN fehlendes Feld nahm ALLE folgenden Meldungen mit,
 * nicht nur die eigene. Im echten Client ist das Feld gesetzt
 * (`main.js#ereignisKontext`) — es war kein Live-Fehler, sondern ein Aufrufer,
 * der einen Teil des Vertrags wegließ. Ein solcher Aufruf darf trotzdem nicht
 * mehr kosten als seine eigene Wirkung.
 *
 * ## Was hier entschieden wird
 *
 *  - JEDE Kontextlesung ist gegen ein fehlendes Feld unempfindlich
 *    (`k.hud?.log(...)`, `k.fernzustand?.status()` …). Vorbild im Haus ist
 *    `k.sound?.verarbeite(...)`; `sound` DARF fehlen (kein Ausgabegerät), und
 *    dieselbe Schreibweise trägt jetzt jedes Feld. Fehlt ein Feld, entfällt
 *    genau seine Wirkung — nichts wirft.
 *  - EIN GANZ fehlender Kontext wird an den Einstiegen abgefangen, statt `k?.`
 *    an jede Lesung zu schreiben: `k` selbst ist kein Feld der Tabelle.
 *  - Fehlende Pflichtfelder werden EINMAL laut gemeldet (siehe
 *    `kontextBrauchbar`) statt bei jedem Ereignis zu werfen. Im Normalbetrieb
 *    kostet die Prüfung EINEN Wahrheitswert je Ereignis und erzeugt keine
 *    einzige Meldung.
 *
 * ## Pflichtfelder je Betriebsart — und warum `match`/`sound` fehlen
 *
 * `sound` darf fehlen (siehe oben). `match` ist ONLINE planmäßig `null`
 * (`main.js` erzeugt im Online-Betrieb kein lokales Match) — stünde es in der
 * Online-Liste, meldete jeder Online-Lauf einen Mangel, den es nicht gibt.
 * Deshalb zwei Listen statt einer.
 */
const KONTEXT_PFLICHTFELDER = Object.freeze({
  lokal: Object.freeze([
    'renderer', 'hud', 'nameOf', 'match', 'shotPredictor',
    'findEntity', 'drawHitscanBeam', 'logSpecialEffect', 'showGuentherWheel',
    'fernzustand', 'showEndScreen',
  ]),
  online: Object.freeze([
    'renderer', 'hud', 'nameOf', 'shotPredictor',
    'findEntity', 'drawHitscanBeam', 'logSpecialEffect', 'showGuentherWheel',
    'fernzustand', 'showEndScreen',
  ]),
});

/**
 * Merker der schon gemeldeten Lücken und der zuletzt geprüften Kontexte.
 *
 * Gemeldet wird je LÜCKE einmal (nicht je Ereignis): Ein Durchlauf über hundert
 * Ereignisse erzeugt so höchstens EINE Zeile. Die Identität des zuletzt
 * geprüften Kontexts spart die Prüfung ganz — `main.js` baut den Kontext EINMAL
 * je Ereignisfolge (`#handleEvents`), nicht je Ereignis.
 */
const gemeldeteLuecken = new Set();
const zuletztGeprueft = { lokal: null, online: null };

/**
 * Ist der Kontext benutzbar?
 *
 * Meldet eine Lücke EINMAL (`console.warn`) und läuft danach ohne weitere
 * Prüfung: Der Normalfall soll nichts kosten und nichts sagen. Gemeldet wird nur,
 * WAS fehlt — die betroffenen Wirkungen entfallen still, weil die Alternative
 * (werfen) genau der Fehler wäre, der hier behoben wird.
 *
 * @param {'lokal'|'online'} einstieg Die Betriebsart (eigene Pflichtfelder)
 * @param {object} kontext Der übergebene Kontext
 * @returns {boolean} `false` NUR, wenn gar kein Kontext übergeben wurde
 */
function kontextBrauchbar(einstieg, kontext) {
  if (typeof kontext !== 'object' || kontext === null) {
    meldeLuecke(`${einstieg}:kein-kontext`,
      `[ereignisse] ${einstieg}: kein Kontext übergeben — ohne ihn tut keine Wirkung `
      + 'etwas. Aufrufer: `Main#ereignisKontext()` (src/client/main.js).');
    return false;
  }
  // Normalfall: derselbe Kontext wie eben — EIN Vergleich, keine Feldprüfung.
  if (zuletztGeprueft[einstieg] === kontext) return true;
  zuletztGeprueft[einstieg] = kontext;

  const fehlend = (KONTEXT_PFLICHTFELDER[einstieg] ?? []).filter(feld => kontext[feld] == null);
  if (fehlend.length > 0) {
    meldeLuecke(`${einstieg}:${fehlend.join(',')}`,
      `[ereignisse] ${einstieg}: Kontextfeld(er) fehlen: ${fehlend.join(', ')} — die Wirkungen, `
      + 'die sie lesen, entfallen still. Aufrufer: `Main#ereignisKontext()` (src/client/main.js).');
  }
  return true;
}

/** Meldet eine Lücke genau EINMAL — der Schlüssel ist die Lücke selbst. */
function meldeLuecke(schluessel, text) {
  if (gemeldeteLuecken.has(schluessel)) return;
  gemeldeteLuecken.add(schluessel);
  console.warn(text);
}

/** „Schild fängt … Schaden ab" — der Text ist in beiden Betriebsarten derselbe. */
const schildMeldung = (k, n) => k.hud?.log(`Schild fängt ${Math.round(n.absorbed)} Schaden ab`, 'good');

/** Der Mahlstrom zieht sich zusammen — Kontraktion und Meldung. */
const mahlstromZiehtSich = (k, n) => {
  k.renderer?.applyContraction(n.inset);
  k.hud?.log('Mahlstrom zieht sich zusammen', 'danger');
};

/**
 * Ereignisart → Wirkung.
 *
 * Die Schlüssel sind die Ereignisarten, die die Engine (`match.consumeEvents()`)
 * bzw. der Server senden. Es gibt keinen zweiten Ort, der Ereignisarten auf
 * Wirkungen abbildet: Beide Betriebsarten schlagen hier nach.
 * @type {Record<string, WirkungsEintrag>}
 */
export const EREIGNIS_WIRKUNGEN = {
  /*
   * Zerstörtes Terrain (nur online).
   *
   * Lokal entsteht der Krater aus `explosion`; der Server schickt beides
   * getrennt — eine Stelle, an der nur das Gelände abgetragen wurde, kennt
   * ausschließlich diesen Fall.
   */
  terrain_destroyed: {
    online: (k, n) => {
      k.renderer?.applyCrater(n.x, n.y, n.radius || 12);
    },
  },

  /*
   * Explosion.
   *
   * Lokal: Krater, Blitz, Klang.
   * Online: Partikel, Blitz, Krater — und KEIN Klang. Das ist der
   * Unterschied, den die beiden Einträge benennen.
   */
  explosion: {
    lokal: (k, n) => {
      k.renderer?.applyCrater(n.x, n.y, n.radius || 12);
      k.renderer?.addFlash(n.x, n.y, (n.radius || 12) * 1.4);
      /*
       * Der Klang zum Einschlag.
       *
       * Der Mischer entscheidet selbst, ob er etwas tut — ist der Klang
       * abgeschaltet oder gibt es kein Ausgabegerät, ist der Aufruf ein
       * No-Op. Deshalb steht hier keine Bedingung: Die Regel liegt an
       * EINER Stelle (im Mischer), nicht an jedem Aufrufort.
       */
      k.sound?.verarbeite({ type: 'explosion', radius: n.radius || 12 });
    },
    online: (k, n) => {
      k.renderer?.spawnExplosionParticles(n.x, n.y, n.radius || 12);
      k.renderer?.addFlash(n.x, n.y, (n.radius || 12) * 1.4);
      k.renderer?.applyCrater(n.x, n.y, n.radius || 12);
    },
  },

  /*
   * Soforttreffer.
   *
   * Lokal zeichnet der Client den Strahl und quittiert den Schuss mit Klang;
   * online bestätigt der Server den Schuss — hier wird die VORHERSAGE
   * aufgelöst, und der Strahl kommt aus den Serverdaten.
   */
  hitscan: {
    lokal: (k, n) => {
      // Soforttreffer sichtbar machen: Strahl vom Schützen zum Einschlag.
      k.drawHitscanBeam?.(n);
      k.sound?.verarbeite({ type: 'shot' });
      /*
       * Ein Treffer klingt anders als ein Fehlschuss.
       *
       * Das Ereignis trägt `hit` (ob getroffen wurde) und `target`. Nur
       * wenn wirklich jemand getroffen wurde, gibt es den kurzen
       * Bestätigungsklang — sonst würde jeder Schuss ins Leere quittiert.
       */
      if (n.hit && n.target) {
        k.sound?.verarbeite({ type: 'damage' });
      }
    },
    online: (k, n) => {
      /*
       * ROLLBACK: Der Server bestätigt den Schuss. Ab hier zeichnet der echte
       * Strahl — die Vorhersage wird aufgelöst und verschwindet. Ohne diesen
       * Schritt stünde die geschätzte Bahn neben der echten, und der Spieler
       * sähe zwei Kurven für einen Schuss.
       *
       * Der Einschlagpunkt des Servers ist zugleich die Messlatte: Weicht er
       * vom vorhergesagten ab, war das Terrain inzwischen anders (der Client
       * hat denselben Krater noch nicht verarbeitet).
       */
      k.shotPredictor?.resolve({
        impact: Number.isFinite(n.hitX) && Number.isFinite(n.hitY)
          ? { x: n.hitX, y: n.hitY }
          : null,
      });
      k.drawHitscanBeam?.(n);
    },
  },

  /*
   * Der Abschuss.
   *
   * Lokal: Mündungsfeuer und Klang.
   * Online: nur die Vorhersage auflösen — der Server bestätigt den Schuss
   * selbst, gezeichnet wird die echte Bahn.
   */
  shot: {
    lokal: (k, n) => {
      /*
       * Der Abschuss hat einen Klang — und seit 2026-09-25 ein
       * Mündungsfeuer.
       *
       * Vorher stand hier NUR der Klang: Der Schuss war zu hören, aber an
       * der Figur geschah nichts. Bei einem Spiel, dessen ganze Handlung
       * aus Schüssen besteht, ist das die auffälligste Lücke der
       * Darstellung — man sieht nicht, WER geschossen hat.
       *
       * Das Ereignis trägt `playerId` und `angle`; mehr braucht der
       * Renderer nicht, weil er das Feuer an der AKTUELLEN Position der
       * Figur zeichnet (siehe `addMuzzleFlash`). Der Klang bleibt an
       * derselben Stelle — die Regel „wer spielt, entscheidet der Mischer"
       * gilt unverändert.
       */
      k.renderer?.addMuzzleFlash(n.playerId, n.angle ?? 0);
      k.sound?.verarbeite({ type: 'shot' });
    },
    // Bestätigung eines Schusses ohne Bahn (Selbstwirkung) — nichts zu
    // zeichnen, aber die Vorhersage ist damit erledigt.
    online: (k) => {
      k.shotPredictor?.resolve();
    },
  },

  /* Der Server hat das Geschoss erzeugt (nur online). */
  projectile_spawn: {
    // Die Vorhersage hat ihre Aufgabe erfüllt und wird von der echten
    // Flugbahn abgelöst.
    online: (k) => {
      k.shotPredictor?.resolve();
    },
  },

  /*
   * Einschlag eines Projektils.
   *
   * FUND (belegt, Black-Box-Audit): Dieser Fall FEHLTE im lokalen Zweig. Er
   * war nur im ONLINE-Zweig ergänzt — im lokalen Match blieb der Einschlag
   * damit ohne Blitz, und im Protokoll stand nur „ist gelandet". Wer lokal
   * spielt (der Standardfall), sah also nicht, WO sein Schuss eingeschlagen
   * ist.
   *
   * Er steht deshalb hier EINMAL für beide Betriebsarten. Der Krater kommt
   * aus `explosion`; der Blitz hier markiert den Moment des Aufpralls. Beides
   * gehört zusammen: der Krater ist das Ergebnis, der Blitz der Einschlag.
   *
   * Gemessen: Die Engine sendet das Ereignis (`projectileSystem.js:119`).
   */
  projectile_impact: beide((k, n) => {
    k.renderer?.addFlash(n.x, n.y, 14);
  }),

  /*
   * Durchschlag: Der Einschlag blitzt, aber das Geschoss FLIEGT WEITER.
   *
   * Die Rückmeldung ist wichtig, weil die Wirkung sonst unsichtbar bliebe:
   * Ein Durchschuss sieht aus wie ein Schuss, der sein Ziel verfehlt hat —
   * erst der Blitz am Opfer zeigt, dass er getroffen hat und weiterlief.
   */
  projectile_pierced: beide((k, n) => {
    k.renderer?.addFlash(n.x, n.y, 10, { color: '#ffd166' });
  }),

  /*
   * Beute-Fehler.
   *
   * FUND (belegt, Ereignis-Abdeckungstest): `loot_error` wurde von der
   * Engine gesendet, aber von KEINEM Client-Zweig behandelt — der Fehler
   * verschwand spurlos. Wer nichts davon erfährt, sucht den Fehler bei
   * sich: „Warum kommt keine Kiste?"
   *
   * Der Zustand ist selten (er tritt nur auf, wenn die Beuteverteilung
   * scheitert), aber genau deshalb ist eine Meldung wichtig: Ein Fehler,
   * der nie passiert, braucht keine; einer, der selten passiert, braucht
   * eine, sonst ist er beim ersten Mal ein Rätsel.
   */
  loot_error: beide((k, n) => {
    k.hud?.log(`Beute konnte nicht verteilt werden: ${n.message}`, 'danger');
  }),

  /*
   * Eine liegende Granate ist gezündet.
   *
   * FUND (belegt): Ebenfalls stumm. Der Krater erschien zwar über
   * `explosion`, aber der Spieler erfuhr nicht, DASS eine zuvor geworfene
   * Granate gezündet hat. Das ist gerade bei den Zünder-Waffen wichtig
   * (siehe MASTERDOTO, „Bekannte Grenzen": dort ist der Zünder länger als
   * die Flugzeit — die Ladung zündet also mit Verzögerung am Boden).
   *
   * Die VORSTUFE dazu ist `fuse_armed`: Der Spieler soll wissen, dass dort
   * etwas liegt — sonst überrascht ihn die Explosion zwei Sekunden später an
   * einer Stelle, an der er nichts erwartet.
   */
  fuse_armed: beide((k, n) => {
    k.hud?.log('Eine Granate liegt und tickt …', 'neutral');
    k.renderer?.addFlash(n.x, n.y, 10, { color: '#ffd166' });
  }),

  fuse_expired: beide((k, n) => {
    k.hud?.log('Eine Granate ist liegen geblieben und gezündet', 'accent');
    k.renderer?.addFlash(n.x, n.y, 22, { color: '#f4a261' });
  }),

  /*
   * Geschütze: Aufstellen, Feuern, Ablaufen.
   *
   * FUND (belegt): Diese Fälle fehlten im lokalen Zweig. Sie waren nur im
   * ONLINE-Zweig ergänzt worden, und im lokalen Match blieb das Aufstellen
   * damit stumm — gemessen stand im Protokoll nur „Schuss abgegeben (60
   * Kraft)". Ein Geschütz, dessen Aufstellen niemand gemeldet bekommt, ist
   * für den Spieler nicht vorhanden.
   */
  turret_deployed: {
    lokal: (k, n) => {
      k.hud?.log(
        `Geschütz aufgestellt — ${n.rounds} Runden, ${n.damage} Schaden`,
        'accent',
      );
      k.renderer?.addFlash(n.x, n.y, 18, { color: '#d9b44a' });
    },
    // Online ohne Blitz: der Markierungsblitz am Aufstellort ist lokal. Das
    // Protokoll ist in beiden Betriebsarten dasselbe.
    online: (k, n) => {
      k.hud?.log(
        `Geschütz aufgestellt — ${n.rounds} Runden, ${n.damage} Schaden`,
        'accent',
      );
    },
  },

  /*
   * Das Geschütz feuert — die Rückmeldungen sind UNTERSCHIEDLICH: lokal ein
   * Blitz am Geschütz, online eine Protokollzeile. Beide sind hier benannt,
   * nicht stillschweigend zusammengelegt: Wer eines der beiden Verhalten
   * ändert, sieht die andere Betriebsart direkt daneben.
   */
  turret_fired: {
    lokal: (k, n) => {
      k.renderer?.addFlash(n.x, n.y, 12, { color: '#d9b44a' });
    },
    online: (k) => {
      k.hud?.log('Das Geschütz feuert', 'neutral');
    },
  },

  turret_expired: beide((k) => {
    k.hud?.log('Geschütz abgelaufen', 'neutral');
  }),

  /*
   * Wirkungen und Zustände kommen im Online-Modus als Serverereignisse.
   * Sie werden über dieselben Helfer gemeldet wie lokal, damit die
   * Meldungen in beiden Betriebsarten gleich lauten.
   */
  special_effect: beide((k, n) => {
    // Wirkungen auf den Schützen: Heilung, Schild, Sprung, Munition.
    k.logSpecialEffect?.(n);
  }),

  frozen: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} ist eingefroren (${n.turns} Zug/Züge)`, 'accent');
  }),

  turn_skipped: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} setzt aus — eingefroren`, 'danger');
  }),

  dot_tick: beide((k, n) => {
    /*
     * Der Online-Zweig las `elements` mit Vorgabewert, der lokale ohne. Die
     * Engine sendet die Liste immer (`specials.js` gibt `{ damage, elements,
     * frozeThisTurn }` zurück), der Vorgabewert greift also nie — er ist hier
     * beibehalten, damit ein fehlendes Feld keine Ausnahme auslöst.
     */
    k.hud?.log(`${k.nameOf?.(n.playerId)} erleidet ${Math.round(n.damage)} Schaden (${(n.elements ?? []).join(', ')})`, 'danger');
  }),

  /*
   * Schild: der Text ist gleich, lokal zusätzlich sichtbar.
   *
   * Der Blitz sitzt am Ort der Figur, nicht am Ursprung — ein Blitz bei (0,0)
   * hätte mit der Figur nichts zu tun.
   */
  shield_absorbed: {
    lokal: (k, n) => {
      const geschuetzt = k.findEntity?.(n.playerId);
      if (geschuetzt) k.renderer?.addFlash(geschuetzt.x, geschuetzt.y, 16, { color: '#4cc9f0' });
      schildMeldung(k, n);
    },
    online: schildMeldung,
  },

  pulled: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} wurde herangezogen`, 'accent');
  }),

  /*
   * Günther: seine Streiche laufen in BEIDEN Betriebsarten.
   *
   * KORRIGIERTER KOMMENTAR (belegt). Hier stand:
   *
   *   „Günther: seine Streiche gibt es nur im lokalen Match — der Server kennt
   *    diese Ereignisarten nicht."
   *
   * Das ist nachgemessen WIDERLEGT. Der Server schickt JEDES Engine-Ereignis
   * ohne Whitelist an alle Clients — `src/server/gameServer.js:246–248`:
   *
   *   for (const event of this.match.consumeEvents()) {
   *     this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
   *   }
   *
   * und er sagt an anderer Stelle selbst, dass die speziellen NPCs bewusst
   * mitlaufen (`src/server/gameServer.js:291–293`). Der Client reicht jede
   * unbekannte Steuernachricht an `game_event` weiter
   * (`src/client/networkClient.js:396–398`, `default:`-Zweig). Die vier Arten
   * kommen online also AN — sie wurden erst HIER, bei der Wirkung, verworfen.
   *
   * Die Meldungen sind in beiden Betriebsarten gleich: Sie nennen die Figur über
   * `k.nameOf`, und der Name steht in beiden Ansichtszuständen (lokal aus
   * `match.getState()`, online aus dem Snapshot). Deshalb `beide(fn)`.
   */
  guenther_wheel: beide((k, n) => {
    /*
     * Der Ruf ist identisch — die Wirkung liegt in `Main#showGuentherWheel`.
     *
     * EIN Unterschied steckt IM Aufgerufenen, nicht hier: die Heimdall-Szene
     * zieht ihren Seed aus `this.match.seedManager.baseSeed`
     * (`src/client/main.js:1622`). Online ist `this.match` null, der Rückfall
     * `?? 0` greift — die Szene läuft mit Seed 0 statt dem Match-Seed. Sichtbar
     * ist das nur an der Heimdall-Animation; das Rad selbst zeigt in beiden
     * Betriebsarten denselben Ausgang.
     */
    k.showGuentherWheel?.(n);
  }),

  guenther_pee: beide((k, n) => {
    k.hud?.log(`Günther pinkelt ${k.nameOf?.(n.playerId)} an (−${n.amount})`, 'neutral');
  }),

  guenther_poop: beide((k) => {
    k.hud?.log('Günther hat ein Häufchen gemacht', 'neutral');
  }),

  guenther_poop_hit: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} ist in ein Häufchen getreten`, 'danger');
  }),

  /*
   * Sprung — in BEIDEN Betriebsarten.
   *
   * Lokal entsteht das Ereignis im eigenen Motor, online kommt es vom Server
   * (`src/server/gameServer.js` schickt jedes Motorereignis als Steuernachricht).
   * Bis O8 gab es NUR den lokalen Zweig: online sprang niemand, also fiel nichts
   * auf — sobald der Server einen Sprung ausführt, wäre der Zweig aber der
   * einzige Ort, an dem der Spieler erfährt, dass seine Figur fliegt.
   *
   * GENAU EINE Meldung je Sprung: Der Client loggt im Online-Pfad NICHT selbst
   * (`Main#jump` sendet nur den Befehl) — sonst stünde dieselbe Handlung zweimal
   * im Live-Bereich. Der Text kommt aus `n.double`, wie lokal.
   *
   * Seit der Sprung keine Obergrenze mehr hat, ist `n.jumpsLeft` `null`
   * („unbegrenzt", siehe `SPRUENGE_UNBEGRENZT` in `src/engine/match.js`) und
   * wird hier NICHT gelesen: Die Unterscheidung „Sprung"/„Doppelsprung" steht in
   * `n.double` (vom Boden / in der Luft) und bleibt richtig, egal wie viele
   * Sprünge folgen. Wer hier später eine Zahl erwartet, liest `null` — das ist
   * die Aussage, keine Lücke.
   *
   * Online kommt dieses Ereignis erst seit 2026-09-27 ungedrosselt an: Vorher
   * stand `jumped` in `GEDROSSELTE_EREIGNISARTEN` (`src/shared/protocol.js`), und
   * der Doppelsprung (gemessen 5 Takte nach dem ersten) fiel in das
   * 30-Takte-Fenster — die Zeile kam online nie an.
   */
  jumped: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} springt${n.double ? ' (Doppelsprung)' : ''}`, 'accent');
  }),

  /*
   * Landung nach Sprung oder Fall — in BEIDEN Betriebsarten.
   *
   * FUND (belegt, O2): Hier stand nur `lokal:`; online kam das Ereignis an
   * (`src/server/gameServer.js:246-248`) und fiel bei der Wirkung weg, weil
   * `verarbeiteOnline` nur `.online` liest (`:618`). Der Name kommt aus
   * `k.nameOf` — lokal aus `match.getState()`, online aus dem Snapshot; beide
   * führen ihn.
   */
  landed: beide((k, n) => {
    k.hud?.log(`${k.nameOf?.(n.playerId)} ist gelandet`);
  }),

  crate_landed: {
    lokal: (k) => {
      k.hud?.log('Abgeworfene Waffe gelandet', 'neutral');
    },
  },

  /*
   * Abgeworfene Waffe — ONLINE.
   *
   * Lokal meldet `Main#dropWeapon` das Ergebnis direkt im Log (Name, Munition,
   * Listenaktualisierung), deshalb gibt es hier KEINEN lokalen Zweig: eine
   * zweite Zeile wäre eine Dopplung.
   *
   * Online gilt diese Begründung NICHT: Dort gibt es keinen lokalen
   * `dropWeapon`-Erfolgspfad — der Server führt den Abwurf aus. Ohne diesen
   * Zweig fiele `weapon_dropped` STUMM weg, und der Spieler sähe nur eine neue
   * Kiste ohne genannten Grund.
   */
  weapon_dropped: {
    online: (k, n) => {
      const name = getWeapon(n.weaponId)?.displayName ?? n.weaponId;
      const vorrat = n.ammo < 0 ? '∞' : n.ammo;
      k.hud?.log(`${k.nameOf?.(n.playerId)} wirft ${name} ab (${vorrat} Munition)`, 'accent');
    },
  },

  /*
   * Voller Vorrat: Die Kiste bleibt liegen — die AUFFORDERUNG gilt jetzt in
   * beiden Betriebsarten.
   *
   * Vor O8 war sie NUR lokal richtig: `Main#dropWeapon` stieg online stumm aus
   * (`mode !== 'local'`), deshalb nannte nur der lokale Zweig die Taste (Q), und
   * der Online-Text benannte bloß den Zustand. Seit O8 gibt es einen
   * Abwerf-Weg online (`CONTROL.DROP_WEAPON`) — die Taste wirkt dort genauso wie
   * lokal, also darf und muss die Aufforderung in beiden Zweigen stehen. Ein
   * Online-Text ohne Handlung ließe den Spieler mit vollem Vorrat ohne Ausweg
   * zurück.
   */
  crate_pickup_blocked: beide((k) => {
    // Der Vorrat ist voll: das ist der Moment, in dem Abwerfen nötig wird.
    k.hud?.log('Vorrat voll — erst eine Waffe abwerfen (Q)', 'danger');
  }),

  /*
   * Kiste aufgenommen — in BEIDEN Betriebsarten, NUR der Name kommt anders.
   *
   * FUND (belegt, O2): Hier stand nur `lokal:`; online fiel das Ereignis bei
   * der Wirkung weg. Der lokale Zweig liest den Namen aus der Spielerliste
   * (`k.match.players`) — online ist `k.match` null (`src/client/ereignisse.js:1380`,
   * `match: this.match` im Kontext), deshalb benutzt der Online-Zweig den
   * gemeinsamen `k.nameOf`, der dort aus dem Snapshot liest.
   */
  crate_pickup: {
    lokal: (k, n) => {
      const who = k.match?.players?.find(player => player.entityId === n.playerId);
      const reward = n.reward;
      const text = reward?.kind === 'weapon'
        ? `${who?.label ?? 'Spieler'} findet ${getWeapon(reward.weaponId)?.displayName ?? 'eine Waffe'}`
        : reward?.kind === 'heal' ? `${who?.label ?? 'Spieler'} heilt ${reward.amount} HP`
        : reward?.kind === 'trap' ? `${who?.label ?? 'Spieler'} löst eine Sprengfalle aus`
        : `${who?.label ?? 'Spieler'} öffnet eine leere Kiste`;
      k.hud?.log(text, reward?.kind === 'trap' ? 'danger' : 'good');
    },
    online: (k, n) => {
      const who = k.nameOf?.(n.playerId);
      const reward = n.reward;
      const text = reward?.kind === 'weapon'
        ? `${who} findet ${getWeapon(reward.weaponId)?.displayName ?? 'eine Waffe'}`
        : reward?.kind === 'heal' ? `${who} heilt ${reward.amount} HP`
        : reward?.kind === 'trap' ? `${who} löst eine Sprengfalle aus`
        : `${who} öffnet eine leere Kiste`;
      k.hud?.log(text, reward?.kind === 'trap' ? 'danger' : 'good');
    },
  },

  /*
   * Heilung — der Text unterscheidet sich: lokal mit Namen der Figur, online
   * (dort kommt die Heilung aus einer Servermeldung) ohne. Zwei benannte
   * Einträge statt einer Angleichung, die den lokalen Text verkürzen würde.
   */
  heal: {
    lokal: (k, n) => {
      k.hud?.log(`+${Math.round(n.amount)} Heilung für ${k.nameOf?.(n.entityId)}`, 'good');
    },
    online: (k, n) => {
      k.hud?.log(`+${Math.round(n.amount)} Heilung`, 'good');
    },
  },

  /*
   * 'drowning' hat bewusst KEINE Wirkung: Das CharacterSystem meldet es bei
   * JEDEM Simulationsschritt, solange die Figur unter Wasser ist — das sind
   * bis zu 60 Meldungen je Sekunde, die das Protokoll überschwemmen. Die
   * Meldung entsteht stattdessen beim ÜBERGANG in `Main#trackWater` und nennt
   * die Figur beim Namen.
   *
   * Der Eintrag steht trotzdem hier: So ist sichtbar, dass die Art BEWUSST
   * ohne Wirkung bleibt und nicht vergessen wurde.
   */
  drowning: {},

  maelstrom_contract: {
    lokal: mahlstromZiehtSich,
    // Online kennt zusätzlich den Einschnitt als Clientzustand: der Snapshot
    // trägt ihn weiter (`remoteInset`).
    online: (k, n) => {
      k.fernzustand?.setzeEinschnitt(n.inset);
      mahlstromZiehtSich(k, n);
    },
  },

  /*
   * Ausschalten — der Text unterscheidet sich: lokal mit dem Namen aus der
   * Spielerliste, online nüchtern mit „Eine Einheit". (Der Name steht online
   * in der Spielerliste, die aus dem Snapshot kommt; die Meldung nennt ihn
   * dort nicht, und daran ändert die Tabelle nichts.)
   */
  death: {
    lokal: (k, n) => {
      const victim = k.match?.players?.find(player => player.entityId === n.entityId);
      k.hud?.log(`${victim?.label ?? `Entity ${n.entityId}`} ausgeschaltet`, 'danger');
    },
    online: (k) => {
      k.hud?.log('Eine Einheit wurde ausgeschaltet', 'danger');
    },
  },

  /*
   * Sturzschaden — in BEIDEN Betriebsarten.
   *
   * FUND (belegt, O2): Hier stand nur `lokal:`; online war der Lebensverlust
   * damit UNERKLÄRT — der Balken sank, aber niemand nannte den Grund. Der Text
   * nennt keinen Namen, deshalb `beide(fn)`.
   */
  fall_damage: beide((k, n) => {
    k.hud?.log(`Sturzschaden: ${Math.round(n.damage)}`, 'danger');
  }),

  round_start: beide((k, n) => {
    k.hud?.log(`Runde ${n.round} — Wind ${Number(n.wind ?? 0).toFixed(3)}`, 'neutral');
  }),

  /*
   * Toxischer Regen — in BEIDEN Betriebsarten.
   *
   * FUND (belegt, O2): Hier stand nur `lokal:`; online war der Lebensverlust
   * der Betroffenen ebenfalls unerklärt. Die Zone ist in beiden Betriebsarten
   * dieselbe, deshalb `beide(fn)` und derselbe Text.
   */
  toxic_rain: beide((k, n) => {
    if (n.affected?.length) k.hud?.log('Toxischer Regen trifft die Zone', 'danger');
  }),

  match_over: {
    /*
     * Nur beim ERSTEN Mal protokollieren. Der Server wiederholt die
     * Nachricht auf jede PING-Anfrage, solange das Match entschieden ist
     * (siehe PING-Zweig im Server) — sonst stünde alle zwei Sekunden
     * dieselbe Zeile im Protokoll und verdrängte alles andere.
     */
    lokal: (k) => {
      if (k.fernzustand?.status() !== 'gameover') k.hud?.log('Match beendet', 'accent');
    },
    // Online endet die Partie: Status, Sieger und Endbildschirm.
    online: (k, n) => {
      k.fernzustand?.setzeStatus('gameover');
      k.fernzustand?.setzeSieger(n.winnerTeamId ?? null);
      k.showEndScreen?.(n.winnerTeamId ?? null);
    },
  },

  turn_start: {
    online: (k) => {
      k.fernzustand?.setzeStatus('playing');
    },
  },

  /*
   * Die Karte hat eine Figur auf einer unerreichbaren Fläche.
   *
   * Das ist kein Fehler im Ablauf — die Partie läuft weiter —, aber der
   * betroffene Spieler soll es WISSEN. Ohne diesen Eintrag säße er auf
   * einer Insel und wartete darauf, dass etwas passiert, ohne zu ahnen,
   * dass niemand ihn erreichen kann.
   *
   * Die Meldung ist bewusst nüchtern: Sie nennt den Zustand, nicht eine
   * Schuldzuweisung. Es ist eine Eigenschaft der gezogenen Karte.
   *
   * Online only: die Prüfung gehört zur Karte, und die kennt der Server.
   */
  karte_unerreichbar: {
    online: (k, n) => {
      k.hud?.log(
        `Die Karte hat eine abgeschnittene Fläche (${n.grund}) — `
        + 'eine Einheit ist von dort aus nicht erreichbar',
        'warn',
      );
    },
  },
};

/**
 * Verarbeitet EIN Ereignis des lokalen Matches.
 *
 * Der Kontext wird geprüft, BEVOR nachgeschlagen wird: Ein unvollständiger
 * Kontext soll seine eigene Wirkung verlieren — nicht die ganze Ereignisfolge
 * (siehe „Der Kontext" oben).
 *
 * @param {object} kontext Zugänge aus `Main#ereignisKontext()`
 * @param {{type: string, payload: object}} ereignis Eintrag aus `match.consumeEvents()`
 * @returns {void}
 */
export function verarbeiteLokal(kontext, ereignis) {
  if (!kontextBrauchbar('lokal', kontext)) return;
  EREIGNIS_WIRKUNGEN[ereignis?.type]?.lokal?.(kontext, ereignis?.payload);
}

/**
 * Verarbeitet EINE Meldung des Servers.
 *
 * Lokal wie online dieselbe Prüfung: Die Pflichtfelder unterscheiden sich
 * (`match` fehlt online planmäßig), der Umgang mit einem Mangel nicht.
 *
 * @param {object} kontext Zugänge aus `Main#ereignisKontext()`
 * @param {{t: string}} nachricht Servermeldung (`game_event`)
 * @returns {void}
 */
export function verarbeiteOnline(kontext, nachricht) {
  if (!kontextBrauchbar('online', kontext)) return;
  EREIGNIS_WIRKUNGEN[nachricht?.t]?.online?.(kontext, nachricht);
}
