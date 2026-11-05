/**
 * Historische Bestenliste: Elo-Wertung und Bestwerte über alle Zeiten.
 *
 * ## Was zählt
 *
 * Nur Partien, die der SERVER selbst gesehen hat, und nur solche mit
 * **mindestens zwei angemeldeten Menschen**. Lokale Partien am selben Gerät und
 * Gäste ohne Konto haben keine Kennung, die über eine Partie hinausreicht — sie
 * werden nicht verbucht. Ein Konto, das allein mit Gästen spielt, bekommt
 * deshalb keine Partie gutgeschrieben (sonst könnte man sich Siege gegen
 * Wegwerf-Gäste selbst erzeugen).
 *
 * ## Modi
 *
 * Gewertet wird je TEAM: Ein Konto gewinnt, wenn eines seiner Teams die
 * `winnerTeamId` des Matches trägt. Im Modus „jeder gegen jeden" ist jeder
 * Mensch sein eigenes Team — dann gewinnt genau der letzte Überlebende, alle
 * anderen verlieren. Die Auswertung braucht dafür keinen Sonderfall; sie liest
 * dieselbe Teamzuordnung wie 1v1, 2v2 usw. (Entscheidung des Auftraggebers
 * 2026-11-05, `docs/anforderungen-2026-11-05.md` §5.1).
 *
 * ## Elo
 *
 * Startwert 1000, K = 32, Erwartungswert nach der üblichen Formel
 * `1 / (1 + 10^((gegner - eigen) / 400))`. Bei mehr als zwei Teilnehmern wird
 * jedes Paar einzeln gerechnet und der Zugewinn gemittelt — so bleibt ein
 * Sieg gegen mehrere Starke genauso viel wert wie gegen einen. Ein
 * unentschiedenes Match (kein Gewinnerteam) gibt beiden 0,5.
 *
 * @module bestenliste
 */

import { randomUUID } from 'node:crypto';

/** Startwert jedes neuen Kontos. */
export const ELO_START = 1000;
/** K-Faktor: Wie stark ein Ergebnis die Wertung bewegt. */
export const ELO_K = 32;

/** Erwarteter Punktwert (0..1) von `eigene` gegen `gegner`. */
export function erwartungswert(eigene, gegner) {
  return 1 / (1 + 10 ** ((gegner - eigene) / 400));
}

/**
 * Elo-Änderung aus Sicht eines Kontos gegen beliebig viele Gegner.
 *
 * @param {number} eigene - eigene Wertung vor der Partie
 * @param {number[]} gegner - Wertungen aller anderen Teilnehmer
 * @param {number} punkte - 1 Sieg, 0,5 unentschieden, 0 Niederlage
 * @param {number} [k=ELO_K]
 * @returns {number} Änderung, auf ganze Punkte gerundet
 */
export function eloAenderung(eigene, gegner, punkte, k = ELO_K) {
  if (gegner.length === 0) return 0;
  let summe = 0;
  for (const wert of gegner) summe += k * (punkte - erwartungswert(eigene, wert));
  return Math.round(summe / gegner.length);
}

/** Siegquote als Zahl 0..1 oder `null`, wenn noch keine Partie gewertet wurde. */
export function siegquote(konto) {
  return konto.partien > 0 ? konto.siege / konto.partien : null;
}

/**
 * K/D-Verhältnis.
 *
 * Ohne Tod ist das Verhältnis nicht „unendlich", sondern die Zahl der Kills:
 * Eine Zahl, die man anzeigen und vergleichen kann. Beides wird offen benannt,
 * damit „beste K/D" nicht von einem einzigen Null-Tod-Spiel abhängt.
 */
export function kdVerhaeltnis(konto) {
  return konto.kills / Math.max(1, konto.tode);
}

/**
 * Verbucht eine abgeschlossene Online-Partie.
 *
 * @param {object} optionen
 * @param {object} optionen.speicher - KontoSpeicher
 * @param {object[]} optionen.seats - Sitzplätze der Lobby (mit `kontoId`, `teamId`, `entityId`)
 * @param {object} optionen.stats - `MatchStats` der Partie
 * @param {string} [optionen.lobbyId]
 * @param {string} [optionen.modus] - z. B. `2v2`, `ffa`
 * @param {number} [optionen.jetzt] - Zeitstempel (Tests injizieren ihn)
 * @returns {{verbucht: boolean, grund?: string, ergebnisse?: object[]}}
 */
