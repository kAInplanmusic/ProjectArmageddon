/**
 * Menü-Verdrahtung für Konten und Rangliste (Paket C).
 *
 * ## Was hier drin ist
 *
 * Formular für Anmelden/Registrieren, Abmelden, Konto löschen und die Anzeige
 * der Rangliste samt Bestwerten — also alles, was das Menü anfasst.
 *
 * ## Warum ausgezogen
 *
 * `konto.js` war Netzzugang UND Oberfläche in einer Datei. Für das Zeilenbudget
 * (`tests/zeilenbudget.test.js`, AGENTS.md §3) und für die Lesbarkeit ist die
 * Trennung sauberer: Wer die Serverwege prüft, muss die DOM-Arbeit nicht mit
 * lesen — und umgekehrt. `konto.js` bleibt der reine Netzzugang, dieses Modul
 * kennt die Elemente im Menü und ruft nur dessen Funktionen.
 *
 * Es rechnet nichts aus und entscheidet nichts über Siege: Der Server führt die
 * Partie und verbucht sie selbst (`docs/konto-und-bestenliste.md`).
 *
 * @module client/kontoMenue
 */
import {
  abmelden,
  anmelden,
  kontoLoeschen,
  ladeBestenliste,
  leseSitzung,
  registrieren,
} from './konto.js';

/* ------------------------------------------------------------------ Anzeige */

const zahl = wert => (typeof wert === 'number' && Number.isFinite(wert)
  ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert)
  : '—');

const prozent = wert => (typeof wert === 'number' ? `${Math.round(wert * 100)} %` : '—');

function setzeStatus(text, art = '') {
  const feld = globalThis.document?.getElementById('konto-status');
  if (!feld) return;
  feld.textContent = text;
  feld.dataset.art = art;
}

function zeigeAngemeldet(konto) {
  const document = globalThis.document;
  if (!document) return;
  const bereich = document.getElementById('konto-angemeldet');
  const formular = document.getElementById('konto-form');
  const anzeige = document.getElementById('konto-name-anzeige');
  if (bereich) bereich.hidden = !konto;
  if (formular) formular.hidden = Boolean(konto);
  if (anzeige) anzeige.textContent = konto?.name ?? '';
}

/** Baut die Rangliste in die Liste im Menü. */
function zeichneListe(daten) {
  const document = globalThis.document;
  if (!document) return;
  const liste = document.getElementById('rangliste');
  const rekorde = document.getElementById('rangliste-rekorde');
  if (liste) {
    liste.textContent = '';
    if (!daten.eintraege?.length) {
      const leer = document.createElement('li');
      leer.className = 'muted';
      leer.textContent = 'Noch niemand gewertet — die erste Online-Partie mit zwei Konten füllt die Liste.';
      liste.append(leer);
    }
    for (const zeile of daten.eintraege ?? []) {
      const eintrag = document.createElement('li');
      eintrag.className = 'rangliste-zeile';
      eintrag.dataset.platz = String(zeile.platz);
      const kopf = document.createElement('span');
      kopf.className = 'rangliste-name';
      kopf.textContent = `${zeile.platz}. ${zeile.name}`;
      const wert = document.createElement('span');
      wert.className = 'rangliste-elo';
      wert.textContent = `${zahl(zeile.elo)} Elo`;
      const rest = document.createElement('span');
      rest.className = 'rangliste-zahlen muted';
      rest.textContent = `${zeile.siege} S / ${zeile.niederlagen} N · ${zeile.partien} Partien · `
        + `${zahl(zeile.kills)} Kills · ${zahl(zeile.schaden)} Schaden · Quote ${prozent(zeile.siegquote)}`;
      eintrag.append(kopf, wert, rest);
      liste.append(eintrag);
    }
  }
  if (rekorde) {
    const werte = daten.bestwerte ?? {};
    const zeile = (titel, treffer, einheit = '') => (treffer
      ? `${titel}: ${treffer.name} (${zahl(treffer.wert)}${einheit})`
      : `${titel}: noch offen`);
    rekorde.textContent = [
      zeile('Meiste Schüsse in einer Partie', werte.meisteSchuesse),
      zeile('Beste K/D', werte.besteKd),
      zeile('Schlechteste K/D', werte.schlechtesteKd),
      zeile('Meiste Siege', werte.meisteSiege),
    ].join(' · ');
  }
}

/**
 * Verdrahtet Formular, Abmelden, Löschen und Rangliste.
 *
 * Wird einmal beim Start aufgerufen. Fehlen die Elemente (andere Seite,
 * Testumgebung), passiert nichts — das Modul ist dann nur über seine Funktionen
 * nutzbar.
 */
export function kontoEinrichten() {
  const document = globalThis.document;
  if (!document) return;
  const formular = document.getElementById('konto-form');
  if (!formular) return;

  const nameFeld = document.getElementById('konto-name');
  const passwortFeld = document.getElementById('konto-passwort');
  const status = () => ({ name: nameFeld?.value?.trim() ?? '', passwort: passwortFeld?.value ?? '' });

  const fuehreAus = async (aktion, erfolg) => {
    const { name, passwort } = status();
    if (!name || !passwort) { setzeStatus('Name und Passwort sind nötig.', 'warnung'); return; }
    try {
      const konto = await aktion(name, passwort);
      setzeStatus(erfolg(konto), 'ok');
      if (passwortFeld) passwortFeld.value = '';
      zeigeAngemeldet(konto);
    } catch (fehler) {
      setzeStatus(fehler.message, 'fehler');
    }
  };

  formular.addEventListener('submit', ereignis => {
    ereignis.preventDefault();
    fuehreAus(anmelden, konto => `Angemeldet als ${konto.name}.`);
  });

  document.getElementById('konto-registrieren')?.addEventListener('click', () => {
    fuehreAus(registrieren, konto => `Konto ${konto.name} angelegt und angemeldet.`);
  });

  document.getElementById('konto-abmelden')?.addEventListener('click', async () => {
    await abmelden();
    zeigeAngemeldet(null);
    setzeStatus('Abgemeldet. Gäste spielen weiter ohne Konto.', 'ok');
  });

  document.getElementById('konto-loeschen')?.addEventListener('click', async () => {
    const passwort = document.getElementById('konto-loeschen-passwort')?.value ?? '';
    if (!passwort) { setzeStatus('Zum Löschen das Passwort eingeben.', 'warnung'); return; }
    try {
      await kontoLoeschen(passwort);
      zeigeAngemeldet(null);
      setzeStatus('Konto samt Daten gelöscht.', 'ok');
    } catch (fehler) {
      setzeStatus(fehler.message, 'fehler');
    }
  });

  const laden = async () => {
    const feld = document.getElementById('rangliste-status');
    if (feld) feld.textContent = 'Lade …';
    try {
      const daten = await ladeBestenliste();
      zeichneListe(daten);
      if (feld) feld.textContent = `${daten.eintraege?.length ?? 0} Einträge.`;
    } catch (fehler) {
      if (feld) feld.textContent = `Rangliste nicht erreichbar: ${fehler.message}`;
    }
  };
  document.getElementById('rangliste-laden')?.addEventListener('click', laden);
  document.getElementById('rangliste-browser')?.addEventListener('toggle', ereignis => {
    if (ereignis.target.open) laden();
  });

  // Beim Start: Ist dieser Tab noch angemeldet? Dann Formular verbergen.
  const sitzung = leseSitzung();
  if (sitzung?.name) zeigeAngemeldet({ name: sitzung.name });
}

export default { kontoEinrichten };
