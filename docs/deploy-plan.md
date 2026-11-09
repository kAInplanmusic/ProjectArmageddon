# Deploy-Plan — ProjectArmageddon auf einem Knoten

**Stand:** 2026-11-04 · **Version im Repo:** `0.9.0` · **Status:** umsetzbar vorbereitet,
**nichts gemietet, nichts installiert, nichts gestartet** (AGENTS.md §5).

Dieses Dokument ist der Weg vom Repo bis zum laufenden, öffentlich erreichbaren Spiel auf
**einem** Knoten — mit Rückweg. Es wiederholt nicht, was schon steht, sondern verweist:

| Thema | Steht in |
|---|---|
| Umgebungsvariablen des Servers, Persistenz, Sicherheitsstand | `docs/betrieb.md` Abschnitte 1–3 |
| Idle-Bremse, Scharfschaltung, Nachweisplatz (§5) | `docs/betrieb-INSTANZ.md` |
| Snapshot beim Stopp, Hetzner-Abbild, Token-Regeln | `docs/betrieb.md` Abschnitt 8 |
| Befehlsblatt für die erste Probe auf einem gemieteten Knoten (Z246) | `docs/probe-knoten-und-hardware.md` |
| Dateiablage `deploy/` | `deploy/README.md` |

Alle Befehle mit Wirkung auf einen Knoten führt der **Betreiber** aus. Ein Agent mietet,
erstellt oder startet nichts (AGENTS.md §5); Preise und Besitzer trägt nur der Auftraggeber ein
(§7). Platzhalter heißen hier **„vom Auftraggeber festzulegen"**.

---

## 1. Zielbild

