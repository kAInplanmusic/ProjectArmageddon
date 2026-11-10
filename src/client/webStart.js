/**
 * Web-Zugang (Option D, docs/zugang-www.md): Login, Start-Knopf und Statusseite VOR dem Spiel.
 *
 * Wird nur in dem Build geladen, der mit PA_WEB_BUILD=1 entsteht (vite.config.mjs) und neben
 * `pa-web.json` liegt. Ohne diese Datei (Server liefert den Client selbst aus) tut das Modul nichts.
 * Kein Einfluss auf Engine oder Replay: Nach „bereit" wird nur das Feld „Online: Server" gesetzt —
 * dieselbe Adresse, die der Client ohnehin als Spielserver kennt (`serverBasis()` in konto.js).
 */
const API = '/api/web';
const TAKT_MS = 5000;

async function ruf(pfad, methode = 'GET', body = null) {
  const r = await fetch(`${API}/${pfad}`, {
    method: methode, credentials: 'same-origin',
    headers: methode === 'GET' ? {} : { 'content-type': 'application/json', 'x-pa-web': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let daten = {}; try { daten = await r.json(); } catch { /* leer */ }
  return { ok: r.ok, status: r.status, daten };
}

const TEXTE = {
  aus: 'Der Spielserver ist aus. Er fährt auf Knopfdruck hoch (ca. 2 bis 4 Minuten) und sichert sich nach Leerlauf selbst.',
  startet: 'Der Server wird gestartet. Diese Seite aktualisiert sich selbst.',
  sichert: 'Der Server sichert sich gerade und verschwindet. Danach kannst du ihn neu starten.',
  bereit: 'Der Server ist bereit.',
};

export function versionenPassen(client, server) {
  if (!client || !server) return true;
  return (!client.version || !server.version || client.version === server.version) && (!client.gitSha || !server.gitSha || client.gitSha === server.gitSha);
}

function baue() {
  const w = document.createElement('div');
  w.id = 'pa-web-start';
  w.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#14161a;color:#e8e8e8;font:16px system-ui;padding:1rem';
  w.innerHTML = '<div style="max-width:30rem;width:100%"><h1 style="margin:0 0 1rem">ProjectArmageddon</h1><p id="pa-web-text"></p><div id="pa-web-bereich"></div></div>';
  document.body.appendChild(w);
  return { wurzel: w, text: w.querySelector('#pa-web-text'), bereich: w.querySelector('#pa-web-bereich') };
}
const knopf = (beschriftung, tat, rot = false) => {
  const b = document.createElement('button');
  b.textContent = beschriftung; b.onclick = tat;
  b.style.cssText = `display:block;width:100%;font:inherit;padding:.8rem;margin:.4rem 0;border-radius:.4rem;border:1px solid #555;color:#fff;background:${rot ? '#7a1f1f' : '#232830'}`;
  return b;
};

export async function starteWebStart() {
  let konfig = null;
  try {
    const r = await fetch('pa-web.json', { cache: 'no-store' });
    if (!r.ok || !String(r.headers.get('content-type')).includes('json')) return;
    konfig = await r.json();
  } catch { return; }
  if (!konfig?.gateway) return;
  const ui = baue();
  let timer = null;

  const zeigeLogin = (meldung = '') => {
    clearTimeout(timer);
    ui.text.textContent = meldung || 'Bitte anmelden, um den Spielserver zu starten.';
    ui.bereich.replaceChildren();
    const feld = document.createElement('input');
    feld.type = 'password'; feld.placeholder = 'Passwort'; feld.autocomplete = 'current-password';
    feld.style.cssText = 'display:block;width:100%;box-sizing:border-box;font:inherit;padding:.8rem;border-radius:.4rem;border:1px solid #555;background:#232830;color:#fff';
    const los = async () => {
      const r = await ruf('login', 'POST', { passwort: feld.value });
      if (r.ok) return aktualisiere(); zeigeLogin(r.daten.fehler ?? 'Anmeldung fehlgeschlagen.');
    };
    feld.onkeydown = e => { if (e.key === 'Enter') los(); };
    ui.bereich.append(feld, knopf('Anmelden', los));
    feld.focus();
  };

  const aktualisiere = async () => {
    clearTimeout(timer);
    let r;
    try { r = await ruf('status'); } catch { ui.text.textContent = 'Keine Verbindung zum Zugang. Neuer Versuch …'; timer = setTimeout(aktualisiere, TAKT_MS); return; }
    if (r.status === 401) return zeigeLogin();
    if (!r.ok) { ui.text.textContent = r.daten.fehler ?? `Fehler ${r.status}`; timer = setTimeout(aktualisiere, TAKT_MS * 2); return; }
    const s = r.daten;
    ui.text.textContent = TEXTE[s.zustand] ?? s.zustand;
    ui.bereich.replaceChildren();
    if (s.zustand === 'aus') {
      ui.bereich.append(knopf(s.abbild ? 'Server starten' : 'Server starten (erste Einrichtung, dauert länger)', async () => {
        const a = await ruf('start', 'POST', {});
        if (!a.ok) ui.text.textContent = a.daten.fehler ?? 'Start fehlgeschlagen.';
        aktualisiere();
      }));
    } else if (s.zustand === 'startet') {
      ui.text.textContent += s.phase ? ` (Phase: ${s.phase})` : '';
    } else if (s.zustand === 'bereit') {
      let clientVersion = null;
      try { clientVersion = await (await fetch('version.json', { cache: 'no-store' })).json(); } catch { /* ohne Vergleich */ }
      const feld = document.getElementById('cfg-server');
      if (feld) { feld.value = s.spielUrl; feld.dispatchEvent(new Event('input', { bubbles: true })); feld.dispatchEvent(new Event('change', { bubbles: true })); }
      const oeffnen = () => ui.wurzel.remove();
      if (versionenPassen(clientVersion, s)) return oeffnen();
      ui.text.textContent = `Achtung: Die Seite (${clientVersion?.version} ${clientVersion?.gitSha ?? ''}) und der Server (${s.version} ${s.gitSha ?? ''}) haben unterschiedliche Versionen. Das Spielen kann scheitern.`;
      ui.bereich.append(knopf('Trotzdem spielen', oeffnen));
    }
    if (s.zustand !== 'bereit') {
      if (s.zustand !== 'sichert') ui.bereich.append(knopf('Not-aus (Abbild sichern, Server löschen)', async () => {
        if (!confirm('Not-aus: Server herunterfahren, Abbild prüfen, löschen?')) return;
        const a = await ruf('not-aus', 'POST', {}); ui.text.textContent = a.ok ? 'Not-aus läuft …' : (a.daten.fehler ?? 'Not-aus fehlgeschlagen.');
      }, true));
      timer = setTimeout(aktualisiere, TAKT_MS);
    }
  };
  aktualisiere();
}

if (typeof document !== 'undefined') starteWebStart();
