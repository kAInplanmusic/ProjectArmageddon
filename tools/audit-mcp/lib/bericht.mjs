/**
 * Berichtsschreiber.
 *
 * Die Regel, aus der dieses Modul entstanden ist: **Der bestellte Bericht
 * bleibt sonst ungeschrieben.** Viermal belegt. Deshalb ist das Schreiben kein
 * Nachgang, sondern ein Werkzeugaufruf (`audit_bericht`), der die Datei in
 * einem Zug erzeugt — mit Auswertung und TODO.
 *
 * Der Bericht trifft KEINE Design-Entscheidungen. Was eine Balance- oder
 * Produktfrage ist, steht als „Offen — Design-Entscheidung" da, mit den Zahlen
 * daneben, damit der Auftraggeber entscheiden kann.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './repo.mjs';
import {
  beurteileDoppelregeln,
  letzterCommit,
  dateiVorhanden,
  DOPPELREGEL_AUSNAHMEN_QUELLE,
} from './statisch.mjs';

const zahl = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)} %` : '–');

/**
 * Die Sätze über Doppelregeln — aus dem MESSERGEBNIS formuliert, nie behauptet.
 *
 * Warum diese Funktion existiert (belegter Fehler, 2026-09-26): An dieser Stelle
 * stand ein fest verdrahteter Satz, der in JEDEN Bericht geschrieben wurde, sobald
 * der Detektor mindestens eine Doppelregel fand:
 *
 *   „**Keine stille Doppelregel gefunden:** Es gibt N gleichnamige Definitionen —
 *    welche davon Absicht sind (z. B. `PRIMARY_BIOME_BY_PRESET`, das laut
 *    Projektregel in ZWEI Dateien stehen MUSS), steht in der Auswertung."
 *
 * Drei Fehler in einem Satz: (1) Er widersprach seiner eigenen Messung („keine
 * gefunden" bei N > 0). (2) Er berief sich auf eine Projektregel, die es nicht
 * gibt — die Projektregel lautet „eine Regel, eine Stelle". (3) Der genannte Fall
 * war ein echtes, wertgleiches Duplikat ohne Importbeziehung: ein Duplikat wurde
 * als Beleg für Sauberkeit genannt.
 *
 * Deshalb hier die Regel: Ein Freispruch wird aus `DOPPELREGEL_AUSNAHMEN`
 * GELESEN (Name + Begründung + dokumentierte Orte). Steht ein Name nicht in der
 * Liste, ist er ein OFFENER Befund — fail-safe in Richtung des lauteren Fehlers.
 * Gibt es keine Doppelregel, gibt es keinen Satz.
 *
 * @param {ReturnType<typeof beurteileDoppelregeln>} urteil
 * @returns {string[]} Markdown-Zeilen (leer, wenn es nichts zu sagen gibt)
 */
export function doppelregelSaetze(urteil) {
  const saetze = [];
  if (!urteil) return saetze;

  const gemessen = urteil.liste?.length ?? 0;
  const offen = urteil.offen ?? [];
  const begruendet = urteil.begruendet ?? [];
  const verwaist = urteil.verwaisteAusnahmen ?? [];

  // Keine Doppelregel gemessen → KEIN Satz über Doppelregeln. Kein Satz über
  // „keine gefunden" (genau der war der Fehler), und keine Zeile, die eine
  // ungemessene Sauberkeit behauptet. Einzige Ausnahme von dieser Stille: eine
  // Ausnahme in der Liste, die ins Leere greift, ist selbst ein Befund
  // (Freispruch auf Vorrat) und wird als solcher gemeldet.
  if (gemessen === 0 && verwaist.length === 0) return saetze;

  if (offen.length) {
    const namen = offen.map(o => `\`${o.name}\` (${o.orte.join(' · ')})`).join(', ');
    saetze.push(`- **OFFENE Doppelregeln (${offen.length}):** ${namen}. `
      + (offen.length === 1 ? 'Diese Definition' : 'Diese Definitionen')
      + ` steht in mehr als einer Datei und ist NICHT in der Ausnahmeliste \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\` `
      + 'begründet — nach der Projektregel „eine Regel, eine Stelle" ein offener Befund, kein Freispruch. '
      + 'Ein Freispruch wird ab hier GELESEN, nicht behauptet: Wer ihn will, trägt den Namen mit Begründung und Orten in die Liste ein.');
  }

  for (const b of begruendet) {
    saetze.push(`- **Bewusst und begründet (${begruendet.length}):** \`${b.name}\` (${b.orte.join(' · ')}) — `
      + `Ausnahme laut \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\`: ${b.begruendung}`);
  }

  if (verwaist.length) {
    saetze.push(`- **Ausnahme(n) ohne Messung (${verwaist.length}):** ${verwaist.map(v => `\`${v.name}\``).join(', ')} — `
      + `in \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\` gelistet, aber der Detektor findet dazu keine Doppelregel mehr. `
      + 'Ein Freispruch auf Vorrat: Eintrag entfernen, sonst greift er später ohne Prüfung.');
  }

  // Keine Doppelregel → kein Satz (die Liste war oben schon leer).
  if (!offen.length && !begruendet.length && !verwaist.length) return [];
  return saetze;
}

