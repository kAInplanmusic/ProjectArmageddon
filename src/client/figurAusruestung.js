/**
 * Ausrüstung je Figur: was gehört zum Körper, was ist ein eigenes Requisit?
 *
 * Standard (Audit A04): **unbewaffneter Körper + separat verankerte Ausrüstung.**
 * Gehüllte Waffen zeichnet der Renderer als eigenes Sprite an einem Anker
 * (Hand, Lafette, Mündung). Zwei Ausnahmen bleiben ausdrücklich am Körper:
 *
 * - `angeboren`: Krallen, Mäuler, Tentakel, Stacheln, Hornplatten, Flammen.
 *   Sie sind Anatomie und werden bei einer Neuziehung **nicht** entfernt.
 * - `montiert`: fest verschraubte Fahrzeug-/Mech-Teile wie Armkanone, Mörserrohr,
 *   Kettenlauf. Sie sind Teil der Silhouette und werden ebenfalls nicht entfernt.
 *
 * Nur `montiert` mit `waffe: true` unterdrückt zusätzlich das separate Waffen-
 * sprite: bei diesen Figuren *ist* das Körperteil die abgefeuerte Waffe, ein
 * zweites Rohr an der Hand wäre eine sichtbare Doppelung. Angeborene Krallen
 * unterdrücken dagegen nichts — eine Kreatur kann zusätzlich ein Requisit tragen;
 * die Kralle bleibt trotzdem Körper.
 *
 * Die Tabelle ist eine geprüfte Auswahl, kein Vollständigkeitsanspruch: der
 * Standard ist `getrennt`, alles Ungeprüfte bleibt dort und wird bewusst nicht
 * stillschweigend als Körperteil ausgegeben.
 *
 * @module figurAusruestung
 */

/** Art der Ausrüstung. */
export const AUSRUESTUNG_ART = Object.freeze({
  GETRENNT: 'getrennt',
  ANGEBOREN: 'angeboren',
  MONTIERT: 'montiert',
});

/** Anker, an denen Requisiten sitzen können. `vorhanden: false` = Renderer-Anker fehlt noch. */
export const ANKER = Object.freeze({
  hand: Object.freeze({ vorhanden: true, was: 'Griffpunkt der gehaltenen Waffe', quelle: 'figurTypen.handAnteil/handVor, waffenAnimation.figurHand' }),
  halterung: Object.freeze({ vorhanden: true, was: 'Lafette/Aufbau statt Hand (Fahrzeug)', quelle: 'figurTypen.handAufbau, figuren.zeichneArm' }),
  muendung: Object.freeze({ vorhanden: true, was: 'Mündung des Waffen-Sprites (je Waffe, nicht je Figur)', quelle: 'weapon-sprites/manifest.json mx/my' }),
  ruecken: Object.freeze({ vorhanden: false, was: 'Rücken: Schild, Köcher, Rucksack, Flügeldecke' }),
  maul: Object.freeze({ vorhanden: false, was: 'Maul/Schlund: Atem, Biss, Säurestrahl' }),
  schwebe: Object.freeze({ vorhanden: false, was: 'Schwebepunkt: Drohne, Schwarm, Orb ohne Hand' }),
});

/** Standard für alle nicht ausdrücklich geprüften Figuren. */
const GETRENNT = Object.freeze({
  art: AUSRUESTUNG_ART.GETRENNT,
  was: 'gehaltene Waffe',
  anker: 'hand',
  waffe: false,
  beleg: 'Standard: unbewaffneter Körper, Waffe als eigenes Sprite am Handanker.',
});

/**
 * Geprüfte Körper-Ausrüstung. `waffe: true` heißt: dieses Körperteil ist die
 * benutzte Waffe, ein zusätzliches Waffen-Sprite entfällt. `anker` nennt den
 * Anker, an dem ein *künftiges* separates Requisit derselben Figur sitzen müsste.
 */
