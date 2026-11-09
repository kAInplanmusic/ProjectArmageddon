/**
 * Redaktions- und Anzeigeprüfung der Figuren (Audit `docs/fraktions-optik-audit-2026-11-08.md`).
 *
 * Diese Datei hält die sechs Punkte fest, die als Text- und Anzeigearbeit
 * umgesetzt wurden — und zwar so, dass sie bei der nächsten Änderung anschlagen:
 *
 *  - **A07** Doppelnamen und Arbeitsnamen: Anzeigenamen sind im ganzen Katalog
 *    eindeutig, enthalten keinen Arbeitsnamen („Unit A“), und jede Umbenennung
 *    steht mit ihrem alten Namen in `UMBENANNT`. Kennung und Bilddatei der
 *    umbenannten Figuren sind unverändert — Replays bleiben gültig.
 *  - **A08** Geschichte gegen Mechanik: Der Hinweis, dass nur Klasse und
 *    Ausrüstung wirken, steht an EINER Stelle (`CHARAKTER_PROFIL_HINWEIS`) und
 *    wird angezeigt. Stärken/Schwächen behaupten keine Fähigkeit im
 *    Möglichkeits-Modus, und der Motor kennt keine Figur beim Namen.
 *  - **A09** Fraktionsfarbe gegen Teamfarbe: Die beiden Rollen sind getrennte
 *    Funktionen; das Namensschild trägt die Eigentümer-Marke, die HUD-Karte
 *    Rahmen (Team) und Emblem (Fraktion).
 *  - **A11** Embleme/Banner in Auswahl, Ladebild und Ergebnis; Emblem bei 24 px
 *    noch lesbar (Strichstärke, nicht Augenmaß).
 *  - **A13** Namen ohne doppelten Rang, Eigenheiten bleiben im Text.
 *  - **A16** Klassenzeichen (Klinge, Projektilvisier, Ritualzeichen) je Klasse
 *    gleich, unabhängig von der Fraktion und ohne Farbe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHARACTERS, FACTIONS, NAMING_CONFLICTS, UMBENANNT, CHARAKTER_PROFIL_HINWEIS,
  getCharacter, classOf,
} from '../src/shared/config/factions.js';
import { TEAM_COLORS } from '../src/engine/match.js';
import {
  teamFarbe, teamMarke, fraktionsMerkmale, FARBTRENNUNG_HINWEIS, NEUTRALE_FARBE,
} from '../src/client/teamFarben.js';
import { KLASSEN_ZEICHEN, zeichenFuerKlasse, klassenSvg } from '../src/client/klassenZeichen.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const ZEICHEN_DIR = path.join(ROOT, 'src', 'client', 'assets', 'fraktionszeichen');

const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const kaderQuelle = lies('src/client/kaderansicht.js');
const karteQuelle = lies('src/client/figurenKarte.js');
const figurenQuelle = lies('src/client/figuren.js');
const mainQuelle = lies('src/client/main.js');
const rendererQuelle = lies('src/client/renderer.js');
const anzeigeQuelle = lies('src/client/fraktionsAnzeige.js');
const ladebildQuelle = lies('src/client/ladebild.js');
const indexQuelle = lies('index.html');
const fraktionenCss = lies('src/client/styles/fraktionen.css');

/** Text, der zu einer Figur angezeigt wird (ohne Kennung und Dateinamen). */
function anzeigeText(c) {
  return [c.bio, c.superWeapon?.name, c.superWeapon?.description, ...c.strengths, ...c.weaknesses]
    .filter(Boolean).join(' ');
}

// ============================================================== A07 Anzeigenamen

test('A07: Kein Anzeigename enthält einen Arbeitsnamen', () => {
  /*
   * „Unit A“/„Unit B“ waren Arbeitsnamen aus der Bildproduktion. Sie sagen
   * nichts über die Figur und machen zwei Figuren zu Nummern. Die Kennung darf
   * das Wort weiter tragen (Replay-Kompatibilität), der Anzeigename nicht.
   */
  for (const c of CHARACTERS) {
    assert.doesNotMatch(c.name, /\(\s*Unit\s*[A-Z0-9]+\s*\)/i, `${c.id}: Arbeitsname im Anzeigenamen`);
    assert.doesNotMatch(c.name, /\bUnit\b/i, `${c.id}: „Unit“ im Anzeigenamen`);
    assert.doesNotMatch(c.name, /[()]/, `${c.id}: Klammer im Anzeigenamen deutet auf einen Arbeitsnamen`);
  }
});

