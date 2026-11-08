# DesignRest – Übergabe an den ausführenden Agenten

Stand 08.11.2026. Grundlage: Branch `design-opt`, Commit `98ddf90c4682b75e63f92c01071027f67bbd1d00`. Dieser Branch enthält den vollständigen vorherigen Optikbericht und die Vergleichsbögen. Hier wird die kontrollierte Nachproduktion vorbereitet. Es wurde kein kostenpflichtiger fal-Aufruf durchgeführt und kein fertiges neues Sprite behauptet.

## 1. Einstieg

Lies zuerst diese Anleitung, dann [den Einzelbericht aller 81 Figuren](../fraktions-optik-audit-2026-11-08.md) und [die vorhandenen Vergleichsbögen](../design-opt/README.md). Die Namen/IDs aus `src/shared/config/factions.js` bleiben die Quelle der Wahrheit. Keine Namen oder Spielregeln nebenbei ändern. Änderungen ausschließlich auf diesem Sidebranch; kein automatischer Merge nach main.

Ziel: dieselben 81 Figuren erhalten, Anatomiefehler entfernen, Fraktionsidentität stärken, brauchbare Animationen liefern. Die vorhandenen Bilder sind Referenzmaterial, keine automatisch freigegebenen Trainingsdaten. Fehlerhafte Menschengesichter oder Zweibeiner nicht in Training/Referenzsatz übernehmen.

## 2. Lieferumfang

| Datei | Funktion |
|---|---|
| `tools/design-rest/characters.json` | Alle 81 IDs, Klassen, Referenzpfade, Körperformen und konkreten Identitätsregeln |
| `tools/design-rest/factions.json` | Neun Stilrichtungen, Farbziele, optionale freigegebene Stilreferenz und LoRAs |
| `tools/design-rest/config.json` | Konkreter fal-Endpunkt, Parameter, Pilot, Seeds, Iterationen und Korrekturprompts |
| `tools/design-rest/core.mjs` | Zusammensetzen der Prompts, Bewegungstypen, Budgetprüfung und Submit-Zustände |
| `tools/design-rest/run.mjs` | Offline planen, begrenzt einreichen, nach Request-ID fortsetzen und PNGs herunterladen |
| `tools/design-rest/review.mjs` | Lokale Einzelbild-/Animationsvorschau und hashgebundene Bewertungs-Vorlage |
| `tools/design-rest/pack.py` | Acht freigegebene RGBA-Frames in das bestehende WebP-Raster packen |
| `tools/design-rest/tests/` | Kostenfreie Tests für Auswahl, Promptlogik, Budget und doppelte Einreichung |

Node >=22; kein SDK und keine neue Abhängigkeit des Spiels nötig. Nur der optionale Packer benötigt Pillow. Der REST-Aufruf nutzt das eingebaute `fetch`. Alle Ausgaben standardmäßig unter dem bereits gitignorierten `artifacts/design-rest/`. Keine API-Schlüssel, Request-Journale oder temporären CDN-URLs committen.

## 3. Warum dieser Endpunkt

`fal-ai/qwen-image-edit-2511/lora` unterstützt Referenzbilder und optionale LoRA-Adapter. Das ist eine begründete Auswahl, kein an diesem Projekt bewiesener Qualitätsgewinn. Vergleiche zunächst die Ergebnisse mit den Originalen. Ein Wechsel zu einer anderen API benötigt ein neues geprüftes Parameterschema; nicht nur die Modell-ID austauschen.

Dokumentierter Input am Prüftag: `prompt`, `negative_prompt`, `image_urls`, `image_size`, `num_inference_steps`, `guidance_scale`, `seed`, `num_images`, `enable_safety_checker`, `output_format`, `acceleration`, `loras`. Der Runner sendet nur die tatsächlich verwendeten Felder. `denoise`, `strength`, `controlnet` und `reference_strength` werden nicht erfunden. Eine Posenskizze ist hier eine Bildreferenz, keine garantierte harte ControlNet-Bedingung.

| Stufe | Schritte | Guidance | Beschleunigung | LoRA |
|---|---:|---:|---|---|
| Baseline | 28 | 4,5 | none | keine |
| Qualitätskorrektur | 40 | 4,5 | none | zunächst keine |
| Optionaler Stilversuch | gleicher erfolgreicher Basissatz | unverändert | unverändert | eine geprüfte Stil-LoRA, getrennte Versuche 0,6 / 0,8 / 1,0 |

