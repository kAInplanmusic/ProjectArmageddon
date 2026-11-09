/**
 * Rollen, Sperre und Abnahme der Waffen-Zusatzanimationen (W05/W06/W11/W17).
 *
 * `src/client/assets/weapon-sprites/anim/` enthält 26 WebP-Blätter (8 Frames,
 * 4x2, Zelle 256). Sie sind Material, kein Produktionsbestand: mehrere zeigen
 * fremde Tiere oder Humanoide, zwei sind bytegleich, einige tragen eingebrannte
 * Effekte. Deshalb gibt es hier absichtlich KEINEN Bildimport und keinen
 * Standardlader. Der Produktpfad lädt die Blätter nicht, und ein Blatt wird nur
 * geladen, wenn vier Dinge zusammenkommen:
 *
 * 1. `pruefung` belegt alle sechs Datenkriterien (Frames, Alpha, Identität,
 *    Richtung, Bewegung, Rolle) und beide Produktkriterien (Effekt, Browser),
 * 2. `freigabe` steht im Manifest des Blattes auf `true`,
 * 3. die ID steht in `ANIM_FREIGABE`,
 * 4. ein Lader ist im Renderer verdrahtet (`erzeugeAnimLader`).
 *
 * Fehlt einer der Teile, bleibt es beim bisherigen Verhalten (Atlas-Zelle
 * plus prozedurale Bewegung). `tests/waffen-anim-gating.test.js` und
 * `tests/waffen-anim-abnahme.test.js` prüfen genau diese Sperre, damit ein
 * Blatt nicht versehentlich im Produkt landet. Die Abnahme je Blatt steht in
 * `docs/waffen-audit-2026-11-08/ANIM-ABNAHME.md`.
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
 * Ausdrücklich produktfreigegebene Blätter. Leer, bis alle acht Prüfkriterien
 * (sechs Datenkriterien plus Effekttrennung und Browserabnahme) bestanden sind.
 * Diese Liste ist die zweite, bewusst kleine Schranke vor dem Manifestwert
 * `freigabe`.
 */
export const ANIM_FREIGABE = new Set();

/** Zulässige Schweregrade eines Befunds; `fremd` ist die härteste Stufe. */
export const ANIM_SCHWEREN = ['fremd', 'identitaet', 'statisch', 'nah'];

/** Abnahmestufen. Nur `abgenommen` öffnet den Produktpfad. */
export const ANIM_ABNAHME_STUFEN = ['offen', 'abgelehnt', 'datenabgenommen', 'abgenommen'];

/** Datenkriterien je Blatt (BAL-10): Bild, Alpha, Motiv, Richtung, Bewegung, Rolle. */
export const ANIM_KRITERIEN = ['frames', 'alpha', 'identitaet', 'richtung', 'bewegung', 'rolle'];

/** Zusätzliche Produktkriterien: Effekttrennung (W17) und Browserabnahme (W20). */
export const ANIM_PRODUKT_KRITERIEN = ['effekt', 'browser'];

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
 * Prüft die Abnahme eines einzelnen Blattes (BAL-10).
 *
 * Die sechs Datenkriterien (`ANIM_KRITERIEN`) entscheiden über
 * `datenabgenommen`; erst die zwei Produktkriterien (`effekt`, `browser`)
 * erlauben `abgenommen`. `sperrgruende` muss exakt die fehlgeschlagenen
 * Kriterien nennen — ein Blatt kann also nicht mit einem pauschalen „ok“
 * freigegeben werden. Gibt Fehler, Daten- und Produktstatus zurück.
 *
 * @param {object|null} eintrag Manifesteintrag eines Blattes
 * @returns {{fehler: string[], datenOk: boolean, produktOk: boolean}}
 */
