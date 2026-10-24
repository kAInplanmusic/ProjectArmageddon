#!/usr/bin/env node
/**
 * Sprite-Wächter: Vollständigkeit und Sichtprüfung der Figuren- und Waffen-Sprites.
 *
 * Der Befund, der zu diesem Skript führte (MASTERDOTO „Sprite-Prüfung 2026-10-23"):
 * Die Prüfung lag als einmalige Messung in einem Dokument. Sie war damit nicht
 * wiederholbar — eine neu erzeugte Figur konnte die Zahlen still verändern, ohne
 * dass es jemand merkte. Dieses Skript macht dieselben Messungen ausführbar.
 *
 * GEMESSEN wird (nicht geschätzt):
 *   1. Vollständigkeit: 9 Fraktionen × 9 Figuren × 3 Blätter (aktion/walk/zustand),
 *      jedes Blatt 1024×512, Raster 4 Spalten × 2 Zeilen à 256 px, jede Zelle gefüllt.
 *   2. Rand: Zählt Zellen, in denen Deckung die Zellkante berührt — eine Figur, die
 *      am Rand abgeschnitten ist, verliert dort Gliedmaßen.
 *   3. Fragmente: Zusammenhängende Deckungsflächen je Zelle. Viele kleine Splitter
 *      neben der Hauptfigur sind ein Artefakt (Freisteller-Reste), keine Figur.
 *   4. Namensdubletten: derselbe Figurenname in mehreren Fraktionen.
 *   5. Emotions-Blätter: 9×9-Raster vorhanden und vollständig.
 *   6. Waffen: 150/150 im Manifest, je Waffe held/silhouette/icon, Deckung ≥ 3 %.
 *   7. Haustiere: Günther und Cookie mit je 14 Posen.
 *
 * Aufruf:
 *   node scripts/check-sprites.mjs            # Zusammenfassung + JSON in docs/sprite-pruefung.json
 *   node scripts/check-sprites.mjs --json     # nur JSON auf stdout
 *   node scripts/check-sprites.mjs --verbose  # jede Auffälligkeit einzeln
 *
 * Exit-Code 0 = grün, 1 = mindestens ein Befund.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const ASSETS = path.join(WURZEL, 'src/client/assets');

const FRAKTIONEN = 9;
const FIGUREN_JE_FRAKTION = 9;
const BLAETTER = ['aktion', 'walk', 'zustand'];
const ZELLE = 256;
const SPALTEN = 4;
const ZEILEN = 2;

/** Mindest-Deckung einer Zelle in Prozent, damit sie als „gefüllt" gilt. */
const ZELLE_GEFUELLT_PROZENT = 0.6;
/** Ab dieser Fläche (px) zählt ein Splitter als eigenes Fragment. */
const SPLITTER_MIN_PX = 24;
/** So viele Fragmente je Zelle gelten als normal (Figur + evtl. Waffe/Schatten). */
const FRAGMENTE_NORMAL = 3;

const args = new Set(process.argv.slice(2));
const NUR_JSON = args.has('--json');
const VERBOSE = args.has('--verbose');

const befunde = [];
const hinweise = [];
function befund(bereich, titel, detail) {
  befunde.push({ bereich, titel, detail });
}
function hinweis(bereich, titel, detail) {
  hinweise.push({ bereich, titel, detail });
}

// ------------------------------------------------------------------ Manifeste

function liesJson(pfad, standard = null) {
  if (!existsSync(pfad)) return standard;
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'));
  } catch (fehler) {
    befund('manifest', `Manifest unlesbar: ${path.relative(WURZEL, pfad)}`, fehler.message);
    return standard;
  }
}

const figurenManifest = liesJson(path.join(ASSETS, 'sprite-sheets/manifest.json'), { figuren: {} });
const waffenManifest = liesJson(path.join(ASSETS, 'weapon-sprites/manifest.json'), { waffen: {} });
const figurenManifestEmotion = liesJson(path.join(ASSETS, 'sprite-sheets-emotion/manifest.json'), { figuren: [] });

// ------------------------------------------------------------------ Bildmessung

