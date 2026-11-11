/**
 * SeilSystem: das Seil (Ninja Rope aus Worms Armageddon), Seilfassung 2 und 3 (`config/seil.js`, Tabelle je Fassung).
 *
 * ## Modell
 *
 * Das Seil ist eine Verbindung Anker ↔ Figur mit HÖCHSTlänge (kein Gummi): Ist die Figur näher am Drehpunkt als
 * die freie Länge, fällt sie frei; ist sie weiter weg, wird sie auf den Kreis zurückgesetzt und ihr Tempo aus der
 * Lageänderung neu bestimmt (Verlet-Zwang) — der Anteil nach außen fällt dabei weg, der Schwung entlang der
 * Kreisbahn bleibt. Schwerkraft, Schwung (links/rechts entlang der Bahn), Luftwiderstand und die Tempogrenze
 * stehen in `SEIL`.
 *
 * Kürzeres Seil = stärkerer Schwung: Beim Ein-/Ausfahren bleibt der Drehimpuls erhalten (Tempo entlang der Bahn
 * × Länge = konstant), Einholen im tiefsten Punkt beschleunigt also — die Pump-Technik aus Worms.
 *
 * ## Wickeln um Geländeecken
 *
 * Verdeckt Gelände die Linie vom aktuellen Drehpunkt zur Figur, sitzt dort ein Knick: Er wird auf der zuletzt
 * freien Linie (abgetastet zwischen alter und neuer Figurlage) im Abstand der Kante gesetzt und merkt sich, auf
 * welcher Seite das Seil anliegt (Vorzeichen des Kreuzprodukts). Schwingt die Figur zurück, bis das Vorzeichen
 * kippt, und ist die Linie zum vorigen Drehpunkt frei, löst sich der Knick wieder. Die Gesamtlänge bleibt dabei
 * gleich; frei schwingt nur der Rest hinter dem letzten Knick.
 *
 * ## Determinismus (AGENTS.md §2)
 *
 * Kein Zufall, keine Uhr. Je Takt nur Grundrechenarten und `Math.sqrt` (IEEE-genau gerundet); Winkelfunktionen nur
 * einmal beim Abschuss (wie beim Schuss, `match.js#launchVector`). Abgetastet wird in festen Schritten, Gelände nur
 * über `terrain.isSolid` (dieselbe Maske wie `CharacterSystem`). Die Absicht (Schwung/Länge) hängt an Takten.
 *
 * @module engine/seil
 */
import { PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT } from '../shared/config/player.js';
import { SEIL, seilStufe, seilWerte } from '../shared/config/seil.js';
import { WET_LEVEL } from '../shared/config/water.js';
import { getWeapon } from '../shared/config/weapons.js';

/** Prüfpunkte des Körpers relativ zur Mitte: Kopf, Füße, links, rechts (1 px innerhalb des Körpers). */
const KOERPER = Object.freeze([
  [0, -(PLAYER_HALF_HEIGHT - 1)], [0, PLAYER_HALF_HEIGHT - 1], [-(PLAYER_HALF_WIDTH - 1), 0], [PLAYER_HALF_WIDTH - 1, 0],
]);

const fest = (terrain, x, y) => terrain.isSolid(Math.floor(x), Math.floor(y));

/** Ist der Körper an (x, y) frei von Gelände? */
export function koerperFrei(terrain, x, y) {
  for (const [dx, dy] of KOERPER) if (fest(terrain, x + dx, y + dy)) return false;
  return true;
}

/**
 * Erster fester Punkt auf der Strecke a → b (Abstand von a), abgetastet je Pixel; −1, wenn die Linie frei ist.
 * Die ersten `STREIFEN` px am Drehpunkt zählen nicht: Ein Knick liegt direkt an der Kante, die Linie streift sie
 * dort zwangsläufig. Der Endpunkt (Figurmitte) zählt nicht.
 */
