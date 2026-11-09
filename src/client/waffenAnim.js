/**
 * Rollen, Sperre und Abnahme der Waffen-Zusatzanimationen (W05/W06/W11/W17).
 *
 * `src/client/assets/weapon-sprites/anim/` enthält 26 WebP-Blätter (8 Frames,
 * 4x2, Zelle 256). Sie sind Material, kein Produktionsbestand: mehrere zeigen
 * fremde Tiere oder Humanoide, zwei sind bytegleich, einige tragen eingebrannte
 * Effekte. Deshalb gibt es hier absichtlich KEINEN Bildimport und keinen
 * Standardlader. Der Produktpfad lädt die Blätter nicht, und ein Blatt wird nur
 * geladen, wenn drei Dinge zusammenkommen:
 *
 * 1. `freigabe` steht im Manifest des Blattes auf `true` (nach Abnahme),
 * 2. die ID steht in `ANIM_FREIGABE`,
 * 3. ein Lader ist im Renderer verdrahtet (`erzeugeAnimLader`).
 *
 * Fehlt einer der drei Teile, bleibt es beim bisherigen Verhalten (Atlas-Zelle
 * plus prozedurale Bewegung). `tests/waffen-anim-gating.test.js` prüft genau
 * diese Sperre, damit ein Blatt nicht versehentlich im Produkt landet.
 *
 * Die Rollen trennen, was heute in einem einzigen „Waffe“-Begriff steckt:
 * Projektil, Wurfobjekt, Rückenobjekt, gehaltene Waffe, Selbstwirkung,
 * Weltobjekt und beschworene Figur brauchen unterschiedliche Anker und Posen
 * (W07). Ein Blatt ohne passende Rolle wird nicht abgenommen.
 *
 * @module waffenAnim
 */

/** Gesamtzustand des Bestands. `gesperrt` heißt: kein Blatt im Produktpfad. */
export const ANIM_STATUS = 'gesperrt';

/**
 * Ausdrücklich abgenommene Blätter. Leer, bis Rollen- und Identitätsabnahme
 * (W05) sowie die Browserabnahme (W20) bestanden sind. Diese Liste ist die
 * zweite, bewusst kleine Schranke vor dem Manifestwert `freigabe`.
 */
export const ANIM_FREIGABE = new Set();

/** Zulässige Schweregrade eines Befunds; `fremd` ist die härteste Stufe. */
export const ANIM_SCHWEREN = ['fremd', 'identitaet', 'statisch', 'nah'];

/**
 * Darstellungsrollen. Jede Rolle legt fest, welche Anker sinnvoll sind; ein
 * Blatt, dessen Motiv zu einer anderen Rolle gehört, gilt als nicht abgenommen.
 */
export const ANIM_ROLLEN = Object.freeze({
  flug: {
    titel: 'Projektil im Flug',
    beschreibung: 'Geschoss, Rakete, Granate oder Meteor im Flug; Achse ist die Flugrichtung, eine Mündung gibt es nicht.',
    anker: ['flugStart', 'flugEnde'],
  },
  wurf: {
    titel: 'Geworfenes Objekt',
    beschreibung: 'Wurfwaffe mit eigener Drehachse, optional mit Rückkehr; keine Mündung, kein Dauerfeuer.',
    anker: ['wurfHand', 'wurfDrehpunkt'],
  },
  ruecken: {
    titel: 'Rückenobjekt',
    beschreibung: 'Am Rücken getragen (Rucksack, Schirm). Die bestehende Rücken-Korrektur der Figur bleibt zuständig.',
    anker: ['rueckenMitte'],
  },
  hand: {
    titel: 'Gehaltene Waffe',
    beschreibung: 'Waffe in der Hand mit Griff und Wirkspitze (Mündung, Klinge, Kontaktfläche).',
    anker: ['grip', 'muzzle'],
  },
  selbst: {
    titel: 'Wirkung am eigenen Spieler',
    beschreibung: 'Aura, Schild oder Tempo am Träger; kein Zielstrahl, keine Mündung.',
    anker: ['traegerMitte'],
  },
  welt: {
    titel: 'Weltobjekt am Boden',
    beschreibung: 'Abgelegtes oder aufgestelltes Objekt (Mine, Bombe, Aufbau), das an einer Weltkoordinate bleibt.',
    anker: ['bodenMitte'],
  },
  beschwoerung: {
    titel: 'Beschworene Figur',
    beschreibung: 'Wächter oder Kreatur mit eigenem Körper und eigenen Aktionen; kein Waffenblatt im Handsinne.',
    anker: ['figurFuss'],
  },
});

