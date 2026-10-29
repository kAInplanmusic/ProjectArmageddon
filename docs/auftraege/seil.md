# Auftrag: Seil (Ninja-Rope)

*Stand: 2026-10-29 · Status: **Entwurf zur Freigabe**, nichts gebaut · Quelle: MASTERDOTO, „Standardmechaniken":
„Seil/Ninja-Rope — FEHLT, Aufwand groß (Pendelphysik, Terrain-Anker)".*

## 1. Ziel

Die aktive Figur kann ein Seil an das Gelände schießen, daran pendeln, es verkürzen/verlängern und loslassen.
Das gibt Beweglichkeit, die Gehen und Springen nicht liefern (Höhen, Lücken, Inseln).

## 2. Ausgangslage (am Code geprüft)

| Baustein | Fundstelle | Folge |
|---|---|---|
| Versionsmarke | `config/bewegung.js` (`BEWEGUNG_ALT`/`BEWEGUNG_GEHEN`), `replay.js`, `match.js:610` | Neue Marke `config.seil` (1 = kein Seil, 2 = Seil) |
| Figurenbewegung | `systems/bewegungSystem.js` (141 Zeilen, Gehen mit Hang- und Stufenregel), `systems/characterSystem.js`, `systems/physicsSystem.js` | Seil als eigener Zustand der Figur; solange es hält, ersetzt es Schwerkraft und Gehen durch Pendelregeln |
| Boden/Anker | `engine/boden.js` (`bodenNaheHoehe`, `isSolid`) | Anker = erster fester Pixel auf dem Strahl; derselbe Festigkeitsbegriff wie Standabfrage |
| Fallschaden | `config/fallschaden.js`, Luftsprünge kosten über Fallschaden (Entscheidung 2026-09-27) | Loslassen im Schwung zählt als Fall; Schwelle bleibt die Bremse |
| Zugregeln | `systems/zugSystem.js`, `config/zugregeln.js` | Seil ist nur im eigenen Zug und zählt zur Zugzeit; Rückzugszeit erlaubt Seil? (Entscheidung) |
| Eingaben, Server | `replay.js` (`kind`), `validation.js`, `gameServer.js` (`#laufendeSitzung`) | Eingabearten `seil_schiessen`, `seil_laenge`, `seil_loesen`; Server prüft aktiven Spieler und Grenzen |
| Gelände ändert sich | `zerstoerung.js`, Krater | Wird der Ankerpixel weggesprengt, reißt das Seil (Regel festlegen, deterministisch) |
| Zeilenbudget | `match.js` ≤ 2790 (jetzt 2638) | Logik in `systems/seilSystem.js` |

## 3. Entscheidungen vor dem Bauen (Empfehlung zuerst)

1. **Modell:** Starres Pendel mit fester Länge zwischen Anker und Figur, Länge über Tasten verstellbar
   (Worms-Stil), Dämpfung klein. Verworfen: Federseil — mehr Parameter, schwerer reproduzierbar.
2. **Ganzzahlig oder Gleitkomma?** Der Motor muss über Maschinen hinweg denselben Hash liefern. Empfehlung:
   dieselbe Zahlenart und Rundung wie `integrateStep` (`shared/ballistics.js`) und `bewegungSystem.js`; keine
   `Math.sin/cos` mit maschinenabhängiger Genauigkeit im Zustandspfad ohne Rundung auf feste Schritte.
3. **Reichweite und Zeit:** Maximale Seillänge (px), Schussfrist, wie oft je Zug. Werte kommen aus einer Messung,
   nicht aus dem Gefühl (siehe Schritt 6).
4. **Fallschaden beim Loslassen:** Bleibt wie heute (Bremse), kein Sonderfall.
5. **Bedienung:** Taste und Touch-Knopf festlegen; bisherige Belegung ist verbindlich (siehe MASTERDOTO,
   „Tastenbelegung"): frei sind nur wenige Tasten — vor dem Bauen mit dem Auftraggeber klären.

## 4. Arbeitsschritte

0. **Machbarkeitsmessung:** Prototyp der Pendelrechnung in einem Skript, 10 000 Takte, Hash zweimal
   vergleichen (Determinismus), Energie driftet nicht auf. Ohne dieses Ergebnis wird nicht weitergebaut.
1. `config/seil.js` (Marke, `normalisiereSeil`, Werte: Länge min/max, Dämpfung, Schussfrist, Zugstärke).
2. `systems/seilSystem.js`: Schuss → Anker suchen; Pendeln; Längenänderung; Loslassen übergibt Geschwindigkeit an die
   Figurenphysik; Seilriss bei Verlust des Ankers oder Treffer (Regel festlegen).
3. Aufzeichnung (`replay.js`, `persistence.js`), Kopfmarke.
4. Server-Nachrichten und Validierung.
5. Client: Seillinie, Anker, Figurenpose (`figurAnimation.js`), Online-Vorhersage (`laufVorhersage.js` kennt
   Gehen; das Seil braucht eine eigene Fortschreibung oder bewusst keine Vorhersage).
6. Balance und Reichweite messen (`scripts/bot-partien.mjs` kann Seil nicht nutzen: Messung im Skript).

## 5. Einschränkungen

Keine Wanduhr/`Math.random` in `engine`/`shared`; Altreplays bit-identisch; keine neue Abhängigkeit;
Server prüft jede Eingabe; Seil darf die Erreichbarkeitsprüfung der Karten nicht entwerten (eher neue Wege:
`pruefeErreichbarkeit` bleibt konservativ).

## 6. Akzeptanzkriterien

- [ ] Altmarke: Goldwert-Hash unverändert.
- [ ] Gleiche Eingaben → gleicher Hash (zweimal, zwei Seeds).
- [ ] Anker liegt auf festem Gelände; kein Anker in Luft und in Wasser.
- [ ] Pendel gewinnt keine Energie (Messung über 10 000 Takte, Drift unter festgelegter Grenze).
- [ ] Wegsprengen des Ankers löst das Seil zum festgelegten Takt.
- [ ] Server lehnt ab: nicht am Zug, Simulation steht, Länge außerhalb der Grenzen.
- [ ] `npm test`, `npm run checks`, `eslint .` grün; `match.js` ≤ 2790 Zeilen.
- [ ] E2E mit zwei Clients; Sichtprüfung der Bewegung durch den Auftraggeber.

## 7. Testanforderungen

Unit (Konfiguration, Anker, Pendel, Hash), Integration (Server, Replay), E2E (zwei Clients), manuell (Gefühl,
Kamera folgt der Figur im Schwung — `kameraRegie.js`).

## 8. Risiken

- Das Gefühl der Steuerung ist nicht automatisch prüfbar; es braucht Spieltests beim Auftraggeber.
- Gleitkomma-Abweichungen zwischen Maschinen ändern den Hash (der Motor ist dafür bisher bewusst gebaut):
  Schritt 0 entscheidet, ob das Seil überhaupt sicher determinierbar ist.
- Kamera und Bildzeit bei schneller Bewegung (Terrain-Streaming, Kulisse).
