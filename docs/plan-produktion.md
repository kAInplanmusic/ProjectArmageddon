# Plan bis zur Produktionsreife (Stand 2026-11-05)

Auftrag des Auftraggebers (2026-11-05): Alle offenen Punkte bis zur Produktionsreife planen und mit
Subagenten abarbeiten. Entscheidungen, die beim Auftraggeber lagen, trifft der Agent selbst, wenn
sie Sinn ergeben, dem Spiel mehr Spaß und Flow geben und es interessanter machen. Nur was der
Agent auf keinen Fall entscheiden darf oder kann, geht als Frage zurück (Abschnitt 4).
**Es gibt keine Bots** (keine KI-Gegner im Spiel). Die Mess-Skripte `balance:*` simulieren nur
Schüsse und sind Werkzeuge, keine Mitspieler.

Regeln wie immer: `AGENTS.md` (§2 Versionsmarken, §3 Tests nie abschwächen, §5/§7 nichts mieten),
Einzelliste bleibt `docs/TODO-SSOT.md`; dort stehen die Entscheidungen in Abschnitt 0.

## 1. Entscheidungen des Agenten im Auftrag (2026-11-05)

Leitfrage je Punkt: Was macht Partien flüssiger, spannender, verständlicher?

| Punkt | Entscheidung | Warum |
|---|---|---|
| Rangliste / N-24 | Dauerhafte Rangliste mit **Elo-Wertung** (Start 1000), daneben Siege, Partien, Kills, Schaden, Siegquote. Es zählen **alle Online-Partien, in denen mindestens zwei angemeldete Menschen gegeneinander spielen**; lokale Partien am selben Gerät und Gäste zählen nicht (nicht überprüfbar). Gespeichert wird nur, was die Rangliste braucht, unbefristet; jeder kann sein Konto samt Daten löschen. | Elo belohnt Siege gegen Starke und hält die Liste spannend; Abgleich nur dort, wo der Server die Partie selbst gesehen hat. |
| Login | Nur **Name + Passwort**, keine E-Mail. scrypt-Hash, Sitzungstoken, Bremse gegen Durchprobieren, Name eindeutig ohne Groß/Klein. Gäste spielen weiter ohne Konto. Passwort vergessen: Admin-Skript auf dem Server setzt es zurück. | Wunsch des Auftraggebers; ohne E-Mail gibt es keine Selbst-Wiederherstellung. |
| Speicher (PERSIST-1) | Konten und Rangliste in **SQLite** (`node:sqlite`, falls die Node-Version es trägt, sonst JSON mit atomarem Schreiben und Sperre); Lobbys bleiben wie sie sind. Sicherung über `scripts/betrieb/sichern.sh`. | Konten brauchen sichere, gleichzeitige Schreibzugriffe; keine neue Abhängigkeit nötig. |
| RT-1 Fortsetzen | **Bauen**: Sitzplatz-Token überlebt Neuladen, `CONTROL.RESUME` holt den Platz zurück. | Ein versehentliches Neuladen darf keine Partie kosten. |
| Online-Kennzahlen (EREIGNIS-1) | Server zählt Kennzahlen selbst (für Endbildschirm und Rangliste); Asche/Basalt (`karte.ueber`) in den Online-Stand. | Rangliste braucht serverseitige Zahlen; später Beitretende sehen dieselbe Karte. |
| GP-4 Tempo | **Ziel: eine Figur fällt nach 3–4 guten Treffern** (Median Schüsse bis Sieg pro Figur ≈ 3–4 statt 37 gemessen). Umsetzung als neue Waffenfassung 14 über Schaden je Kategorie, Lebenspunkte bleiben; Sweep belegt Vorher/Nachher. | Kürzere, entscheidende Partien = Flow; Worms-Gefühl. |
| GP-1 (1) | `homing`-Gewicht im Seltenheitswert korrigieren (Superschaf/Phönixschlag nicht mehr fälschlich legendär); Marke in Waffenfassung 14. | Seltenheit soll Stärke widerspiegeln. |
| GP-1 (2) | Waffen ohne Schaden nach **Nutzwert** einstufen (Werkzeuge mit großer Wirkung = selten). | Beute bleibt spannend. |
| GP-1 (3) | Zünderwaffen auf Verhältnis ≥ 0,5 heben, gemessen mit Armierung. | Liegenbleibende Bomben sollen sich lohnen. |
| GP-1 (4) | Kategorien nach Wirkung ordnen (utility/tech/elemental). | Waffenmenü verständlicher. |
| GP-1 (5) | Kaktusbombe: Stichschaden mit Gift-Nachwirkung. | Passt zum Bild, eigene Rolle. |
| GP-1 (6) | Handgranate bekommt einen echten Explosionsradius (≈ 40 px). | Eine Granate explodiert. |
| GP-1 (7) | Allsehendes Auge: deckt für 2 Runden Minen, Fässer-Zünder und verborgene Figuren auf und **verlängert die Zielhilfe** im Zug. | Waffe ohne Wirkung ist Frust; Aufklärung gibt Taktik. |
| GP-1 (8) | Klassen- und Archetypnamen deutsch beschriften. | Einheitliche Sprache. |
| GP-2 | Luftangriff und Meteorregen als **Projektile** (sichtbar, ausweichbar), Höllenkanone als Strahl; Spruchrolle als Projektil; Astralkugel/Gedankensturm Abklingzeit 3→2; Portale als **Paar Ein-/Ausgang** unterscheidbar; Giftwolke/Tentakelgift/Flammenwerfer mit Deckel je Zug; Energiefaust/Flammenklinge mit Rückstoß; Bohrkopfrakete gräbt (DRILL); **Handgranate behält 2 Abpraller**; Zünder +15 %; Himmels-/Flankenschlag kein Doppeltreffer auf dasselbe Ziel. | Sichtbare, ausweichbare Angriffe und klare Rollen = interessanter; Deckel verhindern Frust. |
| AERO | **Windfaktor je Waffe bauen** (0–2,5, Wasser 0), Bahnvorschau mit Wind der Waffe, Windanzeige in Segmenten, Wind je Zug zufällig (eigene Marke). Der Punkt „Bots berücksichtigen Wind“ entfällt (keine Bots). | Wind ist die Würze eines Artilleriespiels. |
| ENG-1 | Wurf/Abwurf und Wind bekommen **eigene Zufallsströme** (neue Marke). | Fachlich unabhängig; Wind ändert nicht mehr die Kistenlage. |
| N-21 / GP-5 Scout | Klassenfassung 3: Scout bekommt **schnelleres Gehen, längeres Seil und einen zusätzlichen Luftsprung**; `starkGegen` gesetzt. | Beweglichkeit als echter Vorteil, mehr Seil-Spaß. |
| N-18 / N-17 | Die 52 Waffen ohne Design-Schaden bekommen Werte nach Kategorie-Stufen; selbstwirksame Waffen dokumentiert; Messleiter feiner (12 Distanzen, 8 Winkel). | Grundlage für GP-4. |
| MINEN-1 | Fässer kommen auch aus Kisten; Direkttreffer löst Mine/Fass aus; geworfene Mine fliegt sichtbar; eigenes Minen-Icon und -Bild; Werte nach Messung. | Mehr Chaos-Momente. |
| KAMERA C1–C6 | **Bauen**: Knapp-vorbei-Zoom, Zeitlupe nur bei ≥ 250 Schaden oder ≥ 3 Toten (abschaltbar, reine Darstellung), Wasser-Sturz-Kamera, Kettenzähler, Menüpunkt „Kameraeffekte“ im ⚙-Menü. | Höhepunkte inszenieren. |
| FIGUREN-B | **Bauen**: Zustands-Sheets als Rollen, Kopf/Oberkörper zielen mit, Angst-Reaktion (150 px, 1–1,5 s), Tod-Epilog ≤ 1,2 s überspringbar (Spruch je Fraktion, Detonation, Grabstein nur Optik), Backflip-Drehung. | Figuren wirken lebendig. |
| N-09 / N-10 / N-12 | Geschosszellen je Familie und Schussbewegungen je Familie **prozedural** (kein Bildbudget nötig). Die 26 unbrauchbaren Waffen-Animationen bleiben draußen (nur pa_038/pa_135 prüfen). | Kostenlos, einheitlich, steuerbar. |
| N-02 / N-04 | Für die 4 abweichenden Vorlagen gilt die **Fassung der Seitenansicht** (danach sind die Sheets gebaut). Kaputte Stillbilder: erst aus vorhandenen Sheets ableiten; KI-Bild nur mit Budget (Frage 1). Automatische Grundlinien-/Rollenprüfung bauen. | Bestehende Animationen bleiben stimmig. |
| AUDIO-1 | Stimmung **„intensiv“** schaltet bei Valhalla/Mahlstrom, bei den letzten zwei Figuren oder wenn ein Team ≤ 25 % Leben hat. | Musik folgt der Spannung. |
| Klang (K4/QA-2/AUDIO-2) | Automatische Klangprüfung (Lautheit normalisiert, kein Clipping, keine Stille, Länge), Donner leiser nach Entfernung, Mine/Fass-Klang. Hörabnahme bleibt **Aufgabe des Auftraggebers** (Checkliste wird geliefert). | Maschine prüft Technik, Mensch prüft Gefühl. |
| GELAENDE-1 | Höhlen mit größeren Kammern statt Tunnelgewirr, abwechslungsreichere Inselumrisse, Licht an Fackeln/Lava, Nebelschichten (neue Geländefassung 10, wo die Form sich ändert). Planet-Umlauf und isometrische Biom-Objekte: **nein** (passen nicht zur Seitenansicht / brauchen neue Engine-Regeln). | Lesbare, abwechslungsreiche Karten. |
| N-30 | „567 Varianten“ = kombinatorische Looks Biom × Stoffrolle × Achsen. Variantensystem je Stoff (Textur-Alternativen, Farbverschiebung, Spiegelung, Maßstab) aus festem Hash, nur Client. | Karten wiederholen sich weniger. |
| N-31 / N-34 / ASSETS-1 | Übergänge (Mischzone, Lippen an Gras/Schnee/Sand, Konturlinien an Materialgrenzen); ungenutzte Texturen `hecke/kies/asche/gras/lava-glut/lava-risse` in Rezepte; Normalmap und Intro-Video bleiben Referenz (Ladezeit). | Organischer Look ohne Ladekosten. |
| N-32 / N-35 | Stil vereinheitlichen zuerst **prozedural** (Comic-Filter für die 15 Foto-Texturen, Aufhellen der `dunkel`-Bänder, biomgerechte Kammformen, Nebel, Lichtsäulen, Parallax); KI-Neuerzeugung nur mit Budget (Frage 1). | Einheitlicher Stil ohne Kosten. |
| KULISSE-1 / GRAFIKSTUFE-1 / WETTER-1 | Gemalte Kulisse auch online; Renderer liest Lite/Ultra; Wetter in Sonderbiomen, Spritzer auch in Höhlen, Schnee sammelt sich (Optik), Donner nach Entfernung. | Online = lokal, schwache Geräte flüssig. |
| N-43 | Wasser-Ereignisse gebündelt (Zustand + Zeitfenster), −94 % Datenrate, Snapshot bleibt Wahrheit. | Online flüssiger. |
| N-37 | **Versionsmarken bleiben Pflicht** (AGENTS.md §2 gilt). | Alte Replays laufen weiter. |
| UI-REST | Endbildschirm mit Kills und Rangliste, Home-Bildschirm, Lobby-Karten mit Podest/Statusfarbe, Spielerliste mit Porträts, kurzer überspringbarer Intro-Splash, Inline-Styles auf Design-Tokens. Kein Shop/Battle-Pass/XP. | Ein fertiger Rahmen um das Spiel. |
| Planet-Seen | Nein (Erweiterung ohne Spielwert gegenüber dem Aufwand). | — |

