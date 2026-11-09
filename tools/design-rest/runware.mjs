#!/usr/bin/env node
// fallow-ignore-file unused-file — eigenständiger Pilot-Einstieg für Runware.
/**
 * Runware-Pilot für den DesignRest-Sprite-Workflow.
 *
 * Plan ist offline und kostenlos. `--execute` sendet echte Aufträge und
 * verlangt RUNWARE_API_KEY. Der Schlüssel wird nie in Dateien geschrieben.
 *
 * Beispiele:
 *   node tools/design-rest/runware.mjs --characters chassis-endo-t8,recon-luchs-01
 *   RUNWARE_API_KEY=... node tools/design-rest/runware.mjs --characters ... --execute
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const has = name => args.includes(`--${name}`);

const MODELS = {
  qwen: { id: 'alibaba:qwen-image-edit@2511', label: 'Qwen-Image-Edit-2511', usd: 0.02324 },
  banana: { id: 'google:nano-banana@2.1', label: 'Nano Banana 2.1', usd: 0.03751 },
};
const modelKey = value('model', 'qwen');
const model = MODELS[modelKey];
if (!model) throw new Error(`Unbekanntes Modell: ${modelKey} (qwen|banana)`);

const animation = value('animation', 'walk');
const framesArg = value('frames', '0,1,2,3,4,5,6,7');
const frames = framesArg === 'all' ? [0,1,2,3,4,5,6,7] : framesArg.split(',').map(Number);
if (frames.some(f => !Number.isInteger(f) || f < 0 || f > 7)) throw new Error('Frames müssen 0..7 sein');

const characters = JSON.parse(await fs.readFile(path.join(HERE, 'characters.json'), 'utf8'));
const factions = JSON.parse(await fs.readFile(path.join(HERE, 'factions.json'), 'utf8'));
const ids = value('characters', 'chassis-endo-t8,recon-luchs-01').split(',').map(s => s.trim()).filter(Boolean);
const outDir = path.resolve(ROOT, value('out', `artifacts/design-rest/runware-${modelKey}`));
const maxUsd = Number(value('max-usd', '1.00'));
if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error('--max-usd muss positiv sein');
const width = Number(value('width', '1024'));
const height = Number(value('height', '1024'));
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 512 || height < 512 || width > 2048 || height > 2048) {
  throw new Error('--width/--height müssen 512..2048 sein');
}

const refMode = value('refs', 'auto');
const SPECIAL_MORPH = new Set(['quadruped', 'serpentine', 'tracked', 'avian', 'arachnid', 'swarm']);
if (!['auto', 'both', 'identity', 'guide'].includes(refMode)) throw new Error('--refs muss auto|both|identity|guide sein');
const NEGATIVE = [
  'human face', 'human skin', 'extra limbs', 'missing limbs', 'wrong number of arms',
  'wrong number of legs', 'extra head', 'text', 'letters', 'watermark', 'signature',
  'scenery', 'background gradient', 'ground line', 'horizon', 'cast shadow',
  'motion blur', 'weapon in hand', 'loose prop', 'cropped feet', 'multiple characters',
  'different character', 'photorealistic human',
].join(', ');
const MORPH_NEG = {
  tracked: 'humanoid legs, feet, biped stance, walking legs',
  serpentine: 'legs, feet, humanoid body, biped stance',
  quadruped: 'humanoid posture, biped legs, human arms, standing upright',
  avian: 'humanoid legs, human arms',
  arachnid: 'humanoid legs, two legs, biped stance',
  swarm: 'single large creature, one body, humanoid',
};

function dataUri(bytes, ext) {
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext.toLowerCase()];
  if (!mime) throw new Error(`Nicht unterstützte Bildendung: ${ext}`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function buildJobs() {
  const jobs = [];
  for (const id of ids) {
    const character = characters[id];
    if (!character) throw new Error(`Unbekannte Figur: ${id}`);
    const faction = factions[character.faction];
    if (!faction) throw new Error(`Unbekannte Fraktion: ${character.faction}`);
    for (const frame of frames) {
      const guide = character.guides?.[`${animation}:${frame}`]
        ?? `artifacts/design-rest/guides/${id}/${animation}-${frame}-sheet.png`;
      if (!(await fs.stat(path.resolve(ROOT, guide)).catch(() => null))) {
        throw new Error(`Posenvorlage fehlt: ${id} ${animation}:${frame}`);
      }
      const mitIdentitaet = refMode === 'both' || refMode === 'identity'
        || (refMode === 'auto' && SPECIAL_MORPH.has(character.morphology));
      const mitGuide = refMode !== 'identity';
      const refs = [
        ...(mitIdentitaet ? [{ path: character.reference, label: `authoritative character identity, ${character.name}` }] : []),
        ...(mitGuide ? [{ path: guide, label: 'pose and articulation guide ONLY, ignore its species, materials and colors' }] : []),
      ];
      const images = [];
      for (const ref of refs) {
        const absolute = path.resolve(ROOT, ref.path);
        images.push(dataUri(await fs.readFile(absolute), path.extname(absolute)));
      }
      const prompt = buildPrompt(character, faction, animation, frame, refs.map(r => r.label), '', true);
      const estimatedUsd = modelKey === 'banana'
        ? model.usd
        : width <= 512
          ? (refs.length >= 2 ? 0.0171 : 0.0122)
          : (refs.length >= 2 ? 0.02324 : 0.01904);
      jobs.push({
        id: `${id}-${animation}-${frame}`,
        character: id,
        frame,
        model: model.id,
        estimatedUsd,
        positivePrompt: prompt,
        ...(modelKey === 'qwen' ? { negativePrompt: [NEGATIVE, MORPH_NEG[character.morphology]].filter(Boolean).join(', ') } : {}),
        inputs: { referenceImages: images },
        width,
        height,
        numberResults: 1,
        outputFormat: 'PNG',
        includeCost: true,
      });
    }
  }
  return jobs;
}

const jobs = await buildJobs();
const estimate = jobs.reduce((sum, job) => sum + job.estimatedUsd, 0);
console.log(JSON.stringify({
  provider: 'runware',
  model: model.label,
  modelId: model.id,
  characters: ids,
  animation,
  frames,
  images: jobs.length,
  estimatedUsd: Number(estimate.toFixed(4)),
  output: path.relative(ROOT, outDir),
  execute: has('execute'),
}, null, 2));

if (!has('execute')) {
  console.log('Plan only. Für echte Bilder: RUNWARE_API_KEY=... node tools/design-rest/runware.mjs ... --execute');
  process.exit(0);
}
if (estimate > maxUsd + 1e-9) throw new Error(`Schätzung ${estimate.toFixed(2)} USD über --max-usd ${maxUsd.toFixed(2)}`);
const key = process.env.RUNWARE_API_KEY;
if (!key) throw new Error('RUNWARE_API_KEY fehlt');

await fs.mkdir(outDir, { recursive: true });
const journalPath = path.join(outDir, 'journal.json');
let journal = { schemaVersion: 1, model: model.id, createdAt: new Date().toISOString(), jobs: {} };
try { journal = JSON.parse(await fs.readFile(journalPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const persist = async () => {
  await fs.writeFile(`${journalPath}.tmp`, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(`${journalPath}.tmp`, journalPath);
};

let spent = Number(journal.spentUsd ?? 0);
const concurrency = Math.max(1, Math.min(16, Number(value('concurrency', '8'))));
const pending = jobs.filter(job => {
  const state = journal.jobs[job.id]?.state;
  if (state === 'done') return false;
  if (state === 'uncertain') throw new Error(`Unklarer Lauf: ${job.id}; Anbieterhistorie prüfen, nicht blind wiederholen`);
  return true;
});

async function runJob(job) {
  const { id: jobId, character, frame, estimatedUsd: _estimated, ...task } = job;
  const taskUUID = randomUUID();
  const body = [{ taskType: 'imageInference', taskUUID, ...task }];
  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw Object.assign(new Error(`Runware HTTP ${response.status}: keine JSON-Antwort`), { uncertain: true }); }
  if (!response.ok || payload.errors?.length) {
    throw Object.assign(new Error(`Runware ${job.id}: ${JSON.stringify(payload.errors ?? `HTTP ${response.status}`)}`), { uncertain: false, errors: payload.errors });
  }
  const result = payload.data?.find(d => d.taskUUID === taskUUID) ?? payload.data?.[0];
  const url = result?.imageURL ?? result?.imageUrl;
  if (!url) throw Object.assign(new Error(`Runware ${job.id}: keine imageURL`), { uncertain: true });

  const image = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!image.ok) throw Object.assign(new Error(`Download ${job.id}: HTTP ${image.status}`), { uncertain: true });
  const bytes = Buffer.from(await image.arrayBuffer());
  const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const jpg = bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (!png && !jpg) throw Object.assign(new Error(`Download ${job.id}: kein PNG/JPEG`), { uncertain: true });
  const file = path.join(outDir, `${job.id}.${png ? 'png' : 'jpg'}`);
  await fs.writeFile(file, bytes);
  return { file, cost: Number(result.cost ?? model.usd) || model.usd, seed: result.seed ?? null };
}

let failed = 0;
for (let offset = 0; offset < pending.length; offset += concurrency) {
  const chunk = pending.slice(offset, offset + concurrency);
  const chunkEstimate = chunk.reduce((sum, job) => sum + job.estimatedUsd, 0);
  if (spent + chunkEstimate > maxUsd + 1e-9) {
    console.log(`Budget ${maxUsd.toFixed(2)} USD erreicht; ${pending.length - offset} Aufträge bleiben offen.`);
    break;
  }
  const results = await Promise.allSettled(chunk.map(job => runJob(job)));
  for (let i = 0; i < chunk.length; i++) {
    const job = chunk[i];
    const record = journal.jobs[job.id] ?? { state: 'planned' };
    journal.jobs[job.id] = record;
    const result = results[i];
    if (result.status === 'fulfilled') {
      spent += result.value.cost;
      journal.spentUsd = Number(spent.toFixed(6));
      Object.assign(record, {
        state: 'done',
        file: path.relative(ROOT, result.value.file),
        cost: result.value.cost,
        seed: result.value.seed,
      });
      console.log(`${job.id}: done (${result.value.cost.toFixed(5)} USD, gesamt ${spent.toFixed(4)})`);
    } else {
      failed += 1;
      record.state = result.reason?.uncertain ? 'uncertain' : 'failed';
      record.error = String(result.reason?.message ?? result.reason);
      console.log(`${job.id}: ${record.state} — ${record.error}`);
    }
  }
  await persist();
}
console.log(JSON.stringify({
  output: path.relative(ROOT, outDir),
  images: jobs.length,
  done: Object.values(journal.jobs).filter(r => r.state === 'done').length,
  failed,
  spentUsd: Number(spent.toFixed(4)),
}, null, 2));
if (failed) process.exitCode = 1;
