/**
 * Erreichbarkeitsprüfung: Kann jede Figur jeden Gegner erreichen?
 *
 * ## Warum diese Datei existiert
 *
 * Der autonome Generator erzeugt 2D-Masken mit Höhlen und — bei hoher
 * Inseligkeit — getrennte Landmassen. Das ist gewollt. Aber es gibt einen
 * Fall, der das Spiel kaputt macht, ohne dass es auffällt:
 *
 *   **Eine Figur steht auf einer Insel, die niemand erreichen kann.**
 *
 * Sie kann nicht beschossen werden (keine Sichtlinie über eine zu große
 * Lücke), und sie kann nicht hinüberkommen. Die Partie wird dann nicht
 * verloren, sondern **läuft aus** — bis die Rundengrenze greift und der Sieger
 * nach übrigem Leben bestimmt wird. Ein Spieler, der 40 Minuten auf einer
 * unerreichbaren Insel sitzt, hat nicht gespielt.
 *
 * ## Was geprüft wird
 *
 * Die Landmasse wird in **zusammenhängende Flächen** zerlegt (Flutfüllung über
 * die 4er-Nachbarschaft). Für jede Figur wird festgestellt, auf welcher Fläche
 * sie steht. Dann gilt:
 *
 *   **Jede Fläche, auf der eine Figur steht, muss ein Projektil erreichen.**
 *
 * ## Warum nicht „alle Flächen müssen verbunden sein"
 *
 * Ein durchgehender Landweg ist NICHT nötig — Artillerie schießt über Lücken.
 * Eine Insel in Schussweite ist vollwertiger Teil des Spiels. Geprüft wird
 * deshalb nicht „erreichbar zu Fuß", sondern **„erreichbar überhaupt"**:
 * Entweder über einen Landweg ODER über eine Flugbahn.
 *
 * ## Die Flugbahnprüfung
 *
 * Eine Wurfparabel von A nach B existiert, wenn B innerhalb der maximalen
 * Wurfweite liegt. Die Weite hängt von der Abschussgeschwindigkeit ab; sie ist
 * hier aus der stärksten Waffe des Spiels abgeleitet — nicht geraten.
 *
 * @module erreichbarkeit
 */

/**
 * Zerlegt die Landmasse in zusammenhängende Flächen.
 *
 * Die 4er-Nachbarschaft (nicht 8er): Über eine Diagonale kann eine Figur nicht
 * laufen, und ein Projektil fliegt ohnehin frei. Ein 8er-Zusammenhang würde
 * Flächen verschmelzen, die praktisch getrennt sind.
 *
 * @param {Uint8Array} bitmap
 * @param {number} width
 * @param {number} height
 * @returns {Int32Array} Flächennummer je Pixel, -1 für Luft
 */
export function findeFlaechen(bitmap, width, height) {
  const flaeche = new Int32Array(width * height).fill(-1);
  const groessen = [];
  let naechste = 0;

  for (let start = 0; start < bitmap.length; start += 1) {
    if (!bitmap[start] || flaeche[start] !== -1) continue;

    const nummer = naechste;
    naechste += 1;
    let groesse = 0;
    const stapel = [start];
    flaeche[start] = nummer;

    while (stapel.length > 0) {
      const p = stapel.pop();
      groesse += 1;
      const x = p % width;
      const y = (p - x) / width;

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const q = ny * width + nx;
        if (!bitmap[q] || flaeche[q] !== -1) continue;
        flaeche[q] = nummer;
        stapel.push(q);
      }
    }
    groessen.push(groesse);
  }

  return { flaeche, groessen, anzahl: naechste };
}

/**
 * Die größte Wurfweite in Pixeln.
 *
 * ## Herleitung, nicht Schätzung
 *
 * Abgeleitet aus den Werten, die der Motor für Projektile nutzt:
 *
 *   `POWER_TO_SPEED` — Kraft in Geschwindigkeit
 *   `MAX_POWER` — die höchste Kraft
 *   die Schwerkraft des Projektilsystems
 *
 * Bei waagerechtem Schuss ist die Wurfweite `v²·sin(2α)/g`; maximal bei 45°.
 * Der Wert dient als **Grenze für „überhaupt erreichbar"**, nicht als
 * Zielgenauigkeit — deshalb ist er bewusst großzügig.
 *
 * @param {object} werte
 * @returns {number} Pixel
 */
