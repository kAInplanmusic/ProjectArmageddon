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
      this.#keys.add(event.key);
      this.#onKeyDown(event);
    });

    window.addEventListener('keyup', event => {
      this.#keys.delete(event.key);
      if (event.key === ' ' && this.#charging) this.#releaseCharge();
    });

    window.addEventListener('resize', () => this.#recalculateScale());
  }

  #onKeyDown(event) {
    const key = event.key;

    if (key === ' ') {
      event.preventDefault();
      this.#beginCharge();
      return;
    }
    /*
     * Enter feuert — sofort, ohne Aufladen.
     *
     * Fund (belegt): Enter stand in der Aufzählung der „ignorierten" Tasten
     * (`if (... || key === 'Enter' || ...) return;`) und wurde damit STUMM
     * verworfen. Das README dokumentierte aber „`Enter` | Feuern", und kein
     * Test hat es je geprüft — die Steuerungstabelle war also eine Behauptung.
     *
     * Aufgefallen ist es erst, als die Schussvorhersage einen Test brauchte,
     * der ohne Maus feuert (ein Klick würde den Winkel mitverändern).
     *
     * Die Leertaste lädt auf (Klick-Verhalten), Enter schießt mit der
     * eingestellten Kraft — damit gibt es beide Wege, und keiner ist eine
     * Attrappe.
     */
    if (key === 'Enter') {
      event.preventDefault();
      this.#handlers.onFire?.();
      return;
    }
    if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
      this.setAngle(this.#aim.angle + 0.012);
      return;
    }
    if (key === 'd' || key === 'D' || key === 'ArrowRight') {
      this.setAngle(this.#aim.angle - 0.012);
      return;
    }
    if (key === 'w' || key === 'W' || key === 'ArrowUp') {
      this.setPower(this.#aim.power + 1);
      return;
    }
    if (key === 's' || key === 'S' || key === 'ArrowDown') {
      this.setPower(this.#aim.power - 1);
      return;
    }
    if (/^[1-9]$/.test(key)) {
      this.#handlers.onWeaponSelect?.(Number(key) - 1);
      return;
    }
    // Q wirft die gerade gewählte Waffe ab. Bewusst eine eigene Taste: Abwerfen
    // ist eine Entscheidung, kein Nebenprodukt einer anderen Handlung.
    if (key === 'q' || key === 'Q') {
      this.#handlers.onWeaponDrop?.();
      return;
    }
    /*
     * Springen liegt auf SHIFT — nicht auf der Leertaste.
     *
     * FUND (belegt, 2026-09-20): Hier stand ein Sprung auf
     * `event.code === 'Space'`. Er war NIE erreichbar: Die Leertaste beginnt
     * weiter oben das Aufladen und kehrt zurück. Damit hatte der Sprung GAR
     * KEINEN Auslöser — er war nur über die Debug-API (`__PA__.jump`) erreichbar,
     * während README und Hilfe ihn als Spielereingabe nannten. Ein Test, der
     * `__PA__.jump()` aufrief, konnte das nie bemerken.
     *
     * Die Leertaste bleibt das Aufladen (festgehalten von
     * `prediction-gpu.spec.mjs`, „Die Leertaste lädt weiterhin auf …"), Enter
     * feuert sofort. Für den Sprung bleibt damit eine eigene Taste: SHIFT.
     *
     * Mit A/D wird die Richtung mitgegeben, damit man über Kanten kommt; der
     * zweite Druck in der Luft ist der Doppelsprung. Die Pfeiltasten sind oben
     * schon für Winkel und Kraft vergeben und tun hier bewusst nichts.
     */
    if (key === 'Shift') {
      const seitlich = this.#keys.has('a') || this.#keys.has('A') || this.#keys.has('ArrowLeft')
        ? -1
        : (this.#keys.has('d') || this.#keys.has('D') || this.#keys.has('ArrowRight') ? 1 : 0);
      this.#handlers.onJump?.(seitlich);
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
    this.#handlers.onFire?.(kraft);
  }

  /** Ladefortschritt 0..1 (nur UI-Feedback, keine Simulationsgröße). */
  get chargeRatio() {
    if (!this.#charging) return 0;
    const elapsed = performance.now() - this.#chargeStart;
    return Math.min(1, elapsed / 1200);
  }

  setAngle(angle) {
    this.#aim.angle = Math.max(0.02, Math.min(Math.PI - 0.02, angle));
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
