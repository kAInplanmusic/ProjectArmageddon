/**
 * Eingabesteuerung (Maus + Tastatur).
 *
 * Der Controller ist bewusst frei von Simulationslogik: Er sammelt nur
 * Absicht (Winkel, Kraft, Feuerwunsch) und reicht sie an Callbacks weiter.
 * Dadurch bleibt die Simulation deterministisch und headless testbar.
 *
 * @module input
 */
import { isTextEntry } from './dom.js';
import { BEWEGUNG } from '../shared/config/bewegung.js';

/** Zieltempo der gehaltenen Zieltasten in rad/s. */
const ZIELTEMPO = 1.2;
const LINKS = new Set(['a', 'arrowleft']);
const RECHTS = new Set(['d', 'arrowright']);
const OBEN = new Set(['w', 'arrowup']);
const UNTEN = new Set(['s', 'arrowdown']);

/** Normierter Tastenname: Buchstaben klein, damit Shift+A und A dieselbe Taste sind. */
function taste(key) {
  return typeof key === 'string' ? key.toLowerCase() : '';
}

/** Kraft eines getippten Schusses (Ladefortschritt 0). */
export const MIN_KRAFT = 30;

/** Kraft eines voll aufgeladenen Schusses (Ladefortschritt 1). */
export const MAX_KRAFT = 100;

/**
 * Die Kraft eines aufgeladenen Schusses: 0 = gerade getippt, 1 = voll geladen.
 *
 * ## Der Befund, der diese Funktion sichtbar machte (belegt)
 *
 * Die Formel stand bis 2026-09-27 als toter Zweig in `Main#fire`:
 *
 *     const charging = this.input.isCharging;
 *     const power = charging ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70))) : this.aim.power;
 *
 * `#releaseCharge()` löschte `#charging` VOR dem Feuern (`onFire()`), also war
 * `isCharging` beim Lesen immer `false` — `power` war immer `this.aim.power`.
 * Das Aufladen war damit eine Attrappe, während README („halten = mehr Kraft")
 * und die Tastaturliste in `index.html` es versprachen. Es gab außerdem keine
 * Anzeige: `chargeRatio` existierte, aber niemand zeichnete ihn.
 *
 * ## Warum die Rechnung hier steht und nicht im Aufrufer
 *
 * Als reine Funktion ist sie ohne DOM und ohne Browser prüfbar — dieselbe
 * Trennung wie bei `weaponAnimation.js`. Der Aufrufer (`Main#fire`) bekommt die
 * fertige Zahl vom Eingabe-Controller und rechnet nicht nach.
 *
 * Ein TIPPEN ergibt {@link MIN_KRAFT} (schwacher Schuss), volles Aufladen
 * {@link MAX_KRAFT}. Beides ist eine Zusage an den Spieler: Wer hält, schießt
 * weiter.
 *
 * @param {number} anteil Ladefortschritt 0..1 (aus `InputController#chargeRatio`)
 * @returns {number} Kraft zwischen {@link MIN_KRAFT} und {@link MAX_KRAFT}
 */
export function kraftAusLadung(anteil) {
  const a = Math.max(0, Math.min(1, Number(anteil) || 0));
  return Math.round(MIN_KRAFT + a * (MAX_KRAFT - MIN_KRAFT));
}

export class InputController {
  #canvas;
  #handlers;
  #keys = new Set();
  #aim = { angle: Math.PI / 4, power: 55 };
  #charging = false;
  #chargeStart = 0;
  #pointer = { x: 0, y: 0 };
  #scale = { x: 1, y: 1 };
  #lauf = 0;
  #ladenPerTaste = false;
  #touchLauf = 0;
  #laufGesendet = 0;
  #blick = 1;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} handlers
   * @param {function():{x:number,y:number}|null} handlers.getOrigin - Ursprung der Figur am Zug
   * @param {function(number, number):void} handlers.onAim
   * @param {function(number):void} handlers.onFire - Kraft des Schusses (aus dem Aufladen);
   *   ein Tippen liefert `MIN_KRAFT`
   */
  constructor(canvas, handlers = {}) {
    this.#canvas = canvas;
    this.#handlers = handlers;
    this.#attach();
    this.#recalculateScale();
  }

