# Machina – Action-Produktion 08.11.2026

Fortsetzung der Machina-Lieferung. Walk war bereits übernommen; hier entstanden die acht Aktionsrollen je Figur: 0/1 Idle, 2 Luft, 3 Hocke/Absenken, 4/5 Treffer, 6 Erholen, 7 Niedergestreckt.

## Budget

| Posten | Wert |
|---|---:|
| Guthaben vor Action | 4,5034 USD |
| Guthaben danach | 1,5582 USD |
| Verbraucht | 2,9452 USD |
| Bezahlte Bilder | 76 (72 Basisframes + 4 Korrekturen) |

Insgesamt sind damit 8,4418 USD der ursprünglichen 10 USD verbraucht.

## Vorgehen

1. Acht Zellen der vorhandenen `__aktion.webp` je Figur als Posenvorlage extrahiert (`guides-aus-sheet.py <id> aktion`).
2. 72 Frames mit `fal-ai/nano-banana/edit`, Seed 81002, Identitätsreferenz plus Posenvorlage.
3. Tod-Posen separat korrigiert:
   - Recon-Luchs: liegende Pose ohne Guide erzeugt (der Sheet-Guide ist zweibeinig).
   - Rail-Viper: liegende Schlange über synthetische Vorlage.
   - Mörser-Bot: beschädigte/abgesenkte Pose über synthetische Vorlage.
4. Freistellen und Normalisierung mit `freistellen.py ... action` (Grundlinie 960, gemeinsame Skala).
5. Splitterbereinigung bei HBM F7 sowie Grid F1/F2 und Overlord F3/F7; danach erneut gepackt.
6. Neun `__aktion.webp` in `src/client/assets/sprite-sheets/machina/` übernommen; Originale unter `artifacts/design-rest/original-machina-action/`.

## Ergebnis

| Figur | Besonderheit | Status |
|---|---|---|
| Chassis Endo T8 | Tod-Pose liegend | übernommen |
| Slasher Cyber Jax | Tod-Pose liegend | übernommen |
| Hydra Titan Mech | Armkanone in allen Posen, Tod-Pose liegend | übernommen |
| Recon Luchs-01 | Tod-Pose separat liegend erzeugt | übernommen |
| Heavy-Battery Mörser-Bot | F7 beschädigt/abgesenkt, keine Beine | übernommen |
| Ordnance Rail-Viper | F7 liegende Schlange, übrige Frames erhoben | übernommen |
| Grid Drifter Datastream | F1/F2 von Splittern befreit | übernommen |
| Proxy Glitch Hack | Tod-Pose liegend | übernommen |
| Overlord Kernel Panic | F3/F7 von Splittern befreit | übernommen |

Kontaktbogen: `machina-action-2026-11-08.jpg`.

## Prüfungen

- `npm run check:sprites`: bestanden; keine Zerfaserungs-/Splitterhinweise. Nur die bestehende Namensdublette `Nullpointer Exception` bleibt.
- Hash-Register: `machina-action-2026-11-08-hashes.json`.
- Die Rollen im Manifest bleiben unverändert (`idle:[0,1]`, `luft:2`, `hocke:3`, `treffer:5`, `tod:7`).

## Offen

- Keine echte Browser-Spielabnahme; die Prüfung ist visuell und statisch.
- Hydra trägt die Armkanone im Sprite; falls der Renderer zusätzlich eine Waffe zeichnet, muss sie ausgeblendet werden.
- Zustand- und Emotions-Sheets der Machina sind weiterhin nicht neu produziert.
- Restguthaben 1,5582 USD reicht nicht für eine weitere Fraktion.
