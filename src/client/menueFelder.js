/**
 * Menü-Felder für Loadout, Sidegrades, Fraktionen und die Lobby-Liste (QV-5, aus `main.js` ausgezogen).
 *
 * Alles hier liest oder füllt nur das DOM des Menüs; es braucht keinen Zustand der `Main`-Klasse.
 * Der Code ist wortgleich aus `Main` übernommen (nur `this`-lose Funktionen mit `doc` statt `document`);
 * `Main` behält dünne Weiterleitungen, damit `debugApi` und die E2E-Specs unverändert bleiben.
 *
 * @module menueFelder
 */
import { CLASS_IDS } from '../shared/config/match-konstanten.js';
import { FACTIONS } from '../shared/config/factions.js';
import { bereinigeFraktionenJePlatz, KLASSISCH } from '../shared/config/darstellung.js';
import { resolveLoadout } from '../shared/config/classes.js';
import { sidegradesForClass } from '../shared/config/sidegrades.js';
import { beschreibeWert } from './wertBeschreibung.js';
import { fraktionsEmblem } from './fraktionsAnzeige.js';
import { zeigeToast } from './toasts.js';

/**
 * Liest die Sidegrade-Wahl aus dem Menü und bildet daraus die Liste je
 * Spielerplatz.
 *
 * Warum je KLASSE und nicht je Platz: Das Menü kennt die Spielerplätze nicht —
 * Klasse und Archetyp werden beim Start über den Listenindex vergeben
 * (`index % 3`, siehe MASTERDOTO „Bekannte Grenzen"). Der Spieler kann also
 * nicht sagen „Platz 3 bekommt Zusatzpanzerung", weil er nicht weiß, welche
 * Klasse Platz 3 hat. Er wählt je Klasse — und die Platzliste entsteht daraus
 * nach derselben Regel, die der Motor anwendet.
 *
 * @param {number} plaetze - Anzahl Spielerplätze (teams × playersPerTeam)
 * @returns {(string|null)[]} Kennung je Platz
 */
export function sidegradesAusMenue(plaetze, doc = document) {
  // Die Klassen folgen der Vergaberegel des Motors: Platz i bekommt
  // CLASS_IDS[i % 3].
  const liste = [];
  for (let i = 0; i < plaetze; i += 1) {
    const klasse = CLASS_IDS[i % CLASS_IDS.length];
    const feld = doc.getElementById(`cfg-sidegrade-${klasse}`);
    const wert = feld?.value ?? '';
    // Leerer Wert = kein Sidegrade. Eine unbekannte Kennung ist im Menü nicht
    // wählbar, weil die Optionen aus den Configs stammen.
    liste.push(wert === '' ? null : wert);
  }
  return liste;
}

/*
 * ENTFERNT (2026-09-19): `fillTerrainAffinity()` samt `#cfg-preset-synergie`.
 *
 * Die Methode zeigte zur gewählten KARTENFORM, welche Klasse dort ihre Stärke
 * ausspielt. Beides hing an der Menü-Auswahl „Karte", die die Karte gar nicht
 * beeinflusste (der Generator entscheidet aus dem Seed) — eine Synergie-Anzeige
 * für eine Wahl, die es nicht gibt, wäre irreführend.
 *
 * `TERRAIN_AFFINITY` bleibt: Die Tabelle steht weiter in der Hilfe
 * (`hilfeInhalt`) und beschreibt die Geländeformen des Generators.
 */

/**
 * Füllt die Loadout-Auswahl im Menü — je Spielerplatz zwei Felder.
 *
 * ## Warum je PLATZ und nicht je Klasse (anders als die Sidegrades)
 *
 * Bei den Sidegrades wählt man je Klasse, weil der Sidegrade an der Klasse
 * hängt. Hier ist es umgekehrt: Die Wahl BESTIMMT die Klasse des Platzes. Der
 * Spieler muss also den Platz adressieren — und die Zahl der Plätze steht mit
 * „Teams" und „Spieler pro Team" im Menü.
 *
 * ## Die Vorgabe ist „automatisch"
 *
 * Der erste Eintrag je Feld ist leer und bedeutet: die alte Regel
 * (`index % 3`). Damit ist die Änderung im Menü neutral — wer nichts wählt,
 * bekommt genau das Spiel von vorher.
 */
/**
 * Fraktionswahl je Platz (reine Darstellung). Bleibt eine Wahl beim Neuaufbau
 * erhalten, soweit der Platz noch existiert.
 */
