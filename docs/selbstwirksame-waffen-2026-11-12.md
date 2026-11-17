# Selbstwirksame Waffen (N-18)

**Datum:** 2026-11-12  
**Fassung:** 22  
**Quelle:** `src/shared/config/weapons.js` (Katalog), `src/engine/specials.js` (Effekte)

---

## Definition

Eine Waffe ist **selbstwirksam**, wenn ihr `special` in `SPECIAL_EFFECTS` eine Wirkung auf den **Schützen** (nicht das Ziel) auslöst. Solche Waffen benötigen eine eigene Logik im Motor, da sie über Schaden hinausgehen.

## Kriterium

Aus `src/engine/specials.js`:

```javascript
export const SELF_TARGET_KINDS = Object.freeze(new Set([
  EFFECT_KIND.HEAL,
  EFFECT_KIND.SHIELD,
  EFFECT_KIND.DAMAGE_BOOST,
  EFFECT_KIND.ARMOR,
  EFFECT_KIND.AMMO,
  EFFECT_KIND.MOVE,
  EFFECT_KIND.MOUNT,
  EFFECT_KIND.REVEAL,
  EFFECT_KIND.RANDOM,
  EFFECT_KIND.TURRET,
  EFFECT_KIND.MINE,
]));
```

Dabei gelten folgende `special`-Namen als selbstwirksam:

| Effect Kind | Special-Namen |
|-------------|---------------|
| HEAL | `heal`, `instant_heal`, `guardian`, `blood_ritual` |
| SHIELD | `shield_heal`, `shield_freeze`, `guardian_ultimate` |
| DAMAGE_BOOST | `buff`, `area_buff`, `relic_buff`, `random_buff`, `time_control` |
| ARMOR | `camouflage`, `bunker` |
| AMMO | `ammo_drop`, `supply_drop`, `loop` |
| MOVE | `flight`, `mobility`, `water_mobility`, `grapple`, `teleport`, `portal`, `portal_field`, `hologram_portal`, `teleport_platform`, `dimension_orb`, `dimensionssprung` |
| MINE | `mine` |
| REVEAL | `target_scan`, `random_effect`, `random_spell`, `scroll_spell`, `mutation`, `curse` |
| TURRET | `auto_target`, `summon_warrior` |
| MOUNT | `summon_mount` |

**Ausnahme:** `direct_hit` und andere harmlose Namen (z. B. `rapier`, `taschenmesser`) haben **keine** Wirkung und zählen nicht zu den 150 Waffen.

---

## Liste der 36 selbstwirksamen Waffen

### Heilung (HEAL)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_092 | Heilzauber | 35 | Heilt dem Schützen |
| pa_094 | Heilspritze | 39 | Große Heilung, 2 Züge Pause |
| pa_115 | Wächterstatue | 0 | Heilt bei Schuss aufgestelltem Geschütz |
| pa_032 | Raketenrucksack | 0 | Flippt den Schützen (Flight-Mechanik) |
| pa_112 | Düsenrucksack | 0 | Flippt den Schützen (Flight-Mechanik) |
| pa_114 | Gleitschirm | 0 | Flippt den Schützen (Flight-Mechanik) |

### Schild (SHIELD)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_093 | Funkenschild | 30 | Schild + Schock auf den Treffer |
| pa_101 | Eisschild | 32 | Schild + Frost auf den Treffer |
| pa_148 | Feuerschild | 70 | Schild + Brand auf den Treffer |

### Schaden-Boost (DAMAGE_BOOST)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_084 | Glutelixier | 34 | +1,7x Schaden 2 Züge + Brand |
| pa_085 | Feuermagier | 45 | Zufallswirkung + Feuer |
| pa_089 | Zauberstiefel | 36 | Schaden-Boost |
| pa_095 | Sturmelixier | 34 | Zufallswirkung + Schock |
| pa_096 | Mutationselixier | 29 | Zufallswirkung (Wandel) |
| pa_105 | Frostrolle | 48 | Zufallswirkung (Verteidigung) |
| pa_109 | Giftbaum | 33 | Zufallswirkung (Gift) |
| pa_149 | Goldene Reliktkugel | 78 | Großer Schaden-Boost |

### Armur/Reduzierung (ARMOR)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_074 | Verderbnissiegel | 28 | Verlangsamt Gegner |
| pa_130 | Tarnnetz | 0 | Gibt Rüstung |

