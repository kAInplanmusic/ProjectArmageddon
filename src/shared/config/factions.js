/**
 * Fraktionen und Charaktere.
 *
 * Neun Fraktionen zu je neun Charakteren — 81 insgesamt. Die Bögen liefern Bild,
 * Name und Zeile (Klasse); alles Übrige steht hier.
 *
 * Aufbau je Fraktion: drei Zeilen zu drei Charakteren. Die Zeile bestimmt die
 * Kampfweise, und zwar nach dem Symbol auf dem Bogen:
 *   Zeile 0 (Schwert) -> Nahkampf
 *   Zeile 1 (Bogen)   -> Fernkampf
 *   Zeile 2 (Stab)    -> Magie
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) ist die Zeile
 * zugleich die SPIELKLASSE (`classOf`): `melee` → `nahkampf`, `ranged` →
 * `fernkampf`, `magic` → `okkultist`. Der Platz innerhalb der Zeile (0..2)
 * wählt den konkreten Bogen (`charakterFuer(fraktion, klasse, platz)`).
 *
 * Die alte Spaltenzuordnung (`SLOT_CLASSES`: heavy/scout/artillery) bleibt nur
 * für die Darstellung von Replays der Fassungen ≤ 2 erhalten (`slotClassOf`).
 *
 * Die Bilder liegen unter src/client/assets/characters/<fraktion>/ und wurden mit
 * scripts/extract_factions.py aus den Bögen geschnitten.
 *
 * @module factions
 */

import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from './player.js';

/** Die drei Kampfweisen (Zeilen der Bögen). */
export const COMBAT_ROLES = Object.freeze({
  melee: Object.freeze({ id: 'melee', label: 'Nahkampf', row: 0, archetype: 'brawler', symbol: 'Schwert' }),
  ranged: Object.freeze({ id: 'ranged', label: 'Fernkampf', row: 1, archetype: 'artillerist', symbol: 'Bogen' }),
  magic: Object.freeze({ id: 'magic', label: 'Magie', row: 2, archetype: 'occultist', symbol: 'Stab' }),
});

/** Spielklassen nach Platz innerhalb einer Zeile — nur noch für Fassungen ≤ 2. */
export const SLOT_CLASSES = Object.freeze(['heavy', 'scout', 'artillery']);

/**
 * Die drei Klassen der Fassung 3, abgeleitet aus der Zeile des Bogens.
 *
 * Das ist die Vorgabe aus `docs/anforderungen-2026-11-05.md` §6: `melee` →
 * `nahkampf`, `ranged` → `fernkampf`, `magic` → `okkultist`. Je Fraktion stehen
 * damit genau drei Einheiten je Klasse (die drei Plätze der Zeile).
 */
export const ROLE_CLASSES = Object.freeze({
  melee: 'nahkampf',
  ranged: 'fernkampf',
  magic: 'okkultist',
});

/**
 * Morphologie: der Körperbau einer Figur (A01/A02 des Fraktions-Audits).
 *
 * Acht Baupläne, mehr nicht: Jede der 81 Figuren gehört zu genau einem. Der
 * Bauplan ist keine Animationsvorliebe, sondern eine Identitätsregel — er sagt,
 * welche Silhouette in JEDEM freigegebenen Frame erhalten bleiben muss und
 * welche Bewegung überhaupt zulässig ist.
 *
 * `beine` ist die verbindliche Beingliederung, `bewegung` der passende
 * Bewegungstyp, `gehzyklus` die Freigabe für den 8-Frame-Beinenzyklus der
 * Sprite-Sheets (`sprite-sheets/<figur>__walk.webp`).
 *
 * `gehzyklus: false` heißt nicht „kaputt", sondern „nicht belegt": Die
 * Gehblätter wurden aus den Seitenansichten erzeugt und zeigen bei Fahrzeugen,
 * Schlangen, Schwebewesen, Viert- und Vielbeinern regelmäßig ein humanoides
 * Beinpaar (Audit A01: „niemals Beine an Kettenfahrzeugen", „niemals
 * Zweibeiner statt Vierbeiner"). Für diese Baupläne gilt bis zu einer
 * Sichtprüfung die prozedurale Bewegung aus `figurAnimation.js`; ein Blatt darf
 * nur mit ausdrücklicher Freigabe (`identitaet.rollen.walk` im Manifest)
 * genutzt werden. Die Freigabe setzt `figurSheets.freigabeFuer` durch.
 */
export const MORPHOLOGIEN = Object.freeze({
  biped: Object.freeze({
    id: 'biped', label: 'Zweibeiner', beine: 2, bewegung: 'gehen', gehzyklus: true,
    verboten: Object.freeze([]),
  }),
  quadruped: Object.freeze({
    id: 'quadruped', label: 'Vierbeiner', beine: 4, bewegung: 'laufen', gehzyklus: false,
    verboten: Object.freeze(['aufrechter Zweibeinergang', 'menschlicher Todeskörper']),
  }),
  tracked: Object.freeze({
    id: 'tracked', label: 'Kettenfahrzeug', beine: 0, bewegung: 'ketten', gehzyklus: false,
    verboten: Object.freeze(['Beine', 'Gehzyklus mit Beinpaaren', 'Hockpose mit menschlichen Knien']),
  }),
  serpentine: Object.freeze({
    id: 'serpentine', label: 'Schlange', beine: 0, bewegung: 'schlingen', gehzyklus: false,
    verboten: Object.freeze(['Beine', 'aufrechter Gang', 'menschlicher Todeskörper']),
  }),
  hover: Object.freeze({
    id: 'hover', label: 'Schwebewesen', beine: 0, bewegung: 'schweben', gehzyklus: false,
    verboten: Object.freeze(['Beine', 'Bodenkontakt mit Füßen', 'menschlicher Todeskörper']),
  }),
  avian: Object.freeze({
    id: 'avian', label: 'Vogel', beine: 2, bewegung: 'fliegen', gehzyklus: false,
    verboten: Object.freeze(['menschlicher Gang', 'fehlender Flügelkranz']),
  }),
  arachnid: Object.freeze({
    id: 'arachnid', label: 'Spinne', beine: 8, bewegung: 'krabbeln', gehzyklus: false,
    verboten: Object.freeze(['menschliches Beinpaar', 'abweichende Beinzahl']),
  }),
  swarm: Object.freeze({
    id: 'swarm', label: 'Schwarm', beine: 0, bewegung: 'wuseln', gehzyklus: false,
    verboten: Object.freeze(['Einzelkörper', 'Beine', 'einzelnes großes Insekt']),
  }),
});

/**
 * Trennlinie zwischen Geschichte und Spielmechanik (Audit A08).
 *
 * Die Texte je Figur stammen aus einer Fassung mit individuellen Rollen. Im
 * Match wirken aber ausschließlich das Klassenprofil (`classes.js`), die
 * gewählte Ausrüstung und die Sidegrades. Individuelle Fähigkeiten — Tarnen,
 * Heranziehen, Schwarmsehen und was die Biografien sonst erzählen — sind NICHT
 * simuliert. Dieser Satz steht deshalb als eine Quelle hier und wird in der
 * Anzeige verwendet, statt an jeder Stelle neu formuliert zu werden.
 */
export const CHARAKTER_PROFIL_HINWEIS = 'Biografie, Signaturwaffe, Stärken und Schwächen '
  + 'erzählen die Geschichte der Figur. Im Match wirken ausschließlich ihre Klasse '
  + '(Leben, Schaden, Bewegung) und die gewählte Ausrüstung. Individuelle Fähigkeiten '
  + 'aus diesen Texten sind nicht simuliert.';

/**
 * Redaktionell geänderte Anzeigenamen (Audit A07/A13).
 *
 * Kennung und Bilddatei bleiben stabil — nur der Anzeigename weicht ab. Der
 * Eintrag hält fest, wie die Figur vorher hieß, damit Replays, Notizen und
 * Bilddateien weiter zuordenbar sind. Der Test `figuren-redaktion` verlangt den
 * Eintrag für jeden Namen, der nicht mehr zum Dateistamm passt.
 */
export const UMBENANNT = Object.freeze({
  'nullpointer-exception': Object.freeze({
    vorher: 'Nullpointer Exception',
    grund: 'Doppelname mit dem Datenkult-Roboter; der Kultname bleibt fachlich passend',
  }),
  'pyrofox-a': Object.freeze({ vorher: 'Pyrofox (Unit A)', grund: 'Arbeitsname „Unit A“' }),
  'pyrofox-b': Object.freeze({ vorher: 'Pyrofox (Unit B)', grund: 'Arbeitsname „Unit B“' }),
  'arcershorn-a': Object.freeze({ vorher: 'Arcershorn (Unit A)', grund: 'Arbeitsname „Unit A“' }),
  'pyrowand-a': Object.freeze({ vorher: 'Pyrowand (Unit A)', grund: 'Arbeitsname „Unit A“' }),
  shieldmon: Object.freeze({ vorher: 'Shieldmon', grund: 'Kunstname ohne Persönlichkeit' }),
  'arcanus-a': Object.freeze({ vorher: 'Arcanus (Unit A)', grund: 'Arbeitsname „Unit A“' }),
  'arcanus-b': Object.freeze({ vorher: 'Arcanus (Unit B)', grund: 'Arbeitsname „Unit B“' }),
  pikamon: Object.freeze({ vorher: 'Pikamon', grund: 'Anlehnung an eine fremde Marke' }),
  'berzerker-fang': Object.freeze({ vorher: 'Berzerker Fang', grund: 'Schreibfehler im Bogennamen' }),
  'vanguard-captain-rix': Object.freeze({
    vorher: 'Vanguard Captain Rix',
    grund: 'Doppelter Rang im Namen (Vanguard + Captain)',
  }),
  'volley-captain-spark': Object.freeze({
    vorher: 'Volley Captain Spark',
    grund: 'Doppelter Rang im Namen (Volley + Captain)',
  }),
  'ninjutsu-master-goemon': Object.freeze({
    vorher: 'Ninjutsu Master Goemon',
    grund: 'Titel und Rang nebeneinander; „Meister“ stand nur im Rangwort',
  }),
});

/**
 * Das Gesicht bestimmt, welche Identitätsregeln zusätzlich gelten.
 *
 * Nur `menschlich` erlaubt ein Menschengesicht und einen menschlichen Leichnam.
 * Alle anderen Arten schließen beides aus — das ist die Kernregel aus A01
 * („niemals Menschengesichter bei Aliens/Robotern").
 */
export const GESICHTER = Object.freeze({
  menschlich: Object.freeze({ id: 'menschlich', label: 'Mensch', menschlich: true }),
  tier: Object.freeze({ id: 'tier', label: 'Tiergesicht', menschlich: false }),
  alien: Object.freeze({ id: 'alien', label: 'Alienkopf', menschlich: false }),
  roboter: Object.freeze({ id: 'roboter', label: 'Maschinenschädel', menschlich: false }),
  skelett: Object.freeze({ id: 'skelett', label: 'Schädel', menschlich: false }),
  untot: Object.freeze({ id: 'untot', label: 'Untotenkopf', menschlich: false }),
  geist: Object.freeze({ id: 'geist', label: 'Geisterkopf', menschlich: false }),
  maske: Object.freeze({ id: 'maske', label: 'Maske', menschlich: false }),
  verhuellt: Object.freeze({ id: 'verhuellt', label: 'verhüllt', menschlich: false }),
  oni: Object.freeze({ id: 'oni', label: 'Onikopf', menschlich: false }),
  wesen: Object.freeze({ id: 'wesen', label: 'Wesen', menschlich: false }),
  pflanze: Object.freeze({ id: 'pflanze', label: 'Pflanzenwesen', menschlich: false }),
  schwarm: Object.freeze({ id: 'schwarm', label: 'Schwarm', menschlich: false }),
  fahrzeug: Object.freeze({ id: 'fahrzeug', label: 'Fahrzeug', menschlich: false }),
});

