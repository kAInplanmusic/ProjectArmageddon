/**
 * Treffer- und Explosionsgefühl als RECHENKERN — ohne Canvas.
 *
 * ## Warum ein eigenes Modul
 *
 * `renderer.js` ist in `node --test` nicht ladbar (Vite-Importe,
 * `import.meta.glob`). Alles, was dort an Rückmeldung steckt, ist damit
 * ungeprüft. Das Haus hat für dieses Problem ein festes Muster: Die
 * ZUSTANDS- und GEOMETRIELOGIK liegt in einem reinen Modul, der Renderer führt
 * nur noch das Ergebnis aus. Genau so entstanden `effects.js` (Partikel,
 * Strahlen, Blitze) und `weaponAnimation.js` (Mündungsfeuer, Rückstoß,
 * Fadenkreuz). Dieses Modul setzt das Muster für die Rückmeldung fort, die dem
 * Spieler sagt, dass etwas GETROFFEN hat.
 *
 * ## Woher die Rückmeldung kommt — aus dem ZUSTAND, nicht aus dem Ereignis
 *
 * Bis hierher gab es genau eine Rückmeldung auf einen Treffer: Der Lebensbalken
 * war kürzer. Kein Zucken, kein Blitz, kein Klang (der Klang hing
 * allein am HITSCAN-Schuss, siehe `ereignisse.js`).
 *
 * Der naheliegende Weg wäre ein `damage`-Zweig in der Ereignistabelle. Er ist
 * gemessen der schlechtere:
 *
 *   1. `damage` ist GEDROSSELT (`GEDROSSELTE_EREIGNISARTEN`, Protokoll v4) —
 *      der Server schickt es höchstens alle 30 Takte je Figur. Ein
 *      Flächenschaden, der drei Figuren in einem Takt trifft, käme online als
 *      eine Meldung an. Die Rückmeldung wäre unvollständig, und zwar genau dann,
 *      wenn am meisten passiert.
 *   2. `damage` meldet im großen Match JEDEN Takt (gemessen 15092 Ereignisse in
 *      30 s bei 40 Figuren, `docs/ereignis-info-gehalt.md`). Eine Rückmeldung
 *      daran wäre ein Dauerzustand — dieselbe Falle, die schon beim Klang
 *      benannt und vermieden wurde.
 *   3. Die Änderung läge in `src/client/ereignisse.js`, einer Datei, die dieser
 *      Zug nicht besitzt.
 *
 * Der Zustand dagegen trägt die Wahrheit in beiden Betriebsarten: Lokal liefert
 * `stateSnapshot.js` die Gesundheit je Figur, online kommt sie mit dem Snapshot
 * (20 Hz). Ein Treffer wird deshalb als ABSINKEN der Gesundheit erkannt — und
 * zwar je Figur, also auch für drei Betroffene eines Flächenangriffs.
 *
 * Die Kehrseite ist benannt: Aus dem Zustand ist die RICHTUNG des Treffers
 * nicht bekannt (der Snapshot führt keine Einschlagstelle je Figur). Das Zucken
 * ist deshalb ein Ausschlag mit wechselndem Vorzeichen, keine gerichtete
 * Rückstoßfahrt. Was fehlt, wird nicht erfunden.
 *
 * ## Determinismus
 *
 * Kein `Math.random`, kein `performance.now`: Alles entsteht aus dem Zustand,
 * dem Bildzähler des Renderers und dem Index. Dieselbe Szene ergibt damit
 * dieselbe Wolke, dasselbe Zucken und denselben Ruck — das ist prüfbar, und
 * genau das braucht ein Test.
 *
 * @module gefuehl
 */

/** Obergrenze für einen Zahlenwert auf [0, 1]. */
const begrenze01 = wert => Math.max(0, Math.min(1, Number.isFinite(wert) ? wert : 0));

/* ======================================================================
 * 1. Treffer erkennen
 * ====================================================================== */

