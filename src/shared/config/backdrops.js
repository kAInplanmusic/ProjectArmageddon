/**
 * Kulissen (Hintergrundbilder) für die Kampfkarte.
 *
 * Aufbau: Zwölf Biome, je fünf Varianten. Die Variante bestimmt die Stimmung,
 * nicht das Gelände — „Maritim" gibt es als ruhige See, als Sturm, als Polarmeer,
 * als Kriegshafen und als asiatische Karstküste. Das Gelände selbst bleibt
 * prozedural und zerstörbar; die Kulisse liegt dahinter.
 *
 * Jede Kulisse trägt ihren Erzeugungs-Prompt mit. Das ist bewusst so: Der Prompt
 * ist die einzige Beschreibung, wie das Bild entstanden ist, und gehört damit zur
 * Sache. Zur Laufzeit wird er nicht gelesen.
 *
 * COMPOSITION: Das Terrain wird ÜBER die Kulisse gezeichnet und bedeckt die
 * untere Hälfte. Interessante Einzelheiten (Landmarken) müssen deshalb in der
 * oberen Bildhälfte liegen. Der gemeinsame Zusatz `COMPOSITION_SUFFIX` sorgt
 * dafür bei jeder Erzeugung.
 *
 * @module backdrops
 */

/**
 * Technischer Zusatz für jede Erzeugung.
 *
 * `horizon low` ist der wichtigste Teil: Die prozedurale Geländelinie liegt bei
 * etwa 53 % der Bildhöhe. Ein Horizont in der Bildmitte würde von ihr verdeckt
 * und die Kulisse wirkte abgeschnitten.
 */
export const COMPOSITION_SUFFIX = [
  'Wide panoramic establishing shot as a painted backdrop for a 2D artillery game.',
  'Horizon low in frame, the sky and distant landmarks occupy the upper two thirds.',
  'Highly detailed, dramatic atmospheric lighting, strong sense of depth.',
  'No text, no letters, no watermark, no signature, no user interface, no frame.',
].join(' ');

/** Höhe des Geländes im Verhältnis zur Bildhöhe (für Komposition und Tests). */
export const TERRAIN_COVERAGE = 0.47;

/**
 * Die Biome mit ihren Varianten.
 *
 * `file` ist der Dateiname unter `src/client/assets/backdrops/`.
 */
