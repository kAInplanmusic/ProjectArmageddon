/**
 * Tests: Der Abbruchknopf im HUD ist sichtbar, bedienbar und sicher.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Der einzige Weg, ein Match zu verlassen,
 * war die Taste **`R`** — sie wirkt global, beendet das Match **sofort und
 * ohne Rückfrage** und stand nur in der Tastaturliste des Menüs.
 *
 * Wer sie versehentlich traf, verlor die Partie. Und wer sie suchte, fand sie
 * nicht.
 *
 * ## Die Umsetzung
 *
 * Ein Knopf im HUD („Match verlassen"), der **nachfragt**. Beide Wege laufen
 * durch dieselbe Methode (`abortMatch`) — es gibt nur eine Umsetzung.
 *
 * ## Was hier geprüft wird
 *
 * Die Struktur im Quelltext (der Knopf ist ein echtes, bedienbares Element mit
 * Beschriftung), die Kopplung an den Match-Zustand (sichtbar nur im Match) und
 * die Rückfrage. Dazu ein Hinweis auf `pointer-events`: `#hud` schaltet sie ab,
 * der Knopf muss sie für sich zurückholen — sonst wäre er sichtbar, aber nicht
 * klickbar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

/** Entfernt Kommentare, damit Strukturtests den Code prüfen, nicht die Doku. */
function ohneKommentare(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');
}

test('Der Abbruch ist ein echter Knopf, kein Text', () => {
  /*
   * Die Zugänglichkeit: Ein `div` mit Klick-Handler ist nicht per Tastatur
   * erreichbar. Geprüft wird auf das Button-Element.
   */
  assert.match(html, /<button[^>]*id="hud-abort"[^>]*>/,
    'Der Abbruch muss ein <button> sein — sonst ist er nicht bedienbar');

  /*
   * Geprüft wird der ATTRIBUTSATZ des Knopfes, nicht die Reihenfolge der
   * Attribute. Ein erster Anlauf suchte `id` vor `type` — im HTML steht es
   * umgekehrt, und der Test schlug aus dem falschen Grund fehl.
   */
  const tag = html.match(/<button[^>]*id="hud-abort"[^>]*>/);
  assert.ok(tag, 'der Knopf wurde nicht gefunden');
  assert.match(tag[0], /type="button"/,
    'type="button" fehlt — in einem Formular würde er sonst absenden');

  // Und er trägt eine Beschriftung, nicht nur ein Symbol.
  assert.match(html, /id="hud-abort"[\s\S]{0,200}verlassen/,
    'Der Knopf braucht eine sichtbare Beschriftung');
});

