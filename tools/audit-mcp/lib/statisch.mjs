/**
 * Statische Tiefenanalyse (Quelltext-Ebene).
 *
 * Bewusste Regel dieses Moduls: Jede Aussage ist eine MESSUNG mit Datei und
 * Zeile — keine Vermutung. Wo ein Verfahren nur heuristisch sein kann
 * (Importschätzung per Textsuche), steht das ausdrücklich dabei.
 *
 * Die Verfahren sind an den Befunden des Projekts ausgerichtet, die sich
 * wiederholt haben (siehe docs/audit-code.md, docs/audit-selbst.md):
 *   - tote Dateien / tote Exporte / tote Konstanten  → "sieht lebendig aus"
 *   - Doppelregeln                                   → "eine Regel, eine Stelle"
 *   - Math.random im Simulationspfad                  → Determinismus
 *   - stumme Engine-Ereignisse                        → Anzeige-Lücken
 *   - Number() als Schein-Typprüfung                  → Server-Autorität
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, walk, rel, read } from './repo.mjs';

/** Endungen, die Quelltext sind (nicht Doku/Daten). */
const QUELTEXT = ['.js', '.mjs', '.cjs', '.ts', '.tsx'];

/** Dateien, die als Einstieg gelten und daher keinen Importeur brauchen. */
const EINSTIEG = /(^|\/)(index\.(js|mjs|ts)|main\.(js|mjs|ts)|server\.mjs|vite\.config\.mjs)$/;

/** Alle Projektdateien (ohne die üblichen Ausschlüsse). */
export function projektDateien() {
  return walk(ROOT);
}

/** Quelltextdateien unter src/. */
export function quellDateien() {
  return walk(path.join(ROOT, 'src'), { endungen: QUELTEXT });
}

/**
 * Baut einen Importindex: Ziel-Datei → Menge der Dateien, die sie laden.
 *
 * Heuristik: gesucht wird `from '<pfad>'` und `import('<pfad>')`. Das erfasst
 * ES-Imports vollständig und CommonJS-`require` gar nicht — im Projekt gibt es
 * `"type": "module"`, also ist das die richtige Menge.
 */
export function importIndex(dateien = projektDateien()) {
  const index = new Map();
  for (const datei of dateien) {
    const text = read(datei);
    if (!text) continue;
    const treffer = text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g);
    for (const t of treffer) {
      const ziel = t[1];
      if (!ziel.startsWith('.')) continue;
      const basis = path.resolve(path.dirname(datei), ziel);
      const kandidaten = [
        basis,
        `${basis}.js`, `${basis}.mjs`, `${basis}.ts`,
        path.join(basis, 'index.js'), path.join(basis, 'index.mjs'),
      ];
      for (const k of kandidaten) {
        if (fs.existsSync(k) && fs.statSync(k).isFile()) {
          const liste = index.get(k) ?? [];
          if (!liste.includes(datei)) liste.push(datei);
          index.set(k, liste);
          break;
        }
      }
    }
  }
  return index;
}

/**
 * Tote Dateien: Quelltextdateien ohne jeden Importeur.
 * Barrel-Dateien (index.*) und Einstiegspunkte sind ausgenommen — sie werden
 * definitionsgemäß von außen geladen.
 */
export function toteDateien() {
  const dateien = quellDateien();
  const index = importIndex();
  const tot = [];
  for (const datei of dateien) {
    const r = rel(datei);
    if (EINSTIEG.test(r)) continue;
    const leser = index.get(datei) ?? [];
    if (leser.length === 0) {
      tot.push({ datei: r, zeilen: (read(datei) ?? '').split('\n').length });
    }
  }
  return tot.sort((a, b) => b.zeilen - a.zeilen);
}

/**
 * Unbenutzte benannte Exporte.
 *
 * Verfahren: Für jeden `export const|function|class NAME` wird außerhalb der
 * Definitionsdatei nach dem Namen gesucht. Ein Treffer irgendwo (auch in
 * scripts/, tests/, docs/) zählt als Leser — genau die Lehre aus dem ersten
 * Audit, wo ein `grep src/` fast nur Fehlalarme erzeugte, weil der Generator
 * (in scripts/) ein Teil des Produktivpfads ist.
 */
