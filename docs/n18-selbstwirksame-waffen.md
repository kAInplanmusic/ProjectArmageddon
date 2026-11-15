# N-18 – Selbstwirksame Waffen (special/moveset) – Vollständige Dokumentation (Stand 2026-11-12)

## Übersicht

Laut TODO.md: "36 selbstwirksame Waffen (`special`/moveset): dokumentieren, was sie bewirken; 52 Waffen ohne Design-`damage` (Generator-Ersatzwert, Balance automatisch erzeugt); '1 von 150 Waffen wirkt nicht' (Stand skalierung/ki-im-betrieb, Messung 'balance:sweep').

**Analyse-Ergebnis:** 118 eindeutige `special:`-Werte in `weapons.js`, davon:
- **35 echte Selbstwirkungen** (wirken auf den Schützen: Heilung, Schild, Bewegung, Buff, Munition, Turret, Mount)
- **25 Zielwirkungen** (wirken auf Gegner/Umgebung: Pull, Freeze, Damage over Time, Chain, Drill, Water Push)
- **58 reine Etiketten** (nur Bild/Klang, keine eigene Logik in `specials.js` – Schaden/Fläche läuft über Standard-Mechanik)

---

## 35 Selbstwirkungen – Vollständige Liste

### Heilung (HEAL) – 4 Werte
| `special:` | Wirkung | Standard-Heilung |
|------------|---------|------------------|
| `heal` | Heilung | max(35, Schaden × 1.2) |
| `instant_heal` | Sofort-Heilung | max(35, Schaden × 1.2) |
| `guardian` | Wächter-Heilung | max(35, Schaden × 1.2) |
| `blood_ritual` | Blutritual-Heilung | max(35, Schaden × 1.2) |

### Schild / Rüstung (SHIELD/ARMOR) – 4 Werte
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `shield_heal` | Schild + Heilung | Schild max(40, Schaden × 1.1) |
| `shield_freeze` | Schild (Eis) | Schild max(40, Schaden × 1.1) |
| `guardian_ultimate` | Ultimatives Schild | Schild max(40, Schaden × 1.1) |
| `bunker` | Bunker-Rüstung | Rüstung 30% Reduktion |
| `camouflage` | Tarnung-Rüstung | Rüstung 30% Reduktion |

### Schadens-Buff (DAMAGE_BOOST) – 6 Werte
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `buff` | Schadensbuff | ×1.5 für 2 Züge |
| `area_buff` | Flächenbuff | ×1.5 für 2 Züge |
| `relic_buff` | Relikt-Buff | ×1.5 für 2 Züge |
| `random_buff` | Zufälliger Buff | ×1.5 für 2 Züge |
| `time_control` | Zeitkontrolle-Buff | ×1.5 für 2 Züge |

### Bewegung (MOVE) – 10 Werte
| `special:` | Wirkung | Standard-Distanz |
|------------|---------|------------------|
| `flight` | Flug/Sprung | 60 px |
| `teleport` | Teleportation | 60 px |
| `portal` | Portal | 60 px |
| `portal_field` | Portal-Feld | 60 px |
| `mobility` | Mobilität | 60 px |
| `grapple` | Greifhaken-Bewegung | 60 px |
| `dimension_orb` | Dimensions-Orb | 60 px |
| `teleport_platform` | Teleportplattform | 60 px |
| `hologram_portal` | Hologramm-Portal | 60 px |
| `water_mobility` | Wasserbeweglichkeit | 60 px |

### Munition (AMMO) – 3 Werte
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `ammo_drop` | Munitionskiste | +3 Munition |
| `supply_drop` | Nachschubkiste | +3 Munition |
| `loop` | Schleife/Munitions-Loop | +3 Munition |

### Aufklärung (REVEAL) – 1 Wert
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `target_scan` | Zielscan | 2 Züge aufdecken |

### Zufall (RANDOM) – 4 Werte
| `special:` | Wirkung | Pool |
|------------|---------|------|
| `random_spell` | Zufallsspruch | HEAL, SHIELD, DAMAGE_BOOST, ARMOR, AMMO, MOVE |
| `mutation` | Mutation | HEAL, SHIELD, DAMAGE_BOOST, ARMOR, AMMO, MOVE |
| `random_effect` | Zufallseffekt | HEAL, SHIELD, DAMAGE_BOOST, ARMOR, AMMO, MOVE |
| `scroll_spell` | Schriftrolle | HEAL, SHIELD, DAMAGE_BOOST, ARMOR, AMMO, MOVE |

### Turret (TURRET) – 2 Werte
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `auto_target` | Automatisches Geschütz | 3 Runden, 75% Reichweite, 60% Schaden |
| `summon_warrior` | Astralkrieger | 3 Runden, 75% Reichweite, 50% Schaden |