export function animAbnahmePruefen(eintrag) {
  const fehler = [];
  if (!eintrag || typeof eintrag !== 'object') {
    return { fehler: ['kein Eintrag'], datenOk: false, produktOk: false };
  }
  if (!ANIM_ABNAHME_STUFEN.includes(eintrag.abnahme)) {
    fehler.push(`unbekannte Abnahmestufe ${JSON.stringify(eintrag.abnahme)}`);
  }
  if (eintrag.abnahme === 'offen') {
    if (eintrag.freigabe !== false) fehler.push('offen, aber freigabe nicht false');
    return { fehler, datenOk: false, produktOk: false };
  }

  const p = eintrag.pruefung;
  if (!p || typeof p !== 'object') {
    fehler.push('pruefung fehlt');
    return { fehler, datenOk: false, produktOk: false };
  }
  for (const key of [...ANIM_KRITERIEN, ...ANIM_PRODUKT_KRITERIEN]) {
    if (!p[key] || typeof p[key].ok !== 'boolean') fehler.push(`Kriterium ${key} fehlt oder hat kein ok`);
  }
  const datenOk = ANIM_KRITERIEN.every(k => p[k]?.ok === true);
  const produktOk = datenOk && ANIM_PRODUKT_KRITERIEN.every(k => p[k]?.ok === true);

  const erwartet = [...ANIM_KRITERIEN, ...ANIM_PRODUKT_KRITERIEN]
    .filter(k => p[k]?.ok !== true).sort();
  const gruende = Array.isArray(eintrag.sperrgruende) ? [...eintrag.sperrgruende].sort() : null;
  if (!gruende) fehler.push('sperrgruende fehlen');
  else if (JSON.stringify(gruende) !== JSON.stringify(erwartet)) {
    fehler.push(`sperrgruende ${gruende.join(',')} statt ${erwartet.join(',')}`);
  }

  if (eintrag.abnahme === 'abgelehnt' && datenOk) fehler.push('abgelehnt, aber alle Datenkriterien ok');
  if (eintrag.abnahme === 'datenabgenommen' && !datenOk) fehler.push('datenabgenommen, aber Datenkriterien offen');
  if (eintrag.abnahme === 'datenabgenommen' && produktOk) fehler.push('datenabgenommen, aber Produktkriterien ok');
  if (eintrag.abnahme === 'abgenommen' && !produktOk) fehler.push('abgenommen, aber Produktkriterien offen');
  if (eintrag.abnahme !== 'abgenommen' && eintrag.freigabe === true) {
    fehler.push('freigabe true ohne Stufe abgenommen');
  }
  if (eintrag.abnahme === 'abgenommen' && eintrag.freigabe !== true) {
    fehler.push('abgenommen, aber freigabe nicht true');
  }
  return { fehler, datenOk, produktOk };
}

/**
 * Prüft ein Animationsmanifest gegen die Abnahmeregeln (rein, ohne Dateizugriff).
 *
 * Gibt eine Liste von Fehlern zurück; leer heißt regelkonform. Geprüft werden
 * Pflichtfelder je Blatt, die Rollenzuordnung, der Schweregrad, die vollständige
 * Abnahme je Blatt und der Gleichlauf von Manifestfreigabe und `ANIM_FREIGABE`
 * (fail closed: eine Freigabe im Manifest ohne Eintrag in der Liste ist ein
 * Fehler, nicht erlaubt).
 *
 * @param {object} manifest Inhalt von `assets/weapon-sprites/anim/manifest.json`
 * @param {Set<string>} [freigabe] abgenommene IDs; Standard ist `ANIM_FREIGABE`
 * @returns {string[]} Fehlertexte in deutscher Sprache
 */
export function animFreigabePruefen(manifest, freigabe = ANIM_FREIGABE) {
  const fehler = [];
  if (!manifest || typeof manifest !== 'object') return ['Manifest fehlt oder ist kein Objekt'];
  if (!manifest.waffen || typeof manifest.waffen !== 'object') return ['Manifest ohne waffen-Abbildung'];
  if (manifest.version !== 3) fehler.push(`Manifestversion ${manifest.version} statt 3`);
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
    if (!ANIM_ABNAHME_STUFEN.includes(e.abnahme)) fehler.push(`${id}: abnahme muss ${ANIM_ABNAHME_STUFEN.join('|')} sein`);
    for (const f of animAbnahmePruefen(e).fehler) fehler.push(`${id}: ${f}`);
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
  const abnahme = manifest.abnahme;
  if (!abnahme || typeof abnahme !== 'object') {
    fehler.push('Manifest ohne abnahme-Block');
  } else {
    const zaehlung = { abgenommen: 0, datenabgenommen: 0, abgelehnt: 0 };
    for (const id of ids) {
      const stufe = manifest.waffen[id]?.abnahme;
      if (Object.hasOwn(zaehlung, stufe)) zaehlung[stufe] += 1;
    }
    if (abnahme.ergebnis?.gesamt !== ids.length) {
      fehler.push(`abnahme.ergebnis.gesamt ${abnahme.ergebnis?.gesamt} statt ${ids.length}`);
    }
    for (const [stufe, anzahl] of Object.entries(zaehlung)) {
      if (abnahme.ergebnis?.[stufe] !== anzahl) {
        fehler.push(`abnahme.ergebnis.${stufe} ${abnahme.ergebnis?.[stufe]} statt ${anzahl}`);
      }
    }
    if (typeof abnahme.bericht !== 'string' || !abnahme.bericht) fehler.push('abnahme.bericht fehlt');
    if (typeof abnahme.messung !== 'string' || !abnahme.messung) fehler.push('abnahme.messung fehlt');
  }
  return fehler;
}

