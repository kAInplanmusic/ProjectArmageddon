"""Textbeschreibungen der 81 Figuren für die Seitenansichten.

Jede Beschreibung wurde nach dem Porträt in src/client/assets/characters/ von
Hand geschrieben (Körper, Rüstung, Farben, Waffe). Die feste Stilschablone und
die Hintergrundfarbe kommen aus `schablone()`.
"""

# Hintergrundfarbe je Fraktion; Einzelfiguren siehe HINTERGRUND_AUSNAHME.
HINTERGRUND = {
    "xeno": ("green", "#00FF00"),
    "rodentia": ("cyan", "#00FFFF"),
    "pirates": ("magenta", "#FF00FF"),
    "machina": ("magenta", "#FF00FF"),
    "undead": ("magenta", "#FF00FF"),
    "shinobi": ("magenta", "#FF00FF"),
    "datacult": ("magenta", "#FF00FF"),
    "pixel": ("magenta", "#FF00FF"),
    "beasts": ("magenta", "#FF00FF"),
}
HINTERGRUND_AUSNAHME = {
    "pixel/20_phantomal-a.png": ("green", "#00FF00"),
    "beasts/21_cosmic-meditate.png": ("green", "#00FF00"),
    "beasts/22_sonic-blossom.png": ("green", "#00FF00"),
    "beasts/20_decay-spawn.png": ("cyan", "#00FFFF"),  # Stufe 2: rosa Flammensaum auf Magenta
    "pixel/21_arcanus-a.png": ("orange", "#FF8000"),  # Stufe 2: rosa Orb-Saum auf Magenta
    "xeno/20_harbinger-zeta.png": ("orange", "#FF8000"),  # Stufe 2: grauer Mischring auf Grün
    "xeno/21_dark-matter-witch.png": ("orange", "#FF8000"),
    "machina/22_overlord-kernel-panic.png": ("orange", "#FF8000"),
}

STIL = (
    "Full color comic illustration, game character sprite, bold thick dark outlines, vibrant saturated colors, "
    "cel shaded, highly detailed, not black and white, no sketch, no monochrome"
)

