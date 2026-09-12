/**
 * Serverseitige Input-Validierung.
 *
 * Der Server ist die Source of Truth: Diese Funktionen prüfen eingehende
 * Spielerbefehle gegen die in network.js definierten Regeln, bevor sie in die
 * Simulation gelangen. Sie sind bewusst frei von Seiteneffekten.
 *
 * @module validation
 */
import { NETWORK_RULES } from './config/network.js';
import { WEAPONS_BY_ID } from './config/weapons.js';

export const INPUT_LIMITS = Object.freeze({
  angleMin: 0,
  angleMax: Math.PI,
  powerMin: 0,
  powerMax: 100,
  maxTickDrift: NETWORK_RULES.lagCompensationBufferMs * 2,
  /**
   * Größte zulässige Nutzlast einer Nachricht vom Client an den Server.
   *
   * Fund (belegt): Dieser Wert war definiert, wurde aber NIRGENDS verwendet
   * (`grep -rn maxPayloadBytes src/` fand nur diese Zeile). `parseControlMessage`
   * rief `JSON.parse` auf beliebig große Eingaben auf. Gemessen: Eine Nachricht
   * mit 1 MB Füllsel wurde angenommen. Die Grenze war also eine Absicht ohne
   * Wirkung.
   *
   * Sie gilt für die Richtung CLIENT → SERVER. Server → Client darf größer sein
   * (die Waffenbestände aller Spieler gehen als eine Nachricht raus), deshalb
   * steht die Prüfung im Server und nicht im gemeinsamen Parser.
   *
   * 512 Byte sind reichlich: Die größte echte Clientnachricht ist ein JOIN mit
   * Name und Token oder ein Schuss mit Winkel, Kraft, Waffe und Tick — beide
   * unter 200 Byte.
   */
  maxPayloadBytes: 512,
});

export function isValidAngle(angle) {
  return Number.isFinite(angle) && angle >= INPUT_LIMITS.angleMin && angle <= INPUT_LIMITS.angleMax;
}

export function isValidPower(power) {
  return Number.isFinite(power) && power >= INPUT_LIMITS.powerMin && power <= INPUT_LIMITS.powerMax;
}

export function normalizeInput(raw = {}) {
  /*
   * Winkel und Kraft müssen ZAHLEN sein — nicht nur in Zahlen umwandelbar.
   *
   * Fund (belegt): Hier stand `Number(raw.angle)`. Damit galt für JSON-Werte
   * alles als gültig, was sich umwandeln lässt:
   *
   *   Number(null)  === 0     → ein fehlender Winkel wurde zu 0
   *   Number(true)  === 1     → `true` wurde zu Winkel 1
   *   Number([])    === 0     → ein leeres Feld wurde zu 0
   *   Number('1.5') === 1.5   → Zeichenketten wurden angenommen
   *
   * Gemessen mit `validateCommand`: `{angle: null}`, `{power: null}`,
   * `{angle: '1.5'}`, `{angle: true}` und `{angle: []}` wurden alle AKZEPTIERT.
   *
   * Ein Vorteil war damit nicht zu erlangen (die Werte liegen im erlaubten
   * Bereich), aber das Format verliert seine Aussage: Der Draht sagt „Zahl", und
   * eine kaputte Nachricht wurde zu einem echten Schuss statt zu einer Ablehnung.
   * Genau das ist der Fall, den eine Validierung abfangen soll.
   *
   * Mit der Typprüfung ergibt jeder nicht-numerische Wert `NaN`, und
   * `isValidAngle`/`isValidPower` lehnen ihn ab.
   */
  const angle = typeof raw.angle === 'number' ? raw.angle : Number.NaN;
  const power = typeof raw.power === 'number' ? raw.power : Number.NaN;
  const result = { angle, power, type: raw.type ?? 'fire', weaponId: raw.weaponId ?? null };

  const errors = [];
  if (!NETWORK_RULES.clientValidatedInputs.includes('angle') === false && !isValidAngle(angle)) {
    errors.push(`angle muss zwischen ${INPUT_LIMITS.angleMin} und ${INPUT_LIMITS.angleMax} liegen`);
  }
  if (!isValidPower(power)) {
    errors.push(`power muss zwischen ${INPUT_LIMITS.powerMin} und ${INPUT_LIMITS.powerMax} liegen`);
  }
  if (raw.type !== undefined && typeof raw.type !== 'string') {
    errors.push('type muss eine Zeichenkette sein');
  }
  if (result.weaponId !== null && typeof result.weaponId !== 'string') {
    errors.push('weaponId muss eine Zeichenkette oder null sein');
  } else if (result.weaponId !== null && !WEAPONS_BY_ID[result.weaponId]) {
    errors.push(`Unbekannte Waffe: ${result.weaponId}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, input: null };
  }
  return { valid: true, errors: [], input: result };
}

/**
 * Prüft, ob ein Input zum aktuellen Tick-Zeitfenster gehört.
 * Verhindert Replay-/Latenzmissbrauch durch zu alte oder zu junge Befehle.
 */
export function isTickInWindow(inputTick, currentTick, maxDrift = INPUT_LIMITS.maxTickDrift) {
  if (!Number.isInteger(inputTick) || !Number.isInteger(currentTick)) return false;
  if (inputTick < 0) return false;
  return inputTick >= currentTick - maxDrift && inputTick <= currentTick + maxDrift;
}

/**
 * Vollständige Befehlprüfung inklusive Tick-Fenster und Spielerberechtigung.
 */
export function validateCommand(command, { currentTick, activePlayerId, knownPlayerIds = [] } = {}) {
  const errors = [];

  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Kommando fehlt'], input: null };
  }
  if (activePlayerId !== undefined && command.playerId !== activePlayerId) {
    errors.push('Spieler ist nicht am Zug');
  }
  if (knownPlayerIds.length > 0 && !knownPlayerIds.includes(command.playerId)) {
    errors.push('Unbekannter Spieler');
  }
  if (currentTick !== undefined && !isTickInWindow(command.tick, currentTick)) {
    errors.push('Tick liegt ausserhalb des erlaubten Fensters');
  }

  const normalized = normalizeInput(command);
  errors.push(...normalized.errors);

  if (errors.length > 0) {
    return { valid: false, errors, input: null };
  }
  return { valid: true, errors: [], input: normalized.input };
}

export default validateCommand;
