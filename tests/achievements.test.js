import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  CATEGORIES,
  MUSTER_ANZAHL,
  TIERS,
  kennzahlen,
  neueErfolge,
  pruefeBedingung,
  uebersicht,
  werteAus,
} from '../src/shared/achievements.js';

/**
 * Erfolge.
 *
 * Geprüft wird der MECHANISMUS, nicht der Inhalt: Die beigefügten Einträge sind
 * Muster (`muster: true`), weil Namen, Texte, Symbole und Belohnungen eine
 * Gestaltungsentscheidung sind und nicht erfunden wurden. Die Tests sind
 * deshalb so geschrieben, dass sie mit einem ausgetauschten Katalog weiterhin
 * gelten — sie prüfen das Format und die Auswertung, nicht einzelne Titel.
 */

/** Kennzahlen mit Vorgaben, die sich je Test überschreiben lassen. */
function werte(ueber = {}) {
  return kennzahlen(
    ueber.partie ?? null,
    ueber.profil ?? null,
  );
}

/** Ein Partie-Ergebnis, wie `MatchStats#zusammenfassung()` es liefert. */
function partie({ sieg = false, schuesse = 10, treffer = 4, schaden = 300, zuege = 5 } = {}) {
  return {
    runden: 3,
    ticks: 600,
    dauerSekunden: 120,
    entschieden: true,
    gewinnerTeamId: sieg ? 0 : 1,
    schadenGesamt: schaden,
    eigener: {
      playerId: 1,
      teamId: 0,
      schuesse,
      treffer,
      schaden,
      absorbierterSchaden: 0,
      trefferquote: schuesse > 0 ? treffer / schuesse : null,
      zuege,
      lieblingswaffe: null,
      sieg,
    },
  };
}

/** Ein Profil, wie `PlayerProfile#toJSON()` es liefert. */
function profil(ueber = {}) {
  return {
    partien: 0, siege: 0, niederlagen: 0, serie: 0, serieRekord: 0,
    schuesse: 0, treffer: 0, schaden: 0, absorbierterSchaden: 0, zuege: 0,
    spielzeitSekunden: 0, waffen: {}, fraktionen: {},
    ...ueber,
  };
}

test('Der Katalog hält sein eigenes Format ein', () => {
  /*
   * Der Katalog wird ausgetauscht, wenn die Inhalte kommen. Damit das ohne
   * Überraschungen geht, muss JEDER Eintrag die Felder tragen, die die Auswertung
   * und die Anzeige erwarten. Ein fehlendes Feld würde sonst erst im Menü
   * auffallen — oder als „undefined" auf dem Bildschirm stehen.
   */
  const ids = new Set();
  for (const e of ACHIEVEMENTS) {
    assert.equal(typeof e.id, 'string', `id fehlt: ${JSON.stringify(e)}`);
    assert.ok(e.id.length > 0, 'Leere Kennung');
    assert.ok(!ids.has(e.id), `Doppelte Kennung: ${e.id}`);
    ids.add(e.id);

    assert.ok(TIERS.includes(e.tier), `${e.id}: unbekannte Stufe „${e.tier}"`);
    assert.ok(Object.values(CATEGORIES).includes(e.category),
      `${e.id}: unbekannte Gruppe „${e.category}"`);
    assert.ok(typeof e.title === 'string' && e.title.length > 0, `${e.id}: kein Titel`);
    assert.ok(typeof e.text === 'string' && e.text.length > 0, `${e.id}: kein Text`);
    assert.ok(typeof e.hint === 'string' && e.hint.length > 0,
      `${e.id}: kein Hinweis — die Übersicht soll zeigen, WIE man ihn holt`);
    assert.ok(typeof e.icon === 'string' && e.icon.length > 0, `${e.id}: kein Symbol`);
    assert.ok('reward' in e, `${e.id}: kein Belohnungsfeld`);
    assert.ok(e.condition && typeof e.condition === 'object', `${e.id}: keine Bedingung`);
  }

  assert.ok(ACHIEVEMENTS.length > 0);
  assert.equal(Object.keys(ACHIEVEMENTS_BY_ID).length, ACHIEVEMENTS.length);
});

