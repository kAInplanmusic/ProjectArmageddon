/**
 * Erfolge.
 *
 * ## Was hier Mechanik ist und was Inhalt
 *
 * Diese Datei enthält den **Mechanismus**: wie ein Erfolg definiert wird, wie er
 * ausgewertet und fortgeschrieben wird, und wie der Fortschritt aussieht. Die
 * **Inhalte** stehen als Tabelle darunter (`ACHIEVEMENTS`).
 *
 * **Stand 2026-09-20: die Inhalte sind gesetzt.** Die Entscheidung über Namen,
 * Texte, Symbole und Belohnungen war ausdrücklich dem Auftraggeber vorbehalten;
 * sie ist gefallen und in der Tabelle umgesetzt:
 *
 *  - **11 Erfolge**, verteilt auf sechs Gruppen und vier Stufen.
 *  - **geprüfte Schwellen:** Jede Schwelle ist gegen gemessene Partiewerte
 *    gestellt (`npm run check:achievements`); das Werkzeug endet mit Exit-Code 1,
 *    wenn eine PARTIE-Schwelle oder Rate unter 20 % des Ziels liegt. Zwei
 *    Schwellen wurden dabei korrigiert:
 *      - „200 Schaden je Minute" → **20** (gemessen ~7/min).
 *      - „500 Schaden in einer Partie" → **300** (gemessen 96 im Mittel,
 *        143 im besten Lauf).
 *    Kumulative Ziele (Gesamtschaden, Partien, Spielzeit) werden hochgerechnet
 *    statt benotet — sie brauchen Zeit, sind aber nicht unerreichbar.
 *  - **keine Belohnungen** (`reward: null`): Es gibt kein Vergabesystem. Ein
 *    Text wie „schaltet X frei" wäre eine Behauptung über etwas, das nicht
 *    passiert.
 *  - **die Kennungen behalten ihr Präfix `muster_`** — `id` ist laut Format
 *    stabil, damit ein Fortschritt in `localStorage` nicht verwaisen kann.
 *
 * Die 100 Erfolge aus der ursprünglichen Vorgabe sind damit **nicht** erreicht;
 * das ist eine Inhaltsfrage und offen dokumentiert, keine Mechaniklücke.
 *
 * ## Wie ein Erfolg ausgewertet wird
 *
 * Jeder Erfolg hat eine BEDINGUNG über flachen Kennzahlen:
 *
 *     { kind: 'mindestens', kennzahl: 'schaden', wert: 500 }
 *
 * Die Kennzahlen entstehen aus zwei Quellen und werden zu EINEM flachen Objekt
 * zusammengeführt (`kennzahlen()`):
 *  - der laufenden oder eben beendeten Partie (Schüsse, Treffer, Schaden dieser
 *    Partie), und
 *  - dem Spielerprofil (Partien, Siege, Serie über alle Partien).
 *
 * Dadurch braucht die Auswertung keine Kenntnis des Motors — sie liest Zahlen.
 * Ein neuer Erfolg ist eine neue Zeile in der Tabelle, kein Code.
 *
 * ## Fortschritt statt nur „erreicht"
 *
 * Ein Erfolg, der bei 800 von 1000 Schaden steht, soll 80 % zeigen und nicht
 * „nicht erreicht". Deshalb liefert die Auswertung je Erfolg `fortschritt`
 * (0..1) und `stand`/`ziel` — auch für die noch nicht erreichten. Genau das
 * braucht die Übersicht mit den Hinweisen.
 *
 * @module achievements
 */

/** Schwierigkeitsstufen, von leicht bis sehr schwer. */
export const TIERS = Object.freeze(['leicht', 'mittel', 'schwer', 'sehr schwer']);

/** Gruppen für die Übersicht. */
export const CATEGORIES = Object.freeze({
  EINSTIEG: 'einstieg',
  KAMPF: 'kampf',
  PRAEZISION: 'praezision',
  UEBERLEBEN: 'ueberleben',
  SAMMLUNG: 'sammlung',
  TEAM: 'team',
});

/** Beschriftungen der Gruppen — für die Anzeige, nicht für die Logik.
 * Intern genutzt; Export wurde entfernt (Audit-Befund: kein externer Leser).
 */
const CATEGORY_LABELS = Object.freeze({
  [CATEGORIES.EINSTIEG]: 'Einstieg',
  [CATEGORIES.KAMPF]: 'Kampf',
  [CATEGORIES.PRAEZISION]: 'Präzision',
  [CATEGORIES.UEBERLEBEN]: 'Überleben',
  [CATEGORIES.SAMMLUNG]: 'Sammlung',
  [CATEGORIES.TEAM]: 'Team',
});