### Mount (MOUNT) – 1 Wert
| `special:` | Wirkung | Standard |
|------------|---------|----------|
| `summon_mount` | Astralross | Sprung 140 px |

---

## 25 Zielwirkungen (nicht selbstwirksam)

| `special:` | Art | Ziel |
|------------|-----|------|
| `hook_pull` | Pull | Gegner heranziehen (90 px) |
| `suction` | Pull | Gegner heranziehen |
| `mind_pull` | Pull | Gegner heranziehen |
| `magnetism` | Pull | Gegner heranziehen |
| `gravity_well` | Pull | Gegner heranziehen |
| `whirlwind` | Pull | Gegner heranziehen |
| `void_knight` | Pull | Gegner heranziehen |
| `freeze` | Freeze | Gegner einfrieren (1+ Züge) |
| `stun` | Freeze | Gegner betäuben |
| `sleep` | Freeze | Gegner schlafen legen |
| `shield_freeze_target` | Freeze | Gegner einfrieren (Schild-basiert) |
| `burn` | DoT (Feuer) | Schaden über Zeit |
| `fire_pool` | DoT (Feuer) | Feuerpool am Boden |
| `lava` | DoT (Feuer) | Lava-Schaden |
| `flame_blade` | DoT (Feuer) | Flammenklinge |
| `acid_dot` | DoT (Gift) | Säure-Schaden über Zeit |
| `poison_cloud` | DoT (Gift) | Giftwolke |
| `poison_zone` | DoT (Gift) | Giftzone |
| `world_poison` | DoT (Gift) | Weltvergiftung |
| `corruption` | DoT (Gift) | Verderbnis |
| `curse` | DoT (Gift) | Fluch |
| `tentacle_zone` | DoT (Gift) | Tentakelzone |
| `void_spell` | DoT (Gift) | Leerenspruch |
| `water_push` | Water Push | Gegner wegstoßen + Wasser anheben |
| `chain_lightning` | Chain | Kettenblitz (Springt) |
| `drill_cannon` | Drill | Bohrkanone (Tunnel graben) |

---

## 58 reine Etiketten (nur Bild/Klang)

Diese `special:`-Werte haben **keinen Eintrag in `SPECIAL_EFFECTS`** – sie sind reine Beschreibungen für Rendering/Audio. Die eigentliche Mechanik (Schaden, Fläche, Knockback) läuft über die Standard-Waffenfelder (`damage`, `blastRadius`, `knockback`, `elemental`, `delivery`, etc.).

```
direct_hit, fragmentation, precision, bat_knockback, heavy_impact,
dig, rapid_melee, multi_hit, energy_blade, plasma_bolt, mega_knockback,
drill, spike_blast, sticky, emp_blast, power_punch, energy_explosion,
rocket, mortar, phoenix_strike, banana_split, returning_projectile,
delayed_bot, spread_shot, arrow, heavy_arrow, minigun, fire_entity,
continuous_stream, catapult, meteor_impact, artillery, plasma, launcher,
fireball, linked_damage, magic_bolt, magic_hand, astral_burst,
mind_aoe, quantum_shot, solar, magic_whip, fire_minion, energy_fist,
rocket_punch, old_lady_strike, guided_sheep, air_strike, meteor_rain,
drill_rocket, magic_hammer, hell_cannon, quantum_blast, cosmic_banana,
earth_splitter, dragon_ultimate, cosmic_ultimate
```

---

## 52 Waffen ohne Design-`damage` (Generator-Ersatzwert)

Diese Waffen haben im Katalog `damage: 0` (oder keinen Eintrag) – der Generator setzt einen Ersatzwert für die Balance-Berechnung. Die echte Wirkung kommt über `special:`/`elemental`/`wirkung`.

**Identifikation:** `grep -n "damage: 0" src/shared/config/weapons.js` + Waffen mit `special:` in Selbstwirkungs-Liste aber ohne `damage`.

---

## "1 von 150 Waffen wirkt nicht" – Balance-Sweep

Messung in `ki-im-betrieb` / `balance:sweep`. Kandidat: Waffe mit `special:` ohne Wirkung UND `damage: 0` UND kein `elemental` UND keine `wirkung` in Fassung 10+.

---

## Nächste Schritte

- [ ] 52 Waffen ohne Design-`damage` identifizieren (Liste erstellen)
- [ ] "Nicht-wirksame Waffe" im Balance-Sweep lokalisieren
- [ ] Dokumentation in `docs/waffen-special-uebersicht.md` für alle 118 Werte pflegen

---

*Erstellt durch automatische Analyse von `src/engine/specials.js` (SPECIAL_EFFECTS, SELF_TARGET_KINDS) und `src/shared/config/weapons.js` (alle 150 Waffen).*