export function unbenutzteExporte({ nurUnter = 'src/' } = {}) {
  const dateien = projektDateien().filter(f => QUELTEXT.includes(path.extname(f)));
  const alleTexte = new Map(dateien.map(f => [f, read(f) ?? '']));
  const befunde = [];

  for (const datei of dateien) {
    const r = rel(datei);
    if (!r.startsWith(nurUnter)) continue;
    const text = alleTexte.get(datei) ?? '';
    const namen = new Set();
    for (const m of text.matchAll(
      /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      namen.add(m[1]);
    }
    for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const teil of m[1].split(',')) {
        const name = teil.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) namen.add(name);
      }
    }
    for (const name of namen) {
      const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g');
      let ausserhalb = 0;
      for (const [f, t] of alleTexte) {
        if (f === datei) continue;
        const treffer = t.match(re);
        if (treffer) ausserhalb += treffer.length;
      }
      if (ausserhalb > 0) continue;
      // Zweite, wichtigere Unterscheidung: Wird der Name INNERHALB der eigenen
      // Datei benutzt? Dann ist nicht die Funktion tot, sondern nur das
      // `export` überflüssig — das ist ein anderer (und harmloserer) Befund.
      const intern = (text.match(re) ?? []).length - 1;
      befunde.push({
        datei: r,
        name,
        leserAusserhalb: 0,
        verwendungenInDerDatei: Math.max(0, intern),
        art: intern > 0 ? 'export ohne externen Leser (intern genutzt)' : 'kein Leser im ganzen Projekt',
      });
    }
  }
  return befunde.sort((a, b) => a.datei.localeCompare(b.datei));
}

/**
 * Konstanten, die definiert und NIRGENDS gelesen werden.
 *
 * Dieselbe Fehlerklasse wie die fünf toten Prioritätskonstanten: Ein Wert
 * verspricht eine Wirkung, die es nicht gibt.
 *
 * **Zählweise (wichtig, hier schon einmal falsch gemacht):** Gezählt wird
 * JEDES Vorkommen des Namens im ganzen Projekt, auch in der eigenen Datei —
 * abzüglich der Definitionszeile selbst. Eine Konstante, die nur innerhalb
 * ihrer eigenen Datei benutzt wird, ist NORMAL und kein Befund; ein erster
 * Lauf dieses Werkzeugs zählte nur datei-fremde Leser und meldete deshalb 67
 * „unbenutzte" Konstanten, von denen die meisten in Wahrheit benutzt wurden.
 * Ein Werkzeug, das so zählt, produziert Fehlalarme in Serie.
 */
export function unbenutzteKonstanten({ nurUnter = 'src/' } = {}) {
  const dateien = projektDateien().filter(f => QUELTEXT.includes(path.extname(f)));
  const alleTexte = new Map(dateien.map(f => [f, read(f) ?? '']));
  const befunde = [];

  for (const datei of dateien) {
    const r = rel(datei);
    if (!r.startsWith(nurUnter)) continue;
    const text = alleTexte.get(datei) ?? '';
    const defined = new Map();
    text.split('\n').forEach((zeile, i) => {
      const m = zeile.match(/^\s*(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/);
      if (m) defined.set(m[1], i + 1);
    });
    for (const [name, zeile] of defined) {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      let gesamt = 0;
      const leserOrte = [];
      for (const [f, t] of alleTexte) {
        const treffer = t.match(re);
        if (!treffer) continue;
        const anzahl = f === datei ? treffer.length - 1 : treffer.length;
        if (anzahl <= 0) continue;
        gesamt += anzahl;
        if (f !== datei && leserOrte.length < 3) leserOrte.push(rel(f));
      }
      if (gesamt === 0) {
        befunde.push({ datei: r, zeile, name, leserAusserhalbDerDatei: leserOrte.length });
      }
    }
  }
  return befunde.sort((a, b) => a.datei.localeCompare(b.datei));
}

/**
 * Doppelregeln: derselbe Bezeichner (GROSS geschrieben oder Funktion) wird in
 * mehr als einer Datei definiert. Das ist die Klasse der Befunde, bei denen
 * "wer den einen Wert ändert, ändert nichts".
 *
 * Das Ergebnis ist eine reine MESSUNG (Name + Orte) und enthält KEIN Urteil.
 * Ob eine gefundene Doppelregel Absicht ist, entscheidet ausschließlich
 * `beurteileDoppelregeln()` anhand der Ausnahmeliste unten.
 */
export function doppelregeln({ nurUnter = 'src/' } = {}) {
  const dateien = quellDateien().filter(f => rel(f).startsWith(nurUnter));
  const orte = new Map();
  for (const datei of dateien) {
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      const m = zeile.match(/^\s*(?:export\s+)?const\s+([A-Z_][A-Z0-9_]{2,})\s*=/);
      if (!m) return;
      const liste = orte.get(m[1]) ?? [];
      liste.push(`${rel(datei)}:${i + 1}`);
      orte.set(m[1], liste);
    });
  }
  return [...orte.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([name, orte]) => ({ name, orte }));
}

