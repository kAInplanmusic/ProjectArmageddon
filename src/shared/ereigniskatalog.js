/**
 * Ereigniskatalog: EINE Quelle für alles, was je Ereignisart festgehalten wird.
 *
 * ## Warum es diese Datei gibt
 *
 * Über eine Ereignisart (`landed`, `explosion`, `terrain_slumped` …) wurde an vier Stellen
 * getrennt Buch geführt: die Einteilung in Anzeige und Zustand samt Drossel stand in
 * `shared/protocol.js` (drei Listen), die Begründung „bewusst ohne Zweig" und die Belege für
 * einzweigige Arten standen als zwei Tabellen im Wächtertest `tests/event-coverage.test.js`, und
 * welcher Klang und welche Bildwirkung zu einer Art gehört, stand nur im Rumpf der Wirkung in
 * `client/ereignisse.js`. Wer eine Art änderte, musste vier Stellen kennen.
 *
 * Jetzt steht jede Art genau einmal hier, eine Zeile je Art:
 *
 *   klasse    `anzeige` (nur Blitz, Klang, Protokollzeile) | `zustand` (trägt Spielzustand, wird
 *             nicht gefiltert, außer sie ist gedrosselt)
 *   drossel   `boden` (Bounce-Artefakt stehender Figuren) | `zustand` (Dauermeldung, im Snapshot
 *             redundant); die Begründung und die Messreihen stehen in `shared/protocol.js`
 *   stumm     die Begründung, warum die Art ohne eigene Anzeige bleibt (der Spieler sieht sie über
 *             ein anderes Element); fehlt: sie hat eine Wirkung
 *   einzweig  nur EIN Zweig in `EREIGNIS_WIRKUNGEN` (`zweig`), und `entweder`: wo im anderen
 *             Modus die Wirkung sichtbar wird (je Fundstelle `datei.js:Zeile (bezeichner)`; der Bezeichner MUSS in dieser Zeile stehen, `tests/event-coverage.test.js` schlägt nach — eine Zeilennummer allein veraltet mit jedem Umbau)
 *   klang     die Klangarten (`soundMixer.verarbeite`), die die Wirkung auslösen darf
 *   anim      die Bildwirkungen (Methoden des Renderers), die die Wirkung auslösen darf
 *
 * Abgeleitet wird daraus: `ANZEIGE_EREIGNISARTEN`, `ZUSTANDSEREIGNISARTEN`,
 * `GEDROSSELTE_EREIGNISARTEN` (`shared/protocol.js`). Geprüft wird gegen die Tabelle der Wirkungen
 * (`client/ereignisse.js`) in `tests/ereigniskatalog.test.js` und `tests/event-coverage.test.js`:
 * Die Wirkung führt NUR die hier genannten Klänge und Bildwirkungen aus. Es gibt keine zweite Tabelle.
 *
 * Reine Daten, kein Zufall, keine Uhr (`src/shared` ist determinismusgeschützt). Eine Zeile je Art
 * ist Absicht: das Prüfwerkzeug `tools/audit-mcp` liest die Begründungen zeilenweise aus dieser Datei.
 *
 * @module ereigniskatalog
 */

