import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import {
  encodeSnapshot,
  HEADER_SIZE,
  PLAYER_STRIDE,
  PROJECTILE_STRIDE,
  CRATE_STRIDE,
  TURRET_STRIDE,
  GUENTHER_STRIDE,
  GUENTHER_POOP_STRIDE,
  MAX_WIRE_POOPS,
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

/**
 * Die Größenformel des Drahtformats — die Summe ihrer Teile.
 *
 * Sie steht hier EINMAL (statt in jedem Test von Hand), damit eine neue Sektion
 * im Snapshot nicht an einer Stelle nachgezogen und an der nächsten vergessen
 * wird. Der Günther-Block ist immer dabei; die Haufen zählen einzeln.
 */
function formel(state) {
  const haufen = state.guenther?.haufen ?? [];
  return HEADER_SIZE
    + (state.entities ?? []).length * PLAYER_STRIDE
    + (state.projectiles ?? []).length * PROJECTILE_STRIDE
    + (state.crates ?? []).length * CRATE_STRIDE
    + (state.turrets ?? []).length * TURRET_STRIDE
    + GUENTHER_STRIDE
    + Math.min(haufen.length, MAX_WIRE_POOPS) * GUENTHER_POOP_STRIDE;
}

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

  assert.equal(encodeSnapshot(state).length, formel(state));

  // Und mit Projektilen stimmt sie auch.
  match.fire(match.activePlayerId, Math.PI / 4, 70);
  const mitProjektil = match.getState();
  assert.ok(mitProjektil.projectiles.length > 0, 'Testaufbau braucht ein Projektil');
  assert.equal(encodeSnapshot(mitProjektil).length, formel(mitProjektil));
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
   * Gemessen (Seed 42, 600 Schritte, 20 Hz) — MIT dem Günther-Block aus
   * Protokoll v7, der in JEDEM Snapshot steht:
   *
   *     12 Figuren (klein/groß-alt) → 225 B →  4,1 kB/s   (Budget 320 B / 6)
   *     40 Figuren (Krieg maximal)  → 645 B → 12,3 kB/s   (Budget 700 B / 14)
   *
   * Die alten Zahlen ohne Günther waren 204 B bzw. 624 B — der Kopf wächst um ein
   * Byte (Zählfeld [24]) und der Block kostet konstant GUENTHER_STRIDE = 6 B:
   * gemessen +7 B je Snapshot, dazu höchstens MAX_WIRE_POOPS × 4 = 24 B für die
   * Haufen, wenn welche liegen. Beide Budgets halten damit weiterhin; der
   * künstliche Höchstfall aus 40 Figuren, sechs Haufen und einem Projektil wie
   * einer Kiste misst 669 B und bleibt unter 700.
   *
   * Die Budgets selbst sind UNVERÄNDERT geblieben: Der Zuwachs ist mit 7 B
   * konstant plus 4 B je liegendem Haufen klein genug, dass er in den bestehenden
   * Spielraum passt — eine Lockerung wäre nicht zu begründen und würde den
   * Wächter entwerten.
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
    `Vierzig Figuren: ${krieg.maximum} Bytes (Budget: 700; gemessen 645)`);
  assert.ok(kbKrieg <= 14,
    `Vierzig Figuren: ${kbKrieg.toFixed(1)} kB/s (Budget: 14; gemessen 12,3)`);
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
  // die zum Matchbeginn ausgelost wird, plus der feste Günther-Block. Wären
  // Koordinaten Float32, käme hier deutlich mehr heraus.
  assert.ok((state.crates ?? []).length > 0,
    'Der Testaufbau braucht die Startkiste — sonst prüft er die Kistenbreite nicht mit');
  assert.equal(encodeSnapshot(state).length, formel(state));

  // Und die Stride passt zu den erwarteten Feldern: 2+2 (x,y) + 2 (health)
  // + 1 (alive/flags) + 1 (shield) + 1 (frozen) + 1 (Wasser) + Kopfzeilen.
  assert.ok(PLAYER_STRIDE >= 12 && PLAYER_STRIDE <= 16,
    `PLAYER_STRIDE ist ${PLAYER_STRIDE} — deutlich mehr als die erwarteten Felder`);
});