/** Wo die Ausnahmeliste steht — der Ort, den jeder Freispruch zitieren muss. */
export const DOPPELREGEL_AUSNAHMEN_QUELLE =
  'tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)';

/**
 * Die AUSNAHMELISTE für Doppelregeln: Hier steht, welche gleichnamige Definition
 * in zwei Dateien ABSICHT ist — mit Begründung und den dokumentierten Orten.
 *
 * Warum diese Liste existiert (belegter Fehler, 2026-09-26): `bericht.mjs`
 * schrieb einen fest verdrahteten Freispruch in JEDEN Bericht, sobald der
 * Detektor mindestens EINE Doppelregel fand:
 * „Keine stille Doppelregel gefunden: … welche davon Absicht sind (z. B.
 * `PRIMARY_BIOME_BY_PRESET`, das laut Projektregel in ZWEI Dateien stehen
 * MUSS), steht in der Auswertung." Drei Fehler in einem Satz:
 *   1. Die Überschrift behauptete „keine gefunden", während die Zahl daneben
 *      eine fand — der Bericht widersprach seiner eigenen Messung.
 *   2. Den zitierten Fall gab es in der Ausnahmeliste nicht: Es gibt keine
 *      Projektregel „muss in ZWEI Dateien stehen"; die Projektregel lautet
 *      „eine Regel, eine Stelle". Die Regel war FREI ERFUNDEN.
 *   3. Der genannte Fall war ein ECHTES Duplikat (zwei wertgleiche Definitionen
 *      in `src/shared/config/backdrops.js` und `scenery.js`, ohne
 *      Importbeziehung) — ein Duplikat wurde als Beleg für Sauberkeit genannt.
 *
 * Ab hier gilt: **Ein Freispruch wird GELESEN, nicht behauptet.**
 *   - Name steht in dieser Liste UND die gemessenen Orte stimmen mit `orte`
 *     überein → „bewusst, begründet" — MIT der Begründung aus dieser Liste.
 *   - Name fehlt in der Liste, hat keine Begründung, oder die Orte weichen ab
 *     → offener Befund. FAIL-SAFE in Richtung des lauteren Fehlers: im Zweifel
 *       gilt eine Doppelregel als OFFEN, niemals als Absicht.
 *   - Keine Doppelregel gemessen → es wird kein Satz über Doppelregeln erzeugt.
 *
 * Beide Felder sind Pflicht; ein Eintrag ohne `begruendung` wird nicht als
 * Freispruch gewertet (er ist selbst ein Befund).
 *
 *   'BEZEICHNER': {
 *     begruendung: 'warum die zweite Stelle Absicht ist',
 *     orte: ['src/shared/…:12', 'src/shared/…:34'],
 *   }
 *
 * Derzeit ist keine Doppelregel als Absicht dokumentiert: Was der Detektor
 * findet, ist offen.
 */
export const DOPPELREGEL_AUSNAHMEN = new Map([
  // (leer — bewusst: kein Freispruch auf Vorrat)
]);

/**
 * Stellt die MESSUNG gegen die Ausnahmeliste und liefert das Urteil.
 *
 * Reine Funktion ohne Dateizugriff — dadurch ist sie in der Gegenprobe mit
 * einer künstlichen Liste aufrufbar, und ein fehlendes Feld in den Berichtsdaten
 * kann keinen Freispruch erzeugen (fehlende Liste ⇒ alles offen).
 *
 * @param {{name: string, orte: string[]}[]} liste Messung aus `doppelregeln()`
 * @param {Map<string, {begruendung: string, orte: string[]}>} ausnahmen
 */