BESCHREIBUNG = {
    # ------------------------------------------------------------- xeno
    "xeno/00_sgt-acid-xeno.png": "A heavily armored alien xeno sergeant: dark purple carapace armor plates over a muscular insectoid body, elongated smooth domed alien head with glowing magenta eyes, clawed hands, holding a short sword that drips glowing green acid, glowing purple armor lights",
    "xeno/01_stalker-predax.png": "A lean, fast purple alien stalker with spiky back ridges, slender muscular body, digitigrade legs, narrow spiked head, a glowing pink energy blade strapped along each forearm, crouched ready stance",
    "xeno/02_vortex-grabber.png": "A bulky purple alien brute in dark plated armor, hunched, with a slimy tentacled hood-like head and two huge swirling purple tentacle-claw arms that curve like vortices, glowing purple core on chest",
    "xeno/10_drone-theta.png": "A floating alien drone: a round purple armored pod body with a glowing glass visor, small wings fins on top, a mounted plasma pistol cannon pointing forward, dripping green slime tentacles hanging below, hovering in air",
    "xeno/11_desintegrator-kael.png": "A tall alien sniper in dark gunmetal armor with a long swept-back tentacle head crest, long tail, digitigrade armored legs, holding a big purple glowing disintegrator rifle with scope",
    "xeno/12_plasma-maw-zorg.png": "A hulking purple alien beast with a huge toothy gaping maw full of fangs, spiked armored back and shoulders, big clawed hands, shooting a purple plasma beam out of the mouth forward",
    "xeno/20_harbinger-zeta.png": "A ghostly purple alien psychic with a flame-shaped slimy head, lower body a dripping melting slime tail with no legs, armored shoulders, hands open, three glowing purple energy orbs floating around",
    "xeno/21_dark-matter-witch.png": "A dark void sorceress: wispy black and violet flame-like head with glowing eyes, long dark purple robes with pointed collar, one hand holding fan of glowing purple cards, other hand holding a twisted staff topped with a purple spiral",
    "xeno/22_null-entity-quark.png": "A faceless shadow entity made of dark violet energy, hooded smoky silhouette with glowing white eyes, floating crystal shards around, holding an ornate crystal staff with a glowing orb, tapered wispy lower body",
    # ------------------------------------------------------------- rodentia
    "rodentia/00_commander-chewk.png": "A chubby hamster commander with tan and cream fur, wearing shiny crimson red plate armor with gold-brown trim, leather belt, boots, holding a large steel shovel as a weapon like a spear, friendly face",
    "rodentia/01_berzerker-fang.png": "A fierce dark-brown rat warrior, fully clothed in a brown leather tunic and trousers with a red metal shoulder pad, wielding two large jagged axes, scruffy fur, long pink tail, hunched aggressive",
    "rodentia/02_vanguard-captain-rix.png": "A chipmunk captain with striped fur, silver steel plate armor with crimson accents, carrying a huge round shield with a red gear emblem and a serrated sword",
    "rodentia/10_sharpshooter-quill.png": "A rat sharpshooter wearing green goggles, brown leather jacket and kneepads, quiver of arrows on the back, aiming a heavy mechanical crossbow with a scope, long pink tail",
    "rodentia/11_grenadier-skitter.png": "A rat grenadier with red goggles, brown utility jacket with crossed bandoliers and pouches, holding a lit grenade in one hand, ready to throw, long tail",
    "rodentia/12_volley-captain-spark.png": "A stocky beaver with flat paddle tail in heavy silver and crimson armor, carrying a big six-barrel rotary minigun at hip",
    "rodentia/20_alchemage-nibble.png": "A cheerful mouse alchemist in a red hooded coat with brown leather apron and many pouches, holding a long wooden staff with hanging green and red potion flasks and a clockwork gear, one hand conjuring a small red flame",
    "rodentia/21_technomancer-squeak.png": "A rat technomancer with a cybernetic metal mask and mechanical arm, dark purple and crimson robe with glowing pink circuit lines, holding a tall brass staff topped with a glowing pink gear ring",
    "rodentia/22_grand-conduit-vex.png": "A large capybara in ornate gray and crimson ceremonial robes with pink patterns, holding a tall staff with a big glowing pink gear emblem, calm dignified",
    # ------------------------------------------------------------- pirates
    "pirates/00_captain-sven.png": "A grizzled pirate captain with gray beard, black and gold tricorn hat, long dark coat with gold trim and epaulettes, a golden hook hand with a key hanging, holding a curved cutlass",
    "pirates/01_swashbuckler-piet.png": "A dashing swashbuckler pirate with tricorn hat and yellow bandana, long dark coat with gold trim, a long curved saber in one hand and a double-barreled flintlock pistol in the other, red sash, boots",
    "pirates/02_iron-hook-harry.png": "A burly pirate brute with black tricorn hat, heavy golden armor plates and spiked shoulders, a huge golden three-pronged hook on one arm and a large hook on the other, bearded scowl",
    "pirates/10_cannoneer-klaus.png": "A bearded pirate cannoneer with eyepatch, tricorn hat, dark green coat, one hand holding a burning fuse, pushing a golden cannon on a wooden wheeled carriage",
    "pirates/11_sniper-marie.png": "A female pirate sniper with long dark hair, tricorn hat with red bandana, long dark coat with gold trim, aiming a long golden flintlock rifle with scope",
    "pirates/12_bombard-billy.png": "A grinning goofy pirate with green goggles, skull tricorn hat, ammo bandolier of bombs across the chest, holding two lit black round bombs with smoking fuses, more bombs on the ground beside him",
    "pirates/20_voodoo-witch-morgana.png": "A pirate voodoo priestess with a golden horned mask, purple and gold elaborate wide-sleeved robes, holding a staff topped with a skull and gold coins in one hand and a ball of fire in the other",
    "pirates/21_storm-schamane-hooky.png": "An old frosty pirate storm shaman with long white beard, weathered blue-gray tricorn hat and coat with ice, holding a wooden staff with a golden crystal tip, tiny storm clouds and a small ghost ship floating around his head",
    "pirates/22_chanteyman-drake.png": "A jolly bearded pirate sailor with red bandana and tricorn hat, playing a big accordion, a tiny pirate sitting on his shoulder, brown vest and cream shirt",
    # ------------------------------------------------------------- machina
    "machina/00_chassis-endo-t8.png": "A muscular humanoid combat robot, steel gray plating with cyan glowing lines, skull-like metal face with cyan eyes, holding a big battle axe in one hand",
    "machina/01_slasher-cyber-jax.png": "A slim agile cyborg warrior in gray and cyan armor with a glowing cyan visor helmet, a glowing cyan curved energy sword in one hand and a pistol in the other",
    "machina/02_hydra-titan-mech.png": "A big bipedal battle mech walker with two heavy rotary cannons on the arms, two shoulder missile pods, glowing cyan cockpit, gunmetal gray armor with cyan accents, sturdy legs",
    "machina/10_recon-luchs-01.png": "A robotic cybernetic panther lynx: four-legged feline machine with gray metal plating and cyan glowing joints and eyes, pointed ears, long tail, walking on all four legs",
    "machina/11_heavy-battery-moerser-bot.png": "A heavy mortar tank: a wide tracked tank chassis with a big angled artillery mortar cannon on top, cyan glowing barrel and energy, gunmetal gray armor with cyan trim",
    "machina/12_ordnance-rail-viper.png": "A cyber serpent robot: a mechanical snake lower body coiled on tank treads, an upright armored humanoid torso with a snake head with cyan glowing eyes, holding a long cyan railgun",
    "machina/20_grid-drifter-datastream.png": "A holographic data spirit: translucent cyan ghostly humanoid body that fades into a data stream tail without legs, floating, holding a tall staff with a glowing cyan ring and a glowing tablet, ribbons of cyan data around",
    "machina/21_proxy-glitch-hack.png": "A small friendly robot hacker with a round head, cyan glowing eyes screen face, antennas and cables, gray metal body, holding a wrench, small floating cyan holographic windows around",
    "machina/22_overlord-kernel-panic.png": "A hooded cybernetic sage in heavy dark gray hooded robes with cyan circuit patterns, a faceless dark hood with glowing cyan eyes, holding a tall staff topped with a bright glowing cyan ring orb",
    # ------------------------------------------------------------- undead
    "undead/00_bone-racker-karl.png": "A skeleton knight in green-tinted armor plates with glowing green runes, ragged tattered cloth, holding a spiked flail mace and a shield with a skull and crossbones",
    "undead/01_grave-zombie-kauer.png": "A rotting zombie in torn leather armor and tattered clothes, green-gray skin with bone showing, a bone in the mouth, holding two short curved blades, hunched",
    "undead/02_grim-reaper-silas.png": "A grim reaper skeleton in a dark hooded green-tinged cloak with spiked shoulder armor and ragged robe, holding a big scythe with a glowing green curved blade",
    "undead/10_archer-mortis.png": "A skeleton archer in green leather armor, quiver of arrows on the back, drawing a long bow with a glowing green arrow, aiming forward",
    "undead/11_pitcher-igor.png": "A thin skeleton in a torn loincloth with moss patches, hurling a bone, holding a large clay urn full of bones under one arm, mid throwing pose",
    "undead/12_vessel-plague-skull.png": "A hunched skeleton emitting glowing green ghostly fire from the mouth, long arms with clawed bony fingers, standing in swirling green spectral smoke",
    "undead/20_lich-king-alistair.png": "A lich king skeleton wearing a spiked crown and ornate dark green robes with a glowing green gem on the chest, holding a staff topped with a skull wrapped in glowing green flames",
    "undead/21_scribe-necro-silas.png": "A skeletal necromancer scribe in a dark hooded green robe, a glowing green quill in the hand writing in a big book on a wooden lectern, rolled scrolls stacked at the back",
    "undead/22_banshee-beatrice.png": "A wailing banshee ghost: pale translucent green female spirit with long flowing white-green hair, tattered ghostly dress fading into mist, hovering above ground without feet, glowing green wisps around",
    # ------------------------------------------------------------- shinobi
    "shinobi/00_shred-katana-hanzmon.png": "A masked ninja in gray-white hood with scarf and light armor plates, holding a long katana, low combat stance, tan-copper trim",
    "shinobi/01_kunoichi-wind-flapper.png": "A kunoichi female ninja with long ponytail, face mask, light gray and beige outfit, leaping through the air swinging a kusarigama chain sickle, a dust smoke cloud behind her feet",
    "shinobi/02_tetsubo-oni-brute.png": "A giant oni demon brute with horns and an angry demon face mask helmet, heavy iron plate armor with spiked shoulders, holding a huge spiked iron club tetsubo",
    "shinobi/10_dazzler-werner.png": "A robotic ninja in sleek gray armor with a horned helmet visor and animal-ear fins, hunched agile pose, holding a small canister flash grenade in one hand",
    "shinobi/11_rauch-meister-genzi.png": "A small ninja smoke tank: a compact tracked armored tank in gray with a round glowing lens turret, thick puffs of beige smoke billowing from its top",
    "shinobi/12_blowpipe-koga.png": "A cyber ninja scorpion-snake hybrid: segmented mechanical tail coiled on the ground, an upright humanoid robotic insectoid torso with a pointed head, blowing through a long blowpipe, a quiver of darts on the back",
    "shinobi/20_ninjutsu-master-goemon.png": "A hooded ninja master in an earth-tone tunic and mask with a belt and pouches, holding a long twisted wooden staff, one hand gesturing, swirling wind lines",
    "shinobi/21_talisman-sorcerer-jun.png": "A small robot sorcerer with a round head, an orange glowing visor, antennas, silver gray body, holding a mechanical claw tool in one hand, paper talismans and charms floating around",
    "shinobi/22_vixen-kitsune.png": "A fox kitsune sage: a gray wolf-fox with nine fluffy tails, wearing ornate beige and gray robes with a kitsune mask, holding a staff topped with a white fox mask",
    # ------------------------------------------------------------- datacult
    "datacult/00_nullpointer-exception.png": "A bulky robot golem in silver-gray and green armor with big glowing green shoulder pads and a green energy fist, green glowing core, matrix code patterns on the plating",
    "datacult/01_datapath-replicant.png": "A tall slim android replicant in sleek silver armor with glowing green lights, cables streaming from the back of the head, calm upright stance",
    "datacult/02_chrome-code-shifter.png": "A chrome robotic snake coiled in an S shape, metallic silver scales with glowing green matrix code, open mouth with fangs, glowing green eyes, head raised",
    "datacult/10_quantum-qubit-knight.png": "A pixel-art-styled knight in full silver and green armor with a great helm and green plume, holding a long glowing green lance and a shield with a green glowing emblem",
    "datacult/11_synapse-streamer.png": "A big spider machine: a rounded green glowing body with a circuit pattern, eight long thin legs, thin glowing cable tendrils with bulbs, standing on its legs",
    "datacult/12_arcology-agent.png": "A sleek humanoid agent android in silver gray armor with a glowing green chest core and glowing green visor helmet, standing upright with arms at sides",
    "datacult/20_buffer-flow-swarm.png": "A single mechanical green cyber-wasp fly insect with transparent wings, glowing green body and green eyes, hovering in side view",
    "datacult/21_hyper-link-hound.png": "A robotic two-headed hound: dog-like animal body of silver gray plating with glowing green joints, two heads, pointed ears, a thin tail, standing on four legs",
    "datacult/22_ethereo.png": "A graceful ethereal psychic being with a green helmet-like bob hair head and a white face, a flowing white and green gown-like body, floating, arms stretched out, glowing green code patterns, a small green flame orb in one hand",
    # ------------------------------------------------------------- pixel
    "pixel/00_nullpointer-exception.png": "A four-legged glitch beast made of green digital blocks and arrows, a head with many arrow spikes sticking out, claws, curled tail, teal and dark blue, corrupted pixel glitch fragments",
    "pixel/01_pyrofox-a.png": "A fox with orange fur and cream chest, glitch matrix green pixel patterns, nine fluffy tails that burn with flames, bright green eyes, standing on four legs",
    "pixel/02_pyrofox-b.png": "A fox with orange fur and white chest, green matrix code patterns on the body and some armor plates, a huge fluffy tail with white tip, standing on four legs",
    "pixel/10_arcershorn-a.png": "A green raptor lizard archer standing on its hind legs, orange belly, spiky back, a burning orange fire tail, holding a wooden bow with an arrow",
    "pixel/11_pyrowand-a.png": "A teal green fox with a huge flowing nine-tail, matrix code patterns in its fur, floating small green flame torches around it, standing on four legs",
    "pixel/12_shieldmon.png": "A porcupine-like beast with brown fur and sharp quills, wearing a huge green metal shield with a pattern on its back and green armor plates, four legs, low stance",
    "pixel/20_phantomal-a.png": "A purple octopus-like phantom creature with many curling tentacles and a round body with three glowing red eyes, glitch pixel fragments, floating",
    "pixel/21_arcanus-a.png": "A hooded mage in dark robes with a white mask, a green sash, holding a dark magic orb in one hand with a green magic ring circle in the air, glitch code text lines",
    "pixel/22_arcanus-b.png": "A six-armed mystic in dark green robes with a crown-like horned mask, calm pose with several hands holding glowing green magic circles with code",
    # ------------------------------------------------------------- beasts
    "beasts/00_pikamon.png": "A cute orange electric mouse monster with black striped markings, pointy ears with black tips, lightning bolt shaped tail, blue glowing eye, crackling yellow lightning, on four legs",
    "beasts/01_shrew-quakes.png": "A badger-shrew with brown fur and white stripe on its face and a back covered in huge sharp golden-orange spikes, rocks and rubble around its feet, four legs",
    "beasts/02_storm-talon.png": "A dark feathered storm eagle with golden lightning cracks, wings half spread, sharp beak, clawed feet, perched",
    "beasts/10_flame-jaws.png": "A fire crocodile monster standing upright on hind legs, armored scales with lava cracks, burning flames on the back, jaws open with flames, big tail",
    "beasts/11_ember-tails.png": "An orange nine-tailed fire fox with cream chest and white muzzle, flaming tails, brown leather armor saddle with gold trim, standing on four legs",
    "beasts/12_magma-plate.png": "A pangolin armadillo with glowing volcanic lava armor plates, orange magma cracks, flames burning on the back, big tail, four stubby legs",
    "beasts/20_decay-spawn.png": "A charred ghoul monster with dark ember-cracked skin, glowing orange eyes, thin hunched body, orange flames around, long clawed hands hanging",
    "beasts/21_cosmic-meditate.png": "A blue-skinned four-armed meditating monk sitting cross-legged, purple pants, glowing eyes, hands in mudras, colorful elemental orbs floating in a ring around him",
    "beasts/22_sonic-blossom.png": "A flower fairy woman with a flame-orange petal hair, a skirt made of orange and yellow petals, floating, arms spread, swirling orange wind ribbons around her",
}


def hintergrund(schluessel: str):
    fraktion = schluessel.split("/")[0]
    return HINTERGRUND_AUSNAHME.get(schluessel, HINTERGRUND[fraktion])


def schablone(schluessel: str) -> str:
    name, hexa = hintergrund(schluessel)
    return (
        f"{BESCHREIBUNG[schluessel]}. {STIL}. "
        f"Full body, strict side view, profile, character turned to the right, facing right, standing pose, centered, single character, "
        f"solid flat {name} ({hexa}) background, uniform flat color background without gradient, no text, no shadow, no floor, no ground, no props on the ground."
    )