Diese Einstellungen sind Startpunkte, keine Erfolgsgarantie. Ein identischer Seed fixiert keine Identität bei geändertem Prompt und ist keine Garantie über spätere Backend-Modellupdates hinweg.

Offizielle Quellen, gelesen 08.11.2026:
- https://fal.ai/models/fal-ai/qwen-image-edit-2511/lora/api
- https://fal.ai/docs/documentation/model-apis/inference/queue
- https://fal.ai/models/fal-ai/qwen-image-edit-2511/lora
- https://huggingface.co/Qwen/Qwen-Image-Edit-2511

## 4. Vorauswahl: sechs Problemklassen statt 81 Blindversuche

| Pilot | Körperform | Erwartete Verbesserung |
|---|---|---|
| Captain Sven | Zweibeiner | Gesicht/Hut/Bart behalten, abnehmbare Ausrüstung trennen |
| Recon Luchs-01 | Vierbeiner | Genau vier Beine in jeder Pose |
| Heavy-Battery Mörser-Bot | Kettenfahrzeug | Keine Beine; Ketten, Chassis und Rohr erhalten |
| Cosmic-Meditate | Schweber | Mehrarmigkeit und Schneidersitz erhalten |
| Chrome Code-Shifter | Schlange | Durchgehender Segmentkörper, keine Gliedmaßen |
| Buffer-Flow Swarm | Schwarm | Mehrere kleine Insekten statt eines Rieseninsekts |

Erst sechs kanonische Referenzen, anschließend vier Schlüsselposen je Figur. Zwei getrennte Seed-Pläne vergleichen. Bewerte Qualität nach freigegebenen Frames pro Kostenbetrag, nicht nach dem schönsten Einzelbild. Nach stabiler Pilotabnahme eine vollständige Fraktion bearbeiten, erst dann alle 81.

## 5. Fraktionen und Stilvorgaben

| ID | Stil und Erkennungsmerkmale | Farbziel |
|---|---|---|
| xeno | Scharf gezeichneter Biopunk-Comic, geschlossenes Alienchitin, fremdartige Anatomie | Violett plus Säuregrün |
| rodentia | Schmutziger Abenteuercomic, Nagerschnauzen, rotes Metall, Werkstattdetails | Karminrot, Stahl, braunes Fell |
| pirates | Erwachsener Piratencomic, individuelle Hüte/Bärte, markante Requisiten | Schwarz und Gold |
| machina | Präzise stilisierte Metallillustration, ausschließlich mechanische Köpfe | Stahlblau und Cyan |
| undead | Zerfetzter Gothic-Horrorcomic, sichtbare Knochen und Geisterformen | Knochen und Giftgelbgrün |
| shinobi | Tusche-/Mangaeinfluss, Masken und Elfenbeinrüstung | Elfenbein, Schwarz, Stahl |
| beasts | Ausdrucksstarke Elementarwesen; Tieranatomie nicht vermenschlichen | Glutorange, Gold, Basalt |
| pixel | Konsequent kantige Pixel-/Voxelästhetik, feste Formen statt geglätteter Malerei | Lavendel/Violett; Codegrün sekundär |
| datacult | Kalte Cyberillustration, definierte Schaltkreise, Displays, Netzwerkobjekte | Signalgrün, Silber, Schwarz |

Farben sind der dokumentierte Zielentwurf, nicht bereits genehmigte neue Körpertexturen. Referenzfarbe, Anatomie und Stil nie gleichzeitig blind verändern. Erst Anatomie abnehmen, dann Farbstudie mit denselben Proportionen. Die Stile halten gemeinsame Lichtquelle links oben, einheitlichen Bodenkontakt und vergleichbare Konturlesbarkeit ein. Eine Stilreferenz darf die eigene Kopf- oder Körperform nicht überschreiben.

## 6. Vorbereitung jeder Figur