/**
 * Die Erfolgstabelle.
 *
 * **INHALT GESETZT (2026-09-20).** Bis hierher waren die elf Einträge Muster
 * (`muster: true`): Die Mechanik war fertig, die Namen, Texte und Symbole
 * fehlten — sie sind Gestaltung, keine Ableitung. Die Entscheidung ist gefallen:
 * Jeder Eintrag trägt jetzt einen echten Namen, einen Satz und einen Hinweis.
 *
 * Zwei bewusste Festlegungen:
 *
 *  - **Die Kennungen behalten ihr Präfix** (`muster_*`). `id` ist laut Format
 *    „stabil, auch wenn der Name wechselt" — ein Umbenennen würde den
 *    Fortschritt in `localStorage` verwaisen lassen, ohne dass jemand es merkt.
 *    Das Präfix ist damit ein Herkunftsnachweis, kein Platzhalter.
 *  - **`reward` bleibt `null`.** Es gibt kein Vergabesystem — ein Text wie
 *    „schaltet X frei" wäre eine Behauptung über etwas, das nicht passiert.
 *
 * Format eines Eintrags:
 *  - `id`        eindeutige Kennung (bleibt stabil, auch wenn der Name wechselt)
 *  - `tier`      aus `TIERS`
 *  - `category`  aus `CATEGORIES`
 *  - `title`     kurzer Name
 *  - `text`      ein Satz, was zu tun ist
 *  - `hint`      Hinweis für die Übersicht
 *  - `icon`      Kennung eines Symbols (noch keine Bilddateien)
 *  - `reward`    was es gibt — `null`, solange nichts vergeben wird
 *  - `condition` die Bedingung (Mechanik)
 */
export const ACHIEVEMENTS = Object.freeze([
  // ---------------------------------------------------------------- Einstieg
  {
    id: 'muster_erster_schuss',
    tier: 'leicht',
    category: CATEGORIES.EINSTIEG,
    title: 'Erster Schuss',
    text: 'Gib in einer Partie mindestens einen Schuss ab.',
    hint: 'Einen Schuss abgeben — das passiert in der ersten Runde von selbst.',
    icon: 'schuss',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schuesse_partie', wert: 1 },
  },
  {
    id: 'muster_erste_partie',
    tier: 'leicht',
    category: CATEGORIES.EINSTIEG,
    title: 'Erste Partie',
    text: 'Beende eine Partie.',
    hint: 'Eine Partie zu Ende spielen — gewinnen ist nicht nötig.',
    icon: 'partie',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'partien', wert: 1 },
  },
  {
    id: 'muster_zehn_partien',
    tier: 'mittel',
    category: CATEGORIES.EINSTIEG,
    title: 'Zehn Partien',
    text: 'Beende zehn Partien.',
    hint: 'Zehn Partien spielen, egal mit welchem Ausgang.',
    icon: 'partien-zehn',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'partien', wert: 10 },
  },

  // ------------------------------------------------------------------ Kampf
  {
    id: 'muster_schaden_500',
    tier: 'mittel',
    category: CATEGORIES.KAMPF,
    title: '300 Schaden in einer Partie',
    text: 'Verursache in einer Partie 300 Schaden.',
    hint: 'Viel Schaden in EINER Partie — mehrere Treffer mit Flächenwaffen.',
    icon: 'schaden',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden_partie', wert: 300 },
  },
  {
    id: 'muster_schaden_5000',
    tier: 'sehr schwer',
    category: CATEGORIES.KAMPF,
    title: '5000 Schaden gesamt',
    text: 'Verursache über alle Partien 5000 Schaden.',
    hint: 'Über viele Partien ansammeln.',
    icon: 'schaden-gesamt',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden', wert: 5000 },
  },
  {
    id: 'muster_siege_10',
    tier: 'schwer',
    category: CATEGORIES.KAMPF,
    title: 'Zehn Siege',
    text: 'Gewinne zehn Partien.',
    hint: 'Zehn Partien gewinnen.',
    icon: 'siege',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'siege', wert: 10 },
  },
  {
    id: 'muster_serie_3',
    tier: 'schwer',
    category: CATEGORIES.KAMPF,
    title: 'Drei Siege in Folge',
    text: 'Gewinne drei Partien hintereinander.',
    hint: 'Drei Siege ohne Niederlage dazwischen — die Serie steht im Profil.',
    icon: 'serie',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'serie_rekord', wert: 3 },
  },

  // ------------------------------------------------------------- Präzision
  {
    id: 'muster_trefferquote_50',
    tier: 'schwer',
    category: CATEGORIES.PRAEZISION,
    title: 'Trefferquote 50 %',
    text: 'Erreiche über alle Partien eine Trefferquote von 50 %.',
    hint: 'Braucht viele Schüsse: Die Quote rechnet über ALLE Partien.',
    icon: 'trefferquote',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'trefferquote', wert: 0.5, mindestbasis: { kennzahl: 'schuesse', wert: 20 } },
  },

  // ------------------------------------------------------------- Überleben
  {
    id: 'muster_spielzeit_1h',
    tier: 'mittel',
    category: CATEGORIES.UEBERLEBEN,
    title: 'Eine Stunde Spielzeit',
    text: 'Verbringe eine Stunde im Match.',
    hint: 'Summiert sich über alle Partien.',
    icon: 'spielzeit',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'spielzeit_sekunden', wert: 3600 },
  },

  // ------------------------------------------------------------- Sammlung
  {
    id: 'muster_waffen_3',
    tier: 'mittel',
    category: CATEGORIES.SAMMLUNG,
    title: 'Drei Waffen benutzt',
    text: 'Schieße mit drei verschiedenen Waffen.',
    hint: 'Verschiedene Waffen aus Kisten aufheben und benutzen.',
    icon: 'waffen',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'verschiedene_waffen', wert: 3 },
  },

  // ------------------------------------------------------------------ Team
  {
    id: 'muster_schaden_pro_minute',
    tier: 'schwer',
    category: CATEGORIES.TEAM,
    title: 'Zwanzig Schaden je Minute',
    text: 'Erreiche 20 Schaden je Minute über alle Partien.',
    hint: 'Tempo zählt: kurze Partien mit viel Schaden heben den Wert.',
    icon: 'tempo',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden_pro_minute', wert: 20, mindestbasis: { kennzahl: 'schuesse', wert: 20 } },
  },
]);