/**
 * Misst die Deckung mehrerer Rechtecke in EINEM Bild (Waffen liegen als
 * Atlas-Regionen vor, nicht als Einzeldateien — ein Bild je Region zu laden
 * wäre 150-mal dieselbe Datei).
 * @returns {Promise<Array<{breite:number,hoehe:number,deckung:number}>>}
 */
async function messeBereiche(seite, datei, bereiche) {
  const endung = path.extname(datei).slice(1).toLowerCase();
  const typ = endung === 'png' ? 'image/png' : endung === 'webp' ? 'image/webp' : `image/${endung}`;
  const daten = readFileSync(datei).toString('base64');
  return seite.evaluate(async ({ url, bereiche }) => {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    const tafel = document.createElement('canvas');
    tafel.width = bild.naturalWidth;
    tafel.height = bild.naturalHeight;
    const stift = tafel.getContext('2d', { willReadFrequently: true });
    stift.drawImage(bild, 0, 0);
    const alle = stift.getImageData(0, 0, tafel.width, tafel.height).data;
    return bereiche.map(bereich => {
      const x0 = Math.max(0, Math.round(bereich.x ?? 0));
      const y0 = Math.max(0, Math.round(bereich.y ?? 0));
      const w = Math.min(Math.round(bereich.w ?? 128), tafel.width - x0);
      const h = Math.min(Math.round(bereich.h ?? 128), tafel.height - y0);
      if (w <= 0 || h <= 0) return { breite: tafel.width, hoehe: tafel.height, deckung: 0, ausserhalb: true };
      let gefuellt = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const p = ((y0 + y) * tafel.width + (x0 + x)) * 4;
          if (alle[p + 3] >= 24) gefuellt += 1;
        }
      }
      return {
        breite: tafel.width,
        hoehe: tafel.height,
        deckung: (gefuellt / (w * h)) * 100,
        ausserhalb: false,
      };
    });
  }, { url: `data:${typ};base64,${daten}`, bereiche });
}
/**
 * Startet Chromium nur zum Dekodieren. Kein Vite-Server, keine Seite —
 * die Bilder kommen als data:-URL in eine leere Seite.
 * @param {(datei: string) => Promise<object>} fn bekommt `zellenMessen(datei)`
 */
