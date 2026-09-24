#!/usr/bin/env node
/**
 * Audit-MCP — ein MCP-Server für Tiefen-Audits von Spielen und Spielengines.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Das Projekt hat 20 Prüfwerkzeuge, eine Unit-Suite, einen E2E-Lauf und eine
 * Reihe wiederkehrender Befundklassen (tote Konstanten, stumme Ereignisse,
 * Anzeige gegen Simulation, Determinismus). Diese Werkzeuge sind verstreut:
 * Für einen Audit muss man wissen, welches Skript wofür da ist und welche
 * Falle bei welchem Schritt lauert.
 *
 * Dieses MCP bündelt BEIDES: die Messungen (dynamisch und statisch) UND den
 * Wissensstand der Skills als abfragbaren Prüfkatalog. Ein Audit ist damit
 * reproduzierbar statt erinnerungsabhängig.
 *
 * ## Aufruf
 *
 *     node tools/audit-mcp/server.mjs          # MCP über stdio
 *     node tools/audit-mcp/server.mjs --liste  # Werkzeuge auflisten (Diagnose)
 *     node tools/audit-mcp/server.mjs --ruf audit_status   # ein Werkzeug direkt
 *
 * Das MCP braucht KEINE Abhängigkeit: es spricht JSON-RPC 2.0 zeilenweise
 * über stdin/stdout, wie es die MCP-stdio-Transportspezifikation verlangt.
 */
import readline from 'node:readline';
import { ROOT, gitStatus, packageJson, run, rel } from './lib/repo.mjs';
import {
  toteDateien, unbenutzteExporte, unbenutzteKonstanten, doppelregeln, marker,
  nichtdeterminismus, zufallImProjekt, ereignisAbdeckung, pfadAufloesung, serverAutoritaet,
  secretScan, generierteDateien, zeilenStatistik, inventar,
} from './lib/statisch.mjs';
import {
  determinismus, spielverlauf, ballistik, waffenKennzahlen, klassenMatrix,
  terrainVielfalt, leistung,
} from './lib/dynamisch.mjs';
import { GATES, fahreGates, e2ePlan } from './lib/gates.mjs';
import { KATALOG, themen, quellen, filtereKatalog } from './lib/katalog.mjs';
import { schreibeBericht } from './lib/bericht.mjs';

const VERSION = '1.0.0';

/* ─────────────────────────── Werkzeuge ─────────────────────────── */

/** Kurzform für ein Text-Ergebnis. */
const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });

const WERKZEUGE = {
  audit_status: {
    beschreibung: 'Repozustand: Commit, Branch, ungetrackte Änderungen, Umfang (Zeilen), Node-Version, verfügbare Gates, letzte Commits.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      const pkg = packageJson();
      const stat = zeilenStatistik();
      const inv = inventar();
      return text({
        root: ROOT,
        node: process.version,
        git: gitStatus(),
        umfang: stat,
        inventar: inv,
        gates: Object.fromEntries(Object.entries(GATES).map(([k, v]) => [k, v.schuetzt])),
        npmSkripte: Object.keys(pkg.scripts ?? {}).length,
        toolVersion: VERSION,
      });
    },
  },

  audit_gates: {
    beschreibung: 'Fährt die Gate-Batterie (lint, validate, checks, build, test, perf, balance, smoke:fast, optional test:e2e) und liefert je Gate Exit-Code, Dauer und Kennzahlen.',
    schema: {
      type: 'object',
      properties: {
        welche: {
          description: '„schnell" (Sekunden), „mittel" (ohne test/test:e2e), „alle" oder eine Liste von Gate-Namen.',
          anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
        timeoutMs: { type: 'number', description: 'Zeitlimit je Gate in Millisekunden (Default 900000).' },
      },
      additionalProperties: false,
    },
    async ruf({ welche = 'schnell', timeoutMs = 900000 } = {}) {
      return text(fahreGates({ welche, timeoutMs }));
    },
  },

  audit_determinism: {
    beschreibung: 'Determinismus-Sonde: derselbe Seed zweimal → gleicher Zustandshash; anderer Seed → anderer Hash. Läuft über echte Züge mit Schüssen.',
    schema: {
      type: 'object',
      properties: {
        seeds: { type: 'array', items: { type: 'number' }, description: 'Seed-Folge (mindestens ein doppelter und ein anderer).' },
        zuge: { type: 'number', description: 'Züge je Lauf (Default 12).' },
      },
      additionalProperties: false,
    },
    async ruf({ seeds = [4242, 4242, 9999], zuge = 12 } = {}) {
      return text(determinismus({ seeds, zuge }));
    },
  },

  audit_flow: {
    beschreibung: 'Spielverlauf: Dauer, Züge, Schüsse, Rundenzahl, Sieger je Seed — das Spielgefühl als Zahl. Deckt die Lücke, die der Balance-Bericht (misst Waffen) nicht abdeckt.',
    schema: {
      type: 'object',
      properties: {
        seeds: { type: 'array', items: { type: 'number' } },
        teams: { type: 'number' },
        playersPerTeam: { type: 'number' },
        preset: { type: 'string' },
        zugeMax: { type: 'number' },
      },
      additionalProperties: false,
    },
    async ruf({ seeds = [101, 202, 303, 404, 505], teams = 2, playersPerTeam = 2, preset = 'hills', zugeMax = 400 } = {}) {
      return text(spielverlauf({ seeds, teams, playersPerTeam, preset, zugeMax }));
    },
  },

  audit_ballistics: {
    beschreibung: 'Ballistik-Messung: horizontale Wurfweite über Winkel × Kraft aus der ECHTEN Vorhersage (aimPreview), plus Geschoss-Lebensdauer in Ticks und Kartengröße.',
    schema: {
      type: 'object',
      properties: {
        winklerGrad: { type: 'array', items: { type: 'number' } },
        kraefte: { type: 'array', items: { type: 'number' } },
        preset: { type: 'string' },
      },
      additionalProperties: false,
    },
    async ruf({ winklerGrad = [20, 35, 45, 60, 75], kraefte = [30, 60, 100], preset = 'hills' } = {}) {
      return text(ballistik({ winklerGrad, kraefte, preset }));
    },
  },

  audit_weapons: {
    beschreibung: 'Waffenkatalog-Analyse: 150 Waffen — Verteilungen (Schaden, Radius, Abklingzeit, Reichweite, powerScore), Kategorien, Auffälligkeiten und Felder, die überall denselben Wert tragen.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      return text(waffenKennzahlen());
    },
  },

  audit_classes: {
    beschreibung: 'Klassen × Archetypen: die volle 9er-Matrix mit den WIRKSAMEN Achsen (Leben, Schaden, Abschuss, Beweglichkeit), die Spannweite je Achse und die inert deklarierten Felder.',
    schema: {
      type: 'object',
      properties: { figuren: { type: 'number' } },
      additionalProperties: false,
    },
    async ruf({ figuren = 6 } = {}) {
      return text(klassenMatrix({ figuren }));
    },
  },

  audit_terrain: {
    beschreibung: 'Terrain-Generator: Landanteil je Geländeform über viele Seeds — Mittelwert UND Streuung. Ein einzelner Balken hieße, der Generator liefert immer dasselbe.',
    schema: {
      type: 'object',
      properties: {
        anzahl: { type: 'number', description: 'Karten je Form (Default 24).' },
        breite: { type: 'number' },
        hoehe: { type: 'number' },
      },
      additionalProperties: false,
    },
    async ruf({ anzahl = 24, breite = 2560, hoehe = 1440 } = {}) {
      return text(terrainVielfalt({ anzahl, breite, hoehe }));
    },
  },

  audit_perf: {
    beschreibung: 'Tick-Kosten der Simulation: mittel/p95/p99/max in Millisekunden gegen das 60-Hz-Budget von 16,7 ms. Jeder Schritt einzeln gemessen.',
    schema: {
      type: 'object',
      properties: { zuge: { type: 'number' }, seed: { type: 'number' } },
      additionalProperties: false,
    },
    async ruf({ zuge = 300, seed = 20260910 } = {}) {
      return text(leistung({ zuge, seed }));
    },
  },

  audit_deadcode: {
    beschreibung: 'Statische Tiefenanalyse: Dateien ohne Importeur, unbenutzte Exporte, definierte-aber-nie-gelesene Konstanten, Doppelregeln (derselbe Name in 2+ Dateien), TODO-Marker, generierte Dateien.',
    schema: {
      type: 'object',
      properties: {
        umfang: { type: 'string', description: '„kurz" (nur Zählungen + Top-Liste) oder „voll".' },
      },
      additionalProperties: false,
    },
    async ruf({ umfang = 'kurz' } = {}) {
      const dateien = toteDateien();
      const exporte = unbenutzteExporte();
      const konstanten = unbenutzteKonstanten();
      const doppelt = doppelregeln();
      const mark = marker();
      const generiert = generierteDateien();
      const kurz = umfang !== 'voll';
      return text({
        toteDateien: kurz ? { anzahl: dateien.length, top: dateien.slice(0, 10) } : dateien,
        unbenutzteExporte: kurz ? { anzahl: exporte.length, top: exporte.slice(0, 15) } : exporte,
        unbenutzteKonstanten: kurz ? { anzahl: konstanten.length, liste: konstanten.slice(0, 15) } : konstanten,
        doppelregeln: kurz ? { anzahl: doppelt.length, liste: doppelt.slice(0, 10) } : doppelt,
        marker: { anzahl: mark.length, liste: mark },
        generierteDateien: generiert,
      });
    },
  },

  audit_events: {
    beschreibung: 'Ereignis-Abdeckung: Welche Ereignisse emittiert die Engine, und welcher Client-Zweig behandelt sie? Unterscheidet GEDECKT, DOKUMENTIERT-BEWUSST-STUMM (aus dem Wächter tests/event-coverage.test.js) und UNDOKUMENTIERT STUMM — nur die letzte Gruppe ist eine Lücke.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      const a = ereignisAbdeckung();
      return text({
        gesamt: a.gesamt,
        gedeckt: a.gedeckt.length,
        stummInsgesamt: a.stumm.length,
        stummDokumentiert: a.stummDokumentiert.map(s => s.ereignis),
        stummUndokumentiert: a.stummUndokumentiert,
        waechterVorhanden: a.waechterVorhanden,
        waechterListe: a.waechterListe,
        urteil: a.stummUndokumentiert.length === 0
          ? `Alle ${a.stumm.length} stummen Ereignisse sind im Wächter als bewusst stumm begründet — keine Lücke.`
          : `${a.stummUndokumentiert.length} stumme Ereignisse sind NICHT dokumentiert: ${a.stummUndokumentiert.map(s => s.ereignis).join(', ')}`,
      });
    },
  },

  audit_security: {
    beschreibung: 'Server-Autorität und Grenzen: Nimmt der Server die Identität aus dem Token? Wird ein Drahtwert auf typeof geprüft oder nur durch Number() geschickt? Gibt es direkt gelesene Kennungen?',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      const a = serverAutoritaet();
      const grenzen = run('grep', ['-rn', '--include=*.js', 'INPUT_LIMITS\\|maxPayloadBytes\\|MAX_', 'src/shared/', 'src/server/'], { timeoutMs: 30000 });
      return text({
        identitaetAusToken: a.tokenQuellen,
        numberCoercionsAufDrahtwerten: a.numberCoercions,
        direktGeleseneKennungen: a.direkteIds,
        urteil: a.numberCoercions.length === 0 && a.direkteIds.length === 0
          ? 'Keine Number()-Scheinprüfung und keine direkt gelesene Kennung gefunden.'
          : 'Fundstellen prüfen: Number() ist keine Typprüfung, und eine Kennung aus der Nachricht ist keine Identität.',
        grenzenAuszug: grenzen.out.split('\n').slice(0, 25),
      });
    },
  },

  audit_secrets: {
    beschreibung: 'Secret-Scan über die GETRACKTEN Dateien (git ls-files). Werte werden nie ausgegeben, nur Datei, Zeile und Muster. Die gitignorierte .env ist der vorgesehene Ort und kein Befund.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      const treffer = secretScan();
      return text({
        anzahl: treffer.length,
        treffer,
        urteil: treffer.length === 0
          ? 'Kein Secret in getrackten Dateien gefunden.'
          : `${treffer.length} Fundstelle(n) prüfen — sofort rotieren, wenn es ein echter Schlüssel ist.`,
      });
    },
  },

  audit_nondeterminism: {
    beschreibung: 'Zufall im Simulationspfad: `Math.random`/`Date.now`/`performance.now` im Engine-Ordner (Risiko, einzeln einzuordnen) UND `Math.random` außerhalb (dort meist legitim: Seed-Erzeugung, Anzeige).',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      return text({
        imSimulationspfad: nichtdeterminismus(),
        ausserhalbDesSimulationspfads: zufallImProjekt(),
        regel: 'Seed-Erzeugung und Anzeige sind legitim. Alles, was den Spielzustand bestimmt, muss aus dem Seed kommen.',
      });
    },
  },

  audit_paths: {
    beschreibung: 'Pfad-Auflösung: findet `new URL(...import.meta.url).pathname` (prozent-kodiert → jeder spawn mit diesem cwd scheitert mit ENOENT, sobald der Pfad ein Leerzeichen enthält) und zählt die korrekten `fileURLToPath`-Stellen dagegen.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      return text(pfadAufloesung());
    },
  },

  audit_checklist: {
    beschreibung: 'Der Prüfkatalog: jede Frage stammt aus einem belegten Befund eines Skill-Regelwerks und nennt Quelle, Methode und Belegpflicht. Filterbar nach Thema, Quelle oder Freitext.',
    schema: {
      type: 'object',
      properties: {
        thema: { type: 'string', description: 'z. B. messen, determinismus, code, sicherheit, ereignisse, tests, spielgefuehl, karte, vorgehen' },
        quelle: { type: 'string', description: 'z. B. code-grounded-ux-audit, projectarmageddon-verification, webapp-security-config-audit' },
        suche: { type: 'string' },
      },
      additionalProperties: false,
    },
    async ruf({ thema = null, quelle = null, suche = null } = {}) {
      const treffer = filtereKatalog({ thema, quelle, suche });
      return text({
        themen: themen(),
        quellen: quellen(),
        anzahl: treffer.length,
        katalog: treffer,
      });
    },
  },

  audit_e2e_plan: {
    beschreibung: 'Plan für den vollen E2E-Lauf (10 Minuten): Vorbereitung (pkill-Klammer-Trick, Port frei), Befehl, Nachbereitung, bekannte vorbestehende Fehler.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async ruf() {
      return text(e2ePlan());
    },
  },

  audit_all: {
    beschreibung: 'Fährt den GESAMTEN Tiefen-Audit (statisch + dynamisch + Gates) und liefert ein aggregiertes Ergebnis mit Ampel je Prüffeld. Für das Ergebnis als Datei: audit_bericht.',
    schema: {
      type: 'object',
      properties: {
        gates: { description: 'Gate-Auswahl (Default „schnell").', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        seeds: { type: 'array', items: { type: 'number' } },
        terrainProForm: { type: 'number' },
      },
      additionalProperties: false,
    },
    async ruf({ gates = 'schnell', seeds = [101, 202, 303], terrainProForm = 8 } = {}) {
      const ergebnis = {};
      ergebnis.stand = { git: gitStatus(), umfang: zeilenStatistik(), node: process.version };
      ergebnis.gates = fahreGates({ welche: gates });
      ergebnis.determinismus = determinismus({ seeds: [4242, 4242, 9999], zuge: 8 });
      ergebnis.spielverlauf = spielverlauf({ seeds, zugeMax: 300 });
      ergebnis.waffen = waffenKennzahlen();
      ergebnis.klassen = klassenMatrix({});
      ergebnis.terrain = terrainVielfalt({ anzahl: terrainProForm });
      ergebnis.perf = leistung({ zuge: 120 });
      ergebnis.toteDateien = toteDateien();
      ergebnis.unbenutzteKonstanten = unbenutzteKonstanten();
      ergebnis.doppelregeln = doppelregeln();
      ergebnis.marker = marker();
      ergebnis.ereignisse = (() => {
        const a = ereignisAbdeckung();
        return {
          gesamt: a.gesamt,
          gedeckt: a.gedeckt.length,
          stumm: a.stumm.length,
          stummDokumentiert: a.stummDokumentiert.map(s => s.ereignis),
          stummUndokumentiert: a.stummUndokumentiert.map(s => s.ereignis),
        };
      })();
      ergebnis.nichtdeterminismus = { imSimulationspfad: nichtdeterminismus(), ausserhalb: zufallImProjekt() };
      ergebnis.secrets = secretScan();
      ergebnis.generierteDateien = generierteDateien();
      ergebnis.checklist = { themen: themen(), quellen: quellen(), anzahl: KATALOG.length };
      ergebnis.ampel = ampel(ergebnis);
      return text(ergebnis);
    },
  },

  audit_bericht: {
    beschreibung: 'Fährt den Tiefen-Audit und SCHREIBT ihn als Markdown-Bericht mit Auswertung und TODO auf die Platte. Liefert den Pfad und die Kernzahlen zurück.',
    schema: {
      type: 'object',
      properties: {
        pfad: { type: 'string', description: 'Zielpfad relativ zum Projekt (Default docs/audit-tief.md).' },
        gates: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        seeds: { type: 'array', items: { type: 'number' } },
        terrainProForm: { type: 'number' },
      },
      additionalProperties: false,
    },
    async ruf({ pfad = 'docs/audit-tief.md', gates = 'schnell', seeds = [101, 202, 303, 404, 505], terrainProForm = 12 } = {}) {
      const daten = {
        stand: { git: gitStatus(), umfang: zeilenStatistik(), node: process.version },
        gates: fahreGates({ welche: gates }),
        determinismus: determinismus({ seeds: [4242, 4242, 9999], zuge: 10 }),
        spielverlauf: spielverlauf({ seeds, zugeMax: 400 }),
        ballistik: ballistik({}),
        waffen: waffenKennzahlen(),
        klassen: klassenMatrix({}),
        terrain: terrainVielfalt({ anzahl: terrainProForm }),
        perf: leistung({ zuge: 150 }),
        statisch: {
          toteDateien: toteDateien(),
          unbenutzteExporte: unbenutzteExporte(),
          unbenutzteKonstanten: unbenutzteKonstanten(),
          doppelregeln: doppelregeln(),
          marker: marker(),
          generierteDateien: generierteDateien(),
        },
        ereignisse: (() => {
          const a = ereignisAbdeckung();
          return {
            gesamt: a.gesamt,
            gedeckt: a.gedeckt.length,
            stumm: a.stumm,
            stummDokumentiert: a.stummDokumentiert,
            stummUndokumentiert: a.stummUndokumentiert,
            waechterVorhanden: a.waechterVorhanden,
          };
        })(),
        zufall: { imSimulationspfad: nichtdeterminismus(), ausserhalb: zufallImProjekt() },
        pfade: pfadAufloesung(),
        sicherheit: serverAutoritaet(),
        secrets: secretScan(),
        checklist: { themen: themen(), quellen: quellen(), anzahl: KATALOG.length },
      };
      daten.ampel = ampel(daten);
      const geschrieben = schreibeBericht(pfad, daten);
      return text({
        bericht: rel(geschrieben.pfad),
        zeilen: geschrieben.zeilen,
        ampel: daten.ampel,
        kernzahlen: {
          gatesBestanden: `${daten.gates.bestanden}/${daten.gates.gesamt}`,
          deterministisch: daten.determinismus.deterministisch,
          partienGemessen: daten.spielverlauf.parteien.length,
          rundenMittel: daten.spielverlauf.mittel.runden,
          toteDateien: daten.statisch.toteDateien.length,
          unbenutzteKonstanten: daten.statisch.unbenutzteKonstanten.length,
          doppelregeln: daten.statisch.doppelregeln.length,
          stummeEreignisse: daten.ereignisse.stumm.length,
          secrets: daten.secrets.length,
        },
        todo: geschrieben.todo,
      });
    },
  },
};