/** Erfolge nach Kennung. */
export const ACHIEVEMENTS_BY_ID = Object.freeze(
  Object.fromEntries(ACHIEVEMENTS.map(e => [e.id, e])),
);

/** Anzahl der Muster-Einträge — für die Anzeige und für Tests. */
export const MUSTER_ANZAHL = ACHIEVEMENTS.filter(e => e.muster).length;

/**
 * Flache Kennzahlen aus Partie und Profil.
 *
 * Zwei Namensräume in EINEM Objekt, damit die Bedingungen schlicht bleiben:
 *  - `*_partie` bezieht sich auf die laufende oder eben beendete Partie,
 *  - alles andere auf das Profil über alle Partien.
 *
 * Fehlende Quellen werden zu 0 — eine Bedingung darf nicht daran scheitern, dass
 * gerade keine Partie läuft.
 *
 * @param {object} [partie] - `MatchStats#zusammenfassung(eigenerSpielerId)`
 * @param {object} [profil] - `PlayerProfile#toJSON()`
 */
export function kennzahlen(partie = null, profil = null) {
  const e = partie?.eigener ?? null;
  const p = profil ?? {};

  const schuesse = p.schuesse ?? 0;
  const treffer = p.treffer ?? 0;
  const spielzeit = p.spielzeitSekunden ?? 0;

  return {
    // --- Partie ---
    schuesse_partie: e?.schuesse ?? 0,
    treffer_partie: e?.treffer ?? 0,
    schaden_partie: e?.schaden ?? 0,
    zuege_partie: e?.zuege ?? 0,
    trefferquote_partie: e?.trefferquote ?? 0,
    runden: partie?.runden ?? 0,
    dauer_sekunden: partie?.dauerSekunden ?? 0,
    schaden_gesamt_partie: partie?.schadenGesamt ?? 0,
    /** 1 für Sieg, 0 für Niederlage/Unentschieden — als Zahl nutzbar. */
    sieg_partie: e?.sieg === true ? 1 : 0,

    // --- Über alle Partien ---
    partien: p.partien ?? 0,
    siege: p.siege ?? 0,
    niederlagen: p.niederlagen ?? 0,
    serie: p.serie ?? 0,
    /** Nur die SIEGESSerie — eine Niederlagenserie ist kein Rekord. */
    serie_rekord: p.serieRekord ?? 0,
    schuesse,
    treffer,
    schaden: p.schaden ?? 0,
    absorbierter_schaden: p.absorbierterSchaden ?? 0,
    zuege: p.zuege ?? 0,
    spielzeit_sekunden: spielzeit,
    verschiedene_waffen: Object.keys(p.waffen ?? {}).length,
    // Quoten werden hier gerechnet, nicht aus dem Profil gelesen: So hängt die
    // Auswertung nicht daran, dass dort ein Getter existiert.
    trefferquote: schuesse > 0 ? treffer / schuesse : 0,
    siegquote: (p.partien ?? 0) > 0 ? (p.siege ?? 0) / p.partien : 0,
    schaden_pro_minute: spielzeit > 0 ? (p.schaden ?? 0) / (spielzeit / 60) : 0,
  };
}