/**
 * Darf dieses Blatt geladen werden? Nur bei Manifestfreigabe AND Gate-Eintrag
 * AND vollständig erfüllten Produktkriterien.
 *
 * @param {object|null} eintrag Manifesteintrag eines Blattes
 * @param {Set<string>} [freigabe]
 * @returns {boolean}
 */
export function animBlattFreigegeben(eintrag, freigabe = ANIM_FREIGABE) {
  if (!eintrag || eintrag.freigabe !== true || !freigabe.has(eintrag.id) || eintrag.abnahme !== 'abgenommen') {
    return false;
  }
  return animAbnahmePruefen(eintrag).produktOk;
}

/**
 * Erzeugt einen Lader, der die Sperre einhält.
 *
 * Solange eine ID nicht in `freigabe` steht, wird `ladeManifest` nicht einmal
 * aufgerufen — das Manifest ist also kein Nebenpfad, über den die Blätter
 * versehentlich in ein Bundle oder einen Netzabruf geraten. Zusätzlich kann
 * `abnahme` eine Manifestabbildung mitgeben: Ein Blatt, dessen Abnahme nicht
 * `abgenommen` ist oder dessen Prüfkriterien unvollständig sind, wird auch mit
 * manipulierter Freigabeliste abgewiesen. Der Lader ist bewusst nicht mit dem
 * Produkt verdrahtet; `holeZusatzAnim` bleibt der gesperrte Einstiegspunkt.
 *
 * @param {object} [abh]
 * @param {() => Promise<object>} [abh.ladeManifest] Manifestquelle (erst nach Freigabe nötig)
 * @param {Set<string>} [abh.freigabe]
 * @param {Record<string, object>} [abh.abnahme] Manifesteinträge für die Vorprüfung
 */
export function erzeugeAnimLader(abh = {}) {
  const freigabe = abh.freigabe ?? ANIM_FREIGABE;
  const abnahme = abh.abnahme ?? null;
  const blaetter = new Map();
  const stat = { manifestLadungen: 0, anfragen: 0, gesperrt: 0, abgewiesen: 0 };
  let manifest = null;

  function eintragAus(m, id) {
    if (!m || typeof m !== 'object') return null;
    return m.waffen?.[id] ?? m[id] ?? null;
  }

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
      // Vorprüfung, bevor irgendetwas geladen wird. Ein gesperrtes Blatt kann
      // damit nicht über eine versehentlich gefüllte ANIM_FREIGABE durchrutschen.
      if (abnahme && !animBlattFreigegeben(abnahme[id], freigabe)) {
        stat.abgewiesen += 1;
        return null;
      }
      if (blaetter.has(id)) return blaetter.get(id);
      if (typeof abh.ladeManifest !== 'function') { blaetter.set(id, null); return null; }
      if (manifest === null) {
        manifest = 'laedt';
        stat.manifestLadungen += 1;
        abh.ladeManifest().then(
          (m) => { manifest = m && typeof m === 'object' ? m : null; },
          () => { manifest = null; },
        );
        return null;
      }
      if (manifest === 'laedt') return null;
      const eintrag = eintragAus(manifest, id);
      if (!eintrag || !animBlattFreigegeben(eintrag, freigabe)) {
        stat.abgewiesen += 1;
        blaetter.set(id, null);
        return null;
      }
      blaetter.set(id, eintrag);
      return eintrag;
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
