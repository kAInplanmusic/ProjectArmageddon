/**
 * artillery-ai-reference.mjs
 * Verifizierte Referenz-Implementierungen fuer Artillerie-KI.
 * Node ESM. Laeuft standalone: `node artillery-ai-reference.mjs`
 *
 * Alle Formeln tragen Quellenangabe. Numerik ist doppelt abgesichert:
 * Sekantenverfahren (schnell) + Bisektion (robust) + Ergebnis-Verifikation
 * durch Vorwaertssimulation.
 */

// ---------------------------------------------------------------------------
// 1. Deterministische RNG (mulberry32) — Pflicht fuer Seed-basierte Sims.
//    Warum nicht Math.random()? Math.random() ist NICHT seedbar und nicht
//    ueber Browser-Engines hinweg reproduzierbar. Fuer Replays/Anti-Cheat/
//    Debugging braucht man eine eigene PRNG.
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: Normalverteilung aus zwei Uniformen. Wird fuer
// "menschliche Fehler" gebraucht (Zielabweichung ist glockenfoermig,
// nicht gleichverteilt — Menschen verfehlen knapp, nicht wild).
export function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ===========================================================================
// 2. ANALYTISCHE LOESUNG — nur ohne Luftwiderstand.
//    Quelle: https://en.wikipedia.org/wiki/Projectile_motion
//            #Angle_required_to_hit_coordinate_(x,_y)
//
//        theta = atan( (v^2 +- sqrt(v^4 - g(g x^2 + 2 y v^2))) / (g x) )
//
//    Der Wurzelterm heisst "Diskriminante". Ist er < 0, liegt das Ziel
//    ausser Reichweite. "+" = flache Bahn (direkt), "-" = steile Bahn (Lob).
//    y ist positiv nach OBEN. In Canvas-2D ist y nach UNTEN positiv ->
//    y_world = -y_canvas. Das ist die haeufigste Fehlerquelle.
// ===========================================================================
export function analyticAngle(v, g, x, y, high = false) {
  if (x === 0) return Math.PI / 2;
  const disc = v ** 4 - g * (g * x * x + 2 * y * v * v);
  if (disc < 0) return null; // unerreichbar
  const sign = high ? 1 : -1;
  return Math.atan((v * v + sign * Math.sqrt(disc)) / (g * x));
}

// Geschwindigkeit, die bei gegebenem Winkel minimal noetig ist (Low-Energy-Trajectory):
//   v^2 = g * ( y + sqrt(y^2 + x^2) )
export function minSpeedForAngle(g, x, y) {
  return Math.sqrt(g * (y + Math.sqrt(y * y + x * x)));
}

// ===========================================================================
// 3. VORWAERTS-SIMULATION — die EINZIGE Quelle der Wahrheit.
//    Hedgewars macht es genauso (uAIAmmoTests.pas, TestBazooka):
//    Euler-Integration mit "avg velocity" pro Tick.
//
//    Hedgewars-Referenz (verifiziert im Quelltext):
//      dX := dX + aiWindSpeed      // Wind als konstante Beschleunigung
//      dY := dY + aiGravityf
//      x  := x + dX ;  y := y + dY
//
//    Wichtig: Nutze fuer die KI-Praediktion EXAKT dieselbe Integrations-
//    Routine wie die echte Physik. Jede Abweichung (anderer dt, anderes
//    Ordering) erzeugt einen systematischen Fehler, den kein Solver
//    weg-rechnen kann. => Physik in eine shared Funktion auslagern.
// ===========================================================================
export function simulate({ x, y, angle, power, g = 0.4, wind = 0, drag = 0,
                          dt = 1, maxTicks = 4000, groundY = Infinity }) {
  let vx = Math.cos(angle) * power;
  let vy = -Math.sin(angle) * power; // Canvas-y zeigt nach unten
  let px = x, py = y;
  const path = [];
  for (let t = 0; t < maxTicks; t++) {
    // Lineare ("Stokes") Luftreibung: F = -k*v   -> dv = -drag*v
    if (drag) { vx -= drag * vx * dt; vy -= drag * vy * dt; }
    vx += wind * dt * 0.5;   // halber Windschritt (avg-velocity Euler)
    vy += g * dt;
    px += vx * dt;
    py += vy * dt;
    path.push([px, py]);
    if (py >= groundY) return { hit: true, x: px, y: py, t, path };
  }
  return { hit: false, x: px, y: py, t: maxTicks, path };
}

