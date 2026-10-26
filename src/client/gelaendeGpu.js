/**
 * Materialmalerei des Geländes auf der GPU (WebGL2).
 *
 * ## Warum dieses Modul existiert
 *
 * Das Gelände sah gleichförmig aus: `stoffOptik.tinteStoffe` mischt je Pixel nur
 * 58 % Stofffarbe über die Gesteinsfarbe, moduliert von einem Muster-Schalter mit
 * fünf Fällen und einer **gekachelten 512-px-Textur** — dieselbe Kachel
 * wiederholt sich also alle 512 px. Die Bildvorlagen des Auftraggebers
 * (`assets/gelaende-quelle/sheet-a-sidecut.jpg`, `sheet-c-querschnitt.jpg`)
 * zeigen dagegen Materialien mit eigener Körnung, eigenem Glanz und eigenen
 * Strukturen: Platten und Risse im Fels, Dünen im Sand, Facetten im Eis,
 * Jahresringe im Holz, freiliegende Ziegel im Beton.
 *
 * ## Was hier passiert — und was nicht
 *
 * Die **Stoffkarte bleibt Wahrheit**. Sie wird als Textur hochgeladen; der
 * Shader verzerrt nur den *Blick* darauf (Domain-Warp in Pixeln) und malt je
 * Zelle ihr Material. Kein Eingriff in Kollision, Hash oder Determinismus.
 *
 * Die Steine, Lagen und das Kantenlicht rechnet weiter `faerbeGelaende` auf der
 * CPU; ihr Ergebnis kommt als Textur herein und wird vom Material überlagert.
 * Das hält den neuen Weg isoliert prüfbar, und der Rückfall (ohne WebGL2) ist
 * pixelgleich zu vorher.
 *
 * ## Gemessener Spielraum (2026-10-26, 2560×1440 = 3,69 Mio. Pixel)
 *
 * | Weg | Kern | + Rücklesen |
 * | :-- | --: | --: |
 * | CPU (`tinteStoffe`) | — | ~400 ms gesamt |
 * | WebGL2 / Intel HD 3000 | 45 ms | 11 ms |
 * | WebGL2 / GT 540M | 31 ms | 12 ms |
 *
 * @module gelaendeGpu
 */
import { STOFFE } from '../shared/config/stoffe.js';

/** Kantenlänge einer Stoffzelle in Pixeln (`STOFF_ZELLE` in `shared/stoffkarte.js`). */
export const STOFF_ZELLE = 8;

/**
 * Packt die Stoffkarte in ein Feld, das als Textur hochgeladen werden kann.
 *
 * Die Überlagerung `karte.ueber` trägt den Stoff, der durch Feuer oder
 * Erstarrung **entstanden** ist, und gewinnt gegen das Feld — dieselbe Regel wie
 * in `stoffAm` (`shared/stoffkarte.js`).
 *
 * @param {{feld:Uint8Array, spalten:number, zeilen:number, ueber?:Uint8Array|null}} karte
 * @returns {{daten:Uint8Array, spalten:number, zeilen:number}}
 */
export function packeStofffeld(karte) {
  if (!karte || !karte.feld || !(karte.spalten > 0) || !(karte.zeilen > 0)) {
    throw new TypeError('packeStofffeld braucht eine Stoffkarte mit feld, spalten und zeilen');
  }
  const { spalten, zeilen, feld, ueber } = karte;
  const n = spalten * zeilen;
  if (feld.length < n) {
    throw new TypeError(`Die Stoffkarte ist zu kurz: ${feld.length} Werte für ${spalten}×${zeilen}`);
  }
  if (!ueber) return { daten: Uint8Array.from(feld.subarray(0, n)), spalten, zeilen };

  const daten = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) daten[i] = ueber[i] ? ueber[i] - 1 : feld[i];
  return { daten, spalten, zeilen };
}

/**
 * Erkennt einen WebGL2-Kontext.
 *
 * Kein DOM (Node, Tests, Kopfbetrieb) ist **kein Fehler**, sondern ein Grund:
 * Der Aufrufer soll ihn melden können, statt eine Ausnahme zu fangen.
 *
 * @param {object} [dom] - `document`-Ersatz, für Tests injizierbar
 * @returns {{kontext: object|null, grund: string}}
 */
