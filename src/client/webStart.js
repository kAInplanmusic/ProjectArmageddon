/**
 * Web-Zugang (Option D, docs/zugang-www.md): Anmeldung vor dem Spiel, Startscreen mit Startcode-Feld,
 * Serverstatus und Spieltoken.
 *
 * Wird nur in dem Build geladen, der mit PA_WEB_BUILD=1 entsteht (vite.config.mjs) und neben `pa-web.json`
 * liegt. Ohne diese Datei (Server liefert den Client selbst aus) tut das Modul nichts.
 * Kein Einfluss auf Engine oder Replay.
 *
 * Ablauf: 1. Login/Registrieren (`webAnmeldung.js`). 2. Der normale Startscreen des Spiels (Logo, Titellied
 * über die Menümusik) bekommt eine Leiste: Konto (Passwort ändern, Abmelden), ein unbeschriftetes Feld
 * (aria-label „Startcode") und eine Statuszeile. Der Startcode fährt den Server hoch; läuft er schon, spielen
 * Angemeldete ohne Code. 3. Bei „bereit" wird „Online: Server" gesetzt und ein kurzlebiges Spieltoken
 * (`/api/web/spieltoken`) als Sitzung des Spiels abgelegt (`konto.js`), das regelmäßig erneuert wird.
 */
import { loescheSitzung, serverBasis, speichereSitzung } from './konto.js';
import { statusText, versionenPassen, ruf, fehlerText } from './webApi.js';
import { stilEinfuegen, zeigeAnmeldung, zeigePasswortDialog } from './webAnmeldung.js';

export { versionenPassen };
const TAKT_MS = 5000;
const TAKT_BEREIT_MS = 30_000;
const TOKEN_ERNEUERN_MS = 25 * 60_000;

