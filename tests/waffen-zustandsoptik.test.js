/**
 * N-15 und GP-8: Zustandsanzeigen der Waffenwirkung (Minen, Schild, Bereit-Puls, Laser), Schweif langsamer
 * Geschosse und die Feinabstimmung der Waffenposen je Katalogwerte. Reine Rechnung ohne Canvas.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  MinenAlter, minenZustand, MINEN_FALL_DAUER, MINEN_STAUB_DAUER, MINEN_SCHARF_DAUER, MINEN_FALL_HOEHE,
  zeichneMinenFuss, minenLampe, zeichneFigurSchild, zeichneSchildBlase,
  SchildAnzeige, SCHILD_TREFFER_DAUER, SCHILD_WECHSEL_DAUER, BereitPuls, bereitPuls, BEREIT_PULS_DAUER, strahlBreite,
} from '../src/client/waffenZustandsOptik.js';
import {
  SchweifRing, SCHWEIF_LAENGE, SCHWEIF_MIN_ABSTAND, GeschossLagen, parameterFuerWaffe, waffenParameter, KORREKTUREN,
  waffenPose, neuePose, neueZeiten,
} from '../src/client/waffenAnimation.js';

// ----------------------------------------------------------------- Minen

test('Mine: fällt von oben, setzt auf, staucht, staubt und ist danach in Ruhe', () => {
  assert.equal(minenZustand(0).hoehe, MINEN_FALL_HOEHE);
  const mitte = minenZustand(MINEN_FALL_DAUER / 2);
  assert.ok(mitte.hoehe > 0 && mitte.hoehe < MINEN_FALL_HOEHE);
  const auf = minenZustand(MINEN_FALL_DAUER + 0.05);
  assert.equal(auf.hoehe, 0);
  assert.ok(auf.stauch > 0 && auf.staub > 0, 'nach dem Aufsetzen Stauchen und Staub');
  const ruhe = minenZustand(MINEN_FALL_DAUER + MINEN_STAUB_DAUER + 0.01);
  assert.deepEqual([ruhe.hoehe, ruhe.stauch, ruhe.staub], [0, 0, 0]);
  const stetig = minenZustand(MINEN_FALL_DAUER - 1e-6);
  assert.ok(stetig.hoehe < 0.01, 'kein Sprung beim Aufsetzen');
});

test('Mine: Scharfschalten blinkt schnell, danach im Takt; Lämpchen aus, solange sie fällt', () => {
  assert.equal(minenZustand(0.1).lampeAn(0), false);
  const scharf = minenZustand(MINEN_FALL_DAUER + 0.1);
  assert.ok(scharf.scharfAnteil > 0.8);
  const folge = t => Array.from({ length: 16 }, (_, i) => scharf.lampeAn(t + i / 32));
  assert.ok(folge(0).includes(true) && folge(0).includes(false), 'blinkt');
  const fertig = minenZustand(MINEN_FALL_DAUER + MINEN_SCHARF_DAUER + 1);
  assert.equal(fertig.scharfAnteil, 0);
  // 2 Hz: eine halbe Periode (0,25 s) an, 0,25 s aus.
  assert.equal(fertig.lampeAn(0.1), true);
  assert.equal(fertig.lampeAn(0.35), false);
});

test('Mine, Reduced Motion: kein Fallen, kein Staub, Lämpchen dauerhaft an', () => {
  for (const alter of [0, 0.1, 0.3, 0.5, 2]) {
    const z = minenZustand(alter, true);
    assert.deepEqual([z.hoehe, z.stauch, z.staub], [0, 0, 0], `alter ${alter}`);
  }
  assert.equal(minenZustand(0.5, true).lampeAn(0.1), true);
  assert.equal(minenZustand(0.5, true).lampeAn(0.35), true);
});

test('Minenalter: Minen vom Kartenaufbau liegen sofort, später abgelegte fallen, Verschwundene werden vergessen', () => {
  const m = new MinenAlter();
  assert.equal(m.alter(1, 10), Infinity);
  m.abschluss(new Set([1]));
  assert.equal(m.alter(1, 11), Infinity, 'bleibt alt');
  assert.equal(m.alter(2, 11), 0, 'neue Mine beginnt bei 0');
  assert.ok(Math.abs(m.alter(2, 11.2) - 0.2) < 1e-9);
  m.abschluss(new Set([2]));
  assert.equal(m.gesehen.has(1), false);
  assert.equal(m.alter(1, 12), 0, 'gleiche ID nach dem Vergessen zählt als neu');
  m.leere();
  assert.equal(m.alter(5, 20), Infinity, 'nach dem Zurücksetzen (neue Partie) wieder Aufbau');
});

// ----------------------------------------------------------------- Schild

test('Schild: vorhandenes Schild steht beim ersten Bild einfach da, ohne Aufbau und Treffer', () => {
  const s = new SchildAnzeige();
  const z = s.fuehre(1, 40, 5);
  assert.equal(z.aufbau, 1);
  assert.equal(z.treffer, 0);
  assert.equal(z.platzt, 0);
  assert.ok(z.staerke > 0);
});

test('Schild: ohne Schild nichts zu zeichnen', () => {
  const s = new SchildAnzeige();
  assert.equal(s.fuehre(1, 0, 1), null);
  assert.equal(s.fuehre(1, undefined, 2), null);
  assert.equal(s.fuehre(1, Number.NaN, 3), null);
});

test('Schild: Anstieg baut auf, Absinken blitzt, Wegfall zerplatzt und endet', () => {
  const s = new SchildAnzeige();
  s.fuehre(7, 0, 0);
  const neu = s.fuehre(7, 40, 1);
  assert.equal(neu.aufbau, 0);
  assert.ok(s.fuehre(7, 40, 1 + SCHILD_WECHSEL_DAUER / 2).aufbau > 0.4);
  assert.equal(s.fuehre(7, 40, 2).aufbau, 1);
  const treffer = s.fuehre(7, 25, 3);
  assert.equal(treffer.treffer, 1);
  assert.ok(treffer.staerke < 1 && treffer.staerke > 0);
  assert.ok(s.fuehre(7, 25, 3 + SCHILD_TREFFER_DAUER / 2).treffer < 0.5);
  assert.equal(s.fuehre(7, 25, 3 + SCHILD_TREFFER_DAUER + 0.01).treffer, 0);
  const platzt = s.fuehre(7, 0, 4);
  assert.equal(platzt.platzt, 1);
  assert.equal(platzt.staerke, 0);
  assert.ok(s.fuehre(7, 0, 4 + SCHILD_WECHSEL_DAUER / 2).platzt > 0);
  assert.equal(s.fuehre(7, 0, 4 + SCHILD_WECHSEL_DAUER + SCHILD_TREFFER_DAUER + 0.1), null, 'nach dem Zerplatzen nichts mehr');
});

test('Schild: Figuren sind unabhängig, vergiss und leere räumen auf', () => {
  const s = new SchildAnzeige();
  s.fuehre(1, 30, 0);
  s.fuehre(2, 0, 0);
  assert.equal(s.fuehre(2, 0, 1), null);
  assert.ok(s.fuehre(1, 30, 1));
  s.vergiss(1);
  assert.equal(s.stand.has(1), false);
  s.leere();
  assert.equal(s.stand.size, 0);
});

// ----------------------------------------------------------------- Bereit-Puls und Laser

test('Bereit-Puls: nur beim Übergang laden -> bereit bei derselben Waffe in zusammenhängenden Bildern', () => {
  const z = BereitPuls.neu();
  assert.equal(BereitPuls.pruefe(z, 'pa_1', 0.4, 1, 10), Infinity, 'erstes Bild: kein Puls');
  assert.equal(BereitPuls.pruefe(z, 'pa_1', 0.8, 2, 10.02), Infinity);
  assert.ok(Math.abs(BereitPuls.pruefe(z, 'pa_1', 1, 3, 10.04)) < 1e-9, 'Bereitwerden: Puls beginnt bei 0');
  assert.ok(Math.abs(BereitPuls.pruefe(z, 'pa_1', 1, 4, 10.14) - 0.1) < 1e-9);
  // Eine bereite Waffe bleibt bereit: kein neuer Puls.
  assert.ok(BereitPuls.pruefe(z, 'pa_1', 1, 5, 12) > BEREIT_PULS_DAUER);
  const x = BereitPuls.neu();
  BereitPuls.pruefe(x, 'pa_1', 0.5, 1, 0);
  assert.equal(BereitPuls.pruefe(x, 'pa_2', 1, 2, 0.02), Infinity, 'Waffenwechsel ist kein Bereitwerden');
  // Figur lange nicht gezeichnet (außerhalb des Bildes): kein Nach-Puls.
  const y = BereitPuls.neu();
  BereitPuls.pruefe(y, 'pa_1', 0.5, 1, 0);
  assert.equal(BereitPuls.pruefe(y, 'pa_1', 1, 500, 8), Infinity);
});

test('Bereit-Puls: Gewicht fällt von 1 auf 0 und ist außerhalb des Fensters 0', () => {
  assert.equal(bereitPuls(0), 1);
  assert.ok(bereitPuls(BEREIT_PULS_DAUER / 2) < 0.3 && bereitPuls(BEREIT_PULS_DAUER / 2) > 0);
  assert.equal(bereitPuls(BEREIT_PULS_DAUER), 0);
  assert.equal(bereitPuls(Infinity), 0);
  assert.equal(bereitPuls(-1), 0);
});

test('Die Pose zeigt den Bereit-Puls als weiße Silhouette, auch bei reduzierter Bewegung', () => {
  const par = waffenParameter('ranged', 'pa_023');
  for (const reduziert of [false, true]) {
    const p = neuePose();
    waffenPose(par, { ...neueZeiten(), bereitSeit: 0.01 }, reduziert, p);
    assert.ok(p.weiss > 0.4, `weiss ${p.weiss} (reduziert ${reduziert})`);
    waffenPose(par, { ...neueZeiten(), bereitSeit: 1 }, reduziert, p);
    assert.equal(p.weiss, 0);
  }
});

test('Laser: Strahlbreite zieht sich beim Abklingen zusammen, bei reduzierter Bewegung konstant', () => {
  assert.equal(strahlBreite(1), 1);
  assert.ok(Math.abs(strahlBreite(0) - 0.35) < 1e-9);
  assert.ok(strahlBreite(0.5) < strahlBreite(0.9));
  assert.equal(strahlBreite(0.2, true), 1);
});

// ----------------------------------------------------------------- Schweif langsamer Geschosse

test('Schweif: langsames Geschoss bekommt einen Schweif von mindestens Mindestabstand mal Kapazität', () => {
  const langsam = new SchweifRing();
  for (let i = 0; i < 400; i += 1) langsam.schiebe(i * 0.5, 0, 120, SCHWEIF_MIN_ABSTAND);
  const laenge = langsam.xAn(langsam.anzahl - 1) - langsam.xAn(0);
  assert.ok(laenge >= SCHWEIF_MIN_ABSTAND * (SCHWEIF_LAENGE - 2), `Schweif nur ${laenge} px lang`);
  const alt = new SchweifRing();
  for (let i = 0; i < 400; i += 1) alt.schiebe(i * 0.5, 0);
  assert.ok(alt.xAn(alt.anzahl - 1) - alt.xAn(0) < 4, 'ohne Mindestabstand bleibt der Schweif ein Stummel');
});

test('Schweif: schnelle Geschosse (mehr als der Mindestabstand je Bild) merken sich jedes Bild wie zuvor', () => {
  const r = new SchweifRing();
  for (let i = 0; i < 20; i += 1) r.schiebe(i * 10, 0, 120, SCHWEIF_MIN_ABSTAND);
  assert.equal(r.anzahl, SCHWEIF_LAENGE);
  assert.equal(r.xAn(r.anzahl - 1), 190);
  assert.equal(r.xAn(r.anzahl - 2), 180);
});

test('Schweif: Sprünge leeren ihn auch mit Mindestabstand, GeschossLagen reicht ihn durch', () => {
  const r = new SchweifRing();
  r.schiebe(0, 0, 120, 3); r.schiebe(10, 0, 120, 3);
  r.schiebe(5000, 0, 120, 3);
  assert.equal(r.anzahl, 1);
  const l = new GeschossLagen();
  for (let i = 0; i < 100; i += 1) l.fuehre([{ entityId: 1, x: i * 0.5, y: 0 }], i / 60);
  const lage = l.lage(1);
  assert.ok(lage.ring.xAn(lage.ring.anzahl - 1) - lage.ring.xAn(0) >= SCHWEIF_MIN_ABSTAND * (SCHWEIF_LAENGE - 2));
});

// ----------------------------------------------------------------- GP-8: Feinabstimmung

test('GP-8: alle 150 Waffen haben einen eigenen Parametersatz (vorher teilten 122 ihren mit anderen)', () => {
  const saetze = new Set(WEAPONS.map(w => JSON.stringify(parameterFuerWaffe(w, null))));
  assert.equal(saetze.size, WEAPONS.length);
});

test('GP-8: Rückstoß wächst mit dem Katalogwert, Blitz mit dem Sprengradius, ohne Werte bleibt der Satz der Kategorie', () => {
  const schwach = waffenParameter('ranged', 'pa_zzz', false, '', false, '', { knockback: 0, blastRadius: 0 });
  const stark = waffenParameter('ranged', 'pa_zzz', false, '', false, '', { knockback: 90, blastRadius: 90 });
  assert.ok(stark.kick > schwach.kick * 1.3);
  assert.ok(stark.blitzGroesse > schwach.blitzGroesse * 1.25);
  const basis = waffenParameter('ranged', '');
  assert.equal(basis.kick, 4.6, 'ohne ID keine Feinabstimmung');
  assert.equal(waffenParameter('ranged', 'pa_zzz', false, '', false, '', { knockback: 0, blastRadius: 0 }).kick, 4.6, 'ohne Rückstoßwert unverändert');
});

test('GP-8: Pendeltakt und Ziehdauer weichen höchstens um ±8 % bzw. ±6 % ab und sind je ID fest', () => {
  for (const w of WEAPONS) {
    const p = parameterFuerWaffe(w, null);
    const basis = waffenParameter(w.category, '', false, '', false, '');
    if (KORREKTUREN[w.id]?.idleTempo === undefined) assert.ok(Math.abs(p.idleTempo / basis.idleTempo - 1) <= 0.0801, `${w.id} idleTempo`);
    if (KORREKTUREN[w.id]?.ziehenDauer === undefined) assert.ok(Math.abs(p.ziehenDauer / basis.ziehenDauer - 1) <= 0.0601, `${w.id} ziehenDauer`);
    assert.equal(parameterFuerWaffe(w, null), p, 'gleiche ID, gleicher (zwischengespeicherter) Satz');
  }
});

test('GP-8: ausdrückliche Korrekturen je Waffe gewinnen über die Feinabstimmung', () => {
  const pa095 = WEAPONS.find(w => w.id === 'pa_095');
  assert.equal(parameterFuerWaffe(pa095, null).idleTempo, KORREKTUREN.pa_095.idleTempo);
});

// ----------------------------------------------------------------- Zeichenhelfer (Aufrufprotokoll statt Canvas)

/** Canvas-Attrappe: merkt Aufrufe und fängt Verlaufsobjekte ab. */
function attrappe() {
  const aufrufe = [];
  const ctx = new Proxy({}, {
    get: (_, name) => {
      if (name === 'aufrufe') return aufrufe;
      if (name === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...a) => { aufrufe.push([name, ...a]); };
    },
    set: () => true,
  });
  return ctx;
}

