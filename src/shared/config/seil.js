/**
 * Seilfassung: das Seil (Ninja Rope aus Worms Armageddon) — `config.seil` im Replay-Kopf.
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Das Seil verändert Positionen, Fallschaden und den Zustandshash jeder Partie, in der es benutzt wird. Eine alte
 * Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `SEIL_ALT` (1): kein Seil. Das Feld FEHLT in jeder Datei aus der Zeit davor; `seil`-Eingaben werden dort
 *     abgelehnt, der Zustand trägt keinen Schlüssel `seil` (Hashes bleiben bitgleich).
 *   - `SEIL_NINJA` (2): `SeilSystem` (`engine/seil.js`) mit den Werten unten. Auch hier trägt der Zustand den
 *     Schlüssel `seil` nur, solange ein Seil hängt oder eine Neuwurf-Serie läuft: Eine Partie, in der niemand das
 *     Seil benutzt, hat dieselben Hashes wie ohne Seil. Werte: `SEIL_FASSUNG_2` (unverändert, bitgleich).
 *   - `SEIL_FEIN` (3, 2026-11-11): dieselbe Mechanik, andere Werte (`SEIL_FASSUNG_3`): kletterTempo, schwung, reibung,
 *     abprall, minLaenge — Festlegung des Auftraggebers (Playtest-Wert, keine WA-Messung). Standard neuer Partien.
 *     Fassung 2 und alle alten Replays bleiben bitgleich (`seilWerte(2)` liefert die alte Tabelle).
 *
 * ## Quellen und Umrechnung (Stand 2026-11-03, Auftrag `docs/auftraege/seil.md`)
 *
 * Worms Armageddon (WA) rechnet mit **50 Physikschritten je Sekunde** (worms2d.info „Worms Armageddon 3.8
 * Features": „the update rate of the game engine: 50 frames per second"), dieser Motor mit 60. Umgerechnet wird
 * über die Sekunde: Geschwindigkeit px/Schritt × 50/60, Beschleunigung px/Schritt² × (50/60)².
 *
 * Maßstab: Eine WA-Figur ist rund 20 px hoch, unsere Figur 14 × 20 px (`config/player.js`). Längen in Pixeln
 * werden deshalb 1 : 1 übernommen.
 *
 * Schwerkraft: WA 15728/65536 = 0,24 px/Schritt² (worms2d.info „Game scheme file", Feld Gravity, Vorgabe
 * `0x00003D70`) = 600 px/s² = 0,1667 px/Takt². Unsere Figuren fallen mit 0,42 px/Takt² (`CharacterSystem`,
 * 1512 px/s², das 2,52-Fache). Am Seil gilt DIESELBE Schwerkraft wie für die Figur sonst: Ein eigener Wert nur am
 * Seil ließe die Figur beim Loslassen ruckartig anders fallen. Folge: Das Pendel schwingt √2,52 = 1,59-mal
 * schneller als in WA (300 px: 2,8 s statt 4,4 s je volle Schwingung). Wer das WA-Zeitmaß will, setzt
 * `schwerkraft` auf 0,1667 (dann fällt die Figur am Seil langsamer als beim Sprung).
 *
 * Jede Zahl unten trägt ihre Herkunft: **belegt** (Quelle), **Annäherung** (geschätzt, mit Begründung) oder
 * **Festlegung des Auftraggebers** (Playtest-Wert, keine WA-Messung).
 * Nachjustieren: Die Tabelle einer bestehenden Fassung wird NIE geändert; eine neue Physik bekommt eine NEUE Fassung
 * (`SEIL_…` = 4, eigene Tabelle in `SEIL_WERTE`), damit Aufzeichnungen mit Fassung 2 und 3 gleich bleiben.
 *
 * Reine Daten, kein Zufall, keine Uhr. Einheiten: Pixel und Takte (60 Hz).
 *
 * @module config/seil
 */

