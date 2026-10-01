/**
 * Profil- und Erfolgsanzeige — reine Darstellungsfunktionen.
 *
 * ## Warum diese Datei
 *
 * `#zeigeProfil()` und `#zeigeErfolge()` standen in `Game` (`src/client/main.js`)
 * und bauten aus Profil, Statistik und Erfolgen DOM-Zeilen. Das ist Darstellung,
 * keine Orchestrierung: Beide Methoden griffen auf keinen einzigen privaten
 * Helfer der Klasse zu — sie lasen nur `profil`, `stats`, `eigeneSpielerIds`,
 * `neueErfolge` und schrieben in zwei feste DOM-Ziele.
 *
 * Deshalb sind sie hier als reine Funktionen über eine **Quelle** ausgezogen —
 * dasselbe Muster wie `ereignisse.js` und `debugApi.js`. Die Klasse behält einen
 * Delegator, der genau die Werte benennt, die die Anzeige liest.
 *
 * ## Nebenbei: eine Doppelregel entfernt
 *
 * `main.js` führte `TIER_REIHENFOLGE = ['leicht', 'mittel', 'schwer', 'sehr schwer']`
 * — wortgleich mit `TIERS` aus `shared/achievements.js`. Die Reihenfolge der
 * Schwierigkeitsstufen gehört zur Erfolgs-Definition (dort wird sie auch für die
 * Schwellen benutzt), nicht zum Client. Hier wird `TIERS` gelesen.
 *
 * @module profilanzeige
 */

import { beschreibe } from '../shared/stats.js';
import {
  kennzahlen as erfolgsKennzahlen,
  uebersicht as erfolgsUebersicht,
  TIERS,
} from '../shared/achievements.js';
import { ablageHinweis } from '../shared/identity.js';

/**
 * Baut die Profil-Werte ins Menü (`#profil-werte` und `#profil-hinweis`).
 *
 * Reine Funktion: greift nur auf `quelle.document` und `quelle.profil` zu.
 *
 * @param {object} quelle
 * @param {Document} quelle.document
 * @param {object} quelle.profil - ein `PlayerProfile` (liefert `beschreibe`-Werte)
 */
export function baueProfilAnzeige(quelle) {
  const ziel = quelle.document.getElementById('profil-werte');
  if (!ziel) return;

  const text = beschreibe(quelle.profil);
  const zeilen = [
    ['Partien', text.partien],
    ['Bilanz', text.bilanz],
    ['Siegquote', text.siegquote],
    ['Serie', text.serie],
    ['Beste Serie', text.besteSerie],
    ['Schüsse', text.schuesse],
    ['Trefferquote', text.trefferquote],
    ['Schaden gesamt', text.schaden],
    ['Schaden', text.schadenProMinute],
    ['Spielzeit', text.spielzeit],
    ['Lieblingswaffe', text.lieblingswaffe],
    ['Lieblingsnation', text.lieblingsfraktion],
  ];
  ziel.replaceChildren(...zeilen.map(([bezeichnung, wert]) => {
    const zeile = quelle.document.createElement('div');
    zeile.className = 'profil-zeile';
    const dt = quelle.document.createElement('span');
    dt.className = 'profil-name';
    dt.textContent = `${bezeichnung}:`;
    const dd = quelle.document.createElement('span');
    dd.className = 'profil-wert';
    dd.textContent = wert;
    zeile.append(dt, dd);
    return zeile;
  }));

  /*
   * Ein Hinweis auf die fehlende Fraktionsangabe: Eine leere Zeile ohne
   * Begründung sähe nach einem Fehler aus.
   *
   * Zwei Dinge stehen hier: warum die Lieblingsnation leer ist, und WO der
   * Fortschritt liegt.
   *
   * Der zweite Teil kam mit dem Audit: Profil und Erfolge liegen im Browser
   * (`identity.js`, `AKTUELLER_ABLAGEORT`). Ohne Hinweis erfährt der Spieler
   * erst beim Browserwechsel, dass alles weg ist — dann ist es zu spät.
   */
  const hinweis = quelle.document.getElementById('profil-hinweis');
  if (hinweis) {
    const teile = [];
    if (!quelle.profil.lieblingsfraktion) {
      teile.push('Die Lieblingsnation braucht eine Charakterwahl — die gibt es noch nicht.');
    }
    const ablage = ablageHinweis();
    if (ablage.hinweis) teile.push(ablage.hinweis);
    hinweis.textContent = teile.join(' ');
  }
}