test('Minenfuß: ohne Absetzen nur Schatten, beim Fallen Versatz nach oben, beim Aufsetzen Stauchung', () => {
  const ruhe = attrappe();
  zeichneMinenFuss(ruhe, minenZustand(Infinity));
  assert.deepEqual(ruhe.aufrufe.find(a => a[0] === 'translate'), ['translate', 0, -0]);
  assert.equal(ruhe.aufrufe.some(a => a[0] === 'scale'), false);
  const fall = attrappe();
  zeichneMinenFuss(fall, minenZustand(0.05));
  assert.ok(fall.aufrufe.find(a => a[0] === 'translate')[2] < -15, 'hängt hoch über dem Boden');
  const stauch = attrappe();
  zeichneMinenFuss(stauch, minenZustand(MINEN_FALL_DAUER + 0.05));
  const sk = stauch.aufrufe.find(a => a[0] === 'scale');
  assert.ok(sk && sk[1] > 1 && sk[2] < 1, 'Scheibe wird breiter und flacher');
});

test('Minenlämpchen: Absetzen/Scharfschalten nach der Mine, danach der bisherige Zwei-Hertz-Takt, reduziert dauerhaft an', () => {
  const fertig = minenZustand(Infinity);
  assert.equal(minenLampe(fertig, 0, false, 0), true);
  assert.equal(minenLampe(fertig, 0, false, 30), false);
  assert.equal(minenLampe(fertig, 0, false, 60), true);
  assert.equal(minenLampe(fertig, 0, true, 30), true);
  assert.equal(minenLampe(minenZustand(0.1), 0, false, 0), false, 'beim Fallen aus');
});