## 2. Arbeitspakete und Wellen

Höchstens drei Agenten gleichzeitig (Nutzungslimit). Jede Welle endet mit Merge, Tests und Push nach
`main`; der Hauptagent prüft CI und trägt den Stand in `docs/TODO-SSOT.md` ein.

**Welle 0 (läuft seit 2026-11-04):** große Touch-Geräte · Deploy-Reife (Deploy-Plan, Version, Paket,
Rollback, Sicherung, Dockerfile, Caddy) · Auslieferung (WebP-Kulissen, Bundle-Grenze, Lighthouse).

**Welle 1**
- **A Konten & Rangliste:** Login (Name+PW), SQLite-Speicher, Elo-Rangliste, Online-Kennzahlen im Server, Konto löschen, Admin-Passwort-Skript, RT-1 Fortsetzen nach Neuladen, Asche/Basalt im Online-Stand. Menü: Anmelden/Registrieren, Rangliste.
- **B Waffenfassung 14 & Balance:** GP-1, GP-2, GP-4 (3–4 Treffer), N-17, N-18, AERO-Windfaktor, ENG-1 Zufallsströme, MINEN-1-Regeln; Sweep vorher/nachher; Marken nach §2.
- **C Figuren & Kamera:** FIGUREN-B, KAMERA C1–C6, N-10 Schussbewegungen, N-09 Geschosszellen, Minen-Icon/-Bild, N-04 automatische Sprite-Prüfung.

