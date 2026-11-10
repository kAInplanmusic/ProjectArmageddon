# Übergabe 2026-11-10 — offene Arbeitsstände für die nächsten Agenten

Auf Wunsch des Auftraggebers sofort gepusht; **mehreres ist ungeprüft**. Erst prüfen, dann weiterbauen.
Regeln: `AGENTS.md`. Gesamtliste: `docs/TODO.md`.

## 1. SPR-4: pixel-Figuren als 8-Bit — auf `main`, UNGEPRÜFT

- Neu erzeugt (Together `openai/gpt-image-2`, Referenz = alte Figur), hart gerastert (logisches Raster ×5,
  ≤ 16 Farben, Fuß y = 240): `characters/`, `characters-side/`, `characters-hd/`, `sprite-sheets/` je `pixel/`
  (9 Figuren, 27 Blätter walk/aktion/zustand). Manifeste: Seitenanker und Rollen nur der 9 pixel-Einträge neu
  gemessen; alle anderen Figuren unverändert (der Klassifizierer hätte 62 Handwerte überschrieben — nicht
  komplett laufen lassen!).
- Werkzeuge: `scripts/sprites-erzeugen/b1-pixel-pilot.py` (Porträt/Seite), `b1-blaetter.py` (Blätter
  zuschneiden), `neu-erzeugen.py --stil-zusatz 8bit` (Rohblätter), `tog.py` (`PA_RAW_REF` = Branch der Vorlage).
  Rohbilder lagen in `/tmp` und sind weg; neu erzeugen kostet Together-Guthaben.
- **Offen:**
  1. Tests laufen lassen: `tests/figur-identitaet.test.js`, `figur-sheets`, `sprite-sheets`, `figur-emotion`,
     `figuren-redaktion`, `npm run check:sprites`, E2E `figuren-sheets`, `figuren-sichtbarkeit`, `roster`.
     Rot → Ursache klären (z. B. HD-Größe, Anker), nicht Tests abschwächen.
  2. Emotionsblätter `sprite-sheets-emotion/pixel/*` sind noch die ALTEN (Stilbruch). Prompt `EMOTION` in
     `prompts.py` ist vorbereitet (`neu-erzeugen.py --blaetter emotion --stil-zusatz 8bit`), danach
     `b1-blaetter.py` und `emotion-pruefen.py`. Lauf wurde abgebrochen, nichts eingebaut.
  3. `pixel/00_nullpointer-exception`: Klassifizierer fand nur `tod`; idle/luft/treffer/hocke fallen auf die
     prozedurale Animation zurück. Prüfen, ggf. Blatt neu erzeugen.
  4. Code-Frage aus Auftrag B1: Figuren werden mit Glättung skaliert (`figurStufen.js`); für Pixelkunst evtl.
     `imageSmoothingEnabled = false` je Fraktion. Sichtprüfung im Spiel durch den Auftraggeber steht aus.
  5. 01_pyrofox-a: Porträt grün, Seite orange — war schon im Original so.

## 2. Feuerwesen (pa_118) — Branch `arbeit/feuerwesen`, NICHT gemergt

Vorgabe des Auftraggebers: „kleiner Feuergnom, läuft geradeaus, springt, zerbirst bei Berührung mit einer Figur
in 5 Feuerkugeln". Agent wurde mitten in der Arbeit gestoppt. 4 Commits: Motor (Waffenfassung 20), Test der
Fassung 20, Client-Darstellung, MERGE-13 (roter E2E `waffen-animation` „Kachel-Waffen: Orb"); letzter Commit
ist unfertiger Zwischenstand. Weiter: Stand lesen, `npm test`, `npx eslint .`, `node scripts/checks.mjs`,
E2E prüfen, Kollisionsmatrix neu erzeugen, Doku `docs/waffenbalance-2026-11-09/FEUERWESEN-FASSUNG20.md`,
dann auf aktuelles `main` bringen und mergen. README/MASTERDOTO/TODO-Zahlen danach nachziehen.

## 3. E2E-Triage — Branch `arbeit/e2e-triage`, NICHT gemergt

Auftrag: volle E2E-Suite laufen lassen und rote Tests einordnen (MERGE-2), wirkungslose `doesNotMatch`-CSS-Tests
seit der Auslagerung nach `basis.css` (MERGE-4), Leertaste nach Klick auf HUD-Knopf (MERGE-6). Agent gestoppt;
1 WIP-Commit (Anpassungen in `backdrops`, `dreh-hinweis`, `erfolge`, `onboarding-erstkontakt`, `profil`,
`design.css`), ungeprüft und ohne Begründung je Änderung. Der Branch basiert auf einem älteren `main`
(Vergleich mit `git diff origin/main...HEAD`, drei Punkte). Jede Änderung einzeln prüfen, bevor sie bleibt.

## 4. Sonstiges

- Bilddienste: Schlüssel nur aus der Umgebung (`TOGETHER_API_KEY`, `RUNWARE_API_KEY`, `REPLICATE_API_TOKEN`,
  `KIE_API_KEY`, FAL, Comet), nie in Dateien. Stand 2026-11-10: fal 1,48 $, Runware 3,66 $, KIE 4,58 Credits.
- Workflow „Bilder B1 Pilot" (`.github/workflows/bilder-b1-pilot.yml`) braucht das Repo-Secret `TOGETHER_API_KEY`.
- Rest der Bildaufträge B2–B6: `docs/auftraege/bildagenten-2026-11-09.md`.
