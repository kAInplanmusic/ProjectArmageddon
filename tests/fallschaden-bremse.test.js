/**
 * WACHE: Der Fallschaden bremst — ein Sprung nicht, viele Sprünge tödlich.
 *
 * ## Warum diese Datei
 *
 * Die Entscheidung des Auftraggebers, wörtlich: „sprung unbegrenzt, fallschaden
 * bremst den character (somit kein freier flug)". Die Sprunggrenze war schon
 * entfernt; der Fallschaden bremste aber NICHT, und der Grund war nicht die
 * Schwelle, sondern die LANDUNG.
 *
 * ## Der Befund, auf dem diese Tests stehen (gemessen, Seed 4242/606/2025)
 *
 * Ein gesetztes Sinktempo (kein Geländezufall) auf einer STEHENDEN Figur:
 *
 * | gesetztes `vy` | Vorzustand | Jetzt |
 * | ---: | --- | --- |
 * | 12 px/Takt | 3,12 Schaden, landet | 3,12 Schaden, landet |
 * | 20 px/Takt | **0,00 Schaden** — Figur bleibt bei `y = Start`, `vy` wächst auf 22,52 | 20,72 Schaden, landet auf der Oberfläche |
 * | 60 px/Takt | **0,00 Schaden**, `vy` wächst auf 62,52 | 108,72 Schaden — tödlich |
 *
 * Die Punktprobe der Landung (`isSolid(nextY) && !isSolid(nextY − 11)`) sprang
 * bei schnellem Fall ÜBER die Geländekruste, las „nicht gelandet" und ließ die
 * Figur mit unbegrenzt wachsendem `vy` stehen. Deshalb gab es keinen Fallschaden
 * genau dort, wo er bremsen soll. Die Behebung tastet den Fallweg ab
 * (`characterSystem.js#ersteSolideZeile`).
 *
 * ## Die Leiter der Luft-Sprünge (dieselbe Messung, vorher → jetzt)
 *
 * | Luft-Sprünge | Vorzustand | Jetzt | Leben danach |
 * | ---: | ---: | ---: | ---: |
 * | 1 (Bodensprung) | 0,00 | 0,00 | 96/96 |
 * | 2 (+1) | 4,19 | 10,79 | 85,2/96 |
 * | 3 (+2) | 8,81 | 22,01 | 74,0/96 |
 * | 4 (+3) | **0,00** (`vy` 201!) | 33,23 | 62,8/96 |
 * | 6 (+5) | **0,00** (`vy` 201!) | 53,82 | 42,2/96 |
 * | 10 (+9) | 30,98 bzw. **0,00** | 86,69–92,23 | 3,8–9,3/96 |
 *
 * „+n" heißt: n Sprünge IN DER LUFT. Die Zahlen stehen in
 * `src/shared/config/fallschaden.js` (Regel) und in `docs/fallschaden-bremse.md`
 * (Messung und Rechnung).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { FALLSCHADEN } from '../src/shared/config/fallschaden.js';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

/** Ein Zug, der nie endet: der Spieler bleibt am Zug (wie in `weapon-identity`). */
const ZUG = 1_000_000_000;

/** Ein Match mit einer Figur, die auf festem Grund steht. */
function matchMitSpieler(seed) {
  const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: ZUG });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  for (let i = 0; i < 4000; i += 1) {
    if (match.isGrounded(spieler)) break;
    match.step();
    match.consumeEvents();
  }
  return { match, spieler };
}

/** Erste feste Zeile unterhalb einer Spalte — der Boden, auf dem sie steht. */
function oberflaeche(match, x, abY = 0) {
  for (let y = Math.floor(abY); y < match.terrain.height; y += 1) {
    if (match.terrain.isSolid(Math.floor(x), y)) return y;
  }
  return null;
}

/**
 * Bodensprung, dann `luft` Sprünge IN DER LUFT (je am Gipfel), danach ein festes
 * Beobachtungsfenster. Gibt den Schaden und das hoechste Sinktempo zurueck.
 */