```
Spieler (Browser)
   │  https://<DOMAIN>/        wss://<DOMAIN>/ws
   ▼
┌──────────────────────────── Knoten (ein Rechner) ───────────────────────────┐
│ ufw: nur 22/tcp (SSH) und 80,443/tcp offen                                 │
│                                                                             │
│ Caddy :443  ── TLS (Let's Encrypt), Sicherheits-Header, Kompression         │
│   │           /healthz nach außen gesperrt                                  │
│   ▼ reverse_proxy (auch WebSocket-Upgrade)                                  │
│ Node-Server 127.0.0.1:3000  (systemd: projectarmageddon.service, User pa)   │
│   ├─ /            Oberfläche aus dist/ (single-origin)                      │
│   ├─ /api/lobby…  Lobby-API                                                 │
│   ├─ /ws          Spielverkehr (autoritativ)                                │
│   └─ /healthz     Gesundheit + Version (nur lokal: Bremse, Smoke-Test)      │
│                                                                             │
│ /opt/projectarmageddon/current → releases/<kennung>   (Programm, nur lesen) │
│ /var/lib/projectarmageddon/    lobbies.json, sicherungen/, snapshots/       │
│ projectarmageddon-idle.timer   Idle-Bremse jede Minute (§5 Punkt 2)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Ein Ursprung:** Oberfläche, API und WebSocket unter derselben Domain — kein CORS-Spiel, eine
  TLS-Konfiguration. Der Client verbindet sich relativ (`new URL('/ws', …)`).
- **Spielport nie öffentlich:** `HOST=127.0.0.1` (Vorgabe im Server, in der Einheit und im
  Startskript). Öffentlich ist nur Caddy.
- **Kein Container nötig:** Der Hauptweg ist systemd + Release-Paket. Container ist eine Option
  (Abschnitt 11).

## 2. Voraussetzungen

**Vom Auftraggeber (vor allem anderen):**

1. Entscheidungen aus Abschnitt 15 (Anbieter, Domain, Preis, Besitzer, Konten ja/nein, Container ja/nein).
2. Eintrag in `docs/betrieb-INSTANZ.md` Abschnitt 1 (Name, Zweck, Preis pro Stunde, Besitzer) und die
   Kostenrechnung nach §7 (Abschnitt 13 hier).
3. DNS: ein A-/AAAA-Eintrag `<DOMAIN>` → öffentliche Adresse des Knotens.

**Auf dem Knoten** (Linux mit systemd; geprüft sind die Skripte gegen bash 5, GNU tar, GNU coreutils):

| Was | Warum | Prüfen mit |
|---|---|---|
| Node.js 22 (wie CI, `engines.node >=22`) | Server, Smoke-Test, Paketprüfung | `node -v` |
| npm | `npm ci --omit=dev` beim Deploy | `npm -v` |
| Caddy 2 | TLS + Reverse-Proxy | `caddy version` |
| ufw (oder nftables) | Firewall | `ufw status` |
| `sha256sum`, `tar`, `curl`, `ss` (iproute2) | Paketprüfung, Bremse | — |
| Benutzer `pa` ohne Anmeldung | Dienst läuft nicht als root | `id pa` |

**Lokal (Bau-Rechner oder CI):** Node 22, Arbeitsbaum ohne Änderungen, `npm ci`.

## 3. Versionen, Tags, Kennung

- **SemVer.** `package.json` steht auf **`0.9.0`**: Das Spiel ist inhaltlich vollständig und
  läuft als Server mit Persistenz, Bremse und Rückweg — aber ohne Konten/Anmeldung (Abschnitt 12),
  ohne gemessene Lastgrenze und ohne echte Probe auf einem Knoten (Z246). Das ist ein
  Vorabstand vor `1.0.0`. `1.0.0` ist sinnvoll, wenn mindestens die Go-Punkte in Abschnitt 14
  auf einem echten Knoten belegt sind. Vorher: `0.MINOR` für neue Fassungen (Regeln, Protokoll,
  Persistenzformat), `0.x.PATCH` für reine Korrekturen.
- **Tag-Konvention:** annotierter Tag `v<version>` auf einem Commit von `main`, der genau diese
  Version in `package.json` trägt — z. B. `git tag -a v0.9.0 -m "Release 0.9.0"` und
  `git push origin v0.9.0`. Die CI (Job `release-paket`) bricht ab, wenn Tag und Version
  auseinanderlaufen, und legt Archiv + Prüfsumme als Artefakt `release-v0.9.0` ab (90 Tage).
  **Tags setzt der Auftraggeber oder ein ausdrücklich beauftragter Mensch** — dieses Repo und
  seine Agenten erstellen und pushen keine Tags.
- **Kennung eines Builds:** `<version>-<git7>`, z. B. `0.9.0-2413c4f`. Sie steht in
  `dist/version.json`, im Menü-Fuß des Clients (`v0.9.0 · 2413c4f · <Bauzeit> UTC`), in
  `/healthz` (`version`, `build.gitSha`) und im Paketnamen. Ein Build aus einem Arbeitsbaum mit
  Änderungen trägt `-geaendert` und wird von `paket.mjs` ohne `--erlaube-geaendert` verweigert.

## 4. Verzeichnisaufbau auf dem Knoten

```
/opt/projectarmageddon/                 root:root 755 (Programm, für pa nur lesbar)
  releases/0.9.0-2413c4f/               ein entpacktes Paket (+ node_modules aus npm ci)
  releases/0.9.1-…/
  current -> releases/0.9.1-…           atomar umgehängt von deploy.sh / rollback.sh
  releases.log                          Zeit · Aktion · von · nach · Ergebnis
  scripts -> current/scripts            Bequemlichkeit: Pfade aus docs/betrieb*.md gelten weiter
  docs    -> current/docs
  deploy  -> current/deploy
/etc/projectarmageddon/betrieb.env      root:root 600 (Vorlage deploy/betrieb.env.example)
/etc/projectarmageddon/ist-gemietet     Marker: Bremse scharf (docs/betrieb-INSTANZ.md)
/var/lib/projectarmageddon/             pa:pa 700 (StateDirectory der Einheit)
  lobbies.json                          PA_STATE_PATH
  sicherungen/                          scripts/betrieb/sichern.sh (die neuesten 10)
  snapshots/                            scripts/betrieb/snapshot.sh beim Stopp (die neuesten 3)
```

## 5. Schritt für Schritt

### 5.1 Lokal: prüfen und Paket bauen

```bash
git switch main && git pull --ff-only
npm ci
npm test && npm run check:docs && npm run lint      # AGENTS.md §3
npm run build                                       # schreibt dist/version.json
npm run release:paket                               # → release/projectarmageddon-<kennung>.tar.gz (+ .sha256)
```

Oder das CI-Artefakt eines Tags herunterladen (Abschnitt 3). Was im Paket liegt und was
verweigert wird: Kopf von `scripts/release/paket.mjs`. Kurz: `dist/`, `src/server|engine|shared`,
`scripts/server.mjs`, `scripts/betrieb/`, `scripts/release/`, `deploy/`, `package*.json`,
Betriebsdokumente, `RELEASE.json` mit SHA-256 jeder Datei — **keine** Tests, kein `node_modules`,
kein Zustand, keine `.env`/Schlüssel (Geheimnis-Sperre bricht ab). Gleicher Build → gleiche
Prüfsumme.

### 5.2 Hochladen

```bash
scp release/projectarmageddon-<kennung>.tar.gz{,.sha256} <knoten>:/var/tmp/
ssh <knoten> 'cd /var/tmp && sha256sum -c projectarmageddon-<kennung>.tar.gz.sha256'
```

### 5.3 Knoten einmalig vorbereiten (nach der Miete, §5-Einträge vorhanden)

```bash
# Benutzer und Verzeichnisse
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pa
sudo install -d -m 755 /opt/projectarmageddon
sudo install -d -m 700 /etc/projectarmageddon