export function beurteileDoppelregeln(liste = [], ausnahmen = DOPPELREGEL_AUSNAHMEN) {
  const gemessen = Array.isArray(liste) ? liste : [];
  const liste_ = gemessen.map(({ name, orte }) => {
    const eintrag = ausnahmen?.get?.(name);
    if (!eintrag || !eintrag.begruendung) {
      return {
        name, orte, ausnahme: false, begruendung: null,
        grund: eintrag
          ? 'in der Ausnahmeliste, aber OHNE Begründung — gilt als offen'
          : `nicht in der Ausnahmeliste ${DOPPELREGEL_AUSNAHMEN_QUELLE} — gilt als offen`,
      };
    }
    const gemessenOrte = [...orte].sort().join(' · ');
    const dokumentierteOrte = [...(eintrag.orte ?? [])].sort().join(' · ');
    if (!dokumentierteOrte || dokumentierteOrte !== gemessenOrte) {
      return {
        name, orte, ausnahme: false, begruendung: eintrag.begruendung,
        grund: `gelistet, aber die gemessenen Orte weichen von den dokumentierten ab `
          + `(dokumentiert: ${dokumentierteOrte || 'keine'} | gemessen: ${gemessenOrte}) — gilt als offen`,
      };
    }
    return { name, orte, ausnahme: true, begruendung: eintrag.begruendung, grund: null };
  });

  const gemesseneNamen = new Set(gemessen.map(x => x.name));
  const verwaisteAusnahmen = [...(ausnahmen?.entries?.() ?? [])]
    .filter(([name]) => !gemesseneNamen.has(name))
    .map(([name, e]) => ({ name, begruendung: e?.begruendung ?? null }));

  return {
    quelle: DOPPELREGEL_AUSNAHMEN_QUELLE,
    liste: liste_,
    offen: liste_.filter(x => !x.ausnahme),
    begruendet: liste_.filter(x => x.ausnahme),
    verwaisteAusnahmen,
  };
}

/**
 * Letzter Commit, der eine Datei angefasst hat (`git log -1`).
 *
 * Für Sätze der Form „damals war es genau 1 Stelle": Die Zahl ist historisch
 * und in diesem Lauf nicht messbar — der Beleg ist der Commit. Liefert `null`,
 * wenn git nicht antwortet; der Bericht muss dann sagen, dass er es NICHT
 * belegen konnte, statt die Zahl ohne Beleg zu behaupten.
 */
export function letzterCommit(relativerPfad) {
  try {
    const aus = execFileSync('git', ['log', '-1', '--format=%h %ad', '--date=short', '--', relativerPfad],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!aus) return null;
    const [hash, datum] = aus.split(' ');
    return { hash, datum, pfad: relativerPfad };
  } catch {
    return null;
  }
}

/** Existiert eine Datei unterhalb der Projektwurzel? Für Aussagen über Wächter. */
export function dateiVorhanden(relativerPfad) {
  return fs.existsSync(path.join(ROOT, relativerPfad));
}

/** TODO/FIXME/XXX/HACK im Quelltext (die stille Schuldenliste). */
export function marker({ nurUnter = 'src/' } = {}) {
  const befunde = [];
  for (const datei of quellDateien()) {
    const r = rel(datei);
    if (!r.startsWith(nurUnter)) continue;
    (read(datei) ?? '').split('\n').forEach((zeile, i) => {
      const m = zeile.match(/\b(TODO|FIXME|XXX|HACK)\b/);
      if (m) befunde.push({ datei: r, zeile: i + 1, marker: m[1], text: zeile.trim().slice(0, 120) });
    });
  }
  return befunde;
}

/** true, wenn die Zeile ein Kommentar ist (kein ausgeführter Code). */
function istKommentar(zeile) {
  const z = zeile.trim();
  return z.startsWith('//') || z.startsWith('*') || z.startsWith('/*');
}

/**
 * Nichtdeterminismus im Simulationspfad.
 *
 * Geprüft wird unter `src/engine/`. Treffer werden NICHT verurteilt, sondern
 * eingeordnet: Seed-Erzeugung und Anzeige sind legitim, alles andere ist ein
 * Determinismus-Risiko. Die Einordnung ist heuristisch und muss am Code
 * nachgelesen werden — sie steht hier als Vorarbeit, nicht als Urteil.
 *
 * Kommentarzeilen sind ausdrücklich ausgenommen: Eine Zeile, die `Math.random`
 * nur ERWÄHNT („bewusst NICHT Math.random"), ist kein Treffer. Ohne diesen
 * Filter meldet die Sonde reihenweise Kommentare — und ein Werkzeug, das
 * Kommentare zählt, ist ein Werkzeug, dem niemand glaubt (belegt im ersten
 * Lauf dieses MCP: 3 von 3 Treffern waren Kommentare).
 */
