# Auftrag PORTAL-1: Seltene Kartenportale mit Gegenstück-Pflicht

Stand 2026-11-24. Quelle: Auftraggeber 2026-11-12 (in Git, `3038981`): Portale/Beamer **zufällig und sehr selten** in der Karte;
Ziel ist ein **taktisch günstiger Ort oder ein Ort mit Munition/Kiste**; nutzbar **nur mit Gegenstück**: entweder eine Waffe
(Teleportplattform oder Portalkanone), mit der man sich oder einen anderen zum Portal beamt, oder zwei Waffen bzw. zwei Spieler, die
beide Enden nutzen; ohne Gegenstück passiert nichts. Offen in `docs/TODO.md` 2.10.

## 1. Was es heute gibt

- In der Waffenfassung 22 haben vier Waffen eine Beamwirkung (`engine/specials.js`, `EFFECT_KIND.MOVE`, Selbstwirkung beim Abfeuern):
  Portal (`pa_076`, `portal`), Hologrammportal (`pa_128`, `hologram_portal`), Dimensionssprung (`pa_087`) und Dimensionsriss (`pa_088`,
  beide `teleport`). Sie verschieben die eigene Figur um `distance`. Die **Teleportplattform** (`pa_127`) ist seit einer früheren
  Waffenfassung ein Direkttreffer (`direct_hit`) und beamt nicht mehr. Ein Portal in der Welt gibt es nicht.

## 2. Entscheidungen (Agent nach „Spaß und Flow“, Auftrag des Auftraggebers)

| Frage | Entscheidung | Grund |
|---|---|---|
| Wie selten? | In **20 %** der Partien genau **ein** Kartenportal, nie mehr | „sehr selten“: kein Bestandteil jeder Partie, aber in einer Sitzung von fünf Partien meist einmal zu sehen |
| Wo? | Auf einem begehbaren, trockenen Stand der Hauptlandmasse; bevorzugt **erhöht** (oberes Viertel der Standhöhen; „an einer Kiste“ folgt in Stufe 2); mindestens 300 px von jedem Startplatz | „taktisch günstig oder Munitionsort“; kein Portal neben einer Figur, das ihr den Vorteil schenkt |
| Zufall | Eigener Seed-Zweig `PORTAL` (Match-RNG), einmal beim Kartenaufbau gezogen | Determinismus (AGENTS.md §2); keine Verschiebung anderer Zufallsströme |
| Gegenstück (Stufe 1) | Die vier Beamwaffen (Portal, Hologrammportal, Dimensionssprung, Dimensionsriss) beamen die **eigene** Figur zum Portal | „mit der man sich … zum vorhandenen Portal beamt“; die Wirkung sitzt beim Abfeuern auf dem Schützen |
| Ohne Portal | Die Beamwaffen wirken wie bisher (Verschieben um `distance`) | Waffen bleiben in Partien ohne Portal nützlich |
| Ohne Gegenstück | Wer über das Portal läuft, wird **nicht** gebeamt; das Portal schimmert nur | „ohne Gegenstück passiert nichts“ |
| Stufe 2 (offen) | „einen anderen“ beamen (Treffer einer Portalwaffe versetzt die getroffene Figur) und zwei Enden (zwei Spieler oder Waffen öffnen je ein Ende) | Braucht Trefferlogik im Einschlag und ein zweites Weltobjekt; **erst nach Rückmeldung des Auftraggebers** zu Stufe 1 |
| Zugkosten | Der Einsatz ist ein normaler Schuss: Munition, Rückzugsfrist, Zugende wie sonst | Keine Sonderregel im Zugablauf |
| Haltbarkeit | Das Portal bleibt die ganze Partie; Explosionen zerstören es nicht | Ein Kartenziel, das verschwindet, lohnt das Hinlaufen nicht |
| Versionsmarke | **Bodenobjektfassung 8** (`config.bodenobjekte`): Portal und neue Waffenwirkung; Fassung 7 und älter bitgleich | Ein Weltobjekt wie Minen und Fässer |
| Anzeige | Ring in Violett mit Leuchten (Client), Ereignis `portal_sprung` mit Start und Ziel (zwei Blitze, Protokollzeile), Hinweiszeile zu Partiebeginn „Portal: Auf der Karte liegt ein Portal …“; eigener Klang in Stufe 2 | Lesbarkeit; Sichtabnahme in `docs/TODO.md` Abschnitt 8 |

## 3. Abnahme

1. Versionsmarke: Fassung 7 und älter ohne Portal und mit alter Waffenwirkung (Goldwerte unverändert).
2. Häufigkeit über 1000 Seeds (gebaute Karte): 20 % ± 4 Punkte; nie mehr als ein Portal.
3. Ort: trocken, Hauptlandmasse, ≥ 300 px von jedem Startplatz, deterministisch (gleicher Seed, gleicher Ort).
4. Beamwaffe mit Portal: eigene Figur steht danach auf dem Portal, Ereignis `portal_sprung`; ohne Portal (oder Fassung 7): alte Wirkung.
5. (Stufe 2) Treffer versetzt eine andere Figur.
6. Über das Portal laufen: keine Wirkung.
7. Replay: Aufzeichnung mit Portalsprung spielt bitgleich nach.
8. Client: Ereignis im Katalog und behandelt (`event-coverage`), Ring und Hinweiszeile; ob der Ring gut aussieht, ist Sichtabnahme (TODO Abschnitt 8).
