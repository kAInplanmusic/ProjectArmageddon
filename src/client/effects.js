/**
 * Partikel und transiente Effekte — die Zustandslogik des Renderers.
 *
 * ## Warum diese Datei existiert
 *
 * Ein Audit stellte fest: Der Renderer (`client/renderer.js`, 1119 Zeilen) hat
 * **keinen Unit-Test** — und zwar nicht aus Nachlässigkeit, sondern weil er in
 * `node --test` nicht ladbar ist: Er nutzt `import.meta.glob`
 * (Vite-spezifisch) für die Kulissenbilder.
 *
 * Damit war die Partikel- und Effektlogik nur mittelbar über E2E prüfbar. Ein
 * Fehler darin — ein Speicherleck durch nie aufgeräumte Partikel, eine falsche
 * Lebensdauer, ein fehlendes `restore` — fiele nur bei einem zufälligen
 * Volltreffer auf.
 *
 * ## Die Trennung
 *
 * Hier steht **nur die Zustandslogik**: Wie entsteht ein Partikel, wie altert
 * er, wann verschwindet er. Das **Zeichnen** bleibt im Renderer — es braucht
 * einen Canvas, und ein Test dafür wäre ein Pixel-Vergleich (brüchig und ohne
 * Aussage über die Richtigkeit).
 *
 * Diese Trennung folgt dem Muster, das das Projekt bereits an zwei Stellen
 * anwendet: `terrainBaker.js` (Rechenkern getrennt vom Zeichnen) und
 * `shotPrediction.js` (Vorhersage getrennt vom Renderer).
 *
 * ## Determinismus
 *
 * Die Partikel entstehen aus einem Zähler, nicht aus Zufall: `i / count` und
 * `i % 5` ergeben für denselben Radius dieselbe Wolke. Ein Zufallswert wäre im
 * Renderer unproblematisch (er ist nicht Teil der Simulation), aber die
 * Vorhersagbarkeit macht den Zustand prüfbar — und das ist hier mehr wert.
 *
 * @module effects
 */

/** Obergrenze je Explosion: Ein großer Krater darf nicht beliebig kosten. */
export const MAX_PARTIKEL = 26;

/** Lebensdauer-Abnahme je Bild (1,0 = frisch). */
export const PARTIKEL_ABNAHME = 0.035;

/** Fallbeschleunigung je Bild. */
export const PARTIKEL_GRAVITATION = 0.18;

/** Farben der Splitter — aus der Palette des Spiels. */
const PARTIKEL_FARBEN = Object.freeze(['#f4a261', '#ffd166', '#e76f51']);

/**
 * Erzeugt die Splitterwolke einer Explosion.
 *
 * Die Anzahl wächst mit dem Radius (ein größerer Krater zeigt mehr Splitter),
 * bleibt aber bei `MAX_PARTIKEL` gedeckelt: Sonst kostete eine Explosion auf
 * großer Fläche beliebig viel Rechenzeit.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {Array<{x:number,y:number,vx:number,vy:number,life:number,radius:number,color:string}>}
 *   Eine NEUE Liste — die vorhandenen Partikel bleiben unberührt.
 */
export function erzeugePartikel(x, y, radius) {
  /*
   * Der Radius wird abgesichert, nicht nur mit `?? 0` belegt.
   *
   * FUND (belegt, im Test gefunden): `radius ?? 0` fängt `NaN` NICHT ab — es
   * ist weder `null` noch `undefined`. Dann ergibt `8 + Math.round(NaN / 2)`
   * ein `NaN`, die Schleife läuft nie, und es entsteht eine LEERE Wolke: Die
   * Explosion bliebe ohne Splitter, ohne dass jemand einen Fehler sieht.
   *
   * Der ursprüngliche Code im Renderer hatte denselben Fehler; er wurde beim
   * Herausziehen mitgenommen und hier behoben.
   */
  const sichererRadius = Number.isFinite(radius) ? radius : 0;
  const anzahl = Math.min(MAX_PARTIKEL, 8 + Math.round(Math.max(0, sichererRadius) / 2));
  const liste = [];

  for (let i = 0; i < anzahl; i += 1) {
    // Gleichmäßig im Kreis verteilt — nicht zufällig, damit die Wolke
    // reproduzierbar ist (siehe Modulkopf).
    const winkel = (i / anzahl) * Math.PI * 2;
    const tempo = 1 + (i % 5) * 0.6;

    liste.push({
      x,
      y,
      vx: Math.cos(winkel) * tempo,
      vy: Math.sin(winkel) * tempo - 0.6,
      life: 1,
      radius: 2 + (i % 3),
      color: PARTIKEL_FARBEN[i % PARTIKEL_FARBEN.length],
    });
  }

  return liste;
}

/**
 * Ein Zeitschritt für die Partikel.
 *
 * Bewegt sie, lässt sie fallen und entfernt die abgelaufenen. Ohne das
 * Aufräumen wüchse die Liste mit jeder Explosion — ein Speicherleck, das erst
 * nach vielen Explosionen auffiele.
 *
 * @param {Array} partikel - wird NICHT verändert
 * @returns {Array} eine neue Liste der überlebenden Partikel
 */
export function schreitePartikelFort(partikel) {
  const ueberlebende = [];

  for (const p of partikel) {
    const neu = {
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + PARTIKEL_GRAVITATION,
      life: p.life - PARTIKEL_ABNAHME,
    };
    if (neu.life > 0) ueberlebende.push(neu);
  }

  return ueberlebende;
}

/**
 * Legt einen Strahl an (Soforttreffer-Sichtbarkeit).
 *
 * @returns {object} der neue Effekt
 */
export function erzeugeStrahl(fromX, fromY, toX, toY, { hit = false, color = '#ffe066' } = {}) {
  return {
    kind: 'beam', fromX, fromY, toX, toY, hit, color,
    life: 1, decay: 0.14,
  };
}

/**
 * Legt einen Blitz an (Einschlag, Explosion).
 *
 * @returns {object} der neue Effekt
 */
export function erzeugeBlitz(x, y, radius, { color = '#f4a261' } = {}) {
  return { kind: 'flash', x, y, radius, color, life: 1, decay: 0.09 };
}

/** Ein Zeitschritt für die Effekte — altert sie und räumt die abgelaufenen weg. */
export function schreiteEffekteFort(effekte) {
  const ueberlebende = [];
  for (const e of effekte) {
    const neu = { ...e, life: e.life - e.decay };
    if (neu.life > 0) ueberlebende.push(neu);
  }
  return ueberlebende;
}

/**
 * Wie viele Bilder ein Effekt noch lebt (für Anzeige-Tests).
 *
 * @returns {number} Anzahl der Bilder bis zum Verschwinden
 */
export function restlicheBilder(effekt) {
  if (!effekt || !(effekt.decay > 0)) return 0;
  return Math.ceil(effekt.life / effekt.decay);
}