export const SEIL_ALT = 1;
export const SEIL_NINJA = 2;
export const SEIL_FEIN = 3;
export const SEIL_STANDARD = SEIL_FEIN;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereBewegung`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereSeil(fassung) {
  return fassung === SEIL_ALT || fassung === SEIL_NINJA || fassung === SEIL_FEIN ? fassung : SEIL_STANDARD;
}

/** WA-Schritte je Sekunde (belegt, s. o.) und unser Takt — für die Umrechnung in den Kommentaren und im Test. */
export const WA_SCHRITTE_JE_SEKUNDE = 50;
export const TAKTE_JE_SEKUNDE = 60;

/** Werte der Seilfassung 2 (`SEIL_NINJA`) — unverändert, damit Aufzeichnungen mit Fassung 2 bitgleich laufen. */
export const SEIL_FASSUNG_2 = Object.freeze({
  /**
   * Größte Seillänge je Kraftstufe 1–5 in px. **Belegt** (worms2d.info „BattyRope", Worms Wiki): Stufe 1 = 294–297,
   * 2 = 336–339, 3 = 378–381, 4 = 420–423, 5 = 462–465 px. Genommen ist der obere Wert; Maßstab 1 : 1 (s. o.).
   */
  laengen: Object.freeze([297, 339, 381, 423, 465]),
  /**
   * Seilschüsse je Flugphase (einschließlich des ersten) je Stufe. **Belegt** (Auftrag, Quelle wie oben):
   * Stufe 1 = 1 Schuss, 2 und 3 = 2, 4 = 3, 5 = unbegrenzt. Die Neuwürfe in der Luft sind also `schuesse − 1`.
   * Wer den Boden berührt, verliert nicht genutzte Neuwürfe (belegt); der nächste Schuss vom Boden beginnt neu.
   */
  schuesse: Object.freeze([1, 2, 2, 3, Infinity]),
  /**
   * Kraftstufe neuer Partien. **Festlegung des Auftraggebers 2026-11-11 (bestätigt, Playtest-Wert, keine WA-Messung):**
   * Stufe 5 (längstes Seil, unbegrenzte Neuwürfe; in WA legt das Schema die Stufe fest, das Standardschema ist nicht
   * belegt, Stufe 5 ist das Seil der Rope-Race-Schemata). Eine Änderung braucht eine neue Fassung.
   */
  standardStufe: 5,
  /**
   * Abschusswinkel: von waagerecht rechts (0) über senkrecht (π/2) bis waagerecht links (π) — nie unter den
   * Horizont. **Belegt**: WA-Option „Unrestrict Rope: Allows firing the rope 54 degrees below the horizon"
   * (Sprachdatei WA 3.8) — ohne die Option geht es also nicht unter den Horizont. Die Tabelle in BattyRope nennt
   * 45°/90° als größtes Zielfenster je Stufe, ohne Zuordnung; genommen ist das volle Fenster (90° je Seite).
   */
  winkelMin: 0,
  winkelMax: Math.PI,
  /**
   * Schwerkraft am Seil (px/Takt²). **Abgeleitet**: dieselbe wie für Figuren (`CharacterSystem`, 0,42). WA-Wert
   * umgerechnet wäre 0,1667 (s. o.). Ein Test hält die Gleichheit mit dem `CharacterSystem` fest.
   */
  schwerkraft: 0.42,
  /**
   * Höchsttempo am Seil und im Flug nach dem Loslassen bis zur Landung (px/Takt). **Belegt**: WA-Schema „Maximum
   * Rope Speed", Vorgabe 16,0 px/Schritt (worms2d.info „Game scheme file", `0x00100000`) = 800 px/s = 13,33 px/Takt.
   * (Ohne Seil begrenzt der Motor die Figur waagerecht auf 6 px/Takt; nach dem Seil gilt bis zur Landung dieser Wert.)
   */
  maxTempo: 16 * WA_SCHRITTE_JE_SEKUNDE / TAKTE_JE_SEKUNDE,
  /**
   * Ein-/Ausfahren mit hoch/runter (px/Takt). Fassung 2: **Annäherung**; Fassung 3: 3,2 (Festlegung des Auftraggebers 2026-11-11, Playtest-Wert, keine WA-Messung). In WA-Aufnahmen dauert das Einholen eines rund
   * 300 px langen Seils etwa zwei Sekunden → rund 150 px/s = 2,5 px/Takt.
   */
  kletterTempo: 2.5,
  /** Kürzeste Seillänge (px). Fassung 2: **Annäherung**, eine Figurenhöhe (20 px); Fassung 3: 18 (Festlegung des Auftraggebers 2026-11-11, Playtest-Wert, keine WA-Messung); kürzer hinge die Figur im Anker. */
  minLaenge: 20,
  /**
   * Schwung mit links/rechts: Beschleunigung entlang der Kreisbahn (px/Takt²). Fassung 2: **Annäherung** 0,05 ≈ 12 % der
   * Schwerkraft; damit baut sich wie in WA erst nach zwei, drei Schwüngen ein Überschlag auf. Nicht belegt.
   */
  schwung: 0.05,
  /**
   * Luftwiderstand am Seil: Faktor auf das Tempo je Takt. Fassung 2: **Annäherung**; Fassung 3: 0,99995 (Festlegung des Auftraggebers 2026-11-11, Playtest-Wert, keine WA-Messung). WA kennt eine „rope friction/drag" (die
   * Option Unrestrict Rope „reduces" sie), ihr Wert ist nicht belegt. 0,999 = rund 6 % Verlust je Sekunde.
   */
  reibung: 0.999,
  /**
   * Prallt die Figur am Seil gegen Gelände, wird der Tempoanteil in die Wand mit −abprall zurückgeworfen.
   * Fassung 2: **Annäherung**; Fassung 3: 0,25 (Festlegung des Auftraggebers 2026-11-11, Playtest-Wert, keine WA-Messung) (wie der Motor seitlich mit −0,2 dämpft, etwas lebhafter). Am Boden: kein Abprall, Bodenreibung.
   */
  abprall: 0.3,
  /** Bodenreibung, solange die Figur am Seil auf dem Boden schleift. **Abgeleitet**: wie `CharacterSystem` (0,86). */
  bodenReibung: 0.86,
  /** Höchstens so viele Knicke (um Geländeecken gewickelt) je Seil. Schutzgrenze, keine Spielregel. */
  maxKnicke: 32,
  /** Höchstens so viele neue Knicke je Takt (schneller Schwung um mehrere Kanten). Schutzgrenze. */
  knickeJeTakt: 4,
  /** Abtastung beim Knicken: so viele Zwischenlagen zwischen alter und neuer Figurposition. */
  knickAbtastung: 8,
  /** Eine Seilabsicht (Schwung/Länge) verfällt nach so vielen Takten ohne Erneuerung (wie `BEWEGUNG.haltedauer`). */
  haltedauer: 90,
  /** Der Client erneuert die gehaltene Absicht in diesem Abstand (ms). */
  erneuernMs: 500,
  /** Server: höchstens so viele Seil-Nachrichten je Sekunde und Sitz (Stoß ebenso groß). */
  nachrichtenProSekunde: 20,
  /**
   * Waffen vom Seil: alles außer diesen Kategorien. **Belegt** (Auftrag): „Jede Waffe außer Nahkampf und
   * Selbstmordbomber". Selbstmordbomber gibt es im Katalog nicht; Nahkampf ist `melee`.
   */
  verboteneKategorien: Object.freeze(['melee']),
});

/**
 * Werte der Seilfassung 3 (`SEIL_FEIN`, Standard): wie Fassung 2, nur diese fünf Werte sind gesetzt. Herkunft: **Festlegung
 * des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**. `standardStufe` 5 ist vom Auftraggeber bestätigt
 * (unverändert); `schwerkraft` bleibt 0,42.
 *
 * Hinweis `reibung` 0,99995: nahezu reibungsfrei (rund 0,3 % Verlust je Sekunde statt 6 %); das Pendel verliert kaum
 * Energie. Stabilität per Simulation geprüft (`tests/seil.test.js`).
 */
export const SEIL_FASSUNG_3 = Object.freeze({
  ...SEIL_FASSUNG_2,
  /** Ein-/Ausfahren (px/Takt). **Festlegung des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**; Fassung 2: 2,5. */
  kletterTempo: 3.2,
  /** Kürzeste Seillänge (px). **Festlegung des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**; Fassung 2: 20. */
  minLaenge: 18,
  /** Schwung links/rechts (px/Takt²). **Festlegung des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**; Fassung 2: 0,05. */
  schwung: 0.07,
  /** Faktor auf das Tempo je Takt. **Festlegung des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**; Fassung 2: 0,999. */
  reibung: 0.99995,
  /** Rückprall an Wänden. **Festlegung des Auftraggebers 2026-11-11 (Playtest-Wert, keine WA-Messung)**; Fassung 2: 0,3. */
  abprall: 0.25,
});

/** Wertetabellen je Fassung (nur Fassungen mit Seil). */
export const SEIL_WERTE = Object.freeze({ [SEIL_NINJA]: SEIL_FASSUNG_2, [SEIL_FEIN]: SEIL_FASSUNG_3 });

/** Der Standard neuer Partien (Fassung 3); Werte, die in allen Fassungen gleich sind (Winkel, Waffen, Takt), liest man hier. */
export const SEIL = SEIL_FASSUNG_3;

/** Wertetabelle einer Fassung; unbekannt/ALT → Standard (ohne Seil wird sie nie benutzt). */
export function seilWerte(fassung) {
  return SEIL_WERTE[fassung] ?? SEIL_FASSUNG_3;
}

/** Länge, Schüsse und Stufe einer Kraftstufe (1–5, unbekannt = Standard). */
export function seilStufe(stufe = SEIL.standardStufe) {
  const s = Number.isInteger(stufe) && stufe >= 1 && stufe <= SEIL.laengen.length ? stufe : SEIL.standardStufe;
  return { stufe: s, laenge: SEIL.laengen[s - 1], schuesse: SEIL.schuesse[s - 1] };
}
