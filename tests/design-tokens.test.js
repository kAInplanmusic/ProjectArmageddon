import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Design-Tokens (UI-Vorlage): Die Token-Datei ist die einzige Quelle der Palette, und die Text-/Hintergrund-Paare
 * erreichen WCAG AA (4,5:1 für Text, 3:1 für große Schrift und Bedienelemente).
 */
const tokens = readFileSync(new URL('../src/client/styles/tokens.css', import.meta.url), 'utf8');
const design = readFileSync(new URL('../src/client/styles/design.css', import.meta.url), 'utf8');

function token(name) {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `Token --${name} fehlt`);
  return m[1];
}
function leuchtdichte(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function kontrast(a, b) {
  const [h, d] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (h + 0.05) / (d + 0.05);
}

test('Palette der Vorlage steht in tokens.css', () => {
  const soll = { bg: '#0d0f12', panel: '#1b1f24', 'panel-2': '#2b3138', 'panel-edge': '#3e444d', 'panel-hi': '#60666e', lime: '#7cfc00', orange: '#ffb800', red: '#ff4d00', cyan: '#00e0ff', violet: '#b84dff' };
  for (const [name, wert] of Object.entries(soll)) assert.equal(token(name).toLowerCase(), wert);
});

test('Text- und Akzentfarben erreichen AA auf den dunklen Flächen', () => {
  for (const flaeche of ['bg', 'panel', 'panel-2']) {
    for (const text of ['ink', 'ink-strong', 'lime', 'orange', 'cyan', 'gelb', 'blau']) {
      assert.ok(kontrast(token(text), token(flaeche)) >= 4.5, `${text} auf ${flaeche}: ${kontrast(token(text), token(flaeche)).toFixed(2)}`);
    }
  }
  for (const flaeche of ['bg', 'panel']) assert.ok(kontrast(token('muted'), token(flaeche)) >= 4.5, `muted auf ${flaeche}`);
  assert.ok(kontrast(token('ink-on-accent'), token('lime')) >= 4.5, 'Primärknopf');
  assert.ok(kontrast(token('violet'), token('panel')) >= 3, 'Violett (große Schrift)');
  assert.ok(kontrast('#ffffff', token('red')) >= 3, 'Gefahrknopf (große Schrift)');
  assert.ok(kontrast(token('lime'), token('bg')) >= 3, 'Fokus-Ring');
});

test('design.css definiert keine eigene Palette mehr (nur tokens.css)', () => {
  assert.ok(!/^:root\s*\{/m.test(design), ':root gehört nach tokens.css');
  assert.match(design, /@import '\.\/tokens\.css'/);
  assert.ok(!/#7cfc00/i.test(design), 'Limette nur über var(--lime)');
});
