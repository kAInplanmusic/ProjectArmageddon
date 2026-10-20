/**
 * Canvas-Renderer für Project Armageddon.
 *
 * Terrain wird einmalig aus dem Bitmap in eine Offscreen-Ebene gezeichnet und
 * danach ausschliesslich über dieselben Ereignisse verändert, die auch die
 * CollisionMask verändern (Krater, Mahlstrom-Kontraktion). Dadurch können
 * sichtbares Terrain und Physik nicht auseinanderlaufen.
 *
 * @module renderer
 */
import { WATER_SCALE } from '../engine/match.js';
import { TEAM_COLORS } from '../engine/match.js';
import { paletteFor, DEFAULT_TERRAIN_PALETTE } from '../shared/config/backdrops.js';
import { GUENTHER_IDENTITY } from '../shared/config/guenther.js';
import { prefersReducedMotion } from './dom.js';
import {
  erzeugePartikel, schreitePartikelFort,
  erzeugeStrahl, erzeugeBlitz, schreiteEffekteFort,
} from './effects.js';
import { bakeTerrainLayer, detectWebGpu } from './terrainBaker.js';
import {
  zeichneZielhilfe, zeichneVorhersage, zeichneGeschoss, zeichneSpur, zeichneExplosion,
  zeichneFunken, zeichneSchadenszahl, zeichneKraterRuss, zeichneNarbe, zeichneTruemmer,
  zeichneGeschossSprite, zeichneSchweif, zeichneStartGlanz,
} from './effektStil.js';
import {
  materialStil, zeichneBrandspur, zeichneBohrwand, zeichneBebenRisse, loescheLaeufe, setzeSchuttZellen, verschiebeZellen,
  erzeugeFlugSchutt, schreiteFlugSchutt, zeichneFlugSchutt,
} from './schuttOptik.js';
import { kraterUmriss, erzeugeTruemmer, schreiteTruemmerFort, erzeugeStaub, inselGrenzen, inselStaub, inselTruemmer, aufprallEffekt } from './zerstoerungOptik.js';
import { Inselfall } from './inselfall.js';
import { findeZahlen, ergaenzeZahlen, schreiteZahlenFort } from './schadenszahlen.js';
import {
  zeichneSoldat, zeichneRohr, zeichneFigurSprite, zeichneWaffeInHand, zeichneWaffeSprite, handFarbeFuer, zeichneAuraRing, zeichneNamensschild,
  figurSkalaFuer, FUSS_ABSTAND, SPRITE_HOEHE, HAND_HOEHE,
} from './figuren.js';
import { bereichInKarte } from './sichtbereich.js';
import { charakterFuer, KLASSISCH } from '../shared/config/darstellung.js';
import { holeFigur, holeWaffenIkone } from './figurenBilder.js';
import { FigurEffekte } from './figurEffekte.js';
import { PARAMETER, typFuer } from './figurTypen.js';
import { FACTIONS } from '../shared/config/factions.js';
import { holeWaffenSprite } from './waffenSprites.js';
import {
  parameterFuerWaffe, waffenPose, neuePose, neueZeiten, handPunkt, figurHand,
  GeschossLagen, geschossDarstellung, geschossWinkel,
} from './waffenAnimation.js';
import { WEAPONS_BY_ID } from '../shared/config/weapons.js';
import { FigurPosen, fallPose, NEIGUNG_MAX } from './figurAnimation.js';
import { veredleGelaende, baueGelaendeEbene, zeichneKraterRand, bodenArt } from './gelaendeStil.js';
import { mischeRgb as mischeFarbe } from './stil.js';
import {
  plazierePflanzen, zeichnePflanzenSchicht, zeichnePflanzenAusschnitt, entfernePflanzenImKrater, entfernePflanzenAmRand, pflanzenStreifen, pflanzenRahmen,
} from './pflanzen.js';
import { omenZustand, zeichneOmen } from './valhallaOmen.js';
import {
  erzeugeMuendungsfeuer, muendungsfeuer, rueckstossVersatz, ROHR_LAENGE,
  fadenkreuzSegmente, pulsFaktor, blitzPuls, ladungAnteil,
} from './weaponAnimation.js';
import {
  drawSky as drawGenerativeSky,
  drawAmbient,
  drawLandmarks,
  drawWaterSurface,
} from './sceneryPainter.js';

/** Darstellungsgröße des Soldaten gegenüber dem 14 × 20 Pixel großen Körper (nur Anzeige). */
const FIGUR_SKALA = 1.5;
const FIGUR_HOCH = -5;

/** Die hintere Kulisse wird nur jedes n-te Bild neu gezeichnet (siehe `#drawKulisse`). */
const KULISSE_BILDER = 3;
/** Anteil der Bildhöhe (von oben), in dem das bewegte Ambiente liegt; nur dieser Streifen wird aufgelegt. */
const KULISSE_BEWEGT_ANTEIL = 0.7;
import {
  findeTreffer, trefferMarke, zuckVersatz,
  ruckFuer, ruckAufprall, altereRuck, ruckVersatz,
  ergaenzeNarbe, verlaengereSpur,
  rauchWolke, schreiteRauchFort, rauchDarstellung,
} from './gefuehl.js';
/*
 * Die Kisten-ARTEN für die Zeichnung. Die Zuordnung Zahl → Art steht einmal im
 * Motor (`CRATE_TYPES`); hier gelesen, nicht als zweite Zahlenliste geführt —
 * sonst zeigte die Anzeige irgendwann eine andere Kiste als die, die dort liegt.
 */
import { CRATE_TYPES } from '../engine/systems/lootSystem.js';

/**
 * Kulissen-URLs, von Vite aufgelöst.
 *
 * `import.meta.glob` statt eines selbstgebauten Pfades: Vite vergibt im Build
 * einen Hash-Namen und legt die Datei unter `/assets/` ab. Ein hart notierter
 * Pfad wie `assets/backdrops/maritime_calm_day.jpg` würde im Build ins Leere
 * zeigen — genau der Fehler, an dem die Waffen-Icons schon einmal scheiterten.
 *
 * Der Pfad ist RELATIV ZU DIESER DATEI (`./assets/...`, nicht `../assets/...`):
 * `../` führte von `src/client/` nach `src/` und damit an den Bildern vorbei. Das
 * Glob-Muster liefert dann stillschweigend eine leere Liste — kein Fehler, nur
 * ein leerer Hintergrund. Der Selbsttest in `tests/backdrops.test.js` prüft die
 * Anzahl deshalb gegen die Dateien auf der Platte.
 */