/**
 * Wie lange eine Treffermarke lebt — in Bildern, als Zweierpotenz.
 *
 * Die Alterung ist `life - decay` mit `decay = 1/BILDER`. Bei 6 wäre `1/6`
 * periodisch: die Marke lebte ein Bild länger als angekündigt (dieselbe Falle,
 * die in `weaponAnimation.js` dokumentiert ist). 16 ist exakt darstellbar.
 */
export const TREFFER_BILDER = 16;

/** Größter Radius des Trefferrings (px). Kleine Treffer bekommen einen kleinen. */
export const TREFFER_RING_MAX = 20;

/** Größter Zuck-Ausschlag der Figur (px) — die Figur wackelt, sie wandert nicht. */
export const TREFFER_ZUCKEN_MAX = 3;

/**
 * Liest die Gesundheit je Figur und meldet jedes ABSINKEN als Treffer.
 *
 * Bewusst KEIN Treffer ist:
 *
 *   - die erste Beobachtung einer Figur (sie ist noch nicht verglichen),
 *   - ein Ansteigen (Heilung, Rundenwechsel, Wiederbelebung),
 *   - eine unbekannte oder fehlende Zahl (ein leerer Snapshot ist kein Treffer).
 *
 * Die Liste der Figur-IDs wird WIEDERVERWENDET (das ECS vergibt IDs entfernter
 * Entities neu, `tests` im Haus halten das fest). Eine neue Figur auf einer
 * alten ID hat entweder mehr Leben als die alte (kein Treffer) oder weniger —
 * der zweite Fall sieht wie ein Treffer aus. Die Rückmeldung ist dann eine
 * Marke an einer Figur, die dort steht, wo sie steht: kein Zustandsfehler,
 * sondern eine kurze Anzeige zu viel. Der Aufwand, das sicher zu erkennen,
 * stünde in keinem Verhältnis — und die Alternative (nur nach Ereignissen
 * gehen) hätte die oben genannten Lücken.
 *
 * @param {Map<number, {health:number, maxHealth:number}>} bisher letzte Messung
 * @param {Array<{entityId:number, health:number, maxHealth:number, alive?:boolean}>} entities
 * @returns {{treffer: Array<{entityId:number,x:number,y:number,schaden:number,
 *   maxHealth:number,anteil:number,toedlich:boolean}>, zustand: Map}}
 */
export function findeTreffer(bisher, entities) {
  const neu = new Map();
  const treffer = [];

  for (const entity of entities ?? []) {
    if (!entity || entity.entityId === undefined || entity.entityId === null) continue;
    const health = Number(entity.health);
    const maxHealth = Number(entity.maxHealth);
    neu.set(entity.entityId, { health, maxHealth });

    const alt = bisher?.get(entity.entityId);
    if (!alt || !Number.isFinite(alt.health) || !Number.isFinite(health)) continue;

    const schaden = alt.health - health;
    if (schaden <= 0) continue;

    const nenner = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : 100;
    treffer.push({
      entityId: entity.entityId,
      // Die Stelle des Treffers ist die Stelle der Figur. Der Zustand führt
      // keine Einschlagstelle — siehe Modulkopf.
      x: Number(entity.x) || 0,
      y: Number(entity.y) || 0,
      schaden,
      maxHealth: nenner,
      anteil: begrenze01(schaden / nenner),
      toedlich: entity.alive === false,
    });
  }

  return { treffer, zustand: neu };
}

/**
 * Härte des Treffers für den Klang.
 *
 * Die Skala ist die des vorhandenen Klangrezepts (`treffer()` in `sound.js`:
 * 0,5 weich bis 1,5 hart, Bandpass bei `1200 × haerte` Hz). Ein Kratzer klingt
 * dunkler als ein Volltreffer, ohne dass ein neuer Klang erfunden wird.
 */
export function haerteAusTreffer(schaden, maxHealth) {
  const nenner = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : 100;
  const anteil = begrenze01(Number(schaden) / nenner);
  return Number((0.8 + 0.6 * anteil).toFixed(3));
}