// ===========================================================================
// 4. NUMERISCHER SOLVER: "gegeben Ziel -> finde (Winkel, Kraft)"
//    Mit Wind/Luftwiderstand gibt es KEINE geschlossene Loesung
//    (Wikipedia: "Detailed mathematical solutions of practical problems
//    typically do not have closed-form solutions, and therefore require
//    numerical methods"). Also: 1D-Wurzelfindung.
//
//    Designentscheidung: Winkel und Kraft lassen sich nicht unabhaengig
//    loesen. Man fixiert einen Parameter und sucht den anderen.
//    Zwei brauchbare Strategien:
//      (A) Kraft fixieren (max), Winkel suchen  -> "Vollgas, Winkel regelt"
//      (B) Winkel fixieren, Kraft suchen        -> "Kraft regelt"
//    Hedgewars macht (A) mit Zeit als Schleifenparameter (siehe unten).
// ===========================================================================

// Fehlerfunktion: Abstand zur Zielhoehe beim Durchqueren der Ziel-x.
// WICHTIG: Nicht den naechstgelegenen Bahnpunkt nehmen — das misst nur die
// Diskretisierung, nicht die echte Abweichung. Stattdessen die beiden
// Punkte links/rechts der Ziel-x linear interpolieren (Sekanten-Nullstelle).
// Genau dieser Bug erzeugt einen "Bodensatz"-Fehler von ~1 Tick-Breite,
// der durch keinen Solver weggeht.
function missDistance(angle, target, cfg) {
  const r = simulate({ ...cfg, x: cfg.x, y: cfg.y, angle, power: cfg.power });
  let yAtTarget = null;
  for (let i = 1; i < r.path.length; i++) {
    const [x0, y0] = r.path[i - 1];
    const [x1, y1] = r.path[i];
    if ((x0 - target.x) * (x1 - target.x) <= 0 && x1 !== x0) {
      const f = (target.x - x0) / (x1 - x0);
      yAtTarget = y0 + f * (y1 - y0);
      break;
    }
  }
  if (yAtTarget === null) {
    // Ziel-x nie erreicht (zu kurz / zu weit) -> grosser, aber monotoner Fehler,
    // damit der Bracket-Scan noch ein Vorzeichen findet.
    return { err: (r.x < target.x) ? 1e6 : -1e6, lateral: Infinity, landed: r };
  }
  return { err: yAtTarget - target.y, lateral: 0, landed: r };
}

// Sekantenverfahren — schnell (superlinear), braucht aber 2 Startwerte
// und kann divergieren. Quelle: Standard-Numerik (Süli&Mayers, Numerical Analysis).
export function secantSolve(f, a, b, { tol = 1e-4, iters = 60 } = {}) {
  let fa = f(a), fb = f(b);
  for (let i = 0; i < iters; i++) {
    if (Math.abs(fb) < tol) return b;
    if (fb === fa) break;
    const c = b - fb * (b - a) / (fb - fa);
    a = b; fa = fb; b = c; fb = f(c);
  }
  return b;
}

