/**
 * Der Zustandshash eines Matches — als REINE Funktion.
 *
 * AUSGEZOGEN aus `src/engine/match.js` (Zerlegung 2026-09-20, Schritt 2).
 *
 * Der Hash ist die Determinismus-Zusage dieses Projekts: Er fasst den
 * vollständigen Spielzustand zu einer Zeichenkette zusammen, und zwei Läufe mit
 * demselben Seed und denselben Eingaben müssen DENSELBEN Hash ergeben
 * (`npm run replay -- record` + `--verify`, Hash `808ac5eb`).
 *
 * Als Methode zog er seine Daten aus der halben Spielklasse; hier bekommt er den
 * Ansichtszustand als Argument und rechnet. Das macht ihn prüfbar: gleiche
 * Eingabe → gleicher Hash, ohne ein Match aufbauen zu müssen.
 *
 * Bewusst wird `getState()` NICHT mitgezogen: Das ist der `#`-schwere Teil
 * (38 private Zugriffe) und braucht einen eigenen, größeren Schritt.
 */

/**
 * Bildet den Ansichtszustand auf einen Hash ab.
 *
 * Verwendet FNV-1a über eine feste Feldliste, damit die REIHENFOLGE der Felder
 * Teil des Verfahrens ist: Eine Umsortierung, die den Zustand nicht ändert, darf
 * den Hash nicht ändern — eine fehlende Angabe dagegen muss auffallen.
 *
 * @param {object} state - der Rückgabewert von `getState()`
 * @returns {string} Hash als Hex-Zeichenkette
 */
export function hashState(state) {

    /*
     * Die Figuren möglichst vollständig: Ausrüstung und Munition gehören dazu,
     * weil sie das Ergebnis des Matches verändern (eine andere Waffe trifft
     * anders).
     */
    const entities = state.entities.map(e => [
      e.entityId,
      e.alive,
      Math.round(e.x),
      Math.round(e.y),
      Math.round(e.health),
      e.activeWeaponId ?? null,
      // Die Waffenliste als Zeichenkette, damit die Reihenfolge zählt.
      Array.isArray(e.inventory) ? e.inventory.join('|') : (e.inventory ?? null),
      // Munition je Waffe, ebenfalls reihenfolgestabil.
      e.ammo && typeof e.ammo === 'object'
        ? Object.keys(e.ammo).sort().map(k => `${k}:${e.ammo[k]}`).join('|')
        : (e.ammo ?? null),
      // Laufende Abklingzeiten beeinflussen, wann wieder gefeuert werden darf.
      e.cooldowns && typeof e.cooldowns === 'object'
        ? Object.keys(e.cooldowns).sort().map(k => `${k}:${e.cooldowns[k]}`).join('|')
        : (e.cooldowns ?? null),
    ]);

    /*
     * Zustände (Schild, eingefroren, brennend …). Die Schlüssel werden SORTIERT,
     * damit die Hash-Bildung nicht von der Einfügereihenfolge abhängt — eine
     * nicht-deterministische Iteration wäre hier ein Fehler in genau dem
     * Werkzeug, das Determinismus belegen soll.
     */
    const zustaende = state.statuses && typeof state.statuses === 'object'
      ? Object.keys(state.statuses).sort().map(k => [k, JSON.stringify(state.statuses[k])])
      : null;

    const payload = JSON.stringify({
      round: state.round,
      tick: state.tick,
      wind: state.wind,
      activePlayerId: state.activePlayerId,
      winnerTeamId: state.winnerTeamId ?? null,
      turnElapsedMs: Math.round(state.turnElapsedMs ?? 0),
      entities,
      projectiles: state.projectiles.map(p => [p.entityId, Math.round(p.x), Math.round(p.y)]),
      statuses: zustaende,
      turrets: (state.turrets ?? []).map(t => [t.entityId ?? null, Math.round(t.x), Math.round(t.y), t.rounds ?? null]),
      maelstrom: state.maelstrom
        ? [Boolean(state.maelstrom.active), Math.round((state.maelstrom.inset ?? 0) * 1000)]
        : null,
      /*
       * Kisten: ALLE Felder, die den Inhalt beschreiben.
       *
       * FUND (belegt, im Test): Hier stand `c.weaponId` — ein Feld, das es bei
       * Kisten nicht gibt (`{entityId, x, y, crateType, rarity}`). Der Wert war
       * damit immer `null`, und eine Kiste mit anderem Inhalt blieb im Hash
       * unsichtbar. Ein Test hat es aufgedeckt.
       */
      crates: (state.crates ?? []).map(c => [
        c.entityId ?? null,
        Math.round(c.x),
        Math.round(c.y),
        c.crateType ?? null,
        c.rarity ?? null,
        c.weaponId ?? null,
      ]),
    });

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}
