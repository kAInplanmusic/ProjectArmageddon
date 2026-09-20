/**
 * Die Diagnose-Schnittstelle `window.__PA__`.
 *
 * AUSGEZOGEN aus `src/client/main.js` (Zerlegung 2026-09-20, Schritt 1). Dort war
 * sie eine 166-zeilige private Methode der Spielklasse — reine Verdrahtung, aber
 * mitten in einer 3.698-Zeilen-Datei.
 *
 * Die Schnittstelle ist kein Beiwerk: **Jede** E2E-Spezifikation dieses Projekts
 * liest den Spielzustand über sie (`window.__PA__.getState()`,
 * `setAutoLoop()`, `startMatch()` …). Sie ist damit der Vertrag zwischen Tests
 * und Spiel — und genau deshalb steht sie jetzt in einer eigenen Datei mit einem
 * eigenen Namen.
 *
 * Die Klasse bleibt die Fassade: `#exposeDebugApi() { exposeDebugApi(this); }`.
 */
import { MAP_WIDTH, MAP_HEIGHT, WATER_SCALE } from '../engine/match.js';
import { FIXED_TIMESTEP } from '../shared/zeit.js';
import { WEAPONS, getWeapon } from '../shared/config/weapons.js';
import { buildEffect } from '../engine/specials.js';
import { GUENTHER_WHEEL } from '../shared/config/guenther.js';
import {
  kennzahlen as erfolgsKennzahlen,
  uebersicht as erfolgsUebersicht,
} from '../shared/achievements.js';

/**
 * Hängt `window.__PA__` an das Spiel.
 * @param {object} game - die laufende Spielinstanz (in der Klasse `this`)
 */