/**
 * Der eine Kollisionsanker für alle 81 Figuren (A10).
 *
 * Kollisionsform und Fußpunkt sind Spielregel, nicht Optik: Der Körper ist
 * 14 × 20 px, die Position ist die Fußposition, und der Fußpunkt im Sprite
 * liegt bei 96 % der Spritehöhe. Vierbeiner, Fahrzeuge und Schweber werden an
 * GENAU diese Werte gebunden — kein Manifestanker, keine Morphologie und keine
 * Bilddatei darf daran etwas ändern oder eine größere Trefferfläche
 * vortäuschen. Die Zahlen kommen aus `player.js`, damit Motor, Trefferprüfung
 * und Darstellung nicht auseinanderlaufen.
 */
export const KOLLISIONSANKER = Object.freeze({
  fussY: 0.96,
  halbBreite: PLAYER_HALF_WIDTH,
  halbHoehe: PLAYER_HALF_HEIGHT,
  fussAbstand: PLAYER_HALF_HEIGHT,
});

/** Der Bauplan einer Figur (Vierbeiner, Kettenfahrzeug, Schweber …). */
export function morphologieOf(character) {
  return MORPHOLOGIEN[character?.morphologie] ?? MORPHOLOGIEN.biped;
}

/**
 * Die vollständigen Identitätsregeln einer Figur: Bauplan, Bewegungstyp,
 * Gesicht, gesperrte Frames und die Liste dessen, was in keinem freigegebenen
 * Frame vorkommen darf. Reine Daten, damit Manifestprüfung, Tests und
 * Bildabnahme dieselbe Quelle lesen.
 *
 * `gesperrteZellen` ist die Figurenebene der Freigabe: Hier stehen Frames, die
 * laut Bildprüfung nachweislich die falsche Identität zeigen (Audit-Befund).
 * Sie gelten sofort, auch bevor das Manifest die Prüfung übernimmt.
 *
 * @returns {{morphologie: object, gesicht: object, bewegung: string, beine: number,
 *   gehzyklus: boolean, merkmale: string[], gesperrteZellen: number[], verboten: string[]}}
 */
export function identitaetsRegeln(character) {
  const morphologie = morphologieOf(character);
  const gesicht = GESICHTER[character?.identitaet?.gesicht] ?? GESICHTER.menschlich;
  const verboten = [...morphologie.verboten];
  if (!gesicht.menschlich) {
    verboten.push('menschliches Gesicht', 'menschlicher Leichnam');
  }
  return {
    morphologie,
    gesicht,
    bewegung: morphologie.bewegung,
    beine: morphologie.beine,
    gehzyklus: morphologie.gehzyklus,
    merkmale: [...(character?.identitaet?.merkmale ?? [])],
    gesperrteZellen: [...(character?.identitaet?.gesperrteZellen ?? [])],
    verboten,
  };
}

/**
 * Die neun Fraktionen.
 *
 * `palette` beschreibt die Grundfarben der Bögen — sie stammen aus den Bildern
 * und dienen der Anzeige.
 */
export const FACTIONS = Object.freeze([
  {
    id: 'xeno',
    name: 'Die Säurebrut',
    short: 'Xeno-Schwarm',
    motto: 'Was wir berühren, löst sich auf.',
    description:
      'Ein Schwarm aus einer Welt, deren Atmosphäre ätzend ist. Die Säurebrut kennt keine Heimat '
      + 'im üblichen Sinn: Sie nistet in dem, was sie zerlegt hat. Ihre Körper sind an ihre eigene '
      + 'Umgebung angepasst, was sie für gewöhnliche Waffen schwer greifbar macht.',
    palette: ['#6b2d8f', '#c026d3', '#4ade80'],
    spriteDir: 'xeno',
  },
  {
    id: 'rodentia',
    name: 'Zahnrad-Garde',
    short: 'Rodentia',
    motto: 'Klein, zahlreich, unaufhaltsam.',
    description:
      'Ein Volk von Nagern, das den Sprung von der Höhle zur Dampfmaschine in einer Generation '
      + 'geschafft hat. Die Zahnrad-Garde kämpft mit Werkzeug, das für den Bergbau gebaut wurde — '
      + 'und deshalb mehr aushält als jede Waffe, die nur für den Krieg gedacht war.',
    palette: ['#b91c1c', '#d4d4d8', '#8b5a2b'],
    spriteDir: 'rodentia',
  },
  {
    id: 'pirates',
    name: 'Goldküsten-Korsaren',
    short: 'Korsaren',
    motto: 'Wer den Hafen hält, hält die See.',
    description:
      'Keine Nation, sondern ein Abkommen: Wer an der Goldküste anlegt, teilt seinen Fund. Die '
      + 'Korsaren fahren schwarze Segel und vergoldete Kanonen — Prahlerei, die sich bezahlt macht, '
      + 'weil Abschreckung billiger ist als ein Gefecht.',
    palette: ['#111111', '#d4af37', '#6b5b3e'],
    spriteDir: 'pirates',
  },
  {
    id: 'machina',
    name: 'Stahl-Protokoll',
    short: 'Machina',
    motto: 'Der Befehl läuft. Der Befehl trifft.',
    description:
      'Eine Armee, die ihre eigenen Entscheidungen nicht mehr trifft: Jede Einheit ist ein '
      + 'ausführender Knoten eines übergeordneten Plans. Was dem Protokoll an Einfallsreichtum '
      + 'fehlt, macht es durch Genauigkeit und Ausdauer wett.',
    palette: ['#1e293b', '#22d3ee', '#94a3b8'],
    spriteDir: 'machina',
  },
  {
    id: 'undead',
    name: 'Giftgrüne Legion',
    short: 'Legion',
    motto: 'Der Krieg endet nicht mit dem Tod.',
    description:
      'Gefallene, die weitermachen. Die Legion rekrutiert aus jedem Feldzug, den sie geführt hat, '
      + 'und wächst damit mit jeder Niederlage. Ihre Reihen sind nicht tapfer, aber sie sind geduldig '
      + '— Zeit ist das einzige Gut, von dem sie mehr haben als jeder Gegner.',
    palette: ['#14532d', '#4ade80', '#1c1917'],
    spriteDir: 'undead',
  },
  {
    id: 'shinobi',
    name: 'Klingen des Windes',
    short: 'Shinobi',
    motto: 'Man hört uns erst, wenn es zu spät ist.',
    description:
      'Ein Orden, der aus zwei Zeitaltern gleichzeitig lebt: dem der Schwerter und dem der '
      + 'Schaltkreise. Die Klingen des Windes kämpfen im Verborgenen und haben den Ruf, nie eine '
      + 'Schlacht zu beginnen, die sie nicht schon gewonnen hätten.',
    palette: ['#e5e5e5', '#0a0a0a', '#737373'],
    spriteDir: 'shinobi',
  },
  {
    id: 'beasts',
    name: 'Rudel der Urkräfte',
    short: 'Urkräfte',
    motto: 'Wir brauchen keine Waffen. Wir sind welche.',
    description:
      'Keine Armee im Wortsinn, sondern ein Zug von Wesen, die je eine Naturgewalt verkörpern. Sie '
      + 'kennen keine Befehle und keine Reihen, aber sie wissen, wann sie in dieselbe Richtung '
      + 'laufen. Wer sie unterschätzt, kämpft gegen das Wetter.',
    palette: ['#ea580c', '#facc15', '#78350f'],
    spriteDir: 'beasts',
  },
  {
    id: 'pixel',
    name: 'Die Acht-Bit-Brut',
    short: 'Acht-Bit',
    motto: 'Aus jedem Fehler entsteht mehr von uns.',
    description:
      'Wesen aus einer Welt, die nur aus groben Quadraten besteht. Sie kopieren sich selbst, wenn '
      + 'sie Schaden nehmen, und sie haben keine Angst vor dem Ende der Welt — sie haben es schon '
      + 'mehrfach überstanden.',
    palette: ['#16a34a', '#f97316', '#7c3aed'],
    spriteDir: 'pixel',
  },
  {
    id: 'datacult',
    name: 'Der Datenkult',
    short: 'Datenkult',
    motto: 'Alles ist Adresse. Alles ist erreichbar.',
    description:
      'Eine Gemeinschaft, die Begriffe aus der Netzwerkverwaltung als Liturgie verwendet und in '
      + 'ihren Rangfolgen tatsächlich Speicher und Leitungen verwaltet. Der Datenkult kämpft nicht '
      + 'um Land, sondern um Zugang.',
    palette: ['#166534', '#22c55e', '#cbd5e1'],
    spriteDir: 'datacult',
  },
]);

/**
 * Die 81 Charaktere.
 *
 * `role` ist die Zeile des Bogens, `slot` die Spalte (siehe SLOT_CLASSES).
 * `sprite` ist die Datei unter src/client/assets/characters/<fraktion>/.
 *
 * Die Namen stammen von den Bögen (dort in Großbuchstaben gesetzt); hier stehen
 * sie in üblicher Schreibweise. Seit dem Redaktionslauf 2026-11-09 (Audit A07)
 * sind Anzeigename und Arbeitsname getrennt: Kennung und Bilddatei bleiben
 * unverändert, der Anzeigename darf redaktionell abweichen. Welche Figuren
 * betroffen sind und wie sie vorher hießen, steht in `UMBENANNT`.
 */