test('Der Knopf holt sich die Klickbarkeit zurück', () => {
  /*
   * FUND (belegt): `#hud` hat `pointer-events: none`, damit die Klickfläche des
   * Spielfelds frei bleibt. Ohne `pointer-events: auto` am Knopf wäre er
   * sichtbar, aber nicht bedienbar — ein Fehler, den man nur beim Klicken
   * bemerkt.
   */
  const css = ohneKommentare(html);
  const block = css.match(/#hud-abort\s*\{([^}]*)\}/);

  assert.ok(block, 'die CSS-Regel für #hud-abort fehlt');
  assert.match(block[1], /pointer-events:\s*auto/,
    '#hud-abort braucht `pointer-events: auto` — #hud schaltet sie ab');

  // Die Gegenprobe: #hud schaltet sie tatsächlich ab.
  const hudBlock = css.match(/#hud\s*\{([^}]*)\}/);
  assert.ok(hudBlock, 'die CSS-Regel für #hud fehlt');
  assert.match(hudBlock[1], /pointer-events:\s*none/,
    'Testannahme: #hud schaltet pointer-events ab');
});

test('Der Knopf hat einen sichtbaren Fokus', () => {
  /*
   * Wer mit der Tastatur bedient, muss sehen, wo er ist. Ohne `:focus-visible`
   * verschwindet der Fokusrahmen — und die Bedienung wird zum Blinde-Essen.
   */
  const css = ohneKommentare(html);
  assert.match(css, /#hud-abort:focus-visible/,
    'Ein Fokus-Stil für den Knopf fehlt');
});

test('Beide Wege laufen durch dieselbe Methode', () => {
  /*
   * Eine Regel, eine Stelle. Taste `R` und Knopfklick dürfen nicht getrennt
   * gepflegt werden — sonst verhalten sie sich irgendwann verschieden.
   */
  const code = ohneKommentare(main);

  // Die Taste ruft `abortMatch`.
  assert.match(code, /event\.key === 'r'[\s\S]{0,120}abortMatch\(\)/,
    'Die Taste R muss `abortMatch()` rufen');

  // Der Knopf ebenfalls.
  assert.match(code, /abortButton[\s\S]{0,120}abortMatch\(\)/,
    'Der Knopf muss `abortMatch()` rufen');

  // Und die alte, direkte Aufräumlogik ist aus dem Tastenzweig verschwunden.
  const tastenblock = code.match(/event\.key === 'r'[\s\S]{0,200}/);
  assert.ok(tastenblock, 'der Tastenzweig wurde nicht gefunden');
  assert.doesNotMatch(tastenblock[0], /this\.match = null/,
    'Der Tastenzweig räumt noch selbst auf — er soll `abortMatch()` nutzen');
});

test('Der Abbruch fragt nach', () => {
  /*
   * Der Kern des Befunds: Ein Fehlgriff darf keine Partie kosten. Geprüft wird,
   * dass eine Rückfrage existiert und dass ein „Nein" den Abbruch verhindert.
   */
  const code = ohneKommentare(main);
  const methode = code.match(/abortMatch\([^)]*\)\s*\{([\s\S]*?)\n  \}/);

  assert.ok(methode, 'die Methode `abortMatch` wurde nicht gefunden');
  assert.match(methode[1], /confirm\(/,
    'Der Abbruch muss nachfragen');
  assert.match(methode[1], /return false/,
    'Ein „Nein" muss den Abbruch verhindern (return false)');
});

test('Der Knopf ist nur im Match sichtbar', () => {
  /*
   * „Match verlassen" im Menü wäre irreführend — dort läuft kein Match.
   * Geprüft wird, dass die Sichtbarkeit zentral gesteuert wird.
   */
  const code = ohneKommentare(main);

  assert.match(code, /#zeigeAbbruch\(/,
    'die zentrale Sichtbarkeitsfunktion fehlt');

  // Sie wird an mindestens drei Stellen genutzt: lokal, online (einblenden)
  // und beim Aufräumen (ausblenden).
  const aufrufe = (code.match(/#zeigeAbbruch\(/g) ?? []).length;
  assert.ok(aufrufe >= 4,
    `#zeigeAbbruch wird nur ${aufrufe}× gerufen — erwartet: Definition plus `
    + 'drei Nutzungen (lokal, online, Aufräumen)');
});

test('Der Knopf ist im HTML von Anfang an versteckt', () => {
  /*
   * FUND (belegt, im E2E-Lauf): Beim ersten Anlauf fehlte das `hidden`-Attribut
   * im HTML — der Knopf stand damit im Menü, bis der erste Match-Start ihn
   * umschaltete. Ein E2E-Test hat es aufgedeckt.
   *
   * Beides gehört dazu: Das Attribut verhindert ein Aufblitzen beim Laden (es
   * wirkt, bevor JavaScript läuft), der Aufruf im Konstruktor setzt den Zustand
   * explizit. Fällt eines weg, ist der Knopf kurz oder dauerhaft sichtbar.
   */
  const tag = html.match(/<button[^>]*id="hud-abort"[^>]*>/);
  assert.ok(tag, 'der Knopf wurde nicht gefunden');
  assert.match(tag[0], /\shidden(\s|>)/,
    'Der Knopf braucht `hidden` im HTML — sonst blitzt er beim Laden auf');

  // Und der Konstruktor setzt den Zustand zusätzlich.
  const code = ohneKommentare(main);
  const init = code.match(/this\.abortButton = document\.getElementById\('hud-abort'\);([\s\S]{0,120})/);
  assert.ok(init, 'die Initialisierung des Knopfes wurde nicht gefunden');
  assert.match(init[1], /#zeigeAbbruch\(false\)/,
    'Der Konstruktor muss den Knopf explizit ausblenden');
});

test('Der Abbruch im Menü ist wirkungslos', () => {
  /*
   * Die Sicherung gegen einen leeren Klick: Ohne Match darf `abortMatch`
   * nichts tun — und vor allem nicht den Modus verstellen.
   */
  const code = ohneKommentare(main);
  const methode = code.match(/abortMatch\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(methode, 'die Methode wurde nicht gefunden');

  assert.match(methode[1], /if \(!laeuft\) return false/,
    'Ohne laufendes Match muss `abortMatch` sofort zurückkehren');
});