export function exposeDebugApi(game) {
    window.__PA__ = {
      game,
      getMode: () => game.mode,
      /**
       * Rechenweg des Bodens (Diagnose und Tests).
       *
       * Meldet, WELCHER Weg zuletzt benutzt wurde und WARUM. Ohne diese
       * Auskunft wäre „WebGPU ist an" eine Behauptung — der Rückfall auf die
       * CPU sieht im Bild identisch aus.
       */
      terrainPath: () => ({
        device: Boolean(game.renderer.gpuDevice),
        path: game.renderer.gpuTerrainPath,
        reason: game.renderer.gpuTerrainReason,
        attempted: game.renderer.gpuAttempted,
      }),
      /** Fordert WebGPU an (wie die Menüwahl „automatisch"). */
      enableGpu: () => game.renderer.enableGpu(),
      /** Laufende Schussvorhersage (Diagnose und Tests). */
      prediction: () => ({
        active: game.shotPredictor.active,
        stats: game.shotPredictor.stats,
        pending: game.shotPredictor.pending
          ? {
            playerId: game.shotPredictor.pending.playerId,
            weaponId: game.shotPredictor.pending.weaponId,
            points: game.shotPredictor.pending.trajectory?.points?.length ?? 0,
            impact: game.shotPredictor.pending.trajectory?.impact ?? null,
          }
          : null,
      }),
      /** Replay: Zustand der Wiedergabe (oder null). */
      replay: () => (game.replayPlayer ? {
        tick: game.replayPlayer.tick,
        totalTicks: game.replayPlayer.totalTicks,
        progress: game.replayPlayer.progress,
        playing: game.replayPlaying,
        speed: game.replaySpeed,
        finished: game.replayPlayer.finished,
        appliedInputs: game.replayPlayer.appliedInputs,
        rejected: game.replayPlayer.rejected.length,
      } : null),
      /** Replay: eine Aufzeichnung als Objekt laden (für Tests). */
      loadReplay: dokument => game.loadReplayDocument(dokument),
      /** Replay: steuern — 'play' | 'pause' | 'toggle' | 'restart' | 'step'. */
      replayAction: (aktion, wert) => game.replayAction(aktion, wert),
      /** Replay: an eine Stelle springen (Tick). */
      replaySeek: tick => game.replaySeek(tick),
      /** Spielerprofil (Kennzahlen über alle Partien). */
      profil: () => game.profil.toJSON(),
      /** Kennzahlen der laufenden Partie (oder null). */
      matchKennzahlen: () => (game.stats
        ? game.stats.zusammenfassung(game.eigeneSpielerIds)
        : null),
      /**
       * Profil zurücksetzen (für Tests und den Menü-Knopf).
       *
       * Gibt schlichtes JSON zurück, nicht das PlayerProfile: Darin sind
       * `erfolge` und `waffen` Mengen bzw. Karten, und die kommen über die
       * Serialisierung nach außen als `{}` an — ein Test läse `undefined`.
       */
      profilZuruecksetzen: () => {
        game.profilZuruecksetzen();
        return game.profil.toJSON();
      },
      /** Erfolgsübersicht mit Fortschritt und Hinweisen. */
      erfolge: () => {
        const partei = game.stats ? game.stats.zusammenfassung(game.eigeneSpielerIds) : null;
        return erfolgsUebersicht(
          erfolgsKennzahlen(partei, game.profil.toJSON()),
          game.profil.erfolge,
        );
      },
      getMatch: () => game.match,
      getNetwork: () => game.network,
      getState: () => game.currentState(),
      startMatch: options => game.startMatch(options),
      startOnline: options => game.startOnline(options),
      refreshLobbies: () => game.refreshLobbies(),
      /** Waffe wählen wie über die Liste (Index im Inventar). */
      selectWeapon: index => game.selectWeapon(index),
      /** Waffe abwerfen (Position wie in der Liste). */
      dropWeapon: index => game.dropWeapon(index),
      /** Günther-Zustand (aktiv, Position, Haufen, Plan). */
      guenther: () => game.match?.getState()?.guenther ?? null,
      /** Alle Rad-Ausgänge (für Tests und Anzeige). */
      guentherWheelOutcomes: () => GUENTHER_WHEEL.map(o => ({ id: o.id, label: o.label, detail: o.detail })),
      /** Zeigt das Glücksrad mit einem vorgegebenen Ausgang (für Tests). */
      showGuentherWheel: payload => game.showGuentherWheel(payload),
      /**
       * Aktuelle Darstellungsgrundlage.
       *
       * Es gibt zwei Wege, und sie schließen einander aus:
       *  - `bild`: eine gewählte Bildkulisse (`backdropKey`), oder
       *  - `szene`: die GENERATIVE Kulisse (`scenery`), die Vorgabe.
       *
       * Beide zusammen abzufragen ist nötig, weil `backdropKey` bei der
       * generativen Kulisse absichtlich `null` bleibt — wer nur ihn prüft, hält
       * ein korrekt gezeichnetes Spiel für eine leere Darstellung. (Genau das
       * ist beim Schreiben des Geländeform-Tests passiert.)
       */
      backdrop: () => ({
        key: game.renderer.backdropKey,
        file: game.renderer.backdrop?.file ?? null,
        preset: game.renderer.backdrop?.mapPreset ?? null,
        palette: game.renderer.palette,
        /** Generative Szene: Biomgruppe, Himmel, Wasser, Ambiente. */
        szene: game.renderer.scenery ? {
          biom: game.renderer.scenery.biomeId ?? null,
          // `sky` und `water` sind Objekte mit eigener Kennung.
          himmel: game.renderer.scenery.sky?.id ?? null,
          wasser: game.renderer.scenery.water?.id ?? null,
        } : null,
      }),
      /** Kulissenauswahl im Menü befüllen (für Tests). */
      fillBackdropOptions: () => game.fillBackdropOptions(),
      /** Springen (seitlich: -1, 0, 1). */
      jump: seitlich => game.jump(seitlich ?? 0),
      /** Steht die Figur am Zug auf festem Grund? */
      isGrounded: () => game.match ? game.match.isGrounded(game.match.activePlayerId) : false,
      /** Verbleibende Sprünge des Spielers am Zug. */
      jumpsLeft: () => game.match ? game.match.jumpsLeft(game.match.activePlayerId) : 0,
      /**
       * Waffenkatalog und Wirkungen für Tests und Automatisierung.
       * Ohne diese Zugänge müssten E2E-Tests Module dynamisch nachladen, was im
       * Browser an der Pfadauflösung scheitert.
       */
      weapons: () => WEAPONS,
      getWeapon: id => getWeapon(id),
      buildEffect: id => buildEffect(getWeapon(id)),
      findWeaponByEffect: kind => WEAPONS.find(weapon => buildEffect(weapon)?.kind === kind) ?? null,
      fire: (angle, power) => {
        if (angle !== undefined) game.aim = { angle, power: power ?? game.aim.power };
        return game.fire();
      },
      aimPreview: (angle, power) => game.match?.aimPreview(game.match.activePlayerId, angle, power) ?? [],
      setAutoLoop: flag => {
        game.autoLoop = Boolean(flag);
        return game.autoLoop;
      },
      stateHash: () => game.match?.stateHash() ?? null,
      activePlayerId: () => game.currentState()?.activePlayerId ?? null,
      players: () => game.match?.players ?? [],
      advance: ticks => {
        if (game.mode !== 'local' || !game.match) return game.currentState();
        for (let i = 0; i < ticks; i++) {
          game.step();
          if (game.match.status !== 'playing') break;
        }
        return game.match.getState();
      },
      events: () => game.lastEvents,
      /** Wasserstand an einer Weltposition (0..1) — für Tests und Diagnose. */
      waterLevelAt: (x, y) => game.match?.waterLevelAt(x, y) ?? 0,
      /** Wasserstand setzen (Weltposition); true, wenn die Zelle auf der Karte lag. */
      setWaterLevelAt: (x, y, level) => game.match?.setWaterLevelAt(x, y, level) ?? false,
      /** Wasserstand des Spielers am Zug. */
      activeWaterLevel: () => {
        const state = game.currentState();
        const aktiv = state?.entities?.find(entity => entity.entityId === state.activePlayerId);
        return aktiv?.waterLevel ?? 0;
      },
      constants: { MAP_WIDTH, MAP_HEIGHT, WATER_SCALE, FIXED_TIMESTEP },
    };
}
