# Waffenbalancing bis zur Einzelwaffe · 9. November 2026

Geprüfte Basis: `1e65efedb63a1a02629443786e901e666364d6db`. Waffenfassung 15, Klassenfassung 3,
Schaden 2, Wind 2 und Bodenobjekte 5. Es wurden keine Spielwerte oder Produktassets
verändert. Diese Lieferung ist die geprüfte Vorbereitung einer neuen Balancefassung.

## Umfang

- 150/150 Waffen mit individuellen manuellen Sichtbefunden auf zehn neuen Kontaktbögen.
- Menübilder in 24 und 64 px, Atlas-Icons in 128 px, Handbilder mit Griff-/Wirkspitzenmarkern und alle vorhandenen Geschossbilder gesichtet.
- 150 eindeutige Menübilder und 150 unterschiedliche Handbilder; sieben Gruppen gemeinsam genutzter Geschossbilder. Gemeinsame Geschosse sind nicht automatisch Fehler.
- 1606 echte fire/step/endTurn-Schüsse und Anwendungen: fünf Entfernungen pro Angriffswaffe und neun Klassenpaarungen; 38 Selbstwirkungen separat. 150/150 Erstpfade angenommen, keine Projektile nach dem Messlimit offen.
- 1392 zusätzliche Boden-Schussversuche für alle 87 echten Projektilpfade: 1338 angenommen, 54 wegen fehlender Sichtlinie abgelehnt. 169 Selbsttreffer, kein Tod, maximal 28 Eigenschaden bei 70 Ausgangs-LP. Das sind zwei Seeds und ein Winkel-/Kraftgitter, keine globale Sicherheitsgarantie.
- 30 wiederholte Nachschubanwendungen plus drei kontrollierte Giftproben; deterministische Schusswiederholung und Klassen-LP 130/100/70 geprüft.
- Alle 26 zusätzlichen Animations-Sheets anhand der bestehenden unveränderten drei Übersichten erneut gesichtet. Keine Assetänderung seit deren Erzeugung; kein Produktlader dafür gefunden. Keine Laufzeitfreigabe.

## Die wichtigsten belegten Befunde

1. **33 versteckte Flächenradien:** Radius 0 wird beim Spawn zu 24. Der kontrollierte Explosionspfad erzeugt tatsächlich Nahbereichsschaden ohne Direkttreffer. Der Kommentar nennt es Trefferfenster, der Motor verarbeitet es als Schadensradius. Erst Mechanikvertrag und Replayfassung klären, dann Zahlen balancieren.
2. **25 Strahlwaffen ignorieren den Klassen-Schadensfaktor:** pa_083 Goldene Hand verursacht in allen drei Angreiferklassen 46 direkten Schaden. Die neun Paarungen bestätigen das; der Strahlpfad multipliziert den Klassenfaktor nicht. Projektilpfade tun das. Unterschiedliche Fluggeschwindigkeit und Einschlagsposition können deren tatsächlichen Trefferschaden zusätzlich verändern.
3. **Versteckter Alt-Archetypenbonus in den neuen Klassen:** Alle drei Klassen tragen im Snapshot Archetyp 0. Der Schadens-/Maluspfad liest daraus brawler; Gift wird ohne gewählten Untertyp von 3 auf 2 Züge verkürzt. Kontrollprobe separat gespeichert.
4. **DoT-Zurechnung bricht im Schadensereignis ab:** Beim Flammenklingenbeispiel sind 33 direkte und 36 zusätzliche Brandpunkte belegt. Die Tickeinträge kennen den Urheber, damage-Ereignisse erhalten attackerId=null. Ein Auswerter nur nach attackerId meldet fälschlich null DoT. Kein Schluss über sämtliche Kill-/Erfolgswege ohne weitere Prüfung.
5. **Selbstauffüllender Nachschub:** pa_119 steigt bei zehn eigenen Anwendungen von 3 auf 4, dann 5 Ladungen; pa_122 und pa_125 bleiben bei 5. Ob das als zugkostenpflichtige Ressourcenerzeugung gewollt ist, ist eine Balanceentscheidung. Einmalgebrauchsökonomie besteht hier faktisch nicht.
6. **Veraltete Messannahmen:** Bestehendes waffen-balance.main reicht Grundkatalogobjekte weiter; seine Matches setzen Klassenfassung 3 nicht ausdrücklich. Der Konstruktor startet sonst Altfassung 1. Bei 110 Waffen unterscheidet sich maxAmmo von der tatsächlichen Frischmunition. Die Schadens-/Nachschubwertung darf deshalb nicht ungeprüft aus diesen Altberichten übernommen werden.
7. **Bildsemantik bleibt offen:** Vertauschte Griffe/Läufe etwa bei Baseballschläger, Maschinenpistole, Katana und Rakete; weiße/braune Flächen und Kartenrahmen; volle Figuren oder stationäre Großwaffen als Handbilder; Mine weiter mit Plattformmotiv. Jede ID hat einen eigenen Befund statt pauschaler Bildfreigabe.

## Einordnung der Stärke

109 der 112 Angriffswaffen treffen mindestens ein festgehaltenes Luftziel im
verwendeten Suchgitter. Feldmörser pa_039, Meteorbrocken pa_065 und Haubitze pa_066
treffen dort nicht. Das ist **kein Beweis eines Defekts oder einer schwachen Waffe**;
ihre Boden-/Anflugszenarien müssen gezielt ergänzt werden.

