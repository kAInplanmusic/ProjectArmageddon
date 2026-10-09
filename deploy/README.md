# deploy/ — Betriebsvorbereitung, kein Betrieb

Hier liegt, was für eine **gemietete** Instanz vorbereitet ist. Es ist
**nicht installiert** und läuft **nirgends**: Dieses Verzeichnis ist eine
Dateiablage, kein Dienst (AGENTS.md §5 — „Eine Datei im Repo ist kein
laufender Dienst").

| Datei | Was es ist |
|---|---|
| `systemd/projectarmageddon.service` | Vorlage: startet `scripts/betrieb/server-start.sh` als systemd-Dienst |
| `systemd/projectarmageddon-idle.service` | Vorlage: ein Durchlauf der Idle-Bremse (systemd-Timer ruft sie) |
| `systemd/projectarmageddon-idle.timer` | Vorlage: ruft die Bremse jede Minute — auch ohne offene SSH-Sitzung |
| `betrieb.env.example` | Vorlage der Betriebsparameter; Werte, die eine Entscheidung sind, stehen als `LÜCKE` |

Die Skripte dazu liegen in `scripts/betrieb/`:

| Datei | Was es tut |
|---|---|
| `scripts/betrieb/server-start.sh` | startet `npm run server` **und** die Idle-Bremse; `--print-config` zeigt alle Abschaltparameter, ohne zu starten |
| `scripts/betrieb/idle-watch.sh` | die Bremse selbst: Leerlauf, Serverlaufzeit, Maschinenlaufzeit |
| `scripts/betrieb/snapshot-einrichten.sh` | einmalige Einrichtung der Sicherung auf dem Knoten (prüft das Hetzner-Token, schreibt `betrieb.env`) |
| `scripts/betrieb/snapshot.sh` | Sicherung bei jedem Stopp (Archiv, optional Hetzner-Abbild); behält die neuesten 3 — `docs/betrieb.md` Abschnitt 8 |

## Ohne gemieteten Knoten prüfbar

```bash
bash -n scripts/betrieb/server-start.sh       # Syntax
bash -n scripts/betrieb/idle-watch.sh
scripts/betrieb/server-start.sh --print-config
scripts/betrieb/idle-watch.sh --print-config
scripts/betrieb/snapshot.sh --print-config
bash -n scripts/betrieb/snapshot.sh
```

## Bevor irgendetwas gemietet wird

AGENTS.md §5 verlangt drei Dinge, **vor** der Miete:

1. Eintrag in `docs/betrieb-INSTANZ.md` (Name, Zweck, Preis pro Stunde, Besitzer)
2. eine Abschaltung, die ohne Zutun greift (die Idle-Bremse hier)
3. den **Nachweis**, dass sie läuft — die *Ausgabe* von `systemctl list-timers`
   auf dem Knoten, eingetragen in `docs/betrieb-INSTANZ.md`

Die Belegbefehle stehen in `docs/betrieb-INSTANZ.md`, Abschnitt „Nachweis".