/** Alle bekannten Rollennamen (Reihenfolge wie in `ANIM_ROLLEN`). */
export const ANIM_ROLLEN_NAMEN = Object.freeze(Object.keys(ANIM_ROLLEN));

/**
 * Prüft ein Animationsmanifest gegen die Abnahmeregeln (rein, ohne Dateizugriff).
 *
 * Gibt eine Liste von Fehlern zurück; leer heißt regelkonform. Geprüft werden
 * Pflichtfelder je Blatt, die Rollenzuordnung, der Schweregrad und der
 * Gleichlauf von Manifestfreigabe und `ANIM_FREIGABE` (fail closed: eine
 * Freigabe im Manifest ohne Eintrag in der Liste ist ein Fehler, nicht erlaubt).
 *
 * @param {object} manifest Inhalt von `assets/weapon-sprites/anim/manifest.json`
 * @param {Set<string>} [freigabe] abgenommene IDs; Standard ist `ANIM_FREIGABE`
 * @returns {string[]} Fehlertexte in deutscher Sprache
 */
export function animFreigabePruefen(manifest, freigabe = ANIM_FREIGABE) {
  const fehler = [];
  if (!manifest || typeof manifest !== 'object') return ['Manifest fehlt oder ist kein Objekt'];
  if (!manifest.waffen || typeof manifest.waffen !== 'object') return ['Manifest ohne waffen-Abbildung'];
  if (manifest.version !== 2) fehler.push(`Manifestversion ${manifest.version} statt 2`);
  if (typeof manifest.status !== 'string' || !manifest.status) fehler.push('Manifest ohne status');
  if (!manifest.freigabe || typeof manifest.freigabe.produktpfad !== 'boolean') {
    fehler.push('Manifest ohne freigabe.produktpfad (boolean)');
  }
  if (!manifest.rollen || typeof manifest.rollen !== 'object') fehler.push('Manifest ohne rollen');

  const ids = Object.keys(manifest.waffen);
  if (ids.length === 0) fehler.push('Manifest ohne Blätter');

  for (const id of ids) {
    const e = manifest.waffen[id];
    if (!e || typeof e !== 'object') { fehler.push(`${id}: kein Eintrag`); continue; }
    if (e.id !== id) fehler.push(`${id}: id-Feld ${JSON.stringify(e.id)} passt nicht zum Schlüssel`);
    if (typeof e.datei !== 'string' || !e.datei) fehler.push(`${id}: datei fehlt`);
    if (!ANIM_ROLLEN_NAMEN.includes(e.rolle)) fehler.push(`${id}: unbekannte Rolle ${JSON.stringify(e.rolle)}`);
    if (typeof e.freigabe !== 'boolean') fehler.push(`${id}: freigabe muss boolean sein`);
    if (typeof e.motiv !== 'string' || !e.motiv) fehler.push(`${id}: motiv fehlt`);
    if (typeof e.befund !== 'string' || !e.befund) fehler.push(`${id}: befund fehlt`);
    if (!ANIM_SCHWEREN.includes(e.schwere)) fehler.push(`${id}: unbekannter Schweregrad ${JSON.stringify(e.schwere)}`);
    if (e.abnahme !== 'offen' && e.abnahme !== 'abgenommen') fehler.push(`${id}: abnahme muss offen|abgenommen sein`);
    if (e.freigabe === true && !freigabe.has(id)) fehler.push(`${id}: freigabe true, aber nicht in ANIM_FREIGABE`);
    if (e.freigabe === false && freigabe.has(id)) fehler.push(`${id}: in ANIM_FREIGABE, aber im Manifest gesperrt`);
    if (e.freigabe === true && e.abnahme !== 'abgenommen') fehler.push(`${id}: freigegeben ohne Abnahme`);
  }
  if (manifest.freigabe?.produktpfad === true && freigabe.size === 0) {
    fehler.push('freigabe.produktpfad true, aber keine ID in ANIM_FREIGABE');
  }
  if (manifest.status === 'gesperrt' && freigabe.size > 0) {
    fehler.push('status gesperrt, aber ANIM_FREIGABE nicht leer');
  }
  return fehler;
}

