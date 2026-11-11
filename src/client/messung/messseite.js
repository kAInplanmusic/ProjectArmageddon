/**
 * Bedienung der Messseite (`messung.html`): Startknopf, Anzeige, Kopieren, Teilen, Sichern.
 *
 * Die Messung selbst steht in `messlauf.js`, das Format und die Tabellen in `ergebnis.js`, der Plan in
 * `plan.js`. Dieses Modul ist nur Verdrahtung und wird nicht ins Spiel-Bündel gezogen (eigener
 * Einstiegspunkt im Build, `vite.config.mjs`).
 *
 * @module messung/messseite
 */
import { waehlePlan } from './plan.js';
import { fuehreMessungAus, liesSpur, sichereSpur } from './messlauf.js';
import { dateiname, fazit, KOPF_AUFBAU, KOPF_BILDER, pruefeErgebnis, tabellenZeilen } from './ergebnis.js';

const $ = id => document.getElementById(id);
const plan = waehlePlan(new URLSearchParams(location.search).get('plan'));
let aktuell = null;
let abbruch = { abgebrochen: false };

function setzeTabelle(tabelle, kopf, zeilen) {
  tabelle.replaceChildren();
  const k = tabelle.createTHead().insertRow();
  for (const text of kopf) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; k.append(th); }
  const body = tabelle.createTBody();
  for (const zeile of zeilen) {
    const tr = body.insertRow();
    for (const text of zeile) tr.insertCell().textContent = text;
  }
}

function zeigeGeraet(g) {
  const wegl = g.webgl ? (g.webgl.rendererFrei ?? g.webgl.renderer) + (g.webgl.freigegeben ? '' : ' (Browser nennt nur Allgemeines)') : 'nicht verfügbar';
  const zeilen = [
    ['Browser', g.ua],
    ['Bildpunkt-Dichte', String(g.devicePixelRatio)],
    ['Bildschirm', `${g.bildschirm.breite} × ${g.bildschirm.hoehe}`],
    ['Fenster', `${g.fenster.breite} × ${g.fenster.hoehe} (${g.ausrichtung})`],
    ['Kerne / Speicher', `${g.kerne ?? '?'} Kerne, ${g.geraeteSpeicherGB ?? '?'} GB`],
    ['Grafik (WebGL)', wegl],
    ['Software-Rasterung', g.softwareRasterung === null ? 'unbekannt' : (g.softwareRasterung ? 'JA (keine echte Grafikkarte)' : 'nein')],
    ['Bildschirm wachgehalten', g.wachhalten ? 'ja' : 'nein (bitte nicht sperren)'],
  ];
  const dl = $('geraet');
  dl.replaceChildren();
  for (const [name, wert] of zeilen) {
    const dt = document.createElement('dt'); dt.textContent = name; dt.className = 'leise';
    const dd = document.createElement('dd'); dd.textContent = wert;
    dl.append(dt, dd);
  }
}

function zeigeErgebnis(e) {
  aktuell = e;
  window.__MESSUNG__ = { ergebnis: e, probleme: pruefeErgebnis(e) };
  const tabellen = tabellenZeilen(e);
  const taktHinweis = e.leertakt ? ` Bildtakt ohne Spiel: ${e.leertakt.hz} Hz.` : '';
  $('fazit').textContent = fazit(e) + taktHinweis;
  $('hinweis').textContent = e.hinweis ?? '';
  zeigeGeraet(e.geraet);
  setzeTabelle($('t-aufbau'), KOPF_AUFBAU, tabellen.aufbau);
  setzeTabelle($('t-bilder'), KOPF_BILDER, tabellen.bilder);
  $('json').value = JSON.stringify(e, null, 2);
  $('ergebnis').hidden = false;
  $('teilen').disabled = !navigator.share;
  document.body.dataset.zustand = e.status === 'fertig' ? 'fertig' : e.status;
}

function meldung(text, art = '') {
  const el = $('aktion-status');
  el.textContent = text;
  el.className = `leise ${art}`;
}

async function kopieren() {
  const text = $('json').value;
  try {
    await navigator.clipboard.writeText(text);
    meldung('Kopiert. Jetzt in die Nachricht einfügen.');
  } catch {
    const feld = $('json');
    feld.removeAttribute('readonly');
    feld.focus(); feld.select(); feld.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    feld.setAttribute('readonly', '');
    meldung(ok ? 'Kopiert. Jetzt in die Nachricht einfügen.' : 'Automatisches Kopieren nicht möglich: Der Text unten ist markiert, bitte „Kopieren“ wählen.', ok ? '' : 'warn');
  }
}

