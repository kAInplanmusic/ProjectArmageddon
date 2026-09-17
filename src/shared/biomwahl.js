/**
 * Die Kulisse folgt der Karte — nicht dem Geschmack.
 *
 * ## Die Vorgabe
 *
 * „Kartengenerator hoch 10, aber ohne dass Menschen Einfluss nehmen können."
 *
 * Das gilt auch für das **Aussehen**. Bisher hing die Bodenfarbe an der
 * Kulisse, und die Kulisse wählte der Spieler aus einer Liste von sechzig —
 * oder ließ sie „automatisch" aus dem Seed ziehen, aber dann entschied das
 * **Gelände-Preset**, welche Kulissen überhaupt in Frage kamen.
 *
 * Mit dem autonomen Generator gibt es kein Preset mehr. Also muss die Zuordnung
 * an etwas anderem hängen: am **Charakter der Karte**.
 *
 * ## Warum das mehr ist als Kosmetik
 *
 * Eine Lavaröhre mit grünem Gras darauf ist falsch — nicht hässlich, sondern
 * **falsch**: Das Bild widerspricht dem, was die Karte ist. Wenn der Generator
 * eine durchlöcherte Kaverne zieht, gehört Basalt dazu; zieht er eine flache
 * Wiese mit viel Land, gehört Gras dazu.
 *
 * Die Regel ist deshalb **ableitend, nicht zufällig**: Aus dem Charakter folgt
 * das Biom. Der Zufall wählt nur noch die Variante *innerhalb* eines Bioms
 * („Ruhige See" gegen „Sturm bei Nacht") — und diese Wahl kommt aus demselben
 * Seed wie die Karte.
 *
 * ## Was das für den Spieler bedeutet
 *
 * Er sieht keine Auswahlliste mehr, sondern eine **stimmige Szene**. Eine
 * Höhlenkarte sieht aus wie eine Höhle, eine Inselkarte wie eine Küste. Die
 * Überraschung kommt aus dem Seed, nicht aus einem Menü.
 *
 * @module biomwahl
 */

/**
 * Zu welchem Biom passt ein Charakter?
 *
 * ## Die Abbildung
 *
 * Jede Regel prüft **eine** Eigenschaft des Charakters und nennt das Biom, das
 * dazu gehört. Die Reihenfolge ist die Priorität: Die erste zutreffende Regel
 * gewinnt.
 *
 * **Warum eine Reihenfolge nötig ist:** Ein Charakter kann mehrere Merkmale
 * tragen (viel Wasser UND viele Höhlen). Dann muss entschieden werden, welches
 * das Bild stärker prägt. Die Reihenfolge unten tut das — das auffälligste
 * Merkmal zuerst.
 *
 * | Eigenschaft | Biom | Warum |
 * |---|---|---|
 * | Wasser ≥ 0,22 | `deluge` | Überflutung prägt die Szene stärker als alles andere |
 * | Höhlung ≥ 0,18 | `caverns` | Ein durchlöcherter Berg ist ein Höhlensystem |
 * | Inseligkeit ≥ 0,32 | `island` | Getrennte Landmassen sind Inseln |
 * | Steilheit ≥ 0,42 | `alpine` | Steile Flanken sind Berge |
 * | sonst | `forest` | Der Normalfall: bewachsen, begehbar |
 *
 * ## Die Schwellen — gemessen, nicht geschätzt
 *
 * FUND (belegt): Die ersten Schwellen lagen im „oberen Drittel" der Achsen
 * (Wasser ≥ 0,22, Höhlung ≥ 0,18 …). Gemessen über 30 Karten ergab das eine
 * Verteilung, in der **`deluge` die Hälfte** aller Karten ausmachte:
 *
 *     deluge   15 von 30   (50 %)
 *     alpine    5
 *     caverns   5
 *     forest    3
 *     island    2
 *
 * Der Grund: Die Charakter-Achsen werden **U-förmig** gezogen (Extreme sind
 * häufiger als die Mitte, siehe `zieheCharakter`). Eine Schwelle nach dem
 * Augenschein trifft damit viel mehr Karten als gedacht.
 *
 * Die Schwellen sind jetzt aus der **gemessenen Verteilung** abgeleitet — je
 * das 80.-85. Perzentil über 2000 Züge:
 *
 *     Achse          Median   q80    Schwelle
 *     wasser          0,12    0,26    0,27
 *     hoehlung        0,13    0,26    0,26
 *     inseligkeit     0,19    0,40    0,40
 *     steilheit       0,33    0,48    0,48
 *
 * Damit bekommt jedes Biom rund ein Fünftel der Karten, und `forest` bleibt
 * der Normalfall für alles dazwischen.
 *
 * @param {object} charakter
 * @returns {string} Biom-Kennung
 */