export const EREIGNIS_KATALOG = Object.freeze({
  landed: { klasse: 'anzeige', drossel: 'boden', klang: ['landed'] },
  jumped: { klasse: 'anzeige' },
  crate_landed: { klasse: 'anzeige', drossel: 'boden', stumm: 'lokaler Zweig hat einen Fall; online übernimmt es die Kistenliste', einzweig: { zweig: 'lokal', entweder: 'online kommen die Kisten aus dem Snapshot und werden gezeichnet: src/client/main.js:2015 (crates) → src/client/renderer.js:2369 (#drawCrates)' } },
  projectile_impact: { klasse: 'anzeige', anim: ['addFlash'] },
  projectile_expired: { klasse: 'anzeige', stumm: 'ein verfallenes Geschoss ist kein Ereignis für den Spieler, es hat nichts getroffen' },
  projectile_pierced: { klasse: 'anzeige', anim: ['addFlash'] },
  explosion: { klasse: 'anzeige', klang: ['explosion'], anim: ['applyCrater', 'addFlash', 'sheetEinschlag', 'merkeEinschlag'] },
  terrain_detached: { klasse: 'anzeige', klang: ['truemmer'], anim: ['starteInsel'] },
  terrain_crumble: { klasse: 'anzeige', anim: ['bruchOptik'] },
  feuer_schritt: { klasse: 'zustand', anim: ['feuerSchritt'] },
  feuer_lava: { klasse: 'zustand', anim: ['feuerLava'] },
  lava_erstarrt: { klasse: 'zustand', klang: ['zischen'], anim: ['lavaErstarrt'] },
  lava_ausbruch: { klasse: 'anzeige', klang: ['lava_grollen'], anim: ['feuerAusbruch', 'addFlash', 'sheetGlut'] },
  flammenwand: { klasse: 'anzeige', klang: ['flammen'], anim: ['feuerAusbruch'] },
  ragnarok_beginnt: { klasse: 'anzeige', anim: ['startRagnarok'] },
  feuer_verbrennt: { klasse: 'anzeige', klang: ['flammen'] },
  feuer_schmilzt: { klasse: 'anzeige', klang: ['zischen'], anim: ['spawnExplosionParticles'] },
  terrain_quake: { klasse: 'anzeige', anim: ['bebenOptik'] },
  terrain_resisted: { klasse: 'anzeige', anim: ['spawnExplosionParticles'] },
  hitscan: { klasse: 'anzeige', klang: ['shot', 'damage'] },
  special_effect: { klasse: 'anzeige', klang: ['schild', 'bereit'], anim: ['addFlash'] },
  fuse_armed: { klasse: 'anzeige', klang: ['ticken'], anim: ['addFlash'] },
  fuse_expired: { klasse: 'anzeige', anim: ['addFlash'] },
  guenther_wheel: { klasse: 'anzeige' },
  guenther_pee: { klasse: 'anzeige' },
  guenther_poop: { klasse: 'anzeige' },
  guenther_poop_hit: { klasse: 'anzeige' },
  guenther_aktion: { klasse: 'anzeige', klang: ['fressen', 'bellen', 'winseln'] },
  guenther_aktion_wirkung: { klasse: 'anzeige', klang: ['kiste', 'bellen', 'schnurren'] },
  cookie_miau: { klasse: 'anzeige', klang: ['miau_leise', 'miau_laut', 'miau_wut'] },
  cookie_gefuettert: { klasse: 'anzeige', klang: ['fressen'] },
  cookie_kuschelt: { klasse: 'anzeige', klang: ['schnurren'] },
  cookie_tobt: { klasse: 'anzeige', klang: ['miau_wut'] },
  cookie_erschoepft: { klasse: 'anzeige' },
  cookie_zerstoert: { klasse: 'anzeige' },
  cookie_schlag: { klasse: 'anzeige' },
  cookie_spielt: { klasse: 'anzeige' },
  cookie_schockwelle: { klasse: 'anzeige', klang: ['schockwelle'] },
  crate_pickup: { klasse: 'zustand', klang: ['kiste'], anim: ['addFlash'] },
  crate_pickup_blocked: { klasse: 'zustand', klang: ['kiste_voll'] },
  damage: { klasse: 'zustand', drossel: 'zustand', stumm: 'Lebensbalken sinkt sichtbar (seit 2026-09-27 gedrosselt: im Snapshot redundant)', anim: ['merkeSchadensart'] },
  death: { klasse: 'zustand', klang: ['tod'] },
  dot_applied: { klasse: 'zustand', stumm: 'Zustandsmarke am Spielernamen' },
  dot_tick: { klasse: 'zustand' },
  malus_abgewehrt: { klasse: 'zustand' },
  malus_angewendet: { klasse: 'zustand' },
  malus_beendet: { klasse: 'zustand' },
  malus_leitung: { klasse: 'zustand' },
  drowning: { klasse: 'zustand', drossel: 'zustand', stumm: 'kein Zweig; gedrosselt, weil der Wert im Snapshot nachgerechnet redundant ist (Messreihen in docs/ereignis-info-gehalt.md)' },
  entity_in_water: { klasse: 'zustand', drossel: 'zustand', stumm: 'Wasserstand steht als Marke am Spielernamen (seit 2026-09-27 gedrosselt: im Snapshot redundant)' },
  fall_damage: { klasse: 'zustand', klang: ['aufprall'] },
  frozen: { klasse: 'zustand', klang: ['einfrieren'] },
  heal: { klasse: 'zustand', klang: ['heilung'] },
  karte_unerreichbar: { klasse: 'zustand' },
  loot_error: { klasse: 'zustand' },
  maelstrom_contract: { klasse: 'zustand', anim: ['applyContraction'] },
  match_over: { klasse: 'zustand' },
  projectile_spawn: { klasse: 'zustand', anim: ['merkeGeschoss'] },
  pulled: { klasse: 'zustand', klang: ['heranziehen'] },
  rueckzug: { klasse: 'zustand', stumm: 'Rückzugsfrist: Zugzeit-Anzeige im HUD, Protokollzeile' },
  aufgegeben: { klasse: 'zustand', stumm: 'Protokollzeile; Sieger-Ermittlung wie bei jedem Tod' },
  round_crates: { klasse: 'zustand', stumm: 'Buchführung; die Anzahl steht im HUD' },
  round_start: { klasse: 'zustand' },
  shield_absorbed: { klasse: 'zustand', klang: ['schild'], anim: ['addFlash'] },
  shot: { klasse: 'zustand', stumm: 'löst die Vorhersage auf (shotPredictor.resolve)', klang: ['shot'], anim: ['addMuzzleFlash', 'merkeSchuss'] },
  terrain_destroyed: { klasse: 'zustand', anim: ['applyCrater'] },
  terrain_settled: { klasse: 'zustand', klang: ['insel_gelandet'], anim: ['landeInsel'] },
  terrain_removed: { klasse: 'zustand', anim: ['entferneZellen'] },
  terrain_added: { klasse: 'zustand', anim: ['setzeSchutt'] },
  terrain_slumped: { klasse: 'zustand', anim: ['setzeRutsch'] },
  toxic_rain: { klasse: 'zustand' },
  turn_end: { klasse: 'zustand', stumm: 'Rundenanzeige im HUD, plus Zugwechsel im Spielerfeld' },
  turn_skipped: { klasse: 'zustand' },
  turn_start: { klasse: 'zustand', stumm: 'Rundenanzeige im HUD' },
  mine_placed: { klasse: 'zustand', anim: ['addFlash'] },
  mine_exploded: { klasse: 'zustand', anim: ['addFlash'] },
  mine_dud: { klasse: 'zustand', anim: ['addFlash'] },
  fass_placed: { klasse: 'zustand', stumm: 'liegende Fässer melden sich nicht im Protokoll; die Liste steht im Zustand' },
  fass_exploded: { klasse: 'zustand', anim: ['addFlash'] },
  turret_deployed: { klasse: 'zustand', anim: ['addFlash'] },
  turret_expired: { klasse: 'zustand' },
  turret_fired: { klasse: 'zustand', klang: ['geschuetz'], anim: ['addFlash'] },
  valhalla_omen: { klasse: 'zustand', klang: ['valhalla_omen'], anim: ['startValhallaOmen'] },
  water_pushed: { klasse: 'zustand', stumm: 'der Wasserstand am Ziel ist die sichtbare Wirkung' },
  weapon_cooldown: { klasse: 'zustand', stumm: 'die Waffenliste zeigt den Nachladezustand' },
  weapon_dropped: { klasse: 'zustand', einzweig: { zweig: 'online', entweder: 'lokal meldet `Main#dropWeapon` das Ergebnis direkt im Log (Name, Munition, Listenaktualisierung) — src/client/main.js:1443 (match.dropWeapon), src/client/main.js:1450 (hud.log) und src/client/main.js:1462 (hud.update) —, es braucht deshalb keinen Tabellenzweig. ONLINE gibt es diesen lokalen Erfolgspfad nicht: der Server führt den Abwurf aus und schickt das Ereignis; ohne den `online:`-Zweig fiele es stumm weg.' } },
});

/** Alle Arten einer Klasse in Katalogreihenfolge. */
function artenDerKlasse(klasse) {
  return Object.freeze(Object.keys(EREIGNIS_KATALOG).filter(art => EREIGNIS_KATALOG[art].klasse === klasse));
}

/** Arten, die NUR die Anzeige bedienen. */
export const KATALOG_ANZEIGE = artenDerKlasse('anzeige');

/** Arten, die Zustand tragen. */
export const KATALOG_ZUSTAND = artenDerKlasse('zustand');

/** Arten mit einer Drossel (`boden` oder `zustand`), in Katalogreihenfolge. */
export const KATALOG_GEDROSSELT = Object.freeze(
  Object.keys(EREIGNIS_KATALOG).filter(art => EREIGNIS_KATALOG[art].drossel !== undefined),
);