export function fuelleFraktionswahl(doc = document) {
  const behaelter = doc.getElementById('fraktion-felder');
  if (!behaelter) return;
  const teams = Number(doc.getElementById('cfg-teams')?.value ?? 2);
  const proTeam = Number(doc.getElementById('cfg-players')?.value ?? 2);
  const plaetze = teams * proTeam;
  const alt = [];
  for (let i = 0; i < 40; i += 1) alt.push(doc.getElementById(`cfg-fraktion-${i}`)?.value ?? '');
  behaelter.replaceChildren();
  for (let i = 0; i < plaetze; i += 1) {
    const zeile = doc.createElement('div');
    zeile.className = 'field-row';
    const label = doc.createElement('label');
    label.setAttribute('for', `cfg-fraktion-${i}`);
    const teamId = i % teams;
    const platzImTeam = Math.floor(i / teams);
    label.textContent = `Platz ${i + 1} (Team ${teamId + 1}, Figur ${platzImTeam + 1})`;
    const auswahl = doc.createElement('select');
    auswahl.id = `cfg-fraktion-${i}`;
    const keine = doc.createElement('option');
    keine.value = '';
    keine.textContent = 'Zufällig / Automatisch';
    auswahl.append(keine);
    const klassisch = doc.createElement('option');
    klassisch.value = KLASSISCH;
    klassisch.textContent = 'Klassisch (ohne Figuren)';
    auswahl.append(klassisch);
    for (const f of FACTIONS) {
      const o = doc.createElement('option');
      o.value = f.id;
      o.textContent = f.name;
      auswahl.append(o);
    }
    auswahl.value = alt[i] ?? '';
    zeile.append(label, auswahl, fraktionsEmblem(auswahl)); // Emblem neben der Auswahl (A11)
    behaelter.append(zeile);
  }
}

export function fraktionenAusMenue(plaetze, doc = document) {
  const liste = [];
  for (let i = 0; i < plaetze; i += 1) liste.push(doc.getElementById(`cfg-fraktion-${i}`)?.value || null);
  return bereinigeFraktionenJePlatz(liste, plaetze);
}

export function fuelleLoadoutwahl(doc = document) {
  const behaelter = doc.getElementById('loadout-felder');
  if (!behaelter) return;

  const teams = Number(doc.getElementById('cfg-teams')?.value ?? 2);
  const proTeam = Number(doc.getElementById('cfg-players')?.value ?? 2);
  const plaetze = teams * proTeam;

  behaelter.replaceChildren();

  for (let i = 0; i < plaetze; i += 1) {
    const zeile = doc.createElement('div');
    zeile.className = 'field-row';

    const label = doc.createElement('label');
    label.setAttribute('for', `cfg-loadout-klasse-${i}`);
    /*
     * Der Platz wird mit Team und Klassen-Vorgabe benannt, damit man sieht,
     * was man ändert. Die Vorgabe stammt aus derselben Regel wie der Motor —
     * eine eigene Rechnung hier würde bei einer Änderung auseinanderlaufen.
     */
    const vorgabe = resolveLoadout(i);
    label.textContent = `Platz ${i + 1} (${vorgabe.classId})`;
    zeile.append(label);

    /*
     * Nur die Klasse ist wählbar. Seit Klassenfassung 3 gibt es keine
     * Archetypen mehr (`docs/anforderungen-2026-11-05.md` §6) — ein zweites
     * Feld würde eine Wahl anbieten, die nichts mehr ändert.
     */
    for (const [art, werte, feld] of [
      ['Klasse', CLASS_IDS, 'klasse'],
    ]) {
      const auswahl = doc.createElement('select');
      auswahl.id = `cfg-loadout-${feld}-${i}`;
      // Leer = automatisch (alte Regel).
      const auto = doc.createElement('option');
      auto.value = '';
      auto.textContent = `${art}: automatisch`;
      auswahl.append(auto);
      for (const wert of werte) {
        const option = doc.createElement('option');
        option.value = wert;
        /*
         * Die Auswahl nennt die WIRKSAMEN Werte, nicht nur den Namen.
         *
         * FUND (belegt, User-Flow-Audit): Hier stand `option.textContent = wert`
         * — also nur „scout", „heavy", „artillery". Das wirksame Leben
         * unterscheidet sich aber um Faktor 0,56 bis 1,56; die Wahl war damit
         * eine Entscheidung ohne Grundlage.
         *
         * Die Zahlen kommen aus `combatProfile()` — derselben Quelle, die der
         * Motor liest. Eine eigene Rechnung hier würde bei einer Änderung
         * auseinanderlaufen (genau die Doppelregel, die dieses Projekt an
         * mehreren Stellen behoben hat).
         *
         * Bei Archetypen zeigt der Wert das TEMPO statt des Schadens: Der
         * Archetyp wirkt über `launchSpeedMultiplier` auf die Flugbahn, nicht
         * über den Schaden (`damage` hieß früher irreführend so und wurde in
         * `launch` umbenannt).
         */
        option.textContent = `${wert} ${beschreibeWert(art, wert)}`;
        auswahl.append(option);
      }
      zeile.append(auswahl);
    }

    behaelter.append(zeile);
  }
}