Aus dem besten gemessenen direkten Treffer gegen den neutralen Angreifer ergibt
sich rein rechnerisch für ein 100-LP-Ziel: {1: 1, 2: 42, 3: 45, 4: 17, 5: 2, 6: 1, 7: 1} Treffer bis
null LP. Nur 62/109 liegen dabei im bisherigen 3–4-Treffer-Ziel. Dieser Quotient
enthält keine DoT-Ticks, Pausen, Magazinengpässe, Deckung, zielendes Spiel oder
Utilitykosten und ist keine gemessene Killzeit. 16 Waffen überschreiten in
mindestens einer Klassenpaarung die natürlichen Ziel-LP bereits mit dem direkten
Probetreffer; darunter befinden sich erwartbare Ultimates. Daraus folgt kein
pauschaler Nerf und kein automatischer Nachweis einer neu durch F15 eingeführten Regression.

| Kategorie | Waffen | Selbstwirkungen | Median direkter Besttreffer, inkl. Nullproben |
|---|---:|---:|---:|
| melee | 21 | 0 | 48 |
| ranged | 19 | 1 | 44.78 |
| heavy_ranged | 20 | 0 | 48.16 |
| elemental | 20 | 2 | 34.15 |
| magic | 30 | 17 | 42 |
| utility | 10 | 6 | 47 |
| tech | 20 | 8 | 56.5 |
| ultimate | 10 | 4 | 80.9 |

Die Kategorien sind keine austauschbaren Rollen. Heilung, Schild, Mobilität,
Nachschub und Kontrolle bekommen eigene Nutzgrößen. Eine starke seltene Waffe
mit einer Ladung darf nicht allein gegen eine unendliche Startwaffe anhand eines
einzigen Schadenswerts bewertet werden. Empfehlung: zuerst BAL-01 bis BAL-06,
dann rollenbezogene Zahlenkorrekturen mit identischen Vorher/Nachher-Szenarien.

## Grenzen und noch ausstehende Abnahmen

Der Luftzielaufbau hält beide Figuren in freier Luft auf y=100 fest. Er isoliert
Schüsse und protokolliert echte Engineereignisse; er prüft keine Bewegung, Deckung
oder repräsentativen Partien. Die Grob-/Feinsuche ist endlich und garantiert kein
global optimales Ziel. Turrets und Minen werden tatsächlich aufgestellt, aber
ihre volle Nutzwirkung gegen Bodenfiguren ist damit nicht belegt. Ein Seed pro
Klassen-/Distanzmessung und zwei Bodenseeds ergeben keine statistische Trefferquote.

Das Ziel hat 1000 Maximal-LP, um Direktwerte nicht beim Tod abzuschneiden. Dadurch
liegt der 20%-DoT-Deckel bei 200 statt z.B. 14 für einen natürlichen Okkultisten.
DoT-Gesamtwerte dieses Aufbaus dürfen nicht als natürliche Klassen-Killzeiten
verwendet werden. 6 zusätzliche Zugwechsel sind ein Beobachtungsfenster, keine
Garantie identischer eigener Zugzahlen bei automatischen Zugenden/Betäubung.

Die Sichtprüfung betrifft statische Bildrollen einschließlich Marker, nicht die
final transformierte Browseranimation. Der lokale Chromium-Start ist durch
System-Socket-EPERM blockiert. Bereits bestehende Waffen-E2E-Specs, Safari/Touch,
alle Zielwinkel und die vollständige Bildabnahme bleiben offen. Kein Test wurde
übersprungen oder abgeschwächt, um eine Freigabe zu behaupten.

## Validierung und Reproduktion

`npm test`: 2422/2422 grün, 0 übersprungen. `npm run lint`, `npm run check:docs`
und `git diff --check` werden vor der Veröffentlichung nochmals geprüft.
Es werden nur Auditwerkzeuge und Berichtdateien ergänzt. Die Spielmechanik bleibt unverändert.

```bash
PA_ZUGPAUSE_SEKUNDEN=0 node tools/waffenbalance-audit.mjs
PA_ZUGPAUSE_SEKUNDEN=0 node tools/waffenbalance-bodenprobe.mjs
PA_ZUGPAUSE_SEKUNDEN=0 node tools/waffenbalance-sonderproben.mjs
python3 tools/waffenbalance-bilder.py
python3 tools/waffenbalance-bericht.py
```

Node 24.22.1 / Pillow 13.0.0 im Prüfumfeld. Basiskonfigurationen und Grenzen
stehen in den JSON-Dateien und im jeweiligen Tool. Die Rohdaten werden deterministisch
erzeugt; Toolversion und Basiscommit zusammen sichern. Historische Fassungen und
Altreplayprüfungen bei jeder späteren Mechanikänderung beibehalten.

## Belege

`messung-150.json`: aktuelle und historische Katalogfelder, Effekte, 1606 Aktionen,
neun Klassenpaarungen, Status-/Ereignisverläufe und kontrollierte Radiuskurven.
`bodenprobe.json`: 1392 Bodenfälle inklusive Ablehnungen und Eigen-/Umweltschaden.
`sonderproben.json`: Nachschubschleifen und versteckter Archetypenbonus.
`bilddaten-150.json`: Bildmaße, Alpha, Hashes, Atlasgrenzen und pixelgleiche Rollen.
`sichtbefunde-150.json`: alle 150 manuell gesichteten Einzelbefunde.
`massnahmen-17.json`: Umsetzungsdetails und Akzeptanzkriterien; Status wird
ausschließlich in `docs/TODO-SSOT.md` geführt. `index.html`: filterbarer Bericht.
