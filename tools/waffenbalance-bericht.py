"""Erstellt Bericht und Arbeitsgrundlage aus den aktuellen Audit-Rohdaten."""
import argparse
import base64
import collections
import html
import io
import json
import math
import statistics
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/waffenbalance-2026-11-09'
ap = argparse.ArgumentParser()
ap.add_argument('--standalone', type=Path)
args = ap.parse_args()
load = lambda name: json.loads((OUT / name).read_text())
data = load('messung-150.json')
weapons = data['weapons']
visuals = {x['id']: x for x in load('sichtbefunde-150.json')}
images = load('bilddaten-150.json')
ground = {x['id']: x for x in load('bodenprobe.json')['weapons']}
special = load('sonderproben.json')
assert len(weapons) == len(visuals) == len(images['weapons']) == 150
best = lambda w: max(w['distances'], key=lambda s: s['directTargetDamage'])
dot = lambda s: round(sum(e['payload']['damage'] for e in s['events'] if e['type'] == 'dot_tick'), 3)
e = lambda value: html.escape(str(value))
fmt = lambda n: '∞' if n == 'unbegrenzt' else (f'{n:.2f}'.rstrip('0').rstrip('.') if isinstance(n, (float, int)) else str(n))

tasks = [
('BAL-01', 'P0', 'Trefferfenster und echten Flächenradius trennen', 'src/engine/shooting.js: feuere; src/engine/explosion.js: wendeExplosionAn; 33 Radiusabweichungen in messung-150.json',
 'Neue Waffen-/Mechanikfassung vorbereiten. Radius 0 bleibt als expliziter Wert erhalten; Trefferhilfe bekommt eine eigene Bedeutung. Produktkollision, Direkttreffer, Krater und Splash gemeinsam prüfen.',
 '33 betroffene IDs: Nahvorbeiflug ohne Direkttreffer macht bei Radius 0 keinen Flächenschaden. Direkttreffer bleibt wirksam. Radius > 0 behält Abfallkurve. Altreplays bis F15 bleiben bitgleich.', ''),
('BAL-02', 'P0', 'Klassenfaktor in Strahl- und Projektilpfad vereinheitlichen', 'src/engine/match.js: #resolveHitscan; src/engine/shooting.js: feuere; 25 Strahlwaffen in neun Klassenpaarungen',
 'Verbindlich festlegen, ob der Klassenfaktor auch Strahlen betrifft. Empfehlung: gleicher Schadensvertrag für beide Pfade, separat von klassenspezifischer Fluggeschwindigkeit. Änderung versionieren.',
 'Neutraler Testtreffer für pa_083 liefert bei gewollter Gleichbehandlung 34,5 / 46 / 57,5 Rohschaden statt dreimal 46. Buff, Schild, Rüstung und Mehrfachwirkung werden genau einmal verrechnet. F15 unverändert.', ''),
('BAL-03', 'P0', 'Alte Archetypenboni aus neuen Klassen entfernen oder bewusst definieren', 'src/engine/schadenMali.js: wende und schaden; sonderproben.json: legacyArchetype',
 'Bei Klassenfassung 3 keine versteckte Ableitung von archetypeId 0 zu brawler. Empfehlung: explizit neutraler Archetyp bei neuen Klassen; Altklassen weiter unverändert.',
 'Giftregel 3 Züge bleibt ohne bewusst gewählte neue Resistenz 3 Züge statt 2. Alle drei neuen Klassen, Gift/Säure und Magie-/Schattenwiderstand getrennt prüfen. Altklassen 1/2 behalten ihre Boni.', ''),
('BAL-04', 'P0', 'Urheber von Schaden über Zeit bis Schadensereignis erhalten', 'src/engine/schadenMali.js: Zugtick/applyDamage; pa_137 Ereignisse in messung-150.json',
 'p.by liegt vor, applyDamage erhält null. Zurechnung und Killvertrag explizit bestimmen; Ereignisauswertung darf nicht alle DoT-Schäden als Umwelt behandeln. Änderung mit Replay-/Statistikvertrag abstimmen.',
 'Pa_137: 33 direkter Schaden und 36 nachgewiesener Brand im Kontrollaufbau werden dem richtigen Angreifer zugerechnet; kein Doppelzählen von damage und dot_tick. Zwei Urheber und ein DoT-Kill erhalten eigene Gegenproben.', ''),
('BAL-05', 'P1', 'Selbstauffüllenden Nachschub als Ökonomieregel entscheiden', 'src/engine/shooting.js: restoreAmmo; sonderproben.json: 10 Anwendungen pro Nachschubwaffe',
 'pa_119, pa_122, pa_125 können sich selbst auffüllen. Empfehlung: auslösende Nachschubwaffe vom Auffüllen ausschließen oder Ressourcenerzeugung ausdrücklich als Rolle bepreisen. Zufallsmunition bei pa_085/pa_100 einbeziehen.',
 'Mindestens 20 eigene Anwendungen mit Inventar nur aus Reserve/Nachschub und mit zusätzlicher endlicher Waffe. Munitionsbilanz, Cooldowns, Inventarreihenfolge und Obergrenze 5 dokumentiert; keine unbeabsichtigte positive Rückkopplung.', 'BAL-06'),
('BAL-06', 'P0', 'Bestehende Balancewerkzeuge auf den tatsächlichen Spielvertrag bringen', 'scripts/waffen-balance.mjs: main/aufbau/ausreichend; scripts/balance-schaden.mjs; MatchController-Konstruktor',
 'getWaffe für Auswahl, Klassifikation und Vorschau verwenden. Klassenfassung, Schaden, Wind, Bodenobjekte und Munition explizit angeben. Frischmunition aus Inventar statt maxAmmo; verkürzte Distanzen und nicht treffende Proben nicht still als Vollabdeckung behandeln.',
 'Alle 150 aktuelle Namen/Werte; Klassenleben 130/100/70; 9 unbegrenzte, 73 Drei-, 48 Zwei-, 20 Einschusswaffen. Alte Fassung separat reproduzierbar. Jede Distanz bleibt als angefragt/gemessen sichtbar.', ''),
('BAL-07', 'P1', 'Menü, HUD, Beschreibung und Renderer an dieselbe Partiefassung binden', 'src/client/waffenMenue.js: getWeapon/getWaffe; src/client/hud.js; src/client/renderer.js',
 'Partiefassung ausdrücklich weiterreichen statt im Detail Standardfassung und in Kacheln Grundkatalog zu mischen. Mine pa_127 sowie Schadens-, Farb- und Munitionsanzeige gemeinsam abnehmen.',
 'F11 zeigt historische Teleportplattform, F12/F15 die aktuelle Mine. Maschinenpistole zeigt zur Partie passende 21/42 Werte. Heilung/Schild/Bewegung zeigen reale Nutzwerte; Altreplays erhalten ihre Darstellung.', 'BAL-06'),
('BAL-08', 'P1', 'Griffe und Wirkspitzen semantisch korrigieren', 'sichtbefunde-150.json: Anker/Ankerprüfung; sichtpruefung-01 bis -10.jpg',
 'Jede markierte Waffe in nativer Orientierung prüfen. Mindestens pa_001/003/004/009/012/018/023/031/034/038/040/051/055/068/136 haben klare Richtungs-/Griffkonflikte; weitere Ankerprüfungen stehen pro ID im Befund.',
 'Links/rechts, drei Zielwinkel, Ruhe/Ziehen/Schuss und drei Figurengrößen im echten Renderer. Griff sitzt am nutzbaren Heft, Wirkspitze am tatsächlichen Ende, Spiegelung bleibt korrekt. Keine geometrische Randheuristik als Freigabe.', ''),
('BAL-09', 'P1', 'Freistellung und Ruheeffekte gezielt bereinigen', 'sichtbefunde-150.json: Freistellung/Dauereffekt; bilddaten-150.json',
 'Weiße/braune Flächen, Restkanten und fremde Rahmen nur bei betroffenen Rollen entfernen. Bewusste UI-Kacheln nicht pauschal entrahmen. Aktive Flammen, Mündungsblitze und Schweife von ruhenden Körperbildern trennen.',
 'Dunkler/heller Spielgrund; Menü 24/64, HiDPI und native Handgröße. Jede Änderung mit Vorher/Nachher pro ID und ohne Verlust von Waffenbestandteilen.', 'BAL-08'),
('BAL-10', 'P1', '26 Zusatzanimationen vor Produktanschluss neu abnehmen', 'Unveränderte drei Animationsübersichten im Audit vom 8.11.; src/client/assets/weapon-sprites/anim',
 'Nicht geladene Sheets nicht als fertige Animationen zählen. Fremde Identitäten ersetzen, insbesondere Bumerang, Tentakelgift, Endlosschleife, Alte Dame, Astralkrieger, Wassermelone, Weltendrache und Feuerschild. pa_112/114 sind bytegleich.',
 'Je Blatt Identität aller acht Frames, Alpha, Richtung, Bewegung und Rolle prüfen. Freigabe vor Loaderanschluss. Schlechte Sheets bleiben ausgeschaltet; starre Werkzeuge dürfen prozedurale Animation behalten.', 'BAL-08,BAL-09'),
('BAL-11', 'P1', 'Hand-, Rücken-, Aufstell-, Beschwörungs- und Symbolrollen festlegen', '38 echte Selbstwirkungen, 87 Projektilstarts, 25 Strahlpfade; 150 individuelle Sichtbefunde',
 'Eigene Bildrolle pro Waffe ableiten. Ganze Figuren, Pferde, Geschütze und Bäume nicht ungeprüft als normale Handwaffen führen. Menüauslöser, Weltobjekt und Projektil dürfen verschiedene passende Bilder erhalten.',
 'Alle 150 IDs haben dokumentierte Rolle; Spezialfälle Rucksack, Gleitschirm, Statue, Boot, Mine und Beschwörung sind im Spiel semantisch verständlich. 96 vorhandene Geschossbilder werden nicht als 96 echte Projektilpfade ausgegeben.', 'BAL-07'),
('BAL-12', 'P1', 'Reale Treffer- und Kollisionsmatrix vervollständigen', 'messung-150.json: fünf Distanzen; bodenprobe.json: zwei Seeds, 1392 Versuche',
 'Pa_039/065/066 bekommen passende Boden-/Anflugszenarien: Null im Luftzielaufbau ist kein Defektnachweis. Zusätzlich zwei Ziele, Wanddeckung, Randtreffer, Durchschlag, Zielsuche, Landung, Zünder, Seil und Wasser prüfen.',
 'Jede der 112 Angriffswaffen hat mindestens einen vollständigen zielgerichteten Kollisions-/Schadensnachweis in ihrer echten Rolle; 38 Selbstwirkungen haben ihren Nutzen separat belegt. Kontrollierter Explosionsaufruf ersetzt keinen Kollisionsfall.', 'BAL-01,BAL-02,BAL-06'),
('BAL-13', 'P1', 'Status-, Schild-, Heil- und Buffökonomie mit echten LP testen', 'messung-150.json: Effekte/Statusverläufe; sonderproben.json',
 '1000 LP dient der unbeschnittenen Direktmessung und verändert den 20%-DoT-Deckel. Deshalb echte 70/100/130 LP, wiederholte Treffer, zwei Urheber, Reinigung, Wasser, Schildrückwirkung und Buffdauer getrennt messen.',
 'Kein unbeabsichtigtes Dauerstun oder unendliches Stapeln. Heilgrenze, 40/55/75 Schildpunkte, 20%/35% Rüstung, Überlappungen und ablaufende Verstärkung jeweils mit Gegenprobe. Nachschub und Turrets mit wirklichen Inventaren/Zielen.', 'BAL-03,BAL-04,BAL-05'),
('BAL-14', 'P2', 'Feinbalancing pro Rolle statt globaler Schadensfaktoren', 'Bericht: 109 Trefferwaffen im Luftzielaufbau; direkter 100-LP-STK als Rechenmodell',
 'Erst nach Korrektheit neue Balancefassung bewerten. Pro Rolle direkten Schaden, DoT, Kontrolle, Trefferbreite, Terrainnutzen, Weggewinn, Risiko, Munition und Pause gegen gleichartige Seltenheit vergleichen. Bestehendes Ziel 3–4 gute Treffer als Ausgang, Ultimates/Spezialrollen begründet ausnehmen.',
 'Vorher/Nachher mit identischen Seeds, aktuellem Klassenvertrag und echten LP. Änderungen einzeln begründet, kein pauschaler Nerf aus einem Besttreffer. Seltenheit, Loot und Magazin-Killpotenzial sind zusammen bewertet.', 'BAL-01,BAL-02,BAL-03,BAL-04,BAL-05,BAL-06,BAL-12,BAL-13'),
('BAL-15', 'P1', 'Browser-, Touch- und Bewegungsabnahme nachholen', 'Lokaler Chromium-Start weiterhin durch System-Socket-EPERM blockiert',
 'Waffenmenü, HUD, Animation und Schadenanzeige im startfähigen Chromium sowie iPhone/Safari sichten. Alle 150 statischen Sichtbefunde sind durchgeführt; laufende Animation, Handkontakt und Touch-Hitflächen sind eigene Abnahme.',
 'Betroffene E2E-Specs waffenmenue/waffen-animation und vollständige Suite grün; keine ungeprüften Baselineupdates. 24/64/128 px, geringe Bewegung, Kontrast, Links-/Rechtszielung und klares Nutzenfeedback pro Rolle.', 'BAL-07,BAL-08,BAL-09,BAL-11'),
('BAL-16', 'P1', 'Namen und Bildversprechen gegen tatsächlich vorhandene Mechanik abgleichen', 'Pa_049 Rückkehr, pa_054 Streuschuss, pa_042/045 Salven, pa_127 Mine; Einzelbefunde',
 'Bewusst entscheiden, welche Signaturmechanik benötigt wird und welche nur bildliche Benennung ist. Empfehlung: erst ehrliche Anzeige, dann gezielte Individualisierung; keine neuen Mechaniken in einem Zahlenpatch verstecken.',
 'Cluster-/Schrot-/Salvenmarkierung nur für belegte Mechanik oder eindeutig anders benannt. Pa_127 hat Mine in Name, Icon und Weltobjekt; Zauberrolle/Buch identisch erkennbar. Zielsuche, Multihit und Beschwörung durch echte Ereignisse belegt.', 'BAL-07,BAL-11,BAL-12'),
('BAL-17', 'P2', 'Karten-, Fraktions- und Partienabdeckung staffeln', 'Bisher keine Winrate-Erhebung aus diesem Audit',
 'Schnelle deterministische Grenzfälle zuerst, dann repräsentative Partien in 2/4-Spieler-Konfigurationen. Fünf Größen, sieben Formate, 20 Biome und Wind-/Wasser-/Materialfälle als Abdeckungsmatrix führen; Fraktionsgrafik getrennt vom Klassenvertrag halten.',
 'Nicht ausgeführte Zellen explizit offen. Volles 150×5×7×20×3-Seed-Kreuzprodukt umfasst bereits 315000 Aufbauten; keine Vollabdeckung aus wenigen Beispielen behaupten. Winrates erst mit Stichprobenumfang, Seedliste und Unsicherheit veröffentlichen.', 'BAL-14,BAL-15,BAL-16'),
]
plan = [{'id': i, 'priority': p, 'title': title, 'evidence': evidence, 'implementation': impl, 'acceptance': acc, 'dependsOn': dep.split(',') if dep else []} for i, p, title, evidence, impl, acc, dep in tasks]
(OUT / 'massnahmen-17.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')