export const BACKDROP_BIOMES = Object.freeze([
  {
    id: 'maritime',
    label: 'Maritim & Meer',
    mapPreset: 'islands',
    variants: [
      {
        id: 'calm_day',
        label: 'Ruhige See',
        file: 'maritime_calm_day.jpg',
        prompt: 'A calm northern sea on a clear summer day. A weathered stone lighthouse with red-white stripes stands on a rocky headland in the left third, gulls wheeling around its top. Wooden fishing boats with patched sails rest in a small harbour below. Distant grey-blue headlands fade into haze. Soft afternoon light, gentle swell, high cirrus clouds.',
      },
      {
        id: 'storm_night',
        label: 'Sturm bei Nacht',
        file: 'maritime_storm_night.jpg',
        prompt: 'A violent storm over open ocean at night. Towering black waves with white foam crests, sheets of rain driven sideways. A listed sailing ship with torn sails struggles in the middle distance, tilted hard. The lighthouse beam cuts through the downpour from a jagged cliff on the right. Lightning splits the sky, illuminating towering cumulonimbus.',
      },
      {
        id: 'arctic_ice',
        label: 'Polarmeer',
        file: 'maritime_arctic_ice.jpg',
        prompt: 'An arctic sea locked in pack ice under a low pale sun. Enormous tabular icebergs with turquoise shadowed faces, pressure ridges of broken floes. A research vessel frozen into the ice sits mid-distance, its hull crusted white. Low sun grazing the horizon with a cold halo, faint aurora beginning above, light blue and rose palette.',
      },
      {
        id: 'war_harbor',
        label: 'Kriegshafen',
        file: 'maritime_war_harbor.jpg',
        prompt: 'A naval harbour in wartime at dusk. Grey battleships with tall masts and camouflage dazzle moored along concrete quays, black smoke columns rising from a burning vessel in the background. Massive dock cranes, barrage balloons floating on cables above the harbour, searchlight beams sweeping a smoke-hazed sky. Ash particles, muted steel and ember colours.',
      },
      {
        id: 'asian_karst',
        label: 'Asiatische Karstküste',
        file: 'maritime_asian_karst.jpg',
        prompt: 'A misty karst archipelago in the style of Ha Long Bay at dawn. Steep limestone pillars covered in green vegetation rise from calm emerald water, layered in atmospheric mist. Traditional wooden junk boats with battened sails and red lanterns drift between the islands. Soft glowing fog, pastel peach and jade palette, silhouetted birds.',
      },
    ],
  },

  {
    id: 'island',
    label: 'Südseeinsel & Karibik',
    mapPreset: 'islands',
    variants: [
      {
        id: 'caribbean_day',
        label: 'Karibischer Tag',
        file: 'island_caribbean_day.jpg',
        prompt: 'A Caribbean island on a brilliant day. A crescent beach of white sand curves around a turquoise lagoon, coral reef visible as dark patches beneath the surface. Coconut palms lean over the water, a wooden sloop with a white sail anchored offshore. Fluffy trade-wind clouds, deep blue sky, bright saturated colours.',
      },
      {
        id: 'sunset_golden',
        label: 'Goldener Sonnenuntergang',
        file: 'island_sunset_golden.jpg',
        prompt: 'A tropical island at sunset. Palm trees silhouetted against a blazing sky of orange, magenta and deep violet, the sun a red disc touching a calm sea. A long weathered wooden pier extends into the water, its planks glowing. A few anchored boats rocked flat and dark. Reflected light path on the water, dramatic cloud bands.',
      },
      {
        id: 'volcano',
        label: 'Vulkanausbruch',
        file: 'island_volcano.jpg',
        prompt: 'A volcanic island erupting at dusk. A cone mountain in the centre of the frame spews an immense ash plume lit orange from within, lava fountains along the flank, glowing lava rivers reaching the sea in bursts of steam. Palm forest on the lower slopes partially scorched. Dramatic red and black sky, falling ash.',
      },
      {
        id: 'typhoon',
        label: 'Taifun',
        file: 'island_typhoon.jpg',
        prompt: 'A tropical island under a typhoon. Enormous dark storm walls with a green-black tint, palms bent almost horizontal under wind, fronds torn away. Massive waves breaking white over a low reef, spray filling the air. A small tin-roofed settlement huddling in the middle distance. Oppressive slate and greenish light.',
      },
      {
        id: 'polynesian_night',
        label: 'Polynesische Nacht',
        file: 'island_polynesian_night.jpg',
        prompt: 'A Polynesian lagoon village at night. Traditional outrigger canoes drawn up on a dark beach, a long thatched meeting house on stilts over the water, lit tiki torches along a path. The Milky Way arches brilliantly overhead, its reflection broken on gentle lagoon ripples. Warm torch glow against cool blue starlight.',
      },
    ],
  },

  {
    id: 'alpine',
    label: 'Gebirge & Alpin',
    mapPreset: 'mountains',
    variants: [
      {
        id: 'summer_meadow',
        label: 'Alpensommer',
        file: 'alpine_summer_meadow.jpg',
        prompt: 'An alpine summer valley. Snow-capped granite peaks in the background catching bright sun, a green meadow slope in the middle distance with wooden chalets and hay racks, a cable car line rising toward a ridge. Scattered conifers, a clear mountain stream. Vivid blue sky with small crisp cumulus clouds.',
      },
      {
        id: 'winter_snow',
        label: 'Hochwinter',
        file: 'alpine_winter_snow.jpg',
        prompt: 'High alpine winter. Deep snow covering everything, jagged white peaks under a pale sun. A ski slope with lift pylons cuts down the right side, an avalanche of powder snow tumbling down a distant face with a dust cloud. Frozen lake in the valley floor, snow-laden spruce. Cold blue shadows, brilliant white highlights.',
      },
      {
        id: 'himalaya_monastery',
        label: 'Himalaya-Kloster',
        file: 'alpine_himalaya_monastery.jpg',
        prompt: 'A Himalayan monastery clinging to a cliff face at high altitude. Whitewashed walls with red and gold trim, prayer flags strung across the gorge on long lines, stupas with painted eyes. Immense snow peaks behind, the highest clouds below the summits. Thin cold air, high contrast, ochre and ice-blue palette.',
      },
      {
        id: 'war_ruins',
        label: 'Kriegsruinen',
        file: 'alpine_war_ruins.jpg',
        prompt: 'A bombed mountain village in a high valley. Ruined stone houses with collapsed roofs and exposed beams, blackened walls, a shattered church tower still standing in the centre. Smoke drifting across the slopes, a burnt-out vehicle on the road. Grey overcast light, ash in the air, desaturated palette with ember accents.',
      },
      {
        id: 'moonlit_peaks',
        label: 'Mondnacht',
        file: 'alpine_moonlit_peaks.jpg',
        prompt: 'Jagged mountain peaks under an enormous full moon. A still black mountain lake in the middle distance mirrors the moon and the ridgeline perfectly. Sharp silhouettes of rock and snow, moonlight rimming the edges of the peaks. Deep indigo sky with brilliant stars, cold silver and slate palette, long shadows.',
      },
    ],
  },

  {
    id: 'forest',
    label: 'Wald & Wiese',
    mapPreset: 'hills',
    variants: [
      {
        id: 'summer_meadow',
        label: 'Sommerwiese',
        file: 'forest_summer_meadow.jpg',
        prompt: 'A summer wildflower meadow at the edge of a deciduous forest. Rolling grass with red poppies and yellow cornflowers, haystacks drying in the middle distance, a weathered wooden barn and fence on the right. Tall oaks and beeches behind, sunlit green. Deep blue sky, warm light, butterflies.',
      },
      {
        id: 'autumn_forest',
        label: 'Herbstwald',
        file: 'forest_autumn_forest.jpg',
        prompt: 'A golden autumn birch forest in light mist. Straight white trunks with brilliant yellow and amber canopies, a leaf-covered path winding through. A stag standing in the middle distance, mushrooms and ferns along the ground. Soft diffused morning light with visible sun rays through the mist, warm and cool contrast.',
      },
      {
        id: 'winter_forest',
        label: 'Winterwald',
        file: 'forest_winter_forest.jpg',
        prompt: 'A snow-laden conifer forest in deep winter. Heavy white snow bending spruce branches, a half-frozen stream cutting through the middle, animal tracks crossing a clearing. Pale low sun casting long blue shadows across the snow, faint mist between the trunks, quiet monochrome with pale gold light.',
      },
      {
        id: 'fog_night',
        label: 'Nebel bei Nacht',
        file: 'forest_fog_night.jpg',
        prompt: 'A dense fogbound forest at night. Bare black branches emerging from thick grey vapour, a single warm lantern glow deep in the middle distance providing the only light source. Almost monochrome, heavy atmosphere, high contrast silhouettes, unsettling and quiet.',
      },
      {
        id: 'fantasy_glade',
        label: 'Verzauberte Lichtung',
        file: 'forest_fantasy_glade.jpg',
        prompt: 'An enchanted forest clearing. A colossal ancient tree with roots like buttresses dominates the centre, bioluminescent mushrooms and glowing blue flowers light the forest floor, fireflies drifting between twisted trunks. Shafts of pale green light through the canopy, deep purples and cyan glow, dreamlike and magical.',
      },
    ],
  },

  {
    id: 'urban',
    label: 'Stadt & Industrie',
    mapPreset: 'hills',
    variants: [
      {
        id: 'modern_day',
        label: 'Moderne Stadt',
        file: 'urban_modern_day.jpg',
        prompt: 'A modern city skyline on a clear day. Glass and steel towers of varied heights with reflective facades, a green park with mature trees in the middle distance, a river with bridges crossing the centre. Clean modern architecture, sharp shadows, bright blue sky with light haze at the horizon.',
      },
      {
        id: 'neon_night',
        label: 'Neonnacht',
        file: 'urban_neon_night.jpg',
        prompt: 'A futuristic city street at night in heavy rain. Towering buildings covered in neon signage and holographic advertisements in magenta, cyan and amber, rain-slick asphalt reflecting every light source, elevated transit lines overhead, steam venting from the street. Dense, moody, saturated neon against deep blue-black.',
      },
      {
        id: 'industrial_ruins',
        label: 'Industrieruine',
        file: 'urban_industrial_ruins.jpg',
        prompt: 'An abandoned steelworks. Rusted blast furnaces, skeletal conveyor gantries, rows of brick chimneys against a pale overcast sky, one chimney still trailing thin smoke. Corroded pipes and rail sidings, weeds breaking through concrete. Desaturated rust, ochre and grey palette, melancholic industrial decay.',
      },
      {
        id: 'war_torn',
        label: 'Kriegsstadt',
        file: 'urban_war_torn.jpg',
        prompt: 'A bombed city district. Gutted apartment blocks with exposed floors and dangling reinforcement, mountains of rubble and twisted metal in the streets, smoke columns rising across the skyline. A burnt-out tank hull frame right of centre. Grey ash haze, fire glow in the distance, desaturated with orange embers.',
      },
      {
        id: 'indian_monsoon',
        label: 'Indische Monsunstadt',
        file: 'urban_indian_monsoon.jpg',
        prompt: 'An Indian city under monsoon skies. Densely packed colourful buildings with painted facades and rooftop water tanks, an ornate temple with carved gopuram towers, bazaar awnings and hanging wires across the street. Towering dark monsoon clouds with a shaft of sunlight breaking through, wet reflective streets, saturated ochre, teal and crimson.',
      },
    ],
  },

  {
    id: 'cosmos',
    label: 'Universum & Galaxie',
    mapPreset: 'mountains',
    variants: [
      {
        id: 'nebula',
        label: 'Nebel',
        file: 'cosmos_nebula.jpg',
        prompt: 'A vast colourful nebula in deep space. Billowing clouds of magenta, teal and deep violet gas lit from within, dense star clusters embedded in the dust, a distant spiral galaxy visible as a small smudge in the upper right. Layers of depth from foreground dust lanes to distant starfields, awe-inspiring scale.',
      },
      {
        id: 'ringed_planet',
        label: 'Ringplanet',
        file: 'cosmos_ringed_planet.jpg',
        prompt: 'A colossal ringed gas giant seen from the surface of its moon. The planet occupies the upper left, banded in amber and cream, its rings slicing diagonally across the frame casting a shadow on the cloud tops. Jagged icy moon terrain in the foreground, a small distant sun, sharp hard shadows and black sky.',
      },
      {
        id: 'space_station',
        label: 'Raumstation',
        file: 'cosmos_space_station.jpg',
        prompt: 'A large orbital space station above Earth. Truss structures with long solar panel arrays, a rotating ring section, docking modules with lit windows glowing. Earth fills the lower background with a curved horizon, cloud swirls and a thin bright atmosphere line. Deep black space above, hard sunlight and deep shadow.',
      },
      {
        id: 'black_hole',
        label: 'Schwarzes Loch',
        file: 'cosmos_black_hole.jpg',
        prompt: 'A supermassive black hole with a brilliant accretion disk. The disk of superheated orange-white matter wraps around the event horizon, light bent into a halo above and below by gravitational lensing. A thin photon ring, relativistic jets firing vertically. Utter black core, extreme contrast, distant stars distorted.',
      },
      {
        id: 'alien_world',
        label: 'Fremde Welt',
        file: 'cosmos_alien_world.jpg',
        prompt: 'An alien planet surface with two suns. Towering crystal spires of translucent violet mineral rising from a rust-red plain, strange spiral plants, a low horizon with a huge pale gas giant rising. Two suns casting twin shadows, one warm and one cold, dusty atmosphere, unfamiliar and vast.',
      },
    ],
  },

  {
    id: 'abstract',
    label: 'Abstrakt & Verrückt',
    mapPreset: 'caverns',
    variants: [
      {
        id: 'geometric',
        label: 'Geometrisch',
        file: 'abstract_geometric.jpg',
        prompt: 'A bold geometric abstract composition. Flat overlapping triangles, circles and hard-edged bars in strong primaries with black outlines, arranged in a dynamic diagonal rhythm. Bauhaus-inspired, perfectly flat colour fields, no gradients, crisp edges, poster-like clarity.',
      },
      {
        id: 'psychedelic',
        label: 'Psychedelisch',
        file: 'abstract_psychedelic.jpg',
        prompt: 'A swirling psychedelic vortex. Concentric melting waves of fluorescent pink, acid green, orange and electric blue twisting around a centre, forms dissolving into each other, faint eye motifs emerging from the pattern. Dense, hypnotic, hand-painted 1960s poster style with heavy colour saturation.',
      },
      {
        id: 'vaporwave',
        label: 'Vaporwave',
        file: 'abstract_vaporwave.jpg',
        prompt: 'A vaporwave scene. A glowing wireframe grid receding to a vanishing point on the horizon, black silhouettes of classical statues and palm trees against a gradient sky of pink, lilac and cyan. A large pale sun disc with horizontal scan lines, retro digital aesthetic, glossy and synthetic.',
      },
      {
        id: 'fractal',
        label: 'Fraktal',
        file: 'abstract_fractal.jpg',
        prompt: 'A complex fractal structure filling the frame. Recursive self-similar spirals and filigree branching forms in iridescent copper, teal and violet, glowing at the edges with luminous detail at every scale. Deep metallic depth, mathematically intricate, dark background making the structure stand out.',
      },
      {
        id: 'surreal',
        label: 'Surreal',
        file: 'abstract_surreal.jpg',
        prompt: 'A surreal dreamscape. An inverted landscape where the ground hangs above and a calm sea fills the sky, giant everyday objects floating weightless — a chair, a clock with no hands, a staircase leading nowhere. Perfectly sharp realistic rendering of impossible geometry, cool clear light, unsettling stillness.',
      },
    ],
  },

  {
    id: 'caverns',
    label: 'Höhlenwelten',
    mapPreset: 'caverns',
    variants: [
      {
        id: 'limestone',
        label: 'Tropfsteinhöhle',
        file: 'caverns_limestone.jpg',
        prompt: 'A vast limestone cavern. Immense stalactites hanging from a dark ceiling, matching stalagmites rising from the floor, a clear underground river winding through the middle distance. A single shaft of daylight breaks through a ceiling fissure, illuminating mist and the river surface. Damp ochre and grey stone, dramatic single light source.',
      },
      {
        id: 'crystal',
        label: 'Kristallhöhle',
        file: 'caverns_crystal.jpg',
        prompt: 'A cavern filled with giant translucent crystals. Enormous angled selenite beams up to many metres tall growing from floor and walls, glowing faintly from within, refracting light into rainbow caustics across the chamber. Cold blue-white luminescence, glassy reflections, otherworldly and silent.',
      },
      {
        id: 'lava_tube',
        label: 'Lavaröhre',
        file: 'caverns_lava_tube.jpg',
        prompt: 'A volcanic lava tube. A river of molten orange lava flowing along the floor, obsidian black walls with glowing orange cracks, stalactites of cooled basalt overhead. Embers rising and drifting in the heat haze, the rock surface glowing dull red near the flow. Extreme contrast between black rock and incandescent lava.',
      },
      {
        id: 'ice_cave',
        label: 'Eishöhle',
        file: 'caverns_ice_cave.jpg',
        prompt: 'A blue ice cave beneath a glacier. Sculpted translucent ice walls in deep sapphire and cyan, a frozen waterfall descending mid-frame, smooth meltwater-carved channels. Daylight filtering through the ice roof, glowing turquoise from within. Clean, cold, glassy surfaces with fine frost detail.',
      },
      {
        id: 'underwater',
        label: 'Unterwasserhöhle',
        file: 'caverns_underwater.jpg',
        prompt: 'A flooded underwater cave. Crystal-clear water filling the chamber, sunlight beams penetrating from a distant opening and fanning through the water, stalactites submerged and draped in sediment. Diver-scale immensity, pale sand floor, teal and aquamarine light with suspended particles catching the rays.',
      },
    ],
  },

  {
    id: 'fantasy',
    label: 'Fantasy',
    mapPreset: 'mountains',
    variants: [
      {
        id: 'elven_city',
        label: 'Elfenstadt',
        file: 'fantasy_elven_city.jpg',
        prompt: 'An elven city built into a colossal forest. Slender white towers and curved bridges woven between enormous tree trunks high above the ground, waterfalls spilling from platforms into a misty gorge below. Lanterns suspended on chains, delicate filigree architecture. Golden light through green canopy, ethereal and ancient.',
      },
      {
        id: 'dragon_peak',
        label: 'Drachenberg',
        file: 'fantasy_dragon_peak.jpg',
        prompt: 'A dragon circling a mountain fortress. A vast scaled dragon with spread wings silhouetted against a burning sky, wheeling around a snow-capped peak crowned by a ruined stone citadel. Long tail trailing, wings casting a shadow across the rock face. Dramatic backlight, ash and ember atmosphere, epic scale.',
      },
      {
        id: 'castle_siege',
        label: 'Belagerung',
        file: 'fantasy_castle_siege.jpg',
        prompt: 'A fantasy castle under siege. A towering multi-towered stone castle with flying banners on a rocky outcrop, trebuchets and siege towers on the plain before it, burning tents and smoke. Volleys of flaming projectiles arcing through the sky, ladders against the walls. Dusk, orange firelight against cold grey stone.',
      },
      {
        id: 'dark_swamp',
        label: 'Dunkler Sumpf',
        file: 'fantasy_dark_swamp.jpg',
        prompt: 'A cursed swamp at twilight. Dead twisted trees rising from black stagnant water, hanging moss and fog, faint sickly green witch-lights hovering above the surface. A ruined wooden causeway half sunk, bones of a large creature in the shallows. Oppressive purple-green gloom, still and menacing.',
      },
      {
        id: 'crystal_magic',
        label: 'Kristallmagie',
        file: 'fantasy_crystal_magic.jpg',
        prompt: 'A floating island held aloft by magic. A chunk of rock with waterfalls pouring off its underside, topped by a ring of glowing rune stones and a luminous crystal core. An aurora of green and violet light twisting above, smaller shattered islands drifting nearby. Arcane glow, vast sky below, magical and weightless.',
      },
    ],
  },

  {
    id: 'hyperreal',
    label: 'Hyperrealismus',
    mapPreset: 'mountains',
    variants: [
      {
        id: 'golden_valley',
        label: 'Goldenes Tal',
        file: 'hyperreal_golden_valley.jpg',
        prompt: 'A photorealistic river valley at golden hour. Precise detail in every element: individual trees on the slopes, gravel bars in the braided river, warm sunlight raking across the landscape creating long shadows, atmospheric haze layering the distance. Natural colours, high dynamic range, professional landscape photography.',
      },
      {
        id: 'desert_caravan',
        label: 'Wüste',
        file: 'hyperreal_desert_caravan.jpg',
        prompt: 'Photorealistic desert dunes at midday. Fine wind-ripple texture on the sand surfaces, sharp curving dune crests with razor edges, a line of camels and figures crossing a distant ridge as small silhouettes. Heat shimmer near the ground, deep blue cloudless sky, extreme clarity and natural colour.',
      },
      {
        id: 'polar_station',
        label: 'Polstation',
        file: 'hyperreal_polar_station.jpg',
        prompt: 'Photorealistic polar research station. A cluster of orange modular buildings on stilts above wind-scoured snow, antenna masts and fuel drums, tracked vehicles parked nearby. Immense ice sheet extending to a distant mountain range under clear low sun. Sharp cold light, blue snow shadows, documentary realism.',
      },
      {
        id: 'jungle_river',
        label: 'Dschungelfluss',
        file: 'hyperreal_jungle_river.jpg',
        prompt: 'A photorealistic rainforest river. Dense multi-layered canopy with individual leaves and epiphytes visible, a brown river winding below, morning mist rising in ribbons between the trees. Sun breaking through in shafts, rich saturated greens, humid atmosphere, wildlife-scale detail.',
      },
      {
        id: 'coastal_cliffs',
        label: 'Steilküste',
        file: 'hyperreal_coastal_cliffs.jpg',
        prompt: 'A photorealistic coastline with sheer cliffs. Layered sedimentary rock faces with visible strata, surf breaking white against the base, a stone lighthouse on the headland, seabirds on the ledges. Overcast breaking to sun, wet rock glistening, natural muted palette, sharp realistic texture.',
      },
    ],
  },

  {
    id: 'western',
    label: 'Cowboy & Western',
    mapPreset: 'hills',
    variants: [
      {
        id: 'desert_town',
        label: 'Wüstenstadt',
        file: 'western_desert_town.jpg',
        prompt: 'A dusty western frontier town at midday. A single wide main street of packed dirt lined with wooden false-front saloons and a general store, hitching rails and water troughs, saguaro cacti and scrub. Red sandstone mesas rising in the distance, heat haze, bleached timber and ochre dust palette.',
      },
      {
        id: 'sunset_duel',
        label: 'Duell im Sonnenuntergang',
        file: 'western_sunset_duel.jpg',
        prompt: 'A western street at sunset. Two lone figures in long coats and hats standing apart in the middle of a wide dusty street, both silhouetted black against a blazing orange and red sky. Wooden buildings dark on either side, dust hanging in the air, long shadows stretching toward the viewer.',
      },
      {
        id: 'campfire_night',
        label: 'Lagerfeuer',
        file: 'western_campfire_night.jpg',
        prompt: 'A prairie camp at night. A covered wagon circle with canvas tops, horses picketed nearby, a bright campfire in the centre with figures seated as silhouettes. The Milky Way blazing overhead, grass moving in the wind. Warm firelight pool against cold blue starlight, vast and lonely.',
      },
      {
        id: 'winter_frontier',
        label: 'Wintergrenze',
        file: 'western_winter_frontier.jpg',
        prompt: 'A snowbound frontier town. Wooden buildings with snow-laden roofs along a frozen street, icicles hanging from eaves, a frozen river with an ice-skimmed surface beside the town. Bare cottonwoods, smoke from chimneys standing straight in still cold air. Muted white and grey with warm window lights.',
      },
      {
        id: 'native_prairie',
        label: 'Prärie',
        file: 'western_native_prairie.jpg',
        prompt: 'A Native American encampment on the open prairie. Conical tipis painted with geometric designs arranged in a circle, horses grazing, a herd of bison crossing the distant plain. Rolling grass to the horizon under a vast dramatic sky with towering cumulus. Warm earth tones, golden late light.',
      },
    ],
  },

  {
    id: 'noir',
    label: 'Film Noir & Cinematisch',
    mapPreset: 'hills',
    variants: [
      {
        id: 'rainy_street',
        label: 'Regennasse Straße',
        file: 'noir_rainy_street.jpg',
        prompt: 'A rain-soaked city street at night in classic film noir. Black and white, deep shadows and wet asphalt reflecting a single glowing neon sign, fire escapes and brick facades, a lone streetlamp halo in the mist, puddles catching light. Hard chiaroscuro contrast, low-key lighting, heavy atmosphere.',
      },
      {
        id: 'harbor_docks',
        label: 'Hafenkai',
        file: 'noir_harbor_docks.jpg',
        prompt: 'Foggy harbour docks at night in film noir style. Black and white, a moored freighter looming as a dark mass with a single lit porthole, skeletal cargo cranes silhouetted, mooring bollards and coiled rope in the foreground, thick fog swallowing the background. Extreme contrast, pools of lamp light, ominous.',
      },
      {
        id: 'smoky_bar',
        label: 'Verrauchte Bar',
        file: 'noir_smoky_bar.jpg',
        prompt: 'A smoky bar interior seen through a window at night, film noir style. Black and white, venetian blind slats casting hard striped shadows across the scene, cigarette smoke curling in a beam of light, blurred figures and bottles behind. High contrast, voyeuristic framing, deep shadow.',
      },
      {
        id: 'wet_road_chase',
        label: 'Verfolgung',
        file: 'noir_wet_road_chase.jpg',
        prompt: 'A car chase on a wet mountain road at night, film noir style. Black and white, twin headlight beams cutting through dense fog from a pursuing vehicle, wet tarmac reflecting light, guardrail and dark pine silhouettes, steep low camera angle. Motion tension, stark contrast, rain streaks.',
      },
      {
        id: 'rooftop_silhouette',
        label: 'Dachsilhouette',
        file: 'noir_rooftop_silhouette.jpg',
        prompt: 'A lone figure in a trench coat and fedora standing at the edge of a rooftop, film noir style. Black and white, seen from behind and below as a hard silhouette against a city skyline of lit windows and water towers, wind lifting the coat. Low-key lighting, dramatic negative space, brooding and cinematic.',
      },
    ],
  },
  {
    /*
     * Sintflut — das Leitbiom der Geländeform `flooded`.
     *
     * Warum ein EIGENES Biom und nicht ein vorhandenes: Das Projekt verlangt,
     * dass jede Geländeform ein eigenes Leitbiom hat, dessen `mapPreset` genau
     * diese Form ist (siehe `tests/backdrops.test.js`). „Flut" lief bis hierher
     * mit der `forest`-Szene — die Karte sah aus wie ein Wald.
     *
     * Vier Varianten, alle unter Wasser, aber in verschiedenen Weltgegenden:
     * Stadt, Tropen, Wald, Dammbruch. So bleibt „Flut" erkennbar, ohne dass zwei
     * Partien gleich aussehen.
     */
    id: 'deluge',
    label: 'Sintflut & Überschwemmung',
    mapPreset: 'flooded',
    variants: [
      {
        id: 'rooftops',
        label: 'Versunkene Stadt',
        file: 'deluge_rooftops.jpg',
        prompt: 'Drowned metropolis after the flood. Only the upper storeys and rooftops of a modern city break the surface of still brown-green water: air conditioners, stairwells, a satellite dish, a rooftop garden gone wild. A church tower leans in the left third, its clock face warped. Debris — planks, oil drums, a yellow lifeboat — drifts between the buildings. Overcast sky, flat grey light, unnaturally still water. Muted greens and rust.',
      },
      {
        id: 'monsoon',
        label: 'Monsun',
        file: 'deluge_monsoon.jpg',
        prompt: 'Torrential monsoon flood in a tropical river delta. Brown water has swallowed whole villages: bamboo stilt houses stand knee-deep, their tin roofs glinting wet. Palms bend in driving rain, a water buffalo swims in the middle distance. Sheets of rain, low grey monsoon clouds, distant hills shrouded in mist. Ochre water, deep green vegetation, silver rain.',
      },
      {
        id: 'drowned_forest',
        label: 'Ertränkter Wald',
        file: 'deluge_drowned_forest.jpg',
        prompt: 'A flooded forest in late autumn. Slow brown water stands between the trunks of old oaks, mirrors every branch. Dead leaves float in red-orange drifts across the surface, a submerged stone bridge visible just below the waterline. Mist rises off the water at dawn, sun low and pale through the trunks. Melancholy, still, ochre and slate palette.',
      },
      {
        id: 'rice_terraces',
        label: 'Reisterrassen',
        file: 'deluge_rice_terraces.jpg',
        prompt: 'Flooded rice terraces at dawn after a long rain. Curved terraces of standing water step up a hillside, each one mirroring the pale sky, low stone bunds dividing them. A lone water buffalo stands on a dry ridge in the middle distance, mist settling in the valley below. Emerald green shoots, silver water, soft blue-grey morning light.',
      },
      {
        id: 'dam_break',
        label: 'Dammbruch',
        file: 'deluge_dam_break.jpg',
        prompt: 'A ruptured dam in the evening. A broken concrete wall in the left third, water still pouring through the gap in a white roaring curve, a ruined spillway, twisted girders. Below, a valley half-submerged, power pylons standing in the flood. Warning-red light from a setting sun, spray haze, dramatic and desolate.',
      },
    ],
  },
  {
    /*
     * Weite — das Leitbiom der Geländeform `open`.
     *
     * Die Form ist die FLACHSTE im Katalog (Höhenvarianz rund 16 gegen 62 bei
     * `hills`). Die Kulissen müssen das tragen: weiter Horizont, wenig im Weg,
     * viel Himmel. Wer auf einer offenen Karte steht, soll das Gefühl haben,
     * weitschießen zu können.
     *
     * Deshalb heißen die Varianten hier „Ebenen" und nicht „Hügel": Ein Hügel im
     * Bild würde der flachen Form widersprechen.
     */
    id: 'open',
    label: 'Weite & Ebene',
    mapPreset: 'open',
    variants: [
      {
        id: 'wheat_plains',
        label: 'Weizenfelder',
        file: 'open_wheat_plains.jpg',
        prompt: 'An endless wheat plain at golden hour. Ripe wheat stretches to a flat horizon, combed into waves by the wind, a single weathered farmstead with a windmill far in the left third. A lone dirt track cuts through the crop toward the horizon. Immense pale sky with towering cumulus, warm ochre and gold, immense sense of emptiness and distance.',
      },
      {
        id: 'heath_moor',
        label: 'Heide',
        file: 'open_heath_moor.jpg',
        prompt: 'Rolling purple heather moorland under a huge weather sky. Low rounded hills covered in blooming heather, a narrow peat path winding between them, a lone standing stone on a ridge in the left third. Fast-moving broken clouds casting wide shadows across the land. Muted violet, rust and slate, cool northern light, vast and quiet.',
      },
      {
        id: 'salt_flats',
        label: 'Salzpfanne',
        file: 'open_salt_flats.jpg',
        prompt: 'A vast white salt flat under a bleached sky. Cracked hexagonal salt polygons stretch to distant blue mountains that float on a shimmering mirage, thin water film mirroring the sky in patches. A single survey marker post stands in the left third. Blinding high-key light, faint heat haze, pale white and turquoise, enormous emptiness.',
      },
      {
        id: 'polder',
        label: 'Polder',
        file: 'open_polder.jpg',
        prompt: 'A flat reclaimed polder landscape under a wide Dutch sky. Perfectly straight drainage ditches lined with poplars divide green pastures, a brick windmill stands in the left third, cattle graze in the middle distance. Enormous cloudscape with a low horizon, clear cool light, saturated green and grey-blue, orderly and open.',
      },
      {
        id: 'prairie_storm',
        label: 'Präriesturm',
        file: 'open_prairie_storm.jpg',
        prompt: 'A prairie ahead of an approaching supercell thunderstorm. Flat grassland stretching to the horizon, a barbed wire fence line running left to right in the foreground, a distant line of cottonwoods in the left third bending in the wind. A vast dark shelf cloud with a greenish base occupies the upper half, first lightning flickering. Yellow-green grass, bruised purple sky, ominous scale.',
      },
    ],
  },
  {
    /*
     * Felsen — das Leitbiom der Geländeform `spires`.
     *
     * Die Form ist die STEILSTE im Katalog (Höhenvarianz rund 213, mehr als das
     * Dreifache von `hills`). Die Kulissen müssen hohe, senkrechte Formen zeigen —
     * eine flache Ebene im Hintergrund würde die Steilheit der Karte Lügen
     * strafen.
     */
    id: 'spires',
    label: 'Hochgebirge & Karst',
    mapPreset: 'spires',
    variants: [
      {
        id: 'karst_peaks',
        label: 'Karsttürme',
        file: 'spires_karst_peaks.jpg',
        prompt: 'Towering karst limestone peaks rising from a misty river valley. Steep vertical rock towers covered in dark green vegetation stand like teeth, their tops lost in low cloud, a narrow river winding between them in the left third. Layered mist separating the ridges, pale grey and jade palette, immense vertical scale, Chinese ink-painting mood.',
      },
      {
        id: 'dolomites',
        label: 'Dolomiten',
        file: 'spires_dolomites.jpg',
        prompt: 'Pale limestone towers of a dolomite massif at alpenglow. Sheer vertical rock walls with horizontal banding rise from a scree slope, deep shadowed gullies between them, a narrow ledge path visible high on the left tower. The peaks catch the last warm orange light while the valleys below are already cold blue. Sparse pines on the lower slopes, crystal clear alpine air, immense vertical scale.',
      },
      {
        id: 'basalt_columns',
        label: 'Basaltsäulen',
        file: 'spires_basalt_columns.jpg',
        prompt: 'Geometric basalt columns rising from a black volcanic shore. Hundreds of hexagonal pillars of dark grey stone stand in stepped formation like a broken organ, some fractured into blocks at their base, sea spray at their feet. Cold overcast light, wet rock gleaming, deep greys and near-black with a pale horizon, stark and monumental.',
      },
      {
        id: 'desert_hoodoos',
        label: 'Felspfeiler',
        file: 'spires_desert_hoodoos.jpg',
        prompt: 'Desert hoodoos and rock spires at sunset. Tall thin sandstone pillars with caprocks stand like a crowd of petrified figures across a red gravel plain, deep shadow slots between them, a dry wash crossing the foreground. Long shadows raking right to left, the sky burning orange above a deep violet horizon, sculpted wind-carved rock, monumental and still.',
      },
      {
        id: 'ice_spires',
        label: 'Eisnadeln',
        file: 'spires_ice_spires.jpg',
        prompt: 'Blue ice spires of a crevassed glacier under a low polar sun. Jagged towers and blades of translucent blue ice rise in ranks above a frozen plain, deep crevasses cutting between them, wind-sculpted snow ridges in the foreground. Low sun grazing the horizon with a cold halo, ice glowing turquoise from within, pale blue and white with no warmth.',
      },
    ],
  },
  {
    /*
     * Gewirr — das Leitbiom der Geländeform `warren`.
     *
     * Die Form ist die ZERKLÜFTETSTE im Katalog (47 Geländesprünge je
     * Bildschirmbreite gegen 0 bei `hills`). Sie ist für den Nahkampf gedacht:
     * enge Sichtlinien, viel Deckung. Die Kulissen zeigen deshalb ENGE Orte —
     * Schlucht, Ruinen, Höhlen, Dickicht, Gräben —, nicht offene Landschaften.
     */
    id: 'warren',
    label: 'Gewirr & Enge',
    mapPreset: 'warren',
    variants: [
      {
        id: 'slot_canyon',
        label: 'Schlucht',
        file: 'warren_slot_canyon.jpg',
        prompt: 'A narrow slot canyon opening into a wider gorge. Glowing orange sandstone walls curve and twist overhead, sculpted into smooth waves by flash floods, a thin strip of sky far above, a dry sandy floor with driftwood. Light bouncing off the walls in warm reflected glow, deep shadow niches, narrow and enclosing.',
      },
      {
        id: 'ruin_labyrinth',
        label: 'Stadtruinen',
        file: 'warren_ruin_labyrinth.jpg',
        prompt: 'Overgrown ruins of a bombed city district. Collapsed brick facades and broken walls form narrow crooked alleys, rubble and twisted rebar in the gaps, vines and young birches reclaiming the shell of a church in the left third. Overcast light, warm brick against cold grey concrete, claustrophobic and maze-like.',
      },
      {
        id: 'cave_network',
        label: 'Höhlengänge',
        file: 'warren_cave_network.jpg',
        prompt: 'A vast limestone cave chamber with side passages. Thick stalactites and columns crowd the ceiling, several dark galleries branch off behind them, a shallow turquoise pool on the floor reflects the rock. A single shaft of daylight falls from a hole above onto a flowstone terrace in the left third. Cold blue-green in the shadows, warm ochre where the light lands, mysterious depth.',
      },
      {
        id: 'bamboo_thicket',
        label: 'Bambusdickicht',
        file: 'warren_bamboo_thicket.jpg',
        prompt: 'A dense bamboo thicket with a narrow trodden path. Thousands of slender green culms rise vertically and close together, cutting the light into stripes, a thin winding trail leads into the depth in the left third. Soft green filtered light, hazy depth, leaves rattling overhead, dense and enclosing.',
      },
      {
        id: 'trench_lines',
        label: 'Schützengräben',
        file: 'warren_trench_lines.jpg',
        prompt: 'A labyrinth of world war one trench lines in a churned field. Deep zigzagging trenches with sandbag parapets, duckboards and barbed wire entanglements cross each other in every direction, shattered tree stumps and flooded shell craters between them. Overcast dawn light, grey-brown mud, mist in the hollows, desolate and maze-like.',
      },
    ],
  },
]);