test('Die Übersicht meldet die Muster als Muster', () => {
  /*
   * Solange die Inhalte fehlen, darf das Menü nicht behaupten, es gäbe 100
   * Erfolge. Die Zahl der Platzhalter wird mitgeführt und angezeigt — sonst
   * sähe ein Musterkatalog wie ein fertiger aus.
   */
  const u = uebersicht(werte(), new Set());
  assert.equal(u.musterAnzahl, MUSTER_ANZAHL);
  assert.ok(MUSTER_ANZAHL > 0, 'Es soll Muster geben, damit die Mechanik prüfbar ist');
  assert.ok(u.musterAnzahl <= u.gesamt);
  assert.ok(u.gesamt < 100,
    `Der Katalog hat ${u.gesamt} Einträge — die geforderten 100 Erfolge sind Inhalt und `
    + 'noch nicht geliefert; die Zahl darf nicht durch Muster vorgetäuscht werden');
});

test('„mindestens“ rechnet Stand, Ziel und Fortschritt', () => {
  const bedingung = { kind: 'mindestens', kennzahl: 'schaden', wert: 500 };

  assert.deepEqual(pruefeBedingung(bedingung, { schaden: 0 }), {
    erreicht: false, stand: 0, ziel: 500, fortschritt: 0,
  });
  assert.deepEqual(pruefeBedingung(bedingung, { schaden: 250 }), {
    erreicht: false, stand: 250, ziel: 500, fortschritt: 0.5,
  });
  const voll = pruefeBedingung(bedingung, { schaden: 500 });
  assert.equal(voll.erreicht, true);
  assert.equal(voll.fortschritt, 1);

  // Über dem Ziel bleibt der Fortschritt bei 1 — nicht bei 2.
  assert.equal(pruefeBedingung(bedingung, { schaden: 5000 }).fortschritt, 1);
});

test('Eine fehlende Kennzahl zählt als 0 und wirft nicht', () => {
  // Wichtig, damit ein Erfolg nicht daran scheitert, dass gerade keine Partie
  // läuft: Die Kennzahlen stammen aus zwei Quellen, eine kann fehlen.
  const r = pruefeBedingung({ kind: 'mindestens', kennzahl: 'gibt_es_nicht', wert: 5 }, {});
  assert.equal(r.erreicht, false);
  assert.equal(r.stand, 0);
  assert.equal(r.fortschritt, 0);

  // Und der Aufruf mit gar keinen Quellen liefert lauter Nullen.
  const k = kennzahlen();
  assert.equal(k.schaden, 0);
  assert.equal(k.partien, 0);
  assert.equal(k.trefferquote, 0);
  assert.equal(k.schaden_pro_minute, 0);
});

test('Die Mindestbasis verhindert einen Erfolg nach zwei glücklichen Treffern', () => {
  /*
   * Eine Trefferquote von 50 % ist mit 1 von 2 Schüssen erreicht und sagt nichts.
   * Mit `mindestbasis` muss zuerst eine Mindestzahl Schüsse zusammenkommen —
   * erst danach zählt die Quote.
   */
  const bedingung = {
    kind: 'mindestens',
    kennzahl: 'trefferquote',
    wert: 0.5,
    mindestbasis: { kennzahl: 'schuesse', wert: 20 },
  };

  // Quote erfüllt, Basis nicht.
  const frueh = pruefeBedingung(bedingung, { trefferquote: 0.9, schuesse: 3 });
  assert.equal(frueh.erreicht, false, 'Der Erfolg kam zu früh');
  // Der Fortschritt zeigt die erste Hürde: 3 von 20 Schüssen.
  assert.equal(frueh.fortschritt, 0.15);
  assert.equal(frueh.basisStand, 3);

  // Basis erfüllt, Quote nicht.
  const schwach = pruefeBedingung(bedingung, { trefferquote: 0.3, schuesse: 40 });
  assert.equal(schwach.erreicht, false);

  // Beides erfüllt.
  const gut = pruefeBedingung(bedingung, { trefferquote: 0.55, schuesse: 40 });
  assert.equal(gut.erreicht, true);
  assert.equal(gut.fortschritt, 1);
});

