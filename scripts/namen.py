"""Namens- und Positionsliste der neun Fraktionsbögen.

Zeile = Klasse: 0 = Nahkampf, 1 = Fernkampf, 2 = Magie.
Die Dateinamen lauten `<zeile><spalte>_<kurzname>.png`.
"""

FRAKTIONEN = {
    "xeno": [
        (0, 0, "00_sgt-acid-xeno"), (0, 1, "01_stalker-predax"), (0, 2, "02_vortex-grabber"),
        (1, 0, "10_drone-theta"), (1, 1, "11_desintegrator-kael"), (1, 2, "12_plasma-maw-zorg"),
        (2, 0, "20_harbinger-zeta"), (2, 1, "21_dark-matter-witch"), (2, 2, "22_null-entity-quark"),
    ],
    "rodentia": [
        (0, 0, "00_commander-chewk"), (0, 1, "01_berzerker-fang"), (0, 2, "02_vanguard-captain-rix"),
        (1, 0, "10_sharpshooter-quill"), (1, 1, "11_grenadier-skitter"), (1, 2, "12_volley-captain-spark"),
        (2, 0, "20_alchemage-nibble"), (2, 1, "21_technomancer-squeak"), (2, 2, "22_grand-conduit-vex"),
    ],
    "pirates": [
        (0, 0, "00_captain-sven"), (0, 1, "01_swashbuckler-piet"), (0, 2, "02_iron-hook-harry"),
        (1, 0, "10_cannoneer-klaus"), (1, 1, "11_sniper-marie"), (1, 2, "12_bombard-billy"),
        (2, 0, "20_voodoo-witch-morgana"), (2, 1, "21_storm-schamane-hooky"), (2, 2, "22_chanteyman-drake"),
    ],
    "machina": [
        (0, 0, "00_chassis-endo-t8"), (0, 1, "01_slasher-cyber-jax"), (0, 2, "02_hydra-titan-mech"),
        (1, 0, "10_recon-luchs-01"), (1, 1, "11_heavy-battery-moerser-bot"), (1, 2, "12_ordnance-rail-viper"),
        (2, 0, "20_grid-drifter-datastream"), (2, 1, "21_proxy-glitch-hack"), (2, 2, "22_overlord-kernel-panic"),
    ],
    "undead": [
        (0, 0, "00_bone-racker-karl"), (0, 1, "01_grave-zombie-kauer"), (0, 2, "02_grim-reaper-silas"),
        (1, 0, "10_archer-mortis"), (1, 1, "11_pitcher-igor"), (1, 2, "12_vessel-plague-skull"),
        (2, 0, "20_lich-king-alistair"), (2, 1, "21_scribe-necro-silas"), (2, 2, "22_banshee-beatrice"),
    ],
    "shinobi": [
        (0, 0, "00_shred-katana-hanzmon"), (0, 1, "01_kunoichi-wind-flapper"), (0, 2, "02_tetsubo-oni-brute"),
        (1, 0, "10_dazzler-werner"), (1, 1, "11_rauch-meister-genzi"), (1, 2, "12_blowpipe-koga"),
        (2, 0, "20_ninjutsu-master-goemon"), (2, 1, "21_talisman-sorcerer-jun"), (2, 2, "22_vixen-kitsune"),
    ],
    "beasts": [
        (0, 0, "00_pikamon"), (0, 1, "01_shrew-quakes"), (0, 2, "02_storm-talon"),
        (1, 0, "10_flame-jaws"), (1, 1, "11_ember-tails"), (1, 2, "12_magma-plate"),
        (2, 0, "20_decay-spawn"), (2, 1, "21_cosmic-meditate"), (2, 2, "22_sonic-blossom"),
    ],
    "pixel": [
        (0, 0, "00_nullpointer-exception"), (0, 1, "01_pyrofox-a"), (0, 2, "02_pyrofox-b"),
        (1, 0, "10_arcershorn-a"), (1, 1, "11_pyrowand-a"), (1, 2, "12_shieldmon"),
        (2, 0, "20_phantom-mal-a"), (2, 1, "21_arcanus-a"), (2, 2, "22_arcanus-b"),
    ],
    "datacult": [
        (0, 0, "00_nullpointer-exception"), (0, 1, "01_datapath-replicant"), (0, 2, "02_chrome-code-shifter"),
        (1, 0, "10_quantum-qubit-knight"), (1, 1, "11_synapse-streamer"), (1, 2, "12_arcology-agent"),
        (2, 0, "20_buffer-flow-swarm"), (2, 1, "21_hyper-link-hound"), (2, 2, "22_ethereo"),
    ],
}
