/**
 * Rangliste und Podest im Endbildschirm (A6 UI-Rest).
 *
 * ## Warum das hier steht und nicht in `main.js`
 *
 * `main.js` baut die Beitragstabelle bereits aus den Partiekennzahlen
 * (`#zeigeMatchKennzahlen`). Diese Datei liest genau diese Tabelle und stellt
 * sie als Rangliste mit Podest dar — sie erfindet keine Zahlen und schreibt
 * nicht in die Simulation. `main.js` bleibt unberührt (Paketregel A6).
 *
 * ## Keine Kills
 *
 * Die Rangliste ordnet nach SCHADEN. Kills sind bewusst kein Teil davon: Sie
 * fehlen online (die Kennzahlen werden dort nicht gefüttert) und wären als
 * Ordnungskriterium eine zweite, unvollständige Wahrheit. Die Spalte „Kills"
 * wird deshalb im Endbildschirm ausgeblendet, ebenso die Zeile „Deine Kills".
 * Alles andere kommt unverändert aus der Tabelle.
 *
 * @module endrangliste
 */

/** Entfernt die Kills-Spalte und die Kills-Zeile aus dem vorhandenen Endbildschirm. */
function entferneKills(overlay) {
  const tabelle = overlay.querySelector('#match-tabelle');
  if (tabelle) {
    const kopf = tabelle.querySelector('thead tr');
    const kopfzellen = kopf ? [...kopf.children] : [];
    const spalte = kopfzellen.findIndex(zelle => zelle.textContent.trim() === 'Kills');
    if (spalte >= 0) {
      for (const zeile of tabelle.querySelectorAll('tr')) {
        zeile.children[spalte]?.remove();
      }
    }
  }

  const kennzahlen = overlay.querySelector('#match-kennzahlen');
  if (kennzahlen) {
    for (const zeile of kennzahlen.querySelectorAll('.profil-zeile')) {
      if (/^Deine Kills:/.test(zeile.textContent.trim())) zeile.remove();
    }
  }
}

/** Liest die Beitragstabelle als Rangliste. Nur vorhandene Spalten, keine Annahmen. */
function leseRangliste(overlay) {
  const tabelle = overlay.querySelector('#match-tabelle');
  const kopf = tabelle?.querySelector('thead tr');
  if (!tabelle || !kopf) return [];
  const titel = [...kopf.children].map(zelle => zelle.textContent.trim());
  const spalte = name => titel.findIndex(text => text === name);
  const sSpieler = spalte('Spieler');
  const sSchaden = spalte('Schaden');
  const sSchuesse = spalte('Schüsse');
  const sQuote = spalte('Trefferquote');
  if (sSpieler < 0 || sSchaden < 0) return [];

  const zahl = text => {
    const treffer = String(text).replace(/[^\d,.-]/g, '').replace(',', '.');
    const wert = Number.parseFloat(treffer);
    return Number.isFinite(wert) ? wert : 0;
  };
  const quote = text => {
    if (!text || text.trim() === '—') return null;
    const wert = zahl(text);
    return Number.isFinite(wert) ? wert : null;
  };

  const eintraege = [];
  for (const zeile of tabelle.querySelectorAll('tbody tr')) {
    const zellen = [...zeile.children];
    const spieler = zellen[sSpieler]?.textContent.trim();
    if (!spieler) continue;
    eintraege.push({
      spieler,
      schaden: sSchaden >= 0 ? zahl(zellen[sSchaden]?.textContent) : 0,
      schuesse: sSchuesse >= 0 ? zahl(zellen[sSchuesse]?.textContent) : 0,
      quote: sQuote >= 0 ? quote(zellen[sQuote]?.textContent) : null,
    });
  }

  /*
   * Rang nach Schaden, danach Trefferquote, danach Name. Die Reihenfolge ist
   * damit auch bei Schadensgleichstand eindeutig — und sie hängt nur an Werten,
   * die in der Tabelle stehen.
   */
  return eintraege.sort((a, b) =>
    b.schaden - a.schaden
    || (b.quote ?? -1) - (a.quote ?? -1)
    || a.spieler.localeCompare(b.spieler, 'de'));
}

function baueZeile(eintrag, platz, mitKopf) {
  const zeile = document.createElement('li');
  zeile.className = 'end-rang__zeile';
  zeile.dataset.platz = String(platz);
  if (platz <= 3) zeile.classList.add('ist-podest');

  const nr = document.createElement('span');
  nr.className = 'end-rang__nr';
  nr.textContent = String(platz);

  const name = document.createElement('span');
  name.className = 'end-rang__name';
  name.textContent = eintrag.spieler;

  const schaden = document.createElement('span');
  schaden.className = 'end-rang__schaden';
  schaden.textContent = String(eintrag.schaden);

  const quote = document.createElement('span');
  quote.className = 'end-rang__quote';
  quote.textContent = eintrag.quote === null ? '—' : `${Math.round(eintrag.quote)} %`;

  zeile.append(nr, name, schaden, quote);

  if (mitKopf) {
    const kopf = document.createElement('li');
    kopf.className = 'end-rang__zeile end-rang__kopf';
    kopf.setAttribute('aria-hidden', 'true');
    for (const [text, klasse] of [
      ['Platz', 'end-rang__nr'], ['Spieler', 'end-rang__name'],
      ['Schaden', 'end-rang__schaden'], ['Treffer', 'end-rang__quote'],
    ]) {
      const zelle = document.createElement('span');
      zelle.className = klasse;
      zelle.textContent = text;
      kopf.append(zelle);
    }
    return [kopf, zeile];
  }
  zeile.append(nr, name, schaden, quote);
  return [zeile];
}

