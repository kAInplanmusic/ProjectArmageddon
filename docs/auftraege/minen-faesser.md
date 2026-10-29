# Auftrag: Minen und Fässer als Bodenobjekte

*Stand: 2026-10-29 · Status: **Entwurf zur Freigabe**, nichts gebaut · Quelle: MASTERDOTO, „Standardmechaniken":
„Minen / Fässer als Bodenobjekte — FEHLT, Aufwand groß (neue Entität, Auslöser, Replay)".*

## 1. Ziel

Zwei Arten fester Objekte auf der Karte, die Taktik jenseits des direkten Schusses geben:

- **Mine:** wird von einer Figur gelegt, bleibt liegen und löst aus, wenn eine Figur in ihre Nähe kommt.
- **Fass:** liegt von Anfang an (oder wird durch Kisten/Ereignisse gesetzt), explodiert bei Treffer und
  löst dabei Nachbarfässer aus (Kettenreaktion).

Beides zerstört Gelände über die vorhandene Krater-Pipeline und wirkt über das vorhandene Schadenssystem.
Neue Regeln, die alte Replays verändern würden, bekommen eine **Versionsmarke** (AGENTS.md §2).

## 2. Ausgangslage (am Code geprüft, nicht angenommen)

| Baustein | Fundstelle | Folge für den Entwurf |
|---|---|---|
| Versionsmarke je Regelwerk | `config/bewegung.js`, `config/zugregeln.js` (`*_ALT`, `normalisiere*`), `replay.js` (Kopf `config`), `match.js:610` (Konstruktor), `persistence.js` | Neue Marke `config.bodenobjekte` (1 = keine, 2 = Minen/Fässer); fehlt sie, bleibt das Altverhalten bit-identisch |
| Platzierte Objekte | `turret.js` (Geschütz: `freierPlatz`, reine Funktionen), `kistenWurf.js`, `systems/lootSystem.js` (Kisten als Entitäten mit Aufheben im Radius) | Vorlage für Aufstellung und Entitätenanlage; Kisten zeigen den Weg Entität → Zustand → Client |
| Wirkung | `zerstoerung.js`, `zieleffekte.js`, `systems/damageSystem.js`, `schadenMali.js` | Explosion = vorhandener Krater plus Flächenschaden; keine zweite Schadenslogik |
| Systemreihenfolge | `engine/init.js` (`SYSTEM_PRIORITIES`), Test `tests/system-priority.test.js` | Neues `BodenobjektSystem` dort eintragen, nur an EINER Stelle |
| Eingaben im Replay | `replay.js`, `recordInput({ kind })` (`move`, `jump`, `skip_turn`, `surrender`, `skip_pause`) | Legen einer Mine = neue Eingabeart `lege_mine` |
| Serverprüfung | `shared/validation.js`, `server/gameServer.js` (`#laufendeSitzung`, Token statt Absender) | Neue Nachricht nur vom aktiven Spieler, Typ und Grenzen geprüft, Sitzung muss laufen |
| Zeilenbudget | `AGENTS.md` §3: `match.js` ≤ 2790 Zeilen (jetzt 2638) | Logik in `systems/bodenobjektSystem.js`; `match.js` bekommt nur Verdrahtung (~10 Zeilen) |
| Katalog | `weapons.js` wird von `scripts/build-weapon-catalog.mjs` erzeugt | Änderungen am Katalog NUR im Generator oder in `project_armageddon_weapons_v1.json` (nicht in `weapons.js`) |
| Namensprüfung | `weapons.js:7412` prüft Waffennamen auf „mine“ | Schritt 0: prüfen, welche Katalogwaffen damit gemeint sind, bevor etwas doppelt gebaut wird |

## 3. Entscheidungen, die vor dem Bauen nötig sind

Empfehlung jeweils zuerst.

1. **Wer legt Minen?** *Als Waffe aus dem Katalog* (passt zu Waffenwahl, Munition, Kisten) — nicht als eigene
   Taste. Wirkung: nutzt `inventory.js` und Waffenmenü ohne neue Bedienung.
2. **Auslöser der Mine:** Nähe einer **fremden oder eigenen** Figur (Radius klein, z. B. 24 px) nach einer
   **Scharfschaltung** von einem Zug (sonst legt der Werfer sich selbst fest). Offen: Friendly Fire an oder aus.
3. **Sichtbarkeit:** Minen für alle sichtbar (Spielgleichheit, keine versteckte Information). Verdeckte Minen
   bräuchten pro Spieler gefilterte Zustände und sind **nicht** Teil dieses Entwurfs.