ground_cases = [s for w in ground.values() for s in w['cases']]
measured = [best(w)['directTargetDamage'] for w in weapons if not w['self'] and best(w)['directTargetDamage'] > 0]
stk = collections.Counter(math.ceil(100 / n) for n in measured)
radius = [w['id'] for w in weapons if any(s['spawned'] and s['spawned']['blastRadius'] != w['current']['blastRadius'] for s in w['distances'])]
cats = list(dict.fromkeys(w['current']['category'] for w in weapons))
categories = []
for cat in cats:
    ws = [w for w in weapons if w['current']['category'] == cat]
    values = [best(w)['directTargetDamage'] for w in ws if not w['self']]
    categories.append((cat, len(ws), sum(w['self'] for w in ws), statistics.median(values) if values else None))

summary = f'''# Waffenbalancing bis zur Einzelwaffe · 9. November 2026

Geprüfte Basis: `{data['sourceCommit']}`. Waffenfassung 15, Klassenfassung 3,
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
sich rein rechnerisch für ein 100-LP-Ziel: {dict(sorted(stk.items()))} Treffer bis
null LP. Nur 62/109 liegen dabei im bisherigen 3–4-Treffer-Ziel. Dieser Quotient
enthält keine DoT-Ticks, Pausen, Magazinengpässe, Deckung, zielendes Spiel oder
Utilitykosten und ist keine gemessene Killzeit. 16 Waffen überschreiten in
mindestens einer Klassenpaarung die natürlichen Ziel-LP bereits mit dem direkten
Probetreffer; darunter befinden sich erwartbare Ultimates. Daraus folgt kein
pauschaler Nerf und kein automatischer Nachweis einer neu durch F15 eingeführten Regression.

| Kategorie | Waffen | Selbstwirkungen | Median direkter Besttreffer, inkl. Nullproben |
|---|---:|---:|---:|
'''
summary += '\n'.join(f'| {c} | {n} | {s} | {fmt(m)} |' for c, n, s, m in categories)
summary += '''

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
'''
(OUT / 'BERICHT.md').write_text(summary)