/**
 * Liest die Loadout-Wahl aus dem Menü.
 *
 * @param {number} plaetze
 * @returns {(object|null)[]} Wahl je Platz — `null`, wenn nichts gewählt wurde
 */
export function loadoutsAusMenue(plaetze, doc = document) {
  const liste = [];
  for (let i = 0; i < plaetze; i += 1) {
    const klasse = doc.getElementById(`cfg-loadout-klasse-${i}`)?.value ?? '';
    if (klasse === '') {
      liste.push(null);
      continue;
    }
    // Nur die gesetzte Klasse übergeben — der Rest fällt auf den Platzwert.
    liste.push({ classId: klasse });
  }
  return liste;
}

/**
 * Füllt die Sidegrade-Auswahl im Menü — je Klasse ein Feld.
 *
 * Die Optionen kommen aus `sidegradesForClass()`, also aus der Config. Im
 * Client steht keine Liste: Käme ein Sidegrade dazu, müsste sonst an zwei
 * Stellen gepflegt werden.
 */
export function fuelleSidegradewahl(doc = document) {
  const behaelter = doc.getElementById('sidegrade-felder');
  if (!behaelter) return;
  behaelter.replaceChildren();

  for (const klasse of CLASS_IDS) {
    const angebot = sidegradesForClass(klasse);

    const zeile = doc.createElement('div');
    zeile.className = 'field-row';

    const label = doc.createElement('label');
    label.setAttribute('for', `cfg-sidegrade-${klasse}`);
    label.textContent = klasse;
    zeile.append(label);

    const auswahl = doc.createElement('select');
    auswahl.id = `cfg-sidegrade-${klasse}`;
    // Erster Eintrag: kein Sidegrade. Das ist der neutrale Zustand und muss
    // immer wählbar bleiben — sonst wäre ein Match ohne Sidegrade unmöglich.
    const keine = doc.createElement('option');
    keine.value = '';
    keine.textContent = 'ohne Sidegrade';
    auswahl.append(keine);

    for (const eintrag of angebot) {
      const option = doc.createElement('option');
      option.value = eintrag.id;
      // Die Erklärung steht im Text: Das Menü hat keine Tooltip-Fläche, und
      // eine eigene Beschreibungszeile je Feld wäre mehr Aufwand als Nutzen.
      option.textContent = `${eintrag.label} — ${eintrag.erklaerung}`;
      auswahl.append(option);
    }

    zeile.append(auswahl);
    behaelter.append(zeile);
  }
}

/**
 * Lädt die offenen Lobbys vom konfigurierten Server und zeigt sie im Menü an.
 *
 * Rein lesend: Es wird nichts am Serverzustand geändert. Ein Klick auf einen
 * Eintrag übernimmt die Lobby-ID ins Formular, damit derselbe Startweg
 * verwendet wird wie bei manueller Eingabe.
 */