/**
 * Prüft eine Bedingung gegen die Kennzahlen.
 *
 * @returns {{erreicht: boolean, stand: number, ziel: number, fortschritt: number}}
 */
export function pruefeBedingung(condition, werte) {
  if (!condition || typeof condition !== 'object') {
    return { erreicht: false, stand: 0, ziel: 0, fortschritt: 0 };
  }

  const stand = Number(werte?.[condition.kennzahl] ?? 0);
  const ziel = Number(condition.wert ?? 0);

  switch (condition.kind) {
    case 'mindestens': {
      /*
       * `mindestbasis`: Manche Quoten sind mit zwei Schüssen schon 50 %. Ohne
       * eine Mindestbasis wäre der Erfolg nach zwei glücklichen Treffern
       * erreicht — er soll aber Können zeigen. Die Basis ist eine ANDERE
       * Kennzahl, die erst einen Wert erreichen muss.
       */
      if (condition.mindestbasis) {
        const basis = Number(werte?.[condition.mindestbasis.kennzahl] ?? 0);
        if (basis < Number(condition.mindestbasis.wert ?? 0)) {
          // Fortschritt über die Basis: Sie ist die erste Hürde.
          return {
            erreicht: false,
            stand,
            ziel,
            fortschritt: Number(condition.mindestbasis.wert) > 0
              ? Math.min(1, basis / Number(condition.mindestbasis.wert))
              : 0,
            basisStand: basis,
            basisZiel: Number(condition.mindestbasis.wert ?? 0),
          };
        }
      }
      return {
        erreicht: stand >= ziel,
        stand,
        ziel,
        fortschritt: ziel > 0 ? Math.min(1, Math.max(0, stand / ziel)) : (stand > 0 ? 1 : 0),
      };
    }

    case 'hoechstens':
      // Für „ohne X zu tun": Der Wert muss UNTER der Grenze bleiben.
      return {
        erreicht: stand <= ziel,
        stand,
        ziel,
        fortschritt: stand <= ziel ? 1 : 0,
      };

    default:
      return { erreicht: false, stand, ziel, fortschritt: 0 };
  }
}

/**
 * Wertet alle Erfolge aus.
 *
 * @param {object} werte - aus `kennzahlen()`
 * @param {object} [bereitsErreicht] - Kennungen bereits erreichter Erfolge
 * @returns {Array<object>} je Erfolg: Definition + erreicht/stand/ziel/fortschritt
 */
export function werteAus(werte, bereitsErreicht = null) {
  const vorher = bereitsErreicht instanceof Set
    ? bereitsErreicht
    : new Set(Array.isArray(bereitsErreicht) ? bereitsErreicht : []);

  return ACHIEVEMENTS.map(eintrag => {
    const ergebnis = pruefeBedingung(eintrag.condition, werte);
    /*
     * Einmal erreicht, immer erreicht.
     *
     * `serie_rekord` ist das Beispiel: Der Rekord steht im Profil und fällt nie
     * wieder — aber eine Bedingung über `serie` (die AKTUELLE Serie) kann wieder
     * darunter fallen. Ein Erfolg darf nicht verschwinden, weil es gerade
     * schlecht läuft.
     */
    const erreicht = ergebnis.erreicht || vorher.has(eintrag.id);
    return { ...eintrag, ...ergebnis, erreicht };
  });
}

/**
 * Die neu hinzugekommenen Erfolge.
 *
 * Getrennt von `werteAus`, damit der Aufrufer die Meldung („Erfolg freigeschaltet")
 * nur für die NEUEN zeigt — sonst meldete jede Auswertung alle alten erneut.
 */
export function neueErfolge(werte, bereitsErreicht = null) {
  const vorher = bereitsErreicht instanceof Set
    ? bereitsErreicht
    : new Set(Array.isArray(bereitsErreicht) ? bereitsErreicht : []);
  return werteAus(werte, vorher).filter(e => e.erreicht && !vorher.has(e.id));
}

