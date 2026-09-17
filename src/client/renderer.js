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
import { bakeTerrainLayer, bakeTerrainLayerCpu, detectWebGpu } from './terrainBaker.js';
import {
  drawSky as drawGenerativeSky,
  drawAmbient,
  drawLandmarks,
  drawWaterSurface,
} from './sceneryPainter.js';

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
    this.waterFrame = 0;
    this.time = 0;
    /** Transiente Effekte (Strahlen, Blitze) mit Lebensdauer in Frames. */
    this.effects = [];

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
  resize(breite, hoehe) {
    if (!(breite > 0) || !(hoehe > 0)) return false;
    if (this.width === breite && this.height === hoehe) return false;
    this.width = breite;
    this.height = hoehe;
    this.canvas.width = breite;
    this.canvas.height = hoehe;
    this.waterLayer.width = Math.ceil(breite / WATER_SCALE);
    this.waterLayer.height = Math.ceil(hoehe / WATER_SCALE);
    // Die Geländeschicht ist auf die alte Größe gebaut und muss neu entstehen.
    this.terrainLayer = null;
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
    this.effects.push(erzeugeStrahl(fromX, fromY, toX, toY, optionen));
  }

  /** Fügt einen Explosionsblitz an einer Stelle hinzu. */
  addFlash(x, y, radius, optionen = {}) {
    this.effects.push(erzeugeBlitz(x, y, radius, optionen));
  }

  #updateEffects() {
    // Die Alterung liegt in `effects.js` — dort ist sie ohne Canvas prüfbar.
    this.effects = schreiteEffekteFort(this.effects);
  }

  #drawEffects() {
    for (const effect of this.effects) {
      const alpha = Math.max(0, Math.min(1, effect.life));
      if (effect.kind === 'beam') {
        this.ctx.save();
        // Kernstrahl
        this.ctx.globalAlpha = alpha;
        this.ctx.strokeStyle = effect.color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(effect.fromX, effect.fromY);
        this.ctx.lineTo(effect.toX, effect.toY);
        this.ctx.stroke();
        // Weicher Glow darum
        this.ctx.globalAlpha = alpha * 0.35;
        this.ctx.lineWidth = 9;
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
        const radius = effect.radius * (1 + (1 - effect.life) * 0.6);
        const gradient = this.ctx.createRadialGradient(
          effect.x, effect.y, 0,
          effect.x, effect.y, Math.max(1, radius),
        );
        gradient.addColorStop(0, 'rgba(255, 243, 196, ' + alpha + ')');
        gradient.addColorStop(0.45, 'rgba(244, 162, 97, ' + alpha * 0.7 + ')');
        gradient.addColorStop(1, 'rgba(231, 111, 81, 0)');
        this.ctx.save();
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(effect.x, effect.y, Math.max(1, radius), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
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
   * Explosionsradius-Vorschau am Zielpunkt der Flugbahn.
   * Zeigt, wie groß die Flächenwirkung der gewählten Waffe ist.
   */
  #drawBlastPreview(aimPreview, blastRadius) {
    if (!aimPreview || aimPreview.length === 0 || !blastRadius || blastRadius <= 0) return;
    const impact = aimPreview[aimPreview.length - 1];
    if (!impact) return;

    this.ctx.save();
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(impact.x, impact.y, blastRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.fillStyle = 'rgba(244, 162, 97, 0.10)';
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
    const ctx = layer.getContext('2d');

    const { layer: gebaut } = bakeTerrainLayerCpu({
      layer, ctx, bitmap, width, height, palette: this.palette,
    });
    this.terrainLayer = gebaut;
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

    return gebaut;
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
      if (path === 'gpu') this.terrainLayer = layer;
      this.gpuTerrainPath = path;
      this.gpuTerrainReason = reason;
    } catch (error) {
      this.gpuTerrainPath = 'cpu';
      this.gpuTerrainReason = `GPU-Weg nicht möglich: ${error.message}`;
    }
  }

  /** Stanzt einen Krater in die sichtbare Terrain-Ebene. */
  applyCrater(x, y, radius) {
    if (!this.terrainLayer) return;
    const ctx = this.terrainLayer.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.spawnExplosionParticles(x, y, radius);
  }

  /** Entfernt die vom Mahlstrom abgetragenen Randspalten. */
  applyContraction(inset) {
    if (!this.terrainLayer) return;
    const ctx = this.terrainLayer.getContext('2d');
    ctx.clearRect(0, 0, inset, this.height);
    ctx.clearRect(this.width - inset, 0, inset, this.height);
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
  }

  #drawSky() {
    // Generative Kulisse hat Vorrang: sie passt sich jeder Kartengröße an.
    if (this.scenery) {
      drawGenerativeSky(this.ctx, this.width, this.height, this.scenery, this.time);
      drawAmbient(this.ctx, this.width, this.height, this.scenery, this.time, false);
      // Die Horizontlinie liegt knapp über der Geländekante. Ein Horizont in der
      // Bildmitte würde vom Gelände verdeckt und die Landmarke verschwände.
      drawLandmarks(this.ctx, this.width, this.height, this.scenery, this.height * 0.47);
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
    return [
      Math.round(flach[0] + (tief[0] - flach[0]) * tiefe),
      Math.round(flach[1] + (tief[1] - flach[1]) * tiefe),
      Math.round(flach[2] + (tief[2] - flach[2]) * tiefe),
    ];
  }

  #drawWater(water) {
    if (!water) return;
    this.waterCtx.clearRect(0, 0, this.waterLayer.width, this.waterLayer.height);
    const image = this.waterCtx.createImageData(this.waterLayer.width, this.waterLayer.height);
    const data = image.data;
    const levels = water.levels;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level <= 0.02) continue;
      const index = i * 4;
      // Wasserfarbe aus der Kulisse: Meer, Lava, Schlamm und Gift sind
      // unterschiedliche Stoffe und dürfen nicht gleich blau sein. Gemischt wird
      // nach Tiefe — flache Stellen heller, tiefe dunkler.
      const tiefe = Math.min(1, level);
      const farbe = this.#wasserFarbe(tiefe);
      data[index] = farbe[0];
      data[index + 1] = farbe[1];
      data[index + 2] = farbe[2];
      data[index + 3] = Math.round(Math.min(0.72, level) * 210 * (this.scenery?.water?.alpha ?? 1));
    }
    this.waterCtx.putImageData(image, 0, 0);

    this.ctx.save();
    this.ctx.globalAlpha = 0.88;
    this.ctx.drawImage(this.waterLayer, 0, 0, this.width, this.height);
    this.ctx.restore();

    // Struktur der Wasserart NACH der Fläche: Kruste, Wellen, Blasen und Sterne
    // liegen auf dem Wasser, nicht darunter.
    if (this.scenery) {
      drawWaterSurface(this.ctx, this.width, this.height, this.scenery, this.time);
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
      this.ctx.beginPath();
      this.ctx.moveTo(-size / 2, -size / 2);
      this.ctx.lineTo(size / 2, size / 2);
      this.ctx.moveTo(size / 2, -size / 2);
      this.ctx.lineTo(-size / 2, size / 2);
      this.ctx.strokeStyle = color;
      this.ctx.globalAlpha = 0.5;
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  #drawEntities(entities, activePlayerId, aim) {
    for (const entity of entities) {
      if (!entity.alive) continue;
      const color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      this.ctx.save();
      this.ctx.translate(entity.x, entity.y);

      // Schatten
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.beginPath();
      this.ctx.ellipse(0, 11, 9, 3, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Körper
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(0, -2, 7, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#1b232c';
      this.ctx.fillRect(-6, 4, 12, 7);

      // Geschützrohr in Zielrichtung
      const isActive = entity.entityId === activePlayerId;
      const angle = isActive && aim ? aim.angle : entity.angle;
      this.ctx.rotate(-angle);
      this.ctx.fillStyle = isActive ? '#f4a261' : '#9aa7b4';
      this.ctx.fillRect(0, -2.5, 15, 5);
      this.ctx.restore();

      this.#drawHealthBar(entity);
    }
  }

  #drawHealthBar(entity) {
    const width = 30;
    const height = 4;
    const x = entity.x - width / 2;
    const y = entity.y - 22;
    const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
    const color = ratio > 0.6 ? '#90be6d' : ratio > 0.3 ? '#fbbf24' : '#ef476f';

    this.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    this.ctx.fillStyle = '#2b3540';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width * ratio, height);
  }

  #drawProjectiles(projectiles) {
    for (const projectile of projectiles) {
      const gradient = this.ctx.createRadialGradient(projectile.x, projectile.y, 0, projectile.x, projectile.y, 8);
      gradient.addColorStop(0, '#fff3c4');
      gradient.addColorStop(0.5, '#f4a261');
      gradient.addColorStop(1, 'rgba(244,162,97,0)');
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
      this.ctx.fill();

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

    this.ctx.save();
    this.ctx.setLineDash([]);
    // Voller Strich gegen die gestrichelte Zielhilfe: zwei Wege, zwei Muster.
    this.ctx.strokeStyle = 'rgba(76, 201, 240, 0.85)';
    this.ctx.lineWidth = 2.5;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (const point of points) this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();

    if (bahn.impact) {
      this.ctx.fillStyle = 'rgba(76, 201, 240, 0.9)';
      this.ctx.beginPath();
      this.ctx.arc(bahn.impact.x, bahn.impact.y, 5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  #drawAimPreview(points) {
    if (!points || points.length < 2) return;
    this.ctx.save();
    this.ctx.setLineDash([4, 6]);
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.75)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (const point of points) this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();
    this.ctx.restore();

    const last = points[points.length - 1];
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.9)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
    this.ctx.stroke();
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
    for (const particle of this.particles) {
      this.ctx.globalAlpha = Math.max(0, particle.life);
      this.ctx.fillStyle = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.radius * particle.life + 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  #drawMaelstrom(maelstrom) {
    if (!maelstrom?.active || maelstrom.inset <= 0) return;
    const { inset } = maelstrom;
    const gradientLeft = this.ctx.createLinearGradient(0, 0, inset * 2, 0);
    gradientLeft.addColorStop(0, 'rgba(180, 20, 60, 0.55)');
    gradientLeft.addColorStop(1, 'rgba(180, 20, 60, 0)');
    this.ctx.fillStyle = gradientLeft;
    this.ctx.fillRect(0, 0, inset * 2, this.height);

    const gradientRight = this.ctx.createLinearGradient(this.width, 0, this.width - inset * 2, 0);
    gradientRight.addColorStop(0, 'rgba(180, 20, 60, 0.55)');
    gradientRight.addColorStop(1, 'rgba(180, 20, 60, 0)');
    this.ctx.fillStyle = gradientRight;
    this.ctx.fillRect(this.width - inset * 2, 0, inset * 2, this.height);

    this.ctx.strokeStyle = 'rgba(239, 71, 111, 0.8)';
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
   * @param {object} [options.water] - WaterField-Instanz des Matches
   * @param {number} [options.blastRadius] - Flächenwirkung der gewählten Waffe
   */
  render(state, { aimPreview = null, prediction = null, aim = null, water = null, blastRadius = 0 } = {}) {
    // Zugänglichkeit je Bild neu abfragen: Ändert der Nutzer die
    // Systemeinstellung, greift sie ohne Neuladen.
    this.reducedMotion = prefersReducedMotion();
    this.time += 1;
    this.#drawSky();

    if (this.terrainLayer) {
      this.ctx.drawImage(this.terrainLayer, 0, 0);
    }

    this.#drawWater(water);
    this.#drawWindArrow(state.wind);
    this.#drawBlastPreview(aimPreview, blastRadius);
    // Kackhaufen liegen auf dem Boden, Günther darüber.
    this.#drawPoopPiles(state.guenther?.haufen ?? []);
    this.#drawCrates(state.crates ?? []);
    /*
     * Geschütze VOR den Kisten zeichnen: Lägen beide übereinander, wäre die
     * Kiste (die man aufheben kann) wichtiger als das Geschütz.
     */
    this.#drawTurrets(state.turrets ?? []);
    this.#drawMaelstrom(state.maelstrom);
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
    this.#drawEntities(state.entities ?? [], state.activePlayerId, aim);
    this.#drawGuenther(state.guenther);
    this.#drawProjectiles(state.projectiles ?? []);
    this.#drawEffects();
    this.#drawHeimdall();
    this.#updateEffects();
    this.updateParticles();
    this.#drawParticles();

    // Regen, Schnee, Funken und Glühwürmchen liegen VOR dem Geschehen: sie
    // ziehen zwischen Kamera und Figuren.
    if (this.scenery) {
      drawAmbient(this.ctx, this.width, this.height, this.scenery, this.time, true);
    }
  }
}

export default Renderer;