export const CHARACTERS = Object.freeze([
  // ---------------------------------------------------------------- Säurebrut
  {
    id: 'sgt-acid-xeno', name: 'Sgt. Acid-Xeno', faction: 'xeno', role: 'melee', slot: 0,
    sprite: '00_sgt-acid-xeno.png',
    morphologie: 'biped',
    identitaet: {
      gesicht: 'alien',
      merkmale: ['gepanzerter Panzerkopf', 'Säurespitzen', 'violetter Chitinpanzer', 'säuregrüne Details'],
      // Audit A01: Zellen 6 und 7 des Aktionsblatts zeigen einen menschlichen Mann.
      gesperrteZellen: [6, 7],
    },
    superWeapon: { name: 'Säureklinge', description: 'Die Klinge sondert ein Sekret ab, das Rüstung durchlässt und danach weiterfrisst.' },
    bio: 'Der einzige Unteroffizier der Brut, der eine Dienstvorschrift mitgebracht hat. Er führt sie wörtlich, was in einer Spezies ohne Hierarchie erstaunlich gut funktioniert.',
    strengths: ['Rüstung schützt ihn kaum weniger als seine eigene Haut', 'Hält Treffer aus, die seine Truppe zerlegen würden'],
    weaknesses: ['Langsam — er verlässt sich darauf, dass der Gegner auf ihn zukommt', 'Seine Säure greift auch eigene Ausrüstung an'],
  },
  {
    id: 'stalker-predax', name: 'Stalker Predax', faction: 'xeno', role: 'melee', slot: 1,
    sprite: '01_stalker-predax.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'alien', merkmale: ['schlanker Stachel-Jäger', 'Doppelklingen', 'Alienkopf'] },
    superWeapon: { name: 'Zwillingsklingen', description: 'Zwei kurze Energieklingen, die im Takt summen und dadurch schwer zu orten sind.' },
    bio: 'Predax jagt nicht, um zu töten, sondern um zu sehen, wie der Gegner sich verhält. Wer ihn überlebt, wird beim zweiten Mal anders angegangen.',
    strengths: ['Sehr schnell, auch über unebenes Gelände', 'Verschwindet im Getümmel; die Brut schwört, er sei dann kurz unsichtbar'],
    weaknesses: ['Wenig Leben — ein Volltreffer genügt', 'Nach dem Tarnen dauert es, bis er wieder auftaucht'],
  },
  {
    id: 'vortex-grabber', name: 'Vortex Grabber', faction: 'xeno', role: 'melee', slot: 2,
    sprite: '02_vortex-grabber.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'verhuellt', merkmale: ['massiger Rumpf', 'verhülltes Gesicht', 'zwei Greifarme'] },
    superWeapon: { name: 'Wirbelarme', description: 'Zwei Tentakel, die einen Gegner heranziehen statt ihn wegzustoßen.' },
    bio: 'Die Brut setzt ihn dort ein, wo Deckung das Problem ist. Er holt Gegner aus Stellungen, die sonst unerreichbar wären.',
    strengths: ['Holt Gegner aus der Deckung — so sagt es die Brut', 'Hohe Reichweite für einen Nahkämpfer'],
    weaknesses: ['Hält immer nur ein Ziel im Griff', 'Sehr unbeweglich, während er zieht'],
  },
  {
    id: 'drone-theta', name: 'Drone Theta', faction: 'xeno', role: 'ranged', slot: 0,
    sprite: '10_drone-theta.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'alien', merkmale: ['schwebende Tentakeldrohne', 'Sensorauge', 'keine Beine'] },
    superWeapon: { name: 'Auge des Schwarms', description: 'Ein Projektil, das über dem Feld schwebt und den Einschlag von oben herab führt.' },
    bio: 'Theta ist weniger eine Einheit als ein Sinnesorgan: Was sie sieht, sieht der Schwarm. Ihre Angriffe sind entsprechend präzise und entsprechend gleichförmig.',
    strengths: ['Ihr Blick reicht über Deckungen hinweg', 'Gleichmäßiger, gut vorhersehbarer Schuss'],
    weaknesses: ['Vollständig darauf angewiesen, zu sehen', 'Wenig Leben für eine Fernkampfeinheit'],
  },
  {
    id: 'desintegrator-kael', name: 'Desintegrator Kael', faction: 'xeno', role: 'ranged', slot: 1,
    sprite: '11_desintegrator-kael.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'alien', merkmale: ['Waffenrohr', 'Kopfbogen', 'Tentakel'] },
    superWeapon: { name: 'Auflöser', description: 'Ein Strahl, der Materie nicht sprengt, sondern schrittweise abträgt.' },
    bio: 'Kael bevorzugt Waffen, die keine Explosion hinterlassen: Die Brut braucht den Boden hinterher noch. Er rechnet damit, dass der Gegner nachgibt, bevor das Gelände es tut.',
    strengths: ['Zerstört Deckung zuverlässig und dosiert', 'Trifft sofort, ohne Flugzeit'],
    weaknesses: ['Wenige Schuss im Magazin', 'Gegen bewegliche Ziele unzuverlässig'],
  },
  {
    id: 'plasma-maw-zorg', name: 'Plasma-Maw Zorg', faction: 'xeno', role: 'ranged', slot: 2,
    sprite: '12_plasma-maw-zorg.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'alien', merkmale: ['breiter Schlund', 'Plasmaspeichel', 'massige Schenkel'] },
    superWeapon: { name: 'Plasmamaule', description: 'Ein gebündelter Plasmastrahl von kurzer Dauer und großer Wirkung.' },
    bio: 'Zorg ist das, was die Brut einsetzt, wenn Verhandlungen nicht vorgesehen waren. Er zielt nicht, er öffnet das Maul.',
    strengths: ['Sehr hoher Schaden auf kurze bis mittlere Entfernung', 'Verschiebt Figuren deutlich'],
    weaknesses: ['Sehr kurze Reichweite für einen Fernkämpfer', 'Nach dem Schuss lange wehrlos'],
  },
  {
    id: 'harbinger-zeta', name: 'Harbinger Zeta', faction: 'xeno', role: 'magic', slot: 0,
    sprite: '20_harbinger-zeta.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'alien', merkmale: ['schwebendes Orakel', 'drei Orbitalkugeln', 'kein menschlicher Körper'] },
    superWeapon: { name: 'Drei Kreise', description: 'Drei schwebende Kugeln, die nacheinander ihr Ziel suchen.' },
    bio: 'Zeta spricht nicht und gibt keine Befehle. Die Brut folgt ihr trotzdem, weil sie als Einzige zu wissen scheint, wo die Reise endet.',
    strengths: ['Mehrfache Treffer aus einer Handlung', 'Verteilt Schaden über mehrere Ziele'],
    weaknesses: ['Jede Kugel einzeln schwach', 'Bestraft Fehlschüsse überproportional'],
  },
  {
    id: 'dark-matter-witch', name: 'Dark-Matter Witch', faction: 'xeno', role: 'magic', slot: 1,
    sprite: '21_dark-matter-witch.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'alien', merkmale: ['dunkle Hexensilhouette', 'Karten', 'Spiralstab', 'schwebender Saum'] },
    superWeapon: { name: 'Karten des Nichts', description: 'Schwebende Karten, von denen nur eine trifft — und welches, steht nicht fest.' },
    bio: 'Sie hat nie erklärt, woher die Karten stammen. Wer sie fragt, bekommt eine neue Karte und keine Antwort.',
    strengths: ['Umlenkbar: Ihre Wirkung wechselt je nach Feldlage', 'Schwer vorherzusagen'],
    weaknesses: ['Unzuverlässig — der Ausgang ist nicht planbar', 'Wenig Leben'],
  },
  {
    id: 'null-entity-quark', name: 'Null-Entity Quark', faction: 'xeno', role: 'magic', slot: 2,
    sprite: '22_null-entity-quark.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'alien', merkmale: ['gezackte Leerenentität', 'schwebende Fragmente', 'kein menschlicher Leichnam'] },
    superWeapon: { name: 'Leerstellenkristall', description: 'Ein Kristall, der einen Bereich des Feldes für kurze Zeit aus der Welt entfernt.' },
    bio: 'Quark ist nicht ganz da. Seine Umrisse flackern, und wo er steht, misst das Gelände gelegentlich falsch.',
    strengths: ['Blendet Gelände zeitweise aus, heißt es', 'Lässt Deckung für seine Wirkung keine Rolle spielen'],
    weaknesses: ['Zerbrechlich — ein Treffer genügt meist', 'Wirkung endet unabhängig vom Willen des Trägers'],
  },

  // ------------------------------------------------------------- Zahnrad-Garde
  {
    id: 'commander-chewk', name: 'Commander Chewk', faction: 'rodentia', role: 'melee', slot: 0,
    sprite: '00_commander-chewk.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['Hamsterbacken', 'rote Brustplatten', 'Doppelschaufel'] },
    superWeapon: { name: 'Schaufel der Garde', description: 'Ein Grabewerkzeug, das im Nahkampf erstaunlich gut mithält.' },
    bio: 'Chewk hat den Bergbau organisiert und führt ihn weiter — nur die Richtung hat gewechselt. Er befiehlt in Schichten, rechnet in Ladungen und trägt seine Doppelschaufel selbst im Gefecht.',
    strengths: ['Sehr robust, führt die Reihe persönlich an', 'Gräbt sich durch Gelände, wenn der Weg zu weit ist'],
    weaknesses: ['Langsam, auch in der Entscheidung', 'Keine Fernkampfmöglichkeit'],
  },
  {
    id: 'berzerker-fang', name: 'Berserker Fang', faction: 'rodentia', role: 'melee', slot: 1,
    sprite: '01_berzerker-fang.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['dunkle Berserkerratte', 'zwei Äxte', 'peitschender Schwanz'] },
    superWeapon: { name: 'Rattenklinge', description: 'Eine gezackte Axt, die bei jedem Treffer weiterreißt.' },
    bio: 'Fang hält nichts von Schichten und nichts von Plänen. Die Garde lässt ihn laufen, weil er in der ersten Reihe mehr bewirkt als jede Ordnung.',
    strengths: ['Höchster Nahkampfschaden der Garde', 'Schneller Vorstoß'],
    weaknesses: ['Keine Verteidigung — er nimmt jeden Gegenschlag', 'Verlässt Deckung freiwillig'],
  },
  {
    id: 'vanguard-captain-rix', name: 'Vanguard Rix', faction: 'rodentia', role: 'melee', slot: 2,
    sprite: '02_vanguard-captain-rix.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['gestreifter Nager', 'Zahnrad-Schild', 'roter Teamakzent'] },
    superWeapon: { name: 'Zahnschild', description: 'Ein Turmschild mit eingebautem Getriebe, das Treffer umlenkt.' },
    bio: 'Rix steht dort, wo der Durchbruch droht, und hält ihn. Sein Schild hat eine Zahnradprägung, die zugleich Rangabzeichen und Werkzeugverweis ist.',
    strengths: ['Deckt Verbündete in der Nähe', 'Hält Flächenschaden stand'],
    weaknesses: ['Schwacher eigener Angriff', 'Braucht Verbündete, um zu wirken'],
  },
  {
    id: 'sharpshooter-quill', name: 'Sharpshooter Quill', faction: 'rodentia', role: 'ranged', slot: 0,
    sprite: '10_sharpshooter-quill.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['Zielbrille', 'Armbrust', 'einheitliches Rot'] },
    superWeapon: { name: 'Schwere Armbrust', description: 'Ein Bolzen mit mehrstufigem Antrieb und sehr flacher Flugbahn.' },
    bio: 'Quill baute seine Armbrust selbst und kennt jede Schraube daran. Er zielt langsam, aber er zielt einmal.',
    strengths: ['Sehr hohe Genauigkeit auf große Entfernung', 'Soforttreffer ohne Flugzeitkorrektur'],
    weaknesses: ['Lange Nachladezeit', 'Bewegt sich praktisch nicht'],
  },
  {
    id: 'grenadier-skitter', name: 'Grenadier Skitter', faction: 'rodentia', role: 'ranged', slot: 1,
    sprite: '11_grenadier-skitter.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['Schutzbrille', 'Sprengbeutel', 'runde Bombensilhouette'] },
    superWeapon: { name: 'Zündbombe', description: 'Eine Bombe mit sichtbarem Zünder, die man zählen hört.' },
    bio: 'Skitter zählt beim Werfen laut mit. Die Garde hält das für Angeberei; es hat aber den Vorteil, dass niemand im Weg steht.',
    strengths: ['Flächenschaden mit Vorwarnung', 'Vertreibt Gegner aus Stellungen'],
    weaknesses: ['Zünder verrät die Absicht', 'Gefährdet eigene Truppen'],
  },
  {
    id: 'volley-captain-spark', name: 'Volley Spark', faction: 'rodentia', role: 'ranged', slot: 2,
    sprite: '12_volley-captain-spark.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['kräftiger Nager', 'Gatling', 'Körpermasse'] },
    superWeapon: { name: 'Salvenkanone', description: 'Ein mehrläufiges Rohr, das viele Schüsse kurz hintereinander abgibt.' },
    bio: 'Spark hat die Salve aus dem Bergbau übernommen: Dort sprengt man nicht alles auf einmal, sondern in der richtigen Reihenfolge.',
    strengths: ['Hoher Schaden über mehrere Schüsse', 'Deckt einen Bereich ab'],
    weaknesses: ['Braucht offene Sichtlinie', 'Munition schnell verbraucht'],
  },
  {
    id: 'alchemage-nibble', name: 'Alchemage Nibble', faction: 'rodentia', role: 'magic', slot: 0,
    sprite: '20_alchemage-nibble.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['heller Nager', 'Trankgürtel', 'Flaschen', 'Stab'] },
    superWeapon: { name: 'Fläschchenregal', description: 'Ein Stab mit aufgesetzten Flaschen, deren Inhalt sich beim Wurf entscheidet.' },
    bio: 'Nibble hat nie gelernt, zwischen Chemie und Zauberei zu unterscheiden, und sieht keinen Grund dafür. Was wirkt, wandert in den nächsten Versuch.',
    strengths: ['Vielseitig: Feuer, Säure und Frost stehen bereit', 'Heilt Verbündete nebenbei'],
    weaknesses: ['Unzuverlässige Mischungen', 'Kurze Reichweite'],
  },
  {
    id: 'technomancer-squeak', name: 'Technomancer Squeak', faction: 'rodentia', role: 'magic', slot: 1,
    sprite: '21_technomancer-squeak.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['Rundbrille', 'Energierucksack', 'Stab', 'Schnauzenform'] },
    superWeapon: { name: 'Kristallstab', description: 'Ein Stab, dessen Kopf die Bewegungsenergie des Feldes aufnimmt und zurückgibt.' },
    bio: 'Squeak betreibt Dampftechnik mit Kristallen und nennt das Ergebnis Magie. Die Garde nennt es Fortschritt.',
    strengths: ['Verstärkt eigene Verbündete', 'Hoher Schaden gegen Maschinen'],
    weaknesses: ['Wenig Leben', 'Wirkt schlecht gegen belebte Ziele'],
  },
  {
    id: 'grand-conduit-vex', name: 'Grand Conduit Vex', faction: 'rodentia', role: 'magic', slot: 2,
    sprite: '22_grand-conduit-vex.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['breite Robensilhouette', 'Brustsymbol', 'Stab'] },
    superWeapon: { name: 'Zahnradkern', description: 'Ein großer Kristallkern auf einem Zahnkranz, der Kräfte bündelt.' },
    bio: 'Vex leitet die Energie der Garde. Er hat die Garde davon überzeugt, dass Fortschritt eine Frage der Verteilung ist.',
    strengths: ['Sehr hoher Flächenschaden', 'Stärkt die ganze Reihe'],
    weaknesses: ['Sehr langsam', 'Ein Ausfall trifft die gesamte Aufstellung'],
  },

  // --------------------------------------------------------- Goldküsten-Korsaren
  {
    id: 'captain-sven', name: 'Captain Sven', faction: 'pirates', role: 'melee', slot: 0,
    sprite: '00_captain-sven.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['Bart', 'Kapitänshut', 'Haken', 'Schlüssel'] },
    superWeapon: { name: 'Schlüssel und Säbel', description: 'Sein Säbel kämpft, sein Schlüssel öffnet — auch Kisten, die noch niemand gesehen hat.' },
    bio: 'Sven hält das Abkommen der Goldküste zusammen. Er hat noch nie eine Tonne Gold aus einem Hafen geholt, aber er hat noch nie einen Hafen verlassen, ohne dass jemand ihm folgte.',
    strengths: ['Sehr erfahren, robust und diszipliniert', 'Verbündete kämpfen in seiner Nähe besser'],
    weaknesses: ['Keine Fernkampfmöglichkeit', 'Weigert sich, Vorräte zurückzulassen'],
  },
  {
    id: 'swashbuckler-piet', name: 'Swashbuckler Piet', faction: 'pirates', role: 'melee', slot: 1,
    sprite: '01_swashbuckler-piet.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['schlanke Linie', 'Hut', 'Doppelsäbel'] },
    superWeapon: { name: 'Säbel und Pistole', description: 'Erst Schuss, dann Klinge — in dieser Reihenfolge, immer.' },
    bio: 'Piet ist der Meinung, dass ein Kampf ein Handwerk ist und ein schlecht ausgeführter Kampf eine Beleidigung. Er übt auf Deck, auch wenn niemand zusieht.',
    strengths: ['Schnell und wendig', 'Wechselt zwischen Schuss und Klinge — erst Pistole, dann Säbel'],
    weaknesses: ['Mittelmäßig in beidem', 'Wenig Leben'],
  },
  {
    id: 'iron-hook-harry', name: 'Iron-Hook Harry', faction: 'pirates', role: 'melee', slot: 2,
    sprite: '02_iron-hook-harry.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['breite Massesilhouette', 'goldener Haken'] },
    superWeapon: { name: 'Enterhaken', description: 'Ein vergoldeter Haken an langer Kette, der auch Deckung greift.' },
    bio: 'Harry verlor den Arm an eine Kanonenkette und ersetzte ihn durch etwas, womit er Kettenschlösser knackt. Er sieht darin eine faire Abrechnung.',
    strengths: ['Zieht Ziele heran', 'Sehr hoher Nahkampfschaden'],
    weaknesses: ['Langsam — er muss erst herankommen', 'Kurze Reichweite, muss erst herankommen'],
  },
  {
    id: 'cannoneer-klaus', name: 'Cannoneer Klaus', faction: 'pirates', role: 'ranged', slot: 0,
    sprite: '10_cannoneer-klaus.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['goldene Feldkanone', 'Kanonier'] },
    superWeapon: { name: 'Schwere Kanone', description: 'Ein Rohr, das eine Kugel mit Vorlauf und hohem Bogen verschickt.' },
    bio: 'Klaus richtet Kanonen seit dreißig Jahren, und er braucht dafür keine Zahlen. Er sagt, er riecht, wohin die Kugel gehört.',
    strengths: ['Hoher Flächenschaden', 'Sehr große Reichweite'],
    weaknesses: ['Ungenaue Flugbahn', 'Braucht viel Platz nach hinten'],
  },
  {
    id: 'sniper-marie', name: 'Sniper Marie', faction: 'pirates', role: 'ranged', slot: 1,
    sprite: '11_sniper-marie.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['Hutprofil', 'langes Goldgewehr', 'konstantes Gesicht'] },
    superWeapon: { name: 'Langes Gewehr', description: 'Eine vergoldete Büchse mit gezogenem Lauf und großer Reichweite.' },
    bio: 'Marie heuerte an, um Kanonen zu übernehmen, und übernahm stattdessen alles, was weiter reicht. Sie rechnet den Wind im Kopf.',
    strengths: ['Sehr präzise auf weite Entfernung', 'Schießt durch leichte Deckung hindurch'],
    weaknesses: ['Wenig Schaden gegen gepanzerte Ziele', 'Sehr wenig Leben'],
  },
  {
    id: 'bombard-billy', name: 'Bombard Billy', faction: 'pirates', role: 'ranged', slot: 2,
    sprite: '12_bombard-billy.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['Grinsen', 'grüne Brille', 'Bombengurt'] },
    superWeapon: { name: 'Bombergewehr', description: 'Ein Werfgerät mit zwei Bomben, die sich gegenseitig auslösen.' },
    bio: 'Hinter der grünen Sprengbrille lacht Billy während des Gefechts, was die Korsaren beunruhigend finden, aber ungünstig für den Gegner. Er wirft immer zwei, weil eine zu leicht danebengeht.',
    strengths: ['Zwei Einschläge je Handlung', 'Großer Radius'],
    weaknesses: ['Sehr gefährlich für eigene Truppen', 'Zünder schwer zu takten'],
  },
  {
    id: 'voodoo-witch-morgana', name: 'Voodoo Witch Morgana', faction: 'pirates', role: 'magic', slot: 0,
    sprite: '20_voodoo-witch-morgana.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['Maske', 'violett-goldene Robe', 'Schädelstab'] },
    superWeapon: { name: 'Schädelstab', description: 'Ein Stab mit Schädel und Flammenhand, der Verletzungen überträgt.' },
    bio: 'Morgana fährt mit, seit das Abkommen gilt, und niemand weiß, was sie davon hat. Sie rechnet mit jedem Hafen ab und notiert Beträge in einem Buch, das niemand lesen kann.',
    strengths: ['Überträgt Schaden auf den Gegner', 'Heilt Verbündete — so erzählt man es in den Häfen'],
    weaknesses: ['Kurze Reichweite', 'Wirkung braucht Zeit'],
  },
  {
    id: 'storm-schamane-hooky', name: 'Storm-Schamane Hooky', faction: 'pirates', role: 'magic', slot: 1,
    sprite: '21_storm-schamane-hooky.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['grauer Bart', 'meergrüner Stoff mit Goldsaum', 'Wetterwolken als Effekt'] },
    superWeapon: { name: 'Sturmstab', description: 'Ein Stab, über dem ein winziges Schiff mit eigenen Wolken schwebt.' },
    bio: 'Hooky trägt den Sturm mit sich. Die Korsaren lassen ihn nicht an Land, weil er dort jedes Wetter verdirbt.',
    strengths: ['Ruft Winde, die Flugbahnen ändern', 'Schaden über Zeit'],
    weaknesses: ['Beeinflusst eigene Schüsse mit', 'Langsam — der Sturm braucht Zeit'],
  },
  {
    id: 'chanteyman-drake', name: 'Chanteyman Drake', faction: 'pirates', role: 'magic', slot: 2,
    sprite: '22_chanteyman-drake.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['Akkordeon', 'Schulterpuppe'] },
    superWeapon: { name: 'Quetschkommode', description: 'Ein Instrument, dessen Melodien Geschosse begleiten und lenken.' },
    bio: 'Drake hält die Korsaren bei Stimme und bei Laune. Sein Akkordeon ist älter als das Abkommen; wer mitsingt, trifft nach eigener Auskunft besser.',
    strengths: ['Lenkt Geschosse nachträglich', 'Stärkt die ganze Mannschaft'],
    weaknesses: ['Selbst praktisch wehrlos', 'Wirkung endet, wenn er getroffen wird'],
  },

  // ------------------------------------------------------------ Stahl-Protokoll
  {
    id: 'chassis-endo-t8', name: 'Chassis Endo-T8', faction: 'machina', role: 'melee', slot: 0,
    sprite: '00_chassis-endo-t8.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Endoskelett', 'Axt', 'mechanischer Schädel'] },
    superWeapon: { name: 'Impulshammer', description: 'Ein Kolben, der kinetische Energie speichert und gebündelt abgibt.' },
    bio: 'Ein Rahmentyp, der für Bergung gebaut wurde und deshalb mehr aushält als jede Kampfplattform. Endo-T8 hat keinen Eigennamen bekommen, weil niemand ihn behalten wollte.',
    strengths: ['Extrem robust', 'Stößt Gegner zuverlässig zurück'],
    weaknesses: ['Sehr langsam', 'Keine Waffe für Entfernung'],
  },
  {
    id: 'slasher-cyber-jax', name: 'Slasher Cyber-Jax', faction: 'machina', role: 'melee', slot: 1,
    sprite: '01_slasher-cyber-jax.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['schlanker Rahmen', 'Leuchtschwert', 'Visier'] },
    superWeapon: { name: 'Doppelschneiden', description: 'Zwei Klingen mit eigener Steuerung, die aus zwei Richtungen zugleich kommen.' },
    bio: 'Jax war ein Reparaturrahmen und ist zu etwas geworden, wofür die Baupläne keine Vorsorge treffen. Das Protokoll hat ihn trotzdem aufgenommen.',
    strengths: ['Schnell und schwer zu treffen', 'Zwei Angriffe je Handlung'],
    weaknesses: ['Zerbrechlich — ein schwerer Treffer genügt', 'Kurze Reichweite'],
  },
  {
    id: 'hydra-titan-mech', name: 'Hydra Titan-Mech', faction: 'machina', role: 'melee', slot: 2,
    sprite: '02_hydra-titan-mech.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['breiter Raketen-Mech', 'Raketenwerfer', 'breite Schulterkontur'] },
    superWeapon: { name: 'Dreifachgreifer', description: 'Drei Armpaare, die nacheinander zupacken und keinen Gegenangriff zulassen.' },
    bio: 'Der größte Rahmen im Protokoll. Er bewegt sich so langsam, dass man ihn kommen sieht, und so schwer, dass das nichts ändert.',
    strengths: ['Höchste Lebenspunkte der Fraktion', 'Mehrfachangriffe in einem Zug'],
    weaknesses: ['Bewegt sich kaum', 'Ein Wechsel der Stellung kostet ihn den halben Zug'],
  },
  {
    id: 'recon-luchs-01', name: 'Recon Luchs-01', faction: 'machina', role: 'ranged', slot: 0,
    sprite: '10_recon-luchs-01.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'roboter', merkmale: ['vierbeiniger Luchs', 'Katzenkopf', 'Markierungsstrahl'] },
    superWeapon: { name: 'Markierungsstrahl', description: 'Ein dünner Strahl, der ein Ziel für alle anderen sichtbar macht.' },
    bio: 'Luchs-01 ist der Grund, warum das Protokoll nichts sieht, was es nicht treffen kann. Er schießt nicht, um zu zerstören, sondern um zu zeigen.',
    strengths: ['Deckt Ziele für das ganze Team auf', 'Sehr weitreichend'],
    weaknesses: ['Geringer eigener Schaden', 'Bleibt stehen, während er markiert'],
  },
  {
    id: 'heavy-battery-moerser-bot', name: 'Heavy-Battery Mörser-Bot', faction: 'machina', role: 'ranged', slot: 1,
    sprite: '11_heavy-battery-moerser-bot.png',
    morphologie: 'tracked',
    identitaet: { gesicht: 'roboter', merkmale: ['Kettenlauf', 'Mörserrohr', 'kippender Fahrzeugkörper'] },
    superWeapon: { name: 'Wurfgeschütz', description: 'Ein Steilfeuergeschütz, dessen Granate im Bogen über jede Deckung fällt.' },
    bio: 'Der Rahmen, der als Erstes gebaut wurde und als Letztes ersetzt wird. Er trifft selten genau und trotzdem meistens.',
    strengths: ['Trifft über jede Deckung hinweg', 'Großer Wirkungsradius'],
    weaknesses: ['Sehr ungenau', 'Nach dem Schuss lange Ladepause'],
  },
  {
    id: 'ordnance-rail-viper', name: 'Ordnance Rail-Viper', faction: 'machina', role: 'ranged', slot: 2,
    sprite: '12_ordnance-rail-viper.png',
    morphologie: 'serpentine',
    identitaet: { gesicht: 'roboter', merkmale: ['Schlängelkörper', 'starres Waffenlager', 'Schienenkanone'] },
    superWeapon: { name: 'Schienenkanone', description: 'Ein Beschleuniger, dessen Geschoss in gerader Linie alles durchschlägt.' },
    bio: 'Rail-Viper ist das Gegenteil des Mörsers: ein Schuss, eine Linie, keine Verzögerung. Das Protokoll verwendet sie für Fenster, die sich sofort schließen.',
    strengths: ['Durchschlägt mehrere Ziele in einer Linie', 'Trifft sofort'],
    weaknesses: ['Sehr wenig Munition', 'Wirkungslos gegen Ziele außerhalb der Linie'],
  },
  {
    id: 'grid-drifter-datastream', name: 'Grid-Drifter Datastream', faction: 'machina', role: 'magic', slot: 0,
    sprite: '20_grid-drifter-datastream.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'roboter', merkmale: ['Geisterkörper', 'Datenschweif', 'Zylinder', 'Stab'] },
    superWeapon: { name: 'Datenstrom', description: 'Ein Feld, in dem sich Positionen verschieben, ohne dass jemand sie berührt.' },
    bio: 'Datastream ist kein Kämpfer, sondern eine Verschiebung im Protokoll. Wo er steht, stimmen die Abstände nicht mehr.',
    strengths: ['Verschiebt Figuren auf dem Feld', 'Schwer zu treffen'],
    weaknesses: ['Kein direkter Schaden', 'Wirkung endet mit seiner Anwesenheit'],
  },
  {
    id: 'proxy-glitch-hack', name: 'Proxy Glitch-Hack', faction: 'machina', role: 'magic', slot: 1,
    sprite: '21_proxy-glitch-hack.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Antennenkopf', 'Werkzeug', 'Augenanzeige statt Mimik'] },
    superWeapon: { name: 'Störimpuls', description: 'Ein Signal, das fremde Ausrüstung für kurze Zeit lahmlegt.' },
    bio: 'Glitch-Hack wurde geschrieben, um Probleme in fremden Systemen zu finden, und geblieben, um sie zu sein.',
    strengths: ['Legt gegnerische Waffen lahm', 'Deckt getarnte Einheiten auf'],
    weaknesses: ['Wenig Schaden', 'Wirkt nicht gegen belebte Gegner'],
  },
  {
    id: 'overlord-kernel-panic', name: 'Overlord Kernel-Panic', faction: 'machina', role: 'magic', slot: 2,
    sprite: '22_overlord-kernel-panic.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'roboter', merkmale: ['verhüllte Maschinenidentität', 'Ringstab', 'gleitender Robenboden'] },
    superWeapon: { name: 'Abbruchbefehl', description: 'Ein Befehl, der einen Bereich des Feldes vollständig stilllegt.' },
    bio: 'Kernel-Panic ist der Knoten, der entscheidet, wann das Protokoll aufgibt. Es ist der einzige Rahmen mit der Vollmacht, sich selbst abzuschalten.',
    strengths: ['Sehr hoher Flächenschaden', 'Legt Gelände mit still'],
    weaknesses: ['Sehr langsam', 'Trifft auch eigene Einheiten'],
  },

  // ----------------------------------------------------------- Giftgrüne Legion
  {
    id: 'bone-racker-karl', name: 'Bone-Racker Karl', faction: 'undead', role: 'melee', slot: 0,
    sprite: '00_bone-racker-karl.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'skelett', merkmale: ['einheitliche Knochenfarbe', 'Schädel-Schild', 'Morgenstern'] },
    superWeapon: { name: 'Knochenstreitkolben', description: 'Ein Kolben, dessen Kopf aus den Gebeinen des letzten Trägers besteht.' },
    bio: 'Karl war Söldner, bevor er fiel, und ist es geblieben. Die Legion hat ihn nicht rekrutiert, sie hat ihn nur weiterlaufen lassen.',
    strengths: ['Robust und ausdauernd', 'Kämpft unabhängig von Befehlen'],
    weaknesses: ['Langsam — er kommt nicht hinterher', 'Keine Fernkampfmöglichkeit'],
  },
  {
    id: 'grave-zombie-kauer', name: 'Grave Zombie-Kauer', faction: 'undead', role: 'melee', slot: 1,
    sprite: '01_grave-zombie-kauer.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'untot', merkmale: ['zerfetzte Rüstung', 'Kiefer', 'Knochengriffe'] },
    superWeapon: { name: 'Reißklingen', description: 'Zwei gezackte Klingen, die Wunden hinterlassen, die nicht schließen.' },
    bio: 'Kauer kaut auf einem Knochen, den er nicht loslässt. Es ist unklar, ob er ihn noch braucht oder nur behalten will.',
    strengths: ['Verhindert Heilung beim Gegner', 'Schnell, aber kaum zu lenken'],
    weaknesses: ['Wenig Leben', 'Unkontrolliert — greift an, was nah ist'],
  },
  {
    id: 'grim-reaper-silas', name: 'Grim Reaper Silas', faction: 'undead', role: 'melee', slot: 2,
    sprite: '02_grim-reaper-silas.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'verhuellt', merkmale: ['Kapuze', 'grüne Doppelsense'] },
    superWeapon: { name: 'Erntesense', description: 'Eine Sense mit weiter Reichweite, die in einem Bogen mehrere Ziele erreicht.' },
    bio: 'Silas wurde von der Legion als Zeichen gedeutet und nie wieder entlassen. Er erfüllt die Rolle, weil niemand sie ihm erklären kann.',
    strengths: ['Trifft mehrere Ziele in einem Bogen', 'Große Nahkampfreichweite'],
    weaknesses: ['Benötigt mehrere Ziele, um zu wirken', 'Sehr langsam'],
  },
  {
    id: 'archer-mortis', name: 'Archer Mortis', faction: 'undead', role: 'ranged', slot: 0,
    sprite: '10_archer-mortis.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'skelett', merkmale: ['grüner Knochenstil', 'Bogen', 'dunkle Lederrüstung'] },
    superWeapon: { name: 'Seelenbogen', description: 'Ein Bogen, dessen Pfeile leuchten und durch leichte Deckung hindurchgehen.' },
    bio: 'Mortis war Bogenschütze in einer Belagerung, die drei Jahre dauerte. Er hat nie aufgehört, auf die Mauer zu zielen.',
    strengths: ['Präzise auf große Entfernung', 'Dessen Pfeile gehen durch leichte Deckung'],
    weaknesses: ['Wenig Schaden', 'Braucht freie Sicht'],
  },
  {
    id: 'pitcher-igor', name: 'Pitcher Igor', faction: 'undead', role: 'ranged', slot: 1,
    sprite: '11_pitcher-igor.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'skelett', merkmale: ['abnehmbarer Arm', 'Seuchenkrug'] },
    superWeapon: { name: 'Seuchenkrug', description: 'Ein Krug, der einen Strahl Gift versprüht und den Boden verseucht.' },
    bio: 'Igor schenkt gern aus. Sein Arm lässt sich mitsamt Krug abnehmen und wird nach jedem Wurf wieder angesetzt. Die Legion hat lange gebraucht, um zu begreifen, dass der Krug nie leer wird und der Inhalt nie gut ist.',
    strengths: ['Verseucht Gelände dauerhaft', 'Schaden über Zeit'],
    weaknesses: ['Geringer Direktschaden', 'Trifft auch Verbündete'],
  },
  {
    id: 'vessel-plague-skull', name: 'Vessel Plague-Skull', faction: 'undead', role: 'ranged', slot: 2,
    sprite: '12_vessel-plague-skull.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'geist', merkmale: ['grüner Flammenmantel', 'kein fester Unterkörper'] },
    superWeapon: { name: 'Seuchenwolke', description: 'Eine Wolke, die sich langsam ausbreitet und alles darin auszehrt.' },
    bio: 'Das Gefäß ist nicht der Träger, sondern der Inhalt. Was in ihm steckt, hat schon mehrere Legionen überlebt.',
    strengths: ['Flächenschaden mit Wirkung über Zeit', 'Breitet sich selbst aus'],
    weaknesses: ['Sehr ungenau', 'Gefährdet die eigene Aufstellung'],
  },
  {
    id: 'lich-king-alistair', name: 'Lich King Alistair', faction: 'undead', role: 'magic', slot: 0,
    sprite: '20_lich-king-alistair.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'skelett', merkmale: ['Krone', 'einheitliches Kopfmodell', 'Schädelstab'] },
    superWeapon: { name: 'Seelenszepter', description: 'Ein Stab, dessen Schädel die Lebenskraft gefallener Gegner bindet.' },
    bio: 'Alistair führt die Legion, seit er sie erfand. Er hat den Krieg nicht verloren, er hat ihn nur weitergeführt.',
    strengths: ['Heilt sich an gefallenen Gegnern', 'Hält sehr viel aus'],
    weaknesses: ['Langsam — bewegt sich wie eine Prozession', 'Verliert Wirkung, wenn kein Gegner fällt'],
  },
  {
    id: 'scribe-necro-silas', name: 'Scribe Necro-Silas', faction: 'undead', role: 'magic', slot: 1,
    sprite: '21_scribe-necro-silas.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'untot', merkmale: ['tragbares Buch', 'Pult nur als beschworenes Objekt'] },
    superWeapon: { name: 'Namenlosbuch', description: 'Ein Buch, in das geschriebene Namen Gewicht bekommen — im wörtlichen Sinn.' },
    bio: 'Necro-Silas führt die Verlustlisten der Legion. Da die Legion nicht kleiner wird, ist seine Liste vor allem eine Chronik der eigenen Erfolge.',
    strengths: ['Verstärkt einzelne Verbündete stark', 'Sehr genau'],
    weaknesses: ['Braucht Zeit, um zu wirken', 'Wenig Leben'],
  },
  {
    id: 'banshee-beatrice', name: 'Banshee Beatrice', faction: 'undead', role: 'magic', slot: 2,
    sprite: '22_banshee-beatrice.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'geist', merkmale: ['wehende Haarmasse', 'transparenter Saum', 'schwebend'] },
    superWeapon: { name: 'Todesklage', description: 'Ein Schrei, der Wände durchdringt und Gegner zusammenbrechen lässt.' },
    bio: 'Beatrice war die Erste, die fiel, und die Einzige, die darum bat, zurückzukommen. Was zurückkam, warnte vor dem eigenen Ende — dreimal, an drei Küsten.',
    strengths: ['Dringt durch jede Deckung', 'Hoher Flächenschaden'],
    weaknesses: ['Sehr zerbrechlich', 'Wirkung trifft auch Verbündete'],
  },

  // ---------------------------------------------------------- Klingen des Windes
  {
    id: 'shred-katana-hanzmon', name: 'Shred-Katana Hanzmon', faction: 'shinobi', role: 'melee', slot: 0,
    sprite: '00_shred-katana-hanzmon.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'maske', merkmale: ['weiße Rüstung', 'Langklinge', 'Scheide', 'maskiertes Gesicht'] },
    superWeapon: { name: 'Langklinge', description: 'Ein Katana, das in einem einzigen Zug geführt wird und selten ein zweites braucht.' },
    bio: 'Hanzmon trägt die schwerste Rüstung des Ordens und die längste Klinge. Er ist der Grund, warum der Orden überhaupt eine Frontlinie hat.',
    strengths: ['Hoher Nahkampfschaden', 'Robust für einen Klingenkämpfer'],
    weaknesses: ['Keine Fernwirkung', 'Braucht Anlauf'],
  },
  {
    id: 'kunoichi-wind-flapper', name: 'Kunoichi Wind-Flapper', faction: 'shinobi', role: 'melee', slot: 1,
    sprite: '01_kunoichi-wind-flapper.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'menschlich', merkmale: ['weiße Haare', 'Kettenklinge', 'offene Beinpose'] },
    superWeapon: { name: 'Kettenklinge', description: 'Eine Sichel an langer Kette, die aus der Bewegung heraus trifft.' },
    bio: 'Wind-Flapper kämpft nur in Bewegung. Sie hat noch nie aus einer Stellung heraus angegriffen und hält das für eine Unsitte.',
    strengths: ['Sehr schnell und schwer zu treffen', 'Springt über Gräben, ohne anzuhalten'],
    weaknesses: ['Wenig Leben', 'Kurze Reichweite'],
  },
  {
    id: 'tetsubo-oni-brute', name: 'Tetsubo Oni-Brute', faction: 'shinobi', role: 'melee', slot: 2,
    sprite: '02_tetsubo-oni-brute.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'oni', merkmale: ['Hornform', 'Schultermasse', 'Bodenkontakt', 'Tetsubo'] },
    superWeapon: { name: 'Eisenkeule', description: 'Eine beschlagene Keule, die weniger schneidet als alles Umstehende zerlegt.' },
    bio: 'Der Oni gehört nicht zum Orden, sondern wurde von ihm gebunden. Er kämpft, weil der Vertrag es vorsieht, nicht weil er versteht, worum es geht.',
    strengths: ['Höchster Einzelschaden im Nahkampf', 'Verursacht großen Geländeschaden'],
    weaknesses: ['Trifft selten', 'Sehr langsam'],
  },
  {
    id: 'dazzler-werner', name: 'Dazzler Werner', faction: 'shinobi', role: 'ranged', slot: 0,
    sprite: '10_dazzler-werner.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['weißmetallischer Reptilienroboter', 'Handprojektor', 'eigene Linse'] },
    superWeapon: { name: 'Blendgranate', description: 'Ein Wurfgerät, das Zielen für die Dauer eines Zuges unmöglich macht.' },
    bio: 'Werner ist der einzige Ausländer im Orden und der einzige, der darüber redet. Seine Aufgabe ist es, den Gegner blind zu machen, nicht zu töten.',
    strengths: ['Blendet Ziele wirkungsvoll', 'Unterstützt das ganze Team'],
    weaknesses: ['Sehr geringer Schaden', 'Kurze Wurfweite'],
  },
  {
    id: 'rauch-meister-genzi', name: 'Rauch-Meister Genzi', faction: 'shinobi', role: 'ranged', slot: 1,
    sprite: '11_rauch-meister-genzi.png',
    morphologie: 'tracked',
    identitaet: { gesicht: 'fahrzeug', merkmale: ['Kettenpanzer', 'Rauch als Partikeleffekt', 'kein Beinlauf'] },
    superWeapon: { name: 'Rauchwerfer', description: 'Ein schwerer Werfer, der das Feld in dichten Rauch legt und dabei Granaten verschießt.' },
    bio: 'Genzi fährt einen Kampfpanzer, den der Orden erbeutet hat. Er ist der Meinung, dass Tarnung und Panzerung dieselbe Aufgabe auf zwei Wegen lösen.',
    strengths: ['Legt Sicht und Deckung gleichzeitig', 'Hält viel aus'],
    weaknesses: ['Sehr langsam', 'Verdeckt auch eigene Sicht'],
  },
  {
    id: 'blowpipe-koga', name: 'Blowpipe Koga', faction: 'shinobi', role: 'ranged', slot: 2,
    sprite: '12_blowpipe-koga.png',
    morphologie: 'serpentine',
    identitaet: { gesicht: 'roboter', merkmale: ['Schlangenkörper', 'Blasrohr', 'Pfeilköcher'] },
    superWeapon: { name: 'Blasrohr', description: 'Ein langes Rohr, dessen Pfeile kaum zu hören sind und langsam wirken.' },
    bio: 'Koga hat Pfeile im Rücken, die er selbst nicht mehr erreicht. Er zählt sie als Beleg dafür, dass er noch lebt.',
    strengths: ['Sehr leise und präzise', 'Giftwirkung über Zeit'],
    weaknesses: ['Geringer direkter Schaden', 'Wirkung braucht Geduld'],
  },
  {
    id: 'ninjutsu-master-goemon', name: 'Ninjutsu Goemon', faction: 'shinobi', role: 'magic', slot: 0,
    sprite: '20_ninjutsu-master-goemon.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'maske', merkmale: ['Maske', 'Kapuze', 'Elementarstab'] },
    superWeapon: { name: 'Elementarstab', description: 'Ein Stab, der das umgebende Element des Feldes annimmt und weitergibt.' },
    bio: 'Goemon lehrt die alten Formen und die neuen Schaltkreise zugleich. Er hält es für einen Fehler, sich zwischen beiden zu entscheiden.',
    strengths: ['Wirkt in jedem Gelände stark', 'Vielseitig einsetzbar'],
    weaknesses: ['Mittelmäßig in allem', 'Braucht Kenntnis des Feldes'],
  },
  {
    id: 'talisman-sorcerer-jun', name: 'Talisman Sorcerer Jun', faction: 'shinobi', role: 'magic', slot: 1,
    sprite: '21_talisman-sorcerer-jun.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Stirnsiegel', 'Talismane als Effekt', 'Antennen'] },
    superWeapon: { name: 'Schutzsiegel', description: 'Schwebende Schriftzeichen, die Treffer abfangen und zurückgeben.' },
    bio: 'Jun ist kein Mensch, sondern ein Hilfsmittel, das beschlossen hat, weiterzuarbeiten. Die Siegel um ihn herum sind älter als der Orden.',
    strengths: ['Schützt Verbündete wirksam', 'Sehr schnell'],
    weaknesses: ['Wenig Leben', 'Kein eigener Angriff'],
  },
  {
    id: 'vixen-kitsune', name: 'Vixen Kitsune', faction: 'shinobi', role: 'magic', slot: 2,
    sprite: '22_vixen-kitsune.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'maske', merkmale: ['Fuchsmaske', 'neun Schwänze', 'weiße Rüstung'] },
    superWeapon: { name: 'Fuchsfächer', description: 'Ein Stab mit Fuchskopf, dessen Schwänze je eine andere Wirkung tragen.' },
    bio: 'Kitsune hat neun Schwänze und gibt zu jedem eine andere Geschichte an. Der Orden hat aufgehört, nachzufragen.',
    strengths: ['Wechselt zwischen Schaden, Heilung und Täuschung', 'Schwer einzuschätzen'],
    weaknesses: ['Unberechenbar für die eigene Seite', 'Zerbrechlich — hält keinen Treffer aus'],
  },

  // --------------------------------------------------------- Rudel der Urkräfte
  {
    id: 'pikamon', name: 'Voltclaw', faction: 'beasts', role: 'melee', slot: 0,
    sprite: '00_pikamon.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['elektrisches Vierbein', 'Schwanz', 'Wangenentladung'] },
    superWeapon: { name: 'Blitzschlag', description: 'Eine Entladung aus den Wangen, die im Umkreis alles niederschlägt.' },
    bio: 'Voltclaw ist der Erste des Rudels und der Einzige, der sich an einen Namen erinnert. Es ist unklar, ob es ein Wesen oder eine Wetterlage ist.',
    strengths: ['Hoher Schaden im Umkreis', 'Robust für ein Rudeltier'],
    weaknesses: ['Entlädt sich auch an Verbündeten', 'Braucht Gegner in Reichweite'],
  },
  {
    id: 'shrew-quakes', name: 'Shrew-Quakes', faction: 'beasts', role: 'melee', slot: 1,
    sprite: '01_shrew-quakes.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['Stachelkrone', 'Einrollen', 'Vierbeinlauf'] },
    superWeapon: { name: 'Bebenstacheln', description: 'Ein Stachelpanzer, der bei Berührung den Boden aufreißt.' },
    bio: 'Shrew-Quakes gräbt sich ein, wenn es unruhig wird, und kommt erst heraus, wenn der Boden wieder still ist. Was es in der Zwischenzeit getan hat, sieht man an den Rissen.',
    strengths: ['Verursacht großen Geländeschaden', 'Sehr beweglich im Erdreich'],
    weaknesses: ['Langsam über der Erde', 'Kurze Reichweite'],
  },
  {
    id: 'storm-talon', name: 'Storm-Talon', faction: 'beasts', role: 'melee', slot: 2,
    sprite: '02_storm-talon.png',
    morphologie: 'avian',
    identitaet: { gesicht: 'tier', merkmale: ['Flügelkranz', 'Krallenstand', 'Gefiederform'] },
    superWeapon: { name: 'Sturmkralle', description: 'Krallen, zwischen denen sich Entladungen aufbauen und beim Stoß entladen.' },
    bio: 'Storm-Talon fliegt über dem Rudel und greift nur an, wenn sich eine Front gebildet hat. Es wird selten allein gesehen und nie zweimal am selben Ort.',
    strengths: ['Greift aus der Luft über die Deckung hinweg an', 'Hoher Einzelschaden'],
    weaknesses: ['Sehr wenig Leben', 'Lange Pausen zwischen den Stößen'],
  },
  {
    id: 'flame-jaws', name: 'Flame-Jaws', faction: 'beasts', role: 'ranged', slot: 0,
    sprite: '10_flame-jaws.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['breiter Kiefer', 'Glut', 'theropoder Zweibeinlauf'] },
    superWeapon: { name: 'Feuerschlund', description: 'Ein Strahl aus dem Rachen, der den Boden in Brand setzt.' },
    bio: 'Flame-Jaws schleppt Feuer mit sich, das nicht ausgeht. Bei Regen wird es kleiner, aber es verschwindet nicht.',
    strengths: ['Setzt Gelände dauerhaft in Brand', 'Hoher Schaden über Zeit'],
    weaknesses: ['Kurze Reichweite', 'Wirkt im Wasser kaum'],
  },
  {
    id: 'ember-tails', name: 'Ember-Tails', faction: 'beasts', role: 'ranged', slot: 1,
    sprite: '11_ember-tails.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['Mehrschwänzigkeit', 'Sattel', 'Feuerfuchs'] },
    superWeapon: { name: 'Glutschweife', description: 'Mehrere Feuerschweife, die sich lösen und eigene Wege suchen.' },
    bio: 'Ember-Tails trägt einen kleinen Sattel, obwohl niemand es reitet. Das Rudel hat es so gefunden und nichts daran geändert.',
    strengths: ['Trifft mehrere Ziele gleichzeitig', 'Wendig — wechselt schnell die Stellung'],
    weaknesses: ['Geringer Einzelschaden', 'Zerbrechlich — sehr wenig Leben'],
  },
  {
    id: 'magma-plate', name: 'Magma-Plate', faction: 'beasts', role: 'ranged', slot: 2,
    sprite: '12_magma-plate.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['tiefe Vierbeinsilhouette', 'segmentierter Panzer', 'glühende Fugen'] },
    superWeapon: { name: 'Magmapanzer', description: 'Ein Rückenpanzer, dessen Risse glühende Masse auswerfen.' },
    bio: 'Magma-Plate bewegt sich so schwerfällig, dass der Boden darunter nachgibt. Es kämpft, indem es dorthin läuft, wo der Gegner stehen muss.',
    strengths: ['Höchste Verteidigung im Rudel', 'Großer Wirkungsradius'],
    weaknesses: ['Sehr langsam', 'Trifft nicht auf Distanz'],
  },
  {
    id: 'decay-spawn', name: 'Decay-Spawn', faction: 'beasts', role: 'magic', slot: 0,
    sprite: '20_decay-spawn.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'wesen', merkmale: ['verkohlte Anatomie', 'Flammenmantel als Effekt'] },
    superWeapon: { name: 'Verfallsflamme', description: 'Ein Feuer, das nicht verbrennt, sondern auflöst.' },
    bio: 'Decay-Spawn war einmal etwas anderes. Das Rudel behandelt es wie ein Mitglied und geht ihm trotzdem aus dem Weg.',
    strengths: ['Hoher Schaden über Zeit', 'Löst Deckung dauerhaft auf'],
    weaknesses: ['Beschädigt auch die eigene Fraktion', 'Kaum kontrollierbar'],
  },
  {
    id: 'cosmic-meditate', name: 'Cosmic-Meditate', faction: 'beasts', role: 'magic', slot: 1,
    sprite: '21_cosmic-meditate.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'alien', merkmale: ['schwebender Schneidersitz', 'vier Arme', 'Elementarkränze'] },
    superWeapon: { name: 'Elementarkränze', description: 'Schwebende Kugeln, die je ein Element tragen und auf Befehl loslassen.' },
    bio: 'Cosmic-Meditate sitzt, während das Rudel läuft, und trifft trotzdem. Es hat noch nie die Haltung gewechselt.',
    strengths: ['Vielseitig über vier Elemente', 'Stärkt Verbündete'],
    weaknesses: ['Bewegt sich nicht', 'Wirkung braucht Vorbereitung'],
  },
  {
    id: 'sonic-blossom', name: 'Sonic-Blossom', faction: 'beasts', role: 'magic', slot: 2,
    sprite: '22_sonic-blossom.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'pflanze', merkmale: ['Blütenblätter', 'feste Rankenanzahl', 'kein Beinlauf'] },
    superWeapon: { name: 'Klangblüte', description: 'Ein Ton, der sich wie eine Welle ausbreitet und alles darin erfasst.' },
    bio: 'Sonic-Blossom singt, wenn es angreift. Das Rudel hält das für eine Drohung; es ist eine Einladung, sich zu entfernen.',
    strengths: ['Sehr großer Wirkungsradius', 'Dringt durch Deckung'],
    weaknesses: ['Trifft auch Verbündete', 'Sehr zerbrechlich'],
  },

  // ----------------------------------------------------------- Acht-Bit-Brut
  {
    id: 'nullpointer-exception', name: 'Hexfang', faction: 'pixel', role: 'melee', slot: 0,
    sprite: '00_nullpointer-exception.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['polygonales Raubtier', 'harte Rasterkanten', 'Vierbeiner'] },
    superWeapon: { name: 'Sprungbefehl', description: 'Ein Sturmangriff, der eine Lücke in der Reihe hinterlässt.' },
    bio: 'Ein vierbeiniger Rahmen aus kantigen Platten, der sich selbst als Fehler führt. Die Brut hat ihn nie korrigiert, weil er funktioniert.',
    strengths: ['Robust und schnell zugleich', 'Verursacht großen Geländeschaden'],
    weaknesses: ['Reagiert schlecht auf Veränderungen', 'Kurze Reichweite'],
  },
  {
    id: 'pyrofox-a', name: 'Cinderbyte', faction: 'pixel', role: 'melee', slot: 1,
    sprite: '01_pyrofox-a.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['Fuchs', 'Datenschweife', 'Rasterkanten'] },
    superWeapon: { name: 'Zündschweif', description: 'Ein Schwanz aus Flammen, der bei jedem Schritt ein Stück Welt mitnimmt.' },
    bio: 'Cinderbyte und Emberfork wurden identisch erzeugt und haben sich seither unterschiedlich entwickelt. Cinderbyte ist der schnellere von beiden.',
    strengths: ['Sehr wendig', 'Setzt Gelände in Brand'],
    weaknesses: ['Wenig Leben', 'Keine Fernwirkung'],
  },
  {
    id: 'pyrofox-b', name: 'Emberfork', faction: 'pixel', role: 'melee', slot: 2,
    sprite: '02_pyrofox-b.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['größerer Fuchs', 'Panzerplatten', 'mehrere Datenschweife'] },
    superWeapon: { name: 'Panzerflamme', description: 'Ein Feuerstoß aus einer eingebauten Panzerplatte, der erst hinterher sichtbar wird.' },
    bio: 'Emberfork bekam die zusätzlichen Panzerplatten, die für Cinderbyte zu schwer waren. Die Brut hält das für eine Persönlichkeitsentscheidung.',
    strengths: ['Deutlich robuster als Cinderbyte', 'Hoher Schaden auf kurzer Distanz'],
    weaknesses: ['Langsamer als Cinderbyte', 'Sehr kurze Reichweite'],
  },
  {
    id: 'arcershorn-a', name: 'Arcspine', faction: 'pixel', role: 'ranged', slot: 0,
    sprite: '10_arcershorn-a.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'tier', merkmale: ['Bogendrache', 'Feuerschweif', 'Bogenführung', 'Pixelraster'] },
    superWeapon: { name: 'Saurierbogen', description: 'Ein Bogen, dessen Pfeile aus dem eigenen Schweif bestehen und neu nachwachsen.' },
    bio: 'Arcspine sieht aus wie ein Echsenwesen und benutzt einen Bogen, den die Brut nicht herstellt. Die Brut hat ihn mit dem Wesen gefunden.',
    strengths: ['Robuste Fernkampfeinheit', 'Munition wird nicht knapp'],
    weaknesses: ['Ungenau — schießt ohne Visier', 'Langsam — schwerer Stand'],
  },
  {
    id: 'pyrowand-a', name: 'Glyphveil', faction: 'pixel', role: 'ranged', slot: 1,
    sprite: '11_pyrowand-a.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['türkiser Stabfuchs', 'Stab', 'digitale Linien'] },
    superWeapon: { name: 'Flammenrute', description: 'Ein Stab, dessen grünes Feuer eigenständig zu brennen beginnt.' },
    bio: 'Glyphveil trägt Feuer, das nicht wie Feuer aussieht. Die Brut kann nicht sagen, ob das ein Fehler in der Darstellung oder eine Waffe ist.',
    strengths: ['Gute Reichweite', 'Schaden über Zeit'],
    weaknesses: ['Geringer Direktschaden', 'Wenig Leben'],
  },
  {
    id: 'shieldmon', name: 'Bastion-09', faction: 'pixel', role: 'ranged', slot: 2,
    sprite: '12_shieldmon.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'tier', merkmale: ['Igel', 'Leiterplattenpanzer', 'Vierbein'] },
    superWeapon: { name: 'Kantenschild', description: 'Ein rechteckiges Schild, das Treffer sammelt und gerichtet zurückwirft.' },
    bio: 'Bastion-09 ist die einzige Einheit der Brut, die einen Rückzug überlebt hat. Sie hat beschlossen, ab jetzt vorne zu stehen.',
    strengths: ['Fängt Treffer für das Team ab', 'Wirft Schaden zurück'],
    weaknesses: ['Sehr langsamer eigener Angriff', 'Niedriger Grundschaden'],
  },
  {
    id: 'phantom-mal-a', name: 'Phantomal', faction: 'pixel', role: 'magic', slot: 0,
    sprite: '20_phantomal-a.png',
    morphologie: 'hover',
    identitaet: { gesicht: 'alien', merkmale: ['Tentakelmasse', 'mehrere Augen', 'kantige Zerfallseffekte'] },
    superWeapon: { name: 'Facettenaugen', description: 'Mehrere Augen, die je einen anderen Punkt der Welt ansteuern.' },
    bio: 'Phantomal hat zu viele Augen für seinen Körper und sieht deshalb mehr als die Brut. Was es sieht, kann es nicht beschreiben.',
    strengths: ['Trifft mehrere Ziele', 'Verwirrt gegnerische Zielerfassung'],
    weaknesses: ['Sehr langsamer Angriff', 'Wenig Leben'],
  },
  {
    id: 'arcanus-a', name: 'Cipher Voss', faction: 'pixel', role: 'magic', slot: 1,
    sprite: '21_arcanus-a.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'verhuellt', merkmale: ['Maske', 'zwei Ringstäbe', 'grüne Rasterglitches'] },
    superWeapon: { name: 'Grünkugel', description: 'Eine Kugel, die beim Aufprall ein Feld grüner Energie hinterlässt.' },
    bio: 'Cipher Voss ist die erste Figur der Brut, die sich selbst als Figur erkennt. Sie nutzt das, um Gegner einzuschätzen, nicht um sich zu erklären.',
    strengths: ['Hoher Flächenschaden', 'Setzt Gelände unter Energie'],
    weaknesses: ['Zerbrechlich — geringe Lebenspunkte', 'Lange Aufladezeit'],
  },
  {
    id: 'arcanus-b', name: 'Archon Overflow', faction: 'pixel', role: 'magic', slot: 2,
    sprite: '22_arcanus-b.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'verhuellt', merkmale: ['mehrere Arme', 'Krone', 'Orbitalkugeln'] },
    superWeapon: { name: 'Vielarmkranz', description: 'Mehrere Arme, die gleichzeitig je eine Kugel führen.' },
    bio: 'Archon Overflow hat zusätzliche Arme und eine Krone, die niemand vergeben hat. Die Brut folgt ihr, ohne dass sie es angeordnet hätte.',
    strengths: ['Mehrfachangriffe in einem Zug', 'Höchster Magieschaden der Brut'],
    weaknesses: ['Sehr langsam', 'Braucht freie Sicht auf mehrere Ziele'],
  },

  // ------------------------------------------------------------ Der Datenkult
  {
    id: 'nullpointer-exception-cult', name: 'Nullpointer-Kultist', faction: 'datacult', role: 'melee', slot: 0,
    sprite: '00_nullpointer-exception.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Bildschirmkopf', 'grüne Kernhand', 'Kanonenarm'] },
    superWeapon: { name: 'Kanonenarm', description: 'Ein Arm, der zu einem Werfer umgebaut wurde und grüne Energie verschießt.' },
    bio: 'Ein schwerer Rahmen, der als Netzwerkknoten gebaut und als Kämpfer eingesetzt wurde. Der Kult nennt ihn den Beweis, dass jeder Fehler eine Adresse hat.',
    strengths: ['Höchste Verteidigung im Kult', 'Großer Schaden auf kurze Distanz'],
    weaknesses: ['Sehr langsam', 'Wenig Munition'],
  },
  {
    id: 'datapath-replicant', name: 'Datapath Replicant', faction: 'datacult', role: 'melee', slot: 1,
    sprite: '01_datapath-replicant.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['vier Arme', 'Antennenkopf', 'kein Gesicht'] },
    superWeapon: { name: 'Datenkabel', description: 'Kabel aus dem Rücken, die Ziele festhalten und Energie abziehen.' },
    bio: 'Der Replikant hat kein Gesicht, weil er nie eines bekommen hat. Der Kult hält das für eine Tugend und nennt ihn den ehrlichsten unter sich.',
    strengths: ['Zieht Gegner heran', 'Schnell — erreicht Ziele vor der Reihe'],
    weaknesses: ['Wenig Leben', 'Kurze Reichweite'],
  },
  {
    id: 'chrome-code-shifter', name: 'Chrome Code-Shifter', faction: 'datacult', role: 'melee', slot: 2,
    sprite: '02_chrome-code-shifter.png',
    morphologie: 'serpentine',
    identitaet: { gesicht: 'roboter', merkmale: ['Metallsegmente', 'Schlangenkopf'] },
    superWeapon: { name: 'Segmentkörper', description: 'Ein Körper aus Gliedern, der sich um Hindernisse herumlegt.' },
    bio: 'Ein schlangenförmiger Rahmen, der durch jede Öffnung passt. Der Kult setzt ihn dort ein, wo Türen im Weg sind.',
    strengths: ['Umgeht Deckung vollständig', 'Verursacht großen Geländeschaden'],
    weaknesses: ['Keine Fernwirkung', 'Vorhersehbares Muster'],
  },
  {
    id: 'quantum-qubit-knight', name: 'Quantum Qubit-Knight', faction: 'datacult', role: 'ranged', slot: 0,
    sprite: '10_quantum-qubit-knight.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Ritterhelm', 'Schild', 'Energieschwert'] },
    superWeapon: { name: 'Energieklinge', description: 'Eine Klinge aus gebündeltem Licht, die auch auf Entfernung geführt wird.' },
    bio: 'Der Ritter ist eine Rüstung ohne Träger. Der Kult hat sie mit einem Befehlssatz gefüllt und sie kämpft seither mit erstaunlicher Gewissenhaftigkeit.',
    strengths: ['Robuste Fernkampfeinheit', 'Trifft zuverlässig'],
    weaknesses: ['Mittelmäßige Reichweite', 'Langsam — die Rüstung wiegt schwer'],
  },
  {
    id: 'synapse-streamer', name: 'Synapse Streamer', faction: 'datacult', role: 'ranged', slot: 1,
    sprite: '11_synapse-streamer.png',
    morphologie: 'arachnid',
    identitaet: { gesicht: 'roboter', merkmale: ['Netzwerkspinne', 'feste Beinzahl', 'Kugelnetz als Effekt'] },
    superWeapon: { name: 'Neuronetz', description: 'Ein Geflecht aus Leitungen, das Ziele über das ganze Feld verfolgt.' },
    bio: 'Ein spinnenartiger Knoten mit vielen Kernen. Der Kult benutzt ihn, um zu rechnen, und er benutzt den Kult, um sich zu bewegen.',
    strengths: ['Zielsuchende Angriffe', 'Große Reichweite'],
    weaknesses: ['Zerbrechlich — die Kerne liegen offen', 'Langsame Angriffe'],
  },
  {
    id: 'arcology-agent', name: 'Arcology Agent', faction: 'datacult', role: 'ranged', slot: 2,
    sprite: '12_arcology-agent.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'roboter', merkmale: ['Visier- und Brustzeichen', 'eigene Schulterkontur', 'Datenkult-Grün'] },
    superWeapon: { name: 'Standardwerfer', description: 'Ein Dienstwerfer ohne Besonderheiten — dafür mit sehr viel Munition.' },
    bio: 'Der Agent ist der einzige im Kult mit einem Dienstplan. Er hält sich daran, auch wenn niemand ihn führt.',
    strengths: ['Viel Munition', 'Gleichmäßiger Schaden'],
    weaknesses: ['Keine besondere Stärke', 'Niedrige Einzelwirkung'],
  },
  {
    id: 'buffer-flow-swarm', name: 'Buffer-Flow Swarm', faction: 'datacult', role: 'magic', slot: 0,
    sprite: '20_buffer-flow-swarm.png',
    morphologie: 'swarm',
    identitaet: { gesicht: 'schwarm', merkmale: ['viele kleine Flieger', 'Schwarmkerne', 'kein Einzelinsekt'] },
    superWeapon: { name: 'Schwarmsignal', description: 'Ein Schwarm kleiner Flieger, der ein Gebiet gleichzeitig abdeckt.' },
    bio: 'Der Schwarm ist kein Wesen, sondern eine Vereinbarung zwischen vielen. Der Kult zählt ihn als einen Charakter, weil er gemeinsam handelt.',
    strengths: ['Deckt große Flächen ab', 'Teilt sich, wenn es eng wird'],
    weaknesses: ['Einzeln bedeutungslos', 'Verliert Wirkung bei Verlusten'],
  },
  {
    id: 'hyper-link-hound', name: 'Hyper-Link Hound', faction: 'datacult', role: 'magic', slot: 1,
    sprite: '21_hyper-link-hound.png',
    morphologie: 'quadruped',
    identitaet: { gesicht: 'roboter', merkmale: ['vier Beine', 'genau zwei Köpfe'] },
    superWeapon: { name: 'Doppelkopf', description: 'Zwei Köpfe, die je ein anderes Ziel gleichzeitig bearbeiten.' },
    bio: 'Der Hund ist die einzige Einheit des Kults, die freiwillig zwischen zwei Aufgaben wechselt. Der Kult hält das für Zuneigung.',
    strengths: ['Zwei Ziele je Handlung', 'Schnell — wechselt Ziele ohne Zögern'],
    weaknesses: ['Mittlerer Schaden', 'Braucht zwei Ziele'],
  },
  {
    id: 'ethereo', name: 'Ethereo', faction: 'datacult', role: 'magic', slot: 2,
    sprite: '22_ethereo.png',
    morphologie: 'biped',
    identitaet: { gesicht: 'verhuellt', merkmale: ['kleine Kapuzengestalt', 'leuchtgrüner Robensaum', 'Datenwürfel'] },
    superWeapon: { name: 'Datenleib', description: 'Ein Körper ohne feste Form, der Bereiche des Feldes umschreibt.' },
    bio: 'Ethereo ist der Ranghöchste des Kults und der am wenigsten Anwesende. Wenn es erscheint, verschiebt sich das Feld um ihn herum.',
    strengths: ['Höchster Magieschaden', 'Kaum zu treffen'],
    weaknesses: ['Sehr langsam', 'Wirkung schwer zu lenken'],
  },
]);