test('Günther kostet konstant 6 Byte plus 4 je Haufen — und bleibt im Budget', () => {
  /*
   * Protokoll v7 trägt Günther und seine Kackhaufen. Das ist ein Zuwachs in einem
   * Budget, das ein Wächter hält — also muss er beziffert sein und nicht bloß
   * „etwas größer":
   *
   *   Der Block ist IMMER dabei (auch wenn er nicht auftritt) → +GUENTHER_STRIDE.
   *   Ein liegender Haufen kostet je GUENTHER_POOP_STRIDE.
   *   Die Zahl der Haufen ist in der ENGINE gedeckelt (GUENTHER_POOP.maxPiles,
   *   „Älteste Haufen entfernen") — das Drahtformat folgt mit MAX_WIRE_POOPS,
   *   statt einen zweiten Deckel zu erfinden.
   *
   * Gemessen nach der Änderung: 40 Figuren + sechs Haufen + Projektil + Kiste
   * = 669 Byte, unter dem Kriegsbudget von 700.
   */
  const basis = {
    tick: 1, round: 1, wind: 0, activePlayerId: null,
    entities: [], projectiles: [], crates: [], turrets: [],
    guenther: { aktiv: true, x: 2329.2, y: 824, richtung: -1, haufen: [] },
  };

  const ohneFeld = encodeSnapshot({ ...basis, guenther: undefined }).length;
  const mit = encodeSnapshot(basis).length;
  // Ein Zustand ohne Listen kostet genau Kopf plus Block — der Block hängt NICHT
  // daran, ob der Zustand `guenther` kennt: Die Sektion ist fest, sonst müsste der
  // Kopf ihr Vorhandensein ansagen. Vor v7 waren es 24 Byte (HEADER_SIZE - 1,
  // ohne Zählfeld und Block) — der Zuwachs ist damit konstant 7 Byte je Snapshot.
  assert.equal(mit, HEADER_SIZE + GUENTHER_STRIDE,
    `Leerer Snapshot: ${mit} statt ${HEADER_SIZE + GUENTHER_STRIDE} Byte`);
  assert.equal(ohneFeld, mit,
    'Der Günther-Block ist optional geworden — er soll fest im Layout stehen');

  for (const anzahl of [1, 2, MAX_WIRE_POOPS]) {
    const haufen = Array.from({ length: anzahl }, (_, i) => ({ x: 100 + i * 10, y: 200 }));
    assert.equal(
      encodeSnapshot({ ...basis, guenther: { ...basis.guenther, haufen } }).length,
      mit + anzahl * GUENTHER_POOP_STRIDE,
      `${anzahl} Haufen kosten nicht ${anzahl} × ${GUENTHER_POOP_STRIDE} Byte`,
    );
  }

  // Mehr Haufen als der Deckel: Die Simulation lässt das nicht zu, ein fremder
  // Zustand könnte es trotzdem — der Snapshot darf dann nicht wachsen.
  const zuviel = Array.from({ length: MAX_WIRE_POOPS + 12 }, (_, i) => ({ x: i, y: i }));
  assert.equal(
    encodeSnapshot({ ...basis, guenther: { ...basis.guenther, haufen: zuviel } }).length,
    mit + MAX_WIRE_POOPS * GUENTHER_POOP_STRIDE,
    'Der Deckel der Haufenliste greift nicht',
  );

  // Der Höchstfall des Kriegsmodus MIT vollem Günther bleibt im Budget.
  const match = new MatchController({ seed: 42, teams: 8, playersPerTeam: 5 });
  match.start();
  match.fire(match.activePlayerId, Math.PI / 4, 70);
  const krieg = match.getState();
  const voll = {
    ...krieg,
    guenther: {
      ...krieg.guenther,
      aktiv: true,
      haufen: Array.from({ length: MAX_WIRE_POOPS }, (_, i) => ({ x: 200 + i * 40, y: 300 })),
    },
  };
  const groesse = encodeSnapshot(voll).length;
  assert.equal(krieg.entities.length, 40, 'Krieg: 8 Spieler × 5 Einheiten');
  assert.ok(groesse <= 700,
    `40 Figuren mit sechs Haufen: ${groesse} Bytes (Budget: 700; gemessen 669)`);
});
