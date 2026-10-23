/**
 * Hilfe-Reiter „Günther und Cookie": Tabellen mit Chance, Effekt, Dauer und Wartezeit.
 *
 * Alle Zahlen kommen aus `shared/config/guenther.js` und `shared/config/cookie.js` in der Fassung
 * NEUER Partien (`GUENTHER_FASSUNG_STANDARD`, `COOKIE_STANDARD`) — dieselben Werte, die der Motor
 * liest; es gibt keine zweite Abschrift. Die Tabellen entstehen in `baueTierTabellen` (reine
 * Daten, ohne DOM, testbar), `zeichneTiere` setzt sie in Elemente um.
 *
 * Die Prozentwerte der Aktionen gelten, wenn ALLE Bedingungen erfüllt sind (Kiste oder Spieler in
 * Reichweite); fehlt eine, entfällt die Aktion und die übrigen teilen sich die Chance.
 *
 * @module hilfeTiere
 */
import {
  GUENTHER_AKTION_REGELN, GUENTHER_AKTION_IDS, GUENTHER_WHEEL, GUENTHER_WHEEL_TOTAL, GUENTHER_CONTACT,
  GUENTHER_FASSUNG_STANDARD, GUENTHER_SPAWN, guentherWerte,
} from '../shared/config/guenther.js';
import {
  COOKIE_STANDARD, COOKIE_SPIELEN, COOKIE_IDENTITY, cookieHunger, cookiePflege, cookieWut,
} from '../shared/config/cookie.js';
import { el } from './dom.js';

const sek = ticks => `${(Math.round(ticks / 6) / 10).toLocaleString('de-DE')} s`;
const spanne = ([a, b]) => `${sek(a)} bis ${sek(b)}`;
const proz = (anteil, stellen = 0) => `${(anteil * 100).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} %`;

/** Beschreibung je Günther-Aktion; Zahlen aus der Config. */
function aktionsText(id, r) {
  switch (id) {
    case 'essen': return `Frisst eine Kiste in ${r.reichweite} px; der nächste Spieler (bis ${r.heilReichweite} px) bekommt +${r.heilung} Leben.`;
    case 'huepfen': return 'Reine Freude, keine Folgen.';
    case 'ziehen': return `Zieht einen Spieler in ${r.reichweite} px zu sich heran (Zug ${r.zugX} px/Tick).`;
    case 'wuehlen': return `Reißt ein Loch (Radius ${r.kraterRadius} px); mit ${proz(r.fundChance)} Chance liegt danach eine Kiste da.`;
    case 'kuscheln': return `Spieler in ${r.reichweite} px: +${r.heilung} Leben.`;
    case 'kraulen': return `Liegt auf dem Rücken, Spieler in ${r.reichweite} px: +${r.heilung} Leben.`;
    case 'sitz': return 'Hält still; Pinkeln und Häufchen ruhen.';
    case 'platz': return 'Hält still und döst ein; Pinkeln und Häufchen ruhen.';
    case 'chaos': return `Wildes Bellen: alle in ${r.radius} px werden alle ${sek(r.takt)} aufgescheucht.`;
    default: return '';
  }
}
const AKTION_NAME = {
  essen: 'Essen', huepfen: 'Hüpfen', ziehen: 'Ziehen (Seil)', wuehlen: 'Wühlen', kuscheln: 'Kuscheln',
  kraulen: 'Rücken kraulen', sitz: 'Sitz', platz: 'Platz', chaos: 'Wildes Bellen',
};

/**
 * @returns {{titel:string, kopf:string[], zeilen:string[][], fuss?:string}[]}
 */