/**
 * Verdichtet die erreichten Erfolge zu einem EMBLEM für den Spielernamen.
 *
 * ## Was das ist — und was es ausdrücklich NICHT tut
 *
 * Es wird **kein Symbol erfunden und kein Text gedichtet.** Das Emblem ist eine
 * reine Verdichtung vorhandener Daten: Es zählt die erreichten Erfolge und nennt
 * den höchsten erreichten Rang (`tier`). Beides steht bereits in der Tabelle.
 *
 * Das ist die Antwort auf den offenen Punkt „Erfolgs-Emblem am Spielernamen"
 * in MASTERDOTO.md — dort steht zu Recht, dass **Namen, Texte und Symbole eine
 * Gestaltungsentscheidung des Auftraggebers** sind. Deshalb liefert diese
 * Funktion keinen Namen und kein Bild, sondern Zahlen und den Rang-Schlüssel:
 * Die Darstellung entscheidet, wer sie gestaltet.
 *
 * ## Warum der Rang und nicht die Zahl allein
 *
 * Ein Spieler mit zwei „leichten" Erfolgen und einer mit zwei „sehr schweren"
 * haben dieselbe Anzahl, aber nicht denselben Stand. Der Rang macht den
 * Unterschied sichtbar, ohne eine Gewichtung zu erfinden — `TIERS` ist bereits
 * eine geordnete Liste, ihre Position ist die Ordnung.
 *
 * @param {Iterable<string>|null} erreichteIds - Kennungen der erreichten Erfolge
 * @returns {Readonly<{
 *   anzahl: number,
 *   gesamt: number,
 *   rang: string|null,
 *   rangIndex: number,
 *   anteil: number,
 *   nurMuster: boolean
 * }>}
 *   `rang` ist `null`, solange nichts erreicht ist — dann zeigt die Anzeige
 *   besser nichts als einen leeren Rang. `nurMuster` sagt, dass alle erreichten
 *   Erfolge Muster sind (die Inhalte also noch fehlen); die Anzeige kann das
 *   kenntlich machen, statt es zu verschweigen.
 */
export function emblem(erreichteIds = null) {
  const erreicht = new Set(erreichteIds ?? []);
  const treffer = ACHIEVEMENTS.filter(e => erreicht.has(e.id));

  /*
   * Der höchste Rang: `TIERS` ist von leicht nach sehr schwer geordnet, die
   * Position ist damit die Ordnung. Bei gleichem Rang entscheidet die Anzahl
   * nicht — der Rang ist die Aussage.
   */
  let rangIndex = -1;
  for (const e of treffer) {
    const index = TIERS.indexOf(e.tier);
    if (index > rangIndex) rangIndex = index;
  }

  return Object.freeze({
    anzahl: treffer.length,
    gesamt: ACHIEVEMENTS.length,
    rang: rangIndex >= 0 ? TIERS[rangIndex] : null,
    rangIndex,
    /** Anteil der erreichten an allen — für einen Fortschrittsbalken. */
    anteil: ACHIEVEMENTS.length > 0 ? treffer.length / ACHIEVEMENTS.length : 0,
    /*
     * Ob ALLE erreichten Erfolge Muster sind. Die Inhalte der 100 Erfolge
     * fehlen noch (siehe Dateikopf); ein Emblem aus reinen Mustern darf nicht
     * wie eine echte Auszeichnung aussehen.
     */
    nurMuster: treffer.length > 0 && treffer.every(e => e.muster === true),
  });
}

/** Übersicht: erreichte und offene, gruppiert nach Kategorie. */
export function uebersicht(werte, bereitsErreicht = null) {
  const alle = werteAus(werte, bereitsErreicht);
  const erreicht = alle.filter(e => e.erreicht);
  const gruppen = [];

  for (const category of Object.values(CATEGORIES)) {
    const inGruppe = alle.filter(e => e.category === category);
    if (inGruppe.length === 0) continue;
    gruppen.push({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      erreicht: inGruppe.filter(e => e.erreicht).length,
      gesamt: inGruppe.length,
      eintraege: inGruppe,
    });
  }

  return {
    erreicht: erreicht.length,
    gesamt: alle.length,
    /** 0..1 über alle Erfolge. */
    anteil: alle.length > 0 ? erreicht.length / alle.length : 0,
    /** Nach Stufe, für die Anzeige. */
    nachStufe: TIERS.map(tier => ({
      tier,
      erreicht: alle.filter(e => e.tier === tier && e.erreicht).length,
      gesamt: alle.filter(e => e.tier === tier).length,
    })),
    gruppen,
    musterAnzahl: alle.filter(e => e.muster).length,
  };
}

export default { ACHIEVEMENTS, werteAus, neueErfolge, uebersicht, kennzahlen, emblem };
