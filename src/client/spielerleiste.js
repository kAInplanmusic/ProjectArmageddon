/**
 * Porträt-Eckleisten in der HUD-Spielerliste (A6 UI-Rest).
 *
 * ## Warum ein eigener Beobachter
 *
 * Die Spielerliste wird in `hud.js` aus dem Ansichtszustand gebaut. Die
 * Fraktion einer Figur liegt aber im Renderer (`fraktionVon`), den `hud.js`
 * nicht kennt — und `main.js`/`renderer.js` sind in diesem Paket nur lesbar.
 * Diese Datei verbindet deshalb beide Seiten, ohne einen der beiden Pfade zu
 * ändern: Sie liest den öffentlichen Diagnosezustand (`window.__PA__`), holt
 * Fraktion, Klasse und Platz je Figur und setzt das passende Porträt als
 * Eckleiste an die vorhandene Zeile.
 *
 * Fällt die Diagnose-Schnittstelle weg (Unit-Test, reine Vorschau), bleibt die
 * Liste unverändert — die Eckleiste ist Schmuck, keine Spielinformation.
 *
 * @module spielerleiste
 */
import { charakterFuer } from '../shared/config/darstellung.js';
import { KLASSEN_STANDARD } from '../shared/config/klassen-fassung.js';
import { spriteUrl } from './roster.js';

/** Fraktion einer Figur — aus dem Renderer, sonst aus der Bestandsnachricht. */
function fraktionFuer(renderer, entity) {
  if (entity.fraktionId) return entity.fraktionId;
  try {
    return renderer?.fraktionVon?.(entity) ?? null;
  } catch {
    return null;
  }
}

/** Setzt (oder entfernt) das Porträt an einer Zeile. */
function setzePortraet(zeile, url) {
  if (!url) return;
  // CSS-Variablenwert: url("…"); Anführungszeichen im Pfad wären ein Bruch.
  const sicher = url.replace(/["\\]/g, encodeURIComponent);
  zeile.style.setProperty('--roster-portraet', `url("${sicher}")`);
  zeile.classList.add('mit-portraet');
}

function dekoriereListe() {
  const api = globalThis.__PA__;
  const renderer = api?.game?.renderer;
  const zustand = api?.getState?.();
  if (!renderer || !zustand?.entities) return;

  const liste = document.getElementById('roster');
  if (!liste) return;

  const figuren = new Map(zustand.entities.map(entity => [String(entity.entityId), entity]));
  const klassen = zustand.klassen ?? KLASSEN_STANDARD;

  for (const zeile of liste.querySelectorAll('.roster-item[data-entity-id]')) {
    const entity = figuren.get(zeile.dataset.entityId);
    if (!entity) continue;

    const fraktion = fraktionFuer(renderer, entity);
    const charakter = fraktion
      ? charakterFuer(fraktion, entity.classId, entity.platz ?? entity.archetypeId ?? 0, klassen)
      : null;
    const url = spriteUrl(charakter);
    if (url) setzePortraet(zeile, url);
  }
}

/** Hält den Beobachter am Leben — ein lokaler MutationObserver kann sonst eingesammelt werden. */
let beobachter = null;

/** Startet die Eckleisten; beobachtet die Spielerliste (sie wird je Änderung neu gebaut). */
export function starteSpielerleiste() {
  const liste = document.getElementById('roster');
  if (!liste || liste.dataset.portraetAktiv === '1') return false;
  liste.dataset.portraetAktiv = '1';

  let geplant = false;
  const plane = () => {
    if (geplant) return;
    geplant = true;
    // Der Beobachter läuft als Mikrotask VOR dem nächsten Bild: Die Eckleiste
    // erscheint damit im selben Bild wie die neue Zeile und flackert nicht.
    queueMicrotask(() => {
      geplant = false;
      dekoriereListe();
    });
  };

  beobachter?.disconnect();
  beobachter = new MutationObserver(plane);
  beobachter.observe(liste, { childList: true, subtree: true });
  dekoriereListe();
  return true;
}