1. Original-Fraktionsbogen, HD-Porträt und Seitenansicht vergleichen. Für Datapath etwa enthält das Seitenbild bereits den falschen Armumfang; die Referenz nicht ungeprüft übernehmen.
2. Unter `characters.json` `reference` auf die beste freigegebene Identitätsvorlage setzen. Nach kanonischer Neuerzeugung einen im Projekt gespeicherten Referenzpfad verwenden.
3. `identity`, `morphology` und `equipmentMode` kontrollieren. Mehrarmige/mehrschwänzige Figuren benötigen konkrete `approvedCounts`, etwa `{"arms":6,"legs":2}`; tatsächliche Anzahl aus dem Original bestimmen, nicht diese Beispielzahlen kopieren.
4. Nach Sichtprüfung `referenceApproved: true` setzen. Diese Freigabe darf der ausführende Agent nach der beauftragten Sichtprüfung selbst dokumentieren; eine neue Nutzerbestätigung ist dafür nicht automatisch erforderlich.
5. `guides` belegen, z.B. `"walk:0":"artifacts/design-rest/guides/recon-luchs-01/walk-0.png"`. Jede Pose des Produktionslaufs benötigt eine zur eigenen Körperform passende Vorlage. Der Runner akzeptiert Diagnosen ohne Guide nur mit `--allow-unguided`.
6. Geräte wie Schaufel, Schwert, Gewehr, Buch und Akkordeon in Körper und abnehmbare Ausrüstung zerlegen. Biologische Klauen, Prothesen und fest montierte Fahrzeugteile bleiben erhalten. Neue Requisiten müssen separat im Renderer verankert werden; der Runner implementiert das nicht automatisch.

Posenvorlagen werden aus der kanonischen Figur entwickelt: gleiche Rumpflänge, feste Gelenk-/Kopfpositionen und gleicher Anker. Generische Menschenskelette nicht für Tiere, Fahrzeuge, Schlangen und Schwärme verwenden. Die gezeichneten Vorlagen sind selbst visuell abzunehmen.

## 7. Konkrete Aufrufe

Vom Repository-Hauptverzeichnis aus. Der Planungsmodus braucht keinen Schlüssel und erzeugt keinerlei kostenpflichtige Anfrage:

```bash
node tools/design-rest/run.mjs plan --selection pilot --animation reference --plan artifacts/design-rest/pilot-reference.json
node --test tools/design-rest/tests/core.test.mjs
```

Der Plan enthält die kompletten englischen Prompts, die verwendeten Parameter und SHA256-Prüfsummen aller Referenzen. Vor einem Lauf den Plan lesen. Ein bestehender Plan wird nicht überschrieben. Ändert sich eine Referenz, ist ein neuer Plan nötig.

Schlüssel einmal in der lokalen Shell setzen, ohne ihn in Repository-Dateien abzulegen:

```bash
read -rsp 'fal.ai key: ' FAL_KEY
export FAL_KEY
```

Die aktuelle Anfrage fordert eine Anleitung, kein Generierungsbudget. Deshalb wurde hier nichts kostenpflichtig gestartet. Der spätere Agent verwendet ein bereits vom Auftraggeber freigegebenes Budget. Das folgende Beispiel ist nur ein Aufrufschema: die 0,10 USD sind eine vom Betreiber einzutragende konservative Reservierung pro Anfrage, kein Anbieterpreis und keine zugesagte Preisobergrenze.

```bash
node tools/design-rest/run.mjs execute --execute --plan artifacts/design-rest/pilot-reference.json --max-requests 6 --request-ceiling-usd 0.10 --max-usd 0.60
```

Vor Ausführung den aktuellen Tarif, Eingangs-/Ausgangsauflösung und mögliche Zusatzkosten prüfen und passende Werte setzen. Der Runner begrenzt Anzahl und lokal reservierte Schätzung; er ist KEIN harter Abrechnungsdeckel beim Anbieter. Falls erforderlich zusätzlich ein Kontolimit beim Anbieter verwenden. Keine gemieteten Server oder Trainingsjobs starten.

Nach Referenzabnahme vier Schlüsselposen, z.B. für Machina:

```bash
node tools/design-rest/run.mjs plan --selection machina --animation walk --frames 0,2,5,7 --stage baseline --seed 81001 --plan artifacts/design-rest/machina-walk-a.json
```

Einzelkorrektur mit ursprünglicher Identität plus aktuellem Kandidaten:

```bash
node tools/design-rest/run.mjs plan --selection recon-luchs-01 --animation walk --frames 2 --stage quality --seed 81001 --revision 1 --correction anatomy --candidate artifacts/design-rest/candidates/luchs-walk-2.png --plan artifacts/design-rest/luchs-correction-r1.json
```