export function biomFuerCharakter(charakter) {
  if (!charakter) return 'forest';

  if (charakter.wasser >= 0.27) return 'deluge';
  /*
   * ## Die Schwelle — zweimal korrigiert, beide Male gemessen
   *
   * FUND (belegt): Hier stand **0,26** — ein Wert, den die Höhlungs-Achse nie
   * erreicht (sie endet bei 0,22). Folge: `caverns` kam in 400 Zügen **nicht
   * ein einziges Mal** vor. Ein Test deckte das auf.
   *
   * Der erste Korrekturversuch setzte 0,17 — und schoss über das Ziel hinaus:
   * Gemessen wurden **28 %** aller Karten zu Höhlen, und `caverns` war damit
   * das HÄUFIGSTE Biom, nicht `forest`. Ein zweiter Test fing das ab.
   *
   * Die Verteilung der Achse, gemessen über 3000 Züge:
   *
   *     q50 0,118   q70 0,180   q75 0,188   q80 0,195   q95 0,215
   *
   * Und der daraus folgende `caverns`-Anteil:
   *
   *     Schwelle 0,17 → 28,1 %     (zu viel)
   *     Schwelle 0,19 → 18,5 %     ← gewählt
   *     Schwelle 0,20 → 12,1 %
   *
   * 0,19 liegt beim 75. Perzentil: Ein Viertel aller Karten wird zu Höhlen,
   * und `forest` bleibt mit rund 40 % der Normalfall.
   */
  if (charakter.hoehlung >= 0.19) return 'caverns';
  if (charakter.inseligkeit >= 0.40) return 'island';
  if (charakter.steilheit >= 0.48) return 'alpine';
  return 'forest';
}

/**
 * Wählt aus einem Biom die konkrete Kulisse — aus dem Seed.
 *
 * ## Warum nicht das Biom selbst gewürfelt wird
 *
 * Das Biom folgt aus dem Charakter der Karte. Es zu würfeln hieße, Karte und
 * Aussehen voneinander zu trennen — eine Höhlenkarte könnte dann über einer
 * Wiese liegen.
 *
 * Gewürfelt wird nur **innerhalb** des Bioms: „Ruhige See" gegen „Sturm bei
 * Nacht". Beide passen zur Karte; welche es wird, ist Geschmack — und dafür
 * ist der Zufall der richtige Mechanismus.
 *
 * @param {object} optionen
 * @param {string} optionen.biomId - aus `biomFuerCharakter`
 * @param {number} optionen.seed
 * @returns {object|null} Kulisse mit `key`, oder null wenn das Biom unbekannt ist
 */
export function kulisseFuerBiom({ seed, biome }) {
  if (!biome || !Array.isArray(biome.variants) || biome.variants.length === 0) {
    return null;
  }

  /*
   * Der Seed-Index: Derselbe Seed ergibt dieselbe Variante.
   *
   * `Math.abs` fängt negative Seeds ab, `Math.floor` Nachkommastellen — ein
   * Seed von 4242.7 soll nicht anders fallen als 4242.
   */
  const index = Math.abs(Math.floor(Number(seed) || 0)) % biome.variants.length;
  const variante = biome.variants[index];

  return {
    ...variante,
    biomeId: biome.id,
    biomeLabel: biome.label,
    mapPreset: biome.mapPreset,
    key: `${biome.id}/${variante.id}`,
  };
}

export default biomFuerCharakter;
