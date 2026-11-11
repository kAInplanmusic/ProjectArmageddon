/**
 * Web-Zugang: Anmelde- und Registrierfenster sowie Passwortwechsel (docs/zugang-www.md).
 *
 * Barrierefreiheit: echte `<form>`/`<label>`, `role="dialog"` mit `aria-modal`, Fehler in `role="alert"`,
 * Fokus im Fenster, der Rest der Seite ist `inert`, solange es offen ist. Die Klicks hier gelten für die
 * Musik als Nutzergeste (Autoplay-Regel, `musik.js`): Das Titellied startet mit dem ersten Klick.
 */
import { fehlerText, pruefeRegistrierung, ruf } from './webApi.js';

const CSS = `
.pa-web-deck{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.94);color:#e8e8e8;font:16px system-ui,sans-serif;padding:1rem;overflow:auto}
.pa-web-karte{width:100%;max-width:26rem;background:#171b21;border:1px solid #3a4250;border-radius:.6rem;padding:1.2rem 1.2rem 1rem}
.pa-web-karte h2{margin:0 0 .8rem;font-size:1.3rem}
.pa-web-karte label{display:block;margin:.6rem 0 .2rem;font-size:.9rem}
.pa-web-karte input{display:block;width:100%;box-sizing:border-box;font:inherit;padding:.7rem;min-height:44px;border-radius:.4rem;border:1px solid #5a6475;background:#232830;color:#fff}
.pa-web-karte button{font:inherit;min-height:44px;border-radius:.4rem;border:1px solid #5a6475;background:#232830;color:#fff;cursor:pointer;padding:.5rem .9rem}
.pa-web-karte button.pa-web-haupt{width:100%;margin-top:1rem;background:#2b5fa8;border-color:#4f86d6}
.pa-web-karte button.pa-web-link{background:none;border:0;text-decoration:underline;width:100%;margin-top:.4rem}
.pa-web-karte input:focus-visible,.pa-web-karte button:focus-visible{outline:3px solid #ffd54a;outline-offset:2px}
.pa-web-fehler{min-height:1.4em;margin:.6rem 0 0;color:#ff9a9a;font-size:.9rem}
.pa-web-leiste{display:grid;gap:.4rem;justify-items:center;margin-top:.4rem;font-size:13px}
.pa-web-leiste button{font:inherit;min-height:32px;border-radius:.3rem;border:1px solid #5a6475;background:#232830;color:#fff;cursor:pointer;padding:.2rem .6rem}
.pa-web-leiste button:focus-visible,.pa-web-leiste input:focus-visible{outline:3px solid #ffd54a;outline-offset:2px}
.pa-web-leiste input{font:inherit;width:11rem;max-width:100%;box-sizing:border-box;padding:.35rem .5rem;min-height:32px;border-radius:.3rem;border:1px solid #3a4250;background:#14171c;color:#fff;-webkit-text-security:disc}
.pa-web-zeile{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;justify-content:center}
`;

export function stilEinfuegen(doc = document) {
  if (doc.getElementById('pa-web-stil')) return;
  const s = doc.createElement('style'); s.id = 'pa-web-stil'; s.textContent = CSS; doc.head.appendChild(s);
}

const feld = (doc, id, beschriftung, art, auto, extra = {}) => {
  const w = doc.createDocumentFragment();
  const l = doc.createElement('label'); l.htmlFor = id; l.textContent = beschriftung;
  const i = doc.createElement('input'); i.id = id; i.name = id; i.type = art; i.autocomplete = auto; i.required = true;
  Object.assign(i, extra);
  w.append(l, i);
  return { w, i };
};

/** Setzt `inert` auf alle anderen Kinder von body (Hintergrund unbedienbar), gibt die Rücknahme zurück. */
export function sperreHintergrund(doc, ausser) {
  const liste = [...doc.body.children].filter(e => e !== ausser && !e.inert && e.tagName !== 'SCRIPT');
  for (const e of liste) e.inert = true;
  return () => { for (const e of liste) e.inert = false; };
}

function fenster(doc, titel) {
  stilEinfuegen(doc);
  const deck = doc.createElement('div'); deck.className = 'pa-web-deck';
  const karte = doc.createElement('div'); karte.className = 'pa-web-karte';
  karte.setAttribute('role', 'dialog'); karte.setAttribute('aria-modal', 'true'); karte.setAttribute('aria-labelledby', 'pa-web-titel');
  const h = doc.createElement('h2'); h.id = 'pa-web-titel'; h.textContent = titel;
  const fehler = doc.createElement('p'); fehler.className = 'pa-web-fehler'; fehler.setAttribute('role', 'alert');
  karte.append(h);
  deck.append(karte);
  doc.body.appendChild(deck);
  return { deck, karte, h, fehler };
}

/**
 * Zeigt Login (mit Wechsel zu „Registrieren"). Löst mit dem Nutzer auf, sobald angemeldet.
 * @returns {Promise<object>} `nutzer` aus der Antwort
 */