**Welle 2**
- **D Gelände & Optik:** GELAENDE-1 (Fassung 10), N-30, N-31, N-32/N-35 prozedural, N-34, ASSETS-1, WETTER-1, KULISSE-1, GRAFIKSTUFE-1, LOOK-3.
- **E Klang & Klassen:** AUDIO-1, automatische Klangprüfung, Donner nach Entfernung, Mine/Fass-Klang, Hör-Checkliste; Klassenfassung 3 (Scout).
- **F Oberfläche:** UI-REST (Endbildschirm, Rangliste-Ansicht, Home, Lobby-Karten, Spielerliste, Splash, Tokens).

**Welle 3**
- **G Technik & Qualität:** N-43, N-46, TER-3, ENG-7, ENG-12, QA-3 (Black-Box auf Produktionsbau), G1 (Eingabe-zu-Bild), FLOW-1-Kennzahlenbericht, QA-4 (Gegenprüfung Engine), vollständiger E2E-Lauf, Release-Kandidat (Version, Paket, Changelog).

## 3. Definition „produktionsreif“

- CI grün auf `main` (Lint, Unit, alle vier E2E-Teile, Bundle-Grenze), keine offenen Fehler in `TODO-SSOT`.
- Deploy-Plan vollständig, Release-Paket baubar, Rollback und Sicherung getestet (trocken).
- Konten, Rangliste und Fortsetzen online getestet (zwei Browser).
- Alle Entscheidungen aus Abschnitt 1 umgesetzt oder begründet zurückgestellt.
- Übrig dürfen nur sein: Aufgaben, die ein Mensch erledigen muss (Abschnitt 4).

## 4. Was nur der Auftraggeber tun oder entscheiden kann

1. **Hosting** (AGENTS.md §5/§7, Agent darf nicht): Anbieter, Domain, Preis pro Stunde, Besitzer, Höchstdauer, zweite Frist.
2. **Bildbudget** über die bisherigen 15 USD (13,76 verbraucht), falls KI-Bilder gewünscht sind statt prozeduraler Lösungen: N-02 Stillbilder, N-32 Texturen, N-35 Kulissen, N-12 Waffen-Animationen.
3. **Hörabnahme und Playtest** (kann keine Maschine): Checkliste kommt mit Welle 2/3.