const STREIFEN = 2;
export function sichtBlock(terrain, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const laenge = Math.sqrt(dx * dx + dy * dy);
  const n = Math.ceil(laenge);
  for (let i = Math.max(1, Math.ceil(STREIFEN * n / Math.max(laenge, 1))); i < n; i += 1) {
    if (fest(terrain, ax + dx * i / n, ay + dy * i / n)) return laenge * i / n;
  }
  return -1;
}

/**
 * Seilschuss als Strahl: der erste feste Punkt in Richtung `winkel` (0 = rechts, π/2 = oben) bis `maxLaenge`.
 * Über den oberen Kartenrand hinaus oder seitlich hinaus trifft er nichts (der Rand der Maske gilt sonst als fest).
 *
 * @returns {{treffer:false}|{treffer:true, x:number, y:number, hx:number, hy:number, laenge:number}}
 */
export function seilStrahl(terrain, x, y, winkel, maxLaenge, minLaenge = SEIL.minLaenge) {
  const rx = Math.cos(winkel);
  const ry = -Math.sin(winkel);
  for (let d = 1; d <= maxLaenge; d += 1) {
    const px = x + rx * d;
    const py = y + ry * d;
    if (py < 0 || px < 0 || px >= terrain.width) return { treffer: false };
    if (fest(terrain, px, py)) {
      const a = Math.max(0, d - 1);
      return { treffer: true, x: x + rx * a, y: y + ry * a, hx: Math.floor(px), hy: Math.floor(py), laenge: Math.max(minLaenge, a) };
    }
  }
  return { treffer: false };
}

const kreuz = (ax, ay, bx, by) => ax * by - ay * bx;
const vorzeichen = wert => (wert > 0 ? 1 : wert < 0 ? -1 : 0);

/** Summe der Seilstücke zwischen den Drehpunkten (gewickelter Teil). */
export function gewickelt(punkte) {
  let summe = 0;
  for (let i = 1; i < punkte.length; i += 1) {
    const dx = punkte[i].x - punkte[i - 1].x;
    const dy = punkte[i].y - punkte[i - 1].y;
    summe += Math.sqrt(dx * dx + dy * dy);
  }
  return summe;
}

/**
 * Ein Takt am Seil — reine Funktion (Tests, spätere Vorhersage im Client).
 *
 * @param {{isSolid:function(number,number):boolean, width:number, height:number}} terrain
 * @param {{x:number, y:number, vx:number, vy:number, punkte:{x:number,y:number,seite?:number}[], laenge:number,
 *   maxLaenge:number, sx:number, sy:number}} s - Lage, Tempo, Drehpunkte (Anker zuerst), Gesamtlänge, Absicht
 *   (sx: −1 links/+1 rechts schwingen, sy: −1 einholen/+1 ausfahren)
 * @returns {{x:number, y:number, vx:number, vy:number, punkte:object[], laenge:number, amBoden:boolean}}
 */
