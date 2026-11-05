/**
 * Tests: Ablehnungsbegründungen im HUD tragen einen Vorrangton (N-44).
 *
 * ## Der Befund (docs/hud-vorrang.md §3, §7.1)
 *
 * Das HUD-Protokoll schützt Meldungen nach ihrem TON (`protokollKlasse` in
 * `src/client/hud.js`): `danger`, `accent`, `good` und `notice` haben ein
 * eigenes Budget, alles andere — auch der Vorgabeton `neutral` — ist
 * Anzeigerauschen und wird von ~34 `landed`-Meldungen je Sekunde in wenigen
 * Sekunden verdrängt. Fünf Stellen in `src/client/main.js` schrieben ihre
 * Ablehnungsbegründung mit dem Vorgabeton; der Spieler drückt etwas, es
 * passiert nichts, und die Begründung war weg, bevor er sie las.
 *
 * Die Stellen setzen inzwischen `notice`. Diese Datei hält fest, dass es so
 * bleibt — als Quelltext-Wächter über die Dateien, die Eingaben des Spielers
 * ablehnen (`main.js` und die von dort eingebundene `seilSteuerung.js`).
 *
 * ## Was der Wächter prüft
 *
 * 1. **Benannte Stellen.** Die fünf Meldungen aus docs/hud-vorrang.md §3
 *    stehen mit einem Vorrangton im Quelltext. Fehlt eine (umformuliert,
 *    entfernt), schlägt der Test an — dann gehört die Liste bewusst
 *    nachgezogen, nicht stillschweigend verkürzt.
 * 2. **Alle Ablehnungen.** Jeder `log(`-Aufruf, dessen Text eine Ablehnung ist
 *    (Muster unten, oder die Begründung kommt aus `errors`), trägt einen Ton
 *    der Klasse `vorrang`. Ein fehlender Ton zählt als Vorgabeton `neutral`.
 * 3. **Selbstprüfung.** Ein gekaperter Text mit Ablehnung ohne Ton, mit
 *    `neutral` und mit einem fremden Ton schlägt an — ein Wächter, der nie
 *    anschlägt, pinnt nichts.
 *
 * Die Textmuster sind KEINE Regelquelle des Spiels (docs/hud-vorrang.md §3,
 * „Warum keine Texterkennung"): Der Ton steht weiterhin beim Aufrufer. Das
 * Muster sucht hier nur Aufrufe, die der Absender hätte kennzeichnen müssen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { protokollKlasse } from '../src/client/hud.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `sitzung.js` kam mit RT-1 (Fortsetzen nach Neuladen) dazu: Dort steht seit der
// Zerlegung von `main.js` eine Ablehnung („Fortsetzen nicht möglich"). Der
// Wächter muss die Datei mitlesen, sonst prüft er die Stelle nicht mehr.
const DATEIEN = ['src/client/main.js', 'src/client/seilSteuerung.js', 'src/client/sitzung.js'];

/** Die fünf Stellen aus docs/hud-vorrang.md §3 — Textausdruck wörtlich wie im Quelltext. */
const BENANNTE_STELLEN = [
  "'Nur am eigenen Zug kann gesprungen werden'",
  "ergebnis.errors.join(', ')",
  "'Nur am eigenen Zug kann eine Waffe abgeworfen werden'",
  "'Abwerfen ist im Replay nicht möglich'",
  "'Nur am eigenen Zug kann die Waffe gewechselt werden'",
];

/** Woran eine Ablehnung zu erkennen ist (Textausdruck des ersten Arguments). */
const ABLEHNUNG = /Nur am eigenen Zug|Nicht am Zug|nicht möglich|verweigert|abgelehnt|nicht gesendet|gibt es in dieser Partie nicht|\berrors\b/;

/**
 * Liest die Argumente eines Aufrufs ab der öffnenden Klammer.
 *
 * Kennt Zeichenketten (`'`, `"`), Vorlagen mit `${…}` und verschachtelte
 * Klammern — genug für die Aufrufe im Client, ohne einen Parser einzubinden.
 *
 * @param {string} quelle
 * @param {number} start - Index der öffnenden Klammer
 * @returns {{ args: string[], ende: number }}
 */
