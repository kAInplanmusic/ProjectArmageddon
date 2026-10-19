"""Stufe 2: Maßprompts für die Bild-zu-Bild-Seitenansichten (FLUX.1-kontext).

Je Figur steht hier, was vom Porträt unbedingt erhalten bleiben muss (Farben,
Ausrüstung, Waffe, Besonderheiten) und, wenn nötig, die Gestalt, die das
Modell nicht verfehlen darf. `prompt()` setzt daraus den Befehl zusammen.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from prompts import hintergrund

# Schlüssel -> (erhalten bleiben soll, Gestalt/Negativvorgabe oder "")
MASS = {
    "beasts/01_shrew-quakes.png": ("the dark brown spiky shrew with long dark brown and orange spines covering its whole back, the cream striped face, the broken rocks around its feet", "a four-legged animal, snout pointing right"),
    "beasts/02_storm-talon.png": ("the dark storm eagle with golden armor plates on chest and back, the glowing orange lightning cracks on the feathers, the wings spread wide and raised, the open beak", "a flying eagle seen from the side, NOT perched"),
    "beasts/10_flame-jaws.png": ("the brown armored crocodile-dinosaur with glowing orange armor plates, the flames burning along its back and its long flaming tail, the open jaws spitting fire", "NOT blue, keep the brown and orange colors"),
    "beasts/11_ember-tails.png": ("the orange fox with brown leather saddle armor and the nine large burning flame tails fanned out behind it", "a four-legged fox, all nine fire tails visible"),
    "beasts/12_magma-plate.png": ("the armored brown armadillo-pangolin with heavy rounded brown armor plates with glowing orange magma cracks, the flames burning on its back, the long scaly tail", "NOT purple, keep brown and orange"),
    "beasts/20_decay-spawn.png": ("the decayed green-gray rotting ghoul with visible ribs and claws, surrounded by big swirling orange fire flames", "NOT black, keep the green-gray skin and the orange flames around the whole body"),
    "beasts/22_sonic-blossom.png": ("the female flower spirit with a crown of orange flame petals, the orange and gold petal skirt, the swirling orange sound-wave ribbons around her arms", "floating slightly above ground, graceful"),
    "datacult/01_datapath-replicant.png": ("the slender dark green and silver android with the glowing green chest core, green glowing accents and the thin cables hanging from the back of its head", "NOT blue and NOT white, keep dark green and silver"),
    "datacult/02_chrome-code-shifter.png": ("the green and silver chrome robot cobra with glowing green circuit patterns, green glowing eyes and the forked tongue, coiled body", "a snake, NOT blue, keep green and silver"),
    "datacult/10_quantum-qubit-knight.png": ("the knight in dark green pixelated plate armor with the green plume on the helmet, the big glowing green crystal spear-sword and the large green shield with a glowing diamond emblem", "NOT blue, keep dark green armor"),
    "datacult/11_synapse-streamer.png": ("the dark green mechanical spider with the round glowing green brain-like dome body, eight thin legs with glowing green tips and the antenna feelers", "a spider seen from the side, NOT blue"),
    "datacult/12_arcology-agent.png": ("the muscular humanoid in a dark green armored suit with the glowing green circle on the chest and the dark green visor helmet", "NOT white, NOT blue, keep dark green"),
    "datacult/20_buffer-flow-swarm.png": ("the swarm of seven small dark green mechanical flies with translucent wings and glowing green dots, one slightly larger fly in the middle", "seven equally small flies in a loose group, all flying to the right in side view, every fly the same size, no big fly, NOT yellow, NOT a humanoid"),
    "datacult/22_ethereo.png": ("the graceful dark green digital-matrix psychic with the green bob-cut head, the long flowing green matrix-code cape skirt and the glowing green orb in the hand", "NOT pale white, keep the green matrix pattern"),
    "machina/01_slasher-cyber-jax.png": ("the slim gray and cyan armored cyborg with the glowing cyan visor helmet, a large glowing cyan curved energy blade in one hand and a pistol in the other hand", "both the blade and the pistol visible, the pistol firmly gripped in the hand of the second arm, no floating objects"),
    "machina/12_ordnance-rail-viper.png": ("the cyber-serpent robot with a segmented mechanical snake body coiled on tank treads, the upright armored torso with a snake head with glowing cyan eyes, aiming the long cyan railgun forward", "NO legs, the lower body is the snake body on tank tracks, NOT a humanoid with legs"),
    "machina/20_grid-drifter-datastream.png": ("the translucent cyan holographic data spirit with a mechanical armored torso, no legs, the lower body dissolving into swirling cyan data ribbons, the tall staff with the glowing cyan ring and the glowing tablet in the other hand", "floating, NOT standing on legs"),
    "machina/21_proxy-glitch-hack.png": ("the gray metal humanoid robot with round head, glowing cyan eyes, antennas and cables, holding a wrench, small floating cyan holographic windows around", "NOT blue-white, keep gunmetal gray and cyan"),
    "machina/22_overlord-kernel-panic.png": ("the heavy dark gray hooded robe with cyan glowing circuit patterns, the faceless dark hood with glowing cyan eyes, the tall staff topped with a big glowing cyan ring", "NOT dark blue, keep dark gray"),
    "pirates/00_captain-sven.png": ("the gray beard, the black and gold tricorn hat, the long dark olive coat with gold epaulettes, the golden hook hand with the golden key hanging from the hook, the curved cutlass in the other hand", "keep the key hanging from the hook"),
    "pirates/01_swashbuckler-piet.png": ("the tricorn hat with yellow bandana, the long dark coat with gold trim, the long curved saber in one hand and the double-barreled flintlock pistol raised in the other hand, the golden sash", "both saber and pistol visible"),
    "pirates/10_cannoneer-klaus.png": ("the bearded pirate with eyepatch and tricorn hat, the dark olive-black coat with gold buttons, the burning fuse in one hand and the big golden cannon on its wooden wheeled carriage", "NOT blue, keep dark olive coat and golden cannon; both wheels complete"),
    "pirates/11_sniper-marie.png": ("the female pirate with long brown hair, the tricorn hat with skull emblem, the long olive-brown coat with gold trim, aiming the long golden flintlock rifle forward", "NOT blue coat"),
    "pirates/21_storm-schamane-hooky.png": ("the old frosty pirate with long gray-white beard, the weathered blue-gray tricorn hat and ragged coat covered in ice, the golden wooden staff with crystal tip, the small storm cloud and the tiny ghost ship floating above", "keep the staff"),
    "pixel/00_nullpointer-exception.png": ("the blocky green digital wolf-beast made of green pixel blocks with the spiky arrow-shaped crest on the head and the long curled tail", "a four-legged beast with all four legs on the ground, NOT upright"),
    "pixel/01_pyrofox-a.png": ("the orange fox with green digital pixel-glitch patches on its body and the big burning flame tail", "a four-legged fox, keep the green glitch pixels"),
    "pixel/02_pyrofox-b.png": ("the orange fox with green pixel-glitch patches and the nine big tails in orange with green and white tips", "a four-legged fox on all fours, NOT standing upright, NO armor"),
    "pixel/11_pyrowand-a.png": ("the green digital wolf-fox with several long flowing green tails and the floating green flaming wands around it", "a four-legged animal, NOT cyan, keep dark green"),
    "pixel/12_shieldmon.png": ("the green porcupine-armadillo with long dark spikes and the huge green circuit-pattern metal shield on its back", "a four-legged animal, snout pointing right"),
    "pixel/20_phantomal-a.png": ("the dark purple octopus phantom with many writhing purple tentacles and several glowing red eyes", "keep the dark purple, many tentacles and several red eyes"),
    "pixel/21_arcanus-a.png": ("the hooded dark green robed mage with a pale mask, tattered robes and a glowing green magic circle orb in each hand", "NOT dark blue, keep dark green"),
    "pixel/22_arcanus-b.png": ("the armored dark green sorcerer with a spiked silver crown mask, the glowing green chest gem and six arms each holding glowing green data orbs", "keep six arms"),
    "rodentia/00_commander-chewk.png": ("the chubby tan hamster in shiny crimson plate armor with gold trim, holding the large steel shovel upright like a spear", "keep crimson armor and the shovel (not a spear)"),
    "rodentia/02_vanguard-captain-rix.png": ("the striped chipmunk in silver steel plate armor with crimson accents, the huge round gray-red shield with the gear emblem and the serrated saw-blade sword", "keep serrated sword and gear shield"),
    "rodentia/10_sharpshooter-quill.png": ("the brown rat with green goggles, brown leather jacket and kneepads, the arrow quiver on the back, the heavy mechanical crossbow with scope aimed forward, the long pink tail", "a crossbow, NOT a rifle"),
    "rodentia/11_grenadier-skitter.png": ("the dark brown rat with goggles, the brown utility jacket with crossed bandoliers and pouches, holding a lit grenade in one hand, the long pink tail", "NOT blue fur, keep brown fur and brown clothes"),
    "rodentia/20_alchemage-nibble.png": ("the brown rat alchemist in a brown and crimson leather coat with pouches, the long staff with hanging green and red potion flasks and a gear, a small red flame in the other hand", "keep the brown fur and the potion staff"),
    "rodentia/21_technomancer-squeak.png": ("the dark gray rat with a cybernetic metal mask, the dark purple and crimson armored robe with glowing pink circuits, the tall brass staff with the glowing pink gear ring", "keep the mask and the staff"),
    "rodentia/22_grand-conduit-vex.png": ("the large brown capybara in an ornate dark gray and crimson ceremonial robe with pink patterns, the tall staff with the big glowing pink gear emblem", "NOT a pink robe, keep dark gray and crimson"),
    "shinobi/00_shred-katana-hanzmon.png": ("the gray armored ninja with hood and face mask, the layered gray plate armor and the long katana held in both hands", "NOT blue, NOT orange, keep gray armor"),
    "shinobi/11_rauch-meister-genzi.png": ("the armored gray-bronze tracked tank with the round glowing sensor dome and the thick smoke clouds rising from it", "a tank vehicle, NOT blue, keep gray-bronze"),
    "shinobi/12_blowpipe-koga.png": ("the gray metallic snake-ninja robot with a segmented snake tail, holding a long blowpipe at its mouth with arrows in the quiver on its back", "keep the snake tail, NOT legs"),
    "shinobi/20_ninjutsu-master-goemon.png": ("the gray hooded ninja with face mask, gray layered robes, belts with pouches, the twisted wooden staff and the swirling wind lines", "NOT brown, keep gray"),
    "shinobi/21_talisman-sorcerer-jun.png": ("the gray metal robot with a visor head with glowing white eyes and several antennas, the fork-claw hand, the floating bronze talisman discs and paper talismans around", "NOT blue, keep gray metal"),
    "shinobi/22_vixen-kitsune.png": ("the gray anthropomorphic fox with nine fluffy pale tails, the ornate gray-bronze armored robe and the staff topped with a white kitsune mask", "keep gray, NOT golden robe"),
    "undead/11_pitcher-igor.png": ("the green-gray rotting skeleton with moss patches and a torn brown loincloth, the large green stone urn full of bones held under one arm", "NOT white bones, keep green-gray"),
    "undead/22_banshee-beatrice.png": ("the screaming green ghost woman with long flowing hair, the tattered long gown and the swirling teal ghostly wisps around her", "floating, keep the teal green colors"),
    "xeno/00_sgt-acid-xeno.png": ("the dark purple heavily armored alien sergeant with the domed head, glowing magenta eyes and armor lights, clawed hand and the short sword dripping acid green", "NOT blue, keep dark purple armor"),
    "xeno/11_desintegrator-kael.png": ("the dark purple and gunmetal armored alien with the swept-back tentacle head crest, the long tail, holding the big glowing purple disintegrator rifle", "NOT blue, keep purple and gunmetal"),
    "xeno/12_plasma-maw-zorg.png": ("the hulking dark purple armored alien beast with the huge toothy maw, the armored plates and spiked shoulder, shooting a purple plasma beam from the mouth", "keep the armor plates"),
    "xeno/20_harbinger-zeta.png": ("the slimy purple alien psychic with a flame-shaped head, dripping slime lower body with no legs, armored shoulders and three glowing purple swirl orbs floating around", "no legs, floating"),
    "xeno/21_dark-matter-witch.png": ("the black and violet wispy flame-like head with glowing eyes, long dark purple robes, one hand with a fan of purple cards and the other hand holding the twisted staff with a purple spiral", "a shadow being, NOT a human woman"),
}

PROFIL = (
    "Redraw this exact character from the reference image in a strict side view: rotate it 90 degrees so that it is "
    "seen in pure profile facing right, the head also turned to the right in profile, only one side of the body visible. "
    "Keep exactly {erhalten}. {gestalt}. Full body, same colors, same illustration style, "
    "solid flat {name} ({hexa}) background, no text, no shadow."
)


def prompt(schluessel: str) -> str:
    erhalten, gestalt = MASS[schluessel]
    name, hexa = hintergrund(schluessel)
    return PROFIL.format(erhalten=erhalten, gestalt=(gestalt[0].upper() + gestalt[1:]) if gestalt else "",
                         name=name, hexa=hexa).replace(" . ", " ")