/** Alle Varianten als flache Liste. */
export const ALL_BACKDROPS = Object.freeze(
  BACKDROP_BIOMES.flatMap(biome => biome.variants.map(variant => ({
    biomeId: biome.id,
    biomeLabel: biome.label,
    mapPreset: biome.mapPreset,
    id: variant.id,
    label: variant.label,
    file: variant.file,
    prompt: variant.prompt,
    /** Eindeutiger Schlüssel: „biome/variante". */
    key: `${biome.id}/${variant.id}`,
  }))),
);

/** Findet eine Kulisse über ihren Schlüssel. */
export function getBackdrop(biomeId, variantId) {
  const biome = BACKDROP_BIOMES.find(b => b.id === biomeId);
  if (!biome) return null;
  const variant = biome.variants.find(v => v.id === variantId);
  if (!variant) return null;
  // `mapPreset` gehört mit ins Ergebnis: Daran erkennt der Aufrufer, zu welchem
  // Gelände die Kulisse passt. `pickBackdrop` liefert es ebenfalls — sonst hätten
  // die beiden Wege unterschiedliche Formen.
  return {
    ...variant,
    biomeId: biome.id,
    biomeLabel: biome.label,
    mapPreset: biome.mapPreset,
    key: `${biome.id}/${variant.id}`,
  };
}

