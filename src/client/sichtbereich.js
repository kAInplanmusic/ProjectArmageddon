/**
 * Sicherer Bereich: Wo darf eine Figur (und ihr Schild) stehen, ohne vom HUD
 * verdeckt zu werden?
 *
 * ## Warum diese Datei existiert
 *
 * FUND (Abnahme 2026-10-15, `d1280-pirates-machina.png`): Die Karte füllt das
 * Fenster, das HUD liegt darüber. Die Figur ganz links saß unter Spielerliste
 * und Figurenkarte, Schilder von Figuren auf Gipfeln verschwanden unter der
 * Kopfleiste. Die Ränder des HUD sind aber keine Konstanten — sie hängen von
 * Fenstergröße, Touch (Aktionstasten), Hochformat und der Länge der Listen ab.
 *
 * Darum gibt es hier **reine Rechnung** auf gemessenen Rechtecken (`{x,y,b,h}`
 * in Bildschirmpixeln). Das Messen der DOM-Elemente macht `hudAusweichen.js`.
 *
 * Alles ist reine Darstellung: Es liest Positionen und ändert weder Engine noch
 * Zustands-Hash noch Replay.
 *
 * @module sichtbereich
 */

/**
 * Ob sich zwei Rechtecke `{x,y,b,h}` überlappen (Berührung zählt nicht).
 */