`--selection` akzeptiert `pilot`, `all`, eine Fraktions-ID oder eine Figuren-ID. `--animation` akzeptiert `reference`, `walk`, `action`, `state`, `emotion`; `--frames all` erzeugt acht Jobs je gewählter Figur. `--stage quality` setzt die zweite Parameterstufe. Die Standardauswahl für Bewegungsstudien sind nur vier Schlüsselposen. Vollausbau erst nach Abnahme.

## 8. Promptaufbau und gezielte Iterationen

Die vollständigen erzeugten Prompts stehen im Plan. Zusammensetzung: Referenzrollen → individuelle Identität → Fraktionsstil/Farben → Körperform → genaue Zielpose → Kamera/Anker → Requisitenregeln → Hintergrund → optionale Korrektur. Englisch ist hier die bewusst gewählte Produktionssprache der Modellanweisungen; Dokumentation und Codekommentare bleiben deutsch.

Beispiel für Luchs: `mechanical lynx, exactly four legs, pointed ears, segmented tail, cyan lights`. Bewegungsregel: `Maintain exactly four legs and the original spine. Animate a quadruped gait. Never stand upright or create human hands.` Bei einer Korrektur kommt der alte Kandidat als weitere Referenz dazu, aber die ursprüngliche Identitätsvorlage behält Vorrang.

| Fehler | `--correction` | Anweisung |
|---|---|---|
| Menschenkopf, fehlende oder neue Gliedmaßen | anatomy | Nur Anatomie zur Identitätsreferenz zurückführen |
| Farbdrift | palette | Nur Farben anpassen, Körper und Pose erhalten |
| Fest eingebrannte Waffen / Effekte | equipment | Nur abnehmbare Ausrüstung entfernen, Prothesen erhalten |
| Falsche Haltung | pose | Nur Gelenkstellung auf Posenvorlage korrigieren |
| Fremder Kopf/Rumpf | silhouette | Freigegebene Silhouette wiederherstellen |
| Fragmente / Hintergrundreste | cleanup | Nur unerwünschte Artefakte entfernen |

Revision 0 = Baseline, Revision 1 = eine gezielte Korrektur, Revision 2 = Qualitätsversuch mit besserem Guide oder geprüfter Referenz. Danach den Job als ungelöst dokumentieren und Verfahren wechseln, statt endlos neue Bilder zu erzeugen. Bei einem Klassenfehler wie Zweibeiner statt Fahrzeug sofort Vorlage/Morphologie korrigieren; mehr Schritte beheben keine falsche Aufgabenstellung.

Jede Korrektur ist ein neuer kostenpflichtiger Job mit neuem Plan und eigenem Budget. Nicht alle sechs Korrekturarten gleichzeitig anhängen. Keine langen Ketten, die ausschließlich vom letzten KI-Ergebnis ausgehen: Originalidentität immer erneut mitgeben.

## 9. LoRA – erst nach bestandenem Referenzvergleich

Im Ausgangszustand sind alle `loras: []`. Bei Bedarf eine eigene Fraktionsstil-LoRA mit ausschließlich sauberen Referenzen trainieren lassen; kein Training in diesem Paket. Modellbasis und Adapterversion müssen kompatibel sein. Eine 2509-LoRA nicht ungeprüft als 2511-kompatibel behandeln.

fal verwendet ein `loras`-Array mit Einträgen `{"path":"HTTPS-Adresse-der-kompatiblen-safetensors-Datei","scale":0.8}`. Maximal drei Adapter sind dokumentiert; dieser Workflow sollte zunächst nur einen verwenden. Keine nicht existierende Beispieldatei als echten Adapter eintragen. URL, Basisversion, Dateihash, Herkunft und erfolgreichen Vergleich im Produktionsprotokoll festhalten. `styleApproved` erst nach eigener visueller Vergleichsprüfung auf true setzen.

Drei kleine Versuche mit identischem Seed/Guide und den Stärken 0,6/0,8/1,0 sind eine geplante Untersuchung, keine Empfehlung, dass 0,8 immer richtig sei. Eine Charakter-LoRA nur bei belegtem Versagen der Referenzführung. Nicht automatisch 81 separate Trainings starten.

## 10. Queue, Wiederaufnahme und Fehler

Der Runner reserviert den Job dauerhaft, bevor er einen POST sendet. Nach erfolgreicher Einreichung speichert er Request-ID und die vom Anbieter gelieferten Status-/Ergebnis-/Abbruch-URLs. Diese URLs werden nicht aus der vollständigen Modell-ID nachgebaut: Queue-Unterpfade und App-Pfade sind unterschiedlich.