/** Alle Kulissen, die zu einer Karte passen. */
export function backdropsForPreset(preset) {
  return ALL_BACKDROPS.filter(backdrop => backdrop.mapPreset === preset);
}

/**
 * Wählt eine Kulisse deterministisch aus einem Zahlenwert (z. B. dem Match-Seed).
 *
 * Deterministisch heißt: gleicher Seed ergibt dieselbe Kulisse. Das ist nötig,
 * damit ein Replay dieselbe Karte zeigt — eine Kulisse, die sich bei jedem
 * Abspielen ändert, würde das Bild vom aufgezeichneten Geschehen trennen.
 *
 * @param {number} seed
 * @param {string} [preset] - auf diese Karte passende Kulissen bevorzugen
 * @returns {object} Kulisse (nie null)
 */
export function pickBackdrop(seed, preset = null) {
  // Bevorzugt die Varianten des LEITBIOMS. Sonst käme bei „Hügel" zufällig eine
  // Noir-Stadt oder ein Western-Nest über grünem Gras heraus.
  const leitbiom = preset ? PRIMARY_BIOME_BY_PRESET[preset] : null;
  const biome = leitbiom ? BACKDROP_BIOMES.find(b => b.id === leitbiom) : null;
  // `mapPreset` gehört mit ins Ergebnis: daran erkennt der Aufrufer, zu welchem
  // Gelände die Kulisse passt.
  const auswahl = biome
    ? biome.variants.map(v => ({
      ...v,
      biomeId: biome.id,
      biomeLabel: biome.label,
      mapPreset: biome.mapPreset,
      key: `${biome.id}/${v.id}`,
    }))
    : (preset ? backdropsForPreset(preset) : []);
  const pool = auswahl.length > 0 ? auswahl : ALL_BACKDROPS;
  const index = Math.abs(Math.floor(Number(seed) || 0)) % pool.length;
  return pool[index];
}