export function pendelSchritt(terrain, s, werte = SEIL) {
  let { x, y, vx, vy, laenge } = s;
  const punkte = s.punkte.map(p => ({ ...p }));
  let dreh = punkte[punkte.length - 1];
  let frei = laenge - gewickelt(punkte);

  // 1. Länge ändern; der Drehimpuls bleibt erhalten, solange das Seil gespannt ist.
  if (s.sy !== 0) {
    const neu = Math.max(werte.minLaenge, Math.min(s.maxLaenge - (laenge - frei), frei + s.sy * werte.kletterTempo));
    if (neu !== frei && neu > 0) {
      const dx = x - dreh.x;
      const dy = y - dreh.y;
      const abstand = Math.sqrt(dx * dx + dy * dy);
      if (abstand > 0 && abstand >= frei - 0.5) {
        const ux = dx / abstand;
        const uy = dy / abstand;
        const radial = vx * ux + vy * uy;
        const f = frei / neu;
        vx = radial * ux + (vx - radial * ux) * f;
        vy = radial * uy + (vy - radial * uy) * f;
      }
      laenge += neu - frei;
      frei = neu;
    }
  }

  // 2. Kräfte: Schwerkraft, Schwung entlang der Bahn, Luftwiderstand, Tempogrenze.
  vy += werte.schwerkraft;
  if (s.sx !== 0) {
    const dx = x - dreh.x;
    const dy = y - dreh.y;
    const abstand = Math.sqrt(dx * dx + dy * dy);
    if (abstand > 0) {
      vx += s.sx * werte.schwung * (dy / abstand);
      vy -= s.sx * werte.schwung * (dx / abstand);
    }
  }
  vx *= werte.reibung;
  vy *= werte.reibung;
  const tempo = Math.sqrt(vx * vx + vy * vy);
  if (tempo > werte.maxTempo) {
    vx = vx * werte.maxTempo / tempo;
    vy = vy * werte.maxTempo / tempo;
  }

  // 3. Kandidat und Zwang: nie weiter vom Drehpunkt als die freie Länge; Tempo aus der Lageänderung.
  let nx = x + vx;
  let ny = y + vy;
  const zx = nx - dreh.x;
  const zy = ny - dreh.y;
  const zabstand = Math.sqrt(zx * zx + zy * zy);
  if (zabstand > frei && zabstand > 0) {
    nx = dreh.x + zx * frei / zabstand;
    ny = dreh.y + zy * frei / zabstand;
  }
  vx = nx - x;
  vy = ny - y;

  // 4. Gelände: in Schritten ≤ 1 px abtasten; an der ersten Berührung gleiten oder abprallen.
  let fx = x;
  let fy = y;
  let amBoden = false;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy))));
  for (let i = 1; i <= n; i += 1) {
    const tx = x + vx * i / n;
    const ty = y + vy * i / n;
    if (koerperFrei(terrain, tx, ty)) { fx = tx; fy = ty; continue; }
    // Entlang einer Achse gleiten — die mit dem größeren Tempoanteil zuerst (so hebt das Einholen die Figur auch
    // am Hang an); die gesperrte Richtung prallt ab (am Boden: liegen bleiben).
    const yGesperrt = () => {
      if (vy > 0) { amBoden = true; vy = 0; vx *= werte.bodenReibung; } else vy = -vy * werte.abprall;
    };
    const xFrei = koerperFrei(terrain, tx, fy);
    const yFrei = koerperFrei(terrain, fx, ty);
    if (yFrei && (!xFrei || Math.abs(vy) >= Math.abs(vx))) { fy = ty; vx = -vx * werte.abprall; } else if (xFrei) {
      fx = tx;
      yGesperrt();
    } else {
      vx = -vx * werte.abprall;
      yGesperrt();
    }
    break;
  }
  const minX = PLAYER_HALF_WIDTH;
  const maxX = terrain.width - PLAYER_HALF_WIDTH;
  if (fx < minX || fx > maxX) { fx = Math.max(minX, Math.min(maxX, fx)); vx = 0; }
  if (fy < PLAYER_HALF_HEIGHT) { fy = PLAYER_HALF_HEIGHT; vy = 0; }
  if (fest(terrain, fx, fy + PLAYER_HALF_HEIGHT)) amBoden = true;

  // 5. Wickeln: Verdeckt Gelände die Linie Drehpunkt → Figur, entsteht ein Knick an der Kante.
  for (let k = 0; k < werte.knickeJeTakt && punkte.length < werte.maxKnicke; k += 1) {
    dreh = punkte[punkte.length - 1];
    const block = sichtBlock(terrain, dreh.x, dreh.y, fx, fy);
    if (block < 0) break;
    let vorher = { x, y };
    let gefunden = { x: fx, y: fy, block };
    for (let j = 1; j <= werte.knickAbtastung; j += 1) {
      const q = { x: x + (fx - x) * j / werte.knickAbtastung, y: y + (fy - y) * j / werte.knickAbtastung };
      const b = sichtBlock(terrain, dreh.x, dreh.y, q.x, q.y);
      if (b >= 0) { gefunden = { ...q, block: b }; break; }
      vorher = q;
    }
    const lx = vorher.x - dreh.x;
    const ly = vorher.y - dreh.y;
    const ll = Math.sqrt(lx * lx + ly * ly);
    if (ll <= 1) break;
    const abstand = Math.max(1, Math.min(ll, gefunden.block - 1));
    const kx = dreh.x + lx * abstand / ll;
    const ky = dreh.y + ly * abstand / ll;
    if (fest(terrain, kx, ky)) break;
    const seite = vorzeichen(kreuz(kx - dreh.x, ky - dreh.y, fx - kx, fy - ky));
    if (seite === 0) break;
    // Liegt der bisherige Knick fast auf der Geraden vom vorigen zum neuen (Seil entlang einer Kante), ersetzt
    // der neue ihn — sonst reihten sich Knicke Pixel für Pixel an der Kante auf.
    if (punkte.length > 1) {
      const q = punkte[punkte.length - 2];
      const gx = kx - q.x;
      const gy = ky - q.y;
      const gl = Math.sqrt(gx * gx + gy * gy);
      if (gl > 0 && Math.abs(kreuz(gx, gy, dreh.x - q.x, dreh.y - q.y)) / gl < 1 && dreh.seite === seite) punkte.pop();
    }
    punkte.push({ x: kx, y: ky, seite });
  }

  // 6. Entwickeln: Kippt die Seite am letzten Knick und ist die Linie zum vorigen Drehpunkt frei, löst er sich.
  while (punkte.length > 1) {
    const p = punkte[punkte.length - 1];
    const q = punkte[punkte.length - 2];
    const seite = vorzeichen(kreuz(p.x - q.x, p.y - q.y, fx - p.x, fy - p.y));
    if (seite === 0 || seite === p.seite) break;
    if (sichtBlock(terrain, q.x, q.y, fx, fy) >= 0) break;
    punkte.pop();
  }

  // Das Seil gibt nach, wo Gelände die Figur hält (Einholen gegen eine Wand) oder die Geometrie es verlangt.
  const letzter = punkte[punkte.length - 1];
  const rx = fx - letzter.x;
  const ry = fy - letzter.y;
  const rest = Math.sqrt(rx * rx + ry * ry);
  const wickel = gewickelt(punkte);
  if (wickel + rest > laenge + 0.5) laenge = wickel + rest;

  return { x: fx, y: fy, vx, vy, punkte, laenge, amBoden };
}

