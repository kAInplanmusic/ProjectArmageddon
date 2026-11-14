/**
 * Einstieg der UI-Reste aus Paket A6 (Endrangliste, Lobby-Karten, Home,
 * Porträt-Eckleisten, Intro-Splash, Tokens).
 *
 * Bewusst ein eigener Einstieg statt Änderungen an `main.js`: Das Paket darf
 * den gemeinsamen Startpfad nur lesen. Alle Teile arbeiten ausschließlich auf
 * dem vorhandenen DOM und den vorhandenen Werten.
 *
 * @module uiRest
 */
import { starteEndrangliste } from './endrangliste.js';
import { starteSpielerleiste } from './spielerleiste.js';

/**
 * Startt alle UI-Reste vom Paket A6.
 * Wird von main.js aufgerufen, aber hier definiert für Testbarkeit.
 */
export function starteUIRest() {
  starteEndrangliste();
  starteSpielerleiste();
}

function starte() {
  starteEndrangliste();
  starteSpielerleiste();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', starte, { once: true });
} else {
  starte();
}