/**
 * Bodenfarben je Kulisse: [Oberfläche, Tiefe].
 *
 * Warum je Kulisse und nicht einmal global: Das Gelände wird prozedural
 * gezeichnet und war bisher immer grün. Über einer Eiskulisse ergab das grünes
 * Gras auf Packeis, über einer Lavaröhre grünes Gras auf Basalt. Der Boden
 * gehört zur Szene — eine einzige Farbe kann nicht zu sechzig Kulissen passen.
 *
 * Die Werte sind auf die jeweilige Kulisse abgestimmt: Eis und Schnee hell, Lava
 * und Basalt dunkel, Wüste sandig, Noir entsättigt.
 */
export const TERRAIN_PALETTES = Object.freeze({
  // Maritim
  'maritime/calm_day': { surface: [110, 140, 120], deep: [45, 62, 60] },
  'maritime/storm_night': { surface: [70, 85, 95], deep: [28, 38, 48] },
  'maritime/arctic_ice': { surface: [226, 238, 246], deep: [148, 176, 196] },
  'maritime/war_harbor': { surface: [95, 98, 100], deep: [42, 46, 50] },
  'maritime/asian_karst': { surface: [128, 150, 110], deep: [52, 72, 58] },

  // Sintflut — Schlamm statt Gras: Die Bodenfarbe muss zum Hochwasser passen,
  // sonst stünde grünes Gras in der Flut.
  /*
   * Die Bodenfarben sind an einer SICHTprüfung im laufenden Spiel nachgezogen.
   * Der erste Anlauf war zu bunt: Über der Flut wirkte der Boden wie ein
   * Platzhalter. Gemessen am Bild: „Reisterrassen" hatte ein fast grelles Grün
   * über schlammigem Wasser, „Monsun" ein zu helles Sandbraun, und „Ertränkter
   * Wald" war zu blass für den warmen Sonnenuntergang.
   *
   * Alle fünf liegen jetzt nahe beieinander: gedämpft, schlammig, dunkel. Das
   * ist für eine Überschwemmung richtig — Schlamm ist nicht farbig.
   */
  'deluge/rooftops': { surface: [96, 104, 92], deep: [42, 50, 46] },
  'deluge/monsoon': { surface: [106, 92, 68], deep: [50, 42, 30] },
  'deluge/drowned_forest': { surface: [100, 88, 70], deep: [48, 42, 34] },
  'deluge/rice_terraces': { surface: [88, 94, 72], deep: [42, 48, 36] },
  // Beim Dammbruch war der Kontrast zwischen Boden und rotem Wasser zu gering —
  // gemessen in der Sichtprüfung. Der Boden ist dort etwas heller, weil die
  // Szene ohnehin dunkel ist und die Oberfläche erkennbar bleiben muss.
  'deluge/dam_break': { surface: [116, 112, 106], deep: [52, 50, 48] },

  /*
   * Weite — die Form ist flach, der Boden soll es auch sein: helle, trockene
   * Töne ohne grelle Sättigung. Ausnahme ist die Salzpfanne: Sie ist eine
   * Weißfläche, dort wäre ein dunkler Boden falsch.
   */
  'open/wheat_plains': { surface: [150, 128, 76], deep: [76, 64, 40] },
  'open/heath_moor': { surface: [112, 96, 106], deep: [56, 48, 54] },
  'open/salt_flats': { surface: [210, 206, 196], deep: [138, 136, 130] },
  'open/polder': { surface: [94, 122, 78], deep: [48, 62, 40] },
  'open/prairie_storm': { surface: [114, 116, 68], deep: [58, 58, 36] },

  /*
   * Felsen — Gestein, nicht Erde: Die fünf Szenen reichen von Kalkweiß über
   * Basaltschwarz bis Eisblau. Jeder Boden nimmt die Farbe SEINES Bildes auf;
   * ein einziger Grauton für alle fünf wäre über den Dolomiten falsch und über
   * den Basaltsäulen auch.
   */
  'spires/karst_peaks': { surface: [98, 112, 94], deep: [46, 54, 48] },
  'spires/dolomites': { surface: [166, 158, 146], deep: [84, 80, 74] },
  'spires/basalt_columns': { surface: [74, 76, 80], deep: [34, 36, 38] },
  'spires/desert_hoodoos': { surface: [152, 106, 74], deep: [78, 54, 38] },
  'spires/ice_spires': { surface: [200, 220, 234], deep: [122, 144, 164] },

  /*
   * Gewirr — enge Orte, gedämpftes Licht.
   *
   * Die Sichtprüfung im laufenden Spiel zeigte hier ein Problem, das bei den
   * offenen Formen nicht auftrat: Die Szenen sind DETAILREICH, und ein zu heller
   * Boden stach vor ihnen hervor statt davor zu liegen („Schlucht" und
   * „Bambusdickicht" wurden als unpassend benannt, „Bambus" am stärksten).
   *
   * Beide sind deshalb dunkler und in der Farbfamilie IHRES Bildes:
   * rostbraun über rotem Canyon, erdig-braun über grünem Bambus. Bewusst NICHT
   * grün für den Bambus — ein grüner Boden würde mit den Halmen verschmelzen und
   * die Oberfläche wäre nicht mehr zu erkennen. Die Erkennbarkeit ist wichtiger
   * als die Farbnähe: Der Boden muss vor dem unruhigen Hintergrund ablesbar sein.
   */
  'warren/slot_canyon': { surface: [104, 68, 46], deep: [52, 34, 24] },
  'warren/ruin_labyrinth': { surface: [104, 88, 78], deep: [50, 42, 36] },
  'warren/cave_network': { surface: [84, 96, 94], deep: [38, 46, 44] },
  'warren/bamboo_thicket': { surface: [88, 76, 54], deep: [42, 36, 26] },
  'warren/trench_lines': { surface: [96, 88, 70], deep: [46, 42, 32] },

  // Inseln
  'island/caribbean_day': { surface: [232, 214, 168], deep: [150, 130, 96] },
  'island/sunset_golden': { surface: [214, 180, 140], deep: [120, 92, 80] },
  'island/volcano': { surface: [68, 58, 56], deep: [28, 22, 24] },
  'island/typhoon': { surface: [96, 110, 96], deep: [40, 50, 46] },
  'island/polynesian_night': { surface: [120, 110, 90], deep: [46, 42, 40] },

  // Gebirge
  'alpine/summer_meadow': { surface: [110, 148, 96], deep: [44, 62, 44] },
  'alpine/winter_snow': { surface: [230, 240, 248], deep: [158, 180, 200] },
  'alpine/himalaya_monastery': { surface: [176, 164, 142], deep: [96, 88, 80] },
  'alpine/war_ruins': { surface: [126, 120, 110], deep: [56, 52, 48] },
  'alpine/moonlit_peaks': { surface: [150, 158, 175], deep: [60, 68, 86] },

  // Wald
  'forest/summer_meadow': { surface: [104, 146, 86], deep: [42, 60, 40] },
  'forest/autumn_forest': { surface: [168, 132, 72], deep: [72, 54, 36] },
  'forest/winter_forest': { surface: [222, 232, 240], deep: [146, 168, 186] },
  'forest/fog_night': { surface: [86, 92, 96], deep: [36, 40, 46] },
  'forest/fantasy_glade': { surface: [88, 140, 116], deep: [30, 52, 58] },

  // Stadt
  'urban/modern_day': { surface: [120, 124, 128], deep: [54, 58, 62] },
  'urban/neon_night': { surface: [70, 62, 96], deep: [26, 22, 42] },
  'urban/industrial_ruins': { surface: [128, 112, 92], deep: [56, 48, 40] },
  'urban/war_torn': { surface: [110, 104, 98], deep: [46, 42, 40] },
  'urban/indian_monsoon': { surface: [136, 118, 92], deep: [56, 50, 44] },

  // Universum
  'cosmos/nebula': { surface: [96, 78, 124], deep: [32, 24, 52] },
  'cosmos/ringed_planet': { surface: [150, 132, 104], deep: [62, 54, 48] },
  'cosmos/space_station': { surface: [128, 132, 140], deep: [52, 56, 66] },
  'cosmos/black_hole': { surface: [72, 64, 72], deep: [24, 20, 26] },
  'cosmos/alien_world': { surface: [150, 96, 80], deep: [62, 38, 34] },

  // Abstrakt
  'abstract/geometric': { surface: [200, 196, 188], deep: [96, 92, 88] },
  'abstract/psychedelic': { surface: [160, 72, 140], deep: [52, 24, 60] },
  'abstract/vaporwave': { surface: [120, 96, 150], deep: [42, 32, 64] },
  'abstract/fractal': { surface: [148, 112, 84], deep: [52, 40, 44] },
  'abstract/surreal': { surface: [140, 136, 128], deep: [62, 60, 58] },

  // Höhlen
  'caverns/limestone': { surface: [138, 124, 102], deep: [58, 52, 46] },
  'caverns/crystal': { surface: [126, 152, 168], deep: [44, 62, 80] },
  'caverns/lava_tube': { surface: [60, 50, 48], deep: [24, 20, 20] },
  'caverns/ice_cave': { surface: [176, 206, 220], deep: [96, 134, 160] },
  'caverns/underwater': { surface: [110, 146, 152], deep: [42, 66, 76] },

  // Fantasy
  'fantasy/elven_city': { surface: [104, 142, 104], deep: [40, 58, 48] },
  'fantasy/dragon_peak': { surface: [120, 116, 124], deep: [48, 46, 54] },
  'fantasy/castle_siege': { surface: [116, 110, 104], deep: [50, 46, 44] },
  'fantasy/dark_swamp': { surface: [78, 84, 66], deep: [32, 36, 30] },
  'fantasy/crystal_magic': { surface: [124, 120, 164], deep: [48, 44, 78] },

  // Hyperrealismus
  'hyperreal/golden_valley': { surface: [126, 140, 98], deep: [52, 60, 44] },
  'hyperreal/desert_caravan': { surface: [216, 190, 144], deep: [140, 116, 80] },
  'hyperreal/polar_station': { surface: [226, 236, 244], deep: [152, 176, 198] },
  'hyperreal/jungle_river': { surface: [88, 124, 72], deep: [34, 50, 32] },
  'hyperreal/coastal_cliffs': { surface: [128, 124, 112], deep: [54, 52, 48] },

  // Western
  'western/desert_town': { surface: [200, 170, 124], deep: [124, 100, 68] },
  'western/sunset_duel': { surface: [190, 152, 116], deep: [96, 72, 56] },
  'western/campfire_night': { surface: [112, 104, 84], deep: [42, 38, 32] },
  'western/winter_frontier': { surface: [214, 224, 232], deep: [142, 160, 176] },
  'western/native_prairie': { surface: [156, 148, 96], deep: [66, 62, 44] },

  // Noir
  'noir/rainy_street': { surface: [74, 76, 80], deep: [30, 32, 36] },
  'noir/harbor_docks': { surface: [68, 70, 74], deep: [26, 28, 32] },
  'noir/smoky_bar': { surface: [80, 78, 76], deep: [32, 30, 30] },
  'noir/wet_road_chase': { surface: [70, 72, 78], deep: [28, 30, 34] },
  'noir/rooftop_silhouette': { surface: [72, 74, 80], deep: [28, 30, 36] },
});

