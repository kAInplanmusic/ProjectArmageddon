export function initUI() {
  const container = document.createElement('div');
  container.id = 'game-ui';
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.padding = '8px';
  container.style.background = 'rgba(0,0,0,0.5)';
  container.style.color = 'white';
  const turnInfo = document.createElement('div');
  turnInfo.id = 'turn-info';
  container.appendChild(turnInfo);
  document.body.appendChild(container);
}

export function updateTurnInfo(currentPlayer, elapsed) {
  const el = document.getElementById('turn-info');
  if (el) {
    el.textContent = `Current player: ${currentPlayer}, elapsed: ${elapsed.toFixed(2)}s`;
  }
}

export function showEntityDeath(entityId) {
  console.log('UI: Entity died', entityId);
}