function sprungfolge(seed, luft, { fenster = 500, spam = 0 } = {}) {
  const { match, spieler } = matchMitSpieler(seed);
  const max = match.world.getComponent(spieler, 'Health', 'max');
  let angenommen = 0;

  const springe = () => { if (match.jump(spieler, 0).ok) angenommen += 1; };
  springe();
  if (spam > 0) {
    for (let i = 0; i < spam; i += 1) { match.step(); match.consumeEvents(); springe(); }
  } else {
    for (let n = 0; n < luft; n += 1) {
      for (let i = 0; i < 400; i += 1) {
        match.step();
        match.consumeEvents();
        if ((match.world.getComponent(spieler, 'Velocity', 'y') ?? 0) >= 0) break;
      }
      springe();
    }
  }

  let schaden = 0;
  let aufprall = 0;
  let treffer = 0;
  for (let i = 0; i < fenster; i += 1) {
    const vy = match.world.getComponent(spieler, 'Velocity', 'y') ?? 0;
    if (vy > aufprall) aufprall = vy;
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'fall_damage' && ereignis.payload.entityId === spieler) {
        schaden += ereignis.payload.damage;
        treffer += 1;
      }
    }
    if (!match.isPlayerAlive(spieler)) break;
  }

  return {
    match, spieler, angenommen, schaden, aufprall, treffer, max,
    leben: match.world.getComponent(spieler, 'Health', 'current'),
    tot: !match.isPlayerAlive(spieler),
    y: match.world.getComponent(spieler, 'Position', 'y'),
    vy: match.world.getComponent(spieler, 'Velocity', 'y') ?? 0,
  };
}

/** Sturz OHNE Sprung aus `hoehe` ueber dem Grund — die Geländekante. */
function kante(seed, hoehe) {
  const { match, spieler } = matchMitSpieler(seed);
  const x = match.world.getComponent(spieler, 'Position', 'x');
  const grund = oberflaeche(match, x);
  assert.ok(grund !== null, 'Vorbedingung: die Spalte hat einen Boden');
  match.world.setComponent(spieler, 'Position', 'y', grund - hoehe);
  match.world.setComponent(spieler, 'Velocity', 'y', 0);
  match.world.setComponent(spieler, 'Velocity', 'x', 0);

  let schaden = 0;
  let aufprall = 0;
  for (let i = 0; i < 400; i += 1) {
    const vy = match.world.getComponent(spieler, 'Velocity', 'y') ?? 0;
    if (vy > aufprall) aufprall = vy;
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'fall_damage' && ereignis.payload.entityId === spieler) schaden += ereignis.payload.damage;
    }
  }
  return { schaden, aufprall, y: match.world.getComponent(spieler, 'Position', 'y'), grund };
}

/* ------------------------------------------------------------ Die Schwelle */

test('Ein einzelner Sprung kostet kein Leben — er landet unter der Schwelle', () => {
  /*
   * Das ist die Zusage des Zielbilds: „Ein einzelner Sprung auf flachem Boden:
   * kein oder kaum Schaden". Gemessen landet er mit 9,62 px/Takt; die Schwelle
   * liegt bei 11. Der Abstand ist klein (0,96), deshalb steht er hier als Zahl:
   * Wer die Schwelle senkt, bricht diesen Test — und genau das soll er.
   */
  const r = sprungfolge(606, 0);
  assert.equal(r.angenommen, 1, 'Vorbedingung: der Bodensprung muss angenommen werden');
  assert.ok(r.aufprall < FALLSCHADEN.schwelle,
    `Der Sprung landet mit ${r.aufprall.toFixed(2)} px/Takt — nicht mehr unter der Schwelle ${FALLSCHADEN.schwelle}`);
  assert.equal(r.schaden, 0, `Ein einzelner Sprung darf kein Leben kosten, kostete aber ${r.schaden.toFixed(2)}`);
});