/** Bodenfarben, wenn keine Kulisse gesetzt ist (der bisherige grüne Boden). */
export const DEFAULT_TERRAIN_PALETTE = Object.freeze({
  surface: [96, 138, 92],
  deep: [38, 54, 46],
});

/**
 * Bodenfarben einer Kulisse.
 * @returns {{surface:number[], depth?:number[], deep:number[]}}
 */
export function paletteFor(backdrop) {
  if (!backdrop?.key) return DEFAULT_TERRAIN_PALETTE;
  return TERRAIN_PALETTES[backdrop.key] ?? DEFAULT_TERRAIN_PALETTE;
}

/**
 * Leitbiom je Geländeform.
 *
 * Mehrere Biome teilen sich eine Geländeform (hills gilt für Wald, Stadt,
 * Western und Noir). Ohne Leitbiom würde die Standardkulisse zufällig aus allen
 * gewählt — eine Noir-Stadt über grünen Hügeln, wie es tatsächlich vorkam.
 *
 * Die Wahl des Spielers bleibt davon unberührt: alle sechzig Kulissen sind
 * erreichbar, nur die VORGABE ist eindeutig.
 */
export const PRIMARY_BIOME_BY_PRESET = Object.freeze({
  islands: 'maritime',
  mountains: 'alpine',
  hills: 'forest',
  caverns: 'caverns',
  // Die später hinzugekommenen Geländeformen. Jede hat jetzt ein EIGENES
  // Leitbiom mit eigenen Bildern — die Projektregel gilt damit für alle acht.
  flooded: 'deluge',
  open: 'open',
  spires: 'spires',
  warren: 'warren',
});

export default BACKDROP_BIOMES;