export function verbuchePartie({ speicher, seats, stats, lobbyId = null, modus = 'unbekannt', jetzt = Date.now() }) {
  const nachKonto = new Map();
  for (const seat of seats ?? []) {
    if (!seat?.kontoId) continue;
    if (!nachKonto.has(seat.kontoId)) nachKonto.set(seat.kontoId, []);
    nachKonto.get(seat.kontoId).push(seat);
  }
  // Die Mindestbedingung: zwei ANGEMELDETE Menschen. Gäste zählen nicht mit.
  if (nachKonto.size < 2) {
    return { verbucht: false, grund: 'zu-wenig-konten' };
  }

  const konten = [];
  for (const [id, eigeneSeats] of nachKonto) {
    const konto = speicher.kontoNachId(id);
    if (!konto) continue; // Konto wurde zwischen Match-Ende und Verbuchung gelöscht.
    const zahlen = stats.fuerMehrere(eigeneSeats.map(seat => seat.entityId).filter(wert => wert !== null));
    const siegerTeam = stats.gewinnerTeamId;
    let ergebnis;
    if (!stats.entschieden || siegerTeam === null || siegerTeam === undefined) {
      ergebnis = 'unentschieden';
    } else if (eigeneSeats.some(seat => seat.teamId === siegerTeam)) {
      ergebnis = 'sieg';
    } else {
      ergebnis = 'niederlage';
    }
    konten.push({ konto, zahlen, ergebnis });
  }
  if (konten.length < 2) return { verbucht: false, grund: 'zu-wenig-konten' };

  const punkte = { sieg: 1, unentschieden: 0.5, niederlage: 0 };
  const ergebnisse = [];

  for (const eintrag of konten) {
    const eigeneWertung = eintrag.konto.elo;
    const andere = konten
      .filter(other => other !== eintrag)
      .map(other => other.konto.elo);
    const delta = eloAenderung(eigeneWertung, andere, punkte[eintrag.ergebnis]);
    const neueWertung = Math.max(0, eigeneWertung + delta);
    const zahlen = eintrag.zahlen ?? { schuesse: 0, treffer: 0, kills: 0, schaden: 0 };
    const tode = todeFuerFigur(stats, nachKonto.get(eintrag.konto.id));
    const fortschreibung = {
      elo: neueWertung,
      partien: eintrag.konto.partien + 1,
      siege: eintrag.konto.siege + (eintrag.ergebnis === 'sieg' ? 1 : 0),
      niederlagen: eintrag.konto.niederlagen + (eintrag.ergebnis === 'niederlage' ? 1 : 0),
      kills: eintrag.konto.kills + (zahlen.kills ?? 0),
      tode: eintrag.konto.tode + tode,
      schaden: eintrag.konto.schaden + (zahlen.schaden ?? 0),
      schuesse: eintrag.konto.schuesse + (zahlen.schuesse ?? 0),
      treffer: eintrag.konto.treffer + (zahlen.treffer ?? 0),
      beste_schuesse: Math.max(eintrag.konto.besteSchuesse, zahlen.schuesse ?? 0),
      zuletztAm: jetzt,
    };
    speicher.kontoAktualisieren(eintrag.konto.id, fortschreibung);
    speicher.partieEintragen({
      kontoId: eintrag.konto.id,
      lobbyId,
      zeit: jetzt,
      modus,
      teilnehmer: konten.length,
      ergebnis: eintrag.ergebnis,
      eloVorher: eigeneWertung,
      eloNachher: neueWertung,
      schuesse: zahlen.schuesse ?? 0,
      treffer: zahlen.treffer ?? 0,
      kills: zahlen.kills ?? 0,
      tode,
      schaden: zahlen.schaden ?? 0,
    });
    ergebnisse.push({
      kontoId: eintrag.konto.id,
      name: eintrag.konto.name,
      ergebnis: eintrag.ergebnis,
      eloVorher: eigeneWertung,
      eloNachher: neueWertung,
      eloAenderung: neueWertung - eigeneWertung,
      schuesse: zahlen.schuesse ?? 0,
      kills: zahlen.kills ?? 0,
      tode,
      schaden: zahlen.schaden ?? 0,
    });
  }

  return { verbucht: true, ergebnisse };
}

/**
 * Tode eines Kontos: Wie oft eine seiner Figuren gestorben ist.
 *
 * `MatchStats` führt Tode je FIGUR (es zählt nur für die Kill-Zuordnung). Für
 * die Rangliste braucht es die Summe über alle Figuren eines Kontos.
 */
