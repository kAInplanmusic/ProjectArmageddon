# MASTERTODO.md

## Prioritätsskala

- **P0** = blocker / fundament
- **P1** = core gameplay
- **P2** = depth / content
- **P3** = polish / scale

## 1. P0 - Projektfundament

1.1 **Repository- und Paketstruktur stabilisieren**  
- Root-Package sauber definieren  
- Client-, Server-, Engine- und Shared-Verantwortlichkeiten trennen  
- Validierungsbefehl für das Skeleton dauerhaft pflegen  

1.2 **Globale Regelquellen zentralisieren**  
- Klassenwerte  
- Matchregeln  
- Loot-Tabellen  
- Netcode-Konfiguration  
- Mahlstrom-Parameter  

1.3 **Technische Nicht-Verhandelbarkeiten absichern**  
- Strikt 2D-Gameplay  
- Authoritative Server  
- ECS mit TypedArrays  
- Canvas-Destruktion plus CollisionMask-Sync  

## 2. P0 - ECS Core

2.1 **Entity-ID-Verwaltung finalisieren**  
- numerische IDs  
- Wiederverwendung und Pool-Kompatibilität  
- Debug-Sichtbarkeit ohne OOP-Entityklassen  

2.2 **Component Storage vervollständigen**  
- BigArray-per-component-type  
- Capacity-Management  
- Aktiv/Inaktiv-Zustände  
- Component-Signatures für Systemabfragen  

2.3 **System Scheduler bauen**  
- Fixed timestep  
- deterministische Update-Reihenfolge  
- klare Trennung von Physics, Combat, Terrain, Loot, Fluids, Match State  

## 3. P0 - Terrain und Kollision

3.1 **Terrain-Import und Maskenaufbau**  
- Startterrain laden  
- Bitmap in CollisionMask überführen  
- Wortbreiten und Randfälle testen  

3.2 **Canvas-Terrainzerstörung produktionsreif machen**  
- Krater ausstanzen  
- Dirty-Regionen tracken  
- Rendering und Physik synchron halten  

3.3 **Kollisionspipeline vervollständigen**  
- AABB broad phase  
- Bitmask narrow phase  
- shift-`>=32`-Edge-Case schützen  
- Tests für Blockgrenzen und dünne Geometrie ergänzen  

## 4. P0 - Projektil- und Ballistiksystem

4.1 **Hitscan- und Projektilpfade trennen**  
- eigener Ausführungspfad  
- eigenes Balancing  
- eigene Telemetrie  

4.2 **Analytische Ballistik einbauen**  
- linearer Drag  
- Gravitation  
- deterministische Vorhersage  
- Server- und KI-Kompatibilität  

4.3 **CCD aktivieren**  
- Raycasts gegen CollisionMask  
- Tunneling verhindern  
- Performance an Maximalgeschwindigkeiten messen  

## 5. P0 - Autoritativer Multiplayer

5.1 **Headless Server-Loop implementieren**  
- ECS-Simulation ohne Rendering  
- Match-State-Verwaltung  
- Input-Queue  

5.2 **Binärprotokoll definieren**  
- Join / Leave  
- Snapshot  
- Delta  
- Input Command  
- Event Broadcast  

5.3 **Desync- und Latency-Schutz**  
- deterministische Seeds  
- 200ms State-History  
- serverseitige Verifikation von Winkel und Kraft  

## 6. P1 - Match Flow und Combat Rules

6.1 **Turn-System implementieren**  
- klassisches Worms-Flow-Modell  
- Timer-Profile je Lobbygröße  
- State-Wechsel zwischen Aim, Fire, Resolve, End Turn  

6.2 **Damage Pipeline umsetzen**  
- flat vor percent  
- Klassenmodifikatoren  
- Loot-Sidegrades  
- Status- und Umwelt-Schaden  

6.3 **Fallschaden und Knockback**  
- Klassenboni anwenden  
- Wasser und Klippen berücksichtigen  
- Hyper-Knockback mit Maelstrom kompatibel machen  

## 7. P1 - Klassen und Drafting

7.1 **Archetypen in Datenmodell überführen**  
- Brawler  
- Artillerist  
- Okkultist  

7.2 **Draft-Flow entwerfen**  
- Teamgröße 4-6  
- Karten- und Rollen-Lesbarkeit  
- Counterdraft-Spannung sicherstellen  

7.3 **Psychologische Klassenfantasien sichtbar machen**  
- UI  
- Audio/VFX  
- Waffenempfehlungen  
- Tooltips und Tutorials  

## 8. P1 - Loot und Sidegrades

8.1 **Drohnen-Drops implementieren**  
- Spawn-Wahrscheinlichkeiten  
- Zustellung und Platzierung  
- Pickup-Events  

8.2 **PRD-Rarity Tree einführen**  
- Anti-Clumping  
- State pro Match  
- Telemetrie zur Verteilungsauswertung  

8.3 **Klassenspezifische Sidegrades bauen**  
- Trade-offs statt Power Creep  
- Kombinationen begrenzen  
- Lesbarkeit der aktiven Modifikatoren verbessern  

## 9. P1 - Mahlstrom

9.1 **Aktivierungslogik bauen**  
- Breakpoint Runde 15  
- toxischer Regen  
- Shrinking Zone  
- Terrain-Kompression  

9.2 **Endgame-Balance abstimmen**  
- HP-basierter Tick-Schaden  
- exponentielle Out-of-Zone-Kurve  
- Knockback-Fokus im Lategame  

9.3 **UX und Telemetrie**  
- Vorwarnung  
- Zonenvisualisierung  
- Audio-Pacing  
- Matchlängen-Metriken  

## 10. P2 - Wasser und Umwelt

10.1 **Cellular-Automata-Wasser vertiefen**  
- Druckmodell  
- seitlicher Ausgleich  
- Interaktion mit Terrainlöchern  

10.2 **Performanceoptimierung**  
- Tilemap-Bake  
- Dirty-Chunk-Updates  
- Grenzwerte für große Karten  

10.3 **Gameplay-Interaktionen**  
- Ertrinken  
- Leitfähigkeit / Spezialwaffen  
- Verdrängung durch Explosionen  

## 11. P2 - Content und Karten

11.1 **Basis-Waffenpool strukturieren**  
- Hitscan  
- Projektil  
- Magie / Spezialwaffen  
- Gamechanger selten halten  

11.2 **Karten-Authoring vorbereiten**  
- offene Karten  
- vertikale Karten  
- Wasserkarten  
- enge Brawler-Karten  

11.3 **Fraktions- und Draft-Inhalte ausbauen**  
- 3x3-Klassensystem zu 9 Fraktions-Ausprägungen erweitern  
- visuelle Identitäten definieren  
- Werte sauber von Fraktionsflair trennen  

## 12. P3 - Tooling, UX und Release-Vorbereitung

12.1 **Debug- und Replay-Tools**  
- Seed-Logging  
- CollisionMask-Visualisierung  
- Turn-by-turn-Replay  

12.2 **Onboarding**  
- Aim-Training  
- Klassenübersicht  
- Loot- und Sidegrade-Erklärung  

12.3 **Release-Härtung**  
- Lasttests  
- Anti-Cheat-Audits  
- Browser-Performance-Profiling  
- Accessibility und Eingabekomfort  