test('A07: Anzeigenamen sind im gesamten Katalog eindeutig', () => {
  /*
   * Vorher stand „Nullpointer Exception“ zweimal im Katalog (Pixel und
   * Datenkult). Der Test prüft GLOBAL, nicht je Fraktion — die Dublette war
   * genau zwischen zwei Fraktionen.
   */
  const namen = CHARACTERS.map(c => c.name);
  const doppelt = [...new Set(namen.filter((n, i) => namen.indexOf(n) !== i))];
  assert.deepEqual(doppelt, [], `Doppelte Anzeigenamen: ${doppelt.join(', ')}`);
  assert.deepEqual([...NAMING_CONFLICTS], [],
    'NAMING_CONFLICTS ist leer — ein Eintrag wäre jetzt eine falsche Behauptung');

  // Der Datenkult behält seinen fachlich passenden Namen; die Pixel-Figur nicht.
  assert.equal(getCharacter('nullpointer-exception-cult').name, 'Nullpointer-Kultist');
  assert.notEqual(getCharacter('nullpointer-exception').name, 'Nullpointer-Kultist');
  assert.notEqual(getCharacter('nullpointer-exception').name, 'Nullpointer Exception');
});

test('A07/A13: Umbenennungen sind erfasst, Kennungen und Bilddateien stabil', () => {
  /*
   * Der eigentliche Vertrag des Audits: „IDs/Dateinamen stabil lassen, nur
   * Anzeigenamen ändern.“ Die Tabelle unten ist der Nachweis — sie steht
   * ausdrücklich hier und nicht abgeleitet, damit ein versehentliches
   * Mitwandern einer Kennung auffällt.
   */
  const erwartet = {
    'nullpointer-exception': '00_nullpointer-exception.png',
    'pyrofox-a': '01_pyrofox-a.png',
    'pyrofox-b': '02_pyrofox-b.png',
    'arcershorn-a': '10_arcershorn-a.png',
    'pyrowand-a': '11_pyrowand-a.png',
    shieldmon: '12_shieldmon.png',
    'arcanus-a': '21_arcanus-a.png',
    'arcanus-b': '22_arcanus-b.png',
    pikamon: '00_pikamon.png',
    'berzerker-fang': '01_berzerker-fang.png',
  };

  for (const [id, sprite] of Object.entries(erwartet)) {
    const c = getCharacter(id);
    assert.ok(c, `${id}: Figur fehlt`);
    assert.equal(c.sprite, sprite, `${id}: Bilddatei hat sich geändert`);
    const eintrag = UMBENANNT[id];
    assert.ok(eintrag, `${id}: Umbenennung nicht in UMBENANNT erfasst`);
    assert.notEqual(c.name, eintrag.vorher, `${id}: Name wurde nicht geändert`);
    assert.ok(eintrag.grund?.length >= 10, `${id}: kein nachvollziehbarer Grund`);
  }

  // Jeder abweichende Anzeigename MUSS erfasst sein — sonst schleicht sich eine
  // stille Umbenennung ein, die niemand mehr zuordnen kann.
  for (const c of CHARACTERS) {
    const rumpf = c.sprite.replace(/^\d\d_/, '').replace(/\.png$/, '');
    const ausName = c.name.toLowerCase()
      .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const passt = rumpf === ausName
      || ausName.startsWith(rumpf.split('-')[0])
      || rumpf.startsWith(ausName.split('-')[0]);
    assert.ok(passt || UMBENANNT[c.id],
      `${c.id}: Anzeigename „${c.name}“ weicht vom Bildnamen ab, ohne Eintrag in UMBENANNT`);
  }

  for (const id of Object.keys(UMBENANNT)) {
    assert.ok(getCharacter(id), `UMBENANNT nennt die unbekannte Kennung ${id}`);
  }
});

// ==================================================== A08 Geschichte und Mechanik

