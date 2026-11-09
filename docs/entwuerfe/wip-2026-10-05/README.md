# Gerettete Entwürfe aus `wip/stand-2026-10-05`

Der Branch `wip/stand-2026-10-05` (ein Commit `4164b92`, „unversionierte Arbeit vom
2026-10-05 gesichert") wurde am 2026-11-09 **nicht** gemergt und danach gelöscht: Er lag
761 Commits hinter `main`, löschte Werkzeuge und baute Exporte zurück. Hier liegt, was
nur dort stand und Design oder Animation betrifft.

| Datei | Inhalt | Stand gegenüber `main` |
|---|---|---|
| `ANIMATION_DESIGN.md` | Entwurf für das Animationssystem (Waffen, Figuren, Effekte) | Entwurf, nicht umgesetzt geprüft |
| `background_elements_design.md` | Entwurf für Hintergrundelemente und Kulissen | Entwurf; `main` hat inzwischen 20 Biome und neue Kulissen |
| `project_armageddon_weapons_design_v2.md` | Vorschlag für zehn neue Waffen (pa_046 bis pa_055) | Entwurf; die zugehörige JSON-Datei liegt unverändert im Repo-Wurzelordner |
| `waffenanimation-je-waffe.patch` | Code-Stand: Farbe und Rückstoß des Mündungsfeuers je Waffe (`waffenEigenschaften`) | überholt: `main` löst das seit 2026-11-03 über die Waffenoptik (`tests/waffen-optik.test.js`) |
| `weapon-specific-animation.test.js.txt` | Test zu diesem Patch | läuft auf `main` nicht (Export fehlt); nur als Beleg abgelegt |

Die Dokumente sind unverändert übernommen (englisch, Stand 2026-10-05). Aussagen darin
über den Code sind nicht gegen den heutigen Stand geprüft.