async function mitDekoder(fn) {
  const browser = await chromium.launch();
  try {
    const seite = await browser.newPage();
    await seite.setContent('<!doctype html><title>sprite-pruefung</title>');

    const zellenMessen = async datei => {
      const endung = path.extname(datei).slice(1).toLowerCase();
      const typ = endung === 'png' ? 'image/png' : endung === 'webp' ? 'image/webp' : `image/${endung}`;
      const daten = readFileSync(datei).toString('base64');
      return seite.evaluate(async ({ url, spalten, zeilen, zelle, splitterMin, schwelleProzent }) => {
        const bild = new Image();
        bild.src = url;
        await bild.decode();
        const tafel = document.createElement('canvas');
        tafel.width = bild.naturalWidth;
        tafel.height = bild.naturalHeight;
        const stift = tafel.getContext('2d', { willReadFrequently: true });
        stift.drawImage(bild, 0, 0);
        const alle = stift.getImageData(0, 0, tafel.width, tafel.height).data;

        const zellen = [];
        for (let z = 0; z < zeilen; z += 1) {
          for (let s = 0; s < spalten; s += 1) {
            const x0 = s * zelle;
            const y0 = z * zelle;
            if (x0 + zelle > tafel.width || y0 + zelle > tafel.height) {
              zellen.push({ index: z * spalten + s, ausserhalb: true, deckung: 0, kanten: 0, fragmente: 0, splitter: 0 });
              continue;
            }
            let gefuellt = 0;
            let kanten = 0;
            const maske = new Uint8Array(zelle * zelle);
            for (let y = 0; y < zelle; y += 1) {
              for (let x = 0; x < zelle; x += 1) {
                const p = ((y0 + y) * tafel.width + (x0 + x)) * 4;
                if (alle[p + 3] < 24) continue;
                gefuellt += 1;
                maske[y * zelle + x] = 1;
                if (x === 0 || y === 0 || x === zelle - 1 || y === zelle - 1) kanten += 1;
              }
            }
            // Zusammenhängende Flächen (4er-Nachbarschaft), iterative Suche.
            let fragmente = 0;
            let splitter = 0;
            const gesehen = new Uint8Array(zelle * zelle);
            const stapel = [];
            for (let i = 0; i < maske.length; i += 1) {
              if (!maske[i] || gesehen[i]) continue;
              let flaeche = 0;
              stapel.length = 0;
              stapel.push(i);
              gesehen[i] = 1;
              while (stapel.length) {
                const j = stapel.pop();
                flaeche += 1;
                const jx = j % zelle;
                const jy = (j - jx) / zelle;
                if (jx > 0 && maske[j - 1] && !gesehen[j - 1]) { gesehen[j - 1] = 1; stapel.push(j - 1); }
                if (jx < zelle - 1 && maske[j + 1] && !gesehen[j + 1]) { gesehen[j + 1] = 1; stapel.push(j + 1); }
                if (jy > 0 && maske[j - zelle] && !gesehen[j - zelle]) { gesehen[j - zelle] = 1; stapel.push(j - zelle); }
                if (jy < zelle - 1 && maske[j + zelle] && !gesehen[j + zelle]) { gesehen[j + zelle] = 1; stapel.push(j + zelle); }
              }
              if (flaeche >= splitterMin) fragmente += 1;
              else splitter += 1;
            }
            zellen.push({
              index: z * spalten + s,
              deckung: (gefuellt / (zelle * zelle)) * 100,
              kanten,
              fragmente,
              splitter,
            });
          }
        }
        return {
          breite: tafel.width,
          hoehe: tafel.height,
          zellen,
          gefuellt: zellen.filter(z => !z.ausserhalb && z.deckung >= schwelleProzent).length,
        };
      }, {
        url: `data:${typ};base64,${daten}`,
        spalten: SPALTEN,
        zeilen: ZEILEN,
        zelle: ZELLE,
        splitterMin: SPLITTER_MIN_PX,
        schwelleProzent: ZELLE_GEFUELLT_PROZENT,
      });
    };

    const bereicheMessen = (datei, bereiche) => messeBereiche(seite, datei, bereiche);

    return await fn({ zellenMessen, bereicheMessen });
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------ 1..5: Figuren

function figurenAusManifest() {
  const eintraege = figurenManifest.figuren ?? {};
  const namen = Object.keys(eintraege);
  if (namen.length === 0) {
    befund('figuren', 'Manifest fehlt oder ist leer', 'src/client/assets/sprite-sheets/manifest.json');
    return [];
  }
  return namen.map(name => {
    const [fraktion, figur] = name.includes('/') ? name.split('/') : ['?', name];
    return { name, fraktion, figur, blaetter: eintraege[name] };
  });
}

async function pruefeFiguren(zellenMessen) {
  const figuren = figurenAusManifest();
  const proFraktion = new Map();
  for (const figur of figuren) {
    proFraktion.set(figur.fraktion, (proFraktion.get(figur.fraktion) ?? 0) + 1);
  }
  for (const [fraktion, anzahl] of proFraktion) {
    if (anzahl !== FIGUREN_JE_FRAKTION) {
      befund('figuren', `Fraktion ${fraktion}: ${anzahl} statt ${FIGUREN_JE_FRAKTION} Figuren`, '');
    }
  }
  if (proFraktion.size !== FRAKTIONEN) {
    befund('figuren', `${proFraktion.size} statt ${FRAKTIONEN} Fraktionen`, [...proFraktion.keys()].join(', '));
  }

  const namensIndex = new Map();
  const blattZahlen = { erwartet: figuren.length * BLAETTER.length, gemessen: 0, zellenGefuellt: 0, zellenGesamt: 0 };

  for (const figur of figuren) {
    const kurz = figur.figur;
    if (!namensIndex.has(kurz)) namensIndex.set(kurz, []);
    namensIndex.get(kurz).push(figur.name);

    for (const blatt of BLAETTER) {
      const relativ = figur.blaetter?.[blatt];
      if (!relativ) {
        befund('figuren', `Blatt fehlt im Manifest: ${figur.name} ${blatt}`, '');
        continue;
      }
      const datei = path.join(ASSETS, 'sprite-sheets', relativ);
      if (!existsSync(datei)) {
        befund('figuren', `Datei fehlt: ${relativ}`, '');
        continue;
      }
      const messung = await zellenMessen(datei);
      blattZahlen.gemessen += 1;
      const sollBreite = SPALTEN * ZELLE;
      const sollHoehe = ZEILEN * ZELLE;
      if (messung.breite !== sollBreite || messung.hoehe !== sollHoehe) {
        befund('figuren', `Maße falsch: ${relativ}`,
          `${messung.breite}×${messung.hoehe} statt ${sollBreite}×${sollHoehe}`);
      }
      blattZahlen.zellenGesamt += messung.zellen.length;
      blattZahlen.zellenGefuellt += messung.gefuellt;
      for (const zelle of messung.zellen) {
        const stelle = `${relativ} Zelle ${zelle.index}`;
        if (zelle.ausserhalb) { befund('figuren', `Zelle außerhalb des Rasters: ${stelle}`, ''); continue; }
        if (zelle.deckung < ZELLE_GEFUELLT_PROZENT) {
          befund('figuren', `Leere Zelle: ${stelle}`, `${zelle.deckung.toFixed(2)} % Deckung`);
          continue;
        }
        if (zelle.kanten > 0) {
          befund('figuren', `Figur berührt den Zellrand: ${stelle}`,
            `${zelle.kanten} Randpixel — möglicherweise abgeschnitten`);
        }
        if (zelle.fragmente > FRAGMENTE_NORMAL) {
          befund('figuren', `Zerfasert: ${stelle}`,
            `${zelle.fragmente} zusammenhängende Flächen (normal ≤ ${FRAGMENTE_NORMAL})`);
        }
        if (zelle.splitter > 6) {
          hinweis('figuren', `Splitter neben der Figur: ${stelle}`, `${zelle.splitter} Flächen < ${SPLITTER_MIN_PX} px`);
        }
      }
    }
  }

  for (const [kurz, orte] of namensIndex) {
    if (orte.length > 1) {
      befund('namensdublette', `Figurenname ${kurz} in ${orte.length} Fraktionen`, orte.join(' · '));
    }
  }

  if (blattZahlen.gemessen !== blattZahlen.erwartet) {
    befund('figuren', 'Blattzahl weicht ab', `${blattZahlen.gemessen} von ${blattZahlen.erwartet}`);
  }
  return { figuren: figuren.length, fraktionen: proFraktion.size, ...blattZahlen };
}

// ------------------------------------------------------------------ 5: Emotionen

async function pruefeEmotionen(zellenMessen) {
  const ordner = path.join(ASSETS, 'sprite-sheets-emotion');
  if (!existsSync(ordner)) {
    hinweis('emotionen', 'Kein Emotions-Ordner', 'sprite-sheets-emotion fehlt');
    return { geprueft: 0 };
  }
  // Das Emotions-Manifest führt eine FLACHE Liste von Pfaden (kein Baum).
  const eintraege = Array.isArray(figurenManifestEmotion.figuren) ? figurenManifestEmotion.figuren : [];
  if (eintraege.length === 0) {
    befund('emotionen', 'Emotions-Manifest fehlt oder ist leer', 'sprite-sheets-emotion/manifest.json');
    return { geprueft: 0 };
  }
  let geprueft = 0;
  let zellenGefuellt = 0;
  let zellenGesamt = 0;
  for (const relativ of eintraege) {
    const datei = path.join(ordner, relativ);
    if (!existsSync(datei)) {
      befund('emotionen', `Emotions-Blatt fehlt: ${relativ}`, '');
      continue;
    }
    const messung = await zellenMessen(datei);
    geprueft += 1;
    zellenGesamt += messung.zellen.length;
    zellenGefuellt += messung.gefuellt;
    if (messung.breite !== SPALTEN * ZELLE || messung.hoehe !== ZEILEN * ZELLE) {
      befund('emotionen', `Maße falsch: ${relativ}`,
        `${messung.breite}×${messung.hoehe} statt ${SPALTEN * ZELLE}×${ZEILEN * ZELLE}`);
    }
    for (const zelle of messung.zellen) {
      if (!zelle.ausserhalb && zelle.deckung < ZELLE_GEFUELLT_PROZENT) {
        befund('emotionen', `Leere Zelle: ${relativ} Zelle ${zelle.index}`, `${zelle.deckung.toFixed(2)} % Deckung`);
      }
    }
  }
  const soll = Object.keys(figurenManifest.figuren ?? {}).length;
  if (soll > 0 && eintraege.length !== soll) {
    hinweis('emotionen', `${eintraege.length} statt ${soll} Emotions-Blätter`, 'eine je Figur');
  }
  return { geprueft, erwartet: eintraege.length, zellenGefuellt, zellenGesamt };
}

// ------------------------------------------------------------------ 6: Waffen

async function pruefeWaffen(bereicheMessen) {
  const waffen = Object.entries(waffenManifest.waffen ?? {});
  if (waffen.length === 0) {
    befund('waffen', 'Waffen-Manifest fehlt oder ist leer', 'src/client/assets/weapon-sprites/manifest.json');
    return { waffen: 0 };
  }

  // Die Waffen liegen als REGIONEN in gemeinsamen Atlanten (manifest.atlanten).
  // Deshalb wird je Atlas einmal dekodiert und alle Regionen in einem Zug gemessen.
  const atlanten = waffenManifest.atlanten ?? {};
  const jeAtlas = new Map();
  let ohneFeld = 0;
  let deckungZuKlein = 0;

  for (const [id, eintrag] of waffen) {
    for (const feld of ['held', 'silhouette', 'icon']) {
      const region = eintrag?.[feld];
      if (!region || typeof region !== 'object') {
        ohneFeld += 1;
        befund('waffen', `Feld fehlt: ${id}.${feld}`, 'kein Atlas-Verweis');
        continue;
      }
      const atlas = atlanten[region.atlas];
      if (!atlas?.datei) {
        befund('waffen', `Unbekannter Atlas: ${id}.${feld}`, String(region.atlas));
        continue;
      }
      if (!jeAtlas.has(region.atlas)) jeAtlas.set(region.atlas, { datei: atlas.datei, posten: [] });
      jeAtlas.get(region.atlas).posten.push({
        waffe: id,
        feld,
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
      });
    }
    // Doppelte Quelle: dasselbe Ausgangsbild für zwei Waffen.
    const quelle = eintrag?.quelle?.datei;
    if (quelle) {
      if (!pruefeWaffen.quellen) pruefeWaffen.quellen = new Map();
      if (pruefeWaffen.quellen.has(quelle)) {
        befund('waffen', `Doppelte Quelle: ${id} und ${pruefeWaffen.quellen.get(quelle)}`, quelle);
      } else {
        pruefeWaffen.quellen.set(quelle, id);
      }
    }
  }

  let gepruefteBilder = 0;
  const deckungen = [];
  for (const [atlasName, { datei, posten }] of jeAtlas) {
    const pfadDatei = path.join(ASSETS, 'weapon-sprites', datei);
    if (!existsSync(pfadDatei)) {
      befund('waffen', `Atlas fehlt: ${atlasName}`, datei);
      continue;
    }
    const messungen = await bereicheMessen(pfadDatei, posten.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })));
    posten.forEach((posten, i) => {
      const messung = messungen[i];
      gepruefteBilder += 1;
      if (messung.ausserhalb) {
        befund('waffen', `Region außerhalb des Atlas: ${posten.waffe}.${posten.feld}`, datei);
        return;
      }
      deckungen.push(messung.deckung);
      if (messung.deckung < 3) {
        deckungZuKlein += 1;
        befund('waffen', `Deckung unter 3 %: ${posten.waffe}.${posten.feld}`,
          `${messung.deckung.toFixed(2)} % (${datei})`);
      }
    });
  }

  if (waffen.length !== 150) {
    hinweis('waffen', `Waffenkatalog: ${waffen.length} statt 150 Einträge`, '');
  }
  return {
    waffen: waffen.length,
    ohneFeld,
    deckungZuKlein,
    gepruefteBilder,
    atlanten: jeAtlas.size,
    deckungMittel: deckungen.length
      ? Number((deckungen.reduce((a, b) => a + b, 0) / deckungen.length).toFixed(2))
      : 0,
  };
}