details_md = ['# Alle 150 Waffen · Einzelprüfung\n', 'Messgrenzen stehen im Hauptbericht. D0 = bester direkt zugerechneter Probetreffer, DoT = Tickereignisse derselben Probe. Keine Winrate.\n', '| ID | Name | Rolle | D0 | DoT | Frischmunition | CD Katalog | Sichtbefund |', '|---|---|---|---:|---:|---:|---:|---|']
for w in weapons:
    c, s, v = w['current'], best(w), visuals[w['id']]
    details_md.append(f"| {w['id']} | {c['displayName']} | {s['route']} / {w['effect']['kind'] if w['effect'] else c['category']} | {fmt(s['directTargetDamage'])} | {fmt(dot(s))} | {fmt(w['freshAmmo'])} | {c['cooldown']} | {v['note']} |")
(OUT / 'EINZELPRUEFUNG-150.md').write_text('\n'.join(details_md) + '\n')

# Bilder sind in der Repoansicht relativ, im Export vollständig eingebettet.
manifest = json.loads((ROOT / 'src/client/assets/weapon-sprites/manifest.json').read_text())
atlases = {k: Image.open(ROOT / 'src/client/assets/weapon-sprites' / a['datei']).convert('RGBA') for k, a in manifest['atlanten'].items()}


