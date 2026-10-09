/**
 * MatchController — verbindet Terrain, Wasser, ECS-Systeme, Runden- und
 * Zuglogik zu einem vollstaendigen, deterministischen Match.
 *
 * Wird identisch vom Browser-Client und vom Headless-Server genutzt; der
 * Unterschied besteht nur darin, wer `step()` aufruft und ob gerendert wird.
 *
 * @module MatchController
 */
import { createGameWorld, SYSTEM_PRIORITIES } from './init.js';
import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';
import { CollisionMask } from './terrain/collisionMask.js';
import { surfaceY as findSurfaceY } from '../shared/terrainGen.js';
import { materialAmPunkt } from '../shared/terrainGen3.js';
import { TERRAIN_MATERIAL, RUECKPRALL_MINDESTTEMPO } from '../shared/config/terrain.js';
import { baueAnsichtszustand, hashState } from './stateSnapshot.js';
import { erzeugeSpieler } from './spawnManager.js';
import { baueTerrain } from './terrainBuilder.js';
import {
  pruefeErreichbarkeit, maxWurfweite, abstandZumNaechstenGegner,
} from '../shared/erreichbarkeit.js';
import { reichweitenFaktor, geschwindigkeitsFaktor, weitenFaktor } from '../shared/reichweite.js';
import { MatchSeedManager } from '../shared/seed.js';
import { EventBus } from './events.js';
import { WaterField } from './waterField.js';
import { ProjectileSystem } from './systems/projectileSystem.js';
import { DEFAULT_PROJECTILE_GRAVITY, DEFAULT_PROJECTILE_DRAG } from './systems/projectileSystem.js';
import { CharacterSystem } from './systems/characterSystem.js';
import { MaelstromSystem } from './systems/maelstromSystem.js';
import { LootSystem } from './systems/lootSystem.js';
import { PlayerInventory } from './inventory.js';
import {
  StatusStore,
  buildEffect,
  elementalEffectFor,
  SELF_TARGET_KINDS,
  EFFECT_KIND,
} from './specials.js';
import { MATCH_RULES } from '../shared/config/match.js';
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS, resolveLoadout } from '../shared/config/classes.js';
import { getWeapon } from '../shared/config/weapons.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { damageTypeId } from './damageTypes.js';
import { pickScenery } from '../shared/config/scenery.js';
import { biomFuerCharakter as biomeKennungFuerCharakter } from '../shared/biomwahl.js';
import { WET_LEVEL, clampWaterLevel } from '../shared/config/water.js';
import { GuentherSystem } from './systems/guentherSystem.js';
import { GUENTHER_POOP, LOW_RARITY_WEIGHTS, LEGENDARY_WEIGHTS } from '../shared/config/guenther.js';
import { CRATE_TYPES, RARITY_IDS, PICKUP_RADIUS } from './systems/lootSystem.js';
import { ccdRaycast } from './physics/ballistics.js';
import { POWER_TO_SPEED, PROJECTILE_GRAVITY, integrateStep } from '../shared/ballistics.js';
import { launchSpeedMultiplier } from '../shared/launchSpeed.js';
import {
  fire, projectileLifetime, aimPreview, hasLineOfSight, launchOrigin,
} from './shooting.js';
import {
  aimTurret, freierPlatz, naechsterGegner, turretProjectile,
  TURRET_WEAPON, TURRET_WEAPON_ID, TURRET_PATH_STEPS,
} from './turret.js';

/**
 * Kartenmaße je Ausrichtung.
 *
 * Querformat (16:9) und Hochformat (9:16) haben dieselbe Fläche, nur getauscht.
 * Gleiche Fläche ist Absicht: Die Reichweiten, Sprunghöhen und Wurfweiten der
 * Waffen sind in Kartenpixeln angegeben. Eine deutlich kleinere Hochkantkarte
 * hätte alle Waffen zu weit reichen lassen, eine größere zu kurz.
 */
/*
 * Die Kartengrößen.
 *
 * ## Warum es mehrere gibt
 *
 * Die Größe bestimmt, wie viel WELT es gibt — und damit, wie viel man sich
 * bewegen muss. Das ist eine Spielgefühls-Entscheidung, die an der Spielerzahl
 * hängt: Ein Duell auf einer Kriegskarte wäre ein Wettlauf, ein Achterspiel auf
 * einer Duellkarte ein Gedränge.
 *
 *     Duell          1280 ×  720     die ganze Karte auf dem Schirm
 *     Kleines Match  2560 × 1440     4× die Fläche
 *     Großes Match   3840 × 2160     9×
 *     Krieg          5120 × 2880    16×
 *
 * ## Warum Vielfache von 1280
 *
 * Die Reichweiten der Waffen sind in Kartenpixeln angegeben (110 bis 1062 px).
 * Auf 1280 px erreicht die mittlere Waffe 40 % der Karte — das ist der
 * Maßstab, auf den die Waffen abgestimmt sind. Vielfache davon halten dieses
 * Verhältnis wenigstens grob: Auf der Kriegskarte erreicht dieselbe Waffe
 * 10 %, man muss also weiter laufen.
 *
 * Wer das Verhältnis erhalten will, muss die Reichweiten skalieren
 * (`scripts/check-map-scale.mjs` zeigt, was das kostet).
 *
 * ## Die Grenze
 *
 * Das Drahtformat überträgt Koordinaten als Int16 mit Faktor 4 — die größte
 * darstellbare Koordinate ist 8192 px. Die Kriegskarte mit 5120 px liegt mit
 * 63 % darunter; 8K wäre das Äußerste (`scripts/check-camera.mjs`).
 *
 * ## Die Fläche bleibt NICHT gleich
 *
 * Ein früherer Kommentar hier begründete gleiche Flächen: „Eine deutlich
 * kleinere Hochkantkarte hätte alle Waffen zu weit reichen lassen." Das gilt
 * weiterhin für die ORIENTIERUNG — Quer- und Hochformat derselben Größe haben
 * dieselbe Fläche. Zwischen den Größenstufen ist die Fläche aber bewusst
 * unterschiedlich: Das ist der Sinn der Stufen.
 */
export const MAP_SIZES = Object.freeze({
  /* Querformat: 16:9, wie ein Fernseher. */
  landscape: Object.freeze({
    klein: Object.freeze({ width: 1280, height: 720 }),
    mittel: Object.freeze({ width: 2560, height: 1440 }),
    gross: Object.freeze({ width: 3840, height: 2160 }),
    krieg: Object.freeze({ width: 5120, height: 2880 }),
  }),
  /* Hochformat: dieselbe Fläche wie die jeweilige Querformatstufe, getauscht. */
  portrait: Object.freeze({
    klein: Object.freeze({ width: 720, height: 1280 }),
    mittel: Object.freeze({ width: 1440, height: 2560 }),
    gross: Object.freeze({ width: 2160, height: 3840 }),
    krieg: Object.freeze({ width: 2880, height: 5120 }),
  }),
});

/** Die Namen der Größenstufen, klein nach groß. */
export const MAP_GROESSEN = Object.freeze(['klein', 'mittel', 'gross', 'krieg']);

/** Die Stufe, die einer Spielerzahl zugeordnet ist. */
export function mapGroesseFuerSpieler(spieler) {
  if (spieler <= 2) return 'klein';
  if (spieler <= 8) return 'mittel';
  if (spieler <= 12) return 'gross';
  return 'krieg';
}

/** Ausrichtungen der Karte. */
export const ORIENTATIONS = Object.freeze(['landscape', 'portrait']);

/**
 * Querformat als Vorgabe — die Konstanten bleiben für Altcode erhalten.
 *
 * Sie zeigen auf die MITTLERE Stufe, weil das die Vorgabe der Lobby ist
 * (2 Teams × 2 Spieler = 4 Spieler).
 */
export const MAP_WIDTH = MAP_SIZES.landscape.mittel.width;
export const MAP_HEIGHT = MAP_SIZES.landscape.mittel.height;

/**
 * Maße einer Ausrichtung und Größe.
 *
 * Tolerant wie die übrige Konfiguration: Eine unbekannte Größe fällt auf die
 * Vorgabe zurück, statt zu werfen — eine Einstellung aus einer älteren Fassung
 * soll spielbar bleiben.
 */
export function mapSizeFor(orientation, groesse = 'mittel') {
  const seite = MAP_SIZES[orientation] ?? MAP_SIZES.landscape;
  return seite[groesse] ?? seite.mittel;
}
export const WATER_SCALE = 4;

// Die Namenslisten stammen aus der Klassen-Konfiguration und werden hier nur
// weitergegeben — sonst gäbe es neben der Verrechnung auch noch zwei Quellen
// für die Reihenfolge der Klassen.
export { CLASS_IDS, ARCHETYPE_IDS };
/*
 * Teamfarben.
 *
 * FUND (belegt, Skalierungsplanung): Hier standen **vier** Farben — so viele
 * wie Teams (`lobby.js`: `teams` 2 bis 4). Die Matcharten nennen aber bis zu
 * **8 Spieler**; je nach Aufteilung sind das mehr Teams, als Farben da sind.
 * Ein Team ohne eigene Farbe wäre auf der Karte nicht von einem anderen zu
 * unterscheiden — und die Zuordnung `TEAM_COLORS[teamId]` liefe ins Leere.
 *
 * Acht Farben, paarweise deutlich unterscheidbar (hell/dunkel gemischt, damit
 * sie auch bei Farbfehlsichtigkeit auseinanderfallen):
 *
 *   1 türkis   5 magenta
 *   2 orange   6 grün
 *   3 rot      7 blau
 *   4 violett  8 sand
 *
 * Die Zuordnung bleibt `TEAM_COLORS[teamId]` — wer mehr Teams als Farben
 * erlaubt, bricht die Anzeige. Die Lobby prüft die Grenze (`teams` 2 bis 4);
 * sie wird mit den Matcharten angehoben.
 */
export const TEAM_COLORS = Object.freeze([
  '#4cc9f0', // 1 türkis
  '#f4a261', // 2 orange
  '#e63946', // 3 rot
  '#9d4edd', // 4 violett
  '#f72585', // 5 magenta
  '#90be6d', // 6 grün
  '#4d7cfe', // 7 blau
  '#e9c46a', // 8 sand
]);

/*
 * Grundgesundheit vor dem Klassenfaktor.
 *
 * Exportiert und über den Konstruktor einstellbar, damit Messwerkzeuge die
 * Wirkung einer Änderung prüfen können, BEVOR sie gemacht wird
 * (`scripts/check-match-time.mjs`) — dieselbe Regel wie bei `PICKUP_RADIUS`.
 * Die wirksame Gesundheit ist dieser Wert mal `healthMultiplier` der Klasse
 * (0,56 bis 1,56).
 */
export const BASE_HEALTH = 100;
/*
 * Kraft in Geschwindigkeit (px/Tick je Krafteinheit).
 *
 * Die ZAHL steht in `src/shared/ballistics.js` — dort, wo auch Schwerkraft,
 * Luftwiderstand und der Integrationsschritt liegen. Motor, Zielvorschau und
 * clientseitige Vorhersage lesen dieselbe Konstante (eine Bot-KI gibt es nicht).
 *
 * FUND (belegt): Zuvor stand die Zahl hier UND als Abschrift in
 * `shotPrediction.js` (dort als `PREDICTION_POWER_TO_SPEED`). Der Test, der
 * beide verglich, las sie per Textsuche aus dieser Datei — er hätte gemerkt,
 * wenn eine der beiden wanderte, aber nicht, wenn beide gleichzeitig
 * verschoben wurden. Jetzt gibt es nur noch eine Zahl; der Test prüft
 * zusätzlich, dass hier keine zweite entsteht.
 */
export { POWER_TO_SPEED };

/**
 * Der Reichweitenfaktor dieser Karte.
 *
 * ## Warum er gebraucht wird
 *
 * FUND (belegt, gemessen mit `npm run check:reichweite`): Die Wurfweite ist
 * **konstant 613 px** — unabhängig von der Kartengröße. Auf einer 1280er Karte
 * reichte das mit fast doppelter Reserve; auf 5120 px erreicht die stärkste
 * Waffe **nicht mehr** den nächsten Gegner.
 *
 * Die Waffen sind für kleine Karten gebaut. Statt 150 Designwerte zu ändern
 * (die Datei gehört dem Auftraggeber und wird nicht ohne Auftrag angefasst),
 * skaliert der Motor die Umrechnung: Alle Waffen wachsen gleichmäßig, ihre
 * Spreizung bleibt erhalten.
 *
 * Bei 1920 px ist der Faktor genau 1,0 — dort ändert sich nichts.
 *
 * Die Formel steht in `src/shared/reichweite.js` samt Herleitung.
 */
export function reichweiteFuer(kartenbreite) {
  return reichweitenFaktor(kartenbreite);
}

/**
 * Die höchste Kraft, die ein Schuss haben kann.
 *
 * FUND (belegt): Diese Zahl stand an drei Stellen verstreut — im Client als
 * `Math.min(100, Math.max(8, …))`, im Turm und im Testaufbau. Für die
 * Erreichbarkeitsprüfung wird sie als Konstante gebraucht, damit die
 * berechnete Wurfweite zur echten Sim-Physik passt und nicht zu einer
 * abgeschriebenen Zahl.
 */
export const HOHECHSTE_KRAFT = 100;
/*
 * Geschütze.
 *
 * Die Werte des Geschützes (`TURRET_WEAPON`, `TURRET_POWERS`,
 * `TURRET_ELEVATIONS`, `TURRET_MAX_MISS`) und die Winkel/Kraft-Suche stehen in
 * `engine/turret.js` — siehe dessen Modulkopf, `docs/zerlegung-turret.md` und
 * `docs/duplikate-bericht.md` (Fund 1/2/5).
 *
 * Hier bleiben nur die LESER: die Bahn (`#simulateTurretPath`, liest
 * `TURRET_PATH_STEPS`) und das Geschoss (`#spawnTurretProjectile`, liest Waffe
 * und Kennung). Die Suche ist deshalb ausgelagert, weil sie reine Rechnung über
 * feste Listen ist und in dieser Klasse nur über eine Instanz prüfbar war.
 */
/*
 * Die Schwerkraft der Geschosse — eine REFERENZ auf die zentrale Konstante.
 *
 * FUND (belegt, 2026-09-27): Hier stand `const GRAVITY = 0.32;` neben
 * `PROJECTILE_GRAVITY = 0.32` in `src/shared/ballistics.js`. Wertgleich, deshalb
 * unauffaellig — aber der Geschuetz-Zielpfad las die EIGENE Kopie, waehrend der
 * Erreichbarkeitspfad die geteilte Konstante nahm. Wer `PROJECTILE_GRAVITY`
 * getunt haette, haette das Geschuetz STILL falsch zielen lassen.
 */
/** Marke im Oberflächen-Cache: Spalte noch nicht abgetastet. */
const OBERFLAECHE_UNBEKANNT = -2;
const GRAVITY = PROJECTILE_GRAVITY;
const MAX_WIND = 0.05;
/** Fallbeschleunigung abgeworfener Kisten (px pro Tick²). */
const CRATE_GRAVITY = 0.30;
/**
 * Mindest-Flugzeit eines Wurfs in Ticks (0,75 s bei 60 Hz).
 * Die Kiste landet erst danach — auch wenn sie vorher aufsetzen würde.
 */
const CRATE_FLIGHT_TICKS = 45;

/** Absprunggeschwindigkeit (px pro Tick), negativ = nach oben. */
const JUMP_IMPULSE = 9.2;
/**
 * Der zweite Sprung ist schwächer als der erste: sonst wäre er kein Zusatz,
 * sondern ein Ersatz mit doppelter Höhe.
 */
const DOUBLE_JUMP_FACTOR = 0.8;
/** Seitliche Zugabe beim Sprung, damit man auch über Kanten kommt. */
const JUMP_SIDE_IMPULSE = 2.4;

/**
 * Der Wert, der „es gibt keine Obergrenze" benennt.
 *
 * ## Warum es das gibt
 *
 * Bis 2026-09-27 zählte der Motor zwei Sprünge je Zug und meldete den Rest als
 * Zahl (`jumpsLeft: 1`, dann `0`, danach „Keine Sprünge mehr in diesem Zug").
 * Auf Entscheidung des Auftraggebers ruht der Sprung auf KEINER Obergrenze mehr
 * („nein sprung kann man unendlich"). Damit ist jede Restzahl eine Aussage über
 * einen Zähler, den es nicht mehr gibt.
 *
 * ## Warum `null` und nicht `Infinity`
 *
 * `JSON.stringify(Infinity)` ergibt `null` (JSON kennt kein Unendlich). Das
 * `jumped`-Ereignis geht im Netzspiel als JSON über die Leitung
 * (`protocol.js#encodeMessage`), lokal entsteht derselbe Wert im Prozess. Mit
 * `Infinity` stünden lokal also `Infinity` und online `null` — zwei Werte für
 * dieselbe Sache, genau die Art Auseinanderlaufen, die `client/ereignisse.js`
 * an anderer Stelle schon einmal getroffen hat. `null` ist der einzige Wert, der
 * in BEIDEN Pfaden derselbe ist.
 *
 * ## Was der Spieler sieht: keine Zahl, sondern „unbegrenzt"
 *
 * Die Unterscheidung der Anzeige hängt NICHT an diesem Feld, sondern an
 * `double`: `double === false` heißt „vom Boden abgesprungen", `double === true`
 * „in der Luft". Beides bleibt mit unbegrenzten Sprüngen bedeutsam (siehe
 * `docs/sprung-regel.md`).
 *
 * ## Wichtige Messung: Der Fallschaden ist KEINE Bremse
 *
 * Die Annahme, unbegrenztes Springen bremse sich über den Fallschaden selbst,
 * trägt nicht — gemessen am unveränderten Motor (`docs/sprung-regel.md`):
 * Der Absprungimpuls beträgt 9,2 px/Takt (Doppelsprung 7,36), die
 * Fallschadensschwelle aber 11 px/Takt (`characterSystem.js`). Ein Sprung landet
 * mit gemessenen 9,62 px/Takt und damit UNTER der Schwelle: Springer nehmen
 * keinen Schaden, gleich wie viele es sind. Der Motor stützt die Annahme nicht;
 * gemeldet statt erfunden.
 */
const SPRUENGE_UNBEGRENZT = null;