# Paket vorläufig entpacken, um an Vorlagen und Skripte zu kommen
mkdir -p /var/tmp/pa && tar -xzf /var/tmp/projectarmageddon-<kennung>.tar.gz -C /var/tmp/pa
P=/var/tmp/pa/projectarmageddon-<kennung>

# Betriebsparameter: LÜCKE-Felder ausfüllen (Abschnitt 12 für die Sicherheitszeilen)
sudo install -m 600 $P/deploy/betrieb.env.example /etc/projectarmageddon/betrieb.env
sudoedit /etc/projectarmageddon/betrieb.env

# systemd-Einheiten (Dienst, Bremse, Timer)
sudo cp $P/deploy/systemd/projectarmageddon.service \
        $P/deploy/systemd/projectarmageddon-idle.service \
        $P/deploy/systemd/projectarmageddon-idle.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/projectarmageddon*.service   # nach dem Deploy (Pfade existieren dann)
```

### 5.4 Erstes Deploy

```bash
sudo $P/scripts/release/deploy.sh --trocken /var/tmp/projectarmageddon-<kennung>.tar.gz   # zeigt nur
sudo $P/scripts/release/deploy.sh /var/tmp/projectarmageddon-<kennung>.tar.gz
sudo systemctl enable projectarmageddon.service
```

`deploy.sh` (Kopf des Skripts): Prüfsumme → Archiv auf Pfadausbruch prüfen → entpacken nach
`releases/<kennung>` → `npm ci --omit=dev --ignore-scripts` → Spielstand sichern (`sichern.sh`)
→ `current` umhängen → `systemctl restart` → Smoke-Test → bei Rot **automatischer Rückfall**
auf das vorige Release → Aufräumen (die neuesten `PA_BEHALTEN=5` bleiben).
Rückgabe: 0 eingeführt · 1 rot, Rückfall grün · 2 Vorbedingung verletzt · 3 auch Rückfall rot.
`deploy.sh` und `rollback.sh` lesen `/etc/projectarmageddon/betrieb.env` (Port, `PA_STATE_PATH`,
Dienstname) wie die Einheit; Stellschrauben: `PA_BASIS`, `PA_BEHALTEN`, `PA_SMOKE_FRIST`,
`PA_SMOKE_OHNE_LOBBY` (Kopf von `scripts/release/gemeinsam.sh`).

### 5.5 Bremse scharf schalten und nachweisen (AGENTS.md §5 Punkt 2 und 3)

```bash
sudo touch /etc/projectarmageddon/ist-gemietet
sudo systemctl enable --now projectarmageddon-idle.timer
systemctl list-timers projectarmageddon-idle.timer          # AUSGABE → docs/betrieb-INSTANZ.md Abschnitt 3
/opt/projectarmageddon/current/scripts/betrieb/idle-watch.sh --print-config
```

Ohne diese Ausgabe in `docs/betrieb-INSTANZ.md` gilt die Instanz als unbewiesen und wird wieder
abgeschaltet. Beleg 4 dort (Probelauf mit kurzer Frist) gehört vor die erste bezahlte Stunde.

### 5.6 Reverse-Proxy und Firewall

Abschnitt 6. Reihenfolge (DEP-3): **erst Firewall, dann TLS**, dann öffentlich.

### 5.7 Folge-Deploys

```bash
tar -xzf /var/tmp/projectarmageddon-<neu>.tar.gz -C /var/tmp/pa
sudo /var/tmp/pa/projectarmageddon-<neu>/scripts/release/deploy.sh /var/tmp/projectarmageddon-<neu>.tar.gz
```

Immer das `deploy.sh` **aus dem neuen Paket** verwenden (es kennt dessen Aufbau). Ein Deploy
startet den Dienst neu: laufende Partien werden aus Seed + Eingaben wiederhergestellt
(`docs/betrieb.md` Abschnitt 2), verbundene Spieler müssen sich neu verbinden (im selben Tab:
„Letzte Sitzung fortsetzen"). **Deploys deshalb, wenn `/healthz` `sessions: 0` meldet**, oder angekündigt.

## 6. Reverse-Proxy (Caddy) und Firewall

**Firewall (ufw)** — zuerst, voraussetzungslos:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp            # SSH, mit Bremse gegen Durchprobieren
sudo ufw allow 80/tcp            # nur für die ACME-Prüfung und die Umleitung auf 443
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
# Gegenprobe von AUSSEN: Port 3000 muss geschlossen sein
nc -zv <knoten-ip> 3000          # erwartet: refused / timed out
```

