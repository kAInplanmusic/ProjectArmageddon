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
   * @param {function():void} handlers.onFire
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
    // Leertaste springt. Mit A/D wird die Richtung mitgegeben, damit man über
    // Kanten kommt. Der zweite Druck in der Luft ist der Doppelsprung.
    if (key === ' ' || key === 'Spacebar' || key === 'Enter' || key.startsWith('Arrow')) return;
    if (event.code === 'Space') {
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

  #releaseCharge() {
    this.#charging = false;
    this.#handlers.onFire?.();
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