async function teilen() {
  if (!aktuell || !navigator.share) { meldung('Teilen wird hier nicht unterstützt: bitte „Ergebnis kopieren“.', 'warn'); return; }
  const text = $('json').value;
  const titel = 'ProjectArmageddon Messung';
  try {
    const datei = new File([text], dateiname(aktuell), { type: 'application/json' });
    if (navigator.canShare?.({ files: [datei] })) await navigator.share({ title: titel, files: [datei] });
    else await navigator.share({ title: titel, text });
    meldung('Geteilt.');
  } catch (f) {
    if (f?.name === 'AbortError') meldung('Teilen abgebrochen.');
    else meldung(`Teilen nicht möglich (${f?.message ?? f}). Bitte „Ergebnis kopieren“ nehmen.`, 'warn');
  }
}

function sichern() {
  if (!aktuell) return;
  const url = URL.createObjectURL(new Blob([$('json').value], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = dateiname(aktuell);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  meldung('Datei wurde geladen (Ordner „Downloads“ bzw. „Dateien“).');
}

/** Beim Öffnen: Spur der letzten Messung zeigen. `laeuft` heißt: Die Seite wurde mitten in einer Szene beendet. */
function zeigeSpur() {
  const spur = liesSpur();
  if (!spur?.ergebnis) return;
  const e = spur.ergebnis;
  const kasten = $('spur');
  kasten.hidden = false;
  if (spur.status === 'laeuft') {
    kasten.textContent = `Die letzte Messung wurde bei der Szene „${spur.aktuelleSzene ?? '?'}“ unterbrochen: Die Seite wurde vom Browser beendet oder neu geladen, auf dem iPhone meist wegen zu wenig Speicher. Das ist ein Messergebnis. Die bis dahin fertigen Szenen stehen unten.`;
    kasten.className = 'karte warn';
    e.status = 'abgebrochen';
    e.hinweis = `Unterbrochen bei Szene ${spur.aktuelleSzene ?? '?'} (Seite beendet, vermutlich Speichermangel).`;
    e.beendet ??= new Date().toISOString();
    e.leertakt ??= null;
    e.gesamt ??= { dauerMs: 0, szenenOk: 0, szenenFehler: 0, szenenUebersprungen: 0 };
    e.szenen.push({ id: spur.aktuelleSzene ?? 'unbekannt', titel: spur.aktuelleSzene ?? 'unbekannt', status: 'fehler', fehler: 'Seite beendet (Speichermangel?)' });
    e.gesamt.szenenFehler += 1;
    sichereSpur({ status: 'fertig', aktuelleSzene: null, ergebnis: e }); // nicht bei jedem Öffnen erneut anhängen
    zeigeErgebnis(e);
  } else {
    kasten.textContent = `Letzte Messung vom ${new Date(e.gestartet).toLocaleString('de-DE')} (Status: ${e.status}). Unten steht sie noch einmal; „Messung starten“ misst neu.`;
    zeigeErgebnis(e);
  }
}

async function start() {
  $('start').disabled = true;
  $('spur').hidden = true;
  $('ergebnis').hidden = true;
  $('status').textContent = '';
  abbruch = { abgebrochen: false };
  document.body.classList.add('misst');
  document.body.dataset.zustand = 'misst';
  let e;
  try {
    e = await fuehreMessungAus({
      doc: document, plan, abbruch,
      beiFortschritt: ({ szene, von, titel }) => { $('leiste-text').textContent = `Szene ${szene}/${von}: ${titel}`; },
    });
  } finally {
    document.body.classList.remove('misst');
    $('start').disabled = false;
  }
  zeigeErgebnis(e);
  $('status').textContent = `Fertig nach ${Math.round(e.gesamt.dauerMs / 1000)} s. Bitte „Teilen“ oder „Ergebnis kopieren“ und an mich schicken.`;
  window.scrollTo?.(0, document.body.scrollHeight);
}

$('start').addEventListener('click', start);
$('abbrechen').addEventListener('click', () => { abbruch.abgebrochen = true; $('leiste-text').textContent = 'Wird nach dieser Szene beendet …'; });
$('kopieren').addEventListener('click', kopieren);
$('teilen').addEventListener('click', teilen);
$('speichern').addEventListener('click', sichern);
$('wach-hinweis').textContent = navigator.wakeLock
  ? 'Diese Seite hält den Bildschirm während der Messung selbst wach (soweit der Browser das erlaubt).'
  : 'Dieser Browser kann den Bildschirm nicht selbst wachhalten: bitte während der Messung nicht sperren.';
if (plan.id === 'test') $('status').textContent = 'Testplan (?plan=test): kurze Messung, die Werte sind nicht aussagekräftig.';
zeigeSpur();
document.body.dataset.bereit = '1';
