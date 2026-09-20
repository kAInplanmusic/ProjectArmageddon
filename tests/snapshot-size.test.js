import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import {
  encodeSnapshot,
  HEADER_SIZE,
  PLAYER_STRIDE,
  PROJECTILE_STRIDE,
  CRATE_STRIDE,
} from '../src/shared/protocol.js';
// Die Senderate gehört dem Server (er sendet), nicht dem Drahtformat.
import { SNAPSHOT_HZ } from '../src/server/gameServer.js';

/**
 * Größe der Zustandsübertragung.
 *
 * Anlass war der offene Punkt „Snapshot-Kompression prüfen (Delta läuft,
 * Quantisierung ist schon aktiv)". Die Prüfung hat zwei Dinge ergeben, die hier
 * festgehalten werden — beide sind leicht zu übersehen und teuer zu glauben:
 *
 * 1. **Das Delta-Encoding spart KEINE Bytes.** Die Größe ist
 *    `HEADER + Figuren × 15 + Projektile × 6`, unabhängig davon, wie viele
 *    Felder sich geändert haben. Die Dirty-Bits sind ein SIGNAL an den Client
 *    („was ist neu"), keine Kompression. Wer „Delta" liest und Einsparung
 *    annimmt, irrt.
 *
 * 2. **Kompression ist nicht nötig.** Gemessen: 4,0 kB/s bei zwölf Figuren und
 *    20 Hz — der Höchstfall. Eine variable Stride würde Bytes sparen, aber das
 *    Protokoll deutlich komplizierter machen (variable Länge, neue
 *    Fehlerquellen) — für weniger als ein Bild pro Sekunde.
 *
 * Der Test hält ein BUDGET fest: Wächst die Größe unerwartet (neues Feld ohne
 * Bedacht), schlägt er an und die Entscheidung wird neu verhandelt.
 */

/** Baut ein Match und gibt die Snapshot-Größen über den Spielverlauf zurück. */
function messen({ teams = 2, playersPerTeam = 2, schritte = 300 } = {}) {
  const match = new MatchController({ seed: 42, teams, playersPerTeam });
  match.start();
  if (match.activePlayerId !== null) match.fire(match.activePlayerId, Math.PI / 4, 70);

  const groessen = [];
  let maxProjektile = 0;
  for (let i = 0; i < schritte; i += 1) {
    const state = match.getState();
    groessen.push(encodeSnapshot(state).length);
    maxProjektile = Math.max(maxProjektile, state.projectiles.length);
    match.step();
    match.consumeEvents();
  }
  return {
    groessen,
    schnitt: groessen.reduce((a, b) => a + b, 0) / groessen.length,
    maximum: Math.max(...groessen),
    figuren: teams * playersPerTeam,
    maxProjektile,
  };
}

test('Die Snapshot-Größe ist die Summe ihrer Teile', () => {
  // Die Formel aus der Doku muss stimmen — sonst wären die Budgets unten Zufall.
  const match = new MatchController({ seed: 42, teams: 2, playersPerTeam: 2 });
  match.start();
  const state = match.getState();

  const erwartet = HEADER_SIZE
    + state.entities.length * PLAYER_STRIDE
    + state.projectiles.length * PROJECTILE_STRIDE
    + (state.crates ?? []).length * CRATE_STRIDE;
  assert.equal(encodeSnapshot(state).length, erwartet);

  // Und mit Projektilen stimmt sie auch.
  match.fire(match.activePlayerId, Math.PI / 4, 70);
  const mitProjektil = match.getState();
  assert.ok(mitProjektil.projectiles.length > 0, 'Testaufbau braucht ein Projektil');
  assert.equal(
    encodeSnapshot(mitProjektil).length,
    HEADER_SIZE + mitProjektil.entities.length * PLAYER_STRIDE
      + mitProjektil.projectiles.length * PROJECTILE_STRIDE
      + (mitProjektil.crates ?? []).length * CRATE_STRIDE,
  );
});

test('Ein Delta-Snapshot ist GENAU SO GROSS wie ein Vollsnapshot', () => {
  /*
   * Der Kern der Analyse. Wäre das Delta kleiner, würde die Doku in die Irre
   * führen; ist es gleich groß, darf niemand Einsparung annehmen. Der Test hält
   * die Tatsache fest, damit sie nicht in Vergessenheit gerät.
   */
  const match = new MatchController({ seed: 42, teams: 2, playersPerTeam: 4 });
  match.start();
  const state = match.getState();

  const voll = encodeSnapshot(state);
  // Ein Delta gegen einen bekannten Vorzustand: Alle Felder unterscheiden sich,
  // das ist der ungünstigste Fall.
  const vorher = new Map(state.entities.map(e => [e.entityId, {
    xRaw: 0, yRaw: 0, healthRaw: 0, alive: false, shieldRaw: 0, frozenRaw: 0, waterRaw: 0,
  }]));
  const delta = encodeSnapshot(state, { previous: vorher });

  assert.equal(delta.length, voll.length,
    'Ein Delta ist unterschiedlich groß — die Annahme in der Doku stimmt nicht mehr');
});