Der Spielport 3000 braucht keine Regel: Er lauscht nur auf 127.0.0.1. Die Firewall ist die
zweite Schicht, falls jemand `HOST` ändert. Hat der Anbieter eine eigene Cloud-Firewall, dort
dieselben drei Ports — sie wirkt auch, wenn ufw versehentlich aus ist.

Statt der ufw-Befehle kann die geprüfte nftables-Vorlage `deploy/firewall.nft` eingespielt
werden (gleiche Ports, SSH-Bremse, `policy drop`; Achtung: `flush ruleset` entfernt auch
Docker-Regeln):

```bash
sudo nft -c -f /opt/projectarmageddon/current/deploy/firewall.nft
sudo install -m 600 /opt/projectarmageddon/current/deploy/firewall.nft /etc/nftables.conf
sudo systemctl enable --now nftables && sudo nft list ruleset
```

Die vollständige Reihenfolge mit Nachweisbefehlen (Firewall → TLS → Anmeldung →
Ratenbegrenzung): `docs/sicherheit-vor-oeffentlich.md`.

**Caddy:** Vorlage `deploy/Caddyfile.beispiel` (TLS automatisch, `/ws` durchgereicht, HSTS,
`nosniff`, `X-Frame-Options`, CSP erst als Report-Only, Kompression nur für Text, lange
Cache-Zeit nur für `/assets/*`, `/healthz` nach außen gesperrt, API-Körper ≤ 16 KB).

```bash
sudo install -m 644 /opt/projectarmageddon/current/deploy/Caddyfile.beispiel /etc/caddy/Caddyfile
sudo systemctl edit caddy        # [Service] Environment=PA_DOMAIN=<DOMAIN> PA_ACME_EMAIL=<kontakt>
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

nginx statt Caddy ist möglich (WebSocket: `proxy_http_version 1.1`, `Upgrade`/`Connection`-Header,
`proxy_read_timeout` hoch); es gibt dafür keine Vorlage, weil Caddy Zertifikate selbst holt.

## 7. Smoke-Tests nach dem Deploy

`deploy.sh` ruft sie selbst (`scripts/release/smoke.mjs`). Von Hand, auf dem Knoten:

```bash
node /opt/projectarmageddon/current/scripts/release/smoke.mjs \
  --url http://127.0.0.1:3000 --version 0.9.0 --gitsha 2413c4f
# OK healthz · OK version · OK gitSha · OK oberflaeche · OK websocket · OK lobby_anlegen · OK lobby_lesen
```

Von außen, nach Caddy (auf dem Bau-Rechner):

```bash
curl -sSI https://<DOMAIN>/ | grep -iE 'HTTP/|strict-transport|x-content-type'
curl -sS  https://<DOMAIN>/version.json                              # Kennung des ausgelieferten Builds
curl -sS -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/healthz   # erwartet 404 (am Proxy gesperrt)
node scripts/release/smoke.mjs --url https://<DOMAIN> --aussen --version 0.9.0 --gitsha 2413c4f
# OK version_json · OK version · OK gitSha · OK oberflaeche · OK websocket (wss, 101) · OK lobby_anlegen · OK lobby_lesen
```

Die tiefe Probe ist `scripts/betrieb/probe-spiel.mjs --url http://127.0.0.1:3000` auf dem Knoten
(Lobby, zwei WebSocket-Clients, Schüsse, Wiedereinstieg, danach `/healthz`). Sie fragt am Ende
`/healthz` ab und läuft deshalb gegen den lokalen Port, nicht gegen die öffentliche Domain.