function leseArgumente(quelle, start) {
  const args = [];
  let aktuell = '';
  let tiefe = 0;
  /** Stapel offener Kontexte: '(' / '[' / '{' / '`' / '${'. */
  const stapel = [];
  for (let i = start; i < quelle.length; i += 1) {
    const z = quelle[i];
    const oben = stapel[stapel.length - 1];
    if (oben === '`') {
      aktuell += z;
      if (z === '\\') { aktuell += quelle[i + 1]; i += 1; continue; }
      if (z === '`') stapel.pop();
      else if (z === '$' && quelle[i + 1] === '{') { aktuell += '{'; i += 1; stapel.push('${'); }
      continue;
    }
    if (z === "'" || z === '"') {
      let j = i + 1;
      while (j < quelle.length && quelle[j] !== z) j += quelle[j] === '\\' ? 2 : 1;
      aktuell += quelle.slice(i, j + 1);
      i = j;
      continue;
    }
    if (z === '`') { stapel.push('`'); aktuell += z; continue; }
    if (z === '(' || z === '[' || z === '{') {
      stapel.push(z);
      tiefe += 1;
      if (tiefe === 1) continue;
      aktuell += z;
      continue;
    }
    if (z === '}' && oben === '${') {
      // Ende eines Vorlagenausdrucks: zurück in die Vorlage, keine Klammertiefe.
      stapel.pop();
      aktuell += z;
      continue;
    }
    if (z === ')' || z === ']' || z === '}') {
      stapel.pop();
      tiefe -= 1;
      if (tiefe === 0) {
        if (aktuell.trim()) args.push(aktuell.trim());
        return { args, ende: i };
      }
      aktuell += z;
      continue;
    }
    if (z === ',' && tiefe === 1 && oben === '(') {
      args.push(aktuell.trim());
      aktuell = '';
      continue;
    }
    aktuell += z;
  }
  throw new Error(`Aufruf ab Index ${start} ist nicht geschlossen`);
}

/**
 * Alle HUD-Protokollaufrufe eines Quelltexts mit Text- und Tonausdruck.
 *
 * Erfasst `hud.log(`, `hud?.log(` und den Rückweg der Seilsteuerung
 * (`#k.log(`); `console.log` gehört nicht dazu.
 *
 * @param {string} quelle
 * @returns {{ zeile: number, text: string, ton: string|undefined }[]}
 */
