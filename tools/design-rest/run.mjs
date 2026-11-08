#!/usr/bin/env node
// fallow-ignore-file unused-file — eigenständiger CLI-Einstieg, Aufruf in docs/DesignRest/README.md.
/** Offline-Plan, begrenzte fal-Queue-Aufrufe und wiederaufnehmbare Ergebnisse. Node >=22. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, buildPrompt, selectCharacters, validateBudget, assertQueueUrl, submitOnce, resolveModel } from './core.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const has = name => args.includes(`--${name}`);
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const atomic = async (p, obj) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(`${p}.tmp`, JSON.stringify(obj, null, 2)+'\n', { mode: 0o600 }); await fs.rename(`${p}.tmp`, p); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const config = await json(path.join(HERE, 'config.json'));
const characters = await json(path.join(HERE, 'characters.json'));
const factions = await json(path.join(HERE, 'factions.json'));
const planPath = path.resolve(value('plan', path.join(ROOT, 'artifacts/design-rest/plan.json')));
const runDir = path.join(path.dirname(planPath), `${path.basename(planPath, '.json')}-run`);
const journalPath = path.join(runDir, 'journal.json');
async function reference(p, label) {
  const absolute = path.resolve(ROOT, p); const bytes = await fs.readFile(absolute);
  return { path: path.relative(ROOT, absolute), sha256: sha256(bytes), label };
}
async function createPlan() {
  const animation = value('animation', 'reference');
  const model = resolveModel(config, value('model', 'qwen'));
  const stage = value('stage', 'baseline'); if (!config.stages[stage]) throw new Error('Unbekannte Stufe');
  const framesArg = value('frames', animation === 'reference' ? '0' : '0,2,5,7');
  const frames = framesArg === 'all' ? [0,1,2,3,4,5,6,7] : framesArg.split(',').map(Number);
  if (new Set(frames).size !== frames.length || frames.some(x => !Number.isInteger(x) || x < 0 || x > 7)) throw new Error('Frames müssen eindeutig 0..7 sein');
  if (animation === 'reference' && (frames.length !== 1 || frames[0] !== 0)) throw new Error('Referenzphase hat nur Frame 0');
  const selected = selectCharacters(characters, value('selection', 'pilot'), config.pilot);
  const seed = Number(value('seed', config.seeds[0])); if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Ungültiger Seed');
  const revision = Number(value('revision', '0')); if (!Number.isSafeInteger(revision) || revision < 0 || revision > 2) throw new Error('Revision muss 0..2 sein');
  const correctionName = value('correction', '');
  if (correctionName && !config.corrections[correctionName]) throw new Error('Unbekannte Korrektur');
  const jobs = [];
  for (const c of selected) {
    const faction = factions[c.faction];
    for (const frame of frames) {
      const refs = [await reference(c.reference, `authoritative character identity, ${c.name}`)];
      const candidate = value('candidate', '');
      if (candidate) { if (selected.length !== 1) throw new Error('Kandidat nur für eine Figur'); refs.push(await reference(candidate, 'current candidate to correct; never override identity reference')); }
      const guide = c.guides[`${animation}:${frame}`];
      if (guide) refs.push(await reference(guide, 'pose and articulation guide ONLY, ignore its species, materials and colors'));
      if (faction.styleReference && refs.length < 3) refs.push(await reference(faction.styleReference, 'approved faction style ONLY; do not copy its anatomy'));
      if (refs.length > 3) throw new Error('Maximal drei Referenzen in diesem Workflow');
      const input = model.kind === 'qwen'
        ? { ...model.parameters, num_inference_steps: config.stages[stage].steps, guidance_scale: config.stages[stage].guidance, seed, loras: faction.loras }
        : { ...model.parameters, seed };
      input.prompt = buildPrompt(c, faction, animation, frame, refs.map(r => r.label), config.corrections[correctionName], Boolean(guide));
      jobs.push({ id: `${c.id}-${animation}-${frame}-s${seed}-r${revision}`, character: c.id, faction: c.faction, animation, frame, revision, references: refs, referenceApproved: c.referenceApproved, styleApproved: faction.styleApproved, poseGuide: Boolean(guide), requiresCounts: /approved (arm|tail) count/.test(c.identity), approvedCounts: c.approvedCounts, input });
    }
  }
  const plan = { schemaVersion: 1, endpoint: model.endpoint, model: model.name, createdAt: new Date().toISOString(), sourceBase: 'design-opt / 98ddf90c4682b75e63f92c01071027f67bbd1d00', stage, jobs };
  try { await fs.access(planPath); throw new Error('Plan existiert bereits; anderen --plan Pfad verwenden'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  await atomic(planPath, plan);
  console.log(JSON.stringify({ plan: planPath, requests: jobs.length, paidRequests: 0, example: jobs[0]?.input.prompt }, null, 2));
}
async function api(url, init = {}) {
  const key = process.env.FAL_KEY; if (!key) throw new Error('FAL_KEY fehlt');
  const response = await fetch(assertQueueUrl(url), { ...init, headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`fal HTTP ${response.status}; keine automatische POST-Wiederholung`);
  return response.json();
}
async function apiGet(url, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await api(url); }
    catch (error) { last = error; if (i < attempts) await sleep(1500 * i); }
  }
  throw last;
}
async function makeInput(job) {
  const images = [];
  for (const ref of job.references) {
    const bytes = await fs.readFile(path.resolve(ROOT, ref.path));
    if (sha256(bytes) !== ref.sha256) throw new Error(`Referenz geändert: ${ref.path}; neuen Plan erstellen`);
    const ext = path.extname(ref.path).toLowerCase();
    const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp' }[ext];
    if (!mime) throw new Error('Nicht unterstützte Bildendung');
    images.push(`data:${mime};base64,${bytes.toString('base64')}`);
  }
  return { ...job.input, image_urls: images };
}
async function downloadImage(url, file) {
  const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Ungültige Bild-URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Bilddownload HTTP ${response.status}`);
  const chunks = []; let total = 0;
  for await (const chunk of response.body) { total += chunk.length; if (total > 25*1024*1024) { await response.body.cancel().catch(()=>{}); throw new Error('Bild größer als 25 MiB'); } chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Ausgabe ist kein PNG');
  await fs.writeFile(file, bytes); return { sha256: sha256(bytes), bytes: bytes.length };
}
async function run() {
  const planBytes = await fs.readFile(planPath); const plan = JSON.parse(planBytes);
  const allowedEndpoints = [config.endpoint, ...Object.values(config.altModels ?? {}).map(m => m.endpoint)];
  if (plan.schemaVersion !== 1 || !allowedEndpoints.includes(plan.endpoint) || !Array.isArray(plan.jobs)) throw new Error('Unbekannter Plan');
  if (plan.jobs.some(j => j.input.num_images !== 1 || j.input.output_format !== 'png')) throw new Error('Nur eine PNG-Ausgabe je Job erlaubt');
  const ceiling = Number(value('request-ceiling-usd', '0'));
  const maxRequests = Number(value('max-requests', '0')); const maxUsd = Number(value('max-usd','0'));
  const reserved = validateBudget(plan.jobs.length, ceiling, maxRequests, maxUsd);
  if (command === 'execute' && !has('execute')) throw new Error('Netzwerkstart erfordert --execute');
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY fehlt');
  for (const job of plan.jobs) {
    if (job.animation !== 'reference' && !job.referenceApproved) throw new Error(`Referenz nicht freigegeben: ${job.character}`);
    if (job.animation !== 'reference' && !has('allow-unguided') && !job.poseGuide) throw new Error(`Posenvorlage fehlt: ${job.id}; --allow-unguided nur für Diagnose`);
    if (job.requiresCounts && !Object.keys(job.approvedCounts).length) throw new Error(`Gliedmaßenzahl zuerst festlegen: ${job.character}`);
    if (job.input.loras?.length && !job.styleApproved) throw new Error('Stil-LoRA erst nach Stilabnahme verwenden');
    await makeInput(job);
  }
  await fs.mkdir(runDir, { recursive: true });
  // Exklusiver Dateilock schützt gegen zwei Runner desselben Plans. Nach Crash bewusst manuell prüfen.
  const lock = await fs.open(path.join(runDir, 'runner.lock'), 'wx');
  try {
    let journal;
    try { journal = await json(journalPath); } catch(e) { if(e.code !== 'ENOENT') throw e; if(command === 'collect') throw new Error('Kein Journal zum Fortsetzen'); journal = { planSha256: sha256(planBytes), ceiling, reservedUpperBoundUsd: reserved, jobs: Object.fromEntries(plan.jobs.map(j => [j.id,{state:'planned'}])) }; }
    if (journal.planSha256 !== sha256(planBytes) || journal.ceiling !== ceiling) throw new Error('Plan/Reservierung geändert');
    const persist = () => atomic(journalPath, journal); await persist();
    for (const job of plan.jobs) {
      const record = journal.jobs[job.id];
      if (record.state === 'downloaded' || record.state === 'failed') continue;
      if (['uncertain','reserved'].includes(record.state)) throw new Error(`Unklarer POST bei ${job.id}; Anbieterhistorie prüfen, niemals blind neu senden`);
      if (record.state === 'planned') {
        if (command === 'collect') continue;
        const input = await makeInput(job);
        await submitOnce(record, () => api(`https://queue.fal.run/${plan.endpoint}`, { method:'POST', body:JSON.stringify(input) }), persist);
      }
      const deadline = Date.now()+Number(value('wait-seconds','600'))*1000;
      while (Date.now() < deadline) {
        const status = await apiGet(record.statusUrl);
        if (status.status === 'COMPLETED') {
          if (status.error) { record.state='failed'; record.errorType=status.error_type ?? 'provider_error'; await persist(); break; }
          const result = await apiGet(record.responseUrl);
          if (!result.images?.[0]?.url || result.images.length !== 1) throw new Error('Keine eindeutige Bildausgabe; kein erneuter POST');
          const file = path.join(runDir, `${job.id}.png`);
          record.output = await downloadImage(result.images[0].url, file);
          record.output.file = path.basename(file); record.seed = result.seed; record.state='downloaded'; await persist(); break;
        }
        if (!['IN_QUEUE','IN_PROGRESS'].includes(status.status)) throw new Error('Unbekannter Queue-Zustand; später collect verwenden');
        await sleep(3000);
      }
      if (record.state === 'submitted') throw new Error('Wartezeit erreicht. Job bleibt möglicherweise aktiv; collect statt neu einreichen.');
      console.log(`${job.id}: ${record.state}`);
    }
  } finally { await lock.close(); await fs.unlink(path.join(runDir,'runner.lock')); }
}
if (command === 'plan') await createPlan();
else if (command === 'execute' || command === 'collect') await run();
else console.log('plan | execute --execute | collect; Details: docs/DesignRest/README.md. Plan ist offline, execute kostenpflichtig.');