/** Drehpunkte für Zustand und Ereignisse: auf 0,01 px gerundet (nur Anzeige; der Motor rechnet ungerundet). */
const punkteFuerAnzeige = punkte => punkte.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);

export class SeilSystem {
  #match;
  #hatGeschossen;
  #stufe;
  /** @type {{id:number, punkte:object[], laenge:number, maxLaenge:number, hx:number, hy:number}|null} */
  #haengt = null;
  /** Laufende Serie: `{id, rest}` — verbleibende Seilschüsse in der Luft (Infinity = unbegrenzt). */
  #serie = null;
  #werte = SEIL;
  #absicht = { sx: 0, sy: 0, bis: -1 };

  /**
   * @param {object} match - der `MatchController` (nur öffentliche Schnittstelle)
   * @param {function():boolean} hatGeschossen - wurde in diesem Zug schon geschossen?
   * @param {number} [stufe] - Kraftstufe 1–5
   */
  constructor(match, hatGeschossen, stufe = SEIL.standardStufe) {
    this.#match = match;
    this.#werte = seilWerte(match.seil); // Wertetabelle der Seilfassung der Partie (2 oder 3); ohne Angabe der Standard
    this.#hatGeschossen = hatGeschossen;
    this.#stufe = seilStufe(stufe);
  }