const BACKDROP_URLS = import.meta.glob('./assets/backdrops/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const SKY_TOP = '#0d1b2a';
const SKY_BOTTOM = '#1b3a4b';
const CRATE_COLORS = ['#dcdcdc', '#4cc9f0', '#a855f7', '#fbbf24'];
const RARITY_COLORS = ['#e8eef5', '#4cc9f0', '#a855f7', '#fbbf24'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.terrainLayer = null;
    this.pflanzen = [];
    this.pflanzenSchicht = null;
    /** Ob die Wasserebene schon berechnet wurde (sonst muss `#drawWater` rechnen). */
    this.wasserFertig = false;
    this.wasserRahmen = null;
    /** Streifen der Pflanzenebene, die tatsächlich aufgelegt werden. */
    this.pflanzenStreifen = [];
    this.waterLayer = document.createElement('canvas');
    this.waterLayer.width = Math.ceil(this.width / WATER_SCALE);
    this.waterLayer.height = Math.ceil(this.height / WATER_SCALE);
    this.waterCtx = this.waterLayer.getContext('2d');
    this.particles = [];
    /**
     * Zugänglichkeit: Bei „Bewegung reduzieren" entfallen die Partikel.
     *
     * Sie sind der einzige Effekt, der sich im Bild bewegt (Explosionssplitter).
     * Für Menschen mit Vestibularstörungen ist genau das unangenehm. Der Wert
     * wird bei jeder Abfrage gelesen, damit eine Änderung der Systemeinstellung
     * ohne Neuladen greift.
     */
    this.reducedMotion = prefersReducedMotion();
    // Darstellung: Fraktion je Team (lokal vom Menü gesetzt, online je Figur im Zustand).
    this.fraktionJeTeam = null;
    /** Aktuelle Darstellungsgröße der Sprites relativ zur Basisgröße (zoomabhängig, siehe `#figurSkala`). */
    this.figurSkala = 1;
    /** Anzeigefaktor Zeichenfläche -> Bildschirm (CSS-Größe / Bitmapgröße), bei Größenänderung neu gelesen. */
    this.cssFaktor = 1;
    /** Sicherer Bereich in Bildschirmpixeln (ohne HUD-Ränder) oder null. */
    this.sicherBereich = null;
    this.#beobachteAnzeigegroesse();
    // Posen der Sprites und laufende Fall-Effekte (Tod, Ertrinken).
    this.figurPosen = new FigurPosen();
    this.faelle = [];
    this.fallPoseTmp = { dx: 0, dy: 0, rot: 0, alpha: 1, sx: 1, sy: 1, flash: 0 };
    /** Staub, Blasen, Splitter der Figuren (fester Vorrat) und Zeit des letzten Bildes. */
    this.figurEffekte = new FigurEffekte();
    this.figurZeit = 0;
    this.sieger = null;
    /** Zahl der in diesem Bild gezeichneten bzw. übersprungenen (außerhalb des Bildes) Figuren. */
    this.figurStat = { gezeichnet: 0, uebersprungen: 0, stufe: 0 };
    this.akzentJeFraktion = new Map(FACTIONS.map(f => [f.id, f.palette?.[1] ?? null]));
    this.figurPosen.beiLandung = (x, y, staerke, typ) => {
      this.figurEffekte.staub(x, y + FUSS_ABSTAND, staerke, (PARAMETER[typ] ?? PARAMETER.humanoid).staub);
    };
    this.waterFrame = 0;
    this.time = 0;
    /** Vorzeichen von Valhalla (zwei Raben im Blitz): `{start, bildSeed}` oder null. */
    this.omen = null;
    /** Transiente Effekte (Strahlen, Blitze) mit Lebensdauer in Frames. */
    this.effects = [];

    /*
     * ============================ DAS GEFÜHL ============================
     *
     * Die vier Zustände, die aus einem Treffer und einem Einschlag eine
     * RÜCKMELDUNG machen. Sie stehen alle hier — der Renderer ist der einzige,
     * der sie zeichnet, und er ist der einzige, der weiß, welches Bild gerade
     * läuft.
     *
     * Die Rechenkerne liegen in `gefuehl.js` und sind dort ohne Canvas
     * geprüft; hier wird nur gehalten und gezeichnet (dasselbe Muster wie
     * `particles`/`effects`).
     */
    /** Marken der Treffer (Ring, Zucken, Blitz) — altern wie die Effekte. */
    this.trefferMarken = [];
    /** Letzte Gesundheit je Figur — die Grundlage der Trefferkennung. */
    this.letzteWerte = new Map();
    /** Schwebende Schadenszahlen und die Werte des letzten Bildes (siehe `schadenszahlen.js`). */
    this.zahlen = [];
    this.zahlenWerte = new Map();
    /** Treffer des LETZTEN Bildes — der Klang wird in `main.js` gespielt. */
    this.letzteTreffer = [];
    /** Narben der Krater (Brandränder) — begrenzt, siehe `NARBEN_MAX`. */
    this.narben = [];
    /** Trümmer der Zerstörung und abgelöste, fallende Geländeinseln (nur Anzeige). */
    this.truemmer = [];
    /** Fliegende Partikel-Zellen zerbröselnder Inseln (Fassung 4, nur Anzeige). */
    this.flugSchutt = [];
    this.inselfall = new Inselfall();
    /** Rauch nach großen Einschlägen — der Nachhall. */
    this.rauch = [];
    /** Flugspuren je Projektil (`entityId` → Punkte). */
    this.spuren = new Map();
    /** Waffen-Animation: Zeiten je Figur (Ziehen, Schuss), wiederverwendete Pose, Geschosslagen, Zähler. */
    this.waffenZustand = new Map();
    this.waffenZeiten = neueZeiten();
    this.waffenPoseTmp = neuePose();
    this.handTmp = { x: 0, y: 0 };
    this.geschosse = new GeschossLagen();
    this.waffenStat = { sprite: 0, ikone: 0, geschossSprites: 0, geschosseGesamt: 0 };
    /** Letzte Pose je Figur (Diagnose, Tests): `entityId` → Kopie der Felder. */
    this.waffenDiagnose = new Map();
    /** Der laufende Kamera-Ruck (oder `null`). */
    this.ruck = null;
    /**
     * Letzter angewandter Krater: Ort, Radius und Bild.
     *
     * Nötig, weil derselbe Einschlag online ZWEI Ereignisse erzeugt
     * (`explosion` und `terrain_destroyed`, beide mit demselben Radius) und
     * beide `applyCrater` rufen. Ohne diesen Merker bekäme ein Online-Einschlag
     * die doppelte Splitterwolke und den doppelten Rauch — sichtbar, weil die
     * Partikel seit diesem Zug auch GEZEICHNET werden (siehe `render`).
     */
    this.letzterKrater = null;

    /**
     * Geladene Kulisse (Hintergrundbild) oder null.
     * Solange sie nicht geladen ist, wird der Farbverlauf gezeichnet — ein
     * leerer Bildschirm während des Ladens wäre ein Rückschritt gegenueber dem
     * bisherigen Zustand.
     */
    this.backdrop = null;
    /** Schlüssel der aktuellen Kulisse (verhindert doppeltes Laden). */
    this.backdropKey = null;
    /** true, sobald das Bild gezeichnet werden kann. */
    this.backdropReady = false;
    /**
     * Bodenfarben der aktuellen Kulisse.
     *
     * Das Gelände wird prozedural gezeichnet und war immer grün — über einer
     * Eiskulisse also grünes Gras auf Packeis. Der Boden gehört zur Szene.
     */
    this.palette = DEFAULT_TERRAIN_PALETTE;
    /** Generative Kulisse; hat Vorrang vor einem Hintergrundbild. */
    this.scenery = null;
    /** Zwischenbild der hinteren Kulisse (siehe `#drawKulisse`). */
    this.kulissenSchicht = null;

    /*
     * WebGPU: Gerät, wenn vorhanden — sonst `null`.
     *
     * Die Erkennung läuft asynchron (`enableGpu()`), weil `requestAdapter` ein
     * Promise ist. Bis dahin arbeitet der Renderer auf der CPU; es gibt also
     * keinen Moment ohne Darstellung. Ein fehlendes Gerät ist KEIN Fehler: Es
     * ist der Regelfall in Umgebungen ohne GPU (headless, ältere Browser), und
     * dieser Weg ist der geprüfte Hauptpfad.
     */
    this.gpuDevice = null;
    this.gpuAttempted = false;
    /** Beim letzten Backen benutzter Weg ('gpu' | 'cpu') — für Diagnose/Tests. */
    this.gpuTerrainPath = null;
    this.gpuTerrainReason = null;
    /** Zuletzt gebackene Karte (für die GPU-Nachbesserung). */
    this.terrainSource = null;
  }

  /**
   * Fordert ein WebGPU-Gerät an und backt die aktuelle Karte damit neu.
   *
   * Bewusst OPTIONAL: Wer die GPU nicht will oder hat, ruft sie nicht auf. Wird
   * sie nicht aufgerufen, bleibt `gpuDevice` null und alles läuft wie zuvor auf
   * der CPU — es gibt keinen Zwang und keine Warnung.
   *
   * @returns {Promise<{available:boolean, reason:string}>}
   */
  async enableGpu() {
    if (this.gpuAttempted) {
      return { available: Boolean(this.gpuDevice), reason: this.gpuTerrainReason ?? 'bereits versucht' };
    }
    this.gpuAttempted = true;

    const erkennung = await detectWebGpu();
    this.gpuTerrainReason = erkennung.reason;
    if (!erkennung.available) {
      return { available: false, reason: erkennung.reason };
    }

    this.gpuDevice = erkennung.device;
    // Die bereits gebackene Karte noch einmal rechnen — sonst bliebe sie bis
    // zum nächsten Kartenaufbau auf der CPU.
    const quelle = this.terrainSource;
    if (quelle) await this.#applyGpuTerrain(quelle.width, quelle.height, quelle.bitmap);
    return { available: true, reason: 'bereit' };
  }

  /** Gibt das GPU-Gerät frei (Betriebsartwechsel, Matchende). */
  disableGpu() {
    this.gpuDevice = null;
    this.gpuTerrainPath = null;
    this.gpuAttempted = false;
  }

  /**
   * Setzt die generative Kulisse (Himmel, Wasser, Ambiente, Landmarken).
   *
   * Sie hat Vorrang vor einem Hintergrundbild: Die generative Kulisse passt sich
   * jeder Kartengröße an, ein Bild nicht. Ist eine Kulisse gesetzt, wird der
   * Boden aus ihr eingefärbt.
   *
   * @param {object|null} scenery - aus `pickScenery()`
   */
  setScenery(scenery) {
    this.scenery = scenery ?? null;
    if (scenery?.ground) {
      this.palette = { surface: scenery.ground.surface, deep: scenery.ground.deep };
    }
    // Ist eine generative Kulisse gesetzt, wird kein Bild mehr gezeichnet.
    if (scenery) {
      this.backdrop = null;
      this.backdropKey = null;
      this.backdropReady = false;
      this.backdropImage = null;
    }
  }

  /**
   * Setzt die Zeichenfläche auf eine neue Größe.
   *
   * Nötig für Hochkant-Karten: Die Fläche ist nicht mehr fest 1280x720. Die
   * Wasser-Ebene hängt an derselben Größe und wird mitgezogen.
   *
   * @returns {boolean} true, wenn sich die Größe geändert hat
   */
  #liesAnzeigefaktor() {
    const w = this.canvas.clientWidth;
    if (w > 0 && this.canvas.width > 0) this.cssFaktor = w / this.canvas.width;
  }

  #beobachteAnzeigegroesse() {
    this.#liesAnzeigefaktor();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.#liesAnzeigefaktor()).observe(this.canvas);
    }
  }

  resize(breite, hoehe) {
    if (!(breite > 0) || !(hoehe > 0)) return false;
    if (this.width === breite && this.height === hoehe) return false;
    this.width = breite;
    this.height = hoehe;
    this.canvas.width = breite;
    this.canvas.height = hoehe;
    this.#liesAnzeigefaktor();
    this.waterLayer.width = Math.ceil(breite / WATER_SCALE);
    this.waterLayer.height = Math.ceil(hoehe / WATER_SCALE);
    // Die Geländeschicht ist auf die alte Größe gebaut und muss neu entstehen.
    this.terrainLayer = null;
    this.pflanzenSchicht = null;
    this.pflanzenStreifen = [];
    this.wasserFertig = false;
    this.pflanzen = [];
    // Auch die GPU-Nachbesserung braucht die neue Größe; ohne das Aufräumen
    // könnte ein spät eintreffendes GPU-Ergebnis die alte Ebene einsetzen.
    this.terrainSource = null;
    return true;
  }

  /**
   * Setzt die Kulisse für die aktuelle Karte.
   *
   * Das Laden ist asynchron; bis dahin bleibt der Farbverlauf stehen. Ein
   * gescheitertes Laden wird gemeldet und nicht verschwiegen: eine stumm
   * fehlende Kulisse wäre nicht von einer absichtlich leeren zu unterscheiden.
   *
   * @param {{key:string, file:string, label:string}|null} backdrop
   * @param {{onError?:(fehler:Error)=>void}} [optionen]
   */
  setBackdrop(backdrop, { onError } = {}) {
    if (!backdrop?.file) {
      this.backdrop = null;
      this.backdropKey = null;
      this.backdropReady = false;
      this.palette = DEFAULT_TERRAIN_PALETTE;
      return;
    }
    if (backdrop.key === this.backdropKey) return;

    this.backdropKey = backdrop.key;
    // Der Schlüssel muss dem des Glob-Musters entsprechen: `./assets/backdrops/...`
    // — nicht `../`, und nicht nur der Dateiname. Bei einem abweichenden
    // Schlüssel bleibt die Liste leer und es wird still kein Bild geladen.
    const url = BACKDROP_URLS[`./assets/backdrops/${backdrop.file}`];
    if (!url) {
      // Fehlt die Datei, ist der Katalog und die Ablage auseinandergelaufen.
      // Der Farbverlauf bleibt stehen, damit das Spiel spielbar bleibt.
      this.backdrop = null;
      this.backdropReady = false;
      const fehler = new Error(`Kulisse nicht gefunden: ${backdrop.file}`);
      onError?.(fehler);
      return;
    }

    this.backdrop = backdrop;
    this.backdropReady = false;
    // Die Bodenfarbe gilt sofort, nicht erst nach dem Laden des Bildes: sonst
    // zeigte der Boden kurz die vorige Farbe.
    this.palette = paletteFor(backdrop);
    const bild = new Image();
    bild.decoding = 'async';
    bild.onload = () => {
      // Nur übernehmen, wenn inzwischen keine andere Kulisse gesetzt wurde.
      if (this.backdropKey !== backdrop.key) return;
      this.backdropImage = bild;
      this.backdropReady = true;
    };
    bild.onerror = () => {
      this.backdropReady = false;
      onError?.(new Error(`Kulisse lädt nicht: ${backdrop.file}`));
    };
    bild.src = url;
  }

  /**
   * Fügt einen Hitscan-Strahl hinzu (Lebensdauer ~10 Frames).
   * Rein visuell: hat keinen Einfluss auf die Simulation.
   */
  addBeam(fromX, fromY, toX, toY, optionen = {}) {
    // Farbe der Waffe: Strahl und Glühen in ihrer Blitzfarbe (aus dem Sprite-Manifest), sonst Gelb.
    const waffe = optionen.waffeId ? WEAPONS_BY_ID[optionen.waffeId] : null;
    const farbe = waffe ? holeWaffenSprite(waffe)?.flashColor : null;
    this.effects.push(erzeugeStrahl(fromX, fromY, toX, toY, farbe ? { ...optionen, color: farbe } : optionen));
  }

  /** Fügt einen Explosionsblitz an einer Stelle hinzu. */
  addFlash(x, y, radius, optionen = {}) {
    this.effects.push(erzeugeBlitz(x, y, radius, optionen));
  }

  /**
   * Mündungsfeuer an der Waffe einer Figur.
   *
   * Geführt wird die FIGUR, nicht eine Position: Der Blitz wird bei jedem Bild
   * an der AKTUELLEN Stelle der Figur gezeichnet. Ein Schuss, der zwischen
   * Ereignis und Bild noch einen Schritt macht, bekommt sein Feuer damit nicht
   * an der alten Position.
   *
   * @param {number} entityId Schütze
   * @param {number} angle    Schusswinkel (0 = rechts, π/2 = oben)
   */
  addMuzzleFlash(entityId, angle) {
    this.effects.push(erzeugeMuendungsfeuer(entityId, angle));
    this.#waffenState(entityId).schuss = performance.now() / 1000;
  }

  /** Waffe und Flugrichtung eines neuen Geschosses (aus `projectile_spawn`) für die Sprite-Darstellung. */
  merkeGeschoss(projectileId, weaponId, vx, vy) {
    this.geschosse.merke(projectileId, weaponId, vx, vy);
  }

  /** Zeiten der Waffen-Animation einer Figur (einmal je Figur angelegt). */
  #waffenState(entityId) {
    let z = this.waffenZustand.get(entityId);
    if (!z) {
      z = { waffeId: '', par: null, zieh: -1e9, schuss: -1e9 };
      this.waffenZustand.set(entityId, z);
    }
    return z;
  }

  #updateEffects() {
    // Die Alterung liegt in `effects.js` — dort ist sie ohne Canvas prüfbar.
    this.effects = schreiteEffekteFort(this.effects);
    /*
     * Die Marken des Gefühls altern mit DERSELBEN Funktion: Sie haben dieselbe
     * Form (`life`/`decay`), und eine zweite Alterungsregel könnte davon
     * abweichen. Rauch und Ruck haben eigene Regeln (der Rauch steigt, der Ruck
     * hat keine Form), sie stehen deshalb in `gefuehl.js`.
     */
    this.trefferMarken = schreiteEffekteFort(this.trefferMarken);
    this.rauch = schreiteRauchFort(this.rauch);
    this.ruck = altereRuck(this.ruck);
    this.zahlen = schreiteZahlenFort(this.zahlen, this.reducedMotion);
  }

  /**
   * Liest die Gesundheit jeder Figur und macht aus jedem ABSINKEN eine Marke.
   *
   * Der Vergleich steht in `gefuehl.js#findeTreffer`; hier wird nur der Zustand
   * gehalten. Die Treffer des Bildes bleiben in `letzteTreffer` stehen, bis
   * `main.js` sie abholt (`nimmTreffer`) — der Renderer spielt keinen Klang.
   */
  #ermittleTreffer(state) {
    const befund = findeTreffer(this.letzteWerte, state?.entities ?? []);
    this.letzteWerte = befund.zustand;
    this.letzteTreffer = befund.treffer;
    for (const treffer of befund.treffer) this.trefferMarken.push(trefferMarke(treffer));
    const zahlen = findeZahlen(this.zahlenWerte, state?.entities ?? []);
    this.zahlenWerte = zahlen.zustand;
    this.zahlen = ergaenzeZahlen(this.zahlen, zahlen.neu);
  }

  /**
   * Schreibt die Flugspuren fort — und vergisst die verschwundenen Geschosse.
   *
   * Die Karte wird je Bild NEU gebaut: Ein Geschoss, das nicht mehr im Zustand
   * steht, ist eingeschlagen oder verfallen; seine Spur gehört dann nicht mehr
   * ins Bild. Ohne diesen Neubau sammelten sich Spuren toter Geschosse an — und
   * die wiederverwendeten Entity-IDs hängten neue Geschosse an alte Spuren.
   */
  #fuehreSpuren(projektile) {
    const neu = new Map();
    for (const projektil of projektile) {
      const schluessel = projektil?.entityId ?? projektil?.id ?? null;
      if (schluessel === null) continue;
      neu.set(schluessel, verlaengereSpur(this.spuren.get(schluessel), projektil.x, projektil.y));
    }
    this.spuren = neu;
  }

  #drawEffects() {
    for (const effect of this.effects) {
      const alpha = Math.max(0, Math.min(1, effect.life));
      if (effect.kind === 'beam') {
        this.ctx.save();
        // Strahl in der Farbe der Waffe: breites Glühen, Farbkern, heller Kern.
        this.ctx.lineCap = 'round';
        this.ctx.strokeStyle = effect.color;
        this.ctx.beginPath();
        this.ctx.moveTo(effect.fromX, effect.fromY);
        this.ctx.lineTo(effect.toX, effect.toY);
        this.ctx.globalAlpha = alpha * 0.3;
        this.ctx.lineWidth = 11;
        this.ctx.stroke();
        this.ctx.globalAlpha = alpha;
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        this.ctx.globalAlpha = alpha * 0.9;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
        // Einschlagpunkt markieren
        if (effect.hit) {
          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = '#fff3c4';
          this.ctx.beginPath();
          this.ctx.arc(effect.toX, effect.toY, 4 + (1 - effect.life) * 6, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      } else if (effect.kind === 'flash') {
        zeichneExplosion(this.ctx, effect, this.reducedMotion);
      }
    }
  }

  /**
   * Windanzeige als Pfeil im Spielfeld.
   * Länge und Farbe skalieren mit der Windstärke, die Richtung mit dem Vorzeichen.
   */
  #drawWindArrow(wind) {
    const magnitude = Math.abs(wind ?? 0);
    if (magnitude < 0.0005) return;

    const maxWind = 0.05;
    const strength = Math.min(1, magnitude / maxWind);
    const cx = this.width / 2;
    const cy = 46;
    const halfLength = 20 + strength * 46;
    const direction = wind > 0 ? 1 : -1;
    const color = strength > 0.6 ? '#ef476f' : strength > 0.3 ? '#f4a261' : '#8ba0b4';

    // Drei Pfeile, versetzt — liest sich als "Strömung".
    this.ctx.save();
    for (let i = -1; i <= 1; i++) {
      const y = cy + i * 11;
      const alpha = i === 0 ? 1 : 0.35;
      const length = i === 0 ? halfLength : halfLength * 0.65;
      const startX = cx - direction * length * 0.5;
      const endX = cx + direction * length * 0.5;

      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = i === 0 ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
      this.ctx.stroke();

      // Pfeilspitze
      this.ctx.beginPath();
      this.ctx.moveTo(endX - direction * 9, y - 6);
      this.ctx.lineTo(endX, y);
      this.ctx.lineTo(endX - direction * 9, y + 6);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /**
   * Die Ladeanzeige: ein schmaler Balken in der Bildmitte.
   *
   * ## Warum es sie gibt (belegt, 2026-09-27)
   *
   * README und die Tastaturliste versprechen „Klick / Leertaste: Aufladen und
   * feuern" — sichtbar war davon nichts. `InputController#chargeRatio` gab es
   * („nur UI-Feedback"), es hat ihn nur niemand gezeichnet. Wer hielt, sah
   * keinen Unterschied zum Tippen und schoss (damals) auch nicht weiter.
   *
   * ## Warum hier und in dieser Form
   *
   * - **Bildmitte statt unterer Rand**: Der untere Rand der Spielfläche ist vom
   *   HUD-Protokoll belegt (`#hud-log`, ein DOM-Aufsatz ÜBER dem Canvas). Dort
   *   wäre der Balken hinter der Meldungsliste.
   * - **Kein zweites Zielkreuz**: Die Zielhilfe (`#drawAimPreview`) gibt es nur
   *   lokal. Online — wo ebenfalls aufgeladen wird — wäre ein Ring an einer
   *   nicht gezeichneten Zielhilfe unsichtbar. Ein Balken trägt die Aussage in
   *   beiden Betriebsarten.
   * - **Farben und Maße aus dem Bestand**: Dieselbe Orange wie die Zielhilfe
   *   (`rgba(244, 162, 97, …)`) und der dunkle Grund der Flächen (siehe
   *   `SKY_TOP`). Die Spur ist auch bei Anteil 0 sichtbar — sie sagt „es lädt",
   *   bevor der erste Fortschritt messbar ist.
   *
   * Bei `reducedMotion` bewegt sich hier nichts: Der Balken wächst, und Wachsen
   * ist die Aussage, nicht die Bewegung.
   *
   * @param {number} anteil Ladefortschritt 0..1
   */
  #drawLadeanzeige(anteil) {
    // Nur beim Laden sichtbar: Eine leere Spur im Ruhezustand sah aus wie ein schwebender Balken.
    if (anteil === null || anteil === undefined) return;
    const a = Math.max(0, Math.min(1, Number(anteil) || 0));
    const breite = Math.max(140, Math.min(320, this.width * 0.2));
    const hoehe = 10;
    const spurBreite = breite + 4;
    const x = Math.round((this.width - spurBreite) / 2);
    // Etwas unter der Bildmitte: Die Figur am Zug steht im Zentrum, der Balken
    // soll sie nicht verdecken.
    const y = Math.round(this.height * 0.58);

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(13, 27, 42, 0.85)';
    this.ctx.fillRect(x, y, spurBreite, hoehe + 4);
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.85)';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(x, y, spurBreite, hoehe + 4);
    this.ctx.fillStyle = 'rgba(244, 162, 97, 0.95)';
    this.ctx.fillRect(x + 2, y + 2, Math.round(breite * a), hoehe);
    this.ctx.restore();
  }

  /**
   * Explosionsradius-Vorschau am Zielpunkt der Flugbahn.
   * Zeigt, wie groß die Flächenwirkung der gewählten Waffe ist.
   *
   * Der Radius ATMET (`blitzPuls`): Ein stiller Ring ist von einem
   * Geländekreis nicht zu unterscheiden. Bei reduzierter Bewegung bleibt die
   * Größe konstant — die Aussage („so groß ist die Fläche") geht nicht
   * verloren, nur die Bewegung.
   */
  #drawBlastPreview(aimPreview, blastRadius) {
    if (!aimPreview || aimPreview.length === 0 || !blastRadius || blastRadius <= 0) return;
    const impact = aimPreview[aimPreview.length - 1];
    if (!impact) return;

    const puls = blitzPuls(blastRadius, this.time, { reducedMotion: this.reducedMotion });

    this.ctx.save();
    this.ctx.setLineDash([5, 5]);
    this.ctx.lineDashOffset = -puls.strichVersatz;
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(impact.x, impact.y, puls.radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.fillStyle = `rgba(244, 162, 97, ${puls.alpha.toFixed(3)})`;
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Baut die Terrain-Ebene aus dem Terrain-Bitmap auf.
   *
   * Der Rechenkern liegt in `terrainBaker.js` — dort ist er als reine Funktion
   * prüfbar und kann wahlweise auf der GPU laufen. Diese Methode bleibt als
   * SYNCHRONE Schnittstelle erhalten, weil der Renderer sie an mehreren Stellen
   * ohne `await` aufruft (Kartenaufbau, Resize, Online-Rekonstruktion) und ein
   * Umbau auf asynchron dort nichts gewönne: Der GPU-Weg ist beim ersten Bild
   * ohnehin noch nicht bereit.
   *
   * Ist ein Gerät vorhanden, wird der GPU-Weg angestoßen und die Ebene danach
   * ausgetauscht (`#applyGpuTerrain`). Bis dahin steht das CPU-Ergebnis —also
   * nie ein leeres Bild.
   *
   * @param {Uint8Array} bitmap
   * @param {number} width
   * @param {number} height
   */
  buildTerrainLayer(bitmap, width, height) {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;

    // Ein Zug statt Backen + Zurücklesen + Veredeln (siehe `baueGelaendeEbene`): pixelgleich, ohne Doppelarbeit.
    baueGelaendeEbene(layer, bitmap, width, height, this.palette, this.scenery?.seed ?? 0);
    this.terrainLayer = layer;
    this.#baePflanzen(bitmap, width, height);
    /** Zuletzt gebackene Karte — der GPU-Weg braucht Bitmap und Maße erneut. */
    this.terrainSource = { bitmap, width, height };
    /*
     * Der benutzte Weg wird IMMER vermerkt, auch wenn gar kein Gerät da ist.
     *
     * Fund (belegt): Zuerst stand hier nur die Zuweisung im GPU-Zweig. Wer ohne
     * Gerät nach dem Weg fragte, bekam `null` — also keine Auskunft, obwohl die
     * CPU eindeutig der benutzte Weg war. Eine Diagnose, die im Normalfall
     * schweigt, ist keine.
     */
    this.gpuTerrainPath = 'cpu';
    if (!this.gpuTerrainReason) this.gpuTerrainReason = 'WebGPU nicht angefordert';

    // GPU-Nachbesserung anstoßen, falls ein Gerät bereitsteht. Sie ist NICHT
    // Voraussetzung für die Anzeige: Ohne Gerät, ohne Browser-Unterstützung
    // oder bei einem Fehler bleibt es beim CPU-Ergebnis.
    if (this.gpuDevice) this.#applyGpuTerrain(width, height, bitmap);

    return layer;
  }

  /** Setzt Pflanzen auf das Gelände und zeichnet ihre Ebene (hinter dem Gelände, gecacht). */
  #baePflanzen(bitmap, width, height) {
    this.pflanzen = plazierePflanzen(bitmap, width, height, this.scenery?.seed ?? 0, this.scenery?.biomeId ?? null, bodenArt(this.palette.surface));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.pflanzenSchicht = canvas;
    this.#zeichnePflanzenNeu();
  }

  /**
   * Zeichnet die Pflanzenebene neu. Mit `entfernt` (Pflanzen, die gerade aus der Liste genommen wurden)
   * nur den Ausschnitt um sie — pixelgleich, aber ohne die ganze Karte zu leeren und neu zu füllen.
   */
  #zeichnePflanzenNeu(entfernt = null) {
    const schicht = this.pflanzenSchicht;
    if (!schicht) return;
    if (entfernt?.length) {
      let u = null;
      for (const p of entfernt) {
        const r = pflanzenRahmen(p, schicht.width, schicht.height);
        u = u ? { x0: Math.min(u.x0, r.x0), x1: Math.max(u.x1, r.x1), y0: Math.min(u.y0, r.y0), y1: Math.max(u.y1, r.y1) } : r;
      }
      zeichnePflanzenAusschnitt(schicht.getContext('2d'), this.pflanzen, schicht.width, schicht.height, this.palette, u);
    } else {
      zeichnePflanzenSchicht(schicht.getContext('2d'), this.pflanzen, schicht.width, schicht.height, this.palette);
    }
    this.pflanzenStreifen = pflanzenStreifen(this.pflanzen, schicht.width, schicht.height);
  }

  /**
   * Backt die Terrain-Ebene auf der GPU und tauscht sie ein.
   *
   * Bewusst asynchron und fehlertolerant: Ein GPU-Fehler darf das Spiel nicht
   * anhalten. Schlägt der Weg fehl, bleibt die CPU-Ebene stehen — der Spieler
   * sieht keinen Unterschied außer der Rechenzeit.
   */
  async #applyGpuTerrain(width, height, bitmap) {
    try {
      const { layer, path, reason } = await bakeTerrainLayer({
        bitmap,
        width,
        height,
        palette: this.palette,
        device: this.gpuDevice,
        createCanvas: (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          return c;
        },
      });
      /*
       * Nur übernehmen, wenn die Karte noch dieselbe ist: Ein Resize während
       * des Backens hätte sonst eine veraltete Ebene eingesetzt — das Terrain
       * wäre um die neue Größe versetzt.
       */
      const quelle = this.terrainSource;
      if(quelle && (quelle.width !== width || quelle.height !== height || quelle.bitmap !== bitmap)) return;
      if (path === 'gpu') {
        veredleGelaende(layer, bitmap, width, height, this.palette, this.scenery?.seed ?? 0);
        this.terrainLayer = layer;
      }
      this.gpuTerrainPath = path;
      this.gpuTerrainReason = reason;
    } catch (error) {
      this.gpuTerrainPath = 'cpu';
      this.gpuTerrainReason = `GPU-Weg nicht möglich: ${error.message}`;
    }
  }

  /**
   * Stanzt einen Krater in die sichtbare Terrain-Ebene.
   *
   * ## Der Krater war schon da — seine NARBE nicht
   *
   * `destination-out` schneidet ein Loch. Sichtbar ist es, weil dahinter der
   * Himmel steht — aber es liest sich wie „dort ist kein Boden mehr", nicht wie
   * „dort hat es eingeschlagen". Was fehlte, ist die Spur am Rand: ein dunkler
   * Brandrand, der auch dann bleibt, wenn der Blitz und die Splitter längst weg
   * sind. Er wird NICHT ins Terrain gebacken (das wäre eine zweite Wahrheit
   * neben der Kollisionsmaske), sondern als Liste gezeichnet
   * (`#drawNarben`) — begrenzt auf `NARBEN_MAX`.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  applyCrater(x, y, radius, tiefe = null, art = null) {
    if (!this.terrainLayer) return;
    /*
     * Zerstörungsfassung 2: `terrain_destroyed` trägt die wahre Form (`tiefe`). Das
     * `explosion` im selben Bild meldet nur den Flächenradius und schneidet nicht
     * noch einmal — das Loch wäre sonst größer als das der Kollisionsmaske.
     */
    const zuvor = this.letzterKrater;
    if (tiefe === null && zuvor?.tiefe != null && zuvor.zeit === this.time && zuvor.x === x && zuvor.y === y) return;
    const ctx = this.terrainLayer.getContext('2d');
    const umriss = tiefe === null ? null : kraterUmriss(x, y, radius, tiefe);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    if (umriss) {
      ctx.moveTo(umriss[0].x, umriss[0].y);
      for (const punkt of umriss) ctx.lineTo(punkt.x, punkt.y);
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();

    /*
     * Doppelte Krater im SELBEN Bild: siehe `letzterKrater`. Die Ränder, der
     * Rauch und der Ruck gelten für den Einschlag, nicht für das Ereignis —
     * zweimal dasselbe zu zeichnen wäre zweimal derselbe Einschlag.
     */
    const doppelt = Boolean(this.letzterKrater)
      && this.letzterKrater.zeit === this.time
      && this.letzterKrater.x === x
      && this.letzterKrater.y === y
      && this.letzterKrater.radius === radius;
    if (doppelt) return;
    this.letzterKrater = { x, y, radius, tiefe, zeit: this.time };
    if (umriss) zeichneKraterRuss(ctx, umriss, x, y, this.scenery?.seed ?? 0);
    else zeichneKraterRand(ctx, x, y, radius, this.scenery?.seed ?? 0);
    if (umriss && art) this.#charakterSpur(ctx, umriss, x, y, radius, art);
    const weg = [];
    if (entfernePflanzenImKrater(this.pflanzen, x, y, radius, weg)) this.#zeichnePflanzenNeu(weg);

    this.spawnExplosionParticles(x, y, radius);
    this.narben = ergaenzeNarbe(this.narben, x, y, radius);
    if (umriss) this.narben[this.narben.length - 1].umriss = umriss;
    this.rauch.push(...rauchWolke(x, y, radius));
    if (umriss) this.#zerstoerungsOptik(erzeugeTruemmer(x, y, radius, tiefe), erzeugeStaub(x, y, radius, this.#erdfarbe()));
    // Nur ein GROSSER Krater ruckt (siehe `RUCK_SCHWELLE`); ein neuer Ruck
    // ersetzt den alten, damit eine Salve die Kamera nicht aufschaukelt.
    this.ruck = ruckFuer(radius, { reducedMotion: this.reducedMotion }) ?? this.ruck;
  }

  /** Stil von Schutt und Staub nach Bodenart der Karte (Gras, Fels, Schnee, Sand, Asche). */
  #materialStil() {
    return materialStil(bodenArt(this.palette?.surface ?? [96, 138, 92]), this.palette);
  }

  /** Farbe der Erde für Staub und Trümmer: nach Material (Staub der Bodenart, bei Gras das Tiefenbraun der Geländepalette). */
  #erdfarbe() {
    return this.#materialStil().staub;
  }

  /**
   * Zerstörungscharakter der Waffe in der Geländeebene (Fassung 4, reine Optik): Brandspur,
   * Bohrwand oder Beben-Risse. Splitterlöcher und gewöhnliche Sprengungen bleiben beim Kraterruß.
   */
  #charakterSpur(ctx, umriss, x, y, radius, art) {
    const seed = this.scenery?.seed ?? 0;
    if (art === 'brand') zeichneBrandspur(ctx, umriss, x, y, radius, bodenArt(this.palette?.surface ?? [96, 138, 92]), seed);
    else if (art === 'durchschlag') zeichneBohrwand(ctx, umriss);
    else if (art === 'beben') zeichneBebenRisse(ctx, x, y, radius, seed);
  }

  /** `terrain_removed`: Zellen sind ersatzlos weg (Riss einer gebrochenen Insel, abgeplatzte Brocken). */
  entferneZellen(runs, art = null) {
    if (!this.terrainLayer) return;
    loescheLaeufe(this.terrainLayer.getContext('2d'), runs);
    if (art === 'bruch' && !this.reducedMotion) this.#zerstoerungsOptik([], inselStaub(runs, this.#erdfarbe(), 8));
  }

  /** `terrain_added`: Schutt hat sich abgesetzt. */
  setzeSchutt(zellen) {
    if (!this.terrainLayer) return;
    setzeSchuttZellen(this.terrainLayer.getContext('2d'), zellen, this.#materialStil().schutt, this.scenery?.seed ?? 0);
  }

  /** `terrain_slumped`: Setzrutsch, Pixel wandern samt Farbe. */
  setzeRutsch(zuege) {
    if (!this.terrainLayer) return;
    verschiebeZellen(this.terrainLayer.getContext('2d'), this.terrainLayer, zuege);
  }

  /** `terrain_crumble`: Der Rand einer gelandeten Insel platzt ab — Zellen fliegen, Staub steigt auf. */
  bruchOptik(n) {
    if (this.reducedMotion || !Array.isArray(n?.teile)) return;
    if (this.flugSchutt.length < 400) this.flugSchutt.push(...erzeugeFlugSchutt(n.teile, this.#materialStil().schutt, this.scenery?.seed ?? 0));
    const runs = [Math.round(n.x) - 12, Math.round(n.y), Math.round(n.y), Math.round(n.x) + 12, Math.round(n.y), Math.round(n.y)];
    this.#zerstoerungsOptik([], inselStaub(runs, this.#erdfarbe(), 3 + Math.round((n.staerke ?? 0.5) * 4)));
  }

  /** `terrain_quake`: Staubwolken entlang der Oberfläche und ein Bildzittern wie beim harten Aufprall. */
  bebenOptik(n) {
    const staerke = Math.min(1, Number(n?.staerke) || 0.5);
    this.ruck = ruckAufprall(staerke, { reducedMotion: this.reducedMotion }) ?? this.ruck;
    if (this.reducedMotion) return;
    const r = Math.round(n.radius);
    const runs = [];
    for (let i = 0; i < 5; i += 1) runs.push(Math.round(n.x) - r + Math.round(i * r / 2), Math.round(n.y), Math.round(n.y));
    this.#zerstoerungsOptik([], inselStaub(runs, this.#erdfarbe(), 5));
  }

  /** Trümmer und Staub aufnehmen (gedeckelt; bei „Bewegung reduzieren" entfallen sie). */
  #zerstoerungsOptik(truemmer, staub) {
    if (this.reducedMotion) return;
    if (this.truemmer.length < 160) this.truemmer.push(...truemmer);
    if (this.rauch.length < 60) this.rauch.push(...staub);
  }

  /** `terrain_detached`: Eine Geländeinsel löst sich und beginnt zu fallen. */
  starteInsel(id, runs) {
    const befund = this.inselfall.start(this.terrainLayer, id, runs, this.pflanzen);
    if (!befund) return;
    if (befund.pflanzenGeaendert) this.#zeichnePflanzenNeu();
    this.#zerstoerungsOptik(inselTruemmer(runs), inselStaub(runs, this.#erdfarbe(), 4));
  }

  /**
   * `terrain_settled` bzw. Log-Eintrag `['s', dy, ...]`: Die Insel liegt `dy` tiefer.
   * Mit `stumm` (Nachtrag aus dem Log) entfallen Staub und Ruck.
   */
  landeInsel(id, runs, dy, { stumm = false } = {}) {
    if (!this.terrainLayer || !(dy >= 0)) return;
    if (this.inselfall.lande(this.terrainLayer, id, runs, dy, this.pflanzen)) this.#zeichnePflanzenNeu();
    const g = inselGrenzen(runs);
    if (stumm || !g || dy === 0) return;
    const unten = runs.map((wert, i) => (i % 3 === 0 ? wert : wert + dy));
    // Aufprall nach Masse und Fallhöhe: Staub, Druckwellen, Brocken, Bildzittern (alles nur Darstellung).
    const aufprall = aufprallEffekt(unten, dy, this.#erdfarbe());
    this.#zerstoerungsOptik(aufprall.truemmer, aufprall.staub);
    this.ruck = ruckAufprall(aufprall.staerke, { reducedMotion: this.reducedMotion }) ?? this.ruck;
  }

  /**
   * Setzt alles zurück, was sich das Gefühl gemerkt hat.
   *
   * Nötig beim Kartenaufbau (neues Match, Online-Terrain): Sonst wanderten
   * Narben und Spuren der alten Karte in die neue, und die Trefferkennung
   * verglich die Gesundheit der alten Figuren mit der der neuen.
   */
  gefuehlZuruecksetzen() {
    this.particles = [];
    this.trefferMarken = [];
    this.figurPosen.leere();
    this.figurEffekte.leere();
    this.faelle.length = 0;
    this.letzteWerte = new Map();
    this.zahlen = [];
    this.zahlenWerte = new Map();
    this.letzteTreffer = [];
    this.narben = [];
    this.rauch = [];
    this.truemmer = [];
    this.flugSchutt = [];
    this.inselfall.zuruecksetzen();
    this.wasserFertig = false;
    this.spuren = new Map();
    this.waffenZustand.clear();
    this.waffenDiagnose.clear();
    this.geschosse.leere();
    this.ruck = null;
    this.letzterKrater = null;
    return this;
  }

  /**
   * Die Treffer des letzten Bildes — und leert die Liste.
   *
   * Der Renderer zeichnet sie, aber er spielt keinen Klang: Der Mischer hängt
   * an `main.js`. Der Übergabezeitpunkt ist deshalb genau ein Bild (siehe
   * `Main#spieleTrefferklang`).
   *
   * @returns {Array<object>} Treffer aus `findeTreffer`
   */
  nimmTreffer() {
    const treffer = this.letzteTreffer;
    this.letzteTreffer = [];
    return treffer;
  }

  /** Entfernt die vom Mahlstrom abgetragenen Randspalten. */
  applyContraction(inset) {
    if (!this.terrainLayer) return;
    const ctx = this.terrainLayer.getContext('2d');
    ctx.clearRect(0, 0, inset, this.height);
    ctx.clearRect(this.width - inset, 0, inset, this.height);
    if (entfernePflanzenAmRand(this.pflanzen, inset, this.width)) this.#zeichnePflanzenNeu();
  }

  /**
   * Erzeugt die Splitterwolke einer Explosion.
   *
   * Die Logik liegt in `effects.js` und ist dort ohne Canvas geprüft; hier
   * wird nur der Zustand des Renderers geführt.
   *
   * Zugänglichkeit: Wer Bewegung reduziert haben will, bekommt keinen
   * Partikelregen. Die Explosion bleibt sichtbar — als Blitz (siehe
   * `#drawEffects`) —, nur die Bewegung entfällt.
   */
  spawnExplosionParticles(x, y, radius) {
    if (this.reducedMotion) return;
    this.particles.push(...erzeugePartikel(x, y, radius));
  }

  updateParticles() {
    this.particles = schreitePartikelFort(this.particles);
    this.truemmer = schreiteTruemmerFort(this.truemmer);
    if (this.flugSchutt.length > 0) {
      const q = this.terrainSource;
      this.flugSchutt = schreiteFlugSchutt(this.flugSchutt, q?.bitmap, q?.width ?? this.width, q?.height ?? this.height);
    }
    this.inselfall.schritt();
  }

  /**
   * Die hintere Kulisse (Himmel, Himmelskörper, Ambiente hinten, Landmarken) wird nur jedes
   * `KULISSE_BILDER`-te Bild neu gezeichnet und sonst als fertiges Bild aufgelegt.
   *
   * Messung (Audit 2026-10-13, Software-Rendering 1280×720, Canvas 2560×1440): `fill()` 43 ms und `fillRect`
   * 14 ms je Bild bei ~187 Aufrufen — fast alles aus dem Ambiente (Sterne, Wolken, Regen). Wolken und
   * Funkeln ändern sich langsam; mit jedem 2. Bild sieht man keinen Unterschied. Ohne `document`
   * (Tests) oder bei Größen-/Kulissenwechsel wird direkt gezeichnet bzw. neu aufgebaut.
   */
  #drawKulisse() {
    const horizont = this.height * 0.47;
    const direkt = ctx => {
      drawGenerativeSky(ctx, this.width, this.height, this.scenery, this.time);
      drawAmbient(ctx, this.width, this.height, this.scenery, this.time, false);
      drawLandmarks(ctx, this.width, this.height, this.scenery, horizont);
    };
    if (typeof document === 'undefined') { direkt(this.ctx); return; }
    const schicht = (maßstab = 1, anteil = 1) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(this.width * maßstab);
      canvas.height = Math.ceil(this.height * anteil * maßstab);
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    };
    let c = this.kulissenSchicht;
    const neu = !c || c.scenery !== this.scenery || c.w !== this.width || c.h !== this.height;
    if (neu) {
      // Statisch: Himmel UND Silhouetten in EINER Ebene (ein Blit je Bild statt zwei). Bewegtes (Wolken, Sterne,
      // Dunst) liegt darüber in der zweiten — nur im oberen Teil des Bildes, dort liegt das ganze Ambiente hinten.
      const himmel = schicht();
      // Das bewegte Ambiente (weiche Wolken, Sterne, Dunst) in halber Auflösung und nur im oberen Streifen:
      // ein Fünftel der Pixel; beim Auflegen wird hochskaliert. Gemessen: das Auflegen kostete vorher 27 ms je Bild.
      const bewegt = schicht(0.5, KULISSE_BEWEGT_ANTEIL);
      if (!himmel || !bewegt) { direkt(this.ctx); return; }
      drawGenerativeSky(himmel.ctx, this.width, this.height, this.scenery, 0);
      drawLandmarks(himmel.ctx, this.width, this.height, this.scenery, horizont);
      c = this.kulissenSchicht = { himmel, bewegt, scenery: this.scenery, w: this.width, h: this.height, zeit: -Infinity };
    }
    if (neu || this.time - c.zeit >= KULISSE_BILDER || this.time < c.zeit) {
      c.bewegt.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.bewegt.ctx.clearRect(0, 0, c.bewegt.canvas.width, c.bewegt.canvas.height);
      c.bewegt.ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      drawAmbient(c.bewegt.ctx, c.w, c.h, this.scenery, this.time, false);
      c.bewegt.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.zeit = this.time;
    }
    this.ctx.drawImage(c.himmel.canvas, 0, 0, this.width, this.height);
    const oben = Math.ceil(this.height * KULISSE_BEWEGT_ANTEIL);
    this.ctx.drawImage(c.bewegt.canvas, 0, 0, c.bewegt.canvas.width, c.bewegt.canvas.height, 0, 0, this.width, oben);
  }

  #drawSky() {
    // Generative Kulisse hat Vorrang: sie passt sich jeder Kartengröße an.
    if (this.scenery) {
      this.#drawKulisse();
      return;
    }

    // Kulisse, sobald geladen. Sie liegt HINTER dem Terrain: der Boden wird
    // danach darübergezeichnet und verdeckt die untere Bildhälfte.
    if (this.backdropReady && this.backdropImage) {
      this.ctx.drawImage(this.backdropImage, 0, 0, this.width, this.height);

      /**
       * Abdunkelung nach unten.
       *
       * Ohne sie verschwinden Figuren, Lebensbalken und Munitionsanzeige vor
       * hellen Kulissen (Schnee, Wüste, Sonnenuntergang) — das Spiel wäre dort
       * spielbar, aber nicht lesbar. Der Verlauf ist unten am stärksten, weil
       * dort die Figuren stehen, und oben fast durchsichtig, damit die Kulisse
       * sichtbar bleibt.
       */
      const daempfung = this.ctx.createLinearGradient(0, this.height * 0.35, 0, this.height);
      daempfung.addColorStop(0, 'rgba(8,14,24,0)');
      daempfung.addColorStop(0.55, 'rgba(8,14,24,0.28)');
      daempfung.addColorStop(1, 'rgba(8,14,24,0.55)');
      this.ctx.fillStyle = daempfung;
      this.ctx.fillRect(0, 0, this.width, this.height);
      return;
    }

    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(1, SKY_BOTTOM);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Deterministische Sternpunkte als statischer Hintergrund.
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % this.width;
      const y = (i * 71) % Math.round(this.height * 0.5);
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Farbe des Wassers an einer Stelle.
   * Ohne Kulisse bleibt es beim bisherigen Blau.
   */
  #wasserFarbe(tiefe) {
    const art = this.scenery?.water;
    if (!art) return [42, 122, 176];
    const flach = art.shallow;
    const tief = art.body;
    // Zur dunklen Palette hin abgedunkelt (#0D0F12), Tönung bleibt.
    const dunkel = (kanal, ziel) => Math.round(kanal + (ziel - kanal) * 0.35);
    return [
      dunkel(Math.round(flach[0] + (tief[0] - flach[0]) * tiefe), 13),
      dunkel(Math.round(flach[1] + (tief[1] - flach[1]) * tiefe), 15),
      dunkel(Math.round(flach[2] + (tief[2] - flach[2]) * tiefe), 18),
    ];
  }

  /**
   * Uferkarte des Wassers: je Wasserzelle, ob dort Gelände steht.
   *
   * Aus der gebackenen Geländeebene (der sichtbaren Wahrheit, mit allen Kratern) auf Wassergröße
   * verkleinert. Neu gebaut wird nur, wenn sich die Ebene oder der letzte Krater geändert hat
   * (oder alle 120 Bilder für den Mahlstrom-Rand) — nie jedes Bild.
   */
  #uferMaske() {
    const schicht = this.terrainLayer;
    if (!schicht || typeof document === 'undefined') return null;
    const w = this.waterLayer.width;
    const h = this.waterLayer.height;
    let u = this.uferStand;
    if (!u || u.schicht !== schicht || u.krater !== this.letzterKrater || u.w !== w || u.h !== h || this.time - u.zeit > 120) {
      const c = u?.canvas && u.w === w && u.h === h ? u.canvas : document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return null;
      cx.drawImage(schicht, 0, 0, w, h);
      const daten = cx.getImageData(0, 0, w, h).data;
      const maske = u?.maske?.length === w * h ? u.maske : new Uint8Array(w * h);
      for (let i = 0; i < maske.length; i += 1) maske[i] = daten[i * 4 + 3] > 110 ? 1 : 0;
      u = { schicht, krater: this.letzterKrater, w, h, zeit: this.time, canvas: c, maske };
      this.uferStand = u;
    }
    return u.maske;
  }

  /**
   * Wasser zeichnen.
   *
   * Die Wasserebene (Farben, Wellen, Schaum) wird nur alle paar Bilder neu BERECHNET (`neu`), aber
   * JEDES Bild aufgelegt. Zuvor kam `water` nur in jedem vierten Bild an und alles andere übersprang
   * das Zeichnen — das Wasser blinkte mit 15 Hz (belegt: 4 `putImageData` auf 16 Bilder).
   *
   * @param {object|null} water - WaterField des Matches
   * @param {boolean} neu - Ebene neu berechnen (sonst die zuletzt berechnete auflegen)
   */
  #drawWater(water, neu = true) {
    if (!water) return;
    if (!neu && this.wasserFertig) {
      this.#legeWasserAuf();
      return;
    }
    this.wasserFertig = true;
    this.waterCtx.clearRect(0, 0, this.waterLayer.width, this.waterLayer.height);
    const image = this.waterCtx.createImageData(this.waterLayer.width, this.waterLayer.height);
    const data = image.data;
    const levels = water.levels;
    const bg = this.waterLayer.width;
    const hg = this.waterLayer.height;

    /*
     * Ein Durchlauf, der alles Wasser-Aussehen mitnimmt (keine zusätzliche Ebene):
     *  - Tiefenverlauf: je Spalte zählt `lauf` die Zellen unter dem Spiegel; flach hell, tief dunkel.
     *  - Glanz und sanfte Wellen in den obersten Zellen (Phase aus Zeit und Spalte).
     *  - Schaum dort, wo am Spiegel Gelände neben dem Wasser steht (Uferkarte).
     * Die Farbstufen je Tiefe sind einmal je Bild vorgerechnet, nicht je Zelle.
     */
    const art = this.scenery?.water ?? null;
    const STUFEN = 26;
    const stufen = new Array(STUFEN);
    for (let k = 0; k < STUFEN; k += 1) stufen[k] = this.#wasserFarbe(Math.min(1, k / (STUFEN - 1)));
    const glanz = art ? mischeFarbe(art.shallow, [255, 255, 255], 0.8) : [226, 244, 255];
    const schaum = art ? mischeFarbe(art.shallow, [255, 255, 255], 0.82) : [240, 248, 255];
    const alphaArt = art?.alpha ?? 1;
    const phase = this.reducedMotion ? 0 : this.time * 0.05;
    const ufer = this.#uferMaske();
    const lauf = this.wasserLauf?.length === bg ? this.wasserLauf : (this.wasserLauf = new Int16Array(bg));
    const oben = this.wasserOben?.length === bg ? this.wasserOben : (this.wasserOben = new Int16Array(bg));
    lauf.fill(-1);
    oben.fill(-1);
    // Umschließendes Rechteck der nassen Zellen: Nur dieses Stück wird später aufgelegt.
    let nx0 = bg; let nx1 = -1; let ny0 = hg; let ny1 = -1;

    for (let y = 0; y < hg; y += 1) {
      const zeile = y * bg;
      for (let x = 0; x < bg; x += 1) {
        const i = zeile + x;
        const level = levels[i];
        if (level <= 0.02) { lauf[x] = -1; continue; }
        const k = lauf[x] + 1;
        if (x < nx0) nx0 = x;
        if (x > nx1) nx1 = x;
        if (y < ny0) ny0 = y;
        if (y > ny1) ny1 = y;
        if (k === 0) { if (oben[x] < 0) oben[x] = y; }
        lauf[x] = k;
        const f = stufen[k < STUFEN ? k : STUFEN - 1];
        let r = f[0];
        let g = f[1];
        let b = f[2];
        let a = Math.round(Math.min(0.72, level) * 210 * alphaArt);
        if (k < 14) {
          // Sanfte Wellen: Helligkeit schwingt mit Spalte, Tiefe und Zeit, nach unten abklingend.
          const m = Math.sin(x * 0.42 + k * 0.85 + phase) * 0.075 * (1 - k / 14);
          r += r * m; g += g * m; b += b * m;
          if (k < 5) {
            // Glanz am Spiegel, in der Spalte unruhig.
            const gl = (5 - k) / 5 * (0.5 + 0.4 * Math.sin(x * 0.9 - phase * 1.7));
            r += (glanz[0] - r) * gl; g += (glanz[1] - g) * gl; b += (glanz[2] - b) * gl;
            a += (255 - a) * gl * 0.4;
          }
          if (ufer && k < 9 && (ufer[i - 1] || ufer[i + 1] || (k < 4 && (ufer[i - bg] || ufer[i - 2 * bg])))) {
            // Schaumsaum am Ufer: stärker am Spiegel, mit Brandung (die Breite pulsiert leicht).
            const sf = (1 - k / 9) * (0.62 + 0.3 * Math.sin(x * 0.2 + phase * 2.3));
            if (sf > 0) {
              r += (schaum[0] - r) * sf; g += (schaum[1] - g) * sf; b += (schaum[2] - b) * sf;
              a += (255 - a) * sf * 0.7;
            }
          }
        }
        const index = i * 4;
        data[index] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[index + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[index + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        data[index + 3] = a > 255 ? 255 : a;
      }
    }
    this.waterCtx.putImageData(image, 0, 0);
    // Zwei Zellen Rand: Das Hochskalieren der Ebene blendet an der Kante in Transparent aus.
    this.wasserRahmen = nx1 < 0 ? null : {
      x0: Math.max(0, nx0 - 2), y0: Math.max(0, ny0 - 2), x1: Math.min(bg, nx1 + 3), y1: Math.min(hg, ny1 + 3),
    };
    this.#legeWasserAuf();
  }

  /** Legt die berechnete Wasserebene samt Oberflächenstruktur auf das Bild. */
  #legeWasserAuf() {
    const r = this.wasserRahmen;
    if (r) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.88;
      // Nur das Rechteck mit Wasser (die Ebene ist sonst durchsichtig, aber ein ganzes Bild groß).
      const sx = this.width / this.waterLayer.width;
      const sy = this.height / this.waterLayer.height;
      this.ctx.drawImage(this.waterLayer, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, r.x0 * sx, r.y0 * sy, (r.x1 - r.x0) * sx, (r.y1 - r.y0) * sy);
      this.ctx.restore();
    }

    // Struktur der Wasserart NACH der Fläche: Kruste, Wellen, Blasen und Sterne
    // liegen auf dem Wasser, nicht darunter — an den Spiegel der Spalten geheftet.
    if (this.scenery) {
      drawWaterSurface(this.ctx, this.width, this.height, this.scenery, this.time, { oben: this.wasserOben, skala: WATER_SCALE });
    }
  }

  /**
   * Zeichnet aufgestellte Geschütze.
   *
   * Ein Geschütz ist kein Kästchen: Es soll sofort von einer Kiste zu
   * unterscheiden sein, weil beide auf dem Boden liegen. Form und Farbe des
   * Teams sind deshalb eigenständig — ein Sockel mit Rohr, das in die Richtung
   * des Ziele zeigt (abgeleitet aus dem Team: Team 0 schießt nach rechts).
   *
   * Die Restrunden stehen als kleine Punkte über dem Sockel: Wer ein Geschütz
   * sieht, soll einschätzen können, wie lange es noch feuert.
   */
  #drawTurrets(turrets) {
    for (const turret of turrets) {
      const farbe = TEAM_COLORS[(turret.teamId ?? 0) % TEAM_COLORS.length];
      this.ctx.save();
      this.ctx.translate(turret.x, turret.y);

      // Sockel
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.fillRect(-8, -4, 17, 12);
      this.ctx.fillStyle = '#2b3540';
      this.ctx.fillRect(-9, -5, 17, 12);
      this.ctx.strokeStyle = farbe;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(-9, -5, 17, 12);

      // Rohr in Schussrichtung (Team 0 nach rechts, Team 1 nach links).
      const richtung = (turret.teamId ?? 0) % 2 === 0 ? 1 : -1;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -2);
      this.ctx.lineTo(richtung * 11, -9);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = farbe;
      this.ctx.stroke();

      // Restrunden als Punkte.
      const runden = Math.max(0, Math.min(5, Math.round(turret.roundsLeft ?? 0)));
      this.ctx.fillStyle = farbe;
      for (let i = 0; i < runden; i += 1) {
        this.ctx.beginPath();
        this.ctx.arc(-6 + i * 4, -12, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  #drawCrates(crates) {
    for (const crate of crates) {
      const color = RARITY_COLORS[crate.rarity] ?? CRATE_COLORS[0];
      const size = 14;
      this.ctx.save();
      this.ctx.translate(crate.x, crate.y);
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.fillRect(-size / 2 + 1, -size / 2 + 2, size, size);
      this.ctx.fillStyle = '#2b3540';
      this.ctx.fillRect(-size / 2, -size / 2, size, size);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(-size / 2, -size / 2, size, size);
      /*
       * DIE ART DER KISTE SICHTBAR MACHEN (FUND behoben, docs/verkabelung.md §B1).
       *
       * Hier stand NUR die Seltenheitsfarbe. Die Art (`crateType`) war die ganze
       * Zeit auf der Leitung und im Zustand, wurde aber nirgends gezeichnet —
       * eine SPENGFALLE sah damit aus wie eine Waffenkiste. Für den Spieler ist
       * das der Unterschied zwischen „holen" und „nicht anfassen".
       *
       * Die Marke ersetzt das X der alten Zeichnung, weil das X die einzige
       * Aussage war, die über jeder Kiste stand. Gefülltes Quadrat = Waffe,
       * Ring = Nachschub, leer = leer, Warndreieck = Falle.
       */
      this.ctx.strokeStyle = color;
      this.ctx.globalAlpha = 0.85;
      this.ctx.lineWidth = 2;
      const halb = size / 2;
      switch (crate.crateType) {
        case CRATE_TYPES.weapon:
          this.ctx.fillStyle = color;
          this.ctx.fillRect(-halb + 3, -halb + 3, size - 6, size - 6);
          break;
        case CRATE_TYPES.sustain:
          this.ctx.beginPath();
          this.ctx.arc(0, 0, halb - 3, 0, Math.PI * 2);
          this.ctx.stroke();
          break;
        case CRATE_TYPES.trap: {
          // Warndreieck — die einzige Art, die man NICHT öffnen will.
          this.ctx.beginPath();
          this.ctx.moveTo(0, -halb + 2);
          this.ctx.lineTo(halb - 2, halb - 2);
          this.ctx.lineTo(-halb + 2, halb - 2);
          this.ctx.closePath();
          this.ctx.stroke();
          break;
        }
        default:
          // `empty` — die Kiste bleibt leer gezeichnet, das ist die Aussage.
          break;
      }
      this.ctx.restore();
    }
  }

  /** Die Fraktion, deren Sprite eine Figur zeigt (`null` = klassische prozedurale Figur). */
  fraktionVon(entity) {
    const f = entity.fraktionId;
    if (f === KLASSISCH) return null;
    return f || (this.fraktionJeTeam?.[entity.teamId] ?? null);
  }

  #drawEntities(entities, activePlayerId, aim) {
    const jetzt = performance.now() / 1000;
    // Sprites werden je Zoom so groß gezeichnet, dass sie auf dem Bildschirm lesbar bleiben (nur Anzeige).
    this.figurSkala = figurSkalaFuer((this.kamera?.zoom ?? 1) * this.cssFaktor);
    const S = this.figurSkala;
    this.waffenStat.sprite = 0;
    this.waffenStat.ikone = 0;
    const fz = this.figurStat;
    fz.gezeichnet = 0; fz.uebersprungen = 0;
    const zoomK = this.kamera?.zoom ?? 1;
    // Sprite-Kante in Bildpunkten der Zeichenfläche: bestimmt die Mip-Stufe (siehe `stufeFuer`).
    const spritePx = SPRITE_HOEHE * S * zoomK;
    fz.stufe = spritePx;
    const sicht = this.#sichtfeld(SPRITE_HOEHE * S * 1.3 + 80);
    this.figurEffekte.aktualisiere(jetzt - this.figurZeit);
    this.figurZeit = jetzt;
    for (const entity of entities) {
      if (!entity.alive) {
        this.#figurGestorben(entity.entityId, jetzt);
        continue;
      }
      // Nur sichtbare Figuren werden animiert und gezeichnet (die aktive immer).
      if (sicht && entity.entityId !== activePlayerId
        && (entity.x < sicht.x0 || entity.x > sicht.x1 || entity.y < sicht.y0 || entity.y > sicht.y1)) {
        this.figurPosen.ueberspringe(entity, jetzt);
        fz.uebersprungen += 1;
        continue;
      }
      fz.gezeichnet += 1;
      const color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      /*
       * DAS ZUCKEN DER GETROFFENEN FIGUR.
       *
       * Die Marke wird über die FIGUR geführt (`entityId`), nicht über eine
       * feste Stelle — dieselbe Regel wie beim Mündungsfeuer: Die Figur kann
       * zwischen Treffer und Bild noch ein Stück geflogen sein (Rückstoß,
       * Flächenschaden), und das Zucken gehört an die Figur, nicht an den Ort.
       *
       * Die RICHTUNG ist aus dem Zustand nicht bekannt (kein Snapshot führt
       * eine Einschlagrichtung je Figur) — der Ausschlag wechselt deshalb das
       * Vorzeichen, statt gerichtet zu sein. Was fehlt, wird nicht erfunden.
       */
      const marke = this.trefferMarken.find(m => m.entityId === entity.entityId) ?? null;
      const zuck = zuckVersatz(marke ? marke.life : 0, { reducedMotion: this.reducedMotion });

      this.ctx.save();
      this.ctx.translate(entity.x + zuck.dx, entity.y + zuck.dy);

      const fraktionId = this.fraktionVon(entity);
      const charakter = fraktionId ? charakterFuer(fraktionId, entity.classId, entity.archetypeId) : null;
      const fig = charakter ? holeFigur(charakter) : null;
      const sk = fig ? S : 1;
      const typ = charakter ? typFuer(charakter.id) : 'humanoid';

      // Schatten der klassischen Figur (die Sprites bringen ihren weichen Kontaktschatten mit)
      if (!fig) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 11, 10 * sk, 3 * Math.min(sk, 1.6), 0, 0, Math.PI * 2);
        this.ctx.fill();
      }

      const isActive = entity.entityId === activePlayerId;
      const angle = isActive && aim ? aim.angle : entity.angle;

      /*
       * MÜNDUNGSFEUER UND RÜCKSTOSS.
       *
       * Der Effekt wird über die FIGUR geführt (siehe `addMuzzleFlash`), nicht
       * über eine Position — deshalb hier der Blick in die Effektliste. Er
       * trägt Winkel und Lebensdauer; die Geometrie kommt aus
       * `weaponAnimation.js` und ist dort ohne Canvas prüfbar.
       */
      const muendung = this.effects.find(
        (e) => e.kind === 'muzzle' && e.entityId === entity.entityId,
      ) ?? null;
      const feuerLeben = muendung ? muendung.life : 0;
      const rueck = rueckstossVersatz(feuerLeben, { reducedMotion: this.reducedMotion });
      const atem = this.reducedMotion ? 0 : Math.sin(this.time * 0.07 + entity.entityId * 1.9) * 0.7;

      const rohrParam = {
        winkel: angle,
        atem,
        rueck,
        aktiv: isActive,
        rohrLaenge: ROHR_LAENGE / FIGUR_SKALA - 0.7,
      };
      const treffer = marke && marke.life > 0.66 ? (marke.life - 0.66) * 3 : 0;
      // Zeichnet die Figur eine Waffe aus dem Atlas, bringt diese ihren eigenen Mündungsblitz mit.
      let spriteWaffe = false;
      // Charakter-Sprite, wenn die Figur eine Fraktion hat und das Bild bereit ist
      // (sonst die prozedurale Figur).
      if (fig) {
        // Alles Sprite-Zeug (Bild, Ring, Waffe) skaliert gemeinsam um den Fußpunkt.
        this.ctx.save();
        this.ctx.translate(0, FUSS_ABSTAND);
        this.ctx.scale(S, S);
        this.ctx.translate(0, -FUSS_ABSTAND);
        const par = PARAMETER[typ];
        const fussWelt = entity.y + zuck.dy + FUSS_ABSTAND;
        // Gehaltene Waffe: ihr Sprite am Zielstrahl (je nach Lage vor oder hinter dem Körper); ohne Sprite die Ikone.
        const waffe = entity.activeWeaponId ? WEAPONS_BY_ID[entity.activeWeaponId] : null;
        const waffenSprite = waffe ? holeWaffenSprite(waffe) : null;
        const ikone = waffe && !waffenSprite ? holeWaffenIkone(waffe) : null;
        const waffenPar = waffenSprite ? parameterFuerWaffe(waffe, waffenSprite) : null;
        const pose = this.figurPosen.pose(entity, jetzt, {
          reduziert: this.reducedMotion, treffer, haerte: marke?.haerte, rueck: -rueck, winkel: angle, aktiv: isActive,
          feuer: feuerLeben, params: par, typ,
          schussStaerke: waffenPar?.koerper ?? 1, ausfall: waffenPar?.ausfall ?? 0,
          neigung: this.#bodenNeigung(entity.x, fussWelt),
          hp: entity.maxHealth > 0 ? Math.max(0, Math.min(1, entity.health / entity.maxHealth)) : 0,
          ergebnis: this.sieger !== null && this.sieger >= 0 ? (this.sieger === entity.teamId ? 1 : -1) : 0,
        });
        const zs = this.figurPosen.zustand(entity.entityId);
        zs.fig = fig; zs.team = color; zs.winkel = angle; zs.nass = entity.waterLevel ?? 0; zs.typ = typ;
        // Wasserlinie an der Figur (lokale Höhe im Figurrahmen) und Blasen beim Waten.
        let wasserY;
        if ((entity.waterLevel ?? 0) > 0.03) {
          const wy = this.#wasserLinie(entity.x);
          if (wy < fussWelt - 1) wasserY = FUSS_ABSTAND + (wy - fussWelt) / S;
          if (wasserY !== undefined && !this.reducedMotion && (this.time + entity.entityId * 7) % 50 === 0) {
            this.figurEffekte.blasen(entity.x, wy + 2, 2);
          }
        }
        const hinterKoerper = waffenPar?.lage === 'hinter';
        if (hinterKoerper) {
          spriteWaffe = true;
          this.ctx.save();
          this.#waffeFolgtKoerper(pose);
          this.#zeichneWaffeSprite(entity, waffe, waffenSprite, angle, jetzt, treffer, feuerLeben, color, charakter, fig);
          this.ctx.restore();
        }
        zeichneFigurSprite(this.ctx, fig, {
          team: color, winkel: angle, aktiv: isActive, pose, zeit: jetzt, reduziert: this.reducedMotion,
          px: spritePx, breite: par.fussBreite, wasserY,
        });
        // Die Waffe folgt dem Körper (Hangneigung, Neigung, Hüpfen), behält aber den echten Zielwinkel.
        this.#waffeFolgtKoerper(pose);
        if (waffenSprite) {
          if (!hinterKoerper) {
            spriteWaffe = true;
            this.#zeichneWaffeSprite(entity, waffe, waffenSprite, angle, jetzt, treffer, feuerLeben, color, charakter, fig);
          }
        } else if (ikone) {
          this.waffenStat.ikone += 1;
          const nahkampf = waffe.category === 'melee';
          zeichneWaffeInHand(this.ctx, ikone, {
            winkel: angle,
            rueck: nahkampf ? 0 : rueck,
            laenge: ROHR_LAENGE,
            schwung: nahkampf && !this.reducedMotion ? Math.sin(feuerLeben * Math.PI) * 1.1 : 0,
          });
          // Selbstwirkung oder Nahkampf ohne Geschoss: kurzer Aura-Ring beim Einsatz.
          if (feuerLeben > 0 && !this.reducedMotion && (nahkampf || waffe.damage === 0)) {
            zeichneAuraRing(this.ctx, color, feuerLeben);
          }
        } else {
          this.ctx.save();
          this.ctx.translate(0, FIGUR_HOCH);
          this.ctx.scale(FIGUR_SKALA, FIGUR_SKALA);
          zeichneRohr(this.ctx, rohrParam);
          this.ctx.restore();
        }
        this.ctx.restore();
      } else {
        this.ctx.save();
        this.ctx.translate(0, FIGUR_HOCH);
        this.ctx.scale(FIGUR_SKALA, FIGUR_SKALA);
        zeichneSoldat(this.ctx, { ...rohrParam, team: color, treffer });
        this.ctx.restore();
      }
      this.ctx.restore();

      // Das Feuer liegt in WELTachsen (die Geometrie rechnet in Weltachsen) —
      // es wird deshalb NACH dem Zurücksetzen der Drehung gezeichnet.
      if (muendung && !spriteWaffe) {
        const feuer = muendungsfeuer(angle, feuerLeben, { reducedMotion: this.reducedMotion });
        const mx = entity.x + feuer.offsetX * sk;
        const my = entity.y + FUSS_ABSTAND + (HAND_HOEHE - FUSS_ABSTAND) * sk + feuer.offsetY * sk;

        this.ctx.save();
        this.ctx.globalAlpha = feuer.alpha;
        this.ctx.translate(mx, my);
        this.ctx.rotate(-angle);
        const verlauf = this.ctx.createLinearGradient(0, 0, feuer.length * sk, 0);
        verlauf.addColorStop(0, muendung.farbe);
        verlauf.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = verlauf;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -feuer.halfWidth * sk);
        this.ctx.lineTo(feuer.length * sk, 0);
        this.ctx.lineTo(0, feuer.halfWidth * sk);
        this.ctx.closePath();
        this.ctx.fill();

        // Heller Kern an der Mündung — ohne ihn wirkt der Kegel flach.
        this.ctx.fillStyle = '#fffbe6';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, feuer.coreRadius * sk, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }

      this.#drawHealthBar(entity, zuck, entity.entityId === activePlayerId, fig ? S : 0, fig ? charakter.faction : null);
    }
  }

  /**
   * Die gehaltene Waffe als Sprite mit prozeduraler Animation (siehe
   * `waffenAnimation.js`): Pose aus den Zeiten seit Ziehen und Schuss, Hand
   * aus Sprite-Höhe und Blickrichtung, Nachladegrad aus dem Zustand.
   */
  /** Verschiebt den Rahmen so, dass die Waffe dem Körper folgt (Hangneigung, Neigung, Hüpfen). */
  #waffeFolgtKoerper(pose) {
    const r = pose.neigung + pose.rot;
    const hh = FUSS_ABSTAND - HAND_HOEHE;
    this.ctx.translate(pose.dx + hh * Math.sin(r), pose.dy - hh * (pose.sy - 1) + hh * (1 - Math.cos(r)));
  }

  #zeichneWaffeSprite(entity, waffe, sp, angle, jetzt, treffer, feuerLeben, color, charakter, fig) {
    const ws = this.#waffenState(entity.entityId);
    const selbst = waffe.damage === 0;
    if (ws.waffeId !== waffe.id || ws.par === null) {
      // Wechsel: Die neue Waffe schwingt von unten ein (nicht beim allerersten Bild der Figur).
      if (ws.waffeId !== '' && ws.waffeId !== waffe.id) ws.zieh = jetzt;
      ws.waffeId = waffe.id;
      ws.par = parameterFuerWaffe(waffe, sp);
    }
    const par = ws.par;
    const zt = this.waffenZeiten;
    zt.idle = jetzt + entity.entityId * 1.7;
    zt.seitZiehen = jetzt - ws.zieh;
    zt.seitSchuss = jetzt - ws.schuss;
    zt.bereit = ladungAnteil(entity.cooldowns?.[waffe.id] ?? 0, waffe.cooldown);
    zt.treffer = treffer;
    const pose = waffenPose(par, zt, this.reducedMotion, this.waffenPoseTmp);
    const hand = figurHand(charakter?.id);
    handPunkt(par, Math.cos(angle), SPRITE_HOEHE, FUSS_ABSTAND, this.handTmp, hand);
    zeichneWaffeSprite(this.ctx, sp, par, pose, {
      winkel: angle, handX: this.handTmp.x, handY: this.handTmp.y, figur: hand, handFarbe: fig ? handFarbeFuer(fig, hand) : null,
      zeit: jetzt, reduziert: this.reducedMotion,
    });
    if (feuerLeben > 0 && !this.reducedMotion && (waffe.category === 'melee' || selbst)) {
      zeichneAuraRing(this.ctx, color, feuerLeben);
    }
    this.waffenStat.sprite += 1;
    let d = this.waffenDiagnose.get(entity.entityId);
    if (!d) { d = {}; this.waffenDiagnose.set(entity.entityId, d); }
    d.waffeId = waffe.id; d.art = par.art; d.seitSchuss = zt.seitSchuss;
    d.vor = pose.vor; d.hoch = pose.hoch; d.drehung = pose.drehung; d.glanz = pose.glanz;
    d.blitz = pose.blitz; d.blitzForm = pose.blitzForm; d.weiss = pose.weiss; d.ladung = pose.ladung;
    d.kachel = sp.kachel; d.orb = par.orb === true && sp.kachel === 'orb'; d.lage = par.lage; d.figurTyp = hand.typ;
  }

  /**
   * Eine Figur ist gestorben: Hatte sie ein Sprite, läuft der Fall-Effekt
   * (Wegfliegen bzw. Ertrinken) noch kurz weiter.
   */
  #figurGestorben(entityId, jetzt) {
    const z = this.figurPosen.zustand(entityId);
    if (!z) return;
    if (z.fig) {
      const par = PARAMETER[z.typ] ?? PARAMETER.humanoid;
      const ertrinkt = z.nass > 0.5;
      this.faelle.push({
        fig: z.fig, x: z.x, y: z.y, winkel: z.winkel, team: z.team, t0: jetzt,
        ertrinkt, blick: z.blick, vx: z.vx, tod: par.tod, breite: par.fussBreite,
      });
      if (!this.reducedMotion) {
        if (ertrinkt) this.figurEffekte.blasen(z.x, z.y + FUSS_ABSTAND, 9);
        else this.figurEffekte.tod(par.tod, z.x, z.y + 2, z.team, z.blick);
      }
    }
    this.figurPosen.vergiss(entityId);
    this.waffenZustand.delete(entityId);
    this.waffenDiagnose.delete(entityId);
  }

  /** Pose des Fall-Effekts im Format der Sprite-Zeichnung (wiederverwendetes Objekt). */
  fallDarstellung(pose) {
    const d = this.fallZeichenPose ?? (this.fallZeichenPose = {
      dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0, tint: 0, neigung: 0, zug: 0, hpVerz: 1,
    });
    d.dx = pose.dx; d.dy = pose.dy; d.sx = pose.sx; d.sy = pose.sy; d.rot = pose.rot; d.flash = pose.flash;
    return d;
  }

  /** Zeichnet Staub, Blasen und Splitter der Figuren. */
  #drawFigurEffekte() {
    this.figurEffekte.zeichne(this.ctx);
  }

  /** Sichtbarer Kartenausschnitt (mit Rand) für das Auslassen verdeckter Figuren, `null` ohne Kamera. */
  #sichtfeld(rand) {
    if (!this.kamera) return null;
    const t = this.kamera.transformation();
    const k = t.skalierung > 0 ? t.skalierung : 1;
    const v = this.sichtTmp ?? (this.sichtTmp = { x0: 0, x1: 0, y0: 0, y1: 0 });
    v.x0 = -t.versatzX / k - rand; v.x1 = (this.width - t.versatzX) / k + rand;
    v.y0 = -t.versatzY / k - rand; v.y1 = (this.height - t.versatzY) / k + rand;
    return v;
  }

  /**
   * Neigung des Bodens unter den Füßen (rad, höchstens ±12°) aus der Kollisionsmaske:
   * Höhe des Geländes 7 px links und rechts der Figur. In der Luft oder ohne Gelände 0.
   */
  #bodenNeigung(x, fussY) {
    const q = this.terrainSource;
    if (!q) return 0;
    const { bitmap, width, height } = q;
    const hoehe = (cx) => {
      const c = Math.round(cx);
      if (c < 0 || c >= width) return NaN;
      const y1 = Math.min(height - 1, Math.round(fussY) + 12);
      for (let y = Math.max(0, Math.round(fussY) - 9); y <= y1; y += 1) if (bitmap[y * width + c]) return y;
      return NaN;
    };
    const m = hoehe(x);
    const l = hoehe(x - 7);
    const r = hoehe(x + 7);
    if (Number.isNaN(m) || Number.isNaN(l) || Number.isNaN(r) || m - fussY > 5) return 0;
    const w = Math.atan2(r - l, 14);
    return w > NEIGUNG_MAX ? NEIGUNG_MAX : w < -NEIGUNG_MAX ? -NEIGUNG_MAX : w;
  }

  /** Höhe der Wasserlinie in Kartenpixeln an Stelle `x` (`NaN`, wenn dort kein Wasser steht). */
  #wasserLinie(x) {
    const o = this.wasserOben;
    if (!o || !this.wasserFertig) return NaN;
    const c = Math.floor(x / WATER_SCALE);
    if (c < 0 || c >= o.length || o[c] < 0) return NaN;
    return o[c] * WATER_SCALE;
  }

  /** Zeichnet die auslaufenden Fall-Effekte (nach den lebenden Figuren). */
  #drawFaelle() {
    if (this.faelle.length === 0) return;
    const jetzt = performance.now() / 1000;
    for (let i = this.faelle.length - 1; i >= 0; i -= 1) {
      const f = this.faelle[i];
      const pose = fallPose(f, jetzt, this.reducedMotion, this.fallPoseTmp);
      if (!pose) { this.faelle.splice(i, 1); continue; }
      this.ctx.save();
      this.ctx.translate(f.x, f.y + FUSS_ABSTAND);
      this.ctx.scale(this.figurSkala, this.figurSkala);
      this.ctx.translate(0, -FUSS_ABSTAND);
      zeichneFigurSprite(this.ctx, f.fig, {
        team: f.team, winkel: f.blick > 0 ? 0 : Math.PI, aktiv: false, zeit: jetzt, reduziert: true,
        alpha: pose.alpha, breite: f.breite,
        px: SPRITE_HOEHE * this.figurSkala * (this.kamera?.zoom ?? 1),
        pose: this.fallDarstellung(pose),
      });
      this.ctx.restore();
    }
  }

  /**
   * Der Lebensbalken über einer Figur.
   *
   * Der Versatz kommt von außen: Die Figur zuckt bei einem Treffer um wenige
   * Pixel, und der Balken gehört zu ihr — ein Balken, der stehen bleibt, während
   * die Figur wackelt, liest sich als zwei Dinge.
   */
  #drawHealthBar(entity, versatz = { dx: 0, dy: 0 }, aktiv = false, spriteSkala = 0, fraktion = null) {
    const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
    // Klassische Figur: Schild wie bisher. Sprite: über dem Kopf des (größeren) Sprites, mitskaliert.
    const s = spriteSkala ? Math.max(1, Math.min(2.6, spriteSkala * 0.75)) : 1;
    const anker = spriteSkala
      ? entity.y + versatz.dy + FUSS_ABSTAND - SPRITE_HOEHE * spriteSkala * 0.93 - 2 * s
      : entity.y + versatz.dy - 26;
    zeichneNamensschild(
      this.ctx, entity.x + versatz.dx, anker, entity.label, ratio,
      TEAM_COLORS[entity.teamId % TEAM_COLORS.length], aktiv, s,
      {
        grenzen: this.#sicherInKarte(),
        fuss: entity.y + versatz.dy + FUSS_ABSTAND,
      },
      {
        verz: spriteSkala ? (this.figurPosen.zustand(entity.entityId)?.pose.hpVerz ?? ratio) : ratio,
        akzent: fraktion ? this.akzentJeFraktion.get(fraktion) : null,
        gift: entity.dotsCount ?? 0,
        boost: entity.boostMultiplier ?? 1,
        zeit: performance.now() / 1000,
      },
    );
  }

  /**
   * Der sichere Bereich in Kartenpixeln (oder `null` ohne Kamera/Messung).
   * Wird je Bild aus der Kameratransformation berechnet, weil sie nachzieht.
   */
  #sicherInKarte() {
    if (!this.sicherBereich || !this.kamera) return null;
    return bereichInKarte(this.sicherBereich, this.kamera.transformation());
  }

  /**
   * Maße einer Figur für die HUD-Prüfung (Kartenpixel um `entity.y`): Kopf samt
   * Schild (`oben`) bzw. nur Kopf (`kopf`), Füße unten, halbe Breite. Nur Rechnung, zeichnet nichts.
   */
  figurMasse() {
    const sk = this.figurSkala || 1;
    const hoch = SPRITE_HOEHE * sk * 0.93 - FUSS_ABSTAND;
    // Das Schild (Skala wie in #drawHealthBar) ragt bis 30·s über den Kopf.
    const schildSkala = Math.max(1, Math.min(2.6, sk * 0.75));
    return { halbBreite: Math.max(20, SPRITE_HOEHE * sk * 0.4), oben: hoch + 2 * schildSkala + 30 * schildSkala, kopf: hoch + 4, unten: FUSS_ABSTAND };
  }

  /**
   * Setzt den sicheren Bereich (Bildschirmpixel, ohne HUD-Ränder), `null` löscht ihn.
   * Er wirkt auf die Schildplatzierung; siehe `sichtbereich.js`.
   */
  setSicherBereich(bereich) {
    this.sicherBereich = bereich ?? null;
    return this;
  }

  /**
   * Wiederholung des letzten Schusses (Zugpause): verblassende Spur, leuchtender Kopf,
   * am Ende ein Einschlagring. Nur Anzeige; die Daten stammen aus `SchussAufnahme`.
   */
  #drawWiederholung(w) {
    if (!w?.spur?.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 1; i < w.spur.length; i += 1) {
      const alter = i / w.spur.length;
      ctx.strokeStyle = `rgba(76, 201, 240, ${0.12 + 0.6 * alter})`;
      ctx.beginPath();
      ctx.moveTo(w.spur[i - 1][0], w.spur[i - 1][1]);
      ctx.lineTo(w.spur[i][0], w.spur[i][1]);
      ctx.stroke();
    }
    const [kx, ky] = w.kopf;
    const glut = ctx.createRadialGradient(kx, ky, 0, kx, ky, 12);
    glut.addColorStop(0, '#ffffff');
    glut.addColorStop(0.45, '#4cc9f0');
    glut.addColorStop(1, 'rgba(76,201,240,0)');
    ctx.fillStyle = glut;
    ctx.beginPath();
    ctx.arc(kx, ky, 12, 0, Math.PI * 2);
    ctx.fill();
    if (w.aufprall) {
      ctx.strokeStyle = 'rgba(244, 162, 97, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(kx, ky, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Das Sprite eines Geschosses (Atlas, Kategorie der Waffe) oder `null`: dann
   * der bisherige Glutball. Die Waffe kommt aus dem Spawn-Ereignis, sonst von
   * der gerade gehaltenen Waffe des Besitzers.
   */
  #geschossSprite(lage, entities) {
    if (lage.sp) return lage.sp;
    if (!lage.waffeId) {
      const besitzer = entities.find(e => e.entityId === lage.owner);
      lage.waffeId = besitzer?.activeWeaponId ?? '';
    }
    const waffe = lage.waffeId ? WEAPONS_BY_ID[lage.waffeId] : null;
    const sp = waffe ? holeWaffenSprite(waffe) : null;
    if (sp?.projektil) {
      lage.sp = sp;
      lage.dar = geschossDarstellung(waffe, sp.projektilInfo);
    }
    return lage.sp;
  }

  #drawProjectiles(projectiles, entities = []) {
    const jetzt = performance.now() / 1000;
    this.waffenStat.geschosseGesamt = projectiles.length;
    this.waffenStat.geschossSprites = 0;
    for (const projectile of projectiles) {
      const lage = this.geschosse.lage(projectile.entityId);
      const sp = lage ? this.#geschossSprite(lage, entities) : null;
      if (sp) {
        // Schweif in der Blitzfarbe, dann das Sprite in Flugrichtung (Wurfdinge drehen sich zusätzlich).
        zeichneSchweif(this.ctx, lage.ring, sp.flashColor, lage.dar.groesse * 0.32);
        const w = geschossWinkel(lage.flug, lage.dar, jetzt - lage.t0, this.reducedMotion);
        zeichneGeschossSprite(this.ctx, sp, projectile.x, projectile.y, w, lage.dar.groesse);
        zeichneStartGlanz(this.ctx, sp, projectile.x, projectile.y, jetzt - lage.t0, lage.dar.start);
        lage.winkel = w;
        this.waffenStat.geschossSprites += 1;
      } else {
        zeichneGeschoss(this.ctx, projectile.x, projectile.y);
      }

      // Zünder-Countdown: Ohne die Zahl wäre nicht erkennbar, wie lange eine
      // Granate noch liegt. Der Ring zeigt zusätzlich den Fortschritt, damit
      // die verbleibende Zeit auch ohne Lesen erfassbar ist.
      const rest = projectile.fuseSeconds ?? 0;
      if (rest > 0) {
        this.ctx.save();
        this.ctx.textAlign = 'center';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.fillStyle = rest <= 1 ? '#ef476f' : '#fbbf24';
        // Symbol vor der Zahl: eine nackte Zahl über einem Geschoss wäre nicht
        // als Zünder zu erkennen. Bei unter einer Sekunde wird sie zusätzlich
        // als „gleich" gekennzeichnet.
        this.ctx.fillText(rest <= 1 ? `! ${rest.toFixed(1)}s` : `◷ ${rest.toFixed(1)}s`,
          projectile.x, projectile.y - 13);

        // Fortschrittsring: schließt sich, je näher die Zündung kommt.
        const anteil = Math.min(1, rest / 5);
        this.ctx.strokeStyle = rest <= 1 ? 'rgba(239,71,111,0.9)' : 'rgba(251,191,36,0.75)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 11, -Math.PI / 2, -Math.PI / 2 + anteil * Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
  }

  /**
   * Zeichnet die vorhergesagte Bahn des eigenen Schusses.
   *
   * Getrennt von `#drawAimPreview`, weil es eine andere Aussage ist: Die
   * Zielhilfe zeigt, wohin ein Schuss bei der AKTUELLEN Zielung ginge; die
   * Vorhersage zeigt, wohin der bereits ABGESCHICKTE Schuss geht, während die
   * Serverbestätigung noch aussteht. Beides gleich zu zeichnen hieße, zwei
   * Zustände zu einem zu verschmelzen.
   *
   * Anders als die Zielhilfe wird der Einschlagpunkt gefüllt markiert: Die Bahn
   * ist bereits unterwegs, sie ist keine Möglichkeit mehr.
   *
   * @param {{points:{x:number,y:number}[], impact:{x:number,y:number}|null}|null} bahn
   */
  #drawPrediction(bahn) {
    const points = bahn?.points;
    if (!points || points.length < 2) return;
    zeichneVorhersage(this.ctx, points, bahn.impact);
  }

  #drawAimPreview(points) {
    if (!points || points.length < 2) return;
    /*
     * ZIELVISIER am Einschlagpunkt: ein Fadenkreuz, das atmet
     * (`fadenkreuzSegmente`, `pulsFaktor`). Bei reduzierter Bewegung steht es
     * still, bleibt aber vollständig. Die Bahn ist eine leuchtende Neon-Linie
     * mit Pfeilspitze (`effektStil.js`) — eine MÖGLICHKEIT, keine Tatsache
     * (die Tatsache trägt `#drawPrediction` in Cyan).
     */
    const last = points[points.length - 1];
    const puls = pulsFaktor(this.time, { reducedMotion: this.reducedMotion });
    const { segmente, innen } = fadenkreuzSegmente(last.x, last.y, 9 * puls);
    zeichneZielhilfe(this.ctx, points, segmente, innen);
  }

  /**
   * Zeichnet Günther als Kleinspitz.
   *
   * Prozedural statt als Bild: Der Hund ist klein, bewegt sich und muss zu
   * jeder Kulisse passen. Ein Bild hätte eine feste Größe, einen festen
   * Blickwinkel und einen Hintergrund, der zu neun Wasser- und zehn Himmelarten
   * nicht passt.
   *
   * @param {object|null} guenther - Zustand aus `getState().guenther`
   */
  #drawGuenther(guenther) {
    if (!guenther?.aktiv) return;
    const { coat, coatDark, belly, nose, height, length } = GUENTHER_IDENTITY;
    const richtung = guenther.richtung >= 0 ? 1 : -1;
    const x = guenther.x - length / 2;
    const y = guenther.y;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(richtung, 1);

      const h = height;
      const l = length;

      // Schatten
      this.ctx.fillStyle = 'rgba(0,0,0,0.28)';
      this.ctx.beginPath();
      this.ctx.ellipse(l * 0.5, 1, l * 0.55, 4, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Beine (vier kurze Striche)
      this.ctx.strokeStyle = `rgb(${coatDark.join(',')})`;
      this.ctx.lineWidth = 3;
      const lauf = Math.sin(this.time * 0.22) * 2;
      for (const [ox, phase] of [[l * 0.2, 1], [l * 0.32, -1], [l * 0.68, 1], [l * 0.8, -1]]) {
        this.ctx.beginPath();
        this.ctx.moveTo(ox, -h * 0.42);
        this.ctx.lineTo(ox + phase * lauf * 0.6, 0);
        this.ctx.stroke();
      }

      // Körper
      this.ctx.fillStyle = `rgb(${coat.join(',')})`;
      this.ctx.beginPath();
      this.ctx.ellipse(l * 0.5, -h * 0.62, l * 0.42, h * 0.34, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Brust (heller Bauch)
      this.ctx.fillStyle = `rgb(${belly.join(',')})`;
      this.ctx.beginPath();
      this.ctx.ellipse(l * 0.5, -h * 0.44, l * 0.3, h * 0.18, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Kopf
      this.ctx.fillStyle = `rgb(${coat.join(',')})`;
      this.ctx.beginPath();
      this.ctx.arc(l * 0.86, -h * 0.86, h * 0.3, 0, Math.PI * 2);
      this.ctx.fill();

      // Schnauze
      this.ctx.fillStyle = `rgb(${coatDark.join(',')})`;
      this.ctx.beginPath();
      this.ctx.ellipse(l * 1.02, -h * 0.8, h * 0.16, h * 0.11, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Nase
      this.ctx.fillStyle = `rgb(${nose.join(',')})`;
      this.ctx.beginPath();
      this.ctx.arc(l * 1.12, -h * 0.8, 1.8, 0, Math.PI * 2);
      this.ctx.fill();

      // Spitze Ohren — das Kennzeichen eines Kleinspitzes.
      this.ctx.fillStyle = `rgb(${coatDark.join(',')})`;
      for (const ohr of [-0.12, 0.12]) {
        this.ctx.beginPath();
        this.ctx.moveTo(l * (0.8 + ohr), -h * 1.02);
        this.ctx.lineTo(l * (0.82 + ohr), -h * 1.3);
        this.ctx.lineTo(l * (0.92 + ohr), -h * 1.04);
        this.ctx.closePath();
        this.ctx.fill();
      }

      // Auge
      this.ctx.fillStyle = '#2b2622';
      this.ctx.beginPath();
      this.ctx.arc(l * 0.9, -h * 0.9, 1.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Schwanz: geringelt, wie beim Spitz, und wedelt.
      this.ctx.strokeStyle = `rgb(${coat.join(',')})`;
      this.ctx.lineWidth = 4;
      const wedeln = Math.sin(this.time * 0.3) * 4;
      this.ctx.beginPath();
      this.ctx.moveTo(l * 0.1, -h * 0.72);
      this.ctx.quadraticCurveTo(-l * 0.14, -h * 1.0 + wedeln, l * 0.04, -h * 1.2 + wedeln);
      this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Zeichnet Kackhaufen.
   *
   * Bewusst unaufdringlich: Sie sind ein Hindernis, kein Blickfang. Ein dünner
   * Rand hebt sie vom Boden ab, damit sie auf Sand und Schnee sichtbar bleiben.
   */
  #drawPoopPiles(haufen) {
    if (!haufen?.length) return;
    for (const pile of haufen) {
      this.ctx.save();
      this.ctx.translate(pile.x, pile.y);
      this.ctx.fillStyle = 'rgba(74, 56, 34, 0.95)';
      this.ctx.strokeStyle = 'rgba(30, 22, 14, 0.8)';
      this.ctx.lineWidth = 1;
      // Drei sich verjüngende Hügel ergeben den Haufen.
      for (const [dx, w, h] of [[0, 9, 4], [-4, 6, 2.6], [4, 6, 2.6]]) {
        this.ctx.beginPath();
        this.ctx.ellipse(dx, -h * 0.5, w, h, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  /**
   * Bifröst und Blitze — die Verwandlung zu Heimdall.
   *
   * Rein visuell und zeitlich begrenzt. Wird vom Client über `addHeimdall()`
   * ausgelöst, wenn das Ereignis eintrifft.
   */
  #drawHeimdall() {
    const effekt = this.effects.find(e => e.kind === 'heimdall');
    if (!effekt) return;

    const fortschritt = 1 - effekt.life;
    const staerke = Math.sin(fortschritt * Math.PI);

    this.ctx.save();
    // Regenbogenbrücke: sieben Streifen, die sich über das Feld legen.
    const farben = ['#e63946', '#f77f00', '#fcbf49', '#a7c957', '#4cc9f0', '#4361ee', '#9d4edd'];
    const hoehe = this.height * 0.5;
    for (let i = 0; i < farben.length; i++) {
      this.ctx.globalAlpha = 0.28 * staerke;
      this.ctx.fillStyle = farben[i];
      const y = this.height * 0.34 + i * (hoehe / farben.length) * 0.5;
      this.ctx.fillRect(0, y, this.width, (hoehe / farben.length) * 0.5);
    }

    // Blitze
    this.ctx.globalAlpha = staerke;
    this.ctx.strokeStyle = 'rgba(240,248,255,0.95)';
    this.ctx.lineWidth = 3;
    for (let b = 0; b < 5; b += 1) {
      const startX = (effekt.seed * 37 + b * 233) % this.width;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, 0);
      let lx = startX;
      for (let seg = 1; seg <= 6; seg += 1) {
        lx += Math.sin(seg * 2.1 + b) * 26;
        this.ctx.lineTo(lx, (seg / 6) * this.height * 0.6);
      }
      this.ctx.stroke();
    }

    // Aufhellung
    this.ctx.globalAlpha = 0.35 * staerke;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  /** Löst die Heimdall-Animation aus (Blitze, Bifröst, Gjallarhorn). */
  addHeimdall(seed = 0) {
    this.effects.push({ kind: 'heimdall', life: 1, decay: 0.006, seed });
  }

  #drawParticles() {
    zeichneFunken(this.ctx, this.particles);
    if (this.truemmer.length > 0) zeichneTruemmer(this.ctx, this.truemmer, this.#materialStil().truemmer);
    if (this.flugSchutt.length > 0) zeichneFlugSchutt(this.ctx, this.flugSchutt);
  }

  /**
   * Die Brandränder der Krater.
   *
   * Ein Krater ist ein Loch in der Geländeschicht — er zeigt den Himmel durch
   * den Boden. Diese Ränder machen aus dem Loch einen EINSCHLAG: ein dunkler
   * Saum an der Kante und ein angesengter Ton darum. Beide Farben stammen aus
   * dem Bestand (die Schattenfarbe `rgba(0,0,0,0.35)` benutzen Schatten,
   * Kisten und Geschütze; `#e76f51` ist die dritte Partikelfarbe aus
   * `effects.js`).
   *
   * Gezeichnet wird über dem Gelände und UNTER dem Wasser: Ein Krater unter
   * Wasser soll durch das Wasser scheinen, nicht darüber liegen.
   */
  #drawNarben() {
    if (this.narben.length === 0) return;
    this.ctx.save();
    for (const narbe of this.narben) zeichneNarbe(this.ctx, narbe);
    this.ctx.restore();
  }

  /**
   * Die Flugspuren der Projektile.
   *
   * Ein Projektil war ein wandernder Lichtfleck ohne Herkunft. Die Spur zeigt
   * die letzten `SPUR_PUNKTE_MAX` Positionen, nach hinten dünner und
   * durchsichtiger — dieselbe Orange wie der Geschosskern selbst
   * (`#f4a261`, siehe `#drawProjectiles`), damit Spur und Geschoss als EIN
   * Ding gelesen werden.
   *
   * Die Punkte kommen aus dem Zustand (`state.projectiles`), nicht aus einer
   * eigenen Zeitreihe: Der Renderer verliert also nichts, wenn ein Bild
   * ausfällt — er zeichnet dann eine gröbere Spur statt einer falschen. Ein
   * Sprung über `SPUR_SPRUNG_MAX` gilt als anderes Geschoss (siehe
   * `verlaengereSpur`).
   */
  #drawSpuren() {
    if (this.spuren.size === 0) return;
    this.ctx.save();
    this.ctx.lineCap = 'round';
    for (const [id, punkte] of this.spuren) {
      // Geschosse mit Sprite tragen ihren eigenen Schweif (`#drawProjectiles`).
      if (this.geschosse.lage(id)?.sp) continue;
      if (punkte.length >= 2) zeichneSpur(this.ctx, punkte);
    }
    this.ctx.restore();
  }

  /**
   * Der Nachhall: Rauch über einem großen Einschlag.
   *
   * Phase 3 der Explosion in der Recherche des Projekts
   * (`docs/recherche/sound-und-juice.md` §4.5). Zuvor war ein Einschlag nach
   * ~180 ms vorbei (Blitz 11 Bilder, Splitter 29) — bei einem Spiel, dessen
   * ganze Handlung aus Einschlägen besteht, war das zu kurz.
   *
   * Der Rauch ist ausdrücklich ein HINTERGRUND: halbdurchsichtig, langsam, und
   * bei reduzierter Bewegung entfällt er (er bewegt sich) — die Narbe bleibt,
   * denn sie trägt dieselbe Aussage ohne Bewegung.
   */
  #drawRauch() {
    if (this.rauch.length === 0 || this.reducedMotion) return;
    this.ctx.save();
    for (const wolke of this.rauch) {
      const { radius, alpha } = rauchDarstellung(wolke);
      const verlauf = this.ctx.createRadialGradient(wolke.x, wolke.y, 0, wolke.x, wolke.y, radius);
      verlauf.addColorStop(0, wolke.farbe);
      verlauf.addColorStop(1, 'rgba(43, 53, 64, 0)');
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = verlauf;
      this.ctx.beginPath();
      this.ctx.arc(wolke.x, wolke.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  /**
   * Die Rückmeldung eines Treffers: ein kurzer Ring plus ein heller Kern.
   *
   * Warum ein Ring und kein zweiter Blitz: Der Blitz (`addFlash`) markiert
   * einen ORT (Einschlag, Zündung, Schild). Ein Treffer an einer FIGUR ist eine
   * andere Aussage — er gehört an die Figur und muss auch dann zu sehen sein,
   * wenn dieselbe Stelle gerade schon einen Explosionsblitz trägt. Die Farbe
   * ist die Gefahrenfarbe des HUD (`#ef476f`, siehe Lebensbalken und
   * Mahlstrom); ein tödlicher Treffer bekommt den hellen Kern der Blitze
   * (`#fff3c4`), wie ihn Blitz und Strahl bereits benutzen.
   */
  #drawTreffer() {
    if (this.trefferMarken.length === 0) return;
    this.ctx.save();
    for (const marke of this.trefferMarken) {
      const anteil = Math.max(0, Math.min(1, marke.life));
      const radius = marke.radius * (1 + (1 - anteil) * 0.8);

      this.ctx.globalAlpha = anteil;
      this.ctx.strokeStyle = marke.toedlich ? '#fff3c4' : '#ef476f';
      this.ctx.lineWidth = 1.5 + 2 * anteil;
      this.ctx.beginPath();
      this.ctx.arc(marke.x, marke.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Der Kern sitzt dort, wo die Figur getroffen wurde, und geht schnell aus.
      this.ctx.globalAlpha = anteil * 0.5;
      this.ctx.fillStyle = '#fff3c4';
      this.ctx.beginPath();
      this.ctx.arc(marke.x, marke.y, 3 + 2 * anteil, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  /** Startet das Vorzeichen von Valhalla: zwei Raben erscheinen im Blitz und schauen auf das Feld. */
  startValhallaOmen(bildSeed = 1, { jetzt = performance.now() } = {}) {
    this.omen = { start: jetzt, bildSeed: Number(bildSeed) || 1 };
  }

  #drawOmen() {
    if (!this.omen) return;
    // Echtzeit statt Bildzähler: Die Blitze sollen unabhängig von der Bildrate gleich lang sein.
    // `festesAlter` ist ein Prüfhaken (Bildschirmfotos, Tests): hält das Vorzeichen an einer Stelle an.
    const alter = this.omen.festesAlter ?? (performance.now() - this.omen.start) / 1000;
    const zustand = omenZustand(alter, this.omen.bildSeed, { reducedMotion: this.reducedMotion });
    if (!zustand) {
      this.omen = null;
      return;
    }
    zeichneOmen(this.ctx, this.width, this.height, zustand);
  }

  #drawMaelstrom(maelstrom) {
    if (!maelstrom?.active || maelstrom.inset <= 0) return;
    const { inset } = maelstrom;
    const gradientLeft = this.ctx.createLinearGradient(0, 0, inset * 2, 0);
    gradientLeft.addColorStop(0, 'rgba(255, 77, 0, 0.5)');
    gradientLeft.addColorStop(1, 'rgba(255, 77, 0, 0)');
    this.ctx.fillStyle = gradientLeft;
    this.ctx.fillRect(0, 0, inset * 2, this.height);

    const gradientRight = this.ctx.createLinearGradient(this.width, 0, this.width - inset * 2, 0);
    gradientRight.addColorStop(0, 'rgba(255, 77, 0, 0.5)');
    gradientRight.addColorStop(1, 'rgba(255, 77, 0, 0)');
    this.ctx.fillStyle = gradientRight;
    this.ctx.fillRect(this.width - inset * 2, 0, inset * 2, this.height);

    this.ctx.strokeStyle = 'rgba(255, 120, 40, 0.9)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 8]);
    this.ctx.beginPath();
    this.ctx.moveTo(inset, 0);
    this.ctx.lineTo(inset, this.height);
    this.ctx.moveTo(this.width - inset, 0);
    this.ctx.lineTo(this.width - inset, this.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Vollständiger Frame.
   * @param {object} state - MatchController.getState()
   * @param {object} options
   * @param {Array} [options.aimPreview]
   * @param {object} [options.aim]
   * @param {number} [options.ladeAnteil] - Ladefortschritt 0..1; > 0 zeigt die
   *   Ladeanzeige. Solange geladen wird, ist das der einzige sichtbare Hinweis
   *   darauf, dass Halten etwas bewirkt (online gibt es keine Zielhilfe).
   * @param {object} [options.water] - WaterField-Instanz des Matches
   * @param {boolean} [options.wasserNeu] - Wasserebene neu berechnen (sonst die letzte auflegen)
   * @param {number} [options.blastRadius] - Flächenwirkung der gewählten Waffe
   */
  render(state, { aimPreview = null, prediction = null, aim = null, ladeAnteil = null, wiederholung = null, water = null, wasserNeu = true, blastRadius = 0 } = {}) {
    // Zugänglichkeit je Bild neu abfragen: Ändert der Nutzer die
    // Systemeinstellung, greift sie ohne Neuladen.
    this.reducedMotion = prefersReducedMotion();
    this.time += 1;

    /*
     * ===================== DAS GEFÜHL JE BILD ERMITTELN =====================
     *
     * Zwei Zustände werden hier aus dem ZUSTAND abgeleitet, nicht aus
     * Ereignissen:
     *
     *   1. TREFFER — ein Absinken der Gesundheit einer Figur. Warum aus dem
     *      Zustand und nicht aus dem `damage`-Ereignis: siehe Modulkopf von
     *      `gefuehl.js`.
     *   2. FLUGSPUR — die Positionen der Projektile. Dieselbe Größe, aus der
     *      auch `#drawProjectiles` zeichnet; eine zweite Buchführung könnte
     *      davon abweichen.
     *
     * Beides geschieht VOR dem Zeichnen, damit die Rückmeldung im selben Bild
     * erscheint wie die Ursache.
     */
    this.#ermittleTreffer(state);
    this.#fuehreSpuren(state.projectiles ?? []);
    this.geschosse.fuehre(state.projectiles ?? [], performance.now() / 1000);

    /*
     * Die Kamera trennt zwei Schichten.
     *
     * FUND (belegt): Bis hierher zeichnete `render()` alles 1:1 — die Karte war
     * genau so groß wie das Fenster. Auf einem 4K-Fernseher sah man deshalb die
     * ganze Karte, und eine GRÖSSERE Karte hätte nur kleinere Figuren bedeutet.
     *
     * Jetzt gilt: Der Himmel und die Bildschirm-Anzeigen füllen das Fenster,
     * alles andere liegt in Kartenkoordinaten und wird verschoben.
     *
     * ## Warum eine Transformation und nicht 266 Einzeländerungen
     *
     * Der Renderer hat 266 Zeichenaufrufe in 13 Weltfunktionen. Jeden einzeln
     * zu verschieben wäre invasiv und fehleranfällig. `setTransform` verschiebt
     * den Canvas selbst — die Aufrufe bleiben, es kommt eine Klammer herum.
     *
     * ## Die Reihenfolge ist wichtig
     *
     * Himmel ZUERST und ohne Transformation: Er füllt das Fenster. Danach die
     * Klammer mit den Weltfunktionen, danach die Bildschirm-Anzeigen (Windpfeil,
     * Mahlstrom) wieder ohne.
     */
    this.sieger = state.winnerTeamId ?? null;
    this.#drawSky();

    /*
     * DER KAMERA-RUCK.
     *
     * Er wird auf die TRANSFORMATION addiert, nicht auf die Kamera selbst:
     * `Camera` beschreibt, WELCHER Ausschnitt der Karte zu sehen ist — der Ruck
     * beschreibt, wie die Fläche in diesem Bild steht. Ein Ruck, der die
     * Kameraposition ändert, würde beim nächsten Bild nachziehen und die Karte
     * dauerhaft verschieben; ein Versatz in der Transformation ist mit dem Bild
     * wieder weg.
     *
     * Der Versatz ist in BILDSCHIRMpixeln (die Transformation endet in
     * Gerätepixeln) und deshalb vom Zoom unabhängig. Bei reduzierter Bewegung
     * und ohne großen Krater ist er genau null (siehe `ruckVersatz`).
     */
    const ruck = ruckVersatz(this.ruck, { bild: this.time, reducedMotion: this.reducedMotion });
    /*
     * Ob eine Klammer geöffnet wurde — sie wird unten wieder geschlossen. Ohne
     * dieses Merkmal bliebe im kamerafreien Pfad (Replay, Testbild) mit Ruck ein
     * `save()` je Bild offen: Der Zustandsstapel des Canvas wüchse unbegrenzt.
     */
    let klammerOffen = false;

    if (this.kamera) {
      const t = this.kamera.transformation();
      this.ctx.save();
      klammerOffen = true;
      // Der Ruck zeigt keine leere Welt: auf Achsen, die scrollen, bleibt die Karte im Bild.
      const k = this.kamera;
      const ruckX = k.scrolltHorizontal
        ? Math.max(k.schirm.b - k.karte.b * t.skalierung, Math.min(0, t.versatzX + ruck.x)) - t.versatzX : ruck.x;
      const ruckY = k.scrolltVertikal
        ? Math.max(k.schirm.h - k.karte.h * t.skalierung, Math.min(0, t.versatzY + ruck.y)) - t.versatzY : ruck.y;
      this.ctx.setTransform(
        t.skalierung, 0, 0, t.skalierung,
        t.versatzX + ruckX, t.versatzY + ruckY,
      );
    } else if (ruck.x !== 0 || ruck.y !== 0) {
      // Ohne Kamera (Replay, Testbild) wurde bisher 1:1 gezeichnet. Ein Ruck
      // braucht trotzdem eine Transformation — sonst ruckte es dort nicht.
      this.ctx.save();
      klammerOffen = true;
      this.ctx.setTransform(1, 0, 0, 1, ruck.x, ruck.y);
    }

    if (this.pflanzenSchicht) {
      // Nur die Streifen um die Pflanzen: die Ebene ist sonst leer (siehe `pflanzenStreifen`).
      for (const r of this.pflanzenStreifen) {
        this.ctx.drawImage(this.pflanzenSchicht, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      }
    }
    if (this.terrainLayer) {
      /*
       * Die Geländeschicht wird in Kartenkoordinaten gezeichnet (0, 0) — unter
       * der Transformation landet sie an der richtigen Stelle. Ohne Kamera
       * liegt sie wie bisher bei (0, 0) des Fensters.
       */
      this.ctx.drawImage(this.terrainLayer, 0, 0);
      this.inselfall.zeichne(this.ctx);
    }

    /*
     * Die Kraterränder liegen AUF dem Gelände und UNTER dem Wasser: Ein Krater
     * unter Wasser soll durch das Wasser scheinen, nicht darauf liegen.
     */
    this.#drawNarben();

    this.#drawWater(water, wasserNeu);
    this.#drawBlastPreview(aimPreview, blastRadius);
    // Kackhaufen liegen auf dem Boden, Günther darüber.
    this.#drawPoopPiles(state.guenther?.haufen ?? []);
    this.#drawCrates(state.crates ?? []);
    /*
     * Geschütze VOR den Kisten zeichnen: Lägen beide übereinander, wäre die
     * Kiste (die man aufheben kann) wichtiger als das Geschütz.
     */
    this.#drawTurrets(state.turrets ?? []);
    this.#drawAimPreview(aimPreview);
    /*
     * Die Schussvorhersage liegt VOR der Zielhilfe und in eigener Farbe.
     *
     * Reihenfolge: Sie ist das jüngere Ereignis (ein Schuss ist gerade raus) und
     * darf nicht von der Zielhilfe überdeckt werden. Farbe: Die Zielhilfe ist
     * orange („so könntest du zielen"), die Vorhersage türkis („so fliegt er").
     * Zwei gleiche Kurven in derselben Farbe wären nicht zu unterscheiden.
     */
    this.#drawPrediction(prediction);
    /*
     * Die Flugspur liegt UNTER den Figuren: Sie erzählt, woher ein Geschoss
     * kam, und darf dabei keine Figur verdecken — die Lesbarkeit der Figuren
     * geht vor.
     */
    this.#drawSpuren();
    this.#drawEntities(state.entities ?? [], state.activePlayerId, aim);
    this.#drawFaelle();
    this.#drawFigurEffekte();
    this.#drawGuenther(state.guenther);
    this.#drawProjectiles(state.projectiles ?? [], state.entities ?? []);
    this.#drawWiederholung(wiederholung);
    /*
     * FUND (belegt, dieser Zug): `#drawParticles` war definiert und wurde
     * NIRGENDS gerufen. Gemessen: Eine Explosion füllte `renderer.particles`
     * mit 26 Splittern (`erzeugePartikel`, `MAX_PARTIKEL`), sie alterten über
     * `updateParticles()` und verschwanden nach 29 Bildern — gezeichnet wurde
     * kein einziger. Die Explosion bestand damit aus Blitz (11 Bilder) und
     * Krater; die Splitter, die es seit dem Effektmodul gibt, waren ein
     * Rechenergebnis ohne Bild.
     *
     * Der Aufruf steht VOR dem Rauch: Splitter fliegen vor der Rauchwolke, die
     * sie hinterlassen.
     */
    this.#drawParticles();
    this.#drawRauch();
    /*
     * Der Trefferring liegt ÜBER Splittern und Rauch, aber UNTER den Blitzen:
     * Er ist die unmittelbare Rückmeldung an den Spieler und darf nicht von
     * einem nachträglichen Einschlagblitz derselben Stelle verschluckt werden.
     */
    this.#drawTreffer();
    this.#drawEffects();
    for (const zahl of this.zahlen) zeichneSchadenszahl(this.ctx, zahl);
    this.#drawHeimdall();
    this.#updateEffects();
    this.updateParticles();

    /*
     * Die Klammer schließt VOR den Bildschirm-Anzeigen: Ab hier gilt wieder die
     * Fenstergröße. Ohne das würde der Windpfeil mit der Kamera wandern — er
     * zeigt eine Richtung, keine Kartenstelle.
     */
    if (klammerOffen) this.ctx.restore();

    // Der Mahlstrom ist ein Bildschirm-Effekt (er legt sich über alles).
    this.#drawMaelstrom(state.maelstrom);
    // Das Vorzeichen liegt über der Welt, aber unter der Anzeige.
    this.#drawOmen();
    this.#drawWindArrow(state.wind);
    // Die Ladeanzeige liegt ÜBER dem Geschehen: Sie gehört zur Eingabe des
    // Spielers, nicht zur Welt — sie darf nicht hinter einer Figur verschwinden.
    this.#drawLadeanzeige(ladeAnteil);

    // Regen, Schnee, Funken und Glühwürmchen liegen VOR dem Geschehen: sie
    // ziehen zwischen Kamera und Figuren.
    if (this.scenery) {
      drawAmbient(this.ctx, this.width, this.height, this.scenery, this.time, true);
    }
  }

  /**
   * Setzt die Kamera (oder entfernt sie mit `null`).
   *
   * Ohne Kamera verhält sich der Renderer wie zuvor — das ist wichtig, damit
   * bestehende Tests und der Replay-Modus unverändert laufen.
   */
  setKamera(kamera) {
    this.kamera = kamera ?? null;
    return this;
  }
}

export default Renderer;
