# Starter auf „brain“ installieren — Anweisung für den Terminal-Agenten

Der **Starter** (`scripts/betrieb/starter/`) ist eine kleine Webseite mit Passwort-Login und drei Knöpfen
(Hochfahren, Status, Not-aus). Er ruft `scripts/betrieb/server-hochfahren.sh` und läuft auf dem
dauerhaft laufenden Linux-Rechner „brain“, nicht bei Hetzner. Stand: **gebaut und mock-getestet**
(`tests/betrieb-starter.test.js`), **nicht auf „brain“ installiert**. Welchen Weg ins Internet es gibt
und warum: `docs/zugang-www.md`.

Der Auftraggeber führt keine Befehle selbst aus. Er gibt seinem Terminal-Agenten auf „brain“ den
folgenden Text (alles zwischen den Strichen) und tippt nur das Passwort und das Hetzner-Token ein,
wenn der Agent danach fragt.

---

**Auftrag an den Terminal-Agenten auf „brain“: Starter für ProjectArmageddon einrichten**

Regeln, die immer gelten: Das Hetzner-Token und das Passwort **niemals** in eine Datei außerhalb von
`/etc/pa-starter/starter.env`, nie in Logs, nie in Commits, nie in die Chat-Ausgabe schreiben oder
wiederholen. Eingaben mit `read -rs` (verdeckt) holen. Kein `set -x`. Nichts bei Hetzner anlegen,
starten oder löschen — das tut der Starter erst, wenn der Auftraggeber im Browser auf „Hochfahren“ drückt.

1. **Voraussetzungen prüfen und berichten:** `node -v` (verlangt ≥ 22; sonst Node 22 LTS von nodejs.org
   mit Prüfsumme installieren), `git --version`, `python3 --version`, `curl --version`, `systemctl --version`.
   `tailscale status` (nur zur Information).
2. **Benutzer und Code:**
   ```bash
   sudo useradd --system --home-dir /opt/pa-starter --shell /usr/sbin/nologin pa-starter || true
   sudo git clone --depth 1 https://github.com/kAInplanmusic/ProjectArmageddon /opt/pa-starter
   sudo chown -R root:root /opt/pa-starter && sudo chmod -R go-w /opt/pa-starter
   cd /opt/pa-starter && node --test tests/betrieb-starter.test.js   # muss grün sein
   ```
   (Das Repo ist öffentlich lesbar. `node --test` braucht keine Installation von Paketen für diese Datei.)
3. **Umgebungsdatei anlegen** (Rechte 0600, Besitzer root). Den Auftraggeber verdeckt nach dem
   **Hetzner-Projekt-API-Token** und einem **Passwort** (mindestens 10 Zeichen) fragen:
   ```bash
   sudo install -d -m 700 /etc/pa-starter
   read -rs -p "Hetzner-Token: " TOK; echo
   read -rs -p "Passwort für die Startseite: " PW; echo
   {
     printf 'HCLOUD_TOKEN=%s\n' "$TOK"
     printf '%s' "$PW" | node /opt/pa-starter/scripts/betrieb/starter/passwort-hash.mjs --geheimnis
     printf 'PA_STARTER_PORT=8787\nPA_STARTER_HOST=127.0.0.1\nPA_STARTER_PROXY=1\n'
     printf 'PA_DOMAIN=www.projectarmageddon.de\n'
   } | sudo tee /etc/pa-starter/starter.env >/dev/null
   unset TOK PW
   sudo chmod 600 /etc/pa-starter/starter.env && sudo chown root:root /etc/pa-starter/starter.env
   sudo stat -c '%a %U %n' /etc/pa-starter/starter.env     # erwartet: 600 root
   ```
   Die Datei danach **nicht** ausgeben. `PA_DOMAIN` nur setzen, wenn die DNS-Einträge aus
   `docs/zugang-www.md` schon stehen; sonst die Zeile weglassen (dann nutzt der Server
   `https://<IP-mit-Bindestrichen>.sslip.io`).
4. **systemd:**
   ```bash
   sudo cp /opt/pa-starter/scripts/betrieb/starter/pa-starter.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now pa-starter
   systemctl is-active pa-starter && curl -fsS http://127.0.0.1:8787/gesund
   ```
5. **Zugriff** (nur der erste Test, nur im eigenen Tailscale-Netz, ohne Portfreigabe im Heimnetz):
   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:8787
   tailscale serve status
   ```
   Die genannte `https://brain.<tailnet>.ts.net`-Adresse dem Auftraggeber nennen. **Kein**
   `tailscale funnel` einschalten, solange nicht entschieden ist (siehe `docs/zugang-www.md`):
   Funnel macht die Seite für das ganze Internet erreichbar.
6. **Test mit dem Auftraggeber:** Im Browser (iPhone im Tailscale-Netz) die Adresse öffnen, falsches
   Passwort (muss abgelehnt werden), richtiges Passwort, Knopf **Status** (zeigt „Server: 0“ oder den
   laufenden Server). **Hochfahren** nur drücken, wenn der Auftraggeber es ausdrücklich will (Kosten:
   Cent-Beträge pro Stunde, der Server löscht sich nach 15 Minuten ohne Verbindung selbst).
7. **Bericht an den Auftraggeber:** was installiert wurde, `systemctl status pa-starter` (ohne
   Umgebung), die Adresse, und dass die Datei `/etc/pa-starter/starter.env` Token und Hash enthält
   (Rechte 600). Passwort ändern: Schritt 3 wiederholen (nur die Hash-Zeile), `systemctl restart pa-starter`.
   Aktualisieren: `cd /opt/pa-starter && sudo git pull --ff-only && sudo systemctl restart pa-starter`.

---

## Was der Starter schützt — und was nicht

- Passwort (scrypt-Hash, nie das Passwort), zeitkonstanter Vergleich, Sperre nach 5 Fehlversuchen je
  Adresse für 15 Minuten, globales Limit, Sitzung 12 h, Cookie `HttpOnly`/`SameSite=Strict`/`Secure`
  hinter https, CSRF-Wert je Sitzung, ein Auftrag gleichzeitig, kein Shell-Aufruf (Argumentliste).
- Das Token liegt nur in der Umgebungsdatei und im Kindprozess des Skripts.
- **Nicht** geschützt: der Spielserver selbst. Er ist unter seiner IP/Domain öffentlich (Caddy, TLS);
  der Login schützt den **Start**, nicht die Spielverbindung (`docs/zugang-www.md`, Abschnitt Risiken).
- Nicht auf „brain“ geprüft: Installation, Tailscale, Erreichbarkeit — nur die Logik per Mock-Test.