  #recalculateScale() {
    const rect = this.#canvas.getBoundingClientRect();
    this.#scale.x = this.#canvas.width / (rect.width || this.#canvas.width);
    this.#scale.y = this.#canvas.height / (rect.height || this.#canvas.height);
  }

  #attach() {
    this.#canvas.addEventListener('pointermove', event => {
      // Die Zeichenfläche ändert ihre Größe mit der Karte: Maßstab nicht veraltet lassen.
      this.#recalculateScale();
      const rect = this.#canvas.getBoundingClientRect();
      this.#pointer.x = (event.clientX - rect.left) * this.#scale.x;
      this.#pointer.y = (event.clientY - rect.top) * this.#scale.y;
      this.#updateAngleFromPointer();
    });

    this.#canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.#recalculateScale();
      this.#updateAngleFromPointer();
      this.#beginCharge();
    });

    // Der Browser kann eine Berührung abbrechen (Scrollen, Systemgeste): ohne diese Behandlung
    // bliebe die Ladung stehen (Audit 2026-10-13, Touch).
    window.addEventListener('pointercancel', () => {
      if (this.#charging) this.#releaseCharge();
    });

    window.addEventListener('pointerup', event => {
      if (event.button !== 0) return;
      if (this.#charging) this.#releaseCharge();
    });

    window.addEventListener('keydown', event => {
      if (event.repeat) return;
      // Nicht die Spielfigur steuern, während der Nutzer in ein Textfeld tippt.
      // Ohne diese Prüfung würde z. B. der Seed "2026" den Winkel verändern,
      // die Leertaste feuern und "r" das Match neu starten.
      if (isTextEntry(event.target)) return;
      this.#keys.add(taste(event.key));
      this.#onKeyDown(event);
    });

    window.addEventListener('keyup', event => {
      const key = taste(event.key);
      this.#keys.delete(key);
      if (key === ' ' || key === 'shift') {
        // Geladen wird mit Leertaste ODER Shift: erst wenn keine der beiden mehr gehalten wird, fällt der Schuss.
        if (this.#charging && this.#ladenPerTaste && !this.#keys.has(' ') && !this.#keys.has('shift')) this.#releaseCharge();
      }
      this.#syncLaufen();
    });

    // Fokusverlust: ein verlorenes „Taste los" darf die Figur nicht weiterlaufen lassen.
    window.addEventListener('blur', () => {
      this.#keys.clear();
      this.#charging = false;
      this.#syncLaufen();
    });

    window.addEventListener('resize', () => this.#recalculateScale());
  }

  /*
   * TASTENBELEGUNG (verbindlich, Auftraggeber 2026-10-21):
   *
   *   A / ←     links laufen (gehalten)       D / →     rechts laufen (gehalten)
   *   W / ↑     nach oben zielen (gehalten)   S / ↓     nach unten zielen (gehalten)
   *   Leertaste ODER Shift (gehalten)  Schuss aufladen, beim Loslassen feuern
   *   Enter     Sprung (mit gehaltenem A/D seitlich; in der Luft Doppelsprung)
   *   Rück      Rückwärtssalto: hoher, weiter Sprung entgegen der Blickrichtung
   *   1–9 Waffe · E Waffenmenü · Q Waffe abwerfen · Maus: zielen und halten = aufladen
   *
   * Warum Enter = Sprung und Rück = Salto: Beide Tasten liegen rechts, weit weg von den Lauf- und Zieltasten der linken
   * Hand, und die rechte Hand kann springen, während die linke läuft (A/D + Enter ist die Worms-Geste). Enter feuerte
   * früher sofort ohne Aufladen; dieser Weg entfällt, der Schuss läuft nur noch über Aufladen (Tippen = schwacher Schuss).
   * Shift kann nicht mehr springen: Es lädt jetzt wie die Leertaste. Pfeile und WASD sind gleichwertig.
   * Kraft stellt keine Taste mehr ein — sie ergibt sich allein aus der Haltedauer (`kraftAusLadung`).
   */
  #onKeyDown(event) {
    const key = taste(event.key);

    if (key === ' ' || key === 'shift') {
      if (key === ' ') event.preventDefault();
      if (!this.#charging) this.#ladenPerTaste = true;
      this.#beginCharge();
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      this.#handlers.onJump?.(this.#laufRichtung(), false);
      return;
    }
    if (key === 'backspace') {
      // Backspace würde in manchen Browsern „Seite zurück" auslösen.
      event.preventDefault();
      this.#handlers.onJump?.(-this.#blick, true);
      return;
    }
    if (LINKS.has(key) || RECHTS.has(key)) {
      if (key.startsWith('arrow')) event.preventDefault();
      this.#syncLaufen();
      return;
    }
    if (OBEN.has(key) || UNTEN.has(key)) {
      if (key.startsWith('arrow')) event.preventDefault();
      // Ein Tipp zielt sofort ein Stück; Halten läuft über `update` weiter.
      this.#ziele(OBEN.has(key) ? 1 : -1, 0.012);
      return;
    }
    if (/^[1-9]$/.test(key)) {
      this.#handlers.onWeaponSelect?.(Number(key) - 1);
      return;
    }
    // Q wirft die gerade gewählte Waffe ab. Bewusst eine eigene Taste: Abwerfen
    // ist eine Entscheidung, kein Nebenprodukt einer anderen Handlung.
    if (key === 'q') {
      this.#handlers.onWeaponDrop?.();
      return;
    }
    // E öffnet/schließt das Waffenmenü (Dropdown des Besitzes).
    if (key === 'e') {
      this.#handlers.onWeaponMenu?.();
    }
  }

  /** Richtung der gehaltenen Lauftasten (Touch-Knopf eingeschlossen): −1, 0, 1. */
  #laufRichtung() {
    const links = [...LINKS].some(k => this.#keys.has(k));
    const rechts = [...RECHTS].some(k => this.#keys.has(k));
    const tasten = (rechts ? 1 : 0) - (links ? 1 : 0);
    return tasten !== 0 ? tasten : this.#touchLauf;
  }

  /** Meldet den Laufzustand, wenn er sich geändert hat; wer läuft, blickt in Laufrichtung (Winkel spiegelt). */
  #syncLaufen() {
    const richtung = this.#laufRichtung();
    if (richtung === this.#lauf) return;
    this.#lauf = richtung;
    this.#laufGesendet = performance.now();
    if (richtung !== 0 && richtung !== this.#blick) {
      this.#blick = richtung;
      this.setAngle(Math.PI - this.#aim.angle);
    }
    this.#handlers.onWalk?.(richtung);
  }

  /** Touch-Knopf „Laufen" (Hochformat): gleiche Absicht wie A/D. */
  setzeLaufen(richtung) {
    this.#touchLauf = richtung;
    this.#syncLaufen();
  }

  /** Blickrichtung der Figur: 1 = rechts, −1 = links (folgt dem Zielwinkel und dem Laufen). */
  get blickrichtung() { return this.#blick; }

  /**
   * Nach oben (+1) oder unten (−1) zielen. „Oben" ist zur Senkrechten hin: nach rechts blickend wächst der Winkel,
   * nach links blickend sinkt er. Über die Senkrechte geht es per Taste nicht hinaus — das Umdrehen ist das Laufen.
   */
  #ziele(vorzeichen, schritt) {
    const hoch = vorzeichen * this.#blick;
    const neu = this.#aim.angle + hoch * schritt;
    const grenze = Math.PI / 2;
    this.setAngle(this.#blick > 0 ? Math.min(neu, Math.max(grenze, this.#aim.angle)) : Math.max(neu, Math.min(grenze, this.#aim.angle)));
  }

  /**
   * Pro Bild aufrufen: gehaltenes Zielen und Erneuerung der Gehabsicht.
   *
   * @param {number} dtMs - Millisekunden seit dem letzten Aufruf
   * @param {number} [jetzt] - `performance.now()`
   */
  update(dtMs, jetzt = performance.now()) {
    const dt = Math.min(100, Math.max(0, dtMs)) / 1000;
    const hoch = [...OBEN].some(k => this.#keys.has(k));
    const runter = [...UNTEN].some(k => this.#keys.has(k));
    if (hoch !== runter) this.#ziele(hoch ? 1 : -1, ZIELTEMPO * dt);
    if (this.#lauf !== 0 && jetzt - this.#laufGesendet >= BEWEGUNG.erneuernMs) {
      this.#laufGesendet = jetzt;
      this.#handlers.onWalk?.(this.#lauf);
    }
  }

  #updateAngleFromPointer() {
    const origin = this.#handlers.getOrigin?.();
    if (!origin) return;
    const dx = this.#pointer.x - origin.x;
    const dy = this.#pointer.y - origin.y;
    // Canvas-Y wächst nach unten, der Winkel wird mathematisch gemessen.
    let angle = Math.atan2(-dy, dx);
    if (angle < 0) angle = Math.abs(angle) < 0.35 ? 0 : Math.PI - Math.abs(angle) % Math.PI;
    angle = Math.max(0, Math.min(Math.PI, angle));
    this.setAngle(angle);
  }

  #beginCharge() {
    if (this.#charging) return;
    this.#charging = true;
    this.#chargeStart = performance.now();
  }

  /**
   * Beendet das Aufladen und feuert — mit der Kraft, die aufgeladen wurde.
   *
   * ## Die Reihenfolge ist der Befund (belegt, 2026-09-27)
   *
   * Hier stand:
   *
   *     this.#charging = false;
   *     this.#handlers.onFire?.();
   *
   * `#charging` wurde also VOR dem Feuern gelöscht, und `chargeRatio` liefert
   * nach dem Löschen `0` (`get chargeRatio`). `Main#fire` las `isCharging` und
   * bekam immer `false` — der Ladezweig dort war toter Code, jede Kugel flog mit
   * der eingestellten Kraft. Das Aufladen war eine Attrappe.
   *
   * Deshalb: ERST die Kraft lesen, DANN das Laden beenden, DANN feuern. Der
   * Handler bekommt den Wert als Argument — so kann keine spätere Änderung der
   * Reihenfolge die Angabe still wieder verschlucken.
   */
  #releaseCharge() {
    const kraft = kraftAusLadung(this.chargeRatio);
    this.#charging = false;
    this.#ladenPerTaste = false;
    this.#handlers.onFire?.(kraft);
  }

  /** Für den FEUER-Knopf der Oberfläche (Halten = laden, Loslassen = schießen). */
  ladenStarten() { this.#beginCharge(); }
  ladenLoslassen() { if (this.#charging) this.#releaseCharge(); }

  /** Ladefortschritt 0..1 (nur UI-Feedback, keine Simulationsgröße). */
  get chargeRatio() {
    if (!this.#charging) return 0;
    const elapsed = performance.now() - this.#chargeStart;
    return Math.min(1, elapsed / 1200);
  }

  setAngle(angle) {
    this.#aim.angle = Math.max(0.02, Math.min(Math.PI - 0.02, angle));
    const c = Math.cos(this.#aim.angle);
    if (Math.abs(c) > 0.02) this.#blick = c > 0 ? 1 : -1;
    this.#handlers.onAim?.(this.#aim.angle, this.#aim.power);
  }

  setPower(power) {
    this.#aim.power = Math.max(5, Math.min(100, power));
    this.#handlers.onAim?.(this.#aim.angle, this.#aim.power);
  }

  /** Setzt Zielwerte von aussen (z. B. nach Waffenwechsel oder Neustart). */
  reset(angle = Math.PI / 4, power = 55) {
    this.#aim.angle = angle;
    this.#aim.power = power;
    this.#handlers.onAim?.(this.#aim.angle, this.#aim.power);
  }

  get aim() {
    return { ...this.#aim };
  }

  get isCharging() {
    return this.#charging;
  }

  get pointer() {
    return { ...this.#pointer };
  }
}

export default InputController;