/**
 * Darf dieses Blatt geladen werden? Nur bei Manifestfreigabe AND Gate-Eintrag.
 *
 * @param {object|null} eintrag Manifesteintrag eines Blattes
 * @param {Set<string>} [freigabe]
 * @returns {boolean}
 */
export function animBlattFreigegeben(eintrag, freigabe = ANIM_FREIGABE) {
  return Boolean(eintrag && eintrag.freigabe === true && freigabe.has(eintrag.id) && eintrag.abnahme === 'abgenommen');
}

/**
 * Erzeugt einen Lader, der die Sperre einhält.
 *
 * Solange eine ID nicht in `freigabe` steht, wird `ladeManifest` nicht einmal
 * aufgerufen — das Manifest ist also kein Nebenpfad, über den die Blätter
 * versehentlich in ein Bundle oder einen Netzabruf geraten. Der Lader ist
 * bewusst nicht mit dem Produkt verdrahtet; `holeZusatzAnim` bleibt der
 * gesperrte Einstiegspunkt.
 *
 * @param {object} [abh]
 * @param {() => Promise<object>} [abh.ladeManifest] Manifestquelle (erst nach Freigabe nötig)
 * @param {Set<string>} [abh.freigabe]
 */
export function erzeugeAnimLader(abh = {}) {
  const freigabe = abh.freigabe ?? ANIM_FREIGABE;
  const blaetter = new Map();
  const stat = { manifestLadungen: 0, anfragen: 0, gesperrt: 0 };
  let manifest = null;

  return {
    /**
     * Blattdaten oder `null`. `null` ist der Normalfall: gesperrt, noch nicht
     * geladen oder Lader nicht verdrahtet.
     *
     * @param {string} id
     */
    hole(id) {
      stat.anfragen += 1;
      if (typeof id !== 'string' || !freigabe.has(id)) { stat.gesperrt += 1; return null; }
      if (blaetter.has(id)) return blaetter.get(id);
      if (typeof abh.ladeManifest !== 'function') { blaetter.set(id, null); return null; }
      if (manifest === null) {
        manifest = 'laedt';
        stat.manifestLadungen += 1;
        abh.ladeManifest().then(
          (m) => { manifest = m && typeof m === 'object' ? m : null; },
          () => { manifest = null; },
        );
      }
      return null;
    },

    /** Diagnose für Tests und die Debug-Schnittstelle. */
    zustand() {
      return {
        status: ANIM_STATUS,
        freigegeben: [...freigabe],
        manifest: typeof manifest === 'object' && manifest !== null ? 'bereit' : manifest,
        ...stat,
      };
    },
  };
}

const animLader = erzeugeAnimLader();

/**
 * Der gesperrte Produkt-Einstiegspunkt: liefert immer `null`, solange kein
 * Blatt abgenommen ist. Der Renderer zeichnet deshalb weiter Atlas-Zelle und
 * prozedurale Bewegung.
 *
 * @param {string} _id
 * @returns {null}
 */
export function holeZusatzAnim(_id) {
  return animLader.hole(_id);
}

/** Zustand der Animationssperre (Diagnose). */
export function waffenAnimZustand() {
  return animLader.zustand();
}