const KOERPER_AUSRUESTUNG = Object.freeze({
  // --- fest montierte Fahrzeug-/Mech-Teile ---------------------------------
  'hydra-titan-mech': Object.freeze({
    art: AUSRUESTUNG_ART.MONTIERT, was: 'Armkanone', anker: 'halterung', waffe: true,
    beleg: 'DesignRest Machina 08.11.2026: Armkanone in allen Frames konsistent, fest montiertes Mech-Teil.',
  }),
  'heavy-battery-moerser-bot': Object.freeze({
    art: AUSRUESTUNG_ART.MONTIERT, was: 'Mörserrohr auf Kettenfahrwerk', anker: 'halterung', waffe: true,
    beleg: 'Audit A06: Kettengetriebene Mörserplattform; Rohrneigung gehört zum Fahrzeugkörper.',
  }),
  'nullpointer-exception-cult': Object.freeze({
    art: AUSRUESTUNG_ART.MONTIERT, was: 'Kanonenarm', anker: 'halterung', waffe: true,
    beleg: 'Audit Einzelprüfung: Signaturwaffe Kanonenarm — ein zum Werfer umgebauter Arm.',
  }),
  'iron-hook-harry': Object.freeze({
    art: AUSRUESTUNG_ART.MONTIERT, was: 'Hakenprothese statt Hand', anker: 'hand', waffe: false,
    beleg: 'Audit: Arm durch eine Kette ersetzt, mit der er Schlösser knackt — Werkzeug, keine abgefeuerte Waffe.',
  }),

  // --- angeborene Körperwaffen --------------------------------------------
  'stalker-predax': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Unterarmklingen', anker: 'hand', waffe: false,
    beleg: 'Audit: schlanker Stachel-Jäger mit Doppelklingen; Identität „twin biological forearm blades“.',
  }),
  'vortex-grabber': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Greiftentakel', anker: 'hand', waffe: false,
    beleg: 'Audit: massiger Tentakelkämpfer, beide Greifarme in jedem Frame erhalten.',
  }),
  'sgt-acid-xeno': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Säurespitzen und Chitinpanzer', anker: 'hand', waffe: false,
    beleg: 'Audit: Säurespitzen sind Anatomie; die Säureklinge der Geschichte ist getrennt.',
  }),
  'flame-jaws': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Flammschlund und Krallen', anker: 'maul', waffe: false,
    beleg: 'Audit: Bestienkörper; das Maul ist die Waffe der Geschichte, keine gehaltene Klinge.',
  }),
  'plasma-maw-zorg': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Plasmamaul', anker: 'maul', waffe: false,
    beleg: 'Audit: Maul-/Schlundwaffe der Säurebrut; bleibt Anatomie.',
  }),
  'sonic-blossom': Object.freeze({
    art: AUSRUESTUNG_ART.ANGEBOREN, was: 'Blütenkörper und Ranken', anker: 'schwebe', waffe: false,
    beleg: 'Audit: Blütenwesen ohne Handwaffe; Ausrüstung müsste an einem Schwebepunkt sitzen.',
  }),

  // --- getrennt, aber nicht am Handanker -----------------------------------
  'quantum-qubit-knight': Object.freeze({
    art: AUSRUESTUNG_ART.GETRENNT, was: 'Schild am Rücken, Energieklinge in der Hand', anker: 'ruecken', waffe: false,
    beleg: 'Audit: Helm, Schild und Schwert getrennt, aber dauerhaft erhalten — der Schild braucht einen Rückenanker.',
  }),
});

/**
 * Ausrüstungsregel einer Figur. Unbekannte IDs bekommen bewusst den Standard
 * `getrennt` — keine stillschweigende Einstufung als Körperteil.
 *
 * @param {string|null|undefined} charakterId
 * @returns {{art:string, was:string, anker:string, waffe:boolean, beleg:string}}
 */
export function ausruestungFuer(charakterId) {
  return KOERPER_AUSRUESTUNG[charakterId] ?? GETRENNT;
}

/** Trägt der Körper diese Ausrüstung (angeboren oder montiert)? */
export function ausruestungAmKoerper(charakterId) {
  return ausruestungFuer(charakterId).art !== AUSRUESTUNG_ART.GETRENNT;
}

/**
 * Darf für diese Figur **kein** zusätzliches Waffen-Sprite gezeichnet werden?
 * Nur bei montierten Körperwaffen, sonst bliebe die Figur ohne sichtbare Waffe.
 */
export function waffeAmKoerper(charakterId) {
  const a = ausruestungFuer(charakterId);
  return a.art === AUSRUESTUNG_ART.MONTIERT && a.waffe === true;
}

/** Fehlt für diese Ausrüstung noch ein Renderer-Anker? */
export function ankerFehlt(charakterId) {
  return ANKER[ausruestungFuer(charakterId).anker]?.vorhanden === false;
}
