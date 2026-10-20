#!/usr/bin/env node
/**
 * Offline-Auswertung aller Klangprofile ohne Gehör.
 *
 * Jedes Profil wird in Chromium mit einem OfflineAudioContext durch DIESELBE Kette gerendert
 * wie im Spiel (Busse, Hall, Kompressor, weicher Begrenzer) und in Node vermessen:
 * Dauer (bis −60 dB unter der Spitze), Spitze, RMS, spektraler Schwerpunkt, Endpegel,
 * NaN-Prüfung. Dazu ein Stresstest (viele laute Stimmen gleichzeitig) auf Übersteuerung.
 *
 * Ausgabe: docs/klang/auswertung.json, docs/klang/spektrogramm-<profil>.png,
 * optional WAV-Dateien (`--wav <ordner>`).
 *
 *   node tools/klang-auswertung.mjs [--wav <ordner>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mitKlangRenderer, SAMPLERATE } from '../tests/helfer/klangRender.mjs';
import {
  kennzahlen, spektrogramm, malSpektrogramm, pngKodieren, wavKodieren,
} from '../tests/helfer/klangAnalyse.js';
import { ALLE_PROFILE, KATEGORIE_PROFIL, SCHUSS_PROFILE, STIMMEN_MAX } from '../src/client/klangProfile.js';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ausgabe = path.join(wurzel, 'docs', 'klang');
const wavOrdner = process.argv.includes('--wav') ? path.resolve(process.argv[process.argv.indexOf('--wav') + 1]) : null;

/** Fingerabdruck der Profiltabelle: der Test erkennt damit eine veraltete Auswertung. */
export const profilHash = () => crypto.createHash('sha256').update(JSON.stringify(ALLE_PROFILE)).digest('hex').slice(0, 16);

fs.mkdirSync(ausgabe, { recursive: true });
if (wavOrdner) fs.mkdirSync(wavOrdner, { recursive: true });

const ergebnis = { profilHash: profilHash(), samplerate: SAMPLERATE, profile: {}, kategorien: {}, stress: {} };

await mitKlangRenderer(async rendere => {
  for (const [name, profil] of Object.entries(ALLE_PROFILE)) {
    const { links, rechts } = await rendere({ stimmen: [{ name }], seed: 1 });
    const k = kennzahlen(links, rechts, SAMPLERATE);
    ergebnis.profile[name] = {
      bus: profil.bus,
      dauer: Number(k.dauer.toFixed(2)),
      peakDb: Number(k.peakDb.toFixed(1)),
      rmsDb: Number(k.rmsDb.toFixed(1)),
      schwerpunkt: Math.round(k.schwerpunkt),
      endpegelDb: Number(k.endpegelDb.toFixed(1)),
      nan: k.nan,
    };
    const mono = Float32Array.from(links, (l, i) => (l + rechts[i]) / 2)
      .subarray(0, Math.min(links.length, Math.ceil((k.dauer + 0.3) * SAMPLERATE)));
    const sp = spektrogramm(mono, SAMPLERATE);
    const b = 320; const h = 110;
    const rgb = new Uint8Array(b * h * 3);
    malSpektrogramm(sp, rgb, b, h, 0, 0, b, h);
    fs.writeFileSync(path.join(ausgabe, `spektrogramm-${name}.png`), pngKodieren(rgb, b, h));
    if (wavOrdner) fs.writeFileSync(path.join(wavOrdner, `${name}.wav`), wavKodieren(mono, SAMPLERATE));
  }

  for (const [kat, name] of Object.entries(KATEGORIE_PROFIL)) {
    ergebnis.kategorien[kat] = { profil: name, schwerpunkt: ergebnis.profile[name].schwerpunkt };
  }

  // Stress: alle lauten Profile mehrfach gleichzeitig (Höchstzahl der Stimmen und darüber).
  const laut = ['ultimate', 'explosion_riesig', 'schwer', 'gewehr', 'explosion_gross', 'treffer_krit', 'landung_insel', 'magie'];
  for (const [bezeichnung, anzahl] of [['stimmenMax', STIMMEN_MAX], ['doppelt', STIMMEN_MAX * 2]]) {
    const stimmen = Array.from({ length: anzahl }, (_, i) => ({ name: laut[i % laut.length], zeit: 0.02 + (i % 3) * 0.005, pan: ((i % 5) - 2) / 2.5 }));
    const { links, rechts } = await rendere({ stimmen, seed: 3, dauer: 3.5 });
    const k = kennzahlen(links, rechts, SAMPLERATE);
    ergebnis.stress[bezeichnung] = { stimmen: anzahl, peakDb: Number(k.peakDb.toFixed(2)), ueber0dB: k.ueber0dB, nan: k.nan };
  }
});

// Kategorien: kleinster Abstand der Schwerpunkte (Verhältnis benachbarter Werte).
const werte = Object.values(ergebnis.kategorien).map(v => v.schwerpunkt).sort((a, b) => a - b);
ergebnis.minAbstandVerhaeltnis = Number(Math.min(...werte.slice(1).map((w, i) => w / werte[i])).toFixed(2));
ergebnis.schussProfile = Object.keys(SCHUSS_PROFILE).length;
ergebnis.profileGesamt = Object.keys(ALLE_PROFILE).length;

fs.writeFileSync(path.join(ausgabe, 'auswertung.json'), `${JSON.stringify(ergebnis, null, 2)}\n`);
console.log(`Auswertung: ${ergebnis.profileGesamt} Profile, kleinster Schwerpunkt-Abstand ×${ergebnis.minAbstandVerhaeltnis}`);
console.log(`Stress: ${JSON.stringify(ergebnis.stress)}`);