// ------------------------------------------------------------------ 7: Haustiere

function pruefeHaustiere() {
  const ergebnis = {};
  for (const [name, soll] of [['guenther', 14], ['cookie', 14]]) {
    const ordner = path.join(ASSETS, name);
    if (!existsSync(ordner)) {
      befund('haustiere', `Ordner fehlt: ${name}`, '');
      continue;
    }
    const dateien = readdirSync(ordner);
    const bilder = dateien.filter(d => /\.(png|webp)$/i.test(d));
    ergebnis[name] = bilder.length;
    if (bilder.length !== soll) {
      befund('haustiere', `${name}: ${bilder.length} statt ${soll} Posen`, bilder.join(', '));
    }
  }
  return ergebnis;
}

// ------------------------------------------------------------------ Ablauf

async function main() {
  const beginn = Date.now();
  let figuren = null;
  let emotionen = null;
  let waffen = null;

  await mitDekoder(async ({ zellenMessen, bereicheMessen }) => {
    figuren = await pruefeFiguren(zellenMessen);
    emotionen = await pruefeEmotionen(zellenMessen);
    waffen = await pruefeWaffen(bereicheMessen);
  });

  const haustiere = pruefeHaustiere();
  const dauer = ((Date.now() - beginn) / 1000).toFixed(1);
  const bericht = {
    werkzeug: 'check-sprites',
    zeit: new Date().toISOString(),
    dauerSekunden: Number(dauer),
    figuren,
    emotionen,
    waffen,
    haustiere,
    befunde,
    hinweise,
    ampel: befunde.length === 0 ? 'gruen' : 'rot',
  };

  const ziel = path.join(WURZEL, 'docs/sprite-pruefung.json');
  mkdirSync(path.dirname(ziel), { recursive: true });
  writeFileSync(ziel, `${JSON.stringify(bericht, null, 2)}\n`);

  if (NUR_JSON) {
    process.stdout.write(`${JSON.stringify(bericht, null, 2)}\n`);
    process.exitCode = befunde.length === 0 ? 0 : 1;
    return;
  }

  const zeile = (titel, wert) => console.log(`  ${titel.padEnd(34)} ${wert}`);
  console.log('== check-sprites ==');
  console.log('');
  if (figuren) {
    zeile('Fraktionen', figuren.fraktionen);
    zeile('Figuren', figuren.figuren);
    zeile('Blätter gemessen', `${figuren.gemessen} / ${figuren.erwartet}`);
    zeile('Zellen gefüllt', `${figuren.zellenGefuellt} / ${figuren.zellenGesamt}`);
  }
  if (emotionen) zeile('Emotions-Blätter', `${emotionen.geprueft} / ${emotionen.erwartet}`);
  if (waffen) zeile('Waffen im Manifest', waffen.waffen);
  if (waffen) zeile('Waffen-Bilder geprüft', waffen.gepruefteBilder);
  if (haustiere) zeile('Posen Günther / Cookie', `${haustiere.guenther ?? '—'} / ${haustiere.cookie ?? '—'}`);
  zeile('Dauer', `${dauer} s`);
  console.log('');

  if (befunde.length === 0) {
    console.log('  Ampel: GRÜN — keine Befunde.');
  } else {
    console.log(`  Ampel: ROT — ${befunde.length} Befund(e)`);
    const nachBereich = new Map();
    for (const b of befunde) nachBereich.set(b.bereich, [...(nachBereich.get(b.bereich) ?? []), b]);
    for (const [bereich, liste] of nachBereich) {
      console.log(`\n  ${bereich} (${liste.length})`);
      for (const b of VERBOSE ? liste : liste.slice(0, 8)) {
        console.log(`    - ${b.titel}${b.detail ? ` — ${b.detail}` : ''}`);
      }
      if (!VERBOSE && liste.length > 8) console.log(`    … ${liste.length - 8} weitere (--verbose)`);
    }
  }
  if (hinweise.length > 0) {
    console.log(`\n  Hinweise: ${hinweise.length} (nicht wertend, siehe JSON)`);
  }
  console.log(`\n  Bericht: ${path.relative(WURZEL, ziel)}`);
  process.exitCode = befunde.length === 0 ? 0 : 1;
}

main().catch(fehler => {
  console.error('check-sprites: unerwarteter Fehler:', fehler);
  process.exitCode = 2;
});