function findeProtokollAufrufe(quelle) {
  const aufrufe = [];
  const muster = /(?:\bhud\??\.log|#k\.log)\(/g;
  for (let treffer = muster.exec(quelle); treffer; treffer = muster.exec(quelle)) {
    const klammer = treffer.index + treffer[0].length - 1;
    const { args } = leseArgumente(quelle, klammer);
    const zeile = quelle.slice(0, treffer.index).split('\n').length;
    aufrufe.push({ zeile, text: args[0] ?? '', ton: args[1] });
  }
  return aufrufe;
}

/** Der Ton als Wert, wenn er eine Zeichenkette ist; sonst `null` (Ausdruck). */
function tonWert(ton) {
  if (ton === undefined) return undefined;
  const m = /^(['"])([^'"]*)\1$/.exec(ton);
  return m ? m[2] : null;
}

/**
 * Ablehnungen, die ohne Vorrangton geschrieben werden.
 * @param {string} quelle
 * @returns {string[]} Verstöße als „Zeile N: Text (Ton)"
 */
function findeUngeschuetzteAblehnungen(quelle) {
  return findeProtokollAufrufe(quelle)
    .filter(aufruf => ABLEHNUNG.test(aufruf.text))
    .filter(aufruf => {
      const ton = tonWert(aufruf.ton);
      // Ein berechneter Ton (Ausdruck) ist hier nicht entscheidbar — er wäre ein Verstoß gegen die Lesbarkeit.
      if (ton === null) return true;
      return protokollKlasse(ton ?? 'neutral') !== 'vorrang';
    })
    .map(aufruf => `Zeile ${aufruf.zeile}: ${aufruf.text} (${aufruf.ton ?? 'Vorgabeton'})`);
}

const quellen = DATEIEN.map(datei => ({ datei, quelle: fs.readFileSync(path.join(WURZEL, datei), 'utf8') }));

test('Die fünf benannten Ablehnungen in main.js tragen einen Vorrangton', () => {
  const aufrufe = findeProtokollAufrufe(quellen[0].quelle);
  for (const text of BENANNTE_STELLEN) {
    const treffer = aufrufe.filter(aufruf => aufruf.text === text);
    assert.ok(treffer.length > 0,
      `Die Ablehnung ${text} steht nicht mehr in main.js — umformuliert? Dann BENANNTE_STELLEN `
      + 'und docs/hud-vorrang.md §3 bewusst nachziehen.');
    for (const aufruf of treffer) {
      assert.equal(protokollKlasse(tonWert(aufruf.ton) ?? 'neutral'), 'vorrang',
        `main.js Zeile ${aufruf.zeile}: ${text} wird mit ${aufruf.ton ?? 'dem Vorgabeton'} geschrieben`);
    }
  }
});

test('Keine Ablehnung wird mit dem Vorgabeton ins HUD geschrieben', () => {
  for (const { datei, quelle } of quellen) {
    assert.deepEqual(findeUngeschuetzteAblehnungen(quelle), [],
      `${datei}: Eine Ablehnungsbegründung landet im Rauschbudget und wird von Anzeigemeldungen `
      + "verdrängt. Ton setzen: `hud.log(text, 'notice')` (siehe docs/hud-vorrang.md §3).");
  }
});

test('Der Wächter sieht genug Ablehnungen — sonst prüfte er nichts', () => {
  // Fünf benannte Stellen in main.js, dazu die Seil-Ablehnungen in seilSteuerung.js.
  const anzahl = quellen.map(({ quelle }) =>
    findeProtokollAufrufe(quelle).filter(aufruf => ABLEHNUNG.test(aufruf.text)).length);
  assert.ok(anzahl[0] >= BENANNTE_STELLEN.length, `main.js: nur ${anzahl[0]} Ablehnungen erkannt`);
  assert.ok(anzahl[1] >= 3, `seilSteuerung.js: nur ${anzahl[1]} Ablehnungen erkannt`);
});

test('Der Wächter greift wirklich — gekaperte Ablehnungen schlagen an', () => {
  const gekapert = [
    "    this.hud.log('Nur am eigenen Zug kann gesprungen werden');",
    "    this.hud.log(ergebnis.errors.join(', '), 'neutral');",
    "    this.#k.log(`Abwurf verweigert: ${ergebnis.errors?.[0] ?? 'unbekannt'}`, 'warn');",
    "    this.hud?.log('Abwerfen ist im Replay nicht möglich', art);",
    "    this.hud.log('Nur am eigenen Zug kann die Waffe gewechselt werden', 'notice');",
    "    this.hud.log(`Schuss verweigert: ${result.errors[0] ?? 'unbekannt'}`, 'danger');",
    "    this.hud.log('Sprung', 'accent');",
    "    console.log('nicht möglich');",
  ].join('\n');

  const verstoesse = findeUngeschuetzteAblehnungen(gekapert);
  assert.deepEqual(verstoesse.map(v => v.split(':')[0]), ['Zeile 1', 'Zeile 2', 'Zeile 3', 'Zeile 4'],
    `Erwartet: Vorgabeton, neutral, fremder Ton und berechneter Ton — gefunden: ${JSON.stringify(verstoesse)}`);
});

test('Der Argumentleser trennt Text und Ton auch bei Vorlagen und Klammern', () => {
  const aufrufe = findeProtokollAufrufe(
    "x.hud.log(`a, ${f(b, [c, d])} e`, 'notice'); y.hud?.log(g(h, i)); this.#k.log('j, k', \"good\");",
  );
  assert.deepEqual(aufrufe.map(({ text, ton }) => [text, ton]), [
    ['`a, ${f(b, [c, d])} e`', "'notice'"],
    ['g(h, i)', undefined],
    ["'j, k'", '"good"'],
  ]);
});