## 8. Rollback

| Lage | Befehl |
|---|---|
| Smoke-Test nach Deploy rot | nichts — `deploy.sh` ist schon zurückgefallen (Exit 1, Eintrag `rueckfall` in `releases.log`) |
| Fehler fällt erst später auf | `sudo /opt/projectarmageddon/current/scripts/release/rollback.sh` (Vorgänger laut `releases.log`) |
| gezielt auf eine Version | `rollback.sh --auf 0.9.0-2413c4f` · Übersicht: `rollback.sh --liste` |
| neues Release hat den Spielstand unlesbar gemacht | `rollback.sh --mit-zustand neueste` (stoppt, spielt die Sicherung von vor dem Deploy zurück, startet) |
| erst zeigen, was passieren würde | jeweils `--trocken` |

Rollback ist ein Symlink-Umhängen + Neustart (Sekunden); die alten Releases liegen samt
`node_modules` bereit. Der Spielstand wird **nicht** automatisch zurückgedreht: Das Format hat
eine Versionsmarke (`src/server/persistence.js`, `PERSISTENCE_VERSION`); Partien sind
deterministisch aus Seed + Eingaben, alte Replays laufen unverändert (AGENTS.md §2). Nur wenn
ein Release die Persistenz-Version hebt, braucht ein Rollback `--mit-zustand`.

## 9. Sicherung und Wiederherstellung von `PA_STATE_PATH`

```bash
sudo -u pa /opt/projectarmageddon/current/scripts/betrieb/sichern.sh --grund "vor Wartung"
sudo /opt/projectarmageddon/current/scripts/betrieb/wiederherstellen.sh --liste
sudo systemctl stop projectarmageddon
sudo /opt/projectarmageddon/current/scripts/betrieb/wiederherstellen.sh --neueste --ja
sudo systemctl start projectarmageddon
```

- **sichern.sh:** Kopie in eine temporäre Datei im Sicherungsordner → JSON-Prüfung (kaputter Stand
  wird NICHT gesichert, ältere bleiben) → `sync` → atomar umbenennen in
  `lobbies-<UTC-Zeit>.json` + `.sha256` → die neuesten `PA_SICHERUNG_BEHALTEN` (Vorgabe 10) bleiben.
  `deploy.sh` ruft es vor jedem Umschalten.
- **wiederherstellen.sh:** prüft Prüfsumme und JSON, verweigert bei laufendem Dienst (der Server
  speichert alle 10 s und würde überschreiben), legt den jetzigen Stand als
  `vor-wiederherstellung-<Zeit>.json` beiseite, übernimmt Eigentümer/Rechte und ersetzt atomar.
- **Regelmäßig** (Empfehlung, nicht installiert): ein stündlicher systemd-Timer, der `sichern.sh`
  als `pa` ruft. Einheit analog zu `projectarmageddon-idle.timer` mit `OnCalendar=hourly`.
- **Außer Haus:** Sicherungen und Snapshots liegen auf demselben Knoten und überleben sein Löschen
  nicht (Z246 d). Kopie nach außen ist eine offene Entscheidung (Abschnitt 15).
- Die Snapshots beim Stopp (`snapshot.sh`, Journal + Programmstand + Zustand) bleiben daneben
  bestehen; in der Release-Ablage erfassen sie `RELEASE.json` statt eines git-Stands.

## 10. Logs und Überwachung

| Was | Wie |
|---|---|
| Server-Protokoll (JSON je Zeile, `LOG_FORMAT=json`) | `journalctl -u projectarmageddon -f` · Fehler: `journalctl -u projectarmageddon -p warning` |
| Bremse | `journalctl -u projectarmageddon-idle` · letzter Auslöser: `cat /var/lib/projectarmageddon/last-brake` |
| Deploys/Rollbacks | `/opt/projectarmageddon/releases.log` · `rollback.sh --liste` |
| Gesundheit + Version | `curl -s 127.0.0.1:3000/healthz` → `status`, `healthy`, `orphanedSessions`, `version`, `build`, Zähler |
| Proxy-Zugriffe | `/var/log/caddy/projectarmageddon.log` (JSON, 5 × 20 MiB) |
| Journalgröße | `/etc/systemd/journald.conf`: `SystemMaxUse=500M` (Empfehlung) |
| Platte | `df -h /var/lib/projectarmageddon /opt` — Releases (je ~110 MB mit dist) × `PA_BEHALTEN` |