/**
 * Wie stark die Beweglichkeit einer Klasse (`CLASS_DEFINITIONS[].speed`) auf den
 * Absprung wirkt — getrennt für Werte über und unter 1,0.
 *
 * ## Warum dieser Wert überhaupt verdrahtet wird
 *
 * Fund (belegt): Bis hierher las der Motor `speed` gar nicht — der Wert stand
 * unter `inert`. Der Scout war damit auf ALLEN drei wirksamen Achsen (Leben,
 * Wucht, Reichweite) der schwächste und hatte keine einzige Stärke im Spiel;
 * seine im Profil angelegte Beweglichkeit (1,2) existierte nur auf dem Papier.
 * Gemessen ergab das keine Schere-Stein-Papier-Beziehung, sondern eine
 * Rangfolge Artillerie > Heavy > Scout (siehe MASTERDOTO, „Bekannte Grenzen").
 *
 * ## Warum der Sprung die richtige Achse ist
 *
 * Die Position ist in einem Artillerie-Spiel die kostbarste Größe (so steht es
 * in `jump()`). Der Sprung ist die einzige Bewegung, die eine Figur selbst
 * auslöst — damit der natürliche Ort für „Beweglichkeit". Auf die seitliche
 * Zugabe zu wirken wäre schwächer: Kollision und Kartengrenze begrenzen sie
 * schnell, während die Höhe unmittelbar neue Stellungen öffnet.
 *
 * ## Warum getrennt gedämpft (oben 0,50 / unten 0,25)
 *
 * Die Höhe wächst mit dem QUADRAT des Impulses. Ungebremst ergäbe `speed` 1,2
 * rund +125 % gegenüber dem Heavy — gemessen 138,5 gegen 61,6 px. Das wäre zu
 * viel: Auf `open` (Amplitude 0,1, rund 36 px Höhenunterschied) käme der Scout
 * überall hin, die Karte verlöre ihre Form.
 *
 * Zwei Dinge folgen daraus:
 *
 *  1. **Oben wird gebremst**, damit der Aufschlag spürbar, aber nicht
 *     kartensprengend bleibt. Mit 0,50 landet der Scout bei 116,9 px — klar
 *     höher als alle anderen und trotzdem UNTER dem Höhenunterschied von `hills`
 *     (rund 151 px). Er kommt also nicht über das Gelände hinweg.
 *  2. **Unten wird stärker gebremst** (0,25). Heavy und Artillery sind über Leben
 *     und Wucht bereits definiert; ihnen zusätzlich die Sprunghöhe zu nehmen
 *     würde eine Schwäche verschärfen, ohne eine Stärke zu schaffen. Mit 0,25
 *     verlieren sie nur rund 10 % bzw. 15 % statt 19 % und 28 %.
 *
 * Gemessene Sprunghöhen (Seed 4242, `hills`, je Klasse am Zug):
 *
 *   scout      116,9 px   (+35 % gegenüber Heavy)
 *   heavy       86,6 px
 *   artillery   82,0 px
 *
 * Die Wirkung ist pur und deterministisch: Sie hängt allein an der Klasse, kommt
 * aus der Match-Konfiguration und berührt keinen Zufallsstrom. Der Client kennt
 * die Klasse jedes Spielers (`getState()`), kann die Bahn also mitrechnen.
 */
const JUMP_SPEED_INFLUENCE_ABOVE = 0.5;
/** Dämpfung für Klassen unter 1,0 — siehe Begründung oben, Punkt 2. */
const JUMP_SPEED_INFLUENCE_BELOW = 0.25;


/*
 * Trefferfeld und Körpermaße kommen aus `src/shared/config/player.js`. Hier
 * standen sie ein ZWEITES Mal (Audit-Fund „Doppelregel"), während
 * `projectileSystem.js` für die Trefferprüfung eine dritte Kopie führte. Drei
 * Zahlen für denselben Körper: Wer eine ändert, verschiebt entweder die Figur
 * oder das Feld, das sie treffen soll.
 */
/**
 * Größter Höhenunterschied, den eine Verschiebung (Ziehen oder Schub)
 * überwinden darf.
 *
 * Ohne Grenze setzte die Verankerung auf der Geländeoberfläche das Ziel auf den
 * nächsten Hügel — ein Ziehen oder Schub wurde dadurch zum Teleport auf eine
 * Klippe. 16 px entsprechen etwa eineinhalb Figurenhöhen: ein Absatz, den man
 * hinaufgestoßen werden kann, aber keine Wand.
 */
const MAX_SHIFT_SLOPE = 16;
/** Wie weit entlang der Schussrichtung nach freiem Feld gesucht wird. */
const MUZZLE_SEARCH_DISTANCE = 48;

export class MatchController {
  #world;
  #seedManager;
  #events = new EventBus();
  #terrain;
  #bitmap;
  /** Oberflächenhöhe je Spalte (`OBERFLAECHE_UNBEKANNT` = noch nicht gesucht). */
  #oberflaeche = null;
  /**
   * Das Bodenmaterial-Feld dieser Karte (Eis, Gummi, Erde) — oder `null`.
   *
   * `null` heißt: einfacher Boden überall. Das ist der Fall bei den
   * 1D-Geländen (Presets) und bei alten Replays; der autonome Generator
   * liefert ein Feld mit (`terrainGen3.js`).
   */
  #material = null;
  /**
   * Der Bewegungszustand der Figuren VOR dem Physikschritt.
   *
   * Warum gemerkt: Das Bodenmaterial wirkt NACH dem Physikschritt, und es
   * braucht zwei Werte, die dort schon überschrieben sind — die waagerechte
   * Geschwindigkeit vor der Reibung (für Eis) und das senkrechte Tempo des
   * Aufpralls (für Gummi).
   *
   * entityId → { vx, vy, grounded }
   */
  #bewegung = new Map();
  #water;
  #inventory = new PlayerInventory();
  /**
   * Laufende Zustände (Schild, Einfrieren, Schaden über Zeit, Buffs).
   * Liegt bewusst außerhalb des ECS — konsistent zum Inventar.
   */
  #statuses = new StatusStore();
  /**
   * Waffe je abgefeuertem Projektil, damit beim Einschlag die Wirkung der
   * richtigen Waffe angewendet werden kann. Das Projektil selbst kennt nur den
   * Index der Waffe, nicht ihre ID.
   */
  #shotsInFlight = new Map();
  /**
   * Nachladezeiten je Spieler und Waffe, in ZÜGEN.
   * Schlüssel `${playerId}:${weaponId}` → verbleibende Züge.
   *
   * Warum in Zügen: Der Zug ist die Zeiteinheit des Spiels. Eine Pause in
   * Sekunden hinge an der konfigurierten Zugdauer; „eine Runde aussetzen" ist
   * für den Spieler nachvollziehbar und in Replays stabil.
   */
  #cooldowns = new Map();
  /**
   * Verbrauchte Sprünge je Spieler.
   * Wird beim Landen zurückgesetzt: Ein Doppelsprung steht nur EINMAL je
   * Flugphase zur Verfügung — sonst könnte man sich beliebig hochschaukeln.
   */
  #jumpsUsed = new Map();
  /** Günther — der frei laufende NPC. */
  #guenther = null;
  /** 1 = die Figur war im letzten Schritt in der Luft (für das Lande-Ereignis). */
  #airborne = new Map();
  #maelstrom;
  #loot;
  /**
   * Aufgestellte Geschütze.
   *
   * Bewusst KEINE ECS-Entities: Ein Geschütz bewegt sich nicht, hat keine
   * Gesundheit und wird nicht von Explosionen getroffen — es braucht von einem
   * ECS-Objekt nur eine Position. Als schlichter Eintrag bleibt es außerdem
   * außerhalb der Entity-ID-Wiederverwendung, die in diesem Projekt schon
   * mehrfach Fehler verursacht hat (siehe `#registerSystems`).
   *
   * entityId → { ownerId, teamId, x, y, damage, range, roundsLeft }
   */
  #turrets = new Map();
  /*
   * Hier stand ein Feld `#reichweite` (der Weitenfaktor dieser Karte).
   *
   * FUND (belegt, 2026-09-19): Es trug denselben Namen wie die Skalierung
   * selbst und wurde an drei Stellen mit drei Bedeutungen gelesen — im
   * Spielerschuss gar nicht, im Geschütz als GESCHWINDIGKEITS-Faktor (Weite ×
   * f²) und in der Erreichbarkeitsprüfung als WEITEN-Faktor (× f). Wer eine
   * Karte umstellt, musste alle drei finden.
   *
   * Das Feld ist entfernt. Es gibt jetzt genau zwei benannte Funktionen in
   * `src/shared/reichweite.js` — `geschwindigkeitsFaktor` (für v) und
   * `weitenFaktor` (für x) — und jede Lesestelle ruft die passende auf.
   */

  #players = [];
  #turnOrder = [];
  #turnIndex = 0;
  #turnElapsed = 0;
  #turnDurationMs;
  #round = 1;
  #wind = 0;
  #currentStrength = 0;
  #status = 'lobby';
  #winnerTeamId = null;
  #hasFired = false;
  #appliedDamage = new Map();
  #rng;
  #waterBaseY = 0;
  #lastShotBy = null;

  constructor({
    seed,
    teams = 2,
    playersPerTeam = 1,
    preset = 'hills',
    /*
     * Der Kartentyp des NEUEN Generators (`terrainGen2`).
     *
     * Ohne Angabe bleibt es beim bewährten 1D-Höhenfeld (`preset`). Ist ein
     * Typ gesetzt, baut `erzeugeKarte` eine 2D-Maske — mit Höhlen, Überhängen
     * und schwebenden Inseln, die ein Höhenfeld nicht darstellen kann.
     *
     * Das ist ein Konstruktor-Parameter und keine Konstante, damit Werkzeuge
     * beide Wege vergleichen können, ohne Code zu ändern (dieselbe Haltung wie
     * bei `baseHealth`).
     */
    kartentyp = null,
    maxRounds = 30,
    turnDurationMs = null,
    orientation = 'landscape',
    /**
     * Grundgesundheit vor dem Klassenfaktor. Teil der KONFIGURATION, wie
     * `preset` — sie steht vor dem Start fest und ändert sich nicht.
     *
     * Vorhanden, damit Messwerkzeuge die Wirkung einer Änderung prüfen können,
     * ohne den Quelltext zu verstellen. Ein Replay trägt sie im Kopf.
     */
    baseHealth = BASE_HEALTH,
    /**
     * Sidegrades je Spielerplatz: `['kompakt', null, 'gepanzert']` — Index =
     * Spielerindex wie bei der Platzvergabe (`#spawnPlayers`).
     *
     * Bewusst Teil der KONFIGURATION und nicht des Matchverlaufs: Die Wahl
     * geschieht vor dem Start und ändert sich nicht. Damit ist sie dieselbe
     * Kategorie wie `preset` oder `maxRounds` — kein Zufall, kein eigener
     * Seed-Strom. Ein Replay trägt sie im Kopf und bleibt reproduzierbar.
     *
     * Eine unbekannte Kennung ist tolerierbar und wirkt wie „kein Sidegrade"
     * (siehe `combatProfile`); sie wirft nicht.
     */
    sidegrades = null,
    /**
     * Klasse und Archetyp je Spielerplatz — `[{classId:'scout',archetypeId:'occultist'}, …]`.
     *
     * Ohne Angabe greift die alte Regel (`index % 3` für beide Werte), damit ein
     * Match ohne diese Option exakt wie bisher verläuft. Siehe `resolveLoadout()`
     * in classes.js für die Begründung, warum die Kopplung aufgehoben wurde.
     */
    loadouts = null,
  } = {}) {
    this.#seedManager = seed === undefined
      ? MatchSeedManager.createRandom()
      : new MatchSeedManager(seed);
    this.#rng = this.#seedManager.getSubRng('MATCH_BASE');
    this.#turnDurationMs = turnDurationMs
      ?? MATCH_RULES.turnTimers.duelSeconds.seconds * 1000;
    this.maxRounds = maxRounds;
    /** Grundgesundheit (siehe Konstruktor-Option) — mal Klassenfaktor. */
    this.baseHealth = baseHealth;
    this.preset = preset;
    this.kartentyp = kartentyp;
    /** Sidegrades je Spielerplatz — als Kopie, damit ein Aufrufer sie nicht
     *  nachträglich unter uns verändern kann. */
    this.sidegrades = Array.isArray(sidegrades) ? [...sidegrades] : [];
    /** Loadout-Wahl je Spielerplatz — Kopie, wie bei den Sidegrades. */
    this.loadouts = Array.isArray(loadouts) ? [...loadouts] : [];

    // Kartenmaße als Instanzwerte: Quer- und Hochformat unterscheiden sich nur
    // hier. Alles andere im Motor rechnet mit `this.width`/`this.height`.
    const masse = mapSizeFor(orientation);
    this.orientation = MAP_SIZES[orientation] ? orientation : 'landscape';
    this.width = masse.width;
    this.height = masse.height;

    /**
     * Generative Kulisse (Himmel, Wasser, Ambiente, Landmarken).
     *
     * Aus demselben Seed abgeleitet wie das Gelände, also reproduzierbar: ein
     * Replay zeigt dieselbe Landschaft. Der Server muss die Kulisse deshalb NICHT
     * mitsenden — jeder Client baut sie aus dem Seed selbst.
     */
    /*
     * Die Szene — hier nur die GRUNDLAGE.
     *
     * FUND (belegt): Die Szene hing am Gelände-Preset. Beim autonomen Generator
     * ist `preset` gleich null, weil der Charakter es ersetzt hat — gemessen
     * hatten drei völlig verschiedene Karten dieselbe Bodenfarbe [104,146,86].
     *
     * Der Charakter steht im Konstruktor aber noch NICHT fest: `#buildTerrain`
     * läuft erst in `start()`. Deshalb wird die Szene dort neu gezogen — mit
     * dem Biom aus dem Charakter (siehe `#waehleSzeneAusCharakter`).
     */
    this.scenery = pickScenery(this.#seedManager.baseSeed, preset);
    this.biomId = this.scenery.biomeId;

    /**
     * Günther: eigener Teilgenerator, damit seine Würfe unabhängig von anderen
     * Systemen sind. Ein zusätzlicher Zug an derselben Quelle würde sonst alle
     * nachfolgenden Zufallswerte verschieben.
     */
    this.#guenther = new GuentherSystem({
      rng: this.#seedManager.getSubRng('GUENTHER'),
      maxRounds: this.maxRounds,
      width: this.width,
      height: this.height,
    });

    this.#world = createGameWorld({ playerCount: Math.max(2, teams * playersPerTeam) });
    this.teams = teams;
    this.playersPerTeam = playersPerTeam;