test('A08: Der Hinweis trennt Geschichte von Spielmechanik und wird angezeigt', () => {
  assert.ok(CHARAKTER_PROFIL_HINWEIS.length >= 120, 'Hinweis zu knapp');
  assert.match(CHARAKTER_PROFIL_HINWEIS, /Klasse/, 'der Hinweis nennt die wirksame Klasse nicht');
  assert.match(CHARAKTER_PROFIL_HINWEIS, /Ausrüstung/, 'der Hinweis nennt die Ausrüstung nicht');
  assert.match(CHARAKTER_PROFIL_HINWEIS, /nicht simuliert/,
    'der Hinweis muss sagen, dass individuelle Fähigkeiten nicht simuliert sind');

  // Anzeige: derselbe Satz aus der Config, keine zweite Formulierung im Client.
  assert.match(kaderQuelle, /CHARAKTER_PROFIL_HINWEIS/,
    'die Kaderansicht setzt den Hinweis nicht aus der Config');
  assert.match(kaderQuelle, /Erzähltes Profil \(Geschichte, keine Spielwerte\)/,
    'der Profilblock ist nicht als Geschichte gekennzeichnet');
  assert.doesNotMatch(kaderQuelle, /textContent = `Charakterprofil:/,
    'der alte Regelkasten-Titel steht noch in der Anzeige');
});

test('A08: Stärken und Schwächen behaupten keine Fähigkeit im Möglichkeits-Modus', () => {
  /*
   * „Kann sich kurz unsichtbar machen“ liest sich wie eine Spielfähigkeit.
   * Erzählt wird stattdessen, was geschieht oder was die Fraktion behauptet.
   * Der Test verbietet die beiden Muster, die genau diese Behauptung tragen.
   */
  for (const c of CHARACTERS) {
    for (const s of [...c.strengths, ...c.weaknesses]) {
      assert.doesNotMatch(s, /\bKann\b/, `${c.id}: Fähigkeitsbehauptung „${s}“`);
      assert.doesNotMatch(s, /^Ignoriert\b/, `${c.id}: Regelbehauptung „${s}“`);
    }
  }
});

test('A08: Der Motor kennt keine Figur beim Namen', () => {
  /*
   * Die belastbare Aussage hinter „individuelle Fähigkeiten sind nicht
   * simuliert“: In der Simulation kommt keine Figurenkennung vor. Wäre eine
   * dort, gäbe es eine Sonderregel pro Figur — und der Hinweis wäre falsch.
   */
  const dateien = [];
  const sammle = (verzeichnis) => {
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const p = path.join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) sammle(p);
      else if (/\.(js|mjs)$/.test(eintrag.name)) dateien.push(p);
    }
  };
  sammle(path.join(ROOT, 'src', 'engine'));

  assert.ok(dateien.length > 0, 'keine Engine-Dateien gefunden');
  const ids = CHARACTERS.map(c => c.id);
  for (const datei of dateien) {
    const quelle = fs.readFileSync(datei, 'utf8');
    for (const id of ids) {
      assert.ok(!quelle.includes(`'${id}'`) && !quelle.includes(`"${id}"`),
        `${path.relative(ROOT, datei)} nennt die Figur ${id} — dann gäbe es eine Sonderregel`);
    }
  }
});

// ============================================ A09 Fraktionsfarbe gegen Teamfarbe

test('A09: Teamfarbe und Fraktionsfarbe sind getrennte Rollen', () => {
  // Teamfarbe kommt aus derselben Tabelle wie im Renderer — keine zweite Quelle.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(teamFarbe(i), TEAM_COLORS[i % TEAM_COLORS.length], `Team ${i}: falsche Teamfarbe`);
  }
  assert.equal(teamFarbe(null), NEUTRALE_FARBE);
  assert.equal(teamFarbe(undefined), NEUTRALE_FARBE);
  assert.equal(teamFarbe(-1), NEUTRALE_FARBE);
  assert.equal(teamMarke(0), 'T1');
  assert.equal(teamMarke(3), 'T4');
  assert.equal(teamMarke(null), '—');

  // Fraktionsfarbe je Fraktion, paarweise verschieden.
  const farben = [];
  for (const f of FACTIONS) {
    const merkmal = fraktionsMerkmale(f.id);
    assert.ok(merkmal, `${f.id}: keine Fraktionsmerkmale`);
    assert.match(merkmal.farbe, /^#[0-9a-f]{6}$/i, `${f.id}: ungültige Fraktionsfarbe`);
    assert.equal(merkmal.name, f.name);
    assert.ok(merkmal.schrift?.length >= 3, `${f.id}: keine Fraktionsschrift`);
    farben.push(merkmal.farbe.toLowerCase());
  }
  assert.equal(new Set(farben).size, FACTIONS.length,
    'zwei Fraktionen teilen sich eine Farbe');
  assert.equal(fraktionsMerkmale('gibtsnicht'), null);
});

test('A09: Anzeige trennt Eigentümer (Ring/Marke) und Fraktion (Emblem)', () => {
  assert.match(FARBTRENNUNG_HINWEIS, /Eigentümer/);
  assert.match(FARBTRENNUNG_HINWEIS, /Fraktion/);

  // Namensschild: Rahmen/Punkt in Teamfarbe, Zierring in Fraktionsfarbe.
  assert.match(figurenQuelle, /ctx\.strokeStyle = aktiv \? PAL\.limette : teamFarbe/,
    'der Rahmen des Namensschilds nimmt nicht die Teamfarbe');
  assert.match(figurenQuelle, /ctx\.strokeStyle = extra\.akzent/,
    'der Zierring des Namensschilds nimmt nicht die Fraktionsfarbe');
  assert.match(figurenQuelle, /extra\?\.teamMarke/,
    'das Namensschild zeigt keine Eigentümer-Marke');
  assert.match(rendererQuelle, /teamMarke: teamMarke\(entity\.teamId\)/,
    'der Renderer setzt die Eigentümer-Marke nicht');

  // HUD-Karte: linker Rahmen = Team, Emblem = Fraktion.
  assert.match(karteQuelle, /this\.wurzel\.style\.borderLeftColor = farbe \|\| teamFarbe/,
    'der HUD-Rahmen zeigt nicht die Teamfarbe');
  assert.match(karteQuelle, /fraktionsIdentitaet\(fraktionId\)\?\.emblem/,
    'die HUD-Karte zeigt kein Fraktionsemblem');

  // Kader nennt die Trennung in Worten.
  assert.match(kaderQuelle, /FARBTRENNUNG_HINWEIS/,
    'die Kaderansicht erklärt die Farbtrennung nicht');
});

// ========================================================= A11 Embleme und Banner

test('A11: Jedes Emblem ist auch bei 24 px lesbar', () => {
  /*
   * Lesbarkeit wird GERECHNET, nicht geschätzt: Das Emblem hat ein 100er
   * Raster. Bei 24 px Anzeige bleibt von einer Strichstärke s genau
   * 24 · s / 100 Pixel übrig. Unter 1 px verschwindet der Strich im Raster.
   */
  for (const f of FACTIONS) {
    const datei = path.join(ZEICHEN_DIR, `${f.id}.svg`);
    assert.ok(fs.existsSync(datei), `${f.id}: Emblem fehlt`);
    const svg = fs.readFileSync(datei, 'utf8');

    assert.match(svg, /viewBox="0 0 100 100"/, `${f.id}: Emblem ohne 100er-Raster`);
    assert.doesNotMatch(svg, /<text|<image|<foreignObject/i,
      `${f.id}: Emblem enthält Text oder eingebettete Bilder (bei 24 px unlesbar)`);

    const striche = [...svg.matchAll(/stroke-width="([0-9.]+)"/g)].map(m => Number(m[1]));
    assert.ok(striche.length > 0, `${f.id}: Emblem hat keinen gezeichneten Strich`);
    const staerkster = Math.max(...striche);
    assert.ok(staerkster >= 4,
      `${f.id}: stärkster Strich ${staerkster} ist bei 24 px unter 1 px breit`);
    assert.ok((staerkster * 24) / 100 >= 0.96,
      `${f.id}: Strich bei 24 px zu dünn`);

    assert.ok(fs.statSync(datei).size < 4096,
      `${f.id}: Emblem ist zu groß für ein 24-px-Zeichen`);
  }
});

test('A11: Jedes Banner ist ein eigenes, textfreies Vektorband', () => {
  for (const f of FACTIONS) {
    const datei = path.join(ZEICHEN_DIR, `${f.id}-banner.svg`);
    assert.ok(fs.existsSync(datei), `${f.id}: Banner fehlt`);
    const svg = fs.readFileSync(datei, 'utf8');
    assert.match(svg, /viewBox="0 0 960 180"/, `${f.id}: Banner ohne 960×180-Raster`);
    assert.match(svg, /<pattern/, `${f.id}: Banner ohne Muster`);
    assert.doesNotMatch(svg, /<text|<image|<foreignObject/i, `${f.id}: Banner enthält Text`);
    assert.ok(fs.statSync(datei).size < 8192, `${f.id}: Banner zu groß`);
  }
});

test('A11: Embleme sind in Auswahl, Ladebild und Ergebnis angebunden', () => {
  // Auswahl: Emblem neben dem Fraktionsfeld, 24 px.
  assert.match(mainQuelle, /fraktionsEmblem\(auswahl\)/,
    'die Fraktionsauswahl zeigt kein Emblem');
  assert.match(anzeigeQuelle, /fraktions-wahl-zeichen/, 'der Emblem-Baustein fehlt');
  assert.match(anzeigeQuelle, /zeichen\.width = 24;[\s\S]{0,60}zeichen\.height = 24;/,
    'das Emblem in der Auswahl ist nicht 24 px gesetzt');
  assert.match(fraktionenCss, /\.fraktions-wahl-zeichen \{[^}]*width: 24px/,
    'die 24-px-Regel für das Auswahl-Emblem fehlt');

  // Ladebild: eigener Baustein, im Matchstart angebunden.
  assert.match(mainQuelle, /starteLadebild\(document, this\.renderer\.fraktionJeTeam/,
    'der Matchstart zeigt kein Ladebild mit den Fraktionen');
  assert.match(fraktionenCss, /\.ladebild \{/, 'das Ladebild hat keine Gestaltung');
  assert.match(ladebildQuelle, /fraktionsIdentitaet\(fraktionId\)\?\.emblem/,
    'das Ladebild zeigt keine Embleme');

  // Ergebnis: Emblem und Name der Siegerfraktion.
  assert.match(indexQuelle, /id="end-fraktion"/, 'der Endbildschirm hat keinen Platz für das Emblem');
  assert.match(mainQuelle, /zeigeSiegerFraktion\(document, this\.renderer\?\.fraktionJeTeam/,
    'die Siegerfraktion wird nicht angezeigt');
  assert.match(anzeigeQuelle, /fraktionsMerkmale\(fraktionId\)/,
    'die Siegerfraktion wird nicht aus der Config gelesen');
  assert.match(fraktionenCss, /\.end-fraktion-zeichen/, 'das Sieger-Emblem hat keine Gestaltung');
});

// ==================================================== A13 Namen und Eigenheiten

test('A13: Kein Name trägt zwei Ränge oder einen technischen Doppeltitel', () => {
  const raenge = ['Captain', 'Commander', 'Vanguard', 'Volley', 'Sniper', 'Grenadier',
    'Sharpshooter', 'Cannoneer', 'Pitcher', 'Archer', 'Bard', 'Master', 'Overlord',
    'Grand', 'Scribe', 'Chassis', 'Vessel', 'Drone', 'Recon', 'Ordnance', 'Heavy-Battery',
    'Slasher', 'Hydra', 'Proxy', 'Storm', 'Dark-Matter', 'Null-Entity', 'Plasma-Maw',
    'Tetsubo', 'Kunoichi', 'Shred-Katana', 'Ninjutsu', 'Talisman', 'Vixen'];
  for (const c of CHARACTERS) {
    const treffer = raenge.filter(r => c.name.split(/[\s-]+/).includes(r));
    assert.ok(treffer.length <= 1,
      `${c.id}: „${c.name}“ trägt ${treffer.length} Titel (${treffer.join(', ')})`);
    assert.ok(c.name.length <= 24, `${c.id}: „${c.name}“ ist zu lang zum Merken`);
  }
});

test('A13: Die genannten Eigenheiten stehen weiter im Anzeigetext', () => {
  /*
   * Das Audit nennt vier Eigenheiten ausdrücklich als erhaltenswert. Zwei
   * standen nur im Optik-Befund und damit nirgends in der Anzeige; sie sind
   * jetzt im Text. Der Test hält alle vier fest, damit eine spätere
   * Textglättung sie nicht wegspült.
   */
  const faelle = [
    ['commander-chewk', /Schaufel/],
    ['chanteyman-drake', /Akkordeon/],
    ['bombard-billy', /Sprengbrille|Brille/],
    ['pitcher-igor', /abnehmen|abgesetzt|angesetzt/],
  ];
  for (const [id, muster] of faelle) {
    assert.match(anzeigeText(getCharacter(id)), muster,
      `${id}: Eigenheit fehlt im Anzeigetext`);
  }
});

// ============================================================= A16 Klassenzeichen

test('A16: Drei Klassen, drei verschiedene Zeichen — ohne Farbe', () => {
  const ids = Object.values(KLASSEN_ZEICHEN).map(z => z.id);
  assert.deepEqual(ids.slice().sort(), ['klinge', 'ritualzeichen', 'visier']);
  assert.equal(new Set(ids).size, 3);

  const pfade = Object.values(KLASSEN_ZEICHEN).map(z => z.pfad);
  assert.equal(new Set(pfade).size, 3, 'zwei Klassen teilen sich einen Pfad');

  // Kein Farbwert und keine Fraktionskennung im Modul: die Klasse ist nicht
  // über Farbe codiert (die gehört der Fraktion).
  const quelle = lies('src/client/klassenZeichen.js');
  assert.doesNotMatch(quelle, /#[0-9a-f]{3,6}\b/i, 'das Modul enthält einen Farbwert');
  for (const f of FACTIONS) {
    assert.ok(!quelle.includes(`'${f.id}'`), `das Modul nennt die Fraktion ${f.id}`);
  }

  for (const klasse of ['nahkampf', 'fernkampf', 'okkultist']) {
    const svg = klassenSvg(klasse, { groesse: 16 });
    assert.match(svg, /currentColor/, `${klasse}: Zeichen erbt die Textfarbe nicht`);
    assert.match(svg, /viewBox="0 0 24 24"/, `${klasse}: Zeichen ohne 24er-Raster`);
    assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b/i, `${klasse}: Zeichen mit fester Farbe`);
  }
  assert.equal(klassenSvg('gibtsnicht'), '');
  assert.equal(zeichenFuerKlasse('gibtsnicht'), null);
});

test('A16: Dieselbe Klasse trägt in jeder Fraktion dasselbe Zeichen', () => {
  /*
   * Die Kernaussage von A16: Das Zeichen hängt an der KLASSE, nicht an der
   * Fraktion. Wiche es je Fraktion ab, wäre es wieder eine Farbcodierung mit
   * anderem Namen.
   */
  const jeKlasse = new Map();
  for (const c of CHARACTERS) {
    const klasse = classOf(c);
    const zeichen = zeichenFuerKlasse(klasse);
    assert.ok(zeichen, `${c.id}: kein Zeichen für Klasse ${klasse}`);
    if (!jeKlasse.has(klasse)) jeKlasse.set(klasse, new Set());
    jeKlasse.get(klasse).add(zeichen.id);
  }
  assert.equal(jeKlasse.size, 3);
  for (const [klasse, zeichen] of jeKlasse) {
    assert.equal(zeichen.size, 1, `${klasse}: mehr als ein Zeichen (${[...zeichen].join(', ')})`);
  }

  // Anzeige: Kader und HUD setzen das Zeichen aus derselben Quelle.
  assert.match(kaderQuelle, /klassenSvg\(klasseDesCharakters/, 'der Kader zeigt kein Klassenzeichen');
  assert.match(karteQuelle, /klassenSvg\(klasse/, 'die HUD-Karte zeigt kein Klassenzeichen');
  assert.match(fraktionenCss, /\.klassen-zeichen/, 'das Klassenzeichen hat keine Gestaltung');
});
