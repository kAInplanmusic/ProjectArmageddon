/**
 * Einstieg der UI-Reste aus Paket A6 (Endrangliste, Porträt-Eckleisten).
 *
 * Bewusst ein eigener Einstieg statt Änderungen an `main.js`: Das Paket darf
 * den gemeinsamen Startpfad nur lesen. Beide Teile arbeiten ausschließlich auf
 * dem vorhandenen DOM und den vorhandenen Werten.
 *
 * @module uiRest
 */
import { starteEndrangliste } from './endrangliste.js';
import { starteSpielerleiste } from './spielerleiste.js';

function starte() {
  starteEndrangliste();
  starteSpielerleiste();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', starte, { once: true });
} else {
  starte();
}