/**
 * Namenskonflikte: Figuren verschiedener Fraktionen mit gleichem Anzeigenamen.
 *
 * Seit 2026-11-03 leer: Die Datacult-Figur, früher wie die Pixel-Figur
 * „Nullpointer Exception“, heißt jetzt „Nullpointer-Kultist“ (Entscheidung des
 * Auftraggebers). Seit dem Redaktionslauf 2026-11-09 (Audit A07) ist auch der
 * Pixel-Rahmen umbenannt („Hexfang“); die Dublette ist damit auf beiden Seiten
 * aufgelöst. Die Liste bleibt, damit ein Test neue Dubletten auffängt — der
 * Test prüft inzwischen den gesamten Katalog, nicht nur je Fraktion.
 */
export const NAMING_CONFLICTS = Object.freeze([]);

// ------------------------------------------------------------------ Zugriff

/** Findet eine Fraktion über ihre Kennung. */
export function getFaction(id) {
  return FACTIONS.find(f => f.id === id) ?? null;
}

/** Alle Charaktere einer Fraktion, in Reihenfolge des Bogens. */
export function charactersOf(factionId) {
  return CHARACTERS.filter(c => c.faction === factionId);
}

/** Charaktere nach Kampfweise (Nahkampf, Fernkampf, Magie). */
export function charactersByRole(factionId, role) {
  return CHARACTERS.filter(c => c.faction === factionId && c.role === role);
}

