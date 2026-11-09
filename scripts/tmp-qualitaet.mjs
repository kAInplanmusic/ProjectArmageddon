import {MatchController} from '../src/engine/match.js';import {MAP_FORMATS,MAP_GROESSEN} from '../src/engine/karte.js';import {WET_LEVEL} from '../src/shared/config/water.js';const KISTEN_ANZAHL_PRUEFUNG=24;
const STUFE = 10;
function kistenErreichbar(m, breite) {
  const hoehe = m.height;
  const oberflaeche = new Int32Array(breite);
  const trockenSp = new Uint8Array(breite);
  for (let x = 0; x < breite; x += 1) {
    const y = m.surfaceYAt(x);
    oberflaeche[x] = y;
    trockenSp[x] = y > 0 && y < hoehe && m.waterLevelAt(x, y - 14) < WET_LEVEL ? 1 : 0;
  }
  const erreicht = new Uint8Array(breite);
  const stapel = [];
  for (const e of m.getState().entities ?? []) {
    if (!e.alive || e.type === 'crate') continue;
    const x = Math.max(0, Math.min(breite - 1, Math.round(e.x)));
    if (trockenSp[x] && !erreicht[x]) { erreicht[x] = 1; stapel.push(x); }
  }
  while (stapel.length) {
    const x = stapel.pop();
    for (const nx of [x - 1, x + 1]) {
      if (nx < 0 || nx >= breite || erreicht[nx] || !trockenSp[nx]) continue;
      if (oberflaeche[x] - oberflaeche[nx] > STUFE) continue; // y wächst nach unten: Aufstieg = kleineres y
      erreicht[nx] = 1;
      stapel.push(nx);
    }
  }
  let trocken = 0;
  let erreichbar = 0;
  for (let i = 0; i < KISTEN_ANZAHL_PRUEFUNG; i += 1) {
    const x = Math.round(breite * (0.08 + 0.84 * (i + 0.5) / KISTEN_ANZAHL_PRUEFUNG));
    if (!trockenSp[x]) continue;
    trocken += 1;
    if (erreicht[x]) erreichbar += 1;
  }
  return { trocken, erreichbar, anteil: trocken ? erreichbar / trocken : 1, gesamt: KISTEN_ANZAHL_PRUEFUNG };
}

for(const groesse of MAP_GROESSEN) for(const format of MAP_FORMATS){const m=new MatchController({format,groesse,seed:4242,kartentyp:'autonom',teams:2,playersPerTeam:2});m.start();const k=kistenErreichbar(m,m.width);console.log(groesse,format,m.width,m.height,m.erreichbarkeit?.ok,k.trocken,k.erreichbar)}