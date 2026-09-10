import { MatchController } from '../src/engine/match.js';

const match = new MatchController({ seed: 20260910, teams: 2, playersPerTeam: 2, turnDurationMs: 3000 });
match.start();

const start = match.getState();
console.log('status:', start.status, 'round:', start.round, 'wind:', start.wind);
console.log('players:', start.entities.map(e => `${e.label}(t${e.teamId}) hp=${e.health} @${Math.round(e.x)},${Math.round(e.y)}`).join(' | '));
console.log('crates:', start.crates.length);

// Simuliere mehrere Runden mit Schüssen
let shots = 0;
for (let tick = 0; tick < 3000; tick++) {
  const st = match.getState();
  if (st.status !== 'playing') break;
  const active = st.entities.find(e => e.entityId === st.activePlayerId);
  if (active && st.turnElapsedMs < 30) {
    const res = match.fire(active.entityId, Math.PI / 4 + (tick % 5) * 0.05, 65);
    if (res.ok) shots++;
    else if (shots < 3) console.log('fire failed:', res.errors);
  }
  match.step();
}

const end = match.getState();
console.log('\nshots fired:', shots);
console.log('final status:', end.status, 'round:', end.round, 'tick:', end.tick);
console.log('winnerTeamId:', end.winnerTeamId);
console.log('hash:', match.stateHash());
console.log('events:', match.consumeEvents().length);