function bauePodest(eintraege) {
  const podest = document.createElement('ol');
  podest.className = 'end-podest';
  // Podest-Anordnung: 2 · 1 · 3. Screenreader lesen die vollständige Liste darunter.
  podest.setAttribute('aria-hidden', 'true');
  const reihenfolge = [eintraege[1], eintraege[0], eintraege[2]].filter(Boolean);
  for (const eintrag of reihenfolge) {
    const platz = eintraege.indexOf(eintrag) + 1;
    const block = document.createElement('li');
    block.className = 'end-podest__platz';
    block.dataset.platz = String(platz);

    const krone = document.createElement('span');
    krone.className = 'end-podest__krone';
    krone.textContent = `${platz}.`;

    const name = document.createElement('span');
    name.className = 'end-podest__name';
    name.textContent = eintrag.spieler;

    const wert = document.createElement('span');
    wert.className = 'end-podest__wert';
    wert.textContent = String(eintrag.schaden);

    const einheit = document.createElement('span');
    einheit.className = 'end-podest__einheit';
    einheit.textContent = 'Schaden';

    const stufe = document.createElement('span');
    stufe.className = 'end-podest__stufe';

    block.append(krone, name, wert, einheit, stufe);
    podest.append(block);
  }
  return podest;
}

function zeichne(behaelter, eintraege) {
  if (eintraege.length === 0) {
    behaelter.hidden = true;
    return;
  }
  behaelter.hidden = false;

  const titel = document.createElement('h2');
  titel.id = 'end-rangliste-titel';
  titel.className = 'end-rangliste__titel';
  titel.textContent = 'Rangliste';

  const hinweis = document.createElement('p');
  hinweis.className = 'end-rangliste__hinweis';
  hinweis.textContent = 'Nach Schaden aus dieser Partie — die vollständige Beitragstabelle steht darunter.';

  const liste = document.createElement('ol');
  liste.className = 'end-rangliste__liste';
  liste.setAttribute('aria-labelledby', 'end-rangliste-titel');
  const zeilen = [];
  eintraege.forEach((eintrag, index) => {
    zeilen.push(...baueZeile(eintrag, index + 1, index === 0));
  });
  liste.append(...zeilen);

  behaelter.replaceChildren(titel, hinweis, bauePodest(eintraege), liste);
}

/** Hält den Beobachter am Leben — ein lokaler MutationObserver kann sonst eingesammelt werden. */
let beobachter = null;

/** Startet die Rangliste; beobachtet Tabelle und Sichtbarkeit des Dialogs. */
export function starteEndrangliste() {
  const overlay = document.getElementById('end-overlay');
  if (!overlay || overlay.dataset.ranglisteAktiv === '1') return false;
  overlay.dataset.ranglisteAktiv = '1';

  let geplant = false;
  let letzteSignatur = '';

  const aktualisiere = () => {
    geplant = false;
    if (overlay.hidden) return;
    entferneKills(overlay);

    const tabelle = overlay.querySelector('#match-tabelle');
    const signatur = tabelle?.textContent ?? '';
    if (signatur === letzteSignatur) return;
    letzteSignatur = signatur;

    const eintraege = leseRangliste(overlay);
    let behaelter = document.getElementById('end-rangliste');
    if (!behaelter) {
      behaelter = document.createElement('section');
      behaelter.id = 'end-rangliste';
      behaelter.className = 'end-rangliste';
      behaelter.setAttribute('aria-labelledby', 'end-rangliste-titel');
      const anker = overlay.querySelector('#end-summary');
      if (anker) anker.insertAdjacentElement('afterend', behaelter);
      else overlay.querySelector('.overlay-card')?.append(behaelter);
    }
    zeichne(behaelter, eintraege);
  };

  const plane = () => {
    if (geplant) return;
    geplant = true;
    // Mikrotask: läuft nach dem DOM-Aufbau und vor dem nächsten Bild. Ein
    // requestAnimationFrame kann in Hintergrund-Tabs ausgesetzt sein — der
    // Endbildschirm würde dann ohne Rangliste stehen bleiben.
    queueMicrotask(() => {
      geplant = false;
      aktualisiere();
    });
  };

  beobachter?.disconnect();
  beobachter = new MutationObserver(plane);
  beobachter.observe(overlay, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });

  // Beim Öffnen nach einem Neustart: einmal direkt versuchen.
  aktualisiere();
  return true;
}