**Von außen** (zweite, unabhängige Frist nach §7 und Erreichbarkeit): ein Überwachungsdienst des
Auftraggebers, der `https://<DOMAIN>/version.json` abfragt und den Besitzer benachrichtigt —
sowohl wenn die Seite fehlt als auch wenn sie **länger als die Höchstdauer** antwortet. Welcher
Dienst: Entscheidung des Auftraggebers. Bekannte Ereignisse im Protokoll: `docs/betrieb.md`
Abschnitt 5.

## 11. Option: Container (DEP-2)

`Dockerfile` (mehrstufig: Bau → nur Produktionsabhängigkeiten → Laufzeit als Benutzer `node`,
`HEALTHCHECK` auf `/healthz`, `node scripts/server.mjs` direkt für sauberes SIGTERM) und
`deploy/compose.yaml` (Port nur `127.0.0.1:3000`, Spielstand im Volume `/data`, schreibgeschützt,
`no-new-privileges`, alle Capabilities weg). Nicht gebaut; geprüft ohne Docker in
`tests/container-dateien.test.js`. Rollback = voriges Abbild-Tag (`PA_TAG=<alt> docker compose up -d`).

Die Bremse bleibt auf dem Host. Damit `idle-watch.sh` den Container stoppen kann, läuft Compose
als systemd-Dienst und `PA_SYSTEMD_UNIT` zeigt darauf (Vorlage, nicht im Repo installiert):

```ini
# /etc/systemd/system/projectarmageddon-compose.service
[Unit]
Description=ProjectArmageddon (Compose)
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=simple
WorkingDirectory=/opt/projectarmageddon/current
Environment=PA_TAG=0.9.0
ExecStart=/usr/bin/docker compose -f deploy/compose.yaml up --no-build
ExecStop=/usr/bin/docker compose -f deploy/compose.yaml stop -t 120
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

dazu in `betrieb.env`: `PA_SYSTEMD_UNIT=projectarmageddon-compose.service`. Hinter Caddy auf dem
Host kommt jede Verbindung über die Docker-Brücke: `PA_VERTRAUTE_PROXYS` auf deren Gateway-Adresse
setzen (`docker network inspect projectarmageddon_default`).

## 12. Sicherheits-Härtung

**In `/etc/projectarmageddon/betrieb.env` vor dem Öffnen von 443:**

| Variable | Wert | Wirkung |
|---|---|---|
| `HOST` | `127.0.0.1` | Spielport nur lokal (Vorgabe; Startskript bricht bei anderem Wert ohne `PA_ERLAUBE_OEFFENTLICH=yes` ab) |
| `PA_ERLAUBTE_ORIGINS` | `https://<DOMAIN>` | Lobby-API (CORS) und WebSocket nur von der eigenen Seite (SRV-4); fremde Origins 403 |
| `PA_EIGENER_ORIGIN` | `https://<DOMAIN>` | eigener Origin fest, `Host`-Header zählt nicht (Schutz vor DNS-Rebinding) |
| `PA_VERTRAUTE_PROXYS` | `127.0.0.1,::1` | Lobby-Limit je Adresse zählt den echten Client aus `X-Forwarded-For` (`src/server/clientAdresse.js`); ohne: alle Spieler = eine Adresse |
| `PA_MAX_LOBBYS` / `PA_LOBBYS_PRO_MINUTE` / `PA_LOBBY_LEER_MS` | 500 / 30 / 900000 (Vorgaben) | Gesamtdeckel (503), Anlegen je Adresse (429), Verfall leerer Lobbys |

**Was der Server schon begrenzt** (Code, durch Tests gehalten): WebSocket-Nachricht ≤ 64 KiB
(`maxPayload`, sonst Trennung), Steuernachricht ≤ 512 Byte (`src/shared/validation.js`),
Lobby-Körper ≤ 8 KiB (400), 30 Nachrichten/s je Verbindung mit Stoß 60, Trennung bei Dauerflut
(`src/server/rateLimit.js`), Eingaben validiert, Client-Autorität nur Winkel/Kraft, Socket-Fehler
abgefangen (AGENTS.md §6), Pfadausbruch aus `dist/` gesperrt.

**systemd** (`deploy/systemd/projectarmageddon.service`): eigener Benutzer, `ProtectSystem=strict`,
`ProtectHome`, `PrivateTmp/Devices`, `ProtectProc=invisible`, keine Capabilities,
`SystemCallFilter=@system-service`, `UMask=0077`, `MemoryMax=1G`, `TasksMax=256`.
`systemd-analyze security --offline=true` bewertet die Vorlage mit **1.5 (OK)**; die Bremse
(`-idle.service`, läuft als root, muss stoppen/abschalten können) mit 8.3 — bewusst.