def uri(raw, mime='image/png'):
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


def sprite_uri(w):
    entry = manifest['waffen'][w['id']]['held']
    x, y, width, height = (entry[k] for k in ['x', 'y', 'w', 'h'])
    cell = atlases[entry['atlas']].crop((x, y, x + width, y + height))
    b = io.BytesIO()
    cell.save(b, format='PNG', optimize=True)
    return uri(b.getvalue())


css = '''*{box-sizing:border-box}body{margin:0;background:#111821;color:#edf1f6;font:16px/1.55 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:30px 22px}h1{font-size:clamp(30px,6vw,56px);line-height:1.06;letter-spacing:-.04em;margin:14px 0}h2{margin-top:40px;font-size:27px}h3{font-size:19px;color:#ffd38b}a{color:#80c9ff}p{max-width:95ch}.eyebrow{color:#efb45b;font-size:13px;letter-spacing:.13em;text-transform:uppercase}.muted{color:#aebaca}.panel,details.weapon,.task{border:1px solid #344456;background:#192330;border-radius:12px;padding:17px;margin:12px 0}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.stat{padding:18px;background:#243143;border-radius:10px}.stat b{display:block;font-size:32px;color:#ffd38b}.alert{border-left:4px solid #e6ac54;padding:14px 18px;background:#2b2a28}.controls{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;padding:12px;background:#111821;z-index:2}input,select{padding:13px;border:1px solid #516176;border-radius:8px;color:#fff;background:#1e2938;font-size:16px}input{flex:1;min-width:180px}summary{cursor:pointer;font-weight:650}summary img{vertical-align:middle;width:48px;height:48px;margin-right:12px;object-fit:contain}.tags{display:inline-block;color:#ffca78;font-size:12px;margin-left:10px}.row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.held{width:128px;height:128px;object-fit:contain;background:repeating-conic-gradient(#263445 0% 25%,#202c3a 0% 50%) 0/16px 16px}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.facts span{background:#223043;padding:10px;border-radius:6px}.facts small{display:block;color:#aab8ca}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#101722;border-radius:7px;padding:13px;font-size:12px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:8px;border-bottom:1px solid #3d4b5b;text-align:left}th{color:#aebaca}.table-scroll{overflow-x:auto}.sheet{width:100%;height:auto;margin-top:16px;border-radius:8px}.task b{color:#ffd38b}.notice{font-size:14px;color:#b5c1cf}nav a{display:inline-block;margin:8px 15px 8px 0}.pill{background:#3b3021;border:1px solid #7d6748;border-radius:30px;padding:4px 9px;font-size:12px}.hidden{display:none}footer{margin-top:40px;border-top:1px solid #3d4b5b;padding:20px 0;color:#aebaca}@media(max-width:600px){main{padding:20px 12px}.panel,details.weapon,.task{padding:12px}table{font-size:12px}.tags{display:block;margin-left:0}summary img{width:38px;height:38px}.controls{margin:0 -12px;padding:10px 12px}}'''


