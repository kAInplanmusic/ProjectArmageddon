/**
 * Strukturierte Logs für den Server.
 *
 * ## Warum JSON statt Freitext
 *
 * Freitextzeilen wie `[restore] Lobby abc übersprungen: kaputt` sind für einen
 * Menschen lesbar und für ein Programm wertlos. Wer wissen will, wie oft ein
 * Reconnect fehlschlägt oder wie lange Lobbys leben, müsste den Text parsen —
 * und bricht dabei bei jeder Umformulierung. Eine JSON-Zeile je Ereignis ist
 * maschinenlesbar und trotzdem lesbar.
 *
 * ## Festes Schema
 *
 * Jede Zeile hat genau diese Felder:
 *
 *   ts      ISO-8601 mit Millisekunden
 *   level   'debug' | 'info' | 'warn' | 'error'
 *   event   Kurzname in snake_case, stabil (z. B. 'lobby_restore_skipped')
 *   msg     lesbare Beschreibung (darf sich ändern)
 *   …       die Felder des Aufrufers
 *
 * `event` ist der Anker für Auswertung, `msg` für den Menschen. Wer im Betrieb
 * sucht, filtert auf `event`; wer im Terminal liest, liest `msg`.
 *
 * ## Eine Zeile pro Datensatz
 *
 * Das ist nicht kosmetisch: Log-Sammler (journald, Docker, Loki) trennen
 * Datensätze am Zeilenumbruch. Ein `JSON.stringify` über ein Objekt mit
 * Zeilenumbruch — etwa aus einem Stacktrace — zerlegt einen Datensatz in
 * mehrere und macht die Auswertung kaputt. `serialize()` ersetzt sie deshalb.
 *
 * ## Keine Geheimnisse im Log
 *
 * Tokens, Schlüssel und Passwörter gehören nicht in Logdateien; sie werden dort
 * dauerhaft aufbewahrt und weitergereicht. Der Logger redigiert Felder, deren
 * NAME verdächtig ist, und kürzt lange Zeichenketten. Das ist eine
 * Gürtel-und-Hosenträger-Regel: Wer ein Token unter `playerName` protokolliert,
 * wird nicht geschützt — aber der naheliegende Fall `token` ist es.
 *
 * @module logger
 */

/** Feldnamen, deren Inhalt niemals ins Log gehört. */
const GEHEIME_FELDER = /token|secret|password|passwort|key|authorization|cookie|credential/i;

/** Länge, ab der eine Zeichenkette gekürzt wird (Stacktraces bleiben nutzbar). */
const MAX_STRING = 500;

export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

const RANG = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/** Ersetzt Zeilenumbrüche, damit ein Datensatz eine Zeile bleibt. */
function einzeilig(text) {
  return text.replace(/\r\n|\r|\n/g, '\\n');
}

/** Redigiert einen Wert, wenn sein Feldname verdächtig ist. */
function redigiere(wert, feldname) {
  /*
   * Zahlen und Wahrheitswerte können kein Geheimnis tragen.
   *
   * Fund (belegt): Der Namensfilter ist bewusst grob (`/token|…/i`), damit ein
   * unachtsam benanntes Feld geschützt ist. Dadurch traf er aber auch
   * SIGNALfelder wie `hasToken` — und ersetzte ein harmloses `false` durch
   * `[redigiert:5]`. Das macht Diagnosen kaputt, ohne etwas zu schützen.
   * Deshalb: primitive Nicht-Zeichenketten gehen unverändert durch.
   */
  if (typeof wert === 'boolean' || typeof wert === 'number' || wert === null || wert === undefined) {
    return wert;
  }
  if (GEHEIME_FELDER.test(feldname)) {
    // Nie den Wert selbst ausgeben — auch nicht gekürzt.
    return `[redigiert:${String(wert).length}]`;
  }
  if (typeof wert === 'string') {
    if (wert.length > MAX_STRING) return `${wert.slice(0, MAX_STRING)}…[${wert.length}]`;
    return einzeilig(wert);
  }
  if (wert instanceof Error) {
    return { name: wert.name, message: einzeilig(wert.message), stack: einzeilig(wert.stack ?? '') };
  }
  if (Array.isArray(wert)) return wert.map((eintrag, i) => redigiere(eintrag, `${feldname}.${i}`));
  if (wert && typeof wert === 'object') {
    const ergebnis = {};
    for (const [schluessel, inhalt] of Object.entries(wert)) {
      ergebnis[schluessel] = redigiere(inhalt, schluessel);
    }
    return ergebnis;
  }
  return wert;
}