```bash
node tools/design-rest/run.mjs collect --plan artifacts/design-rest/pilot-reference.json --max-requests 6 --request-ceiling-usd 0.10 --max-usd 0.60
```

`collect` sendet keine neuen Generierungs-POSTs. Es holt nur bereits bekannte Requests ab. Bei Timeout nach Einreichung kann der Anbieterjob weiterlaufen. Status später erneut abfragen; bei Bedarf gezielt die gespeicherte `cancelUrl` mit der offiziell dokumentierten Methode verwenden. Ein lokaler Timeout ist keine bestätigte Stornierung.

Bei `uncertain` oder `reserved` nach einem Absturz nicht blind neu senden: die Anfrage könnte bereits bezahlt und aktiv sein. Anbieterhistorie prüfen, passende Request-ID/URLs rekonstruieren oder den unklaren Job abschreiben; den Zustand mit Begründung dokumentieren. Ein verbliebener `runner.lock` wird erst nach Prüfung entfernt, dass kein alter Runner mehr aktiv ist. Keine parallelen Runner für denselben Plan.

HTTP-Fehler oder fehlende PNG-Ausgabe sind keine Aufforderung zu automatischen Wiederholungen. Fehlende Referenz, geänderter Hash, fehlende Posefreigabe und ungültiges Budget stoppen vor dem ersten POST. Sicherheitsprüfungen bleiben eingeschaltet.

## 11. Sichtprüfung und Freistellung

```bash
node tools/design-rest/review.mjs artifacts/design-rest/pilot-reference-run
python3 -m http.server 8099 --bind 127.0.0.1 --directory artifacts/design-rest/pilot-reference-run
```

`review.html` zeigt Bilder und Bewegungsfolgen. Diese Vorschau ist eine Prüfhilfe, kein Qualitätsnachweis. In `review.json` müssen Reviewer, aktuelle Bildprüfsumme, Notizen und alle Prüffelder dokumentiert werden. Nie automatisch alles auf true setzen.

Prüfkriterien: Identität, Anatomie, Palette, Pose, Anker, Alpha, zeitliche Konsistenz. Gesicht/Kopf, Zahl der Gliedmaßen, Waffenanker und Größe in ALLEN Frames kontrollieren. Vor dunklem, hellem und farbigem Hintergrund sowie in tatsächlicher Spielgröße bei verschiedenen Zoomstufen prüfen. Ein Hund mit vier korrekten Beinen in einem Frame kann im nächsten trotzdem falsch sein.

Modell-PNG bedeutet nicht automatisch echten Alphakanal. Freistellung ist ein separater Schritt: mit geeignetem Segmentierer oder manuell. Kein pauschales Farbschwellen-Löschen, das cyanfarbene Effekte oder weiße Shinobi entfernt. Löcher, Säume und kleine Gliedmaßen prüfen. Den normalisierten Frame mit fester Figurenskalierung auf 1024x1024 RGBA bringen, x-Anker 512 und y-Grundlinie 960. Nicht jede Pose einzeln auf ihre Bounding Box skalieren; das verursacht Größenpumpen.

Wird ein Bild nach Freistellung/Normalisierung verändert, ändert sich sein Hash. Die Reviewer-Quittung muss auf die endgültige normalisierte PNG zeigen und diese erneut abnehmen. Der Packer akzeptiert keine Quittung für das unveränderte Rohbild, wenn tatsächlich eine andere Datei gepackt wird.

## 12. Packen und Manifest

Python mit Pillow installieren, z.B. in einer lokalen virtuellen Umgebung. Die verwendete Pillow-Version im Laufprotokoll festhalten. Keine Modellkosten beim Packen.

Spec-Beispiel, relativ zu ihrem eigenen Ordner:

```json
{
  "review": "review.json",
  "sourceBaseline": 960,
  "frames": [
    {"jobId":"walk0","file":"normalized/walk0.png"},
    {"jobId":"walk1","file":"normalized/walk1.png"},
    {"jobId":"walk2","file":"normalized/walk2.png"},
    {"jobId":"walk3","file":"normalized/walk3.png"},
    {"jobId":"walk4","file":"normalized/walk4.png"},
    {"jobId":"walk5","file":"normalized/walk5.png"},
    {"jobId":"walk6","file":"normalized/walk6.png"},
    {"jobId":"walk7","file":"normalized/walk7.png"}
  ]
}
```