def render(standalone):
    h = ['<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProjectArmageddon · Waffenbalancing 150</title><style>' + css + '</style><main>',
         '<div class="eyebrow">ProjectArmageddon · Prüfstand 09.11.2026</div><h1>150 Waffen.<br>Bis zur einzelnen Wirkung.</h1>',
         '<p class="muted">Geprüfte Vorbereitung des Waffenbalancings: Bilder, echte Schüsse, Klassen, Flächenradien, Status und Ressourcen. Keine Spielwerte verändert.</p>',
         '<div class="stats"><div class="stat"><b>150/150</b>individuell gesichtet</div><div class="stat"><b>1.606</b>Schüsse / Anwendungen</div><div class="stat"><b>1.392</b>Bodenversuche</div><div class="stat"><b>17</b>Arbeitspakete</div></div>',
         '<nav><a href="#befunde">Befunde</a><a href="#methode">Messung & Grenzen</a><a href="#waffen">150 Einzelkarten</a><a href="#bilder">Kontaktbögen</a><a href="#plan">Umsetzung</a></nav>',
         '<p class="alert">Vor dem Feintuning zuerst den Mechanik- und Messvertrag bereinigen: 33 versteckte Flächenradien, 25 Strahlwaffen ohne Klassenfaktor und alte Archetypenboni in neuen Klassen. Statische Sichtprüfung durchgeführt; Browser-/Touchfreigabe weiterhin offen.</p>',
         '<section id="befunde"><h2>Die entscheidenden Befunde</h2>']
    for task in plan[:7]:
        h.append(f'<article class="panel"><h3>{e(task["id"])} · {e(task["title"])}</h3><p>{e(task["implementation"])}</p><p class="notice">Beleg: {e(task["evidence"])}</p></article>')
    h += ['</section><section id="methode"><h2>Was die Zahlen aussagen</h2>',
          f'<p>Basiscommit <code>{e(data["sourceCommit"])}</code>. Waffen 15 · Klassen 3 · Schaden 2 · Wind 2 · Bodenobjekte 5. Neue Klassen haben nachweislich 130 / 100 / 70 LP.</p>',
          '<p>112 Angriffswaffen und 38 Selbstwirkungen. 87 tatsächliche Projektilpfade und 25 Strahlpfade. Jede Angriffswaffe wurde gegen ein festgehaltenes Luftziel auf 30, 90, 250, 600 und 1200 px sowie in neun Klassenpaarungen geschossen. 109 treffen im endlichen Suchgitter. Die drei Nullproben Feldmörser, Meteorbrocken und Haubitze brauchen eigene Boden-/Anflugfälle; sie sind deshalb nicht als kaputt eingestuft.</p>',
          '<p>Zusätzlich: 1392 Bodenversuche auf zwei Seeds, 1338 angenommen, 54 Sichtlinienablehnungen. 169 Selbsttreffer, 0 Tode, maximal 28 Eigenschaden bei 70 Ausgangs-LP. Das belegt diese Fälle, keine allgemeine Garantie. Nachschub wurde je zehnmal ohne Kistenfunde verwendet.</p>',
          '<div class="alert">Das 1000-LP-Messziel verhindert abgeschnittene Direktwerte, verändert aber den 20%-DoT-Deckel. Besttreffer, Tickschaden und Gesundheitsverlust sind deshalb getrennt. Keine Zahlen hier sind Winrates oder echte gemessene Killzeiten. Figurenbewegung und Deckung sind im Luftzielaufbau isoliert. Bewegungs-/Aufstellnutzen ist damit nicht vollständig abgenommen.</div>',
          '<div class="table-scroll"><table><tr><th>Kategorie</th><th>Waffen</th><th>Selbst</th><th>Median D0</th></tr>']
    h += [f'<tr><td>{e(c)}</td><td>{n}</td><td>{s}</td><td>{fmt(m)}</td></tr>' for c, n, s, m in categories]
    h += ['</table></div>', f'<p>Direktes 100-LP-Rechenmodell für 109 Trefferwaffen: {e(dict(sorted(stk.items())))} (Trefferzahl: Waffenanzahl). 62/109 liegen im bisherigen 3–4-Treffer-Ziel; DoT, Kontrolle, Munition, Pausen und Deckung fehlen diesem einfachen Modell.</p>',
          '<p>38 Selbstwirkungen bekommen eigene Nutzgrößen. Aktuelle Frischmunition: 9 unbegrenzt, 73 mit 3, 48 mit 2 und 20 mit 1 Ladung. Bei 110 Waffen wäre der alte maxAmmo-Wert als aktuelle Munitionsbilanz falsch.</p>',
          '<p>2422/2422 Unit-Tests bestanden, keine übersprungen. Statische Bildprüfung ist keine Freigabe der laufenden Animation. Chromium kann hier wegen System-Socket-EPERM nicht starten; E2E, Safari und Touch bleiben offen.</p></section>',
          '<section id="waffen"><h2>Jede einzelne Waffe</h2><p class="notice">D0: direkt dem Schützen zugerechnete Schadensereignisse der gewählten Bestprobe. DoT: tatsächliche Tickereignisse derselben Probe; nicht zusätzlich zum Gesamt-LP-Verlust addieren. Die beste Distanz ist die beste der fünf getesteten, keine globale Reichweite. CD ist Katalogpause, keine gemessene Zeit bis Kill.</p>',
          '<div class="controls"><input id="search" aria-label="Waffe oder Befund suchen" placeholder="ID, Name oder Befund suchen…"><select id="category" aria-label="Kategorie"><option value="">Alle Kategorien</option>' + ''.join(f'<option>{e(c)}</option>' for c in cats) + '</select><select id="mode" aria-label="Rolle"><option value="">Alle Rollen</option><option value="selbst">Selbstwirkung</option><option value="projektil">Projektil</option><option value="strahl">Strahl</option></select></div><p id="count" class="notice">150 Waffen sichtbar</p>']
    for w in weapons:
        c, s, v = w['current'], best(w), visuals[w['id']]
        menu_path = ROOT / 'src/client/assets/icons' / (Path(c['icon']).stem + '_icon.png')
        menu = uri(menu_path.read_bytes()) if standalone else '../../src/client/assets/icons/' + menu_path.name
        held = sprite_uri(w)
        gcases = ground.get(w['id'], {}).get('cases', [])
        class_rows = ''.join(f'<tr><td>{e(r["attackerClass"])}</td><td>{e(r["targetClass"])}</td><td>{fmt(r["directTargetDamage"])}</td><td>{fmt(dot(r))}</td><td>{r["targetNaturalHP"]}</td></tr>' for r in w['classes'])
        dist_rows = ''.join(f'<tr><td>{r["distance"]}</td><td>{fmt(r["directTargetDamage"])}</td><td>{fmt(dot(r))}</td><td>{fmt(r["totalTargetHealthLoss"])}</td><td>{e(r["ok"])}</td></tr>' for r in w['distances'])
        title = f'{w["id"]} · {c["displayName"]}'
        tags = ', '.join(v['tags']) or 'Kein grober statischer Identitäts-/Ankerfehler markiert'
        fulltext = ' '.join([title, c['category'], v['note'], tags, c['description']]).lower()
        h += [f'<details class="weapon" data-search="{e(fulltext)}" data-category="{e(c["category"])}" data-mode="{e(s["route"])}"><summary><img loading="lazy" src="{menu}" alt="Menü-Icon {e(c["displayName"])}">{e(title)}<span class="tags">{e(tags)}</span></summary>',
              f'<div class="row"><img class="held" loading="lazy" src="{held}" alt="Unverändertes Handbild {e(c["displayName"])}"><div><p><b>Sichtbefund:</b> {e(v["note"])}</p><p class="notice">Statisch manuell gesichtet · Kontaktbogen {v["sheet"]}/10 · Laufzeitfreigabe offen</p></div></div>',
              f'<p>{e(c["description"])}</p><div class="facts"><span><small>Pfad / Kategorie</small>{e(s["route"])} / {e(c["category"])}</span><span><small>Schaden aktuell / Basis</small>{c["damage"]} / {w["base"]["damage"]}</span><span><small>D0 / DoT der Bestprobe</small>{fmt(s["directTargetDamage"])} / {fmt(dot(s))}</span><span><small>Bestprobe auf Distanz</small>{s["distance"]} px</span><span><small>Frischmunition / CD</small>{fmt(w["freshAmmo"])} / {c["cooldown"]}</span><span><small>Radius Katalog / Spawn</small>{c["blastRadius"]} / {s["spawned"]["blastRadius"] if s["spawned"] else "—"}</span></div>',
              f'<p><b>Nutzen-/Spezialparameter:</b> {e(json.dumps(w["effect"] or w["elemental"] or {}, ensure_ascii=False))}</p>']
        if w['self']:
            h += [f'<p><b>Echte Anwendung:</b> {e(json.dumps(s["special"], ensure_ascii=False))}. Frischmunition {fmt(s["ammoBefore"])} → {fmt(s["ammoAfter"])} nach Beobachtungsfenster. Diese Einzelprobe beweist keine vollständige Mobilitäts-, Schutz- oder Nachschubökonomie.</p>']
        if gcases:
            h += [f'<p><b>Bodenprobe:</b> {sum(r["ok"] for r in gcases)}/16 angenommen · {sum(r["selfDamage"] > 0 for r in gcases)} Selbsttreffer · max. {fmt(max(r["selfDamage"] for r in gcases))} Eigenschaden · {sum(not r["alive"] for r in gcases)} Tode.</p>']
        if not w['self'] and s['directTargetDamage'] == 0:
            h += ['<p class="alert">Kein Zielschaden in diesem Luftzielgitter. Passende Boden-/Anflugprobe fehlt; keine Defekt- oder Balancefreigabe.</p>']
        h += ['<h3>Distanzproben</h3><div class="table-scroll"><table><tr><th>px</th><th>D0</th><th>DoT</th><th>gesamter LP-Verlust</th><th>angenommen</th></tr>' + dist_rows + '</table></div>']
        if class_rows:
            h += ['<h3>Alle neun Klassenpaarungen</h3><div class="table-scroll"><table><tr><th>Angreifer</th><th>Ziel</th><th>D0</th><th>DoT</th><th>natürliche Ziel-LP</th></tr>' + class_rows + '</table></div>']
        evidence = {'current': c, 'versionChanges': w['changes'], 'selectedShot': s, 'radialComponentProbe': w['radial']}
        h += ['<details><summary>Parameter und vollständiger Ereignisbeleg der Bestprobe</summary><pre>' + e(json.dumps(evidence, ensure_ascii=False, indent=2)) + '</pre></details></details>']
    h += ['</section><section id="bilder"><h2>Alle zehn Sichtprüfbögen</h2><p>Grün: deklarierter Griff. Rot: deklarierte Wirkspitze. Geometrisch gültige Punkte können semantisch falsch liegen. Menü klein/groß, Atlas-Icon, Hand und vorhandenes Geschoss direkt nebeneinander.</p>']
    for n in range(1, 11):
        name = f'sichtpruefung-{n:02}.jpg'
        src = uri((OUT / name).read_bytes(), 'image/jpeg') if standalone else name
        h += [f'<details><summary>Prüfbogen {n}/10 · Waffen {(n-1)*15+1}–{n*15}</summary><img class="sheet" loading="lazy" src="{src}" alt="Sichtprüfung Waffen {(n-1)*15+1} bis {n*15}"></details>']
    h += ['</section><section id="animationen"><h2>Alle 26 Zusatzanimationen</h2><p>Erneute statische Sichtung der unveränderten Übersichten. Die Produktanbindung und Laufzeitabnahme fehlen.</p>']
    for a in load('animationen-26.json'):
        h += [f'<article class="panel"><b>{e(a["id"])}</b><p>{e(a["note"])}</p></article>']
    for n in [1, 2, 3]:
        name = f'weapon-animations-{n}.jpg'
        source = ROOT / 'docs/waffen-audit-2026-11-08' / name
        src = uri(source.read_bytes(), 'image/jpeg') if standalone else '../waffen-audit-2026-11-08/' + name
        h += [f'<details><summary>Animationsübersicht {n}/3</summary><img class="sheet" loading="lazy" src="{src}" alt="Statische Animationsübersicht {n}"></details>']
    h += ['</section><section id="plan"><h2>Konkrete Umsetzung in 17 Paketen</h2><p>Dies ist der unveränderliche Auditvorschlag. Fortschritt wird ausschließlich in TODO-SSOT gepflegt. Erst Korrektheit und Messvertrag, dann Stärkeänderungen.</p>']
    for t in plan:
        h += [f'<article class="task"><b>{e(t["id"])} · {e(t["priority"])}</b><h3>{e(t["title"])}</h3><p>{e(t["implementation"])}</p><p><b>Abnahme:</b> {e(t["acceptance"])}</p><p class="notice">Voraussetzungen: {e(", ".join(t["dependsOn"]) or "keine")}<br>Beleg: {e(t["evidence"])}</p></article>']
    h += ['</section><footer>Auditbasis ' + e(data['sourceCommit']) + ' · 09.11.2026 · Statische Einzelprüfung und reproduzierbare Engineproben. Keine Winrate-/Browser-/Vollbalancefreigabe.</footer></main>',
          '''<script>const fields=['search','category','mode'].map(x=>document.getElementById(x));function filter(){const [q,c,m]=fields.map(x=>x.value.toLowerCase());let n=0;for(const w of document.querySelectorAll('.weapon')){const show=(!q||(/^pa_[0-9]{3}$/.test(q)?w.dataset.search.startsWith(q+' ·'):w.dataset.search.includes(q)))&&(!c||w.dataset.category===c)&&(!m||w.dataset.mode===m);w.hidden=!show;if(show)n++;}document.getElementById('count').textContent=n+' Waffen sichtbar';}fields.forEach(x=>x.addEventListener('input',filter));</script></html>''']
    return '\n'.join(h)


(OUT / 'index.html').write_text(render(False))
if args.standalone:
    args.standalone.parent.mkdir(parents=True, exist_ok=True)
    args.standalone.write_text(render(True))

readme = '''# Waffenbalancing · Vorbereitung 09.11.2026

- [Hauptbericht](BERICHT.md) mit Methodik, Messgrenzen und Ergebnis.
- [150 Einzelprüfungen](EINZELPRUEFUNG-150.md).
- [Filterbarer Bericht](index.html); relative Bilder benötigen den Repositorybaum.
- `massnahmen-17.json`: Umsetzungsvorschlag mit Abhängigkeiten und Abnahmen.
- Status ausschließlich in `../TODO-SSOT.md` unter `BAL-2026-11-09` pflegen.

Rohdaten und Wiederholungsbefehle stehen im Hauptbericht. Die Tools ändern keine
Produktregeln. Erst Regel-/Messfehler bereinigen, dann eine neue Balancefassung
mit Vorher/Nachher-Nachweis implementieren. Statische Sichtprüfung ersetzt keine
Browser-/Animationsabnahme.
'''
(OUT / 'README.md').write_text(readme)
print('Bericht, 150 Einzelkarten und 17 Arbeitsaufträge erzeugt.')