/**
 * Ampel je Prüffeld.
 *
 * Die Schwellen sind bewusst NICHT „0 oder rot": Ein stummes Ereignis kann
 * bewusst still sein, ein toter Export kann Absicht sein. Rot heißt hier
 * nur: „das ist belegt falsch" (Determinismus verletzt, Gate rot, Secret in
 * einer getrackten Datei). Alles andere ist gelb und braucht eine Entscheidung.
 */
export function ampel(d) {
  const felder = {};
  const setze = (name, zustand, begruendung) => { felder[name] = { zustand, begruendung }; };

  setze('gates', d.gates.fehlgeschlagen.length === 0 ? 'gruen' : 'rot',
    d.gates.fehlgeschlagen.length === 0 ? 'alle gefahrenen Gates bestanden' : `rot: ${d.gates.fehlgeschlagen.join(', ')}`);

  setze('determinismus', d.determinismus.deterministisch && d.determinismus.seedWirkt ? 'gruen' : 'rot', d.determinismus.urteil);

  const undokumentiert = d.ereignisse.stummUndokumentiert?.length ?? 0;
  const stummGesamt = d.ereignisse.stumm?.length ?? 0;
  setze('ereignisse', undokumentiert === 0 ? 'gruen' : 'gelb',
    undokumentiert === 0
      ? `${stummGesamt} stumme Ereignisse — alle im Wächter als bewusst stumm begründet`
      : `${undokumentiert} UNDOKUMENTIERT stumme Ereignisse: ${d.ereignisse.stummUndokumentiert.map(s => s.ereignis ?? s).join(', ')}`);

  setze('toteDateien', d.statisch.toteDateien.length === 0 ? 'gruen' : 'gelb', `${d.statisch.toteDateien.length} Dateien ohne Importeur`);
  setze('unbenutzteKonstanten', d.statisch.unbenutzteKonstanten.length === 0 ? 'gruen' : 'gelb', `${d.statisch.unbenutzteKonstanten.length} definiert, nie gelesen`);
  setze('pfade', d.pfade.falsch.length === 0 ? 'gruen' : 'rot', d.pfade.urteil);
  setze('doppelregeln', d.statisch.doppelregeln.length === 0 ? 'gruen' : 'gelb', `${d.statisch.doppelregeln.length} Bezeichner in 2+ Dateien definiert`);
  setze('marker', d.statisch.marker.length === 0 ? 'gruen' : 'gelb', `${d.statisch.marker.length} TODO/FIXME im Quelltext`);
  setze('zufall', d.zufall.imSimulationspfad.length === 0 ? 'gruen' : 'gelb', `${d.zufall.imSimulationspfad.length} Zeit-/Zufallstreffer im Simulationspfad`);
  setze('secrets', d.secrets.length === 0 ? 'gruen' : 'rot', `${d.secrets.length} Fundstellen in getrackten Dateien`);
  setze('perf', d.perf.ticksUeberBudget === 0 ? 'gruen' : 'gelb', d.perf.urteil);

  return {
    felder,
    rot: Object.entries(felder).filter(([, v]) => v.zustand === 'rot').map(([k]) => k),
    gelb: Object.entries(felder).filter(([, v]) => v.zustand === 'gelb').map(([k]) => k),
    gruen: Object.entries(felder).filter(([, v]) => v.zustand === 'gruen').map(([k]) => k),
  };
}

