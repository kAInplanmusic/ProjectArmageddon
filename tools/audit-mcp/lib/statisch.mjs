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
 * deshalb ist sie eine Prüfung und keine Konvention: 38 Dateien machten es
 * richtig, eine nicht — und die eine war der Wächter des schnellen Zyklus.
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
 * Ereignis-Abdeckung: Welche Ereignisse emittiert die Engine, und welcher
 * Client-Zweig behandelt sie?
 *
 * Beide Seiten werden getrennt gesucht (lokal UND online) — die Lehre aus dem
 * Black-Box-Audit, wo ein Ereignis nur im Online-Zweig behandelt war.
 *
 * **Zweite Stufe (die eigentliche Tiefe):** Ein stummes Ereignis ist nur dann
 * ein Befund, wenn es UNDOKUMENTIERT stumm ist. Das Projekt führt dafür den
 * Wächter `tests/event-coverage.test.js` mit einer Menge `bewusstStumm` samt
 * Begründung je Eintrag. Diese Menge wird HIER gelesen und gegen die gemessenen
 * stummen Ereignisse gestellt. Erst dadurch unterscheidet das Werkzeug
 * „Absicht" von „Lücke" — ohne diesen Schritt meldet es 8 stumme Ereignisse,
 * von denen alle 8 dokumentiert sind (belegt im ersten Lauf).
 */
export function ereignisAbdeckung() {
  const engine = walk(path.join(ROOT, 'src', 'engine'), { endungen: QUELTEXT });
  const emittiert = new Map();
  for (const datei of engine) {
    const text = read(datei) ?? '';
    text.split('\n').forEach((zeile, i) => {
      for (const m of zeile.matchAll(/emit\(\s*'([a-z0-9_]+)'/gi)) {
        if (!emittiert.has(m[1])) emittiert.set(m[1], []);
        emittiert.get(m[1]).push(`${rel(datei)}:${i + 1}`);
      }
    });
  }

  const clientDateien = walk(path.join(ROOT, 'src', 'client'), { endungen: QUELTEXT });
  const clientText = clientDateien.map(f => read(f) ?? '').join('\n');
  const behandelt = new Set(
    [...clientText.matchAll(/['"]([a-z0-9_]{3,})['"]/gi)].map(m => m[1]),
  );

  // Die dokumentierte Absicht — aus dem Wächter, nicht aus einer zweiten Liste.
  const waechter = read(path.join(ROOT, 'tests', 'event-coverage.test.js')) ?? '';
  const block = waechter.match(/bewusstStumm\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const dokumentiert = new Set(
    block ? [...block[1].matchAll(/'([a-z0-9_]+)'/gi)].map(m => m[1]) : [],
  );

  const stumm = [];
  const stummUndokumentiert = [];
  const stummDokumentiert = [];
  const gedeckt = [];
  for (const [name, orte] of [...emittiert.entries()].sort()) {
    if (behandelt.has(name)) {
      gedeckt.push({ ereignis: name, orte });
      continue;
    }
    const eintrag = { ereignis: name, orte, dokumentiertBewusstStumm: dokumentiert.has(name) };
    stumm.push(eintrag);
    (eintrag.dokumentiertBewusstStumm ? stummDokumentiert : stummUndokumentiert).push(eintrag);
  }
  return {
    gedeckt,
    stumm,
    stummDokumentiert,
    stummUndokumentiert,
    gesamt: emittiert.size,
    waechterVorhanden: Boolean(block),
    waechterListe: [...dokumentiert],
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