export async function aktualisiereLobbyListe(doc = document) {
  const status = doc.getElementById('lobby-status');
  const list = doc.getElementById('lobby-list');
  const serverUrl = doc.getElementById('cfg-server')?.value?.trim() ?? '';
  if (!list) return { ok: false, reason: 'keine Liste im DOM' };

  if (!serverUrl) {
    if (status) status.textContent = 'Dafür bitte eine Server-URL eintragen.';
    list.replaceChildren();
    return { ok: false, reason: 'kein Server konfiguriert' };
  }

  if (status) status.textContent = 'Lade …';
  let lobbies = [];
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/lobby`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    lobbies = Array.isArray(payload.lobbies) ? payload.lobbies : [];
  } catch (error) {
    // Kein Absturz bei nicht erreichbarem Server: das Menü bleibt bedienbar.
    if (status) status.textContent = `Server nicht erreichbar (${error.message})`;
    zeigeToast(`Server nicht erreichbar (${error.message})`, 'danger');
    list.replaceChildren();
    return { ok: false, reason: error.message };
  }

  const offen = lobbies.filter(lobby => lobby.status === 'open');
  if (offen.length === 0) {
    if (status) status.textContent = 'Keine offene Lobby gefunden.';
    list.replaceChildren();
    return { ok: true, count: 0 };
  }

  if (status) status.textContent = `${offen.length} offene ${offen.length === 1 ? 'Lobby' : 'Lobbys'}`;
  list.replaceChildren(...offen.map(lobby => {
    const item = doc.createElement('li');
    item.className = 'lobby-karte pa-karte';

    /*
     * Gezählt werden BEITRETENDE, nicht Figuren.
     *
     * Im Modus der Matcharten sind das zwei verschiedene Zahlen: Ein Mensch
     * belegt ein ganzes Team (3–5 Figuren). Der Server nennt deshalb
     * `seatsTotal` (wie viele Menschen hineinpassen) neben `capacity` (wie
     * viele Figuren). Ohne diese Unterscheidung stünde „1/6 Plätze" und
     * „Beitreten" an einer Lobby, die schon voll ist.
     */
    const plaetze = lobby.seatsTotal ?? lobby.capacity ?? 0;
    const belegtZahl = lobby.occupied ?? 0;
    const voll = belegtZahl >= plaetze;
    const verbunden = Math.min(lobby.connected ?? belegtZahl, belegtZahl);
    item.dataset.zustand = voll ? 'voll' : belegtZahl > 0 ? 'wartet' : 'leer';

    const el = (tag, klasse, text) => {
      const knoten = doc.createElement(tag);
      if (klasse) knoten.className = klasse;
      if (text !== undefined) knoten.textContent = text;
      return knoten;
    };

    // Kopf: Lobby-ID (Wiedererkennung) und Karte als Chip.
    const kopf = el('div', 'lk-kopf');
    kopf.append(el('span', 'lk-id', lobby.id), el('span', 'chip chip-karte', lobby.preset ?? 'hills'));

    // Konfig-Zusammenfassung als kleine Chips.
    const konfig = el('div', 'lk-konfig');
    if (lobby.teams) konfig.append(el('span', 'chip', `${lobby.teams} Teams × ${lobby.playersPerTeam ?? '?'}`));

    // Spielerplätze: ein Feld je Platz (belegt/verbunden/getrennt/frei) plus Zahl.
    const platzZeile = el('div', 'lk-plaetze');
    const felder = el('span', 'lk-felder');
    felder.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < Math.min(plaetze, 12); i += 1) {
      const zustand = i < verbunden ? 'bereit' : i < belegtZahl ? 'getrennt' : 'frei';
      felder.append(el('span', `lk-platz is-${zustand}`));
    }
    const belegt = `${belegtZahl}/${plaetze || '?'}`;
    platzZeile.append(felder, el('span', 'lk-zahl', `${belegt} Plätze`));

    // Bereit-Status: die Lobby ist offen, voll oder wartet auf Mitspieler.
    const stand = voll ? 'Voll' : belegtZahl === 0 ? 'Alle Plätze frei' : `Wartet auf ${plaetze - belegtZahl}`;
    const zusatz = belegtZahl > 0 && verbunden < belegtZahl ? ` · ${belegtZahl - verbunden} getrennt` : '';
    const statusChip = el('span', `chip chip-status is-${item.dataset.zustand}`, stand + zusatz);

    const join = doc.createElement('button');
    join.type = 'button';
    join.className = 'lk-beitreten';
    join.textContent = voll ? 'Voll' : 'Auswählen';
    join.disabled = voll;
    join.setAttribute('aria-label', `${voll ? 'Voll' : 'Auswählen'}: Lobby ${lobby.id}, ${belegt} Plätze`);
    join.addEventListener('click', () => {
      const lobbyInput = doc.getElementById('cfg-lobby');
      if (lobbyInput) lobbyInput.value = lobby.id;
      if (status) status.textContent = `Lobby ${lobby.id} ausgewählt — auf "Match starten" klicken.`;
      zeigeToast(`Lobby ${lobby.id} ausgewählt`, 'good');
    });

    const info = el('div', 'lk-info');
    konfig.append(statusChip);
    info.append(kopf, konfig, platzZeile);
    item.append(info, join);
    return item;
  }));
  return { ok: true, count: offen.length };
}