export function maxWurfweite({ powerToSpeed, maxPower, gravity, windReserve = 1.15 }) {
  const v = maxPower * powerToSpeed;
  const ohneWind = (v * v) / gravity;
  /*
   * Ein Zuschlag für den Wind: Ein Rückenwind trägt weiter als die reine
   * Wurfparabel. 15 % sind eine Reserve, keine Messung — sie verhindert, dass
   * eine Grenzinsel fälschlich als unerreichbar gilt.
   */
  return ohneWind * windReserve;
}

/**
 * Prüft, ob alle Flächen mit Figuren erreichbar sind.
 *
 * ## Die Regel
 *
 * Eine Fläche ist erreichbar, wenn sie
 *
 *   (a) dieselbe ist wie die Mehrheit der übrigen Figuren (Landweg), ODER
 *   (b) innerhalb der maximalen Wurfweite einer anderen Figur liegt.
 *
 * Trifft beides nicht zu, sitzt dort eine Figur fest.
 *
 * @param {object} optionen
 * @param {Uint8Array} optionen.bitmap
 * @param {number} optionen.width
 * @param {number} optionen.height
 * @param {{x:number,y:number}[]} optionen.figuren - Standpositionen
 * @param {number} optionen.wurfweite - aus `maxWurfweite`
 * @returns {{ok:boolean, grund:string, flaechen:object}}
 */
export function pruefeErreichbarkeit({ bitmap, width, height, figuren, wurfweite }) {
  if (!figuren || figuren.length === 0) {
    return { ok: true, grund: '', flaechen: null };
  }

  const flaechen = findeFlaechen(bitmap, width, height);

  /** Die Fläche an einer Position — notfalls die nächstgelegene feste. */
  const flaecheBei = (figur) => {
    const { x, y } = figur;
    const px = Math.max(0, Math.min(width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(height - 1, Math.round(y)));
    if (flaechen.flaeche[py * width + px] !== -1) {
      return flaechen.flaeche[py * width + px];
    }
    // Nach unten suchen — die Figur steht auf dem Boden.
    for (let ny = py; ny < height; ny += 1) {
      if (flaechen.flaeche[ny * width + px] !== -1) {
        return flaechen.flaeche[ny * width + px];
      }
    }
    return -1;
  };

  const zugehoerig = figuren.map(flaecheBei);

  /*
   * Die Hauptfläche: Wo die meisten Figuren stehen. Das ist die Landmasse, auf
   * der gespielt wird — nicht unbedingt die größte Karte, aber die, auf der
   * das Geschehen beginnt.
   */
  const zaehler = new Map();
  for (const f of zugehoerig) {
    if (f === -1) continue;
    zaehler.set(f, (zaehler.get(f) ?? 0) + 1);
  }
  let haupt = -1;
  let beste = 0;
  for (const [f, n] of zaehler) {
    if (n > beste) { beste = n; haupt = f; }
  }

  /*
   * Jede Figur prüfen: Sitzt sie auf der Hauptfläche, oder ist diese Fläche
   * innerhalb der Wurfweite erreichbar?
   */
  const unerreichbar = [];

  for (let i = 0; i < figuren.length; i += 1) {
    const eigene = zugehoerig[i];
    if (eigene === haupt || eigene === -1) continue;

    // Ist die Fläche der Figur von irgendeiner anderen aus in Wurfweite?
    let erreichbar = false;
    for (let j = 0; j < figuren.length; j += 1) {
      if (i === j) continue;
      if (zugehoerig[j] !== haupt) continue;

      const dx = figuren[i].x - figuren[j].x;
      const dy = figuren[i].y - figuren[j].y;
      if (Math.sqrt(dx * dx + dy * dy) <= wurfweite) {
        erreichbar = true;
        break;
      }
    }

    if (!erreichbar) unerreichbar.push(i);
  }

  if (unerreichbar.length > 0) {
    return {
      ok: false,
      grund: `${unerreichbar.length} Figur(en) auf einer unerreichbaren Fläche`,
      flaechen,
    };
  }
  return { ok: true, grund: '', flaechen };
}

export default pruefeErreichbarkeit;