/* --------------------------------------------- Die Leiter der Luft-Sprünge */

test('Ein Luft-Sprung kostet spürbar Leben (der Doppelsprung ist nicht gratis)', () => {
  const r = sprungfolge(606, 1);
  assert.equal(r.angenommen, 2, 'Vorbedingung: Bodensprung + ein Luft-Sprung');
  assert.ok(r.schaden > 5 && r.schaden < 20,
    `Ein Luft-Sprung muss spürbar, aber überlebbar sein — gemessen waren 10,79, jetzt ${r.schaden.toFixed(2)}`);
});

test('Zwei Luft-Sprünge kosten rund ein Viertel des Lebens', () => {
  const r = sprungfolge(606, 2);
  assert.ok(r.schaden > 15,
    `Zwei Luft-Sprünge müssen deutlich kosten (gemessen 22,01), kosteten aber ${r.schaden.toFixed(2)}`);
  assert.ok(r.schaden < r.max,
    'Zwei Luft-Sprünge dürfen noch nicht tödlich sein — sonst ist der Zuschlag zu hart');
});

test('Drei Luft-Sprünge kosten ein Drittel des Lebens', () => {
  const r = sprungfolge(606, 3);
  assert.ok(r.schaden > 25,
    `Drei Luft-Sprünge müssen deutlich kosten (gemessen 33,23), kosteten aber ${r.schaden.toFixed(2)}`);
});

test('Sehr viele Luft-Sprünge bringen den Charakter an den Rand des Todes', () => {
  /*
   * Das ist die BREMMSE. Zwei Seeds, weil eine Zahl allein nichts beweist: der
   * Aufprall hängt am Gelände unter der Figur (die Sprunghöhe ist rein
   * ballistisch, der Landeort nicht).
   */
  for (const seed of [606, 2025]) {
    const r = sprungfolge(seed, 9);
    assert.equal(r.angenommen, 10, `Vorbedingung (Seed ${seed}): Bodensprung + neun Luft-Sprünge`);
    assert.ok(r.schaden > 70,
      `Seed ${seed}: neun Luft-Sprünge müssen > 70 Schaden kosten, kosteten ${r.schaden.toFixed(2)}`);
    assert.ok(r.leben < r.max * 0.25,
      `Seed ${seed}: nach neun Luft-Sprüngen müssen unter 25 % Leben stehen — `
      + `${r.leben.toFixed(1)} von ${r.max}`);
  }
});

test('Dauerfeuer im Sprung ist tödlich — kein freier Flug', () => {
  const r = sprungfolge(606, 0, { spam: 200 });
  assert.ok(r.schaden > 500,
    `Wer in jedem Takt springt, muss den Aufprall zahlen — Schaden war ${r.schaden.toFixed(2)}`);
  assert.equal(r.tot, true, 'Dauerfeuer im Sprung muss tödlich enden');
});

/* ------------------------------------------------ Die Geländekante (ohne Sprung) */

test('Eine Geländekante OHNE Sprung zahlt nur den physikalischen Sturz', () => {
  /*
   * Das Zielbild verlangt: „Eine normale Geländekante (ohne Sprung):
   * unverändert gegenüber heute." Gemessen (Seed 606): 40 px Sturz landen mit
   * 5,46 px/Takt, 117 px mit 9,66 — beide unter der Schwelle, also 0 Schaden.
   * Der Zuschlag hängt am LUFT-Sprung und darf hier nicht wirken.
   */
  const flach = kante(606, 40);
  assert.ok(flach.aufprall > 5 && flach.aufprall < 6,
    `40 px Sturz muss mit rund 5,46 px/Takt landen, landete mit ${flach.aufprall.toFixed(2)}`);
  assert.equal(flach.schaden, 0, `Eine flache Kante darf nichts kosten, kostete ${flach.schaden.toFixed(2)}`);

  const stufe = kante(606, 117);
  assert.ok(stufe.aufprall > 9 && stufe.aufprall < 11,
    `117 px Sturz muss mit rund 9,66 px/Takt landen, landete mit ${stufe.aufprall.toFixed(2)}`);
  assert.equal(stufe.schaden, 0, `Eine Stufe darf nichts kosten, kostete ${stufe.schaden.toFixed(2)}`);
});