test('Die Übertragung bleibt im Budget — auch im Höchstfall der Matcharten', () => {
  /*
   * Der Höchstfall ist NICHT mehr zwölf Figuren.
   *
   * MAX_LOBBY_PLAYERS = 12 galt, solange ein Beitritt einen Platz belegte. Mit
   * dem Modus der Matcharten (ein Mensch führt ein Team, `unitsPerPlayer`) nennt
   * der Kriegsmodus **8 Spieler × 5 Einheiten = 40 Figuren**; die wirksame Grenze
   * heißt jetzt MAX_LOBBY_FIGURES = 40.
   *
   * Gemessen (Seed 42, 600 Schritte, 20 Hz):
   *
   *     12 Figuren (klein/groß-alt) → 204 B →  4,0 kB/s
   *     16 Figuren (groß)           → 264 B →  5,2 kB/s
   *     30 Figuren (Krieg klein)    → 474 B →  9,3 kB/s
   *     40 Figuren (Krieg maximal)  → 624 B → 12,2 kB/s
   *
   * Das alte Budget (320 B / 6 kB/s) beschrieb damit nur noch den ALTEN
   * Höchstfall. Für den neuen gilt ein eigenes — dreimal so hoch, aber immer noch
   * weit unter dem, was eine Kompression rechtfertigen würde (Bytes je Figur sind
   * konstant, siehe Test unten).
   */
  const alt = messen({ teams: 3, playersPerTeam: 4, schritte: 600 });
  const kbAlt = (alt.schnitt * SNAPSHOT_HZ) / 1024;
  assert.equal(alt.figuren, 12);
  assert.ok(alt.maximum <= 320,
    `Zwölf Figuren: ${alt.maximum} Bytes (Budget: 320)`);
  assert.ok(kbAlt <= 6,
    `Zwölf Figuren: ${kbAlt.toFixed(1)} kB/s (Budget: 6)`);

  const krieg = messen({ teams: 8, playersPerTeam: 5, schritte: 600 });
  const kbKrieg = (krieg.schnitt * SNAPSHOT_HZ) / 1024;
  assert.equal(krieg.figuren, 40, 'Krieg: 8 Spieler × 5 Einheiten');
  assert.ok(krieg.maximum <= 700,
    `Vierzig Figuren: ${krieg.maximum} Bytes (Budget: 700; gemessen 624)`);
  assert.ok(kbKrieg <= 14,
    `Vierzig Figuren: ${kbKrieg.toFixed(1)} kB/s (Budget: 14; gemessen 12,2)`);
});

test('Die Größe wächst linear mit der Figurenzahl, nicht schneller', () => {
  /*
   * Ein überlineares Wachstum wäre das Signal, dass etwas mitgeschleppt wird,
   * was nicht in einen Zustandstakt gehört (Verlauf, Inventar, Protokoll).
   * Verglichen werden Schnittgrößen bei 2, 8 und 12 Figuren.
   */
  const klein = messen({ teams: 2, playersPerTeam: 1 });
  const mittel = messen({ teams: 2, playersPerTeam: 4 });
  const gross = messen({ teams: 3, playersPerTeam: 4 });

  // Die Differenz je Figur ist ungefähr konstant (PLAYER_STRIDE = 15).
  const jeFigurKleinMittel = (mittel.schnitt - klein.schnitt) / (mittel.figuren - klein.figuren);
  const jeFigurMittelGross = (gross.schnitt - mittel.schnitt) / (gross.figuren - mittel.figuren);

  for (const [name, wert] of [['2→8', jeFigurKleinMittel], ['8→12', jeFigurMittelGross]]) {
    assert.ok(wert > 0 && wert <= PLAYER_STRIDE + 1,
      `Zwischen ${name} Figuren wächst ein Snapshot um ${wert.toFixed(1)} B je Figur — `
      + `erwartet höchstens ${PLAYER_STRIDE + 1} (PLAYER_STRIDE plus Projektile)`);
  }
});

test('Quantisierung ist aktiv: Koordinaten kosten zwei Byte, nicht vier', () => {
  /*
   * Die Quantisierung war schon vor der Analyse vorhanden (COORD_SCALE). Der
   * Test hält fest, dass sie nicht versehentlich entfernt wird — ohne sie wäre
   * jeder Snapshot etwa ein Drittel größer, weil Koordinaten als Float32
   * übertragen würden.
   */
  const match = new MatchController({ seed: 42, teams: 2, playersPerTeam: 1 });
  match.start();
  const state = match.getState();

  // Zwei Figuren, kein Projektil: exakt die Stride-Summe, plus die Startkiste,
  // die zum Matchbeginn ausgelost wird. Wären Koordinaten Float32, käme hier
  // deutlich mehr heraus.
  const zweiFiguren = HEADER_SIZE + 2 * PLAYER_STRIDE
    + (state.crates ?? []).length * CRATE_STRIDE;
  assert.ok((state.crates ?? []).length > 0,
    'Der Testaufbau braucht die Startkiste — sonst prüft er die Kistenbreite nicht mit');
  assert.equal(encodeSnapshot(state).length, zweiFiguren);

  // Und die Stride passt zu den erwarteten Feldern: 2+2 (x,y) + 2 (health)
  // + 1 (alive/flags) + 1 (shield) + 1 (frozen) + 1 (Wasser) + Kopfzeilen.
  assert.ok(PLAYER_STRIDE >= 12 && PLAYER_STRIDE <= 16,
    `PLAYER_STRIDE ist ${PLAYER_STRIDE} — deutlich mehr als die erwarteten Felder`);
});