test('Ein einmal erreichter Erfolg verschwindet nicht wieder', () => {
  /*
   * `serie_rekord` steht im Profil und fällt nie — aber ein Erfolg über die
   * AKTUELLE Serie könnte wieder darunter fallen, wenn es schlecht läuft. Ein
   * Erfolg, der sich zurücknimmt, wäre kein Erfolg.
   */
  const erreicht = new Set(['muster_siege_10']);
  const werteJetzt = werte({ profil: profil({ siege: 2, partien: 12 }) });

  const alle = werteAus(werteJetzt, erreicht);
  const vorher = alle.find(e => e.id === 'muster_siege_10');
  assert.ok(vorher, 'Der Erfolg fehlt in der Auswertung');
  assert.equal(vorher.erreicht, true, 'Der erreichte Erfolg wurde zurückgenommen');
  // Der Stand zeigt trotzdem die Wahrheit (2 von 10), nicht das Ziel.
  assert.equal(vorher.stand, 2);
});

test('Neue Erfolge werden nur einmal gemeldet', () => {
  /*
   * Für die Meldung „Erfolg freigeschaltet" braucht der Aufrufer die NEUEN. Eine
   * Auswertung, die alle erreichten zurückgibt, würde bei jedem Bild alle alten
   * erneut melden.
   */
  const erreicht = new Set();
  const w = werte({ partie: partie({ schuesse: 5 }), profil: profil({ partien: 1 }) });

  const ersteMeldung = neueErfolge(w, erreicht);
  assert.ok(ersteMeldung.length > 0, 'Der Testaufbau muss Erfolge freischalten');
  assert.ok(ersteMeldung.every(e => e.id.startsWith('muster_')));

  // Jetzt gelten sie als erreicht.
  for (const e of ersteMeldung) erreicht.add(e.id);
  const zweiteMeldung = neueErfolge(w, erreicht);
  assert.deepEqual(zweiteMeldung, [], 'Alte Erfolge wurden erneut gemeldet');
});

test('Die Kennzahlen führen Partie und Profil getrennt', () => {
  /*
   * `schaden_partie` und `schaden` sind verschiedene Zahlen. Ein Erfolg über die
   * Partie („500 Schaden in EINER Partie") und einer über das Profil („5000
   * Schaden gesamt") dürfen sich nicht vermischen — sonst wäre der leichte
   * Erfolg mit angesammeltem Schaden aus hundert Partien zu holen.
   */
  const k = werte({
    partie: partie({ schaden: 700 }),
    profil: profil({ schaden: 12_000, partien: 40, schuesse: 400, treffer: 200, spielzeitSekunden: 3600 }),
  });

  assert.equal(k.schaden_partie, 700);
  assert.equal(k.schaden, 12_000);
  assert.equal(k.partien, 40);
  assert.equal(k.trefferquote, 0.5);
  assert.equal(k.spielzeit_sekunden, 3600);
  assert.equal(k.schaden_pro_minute, 200);
  assert.equal(k.sieg_partie, 0);
});

test('Der Sieg der Partie fließt als Zahl ein', () => {
  assert.equal(werte({ partie: partie({ sieg: true }) }).sieg_partie, 1);
  assert.equal(werte({ partie: partie({ sieg: false }) }).sieg_partie, 0);
  // Ohne Partie: 0, nicht undefined.
  assert.equal(werte({}).sieg_partie, 0);
});