export function nichtdeterminismus() {
  const dateien = walk(path.join(ROOT, 'src', 'engine'), { endungen: QUELTEXT });
  const befunde = [];
  for (const datei of dateien) {
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      if (istKommentar(zeile)) return;
      if (/\bMath\.random\b|\bDate\.now\b|performance\.now/.test(zeile)) {
        befunde.push({
          datei: rel(datei),
          zeile: i + 1,
          text: zeile.trim().slice(0, 140),
          art: /Math\.random/.test(zeile) ? 'Math.random' : 'Zeit',
        });
      }
    });
  }
  return befunde;
}

/**
 * `Math.random` überhaupt — außerhalb von `src/engine/`.
 * Die Frage ist nicht "gibt es das", sondern "steht es im Pfad, der den
 * Spielzustand bestimmt". Kommentare zählen nicht.
 */
export function zufallImProjekt() {
  const befunde = [];
  for (const datei of quellDateien()) {
    const r = rel(datei);
    if (r.startsWith('src/engine/')) continue;
    (read(datei) ?? '').split('\n').forEach((zeile, i) => {
      if (istKommentar(zeile)) return;
      if (/\bMath\.random\b/.test(zeile)) {
        befunde.push({ datei: r, zeile: i + 1, text: zeile.trim().slice(0, 140) });
      }
    });
  }
  return befunde;
}

/**
 * Prüft, ob ein Treffer an `index` WIRKLICH ausgeführter Code ist.
 *
 * Der Detektor aus dem ersten Lauf zählte seinen EIGENEN Suchausdruck als
 * Befund: In `statisch.mjs` steht das Muster als Regex-Literal, in `bericht.mjs`
 * und `katalog.mjs` als Text in einer Zeichenkette. Drei „Befunde", die keine
 * waren. Dasselbe Muster wie bei den Kommentaren vorher — ein Detektor, der
 * seinen eigenen Text nicht von Code unterscheiden kann, meldet sich selbst.
 *
 * Deshalb: Steht vor dem Treffer ein Anführungszeichen, ein Backtick oder ein
 * Schrägstrich (Regex-Literal), ist es Text und kein Code. Verlangt wird
 * außerdem, dass nach dem Treffer ein echter Abschluss folgt.
 */
function istAusgefuehrterCode(zeile, index) {
  const davor = zeile.slice(0, index).trimEnd();
  const letztes = davor.slice(-1);
  if (letztes === '"' || letztes === "'" || letztes === '`' || letztes === '/' || letztes === '\\') return false;
  // In einer Regex-Klasse oder in einem String bleibt der Rest unzuverlässig.
  if (/(^|[^\\])['"`][^'"`]*$/.test(davor)) return false;
  return true;
}

/**
 * Pfad-Auflösung: `fileURLToPath` statt `.pathname`.
 *
 * **Warum das eine eigene Prüfung ist:** Am 2026-09-24 war der Rauchtest
 * vollständig funktionsunfähig (`spawn npm ENOENT`, null gemeldete Schritte).
 * Ursache war eine einzige Zeile: `new URL('..', import.meta.url).pathname`.
 * `.pathname` liefert den Pfad PROZENT-KODIERT, sobald er ein Leerzeichen
 * enthält — `AnunnakiTools%20Projekte/…` — und `fs.existsSync` darauf ist
 * `false`. Jeder `spawn` mit diesem `cwd` scheitert dann mit ENOENT.
 *
 * Die Fehlerklasse ist tückisch, weil sie ZWEI Umstände braucht: ein
 * Sonderzeichen im Pfad UND eine Stelle, die den Pfad als `cwd` benutzt. Auf
 * einem Rechner ohne Leerzeichen im Pfad ist die Stelle unsichtbar grün. Genau
 * deshalb ist sie eine Prüfung und keine Konvention: Am 2026-09-24 machten es 38
 * Stellen richtig, eine nicht — und die eine war der Wächter des schnellen
 * Zyklus. Die Zahl von HEUTE liefert `pfadAufloesung()` selbst; hier steht sie
 * bewusst mit Datum, weil sie historisch ist.
 */
export function pfadAufloesung() {
  const falsch = [];
  let anzahlRichtig = 0;
  for (const datei of projektDateien().filter(f => QUELTEXT.includes(path.extname(f)))) {
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      if (istKommentar(zeile)) return;
      const treffer = zeile.match(/\bnew URL\([^)]*import\.meta\.url[^)]*\)\.pathname/);
      if (treffer && istAusgefuehrterCode(zeile, treffer.index)) {
        falsch.push({ datei: rel(datei), zeile: i + 1, code: zeile.trim() });
      }
      const richtig = zeile.match(/\bfileURLToPath\s*\(/);
      if (richtig && istAusgefuehrterCode(zeile, richtig.index)) anzahlRichtig += 1;
    });
  }
  return {
    falsch,
    anzahlRichtig,
    urteil: falsch.length === 0
      ? `Alle ${anzahlRichtig} Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel.`
      : `${falsch.length} Stelle(n) benutzen .pathname statt fileURLToPath (${anzahlRichtig} machen es richtig). Bei einem Sonderzeichen im Pfad scheitert dort jeder spawn mit ENOENT.`,
  };
}