/* ─────────────────────── MCP-Protokoll (stdio) ─────────────────────── */

const WERKZEUG_LISTE = Object.entries(WERKZEUGE).map(([name, w]) => ({
  name,
  description: w.beschreibung,
  inputSchema: w.schema,
}));

const PROMPTS = [
  {
    name: 'tiefenaudit',
    description: 'Fährt einen vollständigen Tiefen-Audit des Spiels/der Engine und schreibt den Bericht.',
    arguments: [{ name: 'pfad', description: 'Zielpfad des Berichts', required: false }],
  },
  {
    name: 'befund-pruefen',
    description: 'Prüft einen einzelnen Befund nach der Widerlegungsregel: Reproduktion, Messung, Fundstelle, Gegenprobe.',
    arguments: [
      { name: 'befund', description: 'Die Behauptung, die geprüft werden soll', required: true },
    ],
  },
];

function antworte(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fehler(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

async function behandle(nachricht) {
  const { id, method, params } = nachricht;

  switch (method) {
    case 'initialize':
      return antworte(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: 'audit-mcp', version: VERSION },
        instructions:
          'Tiefen-Audit für Spiele und Spielengines. Erst `audit_status`, dann `audit_all` für den Überblick, '
          + 'danach die Einzelwerkzeuge für die Tiefe, und `audit_bericht` für die Datei. '
          + 'Regel dieses Servers: jeder Befund braucht eine Fundstelle (datei:zeile) ODER eine Messung — '
          + 'und jede Zahl muss im selben Zugriff entstanden sein, in dem sie gelesen wird.',
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'ping':
      return antworte(id, {});

    case 'tools/list':
      return antworte(id, { tools: WERKZEUG_LISTE });

    case 'tools/call': {
      const name = params?.name;
      const werkzeug = WERKZEUGE[name];
      if (!werkzeug) return fehler(id, -32602, `Unbekanntes Werkzeug: ${name}`);
      try {
        const ergebnis = await werkzeug.ruf(params?.arguments ?? {});
        return antworte(id, ergebnis);
      } catch (e) {
        return antworte(id, {
          content: [{ type: 'text', text: `Fehler in ${name}: ${e.message}` }],
          isError: true,
        });
      }
    }

    case 'prompts/list':
      return antworte(id, { prompts: PROMPTS });

    case 'prompts/get': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (name === 'tiefenaudit') {
        const ziel = args.pfad || 'docs/audit-tief.md';
        return antworte(id, {
          description: 'Tiefen-Audit fahren und Bericht schreiben',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Fahre einen vollständigen Tiefen-Audit.\n\n1. audit_status — Zustand übernehmen\n2. audit_gates mit welche="schnell"\n3. audit_all mit gates="schnell"\n4. Für jedes gelbe/rote Feld die Tiefe: audit_deadcode, audit_events, audit_security, audit_secrets, audit_nondeterminism, audit_determinism, audit_flow, audit_ballistics, audit_perf\n5. audit_bericht mit pfad="${ziel}"\n\nRegel: jeder Befund bekommt datei:zeile ODER eine Messzahl. Design-Entscheidungen werden NICHT getroffen, sondern als „Offen — Design-Entscheidung" aufgeführt.`,
            },
          }],
        });
      }
      if (name === 'befund-pruefen') {
        return antworte(id, {
          description: 'Einzelnen Befund nach der Widerlegungsregel prüfen',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Prüfe diesen Befund als WIDERLEGUNGSVERSUCH, nicht als Bestätigung:\n\n„${args.befund ?? ''}"\n\nVorgehen:\n1. Reproduzieren und die Zahlen notieren (Tick, Wert, Prozent).\n2. Die Stelle lesen, die den Wert BENUTZT — nicht nur die, die ihn definiert.\n3. Gegenprobe: Gibt es einen Fall, in dem die Behauptung NICHT gilt?\n4. Ausgang nennen: bestätigt / teilweise / widerlegt — mit Beleg (datei:zeile oder Messung).\n\nNutz dafür audit_checklist (thema="vorgehen") für die Regeln und die passenden Messwerkzeuge.`,
            },
          }],
        });
      }
      return fehler(id, -32602, `Unbekannter Prompt: ${name}`);
    }

    case 'resources/list':
      return antworte(id, { resources: [] });

    default:
      if (id !== undefined) fehler(id, -32601, `Methode nicht unterstützt: ${method}`);
  }
}