/**
 * Baut die Erfolgsübersicht ins Menü (`#erfolge-zaehler` und `#erfolge-liste`).
 *
 * Aufbau je Erfolg: Symbol, Titel, Stufe, Stand/Ziel und der HINWEIS, wie er
 * zu holen ist. Der Hinweis steht bewusst auch bei erreichten Erfolgen — sonst
 * sähe die Liste bei jedem erreichten Eintrag anders aus, und man verliert die
 * Erinnerung, wofür er war.
 *
 * Muster-WACHHUND: Die Inhalte sind seit 2026-09-20 gesetzt, `musterAnzahl`
 * ist also 0 und der Zähler schweigt dazu. Die Kennzeichnung bleibt trotzdem
 * stehen — würde ein künftiger Katalog wieder Platzhalter enthalten, darf die
 * Anzeige nicht den Eindruck eines fertigen Katalogs erwecken.
 *
 * @param {object} quelle
 * @param {Document} quelle.document
 * @param {object|null} quelle.stats - MatchStats oder null („noch keine Partie")
 * @param {object} quelle.profil - ein `PlayerProfile`
 * @param {Array<number>} quelle.eigeneSpielerIds
 * @param {Array<object>} quelle.neueErfolge - zuletzt freigeschaltete Erfolge
 */
export function baueErfolgsAnzeige(quelle) {
  const zaehler = quelle.document.getElementById('erfolge-zaehler');
  if (!zaehler) return;

  const partei = quelle.stats ? quelle.stats.zusammenfassung(quelle.eigeneSpielerIds) : null;
  const werte = erfolgsKennzahlen(partei, quelle.profil.toJSON());
  const u = erfolgsUebersicht(werte, quelle.profil.erfolge);

  zaehler.textContent = `${u.erreicht} von ${u.gesamt} erreicht`
    + (u.musterAnzahl > 0
      ? ` — davon ${u.musterAnzahl} Muster (die Inhalte fehlen noch)`
      : '');

  // Die zuletzt freigeschalteten zuerst: Das ist die Neuigkeit.
  const frisch = new Set((quelle.neueErfolge ?? []).map(e => e.id));

  const ziel = quelle.document.getElementById('erfolge-liste');
  if (!ziel) return;

  const zeilen = [];
  for (const gruppe of u.gruppen) {
    const kopf = quelle.document.createElement('div');
    kopf.className = 'erfolg-gruppe';
    kopf.textContent = `${gruppe.label} — ${gruppe.erreicht} von ${gruppe.gesamt}`;
    zeilen.push(kopf);

    // Erreichte zuerst innerhalb der Gruppe.
    const sortiert = [...gruppe.eintraege].sort((a, b) =>
      (b.erreicht - a.erreicht) || (TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)));

    for (const e of sortiert) {
      const zeile = quelle.document.createElement('div');
      zeile.className = `erfolg${e.erreicht ? ' erreicht' : ''}${frisch.has(e.id) ? ' frisch' : ''}`;
      zeile.dataset.erfolgId = e.id;
      zeile.dataset.tier = e.tier;

      const symbol = quelle.document.createElement('span');
      symbol.className = 'erfolg-symbol';
      // Kein Bild vorhanden: Die Kennung steht als Kürzel, damit die Anzeige
      // nicht so tut, als gäbe es Symbole. `aria-hidden`, weil der Titel folgt.
      symbol.textContent = e.erreicht ? '★' : '☆';
      symbol.setAttribute('aria-hidden', 'true');

      const text = quelle.document.createElement('span');
      text.className = 'erfolg-text';

      const titel = quelle.document.createElement('b');
      titel.textContent = e.title;
      if (e.muster) {
        const marke = quelle.document.createElement('i');
        marke.className = 'erfolg-muster';
        marke.textContent = 'Muster';
        titel.append(' ', marke);
      }

      const stufe = quelle.document.createElement('span');
      stufe.className = `erfolg-stufe stufe-${e.tier.replace(/\s+/g, '-')}`;
      stufe.textContent = e.tier;

      const beschreibung = quelle.document.createElement('span');
      beschreibung.className = 'erfolg-hinweis';
      beschreibung.textContent = e.hint;

      const stand = quelle.document.createElement('span');
      stand.className = 'erfolg-stand';
      // Prozent statt „800 / 1000", wenn das Ziel eine Quote ist — sonst
      // stünde dort „0,42 / 0,5".
      stand.textContent = e.erreicht
        ? 'erreicht'
        : (e.ziel > 0 && e.ziel <= 1
          ? `${Math.round(e.fortschritt * 100)} %`
          : `${Math.round(e.stand)} / ${Math.round(e.ziel)}`);

      text.append(titel, ' ', stufe, quelle.document.createElement('br'), beschreibung);
      zeile.append(symbol, text, stand);
      zeilen.push(zeile);
    }
  }
  ziel.replaceChildren(...zeilen);
}