4. **Fässer:** Zufällig aus dem Seed gesetzt (gehört zum Kartenaufbau) oder nur als Kiste-Variante? Empfehlung:
   aus dem Seed, 0–4 je Karte, nie in Wasser und nie in Spawnnähe (Erreichbarkeitsprüfung bleibt gültig).
5. **Standardfassung:** Neue Partien mit Marke 2, alte Aufzeichnungen unverändert (wie bei `bewegung`).

## 4. Arbeitsschritte

0. **Prüfung:** Welche Katalogwaffen heißen „Mine“? Gibt es schon ein Ereignis `mine_*`? (`grep`, `events.js`,
   `ereigniskatalog.test.js`.) Ergebnis ins Ticket, vor jedem Code.
1. **Konfiguration:** `config/bodenobjekte.js` (Marke, `normalisiereBodenobjekte`, Werte: Radius, Schaden,
   Kettenabstand, Scharfschaltzeit). Reine Daten, kein Zufall, keine Uhr.
2. **Engine:** `systems/bodenobjektSystem.js`: Liste der Objekte im Zustand (`stateSnapshot.js`), Scharfschalten,
   Auslösen, Kettenreaktion in fester Reihenfolge (nach Objekt-ID, damit der Zustandshash stabil bleibt),
   Aufruf von Krater und Schaden über die vorhandenen Funktionen.
3. **Aufzeichnung:** Eingabeart `lege_mine` in `replay.js` und `persistence.js`; Kopfmarke `bodenobjekte`.
4. **Server:** Nachricht, Validierung (aktiver Spieler, Munition, Platz frei, Sitzung läuft), Zähler.
5. **Client:** Sprite/Zeichnung, Warnring bei Scharfschaltung, Explosion über bestehende Effekte, Klang über
   `klangProfile.js`; Eintrag in Hilfe und Ereigniskatalog.
6. **Balance:** Messung mit `scripts/bot-partien.mjs` (Bots legen Minen nicht; Messung über Ketten in
   fest gesetzten Fässern) und `npm run check:*` für Katalog und Wirkungen.

## 5. Technische Einschränkungen

- Kein `Math.random` / `Date.now` in `src/engine` und `src/shared` — Zufall nur aus Seed-Sub-RNGs.
- Alte Replays (ohne Marke) müssen bit-identisch laufen: Goldwert-Test mit einer Altdatei.
- Kein neues Abhängigkeitspaket.
- Server vertraut dem Client nie (AGENTS.md §6).

## 6. Akzeptanzkriterien

- [ ] Replay mit Marke 1 ergibt exakt den bisherigen Zustandshash (Goldwert unverändert).
- [ ] Zwei Läufe mit gleichem Seed und gleicher Eingabefolge ergeben dieselbe Kettenreaktion (Hash gleich).
- [ ] Mine löst aus: im Radius ja, außerhalb nein, vor Scharfschaltung nein.
- [ ] Kettenreaktion von drei Fässern endet (keine Endlosschleife), Reihenfolge fest.
- [ ] Server lehnt `lege_mine` ab: nicht am Zug, ohne Munition, auf belegtem Platz, bei stehender Simulation.
- [ ] `npm test`, `npm run checks`, `eslint .` grün; `match.js` ≤ 2790 Zeilen.
- [ ] E2E: eine Mine legen und auslösen, zwei Clients sehen dasselbe (`online-einschlag`-Muster).
- [ ] Sicht- und Klangprüfung durch den Auftraggeber (nicht automatisierbar).

## 7. Testanforderungen

Unit: Konfiguration, Auslöser, Kette, Hash-Gleichheit, Altmarke. Integration: Server-Nachricht samt Ablehnungen.
E2E: ein Online-Match mit Mine. Manuell: Optik und Klang.

## 8. Erwartete Ergebnisartefakte

`config/bodenobjekte.js`, `systems/bodenobjektSystem.js`, Tests (`bodenobjekte*.test.js`), E2E-Spec, Eintrag in
`README.md`/`MASTERDOTO.md` (Testzahlen, Marke), Abschnitt in `docs/`, Wächter für das Zeilenbudget.

## 9. Risiken

- Zustandshash: Jede neue Liste im Zustand ändert den Hash — nur hinter der Marke.
- Kettenreaktionen können Gelände in einem Takt stark verändern (Bildzeit, Netzlast): Obergrenze je Takt festlegen.
- Erreichbarkeit: Fässer dürfen Spawn und Wege nicht blockieren (`pruefeErreichbarkeit`).