test('Figurschild: zeichnet nur bei Schildwert, mit Mitte auf halber Höhe über dem Fußpunkt', () => {
  const anzeige = new SchildAnzeige();
  const leer = attrappe();
  zeichneFigurSchild(leer, anzeige, { id: 1, x: 100, y: 200, hoehe: 60, schild: 0 }, 1, false);
  assert.deepEqual(leer.aufrufe, []);
  const voll = attrappe();
  zeichneFigurSchild(voll, anzeige, { id: 1, x: 100, y: 200, hoehe: 60, schild: 40 }, 2, false);
  assert.deepEqual(voll.aufrufe.find(a => a[0] === 'translate'), ['translate', 100, 170]);
  assert.ok(voll.aufrufe.some(a => a[0] === 'ellipse'));
  assert.equal(voll.aufrufe.filter(a => a[0] === 'save').length, voll.aufrufe.filter(a => a[0] === 'restore').length, 'save/restore ausgeglichen');
});

test('Schildblase: bei reduzierter Bewegung bleibt der Glanzbogen stehen, die Blase wächst und platzt nicht auf', () => {
  const z = { staerke: 1, aufbau: 0.2, treffer: 0, platzt: 0 };
  const a = attrappe();
  const b = attrappe();
  zeichneSchildBlase(a, z, 20, 30, 1.0, true);
  zeichneSchildBlase(b, z, 20, 30, 7.7, true);
  assert.deepEqual(a.aufrufe, b.aufrufe, 'unabhängig von der Zeit');
  const e = a.aufrufe.find(x => x[0] === 'ellipse');
  assert.equal(e[3], 20, 'volle Größe trotz Aufbau 0,2');
});
