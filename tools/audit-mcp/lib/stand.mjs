/**
 * Der Code-Fingerabdruck dieses MCP-Servers.
 *
 * ## Warum es diese Datei gibt (belegter Fehler, 2026-09-26)
 *
 * Ein MCP-Server ist ein LANGLAUFENDER Prozess: er lädt seine Module EINMAL und
 * hält sie für die gesamte Lebensdauer im Speicher. Nach der Reparatur von
 * `lib/statisch.mjs` (der Ereignis-Detektor suchte Namen nur als zitierte
 * Zeichenkette, die Zuordnungstabelle benutzt unquotierte Schlüssel) antwortete
 * derselbe Prozess weiter mit der Welt von VOR seiner eigenen Reparatur:
 *
 *   | Quelle               | gesamt | undokumentiert stumm | Urteil            |
 *   |----------------------|--------|----------------------|-------------------|
 *   | MCP (alter Prozess)  |   43   |         27           | „nicht dokumentiert"
 *   | CLI (frisch)         |   47   |          0           | „keine Lücke"      |
 *
 * Die 27 angeblich undokumentierten Ereignisse haben einen ganzen
 * Arbeitsdurchgang gekostet — sie waren kein Produktmangel, sondern ein Prozess,
 * der die Welt von vor seiner eigenen Reparatur meldete. Ein veraltetes
 * Ergebnis ist schlimmer als kein Ergebnis, weil es mit voller Überzeugung
 * kommt.
 *
 * ## Was diese Datei tut
 *
 * Beim Prozessstart (Modulauswertung) wird über den Inhalt von
 * `tools/audit-mcp/lib/*.mjs` + `tools/audit-mcp/server.mjs` ein SHA-256
 * gebildet und festgehalten. Dieser Fingerabdruck hängt an JEDER Antwort des
 * Servers (`werkzeugStand`) — und `audit_stand` stellt ihn dem Stand gegenüber,
 * der JETZT auf der Platte liegt.
 *
 * ## Fail-safe
 *
 * Eine unlesbare Datei ist eine ABWEICHUNG, kein Schweigen. Wer den Stand nicht
 * messen kann, darf nicht „gleich" melden: die Regel dieses MCP gilt auch hier —
 * im Zweifel der lautere Fehler.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Verzeichnis dieser Datei: `tools/audit-mcp/lib`. */
const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Das Serververzeichnis: `tools/audit-mcp`. */
export const MCP_DIR = path.resolve(LIB_DIR, '..');

/** Die Datei, die neben `lib/*.mjs` zum Fingerabdruck gehört. */
export const SERVER_DATEI = 'server.mjs';

/** Wann dieser Prozess seine Module geladen hat — der Fingerabdruck gilt ab hier. */
export const PROZESS_START = new Date().toISOString();

/** Die Meldung, die ein veralteter Prozess über sich selbst sagen muss. */
export const ALT_CODE_MELDUNG = 'Dieser Server läuft mit altem Code — Neustart nötig';

/**
 * Dieselbe Meldung ohne Umlaute. MCP-Clients und Konsolen sind nicht alle
 * UTF-8-sauber; eine Warnung, die nur als „läuft" ankommt, ist keine Warnung.
 * Beide Fassungen stehen im Ergebnis, damit die Suche nach der Warnung
 * unabhängig von der Kodierung greift.
 */
export const ALT_CODE_MELDUNG_ASCII = 'Dieser Server laeuft mit altem Code - Neustart noetig';

/** Wie ein veralteter Server neu gestartet wird. */
export const NEUSTART_HINWEIS = 'node tools/audit-mcp/server.mjs  ·  in Hermes: MCP-Verbindung trennen und neu aufbauen';

/**
 * Die zum Fingerabdruck gehörenden Dateien, RELATIV zu `tools/audit-mcp`,
 * sortiert. Die Liste ist bewusst keine feste Aufzählung: eine neu
 * hinzugekommene `lib/*.mjs` MUSS den Fingerabdruck ändern, sonst könnte ein
 * neues Modul unbemerkt am Stand vorbeirutschen.
 */