function todeFuerFigur(stats, seats) {
  let tode = 0;
  for (const seat of seats ?? []) {
    if (seat.entityId !== null && stats.gestorben?.has(seat.entityId)) tode += 1;
  }
  return tode;
}

/** Ein Ranglisteneintrag in der Form, die Client und Tests lesen. */
function ranglistenZeile(konto, platz) {
  return {
    platz,
    id: konto.id,
    name: konto.name,
    elo: konto.elo,
    partien: konto.partien,
    siege: konto.siege,
    niederlagen: konto.niederlagen,
    siegquote: siegquote(konto),
    kills: konto.kills,
    tode: konto.tode,
    kd: kdVerhaeltnis(konto),
    schaden: konto.schaden,
    schuesse: konto.schuesse,
    besteSchuesse: konto.besteSchuesse,
  };
}

/**
 * Die Rangliste, nach Elo sortiert.
 *
 * Gleichstand: mehr Siege zuerst, dann der Name (stabil und für Leser
 * nachvollziehbar). Konten ohne gewertete Partie stehen mit ihrer Startwertung
 * darin — sie sind Teil der Liste, aber noch ohne Bilanz.
 */
export function rangliste(speicher, { grenze = 100 } = {}) {
  const konten = speicher.kontenAlle()
    .slice()
    .sort((a, b) => b.elo - a.elo || b.siege - a.siege || a.name.localeCompare(b.name, 'de'));
  return konten.slice(0, grenze).map((konto, index) => ranglistenZeile(konto, index + 1));
}

/**
 * Bestwerte über alle Zeiten.
 *
 * Vier Rekorde, wie im Auftrag genannt: meiste Schüsse in EINER Partie, beste
 * und schlechteste K/D (über alle Partien), meiste Siege. Jeder Rekord nennt
 * Namen und Wert; gibt es keinen Träger, ist das Feld `null` — nicht 0, denn
 * „niemand hat je geschossen" ist etwas anderes als „der Beste schoss 0".
 */
export function bestwerte(speicher) {
  const konten = speicher.kontenAlle();
  const mitPartie = konten.filter(konto => konto.partien > 0);

  const bester = (liste, wert, bedingung = () => true) => {
    let treffer = null;
    for (const konto of liste) {
      if (!bedingung(konto)) continue;
      const zahl = wert(konto);
      if (!Number.isFinite(zahl)) continue;
      if (treffer === null || zahl > treffer.wert) treffer = { name: konto.name, id: konto.id, wert: zahl };
    }
    return treffer;
  };
  const schlechtester = (liste, wert, bedingung) => {
    let treffer = null;
    for (const konto of liste) {
      if (!bedingung(konto)) continue;
      const zahl = wert(konto);
      if (!Number.isFinite(zahl)) continue;
      if (treffer === null || zahl < treffer.wert) treffer = { name: konto.name, id: konto.id, wert: zahl };
    }
    return treffer;
  };

  return {
    /** Meiste Schüsse in einer einzelnen Partie. */
    meisteSchuesse: bester(konten, konto => konto.besteSchuesse, konto => konto.besteSchuesse > 0),
    /** Beste K/D (nur Konten mit mindestens einem Kill). */
    besteKd: bester(mitPartie, kdVerhaeltnis, konto => konto.kills > 0),
    /** Schlechteste K/D (nur Konten, die mindestens einmal gestorben sind). */
    schlechtesteKd: schlechtester(mitPartie, kdVerhaeltnis, konto => konto.tode > 0),
    /** Meiste Siege insgesamt. */
    meisteSiege: bester(mitPartie, konto => konto.siege, konto => konto.siege > 0),
  };
}

/**
 * Prüfsumme der aktuellen Rangliste — für Betrieb und Tests.
 *
 * Sie ändert sich genau dann, wenn sich eine gewertete Zahl ändert, und ist
 * damit ein billiger Nachweis, dass eine Verbuchung wirklich geschrieben wurde.
 */
export function ranglistenStand(speicher) {
  return rangliste(speicher, { grenze: Number.MAX_SAFE_INTEGER })
    .map(zeile => `${zeile.name}:${zeile.elo}:${zeile.partien}:${zeile.siege}`)
    .join('|');
}

/** Neue Kontokennung. */
export function neueKontoId() {
  return randomUUID();
}

export default {
  ELO_START, ELO_K, erwartungswert, eloAenderung, verbuchePartie, rangliste, bestwerte,
};
