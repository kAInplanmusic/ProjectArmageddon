# Agentenübergabe · 9. November 2026

Arbeitsbranch: `integration/agenten-uebergabe-2026-11-09`.
Ausgang von `main`: `67684f709394b61160b93badc38cbd543ecd8cf4`.
Diese Übergabe dokumentiert die Zusammenführung; neue Aufgaben werden ausschließlich
in `docs/TODO-SSOT.md` unter `INT-2026-11-09` gepflegt.

## Sofort weiterarbeiten

```bash
git fetch origin
git switch integration/agenten-uebergabe-2026-11-09
npm ci
npm run validate
npm run lint
npm run checks
npm test
npm run build
PA_PORT=5199 npx playwright test
```

Node mindestens 22, ESM-JavaScript; `AGENTS.md` lesen. Für E2E bei fehlendem Browser:
`npx playwright install --with-deps chromium`. Die CI läuft auch bei Pushes auf
`integration/**`, inklusive der bestehenden vier E2E-Shards. Jeder neue Agent
verwendet einen eigenen Branch/Worktree vom Integrationsstand. Weder die alten
Arbeitsbäume noch `main` als neuen Ausgangspunkt verwenden.

## Vollständiger lokaler und Remote-Bestand

| Quelle | Vorher | Behandlung |
|---|---|---|
| Checkout `/workspace/scratch/8313b915a5ec/game` | Branch `biom-panoramen`, HEAD `0c0f89c`, 17 geänderte Dateien, neue Fotoassets und zwei Clientmodule | Ursprungsstand als `45a2d1d` auf `sicherung/panoramen-lokal-2026-11-09` gesichert; sämtliche Arbeiten übernommen und unten genannte Integrationsfehler korrigiert. |
| Checkout `/workspace/scratch/e0d7c4d5ac78/game` | Detached HEAD `67684f7`, drei Änderungen und zwei temporäre Diagnosewerkzeuge | Ursprungsstand als `f08dd47` auf `sicherung/kulissen-lokal-2026-11-09` gesichert. Die drei Änderungen stimmen mit dem neueren Kulissencommit überein. Diagnosewerkzeuge zu `scripts/pruefe-kistenwege.mjs` zusammengeführt. |
| PR #3, `design-ui-rest`, `1ec548d` | Offener Entwurf | Regulär gemergt; Touch-Ladung, Lobbytexte, Replayfehler, Siegdialog, Zeichenreihenfolge sowie Designinventar enthalten. |
| PR #5, `design-kulissen-kartenform`, `0c0f89c` | Offener Entwurf | Ausgang des Integrationsbranches; passende Höhlen-, Insel- und Vertikalmotive enthalten. |
| Alter lokaler `main` im zweiten Checkout, `3230475` | Älterer Mergecommit | Bereits Vorfahr des aktuellen `main`; keine fehlende Arbeit. |
| Übrige Remote-Branches | `ci/bildvergleich-probe`, `codex/fraktions-audit-2026-11-08`, `design-opt`, `qa6-ladezeit`, `wip/auslieferung`, `wip/deploy-reife`, `wip/materialwerte`, `wip/touch-gross`, `worktree-agent-a8a280901a4ce4a92` | Nach vollständigem Fetch jeweils null zusätzliche Commits gegenüber `origin/main`. Nicht erneut eingespielt. |

Beide Quell-Checkouts hatten keine Stashes und je nur einen registrierten Worktree.
Der neue Integrationscheckout liegt unter `/workspace/scratch/815d2232f850/game`.
Die Quellstände bleiben als eigene Sicherungscommits in der Integrationshistorie
abrufbar. Beim Einbinden dieser Sicherungs-Eltern wird der bereits konsolidierte
Inhalt beibehalten (`ours`-Merge); so werden alte Fehler und doppelte Rohskripte
nicht wieder aktiviert. Keine Historie wurde umgeschrieben, keine Quelle gelöscht.
Die ursprünglichen PRs bleiben zur Nachverfolgung offen; dieser Auftrag veröffentlicht
den gemeinsamen Sidebranch und führt keinen Main-Merge aus.