/** Baut den TODO-Block aus den Befunden. */
export function todoAus(d) {
  const todo = [];

  const add = (titel, grund, schwere, art = 'arbeit') => todo.push({ titel, grund, schwere, art });

  for (const g of d.gates.fehlgeschlagen) add(`Gate „${g}" ist rot`, 'Ein rotes Gate blockiert jede weitere Aussage über den Stand.', 'hoch');
  for (const f of d.pfade.falsch) {
    add(`Prozent-kodierte Wurzel: ${f.datei}:${f.zeile}`,
      `\`${f.code}\` — \`.pathname\` liefert bei Sonderzeichen im Pfad \`%20\`; jeder spawn mit diesem cwd scheitert mit ENOENT. Ersetzen durch \`fileURLToPath(new URL(...))\`.`,
      'kritisch');
  }
  if (!d.determinismus.deterministisch) add('Determinismus ist verletzt', d.determinismus.urteil, 'kritisch');
  if (d.determinismus.deterministisch && !d.determinismus.seedWirkt) add('Der Seed wirkt nicht', 'Verschiedene Seeds ergeben denselben Hash.', 'hoch');

  for (const s of d.ereignisse.stummUndokumentiert) {
    add(`Ereignis „${s.ereignis}" ist stumm und NICHT dokumentiert`, `Emittiert in ${s.orte.slice(0, 2).join(', ')} — Begründung im Wächter nachtragen oder einen Client-Zweig bauen`, 'mittel', 'entscheidung');
  }
  for (const s of d.ereignisse.stummListeOhneBegruendung ?? []) {
    add(`Ereignis „${s.ereignis}" ist im Wächter gelistet, aber OHNE Begründung`, `Emittiert in ${s.orte.slice(0, 2).join(', ')} — die Liste \`bewusstStumm\` in \`tests/event-coverage.test.js\` wertet ihn sonst ohne Nachweis frei; Begründung an den Eintrag schreiben`, 'mittel', 'entscheidung');
  }
  for (const f of d.statisch.toteDateien) {
    add(`Datei ohne Importeur: ${f.datei}`,
      `${f.zeilen} Zeilen (davon ${f.codeZeilen ?? '?'} mit Code), kein Leser — ${f.grund ?? 'Grund nicht erfasst'}`,
      'mittel');
  }
  for (const x of d.statisch.toteDaten ?? []) {
    add(`Datendatei ohne Leser: ${x.datei}`,
      `${x.bytes} Byte, kein Leser im Code — entweder anbinden oder entfernen (vorher in \`ARCHIVED.md\` prüfen, ob der Inhalt absichtlich aufgehoben ist)`,
      'niedrig');
  }
  for (const k of d.statisch.unbenutzteKonstanten) add(`Konstante ohne Leser: ${k.name}`, `${k.datei}:${k.zeile}`, 'mittel');
  // Doppelregeln: NUR die offenen werden zur Arbeit. Eine begründete Ausnahme
  // (gelesen aus DOPPELREGEL_AUSNAHMEN) ist entschieden und darf nicht als
  // offener Punkt erscheinen; eine Ausnahme ohne Messung ist dagegen ein Befund.
  const drUrteil = d.statisch.doppelregelnUrteil ?? beurteileDoppelregeln(d.statisch.doppelregeln ?? []);
  for (const dr of drUrteil.offen) {
    add(`Offene Doppelregel: ${dr.name}`, `${dr.orte.join(' · ')} — ${dr.grund}`, 'mittel');
  }
  for (const v of drUrteil.verwaisteAusnahmen) {
    add(`Ausnahme ohne Messung: ${v.name}`,
      `In \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\` gelistet, aber keine Doppelregel dazu gemessen — Eintrag entfernen (Freispruch auf Vorrat).`,
      'niedrig');
  }
  for (const m of d.statisch.marker) add(`Marker ${m.marker} in ${m.datei}:${m.zeile}`, m.text, 'niedrig');
  for (const z of d.zufall.imSimulationspfad) add(`Zufall/Zeit im Simulationspfad: ${z.datei}:${z.zeile}`, z.text, 'hoch');
  for (const u of d.statisch.unbenutzteExporte.slice(0, 20)) add(`Export ohne Leser: ${u.name}`, u.datei, 'niedrig');
  for (const s of d.secrets) add(`Secret in getrackter Datei: ${s.datei}:${s.zeile}`, `${s.art} — sofort rotieren`, 'kritisch');

  if (d.perf.ticksUeberBudget > 0) add(`${d.perf.ticksUeberBudget} Ticks über dem 16,7-ms-Budget`, d.perf.urteil, 'mittel');

  // Design-Fragen werden NICHT entschieden.
  for (const w of d.waffen.wirkungsloseFelder.konstantNumerisch) {
    add(`Feld „${w.feld}" trägt bei allen ${d.waffen.anzahl} Waffen denselben Wert (${w.wert})`, 'Es verspricht eine Unterscheidung, die es nicht gibt. Verdrahten oder entfernen — Balance-Entscheidung.', 'niedrig', 'design');
  }
  for (const w of d.waffen.wirkungsloseFelder.konstantBool) {
    add(`Feld „${w.feld}" ist bei allen ${d.waffen.anzahl} Waffen konstant (${w.wert})`, 'Verdrahten oder entfernen — Balance-Entscheidung.', 'niedrig', 'design');
  }
  add('Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen', `${d.spielverlauf.vorMahlstromBeendet} von ${d.spielverlauf.parteien.length} Partien endeten VOR Runde ${d.spielverlauf.mahlstromAb}`, 'niedrig', 'design');

  return todo.sort((a, b) => {
    const rang = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3 };
    return rang[a.schwere] - rang[b.schwere];
  });
}

