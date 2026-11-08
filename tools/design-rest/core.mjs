/** Reine Planung und Promptaufbau; keine Netzwerkaufrufe. */
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const TYPES = ['biped', 'quadruped', 'tracked', 'serpentine', 'hover', 'avian', 'arachnid', 'swarm'];
const ACTIONS = ['idle A', 'idle B', 'airborne / jump', 'low stance', 'hit reaction A', 'hit reaction B', 'recovery', 'defeated'];
const EMOTIONS = ['fear', 'blink', 'shrug', 'celebration', 'tremble', 'look up', 'look down', 'equipment change'];
const MORPHOLOGY = {
  biped: 'Anatomically one biped: exactly two arms, two legs and one head.',
  quadruped: 'Anatomically one quadruped: exactly four legs, one head and one tail. Never upright.',
  tracked: 'A tracked vehicle with continuous tracks and a rigid chassis. No legs, feet or humanoid torso.',
  serpentine: 'One continuous segmented serpentine body with zero legs and zero arms.',
  hover: 'One floating being with the approved appendage count. No walking legs.',
  avian: 'Exactly two wings and two taloned legs. No human arms.',
  arachnid: 'Exactly eight legs and the approved segmented body. No human body.',
  swarm: 'A swarm of multiple separate small flying insects spread across the canvas. Never merge them into one giant insect.',
};
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
const WALK_PHASES = {
  biped: [
    'Contact A: left leg straight forward with heel down, right leg extended behind with toe off, right arm swung forward.',
    'Down A: weight on the forward left leg, left knee bent, body at its lowest, right foot lifting.',
    'Passing A: right leg passes directly under the hips with the knee lifted, body rising.',
    'Up A: body at its highest, right leg reaching forward, left leg pushing off behind.',
    'Contact B: right leg straight forward with heel down, left leg extended behind, left arm swung forward.',
    'Down B: weight on the forward right leg, right knee bent, body at its lowest, left foot lifting.',
    'Passing B: left leg passes directly under the hips with the knee lifted, body rising.',
    'Up B: body at its highest, left leg reaching forward, right leg pushing off behind.',
  ],
  quadruped: [
    'Contact A: front-left and rear-right legs forward, front-right and rear-left legs back.',
    'Down A: weight settles on the diagonal pair, spine slightly lowered.',
    'Passing A: rear-right leg lifts and swings under the body.',
    'Up A: spine rises, front-left leg reaches forward.',
    'Contact B: front-right and rear-left legs forward, front-left and rear-right legs back.',
    'Down B: weight settles on the opposite diagonal pair.',
    'Passing B: rear-left leg lifts and swings under the body.',
    'Up B: spine rises, front-right leg reaches forward.',
  ],
  tracked: [
    'Track phase 1/8: left track surface advances slightly, suspension compressed.',
    'Track phase 2/8: track links shift, chassis dips a few pixels.',
    'Track phase 3/8: track links continue, chassis level.',
    'Track phase 4/8: track links shift, suspension rises slightly.',
    'Track phase 5/8: opposite track-link offset, chassis dips.',
    'Track phase 6/8: track links continue, chassis level.',
    'Track phase 7/8: track links shift, suspension rises.',
    'Track phase 8/8: cycle returns to the start position.',
  ],
  serpentine: [
    'Body wave phase 1/8: gentle S-curve, head slightly raised.',
    'Body wave phase 2/8: curve travels toward the tail.',
    'Body wave phase 3/8: mid-body lifted, tail curved opposite.',
    'Body wave phase 4/8: maximum lateral offset at mid-body.',
    'Body wave phase 5/8: opposite S-curve, head level.',
    'Body wave phase 6/8: curve travels back toward the head.',
    'Body wave phase 7/8: mid-body lowered, tail straightening.',
    'Body wave phase 8/8: cycle returns to the start position.',
  ],
  hover: [
    'Hover phase 1/8: body at neutral height, appendages relaxed.',
    'Hover phase 2/8: body drifts upward slightly.',
    'Hover phase 3/8: body at highest point, robe hem lifting.',
    'Hover phase 4/8: body descends gently.',
    'Hover phase 5/8: body at neutral height, opposite appendage sway.',
    'Hover phase 6/8: body drifts downward slightly.',
    'Hover phase 7/8: body at lowest point, robe settling.',
    'Hover phase 8/8: cycle returns to neutral height.',
  ],
  avian: [
    'Contact A: left taloned leg forward, right leg back, wings folded.',
    'Down A: weight on the left leg, body lowered.',
    'Passing A: right leg swings under the body, wings slightly open.',
    'Up A: body rises, right leg reaching forward.',
    'Contact B: right taloned leg forward, left leg back.',
    'Down B: weight on the right leg, body lowered.',
    'Passing B: left leg swings under the body.',
    'Up B: body rises, left leg reaching forward.',
  ],
  arachnid: [
    'Gait phase 1/8: alternating leg tetrapod, left legs forward.',
    'Gait phase 2/8: body lowers slightly.',
    'Gait phase 3/8: right legs swing forward.',
    'Gait phase 4/8: body rises.',
    'Gait phase 5/8: opposite tetrapod, right legs forward.',
    'Gait phase 6/8: body lowers slightly.',
    'Gait phase 7/8: left legs swing forward.',
    'Gait phase 8/8: cycle returns to the start position.',
  ],
  swarm: [
    'Swarm phase 1/8: insects spread wide, centroid neutral.',
    'Swarm phase 2/8: group drifts up and left.',
    'Swarm phase 3/8: wings at upstroke, spacing widens.',
    'Swarm phase 4/8: group compresses toward the centroid.',
    'Swarm phase 5/8: group drifts down and right.',
    'Swarm phase 6/8: wings at downstroke, spacing widens.',
    'Swarm phase 7/8: group re-forms around the centroid.',
    'Swarm phase 8/8: cycle returns to the start arrangement.',
  ],
};
export function frameDescription(type, animation, frame) {
  if (!TYPES.includes(type)) throw new Error(`Unbekannter Bewegungstyp: ${type}`);
  if (!Number.isInteger(frame) || frame < 0 || frame > 7) throw new Error('Frame muss 0..7 sein');
  if (animation === 'reference') return `Create the canonical neutral right-facing side-view character reference. ${MORPHOLOGY[type]}`;
  if (animation === 'walk') return `Locomotion cycle phase ${frame + 1}/8. ${WALK_PHASES[type][frame]} ${MOTION[type]} Change the limbs clearly from the input reference pose; do not copy the reference pose unchanged. Keep the character in place, not moving across the canvas.`;
  if (animation === 'action') {
    const action = ACTIONS[frame];
    return `${action}. ${MOTION[type]} ${frame === 3 && type === 'tracked' ? 'Low stance means lowering suspension / barrel, never kneeling.' : ''} ${frame === 7 ? 'Depict defeat using the same species and construction; never reveal a human face. Preserve full body inside canvas.' : ''}`;
  }
  if (animation === 'state') return `Secondary state study ${ACTIONS[frame]}. ${MOTION[type]} No water, splashes or external effects. This sheet is NOT automatically enabled in the game.`;
  if (animation === 'emotion') return `${EMOTIONS[frame]}. Express through the existing anatomy, posture or display indicators. ${MOTION[type]} For equipment change show the body gesture only; do not generate a random weapon.`;
  throw new Error(`Unbekannte Animation: ${animation}`);
}
export function buildPrompt(character, faction, animation, frame, referenceLabels, correction = '', hasPoseGuide = false) {
  const identityCounts = JSON.stringify(character.approvedCounts);
  const framed = hasPoseGuide && animation === 'walk'
    ? `Match the pose and articulation of the pose guide exactly. ${MOTION[character.morphology]} Keep the character in place, not moving across the canvas.`
    : frameDescription(character.morphology, animation, frame);
  return [
    'Create ONE production 2D game animation frame, using the provided references.',
    ...referenceLabels.map((label, i) => `Reference image ${i + 1}: ${label}.`),
    `Character: ${character.name}. Fixed identity: ${character.identity}. Approved explicit counts: ${identityCounts}.`,
    `Faction visual direction: ${faction.style}. Palette intent: ${faction.colorDescription}; target swatches ${faction.palette.join(', ')}. Keep identity before changing style.`,
    framed,
    'Strict right-facing orthographic side view. Fixed camera, no perspective changes. Preserve approved head shape, proportions and materials.',
    'Square 1024x1024 composition, feet or hover anchor on one consistent ground level near the lower edge, at least 32 pixels clear margin. Keep the same approved scale in every frame.',
    'Omit detachable hand-held weapons and loose props; the game renders weapons separately. Keep prostheses, biological claws, permanent armor and body-mounted mechanical parts. Do not erase permanent body parts.',
    'Flat uniform mid-grey background, identical in every frame. No gradient, vignette, ground line, horizon line, text, shadow, scenery, letters, grids, motion blur, water splashes or extra characters.',
    'Crisp small-scale readable silhouette, consistent top-left key light. Output only one complete character frame.',
    correction ? `TARGETED CORRECTION: ${correction}` : '',
  ].filter(Boolean).join('\n');
}
export function resolveModel(config, name = 'qwen') {
  if (name === 'qwen') return { name, kind: 'qwen', endpoint: config.endpoint, parameters: config.parameters };
  const model = config.altModels?.[name];
  if (!model) throw new Error(`Unbekanntes Modell: ${name}`);
  return { name, kind: model.kind ?? name, endpoint: model.endpoint, parameters: model.parameters };
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