    this.#world.services = {
      events: this.#events,
      inventory: this.#inventory,
      match: {
        round: this.#round,
        wind: this.#wind,
        currentStrength: this.#currentStrength,
        knockbackMultiplier: 1,
        safeInset: 0,
      },
    };
  }

  // ---------------------------------------------------------------- Aufbau

  /** Erzeugt Terrain, Wasser und Spieler und startet das Match. */
  start() {
    this.#buildTerrain();
    /*
     * Jetzt steht der Charakter fest — die Szene wird danach neu gezogen.
     *
     * Die Reihenfolge ist der Punkt: Im Konstruktor gibt es noch kein Gelände,
     * also auch keinen Charakter. Erst hier ist bekannt, ob die Karte eine
     * Küste, eine Kaverne oder ein Gebirge ist — und welche Szene dazu gehört.
     */
    this.#waehleSzeneAusCharakter();
    this.#buildWater();
    this.#registerSystems();
    this.#spawnPlayers();
    this.#pruefeErreichbarkeit();
    this.#world.services.match.wind = this.#rollWind();
    this.#wind = this.#world.services.match.wind;
    this.#spawnRoundLoot();
    this.#status = 'playing';
    this.#beginTurn(0);
    return this;
  }

  /**
   * Prüft, ob jede Figur erreichbar steht.
   *
   * ## Warum diese Prüfung im Match und nicht im Generator
   *
   * Der Generator kennt die Karte, aber nicht die **Standpositionen** der
   * Figuren — die entstehen erst beim Aufstellen (`#spawnPlayers`). Eine
   * Erreichbarkeitsprüfung ohne Figuren wäre eine Prüfung der Karte, nicht des
   * Spiels: Zwei Karten mit denselben Flächen können spielbar oder unspielbar
   * sein, je nachdem, wo die Figuren landen.
   *
   * ## Warum sie NICHT neu würfelt
   *
   * Die Prüfung meldet nur. Ein Neuwurf an dieser Stelle würde die
   * Determinismus-Kette brechen: Der Generator hat seinen Seed bereits
   * aufgebraucht, und ein zweiter Versuch müsste denselben Zufall erneut
   * anfassen — auf Server und Client getrennt, mit der Gefahr, dass beide
   * verschiedene Ergebnisse bekommen.
   *
   * Stattdessen geht das Ergebnis in den Zustand: Ein Werkzeug oder eine
   * spätere Auswertung kann darauf zugreifen, und ein Spieler, der auf einer
   * unerreichbaren Insel sitzt, lässt sich damit identifizieren.
   */
  /**
   * Die Terrain-Maske — für Werkzeuge, die sie prüfen wollen.
   *
   * Öffentlich, weil eine Erreichbarkeits- oder Höhlenanalyse von außen
   * dieselbe Maske braucht, die der Motor nutzt. Eine Kopie wäre eine zweite
   * Wahrheit.
   *
   * @returns {Uint8Array}
   */
  get bitmap() { return this.#bitmap; }

  #pruefeErreichbarkeit() {
    if (this.kartentyp !== 'autonom') return;

    /*
     * Die Standpositionen holen.
     *
     * FUND (belegt, eigener Fehler): Ein erster Anlauf rief
     * `getComponent(id, 'Position')` ohne Feldnamen — das wirft
     * `Cannot read properties of undefined`. Die Komponente wird im ECS
     * **feldweise** abgefragt (`getComponent(id, 'Position', 'x')`), so wie es
     * an allen anderen Stellen im Modul geschieht.
     */
    const figuren = [];
    for (const eintrag of this.#players) {
      if (!eintrag.alive) continue;
      const x = this.#world.getComponent(eintrag.entityId, 'Position', 'x');
      const y = this.#world.getComponent(eintrag.entityId, 'Position', 'y');
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      figuren.push({ x, y, teamId: eintrag.teamId });
    }
    if (figuren.length < 2) return;

    /*
     * Die größte Wurfweite — aus den Werten, die der Motor wirklich nutzt.
     *
     * Geholt statt gesetzt: `POWER_TO_SPEED` (die Umrechnung Kraft →
     * Geschwindigkeit) und `DEFAULT_PROJECTILE_GRAVITY` (die Schwerkraft des
     * Projektilsystems). Die Höchstkraft ist 100 — sie steht im Client
     * (`Math.min(100, ...)` in `main.js`) und im Turm. Ein fest eingetragener
     * Wert hier würde bei einer Änderung still falsch.
     */
    const wurfweite = maxWurfweite({
      powerToSpeed: POWER_TO_SPEED,
      maxPower: HOHECHSTE_KRAFT,
      gravity: DEFAULT_PROJECTILE_GRAVITY,
    }) * weitenFaktor(this.width);

    const urteil = pruefeErreichbarkeit({
      bitmap: this.#bitmap, width: this.width, height: this.height, figuren, wurfweite,
    });

    /*
     * Die Abstände zum nächsten Gegner gehen mit in den Zustand.
     *
     * Sie sind die Zahl, die über Spielbarkeit entscheidet — nicht der Abstand
     * der äußersten Figuren. Wer am Zug ist, schlägt auf den NÄCHSTEN Gegner;
     * ob der in Reichweite liegt, ist die Frage.
     */
    const abstaende = abstandZumNaechstenGegner(figuren);
    const weiteste = abstaende.filter(d => Number.isFinite(d));

    this.erreichbarkeit = {
      ok: urteil.ok,
      grund: urteil.grund,
      wurfweite,
      naechsterGegner: weiteste.length > 0 ? Math.max(...weiteste) : null,
    };
    if (!urteil.ok) {
      this.#events.emit('karte_unerreichbar', {
        grund: urteil.grund,
        figuren: figuren.length,
      });
    }
  }

  /**
   * Zieht die Szene neu — mit dem Biom, das zum Charakter der Karte passt.
   *
   * ## Warum das nicht im Konstruktor geht
   *
   * FUND (belegt, eigener Fehler): Der erste Anlauf setzte die Szene im
   * Konstruktor und las `this.kartencharakter` — ein Feld, das zu diesem
   * Zeitpunkt noch nicht existiert. `#buildTerrain` läuft erst in `start()`.
   * Gemessen wurden deshalb **24 von 24 Karten** zum Wald: Das Biom fiel
   * immer auf die Vorgabe zurück.
   *
   * ## Die Regel
   *
   * Das Biom kommt aus dem Charakter (Wasser → Überschwemmung, Höhlung →
   * Kavernen, Inseligkeit → Inseln, Steilheit → Gebirge, sonst Wald). Der
   * Seed wählt nur noch die Variante innerhalb dieses Bioms — dieselbe
   * Aufteilung wie bei der Kulissenwahl, nur mit dem Charakter als Quelle
   * statt dem Gelände-Preset.
   */
  #waehleSzeneAusCharakter() {
    if (!this.kartencharakter) return null;

    const biomId = biomeKennungFuerCharakter(this.kartencharakter);
    this.biomId = biomId;
    this.scenery = pickScenery(this.#seedManager.baseSeed, this.preset, biomId);
    return this.scenery;
  }

  #buildTerrain() {
    /*
     * Delegiert an `engine/terrainBuilder.js` — das rein funktionale
     * `baueTerrain(quelle)` erledigt die Arbeit. Der Match-Delegator
     * benennt jede Eingabe, die der Terrain-Bau liest.
     *
     * Die Kollisionsmaske entsteht HIER, nicht im Builder: Sie ist der
     * Produktivpfad der Kollision und gehört damit dem Motor. Der Builder
     * liefert die Bitmap — dieselben Daten zweimal auszuwerten wäre eine
     * zweite Rechnung und eine zweite Wahrheit (siehe dortiger Modulkopf).
     */
    const ergebnis = baueTerrain({
      seedManager: this.#seedManager,
      width: this.width,
      height: this.height,
      kartentyp: this.kartentyp,
      preset: this.preset,
      events: this.#events,
      statuses: this.#statuses,
      handleProjectileImpact: payload => this.#handleProjectileImpact(payload),
      world: this.#world,
    });

    this.#bitmap = ergebnis.bitmap;
    this.#oberflaeche = new Int32Array(this.width).fill(OBERFLAECHE_UNBEKANNT);
    this.#terrain = CollisionMask.fromBitmap(this.#bitmap, this.width, this.height);
    this.#material = ergebnis.material;
    this.kartencharakter = ergebnis.kartencharakter;
    this.kartenkennzahlen = ergebnis.kartenkennzahlen;
    this.#waterBaseY = ergebnis.waterBaseY;

    this.#world.services.damageModifier = ergebnis.services.damageModifier;
    this.#world.services.onProjectileImpact = ergebnis.services.onProjectileImpact;

    this.#world.services.terrain = this.#terrain;
    this.#world.services.terrainScale = 1;
  }

  #buildWater() {
    const waterLevel = this.#waterBaseY ?? Math.floor(this.height * 0.84);
    this.#water = new WaterField({
      width: Math.floor(this.width / WATER_SCALE),
      height: Math.floor(this.height / WATER_SCALE),
      isSolid: (x, y) => this.#terrain.isSolid(x * WATER_SCALE, y * WATER_SCALE),
      // Brücke zwischen Rasterzellen und Weltpixeln, damit Physik und
      // Charaktere den Wasserstand an einer Weltkoordinate abfragen können.
      worldScale: WATER_SCALE,
    });
    // Becken bis zum Wasserspiegel fluten.
    const levelInGrid = Math.floor(waterLevel / WATER_SCALE);
    const widthInGrid = this.#water.width;
    const heightInGrid = this.#water.height;
    for (let y = levelInGrid; y < heightInGrid; y++) {
      for (let x = 0; x < widthInGrid; x++) {
        if (!this.#terrain.isSolid(x * WATER_SCALE, y * WATER_SCALE)) {
          this.#water.setLevel(x, y, 1);
        }
      }
    }
    this.#world.services.water = this.#water;
  }

  #registerSystems() {
    this.#maelstrom = new MaelstromSystem({ rng: this.#seedManager.getSubRng('EFFECTS') });
    this.#loot = new LootSystem({ rng: this.#seedManager.getSubRng('LOOT') });
    /*
     * Todesmeldung mitschreiben — statt `isActive` zu befragen.
     *
     * Fund (belegt): Das ECS vergibt die IDs entfernter Entities neu. Eine
     * gefallene Spielfigur bekam deshalb wieder eine „aktive" ID, sobald eine
     * Kiste oder ein Geschoss den Platz erbte. `world.isActive(spielerId)` war
     * danach wahr — obwohl dort längst eine Kiste lag. Folgen:
     *   - `#checkVictory` hielt ein ausgelöschtes Team für lebendig und das
     *     Match endete nie durch Ausschaltung (es lief bis zur Rundengrenze),
     *   - die Anzeige meldete eine gefallene Figur als lebendig mit 0 Leben,
     *   - Zugfolge und Kommandoprüfung konnten einen Toten für aktiv halten.
     *
     * Der Lebensstatus gehört deshalb an den Spieler, nicht an einen
     * wiederverwendbaren Platz im ECS.
     */
    this.#world.getSystem('damage')?.onDeath?.((world, entityId) => {
      const eintrag = this.#players.find(p => p.entityId === entityId);
      if (eintrag) eintrag.alive = false;
    });
    this.#world.registerSystem('projectile', new ProjectileSystem(), SYSTEM_PRIORITIES.PROJECTILE);
    this.#world.registerSystem('character', new CharacterSystem(), SYSTEM_PRIORITIES.CHARACTER);
    this.#world.registerSystem('maelstrom', this.#maelstrom, SYSTEM_PRIORITIES.MAELSTROM);
    this.#world.registerSystem('loot', this.#loot, SYSTEM_PRIORITIES.LOOT);
    this.#world.services.maelstrom = this.#maelstrom;
  }

  /**
   * Sucht eine Startposition auf festem, nicht überflutetem Grund.
   *
   * Gesucht wird abwechselnd nach rechts und links vom Wunschpunkt, in festen
   * Schritten. Die Reihenfolge ist festgelegt (rechts vor links, kleine vor
   * großen Abständen), damit die Platzierung bei gleichem Seed dieselbe bleibt —
   * der Determinismus des Matches hängt daran.
   *
   * Maßstab ist `WET_LEVEL`: Eine Figur, die nur „nass" startet, ist spielbar;
   * eine untergetauchte ertrinkt, bevor der erste Zug beginnt.
   *
   * Wird nichts gefunden, bleibt es beim Wunschpunkt. Ein schlechter Platz ist
   * besser als gar keiner — und ein Fehlen wird im Test auffallen.
   *
   * @param {number} idealX
   * @returns {number} x-Position mit festem, trockenem Boden
   */
  #drySpawnX(idealX) {
    const trocken = x => {
      if (x < PLAYER_HALF_WIDTH + 2 || x > this.width - PLAYER_HALF_WIDTH - 2) return false;
      const boden = this.surfaceYAt(x);
      if (boden <= 0) return false;
      if (this.waterLevelAt(x, boden) >= WET_LEVEL) return false;
      /*
       * Der KÖRPER steht höher als die Füße.
       *
       * FUND (belegt, gemessen 2026-09-19): Geprüft wurde nur der Fußpunkt. Bei
       * flachem Wasser meldet er „trocken", während der Körper bis zur Schulter
       * unter Wasser steht — die Figur startete untergetaucht (gemessen über den
       * Menüweg: 19 von 60 Seeds mit `waterLevel = 1`; über den API-Weg ohne
       * `kartentyp` kein einziger Fall). Beispiel Seed 5, Figur 0: Wasser am
       * Fußpunkt 0, am Körper 1.
       */
      const kopf = boden - PLAYER_HALF_HEIGHT - 2;
      return this.waterLevelAt(x, kopf) < WET_LEVEL;
    };

    if (trocken(idealX)) return idealX;
    /*
     * Über die ganze Kartenbreite suchen, nicht nur bis zur Mitte.
     *
     * Auf einer Karte mit viel Wasser (Form `flooded`: rund 45 % Wasser) liegt
     * die nächste trockene Stelle unter Umständen weit entfernt. Mit einer
     * Begrenzung auf die halbe Breite blieb gemessen 1 von 480 Figuren
     * (40 Seeds × 12 Figuren) im Wasser — mit der vollen Breite keine.
     *
     * Die Suche läuft nur, wenn der Wunschplatz nass ist, und die Prüfung ist
     * ein Höhenprofil-Zugriff. Beim Matchstart fällt das nicht ins Gewicht.
     */
    const grenze = this.width - PLAYER_HALF_WIDTH - 2;
    for (let abstand = 8; abstand < grenze; abstand += 8) {
      if (trocken(idealX + abstand)) return idealX + abstand;
      if (trocken(idealX - abstand)) return idealX - abstand;
    }
    return idealX;
  }

  /**
   * Stellt die Spieler auf — ein reiner Delegator.
   *
   * ## Schritt 4: Delegation nach engine/spawnManager.js
   *
   * Der Rumpf stand hier 96 Zeilen lang und griff in private Felder (Welt,
   * Inventar, Spielerliste, Zugfolge). Er liegt jetzt als reine Funktion
   * `erzeugeSpieler(quelle)` in `engine/spawnManager.js` — nach demselben
   * Muster wie `stateSnapshot.js` (W1-4a) und `shooting.js` (W1-4b):
   * `#spawnQuelle()` benennt jede Angabe, die das Aufstellen liest.
   *
   * Die Quelle liefert die fertigen Spieler-Einträge als Rückgabe; die
   * Zugfolge entsteht daraus (Entity-Kennung je Eintrag), damit die Funktion
   * die Klassen-Arrays nicht selbst anfassen muss.
   */
  #spawnPlayers() {
    const eintraege = erzeugeSpieler(this.#spawnQuelle());
    this.#players.push(...eintraege);
    this.#turnOrder.push(...eintraege.map(eintrag => eintrag.entityId));
  }

  #spawnRoundLoot() {
    try {
      this.#loot.spawnRoundCrates(this.#world, {
        rng: this.#seedManager.getSubRng('LOOT'),
        width: this.width,
        height: this.height,
        surfaceYFor: x => this.surfaceYAt(x),
      });
    } catch (error) {
      this.#events.emit('loot_error', { message: error.message });
    }
  }

  // ------------------------------------------------------------- Simulation

  /** Ein Simulationsschritt mit fester Zeitschrittweite. */
  step(dt = 1000 / 60) {
    if (this.#status !== 'playing') return this.getState();

    this.#turnElapsed += dt;
    // Fliegende Kisten bewegen sich VOR dem Physikschritt: sie sollen im selben
    // Tick landen, in dem sie den Boden berühren.
    this.#stepFlyingCrates();
    /*
     * Bodenmaterial, Teil 1: den Bewegungszustand VOR dem Schritt merken.
     *
     * Das Material wirkt nach dem Schritt (siehe `#wendeBodenmaterialAn`) —
     * zu diesem Zeitpunkt sind Reibung und Aufprall aber schon verrechnet.
     * Der Zustand von vorher ist die einzige Quelle für „wie schnell war die
     * Figur wirklich".
     */
    this.#merkeBewegung();
    this.#world.step();
    // Nach dem Physikschritt prüfen, wer gelandet ist — davon hängt ab, ob ein
    // Doppelsprung wieder zur Verfügung steht.
    this.#updateGroundedState();
    // Bodenmaterial, Teil 2: DIE EINE Stelle, an der es gelesen und angewandt wird.
    this.#wendeBodenmaterialAn();

    // Günther bewegt sich nach der Physik: Er läuft auf der Oberfläche, die
    // sich in diesem Schritt geändert haben kann.
    this.#stepGuenther();
    // KEIN `drain()` hier: das würde die Warteschlange leeren und die
    // Ereignisse an die Push-Handler verteilen, bevor der Konsument sie lesen
    // kann. Der Client und der Server holen sie über `consumeEvents()`; die
    // Push-API wird im Projekt nicht verwendet. Mit `drain()` gingen alle
    // Ereignisse aus der Simulation verloren — Explosionen wurden nicht
    // gezeichnet, Treffer nicht protokolliert und die Spezialeffekte nie
    // gemeldet.
    this.#checkVictory();

    const projectilesActive = this.activeProjectileCount > 0;
    if (this.#turnElapsed >= this.#turnDurationMs || (this.#hasFired && !projectilesActive)) {
      this.endTurn();
    }
    return this.getState();
  }

  /**
   * Steht die Figur auf festem Grund?
   *
   * Geprüft wird ein Punkt knapp UNTER den Füßen. Ohne diese Aussage gäbe es
   * keinen Unterschied zwischen „steht" und „fällt", und ein Sprung aus der Luft
   * wäre ein zweiter Absprung mitten im Flug.
   */
  isGrounded(playerId) {
    if (!this.isPlayerAlive(playerId)) return false;
    const x = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;
    const vy = this.#world.getComponent(playerId, 'Velocity', 'y') ?? 0;
    // Aufwärtsbewegung heißt: nicht am Boden, egal was darunter liegt.
    if (vy < -0.5) return false;
    // `y` ist die FUSSPOSITION. Der tiefste Punkt des Körpers liegt
    // PLAYER_HALF_HEIGHT darunter, und genau dort entscheidet die Landung. Ein
    // Prüfpunkt knapp unter den Füßen (y+2) liegt noch in der Luft: das Terrain
    // beginnt erst eine halbe Körperhöhe unter der Fußlinie, weil die Figur auf
    // seiner Oberkante steht.
    const tiefster = Math.floor(y + PLAYER_HALF_HEIGHT - 1);
    return this.#terrain.isSolid(Math.floor(x), tiefster);
  }

  /**
   * Verbleibende Sprünge — seit der Entscheidung „Sprung kann man unendlich"
   * immer `null` („unbegrenzt").
   *
   * Die Methode hat keinen Zähler mehr, sondern EINEN Wahrheitswert zu melden:
   * Es gibt keine endliche Zahl verbleibender Sprünge. Vorher rechnete sie
   * `2 - verbraucht`; mit entfallener Obergrenze wäre jede Zahl falsch —
   * `0` läse sich als „keine mehr übrig" (genau das Gegenteil), `1`/`2` als
   * Obergrenze, die es nicht mehr gibt.
   *
   * Warum `null` und nicht `Infinity`: siehe `SPRUENGE_UNBEGRENZT`.
   * Die Begründung der Regel und die Messung zur Fallschaden-Bremse stehen in
   * `docs/sprung-regel.md`.
   *
   * @param {number} playerId
   * @returns {null} immer `null` — „unbegrenzt"
   */
  jumpsLeft(playerId) {
    // Der Parameter bleibt: Aufrufer (Debug-API, Tests) fragen weiter je Spieler
    // und `null` gilt für jeden. Kein `undefined`, damit die Prüfung „Feld
    // vorhanden, Wert aber keine Zahl" im Client eindeutig bleibt.
    void playerId;
    return SPRUENGE_UNBEGRENZT;
  }

  /**
   * Die Beweglichkeit eines Spielers als Faktor auf den Absprung.
   *
   * Der Wert kommt aus dem KAMPFPROFIL (`combatProfile().mobilityMultiplier`),
   * das ihn aus den Klassendaten ableitet — `match.js` liest die Rohdaten damit
   * nicht selbst. Genau das verlangt `tests/class-profile.test.js` („Eine Stelle
   * nur"); der erste Anlauf dieser Änderung griff direkt auf `CLASS_DEFINITIONS`
   * zu und wurde vom Test zu Recht beanstandet.
   *
   * ## Warum getrennt gedämpft
   *
   * Die Sprunghöhe wächst mit dem QUADRAT des Impulses, deshalb schlägt der rohe
   * Klassenwert überproportional durch: `speed` 1,2 ergäbe +125 % gegenüber dem
   * Heavy (138,5 gegen 61,6 px) — der Scout käme auf `open` überall hin.
   *
   *   - Werte ÜBER 1,0 werden mit 0,50 gedämpft: Der Scout landet bei 116,9 px,
   *     klar höher als alle anderen, aber unter dem Höhenunterschied von `hills`
   *     (rund 151 px). Er kommt also nicht über das Gelände hinweg.
   *   - Werte UNTER 1,0 werden mit 0,25 gedämpft: Heavy und Artillery sind über
   *     Leben und Wucht definiert; ihnen zusätzlich die Sprunghöhe zu nehmen
   *     würde eine Schwäche verschärfen, ohne eine Stärke zu schaffen.
   *
   * Die Zahlen samt Messung stehen bei den Konstanten `JUMP_SPEED_INFLUENCE_*`.
   *
   * @param {number} playerId
   * @returns {number} Faktor für den Abschlagimpuls (1,0 = unverändert)
   */
  #mobilityFactor(playerId) {
    const player = this.#players.find(entry => entry.entityId === playerId);
    const profil = combatProfile(
      CLASS_IDS[player?.classId ?? 0], ARCHETYPE_IDS[player?.archetypeId ?? 0],
      player?.sidegradeId ?? null,
    );
    const abweichung = profil.mobilityMultiplier - 1;
    const dampf = abweichung >= 0 ? JUMP_SPEED_INFLUENCE_ABOVE : JUMP_SPEED_INFLUENCE_BELOW;
    return 1 + abweichung * dampf;
  }

  /**
   * Springt — als Aktion des Zuges.
   *
   * Der Sprung ist eine echte Physik: er setzt einen senkrechten Impuls, die
   * Figur fliegt danach unter Schwerkraft und landet. Fallschaden greift wie bei
   * jedem Sturz.
   *
   * ## Unbegrenzt springen — der Fallschaden ist die Bremse
   *
   * „nein sprung kann man unendlich" (Entscheidung des Auftraggebers). Die
   * frühere Grenze von zwei Sprüngen je Zug ist ENTFALLEN; geblieben ist allein
   * die Bodenregel für den ERSTEN Sprung: Sie begrenzt, WIE eine Sprungfolge
   * BEGINNT, nicht wie viele folgen.
   *
   * Jeder Sprung IN DER LUFT legt 3 px/Takt Aufpralltempo zu. Gemessen über
   * drei Seeds identisch: 1 Sprung 0 Schaden · 3 Sprünge 22 · 10 Sprünge ~90 von
   * 96 · 200 Sprünge tödlich; Geländekanten bleiben bei 0. Belege und die
   * Formel: `docs/fallschaden-bremse.md`, die Zahlen in
   * `src/shared/config/fallschaden.js`.
   *
   * Der Sprung beendet den Zug NICHT: ein Luft-Sprung setzt voraus, dass der
   * Spieler während seines eigenen Flugs noch am Zug ist.
   *
   * @param {number} playerId
   * @param {number} [horizontal] - seitliche Richtung: -1, 0 oder 1
   * @returns {{ok:boolean, jumpsLeft?:null, double?:boolean, impulse?:number, errors?:string[]}}
   */
  jump(playerId, horizontal = 0) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match läuft nicht');
    if (playerId !== this.activePlayerId) errors.push('Nur der aktive Spieler kann springen');
    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
    if (errors.length > 0) return { ok: false, errors };

    const grounded = this.isGrounded(playerId);
    const verbraucht = this.#jumpsUsed.get(playerId) ?? 0;

    /*
     * Der ERSTE Sprung eines Zuges geht nur vom Boden.
     *
     * Das ist die einzige gebliebene Grenze — und sie grenzt nicht die ZAHL der
     * Sprünge ein, sondern ihren ANFANG: Ohne sie wäre ein Absprung mitten im
     * Flug ein gültiger „erster" Sprung, der Bodenkontakt hätte für die Mechanik
     * keine Bedeutung mehr, und dieselbe Figur könnte aus jeder Fallhöhe
     * heraus nachspringen.
     *
     * Der Zähler wird weiterhin beim Zugbeginn zurückgesetzt: Die Regel gilt je
     * Zug, nicht je Flugphase.
     */
    if (!grounded && verbraucht === 0) {
      return { ok: false, errors: ['In der Luft ist kein erster Sprung möglich'] };
    }
    // Die frühere Grenze `if (verbraucht >= 2) return 'Keine Sprünge mehr …'`
    // ist entfallen — siehe die Messung im Kopf dieser Methode.

    const istDoppel = !grounded;

    // Verlangsamung wirkt auf den Absprung: Wer in einen Kackhaufen getreten ist,
    // kommt schlechter vom Boden weg.
    const langsam = this.#statuses.slowOf(playerId);
    /*
     * Die Beweglichkeit der Klasse wirkt auf den Absprung.
     *
     * Sie kommt aus dem KAMPFPROFIL (`mobilityMultiplier`), nicht aus den
     * Rohdaten: Genau das verlangt `tests/class-profile.test.js` („Eine Stelle
     * nur") — `match.js` darf Klassenwerte nicht selbst verrechnen. Der erste
     * Anlauf dieser Änderung tat es und wurde vom Test zu Recht beanstandet.
     *
     * Der Faktor hängt NUR an der Klasse, nicht am Zustand. Der Client kennt die
     * Klasse jedes Spielers (`getState()` überträgt `classId`) und kann die Bahn
     * eines Sprungs damit gleich mitrechnen.
     */
    const beweglichkeit = this.#mobilityFactor(playerId);

    const impuls = JUMP_IMPULSE * (istDoppel ? DOUBLE_JUMP_FACTOR : 1) * langsam * beweglichkeit;
    const richtung = Math.max(-1, Math.min(1, Number(horizontal) || 0));

    this.#world.setComponent(playerId, 'Velocity', 'y', -impuls);
    if (richtung !== 0) {
      const vxAlt = this.#world.getComponent(playerId, 'Velocity', 'x') ?? 0;
      this.#world.setComponent(playerId, 'Velocity', 'x', vxAlt + richtung * JUMP_SIDE_IMPULSE);
    }

    this.#jumpsUsed.set(playerId, verbraucht + 1);

    /*
     * Ein Sprung IN DER LUFT ist Schuld — er wird beim Aufprall abgerechnet.
     *
     * Warum das gemeldet wird und nicht hier verrechnet: Der Fallschaden
     * entsteht in `characterSystem.js` (Schwelle, Skala, Aufpralltempo), und
     * „eine Regel, eine Stelle" heißt hier: Der Motor meldet das EREIGNIS
     * („es wurde ein Luft-Sprung angesetzt"), das System rechnet die FOLGE.
     * Die Zahlen selbst stehen in `src/shared/config/fallschaden.js`.
     *
     * Der Bodensprung meldet nichts: Er hat Boden unter sich, die Höhe ist
     * bezahlt. Nur der Luft-Sprung SETZT `vy` neu (statt zu addieren) und
     * schenkt damit Höhe, die die Figur nicht hat.
     */
    if (istDoppel) this.#world.getSystem('character')?.meldeLuftsprung(playerId);

    /*
     * `jumpsLeft` ist mit entfallener Obergrenze KEINE Zahl mehr: `null` heißt
     * „unbegrenzt". Der Wert sieht in beiden Betriebsarten gleich aus — im
     * Netzspiel geht dieses Feld als JSON über die Leitung, und `Infinity` würde
     * dort zu `null` (siehe `SPRUENGE_UNBEGRENZT`).
     *
     * Die Anzeige braucht das Feld nicht: Sie unterscheidet „Sprung" und
     * „Doppelsprung" an `double` (vom Boden / in der Luft), und diese
     * Unterscheidung bleibt richtig, egal wie oft danach noch gesprungen wird.
     */
    this.#events.emit('jumped', {
      playerId, double: istDoppel, impulse: impuls, jumpsLeft: SPRUENGE_UNBEGRENZT,
    });

    // Der Sprung beendet den Zug NICHT.
    //
    // Grund: Ein Sprung in der Luft setzt voraus, dass der Spieler während seines
    // eigenen Flugs noch am Zug ist. Beendete der erste Sprung den Zug, wäre der
    // zweite nie auslösbar — die Mechanik hätte sich selbst ausgeschlossen.
    // Eine Obergrenze je Zug gibt es nicht mehr (siehe Kopf dieser Methode).
    return { ok: true, jumpsLeft: SPRUENGE_UNBEGRENZT, impulse: impuls, double: istDoppel };
  }

  /**
   * Bewegt Günther einen Schritt und wendet seine Wirkungen an.
   *
   * Läuft NACH dem Physikschritt: Er folgt der Geländeoberfläche, und die kann
   * sich in diesem Schritt geändert haben (Einschlag, Mahlstrom).
   */
  #stepGuenther() {
    if (!this.#guenther) return;
    this.#guenther.setRunde(this.#round);

    const spielerIds = this.#players
      .filter(p => p.alive)
      .map(p => p.entityId);

    this.#guenther.update(this.#world, {
      aktiverSpieler: this.#turnOrder?.length ? this.activePlayerId : null,
      spielerIds,
      surfaceYAt: x => this.surfaceYAt(x),
      schaden: (spielerId, betrag) => {
        this.#world.getSystem('damage')?.applyDamage(this.#world, spielerId, betrag, null);
      },
      haufenGetroffen: (spielerId) => {
        // Drei Runden Schaden und langsamere Fortbewegung.
        this.#statuses.addDot(spielerId, {
          damagePerTurn: GUENTHER_POOP.damagePerTurn,
          turns: GUENTHER_POOP.turns,
          element: 'poop',
        });
        this.#statuses.addSlow(spielerId, GUENTHER_POOP.slowFactor, GUENTHER_POOP.turns);
      },
      radAufloesen: spielerId => this.#resolveGuentherWheel(spielerId),
      melde: (typ, daten) => this.#events.emit(typ, daten),
    });
  }

  /**
   * Meldet, wenn eine Figur den Boden berührt.
   *
   * Setzt die Sprünge NICHT zurück — das geschieht beim Zugbeginn. Hier geht es
   * nur um das Ereignis, damit die Anzeige „gelandet" melden kann.
   */
  #updateGroundedState() {
    for (const entry of this.#players) {
      if (!entry.alive) continue;
      const warInDerLuft = this.#airborne.get(entry.entityId) === 1;
      const stehtJetzt = this.isGrounded(entry.entityId);
      if (warInDerLuft && stehtJetzt) {
        this.#events.emit('landed', { playerId: entry.entityId });
      }
      this.#airborne.set(entry.entityId, stehtJetzt ? 0 : 1);
    }
  }

  // -------------------------------------------------------- Bodenmaterial

  /**
   * Das Bodenmaterial an einer Weltposition.
   *
   * DIE EINE Lesestelle: Hier — und nur hier — legt der Motor das Materialfeld
   * aus. Ohne Feld (`null`: 1D-Gelände, alte Replays) ist der Boden Erde.
   * Die Begründung des Verfahrens steht in `terrainGen3.js`, die Werte in
   * `config/terrain.js`.
   */
  materialAt(x, y) {
    return materialAmPunkt(this.#material, x, y);
  }

  /** Das Materialfeld dieser Karte — für Werkzeuge, `null` bei 1D-Gelände. */
  get terrainMaterial() { return this.#material; }

  /** Bewegungszustand vor dem Physikschritt merken (das Material wirkt danach). */
  #merkeBewegung() {
    for (const entry of this.#players) {
      if (!entry.alive) continue;
      this.#bewegung.set(entry.entityId, {
        vx: this.#world.getComponent(entry.entityId, 'Velocity', 'x') ?? 0,
        vy: this.#world.getComponent(entry.entityId, 'Velocity', 'y') ?? 0,
        grounded: this.isGrounded(entry.entityId),
      });
    }
  }

  /**
   * Wendet die Physik des Bodenmaterials an — beim Aufsetzen und beim Bewegen.
   *
   * EIS rutscht (die Bodenreibung des Schritts wird anteilig zurückgenommen,
   * nie über den gemerkten Wert hinaus — Eis beschleunigt nicht). GUMMI federt
   * (ein Teil des Aufpralltempos kommt als senkrechter Impuls zurück, ab
   * `RUECKPRALL_MINDESTTEMPO`, damit das Federn ausklingt). Beides ohne Zufall
   * und ohne Uhr.
   *
   * ## Warum es dazu KEIN Ereignis gibt
   *
   * Naheliegend wären `boden_rutschig`/`boden_rueckprall`. Sie unterbleiben
   * bewusst: `tests/event-coverage.test.js` verlangt, dass JEDES
   * Engine-Ereignis einen Behandlungszweig in der Anzeige hat — ein Ereignis
   * ohne Zweig wäre eine stumme Stelle, genau der Fehler, den jener Test
   * festhält. Die Anzeige zu erweitern stand hier nicht zur Verfügung, also
   * wird auch nichts gemeldet. Der Boden ist über Position und Geschwindigkeit
   * der Figur sichtbar; ein eigenes Ereignis braucht er nicht.
   */
  #wendeBodenmaterialAn() {
    for (const entry of this.#players) {
      if (!entry.alive) continue;
      const vorher = this.#bewegung.get(entry.entityId);
      if (!vorher) continue;

      const x = this.#world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
      const y = this.#world.getComponent(entry.entityId, 'Position', 'y') ?? 0;
      /*
       * Gelesen wird die BODENZEILE, nicht die Fußlinie.
       *
       * FUND (belegt, eigener Fehler): Zuerst stand hier `y`. Das ist die
       * Fußlinie — und die schwankt im Betrieb um einige Pixel (das
       * CharacterSystem setzt eine landende Figur auf `Oberfläche − halbe
       * Höhe`, die Schwerkraft zieht sie im nächsten Schritt wieder herunter).
       * Gemessen lag eine Figur dabei abwechselnd bei y=702 und y=711; bei
       * einer Materialzelle von 64 px fiel sie damit von einer Zelle in die
       * nächste, und derselbe Boden meldete einmal „Gummi" und einmal „Eis".
       *
       * `y + PLAYER_HALF_HEIGHT` ist der tiefste Punkt des Körpers — dort
       * berührt er den Grund. Diese Zeile ist über die ganze Schwankung
       * dieselbe.
       */
      const material = this.materialAt(x, y + PLAYER_HALF_HEIGHT);
      if (material.id === TERRAIN_MATERIAL.NORMAL) continue;

      const stehtJetzt = this.isGrounded(entry.entityId);

      if (material.rutschigkeit > 0 && stehtJetzt) {
        const vx = this.#world.getComponent(entry.entityId, 'Velocity', 'x') ?? 0;
        const neu = vx + (vorher.vx - vx) * material.rutschigkeit;
        this.#world.setComponent(entry.entityId, 'Velocity', 'x', neu);
      }

      if (material.rueckprall > 0 && !vorher.grounded && stehtJetzt
        && vorher.vy > RUECKPRALL_MINDESTTEMPO) {
        const impuls = vorher.vy * material.rueckprall;
        this.#world.setComponent(entry.entityId, 'Velocity', 'y', -impuls);
      }
    }
  }

  /**
   * Startpunkt und Geschwindigkeit für eine Anflugart.
   *
   * Für `self` gibt die Methode `null` zurück — dann gilt der normale Weg.
   *
   * `sky`: Das Geschoss entsteht oberhalb des Zielpunkts und fällt herab. Der
   *   Zielpunkt wird aus der normalen Zielung bestimmt (Winkel und Kraft), nicht
   *   aus der Schützenposition: ein Luftangriff soll dort einschlagen, wohin der
   *   Schütze zielt.
   * `flank`: Das Geschoss kommt von der Seite, entgegen der Schussrichtung, und
   *   fliegt waagerecht auf den Zielpunkt zu.
   *
   * In beiden Fällen liegt der Startpunkt AUSSERHALB der Sehweite, damit der
   * Angriff sichtbar „hereinfliegt" statt vor dem Spieler zu erscheinen.
   *
  /**
   * Löst einen Ausgang des Glücksrads aus.
   *
   * Ausgewürfelt wird im GuentherSystem, angewendet hier: Das Rad braucht Zugriff
   * auf Inventar, Zustände und Schaden — alles Dinge, die der NPC nicht kennt.
   *
   * @returns {{outcome:string, label:string, detail:string, effect:string}}
   */
  #resolveGuentherWheel(playerId) {
    const ausgang = this.#guenther.wuerfleAusgang();
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
        this.#statuses.freeze(playerId, wirkung.turns);
        break;

      case 'skipAndWeapon': {
        this.#statuses.freeze(playerId, wirkung.turns);
        const waffe = this.#guenther.waehleWaffe(LOW_RARITY_WEIGHTS);
        if (waffe) {
          if (!this.#inventory.has(playerId, waffe.id)) {
            this.#inventory.grantWeapon(playerId, waffe.id);
          } else {
            /*
             * Schon im Besitz: Munition nachfüllen statt einer wirkungslosen
             * Gabe.
             *
             * FUND (belegt): Hier stand `this.#inventory.refill(...)` — diese
             * Methode gibt es nicht. Die richtige heißt `grantAmmo`. Der Aufruf
             * lief nur, wenn der Spieler die Waffe SCHON hatte — also im
             * Zweifelsfall: Günthers „Füttern" hat in diesem Fall nichts getan,
             * und zwar still.
             *
             * Gefunden wurde es, weil ein Test `refill is not a function`
             * meldete — nachdem eine Änderung an Günthers Beweidung den
             * betroffenen Zweig häufiger erreichte.
             */
            this.#inventory.grantAmmo(playerId, waffe.id, 3);
          }
          ergebnis.weaponId = waffe.id;
          ergebnis.weaponName = waffe.displayName;
        }
        break;
      }

      case 'skipAndHeal': {
        this.#statuses.freeze(playerId, wirkung.turns);
        const betrag = Math.round(this.#guenther.zieheBereich(wirkung.heal));
        const system = this.#world.getSystem('damage');
        const geheilt = system?.heal?.(this.#world, playerId, betrag);
        ergebnis.amount = typeof geheilt === 'number' ? geheilt : betrag;
        break;
      }

      case 'damage': {
        const betrag = Math.round(this.#guenther.zieheBereich(wirkung.range));
        // Als Schaden OHNE Verursacher: Günther gehört keinem Team, ein Abschuss
        // durch ihn darf nicht als Treffer eines Spielers zählen.
        this.#world.getSystem('damage')?.applyDamage(this.#world, playerId, betrag, null);
        ergebnis.amount = betrag;
        break;
      }

      case 'legendaryWeapon': {
        const waffe = this.#guenther.waehleWaffe(LEGENDARY_WEIGHTS);
        if (waffe) {
          if (!this.#inventory.has(playerId, waffe.id)) {
            this.#inventory.grantWeapon(playerId, waffe.id);
          } else {
            // Wie oben: `refill` existiert nicht — `grantAmmo` ist gemeint.
            this.#inventory.grantAmmo(playerId, waffe.id, 99);
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


  /**
   * Feuert mit der aktiven Waffe — ein reiner Delegator.
   *
   * ## W1-4b: Delegation nach engine/shooting.js
   *
   * Der Rumpf stand hier 211 Zeilen lang und griff 20-mal in private Felder.
   * Er liegt jetzt als reine Funktion `fire(quelle, …)` in
   * `engine/shooting.js` — nach demselben Muster wie `stateSnapshot.js`
   * (W1-4a): `#schussQuelle()` benennt jede Angabe, die das Schießen liest.
   * Diese Liste ist die Schnittstelle; ein neues Feld dort braucht einen
   * Eintrag in der Quelle.
   *
   * @returns {{ok:boolean, errors?:string[], projectileId?:number, hit?:object|null}}
   */
  fire(playerId, angle, power, weaponId = null) {
    return fire(this.#schussQuelle(), playerId, angle, power, weaponId);
  }

  /**
   * Sammelt genau die Werte, die `engine/shooting.js` liest.
   *
   * ## Warum es diese Methode gibt
   *
   * `fire()` und die übrigen Schieß-Methoden griffen vorher direkt in private
   * Felder (Status, Inventar, Zugfolge, Zustände). Der Schieß-Ablauf soll rein
   * bleiben und bekommt deshalb keine `this`-Zugriffe mehr, sondern diese
   * Quelle — dieselbe Haltung wie `#zustandsQuelle()` für den Ansichtszustand.
   *
   * ## Die Entscheidungen im Einzelnen
   *
   *  - Was fertig gerechnet ist, wird fertig übergeben: `statuses`, `players`,
   *    `turnOrder` als schlichte Werte.
   *  - Was FALLWEISE gebraucht wird, geht als Rückfrage hinein:
   *    `isPlayerAlive`, `cooldownFor`, `surfaceYAt`, `deployTurret`,
   *    `applyTargetEffect`, `applyCooldown` — sie hängen an privaten Feldern
   *    (Kühlzeiten, Spieler, Terrain).
   *  - `rng` geht als GANZES hinein: Die Zufallswirkung einer Waffe zieht
   *    daraus, und zwar an derselben Stelle im Ablauf wie vorher — der
   *    Determinismus hängt an der Reihenfolge der Züge.
   *  - `hasFired`/`markFired` sind getrennte Funktionen: Der Ablauf LIEST das
   *    Flag (Ein Schuss je Zug) und SETZT es nach dem Abschuss — ein
   *    gemeinsamer Zugriff wäre eine verdeckte Schreibstelle.
   *  - `shotsInFlight` geht als GANZES hinein (die Map selbst): Der Einschlag
   *    trägt die Waffe über denselben Speicher; eine Kopie bräche die
   *    Zuordnung.
   *
   * ## Vertrag
   *
   * Die Schlüssel sind die Eingabe von `fire()` und der übrigen Funktionen in
   * `engine/shooting.js`. Wer einen umbenennt, zieht dort mit.
   */
  #schussQuelle() {
    return {
      world: this.#world,
      terrain: this.#terrain,
      events: this.#events,
      inventory: this.#inventory,
      statuses: this.#statuses,
      players: this.#players,
      turnOrder: this.#turnOrder,
      shotsInFlight: this.#shotsInFlight,
      width: this.width,
      height: this.height,
      status: this.#status,
      activePlayerId: this.activePlayerId,
      isPlayerAlive: id => this.isPlayerAlive(id),
      cooldownFor: (id, weaponId) => this.cooldownFor(id, weaponId),
      surfaceYAt: x => this.surfaceYAt(x),
      deployTurret: (id, effect) => this.#deployTurret(id, effect),
      rng: this.#rng,
      applyTargetEffect: (effect, target, attacker) => this.#applyTargetEffect(effect, target, attacker),
      applyCooldown: (id, weapon) => this.#applyCooldown(id, weapon),
      hasFired: () => this.#hasFired,
      markFired: id => { this.#hasFired = true; this.#lastShotBy = id; },
      endTurn: () => this.endTurn(),
      // Die Schieß-Primitive: Strahl, Mündung, Spielertreffer, Abschussvektor.
      // Sie bleiben im Match (Kartenmaß bzw. Terrain-/Spielerzugriff) und werden
      // von shooting.js über die Quelle gerufen.
      resolveHitscan: (ox, oy, angle, power, weapon, shooterId) =>
        this.#resolveHitscan(ox, oy, angle, power, weapon, shooterId),
      findMuzzle: (ox, oy, dirX, dirY, shooterId) =>
        this.#findMuzzle(ox, oy, dirX, dirY, shooterId),
      playerAt: (x, y, excludeId) => this.#playerAt(x, y, excludeId),
      launchVector: (playerId, angle, power, weapon) =>
        this.#launchVector(playerId, angle, power, weapon),
    };
  }

  // -------------------------------------- Schieß-Primitive (für shooting.js)

  /**
   * Auflösen eines Hitscan-Schusses. Bleibt im Match (nicht in `shooting.js`),
   * weil die Strahllänge ein Kartenmaß ist — `shooting.js` ruft sie über die Quelle.
   */
  #resolveHitscan(originX, originY, angle, power, weapon, shooterId = null) {
    const speed = power * POWER_TO_SPEED;
    /*
     * Die Strahllänge folgt der KARTE.
     *
     * FUND (belegt 2026-09-19): Hier stand `weapon.maxRange` in Pixeln, ohne
     * Kartenfaktor. Die ballistischen Waffen wachsen seit der Reichweiten-
     * korrektur mit der Kartenbreite (Reserve 1,28× auf jeder Größe), die
     * Hitscan-Waffen blieben bei ihrem Katalogwert — auf einer 5120er Karte
     * fielen damit 76 Waffen gegen 74 ab. Vorgabe: der Strahl skaliert mit.
     *
     * Gerechnet wird mit dem WEITENfaktor (`weitenFaktor`), weil `maxRange`
     * eine WEITE ist — nicht mit dem Geschwindigkeitsfaktor.
     */
    const strahlweite = weapon.maxRange * weitenFaktor(this.width);
    const maxSteps = Math.max(2, Math.round(strahlweite / Math.max(1, speed)));
    const dirX = Math.cos(angle);
    // Der Winkel wird gegen die Bildschirmachse gemessen: 0 = rechts, π/2 = oben.
    const dirY = -Math.sin(angle);

    // Mündung bestimmen. Ein Start direkt auf der Schützenposition ist falsch:
    // Der Schütze steht auf dem Boden, und sein eigenes Trefferfeld reicht
    // ±PLAYER_HALF_HEIGHT um die Fußposition. Der Strahl würde deshalb sofort
    // im eigenen Körper bzw. im Boden darunter enden und das eigentliche Ziel
    // nie erreichen. Deshalb wird der Startpunkt entlang der Schussrichtung aus
    // dem Körper herausgeschoben, bis freies Feld erreicht ist.
    const start = this.#findMuzzle(originX, originY, dirX, dirY, shooterId);
    if (start === null) {
      // Kein freies Feld in Schussrichtung: die Waffe kann nicht abgefeuert werden.
      return { hitX: originX, hitY: originY, hit: false, target: null, blocked: true };
    }

    const result = ccdRaycast(
      {
        startX: start.x,
        startY: start.y,
        velocityX: dirX * speed,
        velocityY: dirY * speed,
        drag: 1,
        gravity: 0,
        maxSteps,
      },
      // Der Schütze selbst darf den Strahl nicht blockieren.
      (x, y) => {
        if (this.#terrain.isSolid(Math.floor(x), Math.floor(y))) return true;
        const hitPlayer = this.#playerAt(x, y, shooterId);
        return hitPlayer !== null;
      }
    );

    const target = this.#playerAt(result.hitX, result.hitY, shooterId);
    if (target !== null) {
      const damage = weapon.damage * this.#statuses.damageMultiplier(shooterId);
      this.#world.getSystem('damage')?.applyDamage(this.#world, target, damage, shooterId, {
        damageType: damageTypeId(weapon.damageType),
      });

      // Wirkung über den Schaden hinaus (Einfrieren, Schaden über Zeit).
      // Fällt die Waffe nicht in SPECIAL_EFFECTS, greift die Ableitung aus dem
      // Elementarwert — sonst bliebe Feuer-/Gift-/Eisschaden ohne Wirkung.
      const effect = buildEffect(weapon) ?? elementalEffectFor(weapon);
      if (effect && !SELF_TARGET_KINDS.has(effect.kind)) {
        this.#applyTargetEffect(effect, target, shooterId);
      }
    }

    return { hitX: result.hitX, hitY: result.hitY, hit: result.hit, target };
  }

  /**
   * Sucht den Mündungspunkt: den ersten Punkt entlang der Schussrichtung, der
   * weder in festem Terrain noch im Körper eines Spielers liegt.
   *
   * Der Abschuss beginnt in der Körpermitte: `originY` ist die KOPFposition
   * des Schützen (`surfaceY - PLAYER_HALF_HEIGHT - 2`), die Körpermitte liegt
   * `PLAYER_HALF_HEIGHT / 2` darunter und damit frei vom Boden. Ein Start auf
   * der Fußposition läge IM Terrain — das Geschoss verschwände im ersten
   * Simulationsschritt.
   *
   * @returns {{x:number,y:number}|null}
   */
  #findMuzzle(originX, originY, dirX, dirY, shooterId = null) {
    const bodyY = originY - PLAYER_HALF_HEIGHT / 2;
    for (let distance = 0; distance <= MUZZLE_SEARCH_DISTANCE; distance += 2) {
      const x = originX + dirX * distance;
      const y = bodyY + dirY * distance;
      if (this.#terrain.isSolid(Math.floor(x), Math.floor(y))) continue;
      if (this.#playerAt(x, y, shooterId) !== null) continue;
      return { x, y };
    }
    return null;
  }

  /**
   * Spieler an einer Position.
   * @param {number|null} [excludeId] - wird übersprungen (meist der Schütze)
   */
  #playerAt(x, y, excludeId = null) {
    for (const entry of this.#players) {
      if (excludeId !== null && entry.entityId === excludeId) continue;
      if (!entry.alive) continue;
      const px = this.#world.getComponent(entry.entityId, 'Position', 'x') || 0;
      const py = this.#world.getComponent(entry.entityId, 'Position', 'y') || 0;
      if (Math.abs(x - px) <= PLAYER_HALF_WIDTH && Math.abs(y - py) <= PLAYER_HALF_HEIGHT) {
        return entry.entityId;
      }
    }
    return null;
  }

  /**
   * Abschussvektor inklusive Klassen- und Archetypenmodifikatoren.
   *
   * Bleibt im Match (und nicht in `shooting.js`), weil die Abschussgeschwindigkeit
   * an der KARTE hängt: `launchSpeedMultiplier({ … kartenbreite: this.width })`
   * ist die EINE Stelle, an der der Spielerschuss skaliert wird. Die drei
   * Lesestellen (Spielerschuss, Lebensdauer, Sichtlinie) teilen sie über die
   * Quelle — eine zweite Fassung in `shooting.js` wäre genau die Doppelregel,
   * die `tests/reichweite-konsistenz.test.js` festhält.
   */
  #launchVector(playerId, angle, power, weapon = null) {
    const player = this.#players.find(entry => entry.entityId === playerId);
    const x = this.#world.getComponent(playerId, 'Position', 'x') || 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') || 0;
    const speed = power * POWER_TO_SPEED * launchSpeedMultiplier({
      classId: player?.classId ?? 0,
      archetypeId: player?.archetypeId ?? 0,
      sidegradeId: player?.sidegradeId ?? null,
      weapon,
      // Die Karte gehört in DIESE Rechnung — sonst vergisst sie eine Aufrufstelle.
      kartenbreite: this.width,
    });

    return { x, y, speed, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed };
  }

  // ------------------------------------------------------------- Geschütze

  /**
   * Stellt ein Geschütz am Standort des Spielers auf.
   *
   * Gesucht wird ein freier Platz in der Nähe: direkt unter der Figur, sonst
   * wenige Pixel daneben. Der Boden wird abgefragt, damit das Geschütz nicht im
   * Gestein steht.
   *
   * @returns {object|null} der Eintrag oder null, wenn kein Platz frei ist
   */
  #deployTurret(playerId, effect) {
    const spieler = this.#players.find(entry => entry.entityId === playerId);
    if (!spieler?.alive) return null;

    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    /*
     * Die Platzsuche (feste Kandidatenfolge, festes und trockenes Gelände) ist
     * reine Rechnung über Karte und Terrain und steht deshalb in
     * `engine/turret.js` — dort ist sie ohne Match prüfbar.
     */
    const platz = freierPlatz({
      breite: this.width,
      surfaceYAt: x => this.surfaceYAt(x),
      waterLevelAt: (x, y) => this.waterLevelAt(x, y),
    }, startX);
    if (!platz) return null;

    const entityId = this.#nextTurretId();
    const eintrag = {
      entityId,
      ownerId: playerId,
      teamId: spieler.teamId,
      x: platz.x,
      y: platz.y,
      damage: Math.max(1, Math.round(effect.damage ?? 10)),
      /*
       * Die Reichweite des Geschützes folgt der KARTE.
       *
       * FUND (belegt, gemessen 2026-09-19): Hier stand `effect.range ?? 300`
       * ohne Kartenfaktor. Auf der Vorgabekarte (2560 px) reichte das Geschütz
       * damit 797 px weit, während der nächste Gegner 854 px entfernt stand —
       * `#nearestEnemyOf` verwarf jedes Ziel, und `npm run test:e2e` sah über
       * sechs Runden KEIN einziges `turret_fired` (der Unit-Test war grün, weil
       * er vier Spieler aufstellt: Abstand 513 px). Die Geschossgeschwindigkeit
       * des Geschützes wurde die ganze Zeit skaliert — nur die Reichweite nicht.
       */
      range: Math.max(60, Math.round((effect.range ?? 300) * weitenFaktor(this.width))),
      roundsLeft: Math.max(1, Math.round(effect.turns ?? 3)),
    };
    this.#turrets.set(entityId, eintrag);
    this.#events.emit('turret_deployed', {
      turretId: entityId, ownerId: playerId, teamId: spieler.teamId,
      x: eintrag.x, y: eintrag.y, damage: eintrag.damage, range: eintrag.range,
      rounds: eintrag.roundsLeft,
    });
    return eintrag;
  }

  /**
   * Vergibt die nächste Geschützkennung.
   *
   * Eigener Zähler, NICHT `world.createEntity()`: Die Kennungen der Geschütze
   * müssen von den Entity-IDs getrennt bleiben. Sonst könnte ein Geschütz die
   * Kennung einer gefallenen Figur tragen — genau die Falle, die in diesem
   * Projekt schon zwei Fehler verursacht hat.
   */
  #nextTurretId() {
    let hoechste = 0;
    for (const id of this.#turrets.keys()) if (id > hoechste) hoechste = id;
    return hoechste + 1;
  }

  /**
   * Lässt alle Geschütze einmal feuern — je Runde einmal.
   *
   * Ziel ist der NÄCHSTE lebende Gegner innerhalb der Reichweite. Ohne Ziel in
   * Reichweite wird nicht geschossen (kein Blindfeuer).
   *
   * Läuft am Rundenanfang, nach `round_start`. Das ist bewusst NICHT der
   * Zugbeginn: Ein Geschütz, das an den Zug eines bestimmten Spielers gebunden
   * wäre, träfe je nach Zugreihenfolge unterschiedlich oft.
   */
  #fireTurrets() {
    if (this.#turrets.size === 0) return;

    for (const turret of [...this.#turrets.values()]) {
      turret.roundsLeft -= 1;
      if (turret.roundsLeft <= 0) {
        this.#turrets.delete(turret.entityId);
        this.#events.emit('turret_expired', { turretId: turret.entityId, x: turret.x, y: turret.y });
        continue;
      }

      const ziel = this.#nearestEnemyOf(turret);
      if (!ziel) continue;

      const schuss = this.#turretShot(turret, ziel);
      if (!schuss) continue;

      this.#spawnTurretProjectile(turret, schuss, ziel);
    }
  }

  /**
   * Nächster lebender Gegner eines Geschützes innerhalb seiner Reichweite.
   *
   * Delegator nach `engine/turret.js`: Die Zielwahl ist reine Rechnung über die
   * Spielerliste und die Positionen — der Match reicht beides über die Quelle
   * hinein.
   */
  #nearestEnemyOf(turret) {
    return naechsterGegner(this.#geschuetzQuelle(), turret);
  }

  /**
   * Sucht Winkel und Kraft für ein Geschütz — Delegator nach `turret.js`.
   *
   * Die Suche selbst (feste Kraft- und Winkellisten, Abstand der Bahn zum Ziel,
   * „kein Blindfeuer") steht in `engine/turret.js` und wird in
   * `tests/turret-zerlegung.test.js` ohne Match geprüft. Der Match baut dafür die
   * Quelle und reicht sie hinein; die Bahn rechnet weiterhin
   * `#simulateTurretPath`.
   *
   * @returns {{angle: number, power: number, naehe: number}|null}
   */
  #turretShot(turret, ziel) {
    return aimTurret(this.#geschuetzQuelle(), turret, ziel);
  }

  /**
   * Die Quelle des Geschützes — genau die Werte, die `engine/turret.js` liest.
   *
   * Dasselbe Muster wie `#schussQuelle()` für `shooting.js`: Was fertig
   * gerechnet ist, geht als Wert hinein (`players`); was Terrain-, Karten- oder
   * Weltzugriff braucht, geht als Rückfrage hinein (`positionOf`, `bahn`). Wer
   * ein Feld umbenennt, zieht `turret.js` mit — beide gehören zusammen.
   */
  #geschuetzQuelle() {
    return {
      players: this.#players,
      positionOf: entityId => ({
        x: this.#world.getComponent(entityId, 'Position', 'x') ?? 0,
        y: this.#world.getComponent(entityId, 'Position', 'y') ?? 0,
      }),
      // Die Bahn bleibt im Match: Wind-Quelle (`this.#wind`), Terrain- und
      // Kartenabbruch. Der Integrationsschritt kommt aus `integrateStep`
      // (`src/shared/ballistics.js`) — dieselbe Regel wie beim echten Geschoss.
      bahn: (turret, winkel, kraft) => this.#simulateTurretPath(turret, winkel, kraft, TURRET_WEAPON),
    };
  }

  /**
   * Rechnet eine Flugbahn schrittweise nach — mit der Physik des echten
   * Geschosses: Der Integrationsschritt kommt aus `integrateStep`
   * (`src/shared/ballistics.js`), Terrain- und Kartenabbruch bleiben hier.
   *
   * FUND (belegt, Code-Audit): Hier stand ein NACHBAU der Ballistik, der in
   * zwei Punkten abwich — unbemerkt, weil der Kommentar „wie das echte
   * Geschoss" Übereinstimmung behauptete:
   *
   *   1. `vx += wind * 0.02` mit `wind = currentStrength` (= `wind * 10`),
   *      wirkte also mit 0,2 statt 1,0 — das FÜNFFACHE zu wenig.
   *   2. `vy` wurde NICHT gedraggt, `vx` schon.
   *
   * Gemessene Zielweiten-Abweichung (Kraft 100, 45°): Wind 0 → +14,6 px
   * (allein der fehlende vy-Drag), 0,025 → −16,9 px, 0,05 → −48,4 px,
   * −0,05 → +77,7 px. `#aimTurret` wählt mit dieser Bahn den Schusswinkel —
   * bei bis zu 78 px Fehler schoss das Geschütz systematisch daneben.
   *
   * Die Behebung war die ÜBERNAHME der geltenden Regel, keine neue Formel. Seit
   * Fund 1 des Duplikat-Berichts ist sie auch keine Abschrift mehr:
   * `integrateStep` ist dieselbe Funktion, die `ProjectileSystem` und
   * `simulateFlight` benutzen. `tests/turret-ballistics.test.js` vergleicht die
   * Bahn Punkt für Punkt; die Textprobe auf `vy *= drag` ist entfallen.
   */
  #simulateTurretPath(turret, winkel, kraft, waffe) {
    const abschuss = this.#turretLaunch(kraft, winkel, waffe);
    let x = turret.x;
    let y = turret.y;
    let vx = abschuss.vx;
    let vy = abschuss.vy;
    const gravitation = GRAVITY * (waffe.gravityScale ?? 1);

    // Die Wind-Quelle ist `wind` — die Größe, die auch das `ProjectileSystem`
    // liest. Der frühere Zugriff auf `currentStrength` war der eigentliche
    // Fehler: Dort war der Wind schon mit 10 multipliziert.
    const wind = this.#wind;

    // Der Drag kommt aus DERSELBEN Konstante wie beim echten Geschoss
    // (`DEFAULT_PROJECTILE_DRAG` ist oben importiert).
    const drag = DEFAULT_PROJECTILE_DRAG;

    const bahn = [];
    for (let schritt = 0; schritt < TURRET_PATH_STEPS; schritt++) {
      /*
       * EIN Tick Geschossphysik — aus der geteilten Regel, nicht nachgebaut.
       * `gravitation` ist die Schwerkraft des Turmgeschosses, Wind und Drag sind
       * dieselben wie beim echten Geschoss (`TURRET_WEAPON` führt keinen
       * eigenen Windfaktor).
       */
      const naechste = integrateStep({ vx, vy, gravity: gravitation, wind, drag });
      vx = naechste.vx;
      vy = naechste.vy;
      x += vx;
      y += vy;
      if (x < 0 || x > this.width || y > this.height) break;
      const boden = this.surfaceYAt(Math.round(x));
      if (boden > 0 && y >= boden) {
        bahn.push({ x, y });
        break;
      }
      bahn.push({ x, y });
    }
    return bahn;
  }

  /**
   * Der Abschuss des Geschützes — EINE Stelle für Bahnersuchung und Geschoss
   * (Fund 5: Die Abschussgeschwindigkeit stand zweimal hier; liefen die Kopien
   * auseinander, zielte das Geschütz nach dem einen Wert und schoss mit dem
   * anderen). Der Kartenfaktor steckt nur hier — der Spielerschuss trägt
   * zusätzlich Klassen-, Archetyp- und Waffenfaktor und geht über
   * `launchSpeedMultiplier({ …, kartenbreite: this.width })`.
   */
  #turretLaunch(kraft, winkel, waffe) {
    const speed = kraft * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);
    return { speed, vx: Math.cos(winkel) * speed, vy: -Math.sin(winkel) * speed };
  }

  /**
   * Die Flugbahn des Geschützes — der benannte Zugang zu `#simulateTurretPath`
   * für die PRÜFUNG: `tests/turret-ballistics.test.js` vergleicht diese Bahn
   * Punkt für Punkt mit `simulateFlight` aus `src/shared/ballistics.js`, statt
   * ihren Quelltext zu lesen.
   */
  turretPath(turret, winkel, kraft) {
    return this.#simulateTurretPath(turret, winkel, kraft, TURRET_WEAPON);
  }

  /** Erzeugt das Geschoss eines Geschützes. */
  #spawnTurretProjectile(turret, schuss, ziel = null) {
    const waffe = TURRET_WEAPON;
    // Dieselbe Abschussgeschwindigkeit wie die Bahnersuchung — EIN Aufruf der
    // gemeinsamen Funktion (`#turretLaunch`).
    const { speed } = this.#turretLaunch(schuss.power, schuss.angle, waffe);
    const geschoss = turretProjectile({ turret, waffe, winkel: schuss.angle, speed });
    const [vx, vy] = [geschoss.velocity.x, geschoss.velocity.y];

    const entityId = this.#world.createEntity();
    this.#world.addComponent(entityId, 'Position', geschoss.position);
    this.#world.addComponent(entityId, 'Velocity', geschoss.velocity);
    this.#world.addComponent(entityId, 'Projectile', geschoss.projectile);

    this.#shotsInFlight.set(entityId, TURRET_WEAPON_ID);

    /*
     * Ein Geschützgeschoss meldet sich wie jedes andere ankommende Geschoss.
     *
     * Fund (belegt): Anfangs feuerte das Geschütz nur `turret_fired`. Gemessen
     * fehlte damit das `projectile_spawn` zu einem Geschützschuss — wer dieses
     * Ereignis auswertet (Effekte, Ton, Protokoll), hätte das Geschoss nicht
     * gesehen, obwohl es fliegt. `playerId` bleibt der EIGENTÜMER: Das Geschoss
     * gehört ihm, auch wenn er in dieser Runde nicht geschossen hat.
     *
     * Bewusst KEIN `shot`-Ereignis: Das zählt die Schüsse eines Spielers, und der
     * Eigentümer hat in dieser Runde nicht geschossen. Sein Geschütz hat es. Ein
     * zusätzliches `shot` würde seine Trefferquote verfälschen.
     */
    this.#events.emit('projectile_spawn', {
      playerId: turret.ownerId, projectileId: entityId, weaponId: TURRET_WEAPON_ID,
      x: turret.x, y: turret.y, vx, vy,
    });

    this.#events.emit('turret_fired', {
      turretId: turret.entityId, projectileId: entityId, ownerId: turret.ownerId,
      targetId: ziel?.entityId ?? null,
      x: turret.x, y: turret.y, angle: schuss.angle, power: schuss.power,
    });
  }


  /**
   * Wirft eine Waffe ab und legt sie als aufhebbare Kiste in der Nähe ab.
   *
   * Die Mechanik unterstützt den Spielablauf an der Stelle, an der er sonst
   * stockt: Ist der Waffenvorrat voll, muss man sich von etwas trennen, um etwas
   * Neues zu nehmen.
   *
   * Entscheidungen:
   *  - Die Landestelle wird ZUFÄLLIG gewählt, aber geprüft: innerhalb der Karte,
   *    auf festem Boden und AUSSERHALB des Aufhebe-Radius. Sonst würde der
   *    Werfer seine eigene Waffe im nächsten Schritt wieder einsammeln und die
   *    Handlung wäre wirkungslos.
   *  - Der Zufall kommt aus dem Match-Generator, ist also reproduzierbar.
   *  - Die verbleibende Munition reist mit: Abwerfen und Aufheben darf kein
   *    Munitionstrick sein.
   *  - Die Reservewaffe ist geschützt (siehe Inventar).
   *
   * @param {number} playerId
   * @param {string} weaponId
   * @returns {{ok:boolean, crateId?:number, x?:number, y?:number, ammo?:number, errors?:string[]}}
   */
  dropWeapon(playerId, weaponId) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match läuft nicht');
    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
    if (errors.length > 0) return { ok: false, errors };

    const weapon = getWeapon(weaponId);
    if (!weapon) return { ok: false, errors: ['Unbekannte Waffe'] };

    const entfernt = this.#inventory.removeWeapon(playerId, weaponId);
    if (!entfernt.ok) return { ok: false, errors: [entfernt.reason] };

    // Die Kiste wird GESCHLEUDERT, nicht abgelegt: sie fliegt mit zufälliger
    // Anfangsgeschwindigkeit heraus, unterliegt Schwerkraft und Wind und landet
    // nach einer Flugzeit. Landung im Wasser ist ausgeschlossen (siehe
    // #stepCrate) — das ist die einzige harte Regel.
    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const startY = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;
    const wurf = this.#rollDropThrow();

    const crateId = this.#world.createEntity();
    this.#world.addComponent(crateId, 'Position', { x: startX, y: startY - 14 });
    this.#world.addComponent(crateId, 'Velocity', { x: wurf.vx, y: wurf.vy });
    this.#world.addComponent(crateId, 'Crate', {
      crateType: CRATE_TYPES.weapon,
      crateX: startX,
      crateY: startY - 14,
      /*
       * BEWUSSTER ZUSTAND: die Waffen tragen ihre Seltenheit im `powerTier`-
       * Namensraum (common/uncommon/rare/epic/legendary), `RARITY_IDS` fuehrt die
       * vier `rarity`-Namen. Kein Waffenwert kommt darin vor -> gemessen liegt
       * der Index bei ALLEN 150 Waffen auf 0. Siehe die Begruendung an der
       * Ziehungsstelle in `systems/lootSystem.js`.
       */
      rarity: Math.max(0, RARITY_IDS.indexOf(weapon.rarity)),
      weaponId: weapon.index,
      picked: 0,
      ammo: entfernt.ammo,
      inFlight: 1,
      flightTicks: CRATE_FLIGHT_TICKS,
    });

    // Eine abgeworfene Waffe ist keine Nachladezeit mehr wert: die Pause gehört
    // zur Waffe, und die liegt jetzt am Boden.
    this.#cooldowns.delete(`${playerId}:${weaponId}`);

    this.#events.emit('weapon_dropped', {
      playerId, weaponId, crateId,
      x: startX, y: startY - 14,
      vx: wurf.vx, vy: wurf.vy,
      ammo: entfernt.ammo,
    });

    // x/y sind hier der ABWURFPUNKT. Die Landestelle steht erst nach dem Flug
    // fest und ist danach über die Kiste im Zustand abfragbar.
    return {
      ok: true, crateId, x: startX, y: startY - 14,
      vx: wurf.vx, vy: wurf.vy, ammo: entfernt.ammo,
    };
  }

  /**
   * Sucht eine zufällige, gültige Landestelle für eine abgeworfene Waffe.
   *
   * Bedingungen: innerhalb der Karte, mindestens `DROP_MIN_DISTANCE` und
   * höchstens `DROP_MAX_DISTANCE` entfernt, und der Punkt muss über festem
   * Boden liegen. Gibt `null` zurück, wenn kein Platz gefunden wurde.
   *
   * @returns {{x:number, y:number}|null}
   */
  /**
   * Schleudert eine abgeworfene Waffe fort.
   *
   * Bewusst physikalisch statt „geprüft danebenlegen": Die Waffe fliegt mit
   * einer zufälligen Anfangsgeschwindigkeit heraus, unterliegt der Schwerkraft,
   * wird vom Wind getrieben und landet erst nach einer Flugzeit. Das wirkt wie
   * ein Wurf und nicht wie ein Ablegen.
   *
   * Die EINZIGE harte Regel: Die Kiste darf nicht im Wasser landen. Wasser
   * würde sie unerreichbar machen bzw. die Waffe versinken lassen — das wäre
   * ein Verlust ohne Gegenwert. Trifft sie auf Wasser, fliegt sie weiter, bis
   * sie festen Boden erreicht.
   *
   * @returns {{vx:number, vy:number}} Anfangsgeschwindigkeit für die Kiste
   */
  #rollDropThrow() {
    const richtung = this.#rng.nextBoolean() ? -1 : 1;
    /*
     * Die Weite wird aus der ZIELDISTANZ gerechnet, nicht geschätzt.
     *
     * FUND (belegt, gemessen 2026-09-19): Hier stand `vx: richtung * rng(1,2 … 2,8)`.
     * Über die Flugzeit (`CRATE_FLIGHT_TICKS`) und den Luftwiderstand ergibt das
     * 48–113 px — gemessen 74 px. Damit landete die Kiste INNERHALB des
     * Aufhebe-Radius (`PICKUP_RADIUS = 110` in `systems/lootSystem.js`), wurde im
     * SELBEN Takt wieder aufgenommen und verschwand: `crate_landed` und
     * `crate_pickup` fielen zusammen, der Abwurf war wirkungslos.
     *
     * Der Mechaniktext verlangt ausdrücklich das Gegenteil: die Landestelle muss
     * AUSSERHALB des Aufhebe-Radius liegen, sonst sammelt der Werfer seine eigene
     * Waffe im nächsten Schritt wieder ein.
     *
     * Gerechnet wird die nötige Anfangsgeschwindigkeit für die gezogene
     * Zieldistanz: Die zurückgelegte Strecke ist `vx0 × Σ drag^i` über die
     * Flugticks (der Wind kommt als kleine Zugabe hinzu und wird nicht
     * eingerechnet — er darf die Landestelle nur nach außen verschieben).
     */
    const zielWeite = this.#rng.nextFloat(PICKUP_RADIUS * 1.4, PICKUP_RADIUS * 3);
    let abklingen = 0;
    let faktor = 1;
    for (let tick = 0; tick < CRATE_FLIGHT_TICKS; tick += 1) {
      faktor *= DEFAULT_PROJECTILE_DRAG;
      abklingen += faktor;
    }
    return {
      // Kräftig nach oben und zur Seite. Die Werte zielen auf eine Flugzeit von
      // etwa einer halben bis anderthalb Sekunden: kurz genug, um den Zug nicht
      // aufzuhalten, lang genug, um den Wurf als Wurf zu erkennen.
      vx: richtung * (zielWeite / Math.max(1, abklingen)),
      vy: -this.#rng.nextFloat(9, 14),
    };
  }

  /**
   * Bewegt eine fliegende Kiste einen Schritt weiter.
   *
   * Läuft im Simulationsschritt (siehe #stepFlyingCrates) und nutzt dieselben
   * Kräfte wie ein Geschoss: Schwerkraft, Luftwiderstand, Wind. Der Unterschied
   * ist der Aufprall: Eine Kiste bleibt liegen statt zu explodieren, und sie
   * darf nicht ins Wasser geraten.
   *
   * @returns {boolean} true, wenn die Kiste gelandet ist
   */
  #stepCrate(crateId) {
    const world = this.#world;
    if (!world.isActive(crateId)) return false;
    // Nur fliegende Kisten bewegen sich (fliegend = Flag gesetzt).
    if (world.getComponent(crateId, 'Crate', 'inFlight') !== 1) return false;

    const x = world.getComponent(crateId, 'Position', 'x') ?? 0;
    const y = world.getComponent(crateId, 'Position', 'y') ?? 0;
    let vx = world.getComponent(crateId, 'Velocity', 'x') ?? 0;
    let vy = world.getComponent(crateId, 'Velocity', 'y') ?? 0;

    const wind = this.#world.services.match?.wind ?? 0;
    // Restliche Flugzeit. Die Kiste landet erst, wenn sie abgelaufen ist —
    // eine abgeworfene Waffe soll sichtbar fliegen und nicht im nächsten Hügel
    // hängen bleiben.
    let restFlug = world.getComponent(crateId, 'Crate', 'flightTicks') ?? 0;
    if (restFlug > 0) restFlug -= 1;
    world.setComponent(crateId, 'Crate', 'flightTicks', restFlug);
    const flugVorbei = restFlug <= 0;

    // Eigene Fallbeschleunigung für Kisten: schwächer als bei Geschossen, damit
    // der Wurf sichtbar dauert. Ein Geschoss soll schnell ans Ziel, eine
    // abgeworfene Waffe soll fliegen.
    vy += CRATE_GRAVITY;
    vx += wind * 0.8;
    vx *= DEFAULT_PROJECTILE_DRAG;
    vy *= DEFAULT_PROJECTILE_DRAG;

    const nextX = x + vx;
    const nextY = y + vy;

    // Aus der Karte geflogen: zurück an den Rand holen.
    const begrenztX = Math.min(this.width - 12, Math.max(12, nextX));

    const boden = this.surfaceYAt(Math.round(begrenztX));

    // Wasser an der Landestelle? Dann NICHT landen, sondern weiterfliegen.
    // Das ist die einzige harte Regel des Abwurfs.
    const wasser = this.waterLevelAt(begrenztX, Math.max(0, boden));
    const ueberWasser = wasser > WET_LEVEL;

    // Gelände getroffen und trockener Boden: landen — aber erst nach Ablauf der
    // Mindestflugzeit.
    if (flugVorbei && boden > 0 && nextY >= boden && !ueberWasser) {
      world.setComponent(crateId, 'Position', 'x', begrenztX);
      world.setComponent(crateId, 'Position', 'y', boden);
      world.setComponent(crateId, 'Velocity', 'x', 0);
      world.setComponent(crateId, 'Velocity', 'y', 0);
      world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
      world.setComponent(crateId, 'Crate', 'crateY', boden);
      world.setComponent(crateId, 'Crate', 'inFlight', 0);
      this.#events.emit('crate_landed', {
        crateId, x: begrenztX, y: boden, flightTicks: CRATE_FLIGHT_TICKS,
      });
      return true;
    }

    // Sonst weiterfliegen. Über Wasser wird die Sinkgeschwindigkeit gedämpft,
    // damit die Kiste nicht untergeht, sondern weitergetragen wird.
    if (ueberWasser && nextY >= boden) vy = Math.min(vy, 0.4);

    world.setComponent(crateId, 'Position', 'x', begrenztX);
    world.setComponent(crateId, 'Position', 'y', Math.max(0, nextY));
    world.setComponent(crateId, 'Velocity', 'x', vx);
    world.setComponent(crateId, 'Velocity', 'y', vy);
    world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
    world.setComponent(crateId, 'Crate', 'crateY', Math.max(0, nextY));
    return false;
  }

  /** Bewegt alle fliegenden Kisten. Läuft vor dem Physikschritt. */
  #stepFlyingCrates() {
    for (const crateId of this.#world.getEntitiesBySignature(
      COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.VELOCITY,
    )) {
      this.#stepCrate(crateId);
    }
  }

  /**
   * Räumt alle Nachladezeiten eines Spielers.
   * Nötig beim Ausscheiden: sonst blieben Einträge für einen Spieler stehen,
   * der nicht mehr am Match teilnimmt.
   */
  clearCooldowns(playerId) {
    const prefix = `${playerId}:`;
    for (const key of [...this.#cooldowns.keys()]) {
      if (key.startsWith(prefix)) this.#cooldowns.delete(key);
    }
  }


  /** Verbleibender Zünder eines Projektils in Sekunden (0 = kein Zünder). */
  fuseSecondsLeft(projectileId) {
    if (!this.#world.isActive(projectileId)) return 0;
    const ticks = this.#world.getComponent(projectileId, 'Projectile', 'fuseTicks') ?? 0;
    return ticks > 0 ? Math.round((ticks / 60) * 10) / 10 : 0;
  }

  /** Verbleibende Nachladezeit einer Waffe in Zügen (0 = einsatzbereit). */
  cooldownFor(playerId, weaponId) {
    return this.#cooldowns.get(`${playerId}:${weaponId}`) ?? 0;
  }

  /**
   * Setzt die Nachladezeit einer Waffe.
   * Wird nach jedem erfolgreichen Schuss aufgerufen, auch bei Selbstwirkungen —
   * sonst ließe sich eine Heilwaffe durchgehend benutzen.
   */
  #applyCooldown(playerId, weapon) {
    const turns = Math.max(0, Math.floor(weapon?.cooldown ?? 0));
    if (turns <= 0) return 0;
    this.#cooldowns.set(`${playerId}:${weapon.id}`, turns);
    this.#events.emit('weapon_cooldown', {
      playerId, weaponId: weapon.id, turns,
    });
    return turns;
  }

  /**
   * Zählt die Nachladezeiten eines Spielers um einen Zug herunter.
   * Gehört an den ZUGbeginn: der Spieler überspringt seine Pause, wenn er
   * wieder an der Reihe ist.
   */
  #tickCooldowns(playerId) {
    const prefix = `${playerId}:`;
    for (const [key, rest] of this.#cooldowns.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (rest <= 1) this.#cooldowns.delete(key);
      else this.#cooldowns.set(key, rest - 1);
    }
  }


  /**
   * Wendet eine Wirkung auf ein getroffenes Ziel an (Einfrieren, Schaden über Zeit).
   * Wirkt nur auf Gegner — eigene Einheiten bleiben verschont.
   */
  #applyTargetEffect(effect, targetId, attackerId) {
    const ziel = this.#players.find(entry => entry.entityId === targetId);
    const schuetze = this.#players.find(entry => entry.entityId === attackerId);
    if (!ziel || !this.isPlayerAlive(targetId)) return null;
    if (schuetze && ziel.teamId === schuetze.teamId) return null;

    switch (effect.kind) {
      case EFFECT_KIND.FREEZE: {
        const turns = this.#statuses.freeze(targetId, effect.turns);
        this.#events.emit('frozen', { playerId: targetId, turns, by: attackerId });
        return { kind: effect.kind, turns };
      }

      case EFFECT_KIND.PULL: {
        // Das Ziel wird in Richtung des Schützen versetzt, auf festem Gelände
        // verankert. Wirkt nur, wenn es sich tatsächlich bewegt hat — sonst
        // wäre die Wirkung bei einer Wand dazwischen eine stille Nullnummer.
        const versetzt = this.#pullToward(targetId, attackerId, effect.distance);
        if (versetzt.dx === 0 && versetzt.dy === 0) return null;
        this.#events.emit('pulled', { playerId: targetId, by: attackerId, ...versetzt });
        return { kind: effect.kind, ...versetzt };
      }

      case EFFECT_KIND.DAMAGE_OVER_TIME: {
        this.#statuses.addDot(targetId, effect);
        this.#events.emit('dot_applied', {
          playerId: targetId,
          element: effect.element,
          damagePerTurn: effect.damagePerTurn,
          turns: effect.turns,
          by: attackerId,
        });
        return { kind: effect.kind, ...effect };
      }

      case EFFECT_KIND.WATER_PUSH: {
        /*
         * Wasserschub: erst wegstoßen, dann fluten.
         *
         * Die Reihenfolge ist wesentlich. Der Wasserstand wird an der NEUEN
         * Position angehoben — würde zuerst geflutet, läge das Wasser auf der
         * alten Zelle und das Ziel stünde daneben im Trockenen. Die Waffe würde
         * dann sichtbar nichts bewirken.
         *
         * Der Wasserstand wird auf den vorhandenen Wert AUFgesetzt, nicht
         * gesetzt: Ein Schuss in eine schon geflutete Mulde macht sie tiefer,
         * statt sie auf den Wert der Waffe zurückzusetzen.
         */
        const versetzt = this.#pushAway(targetId, attackerId, effect.distance);

        const neueX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
        const neueY = this.#world.getComponent(targetId, 'Position', 'y') ?? 0;
        const vorher = this.waterLevelAt(neueX, neueY);
        const nachher = clampWaterLevel(vorher + effect.raise);
        /*
         * Einen BEREICH fluten, nicht eine Zelle — sonst meldet der Zustand der
         * Figur weiter 0, weil sie mit ihrem Zentrum zehn Pixel über der
         * gefluteten Bodenzelle steht (siehe `floodArea`).
         */
        const geflutet = this.floodArea(neueX, neueY, nachher);

        /*
         * Wenn weder Bewegung noch Flutung stattfand, ist die Wirkung eine
         * stille Nullnummer (z. B. Wand hinter dem Ziel und bereits geflutete
         * Zelle). Dann `null` zurückgeben — der Aufrufer zählt die Wirkung sonst
         * als Erfolg, obwohl nichts geschehen ist.
         */
        const bewegt = versetzt.dx !== 0 || versetzt.dy !== 0;
        if (!bewegt && geflutet.zellen === 0) return null;

        this.#events.emit('water_pushed', {
          playerId: targetId,
          by: attackerId,
          dx: versetzt.dx,
          dy: versetzt.dy,
          waterBefore: vorher,
          waterAfter: nachher,
          cellsFlooded: geflutet.zellen,
        });
        return {
          kind: effect.kind,
          ...versetzt,
          waterBefore: vorher,
          waterAfter: nachher,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Versetzt ein Ziel in Richtung eines Angreifers.
   *
   * Die Bewegung ist auf ein Stück pro Anwendung begrenzt und wird auf der
   * Geländeoberfläche verankert: ein Ziehen durch massives Terrain wäre ein
   * Fehler, kein Effekt. Der Schütze selbst bewegt sich nicht.
   *
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #pullToward(targetId, attackerId, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const schuetzeX = this.#world.getComponent(attackerId, 'Position', 'x') ?? 0;
    return this.#shiftToward(targetId, Math.sign(schuetzeX - zielX), distance);
  }

  /**
   * Versetzt ein Ziel vom Angreifer WEG — der Gegenpol zu `#pullToward`.
   *
   * Beide benutzen dieselbe Schrittsuche: Die Verschiebung wird in Zehn-Pixel-
   * Schritten geprüft und darf nicht durch massives Gelände führen. Ein Ziel
   * durch eine Wand zu schieben wäre ein Fehler, kein Effekt.
   *
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #pushAway(targetId, attackerId, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const schuetzeX = this.#world.getComponent(attackerId, 'Position', 'x') ?? 0;
    return this.#shiftToward(targetId, Math.sign(zielX - schuetzeX), distance);
  }

  /**
   * Verschiebt ein Ziel waagerecht um `distance`, verankert auf der
   * Geländeoberfläche.
   *
   * @param {number} richtung - -1 oder 1; 0 bedeutet keine Bewegung
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #shiftToward(targetId, richtung, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const zielY = this.#world.getComponent(targetId, 'Position', 'y') ?? 0;
    if (richtung === 0) return { dx: 0, dy: 0 };

    // In kleinen Schritten prüfen, damit das Ziel nicht durch eine Wand springt.
    const schritt = 10;
    let erreicht = 0;
    for (let d = schritt; d <= distance; d += schritt) {
      const kandidatX = zielX + richtung * d;
      if (kandidatX < PLAYER_HALF_WIDTH || kandidatX > this.width - PLAYER_HALF_WIDTH) break;
      const surface = this.surfaceYAt(Math.round(kandidatX));
      if (surface < 0) break;
      /*
       * Kein Sprung auf eine Klippe.
       *
       * Fund (belegt): Die Verschiebung verankert das Ziel auf der
       * Geländeoberfläche der neuen Stelle. Stand dort ein Hügel, wurde das Ziel
       * katapultiert statt geschoben — gemessen: 120 px seitwärts und **115 px
       * nach oben** in einem Schritt, mitten auf einen Berggipfel. Ein Erdstoß,
       * der jemanden auf eine Klippe setzt, ist kein Effekt, sondern ein Fehler.
       *
       * Der Höhenunterschied wird deshalb begrenzt: Die Verschiebung endet, wo
       * der Boden mehr als `MAX_SCHUB_STEIGUNG` über der Fußposition liegt.
       * Bezugspunkt ist die FUSSPOSITION (`zielY + PLAYER_HALF_HEIGHT`), weil
       * dort der Bodenkontakt stattfindet.
       */
      if (Math.abs(surface - (zielY + PLAYER_HALF_HEIGHT)) > MAX_SHIFT_SLOPE) break;
      if (this.#terrain.isSolid(Math.floor(kandidatX), Math.floor(surface - PLAYER_HALF_HEIGHT))) break;
      erreicht = d;
    }

    if (erreicht === 0) return { dx: 0, dy: 0 };

    const neueX = zielX + richtung * erreicht;
    const neueY = this.surfaceYAt(Math.round(neueX));
    this.#world.setComponent(targetId, 'Position', 'x', neueX);
    this.#world.setComponent(targetId, 'Position', 'y', neueY);
    this.#world.setComponent(targetId, 'Velocity', 'x', 0);
    this.#world.setComponent(targetId, 'Velocity', 'y', 0);
    return { dx: neueX - zielX, dy: neueY - zielY };
  }

  /**
   * Wendet Wirkungen auf alle Gegner in einem Radius an.
   * Für Waffen mit Flächenwirkung: Giftwolken und Feuerflächen treffen jeden
   * im Umkreis, nicht nur das direkt getroffene Ziel.
   */
  #applyAreaEffect(effect, x, y, radius, attackerId, { ueberspringe = null } = {}) {
    const angewendet = [];
    for (const entry of this.#players) {
      if (!entry.alive) continue;
      if (entry.entityId === attackerId) continue;
      /*
       * Das direkt getroffene Ziel NICHT noch einmal.
       *
       * Fund (belegt): Bei einer Waffe mit Flächenwirkung läuft der Effekt
       * zweimal über das direkt getroffene Ziel — einmal direkt aus dem
       * Projekteinschlag, einmal über die Fläche, die ja auch das Ziel einschließt.
       * Gemessen am Wasserschub: `waterAfter` stieg in einem Einschlag erst auf
       * 0,4 und dann auf 0,8; dieselbe Verdopplung trifft Einfrierdauer
       * (doppelt so lange), Heranziehen (doppelte Distanz) und Schaden über Zeit
       * (doppelte Stapel). Bei Flächenwaffen mit großem Radius fiel das auf, bei
       * den meisten Waffen (Radius 0) nicht.
       */
      if (ueberspringe !== null && entry.entityId === ueberspringe) continue;
      const px = this.#world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
      const py = this.#world.getComponent(entry.entityId, 'Position', 'y') ?? 0;
      const distSq = (px - x) ** 2 + (py - y) ** 2;
      if (distSq > radius * radius) continue;
      const outcome = this.#applyTargetEffect(effect, entry.entityId, attackerId);
      if (outcome) angewendet.push({ playerId: entry.entityId, ...outcome });
    }
    return angewendet;
  }

  /**
   * Wirkung eines eingeschlagenen Projektils.
   *
   * Die Zuordnung Projektil → Waffe wird hier verbraucht und wieder entfernt,
   * damit die Map nicht über die Matchdauer wächst.
   */
  #handleProjectileImpact({ projectileId, owner, x, y, target, blastRadius }) {
    const weaponId = this.#shotsInFlight.get(projectileId);
    this.#shotsInFlight.delete(projectileId);
    if (!weaponId) return;

    const weapon = getWeapon(weaponId);
    const effect = buildEffect(weapon) ?? elementalEffectFor(weapon);
    if (!effect || SELF_TARGET_KINDS.has(effect.kind)) return;

    if (target !== null && target !== undefined) {
      this.#applyTargetEffect(effect, target, owner);
    }
    // Bei Flächenwirkung zusätzlich alle Gegner im Radius treffen — eine
    // Giftwolke wirkt nicht nur auf den direkt getroffenen Gegner. Das direkt
    // getroffene Ziel ist ausgenommen: es hat den Effekt oben schon bekommen.
    if (blastRadius > 0) {
      this.#applyAreaEffect(effect, x, y, blastRadius, owner, { ueberspringe: target });
    }
  }



  /**
   * Wie viele Ticks ein Geschoss dieses Schusses lebt.
   *
   * Delegiert an `engine/shooting.js` — dort steht die Herleitung (Reichweite
   * und tatsächliche Anfangsgeschwindigkeit, samt Kartenskalierung).
   */
  projectileLifetime(playerId, angle, power, weapon = null) {
    return projectileLifetime(this.#schussQuelle(), playerId, angle, power, weapon);
  }


  /**
   * Zielvorschau — delegiert an `engine/shooting.js`.
   *
   * Die Bahn rechnet `simulateFlight` aus `src/shared/ballistics.js` — dieselbe
   * Funktion, die die Zielvorschau und die clientseitige Vorhersage benutzen.
   */
  aimPreview(playerId, angle, power, steps = 180, weapon = null) {
    return aimPreview(this.#schussQuelle(), playerId, angle, power, steps, weapon);
  }

  /**
   * Freie Sichtlinie für einen Schuss? — delegiert an `engine/shooting.js`.
   */
  hasLineOfSight(playerId, angle, power, weapon = null) {
    return hasLineOfSight(this.#schussQuelle(), playerId, angle, power, weapon);
  }

  /**
   * Der Punkt, an dem ein Schuss WIRKLICH beginnt — delegiert an
   * `engine/shooting.js`.
   */
  launchOrigin(playerId, angle) {
    return launchOrigin(this.#schussQuelle(), playerId, angle);
  }

  endTurn() {
    if (this.#status !== 'playing') return;
    const previous = this.activePlayerId;
    this.#turnElapsed = 0;
    this.#hasFired = false;

    let nextIndex = this.#turnIndex;
    for (let attempt = 0; attempt < this.#turnOrder.length; attempt++) {
      nextIndex = (nextIndex + 1) % this.#turnOrder.length;
      if (this.isPlayerAlive(this.#turnOrder[nextIndex])) break;
    }

    const wrapped = nextIndex <= this.#turnIndex;
    this.#turnIndex = nextIndex;

    this.#events.emit('turn_end', { playerId: previous, next: this.activePlayerId });

    if (wrapped) {
      this.#round += 1;
      this.#world.services.match.round = this.#round;
      this.#onRoundStart();
      // #onRoundStart kann das Match beendet haben (Rundengrenze). Dann darf
      // kein weiterer Zug mehr eröffnet werden.
      if (this.#status !== 'playing') return;
    }

    this.#beginTurn(nextIndex);
  }

  #onRoundStart() {
    // Harte Rundengrenze: ohne sie kann ein Match mit vielen Fehlschüssen
    // unbegrenzt laufen. Bei Überschreitung gewinnt das Team mit der meisten
    // verbleibenden Gesundheit — deterministisch, kein Unentschieden-Fallback.
    if (this.#round > this.maxRounds) {
      this.#finishByAttrition();
      return;
    }

    if (this.#round >= MATCH_RULES.suddenDeath.roundBreakpoint) {
      if (!this.#maelstrom.isActive) this.#maelstrom.activate();
      this.#maelstrom.contract(this.#world);
      this.#world.services.match.knockbackMultiplier =
        1 + MATCH_RULES.suddenDeath.knockbackPercentBonus / 100;
    }
    const wind = this.#rollWind();
    this.#wind = wind;
    this.#currentStrength = wind * 10;
    this.#world.services.match.wind = wind;
    this.#world.services.match.currentStrength = this.#currentStrength;
    this.#spawnRoundLoot();
    this.#events.emit('round_start', { round: this.#round, wind });
    /*
     * Geschütze feuern am Rundenanfang — nach `round_start`, damit die Anzeige
     * den Rundenwechsel vor den Schüssen sieht.
     *
     * Einmal je Runde und nicht je Zug: Sonst träfe ein Geschütz je nach
     * Zugreihenfolge unterschiedlich oft, und mit vier Spielern viermal so oft
     * wie mit zwei.
     */
    this.#fireTurrets();
  }

  /**
   * Ends the match because the round limit is reached. Der Sieger ist das Team
   * mit der höchsten Summe verbleibender Gesundheit; bei Gleichstand gewinnt
   * das niedrigere Team-ID (stabil und damit deterministisch).
   */
  #finishByAttrition() {
    const healthByTeam = new Map();
    for (const entry of this.#players) {
      const health = entry.alive
        ? (this.#world.getComponent(entry.entityId, 'Health', 'current') || 0)
        : 0;
      // Ein Gefallener trägt nichts bei. Vorher entschied hier `isActive` —
      // und damit eine möglicherweise wiederverwendete ID (siehe
      // `#registerSystems`): Eine Kiste auf dem Platz des Toten hätte ihm
      // dessen Restgesundheit wieder zugeschrieben.
      healthByTeam.set(entry.teamId, (healthByTeam.get(entry.teamId) ?? 0) + health);
    }

    let winner = null;
    let best = -1;
    for (const [teamId, health] of [...healthByTeam.entries()].sort((a, b) => a[0] - b[0])) {
      if (health > best) {
        best = health;
        winner = teamId;
      }
    }

    this.#status = 'gameover';
    this.#winnerTeamId = winner;
    this.#events.emit('match_over', {
      winnerTeamId: winner,
      rounds: this.#round,
      ticks: this.#world.tickCount,
      reason: 'round_limit',
      healthByTeam: Object.fromEntries(healthByTeam),
    });
  }

  #beginTurn(index) {
    const entityId = this.#turnOrder[index];
    // Lebensstatus des Spielers, nicht der ECS-Platz (siehe #checkVictory).
    if (!this.isPlayerAlive(entityId)) return;

    // Zustände dieses Zuges abrechnen: Schaden über Zeit wirkt, Dauern klingen ab.
    // Die Abrechnung gehört an den ZUGbeginn, nicht in step(): sonst hinge der
    // Schaden an der Tickrate statt an den Zügen und wäre bei anderer Zugzeit
    // ein anderer.
    const turnState = this.#statuses.advanceTurn(entityId);

    // Nachladezeiten dieses Spielers um einen Zug herunterzählen. Bewusst VOR
    // der Einfrier-Prüfung: eine Pause soll auch dann ablaufen, wenn der Spieler
    // seinen Zug aussetzt.
    this.#tickCooldowns(entityId);

    /*
     * Sprünge zu Beginn des Zuges zurücksetzen.
     *
     * Der Zähler begrenzt seit 2026-09-27 KEINE Anzahl mehr (die Obergrenze ist
     * entfallen, siehe `jump()`): Er unterscheidet nur noch, ob der Spieler in
     * diesem Zug schon einmal abgesprungen ist. Daran hängt EINE Regel — der
     * erste Sprung eines Zuges geht nur vom Boden. Der Reset gehört deshalb an
     * den Zugbeginn („je Zug") und nicht ans Landen („je Flugphase"): Ein Reset
     * beim Landen würde die Bodenregel aufheben.
     */
    this.#jumpsUsed.set(entityId, 0);

    if (turnState.damage > 0 && this.isPlayerAlive(entityId)) {
      this.#world.getSystem('damage')?.applyDamage(this.#world, entityId, turnState.damage, null);
      this.#events.emit('dot_tick', {
        playerId: entityId,
        damage: turnState.damage,
        elements: turnState.elements,
      });
    }

    // Eingefroren: der Spieler setzt diesen Zug aus. `advanceTurn` hat die
    // Dauer bereits heruntergezählt, deshalb endet die Wirkung von selbst.
    if (turnState.frozeThisTurn && this.isPlayerAlive(entityId) && this.#status === 'playing') {
      this.#events.emit('turn_skipped', { playerId: entityId, reason: 'frozen' });
      this.endTurn();
      return;
    }

    this.#world.getSystem('turn')?.startTurn();
    if (this.#maelstrom.isActive) this.#maelstrom.applyToxicRain(this.#world);
    this.#events.emit('turn_start', { playerId: entityId, round: this.#round, wind: this.#wind });
  }

  #rollWind() {
    return Math.round(this.#rng.nextFloat(-MAX_WIND, MAX_WIND) * 10000) / 10000;
  }

  #checkVictory() {
    const aliveTeams = new Set();
    for (const entry of this.#players) {
      /*
       * Der Lebensstatus des SPIELERS entscheidet, nicht `isActive`.
       *
       * Fund (belegt): Das ECS vergibt die IDs gefallener Entities neu. Starb
       * eine Figur und erbte eine Kiste ihre ID, meldete `isActive` sie als
       * lebendig — das ausgelöschte Team galt damit weiter als vorhanden und die
       * Runde endete nie durch Ausschaltung. Nachgestellt: vier gefallene
       * Figuren, Status weiterhin „playing", Runde 8 (siehe
       * tests/victory-elimination.test.js).
       */
      if (entry.alive) aliveTeams.add(entry.teamId);
    }
    if (aliveTeams.size <= 1) {
      this.#status = 'gameover';
      this.#winnerTeamId = aliveTeams.size === 1 ? [...aliveTeams][0] : null;
      this.#events.emit('match_over', {
        winnerTeamId: this.#winnerTeamId,
        rounds: this.#round,
        ticks: this.#world.tickCount,
        reason: 'elimination',
      });
    }
  }

  // -------------------------------------------------------------- Zugriff

  surfaceYAt(x) {
    /*
     * Je Spalte nur EINMAL gesucht.
     *
     * Fund (belegt, Audit 2026-10-09): `findSurfaceY` tastet die Spalte von oben
     * ab (bis zu 1440 Zellen). Die Geschütz-Zielsuche (`#simulateTurretPath`)
     * ruft das je Bahnschritt zweimal auf, über das ganze Raster aus Kraft und
     * Winkel — gemessen 25–38 ms in einem einzelnen Tick (Budget 16,7 ms).
     *
     * Der Cache ist folgenlos für die Simulation: `#bitmap` ist die Karte AUS DEM
     * AUFBAU und wird nie verändert (Krater gehen in die Kollisionsmaske
     * `#terrain`, nicht in die Bitmap), die Antwort hängt also nur von `x` ab.
     */
    const spalte = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    if (Number.isNaN(spalte)) return -1;
    let boden = this.#oberflaeche[spalte];
    if (boden === OBERFLAECHE_UNBEKANNT) {
      const gesucht = findSurfaceY(this.#bitmap, this.width, this.height, spalte);
      boden = gesucht < 0 ? -1 : gesucht;
      this.#oberflaeche[spalte] = boden;
    }
    return boden;
  }

  /**
   * Füllstand des Wassers an einer Weltposition (0..1).
   *
   * Die Abfrage stand vorher an zwei Stellen inline (Abwurf und Figurenphysik)
   * — mit unterschiedlichen Ersatzwegen, falls das Feld die Methode nicht
   * anbietet. Hier gebündelt, damit die Anzeige denselben Wert sieht wie die
   * Simulation.
   */
  waterLevelAt(worldX, worldY) {
    if (!this.#water) return 0;
    const x = Math.max(0, Math.min(this.width - 1, worldX ?? 0));
    const y = Math.max(0, Math.min(this.height - 1, worldY ?? 0));
    const roh = typeof this.#water.levelAtWorld === 'function'
      ? this.#water.levelAtWorld(x, y)
      : this.#water.getLevel(Math.floor(x), Math.floor(y));
    return clampWaterLevel(roh);
  }
  /**
   * Sammelt die Werte, die `erzeugeSpieler` liest.
   *
   * ## Warum diese Methode gibt
   *
   * Der Spieler-Spawn soll rein bleiben und bekommt deshalb keine
   * `this`-Zugriffe mehr, sondern diese Quelle — dieselbe Haltung wie
   * `#zustandsQuelle()` für den Ansichtszustand.
   *
   * `drySpawnX` bleibt als Funktion im Match (sie hängt an `surfaceYAt`,
   * `waterLevelAt` und der Kartenbreite) und wird als Rückfrage hineingereicht.
   *
   * @returns {object} die Quelle für `erzeugeSpieler`
   */
  #spawnQuelle() {
    return {
      teams: this.teams,
      playersPerTeam: this.playersPerTeam,
      width: this.width,
      height: this.height,
      drySpawnX: idealX => this.#drySpawnX(idealX),
      surfaceYAt: x => this.surfaceYAt(x),
      world: this.#world,
      inventory: this.#inventory,
      sidegrades: this.sidegrades,
      loadouts: this.loadouts,
      baseHealth: this.baseHealth,
      resolveLoadout,
    };
  }


  /**
   * Setzt den Wasserstand an einer Weltposition (Gegenstück zu `waterLevelAt`).
   *
   * Gedacht für Tests, Kulissenbau und Diagnose: Wassertiefe ist sonst nur über
   * das interne Raster erreichbar, was jede Prüfung an die Rasterrechnung
   * koppelt. Die Zelle wird begrenzt, außerhalb der Karte passiert nichts.
   *
   * @returns {boolean} true, wenn der Wert gesetzt wurde
   */
  setWaterLevelAt(worldX, worldY, level) {
    if (!this.#water) return false;
    const zelle = typeof this.#water.toGrid === 'function'
      ? this.#water.toGrid(worldX, worldY)
      : { x: Math.floor(worldX / WATER_SCALE), y: Math.floor(worldY / WATER_SCALE) };
    if (!Number.isFinite(zelle.x) || !Number.isFinite(zelle.y)) return false;
    if (zelle.x < 0 || zelle.x >= this.#water.width) return false;
    if (zelle.y < 0 || zelle.y >= this.#water.height) return false;
    this.#water.setLevel(zelle.x, zelle.y, clampWaterLevel(level));
    return true;
  }

  /**
   * Flutet einen kleinen Bereich um einen Punkt.
   *
   * ## Warum nicht eine einzelne Zelle
   *
   * Fund (belegt): Ein Wasserschub, der genau eine Zelle flutet, wirkt für die
   * Anzeige NICHT. Das Wasserfeld ist ein Raster aus 4 px großen Zellen
   * (WATER_SCALE), und zwei Dinge fallen auseinander:
   *
   *   - Der Zustand einer Figur liest `waterLevelAt(figur.x, figur.y)` — die
   *     MITTE der Figur.
   *   - Die Figur steht auf `Boden - HALF_HEIGHT` (10 px), ihr Fuß also zehn
   *     Pixel unter der abgefragten Stelle.
   *
   * Bei 4-px-Zellen liegen Zentrum und Fuß in verschiedenen Zellen. Wird nur die
   * Bodenzelle geflutet, meldet der Zustand weiter 0 — und die Ertrinkgefahr im
   * CharacterSystem greift nie. Gemessen: `waterLevelAt(600, 420)` = 0,5,
   * `state.waterLevel` = 0.
   *
   * Deshalb wird ein Bereich geflutet, der Zentrum UND Fuß abdeckt. Der Bereich
   * ist bewusst klein (Standard: 16 × 20 px): Es soll ein Wasserloch entstehen,
   * kein See.
   *
   * Der vorhandene Füllstand wird nie verringert — mehrfaches Treffen macht die
   * Stelle tiefer, ein Schuss in trockenes Gelände hebt sie auf das Niveau der
   * Waffe.
   *
   * @param {number} worldX
   * @param {number} worldY - Bezugspunkt (Mitte der Figur)
   * @param {number} level - Ziel-Füllstand
   * @param {object} [optionen]
   * @returns {{zellen:number, hoechster:number}} geflutete Zellen und Höchststand
   */
  floodArea(worldX, worldY, level, { radiusX = 8, radiusY = 10 } = {}) {
    if (!this.#water) return { zellen: 0, hoechster: 0 };
    let zellen = 0;
    let hoechster = 0;
    for (let dx = -radiusX; dx <= radiusX; dx += WATER_SCALE) {
      for (let dy = -radiusY; dy <= radiusY; dy += WATER_SCALE) {
        const x = worldX + dx;
        const y = worldY + dy;
        const vorher = this.waterLevelAt(x, y);
        const ziel = clampWaterLevel(Math.max(vorher, level));
        if (ziel > vorher && this.setWaterLevelAt(x, y, ziel)) zellen += 1;
        if (ziel > hoechster) hoechster = ziel;
      }
    }
    return { zellen, hoechster };
  }

  /**
   * Lebt dieser SPIELER noch?
   *
   * Nicht `world.isActive` benutzen: Das ECS vergibt die IDs gefallener
   * Entities neu, und dann liegt unter derselben ID eine Kiste (siehe
   * `#registerSystems`). Diese Methode ist die einzige verlässliche Auskunft
   * über den Lebensstatus einer Figur.
   */
  isPlayerAlive(playerId) {
    return this.#players.find(entry => entry.entityId === playerId)?.alive === true;
  }

  /** Setzt die Zugzeit neu (Spielvarianten, Tests, Turniermodus). */
  setTurnDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new TypeError('Zugzeit muss eine positive Zahl in Millisekunden sein');
    }
    this.#turnDurationMs = ms;
    this.#world.getSystem('turn')?.resetTimer(ms);
    return this;
  }

  /** Setzt die Zugzeit auf die Konfiguration der Spielerzahl zurück. */
  resetTurnDuration() {
    this.#turnDurationMs = this.#world.getSystem('turn')?.turnDuration ?? this.#turnDurationMs;
    return this;
  }

  consumeEvents() {
    return this.#events.flush();
  }

  /**
   * Der Ansichtszustand — was der Client zeichnet, was der Server verschickt und
   * was `stateHash()` hashed.
   *
   * ## Warum hier nur noch delegiert wird
   *
   * Der Aufbau des Zustands stand bis 2026-09-26 als 149-Zeilen-Rumpf in dieser
   * Methode und griff dabei 39-mal in private Felder. Als reine Funktion
   * `baueAnsichtszustand(quelle)` liegt er in `engine/stateSnapshot.js` — mit
   * denselben Feldnamen in derselben Reihenfolge, denn `hashState()` hashed die
   * Reihenfolge mit.
   *
   * Was hier bleibt, ist die KOPPLUNG: `#zustandsQuelle()` benennt jede
   * einzelne Angabe, die der Zustand liest. Diese Liste ist die Schnittstelle —
   * ein neues Feld im Zustand braucht einen Eintrag dort.
   */
  getState() {
    return baueAnsichtszustand(this.#zustandsQuelle());
  }

  /**
   * Sammelt genau die Werte, die der Ansichtszustand liest.
   *
   * ## Warum es diese Methode gibt
   *
   * `getState()` zog seine Daten vorher direkt aus der halben Klasse (39
   * Zugriffe auf private Felder). Der Zustandsaufbau soll rein bleiben und
   * bekommt deshalb keine `this`-Zugriffe mehr, sondern diese Quelle. Jeder
   * Eintrag hier ist eine bewusste Kopplungs-Entscheidung: Wer den Zustand
   * erweitert, sieht an EINER Stelle, was er dafür preisgibt — statt es
   * zwischen 149 Zeilen Aufbaulogik zu suchen.
   *
   * ## Die Entscheidungen im Einzelnen
   *
   *  - Was er schon fertig rechnen kann, wird fertig übergeben: `statuses` und
   *    `guenther` als ABZUG (`snapshot()`), `maelstrom` als Paar
   *    `{active, inset}`, `turrets` als Liste. `stateSnapshot.js` kennt damit
   *    weder `StatusStore` noch `GuentherSystem` noch `MaelstromSystem` — nur
   *    Zahlen, Wahrheitswerte und Felder.
   *  - Was FALLWEISE gebraucht wird, geht als Rückfrage hinein:
   *    `waterLevelAt(x, y)` (Wassertiefe, mit der Begrenzung dieser Klasse) und
   *    `cooldownFor(playerId, weaponId)` (Nachladezeit je Waffe). Beide werden
   *    je Figur bzw. je Waffe aufgerufen; sie vorab auszurechnen hieße, die
   *    Schleife aus dem Zustandsaufbau hierher zu duplizieren.
   *  - `world` geht als GANZES hinein: Der Zustand liest Komponenten
   *    (`Position`, `Health`, `Weapon`, `Projectile`, `Crate`), fragt Entities
   *    nach Signatur ab und braucht den Taktzähler. Ein Vorrat einzelner Felder
   *    bildet das nicht ab, und die Welt ist ohnehin schon öffentlich
   *    (`get world()`).
   *  - `players` wird NICHT kopiert: Der Aufbau liest die Einträge nur. Eine
   *    Kopie je Zustandsabruf wäre Aufwand ohne Wirkung — `getState()` läuft im
   *    Anzeigetakt.
   *
   * ## Vertrag
   *
   * Die Schlüssel hier sind die Eingabe von `baueAnsichtszustand()`. Wer einen
   * davon umbenennt, muss es dort mitziehen — `#zustandsQuelle()` und die
   * Funktion in `engine/stateSnapshot.js` gehören zusammen.
   */
  #zustandsQuelle() {
    return {
      // Spielerliste: Stammdaten, Klassenzuordnung, `alive`, Anzeigename.
      players: this.#players,
      // Die Welt: Komponenten, Signaturen, Taktzähler.
      world: this.#world,
      // Wassertiefe an einer Weltposition — die Begrenzung auf die Karte und
      // die Rasterrechnung bleiben in dieser Klasse.
      waterLevelAt: (x, y) => this.waterLevelAt(x, y),
      // Ausrüstung: aktive Waffe, Waffenliste, Munition je Waffe.
      inventory: this.#inventory,
      // Nachladezeit je Waffe in Zügen — wird je belegter Waffe abgefragt.
      cooldownFor: (playerId, weaponId) => this.cooldownFor(playerId, weaponId),
      // Matchzustand: der Rundenzähler und alles, was den Zug beschreibt.
      status: this.#status,
      round: this.#round,
      maxRounds: this.maxRounds,
      wind: this.#wind,
      turnElapsedMs: this.#turnElapsed,
      turnDurationMs: this.#turnDurationMs,
      activePlayerId: this.activePlayerId,
      winnerTeamId: this.#winnerTeamId,
      // Zustände je Spieler (Schild, eingefroren, Schaden über Zeit, Bonus)
      // als Abzug — die Anzeige bekommt dieselben Zahlen wie der Hash.
      statuses: this.#statuses.snapshot(),
      // Der Mahlstrom: vor dem Start gibt es ihn noch nicht (siehe `?.`).
      maelstrom: {
        active: this.#maelstrom?.isActive ?? false,
        inset: this.#maelstrom?.inset ?? 0,
      },
      // Aufgestellte Geschütze — schlichte Einträge, keine ECS-Entities.
      turrets: [...this.#turrets.values()],
      // Kartengröße und Ausrichtung (für die Anzeige und die Umrechnung).
      terrainWidth: this.width,
      terrainHeight: this.height,
      orientation: this.orientation,
      // Günther ebenso als Abzug: Sein Aufbau liegt im GuentherSystem.
      guenther: this.#guenther ? this.#guenther.snapshot() : null,
      // Die Kulisse als Kennungen — der Client baut sie aus dem Seed selbst.
      scenery: this.scenery,
    };
  }

  serialize() {
    return {
      seed: this.#seedManager.serialize(),
      round: this.#round,
      turnIndex: this.#turnIndex,
      turnElapsed: this.#turnElapsed,
      wind: this.#wind,
      status: this.#status,
      winnerTeamId: this.#winnerTeamId,
      world: this.#world.serialize(),
      inventory: this.#inventory.serialize(),
      players: this.#players.map(entry => ({ ...entry })),
      turnOrder: [...this.#turnOrder],
      maelstrom: { active: this.#maelstrom?.isActive ?? false, inset: this.#maelstrom?.inset ?? 0 },
      water: this.#water.serialize(),
    };
  }

  /**
   * Ein Hash über den spielrelevanten Zustand — das Beweismittel für
   * Determinismus.
   *
   * ## Warum der Hash vollständig sein MUSS
   *
   * Er ist das Werkzeug, mit dem Replay-Reproduzierbarkeit belegt wird: Zwei
   * Läufe mit demselben Seed müssen denselben Hash ergeben, und eine
   * Abweichung muss ihn ändern. Lässt er Zustand aus, belegt er weniger, als
   * er behauptet — eine Divergenz bliebe unbemerkt.
   *
   * ## Der Befund, der zu dieser Fassung führte
   *
   * Ein Code-Audit stellte fest: Die frühere Fassung hashte nur `round`, `tick`,
   * `wind`, `activePlayerId`, Position/Leben der Figuren und die Position der
   * Geschosse. **Gemessen und belegt:**
   *
   *   A activeWeaponId: pa_041 | inventory: [5 Waffen]
   *   B activeWeaponId: pa_101 | inventory: [3 andere]
   *   Hash A: 5c9a556d
   *   Hash B: 5c9a556d   ← identisch, obwohl die Ausrüstung völlig anders ist
   *
   * Ein Replay, in dem eine Figur eine andere Waffe trägt oder eingefroren ist,
   * hätte also „gleich" gemeldet.
   *
   * ## Was jetzt aufgenommen wird
   *
   * Ausrüstung und Munition je Figur, die Zustände (Schild, eingefroren), die
   * Geschütze, der Mahlstrom und seine Verengung, die Kisten, der Sieger und
   * die verstrichene Zugzeit.
   *
   * ## Warum gerundet wird
   *
   * Positionen und Leben gehen gerundet ein: Der Hash soll eine DIVERGENZ
   * anzeigen, nicht die letzte Nachkommastelle einer Fließkommarechnung. Zwei
   * Läufe, die sich um 1e-12 unterscheiden, sind reproduzierbar; zwei, die um
   * 1 px abweichen, nicht.
   */
  /**
   * Delegiert an `engine/stateSnapshot.js` — dort steht, warum der Hash eine
   * reine Funktion ist.
   */
  stateHash() {
    return hashState(this.getState());
  }

  get world() { return this.#world; }
  get terrain() { return this.#terrain; }
  /*
   * `get bitmap()` stand hier ein ZWEITES Mal (wortgleich, 1000 Zeilen nach der
   * ersten Fassung). In JavaScript gewinnt die letzte — die erste war toter
   * Code. Der Zugriff bleibt über die dokumentierte Fassung oben erhalten;
   * aufgefallen ist die Dopplung erst durch `no-dupe-class-members`.
   */
  get water() { return this.#water; }
  get events() { return this.#events; }
  get inventory() { return this.#inventory; }
  /** Laufende Zustände der Spieler (Schild, Einfrieren, Schaden über Zeit). */
  get statuses() { return this.#statuses; }
  get players() { return [...this.#players]; }
  get status() { return this.#status; }
  get round() { return this.#round; }
  get wind() { return this.#wind; }
  get winnerTeamId() { return this.#winnerTeamId; }
  get seedManager() { return this.#seedManager; }
  get maelstrom() { return this.#maelstrom; }
  /** Aktuelle Zugzeit in Millisekunden (für Persistenz und Replay). */
  get turnDurationMs() { return this.#turnDurationMs; }

  get activePlayerId() {
    const id = this.#turnOrder[this.#turnIndex];
    return this.#world?.isActive(id) ? id : null;
  }

  get activeProjectileCount() {
    return this.#world
      .getEntitiesBySignature(COMPONENT_SIGNATURES.PROJECTILE)
      .filter(id => this.#world.isActive(id)).length;
  }
}

export default MatchController;