/** Der Markdown-Bericht. */
export function berichtMarkdown(d, todo) {
  const z = [];
  const push = (...zeilen) => z.push(...zeilen);

  push('# Tiefen-Audit — ProjectArmageddon (Spiel und Engine)');
  push('');
  push(`**Erzeugt:** ${new Date().toISOString()} · **Commit:** \`${d.stand.git.head}\` (${d.stand.git.branch}) · **Node:** ${d.stand.node}`);
  push(`**Werkzeug:** \`tools/audit-mcp\` (Audit-MCP) — statische Analyse, laufende Engine, Gate-Batterie.`);
  push('');
  push('> Jede Aussage in diesem Bericht ist eine Messung oder eine Fundstelle. Zahlen, die eine Annahme sind,');
  push('> stehen als Annahme da. **Design-Entscheidungen sind NICHT getroffen** — sie stehen als „Offen" mit den Zahlen daneben.');
  push('');

  // ── Ampel ───────────────────────────────────────────────────────────────
  push('## Ampel');
  push('');
  push('| Feld | Zustand | Begründung |');
  push('|---|---|---|');
  for (const [name, v] of Object.entries(d.ampel.felder)) {
    const symbol = v.zustand === 'rot' ? '🔴' : v.zustand === 'gelb' ? '🟠' : '🟢';
    push(`| ${name} | ${symbol} ${v.zustand} | ${v.begruendung} |`);
  }
  push('');

  // ── Während des Audits behoben ──────────────────────────────────────────
  // Dieser Abschnitt beschreibt eine VERGANGENE Reparatur. Er stand bis
  // 2026-09-26 mit fest verdrahteten Zahlen da („38 Stellen … genau 1 nicht",
  // „jetzt 4 von 4 in 26,8 s") und widersprach damit der Messung in Abschnitt 12
  // desselben Berichts, die live 41 Stellen / 0 falsch meldete. Dieselbe
  // Fehlerklasse wie beim Doppelregel-Freispruch: ein fest verdrahtetes Fazit
  // unter live erhobenen Zahlen. Ab hier gilt: Was dieser Lauf messen kann, wird
  // gemessen; was historisch ist, steht als historisch da — mit seinem Commit.
  push('## 0. Während dieses Audits behoben');
  push('');
  push('Ein Befund dieses Audits war kein Berichtspunkt, sondern ein Defekt, der die Prüfung selbst lahmlegte.');
  push('Er ist **repariert** — und, soweit dieser Lauf es messen kann, nachgemessen:');
  push('');
  const smokeFix = letzterCommit('scripts/smoke-fast.mjs');
  const smokeGate = (d.gates.ergebnisse ?? []).find(e => e.gate === 'smoke:fast') ?? null;
  const smokeKz = smokeGate?.kennzahlen ?? {};
  const smokeZustand = smokeGate
    ? (smokeGate.ok
      ? `Gerade nachgemessen: **${smokeKz.schritteOk ?? '?'} von ${smokeKz.schritteGesamt ?? '?'} Schritten OK in ${smokeGate.dauerSekunden} s**`
      : `Das Gate ist in diesem Lauf **rot** (exit ${smokeGate.exitCode}) — die Aussage „behoben" ist damit widerlegt`)
    : `Das Gate \`smoke:fast\` war in DIESEM Lauf nicht dabei (gefahren: ${(d.gates.gefahren ?? []).join(', ') || 'keines'}) — die historische Zahl ist hier NICHT nachgemessen`;
  push('| Was | Beleg | Zustand |');
  push('|---|---|---|');
  push(`| \`scripts/smoke-fast.mjs\` war vollständig funktionsunfähig | \`spawn npm ENOENT\`, **0 von 4 Schritten** gemeldet, Stacktrace statt FEHLER-Zeile | **behoben** — ${smokeZustand}${smokeFix ? ` (letzter Commit an der Datei: \`${smokeFix.hash}\`, ${smokeFix.datum})` : ' (der behebende Commit ließ sich in diesem Lauf NICHT lesen — die Reparatur ist damit unbelegt)'} |`);
  push('');
  push('**Ursache (eine Zeile, zwei Umstände):** `const ROOT = new URL(\'..\', import.meta.url).pathname;`');
  push('`.pathname` liefert den Pfad prozent-kodiert. Das Projektverzeichnis enthält Leerzeichen, also wurde daraus');
  push('`/home/patrick/AnunnakiTools%20Projekte/laufende%20Projekte/ProjectArmageddon/` — und `fs.existsSync` darauf ist `false`.');
  push('Jeder `spawn` mit diesem `cwd` scheitert dann mit ENOENT.');
  push('');
  const pfadFalsch = d.pfade.falsch ?? [];
  push(`**Reichweite, in DIESEM Lauf gemessen:** ${d.pfade.anzahlRichtig} Stellen im Projekt benutzen das korrekte \`fileURLToPath\`, `
    + (pfadFalsch.length === 0
      ? '**keine** mehr.'
      : `**${pfadFalsch.length}** noch nicht (${pfadFalsch.map(f => `\`${f.datei}:${f.zeile}\``).join(', ')}).`));
  push(`Damals — **historische Zahl, in diesem Lauf nicht messbar**${smokeFix ? `, Beleg: Commit \`${smokeFix.hash}\` (${smokeFix.datum})` : ', Beleg: NICHT lesbar'} — `
    + 'war es genau **1** Stelle: `scripts/smoke-fast.mjs:31`. Es war die Datei, die den schnellen Rückkopplungszyklus trägt: die,');
  push('die nach jeder Änderung laufen soll. Sie ist damit seit dem Umzug des Repos in dieses Verzeichnis stumm gewesen.');
  push('');
  push('**Zweiter Defekt in derselben Datei:** `laufe()` hängte keinen `error`-Handler an den `spawn`. Ein Startfehler');
  push('wurde deshalb als unbehandeltes Ereignis GEWORFEN und riss den Lauf mit einem Stacktrace ab, statt als sauberer');
  push('FEHLER-Schritt zu erscheinen. Beides ist behoben; die Ursache steht als Kommentar an der Stelle, und');
  push('`audit_paths` prüft die Fehlerklasse künftig automatisch.');
  push('');

  push('## 1. Umfang');
  push('');
  push('| Bereich | Dateien | Zeilen |');
  push('|---|---|---|');
  for (const [k, v] of Object.entries(d.stand.umfang)) push(`| ${k} | ${v.dateien} | ${v.zeilen} |`);
  push('');
  push(`Ungetrackte Änderungen beim Lauf: **${d.stand.git.dirty.length}**`);
  push('');

  // ── Gates ───────────────────────────────────────────────────────────────
  push('## 2. Gate-Batterie');
  push('');
  push('| Gate | Ergebnis | Dauer | Kennzahlen |');
  push('|---|---|---|---|');
  for (const e of d.gates.ergebnisse) {
    const kz = Object.entries(e.kennzahlen).map(([k, v]) => `${k}=${v}`).join(', ') || '–';
    push(`| ${e.gate} | ${e.ok ? '🟢 bestanden' : '🔴 exit ' + e.exitCode} | ${e.dauerSekunden} s | ${kz} |`);
  }
  push('');
  push(`**${d.gates.bestanden}/${d.gates.gesamt} bestanden** · Gesamtdauer ${d.gates.gesamtDauerSekunden} s`);
  push('');

  // ── Determinismus ───────────────────────────────────────────────────────
  push('## 3. Determinismus');
  push('');
  push('| Lauf | Seed | Zustandshash | Status | Runde |');
  push('|---|---|---|---|---|');
  for (const l of d.determinismus.laeufe) push(`| ${l.lauf} | ${l.seed} | \`${l.hash}\` | ${l.status} | ${l.runde} |`);
  push('');
  push(`Derselbe Seed → derselbe Hash: **${d.determinismus.deterministisch ? 'JA' : 'NEIN'}** · Verschiedene Seeds → verschiedene Hashes: **${d.determinismus.seedWirkt ? 'JA' : 'NEIN'}**`);
  push('');
  push(d.determinismus.urteil);
  push('');

  // ── Spielverlauf ────────────────────────────────────────────────────────
  push('## 4. Spielverlauf (Spielgefühl als Zahl)');
  push('');
  push('| Seed | Runden | Züge | Schüsse | Ticks | Spielzeit (s) | Status |');
  push('|---|---|---|---|---|---|---|');
  for (const p of d.spielverlauf.parteien) {
    push(`| ${p.seed} | ${p.runden} | ${p.zuge} | ${p.schuesse} | ${p.ticks} | ${p.spielzeitSekunden} | ${p.status} |`);
  }
  push('');
  push(`**Mittel:** ${d.spielverlauf.mittel.runden} Runden · ${d.spielverlauf.mittel.zuge} Züge · ${d.spielverlauf.mittel.schuesse} Schüsse · ${d.spielverlauf.mittel.spielzeitSekunden} s Simulationszeit`);
  push(`**Spanne:** Runden ${d.spielverlauf.spanne.runden[0]}–${d.spielverlauf.spanne.runden[1]} · Spielzeit ${d.spielverlauf.spanne.spielzeitSekunden[0]}–${d.spielverlauf.spanne.spielzeitSekunden[1]} s`);
  push('');
  push(`Mahlstrom greift ab Runde **${d.spielverlauf.mahlstromAb}**. Davor beendet: **${d.spielverlauf.vorMahlstromBeendet} von ${d.spielverlauf.parteien.length}**.`);
  push('');
  push('*Annahme:* Die Spielzeit ist Simulationszeit. Ein Mensch braucht zusätzlich Bedenkzeit — sie ist hier');
  push('konservativ mit **0 s** angesetzt, die echte Partie ist also länger.');
  push('');

  // ── Ballistik ───────────────────────────────────────────────────────────
  push('## 5. Ballistik (gemessen, nicht gerechnet)');
  push('');
  push(`Karte (Default): ${d.ballistik.karte.width}×${d.ballistik.karte.height} px · Abstand zum nächsten Gegner ≈ ${d.ballistik.abstandZumGegnerPx} px · Geschoss-Lebensdauer ${d.ballistik.lebensdauerTicks} Ticks`);
  push('');
  push('| Winkel | Kraft | Bahnpunkte | Horizontale Weite | Endhöhe |');
  push('|---|---|---|---|---|');
  for (const e of d.ballistik.ergebnis) {
    push(`| ${e.winkelGrad}° | ${e.kraft} | ${e.bahnpunkte} | ${e.horizontaleWeitePx} px | ${e.hoeheEndePx} px |`);
  }
  push('');

  // ── Waffen ──────────────────────────────────────────────────────────────
  push('## 6. Waffenkatalog');
  push('');
  push(`**${d.waffen.anzahl} Waffen** · Kategorien: ${Object.entries(d.waffen.kategorien).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  push('');
  push('| Kennzahl | min | Median | max | verschiedene Werte |');
  push('|---|---|---|---|---|');
  for (const [feld, v] of Object.entries(d.waffen.verteilung)) {
    if (!v) continue;
    push(`| ${feld} | ${v.min} | ${v.median} | ${v.max} | ${v.verschiedene} / ${v.n} |`);
  }
  push('');
  push('**Auffälligkeiten:** ' + Object.entries(d.waffen.auffaellig).map(([k, v]) => `${k}=${v}`).join(' · '));
  push('');
  const konstant = d.waffen.wirkungsloseFelder.konstantNumerisch.concat(d.waffen.wirkungsloseFelder.konstantBool);
  push(`**Felder mit überall gleichem Wert (${konstant.length}):** ${konstant.length ? konstant.map(k => `\`${k.feld}\`=${k.wert}`).join(', ') : 'keine'}`);
  push('');

  // ── Klassen ─────────────────────────────────────────────────────────────
  push('## 7. Klassen × Archetypen');
  push('');
  push(`**${d.klassen.kombinationen} Kombinationen** aus ${d.klassen.klassen.length} Klassen und ${d.klassen.archetypen.length} Archetypen.`);
  push('');
  push('| Achse | min | max | Verhältnis |');
  push('|---|---|---|---|');
  for (const [achse, v] of Object.entries(d.klassen.achsenSpannen)) {
    push(`| ${achse} | ${v.min} | ${v.max} | ${v.verhaeltnis}× |`);
  }
  push('');
  push('Inert deklarierte Felder (vom Motor NICHT gelesen): `' + (d.klassen.matrix[0]?.inert.join('`, `') ?? '') + '`');
  push('');

  // ── Terrain ─────────────────────────────────────────────────────────────
  push('## 8. Terrain-Generator');
  push('');
  push(`Karte ${d.terrain.karte.breite}×${d.terrain.karte.hoehe} px · ${d.terrain.anzahlJeForm} Karten je Form · Kriterium: Landanteil in %`);
  push('');
  push('| Form | min | max | Mittel | Streuung |');
  push('|---|---|---|---|---|');
  for (const [form, v] of Object.entries(d.terrain.ergebnis)) {
    push(`| ${form} | ${v.min} | ${v.max} | ${v.mittel} | ${v.streuung} |`);
  }
  push('');
  push('*Lesart:* Eine breite Streuung heißt, der Generator nutzt seinen Spielraum. Eine Streuung nahe 0 hieße,');
  push('die Form liefert immer dasselbe.');
  push('');

  // ── Perf ────────────────────────────────────────────────────────────────
  push('## 9. Leistung');
  push('');
  push(`Züge ${d.perf.zugeGespielt} · Schüsse ${d.perf.schuesse} · gemessene Ticks ${d.perf.ticksGemessen}`);
  push('');
  push(`Tick-Kosten: mittel **${zahl(d.perf.tickMittelMs, 4)} ms** · p95 ${zahl(d.perf.p95Ms, 4)} ms · p99 ${zahl(d.perf.p99Ms, 4)} ms · max ${zahl(d.perf.maxMs, 4)} ms`);
  push(`Budget 16,6667 ms → **${d.perf.ticksUeberBudget} Ticks über Budget** (${pct(d.perf.ticksUeberBudget, d.perf.ticksGemessen)})`);
  push('');
  push(d.perf.urteil);
  push('');

  // ── Statische Befunde ───────────────────────────────────────────────────
  push('## 10. Statische Befunde');
  push('');
  push('### 10.1 Dateien ohne Importeur');
  push('');
  if (d.statisch.toteDateien.length === 0) {
    push(`Keine. Wächter \`tests/no-dead-code.test.js\`: ${dateiVorhanden('tests/no-dead-code.test.js')
      ? 'vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`)'
      : '**NICHT gefunden** — die Aussage „der Wächter hält die Zahl bei 0" wäre unbelegt'}.`);
  } else {
    push('| Datei | Zeilen | davon Code | Grund (warum kein Freispruch) |');
    push('|---|---|---|---|');
    for (const f of d.statisch.toteDateien) {
      push(`| ${f.datei} | ${f.zeilen} | ${f.codeZeilen ?? '–'} | ${f.grund ?? '—'} |`);
    }
  }
  push('');
  push('#### Die Freisprüche dieser Prüfung — mit Beleg');
  push('');
  push('Ein Einstiegspunkt ist hier kein NAME, sondern ein BELEG: die Datei muss Code');
  push(`haben UND in einem Manifest außerhalb \`src/\` namentlich genannt sein (\`package.json\`, \`index.html\`, \`vite.config.mjs\`, \`playwright.config.mjs\`).`);
  push('Wer nur so heißt, wird geprüft — bis 2026-09-27 galt das Gegenteil, und `src/shared/data/index.js` war damit still freigesprochen.');
  push('');
  if (!d.statisch.einstiegspunkte?.length) {
    push('Kein Einstiegspunkt mit Beleg gefunden — **jede** Datei wurde auf Importeure geprüft (fail-safe).');
  } else {
    push('| Einstiegspunkt | Beleg |');
    push('|---|---|');
    for (const e of d.statisch.einstiegspunkte) push(`| ${e.datei} | ${e.beleg} |`);
  }
  push('');
  push('### 10.1b Datendateien ohne Leser');
  push('');
  const toteDaten = d.statisch.toteDaten ?? null;
  if (toteDaten === null) {
    push('**NICHT GEMESSEN** in diesem Lauf — gilt nicht als sauber.');
  } else if (toteDaten.length === 0) {
    push(`Keine: alle ${d.statisch.datenGeprueft ?? '?'} \`.json\` unter \`src/\` werden von irgendwo im CODE gelesen.`);
  } else {
    const bytes = toteDaten.reduce((s, x) => s + x.bytes, 0);
    push(`**${toteDaten.length} von ${d.statisch.datenGeprueft ?? '?'}** Datendateien unter \`src/\` haben keinen Leser im Code — zusammen **${bytes} Byte**.`);
    push('Gelesen wird nur CODE ohne Kommentare: ein Dateiname in einem Bericht (`.md`) ist kein Leser.');
    push('');
    push('| Datei | Byte | Leser |');
    push('|---|---|---|');
    for (const x of toteDaten) push(`| ${x.datei} | ${x.bytes} | ${x.leser} |`);
  }
  push('');
  push('### 10.2 Konstanten ohne Leser');
  push('');
  if (d.statisch.unbenutzteKonstanten.length === 0) push('Keine — jede definierte Konstante unter `src/` wird irgendwo gelesen.');
  else {
    push('| Konstante | Ort |');
    push('|---|---|');
    for (const k of d.statisch.unbenutzteKonstanten) push(`| \`${k.name}\` | ${k.datei}:${k.zeile} |`);
  }
  push('');
  push('### 10.3 Doppelregeln (derselbe Name in 2+ Dateien)');
  push('');
  const drUrteil = d.statisch.doppelregelnUrteil ?? beurteileDoppelregeln(d.statisch.doppelregeln ?? []);
  if (drUrteil.liste.length === 0) push('Keine gemessen.');
  else {
    push(`Gemessen: **${drUrteil.liste.length}** · davon aus der Ausnahmeliste begründet: **${drUrteil.begruendet.length}** · `
      + `OFFEN: **${drUrteil.offen.length}**. Das Urteil wird aus \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\` gelesen; `
      + 'ohne Eintrag dort gilt eine Doppelregel als offen (fail-safe in Richtung des lauteren Fehlers).');
    push('');
    push('| Name | Orte | Urteil |');
    push('|---|---|---|');
    for (const dr of drUrteil.liste) {
      const bescheid = dr.ausnahme
        ? `bewusst, begründet: ${dr.begruendung}`
        : `**OFFEN** — ${dr.grund}`;
      push(`| \`${dr.name}\` | ${dr.orte.join(' · ')} | ${bescheid} |`);
    }
    if (drUrteil.verwaisteAusnahmen.length) {
      push('');
      push(`**${drUrteil.verwaisteAusnahmen.length} Ausnahme(n) in der Liste greifen nicht** `
        + `(${drUrteil.verwaisteAusnahmen.map(v => `\`${v.name}\``).join(', ')}): der Detektor findet dazu keine Doppelregel mehr — `
        + 'der Eintrag wäre ein Freispruch auf Vorrat und gehört entfernt.');
    }
  }
  // Auch ohne gemessene Doppelregel ist eine Ausnahme, die ins Leere greift,
  // ein Befund: sie wertet später ohne Prüfung frei.
  if (drUrteil.liste.length === 0 && drUrteil.verwaisteAusnahmen.length) {
    push('');
    push(`**${drUrteil.verwaisteAusnahmen.length} Ausnahme(n) in der Liste greifen ins Leere** `
      + `(${drUrteil.verwaisteAusnahmen.map(v => `\`${v.name}\``).join(', ')}): `
      + `in \`${DOPPELREGEL_AUSNAHMEN_QUELLE}\` gelistet, aber keine Doppelregel dazu gemessen — `
      + 'ein Freispruch auf Vorrat, der beim nächsten Fund ohne Prüfung greift. Eintrag entfernen.');
  }
  push('');
  push('### 10.4 Marker im Quelltext');
  push('');
  if (d.statisch.marker.length === 0) push('**0 Treffer** — ein Qualitätsmerkmal: die Schulden stehen in der SSOT, nicht im Code.');
  else {
    push('| Ort | Marker | Text |');
    push('|---|---|---|');
    for (const m of d.statisch.marker) push(`| ${m.datei}:${m.zeile} | ${m.marker} | ${m.text.replace(/\|/g, '\\|')} |`);
  }
  push('');
  push('### 10.5 Generierte Dateien');
  push('');
  push('| Datei | Zeilen | Generator | Kopf als generiert markiert | schreibt beim Import |');
  push('|---|---|---|---|---|');
  for (const g of d.statisch.generierteDateien) {
    push(`| ${g.datei} | ${g.zeilen} | ${g.generator} | ${g.kopfHinweis ? 'ja' : 'nein'} | ${g.schreibtBeimImport ? 'ja' : 'nein'} |`);
  }
  push('');
  push('### 10.6 Zufall und Zeit im Simulationspfad');
  push('');
  if (d.zufall.imSimulationspfad.length === 0) push('Keine Treffer unter `src/engine/`.');
  else {
    push('| Ort | Art | Zeile |');
    push('|---|---|---|');
    for (const t of d.zufall.imSimulationspfad) push(`| ${t.datei}:${t.zeile} | ${t.art} | \`${t.text.replace(/\|/g, '\\|')}\` |`);
  }
  push('');
  push(`Außerhalb des Simulationspfads (meist legitim — Seed-Erzeugung, Anzeige): **${d.zufall.ausserhalb.length}** Treffer.`);
  push('');

  // ── Ereignisse ──────────────────────────────────────────────────────────
  push('## 11. Ereignis-Abdeckung');
  push('');
  push(`**${d.ereignisse.gesamt}** emittierte Ereignisarten (\`emit(\` UND \`melde(\`) · **${d.ereignisse.gedeckt}** im Client behandelt · **${d.ereignisse.stumm.length}** stumm.`);
  push('');
  push(`*Methode und ihre Belegstärke (Textsuche, kein Aufrufgraph):* Ein Ereignis gilt als behandelt, wenn sein Name unter \`src/client/\` `
    + `als Zeichenkette oder als UNQUOTIERTER Tabellenschlüssel vorkommt. `
    + `Davon **${d.ereignisse.gedecktNurSchluessel ?? 0} nur über einen Schlüssel** belegt — der schwächere Beleg; `
    + 'ein solcher Name kann theoretisch ein fremder Schlüssel sein. Bis 2026-09-26 zählte das Werkzeug nur Zeichenketten '
    + 'und meldete dadurch Namen als „UNDOKUMENTIERT", die im Client einen Zweig haben (`tests/event-coverage.test.js:218-232`). '
    + 'Ein „stumm" aus dieser Tabelle ist ein PRÜFAUFTRAG, kein Urteil.');
  push('');
  if (d.ereignisse.stumm.length) {
    const ohneGrund = d.ereignisse.stummListeOhneBegruendung ?? [];
    push(`Davon **${d.ereignisse.stummDokumentiert.length} mit Begründung als bewusst stumm gelistet** (Wächter \`tests/event-coverage.test.js\`), `
      + `**${d.ereignisse.stummUndokumentiert.length} undokumentiert**`
      + (ohneGrund.length ? `, **${ohneGrund.length} im Wächter gelistet, aber OHNE Begründung**` : '') + '.');
    push('');
    if (!d.ereignisse.waechterVorhanden) {
      push('**Der Wächter ist nicht lesbar:** `tests/event-coverage.test.js` fehlt, oder seine Menge `bewusstStumm` ließ sich nicht auslesen. '
        + 'Jedes stumme Ereignis gilt deshalb als undokumentiert — fail-safe, damit ein fehlender Wächter nicht als Freispruch durchgeht.');
      push('');
    }
    push('| Ereignis | emittiert in | Urteil | Begründung (aus dem Wächter) |');
    push('|---|---|---|---|');
    for (const s of d.ereignisse.stumm) {
      const urteil = s.urteil ?? (s.dokumentiertBewusstStumm ? 'bewusst stumm (begründet)' : '**UNDOKUMENTIERT**');
      const grund = s.begruendung ? s.begruendung.replace(/\|/g, '\\|') : s.gelistetBewusstStumm ? '*(keine — Eintrag ohne Begründung)*' : '*(nicht gelistet)*';
      push(`| \`${s.ereignis}\` | ${s.orte.slice(0, 3).join(', ')} | ${urteil} | ${grund} |`);
    }
    push('');
    push(d.ereignisse.stummUndokumentiert.length === 0 && ohneGrund.length === 0
      ? '*Keine Lücke:* Jedes stumme Ereignis ist im Wächter MIT Begründung gelistet — der Begründungstext wird in dieser Spalte einzeln gezeigt. Geprüft ist damit, dass eine Begründung HINGESCHRIEBEN wurde; ob sie stichhaltig ist, ist eine Einzelprüfung und keine Messung.'
      : '*Befund:* Die undokumentierten brauchen eine Begründung oder einen Client-Zweig; die gelisteten ohne Begründung werten sich sonst selbst frei.');
  }
  push('');

  // ── Pfade ───────────────────────────────────────────────────────────────
  push('## 12. Pfad-Auflösung (`fileURLToPath` statt `.pathname`)');
  push('');
  push(`**${d.pfade.anzahlRichtig}** Stellen lösen den Modulpfad korrekt auf · **${d.pfade.falsch.length}** falsch.`);
  push('');
  if (d.pfade.falsch.length) {
    push('| Datei | Zeile | Code |');
    push('|---|---|---|');
    for (const f of d.pfade.falsch) push(`| \`${f.datei}\` | ${f.zeile} | \`${f.code}\` |`);
    push('');
  }
  push(d.pfade.urteil);
  push('');

  // ── Sicherheit ──────────────────────────────────────────────────────────
  push('## 13. Server-Autorität und Secrets');
  push('');
  push(`Identity aus dem Token: **${d.sicherheit.tokenQuellen.length}** Fundstellen`);
  push(`\`Number()\` auf Drahtwerten: **${d.sicherheit.numberCoercions.length}** Fundstellen`);
  push(`Direkt gelesene Kennungen aus der Nachricht: **${d.sicherheit.direkteIds.length}** Fundstellen`);
  push('');
  if (d.sicherheit.direkteIds.length) {
    push('| Ort | Zeile |');
    push('|---|---|');
    for (const s of d.sicherheit.direkteIds) push(`| ${s.datei}:${s.zeile} | \`${s.text.replace(/\|/g, '\\|')}\` |`);
    push('');
  }
  push(`Secret-Scan über getrackte Dateien: **${d.secrets.length}** Fundstellen.`);
  if (d.secrets.length) {
    push('');
    push('| Datei | Zeile | Muster |');
    push('|---|---|---|');
    for (const s of d.secrets) push(`| ${s.datei}:${s.zeile} | ${s.zeile} | ${s.art} |`);
  }
  push('');
  push('*Die lokale `.env` ist gitignoriert und der vorgesehene Ort — sie ist kein Befund.*');
  push('');

  // ── Prüfkatalog ─────────────────────────────────────────────────────────
  push('## 14. Prüfkatalog (Wissensstand der Skills)');
  push('');
  push(`**${d.checklist.anzahl} Prüffragen** aus ${Object.keys(d.checklist.quellen).length} Regelwerken.`);
  push('');
  push('| Quelle | Fragen |');
  push('|---|---|');
  for (const [q, n] of Object.entries(d.checklist.quellen)) push(`| ${q} | ${n} |`);
  push('');
  push('Abrufbar über das Werkzeug `audit_checklist` (filterbar nach Thema, Quelle, Freitext).');
  push('');

  // ── Auswertung ──────────────────────────────────────────────────────────
  push('## 15. Auswertung');
  push('');
  const rot = d.ampel.rot;
  const gelb = d.ampel.gelb;
  push(`**Rot:** ${rot.length ? rot.join(', ') : 'keine'}`);
  push('');
  push(`**Gelb:** ${gelb.length ? gelb.join(', ') : 'keine'}`);
  push('');
  push(`**Grün:** ${d.ampel.gruen.join(', ')}`);
  push('');
  push('### Was schon belegt gut funktioniert');
  push('');
  if (d.determinismus.deterministisch && d.determinismus.seedWirkt) {
    push(`- **Determinismus hält.** Derselbe Seed ergibt über echte Züge mit Schüssen denselben Zustandshash (${d.determinismus.laeufe[0].hash}), verschiedene Seeds verschiedene. Das ist das Kernversprechen des Spiels und es ist gemessen.`);
  }
  if (d.statisch.marker.length === 0) push('- **Kein TODO/FIXME im Quelltext.** Gemessen: 0 Treffer (Abschnitt 10.4). Wo die offene Arbeit steht (SSOT/MASTERDOTO), prüft dieser Bericht nicht — das ist eine Vereinbarung, keine Messung.');
  if ((d.statisch.toteDaten ?? []).length === 0) {
    push(`- **Keine Datendatei ohne Leser.** Gemessen: alle ${d.statisch.datenGeprueft ?? '?'} \`.json\` unter \`src/\` werden im Code genannt (Abschnitt 10.1b). Bis 2026-09-27 war diese Zahl gar nicht messbar — \`QUELTEXT\` kannte kein \`.json\`.`);
  }
  if (d.statisch.toteDateien.length === 0) {
    const waechterTote = dateiVorhanden('tests/no-dead-code.test.js');
    push(`- **Keine Datei ohne Importeur.** In diesem Lauf gemessen: 0 (die 974 toten Zeilen sind die historische Zahl der ersten Messung). `
      + `Wächter \`tests/no-dead-code.test.js\`: ${waechterTote
        ? 'vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`), nicht dieser Bericht'
        : '**NICHT gefunden** — die Aussage „der Wächter hält die Zahl bei 0" wäre unbelegt'}.`);
  }
  if (d.secrets.length === 0) push('- **Kein Secret in getrackten Dateien.**');
  const drAuswertung = d.statisch.doppelregelnUrteil ?? beurteileDoppelregeln(d.statisch.doppelregeln ?? []);
  const ereignisOhneGrund = d.ereignisse.stummListeOhneBegruendung ?? [];
  if (d.ereignisse.stumm.length > 0 && d.ereignisse.stummUndokumentiert.length === 0 && ereignisOhneGrund.length === 0) {
    push(`- **Ereignis-Abdeckung ist sauber:** ${d.ereignisse.gedeckt} von ${d.ereignisse.gesamt} Ereignisarten behandelt, die ${d.ereignisse.stumm.length} stummen sind im Wächter \`tests/event-coverage.test.js\` EINZELN mit Begründung gelistet — der Text wird gelesen, nicht unterstellt (Abschnitt 11).`);
  }
  // Doppelregeln: Der Freispruch kommt aus der Liste, nicht aus der Feder.
  // Keine Doppelregel gemessen → KEIN Satz (auch kein Satz über das Fehlen).
  push(...doppelregelSaetze(drAuswertung));
  push(`- **Der Gate-Apparat ist erheblich:** ${d.gates.gesamt} Gates in diesem Lauf, ${d.stand.umfang.tests.zeilen} Zeilen Tests gegen ${d.stand.umfang.src.zeilen} Zeilen Quelltext (Verhältnis ${(d.stand.umfang.tests.zeilen / d.stand.umfang.src.zeilen).toFixed(2)}).`);
  push(`- **Der Waffenkatalog ist kein Datenmüll:** ${d.waffen.verteilung.powerScore.verschiedene} verschiedene powerScore-Werte bei ${d.waffen.anzahl} Waffen.`);
  push('');
  push('### Die größten Bremsen');
  push('');
  const bremsen = [];
  if (d.gates.fehlgeschlagen.length) bremsen.push('Rote Gates blockieren jede belastbare Aussage über den Stand.');
  if (d.ereignisse.stumm.length) {
    const offen = d.ereignisse.stummUndokumentiert.length + (d.ereignisse.stummListeOhneBegruendung?.length ?? 0);
    bremsen.push(`${d.ereignisse.stumm.length} stumme Engine-Ereignisse (${d.ereignisse.stummDokumentiert.length} mit Begründung gelistet, ${offen} OHNE Begründung) — jeder stumme Pfad ist in der Anzeige unsichtbar.`);
  }
  if (d.zufall.imSimulationspfad.length) bremsen.push('Zeit-/Zufallstreffer im Simulationspfad gefährden den Determinismus.');
  if (d.statisch.unbenutzteKonstanten.length) bremsen.push(`${d.statisch.unbenutzteKonstanten.length} Konstanten ohne Leser — Werte, die eine Wirkung versprechen, die es nicht gibt.`);
  if (!bremsen.length) bremsen.push('Keine strukturelle Bremse in diesem Lauf gefunden.');
  bremsen.forEach((b, i) => push(`${i + 1}. ${b}`));
  push('');

  // ── Nicht messbar ───────────────────────────────────────────────────────
  push('## 16. Nicht messbar in dieser Umgebung');
  push('');
  push('- **Visuelle Qualität des Renderings.** Braucht einen echten Browser; dieses MCP misst die Simulation, nicht das Bild.');
  push('- **Echter WebGPU-Pfad.** Ohne GPU-Adapter fällt die Umgebung auf CPU zurück.');
  push('- **Netzwerklatenz unter realen Bedingungen.** Nur simulierbar (`tests/e2e/network-conditions.spec.mjs`).');
  push('- **Der volle E2E-Lauf (28 Dateien, ~10 min).** Plan über `audit_e2e_plan`; bekannte vorbestehende Fehler: profiling-Specs ohne GPU.');
  push('- **Menschenzeit statt Simulationszeit.** Die Umrechnung braucht eine Bedenkzeit-Annahme und ist deshalb ausgewiesen, nicht gemessen.');
  push('');
  push('### 16.1 Was die statischen Sonden NICHT sehen');
  push('');
  push('Die Sichtgrenzen stammen aus `lib/statisch.mjs#sichtgrenzen()` und werden mit JEDER Antwort des Werkzeugs `audit_deadcode` ausgegeben — eine Meldung, die ihre Lücke nennt, ist mehr wert als eine stille Null:');
  push('');
  const grenzen = d.statisch.sichtgrenzen ?? null;
  if (!grenzen) {
    push('**NICHT AUSGEGEBEN** in diesem Lauf — ältere Berichte können aus einer Fassung stammen, die ihre Grenze nicht nannte.');
  } else {
    for (const [feld, text] of Object.entries(grenzen)) push(`- *${feld}:* ${text}`);
  }
  push('');

  // ── TODO ────────────────────────────────────────────────────────────────
  push('## 17. TODO');
  push('');
  push(`${todo.length} Punkte, nach Schwere sortiert. **Design-Entscheidungen sind nicht getroffen** — sie stehen als solche markiert und brauchen einen Beschluss.`);
  push('');
  for (const schwere of ['kritisch', 'hoch', 'mittel', 'niedrig']) {
    const gruppe = todo.filter(t => t.schwere === schwere);
    if (!gruppe.length) continue;
    push(`### ${schwere.toUpperCase()} (${gruppe.length})`);
    push('');
    for (const t of gruppe) {
      const marke = t.art === 'design' ? ' *[Offen — Design-Entscheidung]*' : t.art === 'entscheidung' ? ' *[braucht Begründung oder Behandlung]*' : '';
      push(`- [ ] ${t.titel}${marke}`);
      if (t.grund) push(`      ${t.grund}`);
    }
    push('');
  }

  push('---');
  push('');
  push(`Erzeugt von \`tools/audit-mcp\` v1.0.0 · Repo \`${ROOT}\``);
  push('');
  return z.join('\n');
}

/** Schreibt den Bericht und liefert Pfad + TODO. */
export function schreibeBericht(zielPfad, d) {
  const todo = todoAus(d);
  const markdown = berichtMarkdown(d, todo);
  const voll = path.isAbsolute(zielPfad) ? zielPfad : path.join(ROOT, zielPfad);
  fs.mkdirSync(path.dirname(voll), { recursive: true });
  fs.writeFileSync(voll, markdown, 'utf8');
  const datei = fullPath(voll);
  return { pfad: datei, todo, zeilen: markdown.split('\n').length };
}

function fullPath(p) {
  return p;
}