/**
 * Baut die Ausgabezeile. Exportiert, damit ein Test das Schema prüfen kann, ohne
 * `console` abfangen zu müssen.
 *
 * @param {string} level
 * @param {string} event
 * @param {string} msg
 * @param {object} felder
 * @param {() => Date} jetzt - Zeitquelle (für Tests ersetzbar)
 * @returns {string} genau eine Zeile, ohne Umbruch
 */
export function serialize(level, event, msg, felder = {}, jetzt = () => new Date()) {
  const datensatz = {
    ts: jetzt().toISOString(),
    level,
    event,
    msg: einzeilig(String(msg)),
  };
  for (const [schluessel, wert] of Object.entries(felder)) {
    // Schemafelder des Loggers nicht überschreiben.
    if (schluessel === 'ts' || schluessel === 'level' || schluessel === 'event' || schluessel === 'msg') {
      datensatz[`feld_${schluessel}`] = redigiere(wert, schluessel);
      continue;
    }
    datensatz[schluessel] = redigiere(wert, schluessel);
  }
  return JSON.stringify(datensatz);
}

/**
 * Erzeugt einen Logger.
 *
 * @param {object} [optionen]
 * @param {string} [optionen.level='info'] - Mindeststufe
 * @param {string} [optionen.format='json'] - 'json' oder 'pretty' (für Menschen)
 * @param {(zeile: string) => void} [optionen.senke] - Ausgabe; Standard: stdout
 * @param {object} [optionen.basis] - Felder, die jeder Zeile beigelegt werden
 * @param {() => Date} [optionen.jetzt] - Zeitquelle
 * @returns {object} Logger mit debug/info/warn/error und child()
 */
export function createLogger({
  level = 'info',
  format = 'json',
  senke = null,
  basis = {},
  jetzt = () => new Date(),
} = {}) {
  const mindest = RANG[level] ?? RANG.info;
  const schreibe = senke ?? (zeile => process.stdout.write(`${zeile}\n`));

  const log = (stufe, event, msg, felder = {}) => {
    if (RANG[stufe] < mindest) return;
    const zusammen = { ...basis, ...felder };
    const zeile = format === 'pretty'
      ? `${zusammen.ts ?? jetzt().toISOString()} ${stufe.padEnd(5)} ${event} — ${einzeilig(String(msg))}`
      : serialize(stufe, event, msg, zusammen, jetzt);
    schreibe(format === 'pretty' ? zeile : zeile);
  };

  return {
    level,
    format,
    debug: (event, msg, felder) => log('debug', event, msg, felder),
    info: (event, msg, felder) => log('info', event, msg, felder),
    warn: (event, msg, felder) => log('warn', event, msg, felder),
    error: (event, msg, felder) => log('error', event, msg, felder),
    /** Kind-Logger mit zusätzlichen Feldern (z. B. lobbyId für eine Sitzung). */
    child: (extra) => createLogger({
      level, format, senke, basis: { ...basis, ...extra }, jetzt,
    }),
  };
}

/**
 * Ein Logger, der Zeilen sammelt — für Tests.
 * @returns {object} { logger, zeilen, datensaetze() }
 */
export function createCaptureLogger({ level = 'debug', jetzt } = {}) {
  const zeilen = [];
  const logger = createLogger({
    level,
    senke: zeile => zeilen.push(zeile),
    ...(jetzt ? { jetzt } : {}),
  });
  return {
    logger,
    zeilen,
    /** Parst die gesammelten Zeilen — wirft, wenn eine Zeile kein JSON ist. */
    datensaetze: () => zeilen.map(zeile => JSON.parse(zeile)),
  };
}

export default { createLogger, createCaptureLogger, serialize, LOG_LEVELS };
