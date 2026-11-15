# N-18: pa_119 Balance-Sweep Analyse

## Ergebnis

**pa_119 (Munitionskiste) WIRKT** - die Waffe funktioniert korrekt.

## Detailanalyse

### Waffendefinition (weapons.js)
- **ID**: pa_119
- **Name**: Munitionskiste
- **special**: "ammo_drop" (Stringwert, gemappt in SPECIAL_EFFECTS)
- **damage**: 0
- **elemental**: { fire: 0, ice: 0, poison: 0 } (keine Elementarschäden)
- **delivery**: "hitscan"
- **strikeStyle**: "self" (selbstwirkende Waffe)

### Effekt-Mapping (specials.js)
```
ammo_drop: { kind: EFFECT_KIND.AMMO }
```

EFFECT_KIND.AMMO ist in SELF_TARGET_KINDS enthalten, also ist es eine gültige Selbstwirkung.

### Fassung 10 Werte (waffen-f10.js, Zeile 318)
```javascript
pa_119: wirk({ amount: 2 }), // Munitionskiste: klein
```

Die Waffe hat die `wirkung: { amount: 2 }` in Fassung 10+, was bedeutet:
- Stößt +2 Munition nach (Standardwert in Fassung 11 war +3)

### Balance Sweep Ergebnis
```
Schaden am Ziel: 0 Waffen
Selbstwirkung  : 1 Waffen (1 wirkt nachweislich, 0 nicht)
wirkt          ammo            common    Munitionskiste
```

Die Waffe wird korrekt als ammo-Effekt erkannt und wirkt.

## Testergebnisse

Alle Tests bestehen, einschließlich:
- `tests/specials.test.js` - "Die meisten zuvor wirkungslosen Waffen haben jetzt eine Wirkung"
- Test enthält pa_119 in der erwarteten Liste von Waffen mit funktionierender Wirkung

## Audit-File (erstaktionsprobe-150.json)

pa_119 hat im Audit:
```json
"special": { "kind": "ammo", "restored": 2 }
```

Das entspricht dem Wirkungswert 2 aus Fassung 10.

## Historischer Kontext

Laut `n18-selbstwirksame-waffen.md` (Zeile 152):
> Messung in `ki-im-betrieb` / `balance:sweep`. Kandidat: Waffe mit `special:` ohne Wirkung UND `damage: 0` UND kein `elemental` UND keine `wirkung` in Fassung 10+.

**Fazit**: pa_119 hat:
- ✅ `special: "ammo_drop"` - ETWAS Wirkung
- ✅ `damage: 0` - kein Schaden
- ✅ kein `elemental` - keine Elementarschäden
- ✅ `wirkung: { amount: 2 }` in Fassung 10+

Die Waffe erfüllt alle Kriterien für eine funktionierende Selbstwirkung und ist nicht "ohne Wirkung".

## Ursache für "1 von 150 Waffen wirkt nicht"?

Mögliche Erklärungen:
1. **Frühere Messung**: Das Ergebnis stammt aus einer früheren Balance-Sweep-Iteration, bevor die Wirkung korrekt implementiert wurde
2. **Fassung 11 vs 10**: Die Diskrepanz zwischen Standard-Wert (3) und Fassung 10 Wert (2) könnte Verwirrung stiften
3. **Testdurchführung**: Derzeit laufen alle Tests durch, also ist das Problem aktuell nicht mehr aktiv

## Empfehlung

pa_119 muss NICHT geändert werden - sie funktioniert korrekt als Munitionskiste mit AmmoEffekt. Falls die "1 von 150" Aussage bestätigt werden muss, sollte geprüft werden:
1. Welche exakte Balance-Sweep-Version diese Aussage erzeugt hat
2. Ob ein anderer Waffen-ID tatsächlich "ohne Wirkung" ist