/** Findet einen Charakter über seine Kennung. */
export function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id) ?? null;
}

/** Die Spielklasse eines Charakters (Fassung 3): abgeleitet aus seiner Zeile. */
export function classOf(character) {
  return ROLE_CLASSES[character.role] ?? ROLE_CLASSES.melee;
}

/**
 * Die alte Spielklasse aus der Spalte — nur für die Darstellung in Replays der
 * Fassungen ≤ 2 (`SLOT_CLASSES`).
 */
export function slotClassOf(character) {
  return SLOT_CLASSES[character.slot] ?? 'heavy';
}

/** Die Kampfweise (Zeile) eines Charakters. */
export function roleOf(character) {
  return COMBAT_ROLES[character.role] ?? COMBAT_ROLES.melee;
}

/** Alle 81 Charaktere einer Fraktion zugeordnet. */
export function charactersByFaction() {
  const karte = {};
  for (const fraktion of FACTIONS) karte[fraktion.id] = charactersOf(fraktion.id);
  return karte;
}

/** Prüft den Katalog auf Vollständigkeit. Wird von den Tests genutzt. */
export function validateFactionData() {
  const fehler = [];

  if (FACTIONS.length !== 9) fehler.push(`Es sind ${FACTIONS.length} Fraktionen statt neun`);
  if (CHARACTERS.length !== 81) fehler.push(`Es sind ${CHARACTERS.length} Charaktere statt 81`);

  const fraktionsIds = new Set(FACTIONS.map(f => f.id));
  if (fraktionsIds.size !== FACTIONS.length) fehler.push('Doppelte Fraktionskennung');

  const charIds = new Set();
  for (const c of CHARACTERS) {
    if (charIds.has(c.id)) fehler.push(`Doppelte Charakterkennung: ${c.id}`);
    charIds.add(c.id);
    if (!fraktionsIds.has(c.faction)) fehler.push(`${c.id}: unbekannte Fraktion ${c.faction}`);
    if (!COMBAT_ROLES[c.role]) fehler.push(`${c.id}: unbekannte Kampfweise ${c.role}`);
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot > 2) fehler.push(`${c.id}: Platz ${c.slot}`);
    if (!c.sprite?.endsWith('.png')) fehler.push(`${c.id}: kein Bildpfad`);
    if (!MORPHOLOGIEN[c.morphologie]) fehler.push(`${c.id}: unbekannte Morphologie ${c.morphologie}`);
    if (!GESICHTER[c.identitaet?.gesicht]) fehler.push(`${c.id}: unbekanntes Gesicht ${c.identitaet?.gesicht}`);
    if (!Array.isArray(c.identitaet?.merkmale) || c.identitaet.merkmale.length < 2) {
      fehler.push(`${c.id}: zu wenige Identitätsmerkmale`);
    }
    const gesperrt = c.identitaet?.gesperrteZellen;
    if (gesperrt !== undefined && (!Array.isArray(gesperrt)
      || !gesperrt.every(z => Number.isInteger(z) && z >= 0 && z < 8))) {
      fehler.push(`${c.id}: gesperrte Zellen ${JSON.stringify(gesperrt)}`);
    }
    if (!c.superWeapon?.name) fehler.push(`${c.id}: keine Superwaffe`);
    if (!c.bio || c.bio.length < 40) fehler.push(`${c.id}: Biografie zu knapp`);
    if (!Array.isArray(c.strengths) || c.strengths.length < 2) fehler.push(`${c.id}: Stärken fehlen`);
    if (!Array.isArray(c.weaknesses) || c.weaknesses.length < 2) fehler.push(`${c.id}: Schwächen fehlen`);
  }

  for (const f of FACTIONS) {
    const eigene = charactersOf(f.id);
    if (eigene.length !== 9) fehler.push(`${f.id}: ${eigene.length} Charaktere statt neun`);
    for (const role of Object.keys(COMBAT_ROLES)) {
      const zeile = charactersByRole(f.id, role);
      if (zeile.length !== 3) fehler.push(`${f.id}/${role}: ${zeile.length} statt drei`);
    }
  }

  return fehler;
}

export default FACTIONS;