**Was fehlt (ehrlich):**

1. **Anmeldung/Konten** — jeder, der die Seite erreicht, kann Lobbys anlegen und belegen.
   Entscheidung „öffentlich ohne Konten" oder „erst mit Konten" liegt beim Auftraggeber
   (Abschnitt 15). Ohne Konten: Zugang zumindest einschränken (Caddy `basic_auth` für eine
   geschlossene Testgruppe ist eine Zeile). Wege und Folgen: `docs/sicherheit-vor-oeffentlich.md` §3.
2. **Gleichzeitige WebSocket-Verbindungen je IP** — nicht begrenzt (weder Server noch Caddy-Kern).
   Gegenmittel bei Bedarf: nftables `ct count` je Quelladresse auf 443 oder ein Caddy-Modul.
3. **CSP** steht als Report-Only; scharf erst nach einer Probe ohne Verstöße in der Konsole.
4. **Lastgrenze** ungemessen (DEP-6): Die „~68 Matches"-Zahl ist eine Hochrechnung.

## 13. Kosten (AGENTS.md §7)

Vor **jedem** Lauf auf gemieteter Hardware steht in `docs/betrieb-INSTANZ.md` Abschnitt 1 —
hier nur die Rechnung, die dort ausgefüllt sein muss:

| Angabe | Wert |
|---|---|
| Anbieter, Typ, Region | vom Auftraggeber festzulegen |
| Preis pro Stunde | vom Auftraggeber festzulegen (aus dem Angebot, nie geschätzt) |
| Höchstdauer des Laufs | vom Auftraggeber festzulegen |
| **Worst Case** = Preis/h × Höchstdauer | vom Auftraggeber festzulegen (ohne diese Zahl kein Start) |
| Speicher für Abbilder/Snapshots (je GB und Monat) | vom Auftraggeber festzulegen |
| Domain/DNS | vom Auftraggeber festzulegen |
| Besitzer (Rechnung, Abschaltung) | vom Auftraggeber festzulegen |
| Frist auf dem Knoten | `PA_MAX_MACHINE_MINUTES` (heute leer = aus!), `PA_MAX_RUNTIME_MINUTES`, `PA_IDLE_MINUTES` |
| **Zweite, unabhängige Frist außerhalb des Knotens** | vom Auftraggeber festzulegen (z. B. Abrechnungsalarm beim Anbieter oder externe Überwachung, Abschnitt 10) |

Hinweis aus `docs/betrieb.md` Abschnitt 8: Bei Hetzner endet die Abrechnung erst mit dem
**Löschen** des Servers, nicht mit dem Ausschalten. `PA_ACTION=poweroff` allein beendet dort
keine Kosten.

## 14. Go/No-Go-Checkliste

**No-Go, solange einer dieser Punkte offen ist:**

- [ ] `docs/betrieb-INSTANZ.md` Abschnitt 1 vollständig (Name, Zweck, Preis/h, Besitzer) — §5.1
- [ ] Kostenrechnung (Abschnitt 13) vollständig, zweite Frist außerhalb eingerichtet — §7
- [ ] `PA_MAX_MACHINE_MINUTES` gesetzt; `PA_ACTION` entschieden
- [ ] Marker `/etc/projectarmageddon/ist-gemietet` + `projectarmageddon-idle.timer` aktiv,
      **Ausgabe** von `systemctl list-timers` in `docs/betrieb-INSTANZ.md` Abschnitt 3 — §5.2/5.3
- [ ] Beleg 4 (Probelauf, Bremse greift ohne Zutun) eingetragen

**Go für den Betrieb, wenn zusätzlich:**