export function quellDateien() {
  const namen = [];
  try {
    for (const e of fs.readdirSync(LIB_DIR, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.mjs')) namen.push(`lib/${e.name}`);
    }
  } catch {
    // Nicht lesbares Verzeichnis: das meldet `messeStand()` unten als Lücke —
    // hier wird nichts geschluckt und nichts erfunden.
  }
  namen.push(SERVER_DATEI);
  return namen.sort();
}

/**
 * Misst den Code-Stand, wie er gerade auf der Platte liegt.
 *
 * @returns {{hash: string, prozessStart: string, gemessenAm: string,
 *            dateien: Record<string, {sha256: string, bytes: number}>,
 *            unlesbar: Array<{datei: string, fehler: string}>,
 *            anzahl: number, vollstaendig: boolean, geprueft: string[]}}
 */
export function messeStand() {
  const dateien = {};
  const unlesbar = [];
  const geprueft = quellDateien();

  for (const name of geprueft) {
    let inhalt;
    try {
      inhalt = fs.readFileSync(path.join(MCP_DIR, name));
    } catch (e) {
      // Fail-safe: keine stille Lücke. Wer eine Datei nicht lesen kann, kennt
      // den Stand NICHT — und „nicht gemessen" ist nie „unverändert".
      unlesbar.push({ datei: name, fehler: e.code ?? String(e.message) });
      continue;
    }
    dateien[name] = {
      sha256: crypto.createHash('sha256').update(inhalt).digest('hex'),
      bytes: inhalt.length,
    };
  }

  // Der Gesamtfingerabdruck besteht AUS den Einzelhashes (nicht aus der
  // Verkettung der Inhalte): so ist er unabhängig von der Reihenfolge stabil
  // und nennt im Vergleich die abweichende Datei beim Namen.
  const zeilen = geprueft.map((n) => `${n} ${dateien[n]?.sha256 ?? `UNLESBAR(${unlesbar.find((u) => u.datei === n)?.fehler ?? '?'})`}`);
  const hash = crypto.createHash('sha256').update(zeilen.join('\n')).digest('hex');

  return {
    hash,
    prozessStart: PROZESS_START,
    gemessenAm: new Date().toISOString(),
    dateien,
    unlesbar,
    anzahl: Object.keys(dateien).length,
    geprueft,
    vollstaendig: unlesbar.length === 0 && Object.keys(dateien).length === geprueft.length,
  };
}

/** Der Stand DIESES Prozesses — beim Start eingefroren. */
export const PROZESS_STAND = messeStand();

/**
 * Stellt den Prozessstand dem Plattenstand gegenüber.
 *
 * Eine Abweichung liegt vor, wenn sich eine Datei geändert hat, eine neue
 * dazukommt, eine verschwindet — ODER wenn eine Datei auf irgendeiner Seite
 * nicht lesbar war (fail-safe, siehe Kopf dieser Datei).
 */
export function vergleiche(prozess = PROZESS_STAND, platte = messeStand()) {
  const geaendert = [];
  const neuAufDerPlatte = [];
  const nurImProzess = [];

  const namen = [...new Set([...Object.keys(prozess.dateien), ...Object.keys(platte.dateien)])].sort();
  for (const n of namen) {
    const a = prozess.dateien[n];
    const b = platte.dateien[n];
    if (!a && b) neuAufDerPlatte.push(n);
    else if (a && !b) nurImProzess.push(n);
    else if (a.sha256 !== b.sha256) {
      geaendert.push({
        datei: n,
        prozessSha256: a.sha256,
        platteSha256: b.sha256,
        prozessBytes: a.bytes,
        platteBytes: b.bytes,
      });
    }
  }

  const unlesbar = [
    ...prozess.unlesbar.map((u) => ({ ...u, seite: 'Prozessstart' })),
    ...platte.unlesbar.map((u) => ({ ...u, seite: 'jetzt' })),
  ];

  const gruende = [];
  if (geaendert.length) gruende.push(`${geaendert.length} Datei(en) geändert: ${geaendert.map((g) => g.datei).join(', ')}`);
  if (neuAufDerPlatte.length) gruende.push(`${neuAufDerPlatte.length} neue Datei(en) auf der Platte: ${neuAufDerPlatte.join(', ')}`);
  if (nurImProzess.length) gruende.push(`${nurImProzess.length} Datei(en) nur im Prozess (gelöscht?): ${nurImProzess.join(', ')}`);
  if (unlesbar.length) gruende.push(`${unlesbar.length} unlesbare Datei(en) — der Stand ist damit NICHT messbar (fail-safe: gilt als Abweichung): ${unlesbar.map((u) => `${u.datei} (${u.seite}, ${u.fehler})`).join(', ')}`);

  const abweichung = gruende.length > 0;

  return {
    abweichung,
    gleich: !abweichung,
    prozess: {
      hash: prozess.hash,
      prozessStart: prozess.prozessStart,
      dateien: Object.keys(prozess.dateien).length,
      vollstaendig: prozess.unlesbar.length === 0,
    },
    platte: {
      hash: platte.hash,
      gemessenAm: platte.gemessenAm,
      dateien: Object.keys(platte.dateien).length,
      vollstaendig: platte.vollstaendig,
    },
    geaendert,
    neuAufDerPlatte,
    nurImProzess,
    unlesbar,
    gruende,
    meldung: abweichung
      ? `${ALT_CODE_MELDUNG} — ${gruende.join(' · ')}`
      : 'Dieser Server läuft mit dem Code, der JETZT auf der Platte liegt.',
    meldungAscii: abweichung
      ? `${ALT_CODE_MELDUNG_ASCII} - ${gruende.join(' · ')}`
      : 'Dieser Server laeuft mit dem Code, der JETZT auf der Platte liegt.',
  };
}

/**
 * Das Feld, das an JEDER Werkzeugantwort hängt.
 *
 * Es enthält bewusst nicht nur `{hash, prozessStart}`, sondern auch den
 * Vergleich mit der Platte: die Warnung muss in dem Ergebnis stehen, das
 * gerade gelesen wird — nicht in einem Werkzeug, das man erst aufrufen müsste.
 */
export function standFeld() {
  const v = vergleiche();
  return {
    hash: PROZESS_STAND.hash,
    prozessStart: PROZESS_STAND.prozessStart,
    dateienGehasht: Object.keys(PROZESS_STAND.dateien).length,
    platteHash: v.platte.hash,
    veraltet: v.abweichung,
    urteil: v.abweichung ? v.meldung : 'läuft mit dem Code, der jetzt auf der Platte liegt',
  };
}

/** Das Werkzeug `audit_stand`: die volle Gegenüberstellung, Datei für Datei. */
export function standBericht() {
  const v = vergleiche();
  return {
    abweichung: v.abweichung,
    meldung: v.meldung,
    meldungAscii: v.meldungAscii,
    prozess: v.prozess,
    platte: v.platte,
    geaendert: v.geaendert,
    neuAufDerPlatte: v.neuAufDerPlatte,
    nurImProzess: v.nurImProzess,
    unlesbar: v.unlesbar,
    gruende: v.gruende,
    fingerabdruckUeber: PROZESS_STAND.geprueft,
    regel: 'Ein laufender MCP-Server ist eine eingefrorene Sicht auf seinen eigenen Code. '
      + 'Jede Aussage über den Code wird gegen diesen Fingerabdruck geprüft — bei Abweichung gilt das Ergebnis als verdächtig.',
    neustart: NEUSTART_HINWEIS,
  };
}
