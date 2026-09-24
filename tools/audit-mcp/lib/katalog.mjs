/**
 * Der Wissensstand der Skills als Prüfkatalog.
 *
 * Dies ist der Teil des MCP, der „aus allen Skills" gebaut ist: Jede Frage
 * stammt aus einem belegten Befund eines Skill-Regelwerks und nennt ihre
 * Quelle. Der Katalog erfindet nichts — er sammelt, was schon einmal
 * schiefgegangen ist, und macht es abfragbar.
 *
 * Quellen (Skills, die in dieses MCP eingeflossen sind):
 *   code-grounded-ux-audit            Erlebnis-Audits, Messaufbau, Blind-Test
 *   e2e-suite-deep-analysis           Test-Suiten, Playwright, Mutationsprobe
 *   projectarmageddon-verification    dieses Repo: Gates, Fallen, Fundstellen
 *   webapp-security-config-audit      Server-Autorität, Secrets, Grenzen
 *   webapp-architecture-audit         eine Regel eine Stelle, Schichten
 *   deterministic-sim-engine-dev      Determinismus, Seed, PRNG
 *   browser-game-audio-and-feel       Sound, Juice, Assets
 *   procedural-terrain-generation     Karten, Biome, Generator-Autonomie
 *   dogfood                           exploratives QA (Bugs finden, Belege)
 *   systematic-debugging              Ursache vor Fix
 */