export function erkenneWebGl2(dom = globalThis.document) {
  if (!dom || typeof dom.createElement !== 'function') {
    return { kontext: null, grund: 'kein document (kein Browser)' };
  }
  let leinwand = null;
  try {
    leinwand = dom.createElement('canvas');
  } catch (error) {
    return { kontext: null, grund: `Leinwand fehlgeschlagen: ${error.message}` };
  }
  if (!leinwand || typeof leinwand.getContext !== 'function') {
    return { kontext: null, grund: 'Leinwand ohne getContext' };
  }
  const kontext = leinwand.getContext('webgl2', { antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!kontext) return { kontext: null, grund: 'kein WebGL2-Kontext' };
  return { kontext, grund: 'bereit' };
}

/**
 * Die Farben aller Stoffe als flaches Feld für den Shader (je Stoff drei Kanäle).
 *
 * @returns {Float32Array}
 */
export function stoffFarben() {
  const farben = new Float32Array(STOFFE.length * 3);
  for (let id = 0; id < STOFFE.length; id += 1) {
    const st = STOFFE[id];
    if (!st || !st.farbe) continue;
    farben[id * 3] = st.farbe[0];
    farben[id * 3 + 1] = st.farbe[1];
    farben[id * 3 + 2] = st.farbe[2];
  }
  return farben;
}

/** Vollbild-Dreieck als Vertex-Shader. */
const VERTEX_GLSL = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

/**
 * Der Fragment-Shader der Materialmalerei.
 *
 * Aufbau je Pixel:
 *  1. **Domain-Warp** — die 8-px-Zellkanten werden mit Rauschen verschoben, damit
 *     Materialgrenzen ausfransen statt zu springen (`verzerrung`).
 *  2. **Schema je Material** — acht ausgebaute Materialien mit eigenem Detail,
 *     die übrigen erben das ähnlichste (`schema:<name>`).
 *  3. **Kontur** — dort, wo zwei Materialien aufeinandertreffen, dunkelt eine
 *     Ader das Bild ab, wie die dunkle Linie in den Vorlagen.
 *  4. **Glut** — Kristall und Magiekristall leuchten aus ihrem Kern.
 *
 * Alles entsteht aus Position und Seed: keine Textur, also **keine
 * Kachelwiederholung**.
 */
export const STOFF_SHADER_GLSL = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uBild;        // CPU-gemaltes Gelände (Steine, Lagen, Kantenlicht)
uniform highp usampler2D uStoffe; // Stoffkarte, ein Byte je Zelle (Ganzzahl-Sampler braucht eigene Präzision)
uniform vec2 uAufloesung;       // Karte in Pixeln
uniform vec2 uZellen;           // Stoffkarte in Zellen
uniform vec3 uFarben[${STOFFE.length}];
uniform float uSeed;
uniform float uDeckung;         // wie stark das Material die Gesteinsfarbe überlagert

out vec4 outFarbe;

/* ---------------------------------------------------------------- Rauschen */

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.013);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float wertRauschen(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float summe = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    summe += amp * wertRauschen(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return summe;
}

/**
 * Rissnetz aus Rausch-Isolinien statt Gitterlinien.
 *
 * FUND (belegt, eigener Fehler): Zuerst lagen Platten und Risse auf einem
 * REGELMÄSSIGEN Gitter ('fract(p / groesse)') — im Bild stand ein sichtbares
 * Karomuster über dem ganzen Gestein, genau das Muster, das wir loswerden
 * wollten. Risse entstehen jetzt dort, wo ein Rauschfeld seine Mittellinie
 * kreuzt: unregelmäßig, ohne Wiederholung.
 *
 * @returns 1 auf der Risslinie, 0 im Inneren der Platte
 */
float rissnetz(vec2 p, float skala, float breite) {
  float n = fbm(p * skala);
  return 1.0 - smoothstep(0.0, breite, abs(n - 0.5));
}

/** Abstand zur nächsten (leicht versetzten) Zellgrenze in Pixeln. */
float kantenNaehe(vec2 p, float groesse) {
  vec2 q = p / groesse;
  vec2 i = floor(q);
  q += (vec2(hash21(i), hash21(i + 37.0)) - 0.5) * 0.4;
  vec2 f = fract(q);
  vec2 d = min(f, 1.0 - f) * groesse;
  return min(d.x, d.y);
}

/* --------------------------------------------------------- Materialschemata */

// schema:erde — Krümel, dunkle Körner, einzelne Wurmlöcher
float schemaErde(vec2 p) {
  float grob = fbm(p * 0.045);
  float fein = wertRauschen(p * 0.55);
  float koerner = step(0.82, wertRauschen(p * 1.7));
  return 0.72 + grob * 0.34 + fein * 0.16 - koerner * 0.22;
}

// schema:fels — Platten mit Rissen aus Rausch-Isolinien (kein Gitter)
float schemaFels(vec2 p) {
  float riss = rissnetz(p, 0.021, 0.035);
  float platte = 0.84 + 0.28 * fbm(p * 0.012);
  float korn = wertRauschen(p * 0.7) * 0.12;
  return mix(0.40, platte + korn, 1.0 - riss * 0.85);
}

// schema:sand — Dünenwellen plus Körnung
float schemaSand(vec2 p) {
  float welle = sin(p.y * 0.09 + fbm(p * 0.02) * 5.0) * 0.5 + 0.5;
  float korn = wertRauschen(p * 2.2);
  return 0.86 + welle * 0.14 + korn * 0.10;
}

// schema:eis — Facetten mit hellen Bruchkanten (Rausch, kein Gitter)
float schemaEis(vec2 p) {
  float bruch = rissnetz(p + 13.0, 0.03, 0.05);
  float schimmer = 0.92 + fbm(p * 0.02) * 0.4;
  return mix(schimmer, schimmer + 0.45, bruch);
}

// schema:basalt — Säulen (senkrecht) mit Poren
float schemaBasalt(vec2 p) {
  float saeule = 0.82 + 0.18 * hash21(vec2(floor(p.x / 22.0), 1.0));
  float poren = step(0.9, wertRauschen(p * 0.9)) * 0.35;
  return saeule - poren;
}

// schema:kristall — Facetten mit hellem Kern (Glut)
float schemaKristall(vec2 p) {
  float bruch = rissnetz(p + 41.0, 0.038, 0.045);
  float glanz = 0.95 + fbm(p * 0.05) * 0.5;
  return mix(glanz, glanz + 0.6, bruch);
}

// schema:holz — Fasern und Jahresringe
float schemaHolz(vec2 p) {
  float faser = sin(p.y * 0.5 + fbm(p * 0.08) * 6.0) * 0.5 + 0.5;
  float ring = step(0.72, fract(length(p - vec2(0.0, 40.0)) / 26.0));
  return 0.82 + faser * 0.22 - ring * 0.12;
}

// schema:beton — Fugen aus Rauschen, freiliegende Ziegel
float schemaBeton(vec2 p) {
  float fuge = rissnetz(p, 0.016, 0.03);
  float fleck = 0.88 + 0.18 * wertRauschen(p * 0.35);
  float ziegel = step(0.88, wertRauschen(p * 0.6)) * 0.35;
  return mix(0.5, fleck, 1.0 - fuge * 0.8) + ziegel;
}

/** Welches Schema gilt für diesen Stoff? Acht eigene, der Rest erbt. */
float stoffDetail(vec2 p, int id) {
  if (id == 0) return schemaErde(p);      // erde
  if (id == 5) return schemaFels(p);      // fels
  if (id == 1) return schemaSand(p);      // sand
  if (id == 7) return schemaEis(p);       // eis
  if (id == 11) return schemaBasalt(p);   // basalt
  if (id == 8) return schemaKristall(p);  // kristall
  if (id == 4) return schemaHolz(p);      // holz
  if (id == 14) return schemaBeton(p);    // beton
  // Verwandte erben: Schnee/Pilz/Asche körnig, Obsidian/Kristall facetten,
  // Metall Platten, Glas facetten, Koralle poroes, Regolith körnig.
  if (id == 17) return schemaKristall(p);
  if (id == 15) return schemaEis(p);
  if (id == 6) return schemaBasalt(p);
  if (id == 9) return schemaBeton(p);
  return schemaErde(p);
}

/* ------------------------------------------------------------------- Zelle */

ivec2 zelleAn(vec2 p) {
  // verzerrung: die 8-px-Kanten werden mit Rauschen verschoben (Domain-Warp).
  vec2 w = vec2(fbm(p * 0.031), fbm(p * 0.031 + 21.7)) - 0.5;
  vec2 q = clamp(p + w * 14.0, vec2(0.0), uAufloesung - 1.0);
  ivec2 z = ivec2(q / ${STOFF_ZELLE.toFixed(1)});
  return clamp(z, ivec2(0), ivec2(uZellen) - 1);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 uv = p / uAufloesung;

  vec4 grund = texture(uBild, uv);
  if (grund.a <= 0.0) { outFarbe = grund; return; }

  ivec2 zelle = zelleAn(p);
  int id = int(texelFetch(uStoffe, zelle, 0).r);
  if (id < 0 || id >= ${STOFFE.length}) id = 0;

  vec3 stoffFarbe = uFarben[id];
  float detail = stoffDetail(p, id);

  // Stofffarbe mal Detail, über die Gesteinsfarbe gelegt.
  vec3 farbe = mix(grund.rgb, stoffFarbe * detail, uDeckung);

  // kontur: an Materialgrenzen eine dunkle Ader (wie die dunkle Linie der Vorlagen).
  float nachbarRechts = float(texelFetch(uStoffe, clamp(zelle + ivec2(1, 0), ivec2(0), ivec2(uZellen) - 1), 0).r);
  float nachbarUnten = float(texelFetch(uStoffe, clamp(zelle + ivec2(0, 1), ivec2(0), ivec2(uZellen) - 1), 0).r);
  float grenze = (nachbarRechts != float(id) || nachbarUnten != float(id)) ? 1.0 : 0.0;
  float rand = 1.0 - smoothstep(0.0, 3.5, kantenNaehe(p, ${STOFF_ZELLE.toFixed(1)}));
  farbe *= 1.0 - grenze * rand * 0.45;

  // glühen: Kristall und Magiekristall leuchten aus dem Kern.
  if (id == 8 || id == 17) {
    float kern = 1.0 - smoothstep(0.0, 30.0, kantenNaehe(p, 46.0));
    farbe += stoffFarbe * kern * 0.35;
  }

  outFarbe = vec4(clamp(farbe, 0.0, 1.0) * grund.a, grund.a);
}
`;

/**
 * Zeichnet die Materialmalerei über ein bereits gefärbtes Geländebild.
 *
 * @param {object} optionen
 * @param {Uint8ClampedArray} optionen.bild - RGBA der CPU-Ebene (wird nicht verändert)
 * @param {number} optionen.breite
 * @param {number} optionen.hoehe
 * @param {{daten:Uint8Array, spalten:number, zeilen:number}} optionen.stofffeld - aus `packeStofffeld`
 * @param {object} optionen.gpu - Kontext und Programm aus `bereiteGelaendeGpu`
 * @param {number} [optionen.seed]
 * @param {number} [optionen.deckung]
 * @returns {Uint8ClampedArray|null} neues Pixelfeld oder null, wenn nicht möglich
 */
export function tinteStoffeGpu({ bild, breite, hoehe, stofffeld, gpu, seed = 0, deckung = 0.72 }) {
  const { gl, programm, texturBild, texturStoffe, puffer, orte } = gpu;
  if (!gl || !programm) return null;

  /*
   * Die Zeichenfläche muss so groß sein wie die Karte. FUND (belegt, eigener
   * Fehler): Ohne diese Zuweisung blieb der Puffer bei den 300×150 der
   * Attrappen-Leinwand — es wurde nur ein Streifen links unten gemalt, der Rest
   * blieb leer.
   */
  if (gl.canvas && (gl.canvas.width !== breite || gl.canvas.height !== hoehe)) {
    gl.canvas.width = breite;
    gl.canvas.height = hoehe;
  }
  gl.viewport(0, 0, breite, hoehe);
  gl.useProgram(programm);

  gl.bindTexture(gl.TEXTURE_2D, texturBild);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, breite, hoehe, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(bild.buffer, bild.byteOffset, bild.byteLength));

  gl.bindTexture(gl.TEXTURE_2D, texturStoffe);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, stofffeld.spalten, stofffeld.zeilen, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, stofffeld.daten);

  gl.uniform2f(orte.aufloesung, breite, hoehe);
  gl.uniform2f(orte.zellen, stofffeld.spalten, stofffeld.zeilen);
  gl.uniform1f(orte.seed, seed);
  gl.uniform1f(orte.deckung, deckung);
  gl.uniform3fv(orte.farben, gpu.farben);
  gl.uniform1i(orte.bild, 0);
  gl.uniform1i(orte.stoffe, 1);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texturBild);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texturStoffe);

  gl.bindVertexArray(gpu.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const roh = new Uint8Array(breite * hoehe * 4);
  gl.readPixels(0, 0, breite, hoehe, gl.RGBA, gl.UNSIGNED_BYTE, roh);
  const fehler = gl.getError();
  if (fehler !== 0) return null;

  // GL liest von unten nach oben — für ein ImageData zeilenweise umdrehen.
  const aus = new Uint8ClampedArray(breite * hoehe * 4);
  const zeilenBytes = breite * 4;
  for (let y = 0; y < hoehe; y += 1) {
    const quelle = (hoehe - 1 - y) * zeilenBytes;
    aus.set(roh.subarray(quelle, quelle + zeilenBytes), y * zeilenBytes);
  }
  void puffer;
  return aus;
}

/**
 * Bereitet Kontext, Programm, Texturen und Puffer einmalig vor.
 *
 * @param {object} gl - WebGL2-Kontext
 * @returns {object|null} Zustand für `tinteStoffeGpu` oder null bei Fehler
 */
export function bereiteGelaendeGpu(gl) {
  if (!gl) return null;
  const kompiliere = (typ, quelle) => {
    const s = gl.createShader(typ);
    gl.shaderSource(s, quelle);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`Shader-Fehler: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };

  try {
    const programm = gl.createProgram();
    gl.attachShader(programm, kompiliere(gl.VERTEX_SHADER, VERTEX_GLSL));
    gl.attachShader(programm, kompiliere(gl.FRAGMENT_SHADER, STOFF_SHADER_GLSL));
    gl.linkProgram(programm);
    if (!gl.getProgramParameter(programm, gl.LINK_STATUS)) {
      throw new Error(`Link-Fehler: ${gl.getProgramInfoLog(programm)}`);
    }
    gl.useProgram(programm);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(programm, 'pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const texturBild = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texturBild);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texturStoffe = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texturStoffe);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const orte = {
      bild: gl.getUniformLocation(programm, 'uBild'),
      stoffe: gl.getUniformLocation(programm, 'uStoffe'),
      aufloesung: gl.getUniformLocation(programm, 'uAufloesung'),
      zellen: gl.getUniformLocation(programm, 'uZellen'),
      farben: gl.getUniformLocation(programm, 'uFarben[0]'),
      seed: gl.getUniformLocation(programm, 'uSeed'),
      deckung: gl.getUniformLocation(programm, 'uDeckung'),
    };

    /*
     * Der Shader rechnet in 0..1. FUND (belegt): Die Farbtabelle kam zuerst mit
     * den Katalogwerten 0..255 herein — jedes Pixel sättigte auf Weiß.
     */
    const farben = stoffFarben();
    for (let i = 0; i < farben.length; i += 1) farben[i] /= 255;

    return { gl, programm, vao, puffer, texturBild, texturStoffe, orte, farben };
  } catch (error) {
    gl.getExtension('WEBGL_lose_context')?.loseContext?.();
    void error;
    return null;
  }
}