## Übernommenes Verhalten und Integrationskorrekturen

- Fünf Größen: klein 1280×720/30 s, kompakt 1920×1080/35 s,
  mittel 2560×1440/40 s, weit 3200×1800/45 s, gross 3840×2160/50 s
  (jeweils 16:9; die sieben Formate stehen in `src/engine/karte.js`).
  Alte Maße einschließlich `krieg` bleiben erhalten. Lokal lautet der
  Motorparameter `format`, online `mapFormat`; dieser Anschluss wurde korrigiert.
  Revanche übernimmt Größe und Format.
- Drei Fotografien mit UHD-SDR-AVIF und 1280er-WebP. Laufzeit ist ausdrücklich SDR.
  Die experimentelle HDR-Kontextwahl wurde entfernt; Ursprüngliche AVIF-Dateien bleiben als
  Vorarbeiten gesichert. URL-Fallback: bevorzugte SDR-Stufe → andere SDR-Stufe →
  vorhandenes Katalogbild. UHD-WebP bleiben als Erzeugungsquellen im Repo. Katalogauflösung liegt gemeinsam in `panoramen.js`.
- Manueller Motivschlüssel hat Vorrang, auch online. Automatische Fotowahl nutzt
  passende Biome/Formen bei jedem dritten Seed. Die übrigen Biome behalten ihre
  bestehenden Motive bzw. der Planet die generative Szene.
- Hagel ist eine rein optische Wetterwahl. Klar/Schnee entfernen vorherigen Hagel;
  reduzierte Bewegung hält ihn still. Keine Änderung an Matchphysik oder Windregeln.
- Bodenobjektfassung 5: Dampfventil (Vulkan), Eislinse (Eiswüste), Kondensatorbank
  (Schrott), mit eigener Form und Schadensprofil. Marke 4 und ältere behalten
  ihre Regeln. Kennung läuft über Ereignisse, Start-/Reconnect-Snapshot und
  Hash; alte Hash-Payloads ohne Kennung bleiben unverändert.
- Verschobene Ereigniskatalog-Anker aktualisiert. Zeilenbudgets unverändert;
  `main.js` wurde durch gemeinsamen Katalogzugriff gekürzt.
- Ladebudget eingehalten: Fotos werden aus den gesicherten UHD-WebP als SDR-AVIF
  kodiert (`scripts/panoramen-sdr.py`). Kleine Assets bleiben separate URLs statt
  Base64 im JavaScript. Entwicklungs-Kommentare entfallen im gebauten HTML.
  Tier- und Wirkungstabellen der Hilfe werden erst bei ihrer Auswahl geladen;
  ein Zähler verhindert, dass ein verspäteter Import eine andere Hilfeseite überschreibt.
- Zwei lokale Einmaldiagnosen als dokumentiertes CLI zusammengeführt, inklusive
  aller fünf Größen, sieben Formate und der beiden besonderen Seeds.

## Prüfergebnisse und Grenzen

Siehe [Prüfprotokoll](integration-2026-11-09/pruefung.md).
[Kistenweg-Messung](integration-2026-11-09/kistenwege.jsonl) umfasst 37 Fälle.
Die Fotos besitzen [Quellhinweise und Dateimanifest](../src/client/assets/panoramen/README.md).
Es wird keine visuelle oder HDR-Freigabe aus reinen Unit-Tests abgeleitet.

## Nächster Agent

Zuerst CI des Branchkopfs prüfen. Danach `INT-E2E` und `INT-BILD` abarbeiten;
bei einem echten Browserfehler Trace, Seed und gewähltes Format sichern.
Keine Testgrenzen lockern und keine Baselines ungeprüft ersetzen.
Anschließend Foto-Erzeugung reproduzierbar machen und die Kistenweg-Diagnose
mit tatsächlichen Sprung-/Seilwegen bewerten. Die historischen Designberichte
beschreiben ihren jeweiligen Prüfstand, keine automatische aktuelle Freigabe.