test('Die Serie berücksichtigt nur Siege, nicht Niederlagen', () => {
  /*
   * `serieRekord` wird im Profil nur durch Siegesserien erhöht. Ein Erfolg über
   * den Rekord darf nicht durch eine Niederlagenserie ausgelöst werden — sonst
   * gäbe es einen Erfolg fürs Verlieren.
   */
  const vieleNiederlagen = werte({ profil: profil({ serie: -8, serieRekord: 0, niederlagen: 8 }) });
  assert.equal(vieleNiederlagen.serie_rekord, 0);
  const u = werteAus(vieleNiederlagen, new Set());
  const rekordErfolge = u.filter(e => e.condition.kennzahl === 'serie_rekord');
  assert.ok(rekordErfolge.length > 0, 'Es soll einen Erfolg über den Serienrekord geben');
  for (const e of rekordErfolge) {
    assert.equal(e.erreicht, false, `${e.id} wurde durch eine Niederlagenserie freigeschaltet`);
  }
});

test('Die Übersicht zählt richtig und gruppiert', () => {
  const w = werte({
    partie: partie({ schuesse: 12, schaden: 600 }),
    profil: profil({ partien: 12, siege: 11, schaden: 5200, schuesse: 300, treffer: 160, spielzeitSekunden: 4000, waffen: { pa_001: 50, pa_002: 30, pa_003: 20 } }),
  });

  const u = uebersicht(w, new Set());
  assert.equal(u.gesamt, ACHIEVEMENTS.length);
  assert.ok(u.erreicht > 0, 'Der Testaufbau muss Erfolge erfüllen');
  assert.ok(u.erreicht <= u.gesamt);
  assert.equal(u.anteil, u.erreicht / u.gesamt);

  // Die Summe über die Gruppen muss die Gesamtzahl ergeben — sonst fällt in der
  // Anzeige etwas weg.
  const summe = u.gruppen.reduce((a, g) => a + g.gesamt, 0);
  assert.equal(summe, u.gesamt, 'Die Gruppen decken nicht alle Erfolge ab');

  // Jede Gruppe zählt ihre erreichten selbst.
  for (const g of u.gruppen) {
    assert.equal(g.erreicht, g.eintraege.filter(e => e.erreicht).length, `${g.label}: falsch gezählt`);
  }

  // Und die Stufen decken ebenfalls alles ab.
  const stufenSumme = u.nachStufe.reduce((a, s) => a + s.gesamt, 0);
  assert.equal(stufenSumme, u.gesamt, 'Die Stufen decken nicht alle Erfolge ab');
  for (const s of u.nachStufe) {
    assert.equal(s.gesamt, ACHIEVEMENTS.filter(e => e.tier === s.tier).length);
  }
});

test('Jeder Erfolg nennt einen Hinweis, wie er zu holen ist', () => {
  /*
   * Die Anforderung lautet ausdrücklich: eine Übersicht mit Hinweis, wie die
   * feindlichen zu holen sind. Ein Hinweis, der den Titel wiederholt, hilft
   * nicht — er muss etwas sagen, was der Titel nicht sagt.
   */
  for (const e of ACHIEVEMENTS) {
    assert.ok(e.hint.length >= 15, `${e.id}: Hinweis zu kurz, um zu helfen`);
    assert.notEqual(e.hint, e.title, `${e.id}: Der Hinweis ist nur der Titel`);
    assert.notEqual(e.hint, e.text, `${e.id}: Der Hinweis wiederholt den Text`);
  }
});

test('Die Stufen sind vollständig benannt', () => {
  // Die Anzeige geht über TIERS; eine Stufe ohne Eintrag wäre eine leere Zeile.
  for (const tier of TIERS) {
    assert.ok(ACHIEVEMENTS.some(e => e.tier === tier),
      `Keine Erfolge der Stufe „${tier}" — die Anzeige hätte eine leere Zeile`);
  }
});