/**
 * Macht aus einem Treffer eine Marke für die Effektliste des Renderers.
 *
 * Die Marke ist bewusst ein Effekt derselben Form wie Blitz und Strahl
 * (`life`/`decay`) — sie altert damit über `schreiteEffekteFort` und braucht
 * keine zweite Alterungsregel.
 *
 * @returns {{kind:string, entityId:number, x:number, y:number, radius:number,
 *   schaden:number, haerte:number, toedlich:boolean, life:number, decay:number}}
 */
export function trefferMarke(treffer) {
  const anteil = begrenze01(treffer?.anteil);
  return {
    kind: 'treffer',
    entityId: treffer?.entityId ?? null,
    x: Number(treffer?.x) || 0,
    y: Number(treffer?.y) || 0,
    // Kleine Treffer: kleiner Ring. Ein tödlicher Treffer ist immer groß.
    radius: treffer?.toedlich ? TREFFER_RING_MAX : 8 + anteil * (TREFFER_RING_MAX - 8),
    schaden: Number(treffer?.schaden) || 0,
    haerte: haerteAusTreffer(treffer?.schaden, treffer?.maxHealth),
    toedlich: Boolean(treffer?.toedlich),
    life: 1,
    decay: 1 / TREFFER_BILDER,
  };
}

/**
 * Ausschlag der getroffenen Figur (px), quer zur Blickrichtung.
 *
 * Das Vorzeichen WECHSELT über die Lebensdauer — ein Ausschlag in eine Richtung
 * wäre ein Verschieben, ein Hin und Her liest sich als Sturz ins Ziel. Die
 * Amplitude klingt dabei ab.
 *
 * Bei `reducedMotion` bleibt der Ausschlag null: Ein wackelndes Spielfeld ist
 * genau das, was die Einstellung abschaltet. Die Marke selbst (Ring, Blitz,
 * Klang) BLEIBT — sonst nähme die Barrierefreiheit eine Information weg
 * (dieselbe Regel wie in `weaponAnimation.js`).
 *
 * @param {number} life 1 = frisch
 * @returns {{dx:number, dy:number}}
 */
export function zuckVersatz(life, { reducedMotion = false } = {}) {
  if (reducedMotion) return { dx: 0, dy: 0 };
  const anteil = begrenze01(life);
  const amplitude = TREFFER_ZUCKEN_MAX * anteil * anteil;
  const dx = amplitude * Math.cos(anteil * 26);
  const dy = amplitude * Math.sin(anteil * 26) * 0.6;
  return { dx: dx === 0 ? 0 : dx, dy: dy === 0 ? 0 : dy };
}

/* ======================================================================
 * 2. Kamera-Ruck (Bildwackeln)
 * ====================================================================== */

/**
 * Größter Bildversatz in Bildschirmpixeln — die Lesbarkeitsgrenze.
 *
 * Die Recherche des Projekts (`docs/recherche/sound-und-juice.md`, §4.4) nennt
 * zwei Regeln: Die Amplitude skaliert mit der Ereignisgröße, und ein Shake auf
 * ALLES erzeugt Übelkeit. Beides ist hier umgesetzt: Es ruckt nur bei einem
 * großen Krater (`RUCK_SCHWELLE`), und der Ausschlag ist hart gedeckelt.
 *
 * Warum 5 px: Die Zielhilfe zeigt auf einen Punkt, und der Spieler liest die
 * Bahn am Fadenkreuz. Ein Versatz von 5 px auf einer 1440 px breiten Fläche ist
 * eine deutliche Bewegung und weniger als ein Drittel der Figurenbreite
 * (Figur: Radius 7 px) — die Figur bleibt an derselben Stelle LESBAR. Ein
 * Versatz in der Größenordnung der Figur (≥ 15 px) verschiebt dagegen das
 * Zielkreuz unter dem Auge weg; das wäre ein Verlust an Genauigkeit, kein
 * Gefühl. Die Grenze ist ein Test (`tests/dynamik-gefuehl.test.js`).
 */