export function baueTierTabellen(guentherFassung = GUENTHER_FASSUNG_STANDARD, cookieFassung = COOKIE_STANDARD) {
  const gw = guentherWerte(guentherFassung);
  const R = GUENTHER_AKTION_REGELN;
  const summe = GUENTHER_AKTION_IDS.reduce((s, id) => s + R[id].gewicht, 0);
  const tabellen = [];

  tabellen.push({
    titel: 'Günthers Aktionen',
    kopf: ['Aktion', 'Chance', 'Effekt', 'Dauer', 'Wartezeit danach'],
    zeilen: GUENTHER_AKTION_IDS.map(id => [
      AKTION_NAME[id] ?? id, proz(R[id].gewicht / summe), aktionsText(id, R[id]), sek(R[id].ticks), spanne(R.intervalTicks),
    ]),
    fuss: `Er wählt nach Gewicht aus den Aktionen, deren Bedingung erfüllt ist; nie dieselbe zweimal hintereinander. Er erscheint im Schnitt ${GUENTHER_SPAWN.meanPerMatch}-mal je Spiel für ${GUENTHER_SPAWN.roundsPerVisit} Runden (gewürfelt, also manchmal gar nicht).`,
  });

  const pee = gw.pee;
  const poop = gw.poop;
  tabellen.push({
    titel: 'Günther unterwegs',
    kopf: ['Verhalten', 'Auslöser', 'Effekt', 'Wartezeit'],
    zeilen: [
      ['Anpinkeln', `Spieler in ${pee.range} px`,
        `${pee.baseDamage} Schaden, jedes weitere Mal auf dieselbe Figur ×${pee.decay} (mindestens ${pee.minDamage})`, spanne(pee.intervalTicks)],
      ['Häufchen', 'läuft herum',
        `Wer hineintritt: ${poop.damagePerTurn} Schaden je Zug für ${poop.turns} Runden und Tempo ×${poop.slowFactor}; höchstens ${poop.maxPiles} liegen`, spanne(poop.intervalTicks)],
      ['Glücksrad', `im Laufen anrempeln (${GUENTHER_CONTACT.radius} px)`, 'siehe Tabelle Glücksrad', sek(GUENTHER_CONTACT.cooldownTicks)],
    ],
  });

  tabellen.push({
    titel: 'Glücksrad',
    kopf: ['Ausgang', 'Chance', 'Wirkung'],
    zeilen: GUENTHER_WHEEL.map(a => {
      const e = a.effect;
      let wirkung = a.label;
      if (e.kind === 'skip') wirkung = `Eine Runde aussetzen.`;
      else if (e.kind === 'skipAndWeapon') wirkung = 'Eine Runde aussetzen, dafür eine Waffe niedriger Seltenheit.';
      else if (e.kind === 'skipAndHeal') wirkung = `Eine Runde aussetzen, dafür +${e.heal[0]} bis ${e.heal[1]} Leben.`;
      else if (e.kind === 'damage') wirkung = `${e.range[0]} bis ${e.range[1]} Schaden${gw.radAngriffNichtToedlich ? ', nie tödlich (mindestens 1 Leben bleibt)' : ''}.`;
      else if (e.kind === 'legendaryWeapon') wirkung = 'Eine legendäre Waffe (Heimdall, Bifröst).';
      return [a.label.replace(/^Du /, ''), proz(a.weight / GUENTHER_WHEEL_TOTAL), wirkung];
    }),
  });

  const hu = cookieHunger(cookieFassung);
  const pf = cookiePflege(cookieFassung);
  const wu = cookieWut(cookieFassung);
  tabellen.push({
    titel: `${COOKIE_IDENTITY.name}: Hunger und Miauen`,
    kopf: ['Stufe', 'Hunger ab', 'Miau-Pegel', 'Ruf alle'],
    zeilen: [
      ['schläft', String(hu.stufen.schlaf), '–', '–'],
      ['leise', String(hu.stufen.leise), proz(hu.pegel.leise), sek(hu.rufTakt.leise)],
      ['laut', String(hu.stufen.laut), proz(hu.pegel.laut), sek(hu.rufTakt.laut)],
      ['Hungerwut', String(hu.stufen.wut), proz(hu.pegel.wut), sek(hu.rufTakt.wut)],
    ],
    fuss: `Hunger läuft von 0 bis ${hu.max}; ohne Futter vergehen vom Start bis zur Wut etwa ${Math.round((hu.stufen.wut - 15) / hu.proTick / 3600 * 10) / 10} Minuten.`,
  });

  const napf = pf.napfAbHunger ?? hu.stufen.leise;
  tabellen.push({
    titel: `${COOKIE_IDENTITY.name}: Pflege und Toben`,
    kopf: ['Was', 'Chance / Auslöser', 'Effekt', 'Dauer', 'Sperre'],
    zeilen: [
      ['Füttern', `im Laufen berühren (${pf.fuetternRadius} px), Hunger ab ${hu.stufen.leise}`,
        `−${pf.fuetternHunger} Hunger, +${pf.fuetternHeilung} Leben`, sek(pf.fressenTicks), sek(pf.fuetternSperre)],
      ['Futternapf', `Kiste in ${pf.napfRadius} px, Hunger ab ${napf}`,
        `−${pf.napfHunger} Hunger; die Kiste ist weg`, sek(pf.fressenTicks), pf.napfSperre ? sek(pf.napfSperre) : '–'],
      ['Kuscheln', `still daneben stehen (${pf.kuschelnRadius} px, ${sek(pf.kuschelnStillTicks)})`,
        `−${pf.kuschelnHunger} Hunger, +${pf.kuschelnHeilung} Leben${pf.kuschelnMax ? `, höchstens ${pf.kuschelnMax}-mal je Figur` : ''}`, sek(pf.kuschelnTicks), sek(pf.kuschelnSperre)],
      ['Toben', `Hunger ab ${hu.stufen.wut}`,
        `Löcher (Radius ${wu.kraterRadius} px), Kisten weg, ${wu.schlagSchaden} Schaden in ${wu.schlagRadius} px`, `bis ${sek(wu.maxTicks)}`, `${sek(wu.schlagSperre)} je Figur`],
      ['Spielen', `${proz(COOKIE_SPIELEN.chanceProRunde, 1)} je Runde`,
        `Kosmische Schockwelle: ${COOKIE_SPIELEN.schadenMin} bis ${COOKIE_SPIELEN.schadenMax} Schaden (nie tödlich), Krater`, sek(COOKIE_SPIELEN.ticks), '–'],
    ],
  });
  return tabellen;
}

/** Setzt die Tabellen in den Hilfe-Behälter. */
export function zeichneTiere(container) {
  container.append(el('p', 'Zwei neutrale Tiere laufen oder liegen auf der Karte. Sie gehören keinem Team, lassen sich nicht besiegen und entscheiden keine Partie allein: Ihre Wirkungen sind klein, zufällig verteilt und gemessen.', 'h-einleitung'));
  for (const t of baueTierTabellen()) {
    container.append(el('h3', t.titel));
    const tabelle = el('table', undefined, 'match-tabelle h-tabelle');
    const kopf = el('thead');
    const kr = el('tr');
    for (const k of t.kopf) kr.append(el('th', k));
    kopf.append(kr);
    const rumpf = el('tbody');
    for (const z of t.zeilen) {
      const r = el('tr');
      for (const zelle of z) r.append(el('td', zelle));
      rumpf.append(r);
    }
    tabelle.append(kopf, rumpf);
    container.append(tabelle);
    if (t.fuss) container.append(el('p', t.fuss, 'h-erklaerung'));
  }
}
