/**
 * Client-UI Initialisierung.
 * Grundgerüst: initUI, updateTurnInfo, showEntityDeath.
 */

export function initUI(world) {
  const ui = {
    turnDisplay: null,
    healthDisplay: null,
    ammoDisplay: null,
    endScreen: null
  };

  // Canvas holen
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.warn('Kein Canvas mit id="game-canvas" gefunden');
  }

  return ui;
}

export function updateTurnInfo(ui, currentPlayer, elapsedTime, turnDuration) {
  if (ui.turnDisplay) {
    const remaining = Math.max(0, turnDuration - elapsedTime);
    const seconds = Math.floor(remaining / 1000);
    ui.turnDisplay.textContent = `Spieler ${currentPlayer + 1} | ${seconds}s`;
  }
}

export function showEntityDeath(entityId, x, y) {
  // Death-Effekt: Teilchen, Sound, etc.
  console.log(`Entity ${entityId} gestorben bei (${x}, ${y})`);
}
