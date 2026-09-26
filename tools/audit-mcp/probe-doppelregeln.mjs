#!/usr/bin/env node
/**
 * Gegenprobe für das Doppelregel-Urteil und die Ereignis-Begründungen.
 *
 * Aufruf:  node tools/audit-mcp/probe-doppelregeln.mjs
 * Exit-Code 0 = alle Erwartungen erfüllt, 1 = mindestens eine verletzt.
 *
 * Warum diese Datei existiert (belegter Fehler, 2026-09-26): `bericht.mjs`
 * schrieb einen fest verdrahteten Freispruch in jeden Bericht („Keine stille
 * Doppelregel gefunden … steht in der Auswertung"), obwohl der Detektor in
 * derselben Zeile eine Doppelregel meldete und der genannte Fall ein echtes,
 * wertgleiches Duplikat war. Der Freispruch kam also nicht aus einer Messung.
 *
 * Diese Gegenprobe hält die Reparatur fest und prüft sie in Richtung des
 * LAUTEREN Fehlers: eine nicht gelistete Doppelregel muss als OFFEN gemeldet
 * werden, niemals als Absicht. Sie ist absichtlich unabhängig von der echten
 * Baumlage — die synthetischen Fälle gelten auch dann, wenn der Detektor im
 * Projekt gerade nichts findet.
 */
import {
  doppelregeln,
  beurteileDoppelregeln,
  leseBewusstStumm,
} from './lib/statisch.mjs';
import { doppelregelSaetze } from './lib/bericht.mjs';

let fehler = 0;
const pruefe = (titel, erwartet, gemessen, ok) => {
  console.log(`\n${ok ? 'OK  ' : 'FEHL'} ${titel}`);
  console.log(`     ERWARTET: ${erwartet}`);
  console.log(`     GEMESSEN: ${gemessen}`);
  if (!ok) fehler += 1;
};

/* ── 1. Der echte Baum: nicht gelistet = OFFEN ──────────────────────────────
 * Keine Datei im Projekt wird für diese Probe verändert; gemessen wird der
 * Ist-Zustand gegen die (leere) Ausnahmeliste. */
const echteMessung = doppelregeln();
const echtUrteil = beurteileDoppelregeln(echteMessung);
const echteSaetze = doppelregelSaetze(echtUrteil);
pruefe(
  '1) Echter Baum, keine Ausnahme gelistet → jede Doppelregel ist OFFEN',
  `offen = ${echteMessung.length}, begruendet = 0`,
  `offen = ${echtUrteil.offen.length}, begruendet = ${echtUrteil.begruendet.length}`,
  echtUrteil.offen.length === echteMessung.length && echtUrteil.begruendet.length === 0,
);
console.log(`     Sätze des Berichts: ${echteSaetze.length}`);
for (const s of echteSaetze) console.log(`       ${s}`);

/* ── 2. Gelistet MIT Begründung und passenden Orten → bewusst, begründet ──── */
const synthMessung = [{
  name: 'BEISPIEL_REGEL',
  orte: ['src/shared/config/a.js:10', 'src/shared/config/b.js:20'],
}];
const listeOk = new Map([['BEISPIEL_REGEL', {
  begruendung: 'zweite Stelle ist ein Re-Export für den Browser-Build (belegt im Kopf der Datei)',
  orte: ['src/shared/config/a.js:10', 'src/shared/config/b.js:20'],
}]]);
const urteilOk = beurteileDoppelregeln(synthMessung, listeOk);
const saetzeOk = doppelregelSaetze(urteilOk);
pruefe(
  '2) In der Liste mit Begründung + deckungsgleichen Orten → Freispruch MIT gelesener Begründung',
  'begruendet = 1, offen = 0, Satz enthält die Begründung aus der Liste',
  `begruendet = ${urteilOk.begruendet.length}, offen = ${urteilOk.offen.length}, Begründung im Satz = ${saetzeOk.some(s => s.includes('Re-Export für den Browser-Build'))}`,
  urteilOk.begruendet.length === 1 && urteilOk.offen.length === 0
    && saetzeOk.some(s => s.includes('Re-Export für den Browser-Build')),
);
for (const s of saetzeOk) console.log(`       ${s}`);