/* ─────────────────────────── Einstieg ─────────────────────────── */

const argumente = process.argv.slice(2);

if (argumente.includes('--liste')) {
  process.stdout.write(`${JSON.stringify({ werkzeuge: WERKZEUG_LISTE.map(w => w.name), prompts: PROMPTS.map(p => p.name), katalogEintraege: KATALOG.length, gates: Object.keys(GATES) }, null, 2)}\n`);
  process.exit(0);
}

const rufIndex = argumente.indexOf('--ruf');
if (rufIndex >= 0) {
  const name = argumente[rufIndex + 1];
  const werkzeug = WERKZEUGE[name];
  if (!werkzeug) {
    process.stderr.write(`Unbekanntes Werkzeug: ${name}\n`);
    process.exit(2);
  }
  const argsJson = argumente[rufIndex + 2];
  werkzeug.ruf(argsJson ? JSON.parse(argsJson) : {})
    .then(r => {
      process.stdout.write(`${r.content[0].text}\n`);
      process.exit(0);
    })
    .catch(e => {
      process.stderr.write(`Fehler: ${e.message}\n`);
      process.exit(1);
    });
} else {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (zeile) => {
    const getrimmt = zeile.trim();
    if (!getrimmt) return;
    let nachricht;
    try {
      nachricht = JSON.parse(getrimmt);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse-Fehler' } })}\n`);
      return;
    }
    behandle(nachricht).catch(e => {
      if (nachricht.id !== undefined) fehler(nachricht.id, -32603, `Interner Fehler: ${e.message}`);
    });
  });
  rl.on('close', () => process.exit(0));
}