  get stufe() { return this.#stufe.stufe; }
  get maxLaenge() { return this.#stufe.laenge; }

  /** Hängt diese Figur am Seil? */
  haengt(playerId) { return this.#haengt !== null && this.#haengt.id === playerId; }

  #charakter() { return this.#match.world.getSystem('character'); }

  #pruefeZug(playerId) {
    const m = this.#match;
    if (m.status !== 'playing') return 'Match läuft nicht';
    if (playerId !== m.activePlayerId) return 'Nur der aktive Spieler kann das Seil benutzen';
    if (!m.isPlayerAlive(playerId)) return 'Spieler ist nicht mehr aktiv';
    if (m.turnPauseMs > 0) return 'Zugpause: der Zug beginnt gleich';
    return null;
  }

  /**
   * Eine Seil-Eingabe (Server, Wiedergabe, lokaler Client): `{aktion:'schuss', winkel}`, `{aktion:'loesen'}` oder
   * `{aktion:'steuer', sx, sy}`. Unbekanntes wird abgelehnt.
   */
  eingabe(playerId, { aktion, winkel, sx = 0, sy = 0 } = {}) {
    if (aktion === 'schuss') return this.schiessen(playerId, winkel);
    if (aktion === 'loesen') return this.loesen(playerId, 'spieler');
    if (aktion === 'steuer') return this.steuern(playerId, sx, sy);
    return { ok: false, errors: ['Unbekannte Seilaktion'] };
  }

  /** Feuertaste mit gewähltem Seil: schießt das Seil im Winkel `winkel` (0 … π, nie unter den Horizont). */
  schiessen(playerId, winkel) {
    const fehler = this.#pruefeZug(playerId);
    if (fehler) return { ok: false, errors: [fehler] };
    if (typeof winkel !== 'number' || !Number.isFinite(winkel) || winkel < SEIL.winkelMin || winkel > SEIL.winkelMax) {
      return { ok: false, errors: ['winkel muss zwischen 0 und π liegen'] };
    }
    if (this.#hatGeschossen()) return { ok: false, errors: ['Nach dem Schuss gibt es kein Seil mehr'] };
    if (this.#haengt) return { ok: false, errors: ['Das Seil hängt schon'] };
    const m = this.#match;
    const amBoden = m.isGrounded(playerId);
    const neueSerie = amBoden || this.#serie === null || this.#serie.id !== playerId;
    if (!neueSerie && this.#serie.rest <= 0) return { ok: false, errors: ['Keine Neuwürfe mehr — erst wieder vom Boden'] };
    const welt = m.world;
    const x = welt.getComponent(playerId, 'Position', 'x') ?? 0;
    const y = welt.getComponent(playerId, 'Position', 'y') ?? 0;
    const strahl = seilStrahl(m.terrain, x, y, winkel, this.#stufe.laenge, this.#werte.minLaenge);
    if (!strahl.treffer) return { ok: false, errors: ['Das Seil findet keinen Halt'] };
    this.#serie = { id: playerId, rest: neueSerie ? this.#stufe.schuesse - 1 : this.#serie.rest - 1 };
    this.#haengt = {
      id: playerId, punkte: [{ x: strahl.x, y: strahl.y, seite: 0 }], laenge: strahl.laenge,
      maxLaenge: this.#stufe.laenge, hx: strahl.hx, hy: strahl.hy,
    };
    this.#absicht = { sx: 0, sy: 0, bis: -1 };
    this.#charakter()?.setzeSeil(playerId, true);
    m.events.emit('seil_angeheftet', { playerId, x: strahl.x, y: strahl.y, laenge: strahl.laenge, punkte: punkteFuerAnzeige(this.#haengt.punkte) });
    return { ok: true, laenge: strahl.laenge };
  }

  /** Feuertaste am Seil (oder ein Waffenschuss, Zugende, Wasser, verlorener Anker): Seil lösen, Schwung bleibt. */
  loesen(playerId, grund = 'spieler') {
    if (!this.haengt(playerId)) return { ok: false, errors: ['Kein Seil'] };
    this.#haengt = null;
    this.#absicht = { sx: 0, sy: 0, bis: -1 };
    const charakter = this.#charakter();
    charakter?.setzeSeil(playerId, false);
    charakter?.setzeFreiflug(playerId, SEIL.maxTempo);
    this.#match.events.emit('seil_geloest', { playerId, grund });
    return { ok: true };
  }

  /** Schwung (sx: −1/0/1) und Länge (sy: −1 einholen, 0, 1 ausfahren) — gilt bis 0, Lösen oder Haltedauer. */
  steuern(playerId, sx, sy) {
    for (const wert of [sx, sy]) {
      if (!Number.isInteger(wert) || wert < -1 || wert > 1) return { ok: false, errors: ['sx und sy müssen -1, 0 oder 1 sein'] };
    }
    if (!this.haengt(playerId)) return { ok: false, errors: ['Kein Seil'] };
    this.#absicht = { sx, sy, bis: this.#match.world.tickCount + SEIL.haltedauer };
    return { ok: true };
  }

  /** Vor einem Waffenschuss: am Seil ist alles erlaubt außer Nahkampf. `null` = die Figur hängt nicht. */
  vorWaffe(playerId, weaponId) {
    if (!this.haengt(playerId)) return null;
    const kategorie = getWeapon(weaponId)?.category ?? null;
    if (SEIL.verboteneKategorien.includes(kategorie)) return { ok: false, errors: ['Nahkampf geht nicht vom Seil'] };
    return { ok: true };
  }

  /** Ein Takt. Aufruf aus `MatchController#step` VOR dem Physikschritt (das `CharacterSystem` lässt die Figur aus). */
  schritt() {
    const m = this.#match;
    if (this.#serie && (this.#serie.id !== m.activePlayerId || (!this.#haengt && m.isGrounded(this.#serie.id)))) {
      this.#serie = null; // Boden berührt oder Zug vorbei: nicht genutzte Neuwürfe verfallen
    }
    const h = this.#haengt;
    if (!h) return;
    if (m.status !== 'playing' || h.id !== m.activePlayerId || !m.isPlayerAlive(h.id)) {
      this.loesen(h.id, 'zugende');
      return;
    }
    if (!m.terrain.isSolid(h.hx, h.hy)) { this.loesen(h.id, 'anker'); return; }
    const welt = m.world;
    const x = welt.getComponent(h.id, 'Position', 'x') ?? 0;
    const y = welt.getComponent(h.id, 'Position', 'y') ?? 0;
    if ((m.waterLevelAt(x, y) ?? 0) > WET_LEVEL) { this.loesen(h.id, 'wasser'); return; }
    const absicht = welt.tickCount > this.#absicht.bis ? { sx: 0, sy: 0 } : this.#absicht;
    const erg = pendelSchritt(m.terrain, {
      x, y, vx: welt.getComponent(h.id, 'Velocity', 'x') ?? 0, vy: welt.getComponent(h.id, 'Velocity', 'y') ?? 0,
      punkte: h.punkte, laenge: h.laenge, maxLaenge: h.maxLaenge, sx: absicht.sx, sy: absicht.sy,
    }, this.#werte);
    welt.setComponent(h.id, 'Position', 'x', erg.x);
    welt.setComponent(h.id, 'Position', 'y', erg.y);
    welt.setComponent(h.id, 'Velocity', 'x', erg.vx);
    welt.setComponent(h.id, 'Velocity', 'y', erg.vy);
    const knicke = erg.punkte.length !== h.punkte.length;
    h.punkte = erg.punkte;
    h.laenge = erg.laenge;
    if (knicke) m.events.emit('seil_knick', { playerId: h.id, punkte: punkteFuerAnzeige(h.punkte) });
  }

  /** Zustand für Anzeige und Hash — `null`, solange nichts hängt und keine Serie läuft (alte Hashes bleiben gleich). */
  snapshot() {
    if (!this.#haengt && !this.#serie) return null;
    const h = this.#haengt;
    return {
      playerId: h?.id ?? this.#serie.id,
      haengt: h !== null,
      punkte: h ? punkteFuerAnzeige(h.punkte) : [],
      laenge: h ? h.laenge : 0,
      stufe: this.#stufe.stufe,
      neuwuerfe: this.#serie ? (this.#serie.rest === Infinity ? 'unbegrenzt' : this.#serie.rest) : null,
    };
  }
}

export default SeilSystem;