export const RUCK_MAX = 5;

/**
 * Lebensdauer des Rucks in Bildern.
 *
 * 8 Bilder bei 60 Hz sind ~133 ms — die Größenordnung, die die Recherche für
 * einen Einschlag nennt (Hit-Stop 25–30 ms, „fetter" Treffer bis 100 ms, dazu
 * der Ausklang). Die Abklingkurve dort lautet „×0,9 je Bild, dann hart auf 0";
 * 1/8 = 0,875 je Bild liegt darunter.
 *
 * ACHTUNG — ZWEIERpotenz, nicht Zufall: Die Alterung ist `life - decay` mit
 * `decay = 1/BILDER`. Bei 1/10 (0,1 ist im Binärsystem periodisch) ergäbe der
 * zehnte Schritt `1,387e-16` und nicht 0 — der Ruck lebte dann EIN Bild länger
 * als angekündigt. Genau das hat der Test beim ersten Lauf gemeldet. Bei 8 ist
 * der Bruch exakt, und die Lebensdauer ist das, was hier steht.
 */
export const RUCK_BILDER = 8;

/**
 * Ab welchem Kraterradius es ruckt (px, Karteneinheiten).
 *
 * Der Radius kommt aus dem Wirkungssystem: Ein Direktschuss ohne
 * Flächenwirkung gräbt `4 px` (siehe `projectileSystem.js#explode`), eine
 * Granate mit `blastRadius 60` gräbt `36 px`. Die Schwelle liegt dazwischen:
 * Ein Einschlag, der den Boden aufreißt, ruckt — ein Loch, das kaum breiter als
 * eine Figur ist, nicht.
 */
export const RUCK_SCHWELLE = 24;

/**
 * Ein Ruck für einen Krater dieser Größe — oder `null`.
 *
 * Kein Zufall, keine Richtung: Der Versatz entsteht aus dem Bildzähler (siehe
 * `ruckVersatz`), damit dieselbe Szene denselben Ruck ergibt.
 */
export function ruckFuer(radius, { reducedMotion = false } = {}) {
  if (reducedMotion) return null;
  const r = Number(radius);
  if (!Number.isFinite(r) || r < RUCK_SCHWELLE) return null;
  return { kind: 'ruck', radius: r, life: 1, decay: 1 / RUCK_BILDER };
}

/** Altert den Ruck um ein Bild; gibt `null` zurück, wenn er verklungen ist. */
export function altereRuck(ruck) {
  if (!ruck) return null;
  const life = ruck.life - ruck.decay;
  return life > 0 ? { ...ruck, life } : null;
}

/**
 * Der Bildversatz durch den Ruck, in Bildschirmpixeln.
 *
 * @param {object|null} ruck
 * @param {object} [optionen]
 * @param {number} [optionen.bild] Bildzähler des Renderers (deterministisch)
 * @param {boolean} [optionen.reducedMotion]
 * @returns {{x:number, y:number}} Betrag höchstens `RUCK_MAX`
 */
export function ruckVersatz(ruck, { bild = 0, reducedMotion = false } = {}) {
  if (!ruck || reducedMotion) return { x: 0, y: 0 };
  const anteil = begrenze01(ruck.life);
  // Schneller abbauend als linear: Der Einschlag ist hart, das Nachlassen auch.
  const amplitude = RUCK_MAX * (1 - Math.sqrt(1 - anteil));
  return {
    x: amplitude * Math.cos(bild * 2.4),
    y: amplitude * Math.sin(bild * 3.7) * 0.6,
  };
}

/* ======================================================================
 * 3. Krater-Narbe
 * ====================================================================== */

/**
 * Obergrenze der Narbenliste.
 *
 * Ein Krater bleibt sichtbar, solange er gezeichnet wird — aber nicht ewig:
 * Ein Match über 30 Runden mit 40 Figuren kann hunderte Krater hinterlassen.
 * 48 Narben sind auf jeder Kartenform mehr, als ein Bild zeigt, und kosten
 * 48 Bögen je Bild — rund ein Fünfzigstel dessen, was die Figurenzeichnung
 * kostet.
 */