export const KATALOG = [
  // ── Messen ────────────────────────────────────────────────────────────────
  {
    id: 'mess-01',
    thema: 'messen',
    frage: 'Tut der Aufbau wirklich das, was gemessen werden soll?',
    methode: 'Wirkungsprobe einbauen: Zähle die Aktionen mit (Sprünge, Schüsse, Treffer) und brich ab, wenn sie 0 ist. Nicht „läuft durch" prüfen, sondern „hat sich etwas bewegt".',
    beleg: 'Zähler + Abbruchcode im Werkzeug',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'mess-02',
    thema: 'messen',
    frage: 'Wird der Ist-Wert importiert oder abgeschrieben?',
    methode: 'Die zu messende Größe aus dem Code exportieren und importieren (z. B. `import { PICKUP_RADIUS as HEUTE }`). Ein abgeschriebener Wert misst nach jeder Änderung die falsche Grundlage.',
    beleg: 'Import im Werkzeugkopf',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'mess-03',
    thema: 'messen',
    frage: 'Ist ein Wert über ALLE Varianten identisch?',
    methode: 'Dann ist es ein Aufbaumerkmal, kein Produktergebnis. Vor dem Befund die Variante prüfen, die sich ändern MÜSSTE.',
    beleg: 'Tabelle über die Varianten',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'mess-04',
    thema: 'messen',
    frage: 'Wird eine Hochrechnung als Messung ausgegeben?',
    methode: 'Lineare Fortschreibung ausdrücklich als Modell benennen und die Zielgröße selbst messen (wer 40 will, misst nicht 4).',
    beleg: 'Abschnitt „MODELL (nachmessbar)" im Werkzeugkopf',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'mess-05',
    thema: 'messen',
    frage: 'Vergleicht der Aufbau wirklich dieselbe Größe, wenn zwei Messungen sich widersprechen?',
    methode: 'Bei Widerspruch ist der AUFBAU schuld. Beide Aufbauten prüfen, nicht den zweiten Wert für die neue Wahrheit halten.',
    beleg: 'zwei Aufbauten dokumentiert',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'mess-06',
    thema: 'messen',
    frage: 'Wird Simulationszeit mit Erlebniszeit verwechselt?',
    methode: '`step()`/`advance()` sind Simulationsschritte; Anzeigen aktualisieren sich nur im Animationsbild. Für HUD-Verhalten dorthin.',
    beleg: 'Messung im Animationspfad',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'mess-07',
    thema: 'messen',
    frage: 'Wird eine Zahl nur aus Werten gebildet, die im SELBEN Rückruf gelesen wurden?',
    methode: 'Tick/fps nie aus getrennten Zeitpunkten ableiten — sonst wird der Hänger der Seite zum Messfehler.',
    beleg: 'ein Rückruf, ein Auslesevorgang',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'mess-08',
    thema: 'messen',
    frage: 'Lässt der Aufbau die ZEIT überhaupt vergehen?',
    methode: 'Bei rundenbasierten Spielen ist `endTurn()` nach N Schritten der klassische Fehler: Zugzeit ist nie vergangen. Den Zug erst abgeben, wenn `turnElapsedMs >= turnDurationMs`.',
    beleg: 'Zugdauer im Aufbau nachprüfen',
    quelle: 'code-grounded-ux-audit',
  },

  // ── Determinismus ────────────────────────────────────────────────────────
  {
    id: 'det-01',
    thema: 'determinismus',
    frage: 'Gibt derselbe Seed denselben Zustandshash — und ein anderer Seed einen anderen?',
    methode: 'Zweimal denselben Seed über echte Züge MIT Schüssen spielen, Hashes vergleichen; danach zwei verschiedene Seeds. Nicht über einen Kurzlauf.',
    beleg: 'Hashes je Seed',
    quelle: 'deterministic-sim-engine-dev',
  },
  {
    id: 'det-02',
    thema: 'determinismus',
    frage: 'Steht `Math.random()` oder `Date.now()` im Pfad, der den Spielzustand bestimmt?',
    methode: 'Vollsuche über den Simulationsordner; jeden Treffer einzeln einordnen (Seed-Erzeugung und Anzeige sind legitim, alles andere ist ein Risiko). Nicht nur zählen — lesen.',
    beleg: 'file:line je Treffer mit Einordnung',
    quelle: 'deterministic-sim-engine-dev',
  },
  {
    id: 'det-03',
    thema: 'determinismus',
    frage: 'Deckt der Zustandshash den GANZEN Zustand ab?',
    methode: 'Ausrüstung, Munition, Abklingzeiten, Zustände, Geschütze, Mahlstrom, Kisten, Sieger, Zugzeit. Gegenprobe: zwei Zustände bauen, die sich nur im Prüffeld unterscheiden — der Hash MUSS sich ändern.',
    beleg: 'Gegenprobe mit zwei unterschiedlichen Zuständen',
    quelle: 'deterministic-sim-engine-dev',
  },
  {
    id: 'det-04',
    thema: 'determinismus',
    frage: 'Ist die Reihenfolge in Sorts bei Gleichstand festgelegt?',
    methode: 'Jeder Sort über Katalogdaten braucht einen expliziten Tiebreak (Katalogindex). Sonst hängt das Ergebnis an der Einfügereihenfolge.',
    beleg: 'Tiebreak im Sort sichtbar',
    quelle: 'deterministic-sim-engine-dev',
  },

  // ── Code und Struktur ────────────────────────────────────────────────────
  {
    id: 'code-01',
    thema: 'code',
    frage: 'Gibt es eine zweite, ungenutzte Umsetzung derselben Regel?',
    methode: 'Jede Datei unter dem Engine-Ordner muss von irgendwem geladen werden. Eine Datei ohne Importeur fällt sofort auf — und ist gefährlich, auch wenn sie nie läuft.',
    beleg: 'Datei + Zählung der Importeure',
    quelle: 'webapp-architecture-audit',
  },
  {
    id: 'code-02',
    thema: 'code',
    frage: 'Wird jede definierte Konstante auch gelesen?',
    methode: 'Für jeden Bezeichner außerhalb der Definitionsdatei suchen — inklusive `scripts/` und `tests/`, denn der Generator ist Teil des Produktivpfads. Ein `grep` nur über `src/` erzeugt fast nur Fehlalarme.',
    beleg: 'Lesestelle je Konstante',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'code-03',
    thema: 'code',
    frage: 'Gibt es Marker (TODO/FIXME/XXX/HACK) im Produktivpfad?',
    methode: 'Zählen und lesen. Null Treffer ist ein Qualitätsmerkmal — es heißt, die Schulden stehen in der SSOT und nicht im Code.',
    beleg: 'Trefferliste oder „0 Treffer"',
    quelle: 'webapp-architecture-audit',
  },
  {
    id: 'code-04',
    thema: 'code',
    frage: 'Sind generierte Dateien als generiert erkennbar, und kennt man ihren Generator?',
    methode: 'Kopfkommentar prüfen, Generator finden, Idempotenz nachweisen (Neubau ohne Quelländerung ergibt leeren Diff). Handänderungen an generierten Dateien sind nach dem nächsten Testlauf weg.',
    beleg: 'Generator + leerer Diff',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'code-05',
    thema: 'code',
    frage: 'Stehen Regeln an ZWEI Stellen?',
    methode: 'Vor dem Ändern einer Balance-Regel den Feldnamen über das ganze Repo suchen. Belegtes Beispiel: Klasse/Archetyp standen in der Config UND inline im Match.',
    beleg: 'beide Fundstellen',
    quelle: 'webapp-architecture-audit',
  },
  {
    id: 'code-06',
    thema: 'code',
    frage: 'Werden stille Ausnahmen zu stillen Fehlern?',
    methode: 'Leere `catch`-Blöcke prüfen: Fängt jeder gezielt ab, oder verschluckt einer einen echten Fehler? Bei Filtern fragen: Wer fällt durch, und merkt das jemand?',
    beleg: 'file:line je Block + Begründung',
    quelle: 'webapp-architecture-audit',
  },

  // ── Server und Sicherheit ────────────────────────────────────────────────
  {
    id: 'sec-01',
    thema: 'sicherheit',
    frage: 'Nimmt der Server die Spielerkennung aus dem TOKEN oder aus der Nachricht?',
    methode: 'Die Stelle lesen, die die Identität setzt. Kernregel: Token → Sitzungsplatz → Entität. Immer gegen einen ECHTEN Server prüfen, nie gegen eine Attrappe.',
    beleg: 'file:line + Test gegen echten Server',
    quelle: 'webapp-security-config-audit',
  },
  {
    id: 'sec-02',
    thema: 'sicherheit',
    frage: 'Wird ein Drahtwert auf `typeof number` geprüft — oder nur durch `Number()` geschickt?',
    methode: '`Number(null) === 0`, `Number(true) === 1`, `Number([]) === 0`. `Number()` ist keine Typprüfung; eine kaputte Nachricht wird sonst zu einem gültigen Befehl.',
    beleg: 'file:line der Prüfung',
    quelle: 'webapp-security-config-audit',
  },
  {
    id: 'sec-03',
    thema: 'sicherheit',
    frage: 'Gibt es Grenzen, die nie geprüft werden?',
    methode: 'Jede definierte Grenze (maxPayloadBytes, maxPlayers, maximale Länge) gegen ihre Lesestelle prüfen. Eine Absicht ohne Wirkung ist eine Grenze ohne Grenze.',
    beleg: 'Lesestelle je Grenze',
    quelle: 'webapp-security-config-audit',
  },
  {
    id: 'sec-04',
    thema: 'sicherheit',
    frage: 'Liegt ein Secret in einer getrackten Datei?',
    methode: 'Scan über `git ls-files` mit Schlüsselmustern. Die lokale `.env` ist gitignoriert und der vorgesehene Ort — sie ist kein Befund. Werte nie im Klartext melden, nur Fingerabdruck.',
    beleg: 'Datei + Zeile + Muster (ohne Wert)',
    quelle: 'webapp-security-config-audit',
  },
  {
    id: 'sec-05',
    thema: 'sicherheit',
    frage: 'Darf `src/shared` Node-Builtins laden?',
    methode: 'Darf es nicht (Browser-Build). Ebenso: `src/client` darf nichts aus `src/server` importieren. Ein Test hält die Grenze fest — bei neuen Dateien prüfen, ob er greift.',
    beleg: 'Grenzen-Test grün',
    quelle: 'webapp-architecture-audit',
  },
  {
    id: 'sec-06',
    thema: 'sicherheit',
    frage: 'Gibt es eine zweite Sicherheitsregel, die nur an EINER von zwei Stellen gesetzt wird?',
    methode: 'Online-Fehler sitzen oft an zwei Stellen (Client füllt nicht + Draht überträgt nicht). Beim Prüfen von Online-Anzeigen immer beide Seiten ansehen.',
    beleg: 'beide Seiten geprüft',
    quelle: 'webapp-security-config-audit',
  },

  // ── Ereignisse und Anzeige ───────────────────────────────────────────────
  {
    id: 'evt-01',
    thema: 'ereignisse',
    frage: 'Wird jedes von der Engine emittierte Ereignis von einem Client-Zweig behandelt?',
    methode: 'Emittierte Namen gegen behandelte Namen stellen — LOCAL und ONLINE getrennt. Belegtes Beispiel: Der Einschlag war nur im Online-Zweig behandelt.',
    beleg: 'Abdeckungstabelle stumm/gedeckt',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'evt-02',
    thema: 'ereignisse',
    frage: 'Feuert ein Ereignis je SIMULATIONSSCHRITT statt je Übergang?',
    methode: 'Bis zu 60×/s wäre eine Log-Flut. Protokollmeldungen gehören an den Übergang, nicht ans Ereignis.',
    beleg: 'Zählung je Partie',
    quelle: 'webapp-architecture-audit',
  },
  {
    id: 'evt-03',
    thema: 'ereignisse',
    frage: 'Ist das Ereignisprotokoll geflutet oder unvollständig?',
    methode: 'Zwei Kennzahlen: Logzeilen im Leerlauf (Flut) und Listengröße konstant bei Maximum (Ringpuffer voll = echte Ereignisse fallen raus). Dazu Unique-Texte: fehlen Treffer/Kills?',
    beleg: 'Zählung + sichtbare Endzeilen',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'evt-04',
    thema: 'ereignisse',
    frage: 'Sagt die Anzeige etwas anderes als die Simulation?',
    methode: 'HUD-Wert und Simulationswert nebeneinander lesen, 20–30 Eingaben senden, Delta nach jeder Eingabe. Delta ≠ 0 ist der Befund — und der Gegenbeweis gehört dazu (fliegt das Projektil in die angezeigte Richtung?).',
    beleg: 'Delta-Tabelle über N Eingaben',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'evt-05',
    thema: 'ereignisse',
    frage: 'Wird die Anzeigeordnung aus EINER Quelle gebildet?',
    methode: 'Nummer und Platz einer Liste müssen dieselbe Auffassung haben. Gegenprobe ist der schärfere Test: Wählt Taste N wirklich den Eintrag, der mit N beschriftet ist?',
    beleg: 'Test über die Auswahl, nicht über die Zahl',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'evt-06',
    thema: 'ereignisse',
    frage: 'Wird ein HUD-Knoten in ZWEI Schritten gelesen (E2E)?',
    methode: '`locator().evaluate()` löst suchen und aufrufen getrennt auf; fällt der Neuaufbau dazwischen, liest die Funktion einen abgehängten Knoten. In EINEM `evaluate` lesen und vorher auf den gültigen Zustand warten.',
    beleg: 'ein Schritt, vorher `waitForFunction`',
    quelle: 'projectarmageddon-verification',
  },

  // ── Tests ────────────────────────────────────────────────────────────────
  {
    id: 'test-01',
    thema: 'tests',
    frage: 'Braucht ein grüner Test einen FEHLER, um grün zu sein?',
    methode: 'Mutationsprobe: den Fehler absichtlich einbauen und prüfen, ob der Test fällt. Ein Test, der den Fehler braucht, ist kein Test. Belegtes Beispiel: drei Tests waren nur grün, weil ein Landungsfehler die Figuren im Stehen tötete.',
    beleg: 'Mutationslauf mit erwartetem Fehlschlag',
    quelle: 'e2e-suite-deep-analysis',
  },
  {
    id: 'test-02',
    thema: 'tests',
    frage: 'Prüft ein Test eine Uhrzeit oder einen Zustand?',
    methode: 'Keine Zusicherung der Form „nach X ms steht Y noch". Den Zustand IM Seitenkontext sichern — die Methode anzapfen und den Wert unmittelbar nach dem Aufruf ablegen, im selben `evaluate`.',
    beleg: 'Zustand statt Wartezeit im Test',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'test-03',
    thema: 'tests',
    frage: 'Prüft ein Test die Zahl oder die Richtigkeit der Zahl?',
    methode: 'Ein `toHaveCount(5)` passt auf jede 5. Bei „der Test war grün, warum?" den Test gegen den CODE lesen.',
    beleg: 'Test mit Begründung der Zahl',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'test-04',
    thema: 'tests',
    frage: 'Wird ein hartkopiertes Drahtformat-Literal verwendet?',
    methode: 'Header-Größe und Protokollversion durch die exportierte Konstante bzw. eine Mindestversion ersetzen. Hartkopierte Zahlen brechen bei jeder Erweiterung, ohne etwas auszusagen.',
    beleg: 'Konstante statt Literal im Test',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'test-05',
    thema: 'tests',
    frage: 'Zeigt ein Test nur den lokalen Zweig, während es zwei gibt?',
    methode: 'Online-Fehler sitzen an zwei Stellen. Ein Test auf einer Seite findet es nicht — der Encoder ist für sich „korrekt" und der Client auch.',
    beleg: 'beide Zweige im Test',
    quelle: 'e2e-suite-deep-analysis',
  },
  {
    id: 'test-06',
    thema: 'tests',
    frage: 'Ist ein roter Lauf wirklich eine Regression?',
    methode: 'A/B mit einem Baseline-Arbeitsbaum: `git worktree add /tmp/baseline HEAD`, node_modules verlinken, dieselben Dateien laufen lassen. Die Fehlerlisten programmatisch vergleichen (Mengen der Testnamen), nicht nach Gefühl.',
    beleg: 'identische Fehlermengen ⇒ vorbestehend',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'test-07',
    thema: 'tests',
    frage: 'Läuft der volle E2E-Lauf nach einer Mechanik-Änderung?',
    methode: 'Ein grüner Einzeltest beweist nichts über die Nachbarschaft. Belegtes Beispiel: ein Reihenfolgen-Fehler in den Ablehnungsgründen zeigte sich NUR im Volllauf.',
    beleg: 'vollständiger Lauf, Zahlen genannt',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'test-08',
    thema: 'tests',
    frage: 'Wird während eines E2E-Laufs an Quelldateien geändert?',
    methode: 'Verboten: der Dev-Server lädt neu, Playwright bricht mit „Execution context was destroyed" ab — das sieht nach Produktfehler aus, ist aber eigener Eingriff. Erst Gates, dann editieren.',
    beleg: 'git status während des Laufs unverändert',
    quelle: 'projectarmageddon-verification',
  },

  // ── Spielgefühl und Inhalte ──────────────────────────────────────────────
  {
    id: 'feel-01',
    thema: 'spielgefuehl',
    frage: 'Wie lange dauert eine Partie wirklich, und woran endet sie?',
    methode: 'Über mehrere Seeds headless messen: Runden, Züge, Schüsse, Ticks. Menschenzeit ist eine ANNAHME (Bedenkzeit konservativ ansetzen) und muss als Annahme dabeistehen.',
    beleg: 'Tabelle je Seed + genannte Annahme',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'feel-02',
    thema: 'spielgefuehl',
    frage: 'Ist eine Entscheidung wirksam oder nur sichtbar?',
    methode: 'Für jede „Entscheidung" belegen, ob sie im Rechenweg ankommt (Faktor multipliziert wirklich?) oder nur angezeigt wird. Beides ist legitim — es nicht zu unterscheiden ist der Fehler.',
    beleg: 'Lesestelle des Faktors im Motor',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'feel-03',
    thema: 'spielgefuehl',
    frage: 'Steht die Anzeige der Wirkung an der Stelle, an der entschieden wird?',
    methode: 'Nicht fragen „gibt es eine Anzeige für X?", sondern „zeigt die STELLE DER ENTSCHEIDUNG auch die Folge?". Im Menü standen nackte Kennungen, die Wertetabelle lag nur im Hilfe-Reiter.',
    beleg: 'Optionstext gegen dieselbe Verrechnung geprüft',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'feel-04',
    thema: 'spielgefuehl',
    frage: 'Ist eine Schwelle gegen die Spielwelt gerechnet?',
    methode: 'Ein Aufheberadius von 18 px ist gegen eine 1280 px breite Karte ein Todesurteil für die Mechanik. Solche Zahlen relativ zur Kartengröße ausdrücken.',
    beleg: 'Zahl relativ zur Kartengröße',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'feel-05',
    thema: 'spielgefuehl',
    frage: 'Ist ein Abbruch nur über eine globale Taste möglich?',
    methode: 'Ein Abbruch ohne Rückfrage ist ein Flow-Befund, kein Detail. Prüfmuster: Tastenhandler UND sichtbares Bedienelement mit gleicher Wirkung suchen; der Fix läuft durch DIESELBE Methode.',
    beleg: 'Knopf + Rückfrage + derselbe Pfad',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'feel-06',
    thema: 'spielgefuehl',
    frage: 'Fehlt Sound, Juice oder Rückmeldung?',
    methode: 'Wenn es sich „tot" anfühlt: Hit-Stop 25–30 ms (max 100), Screen-Shake skaliert, Explosionen mit Rauch. Assets müssen lizenzsicher sein (CC0 vs CC-BY vs proprietär).',
    beleg: 'Kanon im Skill browser-game-audio-and-feel',
    quelle: 'browser-game-audio-and-feel',
  },

  // ── Karten und Generator ─────────────────────────────────────────────────
  {
    id: 'map-01',
    thema: 'karte',
    frage: 'Entscheidet der Seed alles — oder gibt es Einstellregler, die der Mensch bedient?',
    methode: 'Prozeduraler Inhalt: keine Auswahlfelder. Auch das Aussehen folgt aus dem Charakter, nicht aus einer Wahl. Der Seed ist die einzige Quelle.',
    beleg: 'kein Auswahlfeld im Menü + Seed-Ableitung im Code',
    quelle: 'procedural-terrain-generation',
  },
  {
    id: 'map-02',
    thema: 'karte',
    frage: 'Nutzt der Generator seinen Spielraum, oder liefert er immer dasselbe?',
    methode: 'Über viele Seeds messen und die STREUUNG angeben (nicht nur den Mittelwert): Ein einzelner Balken im Histogramm hieße, der Generator liefert immer dasselbe.',
    beleg: 'Streuung + Verteilung je Form',
    quelle: 'procedural-terrain-generation',
  },
  {
    id: 'map-03',
    thema: 'karte',
    frage: 'Hält jede Geländeform ihre Zusicherungen (Startbedingungen, Leitbiom)?',
    methode: 'Wer eine Form hinzufügt: prüfen, ob Startbedingungen noch gelten (auf festem Boden, über Wasser, nicht in einer Wand). Belegtes Beispiel: 81 von 480 Figuren starteten untergetaucht.',
    beleg: 'Test je Form + Zahlen',
    quelle: 'procedural-terrain-generation',
  },
  {
    id: 'map-04',
    thema: 'karte',
    frage: 'Ist eine Kennzahl so gebaut, dass sie das misst, was das Spiel erlebt?',
    methode: 'Das erste „offene Sichtlinien"-Maß galt als offen, wenn kein Gelände HÖHER lag als der Schütze — wer auf einem Gipfel stand, konnte überall hinschießen. Startpunkte und tatsächliche Schusslinie nehmen.',
    beleg: 'Kennzahl gegen Spielerlebnis geprüft',
    quelle: 'procedural-terrain-generation',
  },

  // ── Vorgehen und Bericht ─────────────────────────────────────────────────
  {
    id: 'proc-01',
    thema: 'vorgehen',
    frage: 'Existiert der bestellte Bericht auf der Platte?',
    methode: 'Der häufigste Fehler dieser Auftragsklasse: Die Arbeit ist da, das PRODUKT fehlt. Erste Aktion nach dem Auftrag ist das Anlegen der Berichtsdatei; danach alle 5–8 Werkzeugaufrufe per Patch nachtragen.',
    beleg: '`git status --short` zeigt die Datei',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'proc-02',
    thema: 'vorgehen',
    frage: 'Hat jeder Befund eine Fundstelle ODER eine Messung?',
    methode: 'Befund ohne `datei:zeile` und ohne Messzahl ist eine Meinung. Die eigene Annahme ist auch nur eine Annahme — erwartetes Fremdverhalten selbst messen.',
    beleg: 'file:line oder Messzahl je Befund',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'proc-03',
    thema: 'vorgehen',
    frage: 'Wird ein Befund eines Subagenten ungeprüft übernommen?',
    methode: 'Selbstberichte sind keine Beweise. Erlebt: drei von fünf übernommenen Agenten-Befunden waren falsch. Jeden als WIDERLEGUNGSVERSUCH nachprüfen und den Ausgang nennen (bestätigt / teilweise / widerlegt).',
    beleg: 'Ausgang je Fremdbefund',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'proc-04',
    thema: 'vorgehen',
    frage: 'Wird eine Design-Entscheidung eigenmächtig getroffen?',
    methode: 'Aufheberadius, Breakpoint, Matchdauer sehen wie Fehler aus, sind aber Spielgefühl. Richtig: Zahlen erheben, Alternativen gegenüberstellen, Beschluss beim Auftraggeber lassen („Offen — Design-Entscheidung:").',
    beleg: 'Abschnitt „Offen — Design-Entscheidung" im Bericht',
    quelle: 'code-grounded-ux-audit',
  },
  {
    id: 'proc-05',
    thema: 'vorgehen',
    frage: 'Ist der Fehler reproduziert, bevor er gemeldet wird?',
    methode: 'Erst reproduzieren und Zahlen notieren, dann die Ursache im Code zeigen. Bei „nichts passiert jetzt" eine KONTROLLE einbauen (trocken gegen nass), sonst ist der Test auch bei entfernter Funktion grün.',
    beleg: 'Reproduktion + Kontrollfall',
    quelle: 'systematic-debugging',
  },
  {
    id: 'proc-06',
    thema: 'vorgehen',
    frage: 'Wird der Gate-Lauf selbst kaputt gemacht?',
    methode: 'Drei Fallen: (1) Lange Befehlsketten als Skriptdatei ablegen, nicht als `{ …; }`-Block. (2) `pkill -f "vite"` killt sich selbst — Klammer-Trick und Projektpfad. (3) Läufe mit `setsid` abkoppeln.',
    beleg: 'Skriptdatei + Klammer-Muster + setsid',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'proc-07',
    thema: 'vorgehen',
    frage: 'Wird der Server am Ende beendet?',
    methode: 'Ein zurückgelassener Dev-Server lief schon einmal 63 Minuten weiter und störte die nächsten Messungen. Messläufe gehören auf einen Produktionsbau (`npm run build` + Vorschau), nicht auf den HMR-Server.',
    beleg: 'kein Listener mehr auf dem Port',
    quelle: 'code-grounded-ux-audit',
  },
  // ── Werkzeug und Wächter (Befunde vom 2026-09-24) ─────────────────────────
  {
    id: 'werk-01',
    thema: 'werkzeug',
    frage: 'Löst jede Stelle den eigenen Modulpfad mit `fileURLToPath` auf — oder mit `new URL(...).pathname`?',
    methode: 'Über alle Quelltextdateien nach `new URL(...import.meta.url).pathname` suchen und die `fileURLToPath`-Stellen dagegen zählen. `.pathname` ist PROZENT-KODIERT: enthält der Projektpfad ein Leerzeichen, wird daraus `%20`, `fs.existsSync` ist `false` und jeder `spawn` mit diesem `cwd` scheitert mit ENOENT.',
    beleg: '38 Stellen richtig, 1 falsch — die falsche war `scripts/smoke-fast.mjs:31`, also der Wächter des schnellen Zyklus. Er meldete 0 von 4 Schritten; nach dem Fix 4 von 4 in 26,8 s.',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'werk-02',
    thema: 'werkzeug',
    frage: 'Meldet ein Prüfwerkzeug einen FEHLER-Schritt — oder stürzt es ab, wenn der Start fehlschlägt?',
    methode: 'Jeden `spawn` auf einen `error`-Handler prüfen. Ohne ihn wird ENOENT als unbehandeltes Ereignis GEWORFEN und reißt den Lauf mit einem Stacktrace ab. Der Unterschied ist nicht kosmetisch: ein Absturz sieht aus wie ein Werkzeugfehler, ein FEHLER-Schritt ist ein Befund.',
    beleg: '`laufe()` in `scripts/smoke-fast.mjs` hatte keinen Handler; die Ausgabe war ein Stacktrace statt der Zeile „FEHLER".',
    quelle: 'projectarmageddon-verification',
  },
  {
    id: 'werk-03',
    thema: 'werkzeug',
    frage: 'Läuft jedes Gate in der Batterie wirklich — und steht in der Ausgabe eine Zahl, die man gegen die Erwartung stellen kann?',
    methode: 'Ein Gate, das 0 Schritte meldet, ist kein grünes Gate. Prüfe je Werkzeug: Exit-Code, Anzahl gefahrener Schritte, Dauer. Fehlt die Zahl, ist die Ursache zu klären, bevor der Exit-Code gelesen wird.',
    beleg: 'Der Rauchtest lief mit Exit-Code 1, aber ohne einen einzigen Schritt — das fiel nur auf, weil die Ausgabe auf Startfehler geprüft wurde.',
    quelle: 'e2e-suite-deep-analysis',
  },
  {
    id: 'werk-04',
    thema: 'werkzeug',
    frage: 'Ist die Ursache an der Stelle als Kommentar festgehalten — mit dem Umstand, unter dem sie sichtbar wird?',
    methode: 'Nach jedem behobenen Defekt die Ursache dort kommentieren, wo sie saß, samt der Bedingung, die sie auslöst (hier: Sonderzeichen im Pfad). Sonst baut sie jemand zurück und merkt es erst auf einem anderen Rechner.',
    beleg: 'Am Fundort von `smoke-fast.mjs:31` steht jetzt, dass `.pathname` prozent-kodiert und wann das weh tut.',
    quelle: 'systematic-debugging',
  },
];

/** Alle Themen mit Anzahl. */
export function themen() {
  const zaehler = {};
  for (const e of KATALOG) zaehler[e.thema] = (zaehler[e.thema] ?? 0) + 1;
  return zaehler;
}

/** Quellen (Skills), die eingeflossen sind. */
export function quellen() {
  const zaehler = {};
  for (const e of KATALOG) zaehler[e.quelle] = (zaehler[e.quelle] ?? 0) + 1;
  return zaehler;
}

/** Filtert den Katalog. */
export function filtereKatalog({ thema = null, quelle = null, suche = null } = {}) {
  return KATALOG.filter(e =>
    (!thema || e.thema === thema)
    && (!quelle || e.quelle === quelle)
    && (!suche || `${e.frage} ${e.methode} ${e.id}`.toLowerCase().includes(String(suche).toLowerCase())),
  );
}