export function zeigeAnmeldung(doc = document, rufFn = ruf) {
  return new Promise(fertig => {
    const f = fenster(doc, 'Anmelden');
    const frei = sperreHintergrund(doc, f.deck);
    let registrieren = false;

    const baue = () => {
      f.karte.replaceChildren(f.h);
      const form = doc.createElement('form'); form.noValidate = true;
      let felder;
      if (!registrieren) {
        f.h.textContent = 'Anmelden';
        felder = { kennung: feld(doc, 'pa-kennung', 'Benutzername oder E-Mail', 'text', 'username', { autocapitalize: 'none', spellcheck: false }),
          passwort: feld(doc, 'pa-passwort', 'Passwort', 'password', 'current-password') };
      } else {
        f.h.textContent = 'Registrieren';
        felder = { email: feld(doc, 'pa-email', 'E-Mail', 'email', 'email', { autocapitalize: 'none' }),
          name: feld(doc, 'pa-name', 'Benutzername (frei wählbar)', 'text', 'username', { autocapitalize: 'none', spellcheck: false, maxLength: 20 }),
          passwort: feld(doc, 'pa-passwort', 'Passwort (mindestens 8 Zeichen)', 'password', 'new-password'),
          anmeldepasswort: feld(doc, 'pa-anmeldepasswort', 'Anmeldepasswort für die Registrierung', 'password', 'off') };
      }
      for (const x of Object.values(felder)) form.append(x.w);
      const haupt = doc.createElement('button'); haupt.type = 'submit'; haupt.className = 'pa-web-haupt'; haupt.textContent = registrieren ? 'Registrieren' : 'Anmelden';
      const wechsel = doc.createElement('button'); wechsel.type = 'button'; wechsel.className = 'pa-web-link';
      wechsel.textContent = registrieren ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Registrieren';
      wechsel.onclick = () => { registrieren = !registrieren; baue(); };
      f.fehler.textContent = '';
      form.append(haupt, f.fehler, wechsel);
      form.onsubmit = async ev => {
        ev.preventDefault();
        const w = Object.fromEntries(Object.entries(felder).map(([k, x]) => [k, x.i.value]));
        if (registrieren) { const m = pruefeRegistrierung(w); if (m) { f.fehler.textContent = m; return; } }
        else if (!w.kennung.trim() || !w.passwort) { f.fehler.textContent = 'Bitte Benutzername oder E-Mail und Passwort eingeben.'; return; }
        haupt.disabled = true; f.fehler.textContent = '';
        let r;
        try { r = await rufFn(registrieren ? 'registrieren' : 'login', 'POST', w); } catch { r = { ok: false, daten: { fehler: 'Keine Verbindung. Bitte erneut versuchen.' } }; }
        haupt.disabled = false;
        if (!r.ok) { f.fehler.textContent = fehlerText(r, 'Anmeldung fehlgeschlagen.'); return; }
        frei(); f.deck.remove(); fertig(r.daten.nutzer);
      };
      f.karte.append(form);
      Object.values(felder)[0].i.focus();
    };
    baue();
  });
}

/** Kleines Fenster „Passwort ändern" (altes Passwort nötig). */
export function zeigePasswortDialog(doc = document, rufFn = ruf) {
  return new Promise(fertig => {
    const f = fenster(doc, 'Passwort ändern');
    const frei = sperreHintergrund(doc, f.deck);
    const form = doc.createElement('form'); form.noValidate = true;
    const a = feld(doc, 'pa-altes', 'Altes Passwort', 'password', 'current-password');
    const n = feld(doc, 'pa-neues', 'Neues Passwort (mindestens 8 Zeichen)', 'password', 'new-password');
    const haupt = doc.createElement('button'); haupt.type = 'submit'; haupt.className = 'pa-web-haupt'; haupt.textContent = 'Passwort ändern';
    const zu = doc.createElement('button'); zu.type = 'button'; zu.className = 'pa-web-link'; zu.textContent = 'Abbrechen';
    const ende = ok => { frei(); f.deck.remove(); fertig(ok); };
    zu.onclick = () => ende(false);
    f.deck.addEventListener('keydown', e => { if (e.key === 'Escape') ende(false); });
    form.append(a.w, n.w, haupt, f.fehler, zu);
    form.onsubmit = async ev => {
      ev.preventDefault();
      if (!a.i.value || n.i.value.length < 8) { f.fehler.textContent = 'Bitte das alte Passwort und ein neues mit mindestens 8 Zeichen eingeben.'; return; }
      haupt.disabled = true;
      let r; try { r = await rufFn('passwort-aendern', 'POST', { altes: a.i.value, neues: n.i.value }); } catch { r = { ok: false, daten: { fehler: 'Keine Verbindung.' } }; }
      haupt.disabled = false;
      if (!r.ok) { f.fehler.textContent = fehlerText(r, 'Passwort konnte nicht geändert werden.'); return; }
      ende(true);
    };
    f.karte.append(form);
    a.i.focus();
  });
}