export const NARBEN_MAX = 48;

/**
 * Fügt eine Narbe hinzu und hält die Liste kurz.
 *
 * Die ÄLTESTE fällt heraus. Ein „Nein, Liste ist voll" wäre die falsche
 * Entscheidung: Der frische Krater ist der, den der Spieler gerade gesehen hat.
 *
 * @returns {Array} eine NEUE Liste
 */
export function ergaenzeNarbe(narben, x, y, radius) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= 0) return narben ?? [];
  const marke = { x: Number(x) || 0, y: Number(y) || 0, radius: r };
  const liste = [...(narben ?? []), marke];
  return liste.length > NARBEN_MAX ? liste.slice(liste.length - NARBEN_MAX) : liste;
}

/* ======================================================================
 * 4. Projektil-Spur
 * ====================================================================== */

/** Länge der Spur in Punkten (nicht in Bildern). */
export const SPUR_PUNKTE_MAX = 14;

/**
 * Kleinster Abstand zweier Spurenpunkte (Kartenpixel).
 *
 * Ohne diese Schranke bestünde die Spur aus 14 Punkten desselben Ortes, wenn
 * das Projektil langsam fliegt (ein Zünder-Geschoss liegt still) — die Linie
 * wäre ein Punkt, und ein Punkt trägt keine Richtung.
 */
export const SPUR_ABSTAND_MIN = 5;

/**
 * Ab welchem Sprung eine Spur als NEU gilt (Kartenpixel).
 *
 * Entity-IDs werden wiederverwendet (siehe `findeTreffer`). Ohne diese Schranke
 * erbte ein neues Geschoss die Spur des alten an der anderen Kartenhälfte — es
 * gäbe eine Linie quer über die Karte, die nichts bedeutet. Ein Geschoss macht
 * je Bild höchstens ~20 px (die schnellste Waffe, 60 Hz), die Schranke lässt
 * also jede echte Flugbewegung durch, auch über einen Snapshot-Sprung online
 * (50 ms × ~1000 px/s = 50 px).
 */
export const SPUR_SPRUNG_MAX = 240;

/**
 * Verlängert eine Spur um eine Position.
 *
 * @param {Array<{x:number,y:number}>} punkte bisherige Punkte (älteste zuerst)
 * @returns {Array<{x:number,y:number}>} neue Liste, höchstens `SPUR_PUNKTE_MAX`
 */
export function verlaengereSpur(punkte, x, y) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return punkte ?? [];

  const alt = punkte ?? [];
  const letzter = alt[alt.length - 1];
  if (!letzter) return [{ x: px, y: py }];

  const abstand = Math.hypot(px - letzter.x, py - letzter.y);
  // Zu nah: derselbe Punkt. Zu weit: ein anderes Geschoss (siehe oben).
  if (abstand < SPUR_ABSTAND_MIN) return alt;
  if (abstand > SPUR_SPRUNG_MAX) return [{ x: px, y: py }];

  const liste = [...alt, { x: px, y: py }];
  return liste.length > SPUR_PUNKTE_MAX ? liste.slice(liste.length - SPUR_PUNKTE_MAX) : liste;
}

/* ======================================================================
 * 5. Nachhall — Rauch nach einem großen Einschlag
 * ====================================================================== */

/**
 * Wie lange der Nachhall lebt (Bilder, Zweierpotenz — siehe `TREFFER_BILDER`).
 *
 * 64 Bilder bei 60 Hz sind ~1,07 s. Die Recherche des Projekts
 * (`docs/recherche/sound-und-juice.md`, §4.5, Phase 3) nennt für den Rauch einer
 * Explosion 200–1200 ms und hält fest: „Rauch macht Explosionen erst
 * glaubwürdig." Genau die Phase fehlte: Der Blitz war nach 11 Bildern weg, die
 * Splitter nach 29 — von einem großen Einschlag blieb ein Krater und ein
 * kurzes Zucken.
 */