/**
 * Liest die Menge `bewusstStumm` SAMT Begründung aus dem Wächter-Quelltext.
 *
 * Ergebnis: Name → Begründungstext oder `null`, wenn der Eintrag keinen
 * Begründungskommentar hat. Ausgelagert (und damit prüfbar), weil genau daran
 * der zweite fest verdrahtete Satz hing: Der Bericht behauptete „jedes stumme
 * Ereignis ist mit Begründung gelistet", während hier nur die Zugehörigkeit zur
 * Menge geprüft wurde. Wer gelistet ist, aber keine Begründung hat, ist OFFEN.
 */
export function leseBewusstStumm(waechterText = '') {
  const block = waechterText.match(/bewusstStumm\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const begruendungen = new Map();
  if (!block) return { vorhanden: false, begruendungen };
  block[1].split('\n').forEach(zeile => {
    const mitGrund = zeile.match(/'([a-z0-9_]+)'\s*,?\s*\/\/\s*(\S.*)$/i);
    if (mitGrund) {
      begruendungen.set(mitGrund[1], mitGrund[2].trim());
      return;
    }
    // Gelistet, aber ohne Begründung auf derselben Zeile → bleibt `null`.
    const ohneGrund = zeile.match(/'([a-z0-9_]+)'/i);
    if (ohneGrund && !begruendungen.has(ohneGrund[1])) begruendungen.set(ohneGrund[1], null);
  });
  return { vorhanden: true, begruendungen };
}

/**
 * Ereignis-Abdeckung: Welche Ereignisse emittiert die Engine, und welcher
 * Client-Zweig behandelt sie?
 *
 * Beide Seiten werden getrennt gesucht (lokal UND online) — die Lehre aus dem
 * Black-Box-Audit, wo ein Ereignis nur im Online-Zweig behandelt war.
 *
 * **Zweite Stufe (die eigentliche Tiefe):** Ein stummes Ereignis ist nur dann
 * ein Befund, wenn es UNDOKUMENTIERT stumm ist. Das Projekt führt dafür den
 * Wächter `tests/event-coverage.test.js` mit einer Menge `bewusstStumm` samt
 * Begründung je Eintrag (als `// …`-Kommentar hinter dem Namen).
 *
 * Gelesen wird BEIDES: der Name UND der Begründungstext. Das war nicht immer
 * so — bis 2026-09-26 prüfte dieses Modul nur die Zugehörigkeit zur Menge,
 * während der Bericht behauptete, jedes stumme Ereignis sei „EINZELN begründet"
 * (`bericht.mjs`: „Ereignis-Abdeckung ist sauber … mit Begründung"). Ein
 * Eintrag, dessen Begründung gelöscht wird, wäre damit weiter freigesprochen
 * worden. Fail-safe: Wer gelistet ist, aber dessen Begründung fehlt, gilt als
 * OFFEN (`stummListeOhneBegruendung`), nicht als entschieden.
 */
export function ereignisAbdeckung() {
  const engine = walk(path.join(ROOT, 'src', 'engine'), { endungen: QUELTEXT });
  const emittiert = new Map();
  // ZWEI Meldewege, nicht einer — belegt in `tests/event-coverage.test.js:124-136`:
  // `emit('…')` (überall) und `melde('…')` (Günthers System, `guentherSystem.js:276`,
  // `:302`, `:319`, `:341`). Nur `emit(` zu suchen hieß: vier Ereignisarten waren
  // für dieses Werkzeug unsichtbar — der Bericht gab damit eine kleinere Gesamtzahl
  // aus, als der Motor meldet.
  for (const datei of engine) {
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      for (const m of zeile.matchAll(/(?:emit|melde)\(\s*'([a-z0-9_]+)'/gi)) {
        if (!emittiert.has(m[1])) emittiert.set(m[1], []);
        const ort = `${rel(datei)}:${i + 1}`;
        if (!emittiert.get(m[1]).includes(ort)) emittiert.get(m[1]).push(ort);
      }
    });
  }

  const clientDateien = walk(path.join(ROOT, 'src', 'client'), { endungen: QUELTEXT });
  const clientText = clientDateien.map(f => read(f) ?? '').join('\n');
  /**
   * Behandelt-Nachweis in ZWEI Belegstärken, beide Textsuche (kein Aufrufgraph):
   *
   *   `zitat`      — der Name steht als Zeichenkette im Client. Starker Beleg.
   *   `schluessel` — der Name steht als UNQUOTIERTER Schlüssel da
   *                  (`crate_pickup: {` in `src/client/ereignisse.js:424`).
   *
   * Die zweite Stufe fehlte bis 2026-09-26: Die Zuordnungstabelle benutzt
   * unquotierte Schlüssel, die Suche nach Zeichenketten konnte sie nicht
   * erfassen — der Bericht meldete deshalb 27 Ereignisse als „UNDOKUMENTIERT",
   * die im Client sehr wohl einen Zweig haben (`tests/event-coverage.test.js:218-232`
   * hält dieselbe Feststellung fest). Ein Urteil über die Methode hinaus ist
   * derselbe Fehler wie der Doppelregel-Freispruch, nur in die andere Richtung.
   *
   * Weil ein unquotierter Schlüssel AUCH ein fremder Schlüssel sein kann, wird er
   * getrennt gezählt und im Bericht als schwächerer Beleg benannt — kein stiller
   * Freispruch.
   */
  const zitate = new Set([...clientText.matchAll(/['"]([a-z0-9_]{3,})['"]/gi)].map(m => m[1]));
  const schluessel = new Set([...clientText.matchAll(/^\s*([a-z0-9_]{3,})\s*:/gmi)].map(m => m[1]));
  const behandelt = new Set([...emittiert.keys()].filter(n => zitate.has(n) || schluessel.has(n)));

  // Die dokumentierte Absicht — aus dem Wächter, nicht aus einer zweiten Liste.
  // Gelesen werden Name UND Begründung (der `// …`-Kommentar hinter dem Namen,
  // `tests/event-coverage.test.js:248-267`). Ohne Begründungstext ist der
  // Eintrag kein Nachweis von Absicht.
  const waechter = read(path.join(ROOT, 'tests', 'event-coverage.test.js')) ?? '';
  const { vorhanden: waechterVorhanden, begruendungen } = leseBewusstStumm(waechter);

  const stumm = [];
  const stummUndokumentiert = [];
  const stummDokumentiert = [];
  const stummListeOhneBegruendung = [];
  const gedeckt = [];
  for (const [name, orte] of [...emittiert.entries()].sort()) {
    if (behandelt.has(name)) {
      gedeckt.push({ ereignis: name, orte, beleg: zitate.has(name) ? 'zitat' : 'schluessel' });
      continue;
    }
    const gelistet = begruendungen.has(name);
    const begruendung = gelistet ? begruendungen.get(name) : null;
    const eintrag = {
      ereignis: name,
      orte,
      begruendung,
      gelistetBewusstStumm: gelistet,
      dokumentiertBewusstStumm: Boolean(begruendung),
      urteil: begruendung
        ? 'bewusst stumm (begründet)'
        : gelistet
          ? '**GELISTET, aber OHNE Begründung**'
          : '**UNDOKUMENTIERT**',
    };
    stumm.push(eintrag);
    if (eintrag.dokumentiertBewusstStumm) stummDokumentiert.push(eintrag);
    else if (gelistet) stummListeOhneBegruendung.push(eintrag);
    else stummUndokumentiert.push(eintrag);
  }
  return {
    gedeckt,
    gedecktNurSchluessel: gedeckt.filter(g => g.beleg === 'schluessel'),
    stumm,
    stummDokumentiert,
    stummListeOhneBegruendung,
    stummUndokumentiert,
    gesamt: emittiert.size,
    waechterVorhanden,
    waechterListe: [...begruendungen.keys()],
  };
}

/**
 * Server-Autorität: Nimmt der Server die Spielerkennung aus dem TOKEN oder aus
 * der Nachricht? Und wird ein Drahtwert wirklich auf `typeof number` geprüft
 * oder nur durch `Number()` geschickt (`Number(null) === 0`)?
 */
export function serverAutoritaet() {
  const serverDateien = walk(path.join(ROOT, 'src', 'server'), { endungen: QUELTEXT });
  const befunde = { tokenQuellen: [], numberCoercions: [], direkteIds: [] };

  for (const datei of serverDateien) {
    const r = rel(datei);
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      const z = zeile.trim();
      if (/\.seat|seats\.get|tokenToSeat|spielerAusToken|ausToken/.test(z) && /entityId/.test(z)) {
        befunde.tokenQuellen.push({ datei: r, zeile: i + 1, text: z.slice(0, 140) });
      }
      if (/Number\(\s*(msg|message|nachricht|daten|data|payload)\./.test(z)) {
        befunde.numberCoercions.push({ datei: r, zeile: i + 1, text: z.slice(0, 140) });
      }
      if (/(msg|message|nachricht|daten|data)\.(playerId|entityId)\b/.test(z) && !/Number\(/.test(z)) {
        befunde.direkteIds.push({ datei: r, zeile: i + 1, text: z.slice(0, 140) });
      }
    });
  }
  return befunde;
}

/**
 * Secret-Scan über die getrackten Dateien.
 *
 * Geprüft werden NUR Dateien, die git kennt (`git ls-files`) — eine lokale
 * `.env` ist gitignoriert und wird ausdrücklich NICHT gemeldet; sie ist der
 * vorgesehene Ort.
 */
export function secretScan() {
  let gitListe = null;
  try {
    gitListe = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    gitListe = null;
  }
  const kandidaten = gitListe && gitListe.length
    ? gitListe.map(f => path.join(ROOT, f))
    : projektDateien();

  const MUSTER = [
    { name: 'OpenAI-artiger Key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'Anthropic-Key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'GitHub-Token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
    { name: 'HuggingFace-Token', re: /\bhf_[A-Za-z0-9]{30,}\b/ },
    { name: 'Supabase-Service-Role (JWT)', re: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/ },
    { name: 'Supabase-PAT', re: /\bsbp_[a-f0-9]{30,}\b/ },
    { name: 'RunPod-Key', re: /\brpa_[A-Za-z0-9]{16,}\b/ },
    { name: 'private-JWT (jwt.io)', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  ];

  const befunde = [];
  for (const datei of kandidaten) {
    if (datei.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const text = read(datei);
    if (!text) continue;
    text.split('\n').forEach((zeile, i) => {
      for (const m of MUSTER) {
        if (m.re.test(zeile)) {
          befunde.push({
            datei: rel(datei),
            zeile: i + 1,
            art: m.name,
            // Der Wert selbst wird NIE ausgegeben — nur ein Fingerabdruck.
            fingerabdruck: `${zeile.trim().slice(0, 24)}…`,
          });
        }
      }
    });
  }
  return befunde;
}

/**
 * Generierte Dateien und ihr Generator — der gefährlichste Codepfad des
 * Projekts (`src/shared/config/weapons.js` wird beim IMPORT geschrieben).
 */
export function generierteDateien() {
  const KANDIDATEN = [
    { datei: 'src/shared/config/weapons.js', generator: 'scripts/build-weapon-catalog.mjs' },
  ];
  return KANDIDATEN.map(({ datei, generator }) => {
    const voll = path.join(ROOT, datei);
    const text = read(voll);
    const genText = read(path.join(ROOT, generator));
    return {
      datei,
      existiert: Boolean(text),
      zeilen: text ? text.split('\n').length : 0,
      generator,
      generatorExistiert: Boolean(genText),
      kopfHinweis: text ? /GENERIERT|AUTO-GENERATED|erzeugt von/i.test(text.slice(0, 2000)) : false,
      schreibtBeimImport: genText
        ? !/if\s*\(\s*import\.meta\.main|process\.argv\[1\]/.test(genText)
        : false,
    };
  });
}

/** Zeilen zählen (Quelltext + Tests). */
export function zeilenStatistik() {
  const zaehle = dateien => {
    let zeilen = 0;
    let anzahl = 0;
    for (const f of dateien) {
      const t = read(f);
      if (t === null) continue;
      anzahl += 1;
      zeilen += t.split('\n').length;
    }
    return { dateien: anzahl, zeilen };
  };
  return {
    src: zaehle(quellDateien()),
    tests: zaehle(walk(path.join(ROOT, 'tests'), { endungen: QUELTEXT })),
    scripts: zaehle(walk(path.join(ROOT, 'scripts'), { endungen: QUELTEXT })),
    tools: zaehle(walk(path.join(ROOT, 'tools'), { endungen: QUELTEXT })),
  };
}

/** Alle Dateien, die der Audit als "lesbar" meldet (Diagnose des Werkzeugs). */
export function inventar() {
  return { root: ROOT, dateien: projektDateien().length, quelltext: quellDateien().length };
}
