/**
 * Erfolge.
 *
 * ## Was hier Mechanik ist und was Inhalt
 *
 * Diese Datei enthält den **Mechanismus**: wie ein Erfolg definiert wird, wie er
 * ausgewertet und fortgeschrieben wird, und wie der Fortschritt aussieht. Die
 * **Inhalte** (welche 100 Erfolge es gibt, wie sie heißen, welchen Text und
 * welches Symbol sie tragen und was sie belohnen) stehen als Tabelle darunter —
 * und sind bewusst NICHT erfunden worden: Namen, Texte und Symbole sind eine
 * Gestaltungsentscheidung des Auftraggebers, keine technische Ableitung.
 *
 * Die beigefügten Einträge sind **Muster** (`MUSTER`), damit die Mechanik
 * prüfbar ist. Sie sind im Feld `muster: true` markiert und im Menü als solche
 * gekennzeichnet. Sie zu ersetzen heißt: `ACHIEVEMENTS` austauschen — die
 * Auswertung bleibt unverändert.
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

/** Beschriftungen der Gruppen — für die Anzeige, nicht für die Logik. */
export const CATEGORY_LABELS = Object.freeze({
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
 * **MUSTER — zu ersetzen.** Die Einträge sind aus messbaren Größen abgeleitet,
 * damit die Mechanik ohne erfundene Inhalte prüfbar ist. Ein echter Katalog
 * braucht: Namen, Texte, Symbole und Belohnungen vom Auftraggeber.
 *
 * Format eines Eintrags:
 *  - `id`        eindeutige Kennung (bleibt stabil, auch wenn der Name wechselt)
 *  - `tier`      aus `TIERS`
 *  - `category`  aus `CATEGORIES`
 *  - `title`     kurzer Name (INHALT)
 *  - `text`      ein Satz, was zu tun ist (INHALT)
 *  - `hint`      Hinweis für die Übersicht (INHALT)
 *  - `icon`      Kennung eines Symbols (INHALT — noch keine Bilddateien)
 *  - `reward`    was es gibt (INHALT) — `null`, solange nichts vergeben wird
 *  - `condition` die Bedingung (Mechanik)
 *  - `muster`    true, solange der Eintrag ein Platzhalter ist
 */
export const ACHIEVEMENTS = Object.freeze([
  // ---------------------------------------------------------------- Einstieg
  {
    id: 'muster_erster_schuss',
    tier: 'leicht',
    category: CATEGORIES.EINSTIEG,
    title: 'Muster: Erster Schuss',
    text: 'Gib in einer Partie mindestens einen Schuss ab.',
    hint: 'Einen Schuss abgeben — das passiert in der ersten Runde von selbst.',
    icon: 'muster-schuss',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schuesse_partie', wert: 1 },
    muster: true,
  },
  {
    id: 'muster_erste_partie',
    tier: 'leicht',
    category: CATEGORIES.EINSTIEG,
    title: 'Muster: Erste Partie',
    text: 'Beende eine Partie.',
    hint: 'Eine Partie zu Ende spielen — gewinnen ist nicht nötig.',
    icon: 'muster-partie',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'partien', wert: 1 },
    muster: true,
  },
  {
    id: 'muster_zehn_partien',
    tier: 'mittel',
    category: CATEGORIES.EINSTIEG,
    title: 'Muster: Zehn Partien',
    text: 'Beende zehn Partien.',
    hint: 'Zehn Partien spielen, egal mit welchem Ausgang.',
    icon: 'muster-partien-zehn',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'partien', wert: 10 },
    muster: true,
  },

  // ------------------------------------------------------------------ Kampf
  {
    id: 'muster_schaden_500',
    tier: 'mittel',
    category: CATEGORIES.KAMPF,
    title: 'Muster: 500 Schaden',
    text: 'Verursache in einer Partie 500 Schaden.',
    hint: 'Viel Schaden in EINER Partie — mehrere Treffer mit Flächenwaffen.',
    icon: 'muster-schaden',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden_partie', wert: 500 },
    muster: true,
  },
  {
    id: 'muster_schaden_5000',
    tier: 'sehr schwer',
    category: CATEGORIES.KAMPF,
    title: 'Muster: 5000 Schaden gesamt',
    text: 'Verursache über alle Partien 5000 Schaden.',
    hint: 'Über viele Partien ansammeln.',
    icon: 'muster-schaden-viel',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden', wert: 5000 },
    muster: true,
  },
  {
    id: 'muster_siege_10',
    tier: 'schwer',
    category: CATEGORIES.KAMPF,
    title: 'Muster: Zehn Siege',
    text: 'Gewinne zehn Partien.',
    hint: 'Zehn Partien gewinnen.',
    icon: 'muster-siege',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'siege', wert: 10 },
    muster: true,
  },
  {
    id: 'muster_serie_3',
    tier: 'schwer',
    category: CATEGORIES.KAMPF,
    title: 'Muster: Drei Siege in Folge',
    text: 'Gewinne drei Partien hintereinander.',
    hint: 'Drei Siege ohne Niederlage dazwischen — die Serie steht im Profil.',
    icon: 'muster-serie',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'serie_rekord', wert: 3 },
    muster: true,
  },

  // ------------------------------------------------------------- Präzision
  {
    id: 'muster_trefferquote_50',
    tier: 'schwer',
    category: CATEGORIES.PRAEZISION,
    title: 'Muster: Trefferquote 50 %',
    text: 'Erreiche über alle Partien eine Trefferquote von 50 %.',
    hint: 'Braucht viele Schüsse: Die Quote rechnet über ALLE Partien.',
    icon: 'muster-quote',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'trefferquote', wert: 0.5, mindestbasis: { kennzahl: 'schuesse', wert: 20 } },
    muster: true,
  },

  // ------------------------------------------------------------- Überleben
  {
    id: 'muster_spielzeit_1h',
    tier: 'mittel',
    category: CATEGORIES.UEBERLEBEN,
    title: 'Muster: Eine Stunde Spielzeit',
    text: 'Verbringe eine Stunde im Match.',
    hint: 'Summiert sich über alle Partien.',
    icon: 'muster-zeit',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'spielzeit_sekunden', wert: 3600 },
    muster: true,
  },

  // ------------------------------------------------------------- Sammlung
  {
    id: 'muster_waffen_3',
    tier: 'mittel',
    category: CATEGORIES.SAMMLUNG,
    title: 'Muster: Drei Waffen benutzt',
    text: 'Schieße mit drei verschiedenen Waffen.',
    hint: 'Verschiedene Waffen aus Kisten aufheben und benutzen.',
    icon: 'muster-waffen',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'verschiedene_waffen', wert: 3 },
    muster: true,
  },

  // ------------------------------------------------------------------ Team
  {
    id: 'muster_schaden_pro_minute',
    tier: 'schwer',
    category: CATEGORIES.TEAM,
    title: 'Muster: 200 Schaden je Minute',
    text: 'Erreiche 200 Schaden je Minute über alle Partien.',
    hint: 'Tempo zählt: kurze Partien mit viel Schaden heben den Wert.',
    icon: 'muster-tempo',
    reward: null,
    condition: { kind: 'mindestens', kennzahl: 'schaden_pro_minute', wert: 200, mindestbasis: { kennzahl: 'schuesse', wert: 20 } },
    muster: true,
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

export default { ACHIEVEMENTS, werteAus, neueErfolge, uebersicht, kennzahlen };