/* ------------------------------------------------- Die Landung selbst (Fund) */

test('Ein schneller Aufprall wird GELANDET — die Figur friert nicht mehr im Gelände', () => {
  /*
   * Der Befund, gemessen am Vorzustand: Bei gesetztem `vy = 20` blieb eine
   * stehende Figur bei `y = Start` STEHEN, `vy` wuchs auf 22,52 (und bei `vy =
   * 60` auf 62,52), und es gab **0 Fallschaden**. Die Punktprobe sprang über die
   * Geländekruste. Jetzt zählt die erste feste Zeile auf dem Fallweg: Der
   * Aufprall kostet (20 + 0,42 − 11) · 2,2 = 20,72 und die Figur steht danach auf
   * dem Boden.
   */
  const { match, spieler } = matchMitSpieler(606);
  const x = match.world.getComponent(spieler, 'Position', 'x');
  const grund = oberflaeche(match, x);
  match.world.setComponent(spieler, 'Velocity', 'y', 20);

  let schaden = 0;
  for (let i = 0; i < 400; i += 1) {
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'fall_damage' && ereignis.payload.entityId === spieler) schaden += ereignis.payload.damage;
    }
  }

  assert.ok(Math.abs(schaden - 20.72) < 0.5,
    `Der Aufprall mit 20 px/Takt muss 20,72 kosten, kostete ${schaden.toFixed(2)}`);
  const y = match.world.getComponent(spieler, 'Position', 'y');
  assert.ok(Math.abs(y - (grund - PLAYER_HALF_HEIGHT)) <= 12,
    `Die Figur muss auf der Oberfläche stehen (${grund - PLAYER_HALF_HEIGHT} ± 12), stand aber auf y = ${y.toFixed(1)}`);
  const vy = match.world.getComponent(spieler, 'Velocity', 'y') ?? 0;
  assert.ok(vy <= 1,
    `Nach der Landung darf das Sinktempo nicht weiterlaufen (Vorzustand: 22,52) — es ist ${vy.toFixed(2)}`);
});

/* ------------------------------------------------------- Die Schuld (Zähler) */

test('Die Schuld aus Luft-Sprüngen wird beim Aufsetzen beglichen', () => {
  /*
   * Ohne diese Zusage könnte die Schuld über einen Sprung hinaus hängen bleiben
   * und den NÄCHSTEN Aufprall bestrafen. Der Zähler lebt im CharacterSystem
   * (`meldeLuftsprung`), gesetzt vom Motor (`MatchController.jump`).
   */
  const { match, spieler } = matchMitSpieler(606);
  const character = match.world.getSystem('character');
  assert.equal(character.luftsprungeSeitBoden(spieler), 0, 'Ein frischer Zug beginnt ohne Schuld');

  match.jump(spieler, 0);
  assert.equal(character.luftsprungeSeitBoden(spieler), 0, 'Der Bodensprung ist keine Schuld');

  for (let i = 0; i < 30; i += 1) { match.step(); match.consumeEvents(); }
  assert.equal(match.jump(spieler, 0).ok, true, 'Der Luft-Sprung muss angenommen werden');
  assert.equal(character.luftsprungeSeitBoden(spieler), 1, 'Ein Luft-Sprung ist eine Schuld');

  for (let i = 0; i < 600; i += 1) {
    match.step();
    match.consumeEvents();
    if (match.isGrounded(spieler)) break;
  }
  assert.equal(character.luftsprungeSeitBoden(spieler), 0,
    'Nach der Bodenberührung muss die Schuld beglichen sein');
});