/* ── 3. Gelistet, aber eine NEUE Stelle kommt dazu → OFFEN ────────────────── */
const listeOrteAbweichend = new Map([['BEISPIEL_REGEL', {
  begruendung: 'zweite Stelle ist ein Re-Export für den Browser-Build',
  orte: ['src/shared/config/a.js:10', 'src/shared/config/b.js:20'],
}]]);
const messungDritte = [{
  name: 'BEISPIEL_REGEL',
  orte: ['src/shared/config/a.js:10', 'src/shared/config/b.js:20', 'src/engine/c.js:30'],
}];
const urteilDritte = beurteileDoppelregeln(messungDritte, listeOrteAbweichend);
pruefe(
  '3) Gleicher Name, aber eine weitere Fundstelle → gilt als OFFEN (Name allein reicht nicht)',
  'offen = 1 mit Hinweis auf abweichende Orte',
  `offen = ${urteilDritte.offen.length} · grund = ${urteilDritte.offen[0]?.grund}`,
  urteilDritte.offen.length === 1 && /Orte weichen/.test(urteilDritte.offen[0]?.grund ?? ''),
);

/* ── 4. Gelistet, aber OHNE Begründung → OFFEN ───────────────────────────── */
const listeOhneGrund = new Map([['BEISPIEL_REGEL', { orte: ['src/shared/config/a.js:10', 'src/shared/config/b.js:20'] }]]);
const urteilOhneGrund = beurteileDoppelregeln(synthMessung, listeOhneGrund);
pruefe(
  '4) Eintrag in der Liste ohne Begründung → gilt als OFFEN (kein Freispruch ohne Sack und Pack)',
  'offen = 1',
  `offen = ${urteilOhneGrund.offen.length} · grund = ${urteilOhneGrund.offen[0]?.grund}`,
  urteilOhneGrund.offen.length === 1 && /OHNE Begründung/.test(urteilOhneGrund.offen[0]?.grund ?? ''),
);

/* ── 5. Leere Messung → KEIN Satz ────────────────────────────────────────── */
const leeresUrteil = beurteileDoppelregeln([]);
const leereSaetze = doppelregelSaetze(leeresUrteil);
pruefe(
  '5) Keine Doppelregel gemessen → kein Satz über Doppelregeln',
  'Sätze = [] (Länge 0), keine Zeile über „keine gefunden"',
  `Sätze = ${JSON.stringify(leereSaetze)}`,
  leereSaetze.length === 0,
);

/* ── 6. Wächter: Begründung wird GELESEN (mit/ohne Kommentar) ─────────────── */
const waechterProbe = [
  "const bewusstStumm = new Set([",
  "  'hat_grund',        // sichtbar über die Lebensleiste",
  "  'ohne_grund',",
  "]);",
].join('\n');
const gelesen = leseBewusstStumm(waechterProbe).begruendungen;
pruefe(
  '6) Ereignis-Wächter: Name MIT Begründung wird gelesen, Name OHNE Begründung bleibt leer',
  "hat_grund = 'sichtbar über die Lebensleiste' · ohne_grund = null",
  `hat_grund = ${JSON.stringify(gelesen.get('hat_grund'))} · ohne_grund = ${JSON.stringify(gelesen.get('ohne_grund'))}`,
  gelesen.get('hat_grund') === 'sichtbar über die Lebensleiste' && gelesen.get('ohne_grund') === null,
);
const fehlenderWaechter = leseBewusstStumm('// Datei ohne bewusstStumm-Menge');
pruefe(
  '6b) Wächter nicht lesbar → keine Begründungen (fail-safe: alles gilt als undokumentiert)',
  'vorhanden = false, Einträge = 0',
  `vorhanden = ${fehlenderWaechter.vorhanden}, Einträge = ${fehlenderWaechter.begruendungen.size}`,
  fehlenderWaechter.vorhanden === false && fehlenderWaechter.begruendungen.size === 0,
);

/* ── 7. Ausnahme ohne Messung → Befund ───────────────────────────────────── */
const urteilVerwaist = beurteileDoppelregeln([], listeOk);
const saetzeVerwaist = doppelregelSaetze(urteilVerwaist);
pruefe(
  '7) Ausnahme in der Liste, aber keine Doppelregel dazu gemessen → als Befund genannt, nicht als Ruhepolster',
  'verwaisteAusnahmen = 1, Satz „Ausnahme(n) ohne Messung"',
  `verwaisteAusnahmen = ${urteilVerwaist.verwaisteAusnahmen.length} · Sätze = ${saetzeVerwaist.length}`,
  urteilVerwaist.verwaisteAusnahmen.length === 1
    && saetzeVerwaist.some(s => s.includes('ohne Messung')),
);

console.log(`\n${fehler === 0 ? 'Alle Erwartungen erfüllt.' : `${fehler} Erwartung(en) verletzt.`}`);
process.exit(fehler === 0 ? 0 : 1);
