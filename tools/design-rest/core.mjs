/** Reine Planung und Promptaufbau; keine Netzwerkaufrufe. */
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const TYPES = ['biped', 'quadruped', 'tracked', 'serpentine', 'hover', 'avian', 'arachnid', 'swarm'];
const ACTIONS = ['idle A', 'idle B', 'airborne / jump', 'low stance', 'hit reaction A', 'hit reaction B', 'recovery', 'defeated'];
const EMOTIONS = ['fear', 'blink', 'shrug', 'celebration', 'tremble', 'look up', 'look down', 'equipment change'];
const MOTION = {
  biped: 'Maintain exactly two load-bearing legs. Animate a coherent alternating biped gait.',
  quadruped: 'Maintain exactly four legs and the original spine. Animate a quadruped gait. Never stand upright or create human hands.',
  tracked: 'Maintain continuous tracks and the original vehicle chassis. Animate track rotation and subtle suspension only. Never generate legs, feet or a humanoid torso.',
  serpentine: 'Maintain one continuous segmented serpentine body and zero legs. Animate a traveling body wave while keeping the original head and fixed equipment mounts.',
  hover: 'Keep the approved floating posture and silhouette. Use subtle vertical drift or appendage movement. Do not invent walking legs or replace the body with a human.',
  avian: 'Keep exactly two wings and two taloned legs. Preserve the approved bird anatomy and feather silhouette. No human arms or hands.',
  arachnid: 'Keep exactly eight legs and the approved body segments. Use an alternating arachnid gait. No human body or extra legs.',
  swarm: 'Preserve a group of multiple separate small flying insects. Move them around the same stable group centroid. Never merge them into one giant insect or humanoid.',
};
export function frameDescription(type, animation, frame) {
  if (!TYPES.includes(type)) throw new Error(`Unbekannter Bewegungstyp: ${type}`);
  if (!Number.isInteger(frame) || frame < 0 || frame > 7) throw new Error('Frame muss 0..7 sein');
  if (animation === 'reference') return 'Create the canonical neutral right-facing side-view character reference.';
  if (animation === 'walk') return `Locomotion cycle phase ${frame + 1}/8, evenly spaced phase ${(frame / 8).toFixed(3)}. ${MOTION[type]} Keep the character in place, not moving across the canvas.`;
  if (animation === 'action') {
    const action = ACTIONS[frame];
    return `${action}. ${MOTION[type]} ${frame === 3 && type === 'tracked' ? 'Low stance means lowering suspension / barrel, never kneeling.' : ''} ${frame === 7 ? 'Depict defeat using the same species and construction; never reveal a human face. Preserve full body inside canvas.' : ''}`;
  }
  if (animation === 'state') return `Secondary state study ${ACTIONS[frame]}. ${MOTION[type]} No water, splashes or external effects. This sheet is NOT automatically enabled in the game.`;
  if (animation === 'emotion') return `${EMOTIONS[frame]}. Express through the existing anatomy, posture or display indicators. ${MOTION[type]} For equipment change show the body gesture only; do not generate a random weapon.`;
  throw new Error(`Unbekannte Animation: ${animation}`);
}
export function buildPrompt(character, faction, animation, frame, referenceLabels, correction = '') {
  const identityCounts = JSON.stringify(character.approvedCounts);
  return [
    'Create ONE production 2D game animation frame, using the provided references.',
    ...referenceLabels.map((label, i) => `Reference image ${i + 1}: ${label}.`),
    `Character: ${character.name}. Fixed identity: ${character.identity}. Approved explicit counts: ${identityCounts}.`,
    `Faction visual direction: ${faction.style}. Palette intent: ${faction.colorDescription}; target swatches ${faction.palette.join(', ')}. Keep identity before changing style.`,
    frameDescription(character.morphology, animation, frame),
    'Strict right-facing orthographic side view. Fixed camera, no perspective changes. Preserve approved head shape, proportions and materials.',
    'Canonical 1024x1024 canvas: ground contact / hover anchor at y=960; center anchor x=512. Preserve the same approved scale for every frame. Keep at least 32 pixels clear margin.',
    'Separate detachable equipment from the body. Keep prostheses, biological claws, armor and permanent mechanical attachments. Do not erase permanent body parts.',
    'Plain uniform neutral background suitable for later segmentation. Do not imitate a transparency checkerboard. No ground shadow, scenery, letters, grids, motion blur, water splashes or extra characters.',
    'Crisp small-scale readable silhouette, consistent top-left key light. Output only one complete character frame.',
    correction ? `TARGETED CORRECTION: ${correction}` : '',
  ].filter(Boolean).join('\n');
}
export function selectCharacters(characters, selection, pilot) {
  const all = Object.values(characters);
  if (selection === 'all') return all;
  if (selection === 'pilot') return pilot.map(id => { if (!characters[id]) throw new Error(`Pilot fehlt: ${id}`); return characters[id]; });
  const list = all.filter(c => c.id === selection || c.faction === selection);
  if (!list.length) throw new Error(`Unbekannte Auswahl: ${selection}`);
  return list;
}
export function validateBudget(count, ceiling, maxRequests, maxUsd) {
  if (![count, maxRequests].every(Number.isSafeInteger) || count < 1 || maxRequests < 1) throw new Error('Ungültige Anfragezahl');
  if (![ceiling, maxUsd].every(v => Number.isFinite(v) && v > 0)) throw new Error('Kostenobergrenze und Budget müssen positiv sein');
  if (count > maxRequests) throw new Error('Anfragelimit überschritten');
  if (count * ceiling > maxUsd + 1e-9) throw new Error('Budget überschritten');
  return count * ceiling;
}
export function assertQueueUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'queue.fal.run' || u.port || u.username || u.password) throw new Error('Unerwartete Queue-URL');
  return u.href;
}
/** Reservierung wird VOR einem möglichen POST dauerhaft gespeichert. */
export async function submitOnce(record, submit, persist) {
  if (record.state !== 'planned') throw new Error('Job wurde bereits reserviert/gesendet; nicht erneut einreichen');
  record.state = 'reserved';
  await persist();
  let result;
  try { result = await submit(); }
  catch (error) { record.state = 'uncertain'; await persist(); throw error; }
  if (!result?.request_id) { record.state = 'uncertain'; await persist(); throw new Error('Keine request_id; keine automatische Wiederholung'); }
  record.requestId = result.request_id;
  record.statusUrl = assertQueueUrl(result.status_url);
  record.responseUrl = assertQueueUrl(result.response_url);
  record.cancelUrl = assertQueueUrl(result.cancel_url);
  record.state = 'submitted';
  await persist();
}
