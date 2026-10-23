# WORKER-REPORT — AU-4/5/6 (bg/totcode)

## Erledigt
- AU-4: `scripts/terrain-inventar.mjs` → `fileURLToPath(new URL('..', import.meta.url))` (pfade: 0 falsch).
- AU-5: `replay.js` `Date.now()` = reines Metadatum (`createdAt`, nie im Zustandshash) → in `ZEIT_AUSNAHMEN` begründet (zufall: 0).
- AU-6: `COOKIE_REFERENZ_BREITE` + `BETAEUBUNG` entfernt; Exporte ohne externen Leser ent-exportiert (u. a. tote `ladeWaffenSpritesVor` gelöscht); `streicheKommentare` wertet Strings/Glob-Muster nicht mehr als Kommentar (Konstanten/Exporte: 0).
- MASTERDOTO AU-4/5/6 abgehakt. Commit `04e87e0` (nicht gepusht).

## Offen
- `tests/mengenbegrenzung.test.js` „Nachrichtenflut“ rot in der Vollsuite (Antworten 62 > Stoß 60), isoliert grün (3/3). VORBESTEHEND/flaky: `src/server/*` unverändert, hängt an paralleler Last, nicht an AU-4/5/6. Nicht angefasst (Tests nicht aufweichen).
- AU-1/2/3/7/8/9 (andere Aufträge) offen; `doppelregeln` (28, AU-7) weiterhin gelb.

## Belege
- `npx eslint .` → 0 Fehler.
- `node --test tests/*.test.js` → pass 1856 / fail 1 (s. Offen).
- `npm run -s audit:bericht` → pfade/zufall/unbenutzteKonstanten grün, unbenutzteExporte 0; keine AU-4/5/6-Punkte im Bericht.

## Review

- **Urteil: MERGEN.** AU-4/5/6 korrekt und belegt; `audit:bericht` listet die Punkte nicht mehr (pfade/zufall/unbenutzteKonstanten grün).
- Tests: pass **1856** / fail **1** (`mengenbegrenzung.test.js` „Nachrichtenflut“, flaky/vorbestehend, `src/server/*` unverändert; isoliert grün). ESLint: **0** Fehler.
- Keine Testaufweichung, keine unnötigen Änderungen; `streicheKommentare`-Fix behebt echten Glob-`/*`-Parserfehler (falsche „tote Konstanten“).
- Restpunkte: `getStarterWaffen` bleibt im toten `export default`-Objekt (loadouts.js:381); Branch 1 Commit hinter origin/main (fehlt 4a858aa, sauberer 3-Wege-Merge); AU-1/2/3/7/8/9 offen; perf-Gate gelb (flaky/lastabhängig).