### Munition (AMMO)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_119 | Munitionskiste | 0 | +2 Munition |
| pa_122 | Endlosschleife | 0 | Unendliche Munition |
| pa_125 | Nachschubkiste | 0 | +4 Munition, 1 Zug Pause |

### Bewegung (MOVE)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_032 | Raketenrucksack | 0 | Schütze springt 100 px |
| pa_076 | Portalring | 35 | Schütze teleportiert sich |
| pa_079 | Kosmisches Portal | 20 | Schütze teleportiert sich |
| pa_087 | Dimensionssprung | 0 | Schütze springt 45 px |
| pa_088 | Dimensionsriss | 0 | Schütze springt 165 px |
| pa_111 | Enterhaken | 0 | Schütze zieht sich 70 px |
| pa_112 | Düsenrucksack | 0 | Schütze springt 120 px |
| pa_114 | Gleitschirm | 0 | Schütze springt 160 px |
| pa_127 | Teleportplattform | 0 | Schütze teleportiert sich |
| pa_128 | Hologrammportal | 0 | Schütze teleportiert sich |
| pa_131 | Schlauchboot | 0 | Schütze schwimmt (Water Mobility) |

### Reveal/Aufklärung

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_100 | Blitzwürfel | 36 | Zufallswirkung + Schock |
| pa_105 | Frostrolle | 48 | Zufallswirkung (Verteidigung) |

### Geschütz/Turret (TURRET)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_124 | Wachgeschütz | 38 | Setzt Geschütz ab (auto_target) |
| pa_141 | Astralkrieger | 70 | Setzt beschworenes Geschütz |
| pa_148 | Feuerschild | 70 | Schild + Brand |
| pa_115 | Wächterstatue | 0 | Setzt Wächter-Geschütz (guardian) |

### Mine (MINE)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| (siehe waffen-f12.js für Mine-Spezifika) |

### Reittier (MOUNT)

| ID | Name | Damage | Kurzbeschreibung |
|----|------|--------|------------------|
| pa_143 | Astralross | 65 | Schütze wird auf Reittier gesetzt |

---

## Nicht zu listenende "Dubletten" (keine selbstwirksame Wirkung)

Die folgenden Waffen wurden in Anmerkungen als "Duplikate" erwähnt, haben aber **keine selbstwirkende Wirkung**:

| ID | Name | special | Warum kein Dubletten-Problem |
|----|------|---------|-------------------------------|
| pa_003 | Hakenklinge | `hook_pull` | Pull-Wirkung auf **Ziel**, nicht auf Schützen |
| pa_004 | Piratenhaken | `hook_pull` | Pull-Wirkung auf **Ziel**, nicht auf Schützen |
| pa_013 | Mehrzweckmesser | `direct_hit` | Keine Wirkung, nur Schaden |
| pa_014 | Taschenmesser | `direct_hit` | Keine Wirkung, nur Schaden |
| pa_016 | Rapier | `direct_hit` | Keine Wirkung, nur Schaden |
| pa_017 | Kampfmesser | `direct_hit` | Keine Wirkung, nur Schaden |
| pa_117 | Ananasbombe | `fragmentation` | Terrainzerstörung, keine Waffeigentliche Wirkung |
| pa_046 | Splittergranate | `fragmentation` | Terrainzerstörung, keine Waffeigentliche Wirkung |

---

## Quellenverzeichnis

1. `src/shared/config/weapons.js` - Katalog aller 150 Waffen
2. `src/engine/specials.js` - Definition von SPECIAL_EFFECTS und SELF_TARGET_KINDS
3. `src/shared/config/waffen-fassung.js` - Waffenfassungen 1-22
4. `project_armageddon_weapons_v1.json` - Quelldaten des Katalogs
5. `project_armageddon_weapon_readme.txt` - Weapon System Dokumentation

---

## Schlussfolgerung

- **36 Waffen** besitzen selbstwirksame Effekte → korrekt dokumentiert
- Die in TODO erwähnten "Dubletten" (pa_003/004, pa_013/014, pa_016/017) sind **keine Dubletten**: Unterschiedliche Flight-Werte, verschiedene PowerScores, und unterschiedliche Spielstrategien
- Eisschlag (pa_071) hat `damageType: "ice"` und `special: "freeze"` → friert aktiv ein (siehe GP-3-Dokument)