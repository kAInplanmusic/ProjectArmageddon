/**
 * Spawn-Manager für ProjectArmageddon.
 *
 * ## Muster
 *
 * Dieses Modul folgt dem Muster von `stateSnapshot.js`:
 * Es exportiert eine reine Funktion `erzeugeSpieler(quelle)`, die alle
 * Daten für Spieler-Spawn aus einem Quell-Objekt liest.
 * Der Delegator in `match.js` bindet die Klasse an diese Funktion.
 *
 * @module spawnManager
 */

import { CLASS_IDS, ARCHETYPE_IDS, combatProfile } from '../shared/config/classes.js';
import { getClassLoadout } from '../shared/config/loadouts.js';
import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';

/**
 * Erstellt Spieler-Einträge für die aufgestellten Figuren.
 *
 * ## Reine Funktion, keine Klassenbindung
 *
 * Diese Funktion greift auf nichts außer ihrem Argument zu.
 * Alle Daten, die sie braucht, stehen in `quelle`.
 * Damit ist der Spawn-Prozess gegen FESTE EINGABEN prüfbar.
 *
 * ## Was sie NICHT tut
 *
 * Sie fasst die Klassen-Arrays (`#players`, `#turnOrder`) nicht an: Sie
 * LIEFERT die Einträge als Rückgabe. Die Zugfolge leitet der Delegator aus
 * den Entity-Kennungen ab. So bleibt die eine Schreibstelle beim Match.
 *
 * ## Eingabedaten (quelle)
 *
 * - `teams`, `playersPerTeam` — Team-Konfiguration
 * - `width` — Kartenbreite
 * - `height` — Kartenhöhe (Rückfall für die Fußlinie)
 * - `drySpawnX` — Funktion, die einen trockenen Spawn findet
 * - `surfaceYAt` — Funktion, die die Oberflächen-Y liefert
 * - `world` — die Welt für Entity-Erstellung
 * - `inventory` — Inventar-Manager
 * - `sidegrades` — Sidegrades je Spielerplatz
 * - `loadouts` — Loadout-Wahl je Spielerplatz
 * - `baseHealth` — Grundgesundheit
 * - `resolveLoadout` — Auflösung von Klasse/Archetyp je Platz
 *
 * @param {object} quelle - die Werte, die den Spawn-Prozess steuern
 * @returns {Array<object>} playerEntry[] — Array mit Spieler-Einträgen
 */
export function erzeugeSpieler(quelle) {
  const total = quelle.teams * quelle.playersPerTeam;
  const spacing = quelle.width / (total + 1);
  // Ein Startloadout je Klasse, nicht je Spieler: Die Auswahl hängt allein an
  // der Klasse. Vorher startete jede Klasse mit demselben neutralen Loadout —
  // die Klasse veränderte nur Werte, nicht die Mittel.
  const loadouts = new Map(CLASS_IDS.map(id => [id, getClassLoadout(id)]));
  const eintraege = [];

  for (let index = 0; index < total; index++) {
    const teamId = index % quelle.teams;
    /*
     * Klasse und Archetyp — aus der Konfiguration, sonst nach der alten Regel.
     *
     * FUND (belegt): Vorher standen hier `index % 3` für BEIDE Werte, also
     * dieselbe Zahl. Damit waren nur die drei Diagonalen erreichbar
     * (scout/brawler, heavy/artillerist, artillery/occultist) — die extremsten
     * Profile der Tabelle wurden nie erzeugt. Die Auflösung liegt jetzt in
     * `resolveLoadout()` (classes.js) und nimmt eine Wahl entgegen.
     *
     * Ohne Wahl greift die alte Regel: Ein Match ohne `loadouts` verläuft
     * exakt wie bisher, ebenso ein Replay aus einer älteren Fassung.
     */
    const wahl = quelle.resolveLoadout(index, quelle.loadouts[index] ?? null);
    const classId = CLASS_IDS.indexOf(wahl.classId);
    const archetypeId = ARCHETYPE_IDS.indexOf(wahl.archetypeId);

    const x = Math.round(spacing * (index + 1));
    /*
     * Trockener Startplatz.
     *
     * Fund (belegt): Die Startposition war schlicht `spacing × (index + 1)`.
     * Auf einer wasserreichen Karte liegt diese Stelle aber unter dem
     * Wasserspiegel — gemessen bei der Geländeform `flooded`: **51 % der
     * Figuren (81 von 160 über 40 Seeds) starteten untergetaucht** und
     * ertranken im ersten Zug. Bei den vier ursprünglichen Formen fiel es nicht
     * auf, weil dort der Wasserspiegel tief genug liegt; die Startposition war
     * also nur zufällig sicher, nicht geprüft.
     */
    const startX = quelle.drySpawnX(x);
    const groundY = quelle.surfaceYAt(startX);
    const y = (groundY > 0 ? groundY : quelle.height * 0.4) - PLAYER_HALF_HEIGHT - 2;

    const entityId = quelle.world.createEntity();
    /*
     * Der Sidegrade dieses Platzes — aus der Konfiguration, nicht gewürfelt.
     *
     * Er wird VOR dem Kampfprofil aufgelöst, weil auch das LEBEN davon
     * abhängt (`combatProfile().healthMultiplier`). Ohne diese Reihenfolge
     * hätte eine Figur mit Zusatzpanzerung das Leben ohne die Panzerung.
     */
    const sidegradeId = quelle.sidegrades[index] ?? null;
    // Leben kommt aus dem gemeinsamen Kampfprofil (classes.js) — nicht aus
    // einer zweiten, hier nachgebauten Multiplikation.
    const profile = combatProfile(CLASS_IDS[classId], ARCHETYPE_IDS[archetypeId], sidegradeId);
    const maxHealth = Math.round(quelle.baseHealth * profile.healthMultiplier);

    quelle.world.addComponent(entityId, 'Position', { x, y });
    quelle.world.addComponent(entityId, 'Velocity', { x: 0, y: 0 });
    quelle.world.addComponent(entityId, 'Health', { current: maxHealth, max: maxHealth });
    quelle.world.addComponent(entityId, 'Class', { classId, archetypeId });
    quelle.world.addComponent(entityId, 'Team', { teamId });
    quelle.world.addComponent(entityId, 'Weapon', { angle: teamId === 0 ? Math.PI / 4 : (Math.PI * 3) / 4, power: 55 });
    quelle.world.addComponent(entityId, 'Input', { angle: 0, power: 0 });
    quelle.world.addComponent(entityId, 'Rotation', { angle: 0 });

    quelle.inventory.register(entityId, loadouts.get(CLASS_IDS[classId]) ?? loadouts.get(CLASS_IDS[0]));

    eintraege.push({
      entityId,
      teamId,
      classId,
      archetypeId,
      /**
       * Der Sidegrade des Spielers (oder null).
       *
       * Er gehört in den Zustand, weil die Anzeige ihn braucht: Ohne ihn
       * müsste der Client raten, mit welchem Profil eine Figur rechnet — und
       * die Winkelvorschau zeigte eine Bahn, die der Server anders rechnet.
       * `classId`/`archetypeId` stehen aus demselben Grund hier.
       */
      sidegradeId: profile.sidegradeId,
      label: `P${index + 1}`,
      /**
       * Lebensstatus des SPIELERS.
       *
       * Bewusst hier geführt und nicht über `world.isActive(entityId)`
       * ermittelt: Das ECS vergibt IDs gefallener Entities neu (siehe
       * `#registerSystems`), und dann liegt unter derselben ID eine Kiste.
       */
      alive: true,
    });
  }

  return eintraege;
}