export const RAUCH_BILDER = 64;

/** So viele Rauchwolken entstehen je Explosion (gedeckelt, wie `MAX_PARTIKEL`). */
export const RAUCH_JE_EXPLOSION = 6;

/** Ab welchem Kraterradius es raucht — dieselbe Schwelle wie der Ruck. */
export const RAUCH_SCHWELLE = RUCK_SCHWELLE;

/** Farben des Rauchs: der dunkle Grund des Himmels, aufgehellt. */
const RAUCH_FARBEN = Object.freeze(['#2b3540', '#3a4653', '#4a5866']);

/**
 * Erzeugt die Rauchwolke eines Einschlags.
 *
 * Ein Rauchballon ist KEIN Splitter: Er steigt, er wächst, er ist
 * durchsichtig — und er bewegt sich langsam. Deshalb ein eigenes Feld
 * (`startRadius`, `steigt`) statt einer zweiten Verwendung von
 * `erzeugePartikel`: Ein Splitter mit Gravitation wäre nach einem Bild wieder
 * unten.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} radius Kraterradius in Kartenpixeln
 * @returns {Array<object>} neue Liste (leer unterhalb der Schwelle)
 */
export function rauchWolke(x, y, radius) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r < RAUCH_SCHWELLE) return [];

  const px = Number(x) || 0;
  const py = Number(y) || 0;
  const liste = [];
  // Größerer Krater, mehr Wolken — aber nie mehr als `RAUCH_JE_EXPLOSION`.
  const anzahl = Math.min(RAUCH_JE_EXPLOSION, 3 + Math.round(r / 12));

  for (let i = 0; i < anzahl; i += 1) {
    // Verteilt wie bei den Splittern: aus dem Index, nicht aus Zufall.
    const winkel = (i / anzahl) * Math.PI * 2;
    liste.push({
      x: px + Math.cos(winkel) * r * 0.35,
      y: py + Math.sin(winkel) * r * 0.2,
      // Steigt und treibt auseinander — langsam.
      vx: Math.cos(winkel) * 0.35,
      vy: -0.28 - (i % 3) * 0.08,
      life: 1,
      decay: 1 / RAUCH_BILDER,
      startRadius: Math.max(4, r * 0.35) * (0.7 + (i % 3) * 0.2),
      farbe: RAUCH_FARBEN[i % RAUCH_FARBEN.length],
    });
  }

  return liste;
}

/** Ein Bild Rauch: steigen, auseinandertreiben, altern, aufräumen. */
export function schreiteRauchFort(wolken) {
  const ueberlebende = [];
  for (const w of wolken) {
    const life = w.life - w.decay;
    if (life <= 0) continue;
    ueberlebende.push({
      ...w,
      x: w.x + w.vx,
      y: w.y + w.vy,
      life,
    });
  }
  return ueberlebende;
}

/**
 * Darstellungsgrößen einer Rauchwolke.
 *
 * Der Ballon WÄCHST, während er verblasst (Phase 3 der Recherche: „langsam
 * aufsteigende, wachsende, halbtransparente Kreise"). Die Deckkraft bleibt
 * niedrig: Rauch ist ein Hintergrund, kein Blickfang — die Figur am Zug muss
 * davor lesbar bleiben.
 *
 * @returns {{radius:number, alpha:number}}
 */
export function rauchDarstellung(wolke) {
  const lebensanteil = begrenze01(wolke?.life ?? 0);
  const gewachsen = 1 + (1 - lebensanteil) * 1.4;
  return {
    radius: Math.max(1, (wolke?.startRadius ?? 0) * gewachsen),
    // Unter 0,34 Deckkraft: mehr wäre eine Wolke, die die halbe Karte verdeckt.
    alpha: 0.34 * lebensanteil,
  };
}