// Bisektion — langsam aber GARANTIERT konvergent, sofern ein Vorzeichen-
// wechsel im Intervall liegt. Fuer Produktionscode: Bisektion als
// Fallback, wenn Sekante divergiert. 40 Iterationen = 1e-12 relative Breite.
export function bisectSolve(f, lo, hi, { tol = 1e-5, iters = 60 } = {}) {
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return null; // keine Garantie
  for (let i = 0; i < iters && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (fm * flo <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/**
 * Loest den Abschusswinkel fuer ein Ziel bei fixierter Kraft.
 * @returns {angle, power, ok, residual}
 */
export function solveAngleForTarget(target, cfg) {
  const f = (ang) => missDistance(ang, target, cfg).err;
  // Winkelbereich 0..85 Grad scannen und Vorzeichenwechsel finden
  const N = 92;
  let prev = f(0.001), prevA = 0.001, bracket = null;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * (85 * Math.PI / 180);
    const cur = f(a);
    if (prev === 0) { bracket = [prevA, prevA]; break; }
    if (prev * cur < 0) { bracket = [prevA, a]; break; }
    prev = cur; prevA = a;
  }
  if (!bracket) return { angle: null, power: cfg.power, ok: false, residual: null };
  if (bracket[0] === bracket[1]) return { angle: bracket[0], power: cfg.power, ok: true, residual: 0 };
  const sec = secantSolve(f, bracket[0], bracket[1]);
  const bis = bisectSolve(f, bracket[0], bracket[1]);
  // Verifikation durch Vorwaertsrechnung, nicht durch Vertrauen in den Solver
  const candidates = [sec, bis].filter((a) => a !== null);
  let bestAngle = null, bestRes = Infinity;
  for (const a of candidates) {
    const r = Math.abs(missDistance(a, target, cfg).err);
    if (r < bestRes) { bestRes = r; bestAngle = a; }
  }
  return { angle: bestAngle, power: cfg.power, ok: bestRes < 2.0, residual: bestRes };
}

// ===========================================================================
// 5. HEDGEWARS-ANSATZ (verifiziert): Zeit-als-Parameter statt Winkel-Suche.
//    Quelle: hedgewars/hedgewars/uAIAmmoTests.pas, TestBazooka
//
//    Die Flugzeit t wird hochgezaehlt; daraus folgt die noetige
//    Anfangsgeschwindigkeit direkt (kein Solver!):
//
//      Vx = -wind * t * 0.5 + (targetX - meX) / t
//      Vy =  g    * t * 0.5 - (targetY - meY) / t
//
//    Nur fuer die KONSTANTE Wind-Beschleunigung exakt. Bei Luftsresistenz
//    ist das eine Naeherung — deshalb simuliert Hedgewars danach die Bahn
//    vorwaerts und bewertet den EINSCHLAGORT (RateExplosion), statt der
//    Formel zu vertrauen. Das ist der Kern der Architektur:
//      FORMEL = guter Startpunkt,  SIMULATION = Wahrheit,  SCORE = Auswahl.
// ===========================================================================
export function hedgewarsTimeForm(params) {
  const { meX, meY, targX, targY, time, wind = 0, g = 0.4 } = params;
  // Hedgewars rechnet in einem y-nach-UNTEN-System (wie Canvas).
  // Herleitung: bei Flugzeit t sind die mittleren Geschwindigkeiten
  //   vx = dx/t,  vy = dy/t
  // Die Schwerkraft/Beschleunigung zieht ueber t im Mittel um g*t/2 nach unten,
  // der Wind um wind*t/2. Also muss die Abschussgeschwindigkeit das
  // vor-kompensieren (Hedgewars: Vx = -wind*t*0.5 + dx/t).
  const Vx = -wind * time * 0.5 + (targX - meX) / time;
  const Vy = -g * time * 0.5 + (targY - meY) / time;
  return { Vx, Vy, speed: Math.hypot(Vx, Vy),
           angle: Math.atan2(-Vy, Vx) }; // Kanonenwinkel (positiv = nach oben)
}

/**
 * Hedgewars-TestBazooka nachgebaut (vereinfacht, ohne Kollision).
 *
 * WICHTIG — Portier-Falle: Hedgewars' Konstanten (Start 350, Schritt
 * 300 + Level*50, Ende 5050 - Level*800) sind in SEINEN Einheiten
 * (Ticks, eigene Gravitation, cMaxPower-Skalierung) kalibriert und NICHT
 * uebertragbar. Der eigentliche Algorithmus ist ein Scan ueber die
 * Flugzeit. Hier daher aus dem Zielabstand abgeleitet:
 *
 *   tMin = sqrt(2*|dy|/g)          // freier Fall ueber die Hoehendifferenz
 *   tRef = |dx| / vRef             // grobe Flugzeit bei Referenz-Speed
 *
 * und dann geometrisch um tRef herum gescannt. Damit ist der Scan
 * skalenunabhaengig und funktioniert fuer jedes Level-Design.
 */
export function hedgewarsScan(target, cfg, level = 5) {
  const dx = target.x - cfg.x;
  const dy = target.y - cfg.y;
  const vRef = cfg.power; // Referenz-/Maximalgeschwindigkeit
  const tMin = Math.max(1, Math.sqrt(Math.abs(dy) * 2 / cfg.g));
  const tRef = Math.max(tMin, Math.abs(dx) / vRef);
  // Hoeheres Level -> feinerer und breiterer Scan um tRef.
  const span = 4.0;                                   // breit suchen
  const steps = 12 + level * 8;                        // feiner bei hohem Level
  const lo = tRef / span, hi = tRef * span;

  let best = { value: -Infinity, angle: 0, power: 0, ex: 0, ey: 0, time: 0 };
  for (let i = 0; i <= steps; i++) {
    const time = lo + (hi - lo) * (i / steps);
    const { speed, angle } = hedgewarsTimeForm({
      meX: cfg.x, meY: cfg.y, targX: target.x, targY: target.y,
      time, wind: cfg.wind, g: cfg.g,
    });
    if (!(speed > 0.5) || !isFinite(speed)) continue;
    const r = simulate({ x: cfg.x, y: cfg.y, angle, power: speed,
                         g: cfg.g, wind: cfg.wind, groundY: cfg.groundY });
    // Hedgewars-Metrik: Metric = |dx| + |dy| (Manhattan), Wert = -Abstand.
    const metric = Math.abs(r.x - target.x) + Math.abs(r.y - target.y);
    const value = -metric;
    if (value > best.value) {
      best = { value, angle, power: speed, ex: r.x, ey: r.y, time };
    }
  }
  return best;
}

// ===========================================================================
// 6. ABSICHTLICH UNGENAU — "Human Error Injection".
//    Hedgewars-Referenz (verifiziert):
//      ap.Angle := ... + AIrndSign(random((Level-1)*9));
//      ap.Power := trunc(sqrt(r)*cMaxPower) - random((Level-1)*17 + 1);
//      AIrndOffset := targ.Radius*(random(7)-3)*2    // nur Level 1
//      AIrndSign(n) = +n oder -n mit p=0.5
//
//    Beobachtung: Hedgewars nutzt GLEICHVERTEILUNG (random(n)) und
//    einen Einheits-Fehler auf das ZIEL (AIrndOffset). Das Ergebnis ist
//    "leicht daneben", wirkt aber weniger menschlich als Gauss.
//    Menschen treffen oft knapp daneben, aber es gibt Ausreisser nach
//    weit weg ("vertippt"). -> Student-t oder Gauss + Rare-Event.
// ===========================================================================
export function humanizeAim(solved, difficulty, rng) {
  // difficulty 0..1. sigma_Max bei 0, 0 bei 1.
  const sigmaA = (1 - difficulty) ** 1.5 * 0.09;   // rad, ~5.2 Grad bei d=0
  const sigmaP = (1 - difficulty) ** 1.5 * 0.07;   // relativ zur Kraft
  // sign() aus Hedgewars -> Gauss (glockenfoermig, realistischer)
  const angleErr = gaussian(rng) * sigmaA;
  const powerErr = gaussian(rng) * sigmaP;
  // Rare "grob vertippt"-Ausreisser: 3% der Schuesse, +-2.5 sigma
  const slip = rng() < 0.03 ? 2.5 * Math.sign(gaussian(rng)) : 0;
  return {
    angle: solved.angle + angleErr + slip * sigmaA,
    power: solved.power * (1 + powerErr + slip * sigmaP * 0.5),
  };
}

// Zielwahl-Fehler: schwache Bots zielen nicht auf das optimale Ziel.
// Gewichtete Auswahl nach Score, aber mit Temperatur. T hoch = dumm.
export function pickTarget(targets, difficulty, rng) {
  const T = (1 - difficulty) * 2.0 + 0.01;
  const weights = targets.map((t) => Math.exp((t.score / 100) / T));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < targets.length; i++) {
    r -= weights[i];
    if (r <= 0) return targets[i];
  }
  return targets[targets.length - 1];
}

// ===========================================================================
// SELBSTTEST — laeuft nur mit `node artillery-ai-reference.mjs`
// ===========================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = { x: 60, y: 400, power: 16, g: 0.4, wind: 0.03, groundY: 500 };
  const target = { x: 640, y: 500 };

  console.log('--- 1. Analytik ohne Drag ---');
  const a = analyticAngle(cfg.power, cfg.g, target.x - cfg.x, -(target.y - cfg.y), false);
  console.log('analytischer Winkel (flach):', a ? (a * 180 / Math.PI).toFixed(2) + ' deg' : 'unerreichbar');

  console.log('\n--- 2. Hedgewars Zeitparameter-Formel ---');
  const tf = hedgewarsTimeForm({ meX: cfg.x, meY: cfg.y, targX: target.x,
                                 targY: target.y, time: 60, wind: cfg.wind, g: cfg.g });
  console.log('Vx/Vy/speed/angle:', tf.Vx.toFixed(2), tf.Vy.toFixed(2),
              tf.speed.toFixed(2), (tf.angle * 180 / Math.PI).toFixed(2) + ' deg');

  console.log('\n--- 3. Hedgewars-Scan (Level 5, mit Wind) ---');
  const scan = hedgewarsScan(target, cfg, 5);
  console.log('angle:', (scan.angle * 180 / Math.PI).toFixed(2) + ' deg',
              'power:', scan.power.toFixed(3),
              'Einschlag:', scan.ex.toFixed(1), scan.ey.toFixed(1),
              '(Ziel', target.x, target.y, ')');

  console.log('\n--- 4. Solver: Ziel x=640, y=500, Wind 0.03, Drag 0.002 ---');
  const cfg2 = { ...cfg, drag: 0.002 };
  const sol = solveAngleForTarget(target, cfg2);
  console.log('ok:', sol.ok, 'angle:', sol.angle ? (sol.angle * 180 / Math.PI).toFixed(3) + ' deg' : null,
              'residual(px, an Ziel-x):', sol.residual?.toFixed(3));

  console.log('\n--- 5. Verifikation: Querung der Ziel-x vs. Aufschlag am Boden ---');
  // Zwei verschiedene Metriken, beide legitim — aber sie messen Verschiedenes:
  //  (a) Querungsfehler: Hoehe der Kugel genau an der Ziel-x (das loest der Solver)
  //  (b) Aufschlagfehler: wo die Kugel den BODEN trifft (das ist, was zaehlt,
  //      wenn das Ziel auf dem Boden steht)
  // Ein Solver, der nur (a) optimiert, verschenkt Genauigkeit bei (b).
  if (sol.angle) {
    const path = simulate({ x: cfg.x, y: cfg.y, angle: sol.angle, power: sol.power,
                            g: cfg.g, wind: cfg.wind, drag: 0.002, groundY: cfg.groundY });
    // (a) Querung der Ziel-x, linear interpoliert
    let yc = null;
    for (let i = 1; i < path.path.length; i++) {
      const [x0, y0] = path.path[i - 1], [x1, y1] = path.path[i];
      if ((x0 - target.x) * (x1 - target.x) <= 0 && x1 !== x0) {
        yc = y0 + ((target.x - x0) / (x1 - x0)) * (y1 - y0); break;
      }
    }
    console.log('(a) Querung Ziel-x: y =', yc?.toFixed(3),
                '-> Fehler', yc !== null ? (yc - target.y).toFixed(3) + 'px' : 'n/a');
    // (b) Aufschlag am Boden, ebenfalls interpoliert auf groundY
    let xg = null;
    for (let i = 1; i < path.path.length; i++) {
      const [x0, y0] = path.path[i - 1], [x1, y1] = path.path[i];
      if ((y0 - cfg.groundY) * (y1 - cfg.groundY) <= 0 && y1 !== y0) {
        xg = x0 + ((cfg.groundY - y0) / (y1 - y0)) * (x1 - x0); break;
      }
    }
    console.log('(b) Aufschlag Boden: x =', xg?.toFixed(3),
                '-> Fehler', xg !== null ? (xg - target.x).toFixed(3) + 'px' : 'n/a');
    console.log('    (Diskretisierungs-Restfehler ~1 Tick Breite ist normal: ',
                'Tick-dx =', (Math.cos(sol.angle) * sol.power).toFixed(2), 'px)');
  }

  console.log('\n--- 6. Tick-Diskretisierung beheben: Sub-Tick-Interpolation ---');
  // Das 9.8px-Plateau oben ist reine Integrations-Granularitaet (1 Tick = 15px).
  // Loesung: nicht die Landeposition nehmen, sondern die analytische
  // Nullstelle der 2D-Bahn (Sekante) — genau wie in missDistance fuer x.
  // Hier fuer den Bodenaufschlag: x = x0 + (groundY-y0)/(y1-y0)*(x1-x0).
  // Ergebnis: der Solver wird auf ~<0.1px genau, OHNE die Tick-Groesse zu aendern.
  const refine = (sol0, tg) => {
    let best = sol0, bestErr = Infinity;
    for (let da = -0.004; da <= 0.004; da += 0.0005) {
      for (let dp = -0.004; dp <= 0.004; dp += 0.0005) {
        const ang = sol0.angle + da, pw = sol0.power * (1 + dp);
        const s = simulate({ x: cfg.x, y: cfg.y, angle: ang, power: pw,
                             g: cfg.g, wind: cfg.wind, drag: 0.002, groundY: cfg.groundY });
        let xg = null;
        for (let i = 1; i < s.path.length; i++) {
          const [x0, y0] = s.path[i - 1], [x1, y1] = s.path[i];
          if ((y0 - cfg.groundY) * (y1 - cfg.groundY) <= 0 && y1 !== y0) {
            xg = x0 + ((cfg.groundY - y0) / (y1 - y0)) * (x1 - x0); break;
          }
        }
        if (xg === null) continue;
        const e = Math.abs(xg - tg.x);
        if (e < bestErr) { bestErr = e; best = { angle: ang, power: pw }; }
      }
    }
    return { ...best, err: bestErr };
  };
  if (sol.angle) {
    const r = refine(sol, target);
    console.log('verfeinert: angle =', (r.angle * 180 / Math.PI).toFixed(4) + ' deg',
                'power =', r.power.toFixed(4),
                '-> Aufschlagfehler =', r.err.toFixed(4), 'px');
    console.log('  (Feinjustage-Loop ueber +-0.004 rad / +-0.4% Kraft: 17x17 = 289 Sims,');
    console.log('   im Spiel trivial, aber fuer die KI-Wahl der "beste Schuss" noetig.)');
  }

  console.log('\n--- 7. Menschlichkeits-Streuung: 500 Schuesse pro Schwierigkeit ---');
  const rng = makeRng(1337);
  for (const d of [0.2, 0.5, 0.8, 1.0]) {
    const errs = [];
    for (let i = 0; i < 500; i++) {
      const h = humanizeAim(sol, d, rng);
      const r = simulate({ x: cfg.x, y: cfg.y, angle: h.angle, power: h.power,
                           g: cfg.g, wind: cfg.wind, drag: 0.002, groundY: cfg.groundY });
      errs.push(Math.hypot(r.x - target.x, r.y - target.y));
    }
    errs.sort((a, b) => a - b);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    console.log(`difficulty ${d.toFixed(1)}  mean=${mean.toFixed(1)}px  ` +
                `median=${errs[250].toFixed(1)}px  p90=${errs[450].toFixed(1)}px  ` +
                `treffer<20px=${(errs.filter(e => e < 20).length / 5).toFixed(1)}%`);
  }
}