```bash
python3 tools/design-rest/pack.py artifacts/design-rest/approved/pack.json artifacts/design-rest/staged/luchs__walk.webp
```

Ausgabe: 1024x512, vier Spalten/zwei Zeilen, Zellen 256x256, gemeinsame Grundlinie 240. Fester Faktor 0,25 für alle Frames. Der Packer schreibt nicht direkt nach `src/` und überschreibt keine bestehende Ausgabe.

Neue Aktionsreihenfolge: 0 Idle A, 1 Idle B, 2 Luft, 3 Hocke/Absenken, 4 Treffer A, 5 Treffer B, 6 Erholen, 7 Niedergestreckt. Dazu Manifestrollen explizit setzen: `idle:[0,1], luft:2, hocke:3, treffer:4, tod:7`. Das alte Manifest hat andere Zuordnungen je Figur; deshalb niemals nur die Bilddatei austauschen.

Walk: `gehen:[0,1,2,3,4,5,6,7]`. Emotion: Angst, Blinzeln, Schulterzucken, Jubel, Zittern, Blick hoch, Blick runter, Waffenwechsel. Emotionsfreigabe `gueltig` enthält ausschließlich tatsächlich geprüfte Zellindizes. Ein Farbvergleich ersetzt diese Abnahme nicht.

Zustand-Sheets bleiben Quell-/Studienmaterial, solange `figurenBilder.js` sie nicht lädt. Die neue Integration darf nicht zufällig tote Dateien als funktionierende Animation verkaufen. Waffen, feste Kanonen und Spezialrequisiten müssen getrennt nach identifizierten Renderer-Ankern implementiert werden.

## 13. Integration und Abschluss

- Vorhandene Dateien und Manifest sichern; nur eigene freigegebene Assets ersetzen.
- Bestehende IDs/Dateinamen beibehalten. Namensvorschläge aus dem Audit nicht automatisch übernehmen.
- Renderer-Fallbacks erhalten, bis jede neue Pose abgenommen ist.
- Unter anderem `npm test`, `npm run check:docs`, `npm run build`, `npm run check:sprites` und betroffene E2E-Specs ausführen.
- Prüfergebnisse klar von Sichtprüfung unterscheiden. Fehlende Browserlaufzeit ist keine bestandene Abnahme.
- Derselbe Fraktionstyp auf beiden Spielerseiten muss durch Spielerfarben/Marker unterscheidbar bleiben.
- Laufprotokoll: Modell-ID, Schema-/Parameterstand, Referenzhashes, Seed, Prompt, LoRA-Datei/-Hash/-Stärke, Request-ID, Gebühren laut Anbieter, Ablehnungsgrund, Reviewer, finale Bildhashes, Tests und offene Punkte. API-Schlüssel niemals protokollieren.

## 14. Fertiger Arbeitsauftrag zum Weiterreichen

> Arbeite auf DesignRest. Lies docs/DesignRest/README.md und den bestehenden 81-Figuren-Audit. Prüfe die 81 Einzelprofile und die Originalreferenzen. Erzeuge zuerst einen kostenfreien Plan für die sechs Pilotfiguren. Verwende nur ein bereits freigegebenes Generierungsbudget. Produziere und prüfe kanonische Referenzen, danach körperformspezifische Posenvorlagen und vier Schlüsselposen. Verwende die fal-Queue mit gespeicherten Request-IDs; wiederhole unklare POSTs niemals automatisch. Dokumentiere gezielte Korrekturen bis maximal Revision 2. Nimm erst eine Fraktion vollständig ab, bevor du alle 81 Figuren ausrollst. Packe nur hashgebunden freigegebene normalisierte RGBA-Frames. Aktualisiere Bild und Manifest gemeinsam. Prüfe die Figuren in Bewegung im Spiel und führe die Repository-Checks aus. Berichte genau, was fertig, nur vorbereitet, bezahlt, ungeprüft oder blockiert ist. Main nicht verändern.

## 15. Verifikationsstand dieser Übergabe

Offline-Planung für alle sechs Pilotfiguren und alle 81 Profile ausgeführt; Logiktests kostenfrei bestanden. Kein echter fal-Aufruf, kein LoRA-Training und keine neue Grafikproduktion. Der REST-Aufruf ist anhand der oben verlinkten aktuellen Dokumentation implementiert, aber ohne bezahlten Live-End-to-End-Test. Die Browserabnahme des vorausgehenden Kaderentwurfs ist weiterhin offen.
