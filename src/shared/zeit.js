/**
 * Der feste Simulationsschritt.
 *
 * AUSGEZOGEN aus `src/client/main.js` (Zerlegung 2026-09-20, Schritt 1). Dort war
 * er eine Modulkonstante — die Diagnose-Schnittstelle braucht denselben Wert,
 * und zwei Kopien einer Zahl laufen irgendwann auseinander.
 *
 * 60 Hz: Ein Tick je 16,7 ms. Die Client-Schleife holt verpasste Schritte nach,
 * die Simulation selbst kennt nur diesen Schritt.
 */
export const FIXED_TIMESTEP = 1000 / 60;
