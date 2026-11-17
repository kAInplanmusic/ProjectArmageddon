# Abgleich der Waffen-Dubletten (GP-3)

**Datum:** 2026-11-12  
**Fassung:** 22  
**Quelle:** `src/shared/config/weapons.js` (Katalog), `project_armageddon_weapons_v1.json`

---

## 1. Schlussfolgerung: Dubletten

Keine Waffen-Dubletten identisch. Alle 150 Waffen haben unterschiedliche Kombinationen aus Flight, Damage, Knockback, Speed oder anderen Parametern. Die in der TODO-Liste genannten Paare unterscheiden sich deutlich:

| Paar | Unterschied |
|------|-------------|
| **Piratenhaken (pa_004) / Hakenklinge (pa_003)** | Damage: 24 vs 30, Knockback: 40 vs 45, Power: 34,98 vs 42,24 |
| **Mehrzweckmesser (pa_013) / Kampfmesser (pa_017)** | Damage: 28 vs 34, Knockback: 30 vs 30, Speed: 40,8 vs 40,8, aber PowerScore: 38,06 vs 44,66 |
| **Rapier (pa_016) / Taschenmesser (pa_014)** | Damage: 27 vs 35, Knockback: 10 vs 30, Range: 246 bei beiden, aber PowerScore: 31,02 vs 45,76 |
| **Ananasbombe (pa_117) / Splittergranate (pa_046)** | Damage: 48 vs 42, Radius: 45 vs 42, Delivery: hitscan vs projectile, cooldown: 2 bei beiden |
| **Eisschlag (pa_071)** | Keine Dublette, Eiswaffe mit `damageType: "ice"` und `special: "freeze"` |

---

## 2. Eisschlag friert nicht in Schadensfassung 2

**IST-ZUSTAND:** ✅ WIRD EINGEFROREN

Fundstelle:
- `src/shared/config/weapons.js:467`: `"special": "freeze"`, `"damageType": "ice"`
- `src/engine/specials.js:240`: `freeze: { kind: EFFECT_KIND.FREEZE }`
- `src/engine/schadenMali.js:333-335`: Wasser-Eis-Prüfung für Frost-Effekte

Der Eisschlag (pa_071) hat `damageType: "ice"` und `special: "freeze"`, wodurch:
- `schadenMali.js#treffer()` erkannt: `if (art === 'ice') nimm('frost', {});`
- `zielEffekte.js#67-71`: Frost-Effekt wendet `q.statuses.freeze()` an mit 2 Zügen Dauer
- `schadenMali.js#270-276`: Zweiter Treffer oder Nässe -> Betäubung

**Fazit:** Der Eisschlag friert tatsächlich in Schadensfassung 2 ein.

---

## 3. Ananasbombe vs Splittergranate

| Merkmal | Ananasbombe (pa_117) | Splittergranate (pa_046) |
|---------|---------------------|-------------------------|
| Category | utility | heavy_ranged |
| Damage | 48 | 42 |
| Blast Radius | 45 | 42 |
| Knockback | 0 | 30 |
| Projectile Speed | 0 (hitscan) | 70 |
| Fuse Time | 0 (impact) | 3s |
| Delivery | hitscan | projectile |
| Cooldown | 2 | 2 |
| Power Score | 97.27 | 83.97 |
| Rarity | uncommon | common |

**Fundstelle:** Beide haben `special: "fragmentation"`, was im Motor ausschließlich Terrainzerstörung bewirkt (`zerstoerung.js#668`, `zerstoerung.js#676`). Keine Waffe-Dublette, da unterschiedliche Kategorie, Damage, Knockback und Delivery.

---

## 4. Anzeige der Fassung-10-Werte im Waffenmenü

**IST-ZUSTAND:** Nicht implementiert

Die Waffenfassung 10/WAFFEN_F10_WERTE (`src/shared/config/waffen-fassung.js#284-364`) definiert für bestimmte Waffen zusätzliche `wirkung`-Daten (Verstärkung, Heilung, Versetzen, Schilde). Diese Werte werden **nur im Spiel-Motor** verwendet, nicht im UI angezeigt.

Kein Code existiert, der die F10-Werte (`multiplier`, `turns`, `element`, `distance`, `amount`, `reduction`, `pool`) im Waffenmenü ausgibt.

---

## 5. Fassung-22-Zustand (Stand 2026-11-12)

| Waffe | Fassung | Fundstelle |
|-------|---------|------------|
| Waffenfassung 22 | Standard für neue Matches | `waffen-fassung.js#L56` |
| WAFFEN_F22_WERTE | Nicht definiert (höchste Fassung ist F21) | `waffen-fassung.js` |
| FLUGPROFILE_4 | Definiert für einige Waffen | `scripts/build-weapon-catalog.mjs#L307` |
| WAFFEN_NACHSCHUB (F18) | Standard | `waffen-fassung.js#L67` |
| WAFFEN_MINE (F12) | Mine-Logik | `waffen-fassung.js#L151` |

**Fundstelle:** Fassung 22 existiert nicht als separate Schicht. Die aktuelle Standardschicht ist `WAFFEN_FEIN` (4) mit ergänzenden Korrekturen.

---

## 6. Bewertung der "Schwesterwaffen"

Die aufgelisteten Paare sind **keine Dubletten**, sondern bewusst gestaltete Waffen mit unterschiedlichen Rollen:

1. **Hakenklinge (pa_003) / Piratenhaken (pa_004)**
   - Beide haben `special: "hook_pull"` mit `distance` in WAFFEN_F10_WERTE
   - Hakenklinge: distance=60, cooldown=0, Schaden 30, Power 42,24
   - Piratenhaken: distance=150, cooldown=1, Schaden 24, Power 34,98
   - Unterschied: Reichweite des Haken-Skills (60 vs 150 Pixel), notale Balance

2. **Mehrzweckmesser (pa_013) / Taschenmesser (pa_014) / Rapier (pa_016) / Kampfmesser (pa_017)**
   - Mehrzweckmesser: damage=28, knockback=30, speed=40,8, gravity=1.15, bounces=1
   - Taschenmesser: damage=35, knockback=30, speed=45, gravity=1, bounces=1
   - Rapier: damage=27, knockback=10, speed=45, gravity=1, bounces=0
   - Kampfmesser: damage=34, knockback=30, speed=40,8, gravity=1.15, bounces=1
   - Alle haben `special: "direct_hit"` - keine Dubletten

3. **Ananasbombe vs Splittergranate**
   - Beide haben `special: "fragmentation"` für Terrainzerstörung
   - Aber: Category (utility vs heavy_ranged), damage (48 vs 42), delivery (hitscan vs projectile)
   - Keine Dubletten

---

## 7. Quellenverzeichnis

- `src/shared/config/weapons.js` - Katalog aller 150 Waffen
- `src/shared/config/waffen-fassung.js` - Fassungsschichten 1-22
- `scripts/build-weapon-catalog.mjs` - Kataloggenerator
- `src/engine/schadenMali.js` - Schadens- und Malus-Logik
- `src/engine/zerstoerung.js` - Explosion und Splitter
- `src/engine/specials.js` - Spezialeffekte (freeze, pull, etc.)