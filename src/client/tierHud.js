/**
 * HUD-Anzeige der Tiere: Cookies Hunger-Balken mit Miau-Pegel und Günthers Sprechblase.
 *
 * Eine kleine Leiste (`#tier-hud`) oben mittig, nur sichtbar, solange es etwas zu zeigen gibt:
 * Cookie ab Hunger „leise" (Balken, Stufe, drei Pegelstriche, die beim Miauen aufleuchten) und
 * Günther, solange seine Sprechblase steht. Sie liest den Zustand, den der Client ohnehin hat
 * (`state.cookie`, `state.guenther`), und die Bühne (`tierBuehne.js`) — keine zusätzliche Netzlast,
 * kein Eingriff in die Simulation. Der Screenreader hört das Protokoll; die Leiste ist `aria-hidden`.
 *
 * @module tierHud
 */
import { cookieStufe, COOKIE_HUNGER } from '../shared/config/cookie.js';

const STUFEN_TEXT = Object.freeze({ schlaf: 'schläft', leise: 'leise', laut: 'laut', wut: 'HUNGERWUT' });
const STUFEN_PEGEL = Object.freeze({ schlaf: 0, leise: 1, laut: 2, wut: 3 });

/**
 * Das Modell der Leiste, rein berechnet (testbar ohne DOM).
 * @param {object} state - Ansichtszustand
 * @param {{blasen:{wer:string,text:string,rest:number}[], miauPegel:number}} [buehne]
 * @returns {{cookie:null|{hunger:number, anteil:number, stufe:string, text:string, striche:number, miaut:boolean}, guenther:null|{text:string}}}
 */
export function tierHudModell(state, buehne = null) {
  const c = state?.cookie?.aktiv ? state.cookie : null;
  let cookie = null;
  if (c) {
    const hunger = Math.max(0, Math.min(COOKIE_HUNGER.max, Number(c.hunger) || 0));
    const stufe = cookieStufe(hunger);
    // Schlafend und satt: keine Leiste (kein Dauerrauschen im Bild).
    if (stufe !== 'schlaf' || c.tobt) {
      cookie = {
        hunger: Math.round(hunger),
        anteil: hunger / COOKIE_HUNGER.max,
        stufe,
        text: STUFEN_TEXT[stufe],
        striche: STUFEN_PEGEL[stufe],
        miaut: (buehne?.miauPegel ?? 0) > 0.15,
      };
    }
  }
  const blase = (buehne?.blasen ?? []).find(b => b.wer === 'guenther');
  const g = state?.guenther?.aktiv && blase ? { text: blase.text } : null;
  return { cookie, guenther: g };
}

export class TierHud {
  #el;
  #letzt = '';

  constructor(documentRef = document) {
    const d = documentRef;
    this.#el = {
      wurzel: d.getElementById('tier-hud'),
      cookie: d.getElementById('tier-cookie'),
      balken: d.querySelector?.('#tier-cookie .tier-hunger i') ?? null,
      striche: [...(d.querySelectorAll?.('#tier-cookie .tier-pegel b') ?? [])],
      stufe: d.querySelector?.('#tier-cookie .tier-stufe') ?? null,
      guenther: d.getElementById('tier-guenther'),
      blase: d.querySelector?.('#tier-guenther .tier-blase') ?? null,
    };
  }

  aktualisiere(state, buehne) {
    const e = this.#el;
    if (!e.wurzel) return;
    const m = tierHudModell(state, buehne);
    // Nur anfassen, wenn sich etwas geändert hat (das läuft mit der Bildrate).
    const schluessel = JSON.stringify(m);
    if (schluessel === this.#letzt) return;
    this.#letzt = schluessel;
    e.wurzel.hidden = !m.cookie && !m.guenther;
    if (e.cookie) {
      e.cookie.hidden = !m.cookie;
      if (m.cookie) {
        e.cookie.dataset.stufe = m.cookie.stufe;
        e.cookie.classList.toggle('miaut', m.cookie.miaut);
        if (e.balken) e.balken.style.width = `${Math.round(m.cookie.anteil * 100)}%`;
        if (e.stufe) e.stufe.textContent = `${m.cookie.text} · ${m.cookie.hunger}`;
        e.striche.forEach((s, i) => s.classList.toggle('an', i < m.cookie.striche));
      }
    }
    if (e.guenther) {
      e.guenther.hidden = !m.guenther;
      if (m.guenther && e.blase) e.blase.textContent = m.guenther.text;
    }
  }
}

export default TierHud;