export function ueberlappen(a, b) {
  return a.x < b.x + b.b && b.x < a.x + a.b && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Der sichere Bereich: das Fenster ohne Kopfleiste oben und Bedienleiste unten.
 *
 * Seitliche Panels (Spielerliste, Protokoll) zählen NICHT als Rand: Sie nähmen
 * auf kleinen Fenstern die halbe Breite. Für sie gilt das Ausweichen
 * (`ueberdecktVon`): Sie werden durchscheinend, wo eine Figur dahinter steht.
 *
 * Ein Rechteck gehört zum oberen Rand, wenn seine Mitte im oberen Fünftel liegt,
 * und zum unteren, wenn sie im unteren Fünftel liegt. Ein Element dazwischen (Panel
 * in Fenstermitte) verändert den Bereich nicht.
 *
 * @param {{b:number,h:number}} schirm Fenstergröße
 * @param {Array<{x:number,y:number,b:number,h:number}>} raender gemessene Rechtecke
 * @returns {{x0:number,y0:number,x1:number,y1:number}}
 */
export function sichererBereich(schirm, raender = []) {
  let y0 = 0;
  let y1 = schirm.h;
  for (const r of raender) {
    if (!(r.b > 0) || !(r.h > 0)) continue;
    const mitte = r.y + r.h / 2;
    if (mitte < schirm.h * 0.2) y0 = Math.max(y0, r.y + r.h);
    else if (mitte > schirm.h * 0.8) y1 = Math.min(y1, r.y);
  }
  // Ein HUD, das mehr als 70 % der Höhe beansprucht, würde jede Platzierung
  // unmöglich machen — dann gilt der Bereich als „ganzes Fenster".
  if (y1 - y0 < schirm.h * 0.3) return { x0: 0, y0: 0, x1: schirm.b, y1: schirm.h };
  return { x0: 0, y0, x1: schirm.b, y1 };
}

/**
 * Platziert ein Namensschild so, dass es im sicheren Bereich liegt.
 *
 * Bevorzugt steht das Schild über der Figur. Reicht dort der Platz nicht (Figur
 * auf einem Gipfel, Schild unter der Kopfleiste), klappt es **unter die Füße**
 * der Figur. Geht auch das nicht, wird es in den Bereich geschoben. Seitlich
 * wird es immer begrenzt.
 *
 * Alle Maße in derselben Einheit (Kartenpixel); `s` ist die Schildskala.
 *
 * @param {object} p
 * @param {number} p.x Mitte der Figur
 * @param {number} p.anker Ankerlinie des Schilds über dem Kopf (Unterkante + 2·s)
 * @param {number} p.fuss y der Füße
 * @param {number} p.breite Schildbreite (unskaliert)
 * @param {number} p.s Skala des Schilds
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} grenzen sicherer Bereich
 * @returns {{x:number, anker:number, unten:boolean, verschoben:boolean}}
 */
export function platziereSchild({ x, anker, fuss, breite, s }, grenzen) {
  const aus = { x, anker, unten: false, verschoben: false };
  if (!grenzen) return aus;
  // Schild: von anker-22s (Oberkante) bis anker-2s; der Pfeil ragt 8s darüber.
  const OBEN = 30;
  const UNTEN = 2;
  const halb = (breite * s) / 2;

  if (grenzen.x1 - grenzen.x0 > 2 * halb) {
    const xk = Math.max(grenzen.x0 + halb, Math.min(grenzen.x1 - halb, x));
    if (xk !== x) { aus.x = xk; aus.verschoben = true; }
  }

  const oben = anker - OBEN * s;
  const unten = anker - UNTEN * s;
  if (oben >= grenzen.y0 && unten <= grenzen.y1) return aus;

  // Unter die Füße klappen (ohne Pfeil: Oberkante des Schilds = fuss + 4).
  const untenAnker = fuss + 4 + 22 * s;
  if (oben < grenzen.y0 && untenAnker - UNTEN * s <= grenzen.y1) {
    return { ...aus, anker: untenAnker, unten: true, verschoben: true };
  }
  // Sonst in den Bereich schieben.
  if (oben < grenzen.y0) return { ...aus, anker: grenzen.y0 + OBEN * s, verschoben: true };
  return { ...aus, anker: grenzen.y1 + UNTEN * s, verschoben: true };
}

/**
 * Rechnet einen Bereich in Bildschirmpixeln in Kartenpixel um.
 *
 * @param {{x0:number,y0:number,x1:number,y1:number}} bereich
 * @param {{skalierung:number,versatzX:number,versatzY:number}} t `Camera#transformation()`
 */
export function bereichInKarte(bereich, t) {
  return {
    x0: (bereich.x0 - t.versatzX) / t.skalierung,
    y0: (bereich.y0 - t.versatzY) / t.skalierung,
    x1: (bereich.x1 - t.versatzX) / t.skalierung,
    y1: (bereich.y1 - t.versatzY) / t.skalierung,
  };
}

/**
 * Das Bildschirmrechteck einer Figur (Sprite samt Schild), `{x,y,b,h}`.
 *
 * @param {{x:number,y:number}} figur Position in Kartenpixeln
 * @param {{skalierung:number,versatzX:number,versatzY:number}} t Kameratransformation
 * @param {{halbBreite:number, oben:number, unten:number}} masse Maße in Kartenpixeln
 *   (`oben`: Abstand Kopf+Schild über `figur.y`, `unten`: Abstand Füße darunter)
 */
export function figurRechteck(figur, t, masse) {
  const x = figur.x * t.skalierung + t.versatzX;
  const yOben = (figur.y - masse.oben) * t.skalierung + t.versatzY;
  const yUnten = (figur.y + masse.unten) * t.skalierung + t.versatzY;
  return { x: x - masse.halbBreite * t.skalierung, y: yOben, b: 2 * masse.halbBreite * t.skalierung, h: yUnten - yOben };
}

/**
 * Welche Panels verdecken eine Figur? Gibt die Indizes der Rechtecke zurück,
 * die sich mit mindestens einem Figurenrechteck überlappen.
 *
 * @param {Array<{x:number,y:number,b:number,h:number}>} panels
 * @param {Array<{x:number,y:number,b:number,h:number}>} figuren
 * @returns {number[]}
 */
export function ueberdecktVon(panels, figuren) {
  const treffer = [];
  panels.forEach((p, i) => {
    if (!(p.b > 0) || !(p.h > 0)) return;
    if (figuren.some(f => ueberlappen(p, f))) treffer.push(i);
  });
  return treffer;
}

/**
 * Wie weit muss die Ansicht nach unten rücken, damit die Köpfe unter der
 * Kopfleiste herausragen? Nur >= 0, gedeckelt auf `max`.
 *
 * Oberhalb der Karte liegt Himmel, deshalb darf die Ansicht dort ein Stück
 * „überscrollen". Nach unten ist das nicht nötig (dort deckt die Bedienleiste
 * ohnehin nur Boden).
 *
 * @param {number} hoechsterKopf kleinstes y (Bildschirm) aller lebenden Figuren
 * @param {number} sicherOben `y0` des sicheren Bereichs
 * @param {number} max größter erlaubter Schub
 */
export function schubNachUnten(hoechsterKopf, sicherOben, max) {
  if (!Number.isFinite(hoechsterKopf)) return 0;
  return Math.max(0, Math.min(max, sicherOben - hoechsterKopf));
}

/**
 * Seitliche Ränder für die Kamera: Wie viel vom Fenster verdecken Panels links
 * und rechts (Spielerliste, Figurenkarte)?
 *
 * Nur Panels, deren Mitte in der mittleren Höhenzone (20–80 %) liegt, und nur
 * solche am linken Drittel bzw. rechten Drittel zählen; Panels am unteren Rand
 * gehören zur Bedienleiste, mittige (Protokoll) bleiben Sache von `.hud-weicht`.
 * Jede Seite ist auf 30 % der Breite gedeckelt, damit nie das ganze Bild
 * als „verdeckt" gilt.
 *
 * @param {{b:number,h:number}} schirm
 * @param {Array<{x:number,y:number,b:number,h:number}>} panels
 * @returns {{links:number, rechts:number}}
 */
export function seitenRaender(schirm, panels = []) {
  let links = 0;
  let rechts = 0;
  for (const p of panels) {
    if (!(p.b > 0) || !(p.h > 0)) continue;
    const mx = p.x + p.b / 2;
    const my = p.y + p.h / 2;
    if (my < schirm.h * 0.2 || my > schirm.h * 0.8) continue;
    if (mx < schirm.b / 3) links = Math.max(links, p.x + p.b);
    else if (mx > (schirm.b * 2) / 3) rechts = Math.max(rechts, schirm.b - p.x);
  }
  const deckel = schirm.b * 0.3;
  return { links: Math.min(deckel, Math.max(0, links)), rechts: Math.min(deckel, Math.max(0, rechts)) };
}