export async function starteWebStart(doc = document) {
  let konfig = null;
  try {
    const r = await fetch('pa-web.json', { cache: 'no-store' });
    if (!r.ok || !String(r.headers.get('content-type')).includes('json')) return;
    konfig = await r.json();
  } catch { return; }
  if (!konfig?.gateway) return;

  let timer = null; let tokenTimer = null; let leiste = null; let letzter = null;
  const el = (tag, eig = {}, ...kinder) => { const e = doc.createElement(tag); Object.assign(e, eig); e.append(...kinder); return e; };

  const holeToken = async () => {
    const r = await ruf('spieltoken', 'POST', {});
    if (r.status === 401) { await abgelaufen(); return false; }
    if (r.ok) speichereSitzung({ token: r.daten.token, name: r.daten.name, server: serverBasis() });
    return r.ok;
  };

  const stoppe = () => { clearTimeout(timer); clearInterval(tokenTimer); };

  async function abgelaufen() { stoppe(); leiste?.remove(); leiste = null; loescheSitzung(); await anmelden(); }

  async function anmelden() {
    const nutzer = await zeigeAnmeldung(doc);
    zeigeLeiste(nutzer);
  }

  function zeigeLeiste(nutzer) {
    stilEinfuegen(doc);
    doc.getElementById('konto-browser')?.setAttribute('hidden', ''); // das Konto des Spielservers ersetzt die Webseite
    const marke = doc.querySelector('#menu-overlay .menu-marke') ?? doc.body;
    leiste = el('div', { className: 'pa-web-leiste', id: 'pa-web-leiste' });
    const kopf = el('div', { className: 'pa-web-zeile' }, 'Angemeldet als ', el('b', { textContent: nutzer.name }));
    const pw = el('button', { type: 'button', textContent: 'Passwort ändern' });
    pw.onclick = async () => { if (await zeigePasswortDialog(doc)) meldung('Passwort geändert.'); };
    const aus = el('button', { type: 'button', textContent: 'Abmelden' });
    aus.onclick = async () => { await ruf('logout', 'POST', {}); await abgelaufen(); };
    kopf.append(pw, aus);

    // Unbeschriftetes Feld (kein sichtbares Label), für Hilfstechnik trotzdem benannt.
    const code = el('input', { type: 'text', id: 'pa-startcode', name: 'startcode', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, maxLength: 200 });
    code.setAttribute('aria-label', 'Startcode'); code.setAttribute('autocorrect', 'off'); code.setAttribute('data-1p-ignore', ''); code.setAttribute('data-lpignore', 'true');
    const notaus = el('button', { type: 'button', textContent: 'Not-aus', hidden: true });
    notaus.title = 'Server sichern und löschen (Startcode ins Feld eingeben)';
    const status = el('p', { className: 'pa-web-status', id: 'pa-web-status', style: 'margin:0' });
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const zeile = el('div', { className: 'pa-web-zeile' }, code, notaus);
    leiste.append(kopf, zeile, status);
    marke.append(leiste);

    const meldung = t => { status.textContent = t; };
    leiste.meldung = meldung;
    const eingabeLeeren = () => { code.value = ''; };

    code.onkeydown = async e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const wert = code.value;
      if (!wert) return;
      if (letzter && letzter.zustand !== 'aus') { meldung(`${statusText(letzter)} Der Startcode wird nur zum Hochfahren gebraucht.`); eingabeLeeren(); return; }
      const r = await ruf('start', 'POST', { startcode: wert });
      eingabeLeeren();
      if (r.status === 401) return abgelaufen();
      if (!r.ok) { meldung(fehlerText(r, 'Start fehlgeschlagen.')); return; } // Meldung bleibt bis zur nächsten Abfrage stehen
      meldung('Server wird gestartet …');
      aktualisiere();
    };
    notaus.onclick = async () => {
      if (!code.value) { meldung('Für den Not-aus den Startcode in das Feld eingeben.'); code.focus(); return; }
      if (!doc.defaultView.confirm('Not-aus: Server herunterfahren, Abbild prüfen, löschen?')) return;
      const r = await ruf('not-aus', 'POST', { startcode: code.value });
      eingabeLeeren();
      meldung(r.ok ? 'Not-aus läuft …' : fehlerText(r, 'Not-aus fehlgeschlagen.'));
    };

    holeToken();
    tokenTimer = setInterval(() => { if (!doc.hidden) holeToken(); }, TOKEN_ERNEUERN_MS);
    leiste.notaus = notaus;
    aktualisiere();
  }

  async function aktualisiere() {
    clearTimeout(timer);
    if (!leiste) return;
    let r;
    try { r = await ruf('status'); } catch { leiste.meldung('Keine Verbindung zum Zugang. Neuer Versuch …'); timer = setTimeout(aktualisiere, TAKT_MS); return; }
    if (r.status === 401) return abgelaufen();
    if (!r.ok) { leiste.meldung(r.daten.fehler ?? `Fehler ${r.status}`); timer = setTimeout(aktualisiere, TAKT_MS * 2); return; }
    const s = r.daten; letzter = s;
    let text = statusText(s);
    leiste.notaus.hidden = !(s.zustand === 'startet' || s.zustand === 'bereit');
    if (s.zustand === 'bereit') {
      let clientVersion = null;
      try { clientVersion = await (await fetch('version.json', { cache: 'no-store' })).json(); } catch { /* ohne Vergleich */ }
      const feld = doc.getElementById('cfg-server');
      if (feld && feld.value !== s.spielUrl) { feld.value = s.spielUrl; feld.dispatchEvent(new Event('input', { bubbles: true })); feld.dispatchEvent(new Event('change', { bubbles: true })); }
      await holeToken();
      if (!versionenPassen(clientVersion, s)) text += ` Achtung: Seite (${clientVersion?.version} ${clientVersion?.gitSha ?? ''}) und Server (${s.version} ${s.gitSha ?? ''}) haben unterschiedliche Versionen, das Spielen kann scheitern.`;
    }
    leiste.meldung(text);
    timer = setTimeout(() => { if (doc.hidden) timer = setTimeout(aktualisiere, TAKT_MS); else aktualisiere(); }, s.zustand === 'bereit' ? TAKT_BEREIT_MS : TAKT_MS);
  }

  // Schon angemeldet (Cookie gültig)? Dann direkt zum Startscreen, sonst das Anmeldefenster.
  let ich = null;
  try { ich = await ruf('ich'); } catch { /* Anmeldefenster */ }
  if (ich?.ok) zeigeLeiste(ich.daten.nutzer); else await anmelden();
}

if (typeof document !== 'undefined') starteWebStart();