- [ ] lokal grün: `npm test`, `npm run check:docs`, `npm run lint`, `npm run build`; CI grün auf dem Tag
- [ ] Paket aus sauberem Baum (keine `-geaendert`-Kennung), Prüfsumme auf dem Knoten bestätigt
- [ ] `deploy.sh` Exit 0, Smoke-Test 7× OK, `/healthz` meldet die erwartete Version
- [ ] Rollback einmal geübt: `rollback.sh --trocken`, dann echt und wieder vorwärts
- [ ] `sichern.sh` → `wiederherstellen.sh --trocken` auf dem Knoten durchgelaufen
- [ ] ufw aktiv; Port 3000 von außen geschlossen (Gegenprobe); 22/80/443 wie Abschnitt 6
- [ ] Caddy: gültiges Zertifikat, HSTS/nosniff im Kopf, `/healthz` außen 404, `wss://…/ws` verbindet
- [ ] `PA_ERLAUBTE_ORIGINS`, `PA_EIGENER_ORIGIN`, `PA_VERTRAUTE_PROXYS` gesetzt
- [ ] Entscheidung Anmeldung getroffen (Konten gebaut **oder** Zugang eingeschränkt **oder** bewusst offen)
- [ ] `smoke.mjs --aussen` gegen die Domain grün, `probe-spiel.mjs` auf dem Knoten grün; eine echte Partie mit Menschen (DEP-6)
- [ ] `systemd-analyze security projectarmageddon.service` auf dem Knoten ≤ 2.0

**Abbruchkriterien während des Betriebs:** Smoke-Test rot nach Rückfall (Exit 3), `healthy:false`
dauerhaft, Bremse löst nicht aus (`last-brake` bleibt alt trotz Leerlauf), Kosten über Worst Case →
Dienst stoppen, Knoten nach Entscheidung des Besitzers löschen.

## 15. Offene Entscheidungen des Auftraggebers

| Entscheidung | Optionen / Folgen |
|---|---|
| **Hosting-Anbieter, Typ, Region** | vom Auftraggeber festzulegen. Vorarbeit: `docs/betrieb.md` Abschnitt 4 (CPU reicht, keine GPU), `docs/skalierung.md` |
| **Domain** | vom Auftraggeber festzulegen; ohne Domain kein Let's-Encrypt-Zertifikat |
| **Preis/h, Höchstdauer, Besitzer** | vom Auftraggeber festzulegen (§7) |
| **Anmeldung/Konten ja/nein** | ja: eigener Auftrag (Konten, Speicherung, Datenschutz); nein: geschlossene Gruppe per `basic_auth` oder bewusst offen mit Limits aus Abschnitt 12 |
| **Container ja/nein** | nein (Empfehlung für einen Knoten): systemd-Weg ist vollständig; ja: Abschnitt 11, Docker auf dem Knoten nötig |
| **Kopie der Sicherungen nach außen** | Ziel (anderer Speicher/Anbieter) und Aufbewahrung festlegen (Z246 d) |
| **Wer löscht den Server nach dem Abbild** | Z246 c — bewusst nicht automatisiert |
| **Deploy-Fenster** | wann Neustarts erlaubt sind (laufende Partien werden getrennt, Abschnitt 5.7) |
| **Externe Überwachung** | Dienst und Empfänger (Abschnitt 10) |
| **Release-Tag setzen** | wer `v0.9.0` setzt und pusht (Abschnitt 3) |

## 16. Was nicht geprüft ist

- Kein Schritt dieses Plans ist auf einem echten Knoten gelaufen. Geprüft ist lokal:
  Paketbau (echt, rund 1 700 Dateien, davon 1 553 in `dist/`, rund 107 MB; reproduzierbar), `deploy.sh`/`rollback.sh`/`sichern.sh`/
  `wiederherstellen.sh` gegen Stellvertreter für `systemctl` und `npm` in einem Temp-Verzeichnis
  (`tests/release-skripte.test.js`), `smoke.mjs` gegen einen echten Server im Prozess
  (`tests/release-paket.test.js`), systemd-Vorlagen statisch, mit
  `systemd-analyze verify` (Pfade auf den Repo-Ort umgeschrieben) und
  `systemd-analyze security --offline` (Exposure 1.5, Test hält ≤ 2.0) — nicht
  gegen den echten Anschluss, Dockerfile/Compose nur
  gelesen (`tests/container-dateien.test.js`; die COPY-Liste der Bau-Stufe wurde einmal ohne
  Docker nachgestellt: gleiche 1 553 Dateien in `dist/`), Caddyfile und Firewall-Vorlage
  statisch (`tests/betrieb-absicherung.test.js`; **kein** `caddy validate`, kein geladenes
  nftables-Regelwerk).
- Nicht geprüft: Caddy, ufw, Let's Encrypt, `npm ci` auf dem Knoten, systemd-Anschluss
  (Benutzer, Rechte, `ProtectSystem=strict` mit npm-Cache), Docker-Build.
